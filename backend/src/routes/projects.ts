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
import projectService from '../services/project-management/projectService';
import phaseService from '../services/project-management/phaseService';
import unitService from '../services/project-management/unitService';
import projectCostService from '../services/project-management/projectCostService';
import contractorService from '../services/project-management/contractorService';
import drawService from '../services/project-management/drawService';
import dailyLogService from '../services/project-management/dailyLogService';
import paymentPlanService from '../services/project-management/paymentPlanService';
import punchListService from '../services/project-management/punchListService';
import projectIntegrationService from '../services/project-management/projectIntegrationService';
// Phase 1: Ghana Enhancement Services
import projectLocationService from '../services/project-management/projectLocationService';
import projectCostCurrencyService from '../services/project-management/projectCostCurrencyService';
import projectWizardService from '../services/project-management/projectWizardService';
import { 
  GHANA_REGIONS, 
  LAND_TENURE_TYPES, 
  PROJECT_TYPES,
  getPhaseTemplateForType,
  getAmenitiesForType,
  requiresEPAPermit
} from '../services/project-management/projectDefaults';
// Phase 2: Dashboard & Gantt Services
import dashboardAnalyticsService from '../services/project-management/dashboardAnalyticsService';
import milestoneService from '../services/project-management/milestoneService';
import ganttService from '../services/project-management/ganttService';
// Phase 3: Compliance & Document Services
import { complianceService } from '../services/project-management/complianceService';
import { projectDocumentService } from '../services/project-management/projectDocumentService';
import { complianceReportService } from '../services/project-management/complianceReportService';

const router = Router();

// Development mode organization ID (valid UUID for testing)
const DEV_ORG_ID = '00000000-0000-0000-0000-000000000001';
// Development mode user ID (valid UUID for testing)
const DEV_USER_ID = '00000000-0000-0000-0000-000000000001';

// Helper to get organization ID from request
const getOrgId = (req: Request): string => {
  return (req as any).organizationId || (req as any).user?.organizationId || (req as any).user?.organization_id || DEV_ORG_ID;
};

const getUserId = (req: Request): string => {
  return (req as any).user?.id || (req as any).user?.sub || (req as any).userId || DEV_USER_ID;
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
// Note: This must come AFTER all specific path routes like /ghana-regions, /ghana-districts, /validate-gps, etc.
// Use a middleware to skip non-UUID paths
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  // Skip if path matches known non-ID routes (let them fall through to later handlers)
  const nonIdPaths = [
    'summaries', 'stats', 'defaults', 'phase-templates', 'wizard', 'search', 'nearby',
    'traditional-authorities', 'assemblies', 'ghana-regions', 'ghana-districts', 
    'validate-gps', 'validate-location', 'reverse-geocode', 'estimate-costs',
    'suggest-budget-breakdown', 'required-permits', 'with-location'
  ];
  
  if (nonIdPaths.includes(req.params.id)) {
    return next('route');
  }

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

// ============================================================================
// PHASE 1: WIZARD & DRAFT MANAGEMENT
// ============================================================================

// Get wizard templates
router.get('/wizard/templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { projectType } = req.query;
    const templates = await projectWizardService.getTemplates(orgId, projectType as any);
    res.json(templates);
  } catch (error) {
    next(error);
  }
});

// Get user's drafts
router.get('/wizard/drafts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const drafts = await projectWizardService.getUserDrafts(orgId, userId);
    res.json(drafts);
  } catch (error) {
    next(error);
  }
});

// Create new wizard draft
router.post('/wizard/drafts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const orgId = getOrgId(req);
    const { templateId, draftName, draftType, sourceProjectId } = req.body;
    
    const draft = await projectWizardService.createDraft({
      organization_id: orgId,
      created_by: userId,
      draft_name: draftName,
      draft_type: draftType || 'new_project',
      source_template_id: templateId,
      source_project_id: sourceProjectId,
    });
    res.status(201).json(draft);
  } catch (error) {
    next(error);
  }
});

// Get specific draft
router.get('/wizard/drafts/:draftId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const draft = await projectWizardService.getDraftById(req.params.draftId, orgId);
    
    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    
    res.json(draft);
  } catch (error) {
    next(error);
  }
});

// Update draft (auto-save)
router.patch('/wizard/drafts/:draftId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { step, data, isAutoSave } = req.body;
    
    const draft = await projectWizardService.updateDraft(
      req.params.draftId,
      orgId,
      {
        step,
        data,
        is_auto_save: isAutoSave,
        last_edited_by: userId,
      }
    );
    
    res.json(draft);
  } catch (error) {
    next(error);
  }
});

// Validate wizard step
router.post('/wizard/drafts/:draftId/validate-step', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { step } = req.body;
    
    const validation = await projectWizardService.validateStep(
      req.params.draftId,
      orgId,
      step
    );
    
    res.json(validation);
  } catch (error) {
    next(error);
  }
});

// Complete wizard step
router.post('/wizard/drafts/:draftId/complete-step', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { stepNumber } = req.body;
    
    const draft = await projectWizardService.completeStep(
      req.params.draftId,
      orgId,
      stepNumber
    );
    
    res.json(draft);
  } catch (error) {
    next(error);
  }
});

// Get cost estimate from wizard data
router.post('/wizard/drafts/:draftId/cost-estimate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    
    const estimate = await projectWizardService.generateCostEstimate(
      req.params.draftId,
      orgId
    );
    
    res.json(estimate);
  } catch (error) {
    next(error);
  }
});

// Submit wizard and create project
router.post('/wizard/drafts/:draftId/submit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    
    const project = await projectWizardService.submitWizard(
      req.params.draftId,
      orgId,
      userId
    );
    
    res.status(201).json(project);
  } catch (error) {
    next(error);
  }
});

// Delete draft
router.delete('/wizard/drafts/:draftId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    
    await projectWizardService.deleteDraft(req.params.draftId, orgId);
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PHASE 1: LOCATION VALIDATION & ENRICHMENT
// ============================================================================

// Validate Ghana PostGPS code
router.post('/validate-gps', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { gps_code } = req.body;
    
    if (!gps_code) {
      return res.status(400).json({ 
        valid: false, 
        error: 'GPS code is required' 
      });
    }
    
    const result = await projectLocationService.validateAndEnrichLocation({
      ghana_post_gps: gps_code,
    });
    
    // Transform to GhanaPostValidation format expected by frontend
    res.json({
      valid: result.isValid,
      gpsCode: result.validated.ghana_post_gps || gps_code,
      address: [
        result.validated.ghana_area,
        result.validated.ghana_district,
        result.validated.ghana_region,
      ].filter(Boolean).join(', '),
      region: result.validated.ghana_region,
      district: result.validated.ghana_district,
      area: result.validated.ghana_area,
      latitude: result.validated.latitude,
      longitude: result.validated.longitude,
      confidence: result.confidence,
      source: result.source,
      errors: result.issues.filter(i => i.severity === 'error').map(i => i.message),
    });
  } catch (error) {
    next(error);
  }
});

// Validate and enrich location
router.post('/validate-location', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ghana_post_gps, latitude, longitude, address_line1, city, region } = req.body;
    
    const result = await projectLocationService.validateAndEnrichLocation({
      ghana_post_gps,
      latitude,
      longitude,
      address_line1,
      city,
      region,
    });
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Reverse geocode coordinates
router.post('/reverse-geocode', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { latitude, longitude } = req.body;
    
    if (!latitude || !longitude) {
      return res.status(400).json({ 
        valid: false, 
        error: 'latitude and longitude are required' 
      });
    }
    
    const result = await projectLocationService.validateAndEnrichLocation({
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
    });
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get Ghana regions
router.get('/ghana-regions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Return all 16 regions of Ghana
    const regions = [
      'Greater Accra',
      'Ashanti',
      'Western',
      'Central',
      'Eastern',
      'Volta',
      'Northern',
      'Upper East',
      'Upper West',
      'Brong-Ahafo',
      'Oti',
      'Bono East',
      'Ahafo',
      'Western North',
      'Savannah',
      'North East',
    ];
    
    res.json(regions);
  } catch (error) {
    next(error);
  }
});

