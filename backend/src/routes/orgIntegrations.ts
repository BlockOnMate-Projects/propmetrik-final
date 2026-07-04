/**
 * Shared Integrations Hub routes — the single org-wide surface behind every service's
 * "Integrations" tab (PM, CRM, Valuation, Projects). Unlike `app-integrations.ts` (which is
 * gated to `requireServiceAccess('projects')`), this router is mounted with only
 * `authenticate + requirePMAccess`, so the same catalog/connect/disconnect flow is reachable
 * from any service without a per-service entitlement.
 *
 * Two routers are exported:
 *   - default (authenticated)          → catalog, connections, connect, disconnect
 *   - integrationsPublicRouter (no auth)→ GET /oauth/callback  (providers redirect here without our Bearer)
 *
 * Connect dispatch by provider auth type (from integrationCatalog):
 *   oauth2  → returns { authUrl } for the client to redirect to
 *   api_key → persists a hashed key
 *   webhook → persists a webhook URL/secret/events
 *   managed → 400 (platform-managed; nothing for the org to connect)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getAuthOrgId, getAuthUserId, requirePMWrite, isOrgAdmin } from '../middleware/pmAuth';
import { getCatalog, getProvider, type ServiceKey } from '../services/integrations/integrationCatalog';
import {
  integrationConnectorService,
  IntegrationNotConfiguredError,
} from '../services/integrations/integrationConnectorService';
import * as quickbooksService from '../services/integrations/quickbooksService';
import * as xeroService from '../services/integrations/xeroService';
import * as tiktokService from '../services/integrations/tiktokService';
import * as metaService from '../services/integrations/metaService';
import * as socialMedia from '../services/integrations/socialMedia';
import * as twilioService from '../services/integrations/twilioService';
import { cloudStorageService } from '../services/integrations/cloudStorageService';
import { calendarSyncService } from '../services/integrations/calendarSyncService';
import { getFile } from '../database/minio';
import { logger } from '../utils/logger';

// Providers with a real sync adapter (approved project costs → accounting bills).
const SYNCABLE = new Set(['xero', 'quickbooks']);
// Providers that can publish a property listing to a social account.
const SHAREABLE = new Set(['tiktok', 'facebook', 'instagram']);
const META_PLATFORMS = new Set(['facebook', 'instagram']);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

/**
 * Who may manage an ORG-SHARED integration (byo_org / api_key / webhook — e.g. QuickBooks, Xero,
 * social, custom webhooks). These hold organization-wide credentials and can read/write company
 * financials, so they are restricted to org leadership + finance. Per-USER integrations (byo_user —
 * a user's own Gmail/Outlook/Drive/Calendar) are NOT gated here: any PM-write user connects their own.
 */
function canManageOrgIntegration(req: Request): boolean {
  if (isOrgAdmin(req)) return true; // staff leadership: super_admin/admin/firm_principal/manager
  const u = (req as any).user;
  const roles = [...(u?.realmRoles || []), ...(u?.clientRoles || [])];
  // finance_manager (accounting) + service_admin (a customer org's own admin).
  return roles.includes('finance_manager') || roles.includes('service_admin');
}

/**
 * Guard: for org-shared providers, require admin/finance. Returns false (and sends 403) when denied
 * so callers can `if (!ensureCanManage(req, res, type)) return;`. byo_user providers always pass.
 */
function ensureCanManage(req: Request, res: Response, type: string): boolean {
  const provider = getProvider(type);
  if (provider && provider.model !== 'byo_user' && !canManageOrgIntegration(req)) {
    res.status(403).json({
      success: false,
      error: `Only organization admins or finance managers can manage ${provider.name}.`,
      code: 'admin_required',
    });
    return false;
  }
  return true;
}

// ── Authenticated router ─────────────────────────────────────────────────────────────────────
const router = Router();

const VALID_SERVICES: ServiceKey[] = ['pm', 'crm', 'valuation', 'projects'];

/** Provider catalog (optionally scoped to a service tab), each tagged with runtime `configured`. */
router.get('/catalog', (req: Request, res: Response) => {
  const service = req.query.service as ServiceKey | undefined;
  const scoped = VALID_SERVICES.includes(service as ServiceKey) ? service : undefined;
  res.json({ success: true, data: getCatalog(scoped) });
});

