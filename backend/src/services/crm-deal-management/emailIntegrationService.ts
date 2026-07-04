/**
 * CRM Email Integration Service
 *
 * Two-way email sync for Gmail (Google API) and Outlook (Microsoft Graph).
 * Stores synced emails as deal/contact activities and enables sending from CRM.
 *
 * OAuth2 tokens stored in `user_integrations` table.
 * Synced emails stored in `crm_emails` table (auto-created).
 *
 * @module services/crm-deal-management/emailIntegrationService
 */

import crypto from 'crypto';
import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { getFile } from '../../database/minio';
import axios from 'axios';

/** Resolved attachment ready to embed in a provider message. */
interface LoadedAttachment { name: string; mimeType: string; data: Buffer }

// =====================================================
// TYPES
// =====================================================

export type EmailProvider = 'gmail' | 'outlook';

export interface EmailThread {
    id: string;
    provider: EmailProvider;
    thread_id: string;
    subject: string;
    snippet: string;
    from_address: string;
    from_name: string;
    to_addresses: string[];
    cc_addresses?: string[];
    date: string;
    is_read: boolean;
    labels?: string[];
    body_text?: string;
    body_html?: string;
    has_attachments: boolean;
    message_id: string; // RFC Message-ID header
}

/** An attachment referenced either by a MinIO object (preferred) or inline base64. */
export interface EmailAttachment {
    name: string;
    mimeType: string;
    bucket?: string;
    key?: string;
    contentBase64?: string;
}

export interface EmailSendRequest {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body_html: string;
    body_text?: string;
    deal_id?: string;
    contact_id?: string;
    // Polymorphic linkage so the shared inbox can attach a sent email to any service entity
    // (deal/contact/tenant/property/tenancy/contractor/vendor/…), not just CRM deals/contacts.
    entity_type?: string;
    entity_id?: string;
    attachments?: EmailAttachment[];
    // Threading: `in_reply_to` (RFC Message-ID) + `thread_id` (Gmail threadId) thread a Gmail reply;
    // `reply_to_provider_id` (Graph message id) threads an Outlook reply via createReply.
    in_reply_to?: string;
    thread_id?: string;
    reply_to_provider_id?: string;
    template_id?: string;
}

export interface EmailSyncResult {
    new_emails: number;
    total_synced: number;
    last_sync_at: string;
}

interface OAuthTokens {
    access_token: string;
    refresh_token: string;
    expiry_date: number;
}

// =====================================================
// TABLE AUTO-CREATION
// =====================================================

