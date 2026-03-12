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
  id: string;  // Alias for sub for convenience
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
  userType?: string;   // 'staff' | 'customer'
  tier?: string;       // org subscription tier
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      token?: string;
      organizationId?: string;
      userId?: string;
      currentServiceTier?: string;  // set by requireServiceAccess()
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
 * Extract JWT from Authorization header or query parameter.
 * Query parameter fallback is needed for SSE (EventSource) connections
 * which cannot set custom HTTP headers.
 */
function extractToken(req: Request): string | null {
  // 1. Try Authorization header first (standard)
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const [type, token] = authHeader.split(' ');
    if (type.toLowerCase() === 'bearer' && token) {
      return token;
    }
  }

  // 2. Fallback: query parameter (for SSE/EventSource connections)
  const queryToken = req.query.token as string | undefined;
  if (queryToken) {
    return queryToken;
  }

  return null;
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
  const clientId = config.keycloak.clientId || '';
  const clientRoles = clientId && payload.resource_access?.[clientId]?.roles || [];
  
  return {
    sub: payload.sub,
    id: payload.sub, // Alias for sub for convenience
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
 * Cached dev-mode user (loaded from DB on first use).
 * No credentials are hardcoded — the first super_admin row is fetched at runtime.
 */
let _cachedDevUser: AuthenticatedUser | null = null;

async function getDevModeUser(): Promise<AuthenticatedUser> {
  if (_cachedDevUser) return _cachedDevUser;
  try {
    const { query: dbQuery } = require('../database');
    const result = await dbQuery(
      `SELECT id, email, first_name, last_name, role,
              organization_id, user_type
       FROM users WHERE role = 'super_admin' AND is_active = true
       ORDER BY created_at ASC LIMIT 1`
    );
    if (result.rows.length > 0) {
      const row = result.rows[0];
      _cachedDevUser = {
        sub: row.id,
        id: row.id,
        email: row.email,
        emailVerified: true,
        name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email,
        username: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        realmRoles: [row.role],
        clientRoles: [row.role],
        organizationId: row.organization_id,
        region: undefined,
        userType: row.user_type || 'staff',
      };
      authLogger.info(`Dev mode user loaded from DB: ${row.email}`);
      return _cachedDevUser;
    }
  } catch (err) {
    authLogger.warn('Failed to load dev user from DB — dev mode will reject requests', { error: (err as Error).message });
  }
  throw new UnauthorizedError('No super_admin user found in database for dev mode');
}

/**
 * Enrich req.user with userType and tier from the database.
 * Called after authentication succeeds, before passing to next().
 * Intentionally non-blocking — failures are logged, not thrown.
 */
async function enrichUserFromDb(req: Request): Promise<void> {
  if (!req.user) return;
  const userId = req.user.id || req.user.sub;
  if (!userId) return;

  // Already enriched (dev mode user or cached)
  if (req.user.userType) return;

  try {
    const { pool } = await import('../database');
    const result = await pool.query(
      `SELECT u.user_type, o.subscription_tier
       FROM users u
       LEFT JOIN organizations o ON o.id = u.organization_id
       WHERE u.id = $1`,
      [userId],
    );
    if (result.rows.length > 0) {
      req.user.userType = result.rows[0].user_type || 'staff';
      req.user.tier = result.rows[0].subscription_tier || 'starter';
    } else {
      req.user.userType = 'staff';
    }
  } catch {
    // Non-fatal — downstream middleware can resolve if needed
    req.user.userType = 'staff';
  }
}

/**
 * Local JWT secret — same as used by /auth/login and /auth/signup
 */
const LOCAL_JWT_SECRET = config.jwt.secret;

/**
 * Try to decode a local (non-Keycloak) JWT and map to AuthenticatedUser.
 * Returns null if the token is not a local JWT.
 */
function tryDecodeLocalJwt(token: string): AuthenticatedUser | null {
  try {
    const jwt = require('jsonwebtoken');
    const payload = jwt.verify(token, LOCAL_JWT_SECRET) as {
      userId: string;
      email: string;
      role: string;
      organizationId?: string;
      tier?: string;
      userType?: string;
    };
    if (!payload.userId) return null;
    return {
      sub: payload.userId,
      id: payload.userId,
      email: payload.email,
      emailVerified: true,
      name: payload.email,
      username: payload.email,
      firstName: undefined,
      lastName: undefined,
      realmRoles: [payload.role],
      clientRoles: [payload.role],
      organizationId: payload.organizationId,
      region: undefined,
      tier: payload.tier,
      userType: payload.userType || 'staff',
    };
  } catch {
    return null;
  }
}

/**
 * Authentication middleware - verifies JWT and attaches user to request
 * Supports both Keycloak JWTs and local JWTs from /auth/login.
 * In development mode without a token, uses a mock user.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractToken(req);
    
    // Development mode bypass - allow unauthenticated access
    if (!token && config.app.env === 'development') {
      try {
        const devUser = await getDevModeUser();
        req.user = { 
          ...devUser,
          organization_id: devUser.organizationId,
        } as any;
        authLogger.debug('Development mode: using DB user');
        return next();
      } catch {
        // Fall through to "No authentication token" error
      }
    }
    
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
    
    await enrichUserFromDb(req);
    next();
  } catch (error: any) {
    if (error instanceof UnauthorizedError) {
      return next(error);
    }

    // If Keycloak verification fails, try local JWT (from /auth/login)
    const token = extractToken(req);
    if (token) {
      const localUser = tryDecodeLocalJwt(token);
      if (localUser) {
        req.user = localUser;
        req.token = token;
        authLogger.debug('User authenticated via local JWT', {
          userId: localUser.id,
          email: localUser.email,
          role: localUser.realmRoles[0],
        });
        await enrichUserFromDb(req);
        return next();
      }
    }
    
    if (error.code === 'ERR_JWT_EXPIRED') {
      // In dev mode, fall back to dev user when token is expired
      if (config.app.env === 'development') {
        try {
          const devUser = await getDevModeUser();
          req.user = { ...devUser, organization_id: devUser.organizationId } as any;
          authLogger.debug('Development mode: token expired, falling back to DB user');
          return next();
        } catch { /* fall through */ }
      }
      return next(new UnauthorizedError('Token has expired'));
    }
    
    if (error.code === 'ERR_JWT_INVALID' || error.code === 'ERR_JWS_INVALID') {
      // In dev mode, fall back to dev user when token is invalid
      if (config.app.env === 'development') {
        try {
          const devUser = await getDevModeUser();
          req.user = { ...devUser, organization_id: devUser.organizationId } as any;
          authLogger.debug('Development mode: token invalid, falling back to DB user');
          return next();
        } catch { /* fall through */ }
      }
      return next(new UnauthorizedError('Invalid token'));
    }
    
    // In dev mode, fall back to dev user for any other auth error
    if (config.app.env === 'development') {
      try {
        const devUser = await getDevModeUser();
        req.user = { ...devUser, organization_id: devUser.organizationId } as any;
        authLogger.debug('Development mode: auth failed, falling back to DB user');
        return next();
      } catch { /* fall through */ }
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
