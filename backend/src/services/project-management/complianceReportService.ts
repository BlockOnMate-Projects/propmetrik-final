/**
 * Compliance Report Service
 * Phase 3: Compliance & Document Management
 * 
 * @deprecated This file is deprecated. Use the new modular compliance-reports module:
 * 
 * import { 
 *   complianceReportsFacade,
 *   reportDataService,
 *   reportGeneratorService,
 *   reportManagementService 
 * } from './compliance-reports';
 * 
 * The monolithic service has been split into:
 * - ReportDataService: Data gathering and compliance score calculation
 * - ReportGeneratorService: PDF generation with pdf-lib
 * - ReportManagementService: Orchestration, storage, e-sign integration
 * 
 * This file remains for backward compatibility and will be removed in a future version.
 * 
 * Generates comprehensive compliance reports as PDFs:
 * - Executive summary with compliance score
 * - Permit status breakdown
 * - Inspection log
 * - Regulatory timeline
 * - Gaps and recommendations
 * - E-Sign integration for stakeholder sign-off
 */

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib';
import { pool } from '../../database';
import { v4 as uuidv4 } from 'uuid';
import { complianceService, ProjectPermit, PermitInspection, ComplianceScore } from './complianceService';
import { projectService } from './projectService';
import { pdfSigningService } from '../../../shared-services/e-sign/pdfSigningService';
import { logger } from '../../utils/logger';
import { resolveReportBranding, hexToRgb, ResolvedBranding } from '../valuation-engine/brandingService';

/** Resolved branding surfaced to the PDF builders (name + pdf-lib rgb colours). */
interface ComplianceBrand {
  name: string;
  primary: ReturnType<typeof rgb>;
  accent: ReturnType<typeof rgb>;
  logoBuffer: Buffer | null;
  logoMime: string | null;
}

/** Convert "#RRGGBB" to a pdf-lib rgb() colour. */
function hexRgb(hex: string): ReturnType<typeof rgb> {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r / 255, g / 255, b / 255);
}

function toComplianceBrand(b: ResolvedBranding): ComplianceBrand {
  return {
    name: b.name,
    primary: hexRgb(b.primaryColor),
    accent: hexRgb(b.accentColor),
    logoBuffer: b.logoBuffer,
    logoMime: b.logoMime,
  };
}

// Placeholder for storage service until document-service is implemented
const storageService = {
  async uploadBuffer(
    buffer: Buffer,
    filename: string,
    _bucket: string,
    _options?: Record<string, unknown>
  ): Promise<string> {
    // TODO: Implement with actual storage service (MinIO/S3)
    logger.warn(`Storage service not yet implemented. Would upload: ${filename}`);
    return `/uploads/compliance-reports/${filename}`;
  }
};

// ============================================================================
// TYPES
// ============================================================================

export interface ComplianceReportData {
  project: {
    id: string;
    name: string;
    location: string;
    project_type: string;
    start_date?: Date;
    expected_completion?: Date;
  };
  score: ComplianceScore | null;
  permits: ProjectPermit[];
  inspections: PermitInspection[];
  expiring_soon: ProjectPermit[];
  regulatory_authorities: any[];
  generated_at: Date;
  generated_by: string;
}

export interface GenerateReportInput {
  project_id: string;
  generated_by: string;
  organization_id: string;
  include_inspections?: boolean;
  include_timeline?: boolean;
  include_recommendations?: boolean;
  for_signing?: boolean;
  signees?: SigneeInput[];
}

export interface SigneeInput {
  signee_type: 'internal' | 'external';
  user_id?: string;
  name?: string;
  email?: string;
  role?: string;
}

export interface ComplianceReportResult {
  report_id: string;
  pdf_url: string;
  pdf_buffer: Buffer;
  signing_request_id?: string;
}

// ============================================================================
// PDF STYLING CONSTANTS
// ============================================================================

const COLORS = {
  primary: rgb(0.09, 0.45, 0.67),      // PROPMETRIK blue
  secondary: rgb(0.8, 0.6, 0.2),        // Ghana gold
  success: rgb(0.16, 0.65, 0.31),
  warning: rgb(0.85, 0.65, 0.13),
  danger: rgb(0.86, 0.21, 0.27),
  text: rgb(0.1, 0.1, 0.1),
  textLight: rgb(0.4, 0.4, 0.4),
  border: rgb(0.8, 0.8, 0.8),
  background: rgb(0.97, 0.97, 0.97),
};

