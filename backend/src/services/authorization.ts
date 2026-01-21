/**
 * Authorization Service
 * Layer 2 Authorization - Guards, Policies, Ownership Checks
 * 
 * DESIGN NOTES:
 * - This service provides the authorization interfaces for the platform
 * - Keycloak/Kong integration will replace the authentication layer
 * - Business logic authorization (this service) remains unchanged
 * - All authorization is enforced SERVER-SIDE
 * 
 * @module services/authorization
 */

import { Request, Response, NextFunction } from 'express';
import db from '../database';
import { logger } from '../utils/logger';
import { ForbiddenError, UnauthorizedError } from '../middleware/errorHandler';

// =====================================================
// TYPES
// =====================================================

/**
 * Platform roles - must match user_role_enum in database
 */
export enum UserRole {
    SUPER_ADMIN = 'super_admin',
    ADMIN = 'admin',
    MANAGER = 'manager',
    AGENT = 'agent',
    ANALYST = 'analyst',
    VIEWER = 'viewer'
}

/**
 * Resource types for policy enforcement
 */
export type ResourceType = 'deal' | 'contact' | 'property' | 'document' | 'task' | 'note' | 'agent' | 'pipeline';

/**
 * Actions for policy enforcement
 */
export type ResourceAction = 'read' | 'write' | 'delete' | 'manage' | 'sign';

/**
 * Request context - available on all authenticated requests
 */
export interface RequestContext {
    userId: string;
    orgId: string;
    role: UserRole;
    agentId?: string;  // If user is linked to an agent
    email?: string;
}

/**
 * Extended Express Request with context
 */
declare global {
    namespace Express {
        interface Request {
            context?: RequestContext;
        }
    }
}

// =====================================================
// CONTEXT MIDDLEWARE
// =====================================================

/**
 * Development auth middleware - provides request context without Keycloak
 * This will be replaced by Keycloak JWT parsing in production
 * 
 * IMPORTANT: This is intentional for the Service Construction Phase
 */
export async function devAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        // Try to get user from various sources (in order of priority)
        let userId = req.headers['x-user-id'] as string;
        let orgId = req.headers['x-organization-id'] as string;
        let role: UserRole | undefined;
        let agentId: string | undefined;
        let email: string | undefined;

        // If user ID provided, look up their details
        if (userId) {
            const userResult = await db.query(
                `SELECT u.id, u.organization_id, u.role, u.email, a.id as agent_id
                 FROM users u
                 LEFT JOIN agents a ON a.user_id = u.id
                 WHERE u.id = $1`,
                [userId]
            );
            
            if (userResult.rows.length > 0) {
                const user = userResult.rows[0];
                orgId = orgId || user.organization_id;
                role = user.role as UserRole;
                agentId = user.agent_id;
                email = user.email;
            }
        }

        // If no user but org provided, use default super_admin (dev only)
        if (!userId && orgId) {
            const userResult = await db.query(
                `SELECT id, role, email FROM users 
                 WHERE organization_id = $1 AND role = 'super_admin' 
                 LIMIT 1`,
                [orgId]
            );
            if (userResult.rows.length > 0) {
                userId = userResult.rows[0].id;
                role = UserRole.SUPER_ADMIN;
                email = userResult.rows[0].email;
            }
        }

        // Fallback: get first org and first super_admin user (dev mode only)
        if (!userId || !orgId) {
            const orgResult = await db.query('SELECT id FROM organizations LIMIT 1');
            if (orgResult.rows.length > 0) {
                orgId = orgResult.rows[0].id;
                
                const userResult = await db.query(
                    `SELECT u.id, u.role, u.email, a.id as agent_id
                     FROM users u
                     LEFT JOIN agents a ON a.user_id = u.id
                     WHERE u.organization_id = $1 
                     ORDER BY CASE WHEN u.role = 'super_admin' THEN 0 ELSE 1 END
                     LIMIT 1`,
                    [orgId]
                );
                if (userResult.rows.length > 0) {
                    userId = userResult.rows[0].id;
                    role = userResult.rows[0].role as UserRole;
                    agentId = userResult.rows[0].agent_id;
                    email = userResult.rows[0].email;
                }
            }
        }

        // Set context on request
        if (userId && orgId) {
            req.context = {
                userId,
                orgId,
                role: role || UserRole.VIEWER,
                agentId,
                email
            };
        }

        next();
    } catch (error) {
        logger.error('Error in dev auth middleware', { error });
        next(error);
    }
}

