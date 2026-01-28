/**
 * Compliance Service
 * Phase 3: Compliance & Document Management
 * 
 * Handles:
 * - Permit CRUD operations with Ghana-specific permit types
 * - Regulatory compliance tracking and scoring
 * - Permit expiration monitoring and alerts
 * - Inspection logging and status tracking
 * - Integration with Ghana regulatory authorities
 */

import { pool } from '../../database';
import { v4 as uuidv4 } from 'uuid';
import {
  emitProjectUpdated,
  emitDashboardRefresh,
} from './projectRealtimeEvents';

// ============================================================================
// TYPES
// ============================================================================

export type PermitType =
  | 'development_permit'
  | 'building_permit'
  | 'epa_permit'
  | 'fire_certificate'
  | 'occupancy_permit'
  | 'water_connection'
  | 'electricity_connection'
  | 'highway_access'
  | 'aviation_clearance'
  | 'forestry_clearance'
  | 'mining_rights'
  | 'land_title'
  | 'stool_lands_consent'
  | 'traditional_authority_approval'
  | 'works_permit'
  | 'demolition_permit'
  | 'excavation_permit'
  | 'crane_permit'
  | 'hoarding_permit'
  | 'signage_permit'
  | 'other';

export type PermitStatus =
  | 'not_required'
  | 'not_started'
  | 'documents_gathering'
  | 'application_submitted'
  | 'under_review'
  | 'additional_info_required'
  | 'approved'
  | 'approved_with_conditions'
  | 'rejected'
  | 'expired'
  | 'renewed';

export type InspectionResult =
  | 'passed'
  | 'passed_with_observations'
  | 'conditional_pass'
  | 'failed'
  | 'reinspection_required'
  | 'cancelled';

export interface ProjectPermit {
  id: string;
  project_id: string;
  organization_id: string;
  
  permit_type: PermitType;
  permit_name: string;
  description?: string;
  
  authority_id?: string;
  authority_name?: string;
  authority_contact?: string;
  
  application_date?: Date;
  application_reference?: string;
  expected_approval_date?: Date;
  
  approval_date?: Date;
  approval_reference?: string;
  approved_by?: string;
  approval_document_url?: string;
  
  effective_date?: Date;
  expiration_date?: Date;
  renewal_reminder_days: number;
  renewal_reminder_sent: boolean;
  
  status: PermitStatus;
  conditions?: string;
  
  fees_paid?: number;
  fees_currency: string;
  receipt_url?: string;
  
  related_document_ids: string[];
  notes?: string;
  
