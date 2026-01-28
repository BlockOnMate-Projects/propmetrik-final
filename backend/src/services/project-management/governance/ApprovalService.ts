/**
 * Approval Service
 * 
 * Phase 1.3: Enterprise Governance Model
 * 
 * Handles the approval workflow for project management:
 * - PMs submit approval requests for structural changes
 * - Admins review and approve/reject requests
 * - Clients approve major milestones
 * - Maintains audit trail of all decisions
 * 
 * @module services/project-management/governance/ApprovalService
 */

import { PoolClient } from 'pg';
import { BaseService } from '../../base/BaseService';
import {
  UUID,
  ApprovalStatus,
  PaginatedResponse,
  PaginationParams,
  AuditAction,
} from '../types';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  GovernanceError,
  ConflictError,
} from '../errors';
import { eventBus, ProjectEventType, createEntityChangeEvent } from '../events';

// =============================================================================
// TYPES
// =============================================================================

export type ApprovalRequestType =
  | 'phase_extension'      // Request to extend phase dates
  | 'phase_reorder'        // Request to change phase order
  | 'milestone_skip'       // Request to skip a required milestone
  | 'milestone_add'        // Request to add non-template milestone
  | 'budget_increase'      // Request to increase budget
  | 'budget_reallocation'  // Request to move budget between categories
  | 'scope_change'         // Request to change project scope
  | 'structure_change'     // Request to modify framework structure
  | 'contractor_change'    // Request to change contractor
  | 'other';

export type ApprovalPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface ApprovalRequest {
  id: UUID;
  organizationId: UUID;
  projectId: UUID;
  requestType: ApprovalRequestType;
  title: string;
  description?: string;
  justification?: string;
  entityType: string;
  entityId: UUID;
  currentState?: Record<string, any>;
  proposedState?: Record<string, any>;
  impactSummary?: string;
  budgetImpact: number;
  scheduleImpactDays: number;
  status: ApprovalStatus;
  priority: ApprovalPriority;
  requestedBy: UUID;
  requestedAt: Date;
  reviewedBy?: UUID;
  reviewedAt?: Date;
  reviewNotes?: string;
  requiresClientApproval: boolean;
  clientApproved?: boolean;
  clientApprovedBy?: UUID;
  clientApprovedAt?: Date;
  clientNotes?: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  comments?: ApprovalComment[];
}

export interface ApprovalComment {
  id: UUID;
  approvalRequestId: UUID;
  comment: string;
  attachments?: any[];
  authorId: UUID;
  createdAt: Date;
}

export interface CreateApprovalRequestInput {
  projectId: UUID;
  requestType: ApprovalRequestType;
  title: string;
  description?: string;
  justification?: string;
  entityType: string;
  entityId: UUID;
  currentState?: Record<string, any>;
  proposedState?: Record<string, any>;
  impactSummary?: string;
  budgetImpact?: number;
  scheduleImpactDays?: number;
  priority?: ApprovalPriority;
  requiresClientApproval?: boolean;
  expiresAt?: Date;
}

export interface ReviewApprovalInput {
  approved: boolean;
  notes?: string;
}

