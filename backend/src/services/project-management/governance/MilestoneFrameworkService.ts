/**
 * Milestone Framework Service
 * 
 * Phase 1.2: Enterprise Governance Model
 * 
 * Admin-only service for creating and managing milestone frameworks.
 * Frameworks define the organizational standard for project structure:
 * - What phases a project should have
 * - What milestones each phase should contain
 * - Timing and dependency rules
 * - Compliance requirements
 * 
 * @module services/project-management/governance/MilestoneFrameworkService
 */

import { Pool, PoolClient } from 'pg';
import { pool } from '../../../database';
import { BaseService } from '../../base/BaseService';
import {
  UUID,
  ProjectType,
  PaginatedResponse,
  PaginationParams,
  AuditAction,
} from '../types';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  GovernanceError,
} from '../errors';
import { eventBus, ProjectEventType, createEntityChangeEvent } from '../events';

// =============================================================================
// TYPES
// =============================================================================

export interface MilestoneFramework {
  id: UUID;
  organizationId: UUID;
  name: string;
  code?: string;
  description?: string;
  projectType: string;
  region?: string;
  version: number;
  isActive: boolean;
  isLocked: boolean;
  lockedAt?: Date;
  lockedBy?: UUID;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: UUID;
  updatedBy?: UUID;
  phases?: FrameworkPhase[];
}

export interface FrameworkPhase {
  id: UUID;
  frameworkId: UUID;
  name: string;
  code?: string;
  description?: string;
  sequenceOrder: number;
  defaultDurationDays?: number;
  bufferDays: number;
  isRequired: boolean;
  canOverlapPrevious: boolean;
  maxOverlapPercentage: number;
  allowedMilestoneTypes: string[];
  requiredMilestoneTypes: string[];
  createdAt: Date;
  updatedAt: Date;
  milestones?: MilestoneTemplate[];
}

export interface MilestoneTemplate {
  id: UUID;
  frameworkPhaseId: UUID;
  name: string;
  code?: string;
  description?: string;
  milestoneType: string;
  sequenceOrder: number;
  defaultDayOffset: number;
  defaultDurationDays: number;
  isRequired: boolean;
  requiresClientApproval: boolean;
  requiresInspection: boolean;
  requiresDocumentation: boolean;
  paymentPercentage?: number;
  complianceType?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFrameworkInput {
  name: string;
  code?: string;
  description?: string;
  projectType: string;
  region?: string;
  phases?: CreatePhaseInput[];
}

export interface CreatePhaseInput {
  name: string;
  code?: string;
  description?: string;
  sequenceOrder: number;
  defaultDurationDays?: number;
  bufferDays?: number;
  isRequired?: boolean;
  canOverlapPrevious?: boolean;
  maxOverlapPercentage?: number;
  allowedMilestoneTypes?: string[];
  requiredMilestoneTypes?: string[];
  milestones?: CreateMilestoneTemplateInput[];
}

export interface CreateMilestoneTemplateInput {
  name: string;
  code?: string;
  description?: string;
  milestoneType: string;
  sequenceOrder: number;
  defaultDayOffset?: number;
  defaultDurationDays?: number;
  isRequired?: boolean;
  requiresClientApproval?: boolean;
  requiresInspection?: boolean;
  requiresDocumentation?: boolean;
  paymentPercentage?: number;
  complianceType?: string;
}

export interface ApplyFrameworkInput {
  projectId: UUID;
  frameworkId: UUID;
  startDate: Date;
  deviationNotes?: string;
}

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class MilestoneFrameworkServiceImpl extends BaseService {
  constructor() {
    super('MilestoneFrameworkService');
  }

  // ===========================================================================
  // ROW MAPPING
  // ===========================================================================

  protected mapRow(row: any): MilestoneFramework {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      code: row.code,
      description: row.description,
      projectType: row.project_type,
      region: row.region,
      version: row.version,
      isActive: row.is_active,
      isLocked: row.is_locked,
      lockedAt: row.locked_at,
      lockedBy: row.locked_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
    };
  }

