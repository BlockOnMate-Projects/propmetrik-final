/**
 * Project Management Routes
 * Phase 5.8 - Development Project Management API
 * 
 * Provides endpoints for:
 * - Projects CRUD
 * - Phases & Milestones
 * - Units & Sales
 * - Costs & Budget
 * - Contractors & Assignments
 * - Draw Requests
 * - Daily Logs
 * - Payment Plans
 * - Punch Lists
 * - Project Integration
 */

import { Router, Request, Response, NextFunction } from 'express';
import projectService from '../services/crm-deal-management/project-management/projectService';
import phaseService from '../services/crm-deal-management/project-management/phaseService';
import unitService from '../services/crm-deal-management/project-management/unitService';
import projectCostService from '../services/crm-deal-management/project-management/projectCostService';
import contractorService from '../services/crm-deal-management/project-management/contractorService';
import drawService from '../services/crm-deal-management/project-management/drawService';
import dailyLogService from '../services/crm-deal-management/project-management/dailyLogService';
import paymentPlanService from '../services/crm-deal-management/project-management/paymentPlanService';
import punchListService from '../services/crm-deal-management/project-management/punchListService';
import projectIntegrationService from '../services/crm-deal-management/project-management/projectIntegrationService';

const router = Router();

// Development mode organization ID (valid UUID for testing)
const DEV_ORG_ID = '00000000-0000-0000-0000-000000000001';

// Helper to get organization ID from request
const getOrgId = (req: Request): string => {
  return (req as any).organizationId || (req as any).user?.organizationId || (req as any).user?.organization_id || DEV_ORG_ID;
};

const getUserId = (req: Request): string => {
  return (req as any).user?.id || (req as any).userId || 'system';
};

// ============================================================================
// PROJECTS
// ============================================================================

// Get all projects
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { status, type, city, region, manager, search, page, limit, sort, order } = req.query;
    
    const result = await projectService.getAll(
      {
        organization_id: orgId,
        status: status as any,
        project_type: type as any,
        city: city as string,
        region: region as string,
        project_manager_id: manager as string,
        search: search as string
      },
      parseInt(page as string) || 1,
      parseInt(limit as string) || 20,
      sort as string || 'created_at',
      (order as 'asc' | 'desc') || 'desc'
    );
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get project summaries (lightweight list view)
router.get('/summaries', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const summaries = await projectService.getSummaries(orgId);
    res.json(summaries);
  } catch (error) {
    next(error);
  }
});

// Get project statistics
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const stats = await projectService.getStats(orgId);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// Get phase templates
router.get('/phase-templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { type } = req.query;
    const templates = await projectService.getPhaseTemplates(orgId, type as any);
    res.json(templates);
  } catch (error) {
    next(error);
  }
});

// Create phase template
router.post('/phase-templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { template_name, phases, project_type } = req.body;
    const template = await projectService.createPhaseTemplate(orgId, template_name, phases, project_type);
    res.status(201).json(template);
  } catch (error) {
    next(error);
  }
});

// Create project
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    
    const project = await projectService.create({
      ...req.body,
      organization_id: orgId,
      created_by: userId
    });
    
    res.status(201).json(project);
  } catch (error) {
    next(error);
  }
});

// Get single project
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const project = await projectService.getById(req.params.id, orgId);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json(project);
  } catch (error) {
    next(error);
  }
});

// Update project
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    
    const project = await projectService.update(req.params.id, orgId, {
      ...req.body,
      updated_by: userId
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json(project);
  } catch (error) {
    next(error);
  }
});

// Update project status
router.patch('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { status } = req.body;
    
    const project = await projectService.updateStatus(req.params.id, orgId, status, userId);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json(project);
  } catch (error) {
    next(error);
  }
});

// Delete project (soft)
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    
    const deleted = await projectService.delete(req.params.id, orgId, userId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PHASES
// ============================================================================

// Get project phases
router.get('/:id/phases', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const phases = await phaseService.getByProject(req.params.id);
    res.json(phases);
  } catch (error) {
    next(error);
  }
});

// Get Gantt data
router.get('/:id/gantt', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const gantt = await phaseService.getGanttData(req.params.id);
    res.json(gantt);
  } catch (error) {
    next(error);
  }
});

// Create phase
router.post('/:id/phases', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    
    const phase = await phaseService.create({
      ...req.body,
      project_id: req.params.id,
      organization_id: orgId,
      created_by: userId
    });
    
    res.status(201).json(phase);
  } catch (error) {
    next(error);
  }
});

// Bulk create phases
router.post('/:id/phases/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { phases } = req.body;
    
    const createdPhases = await phaseService.createBulk(
      phases.map((p: any) => ({
        ...p,
        project_id: req.params.id,
        organization_id: orgId,
        created_by: userId
      }))
    );
    
    res.status(201).json(createdPhases);
  } catch (error) {
    next(error);
  }
});

