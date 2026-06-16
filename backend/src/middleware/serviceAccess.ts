/**
 * PROPMETRIK — Service Access Guard Middleware
 *
 * Gates per-service access for customers. Staff are always allowed.
 * Customers must have an active row in `user_service_subscriptions`
 * for the requested service key.
 *
 * Usage (per-route, inside each router):
 *   router.get('/', requireServiceAccess('valuations'), handler);
 *   router.post('/', requireServiceAccess('crm'), handler);
 *
 * Or at the router level:
 *   router.use(requireServiceAccess('projects'));
 */

import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

// In-memory cache: userId → Set<service_key> (active subscriptions)
// Cleared every 60 seconds to pick up subscription changes.
const subscriptionCache = new Map<string, { keys: Set<string>; tier: Map<string, string>; roles: Map<string, string>; ts: number }>();
const CACHE_TTL = 60_000; // 1 minute

/**
 * Resolve active service subscriptions for a user.
 * Returns a set of service_keys and a map of service_key → tier.
 */
async function getUserSubscriptions(userId: string): Promise<{ keys: Set<string>; tier: Map<string, string>; roles: Map<string, string> }> {
  const now = Date.now();
  const cached = subscriptionCache.get(userId);
  if (cached && (now - cached.ts) < CACHE_TTL) {
    return cached;
  }

  const keys = new Set<string>();
  const tier = new Map<string, string>();
  const roles = new Map<string, string>();

  try {
    const { pool } = await import('../database');
    const result = await pool.query(
      `SELECT ps.service_key, uss.tier, COALESCE(uss.service_role, 'service_admin') as service_role
       FROM user_service_subscriptions uss
       JOIN platform_services ps ON ps.id = uss.service_id
       WHERE uss.user_id = $1
         AND uss.status = 'active'
         AND (uss.expires_at IS NULL OR uss.expires_at > NOW())`,
      [userId],
    );
    for (const row of result.rows) {
      keys.add(row.service_key);
      tier.set(row.service_key, row.tier);
      roles.set(row.service_key, row.service_role || 'service_admin');
    }
  } catch (err: any) {
    logger.error('Failed to load user service subscriptions', {
      userId,
      error: err.message,
    });
    // Fail open in dev to avoid blocking development
    if (process.env.NODE_ENV === 'development') {
      return { keys: new Set<string>(), tier: new Map<string, string>(), roles: new Map<string, string>() };
    }
  }

  const entry = { keys, tier, roles, ts: now };
  subscriptionCache.set(userId, entry);
  return entry;
}

/**
 * Resolve user_type from the database (or from req.user if already populated).
 */
async function resolveUserType(req: Request): Promise<string> {
  // If authenticate middleware already populated userType, use it
  if ((req.user as any)?.userType) {
    return (req.user as any).userType;
  }

  try {
    const { pool } = await import('../database');
    const userId = req.user?.id || req.user?.sub;
    if (!userId) return 'staff';
    const result = await pool.query(
      'SELECT user_type FROM users WHERE id = $1',
      [userId],
    );
    if (result.rows.length > 0 && result.rows[0].user_type) {
      return result.rows[0].user_type;
    }
  } catch {
    // Default to staff
  }
  return 'staff';
}

/**
 * Middleware factory: require the user to have access to a platform service.
 *
 * - `super_admin` always passes
 * - `staff` user_type always passes (staff can access all services)
 * - `customer` user_type must have an active subscription for `serviceKey`
 *
 * If the customer has a subscription, `req.currentServiceTier` is set
 * so downstream `requireTier()` can check feature-level gating.
 */
