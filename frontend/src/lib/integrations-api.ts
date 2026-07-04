/**
 * Client for the shared Integrations Hub (backend `routes/orgIntegrations.ts`).
 *
 * All calls use the RELATIVE `/api/org-integrations/...` path — the Next proxy rewrites
 * `/api/:path*` → backend `/api/v1/:path*`. Never prefix a host or `/v1`.
 */
import { authedFetch } from '@/lib/authed-fetch';

export type IntegrationModel = 'platform' | 'byo_org' | 'byo_user' | 'hybrid';
export type IntegrationAuth = 'oauth2' | 'api_key' | 'webhook' | 'managed';
export type IntegrationStatus = 'live' | 'available' | 'coming_soon';
export type ServiceKey = 'pm' | 'crm' | 'valuation' | 'projects';

export interface IntegrationProvider {
  type: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  model: IntegrationModel;
  auth: IntegrationAuth;
  services: ServiceKey[];
  status: IntegrationStatus;
  connectable: boolean;
  configured: boolean;
  syncable?: boolean;
  requiresEnv?: string[];
  docsUrl?: string;
}

export interface Connection {
  status: string;
  connected_at: string;
  auth_type: string;
  scope: 'org' | 'user';
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    const err: any = new Error(body?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = body?.code;
    throw err;
  }
  return body.data as T;
}

/** Provider catalog, optionally scoped to a service tab (each tagged with runtime `configured`). */
export async function getIntegrationCatalog(service?: ServiceKey): Promise<IntegrationProvider[]> {
  const qs = service ? `?service=${service}` : '';
  return json(await authedFetch(`/api/org-integrations/catalog${qs}`));
}

/** This org's + user's connected providers, keyed by provider type. */
export async function getConnections(): Promise<Record<string, Connection>> {
  return json(await authedFetch('/api/org-integrations/connections'));
}

/** OAuth connect → returns the provider authorize URL for the browser to redirect to. */
export async function connectOAuth(type: string): Promise<{ authUrl: string }> {
  return json(await authedFetch(`/api/org-integrations/${type}/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }));
}

/** API-key connect. */
export async function connectApiKey(type: string, apiKey: string, name?: string): Promise<{ connected: boolean }> {
  return json(await authedFetch(`/api/org-integrations/${type}/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, name }),
  }));
}

/** Twilio (BYO SMS) connect — three fields; the Auth Token is encrypted at rest server-side. */
export async function connectTwilio(
  accountSid: string, authToken: string, fromNumber: string,
): Promise<{ connected: boolean; accountName?: string; fromNumber?: string }> {
  return json(await authedFetch(`/api/org-integrations/twilio/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountSid, authToken, fromNumber }),
  }));
}

/** Webhook connect. */
export async function connectWebhook(type: string, url: string, secret?: string, events?: string[]): Promise<{ connected: boolean }> {
  return json(await authedFetch(`/api/org-integrations/${type}/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, secret, events }),
  }));
}

/** Disconnect a provider for the org (and this user's per-user row, for byo_user). */
export async function disconnectIntegration(type: string): Promise<{ disconnected: boolean }> {
  return json(await authedFetch(`/api/org-integrations/${type}`, { method: 'DELETE' }));
}

/** Live connection test against the provider API (syncable providers only). */
export async function testIntegration(type: string): Promise<{ ok: boolean; detail: string }> {
  return json(await authedFetch(`/api/org-integrations/${type}/test`, { method: 'POST' }));
}

/** Push approved project costs to the connected accounting provider. */
export async function syncIntegration(type: string): Promise<{ synced: number; errors: string[] }> {
  return json(await authedFetch(`/api/org-integrations/${type}/sync`, { method: 'POST' }));
}

/** Push a document to the user's connected cloud storage (Drive/OneDrive). Provider auto-resolves. */
export async function saveToCloud(
  body: { bucket?: string; key?: string; sourceUrl?: string; name?: string; mimeType?: string; provider?: 'onedrive' | 'google_drive' },
): Promise<{ id: string; url: string | null; provider: string }> {
  return json(await authedFetch('/api/org-integrations/storage/push', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
}

/** Push an event to the user's connected calendar (Google Calendar / Outlook). Provider auto-resolves. */
export async function pushToCalendar(
  body: { title: string; start: string; end: string; description?: string; location?: string; attendees?: string[]; timeZone?: string; provider?: 'google_calendar' | 'outlook' },
): Promise<{ id: string; url: string | null; provider: string }> {
  return json(await authedFetch('/api/org-integrations/calendar/push', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
}

// ── Social publishing (TikTok) ─────────────────────────────────────────────────────────────
export type TikTokPrivacy = 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY';

export interface CreatorInfo {
  creatorUsername: string;
  creatorNickname: string;
  privacyOptions: TikTokPrivacy[];
  commentDisabled: boolean;
  maxVideoDurationSec: number;
}

export interface ShareResult {
  publishId: string;
  status: string;
  privacy: TikTokPrivacy;
  mediaCount: number;
  caption: string;
  socialPostId: string;
}

/** Connected social account's creator info + allowed privacy levels. */
export async function getCreatorInfo(type: string): Promise<CreatorInfo> {
  return json(await authedFetch(`/api/org-integrations/${type}/creator-info`));
}

/** Publish a property listing to the connected social account. */
export async function shareListing(
  type: string,
  body: { propertyId: string; caption?: string; privacy?: TikTokPrivacy; disableComment?: boolean },
): Promise<ShareResult> {
  return json(await authedFetch(`/api/org-integrations/${type}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

/** Poll a publish job's status. */
export async function getShareStatus(type: string, publishId: string): Promise<{ status: string; postUrl: string | null; failReason?: string }> {
  return json(await authedFetch(`/api/org-integrations/${type}/share/${publishId}/status`));
}

export interface SocialPost {
  id: string;
  property_id: string | null;
  property_title: string | null;
  publish_id: string | null;
  status: string;
  post_url: string | null;
  caption: string | null;
  media_count: number;
  error: string | null;
  created_at: string;
}

/** Recent posts published to a platform for this org (optionally scoped to one property). */
export async function getPosts(type: string, propertyId?: string): Promise<SocialPost[]> {
  const qs = propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : '';
  return json(await authedFetch(`/api/org-integrations/${type}/posts${qs}`));
}