async function ensureEmailsTable(): Promise<void> {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS crm_emails (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL,
            user_id UUID NOT NULL,
            provider VARCHAR(20) NOT NULL,
            provider_message_id VARCHAR(500) NOT NULL,
            thread_id VARCHAR(500),
            message_id VARCHAR(500),
            subject TEXT,
            snippet TEXT,
            from_address VARCHAR(255) NOT NULL,
            from_name VARCHAR(255),
            to_addresses JSONB DEFAULT '[]',
            cc_addresses JSONB DEFAULT '[]',
            body_text TEXT,
            body_html TEXT,
            is_read BOOLEAN DEFAULT false,
            has_attachments BOOLEAN DEFAULT false,
            labels JSONB DEFAULT '[]',
            direction VARCHAR(10) DEFAULT 'inbound',
            email_date TIMESTAMPTZ NOT NULL,
            deal_id UUID,
            contact_id UUID,
            entity_type VARCHAR(50),
            entity_id UUID,
            is_tracked BOOLEAN DEFAULT false,
            open_count INTEGER DEFAULT 0,
            click_count INTEGER DEFAULT 0,
            first_opened_at TIMESTAMPTZ,
            synced_at TIMESTAMPTZ DEFAULT NOW(),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(organization_id, provider_message_id)
        );
        -- Self-heal existing tables (email store is service-created; formal mig 279 mirrors this).
        ALTER TABLE crm_emails ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50);
        ALTER TABLE crm_emails ADD COLUMN IF NOT EXISTS entity_id UUID;
        CREATE INDEX IF NOT EXISTS idx_crm_emails_org ON crm_emails(organization_id);
        CREATE INDEX IF NOT EXISTS idx_crm_emails_user ON crm_emails(user_id);
        CREATE INDEX IF NOT EXISTS idx_crm_emails_deal ON crm_emails(deal_id) WHERE deal_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_crm_emails_contact ON crm_emails(contact_id) WHERE contact_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_crm_emails_entity ON crm_emails(entity_type, entity_id) WHERE entity_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_crm_emails_thread ON crm_emails(thread_id);
        CREATE INDEX IF NOT EXISTS idx_crm_emails_date ON crm_emails(email_date DESC);
    `);
}

let tableEnsured = false;
async function ensureTable() {
    if (!tableEnsured) {
        await ensureEmailsTable();
        tableEnsured = true;
    }
}

// =====================================================
// TOKEN MANAGEMENT
// =====================================================

async function getTokens(userId: string, provider: EmailProvider): Promise<OAuthTokens | null> {
    const providerKey = provider === 'gmail' ? 'google_email' : 'microsoft_email';
    const result = await pool.query(
        `SELECT access_token, refresh_token, expiry_date
         FROM user_integrations
         WHERE user_id = $1 AND provider = $2`,
        [userId, providerKey]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
}

async function saveTokens(userId: string, provider: EmailProvider, tokens: Partial<OAuthTokens>): Promise<void> {
    const providerKey = provider === 'gmail' ? 'google_email' : 'microsoft_email';
    await pool.query(
        `INSERT INTO user_integrations (user_id, provider, access_token, refresh_token, expiry_date, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (user_id, provider)
         DO UPDATE SET
           access_token = COALESCE($3, user_integrations.access_token),
           refresh_token = COALESCE($4, user_integrations.refresh_token),
           expiry_date = COALESCE($5, user_integrations.expiry_date),
           updated_at = NOW()`,
        [userId, providerKey, tokens.access_token, tokens.refresh_token, tokens.expiry_date]
    );
}

// =====================================================
// GMAIL API
// =====================================================

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function refreshGmailToken(userId: string, tokens: OAuthTokens): Promise<string> {
    if (tokens.expiry_date && Date.now() < tokens.expiry_date - 60000) {
        return tokens.access_token;
    }

    // Accept both env-name conventions so a token minted by the marketplace connector
    // (which resolves AUTH_GOOGLE_ID|GOOGLE_CLIENT_ID) refreshes with the same client here.
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET;
    if (!clientId || !clientSecret) throw new Error('Google OAuth not configured');

    const resp = await axios.post(GOOGLE_TOKEN_URL, new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token',
    }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    const newToken = resp.data.access_token;
    const newExpiry = Date.now() + (resp.data.expires_in * 1000);
    await saveTokens(userId, 'gmail', { access_token: newToken, expiry_date: newExpiry });
    return newToken;
}

async function gmailFetchMessages(accessToken: string, maxResults = 20, pageToken?: string): Promise<any> {
    const params: Record<string, string> = {
        maxResults: String(maxResults),
        q: 'in:inbox OR in:sent',
    };
    if (pageToken) params.pageToken = pageToken;

    const resp = await axios.get(`${GMAIL_API}/messages`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params,
    });
    return resp.data;
}

async function gmailGetMessage(accessToken: string, messageId: string): Promise<EmailThread> {
    const resp = await axios.get(`${GMAIL_API}/messages/${messageId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { format: 'full' },
    });
    const msg = resp.data;
    const headers = msg.payload.headers || [];
    const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

    const from = getHeader('From');
    const fromMatch = from.match(/^(.*?)\s*<(.+?)>$/) || [null, '', from];

    // Extract body
    let bodyText = '';
    let bodyHtml = '';
    function extractParts(payload: any) {
        if (payload.body?.data) {
            const decoded = Buffer.from(payload.body.data, 'base64url').toString('utf-8');
            if (payload.mimeType === 'text/plain') bodyText = decoded;
            if (payload.mimeType === 'text/html') bodyHtml = decoded;
        }
        if (payload.parts) payload.parts.forEach(extractParts);
    }
    extractParts(msg.payload);

    return {
        id: msg.id,
        provider: 'gmail',
        thread_id: msg.threadId,
        subject: getHeader('Subject') || '(no subject)',
        snippet: msg.snippet || '',
        from_address: fromMatch[2] || from,
        from_name: (fromMatch[1] || '').replace(/"/g, '').trim(),
        to_addresses: getHeader('To').split(',').map((s: string) => s.trim()).filter(Boolean),
        cc_addresses: getHeader('Cc') ? getHeader('Cc').split(',').map((s: string) => s.trim()) : [],
        date: getHeader('Date'),
        is_read: !(msg.labelIds || []).includes('UNREAD'),
        labels: msg.labelIds || [],
        body_text: bodyText,
        body_html: bodyHtml,
        has_attachments: !!(msg.payload.parts || []).find((p: any) => p.filename && p.filename.length > 0),
        message_id: getHeader('Message-ID'),
    };
}

