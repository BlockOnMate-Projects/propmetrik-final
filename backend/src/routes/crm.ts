/**
 * CRM & Deal Management API Routes
 * Phase 5.3: API endpoints for CRM & Deal Management module
 * 
 * Base path: /api/v1/crm
 * 
 * @module routes/crm
 */

import { Router, Request, Response, NextFunction } from 'express';
import {
    contactService,
    companyService,
    dealService,
    pipelineService,
    pipelineValidator,
    activityService,
    taskService,
    noteService,
    crmDocumentService,
    signatureService,
    agentService
} from '../services/crm-deal-management';
import { targetService } from '../services/crm-deal-management/targetService';
import { commissionService } from '../services/crm-deal-management/commissionService';
import type { DocumentType, SignatureStatus } from '../services/crm-deal-management';
import {
    ContactType,
    LeadStatus,
    DealType,
    DealStatus,
    TaskPriority,
    TaskStatus
} from '../services/crm-deal-management/types';
import db from '../database';
import config from '../config';
import { logger } from '../utils/logger';

const router = Router();

// =====================================================
// HELPER FUNCTIONS
// =====================================================

async function getOrganizationId(req: Request): Promise<string> {
    let id = (req as any).user?.organizationId;
    if (!id) {
        id = req.headers['x-organization-id'] as string;
    }
    if (!id && config.app.env === 'development') {
        const result = await db.query('SELECT id FROM organizations LIMIT 1');
        if (result.rows.length > 0) {
            return result.rows[0].id;
        }
    }
    return id || '00000000-0000-0000-0000-000000000000';
}

async function getUserId(req: Request): Promise<string | undefined> {
    let id = (req as any).user?.id;
    if (!id) {
        id = req.headers['x-user-id'] as string;
    }
    if (!id && config.app.env === 'development') {
        const result = await db.query('SELECT id FROM users LIMIT 1');
        if (result.rows.length > 0) {
            return result.rows[0].id;
        }
    }
    return id;
}

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void | any>) {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

// =====================================================
// CONTACT ROUTES
// =====================================================

router.get('/contacts', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const filters = {
        contact_type: req.query.type as ContactType | undefined,
        lead_status: req.query.status as LeadStatus | undefined,
        assigned_to: req.query.assignedTo as string | undefined,
        region: req.query.region as string | undefined,
        search: req.query.search as string | undefined,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        lead_score_min: req.query.minLeadScore ? parseInt(req.query.minLeadScore as string) : undefined,
        lead_score_max: req.query.maxLeadScore ? parseInt(req.query.maxLeadScore as string) : undefined,
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
        sort_by: req.query.sortBy as string || 'created_at',
        sort_order: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    const result = await contactService.listContacts(organizationId, filters);
    res.json(result);
}));

router.post('/contacts', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    const contact = await contactService.createContact(organizationId, req.body, userId);
    res.status(201).json(contact);
}));

router.get('/contacts/stats', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    const statistics = await contactService.getContactStats(organizationId);
    res.json(statistics);
}));

router.get('/contacts/statistics', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    const statistics = await contactService.getContactStats(organizationId);
    res.json(statistics);
}));

router.get('/contacts/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const contact = await contactService.getContactById(req.params.id, organizationId);
    if (!contact) {
        return res.status(404).json({ error: 'Contact not found' });
    }
    res.json(contact);
}));

router.put('/contacts/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const contact = await contactService.updateContact(req.params.id, organizationId, req.body, userId);
    res.json(contact);
}));

router.delete('/contacts/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    try {
        await contactService.deleteContact(req.params.id, organizationId);
        res.status(204).send();
    } catch (error: any) {
        if (error.message?.includes('not found')) {
            return res.status(404).json({ error: 'Contact not found' });
        }
        throw error;
    }
}));

router.put('/contacts/:id/lead-score', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { adjustment } = req.body;
    if (typeof adjustment !== 'number') {
        return res.status(400).json({ error: 'adjustment must be a number' });
    }
    try {
        const contact = await contactService.updateLeadScore(req.params.id, organizationId, adjustment);
        res.json(contact);
    } catch (error: any) {
        if (error.message?.includes('not found')) {
            return res.status(404).json({ error: 'Contact not found' });
        }
        throw error;
    }
}));

// Get deals for a contact
router.get('/contacts/:id/deals', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const contactId = req.params.id;
    
    const result = await db.query(
        `SELECT d.* FROM deals d
         WHERE d.organization_id = $1 
         AND d.deleted_at IS NULL
         AND (d.primary_contact_id = $2 OR d.id IN (
             SELECT deal_id FROM deal_contacts WHERE contact_id = $2
         ))
         ORDER BY d.created_at DESC`,
        [organizationId, contactId]
    );
    
    res.json(result.rows);
}));

// Get tasks for a contact
router.get('/contacts/:id/tasks', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const contactId = req.params.id;
    
    const result = await db.query(
        `SELECT t.* FROM tasks t
         WHERE t.organization_id = $1 
         AND t.deleted_at IS NULL
         AND t.contact_id = $2
         ORDER BY t.due_date ASC`,
        [organizationId, contactId]
    );
    
    res.json(result.rows);
}));

// Get activities for a contact
router.get('/contacts/:id/activities', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const contactId = req.params.id;
    
    const result = await db.query(
        `SELECT a.* FROM deal_activities a
         WHERE a.organization_id = $1 
         AND a.contact_id = $2
         ORDER BY a.created_at DESC
         LIMIT 20`,
        [organizationId, contactId]
    );
    
    res.json(result.rows);
}));

// =====================================================
// COMPANY ROUTES
// =====================================================

router.get('/companies', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const filters = {
        company_type: req.query.type as string | undefined,
        industry: req.query.industry as string | undefined,
        region: req.query.region as string | undefined,
        search: req.query.search as string | undefined,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
        sort_by: req.query.sortBy as string || 'created_at',
        sort_order: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    const result = await companyService.listCompanies(organizationId, filters);
    res.json(result);
}));

router.post('/companies', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    const company = await companyService.createCompany(organizationId, req.body, userId);
    res.status(201).json(company);
}));

router.get('/companies/statistics', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    const statistics = await companyService.getCompanyStats(organizationId);
    res.json(statistics);
}));

router.get('/companies/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const company = await companyService.getCompanyById(req.params.id, organizationId);
    if (!company) {
        return res.status(404).json({ error: 'Company not found' });
    }
    res.json(company);
}));

router.put('/companies/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const company = await companyService.updateCompany(req.params.id, organizationId, req.body, userId);
    res.json(company);
}));

router.delete('/companies/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    try {
        await companyService.deleteCompany(req.params.id, organizationId);
        res.status(204).send();
    } catch (error: any) {
        if (error.message?.includes('not found')) {
            return res.status(404).json({ error: 'Company not found' });
        }
        throw error;
    }
}));

router.get('/companies/:id/contacts', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const contacts = await companyService.getCompanyContacts(req.params.id, organizationId);
    res.json(contacts);
}));

router.get('/companies/:id/deals', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const deals = await companyService.getCompanyDeals(req.params.id, organizationId);
    res.json(deals);
}));

// =====================================================
// AGENT ROUTES
// =====================================================

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

