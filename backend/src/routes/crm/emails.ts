/**
 * CRM Email Integration Routes
 *
 * Handles Gmail/Outlook OAuth2 flows, email sync, send, and timeline queries.
 *
 * Base path: /api/v1/crm/emails
 *
 * Endpoints:
 *   GET  /emails/auth/:provider          → OAuth consent URL
 *   GET  /emails/auth/:provider/callback  → OAuth callback
 *   GET  /emails/status                   → Connection status for all providers
 *   POST /emails/sync                     → Trigger email sync
 *   GET  /emails                          → List synced emails (with filters)
 *   POST /emails/send                     → Send email through connected provider
 *   POST /emails/:id/link-deal            → Link email to a deal
 *   POST /emails/disconnect/:provider     → Disconnect provider
 *   GET  /emails/track/:id.gif            → Tracking pixel (open tracking)
 *
 * @module routes/crm/emails
 */

import { Router, Request, Response } from 'express';
import { emailIntegrationService, EmailProvider } from '../../services/crm-deal-management/emailIntegrationService';
import { logger } from '../../utils/logger';

const router = Router();

function getUserId(req: Request): string {
    return (req as any).user?.id || (req as any).userId;
}
function getOrganizationId(req: Request): string {
    return (req as any).organizationId || req.headers['x-organization-id'] as string;
}

const VALID_PROVIDERS: EmailProvider[] = ['gmail', 'outlook'];

function validateProvider(provider: string): provider is EmailProvider {
    return VALID_PROVIDERS.includes(provider as EmailProvider);
}

// ── OAuth2 Flow ──────────────────────────────────────

/**
 * GET /emails/auth/:provider
 * Returns the OAuth consent URL for Gmail or Outlook
 */
router.get('/emails/auth/:provider', (req: Request, res: Response) => {
    try {
        const { provider } = req.params;
        if (!validateProvider(provider)) {
            return res.status(400).json({ error: 'Invalid provider. Use "gmail" or "outlook".' });
        }

        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Authentication required' });

        const baseUrl = process.env.BACKEND_URL || process.env.API_URL || `${req.protocol}://${req.get('host')}`;
        const redirectUri = `${baseUrl}/api/v1/crm/emails/auth/${provider}/callback`;

        const authUrl = emailIntegrationService.getAuthUrl(provider, userId, redirectUri);
        res.json({ authUrl });
    } catch (error) {
        logger.error('Email auth URL error', { error });
        res.status(500).json({ error: 'Failed to generate authorization URL' });
    }
});

/**
 * GET /emails/auth/:provider/callback
 * OAuth callback — exchanges code for tokens, redirects to frontend
 */
router.get('/emails/auth/:provider/callback', async (req: Request, res: Response) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    try {
        const { provider } = req.params;
        const code = req.query.code as string;
        const state = req.query.state as string;
        const error = req.query.error as string;

        if (error) {
            return res.redirect(`${frontendUrl}/dashboard/deals/messaging?error=${error}`);
        }
        if (!code || !state) {
            return res.redirect(`${frontendUrl}/dashboard/deals/messaging?error=missing_code`);
        }

        // Decode state
        let userId: string;
        let stateProvider: string;
        try {
            const parsed = JSON.parse(Buffer.from(state, 'base64').toString());
            userId = parsed.userId;
            stateProvider = parsed.provider;
        } catch {
            return res.redirect(`${frontendUrl}/dashboard/deals/messaging?error=invalid_state`);
        }

        const baseUrl = process.env.BACKEND_URL || process.env.API_URL || `${req.protocol}://${req.get('host')}`;
        const redirectUri = `${baseUrl}/api/v1/crm/emails/auth/${stateProvider}/callback`;

        await emailIntegrationService.exchangeCode(stateProvider as EmailProvider, code, redirectUri, userId);

        logger.info('Email integration connected', { userId, provider: stateProvider });
        res.redirect(`${frontendUrl}/dashboard/deals/messaging?success=${stateProvider}_connected`);
    } catch (error) {
        logger.error('Email OAuth callback error', { error });
        res.redirect(`${frontendUrl}/dashboard/deals/messaging?error=token_exchange_failed`);
    }
});

// ── Connection Status ────────────────────────────────

/**
 * GET /emails/status
 * Returns connection status for all email providers
 */
router.get('/emails/status', async (req: Request, res: Response) => {
    try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Authentication required' });

        const [gmail, outlook] = await Promise.all([
            emailIntegrationService.getConnectionStatus(userId, 'gmail').catch(() => ({ connected: false })),
            emailIntegrationService.getConnectionStatus(userId, 'outlook').catch(() => ({ connected: false })),
        ]);

        res.json({ gmail, outlook });
    } catch (error) {
        logger.error('Email status error', { error });
        res.status(500).json({ error: 'Failed to get email status' });
    }
});