const MARGINS = {
  top: 60,
  bottom: 60,
  left: 50,
  right: 50,
};

// ============================================================================
// SERVICE CLASS
// ============================================================================

class ComplianceReportService {
  
  /**
   * Generate a compliance report PDF
   */
  async generateReport(input: GenerateReportInput): Promise<ComplianceReportResult> {
    const reportId = uuidv4();
    
    // Gather all data
    const reportData = await this.gatherReportData(input);

    // Resolve the org's PROJECT-MANAGEMENT branding (logo/name/colors) — falls back to PROPMETRIK
    const branding = toComplianceBrand(
      await resolveReportBranding(input.organization_id, { service: 'project_management', withLogo: true })
    );

    // Generate PDF
    const pdfBuffer = await this.buildPDF(reportData, input, branding);
    
    // Upload to storage
    const fileName = `compliance-report-${reportData.project.name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`;
    const pdfUrl = await storageService.uploadBuffer(
      pdfBuffer,
      `projects/${input.project_id}/reports/${fileName}`,
      'application/pdf'
    );
    
    // Save report record
    await pool.query(
      `INSERT INTO compliance_reports (
        id, project_id, organization_id, report_type, 
        pdf_url, generated_by, report_data, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        reportId,
        input.project_id,
        input.organization_id,
        'full_compliance',
        pdfUrl,
        input.generated_by,
        JSON.stringify(reportData),
      ]
    );
    
    // Legacy in-report e-sign creation has been retired; signing now flows through
    // the envelope engine (esign_envelopes) initiated from the e-sign module.
    const signingRequestId: string | undefined = undefined;

    logger.info('Compliance report generated', {
      reportId, 
      projectId: input.project_id,
      forSigning: input.for_signing 
    });
    
    return {
      report_id: reportId,
      pdf_url: pdfUrl,
      pdf_buffer: pdfBuffer,
      signing_request_id: signingRequestId,
    };
  }
  
  /**
   * Gather all data needed for the report
   */
  private async gatherReportData(input: GenerateReportInput): Promise<ComplianceReportData> {
    const [project, dashboard, authorities] = await Promise.all([
      (projectService as any).getById(input.project_id),
      complianceService.getComplianceDashboard(input.project_id),
      pool.query('SELECT * FROM ghana_regulatory_authorities WHERE is_active = true ORDER BY name'),
    ]);
    
    if (!project) {
      throw new Error('Project not found');
    }
    
    // Get all inspections
    const inspectionsResult = await pool.query(
      `SELECT pi.*, pp.permit_name 
       FROM permit_inspections pi
       JOIN project_permits pp ON pi.permit_id = pp.id
       WHERE pi.project_id = $1
       ORDER BY COALESCE(pi.actual_date, pi.scheduled_date) DESC`,
      [input.project_id]
    );
    
    return {
      project: {
        id: project.id,
        name: project.name,
        location: `${(project as any).sub_metro || ''} ${(project as any).assembly || ''}, ${project.region || ''}`.trim(),
        project_type: project.project_type,
        start_date: (project as any).start_date,
        expected_completion: project.planned_completion_date,
      },
      score: dashboard.score,
      permits: dashboard.permits,
      inspections: inspectionsResult.rows,
      expiring_soon: dashboard.expiring_soon,
      regulatory_authorities: authorities.rows,
      generated_at: new Date(),
      generated_by: input.generated_by,
    };
  }
  
  /**
   * Build the PDF document
   */
  private async buildPDF(data: ComplianceReportData, input: GenerateReportInput, brand: ComplianceBrand): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Page 1: Cover & Executive Summary
    await this.addCoverPage(pdfDoc, data, font, fontBold, brand);
    
    // Page 2+: Permit Status
    await this.addPermitPages(pdfDoc, data, font, fontBold);
    
    // Inspections section
    if (input.include_inspections !== false && data.inspections.length > 0) {
      await this.addInspectionPages(pdfDoc, data, font, fontBold);
    }
    
    // Timeline section
    if (input.include_timeline !== false) {
      await this.addTimelinePage(pdfDoc, data, font, fontBold);
    }
    
    // Recommendations section
    if (input.include_recommendations !== false) {
      await this.addRecommendationsPage(pdfDoc, data, font, fontBold);
    }
    
    // Signature page
    if (input.for_signing) {
      await this.addSignaturePage(pdfDoc, data, input, font, fontBold);
    }
    
    // Add page numbers
    await this.addPageNumbers(pdfDoc, font);
    
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }
  
  /**
   * Add cover page with executive summary
   */
  private async addCoverPage(
    pdfDoc: PDFDocument,
    data: ComplianceReportData,
    font: PDFFont,
    fontBold: PDFFont,
    brand: ComplianceBrand
  ): Promise<void> {
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();
    let y = height - MARGINS.top;

    // Header bar (branded primary colour)
    page.drawRectangle({
      x: 0,
      y: height - 100,
      width,
      height: 100,
      color: brand.primary,
    });

    // Firm logo (top-right) if available — falls back silently to text-only header
    if (brand.logoBuffer && brand.logoBuffer.length > 24) {
      try {
        const mime = (brand.logoMime || '').toLowerCase();
        const img = mime.includes('png')
          ? await pdfDoc.embedPng(brand.logoBuffer)
          : await pdfDoc.embedJpg(brand.logoBuffer);
        const maxW = 140, maxH = 44;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = img.width * scale, h = img.height * scale;
        page.drawImage(img, { x: width - MARGINS.right - w, y: height - 30 - h / 2 - 20, width: w, height: h });
      } catch { /* ignore — text header still renders */ }
    }

    // Firm name kicker
    page.drawText(brand.name.toUpperCase(), {
      x: MARGINS.left,
      y: height - 26,
      size: 10,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    // Title
    page.drawText('COMPLIANCE REPORT', {
      x: MARGINS.left,
      y: height - 58,
      size: 26,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    page.drawText(data.project.name, {
      x: MARGINS.left,
      y: height - 84,
      size: 13,
      font,
      color: rgb(1, 1, 1),
    });
    
    y = height - 140;
    
    // Project details box
    this.drawInfoBox(page, MARGINS.left, y - 100, width - MARGINS.left - MARGINS.right, 100, fontBold, font, [
      { label: 'Project', value: data.project.name },
      { label: 'Location', value: data.project.location },
      { label: 'Project Type', value: data.project.project_type?.replace(/_/g, ' ').toUpperCase() || 'N/A' },
      { label: 'Report Date', value: data.generated_at.toLocaleDateString('en-GB', { 
        day: 'numeric', month: 'long', year: 'numeric' 
      }) },
    ]);
    
    y -= 130;
    
    // Compliance Score Section
    page.drawText('COMPLIANCE SCORE', {
      x: MARGINS.left,
      y,
      size: 16,
      font: fontBold,
      color: COLORS.primary,
    });
    
    y -= 30;
    
    const score = data.score?.compliance_score || 0;
    const scoreColor = score >= 80 ? COLORS.success : score >= 60 ? COLORS.warning : COLORS.danger;
    
    // Score circle
    const centerX = MARGINS.left + 60;
    const centerY = y - 40;
    
    page.drawCircle({
      x: centerX,
      y: centerY,
      size: 50,
      borderColor: scoreColor,
      borderWidth: 6,
      color: rgb(1, 1, 1),
    });
    
    page.drawText(score.toString(), {
      x: centerX - (score >= 100 ? 20 : score >= 10 ? 14 : 8),
      y: centerY - 10,
      size: 28,
      font: fontBold,
      color: scoreColor,
    });
    
    page.drawText('/100', {
      x: centerX - 12,
      y: centerY - 28,
      size: 10,
      font,
      color: COLORS.textLight,
    });
    
    // Risk level badge
    const riskLevel = data.score?.risk_level || 'unknown';
    const riskColors: Record<string, typeof COLORS.success> = {
      low: COLORS.success,
      medium: COLORS.warning,
      high: COLORS.danger,
      critical: rgb(0.5, 0, 0),
    };
    
    page.drawRectangle({
      x: centerX + 80,
      y: centerY - 10,
      width: 80,
      height: 24,
      color: riskColors[riskLevel] || COLORS.textLight,
    });
    
    page.drawText(riskLevel.toUpperCase(), {
      x: centerX + 90,
      y: centerY - 3,
      size: 10,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    
    page.drawText('RISK LEVEL', {
      x: centerX + 80,
      y: centerY + 20,
      size: 8,
      font,
      color: COLORS.textLight,
    });
    
    // Score breakdown
    const breakdownX = centerX + 200;
    const breakdownData = [
      { label: 'Total Permits', value: data.score?.total_permits || data.permits.length },
      { label: 'Approved', value: data.score?.approved_permits || 0, color: COLORS.success },
      { label: 'Pending', value: data.score?.pending_permits || 0, color: COLORS.warning },
      { label: 'Expired', value: data.score?.expired_permits || 0, color: COLORS.danger },
    ];
    
    breakdownData.forEach((item, i) => {
      const itemY = centerY + 30 - (i * 22);
      page.drawText(item.label + ':', {
        x: breakdownX,
        y: itemY,
        size: 10,
        font,
        color: COLORS.textLight,
      });
      page.drawText(item.value.toString(), {
        x: breakdownX + 100,
        y: itemY,
        size: 12,
        font: fontBold,
        color: item.color || COLORS.text,
      });
    });
    
    y -= 120;
    
    // Expiring Soon Alert
    if (data.expiring_soon.length > 0) {
      page.drawRectangle({
        x: MARGINS.left,
        y: y - 80,
        width: width - MARGINS.left - MARGINS.right,
        height: 80,
        color: rgb(1, 0.96, 0.88),
        borderColor: COLORS.warning,
        borderWidth: 1,
      });
      
      page.drawText('⚠ PERMITS EXPIRING SOON', {
        x: MARGINS.left + 10,
        y: y - 20,
        size: 12,
        font: fontBold,
        color: COLORS.warning,
      });
      
      const expiringText = data.expiring_soon
        .slice(0, 3)
        .map(p => `• ${p.permit_name}: ${new Date(p.expiration_date!).toLocaleDateString('en-GB')}`)
        .join('\n');
      
      page.drawText(expiringText, {
        x: MARGINS.left + 10,
        y: y - 40,
        size: 10,
        font,
        color: COLORS.text,
        lineHeight: 14,
      });
    }
    
    // Footer
    page.drawText(`Generated by ${brand.name} Compliance Module`, {
      x: MARGINS.left,
      y: MARGINS.bottom - 20,
      size: 8,
      font,
      color: COLORS.textLight,
    });
    
    page.drawText(`Confidential - ${data.project.name}`, {
      x: width - MARGINS.right - 150,
      y: MARGINS.bottom - 20,
      size: 8,
      font,
      color: COLORS.textLight,
    });
  }
  
  /**
   * Add permit status pages
   */
  private async addPermitPages(
    pdfDoc: PDFDocument,
    data: ComplianceReportData,
    font: PDFFont,
    fontBold: PDFFont
  ): Promise<void> {
    let page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    let y = height - MARGINS.top;
    
    // Section header
    page.drawText('PERMIT STATUS DETAILS', {
      x: MARGINS.left,
      y,
      size: 18,
      font: fontBold,
      color: COLORS.primary,
    });
    
    y -= 30;
    
    // Table header
    const columns = [
      { label: 'Permit', width: 150 },
      { label: 'Authority', width: 100 },
      { label: 'Status', width: 80 },
      { label: 'Applied', width: 70 },
      { label: 'Approved', width: 70 },
      { label: 'Expires', width: 70 },
    ];
    
    // Draw header row
    page.drawRectangle({
      x: MARGINS.left,
      y: y - 20,
      width: width - MARGINS.left - MARGINS.right,
      height: 20,
      color: COLORS.primary,
    });
    
    let headerX = MARGINS.left + 5;
    columns.forEach(col => {
      page.drawText(col.label, {
        x: headerX,
        y: y - 14,
        size: 9,
        font: fontBold,
        color: rgb(1, 1, 1),
      });
      headerX += col.width;
    });
    
    y -= 25;
    
    // Draw permit rows
    for (let i = 0; i < data.permits.length; i++) {
      const permit = data.permits[i];
      
      // Check if we need a new page
      if (y < MARGINS.bottom + 50) {
        page = pdfDoc.addPage([595.28, 841.89]);
        y = height - MARGINS.top;
      }
      
      // Alternating row background
      if (i % 2 === 0) {
        page.drawRectangle({
          x: MARGINS.left,
          y: y - 18,
          width: width - MARGINS.left - MARGINS.right,
          height: 22,
          color: COLORS.background,
        });
      }
      
      let rowX = MARGINS.left + 5;
      
      // Permit name
      page.drawText(this.truncate(permit.permit_name, 25), {
        x: rowX,
        y: y - 12,
        size: 9,
        font,
        color: COLORS.text,
      });
      rowX += columns[0].width;
      
      // Authority
      page.drawText(this.truncate(permit.authority_name || 'N/A', 15), {
        x: rowX,
        y: y - 12,
        size: 9,
        font,
        color: COLORS.text,
      });
      rowX += columns[1].width;
      
      // Status with color
      const statusColor = this.getStatusColor(permit.status);
      page.drawText(permit.status.replace(/_/g, ' ').toUpperCase(), {
        x: rowX,
        y: y - 12,
        size: 8,
        font: fontBold,
        color: statusColor,
      });
      rowX += columns[2].width;
      
      // Dates
      page.drawText(this.formatDate(permit.application_date), {
        x: rowX,
        y: y - 12,
        size: 9,
        font,
        color: COLORS.text,
      });
      rowX += columns[3].width;
      
      page.drawText(this.formatDate(permit.approval_date), {
        x: rowX,
        y: y - 12,
        size: 9,
        font,
        color: COLORS.text,
      });
      rowX += columns[4].width;
      
      page.drawText(this.formatDate(permit.expiration_date), {
        x: rowX,
        y: y - 12,
        size: 9,
        font,
        color: permit.expiration_date && new Date(permit.expiration_date) < new Date() 
          ? COLORS.danger 
          : COLORS.text,
      });
      
      y -= 22;
    }
  }
  
  /**
   * Add inspection pages
   */
  private async addInspectionPages(
    pdfDoc: PDFDocument,
    data: ComplianceReportData,
    font: PDFFont,
    fontBold: PDFFont
  ): Promise<void> {
    let page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    let y = height - MARGINS.top;
    
    page.drawText('INSPECTION LOG', {
      x: MARGINS.left,
      y,
      size: 18,
      font: fontBold,
      color: COLORS.primary,
    });
    
    y -= 30;
    
    for (const inspection of data.inspections) {
      if (y < MARGINS.bottom + 100) {
        page = pdfDoc.addPage([595.28, 841.89]);
        y = height - MARGINS.top;
      }
      
      // Inspection card
      page.drawRectangle({
        x: MARGINS.left,
        y: y - 80,
        width: width - MARGINS.left - MARGINS.right,
        height: 80,
        borderColor: COLORS.border,
        borderWidth: 1,
      });
      
      // Header with result
      const resultColor = this.getInspectionResultColor(inspection.result);
      page.drawRectangle({
        x: MARGINS.left,
        y: y - 20,
        width: width - MARGINS.left - MARGINS.right,
        height: 20,
        color: resultColor,
      });
      
      page.drawText((inspection as any).permit_name || inspection.inspection_type, {
        x: MARGINS.left + 10,
        y: y - 14,
        size: 10,
        font: fontBold,
        color: rgb(1, 1, 1),
      });
      
      page.drawText(inspection.result?.toUpperCase() || 'PENDING', {
        x: width - MARGINS.right - 100,
        y: y - 14,
        size: 9,
        font: fontBold,
        color: rgb(1, 1, 1),
      });
      
      // Details
      const details = [
        `Inspector: ${inspection.inspector_name || 'TBD'}`,
        `Date: ${this.formatDate(inspection.actual_date || inspection.scheduled_date)}`,
        `Type: ${inspection.inspection_type.replace(/_/g, ' ')}`,
      ];
      
      details.forEach((detail, i) => {
        page.drawText(detail, {
          x: MARGINS.left + 10,
          y: y - 35 - (i * 14),
          size: 9,
          font,
          color: COLORS.text,
        });
      });
      
      // Findings (if any)
      if (inspection.findings) {
        page.drawText('Findings: ' + this.truncate(inspection.findings, 80), {
          x: MARGINS.left + 10,
          y: y - 70,
          size: 8,
          font,
          color: COLORS.textLight,
        });
      }
      
      y -= 95;
    }
  }
  
  /**
   * Add timeline page
   */
  private async addTimelinePage(
    pdfDoc: PDFDocument,
    data: ComplianceReportData,
    font: PDFFont,
    fontBold: PDFFont
  ): Promise<void> {
    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    let y = height - MARGINS.top;
    
    page.drawText('REGULATORY TIMELINE', {
      x: MARGINS.left,
      y,
      size: 18,
      font: fontBold,
      color: COLORS.primary,
    });
    
    y -= 40;
    
    // Sort permits by application date
    const sortedPermits = [...data.permits]
      .filter(p => p.application_date || p.approval_date)
      .sort((a, b) => {
        const dateA = new Date(a.application_date || a.approval_date || 0);
        const dateB = new Date(b.application_date || b.approval_date || 0);
        return dateA.getTime() - dateB.getTime();
      });
    
    // Draw timeline
    const timelineX = MARGINS.left + 100;
    
    sortedPermits.forEach((permit, i) => {
      if (y < MARGINS.bottom + 50) return;
      
      // Timeline dot
      const dotColor = this.getStatusColor(permit.status);
      page.drawCircle({
        x: timelineX,
        y: y - 10,
        size: 8,
        color: dotColor,
      });
      
      // Connecting line
      if (i < sortedPermits.length - 1) {
        page.drawLine({
          start: { x: timelineX, y: y - 18 },
          end: { x: timelineX, y: y - 50 },
          thickness: 2,
          color: COLORS.border,
        });
      }
      
      // Date on left
      const dateText = this.formatDate(permit.application_date || permit.approval_date);
      page.drawText(dateText, {
        x: MARGINS.left,
        y: y - 13,
        size: 9,
        font,
        color: COLORS.textLight,
      });
      
      // Permit info on right
      page.drawText(permit.permit_name, {
        x: timelineX + 20,
        y: y - 8,
        size: 10,
        font: fontBold,
        color: COLORS.text,
      });
      
      page.drawText(permit.status.replace(/_/g, ' '), {
        x: timelineX + 20,
        y: y - 22,
        size: 9,
        font,
        color: dotColor,
      });
      
      y -= 55;
    });
  }
  
  /**
   * Add recommendations page
   */
  private async addRecommendationsPage(
    pdfDoc: PDFDocument,
    data: ComplianceReportData,
    font: PDFFont,
    fontBold: PDFFont
  ): Promise<void> {
    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    let y = height - MARGINS.top;
    
    page.drawText('RECOMMENDATIONS & GAPS', {
      x: MARGINS.left,
      y,
      size: 18,
      font: fontBold,
      color: COLORS.primary,
    });
    
    y -= 40;
    
    const recommendations: string[] = [];
    
    // Analyze permits for recommendations
    const notStarted = data.permits.filter(p => p.status === 'not_started');
    const expired = data.permits.filter(p => p.status === 'expired');
    const pending = data.permits.filter(p => ['application_submitted', 'under_review', 'additional_info_required'].includes(p.status));
    
    if (notStarted.length > 0) {
      recommendations.push(`HIGH PRIORITY: ${notStarted.length} permit(s) have not been started. Initiate applications for: ${notStarted.map(p => p.permit_name).join(', ')}.`);
    }
    
    if (expired.length > 0) {
      recommendations.push(`URGENT: ${expired.length} permit(s) have expired and require immediate renewal: ${expired.map(p => p.permit_name).join(', ')}.`);
    }
    
    if (pending.length > 0) {
      recommendations.push(`MONITOR: ${pending.length} permit application(s) are pending. Follow up with relevant authorities: ${pending.map(p => p.permit_name).join(', ')}.`);
    }
    
    if (data.expiring_soon.length > 0) {
      recommendations.push(`PLAN AHEAD: ${data.expiring_soon.length} permit(s) expiring within 60 days. Schedule renewal applications.`);
    }
    
    if (data.score && data.score.compliance_score < 80) {
      recommendations.push(`COMPLIANCE TARGET: Current score of ${data.score.compliance_score}% is below recommended 80%. Focus on outstanding permits to improve project bankability.`);
    }
    
    // Ghana-specific recommendations
    recommendations.push('REGULATORY BEST PRACTICES: Maintain copies of all permits on-site as required by Ghana Building Regulations.');
    recommendations.push('INSPECTION READINESS: Ensure site is prepared for unscheduled inspections by Municipal Assembly officers.');
    
    if (recommendations.length === 0) {
      recommendations.push('EXCELLENT: All permits are in order. Continue monitoring expiration dates and maintain documentation.');
    }
    
    // Draw recommendations
    recommendations.forEach((rec, i) => {
      const isUrgent = rec.startsWith('URGENT') || rec.startsWith('HIGH');
      const isWarning = rec.startsWith('MONITOR') || rec.startsWith('PLAN');
      
      const bgColor = isUrgent ? rgb(1, 0.9, 0.9) : isWarning ? rgb(1, 0.97, 0.9) : COLORS.background;
      const borderColor = isUrgent ? COLORS.danger : isWarning ? COLORS.warning : COLORS.primary;
      
      // Calculate text height
      const textHeight = Math.ceil(rec.length / 70) * 14 + 20;
      
      if (y - textHeight < MARGINS.bottom) return;
      
      page.drawRectangle({
        x: MARGINS.left,
        y: y - textHeight,
        width: width - MARGINS.left - MARGINS.right,
        height: textHeight,
        color: bgColor,
        borderColor,
        borderWidth: 1,
      });
      
      // Draw number badge
      page.drawCircle({
        x: MARGINS.left + 15,
        y: y - 15,
        size: 10,
        color: borderColor,
      });
      
      page.drawText((i + 1).toString(), {
        x: MARGINS.left + 12,
        y: y - 18,
        size: 9,
        font: fontBold,
        color: rgb(1, 1, 1),
      });
      
      // Draw recommendation text
      page.drawText(this.wrapText(rec, 75), {
        x: MARGINS.left + 35,
        y: y - 18,
        size: 10,
        font,
        color: COLORS.text,
        lineHeight: 14,
      });
      
      y -= textHeight + 10;
    });
  }
  
  /**
   * Add signature page for e-sign
   */
  private async addSignaturePage(
    pdfDoc: PDFDocument,
    data: ComplianceReportData,
    input: GenerateReportInput,
    font: PDFFont,
    fontBold: PDFFont
  ): Promise<void> {
    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    let y = height - MARGINS.top;
    
    page.drawText('SIGN-OFF & APPROVAL', {
      x: MARGINS.left,
      y,
      size: 18,
      font: fontBold,
      color: COLORS.primary,
    });
    
    y -= 40;
    
    page.drawText(
      'I/We hereby confirm that we have reviewed the compliance status detailed in this report and acknowledge the current regulatory standing of the project.',
      {
        x: MARGINS.left,
        y: y - 10,
        size: 11,
        font,
        color: COLORS.text,
        lineHeight: 16,
        maxWidth: width - MARGINS.left - MARGINS.right,
      }
    );
    
    y -= 80;
    
    // Signature boxes
    const signees = input.signees || [];
    const boxWidth = (width - MARGINS.left - MARGINS.right - 20) / Math.min(signees.length, 2);
    
    signees.forEach((signee, i) => {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const boxX = MARGINS.left + (col * (boxWidth + 20));
      const boxY = y - (row * 150);
      
      // Signature box
      page.drawRectangle({
        x: boxX,
        y: boxY - 100,
        width: boxWidth,
        height: 100,
        borderColor: COLORS.border,
        borderWidth: 1,
      });
      
      page.drawText(signee.role || 'Signatory', {
        x: boxX + 10,
        y: boxY - 20,
        size: 10,
        font: fontBold,
        color: COLORS.primary,
      });
      
      page.drawText(signee.name || 'Name: ____________________', {
        x: boxX + 10,
        y: boxY - 45,
        size: 10,
        font,
        color: COLORS.text,
      });
      
      page.drawLine({
        start: { x: boxX + 10, y: boxY - 75 },
        end: { x: boxX + boxWidth - 10, y: boxY - 75 },
        thickness: 1,
        color: COLORS.border,
      });
      
      page.drawText('Signature', {
        x: boxX + 10,
        y: boxY - 88,
        size: 8,
        font,
        color: COLORS.textLight,
      });
      
      page.drawText('Date: _______________', {
        x: boxX + boxWidth - 100,
        y: boxY - 88,
        size: 8,
        font,
        color: COLORS.textLight,
      });
    });
    
    // Legal notice
    page.drawText(
      'This document is electronically generated and may be digitally signed using PROPMETRIK E-Sign. ' +
      'Electronic signatures are legally binding under Ghana\'s Electronic Transactions Act, 2008 (Act 772).',
      {
        x: MARGINS.left,
        y: MARGINS.bottom + 40,
        size: 8,
        font,
        color: COLORS.textLight,
        lineHeight: 12,
        maxWidth: width - MARGINS.left - MARGINS.right,
      }
    );
  }
  
  /**
   * Add page numbers to all pages
   */
  private async addPageNumbers(pdfDoc: PDFDocument, font: PDFFont): Promise<void> {
    const pages = pdfDoc.getPages();
    const totalPages = pages.length;
    
    pages.forEach((page, i) => {
      const { width } = page.getSize();
      page.drawText(`Page ${i + 1} of ${totalPages}`, {
        x: width / 2 - 30,
        y: 30,
        size: 9,
        font,
        color: COLORS.textLight,
      });
    });
  }
  
  // ============================================================================
  // HELPER METHODS
  // ============================================================================
  
  private drawInfoBox(
    page: PDFPage,
    x: number,
    y: number,
    width: number,
    height: number,
    fontBold: PDFFont,
    font: PDFFont,
    items: { label: string; value: string }[]
  ): void {
    page.drawRectangle({
      x,
      y,
      width,
      height,
      borderColor: COLORS.border,
      borderWidth: 1,
    });
    
    const colWidth = width / 2;
    items.forEach((item, i) => {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const itemX = x + 10 + (col * colWidth);
      const itemY = y + height - 25 - (row * 25);
      
      page.drawText(item.label + ':', {
        x: itemX,
        y: itemY,
        size: 9,
        font,
        color: COLORS.textLight,
      });
      
      page.drawText(item.value, {
        x: itemX,
        y: itemY - 12,
        size: 10,
        font: fontBold,
        color: COLORS.text,
      });
    });
  }
  
  private getStatusColor(status: string): typeof COLORS.success {
    const statusColors: Record<string, typeof COLORS.success> = {
      approved: COLORS.success,
      approved_with_conditions: COLORS.success,
      not_started: COLORS.textLight,
      documents_gathering: rgb(0.4, 0.6, 0.8),
      application_submitted: rgb(0.4, 0.6, 0.8),
      under_review: COLORS.warning,
      additional_info_required: COLORS.warning,
      rejected: COLORS.danger,
      expired: COLORS.danger,
      renewed: COLORS.success,
    };
    return statusColors[status] || COLORS.textLight;
  }
  
  private getInspectionResultColor(result?: string): typeof COLORS.success {
    const resultColors: Record<string, typeof COLORS.success> = {
      passed: COLORS.success,
      passed_with_observations: rgb(0.4, 0.7, 0.4),
      conditional_pass: COLORS.warning,
      failed: COLORS.danger,
      reinspection_required: COLORS.warning,
      cancelled: COLORS.textLight,
    };
    return result ? resultColors[result] || COLORS.textLight : rgb(0.4, 0.6, 0.8);
  }
  
  private formatDate(date?: Date | string | null): string {
    if (!date) return '-';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  
  private truncate(text: string, maxLength: number): string {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
  }
  
  private wrapText(text: string, maxCharsPerLine: number): string {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    words.forEach(word => {
      if ((currentLine + ' ' + word).length <= maxCharsPerLine) {
        currentLine = currentLine ? currentLine + ' ' + word : word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    });
    
    if (currentLine) lines.push(currentLine);
    return lines.join('\n');
  }
  
  // ============================================================================
  // REPORT HISTORY & MANAGEMENT
  // ============================================================================
  
  async getReportsByProject(projectId: string): Promise<any[]> {
    const result = await pool.query(
      `SELECT cr.*
       FROM compliance_reports cr
       WHERE cr.project_id = $1
       ORDER BY cr.created_at DESC`,
      [projectId]
    );
    return result.rows;
  }
  
  async getReportById(reportId: string): Promise<any> {
    const result = await pool.query(
      `SELECT cr.*
       FROM compliance_reports cr
       WHERE cr.id = $1`,
      [reportId]
    );
    return result.rows[0] || null;
  }
}

// Export singleton
export const complianceReportService = new ComplianceReportService();
