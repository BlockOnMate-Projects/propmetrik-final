/**
 * Developer Portal API — the subscriber-facing `/developers` console.
 *
 * Session-authenticated (Keycloak) endpoints an org uses to self-serve API keys,
 * inspect usage, and see its plan/quota. All routes are scoped to the caller's
 * organization and require the org to hold at least one active API-product
 * subscription (analytics / market_intelligence / short_stay). Key MUTATIONS
 * additionally require org leadership (owner/admin/staff or an analytics
 * service_admin).
 *
 * These are distinct from the raw `pmk_` key auth used by the analytics API
 * itself (see middleware/analyticsApiAccess) and from the firm-role-gated
 * `/enterprise/api-keys` routes. The underlying key CRUD is shared
 * (orgSettingsService), so keys created here work at both surfaces.
 *
 * Mounted at /api/v1/developers (+ /api/developers) behind `authenticate`.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireServiceRole, orgHasService } from '../middleware/serviceAccess';
import {
  listApiKeys,
  createApiKey,
  revokeApiKey,
  rotateApiKey,
} from '../services/valuation-engine/orgSettingsService';
import {
  API_PRODUCTS,
  defaultLimitsForTier,
  resolveOrgApiTier,
  getOrgUsageSummary,
  getOrgUsageDaily,
  getOrgUsageByEndpoint,
  getOrgUsageByKey,
  getOrgEntitlements,
  getOrgWsUsageSummary,
  wsConnectionLimitForTier,
} from '../services/analytics/developerPortalService';
import { productForChannel, publishAnalyticsUpdate, STREAM_CHANNELS } from '../services/analytics/analyticsStreamPublisher';
import { resolveSnapshot } from '../services/analytics/analyticsStreamSnapshots';
import { analyticsStreamServer } from '../services/analytics/analyticsStreamServer';
import { logger } from '../utils/logger';

const router = Router();

function orgIdOf(req: Request): string | null {
  return (req as any).user?.organizationId || (req as any).user?.organization_id || null;
}
function userIdOf(req: Request): string | null {
  return (req as any).user?.id || (req as any).user?.sub || null;
}

/**
 * Gate: the org must hold at least one active API-product subscription. This is
 * the paid wall for the whole console (read included) — an unentitled org gets a
 * clean upsell 403 rather than empty data.
 */
async function requireApiProductAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const orgId = orgIdOf(req);
  if (!orgId) {
    res.status(400).json({ error: 'No organization context' });
    return;
  }
  try {
    for (const product of API_PRODUCTS) {
      if (await orgHasService(orgId, product)) return next();
    }
  } catch (err: any) {
    logger.error('requireApiProductAccess failed', { orgId, error: err?.message });
    res.status(500).json({ error: 'Entitlement check failed' });
    return;
  }
  res.status(403).json({
    error: 'Subscription required',
    message: 'Your organization needs an active subscription to an analytics API product to use the developer portal.',
    products: API_PRODUCTS,
  });
}

// Mutations must be performed by org leadership (owner/admin/staff) or an
// analytics service_admin. `requireServiceRole` bypasses for leadership + staff.
const requireKeyManager = requireServiceRole('analytics', ['service_admin']);

router.use(requireApiProductAccess);

// ── Keys ─────────────────────────────────────────────────────────────────────

router.get('/keys', async (req: Request, res: Response) => {
  try {
    const orgId = orgIdOf(req)!;
    res.json({ success: true, data: await listApiKeys(orgId) });
  } catch (err: any) {
    logger.error('developer/keys list failed', { error: err?.message });
    res.status(500).json({ error: 'Failed to list API keys' });
  }
});

