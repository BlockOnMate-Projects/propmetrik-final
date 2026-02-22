/**
 * CRM Smart Notifications Routes
 *
 * Server-side notification preferences and notification log.
 * Notifications are triggered by deal stage changes, task due dates,
 * new contact assignments, etc.
 *
 * Base: /api/v1/crm/notifications
 */

import { Router, Request, Response } from 'express';
import { getOrganizationId, getUserId, asyncHandler } from './helpers';
import db from '../../database';

const router = Router();

const ensureTable = async () => {
    await db.query(`
        CREATE TABLE IF NOT EXISTS crm_notifications (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL,
            user_id UUID NOT NULL,
            type VARCHAR(50) NOT NULL,
            title VARCHAR(300) NOT NULL,
            message TEXT,
            entity_type VARCHAR(30),
            entity_id UUID,
            is_read BOOLEAN DEFAULT false,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_crm_notif_user ON crm_notifications(user_id, is_read, created_at DESC)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS crm_notification_preferences (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL,
            user_id UUID NOT NULL,
            deal_stage_change BOOLEAN DEFAULT true,
            deal_won BOOLEAN DEFAULT true,
            deal_lost BOOLEAN DEFAULT true,
            task_due_soon BOOLEAN DEFAULT true,
            task_overdue BOOLEAN DEFAULT true,
            new_contact_assigned BOOLEAN DEFAULT true,
            new_deal_assigned BOOLEAN DEFAULT true,
            email_notifications BOOLEAN DEFAULT false,
            UNIQUE(organization_id, user_id)
        )
    `);
};

let ready = false;
const ensureOnce = async () => { if (!ready) { await ensureTable(); ready = true; } };

// ── List notifications ─────────────────────────────
router.get('/notifications', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!orgId || !userId) return res.status(401).json({ error: 'Unauthorized' });
    await ensureOnce();

    const unreadOnly = req.query.unread === 'true';
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const where = unreadOnly ? 'AND is_read = false' : '';
    const result = await db.query(
        `SELECT * FROM crm_notifications
         WHERE organization_id = $1 AND user_id = $2 ${where}
         ORDER BY created_at DESC LIMIT $3`,
        [orgId, userId, limit]
    );

    const unreadCount = await db.query(
        `SELECT COUNT(*) FROM crm_notifications WHERE organization_id = $1 AND user_id = $2 AND is_read = false`,
        [orgId, userId]
    );

    res.json({ notifications: result.rows, unread_count: parseInt(unreadCount.rows[0]?.count || '0') });
}));

// ── Get single notification ─────────────────────────
router.get('/notifications/:id', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!orgId || !userId) return res.status(401).json({ error: 'Unauthorized' });
    await ensureOnce();
    const result = await db.query(
        `SELECT * FROM crm_notifications WHERE id = $1 AND organization_id = $2 AND user_id = $3`,
        [req.params.id, orgId, userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Notification not found' });
    res.json(result.rows[0]);
}));

// ── Mark as read ───────────────────────────────────
router.put('/notifications/:id/read', asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req);
    await ensureOnce();
    await db.query(`UPDATE crm_notifications SET is_read = true WHERE id = $1 AND user_id = $2`, [req.params.id, userId]);
    res.json({ ok: true });
}));

// ── Mark all as read ───────────────────────────────
router.put('/notifications/read-all', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    const userId = await getUserId(req);
    await ensureOnce();
    await db.query(
        `UPDATE crm_notifications SET is_read = true WHERE organization_id = $1 AND user_id = $2 AND is_read = false`,
        [orgId, userId]
    );
    res.json({ ok: true });
}));

// ── Mark all as read (POST alias for frontend) ────
router.post('/notifications/mark-all-read', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    const userId = await getUserId(req);
    await ensureOnce();
    await db.query(
        `UPDATE crm_notifications SET is_read = true WHERE organization_id = $1 AND user_id = $2 AND is_read = false`,
        [orgId, userId]
    );
    res.json({ ok: true });
}));

// ── Create notification (internal/admin) ───────────
router.post('/notifications', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });
    await ensureOnce();

    const { user_id, type, title, message, entity_type, entity_id } = req.body;
    if (!user_id || !type || !title) return res.status(400).json({ error: 'user_id, type, title required' });

    const result = await db.query(
        `INSERT INTO crm_notifications (organization_id, user_id, type, title, message, entity_type, entity_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [orgId, user_id, type, title, message || null, entity_type || null, entity_id || null]
    );
    res.status(201).json(result.rows[0]);
}));

// ── Get notification preferences ───────────────────
router.get('/notification-preferences', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!orgId || !userId) return res.status(401).json({ error: 'Unauthorized' });
    await ensureOnce();

    const result = await db.query(
        `SELECT * FROM crm_notification_preferences WHERE organization_id = $1 AND user_id = $2`,
        [orgId, userId]
    );
    res.json(result.rows[0] || {
        deal_stage_change: true,
        deal_won: true,
        deal_lost: true,
        task_due_soon: true,
        task_overdue: true,
        new_contact_assigned: true,
        new_deal_assigned: true,
        email_notifications: false,
    });
}));

// ── Update notification preferences ────────────────
router.put('/notification-preferences', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!orgId || !userId) return res.status(401).json({ error: 'Unauthorized' });
    await ensureOnce();

    const fields = [
        'deal_stage_change', 'deal_won', 'deal_lost',
        'task_due_soon', 'task_overdue',
        'new_contact_assigned', 'new_deal_assigned',
        'email_notifications',
    ];

    const updates: string[] = [];
    const values: any[] = [orgId, userId];
    let idx = 3;

    for (const field of fields) {
        if (req.body[field] !== undefined) {
            updates.push(`${field} = $${idx++}`);
            values.push(!!req.body[field]);
        }
    }

    if (updates.length === 0) return res.json({ ok: true });

    // Upsert
    await db.query(
        `INSERT INTO crm_notification_preferences (organization_id, user_id, ${fields.join(', ')})
         VALUES ($1, $2, ${fields.map(() => 'true').join(', ')})
         ON CONFLICT (organization_id, user_id) DO UPDATE SET ${updates.join(', ')}`,
        values
    );

    res.json({ ok: true });
}));

export default router;
