/**
 * Change Order Service
 * Phase 3A Week 1 - Enterprise-grade Change Order Management
 * Phase 5 E-Sign Integration - Programmatic signing for change order execution
 * 
 * Handles the complete change order lifecycle from creation through approval and execution.
 * Supports multi-level approval chains, cost tracking, and schedule impact analysis.
 * 
 * E-Sign Integration (Phase 5):
 * - Triggers e-sign workflow when change order is approved
 * - Collects signatures from project manager, owner rep, and contractor
 * - Auto-executes change order after all signatures collected
 * - Stores signed document and updates audit trail
 * 
 * @deprecated This monolithic service has been split into focused modules.
 * Import from 'change-orders/' instead:
 * 
 * - changeRequestService - CRUD, items management
 * - changeApprovalService - Workflow, signatures, status transitions
 * - changeImpactService - Impact analysis, trends, forecasting
 * - changeOrdersFacade - Unified access (backward compatible)
 * 
 * @see change-orders/ChangeRequestService.ts
 * @see change-orders/ChangeApprovalService.ts
 * @see change-orders/ChangeImpactService.ts
 * @see change-orders/index.ts
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { getFile, buckets } from '../../database/minio';
import { notify, resolveOrgStaff } from '../../../shared-services/notifications/in-mail';
import { eSignIntegrationService } from '../../../shared-services/e-sign/integration/eSignIntegrationService';
import { generateChangeOrderPdf, changeOrderSignatureSlots } from '../../utils/changeOrderPdfGenerator';
import { resolveReportBranding } from '../valuation-engine/brandingService';
import { CompletionEvent, ESignField, ESignSigner } from '../../../shared-services/e-sign/integration/types';

// =====================================================
// TYPES
// =====================================================

export type ChangeOrderStatus = 
  | 'draft'
  | 'pending_review'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'void';

export type ChangeOrderReason = 
  | 'scope_change'
  | 'design_error'
  | 'unforeseen_conditions'
  | 'owner_request'
  | 'regulatory_requirement'
  | 'value_engineering'
  | 'schedule_acceleration'
  | 'material_substitution'
  | 'force_majeure'
  | 'other';

export type ChangeOrderType = 'additive' | 'deductive' | 'no_cost' | 'time_extension';

export type ItemType = 'labor' | 'material' | 'equipment' | 'subcontractor' | 'overhead' | 'fee' | 'other';

export interface ChangeOrderItem {
  id?: string;
  description: string;
  item_type: ItemType;
  quantity: number;
  unit: string;
  unit_cost: number;
  markup_percentage: number;
  total_cost?: number;
  cost_code?: string;
  notes?: string;
}

export interface ChangeOrderSignature {
  id?: string;
  signatory_role: string;
  signatory_name?: string;
  signatory_user_id?: string;
  is_required: boolean;
  signed: boolean;
  signed_at?: Date;
  signature_data?: string;
  comments?: string;
}

export interface Attachment {
  id: string;
  filename: string;
  url: string;
  type: string;
  size: number;
  uploaded_at: string;
  uploaded_by?: string;
}

export interface ChangeOrder {
  id: string;
  organization_id: string;
  project_id: string;
  co_number: string;
  revision_number: number;
  title: string;
  description: string;
  reason: ChangeOrderReason;
  reason_details?: string;
  co_type: ChangeOrderType;
  status: ChangeOrderStatus;
  original_contract_amount: number;
  previous_changes_amount: number;
  this_change_amount: number;
  new_contract_amount: number;
  currency: string;
  original_completion_date?: Date;
  schedule_impact_days: number;
  new_completion_date?: Date;
  submitted_by?: string;
  submitted_at?: Date;
  approved_by?: string;
  approved_at?: Date;
  executed_by?: string;
  executed_at?: Date;
  phase_id?: string;
  related_rfi_id?: string;
  attachments: Attachment[];
  esign_envelope_id?: string | null;
  esign_status?: string | null;
  esign_triggered_at?: Date | null;
  esign_completed_at?: Date | null;
  signed_document_url?: string | null;
  created_at: Date;
  updated_at: Date;
  created_by?: string;
  updated_by?: string;
}

export interface ChangeOrderWithDetails extends ChangeOrder {
  project_name?: string;
  project_number?: string;
  submitted_by_name?: string;
  approved_by_name?: string;
  executed_by_name?: string;
  phase_name?: string;
  related_rfi_number?: string;
  items?: ChangeOrderItem[];
  signatures?: ChangeOrderSignature[];
  pending_signatures?: number;
  history?: ChangeOrderHistoryEntry[];
  /** User who currently owes the next action (submitter for drafts, PM/approver while pending). */
  ball_in_court?: string | null;
  ball_in_court_name?: string | null;
}

export interface ChangeOrderHistoryEntry {
  id: string;
  change_order_id: string;
  action: string;
  previous_status?: ChangeOrderStatus;
  new_status?: ChangeOrderStatus;
  field_changes?: Record<string, { old: any; new: any }>;
  comment?: string;
  performed_by?: string;
  performed_by_name?: string;
  performed_at: Date;
}

export interface CreateChangeOrderInput {
  organization_id: string;
  project_id: string;
  title: string;
  description: string;
  reason: ChangeOrderReason;
  reason_details?: string;
  co_type?: ChangeOrderType;
  original_contract_amount: number;
  previous_changes_amount?: number;
  original_completion_date?: Date;
  schedule_impact_days?: number;
  phase_id?: string;
  related_rfi_id?: string;
  attachments?: Attachment[];
  items?: ChangeOrderItem[];
  signatures?: ChangeOrderSignature[];
  created_by?: string;
}

export interface UpdateChangeOrderInput {
  title?: string;
  description?: string;
  reason?: ChangeOrderReason;
  reason_details?: string;
  co_type?: ChangeOrderType;
  schedule_impact_days?: number;
  phase_id?: string;
  related_rfi_id?: string;
  attachments?: Attachment[];
  updated_by?: string;
}

export interface ChangeOrderFilters {
  organization_id?: string;
  project_id?: string;
  status?: ChangeOrderStatus | ChangeOrderStatus[];
  reason?: ChangeOrderReason | ChangeOrderReason[];
  co_type?: ChangeOrderType | ChangeOrderType[];
  submitted_by?: string;
  approved_by?: string;
  /** Filter to COs currently awaiting this user's action (ball-in-court). */
  ball_in_court?: string;
  phase_id?: string;
  created_from?: Date;
  created_to?: Date;
  min_amount?: number;
  max_amount?: number;
  search?: string;
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface ChangeOrderStats {
  total: number;
  by_status: Record<ChangeOrderStatus, number>;
  by_reason: Record<ChangeOrderReason, number>;
  by_type: Record<ChangeOrderType, number>;
  total_additions: number;
  total_deductions: number;
  net_change: number;
  avg_processing_days: number;
  pending_approval: number;
  total_schedule_impact_days: number;
}

// =====================================================
// SERVICE CLASS
// =====================================================

class ChangeOrderService {
  /**
   * Create a new Change Order
   */
  async create(input: CreateChangeOrderInput): Promise<ChangeOrderWithDetails> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Calculate initial amounts
      const thisChangeAmount = this.calculateItemsTotal(input.items || []);
      const coType = input.co_type || (thisChangeAmount >= 0 ? 'additive' : 'deductive');