// Update phase
router.put('/phases/:phaseId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    
    const phase = await phaseService.update(req.params.phaseId, {
      ...req.body,
      updated_by: userId
    });
    
    if (!phase) {
      return res.status(404).json({ error: 'Phase not found' });
    }
    
    res.json(phase);
  } catch (error) {
    next(error);
  }
});

// Update phase progress
router.patch('/phases/:phaseId/progress', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { progress } = req.body;
    
    const phase = await phaseService.updateProgress(req.params.phaseId, progress, userId);
    
    if (!phase) {
      return res.status(404).json({ error: 'Phase not found' });
    }
    
    res.json(phase);
  } catch (error) {
    next(error);
  }
});

// Update phase status
router.patch('/phases/:phaseId/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { status } = req.body;
    
    const phase = await phaseService.updateStatus(req.params.phaseId, status, userId);
    
    if (!phase) {
      return res.status(404).json({ error: 'Phase not found' });
    }
    
    res.json(phase);
  } catch (error) {
    next(error);
  }
});

// Reorder phases
router.put('/:id/phases/reorder', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phaseIds } = req.body;
    await phaseService.reorderPhases(req.params.id, phaseIds);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Check if phase can start
router.get('/phases/:phaseId/can-start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await phaseService.canStartPhase(req.params.phaseId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Delete phase
router.delete('/phases/:phaseId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = await phaseService.delete(req.params.phaseId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Phase not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// MILESTONES
// ============================================================================

// Add milestone to phase
router.post('/phases/:phaseId/milestones', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const phase = await phaseService.addMilestone(req.params.phaseId, req.body);
    
    if (!phase) {
      return res.status(404).json({ error: 'Phase not found' });
    }
    
    res.status(201).json(phase);
  } catch (error) {
    next(error);
  }
});

// Update milestone
router.put('/phases/:phaseId/milestones/:milestoneId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const phase = await phaseService.updateMilestone(req.params.phaseId, req.params.milestoneId, req.body);
    
    if (!phase) {
      return res.status(404).json({ error: 'Phase or milestone not found' });
    }
    
    res.json(phase);
  } catch (error) {
    next(error);
  }
});

// Complete milestone
router.post('/phases/:phaseId/milestones/:milestoneId/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const phase = await phaseService.completeMilestone(req.params.phaseId, req.params.milestoneId);
    
    if (!phase) {
      return res.status(404).json({ error: 'Phase or milestone not found' });
    }
    
    res.json(phase);
  } catch (error) {
    next(error);
  }
});

// Delete milestone
router.delete('/phases/:phaseId/milestones/:milestoneId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const phase = await phaseService.deleteMilestone(req.params.phaseId, req.params.milestoneId);
    
    if (!phase) {
      return res.status(404).json({ error: 'Phase or milestone not found' });
    }
    
    res.json(phase);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// UNITS
// ============================================================================

// Get project units
router.get('/:id/units', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, type, building, floor, min_bedrooms, max_bedrooms, min_price, max_price, search, page, limit } = req.query;
    
    const result = await unitService.getAll(
      {
        project_id: req.params.id,
        status: status as any,
        unit_type: type as any,
        building: building as string,
        floor: floor ? parseInt(floor as string) : undefined,
        min_bedrooms: min_bedrooms ? parseInt(min_bedrooms as string) : undefined,
        max_bedrooms: max_bedrooms ? parseInt(max_bedrooms as string) : undefined,
        min_price: min_price ? parseFloat(min_price as string) : undefined,
        max_price: max_price ? parseFloat(max_price as string) : undefined,
        search: search as string
      },
      parseInt(page as string) || 1,
      parseInt(limit as string) || 50
    );
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get unit availability grid
router.get('/:id/units/availability', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const availability = await unitService.getAvailability(req.params.id);
    res.json(availability);
  } catch (error) {
    next(error);
  }
});

// Get unit statistics
router.get('/:id/units/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await unitService.getStats(req.params.id);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// Get upgrade categories
router.get('/upgrades/categories', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await unitService.getUpgradeCategories();
    res.json(categories);
  } catch (error) {
    next(error);
  }
});

// Create unit
router.post('/:id/units', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    
    const unit = await unitService.create({
      ...req.body,
      project_id: req.params.id,
      organization_id: orgId,
      created_by: userId
    });
    
    res.status(201).json(unit);
  } catch (error) {
    next(error);
  }
});

// Bulk create units
router.post('/:id/units/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    
    const units = await unitService.createBulk({
      ...req.body,
      project_id: req.params.id,
      organization_id: orgId,
      created_by: userId
    });
    
    res.status(201).json(units);
  } catch (error) {
    next(error);
  }
});

// Get single unit
router.get('/units/:unitId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unit = await unitService.getById(req.params.unitId);
    
    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    
    res.json(unit);
  } catch (error) {
    next(error);
  }
});