  created_by?: string;
  updated_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface PermitInspection {
  id: string;
  permit_id: string;
  project_id: string;
  
  inspection_type: string;
  inspector_name?: string;
  inspector_organization?: string;
  inspector_contact?: string;
  
  scheduled_date?: Date;
  actual_date?: Date;
  
  result?: InspectionResult;
  findings?: string;
  deficiencies?: string;
  recommendations?: string;
  
  certificate_issued: boolean;
  certificate_number?: string;
  certificate_url?: string;
  
  follow_up_required: boolean;
  follow_up_date?: Date;
  
  photos: string[];
  attachments: string[];
  
  conducted_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface ComplianceScore {
  id: string;
  project_id: string;
  organization_id: string;
  
  total_permits: number;
  approved_permits: number;
  pending_permits: number;
  expired_permits: number;
  rejected_permits: number;
  
  compliance_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  
  last_calculated_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface RegulatoryAuthority {
  id: string;
  name: string;
  abbreviation?: string;
  authority_type: string;
  
  address?: string;
  city?: string;
  region?: string;
  phone?: string;
  email?: string;
  website?: string;
  
  permit_types: PermitType[];
  typical_processing_days?: number;
  application_fees?: any;
  
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface RegulatoryTemplate {
  id: string;
  template_name: string;
  description?: string;
  region: string;
  assembly?: string;
  project_types: string[];
  required_permits: PermitType[];
  recommended_sequence?: any;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// Input types
export interface CreatePermitInput {
  project_id: string;
  organization_id: string;
  permit_type: PermitType;
  permit_name: string;
  description?: string;
  
  authority_id?: string;
  authority_name?: string;
  authority_contact?: string;
  
  expected_approval_date?: Date;
  effective_date?: Date;
  expiration_date?: Date;
  renewal_reminder_days?: number;
  
  status?: PermitStatus;
  conditions?: string;
  
  fees_paid?: number;
  fees_currency?: string;
  
  notes?: string;
  created_by?: string;
}

export interface UpdatePermitInput {
  permit_name?: string;
  description?: string;
  
  authority_id?: string;
  authority_name?: string;
  authority_contact?: string;
  
  application_date?: Date;
  application_reference?: string;
  expected_approval_date?: Date;
  
  approval_date?: Date;
  approval_reference?: string;
  approved_by?: string;
  approval_document_url?: string;
  
  effective_date?: Date;
  expiration_date?: Date;
  renewal_reminder_days?: number;
  
  status?: PermitStatus;
  conditions?: string;
  
  fees_paid?: number;
  fees_currency?: string;
  receipt_url?: string;
  
  related_document_ids?: string[];
  notes?: string;
  
  updated_by?: string;
}

export interface CreateInspectionInput {
  permit_id: string;
  project_id: string;
  
  inspection_type: string;
  inspector_name?: string;
  inspector_organization?: string;
  inspector_contact?: string;
  
  scheduled_date?: Date;
  actual_date?: Date;
  
  result?: InspectionResult;
  findings?: string;
  deficiencies?: string;
  recommendations?: string;
  
  follow_up_required?: boolean;
  follow_up_date?: Date;
  
  photos?: string[];
  attachments?: string[];
  
  conducted_by?: string;
}

export interface UpdateInspectionInput {
  inspection_type?: string;
  inspector_name?: string;
  inspector_organization?: string;
  inspector_contact?: string;
  
  scheduled_date?: Date;
  actual_date?: Date;
  
  result?: InspectionResult;
  findings?: string;
  deficiencies?: string;
  recommendations?: string;
  
  certificate_issued?: boolean;
  certificate_number?: string;
  certificate_url?: string;
  
  follow_up_required?: boolean;
  follow_up_date?: Date;
  
  photos?: string[];
  attachments?: string[];
}

export interface PermitFilters {
  project_id: string;
  permit_type?: PermitType | PermitType[];
  status?: PermitStatus | PermitStatus[];
  authority_id?: string;
  expiring_within_days?: number;
  expired?: boolean;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class ComplianceService {
  // --------------------------------------------------------------------------
  // PERMITS - CRUD
  // --------------------------------------------------------------------------

  async createPermit(input: CreatePermitInput): Promise<ProjectPermit> {
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO project_permits (
        id, project_id, organization_id, permit_type, permit_name, description,
        authority_id, authority_name, authority_contact,
        expected_approval_date, effective_date, expiration_date,
        renewal_reminder_days, status, conditions,
        fees_paid, fees_currency, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *`,
      [
        id,
        input.project_id,
        input.organization_id,
        input.permit_type,
        input.permit_name,
        input.description,
        input.authority_id,
        input.authority_name,
        input.authority_contact,
        input.expected_approval_date,
        input.effective_date,
        input.expiration_date,
        input.renewal_reminder_days || 30,
        input.status || 'not_started',
        input.conditions,
        input.fees_paid,
        input.fees_currency || 'GHS',
        input.notes,
        input.created_by,
      ]
    );

    const permit = result.rows[0];

    // Update compliance score
    await this.calculateComplianceScore(input.project_id, input.organization_id);

    // Emit real-time update
    emitProjectUpdated(input.project_id, input.organization_id, 'permit_created');
    emitDashboardRefresh(input.organization_id);

    return permit;
  }

  async getPermitById(permitId: string): Promise<ProjectPermit | null> {
    const result = await pool.query(
      'SELECT * FROM project_permits WHERE id = $1',
      [permitId]
    );
    return result.rows[0] || null;
  }

  async getPermitsByProject(
    projectId: string,
    filters?: Partial<PermitFilters>
  ): Promise<ProjectPermit[]> {
    let query = 'SELECT * FROM project_permits WHERE project_id = $1';
    const params: any[] = [projectId];
    let paramIndex = 2;

    if (filters?.permit_type) {
      const types = Array.isArray(filters.permit_type)
        ? filters.permit_type
        : [filters.permit_type];
      query += ` AND permit_type = ANY($${paramIndex})`;
      params.push(types);
      paramIndex++;
    }

    if (filters?.status) {
      const statuses = Array.isArray(filters.status)
        ? filters.status
        : [filters.status];
      query += ` AND status = ANY($${paramIndex})`;
      params.push(statuses);
      paramIndex++;
    }

    if (filters?.authority_id) {
      query += ` AND authority_id = $${paramIndex}`;
      params.push(filters.authority_id);
      paramIndex++;
    }

    if (filters?.expiring_within_days) {
      query += ` AND expiration_date IS NOT NULL 
                 AND expiration_date <= CURRENT_DATE + INTERVAL '${filters.expiring_within_days} days'
                 AND expiration_date >= CURRENT_DATE`;
    }

    if (filters?.expired) {
      query += ` AND expiration_date IS NOT NULL AND expiration_date < CURRENT_DATE`;
    }

    query += ' ORDER BY permit_type, created_at';

    const result = await pool.query(query, params);
    return result.rows;
  }

  async updatePermit(
    permitId: string,
    input: UpdatePermitInput
  ): Promise<ProjectPermit | null> {
    // Get existing permit
    const existing = await this.getPermitById(permitId);
    if (!existing) return null;

    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fields = [
      'permit_name',
      'description',
      'authority_id',
      'authority_name',
      'authority_contact',
      'application_date',
      'application_reference',
      'expected_approval_date',
      'approval_date',
      'approval_reference',
      'approved_by',
      'approval_document_url',
      'effective_date',
      'expiration_date',
      'renewal_reminder_days',
      'status',
      'conditions',
      'fees_paid',
      'fees_currency',
      'receipt_url',
      'related_document_ids',
      'notes',
      'updated_by',
    ];

    for (const field of fields) {
      if ((input as any)[field] !== undefined) {
        updates.push(`${field} = $${paramIndex}`);
        values.push((input as any)[field]);
        paramIndex++;
      }
    }

    if (updates.length === 0) return existing;

    values.push(permitId);

    const result = await pool.query(
      `UPDATE project_permits SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    const permit = result.rows[0];

    // Recalculate compliance score
    await this.calculateComplianceScore(permit.project_id, permit.organization_id);

    // Emit real-time update
    emitProjectUpdated(permit.project_id, permit.organization_id, 'permit_updated');
    emitDashboardRefresh(permit.organization_id);

    return permit;
  }

  async deletePermit(permitId: string): Promise<boolean> {
    const existing = await this.getPermitById(permitId);
    if (!existing) return false;

    await pool.query('DELETE FROM project_permits WHERE id = $1', [permitId]);

    // Recalculate compliance score
    await this.calculateComplianceScore(existing.project_id, existing.organization_id);

    // Emit real-time update
    emitProjectUpdated(existing.project_id, existing.organization_id, 'permit_deleted');
    emitDashboardRefresh(existing.organization_id);

    return true;
  }

  // --------------------------------------------------------------------------
  // INSPECTIONS
  // --------------------------------------------------------------------------

  async createInspection(input: CreateInspectionInput): Promise<PermitInspection> {
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO permit_inspections (
        id, permit_id, project_id, inspection_type,
        inspector_name, inspector_organization, inspector_contact,
        scheduled_date, actual_date, result,
        findings, deficiencies, recommendations,
        follow_up_required, follow_up_date,
        photos, attachments, conducted_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *`,
      [
        id,
        input.permit_id,
        input.project_id,
        input.inspection_type,
        input.inspector_name,
        input.inspector_organization,
        input.inspector_contact,
        input.scheduled_date,
        input.actual_date,
        input.result,
        input.findings,
        input.deficiencies,
        input.recommendations,
        input.follow_up_required || false,
        input.follow_up_date,
        input.photos || [],
        input.attachments || [],
        input.conducted_by,
      ]
    );

    const inspection = result.rows[0];

    // Emit real-time update
    const permit = await this.getPermitById(input.permit_id);
    if (permit) {
      emitProjectUpdated(permit.project_id, permit.organization_id, 'inspection_logged');
    }

    return inspection;
  }

  async getInspectionsByPermit(permitId: string): Promise<PermitInspection[]> {
    const result = await pool.query(
      `SELECT * FROM permit_inspections 
       WHERE permit_id = $1 
       ORDER BY COALESCE(actual_date, scheduled_date) DESC`,
      [permitId]
    );
    return result.rows;
  }

  async getInspectionsByProject(projectId: string): Promise<PermitInspection[]> {
    const result = await pool.query(
      `SELECT pi.*, pp.permit_name, pp.permit_type
       FROM permit_inspections pi
       JOIN project_permits pp ON pi.permit_id = pp.id
       WHERE pi.project_id = $1
       ORDER BY COALESCE(pi.actual_date, pi.scheduled_date) DESC`,
      [projectId]
    );
    return result.rows;
  }

  async updateInspection(
    inspectionId: string,
    input: UpdateInspectionInput
  ): Promise<PermitInspection | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fields = [
      'inspection_type',
      'inspector_name',
      'inspector_organization',
      'inspector_contact',
      'scheduled_date',
      'actual_date',
      'result',
      'findings',
      'deficiencies',
      'recommendations',
      'certificate_issued',
      'certificate_number',
      'certificate_url',
      'follow_up_required',
      'follow_up_date',
      'photos',
      'attachments',
    ];

    for (const field of fields) {
      if ((input as any)[field] !== undefined) {
        updates.push(`${field} = $${paramIndex}`);
        values.push((input as any)[field]);
        paramIndex++;
      }
    }

    if (updates.length === 0) return null;

    values.push(inspectionId);

    const result = await pool.query(
      `UPDATE permit_inspections SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    return result.rows[0] || null;
  }

  async deleteInspection(inspectionId: string): Promise<boolean> {
    const result = await pool.query(
      'DELETE FROM permit_inspections WHERE id = $1 RETURNING id',
      [inspectionId]
    );
    return result.rowCount > 0;
  }

  // --------------------------------------------------------------------------
  // COMPLIANCE SCORING
  // --------------------------------------------------------------------------

  async calculateComplianceScore(
    projectId: string,
    organizationId: string
  ): Promise<ComplianceScore> {
    // Use the database function
    const result = await pool.query(
      'SELECT calculate_compliance_score($1) as score',
      [projectId]
    );

    const score = result.rows[0]?.score || 0;

    // Get permit counts
    const countsResult = await pool.query(
      `SELECT 
        COUNT(*) as total_permits,
        COUNT(*) FILTER (WHERE status IN ('approved', 'approved_with_conditions', 'renewed')) as approved_permits,
        COUNT(*) FILTER (WHERE status IN ('not_started', 'documents_gathering', 'application_submitted', 'under_review', 'additional_info_required')) as pending_permits,
        COUNT(*) FILTER (WHERE status = 'expired' OR (expiration_date IS NOT NULL AND expiration_date < CURRENT_DATE)) as expired_permits,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_permits
       FROM project_permits WHERE project_id = $1`,
      [projectId]
    );

    const counts = countsResult.rows[0];

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (score < 50 || counts.expired_permits > 0) {
      riskLevel = 'critical';
    } else if (score < 70 || counts.rejected_permits > 0) {
      riskLevel = 'high';
    } else if (score < 85) {
      riskLevel = 'medium';
    }

    // Upsert compliance score
    const upsertResult = await pool.query(
      `INSERT INTO project_compliance_scores (
        id, project_id, organization_id,
        total_permits, approved_permits, pending_permits, expired_permits, rejected_permits,
        compliance_score, risk_level, last_calculated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (project_id) DO UPDATE SET
        total_permits = EXCLUDED.total_permits,
        approved_permits = EXCLUDED.approved_permits,
        pending_permits = EXCLUDED.pending_permits,
        expired_permits = EXCLUDED.expired_permits,
        rejected_permits = EXCLUDED.rejected_permits,
        compliance_score = EXCLUDED.compliance_score,
        risk_level = EXCLUDED.risk_level,
        last_calculated_at = NOW(),
        updated_at = NOW()
      RETURNING *`,
      [
        uuidv4(),
        projectId,
        organizationId,
        counts.total_permits || 0,
        counts.approved_permits || 0,
        counts.pending_permits || 0,
        counts.expired_permits || 0,
        counts.rejected_permits || 0,
        score,
        riskLevel,
      ]
    );

    return upsertResult.rows[0];
  }

  async getComplianceScore(projectId: string): Promise<ComplianceScore | null> {
    const result = await pool.query(
      'SELECT * FROM project_compliance_scores WHERE project_id = $1',
      [projectId]
    );
    return result.rows[0] || null;
  }

  async getComplianceSummaryByOrganization(
    organizationId: string
  ): Promise<{
    total_projects: number;
    avg_score: number;
    by_risk_level: Record<string, number>;
    expiring_permits: number;
    expired_permits: number;
  }> {
    const result = await pool.query(
      `SELECT 
        COUNT(DISTINCT pcs.project_id) as total_projects,
        COALESCE(AVG(pcs.compliance_score), 0) as avg_score,
        COUNT(*) FILTER (WHERE pcs.risk_level = 'low') as low_risk,
        COUNT(*) FILTER (WHERE pcs.risk_level = 'medium') as medium_risk,
        COUNT(*) FILTER (WHERE pcs.risk_level = 'high') as high_risk,
        COUNT(*) FILTER (WHERE pcs.risk_level = 'critical') as critical_risk
       FROM project_compliance_scores pcs
       WHERE pcs.organization_id = $1`,
      [organizationId]
    );

    const expiringResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days') as expiring_permits,
        COUNT(*) FILTER (WHERE expiration_date < CURRENT_DATE) as expired_permits
       FROM project_permits
       WHERE organization_id = $1 AND expiration_date IS NOT NULL`,
      [organizationId]
    );

    const row = result.rows[0];
    const expiring = expiringResult.rows[0];

    return {
      total_projects: parseInt(row.total_projects) || 0,
      avg_score: parseFloat(row.avg_score) || 0,
      by_risk_level: {
        low: parseInt(row.low_risk) || 0,
        medium: parseInt(row.medium_risk) || 0,
        high: parseInt(row.high_risk) || 0,
        critical: parseInt(row.critical_risk) || 0,
      },
      expiring_permits: parseInt(expiring.expiring_permits) || 0,
      expired_permits: parseInt(expiring.expired_permits) || 0,
    };
  }

  // --------------------------------------------------------------------------
  // EXPIRING PERMITS
  // --------------------------------------------------------------------------

  async getExpiringPermits(
    organizationId: string,
    daysAhead: number = 30
  ): Promise<(ProjectPermit & { project_name: string })[]> {
    const result = await pool.query(
      `SELECT pp.*, dp.name as project_name
       FROM project_permits pp
       JOIN development_projects dp ON pp.project_id = dp.id
       WHERE pp.organization_id = $1
         AND pp.expiration_date IS NOT NULL
         AND pp.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '1 day' * $2
         AND pp.status NOT IN ('not_required', 'expired', 'renewed')
       ORDER BY pp.expiration_date ASC`,
      [organizationId, daysAhead]
    );
    return result.rows;
  }

  async getExpiredPermits(
    organizationId: string
  ): Promise<(ProjectPermit & { project_name: string })[]> {
    const result = await pool.query(
      `SELECT pp.*, dp.name as project_name
       FROM project_permits pp
       JOIN development_projects dp ON pp.project_id = dp.id
       WHERE pp.organization_id = $1
         AND pp.expiration_date IS NOT NULL
         AND pp.expiration_date < CURRENT_DATE
         AND pp.status NOT IN ('not_required', 'renewed')
       ORDER BY pp.expiration_date DESC`,
      [organizationId]
    );
    return result.rows;
  }

  async markRenewalReminderSent(permitId: string): Promise<void> {
    await pool.query(
      `UPDATE project_permits 
       SET renewal_reminder_sent = true, updated_at = NOW()
       WHERE id = $1`,
      [permitId]
    );
  }

  // --------------------------------------------------------------------------
  // REGULATORY AUTHORITIES
  // --------------------------------------------------------------------------

  async getAuthorities(region?: string): Promise<RegulatoryAuthority[]> {
    let query = 'SELECT * FROM ghana_regulatory_authorities WHERE is_active = true';
    const params: any[] = [];

    if (region) {
      query += ` AND (region IS NULL OR region = $1)`;
      params.push(region);
    }

    query += ' ORDER BY name';

    const result = await pool.query(query, params);
    return result.rows;
  }

  async getAuthorityById(authorityId: string): Promise<RegulatoryAuthority | null> {
    const result = await pool.query(
      'SELECT * FROM ghana_regulatory_authorities WHERE id = $1',
      [authorityId]
    );
    return result.rows[0] || null;
  }

  // --------------------------------------------------------------------------
  // REGULATORY TEMPLATES
  // --------------------------------------------------------------------------

  async getTemplates(
    region?: string,
    projectType?: string
  ): Promise<RegulatoryTemplate[]> {
    let query = 'SELECT * FROM regulatory_templates WHERE is_active = true';
    const params: any[] = [];
    let paramIndex = 1;

    if (region) {
      query += ` AND region = $${paramIndex}`;
      params.push(region);
      paramIndex++;
    }

    if (projectType) {
      query += ` AND $${paramIndex} = ANY(project_types)`;
      params.push(projectType);
      paramIndex++;
    }

    query += ' ORDER BY template_name';

    const result = await pool.query(query, params);
    return result.rows;
  }

  async applyTemplate(
    projectId: string,
    organizationId: string,
    templateId: string,
    createdBy?: string
  ): Promise<ProjectPermit[]> {
    // Get template
    const templateResult = await pool.query(
      'SELECT * FROM regulatory_templates WHERE id = $1',
      [templateId]
    );

    const template = templateResult.rows[0];
    if (!template) {
      throw new Error('Template not found');
    }

    const permits: ProjectPermit[] = [];
    const requiredPermits: PermitType[] = template.required_permits;

    // Get authority info for each permit type
    const authoritiesResult = await pool.query(
      'SELECT * FROM ghana_regulatory_authorities WHERE is_active = true'
    );
    const authorities = authoritiesResult.rows;

    // Create a permit for each required type
    for (const permitType of requiredPermits) {
      // Find matching authority
      const authority = authorities.find((a) =>
        a.permit_types?.includes(permitType)
      );

      const permitName = permitType
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase());

      const permit = await this.createPermit({
        project_id: projectId,
        organization_id: organizationId,
        permit_type: permitType,
        permit_name: permitName,
        authority_id: authority?.id,
        authority_name: authority?.name,
        authority_contact: authority?.email || authority?.phone,
        status: 'not_started',
        created_by: createdBy,
      });

      permits.push(permit);
    }

    return permits;
  }

  // --------------------------------------------------------------------------
  // COMPLIANCE DASHBOARD DATA
  // --------------------------------------------------------------------------

  async getComplianceDashboard(
    projectId: string
  ): Promise<{
    score: ComplianceScore | null;
    permits: ProjectPermit[];
    upcoming_inspections: PermitInspection[];
    expiring_soon: ProjectPermit[];
    recent_activity: any[];
  }> {
    const [score, permits, inspections, expiring] = await Promise.all([
      this.getComplianceScore(projectId),
      this.getPermitsByProject(projectId),
      pool.query(
        `SELECT * FROM permit_inspections 
         WHERE project_id = $1 
           AND (scheduled_date >= CURRENT_DATE OR actual_date IS NULL)
         ORDER BY COALESCE(scheduled_date, created_at) ASC
         LIMIT 10`,
        [projectId]
      ),
      pool.query(
        `SELECT * FROM project_permits 
         WHERE project_id = $1 
           AND expiration_date IS NOT NULL
           AND expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'
         ORDER BY expiration_date ASC`,
        [projectId]
      ),
    ]);

    // Get recent activity (last 10 permit/inspection changes)
    const activityResult = await pool.query(
      `(SELECT 'permit' as type, id, permit_name as name, status, updated_at
        FROM project_permits WHERE project_id = $1 ORDER BY updated_at DESC LIMIT 5)
       UNION ALL
       (SELECT 'inspection' as type, id, inspection_type as name, result::text as status, updated_at
        FROM permit_inspections WHERE project_id = $1 ORDER BY updated_at DESC LIMIT 5)
       ORDER BY updated_at DESC LIMIT 10`,
      [projectId]
    );

    return {
      score,
      permits,
      upcoming_inspections: inspections.rows,
      expiring_soon: expiring.rows,
      recent_activity: activityResult.rows,
    };
  }
}

// Export singleton
export const complianceService = new ComplianceService();
