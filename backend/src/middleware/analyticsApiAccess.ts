/**
 * Dual-auth gate for the public Analytics API.
 *
 * A single middleware that fronts the analytics / short-stay routers and accepts
 * EITHER:
 *   1. A subscriber API key  — `Authorization: Bearer pmk_…` — resolved against
 *      `org_api_keys`, gated on an active org-level analytics subscription, rate
 *      limited (Redis fixed-window), and metered per request; OR
 *   2. A Keycloak session    — any other Bearer token (or the local dev bypass) —
 *      handled by the existing `authenticate` + `requireServiceAccess` chain,
 *      i.e. byte-for-byte the behaviour the internal staff dashboards already rely
 *      on. The internal path is untouched — this is purely additive.
 *
 * Wire it in place of `authenticate, requireServiceAccess(serviceKey)` on a mount:
 *   app.use('/api/v1/analytics/platform', apiAccess('analytics'), platformRoutes)
 */

import { Request, Response, NextFunction } from 'express';
import { authenticate } from './auth';
import { requireServiceAccess, orgHasService } from './serviceAccess';
import {
  resolveApiKey,
  recordApiKeyRequest,
  ResolvedApiKey,
} from '../services/valuation-engine/orgSettingsService';
import { redisCache } from '../database/redis';
import { logger } from '../utils/logger';

const API_KEY_SCHEME = 'pmk_';

function extractBearer(req: Request): string | null {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice(7).trim() || null;
}

function clientIp(req: Request): string | null {
  const xff = (req.headers['x-forwarded-for'] as string) || '';
  const first = xff.split(',')[0]?.trim();
  return first || req.ip || null;
}

/** Normalised endpoint label for metering — strips the /api(/v1) mount + query. */
function meterEndpoint(req: Request): string {
  const path = (req.originalUrl || req.url).split('?')[0].replace(/^\/api(\/v1)?/, '');
  return `${req.method} ${path || '/'}`;
}

/**
 * Resolve the billable product for a request from its PATH, not from which mount
 * happened to match first.
 *
 * The analytics routers overlap: the broad `/analytics` mount runs its middleware
 * for `/analytics/market/*` too (Express prefix-matches). Deriving the service key
 * from the path guarantees each endpoint is gated against the product that is
 * actually sold for it (see platform_services / migration 212):
 *   - /analytics/market      → market_intelligence   (separately sold)
 *   - /short-stay            → short_stay            (separately sold)
 *   - everything else under /analytics (ml, platform, valuations, management, …)
 *                            → analytics
 * `fallback` is the mount's declared key, used only if the path matches none.
 */
export function productForRequest(req: Request, fallback: string): string {
  const path = (req.originalUrl || req.url).split('?')[0];
  if (/\/analytics\/market(\/|$|\?)/.test(path)) return 'market_intelligence';
  if (/\/short-stay(\/|$|\?)/.test(path)) return 'short_stay';
  if (/\/analytics(\/|$|\?)/.test(path)) return 'analytics';
  return fallback;
}

/**
 * A key is authorised for a service if its scopes include a matching grant.
 * Existing keys default to `['read']`, which is treated as full read access for
 * backward-compatibility; granular `service:read` scopes are also honoured.
 */
function hasScope(scopes: string[], serviceKey: string): boolean {
  if (!scopes || scopes.length === 0) return false;
  const grants = new Set(['*', 'read', serviceKey, `${serviceKey}:read`]);
  return scopes.some((s) => grants.has(s));
}

type RateResult = { allowed: boolean; scope?: 'minute' | 'day'; retryAfter?: number };

/**
 * Fixed-window per-minute + per-day rate limit via Redis INCR. Fails OPEN on a
 * Redis outage — a cache blip must not lock paid customers out of the API.
 */
async function checkRateLimit(
  keyId: string,
  perMinute: number,
  perDay: number
): Promise<RateResult> {
  try {
    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    const minuteBucket = `ratelimit:min:${keyId}:${Math.floor(nowMs / 60000)}`;
    const dayBucket = `ratelimit:day:${keyId}:${new Date(nowMs).toISOString().slice(0, 10)}`;

    const [minCount, dayCount] = await Promise.all([
      redisCache.incr(minuteBucket),
      redisCache.incr(dayBucket),
    ]);
    if (minCount === 1) await redisCache.expire(minuteBucket, 60);
    if (dayCount === 1) await redisCache.expire(dayBucket, 86_400);

    if (perMinute > 0 && minCount > perMinute) {
      return { allowed: false, scope: 'minute', retryAfter: 60 - (nowSec % 60) };
    }
    if (perDay > 0 && dayCount > perDay) {
      return { allowed: false, scope: 'day', retryAfter: 3600 };
    }
    return { allowed: true };
  } catch (err: any) {
    logger.warn('API rate-limit check failed — allowing request', { keyId, error: err?.message });
    return { allowed: true };
  }
}

