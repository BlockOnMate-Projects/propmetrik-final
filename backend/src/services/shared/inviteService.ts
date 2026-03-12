/**
 * InviteService - Unified Invitation System
 *
 * Consolidates org team invitations + tenant portal invitations into
 * a single service backed by the `unified_invitations` table.
 *
 * Supports both staff invitations (org team members) and customer
 * invitations (tenants / property owners).
 *
 * @module services/shared/inviteService
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../database';
import config from '../../config';
import { logger } from '../../utils/logger';
import { keycloakAdminService } from '../keycloakAdminService';
import { notificationService } from '../../../shared-services/notifications/unified';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const frontendUrl = (config.app.frontendUrl || 'http://localhost:3000').replace(/\/$/, '');

const INVITABLE_ROLES = new Set([
  'firm_principal', 'admin', 'senior_valuer', 'manager',
  'project_manager', 'valuer', 'finance_manager', 'compliance_officer',
  'agent', 'probationer', 'inspector', 'analyst', 'viewer',
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InvitationStatus = 'pending' | 'accepted' | 'cancelled' | 'expired';
export type InviteUserType = 'staff' | 'customer';

export interface CreateInvitationInput {
  email: string;
  role: string;
  userType: InviteUserType;
  organizationId: string;
  invitedById: string;
  firstName?: string;
  lastName?: string;
  message?: string;
  propertyId?: string;
  tenancyId?: string;
  department?: string;
  teamId?: string;
  expiryDays?: number;
  skipKeycloak?: boolean;
  serviceKey?: string;    // which service the customer is being invited to
  serviceRole?: string;   // their role in that service (defaults to 'service_admin')
}

export interface AcceptInvitationInput {
  token: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface Invitation {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  userType: InviteUserType;
  organizationId: string;
  invitedById: string;
  invitedByName?: string;
  organizationName?: string;
  token: string;
  status: InvitationStatus;
  personalMessage: string | null;
  propertyId: string | null;
  tenancyId: string | null;
  department: string | null;
  serviceKey: string | null;
  serviceRole: string | null;
  keycloakProvisioned: boolean;
  emailSentAt: Date | null;
  acceptedAt: Date | null;
  cancelledAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvitationDetails {
  email: string;
  role: string;
  userType: InviteUserType;
  organizationName: string;
  inviterName: string;
  expiresAt: Date;
  status: InvitationStatus;
}

export interface AcceptResult {
  userId: string;
  redirectUrl: string;
}

export interface BulkInviteResult {
  succeeded: Array<{ email: string; invitationId: string }>;
  failed: Array<{ email: string; error: string }>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class InviteService {

  // =========================================================================
  // CREATE INVITATION
  // =========================================================================

  async createInvitation(input: CreateInvitationInput): Promise<Invitation> {
    const {
      email,
      role,
      userType,
      organizationId,
      invitedById,
      firstName,
      lastName,
      message,
      propertyId,
      tenancyId,
      department,
      teamId,
      expiryDays = 7,
      skipKeycloak = false,
    } = input;

    const normalizedEmail = email.toLowerCase().trim();

    // 1) Validate role
    if (!INVITABLE_ROLES.has(role)) {
      throw Object.assign(
        new Error(`Invalid role: ${role}. Must be one of: ${[...INVITABLE_ROLES].join(', ')}`),
        { statusCode: 400 },
      );
    }

    // Validate customer service role
    if (input.userType === 'customer') {
      if (!input.serviceKey) {
        throw new Error('serviceKey is required for customer invitations');
      }
      const serviceRole = input.serviceRole || 'service_admin';

      // Validate role is valid for the service
      const roleCheck = await pool.query(
        'SELECT 1 FROM customer_service_role_config WHERE service_key = $1 AND service_role = $2',
        [input.serviceKey, serviceRole]
      );
      if (roleCheck.rows.length === 0) {
        throw new Error(`Role '${serviceRole}' is not valid for service '${input.serviceKey}'`);
      }
    }

    // 2) Check for existing pending invitation
    const existing = await pool.query(
      `SELECT id FROM unified_invitations
       WHERE email = $1 AND organization_id = $2 AND status = 'pending'`,
      [normalizedEmail, organizationId],
    );

    if (existing.rows.length > 0) {
      throw Object.assign(
        new Error('A pending invitation already exists for this email'),
        { statusCode: 409 },
      );
    }

    // 3) Check if user is already an org member
    const existingMember = await pool.query(
      `SELECT id FROM users WHERE email = $1 AND organization_id = $2`,
      [normalizedEmail, organizationId],
    );

    if (existingMember.rows.length > 0) {
      throw Object.assign(
        new Error('This user is already a member of the organization'),
        { statusCode: 409 },
      );
    }

    // 4) Provision Keycloak user (synchronous, before DB insert)
    let keycloakUserId: string | null = null;
    let keycloakProvisioned = false;

    if (!skipKeycloak && keycloakAdminService.enabled) {
      try {
        const kcResult = await keycloakAdminService.ensureUser(
          normalizedEmail,
          firstName || normalizedEmail.split('@')[0],
          lastName || '',
          {
            emailVerified: userType === 'staff',
            requiredActions: userType === 'staff'
              ? ['UPDATE_PASSWORD']
              : ['VERIFY_EMAIL', 'UPDATE_PASSWORD'],
          },
        );
        keycloakUserId = kcResult.id;
        keycloakProvisioned = true;
        logger.info('Keycloak user ensured for invitation', {
          email: normalizedEmail,
          keycloakUserId: kcResult.id,
          created: kcResult.created,
        });
      } catch (err: any) {
        logger.error('Keycloak user provisioning failed for invitation', {
          email: normalizedEmail,
          error: err.message,
        });
        // Continue — invitation can still be created without Keycloak
      }
    }

    // 5) Create invitation record
    const id = uuidv4();
    const token = crypto.randomBytes(32).toString('hex');

    const result = await pool.query(
      `INSERT INTO unified_invitations (
        id, email, first_name, last_name, role, user_type,
        organization_id, invited_by_id, token, status,
        property_id, tenancy_id, department, team_id,
        keycloak_user_id, keycloak_provisioned, personal_message,
        service_key, service_role,
        expires_at
      ) VALUES (
        $1, $2, $3, $4, $5::user_role_enum, $6,
        $7, $8, $9, 'pending',
        $10, $11, $12, $13,
        $14, $15, $16,
        $17, $18,
        NOW() + ($19 || ' days')::INTERVAL
      ) RETURNING *`,
      [
        id, normalizedEmail, firstName || null, lastName || null, role, userType,
        organizationId, invitedById, token,
        propertyId || null, tenancyId || null, department || null, teamId || null,
        keycloakUserId, keycloakProvisioned, message || null,
        input.serviceKey || null, input.serviceRole || 'service_admin',
        String(expiryDays),
      ],
    );

    const invitation = this.mapInvitation(result.rows[0]);

    // 6) Send invitation email (async, non-blocking)
    this.sendInvitationEmailAsync(invitation, invitedById);

    logger.info('Invitation created', {
      id, email: normalizedEmail, role, userType, organizationId,
    });

    return invitation;
  }

  // =========================================================================
  // ACCEPT INVITATION
  // =========================================================================

  async acceptInvitation(input: AcceptInvitationInput): Promise<AcceptResult> {
    const { token, password, firstName, lastName } = input;

    if (!password || password.length < 8) {
      throw Object.assign(
        new Error('Password must be at least 8 characters'),
        { statusCode: 400 },
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1) Find invitation
      const invResult = await client.query(
        `SELECT ui.*, o.name as organization_name
         FROM unified_invitations ui
         LEFT JOIN organizations o ON o.id = ui.organization_id
         WHERE ui.token = $1 AND ui.status = 'pending'`,
        [token],
      );

      if (invResult.rows.length === 0) {
        throw Object.assign(
          new Error('Invalid or expired invitation'),
          { statusCode: 404 },
        );
      }

      const inv = invResult.rows[0];

      // 2) Check expiry
      if (new Date(inv.expires_at) < new Date()) {
        await client.query(
          `UPDATE unified_invitations SET status = 'expired', updated_at = NOW() WHERE id = $1`,
          [inv.id],
        );
        await client.query('COMMIT');
        throw Object.assign(
          new Error('Invitation has expired'),
          { statusCode: 410 },
        );
      }

      // 3) Set password in Keycloak (if provisioned)
      let keycloakUserId = inv.keycloak_user_id;
      if (keycloakAdminService.enabled) {
        try {
          const kcUser = await keycloakAdminService.ensureUser(
            inv.email,
            firstName || inv.first_name || inv.email.split('@')[0],
            lastName || inv.last_name || '',
            {
              emailVerified: inv.user_type === 'staff',
              requiredActions: [],
            },
          );
          keycloakUserId = kcUser.id;
          await keycloakAdminService.setPassword(kcUser.id, password, {
            markEmailVerified: true,
          });
        } catch (err: any) {
          logger.error('Keycloak password setup failed during accept', {
            email: inv.email, error: err.message,
          });
          // Continue — local auth is still valid
        }
      }

      // 4) Hash password locally
      const passwordHash = await bcrypt.hash(password, 12);

      // 5) Create or update user — inherit org's subscription tier
      let userId: string;
      const existingUser = await client.query(
        `SELECT id FROM users WHERE email = $1`,
        [inv.email],
      );

      // Get the organization's subscription tier for the new user
      let orgTier = 'starter';
      if (inv.organization_id) {
        const orgResult = await client.query(
          `SELECT subscription_tier FROM organizations WHERE id = $1`,
          [inv.organization_id],
        );
        if (orgResult.rows.length > 0 && orgResult.rows[0].subscription_tier) {
          orgTier = orgResult.rows[0].subscription_tier;
        }
      }

      const effectiveFirstName = firstName || inv.first_name || inv.email.split('@')[0];
      const effectiveLastName = lastName || inv.last_name || '';
      const displayName = [effectiveFirstName, effectiveLastName].filter(Boolean).join(' ');

      if (existingUser.rows.length > 0) {
        userId = existingUser.rows[0].id;
        await client.query(
          `UPDATE users
           SET organization_id = $1, role = $2::user_role_enum,
               keycloak_id = COALESCE($3, keycloak_id),
               password_hash = $4, user_type = $5,
               first_name = COALESCE($6, first_name),
               last_name = COALESCE($7, last_name),
               display_name = COALESCE($8, display_name),
               subscription_tier = $10,
               status = 'active', updated_at = NOW()
           WHERE id = $9`,
          [
            inv.organization_id, inv.role,
            keycloakUserId, passwordHash, inv.user_type,
            effectiveFirstName, effectiveLastName, displayName,
            userId, orgTier,
          ],
        );
      } else {
        userId = uuidv4();
        await client.query(
          `INSERT INTO users (
            id, email, password_hash, first_name, last_name,
            display_name, role, organization_id, keycloak_id,
            user_type, subscription_tier, status, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7::user_role_enum, $8, $9, $10, $11, 'active', NOW(), NOW())`,
          [
            userId, inv.email, passwordHash,
            effectiveFirstName, effectiveLastName, displayName,
            inv.role, inv.organization_id, keycloakUserId,
            inv.user_type, orgTier,
          ],
        );
      }

      // 6) Create service subscription for customer invites
      if (inv.service_key && inv.service_role) {
        const svcResult = await client.query(
          'SELECT id FROM platform_services WHERE service_key = $1',
          [inv.service_key]
        );
        if (svcResult.rows.length > 0) {
          const serviceId = svcResult.rows[0].id;
          await client.query(
            `INSERT INTO user_service_subscriptions (user_id, service_id, organization_id, tier, status, service_role)
             VALUES ($1, $2, $3, $4, 'active', $5::customer_service_role)
             ON CONFLICT (user_id, service_id) DO UPDATE SET
               service_role = EXCLUDED.service_role,
               status = 'active'`,
            [userId, serviceId, inv.organization_id, orgTier || 'starter', inv.service_role]
          );
        }
      }

      // 7) Mark invitation as accepted
      await client.query(
        `UPDATE unified_invitations
         SET status = 'accepted', accepted_by_user_id = $1,
             accepted_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [userId, inv.id],
      );

      await client.query('COMMIT');

      logger.info('Invitation accepted', {
        invitationId: inv.id, userId, email: inv.email,
        role: inv.role, userType: inv.user_type,
      });

      const redirectUrl = inv.user_type === 'customer'
        ? '/tenant-portal'
        : '/dashboard';

      return { userId, redirectUrl };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // =========================================================================
  // MANAGEMENT
  // =========================================================================

  /**
   * Get invitation details by token (public — for the accept-invite page).
   */
  async getInvitationByToken(token: string): Promise<InvitationDetails | null> {
    const result = await pool.query(
      `SELECT ui.email, ui.role, ui.user_type, ui.status, ui.expires_at,
              o.name AS organization_name,
              u.display_name AS inviter_name
       FROM unified_invitations ui
       LEFT JOIN organizations o ON o.id = ui.organization_id
       LEFT JOIN users u ON u.id = ui.invited_by_id
       WHERE ui.token = $1`,
      [token],
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      email: row.email,
      role: row.role,
      userType: row.user_type,
      organizationName: row.organization_name || 'Unknown Organization',
      inviterName: row.inviter_name || 'A team member',
      expiresAt: row.expires_at,
      status: row.status,
    };
  }

  /**
   * List invitations for an organization.
   */
  async listInvitations(
    organizationId: string,
    filters?: { status?: InvitationStatus; userType?: InviteUserType; serviceKey?: string },
  ): Promise<Invitation[]> {
    let query = `
      SELECT ui.*, u.display_name AS invited_by_name, o.name AS organization_name
      FROM unified_invitations ui
      LEFT JOIN users u ON u.id = ui.invited_by_id
      LEFT JOIN organizations o ON o.id = ui.organization_id
      WHERE ui.organization_id = $1
    `;
    const params: unknown[] = [organizationId];
    let idx = 2;

    if (filters?.status) {
      query += ` AND ui.status = $${idx}`;
      params.push(filters.status);
      idx++;
    }

    if (filters?.userType) {
      query += ` AND ui.user_type = $${idx}`;
      params.push(filters.userType);
      idx++;
    }

    if (filters?.serviceKey) {
      query += ` AND ui.service_key = $${idx}`;
      params.push(filters.serviceKey);
      idx++;
    }

    query += ` ORDER BY ui.created_at DESC`;

    const result = await pool.query(query, params);
    return result.rows.map((r: any) => this.mapInvitation(r));
  }

  /**
   * Cancel a pending invitation.
   */
  async cancelInvitation(invitationId: string, cancelledById: string): Promise<void> {
    const result = await pool.query(
      `UPDATE unified_invitations
       SET status = 'cancelled', cancelled_at = NOW(), cancelled_by_id = $2, updated_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING id`,
      [invitationId, cancelledById],
    );

    if (result.rows.length === 0) {
      throw Object.assign(
        new Error('Invitation not found or already processed'),
        { statusCode: 404 },
      );
    }

    logger.info('Invitation cancelled', { invitationId, cancelledById });
  }

  /**
   * Resend an invitation email (extends expiry by 7 days).
   */
  async resendInvitation(invitationId: string, resentById: string): Promise<Invitation> {
    const result = await pool.query(
      `UPDATE unified_invitations
       SET expires_at = NOW() + INTERVAL '7 days',
           email_resent_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [invitationId],
    );

    if (result.rows.length === 0) {
      throw Object.assign(
        new Error('Invitation not found or already processed'),
        { statusCode: 404 },
      );
    }

    const invitation = this.mapInvitation(result.rows[0]);

    // Re-send email (async)
    this.sendInvitationEmailAsync(invitation, resentById);

    logger.info('Invitation resent', { invitationId, resentById });
    return invitation;
  }

  /**
   * Bulk invite. Continues on individual failures.
   */
  async bulkInvite(params: {
    invitations: Array<{ email: string; role: string; firstName?: string; lastName?: string }>;
    userType: InviteUserType;
    organizationId: string;
    invitedById: string;
    message?: string;
  }): Promise<BulkInviteResult> {
    const result: BulkInviteResult = { succeeded: [], failed: [] };

    for (const item of params.invitations) {
      try {
        const inv = await this.createInvitation({
          email: item.email,
          role: item.role,
          firstName: item.firstName,
          lastName: item.lastName,
          userType: params.userType,
          organizationId: params.organizationId,
          invitedById: params.invitedById,
          message: params.message,
        });
        result.succeeded.push({ email: item.email, invitationId: inv.id });
      } catch (err: any) {
        result.failed.push({ email: item.email, error: err.message });
      }
    }

    return result;
  }

  /**
   * Expire stale invitations (cron job target).
   */
  async expireStaleInvitations(): Promise<number> {
    const result = await pool.query(
      `UPDATE unified_invitations
       SET status = 'expired', updated_at = NOW()
       WHERE status = 'pending' AND expires_at < NOW()`,
    );
    const count = result.rowCount || 0;
    if (count > 0) {
      logger.info('Expired stale invitations', { count });
    }
    return count;
  }

  // =========================================================================
  // EMAIL
  // =========================================================================

  private sendInvitationEmailAsync(invitation: Invitation, invitedById: string): void {
    (async () => {
      try {
        // Fetch inviter + org info
        const infoResult = await pool.query(
          `SELECT u.display_name, o.name AS org_name
           FROM users u
           LEFT JOIN organizations o ON o.id = u.organization_id
           WHERE u.id = $1`,
          [invitedById],
        );
        const inviterName = infoResult.rows[0]?.display_name || 'A team member';
        const orgName = infoResult.rows[0]?.org_name || 'your organization';

        const acceptUrl = `${frontendUrl}/accept-invite?token=${invitation.token}`;
        const roleDisplay = invitation.role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        const greeting = invitation.firstName
          ? `Hello ${invitation.firstName},`
          : 'Hello,';

        const result = await notificationService.sendEmail({
          to: invitation.email,
          subject: `You're Invited to Join ${orgName} on PROPMETRIK`,
          html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
              <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 32px 24px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">
                  Join ${orgName}
                </h1>
                <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">
                  PROPMETRIK &mdash; Real Estate Intelligence Platform
                </p>
              </div>
              <div style="background: #ffffff; padding: 32px 24px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="font-size: 16px; margin-top: 0;">${greeting}</p>
                <p style="font-size: 15px; line-height: 1.6;">
                  <strong>${inviterName}</strong> has invited you to join
                  <strong>${orgName}</strong> as a <strong>${roleDisplay}</strong>.
                </p>
                ${invitation.personalMessage ? `
                <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
                  <p style="margin: 0; font-size: 14px; color: #92400e; font-style: italic;">"${invitation.personalMessage}"</p>
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
          text: `${inviterName} has invited you to join ${orgName} as a ${roleDisplay} on PROPMETRIK. Accept your invitation and set up your password: ${acceptUrl} — This link expires in 7 days.`,
        });

        if (result.success) {
          await pool.query(
            `UPDATE unified_invitations SET email_sent_at = NOW() WHERE id = $1`,
            [invitation.id],
          );
        } else {
          logger.error('Invitation email send returned failure', { email: invitation.email, error: result.error });
        }
      } catch (err: any) {
        logger.error('Failed to send invitation email', {
          invitationId: invitation.id,
          email: invitation.email,
          error: err.message,
        });
      }
    })();
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  private mapInvitation(row: any): Invitation {
    return {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      role: row.role,
      userType: row.user_type,
      organizationId: row.organization_id,
      invitedById: row.invited_by_id,
      invitedByName: row.invited_by_name || undefined,
      organizationName: row.organization_name || undefined,
      token: row.token,
      status: row.status,
      personalMessage: row.personal_message,
      propertyId: row.property_id,
      tenancyId: row.tenancy_id,
      department: row.department,
      serviceKey: row.service_key || null,
      serviceRole: row.service_role || null,
      keycloakProvisioned: row.keycloak_provisioned ?? false,
      emailSentAt: row.email_sent_at,
      acceptedAt: row.accepted_at,
      cancelledAt: row.cancelled_at,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const inviteService = new InviteService();
export default inviteService;