// Calculate deal probability based on agent performance and stage
router.get('/probability/calculate', asyncHandler(async (req: Request, res: Response) => {
    const { agent_id, stage_id } = req.query;
    
    if (!agent_id || !stage_id) {
        return res.status(400).json({ error: 'agent_id and stage_id are required' });
    }

    const result = await db.query(
        `SELECT calculate_deal_probability($1::uuid, $2::uuid) as probability`,
        [stage_id, agent_id]
    );
    
    const probability = result.rows[0]?.probability || 50;
    
    // Also get agent closing rate for context
    const agentResult = await db.query(
        `SELECT closing_rate, total_deals_closed, total_deals_attempted FROM agents WHERE id = $1`,
        [agent_id]
    );
    
    const agent = agentResult.rows[0] || { closing_rate: 50, total_deals_closed: 0, total_deals_attempted: 0 };
    
    // Get stage probability
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

// =====================================================
// DEAL ROUTES
// =====================================================

router.get('/deals', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const filters = {
        deal_type: req.query.type as DealType | undefined,
        deal_status: req.query.status as DealStatus | undefined,
        pipeline_id: req.query.pipelineId as string | undefined,
        stage_id: req.query.stageId as string | undefined,
        assigned_agent: req.query.assignedTo as string | undefined,
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
    
    // If no pipelineId provided, get the default pipeline
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
            // Get any active pipeline
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
    const kanbanData = await dealService.getDealsByStage(organizationId, pipelineId);
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

router.post('/deals', asyncHandler(async (req: Request, res: Response) => {
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

router.put('/deals/:id', asyncHandler(async (req: Request, res: Response) => {
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

router.post('/deals/:id/stage', asyncHandler(async (req: Request, res: Response) => {
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
        organizationId,
        stageId,
        reason,
        userId
    );

    res.json(deal);
}));

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

    // Update deal status
    const updateQuery = `
        UPDATE deals 
        SET 
            deal_status = $1,
            closed_at = CASE WHEN $1 IN ('won', 'lost') THEN NOW() ELSE closed_at END,
            deal_value = COALESCE($2, deal_value),
            close_reason = $3,
            updated_at = NOW(),
            updated_by = $4
        WHERE id = $5 AND organization_id = $6
        RETURNING *
    `;

    const result = await db.query(updateQuery, [
        status,
        final_value,
        reason,
        userId,
        req.params.id,
        organizationId
    ]);

    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Deal not found' });
    }

    const updatedDeal = result.rows[0];

    // Log status change activity
    await activityService.createActivity({
        deal_id: req.params.id,
        user_id: userId || currentDeal.assigned_agent,
        activity_type: 'deal_status_change',
        subject: `Deal marked as ${status}`,
        description: reason || `Deal status changed to ${status}`,
        outcome: 'completed',
        old_value: { status: currentDeal.deal_status },
        new_value: { status, final_value, transaction_date },
    });

    // If deal is WON, trigger Data Hub transaction sync
    const propertyIds = currentDeal.property_ids || [];
    if (status === 'won' && propertyIds.length > 0) {
        logger.info('Deal won - triggering Data Hub transaction sync', {
            dealId: req.params.id,
            propertyIds,
            organizationId
        });

        // Sync transaction data for each property in the deal
        for (const propertyId of propertyIds) {
            try {
                // Get property details for snapshot
                const propResult = await db.query(
                    `SELECT property_type, region, address_city, bedrooms, bathrooms, 
                            total_area_sqm, land_area_sqm, latitude, longitude, digital_address
                     FROM crm_properties WHERE id = $1`,
                    [propertyId]
                );
                const prop = propResult.rows[0] || {};

                // Queue transaction sync job with correct signature
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
                    { priority: 1 } // High priority
                );

                logger.info('Queued transaction sync job', { propertyId, dealId: req.params.id });
            } catch (syncError) {
                logger.error('Failed to queue transaction sync', { 
                    error: syncError, 
                    propertyId, 
                    dealId: req.params.id 
                });
                // Don't fail the deal update if sync fails
            }
        }
    }

    res.json({
        ...updatedDeal,
        transaction_sync_queued: status === 'won' && propertyIds.length > 0
    });
}));

// Get deal status history
router.get('/deals/:id/status-history', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    // Verify deal access
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

router.post('/deals/:id/activities', asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req);
    const activity = await activityService.createActivity({
        ...req.body,
        deal_id: req.params.id,
        user_id: userId
    });
    res.status(201).json(activity);
}));

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

// =====================================================
// PIPELINE ROUTES
// =====================================================

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

router.post('/pipelines', asyncHandler(async (req: Request, res: Response) => {
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

router.put('/pipelines/:pipelineId/stages/reorder', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { stageOrder } = req.body;
    if (!Array.isArray(stageOrder)) {
        return res.status(400).json({ error: 'stageOrder must be an array' });
    }
    await pipelineService.reorderStages(req.params.pipelineId, organizationId, stageOrder);
    res.json({ success: true });
}));

// =====================================================
// TASK ROUTES
// =====================================================

router.get('/tasks', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const filters = {
        status: req.query.status as TaskStatus | undefined,
        priority: req.query.priority as TaskPriority | undefined,
        assigned_to: req.query.assignedTo as string | undefined,
        deal_id: req.query.dealId as string | undefined,
        contact_id: req.query.contactId as string | undefined,
        property_id: req.query.propertyId as string | undefined,
        due_before: req.query.dueBefore ? new Date(req.query.dueBefore as string) : undefined,
        due_after: req.query.dueAfter ? new Date(req.query.dueAfter as string) : undefined,
        search: req.query.search as string | undefined,
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
        sort_by: req.query.sortBy as string || 'due_date',
        sort_order: (req.query.sortOrder as 'asc' | 'desc') || 'asc'
    };

    const result = await taskService.listTasks(organizationId, filters);
    res.json(result);
}));

router.get('/tasks/overdue', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = req.query.userId as string | undefined;
    const result = await taskService.getOverdueTasks(organizationId, userId);
    res.json(result);
}));

router.post('/tasks', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    const task = await taskService.createTask(organizationId, req.body, userId);
    res.status(201).json(task);
}));

router.get('/tasks/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const task = await taskService.getTaskById(req.params.id, organizationId);
    if (!task) {
        return res.status(404).json({ error: 'Task not found' });
    }
    res.json(task);
}));

router.put('/tasks/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const task = await taskService.updateTask(req.params.id, organizationId, req.body, userId);
    res.json(task);
}));

router.delete('/tasks/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    try {
        await taskService.deleteTask(req.params.id, organizationId);
        res.status(204).send();
    } catch (error: any) {
        if (error.message?.includes('not found')) {
            return res.status(404).json({ error: 'Task not found' });
        }
        throw error;
    }
}));

router.post('/tasks/:id/complete', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const task = await taskService.completeTask(req.params.id, organizationId, userId);
    res.json(task);
}));

// =====================================================
// NOTE ROUTES
// =====================================================

router.get('/notes', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const filters = {
        deal_id: req.query.dealId as string | undefined,
        contact_id: req.query.contactId as string | undefined,
        property_id: req.query.propertyId as string | undefined,
        company_id: req.query.companyId as string | undefined,
        created_by: req.query.createdBy as string | undefined,
        is_pinned: req.query.pinnedOnly === 'true' ? true : undefined,
        search: req.query.search as string | undefined,
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
        sort_by: req.query.sortBy as string || 'created_at',
        sort_order: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    const result = await noteService.listNotes(organizationId, filters, userId);
    res.json(result);
}));

router.post('/notes', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }
    const note = await noteService.createNote(organizationId, req.body, userId);
    res.status(201).json(note);
}));

router.get('/notes/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const note = await noteService.getNoteById(req.params.id, organizationId, userId);
    if (!note) {
        return res.status(404).json({ error: 'Note not found' });
    }
    res.json(note);
}));

router.put('/notes/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }
    const note = await noteService.updateNote(req.params.id, organizationId, req.body, userId);
    if (!note) {
        return res.status(404).json({ error: 'Note not found' });
    }
    res.json(note);
}));

router.delete('/notes/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }
    try {
        await noteService.deleteNote(req.params.id, organizationId, userId);
        res.status(204).send();
    } catch (error: any) {
        if (error.message?.includes('not found') || error.message?.includes('permission')) {
            return res.status(404).json({ error: 'Note not found' });
        }
        throw error;
    }
}));

router.post('/notes/:id/pin', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }
    const note = await noteService.togglePin(req.params.id, organizationId, userId);
    if (!note) {
        return res.status(404).json({ error: 'Note not found' });
    }
    res.json(note);
}));

// =====================================================
// DOCUMENT ROUTES
// =====================================================

router.get('/documents', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const filters = {
        deal_id: req.query.dealId as string | undefined,
        contact_id: req.query.contactId as string | undefined,
        property_id: req.query.propertyId as string | undefined,
        document_type: req.query.type as DocumentType | undefined,
        uploaded_by: req.query.uploadedBy as string | undefined,
        search: req.query.search as string | undefined,
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
        sort_by: req.query.sortBy as string || 'created_at',
        sort_order: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    const result = await crmDocumentService.listDocuments(organizationId, filters);
    res.json(result);
}));

router.get('/documents/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const document = await crmDocumentService.getDocumentById(req.params.id, organizationId);
    if (!document) {
        return res.status(404).json({ error: 'Document not found' });
    }
    res.json(document);
}));

