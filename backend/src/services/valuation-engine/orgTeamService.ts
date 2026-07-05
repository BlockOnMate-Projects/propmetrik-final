/**
 * Organization Team Service
 * Valuation Service Enhancement — RBAC & Team Management
 *
 * Handles:
 * - Organization member invitations (B2B model)
 * - Invitation acceptance / revocation
 * - Org member listing & role management
 * - Valuation-specific team assignments
 *
 * @module services/valuation-engine/orgTeamService
 */

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { pool } from '../../database';
import config from '../../config';
import { logger } from '../../utils/logger';
import { notificationService } from '../../../shared-services/notifications/unified';
import { keycloakAdminService } from '../keycloakAdminService';

const frontendUrl = config.app.frontendUrl.replace(/\/$/, '');

// ============================================================================
// TYPES
// ============================================================================

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';
export type ValuationTeamRole = 'lead_valuer' | 'valuer' | 'reviewer' | 'trainee' | 'inspector';

/** All valid org-level roles (user_role_enum values) */
export type OrgRole =
  | 'super_admin' | 'firm_principal' | 'admin' | 'senior_valuer'
  | 'manager' | 'valuer' | 'finance_manager' | 'compliance_officer'
  | 'agent' | 'probationer' | 'inspector' | 'analyst' | 'viewer';

/** Validated set of all org-level roles for input validation */
export const VALID_ORG_ROLES: ReadonlySet<string> = new Set<string>([
  'super_admin', 'firm_principal', 'admin', 'senior_valuer',
  'manager', 'valuer', 'finance_manager', 'compliance_officer',
  'agent', 'probationer', 'inspector', 'analyst', 'viewer',
]);

/** Roles that non-super_admin users can invite (cannot invite super_admin) */
export const INVITABLE_ROLES: ReadonlySet<string> = new Set<string>([
  'firm_principal', 'admin', 'senior_valuer', 'manager', 'valuer',
  'finance_manager', 'compliance_officer', 'agent', 'probationer',
  'inspector', 'analyst', 'viewer',
]);

export interface OrgInvitation {
    id: string;
    organizationId: string;
    email: string;
    role: string;
    invitationToken: string;
    status: InvitationStatus;
    invitedBy: string;
    invitedByName?: string;
    message: string | null;
    expiresAt: Date;
    acceptedBy: string | null;
    acceptedAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface OrgMember {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    displayName: string;
    role: string;
    status: string;
    organizationId: string;
    createdAt: Date;
    lastLoginAt: Date | null;
}

export interface ValuationTeamMember {
    id: string;
    valuationId: string;
    userId: string;
    userName?: string;
    userEmail?: string;
    teamRole: ValuationTeamRole;
    isActive: boolean;
    assignedBy: string | null;
    assignedAt: Date;
    notes: string | null;
}

export interface CreateInvitationInput {
    organizationId: string;
    email: string;
    role: string;
    invitedBy: string;
    message?: string;
    firstName?: string;
    lastName?: string;
}

export interface AssignTeamMemberInput {
    valuationId: string;
    userId: string;
    teamRole: ValuationTeamRole;
    assignedBy: string;
    notes?: string;
}

// ============================================================================
// SERVICE
// ============================================================================

class OrgTeamService {

    // --------------------------------------------------------------------------
    // INVITATIONS
    // --------------------------------------------------------------------------

