/**
 * Report Generator Service
 * 
 * Phase 3.9: Split complianceReportService
 * 
 * Generates PDF compliance reports:
 * - Cover page with executive summary
 * - Permit status pages
 * - Inspection log pages
 * - Timeline visualization
 * - Recommendations page
 * - Signature page for e-sign
 * 
 * @module services/project-management/compliance-reports/ReportGeneratorService
 */

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { BaseService } from '../../base/BaseService';
import {
  ComplianceReportData,
  GenerateReportInput,
  PDF_COLORS,
  PDF_MARGINS,
  PAGE_SIZE,
} from './types';

// =============================================================================
// HELPER TYPES
// =============================================================================

type PDFColor = ReturnType<typeof rgb>;

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class ReportGeneratorServiceImpl extends BaseService {
  constructor() {
    super('ReportGeneratorService');
  }

  /**
   * Build the complete PDF document
   */
  async buildPDF(data: ComplianceReportData, input: GenerateReportInput): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Page 1: Cover & Executive Summary
    await this.addCoverPage(pdfDoc, data, font, fontBold);

    // Page 2+: Permit Status
    await this.addPermitPages(pdfDoc, data, font, fontBold);

    // Inspections section
    if (input.includeInspections !== false && data.inspections.length > 0) {
      await this.addInspectionPages(pdfDoc, data, font, fontBold);
    }

    // Timeline section
    if (input.includeTimeline !== false) {
      await this.addTimelinePage(pdfDoc, data, font, fontBold);
    }

    // Recommendations section
    if (input.includeRecommendations !== false) {
      await this.addRecommendationsPage(pdfDoc, data, font, fontBold);
    }

    // Signature page
    if (input.forSigning) {
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
    fontBold: PDFFont
  ): Promise<void> {
    const page = pdfDoc.addPage(PAGE_SIZE);
    const { width, height } = page.getSize();
    let y = height - PDF_MARGINS.top;

    // Header bar
    page.drawRectangle({
      x: 0,
      y: height - 100,
      width,
      height: 100,
      color: PDF_COLORS.primary,
    });

    // Title
    page.drawText('COMPLIANCE REPORT', {
      x: PDF_MARGINS.left,
      y: height - 50,
      size: 28,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    page.drawText(data.project.name, {
      x: PDF_MARGINS.left,
      y: height - 80,
      size: 14,
      font,
      color: rgb(1, 1, 1),
    });

    y = height - 140;

    // Project details box
    this.drawInfoBox(page, PDF_MARGINS.left, y - 100, width - PDF_MARGINS.left - PDF_MARGINS.right, 100, fontBold, font, [
      { label: 'Project', value: data.project.name },
      { label: 'Location', value: data.project.location || 'Not specified' },
      { label: 'Project Type', value: data.project.projectType?.replace(/_/g, ' ').toUpperCase() || 'N/A' },
      { label: 'Report Date', value: new Date(data.generatedAt).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric'
      }) },
    ]);

    y -= 130;

    // Compliance Score Section
    page.drawText('COMPLIANCE SCORE', {
      x: PDF_MARGINS.left,
      y,
      size: 16,
      font: fontBold,
      color: PDF_COLORS.primary,
    });

    y -= 30;

    if (data.score) {
      const score = data.score.overall;
      const scoreColor = score >= 80 ? PDF_COLORS.success : score >= 60 ? PDF_COLORS.warning : PDF_COLORS.danger;

      // Score circle
      const centerX = PDF_MARGINS.left + 60;
      const centerY = y - 40;

      page.drawCircle({
        x: centerX,
        y: centerY,
        size: 50,
        borderColor: scoreColor,
        borderWidth: 6,
        color: rgb(1, 1, 1),
      });

      page.drawText(Math.round(score).toString(), {
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
        color: PDF_COLORS.textLight,
      });

      // Grade badge
      page.drawRectangle({
        x: centerX + 80,
        y: centerY - 10,
        width: 50,
        height: 24,
        color: scoreColor,
      });

      page.drawText(data.score.grade, {
        x: centerX + 95,
        y: centerY - 3,
        size: 14,
        font: fontBold,
        color: rgb(1, 1, 1),
      });

      page.drawText('GRADE', {
        x: centerX + 85,
        y: centerY + 20,
        size: 8,
        font,
        color: PDF_COLORS.textLight,
      });

      // Score breakdown
      const breakdownX = centerX + 180;
      const breakdownData = [
        { label: 'Permits', value: `${data.score.permits}%` },
        { label: 'Inspections', value: `${data.score.inspections}%` },
        { label: 'Documentation', value: `${data.score.documentation}%` },
        { label: 'Regulatory', value: `${data.score.regulatory}%` },
      ];

      breakdownData.forEach((item, i) => {
        const itemY = centerY + 30 - (i * 22);
        page.drawText(item.label + ':', {
          x: breakdownX,
          y: itemY,
          size: 10,
          font,
          color: PDF_COLORS.textLight,
        });
        page.drawText(item.value, {
          x: breakdownX + 100,
          y: itemY,
          size: 12,
          font: fontBold,
          color: PDF_COLORS.text,
        });
      });

      y -= 120;
    }

    // Expiring Soon Alert
    if (data.expiringSoon && data.expiringSoon.length > 0) {
      page.drawRectangle({
        x: PDF_MARGINS.left,
        y: y - 80,
        width: width - PDF_MARGINS.left - PDF_MARGINS.right,
        height: 80,
        color: rgb(1, 0.96, 0.88),
        borderColor: PDF_COLORS.warning,
        borderWidth: 1,
      });

      page.drawText('⚠ PERMITS EXPIRING SOON', {
        x: PDF_MARGINS.left + 10,
        y: y - 20,
        size: 12,
        font: fontBold,
        color: PDF_COLORS.warning,
      });

      const expiringText = data.expiringSoon
        .slice(0, 3)
        .map(p => `• ${p.permitType}: ${p.expiryDate || 'Unknown'}`)
        .join('\n');

      page.drawText(expiringText, {
        x: PDF_MARGINS.left + 10,
        y: y - 40,
        size: 10,
        font,
        color: PDF_COLORS.text,
        lineHeight: 14,
      });
    }

    // Footer
    page.drawText('Generated by PropMetrik Compliance Module', {
      x: PDF_MARGINS.left,
      y: PDF_MARGINS.bottom - 20,
      size: 8,
      font,
      color: PDF_COLORS.textLight,
    });

    page.drawText(`Confidential - ${data.project.name}`, {
      x: width - PDF_MARGINS.right - 150,
      y: PDF_MARGINS.bottom - 20,
      size: 8,
      font,
      color: PDF_COLORS.textLight,
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
    let page = pdfDoc.addPage(PAGE_SIZE);
    const { width, height } = page.getSize();
    let y = height - PDF_MARGINS.top;

    // Section header
    page.drawText('PERMIT STATUS DETAILS', {
      x: PDF_MARGINS.left,
      y,
      size: 18,
      font: fontBold,
      color: PDF_COLORS.primary,
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
      x: PDF_MARGINS.left,
      y: y - 20,
      width: width - PDF_MARGINS.left - PDF_MARGINS.right,
      height: 20,
      color: PDF_COLORS.primary,
    });

    let headerX = PDF_MARGINS.left + 5;
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
      if (y < PDF_MARGINS.bottom + 50) {
        page = pdfDoc.addPage(PAGE_SIZE);
        y = height - PDF_MARGINS.top;
      }

      // Alternating row background
      if (i % 2 === 0) {
        page.drawRectangle({
          x: PDF_MARGINS.left,
          y: y - 18,
          width: width - PDF_MARGINS.left - PDF_MARGINS.right,
          height: 22,
          color: PDF_COLORS.background,
        });
      }

      let rowX = PDF_MARGINS.left + 5;

      // Permit type
      page.drawText(this.truncate(permit.permitType, 25), {
        x: rowX,
        y: y - 12,
        size: 9,
        font,
        color: PDF_COLORS.text,
      });
      rowX += columns[0].width;

      // Authority
      page.drawText(this.truncate(permit.issuingAuthority || 'N/A', 15), {
        x: rowX,
        y: y - 12,
        size: 9,
        font,
        color: PDF_COLORS.text,
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
      page.drawText(this.formatDate(permit.applicationDate), {
        x: rowX,
        y: y - 12,
        size: 9,
        font,
        color: PDF_COLORS.text,
      });
      rowX += columns[3].width;

      page.drawText(this.formatDate(permit.issueDate), {
        x: rowX,
        y: y - 12,
        size: 9,
        font,
        color: PDF_COLORS.text,
      });
      rowX += columns[4].width;

      const isExpired = permit.expiryDate && new Date(permit.expiryDate) < new Date();
      page.drawText(this.formatDate(permit.expiryDate), {
        x: rowX,
        y: y - 12,
        size: 9,
        font,
        color: isExpired ? PDF_COLORS.danger : PDF_COLORS.text,
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
    let page = pdfDoc.addPage(PAGE_SIZE);
    const { width, height } = page.getSize();
    let y = height - PDF_MARGINS.top;

    page.drawText('INSPECTION LOG', {
      x: PDF_MARGINS.left,
      y,
      size: 18,
      font: fontBold,
      color: PDF_COLORS.primary,
    });

    y -= 30;

    for (const inspection of data.inspections) {
      if (y < PDF_MARGINS.bottom + 100) {
        page = pdfDoc.addPage(PAGE_SIZE);
        y = height - PDF_MARGINS.top;
      }

      // Inspection card
      page.drawRectangle({
        x: PDF_MARGINS.left,
        y: y - 80,
        width: width - PDF_MARGINS.left - PDF_MARGINS.right,
        height: 80,
        borderColor: PDF_COLORS.border,
        borderWidth: 1,
      });

      // Header with result
      const resultColor = this.getInspectionResultColor(inspection.result);
      page.drawRectangle({
        x: PDF_MARGINS.left,
        y: y - 20,
        width: width - PDF_MARGINS.left - PDF_MARGINS.right,
        height: 20,
        color: resultColor,
      });

      page.drawText(inspection.inspectionType, {
        x: PDF_MARGINS.left + 10,
        y: y - 14,
        size: 10,
        font: fontBold,
        color: rgb(1, 1, 1),
      });

      page.drawText(inspection.result?.toUpperCase() || 'PENDING', {
        x: width - PDF_MARGINS.right - 100,
        y: y - 14,
        size: 9,
        font: fontBold,
        color: rgb(1, 1, 1),
      });

      // Details
      const details = [
        `Inspector: ${inspection.inspector || 'TBD'}`,
        `Date: ${this.formatDate(inspection.actualDate || inspection.scheduledDate)}`,
        `Type: ${inspection.inspectionType.replace(/_/g, ' ')}`,
      ];

      details.forEach((detail, i) => {
        page.drawText(detail, {
          x: PDF_MARGINS.left + 10,
          y: y - 35 - (i * 14),
          size: 9,
          font,
          color: PDF_COLORS.text,
        });
      });

      // Findings (if any)
      if (inspection.findings) {
        page.drawText('Findings: ' + this.truncate(inspection.findings, 80), {
          x: PDF_MARGINS.left + 10,
          y: y - 70,
          size: 8,
          font,
          color: PDF_COLORS.textLight,
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
    const page = pdfDoc.addPage(PAGE_SIZE);
    const { width, height } = page.getSize();
    let y = height - PDF_MARGINS.top;

    page.drawText('REGULATORY TIMELINE', {
      x: PDF_MARGINS.left,
      y,
      size: 18,
      font: fontBold,
      color: PDF_COLORS.primary,
    });

    y -= 40;

    // Sort permits by application date
    const sortedPermits = [...data.permits]
      .filter(p => p.applicationDate || p.issueDate)
      .sort((a, b) => {
        const dateA = new Date(a.applicationDate || a.issueDate || 0);
        const dateB = new Date(b.applicationDate || b.issueDate || 0);
        return dateA.getTime() - dateB.getTime();
      });

    // Draw timeline
    const timelineX = PDF_MARGINS.left + 100;

    sortedPermits.forEach((permit, i) => {
      if (y < PDF_MARGINS.bottom + 50) return;

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
          color: PDF_COLORS.border,
        });
      }

      // Date on left
      const dateText = this.formatDate(permit.applicationDate || permit.issueDate);
      page.drawText(dateText, {
        x: PDF_MARGINS.left,
        y: y - 13,
        size: 9,
        font,
        color: PDF_COLORS.textLight,
      });

      // Permit info on right
      page.drawText(permit.permitType, {
        x: timelineX + 20,
        y: y - 8,
        size: 10,
        font: fontBold,
        color: PDF_COLORS.text,
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
    const page = pdfDoc.addPage(PAGE_SIZE);
    const { width, height } = page.getSize();
    let y = height - PDF_MARGINS.top;

    page.drawText('RECOMMENDATIONS & GAPS', {
      x: PDF_MARGINS.left,
      y,
      size: 18,
      font: fontBold,
      color: PDF_COLORS.primary,
    });

    y -= 40;

    const recommendations: string[] = [];

    // Analyze permits for recommendations
    const notStarted = data.permits.filter(p => p.status === 'not_started');
    const expired = data.permits.filter(p => p.status === 'expired');
    const pending = data.permits.filter(p => ['pending', 'under_review', 'additional_info_required'].includes(p.status));

    if (notStarted.length > 0) {
      recommendations.push(`HIGH PRIORITY: ${notStarted.length} permit(s) have not been started. Initiate applications for: ${notStarted.map(p => p.permitType).join(', ')}.`);
    }

    if (expired.length > 0) {
      recommendations.push(`URGENT: ${expired.length} permit(s) have expired and require immediate renewal: ${expired.map(p => p.permitType).join(', ')}.`);
    }

    if (pending.length > 0) {
      recommendations.push(`MONITOR: ${pending.length} permit application(s) are pending. Follow up with relevant authorities: ${pending.map(p => p.permitType).join(', ')}.`);
    }

    if (data.expiringSoon && data.expiringSoon.length > 0) {
      recommendations.push(`PLAN AHEAD: ${data.expiringSoon.length} permit(s) expiring within 60 days. Schedule renewal applications.`);
    }

    if (data.score && data.score.overall < 80) {
      recommendations.push(`COMPLIANCE TARGET: Current score of ${data.score.overall}% is below recommended 80%. Focus on outstanding permits to improve project bankability.`);
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

      const bgColor = isUrgent ? rgb(1, 0.9, 0.9) : isWarning ? rgb(1, 0.97, 0.9) : PDF_COLORS.background;
      const borderColor = isUrgent ? PDF_COLORS.danger : isWarning ? PDF_COLORS.warning : PDF_COLORS.primary;

      // Calculate text height
      const textHeight = Math.ceil(rec.length / 70) * 14 + 20;

      if (y - textHeight < PDF_MARGINS.bottom) return;

      page.drawRectangle({
        x: PDF_MARGINS.left,
        y: y - textHeight,
        width: width - PDF_MARGINS.left - PDF_MARGINS.right,
        height: textHeight,
        color: bgColor,
        borderColor,
        borderWidth: 1,
      });

      // Draw number badge
      page.drawCircle({
        x: PDF_MARGINS.left + 15,
        y: y - 15,
        size: 10,
        color: borderColor,
      });

      page.drawText((i + 1).toString(), {
        x: PDF_MARGINS.left + 12,
        y: y - 18,
        size: 9,
        font: fontBold,
        color: rgb(1, 1, 1),
      });

      // Draw recommendation text
      page.drawText(this.wrapText(rec, 75), {
        x: PDF_MARGINS.left + 35,
        y: y - 18,
        size: 10,
        font,
        color: PDF_COLORS.text,
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
    const page = pdfDoc.addPage(PAGE_SIZE);
    const { width, height } = page.getSize();
    let y = height - PDF_MARGINS.top;

    page.drawText('SIGN-OFF & APPROVAL', {
      x: PDF_MARGINS.left,
      y,
      size: 18,
      font: fontBold,
      color: PDF_COLORS.primary,
    });

    y -= 40;

    page.drawText(
      'I/We hereby confirm that we have reviewed the compliance status detailed in this report and acknowledge the current regulatory standing of the project.',
      {
        x: PDF_MARGINS.left,
        y: y - 10,
        size: 11,
        font,
        color: PDF_COLORS.text,
        lineHeight: 16,
        maxWidth: width - PDF_MARGINS.left - PDF_MARGINS.right,
      }
    );

    y -= 80;

    // Signature boxes
    const signees = input.signees || [];
    const boxWidth = (width - PDF_MARGINS.left - PDF_MARGINS.right - 20) / Math.min(signees.length || 1, 2);

    signees.forEach((signee, i) => {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const boxX = PDF_MARGINS.left + (col * (boxWidth + 20));
      const boxY = y - (row * 150);

      // Signature box
      page.drawRectangle({
        x: boxX,
        y: boxY - 100,
        width: boxWidth,
        height: 100,
        borderColor: PDF_COLORS.border,
        borderWidth: 1,
      });

      page.drawText(signee.role || 'Signatory', {
        x: boxX + 10,
        y: boxY - 20,
        size: 10,
        font: fontBold,
        color: PDF_COLORS.primary,
      });

      page.drawText(signee.name || 'Name: ____________________', {
        x: boxX + 10,
        y: boxY - 45,
        size: 10,
        font,
        color: PDF_COLORS.text,
      });

      page.drawLine({
        start: { x: boxX + 10, y: boxY - 75 },
        end: { x: boxX + boxWidth - 10, y: boxY - 75 },
        thickness: 1,
        color: PDF_COLORS.border,
      });

      page.drawText('Signature', {
        x: boxX + 10,
        y: boxY - 88,
        size: 8,
        font,
        color: PDF_COLORS.textLight,
      });

      page.drawText('Date: _______________', {
        x: boxX + boxWidth - 100,
        y: boxY - 88,
        size: 8,
        font,
        color: PDF_COLORS.textLight,
      });
    });

    // Legal notice
    page.drawText(
      'This document is electronically generated and may be digitally signed using PropMetrik E-Sign. ' +
      'Electronic signatures are legally binding under Ghana\'s Electronic Transactions Act, 2008 (Act 772).',
      {
        x: PDF_MARGINS.left,
        y: PDF_MARGINS.bottom + 40,
        size: 8,
        font,
        color: PDF_COLORS.textLight,
        lineHeight: 12,
        maxWidth: width - PDF_MARGINS.left - PDF_MARGINS.right,
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
        color: PDF_COLORS.textLight,
      });
    });
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

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
      borderColor: PDF_COLORS.border,
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
        color: PDF_COLORS.textLight,
      });

      page.drawText(item.value, {
        x: itemX,
        y: itemY - 12,
        size: 10,
        font: fontBold,
        color: PDF_COLORS.text,
      });
    });
  }

  private getStatusColor(status: string): PDFColor {
    const statusColors: Record<string, PDFColor> = {
      approved: PDF_COLORS.success,
      approved_with_conditions: PDF_COLORS.success,
      not_started: PDF_COLORS.textLight,
      documents_gathering: rgb(0.4, 0.6, 0.8),
      application_submitted: rgb(0.4, 0.6, 0.8),
      pending: rgb(0.4, 0.6, 0.8),
      under_review: PDF_COLORS.warning,
      additional_info_required: PDF_COLORS.warning,
      rejected: PDF_COLORS.danger,
      expired: PDF_COLORS.danger,
      renewed: PDF_COLORS.success,
    };
    return statusColors[status] || PDF_COLORS.textLight;
  }

  private getInspectionResultColor(result?: string): PDFColor {
    const resultColors: Record<string, PDFColor> = {
      pass: PDF_COLORS.success,
      passed: PDF_COLORS.success,
      passed_with_observations: rgb(0.4, 0.7, 0.4),
      conditional_pass: PDF_COLORS.warning,
      fail: PDF_COLORS.danger,
      failed: PDF_COLORS.danger,
      reinspection_required: PDF_COLORS.warning,
      cancelled: PDF_COLORS.textLight,
    };
    return result ? resultColors[result] || PDF_COLORS.textLight : rgb(0.4, 0.6, 0.8);
  }

  private formatDate(date?: string | null): string {
    if (!date) return '-';
    const d = new Date(date);
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
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const reportGeneratorService = new ReportGeneratorServiceImpl();
