/**
 * Report Service
 * 
 * Manages valuation report lifecycle: create, read, update, delete, approve.
 * Implements RICS/GhIS compliant report management with audit logging.
 * 
 * Phase 1: Basic CRUD operations for report records
 * Phase 2: DOCX generation with docxtemplater
 * Phase 3: OnlyOffice integration for editing
 * Phase 4: Digital signatures and PDF generation
 */

import { query } from '../../database';
import { logger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

// =====================================================
// TYPES
// =====================================================

export type ReportStatus = 
  | 'draft' 
  | 'pending_review' 
  | 'approved' 
  | 'superseded';

export type ReportTemplate = 
  | 'ghis_standard' 
  | 'rics_residential' 
  | 'rics_commercial' 
  | 'bank_mortgage' 
  | 'insurance'
  | 'custom';

export type PhotoCategory = 
  | 'exterior' 
  | 'interior' 
  | 'amenities' 
  | 'neighbourhood' 
  | 'damage';

export type AuditAction =
  | 'created'
  | 'updated'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'downloaded'
  | 'superseded';

// =====================================================
// INTERFACES
// =====================================================

export interface ReportOptions {
  include_comparables?: boolean;
  include_market_analysis?: boolean;
  include_photos?: boolean;
  include_floor_plans?: boolean;
  include_maps?: boolean;
  language?: 'en' | 'fr';
  currency?: 'GHS' | 'USD';
  secondary_currency?: 'GHS' | 'USD' | null;
}

export interface CreateReportInput {
  valuation_id: string;
  template?: ReportTemplate;
  options?: ReportOptions;
}

export interface UpdateReportInput {
  sections?: Record<string, any>;
  content?: Record<string, any>;
}

export interface ValuationReport {
  id: string;
  valuation_id: string;
  status: ReportStatus;
  template: ReportTemplate;
  version: number;
  docx_url: string | null;
  pdf_url: string | null;
  content: Record<string, any>;
  options: ReportOptions;
  created_at: Date;
  updated_at: Date;
  approved_at: Date | null;
  approved_by: string | null;
  expires_at: Date | null;
  digital_seal_hash: string | null;
  verification_url: string | null;
}

export interface ReportPhoto {
  id: string;
  report_id: string;
  storage_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  category: PhotoCategory;
  display_order: number;
  created_at: Date;
  file_size_bytes: number | null;
}

export interface Valuer {
  id: string;
  name: string;
  qualifications: string | null;
  license_number: string | null;
  company_name: string | null;
  company_address: string | null;
  email: string | null;
  phone: string | null;
  signature_url: string | null;
  is_active: boolean;
}

export interface ReportWithValuer extends ValuationReport {
  valuer?: Valuer;
}

export interface ReportListFilters {
  status?: ReportStatus;
  template?: ReportTemplate;
  valuation_id?: string;
  valuer_id?: string;
  from_date?: Date;
  to_date?: Date;
  page?: number;
  limit?: number;
}

export interface PaginatedReports {
  reports: ReportWithValuer[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// =====================================================
// DEFAULT OPTIONS
// =====================================================

const DEFAULT_REPORT_OPTIONS: ReportOptions = {
  include_comparables: true,
  include_market_analysis: true,
  include_photos: true,
  include_floor_plans: true,
  include_maps: true,
  language: 'en',
  currency: 'GHS',
  secondary_currency: 'USD',
};

// =====================================================
// REPORT SERVICE CLASS
// =====================================================

export class ReportService {
  
  // ---------------------------------------------------
  // CREATE OPERATIONS
  // ---------------------------------------------------

  /**
   * Create a new draft report from a valuation
   */
  async createReport(input: CreateReportInput, userId?: string): Promise<ValuationReport> {
    const reportId = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    const options = {
      ...DEFAULT_REPORT_OPTIONS,
      ...input.options,
    };

    // Verify valuation exists and is completed
    const valuationCheck = await query(
      `SELECT id, status FROM valuations WHERE id = $1`,
      [input.valuation_id]
    );

    if (valuationCheck.rows.length === 0) {
      throw new Error(`Valuation not found: ${input.valuation_id}`);
    }

    const valuation = valuationCheck.rows[0];
    // Allow report generation for valuations that have gone through reconciliation
    // Status can be: pending_review (after reconciliation), completed, approved, reviewed
    const allowedStatuses = ['pending_review', 'completed', 'approved', 'reviewed', 'in_progress'];
    if (!allowedStatuses.includes(valuation.status)) {
      throw new Error(`Valuation must be completed before generating a report. Current status: ${valuation.status}`);
    }

    // Check for existing draft reports
    const existingDraft = await query(
      `SELECT id FROM valuation_reports 
       WHERE valuation_id = $1 AND status = 'draft'
       ORDER BY created_at DESC LIMIT 1`,
      [input.valuation_id]
    );

    if (existingDraft.rows.length > 0) {
      logger.warn('Existing draft report found', {
        valuationId: input.valuation_id,
        existingReportId: existingDraft.rows[0].id,
      });
      // Could either return existing or throw - for now, throw
      throw new Error(`A draft report already exists for this valuation. Report ID: ${existingDraft.rows[0].id}`);
    }

    // Create the report
    const result = await query(
      `INSERT INTO valuation_reports (
        id, valuation_id, status, template, version,
        content, options, expires_at, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        reportId,
        input.valuation_id,
        'draft',
        input.template || 'ghis_standard',
        1,
        JSON.stringify({}),
        JSON.stringify(options),
        expiresAt,
        userId || null,
      ]
    );

    const report = this.mapRowToReport(result.rows[0]);

    // Log audit trail
    await this.logAuditEvent(reportId, 'created', userId, {
      template: report.template,
      options,
    });

    logger.info('Report created', {
      reportId,
      valuationId: input.valuation_id,
      template: report.template,
    });

    return report;
  }

  // ---------------------------------------------------
  // READ OPERATIONS
  // ---------------------------------------------------

  /**
   * Get a report by ID with optional valuer info
   */
  async getReportById(reportId: string): Promise<ReportWithValuer | null> {
    const result = await query(
      `SELECT 
        r.*,
        v.id as valuer_id,
        v.name as valuer_name,
        v.qualifications as valuer_qualifications,
        v.license_number as valuer_license_number,
        v.company_name as valuer_company_name,
        v.contact_address as valuer_company_address,
        v.contact_email as valuer_email,
        v.contact_phone as valuer_phone,
        v.signature_storage_key as valuer_signature_url,
        v.is_active as valuer_is_active
      FROM valuation_reports r
      LEFT JOIN valuers v ON r.approved_by = v.user_id
      WHERE r.id = $1`,
      [reportId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const report = this.mapRowToReport(row);
    
    // Add valuer if present
    if (row.valuer_id) {
      return {
        ...report,
        valuer: {
          id: row.valuer_id,
          name: row.valuer_name,
          qualifications: row.valuer_qualifications,
          license_number: row.valuer_license_number,
          company_name: row.valuer_company_name,
          company_address: row.valuer_company_address,
          email: row.valuer_email,
          phone: row.valuer_phone,
          signature_url: row.valuer_signature_url,
          is_active: row.valuer_is_active,
        },
      };
    }

    return report;
  }

  /**
   * Get reports for a valuation
   */
  async getReportsForValuation(valuationId: string): Promise<ValuationReport[]> {
    const result = await query(
      `SELECT * FROM valuation_reports 
       WHERE valuation_id = $1 
       ORDER BY version DESC, created_at DESC`,
      [valuationId]
    );

    return result.rows.map(row => this.mapRowToReport(row));
  }

  /**
   * List reports with filters and pagination
   */
  async listReports(filters: ReportListFilters = {}): Promise<PaginatedReports> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.status) {
      conditions.push(`r.status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (filters.template) {
      conditions.push(`r.template = $${paramIndex++}`);
      params.push(filters.template);
    }

    if (filters.valuation_id) {
      conditions.push(`r.valuation_id = $${paramIndex++}`);
      params.push(filters.valuation_id);
    }

    if (filters.from_date) {
      conditions.push(`r.created_at >= $${paramIndex++}`);
      params.push(filters.from_date);
    }

    if (filters.to_date) {
      conditions.push(`r.created_at <= $${paramIndex++}`);
      params.push(filters.to_date);
    }

    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}` 
      : '';

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM valuation_reports r ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Get paginated results
    const result = await query(
      `SELECT r.*, v.name as valuer_name, v.license_number as valuer_license_number
       FROM valuation_reports r
       LEFT JOIN valuers v ON r.approved_by = v.user_id
       ${whereClause}
       ORDER BY r.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, limit, offset]
    );

    const reports = result.rows.map(row => {
      const report = this.mapRowToReport(row);
      if (row.valuer_name) {
        return {
          ...report,
          valuer: {
            id: row.approved_by,
            name: row.valuer_name,
            qualifications: null,
            license_number: row.valuer_license_number,
            company_name: null,
            company_address: null,
            email: null,
            phone: null,
            signature_url: null,
            is_active: true,
          },
        } as ReportWithValuer;
      }
      return report;
    });

    return {
      reports,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ---------------------------------------------------
  // UPDATE OPERATIONS
  // ---------------------------------------------------

  /**
   * Update a draft report's content
   */
  async updateReport(
    reportId: string, 
    input: UpdateReportInput, 
    userId?: string
  ): Promise<ValuationReport> {
    // First, check report exists and is editable
    const existing = await this.getReportById(reportId);
    
    if (!existing) {
      throw new Error(`Report not found: ${reportId}`);
    }

    if (existing.status !== 'draft') {
      throw new Error(`Cannot update report with status: ${existing.status}. Only draft reports can be edited.`);
    }

    // Merge content updates
    const updatedContent = {
      ...existing.content,
      ...input.content,
      sections: {
        ...(existing.content.sections || {}),
        ...(input.sections || {}),
      },
    };

    const result = await query(
      `UPDATE valuation_reports 
       SET content = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(updatedContent), reportId]
    );

    const report = this.mapRowToReport(result.rows[0]);

    // Log audit trail
    await this.logAuditEvent(reportId, 'updated', userId, {
      updatedSections: Object.keys(input.sections || {}),
    });

    logger.info('Report updated', { reportId });

    return report;
  }

  /**
   * Supersede a report (create new version)
   */
  async supersede(reportId: string, userId?: string): Promise<ValuationReport> {
    const existing = await this.getReportById(reportId);
    
    if (!existing) {
      throw new Error(`Report not found: ${reportId}`);
    }

    if (existing.status !== 'approved') {
      throw new Error('Only approved reports can be superseded');
    }

    // Mark current report as superseded
    await query(
      `UPDATE valuation_reports SET status = 'superseded' WHERE id = $1`,
      [reportId]
    );

    await this.logAuditEvent(reportId, 'superseded', userId);

    // Create new version
    const newReportId = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const result = await query(
      `INSERT INTO valuation_reports (
        id, valuation_id, status, template, version,
        content, options, expires_at, created_by
      ) VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        newReportId,
        existing.valuation_id,
        existing.template,
        existing.version + 1,
        JSON.stringify(existing.content),
        JSON.stringify(existing.options),
        expiresAt,
        userId || null,
      ]
    );

    const newReport = this.mapRowToReport(result.rows[0]);

    await this.logAuditEvent(newReportId, 'created', userId, {
      previousVersion: reportId,
      version: newReport.version,
    });

    logger.info('Report superseded', {
      oldReportId: reportId,
      newReportId,
      version: newReport.version,
    });

    return newReport;
  }

  // ---------------------------------------------------
  // DELETE OPERATIONS
  // ---------------------------------------------------

  /**
   * Delete a draft report
   */
  async deleteReport(reportId: string, userId?: string): Promise<boolean> {
    const existing = await this.getReportById(reportId);
    
    if (!existing) {
      throw new Error(`Report not found: ${reportId}`);
    }

    if (existing.status !== 'draft') {
      throw new Error(`Cannot delete report with status: ${existing.status}. Only draft reports can be deleted.`);
    }

    // Delete associated photos first
    await query(
      `DELETE FROM report_photos WHERE report_id = $1`,
      [reportId]
    );

    // Delete the report
    await query(
      `DELETE FROM valuation_reports WHERE id = $1`,
      [reportId]
    );

    logger.info('Report deleted', { reportId });

    return true;
  }

  // ---------------------------------------------------
  // PHOTO OPERATIONS
  // ---------------------------------------------------

  /**
   * Add a photo to a report
   */
  async addPhoto(
    reportId: string,
    storageUrl: string,
    category: PhotoCategory,
    caption?: string,
    thumbnailUrl?: string,
    fileSizeBytes?: number
  ): Promise<ReportPhoto> {
    // Get the next display order
    const orderResult = await query(
      `SELECT COALESCE(MAX(display_order), 0) + 1 as next_order 
       FROM report_photos WHERE report_id = $1`,
      [reportId]
    );
    const displayOrder = orderResult.rows[0].next_order;

    const photoId = uuidv4();

    const result = await query(
      `INSERT INTO report_photos (
        id, report_id, storage_url, thumbnail_url, caption, 
        category, display_order, file_size_bytes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        photoId,
        reportId,
        storageUrl,
        thumbnailUrl || null,
        caption || null,
        category,
        displayOrder,
        fileSizeBytes || null,
      ]
    );

    return this.mapRowToPhoto(result.rows[0]);
  }

  /**
   * Get photos for a report
   */
  async getPhotos(reportId: string): Promise<ReportPhoto[]> {
    const result = await query(
      `SELECT * FROM report_photos 
       WHERE report_id = $1 
       ORDER BY display_order ASC`,
      [reportId]
    );

    return result.rows.map(row => this.mapRowToPhoto(row));
  }

  /**
   * Reorder photos
   */
  async reorderPhotos(reportId: string, photoOrder: string[]): Promise<void> {
    // Update each photo's display order
    for (let i = 0; i < photoOrder.length; i++) {
      await query(
        `UPDATE report_photos 
         SET display_order = $1 
         WHERE id = $2 AND report_id = $3`,
        [i + 1, photoOrder[i], reportId]
      );
    }
  }

  /**
   * Delete a photo
   */
  async deletePhoto(reportId: string, photoId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM report_photos 
       WHERE id = $1 AND report_id = $2
       RETURNING id`,
      [photoId, reportId]
    );

    return result.rows.length > 0;
  }

  // ---------------------------------------------------
  // AUDIT LOGGING
  // ---------------------------------------------------

  /**
   * Log an audit event
   */
  private async logAuditEvent(
    reportId: string,
    action: AuditAction,
    userId?: string,
    details?: Record<string, any>
  ): Promise<void> {
    await query(
      `INSERT INTO report_audit_log (
        id, report_id, action, user_id, details
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        uuidv4(),
        reportId,
        action,
        userId || null,
        details ? JSON.stringify(details) : null,
      ]
    );
  }

  /**
   * Get audit log for a report
   */
  async getAuditLog(reportId: string): Promise<any[]> {
    const result = await query(
      `SELECT * FROM report_audit_log 
       WHERE report_id = $1 
       ORDER BY created_at DESC`,
      [reportId]
    );

    return result.rows;
  }

  // ---------------------------------------------------
  // HELPER METHODS
  // ---------------------------------------------------

  private mapRowToReport(row: any): ValuationReport {
    return {
      id: row.id,
      valuation_id: row.valuation_id,
      status: row.status,
      template: row.template,
      version: row.version,
      docx_url: row.docx_storage_key,
      pdf_url: row.pdf_storage_key,
      content: typeof row.content === 'string' ? JSON.parse(row.content) : row.content || {},
      options: typeof row.options === 'string' ? JSON.parse(row.options) : row.options || {},
      created_at: row.created_at,
      updated_at: row.updated_at,
      approved_at: row.approved_at,
      approved_by: row.approved_by,
      expires_at: row.expires_at,
      digital_seal_hash: row.digital_seal_hash,
      verification_url: row.verification_url,
    };
  }

  private mapRowToPhoto(row: any): ReportPhoto {
    return {
      id: row.id,
      report_id: row.report_id,
      storage_url: row.storage_url,
      thumbnail_url: row.thumbnail_url,
      caption: row.caption,
      category: row.category,
      display_order: row.display_order,
      created_at: row.created_at,
      file_size_bytes: row.file_size_bytes,
    };
  }
}

// Export singleton instance
export const reportService = new ReportService();
