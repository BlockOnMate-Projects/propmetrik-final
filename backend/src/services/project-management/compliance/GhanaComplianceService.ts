/**
 * Ghana Compliance Service
 * 
 * Phase 4.1: Full Ghana Regulatory Compliance
 * 
 * Handles all Ghana-specific regulatory requirements:
 * - EPA Environmental Permits
 * - Land Title Commission verification
 * - SSNIT contributions for workers
 * - GRA TIN validation
 * - Lands Commission registrations
 * - Fire Service certificates
 * - Building permit compliance
 * - GIPC registration (for foreign developers)
 * 
 * @module services/project-management/compliance/GhanaComplianceService
 */

import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../../database';
import { BaseService } from '../../base/BaseService';
import {
  UUID,
  GhanaRegion,
  ComplianceType,
  ComplianceStatus,
} from '../types';
import { ValidationError, NotFoundError } from '../errors';
import { eventBus, ProjectEventType } from '../events';

// =============================================================================
// TYPES
// =============================================================================

export enum GhanaRegulatoryBody {
  EPA = 'epa', // Environmental Protection Agency
  LANDS_COMMISSION = 'lands_commission',
  GRA = 'gra', // Ghana Revenue Authority
  SSNIT = 'ssnit', // Social Security
  FIRE_SERVICE = 'fire_service',
  METRO_ASSEMBLY = 'metro_assembly', // Building permits
  GIPC = 'gipc', // Ghana Investment Promotion Centre
  WATER_COMPANY = 'water_company', // Ghana Water Company Limited
  ECG = 'ecg', // Electricity Company of Ghana
  SURVEYOR_GENERAL = 'surveyor_general',
}

export enum PermitType {
  // Environmental
  ENVIRONMENTAL_PERMIT = 'environmental_permit',
  ENVIRONMENTAL_IMPACT_ASSESSMENT = 'eia',
  
  // Land
  LAND_TITLE = 'land_title',
  INDENTURE = 'indenture',
  SITE_PLAN = 'site_plan',
  SURVEY_PLAN = 'survey_plan',
  
  // Building
  BUILDING_PERMIT = 'building_permit',
  DEVELOPMENT_PERMIT = 'development_permit',
  OCCUPANCY_CERTIFICATE = 'occupancy_certificate',
  
  // Safety
  FIRE_SAFETY_CERTIFICATE = 'fire_safety_certificate',
  
  // Tax
  TIN_REGISTRATION = 'tin_registration',
  VAT_REGISTRATION = 'vat_registration',
  
  // Labor
  SSNIT_REGISTRATION = 'ssnit_registration',
  SSNIT_CLEARANCE = 'ssnit_clearance',
  
  // Utilities
  WATER_CONNECTION = 'water_connection',
  ELECTRICITY_CONNECTION = 'electricity_connection',
  
  // Foreign Investment
  GIPC_REGISTRATION = 'gipc_registration',
}

export interface ComplianceRequirement {
  id: UUID;
  projectId: UUID;
  organizationId: UUID;
  
  // Requirement details
  regulatoryBody: GhanaRegulatoryBody;
  permitType: PermitType;
  displayName: string;
  description?: string;
  
  // Status
  status: ComplianceStatus;
  
  // Reference numbers
  applicationNumber?: string;
  permitNumber?: string;
  certificateNumber?: string;
  
  // Dates
  applicationDate?: Date;
  issuedDate?: Date;
  expiryDate?: Date;
  renewalDueDate?: Date;
  
  // Fees
  applicationFee?: number;
  issuanceFee?: number;
  renewalFee?: number;
  currency: string;
  feePaid: boolean;
  
  // Documents
  applicationDocumentUrl?: string;
  permitDocumentUrl?: string;
  supportingDocuments: string[];
  
  // Location specific
  region?: GhanaRegion;
  district?: string;
  
  // Notes
  notes?: string;
  rejectionReason?: string;
  
  // Responsible party
  assignedTo?: UUID;
  lastUpdatedBy?: UUID;
  
