/**
 * CRM Pipeline Routes
 * 
 * Handles all pipeline-related operations including CRUD,
 * cloning, and stage management (create, update, reorder).
 */

import { Router, Request, Response } from 'express';
import { getOrganizationId, getUserId, asyncHandler } from './helpers';
import { pipelineService } from '../../services/crm-deal-management';
import db from '../../database';
import { DealType } from '../../services/crm-deal-management/types';
import { validate } from '../../middleware/validation';
import { createPipelineBody } from '../../middleware/schemas/crm.schemas';

const router = Router();

// ──────────────────────────────────────────────
// Pipeline CRUD & Listing
// ──────────────────────────────────────────────

router.get('/pipelines', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    const includeStages = req.query.includeStages !== 'false';
    const pipelines = await pipelineService.listPipelines(organizationId, includeStages);
    res.json(pipelines);
}));

router.get('/pipelines/default', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const dealType = (req.query.dealType as DealType) || 'sale';
    const pipeline = await pipelineService.getDefaultPipeline(organizationId, dealType);
    if (!pipeline) {
        return res.status(404).json({ error: 'No default pipeline found' });
    }
    res.json(pipeline);
}));

router.post('/pipelines', validate(createPipelineBody), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    const pipeline = await pipelineService.createPipeline(organizationId, req.body, userId);
    res.status(201).json(pipeline);
}));

router.post('/pipelines/:id/clone', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'name is required' });
    }
    const pipeline = await pipelineService.clonePipeline(req.params.id, organizationId, name, userId);
    if (!pipeline) {
        return res.status(404).json({ error: 'Pipeline not found' });
    }
    res.status(201).json(pipeline);
}));

router.get('/pipelines/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const pipeline = await pipelineService.getPipelineById(req.params.id, organizationId);
    if (!pipeline) {
        return res.status(404).json({ error: 'Pipeline not found' });
    }
    res.json(pipeline);
}));

// Pipeline metrics
router.get('/pipelines/:id/metrics', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const pipelineId = req.params.id;
    // Verify pipeline belongs to org
    const pipeline = await pipelineService.getPipelineById(pipelineId, organizationId);
    if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });

    const [stageMetrics, totals, avgDays] = await Promise.all([
        db.query(
            `SELECT ds.id AS stage_id, ds.stage_name, ds.stage_order,
                    COUNT(d.id)::int AS deal_count,
                    COALESCE(SUM(d.deal_value), 0)::numeric AS total_value
             FROM deal_stages ds
             LEFT JOIN deals d ON d.stage_id = ds.id AND d.deal_status = 'active'
             WHERE ds.pipeline_id = $1
             GROUP BY ds.id, ds.stage_name, ds.stage_order
             ORDER BY ds.stage_order`,
            [pipelineId]
        ),
        db.query(
            `SELECT COUNT(*)::int AS total_deals,
                    COUNT(*) FILTER (WHERE deal_status = 'active')::int AS active_deals,
                    COUNT(*) FILTER (WHERE deal_status = 'won')::int AS won_deals,
                    COUNT(*) FILTER (WHERE deal_status = 'lost')::int AS lost_deals,
                    COALESCE(SUM(deal_value) FILTER (WHERE deal_status = 'active'), 0)::numeric AS pipeline_value,
                    COALESCE(SUM(deal_value) FILTER (WHERE deal_status = 'won'), 0)::numeric AS won_value
             FROM deals WHERE pipeline_id = $1 AND organization_id = $2`,
            [pipelineId, organizationId]
        ),
        db.query(
            `SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400), 0)::numeric AS avg_days_to_close
             FROM deals WHERE pipeline_id = $1 AND organization_id = $2 AND deal_status = 'won'`,
            [pipelineId, organizationId]
        ),
    ]);

    const t = totals.rows[0];
    const winRate = t.total_deals > 0 ? ((t.won_deals / (t.won_deals + t.lost_deals)) * 100 || 0) : 0;

    res.json({
        stages: stageMetrics.rows,
        total_deals: t.total_deals,
        active_deals: t.active_deals,
        won_deals: t.won_deals,
        lost_deals: t.lost_deals,
        pipeline_value: Number(t.pipeline_value),
        won_value: Number(t.won_value),
        win_rate: Math.round(winRate * 100) / 100,
        avg_days_to_close: Math.round(Number(avgDays.rows[0]?.avg_days_to_close) * 10) / 10,
    });
}));

router.put('/pipelines/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const pipeline = await pipelineService.updatePipeline(req.params.id, organizationId, req.body);
    if (!pipeline) {
        return res.status(404).json({ error: 'Pipeline not found' });
    }
    res.json(pipeline);
}));

router.delete('/pipelines/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    try {
        await pipelineService.deletePipeline(req.params.id, organizationId);
        res.status(204).send();
    } catch (error: any) {
        if (error.message?.includes('not found') || error.message?.includes('active deals')) {
            return res.status(404).json({ error: 'Pipeline not found or has active deals' });
        }
        throw error;
    }
}));

// ──────────────────────────────────────────────
// Pipeline Stages
// ──────────────────────────────────────────────

router.post('/pipelines/:pipelineId/stages', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const stage = await pipelineService.createStage(organizationId, {
        ...req.body,
        pipeline_id: req.params.pipelineId
    });
    if (!stage) {
        return res.status(404).json({ error: 'Pipeline not found' });
    }
    res.status(201).json(stage);
}));

router.put('/pipelines/:pipelineId/stages/:stageId', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const stage = await pipelineService.updateStage(req.params.stageId, organizationId, req.body);
    if (!stage) {
        return res.status(404).json({ error: 'Stage not found' });
    }
    res.json(stage);
}));

// Delete a stage (soft-delete: set is_active = false)
router.delete('/pipelines/:pipelineId/stages/:stageId', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    // Verify pipeline belongs to org
    const pipeline = await pipelineService.getPipelineById(req.params.pipelineId, organizationId);
    if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });

    // Check no active deals in this stage
    const deals = await db.query(
        `SELECT COUNT(*)::int AS cnt FROM deals WHERE stage_id = $1 AND deal_status = 'active'`,
        [req.params.stageId]
    );
    if (deals.rows[0]?.cnt > 0) {
        return res.status(400).json({ error: 'Cannot delete stage with active deals. Move deals first.' });
    }

    await db.query(`UPDATE deal_stages SET is_active = false WHERE id = $1 AND pipeline_id = $2`, [req.params.stageId, req.params.pipelineId]);
    res.status(204).send();
}));

router.put('/pipelines/:pipelineId/stages/reorder', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { stageOrder } = req.body;
    if (!Array.isArray(stageOrder)) {
        return res.status(400).json({ error: 'stageOrder must be an array' });
    }
    await pipelineService.reorderStages(req.params.pipelineId, organizationId, stageOrder);
    res.json({ success: true });
}));

export default router;
