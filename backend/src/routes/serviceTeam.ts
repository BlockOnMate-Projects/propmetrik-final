/**
 * Service Team Routes
 *
 * Manages team members within a customer organization's service subscription.
 * Allows service_admin users to update roles and remove members.
 *
 * Mount path: /api/v1/service-team and /api/service-team (with authenticate middleware)
 */

import { Router, Request, Response } from 'express';
import { pool } from '../database';
import { logger } from '../utils/logger';

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getUserId(req: Request): string {
  return (req as any).user?.id;
}

function getOrgId(req: Request): string {
  return (req as any).user?.organizationId || (req as any).user?.organization_id;
}

/** Normalise the frontend route slug to the DB service_key (e.g. 'deals' → 'crm'). */
function normKey(serviceKey: string): string {
  return serviceKey === 'deals' ? 'crm' : serviceKey;
}

/**
 * Platform/org admins manage teams across services without holding a personal service
 * subscription, so they bypass the per-user subscription gate (org scoping still applies).
 */
function isPrivileged(req: Request): boolean {
  const roles: string[] = (req as any).user?.realmRoles || [];
  const single: string | undefined = (req as any).user?.role;
  return roles.includes('super_admin') || roles.includes('admin') || single === 'super_admin' || single === 'admin';
}

async function requireServiceAdmin(req: Request, serviceKey: string): Promise<void> {
  if (isPrivileged(req)) return;

  const userId = getUserId(req);

  const result = await pool.query(
    `SELECT uss.service_role
     FROM user_service_subscriptions uss
     JOIN platform_services ps ON ps.id = uss.service_id
     WHERE ps.service_key = $1 AND uss.user_id = $2 AND uss.status = 'active'`,
    [normKey(serviceKey), userId],
  );

  if (!result.rows.length || result.rows[0].service_role !== 'service_admin') {
    const err: any = new Error('Service admin access required');
    err.statusCode = 403;
    throw err;
  }
}

/** Get caller's service_role (null if not subscribed). Admins always count as service_admin. */
async function getCallerRole(req: Request, serviceKey: string): Promise<string | null> {
  if (isPrivileged(req)) return 'service_admin';

  const userId = getUserId(req);

  const result = await pool.query(
    `SELECT COALESCE(uss.service_role, 'service_admin') AS service_role
     FROM user_service_subscriptions uss
     JOIN platform_services ps ON ps.id = uss.service_id
     WHERE ps.service_key = $1 AND uss.user_id = $2 AND uss.status = 'active'`,
    [normKey(serviceKey), userId],
  );

  return result.rows[0]?.service_role ?? null;
}

// ---------------------------------------------------------------------------
// GET /:serviceKey/members
// ---------------------------------------------------------------------------

