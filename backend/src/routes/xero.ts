/**
 * Xero OAuth2 + Cost Sync Routes
 *
 * GET  /api/v1/xero/auth         → Redirect to Xero OAuth2 consent screen
 * GET  /api/v1/xero/callback     → Exchange code for tokens, store, redirect to frontend
 * GET  /api/v1/xero/status       → Connection status for the authenticated org
 * DELETE /api/v1/xero/disconnect → Revoke tokens and set integration inactive
 * POST /api/v1/xero/sync/costs   → Manually trigger cost sync to Xero
 */

import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import {
  getXeroIntegration,
  upsertXeroIntegration,
  deactivateXeroIntegration,
  syncAllApprovedCosts,
  XeroTokens,
} from '../services/integrations/xeroService';
import { getAuthUserId, getAuthOrgId } from '../middleware/pmAuth';

/** Protected routes (require authenticate middleware from index.ts) */
const router = Router();
/** Public routes — no auth (OAuth callback redirected from Xero) */
export const xeroPublicRouter = Router();

const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID || '';
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET || '';
const XERO_REDIRECT_URI = process.env.XERO_REDIRECT_URI || `${process.env.APP_URL || 'http://localhost:4000'}/api/v1/xero/callback`;
const XERO_SCOPES = 'openid profile email accounting.transactions accounting.contacts accounting.settings offline_access';
const XERO_AUTH_URL = 'https://login.xero.com/identity/connect/authorize';
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Simple in-memory state store (sufficient for OAuth CSRF protection)
// In a multi-instance deployment, replace with Redis
const oauthStateStore = new Map<string, { orgId: string; userId: string; createdAt: number }>();

// Cleanup stale states every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, v] of oauthStateStore.entries()) {
    if (v.createdAt < cutoff) oauthStateStore.delete(k);
  }
}, 10 * 60 * 1000);

// ─── Auth Start ───────────────────────────────────────────────────────────────

router.get('/xero/auth', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);

    const state = crypto.randomBytes(16).toString('hex');
    oauthStateStore.set(state, { orgId, userId, createdAt: Date.now() });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: XERO_CLIENT_ID,
      redirect_uri: XERO_REDIRECT_URI,
      scope: XERO_SCOPES,
      state,
    });

    res.redirect(`${XERO_AUTH_URL}?${params.toString()}`);
  } catch (err) { next(err); }
});

// ─── OAuth Callback (public — no auth middleware) ─────────────────────────────

xeroPublicRouter.get('/xero/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, state, error } = req.query as { code?: string; state?: string; error?: string };

    if (error) {
      return res.redirect(`${FRONTEND_URL}/dashboard/projects/integrations-marketplace?xero=error&reason=${encodeURIComponent(error)}`);
    }

    if (!state || !oauthStateStore.has(state)) {
      return res.redirect(`${FRONTEND_URL}/dashboard/projects/integrations-marketplace?xero=error&reason=invalid_state`);
    }

    const { orgId, userId } = oauthStateStore.get(state)!;
    oauthStateStore.delete(state);

    if (!code) {
      return res.redirect(`${FRONTEND_URL}/dashboard/projects/integrations-marketplace?xero=error&reason=no_code`);
    }

    // Exchange code for tokens
    const tokenRes = await fetch(XERO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: XERO_REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('Xero token exchange failed:', errText);
      return res.redirect(`${FRONTEND_URL}/dashboard/projects/integrations-marketplace?xero=error&reason=token_exchange`);
    }

    const tokens = (await tokenRes.json()) as XeroTokens;
    tokens.obtained_at = Date.now();

    // Fetch Xero tenant (connection) info
    try {
      const connRes = await fetch(XERO_CONNECTIONS_URL, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (connRes.ok) {
        const connections = (await connRes.json()) as Array<{ tenantId: string; tenantName: string }>;
        if (connections.length > 0) {
          tokens.tenant_id = connections[0].tenantId;
          tokens.tenant_name = connections[0].tenantName;
        }
      }
    } catch {
      // Non-fatal: tenant info will be missing but tokens are still stored
    }

    await upsertXeroIntegration(orgId, userId, tokens);

    res.redirect(`${FRONTEND_URL}/dashboard/projects/integrations-marketplace?xero=connected`);
  } catch (err) { next(err); }
});

// ─── Status ───────────────────────────────────────────────────────────────────

router.get('/xero/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const integration = await getXeroIntegration(orgId);

    if (!integration) {
      return res.json({ success: true, data: { connected: false } });
    }

    const tokens = integration.config as XeroTokens;
    res.json({
      success: true,
      data: {
        connected: true,
        tenantName: tokens.tenant_name || null,
        tenantId: tokens.tenant_id || null,
        lastSyncAt: integration.last_sync_at,
        status: integration.status,
      },
    });
  } catch (err) { next(err); }
});

// ─── Disconnect ───────────────────────────────────────────────────────────────

router.delete('/xero/disconnect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    await deactivateXeroIntegration(orgId);
    res.json({ success: true, message: 'Xero disconnected' });
  } catch (err) { next(err); }
});

// ─── Manual Sync ──────────────────────────────────────────────────────────────

router.post('/xero/sync/costs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const result = await syncAllApprovedCosts(orgId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

export default router;