// Get districts by region
router.get('/ghana-districts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { region } = req.query;
    
    if (!region) {
      return res.status(400).json({ error: 'region is required' });
    }
    
    // Ghana districts by region (major districts/municipalities)
    const districtsByRegion: Record<string, string[]> = {
      'Greater Accra': [
        'Accra Metropolitan',
        'Tema Metropolitan',
        'Ga East Municipal',
        'Ga West Municipal',
        'Ga South Municipal',
        'Ga Central Municipal',
        'Ga North Municipal',
        'La Dade Kotopon Municipal',
        'La Nkwantanang Madina Municipal',
        'Ledzokuku Municipal',
        'Kpone Katamanso Municipal',
        'Adentan Municipal',
        'Ayawaso East Municipal',
        'Ayawaso West Municipal',
        'Ayawaso North Municipal',
        'Ayawaso Central Municipal',
        'Ablekuma North Municipal',
        'Ablekuma West Municipal',
        'Ablekuma Central Municipal',
        'Okaikwei North Municipal',
        'Korle Klottey Municipal',
        'Weija Gbawe Municipal',
        'Ada East',
        'Ada West',
        'Ningo Prampram',
        'Shai Osudoku',
      ],
      'Ashanti': [
        'Kumasi Metropolitan',
        'Obuasi Municipal',
        'Asokwa Municipal',
        'Suame Municipal',
        'Bantama Municipal',
        'Nhyiaeso Municipal',
        'Kwadaso Municipal',
        'Oforikrom Municipal',
        'Tafo-Pankrono Municipal',
        'Old Tafo Municipal',
        'Asokore Mampong Municipal',
        'Afigya Kwabre South',
        'Afigya Kwabre North',
        'Atwima Kwanwoma',
        'Atwima Mponua',
        'Atwima Nwabiagya North',
        'Atwima Nwabiagya South',
        'Bekwai Municipal',
        'Bosomtwe',
        'Ejisu Municipal',
        'Juaben Municipal',
        'Kwabre East Municipal',
      ],
      'Central': [
        'Cape Coast Metropolitan',
        'Awutu Senya East Municipal',
        'Awutu Senya West',
        'Effutu Municipal',
        'Gomoa East',
        'Gomoa West',
        'Gomoa Central',
        'Mfantsiman Municipal',
        'Abura Asebu Kwamankese',
        'Asikuma Odoben Brakwa',
        'Ajumako Enyan Essiam',
        'Ekumfi',
        'Assin North',
        'Assin South',
        'Assin Fosu Municipal',
        'Twifo Atti Morkwa',
        'Twifo Hemang Lower Denkyira',
        'Upper Denkyira East Municipal',
        'Upper Denkyira West',
        'Agona East',
        'Agona West Municipal',
      ],
      'Western': [
        'Sekondi-Takoradi Metropolitan',
        'Effia Kwesimintsim Municipal',
        'Shama',
        'Ahanta West Municipal',
        'Nzema East Municipal',
        'Ellembelle',
        'Jomoro',
        'Tarkwa Nsuaem Municipal',
        'Prestea Huni Valley Municipal',
        'Wassa Amenfi East',
        'Wassa Amenfi Central',
        'Wassa Amenfi West',
        'Wassa East',
        'Mpohor',
      ],
      'Eastern': [
        'New Juaben South Municipal',
        'New Juaben North Municipal',
        'Akuapem South',
        'Akuapem North Municipal',
        'Akyem Mansa North',
        'Akyem Mansa South',
        'Birim Central Municipal',
        'Birim North',
        'Birim South',
        'Denkyembour',
        'Kwahu Afram Plains North',
        'Kwahu Afram Plains South',
        'Kwahu East',
        'Kwahu South',
        'Kwahu West Municipal',
        'Lower Manya Krobo',
        'Upper Manya Krobo',
        'Yilo Krobo Municipal',
        'Asuogyaman',
        'Nsawam Adoagyiri Municipal',
        'Suhum Municipal',
        'Ayensuano',
        'Upper West Akyem',
        'Atiwa East',
        'Atiwa West',
        'Fanteakwa North',
        'Fanteakwa South',
      ],
      'Volta': [
        'Ho Municipal',
        'Ho West',
        'South Dayi',
        'North Dayi',
        'Keta Municipal',
        'Ketu North',
        'Ketu South Municipal',
        'Akatsi North',
        'Akatsi South',
        'Adaklu',
        'Afadzato South',
        'Hohoe Municipal',
        'Anloga',
        'Central Tongu',
        'South Tongu',
        'North Tongu',
      ],
      'Northern': [
        'Tamale Metropolitan',
        'Sagnarigu Municipal',
        'Tolon',
        'Kumbungu',
        'Savelugu Municipal',
        'Nanton',
        'Zabzugu',
        'Tatale Sanguli',
        'Yendi Municipal',
        'Mion',
        'Karaga',
        'Gushegu Municipal',
        'Nanumba North Municipal',
        'Nanumba South',
      ],
      'Upper East': [
        'Bolgatanga Municipal',
        'Bolgatanga East',
        'Bongo',
        'Builsa North',
        'Builsa South',
        'Kassena Nankana West',
        'Kassena Nankana Municipal',
        'Bawku Municipal',
        'Bawku West',
        'Binduri',
        'Garu',
        'Tempane',
        'Pusiga',
        'Nabdam',
        'Talensi',
      ],
      'Upper West': [
        'Wa Municipal',
        'Wa East',
        'Wa West',
        'Nadowli Kaleo',
        'Daffiama Bussie Issa',
        'Jirapa Municipal',
        'Lambussie Karni',
        'Lawra Municipal',
        'Nandom',
        'Sissala East',
        'Sissala West',
      ],
      'Brong-Ahafo': [
        'Sunyani Municipal',
        'Sunyani West',
        'Dormaa Municipal',
        'Dormaa East',
        'Dormaa West',
        'Berekum West',
        'Berekum East Municipal',
        'Jaman North',
        'Jaman South',
        'Tain',
        'Wenchi Municipal',
      ],
      'Oti': [
        'Krachi East Municipal',
        'Krachi West',
        'Krachi Nchumuru',
        'Biakoye',
        'Jasikan',
        'Kadjebi',
        'Nkwanta North',
        'Nkwanta South Municipal',
      ],
      'Bono East': [
        'Techiman Municipal',
        'Techiman North',
        'Nkoranza North',
        'Nkoranza South Municipal',
        'Kintampo North Municipal',
        'Kintampo South',
        'Sene East',
        'Sene West',
        'Atebubu Amantin',
        'Pru East',
        'Pru West',
      ],
      'Ahafo': [
        'Asunafo North Municipal',
        'Asunafo South',
        'Asutifi North',
        'Asutifi South',
        'Tano North Municipal',
        'Tano South',
      ],
      'Western North': [
        'Sefwi Wiawso Municipal',
        'Sefwi Akontombra',
        'Bibiani Anhwiaso Bekwai Municipal',
        'Juaboso',
        'Bia East',
        'Bia West',
        'Bodi',
        'Suaman',
        'Aowin',
      ],
      'Savannah': [
        'Damongo Municipal',
        'Sawla Tuna Kalba',
        'Bole',
        'Central Gonja',
        'East Gonja Municipal',
        'North Gonja',
        'North East Gonja',
      ],
      'North East': [
        'Nalerigu Municipal',
        'Walewale Municipal',
        'Mamprugu Moagduri',
        'Bunkpurugu Nakpanduri',
        'Yunyoo Nasuan',
        'Chereponi',
      ],
    };
    
    const districts = districtsByRegion[region as string] || [];
    res.json(districts);
  } catch (error) {
    next(error);
  }
});

// Create project with location validation
router.post('/with-location', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    
    const project = await projectLocationService.createWithValidation(
      { ...req.body, organization_id: orgId, created_by: userId }
    );
    
    res.status(201).json(project);
  } catch (error) {
    next(error);
  }
});

// Search projects with full-text search
router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { q, region, district, type, status, limit, offset } = req.query;
    
    const results = await projectLocationService.searchProjects({
      organizationId: orgId,
      query: q as string,
      region: region as string,
      district: district as string,
      projectType: type as string,
      status: status as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    
    res.json(results);
  } catch (error) {
    next(error);
  }
});

// Find nearby projects
router.get('/nearby', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { lat, lng, radius, limit } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat and lng are required' });
    }
    
    const projects = await projectLocationService.findNearbyProjects(
      orgId,
      parseFloat(lat as string),
      parseFloat(lng as string),
      radius ? parseFloat(radius as string) : 5000,
      limit ? parseInt(limit as string) : 10
    );
    
    res.json(projects);
  } catch (error) {
    next(error);
  }
});

// Get traditional authorities by region - Static data for Ghana
router.get('/traditional-authorities', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { region } = req.query;
    
    // Static traditional authorities data by region
    const TRADITIONAL_AUTHORITIES: Record<string, Array<{id: string, name: string, chieftaincyTitle: string}>> = {
      'Greater Accra': [
        { id: 'ta-ga-1', name: 'Ga Traditional Council', chieftaincyTitle: 'Ga Mantse' },
        { id: 'ta-ga-2', name: 'Nungua Traditional Council', chieftaincyTitle: 'Nungua Mantse' },
        { id: 'ta-ga-3', name: 'Teshie Traditional Council', chieftaincyTitle: 'Teshie Mantse' },
        { id: 'ta-ga-4', name: 'La Traditional Council', chieftaincyTitle: 'La Mantse' },
        { id: 'ta-ga-5', name: 'Osu Traditional Council', chieftaincyTitle: 'Osu Mantse' },
        { id: 'ta-ga-6', name: 'Tema Traditional Council', chieftaincyTitle: 'Tema Mantse' },
        { id: 'ta-ga-7', name: 'Ada Traditional Council', chieftaincyTitle: 'Ada Mantse' },
      ],
      'Ashanti': [
        { id: 'ta-ash-1', name: 'Asanteman Council', chieftaincyTitle: 'Asantehene' },
        { id: 'ta-ash-2', name: 'Kumasi Traditional Council', chieftaincyTitle: 'Kumasihene' },
        { id: 'ta-ash-3', name: 'Ejisu Traditional Council', chieftaincyTitle: 'Ejisuhene' },
        { id: 'ta-ash-4', name: 'Mampong Traditional Council', chieftaincyTitle: 'Mamponghene' },
        { id: 'ta-ash-5', name: 'Bekwai Traditional Council', chieftaincyTitle: 'Bekwaihene' },
        { id: 'ta-ash-6', name: 'Offinso Traditional Council', chieftaincyTitle: 'Offinsohene' },
      ],
      'Central': [
        { id: 'ta-cen-1', name: 'Oguaa Traditional Council', chieftaincyTitle: 'Oguaahene' },
        { id: 'ta-cen-2', name: 'Elmina Traditional Council', chieftaincyTitle: 'Elminahene' },
        { id: 'ta-cen-3', name: 'Winneba Traditional Council', chieftaincyTitle: 'Winnebahene' },
        { id: 'ta-cen-4', name: 'Agona Traditional Council', chieftaincyTitle: 'Agonahene' },
        { id: 'ta-cen-5', name: 'Assin Traditional Council', chieftaincyTitle: 'Assinhene' },
      ],
      'Western': [
        { id: 'ta-wes-1', name: 'Sekondi Traditional Council', chieftaincyTitle: 'Sekondihene' },
        { id: 'ta-wes-2', name: 'Takoradi Traditional Council', chieftaincyTitle: 'Takoradihene' },
        { id: 'ta-wes-3', name: 'Ahanta Traditional Council', chieftaincyTitle: 'Ahantahene' },
        { id: 'ta-wes-4', name: 'Nzema Traditional Council', chieftaincyTitle: 'Nzemahene' },
      ],
      'Eastern': [
        { id: 'ta-eas-1', name: 'Akyem Abuakwa Traditional Council', chieftaincyTitle: 'Okyenhene' },
        { id: 'ta-eas-2', name: 'Kwahu Traditional Council', chieftaincyTitle: 'Kwahuhene' },
        { id: 'ta-eas-3', name: 'Akuapem Traditional Council', chieftaincyTitle: 'Akuapemhene' },
        { id: 'ta-eas-4', name: 'New Juaben Traditional Council', chieftaincyTitle: 'Omanhene' },
      ],
      'Volta': [
        { id: 'ta-vol-1', name: 'Anlo Traditional Council', chieftaincyTitle: 'Awomefia' },
        { id: 'ta-vol-2', name: 'Asogli Traditional Council', chieftaincyTitle: 'Agbogbomefia' },
        { id: 'ta-vol-3', name: 'Peki Traditional Council', chieftaincyTitle: 'Pekihene' },
        { id: 'ta-vol-4', name: 'Hohoe Traditional Council', chieftaincyTitle: 'Hohoehene' },
      ],
      'Northern': [
        { id: 'ta-nor-1', name: 'Dagbon Traditional Council', chieftaincyTitle: 'Ya-Na' },
        { id: 'ta-nor-2', name: 'Tamale Traditional Council', chieftaincyTitle: 'Tamale Na' },
        { id: 'ta-nor-3', name: 'Yendi Traditional Council', chieftaincyTitle: 'Yendi Na' },
      ],
      'Upper East': [
        { id: 'ta-ue-1', name: 'Bolgatanga Traditional Council', chieftaincyTitle: 'Bolganaba' },
        { id: 'ta-ue-2', name: 'Bawku Traditional Council', chieftaincyTitle: 'Bawkunaba' },
        { id: 'ta-ue-3', name: 'Navrongo Traditional Council', chieftaincyTitle: 'Navro-Pio' },
      ],
      'Upper West': [
        { id: 'ta-uw-1', name: 'Wa Traditional Council', chieftaincyTitle: 'Wa Na' },
        { id: 'ta-uw-2', name: 'Lawra Traditional Council', chieftaincyTitle: 'Lawra Na' },
        { id: 'ta-uw-3', name: 'Jirapa Traditional Council', chieftaincyTitle: 'Jirapa Na' },
      ],
      'Bono': [
        { id: 'ta-bon-1', name: 'Sunyani Traditional Council', chieftaincyTitle: 'Sunyanihene' },
        { id: 'ta-bon-2', name: 'Dormaa Traditional Council', chieftaincyTitle: 'Dormaahene' },
        { id: 'ta-bon-3', name: 'Berekum Traditional Council', chieftaincyTitle: 'Berekumhene' },
      ],
      'Bono East': [
        { id: 'ta-be-1', name: 'Techiman Traditional Council', chieftaincyTitle: 'Techimanhene' },
        { id: 'ta-be-2', name: 'Nkoranza Traditional Council', chieftaincyTitle: 'Nkoranzahene' },
        { id: 'ta-be-3', name: 'Kintampo Traditional Council', chieftaincyTitle: 'Kintampohene' },
      ],
      'Ahafo': [
        { id: 'ta-aha-1', name: 'Goaso Traditional Council', chieftaincyTitle: 'Goasohene' },
        { id: 'ta-aha-2', name: 'Bechem Traditional Council', chieftaincyTitle: 'Bechemhene' },
      ],
      'Oti': [
        { id: 'ta-oti-1', name: 'Dambai Traditional Council', chieftaincyTitle: 'Dambaihene' },
        { id: 'ta-oti-2', name: 'Nkwanta Traditional Council', chieftaincyTitle: 'Nkwantahene' },
      ],
      'Western North': [
        { id: 'ta-wn-1', name: 'Sefwi Traditional Council', chieftaincyTitle: 'Sefwihene' },
        { id: 'ta-wn-2', name: 'Juaboso Traditional Council', chieftaincyTitle: 'Juabosohene' },
      ],
      'North East': [
        { id: 'ta-ne-1', name: 'Nalerigu Traditional Council', chieftaincyTitle: 'Nayiri' },
        { id: 'ta-ne-2', name: 'Walewale Traditional Council', chieftaincyTitle: 'Walewalenaba' },
      ],
      'Savannah': [
        { id: 'ta-sav-1', name: 'Damongo Traditional Council', chieftaincyTitle: 'Yagbonwura' },
        { id: 'ta-sav-2', name: 'Bole Traditional Council', chieftaincyTitle: 'Bolewura' },
      ],
    };
    
    const regionKey = region as string;
    const authorities = regionKey ? (TRADITIONAL_AUTHORITIES[regionKey] || []) : [];
    
    res.json(authorities);
  } catch (error) {
    next(error);
  }
});

