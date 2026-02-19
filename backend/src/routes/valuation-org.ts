/**
 * Valuation Organization Routes
 * RBAC & Team Management for Valuation Service
 *
 * Endpoints:
 * - POST   /invitations           - Invite user to org
 * - GET    /invitations           - List pending invitations
 * - DELETE /invitations/:id       - Revoke invitation
 * - POST   /invitations/:id/resend - Resend invitation
 * - POST   /invitations/accept    - Accept invitation with token
 * - GET    /members               - List org members
 * - PUT    /members/:id/role      - Update member role
 * - DELETE /members/:id           - Remove member
 * - POST   /valuations/:id/team   - Assign member to valuation
 * - GET    /valuations/:id/team   - List valuation team
 * - DELETE /valuations/:vid/team/:uid - Remove from valuation
 */

import { Router, Request, Response } from 'express';
import { orgTeamService, VALID_ORG_ROLES } from '../services/valuation-engine/orgTeamService';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { logger } from '../utils/logger';

const router = Router();

// ============================================================================
// PUBLIC ENDPOINTS (no authentication required)
// These must be defined BEFORE the router.use(authenticate) call.
// ============================================================================

/**
 * GET /invitations/details?token=...
 * Public endpoint — fetch invitation info for the accept-invite page.
 */
router.get('/invitations/details', async (req: Request, res: Response) => {
    try {
        const token = req.query.token as string;

        if (!token) {
            return res.status(400).json({ success: false, error: 'Token is required' });
        }

        const details = await orgTeamService.getInvitationByToken(token);

        if (!details) {
            return res.status(404).json({ success: false, error: 'Invitation not found' });
        }

        res.json({
            success: true,
            data: details,
        });
    } catch (error: any) {
        logger.error('Error fetching invitation details', { error: error.message });
        res.status(500).json({ success: false, error: 'Failed to fetch invitation details' });
    }
});

/**
 * POST /invitations/accept-and-setup
 * Public endpoint — accept an invitation AND set password in one step.
 * Creates local user + Keycloak account.  Does NOT require prior authentication.
 */
router.post('/invitations/accept-and-setup', async (req: Request, res: Response) => {
    try {
        const { token, password, firstName, lastName } = req.body;

        if (!token) {
            return res.status(400).json({ success: false, error: 'Invitation token is required' });
        }
        if (!password || password.length < 8) {
            return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
        }

        const result = await orgTeamService.acceptAndSetupPassword(token, password, firstName, lastName);

        res.json({
            success: true,
            data: {
                user: {
                    id: result.user.id,
                    email: result.user.email,
                    firstName: result.user.first_name,
                    lastName: result.user.last_name,
                    displayName: result.user.display_name,
                    role: result.user.role,
                    organizationId: result.user.organization_id,
                },
                invitation: result.invitation,
            },
            message: 'Account created successfully. You can now sign in.',
        });
    } catch (error: any) {
        logger.error('Error accepting invitation with password setup', { error: error.message });
        const status = error.message.includes('expired') ? 410
            : error.message.includes('Invalid') ? 404
            : 500;
        res.status(status).json({
            success: false,
            error: error.message || 'Failed to set up account',
        });
    }
});

// ============================================================================
// AUTHENTICATED ENDPOINTS (all routes below require a valid JWT)
// ============================================================================

router.use(authenticate);

// ============================================================================
// ROLE METADATA
// ============================================================================

/**
 * GET /roles
 * Get all available roles with display metadata (for dropdowns, badges, etc.)
 */
