/**
 * Team Routes
 * Phase 4 Sprint 8 - Team & Integration
 * 
 * API routes for:
 * - Project team members
 * - Team member permissions
 * - Communication logging
 * - Availability management
 */

import { Router, Request, Response } from 'express';
import { 
  teamService, 
  GhanaTeamRole, 
  CommunicationType 
} from '../services/project-management/teamService';
import { pool } from '../database';
import { logger } from '../utils/logger';

const ts = teamService as any;
const router = Router();

// ============================================================================
// TEAM MEMBERS
// ============================================================================

/**
 * POST /team/members
 * Add a team member to a project
 */
router.post('/members', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || req.body.addedBy;
    
    const member = await teamService.addTeamMember({
      ...req.body,
      addedBy: userId,
    });
    
    res.status(201).json({
      success: true,
      data: member,
    });
  } catch (error) {
    logger.error('Error adding team member', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to add team member',
    });
  }
});

/**
 * GET /team/members
 * Get team members with filters
 */
router.get('/members', async (req: Request, res: Response) => {
  try {
    const filters = {
      projectId: req.query.projectId as string,
      organizationId: req.query.organizationId as string,
      userId: req.query.userId as string,
      role: req.query.role as GhanaTeamRole | undefined,
      isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
      search: req.query.search as string,
    };
    
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const { members, total } = await teamService.getTeamMembers(filters, limit, offset);
    
    res.json({
      success: true,
      data: members,
      pagination: {
        total,
        limit,
        offset,
      },
    });
  } catch (error) {
    logger.error('Error getting team members', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get team members',
    });
  }
});

/**
 * GET /team/admins
 * Get organization admin users (optionally by projectId)
 */
router.get('/admins', async (req: Request, res: Response) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    const organizationId = req.query.organizationId as string | undefined;

    let resolvedOrgId = organizationId;

    if (!resolvedOrgId && projectId) {
      const projectResult = await pool.query(
        'SELECT organization_id FROM development_projects WHERE id = $1',
        [projectId]
      );
      resolvedOrgId = projectResult.rows[0]?.organization_id;
    }

    if (!resolvedOrgId) {
      return res.status(400).json({
        success: false,
        error: 'organizationId or projectId is required',
      });
    }

    const admins = await pool.query(
      `SELECT u.id AS user_id,
              COALESCE(u.display_name, u.first_name || ' ' || u.last_name, u.email) AS name,
              u.email
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       WHERE ur.organization_id = $1
         AND ur.role = 'admin'`,
      [resolvedOrgId]
    );

    res.json({
      success: true,
      data: admins.rows,
    });
  } catch (error) {
    logger.error('Error getting admin users', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get admin users',
    });
  }
});

/**
 * GET /team/members/:id
 * Get team member by ID
 */
router.get('/members/:id', async (req: Request, res: Response) => {
  try {
    const member = await teamService.getTeamMemberById(req.params.id);
    
    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'Team member not found',
      });
    }
    
    res.json({
      success: true,
      data: member,
    });
  } catch (error) {
    logger.error('Error getting team member', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get team member',
    });
  }
});

/**
 * GET /team/projects/:projectId/members
 * Get team members for a specific project
 */
router.get('/projects/:projectId/members', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    
    const members = await teamService.getProjectTeam(projectId);
    
    res.json({
      success: true,
      data: members,
    });
  } catch (error) {
    logger.error('Error getting project team', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get project team',
    });
  }
});

/**
 * PUT /team/members/:id
 * Update a team member
 */
router.put('/members/:id', async (req: Request, res: Response) => {
  try {
    const member = await ts.updateTeamMember(req.params.id, req.body);
    
    res.json({
      success: true,
      data: member,
    });
  } catch (error) {
    logger.error('Error updating team member', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to update team member',
    });
  }
});

/**
 * PUT /team/members/:id/permissions
 * Update team member permissions
 */