// Get regulatory assemblies - Static data for Ghana
router.get('/assemblies', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { region } = req.query;
    
    // Static assemblies data by region (same as districts but with additional metadata)
    const ASSEMBLIES: Record<string, Array<{id: string, assembly_name: string, assembly_type: string}>> = {
      'Greater Accra': [
        { id: 'asm-ga-1', assembly_name: 'Accra Metropolitan', assembly_type: 'metropolitan' },
        { id: 'asm-ga-2', assembly_name: 'Tema Metropolitan', assembly_type: 'metropolitan' },
        { id: 'asm-ga-3', assembly_name: 'Ga East Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-4', assembly_name: 'Ga West Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-5', assembly_name: 'Ga South Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-6', assembly_name: 'Ga North Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-7', assembly_name: 'Ga Central Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-8', assembly_name: 'La Dade Kotopon Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-9', assembly_name: 'La Nkwantanang Madina Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-10', assembly_name: 'Ledzokuku Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-11', assembly_name: 'Krowor Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-12', assembly_name: 'Korle Klottey Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-13', assembly_name: 'Ablekuma North Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-14', assembly_name: 'Ablekuma Central Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-15', assembly_name: 'Ablekuma West Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-16', assembly_name: 'Ayawaso North Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-17', assembly_name: 'Ayawaso East Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-18', assembly_name: 'Ayawaso West Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-19', assembly_name: 'Ayawaso Central Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-20', assembly_name: 'Okaikwei North Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-21', assembly_name: 'Weija Gbawe Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-22', assembly_name: 'Kpone Katamanso Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-23', assembly_name: 'Ada East District', assembly_type: 'district' },
        { id: 'asm-ga-24', assembly_name: 'Ada West District', assembly_type: 'district' },
        { id: 'asm-ga-25', assembly_name: 'Ningo Prampram District', assembly_type: 'district' },
        { id: 'asm-ga-26', assembly_name: 'Shai Osudoku District', assembly_type: 'district' },
      ],
      'Ashanti': [
        { id: 'asm-ash-1', assembly_name: 'Kumasi Metropolitan', assembly_type: 'metropolitan' },
        { id: 'asm-ash-2', assembly_name: 'Oforikrom Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-3', assembly_name: 'Asokwa Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-4', assembly_name: 'Suame Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-5', assembly_name: 'Old Tafo Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-6', assembly_name: 'Kwadaso Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-7', assembly_name: 'Nhyiaeso Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-8', assembly_name: 'Asokore Mampong Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-9', assembly_name: 'Bantama Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-10', assembly_name: 'Ejisu Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-11', assembly_name: 'Mampong Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-12', assembly_name: 'Obuasi Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-13', assembly_name: 'Bekwai Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-14', assembly_name: 'Offinso North District', assembly_type: 'district' },
        { id: 'asm-ash-15', assembly_name: 'Offinso South Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-16', assembly_name: 'Afigya Kwabre South District', assembly_type: 'district' },
        { id: 'asm-ash-17', assembly_name: 'Kwabre East Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-18', assembly_name: 'Atwima Kwanwoma District', assembly_type: 'district' },
        { id: 'asm-ash-19', assembly_name: 'Atwima Nwabiagya Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-20', assembly_name: 'Bosomtwe District', assembly_type: 'district' },
      ],
      'Central': [
        { id: 'asm-cen-1', assembly_name: 'Cape Coast Metropolitan', assembly_type: 'metropolitan' },
        { id: 'asm-cen-2', assembly_name: 'Komenda Edina Eguafo Abirem Municipal', assembly_type: 'municipal' },
        { id: 'asm-cen-3', assembly_name: 'Mfantseman Municipal', assembly_type: 'municipal' },
        { id: 'asm-cen-4', assembly_name: 'Abura Asebu Kwamankese District', assembly_type: 'district' },
        { id: 'asm-cen-5', assembly_name: 'Ajumako Enyan Essiam District', assembly_type: 'district' },
        { id: 'asm-cen-6', assembly_name: 'Assin Central Municipal', assembly_type: 'municipal' },
        { id: 'asm-cen-7', assembly_name: 'Assin North District', assembly_type: 'district' },
        { id: 'asm-cen-8', assembly_name: 'Assin South District', assembly_type: 'district' },
        { id: 'asm-cen-9', assembly_name: 'Twifo Atti Morkwa District', assembly_type: 'district' },
        { id: 'asm-cen-10', assembly_name: 'Upper Denkyira East Municipal', assembly_type: 'municipal' },
        { id: 'asm-cen-11', assembly_name: 'Upper Denkyira West District', assembly_type: 'district' },
        { id: 'asm-cen-12', assembly_name: 'Effutu Municipal', assembly_type: 'municipal' },
        { id: 'asm-cen-13', assembly_name: 'Gomoa Central District', assembly_type: 'district' },
        { id: 'asm-cen-14', assembly_name: 'Gomoa East District', assembly_type: 'district' },
        { id: 'asm-cen-15', assembly_name: 'Gomoa West District', assembly_type: 'district' },
        { id: 'asm-cen-16', assembly_name: 'Awutu Senya District', assembly_type: 'district' },
        { id: 'asm-cen-17', assembly_name: 'Awutu Senya East Municipal', assembly_type: 'municipal' },
        { id: 'asm-cen-18', assembly_name: 'Agona East District', assembly_type: 'district' },
        { id: 'asm-cen-19', assembly_name: 'Agona West Municipal', assembly_type: 'municipal' },
      ],
      'Western': [
        { id: 'asm-wes-1', assembly_name: 'Sekondi Takoradi Metropolitan', assembly_type: 'metropolitan' },
        { id: 'asm-wes-2', assembly_name: 'Effia Kwesimintsim Municipal', assembly_type: 'municipal' },
        { id: 'asm-wes-3', assembly_name: 'Ahanta West Municipal', assembly_type: 'municipal' },
        { id: 'asm-wes-4', assembly_name: 'Shama District', assembly_type: 'district' },
        { id: 'asm-wes-5', assembly_name: 'Wassa East District', assembly_type: 'district' },
        { id: 'asm-wes-6', assembly_name: 'Mpohor District', assembly_type: 'district' },
        { id: 'asm-wes-7', assembly_name: 'Tarkwa Nsuaem Municipal', assembly_type: 'municipal' },
        { id: 'asm-wes-8', assembly_name: 'Prestea Huni Valley Municipal', assembly_type: 'municipal' },
        { id: 'asm-wes-9', assembly_name: 'Ellembelle District', assembly_type: 'district' },
        { id: 'asm-wes-10', assembly_name: 'Nzema East Municipal', assembly_type: 'municipal' },
        { id: 'asm-wes-11', assembly_name: 'Jomoro Municipal', assembly_type: 'municipal' },
      ],
      'Eastern': [
        { id: 'asm-eas-1', assembly_name: 'New Juaben South Municipal', assembly_type: 'municipal' },
        { id: 'asm-eas-2', assembly_name: 'New Juaben North Municipal', assembly_type: 'municipal' },
        { id: 'asm-eas-3', assembly_name: 'Akuapem North Municipal', assembly_type: 'municipal' },
        { id: 'asm-eas-4', assembly_name: 'Akuapem South District', assembly_type: 'district' },
        { id: 'asm-eas-5', assembly_name: 'Akyem Mansa Municipal', assembly_type: 'municipal' },
        { id: 'asm-eas-6', assembly_name: 'Birim North District', assembly_type: 'district' },
        { id: 'asm-eas-7', assembly_name: 'Birim Central Municipal', assembly_type: 'municipal' },
        { id: 'asm-eas-8', assembly_name: 'Birim South District', assembly_type: 'district' },
        { id: 'asm-eas-9', assembly_name: 'Abuakwa South Municipal', assembly_type: 'municipal' },
        { id: 'asm-eas-10', assembly_name: 'Abuakwa North Municipal', assembly_type: 'municipal' },
        { id: 'asm-eas-11', assembly_name: 'Kwahu West Municipal', assembly_type: 'municipal' },
        { id: 'asm-eas-12', assembly_name: 'Kwahu East District', assembly_type: 'district' },
        { id: 'asm-eas-13', assembly_name: 'Kwahu South District', assembly_type: 'district' },
        { id: 'asm-eas-14', assembly_name: 'Kwahu Afram Plains North District', assembly_type: 'district' },
        { id: 'asm-eas-15', assembly_name: 'Kwahu Afram Plains South District', assembly_type: 'district' },
        { id: 'asm-eas-16', assembly_name: 'Suhum Municipal', assembly_type: 'municipal' },
        { id: 'asm-eas-17', assembly_name: 'Ayensuano District', assembly_type: 'district' },
        { id: 'asm-eas-18', assembly_name: 'West Akim Municipal', assembly_type: 'municipal' },
        { id: 'asm-eas-19', assembly_name: 'Nsawam Adoagyiri Municipal', assembly_type: 'municipal' },
      ],
      'Volta': [
        { id: 'asm-vol-1', assembly_name: 'Ho Municipal', assembly_type: 'municipal' },
        { id: 'asm-vol-2', assembly_name: 'Ho West District', assembly_type: 'district' },
        { id: 'asm-vol-3', assembly_name: 'South Dayi District', assembly_type: 'district' },
        { id: 'asm-vol-4', assembly_name: 'Keta Municipal', assembly_type: 'municipal' },
        { id: 'asm-vol-5', assembly_name: 'Ketu South Municipal', assembly_type: 'municipal' },
        { id: 'asm-vol-6', assembly_name: 'Ketu North Municipal', assembly_type: 'municipal' },
        { id: 'asm-vol-7', assembly_name: 'Akatsi South District', assembly_type: 'district' },
        { id: 'asm-vol-8', assembly_name: 'Akatsi North District', assembly_type: 'district' },
        { id: 'asm-vol-9', assembly_name: 'South Tongu District', assembly_type: 'district' },
        { id: 'asm-vol-10', assembly_name: 'Central Tongu District', assembly_type: 'district' },
        { id: 'asm-vol-11', assembly_name: 'North Tongu District', assembly_type: 'district' },
        { id: 'asm-vol-12', assembly_name: 'Adaklu District', assembly_type: 'district' },
        { id: 'asm-vol-13', assembly_name: 'Agotime Ziope District', assembly_type: 'district' },
        { id: 'asm-vol-14', assembly_name: 'North Dayi District', assembly_type: 'district' },
        { id: 'asm-vol-15', assembly_name: 'Hohoe Municipal', assembly_type: 'municipal' },
        { id: 'asm-vol-16', assembly_name: 'Afadjato South District', assembly_type: 'district' },
      ],
      'Northern': [
        { id: 'asm-nor-1', assembly_name: 'Tamale Metropolitan', assembly_type: 'metropolitan' },
        { id: 'asm-nor-2', assembly_name: 'Sagnarigu Municipal', assembly_type: 'municipal' },
        { id: 'asm-nor-3', assembly_name: 'Yendi Municipal', assembly_type: 'municipal' },
        { id: 'asm-nor-4', assembly_name: 'Mion District', assembly_type: 'district' },
        { id: 'asm-nor-5', assembly_name: 'Nanton District', assembly_type: 'district' },
        { id: 'asm-nor-6', assembly_name: 'Savelugu Municipal', assembly_type: 'municipal' },
        { id: 'asm-nor-7', assembly_name: 'Karaga District', assembly_type: 'district' },
        { id: 'asm-nor-8', assembly_name: 'Gushegu Municipal', assembly_type: 'municipal' },
        { id: 'asm-nor-9', assembly_name: 'Saboba District', assembly_type: 'district' },
        { id: 'asm-nor-10', assembly_name: 'Tatale Sanguli District', assembly_type: 'district' },
        { id: 'asm-nor-11', assembly_name: 'Zabzugu District', assembly_type: 'district' },
        { id: 'asm-nor-12', assembly_name: 'Nanumba South District', assembly_type: 'district' },
        { id: 'asm-nor-13', assembly_name: 'Nanumba North Municipal', assembly_type: 'municipal' },
        { id: 'asm-nor-14', assembly_name: 'Kpandai District', assembly_type: 'district' },
        { id: 'asm-nor-15', assembly_name: 'Kumbungu District', assembly_type: 'district' },
        { id: 'asm-nor-16', assembly_name: 'Tolon District', assembly_type: 'district' },
      ],
      'Upper East': [
        { id: 'asm-ue-1', assembly_name: 'Bolgatanga Municipal', assembly_type: 'municipal' },
        { id: 'asm-ue-2', assembly_name: 'Bolgatanga East District', assembly_type: 'district' },
        { id: 'asm-ue-3', assembly_name: 'Bongo District', assembly_type: 'district' },
        { id: 'asm-ue-4', assembly_name: 'Talensi District', assembly_type: 'district' },
        { id: 'asm-ue-5', assembly_name: 'Nabdam District', assembly_type: 'district' },
        { id: 'asm-ue-6', assembly_name: 'Kassena Nankana Municipal', assembly_type: 'municipal' },
        { id: 'asm-ue-7', assembly_name: 'Kassena Nankana West District', assembly_type: 'district' },
        { id: 'asm-ue-8', assembly_name: 'Builsa North Municipal', assembly_type: 'municipal' },
        { id: 'asm-ue-9', assembly_name: 'Builsa South District', assembly_type: 'district' },
        { id: 'asm-ue-10', assembly_name: 'Bawku Municipal', assembly_type: 'municipal' },
        { id: 'asm-ue-11', assembly_name: 'Bawku West District', assembly_type: 'district' },
        { id: 'asm-ue-12', assembly_name: 'Binduri District', assembly_type: 'district' },
        { id: 'asm-ue-13', assembly_name: 'Pusiga District', assembly_type: 'district' },
        { id: 'asm-ue-14', assembly_name: 'Garu District', assembly_type: 'district' },
        { id: 'asm-ue-15', assembly_name: 'Tempane District', assembly_type: 'district' },
      ],
      'Upper West': [
        { id: 'asm-uw-1', assembly_name: 'Wa Municipal', assembly_type: 'municipal' },
        { id: 'asm-uw-2', assembly_name: 'Wa East District', assembly_type: 'district' },
        { id: 'asm-uw-3', assembly_name: 'Wa West District', assembly_type: 'district' },
        { id: 'asm-uw-4', assembly_name: 'Nadowli Kaleo District', assembly_type: 'district' },
        { id: 'asm-uw-5', assembly_name: 'Daffiama Bussie Issa District', assembly_type: 'district' },
        { id: 'asm-uw-6', assembly_name: 'Jirapa Municipal', assembly_type: 'municipal' },
        { id: 'asm-uw-7', assembly_name: 'Lambussie Karni District', assembly_type: 'district' },
        { id: 'asm-uw-8', assembly_name: 'Lawra Municipal', assembly_type: 'municipal' },
        { id: 'asm-uw-9', assembly_name: 'Nandom Municipal', assembly_type: 'municipal' },
        { id: 'asm-uw-10', assembly_name: 'Sissala East Municipal', assembly_type: 'municipal' },
        { id: 'asm-uw-11', assembly_name: 'Sissala West District', assembly_type: 'district' },
      ],
      'Bono': [
        { id: 'asm-bon-1', assembly_name: 'Sunyani Municipal', assembly_type: 'municipal' },
        { id: 'asm-bon-2', assembly_name: 'Sunyani West Municipal', assembly_type: 'municipal' },
        { id: 'asm-bon-3', assembly_name: 'Dormaa Central Municipal', assembly_type: 'municipal' },
        { id: 'asm-bon-4', assembly_name: 'Dormaa East District', assembly_type: 'district' },
        { id: 'asm-bon-5', assembly_name: 'Dormaa West District', assembly_type: 'district' },
        { id: 'asm-bon-6', assembly_name: 'Berekum East Municipal', assembly_type: 'municipal' },
        { id: 'asm-bon-7', assembly_name: 'Berekum West District', assembly_type: 'district' },
        { id: 'asm-bon-8', assembly_name: 'Jaman North District', assembly_type: 'district' },
        { id: 'asm-bon-9', assembly_name: 'Jaman South Municipal', assembly_type: 'municipal' },
        { id: 'asm-bon-10', assembly_name: 'Tain District', assembly_type: 'district' },
        { id: 'asm-bon-11', assembly_name: 'Wenchi Municipal', assembly_type: 'municipal' },
        { id: 'asm-bon-12', assembly_name: 'Banda District', assembly_type: 'district' },
      ],
      'Bono East': [
        { id: 'asm-be-1', assembly_name: 'Techiman Municipal', assembly_type: 'municipal' },
        { id: 'asm-be-2', assembly_name: 'Techiman North District', assembly_type: 'district' },
        { id: 'asm-be-3', assembly_name: 'Nkoranza South Municipal', assembly_type: 'municipal' },
        { id: 'asm-be-4', assembly_name: 'Nkoranza North District', assembly_type: 'district' },
        { id: 'asm-be-5', assembly_name: 'Kintampo North Municipal', assembly_type: 'municipal' },
        { id: 'asm-be-6', assembly_name: 'Kintampo South District', assembly_type: 'district' },
        { id: 'asm-be-7', assembly_name: 'Atebubu Amantin Municipal', assembly_type: 'municipal' },
        { id: 'asm-be-8', assembly_name: 'Sene East District', assembly_type: 'district' },
        { id: 'asm-be-9', assembly_name: 'Sene West District', assembly_type: 'district' },
        { id: 'asm-be-10', assembly_name: 'Pru East District', assembly_type: 'district' },
        { id: 'asm-be-11', assembly_name: 'Pru West District', assembly_type: 'district' },
      ],
      'Ahafo': [
        { id: 'asm-aha-1', assembly_name: 'Asunafo North Municipal', assembly_type: 'municipal' },
        { id: 'asm-aha-2', assembly_name: 'Asunafo South District', assembly_type: 'district' },
        { id: 'asm-aha-3', assembly_name: 'Asutifi North District', assembly_type: 'district' },
        { id: 'asm-aha-4', assembly_name: 'Asutifi South District', assembly_type: 'district' },
        { id: 'asm-aha-5', assembly_name: 'Tano North Municipal', assembly_type: 'municipal' },
        { id: 'asm-aha-6', assembly_name: 'Tano South Municipal', assembly_type: 'municipal' },
      ],
      'Oti': [
        { id: 'asm-oti-1', assembly_name: 'Krachi East Municipal', assembly_type: 'municipal' },
        { id: 'asm-oti-2', assembly_name: 'Krachi West District', assembly_type: 'district' },
        { id: 'asm-oti-3', assembly_name: 'Krachi Nchumuru District', assembly_type: 'district' },
        { id: 'asm-oti-4', assembly_name: 'Nkwanta South Municipal', assembly_type: 'municipal' },
        { id: 'asm-oti-5', assembly_name: 'Nkwanta North District', assembly_type: 'district' },
        { id: 'asm-oti-6', assembly_name: 'Biakoye District', assembly_type: 'district' },
        { id: 'asm-oti-7', assembly_name: 'Jasikan District', assembly_type: 'district' },
        { id: 'asm-oti-8', assembly_name: 'Kadjebi District', assembly_type: 'district' },
      ],
      'Western North': [
        { id: 'asm-wn-1', assembly_name: 'Sefwi Wiawso Municipal', assembly_type: 'municipal' },
        { id: 'asm-wn-2', assembly_name: 'Sefwi Akontombra District', assembly_type: 'district' },
        { id: 'asm-wn-3', assembly_name: 'Bibiani Anhwiaso Bekwai Municipal', assembly_type: 'municipal' },
        { id: 'asm-wn-4', assembly_name: 'Juaboso District', assembly_type: 'district' },
        { id: 'asm-wn-5', assembly_name: 'Bia East District', assembly_type: 'district' },
        { id: 'asm-wn-6', assembly_name: 'Bia West District', assembly_type: 'district' },
        { id: 'asm-wn-7', assembly_name: 'Bodi District', assembly_type: 'district' },
        { id: 'asm-wn-8', assembly_name: 'Suaman District', assembly_type: 'district' },
        { id: 'asm-wn-9', assembly_name: 'Aowin Municipal', assembly_type: 'municipal' },
      ],
      'North East': [
        { id: 'asm-ne-1', assembly_name: 'Mamprugu Moagduri District', assembly_type: 'district' },
        { id: 'asm-ne-2', assembly_name: 'West Mamprusi Municipal', assembly_type: 'municipal' },
        { id: 'asm-ne-3', assembly_name: 'East Mamprusi Municipal', assembly_type: 'municipal' },
        { id: 'asm-ne-4', assembly_name: 'Bunkpurugu Nakpanduri District', assembly_type: 'district' },
        { id: 'asm-ne-5', assembly_name: 'Yunyoo Nasuan District', assembly_type: 'district' },
        { id: 'asm-ne-6', assembly_name: 'Chereponi District', assembly_type: 'district' },
      ],
      'Savannah': [
        { id: 'asm-sav-1', assembly_name: 'West Gonja Municipal', assembly_type: 'municipal' },
        { id: 'asm-sav-2', assembly_name: 'Central Gonja District', assembly_type: 'district' },
        { id: 'asm-sav-3', assembly_name: 'East Gonja Municipal', assembly_type: 'municipal' },
        { id: 'asm-sav-4', assembly_name: 'North Gonja District', assembly_type: 'district' },
        { id: 'asm-sav-5', assembly_name: 'North East Gonja District', assembly_type: 'district' },
        { id: 'asm-sav-6', assembly_name: 'Sawla Tuna Kalba District', assembly_type: 'district' },
        { id: 'asm-sav-7', assembly_name: 'Bole District', assembly_type: 'district' },
      ],
    };
    
    const regionKey = region as string;
    const assemblies = regionKey ? (ASSEMBLIES[regionKey] || []) : [];
    
    res.json(assemblies);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PHASE 1: MULTI-CURRENCY & COST ESTIMATION
// ============================================================================

// Get exchange rates
router.get('/exchange-rates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rates = await projectCostCurrencyService.getAllExchangeRates();
    res.json(rates);
  } catch (error) {
    next(error);
  }
});

