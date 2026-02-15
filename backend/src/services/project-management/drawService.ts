/**
 * Draw Request Service
 * Phase 5.8 Week 4 - Construction Financing
 * Phase 5 E-Sign Integration - Draw request approval signatures
 * 
 * Handles construction draw requests for project financing.
 * Procore-inspired draw management with approval workflow.
 * 
 * E-Sign Integration (Phase 5):
 * - Triggers e-sign workflow when draw request is approved
 * - Collects signatures from owner, GC, and lender representative
 * - Auto-funds draw after all signatures (if configured)
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { BaseService } from '../../../shared-services/base/BaseService';
import { eventBus, ProjectEventType } from './events';
import { eSignIntegrationService } from '../../../shared-services/e-sign/integration/eSignIntegrationService';
import { CompletionEvent, ESignField, ESignSigner } from '../../../shared-services/e-sign/integration/types';

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
   * Phase 5: Now triggers e-sign workflow if configured
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
    
    const approvedDraw = this.mapRow(result.rows[0]);
    
    // Phase 5: Check if e-sign is configured and trigger workflow
    await this.checkAndTriggerEsign(approvedDraw, userId);
    
    return approvedDraw;
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
  // E-SIGN INTEGRATION (Phase 5)
  // =====================================================

  /**
   * Check if e-sign is configured and trigger workflow
   */
  private async checkAndTriggerEsign(
    draw: DrawRequest,
    userId: string
  ): Promise<void> {
    try {
      // Get e-sign config for organization
      const configResult = await pool.query(`
        SELECT * FROM draw_request_esign_config 
        WHERE organization_id = $1
      `, [draw.organization_id]);

      if (configResult.rows.length === 0) {
        logger.info('No e-sign config for draw requests, skipping', {
          drawId: draw.id,
          organizationId: draw.organization_id,
        });
        return;
      }

      const config = configResult.rows[0];

      // Check if trigger is enabled
      if (!config.trigger_on_approval) {
        return;
      }

      // Check amount threshold
      const drawAmount = draw.approved_amount || draw.total_amount;
      if (drawAmount < parseFloat(config.min_amount_threshold || 0)) {
        logger.info('Draw request amount below e-sign threshold', {
          drawId: draw.id,
          amount: drawAmount,
          threshold: config.min_amount_threshold,
        });
        return;
      }

      await this.triggerDrawEsign(draw, config, userId);
    } catch (error) {
      logger.error('Error checking/triggering e-sign for draw request', {
        drawId: draw.id,
        error,
      });
      // Don't throw - e-sign failure shouldn't block approval
    }
  }

  /**
   * Trigger e-sign workflow for a draw request
   */
  async triggerDrawEsign(
    draw: DrawRequest,
    config: any,
    userId: string
  ): Promise<void> {
    // Get project info
    const projectResult = await pool.query(
      'SELECT * FROM projects WHERE id = $1',
      [draw.project_id]
    );
    const project = projectResult.rows[0];

    logger.info('Triggering e-sign for draw request', {
      drawId: draw.id,
      drawNumber: draw.draw_number,
      projectId: draw.project_id,
    });

    // Generate draw request document PDF
    const drawPdf = await this.generateDrawPdf(draw, project);

    // Resolve signers based on config
    const signers = await this.resolveDrawSigners(
      draw,
      project,
      config.signer_roles || ['project_owner', 'general_contractor', 'lender_representative']
    );

    if (signers.length === 0) {
      logger.warn('No signers resolved for draw request e-sign', {
        drawId: draw.id,
      });
      return;
    }

    // Build field placements
    const fields = this.buildDrawFields(signers, config.field_placements);

    const amount = draw.approved_amount || draw.total_amount;

    // Create envelope
    const envelope = await eSignIntegrationService.createEnvelope({
      subject: `Draw Request ${draw.draw_number} - ${project?.name || 'Project'}`,
      message: `Please review and approve Draw Request ${draw.draw_number}. Amount: ${amount.toLocaleString()}`,
      documents: [{
        name: `Draw_Request_${draw.draw_number}.pdf`,
        content: drawPdf,
        mimeType: 'application/pdf',
        source: 'system_generated',
      }],
      signers,
      fields,
      sourceModule: 'project_management',
      sourceEntityType: 'draw_request',
      sourceEntityId: draw.id,
      expiresInDays: 14,
    });

    // Update draw request with envelope info
    await pool.query(`
      UPDATE draw_requests
      SET esign_envelope_id = $1,
          esign_status = 'sent',
          esign_triggered_at = NOW()
      WHERE id = $2
    `, [envelope.envelopeId, draw.id]);

    // Log audit event
    await this.logEsignAudit(
      draw.organization_id,
      'draw_request',
      draw.id,
      envelope.envelopeId,
      'created',
      userId
    );

    logger.info('E-sign triggered for draw request', {
      drawId: draw.id,
      envelopeId: envelope.envelopeId,
      signerCount: signers.length,
    });
  }

  /**
   * Handle e-sign completion webhook for draw requests
   */
  async handleEsignCompletion(event: CompletionEvent): Promise<void> {
    const { sourceContext, envelope, documents, signers: completedSigners } = event;

    logger.info('Handling e-sign completion for draw request', {
      drawId: sourceContext.entityId,
      envelopeId: envelope.id,
    });

    const draw = await this.getById(sourceContext.entityId);
    if (!draw) {
      throw new Error(`Draw request not found: ${sourceContext.entityId}`);
    }

    // Update draw request with signed document
    const signedDocUrl = documents[0]?.signedUrl || null;

    await pool.query(`
      UPDATE draw_requests
      SET esign_status = 'completed',
          esign_completed_at = NOW(),
          signed_draw_url = $2
      WHERE id = $1
    `, [sourceContext.entityId, signedDocUrl]);

    // Check if auto-fund is enabled
    const configResult = await pool.query(`
      SELECT auto_fund_on_complete FROM draw_request_esign_config 
      WHERE organization_id = $1
    `, [draw.organization_id]);

    const autoFund = configResult.rows[0]?.auto_fund_on_complete ?? false;

    if (autoFund && draw.status === 'approved') {
      // Auto-fund the draw request
      const amount = draw.approved_amount || draw.total_amount;
      await pool.query(`
        UPDATE draw_requests
        SET status = 'funded',
            funded_amount = $2,
            funded_date = NOW()
        WHERE id = $1
      `, [sourceContext.entityId, amount]);

      logger.info('Draw request auto-funded after e-sign', {
        drawId: sourceContext.entityId,
        amount,
      });
    }

    // Log audit event
    await this.logEsignAudit(
      draw.organization_id,
      'draw_request',
      sourceContext.entityId,
      envelope.id,
      'completed',
      null,
      { signers: completedSigners }
    );

    // Emit event for notifications
    eventBus.emit(ProjectEventType.DRAW_ESIGN_COMPLETED, {
      drawId: sourceContext.entityId,
      projectId: draw.project_id,
      signedDrawUrl: signedDocUrl,
    });

    logger.info('Draw request e-sign completed', {
      drawId: sourceContext.entityId,
    });
  }

  /**
   * Generate PDF for draw request (stub - integrate with document service)
   */
  private async generateDrawPdf(draw: DrawRequest, project: any): Promise<Buffer> {
    // TODO: Integrate with actual document generation service
    // For now, check if there's a supporting document
    if (draw.supporting_documents && draw.supporting_documents.length > 0) {
      const pdfDoc = draw.supporting_documents.find(
        d => typeof d === 'string' && d.endsWith('.pdf')
      );
      if (pdfDoc) {
        try {
          const response = await fetch(pdfDoc);
          const buffer = await response.arrayBuffer();
          return Buffer.from(buffer);
        } catch (error) {
          logger.warn('Failed to fetch supporting document PDF', { error });
        }
      }
    }

    // Return a minimal placeholder PDF
    const placeholderPdf = Buffer.from(
      `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length 44 >> stream
BT /F1 12 Tf 100 700 Td (Draw Request ${draw.draw_number}) Tj ET
endstream endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000214 00000 n 
trailer << /Size 5 /Root 1 0 R >>
startxref
307
%%EOF`
    );
    return placeholderPdf;
  }

  /**
   * Resolve signers for draw request e-sign
   */
  private async resolveDrawSigners(
    draw: DrawRequest,
    project: any,
    signerRoles: string[]
  ): Promise<ESignSigner[]> {
    const signers: ESignSigner[] = [];

    // Get project team members
    const teamResult = await pool.query(`
      SELECT pt.*, u.full_name, u.email
      FROM project_team pt
      JOIN users u ON pt.user_id = u.id
      WHERE pt.project_id = $1 AND pt.is_active = true
    `, [draw.project_id]);

    const teamByRole = new Map<string, any>();
    for (const member of teamResult.rows) {
      teamByRole.set(member.role?.toLowerCase(), member);
    }

    // Get project lender info if available
    const lenderResult = await pool.query(`
      SELECT * FROM project_contacts
      WHERE project_id = $1 AND contact_type = 'lender' AND is_active = true
      LIMIT 1
    `, [draw.project_id]);

    // Resolve each signer role
    let order = 1;
    for (const role of signerRoles) {
      let signer: ESignSigner | null = null;

      switch (role.toLowerCase()) {
        case 'project_owner':
        case 'owner':
          const owner = teamByRole.get('owner') || teamByRole.get('owner_representative');
          if (owner) {
            signer = {
              name: owner.full_name,
              email: owner.email,
              role: 'signer',
              order: order++,
            };
          }
          break;

        case 'general_contractor':
        case 'gc':
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

        case 'lender_representative':
        case 'lender':
          if (lenderResult.rows.length > 0) {
            const lender = lenderResult.rows[0];
            if (lender.email && lender.contact_name) {
              signer = {
                name: lender.contact_name,
                email: lender.email,
                role: 'signer',
                order: order++,
              };
            }
          }
          break;

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
      }

      if (signer) {
        signers.push(signer);
      }
    }

    return signers;
  }

  /**
   * Build signature field placements for draw request
   */
  private buildDrawFields(
    signers: ESignSigner[],
    configuredPlacements?: any[]
  ): ESignField[] {
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

    // Default: Stack signatures on the document
    const fields: ESignField[] = [];
    let yPosition = 0.7;

    for (const signer of signers) {
      fields.push({
        type: 'signature',
        recipientEmail: signer.email,
        documentIndex: 0,
        page: 1,
        x: 0.1,
        y: yPosition,
        width: 0.3,
        height: 0.08,
        required: true,
      });

      fields.push({
        type: 'date',
        recipientEmail: signer.email,
        documentIndex: 0,
        page: 1,
        x: 0.5,
        y: yPosition,
        width: 0.2,
        height: 0.05,
        required: true,
      });

      yPosition -= 0.12;
    }

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
