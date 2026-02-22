/**
 * CRM Saved Views Routes
 *
 * Persists saved filter views per user/org in crm_saved_views table
 * instead of localStorage. Supports CRUD, pinning, and defaults.
 *
 * Base: /api/v1/crm/saved-views
 */

import { Router, Request, Response } from 'express';
import { getOrganizationId, getUserId, asyncHandler } from './helpers';
import db from '../../database';

const router = Router();

// ── Auto-create table ──────────────────────────────
const ensureTable = async () => {
    await db.query(`
        CREATE TABLE IF NOT EXISTS crm_saved_views (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL REFERENCES organizations(id),
            user_id UUID NOT NULL,
            name VARCHAR(100) NOT NULL,
            entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('deals','contacts','companies','tasks')),
            filters JSONB NOT NULL DEFAULT '{}',
            sort_by VARCHAR(50),
            sort_order VARCHAR(4) DEFAULT 'desc',
            columns TEXT[],
            is_default BOOLEAN DEFAULT false,
            is_pinned BOOLEAN DEFAULT false,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_saved_views_org_user ON crm_saved_views(organization_id, user_id)`);
};

let tableReady = false;

const ensureTableOnce = async () => {
    if (!tableReady) {
        await ensureTable();
        tableReady = true;
    }
};

// ── LIST saved views for user + entity_type ────────
router.get('/saved-views', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || !userId) return res.status(401).json({ error: 'Unauthorized' });

    const entityType = req.query.entity_type as string;
    await ensureTableOnce();

    const q = entityType
        ? `SELECT * FROM crm_saved_views WHERE organization_id = $1 AND user_id = $2 AND entity_type = $3 ORDER BY is_pinned DESC, is_default DESC, updated_at DESC`
        : `SELECT * FROM crm_saved_views WHERE organization_id = $1 AND user_id = $2 ORDER BY is_pinned DESC, is_default DESC, updated_at DESC`;

    const params = entityType ? [organizationId, userId, entityType] : [organizationId, userId];
    const result = await db.query(q, params);
    res.json(result.rows);
}));

// ── CREATE saved view ──────────────────────────────
router.post('/saved-views', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || !userId) return res.status(401).json({ error: 'Unauthorized' });

    const { name, entity_type, filters, sort_by, sort_order, columns, is_default, is_pinned } = req.body;
    if (!name || !entity_type) return res.status(400).json({ error: 'name and entity_type required' });

    await ensureTableOnce();

    // If setting as default, un-default others of same entity_type
    if (is_default) {
        await db.query(
            `UPDATE crm_saved_views SET is_default = false WHERE organization_id = $1 AND user_id = $2 AND entity_type = $3`,
            [organizationId, userId, entity_type]
        );
    }

    const result = await db.query(
        `INSERT INTO crm_saved_views (organization_id, user_id, name, entity_type, filters, sort_by, sort_order, columns, is_default, is_pinned)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [organizationId, userId, name, entity_type, JSON.stringify(filters || {}), sort_by || null, sort_order || 'desc', columns || null, !!is_default, !!is_pinned]
    );
    res.status(201).json(result.rows[0]);
}));

// ── GET single saved view ──────────────────────────
router.get('/saved-views/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || !userId) return res.status(401).json({ error: 'Unauthorized' });
    await ensureTableOnce();
    const result = await db.query(
        `SELECT * FROM crm_saved_views WHERE id = $1 AND organization_id = $2 AND user_id = $3`,
        [req.params.id, organizationId, userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'View not found' });
    res.json(result.rows[0]);
}));

// ── UPDATE saved view ──────────────────────────────
router.put('/saved-views/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || !userId) return res.status(401).json({ error: 'Unauthorized' });

    const { name, filters, sort_by, sort_order, columns, is_default, is_pinned } = req.body;
    await ensureTableOnce();

    // If setting as default, un-default others
    if (is_default) {
        const existing = await db.query(`SELECT entity_type FROM crm_saved_views WHERE id = $1`, [req.params.id]);
        if (existing.rows[0]) {
            await db.query(
                `UPDATE crm_saved_views SET is_default = false WHERE organization_id = $1 AND user_id = $2 AND entity_type = $3 AND id != $4`,
                [organizationId, userId, existing.rows[0].entity_type, req.params.id]
            );
        }
    }

    const result = await db.query(
        `UPDATE crm_saved_views SET
            name = COALESCE($3, name),
            filters = COALESCE($4, filters),
            sort_by = COALESCE($5, sort_by),
            sort_order = COALESCE($6, sort_order),
            columns = COALESCE($7, columns),
            is_default = COALESCE($8, is_default),
            is_pinned = COALESCE($9, is_pinned),
            updated_at = NOW()
         WHERE id = $1 AND organization_id = $2
         RETURNING *`,
        [req.params.id, organizationId, name, filters ? JSON.stringify(filters) : null, sort_by, sort_order, columns, is_default, is_pinned]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'View not found' });
    res.json(result.rows[0]);
}));

// ── DELETE saved view ──────────────────────────────
router.delete('/saved-views/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    await ensureTableOnce();
    await db.query(`DELETE FROM crm_saved_views WHERE id = $1 AND organization_id = $2`, [req.params.id, organizationId]);
    res.status(204).send();
}));

export default router;
