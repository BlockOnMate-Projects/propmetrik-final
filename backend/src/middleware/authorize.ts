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
 * Get the user's database role from the request.
 * In dev mode without Keycloak, reads from x-user-role header or defaults to super_admin.
 * In production, queries the users table.
 */
async function getUserDbRole(req: Request): Promise<string> {
  // If we have an authenticated user with realm roles
  if (req.user) {
    // Dev mode mock user always has super_admin
    if (process.env.NODE_ENV === 'development' && !req.headers.authorization) {
      // Allow override via header for testing
      return (req.headers['x-user-role'] as string) || 'super_admin';
    }

    // In production, query the DB for the user's org-level role
    try {
      const { pool } = await import('../database');
      const userId = req.user.id || req.user.sub;
      const result = await pool.query(
        'SELECT role FROM users WHERE id = $1',
        [userId]
      );
      if (result.rows.length > 0) {
        return result.rows[0].role;
      }
    } catch {
      // If DB query fails, fall back to Keycloak roles
    }

    // Fallback: check Keycloak realm roles for matching DB roles
    const allRoles = [...(req.user.realmRoles || []), ...(req.user.clientRoles || [])];
    if (allRoles.includes('super_admin')) return 'super_admin';
    if (allRoles.includes('admin')) return 'admin';
    return allRoles[0] || 'viewer';
  }

  return 'viewer';
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

      const userRole = await getUserDbRole(req);

      // Super admin bypass
      if (superAdminBypass && userRole === 'super_admin') {
        return next();
      }

      // Check additional roles shortcut
      if (additionalRoles.includes(userRole)) {
        return next();
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
      const hasAccess = applicable.some(policy => 
        policy.allowed_roles.includes(userRole)
      );

      if (!hasAccess) {
        logger.warn('Authorization denied', {
          userId: req.user.id,
          role: userRole,
          resource: resourceType,
          action,
          policies: applicable.map(p => p.policy_name),
        });
        return next(new ForbiddenError(
          `Insufficient permissions: ${action} on ${resourceType} requires one of ${
            [...new Set(applicable.flatMap(p => p.allowed_roles))].join(', ')
          }`
        ));
      }

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
