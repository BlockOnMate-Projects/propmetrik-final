/**
 * RFI CRUD Service
 * Phase 3.13 - Split from rfiService
 * 
 * Handles core RFI CRUD operations:
 * - Create (with optional immediate submission)
 * - Read with filtering and pagination
 * - Update with field change tracking
 * - Delete (soft delete via void)
 */

import { pool } from '../../../database';
import { BaseService } from '../../../../shared-services/base/BaseService';
import {
  Rfi,
  RfiWithDetails,
  CreateRfiInput,
  UpdateRfiInput,
  RfiFilters,
  PaginatedRfis,
  RfiStatus,
  mapRowToRfi,
  mapRowToRfiWithDetails,
  serializeAttachments,
  serializeDrawingRefs,
  serializeSpecRefs
} from './types';

class RfiCrudService extends BaseService {
  constructor() {
    super('RfiCrudService');
  }

  // --------------------------------------------------------------------------
  // CREATE
  // --------------------------------------------------------------------------

  /**
   * Create a new RFI
   */
  async create(input: CreateRfiInput): Promise<Rfi> {
    return this.executeInTransaction(async (client) => {
      const result = await client.query(`
        INSERT INTO rfis (
          organization_id,
          project_id,
          subject,
          question,
          category,
          priority,
          status,
          due_date,
          assigned_to,
          submitted_by,
          phase_id,
          drawing_references,
          spec_references,
          location_reference,
          cost_impact,
          cost_impact_currency,
          schedule_impact_days,
          attachments,
          related_rfis,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING *
      `, [
        input.organizationId,
        input.projectId,
        input.subject,
        input.question,
        input.category || 'design_clarification',
        input.priority || 'normal',
        input.submitImmediately ? 'open' : 'draft',
        input.dueDate,
        input.assignedTo,
        input.submitImmediately ? input.createdBy : null,
        input.phaseId,
        serializeDrawingRefs(input.drawingReferences || []),
        serializeSpecRefs(input.specReferences || []),
        input.locationReference,
        input.costImpact,
        input.costImpactCurrency || 'GHS',
        input.scheduleImpactDays,
        serializeAttachments(input.attachments || []),
        input.relatedRfis || [],
        input.createdBy
      ]);

      const rfi = result.rows[0];

      // Log creation in history
      await this.logHistory(
        client, 
        rfi.id, 
        'created', 
        null, 
        rfi.status, 
        null, 
        input.createdBy
      );

      // Add creator as watcher
      if (input.createdBy) {
        await this.addWatcher(client, rfi.id, input.createdBy);
      }

      // Add assignee as watcher
      if (input.assignedTo) {
        await this.addWatcher(client, rfi.id, input.assignedTo);
      }

      this.log('info', `RFI created: ${rfi.rfi_number}`);

      return mapRowToRfi(rfi);
    });
  }

  // --------------------------------------------------------------------------
  // READ
  // --------------------------------------------------------------------------

