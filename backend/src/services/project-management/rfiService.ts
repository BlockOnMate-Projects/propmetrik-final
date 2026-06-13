/**
 * RFI (Request for Information) Service
 * Phase 3A Week 1 - Enterprise-grade RFI Management
 * 
 * @deprecated This file is deprecated. Use the new modular rfis module:
 * 
 * import { 
 *   rfisFacade,
 *   rfiCrudService,
 *   rfiWorkflowService,
 *   rfiCollaborationService,
 *   rfiStatsService 
 * } from './rfis';
 * 
 * The monolithic service has been split into:
 * - RfiCrudService: Create, read, update, delete operations
 * - RfiWorkflowService: Status transitions (submit, assign, respond, close, void)
 * - RfiCollaborationService: Comments, history, watchers
 * - RfiStatsService: Statistics and analytics
 * 
 * This file remains for backward compatibility and will be removed in a future version.
 * 
 * Handles the complete RFI lifecycle from creation through response and closure.
 * Inspired by Procore's RFI module with Ghana-specific enhancements.
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { notify, resolveStaffUser } from '../../../shared-services/notifications/in-mail';

// =====================================================
// TYPES
// =====================================================

export type RfiStatus = 'draft' | 'open' | 'pending_response' | 'answered' | 'closed' | 'void';
export type RfiPriority = 'low' | 'normal' | 'high' | 'critical';
export type RfiCategory = 
  | 'design_clarification'
  | 'specification_query'
  | 'drawing_discrepancy'
  | 'site_condition'
  | 'material_substitution'
  | 'regulatory_compliance'
  | 'contractor_coordination'
  | 'schedule_impact'
  | 'cost_inquiry'
  | 'safety_concern'
  | 'other';

export interface DrawingReference {
  number: string;
  title: string;
  sheet?: string;
  revision?: string;
}

export interface SpecReference {
  section: string;
  title: string;
  paragraph?: string;
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

export interface Rfi {
  id: string;
  organization_id: string;
  project_id: string;
  rfi_number: string;
  revision_number: number;
  subject: string;
  question: string;
  category: RfiCategory;
  response?: string;
  response_attachments: Attachment[];
  status: RfiStatus;
  priority: RfiPriority;
  due_date?: Date;
  responded_at?: Date;
  closed_at?: Date;
  submitted_by?: string;
  assigned_to?: string;
  answered_by?: string;
  phase_id?: string;
  drawing_references: DrawingReference[];
  spec_references: SpecReference[];
  location_reference?: string;
  cost_impact?: number;
  cost_impact_currency: string;
  schedule_impact_days?: number;
  attachments: Attachment[];
  related_rfis: string[];
  created_at: Date;
  updated_at: Date;
  created_by?: string;
  updated_by?: string;
}

export interface RfiWithDetails extends Rfi {
  project_name?: string;
  project_number?: string;
  submitted_by_name?: string;
  assigned_to_name?: string;
  answered_by_name?: string;
  phase_name?: string;
  is_overdue?: boolean;
  days_overdue?: number;
  comment_count?: number;
  /** User who currently owes the next action (derived from status + roles). */
  ball_in_court?: string | null;
  ball_in_court_name?: string | null;
}

export interface RfiComment {
  id: string;
  rfi_id: string;
  comment: string;
  attachments: Attachment[];
  is_internal: boolean;
  created_by?: string;
  created_by_name?: string;
  created_at: Date;
  updated_at: Date;
}

export interface RfiHistoryEntry {
  id: string;
  rfi_id: string;
  action: string;
  previous_status?: RfiStatus;
  new_status?: RfiStatus;
  field_changes?: Record<string, { old: any; new: any }>;
  comment?: string;
  performed_by?: string;
  performed_by_name?: string;
  performed_at: Date;
}

export interface CreateRfiInput {
  organization_id: string;
  project_id: string;
  subject: string;
  question: string;
  category?: RfiCategory;
  priority?: RfiPriority;
  due_date?: Date;
  assigned_to?: string;
  phase_id?: string;
  drawing_references?: DrawingReference[];
  spec_references?: SpecReference[];
  location_reference?: string;
  cost_impact?: number;
  cost_impact_currency?: string;
  schedule_impact_days?: number;
  attachments?: Attachment[];
  related_rfis?: string[];
  submit_immediately?: boolean;
  created_by?: string;
}

