/**
 * Integration Connector Service — provider-agnostic BYO connect/callback/refresh.
 *
 * Credential-ready framework: every OAuth provider is defined by config (auth/token URLs, scopes,
 * env var names for the platform-registered OAuth *app*). Adding a provider's real client id/secret
 * to env is the ONLY step needed to make its Connect button work end-to-end — no code change.
 *
 * Storage (per §8A model, from integrationCatalog):
 *   - byo_org  OAuth / api_key / webhook → `integrations` row  (organization_id)
 *   - byo_user OAuth                     → `user_integrations` row (user_id)
 *
 * A SINGLE generic callback URL (`<APP_URL>/api/v1/integrations/oauth/callback`) serves every
 * provider — the provider is carried in the signed `state`, so you register one redirect URI per
 * OAuth app. Not-configured providers throw a typed error so the UI shows "requires setup", never
 * a dead-end.
 */

import crypto from 'crypto';
import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { getProvider, type IntegrationProvider } from './integrationCatalog';

const APP_URL = process.env.APP_URL || 'http://localhost:4000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
// Mounted at /org-integrations (NOT /integrations — that path is taken by the MoMo/bank admin routes).
export const OAUTH_CALLBACK_PATH = '/api/v1/org-integrations/oauth/callback';
const STATE_SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'integration-state-dev-secret';
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class IntegrationNotConfiguredError extends Error {
  code = 'not_configured' as const;
  constructor(public provider: string) {
    super(`Integration "${provider}" is not configured — the platform OAuth app credentials are not set.`);
  }
}

/** One entry per OAuth *app* (multiple providers can share an app, e.g. Google → gmail/calendar/drive). */
interface OAuthApp {
  authUrl: string;
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  tokenAuth: 'body' | 'basic';        // where client creds go in the token exchange
  extraAuthParams?: Record<string, string>;
  clientIdParam?: string;             // param name for the client id (default 'client_id'; TikTok uses 'client_key')
  scopeSeparator?: string;            // authorize-URL scope delimiter (default ' '; TikTok uses ',')
  pkce?: 's256' | 's256_hex';         // PKCE required? 's256' = base64url challenge (X); 's256_hex' = hex challenge (TikTok)
  longLived?: 'fb';                   // Meta: exchange the short-lived token for a ~60-day long-lived one at callback
}

