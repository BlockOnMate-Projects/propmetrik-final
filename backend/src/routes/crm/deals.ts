/**
 * CRM Deal Routes
 * 
 * Handles all deal-related operations including CRUD, kanban view,
 * metrics, stage transitions, status updates (with Data Hub sync on won),
 * activities, and deal sub-resources (tasks, notes, documents).
 */

import { Router, Request, Response } from 'express';
import { getOrganizationId, getUserId, asyncHandler, getAgentIdForUser } from './helpers';
import { dealService, activityService, pipelineValidator } from '../../services/crm-deal-management';
import { DealType, DealStatus } from '../../services/crm-deal-management/types';
import db from '../../database';
import { logger } from '../../utils/logger';
import { dataHubQueueManager, DataHubQueueManager, CrmPropertySyncJobData, CrmTransactionSyncJobData } from '../../services/data-hub/jobQueue';
import { validate, validateRequest } from '../../middleware/validation';
import { createDealBody, updateDealBody, moveDealStageBody, createActivityBody, uuidParam } from '../../middleware/schemas/crm.schemas';

const router = Router();

// ──────────────────────────────────────────────
// Deal CRUD & Listing
// ──────────────────────────────────────────────

router.get('/deals', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    // Agent role: auto-scope to only their assigned deals
    const agentId = await getAgentIdForUser(req);

    const filters = {
        deal_type: req.query.type as DealType | undefined,
        deal_status: req.query.status as DealStatus | undefined,
        pipeline_id: req.query.pipelineId as string | undefined,
        stage_id: req.query.stageId as string | undefined,
        assigned_agent: agentId || (req.query.assignedTo as string | undefined),
        deal_value_min: req.query.minValue ? parseFloat(req.query.minValue as string) : undefined,
        deal_value_max: req.query.maxValue ? parseFloat(req.query.maxValue as string) : undefined,
        search: req.query.search as string | undefined,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
        sort_by: req.query.sortBy as string || 'created_at',
        sort_order: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    const result = await dealService.listDeals(organizationId, filters);
    res.json(result);
}));

router.get('/deals/kanban', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    let pipelineId = req.query.pipelineId as string;
    
    if (!pipelineId) {
        const defaultPipeline = await db.query(
            `SELECT id FROM deal_pipelines 
             WHERE organization_id = $1 AND is_default = true AND is_active = true AND deleted_at IS NULL 
             LIMIT 1`,
            [organizationId]
        );
        if (defaultPipeline.rows.length > 0) {
            pipelineId = defaultPipeline.rows[0].id;
        } else {
            const anyPipeline = await db.query(
                `SELECT id FROM deal_pipelines 
                 WHERE organization_id = $1 AND is_active = true AND deleted_at IS NULL 
                 ORDER BY created_at LIMIT 1`,
                [organizationId]
            );
            if (anyPipeline.rows.length > 0) {
                pipelineId = anyPipeline.rows[0].id;
            } else {
                return res.json([]);
            }
        }
    }
    const agentId = await getAgentIdForUser(req);
    const kanbanData = await dealService.getDealsByStage(organizationId, pipelineId, agentId || undefined);
    res.json(kanbanData);
}));

router.get('/deals/metrics', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    const metrics = await dealService.getDealMetrics(organizationId);
    res.json(metrics);
}));

router.post('/deals', validate(createDealBody), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    const deal = await dealService.createDeal(organizationId, req.body, userId);
    res.status(201).json(deal);
}));

router.get('/deals/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const deal = await dealService.getDealById(req.params.id, organizationId);
    if (!deal) {
        return res.status(404).json({ error: 'Deal not found' });
    }
    res.json(deal);
}));

router.put('/deals/:id', validateRequest({ body: updateDealBody, params: uuidParam }), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const deal = await dealService.updateDeal(req.params.id, organizationId, req.body, userId);
    res.json(deal);
}));