router.get('/documents/:id/download', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const expiresIn = parseInt(req.query.expiresIn as string) || 3600;
    const downloadUrl = await crmDocumentService.getDownloadUrl(req.params.id, organizationId, expiresIn);
    if (!downloadUrl) {
        return res.status(404).json({ error: 'Document not found' });
    }
    res.json({ url: downloadUrl, expiresIn });
}));

router.put('/documents/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const document = await crmDocumentService.updateDocument(req.params.id, organizationId, req.body, userId);
    if (!document) {
        return res.status(404).json({ error: 'Document not found' });
    }
    res.json(document);
}));

router.delete('/documents/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    try {
        await crmDocumentService.deleteDocument(req.params.id, organizationId);
        res.status(204).send();
    } catch (error: any) {
        if (error.message?.includes('not found')) {
            return res.status(404).json({ error: 'Document not found' });
        }
        throw error;
    }
}));

router.get('/documents/:id/versions', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const versions = await crmDocumentService.getDocumentVersions(req.params.id, organizationId);
    if (!versions) {
        return res.status(404).json({ error: 'Document not found' });
    }
    res.json(versions);
}));

// =====================================================
// SIGNATURE ROUTES
// =====================================================

router.get('/signatures', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const filters = {
        deal_id: req.query.dealId as string | undefined,
        document_id: req.query.documentId as string | undefined,
        status: req.query.status as SignatureStatus | undefined,
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 20, 100)
    };

    const result = await signatureService.listEnvelopes(organizationId, filters);
    res.json(result);
}));

router.post('/signatures', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }
    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }
    const envelope = await signatureService.createSignatureEnvelope(organizationId, req.body, userId);
    res.status(201).json(envelope);
}));

router.get('/signatures/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const envelope = await signatureService.getEnvelopeById(req.params.id, organizationId);
    if (!envelope) {
        return res.status(404).json({ error: 'Signature envelope not found' });
    }
    res.json(envelope);
}));

router.post('/signatures/:id/send', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const envelope = await signatureService.sendSignatureRequest(req.params.id, organizationId, userId);
    if (!envelope) {
        return res.status(404).json({ error: 'Signature envelope not found' });
    }
    res.json(envelope);
}));

router.post('/signatures/:id/cancel', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const { reason } = req.body;
    const envelope = await signatureService.cancelEnvelope(req.params.id, organizationId, reason, userId);
    if (!envelope) {
        return res.status(404).json({ error: 'Signature envelope not found' });
    }
    res.json(envelope);
}));

router.post('/signatures/:id/remind', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    await signatureService.resendRequest(req.params.id, organizationId);
    res.json({ success: true });
}));

// =====================================================
// ANALYTICS ROUTES
// =====================================================

router.get('/analytics/pipeline', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const pipelineId = req.query.pipelineId as string;
    if (!pipelineId) {
        return res.status(400).json({ error: 'pipelineId is required' });
    }

    const analyticsQuery = `
        WITH stage_metrics AS (
            SELECT 
                ds.id as stage_id,
                ds.name as stage_name,
                ds.position,
                COUNT(DISTINCT d.id) as deal_count,
                COALESCE(SUM(d.deal_value), 0) as total_value
            FROM deal_stages ds
            LEFT JOIN deals d ON d.stage_id = ds.id 
                AND d.deleted_at IS NULL
                AND d.organization_id = $1
            WHERE ds.pipeline_id = $2 AND ds.deleted_at IS NULL
            GROUP BY ds.id, ds.name, ds.position
            ORDER BY ds.position
        ),
        conversion_metrics AS (
            SELECT 
                COUNT(CASE WHEN d.deal_status = 'won' THEN 1 END) as won_deals,
                COUNT(CASE WHEN d.deal_status = 'lost' THEN 1 END) as lost_deals,
                COUNT(*) as total_deals,
                COALESCE(SUM(CASE WHEN d.deal_status = 'won' THEN d.deal_value END), 0) as won_value
            FROM deals d
            WHERE d.pipeline_id = $2 AND d.organization_id = $1 AND d.deleted_at IS NULL
        )
        SELECT 
            json_build_object(
                'stages', (SELECT json_agg(row_to_json(stage_metrics.*)) FROM stage_metrics),
                'conversion', (SELECT row_to_json(conversion_metrics.*) FROM conversion_metrics)
            ) as analytics
    `;

    const result = await db.query(analyticsQuery, [organizationId, pipelineId]);
    res.json(result.rows[0]?.analytics || { stages: [], conversion: {} });
}));

// Deal metrics endpoint
router.get('/analytics/deals', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const dealType = req.query.deal_type as string;
    const dateFrom = req.query.date_from as string;
    const dateTo = req.query.date_to as string;

    let whereClause = 'd.organization_id = $1 AND d.deleted_at IS NULL';
    const params: any[] = [organizationId];

    if (dealType) {
        params.push(dealType);
        whereClause += ` AND d.deal_type = $${params.length}`;
    }
    if (dateFrom) {
        params.push(dateFrom);
        whereClause += ` AND d.created_at >= $${params.length}`;
    }
    if (dateTo) {
        params.push(dateTo);
        whereClause += ` AND d.created_at <= $${params.length}`;
    }

    const query = `
        SELECT 
            COUNT(*) as "totalDeals",
            COALESCE(SUM(deal_value), 0) as "totalValue",
            COALESCE(SUM(CASE WHEN deal_status = 'won' THEN deal_value ELSE 0 END), 0) as "wonValue",
            COALESCE(SUM(CASE WHEN deal_status = 'lost' THEN deal_value ELSE 0 END), 0) as "lostValue",
            COUNT(CASE WHEN deal_status = 'won' THEN 1 END) as "wonDeals",
            COUNT(CASE WHEN deal_status = 'lost' THEN 1 END) as "lostDeals",
            CASE 
                WHEN COUNT(*) > 0 
                THEN COUNT(CASE WHEN deal_status = 'won' THEN 1 END)::float / 
                     NULLIF(COUNT(CASE WHEN deal_status IN ('won', 'lost') THEN 1 END), 0)
                ELSE 0 
            END as "conversionRate"
        FROM deals d WHERE ${whereClause}
    `;

    const result = await db.query(query, params);
    res.json(result.rows[0] || { totalDeals: 0, totalValue: 0, wonValue: 0, lostValue: 0, conversionRate: 0 });
}));

// Agent performance endpoint
router.get('/analytics/agents', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const query = `
        SELECT 
            d.assigned_agent as user_id,
            COALESCE(u.first_name || ' ' || u.last_name, 'Unassigned') as name,
            COUNT(d.id) as total_deals,
            COUNT(CASE WHEN d.deal_status = 'won' THEN 1 END) as won_deals,
            COALESCE(SUM(d.deal_value), 0) as pipeline_value,
            COALESCE(SUM(CASE WHEN d.deal_status = 'won' THEN d.deal_value END), 0) as won_value,
            CASE 
                WHEN COUNT(CASE WHEN d.deal_status IN ('won', 'lost') THEN 1 END) > 0
                THEN ROUND((COUNT(CASE WHEN d.deal_status = 'won' THEN 1 END)::numeric / 
                     COUNT(CASE WHEN d.deal_status IN ('won', 'lost') THEN 1 END)) * 100, 1)
                ELSE 0 
            END as win_rate
        FROM deals d
        LEFT JOIN users u ON u.id = d.assigned_agent
        WHERE d.organization_id = $1 AND d.deleted_at IS NULL
        GROUP BY d.assigned_agent, u.first_name, u.last_name
        ORDER BY won_value DESC
        LIMIT 20
    `;

    const result = await db.query(query, [organizationId]);
    res.json(result.rows);
}));

