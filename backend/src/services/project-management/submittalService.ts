/**
 * Submittal Service
 * Enterprise-grade submittal management for construction projects
 * Phase 3A Week 2
 */

import { pool } from '../../database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';
import { notify, resolveOrgStaff, resolveStaffUser } from '../../../shared-services/notifications/in-mail';

// Types
export type SubmittalStatus = 
  | 'draft' 
  | 'pending_review' 
  | 'under_review' 
  | 'approved' 
  | 'approved_as_noted' 
  | 'revise_resubmit' 
  | 'rejected' 
  | 'for_record_only' 
  | 'void';

export type SubmittalType = 
  | 'shop_drawing' 
  | 'product_data' 
  | 'sample' 
  | 'mock_up' 
  | 'design_data' 
  | 'test_report' 
  | 'certificate' 
  | 'manufacturer_instruction' 
  | 'operation_manual' 
  | 'warranty' 
  | 'other';

export interface Submittal {
  id: string;
  project_id: string;
  submittal_number: string;
  revision_number: number;
  title: string;
  description?: string;
  submittal_type: SubmittalType;
  spec_section?: string;
  spec_section_title?: string;
  category?: string;
  status: SubmittalStatus;
  priority: 'low' | 'normal' | 'high' | 'critical';
  submitted_date?: Date;
  required_date?: Date;
  returned_date?: Date;
  lead_time_days?: number;
  approval_days_required: number;
  submitted_by?: string;
  assigned_reviewer?: string;
  contractor_id?: string;
  subcontractor_name?: string;
  supplier_name?: string;
  manufacturer?: string;
  product_name?: string;
  model_number?: string;
  reviewed_by?: string;
  reviewed_at?: Date;
  review_comments?: string;
  drawing_references: any[];
  related_rfis: string[];
  related_change_orders: string[];
  attachments: any[];
  cost_code?: string;
  estimated_cost?: number;
  currency: string;
  tags: string[];
  custom_fields: Record<string, any>;
  created_at: Date;
  updated_at: Date;
  created_by?: string;
  updated_by?: string;
}

export interface CreateSubmittalInput {
  project_id: string;
  title: string;
  description?: string;
  submittal_type: SubmittalType;
  spec_section?: string;
  spec_section_title?: string;
  category?: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  required_date?: string;
  lead_time_days?: number;
  approval_days_required?: number;
  contractor_id?: string;
  subcontractor_name?: string;
  assigned_reviewer?: string;
  supplier_name?: string;
  manufacturer?: string;
  product_name?: string;
  model_number?: string;
  drawing_references?: any[];
  attachments?: any[];
  cost_code?: string;
  estimated_cost?: number;
  currency?: string;
  tags?: string[];
  custom_fields?: Record<string, any>;
  created_by?: string;
}

export interface UpdateSubmittalInput extends Partial<CreateSubmittalInput> {
  updated_by?: string;
}

