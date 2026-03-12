/**
 * PROPMETRIK — Policy-Based Authorization Middleware
 * 
 * Checks the `authorization_policies` table in the database to determine
 * whether a user has permission to perform an action on a resource type.
 * 
 * Usage in routes:
 *   import { authorize } from '../middleware/authorize';
 *   router.get('/invoices', authenticate, authorize('finance', 'read'), handler);
 *   router.post('/invitations', authenticate, authorize('team', 'manage'), handler);
 */

import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from './errorHandler';
import logger from '../utils/logger';

// Cache policies in memory (TTL-based)
let policyCache: Map<string, PolicyRecord[]> | null = null;
let policyCacheTime = 0;
const POLICY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cache for customer service subscriptions: userId → Set<service_key>
const customerSubCache = new Map<string, { keys: Set<string>; roles: Map<string, string>; ts: number }>();
const CUSTOMER_SUB_CACHE_TTL = 60_000; // 1 minute

/**
 * Maps resource_type used in authorization_policies to the platform service_key.
 * Customers with an active subscription to the service bypass role checks.
 */
const RESOURCE_TO_SERVICE: Record<string, string> = {
  // Valuations service
  valuation: 'valuations',
  report: 'valuations',
  valuation_org: 'valuations',
  valuation_invoice: 'valuations',
  valuation_client: 'valuations',
  // CRM
  crm_contact: 'crm',
  crm_deal: 'crm',
  crm_pipeline: 'crm',
  crm_activity: 'crm',
  crm_lead: 'crm',
  // Property Management
  property_management: 'property_management',
  tenancy: 'property_management',
  maintenance: 'property_management',
  utility: 'property_management',
  // Project Management
  project: 'projects',
  milestone: 'projects',
  rfi: 'projects',
  submittal: 'projects',
  change_order: 'projects',
  // Construction
  construction: 'construction',
  site_diary: 'construction',
  safety: 'construction',
  equipment: 'construction',
  timesheet: 'construction',
  closeout: 'construction',
  // Analytics
  analytics: 'analytics',
  market_intelligence: 'market_intelligence',
  portfolio: 'portfolio',
  // Other
  data_hub: 'data_hub',
  short_stay: 'short_stay',
  litigation: 'litigation',
  procurement: 'procurement',
  budget: 'budget',
  governance: 'projects',
  workflow: 'projects',
  publication: 'valuations',
  workspace: 'projects',
  // Invitations — shared, no service gating
  invitations: '__shared__',
  // Shared services — no gating
  esign: '__shared__',
  notification: '__shared__',
  messaging: '__shared__',
};

interface PolicyRecord {
  policy_name: string;
  resource_type: string;
  action: string;
  allowed_roles: string[];
  require_ownership: boolean;
  require_assignment: boolean;
  require_same_org: boolean;
}

/**
 * Load authorization policies from the database (with cache)
 */
async function loadPolicies(): Promise<Map<string, PolicyRecord[]>> {
  const now = Date.now();
  if (policyCache && (now - policyCacheTime) < POLICY_CACHE_TTL) {
    return policyCache;
  }

  try {
    const { pool } = await import('../database');
    const result = await pool.query(
      `SELECT policy_name, resource_type, action, allowed_roles, 
              require_ownership, require_assignment, require_same_org
       FROM authorization_policies
       WHERE is_active = TRUE`
    );

    const cache = new Map<string, PolicyRecord[]>();
    for (const row of result.rows) {
      const key = `${row.resource_type}:${row.action}`;
      if (!cache.has(key)) cache.set(key, []);
      cache.get(key)!.push(row);
    }

    policyCache = cache;
    policyCacheTime = now;
    return cache;
  } catch (error) {
    logger.error('Failed to load authorization policies', { error });
    // Return empty cache — fail-open in dev, fail-closed in production
    if (process.env.NODE_ENV === 'development') {
      return new Map();
    }
    throw error;
  }
}

/**
 * Customer authorization policies cache.
 * Maps "service_key:resource_type:action" -> { allowed_roles, require_ownership }
 */
let customerPolicyCache: Map<string, { allowed_roles: string[]; require_ownership: boolean }> | null = null;
let customerPolicyCacheTime = 0;

