/**
 * Governance Routes
 * Milestone Frameworks, Approvals, and Compliance Checkpoints
 * Phase 5.9: Project Management Governance
 */

import { Router, Request, Response, NextFunction } from 'express';
import { 
  milestoneFrameworkService,
  type MilestoneFramework,
  type FrameworkPhase,
  type MilestoneTemplate,
} from '../services/project-management/governance';
import { logger } from '../utils/logger';

const router = Router();

// Development mode organization ID (valid UUID for testing)
const DEV_ORG_ID = '00000000-0000-0000-0000-000000000001';
// Development mode user ID (valid UUID for testing)
const DEV_USER_ID = 'ed4a50d7-a1b2-4c3d-8e5f-6a7b8c9d0e1f';

// Helper to get organization ID from request
const getOrgId = (req: Request): string => {
  return (req as any).organizationId || 
    (req as any).user?.organizationId || 
    (req as any).user?.organization_id || 
    req.headers['x-organization-id'] as string ||
    DEV_ORG_ID;
};

const getUserId = (req: Request): string => {
  return (req as any).user?.id || 
    (req as any).user?.sub || 
    (req as any).userId || 
    req.headers['x-user-id'] as string ||
    DEV_USER_ID;
};

// =============================================================================
// MILESTONE FRAMEWORKS
// =============================================================================

/**
 * @route GET /api/v1/milestone-frameworks
 * @desc List all milestone frameworks for the organization
 * @access Private
 */
router.get('/milestone-frameworks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = getOrgId(req);
    const { 
      project_type, 
      projectType,
      region, 
      is_active,
      page, 
      limit 
    } = req.query;

    const result = await milestoneFrameworkService.listFrameworks(
      organizationId,
      {
        projectType: (project_type as string) || (projectType as string),
        region: region as string,
        activeOnly: is_active !== 'false',
        page: parseInt(page as string) || 1,
        limit: parseInt(limit as string) || 20,
      }
    );

    res.json({
      success: true,
      frameworks: result.data,
      data: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    logger.error('Failed to list milestone frameworks', { error: (error as Error).message });
    next(error);
  }
});

/**
 * @route GET /api/v1/milestone-frameworks/:id
 * @desc Get a milestone framework by ID with phases
 * @access Private
 */
router.get('/milestone-frameworks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const framework = await milestoneFrameworkService.getFrameworkById(id);

    res.json({
      success: true,
      data: framework,
    });
  } catch (error) {
    logger.error('Failed to get milestone framework', { 
      error: (error as Error).message,
      frameworkId: req.params.id,
    });
    next(error);
  }
});

/**
 * @route POST /api/v1/milestone-frameworks
 * @desc Create a new milestone framework
 * @access Private (Admin only)
 */
router.post('/milestone-frameworks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = getOrgId(req);
    const userId = getUserId(req);

    const framework = await milestoneFrameworkService.createFramework(
      organizationId,
      req.body,
      userId
    );

    res.status(201).json({
      success: true,
      data: framework,
    });
  } catch (error) {
    logger.error('Failed to create milestone framework', { error: (error as Error).message });
    next(error);
  }
});

/**
 * @route PUT /api/v1/milestone-frameworks/:id
 * @desc Update a milestone framework
 * @access Private (Admin only)
 */
router.put('/milestone-frameworks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    const framework = await milestoneFrameworkService.updateFramework(id, req.body, userId);

    res.json({
      success: true,
      data: framework,
    });
  } catch (error) {
    logger.error('Failed to update milestone framework', { 
      error: (error as Error).message,
      frameworkId: req.params.id,
    });
    next(error);
  }
});

/**
 * @route POST /api/v1/milestone-frameworks/:id/lock
 * @desc Lock a framework (prevents modifications)
 * @access Private (Admin only)
 */
router.post('/milestone-frameworks/:id/lock', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    const framework = await milestoneFrameworkService.lockFramework(id, userId);

    res.json({
      success: true,
      data: framework,
    });
  } catch (error) {
    logger.error('Failed to lock milestone framework', { 
      error: (error as Error).message,
      frameworkId: req.params.id,
    });
    next(error);
  }
});

/**
 * @route POST /api/v1/milestone-frameworks/:id/version
 * @desc Create a new version of a locked framework
 * @access Private (Admin only)
 */
router.post('/milestone-frameworks/:id/version', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    const framework = await milestoneFrameworkService.createNewVersion(id, userId);

    res.status(201).json({
      success: true,
      data: framework,
    });
  } catch (error) {
    logger.error('Failed to create framework version', { 
      error: (error as Error).message,
      frameworkId: req.params.id,
    });
    next(error);
  }
});

/**
 * @route DELETE /api/v1/milestone-frameworks/:id
 * @desc Soft delete a milestone framework
 * @access Private (Admin only)
 * @todo Implement deleteFramework in MilestoneFrameworkService
 */