async function gmailSendMessage(accessToken: string, email: EmailSendRequest, attachments: LoadedAttachment[] = []): Promise<string> {
    const headers: string[] = [`To: ${email.to.join(', ')}`];
    if (email.cc?.length) headers.push(`Cc: ${email.cc.join(', ')}`);
    headers.push(`Subject: ${email.subject}`);
    headers.push('MIME-Version: 1.0');
    // Thread the reply so it nests under the original in the recipient's client.
    if (email.in_reply_to) { headers.push(`In-Reply-To: ${email.in_reply_to}`); headers.push(`References: ${email.in_reply_to}`); }

    let raw: string;
    if (attachments.length) {
        const boundary = 'pm_' + crypto.randomBytes(12).toString('hex');
        headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
        let body = `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${email.body_html}\r\n`;
        for (const a of attachments) {
            const b64 = a.data.toString('base64').replace(/(.{76})/g, '$1\r\n'); // RFC-2045 line wrap
            body += `--${boundary}\r\nContent-Type: ${a.mimeType}; name="${a.name}"\r\n`
                + `Content-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="${a.name}"\r\n\r\n${b64}\r\n`;
        }
        body += `--${boundary}--`;
        raw = `${headers.join('\r\n')}\r\n\r\n${body}`;
    } else {
        headers.push('Content-Type: text/html; charset=UTF-8');
        raw = `${headers.join('\r\n')}\r\n\r\n${email.body_html}`;
    }

    const payload: any = { raw: Buffer.from(raw).toString('base64url') };
    if (email.thread_id) payload.threadId = email.thread_id; // keeps the reply in the same Gmail thread

    const resp = await axios.post(`${GMAIL_API}/messages/send`, payload, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });
    return resp.data.id;
}

// =====================================================
// OUTLOOK / MICROSOFT GRAPH API
// =====================================================

const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MS_GRAPH = 'https://graph.microsoft.com/v1.0/me';

async function refreshOutlookToken(userId: string, tokens: OAuthTokens): Promise<string> {
    if (tokens.expiry_date && Date.now() < tokens.expiry_date - 60000) {
        return tokens.access_token;
    }

    // Accept both env-name conventions (connector resolves MS_GRAPH_CLIENT_ID|MS_CLIENT_ID).
    const clientId = process.env.MS_CLIENT_ID || process.env.MS_GRAPH_CLIENT_ID;
    const clientSecret = process.env.MS_CLIENT_SECRET || process.env.MS_GRAPH_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('Microsoft OAuth not configured');

    const resp = await axios.post(MS_TOKEN_URL, new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token',
        scope: 'https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send offline_access',
    }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    const newToken = resp.data.access_token;
    const newExpiry = Date.now() + (resp.data.expires_in * 1000);
    await saveTokens(userId, 'outlook', { access_token: newToken, expiry_date: newExpiry });
    return newToken;
}