async function loadCustomerPolicies(): Promise<Map<string, { allowed_roles: string[]; require_ownership: boolean }>> {
  const now = Date.now();
  if (customerPolicyCache && now - customerPolicyCacheTime < POLICY_CACHE_TTL) {
    return customerPolicyCache;
  }

  try {
    const { pool } = await import('../database');
    const result = await pool.query(
      'SELECT service_key, resource_type, action, allowed_roles, require_ownership FROM customer_authorization_policies WHERE is_active = true'
    );

    const map = new Map<string, { allowed_roles: string[]; require_ownership: boolean }>();
    for (const row of result.rows) {
      const key = `${row.service_key}:${row.resource_type}:${row.action}`;
      map.set(key, {
        allowed_roles: row.allowed_roles || [],
        require_ownership: row.require_ownership || false,
      });
    }

    customerPolicyCache = map;
    customerPolicyCacheTime = now;
    return map;
  } catch (err) {
    logger.error('Failed to load customer authorization policies', { error: err });
    return customerPolicyCache || new Map();
  }
}

export function clearCustomerPolicyCache(): void {
  customerPolicyCache = null;
  customerPolicyCacheTime = 0;
}

/**
 * Get the user's database role and organization from the request.
 * In dev mode without Keycloak, reads from x-user-role header or defaults to super_admin.
 * In production, queries the users table.
 */
async function getUserDbInfo(req: Request): Promise<{ role: string; organizationId: string | null; userType: string }> {
  if (req.user) {
    // Dev mode mock user always has super_admin
    if (process.env.NODE_ENV === 'development' && !req.headers.authorization) {
      return {
        role: (req.headers['x-user-role'] as string) || 'super_admin',
        organizationId: req.user.organizationId || null,
        userType: 'staff',
      };
    }

    // In production, query the DB for the user's org-level role + org + userType
    try {
      const { pool } = await import('../database');
      const userId = req.user.id || req.user.sub;
      const result = await pool.query(
        'SELECT role, organization_id, user_type FROM users WHERE id = $1',
        [userId]
      );
      if (result.rows.length > 0) {
        return {
          role: result.rows[0].role,
          organizationId: result.rows[0].organization_id || req.user.organizationId || null,
          userType: result.rows[0].user_type || 'staff',
        };
      }
    } catch {
      // If DB query fails, fall back to Keycloak roles
    }

    // Fallback: check Keycloak realm roles for matching DB roles
    const allRoles = [...(req.user.realmRoles || []), ...(req.user.clientRoles || [])];
    let role = 'viewer';
    if (allRoles.includes('super_admin')) role = 'super_admin';
    else if (allRoles.includes('admin')) role = 'admin';
    else if (allRoles.length > 0) role = allRoles[0];

    return {
      role,
      organizationId: req.user.organizationId || null,
      userType: 'staff',
    };
  }

  return { role: 'viewer', organizationId: null, userType: 'staff' };
}

/**
 * Check if a customer has an active subscription for a given service.
 * Uses an in-memory cache with a short TTL to avoid repeated DB hits.
 */
async function checkCustomerSubscription(userId: string, serviceKey: string): Promise<{ hasAccess: boolean; serviceRole: string }> {
  const now = Date.now();
  const cached = customerSubCache.get(userId);
  if (cached && now - cached.ts < CUSTOMER_SUB_CACHE_TTL) {
    return { hasAccess: cached.keys.has(serviceKey), serviceRole: cached.roles.get(serviceKey) || 'service_admin' };
  }

  try {
    const { pool } = await import('../database');
    const result = await pool.query(
      `SELECT ps.service_key, COALESCE(uss.service_role, 'service_admin') as service_role
       FROM user_service_subscriptions uss
       JOIN platform_services ps ON ps.id = uss.service_id
       WHERE uss.user_id = $1 AND uss.status = 'active'`,
      [userId]
    );
    const keys = new Set<string>(result.rows.map((r: any) => r.service_key));
    const roles = new Map<string, string>(result.rows.map((r: any) => [r.service_key, r.service_role || 'service_admin']));
    customerSubCache.set(userId, { keys, roles, ts: now });
    return { hasAccess: keys.has(serviceKey), serviceRole: roles.get(serviceKey) || 'service_admin' };
  } catch (err) {
    logger.error('Failed to check customer subscription', { userId, serviceKey, error: err });
    return { hasAccess: false, serviceRole: 'service_admin' }; // fail-closed
  }
}

/** Clear customer subscription cache (call when subscriptions change) */
export function clearCustomerSubCache(userId?: string): void {
  if (userId) {
    customerSubCache.delete(userId);
  } else {
    customerSubCache.clear();
  }
}

/** @deprecated Use getUserDbInfo instead */
async function getUserDbRole(req: Request): Promise<string> {
  return (await getUserDbInfo(req)).role;
}

// ── Resource-to-table mapping for ownership/assignment checks ────────────────

