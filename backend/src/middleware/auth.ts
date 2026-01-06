import { Request, Response, NextFunction } from 'express';
import { jwtVerify, createRemoteJWKSet, JWTPayload } from 'jose';
import { config, keycloakConfig } from '../config';
import { authLogger } from '../utils/logger';
import { redisAuth } from '../database/redis';
import { UnauthorizedError, ForbiddenError } from './errorHandler';

// Keycloak JWT payload extended interface
interface KeycloakTokenPayload extends JWTPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  realm_access?: {
    roles: string[];
  };
  resource_access?: {
    [client: string]: {
      roles: string[];
    };
  };
  organization_id?: string;
  region?: string;
}

// Authenticated user interface attached to request
export interface AuthenticatedUser {
  sub: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  realmRoles: string[];
  clientRoles: string[];
  organizationId?: string;
  region?: string;
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      token?: string;
    }
  }
}

// Create JWKS client for Keycloak
const JWKS = createRemoteJWKSet(
  new URL(`${keycloakConfig.authServerUrl}/realms/${config.keycloak.realm}/protocol/openid-connect/certs`)
);

// Cache for blacklisted tokens (logout/revoked)
const TOKEN_BLACKLIST_PREFIX = 'propmetrik:token:blacklist:';
const TOKEN_BLACKLIST_TTL = 3600; // 1 hour

/**
 * Extract JWT from Authorization header
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return null;
  }
  
  const [type, token] = authHeader.split(' ');
  
  if (type.toLowerCase() !== 'bearer' || !token) {
    return null;
  }
  
  return token;
}

/**
 * Check if token is blacklisted (logged out or revoked)
 */
async function isTokenBlacklisted(tokenId: string): Promise<boolean> {
  try {
    const blacklisted = await redisAuth.get(`${TOKEN_BLACKLIST_PREFIX}${tokenId}`);
    return blacklisted !== null;
  } catch (error) {
    authLogger.warn('Failed to check token blacklist', { error });
    return false;
  }
}

/**
 * Blacklist a token (for logout)
 */
export async function blacklistToken(tokenId: string, expiresIn: number): Promise<void> {
  try {
    const ttl = Math.min(expiresIn, TOKEN_BLACKLIST_TTL);
    await redisAuth.setex(`${TOKEN_BLACKLIST_PREFIX}${tokenId}`, ttl, '1');
    authLogger.debug('Token blacklisted', { tokenId });
  } catch (error) {
    authLogger.error('Failed to blacklist token', { error, tokenId });
  }
}

/**
 * Parse Keycloak token payload into AuthenticatedUser
 */
function parseTokenPayload(payload: KeycloakTokenPayload): AuthenticatedUser {
  const clientRoles = payload.resource_access?.[config.keycloak.clientId]?.roles || [];
  
  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified || false,
    name: payload.name,
    username: payload.preferred_username,
    firstName: payload.given_name,
    lastName: payload.family_name,
    realmRoles: payload.realm_access?.roles || [],
    clientRoles,
    organizationId: payload.organization_id,
    region: payload.region,
  };
}

/**
 * Authentication middleware - verifies JWT and attaches user to request
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractToken(req);
    
    if (!token) {
      throw new UnauthorizedError('No authentication token provided');
    }
    
    // Verify JWT with Keycloak JWKS
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `${keycloakConfig.authServerUrl}/realms/${config.keycloak.realm}`,
      audience: config.keycloak.clientId,
    });
    
    const keycloakPayload = payload as KeycloakTokenPayload;
    
    // Check if token is blacklisted
    if (keycloakPayload.jti && await isTokenBlacklisted(keycloakPayload.jti)) {
      throw new UnauthorizedError('Token has been revoked');
    }
    
    // Parse and attach user to request
    req.user = parseTokenPayload(keycloakPayload);
    req.token = token;
    
    authLogger.debug('User authenticated', {
      userId: req.user.sub,
      username: req.user.username,
    });
    
    next();
  } catch (error: any) {
    if (error instanceof UnauthorizedError) {
      return next(error);
    }
    
    if (error.code === 'ERR_JWT_EXPIRED') {
      return next(new UnauthorizedError('Token has expired'));
    }
    
    if (error.code === 'ERR_JWT_INVALID' || error.code === 'ERR_JWS_INVALID') {
      return next(new UnauthorizedError('Invalid token'));
    }
    
    authLogger.error('Authentication error', { error: error.message });
    next(new UnauthorizedError('Authentication failed'));
  }
}

/**
 * Optional authentication - doesn't fail if no token provided
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractToken(req);
  
  if (!token) {
    return next();
  }
  
  // If token is provided, validate it
  return authenticate(req, res, next);
}

/**
 * Role-based authorization middleware factory
 */
export function requireRoles(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }
    
    const userRoles = [...req.user.realmRoles, ...req.user.clientRoles];
    const hasRequiredRole = roles.some((role) => userRoles.includes(role));
    
    if (!hasRequiredRole) {
      authLogger.warn('Access denied - insufficient roles', {
        userId: req.user.sub,
        requiredRoles: roles,
        userRoles,
      });
      return next(new ForbiddenError('Insufficient permissions'));
    }
    
    next();
  };
}

/**
 * Organization-based authorization middleware
 */
export function requireOrganization(allowSuperAdmin: boolean = true) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }
    
    // Super admins bypass organization check
    if (allowSuperAdmin && req.user.realmRoles.includes('super_admin')) {
      return next();
    }
    
    if (!req.user.organizationId) {
      return next(new ForbiddenError('Organization membership required'));
    }
    
    next();
  };
}

/**
 * Check if user has permission for a specific resource
 */
export function requireResourcePermission(
  getResourceOwnerId: (req: Request) => string | Promise<string>,
  allowRoles: string[] = ['admin', 'super_admin']
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }
    
    const userRoles = [...req.user.realmRoles, ...req.user.clientRoles];
    
    // Check if user has admin-level role
    if (allowRoles.some((role) => userRoles.includes(role))) {
      return next();
    }
    
    try {
      const resourceOwnerId = await getResourceOwnerId(req);
      
      if (resourceOwnerId === req.user.sub) {
        return next();
      }
      
      // Check organization-level access
      if (req.user.organizationId) {
        // TODO: Check if resource belongs to user's organization
      }
      
      authLogger.warn('Access denied - resource not owned', {
        userId: req.user.sub,
        resourceOwnerId,
      });
      
      next(new ForbiddenError('You do not have permission to access this resource'));
    } catch (error) {
      next(error);
    }
  };
}

// Pre-defined role check middleware
export const requireAdmin = requireRoles('admin', 'super_admin');
export const requireSuperAdmin = requireRoles('super_admin');
export const requireAgent = requireRoles('agent', 'admin', 'super_admin');
export const requireValuer = requireRoles('valuer', 'admin', 'super_admin');
export const requireAnalyst = requireRoles('analyst', 'admin', 'super_admin');
