/**
 * PM Module Auth & Validation Helpers
 * 
 * Centralized utilities for Project Management routes:
 * - UUID parameter validation middleware
 * - Role-based PM authorization (requirePMAccess / requirePMWrite)
 * - Authenticated user context extraction (no header fallbacks)
 * - Organization-scoped request helpers
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ForbiddenError, UnauthorizedError } from './errorHandler';
import { pool } from '../database';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a route parameter is a valid UUID.
 * For the 'id' param specifically, non-UUID values skip to the next route
 * (since literal routes like /contractors, /summaries share the /:id position).
 * For all other params, returns 400 if invalid.
 */
export function validateUUIDParam(
  req: Request,
  res: Response,
  next: NextFunction,
  value: string,
  name: string
): void {
  if (!UUID_REGEX.test(value)) {
    // For the 'id' param, non-UUID values may be literal sub-route paths
    // (e.g. /contractors, /summaries, /phases). Skip to next matching route.
    if (name === 'id') {
      return next('route');
    }
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMETER',
        message: `Parameter '${name}' must be a valid UUID, received: '${value}'`,
      },
    });
    return;
  }
  next();
}

/**
 * Middleware that validates all common UUID params in PM routes.
 * Apply once at the router level: `router.param('id', validateUUIDParam)`.
 * For routes with multiple UUID params (projectId, phaseId, etc.), register each.
 */
export const PM_UUID_PARAMS = [
  'id', 'projectId', 'phaseId', 'milestoneId', 'unitId', 'costId',
  'contractorId', 'drawId', 'logId', 'planId', 'itemId', 'rfiId',
  'memberId', 'vendorId', 'orderId', 'checklistId', 'categoryId',
  'templateId', 'sectionId', 'albumId', 'photoId', 'commentId',
  'comparisonId', 'shareId', 'frameworkId', 'diaryId', 'entryId',
] as const;

/**
 * Register UUID validation for all common PM parameter names on a router.
 */
export function registerPMParamValidation(router: { param: (name: string, handler: any) => void }) {
  for (const paramName of PM_UUID_PARAMS) {
    router.param(paramName, validateUUIDParam);
  }
}

/**
 * Extract the authenticated user's ID from req.user.
 * After `authenticate` middleware, req.user is always populated
 * (in dev mode with mock user, in prod with real Keycloak user).
 * 
 * NEVER falls back to x-user-id headers — that's a security hole.
 */
export function getAuthUserId(req: Request): string {
  const user = (req as any).user;
  if (!user) {
    throw new Error('getAuthUserId called without authenticate middleware');
  }
  return user.id || user.sub;
}

/**
 * Extract the authenticated user's organization ID from req.user.
 * NEVER falls back to x-organization-id headers.
 */
export function getAuthOrgId(req: Request): string {
  const user = (req as any).user;
  if (!user) {
    throw new Error('getAuthOrgId called without authenticate middleware');
  }
  return user.organizationId || user.organization_id;
}

/**
 * Extract full user context from authenticated request.
 */
export function getAuthContext(req: Request) {
  const user = (req as any).user;
  if (!user) {
    throw new Error('getAuthContext called without authenticate middleware');
  }
  return {
    userId: user.id || user.sub,
    organizationId: user.organizationId || user.organization_id,
    email: user.email,
    roles: [...(user.realmRoles || []), ...(user.clientRoles || [])],
  };
}

// Reusable Zod schemas for PM query params
export const pmPaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const pmSearchQuery = pmPaginationQuery.extend({
  search: z.string().max(255).optional(),
});

// ============================================================================
// PM ROLE-BASED AUTHORIZATION
// ============================================================================

/**
 * Roles that have read-only access to PM routes.
 * Any authenticated user with one of these roles may view PM data.
 */
const PM_READ_ROLES = [
  'super_admin', 'admin', 'firm_principal', 'manager',
  'project_manager', 'finance_manager', 'inspector', 'analyst', 'viewer',
] as const;

/**
 * Roles that may create, update, or delete PM resources.
 */