async function outlookFetchMessages(accessToken: string, top = 20, skip = 0): Promise<EmailThread[]> {
    const resp = await axios.get(`${MS_GRAPH}/mailFolders/AllItems/messages`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { '$top': top, '$skip': skip, '$orderby': 'receivedDateTime desc',
            '$select': 'id,conversationId,subject,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,isRead,hasAttachments,internetMessageId,body' },
    });

    return (resp.data.value || []).map((msg: any) => ({
        id: msg.id,
        provider: 'outlook' as EmailProvider,
        thread_id: msg.conversationId || msg.id,
        subject: msg.subject || '(no subject)',
        snippet: msg.bodyPreview || '',
        from_address: msg.from?.emailAddress?.address || '',
        from_name: msg.from?.emailAddress?.name || '',
        to_addresses: (msg.toRecipients || []).map((r: any) => r.emailAddress?.address).filter(Boolean),
        cc_addresses: (msg.ccRecipients || []).map((r: any) => r.emailAddress?.address).filter(Boolean),
        date: msg.receivedDateTime,
        is_read: msg.isRead || false,
        labels: [],
        body_text: msg.body?.contentType === 'text' ? msg.body.content : '',
        body_html: msg.body?.contentType === 'html' ? msg.body.content : '',
        has_attachments: msg.hasAttachments || false,
        message_id: msg.internetMessageId || msg.id,
    }));
}

async function outlookSendMessage(accessToken: string, email: EmailSendRequest, attachments: LoadedAttachment[] = []): Promise<string> {
    const H = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    const graphAttachments = attachments.map(a => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: a.name, contentType: a.mimeType, contentBytes: a.data.toString('base64'),
    }));
    const toRecipients = email.to.map(addr => ({ emailAddress: { address: addr } }));
    const ccRecipients = email.cc?.length ? email.cc.map(addr => ({ emailAddress: { address: addr } })) : undefined;

    // Threaded reply: createReply gives a draft that already carries conversationId + In-Reply-To/
    // References, then we overwrite body/recipients, add attachments, and send it.
    if (email.reply_to_provider_id) {
        try {
            const draft = await axios.post(`${MS_GRAPH}/messages/${email.reply_to_provider_id}/createReply`, {}, { headers: H });
            const draftId = draft.data.id;
            await axios.patch(`${MS_GRAPH}/messages/${draftId}`, {
                body: { contentType: 'HTML', content: email.body_html },
                toRecipients, ...(ccRecipients ? { ccRecipients } : {}),
            }, { headers: H });
            for (const ga of graphAttachments) {
                await axios.post(`${MS_GRAPH}/messages/${draftId}/attachments`, ga, { headers: H });
            }
            await axios.post(`${MS_GRAPH}/messages/${draftId}/send`, {}, { headers: H });
            return draftId;
        } catch (e: any) {
            // If the original can't be found (e.g. cross-account), fall through to a plain send.
            logger.warn('Outlook threaded reply failed, sending as new message', { error: e?.response?.data?.error?.message || e?.message });
        }
    }

    const message: any = {
        subject: email.subject,
        body: { contentType: 'HTML', content: email.body_html },
        toRecipients,
    };
    if (ccRecipients) message.ccRecipients = ccRecipients;
    if (graphAttachments.length) message.attachments = graphAttachments;

    const resp = await axios.post(`${MS_GRAPH}/sendMail`, { message, saveToSentItems: true }, { headers: H });
    return resp.status === 202 ? 'sent' : 'sent';
}

/**
 * Resolve which entity an email belongs to by matching from/to addresses across the services
 * that use the shared inbox: CRM contacts, then PM tenants, then vendors/contractors. Each lookup
 * is defensive — a missing table/column must never break the sync loop. Returns the polymorphic
 * {entity_type, entity_id} plus contact_id (kept for the legacy column + the contact-name join).
 */