  /**
   * Get RFI by ID with details
   */
  async getById(id: string): Promise<RfiWithDetails | null> {
    const result = await pool.query(`
      SELECT 
        r.*,
        p.project_name,
        p.project_number,
        submitter.full_name AS submitted_by_name,
        assignee.full_name AS assigned_to_name,
        responder.full_name AS answered_by_name,
        ph.name AS phase_name,
        CASE 
          WHEN r.status IN ('open', 'pending_response') AND r.due_date < CURRENT_DATE THEN true
          ELSE false
        END AS is_overdue,
        GREATEST(CURRENT_DATE - r.due_date, 0) AS days_overdue,
        (SELECT COUNT(*) FROM rfi_comments WHERE rfi_id = r.id) AS comment_count
      FROM rfis r
      LEFT JOIN development_projects p ON r.project_id = p.id
      LEFT JOIN users submitter ON r.submitted_by = submitter.id
      LEFT JOIN users assignee ON r.assigned_to = assignee.id
      LEFT JOIN users responder ON r.answered_by = responder.id
      LEFT JOIN project_phases ph ON r.phase_id = ph.id
      WHERE r.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToRfiWithDetails(result.rows[0]);
  }

  /**
   * Get RFI by RFI number
   */
  async getByNumber(projectId: string, rfiNumber: string): Promise<RfiWithDetails | null> {
    const result = await pool.query(`
      SELECT 
        r.*,
        p.project_name,
        p.project_number
      FROM rfis r
      LEFT JOIN development_projects p ON r.project_id = p.id
      WHERE r.project_id = $1 AND r.rfi_number = $2
    `, [projectId, rfiNumber]);

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToRfiWithDetails(result.rows[0]);
  }

  /**
   * Get RFIs with filters and pagination
   */
  async getAll(filters: RfiFilters): Promise<PaginatedRfis> {
    let whereClause = 'WHERE 1=1';
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.organizationId) {
      whereClause += ` AND r.organization_id = $${paramIndex++}`;
      params.push(filters.organizationId);
    }

    if (filters.projectId) {
      whereClause += ` AND r.project_id = $${paramIndex++}`;
      params.push(filters.projectId);
    }

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        whereClause += ` AND r.status = ANY($${paramIndex++})`;
        params.push(filters.status);
      } else {
        whereClause += ` AND r.status = $${paramIndex++}`;
        params.push(filters.status);
      }
    }

    if (filters.priority) {
      if (Array.isArray(filters.priority)) {
        whereClause += ` AND r.priority = ANY($${paramIndex++})`;
        params.push(filters.priority);
      } else {
        whereClause += ` AND r.priority = $${paramIndex++}`;
        params.push(filters.priority);
      }
    }

    if (filters.category) {
      if (Array.isArray(filters.category)) {
        whereClause += ` AND r.category = ANY($${paramIndex++})`;
        params.push(filters.category);
      } else {
        whereClause += ` AND r.category = $${paramIndex++}`;
        params.push(filters.category);
      }
    }

    if (filters.assignedTo) {
      whereClause += ` AND r.assigned_to = $${paramIndex++}`;
      params.push(filters.assignedTo);
    }

    if (filters.submittedBy) {
      whereClause += ` AND r.submitted_by = $${paramIndex++}`;
      params.push(filters.submittedBy);
    }

    if (filters.phaseId) {
      whereClause += ` AND r.phase_id = $${paramIndex++}`;
      params.push(filters.phaseId);
    }

    if (filters.isOverdue) {
      whereClause += ` AND r.status IN ('open', 'pending_response') AND r.due_date < CURRENT_DATE`;
    }

    if (filters.dueDateFrom) {
      whereClause += ` AND r.due_date >= $${paramIndex++}`;
      params.push(filters.dueDateFrom);
    }

    if (filters.dueDateTo) {
      whereClause += ` AND r.due_date <= $${paramIndex++}`;
      params.push(filters.dueDateTo);
    }

    if (filters.createdFrom) {
      whereClause += ` AND r.created_at >= $${paramIndex++}`;
      params.push(filters.createdFrom);
    }

    if (filters.createdTo) {
      whereClause += ` AND r.created_at <= $${paramIndex++}`;
      params.push(filters.createdTo);
    }

    if (filters.search) {
      whereClause += ` AND (
        r.rfi_number ILIKE $${paramIndex} OR
        r.subject ILIKE $${paramIndex} OR
        r.question ILIKE $${paramIndex} OR
        r.location_reference ILIKE $${paramIndex}
      )`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    // Count total
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM rfis r ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get data with sorting and pagination
    const sortColumn = filters.sortBy || 'created_at';
    const sortOrder = filters.sortOrder || 'desc';
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const allowedSortColumns = ['created_at', 'updated_at', 'due_date', 'rfi_number', 'priority', 'status'];
    const safeSortColumn = allowedSortColumns.includes(sortColumn) ? sortColumn : 'created_at';

    const dataResult = await pool.query(`
      SELECT 
        r.*,
        p.project_name,
        p.project_number,
        submitter.full_name AS submitted_by_name,
        assignee.full_name AS assigned_to_name,
        responder.full_name AS answered_by_name,
        ph.name AS phase_name,
        CASE 
          WHEN r.status IN ('open', 'pending_response') AND r.due_date < CURRENT_DATE THEN true
          ELSE false
        END AS is_overdue,
        GREATEST(CURRENT_DATE - r.due_date, 0) AS days_overdue,
        (SELECT COUNT(*) FROM rfi_comments WHERE rfi_id = r.id) AS comment_count
      FROM rfis r
      LEFT JOIN development_projects p ON r.project_id = p.id
      LEFT JOIN users submitter ON r.submitted_by = submitter.id
      LEFT JOIN users assignee ON r.assigned_to = assignee.id
      LEFT JOIN users responder ON r.answered_by = responder.id
      LEFT JOIN project_phases ph ON r.phase_id = ph.id
      ${whereClause}
      ORDER BY r.${safeSortColumn} ${sortOrder === 'asc' ? 'ASC' : 'DESC'}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, limit, offset]);

