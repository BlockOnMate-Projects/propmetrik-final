/**
 * Change Request Service
 * 
 * Phase 3.8: Split changeOrderService
 * 
 * Handles core change order CRUD:
 * - Create change orders with items
 * - Get/list with filters
 * - Update change orders
 * - Item management (add, update, delete)
 * 
 * @module services/project-management/change-orders/ChangeRequestService
 */

import { pool } from '../../../database';
import { BaseService } from '../../../../shared-services/base/BaseService';
import { eventBus } from '../events/EventBus';
import {
  ChangeOrder,
  ChangeOrderWithDetails,
  ChangeOrderItem,
  ChangeOrderSignature,
  CreateChangeOrderInput,
  UpdateChangeOrderInput,
  ChangeOrderFilters,
  ChangeOrderStats,
  ChangeOrderHistoryEntry,
  Attachment,
} from './types';

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class ChangeRequestServiceImpl extends BaseService {
  constructor() {
    super('ChangeRequestService');
  }

  // ==========================================================================
  // CREATE
  // ==========================================================================

  /**
   * Create a new change order
   */
  async create(input: CreateChangeOrderInput): Promise<ChangeOrderWithDetails> {
    return this.executeInTransaction(async (client) => {
      // Generate CO number
      const countResult = await client.query(
        `SELECT COUNT(*) + 1 as next_num FROM change_orders WHERE project_id = $1`,
        [input.projectId]
      );
      const coNumber = `CO-${String(countResult.rows[0].next_num).padStart(4, '0')}`;

      // Calculate total from items
      let thisChangeAmount = 0;
      if (input.items && input.items.length > 0) {
        thisChangeAmount = input.items.reduce((sum, item) => {
          const itemTotal = item.quantity * item.unitCost * (1 + (item.markupPercentage || 0) / 100);
          return sum + itemTotal;
        }, 0);
      }

      const previousChanges = input.previousChangesAmount || 0;
      const newContractAmount = input.originalContractAmount + previousChanges + thisChangeAmount;

      // Calculate new completion date
      let newCompletionDate = null;
      if (input.originalCompletionDate && input.scheduleImpactDays) {
        const origDate = new Date(input.originalCompletionDate);
        origDate.setDate(origDate.getDate() + input.scheduleImpactDays);
        newCompletionDate = origDate.toISOString().split('T')[0];
      }

      // Insert change order
      const result = await client.query(
        `INSERT INTO change_orders (
           organization_id, project_id, co_number, revision_number,
           title, description, reason, reason_details, co_type, status,
           original_contract_amount, previous_changes_amount, this_change_amount, new_contract_amount,
           currency, original_completion_date, schedule_impact_days, new_completion_date,
           phase_id, related_rfi_id, attachments, created_by, created_at, updated_at
         ) VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, 'draft', $9, $10, $11, $12, 'GHS', $13, $14, $15, $16, $17, $18, $19, NOW(), NOW())
         RETURNING *`,
        [
          input.organizationId,
          input.projectId,
          coNumber,
          input.title,
          input.description,
          input.reason,
          input.reasonDetails || null,
          input.coType || 'additive',
          input.originalContractAmount,
          previousChanges,
          thisChangeAmount,
          newContractAmount,
          input.originalCompletionDate || null,
          input.scheduleImpactDays || 0,
          newCompletionDate,
          input.phaseId || null,
          input.relatedRfiId || null,
          JSON.stringify(input.attachments || []),
          input.createdBy || null,
        ]
      );

      const changeOrder = result.rows[0];

      // Insert items
      const items: ChangeOrderItem[] = [];
      if (input.items && input.items.length > 0) {
        for (const item of input.items) {
          const itemTotal = item.quantity * item.unitCost * (1 + (item.markupPercentage || 0) / 100);
          const itemResult = await client.query(
            `INSERT INTO change_order_items (
               change_order_id, description, item_type, quantity, unit,
               unit_cost, markup_percentage, total_cost, cost_code, notes, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
             RETURNING *`,
            [
              changeOrder.id,
              item.description,
              item.itemType,
              item.quantity,
              item.unit,
              item.unitCost,
              item.markupPercentage || 0,
              itemTotal,
              item.costCode || null,
              item.notes || null,
            ]
          );
          items.push(this.mapItem(itemResult.rows[0]));
        }
      }

      // Insert signatures
      const signatures: ChangeOrderSignature[] = [];
      if (input.signatures && input.signatures.length > 0) {
        for (let i = 0; i < input.signatures.length; i++) {
          const sig = input.signatures[i];
          const sigResult = await client.query(
            `INSERT INTO change_order_signatures (
               change_order_id, signatory_role, signatory_name, signatory_user_id,
               is_required, signed, signature_order, created_at
             ) VALUES ($1, $2, $3, $4, $5, false, $6, NOW())
             RETURNING *`,
            [
              changeOrder.id,
              sig.signatoryRole,
              sig.signatoryName || null,
              sig.signatoryUserId || null,
              sig.isRequired !== false,
              sig.signatureOrder || i + 1,
            ]
          );
          signatures.push(this.mapSignature(sigResult.rows[0]));
        }
      }

      // Log history
      await this.logHistory(client, changeOrder.id, 'create', null, 'draft', input.createdBy);

      eventBus.emit('changeOrder.created' as any, {
        changeOrderId: changeOrder.id,
        projectId: input.projectId,
        coNumber,
        createdBy: input.createdBy,
      });

      return {
        ...this.mapChangeOrder(changeOrder),
        items,
        signatures,
      };
    });
  }

  // ==========================================================================
  // READ
  // ==========================================================================

  /**
   * Get change order by ID with details
   */
  async getById(id: string): Promise<ChangeOrderWithDetails | null> {
    const result = await this.query(
      `SELECT 
         co.*,
         p.name as project_name, p.project_number,
         ph.name as phase_name,
         rfi.rfi_number as related_rfi_number,
         su.full_name as submitted_by_name,
         au.full_name as approved_by_name,
         eu.full_name as executed_by_name
       FROM change_orders co
       LEFT JOIN development_projects p ON co.project_id = p.id
       LEFT JOIN project_phases ph ON co.phase_id = ph.id
       LEFT JOIN rfis rfi ON co.related_rfi_id = rfi.id
       LEFT JOIN users su ON co.submitted_by = su.id
       LEFT JOIN users au ON co.approved_by = au.id
       LEFT JOIN users eu ON co.executed_by = eu.id
       WHERE co.id = $1`,
      [id]
    );

    if (!result.rows[0]) return null;

    const changeOrder = this.mapChangeOrderWithDetails(result.rows[0]);

    // Get items
    const itemsResult = await this.query(
      `SELECT * FROM change_order_items WHERE change_order_id = $1 ORDER BY created_at`,
      [id]
    );
    changeOrder.items = itemsResult.rows.map(this.mapItem);

    // Get signatures
    const sigsResult = await this.query(
      `SELECT * FROM change_order_signatures WHERE change_order_id = $1 ORDER BY signature_order`,
      [id]
    );
    changeOrder.signatures = sigsResult.rows.map(this.mapSignature);
    changeOrder.pendingSignatures = sigsResult.rows.filter(s => s.is_required && !s.signed).length;

    return changeOrder;
  }

  /**
   * Get all change orders with filters
   */
  async getAll(filters: ChangeOrderFilters): Promise<{ data: ChangeOrderWithDetails[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.organizationId) {
      conditions.push(`co.organization_id = $${paramIndex++}`);
      params.push(filters.organizationId);
    }

    if (filters.projectId) {
      conditions.push(`co.project_id = $${paramIndex++}`);
      params.push(filters.projectId);
    }

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(`co.status = ANY($${paramIndex++})`);
        params.push(filters.status);
      } else {
        conditions.push(`co.status = $${paramIndex++}`);
        params.push(filters.status);
      }
    }

    if (filters.reason) {
      if (Array.isArray(filters.reason)) {
        conditions.push(`co.reason = ANY($${paramIndex++})`);
        params.push(filters.reason);
      } else {
        conditions.push(`co.reason = $${paramIndex++}`);
        params.push(filters.reason);
      }
    }

    if (filters.coType) {
      if (Array.isArray(filters.coType)) {
        conditions.push(`co.co_type = ANY($${paramIndex++})`);
        params.push(filters.coType);
      } else {
        conditions.push(`co.co_type = $${paramIndex++}`);
        params.push(filters.coType);
      }
    }

    if (filters.phaseId) {
      conditions.push(`co.phase_id = $${paramIndex++}`);
      params.push(filters.phaseId);
    }

    if (filters.minAmount !== undefined) {
      conditions.push(`co.this_change_amount >= $${paramIndex++}`);
      params.push(filters.minAmount);
    }

    if (filters.maxAmount !== undefined) {
      conditions.push(`co.this_change_amount <= $${paramIndex++}`);
      params.push(filters.maxAmount);
    }

    if (filters.search) {
      conditions.push(`(co.title ILIKE $${paramIndex} OR co.description ILIKE $${paramIndex} OR co.co_number ILIKE $${paramIndex})`);
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total
    const countResult = await this.query(
      `SELECT COUNT(*) FROM change_orders co ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get data
    const sortBy = filters.sortBy || 'created_at';
    const sortOrder = filters.sortOrder || 'desc';
    const limit = filters.limit || 20;
    const offset = filters.offset || 0;

    const dataResult = await this.query(
      `SELECT 
         co.*,
         p.name as project_name, p.project_number,
         ph.name as phase_name,
         su.full_name as submitted_by_name,
         (SELECT COUNT(*) FROM change_order_signatures s WHERE s.change_order_id = co.id AND s.is_required AND NOT s.signed) as pending_signatures
       FROM change_orders co
       LEFT JOIN development_projects p ON co.project_id = p.id
       LEFT JOIN project_phases ph ON co.phase_id = ph.id
       LEFT JOIN users su ON co.submitted_by = su.id
       ${whereClause}
       ORDER BY co.${sortBy} ${sortOrder}
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    return {
      data: dataResult.rows.map(this.mapChangeOrderWithDetails),
      total,
    };
  }

  // ==========================================================================
  // UPDATE
  // ==========================================================================

  /**
   * Update a change order (draft only)
   */
  async update(id: string, input: UpdateChangeOrderInput): Promise<ChangeOrderWithDetails> {
    // Check status
    const current = await this.getById(id);
    if (!current) throw new Error('Change order not found');
    if (current.status !== 'draft') {
      throw new Error('Can only update change orders in draft status');
    }

    const updates: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    let paramIndex = 1;

    if (input.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      params.push(input.title);
    }

    if (input.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(input.description);
    }

    if (input.reason !== undefined) {
      updates.push(`reason = $${paramIndex++}`);
      params.push(input.reason);
    }

    if (input.reasonDetails !== undefined) {
      updates.push(`reason_details = $${paramIndex++}`);
      params.push(input.reasonDetails);
    }

    if (input.coType !== undefined) {
      updates.push(`co_type = $${paramIndex++}`);
      params.push(input.coType);
    }

    if (input.scheduleImpactDays !== undefined) {
      updates.push(`schedule_impact_days = $${paramIndex++}`);
      params.push(input.scheduleImpactDays);
    }

    if (input.phaseId !== undefined) {
      updates.push(`phase_id = $${paramIndex++}`);
      params.push(input.phaseId);
    }

    if (input.attachments !== undefined) {
      updates.push(`attachments = $${paramIndex++}`);
      params.push(JSON.stringify(input.attachments));
    }

    if (input.updatedBy) {
      updates.push(`updated_by = $${paramIndex++}`);
      params.push(input.updatedBy);
    }

    params.push(id);

    await this.query(
      `UPDATE change_orders SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      params
    );

    eventBus.emit('changeOrder.updated' as any, {
      changeOrderId: id,
      updatedBy: input.updatedBy,
    });

    return this.getById(id) as Promise<ChangeOrderWithDetails>;
  }

  // ==========================================================================
  // ITEMS
  // ==========================================================================

  /**
   * Add items to a change order
   */
  async addItems(coId: string, items: ChangeOrderItem[], userId: string): Promise<ChangeOrderItem[]> {
    const co = await this.getById(coId);
    if (!co) throw new Error('Change order not found');
    if (co.status !== 'draft') {
      throw new Error('Can only add items to change orders in draft status');
    }

    const addedItems: ChangeOrderItem[] = [];

    await this.executeInTransaction(async (client) => {
      for (const item of items) {
        const itemTotal = item.quantity * item.unitCost * (1 + (item.markupPercentage || 0) / 100);
        const result = await client.query(
          `INSERT INTO change_order_items (
             change_order_id, description, item_type, quantity, unit,
             unit_cost, markup_percentage, total_cost, cost_code, notes, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
           RETURNING *`,
          [coId, item.description, item.itemType, item.quantity, item.unit,
           item.unitCost, item.markupPercentage || 0, itemTotal, item.costCode || null, item.notes || null]
        );
        addedItems.push(this.mapItem(result.rows[0]));
      }

      // Update totals
      await this.recalculateTotals(client, coId);
    });

    return addedItems;
  }

  /**
   * Update an item
   */
  async updateItem(itemId: string, item: Partial<ChangeOrderItem>, userId: string): Promise<ChangeOrderItem> {
    // Get item's change order
    const itemResult = await this.query(
      `SELECT change_order_id FROM change_order_items WHERE id = $1`,
      [itemId]
    );
    if (!itemResult.rows[0]) throw new Error('Item not found');

    const co = await this.getById(itemResult.rows[0].change_order_id);
    if (!co) throw new Error('Change order not found');
    if (co.status !== 'draft') {
      throw new Error('Can only update items in change orders in draft status');
    }

    return this.executeInTransaction(async (client) => {
      const updates: string[] = ['updated_at = NOW()'];
      const params: any[] = [];
      let paramIndex = 1;

      if (item.description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        params.push(item.description);
      }

      if (item.itemType !== undefined) {
        updates.push(`item_type = $${paramIndex++}`);
        params.push(item.itemType);
      }

      if (item.quantity !== undefined) {
        updates.push(`quantity = $${paramIndex++}`);
        params.push(item.quantity);
      }

      if (item.unit !== undefined) {
        updates.push(`unit = $${paramIndex++}`);
        params.push(item.unit);
      }

      if (item.unitCost !== undefined) {
        updates.push(`unit_cost = $${paramIndex++}`);
        params.push(item.unitCost);
      }

      if (item.markupPercentage !== undefined) {
        updates.push(`markup_percentage = $${paramIndex++}`);
        params.push(item.markupPercentage);
      }

      params.push(itemId);

      await client.query(
        `UPDATE change_order_items SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        params
      );

      // Recalculate total_cost
      await client.query(
        `UPDATE change_order_items SET total_cost = quantity * unit_cost * (1 + markup_percentage / 100) WHERE id = $1`,
        [itemId]
      );

      // Recalculate CO totals
      await this.recalculateTotals(client, co.id);

      const result = await client.query(`SELECT * FROM change_order_items WHERE id = $1`, [itemId]);
      return this.mapItem(result.rows[0]);
    });
  }

  /**
   * Delete an item
   */
  async deleteItem(itemId: string): Promise<void> {
    const itemResult = await this.query(
      `SELECT change_order_id FROM change_order_items WHERE id = $1`,
      [itemId]
    );
    if (!itemResult.rows[0]) return;

    const coId = itemResult.rows[0].change_order_id;

    await this.executeInTransaction(async (client) => {
      await client.query(`DELETE FROM change_order_items WHERE id = $1`, [itemId]);
      await this.recalculateTotals(client, coId);
    });
  }

  // ==========================================================================
  // HISTORY & STATS
  // ==========================================================================

  /**
   * Get change order history
   */
  async getHistory(coId: string): Promise<ChangeOrderHistoryEntry[]> {
    const result = await this.query(
      `SELECT h.*, u.full_name as performed_by_name
       FROM change_order_history h
       LEFT JOIN users u ON h.performed_by = u.id
       WHERE h.change_order_id = $1
       ORDER BY h.performed_at DESC`,
      [coId]
    );

    return result.rows.map(row => ({
      id: row.id,
      changeOrderId: row.change_order_id,
      action: row.action,
      previousStatus: row.previous_status,
      newStatus: row.new_status,
      fieldChanges: row.field_changes,
      comment: row.comment,
      performedBy: row.performed_by,
      performedByName: row.performed_by_name,
      performedAt: row.performed_at?.toISOString() || '',
    }));
  }

  /**
   * Get change order statistics for a project
   */
  async getStats(projectId: string): Promise<ChangeOrderStats> {
    const result = await this.query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'draft') as draft,
         COUNT(*) FILTER (WHERE status = 'pending_review') as pending_review,
         COUNT(*) FILTER (WHERE status = 'pending_approval') as pending_approval,
         COUNT(*) FILTER (WHERE status = 'approved') as approved,
         COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
         COUNT(*) FILTER (WHERE status = 'executed') as executed,
         COUNT(*) FILTER (WHERE status = 'void') as void_count,
         SUM(CASE WHEN co_type = 'additive' AND status = 'executed' THEN this_change_amount ELSE 0 END) as total_additions,
         SUM(CASE WHEN co_type = 'deductive' AND status = 'executed' THEN ABS(this_change_amount) ELSE 0 END) as total_deductions,
         SUM(CASE WHEN status = 'executed' THEN this_change_amount ELSE 0 END) as net_change,
         SUM(CASE WHEN status = 'executed' THEN schedule_impact_days ELSE 0 END) as total_schedule_impact
       FROM change_orders
       WHERE project_id = $1`,
      [projectId]
    );

    const row = result.rows[0] || {};

    // Get by reason
    const reasonResult = await this.query(
      `SELECT reason, COUNT(*) as count FROM change_orders WHERE project_id = $1 GROUP BY reason`,
      [projectId]
    );
    const byReason: Record<string, number> = {};
    for (const r of reasonResult.rows) {
      byReason[r.reason] = parseInt(r.count, 10);
    }

    // Get by type
    const typeResult = await this.query(
      `SELECT co_type, COUNT(*) as count FROM change_orders WHERE project_id = $1 GROUP BY co_type`,
      [projectId]
    );
    const byType: Record<string, number> = {};
    for (const t of typeResult.rows) {
      byType[t.co_type] = parseInt(t.count, 10);
    }

    return {
      total: parseInt(row.total, 10) || 0,
      byStatus: {
        draft: parseInt(row.draft, 10) || 0,
        pending_review: parseInt(row.pending_review, 10) || 0,
        pending_approval: parseInt(row.pending_approval, 10) || 0,
        approved: parseInt(row.approved, 10) || 0,
        rejected: parseInt(row.rejected, 10) || 0,
        executed: parseInt(row.executed, 10) || 0,
        void: parseInt(row.void_count, 10) || 0,
      },
      byReason: byReason as any,
      byType: byType as any,
      totalAdditions: parseFloat(row.total_additions) || 0,
      totalDeductions: parseFloat(row.total_deductions) || 0,
      netChange: parseFloat(row.net_change) || 0,
      avgProcessingDays: 0, // Would need date calculations
      pendingApproval: parseInt(row.pending_approval, 10) || 0,
      totalScheduleImpactDays: parseInt(row.total_schedule_impact, 10) || 0,
    };
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private async recalculateTotals(client: any, coId: string): Promise<void> {
    await client.query(
      `UPDATE change_orders SET
         this_change_amount = COALESCE((SELECT SUM(total_cost) FROM change_order_items WHERE change_order_id = $1), 0),
         new_contract_amount = original_contract_amount + previous_changes_amount + 
           COALESCE((SELECT SUM(total_cost) FROM change_order_items WHERE change_order_id = $1), 0),
         updated_at = NOW()
       WHERE id = $1`,
      [coId]
    );
  }

  async logHistory(
    client: any,
    coId: string,
    action: string,
    prevStatus: string | null,
    newStatus: string | null,
    userId?: string,
    comment?: string
  ): Promise<void> {
    await client.query(
      `INSERT INTO change_order_history (change_order_id, action, previous_status, new_status, performed_by, comment, performed_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [coId, action, prevStatus, newStatus, userId || null, comment || null]
    );
  }

  private mapChangeOrder(row: any): ChangeOrder {
    return {
      id: row.id,
      organizationId: row.organization_id,
      projectId: row.project_id,
      coNumber: row.co_number,
      revisionNumber: parseInt(row.revision_number, 10) || 1,
      title: row.title,
      description: row.description,
      reason: row.reason,
      reasonDetails: row.reason_details,
      coType: row.co_type,
      status: row.status,
      originalContractAmount: parseFloat(row.original_contract_amount) || 0,
      previousChangesAmount: parseFloat(row.previous_changes_amount) || 0,
      thisChangeAmount: parseFloat(row.this_change_amount) || 0,
      newContractAmount: parseFloat(row.new_contract_amount) || 0,
      currency: row.currency || 'GHS',
      originalCompletionDate: row.original_completion_date?.toISOString().split('T')[0],
      scheduleImpactDays: parseInt(row.schedule_impact_days, 10) || 0,
      newCompletionDate: row.new_completion_date?.toISOString().split('T')[0],
      submittedBy: row.submitted_by,
      submittedAt: row.submitted_at?.toISOString(),
      approvedBy: row.approved_by,
      approvedAt: row.approved_at?.toISOString(),
      executedBy: row.executed_by,
      executedAt: row.executed_at?.toISOString(),
      phaseId: row.phase_id,
      relatedRfiId: row.related_rfi_id,
      attachments: typeof row.attachments === 'string' ? JSON.parse(row.attachments) : row.attachments || [],
      createdAt: row.created_at?.toISOString() || '',
      updatedAt: row.updated_at?.toISOString() || '',
      createdBy: row.created_by,
      updatedBy: row.updated_by,
    };
  }

  private mapChangeOrderWithDetails(row: any): ChangeOrderWithDetails {
    return {
      ...this.mapChangeOrder(row),
      projectName: row.project_name,
      projectNumber: row.project_number,
      submittedByName: row.submitted_by_name,
      approvedByName: row.approved_by_name,
      executedByName: row.executed_by_name,
      phaseName: row.phase_name,
      relatedRfiNumber: row.related_rfi_number,
      pendingSignatures: row.pending_signatures ? parseInt(row.pending_signatures, 10) : undefined,
    };
  }

  private mapItem(row: any): ChangeOrderItem {
    return {
      id: row.id,
      changeOrderId: row.change_order_id,
      description: row.description,
      itemType: row.item_type,
      quantity: parseFloat(row.quantity) || 0,
      unit: row.unit,
      unitCost: parseFloat(row.unit_cost) || 0,
      markupPercentage: parseFloat(row.markup_percentage) || 0,
      totalCost: parseFloat(row.total_cost) || 0,
      costCode: row.cost_code,
      notes: row.notes,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  private mapSignature(row: any): ChangeOrderSignature {
    return {
      id: row.id,
      changeOrderId: row.change_order_id,
      signatoryRole: row.signatory_role,
      signatoryName: row.signatory_name,
      signatoryUserId: row.signatory_user_id,
      isRequired: row.is_required,
      signed: row.signed,
      signedAt: row.signed_at?.toISOString(),
      signatureData: row.signature_data,
      comments: row.comments,
      signatureOrder: parseInt(row.signature_order, 10) || 0,
    };
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const changeRequestService = new ChangeRequestServiceImpl();