async function resolveEmailEntity(
    organizationId: string, fromAddress: string, toAddresses: string[]
): Promise<{ entity_type: string | null; entity_id: string | null; contact_id: string | null }> {
    const addrs = [fromAddress, ...(toAddresses || [])].filter(Boolean);
    try {
        const r = await pool.query(
            `SELECT id FROM contacts
              WHERE organization_id = $1 AND deleted_at IS NULL
                AND (email ILIKE $2 OR email ILIKE ANY($3::text[]))
              LIMIT 1`,
            [organizationId, fromAddress, toAddresses]
        );
        if (r.rows[0]) return { entity_type: 'contact', entity_id: r.rows[0].id, contact_id: r.rows[0].id };
    } catch { /* contacts lookup unavailable — skip */ }
    try {
        const r = await pool.query(
            `SELECT id FROM tenants WHERE organization_id = $1 AND email ILIKE ANY($2::text[]) LIMIT 1`,
            [organizationId, addrs]
        );
        if (r.rows[0]) return { entity_type: 'tenant', entity_id: r.rows[0].id, contact_id: null };
    } catch { /* tenants lookup unavailable — skip */ }
    try {
        const r = await pool.query(
            `SELECT id FROM vendors WHERE organization_id = $1 AND email ILIKE ANY($2::text[]) LIMIT 1`,
            [organizationId, addrs]
        );
        if (r.rows[0]) return { entity_type: 'vendor', entity_id: r.rows[0].id, contact_id: null };
    } catch { /* vendors lookup unavailable — skip */ }
    return { entity_type: null, entity_id: null, contact_id: null };
}

/**
 * Turn a raw provider API error into an actionable message. The most common failure is a 403
 * "insufficient scopes" — the mailbox permission wasn't granted at consent time (e.g. the user
 * unchecked it, or the OAuth consent screen doesn't have the scope). Tell them to reconnect.
 */
function providerApiError(err: any, provider: EmailProvider): Error {
    const status = err?.response?.status;
    const detail = err?.response?.data?.error?.message // Gmail
        || err?.response?.data?.error?.message?.value  // Graph (odata)
        || err?.response?.data?.error_description
        || err?.message || '';
    if (status === 403 || /insufficient|scope|permission/i.test(String(detail))) {
        const label = provider === 'gmail' ? 'Gmail' : 'Outlook';
        return new Error(
            `${label} did not grant mailbox access — the email permission wasn't approved. ` +
            `Disconnect ${label} on the Integrations page and reconnect, keeping the “read/compose/send email” permission checked on the consent screen.`,
        );
    }
    return new Error(detail || `Failed to reach ${provider}`);
}

/** Resolve attachment refs to in-memory buffers (from MinIO, or inline base64). */
async function loadAttachments(atts?: EmailAttachment[]): Promise<LoadedAttachment[]> {
    if (!atts?.length) return [];
    const out: LoadedAttachment[] = [];
    for (const a of atts) {
        try {
            let data: Buffer | null = null;
            if (a.bucket && a.key) { const f = await getFile(a.bucket, a.key); data = Buffer.from(f.body); }
            else if (a.contentBase64) data = Buffer.from(a.contentBase64, 'base64');
            if (data) out.push({ name: a.name || 'attachment', mimeType: a.mimeType || 'application/octet-stream', data });
        } catch (e: any) {
            logger.warn('Failed to load email attachment', { key: a.key, error: e?.message });
        }
    }
    return out;
}

// =====================================================
// UNIFIED SERVICE
// =====================================================

class EmailIntegrationService {

    /**
     * Get OAuth consent URL for email provider
     */
    getAuthUrl(provider: EmailProvider, userId: string, redirectUri: string): string {
        const state = Buffer.from(JSON.stringify({ userId, provider })).toString('base64');

        if (provider === 'gmail') {
            const clientId = process.env.GOOGLE_CLIENT_ID;
            if (!clientId) throw new Error('GOOGLE_CLIENT_ID not configured');
            const scopes = [
                'https://www.googleapis.com/auth/gmail.readonly',
                'https://www.googleapis.com/auth/gmail.send',
                'https://www.googleapis.com/auth/gmail.modify',
            ].join(' ');
            return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent&state=${state}`;
        }

        if (provider === 'outlook') {
            const clientId = process.env.MS_CLIENT_ID;
            if (!clientId) throw new Error('MS_CLIENT_ID not configured');
            const scopes = 'https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send offline_access';
            return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${state}`;
        }

        throw new Error(`Unsupported email provider: ${provider}`);
    }

