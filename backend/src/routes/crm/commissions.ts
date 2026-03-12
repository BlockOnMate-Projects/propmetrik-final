/**
 * Commission Management Routes
 * Phase 5.7 Week 2
 * 
 * Handles commission plans, records, statements, splits, adjustments,
 * and agent commission assignments.
 */

import { Router, Request, Response } from 'express';
import { getOrganizationId, getUserId, asyncHandler } from './helpers';
import { createCustomRateLimiter } from '../../middleware/rateLimiter';

const bulkRateLimiter = createCustomRateLimiter('crm_bulk_commissions', { points: 5, duration: 60, blockDuration: 120 });
import { commissionService } from '../../services/crm-deal-management/commissionService';
import { validate } from '../../middleware/validation';
import {
    createCommissionPlanBody, updateCommissionPlanBody, createCommissionTierBody,
    createCommissionSplitBody, assignCommissionPlanBody, commissionClawbackBody,
    commissionBulkApproveBody, commissionPayBody, commissionCalculateBody,
    commissionGenerateStatementBody, createCommissionAdjustmentBody
} from '../../middleware/schemas/crm.schemas';

const router = Router();

/**
 * Commission Management Routes
 * Phase 5.7 Week 2
 */

router.get('/commissions/plans', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const activeOnly = req.query.active !== 'false';
    const plans = await commissionService.getPlans(organizationId, activeOnly);
    res.json({ plans });
}));

router.post('/commissions/plans', validate(createCommissionPlanBody), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    
    const plan = await commissionService.createPlan({
        ...req.body,
        organization_id: organizationId,
        created_by: userId,
    });
    res.status(201).json({ plan });
}));

router.get('/commissions/plans/:id', asyncHandler(async (req: Request, res: Response) => {
    const plan = await commissionService.getPlan(req.params.id);
    if (!plan) {
        return res.status(404).json({ error: 'Plan not found' });
    }
    res.json({ plan });
}));

router.patch('/commissions/plans/:id', validate(updateCommissionPlanBody), asyncHandler(async (req: Request, res: Response) => {
    const plan = await commissionService.updatePlan(req.params.id, req.body);
    if (!plan) {
        return res.status(404).json({ error: 'Plan not found' });
    }
    res.json({ plan });
}));

router.delete('/commissions/plans/:id', asyncHandler(async (req: Request, res: Response) => {
    const deleted = await commissionService.deletePlan(req.params.id);
    if (!deleted) {
        return res.status(404).json({ error: 'Plan not found' });
    }
    res.json({ message: 'Plan deleted' });
}));

router.post('/commissions/plans/:id/tiers', validate(createCommissionTierBody), asyncHandler(async (req: Request, res: Response) => {
    const tier = await commissionService.addTier(req.params.id, req.body);
    res.status(201).json({ tier });
}));

router.patch('/commissions/tiers/:id', asyncHandler(async (req: Request, res: Response) => {
    const tier = await commissionService.updateTier(req.params.id, req.body);
    if (!tier) {
        return res.status(404).json({ error: 'Tier not found' });
    }
    res.json({ tier });
}));

router.delete('/commissions/tiers/:id', asyncHandler(async (req: Request, res: Response) => {
    const deleted = await commissionService.deleteTier(req.params.id);
    if (!deleted) {
        return res.status(404).json({ error: 'Tier not found' });
    }
    res.json({ message: 'Tier deleted' });
}));

router.get('/commissions/records', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    
    const filters = {
        agent_id: req.query.agent_id as string,
        status: req.query.status as any,
        date_from: req.query.date_from ? new Date(req.query.date_from as string) : undefined,
        date_to: req.query.date_to ? new Date(req.query.date_to as string) : undefined,
        source_type: req.query.source_type as string,
    };
    
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const result = await commissionService.getRecords(organizationId, filters, limit, offset);
    res.json(result);
}));

router.get('/commissions/records/pending', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const records = await commissionService.getPendingRecords(organizationId);
    res.json({ records });
}));

router.get('/commissions/records/:id', asyncHandler(async (req: Request, res: Response) => {
    const record = await commissionService.getRecord(req.params.id);
    if (!record) {
        return res.status(404).json({ error: 'Record not found' });
    }
    res.json({ record });
}));

router.post('/commissions/records/:id/approve', asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req);
    const record = await commissionService.approveRecord(req.params.id, userId!);
    if (!record) {
        return res.status(404).json({ error: 'Record not found or already approved' });
    }
    res.json({ record });
}));

router.post('/commissions/records/:id/pay', asyncHandler(async (req: Request, res: Response) => {
    const record = await commissionService.markAsPaid(req.params.id);
    if (!record) {
        return res.status(404).json({ error: 'Record not found or not approved' });
    }
    res.json({ record });
}));

router.post('/commissions/records/:id/clawback', validate(commissionClawbackBody), asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req);
    const { reason } = req.body;
    
    const record = await commissionService.createClawback(req.params.id, reason, userId);
    if (!record) {
        return res.status(400).json({ error: 'Cannot create clawback' });
    }
    res.status(201).json({ record });
}));