router.put('/members/:id/permissions', async (req: Request, res: Response) => {
  try {
    const { permissions } = req.body;
    
    const member = await teamService.updateMemberPermissions(req.params.id, permissions);
    
    res.json({
      success: true,
      data: member,
    });
  } catch (error) {
    logger.error('Error updating permissions', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to update permissions',
    });
  }
});

/**
 * POST /team/members/:id/deactivate
 * Deactivate a team member
 */
router.post('/members/:id/deactivate', async (req: Request, res: Response) => {
  try {
    const member = await ts.deactivateMember(req.params.id);
    
    res.json({
      success: true,
      data: member,
    });
  } catch (error) {
    logger.error('Error deactivating member', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to deactivate member',
    });
  }
});

/**
 * POST /team/members/:id/reactivate
 * Reactivate a team member
 */
router.post('/members/:id/reactivate', async (req: Request, res: Response) => {
  try {
    const member = await ts.reactivateMember(req.params.id);
    
    res.json({
      success: true,
      data: member,
    });
  } catch (error) {
    logger.error('Error reactivating member', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to reactivate member',
    });
  }
});

/**
 * DELETE /team/members/:id
 * Remove a team member from project
 */
router.delete('/members/:id', async (req: Request, res: Response) => {
  try {
    await teamService.removeTeamMember(req.params.id);
    
    res.json({
      success: true,
      message: 'Team member removed',
    });
  } catch (error) {
    logger.error('Error removing team member', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to remove team member',
    });
  }
});

// ============================================================================
// ROLES
// ============================================================================

/**
 * GET /team/roles
 * Get all Ghana-specific roles
 */
router.get('/roles', async (_req: Request, res: Response) => {
  try {
    const roles = await ts.getGhanaRoles();
    
    res.json({
      success: true,
      data: roles,
    });
  } catch (error) {
    logger.error('Error getting roles', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get roles',
    });
  }
});

/**
 * GET /team/roles/:category
 * Get roles by category
 */
router.get('/roles/:category', async (req: Request, res: Response) => {
  try {
    const { category } = req.params;
    const validCategories = ['construction', 'professional', 'government', 'stakeholder', 'internal'];
    
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        error: `Invalid category. Must be one of: ${validCategories.join(', ')}`,
      });
    }
    
    const roles = await ts.getRolesByCategory(category);
    
    res.json({
      success: true,
      data: roles,
    });
  } catch (error) {
    logger.error('Error getting roles by category', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get roles',
    });
  }
});

// ============================================================================
// AVAILABILITY
// ============================================================================

/**
 * POST /team/members/:id/availability
 * Set team member availability
 */
router.post('/members/:id/availability', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { date, startTime, endTime, isAvailable, notes } = req.body;
    
    const availability = await ts.setMemberAvailability(id, {
      date: new Date(date),
      startTime,
      endTime,
      isAvailable,
      notes,
    });
    
    res.status(201).json({
      success: true,
      data: availability,
    });
  } catch (error) {
    logger.error('Error setting availability', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to set availability',
    });
  }
});

/**
 * GET /team/members/:id/availability
 * Get team member availability
 */
router.get('/members/:id/availability', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date();
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : 
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default 30 days
    
    const availability = await ts.getMemberAvailability(id, startDate, endDate);
    
    res.json({
      success: true,
      data: availability,
    });
  } catch (error) {
    logger.error('Error getting availability', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get availability',
    });
  }
});

/**
 * GET /team/projects/:projectId/availability
 * Get team availability for a project
 */
router.get('/projects/:projectId/availability', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const date = req.query.date ? new Date(req.query.date as string) : new Date();
    
    const availability = await ts.getProjectTeamAvailability(projectId, date);
    
    res.json({
      success: true,
      data: availability,
    });
  } catch (error) {
    logger.error('Error getting project availability', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get project availability',
    });
  }
});

// ============================================================================
// COMMUNICATION
// ============================================================================