// Update unit
router.put('/units/:unitId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    
    const unit = await unitService.update(req.params.unitId, {
      ...req.body,
      updated_by: userId
    });
    
    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    
    res.json(unit);
  } catch (error) {
    next(error);
  }
});

// Reserve unit
router.post('/units/:unitId/reserve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    
    const unit = await unitService.reserve(req.params.unitId, {
      ...req.body,
      reserved_by: userId
    });
    
    if (!unit) {
      return res.status(400).json({ error: 'Unit cannot be reserved' });
    }
    
    res.json(unit);
  } catch (error) {
    next(error);
  }
});

// Move to contract
router.post('/units/:unitId/contract', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sale_price, contract_date, deal_id } = req.body;
    
    const unit = await unitService.moveToContract(
      req.params.unitId,
      sale_price,
      new Date(contract_date),
      deal_id
    );
    
    if (!unit) {
      return res.status(400).json({ error: 'Unit cannot be moved to contract' });
    }
    
    res.json(unit);
  } catch (error) {
    next(error);
  }
});

// Mark as sold
router.post('/units/:unitId/sold', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unit = await unitService.markAsSold(req.params.unitId);
    
    if (!unit) {
      return res.status(400).json({ error: 'Unit cannot be marked as sold' });
    }
    
    res.json(unit);
  } catch (error) {
    next(error);
  }
});

// Handover unit
router.post('/units/:unitId/handover', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { handover_date } = req.body;
    
    const unit = await unitService.handover(req.params.unitId, new Date(handover_date));
    
    if (!unit) {
      return res.status(400).json({ error: 'Unit cannot be handed over' });
    }
    
    res.json(unit);
  } catch (error) {
    next(error);
  }
});

// Cancel reservation
router.post('/units/:unitId/cancel-reservation', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body;
    
    const unit = await unitService.cancelReservation(req.params.unitId, reason);
    
    if (!unit) {
      return res.status(400).json({ error: 'Reservation cannot be cancelled' });
    }
    
    res.json(unit);
  } catch (error) {
    next(error);
  }
});

// Add upgrade to unit
router.post('/units/:unitId/upgrades', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    
    const unit = await unitService.addUpgrade(req.params.unitId, {
      ...req.body,
      selected_by: userId
    });
    
    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    
    res.json(unit);
  } catch (error) {
    next(error);
  }
});

// Remove upgrade from unit
router.delete('/units/:unitId/upgrades/:upgradeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unit = await unitService.removeUpgrade(req.params.unitId, req.params.upgradeId);
    
    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    
    res.json(unit);
  } catch (error) {
    next(error);
  }
});

// Record payment on unit
router.post('/units/:unitId/payments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount } = req.body;
    
    const unit = await unitService.recordPayment(req.params.unitId, amount);
    
    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    
    res.json(unit);
  } catch (error) {
    next(error);
  }
});

// Link unit to deal
router.post('/units/:unitId/link-deal', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { deal_id } = req.body;
    
    const unit = await unitService.linkDeal(req.params.unitId, deal_id);
    
    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    
    res.json(unit);
  } catch (error) {
    next(error);
  }
});

// Delete unit
router.delete('/units/:unitId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = await unitService.delete(req.params.unitId);
    
    if (!deleted) {
      return res.status(400).json({ error: 'Unit cannot be deleted' });
    }
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// COSTS & BUDGET
// ============================================================================

// Get project costs
router.get('/:id/costs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category, status, phase_id, contractor_id, search } = req.query;
    
    const costs = await projectCostService.getAll({
      project_id: req.params.id,
      category: category as any,
      status: status as any,
      phase_id: phase_id as string,
      contractor_id: contractor_id as string,
      search: search as string
    });
    
    res.json(costs);
  } catch (error) {
    next(error);
  }
});

// Get budget summary
router.get('/:id/budget', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await projectCostService.getBudgetSummary(req.params.id);
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

// Get cost codes
router.get('/cost-codes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const codes = await projectCostService.getCostCodes(orgId);
    res.json(codes);
  } catch (error) {
    next(error);
  }
});

// Create cost
router.post('/:id/costs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    
    const cost = await projectCostService.create({
      ...req.body,
      project_id: req.params.id,
      organization_id: orgId,
      created_by: userId
    });
    
    res.status(201).json(cost);
  } catch (error) {
    next(error);
  }
});

// Create costs from template
router.post('/:id/costs/from-template', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    
    const costs = await projectCostService.createFromTemplate(req.params.id, orgId, userId);
    res.status(201).json(costs);
  } catch (error) {
    next(error);
  }
});

// Update cost
router.put('/costs/:costId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    
    const cost = await projectCostService.update(req.params.costId, {
      ...req.body,
      updated_by: userId
    });
    
    if (!cost) {
      return res.status(404).json({ error: 'Cost not found' });
    }
    
    res.json(cost);
  } catch (error) {
    next(error);
  }
});

