/**
 * Change Approval Service
 * 
 * Phase 3.8: Split changeOrderService
 * 
 * Handles change order approval workflow:
 * - Submit for review
 * - Request approval
 * - Sign/approve/reject
 * - Execute/void
 * - Status transitions
 * 
 * @module services/project-management/change-orders/ChangeApprovalService
 */

import { pool } from '../../../database';
import { BaseService } from '../../base/BaseService';
import { eventBus } from '../events/EventBus';
import {
  ChangeOrderStatus,
  ChangeOrderWithDetails,
  ChangeOrderSignature,
  SignatureRequest,
  ApprovalAction,
} from './types';
import { changeRequestService } from './ChangeRequestService';

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class ChangeApprovalServiceImpl extends BaseService {
  constructor() {
    super('ChangeApprovalService');
  }

  // ==========================================================================
  // WORKFLOW TRANSITIONS
  // ==========================================================================

  /**
   * Submit change order for review
   */
  async submit(id: string, userId: string): Promise<ChangeOrderWithDetails> {
    const co = await changeRequestService.getById(id);
    if (!co) throw new Error('Change order not found');

    if (co.status !== 'draft') {
      throw new Error('Can only submit change orders in draft status');
    }

    // Validate has items
    if (!co.items || co.items.length === 0) {
      throw new Error('Change order must have at least one item');
    }

    await this.executeInTransaction(async (client) => {
      await client.query(
        `UPDATE change_orders
         SET status = 'pending_review', submitted_by = $1, submitted_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [userId, id]
      );

      await changeRequestService.logHistory(client, id, 'submit', 'draft', 'pending_review', userId);
    });

    eventBus.emit('changeOrder.submitted', {
      changeOrderId: id,
      submittedBy: userId,
    });

    return changeRequestService.getById(id) as Promise<ChangeOrderWithDetails>;
  }

  /**
   * Request approval (move from review to pending approval)
   */
  async requestApproval(id: string, userId: string): Promise<ChangeOrderWithDetails> {
    const co = await changeRequestService.getById(id);
    if (!co) throw new Error('Change order not found');

    if (co.status !== 'pending_review') {
      throw new Error('Can only request approval for change orders pending review');
    }

    await this.executeInTransaction(async (client) => {
      await client.query(
        `UPDATE change_orders
         SET status = 'pending_approval', updated_at = NOW()
         WHERE id = $1`,
        [id]
      );

      await changeRequestService.logHistory(client, id, 'request_approval', 'pending_review', 'pending_approval', userId);
    });

    eventBus.emit('changeOrder.approvalRequested', {
      changeOrderId: id,
      requestedBy: userId,
    });

    return changeRequestService.getById(id) as Promise<ChangeOrderWithDetails>;
  }

  /**
   * Sign a change order (individual signature)
   */
  async sign(request: SignatureRequest): Promise<ChangeOrderWithDetails> {
    const co = await changeRequestService.getById(request.changeOrderId);
    if (!co) throw new Error('Change order not found');

    if (!['pending_review', 'pending_approval'].includes(co.status)) {
      throw new Error('Cannot sign change order in current status');
    }

    // Find signature
    const signature = co.signatures?.find(s => s.id === request.signatureId);
    if (!signature) throw new Error('Signature not found');

    if (signature.signed) {
      throw new Error('Signature already applied');
    }

    await this.executeInTransaction(async (client) => {
      await client.query(
        `UPDATE change_order_signatures
         SET signed = true, signed_at = NOW(), signature_data = $1, comments = $2
         WHERE id = $3`,
        [request.signatureData || null, request.comments || null, request.signatureId]
      );

      await changeRequestService.logHistory(
        client, request.changeOrderId, 'sign', co.status, co.status, request.userId,
        `Signed as ${signature.signatoryRole}`
      );
    });

    eventBus.emit('changeOrder.signed', {
      changeOrderId: request.changeOrderId,
      signatureId: request.signatureId,
      signedBy: request.userId,
      role: signature.signatoryRole,
    });

    return changeRequestService.getById(request.changeOrderId) as Promise<ChangeOrderWithDetails>;
  }

  /**
   * Approve a change order
   */
  async approve(id: string, userId: string, comment?: string): Promise<ChangeOrderWithDetails> {
    const co = await changeRequestService.getById(id);
    if (!co) throw new Error('Change order not found');

    if (co.status !== 'pending_approval') {
      throw new Error('Can only approve change orders pending approval');
    }

    // Check all required signatures
    const pendingSignatures = co.signatures?.filter(s => s.isRequired && !s.signed) || [];
    if (pendingSignatures.length > 0) {
      throw new Error(`Missing required signatures: ${pendingSignatures.map(s => s.signatoryRole).join(', ')}`);
    }

    await this.executeInTransaction(async (client) => {
      await client.query(
        `UPDATE change_orders
         SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [userId, id]
      );

      await changeRequestService.logHistory(client, id, 'approve', 'pending_approval', 'approved', userId, comment);
    });

    eventBus.emit('changeOrder.approved', {
      changeOrderId: id,
      approvedBy: userId,
      amount: co.thisChangeAmount,
    });

    return changeRequestService.getById(id) as Promise<ChangeOrderWithDetails>;
  }

  /**
   * Reject a change order
   */
  async reject(id: string, userId: string, reason: string): Promise<ChangeOrderWithDetails> {
    if (!reason) throw new Error('Rejection reason is required');

    const co = await changeRequestService.getById(id);
    if (!co) throw new Error('Change order not found');

    if (!['pending_review', 'pending_approval'].includes(co.status)) {
      throw new Error('Cannot reject change order in current status');
    }

    await this.executeInTransaction(async (client) => {
      await client.query(
        `UPDATE change_orders
         SET status = 'rejected', updated_at = NOW()
         WHERE id = $1`,
        [id]
      );

      await changeRequestService.logHistory(client, id, 'reject', co.status, 'rejected', userId, reason);
    });

    eventBus.emit('changeOrder.rejected', {
      changeOrderId: id,
      rejectedBy: userId,
      reason,
    });

    return changeRequestService.getById(id) as Promise<ChangeOrderWithDetails>;
  }

  /**
   * Execute an approved change order
   */
  async execute(id: string, userId: string): Promise<ChangeOrderWithDetails> {
    const co = await changeRequestService.getById(id);
    if (!co) throw new Error('Change order not found');

    if (co.status !== 'approved') {
      throw new Error('Can only execute approved change orders');
    }

    await this.executeInTransaction(async (client) => {
      await client.query(
        `UPDATE change_orders
         SET status = 'executed', executed_by = $1, executed_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [userId, id]
      );

      // Update project contract amount
      await client.query(
        `UPDATE development_projects
         SET total_budget = total_budget + $1, updated_at = NOW()
         WHERE id = $2`,
        [co.thisChangeAmount, co.projectId]
      );

      // Update schedule if there's impact
      if (co.scheduleImpactDays > 0 && co.newCompletionDate) {
        await client.query(
          `UPDATE development_projects
           SET end_date = $1, updated_at = NOW()
           WHERE id = $2`,
          [co.newCompletionDate, co.projectId]
        );
      }

      await changeRequestService.logHistory(client, id, 'execute', 'approved', 'executed', userId);
    });

    eventBus.emit('changeOrder.executed', {
      changeOrderId: id,
      executedBy: userId,
      amount: co.thisChangeAmount,
      scheduleImpact: co.scheduleImpactDays,
    });

    return changeRequestService.getById(id) as Promise<ChangeOrderWithDetails>;
  }

  /**
   * Void a change order
   */
  async void(id: string, userId: string, reason: string): Promise<ChangeOrderWithDetails> {
    if (!reason) throw new Error('Void reason is required');

    const co = await changeRequestService.getById(id);
    if (!co) throw new Error('Change order not found');

    if (co.status === 'executed') {
      throw new Error('Cannot void executed change orders');
    }

    if (co.status === 'void') {
      throw new Error('Change order is already void');
    }

    await this.executeInTransaction(async (client) => {
      await client.query(
        `UPDATE change_orders
         SET status = 'void', updated_at = NOW()
         WHERE id = $1`,
        [id]
      );

      await changeRequestService.logHistory(client, id, 'void', co.status, 'void', userId, reason);
    });

    eventBus.emit('changeOrder.voided', {
      changeOrderId: id,
      voidedBy: userId,
      reason,
    });

    return changeRequestService.getById(id) as Promise<ChangeOrderWithDetails>;
  }

  // ==========================================================================
  // SIGNATURE MANAGEMENT
  // ==========================================================================

  /**
   * Add a signature requirement
   */
  async addSignatureRequirement(
    coId: string,
    signature: Omit<ChangeOrderSignature, 'id' | 'changeOrderId' | 'signed' | 'signedAt'>
  ): Promise<ChangeOrderSignature> {
    const co = await changeRequestService.getById(coId);
    if (!co) throw new Error('Change order not found');

    if (!['draft', 'pending_review'].includes(co.status)) {
      throw new Error('Cannot add signatures after approval process started');
    }

    const result = await this.query(
      `INSERT INTO change_order_signatures (
         change_order_id, signatory_role, signatory_name, signatory_user_id,
         is_required, signed, signature_order, created_at
       ) VALUES ($1, $2, $3, $4, $5, false, $6, NOW())
       RETURNING *`,
      [
        coId,
        signature.signatoryRole,
        signature.signatoryName || null,
        signature.signatoryUserId || null,
        signature.isRequired !== false,
        signature.signatureOrder || 99,
      ]
    );

    return this.mapSignature(result.rows[0]);
  }

  /**
   * Remove a signature requirement
   */
  async removeSignatureRequirement(signatureId: string): Promise<boolean> {
    // Get signature to check status
    const sigResult = await this.query(
      `SELECT s.*, co.status FROM change_order_signatures s
       JOIN change_orders co ON s.change_order_id = co.id
       WHERE s.id = $1`,
      [signatureId]
    );

    if (!sigResult.rows[0]) return false;

    const sig = sigResult.rows[0];
    if (!['draft', 'pending_review'].includes(sig.status)) {
      throw new Error('Cannot remove signatures after approval process started');
    }

    if (sig.signed) {
      throw new Error('Cannot remove already-signed signature');
    }

    const result = await this.query(
      `DELETE FROM change_order_signatures WHERE id = $1`,
      [signatureId]
    );

    return result.rowCount > 0;
  }

  /**
   * Get pending signatures for a change order
   */
  async getPendingSignatures(coId: string): Promise<ChangeOrderSignature[]> {
    const result = await this.query(
      `SELECT * FROM change_order_signatures
       WHERE change_order_id = $1 AND is_required = true AND signed = false
       ORDER BY signature_order`,
      [coId]
    );

    return result.rows.map(this.mapSignature);
  }

  /**
   * Get change orders pending user's signature
   */
  async getChangeOrdersPendingSignature(
    userId: string,
    projectId?: string
  ): Promise<ChangeOrderWithDetails[]> {
    const conditions = [
      `s.signatory_user_id = $1`,
      `s.is_required = true`,
      `s.signed = false`,
      `co.status IN ('pending_review', 'pending_approval')`,
    ];
    const params: any[] = [userId];
    let paramIndex = 2;

    if (projectId) {
      conditions.push(`co.project_id = $${paramIndex++}`);
      params.push(projectId);
    }

    const result = await this.query(
      `SELECT DISTINCT co.id
       FROM change_orders co
       JOIN change_order_signatures s ON co.id = s.change_order_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY co.created_at ASC`,
      params
    );

    const changeOrders: ChangeOrderWithDetails[] = [];
    for (const row of result.rows) {
      const co = await changeRequestService.getById(row.id);
      if (co) changeOrders.push(co);
    }

    return changeOrders;
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

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

export const changeApprovalService = new ChangeApprovalServiceImpl();
