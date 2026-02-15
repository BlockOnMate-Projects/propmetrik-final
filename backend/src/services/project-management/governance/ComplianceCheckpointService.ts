/**
 * Compliance Checkpoint Service
 * 
 * Phase 1.4: Enterprise Governance Model
 * 
 * Manages regulatory and internal compliance gates within project phases:
 * - GRA tax compliance
 * - SSNIT employer contributions
 * - Building permits and inspections
 * - Environmental clearances
 * - Fire safety certifications
 * - Custom organizational compliance requirements
 * 
 * @module services/project-management/governance/ComplianceCheckpointService
 */

import { BaseService } from '../../../../shared-services/base/BaseService';
import {
  UUID,
  ComplianceType,
  PaginatedResponse,
  PaginationParams,
  AuditAction,
} from '../types';
import {
  ValidationError,
  NotFoundError,
  GovernanceError,
} from '../errors';
import { eventBus, ProjectEventType, createEntityChangeEvent } from '../events';

// =============================================================================
// TYPES
// =============================================================================

export type CheckpointStatus = 'pending' | 'in_progress' | 'passed' | 'failed' | 'waived';

export interface ComplianceCheckpoint {
  id: UUID;
  projectId: UUID;
  phaseId?: UUID;
  milestoneId?: UUID;
  name: string;
  checkpointType: string;
  description?: string;
  isMandatory: boolean;
  blocking: boolean;
  requiredDocuments: string[];
  documentUrls?: Record<string, any>[];
  status: CheckpointStatus;
  verifiedBy?: UUID;
  verifiedAt?: Date;
  verificationNotes?: string;
  externalReference?: string;
  externalUrl?: string;
  validFrom?: Date;
  validUntil?: Date;
  graTin?: string;
  ssnitNumber?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: UUID;
  // Computed
  isExpired?: boolean;
  daysUntilExpiry?: number;
}

export interface CreateCheckpointInput {
  projectId: UUID;
  phaseId?: UUID;
  milestoneId?: UUID;
  name: string;
  checkpointType: string;
  description?: string;
  isMandatory?: boolean;
  blocking?: boolean;
  requiredDocuments?: string[];
  externalReference?: string;
  externalUrl?: string;
  validFrom?: Date;
  validUntil?: Date;
  graTin?: string;
  ssnitNumber?: string;
}

export interface UpdateCheckpointInput {
  name?: string;
  description?: string;
  requiredDocuments?: string[];
  externalReference?: string;
  externalUrl?: string;
  validFrom?: Date;
  validUntil?: Date;
  graTin?: string;
  ssnitNumber?: string;
}

export interface VerifyCheckpointInput {
  passed: boolean;
  notes?: string;
  documentUrls?: Record<string, any>[];
  externalReference?: string;
}

export interface CheckpointFilters {
  phaseId?: UUID;
  milestoneId?: UUID;
  checkpointType?: string;
  status?: CheckpointStatus | CheckpointStatus[];
  isMandatory?: boolean;
  blocking?: boolean;
  expiringSoon?: boolean; // Within 30 days
}

export interface ComplianceSummary {
  total: number;
  passed: number;
  failed: number;
  pending: number;
  inProgress: number;
  waived: number;
  blockingPending: number;
  expiringSoon: number;
  byType: Record<string, { total: number; passed: number }>;
}

// =============================================================================
// GHANA COMPLIANCE TYPES
// =============================================================================