      const result = await client.query(`
        INSERT INTO change_orders (
          organization_id,
          project_id,
          title,
          description,
          reason,
          reason_details,
          co_type,
          status,
          original_contract_amount,
          previous_changes_amount,
          this_change_amount,
          currency,
          original_completion_date,
          schedule_impact_days,
          phase_id,
          related_rfi_id,
          attachments,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, $9, $10, 'GHS', $11, $12, $13, $14, $15, $16)
        RETURNING *
      `, [
        input.organization_id,
        input.project_id,
        input.title,
        input.description,
        input.reason,
        input.reason_details,
        coType,
        input.original_contract_amount,
        input.previous_changes_amount || 0,
        thisChangeAmount,
        input.original_completion_date,
        input.schedule_impact_days || 0,
        input.phase_id,
        input.related_rfi_id,
        JSON.stringify(input.attachments || []),
        input.created_by
      ]);

      const changeOrder = result.rows[0];

      // Insert items
      if (input.items && input.items.length > 0) {
        for (const item of input.items) {
          const totalCost = item.quantity * item.unit_cost * (1 + (item.markup_percentage || 0) / 100);
          await client.query(`
            INSERT INTO change_order_items (
              change_order_id,
              description,
              item_type,
              quantity,
              unit,
              unit_cost,
              markup_percentage,
              total_cost,
              cost_code,
              notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `, [
            changeOrder.id,
            item.description,
            item.item_type,
            item.quantity,
            item.unit,
            item.unit_cost,
            item.markup_percentage || 0,
            totalCost,
            item.cost_code,
            item.notes
          ]);
        }
      }

      // Insert required signatures
      const defaultSignatures: ChangeOrderSignature[] = input.signatures || [
        { signatory_role: 'Project Manager', is_required: true, signed: false },
        { signatory_role: 'Contract Administrator', is_required: true, signed: false },
        { signatory_role: 'Owner Representative', is_required: true, signed: false }
      ];

      for (const sig of defaultSignatures) {
        await client.query(`
          INSERT INTO change_order_signatures (
            change_order_id,
            signatory_role,
            signatory_name,
            signatory_user_id,
            is_required
          ) VALUES ($1, $2, $3, $4, $5)
        `, [changeOrder.id, sig.signatory_role, sig.signatory_name, sig.signatory_user_id, sig.is_required]);
      }

      // Log creation in history
      await this.logHistory(client, changeOrder.id, 'created', null, 'draft', null, input.created_by);

      await client.query('COMMIT');

      logger.info(`Change Order created: ${changeOrder.co_number}`, { 
        coId: changeOrder.id, 
        projectId: input.project_id 
      });

      return this.getById(changeOrder.id) as Promise<ChangeOrderWithDetails>;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating Change Order:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get Change Order by ID with all details
   */
  async getById(id: string): Promise<ChangeOrderWithDetails | null> {
    const result = await pool.query(`
      SELECT 
        co.*,
        p.project_name,
        p.project_number,
        submitter.full_name AS submitted_by_name,
        approver.full_name AS approved_by_name,
        executor.full_name AS executed_by_name,
        ph.name AS phase_name,
        rfi.rfi_number AS related_rfi_number,
        (
          SELECT COUNT(*) 
          FROM change_order_signatures 
          WHERE change_order_id = co.id 
            AND is_required = true 
            AND signed = false
        ) AS pending_signatures
      FROM change_orders co
      LEFT JOIN development_projects p ON co.project_id = p.id
      LEFT JOIN users submitter ON co.submitted_by = submitter.id
      LEFT JOIN users approver ON co.approved_by = approver.id
      LEFT JOIN users executor ON co.executed_by = executor.id
      LEFT JOIN project_phases ph ON co.phase_id = ph.id
      LEFT JOIN rfis rfi ON co.related_rfi_id = rfi.id
      WHERE co.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const changeOrder = this.mapChangeOrderWithDetails(result.rows[0]);

    // Get items
    const itemsResult = await pool.query(`
      SELECT * FROM change_order_items
      WHERE change_order_id = $1
      ORDER BY created_at ASC
    `, [id]);

    changeOrder.items = itemsResult.rows.map(row => this.mapItem(row));

    // Get signatures
    const signaturesResult = await pool.query(`
      SELECT * FROM change_order_signatures
      WHERE change_order_id = $1
      ORDER BY is_required DESC, signatory_role ASC
    `, [id]);

    changeOrder.signatures = signaturesResult.rows.map(row => this.mapSignature(row));

    return changeOrder;
  }

  /**
   * Get Change Orders with filters and pagination
   */
  async getAll(filters: ChangeOrderFilters): Promise<{ data: ChangeOrderWithDetails[]; total: number }> {
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.organization_id) {
      whereClause += ` AND co.organization_id = $${paramIndex++}`;
      params.push(filters.organization_id);
    }

    if (filters.project_id) {
      whereClause += ` AND co.project_id = $${paramIndex++}`;
      params.push(filters.project_id);
    }

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        whereClause += ` AND co.status = ANY($${paramIndex++})`;
        params.push(filters.status);
      } else {
        whereClause += ` AND co.status = $${paramIndex++}`;
        params.push(filters.status);
      }
    }

    if (filters.reason) {
      if (Array.isArray(filters.reason)) {
        whereClause += ` AND co.reason = ANY($${paramIndex++})`;
        params.push(filters.reason);
      } else {
        whereClause += ` AND co.reason = $${paramIndex++}`;
        params.push(filters.reason);
      }
    }

    if (filters.co_type) {
      if (Array.isArray(filters.co_type)) {
        whereClause += ` AND co.co_type = ANY($${paramIndex++})`;
        params.push(filters.co_type);
      } else {
        whereClause += ` AND co.co_type = $${paramIndex++}`;
        params.push(filters.co_type);
      }
    }

    if (filters.submitted_by) {
      whereClause += ` AND co.submitted_by = $${paramIndex++}`;
      params.push(filters.submitted_by);
    }

    if (filters.approved_by) {
      whereClause += ` AND co.approved_by = $${paramIndex++}`;
      params.push(filters.approved_by);
    }

    if (filters.phase_id) {
      whereClause += ` AND co.phase_id = $${paramIndex++}`;
      params.push(filters.phase_id);
    }

    if (filters.created_from) {
      whereClause += ` AND co.created_at >= $${paramIndex++}`;
      params.push(filters.created_from);
    }

    if (filters.created_to) {
      whereClause += ` AND co.created_at <= $${paramIndex++}`;
      params.push(filters.created_to);
    }

    if (filters.min_amount !== undefined) {
      whereClause += ` AND ABS(co.this_change_amount) >= $${paramIndex++}`;
      params.push(filters.min_amount);
    }

    if (filters.max_amount !== undefined) {
      whereClause += ` AND ABS(co.this_change_amount) <= $${paramIndex++}`;
      params.push(filters.max_amount);
    }

    if (filters.search) {
      whereClause += ` AND (
        co.co_number ILIKE $${paramIndex} OR
        co.title ILIKE $${paramIndex} OR
        co.description ILIKE $${paramIndex}
      )`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    // Ball-in-court: COs awaiting this user — their own drafts, or (as the
    // project's PM/approver) COs pending review/approval. Uses a subquery for
    // project_manager_id so the count query (no development_projects join) works.
    if (filters.ball_in_court) {
      whereClause += ` AND (CASE
          WHEN co.status = 'draft' THEN COALESCE(co.submitted_by, co.created_by)
          WHEN co.status IN ('pending_review', 'pending_approval')
            THEN (SELECT project_manager_id FROM development_projects WHERE id = co.project_id)
          ELSE NULL
        END) = $${paramIndex++}`;
      params.push(filters.ball_in_court);
    }

    // Count total
    const countResult = await pool.query(`
      SELECT COUNT(*) FROM change_orders co ${whereClause}
    `, params);
    const total = parseInt(countResult.rows[0].count, 10);

    // Get data with sorting and pagination
    const sortColumn = filters.sort_by || 'created_at';
    const sortOrder = filters.sort_order || 'desc';
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const allowedSortColumns = ['created_at', 'updated_at', 'co_number', 'this_change_amount', 'status'];
    const safeSortColumn = allowedSortColumns.includes(sortColumn) ? sortColumn : 'created_at';

    const dataResult = await pool.query(`
      SELECT 
        co.*,
        p.project_name,
        p.project_number,
        submitter.full_name AS submitted_by_name,
        approver.full_name AS approved_by_name,
        executor.full_name AS executed_by_name,
        ph.name AS phase_name,
        rfi.rfi_number AS related_rfi_number,
        pm.full_name AS ball_pm_name,
        CASE
          WHEN co.status = 'draft' THEN COALESCE(co.submitted_by, co.created_by)
          WHEN co.status IN ('pending_review', 'pending_approval') THEN p.project_manager_id
          ELSE NULL
        END AS ball_in_court,
        (
          SELECT COUNT(*)
          FROM change_order_signatures
          WHERE change_order_id = co.id
            AND is_required = true
            AND signed = false
        ) AS pending_signatures
      FROM change_orders co
      LEFT JOIN development_projects p ON co.project_id = p.id
      LEFT JOIN users submitter ON co.submitted_by = submitter.id
      LEFT JOIN users approver ON co.approved_by = approver.id
      LEFT JOIN users executor ON co.executed_by = executor.id
      LEFT JOIN users pm ON p.project_manager_id = pm.id
      LEFT JOIN project_phases ph ON co.phase_id = ph.id
      LEFT JOIN rfis rfi ON co.related_rfi_id = rfi.id
      ${whereClause}
      ORDER BY co.${safeSortColumn} ${sortOrder === 'asc' ? 'ASC' : 'DESC'}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, limit, offset]);