// clientIdEnv/clientSecretEnv are '|'-separated candidate names — the first one set in env
// wins (see firstEnv below). This tolerates naming drift across deployments (AUTH_GOOGLE_ID
// vs GOOGLE_CLIENT_ID, XERO_CLIENT_ID vs CLIENT_XERO_ID, …) so whichever the env uses works.
const OAUTH_APPS: Record<string, OAuthApp> = {
  // GOOGLE_CLIENT_ID first: that's the backend drive/calendar/Gmail app (its GCP config has
  // this API's OAuth callback registered). AUTH_GOOGLE_ID is the FRONTEND auth app — on the
  // backend it exists only so /auth/google accepts frontend-issued id_tokens; BYO OAuth must
  // not use it.
  google:    { authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', clientIdEnv: 'GOOGLE_CLIENT_ID|AUTH_GOOGLE_ID', clientSecretEnv: 'GOOGLE_CLIENT_SECRET|AUTH_GOOGLE_SECRET', tokenAuth: 'body', extraAuthParams: { access_type: 'offline', prompt: 'consent' } },
  // `/organizations` (work/school accounts in ANY tenant) — matches the app's "Accounts in any
  // organizational directory (Multitenant)" audience. NOT `/common`: a single-tenant app on /common
  // throws AADSTS50194, and /common also admits personal MSAs which can't grant the app-only perms
  // the shared mail daemon relies on. BYO customers connect their own M365 tenants → multitenant.
  microsoft: { authUrl: 'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize', tokenUrl: 'https://login.microsoftonline.com/organizations/oauth2/v2.0/token', clientIdEnv: 'MS_GRAPH_CLIENT_ID|MS_CLIENT_ID', clientSecretEnv: 'MS_GRAPH_CLIENT_SECRET|MS_CLIENT_SECRET', tokenAuth: 'body' },
  meta:      { authUrl: 'https://www.facebook.com/v21.0/dialog/oauth', tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token', clientIdEnv: 'META_APP_ID|CLIENT_META_ID|FACEBOOK_APP_ID', clientSecretEnv: 'META_APP_SECRET|CLIENT_META_SECRET|FACEBOOK_APP_SECRET', tokenAuth: 'body', longLived: 'fb' },
  tiktok:    { authUrl: 'https://www.tiktok.com/v2/auth/authorize/', tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/', clientIdEnv: 'TIKTOK_CLIENT_KEY|CLIENT_TIKTOK_ID', clientSecretEnv: 'TIKTOK_CLIENT_SECRET|CLIENT_TIKTOK_SECRET', tokenAuth: 'body', clientIdParam: 'client_key', scopeSeparator: ',', pkce: 's256_hex' },
  linkedin:  { authUrl: 'https://www.linkedin.com/oauth/v2/authorization', tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken', clientIdEnv: 'LINKEDIN_CLIENT_ID|CLIENT_LINKEDIN_ID', clientSecretEnv: 'LINKEDIN_CLIENT_SECRET|CLIENT_LINKEDIN_SECRET', tokenAuth: 'body' },
  twitter_x: { authUrl: 'https://twitter.com/i/oauth2/authorize', tokenUrl: 'https://api.twitter.com/2/oauth2/token', clientIdEnv: 'X_CLIENT_ID|CLIENT_X_ID', clientSecretEnv: 'X_CLIENT_SECRET|CLIENT_X_SECRET', tokenAuth: 'basic', pkce: 's256' },
  quickbooks:{ authUrl: 'https://appcenter.intuit.com/connect/oauth2', tokenUrl: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', clientIdEnv: 'CLIENT_QUICKBOOKS_ID|QUICKBOOKS_CLIENT_ID', clientSecretEnv: 'CLIENT_QUICKBOOKS_SECRET|QUICKBOOKS_CLIENT_SECRET', tokenAuth: 'basic' },
  xero:      { authUrl: 'https://login.xero.com/identity/connect/authorize', tokenUrl: 'https://identity.xero.com/connect/token', clientIdEnv: 'XERO_CLIENT_ID|CLIENT_XERO_ID', clientSecretEnv: 'XERO_CLIENT_SECRET|CLIENT_XERO_SECRET', tokenAuth: 'basic', extraAuthParams: { access_type: 'offline' } },
};

/** Resolve the first env var that is set from a '|'-separated candidate list. */
function firstEnv(names: string): string | undefined {
  for (const n of names.split('|')) { const v = process.env[n.trim()]; if (v) return v; }
  return undefined;
}

/** Provider → { app, scopes }. Scopes are provider-appropriate; adjust when wiring each adapter. */
const PROVIDER_OAUTH: Record<string, { app: string; scopes: string[] }> = {
  gmail:            { app: 'google', scopes: ['https://www.googleapis.com/auth/gmail.modify', 'openid', 'email'] },
  google_calendar:  { app: 'google', scopes: ['https://www.googleapis.com/auth/calendar', 'openid', 'email'] },
  google_drive:     { app: 'google', scopes: ['https://www.googleapis.com/auth/drive.file', 'openid', 'email'] },
  outlook:          { app: 'microsoft', scopes: ['offline_access', 'Mail.ReadWrite', 'Mail.Send', 'Calendars.ReadWrite', 'User.Read'] },
  onedrive:         { app: 'microsoft', scopes: ['offline_access', 'Files.ReadWrite', 'User.Read'] },
  facebook:         { app: 'meta', scopes: ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement', 'business_management'] },
  instagram:        { app: 'meta', scopes: ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement', 'business_management'] },
  tiktok:           { app: 'tiktok', scopes: ['video.publish', 'user.info.basic'] },
  linkedin:         { app: 'linkedin', scopes: ['w_member_social', 'r_liteprofile'] },
  twitter_x:        { app: 'twitter_x', scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'] },
  quickbooks:       { app: 'quickbooks', scopes: ['com.intuit.quickbooks.accounting', 'openid', 'email'] },
  xero:             { app: 'xero', scopes: ['offline_access', 'accounting.transactions', 'accounting.contacts'] },
};

// Marketplace provider key → the legacy user_integrations key the existing feature services
// already read. Connecting the marketplace provider dual-writes the token under both.
const LEGACY_TOKEN_ALIAS: Record<string, string> = {
  gmail: 'google_email',
  outlook: 'microsoft_email',
};

// ── State signing (tamper-proof provider/org/user carrier through the OAuth redirect) ──────────
function signState(payload: object): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + STATE_TTL_MS })).toString('base64url');
  const sig = crypto.createHmac('sha256', STATE_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyState(state: string): { provider: string; orgId: string; userId: string | null; codeVerifier: string | null } {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig) throw new Error('Malformed OAuth state');
  const expected = crypto.createHmac('sha256', STATE_SECRET).update(body).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error('Invalid OAuth state signature');
  const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!data.exp || data.exp < Date.now()) throw new Error('OAuth state expired');
  return { provider: data.provider, orgId: data.orgId, userId: data.userId ?? null, codeVerifier: data.cv ?? null };
}

/** PKCE code_challenge from a verifier. TikTok wants hex-encoded SHA256; others use base64url. */
function pkceChallenge(verifier: string, kind: 's256' | 's256_hex'): string {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return kind === 's256_hex' ? hash.toString('hex') : hash.toString('base64url');
}

function requireOAuth(provider: string): { catalog: IntegrationProvider; app: OAuthApp; scopes: string[]; clientId: string; clientSecret: string } {
  const catalog = getProvider(provider);
  if (!catalog || catalog.auth !== 'oauth2') throw new Error(`Provider "${provider}" is not an OAuth integration`);
  const po = PROVIDER_OAUTH[provider];
  const app = po && OAUTH_APPS[po.app];
  if (!po || !app) throw new Error(`No OAuth config for provider "${provider}"`);
  const clientId = firstEnv(app.clientIdEnv);
  const clientSecret = firstEnv(app.clientSecretEnv);
  if (!clientId || !clientSecret) throw new IntegrationNotConfiguredError(provider);
  // Allow an env override of the requested scopes so a deployment can match EXACTLY what its
  // OAuth app has enabled/approved (avoids provider "scope" rejections). e.g. TIKTOK_SCOPES,
  // TWITTER_X_SCOPES, QUICKBOOKS_SCOPES — comma- or space-separated.
  const envScopes = process.env[`${provider.toUpperCase()}_SCOPES`];
  const scopes = envScopes ? envScopes.split(/[ ,]+/).map(s => s.trim()).filter(Boolean) : po.scopes;
  return { catalog, app, scopes, clientId, clientSecret };
}

// ── Public API ─────────────────────────────────────────────────────────────────────────────
export const integrationConnectorService = {
  /** Build the provider's OAuth authorize URL (throws IntegrationNotConfiguredError if creds absent). */
  buildAuthUrl(provider: string, orgId: string, userId: string | null): string {
    const { app, scopes, clientId } = requireOAuth(provider);
    const extra: Record<string, string> = { ...(app.extraAuthParams || {}) };
    // PKCE (required by TikTok + X): generate a verifier, send its challenge, and carry the
    // verifier inside the (HMAC-signed, tamper-proof) state so the callback can complete the exchange.
    let codeVerifier: string | undefined;
    if (app.pkce) {
      codeVerifier = crypto.randomBytes(32).toString('hex'); // 64 chars, valid PKCE unreserved set
      extra.code_challenge = pkceChallenge(codeVerifier, app.pkce);
      extra.code_challenge_method = 'S256';
    }
    const state = signState({ provider, orgId, userId, cv: codeVerifier });
    const params = new URLSearchParams({
      response_type: 'code',
      [app.clientIdParam || 'client_id']: clientId,   // TikTok uses client_key
      redirect_uri: `${APP_URL}${OAUTH_CALLBACK_PATH}`,
      scope: scopes.join(app.scopeSeparator || ' '),  // TikTok wants comma-separated scopes
      state,
      ...extra,
    });
    return `${app.authUrl}?${params.toString()}`;
  },

  /**
   * Exchange the callback code for tokens and persist. Returns the frontend redirect target.
   * `extras` carries provider-specific callback query params — notably Intuit's `realmId`
   * (the QuickBooks company id), which every QuickBooks API call requires and which arrives
   * on the callback URL, NOT in the token response.
   */
  async handleCallback(code: string, state: string, extras?: { realmId?: string }): Promise<{ provider: string; redirect: string }> {
    const { provider, orgId, userId, codeVerifier } = verifyState(state);
    const { catalog, app, clientId, clientSecret } = requireOAuth(provider);

    const bodyParams: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${APP_URL}${OAUTH_CALLBACK_PATH}`,
    };
    // PKCE providers (TikTok, X) require the verifier to complete the exchange.
    if (app.pkce && codeVerifier) bodyParams.code_verifier = codeVerifier;
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
    if (app.tokenAuth === 'basic') {
      headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    } else {
      bodyParams[app.clientIdParam || 'client_id'] = clientId;  // TikTok uses client_key
      bodyParams.client_secret = clientSecret;
    }

    const resp = await fetch(app.tokenUrl, { method: 'POST', headers, body: new URLSearchParams(bodyParams).toString() });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      logger.error('[integrationConnector] token exchange failed', { provider, status: resp.status, errText: errText.slice(0, 300) });
      throw new Error(`Token exchange failed for ${provider} (${resp.status})`);
    }
    const tok: any = await resp.json();
    let accessToken = tok.access_token as string;
    const refreshToken = (tok.refresh_token as string) || null;
    let expiresAt = tok.expires_in ? new Date(Date.now() + Number(tok.expires_in) * 1000) : null;

    // Meta issues a short-lived (~1h) token; exchange it for a ~60-day long-lived one so the
    // Page/Instagram posting keeps working without a refresh_token (Meta has none).
    if (app.longLived === 'fb' && accessToken) {
      try {
        const ex = new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: clientId, client_secret: clientSecret, fb_exchange_token: accessToken });
        const exResp = await fetch(`${app.tokenUrl}?${ex.toString()}`, { headers: { Accept: 'application/json' } });
        if (exResp.ok) {
          const lt: any = await exResp.json();
          if (lt.access_token) { accessToken = lt.access_token; expiresAt = lt.expires_in ? new Date(Date.now() + Number(lt.expires_in) * 1000) : expiresAt; }
        } else {
          logger.warn('[integrationConnector] fb long-lived exchange failed', { provider, status: exResp.status });
        }
      } catch (e: any) { logger.warn('[integrationConnector] fb long-lived exchange error', { message: e?.message }); }
    }

    if (catalog.model === 'byo_user') {
      if (!userId) throw new Error('User context required for a per-user integration');
      // user_integrations.expiry_date is BIGINT (epoch millis); scopes is TEXT[] (Postgres array).
      const expiryMillis = tok.expires_in ? Date.now() + Number(tok.expires_in) * 1000 : null;
      const scopeArr: string[] | null = typeof tok.scope === 'string' && tok.scope.length ? tok.scope.split(/[ ,]+/).filter(Boolean) : null;
      // Store under the marketplace provider key AND the legacy key the existing feature
      // services read (emailIntegrationService uses 'google_email'/'microsoft_email'), so a
      // connection made here immediately drives the already-built mail sync — no separate flow.
      const keys = [provider, ...(LEGACY_TOKEN_ALIAS[provider] ? [LEGACY_TOKEN_ALIAS[provider]] : [])];
      for (const key of keys) {
        await pool.query(
          `INSERT INTO user_integrations (user_id, provider, access_token, refresh_token, expiry_date, scopes, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6, NOW())
           ON CONFLICT (user_id, provider) DO UPDATE SET
             access_token=EXCLUDED.access_token, refresh_token=COALESCE(EXCLUDED.refresh_token, user_integrations.refresh_token),
             expiry_date=EXCLUDED.expiry_date, scopes=EXCLUDED.scopes, updated_at=NOW()`,
          [userId, key, accessToken, refreshToken, expiryMillis, scopeArr]
        );
      }
    } else {
      await this.upsertOrgIntegration(orgId, provider, {
        auth_type: 'oauth', status: 'connected',
        oauth_access_token: accessToken, oauth_refresh_token: refreshToken, oauth_expires_at: expiresAt,
        // Persist the QuickBooks company id (realmId) from the callback into config.
        config: extras?.realmId ? { realmId: extras.realmId } : undefined,
      });
    }
    return { provider, redirect: `${FRONTEND_URL}/dashboard/integrations?connected=${provider}` };
  },

  /** Save an API-key integration (org-level). Key is hashed at rest. */
  async saveApiKey(orgId: string, provider: string, opts: { apiKey: string; name?: string; config?: any; createdBy?: string }): Promise<void> {
    const p = getProvider(provider);
    const keyHash = crypto.createHash('sha256').update(opts.apiKey).digest('hex');
    await this.upsertOrgIntegration(orgId, provider, {
      auth_type: 'api_key', status: 'connected', api_key_hash: keyHash,
      name: opts.name || p?.name || provider, config: opts.config || {}, createdBy: opts.createdBy,
    });
  },

  /**
   * Read an org's integration row (status + parsed config) for a provider. Used by BYO outbound
   * adapters (e.g. Twilio) that store reversibly-encrypted credentials inside `config` and must read
   * them back to act on the org's behalf. Returns null when the org hasn't connected the provider.
   */
  async getOrgIntegration(orgId: string, provider: string): Promise<{ status: string; config: any } | null> {
    const r = await pool.query(
      `SELECT status, config FROM integrations WHERE organization_id = $1 AND integration_type = $2 ORDER BY created_at DESC LIMIT 1`,
      [orgId, provider]
    );
    if (!r.rows.length) return null;
    const row = r.rows[0];
    const config = typeof row.config === 'string' ? JSON.parse(row.config) : (row.config || {});
    return { status: row.status, config };
  },

  /** Save a webhook integration (org-level). */
  async saveWebhook(orgId: string, provider: string, opts: { url: string; secret?: string; events?: string[]; createdBy?: string }): Promise<void> {
    const p = getProvider(provider);
    await this.upsertOrgIntegration(orgId, provider, {
      auth_type: 'webhook', status: 'connected', webhook_url: opts.url, webhook_secret: opts.secret || null,
      events_subscribed: opts.events || [], name: p?.name || provider, createdBy: opts.createdBy,
    });
  },

  /** Disconnect a provider for an org (and per-user rows for that user, if byo_user). */
  async disconnect(orgId: string, provider: string, userId: string | null): Promise<void> {
    const p = getProvider(provider);
    if (p?.model === 'byo_user' && userId) {
      // Remove the marketplace key + any legacy alias row written on connect.
      const keys = [provider, ...(LEGACY_TOKEN_ALIAS[provider] ? [LEGACY_TOKEN_ALIAS[provider]] : [])];
      await pool.query(`DELETE FROM user_integrations WHERE user_id = $1 AND provider = ANY($2)`, [userId, keys]);
    } else {
      await pool.query(`DELETE FROM integrations WHERE organization_id = $1 AND integration_type = $2`, [orgId, provider]);
    }
  },

  /** List an org's + user's connected providers, keyed by provider type. */
  async listConnections(orgId: string, userId: string | null): Promise<Record<string, { status: string; connected_at: string; auth_type: string; scope: 'org' | 'user' }>> {
    const out: Record<string, any> = {};
    const org = await pool.query(
      `SELECT integration_type, status, auth_type, updated_at FROM integrations WHERE organization_id = $1`, [orgId]
    );
    for (const r of org.rows) out[r.integration_type] = { status: r.status, connected_at: r.updated_at, auth_type: r.auth_type, scope: 'org' };
    if (userId) {
      const usr = await pool.query(`SELECT provider, updated_at FROM user_integrations WHERE user_id = $1`, [userId]);
      for (const r of usr.rows) out[r.provider] = { status: 'connected', connected_at: r.updated_at, auth_type: 'oauth', scope: 'user' };
    }
    return out;
  },

  /**
   * Return a valid access token for a connected byo_org OAuth provider, refreshing via the
   * provider's token endpoint if it is expired or within 5 minutes of expiry. Reads/writes the
   * `integrations` row's oauth_* columns. Also returns the row's `config` (e.g. QuickBooks realmId).
   * Throws if the provider isn't connected, or IntegrationNotConfiguredError if app creds are absent.
   */
  async getValidOAuthToken(orgId: string, provider: string): Promise<{ accessToken: string; config: any; integrationId: string }> {
    const row = await pool.query(
      `SELECT id, oauth_access_token, oauth_refresh_token, oauth_expires_at, config
       FROM integrations
       WHERE organization_id = $1 AND integration_type = $2 AND status != 'inactive'
       ORDER BY created_at DESC LIMIT 1`,
      [orgId, provider]
    );
    if (!row.rows.length) throw new Error(`${provider} is not connected`);
    const r = row.rows[0];
    const config = typeof r.config === 'string' ? JSON.parse(r.config) : (r.config || {});
    const expiresAt = r.oauth_expires_at ? new Date(r.oauth_expires_at).getTime() : 0;
    const needsRefresh = !r.oauth_access_token || Date.now() > expiresAt - 5 * 60 * 1000;

    if (!needsRefresh) {
      return { accessToken: r.oauth_access_token, config, integrationId: r.id };
    }

    // Refresh
    const { app, clientId, clientSecret } = requireOAuth(provider);
    if (!r.oauth_refresh_token) throw new Error(`${provider} has no refresh token — reconnect required`);
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
    const bodyParams: Record<string, string> = { grant_type: 'refresh_token', refresh_token: r.oauth_refresh_token };
    if (app.tokenAuth === 'basic') {
      headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    } else {
      bodyParams[app.clientIdParam || 'client_id'] = clientId;  // TikTok uses client_key
      bodyParams.client_secret = clientSecret;
    }
    const resp = await fetch(app.tokenUrl, { method: 'POST', headers, body: new URLSearchParams(bodyParams).toString() });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      logger.error('[integrationConnector] token refresh failed', { provider, status: resp.status, errText: errText.slice(0, 300) });
      throw new Error(`Token refresh failed for ${provider} (${resp.status})`);
    }
    const tok: any = await resp.json();
    const accessToken = tok.access_token as string;
    const refreshToken = (tok.refresh_token as string) || r.oauth_refresh_token; // some providers rotate refresh tokens
    const newExpiry = tok.expires_in ? new Date(Date.now() + Number(tok.expires_in) * 1000) : null;
    await pool.query(
      `UPDATE integrations SET oauth_access_token = $2, oauth_refresh_token = $3, oauth_expires_at = $4, updated_at = NOW() WHERE id = $1`,
      [r.id, accessToken, refreshToken, newExpiry]
    );
    return { accessToken, config, integrationId: r.id };
  },

  /**
   * Return a valid access token for a connected byo_user OAuth provider (gmail/outlook/
   * google_calendar/google_drive/onedrive), refreshing via the provider's token endpoint if it
   * is expired or within 1 minute of expiry. Reads/writes the `user_integrations` row.
   */
  async getValidUserToken(userId: string, provider: string): Promise<string> {
    const row = await pool.query(
      `SELECT access_token, refresh_token, expiry_date FROM user_integrations WHERE user_id = $1 AND provider = $2`,
      [userId, provider]
    );
    if (!row.rows.length) throw new Error(`${provider} is not connected for this user`);
    const r = row.rows[0];
    const expiresAt = Number(r.expiry_date) || 0;   // BIGINT epoch millis
    const needsRefresh = !r.access_token || Date.now() > expiresAt - 60 * 1000;
    if (!needsRefresh) return r.access_token;
    if (!r.refresh_token) throw new Error(`${provider} has no refresh token — reconnect required`);

    const { app, clientId, clientSecret } = requireOAuth(provider);
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
    const bodyParams: Record<string, string> = { grant_type: 'refresh_token', refresh_token: r.refresh_token };
    if (app.tokenAuth === 'basic') {
      headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    } else {
      bodyParams[app.clientIdParam || 'client_id'] = clientId;  // TikTok uses client_key
      bodyParams.client_secret = clientSecret;
    }
    const resp = await fetch(app.tokenUrl, { method: 'POST', headers, body: new URLSearchParams(bodyParams).toString() });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      logger.error('[integrationConnector] user token refresh failed', { provider, status: resp.status, errText: errText.slice(0, 300) });
      throw new Error(`Token refresh failed for ${provider} (${resp.status})`);
    }
    const tok: any = await resp.json();
    const accessToken = tok.access_token as string;
    const refreshToken = (tok.refresh_token as string) || r.refresh_token;  // rotate if provided
    const newExpiry = tok.expires_in ? Date.now() + Number(tok.expires_in) * 1000 : expiresAt;
    // Update the marketplace key + any legacy alias so both stay valid.
    const keys = [provider, ...(LEGACY_TOKEN_ALIAS[provider] ? [LEGACY_TOKEN_ALIAS[provider]] : [])];
    for (const key of keys) {
      await pool.query(
        `UPDATE user_integrations SET access_token = $3, refresh_token = $4, expiry_date = $5, updated_at = NOW()
          WHERE user_id = $1 AND provider = $2`,
        [userId, key, accessToken, refreshToken, newExpiry]
      );
    }
    return accessToken;
  },

  /**
   * Upsert one integration per (organization_id, integration_type) via explicit select-then-write.
   * Avoids a DB-level unique constraint on `integrations` (the existing generic CRUD may allow
   * multiple rows of a type per org, e.g. custom webhooks) — the BYO connect flow wants exactly
   * one row per provider, which this enforces without touching the schema.
   */
  async upsertOrgIntegration(orgId: string, provider: string, fields: {
    auth_type: string; status: string; name?: string; config?: any;
    api_key_hash?: string; oauth_access_token?: string; oauth_refresh_token?: string | null; oauth_expires_at?: Date | null;
    webhook_url?: string; webhook_secret?: string | null; events_subscribed?: string[]; createdBy?: string;
  }): Promise<void> {
    const p = getProvider(provider);
    const existing = await pool.query(
      `SELECT id FROM integrations WHERE organization_id = $1 AND integration_type = $2 ORDER BY created_at ASC LIMIT 1`,
      [orgId, provider]
    );
    const cfg = fields.config !== undefined ? JSON.stringify(fields.config) : null;
    // events_subscribed is a TEXT column holding a JSON array (matches the existing CRUD) — stringify,
    // otherwise node-postgres serialises the JS array as a Postgres array literal `{a,b}`.
    const events = fields.events_subscribed !== undefined ? JSON.stringify(fields.events_subscribed) : null;
    if (existing.rows.length) {
      await pool.query(
        `UPDATE integrations SET
           status = $2, auth_type = $3,
           api_key_hash = COALESCE($4, api_key_hash),
           oauth_access_token = COALESCE($5, oauth_access_token),
           oauth_refresh_token = COALESCE($6, oauth_refresh_token),
           oauth_expires_at = COALESCE($7, oauth_expires_at),
           webhook_url = COALESCE($8, webhook_url),
           webhook_secret = COALESCE($9, webhook_secret),
           events_subscribed = COALESCE($10, events_subscribed),
           config = COALESCE($11, config),
           updated_at = NOW()
         WHERE id = $1`,
        [existing.rows[0].id, fields.status, fields.auth_type, fields.api_key_hash || null,
         fields.oauth_access_token || null, fields.oauth_refresh_token || null, fields.oauth_expires_at || null,
         fields.webhook_url || null, fields.webhook_secret || null, events, cfg]
      );
    } else {
      await pool.query(
        `INSERT INTO integrations
          (organization_id, integration_type, name, description, status, auth_type, api_key_hash,
           oauth_access_token, oauth_refresh_token, oauth_expires_at, webhook_url, webhook_secret,
           events_subscribed, config, created_by, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, NOW())`,
        [orgId, provider, fields.name || p?.name || provider, p?.description || null, fields.status, fields.auth_type,
         fields.api_key_hash || null, fields.oauth_access_token || null, fields.oauth_refresh_token || null,
         fields.oauth_expires_at || null, fields.webhook_url || null, fields.webhook_secret || null,
         events, cfg ?? '{}', fields.createdBy || null]  // config is NOT NULL DEFAULT '{}'
      );
    }
  },
};