const RESOURCE_TABLE_MAP: Record<string, { table: string; ownerCol: string; assignedCol?: string }> = {
  valuation:          { table: 'valuations',       ownerCol: 'created_by',  assignedCol: 'assigned_to' },
  report:             { table: 'valuation_reports', ownerCol: 'created_by' },
  project:            { table: 'projects',          ownerCol: 'created_by',  assignedCol: 'assigned_to' },
  milestone:          { table: 'milestones',        ownerCol: 'created_by',  assignedCol: 'assigned_to' },
  crm_contact:        { table: 'contacts',          ownerCol: 'created_by',  assignedCol: 'assigned_to' },
  crm_deal:           { table: 'deals',             ownerCol: 'created_by',  assignedCol: 'assigned_to' },
  crm_activity:       { table: 'crm_activities',    ownerCol: 'created_by',  assignedCol: 'assigned_to' },
  valuation_invoice:  { table: 'invoices',          ownerCol: 'created_by' },
  pm_property:        { table: 'properties',        ownerCol: 'created_by' },
  pm_work_order:      { table: 'work_orders',       ownerCol: 'created_by',  assignedCol: 'assigned_to' },
  change_order:       { table: 'change_orders',     ownerCol: 'created_by' },
  bid_packages:       { table: 'bid_packages',      ownerCol: 'created_by' },
  governance:         { table: 'governance_frameworks', ownerCol: 'created_by' },
  workflow:           { table: 'workflows',         ownerCol: 'created_by' },
  workspace:          { table: 'workspaces',        ownerCol: 'created_by' },
  publication:        { table: 'publications',      ownerCol: 'created_by' },
};

/**
 * Check if a user is assigned to a specific resource instance.
 * Falls back to ownership check if no assigned column exists.
 */
async function checkAssignment(userId: string, resourceType: string, resourceId: string): Promise<boolean> {
  const mapping = RESOURCE_TABLE_MAP[resourceType];
  if (!mapping) return true; // Unknown resource — skip check

  try {
    const { pool } = await import('../database');
    const col = mapping.assignedCol || mapping.ownerCol;
    const result = await pool.query(
      `SELECT 1 FROM ${mapping.table} WHERE id = $1 AND (${col} = $2 OR ${mapping.ownerCol} = $2) LIMIT 1`,
      [resourceId, userId]
    );
    return result.rows.length > 0;
  } catch {
    return true; // Table may not exist yet — fail open for now
  }
}

/**
 * Check if a user is the owner (created_by) of a resource instance.
 */
async function checkOwnership(userId: string, resourceType: string, resourceId: string): Promise<boolean> {
  const mapping = RESOURCE_TABLE_MAP[resourceType];
  if (!mapping) return true; // Unknown resource — skip check

  try {
    const { pool } = await import('../database');
    const result = await pool.query(
      `SELECT 1 FROM ${mapping.table} WHERE id = $1 AND ${mapping.ownerCol} = $2 LIMIT 1`,
      [resourceId, userId]
    );
    return result.rows.length > 0;
  } catch {
    return true; // fail open
  }
}

// ── Audit Logging ────────────────────────────────────────────────────────────

/** Only audit write-equivalent actions (skip noisy reads/lists) */
const AUDIT_ACTIONS = new Set([
  'create', 'update', 'delete', 'manage', 'approve', 'reject',
  'sign', 'send', 'lock', 'publish', 'override', 'activate',
  'trigger', 'supersede', 'manage_members', 'manage_invitations',
]);

/**
 * Log an authorization decision to the `audit_logs` table.
 * Non-blocking — errors are swallowed to avoid impacting request processing.
 */
