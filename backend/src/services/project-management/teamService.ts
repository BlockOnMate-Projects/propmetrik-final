/**
 * Team Service
 * Phase 4 Sprint 8 - Team & Integration
 * 
 * Handles:
 * - Team member management with Ghana-specific roles
 * - Vendor directory with ratings
 * - Communication logging
 * - Availability tracking
 * 
 * @deprecated This god file (1404 lines) has been split into focused services.
 * Use the new modular services in ./team/:
 * - teamMemberService: Project team member management
 * - vendorService: Vendor directory and ratings
 * - communicationService: Communication logging and follow-ups
 * 
 * Import from './team' instead of using this file directly.
 * This file is kept for backwards compatibility only.
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { notify } from '../../../shared-services/notifications/in-mail';

// ============================================================================
// TYPES
// ============================================================================

// Ghana-specific roles
export type GhanaTeamRole =
  // Internal roles
  | 'project_owner'
  | 'project_manager'
  | 'assistant_project_manager'
  | 'site_manager'
  // Design & Engineering
  | 'architect'
  | 'structural_engineer'
  | 'quantity_surveyor'
  | 'mechanical_engineer'
  | 'electrical_engineer'
  | 'civil_engineer'
  | 'geotechnical_engineer'
  | 'interior_designer'
  // Construction
  | 'main_contractor'
  | 'site_supervisor'
  | 'foreman'
  | 'safety_officer'
  // Specialist Contractors
  | 'electrical_contractor'
  | 'plumbing_contractor'
  | 'masonry_contractor'
  | 'steel_contractor'
  | 'roofing_contractor'
  | 'painting_contractor'
  | 'tiling_contractor'
  | 'landscaping_contractor'
  | 'hvac_contractor'
  // Government & Regulatory
  | 'lands_commission_officer'
  | 'assembly_officer'
  | 'fire_service_inspector'
  | 'epa_officer'
  | 'town_planning_officer'
  // Stakeholders
  | 'traditional_chief'
  | 'community_liaison'
  | 'investor'
  | 'financier'
  // Operations
  | 'accountant'
  | 'procurement_officer'
  | 'mobile_money_agent'
  | 'security_coordinator'
  | 'logistics_coordinator'
  // Other
  | 'consultant'
  | 'legal_advisor'
  | 'surveyor'
  | 'other';

export type RoleCategory =
  | 'internal'
  | 'contractor'
  | 'consultant'
  | 'government'
  | 'stakeholder'
  | 'vendor'
  | 'other';

export type VendorCategory =
  | 'general_contractor'
  | 'specialist_contractor'
  | 'material_supplier'
  | 'equipment_rental'
  | 'consultant'
  | 'service_provider'
  | 'transport'
  | 'security'
  | 'cleaning'
  | 'catering'
  | 'other';

export type CommunicationType =
  | 'phone_call'
  | 'whatsapp'
  | 'email'
  | 'sms'
  | 'in_person'
  | 'site_visit'
  | 'virtual_meeting'
  | 'letter'
  | 'other';

export interface ProjectTeamMember {
  id: string;
  projectId: string;
  organizationId: string;
  userId: string | null;
  vendorId: string | null;
  
  fullName: string;
  email: string | null;
  phone: string | null;
  phoneAlt: string | null;
  whatsapp: string | null;
  
  role: string;
  roleType: GhanaTeamRole;
  roleCategory: RoleCategory;
  title: string | null;
  department: string | null;
  company: string | null;
  
  responsibilities: string | null;
  assignmentType: string;
  
  permissions: {
    canView: boolean;
    canEdit: boolean;
    canApproveCosts: boolean;
    canUploadDocuments: boolean;
    canAddTasks: boolean;
    canManageTeam: boolean;
    canViewFinancials: boolean;
    canReceiveNotifications: boolean;
  };
  
  startDate: Date | null;
  endDate: Date | null;
  lastActiveDate: Date | null;
  
  isActive: boolean;
  status: string;
  
  hourlyRate: number | null;
  dailyRate: number | null;
  monthlyRate: number | null;
  rateCurrency: string;
  
  avatarUrl: string | null;
  invitedBy: string | null;
  invitedAt: Date | null;
  acceptedAt: Date | null;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamMemberFilters {
  projectId?: string;
  organizationId?: string;
  userId?: string;
  role?: string;
  isActive?: boolean;
  search?: string;
}

export interface AddTeamMemberInput {
  projectId: string;
  organizationId: string;
  userId?: string;
  vendorId?: string;
  
  fullName: string;
  email?: string;
  phone?: string;
  phoneAlt?: string;
  whatsapp?: string;
  
  role: string;
  roleType?: GhanaTeamRole;
  roleCategory?: RoleCategory;
  title?: string;
  department?: string;
  company?: string;
  
  responsibilities?: string;
  assignmentType?: string;
  
  canView?: boolean;
  canEdit?: boolean;
  canApproveCosts?: boolean;
  canUploadDocuments?: boolean;
  canAddTasks?: boolean;
  canManageTeam?: boolean;
  canViewFinancials?: boolean;
  canReceiveNotifications?: boolean;
  
  startDate?: Date;
  endDate?: Date;
  
  hourlyRate?: number;
  dailyRate?: number;
  monthlyRate?: number;
  rateCurrency?: string;
  
  avatarUrl?: string;
  
  invitedBy?: string;
}

export interface Vendor {
  id: string;
  organizationId: string;
  
  name: string;
  tradingName: string | null;
  category: VendorCategory;
  specializations: string[];
  
  businessRegistration: string | null;
  tinNumber: string | null;
  vatRegistered: boolean;
  vatNumber: string | null;
  
  primaryContact: {
    name: string | null;
    title: string | null;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
  };
  
  altContact: {
    name: string | null;
    email: string | null;
    phone: string | null;
  };
  
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    region: string | null;
    country: string;
    ghanaPostGps: string | null;
    postalCode: string | null;
  };
  
  location: {
    latitude: number | null;
    longitude: number | null;
  };
  
  banking: {
    bankName: string | null;
    bankBranch: string | null;
    accountNumber: string | null;
    accountName: string | null;
    mobileMoneyNumber: string | null;
    mobileMoneyProvider: string | null;
  };
  
  ratings: {
    overall: number;
    count: number;
    quality: number | null;
    reliability: number | null;
    communication: number | null;
    value: number | null;
  };
  
  creditLimit: number | null;
  paymentTerms: string;
  preferredCurrency: string;
  
  compliance: {
    hasInsurance: boolean;
    insuranceExpiry: Date | null;
    hasSafetyCertification: boolean;
    safetyCertificationExpiry: Date | null;
    hasWorkPermit: boolean;
    workPermitExpiry: Date | null;
  };
  
  isApproved: boolean;
  approvalStatus: string;
  isActive: boolean;
  isPreferred: boolean;
  
  stats: {
    totalProjects: number;
    totalContractValue: number;
    completedProjects: number;
    onTimeCompletionRate: number | null;
  };
  
  tags: string[];
  notes: string | null;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateVendorInput {
  organizationId: string;
  
  name: string;
  tradingName?: string;
  category: VendorCategory;
  specializations?: string[];
  
  businessRegistration?: string;
  tinNumber?: string;
  vatRegistered?: boolean;
  vatNumber?: string;
  
  primaryContactName?: string;
  primaryContactTitle?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  primaryContactWhatsapp?: string;
  
  altContactName?: string;
  altContactEmail?: string;
  altContactPhone?: string;
  
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  country?: string;
  ghanaPostGps?: string;
  postalCode?: string;
  
  latitude?: number;
  longitude?: number;
  
  bankName?: string;
  bankBranch?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  mobileMoneyNumber?: string;
  mobileMoneyProvider?: string;
  
  creditLimit?: number;
  paymentTerms?: string;
  preferredCurrency?: string;
  
  hasInsurance?: boolean;
  insuranceExpiry?: Date;
  hasSafetyCertification?: boolean;
  safetyCertificationExpiry?: Date;
  
  tags?: string[];
  notes?: string;
  
  createdBy?: string;
}

export interface VendorRating {
  vendorId: string;
  projectId: string;
  organizationId: string;
  
  overallRating: number;
  qualityRating?: number;
  timelinessRating?: number;
  communicationRating?: number;
  valueRating?: number;
  safetyRating?: number;
  
  reviewTitle?: string;
  reviewText?: string;
  pros?: string;
  cons?: string;
  
  wouldHireAgain?: boolean;
  wouldRecommend?: boolean;
  
  contractValue?: number;
  workDescription?: string;
  
  ratedBy: string;
}

export interface CommunicationLog {
  id: string;
  projectId: string;
  organizationId: string;
  teamMemberId: string | null;
  vendorId: string | null;
  
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  
  communicationType: CommunicationType;
  direction: 'inbound' | 'outbound';
  
  subject: string | null;
  summary: string | null;
  notes: string | null;
  
  communicationDate: Date;
  communicationTime: string | null;
  durationMinutes: number | null;
  
  outcome: string | null;
  followUpRequired: boolean;
  followUpDate: Date | null;
  followUpNotes: string | null;
  
  attachments: Array<{ name: string; url: string; type: string }>;
  tags: string[];
  isImportant: boolean;
  
  status: string;
  
  loggedBy: string;
  loggedAt: Date;
}

export interface LogCommunicationInput {
  projectId: string;
  organizationId: string;
  teamMemberId?: string;
  vendorId?: string;
  
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  
  communicationType: CommunicationType;
  direction: 'inbound' | 'outbound';
  
  subject?: string;
  summary?: string;
  notes?: string;
  
  communicationDate: Date;
  communicationTime?: string;
  durationMinutes?: number;
  
  outcome?: string;
  followUpRequired?: boolean;
  followUpDate?: Date;
  followUpNotes?: string;
  
  attachments?: Array<{ name: string; url: string; type: string }>;
  tags?: string[];
  isImportant?: boolean;
  
  loggedBy: string;
}

// ============================================================================
// TEAM SERVICE
// ============================================================================

class TeamService {
  
  // ==========================================================================
  // TEAM MEMBER MANAGEMENT
  // ==========================================================================
  
  /**
   * Add a team member to a project
   */
  async addTeamMember(input: AddTeamMemberInput): Promise<ProjectTeamMember> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Auto-link to users table by email when user_id not explicitly provided
      let resolvedUserId = input.userId || null;
      if (!resolvedUserId && input.email) {
        const userRow = await client.query(
          `SELECT id FROM users WHERE email = $1 LIMIT 1`,
          [input.email]
        );
        if (userRow.rows.length > 0) {
          resolvedUserId = userRow.rows[0].id;
        }
      }
      
      const id = uuidv4();
      const result = await client.query(
        `INSERT INTO project_team_members (
          id, project_id, organization_id, user_id, vendor_id,
          full_name, email, phone, phone_alt, whatsapp,
          role, role_type, role_category, title, department, company,
          responsibilities, assignment_type,
          can_view, can_edit, can_approve_costs, can_upload_documents,
          can_add_tasks, can_manage_team, can_view_financials, can_receive_notifications,
          start_date, end_date,
          hourly_rate, daily_rate, monthly_rate, rate_currency,
          avatar_url, is_active, status,
          invited_by, invited_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
          $31, $32, $33, true, 'active', $34, NOW()
        )
        RETURNING *`,
        [
          id,
          input.projectId,
          input.organizationId,
          resolvedUserId,
          input.vendorId || null,
          input.fullName,
          input.email || null,
          input.phone || null,
          input.phoneAlt || null,
          input.whatsapp || null,
          input.role,
          input.roleType || 'other',
          input.roleCategory || 'other',
          input.title || null,
          input.department || null,
          input.company || null,
          input.responsibilities || null,
          input.assignmentType || 'full_time',
          input.canView ?? true,
          input.canEdit ?? false,
          input.canApproveCosts ?? false,
          input.canUploadDocuments ?? true,
          input.canAddTasks ?? true,
          input.canManageTeam ?? false,
          input.canViewFinancials ?? false,
          input.canReceiveNotifications ?? true,
          input.startDate || null,
          input.endDate || null,
          input.hourlyRate || null,
          input.dailyRate || null,
          input.monthlyRate || null,
          input.rateCurrency || 'GHS',
          input.avatarUrl || null,
          input.invitedBy || null,
        ]
      );

      // Sync project_manager_id on development_projects when a PM is assigned
      if (input.role === 'project_manager' && resolvedUserId) {
        await client.query(
          `UPDATE development_projects SET project_manager_id = $1 WHERE id = $2`,
          [resolvedUserId, input.projectId]
        );
      }
      
      await client.query('COMMIT');

      logger.info('Team member added', { memberId: id, projectId: input.projectId });

      // Notify the assigned member that they've been added to the project
      if ((input.canReceiveNotifications ?? true) && (resolvedUserId || input.email) && resolvedUserId !== input.invitedBy) {
        try {
          const projRow = await pool.query(
            `SELECT name FROM development_projects WHERE id = $1`,
            [input.projectId],
          );
          const projectName = projRow.rows[0]?.name || 'a project';
          await notify({
            recipients: {
              audience: 'staff',
              userId: resolvedUserId || '',
              email: input.email || null,
              phone: input.phone || null,
              name: input.fullName,
            },
            category: 'project',
            type: 'project.team_assigned',
            title: 'You have been added to a project',
            body: `You have been added to ${projectName} as ${input.role}.`,
            priority: 'normal',
            organizationId: input.organizationId,
            sourceType: 'project',
            sourceId: input.projectId,
            sourceUrl: `/dashboard/projects/${input.projectId}`,
            channels: { inApp: true, email: true },
          });
        } catch (notifyError: any) {
          logger.warn('Failed to notify new team member', { memberId: id, error: notifyError.message });
        }
      }

      return this.mapTeamMember(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error adding team member', { input, error });
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get project team members
   */
  async getProjectTeam(projectId: string, includeInactive = false): Promise<ProjectTeamMember[]> {
    try {
      let query = `
        SELECT * FROM project_team_members 
        WHERE project_id = $1
      `;
      
      if (!includeInactive) {
        query += ' AND is_active = true';
      }
      
      query += ' ORDER BY role_category, role, full_name';
      
      const result = await pool.query(query, [projectId]);
      return result.rows.map(this.mapTeamMember);
    } catch (error) {
      logger.error('Error getting project team', { projectId, error });
      throw error;
    }
  }

  /**
   * Get team members with filters
   */
  async getTeamMembers(
    filters: TeamMemberFilters,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ members: ProjectTeamMember[]; total: number }> {
    try {
      const conditions: string[] = ['1=1'];
      const params: any[] = [];
      let paramIndex = 1;

      if (filters.projectId) {
        conditions.push(`project_id = $${paramIndex++}`);
        params.push(filters.projectId);
      }

      if (filters.organizationId) {
        conditions.push(`organization_id = $${paramIndex++}`);
        params.push(filters.organizationId);
      }

      if (filters.userId) {
        conditions.push(`user_id = $${paramIndex++}`);
        params.push(filters.userId);
      }

      if (filters.role) {
        conditions.push(`role = $${paramIndex++}`);
        params.push(filters.role);
      }

      if (filters.isActive !== undefined) {
        conditions.push(`is_active = $${paramIndex++}`);
        params.push(filters.isActive);
      }

      if (filters.search) {
        conditions.push(`(
          full_name ILIKE $${paramIndex} OR
          email ILIKE $${paramIndex} OR
          role ILIKE $${paramIndex} OR
          title ILIKE $${paramIndex} OR
          company ILIKE $${paramIndex}
        )`);
        params.push(`%${filters.search}%`);
        paramIndex++;
      }

      const whereClause = conditions.join(' AND ');

      const countResult = await pool.query(
        `SELECT COUNT(*) FROM project_team_members WHERE ${whereClause}`,
        params
      );

      const result = await pool.query(
        `SELECT * FROM project_team_members
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      );

      return {
        members: result.rows.map(this.mapTeamMember),
        total: parseInt(countResult.rows[0]?.count || '0', 10),
      };
    } catch (error) {
      logger.error('Error getting team members', { filters, error });
      throw error;
    }
  }
  
  /**
   * Get team member by ID
   */
  async getTeamMemberById(id: string): Promise<ProjectTeamMember | null> {
    try {
      const result = await pool.query(
        'SELECT * FROM project_team_members WHERE id = $1',
        [id]
      );
      return result.rows[0] ? this.mapTeamMember(result.rows[0]) : null;
    } catch (error) {
      logger.error('Error getting team member', { id, error });
      throw error;
    }
  }
  
  /**
   * Update team member role
   */
  async updateMemberRole(
    memberId: string,
    role: string,
    roleType?: GhanaTeamRole,
    roleCategory?: RoleCategory
  ): Promise<ProjectTeamMember> {
    try {
      const updates: string[] = ['role = $2'];
      const params: any[] = [memberId, role];
      let paramIndex = 3;
      
      if (roleType) {
        updates.push(`role_type = $${paramIndex}`);
        params.push(roleType);
        paramIndex++;
      }
      
      if (roleCategory) {
        updates.push(`role_category = $${paramIndex}`);
        params.push(roleCategory);
        paramIndex++;
      }
      
      updates.push('updated_at = NOW()');
      
      const result = await pool.query(
        `UPDATE project_team_members SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
        params
      );
      
      if (!result.rows[0]) {
        throw new Error(`Team member not found: ${memberId}`);
      }

      // Sync project_manager_id when role changes to/from project_manager
      const row = result.rows[0];
      if (role === 'project_manager' && row.user_id) {
        await pool.query(
          `UPDATE development_projects SET project_manager_id = $1 WHERE id = $2`,
          [row.user_id, row.project_id]
        );
      } else if (role !== 'project_manager' && row.user_id) {
        // Changed away from PM — clear if it was this user
        await pool.query(
          `UPDATE development_projects SET project_manager_id = NULL WHERE id = $1 AND project_manager_id = $2`,
          [row.project_id, row.user_id]
        );
      }
      
      logger.info('Team member role updated', { memberId, role });
      return this.mapTeamMember(result.rows[0]);
    } catch (error) {
      logger.error('Error updating team member role', { memberId, role, error });
      throw error;
    }
  }
  
  /**
   * Update team member permissions
   */
  async updateMemberPermissions(
    memberId: string,
    permissions: Partial<ProjectTeamMember['permissions']>
  ): Promise<ProjectTeamMember> {
    try {
      const updates: string[] = [];
      const params: any[] = [memberId];
      let paramIndex = 2;
      
      const permissionMap: Record<string, string> = {
        canView: 'can_view',
        canEdit: 'can_edit',
        canApproveCosts: 'can_approve_costs',
        canUploadDocuments: 'can_upload_documents',
        canAddTasks: 'can_add_tasks',
        canManageTeam: 'can_manage_team',
        canViewFinancials: 'can_view_financials',
        canReceiveNotifications: 'can_receive_notifications',
      };
      
      for (const [key, value] of Object.entries(permissions)) {
        if (value !== undefined && permissionMap[key]) {
          updates.push(`${permissionMap[key]} = $${paramIndex}`);
          params.push(value);
          paramIndex++;
        }
      }
      
      if (updates.length === 0) {
        const current = await this.getTeamMemberById(memberId);
        if (!current) throw new Error(`Team member not found: ${memberId}`);
        return current;
      }
      
      updates.push('updated_at = NOW()');
      
      const result = await pool.query(
        `UPDATE project_team_members SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
        params
      );
      
      if (!result.rows[0]) {
        throw new Error(`Team member not found: ${memberId}`);
      }
      
      logger.info('Team member permissions updated', { memberId });
      return this.mapTeamMember(result.rows[0]);
    } catch (error) {
      logger.error('Error updating team member permissions', { memberId, error });
      throw error;
    }
  }
  
  /**
   * Remove team member from project.
   * If the member is already inactive/terminated, hard-delete the row.
   * Otherwise, soft-delete (deactivate) first.
   */
  async removeTeamMember(memberId: string): Promise<void> {
    try {
      // Check current status
      const check = await pool.query(
        `SELECT is_active, status, role, user_id, project_id FROM project_team_members WHERE id = $1`,
        [memberId]
      );

      if (check.rows.length === 0) {
        logger.warn('Team member not found for removal', { memberId });
        return;
      }

      const { is_active, status, role, user_id, project_id } = check.rows[0];

      // Clear project_manager_id when removing a PM team member
      if (role === 'project_manager' && user_id) {
        await pool.query(
          `UPDATE development_projects SET project_manager_id = NULL WHERE id = $1 AND project_manager_id = $2`,
          [project_id, user_id]
        );
      }

      if (!is_active || status === 'terminated') {
        // Already inactive — hard delete
        await pool.query(
          `DELETE FROM project_team_members WHERE id = $1`,
          [memberId]
        );
        logger.info('Team member permanently removed', { memberId });
      } else {
        // Active — soft delete (deactivate)
        await pool.query(
          `UPDATE project_team_members 
           SET is_active = false, status = 'terminated', end_date = CURRENT_DATE, updated_at = NOW()
           WHERE id = $1`,
          [memberId]
        );
        logger.info('Team member deactivated', { memberId });
      }
    } catch (error) {
      logger.error('Error removing team member', { memberId, error });
      throw error;
    }
  }
  
  /**
   * Get team by role category
   */
  async getTeamByCategory(
    projectId: string,
    category: RoleCategory
  ): Promise<ProjectTeamMember[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM project_team_members 
         WHERE project_id = $1 AND role_category = $2 AND is_active = true
         ORDER BY role, full_name`,
        [projectId, category]
      );
      return result.rows.map(this.mapTeamMember);
    } catch (error) {
      logger.error('Error getting team by category', { projectId, category, error });
      throw error;
    }
  }
  
  // ==========================================================================
  // VENDOR MANAGEMENT
  // ==========================================================================
  
  /**
   * Add a vendor to the organization directory
   */
  async addVendor(input: CreateVendorInput): Promise<Vendor> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const id = uuidv4();
      // Resolve field aliases (camelCase or snake_case from route body)
      const businessName = input.name || (input as any).business_name || (input as any).businessName;
      const contactPerson = (input as any).primaryContactName || (input as any).primary_contact_name
        || (input as any).contact_name || (input as any).contactPerson || (input as any).contact_person || null;
      const phonePrimary = (input as any).primaryContactPhone || (input as any).primary_contact_phone
        || (input as any).phone || (input as any).phonePrimary || (input as any).phone_primary || null;
      const serviceCategories = Array.isArray((input as any).service_categories)
        ? (input as any).service_categories
        : ((input as any).category ? [(input as any).category] : (input as any).specializations || []);
      const orgId = input.organizationId || (input as any).organization_id;
      // Normalize service_categories to valid vendor_category enum values
      // Valid maintenance_category_enum values used by vendors.service_categories
      const VALID_MAINT_CATS = new Set(['plumbing','electrical','hvac','roofing','painting','flooring','doors_windows','security','water_supply','borehole','generator','solar_system','compound_maintenance','pest_control','septic_tank','other']);
      const MAINT_CAT_MAP: Record<string, string> = { plumbing: 'plumbing', electrical: 'electrical', hvac: 'hvac', roofing: 'roofing', painting: 'painting', flooring: 'flooring', security: 'security' };
      const normalizedCategories = serviceCategories.length > 0
        ? serviceCategories.map((c: string) => VALID_MAINT_CATS.has(c) ? c : (MAINT_CAT_MAP[c] || 'other'))
        : ['other'];
      
      const result = await client.query(
        `INSERT INTO vendors (
          id, organization_id,
          business_name, contact_person, phone_primary, email,
          address, region, tin_number, business_registration,
          service_categories, status, notes, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', $12, $13
        )
        RETURNING *`,
        [
          id,
          orgId,
          businessName,
          contactPerson,
          phonePrimary,
          (input as any).primaryContactEmail || (input as any).email || null,
          (input as any).addressLine1 || (input as any).address_line1 || (input as any).address || null,
          (input as any).region || null,
          (input as any).tinNumber || (input as any).tin_number || null,
          (input as any).businessRegistration || (input as any).business_registration || null,
          normalizedCategories,
          (input as any).notes || null,
          input.createdBy || (input as any).created_by || null,
        ]
      );
      
      await client.query('COMMIT');
      
      logger.info('Vendor added', { vendorId: id });
      return this.mapVendor(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error adding vendor', { input, error });
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get approved vendors for organization
   */
  async getApprovedVendors(
    organizationId: string,
    category?: VendorCategory
  ): Promise<Vendor[]> {
    try {
      let query = `
        SELECT * FROM vendors 
        WHERE organization_id = $1 AND is_approved = true AND is_active = true
      `;
      const params: any[] = [organizationId];
      
      if (category) {
        query += ' AND category = $2';
        params.push(category);
      }
      
      query += ' ORDER BY is_preferred DESC, rating_avg DESC, name';
      
      const result = await pool.query(query, params);
      return result.rows.map(this.mapVendor);
    } catch (error) {
      logger.error('Error getting approved vendors', { organizationId, error });
      throw error;
    }
  }
  
  /**
   * Get vendor by ID
   */
  async getVendorById(id: string): Promise<Vendor | null> {
    try {
      const result = await pool.query(
        'SELECT * FROM vendors WHERE id = $1',
        [id]
      );
      return result.rows[0] ? this.mapVendor(result.rows[0]) : null;
    } catch (error) {
      logger.error('Error getting vendor', { id, error });
      throw error;
    }
  }
  
  /**
   * Search vendors
   */
  async searchVendors(
    organizationId: string,
    search: string,
    limit = 20
  ): Promise<Vendor[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM vendors 
         WHERE organization_id = $1 
           AND is_active = true
           AND (
             name ILIKE $2 OR
             trading_name ILIKE $2 OR
             $3 = ANY(specializations)
           )
         ORDER BY is_approved DESC, rating_avg DESC
         LIMIT $4`,
        [organizationId, `%${search}%`, search.toLowerCase(), limit]
      );
      return result.rows.map(this.mapVendor);
    } catch (error) {
      logger.error('Error searching vendors', { organizationId, search, error });
      throw error;
    }
  }
  
  /**
   * Rate vendor performance
   */
  async rateVendorPerformance(rating: VendorRating): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const id = uuidv4();
      await client.query(
        `INSERT INTO vendor_ratings (
          id, vendor_id, project_id, organization_id,
          overall_rating, quality_rating, timeliness_rating,
          communication_rating, value_rating, safety_rating,
          review_title, review_text, pros, cons,
          would_hire_again, would_recommend,
          contract_value, work_description,
          rated_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
        )
        ON CONFLICT (vendor_id, project_id, organization_id) 
        DO UPDATE SET
          overall_rating = EXCLUDED.overall_rating,
          quality_rating = EXCLUDED.quality_rating,
          timeliness_rating = EXCLUDED.timeliness_rating,
          communication_rating = EXCLUDED.communication_rating,
          value_rating = EXCLUDED.value_rating,
          safety_rating = EXCLUDED.safety_rating,
          review_title = EXCLUDED.review_title,
          review_text = EXCLUDED.review_text,
          pros = EXCLUDED.pros,
          cons = EXCLUDED.cons,
          would_hire_again = EXCLUDED.would_hire_again,
          would_recommend = EXCLUDED.would_recommend,
          updated_at = NOW()`,
        [
          id,
          rating.vendorId,
          rating.projectId,
          rating.organizationId,
          rating.overallRating,
          rating.qualityRating || null,
          rating.timelinessRating || null,
          rating.communicationRating || null,
          rating.valueRating || null,
          rating.safetyRating || null,
          rating.reviewTitle || null,
          rating.reviewText || null,
          rating.pros || null,
          rating.cons || null,
          rating.wouldHireAgain || null,
          rating.wouldRecommend || null,
          rating.contractValue || null,
          rating.workDescription || null,
          rating.ratedBy,
        ]
      );
      
      await client.query('COMMIT');
      
      logger.info('Vendor rated', { vendorId: rating.vendorId, rating: rating.overallRating });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error rating vendor', { rating, error });
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Approve vendor
   */
  async approveVendor(vendorId: string, approvedBy: string): Promise<Vendor> {
    try {
      const result = await pool.query(
        `UPDATE vendors 
         SET status = 'active',
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [vendorId]
      );
      
      if (!result.rows[0]) {
        throw new Error(`Vendor not found: ${vendorId}`);
      }
      
      logger.info('Vendor approved', { vendorId, approvedBy });
      return this.mapVendor(result.rows[0]);
    } catch (error) {
      logger.error('Error approving vendor', { vendorId, error });
      throw error;
    }
  }
  
  /**
   * Set vendor as preferred
   */
  async setPreferredVendor(vendorId: string, isPreferred: boolean): Promise<Vendor> {
    try {
      const result = await pool.query(
        `UPDATE vendors 
         SET is_preferred = $2, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [vendorId, isPreferred]
      );
      
      if (!result.rows[0]) {
        throw new Error(`Vendor not found: ${vendorId}`);
      }
      
      logger.info('Vendor preferred status updated', { vendorId, isPreferred });
      return this.mapVendor(result.rows[0]);
    } catch (error) {
      logger.error('Error setting preferred vendor', { vendorId, error });
      throw error;
    }
  }
  
  // ==========================================================================
  // COMMUNICATION LOGGING
  // ==========================================================================
  
  /**
   * Log a communication
   */
  async logCommunication(input: LogCommunicationInput): Promise<CommunicationLog> {
    try {
      const id = uuidv4();
      const result = await pool.query(
        `INSERT INTO communication_logs (
          id, project_id, organization_id, team_member_id, vendor_id,
          contact_name, contact_email, contact_phone,
          communication_type, direction,
          subject, summary, notes,
          communication_date, communication_time, duration_minutes,
          outcome, follow_up_required, follow_up_date, follow_up_notes,
          attachments, tags, is_important,
          status, logged_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21, $22, $23, 'logged', $24
        )
        RETURNING *`,
        [
          id,
          input.projectId,
          input.organizationId,
          input.teamMemberId || null,
          input.vendorId || null,
          input.contactName || null,
          input.contactEmail || null,
          input.contactPhone || null,
          input.communicationType,
          input.direction,
          input.subject || null,
          input.summary || null,
          input.notes || null,
          input.communicationDate,
          input.communicationTime || null,
          input.durationMinutes || null,
          input.outcome || null,
          input.followUpRequired || false,
          input.followUpDate || null,
          input.followUpNotes || null,
          JSON.stringify(input.attachments || []),
          input.tags || [],
          input.isImportant || false,
          input.loggedBy,
        ]
      );
      
      logger.info('Communication logged', { logId: id, projectId: input.projectId });
      return this.mapCommunicationLog(result.rows[0]);
    } catch (error) {
      logger.error('Error logging communication', { input, error });
      throw error;
    }
  }
  
  /**
   * Get communication history for team member
   */
  async getCommunicationHistory(
    teamMemberId: string,
    limit = 50
  ): Promise<CommunicationLog[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM communication_logs 
         WHERE team_member_id = $1
         ORDER BY communication_date DESC, logged_at DESC
         LIMIT $2`,
        [teamMemberId, limit]
      );
      return result.rows.map(this.mapCommunicationLog);
    } catch (error) {
      logger.error('Error getting communication history', { teamMemberId, error });
      throw error;
    }
  }
  
  /**
   * Get project communications
   */
  async getProjectCommunications(
    projectId: string,
    limit = 100
  ): Promise<CommunicationLog[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM communication_logs 
         WHERE project_id = $1
         ORDER BY communication_date DESC, logged_at DESC
         LIMIT $2`,
        [projectId, limit]
      );
      return result.rows.map(this.mapCommunicationLog);
    } catch (error) {
      logger.error('Error getting project communications', { projectId, error });
      throw error;
    }
  }
  
  /**
   * Get pending follow-ups
   */
  async getPendingFollowUps(organizationId: string): Promise<CommunicationLog[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM communication_logs 
         WHERE organization_id = $1 
           AND follow_up_required = true 
           AND status != 'follow_up_complete'
           AND (follow_up_date IS NULL OR follow_up_date <= CURRENT_DATE + INTERVAL '7 days')
         ORDER BY follow_up_date ASC NULLS LAST, communication_date DESC`,
        [organizationId]
      );
      return result.rows.map(this.mapCommunicationLog);
    } catch (error) {
      logger.error('Error getting pending follow-ups', { organizationId, error });
      throw error;
    }
  }
  
  /**
   * Mark follow-up complete
   */
  async markFollowUpComplete(logId: string): Promise<void> {
    try {
      await pool.query(
        `UPDATE communication_logs 
         SET status = 'follow_up_complete', updated_at = NOW()
         WHERE id = $1`,
        [logId]
      );
      
      logger.info('Follow-up marked complete', { logId });
    } catch (error) {
      logger.error('Error marking follow-up complete', { logId, error });
      throw error;
    }
  }
  
  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================
  
  private mapTeamMember(row: any): ProjectTeamMember {
    return {
      id: row.id,
      projectId: row.project_id,
      organizationId: row.organization_id,
      userId: row.user_id,
      vendorId: row.vendor_id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      phoneAlt: row.phone_alt,
      whatsapp: row.whatsapp,
      role: row.role,
      roleType: row.role_type,
      roleCategory: row.role_category,
      title: row.title,
      department: row.department,
      company: row.company,
      responsibilities: row.responsibilities,
      assignmentType: row.assignment_type,
      permissions: {
        canView: row.can_view,
        canEdit: row.can_edit,
        canApproveCosts: row.can_approve_costs,
        canUploadDocuments: row.can_upload_documents,
        canAddTasks: row.can_add_tasks,
        canManageTeam: row.can_manage_team,
        canViewFinancials: row.can_view_financials,
        canReceiveNotifications: row.can_receive_notifications,
      },
      startDate: row.start_date,
      endDate: row.end_date,
      lastActiveDate: row.last_active_date,
      isActive: row.is_active,
      status: row.status,
      hourlyRate: row.hourly_rate ? parseFloat(row.hourly_rate) : null,
      dailyRate: row.daily_rate ? parseFloat(row.daily_rate) : null,
      monthlyRate: row.monthly_rate ? parseFloat(row.monthly_rate) : null,
      rateCurrency: row.rate_currency,
      avatarUrl: row.avatar_url,
      invitedBy: row.invited_by,
      invitedAt: row.invited_at,
      acceptedAt: row.accepted_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  
  private mapVendor(row: any): Vendor {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      tradingName: row.trading_name,
      category: row.category,
      specializations: row.specializations || [],
      businessRegistration: row.business_registration,
      tinNumber: row.tin_number,
      vatRegistered: row.vat_registered,
      vatNumber: row.vat_number,
      primaryContact: {
        name: row.primary_contact_name,
        title: row.primary_contact_title,
        email: row.primary_contact_email,
        phone: row.primary_contact_phone,
        whatsapp: row.primary_contact_whatsapp,
      },
      altContact: {
        name: row.alt_contact_name,
        email: row.alt_contact_email,
        phone: row.alt_contact_phone,
      },
      address: {
        line1: row.address_line1,
        line2: row.address_line2,
        city: row.city,
        region: row.region,
        country: row.country,
        ghanaPostGps: row.ghana_post_gps,
        postalCode: row.postal_code,
      },
      location: {
        latitude: row.latitude ? parseFloat(row.latitude) : null,
        longitude: row.longitude ? parseFloat(row.longitude) : null,
      },
      banking: {
        bankName: row.bank_name,
        bankBranch: row.bank_branch,
        accountNumber: row.bank_account_number,
        accountName: row.bank_account_name,
        mobileMoneyNumber: row.mobile_money_number,
        mobileMoneyProvider: row.mobile_money_provider,
      },
      ratings: {
        overall: parseFloat(row.rating_avg || 0),
        count: row.rating_count || 0,
        quality: row.quality_score ? parseFloat(row.quality_score) : null,
        reliability: row.reliability_score ? parseFloat(row.reliability_score) : null,
        communication: row.communication_score ? parseFloat(row.communication_score) : null,
        value: row.value_score ? parseFloat(row.value_score) : null,
      },
      creditLimit: row.credit_limit ? parseFloat(row.credit_limit) : null,
      paymentTerms: row.payment_terms,
      preferredCurrency: row.preferred_currency,
      compliance: {
        hasInsurance: row.has_insurance,
        insuranceExpiry: row.insurance_expiry,
        hasSafetyCertification: row.has_safety_certification,
        safetyCertificationExpiry: row.safety_certification_expiry,
        hasWorkPermit: row.has_work_permit,
        workPermitExpiry: row.work_permit_expiry,
      },
      isApproved: row.is_approved,
      approvalStatus: row.approval_status,
      isActive: row.is_active,
      isPreferred: row.is_preferred,
      stats: {
        totalProjects: row.total_projects || 0,
        totalContractValue: parseFloat(row.total_contract_value || 0),
        completedProjects: row.completed_projects || 0,
        onTimeCompletionRate: row.on_time_completion_rate ? parseFloat(row.on_time_completion_rate) : null,
      },
      tags: row.tags || [],
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  
  private mapCommunicationLog(row: any): CommunicationLog {
    return {
      id: row.id,
      projectId: row.project_id,
      organizationId: row.organization_id,
      teamMemberId: row.team_member_id,
      vendorId: row.vendor_id,
      contactName: row.contact_name,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
      communicationType: row.communication_type,
      direction: row.direction,
      subject: row.subject,
      summary: row.summary,
      notes: row.notes,
      communicationDate: row.communication_date,
      communicationTime: row.communication_time,
      durationMinutes: row.duration_minutes,
      outcome: row.outcome,
      followUpRequired: row.follow_up_required,
      followUpDate: row.follow_up_date,
      followUpNotes: row.follow_up_notes,
      attachments: row.attachments || [],
      tags: row.tags || [],
      isImportant: row.is_important,
      status: row.status,
      loggedBy: row.logged_by,
      loggedAt: row.logged_at,
    };
  }

  // ============================================================================
  // ROLES
  // ============================================================================

  private static readonly GHANA_ROLES: Array<{ role: GhanaTeamRole; category: string; displayName: string; description: string }> = [
    // Internal
    { role: 'project_owner', category: 'internal', displayName: 'Project Owner', description: 'Owner/developer of the project' },
    { role: 'project_manager', category: 'internal', displayName: 'Project Manager', description: 'Overall project coordinator' },
    { role: 'assistant_project_manager', category: 'internal', displayName: 'Assistant PM', description: 'Supports the project manager' },
    { role: 'site_manager', category: 'internal', displayName: 'Site Manager', description: 'On-site operations manager' },
    { role: 'accountant', category: 'internal', displayName: 'Accountant', description: 'Financial management' },
    { role: 'procurement_officer', category: 'internal', displayName: 'Procurement Officer', description: 'Manages purchasing and suppliers' },
    { role: 'security_coordinator', category: 'internal', displayName: 'Security Coordinator', description: 'Site security management' },
    { role: 'logistics_coordinator', category: 'internal', displayName: 'Logistics Coordinator', description: 'Materials and transport logistics' },
    { role: 'mobile_money_agent', category: 'internal', displayName: 'Mobile Money Agent', description: 'Handles mobile payment operations' },
    // Consultant
    { role: 'architect', category: 'consultant', displayName: 'Architect', description: 'Building design and planning' },
    { role: 'structural_engineer', category: 'consultant', displayName: 'Structural Engineer', description: 'Structural design and analysis' },
    { role: 'quantity_surveyor', category: 'consultant', displayName: 'Quantity Surveyor', description: 'Cost estimation and BOQ' },
    { role: 'mechanical_engineer', category: 'consultant', displayName: 'Mechanical Engineer', description: 'HVAC and mechanical systems' },
    { role: 'electrical_engineer', category: 'consultant', displayName: 'Electrical Engineer', description: 'Electrical systems design' },
    { role: 'civil_engineer', category: 'consultant', displayName: 'Civil Engineer', description: 'Civil works and infrastructure' },
    { role: 'geotechnical_engineer', category: 'consultant', displayName: 'Geotechnical Engineer', description: 'Soil and foundation analysis' },
    { role: 'interior_designer', category: 'consultant', displayName: 'Interior Designer', description: 'Interior space design' },
    { role: 'surveyor', category: 'consultant', displayName: 'Surveyor', description: 'Land and building surveying' },
    { role: 'legal_advisor', category: 'consultant', displayName: 'Legal Advisor', description: 'Legal counsel and contract review' },
    { role: 'consultant', category: 'consultant', displayName: 'Consultant', description: 'General project consultant' },
    // Contractor
    { role: 'main_contractor', category: 'contractor', displayName: 'Main Contractor', description: 'Primary construction contractor' },
    { role: 'site_supervisor', category: 'contractor', displayName: 'Site Supervisor', description: 'Supervises construction on-site' },
    { role: 'foreman', category: 'contractor', displayName: 'Foreman', description: 'Leads construction crew' },
    { role: 'safety_officer', category: 'contractor', displayName: 'Safety Officer', description: 'Site health & safety' },
    { role: 'electrical_contractor', category: 'contractor', displayName: 'Electrical Contractor', description: 'Electrical installations' },
    { role: 'plumbing_contractor', category: 'contractor', displayName: 'Plumbing Contractor', description: 'Plumbing and water systems' },
    { role: 'masonry_contractor', category: 'contractor', displayName: 'Masonry Contractor', description: 'Block laying and masonry works' },
    { role: 'steel_contractor', category: 'contractor', displayName: 'Steel Contractor', description: 'Steel fabrication and fixing' },
    { role: 'roofing_contractor', category: 'contractor', displayName: 'Roofing Contractor', description: 'Roofing installations' },
    { role: 'painting_contractor', category: 'contractor', displayName: 'Painting Contractor', description: 'Interior and exterior painting' },
    { role: 'tiling_contractor', category: 'contractor', displayName: 'Tiling Contractor', description: 'Floor and wall tiling' },
    { role: 'landscaping_contractor', category: 'contractor', displayName: 'Landscaping Contractor', description: 'Landscape and outdoor works' },
    { role: 'hvac_contractor', category: 'contractor', displayName: 'HVAC Contractor', description: 'Air conditioning and ventilation' },
    // Government
    { role: 'lands_commission_officer', category: 'government', displayName: 'Lands Commission Officer', description: 'Land registration and title' },
    { role: 'assembly_officer', category: 'government', displayName: 'Assembly Officer', description: 'District/Municipal assembly liaison' },
    { role: 'fire_service_inspector', category: 'government', displayName: 'Fire Service Inspector', description: 'Fire safety compliance' },
    { role: 'epa_officer', category: 'government', displayName: 'EPA Officer', description: 'Environmental compliance' },
    { role: 'town_planning_officer', category: 'government', displayName: 'Town Planning Officer', description: 'Building permits and zoning' },
    // Stakeholder
    { role: 'traditional_chief', category: 'stakeholder', displayName: 'Traditional Chief', description: 'Traditional authority / chief' },
    { role: 'community_liaison', category: 'stakeholder', displayName: 'Community Liaison', description: 'Community engagement representative' },
    { role: 'investor', category: 'stakeholder', displayName: 'Investor', description: 'Project investor or financier' },
    { role: 'financier', category: 'stakeholder', displayName: 'Financier', description: 'Bank or financial institution rep' },
    // Other
    { role: 'other', category: 'other', displayName: 'Other', description: 'Other team role' },
  ];

  async getGhanaRoles(): Promise<Array<{ role: GhanaTeamRole; category: string; displayName: string; description: string }>> {
    return TeamService.GHANA_ROLES;
  }

  async getRolesByCategory(category: string): Promise<Array<{ role: GhanaTeamRole; category: string; displayName: string; description: string }>> {
    return TeamService.GHANA_ROLES.filter(r => r.category === category);
  }

  // ============================================================================
  // MISSING COMMUNICATION METHODS
  // ============================================================================

  async getCommunicationLogs(filters: any = {}, limit = 50, offset = 0): Promise<{ logs: CommunicationLog[]; total: number }> {
    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (filters.projectId) { conditions.push(`project_id = $${idx++}`); values.push(filters.projectId); }
    if (filters.organizationId) { conditions.push(`organization_id = $${idx++}`); values.push(filters.organizationId); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows, countRow] = await Promise.all([
      pool.query(`SELECT * FROM communication_logs ${where} ORDER BY communication_date DESC LIMIT $${idx++} OFFSET $${idx++}`, [...values, limit, offset]),
      pool.query(`SELECT COUNT(*) FROM communication_logs ${where}`, values),
    ]);
    return { logs: rows.rows.map(r => this.mapCommunicationLog(r)), total: parseInt(countRow.rows[0].count) };
  }

  async getCommunicationById(id: string): Promise<CommunicationLog | null> {
    const result = await pool.query(`SELECT * FROM communication_logs WHERE id = $1`, [id]);
    return result.rows[0] ? this.mapCommunicationLog(result.rows[0]) : null;
  }

  async updateCommunication(id: string, updates: any): Promise<CommunicationLog> {
    const allowed = ['subject', 'summary', 'notes', 'outcome', 'follow_up_required', 'follow_up_date', 'follow_up_notes', 'is_important', 'status', 'communication_date', 'communication_type', 'direction'];
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const key of allowed) {
      const val = updates[key] ?? updates[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())];
      if (val !== undefined) { fields.push(`${key} = $${idx++}`); values.push(val); }
    }
    if (fields.length === 0) {
      const row = await pool.query(`SELECT * FROM communication_logs WHERE id = $1`, [id]);
      return this.mapCommunicationLog(row.rows[0]);
    }
    values.push(id);
    const result = await pool.query(`UPDATE communication_logs SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`, values);
    return this.mapCommunicationLog(result.rows[0]);
  }

  async deleteCommunication(id: string): Promise<void> {
    await pool.query(`DELETE FROM communication_logs WHERE id = $1`, [id]);
  }

  // ============================================================================
  // MISSING VENDOR METHODS
  // ============================================================================

  async updateVendor(id: string, updates: any): Promise<Vendor> {
    const allowed = ['business_name', 'contact_person', 'phone_primary', 'phone_secondary', 'email', 'address', 'region', 'tin_number', 'business_registration', 'notes', 'bank_name', 'bank_account_number', 'mobile_money_number'];
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    // Accept snake_case or camelCase aliases
    const aliases: Record<string, string> = { name: 'business_name', contact_name: 'contact_person', phone: 'phone_primary' };
    const merged = { ...updates };
    for (const [alias, col] of Object.entries(aliases)) {
      if (merged[alias] !== undefined && merged[col] === undefined) merged[col] = merged[alias];
    }
    for (const key of allowed) {
      if (merged[key] !== undefined) { fields.push(`${key} = $${idx++}`); values.push(merged[key]); }
    }
    if (fields.length === 0) {
      const row = await pool.query(`SELECT * FROM vendors WHERE id = $1`, [id]);
      return this.mapVendor(row.rows[0]);
    }
    values.push(id);
    const result = await pool.query(`UPDATE vendors SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`, values);
    return this.mapVendor(result.rows[0]);
  }

  async deleteVendor(id: string): Promise<void> {
    await pool.query(`DELETE FROM vendors WHERE id = $1`, [id]);
  }

  async getVendorRatings(vendorId: string): Promise<any[]> {
    const result = await pool.query(`SELECT * FROM pm_vendor_ratings WHERE vendor_id = $1 ORDER BY created_at DESC`, [vendorId]);
    return result.rows;
  }

  async getVendorRatingSummary(vendorId: string): Promise<any> {
    const result = await pool.query(
      `SELECT COUNT(*) as total, AVG(rating)::numeric(3,2) as average,
              AVG(quality_rating)::numeric(3,2) as quality_avg,
              AVG(timeliness_rating)::numeric(3,2) as timeliness_avg,
              AVG(communication_rating)::numeric(3,2) as communication_avg
       FROM pm_vendor_ratings WHERE vendor_id = $1`,
      [vendorId]
    );
    return result.rows[0];
  }

  async addVendorRating(vendorId: string, ratedBy: string, data: any): Promise<any> {
    const result = await pool.query(
      `INSERT INTO pm_vendor_ratings (vendor_id, rated_by, rating, quality_rating, timeliness_rating, communication_rating, value_rating, comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [vendorId, ratedBy, data.rating, data.criteria?.quality || null, data.criteria?.timeliness || null, data.criteria?.communication || null, data.criteria?.value || null, data.comment || null]
    );
    return result.rows[0];
  }

  async getVendorAssignments(vendorId: string): Promise<any[]> {
    const result = await pool.query(`SELECT * FROM project_vendor_assignments WHERE vendor_id = $1 ORDER BY created_at DESC`, [vendorId]);
    return result.rows;
  }

  async createVendorAssignment(vendorId: string, assignedBy: string, data: any): Promise<any> {
    const orgId = data.organization_id || data.organizationId;
    const projectId = data.project_id || data.projectId;
    const workScope = data.scope || data.work_scope || data.workScope || 'General services';
    const result = await pool.query(
      `INSERT INTO project_vendor_assignments (vendor_id, project_id, organization_id, work_scope, work_category, contract_value, contract_start_date, contract_end_date, assigned_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [vendorId, projectId, orgId, workScope, data.work_category || null, data.contract_value || null, data.start_date || data.contract_start_date || null, data.end_date || data.contract_end_date || null, assignedBy]
    );
    return result.rows[0];
  }
}

// Export singleton
export const teamService = new TeamService();
export default teamService;
