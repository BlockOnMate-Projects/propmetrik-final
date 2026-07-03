/**
 * Partner Authentication Middleware
 * Industry-standard OAuth2 Client Credentials flow for Partner API access
 * 
 * Supports:
 * - Keycloak OAuth2 Client Credentials grant
 * - JWT token validation with proper claims
 * - Partner-scoped authorization (can only access their own source_id)
 * - Rate limiting per partner client
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { config } from '../config';
import { logger } from '../utils/logger';
import { pool } from '../database';

export interface PartnerAuthRequest extends Request {
  partner?: {
    clientId: string;
    sourceIds: string[]; // Sources this partner can access
    tier: string;
    rateLimitKey: string;
  };
  clientInfo?: {
    clientId: string;
    sub: string;
    aud: string;
    iss: string;
    scope: string[];
  };
}

interface KeycloakJwtPayload {
  sub: string; // client ID
  aud: string | string[];
  iss: string;
  iat: number;
  exp: number;
  azp?: string; // authorized party (client ID)
  scope?: string;
  client_id?: string;
  resource_access?: {
    [key: string]: {
      roles: string[];
    };
  };
  // Custom claims for partner context
  partner_tier?: string;
  allowed_sources?: string[];
}

// JWKS client for token verification
const jwksClientInstance = jwksClient({
  // Full Keycloak certs URL. Was `${realm}/protocol/openid_connect/certs` — the realm
  // NAME used as a URL base + an underscore in `openid_connect` — so every partner
  // (/ingestion) OAuth2 token failed JWKS verification. Mirror auth.ts's correct URL.
  jwksUri: `${config.keycloak.url}/realms/${config.keycloak.realm}/protocol/openid-connect/certs`,
  cache: true,
  cacheMaxAge: 1000 * 60 * 60, // 1 hour
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

/**
 * Get signing key from Keycloak JWKS endpoint
 */
function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  jwksClientInstance.getSigningKey(header.kid!, (err, key) => {
    if (err) {
      return callback(err);
    }
    callback(null, key?.getPublicKey());
  });
}

/**
 * Partner API authentication middleware
 * Validates OAuth2 Client Credentials tokens from Keycloak
 */
export function authenticatePartner() {
  return async (req: PartnerAuthRequest, res: Response, next: NextFunction) => {
    try {
      // Extract Bearer token
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Missing or invalid Authorization header. Use: Bearer <token>',
          code: 'MISSING_TOKEN'
        });
      }

      const token = authHeader.split(' ')[1];
      if (!token) {
        return res.status(401).json({
          success: false,
          error: 'Invalid token format',
          code: 'INVALID_TOKEN'
        });
      }

      // Verify JWT token with Keycloak public key
      const decoded = await new Promise<KeycloakJwtPayload>((resolve, reject) => {
        jwt.verify(token, getKey, {
          audience: config.keycloak.clientId,
          issuer: config.keycloak.realm,
          algorithms: ['RS256']
        }, (err, decoded) => {
          if (err) {
            reject(err);
          } else {
            resolve(decoded as KeycloakJwtPayload);
          }
        });
      });

      // Validate required claims
      if (!decoded.sub || !decoded.client_id) {
        return res.status(401).json({
          success: false,
          error: 'Invalid token claims. Missing client_id or sub.',
          code: 'INVALID_CLAIMS'
        });
      }

      // Check token is for client credentials flow (service account)
      const scopes = decoded.scope?.split(' ') || [];
      if (!scopes.includes('api:ingest')) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient scope. Required: api:ingest',
          code: 'INSUFFICIENT_SCOPE'
        });
      }

      const clientId = decoded.client_id || decoded.sub;

      // Fetch partner's allowed data sources from database
      const partnerQuery = `
        SELECT ds.id, ds.name, ds.tier, ds.is_active
        FROM data_sources ds
        WHERE ds.partner_client_id = $1
        AND ds.is_active = true
        AND 'api_push' = ANY(ds.delivery_channels)
      `;

      const partnerResult = await pool.query(partnerQuery, [clientId]);
      
      if (partnerResult.rows.length === 0) {
        logger.warn('Partner client has no authorized data sources', {
          clientId,
          ip: req.ip
        });

        return res.status(403).json({
          success: false,
          error: 'No authorized data sources for this partner client',
          code: 'NO_AUTHORIZED_SOURCES'
        });
      }

      // Build partner context
      const sourceIds = partnerResult.rows.map(row => row.id);
      const tier = partnerResult.rows[0].tier; // Assume single tier per partner

      req.partner = {
        clientId,
        sourceIds,
        tier,
        rateLimitKey: `partner:${clientId}`
      };

      req.clientInfo = {
        clientId,
        sub: decoded.sub,
        aud: Array.isArray(decoded.aud) ? decoded.aud[0] : decoded.aud,
        iss: decoded.iss,
        scope: scopes
      };

      logger.info('Partner authenticated successfully', {
        clientId,
        sourceIds: sourceIds.length,
        tier,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });

      next();

    } catch (error) {
      logger.warn('Partner authentication failed', {
        error: error instanceof Error ? error.message : String(error),
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });

      if (error instanceof jwt.TokenExpiredError) {
        return res.status(401).json({
          success: false,
          error: 'Token has expired',
          code: 'TOKEN_EXPIRED'
        });
      }

      if (error instanceof jwt.JsonWebTokenError) {
        return res.status(401).json({
          success: false,
          error: 'Invalid token',
          code: 'INVALID_TOKEN'
        });
      }

      return res.status(401).json({
        success: false,
        error: 'Authentication failed',
        code: 'AUTH_FAILED'
      });
    }
  };
}