const PM_WRITE_ROLES = [
  'super_admin', 'admin', 'firm_principal', 'manager', 'project_manager',
] as const;

/**
 * Helper: extract combined realm + client roles from the request user.
 */
function getUserRoles(req: Request): string[] {
  const user = (req as any).user;
  if (!user) return [];
  return [...(user.realmRoles || []), ...(user.clientRoles || [])];
}

/**
 * Middleware: require the user to have at least one PM-relevant role.
 * Applied at mount level for all PM route groups.
 */
export function requirePMAccess(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user;
  if (!user) {
    return next(new UnauthorizedError('Authentication required'));
  }

  const roles = getUserRoles(req);
  const hasAccess = PM_READ_ROLES.some(r => roles.includes(r));

  if (!hasAccess) {
    return next(
      new ForbiddenError('PM module access denied — missing required role'),
    );
  }

  next();
}

/**
 * Middleware: require a write-capable PM role (admin/super_admin/pm/project_manager/agent).
 * Use on individual POST / PUT / DELETE endpoints that mutate data.
 */
export function requirePMWrite(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user;
  if (!user) {
    return next(new UnauthorizedError('Authentication required'));
  }

  const roles = getUserRoles(req);
  const hasWrite = PM_WRITE_ROLES.some(r => roles.includes(r));

  if (hasWrite) {
    return next();
  }

  // Customers with an active projects subscription and write-capable service role
  const customerServiceRole = (req as any).customerServiceRole as string | undefined;
  if (user.userType === 'customer' && customerServiceRole) {
    const customerWriteRoles = ['service_admin', 'manager', 'admin', 'project_manager'];
    if (customerWriteRoles.includes(customerServiceRole)) {
      return next();
    }
  }

  return next(
    new ForbiddenError('Insufficient PM permissions — write access denied'),
  );
}

// ============================================================================
// PROJECT-SCOPED ACCESS (membership + per-project permissions)
// ============================================================================

/**
 * Org-leadership roles that see and manage EVERY project in the org — they
 * bypass project-membership scoping. Everyone else is restricted to projects
 * they own (project_manager_id) or are an active team member of.
 */
const PM_ORG_ADMIN_ROLES = ['super_admin', 'admin', 'firm_principal', 'manager'] as const;

export function isOrgAdmin(req: Request): boolean {
  const roles = getUserRoles(req);
  return PM_ORG_ADMIN_ROLES.some(r => roles.includes(r));
}

/** The eight per-member permission flags stored on project_team_members. */
export type ProjectPermission =
  | 'can_view' | 'can_edit' | 'can_approve_costs' | 'can_upload_documents'
  | 'can_add_tasks' | 'can_manage_team' | 'can_view_financials' | 'can_receive_notifications';

export interface ProjectAccess {
  hasAccess: boolean;
  /** Project owner (project_manager_id) or a project_manager/project_owner team role — exempt from per-permission checks. */
  isOwnerOrPM: boolean;
  permissions: Record<ProjectPermission, boolean>;
}

const NO_ACCESS: ProjectAccess = {
  hasAccess: false,
  isOwnerOrPM: false,
  permissions: {
    can_view: false, can_edit: false, can_approve_costs: false, can_upload_documents: false,
    can_add_tasks: false, can_manage_team: false, can_view_financials: false, can_receive_notifications: false,
  },
};

/**
 * Resolve a user's access to a project: are they the owner/PM, or an active
 * team member, and what are their permission flags. Org-scoped so a member of
 * another org can never match.
 */