    return {
      data: dataResult.rows.map(row => mapRowToRfiWithDetails(row)),
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Get RFIs for a project
   */
  async getByProject(projectId: string): Promise<RfiWithDetails[]> {
    const result = await this.getAll({ projectId, limit: 1000 });
    return result.data;
  }

  /**
   * Check if RFI exists
   */
  async exists(id: string): Promise<boolean> {
    const result = await pool.query(
      'SELECT 1 FROM rfis WHERE id = $1',
      [id]
    );
    return result.rows.length > 0;
  }

  // --------------------------------------------------------------------------
  // UPDATE
  // --------------------------------------------------------------------------

  /**
   * Update an RFI
   */
  async update(id: string, input: UpdateRfiInput): Promise<Rfi> {
    return this.executeInTransaction(async (client) => {
      // Get current RFI for comparison
      const currentResult = await client.query('SELECT * FROM rfis WHERE id = $1', [id]);
      if (currentResult.rows.length === 0) {
        throw new Error('RFI not found');
      }
      const current = currentResult.rows[0];

      // Build update query dynamically
      const updates: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;
      const fieldChanges: Record<string, { old: unknown; new: unknown }> = {};

      const updateField = (field: string, dbField: string, value: unknown, jsonField = false) => {
        if (value !== undefined) {
          const currentValue = jsonField ? JSON.stringify(current[dbField]) : current[dbField];
          const newValue = jsonField ? JSON.stringify(value) : value;
          if (currentValue !== newValue) {
            fieldChanges[dbField] = { old: current[dbField], new: value };
            updates.push(`${dbField} = $${paramIndex++}`);
            values.push(jsonField ? JSON.stringify(value) : value);
          }
        }
      };

      updateField('subject', 'subject', input.subject);
      updateField('question', 'question', input.question);
      updateField('category', 'category', input.category);
      updateField('priority', 'priority', input.priority);
      updateField('dueDate', 'due_date', input.dueDate);
      updateField('assignedTo', 'assigned_to', input.assignedTo);
      updateField('phaseId', 'phase_id', input.phaseId);
      updateField('drawingReferences', 'drawing_references', input.drawingReferences, true);
      updateField('specReferences', 'spec_references', input.specReferences, true);
      updateField('locationReference', 'location_reference', input.locationReference);
      updateField('costImpact', 'cost_impact', input.costImpact);
      updateField('costImpactCurrency', 'cost_impact_currency', input.costImpactCurrency);
      updateField('scheduleImpactDays', 'schedule_impact_days', input.scheduleImpactDays);
      updateField('attachments', 'attachments', input.attachments, true);
      updateField('relatedRfis', 'related_rfis', input.relatedRfis);

      if (updates.length === 0) {
        return mapRowToRfi(current);
      }

      updates.push(`updated_by = $${paramIndex++}`);
      values.push(input.updatedBy);

      values.push(id);

      const result = await client.query(`
        UPDATE rfis
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `, values);

      // Log history
      if (Object.keys(fieldChanges).length > 0) {
        await this.logHistory(client, id, 'updated', null, null, fieldChanges, input.updatedBy);
      }

      // Add new assignee as watcher if changed
      if (input.assignedTo && input.assignedTo !== current.assigned_to) {
        await this.addWatcher(client, id, input.assignedTo);
      }

      this.log('info', `RFI updated: ${result.rows[0].rfi_number}`);

      return mapRowToRfi(result.rows[0]);
    });
  }

  // --------------------------------------------------------------------------
  // DELETE
  // --------------------------------------------------------------------------

  /**
   * Soft delete an RFI by voiding
   */
  async delete(id: string, userId: string): Promise<void> {
    await pool.query(`
      UPDATE rfis
      SET status = 'void',
          updated_by = $2
      WHERE id = $1
    `, [id, userId]);

    this.log('info', `RFI deleted (voided): ${id}`);
  }

  /**
   * Hard delete an RFI (admin only)
   */
  async hardDelete(id: string): Promise<boolean> {
    return this.executeInTransaction(async (client) => {
      // Delete related records
      await client.query('DELETE FROM rfi_comments WHERE rfi_id = $1', [id]);
      await client.query('DELETE FROM rfi_watchers WHERE rfi_id = $1', [id]);
      await client.query('DELETE FROM rfi_history WHERE rfi_id = $1', [id]);
      
      const result = await client.query('DELETE FROM rfis WHERE id = $1 RETURNING id', [id]);
      
      if (result.rows.length > 0) {
        this.log('info', `RFI hard deleted: ${id}`);
        return true;
      }
      
      return false;
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

  /**
   * Add watcher to RFI
   */
  private async addWatcher(client: { query: Function }, rfiId: string, userId: string): Promise<void> {
    await client.query(`
      INSERT INTO rfi_watchers (rfi_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [rfiId, userId]);
  }
}

export const rfiCrudService = new RfiCrudService();