async function logAuthDecision(
  req: Request,
  resourceType: string,
  action: string,
  role: string,
  decision: 'allowed' | 'denied',
  reason?: string,
): Promise<void> {
  // Only audit writes and denials — skip read/list to keep log volume manageable
  if (decision === 'allowed' && !AUDIT_ACTIONS.has(action)) return;

  try {
    const { pool } = await import('../database');
    const userId = req.user?.id || req.user?.sub || null;
    const resourceId = req.params.id || req.params.valuationId || req.params.reportId || null;

    await pool.query(
      `INSERT INTO audit_logs (action, entity_type, entity_id, user_id, user_email, organization_id, request_id, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        `auth:${decision}:${action}`,
        resourceType,
        resourceId,
        userId,
        req.user?.email || null,
        (req as any).authorizedOrgId || req.user?.organizationId || null,
        (req as any).requestId || req.headers['x-request-id'] || null,
        req.ip,
        req.headers['user-agent'] || null,
        JSON.stringify({ role, decision, reason: reason || null, policy: `${resourceType}:${action}` }),
      ]
    );
  } catch {
    // Non-fatal — never block the request for audit logging
  }
}

/**
 * Middleware: Verify a specific resource instance belongs to the user's organization.
 *
 * Use this for routes that access a single resource by :id when you need
 * org isolation beyond the standard authorize() policy check.
 *
 * @param table - Database table name
 * @param orgColumn - Column name for organization_id (default: 'organization_id')
 * @param idParam - Route param name for the resource ID (default: 'id')
 *
 * @example
 *   router.get('/:id', authenticate, authorize('valuation', 'read'),
 *     requireResourcePermission('valuations'), handler);
 */
export function requireResourcePermission(
  table: string,
  orgColumn = 'organization_id',
  idParam = 'id',
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) return next(new UnauthorizedError('Authentication required'));

      // Super admins can access any org's resources
      const { role, organizationId } = await getUserDbInfo(req);
      if (role === 'super_admin') return next();

      if (!organizationId) {
        return next(new ForbiddenError('Organization membership required'));
      }

      const resourceId = req.params[idParam];
      if (!resourceId) return next(); // No ID to check (list endpoints)

      const { pool } = await import('../database');
      const result = await pool.query(
        `SELECT 1 FROM ${table} WHERE id = $1 AND ${orgColumn} = $2 LIMIT 1`,
        [resourceId, organizationId]
      );

      if (result.rows.length === 0) {
        await logAuthDecision(req, table, 'resource_access', role, 'denied', 'wrong_organization');
        return next(new ForbiddenError('Access denied: resource belongs to a different organization'));
      }

      next();
    } catch (error) {
      if (error instanceof ForbiddenError || error instanceof UnauthorizedError) return next(error);
      logger.error('requireResourcePermission error', { error, table });
      next(new ForbiddenError('Access check failed'));
    }
  };
}

/**
 * Authorization middleware factory.
 * 
 * @param resourceType - The resource type (valuation, finance, client, team, etc.)
 * @param action - The action (read, write, delete, manage, sign, approve)
 * @param options - Additional options
 * @returns Express middleware
 * 
 * @example
 *   router.get('/members', authenticate, authorize('team', 'read'), handler);
 *   router.post('/invitations', authenticate, authorize('team', 'manage'), handler);
 *   router.get('/invoices', authenticate, authorize('finance', 'read'), handler);
 */
export function authorize(
  resourceType: string,
  action: string,
  options?: {
    /** If true, super_admin always passes (default: true) */
    superAdminBypass?: boolean;
    /** Roles that always pass, in addition to policy */
    additionalRoles?: string[];
  }
) {
  const { superAdminBypass = true, additionalRoles = [] } = options || {};

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(new UnauthorizedError('Authentication required'));
      }

      const { role: userRole, organizationId: userOrgId } = await getUserDbInfo(req);

      // Super admin bypass
      if (superAdminBypass && userRole === 'super_admin') {
        return next();
      }

      // Check additional roles shortcut
      if (additionalRoles.includes(userRole)) {
        return next();
      }

      // Customer service-role-based authorization
      const userType = (req.user as any).userType || 'staff';
      if (userType === 'customer') {
        const serviceKey = RESOURCE_TO_SERVICE[resourceType];
        if (serviceKey === '__shared__') {
          return next();
        }
        if (serviceKey) {
          const { hasAccess, serviceRole } = await checkCustomerSubscription(req.user.id, serviceKey);
          if (!hasAccess) {
            return next(new ForbiddenError(
              `Service subscription required for ${resourceType}`
            ));
          }

          // Attach service role to request for downstream use
          (req as any).customerServiceRole = serviceRole;

          // service_admin bypasses customer policy checks
          if (serviceRole === 'service_admin') {
            if (userOrgId) {
              (req as any).authorizedOrgId = userOrgId;
            }
            await logAuthDecision(req, resourceType, action, `customer:${serviceRole}`, 'allowed', 'service_admin_bypass');
            return next();
          }

          // Check customer authorization policies
          const customerPolicies = await loadCustomerPolicies();
          const policyKey = `${serviceKey}:${resourceType}:${action}`;
          const policy = customerPolicies.get(policyKey);

          if (!policy) {
            // No explicit customer policy — deny non-admin roles
            logger.warn('No customer policy found, denying non-admin', {
              userId: req.user.id,
              serviceRole,
              resource: resourceType,
              action,
            });
            await logAuthDecision(req, resourceType, action, `customer:${serviceRole}`, 'denied', 'no_customer_policy');
            return next(new ForbiddenError('Insufficient role for this action'));
          }

          if (!policy.allowed_roles.includes(serviceRole)) {
            logger.warn('Customer role not in allowed_roles', {
              userId: req.user.id,
              serviceRole,
              resource: resourceType,
              action,
              allowedRoles: policy.allowed_roles,
            });
            await logAuthDecision(req, resourceType, action, `customer:${serviceRole}`, 'denied', 'role_not_allowed');
            return next(new ForbiddenError('Insufficient role for this action'));
          }

          // Enforce org scoping
          if (userOrgId) {
            (req as any).authorizedOrgId = userOrgId;
          }

          await logAuthDecision(req, resourceType, action, `customer:${serviceRole}`, 'allowed', 'customer_policy_match');
          return next();
        }
        return next(new ForbiddenError(
          `Service subscription required for ${resourceType}`
        ));
      }

      // Load policies and check
      const policies = await loadPolicies();
      const key = `${resourceType}:${action}`;
      const applicable = policies.get(key);

      if (!applicable || applicable.length === 0) {
        // No policies defined for this resource:action — allow in dev, deny in prod
        if (process.env.NODE_ENV === 'development') {
          logger.debug(`No authorization policy for ${key}, allowing in dev mode`, {
            userId: req.user.id,
            role: userRole,
          });
          return next();
        }
        return next(new ForbiddenError(`No authorization policy for ${resourceType}:${action}`));
      }

      // Check if user's role satisfies any applicable policy
      const matchedPolicy = applicable.find(policy => 
        policy.allowed_roles.includes(userRole)
      );

      if (!matchedPolicy) {
        logger.warn('Authorization denied', {
          userId: req.user.id,
          role: userRole,
          resource: resourceType,
          action,
          policies: applicable.map(p => p.policy_name),
        });
        await logAuthDecision(req, resourceType, action, userRole, 'denied', 'role_not_allowed');
        return next(new ForbiddenError(
          `Insufficient permissions: ${action} on ${resourceType} requires one of ${
            [...new Set(applicable.flatMap(p => p.allowed_roles))].join(', ')
          }`
        ));
      }

      // Enforce require_same_org: user must belong to an organization
      if (matchedPolicy.require_same_org && userOrgId) {
        // Attach orgId to request for downstream org-scoped queries
        (req as any).authorizedOrgId = userOrgId;
      } else if (matchedPolicy.require_same_org && !userOrgId) {
        // Policy requires org scoping but user has no org
        await logAuthDecision(req, resourceType, action, userRole, 'denied', 'no_organization');
        return next(new ForbiddenError('Organization membership required for this action'));
      }

      // Enforce require_assignment: user must be assigned to this resource
      if (matchedPolicy.require_assignment) {
        const resourceId = req.params.id || req.params.valuationId || req.params.reportId || req.params.projectId;
        if (resourceId) {
          const isAssigned = await checkAssignment(req.user.id, resourceType, resourceId);
          if (!isAssigned) {
            await logAuthDecision(req, resourceType, action, userRole, 'denied', 'not_assigned');
            return next(new ForbiddenError('You must be assigned to this resource to perform this action'));
          }
        }
        // If no resourceId in params, skip assignment check (list endpoints, etc.)
      }

      // Enforce require_ownership: user must own this resource
      if (matchedPolicy.require_ownership) {
        const resourceId = req.params.id || req.params.valuationId || req.params.reportId || req.params.projectId;
        if (resourceId) {
          const isOwner = await checkOwnership(req.user.id, resourceType, resourceId);
          if (!isOwner) {
            await logAuthDecision(req, resourceType, action, userRole, 'denied', 'not_owner');
            return next(new ForbiddenError('You must be the owner of this resource to perform this action'));
          }
        }
      }

      await logAuthDecision(req, resourceType, action, userRole, 'allowed');
      next();
    } catch (error) {
      if (error instanceof ForbiddenError || error instanceof UnauthorizedError) {
        return next(error);
      }
      logger.error('Authorization middleware error', { error });
      // Fail-open in dev, fail-closed in prod
      if (process.env.NODE_ENV === 'development') {
        return next();
      }
      next(new ForbiddenError('Authorization check failed'));
    }
  };
}

/**
 * Invalidate the policy cache (e.g., after updating policies)
 */
export function invalidatePolicyCache(): void {
  policyCache = null;
  policyCacheTime = 0;
}

export default authorize;
