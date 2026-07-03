/**
 * Public email tracking endpoints (NO auth — hit directly by email clients).
 *
 * Mounted at /api/track BEFORE the authenticated catch-alls. The open pixel and click
 * redirect record engagement on the drip send ledger (mig 271/275). Click redirects only
 * follow a link WE signed (HMAC over sendId+url), so this can't be abused as an open redirector.
 *
 * @module routes/tracking
 */

import { Router, Request, Response } from 'express';
import { pool } from '../database';
import { config } from '../config';
import { verifyTracking } from '../services/crm-deal-management/campaignTracking';
import { logger } from '../utils/logger';

const router = Router();

// 1x1 transparent GIF.
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

function clientIp(req: Request): string {
    return String((req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '')
        .split(',')[0].trim().slice(0, 64);
}

// GET /api/track/open/:sendId.gif  → record open, return the pixel (never fails).
router.get('/open/:sendId', async (req: Request, res: Response) => {
    const sendId = String(req.params.sendId).replace(/\.gif$/i, '');
    try {
        const upd = await pool.query(
            `UPDATE crm_drip_step_sends
                SET open_count = open_count + 1, opened_at = COALESCE(opened_at, NOW())
              WHERE id = $1 RETURNING organization_id`,
            [sendId]
        );
        if (upd.rows[0]) {
            await pool.query(
                `INSERT INTO crm_drip_tracking_events (send_id, organization_id, event_type, ip, user_agent)
                 VALUES ($1, $2, 'open', $3, $4)`,
                [sendId, upd.rows[0].organization_id, clientIp(req), String(req.headers['user-agent'] || '').slice(0, 500)]
            ).catch(() => {});
        }
    } catch (e: any) {
        logger.warn('open-track error', { error: e?.message });
    }
    res.set('Content-Type', 'image/gif');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.send(PIXEL);
});

// GET /api/track/click/:sendId?u=<target>&s=<sig>  → record click, 302 to the target.
router.get('/click/:sendId', async (req: Request, res: Response) => {
    const sendId = String(req.params.sendId);
    const url = String(req.query.u || '');
    const sig = String(req.query.s || '');
    const fallback = config.app.frontendUrl;

    // Only redirect to a link WE signed — otherwise this is an open redirector.
    if (!url || !/^https?:\/\//i.test(url) || !verifyTracking(sendId, url, sig)) {
        return res.redirect(302, fallback);
    }
    try {
        const upd = await pool.query(
            `UPDATE crm_drip_step_sends
                SET click_count = click_count + 1,
                    first_clicked_at = COALESCE(first_clicked_at, NOW()),
                    opened_at = COALESCE(opened_at, NOW())
              WHERE id = $1 RETURNING organization_id`,
            [sendId]
        );
        if (upd.rows[0]) {
            await pool.query(
                `INSERT INTO crm_drip_tracking_events (send_id, organization_id, event_type, url, ip, user_agent)
                 VALUES ($1, $2, 'click', $3, $4, $5)`,
                [sendId, upd.rows[0].organization_id, url, clientIp(req), String(req.headers['user-agent'] || '').slice(0, 500)]
            ).catch(() => {});
        }
    } catch (e: any) {
        logger.warn('click-track error', { error: e?.message });
    }
    res.redirect(302, url);
});

export default router;
