/**
 * PROPMETRIK — User Type Guard Middleware
 *
 * Checks the user's `user_type` (staff | customer) from the database.
 * Used to restrict admin/internal routes to staff-only access.
 *
 * Usage:
 *   router.get('/admin/users', authenticate, requireStaffOnly(), handler);
 *   router.get('/portal', authenticate, requireUserType('customer'), handler);
 */

import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * Cache user types to avoid repeated DB lookups within same request lifecycle.
 * Uses a WeakMap keyed on the request object itself so entries are GC'd automatically.
 */
const requestUserTypeCache = new WeakMap<Request, string>();

/**
 * Resolve the user_type for the current request user.
 * Checks DB for the `user_type` column added in migration 209.
 */
async function resolveUserType(req: Request): Promise<string> {
  if (requestUserTypeCache.has(req)) {
    return requestUserTypeCache.get(req)!;
  }

  let userType = 'staff'; // default

  if (req.user) {
    try {
      const { pool } = await import('../database');
      const userId = req.user.id || req.user.sub;
      const result = await pool.query(
        'SELECT user_type FROM users WHERE id = $1',
        [userId]
      );
      if (result.rows.length > 0 && result.rows[0].user_type) {
        userType = result.rows[0].user_type;
      }
    } catch {
      // If column doesn't exist yet or query fails, default to staff
    }
  }

  requestUserTypeCache.set(req, userType);
  return userType;
}

/**
 * Middleware factory that restricts access to specific user types.
 *
 * @param allowedTypes - One or more user types that are permitted
 */
export function requireUserType(...allowedTypes: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // super_admin always passes
    const userRoles = [...(req.user.realmRoles || []), ...(req.user.clientRoles || [])];
    if (userRoles.includes('super_admin')) {
      return next();
    }

    const userType = await resolveUserType(req);

    if (allowedTypes.includes(userType)) {
      return next();
    }

    logger.warn('User type guard blocked request', {
      userId: req.user.id,
      userType,
      requiredTypes: allowedTypes,
      path: req.originalUrl,
    });

    res.status(403).json({
      error: 'Access denied',
      message: `This resource requires user type: ${allowedTypes.join(' or ')}`,
    });
  };
}

/**
 * Convenience: restrict to staff users only.
 * Customers can never access admin, integrations, autopilot, etc.
 */
export function requireStaffOnly() {
  return requireUserType('staff');
}