export interface ApprovalRequestFilters {
  status?: ApprovalStatus | ApprovalStatus[];
  requestType?: ApprovalRequestType | ApprovalRequestType[];
  priority?: ApprovalPriority;
  requestedBy?: UUID;
  entityType?: string;
  pendingClientApproval?: boolean;
}

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class ApprovalServiceImpl extends BaseService {
  constructor() {
    super('ApprovalService');
  }

  // ===========================================================================
  // ROW MAPPING
  // ===========================================================================

  protected mapRow(row: any): ApprovalRequest {
    return {
      id: row.id,
      organizationId: row.organization_id,
      projectId: row.project_id,
      requestType: row.request_type,
      title: row.title,
      description: row.description,
      justification: row.justification,
      entityType: row.entity_type,
      entityId: row.entity_id,
      currentState: row.current_state,
      proposedState: row.proposed_state,
      impactSummary: row.impact_summary,
      budgetImpact: parseFloat(row.budget_impact) || 0,
      scheduleImpactDays: row.schedule_impact_days || 0,
      status: row.status,
      priority: row.priority,
      requestedBy: row.requested_by,
      requestedAt: row.requested_at,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      reviewNotes: row.review_notes,
      requiresClientApproval: row.requires_client_approval,
      clientApproved: row.client_approved,
      clientApprovedBy: row.client_approved_by,
      clientApprovedAt: row.client_approved_at,
      clientNotes: row.client_notes,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected mapCommentRow(row: any): ApprovalComment {
    return {
      id: row.id,
      approvalRequestId: row.approval_request_id,
      comment: row.comment,
      attachments: row.attachments,
      authorId: row.author_id,
      createdAt: row.created_at,
    };
  }

  // ===========================================================================
  // APPROVAL REQUEST CRUD
  // ===========================================================================

  /**
   * Create a new approval request.
   */
  async createRequest(
    organizationId: UUID,
    input: CreateApprovalRequestInput,
    userId: UUID
  ): Promise<ApprovalRequest> {
    // Validate required fields
    if (!input.title?.trim()) {
      throw ValidationError.missingField('title');
    }
    if (!input.requestType) {
      throw ValidationError.missingField('requestType');
    }
    if (!input.entityType) {
      throw ValidationError.missingField('entityType');
    }
    if (!input.entityId) {
      throw ValidationError.missingField('entityId');
    }

    const result = await this.query(
      `INSERT INTO pm_approval_requests 
       (organization_id, project_id, request_type, title, description, justification,
        entity_type, entity_id, current_state, proposed_state, impact_summary,
        budget_impact, schedule_impact_days, priority, requires_client_approval,
        expires_at, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING *`,
      [
        organizationId,
        input.projectId,
        input.requestType,
        input.title.trim(),
        input.description?.trim() || null,
        input.justification?.trim() || null,
        input.entityType,
        input.entityId,
        input.currentState ? JSON.stringify(input.currentState) : null,
        input.proposedState ? JSON.stringify(input.proposedState) : null,
        input.impactSummary?.trim() || null,
        input.budgetImpact || 0,
        input.scheduleImpactDays || 0,
        input.priority || 'normal',
        input.requiresClientApproval ?? false,
        input.expiresAt || null,
        userId,
      ]
    );

    const request = this.mapRow(result.rows[0]);

    // Emit event
    eventBus.emit(ProjectEventType.APPROVAL_REQUESTED, {
      entityType: 'approval_request',
      entityId: request.id,
      projectId: input.projectId,
      organizationId,
      userId,
      data: {
        requestType: input.requestType,
        title: input.title,
        priority: input.priority,
      },
    });

    return request;
  }

  /**
   * Get approval request by ID.
   */
  async getById(requestId: UUID): Promise<ApprovalRequest> {
    const result = await this.query(
      `SELECT * FROM pm_approval_requests 
       WHERE id = $1 AND deleted_at IS NULL`,
      [requestId]
    );

    if (result.rows.length === 0) {
      throw NotFoundError.forResource('ApprovalRequest', requestId);
    }

    const request = this.mapRow(result.rows[0]);
    
    // Load comments
    request.comments = await this.getComments(requestId);

    return request;
  }

  /**
   * List approval requests for a project.
   */
  async listByProject(
    projectId: UUID,
    options: ApprovalRequestFilters & PaginationParams
  ): Promise<PaginatedResponse<ApprovalRequest>> {
    const { page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    const { whereClause, params } = this.buildWhereClause(options, projectId);
    const paramOffset = params.length + 1;

    // Get total count
    const countResult = await this.query(
      `SELECT COUNT(*) FROM pm_approval_requests WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get requests
    const result = await this.query(
      `SELECT * FROM pm_approval_requests 
       WHERE ${whereClause}
       ORDER BY 
         CASE priority 
           WHEN 'urgent' THEN 1 
           WHEN 'high' THEN 2 
           WHEN 'normal' THEN 3 
           WHEN 'low' THEN 4 
         END,
         requested_at DESC
       LIMIT $${paramOffset} OFFSET $${paramOffset + 1}`,
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
   * List approval requests for an organization (admin view).
   */
  async listByOrganization(
    organizationId: UUID,
    options: ApprovalRequestFilters & PaginationParams
  ): Promise<PaginatedResponse<ApprovalRequest>> {
    const { page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    const conditions: string[] = ['organization_id = $1', 'deleted_at IS NULL'];
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (options.status) {
      if (Array.isArray(options.status)) {
        conditions.push(`status = ANY($${paramIndex++})`);
        params.push(options.status);
      } else {
        conditions.push(`status = $${paramIndex++}`);
        params.push(options.status);
      }
    }

    if (options.priority) {
      conditions.push(`priority = $${paramIndex++}`);
      params.push(options.priority);
    }

    if (options.pendingClientApproval) {
      conditions.push('requires_client_approval = true');
      conditions.push('client_approved IS NULL');
      conditions.push("status = 'approved'");
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await this.query(
      `SELECT COUNT(*) FROM pm_approval_requests WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get requests
    const result = await this.query(
      `SELECT * FROM pm_approval_requests 
       WHERE ${whereClause}
       ORDER BY 
         CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
         requested_at DESC
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
   * Get pending requests count for dashboard.
   */
  async getPendingCount(organizationId: UUID): Promise<{
    total: number;
    byPriority: Record<ApprovalPriority, number>;
    pendingClientApproval: number;
  }> {
    const result = await this.query(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE priority = 'urgent') as urgent,
         COUNT(*) FILTER (WHERE priority = 'high') as high,
         COUNT(*) FILTER (WHERE priority = 'normal') as normal,
         COUNT(*) FILTER (WHERE priority = 'low') as low,
         COUNT(*) FILTER (WHERE requires_client_approval = true AND client_approved IS NULL AND status = 'approved') as pending_client
       FROM pm_approval_requests
       WHERE organization_id = $1 AND status = 'pending' AND deleted_at IS NULL`,
      [organizationId]
    );

    const row = result.rows[0];

    return {
      total: parseInt(row.total, 10),
      byPriority: {
        urgent: parseInt(row.urgent, 10),
        high: parseInt(row.high, 10),
        normal: parseInt(row.normal, 10),
        low: parseInt(row.low, 10),
      },
      pendingClientApproval: parseInt(row.pending_client, 10),
    };
  }

  // ===========================================================================
  // APPROVAL WORKFLOW
  // ===========================================================================

  /**
   * Admin reviews and approves/rejects a request.
   */
  async reviewRequest(
    requestId: UUID,
    input: ReviewApprovalInput,
    userId: UUID
  ): Promise<ApprovalRequest> {
    const request = await this.getById(requestId);

    // Validate current status
    if (request.status !== 'pending') {
      throw ConflictError.invalidStateTransition(request.status, 'approved/rejected', 'ApprovalRequest');
    }

    // Check if expired
    if (request.expiresAt && new Date() > new Date(request.expiresAt)) {
      throw new ValidationError('This approval request has expired');
    }

    const newStatus = input.approved ? 'approved' : 'rejected';

    const result = await this.query(
      `UPDATE pm_approval_requests SET
        status = $1,
        reviewed_by = $2,
        reviewed_at = NOW(),
        review_notes = $3,
        updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [newStatus, userId, input.notes || null, requestId]
    );

    const updatedRequest = this.mapRow(result.rows[0]);

    // If approved, apply the change
    if (input.approved && !request.requiresClientApproval) {
      await this.applyApprovedChange(updatedRequest);
    }

    // Emit event
    const eventType = input.approved 
      ? ProjectEventType.APPROVAL_GRANTED 
      : ProjectEventType.APPROVAL_DENIED;

    eventBus.emit(eventType, {
      entityType: 'approval_request',
      entityId: requestId,
      projectId: request.projectId,
      organizationId: request.organizationId,
      userId,
      data: {
        requestType: request.requestType,
        notes: input.notes,
      },
    });

    // Log governance action
    await this.logGovernanceAction(
      request.organizationId,
      request.projectId,
      input.approved ? 'approval_granted' : 'approval_denied',
      'approval_request',
      requestId,
      { status: request.status },
      { status: newStatus, notes: input.notes },
      userId
    );

    return updatedRequest;
  }

  /**
   * Client approves an already admin-approved request.
   */
  async clientApprove(
    requestId: UUID,
    approved: boolean,
    notes: string | undefined,
    userId: UUID
  ): Promise<ApprovalRequest> {
    const request = await this.getById(requestId);

    // Validate state
    if (request.status !== 'approved') {
      throw new ValidationError('Request must be approved by admin before client approval');
    }
    if (!request.requiresClientApproval) {
      throw new ValidationError('This request does not require client approval');
    }
    if (request.clientApproved !== null) {
      throw ConflictError.duplicate('ApprovalRequest', 'clientApproval', 'already processed');
    }

    const result = await this.query(
      `UPDATE pm_approval_requests SET
        client_approved = $1,
        client_approved_by = $2,
        client_approved_at = NOW(),
        client_notes = $3,
        updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [approved, userId, notes || null, requestId]
    );

    const updatedRequest = this.mapRow(result.rows[0]);

    // If client approved, apply the change
    if (approved) {
      await this.applyApprovedChange(updatedRequest);
    }

    // Emit event
    eventBus.emit(approved ? ProjectEventType.APPROVAL_GRANTED : ProjectEventType.APPROVAL_DENIED, {
      entityType: 'approval_request',
      entityId: requestId,
      projectId: request.projectId,
      organizationId: request.organizationId,
      userId,
      data: {
        clientApproval: true,
        requestType: request.requestType,
      },
    });

    return updatedRequest;
  }

  /**
   * Withdraw a pending request (by the requester).
   */
  async withdrawRequest(requestId: UUID, userId: UUID): Promise<ApprovalRequest> {
    const request = await this.getById(requestId);

    if (request.requestedBy !== userId) {
      throw new AuthorizationError('Only the requester can withdraw this request');
    }

    if (request.status !== 'pending') {
      throw ConflictError.invalidStateTransition(request.status, 'withdrawn', 'ApprovalRequest');
    }

    const result = await this.query(
      `UPDATE pm_approval_requests SET
        status = 'withdrawn',
        updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [requestId]
    );

    return this.mapRow(result.rows[0]);
  }

  // ===========================================================================
  // COMMENTS
  // ===========================================================================

  /**
   * Add a comment to an approval request.
   */
  async addComment(
    requestId: UUID,
    comment: string,
    userId: UUID,
    attachments?: any[]
  ): Promise<ApprovalComment> {
    // Verify request exists
    await this.getById(requestId);

    const result = await this.query(
      `INSERT INTO pm_approval_comments 
       (approval_request_id, comment, attachments, author_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [requestId, comment, attachments ? JSON.stringify(attachments) : null, userId]
    );

    return this.mapCommentRow(result.rows[0]);
  }

  /**
   * Get comments for an approval request.
   */
  async getComments(requestId: UUID): Promise<ApprovalComment[]> {
    const result = await this.query(
      `SELECT * FROM pm_approval_comments 
       WHERE approval_request_id = $1 AND deleted_at IS NULL
       ORDER BY created_at`,
      [requestId]
    );

    return result.rows.map(row => this.mapCommentRow(row));
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Apply an approved change to the relevant entity.
   */
  private async applyApprovedChange(request: ApprovalRequest): Promise<void> {
    if (!request.proposedState) {
      return;
    }

    // Apply based on entity type
    switch (request.entityType) {
      case 'phase':
        await this.applyPhaseChange(request);
        break;
      case 'milestone':
        await this.applyMilestoneChange(request);
        break;
      case 'budget':
        await this.applyBudgetChange(request);
        break;
      default:
        this.logger.warn({ entityType: request.entityType }, 'Unknown entity type for approval application');
    }
  }

  /**
   * Apply phase changes from approved request.
   */
  private async applyPhaseChange(request: ApprovalRequest): Promise<void> {
    const { proposedState } = request;
    
    if (request.requestType === 'phase_extension') {
      await this.query(
        `UPDATE pm_phases SET
          planned_end_date = COALESCE($1, planned_end_date),
          actual_end_date = COALESCE($2, actual_end_date),
          updated_at = NOW()
         WHERE id = $3`,
        [
          proposedState?.planned_end_date,
          proposedState?.actual_end_date,
          request.entityId,
        ]
      );

      // Unlock phase if it was locked
      await this.query(
        `INSERT INTO pm_phase_locks (phase_id, action, reason, locked_by, approval_request_id)
         VALUES ($1, 'unlock', 'Extension approved', $2, $3)`,
        [request.entityId, request.reviewedBy, request.id]
      );
    }
  }

  /**
   * Apply milestone changes from approved request.
   */
  private async applyMilestoneChange(request: ApprovalRequest): Promise<void> {
    const { proposedState } = request;

    if (request.requestType === 'milestone_skip') {
      await this.query(
        `UPDATE pm_milestones SET
          status = 'skipped',
          skip_reason = $1,
          updated_at = NOW()
         WHERE id = $2`,
        [proposedState?.skip_reason || 'Approved to skip', request.entityId]
      );
    }
  }

  /**
   * Apply budget changes from approved request.
   */
  private async applyBudgetChange(request: ApprovalRequest): Promise<void> {
    // Budget changes would be applied here
    // This is a placeholder for integration with budgetAnalyticsService
    this.logger.info({ requestId: request.id }, 'Budget change approved - manual application required');
  }

  /**
   * Build WHERE clause for filtering.
   */
  private buildWhereClause(
    filters: ApprovalRequestFilters,
    projectId?: UUID
  ): { whereClause: string; params: any[] } {
    const conditions: string[] = ['deleted_at IS NULL'];
    const params: any[] = [];
    let paramIndex = 1;

    if (projectId) {
      conditions.push(`project_id = $${paramIndex++}`);
      params.push(projectId);
    }

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(`status = ANY($${paramIndex++})`);
        params.push(filters.status);
      } else {
        conditions.push(`status = $${paramIndex++}`);
        params.push(filters.status);
      }
    }

    if (filters.requestType) {
      if (Array.isArray(filters.requestType)) {
        conditions.push(`request_type = ANY($${paramIndex++})`);
        params.push(filters.requestType);
      } else {
        conditions.push(`request_type = $${paramIndex++}`);
        params.push(filters.requestType);
      }
    }

    if (filters.priority) {
      conditions.push(`priority = $${paramIndex++}`);
      params.push(filters.priority);
    }

    if (filters.requestedBy) {
      conditions.push(`requested_by = $${paramIndex++}`);
      params.push(filters.requestedBy);
    }

    if (filters.entityType) {
      conditions.push(`entity_type = $${paramIndex++}`);
      params.push(filters.entityType);
    }

    return {
      whereClause: conditions.join(' AND '),
      params,
    };
  }

  /**
   * Log a governance action to the audit log.
   */
  private async logGovernanceAction(
    organizationId: UUID,
    projectId: UUID,
    actionType: string,
    entityType: string,
    entityId: UUID,
    previousState: any,
    newState: any,
    userId: UUID
  ): Promise<void> {
    await this.query(
      `INSERT INTO pm_governance_audit_log 
       (organization_id, project_id, action_type, entity_type, entity_id, 
        previous_state, new_state, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        organizationId,
        projectId,
        actionType,
        entityType,
        entityId,
        JSON.stringify(previousState),
        JSON.stringify(newState),
        userId,
      ]
    );
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const approvalService = new ApprovalServiceImpl();