/** This org's + this user's connected providers, keyed by provider type. */
router.get('/connections', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const connections = await integrationConnectorService.listConnections(orgId, userId);
    res.json({ success: true, data: connections });
  } catch (error) { next(error); }
});

/**
 * Connect a provider. Body shape depends on the provider's auth type:
 *   oauth2  → {}                                   → 200 { authUrl }
 *   api_key → { apiKey, name?, config? }           → 200 { connected: true }
 *   webhook → { url, secret?, events? }            → 200 { connected: true }
 */
router.post('/:type/connect', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { type } = req.params;

    const provider = getProvider(type);
    if (!provider) return res.status(404).json({ success: false, error: 'Unknown integration provider' });
    if (!provider.connectable) {
      const reason = provider.model === 'platform'
        ? `${provider.name} is platform-managed and cannot be connected per-organisation.`
        : `${provider.name} is not yet available to connect.`;
      return res.status(400).json({ success: false, error: reason });
    }
    if (!ensureCanManage(req, res, type)) return;

    switch (provider.auth) {
      case 'oauth2': {
        const authUrl = integrationConnectorService.buildAuthUrl(type, orgId, userId);
        return res.json({ success: true, data: { authUrl } });
      }
      case 'api_key': {
        // Twilio is a multi-field BYO credential (SID + Auth Token + From number) whose Auth Token
        // must be readable to send SMS, so it uses its own encrypted store — not the hash path.
        if (type === 'twilio') {
          const { accountSid, authToken, fromNumber } = req.body || {};
          if (!accountSid || !authToken || !fromNumber) {
            return res.status(400).json({ success: false, error: 'accountSid, authToken and fromNumber are required' });
          }
          // Surface validation / Twilio-rejection / missing-secret messages to the user as a clean 400
          // (rather than letting them fall through to the generic 500 error handler).
          try {
            const r = await twilioService.connect(orgId, { accountSid, authToken, fromNumber }, userId);
            return res.json({ success: true, data: { connected: true, ...r } });
          } catch (e: any) {
            return res.status(400).json({ success: false, error: e?.message || 'Could not connect Twilio' });
          }
        }
        const { apiKey, name, config } = req.body || {};
        if (!apiKey || typeof apiKey !== 'string') return res.status(400).json({ success: false, error: 'apiKey is required' });
        await integrationConnectorService.saveApiKey(orgId, type, { apiKey, name, config, createdBy: userId });
        return res.json({ success: true, data: { connected: true } });
      }
      case 'webhook': {
        const { url, secret, events } = req.body || {};
        if (!url || typeof url !== 'string') return res.status(400).json({ success: false, error: 'url is required' });
        await integrationConnectorService.saveWebhook(orgId, type, { url, secret, events, createdBy: userId });
        return res.json({ success: true, data: { connected: true } });
      }
      default:
        return res.status(400).json({ success: false, error: `Provider "${type}" has no connectable auth flow.` });
    }
  } catch (error) {
    if (error instanceof IntegrationNotConfiguredError) {
      return res.status(409).json({ success: false, error: error.message, code: 'not_configured' });
    }
    next(error);
  }
});

