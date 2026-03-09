/**
 * RBAC Configuration Endpoint
 *
 * Serves the user's role-based access config so the frontend can
 * stay in sync with backend authorization_policies.
 *
 * GET /api/v1/rbac/config → returns policies, services, tier, and tab access
 */

import { Router, Request, Response } from 'express';
import logger from '../utils/logger';

const router = Router();

// ── Cached policy data (shared across all requests, refreshed every 5 min) ──
let cachedConfig: RbacConfigPayload | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface RbacConfigPayload {
  platformTabs: Record<string, string[]>;
  valuationTabs: Record<string, string[]>;
  featureGates: Record<string, { minTier: string; label: string; description: string }>;
  policies: Array<{
    resourceType: string;
    action: string;
    allowedRoles: string[];
  }>;
  services: Array<{ key: string; name: string; category: string }>;
}

/**
 * Build the static RBAC config payload from the database.
 * This is role-agnostic — the frontend filters by the user's own role.
 */
async function buildConfig(): Promise<RbacConfigPayload> {
  const now = Date.now();
  if (cachedConfig && now - cacheTime < CACHE_TTL) {
    return cachedConfig;
  }

  const { pool } = await import('../database');

  // 1. Load authorization policies
  const policiesResult = await pool.query(
    `SELECT resource_type, action, allowed_roles
     FROM authorization_policies
     WHERE is_active = true
     ORDER BY resource_type, action`
  );

  const policies = policiesResult.rows.map((row: any) => {
    let roles = row.allowed_roles;
    // pg may return custom enum arrays as a string — normalise to JS array
    if (typeof roles === 'string') {
      roles = roles.replace(/^\{|\}$/g, '').split(',').filter(Boolean);
    }
    if (!Array.isArray(roles)) roles = [];
    return {
      resourceType: row.resource_type,
      action: row.action,
      allowedRoles: roles as string[],
    };
  });

  // 2. Load platform services
  const servicesResult = await pool.query(
    `SELECT service_key, name, category
     FROM platform_services
     WHERE is_active = true
     ORDER BY category, name`
  );

  const services = servicesResult.rows.map((row: any) => ({
    key: row.service_key,
    name: row.name,
    category: row.category,
  }));

  // 3. Build platform tab access from policies
  //    Map service/resource types → top-level nav tab keys
  const TAB_RESOURCE_MAP: Record<string, string[]> = {
    overview: ['*'],                    // everyone sees overview
    valuations: ['valuation', 'report', 'valuation_org', 'valuation_invoice', 'valuation_client'],
    deals: ['crm_contact', 'crm_deal', 'crm_pipeline', 'crm_activity', 'crm_lead'],
    projects: ['project', 'milestone', 'governance', 'workflow', 'workspace'],
    analytics: ['analytics', 'market_intelligence', 'portfolio'],
    'property-management': ['pm_property', 'pm_tenancy', 'pm_payment', 'pm_work_order', 'pm_document'],
    'e-sign': ['esign'],
    admin: ['admin'],
  };

  const platformTabs: Record<string, string[]> = {};
  for (const [tab, resources] of Object.entries(TAB_RESOURCE_MAP)) {
    if (resources[0] === '*') {
      // overview: all roles
      const allRoles = new Set<string>();
      policies.forEach((p: any) => p.allowedRoles.forEach((r: string) => allRoles.add(r)));
      platformTabs[tab] = [...allRoles].sort();
    } else {
      const roles = new Set<string>();
      policies
        .filter((p: any) => resources.includes(p.resourceType) && (p.action === 'list' || p.action === 'read'))
        .forEach((p: any) => p.allowedRoles.forEach((r: string) => roles.add(r)));
      platformTabs[tab] = [...roles].sort();
    }
  }

  // 4. Build valuation sub-tab access from policies
  const VAL_TAB_RESOURCE_MAP: Record<string, { resource: string; action: string }> = {
    valuations: { resource: 'valuation', action: 'list' },
    team: { resource: 'valuation_org', action: 'read_members' },
    finance: { resource: 'valuation_invoice', action: 'list' },
    clients: { resource: 'valuation_client', action: 'list' },
    calendar: { resource: 'valuation', action: 'manage_inspection' },
    analytics: { resource: 'analytics', action: 'read_dashboard' },
    settings: { resource: 'valuation_org', action: 'manage_members' },
  };

  const valuationTabs: Record<string, string[]> = {};
  for (const [tab, { resource, action }] of Object.entries(VAL_TAB_RESOURCE_MAP)) {
    const policy = policies.find((p: any) => p.resourceType === resource && p.action === action);
    valuationTabs[tab] = policy ? [...policy.allowedRoles] : [];
  }

  // 5. Feature gates (tier-based, static — these rarely change)
  const featureGates: Record<string, { minTier: string; label: string; description: string }> = {
    overview:            { minTier: 'starter',      label: 'Dashboard Overview',     description: 'Real-time overview of your organization\'s metrics' },
    valuations:          { minTier: 'starter',      label: 'Valuations',             description: 'Property valuation management and reporting' },
    deals:               { minTier: 'professional', label: 'Deal Pipeline',          description: 'Full CRM deal pipeline tracking and management' },
    projects:            { minTier: 'professional', label: 'Project Management',     description: 'Construction and development project tracking' },
    analytics:           { minTier: 'professional', label: 'Market Analytics',       description: 'Advanced market intelligence and trend analysis' },
    'property-management': { minTier: 'professional', label: 'Property Management', description: 'Tenant, lease, and facility management' },
    'e-sign':            { minTier: 'professional', label: 'E-Sign',                description: 'Digital document signing and verification' },
    admin:               { minTier: 'starter',      label: 'Admin Panel',            description: 'Platform administration and settings' },
    'analytics-forecasting':   { minTier: 'enterprise',    label: 'AI Forecasting',         description: 'ML-powered property price predictions' },
    'analytics-risk':          { minTier: 'professional',  label: 'Risk Assessment',        description: 'Property and portfolio risk analysis' },
    'analytics-geographic':    { minTier: 'professional',  label: 'Geographic Intelligence', description: 'Spatial market analysis with heatmaps' },
    'api-access':              { minTier: 'enterprise',    label: 'API Access',              description: 'Programmatic access to PROPMETRIK data and services' },
    'bulk-valuations':         { minTier: 'professional',  label: 'Bulk Valuations',         description: 'Batch property valuation processing' },
    'custom-reports':          { minTier: 'enterprise',    label: 'Custom Reports',          description: 'White-label custom valuation report templates' },
    'data-hub':                { minTier: 'professional',  label: 'Data Hub',                description: 'Connect external data sources and feeds' },
    'portfolio-analysis':      { minTier: 'enterprise',    label: 'Portfolio Analysis',      description: 'Multi-property portfolio performance tracking' },
    'blockchain-verification': { minTier: 'enterprise',    label: 'Blockchain Verification', description: 'On-chain property record verification' },
  };

  cachedConfig = { platformTabs, valuationTabs, featureGates, policies, services };
  cacheTime = now;
  return cachedConfig;
}