// Record invoice
router.post('/costs/:costId/invoice', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { invoice_number, invoice_date, due_date, amount, document_url } = req.body;
    
    const cost = await projectCostService.recordInvoice(
      req.params.costId,
      invoice_number,
      new Date(invoice_date),
      new Date(due_date),
      amount,
      document_url
    );
    
    if (!cost) {
      return res.status(404).json({ error: 'Cost not found' });
    }
    
    res.json(cost);
  } catch (error) {
    next(error);
  }
});

// Approve for payment
router.post('/costs/:costId/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    
    const cost = await projectCostService.approveForPayment(req.params.costId, userId);
    
    if (!cost) {
      return res.status(400).json({ error: 'Cost cannot be approved' });
    }
    
    res.json(cost);
  } catch (error) {
    next(error);
  }
});

// Record payment
router.post('/costs/:costId/pay', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { payment_reference, payment_method } = req.body;
    
    const cost = await projectCostService.recordPayment(
      req.params.costId,
      payment_reference,
      payment_method,
      userId
    );
    
    if (!cost) {
      return res.status(400).json({ error: 'Cost cannot be marked as paid' });
    }
    
    res.json(cost);
  } catch (error) {
    next(error);
  }
});

// Bulk approve costs
router.post('/costs/bulk-approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { cost_ids } = req.body;
    
    const count = await projectCostService.bulkApprove(cost_ids, userId);
    res.json({ approved_count: count });
  } catch (error) {
    next(error);
  }
});

// Delete cost
router.delete('/costs/:costId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = await projectCostService.delete(req.params.costId);
    
    if (!deleted) {
      return res.status(400).json({ error: 'Cost cannot be deleted' });
    }
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// CONTRACTORS
// ============================================================================

// Get all contractors
router.get('/contractors', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { status, trade, search } = req.query;
    
    const contractors = await contractorService.getAll(
      orgId,
      status as any,
      trade as string,
      search as string
    );
    
    res.json(contractors);
  } catch (error) {
    next(error);
  }
});

// Get contractor performance
router.get('/contractors/performance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const performance = await contractorService.getPerformance(orgId);
    res.json(performance);
  } catch (error) {
    next(error);
  }
});

// Get trades list
router.get('/contractors/trades', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const trades = await contractorService.getTrades(orgId);
    res.json(trades);
  } catch (error) {
    next(error);
  }
});

// Create contractor
router.post('/contractors', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    
    const contractor = await contractorService.create({
      ...req.body,
      organization_id: orgId,
      created_by: userId
    });
    
    res.status(201).json(contractor);
  } catch (error) {
    next(error);
  }
});

// Get single contractor
router.get('/contractors/:contractorId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contractor = await contractorService.getById(req.params.contractorId);
    
    if (!contractor) {
      return res.status(404).json({ error: 'Contractor not found' });
    }
    
    res.json(contractor);
  } catch (error) {
    next(error);
  }
});

// Update contractor
router.put('/contractors/:contractorId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    
    const contractor = await contractorService.update(req.params.contractorId, {
      ...req.body,
      updated_by: userId
    });
    
    if (!contractor) {
      return res.status(404).json({ error: 'Contractor not found' });
    }
    
    res.json(contractor);
  } catch (error) {
    next(error);
  }
});

// Approve contractor
router.post('/contractors/:contractorId/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const contractor = await contractorService.approve(req.params.contractorId, userId);
    
    if (!contractor) {
      return res.status(404).json({ error: 'Contractor not found' });
    }
    
    res.json(contractor);
  } catch (error) {
    next(error);
  }
});

// Activate contractor
router.post('/contractors/:contractorId/activate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const contractor = await contractorService.activate(req.params.contractorId, userId);
    
    if (!contractor) {
      return res.status(404).json({ error: 'Contractor not found' });
    }
    
    res.json(contractor);
  } catch (error) {
    next(error);
  }
});

// Suspend contractor
router.post('/contractors/:contractorId/suspend', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const contractor = await contractorService.suspend(req.params.contractorId, userId);
    
    if (!contractor) {
      return res.status(404).json({ error: 'Contractor not found' });
    }
    
    res.json(contractor);
  } catch (error) {
    next(error);
  }
});

// Rate contractor
router.post('/contractors/:contractorId/rate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { rating } = req.body;
    
    const contractor = await contractorService.rate(req.params.contractorId, rating, userId);
    
    if (!contractor) {
      return res.status(404).json({ error: 'Contractor not found' });
    }
    
    res.json(contractor);
  } catch (error) {
    next(error);
  }
});

// Add document to contractor
router.post('/contractors/:contractorId/documents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contractor = await contractorService.addDocument(req.params.contractorId, req.body);
    
    if (!contractor) {
      return res.status(404).json({ error: 'Contractor not found' });
    }
    
    res.json(contractor);
  } catch (error) {
    next(error);
  }
});