/** Live connection test — hits the provider API with the stored (auto-refreshed) token. */
router.post('/:type/test', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { type } = req.params;
    if (!ensureCanManage(req, res, type)) return;
    if (type === 'quickbooks') {
      const info = await quickbooksService.getCompanyInfo(orgId);
      return res.json({ success: true, data: { ok: true, detail: `Connected to ${info.companyName}` } });
    }
    if (type === 'xero') {
      const info = await xeroService.testXeroConnection(orgId);
      return res.json({ success: true, data: { ok: true, detail: `Connected to ${info.organisationName}` } });
    }
    if (type === 'twilio') {
      const r = await twilioService.testConnection(orgId);
      return res.json({ success: true, data: r });
    }
    if (type === 'onedrive' || type === 'google_drive') {
      const userId = getAuthUserId(req);
      const r = await cloudStorageService.testConnection(userId, type);
      return res.json({ success: true, data: r });
    }
    if (type === 'google_calendar' || type === 'outlook') {
      const userId = getAuthUserId(req);
      const r = await calendarSyncService.testConnection(userId, type);
      return res.json({ success: true, data: r });
    }
    if (type === 'tiktok') {
      const info = await tiktokService.queryCreatorInfo(orgId);
      return res.json({ success: true, data: { ok: true, detail: `Connected as @${info.creatorUsername}` } });
    }
    if (META_PLATFORMS.has(type)) {
      const r = await metaService.testConnection(orgId, type as metaService.MetaPlatform);
      return res.json({ success: true, data: r });
    }
    return res.status(400).json({ success: false, error: `Connection test not available for "${type}".` });
  } catch (error: any) {
    return res.status(502).json({ success: false, error: error?.message || 'Connection test failed' });
  }
});

/** Push approved project costs to the connected accounting provider. */
router.post('/:type/sync', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { type } = req.params;
    if (!ensureCanManage(req, res, type)) return;
    if (!SYNCABLE.has(type)) {
      return res.status(400).json({ success: false, error: `Sync is not supported for "${type}" yet.` });
    }
    const result = type === 'quickbooks'
      ? await quickbooksService.syncAllApprovedCosts(orgId)
      : await xeroService.syncAllApprovedCosts(orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(502).json({ success: false, error: error?.message || 'Sync failed' });
  }
});

// ── Social publishing (TikTok) ────────────────────────────────────────────────────────────────

/** Creator info for a connected social account — used to show allowed privacy levels before posting. */
router.get('/:type/creator-info', async (req: Request, res: Response) => {
  try {
    const orgId = getAuthOrgId(req);
    const { type } = req.params;
    if (type !== 'tiktok') return res.status(400).json({ success: false, error: `No creator info for "${type}".` });
    const info = await tiktokService.queryCreatorInfo(orgId);
    res.json({ success: true, data: info });
  } catch (error: any) {
    res.status(502).json({ success: false, error: error?.message || 'Could not load creator info' });
  }
});

/** Publish a property listing to the connected social account. */
router.post('/:type/share', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { type } = req.params;
    if (!SHAREABLE.has(type)) return res.status(400).json({ success: false, error: `Sharing is not supported for "${type}" yet.` });
    const { propertyId, caption, privacy, disableComment } = req.body || {};
    if (!propertyId) return res.status(400).json({ success: false, error: 'propertyId is required' });
    const result = META_PLATFORMS.has(type)
      ? await metaService.shareProperty(orgId, type as metaService.MetaPlatform, propertyId, { caption, createdBy: userId })
      : await tiktokService.shareProperty(orgId, propertyId, { caption, privacy, disableComment, createdBy: userId });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(502).json({ success: false, error: error?.message || 'Share failed' });
  }
});

/** Poll the status of a social publish job. */
router.get('/:type/share/:publishId/status', async (req: Request, res: Response) => {
  try {
    const orgId = getAuthOrgId(req);
    const { type, publishId } = req.params;
    if (type !== 'tiktok') return res.status(400).json({ success: false, error: `No status for "${type}".` });
    const r = await tiktokService.fetchPublishStatus(orgId, publishId);
    res.json({ success: true, data: r });
  } catch (error: any) {
    res.status(502).json({ success: false, error: error?.message || 'Could not fetch status' });
  }
});

/** Recent social posts for the org (optionally filtered to one property). Any shareable platform. */
router.get('/:type/posts', async (req: Request, res: Response) => {
  try {
    const orgId = getAuthOrgId(req);
    const { type } = req.params;
    if (!SHAREABLE.has(type)) return res.status(400).json({ success: false, error: `No posts for "${type}".` });
    const rows = await socialMedia.listRecentPosts(orgId, type, req.query.propertyId as string | undefined);
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(502).json({ success: false, error: error?.message || 'Could not load posts' });
  }
});

/**
 * Push a document to the user's connected cloud storage (Drive/OneDrive).
 * Body: { bucket, key } (internal MinIO object) OR { sourceUrl }, + optional { provider, name, mimeType }.
 * Provider auto-resolves to whichever storage the user connected.
 */