    /**
     * Exchange OAuth code for tokens
     */
    async exchangeCode(provider: EmailProvider, code: string, redirectUri: string, userId: string): Promise<void> {
        if (provider === 'gmail') {
            const resp = await axios.post(GOOGLE_TOKEN_URL, new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID!,
                client_secret: process.env.GOOGLE_CLIENT_SECRET!,
                code,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
            }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

            await saveTokens(userId, 'gmail', {
                access_token: resp.data.access_token,
                refresh_token: resp.data.refresh_token,
                expiry_date: Date.now() + (resp.data.expires_in * 1000),
            });
        } else if (provider === 'outlook') {
            const resp = await axios.post(MS_TOKEN_URL, new URLSearchParams({
                client_id: process.env.MS_CLIENT_ID!,
                client_secret: process.env.MS_CLIENT_SECRET!,
                code,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
                scope: 'https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send offline_access',
            }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

            await saveTokens(userId, 'outlook', {
                access_token: resp.data.access_token,
                refresh_token: resp.data.refresh_token,
                expiry_date: Date.now() + (resp.data.expires_in * 1000),
            });
        }
    }

    /**
     * Which email provider (if any) this user has connected. Used to send campaign/workflow email
     * FROM the agent's own mailbox (Gmail/Outlook) instead of the platform system address.
     * Maps the stored keys (google_email/microsoft_email) back to the EmailProvider.
     */
    async getConnectedEmailProvider(userId: string): Promise<EmailProvider | null> {
        const r = await pool.query(
            `SELECT provider FROM user_integrations
              WHERE user_id = $1 AND provider IN ('google_email','microsoft_email')
              ORDER BY updated_at DESC LIMIT 1`,
            [userId]
        );
        const p = r.rows[0]?.provider;
        return p === 'google_email' ? 'gmail' : p === 'microsoft_email' ? 'outlook' : null;
    }

    /**
     * Check connection status for a given provider
     */
    async getConnectionStatus(userId: string, provider: EmailProvider): Promise<{ connected: boolean; needsReauth?: boolean; email?: string }> {
        const tokens = await getTokens(userId, provider);
        if (!tokens) return { connected: false };

        const isExpired = tokens.expiry_date && Date.now() > tokens.expiry_date;

        // Try to get user email (profile)
        try {
            const accessToken = provider === 'gmail'
                ? await refreshGmailToken(userId, tokens)
                : await refreshOutlookToken(userId, tokens);

            if (provider === 'gmail') {
                const resp = await axios.get(`${GMAIL_API}/profile`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                });
                return { connected: true, email: resp.data.emailAddress };
            } else {
                const resp = await axios.get(`${MS_GRAPH}`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                });
                return { connected: true, email: resp.data.mail || resp.data.userPrincipalName };
            }
        } catch {
            return { connected: true, needsReauth: true };
        }
    }

    /**
     * Sync recent emails from provider and store in crm_emails table.
     * Auto-links to a matching CRM contact / PM tenant / vendor by email address.
     */
    async syncEmails(userId: string, organizationId: string, provider: EmailProvider, maxResults = 50): Promise<EmailSyncResult> {
        await ensureTable();
        const tokens = await getTokens(userId, provider);
        if (!tokens) throw new Error(`${provider} not connected`);

        let emails: EmailThread[] = [];

        try {
            if (provider === 'gmail') {
                const accessToken = await refreshGmailToken(userId, tokens);
                const list = await gmailFetchMessages(accessToken, maxResults);
                const messageIds = (list.messages || []).map((m: any) => m.id);

                // Fetch full messages in batches
                for (const mid of messageIds.slice(0, maxResults)) {
                    try {
                        const email = await gmailGetMessage(accessToken, mid);
                        emails.push(email);
                    } catch (err) {
                        logger.warn('Failed to fetch Gmail message', { messageId: mid, error: (err as Error).message });
                    }
                }
            } else if (provider === 'outlook') {
                const accessToken = await refreshOutlookToken(userId, tokens);
                emails = await outlookFetchMessages(accessToken, maxResults);
            }
        } catch (err: any) {
            // Surface scope/permission failures as an actionable "reconnect" message (not a raw 500).
            throw providerApiError(err, provider);
        }

        // Store in DB + auto-link contacts
        let newCount = 0;
        for (const email of emails) {
            try {
                // Auto-link to whichever entity (contact/tenant/vendor) the addresses match.
                const link = await resolveEmailEntity(organizationId, email.from_address, email.to_addresses);

                const result = await pool.query(
                    `INSERT INTO crm_emails
                     (organization_id, user_id, provider, provider_message_id, thread_id, message_id,
                      subject, snippet, from_address, from_name, to_addresses, cc_addresses,
                      body_text, body_html, is_read, has_attachments, labels, direction,
                      email_date, contact_id, entity_type, entity_id)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                             $15, $16, $17, $18, $19, $20, $21, $22)
                     ON CONFLICT (organization_id, provider_message_id) DO NOTHING
                     RETURNING id`,
                    [
                        organizationId, userId, provider, email.id, email.thread_id, email.message_id,
                        email.subject, email.snippet, email.from_address, email.from_name,
                        JSON.stringify(email.to_addresses), JSON.stringify(email.cc_addresses || []),
                        email.body_text, email.body_html, email.is_read, email.has_attachments,
                        JSON.stringify(email.labels || []),
                        email.labels?.includes('SENT') ? 'outbound' : 'inbound',
                        email.date, link.contact_id, link.entity_type, link.entity_id,
                    ]
                );
                if (result.rows.length > 0) newCount++;
            } catch (err) {
                logger.warn('Failed to store email', { subject: email.subject, error: (err as Error).message });
            }
        }

        return { new_emails: newCount, total_synced: emails.length, last_sync_at: new Date().toISOString() };
    }

