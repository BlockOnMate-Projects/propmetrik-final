/**
 * Team Member Service
 * 
 * Phase 3.4: Split teamService
 * 
 * Manages project team members:
 * - Adding/removing team members
 * - Role and permission management
 * - Team organization by category
 * 
 * @module services/project-management/team/TeamMemberService
 */

import { pool } from '../../../database';
import { BaseService } from '../../base/BaseService';
import { eventBus } from '../events/EventBus';
import {
  ProjectTeamMember,
  TeamMemberFilters,
  AddTeamMemberInput,
  UpdateTeamMemberInput,
  TeamMemberPermissions,
  GhanaTeamRole,
  RoleCategory,
} from './types';

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class TeamMemberServiceImpl extends BaseService {
  constructor() {
    super('TeamMemberService');
  }

  // ==========================================================================
  // CRUD OPERATIONS
  // ==========================================================================

  async addTeamMember(input: AddTeamMemberInput): Promise<ProjectTeamMember> {
    const result = await this.query(
      `INSERT INTO pm_project_team (
         project_id, organization_id, user_id, vendor_id,
         full_name, email, phone, phone_alt, whatsapp,
         role, role_type, role_category, title, department, company,
         responsibilities, assignment_type,
         can_view, can_edit, can_approve_costs, can_upload_documents,
         can_add_tasks, can_manage_team, can_view_financials, can_receive_notifications,
         start_date, end_date,
         hourly_rate, daily_rate, monthly_rate, rate_currency,
         avatar_url
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
         $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32
       )
       RETURNING *`,
      [
        input.projectId,
        input.organizationId,
        input.userId || null,
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
        input.canUploadDocuments ?? false,
        input.canAddTasks ?? false,
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
      ]
    );

    const member = this.mapRow(result.rows[0]);

    eventBus.emit('team.member.added', {
      memberId: member.id,
      projectId: input.projectId,
      role: input.role,
    });

    return member;
  }

  async getTeamMemberById(id: string): Promise<ProjectTeamMember | null> {
    const result = await this.query(
      `SELECT * FROM pm_project_team WHERE id = $1`,
      [id]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async getProjectTeam(projectId: string, includeInactive = false): Promise<ProjectTeamMember[]> {
    const activeClause = includeInactive ? '' : 'AND is_active = true';
    
    const result = await this.query(
      `SELECT * FROM pm_project_team
       WHERE project_id = $1 ${activeClause}
       ORDER BY 
         CASE role_category 
           WHEN 'internal' THEN 1 
           WHEN 'contractor' THEN 2 
           WHEN 'consultant' THEN 3 
           ELSE 4 
         END,
         full_name`,
      [projectId]
    );

    return result.rows.map(this.mapRow);
  }

  async getTeamMembers(filters: TeamMemberFilters): Promise<{ members: ProjectTeamMember[]; total: number }> {
    const conditions: string[] = [];
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

    if (filters.roleCategory) {
      conditions.push(`role_category = $${paramIndex++}`);
      params.push(filters.roleCategory);
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
        company ILIKE $${paramIndex}
      )`);
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 50;
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      this.query(
        `SELECT * FROM pm_project_team ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, pageSize, offset]
      ),
      this.query(
        `SELECT COUNT(*) as total FROM pm_project_team ${whereClause}`,
        params
      ),
    ]);

    return {
      members: dataResult.rows.map(this.mapRow),
      total: parseInt(countResult.rows[0].total, 10),
    };
  }

  async getTeamByCategory(projectId: string, category: RoleCategory): Promise<ProjectTeamMember[]> {
    const result = await this.query(
      `SELECT * FROM pm_project_team
       WHERE project_id = $1 AND role_category = $2 AND is_active = true
       ORDER BY full_name`,
      [projectId, category]
    );
    return result.rows.map(this.mapRow);
  }

  // ==========================================================================
  // UPDATES
  // ==========================================================================

  async updateMemberRole(
    memberId: string,
    role: string,
    roleType?: GhanaTeamRole,
    roleCategory?: RoleCategory
  ): Promise<ProjectTeamMember | null> {
    const updates: string[] = ['role = $2', 'updated_at = NOW()'];
    const params: any[] = [memberId, role];
    let paramIndex = 3;

    if (roleType) {
      updates.push(`role_type = $${paramIndex++}`);
      params.push(roleType);
    }

    if (roleCategory) {
      updates.push(`role_category = $${paramIndex++}`);
      params.push(roleCategory);
    }

    const result = await this.query(
      `UPDATE pm_project_team SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );

    if (result.rows.length) {
      eventBus.emit('team.member.role_changed', {
        memberId,
        role,
        roleType,
      });
    }

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async updateMemberPermissions(
    memberId: string,
    permissions: Partial<TeamMemberPermissions>
  ): Promise<ProjectTeamMember | null> {
    const updates: string[] = ['updated_at = NOW()'];
    const params: any[] = [memberId];
    let paramIndex = 2;

    if (permissions.canView !== undefined) {
      updates.push(`can_view = $${paramIndex++}`);
      params.push(permissions.canView);
    }
    if (permissions.canEdit !== undefined) {
      updates.push(`can_edit = $${paramIndex++}`);
      params.push(permissions.canEdit);
    }
    if (permissions.canApproveCosts !== undefined) {
      updates.push(`can_approve_costs = $${paramIndex++}`);
      params.push(permissions.canApproveCosts);
    }
    if (permissions.canUploadDocuments !== undefined) {
      updates.push(`can_upload_documents = $${paramIndex++}`);
      params.push(permissions.canUploadDocuments);
    }
    if (permissions.canAddTasks !== undefined) {
      updates.push(`can_add_tasks = $${paramIndex++}`);
      params.push(permissions.canAddTasks);
    }
    if (permissions.canManageTeam !== undefined) {
      updates.push(`can_manage_team = $${paramIndex++}`);
      params.push(permissions.canManageTeam);
    }
    if (permissions.canViewFinancials !== undefined) {
      updates.push(`can_view_financials = $${paramIndex++}`);
      params.push(permissions.canViewFinancials);
    }
    if (permissions.canReceiveNotifications !== undefined) {
      updates.push(`can_receive_notifications = $${paramIndex++}`);
      params.push(permissions.canReceiveNotifications);
    }

    const result = await this.query(
      `UPDATE pm_project_team SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );

    if (result.rows.length) {
      eventBus.emit('team.member.permissions_changed', {
        memberId,
        permissions,
      });
    }

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async updateMemberActivity(memberId: string): Promise<void> {
    await this.query(
      `UPDATE pm_project_team SET last_active_date = NOW() WHERE id = $1`,
      [memberId]
    );
  }

  async deactivateMember(memberId: string): Promise<ProjectTeamMember | null> {
    const result = await this.query(
      `UPDATE pm_project_team SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [memberId]
    );

    if (result.rows.length) {
      eventBus.emit('team.member.deactivated', { memberId });
    }

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async removeTeamMember(memberId: string): Promise<void> {
    const result = await this.query(
      `DELETE FROM pm_project_team WHERE id = $1 RETURNING project_id`,
      [memberId]
    );

    if (result.rows.length) {
      eventBus.emit('team.member.removed', {
        memberId,
        projectId: result.rows[0].project_id,
      });
    }
  }

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  async getTeamMembersByUser(userId: string): Promise<ProjectTeamMember[]> {
    const result = await this.query(
      `SELECT * FROM pm_project_team WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows.map(this.mapRow);
  }

  async getProjectManagers(projectId: string): Promise<ProjectTeamMember[]> {
    const result = await this.query(
      `SELECT * FROM pm_project_team
       WHERE project_id = $1 
         AND is_active = true 
         AND role_type IN ('project_owner', 'project_manager', 'assistant_project_manager')
       ORDER BY 
         CASE role_type 
           WHEN 'project_owner' THEN 1 
           WHEN 'project_manager' THEN 2 
           ELSE 3 
         END`,
      [projectId]
    );
    return result.rows.map(this.mapRow);
  }

  async getMembersWithPermission(
    projectId: string,
    permission: keyof TeamMemberPermissions
  ): Promise<ProjectTeamMember[]> {
    const columnName = this.permissionToColumn(permission);
    
    const result = await this.query(
      `SELECT * FROM pm_project_team
       WHERE project_id = $1 AND is_active = true AND ${columnName} = true
       ORDER BY full_name`,
      [projectId]
    );
    return result.rows.map(this.mapRow);
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private permissionToColumn(permission: keyof TeamMemberPermissions): string {
    const mapping: Record<keyof TeamMemberPermissions, string> = {
      canView: 'can_view',
      canEdit: 'can_edit',
      canApproveCosts: 'can_approve_costs',
      canUploadDocuments: 'can_upload_documents',
      canAddTasks: 'can_add_tasks',
      canManageTeam: 'can_manage_team',
      canViewFinancials: 'can_view_financials',
      canReceiveNotifications: 'can_receive_notifications',
    };
    return mapping[permission];
  }

  private mapRow(row: any): ProjectTeamMember {
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
      startDate: row.start_date ? new Date(row.start_date) : null,
      endDate: row.end_date ? new Date(row.end_date) : null,
      lastActiveDate: row.last_active_date ? new Date(row.last_active_date) : null,
      isActive: row.is_active,
      status: row.status,
      hourlyRate: row.hourly_rate,
      dailyRate: row.daily_rate,
      monthlyRate: row.monthly_rate,
      rateCurrency: row.rate_currency,
      avatarUrl: row.avatar_url,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const teamMemberService = new TeamMemberServiceImpl();
