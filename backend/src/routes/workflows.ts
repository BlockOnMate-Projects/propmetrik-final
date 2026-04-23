/**
 * Workflow Automation API Routes
 * Phase 5.9: Workflow Automation Engine
 * 
 * Endpoints:
 * - GET /workflows - List organization workflows
 * - POST /workflows - Create workflow
 * - GET /workflows/:id - Get workflow details
 * - PUT /workflows/:id - Update workflow
 * - DELETE /workflows/:id - Delete workflow
 * - POST /workflows/:id/activate - Activate workflow
 * - POST /workflows/:id/deactivate - Deactivate workflow
 * - POST /workflows/:id/trigger - Manual trigger
 * - GET /workflows/:id/executions - Execution history
 * - GET /workflows/templates - Get workflow templates
 * - POST /workflows/from-template - Create from template
 * - GET /workflows/stats - Workflow statistics
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireOrganization, requireRoles } from '../middleware/auth';
import { requirePMWrite } from '../middleware/pmAuth';
import { body, param, query, validationResult } from 'express-validator';
import { logger } from '../utils/logger';
import workflowService, { TriggerEvent, ExecutionContext, ExecutionStatus } from '../../shared-services/workflow/workflowService';
import workflowExecutionEngine from '../../shared-services/workflow/workflowExecutionEngine';

const router = Router();

// Helper for async route handlers
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// Helper to validate request
const validateRequest = (req: Request, res: Response): boolean => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: errors.array()
      }
    });
    return false;
  }
  return true;
};

// =====================================================
// LIST WORKFLOWS
// =====================================================

router.get(
  '/',
  authenticate,
  requireOrganization(),
  [
    query('status').optional().isIn(['active', 'inactive', 'all']),
    query('trigger_type').optional().isString(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
  ],
  asyncHandler(async (req: Request, res: Response) => {
    if (!validateRequest(req, res)) return;
    
    const organizationId = (req as any).user.organization_id || (req as any).user.organizationId;
    const { status, trigger_type, page = 1, limit = 20 } = req.query;

    // Convert status to isActive boolean
    let isActive: boolean | undefined;
    if (status === 'active') isActive = true;
    else if (status === 'inactive') isActive = false;
    // 'all' or undefined = no filter

    const result = await workflowService.getByOrganization(organizationId, {
      isActive,
      triggerType: trigger_type as any,
      page: Number(page),
      limit: Number(limit)
    });

    res.json({
      success: true,
      data: result.data,
      meta: {
        total: result.total,
        page: Number(page),
        limit: Number(limit),
        total_pages: Math.ceil(result.total / Number(limit))
      }
    });
  })
);

// =====================================================
// CREATE WORKFLOW
// =====================================================

router.post(
  '/',
  authenticate,
  requireOrganization(),
  requireRoles('admin', 'manager', 'super_admin'),
  requirePMWrite,
  [
    body('name').isString().trim().isLength({ min: 1, max: 255 }),
    body('description').optional().isString(),
    body('trigger_type').isString().isIn([
      'deal_stage_changed', 'deal_created', 'deal_won', 'deal_lost',
      'contact_created', 'contact_updated', 'activity_logged',
      'task_completed', 'task_overdue', 'document_signed',
      'property_created', 'time_based', 'manual', 'webhook'
    ]),
    body('trigger_config').optional().isObject(),
    body('steps').optional().isArray(),
    body('is_active').optional().isBoolean()
  ],
  asyncHandler(async (req: Request, res: Response) => {
    if (!validateRequest(req, res)) return;
    
    const organizationId = (req as any).user.organization_id || (req as any).user.organizationId;
    const userId = (req as any).user.id;

    const workflow = await workflowService.create({
      ...req.body,
      organization_id: organizationId,
      created_by: userId
    });

    logger.info({ workflowId: workflow.id, userId }, 'Workflow created');

    res.status(201).json({
      success: true,
      data: workflow
    });
  })
);

// =====================================================
// GET WORKFLOW TEMPLATES
// =====================================================

router.get(
  '/templates',
  authenticate,
  requireOrganization(),
  [
    query('category').optional().isString(),
    query('is_featured').optional().isBoolean()
  ],
  asyncHandler(async (req: Request, res: Response) => {
    if (!validateRequest(req, res)) return;
    
    const { category, is_featured } = req.query;

    const templates = await workflowService.getTemplates({
      category: category as string,
      isFeatured: is_featured === 'true' ? true : undefined
    });

    res.json({
      success: true,
      data: templates
    });
  })
);

// =====================================================
// CREATE FROM TEMPLATE
// =====================================================

router.post(
  '/from-template',
  authenticate,
  requireOrganization(),
  requireRoles('admin', 'manager', 'super_admin'),
  requirePMWrite,
  [
    body('template_id').isUUID(),
    body('name').optional().isString().trim()
  ],
  asyncHandler(async (req: Request, res: Response) => {
    if (!validateRequest(req, res)) return;
    
    const organizationId = (req as any).user.organization_id || (req as any).user.organizationId;
    const userId = (req as any).user.id;
    const { template_id, name } = req.body;

    const workflow = await workflowService.createFromTemplate(
      template_id,
      organizationId,
      userId,
      name
    );

    logger.info({ workflowId: workflow.id, templateId: template_id, userId }, 'Workflow created from template');

    res.status(201).json({
      success: true,
      data: workflow
    });
  })
);

// =====================================================
// GET WORKFLOW STATISTICS
// =====================================================

router.get(
  '/stats',
  authenticate,
  requireOrganization(),
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = (req as any).user.organization_id || (req as any).user.organizationId;

    const stats = await workflowService.getWorkflowStats(organizationId);

    res.json({
      success: true,
      data: stats
    });
  })
);

// =====================================================
// GET WORKFLOW BY ID
// =====================================================

router.get(
  '/:id',
  authenticate,
  requireOrganization(),
  [
    param('id').isUUID()
  ],
  asyncHandler(async (req: Request, res: Response) => {
    if (!validateRequest(req, res)) return;
    
    const { id } = req.params;
    const organizationId = (req as any).user.organization_id || (req as any).user.organizationId;

    const workflow = await workflowService.getById(id);

    if (!workflow || workflow.organization_id !== organizationId) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    // Load steps
    const steps = await workflowService.getSteps(id);
    workflow.steps = steps;

    res.json({
      success: true,
      data: workflow
    });
  })
);

// =====================================================
// UPDATE WORKFLOW
// =====================================================

router.put(
  '/:id',
  authenticate,
  requireOrganization(),
  requireRoles('admin', 'manager', 'super_admin'),
  requirePMWrite,
  [
    param('id').isUUID(),
    body('name').optional().isString().trim().isLength({ min: 1, max: 255 }),
    body('description').optional().isString(),
    body('trigger_type').optional().isString(),
    body('trigger_config').optional().isObject(),
    body('steps').optional().isArray(),
    body('is_active').optional().isBoolean()
  ],
  asyncHandler(async (req: Request, res: Response) => {
    if (!validateRequest(req, res)) return;
    
    const { id } = req.params;
    const organizationId = (req as any).user.organization_id || (req as any).user.organizationId;
    const userId = (req as any).user.id;

    const existing = await workflowService.getById(id);
    if (!existing || existing.organization_id !== organizationId) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    // Update workflow
    const { steps, ...workflowData } = req.body;
    const workflow = await workflowService.update(id, workflowData);

    // Update steps if provided
    if (steps) {
      await workflowService.updateSteps(id, steps);
      workflow!.steps = await workflowService.getSteps(id);
    }

    logger.info({ workflowId: id, userId }, 'Workflow updated');

    res.json({
      success: true,
      data: workflow
    });
  })
);

// =====================================================
// DELETE WORKFLOW
// =====================================================

router.delete(
  '/:id',
  authenticate,
  requireOrganization(),
  requireRoles('admin', 'super_admin'),
  requirePMWrite,
  [
    param('id').isUUID()
  ],
  asyncHandler(async (req: Request, res: Response) => {
    if (!validateRequest(req, res)) return;
    
    const { id } = req.params;
    const organizationId = (req as any).user.organization_id || (req as any).user.organizationId;
    const userId = (req as any).user.id;

    const existing = await workflowService.getById(id);
    if (!existing || existing.organization_id !== organizationId) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    await workflowService.delete(id);

    logger.info({ workflowId: id, userId }, 'Workflow deleted');

    res.json({
      success: true,
      message: 'Workflow deleted successfully'
    });
  })
);

// =====================================================
// ACTIVATE WORKFLOW
// =====================================================

router.post(
  '/:id/activate',
  authenticate,
  requireOrganization(),
  requireRoles('admin', 'manager', 'super_admin'),
  requirePMWrite,
  [
    param('id').isUUID()
  ],
  asyncHandler(async (req: Request, res: Response) => {
    if (!validateRequest(req, res)) return;
    
    const { id } = req.params;
    const organizationId = (req as any).user.organization_id || (req as any).user.organizationId;
    const userId = (req as any).user.id;

    const existing = await workflowService.getById(id);
    if (!existing || existing.organization_id !== organizationId) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    const workflow = await workflowService.activate(id);

    logger.info({ workflowId: id, userId }, 'Workflow activated');

    res.json({
      success: true,
      data: workflow
    });
  })
);

// =====================================================
// DEACTIVATE WORKFLOW
// =====================================================

router.post(
  '/:id/deactivate',
  authenticate,
  requireOrganization(),
  requireRoles('admin', 'manager', 'super_admin'),
  requirePMWrite,
  [
    param('id').isUUID()
  ],
  asyncHandler(async (req: Request, res: Response) => {
    if (!validateRequest(req, res)) return;
    
    const { id } = req.params;
    const organizationId = (req as any).user.organization_id || (req as any).user.organizationId;
    const userId = (req as any).user.id;

    const existing = await workflowService.getById(id);
    if (!existing || existing.organization_id !== organizationId) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    const workflow = await workflowService.deactivate(id);

    logger.info({ workflowId: id, userId }, 'Workflow deactivated');

    res.json({
      success: true,
      data: workflow
    });
  })
);

// =====================================================
// MANUAL TRIGGER
// =====================================================

router.post(
  '/:id/trigger',
  authenticate,
  requireOrganization(),
  requireRoles('admin', 'manager', 'super_admin'),
  requirePMWrite,
  [
    param('id').isUUID(),
    body('entity_type').isString().isIn(['deal', 'contact', 'property']),
    body('entity_id').isUUID(),
    body('data').optional().isObject()
  ],
  asyncHandler(async (req: Request, res: Response) => {
    if (!validateRequest(req, res)) return;
    
    const { id } = req.params;
    const organizationId = (req as any).user.organization_id || (req as any).user.organizationId;
    const userId = (req as any).user.id;
    const { entity_type, entity_id, data } = req.body;

    const workflow = await workflowService.getById(id);
    if (!workflow || workflow.organization_id !== organizationId) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    if (!workflow.is_active) {
      return res.status(400).json({
        success: false,
        error: 'Workflow is not active'
      });
    }

    // Load steps
    workflow.steps = await workflowService.getSteps(id);

    // Create trigger event
    const event: TriggerEvent = {
      type: 'manual',
      entity_type,
      entity_id,
      organization_id: organizationId,
      triggered_by: userId,
      data: data || {}
    };

    // Execute workflow
    const execution = await workflowExecutionEngine.executeWorkflow(workflow, event);

    logger.info({ workflowId: id, executionId: execution.id, userId }, 'Workflow manually triggered');

    res.json({
      success: true,
      data: execution
    });
  })
);

// =====================================================
// DRY RUN (TEST)
// =====================================================

router.post(
  '/:id/dry-run',
  authenticate,
  requireOrganization(),
  requireRoles('admin', 'manager', 'super_admin'),
  requirePMWrite,
  [
    param('id').isUUID(),
    body('context').isObject()
  ],
  asyncHandler(async (req: Request, res: Response) => {
    if (!validateRequest(req, res)) return;
    
    const { id } = req.params;
    const organizationId = (req as any).user.organization_id || (req as any).user.organizationId;
    const { context } = req.body;

    const workflow = await workflowService.getById(id);
    if (!workflow || workflow.organization_id !== organizationId) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    // Load steps
    workflow.steps = await workflowService.getSteps(id);

    // Execute dry run
    const result = await workflowExecutionEngine.dryRun(workflow, context as ExecutionContext);

    res.json({
      success: true,
      data: result
    });
  })
);

// =====================================================
// GET EXECUTION HISTORY
// =====================================================

router.get(
  '/:id/executions',
  authenticate,
  requireOrganization(),
  [
    param('id').isUUID(),
    query('status').optional().isIn(['pending', 'running', 'completed', 'failed', 'cancelled', 'waiting']),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
  ],
  asyncHandler(async (req: Request, res: Response) => {
    if (!validateRequest(req, res)) return;
    
    const { id } = req.params;
    const organizationId = (req as any).user.organization_id || (req as any).user.organizationId;
    const { status, page = 1, limit = 20 } = req.query;

    const workflow = await workflowService.getById(id);
    if (!workflow || workflow.organization_id !== organizationId) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    const executions = await workflowService.getExecutionHistory(id, {
      status: status as ExecutionStatus | undefined,
      limit: Number(limit),
      page: Number(page)
    });

    res.json({
      success: true,
      data: executions,
      meta: {
        page: Number(page),
        limit: Number(limit)
      }
    });
  })
);

// =====================================================
// GET EXECUTION DETAILS
// =====================================================

router.get(
  '/executions/:executionId',
  authenticate,
  requireOrganization(),
  [
    param('executionId').isUUID()
  ],
  asyncHandler(async (req: Request, res: Response) => {
    if (!validateRequest(req, res)) return;
    
    const { executionId } = req.params;
    const organizationId = (req as any).user.organization_id || (req as any).user.organizationId;

    const execution = await workflowService.getExecution(executionId);

    if (!execution || execution.organization_id !== organizationId) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found'
      });
    }

    res.json({
      success: true,
      data: execution
    });
  })
);

// =====================================================
// CANCEL EXECUTION
// =====================================================

router.post(
  '/executions/:executionId/cancel',
  authenticate,
  requireOrganization(),
  requireRoles('admin', 'manager', 'super_admin'),
  requirePMWrite,
  [
    param('executionId').isUUID()
  ],
  asyncHandler(async (req: Request, res: Response) => {
    if (!validateRequest(req, res)) return;
    
    const { executionId } = req.params;
    const organizationId = (req as any).user.organization_id || (req as any).user.organizationId;
    const userId = (req as any).user.id;

    const execution = await workflowService.getExecution(executionId);

    if (!execution || execution.organization_id !== organizationId) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found'
      });
    }

    if (execution.status === 'completed' || execution.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error: 'Execution cannot be cancelled'
      });
    }

    await workflowService.cancelExecution(executionId, userId);

    logger.info({ executionId, userId }, 'Workflow execution cancelled');

    res.json({
      success: true,
      message: 'Execution cancelled'
    });
  })
);

export default router;