/**
 * Authorization middleware - ensures partner can only access their own sources
 */
export function authorizeSource() {
  return (req: PartnerAuthRequest, res: Response, next: NextFunction) => {
    try {
      const sourceId = req.body?.source_id || req.params?.source_id;
      
      if (!sourceId) {
        return res.status(400).json({
          success: false,
          error: 'source_id is required',
          code: 'MISSING_SOURCE_ID'
        });
      }

      if (!req.partner?.sourceIds.includes(sourceId)) {
        logger.warn('Partner attempted to access unauthorized source', {
          clientId: req.partner?.clientId,
          requestedSourceId: sourceId,
          authorizedSources: req.partner?.sourceIds,
          ip: req.ip
        });

        return res.status(403).json({
          success: false,
          error: 'Access denied to the specified data source',
          code: 'SOURCE_ACCESS_DENIED'
        });
      }

      next();
    } catch (error) {
      logger.error('Authorization error', {
        error: error instanceof Error ? error.message : String(error),
        clientId: req.partner?.clientId
      });

      return res.status(500).json({
        success: false,
        error: 'Authorization check failed',
        code: 'AUTHORIZATION_ERROR'
      });
    }
  };
}

/**
 * Simple rate limiting for partner API calls
 * Industry standard: 1000 requests per hour per client
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export function partnerRateLimit() {
  return (req: PartnerAuthRequest, res: Response, next: NextFunction) => {
    const key = req.partner?.rateLimitKey || req.ip || 'unknown';
    const now = Date.now();
    const windowMs = 60 * 60 * 1000; // 1 hour
    const limit = 1000; // requests per hour

    const record = rateLimitStore.get(key);
    
    if (!record || now > record.resetTime) {
      // New window
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + windowMs
      });
      
      res.set({
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': (limit - 1).toString(),
        'X-RateLimit-Reset': new Date(now + windowMs).toISOString()
      });
      
      return next();
    }

    if (record.count >= limit) {
      logger.warn('Partner rate limit exceeded', {
        clientId: req.partner?.clientId,
        key,
        count: record.count
      });

      res.set({
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': new Date(record.resetTime).toISOString()
      });

      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded. Try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retry_after: Math.ceil((record.resetTime - now) / 1000)
      });
    }

    // Increment counter
    record.count++;
    rateLimitStore.set(key, record);

    res.set({
      'X-RateLimit-Limit': limit.toString(),
      'X-RateLimit-Remaining': (limit - record.count).toString(),
      'X-RateLimit-Reset': new Date(record.resetTime).toISOString()
    });

    next();
  };
}