    return {
      data: dataResult.rows.map(row => this.mapChangeOrderWithDetails(row)),
      total
    };
  }

  /**
   * Update a Change Order
   */
  async update(id: string, input: UpdateChangeOrderInput): Promise<ChangeOrderWithDetails> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get current for comparison
      const currentResult = await client.query('SELECT * FROM change_orders WHERE id = $1', [id]);
      if (currentResult.rows.length === 0) {
        throw new Error('Change Order not found');
      }
      const current = currentResult.rows[0];

      if (!['draft', 'pending_review'].includes(current.status)) {
        throw new Error('Change Order can only be edited in draft or pending_review status');
      }

      // Build update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;
      const fieldChanges: Record<string, { old: any; new: any }> = {};

      const updateField = (field: string, value: any, jsonField = false) => {
        if (value !== undefined) {
          const currentValue = jsonField ? JSON.stringify(current[field]) : current[field];
          const newValue = jsonField ? JSON.stringify(value) : value;
          if (currentValue !== newValue) {
            fieldChanges[field] = { old: current[field], new: value };
            updates.push(`${field} = $${paramIndex++}`);
            values.push(jsonField ? JSON.stringify(value) : value);
          }
        }
      };

      updateField('title', input.title);
      updateField('description', input.description);
      updateField('reason', input.reason);
      updateField('reason_details', input.reason_details);
      updateField('co_type', input.co_type);
      updateField('schedule_impact_days', input.schedule_impact_days);
      updateField('phase_id', input.phase_id);
      updateField('related_rfi_id', input.related_rfi_id);
      updateField('attachments', input.attachments, true);

      if (updates.length === 0) {
        await client.query('COMMIT');
        return this.getById(id) as Promise<ChangeOrderWithDetails>;
      }

      updates.push(`updated_by = $${paramIndex++}`);
      values.push(input.updated_by);

      values.push(id);

      await client.query(`
        UPDATE change_orders
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
      `, values);

      // Log history
      await this.logHistory(client, id, 'updated', null, null, fieldChanges, input.updated_by);

      await client.query('COMMIT');

      logger.info(`Change Order updated: ${current.co_number}`, { coId: id });

      return this.getById(id) as Promise<ChangeOrderWithDetails>;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error updating Change Order:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Add line items to a Change Order
   */
  async addItems(coId: string, items: ChangeOrderItem[], userId: string): Promise<ChangeOrderItem[]> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const addedItems: ChangeOrderItem[] = [];

      for (const item of items) {
        const totalCost = item.quantity * item.unit_cost * (1 + (item.markup_percentage || 0) / 100);
        const result = await client.query(`
          INSERT INTO change_order_items (
            change_order_id,
            description,
            item_type,
            quantity,
            unit,
            unit_cost,
            markup_percentage,
            total_cost,
            cost_code,
            notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `, [
          coId,
          item.description,
          item.item_type,
          item.quantity,
          item.unit,
          item.unit_cost,
          item.markup_percentage || 0,
          totalCost,
          item.cost_code,
          item.notes
        ]);

        addedItems.push(this.mapItem(result.rows[0]));
      }

      // Recalculate total - trigger handles this
      await client.query('SELECT 1 FROM change_order_items WHERE change_order_id = $1 LIMIT 1', [coId]);

      await client.query('COMMIT');