router.post('/commissions/records/approve-bulk', bulkRateLimiter, validate(commissionBulkApproveBody), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const { record_ids } = req.body;
    
    const count = await commissionService.approvePendingRecords(organizationId, record_ids, userId!);
    res.json({ message: `Approved ${count} records` });
}));

router.get('/commissions/summary', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const agentId = req.query.agent_id as string;
    
    const summary = await commissionService.getSummary(organizationId, agentId);
    res.json({ summary });
}));

router.post('/commissions/calculate', validate(commissionCalculateBody), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { deal_id, agent_id, deal_value } = req.body;
    
    const calculation = await commissionService.calculateCommission(
        deal_id,
        agent_id,
        deal_value,
        organizationId
    );
    res.json({ calculation });
}));

router.get('/commissions/statements', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    
    const filters = {
        agent_id: req.query.agent_id as string,
        status: req.query.status as any,
        period_start: req.query.period_start ? new Date(req.query.period_start as string) : undefined,
        period_end: req.query.period_end ? new Date(req.query.period_end as string) : undefined,
    };
    
    const statements = await commissionService.getStatements(organizationId, filters);
    res.json({ statements });
}));

router.post('/commissions/statements/generate', validate(commissionGenerateStatementBody), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { agent_id, period_start, period_end } = req.body;
    
    if (agent_id) {
        const statementId = await commissionService.generateStatement(
            organizationId,
            agent_id,
            new Date(period_start),
            new Date(period_end)
        );
        res.status(201).json({ statement_id: statementId });
    } else {
        const statementIds = await commissionService.generateBulkStatements(
            organizationId,
            new Date(period_start),
            new Date(period_end)
        );
        res.status(201).json({ 
            message: `Generated ${statementIds.length} statements`,
            statement_ids: statementIds 
        });
    }
}));

router.get('/commissions/statements/:id', asyncHandler(async (req: Request, res: Response) => {
    const statement = await commissionService.getStatement(req.params.id);
    if (!statement) {
        return res.status(404).json({ error: 'Statement not found' });
    }
    res.json({ statement });
}));

router.post('/commissions/statements/:id/approve', asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req);
    const statement = await commissionService.approveStatement(req.params.id, userId!);
    if (!statement) {
        return res.status(404).json({ error: 'Statement not found or already approved' });
    }
    res.json({ statement });
}));

router.post('/commissions/statements/:id/pay', validate(commissionPayBody), asyncHandler(async (req: Request, res: Response) => {
    const { payment_method, payment_reference } = req.body;
    
    const statement = await commissionService.markStatementPaid(
        req.params.id,
        payment_method,
        payment_reference
    );
    if (!statement) {
        return res.status(404).json({ error: 'Statement not found or not approved' });
    }
    res.json({ statement });
}));

router.get('/deals/:id/commission-splits', asyncHandler(async (req: Request, res: Response) => {
    const splits = await commissionService.getSplits(req.params.id);
    res.json({ splits });
}));

router.post('/deals/:id/commission-splits', validate(createCommissionSplitBody), asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req);
    const { agent_id, role, split_percentage, notes } = req.body;
    
    const split = await commissionService.setSplit(
        req.params.id,
        agent_id,
        role,
        split_percentage,
        notes,
        userId
    );
    res.status(201).json({ split });
}));

router.delete('/deals/:id/commission-splits/:agentId', asyncHandler(async (req: Request, res: Response) => {
    const deleted = await commissionService.deleteSplit(req.params.id, req.params.agentId);
    if (!deleted) {
        return res.status(404).json({ error: 'Split not found' });
    }
    res.json({ message: 'Split removed' });
}));

router.post('/agents/:id/commission-assignment', validate(assignCommissionPlanBody), asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req);
    const { plan_id, custom_rate, effective_from } = req.body;
    
    const assignment = await commissionService.assignAgentToPlan(
        req.params.id,
        plan_id,
        custom_rate,
        effective_from ? new Date(effective_from) : undefined,
        userId
    );
    res.status(201).json({ assignment });
}));

router.get('/agents/:id/commission-assignment', asyncHandler(async (req: Request, res: Response) => {
    const assignment = await commissionService.getAgentAssignment(req.params.id);
    res.json({ assignment });
}));

router.get('/agents/:id/commission-summary', asyncHandler(async (req: Request, res: Response) => {
    const period = (req.query.period as 'mtd' | 'qtd' | 'ytd') || undefined;
    const summary = await commissionService.getAgentSummary(req.params.id, period);
    res.json({ summary });
}));

router.post('/commissions/adjustments', validate(createCommissionAdjustmentBody), asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    
    const adjustment = await commissionService.createAdjustment({
        ...req.body,
        organization_id: organizationId,
        created_by: userId,
    });
    res.status(201).json({ adjustment });
}));

router.get('/commissions/adjustments', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const agentId = req.query.agent_id as string;
    const statementId = req.query.statement_id as string;
    
    const adjustments = await commissionService.getAdjustments(organizationId, agentId, statementId);
    res.json({ adjustments });
}));

router.post('/commissions/adjustments/:id/approve', asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req);
    const adjustment = await commissionService.approveAdjustment(req.params.id, userId!);
    if (!adjustment) {
        return res.status(404).json({ error: 'Adjustment not found or already processed' });
    }
    res.json({ adjustment });
}));

export default router;