export interface SubmittalFilters {
  project_id?: string;
  status?: SubmittalStatus | SubmittalStatus[];
  submittal_type?: SubmittalType | SubmittalType[];
  contractor_id?: string;
  assigned_reviewer?: string;
  /** Filter to submittals currently awaiting this user's action (ball-in-court). */
  ball_in_court?: string;
  spec_section?: string;
  priority?: string;
  overdue_only?: boolean;
  due_this_week?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface SubmittalReviewInput {
  reviewer_id: string;
  status: SubmittalStatus;
  comments?: string;
  stamp_applied?: boolean;
  stamp_type?: string;
  attachments?: any[];
}

class SubmittalService {
  /**
   * Create a new submittal
   */
  async create(input: CreateSubmittalInput): Promise<Submittal> {
    const query = `
      INSERT INTO submittals (
        project_id, title, description, submittal_type, spec_section,
        spec_section_title, category, priority, required_date, lead_time_days,
        approval_days_required, contractor_id, subcontractor_name, assigned_reviewer,
        supplier_name, manufacturer, product_name, model_number,
        drawing_references, attachments, cost_code, estimated_cost, currency,
        tags, custom_fields, created_by, updated_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $26
      )
      RETURNING *
    `;
    
    const values = [
      input.project_id,
      input.title,
      input.description || null,
      input.submittal_type,
      input.spec_section || null,
      input.spec_section_title || null,
      input.category || null,
      input.priority || 'normal',
      input.required_date || null,
      input.lead_time_days || null,
      input.approval_days_required || 14,
      input.contractor_id || null,
      input.subcontractor_name || null,
      input.assigned_reviewer || null,
      input.supplier_name || null,
      input.manufacturer || null,
      input.product_name || null,
      input.model_number || null,
      JSON.stringify(input.drawing_references || []),
      JSON.stringify(input.attachments || []),
      input.cost_code || null,
      input.estimated_cost || null,
      input.currency || 'GHS',
      input.tags || [],
      JSON.stringify(input.custom_fields || {}),
      input.created_by || null
    ];
    
    const result = await pool.query(query, values);
    
    // Log history
    await this.logHistory(result.rows[0].id, 'created', null, 'draft', input.created_by, {
      title: input.title,
      type: input.submittal_type
    });
    
    return result.rows[0];
  }

  /**
   * Get submittal by ID
   */
  async getById(id: string): Promise<Submittal | null> {
    const query = `SELECT * FROM submittal_details WHERE id = $1`;
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * Get all submittals with filters
   */
  async getAll(filters: SubmittalFilters): Promise<{ submittals: Submittal[]; total: number; page: number; limit: number }> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;
    
    let whereConditions: string[] = [];
    let params: any[] = [];
    let paramIndex = 1;
    
    if (filters.project_id) {
      whereConditions.push(`project_id = $${paramIndex++}`);
      params.push(filters.project_id);
    }
    
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        whereConditions.push(`status = ANY($${paramIndex++})`);
        params.push(filters.status);
      } else {
        whereConditions.push(`status = $${paramIndex++}`);
        params.push(filters.status);
      }
    }
    
    if (filters.submittal_type) {
      if (Array.isArray(filters.submittal_type)) {
        whereConditions.push(`submittal_type = ANY($${paramIndex++})`);
        params.push(filters.submittal_type);
      } else {
        whereConditions.push(`submittal_type = $${paramIndex++}`);
        params.push(filters.submittal_type);
      }
    }
    
    if (filters.contractor_id) {
      whereConditions.push(`contractor_id = $${paramIndex++}`);
      params.push(filters.contractor_id);
    }
    
    if (filters.assigned_reviewer) {
      whereConditions.push(`assigned_reviewer = $${paramIndex++}`);
      params.push(filters.assigned_reviewer);
    }
    
    if (filters.spec_section) {
      whereConditions.push(`spec_section ILIKE $${paramIndex++}`);
      params.push(`%${filters.spec_section}%`);
    }
    
    if (filters.priority) {
      whereConditions.push(`priority = $${paramIndex++}`);
      params.push(filters.priority);
    }
    
    if (filters.overdue_only) {
      whereConditions.push(`required_date < CURRENT_DATE AND status NOT IN ('approved', 'approved_as_noted', 'rejected', 'void')`);
    }
    
    if (filters.due_this_week) {
      whereConditions.push(`required_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' AND status NOT IN ('approved', 'approved_as_noted', 'rejected', 'void')`);
    }
    