router.delete('/milestone-frameworks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // TODO: Implement deleteFramework in MilestoneFrameworkService
    res.status(501).json({
      success: false,
      error: 'Delete framework not yet implemented',
    });
  } catch (error) {
    logger.error('Failed to delete milestone framework', { 
      error: (error as Error).message,
      frameworkId: req.params.id,
    });
    next(error);
  }
});

// =============================================================================
// FRAMEWORK PHASES
// =============================================================================

/**
 * @route GET /api/v1/milestone-frameworks/:frameworkId/phases
 * @desc Get all phases for a framework
 * @access Private
 */
router.get('/milestone-frameworks/:frameworkId/phases', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { frameworkId } = req.params;

    const phases = await milestoneFrameworkService.getFrameworkPhases(frameworkId);

    res.json({
      success: true,
      phases,
      data: phases,
    });
  } catch (error) {
    logger.error('Failed to get framework phases', { 
      error: (error as Error).message,
      frameworkId: req.params.frameworkId,
    });
    next(error);
  }
});

/**
 * @route POST /api/v1/milestone-frameworks/:frameworkId/phases
 * @desc Add a phase to a framework
 * @access Private (Admin only)
 */
router.post('/milestone-frameworks/:frameworkId/phases', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { frameworkId } = req.params;
    const userId = getUserId(req);

    const phase = await milestoneFrameworkService.addPhase(frameworkId, req.body, userId);

    res.status(201).json({
      success: true,
      data: phase,
    });
  } catch (error) {
    logger.error('Failed to add framework phase', { 
      error: (error as Error).message,
      frameworkId: req.params.frameworkId,
    });
    next(error);
  }
});

/**
 * @route PUT /api/v1/framework-phases/:id
 * @desc Update a framework phase
 * @access Private (Admin only)
 * @todo Implement updatePhase in MilestoneFrameworkService
 */
router.put('/framework-phases/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // TODO: Implement updatePhase in MilestoneFrameworkService
    res.status(501).json({
      success: false,
      error: 'Update phase not yet implemented',
    });
  } catch (error) {
    logger.error('Failed to update framework phase', { 
      error: (error as Error).message,
      phaseId: req.params.id,
    });
    next(error);
  }
});

/**
 * @route DELETE /api/v1/framework-phases/:id
 * @desc Delete a framework phase
 * @access Private (Admin only)
 * @todo Implement deletePhase in MilestoneFrameworkService
 */
router.delete('/framework-phases/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // TODO: Implement deletePhase in MilestoneFrameworkService
    res.status(501).json({
      success: false,
      error: 'Delete phase not yet implemented',
    });
  } catch (error) {
    logger.error('Failed to delete framework phase', { 
      error: (error as Error).message,
      phaseId: req.params.id,
    });
    next(error);
  }
});

// =============================================================================
// MILESTONE TEMPLATES
// =============================================================================

/**
 * @route GET /api/v1/framework-phases/:phaseId/templates
 * @desc Get all milestone templates for a phase
 * @access Private
 */
router.get('/framework-phases/:phaseId/templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phaseId } = req.params;

    const templates = await milestoneFrameworkService.getPhaseTemplates(phaseId);

    res.json({
      success: true,
      templates,
      data: templates,
    });
  } catch (error) {
    logger.error('Failed to get phase templates', { 
      error: (error as Error).message,
      phaseId: req.params.phaseId,
    });
    next(error);
  }
});

/**
 * @route POST /api/v1/framework-phases/:phaseId/templates
 * @desc Add a milestone template to a phase
 * @access Private (Admin only)
 */
router.post('/framework-phases/:phaseId/templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phaseId } = req.params;
    const userId = getUserId(req);

    const template = await milestoneFrameworkService.addMilestoneTemplate(phaseId, req.body, userId);

    res.status(201).json({
      success: true,
      data: template,
    });
  } catch (error) {
    logger.error('Failed to add milestone template', { 
      error: (error as Error).message,
      phaseId: req.params.phaseId,
    });
    next(error);
  }
});

/**
 * @route PUT /api/v1/milestone-templates/:id
 * @desc Update a milestone template
 * @access Private (Admin only)
 * @todo Implement updateMilestoneTemplate in MilestoneFrameworkService
 */
router.put('/milestone-templates/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // TODO: Implement updateMilestoneTemplate in MilestoneFrameworkService
    res.status(501).json({
      success: false,
      error: 'Update template not yet implemented',
    });
  } catch (error) {
    logger.error('Failed to update milestone template', { 
      error: (error as Error).message,
      templateId: req.params.id,
    });
    next(error);
  }
});

/**
 * @route DELETE /api/v1/milestone-templates/:id
 * @desc Delete a milestone template
 * @access Private (Admin only)
 * @todo Implement deleteMilestoneTemplate in MilestoneFrameworkService
 */
router.delete('/milestone-templates/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // TODO: Implement deleteMilestoneTemplate in MilestoneFrameworkService
    res.status(501).json({
      success: false,
      error: 'Delete template not yet implemented',
    });
  } catch (error) {
    logger.error('Failed to delete milestone template', { 
      error: (error as Error).message,
      templateId: req.params.id,
    });
    next(error);
  }
});

export default router;
