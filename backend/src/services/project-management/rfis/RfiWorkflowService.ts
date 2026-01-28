/**
 * RFI Workflow Service
 * Phase 3.13 - Split from rfiService
 * 
 * Handles RFI lifecycle transitions:
 * - Submit (draft → open)
 * - Assign (open → pending_response)
 * - Respond (pending_response → answered)
 * - Close (answered → closed)
 * - Void (any → void)
 * - Reopen (closed → open)
 */

import { pool } from '../../../database';
import { BaseService } from '../BaseService';
import { eventBus } from '../events';
import {
  Rfi,
  RfiStatus,
  RespondToRfiInput,
  RFI_STATUS_TRANSITIONS,
  mapRowToRfi,
  serializeAttachments
} from './types';

class RfiWorkflowService extends BaseService {
  constructor() {
    super('RfiWorkflowService');
  }

  // --------------------------------------------------------------------------
  // STATUS VALIDATION
  // --------------------------------------------------------------------------

  /**
   * Check if a status transition is valid
   */
  isValidTransition(currentStatus: RfiStatus, newStatus: RfiStatus): boolean {
    const allowed = RFI_STATUS_TRANSITIONS[currentStatus] || [];
    return allowed.includes(newStatus);
  }

  /**
   * Get allowed transitions from current status
   */
  getAllowedTransitions(currentStatus: RfiStatus): RfiStatus[] {
    return RFI_STATUS_TRANSITIONS[currentStatus] || [];
  }

  // --------------------------------------------------------------------------
  // SUBMIT
  // --------------------------------------------------------------------------

  /**
   * Submit a draft RFI (change status from draft to open)
   */
  async submit(id: string, userId: string): Promise<Rfi> {
    return this.executeInTransaction(async (client) => {
      const current = await client.query('SELECT * FROM rfis WHERE id = $1', [id]);
      if (current.rows.length === 0) {
        throw new Error('RFI not found');
      }

      if (current.rows[0].status !== 'draft') {
        throw new Error('Only draft RFIs can be submitted');
      }

      const result = await client.query(`
        UPDATE rfis
        SET status = 'open',
            submitted_by = $2,
            updated_by = $2
        WHERE id = $1
        RETURNING *
      `, [id, userId]);

      await this.logHistory(client, id, 'submitted', 'draft', 'open', null, userId);

      const rfi = mapRowToRfi(result.rows[0]);

      // Emit event
      eventBus.emit({
        type: 'rfi.submitted',
        payload: {
          rfiId: id,
          rfiNumber: rfi.rfiNumber,
          projectId: rfi.projectId,
          submittedBy: userId
        },
        timestamp: new Date()
      });

      this.log('info', `RFI submitted: ${rfi.rfiNumber}`);

      return rfi;
    });
  }

  // --------------------------------------------------------------------------
  // ASSIGN
  // --------------------------------------------------------------------------

  /**
   * Assign RFI to a user
   */
  async assign(id: string, assigneeId: string, assignedBy: string): Promise<Rfi> {
    return this.executeInTransaction(async (client) => {
      const current = await client.query('SELECT * FROM rfis WHERE id = $1', [id]);
      if (current.rows.length === 0) {
        throw new Error('RFI not found');
      }

      const currentRfi = current.rows[0];
      if (!['open', 'pending_response'].includes(currentRfi.status)) {
        throw new Error('RFI cannot be assigned in current status');
      }

      const result = await client.query(`
        UPDATE rfis
        SET assigned_to = $2,
            status = CASE WHEN status = 'open' THEN 'pending_response' ELSE status END,
            updated_by = $3
        WHERE id = $1
        RETURNING *
      `, [id, assigneeId, assignedBy]);

      const newStatus = result.rows[0].status;
      const fieldChanges = { assigned_to: { old: currentRfi.assigned_to, new: assigneeId } };

      await this.logHistory(client, id, 'assigned', currentRfi.status, newStatus, fieldChanges, assignedBy);

      // Add assignee as watcher
      await client.query(`
        INSERT INTO rfi_watchers (rfi_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `, [id, assigneeId]);

      const rfi = mapRowToRfi(result.rows[0]);

      // Emit event
      eventBus.emit({
        type: 'rfi.assigned',
        payload: {
          rfiId: id,
          rfiNumber: rfi.rfiNumber,
          projectId: rfi.projectId,
          assignedTo: assigneeId,
          assignedBy
        },
        timestamp: new Date()
      });

      this.log('info', `RFI assigned: ${rfi.rfiNumber} to ${assigneeId}`);

      return rfi;
    });
  }