  protected mapPhaseRow(row: any): FrameworkPhase {
    return {
      id: row.id,
      frameworkId: row.framework_id,
      name: row.name,
      code: row.code,
      description: row.description,
      sequenceOrder: row.sequence_order,
      defaultDurationDays: row.default_duration_days,
      bufferDays: row.buffer_days || 0,
      isRequired: row.is_required,
      canOverlapPrevious: row.can_overlap_previous,
      maxOverlapPercentage: row.max_overlap_percentage || 0,
      allowedMilestoneTypes: row.allowed_milestone_types || [],
      requiredMilestoneTypes: row.required_milestone_types || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected mapTemplateRow(row: any): MilestoneTemplate {
    return {
      id: row.id,
      frameworkPhaseId: row.framework_phase_id,
      name: row.name,
      code: row.code,
      description: row.description,
      milestoneType: row.milestone_type,
      sequenceOrder: row.sequence_order,
      defaultDayOffset: row.default_day_offset || 0,
      defaultDurationDays: row.default_duration_days || 1,
      isRequired: row.is_required,
      requiresClientApproval: row.requires_client_approval,
      requiresInspection: row.requires_inspection,
      requiresDocumentation: row.requires_documentation,
      paymentPercentage: row.payment_percentage,
      complianceType: row.compliance_type,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ===========================================================================
  // FRAMEWORK CRUD
  // ===========================================================================

  /**
   * Create a new milestone framework.
   * Admin only.
   */
  async createFramework(
    organizationId: UUID,
    input: CreateFrameworkInput,
    userId: UUID
  ): Promise<MilestoneFramework> {
    // Validate input
    if (!input.name?.trim()) {
      throw ValidationError.missingField('name');
    }
    if (!input.projectType?.trim()) {
      throw ValidationError.missingField('projectType');
    }

    return this.executeInTransaction(async (client) => {
      // Create framework
      const frameworkResult = await client.query(
        `INSERT INTO pm_milestone_frameworks 
         (organization_id, name, code, description, project_type, region, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          organizationId,
          input.name.trim(),
          input.code?.trim() || null,
          input.description?.trim() || null,
          input.projectType,
          input.region || null,
          userId,
        ]
      );

      const framework = this.mapRow(frameworkResult.rows[0]);

      // Create phases if provided
      if (input.phases?.length) {
        const phases: FrameworkPhase[] = [];
        
        for (const phaseInput of input.phases) {
          const phase = await this.createPhaseInternal(client, framework.id, phaseInput, userId);
          phases.push(phase);
        }
        
        framework.phases = phases;
      }

      // Emit event
      createEntityChangeEvent(
        ProjectEventType.FRAMEWORK_APPLIED,
        'milestone_framework',
        framework.id,
        AuditAction.CREATE,
        { userId, organizationId }
      );

      return framework;
    });
  }

  /**
   * Get framework by ID with all phases and milestones.
   */
  async getFrameworkById(frameworkId: UUID): Promise<MilestoneFramework> {
    const result = await this.query(
      `SELECT * FROM pm_milestone_frameworks 
       WHERE id = $1 AND deleted_at IS NULL`,
      [frameworkId]
    );

    if (result.rows.length === 0) {
      throw NotFoundError.forResource('MilestoneFramework', frameworkId);
    }

    const framework = this.mapRow(result.rows[0]);
    
    // Load phases
    framework.phases = await this.getFrameworkPhases(frameworkId);

    return framework;
  }

  /**
   * Get all phases for a framework.
   */
  async getFrameworkPhases(frameworkId: UUID): Promise<FrameworkPhase[]> {
    const result = await this.query(
      `SELECT * FROM pm_framework_phases 
       WHERE framework_id = $1 
       ORDER BY sequence_order`,
      [frameworkId]
    );

    const phases = result.rows.map(row => this.mapPhaseRow(row));

    // Load milestone templates for each phase
    for (const phase of phases) {
      phase.milestones = await this.getPhaseTemplates(phase.id);
    }

    return phases;
  }

  /**
   * Get all milestone templates for a phase.
   */
  async getPhaseTemplates(phaseId: UUID): Promise<MilestoneTemplate[]> {
    const result = await this.query(
      `SELECT * FROM pm_milestone_templates 
       WHERE framework_phase_id = $1 
       ORDER BY sequence_order`,
      [phaseId]
    );

    return result.rows.map(row => this.mapTemplateRow(row));
  }

  /**
   * List frameworks for an organization.
   */
  async listFrameworks(
    organizationId: UUID,
    options: {
      projectType?: string;
      region?: string;
      activeOnly?: boolean;
    } & PaginationParams
  ): Promise<PaginatedResponse<MilestoneFramework>> {
    const { page = 1, limit = 20, projectType, region, activeOnly = true } = options;
    const offset = (page - 1) * limit;

    const conditions: string[] = ['organization_id = $1', 'deleted_at IS NULL'];
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (projectType) {
      conditions.push(`project_type = $${paramIndex++}`);
      params.push(projectType);
    }

    if (region) {
      conditions.push(`region = $${paramIndex++}`);
      params.push(region);
    }

    if (activeOnly) {
      conditions.push('is_active = true');
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await this.query(
      `SELECT COUNT(*) FROM pm_milestone_frameworks WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get frameworks
    const result = await this.query(
      `SELECT * FROM pm_milestone_frameworks 
       WHERE ${whereClause}
       ORDER BY name
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, limit, offset]
    );

    const data = result.rows.map(row => this.mapRow(row));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    };
  }

  /**
   * Update a framework.
   * Cannot update if locked.
   */
  async updateFramework(
    frameworkId: UUID,
    updates: Partial<CreateFrameworkInput>,
    userId: UUID
  ): Promise<MilestoneFramework> {
    const framework = await this.getFrameworkById(frameworkId);

    if (framework.isLocked) {
      throw GovernanceError.frameworkLocked(frameworkId);
    }

    const result = await this.query(
      `UPDATE pm_milestone_frameworks SET
        name = COALESCE($1, name),
        code = COALESCE($2, code),
        description = COALESCE($3, description),
        project_type = COALESCE($4, project_type),
        region = COALESCE($5, region),
        updated_at = NOW(),
        updated_by = $6
       WHERE id = $7
       RETURNING *`,
      [
        updates.name?.trim(),
        updates.code?.trim(),
        updates.description?.trim(),
        updates.projectType,
        updates.region,
        userId,
        frameworkId,
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Lock a framework (prevents modifications).
   * Automatically called when framework is applied to a project.
   */
  async lockFramework(frameworkId: UUID, userId: UUID): Promise<MilestoneFramework> {
    const result = await this.query(
      `UPDATE pm_milestone_frameworks SET
        is_locked = true,
        locked_at = NOW(),
        locked_by = $1,
        updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [userId, frameworkId]
    );

    if (result.rows.length === 0) {
      throw NotFoundError.forResource('MilestoneFramework', frameworkId);
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * Create a new version of a framework (for making changes to locked frameworks).
   */
  async createNewVersion(frameworkId: UUID, userId: UUID): Promise<MilestoneFramework> {
    const original = await this.getFrameworkById(frameworkId);

    return this.executeInTransaction(async (client) => {
      // Create new framework with incremented version
      const newFramework = await client.query(
        `INSERT INTO pm_milestone_frameworks 
         (organization_id, name, code, description, project_type, region, version, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          original.organizationId,
          original.name,
          original.code,
          original.description,
          original.projectType,
          original.region,
          original.version + 1,
          userId,
        ]
      );

      const newFrameworkData = this.mapRow(newFramework.rows[0]);

      // Copy phases
      if (original.phases?.length) {
        const phases: FrameworkPhase[] = [];
        
        for (const originalPhase of original.phases) {
          const phaseResult = await client.query(
            `INSERT INTO pm_framework_phases 
             (framework_id, name, code, description, sequence_order, default_duration_days,
              buffer_days, is_required, can_overlap_previous, max_overlap_percentage,
              allowed_milestone_types, required_milestone_types, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING *`,
            [
              newFrameworkData.id,
              originalPhase.name,
              originalPhase.code,
              originalPhase.description,
              originalPhase.sequenceOrder,
              originalPhase.defaultDurationDays,
              originalPhase.bufferDays,
              originalPhase.isRequired,
              originalPhase.canOverlapPrevious,
              originalPhase.maxOverlapPercentage,
              originalPhase.allowedMilestoneTypes,
              originalPhase.requiredMilestoneTypes,
              userId,
            ]
          );

          const newPhase = this.mapPhaseRow(phaseResult.rows[0]);

          // Copy milestone templates
          if (originalPhase.milestones?.length) {
            for (const template of originalPhase.milestones) {
              await client.query(
                `INSERT INTO pm_milestone_templates 
                 (framework_phase_id, name, code, description, milestone_type, sequence_order,
                  default_day_offset, default_duration_days, is_required, requires_client_approval,
                  requires_inspection, requires_documentation, payment_percentage, compliance_type, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
                [
                  newPhase.id,
                  template.name,
                  template.code,
                  template.description,
                  template.milestoneType,
                  template.sequenceOrder,
                  template.defaultDayOffset,
                  template.defaultDurationDays,
                  template.isRequired,
                  template.requiresClientApproval,
                  template.requiresInspection,
                  template.requiresDocumentation,
                  template.paymentPercentage,
                  template.complianceType,
                  userId,
                ]
              );
            }
          }

          phases.push(newPhase);
        }

        newFrameworkData.phases = phases;
      }

      // Deactivate old version
      await client.query(
        `UPDATE pm_milestone_frameworks SET is_active = false WHERE id = $1`,
        [frameworkId]
      );

      return newFrameworkData;
    });
  }

  // ===========================================================================
  // PHASE MANAGEMENT
  // ===========================================================================

  /**
   * Internal method to create a phase within a transaction.
   */
  private async createPhaseInternal(
    client: PoolClient,
    frameworkId: UUID,
    input: CreatePhaseInput,
    userId: UUID
  ): Promise<FrameworkPhase> {
    const phaseResult = await client.query(
      `INSERT INTO pm_framework_phases 
       (framework_id, name, code, description, sequence_order, default_duration_days,
        buffer_days, is_required, can_overlap_previous, max_overlap_percentage,
        allowed_milestone_types, required_milestone_types, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        frameworkId,
        input.name,
        input.code || null,
        input.description || null,
        input.sequenceOrder,
        input.defaultDurationDays || null,
        input.bufferDays || 0,
        input.isRequired ?? true,
        input.canOverlapPrevious ?? false,
        input.maxOverlapPercentage || 0,
        input.allowedMilestoneTypes || [],
        input.requiredMilestoneTypes || [],
        userId,
      ]
    );

    const phase = this.mapPhaseRow(phaseResult.rows[0]);

    // Create milestone templates if provided
    if (input.milestones?.length) {
      phase.milestones = [];
      
      for (const milestoneInput of input.milestones) {
        const template = await this.createTemplateInternal(client, phase.id, milestoneInput, userId);
        phase.milestones.push(template);
      }
    }

    return phase;
  }

  /**
   * Add a phase to an existing framework.
   */
  async addPhase(
    frameworkId: UUID,
    input: CreatePhaseInput,
    userId: UUID
  ): Promise<FrameworkPhase> {
    const framework = await this.getFrameworkById(frameworkId);

    if (framework.isLocked) {
      throw GovernanceError.frameworkLocked(frameworkId);
    }

    return this.executeInTransaction(async (client) => {
      return this.createPhaseInternal(client, frameworkId, input, userId);
    });
  }

  // ===========================================================================
  // MILESTONE TEMPLATE MANAGEMENT
  // ===========================================================================

  /**
   * Internal method to create a milestone template within a transaction.
   */
  private async createTemplateInternal(
    client: PoolClient,
    phaseId: UUID,
    input: CreateMilestoneTemplateInput,
    userId: UUID
  ): Promise<MilestoneTemplate> {
    const result = await client.query(
      `INSERT INTO pm_milestone_templates 
       (framework_phase_id, name, code, description, milestone_type, sequence_order,
        default_day_offset, default_duration_days, is_required, requires_client_approval,
        requires_inspection, requires_documentation, payment_percentage, compliance_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        phaseId,
        input.name,
        input.code || null,
        input.description || null,
        input.milestoneType,
        input.sequenceOrder,
        input.defaultDayOffset || 0,
        input.defaultDurationDays || 1,
        input.isRequired ?? true,
        input.requiresClientApproval ?? false,
        input.requiresInspection ?? false,
        input.requiresDocumentation ?? false,
        input.paymentPercentage || null,
        input.complianceType || null,
        userId,
      ]
    );

    return this.mapTemplateRow(result.rows[0]);
  }

  /**
   * Add a milestone template to a phase.
   */
  async addMilestoneTemplate(
    phaseId: UUID,
    input: CreateMilestoneTemplateInput,
    userId: UUID
  ): Promise<MilestoneTemplate> {
    // Check if phase's framework is locked
    const phaseResult = await this.query(
      `SELECT fp.*, mf.is_locked 
       FROM pm_framework_phases fp
       JOIN pm_milestone_frameworks mf ON mf.id = fp.framework_id
       WHERE fp.id = $1`,
      [phaseId]
    );

    if (phaseResult.rows.length === 0) {
      throw NotFoundError.forResource('FrameworkPhase', phaseId);
    }

    if (phaseResult.rows[0].is_locked) {
      throw GovernanceError.frameworkLocked(phaseResult.rows[0].framework_id);
    }

    return this.executeInTransaction(async (client) => {
      return this.createTemplateInternal(client, phaseId, input, userId);
    });
  }

  // ===========================================================================
  // APPLY FRAMEWORK TO PROJECT
  // ===========================================================================

  /**
   * Apply a framework to a project, creating concrete phases and milestones.
   */
  async applyToProject(input: ApplyFrameworkInput, userId: UUID): Promise<void> {
    const framework = await this.getFrameworkById(input.frameworkId);

    if (!framework.isActive) {
      throw new ValidationError('Cannot apply inactive framework');
    }

    return this.executeInTransaction(async (client) => {
      // Record the framework application
      await client.query(
        `INSERT INTO pm_project_framework_applications 
         (project_id, framework_id, framework_version, applied_by, deviation_notes)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (project_id) 
         DO UPDATE SET 
           framework_id = $2, 
           framework_version = $3,
           applied_at = NOW(),
           applied_by = $4,
           deviation_notes = $5`,
        [
          input.projectId,
          input.frameworkId,
          framework.version,
          userId,
          input.deviationNotes || null,
        ]
      );

      // Calculate dates for each phase
      let currentDate = new Date(input.startDate);

      for (const phase of framework.phases || []) {
        // Create concrete phase from template
        const phaseEndDate = new Date(currentDate);
        if (phase.defaultDurationDays) {
          phaseEndDate.setDate(phaseEndDate.getDate() + phase.defaultDurationDays);
        }

        const phaseResult = await client.query(
          `INSERT INTO pm_phases 
           (project_id, name, description, sequence_order, status, 
            planned_start_date, planned_end_date, framework_phase_id,
            requires_approval_for_dates, created_by)
           VALUES ($1, $2, $3, $4, 'not_started', $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            input.projectId,
            phase.name,
            phase.description,
            phase.sequenceOrder,
            currentDate,
            phaseEndDate,
            phase.id,
            true, // Require approval for date changes
            userId,
          ]
        );

        const phaseId = phaseResult.rows[0].id;

        // Create milestones from templates
        if (phase.milestones?.length) {
          for (const template of phase.milestones) {
            const milestoneDate = new Date(currentDate);
            milestoneDate.setDate(milestoneDate.getDate() + template.defaultDayOffset);

            await client.query(
              `INSERT INTO pm_milestones 
               (phase_id, project_id, name, description, milestone_type, sequence_order,
                due_date, status, template_id, requires_client_approval, is_from_template, created_by)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, true, $10)`,
              [
                phaseId,
                input.projectId,
                template.name,
                template.description,
                template.milestoneType,
                template.sequenceOrder,
                milestoneDate,
                template.id,
                template.requiresClientApproval,
                userId,
              ]
            );
          }
        }

        // Move to next phase start date
        if (!phase.canOverlapPrevious && phase.defaultDurationDays) {
          currentDate = new Date(phaseEndDate);
          currentDate.setDate(currentDate.getDate() + (phase.bufferDays || 0));
        }
      }

      // Lock the framework (it's now in use)
      if (!framework.isLocked) {
        await client.query(
          `UPDATE pm_milestone_frameworks SET is_locked = true, locked_at = NOW(), locked_by = $1 WHERE id = $2`,
          [userId, input.frameworkId]
        );
      }

      // Log the governance action
      await client.query(
        `INSERT INTO pm_governance_audit_log 
         (organization_id, project_id, action_type, entity_type, entity_id, new_state, performed_by)
         VALUES ($1, $2, 'framework_applied', 'project', $3, $4, $5)`,
        [
          framework.organizationId,
          input.projectId,
          input.projectId,
          JSON.stringify({ frameworkId: framework.id, version: framework.version }),
          userId,
        ]
      );

      // Emit event
      createEntityChangeEvent(
        ProjectEventType.FRAMEWORK_APPLIED,
        'project',
        input.projectId,
        AuditAction.UPDATE,
        { userId, organizationId: framework.organizationId }
      );
    });
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const milestoneFrameworkService = new MilestoneFrameworkServiceImpl();