/**
 * GET /api/v1/rbac/config
 *
 * Returns the RBAC configuration for the authenticated user:
 * - role, tier, userType, organizationId from their session
 * - platformTabs: which roles can see each top-level tab
 * - valuationTabs: which roles can see each valuation sub-tab
 * - featureGates: tier requirements per feature
 * - policies: all active authorization policies (resource:action → allowedRoles)
 * - services: list of platform services with categories
 * - subscribedServices: services the user has active subscriptions to
 */
router.get('/config', async (req: Request, res: Response) => {
  try {
    const config = await buildConfig();

    // Build user-specific data
    const user = (req as any).user;
    const role = user?.role || user?.realmRoles?.[0] || 'viewer';
    const tier = user?.tier || 'starter';
    const userType = user?.userType || 'staff';

    // Fetch user's subscribed services
    let subscribedServices: string[] = [];
    if (user?.id) {
      try {
        const { pool } = await import('../database');
        const subResult = await pool.query(
          `SELECT ps.service_key
           FROM user_service_subscriptions uss
           JOIN platform_services ps ON ps.id = uss.service_id
           WHERE uss.user_id = $1 AND uss.status = 'active'`,
          [user.id]
        );
        subscribedServices = subResult.rows.map((r: any) => r.service_key);
      } catch {
        // Non-fatal — return empty list
      }
    }

    res.json({
      success: true,
      data: {
        user: { role, tier, userType, organizationId: user?.organizationId },
        ...config,
        subscribedServices,
      },
    });
  } catch (error: any) {
    logger.error('Failed to load RBAC config', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to load RBAC configuration' });
  }
});

/**
 * POST /api/v1/rbac/config/invalidate
 * Admin-only: force-clear the RBAC config cache.
 */
router.post('/config/invalidate', async (req: Request, res: Response) => {
  const user = (req as any).user;
  const role = user?.role || user?.realmRoles?.[0];
  if (role !== 'super_admin' && role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  cachedConfig = null;
  cacheTime = 0;

  // Also invalidate authorize.ts policy cache
  try {
    const { invalidatePolicyCache } = await import('../middleware/authorize');
    invalidatePolicyCache();
  } catch {
    // ignore
  }

  res.json({ success: true, message: 'RBAC cache invalidated' });
});

// ══════════════════════════════════════════════════════════════════════════════
// RBAC Admin — Policy Management (super_admin / admin only)
// ══════════════════════════════════════════════════════════════════════════════

/** Guard: require super_admin or admin role */
function requirePolicyAdmin(req: Request, res: Response, next: Function) {
  const user = (req as any).user;
  const role = user?.role || user?.realmRoles?.[0];
  if (role !== 'super_admin' && role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
}

/**
 * GET /api/v1/rbac/policies
 * List all authorization policies with optional filters
 */
router.get('/policies', requirePolicyAdmin, async (req: Request, res: Response) => {
  try {
    const { pool } = await import('../database');
    const { resource_type, action, is_active, search, page = '1', limit = '50' } = req.query as Record<string, string>;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (resource_type) { conditions.push(`resource_type = $${paramIdx++}`); params.push(resource_type); }
    if (action) { conditions.push(`action = $${paramIdx++}`); params.push(action); }
    if (is_active !== undefined) { conditions.push(`is_active = $${paramIdx++}`); params.push(is_active === 'true'); }
    if (search) { conditions.push(`(policy_name ILIKE $${paramIdx} OR resource_type ILIKE $${paramIdx} OR action ILIKE $${paramIdx})`); params.push(`%${search}%`); paramIdx++; }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, policy_name, resource_type, action, allowed_roles, require_ownership, require_assignment, require_same_org, is_active, created_at, updated_at
         FROM authorization_policies ${where}
         ORDER BY resource_type, action
         LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
        [...params, parseInt(limit), offset]
      ),
      pool.query(`SELECT COUNT(*) FROM authorization_policies ${where}`, params),
    ]);

    // Normalize enum arrays (same fix as buildConfig)
    const policies = dataResult.rows.map((row: any) => {
      let roles = row.allowed_roles;
      if (typeof roles === 'string') {
        roles = roles.replace(/^\{|\}$/g, '').split(',').filter(Boolean);
      }
      return { ...row, allowed_roles: Array.isArray(roles) ? roles : [] };
    });

    res.json({
      success: true,
      data: policies,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
      },
    });
  } catch (error: any) {
    logger.error('Failed to list policies', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to list policies' });
  }
});