router.post('/keys', requireKeyManager, async (req: Request, res: Response) => {
  try {
    const orgId = orgIdOf(req)!;
    const userId = userIdOf(req);
    if (!userId) return res.status(400).json({ error: 'No user context' });

    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'A key name is required' });
    if (name.length > 100) return res.status(400).json({ error: 'Key name too long (max 100)' });

    // Scopes: default to read; only accept known grants.
    let scopes: string[] = ['read'];
    if (Array.isArray(req.body?.scopes) && req.body.scopes.length > 0) {
      const allowed = new Set(['read', ...API_PRODUCTS, ...API_PRODUCTS.map((p) => `${p}:read`)]);
      scopes = req.body.scopes.filter((s: unknown) => typeof s === 'string' && allowed.has(s));
      if (scopes.length === 0) return res.status(400).json({ error: 'No valid scopes provided' });
    }

    // Rate limits follow the org's highest API tier — real, enforced ceilings.
    const tier = await resolveOrgApiTier(orgId);
    const limits = defaultLimitsForTier(tier);
    const expires_at = typeof req.body?.expires_at === 'string' ? req.body.expires_at : undefined;

    const key = await createApiKey(orgId, name, userId, {
      scopes,
      rate_limit_per_minute: limits.per_minute,
      rate_limit_per_day: limits.per_day,
      expires_at,
    });

    logger.info('developer API key created', { orgId, keyId: key.id, prefix: key.key_prefix, tier });
    // ⚠️ Full key returned ONLY here, never stored in plaintext.
    res.status(201).json({ success: true, data: key });
  } catch (err: any) {
    logger.error('developer/keys create failed', { error: err?.message });
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

router.post('/keys/:id/rotate', requireKeyManager, async (req: Request, res: Response) => {
  try {
    const orgId = orgIdOf(req)!;
    const userId = userIdOf(req);
    if (!userId) return res.status(400).json({ error: 'No user context' });
    const newKey = await rotateApiKey(req.params.id, orgId, userId);
    logger.info('developer API key rotated', { orgId, keyId: req.params.id });
    res.json({ success: true, data: newKey });
  } catch (err: any) {
    if (err?.message?.includes('not found')) return res.status(404).json({ error: err.message });
    logger.error('developer/keys rotate failed', { error: err?.message });
    res.status(500).json({ error: 'Failed to rotate API key' });
  }
});

router.delete('/keys/:id', requireKeyManager, async (req: Request, res: Response) => {
  try {
    const orgId = orgIdOf(req)!;
    const userId = userIdOf(req);
    if (!userId) return res.status(400).json({ error: 'No user context' });
    const revoked = await revokeApiKey(req.params.id, orgId, userId);
    if (!revoked) return res.status(404).json({ error: 'API key not found or already revoked' });
    logger.info('developer API key revoked', { orgId, keyId: req.params.id });
    res.json({ success: true });
  } catch (err: any) {
    logger.error('developer/keys revoke failed', { error: err?.message });
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

// ── Usage ────────────────────────────────────────────────────────────────────

function parseDays(req: Request): number {
  const raw = parseInt(String(req.query.days ?? '30'), 10);
  return Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 365) : 30;
}

router.get('/usage/summary', async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await getOrgUsageSummary(orgIdOf(req)!) });
  } catch (err: any) {
    logger.error('developer/usage summary failed', { error: err?.message });
    res.status(500).json({ error: 'Failed to load usage summary' });
  }
});

router.get('/usage/daily', async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await getOrgUsageDaily(orgIdOf(req)!, parseDays(req)) });
  } catch (err: any) {
    logger.error('developer/usage daily failed', { error: err?.message });
    res.status(500).json({ error: 'Failed to load daily usage' });
  }
});

router.get('/usage/by-endpoint', async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await getOrgUsageByEndpoint(orgIdOf(req)!, parseDays(req)) });
  } catch (err: any) {
    logger.error('developer/usage by-endpoint failed', { error: err?.message });
    res.status(500).json({ error: 'Failed to load endpoint usage' });
  }
});

router.get('/usage/by-key', async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await getOrgUsageByKey(orgIdOf(req)!, parseDays(req)) });
  } catch (err: any) {
    logger.error('developer/usage by-key failed', { error: err?.message });
    res.status(500).json({ error: 'Failed to load per-key usage' });
  }
});

// ── Plan / entitlements ──────────────────────────────────────────────────────

router.get('/entitlements', async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await getOrgEntitlements(orgIdOf(req)!) });
  } catch (err: any) {
    logger.error('developer/entitlements failed', { error: err?.message });
    res.status(500).json({ error: 'Failed to load entitlements' });
  }
});

// ── WebSocket streaming ──────────────────────────────────────────────────────

// Org-scoped streaming status for the console's WebSocket panel: live connection
// count, the tier connection cap, cumulative usage, and the channels this org may
// subscribe to (with an `entitled` flag).
router.get('/stream/status', async (req: Request, res: Response) => {
  try {
    const orgId = orgIdOf(req)!;
    const tier = await resolveOrgApiTier(orgId);
    const entitled: Record<string, boolean> = {};
    for (const product of API_PRODUCTS) entitled[product] = await orgHasService(orgId, product);
    const channels = STREAM_CHANNELS.map((c) => ({ ...c, entitled: entitled[c.product] === true }));
    res.json({
      success: true,
      data: {
        active_connections: analyticsStreamServer.activeConnectionsForOrg(orgId),
        max_connections: wsConnectionLimitForTier(tier),
        tier,
        usage: await getOrgWsUsageSummary(orgId),
        channels,
      },
    });
  } catch (err: any) {
    logger.error('developer/stream status failed', { error: err?.message });
    res.status(500).json({ error: 'Failed to load stream status' });
  }
});

/**
 * Force an immediate push of a channel's current value to its subscribers — a
 * "pull the latest now" utility (like resending a webhook). The caller's org
 * must be entitled to the channel's product. Publishes the REAL current snapshot
 * (never synthetic data).
 */
router.post('/stream/refresh', async (req: Request, res: Response) => {
  try {
    const orgId = orgIdOf(req)!;
    const channel = String(req.body?.channel || '').trim();
    const product = productForChannel(channel);
    if (!product) return res.status(400).json({ error: 'Unknown channel' });
    if (!(await orgHasService(orgId, product))) {
      return res.status(403).json({ error: 'Not entitled to this channel', product });
    }
    const data = await resolveSnapshot(channel);
    if (data == null) return res.status(404).json({ error: 'No current data for this channel' });
    await publishAnalyticsUpdate(channel, data, Date.now(), 'update');
    res.json({ success: true, channel });
  } catch (err: any) {
    logger.error('developer/stream refresh failed', { error: err?.message });
    res.status(500).json({ error: 'Failed to refresh channel' });
  }
});

export default router;