export async function getProjectMembership(
  userId: string,
  projectId: string,
  organizationId: string
): Promise<ProjectAccess> {
  const result = await pool.query(
    `SELECT
       (p.project_manager_id = $2) AS is_pm_owner,
       tm.role_type,
       tm.can_view, tm.can_edit, tm.can_approve_costs, tm.can_upload_documents,
       tm.can_add_tasks, tm.can_manage_team, tm.can_view_financials, tm.can_receive_notifications
     FROM development_projects p
     LEFT JOIN project_team_members tm
       ON tm.project_id = p.id AND tm.user_id = $2 AND tm.is_active = true
     WHERE p.id = $1 AND p.organization_id = $3`,
    [projectId, userId, organizationId]
  );

  if (result.rows.length === 0) return { ...NO_ACCESS };
  const row = result.rows[0];
  const isMember = row.role_type != null;
  const isPmOwner = row.is_pm_owner === true;
  const isOwnerOrPM = isPmOwner || row.role_type === 'project_manager' || row.role_type === 'project_owner';

  if (!isPmOwner && !isMember) return { ...NO_ACCESS };

  // Owner/PM implicitly hold every permission; otherwise read the member's flags.
  const perm = (v: any): boolean => isOwnerOrPM ? true : v === true;
  return {
    hasAccess: true,
    isOwnerOrPM,
    permissions: {
      can_view: perm(row.can_view),
      can_edit: perm(row.can_edit),
      can_approve_costs: perm(row.can_approve_costs),
      can_upload_documents: perm(row.can_upload_documents),
      can_add_tasks: perm(row.can_add_tasks),
      can_manage_team: perm(row.can_manage_team),
      can_view_financials: perm(row.can_view_financials),
      can_receive_notifications: perm(row.can_receive_notifications),
    },
  };
}

/**
 * Middleware factory: enforce that the authenticated user may access the
 * project referenced in the request (param :projectId or :id, else body
 * .project_id / query .projectId). Org-admins bypass. Optionally require a
 * specific per-project permission. Attaches `req.projectAccess`.
 *
 * Routes whose project can't be resolved from the path (e.g. keyed only by a
 * child id like :phaseId) fall through to the role-based guards — those are
 * still gated by requirePMWrite.
 */
export function requireProjectAccess(permission?: ProjectPermission) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = (req as any).user;
      if (!user) return next(new UnauthorizedError('Authentication required'));
      if (isOrgAdmin(req)) return next();

      const raw = req.params.projectId || req.params.id || (req.body && req.body.project_id) || req.query.projectId;
      const projectId = raw ? String(raw) : '';
      if (!projectId || !UUID_REGEX.test(projectId)) {
        // No resolvable project context — defer to role-based guards.
        return next();
      }

      const access = await getProjectMembership(getAuthUserId(req), projectId, getAuthOrgId(req));
      if (!access.hasAccess) {
        return next(new ForbiddenError('You do not have access to this project'));
      }
      if (permission && !access.permissions[permission]) {
        return next(new ForbiddenError(`Insufficient project permission: ${permission}`));
      }
      (req as any).projectAccess = access;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * router.param handler that enforces project membership whenever a route is
 * keyed by a project id. Register ONLY for param names that genuinely hold a
 * project id (e.g. 'projectId', and 'id' on the projects router). Org-admins
 * bypass. On success attaches req.projectAccess.
 *
 * NOTE: do NOT register for 'id' on routers where ':id' is a non-project
 * resource (e.g. an rfi id) — it would mis-resolve and 403 everyone.
 */