router.get('/:serviceKey/members', async (req: Request, res: Response) => {
  try {
    const { serviceKey } = req.params;
    const orgId = getOrgId(req);
    const { search, role, status } = req.query;

    // Any subscriber can list members (read-only); admins see everything
    const callerRole = await getCallerRole(req, serviceKey);
    if (!callerRole) {
      return res.status(403).json({ error: 'Not subscribed to this service' });
    }

    const params: any[] = [normKey(serviceKey), orgId];
    const conditions: string[] = [];
    let paramIdx = 3;

    if (search) {
      conditions.push(
        `(u.first_name ILIKE $${paramIdx} OR u.last_name ILIKE $${paramIdx} OR u.email ILIKE $${paramIdx})`,
      );
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (role) {
      conditions.push(`uss.service_role = $${paramIdx}`);
      params.push(role);
      paramIdx++;
    }

    if (status) {
      conditions.push(`u.status = $${paramIdx}`);
      params.push(status);
      paramIdx++;
    }

    const whereExtra = conditions.length ? ' AND ' + conditions.join(' AND ') : '';

    const result = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.status, u.created_at,
              COALESCE(uss.service_role, 'service_admin') AS service_role,
              uss.status as subscription_status, uss.created_at as joined_at
       FROM user_service_subscriptions uss
       JOIN users u ON u.id = uss.user_id
       JOIN platform_services ps ON ps.id = uss.service_id
       WHERE ps.service_key = $1
         AND u.organization_id = $2
         AND uss.status = 'active'
         ${whereExtra}
       ORDER BY u.first_name, u.last_name`,
      params,
    );

    return res.json({
      success: true,
      data: result.rows.map((r: any) => ({
        id: r.id,
        firstName: r.first_name,
        lastName: r.last_name,
        email: r.email,
        status: r.status,
        serviceRole: r.service_role,
        subscriptionStatus: r.subscription_status,
        joinedAt: r.joined_at,
        createdAt: r.created_at,
      })),
    });
  } catch (err: any) {
    logger.error('Failed to list service members', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// PUT /:serviceKey/members/:userId/role
// ---------------------------------------------------------------------------

router.put('/:serviceKey/members/:userId/role', async (req: Request, res: Response) => {
  try {
    const { serviceKey, userId: targetUserId } = req.params;
    const requestingUserId = getUserId(req);
    const { role } = req.body;

    await requireServiceAdmin(req, serviceKey);

    if (requestingUserId === targetUserId) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    if (!role) {
      return res.status(400).json({ error: 'Role is required' });
    }

    // Validate role against customer_service_role_config
    const validRole = await pool.query(
      `SELECT service_role FROM customer_service_role_config
       WHERE service_key = $1 AND service_role = $2`,
      [normKey(serviceKey), role],
    );

    if (!validRole.rows.length) {
      return res.status(400).json({ error: 'Invalid role for this service' });
    }

    // Prevent demoting the last service_admin
    if (role !== 'service_admin') {
      const currentRole = await pool.query(
        `SELECT uss.service_role
         FROM user_service_subscriptions uss
         JOIN platform_services ps ON ps.id = uss.service_id
         WHERE ps.service_key = $1 AND uss.user_id = $2 AND uss.status = 'active'`,
        [normKey(serviceKey), targetUserId],
      );

      if (currentRole.rows.length && currentRole.rows[0].service_role === 'service_admin') {
        const orgId = getOrgId(req);
        const adminCount = await pool.query(
          `SELECT count(*)::int as cnt
           FROM user_service_subscriptions uss
           JOIN platform_services ps ON ps.id = uss.service_id
           JOIN users u ON u.id = uss.user_id
           WHERE ps.service_key = $1
             AND u.organization_id = $2
             AND uss.status = 'active'
             AND uss.service_role = 'service_admin'`,
          [normKey(serviceKey), orgId],
        );

        if (adminCount.rows[0].cnt <= 1) {
          return res.status(400).json({ error: 'Cannot demote the last service admin' });
        }
      }
    }

    const updated = await pool.query(
      `UPDATE user_service_subscriptions uss
       SET service_role = $1
       FROM platform_services ps
       WHERE ps.id = uss.service_id
         AND ps.service_key = $2
         AND uss.user_id = $3
         AND uss.status = 'active'
       RETURNING uss.user_id, uss.service_role`,
      [role, normKey(serviceKey), targetUserId],
    );

    if (!updated.rows.length) {
      return res.status(404).json({ error: 'Member not found in this service' });
    }

    return res.json({ success: true, data: updated.rows[0] });
  } catch (err: any) {
    if (err.statusCode === 403) {
      return res.status(403).json({ error: err.message });
    }
    logger.error('Failed to update member role', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /:serviceKey/members/:userId
// ---------------------------------------------------------------------------

router.delete('/:serviceKey/members/:userId', async (req: Request, res: Response) => {
  try {
    const { serviceKey, userId: targetUserId } = req.params;
    const requestingUserId = getUserId(req);

    await requireServiceAdmin(req, serviceKey);

    if (requestingUserId === targetUserId) {
      return res.status(400).json({ error: 'Cannot remove yourself from the service' });
    }

    // Prevent removing the last service_admin
    const currentRole = await pool.query(
      `SELECT uss.service_role
       FROM user_service_subscriptions uss
       JOIN platform_services ps ON ps.id = uss.service_id
       WHERE ps.service_key = $1 AND uss.user_id = $2 AND uss.status = 'active'`,
      [normKey(serviceKey), targetUserId],
    );

    if (currentRole.rows.length && currentRole.rows[0].service_role === 'service_admin') {
      const orgId = getOrgId(req);
      const adminCount = await pool.query(
        `SELECT count(*)::int as cnt
         FROM user_service_subscriptions uss
         JOIN platform_services ps ON ps.id = uss.service_id
         JOIN users u ON u.id = uss.user_id
         WHERE ps.service_key = $1
           AND u.organization_id = $2
           AND uss.status = 'active'
           AND uss.service_role = 'service_admin'`,
        [normKey(serviceKey), orgId],
      );

      if (adminCount.rows[0].cnt <= 1) {
        return res.status(400).json({ error: 'Cannot remove the last service admin' });
      }
    }

    const updated = await pool.query(
      `UPDATE user_service_subscriptions uss
       SET status = 'inactive'
       FROM platform_services ps
       WHERE ps.id = uss.service_id
         AND ps.service_key = $1
         AND uss.user_id = $2
         AND uss.status = 'active'
       RETURNING uss.user_id`,
      [normKey(serviceKey), targetUserId],
    );

    if (!updated.rows.length) {
      return res.status(404).json({ error: 'Member not found in this service' });
    }

    return res.json({ success: true, message: 'Member removed from service' });
  } catch (err: any) {
    if (err.statusCode === 403) {
      return res.status(403).json({ error: err.message });
    }
    logger.error('Failed to remove service member', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /:serviceKey/roles
// ---------------------------------------------------------------------------

router.get('/:serviceKey/roles', async (req: Request, res: Response) => {
  try {
    const { serviceKey } = req.params;

    const result = await pool.query(
      `SELECT service_role, display_name, description
       FROM customer_service_role_config
       WHERE service_key = $1
       ORDER BY display_name`,
      [normKey(serviceKey)],
    );

    return res.json({
      success: true,
      data: result.rows.map((r: any) => ({
        serviceRole: r.service_role,
        displayName: r.display_name,
        description: r.description,
      })),
    });
  } catch (err: any) {
    logger.error('Failed to list service roles', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /:serviceKey/privileges
// ---------------------------------------------------------------------------

router.get('/:serviceKey/privileges', async (req: Request, res: Response) => {
  try {
    const { serviceKey } = req.params;

    const result = await pool.query(
      `SELECT resource_type, action, allowed_roles
       FROM customer_authorization_policies
       WHERE service_key = $1 AND is_active = true
       ORDER BY resource_type, action`,
      [normKey(serviceKey)],
    );

    // Transform into { [role]: { resource_type: action[] } }
    const privileges: Record<string, Record<string, string[]>> = {};

    for (const row of result.rows) {
      const roles: string[] = Array.isArray(row.allowed_roles)
        ? row.allowed_roles
        : typeof row.allowed_roles === 'string'
          ? JSON.parse(row.allowed_roles)
          : [];

      for (const role of roles) {
        if (!privileges[role]) {
          privileges[role] = {};
        }
        if (!privileges[role][row.resource_type]) {
          privileges[role][row.resource_type] = [];
        }
        privileges[role][row.resource_type].push(row.action);
      }
    }

    return res.json({ success: true, data: privileges });
  } catch (err: any) {
    logger.error('Failed to list service privileges', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