export interface UpdateRfiInput {
  subject?: string;
  question?: string;
  category?: RfiCategory;
  priority?: RfiPriority;
  due_date?: Date;
  assigned_to?: string;
  phase_id?: string;
  drawing_references?: DrawingReference[];
  spec_references?: SpecReference[];
  location_reference?: string;
  cost_impact?: number;
  cost_impact_currency?: string;
  schedule_impact_days?: number;
  attachments?: Attachment[];
  related_rfis?: string[];
  updated_by?: string;
}

export interface RespondToRfiInput {
  response: string;
  response_attachments?: Attachment[];
  cost_impact?: number;
  schedule_impact_days?: number;
  answered_by: string;
}

export interface RfiFilters {
  organization_id?: string;
  project_id?: string;
  status?: RfiStatus | RfiStatus[];
  priority?: RfiPriority | RfiPriority[];
  category?: RfiCategory | RfiCategory[];
  assigned_to?: string;
  submitted_by?: string;
  /** Filter to RFIs currently awaiting action by this user (ball-in-court). */
  ball_in_court?: string;
  phase_id?: string;
  is_overdue?: boolean;
  due_date_from?: Date;
  due_date_to?: Date;
  created_from?: Date;
  created_to?: Date;
  search?: string;
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface RfiStats {
  total: number;
  by_status: Record<RfiStatus, number>;
  by_priority: Record<RfiPriority, number>;
  by_category: Record<RfiCategory, number>;
  overdue: number;
  avg_response_days: number;
  pending_response: number;
  closed_this_week: number;
}

// =====================================================
// SERVICE CLASS
// =====================================================

class RfiService {
  /**
   * Create a new RFI
   */
  async create(input: CreateRfiInput): Promise<Rfi> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

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
        input.organization_id,
        input.project_id,
        input.subject,
        input.question,
        input.category || 'design_clarification',
        input.priority || 'normal',
        input.submit_immediately ? 'open' : 'draft',
        input.due_date,
        input.assigned_to,
        input.submit_immediately ? input.created_by : null,
        input.phase_id,
        JSON.stringify(input.drawing_references || []),
        JSON.stringify(input.spec_references || []),
        input.location_reference,
        input.cost_impact,
        input.cost_impact_currency || 'GHS',
        input.schedule_impact_days,
        JSON.stringify(input.attachments || []),
        input.related_rfis || [],
        input.created_by
      ]);

      const rfi = result.rows[0];

      // Log creation in history
      await this.logHistory(client, rfi.id, 'created', null, rfi.status, null, input.created_by);

      // Add creator as watcher
      if (input.created_by) {
        await client.query(`
          INSERT INTO rfi_watchers (rfi_id, user_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `, [rfi.id, input.created_by]);
      }

      // Add assignee as watcher
      if (input.assigned_to) {
        await client.query(`
          INSERT INTO rfi_watchers (rfi_id, user_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `, [rfi.id, input.assigned_to]);
      }

      await client.query('COMMIT');

      logger.info(`RFI created: ${rfi.rfi_number}`, { rfiId: rfi.id, projectId: input.project_id });

      // Notify the assignee when the RFI is submitted (not a draft) to someone other than the creator
      if (input.submit_immediately && input.assigned_to && input.assigned_to !== input.created_by) {
        try {
          const recipient = await resolveStaffUser(input.assigned_to);
          if (recipient) {
            await notify({
              recipients: recipient,
              category: 'project',
              type: 'rfi.assigned',
              title: 'RFI assigned to you',
              body: `RFI ${rfi.rfi_number} "${rfi.subject}" has been assigned to you for a response.`,
              priority: input.priority === 'critical' ? 'high' : 'normal',
              organizationId: input.organization_id,
              sourceType: 'rfi',
              sourceId: rfi.id,
              sourceUrl: `/dashboard/projects/${input.project_id}/rfis`,
              channels: { inApp: true, email: true },
            });
          }
        } catch (notifyError: any) {
          logger.warn('Failed to notify RFI assignee', { rfiId: rfi.id, error: notifyError.message });
        }
      }

      return this.mapRfi(rfi);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating RFI:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get RFI by ID with details
   */
  async getById(id: string): Promise<RfiWithDetails | null> {
    const result = await pool.query(`
      SELECT 
        r.*,
        p.name AS project_name,
        p.project_number,
        COALESCE(submitter.display_name, submitter.first_name || ' ' || submitter.last_name) AS submitted_by_name,
        COALESCE(assignee.display_name, assignee.first_name || ' ' || assignee.last_name) AS assigned_to_name,
        COALESCE(responder.display_name, responder.first_name || ' ' || responder.last_name) AS answered_by_name,
        ph.name AS phase_name,
        CASE 
          WHEN r.status IN ('open', 'pending_response') AND r.due_date < CURRENT_DATE THEN true
          ELSE false
        END AS is_overdue,
        GREATEST(CURRENT_DATE - r.due_date, 0) AS days_overdue,
        CASE
          WHEN r.status IN ('open', 'pending_response') THEN r.assigned_to
          WHEN r.status = 'answered' THEN r.submitted_by
          WHEN r.status = 'draft' THEN COALESCE(r.submitted_by, r.created_by)
          ELSE NULL
        END AS ball_in_court,
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

    return this.mapRfiWithDetails(result.rows[0]);
  }

  /**
   * Get RFIs with filters and pagination
   */
  async getAll(filters: RfiFilters): Promise<{ data: RfiWithDetails[]; total: number }> {
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.organization_id) {
      whereClause += ` AND r.organization_id = $${paramIndex++}`;
      params.push(filters.organization_id);
    }

    if (filters.project_id) {
      whereClause += ` AND r.project_id = $${paramIndex++}`;
      params.push(filters.project_id);
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

    if (filters.assigned_to) {
      whereClause += ` AND r.assigned_to = $${paramIndex++}`;
      params.push(filters.assigned_to);
    }

    if (filters.submitted_by) {
      whereClause += ` AND r.submitted_by = $${paramIndex++}`;
      params.push(filters.submitted_by);
    }

    if (filters.phase_id) {
      whereClause += ` AND r.phase_id = $${paramIndex++}`;
      params.push(filters.phase_id);
    }

    if (filters.is_overdue) {
      whereClause += ` AND r.status IN ('open', 'pending_response') AND r.due_date < CURRENT_DATE`;
    }

    if (filters.due_date_from) {
      whereClause += ` AND r.due_date >= $${paramIndex++}`;
      params.push(filters.due_date_from);
    }

    if (filters.due_date_to) {
      whereClause += ` AND r.due_date <= $${paramIndex++}`;
      params.push(filters.due_date_to);
    }

    if (filters.created_from) {
      whereClause += ` AND r.created_at >= $${paramIndex++}`;
      params.push(filters.created_from);
    }

    if (filters.created_to) {
      whereClause += ` AND r.created_at <= $${paramIndex++}`;
      params.push(filters.created_to);
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

    // Ball-in-court filter: RFIs currently awaiting action by this user
    // (responder while open/pending, or submitter once answered/draft).
    if (filters.ball_in_court) {
      whereClause += ` AND (CASE
          WHEN r.status IN ('open', 'pending_response') THEN r.assigned_to
          WHEN r.status = 'answered' THEN r.submitted_by
          WHEN r.status = 'draft' THEN COALESCE(r.submitted_by, r.created_by)
          ELSE NULL
        END) = $${paramIndex++}`;
      params.push(filters.ball_in_court);
    }

    // Count total
    const countResult = await pool.query(`
      SELECT COUNT(*) FROM rfis r ${whereClause}
    `, params);
    const total = parseInt(countResult.rows[0].count, 10);

    // Get data with sorting and pagination
    const sortColumn = filters.sort_by || 'created_at';
    const sortOrder = filters.sort_order || 'desc';
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const allowedSortColumns = ['created_at', 'updated_at', 'due_date', 'rfi_number', 'priority', 'status'];
    const safeSortColumn = allowedSortColumns.includes(sortColumn) ? sortColumn : 'created_at';

    const dataResult = await pool.query(`
      SELECT 
        r.*,
        p.name AS project_name,
        p.project_number,
        COALESCE(submitter.display_name, submitter.first_name || ' ' || submitter.last_name) AS submitted_by_name,
        COALESCE(assignee.display_name, assignee.first_name || ' ' || assignee.last_name) AS assigned_to_name,
        COALESCE(responder.display_name, responder.first_name || ' ' || responder.last_name) AS answered_by_name,
        ph.name AS phase_name,
        CASE 
          WHEN r.status IN ('open', 'pending_response') AND r.due_date < CURRENT_DATE THEN true
          ELSE false
        END AS is_overdue,
        GREATEST(CURRENT_DATE - r.due_date, 0) AS days_overdue,
        CASE
          WHEN r.status IN ('open', 'pending_response') THEN r.assigned_to
          WHEN r.status = 'answered' THEN r.submitted_by
          WHEN r.status = 'draft' THEN COALESCE(r.submitted_by, r.created_by)
          ELSE NULL
        END AS ball_in_court,
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
      data: dataResult.rows.map(row => this.mapRfiWithDetails(row)),
      total
    };
  }

  /**
   * Update an RFI
   */
  async update(id: string, input: UpdateRfiInput): Promise<Rfi> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get current RFI for comparison
      const currentResult = await client.query('SELECT * FROM rfis WHERE id = $1', [id]);
      if (currentResult.rows.length === 0) {
        throw new Error('RFI not found');
      }
      const current = currentResult.rows[0];

      // Build update query dynamically
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

      updateField('subject', input.subject);
      updateField('question', input.question);
      updateField('category', input.category);
      updateField('priority', input.priority);
      updateField('due_date', input.due_date);
      updateField('assigned_to', input.assigned_to);
      updateField('phase_id', input.phase_id);
      updateField('drawing_references', input.drawing_references, true);
      updateField('spec_references', input.spec_references, true);
      updateField('location_reference', input.location_reference);
      updateField('cost_impact', input.cost_impact);
      updateField('cost_impact_currency', input.cost_impact_currency);
      updateField('schedule_impact_days', input.schedule_impact_days);
      updateField('attachments', input.attachments, true);
      updateField('related_rfis', input.related_rfis);

      if (updates.length === 0) {
        await client.query('COMMIT');
        return this.mapRfi(current);
      }

      updates.push(`updated_by = $${paramIndex++}`);
      values.push(input.updated_by);

      values.push(id);

      const result = await client.query(`
        UPDATE rfis
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `, values);

      // Log history
      await this.logHistory(client, id, 'updated', null, null, fieldChanges, input.updated_by);

      // Add new assignee as watcher if changed
      if (input.assigned_to && input.assigned_to !== current.assigned_to) {
        await client.query(`
          INSERT INTO rfi_watchers (rfi_id, user_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `, [id, input.assigned_to]);
      }

      await client.query('COMMIT');

      logger.info(`RFI updated: ${result.rows[0].rfi_number}`, { rfiId: id });

      return this.mapRfi(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error updating RFI:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Submit a draft RFI (change status from draft to open)
   */
  async submit(id: string, userId: string): Promise<Rfi> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

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

      await client.query('COMMIT');

      logger.info(`RFI submitted: ${result.rows[0].rfi_number}`, { rfiId: id });

      return this.mapRfi(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Assign RFI to a user
   */
  async assign(id: string, assigneeId: string, assignedBy: string): Promise<Rfi> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const current = await client.query('SELECT * FROM rfis WHERE id = $1', [id]);
      if (current.rows.length === 0) {
        throw new Error('RFI not found');
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
      const fieldChanges = { assigned_to: { old: current.rows[0].assigned_to, new: assigneeId } };

      await this.logHistory(client, id, 'assigned', current.rows[0].status, newStatus, fieldChanges, assignedBy);

      // Add assignee as watcher
      await client.query(`
        INSERT INTO rfi_watchers (rfi_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `, [id, assigneeId]);

      await client.query('COMMIT');

      logger.info(`RFI assigned: ${result.rows[0].rfi_number} to ${assigneeId}`, { rfiId: id });

      // Ball-in-court → the new assignee now owes a response. Notify them.
      if (assigneeId && assigneeId !== assignedBy) {
        try {
          const recipient = await resolveStaffUser(assigneeId);
          if (recipient) {
            await notify({
              recipients: recipient,
              category: 'project',
              type: 'rfi.assigned',
              title: 'RFI awaiting your response',
              body: `RFI ${result.rows[0].rfi_number} "${result.rows[0].subject}" has been assigned to you — the ball is in your court.`,
              priority: result.rows[0].priority === 'critical' ? 'high' : 'normal',
              organizationId: result.rows[0].organization_id,
              sourceType: 'rfi',
              sourceId: id,
              sourceUrl: `/dashboard/projects/${result.rows[0].project_id}/rfis`,
              channels: { inApp: true, email: true },
            });
          }
        } catch (notifyError: any) {
          logger.warn('Failed to notify RFI assignee on assign', { rfiId: id, error: notifyError.message });
        }
      }

      return this.mapRfi(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Respond to an RFI
   */
  async respond(id: string, input: RespondToRfiInput): Promise<Rfi> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const current = await client.query('SELECT * FROM rfis WHERE id = $1', [id]);
      if (current.rows.length === 0) {
        throw new Error('RFI not found');
      }

      if (!['open', 'pending_response'].includes(current.rows[0].status)) {
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
        JSON.stringify(input.response_attachments || []),
        input.answered_by,
        input.cost_impact,
        input.schedule_impact_days
      ]);

      await this.logHistory(client, id, 'responded', current.rows[0].status, 'answered', null, input.answered_by);

      await client.query('COMMIT');

      logger.info(`RFI responded: ${result.rows[0].rfi_number}`, { rfiId: id });

      // Ball-in-court → answering returns the ball to the submitter to review/close.
      const submitterId = result.rows[0].submitted_by;
      if (submitterId && submitterId !== input.answered_by) {
        try {
          const recipient = await resolveStaffUser(submitterId);
          if (recipient) {
            await notify({
              recipients: recipient,
              category: 'project',
              type: 'rfi.answered',
              title: 'Your RFI was answered',
              body: `RFI ${result.rows[0].rfi_number} "${result.rows[0].subject}" has been answered — please review and close it.`,
              priority: result.rows[0].priority === 'critical' ? 'high' : 'normal',
              organizationId: result.rows[0].organization_id,
              sourceType: 'rfi',
              sourceId: id,
              sourceUrl: `/dashboard/projects/${result.rows[0].project_id}/rfis`,
              channels: { inApp: true, email: true },
            });
          }
        } catch (notifyError: any) {
          logger.warn('Failed to notify RFI submitter on response', { rfiId: id, error: notifyError.message });
        }
      }

      return this.mapRfi(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Close an RFI
   */
  async close(id: string, userId: string, comment?: string): Promise<Rfi> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const current = await client.query('SELECT * FROM rfis WHERE id = $1', [id]);
      if (current.rows.length === 0) {
        throw new Error('RFI not found');
      }

      const result = await client.query(`
        UPDATE rfis
        SET status = 'closed',
            closed_at = NOW(),
            updated_by = $2
        WHERE id = $1
        RETURNING *
      `, [id, userId]);

      await this.logHistory(client, id, 'closed', current.rows[0].status, 'closed', null, userId, comment);

      await client.query('COMMIT');

      logger.info(`RFI closed: ${result.rows[0].rfi_number}`, { rfiId: id });

      return this.mapRfi(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Void an RFI
   */
  async void(id: string, userId: string, reason: string): Promise<Rfi> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const current = await client.query('SELECT * FROM rfis WHERE id = $1', [id]);
      if (current.rows.length === 0) {
        throw new Error('RFI not found');
      }

      const result = await client.query(`
        UPDATE rfis
        SET status = 'void',
            updated_by = $2
        WHERE id = $1
        RETURNING *
      `, [id, userId]);

      await this.logHistory(client, id, 'voided', current.rows[0].status, 'void', null, userId, reason);

      await client.query('COMMIT');

      logger.info(`RFI voided: ${result.rows[0].rfi_number}`, { rfiId: id });

      return this.mapRfi(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Add a comment to an RFI
   */
  async addComment(rfiId: string, comment: string, isInternal: boolean, userId: string, attachments?: Attachment[]): Promise<RfiComment> {
    const result = await pool.query(`
      INSERT INTO rfi_comments (rfi_id, comment, is_internal, attachments, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [rfiId, comment, isInternal, JSON.stringify(attachments || []), userId]);

    return this.mapComment(result.rows[0]);
  }

  /**
   * Get comments for an RFI
   */
  async getComments(rfiId: string, includeInternal: boolean = false): Promise<RfiComment[]> {
    let query = `
      SELECT c.*, u.full_name AS created_by_name
      FROM rfi_comments c
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.rfi_id = $1
    `;

    if (!includeInternal) {
      query += ` AND c.is_internal = false`;
    }

    query += ` ORDER BY c.created_at ASC`;

    const result = await pool.query(query, [rfiId]);
    return result.rows.map(row => this.mapComment(row));
  }

  /**
   * Get RFI history
   */
  async getHistory(rfiId: string): Promise<RfiHistoryEntry[]> {
    const result = await pool.query(`
      SELECT h.*, u.full_name AS performed_by_name
      FROM rfi_history h
      LEFT JOIN users u ON h.performed_by = u.id
      WHERE h.rfi_id = $1
      ORDER BY h.performed_at DESC
    `, [rfiId]);

    return result.rows.map(row => ({
      id: row.id,
      rfi_id: row.rfi_id,
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
   * Get RFI statistics for a project
   */
  async getStats(projectId: string): Promise<RfiStats> {
    const result = await pool.query(`
      SELECT 
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'draft') AS draft,
        COUNT(*) FILTER (WHERE status = 'open') AS open,
        COUNT(*) FILTER (WHERE status = 'pending_response') AS pending_response,
        COUNT(*) FILTER (WHERE status = 'answered') AS answered,
        COUNT(*) FILTER (WHERE status = 'closed') AS closed,
        COUNT(*) FILTER (WHERE status = 'void') AS void,
        COUNT(*) FILTER (WHERE priority = 'low') AS priority_low,
        COUNT(*) FILTER (WHERE priority = 'normal') AS priority_normal,
        COUNT(*) FILTER (WHERE priority = 'high') AS priority_high,
        COUNT(*) FILTER (WHERE priority = 'critical') AS priority_critical,
        COUNT(*) FILTER (WHERE status IN ('open', 'pending_response') AND due_date < CURRENT_DATE) AS overdue,
        AVG(EXTRACT(DAY FROM (responded_at - created_at))) FILTER (WHERE responded_at IS NOT NULL) AS avg_response_days,
        COUNT(*) FILTER (WHERE closed_at >= CURRENT_DATE - INTERVAL '7 days') AS closed_this_week
      FROM rfis
      WHERE project_id = $1
    `, [projectId]);

    const row = result.rows[0];

    // Get category counts
    const categoryResult = await pool.query(`
      SELECT category, COUNT(*) as count
      FROM rfis
      WHERE project_id = $1
      GROUP BY category
    `, [projectId]);

    const byCategory: Record<RfiCategory, number> = {} as any;
    categoryResult.rows.forEach(r => {
      byCategory[r.category as RfiCategory] = parseInt(r.count, 10);
    });

    return {
      total: parseInt(row.total, 10),
      by_status: {
        draft: parseInt(row.draft, 10),
        open: parseInt(row.open, 10),
        pending_response: parseInt(row.pending_response, 10),
        answered: parseInt(row.answered, 10),
        closed: parseInt(row.closed, 10),
        void: parseInt(row.void, 10)
      },
      by_priority: {
        low: parseInt(row.priority_low, 10),
        normal: parseInt(row.priority_normal, 10),
        high: parseInt(row.priority_high, 10),
        critical: parseInt(row.priority_critical, 10)
      },
      by_category: byCategory,
      overdue: parseInt(row.overdue, 10),
      avg_response_days: parseFloat(row.avg_response_days) || 0,
      pending_response: parseInt(row.pending_response, 10),
      closed_this_week: parseInt(row.closed_this_week, 10)
    };
  }

  /**
   * Delete an RFI (soft delete by voiding)
   */
  async delete(id: string, userId: string): Promise<void> {
    await this.void(id, userId, 'Deleted by user');
  }

  /**
   * Add attachment to an RFI
   */
  async addAttachment(rfiId: string, attachment: {
    id: string;
    rfi_id: string;
    file_name: string;
    file_url: string;
    file_type: string;
    file_size: number;
    uploaded_by: string;
    uploaded_at: string;
    type: 'request' | 'response' | 'comment';
  }): Promise<any> {
    // Check if RFI exists
    const rfiResult = await pool.query(
      'SELECT id, attachments, response_attachments FROM rfis WHERE id = $1',
      [rfiId]
    );
    
    if (rfiResult.rows.length === 0) {
      throw new Error('RFI not found');
    }
    
    const rfi = rfiResult.rows[0];
    
    if (attachment.type === 'response') {
      // Add to response_attachments array
      const currentAttachments = rfi.response_attachments || [];
      currentAttachments.push(attachment);
      
      await pool.query(
        'UPDATE rfis SET response_attachments = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(currentAttachments), rfiId]
      );
    } else {
      // Add to regular attachments array
      const currentAttachments = rfi.attachments || [];
      currentAttachments.push(attachment);
      
      await pool.query(
        'UPDATE rfis SET attachments = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(currentAttachments), rfiId]
      );
    }
    
    logger.info(`Attachment added to RFI ${rfiId}`, { attachmentId: attachment.id, type: attachment.type });
    
    return attachment;
  }

  // =====================================================
  // PRIVATE HELPERS
  // =====================================================

  private async logHistory(
    client: any,
    rfiId: string,
    action: string,
    previousStatus: RfiStatus | null,
    newStatus: RfiStatus | null,
    fieldChanges: Record<string, any> | null,
    performedBy?: string,
    comment?: string
  ): Promise<void> {
    await client.query(`
      INSERT INTO rfi_history (rfi_id, action, previous_status, new_status, field_changes, comment, performed_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [rfiId, action, previousStatus, newStatus, fieldChanges ? JSON.stringify(fieldChanges) : null, comment, performedBy]);
  }

  private mapRfi(row: any): Rfi {
    return {
      id: row.id,
      organization_id: row.organization_id,
      project_id: row.project_id,
      rfi_number: row.rfi_number,
      revision_number: row.revision_number,
      subject: row.subject,
      question: row.question,
      category: row.category,
      response: row.response,
      response_attachments: typeof row.response_attachments === 'string' 
        ? JSON.parse(row.response_attachments) 
        : row.response_attachments || [],
      status: row.status,
      priority: row.priority,
      due_date: row.due_date,
      responded_at: row.responded_at,
      closed_at: row.closed_at,
      submitted_by: row.submitted_by,
      assigned_to: row.assigned_to,
      answered_by: row.answered_by,
      phase_id: row.phase_id,
      drawing_references: typeof row.drawing_references === 'string' 
        ? JSON.parse(row.drawing_references) 
        : row.drawing_references || [],
      spec_references: typeof row.spec_references === 'string' 
        ? JSON.parse(row.spec_references) 
        : row.spec_references || [],
      location_reference: row.location_reference,
      cost_impact: row.cost_impact ? parseFloat(row.cost_impact) : undefined,
      cost_impact_currency: row.cost_impact_currency || 'GHS',
      schedule_impact_days: row.schedule_impact_days,
      attachments: typeof row.attachments === 'string' 
        ? JSON.parse(row.attachments) 
        : row.attachments || [],
      related_rfis: row.related_rfis || [],
      created_at: row.created_at,
      updated_at: row.updated_at,
      created_by: row.created_by,
      updated_by: row.updated_by
    };
  }

  private mapRfiWithDetails(row: any): RfiWithDetails {
    return {
      ...this.mapRfi(row),
      project_name: row.project_name,
      project_number: row.project_number,
      submitted_by_name: row.submitted_by_name,
      assigned_to_name: row.assigned_to_name,
      answered_by_name: row.answered_by_name,
      phase_name: row.phase_name,
      is_overdue: row.is_overdue,
      days_overdue: row.days_overdue ? parseInt(row.days_overdue, 10) : 0,
      comment_count: row.comment_count ? parseInt(row.comment_count, 10) : 0,
      ball_in_court: row.ball_in_court ?? null,
      // Name of the ball-holder: assignee while awaiting response, else submitter.
      ball_in_court_name: row.ball_in_court
        ? (['open', 'pending_response'].includes(row.status) ? row.assigned_to_name : row.submitted_by_name)
        : null,
    };
  }

  private mapComment(row: any): RfiComment {
    return {
      id: row.id,
      rfi_id: row.rfi_id,
      comment: row.comment,
      attachments: typeof row.attachments === 'string' 
        ? JSON.parse(row.attachments) 
        : row.attachments || [],
      is_internal: row.is_internal,
      created_by: row.created_by,
      created_by_name: row.created_by_name,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

export const rfiService = new RfiService();
export default rfiService;
