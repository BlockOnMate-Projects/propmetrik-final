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
import { registerPMParamValidation, requirePMWrite } from '../middleware/pmAuth';
import { validate } from '../middleware/validation';
import { addTeamMemberSchema, updateTeamMemberSchema } from '../middleware/pmProjectValidation';
import { notificationService } from '../../shared-services/notifications/unified';
import { inviteService } from '../services/shared/inviteService';
import { config } from '../config';

const ts = teamService as any;
const router = Router();
const inviteBaseUrl = (config.app.frontendUrl || 'http://localhost:3000').replace(/\/$/, '');

function buildAcceptInviteUrl(token: string): string {
  return `${inviteBaseUrl}/accept-invite?token=${token}`;
}

function splitFullName(fullName?: string): { firstName?: string; lastName?: string } {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return {};
  }

  if (parts.length === 1) {
    return { firstName: parts[0] };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

async function ensureTeamMemberInvitation(params: {
  member: any;
  organizationId: string;
  invitedById: string;
}): Promise<{ created: boolean; inviteUrl: string }> {
  const normalizedEmail = String(params.member.email || '').trim().toLowerCase();

  if (!normalizedEmail) {
    throw Object.assign(new Error('Team member must have an email address to receive an invitation'), { statusCode: 400 });
  }

  if (params.member.acceptedAt || params.member.accepted_at) {
    throw Object.assign(new Error('This member has already accepted their invitation'), { statusCode: 400 });
  }

  const pendingInvitation = await pool.query(
    `SELECT id
     FROM unified_invitations
     WHERE email = $1 AND organization_id = $2 AND status = 'pending'
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalizedEmail, params.organizationId],
  );

  let invitation;
  let created = false;

  if (pendingInvitation.rows[0]?.id) {
    invitation = await inviteService.resendInvitation(pendingInvitation.rows[0].id, params.invitedById);
  } else {
    const nameParts = splitFullName(params.member.fullName || params.member.full_name || params.member.name);
    invitation = await inviteService.createInvitation({
      email: normalizedEmail,
      role: params.member.role,
      userType: 'staff',
      organizationId: params.organizationId,
      invitedById: params.invitedById,
      firstName: nameParts.firstName,
      lastName: nameParts.lastName,
      teamId: params.member.id,
    });
    created = true;
  }

  await pool.query(
    `UPDATE project_team_members
     SET invited_by = $2,
         invited_at = NOW(),
         status = CASE WHEN accepted_at IS NULL THEN 'pending' ELSE status END,
         updated_at = NOW()
     WHERE id = $1`,
    [params.member.id, params.invitedById],
  );

  return {
    created,
    inviteUrl: buildAcceptInviteUrl(invitation.token),
  };
}

// ── Email template ─────────────────────────────────────────────
function teamInvitationEmail(data: {
  memberName: string; companyName: string; inviterName: string;
  projectNames: string; roleName: string; dashboardUrl: string;
}): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>body{margin:0;padding:0;background:#111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
.container{max-width:600px;margin:0 auto;background:#1a1a1a;border-radius:8px;overflow:hidden}
.header{background:#18181b;padding:24px 32px;border-bottom:1px solid #27272a}
.header h1{color:#f59e0b;font-size:16px;margin:0;letter-spacing:1px;font-family:monospace}
.body{padding:32px;color:#d4d4d8}
.body h2{color:#ffffff;font-size:18px;margin:0 0 16px}
.body p{margin:0 0 12px;font-size:14px;line-height:1.6;color:#a1a1aa}
.highlight{color:#ffffff;font-weight:600}
.detail-row{display:flex;padding:8px 0;border-bottom:1px solid #27272a}
.detail-label{color:#71717a;font-size:12px;font-family:monospace;text-transform:uppercase;min-width:140px}
.detail-value{color:#e4e4e7;font-size:14px}
.cta{display:inline-block;background:#f59e0b;color:#000;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;margin:20px 0}
.footer{background:#18181b;padding:20px 32px;border-top:1px solid #27272a;text-align:center}
.footer p{color:#52525b;font-size:11px;margin:0;font-family:monospace}
</style></head><body>
<div class="container">
  <div class="header"><h1>PROPMETRIK</h1></div>
  <div class="body">
    <h2>You've Been Added to the Team</h2>
    ${data.memberName ? `<p>Dear <span class="highlight">${data.memberName}</span>,</p>` : ''}
    <p>${data.inviterName ? `<span class="highlight">${data.inviterName}</span> from ` : ''}<span class="highlight">${data.companyName}</span> has added you as a team member.</p>
    <div style="margin:20px 0;padding:16px;background:#27272a;border-radius:6px;border-left:3px solid #f59e0b">
      <div class="detail-row"><span class="detail-label">Project(s)</span><span class="detail-value">${data.projectNames}</span></div>
      <div class="detail-row"><span class="detail-label">Role</span><span class="detail-value" style="text-transform:capitalize">${data.roleName}</span></div>
    </div>
    <p>You can now collaborate on the project, access documents, and stay up to date with progress.</p>
    <div style="text-align:center">
      <a href="${data.dashboardUrl}" class="cta">Go to Dashboard</a>
    </div>
    <p style="color:#52525b;font-size:12px;margin-top:24px">This invitation was sent via PropMetrik — Construction Intelligence Platform.</p>
  </div>
  <div class="footer"><p>Sent via PropMetrik</p></div>
</div>
</body></html>`;
}

// Register UUID parameter validation
registerPMParamValidation(router);

// ============================================================================
// TEAM MEMBERS
// ============================================================================

/**
 * POST /team/members
 * Add a team member to a project
 */
router.post('/members', requirePMWrite, validate(addTeamMemberSchema), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || req.body.addedBy;
    const user = (req as any).user;
    const organizationId = user?.organizationId || user?.organization_id;
    const projectIds: string[] = Array.isArray(req.body.project_ids)
      ? req.body.project_ids
      : req.body.project_id ? [req.body.project_id] : [];

    if (projectIds.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one project is required' });
    }

    const created: any[] = [];
    for (const pid of projectIds) {
      const member = await teamService.addTeamMember({
        projectId: pid,
        organizationId,
        fullName: req.body.name,
        email: req.body.email,
        phone: req.body.phone,
        role: req.body.role,
        invitedBy: userId,
      });
      created.push(member);
    }

    // Send invitation email
    if (req.body.email) {
      try {
        const projectNames = await pool.query(
          `SELECT name FROM development_projects WHERE id = ANY($1)`,
          [projectIds],
        );
        const projects = projectNames.rows.map((r: any) => r.name).filter(Boolean).join(', ') || 'a project';

        const [orgRow, inviterRow] = await Promise.all([
          pool.query('SELECT name FROM organizations WHERE id = $1', [organizationId]),
          pool.query('SELECT first_name, last_name, display_name, email FROM users WHERE id = $1 OR keycloak_id = $1', [userId]),
        ]);
        const companyName = orgRow.rows[0]?.name || 'the team';
        const inviter = inviterRow.rows[0];
        const inviterName = inviter?.display_name || [inviter?.first_name, inviter?.last_name].filter(Boolean).join(' ') || '';
        const roleName = (req.body.role || 'team member').replace(/_/g, ' ');
        const dashboardUrl = `${config.app.frontendUrl}/dashboard/projects`;

        const emailResult = await notificationService.sendEmail({
          to: req.body.email,
          subject: `You've been added to ${projects} — ${companyName} | PropMetrik`,
          html: teamInvitationEmail({
            memberName: req.body.name || '',
            companyName,
            inviterName,
            projectNames: projects,
            roleName,
            dashboardUrl,
          }),
        });
        if (emailResult.success) {
          logger.info('Team invitation email sent', { to: req.body.email, projects });
        } else {
          logger.error('Team invitation email failed', { to: req.body.email, error: emailResult.error });
        }
      } catch (err: any) {
        logger.error('Failed to send team invitation email', { to: req.body.email, error: err.message });
      }
    }
    
    res.status(201).json({
      success: true,
      data: created.length === 1 ? created[0] : created,
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
    const user = (req as any).user;
    const orgId = user?.organizationId || user?.organization_id || req.query.organizationId as string;

    const filters = {
      projectId: req.query.projectId as string,
      organizationId: orgId,
      userId: req.query.userId as string,
      role: req.query.role as GhanaTeamRole | undefined,
      isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
      search: req.query.search as string,
    };
    
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const { members, total } = await teamService.getTeamMembers(filters, limit, offset);

    // Map camelCase service response to snake_case API contract
    const mapped = members.map((m: any) => ({
      id: m.id,
      project_id: m.projectId,
      organization_id: m.organizationId,
      user_id: m.userId,
      vendor_id: m.vendorId,
      name: m.fullName,
      full_name: m.fullName,
      email: m.email,
      phone: m.phone,
      role: m.role,
      role_type: m.roleType,
      role_category: m.roleCategory,
      title: m.title,
      department: m.department,
      company: m.company,
      is_active: m.isActive,
      status: m.status,
      invited_by: m.invitedBy,
      invited_at: m.invitedAt,
      accepted_at: m.acceptedAt,
      permissions: m.permissions,
      created_at: m.createdAt,
      updated_at: m.updatedAt,
    }));
    
    res.json({
      success: true,
      data: mapped,
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
 * POST /team/members/:id/resend-invite
 * Create or resend an account setup invitation for a pending team member.
 */
router.post('/members/:id/resend-invite', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const invitedById = user?.id;
    const organizationId = user?.organizationId || user?.organization_id;

    if (!organizationId || !invitedById) {
      return res.status(400).json({ success: false, error: 'Organization context is required' });
    }

    const member = await teamService.getTeamMemberById(req.params.id);

    if (!member || member.organizationId !== organizationId) {
      return res.status(404).json({ success: false, error: 'Team member not found' });
    }

    const invitation = await ensureTeamMemberInvitation({
      member,
      organizationId,
      invitedById,
    });

    res.json({
      success: true,
      data: {
        member_id: member.id,
        email: member.email,
        invite_url: invitation.inviteUrl,
        created: invitation.created,
      },
      message: invitation.created ? 'Invitation created and sent' : 'Invitation resent',
    });
  } catch (error: any) {
    logger.error('Error resending team invitation', { memberId: req.params.id, error });
    res.status(error?.statusCode || 500).json({
      success: false,
      error: error?.message || 'Failed to resend invitation',
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
router.put('/members/:id', requirePMWrite, validate(updateTeamMemberSchema), async (req: Request, res: Response) => {
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
router.put('/members/:id/permissions', requirePMWrite, async (req: Request, res: Response) => {
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
router.post('/members/:id/deactivate', requirePMWrite, async (req: Request, res: Response) => {
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
router.post('/members/:id/reactivate', requirePMWrite, async (req: Request, res: Response) => {
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
router.delete('/members/:id', requirePMWrite, async (req: Request, res: Response) => {
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
router.post('/members/:id/availability', requirePMWrite, async (req: Request, res: Response) => {
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
router.post('/communications', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || req.body.loggedBy;
    const orgId = (req as any).user?.organizationId || req.headers['x-organization-id'] as string;
    
    const log = await teamService.logCommunication({
      ...req.body,
      projectId: req.body.projectId || req.body.project_id,
      organizationId: req.body.organizationId || req.body.organization_id || orgId,
      communicationType: req.body.communicationType || req.body.communication_type || 'other',
      direction: req.body.direction || 'outbound',
      communicationDate: req.body.communicationDate || req.body.communication_date || req.body.date || new Date().toISOString().split('T')[0],
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
router.put('/communications/:id', requirePMWrite, async (req: Request, res: Response) => {
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
router.post('/communications/:id/complete-followup', requirePMWrite, async (req: Request, res: Response) => {
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
router.delete('/communications/:id', requirePMWrite, async (req: Request, res: Response) => {
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

// ============================================================================
// MEMBER PROFILE DATA
// ============================================================================

/**
 * GET /team/members/:id/profile
 * Full profile with metrics for the member detail view
 */
router.get('/members/:id/profile', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    const orgId = user?.organizationId || user?.organization_id;

    // Base member info
    const memberRow = await pool.query(
      `SELECT ptm.*, dp.name AS project_name
       FROM project_team_members ptm
       LEFT JOIN development_projects dp ON dp.id = ptm.project_id
       WHERE ptm.id = $1 ${orgId ? 'AND ptm.organization_id = $2' : ''}`,
      orgId ? [id, orgId] : [id],
    );
    if (memberRow.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }
    const m = memberRow.rows[0];

    // All projects this member belongs to
    const projectsRes = await pool.query(
      `SELECT ptm.id AS membership_id, ptm.role, ptm.is_active, ptm.start_date, ptm.end_date,
              dp.id AS project_id, dp.name AS project_name, dp.status, dp.overall_progress
       FROM project_team_members ptm
       JOIN development_projects dp ON dp.id = ptm.project_id
       WHERE ptm.email = $1 AND ptm.organization_id = $2
       ORDER BY dp.created_at DESC`,
      [m.email, m.organization_id],
    );

    // Aggregate metrics
    const projectIds = projectsRes.rows.map((r: any) => r.project_id);
    let timesheetMetrics = { total_hours: 0, entries_count: 0 };
    let documentCount = 0;
    let invoiceCount = 0;
    let activityRows: any[] = [];

    if (m.user_id && projectIds.length > 0) {
      // Timesheet hours
      const tsRes = await pool.query(
        `SELECT COALESCE(SUM(hours_worked), 0) AS total_hours, COUNT(*) AS entries_count
         FROM time_entries
         WHERE user_id = $1 AND project_id = ANY($2)`,
        [m.user_id, projectIds],
      );
      timesheetMetrics = tsRes.rows[0];

      // Documents uploaded
      const docRes = await pool.query(
        `SELECT COUNT(*) AS cnt FROM project_documents
         WHERE uploaded_by = $1 AND project_id = ANY($2)`,
        [m.user_id, projectIds],
      );
      documentCount = parseInt(docRes.rows[0]?.cnt || '0');

      // Invoices managed (submitted or approved)
      const invRes = await pool.query(
        `SELECT COUNT(*) AS cnt FROM project_invoices
         WHERE (submitted_by = $1 OR approved_by = $1) AND project_id = ANY($2)`,
        [m.user_id, projectIds],
      );
      invoiceCount = parseInt(invRes.rows[0]?.cnt || '0');

      // Recent audit activity
      const actRes = await pool.query(
        `SELECT action, entity_type, entity_id, created_at
         FROM audit_logs
         WHERE user_id = $1 AND organization_id = $2
         ORDER BY created_at DESC LIMIT 20`,
        [m.user_id, m.organization_id],
      );
      activityRows = actRes.rows;
    }

    res.json({
      success: true,
      data: {
        member: {
          id: m.id,
          user_id: m.user_id,
          full_name: m.full_name,
          email: m.email,
          phone: m.phone,
          phone_alt: m.phone_alt,
          whatsapp: m.whatsapp,
          avatar_url: m.avatar_url,
          role: m.role,
          role_type: m.role_type,
          role_category: m.role_category,
          title: m.title,
          department: m.department,
          company: m.company,
          is_active: m.is_active,
          status: m.status,
          start_date: m.start_date,
          end_date: m.end_date,
          hourly_rate: m.hourly_rate,
          daily_rate: m.daily_rate,
          monthly_rate: m.monthly_rate,
          rate_currency: m.rate_currency,
          invited_by: m.invited_by,
          invited_at: m.invited_at,
          accepted_at: m.accepted_at,
          notes: m.notes,
          permissions: {
            canView: m.can_view,
            canEdit: m.can_edit,
            canApproveCosts: m.can_approve_costs,
            canUploadDocuments: m.can_upload_documents,
            canAddTasks: m.can_add_tasks,
            canManageTeam: m.can_manage_team,
            canViewFinancials: m.can_view_financials,
            canReceiveNotifications: m.can_receive_notifications,
          },
          created_at: m.created_at,
          updated_at: m.updated_at,
        },
        projects: projectsRes.rows,
        metrics: {
          activeProjects: projectsRes.rows.filter((p: any) => p.is_active).length,
          totalProjects: projectsRes.rows.length,
          totalHours: parseFloat(timesheetMetrics.total_hours as any) || 0,
          timesheetEntries: parseInt(timesheetMetrics.entries_count as any) || 0,
          documentsUploaded: documentCount,
          invoicesManaged: invoiceCount,
        },
        activity: activityRows,
      },
    });
  } catch (error) {
    logger.error('Error getting member profile', { error });
    res.status(500).json({ success: false, error: 'Failed to get member profile' });
  }
});

/**
 * GET /team/members/:id/timesheets
 * Timesheet entries for this member
 */
router.get('/members/:id/timesheets', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    const orgId = user?.organizationId || user?.organization_id;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    // Resolve user_id from team member
    const memberRes = await pool.query(
      `SELECT user_id, organization_id FROM project_team_members WHERE id = $1`,
      [id],
    );
    if (memberRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }
    const { user_id } = memberRes.rows[0];
    if (!user_id) {
      return res.json({ success: true, data: [], pagination: { total: 0, limit, offset } });
    }

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM time_entries WHERE user_id = $1 AND organization_id = $2`,
      [user_id, orgId || memberRes.rows[0].organization_id],
    );
    const total = parseInt(countRes.rows[0].count);

    const rows = await pool.query(
      `SELECT te.*, dp.name AS project_name
       FROM time_entries te
       LEFT JOIN development_projects dp ON dp.id = te.project_id
       WHERE te.user_id = $1 AND te.organization_id = $2
       ORDER BY te.entry_date DESC
       LIMIT $3 OFFSET $4`,
      [user_id, orgId || memberRes.rows[0].organization_id, limit, offset],
    );

    res.json({ success: true, data: rows.rows, pagination: { total, limit, offset } });
  } catch (error) {
    logger.error('Error getting member timesheets', { error });
    res.status(500).json({ success: false, error: 'Failed to get member timesheets' });
  }
});

/**
 * GET /team/members/:id/documents
 * Documents uploaded by this member
 */
router.get('/members/:id/documents', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    const orgId = user?.organizationId || user?.organization_id;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const memberRes = await pool.query(
      `SELECT user_id, organization_id FROM project_team_members WHERE id = $1`,
      [id],
    );
    if (memberRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }
    const { user_id } = memberRes.rows[0];
    if (!user_id) {
      return res.json({ success: true, data: [], pagination: { total: 0, limit, offset } });
    }

    const effectiveOrgId = orgId || memberRes.rows[0].organization_id;
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM project_documents WHERE uploaded_by = $1 AND organization_id = $2`,
      [user_id, effectiveOrgId],
    );
    const total = parseInt(countRes.rows[0].count);

    const rows = await pool.query(
      `SELECT pd.id, pd.name, pd.document_type, pd.file_size, pd.mime_type, pd.status, pd.version, pd.created_at,
              dp.name AS project_name
       FROM project_documents pd
       LEFT JOIN development_projects dp ON dp.id = pd.project_id
       WHERE pd.uploaded_by = $1 AND pd.organization_id = $2
       ORDER BY pd.created_at DESC
       LIMIT $3 OFFSET $4`,
      [user_id, effectiveOrgId, limit, offset],
    );

    res.json({ success: true, data: rows.rows, pagination: { total, limit, offset } });
  } catch (error) {
    logger.error('Error getting member documents', { error });
    res.status(500).json({ success: false, error: 'Failed to get member documents' });
  }
});

/**
 * GET /team/members/:id/financials
 * Invoices & expenses related to this member
 */
router.get('/members/:id/financials', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    const orgId = user?.organizationId || user?.organization_id;

    const memberRes = await pool.query(
      `SELECT user_id, organization_id FROM project_team_members WHERE id = $1`,
      [id],
    );
    if (memberRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }
    const { user_id } = memberRes.rows[0];
    const effectiveOrgId = orgId || memberRes.rows[0].organization_id;

    let invoices: any[] = [];
    let expenses: any[] = [];

    if (user_id) {
      const invRes = await pool.query(
        `SELECT pi.id, pi.invoice_number, pi.amount, pi.currency, pi.status, pi.invoice_date, pi.due_date,
                dp.name AS project_name
         FROM project_invoices pi
         LEFT JOIN development_projects dp ON dp.id = pi.project_id
         WHERE (pi.submitted_by = $1 OR pi.approved_by = $1) AND pi.organization_id = $2
         ORDER BY pi.invoice_date DESC LIMIT 50`,
        [user_id, effectiveOrgId],
      );
      invoices = invRes.rows;

      const expRes = await pool.query(
        `SELECT el.id, el.amount, el.currency, el.expense_type, el.expense_date, el.status, el.payee_name,
                dp.name AS project_name
         FROM expense_logs el
         LEFT JOIN development_projects dp ON dp.id = el.project_id
         WHERE (el.logged_by = $1 OR el.approved_by = $1) AND el.organization_id = $2
         ORDER BY el.expense_date DESC LIMIT 50`,
        [user_id, effectiveOrgId],
      );
      expenses = expRes.rows;
    }

    res.json({
      success: true,
      data: { invoices, expenses },
    });
  } catch (error) {
    logger.error('Error getting member financials', { error });
    res.status(500).json({ success: false, error: 'Failed to get member financials' });
  }
});

/**
 * PATCH /team/members/:id/permissions
 * Update individual permission flags
 */
router.patch('/members/:id/permissions', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const permissions = req.body.permissions;
    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({ success: false, error: 'permissions object required' });
    }

    const allowedKeys = [
      'can_view', 'can_edit', 'can_approve_costs', 'can_upload_documents',
      'can_add_tasks', 'can_manage_team', 'can_view_financials', 'can_receive_notifications',
    ];
    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    for (const [key, value] of Object.entries(permissions)) {
      if (allowedKeys.includes(key) && typeof value === 'boolean') {
        sets.push(`${key} = $${idx}`);
        vals.push(value);
        idx++;
      }
    }
    if (sets.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid permission keys provided' });
    }
    vals.push(id);
    await pool.query(
      `UPDATE project_team_members SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx}`,
      vals,
    );

    res.json({ success: true, message: 'Permissions updated' });
  } catch (error) {
    logger.error('Error updating member permissions', { error });
    res.status(500).json({ success: false, error: 'Failed to update permissions' });
  }
});

export default router;
