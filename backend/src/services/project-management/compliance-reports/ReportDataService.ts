/**
 * Report Data Service
 * 
 * Phase 3.9: Split complianceReportService
 * 
 * Gathers data for compliance reports:
 * - Project details
 * - Compliance scores
 * - Permits and inspections
 * - Regulatory authorities
 * 
 * @module services/project-management/compliance-reports/ReportDataService
 */

import { pool } from '../../../database';
import { BaseService } from '../../../../shared-services/base/BaseService';
import {
  ComplianceReportData,
  ComplianceScore,
  ProjectPermit,
  PermitInspection,
  RegulatoryAuthority,
  GenerateReportInput,
} from './types';

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class ReportDataServiceImpl extends BaseService {
  constructor() {
    super('ReportDataService');
  }

  /**
   * Gather all data needed for a compliance report
   */
  async gatherReportData(input: GenerateReportInput): Promise<ComplianceReportData> {
    const [project, score, permits, inspections, authorities] = await Promise.all([
      this.getProjectDetails(input.projectId),
      this.calculateComplianceScore(input.projectId),
      this.getProjectPermits(input.projectId),
      input.includeInspections ? this.getProjectInspections(input.projectId) : Promise.resolve([]),
      this.getRegulatoryAuthorities(input.projectId),
    ]);

    // Find expiring permits (within 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    const expiringSoon = permits.filter(p => 
      p.expiryDate && 
      new Date(p.expiryDate) <= thirtyDaysFromNow &&
      p.status === 'approved'
    );

    return {
      project,
      score,
      permits,
      inspections,
      expiringSoon,
      regulatoryAuthorities: authorities,
      generatedAt: new Date().toISOString(),
      generatedBy: input.generatedBy,
    };
  }

  /**
   * Get project details
   */
  async getProjectDetails(projectId: string): Promise<ComplianceReportData['project']> {
    const result = await this.query(
      `SELECT 
         p.id, p.name, p.project_type,
         p.start_date, p.end_date as expected_completion,
         COALESCE(p.address, p.city || ', ' || p.region) as location,
         o.name as organization_name
       FROM development_projects p
       LEFT JOIN organizations o ON p.organization_id = o.id
       WHERE p.id = $1`,
      [projectId]
    );

    if (!result.rows[0]) {
      throw new Error('Project not found');
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      location: row.location || 'Not specified',
      projectType: row.project_type,
      startDate: row.start_date?.toISOString().split('T')[0],
      expectedCompletion: row.expected_completion?.toISOString().split('T')[0],
      organizationName: row.organization_name,
    };
  }

  /**
   * Calculate compliance score
   */
  async calculateComplianceScore(projectId: string): Promise<ComplianceScore | null> {
    // Get permit stats
    const permitResult = await this.query(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'approved') as approved,
         COUNT(*) FILTER (WHERE status = 'expired') as expired,
         COUNT(*) FILTER (WHERE status = 'rejected') as rejected
       FROM project_permits
       WHERE project_id = $1`,
      [projectId]
    );

    // Get inspection stats
    const inspectionResult = await this.query(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE result = 'pass') as passed,
         COUNT(*) FILTER (WHERE result = 'fail') as failed
       FROM permit_inspections pi
       JOIN project_permits pp ON pi.permit_id = pp.id
       WHERE pp.project_id = $1`,
      [projectId]
    );

    const permitStats = permitResult.rows[0] || { total: 0, approved: 0, expired: 0, rejected: 0 };
    const inspectionStats = inspectionResult.rows[0] || { total: 0, passed: 0, failed: 0 };

    // Calculate scores
    const permitScore = permitStats.total > 0
      ? ((parseInt(permitStats.approved) || 0) / parseInt(permitStats.total)) * 100
      : 100;

    const inspectionScore = inspectionStats.total > 0
      ? ((parseInt(inspectionStats.passed) || 0) / parseInt(inspectionStats.total)) * 100
      : 100;

    // Documentation score (simplified - would integrate with document service)
    const documentationScore = 80; // Placeholder

    // Regulatory score based on expired permits and failed inspections
    const expiredPenalty = (parseInt(permitStats.expired) || 0) * 10;
    const failedPenalty = (parseInt(inspectionStats.failed) || 0) * 15;
    const regulatoryScore = Math.max(0, 100 - expiredPenalty - failedPenalty);

    // Overall weighted average
    const overall = (
      permitScore * 0.3 +
      inspectionScore * 0.3 +
      documentationScore * 0.2 +
      regulatoryScore * 0.2
    );

    // Calculate grade
    let grade: ComplianceScore['grade'] = 'F';
    if (overall >= 90) grade = 'A';
    else if (overall >= 80) grade = 'B';
    else if (overall >= 70) grade = 'C';
    else if (overall >= 60) grade = 'D';

    return {
      overall: Math.round(overall * 10) / 10,
      permits: Math.round(permitScore * 10) / 10,
      inspections: Math.round(inspectionScore * 10) / 10,
      documentation: documentationScore,
      regulatory: Math.round(regulatoryScore * 10) / 10,
      grade,
    };
  }

  /**
   * Get project permits
   */
  async getProjectPermits(projectId: string): Promise<ProjectPermit[]> {
    const result = await this.query(
      `SELECT * FROM project_permits WHERE project_id = $1 ORDER BY application_date DESC`,
      [projectId]
    );

    return result.rows.map(row => ({
      id: row.id,
      projectId: row.project_id,
      permitType: row.permit_type,
      permitNumber: row.permit_number,
      issuingAuthority: row.issuing_authority,
      status: row.status,
      applicationDate: row.application_date?.toISOString().split('T')[0],
      issueDate: row.issue_date?.toISOString().split('T')[0],
      expiryDate: row.expiry_date?.toISOString().split('T')[0],
      conditions: row.conditions,
      documents: row.documents,
    }));
  }

  /**
   * Get project inspections
   */
  async getProjectInspections(projectId: string): Promise<PermitInspection[]> {
    const result = await this.query(
      `SELECT pi.* FROM permit_inspections pi
       JOIN project_permits pp ON pi.permit_id = pp.id
       WHERE pp.project_id = $1
       ORDER BY COALESCE(pi.actual_date, pi.scheduled_date) DESC`,
      [projectId]
    );

    return result.rows.map(row => ({
      id: row.id,
      permitId: row.permit_id,
      inspectionType: row.inspection_type,
      scheduledDate: row.scheduled_date?.toISOString().split('T')[0],
      actualDate: row.actual_date?.toISOString().split('T')[0],
      inspector: row.inspector,
      result: row.result,
      findings: row.findings,
      correctiveActions: row.corrective_actions,
    }));
  }

  /**
   * Get regulatory authorities for a project
   */
  async getRegulatoryAuthorities(projectId: string): Promise<RegulatoryAuthority[]> {
    const result = await this.query(
      `SELECT DISTINCT ra.* FROM regulatory_authorities ra
       JOIN project_permits pp ON pp.issuing_authority = ra.name
       WHERE pp.project_id = $1`,
      [projectId]
    );

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      department: row.department,
      contactPerson: row.contact_person,
      phone: row.phone,
      email: row.email,
      address: row.address,
      jurisdiction: row.jurisdiction,
    }));
  }

  /**
   * Get compliance gaps and recommendations
   */
  async getComplianceGaps(projectId: string): Promise<{
    gaps: Array<{ area: string; issue: string; severity: 'low' | 'medium' | 'high' }>;
    recommendations: string[];
  }> {
    const gaps: Array<{ area: string; issue: string; severity: 'low' | 'medium' | 'high' }> = [];
    const recommendations: string[] = [];

    // Check for expired permits
    const expiredResult = await this.query(
      `SELECT permit_type FROM project_permits
       WHERE project_id = $1 AND status = 'expired'`,
      [projectId]
    );
    for (const row of expiredResult.rows) {
      gaps.push({
        area: 'Permits',
        issue: `${row.permit_type} permit has expired`,
        severity: 'high',
      });
      recommendations.push(`Renew ${row.permit_type} permit immediately`);
    }

    // Check for failed inspections
    const failedResult = await this.query(
      `SELECT pi.inspection_type, pi.findings FROM permit_inspections pi
       JOIN project_permits pp ON pi.permit_id = pp.id
       WHERE pp.project_id = $1 AND pi.result = 'fail'`,
      [projectId]
    );
    for (const row of failedResult.rows) {
      gaps.push({
        area: 'Inspections',
        issue: `${row.inspection_type} inspection failed`,
        severity: 'high',
      });
      if (row.findings) {
        recommendations.push(`Address findings: ${row.findings.substring(0, 100)}`);
      }
    }

    // Check for pending permits
    const pendingResult = await this.query(
      `SELECT permit_type, application_date FROM project_permits
       WHERE project_id = $1 AND status = 'pending'
       AND application_date < NOW() - INTERVAL '30 days'`,
      [projectId]
    );
    for (const row of pendingResult.rows) {
      gaps.push({
        area: 'Permits',
        issue: `${row.permit_type} permit pending for over 30 days`,
        severity: 'medium',
      });
      recommendations.push(`Follow up on ${row.permit_type} permit application`);
    }

    if (gaps.length === 0) {
      recommendations.push('Maintain current compliance practices');
      recommendations.push('Schedule regular permit status reviews');
    }

    return { gaps, recommendations };
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const reportDataService = new ReportDataServiceImpl();