// Convert currency
router.post('/convert-currency', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, fromCurrency, toCurrency } = req.body;
    
    const result = await projectCostCurrencyService.convertCurrency(
      amount,
      fromCurrency,
      toCurrency
    );
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Generate cost estimate
router.post('/estimate-costs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { 
      project_type, 
      total_sqm, 
      total_floors,
      region,
      finish_level,
      include_land,
      land_cost_per_sqm,
      display_currency 
    } = req.body;
    
    const estimate = await projectCostCurrencyService.generateCostEstimate(
      {
        project_type,
        total_sqm,
        total_floors,
        region,
        finish_level: finish_level || 'standard',
        include_land,
        land_cost_per_sqm,
      },
      display_currency || 'GHS'
    );
    
    res.json(estimate);
  } catch (error) {
    next(error);
  }
});

// Get material cost benchmarks
router.get('/benchmarks/materials', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { region, category } = req.query;
    
    const benchmarks = await projectCostCurrencyService.getMaterialCostBenchmarks(
      region as any,
      category as string | undefined
    );
    
    res.json(benchmarks);
  } catch (error) {
    next(error);
  }
});

// Get labor rate benchmarks
router.get('/benchmarks/labor', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { region } = req.query;
    
    const benchmarks = await projectCostCurrencyService.getLaborRateBenchmarks(
      region as any
    );
    
    res.json(benchmarks);
  } catch (error) {
    next(error);
  }
});