// Get contractor assignments
router.get('/contractors/:contractorId/assignments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const assignments = await contractorService.getContractorAssignments(req.params.contractorId);
    res.json(assignments);
  } catch (error) {
    next(error);
  }
});

// Delete contractor
router.delete('/contractors/:contractorId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = await contractorService.delete(req.params.contractorId);
    
    if (!deleted) {
      return res.status(400).json({ error: 'Contractor cannot be deleted' });
    }
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// CONTRACTOR ASSIGNMENTS
// ============================================================================

// Get project contractor assignments
router.get('/:id/contractors', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const assignments = await contractorService.getProjectAssignments(req.params.id);
    res.json(assignments);
  } catch (error) {
    next(error);
  }
});

// Create assignment
router.post('/:id/contractors', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    
    const assignment = await contractorService.createAssignment({
      ...req.body,
      project_id: req.params.id,
      organization_id: orgId,
      created_by: userId
    });
    
    res.status(201).json(assignment);
  } catch (error) {
    next(error);
  }
});

// Update assignment
router.put('/assignments/:assignmentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const assignment = await contractorService.updateAssignment(req.params.assignmentId, req.body);
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    res.json(assignment);
  } catch (error) {
    next(error);
  }
});

// Update assignment progress
router.patch('/assignments/:assignmentId/progress', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { percentage } = req.body;
    
    const assignment = await contractorService.updateProgress(req.params.assignmentId, percentage);
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    res.json(assignment);
  } catch (error) {
    next(error);
  }
});

// Record billing
router.post('/assignments/:assignmentId/bill', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount } = req.body;
    
    const assignment = await contractorService.recordBilling(req.params.assignmentId, amount);
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    res.json(assignment);
  } catch (error) {
    next(error);
  }
});

// Record payment to contractor
router.post('/assignments/:assignmentId/pay', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount } = req.body;
    
    const assignment = await contractorService.recordPayment(req.params.assignmentId, amount);
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    res.json(assignment);
  } catch (error) {
    next(error);
  }
});

// Complete assignment
router.post('/assignments/:assignmentId/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const assignment = await contractorService.completeAssignment(req.params.assignmentId);
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    res.json(assignment);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// DRAW REQUESTS
// ============================================================================

// Get draw requests for a project
router.get('/:projectId/draws', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, page, limit } = req.query;
    
    const result = await drawService.getByProject(
      req.params.projectId,
      status as any,
      parseInt(page as string) || 1,
      parseInt(limit as string) || 20
    );
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get draw summary for project
router.get('/:projectId/draws/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await drawService.getSummary(req.params.projectId);
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

// Get single draw request
router.get('/draws/:drawId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const draw = await drawService.getById(req.params.drawId);
    
    if (!draw) {
      return res.status(404).json({ error: 'Draw request not found' });
    }
    
    res.json(draw);
  } catch (error) {
    next(error);
  }
});

// Create draw request
router.post('/:projectId/draws', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    
    const draw = await drawService.create({
      ...req.body,
      project_id: req.params.projectId,
      organization_id: orgId,
      created_by: userId
    });
    
    res.status(201).json(draw);
  } catch (error) {
    next(error);
  }
});

// Submit draw for approval
router.post('/draws/:drawId/submit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const draw = await drawService.submit(req.params.drawId, userId);
    
    if (!draw) {
      return res.status(404).json({ error: 'Draw request not found' });
    }
    
    res.json(draw);
  } catch (error) {
    next(error);
  }
});

// Approve draw request
router.post('/draws/:drawId/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { notes } = req.body;
    
    const draw = await drawService.approve(req.params.drawId, userId, notes);
    
    if (!draw) {
      return res.status(404).json({ error: 'Draw request not found' });
    }
    
    res.json(draw);
  } catch (error) {
    next(error);
  }
});

// Reject draw request
router.post('/draws/:drawId/reject', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { reason } = req.body;
    
    const draw = await drawService.reject(req.params.drawId, userId, reason);
    
    if (!draw) {
      return res.status(404).json({ error: 'Draw request not found' });
    }
    
    res.json(draw);
  } catch (error) {
    next(error);
  }
});

// Record funding for draw
router.post('/draws/:drawId/fund', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { amount, referenceNumber, notes } = req.body;
    
    const draw = await drawService.recordFunding(
      req.params.drawId,
      amount,
      userId,
      referenceNumber,
      notes
    );
    
    if (!draw) {
      return res.status(404).json({ error: 'Draw request not found' });
    }
    
    res.json(draw);
  } catch (error) {
    next(error);
  }
});

// Update draw line items
router.put('/draws/:drawId/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items } = req.body;
    const draw = await drawService.updateLineItems(req.params.drawId, items);
    
    if (!draw) {
      return res.status(404).json({ error: 'Draw request not found' });
    }
    
    res.json(draw);
  } catch (error) {
    next(error);
  }
});

