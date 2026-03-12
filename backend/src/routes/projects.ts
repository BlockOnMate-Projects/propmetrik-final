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
import { registerPMParamValidation, getAuthUserId, getAuthOrgId, getAuthContext, requirePMWrite } from '../middleware/pmAuth';
import { validate } from '../middleware/validation';
import { createProjectSchema, updateProjectSchema, createPhaseSchema, updatePhaseSchema, createMilestoneSchema, updateMilestoneSchema, createDailyLogSchema, createPunchItemSchema, updatePunchItemSchema } from '../middleware/pmProjectValidation';
import projectService from '../services/project-management/projectService';
import phaseService from '../services/project-management/phaseService';
import unitService from '../services/project-management/unitService';
import projectCostService from '../services/project-management/projectCostService';
import contractorService from '../services/project-management/contractorService';
import drawService from '../services/project-management/drawService';
import dailyLogService from '../services/project-management/dailyLogService';
import paymentPlanService from '../services/project-management/paymentPlanService';
import punchListService, { PunchListService } from '../services/project-management/punchListService';
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
// Data Hub Services (construction costs, FX, etc.)
import { constructionCostService } from '../services/data-hub/constructionCostService';
// Phase 2: Dashboard & Gantt Services
import dashboardAnalyticsService from '../services/project-management/dashboardAnalyticsService';
import milestoneService from '../services/project-management/milestoneService';
import ganttService from '../services/project-management/ganttService';
// Phase 3: Compliance & Document Services
import { complianceService } from '../services/project-management/complianceService';
import { projectDocumentService } from '../services/project-management/projectDocumentService';
import { complianceReportService } from '../services/project-management/complianceReportService';
// PDF Report Services
import rfiService from '../services/project-management/rfiService';
import submittalService from '../services/project-management/submittalService';
import changeOrderService from '../services/project-management/changeOrderService';
import multer from 'multer';
import PDFDocument from 'pdfkit';
import { uploadFile, getPresignedDownloadUrl, buckets } from '../database/minio';
import { v4 as uuidv4 } from 'uuid';

// Configure multer for project document uploads
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const router = Router();

// Register UUID parameter validation for all PM param names
registerPMParamValidation(router);

// Secure helpers — always use authenticated user context (never raw headers)
const getOrgId = (req: Request): string => getAuthOrgId(req);
const getUserId = (req: Request): string => getAuthUserId(req);

// ============================================================================
// PROJECTS
// ============================================================================

// Roles that see ALL org projects (admins / firm leadership)
const FULL_ACCESS_ROLES = ['admin', 'super_admin', 'firm_principal', 'manager', 'pm'];

// Get all projects
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { roles } = getAuthContext(req);
    const hasFullAccess = roles.some(r => FULL_ACCESS_ROLES.includes(r));
    const { status, type, city, region, manager, search, page, limit, sort, order } = req.query;
    
    // Non-admin roles only see projects they're assigned to
    const assignedUserId = hasFullAccess ? undefined : userId;

    const result = await projectService.getAll(
      {
        organization_id: orgId,
        status: status as any,
        project_type: type as any,
        city: city as string,
        region: region as string,
        project_manager_id: manager as string,
        search: search as string,
        assigned_user_id: assignedUserId,
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
    const userId = getUserId(req);
    const { roles } = getAuthContext(req);
    const hasFullAccess = roles.some(r => FULL_ACCESS_ROLES.includes(r));
    const assignedUserId = hasFullAccess ? undefined : userId;
    const summaries = await projectService.getSummaries(orgId, assignedUserId);
    res.json(summaries);
  } catch (error) {
    next(error);
  }
});

// Get project statistics
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { roles } = getAuthContext(req);
    const hasFullAccess = roles.some(r => FULL_ACCESS_ROLES.includes(r));
    const assignedUserId = hasFullAccess ? undefined : userId;
    const stats = await projectService.getStats(orgId, assignedUserId);
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
router.post('/phase-templates', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/', requirePMWrite, validate(createProjectSchema), async (req: Request, res: Response, next: NextFunction) => {
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

// ============================================================================
// AGGREGATED DOCUMENTS (across all projects in org)
// ============================================================================
router.get('/all-documents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { pool } = await import('../database');
    const { category, search, page: pageQ, limit: limitQ } = req.query;
    const page = parseInt(pageQ as string) || 1;
    const limit = Math.min(parseInt(limitQ as string) || 25, 100);
    const offset = (page - 1) * limit;

    let whereClause = `pd.organization_id = $1 AND pd.status = 'active' AND pd.is_current = true`;
    const params: any[] = [orgId];
    let paramIdx = 2;

    if (category && category !== 'all') {
      whereClause += ` AND pd.document_type = $${paramIdx}`;
      params.push(category);
      paramIdx++;
    }

    if (search) {
      whereClause += ` AND (pd.name ILIKE $${paramIdx} OR pd.original_filename ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM project_documents pd WHERE ${whereClause}`, params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query(
      `SELECT pd.*, 
              u.full_name as uploaded_by_name, 
              dp.project_name as project_name
       FROM project_documents pd
       LEFT JOIN users u ON pd.uploaded_by::text = u.id::text
       LEFT JOIN development_projects dp ON pd.project_id::text = dp.id::text
       WHERE ${whereClause}
       ORDER BY pd.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    res.json({
      data: result.rows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
});

// Get single project
// UUID param validation in pmAuth.ts skips non-UUID values via next('route'),
// so this handler only fires for valid UUID :id params.
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
router.put('/:id', requirePMWrite, validate(updateProjectSchema), async (req: Request, res: Response, next: NextFunction) => {
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
router.patch('/:id/status', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.delete('/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:id/phases', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:id/phases/bulk', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.put('/phases/:phaseId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.patch('/phases/:phaseId/progress', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.patch('/phases/:phaseId/status', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.put('/:id/phases/reorder', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.delete('/phases/:phaseId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/phases/:phaseId/milestones', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.put('/phases/:phaseId/milestones/:milestoneId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/phases/:phaseId/milestones/:milestoneId/complete', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.delete('/phases/:phaseId/milestones/:milestoneId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:id/units', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:id/units/bulk', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.put('/units/:unitId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/units/:unitId/reserve', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/units/:unitId/contract', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/units/:unitId/sold', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/units/:unitId/handover', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/units/:unitId/cancel-reservation', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/units/:unitId/upgrades', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.delete('/units/:unitId/upgrades/:upgradeId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/units/:unitId/payments', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/units/:unitId/link-deal', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.delete('/units/:unitId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:id/costs', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:id/costs/from-template', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.put('/costs/:costId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/costs/:costId/invoice', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/costs/:costId/approve', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/costs/:costId/pay', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/costs/bulk-approve', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.delete('/costs/:costId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/contractors', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.put('/contractors/:contractorId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/contractors/:contractorId/approve', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/contractors/:contractorId/activate', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/contractors/:contractorId/suspend', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/contractors/:contractorId/rate', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/contractors/:contractorId/documents', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.delete('/contractors/:contractorId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:id/contractors', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.put('/assignments/:assignmentId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.patch('/assignments/:assignmentId/progress', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/assignments/:assignmentId/bill', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/assignments/:assignmentId/pay', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/assignments/:assignmentId/complete', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:projectId/draws', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/draws/:drawId/submit', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/draws/:drawId/approve', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/draws/:drawId/reject', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/draws/:drawId/fund', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.put('/draws/:drawId/items', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/draws/:drawId/documents', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:projectId/logs', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.put('/logs/:logId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.delete('/logs/:logId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/logs/:logId/photos', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.delete('/logs/:logId/photos/:photoId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/logs/:logId/activities', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/logs/:logId/approve', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/logs/:logId/revoke', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/units/:unitId/payment-plan', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/payment-plans/:planId/payments', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/payment-plans/:planId/default', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/payment-plans/:planId/cancel', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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

// Get punch item stats for a project (used by overview dashboard)
router.get('/:id/punch-items/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const projectId = req.params.id;

    // Direct query — avoids fragile getSummary with missing columns
    const result = await require('../database').pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN pli.status = 'open' THEN 1 END) as open_count,
        COUNT(CASE WHEN pli.status = 'in_progress' THEN 1 END) as in_progress_count,
        COUNT(CASE WHEN pli.status = 'completed' THEN 1 END) as completed_count,
        COUNT(CASE WHEN pli.status = 'verified' THEN 1 END) as verified_count,
        COUNT(CASE WHEN pli.due_date < NOW() AND pli.status NOT IN ('completed', 'verified', 'deferred') THEN 1 END) as overdue_count
      FROM punch_list_items pli
      WHERE pli.organization_id = $1
        AND pli.project_id = $2
    `, [orgId, projectId]);

    const row = result.rows[0] || {};

    res.json({
      total: parseInt(row.total) || 0,
      by_status: {
        open: parseInt(row.open_count) || 0,
        in_progress: parseInt(row.in_progress_count) || 0,
        completed: parseInt(row.completed_count) || 0,
        closed: parseInt(row.verified_count) || 0,
        ready_for_inspection: 0,
      },
      overdue: parseInt(row.overdue_count) || 0,
    });
  } catch (error) {
    next(error);
  }
});