router.delete('/deals/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    try {
        await dealService.deleteDeal(req.params.id, organizationId);
        res.status(204).send();
    } catch (error: any) {
        if (error.message?.includes('not found')) {
            return res.status(404).json({ error: 'Deal not found' });
        }
        throw error;
    }
}));

// ──────────────────────────────────────────────
// Deal Stage Transitions
// ──────────────────────────────────────────────

router.post('/deals/:id/stage', validateRequest({ body: moveDealStageBody, params: uuidParam }), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const { stageId, reason } = req.body;

    if (!stageId) {
        return res.status(400).json({ error: 'stageId is required' });
    }

    const currentDeal = await dealService.getDealById(req.params.id, organizationId);
    if (!currentDeal) {
        return res.status(404).json({ error: 'Deal not found' });
    }

    try {
        await pipelineValidator.validateStageTransition(
            currentDeal.pipeline_id,
            currentDeal.stage_id,
            stageId,
            organizationId
        );
    } catch (validationError: any) {
        return res.status(400).json({
            error: 'Invalid stage transition',
            details: validationError.message
        });
    }

    const deal = await dealService.updateDealStage(
        req.params.id,
        stageId,
        organizationId,
        userId,
        reason
    );

    res.json(deal);
}));

// PUT alias for frontend compatibility
router.put('/deals/:id/stage', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const { stage_id, stageId: altStageId, note, reason } = req.body;
    const targetStageId = stage_id || altStageId;

    if (!targetStageId) {
        return res.status(400).json({ error: 'stage_id is required' });
    }

    const currentDeal = await dealService.getDealById(req.params.id, organizationId);
    if (!currentDeal) {
        return res.status(404).json({ error: 'Deal not found' });
    }

    try {
        await pipelineValidator.validateStageTransition(
            currentDeal.pipeline_id,
            currentDeal.stage_id,
            targetStageId,
            organizationId
        );
    } catch (validationError: any) {
        return res.status(400).json({
            error: 'Invalid stage transition',
            details: validationError.message
        });
    }

    const deal = await dealService.updateDealStage(
        req.params.id,
        targetStageId,
        organizationId,
        userId,
        note || reason
    );
    res.json(deal);
}));

// ──────────────────────────────────────────────
// Deal Status Updates (win/lose/archive)
// ──────────────────────────────────────────────

