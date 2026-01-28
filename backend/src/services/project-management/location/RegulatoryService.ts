/**
 * Regulatory Service
 * 
 * Phase 3.5: Split projectLocationService
 * 
 * Manages regulatory permits and authorities:
 * - Project permits (building, environmental, etc.)
 * - Traditional authorities (stool lands)
 * - District assemblies
 * - Required permits by project type
 * 
 * @module services/project-management/location/RegulatoryService
 */

import { pool } from '../../../database';
import { BaseService } from '../../base/BaseService';
import { eventBus } from '../events/EventBus';
import {
  ProjectPermit,
  PermitCreateInput,
  PermitStatus,
  GhanaPermitType,
  RequiredPermit,
  TraditionalAuthority,
  RegulatoryAssembly,
} from './types';

// =============================================================================
// PERMIT REQUIREMENTS BY PROJECT TYPE
// =============================================================================

const PERMIT_REQUIREMENTS: Record<string, GhanaPermitType[]> = {
  residential: ['building_permit', 'land_title_certificate', 'fire_certificate', 'water_connection', 'electricity_connection'],
  commercial: ['building_permit', 'development_permit', 'environmental_permit', 'fire_certificate', 'land_title_certificate'],
  mixed_use: ['building_permit', 'development_permit', 'environmental_permit', 'fire_certificate', 'land_title_certificate', 'water_connection', 'electricity_connection'],
  industrial: ['building_permit', 'development_permit', 'epa_permit', 'fire_certificate', 'land_title_certificate'],
  hospitality: ['building_permit', 'development_permit', 'fire_certificate', 'water_connection', 'electricity_connection'],
  retail: ['building_permit', 'fire_certificate', 'water_connection', 'electricity_connection'],
  office: ['building_permit', 'fire_certificate', 'water_connection', 'electricity_connection'],
  land: ['land_title_certificate'],
};

