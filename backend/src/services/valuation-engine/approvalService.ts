/**
 * Approval Service
 * 
 * Manages the report approval workflow including:
 * - Status transitions (draft → approved)
 * - Report locking
 * - Digital signature embedding
 * - Valuer credential verification
 * - Client e-sign workflow trigger (Phase 3)
 * 
 * Phase 4: Week 7 - Approval Workflow
 * Phase 3: E-Sign Integration - Valuation Reports
 */

import { query, pool } from '../../database';
import { logger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { eSignIntegrationService } from '../../../shared-services/e-sign/integration/eSignIntegrationService';
import { CompletionEvent, ESignField } from '../../../shared-services/e-sign/integration/types';

// =====================================================
// TYPES
// =====================================================

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalRequest {
  reportId: string;
  valuerId: string;
  comments?: string;
  signatureDataUrl?: string;
  /** If true, trigger client e-sign workflow after approval */
  sendToClient?: boolean;
  /** Client email override (optional, defaults to engagement client) */
  clientEmail?: string;
  /** Client name override (optional, defaults to engagement client) */
  clientName?: string;
}

export interface ApprovalResult {
  success: boolean;
  reportId: string;
  status: ApprovalStatus;
  approvedAt?: Date;
  approvedBy?: string;
  digitalSealHash?: string;
  verificationUrl?: string;
  error?: string;
}

export interface Valuer {
  id: string;
  user_id: string | null;
  name: string;
  qualifications: string | null;
  title: string | null;
  license_number: string | null;
  license_issuer: string | null;
  license_valid_until: Date | null;
  license_status: string;
  pi_provider: string | null;
  pi_policy_number: string | null;
  pi_coverage: number | null;
  pi_valid_until: Date | null;
  contact_address: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  signature_storage_key: string | null;
  company_name: string | null;
  company_address: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ValuerCredentials {
  id: string;
  name: string;
  title: string | null;
  qualifications: string | null;
  license_number: string | null;
  license_issuer: string | null;
  license_status: string;
  license_valid: boolean;
  pi_insured: boolean;
  pi_valid: boolean;
  has_signature: boolean;
  can_approve: boolean;
  issues: string[];
}

// =====================================================
// APPROVAL SERVICE CLASS
// =====================================================

export class ApprovalService {
  private readonly verificationBaseUrl: string;

  constructor() {
    this.verificationBaseUrl = process.env.VERIFICATION_BASE_URL || 'https://verify.propmetrik.com';
  }

  // ---------------------------------------------------
  // VALUER MANAGEMENT
  // ---------------------------------------------------

  /**
   * Get valuer by ID
   */
  async getValuerById(valuerId: string): Promise<Valuer | null> {
    const result = await query(
      `SELECT * FROM valuers WHERE id = $1`,
      [valuerId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToValuer(result.rows[0]);
  }

  /**
   * Get valuer by user ID
   */
  async getValuerByUserId(userId: string): Promise<Valuer | null> {
    const result = await query(
      `SELECT * FROM valuers WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToValuer(result.rows[0]);
  }

  /**
   * Get valuer credentials (for display/verification)
   */
  async getValuerCredentials(valuerId: string): Promise<ValuerCredentials | null> {
    const valuer = await this.getValuerById(valuerId);
    
    if (!valuer) {
      return null;
    }

    const issues: string[] = [];
    const now = new Date();

    // Check license validity
    const licenseValid = valuer.license_status === 'active' && 
      (!valuer.license_valid_until || valuer.license_valid_until > now);
    
    if (!licenseValid) {
      issues.push('License is expired or inactive');
    }

    // Check PI insurance validity
    const piValid = valuer.pi_valid_until ? valuer.pi_valid_until > now : false;
    const piInsured = !!valuer.pi_provider && !!valuer.pi_policy_number;

    if (!piInsured || !piValid) {
      issues.push('Professional indemnity insurance is missing or expired');
    }

    // Check signature
    const hasSignature = !!valuer.signature_storage_key;
    if (!hasSignature) {
      issues.push('No signature on file');
    }

    // Valuer can approve if license is valid and has signature
    const canApprove = licenseValid && hasSignature && valuer.is_active;

    return {
      id: valuer.id,
      name: valuer.name,
      title: valuer.title,
      qualifications: valuer.qualifications,
      license_number: valuer.license_number,
      license_issuer: valuer.license_issuer,
      license_status: valuer.license_status,
      license_valid: licenseValid,
      pi_insured: piInsured,
      pi_valid: piValid,
      has_signature: hasSignature,
      can_approve: canApprove,
      issues,
    };
  }

  /**
   * Update valuer signature
   */
  async updateValuerSignature(
    valuerId: string, 
    signatureStorageKey: string
  ): Promise<boolean> {
    const result = await query(
      `UPDATE valuers 
       SET signature_storage_key = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id`,
      [signatureStorageKey, valuerId]
    );

    return result.rows.length > 0;
  }

  /**
   * List all active valuers
   */
  async listActiveValuers(): Promise<Valuer[]> {
    const result = await query(
      `SELECT * FROM valuers 
       WHERE is_active = true
       ORDER BY name ASC`
    );

    return result.rows.map(row => this.mapRowToValuer(row));
  }

  // ---------------------------------------------------
  // APPROVAL WORKFLOW
  // ---------------------------------------------------

  /**
   * Check if report can be approved
   */
  async canApprove(reportId: string): Promise<{ canApprove: boolean; reasons: string[] }> {
    const reasons: string[] = [];

    // Get report
    const reportResult = await query(
      `SELECT r.*, vr.status as valuation_status
       FROM valuation_reports r
       LEFT JOIN valuations vr ON r.valuation_id = vr.id
       WHERE r.id = $1`,
      [reportId]
    );

    if (reportResult.rows.length === 0) {
      return { canApprove: false, reasons: ['Report not found'] };
    }

    const report = reportResult.rows[0];

    // Check report status — allow draft, pending_review, and approved (re-signing)
    if (report.status === 'superseded') {
      reasons.push(`Report is superseded and cannot be approved`);
    }

    // Check if DOCX has been generated
    const content = typeof report.content === 'string' 
      ? JSON.parse(report.content) 
      : report.content || {};

    if (!report.docx_storage_key && !content.storage_key) {
      reasons.push('Report document has not been generated');
    }

    // Check valuation status
    if (!['completed', 'approved', 'reviewed', 'pending_review'].includes(report.valuation_status)) {
      reasons.push(`Valuation must be completed first (current: ${report.valuation_status})`);
    }

    return {
      canApprove: reasons.length === 0,
      reasons,
    };
  }

  /**
   * Approve a report
   */
  async approveReport(request: ApprovalRequest): Promise<ApprovalResult> {
    const { reportId, valuerId, comments } = request;

    try {
      // Verify valuer can approve
      const credentials = await this.getValuerCredentials(valuerId);
      if (!credentials) {
        return {
          success: false,
          reportId,
          status: 'rejected',
          error: 'Valuer not found',
        };
      }

      if (!credentials.can_approve) {
        return {
          success: false,
          reportId,
          status: 'rejected',
          error: `Cannot approve: ${credentials.issues.join(', ')}`,
        };
      }

      // Check if report can be approved
      const approvalCheck = await this.canApprove(reportId);
      if (!approvalCheck.canApprove) {
        return {
          success: false,
          reportId,
          status: 'rejected',
          error: `Cannot approve: ${approvalCheck.reasons.join(', ')}`,
        };
      }

      // Generate digital seal hash
      const sealData = `${reportId}:${valuerId}:${new Date().toISOString()}`;
      const crypto = await import('crypto');
      const digitalSealHash = crypto
        .createHash('sha256')
        .update(sealData)
        .digest('hex');

      // Generate verification URL
      const verificationUrl = `${this.verificationBaseUrl}/verify/${reportId}`;

      // Update report
      const now = new Date();
      const result = await query(
        `UPDATE valuation_reports 
         SET status = 'approved',
             approved_at = $1,
             approved_by = $2,
             digital_seal_hash = $3,
             verification_url = $4,
             updated_at = $1
         WHERE id = $5
         RETURNING *`,
        [now, valuerId, digitalSealHash, verificationUrl, reportId]
      );

      if (result.rows.length === 0) {
        throw new Error('Failed to update report');
      }

      // Log approval in audit trail
      await this.logApproval(reportId, valuerId, 'approved', comments);

      logger.info('Report approved', {
        reportId,
        valuerId,
        digitalSealHash,
      });

      // ===================================================================
      // Phase 3: Trigger client e-sign workflow if requested
      // ===================================================================
      if (request.sendToClient) {
        try {
          await this.triggerClientEsign(reportId, request.clientEmail, request.clientName);
          logger.info('Client e-sign workflow triggered', { reportId });
        } catch (esignError: any) {
          // Don't fail the approval if e-sign fails, just log it
          logger.error('Failed to trigger client e-sign', {
            reportId,
            error: esignError.message,
          });
        }
      }

      return {
        success: true,
        reportId,
        status: 'approved',
        approvedAt: now,
        approvedBy: valuerId,
        digitalSealHash,
        verificationUrl,
      };
    } catch (error: any) {
      logger.error('Report approval failed', {
        reportId,
        valuerId,
        error: error.message,
      });

      return {
        success: false,
        reportId,
        status: 'rejected',
        error: error.message,
      };
    }
  }

  /**
   * Reject a report (send back for revision)
   */
  async rejectReport(
    reportId: string, 
    valuerId: string, 
    reason: string
  ): Promise<ApprovalResult> {
    try {
      // Update report status back to draft
      await query(
        `UPDATE valuation_reports 
         SET status = 'draft',
             updated_at = NOW()
         WHERE id = $1`,
        [reportId]
      );

      // Log rejection in audit trail
      await this.logApproval(reportId, valuerId, 'rejected', reason);

      logger.info('Report rejected', { reportId, valuerId, reason });

      return {
        success: true,
        reportId,
        status: 'rejected',
      };
    } catch (error: any) {
      logger.error('Report rejection failed', {
        reportId,
        error: error.message,
      });

      return {
        success: false,
        reportId,
        status: 'rejected',
        error: error.message,
      };
    }
  }

  /**
   * Lock a report (prevent further edits)
   */
  async lockReport(reportId: string): Promise<boolean> {
    const result = await query(
      `UPDATE valuation_reports 
       SET status = 'approved',
           updated_at = NOW()
       WHERE id = $1 AND status = 'pending_review'
       RETURNING id`,
      [reportId]
    );

    return result.rows.length > 0;
  }

  /**
   * Check if report is locked
   */
  async isReportLocked(reportId: string): Promise<boolean> {
    const result = await query(
      `SELECT status FROM valuation_reports WHERE id = $1`,
      [reportId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    return result.rows[0].status === 'approved' || result.rows[0].status === 'superseded';
  }

  /**
   * Submit report for approval (draft → pending_review)
   */
  async submitForApproval(reportId: string, userId?: string): Promise<boolean> {
    const result = await query(
      `UPDATE valuation_reports 
       SET status = 'pending_review',
           updated_at = NOW()
       WHERE id = $1 AND status = 'draft'
       RETURNING id`,
      [reportId]
    );

    if (result.rows.length > 0) {
      await this.logApproval(reportId, userId || null, 'submitted');
    }

    return result.rows.length > 0;
  }

  // ---------------------------------------------------
  // VERIFICATION
  // ---------------------------------------------------

  /**
   * Verify a report by hash
   */
  async verifyByHash(hash: string): Promise<{
    valid: boolean;
    report?: any;
    valuer?: ValuerCredentials;
    error?: string;
  }> {
    const result = await query(
      `SELECT r.*, v.id as valuer_id
       FROM valuation_reports r
       LEFT JOIN valuers v ON r.approved_by = v.id
       WHERE r.digital_seal_hash = $1`,
      [hash]
    );

    if (result.rows.length === 0) {
      return { valid: false, error: 'No report found with this verification hash' };
    }

    const report = result.rows[0];
    let valuer: ValuerCredentials | null = null;

    if (report.valuer_id) {
      valuer = await this.getValuerCredentials(report.valuer_id);
    }

    return {
      valid: true,
      report: {
        id: report.id,
        status: report.status,
        template: report.template,
        version: report.version,
        approved_at: report.approved_at,
        verification_url: report.verification_url,
      },
      valuer: valuer || undefined,
    };
  }

  /**
   * Verify report by ID
   */
  async verifyReportById(reportId: string): Promise<{
    valid: boolean;
    status: string;
    approved_at?: Date;
    approved_by?: string;
    digital_seal_hash?: string;
    verification_url?: string;
    valuer?: ValuerCredentials;
    error?: string;
  }> {
    const result = await query(
      `SELECT r.*, v.id as valuer_id
       FROM valuation_reports r
       LEFT JOIN valuers v ON r.approved_by = v.id
       WHERE r.id = $1`,
      [reportId]
    );

    if (result.rows.length === 0) {
      return { valid: false, status: 'not_found', error: 'Report not found' };
    }

    const report = result.rows[0];
    let valuer: ValuerCredentials | null = null;

    if (report.valuer_id) {
      valuer = await this.getValuerCredentials(report.valuer_id);
    }

    return {
      valid: report.status === 'approved',
      status: report.status,
      approved_at: report.approved_at,
      approved_by: report.approved_by,
      digital_seal_hash: report.digital_seal_hash,
      verification_url: report.verification_url,
      valuer: valuer || undefined,
    };
  }

  // ---------------------------------------------------
  // AUDIT LOGGING
  // ---------------------------------------------------

  private async logApproval(
    reportId: string,
    valuerId: string | null,
    action: string,
    details?: string
  ): Promise<void> {
    await query(
      `INSERT INTO report_audit_log (id, report_id, action, user_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        uuidv4(),
        reportId,
        action,
        valuerId,
        details ? JSON.stringify({ notes: details }) : null,
      ]
    );
  }

  // ---------------------------------------------------
  // HELPER METHODS
  // ---------------------------------------------------

  private mapRowToValuer(row: any): Valuer {
    return {
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      qualifications: row.qualifications,
      title: row.title,
      license_number: row.license_number,
      license_issuer: row.license_issuer,
      license_valid_until: row.license_valid_until,
      license_status: row.license_status || 'active',
      pi_provider: row.pi_provider,
      pi_policy_number: row.pi_policy_number,
      pi_coverage: row.pi_coverage ? parseFloat(row.pi_coverage) : null,
      pi_valid_until: row.pi_valid_until,
      contact_address: row.contact_address,
      contact_email: row.contact_email,
      contact_phone: row.contact_phone,
      signature_storage_key: row.signature_storage_key,
      company_name: row.company_name,
      company_address: row.company_address,
      is_active: row.is_active ?? true,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  // ---------------------------------------------------
  // E-SIGN INTEGRATION (Phase 3)
  // ---------------------------------------------------

  /**
   * Trigger client e-sign workflow for an approved valuation report
   * Creates an envelope and sends it to the client for acknowledgment signature
   */
  async triggerClientEsign(
    reportId: string,
    clientEmailOverride?: string,
    clientNameOverride?: string
  ): Promise<{ envelopeId: string; signingUrl: string } | null> {
    try {
      // Get report details
      const reportResult = await query(
        `SELECT 
           r.*,
           v.id as valuation_id,
           v.property_id,
           p.title as property_title,
           p.address as property_address,
           p.gps_address as property_gps_address
         FROM valuation_reports r
         JOIN valuations v ON r.valuation_id = v.id
         JOIN properties p ON v.property_id = p.id
         WHERE r.id = $1`,
        [reportId]
      );

      if (reportResult.rows.length === 0) {
        throw new Error(`Report not found: ${reportId}`);
      }

      const report = reportResult.rows[0];

      // Get client info from engagement or use override
      let clientEmail = clientEmailOverride;
      let clientName = clientNameOverride;

      if (!clientEmail || !clientName) {
        const engagementResult = await query(
          `SELECT client_name, client_email 
           FROM valuation_engagements 
           WHERE valuation_id = $1 
           LIMIT 1`,
          [report.valuation_id]
        );

        if (engagementResult.rows.length > 0) {
          clientEmail = clientEmail || engagementResult.rows[0].client_email;
          clientName = clientName || engagementResult.rows[0].client_name;
        }
      }

      if (!clientEmail) {
        throw new Error('No client email available for e-sign');
      }
      if (!clientName) {
        clientName = 'Client';
      }

      // Get report PDF content
      const content = typeof report.content === 'string'
        ? JSON.parse(report.content)
        : report.content || {};

      if (!content.pdf_storage_key && !content.storage_key && !report.docx_storage_key) {
        throw new Error('Report PDF has not been generated');
      }

      // Fetch PDF from storage
      const storageKey = content.pdf_storage_key || content.storage_key || report.docx_storage_key;
      const pdfBuffer = await this.fetchDocumentFromStorage(storageKey);

      // Get signature placement configuration
      const signatureConfig = await this.getReportSignatureConfig(report.template);

      // Build signature fields
      const fields: ESignField[] = this.buildSignatureFields(
        clientEmail,
        signatureConfig
      );

      // Create envelope
      const propertyAddress = report.property_address || report.property_title || 'Property';
      const envelope = await eSignIntegrationService.createEnvelope({
        subject: `Valuation Report - ${propertyAddress}`,
        message: `Your valuation report for ${propertyAddress} is ready. Please review and sign to acknowledge receipt.`,
        documents: [{
          name: 'Valuation Report',
          content: pdfBuffer,
          mimeType: 'application/pdf',
          source: 'system_generated',
        }],
        signers: [{
          name: clientName,
          email: clientEmail,
          role: 'signer',
          order: 1,
        }],
        fields,
        sourceModule: 'valuation',
        sourceEntityType: 'valuation_report',
        sourceEntityId: reportId,
        expiresInDays: 30,
      });

      // Update report with envelope reference
      await query(
        `UPDATE valuation_reports 
         SET client_esign_envelope_id = $1,
             client_esign_status = 'sent',
             client_email = $2,
             client_name = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [envelope.envelopeId, clientEmail, clientName, reportId]
      );

      // Log audit event
      await this.logReportEsignAudit(reportId, envelope.envelopeId, 'esign_triggered', {
        clientEmail,
        clientName,
        propertyAddress,
      });

      logger.info('Client e-sign envelope created for valuation report', {
        reportId,
        envelopeId: envelope.envelopeId,
        clientEmail,
      });

      return {
        envelopeId: envelope.envelopeId,
        signingUrl: envelope.signingUrls?.[clientEmail] || '',
      };
    } catch (error: any) {
      logger.error('Failed to trigger client e-sign for report', {
        reportId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Handle e-sign completion webhook for valuation reports
   */
  async handleEsignCompletion(event: CompletionEvent): Promise<void> {
    const { envelope, sourceContext, documents, signers } = event;

    if (sourceContext.entityType !== 'valuation_report') {
      logger.warn('Invalid entity type for valuation e-sign completion', {
        expected: 'valuation_report',
        received: sourceContext.entityType,
      });
      return;
    }

    const reportId = sourceContext.entityId;

    try {
      // Get the signed document URL and certificate URL
      const signedDoc = documents?.[0];
      const signer = signers?.[0];

      // Update report with completion info
      await query(
        `UPDATE valuation_reports 
         SET client_esign_status = 'completed',
             client_acknowledged_at = $1,
             signed_report_url = $2,
             esign_certificate_url = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [
          signer?.signedAt ? new Date(signer.signedAt) : new Date(),
          signedDoc?.signedUrl || null,
          signedDoc?.certificateUrl || null,
          reportId,
        ]
      );

      // Log audit event
      await this.logReportEsignAudit(reportId, envelope.id, 'client_signed', {
        clientEmail: signer?.email,
        signedAt: signer?.signedAt,
        pmtId: signer?.pmtId,
        ipAddress: signer?.ipAddress,
      }, signer?.email, signer?.ipAddress);

      logger.info('Valuation report client acknowledgment completed', {
        reportId,
        envelopeId: envelope.id,
        clientEmail: signer?.email,
      });
    } catch (error: any) {
      logger.error('Failed to process valuation report e-sign completion', {
        reportId,
        envelopeId: envelope.id,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get signature configuration for a report template
   */
  private async getReportSignatureConfig(template: string): Promise<{
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    fields: any[];
  }> {
    try {
      // Try to get org-specific config (would need org_id in context)
      // For now, return sensible defaults based on template
      const defaults: Record<string, { page: number; x: number; y: number }> = {
        ghis_standard: { page: 1, x: 0.60, y: 0.20 },
        rics_residential: { page: 1, x: 0.60, y: 0.15 },
        rics_commercial: { page: 1, x: 0.60, y: 0.15 },
        bank_mortgage: { page: 1, x: 0.55, y: 0.20 },
        insurance: { page: 1, x: 0.55, y: 0.20 },
        custom: { page: 1, x: 0.60, y: 0.20 },
      };

      const config = defaults[template] || defaults.ghis_standard;

      return {
        ...config,
        width: 0.25,
        height: 0.08,
        fields: [
          { type: 'signature', ...config, width: 0.25, height: 0.08, required: true },
          { type: 'date', page: config.page, x: config.x, y: config.y + 0.10, width: 0.15, height: 0.04, required: true },
        ],
      };
    } catch (error) {
      // Return safe defaults
      return {
        page: 1,
        x: 0.60,
        y: 0.20,
        width: 0.25,
        height: 0.08,
        fields: [
          { type: 'signature', page: 1, x: 0.60, y: 0.20, width: 0.25, height: 0.08, required: true },
          { type: 'date', page: 1, x: 0.60, y: 0.30, width: 0.15, height: 0.04, required: true },
        ],
      };
    }
  }

  /**
   * Build e-sign fields from signature configuration
   */
  private buildSignatureFields(clientEmail: string, config: any): ESignField[] {
    return config.fields.map((field: any) => ({
      type: field.type,
      recipientEmail: clientEmail,
      documentIndex: 0,
      page: field.page,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      required: field.required ?? true,
      label: field.label,
    }));
  }

  /**
   * Fetch document from storage service
   */
  private async fetchDocumentFromStorage(storageKey: string): Promise<Buffer> {
    // Import document service dynamically to avoid circular deps
    const { documentService } = await import('../../../shared-services/document-service');
    
    const { buffer } = await documentService.storage.download(storageKey);
    return buffer;
  }

  /**
   * Log e-sign audit event for reports
   */
  private async logReportEsignAudit(
    reportId: string,
    envelopeId: string | null,
    eventType: string,
    eventData: Record<string, any>,
    clientEmail?: string,
    ipAddress?: string
  ): Promise<void> {
    await query(
      `INSERT INTO report_esign_audit (
        id, report_id, envelope_id, event_type, event_data, client_email, client_ip_address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        uuidv4(),
        reportId,
        envelopeId,
        eventType,
        JSON.stringify(eventData),
        clientEmail || null,
        ipAddress || null,
      ]
    );
  }
}

// Export singleton instance
export const approvalService = new ApprovalService();
