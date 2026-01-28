/**
 * Draw Request Service
 * Phase 5.8 Week 4 - Construction Financing
 * 
 * Handles construction draw requests for project financing.
 * Procore-inspired draw management with approval workflow.
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { BaseService } from '../base/BaseService';
import { eventBus, ProjectEventType } from './events';

// =====================================================
// TYPES
// =====================================================

export type DrawStatus = 
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'partially_funded'
  | 'funded'
  | 'rejected'
  | 'cancelled';

export interface DrawLineItem {
  id?: string;
  cost_id: string;
  cost_code: string;
  description: string;
  budgeted_amount: number;
  previously_drawn: number;
  current_draw_amount: number;
  remaining_amount: number;
  notes?: string;
}

export interface DrawRequest {
  id: string;
  project_id: string;
  organization_id: string;
  draw_number: string;
  status: DrawStatus;
  
  // Amounts
  total_amount: number;
  approved_amount?: number;
  funded_amount?: number;
  retention_percentage: number;
  retention_held: number;
  net_amount: number;
  
  // Dates
  submitted_date?: Date;
  approved_date?: Date;
  funded_date?: Date;
  
  // Approvals
  submitted_by?: string;
  submitted_by_name?: string;
  approved_by?: string;
  approved_by_name?: string;
  rejection_reason?: string;
  
  // Line items
  line_items: DrawLineItem[];
  
  // Documents
  supporting_documents?: string[];
  notes?: string;
  
  // Audit
  created_at: Date;
  updated_at: Date;
  created_by?: string;
}

export interface CreateDrawInput {
  project_id: string;
  organization_id: string;
  line_items: Omit<DrawLineItem, 'id'>[];
  retention_percentage?: number;
  notes?: string;
  supporting_documents?: string[];
  created_by?: string;
}

export interface DrawSummary {
  project_id: string;
  total_draws: number;
  total_budget: number;
  total_drawn: number;
  total_funded: number;
  total_pending: number;
  pending_amount: number;
  retention_held: number;
  remaining_to_draw: number;
  draw_history: {
    draw_number: string;
    amount: number;
    status: DrawStatus;
    date: Date;
  }[];
}

// =====================================================
// DRAW SERVICE CLASS
// =====================================================

class DrawService extends BaseService {
  constructor() {
    super('DrawService');
  }

  // =====================================================
  // CRUD OPERATIONS
  // =====================================================

  /**
   * Create a new draw request
   */
  async create(input: CreateDrawInput): Promise<DrawRequest> {
    return this.executeInTransaction(async (client) => {
      
      // Calculate totals
      const totalAmount = input.line_items.reduce((sum, item) => sum + item.current_draw_amount, 0);
      const retentionPct = input.retention_percentage || 10;
      const retentionHeld = totalAmount * (retentionPct / 100);
      const netAmount = totalAmount - retentionHeld;
      
      // Insert draw request
      const result = await client.query(`
        INSERT INTO draw_requests (
          project_id, organization_id, status,
          total_amount, retention_percentage, retention_held, net_amount,
          line_items, supporting_documents, notes, created_by
        )
        VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        input.project_id,
        input.organization_id,
        totalAmount,
        retentionPct,
        retentionHeld,
        netAmount,
        JSON.stringify(input.line_items),
        input.supporting_documents || [],
        input.notes,
        input.created_by
      ]);
      
      this.logger.info({ drawId: result.rows[0].id }, 'Draw request created');
      
      return this.mapRow(result.rows[0]);
    });
  }

  /**
   * Get draw request by ID
   */
  async getById(id: string): Promise<DrawRequest | null> {
    const result = await pool.query(`
      SELECT dr.*,
             u1.full_name as submitted_by_name,
             u2.full_name as approved_by_name
      FROM draw_requests dr
      LEFT JOIN users u1 ON dr.submitted_by = u1.id
      LEFT JOIN users u2 ON dr.approved_by = u2.id
      WHERE dr.id = $1 AND dr.deleted_at IS NULL
    `, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRow(result.rows[0]);
  }

  /**
   * Get all draw requests for a project with pagination
   */
  async getByProject(
    projectId: string,
    status?: DrawStatus,
    page = 1,
    limit = 20
  ): Promise<{
    data: DrawRequest[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    let whereClause = `WHERE dr.project_id = $1 AND dr.deleted_at IS NULL`;
    const params: any[] = [projectId];
    let paramCount = 1;
    
    if (status) {
      whereClause += ` AND dr.status = $${++paramCount}`;
      params.push(status);
    }
    
    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM draw_requests dr ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);
    
    // Get paginated results
    const offset = (page - 1) * limit;
    params.push(limit, offset);
    
    const query = `
      SELECT dr.*,
             u1.full_name as submitted_by_name,
             u2.full_name as approved_by_name
      FROM draw_requests dr
      LEFT JOIN users u1 ON dr.submitted_by = u1.id
      LEFT JOIN users u2 ON dr.approved_by = u2.id
      ${whereClause}
      ORDER BY dr.created_at DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `;
    
    const result = await pool.query(query, params);
    
    return {
      data: result.rows.map(row => this.mapRow(row)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Get draw summary for a project
   */
  async getSummary(projectId: string): Promise<DrawSummary> {
    // Get project budget
    const budgetResult = await pool.query(`
      SELECT COALESCE(SUM(revised_budget), 0) as total_budget
      FROM project_costs
      WHERE project_id = $1 AND deleted_at IS NULL
    `, [projectId]);
    
    const totalBudget = parseFloat(budgetResult.rows[0]?.total_budget || 0);
    
    // Get draw totals
    const drawResult = await pool.query(`
      SELECT 
        COUNT(*) as total_draws,
        COALESCE(SUM(CASE WHEN status IN ('funded') THEN funded_amount ELSE 0 END), 0) as total_funded,
        COALESCE(SUM(CASE WHEN status IN ('approved', 'partially_funded') THEN total_amount ELSE 0 END), 0) as total_approved,
        COALESCE(SUM(CASE WHEN status = 'submitted' THEN total_amount ELSE 0 END), 0) as pending_amount,
        COUNT(CASE WHEN status = 'submitted' THEN 1 END) as pending_count,
        COALESCE(SUM(retention_held), 0) as retention_held
      FROM draw_requests
      WHERE project_id = $1 AND deleted_at IS NULL AND status != 'cancelled'
    `, [projectId]);
    
    const drawStats = drawResult.rows[0];
    
    // Get draw history
    const historyResult = await pool.query(`
      SELECT draw_number, total_amount, status, 
             COALESCE(funded_date, approved_date, submitted_date, created_at) as date
      FROM draw_requests
      WHERE project_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 10
    `, [projectId]);
    
    return {
      project_id: projectId,
      total_draws: parseInt(drawStats.total_draws) || 0,
      total_budget: totalBudget,
      total_drawn: parseFloat(drawStats.total_funded) + parseFloat(drawStats.total_approved),
      total_funded: parseFloat(drawStats.total_funded) || 0,
      total_pending: parseInt(drawStats.pending_count) || 0,
      pending_amount: parseFloat(drawStats.pending_amount) || 0,
      retention_held: parseFloat(drawStats.retention_held) || 0,
      remaining_to_draw: totalBudget - parseFloat(drawStats.total_funded) - parseFloat(drawStats.total_approved),
      draw_history: historyResult.rows.map(row => ({
        draw_number: row.draw_number,
        amount: parseFloat(row.total_amount),
        status: row.status,
        date: row.date,
      }))
    };
  }

  // =====================================================
  // WORKFLOW OPERATIONS
  // =====================================================

  /**
   * Submit draw request for approval
   */
  async submit(id: string, userId: string): Promise<DrawRequest | null> {
    const result = await pool.query(`
      UPDATE draw_requests
      SET status = 'submitted',
          submitted_date = NOW(),
          submitted_by = $2,
          updated_at = NOW()
      WHERE id = $1 AND status = 'draft' AND deleted_at IS NULL
      RETURNING *
    `, [id, userId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    logger.info({ drawId: id, userId }, 'Draw request submitted');
    return this.mapRow(result.rows[0]);
  }

  /**
   * Approve draw request
   */
  async approve(id: string, userId: string, approvedAmount?: number): Promise<DrawRequest | null> {
    const draw = await this.getById(id);
    if (!draw || draw.status !== 'submitted') {
      return null;
    }
    
    const amount = approvedAmount || draw.total_amount;
    
    const result = await pool.query(`
      UPDATE draw_requests
      SET status = 'approved',
          approved_amount = $2,
          approved_date = NOW(),
          approved_by = $3,
          updated_at = NOW()
      WHERE id = $1 AND status = 'submitted' AND deleted_at IS NULL
      RETURNING *
    `, [id, amount, userId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    logger.info({ drawId: id, userId, approvedAmount: amount }, 'Draw request approved');
    return this.mapRow(result.rows[0]);
  }

  /**
   * Reject draw request
   */
  async reject(id: string, userId: string, reason: string): Promise<DrawRequest | null> {
    const result = await pool.query(`
      UPDATE draw_requests
      SET status = 'rejected',
          rejection_reason = $2,
          approved_by = $3,
          approved_date = NOW(),
          updated_at = NOW()
      WHERE id = $1 AND status IN ('submitted', 'under_review') AND deleted_at IS NULL
      RETURNING *
    `, [id, reason, userId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    logger.info({ drawId: id, userId, reason }, 'Draw request rejected');
    return this.mapRow(result.rows[0]);
  }

  /**
   * Record funding
   */
  async recordFunding(
    id: string,
    fundedAmount: number,
    userId: string,
    referenceNumber?: string,
    notes?: string
  ): Promise<DrawRequest | null> {
    const draw = await this.getById(id);
    if (!draw || !['approved', 'partially_funded'].includes(draw.status)) {
      return null;
    }
    
    const totalFunded = (draw.funded_amount || 0) + fundedAmount;
    const approvedAmount = draw.approved_amount || draw.total_amount;
    const newStatus = totalFunded >= approvedAmount ? 'funded' : 'partially_funded';
    
    const result = await pool.query(`
      UPDATE draw_requests
      SET status = $2,
          funded_amount = $3,
          funded_date = CASE WHEN $2 = 'funded' THEN NOW() ELSE funded_date END,
          notes = COALESCE($4, notes),
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `, [id, newStatus, totalFunded, notes ? `Funding ref: ${referenceNumber || 'N/A'}. ${notes}` : null]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    logger.info({ drawId: id, fundedAmount, totalFunded, status: newStatus, referenceNumber }, 'Draw funding recorded');
    return this.mapRow(result.rows[0]);
  }

  /**
   * Update line items
   */
  async updateLineItems(id: string, lineItems: DrawLineItem[]): Promise<DrawRequest | null> {
    const totalAmount = lineItems.reduce((sum, item) => sum + item.current_draw_amount, 0);
    
    const draw = await this.getById(id);
    if (!draw || draw.status !== 'draft') {
      return null;
    }
    
    const retentionHeld = totalAmount * (draw.retention_percentage / 100);
    const netAmount = totalAmount - retentionHeld;
    
    const result = await pool.query(`
      UPDATE draw_requests
      SET line_items = $2,
          total_amount = $3,
          retention_held = $4,
          net_amount = $5,
          updated_at = NOW()
      WHERE id = $1 AND status = 'draft' AND deleted_at IS NULL
      RETURNING *
    `, [id, JSON.stringify(lineItems), totalAmount, retentionHeld, netAmount]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRow(result.rows[0]);
  }

  /**
   * Add supporting document
   */
  async addDocument(
    id: string,
    documentUrl: string,
    documentType?: string,
    name?: string
  ): Promise<DrawRequest | null> {
    // Store document with metadata as JSON string if type/name provided
    const documentEntry = documentType || name 
      ? JSON.stringify({ url: documentUrl, type: documentType, name: name })
      : documentUrl;
    
    const result = await pool.query(`
      UPDATE draw_requests
      SET supporting_documents = array_append(supporting_documents, $2),
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `, [id, documentEntry]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    logger.info({ drawId: id, documentUrl, documentType, name }, 'Document added to draw request');
    return this.mapRow(result.rows[0]);
  }

  /**
   * Cancel draw request
   */
  async cancel(id: string): Promise<boolean> {
    const result = await pool.query(`
      UPDATE draw_requests
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1 AND status IN ('draft', 'submitted') AND deleted_at IS NULL
    `, [id]);
    
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Delete draw request (soft)
   */
  async delete(id: string): Promise<boolean> {
    const result = await pool.query(`
      UPDATE draw_requests
      SET deleted_at = NOW()
      WHERE id = $1 AND status = 'draft' AND deleted_at IS NULL
    `, [id]);
    
    return (result.rowCount ?? 0) > 0;
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  protected mapRow(row: any): DrawRequest {
    return {
      id: row.id,
      project_id: row.project_id,
      organization_id: row.organization_id,
      draw_number: row.draw_number,
      status: row.status,
      total_amount: parseFloat(row.total_amount) || 0,
      approved_amount: row.approved_amount ? parseFloat(row.approved_amount) : undefined,
      funded_amount: row.funded_amount ? parseFloat(row.funded_amount) : undefined,
      retention_percentage: parseFloat(row.retention_percentage) || 0,
      retention_held: parseFloat(row.retention_held) || 0,
      net_amount: parseFloat(row.net_amount) || 0,
      submitted_date: row.submitted_date,
      approved_date: row.approved_date,
      funded_date: row.funded_date,
      submitted_by: row.submitted_by,
      submitted_by_name: row.submitted_by_name,
      approved_by: row.approved_by,
      approved_by_name: row.approved_by_name,
      rejection_reason: row.rejection_reason,
      line_items: typeof row.line_items === 'string' ? JSON.parse(row.line_items) : (row.line_items || []),
      supporting_documents: row.supporting_documents,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      created_by: row.created_by,
    };
  }
}

export const drawService = new DrawService();
export default drawService;