const PERMIT_DETAILS: Record<GhanaPermitType, { name: string; authority: string; description: string; timeline: string }> = {
  building_permit: {
    name: 'Building Permit',
    authority: 'Metropolitan/Municipal/District Assembly',
    description: 'Permission to construct or modify a building',
    timeline: '2-4 weeks',
  },
  development_permit: {
    name: 'Development Permit',
    authority: 'Town & Country Planning Department',
    description: 'Approval for land development and change of use',
    timeline: '4-8 weeks',
  },
  environmental_permit: {
    name: 'Environmental Permit',
    authority: 'Environmental Protection Agency (EPA)',
    description: 'Environmental impact assessment clearance',
    timeline: '8-12 weeks',
  },
  fire_certificate: {
    name: 'Fire Safety Certificate',
    authority: 'Ghana National Fire Service',
    description: 'Compliance with fire safety regulations',
    timeline: '2-3 weeks',
  },
  land_title_certificate: {
    name: 'Land Title Certificate',
    authority: 'Lands Commission',
    description: 'Official registration of land ownership',
    timeline: '3-6 months',
  },
  stool_land_consent: {
    name: 'Stool Land Consent',
    authority: 'Traditional Authority / Office of the Administrator of Stool Lands',
    description: 'Consent for development on stool/family lands',
    timeline: '2-4 weeks',
  },
  town_planning_approval: {
    name: 'Town Planning Approval',
    authority: 'Town & Country Planning Department',
    description: 'Zoning and planning compliance approval',
    timeline: '3-6 weeks',
  },
  epa_permit: {
    name: 'EPA Environmental Permit',
    authority: 'Environmental Protection Agency',
    description: 'Full environmental permit for industrial/large projects',
    timeline: '12-16 weeks',
  },
  water_connection: {
    name: 'Water Connection Approval',
    authority: 'Ghana Water Company Limited',
    description: 'Approval for water supply connection',
    timeline: '2-4 weeks',
  },
  electricity_connection: {
    name: 'Electricity Connection Approval',
    authority: 'Electricity Company of Ghana / NEDCo',
    description: 'Approval for electrical supply connection',
    timeline: '2-4 weeks',
  },
  occupancy_certificate: {
    name: 'Occupancy Certificate',
    authority: 'Metropolitan/Municipal/District Assembly',
    description: 'Certificate allowing building occupation',
    timeline: '2-3 weeks',
  },
  other: {
    name: 'Other Permit',
    authority: 'Various',
    description: 'Other regulatory permit',
    timeline: 'Varies',
  },
};

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class RegulatoryServiceImpl extends BaseService {
  constructor() {
    super('RegulatoryService');
  }

  // ==========================================================================
  // PERMIT MANAGEMENT
  // ==========================================================================

  async getProjectPermits(projectId: string): Promise<ProjectPermit[]> {
    const result = await this.query(
      `SELECT * FROM pm_project_permits
       WHERE project_id = $1
       ORDER BY permit_type, created_at`,
      [projectId]
    );

    return result.rows.map(this.mapPermitRow);
  }

  async addProjectPermit(input: PermitCreateInput): Promise<ProjectPermit> {
    const result = await this.query(
      `INSERT INTO pm_project_permits (
         project_id, permit_type, permit_number, issuing_authority,
         status, application_date, fee, fee_currency, notes, document_url
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        input.projectId,
        input.permitType,
        input.permitNumber || null,
        input.issuingAuthority,
        'pending',
        input.applicationDate || null,
        input.fee || null,
        input.feeCurrency || 'GHS',
        input.notes || null,
        input.documentUrl || null,
      ]
    );

    const permit = this.mapPermitRow(result.rows[0]);

    eventBus.emit('project.permit.added', {
      projectId: input.projectId,
      permitId: permit.id,
      permitType: input.permitType,
    });

    return permit;
  }

  async updatePermitStatus(
    permitId: string,
    status: PermitStatus,
    updates?: {
      permitNumber?: string;
      approvalDate?: Date;
      expiryDate?: Date;
      notes?: string;
      documentUrl?: string;
    }
  ): Promise<ProjectPermit | null> {
    const setClauses: string[] = ['status = $2', 'updated_at = NOW()'];
    const params: any[] = [permitId, status];
    let paramIndex = 3;

    if (updates?.permitNumber) {
      setClauses.push(`permit_number = $${paramIndex++}`);
      params.push(updates.permitNumber);
    }

    if (updates?.approvalDate) {
      setClauses.push(`approval_date = $${paramIndex++}`);
      params.push(updates.approvalDate);
    }

    if (updates?.expiryDate) {
      setClauses.push(`expiry_date = $${paramIndex++}`);
      params.push(updates.expiryDate);
    }

    if (updates?.notes) {
      setClauses.push(`notes = $${paramIndex++}`);
      params.push(updates.notes);
    }

    if (updates?.documentUrl) {
      setClauses.push(`document_url = $${paramIndex++}`);
      params.push(updates.documentUrl);
    }

    const result = await this.query(
      `UPDATE pm_project_permits SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );

    if (result.rows.length) {
      const permit = this.mapPermitRow(result.rows[0]);
      
      eventBus.emit('project.permit.status_changed', {
        permitId: permit.id,
        projectId: permit.projectId,
        status,
        previousStatus: result.rows[0].previous_status,
      });

      return permit;
    }

    return null;
  }

  async getRequiredPermits(params: {
    projectType: string;
    region?: string;
    landTenureType?: string;
  }): Promise<RequiredPermit[]> {
    const permitTypes = PERMIT_REQUIREMENTS[params.projectType] || ['building_permit'];
    
    // Add stool land consent if applicable
    if (params.landTenureType === 'stool_land_lease' || params.landTenureType === 'family_land') {
      if (!permitTypes.includes('stool_land_consent')) {
        permitTypes.push('stool_land_consent');
      }
    }

    return permitTypes.map(type => {
      const details = PERMIT_DETAILS[type];
      return {
        permitType: type,
        name: details.name,
        issuingAuthority: details.authority,
        description: details.description,
        typicalTimeline: details.timeline,
        required: true,
      };
    });
  }

  async getPermitComplianceStatus(projectId: string): Promise<{
    total: number;
    approved: number;
    pending: number;
    missing: number;
    expired: number;
    compliancePercentage: number;
    permits: Array<{
      permitType: GhanaPermitType;
      name: string;
      status: PermitStatus | 'missing';
      isRequired: boolean;
    }>;
  }> {
    // Get project type
    const projectResult = await this.query(
      `SELECT project_type, land_tenure_type FROM development_projects WHERE id = $1`,
      [projectId]
    );

    if (!projectResult.rows.length) {
      throw new Error('Project not found');
    }

    const { project_type, land_tenure_type } = projectResult.rows[0];
    const requiredPermits = await this.getRequiredPermits({
      projectType: project_type,
      landTenureType: land_tenure_type,
    });

    // Get existing permits
    const existingPermits = await this.getProjectPermits(projectId);
    const permitMap = new Map(existingPermits.map(p => [p.permitType, p]));

    // Build compliance report
    const permits = requiredPermits.map(req => {
      const existing = permitMap.get(req.permitType);
      return {
        permitType: req.permitType,
        name: req.name,
        status: existing ? existing.status : 'missing' as const,
        isRequired: req.required,
      };
    });

    const approved = permits.filter(p => p.status === 'approved').length;
    const pending = permits.filter(p => p.status === 'pending' || p.status === 'under_review').length;
    const missing = permits.filter(p => p.status === 'missing' || p.status === 'not_applied').length;
    const expired = permits.filter(p => p.status === 'expired').length;

    return {
      total: permits.length,
      approved,
      pending,
      missing,
      expired,
      compliancePercentage: permits.length > 0 ? Math.round((approved / permits.length) * 100) : 0,
      permits,
    };
  }

  // ==========================================================================
  // TRADITIONAL AUTHORITIES
  // ==========================================================================

  async getTraditionalAuthorities(params: {
    region?: string;
    district?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ authorities: TraditionalAuthority[]; total: number }> {
    const conditions: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (params.region) {
      conditions.push(`region ILIKE $${paramIndex++}`);
      queryParams.push(`%${params.region}%`);
    }

    if (params.district) {
      conditions.push(`district ILIKE $${paramIndex++}`);
      queryParams.push(`%${params.district}%`);
    }

    if (params.search) {
      conditions.push(`(name ILIKE $${paramIndex} OR chieftaincy_title ILIKE $${paramIndex})`);
      queryParams.push(`%${params.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const page = params.page || 1;
    const pageSize = params.pageSize || 50;
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      this.query(
        `SELECT * FROM dh_traditional_authorities ${whereClause}
         ORDER BY name
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...queryParams, pageSize, offset]
      ),
      this.query(
        `SELECT COUNT(*) as total FROM dh_traditional_authorities ${whereClause}`,
        queryParams
      ),
    ]);

    return {
      authorities: dataResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        chieftaincyTitle: row.chieftaincy_title,
        region: row.region,
        district: row.district,
        contactPerson: row.contact_person,
        phone: row.phone,
        email: row.email,
        address: row.address,
        notes: row.notes,
      })),
      total: parseInt(countResult.rows[0].total, 10),
    };
  }

  async findTraditionalAuthority(region: string, district?: string): Promise<TraditionalAuthority | null> {
    const params = district ? [region, district] : [region];
    const districtClause = district ? 'AND district ILIKE $2' : '';

    const result = await this.query(
      `SELECT * FROM dh_traditional_authorities
       WHERE region ILIKE $1 ${districtClause}
       LIMIT 1`,
      params
    );

    if (!result.rows.length) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      chieftaincyTitle: row.chieftaincy_title,
      region: row.region,
      district: row.district,
      contactPerson: row.contact_person,
      phone: row.phone,
      email: row.email,
      address: row.address,
      notes: row.notes,
    };
  }

  // ==========================================================================
  // REGULATORY ASSEMBLIES
  // ==========================================================================

  async getRegulatoryAssemblies(params: {
    region?: string;
    type?: 'metropolitan' | 'municipal' | 'district';
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ assemblies: RegulatoryAssembly[]; total: number }> {
    const conditions: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (params.region) {
      conditions.push(`region ILIKE $${paramIndex++}`);
      queryParams.push(`%${params.region}%`);
    }

    if (params.type) {
      conditions.push(`assembly_type = $${paramIndex++}`);
      queryParams.push(params.type);
    }

    if (params.search) {
      conditions.push(`(name ILIKE $${paramIndex} OR capital ILIKE $${paramIndex})`);
      queryParams.push(`%${params.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const page = params.page || 1;
    const pageSize = params.pageSize || 50;
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      this.query(
        `SELECT * FROM dh_assemblies ${whereClause}
         ORDER BY name
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...queryParams, pageSize, offset]
      ),
      this.query(
        `SELECT COUNT(*) as total FROM dh_assemblies ${whereClause}`,
        queryParams
      ),
    ]);

    return {
      assemblies: dataResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        type: row.assembly_type,
        region: row.region,
        capital: row.capital,
        contactPerson: row.contact_person,
        phone: row.phone,
        email: row.email,
        physicalAddress: row.physical_address,
        website: row.website,
      })),
      total: parseInt(countResult.rows[0].total, 10),
    };
  }

  async findRegulatoryAssembly(region: string, district?: string): Promise<RegulatoryAssembly | null> {
    const params = district ? [region, `%${district}%`] : [region];
    const districtClause = district ? 'AND (name ILIKE $2 OR capital ILIKE $2)' : '';

    const result = await this.query(
      `SELECT * FROM dh_assemblies
       WHERE region ILIKE $1 ${districtClause}
       LIMIT 1`,
      params
    );

    if (!result.rows.length) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      type: row.assembly_type,
      region: row.region,
      capital: row.capital,
      contactPerson: row.contact_person,
      phone: row.phone,
      email: row.email,
      physicalAddress: row.physical_address,
      website: row.website,
    };
  }

  async getAssembliesByRegion(region: string): Promise<RegulatoryAssembly[]> {
    const result = await this.query(
      `SELECT * FROM dh_assemblies
       WHERE region ILIKE $1
       ORDER BY assembly_type, name`,
      [`%${region}%`]
    );

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.assembly_type,
      region: row.region,
      capital: row.capital,
      contactPerson: row.contact_person,
      phone: row.phone,
      email: row.email,
      physicalAddress: row.physical_address,
      website: row.website,
    }));
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private mapPermitRow(row: any): ProjectPermit {
    return {
      id: row.id,
      projectId: row.project_id,
      permitType: row.permit_type,
      permitNumber: row.permit_number,
      issuingAuthority: row.issuing_authority,
      status: row.status,
      applicationDate: row.application_date ? new Date(row.application_date) : undefined,
      approvalDate: row.approval_date ? new Date(row.approval_date) : undefined,
      expiryDate: row.expiry_date ? new Date(row.expiry_date) : undefined,
      fee: row.fee,
      feeCurrency: row.fee_currency,
      notes: row.notes,
      documentUrl: row.document_url,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const regulatoryService = new RegulatoryServiceImpl();