    if (filters.search) {
      whereConditions.push(`(
        title ILIKE $${paramIndex} OR 
        submittal_number ILIKE $${paramIndex} OR 
        description ILIKE $${paramIndex} OR
        spec_section ILIKE $${paramIndex} OR
        manufacturer ILIKE $${paramIndex} OR
        product_name ILIKE $${paramIndex}
      )`);
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    // Ball-in-court derivation (no stored column): drafts/resubmits await the
    // submitter; items in review await the assigned reviewer, falling back to
    // the project's PM. Approved/rejected/etc → no one.
    // Columns are fully qualified so the CASE still binds to submittal_details
    // (not users) when reused inside the ball_in_court_name subquery below.
    const BALL = `CASE
        WHEN submittal_details.status IN ('draft', 'revise_resubmit') THEN COALESCE(submittal_details.submitted_by, submittal_details.created_by)
        WHEN submittal_details.status IN ('pending_review', 'under_review')
          THEN COALESCE(submittal_details.assigned_reviewer, (SELECT project_manager_id FROM development_projects WHERE id = submittal_details.project_id))
        ELSE NULL
      END`;

    if (filters.ball_in_court) {
      whereConditions.push(`(${BALL}) = $${paramIndex++}`);
      params.push(filters.ball_in_court);
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';
    
    // Sort
    const sortColumn = filters.sort_by || 'created_at';
    const sortOrder = filters.sort_order || 'desc';
    const validColumns = ['created_at', 'updated_at', 'submittal_number', 'required_date', 'status', 'priority', 'title'];
    const safeSort = validColumns.includes(sortColumn) ? sortColumn : 'created_at';
    
    // Count query
    const countQuery = `SELECT COUNT(*) FROM submittal_details ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Data query — include the derived ball-in-court id + holder name.
    const dataQuery = `
      SELECT *,
        (${BALL}) AS ball_in_court,
        (SELECT full_name FROM users WHERE id = (${BALL})) AS ball_in_court_name
      FROM submittal_details
      ${whereClause}
      ORDER BY ${safeSort} ${sortOrder}
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;
    params.push(limit, offset);
    
    const result = await pool.query(dataQuery, params);
    
    return {
      submittals: result.rows,
      total,
      page,
      limit
    };
  }

  /**
   * Update a submittal
   */
  async update(id: string, input: UpdateSubmittalInput): Promise<Submittal | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    const allowedFields = [
      'title', 'description', 'submittal_type', 'spec_section', 'spec_section_title',
      'category', 'priority', 'required_date', 'lead_time_days', 'approval_days_required',
      'contractor_id', 'subcontractor_name', 'assigned_reviewer', 'supplier_name',
      'manufacturer', 'product_name', 'model_number', 'cost_code', 'estimated_cost',
      'currency', 'tags', 'custom_fields'
    ];
    
    for (const field of allowedFields) {
      if (input[field as keyof UpdateSubmittalInput] !== undefined) {
        fields.push(`${field} = $${paramIndex++}`);
        let value = input[field as keyof UpdateSubmittalInput];
        if (field === 'custom_fields' || field === 'drawing_references' || field === 'attachments') {
          value = JSON.stringify(value);
        }
        values.push(value);
      }
    }
    
    if (fields.length === 0) {
      return this.getById(id);
    }
    
    fields.push(`updated_by = $${paramIndex++}`);
    values.push(input.updated_by || null);
    
    values.push(id);
    
    const query = `
      UPDATE submittals 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  /**
   * Submit for review
   */
  async submit(id: string, userId: string): Promise<Submittal | null> {
    const submittal = await this.getById(id);
    if (!submittal) return null;
    
    if (!['draft', 'revise_resubmit'].includes(submittal.status)) {
      throw new Error(`Cannot submit a submittal with status: ${submittal.status}`);
    }
    
    // If this is a resubmission, increment revision number
    const newRevision = submittal.status === 'revise_resubmit' 
      ? submittal.revision_number + 1 
      : submittal.revision_number;
    
    const query = `
      UPDATE submittals
      SET status = 'pending_review',
          submitted_date = CURRENT_DATE,
          submitted_by = $1,
          revision_number = $2,
          updated_by = $1
      WHERE id = $3
      RETURNING *
    `;
    
    const result = await pool.query(query, [userId, newRevision, id]);
    
    await this.logHistory(id, 'submitted', submittal.status, 'pending_review', userId, {
      revision: newRevision
    });

    // Notify org staff (reviewers) that a submittal awaits review
    try {
      const organizationId = await this.resolveProjectOrg(submittal.project_id);
      if (organizationId) {
        const staff = (await resolveOrgStaff(organizationId)).filter((s) => s.userId !== userId);
        if (staff.length) {
          await notify({
            recipients: staff,
            category: 'project',
            type: 'submittal.submitted',
            title: 'Submittal awaiting review',
            body: `Submittal ${submittal.submittal_number} "${submittal.title}" has been submitted for review.`,
            priority: 'normal',
            organizationId,
            sourceType: 'submittal',
            sourceId: id,
            sourceUrl: `/dashboard/projects/${submittal.project_id}/submittals`,
            channels: { inApp: true, email: true },
          });
        }
      }
    } catch (notifyError: any) {
      logger.warn('Failed to notify reviewers of submittal submission', { submittalId: id, error: notifyError.message });
    }

    return result.rows[0];
  }

  /** Resolve a project's organization_id (submittals are project-scoped). Best-effort. */
  private async resolveProjectOrg(projectId: string): Promise<string | null> {
    try {
      const res = await pool.query(`SELECT organization_id FROM development_projects WHERE id = $1`, [projectId]);
      return res.rows[0]?.organization_id || null;
    } catch (err: any) {
      logger.warn('resolveProjectOrg failed', { projectId, error: err.message });
      return null;
    }
  }

  /**
   * Assign reviewer
   */
  async assignReviewer(id: string, reviewerId: string, assignedBy: string): Promise<Submittal | null> {
    const submittal = await this.getById(id);
    if (!submittal) return null;
    
    const query = `
      UPDATE submittals
      SET assigned_reviewer = $1,
          status = CASE WHEN status = 'pending_review' THEN 'under_review' ELSE status END,
          updated_by = $2
      WHERE id = $3
      RETURNING *
    `;
    
    const result = await pool.query(query, [reviewerId, assignedBy, id]);
    
    if (submittal.status === 'pending_review') {
      await this.logHistory(id, 'assigned_reviewer', 'pending_review', 'under_review', assignedBy, {
        reviewer_id: reviewerId
      });
    }

    // Notify the assigned reviewer (skip self-assignment)
    if (reviewerId && reviewerId !== assignedBy) {
      try {
        const recipient = await resolveStaffUser(reviewerId);
        if (recipient) {
          await notify({
            recipients: recipient,
            category: 'project',
            type: 'submittal.review_assigned',
            title: 'Submittal review assigned to you',
            body: `You have been assigned to review submittal ${submittal.submittal_number} "${submittal.title}".`,
            priority: 'normal',
            organizationId: (await this.resolveProjectOrg(submittal.project_id)) || undefined,
            sourceType: 'submittal',
            sourceId: id,
            sourceUrl: `/dashboard/projects/${submittal.project_id}/submittals`,
            channels: { inApp: true, email: true },
          });
        }
      } catch (notifyError: any) {
        logger.warn('Failed to notify submittal reviewer', { submittalId: id, error: notifyError.message });
      }
    }

    return result.rows[0];
  }

  /**
   * Review submittal
   */
  async review(id: string, input: SubmittalReviewInput): Promise<Submittal | null> {
    const submittal = await this.getById(id);
    if (!submittal) return null;
    
    if (!['pending_review', 'under_review'].includes(submittal.status)) {
      throw new Error(`Cannot review a submittal with status: ${submittal.status}`);
    }
    
    // Add review record
    const reviewQuery = `
      INSERT INTO submittal_reviews (
        submittal_id, reviewer_id, status, comments, stamp_applied, stamp_type, attachments
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    
    await pool.query(reviewQuery, [
      id,
      input.reviewer_id,
      input.status,
      input.comments || null,
      input.stamp_applied || false,
      input.stamp_type || null,
      JSON.stringify(input.attachments || [])
    ]);
    
    // Update submittal
    const updateQuery = `
      UPDATE submittals
      SET status = $1,
          reviewed_by = $2,
          reviewed_at = NOW(),
          review_comments = $3,
          returned_date = CASE WHEN $1 IN ('approved', 'approved_as_noted', 'rejected', 'revise_resubmit') THEN CURRENT_DATE ELSE returned_date END,
          updated_by = $2
      WHERE id = $4
      RETURNING *
    `;
    
    const result = await pool.query(updateQuery, [
      input.status,
      input.reviewer_id,
      input.comments || null,
      id
    ]);
    
    await this.logHistory(id, 'reviewed', submittal.status, input.status, input.reviewer_id, {
      comments: input.comments,
      stamp_applied: input.stamp_applied
    });
    
    return result.rows[0];
  }

  /**
   * Void a submittal
   */
  async void(id: string, userId: string, reason?: string): Promise<Submittal | null> {
    const submittal = await this.getById(id);
    if (!submittal) return null;
    
    const query = `
      UPDATE submittals
      SET status = 'void',
          updated_by = $1
      WHERE id = $2
      RETURNING *
    `;
    
    const result = await pool.query(query, [userId, id]);
    
    await this.logHistory(id, 'voided', submittal.status, 'void', userId, { reason });
    
    return result.rows[0];
  }

  /**
   * Add attachments
   */
  async addAttachments(id: string, attachments: any[], userId: string): Promise<Submittal | null> {
    const submittal = await this.getById(id);
    if (!submittal) return null;
    
    const existingAttachments = submittal.attachments || [];
    const newAttachments = [...existingAttachments, ...attachments.map(a => ({
      ...a,
      id: uuidv4(),
      uploaded_at: new Date().toISOString(),
      uploaded_by: userId
    }))];
    
    const query = `
      UPDATE submittals
      SET attachments = $1,
          updated_by = $2
      WHERE id = $3
      RETURNING *
    `;
    
    const result = await pool.query(query, [JSON.stringify(newAttachments), userId, id]);
    return result.rows[0];
  }

  /**
   * Get reviews for a submittal
   */
  async getReviews(submittalId: string): Promise<any[]> {
    const query = `
      SELECT sr.*, 
             CONCAT(u.first_name, ' ', u.last_name) as reviewer_name
      FROM submittal_reviews sr
      LEFT JOIN users u ON sr.reviewer_id = u.id
      WHERE sr.submittal_id = $1
      ORDER BY sr.reviewed_at DESC
    `;
    
    const result = await pool.query(query, [submittalId]);
    return result.rows;
  }

  /**
   * Get history for a submittal
   */
  async getHistory(submittalId: string): Promise<any[]> {
    const query = `
      SELECT sh.*,
             CONCAT(u.first_name, ' ', u.last_name) as changed_by_name
      FROM submittal_history sh
      LEFT JOIN users u ON sh.changed_by = u.id
      WHERE sh.submittal_id = $1
      ORDER BY sh.created_at DESC
    `;
    
    const result = await pool.query(query, [submittalId]);
    return result.rows;
  }

  /**
   * Get statistics for a project
   */
  async getStats(projectId: string): Promise<any> {
    const query = `SELECT * FROM submittal_stats_by_project WHERE project_id = $1`;
    const result = await pool.query(query, [projectId]);
    
    if (result.rows.length === 0) {
      return {
        total_submittals: 0,
        draft_count: 0,
        pending_count: 0,
        approved_count: 0,
        revise_count: 0,
        rejected_count: 0,
        overdue_count: 0,
        due_this_week: 0,
        approval_rate: 0,
        avg_review_days: null
      };
    }
    
    return result.rows[0];
  }

  /**
   * Get submittals by spec section
   */
  async getBySpecSection(projectId: string): Promise<any[]> {
    const query = `
      SELECT 
        spec_section,
        spec_section_title,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status IN ('approved', 'approved_as_noted')) as approved,
        COUNT(*) FILTER (WHERE status IN ('pending_review', 'under_review')) as pending,
        COUNT(*) FILTER (WHERE status = 'revise_resubmit') as revisions
      FROM submittals
      WHERE project_id = $1 AND spec_section IS NOT NULL
      GROUP BY spec_section, spec_section_title
      ORDER BY spec_section
    `;
    
    const result = await pool.query(query, [projectId]);
    return result.rows;
  }

  /**
   * Create a submittal package
   */
  async createPackage(projectId: string, data: { 
    package_number?: string; 
    title: string; 
    description?: string; 
    due_date?: string;
    created_by?: string;
  }): Promise<any> {
    const query = `
      INSERT INTO submittal_packages (project_id, package_number, title, description, due_date, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    // Auto-generate package number if not provided
    let packageNumber = data.package_number;
    if (!packageNumber) {
      const countResult = await pool.query(
        'SELECT COUNT(*) FROM submittal_packages WHERE project_id = $1',
        [projectId]
      );
      const count = parseInt(countResult.rows[0].count) + 1;
      packageNumber = `PKG-${count.toString().padStart(4, '0')}`;
    }
    
    const result = await pool.query(query, [
      projectId,
      packageNumber,
      data.title,
      data.description || null,
      data.due_date || null,
      data.created_by || null
    ]);
    
    return result.rows[0];
  }

  /**
   * Add submittal to package
   */
  async addToPackage(packageId: string, submittalId: string): Promise<void> {
    const query = `
      INSERT INTO submittal_package_items (package_id, submittal_id, sequence_number)
      SELECT $1, $2, COALESCE(MAX(sequence_number), 0) + 1
      FROM submittal_package_items WHERE package_id = $1
      ON CONFLICT (package_id, submittal_id) DO NOTHING
    `;
    
    await pool.query(query, [packageId, submittalId]);
  }

  /**
   * Get package with submittals
   */
  async getPackage(packageId: string): Promise<any> {
    const packageQuery = `SELECT * FROM submittal_packages WHERE id = $1`;
    const packageResult = await pool.query(packageQuery, [packageId]);
    
    if (packageResult.rows.length === 0) return null;
    
    const submittalsQuery = `
      SELECT s.*, spi.sequence_number
      FROM submittal_package_items spi
      JOIN submittal_details s ON spi.submittal_id = s.id
      WHERE spi.package_id = $1
      ORDER BY spi.sequence_number
    `;
    
    const submittalsResult = await pool.query(submittalsQuery, [packageId]);
    
    return {
      ...packageResult.rows[0],
      submittals: submittalsResult.rows
    };
  }

  /**
   * Delete a submittal (soft delete via void)
   */
  async delete(id: string, userId: string): Promise<boolean> {
    const submittal = await this.getById(id);
    if (!submittal) return false;
    
    // Only allow deletion of draft submittals
    if (submittal.status !== 'draft') {
      throw new Error('Only draft submittals can be deleted. Use void for submitted submittals.');
    }
    
    const query = `DELETE FROM submittals WHERE id = $1`;
    await pool.query(query, [id]);
    
    return true;
  }

  /**
   * Log history entry
   */
  private async logHistory(
    submittalId: string,
    action: string,
    oldStatus: SubmittalStatus | null,
    newStatus: SubmittalStatus | null,
    changedBy: string | null | undefined,
    details: Record<string, any> = {}
  ): Promise<void> {
    const query = `
      INSERT INTO submittal_history (submittal_id, action, old_status, new_status, changed_by, change_details)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    
    await pool.query(query, [
      submittalId,
      action,
      oldStatus,
      newStatus,
      changedBy || null,
      JSON.stringify(details)
    ]);
  }
}

export const submittalService = new SubmittalService();
export default submittalService;