// =====================================================
// AUTHORIZATION GUARDS
// =====================================================

/**
 * Require authentication - ensures request has valid context
 */
export function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    if (!req.context?.userId) {
        return next(new UnauthorizedError('Authentication required'));
    }
    next();
}

/**
 * Require specific roles - role-based access control
 */
export function requireRole(...allowedRoles: UserRole[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.context) {
            return next(new UnauthorizedError('Authentication required'));
        }

        // Super admin bypasses all role checks
        if (req.context.role === UserRole.SUPER_ADMIN) {
            return next();
        }

        if (!allowedRoles.includes(req.context.role)) {
            logger.warn('Access denied - insufficient role', {
                userId: req.context.userId,
                userRole: req.context.role,
                requiredRoles: allowedRoles
            });
            return next(new ForbiddenError('Insufficient permissions'));
        }

        next();
    };
}

/**
 * Require organization context
 */
export function requireOrg(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    if (!req.context?.orgId) {
        return next(new ForbiddenError('Organization context required'));
    }
    next();
}

// =====================================================
// POLICY ENFORCEMENT
// =====================================================

/**
 * Policy check options
 */
interface PolicyCheckOptions {
    resourceType: ResourceType;
    action: ResourceAction;
    resourceId?: string;
    resourceOrgId?: string;
    ownerId?: string;
    assignedAgentId?: string;
}

/**
 * Check if user has access to a resource based on policies
 */
export async function checkPolicy(
    context: RequestContext,
    options: PolicyCheckOptions
): Promise<boolean> {
    // Super admin bypasses all checks
    if (context.role === UserRole.SUPER_ADMIN) {
        return true;
    }

    // Admin has full org access
    if (context.role === UserRole.ADMIN) {
        if (options.resourceOrgId && options.resourceOrgId !== context.orgId) {
            return false;
        }
        return true;
    }

    // Manager has full org read access, can manage agents
    if (context.role === UserRole.MANAGER) {
        if (options.resourceOrgId && options.resourceOrgId !== context.orgId) {
            return false;
        }
        return true;
    }

    // Agent - check ownership/assignment
    if (context.role === UserRole.AGENT) {
        // Must be same org
        if (options.resourceOrgId && options.resourceOrgId !== context.orgId) {
            return false;
        }

        // Check if assigned
        if (options.assignedAgentId && context.agentId) {
            if (options.assignedAgentId === context.agentId) {
                return true;
            }
        }

        // For agents, default to false unless explicitly assigned
        if (options.resourceType === 'deal' || options.resourceType === 'document') {
            // Must check assignment in database
            if (options.resourceId && context.agentId) {
                const result = await db.query(
                    `SELECT 1 FROM deals d 
                     WHERE d.id = $1 AND d.assigned_agent = $2`,
                    [options.resourceId, context.agentId]
                );
                return result.rows.length > 0;
            }
            return false;
        }

        // Contacts/tasks - more permissive for agents
        if (options.action === 'read' || options.action === 'write') {
            return true;
        }

        return false;
    }

    // Analyst - read only
    if (context.role === UserRole.ANALYST) {
        if (options.action !== 'read') {
            return false;
        }
        if (options.resourceOrgId && options.resourceOrgId !== context.orgId) {
            return false;
        }
        return true;
    }

    // Viewer - very limited
    if (context.role === UserRole.VIEWER) {
        return false;
    }

    return false;
}

/**
 * Middleware factory for policy enforcement
 */