    /**
     * Create a new organization invitation
     */
    async inviteUser(input: CreateInvitationInput): Promise<OrgInvitation> {
        const { organizationId, email, role, invitedBy, message, firstName, lastName } = input;

        // Validate role against known enum values
        if (!VALID_ORG_ROLES.has(role)) {
            throw new Error(`Invalid role: ${role}. Valid roles: ${[...INVITABLE_ROLES].join(', ')}`);
        }
        if (!INVITABLE_ROLES.has(role)) {
            throw new Error(`Role '${role}' cannot be assigned via invitation`);
        }

        // Check for existing pending invitation
        const existing = await pool.query(
            `SELECT id FROM org_invitations 
       WHERE organization_id = $1 AND email = $2 AND status = 'pending'`,
            [organizationId, email]
        );

        if (existing.rows.length > 0) {
            throw new Error('A pending invitation already exists for this email');
        }

        // Check if user is already an org member
        const existingMember = await pool.query(
            `SELECT id FROM users WHERE email = $1 AND organization_id = $2`,
            [email, organizationId]
        );

        if (existingMember.rows.length > 0) {
            throw new Error('This user is already a member of the organization');
        }

        const id = uuidv4();
        const token = crypto.randomBytes(32).toString('hex');

        const result = await pool.query(
            `INSERT INTO org_invitations (id, organization_id, email, role, invitation_token, invited_by, message, first_name, last_name)
       VALUES ($1, $2, $3, $4::user_role_enum, $5, $6, $7, $8, $9)
       RETURNING *`,
            [id, organizationId, email.toLowerCase(), role, token, invitedBy, message || null, firstName || null, lastName || null]
        );

        const invitation = this.mapInvitation(result.rows[0]);

        // --- Keycloak user provision + invitation email (async, non-blocking) ---
        (async () => {
            try {
                // Provision Keycloak user (idempotent — won't duplicate)
                const kcUser = await keycloakAdminService.ensureUser(
                    email.toLowerCase(),
                    firstName || email.split('@')[0],
                    lastName || '',
                    { emailVerified: true, requiredActions: ['UPDATE_PASSWORD'] },
                );

                logger.info('Keycloak user ensured for team invite', {
                    email,
                    keycloakUserId: kcUser.id,
                    created: kcUser.created,
                });

                // Fetch inviter's name + org name for the email
                const inviterResult = await pool.query(
                    `SELECT u.display_name, o.name as org_name
                     FROM users u
                     LEFT JOIN organizations o ON o.id = u.organization_id
                     WHERE u.id = $1`,
                    [invitedBy]
                );
                const inviterName = inviterResult.rows[0]?.display_name || 'A team member';
                const orgName = inviterResult.rows[0]?.org_name || 'your organization';

                // Send invitation email
                await this.sendInvitationEmail(email.toLowerCase(), token, {
                    inviterName,
                    organizationName: orgName,
                    role,
                    message,
                    inviteeName: firstName ? `${firstName}${lastName ? ' ' + lastName : ''}`.trim() : undefined,
                });
            } catch (err: any) {
                logger.error(`Background Keycloak/email provisioning failed for invite: ${err.message}`, {
                    email,
                    error: err.message,
                    stack: err.stack,
                    response: err.response?.data,
                });
                // Non-fatal — invitation record exists and can be resent
            }
        })();

        logger.info('Organization invitation created', { id, email, organizationId, role });

        return invitation;
    }

    /**
     * Accept an invitation via token
     */
    async acceptInvitation(token: string, userId?: string): Promise<OrgInvitation> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Find the invitation
            const invResult = await client.query(
                `SELECT * FROM org_invitations WHERE invitation_token = $1 AND status = 'pending'`,
                [token]
            );

            if (invResult.rows.length === 0) {
                throw new Error('Invalid or expired invitation');
            }

            const invitation = invResult.rows[0];

            // Check expiry
            if (new Date(invitation.expires_at) < new Date()) {
                await client.query(
                    `UPDATE org_invitations SET status = 'expired', updated_at = NOW() WHERE id = $1`,
                    [invitation.id]
                );
                await client.query('COMMIT');
                throw new Error('Invitation has expired');
            }

            let acceptedUserId = userId;

            // If no userId supplied, check if user with this email exists
            if (!acceptedUserId) {
                const userResult = await client.query(
                    `SELECT id FROM users WHERE email = $1`,
                    [invitation.email]
                );

                if (userResult.rows.length > 0) {
                    acceptedUserId = userResult.rows[0].id;
                }
            }

            // Update user's organization if they exist. user_type is derived from
            // the org being joined (platform → staff, else customer) so a customer
            // org can never produce a 'staff' user via this legacy invite path.
            if (acceptedUserId) {
                const platformCheck = await client.query(
                    `SELECT is_platform_org FROM organizations WHERE id = $1`,
                    [invitation.organization_id]
                );
                const effectiveUserType = platformCheck.rows[0]?.is_platform_org ? 'staff' : 'customer';
                await client.query(
                    `UPDATE users SET organization_id = $1, role = $2::user_role_enum, user_type = $4, updated_at = NOW()
           WHERE id = $3`,
                    [invitation.organization_id, invitation.role, acceptedUserId, effectiveUserType]
                );
            }