router.post('/storage/push', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const { bucket, key, sourceUrl } = req.body || {};
    let { provider, name, mimeType } = req.body || {};
    if ((!bucket || !key) && !sourceUrl) {
      return res.status(400).json({ success: false, error: 'Provide { bucket, key } or { sourceUrl }.' });
    }
    if (!provider) provider = await cloudStorageService.getConnectedStorageProvider(userId);
    if (!provider) return res.status(409).json({ success: false, error: 'No cloud storage connected — connect Google Drive or OneDrive first.', code: 'not_connected' });

    let data: Buffer;
    if (bucket && key) {
      const f = await getFile(bucket, key);
      data = Buffer.from(f.body);
      mimeType = mimeType || f.contentType || 'application/octet-stream';
      name = name || String(key).split('/').pop();
    } else {
      const r = await fetch(sourceUrl);
      if (!r.ok) throw new Error(`Could not fetch source document (${r.status})`);
      data = Buffer.from(await r.arrayBuffer());
      mimeType = mimeType || r.headers.get('content-type') || 'application/octet-stream';
      name = name || String(sourceUrl).split('/').pop()?.split('?')[0] || 'document';
    }
    const result = await cloudStorageService.uploadDocument(userId, provider, { name, data, mimeType });
    res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(502).json({ success: false, error: error?.message || 'Save to cloud failed' });
  }
});

/**
 * Push an event to the user's connected calendar (Google Calendar / Outlook).
 * Body: { title, start, end, description?, location?, attendees?, timeZone?, provider? }.
 */
router.post('/calendar/push', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const { title, start, end, description, location, attendees, timeZone } = req.body || {};
    let { provider } = req.body || {};
    if (!title || !start || !end) return res.status(400).json({ success: false, error: 'title, start and end are required' });
    if (!provider) provider = await calendarSyncService.getConnectedCalendarProvider(userId);
    if (!provider) return res.status(409).json({ success: false, error: 'No calendar connected — connect Google Calendar or Outlook first.', code: 'not_connected' });
    const result = await calendarSyncService.pushEvent(userId, provider, { title, start, end, description, location, attendees, timeZone });
    res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(502).json({ success: false, error: error?.message || 'Add to calendar failed' });
  }
});

/** Disconnect a provider for the org (and this user's per-user row, for byo_user providers). */
router.delete('/:type', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { type } = req.params;
    if (!getProvider(type)) return res.status(404).json({ success: false, error: 'Unknown integration provider' });
    if (!ensureCanManage(req, res, type)) return;
    await integrationConnectorService.disconnect(orgId, type, userId);
    res.json({ success: true, data: { disconnected: true } });
  } catch (error) { next(error); }
});

// ── Public callback router (no auth — providers redirect here without our Bearer token) ────────
const integrationsPublicRouter = Router();

integrationsPublicRouter.get('/oauth/callback', async (req: Request, res: Response) => {
  const { code, state, error: oauthError, error_description: oauthErrorDesc, realmId } = req.query as Record<string, string>;
  const fail = (reason: string) =>
    res.redirect(`${FRONTEND_URL}/dashboard/integrations?error=${encodeURIComponent(reason.slice(0, 600))}`);
  try {
    if (oauthError) {
      // The provider rejected the authorize request. error_description carries the real reason
      // (e.g. Microsoft's AADSTS code) — log it and surface it so the failure is diagnosable.
      logger.error('[orgIntegrations] OAuth provider returned an error', { error: oauthError, description: oauthErrorDesc });
      return fail(oauthErrorDesc ? `${oauthError}: ${oauthErrorDesc}` : oauthError);
    }
    if (!code || !state) return fail('missing_code_or_state');
    // `realmId` is present only on the QuickBooks (Intuit) callback — the company id.
    const { redirect } = await integrationConnectorService.handleCallback(code, state, { realmId });
    return res.redirect(redirect);
  } catch (error: any) {
    logger.error('[orgIntegrations] OAuth callback failed', { message: error?.message });
    return fail('connection_failed');
  }
});

export default router;
export { integrationsPublicRouter };