// Get all punch list items for organization
router.get('/punch-lists', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { unitId, projectId, status, priority, category, contractorId, isOverdue, page, limit, pageSize } = req.query;

    const result = await punchListService.getAll(
      orgId,
      {
        unit_id: unitId as string,
        project_id: projectId as string,
        status: status as any,
        priority: priority as any,
        category: category as any,
        assigned_to: contractorId as string,
        is_overdue: isOverdue === 'true'
      },
      parseInt(page as string) || 1,
      parseInt(limit as string) || parseInt(pageSize as string) || 50
    );

    res.json({
      success: true,
      data: result.data.map(item => PunchListService.toCamelCase(item)),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages
    });
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
      return res.status(404).json({ success: false, error: 'Punch list item not found' });
    }

    res.json({ success: true, data: PunchListService.toCamelCase(item) });
  } catch (error) {
    next(error);
  }
});

// Create punch list item (project-level — no unit required)
router.post('/punch-lists', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { projectId, title, description, priority, category, location, dueDate, unitId, assignedTo, assignedContractorName } = req.body;

    if (!projectId) {
      return res.status(400).json({ success: false, error: 'projectId is required' });
    }
    if (!title) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }

    const item = await punchListService.create({
      project_id: projectId,
      unit_id: unitId,
      organization_id: orgId,
      title,
      description,
      priority: priority || 'medium',
      category: category || 'other',
      location,
      due_date: dueDate,
      assigned_to: assignedTo,
      assigned_contractor_name: assignedContractorName,
      created_by: userId
    });

    res.status(201).json({ success: true, data: PunchListService.toCamelCase(item) });
  } catch (error) {
    next(error);
  }
});

// Create punch list item (unit-level)
router.post('/units/:unitId/punch-list', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);

    const item = await punchListService.create({
      ...req.body,
      unit_id: req.params.unitId,
      organization_id: orgId,
      created_by: userId
    });

    res.status(201).json({ success: true, data: PunchListService.toCamelCase(item) });
  } catch (error) {
    next(error);
  }
});

// Create bulk punch list items
router.post('/units/:unitId/punch-list/bulk', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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

    res.status(201).json({ success: true, data: created.map(i => PunchListService.toCamelCase(i)) });
  } catch (error) {
    next(error);
  }
});

// Update punch list item
router.put('/punch-lists/:itemId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await punchListService.update(req.params.itemId, req.body);

    if (!item) {
      return res.status(404).json({ success: false, error: 'Punch list item not found' });
    }

    res.json({ success: true, data: PunchListService.toCamelCase(item) });
  } catch (error) {
    next(error);
  }
});

