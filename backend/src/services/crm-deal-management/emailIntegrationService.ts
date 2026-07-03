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

import { pool } from '../../database';
import { logger } from '../../utils/logger';
import axios from 'axios';

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

export interface EmailSendRequest {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body_html: string;
    body_text?: string;
    deal_id?: string;
    contact_id?: string;
    in_reply_to?: string; // Message-ID to reply to
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
            is_tracked BOOLEAN DEFAULT false,
            open_count INTEGER DEFAULT 0,
            click_count INTEGER DEFAULT 0,
            first_opened_at TIMESTAMPTZ,
            synced_at TIMESTAMPTZ DEFAULT NOW(),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(organization_id, provider_message_id)
        );
        CREATE INDEX IF NOT EXISTS idx_crm_emails_org ON crm_emails(organization_id);
        CREATE INDEX IF NOT EXISTS idx_crm_emails_user ON crm_emails(user_id);
        CREATE INDEX IF NOT EXISTS idx_crm_emails_deal ON crm_emails(deal_id) WHERE deal_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_crm_emails_contact ON crm_emails(contact_id) WHERE contact_id IS NOT NULL;
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

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
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

async function gmailSendMessage(accessToken: string, email: EmailSendRequest): Promise<string> {
    const to = email.to.join(', ');
    const cc = email.cc?.join(', ') || '';

    let raw = `To: ${to}\r\n`;
    if (cc) raw += `Cc: ${cc}\r\n`;
    raw += `Subject: ${email.subject}\r\n`;
    raw += `Content-Type: text/html; charset=UTF-8\r\n`;
    if (email.in_reply_to) raw += `In-Reply-To: ${email.in_reply_to}\r\nReferences: ${email.in_reply_to}\r\n`;
    raw += `\r\n${email.body_html}`;

    const encodedRaw = Buffer.from(raw).toString('base64url');

    const resp = await axios.post(`${GMAIL_API}/messages/send`, { raw: encodedRaw }, {
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

    const clientId = process.env.MS_CLIENT_ID;
    const clientSecret = process.env.MS_CLIENT_SECRET;
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

async function outlookSendMessage(accessToken: string, email: EmailSendRequest): Promise<string> {
    const message: any = {
        subject: email.subject,
        body: { contentType: 'HTML', content: email.body_html },
        toRecipients: email.to.map(addr => ({ emailAddress: { address: addr } })),
    };
    if (email.cc?.length) {
        message.ccRecipients = email.cc.map(addr => ({ emailAddress: { address: addr } }));
    }

    const resp = await axios.post(`${MS_GRAPH}/sendMail`, { message, saveToSentItems: true }, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });
    return resp.status === 202 ? 'sent' : 'sent';
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
     * Auto-links to contacts by matching email addresses.
     */
    async syncEmails(userId: string, organizationId: string, provider: EmailProvider, maxResults = 50): Promise<EmailSyncResult> {
        await ensureTable();
        const tokens = await getTokens(userId, provider);
        if (!tokens) throw new Error(`${provider} not connected`);

        let emails: EmailThread[] = [];

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

        // Store in DB + auto-link contacts
        let newCount = 0;
        for (const email of emails) {
            try {
                // Find matching contact by email address
                const contactMatch = await pool.query(
                    `SELECT id FROM contacts
                     WHERE organization_id = $1 AND deleted_at IS NULL
                       AND (email ILIKE $2 OR email ILIKE ANY($3::text[]))
                     LIMIT 1`,
                    [organizationId, email.from_address, email.to_addresses]
                );
                const contactId = contactMatch.rows[0]?.id || null;

                const result = await pool.query(
                    `INSERT INTO crm_emails
                     (organization_id, user_id, provider, provider_message_id, thread_id, message_id,
                      subject, snippet, from_address, from_name, to_addresses, cc_addresses,
                      body_text, body_html, is_read, has_attachments, labels, direction,
                      email_date, contact_id)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                             $15, $16, $17, $18, $19, $20)
                     ON CONFLICT (organization_id, provider_message_id) DO NOTHING
                     RETURNING id`,
                    [
                        organizationId, userId, provider, email.id, email.thread_id, email.message_id,
                        email.subject, email.snippet, email.from_address, email.from_name,
                        JSON.stringify(email.to_addresses), JSON.stringify(email.cc_addresses || []),
                        email.body_text, email.body_html, email.is_read, email.has_attachments,
                        JSON.stringify(email.labels || []),
                        email.labels?.includes('SENT') ? 'outbound' : 'inbound',
                        email.date, contactId,
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

        if (provider === 'gmail') {
            const accessToken = await refreshGmailToken(userId, tokens);
            providerId = await gmailSendMessage(accessToken, email);
        } else {
            const accessToken = await refreshOutlookToken(userId, tokens);
            providerId = await outlookSendMessage(accessToken, email);
        }

        // Store sent email
        await pool.query(
            `INSERT INTO crm_emails
             (organization_id, user_id, provider, provider_message_id, subject, from_address, from_name,
              to_addresses, cc_addresses, body_text, body_html, direction, email_date, deal_id, contact_id, is_read)
             VALUES ($1, $2, $3, $4, $5, 'me', '', $6, $7, $8, $9, 'outbound', NOW(), $10, $11, true)
             ON CONFLICT DO NOTHING`,
            [
                organizationId, userId, provider, providerId, email.subject,
                JSON.stringify(email.to), JSON.stringify(email.cc || []),
                email.body_text || '', email.body_html,
                email.deal_id || null, email.contact_id || null,
            ]
        );

        // Log as deal activity if linked
        if (email.deal_id) {
            await pool.query(
                `INSERT INTO deal_activities (deal_id, activity_type, subject, description, user_id, contact_id)
                 VALUES ($1, 'email', $2, $3, $4, $5)`,
                [email.deal_id, `Email: ${email.subject}`, `Sent to ${email.to.join(', ')}`, userId, email.contact_id || null]
            );
        }

        return { success: true, provider_id: providerId };
    }

    /**
     * Get synced emails for a deal or contact timeline
     */
    async getEmails(organizationId: string, filters: {
        deal_id?: string;
        contact_id?: string;
        search?: string;
        direction?: 'inbound' | 'outbound';
        limit?: number;
        offset?: number;
    }): Promise<{ emails: any[]; total: number }> {
        await ensureTable();

        const conditions: string[] = ['e.organization_id = $1'];
        const params: any[] = [organizationId];
        let idx = 2;

        if (filters.deal_id) { conditions.push(`e.deal_id = $${idx++}`); params.push(filters.deal_id); }
        if (filters.contact_id) { conditions.push(`e.contact_id = $${idx++}`); params.push(filters.contact_id); }
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
                `SELECT e.*, c.first_name || ' ' || c.last_name as contact_name
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
     * Link email to a deal
     */
    async linkEmailToDeal(emailId: string, organizationId: string, dealId: string): Promise<void> {
        await pool.query(
            `UPDATE crm_emails SET deal_id = $1 WHERE id = $2 AND organization_id = $3`,
            [dealId, emailId, organizationId]
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