/**
 * Build the dual-auth middleware for a given platform service key
 * (e.g. 'analytics', 'market_intelligence', 'short_stay').
 */
export function apiAccess(mountServiceKey: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Overlapping mounts (e.g. `/analytics` then `/analytics/platform`) invoke
    // this more than once per request. Once we've authenticated + entitled +
    // hooked metering, later passes are a no-op (avoids double-gating and
    // double-counting usage) — regardless of mount registration order.
    if ((req as any).__analyticsGated) return next();

    // Entitlement is derived from the PATH, not the mount, so `/analytics/market`
    // is always gated on `market_intelligence` even though the broad `/analytics`
    // mount's middleware runs first for it.
    const serviceKey = productForRequest(req, mountServiceKey);

    const token = extractBearer(req);

    // ── Internal / Keycloak branch (unchanged behaviour) ─────────────────────
    if (!token || !token.startsWith(API_KEY_SCHEME)) {
      return authenticate(req, res, (err?: any) => {
        if (err) return next(err);
        return requireServiceAccess(serviceKey)(req, res, (err2?: any) => {
          if (err2) return next(err2);
          (req as any).__analyticsGated = true;
          return next();
        });
      });
    }

    // ── Subscriber API-key branch ────────────────────────────────────────────
    let key: ResolvedApiKey | null;
    try {
      key = await resolveApiKey(token);
    } catch (err: any) {
      logger.error('resolveApiKey error', { error: err?.message });
      res.status(500).json({ error: 'Authentication error' });
      return;
    }

    if (!key) {
      res.status(401).json({
        error: 'Invalid API key',
        message: 'The provided API key is invalid, revoked, or expired.',
      });
      return;
    }

    const ip = clientIp(req);

    // Optional per-key IP allowlist
    if (key.allowedIps && key.allowedIps.length > 0) {
      if (!ip || !key.allowedIps.includes(ip)) {
        res.status(403).json({
          error: 'IP not allowed',
          message: 'This API key may only be used from allow-listed IP addresses.',
        });
        return;
      }
    }

    // Scope
    if (!hasScope(key.scopes, serviceKey)) {
      res.status(403).json({
        error: 'Insufficient scope',
        message: `This API key is not scoped for the ${serviceKey} API.`,
      });
      return;
    }

    // Paid-plan gate — org must hold an active subscription for this service.
    const entitled = await orgHasService(key.orgId, serviceKey);
    if (!entitled) {
      res.status(403).json({
        error: 'Subscription required',
        message: `Your organization does not have an active subscription for the ${serviceKey} API.`,
        serviceKey,
      });
      return;
    }

    // Rate limit
    const rl = await checkRateLimit(key.keyId, key.rateLimitPerMinute, key.rateLimitPerDay);
    if (!rl.allowed) {
      if (rl.retryAfter) res.setHeader('Retry-After', String(rl.retryAfter));
      // Meter the rejected request too — usage should reflect reality.
      void recordApiKeyRequest(key.keyId, meterEndpoint(req), 429, ip);
      res.status(429).json({
        error: 'Rate limit exceeded',
        message: `API rate limit exceeded (${rl.scope}). Please retry later.`,
      });
      return;
    }

    // Synthetic principal so downstream getAuthOrgId()/handlers work exactly as
    // they do under Keycloak auth — the org is the key's org.
    (req as any).user = {
      id: key.createdBy,
      sub: key.createdBy,
      organization_id: key.orgId,
      organizationId: key.orgId,
      userType: 'customer',
      realmRoles: [],
      clientRoles: [],
      isApiKey: true,
      apiKeyId: key.keyId,
    };
    (req as any).apiAuth = {
      keyId: key.keyId,
      orgId: key.orgId,
      scopes: key.scopes,
      name: key.name,
      serviceKey,
    };
    (req as any).__analyticsGated = true;

    // Meter on completion — captures the final status code + endpoint hit.
    const meteredKeyId = key.keyId;
    res.on('finish', () => {
      void recordApiKeyRequest(meteredKeyId, meterEndpoint(req), res.statusCode, ip);
    });

    return next();
  };
}

export default apiAccess;