/**
 * GET /api/v1/rbac/policies/:id
 * Get a single policy by ID
 */
router.get('/policies/:id', requirePolicyAdmin, async (req: Request, res: Response) => {
  try {
    const { pool } = await import('../database');
    const result = await pool.query(
      `SELECT id, policy_name, resource_type, action, allowed_roles, require_ownership, require_assignment, require_same_org, is_active, created_at, updated_at
       FROM authorization_policies WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }
    const row = result.rows[0];
    let roles = row.allowed_roles;
    if (typeof roles === 'string') {
      roles = roles.replace(/^\{|\}$/g, '').split(',').filter(Boolean);
    }
    res.json({ success: true, data: { ...row, allowed_roles: Array.isArray(roles) ? roles : [] } });
  } catch (error: any) {
    logger.error('Failed to get policy', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to get policy' });
  }
});

/**
 * POST /api/v1/rbac/policies
 * Create a new authorization policy
 */
router.post('/policies', requirePolicyAdmin, async (req: Request, res: Response) => {
  try {
    const { pool } = await import('../database');
    const { policy_name, resource_type, action, allowed_roles, require_ownership, require_assignment, require_same_org } = req.body;

    if (!policy_name || !resource_type || !action || !Array.isArray(allowed_roles) || allowed_roles.length === 0) {
      return res.status(400).json({ success: false, error: 'policy_name, resource_type, action, and allowed_roles (non-empty array) are required' });
    }

    const result = await pool.query(
      `INSERT INTO authorization_policies (policy_name, resource_type, action, allowed_roles, require_ownership, require_assignment, require_same_org)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, policy_name, resource_type, action, allowed_roles, require_ownership, require_assignment, require_same_org, is_active, created_at`,
      [policy_name, resource_type, action, allowed_roles, !!require_ownership, !!require_assignment, !!require_same_org]
    );

    // Invalidate caches
    cachedConfig = null; cacheTime = 0;
    try { const { invalidatePolicyCache } = await import('../middleware/authorize'); invalidatePolicyCache(); } catch {}

    logger.info('Policy created', { policyName: policy_name, user: (req as any).user?.email });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error?.code === '23505') {
      return res.status(409).json({ success: false, error: 'A policy with this name already exists' });
    }
    logger.error('Failed to create policy', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to create policy' });
  }
});

/**
 * PUT /api/v1/rbac/policies/:id
 * Update an existing authorization policy
 */
router.put('/policies/:id', requirePolicyAdmin, async (req: Request, res: Response) => {
  try {
    const { pool } = await import('../database');
    const { allowed_roles, require_ownership, require_assignment, require_same_org, is_active } = req.body;

    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (Array.isArray(allowed_roles)) { sets.push(`allowed_roles = $${idx++}`); params.push(allowed_roles); }
    if (require_ownership !== undefined) { sets.push(`require_ownership = $${idx++}`); params.push(!!require_ownership); }
    if (require_assignment !== undefined) { sets.push(`require_assignment = $${idx++}`); params.push(!!require_assignment); }
    if (require_same_org !== undefined) { sets.push(`require_same_org = $${idx++}`); params.push(!!require_same_org); }
    if (is_active !== undefined) { sets.push(`is_active = $${idx++}`); params.push(!!is_active); }

    if (sets.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    sets.push(`updated_at = NOW()`);
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE authorization_policies SET ${sets.join(', ')} WHERE id = $${idx}
       RETURNING id, policy_name, resource_type, action, allowed_roles, require_ownership, require_assignment, require_same_org, is_active, updated_at`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }

    // Invalidate caches
    cachedConfig = null; cacheTime = 0;
    try { const { invalidatePolicyCache } = await import('../middleware/authorize'); invalidatePolicyCache(); } catch {}

    logger.info('Policy updated', { policyId: req.params.id, user: (req as any).user?.email });
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    logger.error('Failed to update policy', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update policy' });
  }
});

/**
 * DELETE /api/v1/rbac/policies/:id
 * Soft-delete (deactivate) a policy
 */
router.delete('/policies/:id', requirePolicyAdmin, async (req: Request, res: Response) => {
  try {
    const { pool } = await import('../database');

    // Only super_admin can hard-delete; admin can soft-deactivate
    const role = (req as any).user?.role || (req as any).user?.realmRoles?.[0];
    if (req.query.hard === 'true' && role === 'super_admin') {
      await pool.query('DELETE FROM authorization_policies WHERE id = $1', [req.params.id]);
      logger.info('Policy hard-deleted', { policyId: req.params.id, user: (req as any).user?.email });
    } else {
      const result = await pool.query(
        `UPDATE authorization_policies SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id`,
        [req.params.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Policy not found' });
      }
      logger.info('Policy deactivated', { policyId: req.params.id, user: (req as any).user?.email });
    }

    // Invalidate caches
    cachedConfig = null; cacheTime = 0;
    try { const { invalidatePolicyCache } = await import('../middleware/authorize'); invalidatePolicyCache(); } catch {}

    res.json({ success: true, message: 'Policy removed' });
  } catch (error: any) {
    logger.error('Failed to delete policy', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete policy' });
  }
});

/**
 * GET /api/v1/rbac/audit
 * View authorization audit log entries
 */
router.get('/audit', requirePolicyAdmin, async (req: Request, res: Response) => {
  try {
    const { pool } = await import('../database');
    const { decision, resource_type, user_id, page = '1', limit = '50' } = req.query as Record<string, string>;

    const conditions: string[] = ["action LIKE 'auth:%'"];
    const params: any[] = [];
    let paramIdx = 1;

    if (decision) { conditions.push(`action LIKE $${paramIdx++}`); params.push(`auth:${decision}:%`); }
    if (resource_type) { conditions.push(`entity_type = $${paramIdx++}`); params.push(resource_type); }
    if (user_id) { conditions.push(`user_id = $${paramIdx++}`); params.push(user_id); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const result = await pool.query(
      `SELECT id, action, entity_type, entity_id, user_id, user_email, organization_id, ip_address, metadata, created_at
       FROM audit_logs ${where}
       ORDER BY created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      [...params, parseInt(limit), offset]
    );

    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    logger.error('Failed to query audit log', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to query audit log' });
  }
});

export default router;