// Capture exchange rate snapshot for project
router.post('/:projectId/capture-exchange-rates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const snapshot = await projectCostCurrencyService.captureExchangeRateSnapshot(
      req.params.projectId
    );
    
    res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PHASE 1: PERMIT MANAGEMENT
// ============================================================================

// Get project permits
router.get('/:projectId/permits', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const permits = await projectLocationService.getProjectPermits(req.params.projectId);
    res.json(permits);
  } catch (error) {
    next(error);
  }
});

// Add permit to project
router.post('/:projectId/permits', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { 
      permitTypeId, 
      applicationNumber, 
      status, 
      submittedDate, 
      approvedDate,
      expiryDate,
      fees,
      documents 
    } = req.body;
    
    const permit = await projectLocationService.addProjectPermit({
      projectId: req.params.projectId,
      permitTypeId,
      applicationNumber,
      status,
      submittedDate,
      approvedDate,
      expiryDate,
      fees,
      documents,
      createdBy: userId,
    });
    
    res.status(201).json(permit);
  } catch (error) {
    next(error);
  }
});

// Update permit status
router.patch('/:projectId/permits/:permitId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    
    const permit = await projectLocationService.updatePermitStatus(
      req.params.permitId,
      req.body,
      userId
    );
    
    res.json(permit);
  } catch (error) {
    next(error);
  }
});

// Get required permits for project type
router.get('/permit-requirements', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectType, region, totalArea } = req.query;
    
    const requirements = await projectLocationService.getRequiredPermits({
      projectType: projectType as string,
      region: region as string,
      totalArea: totalArea ? parseFloat(totalArea as string) : undefined,
    });
    
    res.json(requirements);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PHASE 1: GHANA-SPECIFIC CONFIGURATION ENDPOINTS
// ============================================================================

// Get Ghana regions
router.get('/config/regions', async (_req: Request, res: Response) => {
  res.json(GHANA_REGIONS);
});

// Get land tenure types
router.get('/config/land-tenure-types', async (_req: Request, res: Response) => {
  res.json(LAND_TENURE_TYPES);
});

// Get project types
router.get('/config/project-types', async (_req: Request, res: Response) => {
  res.json(PROJECT_TYPES);
});

// Get phase templates for project type
router.get('/config/phase-templates/:projectType', async (req: Request, res: Response) => {
  const template = getPhaseTemplateForType(req.params.projectType);
  res.json(template);
});

// Get amenities for project type
router.get('/config/amenities/:projectType', async (req: Request, res: Response) => {
  const amenities = getAmenitiesForType(req.params.projectType);
  res.json(amenities);
});

// Check if EPA permit is required
router.get('/config/epa-requirements', async (req: Request, res: Response) => {
  const { projectType, totalArea } = req.query;
  
  const required = requiresEPAPermit(
    projectType as string,
    totalArea ? parseFloat(totalArea as string) : undefined
  );
  
  res.json({ required, projectType, totalArea });
});

// ============================================================================
// PHASE 2: DASHBOARD ANALYTICS
// ============================================================================

// Get portfolio metrics
router.get('/dashboard/metrics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { projectTypes, statuses, regions } = req.query;
    
    const filters = {
      organizationId: orgId,
      projectTypes: projectTypes ? (projectTypes as string).split(',') : undefined,
      statuses: statuses ? (statuses as string).split(',') : undefined,
      regions: regions ? (regions as string).split(',') : undefined
    };
    
    const metrics = await dashboardAnalyticsService.getPortfolioMetrics(orgId, filters);
    res.json(metrics);
  } catch (error) {
    next(error);
  }
});

// Get budget overview
router.get('/dashboard/budget-overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const overview = await dashboardAnalyticsService.getBudgetOverview(orgId);
    res.json(overview);
  } catch (error) {
    next(error);
  }
});

// Get timeline status
router.get('/dashboard/timeline-status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const status = await dashboardAnalyticsService.getTimelineStatus(orgId);
    res.json(status);
  } catch (error) {
    next(error);
  }
});

// Get compliance status (Ghana regulatory)
router.get('/dashboard/compliance-status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const status = await dashboardAnalyticsService.getComplianceStatus(orgId);
    res.json(status);
  } catch (error) {
    next(error);
  }
});

// Get active alerts
router.get('/dashboard/alerts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { projectId, severity, limit } = req.query;
    
    const alerts = await dashboardAnalyticsService.getActiveAlerts(orgId, {
      projectId: projectId as string,
      severity: severity ? (severity as string).split(',') : undefined,
      limit: limit ? parseInt(limit as string) : undefined
    });
    
    res.json(alerts);
  } catch (error) {
    next(error);
  }
});

// Acknowledge alert
router.post('/dashboard/alerts/:id/acknowledge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    await dashboardAnalyticsService.acknowledgeAlert(req.params.id, userId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Resolve alert
router.post('/dashboard/alerts/:id/resolve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    await dashboardAnalyticsService.resolveAlert(req.params.id, userId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Dismiss alert
router.post('/dashboard/alerts/:id/dismiss', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await dashboardAnalyticsService.dismissAlert(req.params.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Snooze alert
router.post('/dashboard/alerts/:id/snooze', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { days } = req.body;
    await dashboardAnalyticsService.snoozeAlert(req.params.id, days || 1);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Get upcoming milestones (dashboard widget)
router.get('/dashboard/upcoming-milestones', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { daysAhead, projectId, milestoneTypes, limit } = req.query;
    
    const milestones = await dashboardAnalyticsService.getUpcomingMilestones(orgId, {
      daysAhead: daysAhead ? parseInt(daysAhead as string) : undefined,
      projectId: projectId as string,
      milestoneTypes: milestoneTypes ? (milestoneTypes as string).split(',') : undefined,
      limit: limit ? parseInt(limit as string) : undefined
    });
    
    res.json(milestones);
  } catch (error) {
    next(error);
  }
});

// Get progress trend
router.get('/dashboard/progress-trend', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { projectId, period } = req.query;
    
    const trend = await dashboardAnalyticsService.getProgressTrend(
      orgId,
      projectId as string,
      (period as 'daily' | 'weekly' | 'monthly') || 'weekly'
    );
    
    res.json(trend);
  } catch (error) {
    next(error);
  }
});

// Get project health score
router.get('/:id/health-score', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const healthScore = await dashboardAnalyticsService.getProjectHealthScore(req.params.id, orgId);
    res.json(healthScore);
  } catch (error) {
    next(error);
  }
});

// Get budget variance analysis (EVM)
router.get('/:id/budget-variance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const analysis = await dashboardAnalyticsService.getBudgetVarianceAnalysis(req.params.id, orgId);
    res.json(analysis);
  } catch (error) {
    next(error);
  }
});

