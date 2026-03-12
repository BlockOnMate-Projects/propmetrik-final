/**
 * Shared helpers for CRM route handlers
 */
import { Request, Response, NextFunction } from 'express';
import db from '../../database';
import config from '../../config';

export async function getOrganizationId(req: Request): Promise<string> {
    let id = (req as any).user?.organizationId;
    if (!id) {
        id = req.headers['x-organization-id'] as string;
    }
    if (!id && config.app.env === 'development') {
        const result = await db.query('SELECT id FROM organizations LIMIT 1');
        if (result.rows.length > 0) {
            return result.rows[0].id;
        }
    }
    return id || '00000000-0000-0000-0000-000000000000';
}

export async function getUserId(req: Request): Promise<string | undefined> {
    let id = (req as any).user?.id;
    if (!id) {
        id = req.headers['x-user-id'] as string;
    }
    if (!id && config.app.env === 'development') {
        const result = await db.query('SELECT id FROM users LIMIT 1');
        if (result.rows.length > 0) {
            return result.rows[0].id;
        }
    }
    return id;
}

/** Get the primary role from the authenticated user */
export function getUserRole(req: Request): string {
    const roles = [
        ...(req.user?.realmRoles || []),
        ...(req.user?.clientRoles || []),
    ];
    return roles[0] || '';
}

/** If the user has the `agent` role, resolve their agents table ID */
export async function getAgentIdForUser(req: Request): Promise<string | null> {
    const role = getUserRole(req);
    if (role !== 'agent') return null;

    const userId = (req as any).user?.id || (req as any).user?.sub;
    if (!userId) return null;

    const result = await db.query(
        'SELECT id FROM agents WHERE user_id = $1 LIMIT 1',
        [userId],
    );
    return result.rows[0]?.id || null;
}

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void | any>) {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