// Revenue forecast endpoint
router.get('/analytics/revenue-forecast', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    const quarterEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0);

    const query = `
        WITH stage_forecasts AS (
            SELECT 
                ds.stage_name,
                COALESCE(SUM(d.deal_value), 0) as value,
                COALESCE(ds.probability, 50) as probability
            FROM deals d
            JOIN deal_stages ds ON d.stage_id = ds.id
            WHERE d.organization_id = $1 
              AND d.deleted_at IS NULL 
              AND d.deal_status = 'active'
            GROUP BY ds.stage_name, ds.probability
        )
        SELECT 
            json_build_object(
                'current_month', COALESCE((
                    SELECT SUM(deal_value) 
                    FROM deals 
                    WHERE organization_id = $1 
                      AND deal_status = 'won' 
                      AND actual_close_date >= $2 
                      AND actual_close_date < $3
                ), 0),
                'next_month', COALESCE((
                    SELECT SUM(deal_value * COALESCE(ds.probability, 50) / 100.0)
                    FROM deals d
                    JOIN deal_stages ds ON d.stage_id = ds.id
                    WHERE d.organization_id = $1 
                      AND d.deal_status = 'active'
                      AND d.estimated_close_date >= $3 
                      AND d.estimated_close_date <= $4
                ), 0),
                'quarter', COALESCE((
                    SELECT SUM(deal_value * COALESCE(ds.probability, 50) / 100.0)
                    FROM deals d
                    JOIN deal_stages ds ON d.stage_id = ds.id
                    WHERE d.organization_id = $1 
                      AND d.deal_status = 'active'
                      AND d.estimated_close_date <= $5
                ), 0),
                'by_stage', COALESCE((SELECT json_agg(row_to_json(stage_forecasts.*)) FROM stage_forecasts), '[]'::json)
            ) as forecast
    `;

    const result = await db.query(query, [
        organizationId, 
        currentMonthStart, 
        nextMonthStart, 
        nextMonthEnd,
        quarterEnd
    ]);
    res.json(result.rows[0]?.forecast || { current_month: 0, next_month: 0, quarter: 0, by_stage: [] });
}));

router.get('/analytics/leaderboard', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const period = req.query.period as string || 'month';
    let dateFrom: Date;
    const now = new Date();
    
    switch (period) {
        case 'week':
            dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case 'quarter':
            dateFrom = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
            break;
        case 'year':
            dateFrom = new Date(now.getFullYear(), 0, 1);
            break;
        default:
            dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const query = `
        SELECT 
            d.assigned_agent as user_id,
            u.first_name || ' ' || u.last_name as user_name,
            COUNT(d.id) as deals_closed,
            COALESCE(SUM(d.deal_value), 0) as total_value,
            COUNT(CASE WHEN d.deal_status = 'won' THEN 1 END) as deals_won
        FROM deals d
        LEFT JOIN users u ON u.id = d.assigned_agent
        WHERE d.organization_id = $1 AND d.deleted_at IS NULL
            AND d.actual_close_date >= $2 AND d.deal_status IN ('won', 'lost')
        GROUP BY d.assigned_agent, u.first_name, u.last_name
        ORDER BY total_value DESC LIMIT 20
    `;

    const result = await db.query(query, [organizationId, dateFrom]);
    res.json({ period, dateRange: { from: dateFrom, to: now }, leaderboard: result.rows });
}));

// =====================================================
// PROPERTY ROUTES (CRM Standalone Properties)
// =====================================================