router.get('/roles', async (_req: Request, res: Response) => {
    try {
        const { pool } = await import('../database');
        const result = await pool.query(
            `SELECT role_name, display_name, description, category, hierarchy_level,
                    is_invitable, requires_credentials, color_theme, icon
             FROM role_metadata
             ORDER BY hierarchy_level ASC`
        );

        if (result.rows.length === 0) {
            // Fallback if migration hasn't run yet
            return res.json({
                success: true,
                data: [...VALID_ORG_ROLES].map(r => ({
                    roleName: r,
                    displayName: r.toUpperCase().replace(/_/g, ' '),
                    description: '',
                    category: 'general',
                    hierarchyLevel: 50,
                    isInvitable: r !== 'super_admin' && r !== 'viewer',
                    requiresCredentials: false,
                    colorTheme: 'zinc',
                    icon: 'User',
                })),
            });
        }

        res.json({
            success: true,
            data: result.rows.map((r: any) => ({
                roleName: r.role_name,
                displayName: r.display_name,
                description: r.description,
                category: r.category,
                hierarchyLevel: r.hierarchy_level,
                isInvitable: r.is_invitable,
                requiresCredentials: r.requires_credentials,
                colorTheme: r.color_theme,
                icon: r.icon,
            })),
        });
    } catch (error: any) {
        logger.error('Error fetching role metadata', { error: error.message });
        // Return inline fallback
        res.json({
            success: true,
            data: [...VALID_ORG_ROLES].map(r => ({
                roleName: r,
                displayName: r.toUpperCase().replace(/_/g, ' '),
                category: 'general',
                hierarchyLevel: 50,
                isInvitable: r !== 'super_admin',
                colorTheme: 'zinc',
                icon: 'User',
            })),
        });
    }
});

// ============================================================================
// INVITATIONS
// ============================================================================

/**
 * POST /invitations
 * Invite a user to the organization
 */
router.post('/invitations', authorize('team', 'manage'), async (req: Request, res: Response) => {
    try {
        const { email, role, message, firstName, lastName } = req.body;
        const organizationId = (req as any).user?.organizationId || req.headers['x-organization-id'] as string;
        const invitedBy = (req as any).user?.id || req.headers['x-user-id'] as string;

        if (!organizationId) {
            return res.status(400).json({ success: false, error: 'Organization ID required' });
        }

        if (!email) {
            return res.status(400).json({ success: false, error: 'Email is required' });
        }

        const invitation = await orgTeamService.inviteUser({
            organizationId,
            email,
            role: role || 'agent',
            invitedBy,
            message,
            firstName,
            lastName,
        });

        res.status(201).json({
            success: true,
            data: invitation,
        });
    } catch (error: any) {
        logger.error('Error creating invitation', { error: error.message });
        res.status(error.message.includes('already') ? 409 : 500).json({
            success: false,
            error: error.message || 'Failed to create invitation',
        });
    }
});

/**
 * GET /invitations
 * List invitations for the organization
 */
router.get('/invitations', async (req: Request, res: Response) => {
    try {
        const organizationId = (req as any).user?.organizationId || req.headers['x-organization-id'] as string;
        const status = req.query.status as string | undefined;

        if (!organizationId) {
            return res.status(400).json({ success: false, error: 'Organization ID required' });
        }

        const invitations = await orgTeamService.listInvitations(
            organizationId,
            status as any
        );

        res.json({
            success: true,
            data: invitations,
        });
    } catch (error: any) {
        logger.error('Error listing invitations', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to list invitations',
        });
    }
});

/**
 * DELETE /invitations/:id
 * Revoke a pending invitation
 */
router.delete('/invitations/:id', authorize('team', 'manage'), async (req: Request, res: Response) => {
    try {
        await orgTeamService.revokeInvitation(req.params.id);

        res.json({
            success: true,
            message: 'Invitation revoked',
        });
    } catch (error: any) {
        logger.error('Error revoking invitation', { error: error.message });
        res.status(404).json({
            success: false,
            error: error.message || 'Failed to revoke invitation',
        });
    }
});

/**
 * POST /invitations/:id/resend
 * Resend an invitation (extend expiry)
 */
router.post('/invitations/:id/resend', async (req: Request, res: Response) => {
    try {
        const invitation = await orgTeamService.resendInvitation(req.params.id);

        res.json({
            success: true,
            data: invitation,
        });
    } catch (error: any) {
        logger.error('Error resending invitation', { error: error.message });
        res.status(404).json({
            success: false,
            error: error.message || 'Failed to resend invitation',
        });
    }
});

/**
 * POST /invitations/accept
 * Accept an invitation using token (for already-authenticated users)
 */