            // Mark invitation as accepted
            const updated = await client.query(
                `UPDATE org_invitations 
         SET status = 'accepted', accepted_by = $1, accepted_at = NOW(), updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
                [acceptedUserId, invitation.id]
            );

            await client.query('COMMIT');

            logger.info('Invitation accepted', { invitationId: invitation.id, userId: acceptedUserId });

            return this.mapInvitation(updated.rows[0]);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Revoke a pending invitation
     */
    async revokeInvitation(invitationId: string): Promise<void> {
        const result = await pool.query(
            `UPDATE org_invitations SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING id`,
            [invitationId]
        );

        if (result.rows.length === 0) {
            throw new Error('Invitation not found or already processed');
        }

        logger.info('Invitation revoked', { invitationId });
    }

    /**
     * List invitations for an organization
     */
    async listInvitations(organizationId: string, status?: InvitationStatus): Promise<OrgInvitation[]> {
        let query = `
      SELECT oi.*, u.display_name as invited_by_name
      FROM org_invitations oi
      LEFT JOIN users u ON u.id = oi.invited_by
      WHERE oi.organization_id = $1
    `;
        const params: any[] = [organizationId];

        if (status) {
            query += ` AND oi.status = $2`;
            params.push(status);
        }

        query += ` ORDER BY oi.created_at DESC`;

        const result = await pool.query(query, params);
        return result.rows.map((r: any) => this.mapInvitation(r));
    }

    /**
     * Resend an invitation (update expiry)
     */
    async resendInvitation(invitationId: string): Promise<OrgInvitation> {
        const result = await pool.query(
            `UPDATE org_invitations 
       SET expires_at = NOW() + INTERVAL '7 days', updated_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
            [invitationId]
        );

        if (result.rows.length === 0) {
            throw new Error('Invitation not found or already processed');
        }

        const invitation = this.mapInvitation(result.rows[0]);

        // Re-send the email (async, non-blocking)
        (async () => {
            try {
                const inviterResult = await pool.query(
                    `SELECT u.display_name, o.name as org_name
                     FROM users u
                     LEFT JOIN organizations o ON o.id = u.organization_id
                     WHERE u.id = $1`,
                    [invitation.invitedBy]
                );
                const inviterName = inviterResult.rows[0]?.display_name || 'A team member';
                const orgName = inviterResult.rows[0]?.org_name || 'your organization';

                await this.sendInvitationEmail(invitation.email, invitation.invitationToken, {
                    inviterName,
                    organizationName: orgName,
                    role: invitation.role,
                    message: invitation.message,
                });
            } catch (err: any) {
                logger.error('Failed to resend invitation email', { invitationId, error: err.message });
            }
        })();

        return invitation;
    }

    // --------------------------------------------------------------------------
    // ORGANIZATION MEMBERS
    // --------------------------------------------------------------------------

    /**
     * List all members of an organization
     */
    async listOrgMembers(organizationId: string): Promise<OrgMember[]> {
        const result = await pool.query(
            `SELECT id, email, first_name, last_name, display_name, role, status, 
              organization_id, created_at, last_login_at
       FROM users 
       WHERE organization_id = $1 AND status = 'active'
       ORDER BY display_name ASC`,
            [organizationId]
        );

        return result.rows.map((r: any) => ({
            id: r.id,
            email: r.email,
            firstName: r.first_name,
            lastName: r.last_name,
            displayName: r.display_name,
            role: r.role,
            status: r.status,
            organizationId: r.organization_id,
            createdAt: r.created_at,
            lastLoginAt: r.last_login_at,
        }));
    }

    /**
     * Update a member's role
     */
    async updateMemberRole(userId: string, newRole: string, organizationId: string): Promise<OrgMember> {
        const result = await pool.query(
            `UPDATE users SET role = $1::user_role_enum, updated_at = NOW()
       WHERE id = $2 AND organization_id = $3
       RETURNING id, email, first_name, last_name, display_name, role, status, organization_id, created_at, last_login_at`,
            [newRole, userId, organizationId]
        );

        if (result.rows.length === 0) {
            throw new Error('Member not found in this organization');
        }

        const r = result.rows[0];
        logger.info('Member role updated', { userId, newRole, organizationId });

        return {
            id: r.id,
            email: r.email,
            firstName: r.first_name,
            lastName: r.last_name,
            displayName: r.display_name,
            role: r.role,
            status: r.status,
            organizationId: r.organization_id,
            createdAt: r.created_at,
            lastLoginAt: r.last_login_at,
        };
    }

