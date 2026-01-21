/**
 * Google OAuth Routes
 * 
 * Handles OAuth2 authentication flow for Google Calendar integration
 */

import { Router, Request, Response } from 'express';
import { googleCalendarService } from '../../shared-services/calendar/googleCalendarService';
import { logger } from '../utils/logger';
import { pool } from '../database';

const router = Router();

// ============================================================================
// OAuth2 Flow
// ============================================================================

/**
 * Start Google OAuth flow
 * Redirects user to Google consent screen
 */
router.get('/google/authorize', (req: Request, res: Response) => {
  try {
    // Get user ID from session/auth (you'll need to implement this)
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Generate auth URL with user ID in state
    const state = Buffer.from(JSON.stringify({ userId })).toString('base64');
    const authUrl = googleCalendarService.getAuthUrl(state);

    res.json({ authUrl });
  } catch (error) {
    logger.error('Failed to generate Google auth URL', { error });
    res.status(500).json({ error: 'Failed to start Google authorization' });
  }
});

/**
 * Google OAuth callback
 * Receives authorization code and exchanges for tokens
 */
router.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const code = req.query.code as string;
    const state = req.query.state as string;
    const error = req.query.error as string;

    // Handle OAuth error
    if (error) {
      logger.warn('Google OAuth error', { error });
      return res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?error=${error}`);
    }

    if (!code) {
      return res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?error=no_code`);
    }

    // Decode state to get user ID
    let userId: string;
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      userId = stateData.userId;
    } catch {
      return res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?error=invalid_state`);
    }

    // Exchange code for tokens
    const tokens = await googleCalendarService.exchangeCodeForTokens(code);

    // Store tokens in database
    await pool.query(
      `INSERT INTO user_integrations (user_id, provider, access_token, refresh_token, expiry_date, created_at, updated_at)
       VALUES ($1, 'google_calendar', $2, $3, $4, NOW(), NOW())
       ON CONFLICT (user_id, provider) 
       DO UPDATE SET 
         access_token = $2,
         refresh_token = COALESCE($3, user_integrations.refresh_token),
         expiry_date = $4,
         updated_at = NOW()`,
      [userId, tokens.access_token, tokens.refresh_token, tokens.expiry_date]
    );

    logger.info('Google Calendar connected', { userId });

    // Redirect back to settings page
    res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?success=google_connected`);
  } catch (error) {
    logger.error('Google OAuth callback error', { error });
    res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?error=token_exchange_failed`);
  }
});

/**
 * Disconnect Google Calendar
 */
router.post('/google/disconnect', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    await pool.query(
      `DELETE FROM user_integrations WHERE user_id = $1 AND provider = 'google_calendar'`,
      [userId]
    );

    logger.info('Google Calendar disconnected', { userId });

    res.json({ success: true, message: 'Google Calendar disconnected' });
  } catch (error) {
    logger.error('Failed to disconnect Google Calendar', { error });
    res.status(500).json({ error: 'Failed to disconnect Google Calendar' });
  }
});

/**
 * Get Google Calendar connection status
 */
router.get('/google/status', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const result = await pool.query(
      `SELECT provider, expiry_date, created_at, updated_at
       FROM user_integrations 
       WHERE user_id = $1 AND provider = 'google_calendar'`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({ connected: false });
    }

    const integration = result.rows[0];
    const isExpired = integration.expiry_date && Date.now() > integration.expiry_date;

    res.json({
      connected: true,
      needsReauth: isExpired,
      connectedAt: integration.created_at,
      lastUpdated: integration.updated_at,
    });
  } catch (error) {
    logger.error('Failed to get Google status', { error });
    res.status(500).json({ error: 'Failed to get connection status' });
  }
});

export default router;