      return addedItems;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update a line item
   */
  async updateItem(itemId: string, item: Partial<ChangeOrderItem>, userId: string): Promise<ChangeOrderItem> {
    const totalCost = (item.quantity || 0) * (item.unit_cost || 0) * (1 + (item.markup_percentage || 0) / 100);

    const result = await pool.query(`
      UPDATE change_order_items
      SET description = COALESCE($2, description),
          item_type = COALESCE($3, item_type),
          quantity = COALESCE($4, quantity),
          unit = COALESCE($5, unit),
          unit_cost = COALESCE($6, unit_cost),
          markup_percentage = COALESCE($7, markup_percentage),
          total_cost = $8,
          cost_code = COALESCE($9, cost_code),
          notes = COALESCE($10, notes)
      WHERE id = $1
      RETURNING *
    `, [
      itemId,
      item.description,
      item.item_type,
      item.quantity,
      item.unit,
      item.unit_cost,
      item.markup_percentage,
      totalCost,
      item.cost_code,
      item.notes
    ]);

    return this.mapItem(result.rows[0]);
  }

  /**
   * Delete a line item
   */
  async deleteItem(itemId: string): Promise<void> {
    await pool.query('DELETE FROM change_order_items WHERE id = $1', [itemId]);
  }

  /**
   * Submit Change Order for review
   */
  async submit(id: string, userId: string): Promise<ChangeOrderWithDetails> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const current = await client.query('SELECT * FROM change_orders WHERE id = $1', [id]);
      if (current.rows.length === 0) {
        throw new Error('Change Order not found');
      }

      if (current.rows[0].status !== 'draft') {
        throw new Error('Only draft Change Orders can be submitted');
      }

      await client.query(`
        UPDATE change_orders
        SET status = 'pending_review',
            submitted_by = $2,
            submitted_at = NOW(),
            updated_by = $2
        WHERE id = $1
      `, [id, userId]);

      await this.logHistory(client, id, 'submitted', 'draft', 'pending_review', null, userId);

      await client.query('COMMIT');

      logger.info(`Change Order submitted: ${current.rows[0].co_number}`, { coId: id });

      // Notify org staff (approvers) that a change order awaits review
      try {
        const co = current.rows[0];
        const staff = (await resolveOrgStaff(co.organization_id)).filter((s) => s.userId !== userId);
        if (staff.length) {
          await notify({
            recipients: staff,
            category: 'project',
            type: 'change_order.submitted',
            title: 'Change order submitted for review',
            body: `Change Order ${co.co_number} has been submitted and is awaiting review.`,
            priority: 'normal',
            organizationId: co.organization_id,
            sourceType: 'change_order',
            sourceId: id,
            sourceUrl: `/dashboard/projects/${co.project_id}/change-orders`,
            channels: { inApp: true, email: true },
          });
        }
      } catch (notifyError: any) {
        logger.warn('Failed to notify approvers of change order submission', { coId: id, error: notifyError.message });
      }

      return this.getById(id) as Promise<ChangeOrderWithDetails>;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Request approval for Change Order
   */
  async requestApproval(id: string, userId: string): Promise<ChangeOrderWithDetails> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const current = await client.query('SELECT * FROM change_orders WHERE id = $1', [id]);
      if (current.rows.length === 0) {
        throw new Error('Change Order not found');
      }

      if (current.rows[0].status !== 'pending_review') {
        throw new Error('Change Order must be in pending_review status');
      }

      await client.query(`
        UPDATE change_orders
        SET status = 'pending_approval',
            updated_by = $2
        WHERE id = $1
      `, [id, userId]);

      await this.logHistory(client, id, 'approval_requested', 'pending_review', 'pending_approval', null, userId);

      await client.query('COMMIT');

      logger.info(`Change Order approval requested: ${current.rows[0].co_number}`, { coId: id });

      return this.getById(id) as Promise<ChangeOrderWithDetails>;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Sign/Approve a Change Order (by signature role)
   */
  async sign(id: string, signatureId: string, userId: string, signatureData?: string, comments?: string): Promise<ChangeOrderWithDetails> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(`
        UPDATE change_order_signatures
        SET signed = true,
            signed_at = NOW(),
            signatory_user_id = $2,
            signature_data = $3,
            comments = $4
        WHERE id = $1
      `, [signatureId, userId, signatureData, comments]);

      // Check if all required signatures are complete
      const pendingResult = await client.query(`
        SELECT COUNT(*) FROM change_order_signatures
        WHERE change_order_id = $1 AND is_required = true AND signed = false
      `, [id]);

      if (parseInt(pendingResult.rows[0].count, 10) === 0) {
        // All signatures complete - approve the CO
        await client.query(`
          UPDATE change_orders
          SET status = 'approved',
              approved_by = $2,
              approved_at = NOW(),
              updated_by = $2
          WHERE id = $1
        `, [id, userId]);

        await this.logHistory(client, id, 'approved', 'pending_approval', 'approved', null, userId);
      }

      await client.query('COMMIT');

      return this.getById(id) as Promise<ChangeOrderWithDetails>;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Approve Change Order (bypass individual signatures)
   * Phase 5: Now triggers e-sign workflow if configured
   */
  async approve(id: string, userId: string, comment?: string): Promise<ChangeOrderWithDetails> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const current = await client.query('SELECT * FROM change_orders WHERE id = $1', [id]);
      if (current.rows.length === 0) {
        throw new Error('Change Order not found');
      }

      if (!['pending_review', 'pending_approval'].includes(current.rows[0].status)) {
        throw new Error('Change Order is not pending approval');
      }

      await client.query(`
        UPDATE change_orders
        SET status = 'approved',
            approved_by = $2,
            approved_at = NOW(),
            updated_by = $2
        WHERE id = $1
      `, [id, userId]);

      await this.logHistory(client, id, 'approved', current.rows[0].status, 'approved', null, userId, comment);

      await client.query('COMMIT');

      logger.info(`Change Order approved: ${current.rows[0].co_number}`, { coId: id });

      // Phase 5: Check if e-sign is configured and trigger workflow
      const changeOrder = await this.getById(id) as ChangeOrderWithDetails;
      await this.checkAndTriggerEsign(changeOrder, userId);

      return this.getById(id) as Promise<ChangeOrderWithDetails>;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reject Change Order
   */
  async reject(id: string, userId: string, reason: string): Promise<ChangeOrderWithDetails> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const current = await client.query('SELECT * FROM change_orders WHERE id = $1', [id]);
      if (current.rows.length === 0) {
        throw new Error('Change Order not found');
      }

      await client.query(`
        UPDATE change_orders
        SET status = 'rejected',
            updated_by = $2
        WHERE id = $1
      `, [id, userId]);

      await this.logHistory(client, id, 'rejected', current.rows[0].status, 'rejected', null, userId, reason);

      await client.query('COMMIT');

      logger.info(`Change Order rejected: ${current.rows[0].co_number}`, { coId: id });

      return this.getById(id) as Promise<ChangeOrderWithDetails>;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute Change Order (apply to contract)
   */
  async execute(id: string, userId: string): Promise<ChangeOrderWithDetails> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const current = await client.query('SELECT * FROM change_orders WHERE id = $1', [id]);
      if (current.rows.length === 0) {
        throw new Error('Change Order not found');
      }