// ── Sync ─────────────────────────────────────────────

/**
 * POST /emails/sync
 * Sync recent emails from connected provider
 */
router.post('/emails/sync', async (req: Request, res: Response) => {
    try {
        const userId = getUserId(req);
        const organizationId = getOrganizationId(req);
        if (!userId || !organizationId) return res.status(401).json({ error: 'Authentication required' });

        const provider = (req.body.provider || 'gmail') as EmailProvider;
        if (!validateProvider(provider)) {
            return res.status(400).json({ error: 'Invalid provider' });
        }

        const maxResults = Math.min(parseInt(req.body.maxResults) || 50, 100);

        const result = await emailIntegrationService.syncEmails(userId, organizationId, provider, maxResults);
        res.json(result);
    } catch (error: any) {
        logger.error('Email sync error', { error: error.message });
        res.status(500).json({ error: error.message || 'Failed to sync emails' });
    }
});

// ── List Emails ──────────────────────────────────────

/**
 * GET /emails
 * List synced emails with optional filters
 */
router.get('/emails', async (req: Request, res: Response) => {
    try {
        const organizationId = getOrganizationId(req);
        if (!organizationId) return res.status(401).json({ error: 'Organization required' });

        const result = await emailIntegrationService.getEmails(organizationId, {
            deal_id: req.query.deal_id as string,
            contact_id: req.query.contact_id as string,
            search: req.query.search as string,
            direction: req.query.direction as 'inbound' | 'outbound',
            limit: parseInt(req.query.limit as string) || 50,
            offset: parseInt(req.query.offset as string) || 0,
        });

        res.json(result);
    } catch (error: any) {
        logger.error('Email list error', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch emails' });
    }
});

// ── Send Email ───────────────────────────────────────

/**
 * POST /emails/send
 * Send email through connected provider
 */
router.post('/emails/send', async (req: Request, res: Response) => {
    try {
        const userId = getUserId(req);
        const organizationId = getOrganizationId(req);
        if (!userId || !organizationId) return res.status(401).json({ error: 'Authentication required' });

        const { provider, to, cc, bcc, subject, body_html, body_text, deal_id, contact_id, in_reply_to } = req.body;

        if (!to || !Array.isArray(to) || to.length === 0) {
            return res.status(400).json({ error: 'At least one recipient (to) required' });
        }
        if (!subject) return res.status(400).json({ error: 'Subject required' });
        if (!body_html) return res.status(400).json({ error: 'Email body required' });

        const emailProvider = (provider || 'gmail') as EmailProvider;

        const result = await emailIntegrationService.sendEmail(userId, organizationId, emailProvider, {
            to, cc, bcc, subject, body_html, body_text, deal_id, contact_id, in_reply_to,
        });

        res.json(result);
    } catch (error: any) {
        logger.error('Email send error', { error: error.message });
        res.status(500).json({ error: error.message || 'Failed to send email' });
    }
});

// ── Link Email to Deal ──────────────────────────────

/**
 * POST /emails/:id/link-deal
 * Link a synced email to a deal
 */
router.post('/emails/:id/link-deal', async (req: Request, res: Response) => {
    try {
        const organizationId = getOrganizationId(req);
        if (!organizationId) return res.status(401).json({ error: 'Organization required' });

        const { deal_id } = req.body;
        if (!deal_id) return res.status(400).json({ error: 'deal_id required' });

        await emailIntegrationService.linkEmailToDeal(req.params.id, organizationId, deal_id);
        res.json({ success: true });
    } catch (error: any) {
        logger.error('Email link error', { error: error.message });
        res.status(500).json({ error: 'Failed to link email' });
    }
});

// ── Disconnect ───────────────────────────────────────

/**
 * POST /emails/disconnect/:provider
 */
router.post('/emails/disconnect/:provider', async (req: Request, res: Response) => {
    try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Authentication required' });

        const { provider } = req.params;
        if (!validateProvider(provider)) return res.status(400).json({ error: 'Invalid provider' });

        await emailIntegrationService.disconnect(userId, provider);
        res.json({ success: true });
    } catch (error) {
        logger.error('Email disconnect error', { error });
        res.status(500).json({ error: 'Failed to disconnect' });
    }
});

// ── Tracking Pixel ───────────────────────────────────

/**
 * GET /emails/track/:id.gif
 * Invisible tracking pixel for email open tracking
 */
router.get('/emails/track/:id.gif', async (req: Request, res: Response) => {
    try {
        const emailId = req.params.id.replace('.gif', '');
        await emailIntegrationService.trackOpen(emailId);
    } catch {
        // Silently fail — don't break the image
    }

    // Return 1x1 transparent GIF
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache', 'Content-Length': String(gif.length) });
    res.send(gif);
});

export default router;