// Add document to draw
router.post('/draws/:drawId/documents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { documentUrl, documentType, name } = req.body;
    const draw = await drawService.addDocument(req.params.drawId, documentUrl, documentType, name);
    
    if (!draw) {
      return res.status(404).json({ error: 'Draw request not found' });
    }
    
    res.json(draw);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// DAILY LOGS
// ============================================================================

// Get daily logs for a project
router.get('/:projectId/logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate, createdBy, isApproved, weather, page, limit } = req.query;
    
    const result = await dailyLogService.getAll(
      req.params.projectId,
      {
        start_date: startDate ? new Date(startDate as string) : undefined,
        end_date: endDate ? new Date(endDate as string) : undefined,
        created_by: createdBy as string,
        is_approved: isApproved === 'true',
        weather_condition: weather as any
      },
      parseInt(page as string) || 1,
      parseInt(limit as string) || 20
    );
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get daily log summary
router.get('/:projectId/logs/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate } = req.query;
    
    const summary = await dailyLogService.getSummary(
      req.params.projectId,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );
    
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

// Get log by date
router.get('/:projectId/logs/date/:date', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const log = await dailyLogService.getByDate(
      req.params.projectId,
      new Date(req.params.date)
    );
    
    if (!log) {
      return res.status(404).json({ error: 'Daily log not found for this date' });
    }
    
    res.json(log);
  } catch (error) {
    next(error);
  }
});

// Get single daily log
router.get('/logs/:logId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const log = await dailyLogService.getById(req.params.logId);
    
    if (!log) {
      return res.status(404).json({ error: 'Daily log not found' });
    }
    
    res.json(log);
  } catch (error) {
    next(error);
  }
});

// Create daily log
router.post('/:projectId/logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    
    const log = await dailyLogService.create({
      ...req.body,
      project_id: req.params.projectId,
      organization_id: orgId,
      created_by: userId
    });
    
    res.status(201).json(log);
  } catch (error) {
    next(error);
  }
});

// Update daily log
router.put('/logs/:logId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const log = await dailyLogService.update(req.params.logId, req.body);
    
    if (!log) {
      return res.status(404).json({ error: 'Daily log not found' });
    }
    
    res.json(log);
  } catch (error) {
    next(error);
  }
});

// Delete daily log
router.delete('/logs/:logId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const success = await dailyLogService.delete(req.params.logId);
    
    if (!success) {
      return res.status(404).json({ error: 'Daily log not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Add photo to daily log
router.post('/logs/:logId/photos', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { photoUrl, caption } = req.body;
    
    const log = await dailyLogService.addPhoto(req.params.logId, photoUrl, caption, userId);
    
    if (!log) {
      return res.status(404).json({ error: 'Daily log not found' });
    }
    
    res.json(log);
  } catch (error) {
    next(error);
  }
});

// Remove photo from daily log
router.delete('/logs/:logId/photos/:photoId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const success = await dailyLogService.removePhoto(req.params.logId, req.params.photoId);
    
    if (!success) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Add activity to daily log
router.post('/logs/:logId/activities', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const log = await dailyLogService.addActivity(req.params.logId, req.body);
    
    if (!log) {
      return res.status(404).json({ error: 'Daily log not found' });
    }
    
    res.json(log);
  } catch (error) {
    next(error);
  }
});

// Approve daily log
router.post('/logs/:logId/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const log = await dailyLogService.approve(req.params.logId, userId);
    
    if (!log) {
      return res.status(404).json({ error: 'Daily log not found' });
    }
    
    res.json(log);
  } catch (error) {
    next(error);
  }
});

// Revoke daily log approval
router.post('/logs/:logId/revoke', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const log = await dailyLogService.revokeApproval(req.params.logId);
    
    if (!log) {
      return res.status(404).json({ error: 'Daily log not found' });
    }
    
    res.json(log);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PAYMENT PLANS (Ghana-Specific)
// ============================================================================

// Get all payment plans for organization
router.get('/payment-plans', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { isActive, isDefaulted, buyerId, projectId, page, limit } = req.query;
    
    const result = await paymentPlanService.getAll(
      orgId,
      {
        is_active: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
        is_defaulted: isDefaulted === 'true',
        buyer_contact_id: buyerId as string,
        project_id: projectId as string
      },
      parseInt(page as string) || 1,
      parseInt(limit as string) || 20
    );
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get payment plan summary
router.get('/payment-plans/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const summary = await paymentPlanService.getSummary(orgId);
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

// Get payment plan by ID
router.get('/payment-plans/:planId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = await paymentPlanService.getById(req.params.planId);
    
    if (!plan) {
      return res.status(404).json({ error: 'Payment plan not found' });
    }
    
    res.json(plan);
  } catch (error) {
    next(error);
  }
});

// Get payment plan for a unit
router.get('/units/:unitId/payment-plan', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = await paymentPlanService.getByUnit(req.params.unitId);
    
    if (!plan) {
      return res.status(404).json({ error: 'No active payment plan for this unit' });
    }
    
    res.json(plan);
  } catch (error) {
    next(error);
  }
});

