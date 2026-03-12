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

  if (!hasWrite) {
    return next(
      new ForbiddenError('Insufficient PM permissions — write access denied'),
    );
  }

  next();
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