    /**
     * Remove a member from organization (deactivate)
     */
    async removeMember(userId: string, organizationId: string): Promise<void> {
        const result = await pool.query(
            `UPDATE users SET status = 'deactivated', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING id`,
            [userId, organizationId]
        );

        if (result.rows.length === 0) {
            throw new Error('Member not found in this organization');
        }

        logger.info('Member removed from organization', { userId, organizationId });
    }

    // --------------------------------------------------------------------------
    // VALUATION TEAM ASSIGNMENTS
    // --------------------------------------------------------------------------

    /**
     * Assign a user to a valuation engagement
     */
    async assignToValuation(input: AssignTeamMemberInput): Promise<ValuationTeamMember> {
        const { valuationId, userId, teamRole, assignedBy, notes } = input;

        const id = uuidv4();

        const result = await pool.query(
            `INSERT INTO valuation_team_members (id, valuation_id, user_id, team_role, assigned_by, notes)
       VALUES ($1, $2, $3, $4::valuation_team_role, $5, $6)
       ON CONFLICT (valuation_id, user_id) 
       DO UPDATE SET team_role = $4::valuation_team_role, is_active = TRUE, 
                     assigned_by = $5, notes = $6, updated_at = NOW()
       RETURNING *`,
            [id, valuationId, userId, teamRole, assignedBy, notes || null]
        );

        logger.info('User assigned to valuation', { valuationId, userId, teamRole });

        return this.mapTeamMember(result.rows[0]);
    }

    /**
     * Remove a user from a valuation engagement
     */
    async removeFromValuation(valuationId: string, userId: string): Promise<void> {
        await pool.query(
            `UPDATE valuation_team_members SET is_active = FALSE, removed_at = NOW(), updated_at = NOW()
       WHERE valuation_id = $1 AND user_id = $2`,
            [valuationId, userId]
        );

        logger.info('User removed from valuation', { valuationId, userId });
    }

    /**
     * Get team members for a valuation
     */
    async getValuationTeam(valuationId: string): Promise<ValuationTeamMember[]> {
        const result = await pool.query(
            `SELECT vtm.*, u.display_name as user_name, u.email as user_email
       FROM valuation_team_members vtm
       JOIN users u ON u.id = vtm.user_id
       WHERE vtm.valuation_id = $1 AND vtm.is_active = TRUE
       ORDER BY 
         CASE vtm.team_role 
           WHEN 'lead_valuer' THEN 1 
           WHEN 'reviewer' THEN 2 
           WHEN 'valuer' THEN 3 
           WHEN 'inspector' THEN 4 
           WHEN 'trainee' THEN 5 
         END`,
            [valuationId]
        );

        return result.rows.map((r: any) => this.mapTeamMember(r));
    }

    // --------------------------------------------------------------------------
    // KEYCLOAK INTEGRATION — delegated to centralized KeycloakAdminService
    // --------------------------------------------------------------------------

    // --------------------------------------------------------------------------
    // INVITATION EMAIL
    // --------------------------------------------------------------------------