// Create payment plan for a unit
router.post('/units/:unitId/payment-plan', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    
    const plan = await paymentPlanService.create({
      ...req.body,
      unit_id: req.params.unitId,
      organization_id: orgId,
      created_by: userId
    });
    
    res.status(201).json(plan);
  } catch (error) {
    next(error);
  }
});

// Get payment schedule
router.get('/payment-plans/:planId/schedule', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schedule = await paymentPlanService.getSchedule(req.params.planId);
    res.json(schedule);
  } catch (error) {
    next(error);
  }
});

// Record payment
router.post('/payment-plans/:planId/payments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    
    const plan = await paymentPlanService.recordPayment(req.params.planId, {
      ...req.body,
      recorded_by: userId
    });
    
    if (!plan) {
      return res.status(404).json({ error: 'Payment plan not found or inactive' });
    }
    
    res.json(plan);
  } catch (error) {
    next(error);
  }
});

// Get payments for a plan
router.get('/payment-plans/:planId/payments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payments = await paymentPlanService.getPayments(req.params.planId);
    res.json(payments);
  } catch (error) {
    next(error);
  }
});

// Mark plan as defaulted
router.post('/payment-plans/:planId/default', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body;
    const plan = await paymentPlanService.markDefaulted(req.params.planId, reason);
    
    if (!plan) {
      return res.status(404).json({ error: 'Payment plan not found' });
    }
    
    res.json(plan);
  } catch (error) {
    next(error);
  }
});

// Cancel payment plan
router.post('/payment-plans/:planId/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body;
    const success = await paymentPlanService.cancel(req.params.planId, reason);
    
    if (!success) {
      return res.status(404).json({ error: 'Payment plan not found' });
    }
    
    res.json({ message: 'Payment plan cancelled' });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PUNCH LISTS
// ============================================================================

// Get all punch list items for organization
router.get('/punch-lists', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { unitId, projectId, status, priority, category, contractorId, isOverdue, page, limit } = req.query;
    
    const result = await punchListService.getAll(
      orgId,
      {
        unit_id: unitId as string,
        project_id: projectId as string,
        status: status as any,
        priority: priority as any,
        category: category as any,
        assigned_contractor_id: contractorId as string,
        is_overdue: isOverdue === 'true'
      },
      parseInt(page as string) || 1,
      parseInt(limit as string) || 50
    );
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get punch list summary
router.get('/punch-lists/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { projectId, unitId } = req.query;
    
    const summary = await punchListService.getSummary(
      orgId,
      projectId as string,
      unitId as string
    );
    
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

// Get punch list for a unit
router.get('/units/:unitId/punch-list', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await punchListService.getByUnit(req.params.unitId);
    res.json(items);
  } catch (error) {
    next(error);
  }
});

// Check if unit is ready for handover
router.get('/units/:unitId/handover-ready', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await punchListService.isUnitReadyForHandover(req.params.unitId);
    res.json(status);
  } catch (error) {
    next(error);
  }
});

// Get single punch list item
router.get('/punch-lists/:itemId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await punchListService.getById(req.params.itemId);
    
    if (!item) {
      return res.status(404).json({ error: 'Punch list item not found' });
    }
    
    res.json(item);
  } catch (error) {
    next(error);
  }
});

// Create punch list item
router.post('/units/:unitId/punch-list', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    
    const item = await punchListService.create({
      ...req.body,
      unit_id: req.params.unitId,
      organization_id: orgId,
      created_by: userId
    });
    
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

// Create bulk punch list items
router.post('/units/:unitId/punch-list/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { items } = req.body;
    
    const created = await punchListService.createBulk(
      items.map((item: any) => ({
        ...item,
        unit_id: req.params.unitId,
        organization_id: orgId,
        created_by: userId
      }))
    );
    
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

// Update punch list item
router.put('/punch-lists/:itemId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await punchListService.update(req.params.itemId, req.body);
    
    if (!item) {
      return res.status(404).json({ error: 'Punch list item not found' });
    }
    
    res.json(item);
  } catch (error) {
    next(error);
  }
});

// Delete punch list item
router.delete('/punch-lists/:itemId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const success = await punchListService.delete(req.params.itemId);
    
    if (!success) {
      return res.status(404).json({ error: 'Punch list item not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Assign punch list item to contractor
router.post('/punch-lists/:itemId/assign', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { contractorId, dueDate } = req.body;
    const item = await punchListService.assign(
      req.params.itemId,
      contractorId,
      dueDate ? new Date(dueDate) : undefined
    );
    
    if (!item) {
      return res.status(404).json({ error: 'Punch list item not found' });
    }
    
    res.json(item);
  } catch (error) {
    next(error);
  }
});

// Start work on punch list item
router.post('/punch-lists/:itemId/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await punchListService.startWork(req.params.itemId);
    
    if (!item) {
      return res.status(404).json({ error: 'Punch list item not found' });
    }
    
    res.json(item);
  } catch (error) {
    next(error);
  }
});