    /**
     * Send an email through the connected provider.
     * Stores the sent email in crm_emails and optionally logs as deal activity.
     */
    async sendEmail(userId: string, organizationId: string, provider: EmailProvider, email: EmailSendRequest): Promise<{ success: boolean; provider_id?: string }> {
        await ensureTable();
        const tokens = await getTokens(userId, provider);
        if (!tokens) throw new Error(`${provider} not connected`);

        let providerId: string;
        const attachments = await loadAttachments(email.attachments);

        if (provider === 'gmail') {
            const accessToken = await refreshGmailToken(userId, tokens);
            providerId = await gmailSendMessage(accessToken, email, attachments);
        } else {
            const accessToken = await refreshOutlookToken(userId, tokens);
            providerId = await outlookSendMessage(accessToken, email, attachments);
        }

        // Resolve polymorphic link (falling back to the legacy deal/contact columns).
        const entityType = email.entity_type || (email.deal_id ? 'deal' : email.contact_id ? 'contact' : null);
        const entityId = email.entity_id || email.deal_id || email.contact_id || null;
        const dealId = email.deal_id || (email.entity_type === 'deal' ? email.entity_id : null) || null;
        const contactId = email.contact_id || (email.entity_type === 'contact' ? email.entity_id : null) || null;

        // Store sent email
        await pool.query(
            `INSERT INTO crm_emails
             (organization_id, user_id, provider, provider_message_id, subject, from_address, from_name,
              to_addresses, cc_addresses, body_text, body_html, direction, email_date, deal_id, contact_id,
              entity_type, entity_id, is_read)
             VALUES ($1, $2, $3, $4, $5, 'me', '', $6, $7, $8, $9, 'outbound', NOW(), $10, $11, $12, $13, true)
             ON CONFLICT DO NOTHING`,
            [
                organizationId, userId, provider, providerId, email.subject,
                JSON.stringify(email.to), JSON.stringify(email.cc || []),
                email.body_text || '', email.body_html,
                dealId, contactId, entityType, entityId,
            ]
        );

        // Log as deal activity if linked to a deal
        if (dealId) {
            await pool.query(
                `INSERT INTO deal_activities (deal_id, activity_type, subject, description, user_id, contact_id)
                 VALUES ($1, 'email', $2, $3, $4, $5)`,
                [dealId, `Email: ${email.subject}`, `Sent to ${email.to.join(', ')}`, userId, contactId]
            );
        }

        return { success: true, provider_id: providerId };
    }