    /**
     * Send a branded invitation email via the unified notification service.
     */
    private async sendInvitationEmail(
        email: string,
        token: string,
        context: {
            inviterName: string;
            organizationName: string;
            role: string;
            message?: string | null;
            inviteeName?: string;
        }
    ): Promise<void> {
        try {
            const acceptUrl = `${frontendUrl}/accept-invite?token=${token}`;
            const roleDisplay = context.role.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
            const greeting = context.inviteeName ? `Hello ${context.inviteeName.split(' ')[0]},` : 'Hello,';

            const result = await notificationService.sendEmail({
                to: email,
                subject: `You're Invited to Join ${context.organizationName} on PROPMETRIK`,
                html: `
                    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
                        <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 32px 24px; border-radius: 12px 12px 0 0; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">
                                Join ${context.organizationName}
                            </h1>
                            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">
                                PROPMETRIK — Real Estate Intelligence Platform
                            </p>
                        </div>

                        <div style="background: #ffffff; padding: 32px 24px; border: 1px solid #e2e8f0; border-top: none;">
                            <p style="font-size: 16px; margin-top: 0;">${greeting}</p>

                            <p style="font-size: 15px; line-height: 1.6;">
                                <strong>${context.inviterName}</strong> has invited you to join
                                <strong>${context.organizationName}</strong> as a
                                <strong>${roleDisplay}</strong>.
                            </p>

                            ${context.message ? `
                            <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
                                <p style="margin: 0; font-size: 14px; color: #92400e; font-style: italic;">"${context.message}"</p>
                            </div>
                            ` : ''}

                            <p style="font-size: 15px; line-height: 1.6;">
                                Click the button below to set up your password and get started:
                            </p>

                            <div style="text-align: center; margin: 28px 0;">
                                <a href="${acceptUrl}"
                                   style="background: linear-gradient(135deg, #f59e0b, #d97706); color: #ffffff; padding: 14px 36px; text-decoration: none; display: inline-block; border-radius: 8px; font-weight: 700; font-size: 16px; letter-spacing: 0.5px;">
                                    Accept Invitation &amp; Set Password
                                </a>
                            </div>

                            <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
                                Or copy and paste this link into your browser:<br/>
                                <a href="${acceptUrl}" style="color: #f59e0b; word-break: break-all;">${acceptUrl}</a>
                            </p>

                            <p style="font-size: 13px; color: #94a3b8; margin-top: 24px;">
                                This invitation expires in 7 days. If you did not expect this invitation, you can safely ignore this email.
                            </p>
                        </div>

                        <div style="background: #f8fafc; padding: 16px 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; text-align: center;">
                            <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                                &copy; ${new Date().getFullYear()} PROPMETRIK &mdash; Real Estate Intelligence for Africa
                            </p>
                        </div>
                    </div>
                `,
                text: `${context.inviterName} has invited you to join ${context.organizationName} as a ${roleDisplay} on PROPMETRIK. Accept your invitation and set up your password: ${acceptUrl} — This link expires in 7 days.`,
            });

            if (!result.success) {
                logger.error('Invitation email send returned failure', { email, error: result.error });
            } else {
                logger.info('Team invitation email sent', { email, organizationName: context.organizationName, messageId: result.messageId });
            }
        } catch (error: any) {
            logger.error('Failed to send team invitation email', { email, error: error.message });
            // Don't throw — invitation record still exists, can be resent
        }
    }

    // --------------------------------------------------------------------------
    // ACCEPT & SET UP PASSWORD
    // --------------------------------------------------------------------------