// Complete punch list item
router.post('/punch-lists/:itemId/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { notes } = req.body;
    
    const item = await punchListService.complete(req.params.itemId, userId, notes);
    
    if (!item) {
      return res.status(404).json({ error: 'Punch list item not found' });
    }
    
    res.json(item);
  } catch (error) {
    next(error);
  }
});

// Verify punch list item
router.post('/punch-lists/:itemId/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const item = await punchListService.verify(req.params.itemId, userId);
    
    if (!item) {
      return res.status(404).json({ error: 'Punch list item not found' });
    }
    
    res.json(item);
  } catch (error) {
    next(error);
  }
});

// Reject punch list item verification
router.post('/punch-lists/:itemId/reject', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body;
    const item = await punchListService.rejectVerification(req.params.itemId, reason);
    
    if (!item) {
      return res.status(404).json({ error: 'Punch list item not found' });
    }
    
    res.json(item);
  } catch (error) {
    next(error);
  }
});

// Defer punch list item
router.post('/punch-lists/:itemId/defer', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body;
    const item = await punchListService.defer(req.params.itemId, reason);
    
    if (!item) {
      return res.status(404).json({ error: 'Punch list item not found' });
    }
    
    res.json(item);
  } catch (error) {
    next(error);
  }
});

// Add photo to punch list item
router.post('/punch-lists/:itemId/photos', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { photoUrl, photoType, caption } = req.body;
    
    const photo = await punchListService.addPhoto(
      req.params.itemId,
      photoUrl,
      photoType,
      caption,
      userId
    );
    
    res.status(201).json(photo);
  } catch (error) {
    next(error);
  }
});

// Remove photo from punch list item
router.delete('/punch-lists/:itemId/photos/:photoId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const success = await punchListService.removePhoto(req.params.photoId);
    
    if (!success) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Complete all punch list items for a unit
router.post('/units/:unitId/punch-list/complete-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const count = await punchListService.completeAllForUnit(req.params.unitId, userId);
    res.json({ message: `${count} items completed` });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PROJECT INTEGRATION & LINKING
// ============================================================================

// Link unit to deal
router.post('/units/:unitId/link-deal', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { dealId, linkType } = req.body;
    
    const link = await projectIntegrationService.linkUnitToDeal(
      req.params.unitId,
      dealId,
      linkType,
      userId
    );
    
    res.status(201).json(link);
  } catch (error) {
    next(error);
  }
});

// Get project deals
router.get('/:projectId/deals', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deals = await projectIntegrationService.getProjectDeals(req.params.projectId);
    res.json(deals);
  } catch (error) {
    next(error);
  }
});

// Unlink deal
router.delete('/deal-links/:linkId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const success = await projectIntegrationService.unlinkDeal(req.params.linkId);
    
    if (!success) {
      return res.status(404).json({ error: 'Link not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Get project buyers
router.get('/:projectId/buyers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const buyers = await projectIntegrationService.getProjectBuyers(req.params.projectId);
    res.json(buyers);
  } catch (error) {
    next(error);
  }
});

// Assign buyer to unit
router.post('/units/:unitId/assign-buyer', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { contactId, salePrice, status } = req.body;
    
    await projectIntegrationService.assignBuyerToUnit(
      req.params.unitId,
      contactId,
      salePrice,
      status
    );
    
    res.json({ message: 'Buyer assigned successfully' });
  } catch (error) {
    next(error);
  }
});

// Record unit handover
router.post('/units/:unitId/handover', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { handoverDate, notes } = req.body;
    
    await projectIntegrationService.recordHandover(
      req.params.unitId,
      handoverDate ? new Date(handoverDate) : undefined,
      notes
    );
    
    res.json({ message: 'Handover recorded successfully' });
  } catch (error) {
    next(error);
  }
});

// Export project data
router.get('/:projectId/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await projectIntegrationService.exportProject(req.params.projectId);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Get project report
router.get('/:projectId/report', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const report = await projectIntegrationService.getProjectReport(req.params.projectId);
    res.json(report);
  } catch (error) {
    next(error);
  }
});

// Add project to portfolio
router.post('/:projectId/add-to-portfolio', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { portfolioId, includeUnits, asStatus } = req.body;
    
    const count = await projectIntegrationService.addProjectToPortfolio({
      project_id: req.params.projectId,
      portfolio_id: portfolioId,
      include_units: includeUnits !== false,
      as_status: asStatus || 'active',
      created_by: userId,
    });
    
    res.json({ message: `${count} properties added to portfolio` });
  } catch (error) {
    next(error);
  }
});

export default router;