  // Dependencies (e.g., need EIA before building permit)
  dependsOn: UUID[];
  blockedBy: string[];
  
  // Audit
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateComplianceRequirementInput {
  projectId: UUID;
  organizationId: UUID;
  regulatoryBody: GhanaRegulatoryBody;
  permitType: PermitType;
  displayName?: string;
  description?: string;
  region?: GhanaRegion;
  district?: string;
  assignedTo?: UUID;
  dependsOn?: UUID[];
}

export interface UpdateComplianceRequirementInput {
  status?: ComplianceStatus;
  applicationNumber?: string;
  permitNumber?: string;
  certificateNumber?: string;
  applicationDate?: Date;
  issuedDate?: Date;
  expiryDate?: Date;
  renewalDueDate?: Date;
  applicationFee?: number;
  issuanceFee?: number;
  feePaid?: boolean;
  applicationDocumentUrl?: string;
  permitDocumentUrl?: string;
  supportingDocuments?: string[];
  notes?: string;
  rejectionReason?: string;
  assignedTo?: UUID;
  lastUpdatedBy?: UUID;
}

export interface ComplianceSummary {
  projectId: UUID;
  totalRequirements: number;
  byStatus: Record<ComplianceStatus, number>;
  byRegulatoryBody: Record<GhanaRegulatoryBody, {
    total: number;
    completed: number;
    pending: number;
    blocked: number;
  }>;
  upcomingRenewals: ComplianceRequirement[];
  overdue: ComplianceRequirement[];
  blockedItems: ComplianceRequirement[];
  complianceScore: number; // 0-100
  estimatedFeesOutstanding: number;
}

// Ghana-specific TIN validation
export interface TINValidationResult {
  isValid: boolean;
  tinNumber: string;
  registeredName?: string;
  businessType?: string;
  registrationDate?: Date;
  status?: 'active' | 'inactive' | 'suspended';
  errorMessage?: string;
}

// SSNIT employer registration
export interface SSNITEmployerInfo {
  employerNumber: string;
  employerName: string;
  registrationDate: Date;
  totalEmployees: number;
  monthlyContribution: number;
  lastPaymentDate?: Date;
  arrearsAmount?: number;
  status: 'compliant' | 'non_compliant' | 'pending';
}

// =============================================================================
// STANDARD REQUIREMENTS BY PROJECT TYPE
// =============================================================================

const STANDARD_REQUIREMENTS: Record<string, PermitType[]> = {
  residential_single: [
    PermitType.LAND_TITLE,
    PermitType.SITE_PLAN,
    PermitType.BUILDING_PERMIT,
    PermitType.WATER_CONNECTION,
    PermitType.ELECTRICITY_CONNECTION,
    PermitType.OCCUPANCY_CERTIFICATE,
  ],
  residential_multi: [
    PermitType.LAND_TITLE,
    PermitType.SITE_PLAN,
    PermitType.ENVIRONMENTAL_PERMIT,
    PermitType.BUILDING_PERMIT,
    PermitType.DEVELOPMENT_PERMIT,
    PermitType.FIRE_SAFETY_CERTIFICATE,
    PermitType.WATER_CONNECTION,
    PermitType.ELECTRICITY_CONNECTION,
    PermitType.OCCUPANCY_CERTIFICATE,
    PermitType.SSNIT_REGISTRATION,
  ],
  commercial: [
    PermitType.LAND_TITLE,
    PermitType.SITE_PLAN,
    PermitType.ENVIRONMENTAL_IMPACT_ASSESSMENT,
    PermitType.ENVIRONMENTAL_PERMIT,
    PermitType.BUILDING_PERMIT,
    PermitType.DEVELOPMENT_PERMIT,
    PermitType.FIRE_SAFETY_CERTIFICATE,
    PermitType.TIN_REGISTRATION,
    PermitType.VAT_REGISTRATION,
    PermitType.WATER_CONNECTION,
    PermitType.ELECTRICITY_CONNECTION,
    PermitType.OCCUPANCY_CERTIFICATE,
    PermitType.SSNIT_REGISTRATION,
  ],
  mixed_use: [
    PermitType.LAND_TITLE,
    PermitType.SITE_PLAN,
    PermitType.ENVIRONMENTAL_IMPACT_ASSESSMENT,
    PermitType.ENVIRONMENTAL_PERMIT,
    PermitType.BUILDING_PERMIT,
    PermitType.DEVELOPMENT_PERMIT,
    PermitType.FIRE_SAFETY_CERTIFICATE,
    PermitType.TIN_REGISTRATION,
    PermitType.VAT_REGISTRATION,
    PermitType.WATER_CONNECTION,
    PermitType.ELECTRICITY_CONNECTION,
    PermitType.OCCUPANCY_CERTIFICATE,
    PermitType.SSNIT_REGISTRATION,
  ],
  industrial: [
    PermitType.LAND_TITLE,
    PermitType.SITE_PLAN,
    PermitType.ENVIRONMENTAL_IMPACT_ASSESSMENT,
    PermitType.ENVIRONMENTAL_PERMIT,
    PermitType.BUILDING_PERMIT,
    PermitType.DEVELOPMENT_PERMIT,
    PermitType.FIRE_SAFETY_CERTIFICATE,
    PermitType.TIN_REGISTRATION,
    PermitType.VAT_REGISTRATION,
    PermitType.WATER_CONNECTION,
    PermitType.ELECTRICITY_CONNECTION,
    PermitType.OCCUPANCY_CERTIFICATE,
    PermitType.SSNIT_REGISTRATION,
    PermitType.GIPC_REGISTRATION, // Often required for industrial
  ],
};

// Permit dependencies (what must be obtained first)
const PERMIT_DEPENDENCIES: Partial<Record<PermitType, PermitType[]>> = {
  [PermitType.BUILDING_PERMIT]: [PermitType.LAND_TITLE, PermitType.SITE_PLAN],
  [PermitType.ENVIRONMENTAL_PERMIT]: [PermitType.ENVIRONMENTAL_IMPACT_ASSESSMENT],
  [PermitType.DEVELOPMENT_PERMIT]: [PermitType.LAND_TITLE, PermitType.SITE_PLAN, PermitType.BUILDING_PERMIT],
  [PermitType.FIRE_SAFETY_CERTIFICATE]: [PermitType.BUILDING_PERMIT],
  [PermitType.OCCUPANCY_CERTIFICATE]: [
    PermitType.BUILDING_PERMIT, 
    PermitType.FIRE_SAFETY_CERTIFICATE,
    PermitType.WATER_CONNECTION,
    PermitType.ELECTRICITY_CONNECTION,
  ],
  [PermitType.VAT_REGISTRATION]: [PermitType.TIN_REGISTRATION],
};

// Regulatory body for each permit type
const PERMIT_REGULATORY_BODY: Record<PermitType, GhanaRegulatoryBody> = {
  [PermitType.ENVIRONMENTAL_PERMIT]: GhanaRegulatoryBody.EPA,
  [PermitType.ENVIRONMENTAL_IMPACT_ASSESSMENT]: GhanaRegulatoryBody.EPA,
  [PermitType.LAND_TITLE]: GhanaRegulatoryBody.LANDS_COMMISSION,
  [PermitType.INDENTURE]: GhanaRegulatoryBody.LANDS_COMMISSION,
  [PermitType.SITE_PLAN]: GhanaRegulatoryBody.SURVEYOR_GENERAL,
  [PermitType.SURVEY_PLAN]: GhanaRegulatoryBody.SURVEYOR_GENERAL,
  [PermitType.BUILDING_PERMIT]: GhanaRegulatoryBody.METRO_ASSEMBLY,
  [PermitType.DEVELOPMENT_PERMIT]: GhanaRegulatoryBody.METRO_ASSEMBLY,
  [PermitType.OCCUPANCY_CERTIFICATE]: GhanaRegulatoryBody.METRO_ASSEMBLY,
  [PermitType.FIRE_SAFETY_CERTIFICATE]: GhanaRegulatoryBody.FIRE_SERVICE,
  [PermitType.TIN_REGISTRATION]: GhanaRegulatoryBody.GRA,
  [PermitType.VAT_REGISTRATION]: GhanaRegulatoryBody.GRA,
  [PermitType.SSNIT_REGISTRATION]: GhanaRegulatoryBody.SSNIT,
  [PermitType.SSNIT_CLEARANCE]: GhanaRegulatoryBody.SSNIT,
  [PermitType.WATER_CONNECTION]: GhanaRegulatoryBody.WATER_COMPANY,
  [PermitType.ELECTRICITY_CONNECTION]: GhanaRegulatoryBody.ECG,
  [PermitType.GIPC_REGISTRATION]: GhanaRegulatoryBody.GIPC,
};

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class GhanaComplianceServiceImpl extends BaseService {
  constructor() {
    super('GhanaComplianceService');
  }

  // ===========================================================================
  // ROW MAPPING
  // ===========================================================================

  protected mapRow(row: any): ComplianceRequirement {
    return {
      id: row.id,
      projectId: row.project_id,
      organizationId: row.organization_id,
      regulatoryBody: row.regulatory_body,
      permitType: row.permit_type,
      displayName: row.display_name,
      description: row.description,
      status: row.status,
      applicationNumber: row.application_number,
      permitNumber: row.permit_number,
      certificateNumber: row.certificate_number,
      applicationDate: row.application_date,
      issuedDate: row.issued_date,
      expiryDate: row.expiry_date,
      renewalDueDate: row.renewal_due_date,
      applicationFee: row.application_fee ? parseFloat(row.application_fee) : undefined,
      issuanceFee: row.issuance_fee ? parseFloat(row.issuance_fee) : undefined,
      renewalFee: row.renewal_fee ? parseFloat(row.renewal_fee) : undefined,
      currency: row.currency || 'GHS',
      feePaid: row.fee_paid || false,
      applicationDocumentUrl: row.application_document_url,
      permitDocumentUrl: row.permit_document_url,
      supportingDocuments: row.supporting_documents || [],
      region: row.region,
      district: row.district,
      notes: row.notes,
      rejectionReason: row.rejection_reason,
      assignedTo: row.assigned_to,
      lastUpdatedBy: row.last_updated_by,
      dependsOn: row.depends_on || [],
      blockedBy: row.blocked_by || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ===========================================================================
  // CRUD OPERATIONS
  // ===========================================================================

  /**
   * Create a compliance requirement.
   */
  async createRequirement(input: CreateComplianceRequirementInput): Promise<ComplianceRequirement> {
    const id = uuidv4();
    const regulatoryBody = input.regulatoryBody || PERMIT_REGULATORY_BODY[input.permitType];
    const displayName = input.displayName || this.getPermitDisplayName(input.permitType);
    
    // Get dependencies
    const dependsOn = input.dependsOn || [];
    const standardDependencies = PERMIT_DEPENDENCIES[input.permitType] || [];
    
    // Check if any dependencies are not yet met (blocked)
    const blockedBy = await this.getBlockingDependencies(input.projectId, standardDependencies);

    const result = await this.query(
      `INSERT INTO pm_compliance_requirements (
        id, project_id, organization_id, regulatory_body, permit_type,
        display_name, description, status, region, district,
        assigned_to, depends_on, blocked_by, currency
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        id, input.projectId, input.organizationId, regulatoryBody, input.permitType,
        displayName, input.description, blockedBy.length > 0 ? 'blocked' : 'not_started',
        input.region, input.district, input.assignedTo, 
        JSON.stringify([...dependsOn, ...standardDependencies.map(pt => pt.toString())]),
        JSON.stringify(blockedBy), 'GHS',
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Get a compliance requirement by ID.
   */
  async getRequirementById(id: UUID): Promise<ComplianceRequirement> {
    const result = await this.query(
      `SELECT * FROM pm_compliance_requirements WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw NotFoundError.forResource('ComplianceRequirement', id);
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * List requirements for a project.
   */
  async listProjectRequirements(
    projectId: UUID,
    filters: { status?: ComplianceStatus; regulatoryBody?: GhanaRegulatoryBody } = {}
  ): Promise<ComplianceRequirement[]> {
    const conditions: string[] = ['project_id = $1'];
    const params: any[] = [projectId];
    let paramIndex = 2;

    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (filters.regulatoryBody) {
      conditions.push(`regulatory_body = $${paramIndex++}`);
      params.push(filters.regulatoryBody);
    }

    const result = await this.query(
      `SELECT * FROM pm_compliance_requirements 
       WHERE ${conditions.join(' AND ')}
       ORDER BY 
         CASE status 
           WHEN 'blocked' THEN 1 
           WHEN 'overdue' THEN 2 
           WHEN 'pending' THEN 3 
           WHEN 'in_review' THEN 4
           WHEN 'not_started' THEN 5 
           ELSE 6 
         END,
         created_at ASC`,
      params
    );

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Update a compliance requirement.
   */
  async updateRequirement(
    id: UUID,
    updates: UpdateComplianceRequirementInput
  ): Promise<ComplianceRequirement> {
    const existing = await this.getRequirementById(id);

    // Build dynamic update query
    const updateFields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    const fieldMappings: Record<keyof UpdateComplianceRequirementInput, string> = {
      status: 'status',
      applicationNumber: 'application_number',
      permitNumber: 'permit_number',
      certificateNumber: 'certificate_number',
      applicationDate: 'application_date',
      issuedDate: 'issued_date',
      expiryDate: 'expiry_date',
      renewalDueDate: 'renewal_due_date',
      applicationFee: 'application_fee',
      issuanceFee: 'issuance_fee',
      feePaid: 'fee_paid',
      applicationDocumentUrl: 'application_document_url',
      permitDocumentUrl: 'permit_document_url',
      supportingDocuments: 'supporting_documents',
      notes: 'notes',
      rejectionReason: 'rejection_reason',
      assignedTo: 'assigned_to',
      lastUpdatedBy: 'last_updated_by',
    };

    for (const [key, column] of Object.entries(fieldMappings)) {
      if (updates[key as keyof UpdateComplianceRequirementInput] !== undefined) {
        let value = updates[key as keyof UpdateComplianceRequirementInput];
        if (key === 'supportingDocuments') {
          value = JSON.stringify(value);
        }
        updateFields.push(`${column} = $${paramIndex++}`);
        params.push(value);
      }
    }

    if (updateFields.length === 0) {
      return existing;
    }

    updateFields.push(`updated_at = NOW()`);
    params.push(id);

    const result = await this.query(
      `UPDATE pm_compliance_requirements SET ${updateFields.join(', ')} 
       WHERE id = $${paramIndex}
       RETURNING *`,
      params
    );

    const updated = this.mapRow(result.rows[0]);

    // If this requirement was completed, unblock dependents
    if (updates.status === 'approved' || updates.status === 'completed') {
      await this.unblockDependents(existing.projectId, existing.permitType);
    }

    // Emit event
    eventBus.emit(ProjectEventType.COMPLIANCE_CHECKPOINT_VERIFIED, {
      entityType: 'compliance_requirement',
      entityId: id,
      projectId: existing.projectId,
      organizationId: existing.organizationId,
      data: { 
        permitType: existing.permitType, 
        status: updates.status,
        permitNumber: updates.permitNumber,
      },
    });

    return updated;
  }

  // ===========================================================================
  // PROJECT INITIALIZATION
  // ===========================================================================

  /**
   * Initialize standard compliance requirements for a new project.
   */
  async initializeProjectCompliance(
    projectId: UUID,
    organizationId: UUID,
    projectType: string,
    region: GhanaRegion,
    options: { includeGIPC?: boolean; foreignOwnership?: boolean } = {}
  ): Promise<ComplianceRequirement[]> {
    // Get standard requirements for this project type
    let permitTypes = STANDARD_REQUIREMENTS[projectType] || STANDARD_REQUIREMENTS['residential_single'];

    // Add GIPC if foreign ownership
    if (options.foreignOwnership || options.includeGIPC) {
      if (!permitTypes.includes(PermitType.GIPC_REGISTRATION)) {
        permitTypes = [...permitTypes, PermitType.GIPC_REGISTRATION];
      }
    }

    const requirements: ComplianceRequirement[] = [];

    for (const permitType of permitTypes) {
      const req = await this.createRequirement({
        projectId,
        organizationId,
        permitType,
        regulatoryBody: PERMIT_REGULATORY_BODY[permitType],
        region,
      });
      requirements.push(req);
    }

    return requirements;
  }

  // ===========================================================================
  // TIN VALIDATION (GRA)
  // ===========================================================================

  /**
   * Validate a Ghana TIN (Tax Identification Number).
   * Note: In production, this would call the GRA API.
   */
  async validateTIN(tinNumber: string): Promise<TINValidationResult> {
    // TIN format: C0000000000 (letter followed by 10 digits) or P0000000000
    const tinRegex = /^[CPGV]\d{10}$/;
    
    if (!tinRegex.test(tinNumber)) {
      return {
        isValid: false,
        tinNumber,
        errorMessage: 'Invalid TIN format. Expected: Letter (C/P/G/V) followed by 10 digits',
      };
    }

    // In production: Call GRA API
    // For now, return mock success
    return {
      isValid: true,
      tinNumber,
      registeredName: 'Validated via GRA',
      status: 'active',
    };
  }

  // ===========================================================================
  // SSNIT COMPLIANCE
  // ===========================================================================

  /**
   * Check SSNIT compliance for a project's workforce.
   * Note: In production, this would integrate with SSNIT.
   */
  async checkSSNITCompliance(
    projectId: UUID,
    employerNumber?: string
  ): Promise<{
    isCompliant: boolean;
    employerInfo?: SSNITEmployerInfo;
    issues: string[];
  }> {
    const issues: string[] = [];

    if (!employerNumber) {
      issues.push('No SSNIT employer number registered');
      return { isCompliant: false, issues };
    }

    // In production: Call SSNIT API
    // For now, return mock data
    const employerInfo: SSNITEmployerInfo = {
      employerNumber,
      employerName: 'Project Employer',
      registrationDate: new Date(),
      totalEmployees: 0,
      monthlyContribution: 0,
      status: 'compliant',
    };

    return {
      isCompliant: true,
      employerInfo,
      issues: [],
    };
  }

  // ===========================================================================
  // COMPLIANCE SUMMARY
  // ===========================================================================

  /**
   * Get compliance summary for a project.
   */
  async getProjectComplianceSummary(projectId: UUID): Promise<ComplianceSummary> {
    const requirements = await this.listProjectRequirements(projectId);

    // Initialize status counts
    const byStatus: Record<ComplianceStatus, number> = {
      not_started: 0,
      pending: 0,
      in_review: 0,
      approved: 0,
      rejected: 0,
      expired: 0,
      blocked: 0,
      completed: 0,
      overdue: 0,
      waived: 0,
    };

    // Initialize regulatory body counts
    const byRegulatoryBody: Record<GhanaRegulatoryBody, { total: number; completed: number; pending: number; blocked: number }> = {} as any;
    for (const body of Object.values(GhanaRegulatoryBody)) {
      byRegulatoryBody[body] = { total: 0, completed: 0, pending: 0, blocked: 0 };
    }

    const upcomingRenewals: ComplianceRequirement[] = [];
    const overdue: ComplianceRequirement[] = [];
    const blockedItems: ComplianceRequirement[] = [];
    let estimatedFeesOutstanding = 0;
    let completedCount = 0;

    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    for (const req of requirements) {
      // Count by status
      byStatus[req.status]++;

      // Count by regulatory body
      if (byRegulatoryBody[req.regulatoryBody]) {
        byRegulatoryBody[req.regulatoryBody].total++;
        
        if (req.status === 'approved' || req.status === 'completed') {
          byRegulatoryBody[req.regulatoryBody].completed++;
          completedCount++;
        } else if (req.status === 'blocked') {
          byRegulatoryBody[req.regulatoryBody].blocked++;
          blockedItems.push(req);
        } else if (req.status !== 'waived' && req.status !== 'rejected') {
          byRegulatoryBody[req.regulatoryBody].pending++;
        }
      }

      // Check for upcoming renewals
      if (req.renewalDueDate && req.renewalDueDate <= thirtyDaysFromNow) {
        upcomingRenewals.push(req);
      }

      // Check for overdue
      if (req.expiryDate && req.expiryDate < now && req.status !== 'expired') {
        overdue.push(req);
      }

      // Sum outstanding fees
      if (!req.feePaid) {
        estimatedFeesOutstanding += (req.applicationFee || 0) + (req.issuanceFee || 0);
      }
    }

    // Calculate compliance score
    const totalRequirements = requirements.length;
    const complianceScore = totalRequirements > 0
      ? Math.round((completedCount / totalRequirements) * 100)
      : 100;

    return {
      projectId,
      totalRequirements,
      byStatus,
      byRegulatoryBody,
      upcomingRenewals,
      overdue,
      blockedItems,
      complianceScore,
      estimatedFeesOutstanding,
    };
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private getPermitDisplayName(permitType: PermitType): string {
    const names: Record<PermitType, string> = {
      [PermitType.ENVIRONMENTAL_PERMIT]: 'Environmental Permit',
      [PermitType.ENVIRONMENTAL_IMPACT_ASSESSMENT]: 'Environmental Impact Assessment (EIA)',
      [PermitType.LAND_TITLE]: 'Land Title Certificate',
      [PermitType.INDENTURE]: 'Indenture',
      [PermitType.SITE_PLAN]: 'Site Plan',
      [PermitType.SURVEY_PLAN]: 'Survey Plan',
      [PermitType.BUILDING_PERMIT]: 'Building Permit',
      [PermitType.DEVELOPMENT_PERMIT]: 'Development Permit',
      [PermitType.OCCUPANCY_CERTIFICATE]: 'Certificate of Occupancy',
      [PermitType.FIRE_SAFETY_CERTIFICATE]: 'Fire Safety Certificate',
      [PermitType.TIN_REGISTRATION]: 'Tax Identification Number (TIN)',
      [PermitType.VAT_REGISTRATION]: 'VAT Registration',
      [PermitType.SSNIT_REGISTRATION]: 'SSNIT Employer Registration',
      [PermitType.SSNIT_CLEARANCE]: 'SSNIT Clearance Certificate',
      [PermitType.WATER_CONNECTION]: 'Water Connection Approval',
      [PermitType.ELECTRICITY_CONNECTION]: 'Electricity Connection Approval',
      [PermitType.GIPC_REGISTRATION]: 'GIPC Registration',
    };
    return names[permitType] || permitType;
  }

  private async getBlockingDependencies(
    projectId: UUID,
    dependencies: PermitType[]
  ): Promise<string[]> {
    if (dependencies.length === 0) {
      return [];
    }

    const result = await this.query(
      `SELECT permit_type, status FROM pm_compliance_requirements 
       WHERE project_id = $1 AND permit_type = ANY($2)`,
      [projectId, dependencies]
    );

    const completed = new Set(
      result.rows
        .filter(r => r.status === 'approved' || r.status === 'completed')
        .map(r => r.permit_type)
    );

    return dependencies.filter(d => !completed.has(d));
  }

  private async unblockDependents(projectId: UUID, completedPermitType: PermitType): Promise<void> {
    // Find all requirements that were blocked by this permit type
    await this.query(
      `UPDATE pm_compliance_requirements 
       SET 
         blocked_by = array_remove(blocked_by, $1),
         status = CASE 
           WHEN array_length(array_remove(blocked_by, $1), 1) IS NULL OR array_length(array_remove(blocked_by, $1), 1) = 0 
           THEN 'not_started' 
           ELSE status 
         END,
         updated_at = NOW()
       WHERE project_id = $2 AND $1 = ANY(blocked_by)`,
      [completedPermitType, projectId]
    );
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const ghanaComplianceService = new GhanaComplianceServiceImpl();