// Get properties from CRM's own crm_properties table (independent from Property Management)
router.get('/properties', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const {
        search,
        listing_type,
        property_type,
        status,
        region,
        include_deals,
        limit = 50,
        offset = 0
    } = req.query;

    // Query properties from crm_properties table (CRM's own data)
    let whereClause = 'p.organization_id = $1';
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (search) {
        params.push(`%${search}%`);
        whereClause += ` AND (p.title ILIKE $${paramIndex} OR p.address_street ILIKE $${paramIndex} OR p.address_city ILIKE $${paramIndex})`;
        paramIndex++;
    }

    if (listing_type && listing_type !== 'all') {
        params.push(listing_type);
        whereClause += ` AND p.transaction_type = $${paramIndex}`;
        paramIndex++;
    }

    if (property_type && property_type !== 'all') {
        params.push(property_type);
        whereClause += ` AND p.property_type = $${paramIndex}`;
        paramIndex++;
    }

    if (status && status !== 'all') {
        params.push(status);
        whereClause += ` AND p.status = $${paramIndex}`;
        paramIndex++;
    }

    if (region && region !== 'all') {
        params.push(region);
        whereClause += ` AND p.region = $${paramIndex}`;
        paramIndex++;
    }

    params.push(parseInt(limit as string) || 50);
    const limitParam = paramIndex++;
    params.push(parseInt(offset as string) || 0);
    const offsetParam = paramIndex++;

    const query = `
        WITH property_deals AS (
            SELECT 
                pid as property_id,
                COUNT(*) as deal_count,
                COUNT(CASE WHEN d.deal_status = 'active' THEN 1 END) as active_deals
            FROM deals d, LATERAL unnest(d.property_ids) as pid
            WHERE d.organization_id = $1 AND d.deleted_at IS NULL
            GROUP BY pid
        ),
        stage_counts AS (
            SELECT pipeline_id, COUNT(*) as total_stages
            FROM deal_stages
            GROUP BY pipeline_id
        )
        SELECT 
            p.id,
            p.reference_number,
            p.title as property_name,
            p.property_type,
            p.transaction_type as listing_type,
            p.address_street as address,
            p.address_city as city,
            p.region,
            p.digital_address,
            p.price,
            p.price_currency as currency,
            p.bedrooms,
            p.bathrooms,
            p.total_area_sqm as area_sqm,
            p.land_area_sqm as land_size_sqm,
            p.status,
            p.owner_name,
            p.owner_phone,
            p.features,
            p.pipeline_id,
            p.current_stage_id,
            p.stage_entered_at,
            p.days_in_stage,
            dp.pipeline_name,
            ds.stage_name as current_stage_name,
            ds.stage_color as current_stage_color,
            ds.stage_order as current_stage_order,
            COALESCE(sc.total_stages, 0) as total_stages,
            p.created_at,
            COALESCE(pd.deal_count, 0) as deal_count,
            COALESCE(pd.active_deals, 0) as active_deals
        FROM crm_properties p
        LEFT JOIN property_deals pd ON pd.property_id = p.id
        LEFT JOIN deal_pipelines dp ON dp.id = p.pipeline_id
        LEFT JOIN deal_stages ds ON ds.id = p.current_stage_id
        LEFT JOIN stage_counts sc ON sc.pipeline_id = p.pipeline_id
        WHERE ${whereClause}
        ORDER BY p.created_at DESC
        LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    try {
        const [propertiesResult, countResult, statsResult, withDealsResult] = await Promise.all([
            db.query(query, params),
            db.query(`SELECT COUNT(*) as total FROM crm_properties p WHERE p.organization_id = $1`, [organizationId]),
            db.query(`
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN status = 'active' THEN 1 END) as available,
                    COUNT(CASE WHEN status = 'under_offer' THEN 1 END) as under_offer
                FROM crm_properties 
                WHERE organization_id = $1
            `, [organizationId]),
            // Calculate properties with active deals using LATERAL unnest
            db.query(`
                SELECT COUNT(DISTINCT pid) as count
                FROM deals d, LATERAL unnest(d.property_ids) as pid
                WHERE d.organization_id = $1 AND d.deal_status = 'active' AND d.deleted_at IS NULL
            `, [organizationId])
        ]);

        res.json({
            properties: propertiesResult.rows,
            total: parseInt(countResult.rows[0]?.total || '0'),
            stats: {
                total: parseInt(statsResult.rows[0]?.total || '0'),
                available: parseInt(statsResult.rows[0]?.available || '0'),
                under_offer: parseInt(statsResult.rows[0]?.under_offer || '0'),
                with_active_deals: parseInt(withDealsResult.rows[0]?.count || '0')
            }
        });
    } catch (err: any) {
        // Log the actual error for debugging
        console.error('CRM Properties query error:', err.message);
        res.status(500).json({ error: 'Failed to fetch properties', details: err.message });
    }
}));

// Get single CRM property
router.get('/properties/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { id } = req.params;

    const query = `
        SELECT 
            p.id,
            p.reference_number,
            p.title as property_name,
            p.property_type,
            p.transaction_type as listing_type,
            p.description,
            p.address_street as address,
            p.address_city as city,
            p.region,
            p.digital_address,
            p.landmark,
            p.latitude,
            p.longitude,
            p.price,
            p.price_currency as currency,
            p.price_negotiable,
            p.bedrooms,
            p.bathrooms,
            p.total_area_sqm as area_sqm,
            p.land_area_sqm as land_size_sqm,
            p.floors,
            p.year_built,
            p.status,
            p.features,
            p.amenities,
            p.owner_name,
            p.owner_phone,
            p.owner_email,
            p.owner_type,
            p.images,
            p.documents,
            p.virtual_tour_url,
            p.active_deal_id,
            p.total_deals,
            p.created_at,
            p.updated_at
        FROM crm_properties p
        WHERE p.id = $1 AND p.organization_id = $2
    `;

    const result = await db.query(query, [id, organizationId]);

    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Property not found' });
    }

    // Also get deals associated with this property
    const dealsResult = await db.query(`
        SELECT id, title as deal_title, deal_type, deal_status, deal_value, currency, created_at
        FROM deals 
        WHERE organization_id = $1 AND $2 = ANY(property_ids) AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 10
    `, [organizationId, id]);

    res.json({
        ...result.rows[0],
        deals: dealsResult.rows
    });
}));

// Submit new CRM property (client submission)
router.post('/properties/submit', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const userId = (req as any).user?.id || (req as any).user?.sub;
    const {
        property_name,
        property_type = 'residential',
        listing_type = 'sale',
        address,
        city,
        region = 'greater_accra',
        digital_address,
        landmark,
        price,
        currency = 'GHS',
        bedrooms,
        bathrooms,
        area_sqm,
        land_size_sqm,
        floors,
        year_built,
        description,
        features,
        amenities,
        owner_name,
        owner_phone,
        owner_email,
        owner_type
    } = req.body;

    // Generate a reference number
    const refResult = await db.query("SELECT 'CRM-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD((SELECT COALESCE(MAX(CAST(SUBSTRING(reference_number FROM 10) AS INTEGER)), 0) + 1 FROM crm_properties WHERE reference_number LIKE 'CRM-' || TO_CHAR(NOW(), 'YYYY') || '-%')::TEXT, 4, '0') as ref_num");
    const referenceNumber = refResult.rows[0]?.ref_num || `CRM-${Date.now()}`;

    const query = `
        INSERT INTO crm_properties (
            organization_id, reference_number, title, property_type, transaction_type,
            address_street, address_city, region, digital_address, landmark,
            price, price_currency, bedrooms, bathrooms,
            total_area_sqm, land_area_sqm, floors, year_built, description, 
            features, amenities, owner_name, owner_phone, owner_email, owner_type,
            status, created_by, created_at
        ) VALUES (
            $1, $2, $3, $4, $5, 
            $6, $7, $8, $9, $10,
            $11, $12, $13, $14,
            $15, $16, $17, $18, $19,
            $20, $21, $22, $23, $24, $25,
            'pending', $26, NOW()
        )
        RETURNING *
    `;

    const result = await db.query(query, [
        organizationId,
        referenceNumber,
        property_name,
        property_type,
        listing_type,
        address,
        city,
        region,
        digital_address,
        landmark,
        price,
        currency,
        bedrooms,
        bathrooms,
        area_sqm,
        land_size_sqm,
        floors,
        year_built,
        description,
        features ? JSON.stringify(features) : null,
        amenities ? JSON.stringify(amenities) : null,
        owner_name,
        owner_phone,
        owner_email,
        owner_type,
        userId
    ]);

    res.status(201).json(result.rows[0]);
}));

// Update CRM property
router.patch('/properties/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { id } = req.params;
    const updates = req.body;
    const userId = (req as any).user?.id || (req as any).user?.sub;

    // Build dynamic update query
    const allowedFields = [
        'title', 'description', 'property_type', 'transaction_type',
        'address_street', 'address_city', 'region', 'digital_address', 'landmark',
        'price', 'price_currency', 'bedrooms', 'bathrooms',
        'total_area_sqm', 'land_area_sqm', 'floors', 'year_built',
        'features', 'amenities', 'owner_name', 'owner_phone', 'owner_email', 'owner_type',
        'status', 'priority', 'current_stage_id', 'pipeline_id'
    ];

    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
        if (updates[field] !== undefined) {
            if (field === 'features' || field === 'amenities') {
                setClauses.push(`${field} = $${paramIndex}`);
                values.push(JSON.stringify(updates[field]));
            } else {
                setClauses.push(`${field} = $${paramIndex}`);
                values.push(updates[field]);
            }
            paramIndex++;
        }
    }

    // Handle stage change specially - update stage_entered_at
    if (updates.current_stage_id) {
        setClauses.push(`stage_entered_at = NOW()`);
        setClauses.push(`days_in_stage = 0`);
    }

    if (setClauses.length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
    }

    setClauses.push(`updated_at = NOW()`);
    setClauses.push(`updated_by = $${paramIndex}`);
    values.push(userId);
    paramIndex++;

    values.push(id);
    values.push(organizationId);

    const query = `
        UPDATE crm_properties 
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIndex - 1} AND organization_id = $${paramIndex}
        RETURNING *
    `;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Property not found' });
    }

    res.json(result.rows[0]);
}));

// Update property stage (quick action)
router.patch('/properties/:id/stage', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { id } = req.params;
    const { stage_id } = req.body;

    if (!stage_id) {
        return res.status(400).json({ error: 'stage_id is required' });
    }

    const query = `
        UPDATE crm_properties 
        SET 
            current_stage_id = $1,
            stage_entered_at = NOW(),
            days_in_stage = 0,
            updated_at = NOW()
        WHERE id = $2 AND organization_id = $3
        RETURNING 
            id,
            title as property_name,
            current_stage_id,
            stage_entered_at,
            days_in_stage,
            (SELECT stage_name FROM deal_stages WHERE id = $1) as new_stage_name,
            (SELECT stage_color FROM deal_stages WHERE id = $1) as new_stage_color,
            (SELECT stage_order FROM deal_stages WHERE id = $1) as new_stage_order
    `;

    const result = await db.query(query, [stage_id, id, organizationId]);

    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Property not found' });
    }

    res.json(result.rows[0]);
}));

// Get pipeline stages for a property
router.get('/properties/:id/stages', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { id } = req.params;

    // Get property's pipeline and all its stages
    const query = `
        SELECT 
            ds.id,
            ds.stage_name,
            ds.stage_order,
            ds.stage_color,
            ds.probability,
            ds.id = p.current_stage_id as is_current
        FROM crm_properties p
        JOIN deal_stages ds ON ds.pipeline_id = p.pipeline_id
        WHERE p.id = $1 AND p.organization_id = $2
        ORDER BY ds.stage_order
    `;

    const result = await db.query(query, [id, organizationId]);

    res.json({ stages: result.rows });
}));

// =====================================================
// PROPERTY SYNC ROUTES (Phase 5.6 - CRM → Data Hub)
// =====================================================

import { crmPropertySyncService } from '../services/crm-deal-management/crmPropertySyncService';
import { dataHubQueueManager, DataHubQueueManager, CrmPropertySyncJobData, CrmTransactionSyncJobData } from '../services/data-hub/jobQueue';

// Trigger manual sync for a property
router.post('/properties/:id/sync', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { id } = req.params;
    const userId = (req as any).user?.id || (req as any).user?.sub;
    const { async: useAsync } = req.query;

    // Verify property belongs to organization
    const propCheck = await db.query(
        `SELECT id, sync_status FROM crm_properties WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
        [id, organizationId]
    );

    if (propCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Property not found' });
    }

    // If async, queue the sync job
    if (useAsync === 'true') {
        const jobData: CrmPropertySyncJobData = {
            crmPropertyId: id,
            organizationId,
            triggerSource: 'manual',
            triggeredBy: userId,
        };

        const job = await dataHubQueueManager.addJob(
            DataHubQueueManager.QUEUES.CRM_PROPERTY_SYNC,
            jobData,
            { priority: 1 } // High priority for manual sync
        );

        return res.json({
            message: 'Sync queued',
            jobId: job.id,
            propertyId: id,
        });
    }

    // Synchronous sync
    const result = await crmPropertySyncService.syncToDataHub(id, userId, 'manual');

    if (result.success) {
        res.json({
            message: 'Property synced successfully',
            action: result.action,
            datahub_property_id: result.datahub_property_id,
            contribution_id: result.contribution_id,
        });
    } else {
        res.status(400).json({
            error: 'Sync failed',
            action: result.action,
            details: result.error,
            error_code: result.error_code,
        });
    }
}));