router.post('/invitations/accept', async (req: Request, res: Response) => {
    try {
        const { token } = req.body;
        const userId = (req as any).user?.id || req.headers['x-user-id'] as string;

        if (!token) {
            return res.status(400).json({ success: false, error: 'Invitation token is required' });
        }

        const invitation = await orgTeamService.acceptInvitation(token, userId);

        res.json({
            success: true,
            data: invitation,
        });
    } catch (error: any) {
        logger.error('Error accepting invitation', { error: error.message });
        res.status(400).json({
            success: false,
            error: error.message || 'Failed to accept invitation',
        });
    }
});

// ============================================================================
// ORGANIZATION MEMBERS
// ============================================================================

/**
 * GET /members
 * List all organization members
 */
router.get('/members', async (req: Request, res: Response) => {
    try {
        const organizationId = (req as any).user?.organizationId || req.headers['x-organization-id'] as string;

        if (!organizationId) {
            return res.status(400).json({ success: false, error: 'Organization ID required' });
        }

        const members = await orgTeamService.listOrgMembers(organizationId);

        res.json({
            success: true,
            data: members,
            total: members.length,
        });
    } catch (error: any) {
        logger.error('Error listing members', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to list members',
        });
    }
});

/**
 * PUT /members/:id/role
 * Update a member's role
 */
router.put('/members/:id/role', authorize('team', 'manage'), async (req: Request, res: Response) => {
    try {
        const organizationId = (req as any).user?.organizationId || req.headers['x-organization-id'] as string;
        const { role } = req.body;

        if (!organizationId) {
            return res.status(400).json({ success: false, error: 'Organization ID required' });
        }

        if (!role) {
            return res.status(400).json({ success: false, error: 'Role is required' });
        }

        const member = await orgTeamService.updateMemberRole(req.params.id, role, organizationId);

        res.json({
            success: true,
            data: member,
        });
    } catch (error: any) {
        logger.error('Error updating member role', { error: error.message });
        res.status(404).json({
            success: false,
            error: error.message || 'Failed to update member role',
        });
    }
});

/**
 * DELETE /members/:id
 * Remove a member from the organization
 */
router.delete('/members/:id', authorize('team', 'manage'), async (req: Request, res: Response) => {
    try {
        const organizationId = (req as any).user?.organizationId || req.headers['x-organization-id'] as string;

        if (!organizationId) {
            return res.status(400).json({ success: false, error: 'Organization ID required' });
        }

        await orgTeamService.removeMember(req.params.id, organizationId);

        res.json({
            success: true,
            message: 'Member removed',
        });
    } catch (error: any) {
        logger.error('Error removing member', { error: error.message });
        res.status(404).json({
            success: false,
            error: error.message || 'Failed to remove member',
        });
    }
});

// ============================================================================
// VALUATION TEAM ASSIGNMENTS
// ============================================================================

/**
 * POST /valuations/:id/team
 * Assign a user to a valuation engagement
 */
router.post('/valuations/:id/team', async (req: Request, res: Response) => {
    try {
        const { userId, teamRole, notes } = req.body;
        const assignedBy = (req as any).user?.id || req.headers['x-user-id'] as string;

        if (!userId || !teamRole) {
            return res.status(400).json({ success: false, error: 'userId and teamRole are required' });
        }

        const member = await orgTeamService.assignToValuation({
            valuationId: req.params.id,
            userId,
            teamRole,
            assignedBy,
            notes,
        });

        res.status(201).json({
            success: true,
            data: member,
        });
    } catch (error: any) {
        logger.error('Error assigning team member', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to assign team member',
        });
    }
});

/**
 * GET /valuations/:id/team
 * Get the team assigned to a valuation
 */
router.get('/valuations/:id/team', async (req: Request, res: Response) => {
    try {
        const team = await orgTeamService.getValuationTeam(req.params.id);

        res.json({
            success: true,
            data: team,
        });
    } catch (error: any) {
        logger.error('Error getting valuation team', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to get valuation team',
        });
    }
});

/**
 * DELETE /valuations/:vid/team/:uid
 * Remove a user from a valuation
 */
router.delete('/valuations/:vid/team/:uid', async (req: Request, res: Response) => {
    try {
        await orgTeamService.removeFromValuation(req.params.vid, req.params.uid);

        res.json({
            success: true,
            message: 'Team member removed from valuation',
        });
    } catch (error: any) {
        logger.error('Error removing from valuation team', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to remove team member',
        });
    }
});

export default router;