export async function enforceProjectParamAccess(
  req: Request,
  res: Response,
  next: NextFunction,
  value: string,
  _name: string
): Promise<void> {
  try {
    const user = (req as any).user;
    if (!user) return next(new UnauthorizedError('Authentication required'));
    if (isOrgAdmin(req)) return next();
    if (!UUID_REGEX.test(value)) return next(); // literal sub-route; UUID validator handles it

    const access = await getProjectMembership(getAuthUserId(req), value, getAuthOrgId(req));
    if (!access.hasAccess) {
      return next(new ForbiddenError('You do not have access to this project'));
    }
    (req as any).projectAccess = access;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Register the project-membership param guard for the given param names on a
 * router. Pass only project-id param names.
 */
export function registerProjectAccessParams(
  router: { param: (name: string, handler: any) => void },
  paramNames: string[]
) {
  for (const name of paramNames) {
    router.param(name, enforceProjectParamAccess);
  }
}

/**
 * Factory: a router.param handler for routes keyed by a CHILD resource id
 * (e.g. an rfi id, change-order id). Resolves the child's project_id from the
 * given table, then enforces project membership. Table is allow-listed (never
 * interpolated from user input) to keep the query injection-safe.
 * Org-admins bypass. If the child isn't found, defers (lets the handler 404).
 */
const CHILD_PROJECT_TABLES: Record<string, string> = {
  rfis: 'rfis',
  change_orders: 'change_orders',
};

export function enforceChildProjectAccess(table: keyof typeof CHILD_PROJECT_TABLES) {
  const safeTable = CHILD_PROJECT_TABLES[table];
  return async (req: Request, res: Response, next: NextFunction, value: string): Promise<void> => {
    try {
      const user = (req as any).user;
      if (!user) return next(new UnauthorizedError('Authentication required'));
      if (isOrgAdmin(req)) return next();
      if (!safeTable || !UUID_REGEX.test(value)) return next();

      const orgId = getAuthOrgId(req);
      const child = await pool.query(
        `SELECT project_id FROM ${safeTable} WHERE id = $1 AND organization_id = $2`,
        [value, orgId]
      );
      if (child.rows.length === 0 || !child.rows[0].project_id) return next(); // 404 in handler

      const access = await getProjectMembership(getAuthUserId(req), child.rows[0].project_id, orgId);
      if (!access.hasAccess) {
        return next(new ForbiddenError('You do not have access to this project'));
      }
      (req as any).projectAccess = access;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Per-route guard requiring a specific project permission. Relies on a project
 * membership guard (enforceProjectParamAccess / enforceChildProjectAccess)
 * having already run and attached req.projectAccess. Org-admins bypass; project
 * owners/PMs implicitly hold every permission (set in getProjectMembership).
 */
export function requireProjectPermission(permission: ProjectPermission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    if (!user) return next(new UnauthorizedError('Authentication required'));
    if (isOrgAdmin(req)) return next();

    const access = (req as any).projectAccess as ProjectAccess | undefined;
    if (!access || !access.hasAccess) {
      return next(new ForbiddenError('You do not have access to this project'));
    }
    if (!access.permissions[permission]) {
      return next(new ForbiddenError(`Insufficient project permission: ${permission}`));
    }
    next();
  };
}

/**
 * router.param handler that requires can_view_financials on top of membership.
 * Register AFTER enforceProjectParamAccess for the same param so membership
 * (which attaches req.projectAccess) runs first. Used to gate the budget router.
 */
export async function enforceFinancialsParamAccess(
  req: Request,
  res: Response,
  next: NextFunction,
  value: string,
  _name: string
): Promise<void> {
  if (isOrgAdmin(req)) return next();
  const access = (req as any).projectAccess as ProjectAccess | undefined;
  if (!access || !access.hasAccess) {
    return next(new ForbiddenError('You do not have access to this project'));
  }
  if (!access.permissions.can_view_financials) {
    return next(new ForbiddenError('Insufficient project permission: can_view_financials'));
  }
  next();
}

/**
 * Guard for project-scoped LIST endpoints that take projectId from the query
 * (not the path). Non-admins must supply a projectId they belong to; org-admins
 * pass through. Returns 403 if a non-member projectId is requested, or 400 if a
 * non-admin omits projectId (so listing can't leak across projects).
 */
export async function requireProjectQueryAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = (req as any).user;
    if (!user) return next(new UnauthorizedError('Authentication required'));
    if (isOrgAdmin(req)) return next();

    const raw = (req.query.projectId || req.query.project_id) as string | undefined;
    if (!raw || !UUID_REGEX.test(raw)) {
      return next(new ForbiddenError('A projectId you have access to is required'));
    }
    const access = await getProjectMembership(getAuthUserId(req), raw, getAuthOrgId(req));
    if (!access.hasAccess) {
      return next(new ForbiddenError('You do not have access to this project'));
    }
    (req as any).projectAccess = access;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Factory: require a specific set of PM roles (custom per-route).
 */
export function requirePMRoles(...allowed: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    if (!user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    const roles = getUserRoles(req);
    if (!allowed.some(r => roles.includes(r))) {
      return next(new ForbiddenError('Insufficient PM permissions'));
    }

    next();
  };
}