    /**
     * Accept an invitation AND set the user's password in one step.
     * Creates the local `users` record if it doesn't exist, provisions Keycloak, sets password.
     */
    async acceptAndSetupPassword(
        token: string,
        password: string,
        firstName?: string,
        lastName?: string
    ): Promise<{ user: any; invitation: OrgInvitation }> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1) Find the invitation
            const invResult = await client.query(
                `SELECT oi.*, o.name as organization_name
                 FROM org_invitations oi
                 LEFT JOIN organizations o ON o.id = oi.organization_id
                 WHERE oi.invitation_token = $1 AND oi.status = 'pending'`,
                [token]
            );

            if (invResult.rows.length === 0) {
                throw new Error('Invalid or expired invitation');
            }

            const inv = invResult.rows[0];

            if (new Date(inv.expires_at) < new Date()) {
                await client.query(
                    `UPDATE org_invitations SET status = 'expired', updated_at = NOW() WHERE id = $1`,
                    [inv.id]
                );
                await client.query('COMMIT');
                throw new Error('Invitation has expired');
            }

            // 2) Provision Keycloak user
            const kcUser = await keycloakAdminService.ensureUser(
                inv.email,
                firstName || inv.email.split('@')[0],
                lastName || '',
                { emailVerified: true, requiredActions: ['UPDATE_PASSWORD'] },
            );

            // 3) Set the password in Keycloak
            await keycloakAdminService.setPassword(kcUser.id, password);

            // 3b) Hash password for local DB auth
            const passwordHash = await bcrypt.hash(password, 12);

            // 4) Ensure local `users` row
            let userId: string;
            const existingUser = await client.query(
                `SELECT id FROM users WHERE email = $1`,
                [inv.email]
            );

            if (existingUser.rows.length > 0) {
                userId = existingUser.rows[0].id;
                // Update organization + role + password
                await client.query(
                    `UPDATE users
                     SET organization_id = $1, role = $2::user_role_enum,
                         keycloak_id = $3, password_hash = $4, status = 'active', updated_at = NOW()
                     WHERE id = $5`,
                    [inv.organization_id, inv.role, kcUser.id, passwordHash, userId]
                );
            } else {
                userId = uuidv4();
                await client.query(
                    `INSERT INTO users (id, email, password_hash, first_name, last_name, display_name, role, organization_id, keycloak_id, status, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7::user_role_enum, $8, $9, 'active', NOW(), NOW())`,
                    [
                        userId,
                        inv.email,
                        passwordHash,
                        firstName || inv.email.split('@')[0],
                        lastName || '',
                        [firstName || inv.email.split('@')[0], lastName || ''].filter(Boolean).join(' '),
                        inv.role,
                        inv.organization_id,
                        kcUser.id,
                    ]
                );
            }

            // 5) Mark invitation as accepted
            const updated = await client.query(
                `UPDATE org_invitations
                 SET status = 'accepted', accepted_by = $1, accepted_at = NOW(), updated_at = NOW()
                 WHERE id = $2
                 RETURNING *`,
                [userId, inv.id]
            );

            await client.query('COMMIT');

            logger.info('Invitation accepted with password setup', {
                invitationId: inv.id,
                userId,
                keycloakUserId: kcUser.id,
                keycloakUserCreated: kcUser.created,
                organizationId: inv.organization_id,
            });

            // Fetch the user for the response
            const userResult = await pool.query(
                `SELECT id, email, first_name, last_name, display_name, role, organization_id, status
                 FROM users WHERE id = $1`,
                [userId]
            );

            return {
                user: userResult.rows[0],
                invitation: this.mapInvitation(updated.rows[0]),
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Look up invitation details by token (public — for the accept-invite page)
     */
    async getInvitationByToken(token: string): Promise<{
        email: string;
        role: string;
        organizationName: string;
        inviterName: string;
        expiresAt: Date;
        status: InvitationStatus;
    } | null> {
        const result = await pool.query(
            `SELECT oi.email, oi.role, oi.status, oi.expires_at,
                    o.name as organization_name,
                    u.display_name as inviter_name
             FROM org_invitations oi
             LEFT JOIN organizations o ON o.id = oi.organization_id
             LEFT JOIN users u ON u.id = oi.invited_by
             WHERE oi.invitation_token = $1`,
            [token]
        );

        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        return {
            email: row.email,
            role: row.role,
            organizationName: row.organization_name || 'Unknown Organization',
            inviterName: row.inviter_name || 'A team member',
            expiresAt: row.expires_at,
            status: row.status,
        };
    }

    // --------------------------------------------------------------------------
    // HELPERS
    // --------------------------------------------------------------------------

    private mapInvitation(row: any): OrgInvitation {
        return {
            id: row.id,
            organizationId: row.organization_id,
            email: row.email,
            role: row.role,
            invitationToken: row.invitation_token,
            status: row.status,
            invitedBy: row.invited_by,
            invitedByName: row.invited_by_name || undefined,
            message: row.message,
            expiresAt: row.expires_at,
            acceptedBy: row.accepted_by,
            acceptedAt: row.accepted_at,
            revokedAt: row.revoked_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    private mapTeamMember(row: any): ValuationTeamMember {
        return {
            id: row.id,
            valuationId: row.valuation_id,
            userId: row.user_id,
            userName: row.user_name || undefined,
            userEmail: row.user_email || undefined,
            teamRole: row.team_role,
            isActive: row.is_active,
            assignedBy: row.assigned_by,
            assignedAt: row.assigned_at,
            notes: row.notes,
        };
    }
}

export const orgTeamService = new OrgTeamService();
export default orgTeamService;
