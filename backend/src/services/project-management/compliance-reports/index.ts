/**
 * Compliance Reports Module
 * 
 * Phase 3.9: Split complianceReportService (1201 lines → 3 focused services)
 * 
 * Architecture:
 * - ReportDataService: Gathers project, permit, inspection data for reports
 * - ReportGeneratorService: PDF generation with pdf-lib
 * - ReportManagementService: Orchestration, storage, e-sign integration
 * 
 * @module services/project-management/compliance-reports
 */

// Types
export * from './types';

// Individual Services
export { reportDataService } from './ReportDataService';
export { reportGeneratorService } from './ReportGeneratorService';
export { reportManagementService } from './ReportManagementService';

// =============================================================================
// FACADE
// =============================================================================

import { reportDataService } from './ReportDataService';
import { reportGeneratorService } from './ReportGeneratorService';
import { reportManagementService } from './ReportManagementService';
import {
  ComplianceReport,
  ComplianceReportData,
  GenerateReportInput,
} from './types';

/**
 * Facade for compliance report operations
 * 
 * Provides a unified API for working with compliance reports,
 * delegating to specialized services internally.
 */
export const complianceReportsFacade = {
  // ==========================================================================
  // REPORT GENERATION
  // ==========================================================================

  /**
   * Generate a compliance report
   */
  generateReport(input: GenerateReportInput): Promise<ComplianceReport> {
    return reportManagementService.generateReport(input);
  },

  /**
   * Gather report data (for preview)
   */
  gatherReportData(input: GenerateReportInput): Promise<ComplianceReportData> {
    return reportDataService.gatherReportData(input);
  },

  /**
   * Build PDF buffer (for custom handling)
   */
  async buildPDFBuffer(input: GenerateReportInput): Promise<Buffer> {
    const data = await reportDataService.gatherReportData(input);
    return reportGeneratorService.buildPDF(data, input);
  },

  // ==========================================================================
  // REPORT MANAGEMENT
  // ==========================================================================

  /**
   * Get reports for a project
   */
  getReportsByProject(projectId: string): Promise<ComplianceReport[]> {
    return reportManagementService.getReportsByProject(projectId);
  },

  /**
   * Get a specific report
   */
  getReportById(reportId: string): Promise<ComplianceReport | null> {
    return reportManagementService.getReportById(reportId);
  },

  /**
   * Delete a report
   */
  deleteReport(reportId: string): Promise<boolean> {
    return reportManagementService.deleteReport(reportId);
  },

  /**
   * Get report statistics
   */
  getReportStats(projectId: string): ReturnType<typeof reportManagementService.getReportStats> {
    return reportManagementService.getReportStats(projectId);
  },

  // ==========================================================================
  // DATA SERVICES
  // ==========================================================================

  /**
   * Calculate compliance score
   */
  calculateComplianceScore(projectId: string) {
    return reportDataService.calculateComplianceScore(projectId);
  },

  /**
   * Get compliance gaps and recommendations
   */
  getComplianceGaps(projectId: string) {
    return reportDataService.getComplianceGaps(projectId);
  },

  /**
   * Get project permits
   */
  getProjectPermits(projectId: string) {
    return reportDataService.getProjectPermits(projectId);
  },

  /**
   * Get project inspections
   */
  getProjectInspections(projectId: string) {
    return reportDataService.getProjectInspections(projectId);
  },

  // ==========================================================================
  // CONFIGURATION
  // ==========================================================================

  /**
   * Configure storage service
   */
  setStorageService(service: Parameters<typeof reportManagementService.setStorageService>[0]) {
    reportManagementService.setStorageService(service);
  },

  /**
   * Configure signing service
   */
  setSigningService(service: Parameters<typeof reportManagementService.setSigningService>[0]) {
    reportManagementService.setSigningService(service);
  },
};

// Default export for convenience
export default complianceReportsFacade;