  /**
   * Reassign RFI to a different user
   */
  async reassign(id: string, newAssigneeId: string, reassignedBy: string, reason?: string): Promise<Rfi> {
    return this.executeInTransaction(async (client) => {
      const current = await client.query('SELECT * FROM rfis WHERE id = $1', [id]);
      if (current.rows.length === 0) {
        throw new Error('RFI not found');
      }

      const currentRfi = current.rows[0];

      const result = await client.query(`
        UPDATE rfis
        SET assigned_to = $2,
            updated_by = $3
        WHERE id = $1
        RETURNING *
      `, [id, newAssigneeId, reassignedBy]);

      const fieldChanges = { assigned_to: { old: currentRfi.assigned_to, new: newAssigneeId } };

      await this.logHistory(client, id, 'reassigned', null, null, fieldChanges, reassignedBy, reason);

      // Add new assignee as watcher
      await client.query(`
        INSERT INTO rfi_watchers (rfi_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `, [id, newAssigneeId]);

      this.log('info', `RFI reassigned: ${result.rows[0].rfi_number} to ${newAssigneeId}`);

      return mapRowToRfi(result.rows[0]);
    });
  }

  // --------------------------------------------------------------------------
  // RESPOND
  // --------------------------------------------------------------------------

  /**
   * Respond to an RFI
   */
  async respond(id: string, input: RespondToRfiInput): Promise<Rfi> {
    return this.executeInTransaction(async (client) => {
      const current = await client.query('SELECT * FROM rfis WHERE id = $1', [id]);
      if (current.rows.length === 0) {
        throw new Error('RFI not found');
      }

      const currentRfi = current.rows[0];
      if (!['open', 'pending_response'].includes(currentRfi.status)) {
        throw new Error('RFI is not open for response');
      }

      const result = await client.query(`
        UPDATE rfis
        SET response = $2,
            response_attachments = $3,
            status = 'answered',
            answered_by = $4,
            responded_at = NOW(),
            cost_impact = COALESCE($5, cost_impact),
            schedule_impact_days = COALESCE($6, schedule_impact_days),
            updated_by = $4
        WHERE id = $1
        RETURNING *
      `, [
        id,
        input.response,
        serializeAttachments(input.responseAttachments || []),
        input.answeredBy,
        input.costImpact,
        input.scheduleImpactDays
      ]);

      await this.logHistory(client, id, 'responded', currentRfi.status, 'answered', null, input.answeredBy);

      const rfi = mapRowToRfi(result.rows[0]);

      // Emit event
      eventBus.emit({
        type: 'rfi.responded',
        payload: {
          rfiId: id,
          rfiNumber: rfi.rfiNumber,
          projectId: rfi.projectId,
          answeredBy: input.answeredBy,
          costImpact: input.costImpact,
          scheduleImpactDays: input.scheduleImpactDays
        },
        timestamp: new Date()
      });

      this.log('info', `RFI responded: ${rfi.rfiNumber}`);

      return rfi;
    });
  }

  // --------------------------------------------------------------------------
  // CLOSE
  // --------------------------------------------------------------------------

  /**
   * Close an RFI
   */
  async close(id: string, userId: string, comment?: string): Promise<Rfi> {
    return this.executeInTransaction(async (client) => {
      const current = await client.query('SELECT * FROM rfis WHERE id = $1', [id]);
      if (current.rows.length === 0) {
        throw new Error('RFI not found');
      }

      const currentRfi = current.rows[0];
      if (!['answered', 'open', 'pending_response'].includes(currentRfi.status)) {
        throw new Error('RFI cannot be closed from current status');
      }

      const result = await client.query(`
        UPDATE rfis
        SET status = 'closed',
            closed_at = NOW(),
            updated_by = $2
        WHERE id = $1
        RETURNING *
      `, [id, userId]);

      await this.logHistory(client, id, 'closed', currentRfi.status, 'closed', null, userId, comment);

      const rfi = mapRowToRfi(result.rows[0]);

      // Emit event
      eventBus.emit({
        type: 'rfi.closed',
        payload: {
          rfiId: id,
          rfiNumber: rfi.rfiNumber,
          projectId: rfi.projectId,
          closedBy: userId
        },
        timestamp: new Date()
      });

      this.log('info', `RFI closed: ${rfi.rfiNumber}`);

      return rfi;
    });
  }