      if (current.rows[0].status !== 'approved') {
        throw new Error('Only approved Change Orders can be executed');
      }

      await client.query(`
        UPDATE change_orders
        SET status = 'executed',
            executed_by = $2,
            executed_at = NOW(),
            updated_by = $2
        WHERE id = $1
      `, [id, userId]);

      await this.logHistory(client, id, 'executed', 'approved', 'executed', null, userId);

      await client.query('COMMIT');

      logger.info(`Change Order executed: ${current.rows[0].co_number}`, { coId: id });

      return this.getById(id) as Promise<ChangeOrderWithDetails>;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Void a Change Order
   */
  async void(id: string, userId: string, reason: string): Promise<ChangeOrderWithDetails> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const current = await client.query('SELECT * FROM change_orders WHERE id = $1', [id]);
      if (current.rows.length === 0) {
        throw new Error('Change Order not found');
      }

      if (current.rows[0].status === 'executed') {
        throw new Error('Executed Change Orders cannot be voided');
      }

      await client.query(`
        UPDATE change_orders
        SET status = 'void',
            updated_by = $2
        WHERE id = $1
      `, [id, userId]);

      await this.logHistory(client, id, 'voided', current.rows[0].status, 'void', null, userId, reason);

      await client.query('COMMIT');

      logger.info(`Change Order voided: ${current.rows[0].co_number}`, { coId: id });

      return this.getById(id) as Promise<ChangeOrderWithDetails>;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get Change Order history
   */
  async getHistory(coId: string): Promise<ChangeOrderHistoryEntry[]> {
    const result = await pool.query(`
      SELECT h.*, u.full_name AS performed_by_name
      FROM change_order_history h
      LEFT JOIN users u ON h.performed_by = u.id
      WHERE h.change_order_id = $1
      ORDER BY h.performed_at DESC
    `, [coId]);

    return result.rows.map(row => ({
      id: row.id,
      change_order_id: row.change_order_id,
      action: row.action,
      previous_status: row.previous_status,
      new_status: row.new_status,
      field_changes: row.field_changes,
      comment: row.comment,
      performed_by: row.performed_by,
      performed_by_name: row.performed_by_name,
      performed_at: row.performed_at
    }));
  }

  /**
   * Get Change Order statistics for a project
   */
  async getStats(projectId: string): Promise<ChangeOrderStats> {
    const result = await pool.query(`
      SELECT 
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'draft') AS draft,
        COUNT(*) FILTER (WHERE status = 'pending_review') AS pending_review,
        COUNT(*) FILTER (WHERE status = 'pending_approval') AS pending_approval,
        COUNT(*) FILTER (WHERE status = 'approved') AS approved,
        COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
        COUNT(*) FILTER (WHERE status = 'executed') AS executed,
        COUNT(*) FILTER (WHERE status = 'void') AS void,
        COUNT(*) FILTER (WHERE co_type = 'additive') AS type_addition,
        COUNT(*) FILTER (WHERE co_type = 'deductive') AS type_deduction,
        COUNT(*) FILTER (WHERE co_type = 'no_cost') AS type_no_cost,
        COALESCE(SUM(this_change_amount) FILTER (WHERE co_type = 'additive' AND status = 'executed'), 0) AS total_additions,
        COALESCE(SUM(ABS(this_change_amount)) FILTER (WHERE co_type = 'deductive' AND status = 'executed'), 0) AS total_deductions,
        COALESCE(SUM(this_change_amount) FILTER (WHERE status = 'executed'), 0) AS net_change,
        COALESCE(SUM(schedule_impact_days) FILTER (WHERE status = 'executed'), 0) AS total_schedule_impact_days,
        AVG(EXTRACT(DAY FROM (approved_at - submitted_at))) FILTER (WHERE approved_at IS NOT NULL) AS avg_processing_days
      FROM change_orders
      WHERE project_id = $1
    `, [projectId]);

    const row = result.rows[0];

    // Get reason counts
    const reasonResult = await pool.query(`
      SELECT reason, COUNT(*) as count
      FROM change_orders
      WHERE project_id = $1
      GROUP BY reason
    `, [projectId]);

    const byReason: Record<ChangeOrderReason, number> = {} as any;
    reasonResult.rows.forEach(r => {
      byReason[r.reason as ChangeOrderReason] = parseInt(r.count, 10);
    });

    return {
      total: parseInt(row.total, 10),
      by_status: {
        draft: parseInt(row.draft, 10),
        pending_review: parseInt(row.pending_review, 10),
        pending_approval: parseInt(row.pending_approval, 10),
        approved: parseInt(row.approved, 10),
        rejected: parseInt(row.rejected, 10),
        executed: parseInt(row.executed, 10),
        void: parseInt(row.void, 10)
      },
      by_reason: byReason,
      by_type: {
        additive: parseInt(row.type_additive ?? row.type_addition ?? '0', 10),
        deductive: parseInt(row.type_deductive ?? row.type_deduction ?? '0', 10),
        no_cost: parseInt(row.type_no_cost ?? '0', 10),
        time_extension: parseInt(row.type_time_extension ?? '0', 10)
      },
      total_additions: parseFloat(row.total_additions) || 0,
      total_deductions: parseFloat(row.total_deductions) || 0,
      net_change: parseFloat(row.net_change) || 0,
      avg_processing_days: parseFloat(row.avg_processing_days) || 0,
      pending_approval: parseInt(row.pending_approval, 10),
      total_schedule_impact_days: parseInt(row.total_schedule_impact_days, 10)
    };
  }

  // =====================================================
  // E-SIGN INTEGRATION (Phase 5)
  // =====================================================

  /**
   * Check if e-sign is configured and trigger workflow
   */
  private async checkAndTriggerEsign(
    changeOrder: ChangeOrderWithDetails,
    userId: string
  ): Promise<void> {
    try {
      // Get e-sign config for organization
      const configResult = await pool.query(`
        SELECT * FROM change_order_esign_config 
        WHERE organization_id = $1
      `, [changeOrder.organization_id]);

      if (configResult.rows.length === 0) {
        logger.info('No e-sign config for change orders, skipping', {
          coId: changeOrder.id,
          organizationId: changeOrder.organization_id,
        });
        return;
      }

      const config = configResult.rows[0];

      // Check if trigger is enabled
      if (!config.trigger_on_approval) {
        return;
      }

      // Check amount threshold
      if (Math.abs(changeOrder.this_change_amount) < parseFloat(config.min_amount_threshold || 0)) {
        logger.info('Change order amount below e-sign threshold', {
          coId: changeOrder.id,
          amount: changeOrder.this_change_amount,
          threshold: config.min_amount_threshold,
        });
        return;
      }

      await this.triggerChangeOrderEsign(changeOrder, config, userId);
    } catch (error) {
      logger.error('Error checking/triggering e-sign for change order', {
        coId: changeOrder.id,
        error,
      });
      // Don't throw - e-sign failure shouldn't block approval
    }
  }