/**
 * POST /team/communications
 * Log a communication
 */
router.post('/communications', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || req.body.loggedBy;
    
    const log = await teamService.logCommunication({
      ...req.body,
      loggedBy: userId,
    });
    
    res.status(201).json({
      success: true,
      data: log,
    });
  } catch (error) {
    logger.error('Error logging communication', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to log communication',
    });
  }
});

/**
 * GET /team/communications
 * Get communication logs with filters
 */
router.get('/communications', async (req: Request, res: Response) => {
  try {
    const filters = {
      projectId: req.query.projectId as string,
      organizationId: req.query.organizationId as string,
      teamMemberId: req.query.teamMemberId as string,
      vendorId: req.query.vendorId as string,
      communicationType: req.query.communicationType as CommunicationType | undefined,
      hasFollowUp: req.query.hasFollowUp === 'true',
      search: req.query.search as string,
    };
    
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const { logs, total } = await ts.getCommunicationLogs(filters, limit, offset);
    
    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        limit,
        offset,
      },
    });
  } catch (error) {
    logger.error('Error getting communication logs', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get communication logs',
    });
  }
});

/**
 * GET /team/communications/:id
 * Get communication log by ID
 */
router.get('/communications/:id', async (req: Request, res: Response) => {
  try {
    const log = await ts.getCommunicationById(req.params.id);
    
    if (!log) {
      return res.status(404).json({
        success: false,
        error: 'Communication log not found',
      });
    }
    
    res.json({
      success: true,
      data: log,
    });
  } catch (error) {
    logger.error('Error getting communication', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get communication',
    });
  }
});

/**
 * GET /team/projects/:projectId/communications
 * Get communications for a project
 */
router.get('/projects/:projectId/communications', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    
    const logs = await teamService.getProjectCommunications(projectId);
    
    res.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    logger.error('Error getting project communications', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get project communications',
    });
  }
});

/**
 * PUT /team/communications/:id
 * Update a communication log
 */
router.put('/communications/:id', async (req: Request, res: Response) => {
  try {
    const log = await ts.updateCommunication(req.params.id, req.body);
    
    res.json({
      success: true,
      data: log,
    });
  } catch (error) {
    logger.error('Error updating communication', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to update communication',
    });
  }
});

/**
 * POST /team/communications/:id/complete-followup
 * Mark follow-up as complete
 */
router.post('/communications/:id/complete-followup', async (req: Request, res: Response) => {
  try {
    const log = await ts.completeFollowUp(req.params.id);
    
    res.json({
      success: true,
      data: log,
    });
  } catch (error) {
    logger.error('Error completing follow-up', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to complete follow-up',
    });
  }
});

/**
 * GET /team/follow-ups/pending
 * Get pending follow-ups
 */
router.get('/follow-ups/pending', async (req: Request, res: Response) => {
  try {
    const organizationId = req.query.organizationId as string;
    
    const followUps = await teamService.getPendingFollowUps(organizationId);
    
    res.json({
      success: true,
      data: followUps,
    });
  } catch (error) {
    logger.error('Error getting pending follow-ups', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get pending follow-ups',
    });
  }
});

/**
 * DELETE /team/communications/:id
 * Delete a communication log
 */
router.delete('/communications/:id', async (req: Request, res: Response) => {
  try {
    await ts.deleteCommunication(req.params.id);
    
    res.json({
      success: true,
      message: 'Communication log deleted',
    });
  } catch (error) {
    logger.error('Error deleting communication', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to delete communication',
    });
  }
});

// ============================================================================
// USER PROJECTS
// ============================================================================

/**
 * GET /team/users/:userId/projects
 * Get all projects a user is assigned to
 */
router.get('/users/:userId/projects', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    const projects = await ts.getUserProjects(userId);
    
    res.json({
      success: true,
      data: projects,
    });
  } catch (error) {
    logger.error('Error getting user projects', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get user projects',
    });
  }
});

export default router;