export function requireServiceAccess(serviceKey: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // super_admin bypasses everything
    const realmRoles = [...(req.user.realmRoles || []), ...(req.user.clientRoles || [])];
    if (realmRoles.includes('super_admin')) {
      return next();
    }

    // ── Per-role, per-service access map ──────────────────────────────
    // Internal org roles bypass subscription checks ONLY for services
    // their role is authorized to use. Must mirror frontend RBAC config.
    const ROLE_SERVICE_ACCESS: Record<string, string[]> = {
      // admin / firm_principal: full platform access
      admin:              ['valuations', 'crm', 'projects', 'analytics', 'property_management', 'data_hub', 'construction', 'budget'],
      firm_principal:     ['valuations', 'crm', 'projects', 'analytics', 'property_management', 'data_hub', 'construction', 'budget'],
      // manager: broad access across services
      manager:            ['valuations', 'crm', 'projects', 'analytics', 'property_management', 'data_hub', 'construction', 'budget'],
      // project_manager: projects + related services only
      project_manager:    ['projects', 'analytics', 'property_management', 'construction', 'budget'],
      // finance_manager: valuations (finance tab) only
      finance_manager:    ['valuations'],
      // agent: CRM deal management only
      agent:              ['crm'],
      // senior_valuer / valuer: valuations only
      senior_valuer:      ['valuations'],
      valuer:             ['valuations'],
      // compliance_officer: valuations only
      compliance_officer: ['valuations'],
      // probationer / inspector: valuations (limited)
      probationer:        ['valuations'],
      inspector:          ['valuations'],
      // analyst: valuations + analytics
      analyst:            ['valuations', 'analytics'],
    };

    for (const role of realmRoles) {
      const allowedServices = ROLE_SERVICE_ACCESS[role];
      if (allowedServices && allowedServices.includes(serviceKey)) {
        return next();
      }
    }

    const userType = await resolveUserType(req);

    // Staff always have access to all services
    if (userType === 'staff') {
      return next();
    }

    // Shared services (e-sign, messaging, notifications) don't require subscription
    try {
      const { pool } = await import('../database');
      const svcResult = await pool.query(
        'SELECT category FROM platform_services WHERE service_key = $1',
        [serviceKey],
      );
      if (svcResult.rows.length > 0 && svcResult.rows[0].category === 'shared') {
        return next();
      }
    } catch {
      // Non-fatal — fall through to subscription check
    }

    // Customer: check subscription
    const userId = req.user.id || req.user.sub;
    const { keys, tier, roles } = await getUserSubscriptions(userId);

    if (keys.has(serviceKey)) {
      // Attach service tier to request for downstream requireTier()
      (req as any).currentServiceTier = tier.get(serviceKey) || 'starter';
      (req as any).customerServiceRole = roles.get(serviceKey) || 'service_admin';
      return next();
    }

    logger.info('Service access denied — no active subscription', {
      userId,
      userType,
      serviceKey,
      path: req.originalUrl,
    });

    res.status(403).json({
      error: 'Service access denied',
      message: `Your account does not have an active subscription to this service`,
      serviceKey,
    });
  };
}

/**
 * Clear the subscription cache for a specific user (e.g., after granting a subscription).
 */
export function clearServiceAccessCache(userId: string): void {
  subscriptionCache.delete(userId);
}

// Org-level entitlement cache: orgId|serviceKey → { has, ts }
const orgServiceCache = new Map<string, { has: boolean; ts: number }>();

/**
 * Does an ORGANIZATION have access to a platform service?
 *
 * Used by the PM↔CRM bridge to decide whether a PM for-sale listing should be
 * mirrored into the org's CRM/Deals pipeline. An org "has" a service when:
 *   - it is the platform org (PropMetrik staff org — has everything), OR
 *   - the service is a 'shared' (base/free) service, OR
 *   - any member of the org holds an active subscription for that service_key,
 *     OR an active subscription row is scoped directly to the organization.
 *
 * Fail-closed: on error returns false (no accidental CRM mirroring). Cached 60s.
 */
export async function orgHasService(organizationId: string | null | undefined, serviceKey: string): Promise<boolean> {
  if (!organizationId) return false;

  const cacheKey = `${organizationId}|${serviceKey}`;
  const now = Date.now();
  const cached = orgServiceCache.get(cacheKey);
  if (cached && (now - cached.ts) < CACHE_TTL) {
    return cached.has;
  }

  let has = false;
  try {
    const { pool } = await import('../database');

    // Platform org has all services.
    const orgRes = await pool.query(
      'SELECT is_platform_org FROM organizations WHERE id = $1',
      [organizationId],
    );
    if (orgRes.rows.length > 0 && orgRes.rows[0].is_platform_org === true) {
      has = true;
    }

    // Shared (base/free) services are always available.
    if (!has) {
      const svcRes = await pool.query(
        'SELECT id, category FROM platform_services WHERE service_key = $1',
        [serviceKey],
      );
      if (svcRes.rows.length > 0) {
        if (svcRes.rows[0].category === 'shared') {
          has = true;
        } else {
          const serviceId = svcRes.rows[0].id;
          // Active subscription scoped to the org OR held by any org member.
          const subRes = await pool.query(
            `SELECT 1
               FROM user_service_subscriptions uss
              WHERE uss.service_id = $1
                AND uss.status = 'active'
                AND (uss.expires_at IS NULL OR uss.expires_at > NOW())
                AND (
                  uss.organization_id = $2
                  OR uss.user_id IN (SELECT id FROM users WHERE organization_id = $2)
                )
              LIMIT 1`,
            [serviceId, organizationId],
          );
          has = subRes.rows.length > 0;
        }
      }
    }
  } catch (err: any) {
    logger.error('orgHasService check failed', { organizationId, serviceKey, error: err.message });
    return false; // fail-closed
  }

  orgServiceCache.set(cacheKey, { has, ts: now });
  return has;
}

/**
 * Clear the org-service entitlement cache (e.g., after granting/revoking a subscription).
 */
export function clearOrgServiceCache(organizationId?: string): void {
  if (!organizationId) {
    orgServiceCache.clear();
    return;
  }
  for (const key of orgServiceCache.keys()) {
    if (key.startsWith(`${organizationId}|`)) orgServiceCache.delete(key);
  }
}