// Forecast completion
router.get('/:id/forecast-completion', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const forecast = await dashboardAnalyticsService.forecastCompletion(req.params.id, orgId);
    res.json(forecast);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PHASE 2: MILESTONES
// ============================================================================

// Get project milestones
router.get('/:id/milestones', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { phaseId, includeCompleted } = req.query;
    
    const milestones = await milestoneService.getProjectMilestones(
      req.params.id,
      orgId,
      {
        phaseId: phaseId as string,
        includeCompleted: includeCompleted === 'true'
      }
    );
    
    res.json(milestones);
  } catch (error) {
    next(error);
  }
});

// Get milestone by ID
router.get('/:projectId/milestones/:milestoneId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const milestone = await milestoneService.getMilestoneById(req.params.milestoneId, orgId);
    
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }
    
    res.json(milestone);
  } catch (error) {
    next(error);
  }
});

// Create milestone
router.post('/:id/milestones', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    
    // Map snake_case from frontend to camelCase for service
    const { target_date, phase_id, milestone_type, ...rest } = req.body;
    
    const milestone = await milestoneService.createMilestone({
      ...rest,
      projectId: req.params.id,
      organizationId: orgId,
      createdBy: userId,
      targetDate: target_date || rest.targetDate,
      phaseId: phase_id || rest.phaseId,
      milestoneType: milestone_type || rest.milestoneType || 'internal'
    });
    
    res.status(201).json(milestone);
  } catch (error) {
    next(error);
  }
});

// Update milestone
router.put('/:projectId/milestones/:milestoneId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    
    // Map snake_case from frontend to camelCase for service
    const { target_date, phase_id, due_date, ...rest } = req.body;
    
    const milestone = await milestoneService.updateMilestone(
      req.params.milestoneId,
      orgId,
      { 
        ...rest, 
        updatedBy: userId,
        targetDate: target_date || due_date || rest.targetDate,
        phaseId: phase_id || rest.phaseId
      }
    );
    
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }
    
    res.json(milestone);
  } catch (error) {
    next(error);
  }
});

// Delete milestone
router.delete('/:projectId/milestones/:milestoneId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const deleted = await milestoneService.deleteMilestone(req.params.milestoneId, orgId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Milestone not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Complete milestone
router.post('/:projectId/milestones/:milestoneId/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { actualDate } = req.body;
    
    const milestone = await milestoneService.completeMilestone(
      req.params.milestoneId,
      orgId,
      actualDate,
      userId
    );
    
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }
    
    res.json(milestone);
  } catch (error) {
    next(error);
  }
});

// Reschedule milestone
router.post('/:projectId/milestones/:milestoneId/reschedule', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { newTargetDate, reason } = req.body;
    
    const milestone = await milestoneService.rescheduleMilestone(
      req.params.milestoneId,
      orgId,
      newTargetDate,
      reason,
      userId
    );
    
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }
    
    res.json(milestone);
  } catch (error) {
    next(error);
  }
});

// Get milestone statistics
router.get('/:id/milestone-stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const stats = await milestoneService.getStats(req.params.id, orgId);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// MILESTONE SUB-PHASES
// ============================================================================

// Get all sub-phases for a milestone
router.get('/:projectId/milestones/:milestoneId/subphases', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const subphases = await milestoneService.getSubphasesByMilestone(
      req.params.milestoneId,
      orgId
    );
    res.json(subphases);
  } catch (error) {
    next(error);
  }
});

// Get milestone with sub-phases summary
router.get('/:projectId/milestones/:milestoneId/with-subphases', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const result = await milestoneService.getMilestoneWithSubphases(
      req.params.milestoneId,
      orgId
    );
    
    if (!result) {
      return res.status(404).json({ error: 'Milestone not found' });
    }
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Create a sub-phase
router.post('/:projectId/milestones/:milestoneId/subphases', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { start_date, end_date, sequence_order, assigned_to, assigned_team, estimated_hours, ...rest } = req.body;
    
    const subphase = await milestoneService.createSubphase({
      milestoneId: req.params.milestoneId,
      projectId: req.params.projectId,
      organizationId: orgId,
      startDate: start_date || rest.startDate,
      endDate: end_date || rest.endDate,
      sequenceOrder: sequence_order ?? rest.sequenceOrder,
      assignedTo: assigned_to || rest.assignedTo,
      assignedTeam: assigned_team || rest.assignedTeam,
      estimatedHours: estimated_hours ?? rest.estimatedHours,
      createdBy: userId,
      ...rest,
    });
    
    res.status(201).json(subphase);
  } catch (error) {
    next(error);
  }
});

// Get a single sub-phase
router.get('/:projectId/milestones/:milestoneId/subphases/:subphaseId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const subphase = await milestoneService.getSubphaseById(
      req.params.subphaseId,
      orgId
    );
    
    if (!subphase) {
      return res.status(404).json({ error: 'Sub-phase not found' });
    }
    
    res.json(subphase);
  } catch (error) {
    next(error);
  }
});

// Update a sub-phase
router.put('/:projectId/milestones/:milestoneId/subphases/:subphaseId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { 
      start_date, end_date, actual_start_date, actual_end_date,
      sequence_order, assigned_to, assigned_team, 
      estimated_hours, actual_hours, progress_percentage,
      depends_on_subphase_ids, ...rest 
    } = req.body;
    
    const subphase = await milestoneService.updateSubphase(
      req.params.subphaseId,
      orgId,
      {
        startDate: start_date || rest.startDate,
        endDate: end_date || rest.endDate,
        actualStartDate: actual_start_date || rest.actualStartDate,
        actualEndDate: actual_end_date || rest.actualEndDate,
        sequenceOrder: sequence_order ?? rest.sequenceOrder,
        assignedTo: assigned_to || rest.assignedTo,
        assignedTeam: assigned_team || rest.assignedTeam,
        estimatedHours: estimated_hours ?? rest.estimatedHours,
        actualHours: actual_hours ?? rest.actualHours,
        progressPercentage: progress_percentage ?? rest.progressPercentage,
        dependsOnSubphaseIds: depends_on_subphase_ids || rest.dependsOnSubphaseIds,
        updatedBy: userId,
        ...rest,
      }
    );
    
    if (!subphase) {
      return res.status(404).json({ error: 'Sub-phase not found' });
    }
    
    res.json(subphase);
  } catch (error) {
    next(error);
  }
});

// Delete a sub-phase
router.delete('/:projectId/milestones/:milestoneId/subphases/:subphaseId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const deleted = await milestoneService.deleteSubphase(
      req.params.subphaseId,
      orgId
    );
    
    if (!deleted) {
      return res.status(404).json({ error: 'Sub-phase not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Reorder sub-phases
router.post('/:projectId/milestones/:milestoneId/subphases/reorder', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { orderedIds } = req.body;
    
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: 'orderedIds must be an array of sub-phase IDs' });
    }
    
    const subphases = await milestoneService.reorderSubphases(
      req.params.milestoneId,
      orgId,
      orderedIds
    );
    
    res.json(subphases);
  } catch (error) {
    next(error);
  }
});

// Apply Ghana milestone templates
router.post('/:id/milestones/apply-ghana-templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { projectType, projectStartDate } = req.body;
    
    const milestones = await milestoneService.applyGhanaTemplates(
      req.params.id,
      orgId,
      projectType,
      projectStartDate,
      userId
    );
    
    res.json({ milestones, count: milestones.length });
  } catch (error) {
    next(error);
  }
});

// Get milestone templates
router.get('/config/milestone-templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { projectType, ghanaSpecificOnly, milestoneType } = req.query;
    
    const templates = await milestoneService.getTemplates(orgId, {
      projectType: projectType as string,
      ghanaSpecificOnly: ghanaSpecificOnly === 'true',
      milestoneType: milestoneType as any
    });
    
    res.json(templates);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PHASE 2: GANTT CHART & TIMELINE
// ============================================================================

// Get Gantt data for project
router.get('/:id/gantt', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const ganttData = await ganttService.getGanttData(req.params.id, orgId);
    res.json(ganttData);
  } catch (error) {
    next(error);
  }
});

// Calculate critical path
router.post('/:id/gantt/calculate-critical-path', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const result = await ganttService.calculateCriticalPath(req.params.id, orgId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Update phase dates
router.put('/:projectId/gantt/phases/:phaseId/dates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { startDate, endDate, cascadeToSuccessors } = req.body;
    
    await ganttService.updatePhaseDates(
      req.params.phaseId,
      req.params.projectId,
      orgId,
      { startDate, endDate, cascadeToSuccessors }
    );
    
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Update phase dependencies
router.put('/:id/gantt/dependencies', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { updates } = req.body; // Array of { phaseId, dependencyIds }
    
    await ganttService.updateDependencies(req.params.id, orgId, updates);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PHASE 2: BASELINES
// ============================================================================

// Get project baselines
router.get('/:id/baselines', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const baselines = await ganttService.getProjectBaselines(req.params.id, orgId);
    res.json(baselines);
  } catch (error) {
    next(error);
  }
});

// Get baseline by ID
router.get('/:projectId/baselines/:baselineId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const baseline = await ganttService.getBaseline(req.params.baselineId, orgId);
    
    if (!baseline) {
      return res.status(404).json({ error: 'Baseline not found' });
    }
    
    res.json(baseline);
  } catch (error) {
    next(error);
  }
});

// Create baseline
router.post('/:id/baselines', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { name, description } = req.body;
    
    const baseline = await ganttService.createBaseline(
      req.params.id,
      orgId,
      name,
      description,
      userId
    );
    
    res.status(201).json(baseline);
  } catch (error) {
    next(error);
  }
});

// Set active baseline
router.post('/:projectId/baselines/:baselineId/set-active', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await ganttService.setActiveBaseline(req.params.baselineId, req.params.projectId, orgId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Delete baseline
router.delete('/:projectId/baselines/:baselineId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const deleted = await ganttService.deleteBaseline(req.params.baselineId, orgId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Baseline not found or is locked' });
    }
    
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Get baseline comparison
router.get('/:id/baseline-comparison', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { baselineId } = req.query;
    
    const comparison = await ganttService.getBaselineComparison(
      req.params.id,
      orgId,
      baselineId as string
    );
    
    if (!comparison) {
      return res.status(404).json({ error: 'No baseline found for comparison' });
    }
    
    res.json(comparison);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PHASE 3: COMPLIANCE
// ============================================================================

// Get compliance dashboard for a project
router.get('/:id/compliance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dashboard = await complianceService.getComplianceDashboard(req.params.id);
    res.json(dashboard);
  } catch (error) {
    next(error);
  }
});

// Get compliance score
router.get('/:id/compliance/score', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const score = await complianceService.getComplianceScore(req.params.id);
    res.json(score || { compliance_score: 0, risk_level: 'unknown' });
  } catch (error) {
    next(error);
  }
});

// Get all permits for a project
router.get('/:id/permits', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, type, expiring } = req.query;
    const permits = await complianceService.getPermitsByProject(req.params.id, {
      project_id: req.params.id,
      status: status as any,
      permit_type: type as any,
      expiring_within_days: expiring ? parseInt(expiring as string) : undefined,
    });
    res.json(permits);
  } catch (error) {
    next(error);
  }
});