// Get sync status for a property
router.get('/properties/:id/sync-status', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { id } = req.params;

    // Verify property belongs to organization
    const propCheck = await db.query(
        `SELECT id FROM crm_properties WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
        [id, organizationId]
    );

    if (propCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Property not found' });
    }

    const status = await crmPropertySyncService.getSyncStatus(id);
    res.json(status);
}));

// Get sync statistics for organization
router.get('/properties/sync/stats', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const stats = await crmPropertySyncService.getSyncStats(organizationId);
    res.json(stats);
}));

// Retry failed syncs for organization
router.post('/properties/sync/retry-failed', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const result = await crmPropertySyncService.retryFailedSyncs(organizationId);
    res.json({
        message: `Retried ${result.retried} properties, ${result.successful} successful`,
        ...result,
    });
}));

// Get pending sync properties
router.get('/properties/sync/pending', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const pendingIds = await crmPropertySyncService.getPendingSyncProperties(organizationId, limit);

    res.json({
        count: pendingIds.length,
        property_ids: pendingIds,
    });
}));

// Bulk sync all pending properties
router.post('/properties/sync/bulk', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const userId = (req as any).user?.id || (req as any).user?.sub;
    const limit = parseInt(req.query.limit as string) || 100;

    const pendingIds = await crmPropertySyncService.getPendingSyncProperties(organizationId, limit);

    if (pendingIds.length === 0) {
        return res.json({ message: 'No pending properties to sync', queued: 0 });
    }

    // Queue all pending properties
    let queued = 0;
    for (const propertyId of pendingIds) {
        const jobData: CrmPropertySyncJobData = {
            crmPropertyId: propertyId,
            organizationId,
            triggerSource: 'auto',
            triggeredBy: userId,
        };

        await dataHubQueueManager.addJob(
            DataHubQueueManager.QUEUES.CRM_PROPERTY_SYNC,
            jobData,
            { priority: 5 } // Normal priority for bulk
        );
        queued++;
    }

    res.json({
        message: `Queued ${queued} properties for sync`,
        queued,
    });
}));

// Get sync history/log for a property
router.get('/properties/:id/sync-log', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { id } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await db.query(
        `SELECT * FROM crm_property_sync_log 
         WHERE crm_property_id = $1 AND organization_id = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [id, organizationId, limit]
    );

    res.json({
        property_id: id,
        logs: result.rows,
    });
}));

// =====================================================
// TARGETS & PERFORMANCE MANAGEMENT
// Phase 5.7 Week 1
// =====================================================

/**
 * GET /targets
 * Get all targets for the organization
 */
router.get('/targets', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const filters = {
        agent_id: req.query.agent_id as string,
        team_id: req.query.team_id as string,
        target_type: req.query.target_type as any,
        target_period: req.query.target_period as any,
        status: req.query.status as any,
        pacing_status: req.query.pacing_status as any,
    };

    const targets = await targetService.getAll(organizationId, filters);
    res.json({ targets });
}));

/**
 * POST /targets
 * Create a new target
 */
router.post('/targets', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const userId = (req as any).user?.id;

    const target = await targetService.create({
        ...req.body,
        organization_id: organizationId,
        created_by: userId,
    });

    res.status(201).json({ target });
}));

/**
 * POST /targets/bulk
 * Create targets for all active agents
 */
router.post('/targets/bulk', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const userId = (req as any).user?.id;
    const { target_type, target_period, target_value, period_start, period_end } = req.body;

    const targets = await targetService.createBulkTargets(
        organizationId,
        target_type,
        target_period,
        target_value,
        new Date(period_start),
        new Date(period_end),
        userId
    );

    res.status(201).json({ 
        message: `Created ${targets.length} targets`,
        targets 
    });
}));

/**
 * GET /targets/stats
 * Get target statistics
 */
router.get('/targets/stats', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const agentId = req.query.agent_id as string;
    const stats = await targetService.getStats(organizationId, agentId);
    res.json({ stats });
}));

/**
 * GET /targets/leaderboard
 * Get agent leaderboard
 */
router.get('/targets/leaderboard', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const period = (req.query.period as 'mtd' | 'qtd' | 'ytd') || 'mtd';
    const limit = parseInt(req.query.limit as string) || 10;

    const leaderboard = await targetService.getLeaderboard(organizationId, period, limit);
    res.json({ leaderboard, period });
}));

/**
 * GET /targets/:id
 * Get a specific target
 */
router.get('/targets/:id', asyncHandler(async (req: Request, res: Response) => {
    const target = await targetService.getById(req.params.id);
    if (!target) {
        return res.status(404).json({ error: 'Target not found' });
    }
    res.json({ target });
}));

/**
 * PATCH /targets/:id
 * Update a target
 */
router.patch('/targets/:id', asyncHandler(async (req: Request, res: Response) => {
    const target = await targetService.update(req.params.id, req.body);
    if (!target) {
        return res.status(404).json({ error: 'Target not found' });
    }
    res.json({ target });
}));

/**
 * DELETE /targets/:id
 * Delete a target
 */
router.delete('/targets/:id', asyncHandler(async (req: Request, res: Response) => {
    const deleted = await targetService.delete(req.params.id);
    if (!deleted) {
        return res.status(404).json({ error: 'Target not found' });
    }
    res.json({ message: 'Target deleted' });
}));

/**
 * POST /targets/:id/refresh
 * Manually refresh target progress
 */
router.post('/targets/:id/refresh', asyncHandler(async (req: Request, res: Response) => {
    await targetService.updateProgress(req.params.id);
    const target = await targetService.getById(req.params.id);
    res.json({ target });
}));

/**
 * GET /targets/:id/checkpoints
 * Get checkpoints for a target
 */
router.get('/targets/:id/checkpoints', asyncHandler(async (req: Request, res: Response) => {
    const checkpoints = await targetService.getCheckpoints(req.params.id);
    res.json({ checkpoints });
}));

/**
 * POST /targets/:id/checkpoints
 * Create a checkpoint for a target
 */
router.post('/targets/:id/checkpoints', asyncHandler(async (req: Request, res: Response) => {
    const { checkpoint_number, expected_value, actual_value, notes } = req.body;
    const checkpoint = await targetService.createCheckpoint(
        req.params.id,
        checkpoint_number,
        expected_value,
        actual_value,
        notes
    );
    res.status(201).json({ checkpoint });
}));

// =====================================================
// ACHIEVEMENTS & GAMIFICATION
// =====================================================

/**
 * GET /achievements/badges
 * Get all available achievement badges
 */
router.get('/achievements/badges', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const badges = await targetService.getBadges(organizationId);
    res.json({ badges });
}));

/**
 * GET /agents/:id/achievements
 * Get achievements for an agent
 */
router.get('/agents/:agentId/achievements', asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const achievements = await targetService.getAgentAchievements(req.params.agentId, limit);
    res.json({ achievements });
}));

/**
 * GET /agents/:id/targets
 * Get active targets for an agent
 */
router.get('/agents/:agentId/targets', asyncHandler(async (req: Request, res: Response) => {
    const targets = await targetService.getActiveForAgent(req.params.agentId);
    res.json({ targets });
}));

/**
 * GET /agents/:id/streak
 * Get streak info for an agent
 */
router.get('/agents/:agentId/streak', asyncHandler(async (req: Request, res: Response) => {
    const streakType = (req.query.type as string) || 'deal_close';
    const streak = await targetService.getStreak(req.params.agentId, streakType);
    res.json({ streak: streak || { current_streak: 0, longest_streak: 0 } });
}));

/**
 * POST /targets/refresh-all
 * Refresh all active targets (for cron job)
 */
router.post('/targets/refresh-all', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const count = await targetService.updateAllActiveTargets(organizationId);
    res.json({ message: `Refreshed ${count} targets` });
}));

// =====================================================
// COMMISSION MANAGEMENT
// Phase 5.7 Week 2
// =====================================================

/**
 * GET /commissions/plans
 * Get all commission plans
 */
router.get('/commissions/plans', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const activeOnly = req.query.active !== 'false';
    const plans = await commissionService.getPlans(organizationId, activeOnly);
    res.json({ plans });
}));

/**
 * POST /commissions/plans
 * Create a new commission plan
 */
router.post('/commissions/plans', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    
    const plan = await commissionService.createPlan({
        ...req.body,
        organization_id: organizationId,
        created_by: userId,
    });
    res.status(201).json({ plan });
}));

/**
 * GET /commissions/plans/:id
 * Get a specific commission plan
 */
router.get('/commissions/plans/:id', asyncHandler(async (req: Request, res: Response) => {
    const plan = await commissionService.getPlan(req.params.id);
    if (!plan) {
        return res.status(404).json({ error: 'Plan not found' });
    }
    res.json({ plan });
}));