export const GHANA_COMPLIANCE_TYPES = {
  GRA_TAX: {
    code: 'gra_tax',
    name: 'GRA Tax Compliance',
    description: 'Ghana Revenue Authority tax clearance certificate',
    requiredDocuments: ['tax_clearance_certificate', 'valid_tin'],
  },
  SSNIT: {
    code: 'ssnit',
    name: 'SSNIT Compliance',
    description: 'Social Security and National Insurance Trust employer compliance',
    requiredDocuments: ['ssnit_certificate', 'employer_number'],
  },
  BUILDING_PERMIT: {
    code: 'building_permit',
    name: 'Building Permit',
    description: 'District Assembly building permit',
    requiredDocuments: ['permit_document', 'approved_plans', 'site_plan'],
  },
  ENVIRONMENTAL: {
    code: 'environmental',
    name: 'Environmental Clearance',
    description: 'EPA environmental impact assessment clearance',
    requiredDocuments: ['eia_report', 'epa_permit'],
  },
  FIRE_SAFETY: {
    code: 'fire_safety',
    name: 'Fire Safety Certificate',
    description: 'Ghana National Fire Service safety certification',
    requiredDocuments: ['fire_safety_certificate', 'inspection_report'],
  },
  LAND_TITLE: {
    code: 'land_title',
    name: 'Land Title Verification',
    description: 'Lands Commission title verification',
    requiredDocuments: ['land_certificate', 'site_plan', 'survey_report'],
  },
  UTILITY_CONNECTION: {
    code: 'utility_connection',
    name: 'Utility Connection Approvals',
    description: 'ECG, Ghana Water connections',
    requiredDocuments: ['utility_application', 'connection_permit'],
  },
};

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class ComplianceCheckpointServiceImpl extends BaseService {
  constructor() {
    super('ComplianceCheckpointService');
  }

  // ===========================================================================
  // ROW MAPPING
  // ===========================================================================

  protected mapRow(row: any): ComplianceCheckpoint {
    const checkpoint: ComplianceCheckpoint = {
      id: row.id,
      projectId: row.project_id,
      phaseId: row.phase_id,
      milestoneId: row.milestone_id,
      name: row.name,
      checkpointType: row.checkpoint_type,
      description: row.description,
      isMandatory: row.is_mandatory,
      blocking: row.blocking,
      requiredDocuments: row.required_documents || [],
      documentUrls: row.document_urls,
      status: row.status,
      verifiedBy: row.verified_by,
      verifiedAt: row.verified_at,
      verificationNotes: row.verification_notes,
      externalReference: row.external_reference,
      externalUrl: row.external_url,
      validFrom: row.valid_from,
      validUntil: row.valid_until,
      graTin: row.gra_tin,
      ssnitNumber: row.ssnit_number,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
    };

    // Compute expiry status
    if (checkpoint.validUntil) {
      const now = new Date();
      const expiryDate = new Date(checkpoint.validUntil);
      checkpoint.isExpired = expiryDate < now;
      checkpoint.daysUntilExpiry = Math.ceil(
        (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    return checkpoint;
  }

  // ===========================================================================
  // CHECKPOINT CRUD
  // ===========================================================================

  /**
   * Create a new compliance checkpoint.
   */
  async create(input: CreateCheckpointInput, userId: UUID): Promise<ComplianceCheckpoint> {
    // Validate required fields
    if (!input.name?.trim()) {
      throw ValidationError.missingField('name');
    }
    if (!input.checkpointType) {
      throw ValidationError.missingField('checkpointType');
    }
    if (!input.projectId) {
      throw ValidationError.missingField('projectId');
    }

    const result = await this.query(
      `INSERT INTO pm_compliance_checkpoints 
       (project_id, phase_id, milestone_id, name, checkpoint_type, description,
        is_mandatory, blocking, required_documents, external_reference, external_url,
        valid_from, valid_until, gra_tin, ssnit_number, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        input.projectId,
        input.phaseId || null,
        input.milestoneId || null,
        input.name.trim(),
        input.checkpointType,
        input.description?.trim() || null,
        input.isMandatory ?? true,
        input.blocking ?? true,
        input.requiredDocuments || [],
        input.externalReference || null,
        input.externalUrl || null,
        input.validFrom || null,
        input.validUntil || null,
        input.graTin || null,
        input.ssnitNumber || null,
        userId,
      ]
    );

    const checkpoint = this.mapRow(result.rows[0]);

    // Emit event
    createEntityChangeEvent(
      ProjectEventType.COMPLIANCE_UPDATED,
      'compliance_checkpoint',
      checkpoint.id,
      AuditAction.CREATE,
      { userId, projectId: input.projectId }
    );

    return checkpoint;
  }

  /**
   * Get checkpoint by ID.
   */
  async getById(checkpointId: UUID): Promise<ComplianceCheckpoint> {
    const result = await this.query(
      `SELECT * FROM pm_compliance_checkpoints 
       WHERE id = $1 AND deleted_at IS NULL`,
      [checkpointId]
    );

    if (result.rows.length === 0) {
      throw NotFoundError.forResource('ComplianceCheckpoint', checkpointId);
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * List checkpoints for a project.
   */
  async listByProject(
    projectId: UUID,
    options: CheckpointFilters & PaginationParams
  ): Promise<PaginatedResponse<ComplianceCheckpoint>> {
    const { page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;

    const conditions: string[] = ['project_id = $1', 'deleted_at IS NULL'];
    const params: any[] = [projectId];
    let paramIndex = 2;

    if (options.phaseId) {
      conditions.push(`phase_id = $${paramIndex++}`);
      params.push(options.phaseId);
    }

    if (options.milestoneId) {
      conditions.push(`milestone_id = $${paramIndex++}`);
      params.push(options.milestoneId);
    }

    if (options.checkpointType) {
      conditions.push(`checkpoint_type = $${paramIndex++}`);
      params.push(options.checkpointType);
    }

    if (options.status) {
      if (Array.isArray(options.status)) {
        conditions.push(`status = ANY($${paramIndex++})`);
        params.push(options.status);
      } else {
        conditions.push(`status = $${paramIndex++}`);
        params.push(options.status);
      }
    }

    if (options.isMandatory !== undefined) {
      conditions.push(`is_mandatory = $${paramIndex++}`);
      params.push(options.isMandatory);
    }

    if (options.blocking !== undefined) {
      conditions.push(`blocking = $${paramIndex++}`);
      params.push(options.blocking);
    }

    if (options.expiringSoon) {
      conditions.push(`valid_until IS NOT NULL`);
      conditions.push(`valid_until <= NOW() + INTERVAL '30 days'`);
      conditions.push(`valid_until > NOW()`);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await this.query(
      `SELECT COUNT(*) FROM pm_compliance_checkpoints WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get checkpoints
    const result = await this.query(
      `SELECT * FROM pm_compliance_checkpoints 
       WHERE ${whereClause}
       ORDER BY 
         CASE status WHEN 'failed' THEN 1 WHEN 'pending' THEN 2 WHEN 'in_progress' THEN 3 ELSE 4 END,
         is_mandatory DESC,
         blocking DESC,
         created_at
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, limit, offset]
    );

    return {
      data: result.rows.map(row => this.mapRow(row)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    };
  }

  /**
   * Update a checkpoint.
   */
  async update(
    checkpointId: UUID,
    updates: UpdateCheckpointInput,
    userId: UUID
  ): Promise<ComplianceCheckpoint> {
    const existing = await this.getById(checkpointId);

    const result = await this.query(
      `UPDATE pm_compliance_checkpoints SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        required_documents = COALESCE($3, required_documents),
        external_reference = COALESCE($4, external_reference),
        external_url = COALESCE($5, external_url),
        valid_from = COALESCE($6, valid_from),
        valid_until = COALESCE($7, valid_until),
        gra_tin = COALESCE($8, gra_tin),
        ssnit_number = COALESCE($9, ssnit_number),
        updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        updates.name?.trim(),
        updates.description?.trim(),
        updates.requiredDocuments,
        updates.externalReference,
        updates.externalUrl,
        updates.validFrom,
        updates.validUntil,
        updates.graTin,
        updates.ssnitNumber,
        checkpointId,
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  // ===========================================================================
  // VERIFICATION WORKFLOW
  // ===========================================================================

  /**
   * Start verification process (move to in_progress).
   */
  async startVerification(checkpointId: UUID, userId: UUID): Promise<ComplianceCheckpoint> {
    const checkpoint = await this.getById(checkpointId);

    if (checkpoint.status !== 'pending') {
      throw new ValidationError(`Cannot start verification from status: ${checkpoint.status}`);
    }

    const result = await this.query(
      `UPDATE pm_compliance_checkpoints SET
        status = 'in_progress',
        updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [checkpointId]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Verify (pass or fail) a checkpoint.
   */
  async verify(
    checkpointId: UUID,
    input: VerifyCheckpointInput,
    userId: UUID
  ): Promise<ComplianceCheckpoint> {
    const checkpoint = await this.getById(checkpointId);

    if (checkpoint.status === 'passed' || checkpoint.status === 'waived') {
      throw new ValidationError(`Checkpoint already ${checkpoint.status}`);
    }

    const newStatus = input.passed ? 'passed' : 'failed';

    const result = await this.query(
      `UPDATE pm_compliance_checkpoints SET
        status = $1,
        verified_by = $2,
        verified_at = NOW(),
        verification_notes = $3,
        document_urls = COALESCE($4, document_urls),
        external_reference = COALESCE($5, external_reference),
        updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        newStatus,
        userId,
        input.notes || null,
        input.documentUrls ? JSON.stringify(input.documentUrls) : null,
        input.externalReference,
        checkpointId,
      ]
    );

    const updated = this.mapRow(result.rows[0]);

    // Emit event
    createEntityChangeEvent(
      ProjectEventType.COMPLIANCE_UPDATED,
      'compliance_checkpoint',
      checkpointId,
      AuditAction.UPDATE,
      { 
        userId, 
        projectId: checkpoint.projectId,
        previousData: { status: checkpoint.status },
        newData: { status: newStatus },
      } as any
    );

    return updated;
  }

  /**
   * Waive a checkpoint (admin only, with justification).
   */
  async waive(
    checkpointId: UUID,
    justification: string,
    userId: UUID
  ): Promise<ComplianceCheckpoint> {
    if (!justification?.trim()) {
      throw ValidationError.missingField('justification');
    }

    const checkpoint = await this.getById(checkpointId);

    if (checkpoint.status === 'passed') {
      throw new ValidationError('Cannot waive a passed checkpoint');
    }

    const result = await this.query(
      `UPDATE pm_compliance_checkpoints SET
        status = 'waived',
        verified_by = $1,
        verified_at = NOW(),
        verification_notes = $2,
        updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [userId, `WAIVED: ${justification.trim()}`, checkpointId]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Reset a failed checkpoint to pending for re-verification.
   */
  async reset(checkpointId: UUID, userId: UUID): Promise<ComplianceCheckpoint> {
    const checkpoint = await this.getById(checkpointId);

    if (checkpoint.status !== 'failed') {
      throw new ValidationError('Only failed checkpoints can be reset');
    }

    const result = await this.query(
      `UPDATE pm_compliance_checkpoints SET
        status = 'pending',
        verified_by = NULL,
        verified_at = NULL,
        verification_notes = NULL,
        updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [checkpointId]
    );

    return this.mapRow(result.rows[0]);
  }

  // ===========================================================================
  // BLOCKING & VALIDATION
  // ===========================================================================

  /**
   * Check if a phase has any blocking checkpoints that are not passed/waived.
   */
  async hasBlockingCheckpoints(phaseId: UUID): Promise<{
    hasBlocking: boolean;
    blockingCheckpoints: ComplianceCheckpoint[];
  }> {
    const result = await this.query(
      `SELECT * FROM pm_compliance_checkpoints 
       WHERE phase_id = $1 
         AND blocking = true 
         AND status NOT IN ('passed', 'waived')
         AND deleted_at IS NULL`,
      [phaseId]
    );

    return {
      hasBlocking: result.rows.length > 0,
      blockingCheckpoints: result.rows.map(row => this.mapRow(row)),
    };
  }

  /**
   * Check if a milestone has any blocking checkpoints.
   */
  async hasBlockingCheckpointsForMilestone(milestoneId: UUID): Promise<{
    hasBlocking: boolean;
    blockingCheckpoints: ComplianceCheckpoint[];
  }> {
    const result = await this.query(
      `SELECT * FROM pm_compliance_checkpoints 
       WHERE milestone_id = $1 
         AND blocking = true 
         AND status NOT IN ('passed', 'waived')
         AND deleted_at IS NULL`,
      [milestoneId]
    );

    return {
      hasBlocking: result.rows.length > 0,
      blockingCheckpoints: result.rows.map(row => this.mapRow(row)),
    };
  }

  /**
   * Validate that a phase can be completed (no blocking checkpoints).
   */
  async validatePhaseCompletion(phaseId: UUID): Promise<void> {
    const { hasBlocking, blockingCheckpoints } = await this.hasBlockingCheckpoints(phaseId);

    if (hasBlocking) {
      throw GovernanceError.approvalRequired(
        'complete_phase',
        'phase',
        phaseId
      );
    }
  }

  // ===========================================================================
  // ANALYTICS & REPORTING
  // ===========================================================================

  /**
   * Get compliance summary for a project.
   */
  async getProjectSummary(projectId: UUID): Promise<ComplianceSummary> {
    const result = await this.query(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'passed') as passed,
         COUNT(*) FILTER (WHERE status = 'failed') as failed,
         COUNT(*) FILTER (WHERE status = 'pending') as pending,
         COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
         COUNT(*) FILTER (WHERE status = 'waived') as waived,
         COUNT(*) FILTER (WHERE blocking = true AND status NOT IN ('passed', 'waived')) as blocking_pending,
         COUNT(*) FILTER (WHERE valid_until IS NOT NULL AND valid_until <= NOW() + INTERVAL '30 days' AND valid_until > NOW()) as expiring_soon
       FROM pm_compliance_checkpoints
       WHERE project_id = $1 AND deleted_at IS NULL`,
      [projectId]
    );

    const row = result.rows[0];

    // Get by type breakdown
    const typeResult = await this.query(
      `SELECT 
         checkpoint_type,
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'passed') as passed
       FROM pm_compliance_checkpoints
       WHERE project_id = $1 AND deleted_at IS NULL
       GROUP BY checkpoint_type`,
      [projectId]
    );

    const byType: Record<string, { total: number; passed: number }> = {};
    for (const typeRow of typeResult.rows) {
      byType[typeRow.checkpoint_type] = {
        total: parseInt(typeRow.total, 10),
        passed: parseInt(typeRow.passed, 10),
      };
    }

    return {
      total: parseInt(row.total, 10),
      passed: parseInt(row.passed, 10),
      failed: parseInt(row.failed, 10),
      pending: parseInt(row.pending, 10),
      inProgress: parseInt(row.in_progress, 10),
      waived: parseInt(row.waived, 10),
      blockingPending: parseInt(row.blocking_pending, 10),
      expiringSoon: parseInt(row.expiring_soon, 10),
      byType,
    };
  }

  /**
   * Get expiring checkpoints (for notifications).
   */
  async getExpiringCheckpoints(
    organizationId: UUID,
    daysAhead: number = 30
  ): Promise<ComplianceCheckpoint[]> {
    const result = await this.query(
      `SELECT cc.* 
       FROM pm_compliance_checkpoints cc
       JOIN pm_development_projects p ON p.id = cc.project_id
       WHERE p.organization_id = $1
         AND cc.valid_until IS NOT NULL
         AND cc.valid_until <= NOW() + INTERVAL '1 day' * $2
         AND cc.valid_until > NOW()
         AND cc.status = 'passed'
         AND cc.deleted_at IS NULL
       ORDER BY cc.valid_until`,
      [organizationId, daysAhead]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  // ===========================================================================
  // BULK OPERATIONS
  // ===========================================================================

  /**
   * Create standard Ghana compliance checkpoints for a project.
   */
  async createGhanaComplianceCheckpoints(
    projectId: UUID,
    phaseId: UUID,
    userId: UUID
  ): Promise<ComplianceCheckpoint[]> {
    const checkpoints: ComplianceCheckpoint[] = [];

    for (const [key, config] of Object.entries(GHANA_COMPLIANCE_TYPES)) {
      const checkpoint = await this.create({
        projectId,
        phaseId,
        name: config.name,
        checkpointType: config.code,
        description: config.description,
        requiredDocuments: config.requiredDocuments,
        isMandatory: true,
        blocking: true,
      }, userId);

      checkpoints.push(checkpoint);
    }

    return checkpoints;
  }

  /**
   * Copy checkpoints from template to project.
   */
  async createFromTemplate(
    projectId: UUID,
    phaseId: UUID,
    templateCheckpoints: CreateCheckpointInput[],
    userId: UUID
  ): Promise<ComplianceCheckpoint[]> {
    const checkpoints: ComplianceCheckpoint[] = [];

    for (const template of templateCheckpoints) {
      const checkpoint = await this.create({
        ...template,
        projectId,
        phaseId,
      }, userId);

      checkpoints.push(checkpoint);
    }

    return checkpoints;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const complianceCheckpointService = new ComplianceCheckpointServiceImpl();