// Update deal status (win/lose/archive) - triggers Data Hub sync on won
router.post('/deals/:id/status', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const { status, reason, final_value, final_price, transaction_date } = req.body;

    if (!status || !['won', 'lost', 'archived', 'active'].includes(status)) {
        return res.status(400).json({ 
            error: 'Invalid status. Must be: won, lost, archived, or active' 
        });
    }

    const currentDeal = await dealService.getDealById(req.params.id, organizationId);
    if (!currentDeal) {
        return res.status(404).json({ error: 'Deal not found' });
    }

    // Use a transaction with savepoints to handle the legacy commission trigger
    const client = await db.getClient();
    let updatedDeal: any;
    try {
        await client.query('BEGIN');

        const shouldClose = status === 'won' || status === 'lost';
        const updateQuery = `
            UPDATE deals
            SET
                deal_status = $1,
                actual_close_date = CASE WHEN $7 THEN NOW() ELSE actual_close_date END,
                deal_value = COALESCE($2, deal_value),
                close_reason = $3,
                updated_at = NOW(),
                updated_by = $4
            WHERE id = $5 AND organization_id = $6
            RETURNING *
        `;

        // Disable legacy triggers that reference non-existent columns
        // (create_commission_on_deal_close uses NEW.stage, update_agent_closing_rate
        // uses agents.total_deals_attempted). Migration 218 provides the permanent fix.
        await client.query('ALTER TABLE deals DISABLE TRIGGER trigger_deal_commission');
        await client.query('ALTER TABLE deals DISABLE TRIGGER trigger_update_agent_closing_rate');

        const result = await client.query(updateQuery, [
            status, final_value, reason, userId, req.params.id, organizationId, shouldClose
        ]);

        await client.query('ALTER TABLE deals ENABLE TRIGGER trigger_deal_commission');
        await client.query('ALTER TABLE deals ENABLE TRIGGER trigger_update_agent_closing_rate');

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(404).json({ error: 'Deal not found' });
        }
        updatedDeal = result.rows[0];

        // Log activity (also protected by savepoint)
        try {
            await client.query('SAVEPOINT activity_log');
            await activityService.createActivity({
                deal_id: req.params.id,
                user_id: userId || currentDeal.assigned_agent,
                activity_type: 'deal_status_change',
                subject: `Deal marked as ${status}`,
                description: reason || `Deal status changed to ${status}`,
                outcome: 'completed',
                old_value: { status: currentDeal.deal_status },
                new_value: { status, final_value, transaction_date },
            }, client);
            await client.query('RELEASE SAVEPOINT activity_log');
        } catch {
            await client.query('ROLLBACK TO SAVEPOINT activity_log');
        }

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }

    const propertyIds = currentDeal.property_ids || [];
    if (status === 'won' && propertyIds.length > 0) {
        logger.info('Deal won - triggering Data Hub transaction sync', {
            dealId: req.params.id,
            propertyIds,
            organizationId
        });

        for (const propertyId of propertyIds) {
            try {
                const propResult = await db.query(
                    `SELECT property_type, region, address_city, bedrooms, bathrooms, 
                            total_area_sqm, land_area_sqm, latitude, longitude, digital_address
                     FROM crm_properties WHERE id = $1`,
                    [propertyId]
                );
                const prop = propResult.rows[0] || {};

                const transactionSyncData: CrmTransactionSyncJobData = {
                    dealId: req.params.id,
                    organizationId,
                    crmPropertyId: propertyId,
                    transactionType: currentDeal.deal_type || 'sale',
                    transactionDate: transaction_date || new Date().toISOString(),
                    transactionPrice: final_price || final_value || updatedDeal.deal_value || 0,
                    priceCurrency: updatedDeal.currency || 'GHS',
                    propertySnapshot: {
                        property_type: prop.property_type || 'residential',
                        region: prop.region || 'greater_accra',
                        city: prop.address_city || 'Accra',
                        bedrooms: prop.bedrooms,
                        bathrooms: prop.bathrooms,
                        total_area_sqm: prop.total_area_sqm,
                        land_area_sqm: prop.land_area_sqm,
                        latitude: prop.latitude,
                        longitude: prop.longitude,
                        digital_address: prop.digital_address
                    }
                };

                await dataHubQueueManager.addJob(
                    DataHubQueueManager.QUEUES.CRM_TRANSACTION_SYNC,
                    transactionSyncData,
                    { priority: 1 }
                );

                logger.info('Queued transaction sync job', { propertyId, dealId: req.params.id });
            } catch (syncError) {
                logger.error('Failed to queue transaction sync', { 
                    error: syncError, 
                    propertyId, 
                    dealId: req.params.id 
                });
            }
        }
    }

    res.json({
        ...updatedDeal,
        transaction_sync_queued: status === 'won' && propertyIds.length > 0
    });
}));

// ──────────────────────────────────────────────
// Deal History & Activities
// ──────────────────────────────────────────────

// Get deal status history
router.get('/deals/:id/status-history', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const deal = await dealService.getDealById(req.params.id, organizationId);
    if (!deal) {
        return res.status(404).json({ error: 'Deal not found' });
    }

    const query = `
        SELECT 
            id,
            activity_type,
            subject,
            description,
            old_value,
            new_value,
            created_at
        FROM deal_activities
        WHERE deal_id = $1 
        AND activity_type IN ('deal_status_change', 'stage_change')
        ORDER BY created_at DESC
    `;

    const result = await db.query(query, [req.params.id]);
    res.json(result.rows);
}));

router.get('/deals/:id/activities', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const limit = parseInt(req.query.limit as string) || 100;
    const activities = await activityService.getActivitiesByDeal(req.params.id, organizationId, limit);
    res.json(activities);
}));

