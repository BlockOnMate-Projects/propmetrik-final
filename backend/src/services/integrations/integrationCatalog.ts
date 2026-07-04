/**
 * Integration Provider Catalog — single source of truth for the shared Integrations hub.
 *
 * Reflects the §8A decision in crm_gaps.md: every external integration is tagged with its MODEL
 * (platform-owned vs bring-your-own) and AUTH type. The shared frontend `IntegrationsHub` renders
 * this catalog, so it stays consistent across every service (PM, CRM, Valuation, Projects).
 *
 * `configured` is computed at runtime from env: a BYO OAuth provider is only "Connect"-able once
 * the platform-level OAuth *app* credentials exist (client id/secret) — otherwise it shows as
 * "Requires setup" so we never present a connect button that would dead-end.
 */

export type IntegrationModel = 'platform' | 'byo_org' | 'byo_user' | 'hybrid';
export type IntegrationAuth = 'oauth2' | 'api_key' | 'webhook' | 'managed';
export type IntegrationStatus = 'live' | 'available' | 'coming_soon';
export type ServiceKey = 'pm' | 'crm' | 'valuation' | 'projects';

export interface IntegrationProvider {
  /** stable key stored in integrations.integration_type */
  type: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  model: IntegrationModel;
  auth: IntegrationAuth;
  /** which service tabs surface this provider ('all' via the helper) */
  services: ServiceKey[];
  status: IntegrationStatus;
  /** true → user can click Connect; false → platform-managed / info-only */
  connectable: boolean;
  /** true → once connected, exposes Test + Sync actions (real data adapter exists) */
  syncable?: boolean;
  /** env var(s) whose presence means the platform OAuth app is configured (BYO OAuth only) */
  requiresEnv?: string[];
  docsUrl?: string;
}

const ALL: ServiceKey[] = ['pm', 'crm', 'valuation', 'projects'];

