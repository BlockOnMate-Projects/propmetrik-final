/**
 * CRM Email Drip Campaign Routes
 *
 * CRUD for drip campaigns + steps, enrollment management.
 * Table auto-created on first use.
 *
 * Base: /api/v1/crm/drip-campaigns
 */

import { Router, Request, Response } from 'express';
import { getOrganizationId, getUserId, asyncHandler } from './helpers';
import db from '../../database';

const router = Router();

const ensureTables = async () => {
    await db.query(`
        CREATE TABLE IF NOT EXISTS crm_drip_campaigns (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL REFERENCES organizations(id),
            name VARCHAR(200) NOT NULL,
            description TEXT,
            trigger_type VARCHAR(50) NOT NULL DEFAULT 'manual',
            is_active BOOLEAN DEFAULT false,
            enrollment_count INTEGER DEFAULT 0,
            created_by UUID,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            deleted_at TIMESTAMPTZ
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS crm_drip_campaign_steps (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            campaign_id UUID NOT NULL REFERENCES crm_drip_campaigns(id) ON DELETE CASCADE,
            step_order INTEGER NOT NULL DEFAULT 0,
            delay_days INTEGER NOT NULL DEFAULT 1,
            subject VARCHAR(300) NOT NULL,
            body TEXT NOT NULL,
            template_id UUID,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS crm_drip_enrollments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            campaign_id UUID NOT NULL REFERENCES crm_drip_campaigns(id) ON DELETE CASCADE,
            contact_id UUID NOT NULL,
            current_step INTEGER DEFAULT 0,
            status VARCHAR(20) DEFAULT 'active',
            enrolled_at TIMESTAMPTZ DEFAULT NOW(),
            last_step_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ
        )
    `);
};

let tablesReady = false;
const ensureOnce = async () => { if (!tablesReady) { await ensureTables(); tablesReady = true; } };

// ── List campaigns ─────────────────────────────────
router.get('/drip-campaigns', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });
    await ensureOnce();

    const result = await db.query(
        `SELECT c.*, 
                (SELECT COUNT(*) FROM crm_drip_campaign_steps s WHERE s.campaign_id = c.id) as step_count,
                (SELECT COUNT(*) FROM crm_drip_enrollments e WHERE e.campaign_id = c.id AND e.status = 'active') as active_enrollments
         FROM crm_drip_campaigns c
         WHERE c.organization_id = $1 AND c.deleted_at IS NULL
         ORDER BY c.updated_at DESC`,
        [orgId]
    );
    res.json(result.rows);
}));

// ── Create campaign ────────────────────────────────
router.post('/drip-campaigns', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });
    await ensureOnce();

    const { name, description, trigger_type } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const result = await db.query(
        `INSERT INTO crm_drip_campaigns (organization_id, name, description, trigger_type, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [orgId, name, description || null, trigger_type || 'manual', userId]
    );
    res.status(201).json(result.rows[0]);
}));

// ── Get campaign detail + steps ────────────────────
router.get('/drip-campaigns/:id', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });
    await ensureOnce();

    const campaign = await db.query(
        `SELECT * FROM crm_drip_campaigns WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
        [req.params.id, orgId]
    );
    if (!campaign.rows[0]) return res.status(404).json({ error: 'Campaign not found' });

    const steps = await db.query(
        `SELECT * FROM crm_drip_campaign_steps WHERE campaign_id = $1 ORDER BY step_order ASC`,
        [req.params.id]
    );

    res.json({ ...campaign.rows[0], steps: steps.rows });
}));

// ── Update campaign ────────────────────────────────
router.put('/drip-campaigns/:id', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });
    await ensureOnce();

    const { name, description, trigger_type, is_active } = req.body;
    const result = await db.query(
        `UPDATE crm_drip_campaigns SET
            name = COALESCE($3, name),
            description = COALESCE($4, description),
            trigger_type = COALESCE($5, trigger_type),
            is_active = COALESCE($6, is_active),
            updated_at = NOW()
         WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
         RETURNING *`,
        [req.params.id, orgId, name, description, trigger_type, is_active]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Campaign not found' });
    res.json(result.rows[0]);
}));

// ── Delete campaign ────────────────────────────────
router.delete('/drip-campaigns/:id', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });
    await ensureOnce();

    await db.query(
        `UPDATE crm_drip_campaigns SET deleted_at = NOW() WHERE id = $1 AND organization_id = $2`,
        [req.params.id, orgId]
    );
    res.status(204).send();
}));

// ── Add step to campaign ───────────────────────────
router.post('/drip-campaigns/:id/steps', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });
    await ensureOnce();

    const { step_order, delay_days, subject, body, template_id } = req.body;
    if (!subject || !body) return res.status(400).json({ error: 'subject and body are required' });

    const result = await db.query(
        `INSERT INTO crm_drip_campaign_steps (campaign_id, step_order, delay_days, subject, body, template_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.params.id, step_order || 0, delay_days || 1, subject, body, template_id || null]
    );
    res.status(201).json(result.rows[0]);
}));

// ── Delete step ────────────────────────────────────
router.delete('/drip-campaigns/:campaignId/steps/:stepId', asyncHandler(async (req: Request, res: Response) => {
    await ensureOnce();
    await db.query(`DELETE FROM crm_drip_campaign_steps WHERE id = $1 AND campaign_id = $2`, [req.params.stepId, req.params.campaignId]);
    res.status(204).send();
}));

// ── Enroll contact ─────────────────────────────────
router.post('/drip-campaigns/:id/enroll', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });
    await ensureOnce();

    const { contact_ids } = req.body;
    if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
        return res.status(400).json({ error: 'contact_ids array is required' });
    }

    let enrolled = 0;
    for (const contactId of contact_ids) {
        try {
            await db.query(
                `INSERT INTO crm_drip_enrollments (campaign_id, contact_id) VALUES ($1, $2)
                 ON CONFLICT DO NOTHING`,
                [req.params.id, contactId]
            );
            enrolled++;
        } catch { /* skip */ }
    }

    // Update enrollment count
    await db.query(
        `UPDATE crm_drip_campaigns SET enrollment_count = (
            SELECT COUNT(*) FROM crm_drip_enrollments WHERE campaign_id = $1
        ) WHERE id = $1`,
        [req.params.id]
    );

    res.json({ enrolled });
}));

// ── Get enrollments ────────────────────────────────
router.get('/drip-campaigns/:id/enrollments', asyncHandler(async (req: Request, res: Response) => {
    const orgId = await getOrganizationId(req);
    if (!orgId) return res.status(401).json({ error: 'Unauthorized' });
    await ensureOnce();

    const result = await db.query(
        `SELECT e.*, c.first_name, c.last_name, c.email
         FROM crm_drip_enrollments e
         LEFT JOIN contacts c ON c.id = e.contact_id
         WHERE e.campaign_id = $1
         ORDER BY e.enrolled_at DESC`,
        [req.params.id]
    );
    res.json(result.rows);
}));

export default router;