  /**
   * Manually request e-signature for a change order (the "Request E-Signature"
   * button). Uses the org's config when present, else sensible defaults — so it
   * works even before an org has configured e-sign. Returns the updated CO.
   */
  async requestEsign(changeOrderId: string, userId: string): Promise<ChangeOrderWithDetails> {
    const co = await this.getById(changeOrderId);
    if (!co) throw new Error('Change order not found');

    const cfgRes = await pool.query(
      `SELECT * FROM change_order_esign_config WHERE organization_id = $1`,
      [co.organization_id]
    );
    const config = cfgRes.rows[0] || {
      signer_roles: ['project_manager', 'owner_representative', 'contractor'],
      field_placements: [],
      auto_execute_on_complete: false,
    };

    await this.triggerChangeOrderEsign(co, config, userId);
    const updated = await this.getById(changeOrderId);
    if (!updated) throw new Error('Change order not found after e-sign trigger');
    return updated;
  }

  /**
   * Trigger e-sign workflow for a change order
   */
  async triggerChangeOrderEsign(
    changeOrder: ChangeOrderWithDetails,
    config: any,
    userId: string
  ): Promise<void> {
    logger.info('Triggering e-sign for change order', {
      coId: changeOrder.id,
      coNumber: changeOrder.co_number,
    });

    // Resolve signers FIRST so the PDF signature blocks and the e-sign fields
    // are generated against the same signer set (and line up on the page).
    const signers = await this.resolveChangeOrderSigners(
      changeOrder,
      config.signer_roles || ['project_manager', 'owner_representative', 'contractor']
    );

    if (signers.length === 0) {
      logger.warn('No signers resolved for change order e-sign', {
        coId: changeOrder.id,
      });
      return;
    }

    // Generate the branded change-order document with matching signature blocks
    const changeOrderPdf = await this.generateChangeOrderPdf(changeOrder, signers.map((s) => s.name));

    // Build field placements aligned to the document's signature slots
    const fields = this.buildChangeOrderFields(signers, config.field_placements);

    // Create envelope
    const envelope = await eSignIntegrationService.createEnvelope({
      subject: `Change Order ${changeOrder.co_number} - ${changeOrder.title}`,
      message: `Please review and sign Change Order ${changeOrder.co_number} for project ${changeOrder.project_name || 'N/A'}. Amount: ${changeOrder.currency} ${changeOrder.this_change_amount.toLocaleString()}`,
      documents: [{
        name: `Change_Order_${changeOrder.co_number}.pdf`,
        content: changeOrderPdf,
        mimeType: 'application/pdf',
        source: 'system_generated',
      }],
      signers,
      fields,
      organizationId: changeOrder.organization_id,
      createdByUserId: userId,
      sourceModule: 'project_management',
      sourceEntityType: 'change_order',
      sourceEntityId: changeOrder.id,
      expiresInDays: 30,
    });

    // Update change order with envelope info
    await pool.query(`
      UPDATE change_orders
      SET esign_envelope_id = $1,
          esign_status = 'sent',
          esign_triggered_at = NOW()
      WHERE id = $2
    `, [envelope.envelopeId, changeOrder.id]);

    // Log audit event
    await this.logEsignAudit(
      changeOrder.organization_id,
      'change_order',
      changeOrder.id,
      envelope.envelopeId,
      'created',
      userId
    );

    logger.info('E-sign triggered for change order', {
      coId: changeOrder.id,
      envelopeId: envelope.envelopeId,
      signerCount: signers.length,
    });
  }