/**
 * PATCH /commissions/plans/:id
 * Update a commission plan
 */
router.patch('/commissions/plans/:id', asyncHandler(async (req: Request, res: Response) => {
    const plan = await commissionService.updatePlan(req.params.id, req.body);
    if (!plan) {
        return res.status(404).json({ error: 'Plan not found' });
    }
    res.json({ plan });
}));

/**
 * DELETE /commissions/plans/:id
 * Delete a commission plan
 */
router.delete('/commissions/plans/:id', asyncHandler(async (req: Request, res: Response) => {
    const deleted = await commissionService.deletePlan(req.params.id);
    if (!deleted) {
        return res.status(404).json({ error: 'Plan not found' });
    }
    res.json({ message: 'Plan deleted' });
}));

/**
 * POST /commissions/plans/:id/tiers
 * Add a tier to a commission plan
 */
router.post('/commissions/plans/:id/tiers', asyncHandler(async (req: Request, res: Response) => {
    const tier = await commissionService.addTier(req.params.id, req.body);
    res.status(201).json({ tier });
}));

/**
 * PATCH /commissions/tiers/:id
 * Update a commission tier
 */
router.patch('/commissions/tiers/:id', asyncHandler(async (req: Request, res: Response) => {
    const tier = await commissionService.updateTier(req.params.id, req.body);
    if (!tier) {
        return res.status(404).json({ error: 'Tier not found' });
    }
    res.json({ tier });
}));

/**
 * DELETE /commissions/tiers/:id
 * Delete a commission tier
 */
router.delete('/commissions/tiers/:id', asyncHandler(async (req: Request, res: Response) => {
    const deleted = await commissionService.deleteTier(req.params.id);
    if (!deleted) {
        return res.status(404).json({ error: 'Tier not found' });
    }
    res.json({ message: 'Tier deleted' });
}));

/**
 * GET /commissions/records
 * Get commission records
 */
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

/**
 * GET /commissions/records/pending
 * Get pending commission records for approval
 */
router.get('/commissions/records/pending', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const records = await commissionService.getPendingRecords(organizationId);
    res.json({ records });
}));

/**
 * GET /commissions/records/:id
 * Get a specific commission record
 */
router.get('/commissions/records/:id', asyncHandler(async (req: Request, res: Response) => {
    const record = await commissionService.getRecord(req.params.id);
    if (!record) {
        return res.status(404).json({ error: 'Record not found' });
    }
    res.json({ record });
}));

/**
 * POST /commissions/records/:id/approve
 * Approve a commission record
 */
router.post('/commissions/records/:id/approve', asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req);
    const record = await commissionService.approveRecord(req.params.id, userId!);
    if (!record) {
        return res.status(404).json({ error: 'Record not found or already approved' });
    }
    res.json({ record });
}));

/**
 * POST /commissions/records/:id/pay
 * Mark a commission record as paid
 */
router.post('/commissions/records/:id/pay', asyncHandler(async (req: Request, res: Response) => {
    const record = await commissionService.markAsPaid(req.params.id);
    if (!record) {
        return res.status(404).json({ error: 'Record not found or not approved' });
    }
    res.json({ record });
}));

/**
 * POST /commissions/records/:id/clawback
 * Create a clawback for a commission record
 */
router.post('/commissions/records/:id/clawback', asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req);
    const { reason } = req.body;
    
    const record = await commissionService.createClawback(req.params.id, reason, userId);
    if (!record) {
        return res.status(400).json({ error: 'Cannot create clawback' });
    }
    res.status(201).json({ record });
}));

/**
 * POST /commissions/records/approve-bulk
 * Approve multiple commission records
 */
router.post('/commissions/records/approve-bulk', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    const { record_ids } = req.body;
    
    const count = await commissionService.approvePendingRecords(organizationId, record_ids, userId!);
    res.json({ message: `Approved ${count} records` });
}));

/**
 * GET /commissions/summary
 * Get commission summary
 */
router.get('/commissions/summary', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const agentId = req.query.agent_id as string;
    
    const summary = await commissionService.getSummary(organizationId, agentId);
    res.json({ summary });
}));

/**
 * POST /commissions/calculate
 * Calculate commission for a deal
 */
router.post('/commissions/calculate', asyncHandler(async (req: Request, res: Response) => {
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

/**
 * GET /commissions/statements
 * Get commission statements
 */
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

/**
 * POST /commissions/statements/generate
 * Generate statements for a period
 */
router.post('/commissions/statements/generate', asyncHandler(async (req: Request, res: Response) => {
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

/**
 * GET /commissions/statements/:id
 * Get a specific statement with line items
 */
router.get('/commissions/statements/:id', asyncHandler(async (req: Request, res: Response) => {
    const statement = await commissionService.getStatement(req.params.id);
    if (!statement) {
        return res.status(404).json({ error: 'Statement not found' });
    }
    res.json({ statement });
}));

/**
 * POST /commissions/statements/:id/approve
 * Approve a statement
 */
router.post('/commissions/statements/:id/approve', asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req);
    const statement = await commissionService.approveStatement(req.params.id, userId!);
    if (!statement) {
        return res.status(404).json({ error: 'Statement not found or already approved' });
    }
    res.json({ statement });
}));

/**
 * POST /commissions/statements/:id/pay
 * Mark a statement as paid
 */
router.post('/commissions/statements/:id/pay', asyncHandler(async (req: Request, res: Response) => {
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

/**
 * GET /deals/:id/splits
 * Get commission splits for a deal
 */
router.get('/deals/:id/commission-splits', asyncHandler(async (req: Request, res: Response) => {
    const splits = await commissionService.getSplits(req.params.id);
    res.json({ splits });
}));

/**
 * POST /deals/:id/splits
 * Set commission split for a deal
 */
router.post('/deals/:id/commission-splits', asyncHandler(async (req: Request, res: Response) => {
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

/**
 * DELETE /deals/:id/splits/:agentId
 * Remove a commission split
 */
router.delete('/deals/:id/commission-splits/:agentId', asyncHandler(async (req: Request, res: Response) => {
    const deleted = await commissionService.deleteSplit(req.params.id, req.params.agentId);
    if (!deleted) {
        return res.status(404).json({ error: 'Split not found' });
    }
    res.json({ message: 'Split removed' });
}));

/**
 * POST /agents/:id/commission-assignment
 * Assign agent to a commission plan
 */
router.post('/agents/:id/commission-assignment', asyncHandler(async (req: Request, res: Response) => {
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

/**
 * GET /agents/:id/commission-assignment
 * Get agent's current commission plan
 */
router.get('/agents/:id/commission-assignment', asyncHandler(async (req: Request, res: Response) => {
    const assignment = await commissionService.getAgentAssignment(req.params.id);
    res.json({ assignment });
}));

/**
 * GET /agents/:id/commission-summary
 * Get agent's commission summary
 */
router.get('/agents/:id/commission-summary', asyncHandler(async (req: Request, res: Response) => {
    const period = (req.query.period as 'mtd' | 'qtd' | 'ytd') || undefined;
    const summary = await commissionService.getAgentSummary(req.params.id, period);
    res.json({ summary });
}));

/**
 * POST /commissions/adjustments
 * Create a commission adjustment
 */
router.post('/commissions/adjustments', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    
    const adjustment = await commissionService.createAdjustment({
        ...req.body,
        organization_id: organizationId,
        created_by: userId,
    });
    res.status(201).json({ adjustment });
}));

/**
 * GET /commissions/adjustments
 * Get commission adjustments
 */
router.get('/commissions/adjustments', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const agentId = req.query.agent_id as string;
    const statementId = req.query.statement_id as string;
    
    const adjustments = await commissionService.getAdjustments(organizationId, agentId, statementId);
    res.json({ adjustments });
}));

/**
 * POST /commissions/adjustments/:id/approve
 * Approve an adjustment
 */
router.post('/commissions/adjustments/:id/approve', asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req);
    const adjustment = await commissionService.approveAdjustment(req.params.id, userId!);
    if (!adjustment) {
        return res.status(404).json({ error: 'Adjustment not found or already processed' });
    }
    res.json({ adjustment });
}));

// =====================================================
// DOCUMENT TEMPLATE ROUTES
// Phase 5.10: E-Sign & Document Integration
// =====================================================

import { crmDocumentTemplateService } from '../services/crm-deal-management/crmDocumentTemplateService';
import { documentGenerationService } from '../services/crm-deal-management/documentGenerationService';
import type { DocumentTemplateCategory, TemplateFilters } from '../services/crm-deal-management/crmDocumentTemplateService';

/**
 * GET /document-templates
 * List document templates for organization
 */
router.get('/document-templates', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const filters: TemplateFilters = {
        category: req.query.category as DocumentTemplateCategory | undefined,
        status: req.query.status as 'draft' | 'active' | 'archived' | undefined,
        search: req.query.search as string | undefined,
        is_system: req.query.system === 'true' ? true : req.query.system === 'false' ? false : undefined,
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 20, 100)
    };

    const result = await crmDocumentTemplateService.list(organizationId, filters);
    res.json({
        templates: result.templates,
        total: result.total,
        page: filters.page,
        limit: filters.limit
    });
}));

/**
 * GET /document-templates/categories
 * Get template categories with counts
 */
router.get('/document-templates/categories', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const categories = await crmDocumentTemplateService.getCategories(organizationId);
    res.json({ categories });
}));