/** The catalog. Order roughly groups by category for display. */
const PROVIDERS: IntegrationProvider[] = [
  // ── Accounting (BYO org — OAuth) ─────────────────────────────────────────
  { type: 'xero', name: 'Xero', category: 'Accounting', description: 'Push approved project costs to your Xero organisation as bills.', icon: '💰', model: 'byo_org', auth: 'oauth2', services: ['pm', 'valuation', 'projects'], status: 'live', connectable: true, syncable: true, requiresEnv: ['XERO_CLIENT_ID|CLIENT_XERO_ID'] },
  { type: 'quickbooks', name: 'QuickBooks Online', category: 'Accounting', description: 'Push approved project costs to your QuickBooks company as vendor bills.', icon: '📊', model: 'byo_org', auth: 'oauth2', services: ['pm', 'valuation', 'projects'], status: 'available', connectable: true, syncable: true, requiresEnv: ['CLIENT_QUICKBOOKS_ID|QUICKBOOKS_CLIENT_ID'] },

  // ── Social syndication (BYO org — OAuth). Available across PM + CRM; both share the
  //    same platform OAuth *app* (Facebook & Instagram use the Meta app). ──────────────
  { type: 'facebook', name: 'Facebook', category: 'Social', description: 'Publish listings to your Facebook Page.', icon: '📘', model: 'byo_org', auth: 'oauth2', services: ['pm', 'crm'], status: 'available', connectable: true, requiresEnv: ['META_APP_ID|CLIENT_META_ID'] },
  { type: 'instagram', name: 'Instagram', category: 'Social', description: 'Publish listings to your Instagram Business account.', icon: '📸', model: 'byo_org', auth: 'oauth2', services: ['pm', 'crm'], status: 'available', connectable: true, requiresEnv: ['META_APP_ID|CLIENT_META_ID'] },
  { type: 'tiktok', name: 'TikTok', category: 'Social', description: 'Post listings to your TikTok Business account.', icon: '🎵', model: 'byo_org', auth: 'oauth2', services: ['pm', 'crm'], status: 'available', connectable: true, requiresEnv: ['TIKTOK_CLIENT_KEY|CLIENT_TIKTOK_ID'] },
  { type: 'linkedin', name: 'LinkedIn', category: 'Social', description: 'Share listings and updates to your LinkedIn Page.', icon: '💼', model: 'byo_org', auth: 'oauth2', services: ['pm', 'crm'], status: 'available', connectable: true, requiresEnv: ['LINKEDIN_CLIENT_ID|CLIENT_LINKEDIN_ID'] },
  { type: 'twitter_x', name: 'X (Twitter)', category: 'Social', description: 'Post listings and news to your X account.', icon: '𝕏', model: 'byo_org', auth: 'oauth2', services: ['pm', 'crm'], status: 'available', connectable: true, requiresEnv: ['X_CLIENT_ID|CLIENT_X_ID'] },

  // ── Email & Calendar (BYO user — OAuth) ──────────────────────────────────
  { type: 'gmail', name: 'Gmail', category: 'Email', description: 'Sync your Gmail inbox and log emails against contacts and deals.', icon: '✉️', model: 'byo_user', auth: 'oauth2', services: ALL, status: 'live', connectable: true, requiresEnv: ['AUTH_GOOGLE_ID|GOOGLE_CLIENT_ID'] },
  { type: 'google_calendar', name: 'Google Calendar', category: 'Calendar', description: 'Two-way sync viewings and appointments with your Google Calendar.', icon: '📅', model: 'byo_user', auth: 'oauth2', services: ALL, status: 'live', connectable: true, requiresEnv: ['AUTH_GOOGLE_ID|GOOGLE_CLIENT_ID'] },
  { type: 'outlook', name: 'Outlook', category: 'Email', description: 'Sync your Outlook mail and calendar (Microsoft 365).', icon: '📧', model: 'byo_user', auth: 'oauth2', services: ALL, status: 'available', connectable: true, requiresEnv: ['MS_GRAPH_CLIENT_ID|MS_CLIENT_ID'] },

  // ── Cloud storage (BYO user — OAuth) ─────────────────────────────────────
  { type: 'google_drive', name: 'Google Drive', category: 'Storage', description: 'Store and sync documents to your Google Drive.', icon: '📁', model: 'byo_user', auth: 'oauth2', services: ALL, status: 'available', connectable: true, requiresEnv: ['AUTH_GOOGLE_ID|GOOGLE_CLIENT_ID'] },
  { type: 'onedrive', name: 'OneDrive', category: 'Storage', description: 'Store and sync documents to your OneDrive.', icon: '🗂️', model: 'byo_user', auth: 'oauth2', services: ALL, status: 'available', connectable: true, requiresEnv: ['MS_GRAPH_CLIENT_ID|MS_CLIENT_ID'] },

  // ── Developer / outbound (BYO org — keys/webhook) ────────────────────────
  { type: 'website', name: 'Connect Website', category: 'Publishing', description: 'Show your PropMetrik listings on your own website and receive enquiries back.', icon: '🌐', model: 'byo_org', auth: 'api_key', services: ['pm', 'crm'], status: 'available', connectable: true, docsUrl: '/docs/integrations/connect-website-spec.md' },
  { type: 'webhook', name: 'Custom Webhook', category: 'Developer', description: 'Send events to a webhook URL you control.', icon: '🔗', model: 'byo_org', auth: 'webhook', services: ALL, status: 'live', connectable: true },
  { type: 'zapier', name: 'Zapier', category: 'Developer', description: 'Connect PropMetrik to 5000+ apps via Zapier.', icon: '⚡', model: 'byo_org', auth: 'api_key', services: ALL, status: 'available', connectable: true },

  // ── Messaging (Hybrid — platform default, BYO optional) ───────────────────
  { type: 'twilio', name: 'Twilio SMS', category: 'Messaging', description: 'Connect your own Twilio account to send SMS notifications from your number.', icon: '💬', model: 'byo_org', auth: 'api_key', services: ALL, status: 'available', connectable: true, requiresEnv: ['CREDENTIALS_ENCRYPTION_SECRET'] },
  { type: 'twilio_voice', name: 'Twilio Voice', category: 'Messaging', description: 'Click-to-call and call logging via Twilio Voice.', icon: '📞', model: 'hybrid', auth: 'api_key', services: ['crm'], status: 'coming_soon', connectable: false },

  // ── Platform-managed (info-only — included, not connected by the org) ─────
  { type: 'whatsapp', name: 'WhatsApp Business', category: 'Messaging', description: 'Send WhatsApp templates and reminders. Managed by PropMetrik.', icon: '🟢', model: 'platform', auth: 'managed', services: ALL, status: 'live', connectable: false },
  // NOTE: Paystack (payments) and Identity Verification (KYC) are platform-owned PropMetrik concerns,
  // not customer BYO integrations — they live on the Admin → Integrations page, not here.
];

/** Providers relevant to a service (or all). BYO-user + hybrid + platform + service-matched BYO-org. */
export function getCatalog(service?: ServiceKey): (IntegrationProvider & { configured: boolean })[] {
  return PROVIDERS
    .filter(p => !service || p.services.includes(service))
    .map(p => ({ ...p, configured: isConfigured(p) }));
}

/** A BYO-OAuth provider is connectable only once its platform OAuth app env is present. */
export function isConfigured(p: IntegrationProvider): boolean {
  if (!p.requiresEnv || p.requiresEnv.length === 0) return true;
  // Each entry may list '|'-separated alternative env names — the slot is satisfied if ANY is set.
  return p.requiresEnv.every(k => k.split('|').some(name => !!process.env[name.trim()]));
}

export function getProvider(type: string): IntegrationProvider | undefined {
  return PROVIDERS.find(p => p.type === type);
}