export function enforcePolicy(
    resourceType: ResourceType,
    action: ResourceAction,
    getResourceId?: (req: Request) => string | undefined,
    getResourceOrgId?: (req: Request) => string | undefined,
    getAssignedAgentId?: (req: Request) => Promise<string | undefined>
) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        if (!req.context) {
            return next(new UnauthorizedError('Authentication required'));
        }

        try {
            const options: PolicyCheckOptions = {
                resourceType,
                action,
                resourceId: getResourceId?.(req),
                resourceOrgId: getResourceOrgId?.(req) || req.context.orgId
            };

            // Get assigned agent if function provided
            if (getAssignedAgentId) {
                options.assignedAgentId = await getAssignedAgentId(req);
            }

            const hasAccess = await checkPolicy(req.context, options);

            if (!hasAccess) {
                logger.warn('Policy denied access', {
                    userId: req.context.userId,
                    role: req.context.role,
                    resourceType,
                    action,
                    resourceId: options.resourceId
                });
                return next(new ForbiddenError('Access denied'));
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

// =====================================================
// OWNERSHIP HELPERS
// =====================================================

/**
 * Get agent ID assigned to a deal
 */
export async function getDealAssignedAgent(dealId: string): Promise<string | undefined> {
    const result = await db.query(
        'SELECT assigned_agent FROM deals WHERE id = $1',
        [dealId]
    );
    return result.rows[0]?.assigned_agent;
}

/**
 * Check if user is assigned to a deal (via their agent record)
 */
export async function isUserAssignedToDeal(userId: string, dealId: string): Promise<boolean> {
    const result = await db.query(
        `SELECT 1 FROM deals d
         JOIN agents a ON d.assigned_agent = a.id
         WHERE d.id = $1 AND a.user_id = $2`,
        [dealId, userId]
    );
    return result.rows.length > 0;
}

/**
 * Get deals assigned to a user (via their agent record)
 */
export async function getUserAssignedDealIds(userId: string): Promise<string[]> {
    const result = await db.query(
        `SELECT d.id FROM deals d
         JOIN agents a ON d.assigned_agent = a.id
         WHERE a.user_id = $1 AND d.deleted_at IS NULL`,
        [userId]
    );
    return result.rows.map(r => r.id);
}

/**
 * Filter query to only include resources user can access
 * Used for list endpoints
 */
export function buildAccessFilter(
    context: RequestContext,
    resourceType: ResourceType,
    tableAlias: string = 'd'
): { where: string; params: any[] } {
    // Super admin, admin, manager see all in org
    if ([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER].includes(context.role)) {
        return {
            where: `${tableAlias}.organization_id = $1`,
            params: [context.orgId]
        };
    }

    // Agent sees only assigned deals
    if (context.role === UserRole.AGENT && context.agentId) {
        if (resourceType === 'deal') {
            return {
                where: `${tableAlias}.organization_id = $1 AND ${tableAlias}.assigned_agent = $2`,
                params: [context.orgId, context.agentId]
            };
        }
        // For contacts/tasks linked to deals
        return {
            where: `${tableAlias}.organization_id = $1`,
            params: [context.orgId]
        };
    }

    // Default: org-scoped
    return {
        where: `${tableAlias}.organization_id = $1`,
        params: [context.orgId]
    };
}

// =====================================================
// CONVENIENCE MIDDLEWARE
// =====================================================

// Pre-built role guards
export const requireSuperAdmin = requireRole(UserRole.SUPER_ADMIN);
export const requireAdmin = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);
export const requireManager = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER);
export const requireAgentOrAbove = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT);

// Pre-built policy guards
export const canReadDeals = enforcePolicy('deal', 'read');
export const canWriteDeals = enforcePolicy('deal', 'write');
export const canDeleteDeals = enforcePolicy('deal', 'delete');
export const canReadContacts = enforcePolicy('contact', 'read');
export const canWriteContacts = enforcePolicy('contact', 'write');

export default {
    UserRole,
    devAuthMiddleware,
    requireAuth,
    requireRole,
    requireOrg,
    checkPolicy,
    enforcePolicy,
    getDealAssignedAgent,
    isUserAssignedToDeal,
    getUserAssignedDealIds,
    buildAccessFilter,
    requireSuperAdmin,
    requireAdmin,
    requireManager,
    requireAgentOrAbove
};