  // --------------------------------------------------------------------------
  // VOID
  // --------------------------------------------------------------------------

  /**
   * Void an RFI
   */
  async void(id: string, userId: string, reason: string): Promise<Rfi> {
    return this.executeInTransaction(async (client) => {
      const current = await client.query('SELECT * FROM rfis WHERE id = $1', [id]);
      if (current.rows.length === 0) {
        throw new Error('RFI not found');
      }

      const currentRfi = current.rows[0];

      const result = await client.query(`
        UPDATE rfis
        SET status = 'void',
            updated_by = $2
        WHERE id = $1
        RETURNING *
      `, [id, userId]);

      await this.logHistory(client, id, 'voided', currentRfi.status, 'void', null, userId, reason);

      const rfi = mapRowToRfi(result.rows[0]);

      this.log('info', `RFI voided: ${rfi.rfiNumber}`);

      return rfi;
    });
  }

  // --------------------------------------------------------------------------
  // REOPEN
  // --------------------------------------------------------------------------

  /**
   * Reopen a closed RFI
   */
  async reopen(id: string, userId: string, reason: string): Promise<Rfi> {
    return this.executeInTransaction(async (client) => {
      const current = await client.query('SELECT * FROM rfis WHERE id = $1', [id]);
      if (current.rows.length === 0) {
        throw new Error('RFI not found');
      }

      const currentRfi = current.rows[0];
      if (currentRfi.status !== 'closed') {
        throw new Error('Only closed RFIs can be reopened');
      }

      const result = await client.query(`
        UPDATE rfis
        SET status = 'open',
            closed_at = NULL,
            updated_by = $2
        WHERE id = $1
        RETURNING *
      `, [id, userId]);

      await this.logHistory(client, id, 'reopened', 'closed', 'open', null, userId, reason);

      const rfi = mapRowToRfi(result.rows[0]);

      // Emit event
      eventBus.emit({
        type: 'rfi.reopened',
        payload: {
          rfiId: id,
          rfiNumber: rfi.rfiNumber,
          projectId: rfi.projectId,
          reopenedBy: userId,
          reason
        },
        timestamp: new Date()
      });

      this.log('info', `RFI reopened: ${rfi.rfiNumber}`);

      return rfi;
    });
  }

  // --------------------------------------------------------------------------
  // PRIORITY
  // --------------------------------------------------------------------------

  /**
   * Escalate RFI priority
   */
  async escalate(id: string, userId: string, reason?: string): Promise<Rfi> {
    return this.executeInTransaction(async (client) => {
      const current = await client.query('SELECT * FROM rfis WHERE id = $1', [id]);
      if (current.rows.length === 0) {
        throw new Error('RFI not found');
      }

      const currentRfi = current.rows[0];
      const priorityLevels: Record<string, string> = {
        low: 'normal',
        normal: 'high',
        high: 'critical',
        critical: 'critical'
      };

      const newPriority = priorityLevels[currentRfi.priority] || 'high';

      const result = await client.query(`
        UPDATE rfis
        SET priority = $2,
            updated_by = $3
        WHERE id = $1
        RETURNING *
      `, [id, newPriority, userId]);

      const fieldChanges = { priority: { old: currentRfi.priority, new: newPriority } };
      await this.logHistory(client, id, 'escalated', null, null, fieldChanges, userId, reason);

      this.log('info', `RFI escalated: ${result.rows[0].rfi_number} to ${newPriority}`);

      return mapRowToRfi(result.rows[0]);
    });
  }

  // --------------------------------------------------------------------------
  // HELPER METHODS
  // --------------------------------------------------------------------------

  /**
   * Log history entry
   */
  private async logHistory(
    client: { query: Function },
    rfiId: string,
    action: string,
    previousStatus: RfiStatus | null,
    newStatus: RfiStatus | null,
    fieldChanges: Record<string, unknown> | null,
    performedBy?: string,
    comment?: string
  ): Promise<void> {
    await client.query(`
      INSERT INTO rfi_history (rfi_id, action, previous_status, new_status, field_changes, comment, performed_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [rfiId, action, previousStatus, newStatus, fieldChanges ? JSON.stringify(fieldChanges) : null, comment, performedBy]);
  }
}

export const rfiWorkflowService = new RfiWorkflowService();