// Create a permit
router.post('/:id/permits', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    
    const permit = await complianceService.createPermit({
      ...req.body,
      project_id: req.params.id,
      organization_id: orgId,
      created_by: userId,
    });
    
    res.status(201).json(permit);
  } catch (error) {
    next(error);
  }
});

// Get a specific permit
router.get('/:projectId/permits/:permitId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const permit = await complianceService.getPermitById(req.params.permitId);
    
    if (!permit) {
      return res.status(404).json({ error: 'Permit not found' });
    }
    
    res.json(permit);
  } catch (error) {
    next(error);
  }
});

// Update a permit
router.put('/:projectId/permits/:permitId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    
    const permit = await complianceService.updatePermit(req.params.permitId, {
      ...req.body,
      updated_by: userId,
    });
    
    if (!permit) {
      return res.status(404).json({ error: 'Permit not found' });
    }
    
    res.json(permit);
  } catch (error) {
    next(error);
  }
});

// Delete a permit
router.delete('/:projectId/permits/:permitId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = await complianceService.deletePermit(req.params.permitId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Permit not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Get inspections for a permit
router.get('/:projectId/permits/:permitId/inspections', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inspections = await complianceService.getInspectionsByPermit(req.params.permitId);
    res.json(inspections);
  } catch (error) {
    next(error);
  }
});

// Create an inspection
router.post('/:projectId/permits/:permitId/inspections', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    
    const inspection = await complianceService.createInspection({
      ...req.body,
      permit_id: req.params.permitId,
      project_id: req.params.projectId,
      conducted_by: userId,
    });
    
    res.status(201).json(inspection);
  } catch (error) {
    next(error);
  }
});

// Update an inspection
router.put('/:projectId/inspections/:inspectionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inspection = await complianceService.updateInspection(req.params.inspectionId, req.body);
    
    if (!inspection) {
      return res.status(404).json({ error: 'Inspection not found' });
    }
    
    res.json(inspection);
  } catch (error) {
    next(error);
  }
});

// Delete an inspection
router.delete('/:projectId/inspections/:inspectionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = await complianceService.deleteInspection(req.params.inspectionId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Inspection not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Get all inspections for a project
router.get('/:id/inspections', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inspections = await complianceService.getInspectionsByProject(req.params.id);
    res.json(inspections);
  } catch (error) {
    next(error);
  }
});

// Get regulatory authorities
router.get('/compliance/authorities', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { region } = req.query;
    const authorities = await complianceService.getAuthorities(region as string);
    res.json(authorities);
  } catch (error) {
    next(error);
  }
});

// Get regulatory templates
router.get('/compliance/templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { region, project_type } = req.query;
    const templates = await complianceService.getTemplates(region as string, project_type as string);
    res.json(templates);
  } catch (error) {
    next(error);
  }
});

// Apply regulatory template to project
router.post('/:id/compliance/apply-template', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { templateId } = req.body;
    
    const permits = await complianceService.applyTemplate(
      req.params.id,
      orgId,
      templateId,
      userId
    );
    
    res.status(201).json(permits);
  } catch (error) {
    next(error);
  }
});

// Get expiring permits for organization
router.get('/compliance/expiring', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { days } = req.query;
    const permits = await complianceService.getExpiringPermits(orgId, parseInt(days as string) || 30);
    res.json(permits);
  } catch (error) {
    next(error);
  }
});

// Get expired permits for organization
router.get('/compliance/expired', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const permits = await complianceService.getExpiredPermits(orgId);
    res.json(permits);
  } catch (error) {
    next(error);
  }
});

// Get compliance summary for organization
router.get('/compliance/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const summary = await complianceService.getComplianceSummaryByOrganization(orgId);
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PHASE 3: DOCUMENTS
// ============================================================================

// Get folder tree for a project
router.get('/:id/folders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tree } = req.query;
    
    if (tree === 'true') {
      const folders = await projectDocumentService.getFolderTree(req.params.id);
      res.json(folders);
    } else {
      const folders = await projectDocumentService.getFoldersByProject(req.params.id);
      res.json(folders);
    }
  } catch (error) {
    next(error);
  }
});

// Create a folder
router.post('/:id/folders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    
    const folder = await projectDocumentService.createFolder({
      ...req.body,
      project_id: req.params.id,
      organization_id: orgId,
      created_by: userId,
    });
    
    res.status(201).json(folder);
  } catch (error) {
    next(error);
  }
});

// Update a folder
router.put('/:projectId/folders/:folderId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const folder = await projectDocumentService.updateFolder(req.params.folderId, req.body);
    
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    res.json(folder);
  } catch (error) {
    next(error);
  }
});

// Delete a folder
router.delete('/:projectId/folders/:folderId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { moveDocumentsTo } = req.query;
    const deleted = await projectDocumentService.deleteFolder(
      req.params.folderId,
      moveDocumentsTo as string
    );
    
    if (!deleted) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Get all documents for a project
router.get('/:id/documents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { folder, type, tags, search, expiring } = req.query;
    
    const documents = await projectDocumentService.getDocumentsByProject(req.params.id, {
      project_id: req.params.id,
      folder_id: folder as string,
      document_type: type as any,
      tags: tags ? (tags as string).split(',') : undefined,
      search: search as string,
      expiring_within_days: expiring ? parseInt(expiring as string) : undefined,
    });
    
    res.json(documents);
  } catch (error) {
    next(error);
  }
});

// Get documents by folder
router.get('/:projectId/folders/:folderId/documents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const documents = await projectDocumentService.getDocumentsByFolder(req.params.folderId);
    res.json(documents);
  } catch (error) {
    next(error);
  }
});

// Get document statistics
router.get('/:id/documents/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await projectDocumentService.getDocumentStats(req.params.id);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// Create a document
router.post('/:id/documents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    
    const document = await projectDocumentService.createDocument({
      ...req.body,
      project_id: req.params.id,
      organization_id: orgId,
      uploaded_by: userId,
    });
    
    res.status(201).json(document);
  } catch (error) {
    next(error);
  }
});

// Get a specific document
router.get('/:projectId/documents/:documentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const document = await projectDocumentService.getDocumentById(req.params.documentId);
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Record access
    await projectDocumentService.recordDocumentAccess(req.params.documentId, userId);
    
    res.json(document);
  } catch (error) {
    next(error);
  }
});

// Update a document
router.put('/:projectId/documents/:documentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const document = await projectDocumentService.updateDocument(req.params.documentId, req.body);
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json(document);
  } catch (error) {
    next(error);
  }
});

// Delete a document
router.delete('/:projectId/documents/:documentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { hard } = req.query;
    const deleted = await projectDocumentService.deleteDocument(
      req.params.documentId,
      hard === 'true'
    );
    
    if (!deleted) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Archive a document
router.post('/:projectId/documents/:documentId/archive', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const document = await projectDocumentService.archiveDocument(req.params.documentId);
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json(document);
  } catch (error) {
    next(error);
  }
});

// Restore a document
router.post('/:projectId/documents/:documentId/restore', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const document = await projectDocumentService.restoreDocument(req.params.documentId);
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json(document);
  } catch (error) {
    next(error);
  }
});

// Upload a new version
router.post('/:projectId/documents/:documentId/versions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    
    const document = await projectDocumentService.uploadNewVersion(req.params.documentId, {
      ...req.body,
      changed_by: userId,
    });
    
    res.status(201).json(document);
  } catch (error) {
    next(error);
  }
});

// Get document versions
router.get('/:projectId/documents/:documentId/versions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const versions = await projectDocumentService.getDocumentVersions(req.params.documentId);
    res.json(versions);
  } catch (error) {
    next(error);
  }
});

// Revert to a version
router.post('/:projectId/documents/:documentId/versions/:versionId/revert', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    
    const document = await projectDocumentService.revertToVersion(
      req.params.documentId,
      req.params.versionId,
      userId
    );
    
    res.json(document);
  } catch (error) {
    next(error);
  }
});

// Create a share link
router.post('/:projectId/documents/:documentId/share', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    
    const share = await projectDocumentService.createShare({
      ...req.body,
      document_id: req.params.documentId,
      created_by: userId,
    });
    
    res.status(201).json(share);
  } catch (error) {
    next(error);
  }
});

// Get shares for a document
router.get('/:projectId/documents/:documentId/shares', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const shares = await projectDocumentService.getSharesByDocument(req.params.documentId);
    res.json(shares);
  } catch (error) {
    next(error);
  }
});

// Delete a share
router.delete('/:projectId/shares/:shareId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = await projectDocumentService.deleteShare(req.params.shareId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Share not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Access shared document (public route - no auth required)
router.get('/shared/:shareToken', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { password } = req.query;
    
    const result = await projectDocumentService.validateShare(
      req.params.shareToken,
      password as string
    );
    
    if (!result.valid) {
      return res.status(403).json({ error: result.message });
    }
    
    // Record access
    await projectDocumentService.recordShareAccess(req.params.shareToken, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    
    res.json(result.document);
  } catch (error) {
    next(error);
  }
});

// Get document templates
router.get('/documents/templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { category, type } = req.query;
    
    const templates = await projectDocumentService.getTemplates(
      orgId,
      category as string,
      type as string
    );
    
    res.json(templates);
  } catch (error) {
    next(error);
  }
});

// Get expiring documents for organization
router.get('/documents/expiring', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { days } = req.query;
    const documents = await projectDocumentService.getExpiringDocuments(orgId, parseInt(days as string) || 30);
    res.json(documents);
  } catch (error) {
    next(error);
  }
});

// Get expired documents for organization
router.get('/documents/expired', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const documents = await projectDocumentService.getExpiredDocuments(orgId);
    res.json(documents);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// COMPLIANCE REPORTS (with E-Sign integration)
// ============================================================================

// Generate compliance report for a project
router.post('/:id/compliance/report', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    
    const {
      include_inspections,
      include_timeline,
      include_recommendations,
      for_signing,
      signees,
    } = req.body;
    
    const report = await complianceReportService.generateReport({
      project_id: req.params.id,
      organization_id: orgId,
      generated_by: userId,
      include_inspections,
      include_timeline,
      include_recommendations,
      for_signing,
      signees,
    });
    
    res.status(201).json({
      report_id: report.report_id,
      pdf_url: report.pdf_url,
      signing_request_id: report.signing_request_id,
    });
  } catch (error) {
    next(error);
  }
});

// Download compliance report PDF
router.get('/:id/compliance/report/:reportId/download', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const report = await complianceReportService.getReportById(req.params.reportId);
    
    if (!report || report.project_id !== req.params.id) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    // Redirect to PDF URL or stream the file
    res.redirect(report.pdf_url);
  } catch (error) {
    next(error);
  }
});

// Get compliance reports for a project
router.get('/:id/compliance/reports', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reports = await complianceReportService.getReportsByProject(req.params.id);
    res.json(reports);
  } catch (error) {
    next(error);
  }
});