    /**
     * Get synced emails for a deal or contact timeline
     */
    async getEmails(organizationId: string, userId: string, filters: {
        deal_id?: string;
        contact_id?: string;
        entity_type?: string;
        entity_id?: string;
        provider?: string;
        search?: string;
        direction?: 'inbound' | 'outbound';
        limit?: number;
        offset?: number;
    }): Promise<{ emails: any[]; total: number }> {
        await ensureTable();

        // Synced mailboxes are per-user (BYO): a user only ever sees emails they synced/sent.
        // Scoping by BOTH organization_id AND user_id prevents one teammate reading another's inbox.
        const conditions: string[] = ['e.organization_id = $1', 'e.user_id = $2'];
        const params: any[] = [organizationId, userId];
        let idx = 3;

        if (filters.provider) { conditions.push(`e.provider = $${idx++}`); params.push(filters.provider); }
        if (filters.deal_id) { conditions.push(`e.deal_id = $${idx++}`); params.push(filters.deal_id); }
        if (filters.contact_id) { conditions.push(`e.contact_id = $${idx++}`); params.push(filters.contact_id); }
        if (filters.entity_type) { conditions.push(`e.entity_type = $${idx++}`); params.push(filters.entity_type); }
        if (filters.entity_id) { conditions.push(`e.entity_id = $${idx++}`); params.push(filters.entity_id); }
        if (filters.direction) { conditions.push(`e.direction = $${idx++}`); params.push(filters.direction); }
        if (filters.search) {
            conditions.push(`(e.subject ILIKE $${idx} OR e.from_address ILIKE $${idx} OR e.snippet ILIKE $${idx})`);
            params.push(`%${filters.search}%`);
            idx++;
        }

        const where = conditions.join(' AND ');
        const limit = Math.min(filters.limit || 50, 100);
        const offset = filters.offset || 0;

        const [emails, countResult] = await Promise.all([
            pool.query(
                `SELECT e.*, e.email_date AS received_at, c.first_name || ' ' || c.last_name as contact_name
                 FROM crm_emails e
                 LEFT JOIN contacts c ON c.id = e.contact_id
                 WHERE ${where}
                 ORDER BY e.email_date DESC
                 LIMIT ${limit} OFFSET ${offset}`,
                params
            ),
            pool.query(`SELECT COUNT(*) FROM crm_emails e WHERE ${where}`, params),
        ]);

        return {
            emails: emails.rows,
            total: parseInt(countResult.rows[0].count, 10),
        };
    }

    /**
     * Link email to a deal (legacy CRM helper — kept for the existing /link-deal route).
     */
    async linkEmailToDeal(emailId: string, organizationId: string, userId: string, dealId: string): Promise<void> {
        await this.linkEmailToEntity(emailId, organizationId, userId, 'deal', dealId);
    }

    /**
     * Link an email to any service entity (deal/contact/tenant/property/contractor/vendor/…).
     * Writes the polymorphic columns, and mirrors to the legacy deal_id/contact_id columns when
     * the entity is a CRM deal/contact so existing CRM queries keep working. Scoped to the owning
     * user so a teammate cannot re-link an email that isn't theirs.
     */
    async linkEmailToEntity(emailId: string, organizationId: string, userId: string, entityType: string, entityId: string): Promise<void> {
        await pool.query(
            `UPDATE crm_emails
                SET entity_type = $1,
                    entity_id = $2,
                    deal_id = CASE WHEN $1 = 'deal' THEN $2::uuid ELSE deal_id END,
                    contact_id = CASE WHEN $1 = 'contact' THEN $2::uuid ELSE contact_id END
              WHERE id = $3 AND organization_id = $4 AND user_id = $5`,
            [entityType, entityId, emailId, organizationId, userId]
        );
    }

    /**
     * Track email open (called by tracking pixel endpoint)
     */
    async trackOpen(emailId: string): Promise<void> {
        await pool.query(
            `UPDATE crm_emails
             SET open_count = open_count + 1,
                 first_opened_at = COALESCE(first_opened_at, NOW()),
                 is_tracked = true
             WHERE id = $1`,
            [emailId]
        );
    }

    /**
     * Disconnect provider
     */
    async disconnect(userId: string, provider: EmailProvider): Promise<void> {
        const providerKey = provider === 'gmail' ? 'google_email' : 'microsoft_email';
        await pool.query(
            `DELETE FROM user_integrations WHERE user_id = $1 AND provider = $2`,
            [userId, providerKey]
        );
    }
}

export const emailIntegrationService = new EmailIntegrationService();