router.post('/deals/:id/activities', validateRequest({ body: createActivityBody, params: uuidParam }), asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req);
    const activity = await activityService.createActivity({
        ...req.body,
        deal_id: req.params.id,
        user_id: userId
    });
    res.status(201).json(activity);
}));

// ──────────────────────────────────────────────
// Deal Sub-Resources (Tasks, Notes, Documents)
// ──────────────────────────────────────────────

// Get tasks for a deal
router.get('/deals/:id/tasks', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const result = await db.query(
        `SELECT t.*, 
                u.email as assignee_email,
                COALESCE(u.display_name, u.first_name || ' ' || u.last_name) as assignee_name
         FROM tasks t
         LEFT JOIN users u ON t.assigned_to = u.id
         WHERE t.deal_id = $1 
           AND t.organization_id = $2 AND t.deleted_at IS NULL
         ORDER BY t.due_date ASC`,
        [req.params.id, organizationId]
    );
    res.json(result.rows);
}));

// Get notes for a deal
router.get('/deals/:id/notes', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const result = await db.query(
        `SELECT n.*, u.email as author_email, 
                COALESCE(u.display_name, u.first_name || ' ' || u.last_name) as author_name
         FROM notes n
         LEFT JOIN users u ON n.created_by = u.id
         WHERE n.entity_type = 'deal' AND n.entity_id = $1 
           AND n.organization_id = $2 AND n.deleted_at IS NULL
         ORDER BY n.created_at DESC`,
        [req.params.id, organizationId]
    );
    res.json(result.rows);
}));

// Get documents for a deal  
router.get('/deals/:id/documents', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const result = await db.query(
        `SELECT d.*, u.email as uploader_email, 
                COALESCE(u.display_name, u.first_name || ' ' || u.last_name) as uploader_name
         FROM documents d
         LEFT JOIN users u ON d.created_by = u.id
         WHERE d.entity_type = 'deal' AND d.entity_id = $1 
           AND d.organization_id = $2 AND d.deleted_at IS NULL
         ORDER BY d.created_at DESC`,
        [req.params.id, organizationId]
    );
    res.json(result.rows);
}));

// ──────────────────────────────────────────────
// Deal Cloning
// ──────────────────────────────────────────────

/** POST /deals/:id/clone — Clone a deal with optional field overrides */
router.post('/deals/:id/clone', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    // Fetch original deal
    const original = await dealService.getDealById(req.params.id, organizationId);
    if (!original) return res.status(404).json({ error: 'Deal not found' });

    const overrides = req.body || {};
    const orig = original as any; // DB row may have additional columns
    const cloneData = {
        title: overrides.title || `${orig.title} (Copy)`,
        description: overrides.description ?? orig.description,
        deal_type: overrides.deal_type ?? orig.deal_type,
        pipeline_id: overrides.pipeline_id ?? orig.pipeline_id,
        stage_id: overrides.stage_id ?? orig.stage_id,
        deal_value: overrides.deal_value ?? orig.deal_value,
        commission_amount: overrides.commission_amount ?? orig.commission_amount,
        close_probability: overrides.close_probability ?? orig.close_probability,
        estimated_close_date: overrides.estimated_close_date ?? orig.estimated_close_date,
        lead_source: overrides.lead_source ?? orig.lead_source,
        primary_contact_id: overrides.primary_contact_id ?? orig.primary_contact_id,
        assigned_agent: overrides.assigned_agent ?? orig.assigned_agent,
        tags: overrides.tags ?? orig.tags,
        currency: overrides.currency ?? orig.currency,
    };

    const cloned = await dealService.createDeal(organizationId, cloneData, userId);

    // Clone property associations if any
    try {
        const propLinks = await db.query(
            `SELECT property_id FROM deal_properties WHERE deal_id = $1`,
            [original.id]
        );
        for (const { property_id } of propLinks.rows) {
            await db.query(
                `INSERT INTO deal_properties (deal_id, property_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [cloned.id, property_id]
            );
        }
    } catch { /* junction table may not exist */ }

    res.status(201).json(cloned);
}));

export default router;