  /**
   * Handle e-sign completion webhook for change orders
   */
  async handleEsignCompletion(event: CompletionEvent): Promise<void> {
    const { sourceContext, envelope, documents, signers } = event;

    logger.info('Handling e-sign completion for change order', {
      coId: sourceContext.entityId,
      envelopeId: envelope.id,
    });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get change order
      const coResult = await client.query(
        'SELECT * FROM change_orders WHERE id = $1',
        [sourceContext.entityId]
      );

      if (coResult.rows.length === 0) {
        throw new Error(`Change order not found: ${sourceContext.entityId}`);
      }

      const changeOrder = coResult.rows[0];

      const signedDocUrl = documents[0]?.signedUrl || null;

      // The collected signatures ARE the approval. Advance a still-pending change
      // order to 'approved' on completion (and to 'executed' if the org auto-executes).
      const configResult = await client.query(`
        SELECT auto_execute_on_complete FROM change_order_esign_config
        WHERE organization_id = $1
      `, [changeOrder.organization_id]);
      const autoExecute = configResult.rows[0]?.auto_execute_on_complete ?? false;

      const preApproval = ['draft', 'pending_review', 'pending_approval', 'approved'].includes(changeOrder.status);
      const newStatus = autoExecute && preApproval
        ? 'executed'
        : preApproval ? 'approved' : changeOrder.status;
      const setApprovedAt = newStatus === 'approved' || newStatus === 'executed';
      const setExecutedAt = newStatus === 'executed';

      await client.query(`
        UPDATE change_orders
        SET esign_status = 'completed',
            esign_completed_at = NOW(),
            signed_document_url = $2,
            status = $3,
            approved_at = CASE WHEN $4 AND approved_at IS NULL THEN NOW() ELSE approved_at END,
            executed_at = CASE WHEN $5 AND executed_at IS NULL THEN NOW() ELSE executed_at END
        WHERE id = $1
      `, [sourceContext.entityId, signedDocUrl, newStatus, setApprovedAt, setExecutedAt]);

      await this.logHistory(
        client,
        sourceContext.entityId,
        autoExecute ? 'esign_completed_executed' : 'esign_completed_approved',
        changeOrder.status,
        newStatus,
        { signers: signers.map(s => ({ email: s.email, signedAt: s.signedAt })) },
        undefined,
        autoExecute
          ? 'Approved & executed via e-signature (all parties signed)'
          : 'Approved via e-signature (all parties signed)'
      );

      logger.info('Change order advanced after e-sign completion', {
        coId: sourceContext.entityId, from: changeOrder.status, to: newStatus, autoExecute,
      });

      await client.query('COMMIT');

      // Log audit event
      await this.logEsignAudit(
        changeOrder.organization_id,
        'change_order',
        sourceContext.entityId,
        envelope.id,
        'completed',
        null
      );

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error handling e-sign completion for change order', {
        coId: sourceContext.entityId,
        error,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate PDF for change order (stub - integrate with document service)
   */
  /**
   * Return the change order as a PDF for viewing/downloading. If the order has
   * been e-signed, the stored signed PDF (with signatures + certificate) is
   * returned; otherwise the branded document is generated on the fly.
   */
  async getDocument(id: string, organizationId?: string): Promise<{ buffer: Buffer; filename: string; signed: boolean } | null> {
    const co = await this.getById(id);
    // Scope by org only when the caller resolved one (mirrors getAll / approve,
    // which don't hard-require an org claim on the session).
    if (!co || (organizationId && co.organization_id !== organizationId)) return null;

    const stored = (co as any).signed_document_url as string | null | undefined;
    if (stored) {
      const buffer = await this.fetchStoredDocument(stored);
      if (buffer) {
        return { buffer, filename: `${co.co_number || 'change-order'}-signed.pdf`, signed: true };
      }
    }

    const buffer = await this.generateChangeOrderPdf(co);
    return { buffer, filename: `${co.co_number || 'change-order'}.pdf`, signed: false };
  }

  /**
   * Resolve a stored document reference (s3://bucket/key, a bare MinIO key,
   * a data: URL, or an http(s) URL) to its bytes.
   */
  private async fetchStoredDocument(ref: string): Promise<Buffer | null> {
    try {
      if (ref.startsWith('data:')) {
        const base64 = ref.substring(ref.indexOf(',') + 1);
        return Buffer.from(base64, 'base64');
      }
      if (/^https?:\/\//.test(ref)) {
        const response = await fetch(ref);
        return Buffer.from(await response.arrayBuffer());
      }
      // s3://bucket/key  OR  bucket/key  OR  bare key (defaults to documents bucket)
      let bucket = buckets.documents;
      let key = ref.replace(/^s3:\/\//, '');
      const parts = key.split('/');
      if (parts.length > 1 && (parts[0] === buckets.documents || parts[0] === buckets.uploads)) {
        bucket = parts[0];
        key = parts.slice(1).join('/');
      }
      const file = await getFile(bucket, key);
      return Buffer.from(file.body);
    } catch (error) {
      logger.warn('Failed to fetch stored change-order document', { ref, error });
      return null;
    }
  }

  /**
   * Permanently delete a change order (and its line items). Executed change
   * orders are binding and cannot be deleted — they must be voided instead.
   */
  async delete(id: string, organizationId?: string): Promise<{ deleted: boolean; reason?: string }> {
    const co = await this.getById(id);
    // Scope by org only when the caller resolved one (mirrors getAll / approve,
    // which don't hard-require an org claim on the session).
    if (!co || (organizationId && co.organization_id !== organizationId)) {
      return { deleted: false, reason: 'not_found' };
    }
    if (co.status === 'executed') {
      return { deleted: false, reason: 'executed_orders_cannot_be_deleted' };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM change_order_items WHERE change_order_id = $1', [id]);
      await client.query('DELETE FROM change_order_signatures WHERE change_order_id = $1', [id]);
      await client.query('DELETE FROM change_orders WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    logger.info('Change order deleted', { changeOrderId: id, organizationId, status: co.status });
    return { deleted: true };
  }

  private async generateChangeOrderPdf(changeOrder: ChangeOrderWithDetails, signerLabels?: string[]): Promise<Buffer> {
    // A user-uploaded PDF attachment takes precedence (the e-sign fields still
    // overlay it). Otherwise generate the branded document below.
    if (changeOrder.attachments && changeOrder.attachments.length > 0) {
      const pdfAttachment = changeOrder.attachments.find(
        a => a.type === 'application/pdf' || a.filename?.endsWith('.pdf')
      );
      if (pdfAttachment && pdfAttachment.url) {
        try {
          const response = await fetch(pdfAttachment.url);
          const buffer = await response.arrayBuffer();
          return Buffer.from(buffer);
        } catch (error) {
          logger.warn('Failed to fetch attachment PDF, using placeholder', { error });
        }
      }
    }

    // Generate the branded change-order document.
    const labels = signerLabels && signerLabels.length ? signerLabels : ['Authorised Signatory'];
    // Resolve the org's PROJECT-MANAGEMENT branding (logo/name/colors) — falls back to PROPMETRIK
    const branding = await resolveReportBranding(changeOrder.organization_id, { service: 'project_management', withLogo: true });
    return generateChangeOrderPdf({
      co_number: changeOrder.co_number,
      title: changeOrder.title,
      description: changeOrder.description,
      reason: changeOrder.reason,
      reason_details: changeOrder.reason_details,
      co_type: changeOrder.co_type,
      status: changeOrder.status,
      currency: changeOrder.currency || 'GHS',
      original_contract_amount: changeOrder.original_contract_amount,
      previous_changes_amount: changeOrder.previous_changes_amount,
      this_change_amount: changeOrder.this_change_amount,
      new_contract_amount: changeOrder.new_contract_amount,
      schedule_impact_days: changeOrder.schedule_impact_days,
      new_completion_date: changeOrder.new_completion_date,
      project_name: (changeOrder as any).project_name,
      created_at: changeOrder.created_at,
      signerLabels: labels,
      brandName: branding.name,
      brandTagline: branding.tagline,
      brandLogo: branding.logoBuffer,
      brandAccent: branding.accentColor,
      brandPrimary: branding.primaryColor,
      brandFooter: branding.addressLines[0] ? `${branding.name} · ${branding.addressLines[0]}` : branding.name,
    });
  }

  /**
   * Resolve signers for change order e-sign
   */
  private async resolveChangeOrderSigners(
    changeOrder: ChangeOrderWithDetails,
    signerRoles: string[]
  ): Promise<ESignSigner[]> {
    const signers: ESignSigner[] = [];

    // Get project team members (full_name/email are stored inline on the row)
    const teamResult = await pool.query(`
      SELECT full_name, email, role, role_type, role_category
      FROM project_team_members
      WHERE project_id = $1 AND is_active = true AND email IS NOT NULL AND email <> ''
    `, [changeOrder.project_id]);

    const teamByRole = new Map<string, any>();
    for (const member of teamResult.rows) {
      // Index by any role-ish field so the configured signer roles resolve.
      for (const key of [member.role, member.role_type, member.role_category]) {
        if (key) teamByRole.set(String(key).toLowerCase(), member);
      }
    }

    // Resolve each signer role
    let order = 1;
    for (const role of signerRoles) {
      let signer: ESignSigner | null = null;

      switch (role.toLowerCase()) {
        case 'project_manager':
          const pm = teamByRole.get('project_manager') || teamByRole.get('pm');
          if (pm) {
            signer = {
              name: pm.full_name,
              email: pm.email,
              role: 'signer',
              order: order++,
            };
          }
          break;

        case 'owner':
        case 'owner_representative':
          // Owner identity comes from the project team in the DB — never hardcoded.
          const ownerRep = teamByRole.get('owner_representative')
            || teamByRole.get('owner')
            || teamByRole.get('client')
            || teamByRole.get('owner_rep');
          if (ownerRep) {
            signer = {
              name: ownerRep.full_name,
              email: ownerRep.email,
              role: 'signer',
              order: order++,
            };
          }
          break;

        case 'contractor':
        case 'general_contractor':
          const gc = teamByRole.get('general_contractor') || teamByRole.get('contractor');
          if (gc) {
            signer = {
              name: gc.full_name,
              email: gc.email,
              role: 'signer',
              order: order++,
            };
          }
          break;

        case 'superintendent':
          const super_ = teamByRole.get('superintendent');
          if (super_) {
            signer = {
              name: super_.full_name,
              email: super_.email,
              role: 'signer',
              order: order++,
            };
          }
          break;
      }

      if (signer) {
        signers.push(signer);
      }
    }

    return signers;
  }

  /**
   * Build signature field placements for change order
   */
  private buildChangeOrderFields(
    signers: ESignSigner[],
    configuredPlacements?: any[]
  ): ESignField[] {
    // Use configured placements if available
    if (configuredPlacements && configuredPlacements.length > 0) {
      return configuredPlacements.map(p => ({
        type: p.type || 'signature',
        recipientEmail: signers[p.signerIndex]?.email || '',
        documentIndex: 0,
        page: p.page || 1,
        x: p.x || 0.1,
        y: p.y || 0.8,
        width: p.width || 0.25,
        height: p.height || 0.08,
        required: true,
      }));
    }

    // Default: place each signer's signature + date on the document's signature
    // slots. Coordinates are PERCENT of the page (0-100) — the same scale the
    // renderer/designer use — and align with the lines drawn by the PDF generator.
    const fields: ESignField[] = [];
    const slots = changeOrderSignatureSlots(signers.map((s) => s.name));
    signers.forEach((signer, i) => {
      const slot = slots[i];
      if (!slot) return;
      fields.push({
        type: 'signature', recipientEmail: signer.email, documentIndex: 0, page: 1,
        x: slot.sigX, y: slot.sigY, width: slot.sigW, height: slot.sigH, required: true,
      });
      fields.push({
        type: 'date_signed', recipientEmail: signer.email, documentIndex: 0, page: 1,
        x: slot.dateX, y: slot.dateY, width: slot.dateW, height: slot.dateH, required: true,
      });
    });

    return fields;
  }

  /**
   * Log e-sign audit event
   */
  private async logEsignAudit(
    organizationId: string,
    entityType: string,
    entityId: string,
    envelopeId: string,
    action: string,
    performedBy: string | null,
    metadata: any = {}
  ): Promise<void> {
    await pool.query(`
      INSERT INTO project_esign_audit (
        organization_id, entity_type, entity_id, esign_envelope_id,
        action, performed_by, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [organizationId, entityType, entityId, envelopeId, action, performedBy, JSON.stringify(metadata)]);
  }

  // =====================================================
  // PRIVATE HELPERS
  // =====================================================

  private calculateItemsTotal(items: ChangeOrderItem[]): number {
    return items.reduce((sum, item) => {
      const totalCost = item.quantity * item.unit_cost * (1 + (item.markup_percentage || 0) / 100);
      return sum + totalCost;
    }, 0);
  }

  private async logHistory(
    client: any,
    coId: string,
    action: string,
    previousStatus: ChangeOrderStatus | null,
    newStatus: ChangeOrderStatus | null,
    fieldChanges: Record<string, any> | null,
    performedBy?: string,
    comment?: string
  ): Promise<void> {
    await client.query(`
      INSERT INTO change_order_history (change_order_id, action, previous_status, new_status, field_changes, comment, performed_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [coId, action, previousStatus, newStatus, fieldChanges ? JSON.stringify(fieldChanges) : null, comment, performedBy]);
  }

  private mapChangeOrder(row: any): ChangeOrder {
    return {
      id: row.id,
      organization_id: row.organization_id,
      project_id: row.project_id,
      co_number: row.co_number,
      revision_number: row.revision_number,
      title: row.title,
      description: row.description,
      reason: row.reason,
      reason_details: row.reason_details,
      co_type: row.co_type,
      status: row.status,
      original_contract_amount: parseFloat(row.original_contract_amount) || 0,
      previous_changes_amount: parseFloat(row.previous_changes_amount) || 0,
      this_change_amount: parseFloat(row.this_change_amount) || 0,
      new_contract_amount: parseFloat(row.new_contract_amount) || 0,
      currency: row.currency || 'GHS',
      original_completion_date: row.original_completion_date,
      schedule_impact_days: row.schedule_impact_days || 0,
      new_completion_date: row.new_completion_date,
      submitted_by: row.submitted_by,
      submitted_at: row.submitted_at,
      approved_by: row.approved_by,
      approved_at: row.approved_at,
      executed_by: row.executed_by,
      executed_at: row.executed_at,
      phase_id: row.phase_id,
      related_rfi_id: row.related_rfi_id,
      attachments: typeof row.attachments === 'string'
        ? JSON.parse(row.attachments)
        : row.attachments || [],
      esign_envelope_id: row.esign_envelope_id ?? null,
      esign_status: row.esign_status ?? null,
      esign_triggered_at: row.esign_triggered_at ?? null,
      esign_completed_at: row.esign_completed_at ?? null,
      signed_document_url: row.signed_document_url ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      created_by: row.created_by,
      updated_by: row.updated_by
    };
  }

  private mapChangeOrderWithDetails(row: any): ChangeOrderWithDetails {
    return {
      ...this.mapChangeOrder(row),
      project_name: row.project_name,
      project_number: row.project_number,
      submitted_by_name: row.submitted_by_name,
      approved_by_name: row.approved_by_name,
      executed_by_name: row.executed_by_name,
      phase_name: row.phase_name,
      related_rfi_number: row.related_rfi_number,
      pending_signatures: row.pending_signatures ? parseInt(row.pending_signatures, 10) : 0,
      ball_in_court: row.ball_in_court ?? null,
      // Drafts await the submitter; pending COs await the project PM/approver.
      ball_in_court_name: row.ball_in_court
        ? (row.status === 'draft' ? row.submitted_by_name : row.ball_pm_name)
        : null,
    };
  }

  private mapItem(row: any): ChangeOrderItem {
    return {
      id: row.id,
      description: row.description,
      item_type: row.item_type,
      quantity: parseFloat(row.quantity) || 0,
      unit: row.unit,
      unit_cost: parseFloat(row.unit_cost) || 0,
      markup_percentage: parseFloat(row.markup_percentage) || 0,
      total_cost: parseFloat(row.total_cost) || 0,
      cost_code: row.cost_code,
      notes: row.notes
    };
  }

  private mapSignature(row: any): ChangeOrderSignature {
    return {
      id: row.id,
      signatory_role: row.signatory_role,
      signatory_name: row.signatory_name,
      signatory_user_id: row.signatory_user_id,
      is_required: row.is_required,
      signed: row.signed,
      signed_at: row.signed_at,
      signature_data: row.signature_data,
      comments: row.comments
    };
  }
}

export const changeOrderService = new ChangeOrderService();
export default changeOrderService;
