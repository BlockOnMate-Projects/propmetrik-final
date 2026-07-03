/**
 * CRM Agent Routes
 * 
 * Handles all agent-related CRUD operations, statistics,
 * agent sub-resources (deals, contacts), and deal probability calculation.
 */

import { Router, Request, Response } from 'express';
import { getOrganizationId, getUserId, asyncHandler } from './helpers';
import { agentService } from '../../services/crm-deal-management';
import db from '../../database';

const router = Router();

// ──────────────────────────────────────────────
// Agent CRUD & Listing
// ──────────────────────────────────────────────

router.get('/agents', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    const filters = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        search: req.query.search as string,
        status: req.query.status as any,
        specialization: req.query.specialization as any,
        region: req.query.region as string,
        team_id: req.query.team_id as string
    };
    const result = await agentService.listAgents(organizationId, filters);
    res.json(result);
}));

router.get('/agents/stats', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    const stats = await agentService.getAgentStats(organizationId);
    res.json(stats);
}));

router.post('/agents', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    const agent = await agentService.createAgent(organizationId, req.body, userId);
    res.status(201).json(agent);
}));

router.get('/agents/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const agent = await agentService.getAgentById(req.params.id, organizationId);
    if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
    }
    res.json(agent);
}));

router.put('/agents/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const agent = await agentService.updateAgent(req.params.id, organizationId, req.body, userId);
    res.json(agent);
}));

router.delete('/agents/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    try {
        await agentService.deleteAgent(req.params.id, organizationId);
        res.status(204).send();
    } catch (error: any) {
        if (error.message?.includes('not found')) {
            return res.status(404).json({ error: 'Agent not found' });
        }
        throw error;
    }
}));

// ──────────────────────────────────────────────
// Agent Sub-Resources
// ──────────────────────────────────────────────

router.get('/agents/:id/deals', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const deals = await agentService.getAgentDeals(req.params.id, organizationId);
    res.json(deals);
}));

router.get('/agents/:id/contacts', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const contacts = await agentService.getAgentContacts(req.params.id, organizationId);
    res.json(contacts);
}));

// ──────────────────────────────────────────────
// Deal Probability Calculation
// ──────────────────────────────────────────────

// Calculate deal probability based on agent performance and stage
router.get('/probability/calculate', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { agent_id, stage_id } = req.query;

    if (!agent_id || !stage_id) {
        return res.status(400).json({ error: 'agent_id and stage_id are required' });
    }

    // Verify the agent belongs to the caller's org (prevents cross-org data leak)
    const ownership = await db.query(
        `SELECT 1 FROM agents WHERE id = $1 AND organization_id = $2`,
        [agent_id, organizationId]
    );
    if (ownership.rowCount === 0) {
        return res.status(404).json({ error: 'Agent not found' });
    }

    const result = await db.query(
        `SELECT calculate_deal_probability($1::uuid, $2::uuid) as probability`,
        [stage_id, agent_id]
    );
    
    const probability = result.rows[0]?.probability || 50;
    
    const agentResult = await db.query(
        `SELECT closing_rate, total_deals_closed, total_deals_attempted FROM agents WHERE id = $1`,
        [agent_id]
    );
    
    const agent = agentResult.rows[0] || { closing_rate: 50, total_deals_closed: 0, total_deals_attempted: 0 };
    
    const stageResult = await db.query(
        `SELECT probability, stage_name FROM deal_stages WHERE id = $1`,
        [stage_id]
    );
    const stage = stageResult.rows[0] || { probability: 50, stage_name: 'Unknown' };
    
    res.json({
        calculated_probability: probability,
        stage_probability: stage.probability,
        stage_name: stage.stage_name,
        agent_closing_rate: parseFloat(agent.closing_rate) || 50,
        agent_deals_closed: agent.total_deals_closed || 0,
        agent_deals_attempted: agent.total_deals_attempted || 0,
        formula: 'stage_probability × (0.5 + agent_closing_rate/200)'
    });
}));

export default router;
