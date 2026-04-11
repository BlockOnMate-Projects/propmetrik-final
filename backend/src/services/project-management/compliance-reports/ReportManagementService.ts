/**
 * Report Management Service
 * 
 * Phase 3.9: Split complianceReportService
 * 
 * Manages compliance reports:
 * - Report generation orchestration
 * - Report storage and retrieval
 * - E-sign integration
 * - Report history
 * 
 * @module services/project-management/compliance-reports/ReportManagementService
 */

import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../../database';
import { BaseService } from '../../../../shared-services/base/BaseService';
import { reportDataService } from './ReportDataService';
import { reportGeneratorService } from './ReportGeneratorService';
import {
  ComplianceReport,
  GenerateReportInput,
} from './types';

// =============================================================================
// TYPES
// =============================================================================

interface StorageService {
  uploadFile(params: {
    buffer: Buffer;
    filename: string;
    contentType: string;
    folder: string;
  }): Promise<{ url: string; key: string }>;
}

interface SigningService {
  createSigningRequest(params: {
    documentUrl: string;
    title: string;
    description: string;
    signees: Array<{
      name: string;
      email: string;
      role: string;
      order?: number;
    }>;
    createdBy: string;
  }): Promise<{ id: string; signingUrl: string }>;
}

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class ReportManagementServiceImpl extends BaseService {
  private storageService: StorageService | null = null;
  private signingService: SigningService | null = null;

  constructor() {
    super('ReportManagementService');
  }

  /**
   * Set storage service dependency
   */
  setStorageService(service: StorageService): void {
    this.storageService = service;
  }

  /**
   * Set signing service dependency
   */
  setSigningService(service: SigningService): void {
    this.signingService = service;
  }

  /**
   * Generate a compliance report
   */
  async generateReport(input: GenerateReportInput): Promise<ComplianceReport> {
    const reportId = uuidv4();
    const startTime = Date.now();

    try {
      // Gather all report data
      const reportData = await reportDataService.gatherReportData(input);

      // Generate PDF
      const pdfBuffer = await reportGeneratorService.buildPDF(reportData, input);

      // Upload to storage if available
      let fileUrl = '';
      let fileKey = '';
      if (this.storageService) {
        const filename = `compliance-report-${input.projectId}-${Date.now()}.pdf`;
        const result = await this.storageService.uploadFile({
          buffer: pdfBuffer,
          filename,
          contentType: 'application/pdf',
          folder: `projects/${input.projectId}/compliance-reports`,
        });
        fileUrl = result.url;
        fileKey = result.key;
      }

      // Create signing request if needed
      let signingRequestId: string | undefined;
      if (input.forSigning && input.signees && input.signees.length > 0 && this.signingService) {
        const signingResult = await this.signingService.createSigningRequest({
          documentUrl: fileUrl,
          title: `Compliance Report - ${reportData.project.name}`,
          description: `Compliance status report generated on ${new Date().toLocaleDateString('en-GB')}`,
          signees: input.signees.map((s, i) => ({
            name: s.name!,
            email: s.email!,
            role: s.role || 'Signatory',
            order: i + 1,
          })),
          createdBy: input.generatedBy,
        });
        signingRequestId = signingResult.id;
      }

      // Save report record
      const report = await this.saveReport({
        id: reportId,
        projectId: input.projectId,
        fileUrl,
        fileKey,
        score: reportData.score,
        permitCount: reportData.permits.length,
        inspectionCount: reportData.inspections.length,
        expiringCount: reportData.expiringSoon?.length || 0,
        signingRequestId,
        generatedBy: input.generatedBy,
        generatedAt: new Date().toISOString(),
        generationTimeMs: Date.now() - startTime,
      });

      this.log('info', 'Compliance report generated', {
        reportId,
        projectId: input.projectId,
        pages: await this.getPageCount(pdfBuffer),
        sizeKb: Math.round(pdfBuffer.length / 1024),
        generationTimeMs: Date.now() - startTime,
      });

      return report;
    } catch (error) {
      this.log('error', 'Failed to generate compliance report', {
        projectId: input.projectId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Save report record to database
   */
  private async saveReport(data: {
    id: string;
    projectId: string;
    fileUrl: string;
    fileKey: string;
    score: any;
    permitCount: number;
    inspectionCount: number;
    expiringCount: number;
    signingRequestId?: string;
    generatedBy: string;
    generatedAt: string;
    generationTimeMs: number;
  }): Promise<ComplianceReport> {
    const result = await this.query(
      `INSERT INTO compliance_reports (
         id, project_id, file_url, file_key,
         compliance_score, permit_count, inspection_count, expiring_count,
         signing_request_id, generated_by, created_at, generation_time_ms
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        data.id,
        data.projectId,
        data.fileUrl,
        data.fileKey,
        JSON.stringify(data.score),
        data.permitCount,
        data.inspectionCount,
        data.expiringCount,
        data.signingRequestId,
        data.generatedBy,
        data.generatedAt,
        data.generationTimeMs,
      ]
    );

    return this.mapRowToReport(result.rows[0]);
  }

  /**
   * Get reports for a project
   */
  async getReportsByProject(projectId: string): Promise<ComplianceReport[]> {
    const result = await this.query(
      `SELECT cr.*, sr.status as signing_status
       FROM compliance_reports cr
       LEFT JOIN signing_requests sr ON cr.signing_request_id = sr.id
       WHERE cr.project_id = $1
       ORDER BY cr.created_at DESC`,
      [projectId]
    );

    return result.rows.map(row => this.mapRowToReport(row));
  }

  /**
   * Get a specific report by ID
   */
  async getReportById(reportId: string): Promise<ComplianceReport | null> {
    const result = await this.query(
      `SELECT cr.*, sr.status as signing_status, sr.completed_at as signed_at
       FROM compliance_reports cr
       LEFT JOIN signing_requests sr ON cr.signing_request_id = sr.id
       WHERE cr.id = $1`,
      [reportId]
    );

    if (!result.rows[0]) {
      return null;
    }

    return this.mapRowToReport(result.rows[0]);
  }

  /**
   * Delete a report
   */
  async deleteReport(reportId: string): Promise<boolean> {
    const report = await this.getReportById(reportId);
    if (!report) {
      return false;
    }

    // Delete from storage if available
    // (would call storageService.deleteFile here)

    await this.query(
      'DELETE FROM compliance_reports WHERE id = $1',
      [reportId]
    );

    return true;
  }

  /**
   * Get report statistics for a project
   */
  async getReportStats(projectId: string): Promise<{
    totalReports: number;
    lastReportDate: string | null;
    averageScore: number | null;
    signedCount: number;
  }> {
    const result = await this.query(
      `SELECT 
         COUNT(*) as total,
         MAX(created_at) as last_date,
         AVG((compliance_score->>'overall')::numeric) as avg_score,
         COUNT(*) FILTER (WHERE signing_status = 'completed') as signed_count
       FROM compliance_reports cr
       LEFT JOIN signing_requests sr ON cr.signing_request_id = sr.id
       WHERE cr.project_id = $1`,
      [projectId]
    );

    const row = result.rows[0];
    return {
      totalReports: parseInt(row.total) || 0,
      lastReportDate: row.last_date?.toISOString() || null,
      averageScore: row.avg_score ? parseFloat(row.avg_score) : null,
      signedCount: parseInt(row.signed_count) || 0,
    };
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  private mapRowToReport(row: any): ComplianceReport {
    return {
      id: row.id,
      projectId: row.project_id,
      fileUrl: row.file_url,
      fileKey: row.file_key,
      score: typeof row.compliance_score === 'string' 
        ? JSON.parse(row.compliance_score) 
        : row.compliance_score,
      permitCount: row.permit_count,
      inspectionCount: row.inspection_count,
      expiringCount: row.expiring_count,
      signingRequestId: row.signing_request_id,
      signingStatus: row.signing_status,
      signedAt: row.signed_at?.toISOString(),
      generatedBy: row.generated_by,
      generatedAt: row.created_at?.toISOString(),
      generationTimeMs: row.generation_time_ms,
    };
  }

  private async getPageCount(pdfBuffer: Buffer): Promise<number> {
    // Simple heuristic based on buffer size, actual would parse PDF
    return Math.max(1, Math.ceil(pdfBuffer.length / 50000));
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const reportManagementService = new ReportManagementServiceImpl();