/**
 * GET /document-templates/merge-fields
 * Get available merge fields
 */
router.get('/document-templates/merge-fields', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const grouped = req.query.grouped === 'true';
    
    if (grouped) {
        const fields = await crmDocumentTemplateService.getMergeFieldsByCategory(organizationId || undefined);
        res.json({ fields });
    } else {
        const fields = await crmDocumentTemplateService.getMergeFields(organizationId || undefined);
        res.json({ fields });
    }
}));

/**
 * POST /document-templates
 * Create a new document template
 */
router.post('/document-templates', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const template = await crmDocumentTemplateService.create(organizationId, req.body, userId || 'system');
    res.status(201).json({ template });
}));

/**
 * GET /document-templates/:id
 * Get a specific document template
 */
router.get('/document-templates/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const template = await crmDocumentTemplateService.getById(req.params.id, organizationId || undefined);
    
    if (!template) {
        return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ template });
}));

/**
 * PUT /document-templates/:id
 * Update a document template
 */
router.put('/document-templates/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const template = await crmDocumentTemplateService.update(
        req.params.id,
        organizationId,
        req.body,
        userId || 'system'
    );
    
    if (!template) {
        return res.status(404).json({ error: 'Template not found or cannot be modified' });
    }
    res.json({ template });
}));

/**
 * DELETE /document-templates/:id
 * Archive a document template
 */
router.delete('/document-templates/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const deleted = await crmDocumentTemplateService.delete(req.params.id, organizationId);
    if (!deleted) {
        return res.status(404).json({ error: 'Template not found or cannot be deleted' });
    }
    res.json({ success: true, message: 'Template archived' });
}));

/**
 * POST /document-templates/:id/duplicate
 * Duplicate a template
 */
router.post('/document-templates/:id/duplicate', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'New template name is required' });
    }

    const template = await crmDocumentTemplateService.duplicate(
        req.params.id,
        organizationId,
        name,
        userId || 'system'
    );
    
    if (!template) {
        return res.status(404).json({ error: 'Template not found' });
    }
    res.status(201).json({ template });
}));

/**
 * POST /document-templates/seed-ghana
 * Seed Ghana document templates for the organization
 */
router.post('/document-templates/seed-ghana', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const count = await crmDocumentTemplateService.seedGhanaTemplates(organizationId, userId || 'system');
    res.json({ success: true, message: `Seeded ${count} Ghana document templates` });
}));

// =====================================================
// DOCUMENT GENERATION ROUTES
// =====================================================

/**
 * POST /documents/generate
 * Generate a document from a template
 */
router.post('/documents/generate', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const document = await documentGenerationService.generate(
        organizationId,
        req.body,
        userId || 'system'
    );
    res.status(201).json({ document });
}));

/**
 * POST /documents/preview
 * Preview a document without saving
 */
router.post('/documents/preview', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const preview = await documentGenerationService.preview(organizationId, req.body);
    res.json({ preview });
}));

/**
 * GET /documents/:id
 * Get a generated document
 */
router.get('/documents/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const document = await documentGenerationService.getById(req.params.id, organizationId);
    if (!document) {
        return res.status(404).json({ error: 'Document not found' });
    }
    res.json({ document });
}));

/**
 * DELETE /documents/:id
 * Delete a generated document
 */
router.delete('/documents/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const deleted = await documentGenerationService.delete(req.params.id, organizationId);
    if (!deleted) {
        return res.status(404).json({ error: 'Document not found' });
    }
    res.json({ success: true, message: 'Document deleted' });
}));

/**
 * PUT /documents/:id/status
 * Update document status
 */
router.put('/documents/:id/status', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { status, ...additionalData } = req.body;
    if (!status) {
        return res.status(400).json({ error: 'Status is required' });
    }

    const document = await documentGenerationService.updateStatus(
        req.params.id,
        organizationId,
        status,
        additionalData
    );
    if (!document) {
        return res.status(404).json({ error: 'Document not found' });
    }
    res.json({ document });
}));

// =====================================================
// DEAL DOCUMENT CHECKLIST ROUTES
// =====================================================

/**
 * GET /deals/:id/document-checklist
 * Get document checklist for a deal
 */
router.get('/deals/:id/document-checklist', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const checklist = await documentGenerationService.getDealChecklist(req.params.id, organizationId);
    res.json({ checklist });
}));

/**
 * POST /deals/:id/document-checklist/initialize
 * Initialize document checklist for deal based on stage
 */
router.post('/deals/:id/document-checklist/initialize', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { stageId } = req.body;
    if (!stageId) {
        return res.status(400).json({ error: 'Stage ID is required' });
    }

    const count = await documentGenerationService.initializeDealChecklist(
        req.params.id,
        stageId,
        organizationId
    );
    res.json({ success: true, initialized: count });
}));

/**
 * PUT /deals/document-checklist/:itemId
 * Update a checklist item
 */
router.put('/deals/document-checklist/:itemId', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId) {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const updated = await documentGenerationService.updateChecklistItem(
        req.params.itemId,
        organizationId,
        { ...req.body, completedBy: userId }
    );
    if (!updated) {
        return res.status(404).json({ error: 'Checklist item not found' });
    }
    res.json({ success: true });
}));

/**
 * GET /deals/:id/documents
 * Get all generated documents for a deal
 */
router.get('/deals/:id/documents', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const documents = await documentGenerationService.listByDeal(req.params.id, organizationId);
    res.json({ documents });
}));

// =====================================================
// STAGE DOCUMENT REQUIREMENTS ROUTES
// =====================================================

/**
 * GET /stages/:id/document-requirements
 * Get document requirements for a pipeline stage
 */
router.get('/stages/:id/document-requirements', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const requirements = await crmDocumentTemplateService.getStageRequirements(req.params.id, organizationId);
    res.json({ requirements });
}));

/**
 * POST /stages/:id/document-requirements
 * Add a document requirement to a stage
 */
router.post('/stages/:id/document-requirements', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const userId = await getUserId(req);
    if (!organizationId) {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const { pipelineId, ...input } = req.body;
    if (!pipelineId) {
        return res.status(400).json({ error: 'Pipeline ID is required' });
    }

    const requirement = await crmDocumentTemplateService.addStageRequirement(
        organizationId,
        pipelineId,
        req.params.id,
        input,
        userId || 'system'
    );
    res.status(201).json({ requirement });
}));

/**
 * DELETE /document-requirements/:id
 * Remove a stage document requirement
 */
router.delete('/document-requirements/:id', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const deleted = await crmDocumentTemplateService.removeStageRequirement(req.params.id, organizationId);
    if (!deleted) {
        return res.status(404).json({ error: 'Requirement not found' });
    }
    res.json({ success: true });
}));

// =====================================================
// ERROR HANDLING
// =====================================================

router.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('CRM Route Error:', err);

    if (err.code === '23505') {
        return res.status(409).json({ error: 'Duplicate entry', details: err.detail });
    }
    if (err.code === '23503') {
        return res.status(400).json({ error: 'Invalid reference', details: err.detail });
    }
    if (err.name === 'ValidationError') {
        return res.status(400).json({ error: 'Validation failed', details: err.message });
    }

    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        ...(config.app.env === 'development' && { stack: err.stack })
    });
});

export default router;