// Get single compliance report
router.get('/:id/compliance/report/:reportId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const report = await complianceReportService.getReportById(req.params.reportId);
    
    if (!report || report.project_id !== req.params.id) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    res.json(report);
  } catch (error) {
    next(error);
  }
});

// =====================================================
// PAYMENT CONFIGURATION (Payout Account Setup)
// =====================================================

/**
 * GET /api/v1/projects/payments/account
 * Get current payout account config for the organization
 */
router.get('/payments/account', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = getOrgId(req);

    const { pool } = await import('../database');
    const result = await pool.query(
      `SELECT * FROM payment_accounts
       WHERE entity_id = $1 AND entity_type = 'organization' AND is_active = TRUE
       LIMIT 1`,
      [organizationId]
    );

    if (result.rows.length === 0) {
      const legacy = await pool.query(
        `SELECT * FROM pm_payment_accounts
         WHERE organization_id = $1 AND is_active = TRUE
         LIMIT 1`,
        [organizationId]
      );

      if (legacy.rows.length === 0) {
        return res.json({ configured: false });
      }

      const row = legacy.rows[0];
      return res.json({
        configured: true,
        settlementMethod: 'bank',
        bankName: row.paystack_bank_name,
        bankCode: row.paystack_bank_code,
        accountNumber: row.paystack_account_number,
        accountName: row.paystack_account_name,
        subaccountCode: row.paystack_subaccount_code,
        platformFeePercentage: parseFloat(row.platform_fee_percentage || 1),
        platformFeeFlat: parseFloat(row.platform_fee_flat || 25),
        isVerified: !!row.verified_at,
        verifiedAt: row.verified_at,
        createdAt: row.created_at
      });
    }

    const row = result.rows[0];
    res.json({
      configured: true,
      settlementMethod: row.settlement_method || 'bank',
      bankName: row.bank_name,
      bankCode: row.bank_code,
      accountNumber: row.account_number,
      accountName: row.account_name,
      momoProvider: row.momo_provider,
      momoNumber: row.momo_number,
      subaccountCode: row.paystack_subaccount_code,
      platformFeePercentage: parseFloat(row.platform_fee_percentage || 0.01) * 100,
      platformFeeFlat: parseFloat(row.platform_fee_flat || 25),
      isVerified: row.is_verified,
      verifiedAt: row.verified_at,
      createdAt: row.created_at
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/projects/payments/banks
 * Get list of supported banks for payout setup
 */
router.get('/payments/banks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { paystackService } = await import('../services/property-management/payment/paystackService');
    const banks = await paystackService.getBanks('ghana');
    res.json(banks);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/projects/payments/register-account
 * Register or update the organization's bank account for payouts
 */
router.post('/payments/register-account', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = getOrgId(req);
    const { bankCode, accountNumber, businessName, contactEmail, contactPhone } = req.body;

    if (!bankCode || !accountNumber || !businessName) {
      return res.status(400).json({ error: 'bankCode, accountNumber, and businessName are required' });
    }

    const { paystackService } = await import('../services/property-management/payment/paystackService');

    const result = await paystackService.registerPropertyManagerAccount(
      organizationId, bankCode, accountNumber, businessName, contactEmail, contactPhone
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, subaccountCode: result.subaccountCode });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/projects/payments/resolve-account
 * Verify a bank account number (name enquiry)
 */
router.post('/payments/resolve-account', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { accountNumber, bankCode } = req.body;

    if (!accountNumber || !bankCode) {
      return res.status(400).json({ error: 'accountNumber and bankCode are required' });
    }

    const { paystackService } = await import('../services/property-management/payment/paystackService');
    const result = await paystackService.resolveAccount(accountNumber, bankCode);
    res.json(result);
  } catch (err: any) {
    const status = err.status || 422;
    res.status(status).json({
      status: false,
      error: err.paystackMessage || err.message || 'Account verification failed',
      meta: err.paystackMeta || undefined
    });
  }
});

// =====================================================
// CRYPTO WALLET CONFIGURATION
// =====================================================

/**
 * GET /api/v1/projects/payments/crypto-wallet
 * Get current crypto wallet configuration for the project management org
 */
router.get('/payments/crypto-wallet', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = getOrgId(req);

    const { pool } = await import('../database');
    const result = await pool.query(
      `SELECT crypto_wallet_address, crypto_wallet_verified, crypto_wallet_registered_at
       FROM payment_accounts
       WHERE entity_id = $1 AND entity_type = 'organization' AND is_active = TRUE
       LIMIT 1`,
      [organizationId]
    );

    if (result.rows.length === 0 || !result.rows[0].crypto_wallet_address) {
      return res.json({ configured: false });
    }

    const row = result.rows[0];
    res.json({
      configured: true,
      walletAddress: row.crypto_wallet_address,
      isVerified: row.crypto_wallet_verified || false,
      registeredAt: row.crypto_wallet_registered_at,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/projects/payments/crypto-wallet
 * Save/update crypto wallet address for the project management org
 */
router.post('/payments/crypto-wallet', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = getOrgId(req);
    const { walletAddress } = req.body;

    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({ error: 'Invalid wallet address. Must be a valid Polygon address (0x + 40 hex chars)' });
    }

    const { pool } = await import('../database');
    const upsertResult = await pool.query(`
      INSERT INTO payment_accounts (id, entity_type, entity_id, crypto_wallet_address, crypto_wallet_registered_at, updated_at, is_active)
      VALUES (gen_random_uuid(), 'organization', $1, $2, NOW(), NOW(), TRUE)
      ON CONFLICT (entity_type, entity_id) DO UPDATE SET
        crypto_wallet_address = $2,
        crypto_wallet_registered_at = NOW(),
        updated_at = NOW()
      RETURNING id, crypto_wallet_address, crypto_wallet_verified, crypto_wallet_registered_at
    `, [organizationId, walletAddress]);

    const row = upsertResult.rows[0];

    let onChainRegistered = false;
    try {
      const { cryptoPaymentService } = await import('../../shared-services/payments/crypto');
      if (cryptoPaymentService.isConfigured()) {
        await cryptoPaymentService.registerRecipientWallet('organization', organizationId, walletAddress);
        onChainRegistered = true;
        await pool.query(`UPDATE payment_accounts SET crypto_wallet_verified = true WHERE id = $1`, [row.id]);
      }
    } catch {
      // On-chain registration is optional
    }

    res.json({
      success: true,
      walletAddress: row.crypto_wallet_address,
      isVerified: onChainRegistered || row.crypto_wallet_verified || false,
      registeredAt: row.crypto_wallet_registered_at,
    });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// PROJECT PAYMENT INITIATION
// =====================================================

/**
 * POST /api/v1/projects/payments/initiate
 * Initialize a project payment via Paystack (card / mobile money).
 * Applies the project fee rule: 0.25% of payment value.
 *
 * Use cases:
 * - Milestone payments from buyer/client to developer
 * - Contractor payments
 * - Payment plan installments
 *
 * Body: {
 *   projectId: string,
 *   amount: number (GHS — principal amount),
 *   email: string (payer email),
 *   description?: string,
 *   channel?: 'mobile_money' | 'card',
 *   callbackUrl?: string,
 *   milestoneId?: string,
 *   paymentPlanId?: string
 * }
 */
router.post('/payments/initiate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = getOrgId(req);
    const { projectId, amount, email, description, channel, callbackUrl, milestoneId, paymentPlanId } = req.body;

    if (!projectId || !amount || !email) {
      return res.status(400).json({ error: 'projectId, amount, and email are required' });
    }

    const { paymentProcessor } = await import('../services/property-management/payment/paymentProcessor');

    const result = await paymentProcessor.initializeGenericPayment({
      entityId: projectId,
      entityType: 'project',
      recipientId: organizationId,
      recipientType: 'organization',
      amount: parseFloat(amount),
      email,
      description: description || 'Project payment',
      channel: channel || 'mobile_money',
      callbackUrl,
      metadata: {
        project_id: projectId,
        milestone_id: milestoneId || null,
        payment_plan_id: paymentPlanId || null,
      },
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/projects/payments/crypto/initiate
 * Initialize a project payment via crypto (unified — any coin).
 * Applies the project fee rule: 0.25% of payment value.
 *
 * Body: {
 *   projectId: string,
 *   amount: number (GHS — principal amount),
 *   payerCurrency: string (e.g. 'btc', 'eth', 'usdt'),
 *   payerChain: string (e.g. 'bitcoin', 'ethereum', 'polygon'),
 *   payerWalletAddress?: string,
 *   requiresEscrow?: boolean,
 *   description?: string,
 *   milestoneId?: string,
 *   paymentPlanId?: string
 * }
 */
router.post('/payments/crypto/initiate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = getOrgId(req);
    const {
      projectId, amount, payerCurrency, payerChain,
      payerWalletAddress, requiresEscrow, description,
      milestoneId, paymentPlanId,
    } = req.body;

    if (!projectId || !amount || !payerCurrency || !payerChain) {
      return res.status(400).json({
        error: 'projectId, amount, payerCurrency, and payerChain are required'
      });
    }

    if (payerWalletAddress && /^0x/.test(payerWalletAddress) && !/^0x[a-fA-F0-9]{40}$/.test(payerWalletAddress)) {
      return res.status(400).json({ error: 'Invalid EVM wallet address format' });
    }

    const { paymentProcessor } = await import('../services/property-management/payment/paymentProcessor');

    const result = await paymentProcessor.initializeUnifiedCryptoPayment({
      paymentType: 'project',
      entityId: projectId,
      entityType: 'project',
      recipientId: organizationId,
      recipientType: 'organization',
      amount: parseFloat(amount),
      payerCurrency,
      payerChain,
      payerWalletAddress,
      requiresEscrow: requiresEscrow ?? false,
      description: description || 'Project crypto payment',
      metadata: {
        project_id: projectId,
        organization_id: organizationId,
        milestone_id: milestoneId || null,
        payment_plan_id: paymentPlanId || null,
      },
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/projects/payments/crypto/estimate
 * Get fee estimate for a project crypto payment.
 * Returns fee breakdown showing the 0.25% platform fee.
 */
router.get('/payments/crypto/estimate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount } = req.query;

    if (!amount) {
      return res.status(400).json({ error: 'amount (GHS) is required' });
    }

    const { feeEngine } = await import('../../shared-services/payments/feeEngine');
    const organizationId = getOrgId(req);
    const fee = await feeEngine.calculate('project', parseFloat(amount as string), organizationId, 'organization');

    const { exchangeRateService } = await import('../../shared-services/payments/crypto/exchangeRateService');
    const usdAmount = await exchangeRateService.convertGhsToUsd(fee.totalCharge);

    res.json({
      principalGhs: fee.principalAmount,
      serviceFeeGhs: fee.serviceFee,
      totalChargeGhs: fee.totalCharge,
      usdAmount,
      feeMode: fee.feeMode,
      feePercentage: fee.percentageRateApplied,
      feeDescription: fee.feeDescription,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