// Delete punch list item
router.delete('/punch-lists/:itemId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const success = await punchListService.delete(req.params.itemId);

    if (!success) {
      return res.status(404).json({ success: false, error: 'Punch list item not found' });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Assign punch list item to contractor
router.post('/punch-lists/:itemId/assign', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/punch-lists/:itemId/start', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/punch-lists/:itemId/complete', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/punch-lists/:itemId/verify', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/punch-lists/:itemId/reject', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/punch-lists/:itemId/defer', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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

// Photo management — photos stored as JSONB in punch_list_items table
// TODO: Implement JSONB photo add/remove if needed

// Complete all punch list items for a unit
router.post('/units/:unitId/punch-list/complete-all', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/units/:unitId/link-deal', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.delete('/deal-links/:linkId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/units/:unitId/assign-buyer', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/units/:unitId/handover', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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

// ============================================================================
// PDF REPORT GENERATION — Uses shared pdfReportKit
// ============================================================================
import {
  COLORS as C, PAGE, PDF,
  fmtGHS, fmtPct, titleCase, safeDate, ensureSpace,
  pdfCover, pdfSection, pdfStatCards, pdfKeyValueGrid, pdfProgressBar,
  pdfTable as pdfRichTable, pdfInfoPanel, pdfBudgetBar, pdfBudgetLegend,
  pdfPageHeader, pdfSeparator,
} from '../utils/pdfReportKit';

const MARGIN = PAGE.margin;
const CONTENT_W = PAGE.contentWidth;

// ============================================================================
// PORTFOLIO-LEVEL PDF REPORT (must be before /:projectId routes)
// ============================================================================
router.get('/portfolio/reports/:reportType', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { reportType } = req.params;

    // Gather ALL portfolio data in parallel
    const [metricsData, budgetData, timelineData, complianceData, alertsData, milestonesData] = await Promise.all([
      dashboardAnalyticsService.getPortfolioMetrics(orgId).catch(() => null),
      dashboardAnalyticsService.getBudgetOverview(orgId).catch(() => null),
      dashboardAnalyticsService.getTimelineStatus(orgId).catch(() => null),
      dashboardAnalyticsService.getComplianceStatus(orgId).catch(() => null),
      dashboardAnalyticsService.getActiveAlerts(orgId).catch(() => []),
      dashboardAnalyticsService.getUpcomingMilestones(orgId).catch(() => []),
    ]);

    const doc = PDF.create();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="portfolio-${reportType}-${new Date().toISOString().split('T')[0]}.pdf"`);
    doc.pipe(res);

    const m: any = metricsData || {};
    const s: any = m.summary || m;
    const b: any = budgetData || {};
    const t: any = timelineData || {};

    // ── Summary ──
    if (reportType === 'summary' || reportType === 'all') {
      pdfCover(doc, {
        title: 'Portfolio Summary Report',
        subtitle: 'All Projects Overview',
        reportType: 'PORTFOLIO SUMMARY',
        meta: [
          `${s.totalProjects ?? s.total_projects ?? 0} Projects | ${fmtGHS(s.totalBudget ?? s.total_budget)} Total Budget`,
        ],
      });

      // KPI Cards
      pdfSection(doc, 'Portfolio Overview');
      pdfStatCards(doc, [
        { label: 'Total Projects', value: String(s.totalProjects ?? s.total_projects ?? 0), color: C.info },
        { label: 'Active', value: String(s.activeProjects ?? s.active_projects ?? 0), color: C.positive },
        { label: 'Completed', value: String(s.completedProjects ?? s.completed_projects ?? 0), color: C.brand },
        { label: 'On Hold', value: String(s.onHoldProjects ?? s.on_hold_projects ?? 0), color: C.warning },
      ]);

      pdfStatCards(doc, [
        { label: 'Total Budget', value: fmtGHS(s.totalBudget ?? s.total_budget), color: C.heading },
        { label: 'Total Spent', value: fmtGHS(s.totalSpent ?? s.total_spent), color: C.negative },
        { label: 'Total Units', value: String(s.totalUnits ?? s.total_units ?? 0), color: C.info },
        { label: 'Avg Progress', value: fmtPct(s.averageProgress ?? s.avgProgress ?? s.avg_progress), color: C.positive },
      ]);

      // Budget health
      const bh: any = m.budgetHealth || {};
      if (bh.underBudget || bh.onBudget || bh.overBudget) {
        pdfSection(doc, 'Budget Health');
        pdfStatCards(doc, [
          { label: 'Under Budget', value: String(bh.underBudget ?? bh.under_budget ?? 0), color: C.positive },
          { label: 'On Budget', value: String(bh.onBudget ?? bh.on_budget ?? 0), color: C.info },
          { label: 'Over Budget', value: String(bh.overBudget ?? bh.over_budget ?? 0), color: C.negative },
        ]);
      }

      // Projects by status breakdown
      if (m.byStatus?.length) {
        pdfSection(doc, 'Projects by Status');
        pdfRichTable(doc,
          ['Status', 'Count', 'Total Budget', '% of Total'],
          m.byStatus.map((r: any) => [titleCase(r.status), String(r.count), fmtGHS(r.totalBudget), fmtPct(r.percentOfTotal)]),
          [160, 80, 130, 120], { rightAlignFrom: 1 }
        );
      }

      // Projects by type
      if (m.byProjectType?.length) {
        pdfSection(doc, 'Projects by Type');
        pdfRichTable(doc,
          ['Type', 'Count', 'Total Budget', 'Avg Progress'],
          m.byProjectType.map((r: any) => [titleCase(r.projectType), String(r.count), fmtGHS(r.totalBudget), fmtPct(r.averageProgress)]),
          [160, 80, 130, 120], { rightAlignFrom: 1 }
        );
      }

      // By region
      if (m.byRegion?.length) {
        pdfSection(doc, 'Projects by Region');
        pdfRichTable(doc,
          ['Region', 'Projects', 'Total Budget'],
          m.byRegion.map((r: any) => [titleCase(r.region), String(r.count), fmtGHS(r.totalBudget)]),
          [200, 100, 190], { rightAlignFrom: 1 }
        );
      }

      // Active alerts
      const alerts = (alertsData as any[]) || [];
      if (alerts.length > 0) {
        pdfSection(doc, 'Active Alerts');
        alerts.slice(0, 8).forEach((a: any) => {
          const alertType = a.severity === 'critical' ? 'danger' : a.severity === 'high' ? 'warning' : 'info';
          pdfInfoPanel(doc, `[${(a.severity || 'info').toUpperCase()}] ${a.title || a.message} — ${a.projectName || ''}`, alertType as any);
        });
      }
    }

    // ── Budget Report ──
    if (reportType === 'budget' || reportType === 'all') {
      if (reportType === 'all') doc.addPage();
      pdfCover(doc, {
        title: 'Portfolio Budget Report',
        subtitle: 'Financial Analysis',
        reportType: 'BUDGET REPORT',
        meta: [
          `Total Budget: ${fmtGHS(b.totalBudget)} | Spent: ${fmtGHS(b.totalActualCost)}`,
          `Variance: ${fmtGHS(b.overallVariance)} (${fmtPct(b.overallVariancePercent)})`,
        ],
      });

      pdfSection(doc, 'Financial Summary');
      pdfStatCards(doc, [
        { label: 'Total Budget', value: fmtGHS(b.totalBudget), color: C.info },
        { label: 'Actual Cost', value: fmtGHS(b.totalActualCost), color: C.heading },
        { label: 'Committed', value: fmtGHS(b.totalCommitted), color: C.warning },
        { label: 'Remaining', value: fmtGHS(b.totalRemaining), color: C.positive },
      ]);

      const varianceColor = (b.overallVariance ?? 0) < 0 ? C.negative : C.positive;
      pdfStatCards(doc, [
        { label: 'Variance', value: fmtGHS(b.overallVariance), color: varianceColor },
        { label: 'Variance %', value: fmtPct(b.overallVariancePercent), color: varianceColor },
      ]);

      if ((b.overallVariance ?? 0) < 0) {
        pdfInfoPanel(doc, `Portfolio is over budget by ${fmtGHS(Math.abs(b.overallVariance))} (${fmtPct(Math.abs(b.overallVariancePercent))}). Review cost categories below for details.`, 'danger');
      } else {
        pdfInfoPanel(doc, `Portfolio is within budget. ${fmtGHS(b.totalRemaining)} remaining across all projects.`, 'success');
      }

      // Budget by category with visual bars
      if (b.byCategory?.length > 0) {
        pdfSection(doc, 'Budget by Category');
        // Legend
        doc.fontSize(7).fillColor(C.info).text('■ Budget', MARGIN + 105, doc.y, { continued: true });
        doc.fillColor(C.positive).text('   ■ Actual (under)', { continued: true });
        doc.fillColor(C.negative).text('   ■ Actual (over)');
        doc.moveDown(0.5);
        b.byCategory.forEach((c: any) => {
          pdfBudgetBar(doc, c.category, c.budgeted, c.actual);
        });
        doc.moveDown(0.5);
        pdfRichTable(doc,
          ['Category', 'Budgeted', 'Actual', 'Variance', 'Var %', 'Util %'],
          b.byCategory.map((c: any) => [
            titleCase(c.category),
            fmtGHS(c.budgeted), fmtGHS(c.actual), fmtGHS(c.variance),
            fmtPct(c.variancePercent), fmtPct(c.utilizationPercent),
          ]),
          [90, 80, 80, 80, 65, 65], { rightAlignFrom: 1 }
        );
      }

      // Budget by project
      if (b.byProject?.length > 0) {
        pdfSection(doc, 'Budget by Project');
        pdfRichTable(doc,
          ['Project', 'Budget', 'Actual', 'Variance', 'Status'],
          b.byProject.map((p: any) => [
            (p.projectName || '—').substring(0, 30),
            fmtGHS(p.totalBudget ?? p.budget), fmtGHS(p.actualCost),
            fmtGHS(p.variance),
            titleCase(p.status),
          ]),
          [150, 90, 90, 90, 75], { rightAlignFrom: 1 }
        );
      }

      // Monthly trend
      if (b.monthlyTrend?.length > 0) {
        pdfSection(doc, 'Monthly Spend Trend');
        pdfRichTable(doc,
          ['Month', 'Budgeted', 'Actual', 'Cumulative'],
          b.monthlyTrend.map((m: any) => [m.month, fmtGHS(m.budgeted), fmtGHS(m.actual), fmtGHS(m.cumulative)]),
          [130, 110, 110, 140], { rightAlignFrom: 1 }
        );
      }
    }

    // ── Issues / Risk Report ──
    if (reportType === 'issues' || reportType === 'all') {
      if (reportType === 'all') doc.addPage();
      pdfCover(doc, {
        title: 'Portfolio Risk & Timeline Report',
        subtitle: 'Schedule & Risk Analysis',
        reportType: 'RISK ANALYSIS',
        meta: [
          `On Track: ${t.onTrack ?? 0} | At Risk: ${t.atRisk ?? 0} | Delayed: ${t.delayed ?? 0}`,
        ],
      });

      pdfSection(doc, 'Schedule Overview');
      pdfStatCards(doc, [
        { label: 'On Track', value: String(t.onTrack ?? t.on_track ?? 0), color: C.positive },
        { label: 'At Risk', value: String(t.atRisk ?? t.at_risk ?? 0), color: C.warning },
        { label: 'Delayed', value: String(t.delayed ?? 0), color: C.negative },
        { label: 'Completed', value: String(t.completed ?? 0), color: C.info },
      ]);

      // Project timeline details
      if (t.projects?.length > 0) {
        pdfSection(doc, 'Project Timeline Status');
        pdfRichTable(doc,
          ['Project', 'Status', 'Phase', 'Progress', 'Days Var'],
          t.projects.map((p: any) => [
            (p.projectName || p.name || '—').substring(0, 25),
            titleCase(p.status),
            titleCase(p.currentPhase || '—'),
            fmtPct(p.percentComplete),
            String(p.daysVariance ?? 0),
          ]),
          [130, 80, 100, 70, 60]
        );
      }

      // Upcoming milestones
      const ms = (milestonesData as any[]) || [];
      if (ms.length > 0) {
        pdfSection(doc, 'Upcoming Milestones');
        pdfRichTable(doc,
          ['Milestone', 'Project', 'Due Date', 'Days Left', 'Priority'],
          ms.slice(0, 15).map((m: any) => [
            (m.milestoneName || m.milestone?.name || '—').substring(0, 25),
            (m.projectName || m.project?.name || '—').substring(0, 20),
            safeDate(m.targetDate || m.milestone?.target_date),
            String(m.daysUntilDue ?? 0),
            titleCase(m.priority || m.milestone?.priority || '—'),
          ]),
          [130, 110, 80, 60, 60]
        );
      }

      // Compliance
      const comp: any = complianceData || {};
      if (comp.permits || comp.totalPermits) {
        pdfSection(doc, 'Compliance Status');
        const permits = comp.permits || comp;
        pdfStatCards(doc, [
          { label: 'Total Permits', value: String(permits.total ?? permits.totalPermits ?? 0), color: C.info },
          { label: 'Active', value: String(permits.active ?? 0), color: C.positive },
          { label: 'Expiring Soon', value: String(permits.expiringSoon ?? permits.expiring_soon ?? 0), color: C.warning },
          { label: 'Expired', value: String(permits.expired ?? 0), color: C.negative },
        ]);
      }
    }

    PDF.addFooters(doc);
    doc.end();
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// SINGLE-PROJECT PDF REPORT
// ============================================================================
router.get('/:projectId/reports/:reportType', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { projectId, reportType } = req.params;

    // Gather ALL project-level data in parallel
    const [report, phases, unitStats, drawSummary, punchSummary, rfiStats, submittalStats, coStats, assignments] = await Promise.all([
      projectIntegrationService.getProjectReport(projectId),
      phaseService.getByProject(projectId).catch(() => []),
      unitService.getStats(projectId).catch(() => null),
      drawService.getSummary(projectId).catch(() => null),
      punchListService.getSummary(orgId, projectId).catch(() => null),
      rfiService.getStats(projectId).catch(() => null),
      submittalService.getStats(projectId).catch(() => null),
      changeOrderService.getStats(projectId).catch(() => null),
      contractorService.getProjectAssignments(projectId).catch(() => []),
    ]);

    const proj = report.project;
    const projName = proj.name || proj.project_name || 'Project';
    const sum = report.summary;
    const budget = report.budget;

    const doc = PDF.create();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${projName.replace(/[^a-zA-Z0-9]/g, '_')}-${reportType}-${new Date().toISOString().split('T')[0]}.pdf"`);
    doc.pipe(res);

    // ── Summary ──
    if (reportType === 'summary' || reportType === 'all') {
      pdfCover(doc, {
        title: projName,
        subtitle: 'Project Summary Report',
        reportType: 'PROJECT SUMMARY',
        meta: [
          `${titleCase(proj.status)} | ${proj.city || ''}, ${proj.region || ''}`,
          `Budget: ${fmtGHS(proj.total_budget)} | ${proj.total_units || 0} Units`,
        ],
      });

      // Project Details
      pdfSection(doc, 'Project Details');
      pdfKeyValueGrid(doc, [
        ['Project Name', projName],
        ['Status', titleCase(proj.status)],
        ['Project Type', titleCase(proj.project_type)],
        ['Location', `${proj.city || '—'}, ${proj.region || '—'}`],
        ['Address', proj.address_line1 || '—'],
        ['Land Size', proj.land_size_acres ? `${proj.land_size_acres} acres` : '—'],
        ['Total Buildings', String(proj.total_buildings || '—')],
        ['Total Floors', String(proj.total_floors || '—')],
        ['Planned Start', safeDate(proj.planned_start_date)],
        ['Planned End', safeDate(proj.planned_completion_date)],
        ['Actual Start', safeDate(proj.actual_start_date)],
        ['Est. Completion', safeDate(proj.estimated_completion_date)],
      ]);

      // Progress
      pdfSection(doc, 'Progress');
      pdfProgressBar(doc, 'Overall', proj.overall_progress || 0);
      pdfProgressBar(doc, 'Construction', proj.construction_progress || 0);
      pdfProgressBar(doc, 'Sales', proj.sales_progress || 0);

      // Financial KPIs
      pdfSection(doc, 'Financial Overview');
      pdfStatCards(doc, [
        { label: 'Total Budget', value: fmtGHS(proj.total_budget), color: C.info },
        { label: 'Total Spent', value: fmtGHS(proj.total_spent ?? sum.total_cost), color: C.heading },
        { label: 'Revenue', value: fmtGHS(proj.actual_revenue ?? sum.total_revenue), color: C.positive },
        { label: 'Gross Margin', value: fmtPct(sum.gross_margin), color: sum.gross_margin >= 0 ? C.positive : C.negative },
      ]);

      // Unit KPIs
      if (unitStats) {
        pdfSection(doc, 'Unit Summary');
        const u: any = unitStats;
        pdfStatCards(doc, [
          { label: 'Total Units', value: String(u.total_units ?? 0), color: C.info },
          { label: 'Available', value: String(u.by_status?.available ?? 0), color: C.positive },
          { label: 'Sold', value: String(u.by_status?.sold ?? 0), color: C.brand },
          { label: 'Under Contract', value: String(u.by_status?.under_contract ?? 0), color: C.warning },
        ]);
        pdfStatCards(doc, [
          { label: 'List Value', value: fmtGHS(u.total_list_value), color: C.heading },
          { label: 'Sold Value', value: fmtGHS(u.total_sold_value), color: C.positive },
          { label: 'Collected', value: fmtGHS(u.total_collected), color: C.info },
          { label: 'Avg/sqm', value: fmtGHS(u.avg_price_per_sqm), color: C.muted },
        ]);

        // By type
        if (u.by_type && Object.keys(u.by_type).length > 0) {
          pdfRichTable(doc,
            ['Unit Type', 'Count'],
            Object.entries(u.by_type).map(([k, v]) => [titleCase(k), String(v)]),
            [300, 190], { rightAlignFrom: 1 }
          );
        }
      }

      // Phases with progress
      if (phases.length > 0) {
        pdfSection(doc, 'Construction Phases');
        (phases as any[]).forEach(p => {
          pdfProgressBar(doc, (p.name || p.phase_name || `Phase ${p.phase_number}`).substring(0, 20), p.progress ?? 0);
        });
        doc.moveDown(0.5);
        pdfRichTable(doc,
          ['Phase', 'Status', 'Progress', 'Budget', 'Spent'],
          (phases as any[]).map(p => [
            (p.name || `Phase ${p.phase_number}`).substring(0, 20),
            titleCase(p.status),
            fmtPct(p.progress),
            fmtGHS(p.budget),
            fmtGHS(p.spent),
          ]),
          [130, 90, 70, 100, 100], { rightAlignFrom: 2 }
        );
      }

      // Construction Activity Summary
      pdfSection(doc, 'Construction Activity');
      const activityStats: { label: string; value: string; color?: string }[] = [];
      if (rfiStats) {
        const r: any = rfiStats;
        activityStats.push({ label: 'Total RFIs', value: String(r.total ?? 0), color: C.info });
        activityStats.push({ label: 'Open RFIs', value: String(r.by_status?.open ?? 0), color: r.by_status?.open > 0 ? C.warning : C.positive });
      }
      if (coStats) {
        const co: any = coStats;
        activityStats.push({ label: 'Change Orders', value: String(co.total ?? 0), color: C.info });
      }
      if (punchSummary) {
        const pl: any = punchSummary;
        activityStats.push({ label: 'Punch Items', value: String(pl.total_items ?? 0), color: C.info });
      }
      if (activityStats.length > 0) pdfStatCards(doc, activityStats.slice(0, 4));

      // Contractors
      const assigns = (assignments as any[]) || [];
      if (assigns.length > 0) {
        pdfSection(doc, 'Contractor Team');
        pdfRichTable(doc,
          ['Company', 'Trade', 'Contract Value', 'Billed', 'Progress'],
          assigns.slice(0, 15).map(a => [
            (a.contractor?.company_name || a.company_name || '—').substring(0, 22),
            titleCase(a.contractor?.trade || a.trade || '—'),
            fmtGHS(a.contract_value),
            fmtGHS(a.amount_billed),
            fmtPct(a.work_completed_percentage),
          ]),
          [120, 90, 90, 90, 70], { rightAlignFrom: 2 }
        );
      }
    }

    // ── Budget ──
    if (reportType === 'budget' || reportType === 'all') {
      if (reportType === 'all') doc.addPage();
      pdfCover(doc, {
        title: projName,
        subtitle: 'Budget & Financial Report',
        reportType: 'BUDGET REPORT',
        meta: [
          `Budget: ${fmtGHS(proj.total_budget)} | Spent: ${fmtGHS(proj.total_spent ?? sum.total_cost)}`,
        ],
      });

      pdfSection(doc, 'Budget Overview');
      pdfStatCards(doc, [
        { label: 'Total Budget', value: fmtGHS(proj.total_budget), color: C.info },
        { label: 'Total Spent', value: fmtGHS(proj.total_spent ?? sum.total_cost), color: C.heading },
        { label: 'Revenue', value: fmtGHS(sum.total_revenue), color: C.positive },
        { label: 'Margin', value: fmtPct(sum.gross_margin), color: sum.gross_margin >= 0 ? C.positive : C.negative },
      ]);

      // Variance info
      const budgetVar = (proj.total_spent ?? sum.total_cost ?? 0) - (proj.total_budget ?? 0);
      if (budgetVar > 0) {
        pdfInfoPanel(doc, `Project is over budget by ${fmtGHS(budgetVar)}. Immediate review recommended.`, 'danger');
      } else {
        pdfInfoPanel(doc, `Project is within budget. ${fmtGHS(Math.abs(budgetVar))} remaining.`, 'success');
      }

      // Category breakdown with visual bars
      if (budget.by_category.length > 0) {
        pdfSection(doc, 'Cost Breakdown by Category');
        doc.fontSize(7).fillColor(C.info).text('■ Budget', MARGIN + 105, doc.y, { continued: true });
        doc.fillColor(C.positive).text('   ■ Actual (under)', { continued: true });
        doc.fillColor(C.negative).text('   ■ Actual (over)');
        doc.moveDown(0.5);
        budget.by_category.forEach((c: any) => {
          pdfBudgetBar(doc, c.category, c.budget, c.actual);
        });
        doc.moveDown(0.5);
        pdfRichTable(doc,
          ['Category', 'Budgeted', 'Actual', 'Variance'],
          budget.by_category.map((c: any) => [
            titleCase(c.category), fmtGHS(c.budget), fmtGHS(c.actual), fmtGHS(c.actual - c.budget),
          ]),
          [150, 110, 110, 110], { rightAlignFrom: 1 }
        );
      }

      // Draw summary
      if (drawSummary) {
        const ds: any = drawSummary;
        pdfSection(doc, 'Draw Request Summary');
        pdfStatCards(doc, [
          { label: 'Total Draws', value: String(ds.total_draws ?? 0), color: C.info },
          { label: 'Total Drawn', value: fmtGHS(ds.total_drawn), color: C.heading },
          { label: 'Total Funded', value: fmtGHS(ds.total_funded), color: C.positive },
          { label: 'Retention Held', value: fmtGHS(ds.retention_held), color: C.warning },
        ]);

        if (ds.draw_history?.length > 0) {
          pdfRichTable(doc,
            ['Draw #', 'Amount', 'Status', 'Date'],
            ds.draw_history.map((d: any) => [
              String(d.draw_number ?? '—'),
              fmtGHS(d.amount),
              titleCase(d.status),
              safeDate(d.date),
            ]),
            [80, 140, 120, 150], { rightAlignFrom: 1 }
          );
        }
      }

      // Sales by month
      if (report.sales.by_month.length > 0) {
        pdfSection(doc, 'Monthly Sales');
        pdfRichTable(doc,
          ['Month', 'Units Sold', 'Revenue'],
          report.sales.by_month.map(m => [m.month, String(m.units), fmtGHS(m.value)]),
          [180, 100, 210], { rightAlignFrom: 1 }
        );
      }
    }

    // ── Issues / Risk ──
    if (reportType === 'issues' || reportType === 'all') {
      if (reportType === 'all') doc.addPage();
      pdfCover(doc, {
        title: projName,
        subtitle: 'Issues & Risk Report',
        reportType: 'RISK ANALYSIS',
        meta: [
          `Status: ${titleCase(proj.status)} | Progress: ${proj.overall_progress || 0}%`,
        ],
      });

      // Overall status
      pdfSection(doc, 'Project Health');
      const health: { label: string; value: string; color?: string }[] = [
        { label: 'Status', value: titleCase(proj.status), color: proj.status === 'on_hold' ? C.warning : C.positive },
        { label: 'Progress', value: fmtPct(proj.overall_progress), color: C.info },
      ];
      const budgetHealth = (proj.total_spent ?? sum.total_cost ?? 0) > (proj.total_budget ?? 0) ? 'OVER BUDGET' : 'ON TRACK';
      health.push({ label: 'Budget', value: budgetHealth, color: budgetHealth === 'OVER BUDGET' ? C.negative : C.positive });
      pdfStatCards(doc, health);

      // RFIs
      if (rfiStats) {
        const r: any = rfiStats;
        pdfSection(doc, 'Request for Information (RFIs)');
        pdfStatCards(doc, [
          { label: 'Total RFIs', value: String(r.total ?? 0), color: C.info },
          { label: 'Open', value: String(r.by_status?.open ?? 0), color: C.warning },
          { label: 'Overdue', value: String(r.overdue ?? 0), color: r.overdue > 0 ? C.negative : C.positive },
          { label: 'Avg Response', value: `${(r.avg_response_days ?? 0).toFixed(1)} days`, color: C.muted },
        ]);

        pdfRichTable(doc,
          ['Status', 'Count'],
          Object.entries(r.by_status || {}).filter(([_, v]) => (v as number) > 0).map(([k, v]) => [titleCase(k), String(v)]),
          [300, 190], { rightAlignFrom: 1 }
        );

        if (r.by_priority && Object.values(r.by_priority).some((v: any) => v > 0)) {
          pdfRichTable(doc,
            ['Priority', 'Count'],
            Object.entries(r.by_priority).filter(([_, v]) => (v as number) > 0).map(([k, v]) => [titleCase(k), String(v)]),
            [300, 190], { rightAlignFrom: 1 }
          );
        }
      }

      // Submittals
      if (submittalStats) {
        const st: any = submittalStats;
        pdfSection(doc, 'Submittals');
        pdfStatCards(doc, [
          { label: 'Total', value: String(st.total_submittals ?? 0), color: C.info },
          { label: 'Approved', value: String(st.approved_count ?? 0), color: C.positive },
          { label: 'Pending', value: String(st.pending_count ?? 0), color: C.warning },
          { label: 'Approval Rate', value: fmtPct(st.approval_rate), color: C.info },
        ]);
        if (st.overdue_count > 0) {
          pdfInfoPanel(doc, `${st.overdue_count} submittals are overdue. ${st.due_this_week || 0} due this week.`, 'warning');
        }
      }

      // Change Orders
      if (coStats) {
        const co: any = coStats;
        pdfSection(doc, 'Change Orders');
        pdfStatCards(doc, [
          { label: 'Total COs', value: String(co.total ?? 0), color: C.info },
          { label: 'Pending Approval', value: String(co.pending_approval ?? 0), color: C.warning },
          { label: 'Net Change', value: fmtGHS(co.net_change), color: (co.net_change ?? 0) > 0 ? C.negative : C.positive },
          { label: 'Schedule Impact', value: `${co.total_schedule_impact_days ?? 0} days`, color: (co.total_schedule_impact_days ?? 0) > 0 ? C.warning : C.positive },
        ]);

        if (co.total_additions || co.total_deductions) {
          pdfKeyValueGrid(doc, [
            ['Total Additions', fmtGHS(co.total_additions)],
            ['Total Deductions', fmtGHS(co.total_deductions)],
            ['Net Change', fmtGHS(co.net_change)],
            ['Avg Processing', `${(co.avg_processing_days ?? 0).toFixed(0)} days`],
          ]);
        }

        if (co.by_reason && Object.values(co.by_reason).some((v: any) => v > 0)) {
          pdfRichTable(doc,
            ['Reason', 'Count'],
            Object.entries(co.by_reason).filter(([_, v]) => (v as number) > 0).map(([k, v]) => [titleCase(k), String(v)]),
            [300, 190], { rightAlignFrom: 1 }
          );
        }
      }

      // Punch List
      if (punchSummary) {
        const pl: any = punchSummary;
        pdfSection(doc, 'Punch List');
        pdfStatCards(doc, [
          { label: 'Total Items', value: String(pl.total_items ?? 0), color: C.info },
          { label: 'Open', value: String(pl.open_items ?? 0), color: C.warning },
          { label: 'Completed', value: String(pl.completed_items ?? 0), color: C.positive },
          { label: 'Completion Rate', value: fmtPct(pl.completion_rate), color: C.info },
        ]);

        if (pl.by_category?.length > 0) {
          pdfRichTable(doc,
            ['Category', 'Count'],
            pl.by_category.map((c: any) => [titleCase(c.category), String(c.count)]),
            [300, 190], { rightAlignFrom: 1 }
          );
        }
        if (pl.by_priority?.length > 0) {
          pdfRichTable(doc,
            ['Priority', 'Count'],
            pl.by_priority.map((p: any) => [titleCase(p.priority), String(p.count)]),
            [300, 190], { rightAlignFrom: 1 }
          );
        }
      }

      // Sales Analysis
      if (report.sales.by_type.length > 0) {
        pdfSection(doc, 'Sales Analysis');
        pdfRichTable(doc,
          ['Unit Type', 'Sold Count'],
          report.sales.by_type.map(t => [titleCase(t.type || 'Unknown'), String(t.count)]),
          [300, 190], { rightAlignFrom: 1 }
        );
      }
    }

    PDF.addFooters(doc);
    doc.end();
  } catch (error) {
    next(error);
  }
});

// Add project to portfolio
router.post('/:projectId/add-to-portfolio', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/wizard/drafts', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.patch('/wizard/drafts/:draftId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/wizard/drafts/:draftId/validate-step', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/wizard/drafts/:draftId/complete-step', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/wizard/drafts/:draftId/cost-estimate', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/wizard/drafts/:draftId/submit', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.delete('/wizard/drafts/:draftId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/validate-gps', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/validate-location', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/reverse-geocode', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/with-location', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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

// ============================================================================
// COST ESTIMATOR MARKET DATA — single aggregate endpoint for the frontend
// Returns: FX rates, regional multipliers, base costs, material prices, labor rates
// ============================================================================
router.get('/cost-estimator/market-data', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. FX rates (real-time from fxFeedService via projectCostCurrencyService)
    const fxData = await projectCostCurrencyService.getAllExchangeRates();

    // FX rates are stored as  currency → GHS (e.g. USD → GHS = 16)
    // Frontend needs GHS → currency (e.g. GHS → USD = 1/16 = 0.0625)
    const fxRates: Record<string, number> = { GHS: 1 };
    for (const [currency, rateToGhs] of Object.entries(fxData.rates)) {
      if (currency === 'GHS') continue;
      fxRates[currency] = Math.round((1 / (rateToGhs as number)) * 1_000_000) / 1_000_000;
    }

    // 2. Regional multipliers (from constructionCostService DB)
    const regionalMultipliers = await constructionCostService.getAllRegionalMultipliers();

    // 3. Base costs per sqm for all property type + quality combos
    const propertyTypes = ['residential', 'commercial', 'industrial'] as const;
    const qualityLevels = ['basic', 'standard', 'premium', 'luxury'] as const;
    const baseCosts: Record<string, { cost_ghs: number; source: string; material_pct: number; labor_pct: number }> = {};

    for (const pt of propertyTypes) {
      for (const ql of qualityLevels) {
        const bc = await constructionCostService.getCalculatedBaseCost(pt, ql, 'greater_accra');
        if (bc && bc.cost_ghs > 0) {
          const total = bc.cost_ghs;
          baseCosts[`${pt}_${ql}`] = {
            cost_ghs: Math.round(total),
            source: bc.calculation_source || 'database',
            material_pct: total > 0 ? Math.round((bc.material_component_ghs / total) * 100) : 55,
            labor_pct: total > 0 ? Math.round((bc.labor_component_ghs / total) * 100) : 30,
          };
        }
      }
    }

    // 4. Material prices (latest for Greater Accra as reference)
    let materialPrices: Array<{ category: string; name: string; price_ghs: number; previous_price_ghs: number | null; price_change_percent: number | null; unit: string }> = [];
    try {
      const prices = await constructionCostService.getMaterialPrices({ region: 'greater_accra' });
      materialPrices = prices.map(p => ({
        category: p.material_category,
        name: p.material_name,
        price_ghs: parseFloat(p.price_ghs as any) || 0,
        previous_price_ghs: (p as any).previous_price_ghs != null ? parseFloat((p as any).previous_price_ghs) : null,
        price_change_percent: (p as any).price_change_percent != null ? parseFloat((p as any).price_change_percent) : null,
        unit: p.unit,
      }));
    } catch (e) {
      // No material prices available
    }

    // 5. Labor rates (latest for Greater Accra as reference)
    let laborRates: Array<{ category: string; skill_level: string; daily_rate_ghs: number; rate_change_percent: number | null }> = [];
    try {
      const rates = await constructionCostService.getLaborRates({ region: 'greater_accra' });
      laborRates = rates.map(r => ({
        category: r.labor_category,
        skill_level: r.skill_level,
        daily_rate_ghs: parseFloat(r.rate_ghs as any) || 0,
        rate_change_percent: (r as any).rate_change_percent != null ? parseFloat((r as any).rate_change_percent) : null,
      }));
    } catch (e) {
      // No labor rates available
    }

    // 6. Construction cost index (includes separate material & labor sub-indices)
    let constructionIndex: {
      value: number; base_value: number; period: string; source: string;
      material_index: number; labor_index: number;
      change_yoy: number | null;
    } | null = null;
    try {
      const idx = await constructionCostService.getLatestConstructionIndex();
      if (idx) {
        constructionIndex = {
          value: idx.index_value,
          base_value: idx.base_value,
          period: idx.period_end?.toISOString?.() || new Date().toISOString(),
          source: idx.source,
          material_index: (idx as any).material_index ?? idx.index_value,
          labor_index: (idx as any).labor_index ?? idx.index_value,
          change_yoy: (idx as any).change_year_on_year ?? null,
        };
      }
    } catch (e) {
      // No index available
    }

    res.json({
      fx_rates: fxRates,
      fx_sources: fxData.sources,
      fx_timestamp: fxData.timestamp,
      regional_multipliers: regionalMultipliers,
      base_costs: baseCosts,
      material_prices: materialPrices,
      labor_rates: laborRates,
      construction_index: constructionIndex,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});


// Convert currency
router.post('/convert-currency', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/estimate-costs', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { 
      project_type, 
      total_sqm,
      sqm, // Accept sqm as alias for total_sqm
      total_floors,
      region,
      finish_level,
      include_land,
      land_cost_per_sqm,
      display_currency 
    } = req.body;
    
    const effectiveSqm = total_sqm || sqm;
    
    const estimate = await projectCostCurrencyService.generateCostEstimate(
      {
        project_type,
        total_sqm: effectiveSqm,
        total_floors: total_floors || 1,
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
router.post('/:projectId/capture-exchange-rates', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:projectId/permits', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.patch('/:projectId/permits/:permitId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/dashboard/alerts/:id/acknowledge', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    await dashboardAnalyticsService.acknowledgeAlert(req.params.id, userId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Resolve alert
router.post('/dashboard/alerts/:id/resolve', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    await dashboardAnalyticsService.resolveAlert(req.params.id, userId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Dismiss alert
router.post('/dashboard/alerts/:id/dismiss', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await dashboardAnalyticsService.dismissAlert(req.params.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Snooze alert
router.post('/dashboard/alerts/:id/snooze', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:id/milestones', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.put('/:projectId/milestones/:milestoneId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.delete('/:projectId/milestones/:milestoneId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:projectId/milestones/:milestoneId/complete', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:projectId/milestones/:milestoneId/reschedule', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:projectId/milestones/:milestoneId/subphases', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.put('/:projectId/milestones/:milestoneId/subphases/:subphaseId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.delete('/:projectId/milestones/:milestoneId/subphases/:subphaseId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:projectId/milestones/:milestoneId/subphases/reorder', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:id/milestones/apply-ghana-templates', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:id/gantt/calculate-critical-path', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const result = await ganttService.calculateCriticalPath(req.params.id, orgId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Update phase dates
router.put('/:projectId/gantt/phases/:phaseId/dates', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.put('/:id/gantt/dependencies', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:id/baselines', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:projectId/baselines/:baselineId/set-active', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await ganttService.setActiveBaseline(req.params.baselineId, req.params.projectId, orgId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Delete baseline
router.delete('/:projectId/baselines/:baselineId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:id/permits', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.put('/:projectId/permits/:permitId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.delete('/:projectId/permits/:permitId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:projectId/permits/:permitId/inspections', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.put('/:projectId/inspections/:inspectionId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.delete('/:projectId/inspections/:inspectionId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:id/compliance/apply-template', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:id/folders', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.put('/:projectId/folders/:folderId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.delete('/:projectId/folders/:folderId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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

// Create a document (supports both JSON and multipart/form-data file uploads)
router.post('/:id/documents', requirePMWrite, documentUpload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const file = (req as any).file as Express.Multer.File | undefined;

    let fileUrl = req.body.file_url || '';
    let fileKey: string | undefined;
    let fileSize: number | undefined;
    let mimeType: string | undefined;
    let originalFilename: string | undefined;

    // If a file was uploaded via FormData, store it in MinIO
    if (file) {
      const ext = file.originalname.split('.').pop() || 'bin';
      const key = `projects/${req.params.id}/documents/${uuidv4()}.${ext}`;
      const bucket = buckets.documents || 'propmetrik-documents';

      await uploadFile(bucket, key, file.buffer, file.mimetype);
      fileUrl = await getPresignedDownloadUrl(bucket, key);
      fileKey = `${bucket}/${key}`;
      fileSize = file.size;
      mimeType = file.mimetype;
      originalFilename = file.originalname;
    }

    const document = await projectDocumentService.createDocument({
      ...req.body,
      project_id: req.params.id,
      organization_id: orgId,
      uploaded_by: userId,
      file_url: fileUrl,
      file_key: fileKey || req.body.file_key,
      file_size: fileSize || req.body.file_size,
      mime_type: mimeType || req.body.mime_type,
      original_filename: originalFilename || req.body.original_filename,
      document_type: req.body.document_type || req.body.category,
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

// Download a document (generates a fresh presigned URL)
router.get('/:projectId/documents/:documentId/download', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const document = await projectDocumentService.getDocumentById(req.params.documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (!document.file_key) {
      return res.status(400).json({ error: 'No file associated with this document' });
    }

    // file_key is stored as "bucket/key"
    const slashIdx = document.file_key.indexOf('/');
    const bucket = document.file_key.substring(0, slashIdx);
    const key = document.file_key.substring(slashIdx + 1);

    const downloadUrl = await getPresignedDownloadUrl(bucket, key, 3600);
    res.json({ download_url: downloadUrl, filename: document.original_filename || document.name });
  } catch (error) {
    next(error);
  }
});

// Update a document
router.put('/:projectId/documents/:documentId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.delete('/:projectId/documents/:documentId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:projectId/documents/:documentId/archive', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:projectId/documents/:documentId/restore', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:projectId/documents/:documentId/versions', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:projectId/documents/:documentId/versions/:versionId/revert', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:projectId/documents/:documentId/share', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.delete('/:projectId/shares/:shareId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:id/compliance/report', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
       WHERE entity_id = $1 AND entity_type = 'organization' AND service_type = 'project_management' AND is_active = TRUE
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
router.post('/payments/register-account', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = getOrgId(req);
    const { bankCode, accountNumber, businessName, contactEmail, contactPhone } = req.body;

    if (!bankCode || !accountNumber || !businessName) {
      return res.status(400).json({ error: 'bankCode, accountNumber, and businessName are required' });
    }

    const { paystackService } = await import('../services/property-management/payment/paystackService');

    const result = await paystackService.registerPropertyManagerAccount(
      organizationId, bankCode, accountNumber, businessName, contactEmail, contactPhone, 'project_management'
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
router.post('/payments/resolve-account', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
       WHERE entity_id = $1 AND entity_type = 'organization' AND service_type = 'project_management' AND is_active = TRUE
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
router.post('/payments/crypto-wallet', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = getOrgId(req);
    const { walletAddress } = req.body;

    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({ error: 'Invalid wallet address. Must be a valid Polygon address (0x + 40 hex chars)' });
    }

    const { pool } = await import('../database');
    const upsertResult = await pool.query(`
      INSERT INTO payment_accounts (id, entity_type, entity_id, service_type, crypto_wallet_address, crypto_wallet_registered_at, updated_at, is_active)
      VALUES (gen_random_uuid(), 'organization', $1, 'project_management', $2, NOW(), NOW(), TRUE)
      ON CONFLICT (entity_id, entity_type, service_type) DO UPDATE SET
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
        await cryptoPaymentService.registerRecipientWallet('organization', organizationId, walletAddress, 'project_management');
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
router.post('/payments/initiate', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/payments/crypto/initiate', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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

// ============================================================================
// COST ESTIMATES — CRUD for persisted historical estimates
// ============================================================================

/**
 * GET /cost-estimates — list all saved estimates for the org
 * Query params: ?status=active&sort=created_at&order=desc&limit=50&offset=0
 */
router.get('/cost-estimates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const status = (req.query.status as string) || 'active';
    const sort = (req.query.sort as string) || 'created_at';
    const order = (req.query.order as string)?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    // Whitelist sortable columns
    const sortCol = ['created_at', 'total_cost', 'name', 'gfa_sqm', 'project_type'].includes(sort) ? sort : 'created_at';

    const { rows } = await require('../database').pool.query(`
      SELECT id, name, project_type, region, gfa_sqm, floors, spec_tier,
             currency, total_cost, hard_cost, soft_cost, contingency, cost_per_sqm,
             status, notes, created_by, created_at, updated_at
      FROM project_cost_estimates
      WHERE organization_id = $1 AND status = $2
      ORDER BY ${sortCol} ${order}
      LIMIT $3 OFFSET $4
    `, [orgId, status, limit, offset]);

    const { rows: countRows } = await require('../database').pool.query(
      `SELECT COUNT(*) as total FROM project_cost_estimates WHERE organization_id = $1 AND status = $2`,
      [orgId, status]
    );

    // Aggregate stats
    const { rows: statsRows } = await require('../database').pool.query(`
      SELECT
        COUNT(*) as total_estimates,
        COALESCE(SUM(total_cost), 0) as total_value,
        COALESCE(AVG(total_cost), 0) as avg_cost,
        COALESCE(AVG(cost_per_sqm), 0) as avg_cost_per_sqm,
        COALESCE(AVG(gfa_sqm), 0) as avg_gfa
      FROM project_cost_estimates
      WHERE organization_id = $1 AND status = 'active'
    `, [orgId]);

    res.json({
      success: true,
      estimates: rows,
      total: parseInt(countRows[0]?.total || '0'),
      stats: statsRows[0] || {},
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /cost-estimates/:id — get a single estimate with full snapshot
 */
router.get('/cost-estimates/:estimateId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { estimateId } = req.params;

    const { rows } = await require('../database').pool.query(
      `SELECT * FROM project_cost_estimates WHERE id = $1 AND organization_id = $2`,
      [estimateId, orgId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Estimate not found' });
    }

    res.json({ success: true, estimate: rows[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /cost-estimates — save a new estimate
 */
router.post('/cost-estimates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const {
      name, projectType, region, gfaSqm, floors, specTier, currency,
      totalCost, hardCost, softCost, contingency, costPerSqm,
      snapshot, notes
    } = req.body;

    if (!name || !projectType || !region || !totalCost) {
      return res.status(400).json({ success: false, error: 'Missing required fields: name, projectType, region, totalCost' });
    }

    const { rows } = await require('../database').pool.query(`
      INSERT INTO project_cost_estimates
        (organization_id, created_by, name, project_type, region, gfa_sqm, floors,
         spec_tier, currency, total_cost, hard_cost, soft_cost, contingency, cost_per_sqm,
         snapshot, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `, [
      orgId, userId, name, projectType, region,
      gfaSqm || 0, floors || 1, specTier || 'standard', currency || 'GHS',
      totalCost, hardCost || 0, softCost || 0, contingency || 0, costPerSqm || 0,
      JSON.stringify(snapshot || {}), notes || null
    ]);

    res.status(201).json({ success: true, estimate: rows[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /cost-estimates/:id — update name, notes, or status
 */
router.patch('/cost-estimates/:estimateId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { estimateId } = req.params;
    const { name, notes, status } = req.body;

    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 3;

    if (name !== undefined) { sets.push(`name = $${idx++}`); vals.push(name); }
    if (notes !== undefined) { sets.push(`notes = $${idx++}`); vals.push(notes); }
    if (status !== undefined) { sets.push(`status = $${idx++}`); vals.push(status); }
    sets.push(`updated_at = NOW()`);

    if (sets.length <= 1) {
      return res.status(400).json({ success: false, error: 'Nothing to update' });
    }

    const { rows } = await require('../database').pool.query(`
      UPDATE project_cost_estimates
      SET ${sets.join(', ')}
      WHERE id = $1 AND organization_id = $2
      RETURNING *
    `, [estimateId, orgId, ...vals]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Estimate not found' });
    }

    res.json({ success: true, estimate: rows[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /cost-estimates/:id — soft-delete (sets status='deleted')
 */
router.delete('/cost-estimates/:estimateId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { estimateId } = req.params;

    const { rowCount } = await require('../database').pool.query(`
      UPDATE project_cost_estimates SET status = 'deleted', updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND status != 'deleted'
    `, [estimateId, orgId]);

    if (rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Estimate not found' });
    }

    res.json({ success: true, message: 'Estimate deleted' });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// CONVERT ESTIMATE → PROJECT
// ============================================================================

/**
 * POST /cost-estimates/:estimateId/convert-to-project
 *
 * Creates a development project pre-filled with data from the cost estimate.
 * Auto-provisions phases from template and cost codes. Links the estimate
 * to the new project via project_id FK.
 *
 * Body (optional overrides):
 *   startDate        — planned start date (default: today)
 *   endDate          — planned end date (auto-calculated if omitted)
 *   landTenure       — land_tenure_type (default: leasehold)
 *   city             — city / locality
 *   addressLine1     — street address
 *   ghanaPostGps     — Ghana Post digital address
 *   description      — project description
 */
router.post('/cost-estimates/:estimateId/convert-to-project', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { estimateId } = req.params;
    const { pool: dbPool } = await import('../database');

    // 1) Fetch the estimate
    const { rows: estRows } = await dbPool.query(
      `SELECT * FROM project_cost_estimates
       WHERE id = $1 AND organization_id = $2 AND status = 'active'`,
      [estimateId, orgId]
    );

    if (estRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Estimate not found or already deleted' });
    }

    const est = estRows[0];

    // Guard: already converted?
    if (est.project_id) {
      return res.status(409).json({
        success: false,
        error: 'Estimate already converted to a project',
        projectId: est.project_id,
      });
    }

    // 2) Map estimate project_type to development_projects project_type
    const TYPE_MAP: Record<string, string> = {
      residential_single: 'residential_single',
      residential_multi: 'residential_multi',
      commercial_office: 'commercial',
      retail: 'commercial',
      mixed_use: 'mixed_use',
      industrial: 'industrial',
    };
    const projectType = TYPE_MAP[est.project_type] || 'residential_single';

    // 3) Extract optional overrides from body
    const {
      startDate,
      endDate,
      landTenure,
      city,
      addressLine1,
      ghanaPostGps,
      description,
    } = req.body;

    // Parse snapshot for extra info (client info, etc.)
    const snapshot = est.snapshot || {};
    const clientInfo = snapshot.clientInfo || {};

    // 4) Get phase template durations for auto-calculating end date
    const phases = getPhaseTemplateForType(projectType);
    const totalDurationDays = phases.reduce((sum: number, p: any) => sum + (p.duration_days || 30), 0);
    const plannedStart = startDate ? new Date(startDate) : new Date();
    const plannedEnd = endDate
      ? new Date(endDate)
      : new Date(plannedStart.getTime() + totalDurationDays * 86400000);

    // 5) Create the project via projectService.create()
    const project = await projectService.create({
      organization_id: orgId,
      name: est.name,
      description: description || `Converted from cost estimate: ${est.name}`,
      project_type: projectType as any,
      region: est.region,
      city: city || undefined,
      address_line1: addressLine1 || undefined,
      ghana_post_gps: ghanaPostGps || undefined,
      country: 'Ghana',
      total_floors: est.floors,
      total_budget: Number(est.total_cost),
      land_size_sqm: snapshot.includeLand && snapshot.landPricePerSqm
        ? Number(est.gfa_sqm)
        : undefined,
      planned_start_date: plannedStart,
      planned_completion_date: plannedEnd,
      developer_name: clientInfo.clientName || clientInfo.clientCompany || clientInfo.name || undefined,
      developer_contact: clientInfo.clientPhone || clientInfo.phone || undefined,
      developer_email: clientInfo.clientEmail || clientInfo.email || undefined,
      created_by: userId,
    });

    // 6) Create phases from template with proper date chaining
    //    and auto-create payment milestones for each phase
    let phaseStart = new Date(plannedStart);
    const totalBudget = Number(est.total_cost);

    for (const tmpl of phases) {
      const phaseEnd = new Date(phaseStart);
      phaseEnd.setDate(phaseEnd.getDate() + (tmpl.duration_days || 30));

      const phaseResult = await dbPool.query(
        `INSERT INTO project_phases (
          id, project_id, organization_id,
          phase_number, name, weight, duration_days,
          planned_start_date, planned_end_date,
          color, created_by
        ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id`,
        [
          project.id, orgId,
          tmpl.phase_number, tmpl.name, tmpl.weight, tmpl.duration_days,
          phaseStart, phaseEnd,
          tmpl.color || '#3B82F6', userId,
        ]
      );

      // Create a payment milestone for this phase
      const phaseId = phaseResult.rows[0].id;
      const milestoneAmount = (totalBudget * (tmpl.weight || 0)) / 100;

      await dbPool.query(
        `INSERT INTO payment_milestones
          (project_id, organization_id, phase_id, name, description,
           payment_percentage, payment_amount, currency, scheduled_date,
           trigger_condition, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          project.id, orgId, phaseId,
          `${tmpl.name} — Payment Milestone`,
          `Payment for ${tmpl.name} phase (${tmpl.weight}% of total budget)`,
          tmpl.weight,
          milestoneAmount,
          est.currency || 'GHS',
          phaseEnd,
          `Completion of ${tmpl.name} phase`,
          'scheduled',
          userId,
        ]
      );

      phaseStart = new Date(phaseEnd);
      phaseStart.setDate(phaseStart.getDate() + 1);
    }

    // 7) Create cost codes from template
    await projectCostService.createFromTemplate(project.id, orgId, userId);

    // 8) Populate cost-code budgets from estimate snapshot categories
    if (snapshot.categories && Array.isArray(snapshot.categories)) {
      // Map estimate category IDs → CSI cost codes (matches CostEstimator.tsx CATEGORY_DEFINITIONS)
      const CATEGORY_CODE_MAP: Record<string, string> = {
        // By category ID (primary, most reliable)
        'site_acquisition': '40-000',                     // Land Acquisition
        'site_prep': '02-000',                            // Site Preparation
        'foundation': '03-000',                           // Concrete & Foundation
        'structural': '04-000',                           // Masonry (structural frame)
        'exterior': '07-000',                             // Roofing (exterior envelope)
        'mep': '16-000',                                  // Electrical (MEP combined)
        'interior': '09-000',                             // Interior Finishes
        'ffe': '10-000',                                  // Specialties (FF&E)
        'external_works': '32-000',                       // Exterior Improvements
        'prelims': '01-000',                              // General Requirements
        'labor': '01-000',                                // General Requirements (labor)
        // By category name (fallback for display names)
        'Site Acquisition & Due Diligence': '40-000',
        'Site Preparation & Demolition': '02-000',
        'Foundation & Substructure': '03-000',
        'Structural Frame': '04-000',
        'Exterior Envelope (Roof, Cladding, Windows, Doors)': '07-000',
        'Mechanical, Electrical & Plumbing (MEP)': '16-000',
        'Interior Finishes': '09-000',
        'Fittings, Fixtures & Equipment (FF&E)': '10-000',
        'External Works & Landscaping': '32-000',
        'Preliminaries & Site Overheads': '01-000',
        'Labor & Workforce': '01-000',
      };

      for (const cat of snapshot.categories) {
        // Look up by id first, then by name
        const code = CATEGORY_CODE_MAP[cat.id] || CATEGORY_CODE_MAP[cat.name] || CATEGORY_CODE_MAP[cat.category];
        const amount = Number(cat.subtotal || cat.total || 0);
        if (code && amount > 0) {
          await dbPool.query(
            `UPDATE project_costs
             SET original_budget = original_budget + $1, updated_at = NOW()
             WHERE project_id = $2 AND organization_id = $3 AND cost_code = $4`,
            [amount, project.id, orgId, code]
          );
        }
      }

      // Also populate professional fees & contingency into their cost codes
      const softCostMap: Record<string, string> = {
        'Professional Fees': '50-000',
        'Contingency': '99-000',
        'Financing Costs': '60-000',
      };
      // Soft costs from snapshot (fees total, contingency total)
      if (snapshot.fees && Array.isArray(snapshot.fees)) {
        const feesTotal = snapshot.fees.reduce((s: number, f: any) => s + (Number(f.amount || 0)), 0);
        if (feesTotal > 0) {
          await dbPool.query(
            `UPDATE project_costs SET original_budget = original_budget + $1, updated_at = NOW()
             WHERE project_id = $2 AND organization_id = $3 AND cost_code = '50-000'`,
            [feesTotal, project.id, orgId]
          );
        }
      }
      if (snapshot.contingencies && Array.isArray(snapshot.contingencies)) {
        const contTotal = snapshot.contingencies.reduce((s: number, c: any) => s + (Number(c.amount || 0)), 0);
        if (contTotal > 0) {
          await dbPool.query(
            `UPDATE project_costs SET original_budget = original_budget + $1, updated_at = NOW()
             WHERE project_id = $2 AND organization_id = $3 AND cost_code = '99-000'`,
            [contTotal, project.id, orgId]
          );
        }
      }
    }

    // 9) Link estimate → project
    await dbPool.query(
      `UPDATE project_cost_estimates
       SET project_id = $1, updated_at = NOW()
       WHERE id = $2 AND organization_id = $3`,
      [project.id, estimateId, orgId]
    );

    res.status(201).json({
      success: true,
      project: {
        id: project.id,
        name: project.name,
        project_number: (project as any).project_number,
        project_type: project.project_type,
        status: project.status,
        total_budget: project.total_budget,
        planned_start_date: project.planned_start_date,
        planned_completion_date: project.planned_completion_date,
      },
      estimateId,
      message: `Project "${project.name}" created successfully from estimate`,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
