/**
 * Project Core Service
 * 
 * Phase 3.11: Split projectService
 * 
 * Core project operations:
 * - Create, read, update, delete projects
 * - Project number generation
 * - Organization-scoped queries
 * 
 * @module services/project-management/projects/ProjectCoreService
 */

import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../../database';
import { BaseService } from '../../base/BaseService';
import {
  DevelopmentProject,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectFilters,
  mapRowToProject,
} from './types';

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class ProjectCoreServiceImpl extends BaseService {
  constructor() {
    super('ProjectCoreService');
  }

  /**
   * Create a new project
   */
  async create(input: CreateProjectInput): Promise<DevelopmentProject> {
    const id = uuidv4();
    const projectNumber = await this.generateProjectNumber(input.organizationId);
    
    // Calculate acres if sqm provided
    const landSizeAcres = input.landSizeSqm 
      ? input.landSizeSqm / 4046.86 
      : undefined;

    const result = await this.query(
      `INSERT INTO development_projects (
         id, organization_id, project_number, name, description, project_type, status,
         address_line1, address_line2, city, region, country,
         ghana_post_gps, latitude, longitude,
         land_size_sqm, land_size_acres, land_title_number, land_cost,
         total_floors, total_buildings, total_budget,
         planned_start_date, planned_completion_date,
         developer_name, developer_contact, developer_email,
         project_manager_id, marketing_name, tagline, cover_image_url,
         amenities, auto_create_deals, default_pipeline_id, created_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6, 'planning',
         $7, $8, $9, $10, $11,
         $12, $13, $14,
         $15, $16, $17, $18,
         $19, $20, $21,
         $22, $23,
         $24, $25, $26,
         $27, $28, $29, $30,
         $31, $32, $33, $34
       )
       RETURNING *`,
      [
        id,
        input.organizationId,
        projectNumber,
        input.name,
        input.description,
        input.projectType,
        input.addressLine1,
        input.addressLine2,
        input.city,
        input.region,
        input.country || 'Ghana',
        input.ghanaPostGps,
        input.latitude,
        input.longitude,
        input.landSizeSqm,
        landSizeAcres,
        input.landTitleNumber,
        input.landCost,
        input.totalFloors,
        input.totalBuildings || 1,
        input.totalBudget || 0,
        input.plannedStartDate,
        input.plannedCompletionDate,
        input.developerName,
        input.developerContact,
        input.developerEmail,
        input.projectManagerId,
        input.marketingName,
        input.tagline,
        input.coverImageUrl,
        input.amenities || [],
        input.autoCreateDeals ?? false,
        input.defaultPipelineId,
        input.createdBy,
      ]
    );

    return mapRowToProject(result.rows[0]);
  }

  /**
   * Get project by ID
   */
  async getById(id: string, organizationId?: string): Promise<DevelopmentProject | null> {
    let query = 'SELECT * FROM development_projects WHERE id = $1 AND deleted_at IS NULL';
    const params: unknown[] = [id];

    if (organizationId) {
      query += ' AND organization_id = $2';
      params.push(organizationId);
    }

    const result = await this.query(query, params);
    return result.rows[0] ? mapRowToProject(result.rows[0]) : null;
  }

  /**
   * Get project by project number
   */
  async getByNumber(projectNumber: string, organizationId: string): Promise<DevelopmentProject | null> {
    const result = await this.query(
      `SELECT * FROM development_projects 
       WHERE project_number = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [projectNumber, organizationId]
    );

    return result.rows[0] ? mapRowToProject(result.rows[0]) : null;
  }

  /**
   * Get all projects with filters
   */
  async getAll(filters: ProjectFilters): Promise<{
    projects: DevelopmentProject[];
    total: number;
  }> {
    const conditions: string[] = ['organization_id = $1', 'deleted_at IS NULL'];
    const values: unknown[] = [filters.organizationId];
    let paramIndex = 2;

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(`status = ANY($${paramIndex++})`);
        values.push(filters.status);
      } else {
        conditions.push(`status = $${paramIndex++}`);
        values.push(filters.status);
      }
    }

    if (filters.projectType) {
      if (Array.isArray(filters.projectType)) {
        conditions.push(`project_type = ANY($${paramIndex++})`);
        values.push(filters.projectType);
      } else {
        conditions.push(`project_type = $${paramIndex++}`);
        values.push(filters.projectType);
      }
    }

    if (filters.city) {
      conditions.push(`city ILIKE $${paramIndex++}`);
      values.push(`%${filters.city}%`);
    }

    if (filters.region) {
      conditions.push(`region = $${paramIndex++}`);
      values.push(filters.region);
    }

    if (filters.projectManagerId) {
      conditions.push(`project_manager_id = $${paramIndex++}`);
      values.push(filters.projectManagerId);
    }

    if (filters.search) {
      conditions.push(`(name ILIKE $${paramIndex} OR project_number ILIKE $${paramIndex} OR marketing_name ILIKE $${paramIndex})`);
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    if (filters.minProgress !== undefined) {
      conditions.push(`overall_progress >= $${paramIndex++}`);
      values.push(filters.minProgress);
    }

    if (filters.maxProgress !== undefined) {
      conditions.push(`overall_progress <= $${paramIndex++}`);
      values.push(filters.maxProgress);
    }

    if (filters.dateFrom) {
      conditions.push(`created_at >= $${paramIndex++}`);
      values.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      conditions.push(`created_at <= $${paramIndex++}`);
      values.push(filters.dateTo);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await this.query(
      `SELECT COUNT(*) as total FROM development_projects WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].total);

    // Get paginated results
    let query = `SELECT * FROM development_projects WHERE ${whereClause} ORDER BY created_at DESC`;

    if (filters.limit) {
      query += ` LIMIT $${paramIndex++}`;
      values.push(filters.limit);
    }

    if (filters.offset) {
      query += ` OFFSET $${paramIndex++}`;
      values.push(filters.offset);
    }

    const result = await this.query(query, values);

    return {
      projects: result.rows.map(mapRowToProject),
      total,
    };
  }

  /**
   * Update a project
   */
  async update(
    id: string,
    organizationId: string,
    input: UpdateProjectInput
  ): Promise<DevelopmentProject | null> {
    const project = await this.getById(id, organizationId);
    if (!project) {
      return null;
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    // Build dynamic update
    const fieldMappings: Record<string, string> = {
      name: 'name',
      description: 'description',
      projectType: 'project_type',
      status: 'status',
      addressLine1: 'address_line1',
      addressLine2: 'address_line2',
      city: 'city',
      region: 'region',
      ghanaPostGps: 'ghana_post_gps',
      latitude: 'latitude',
      longitude: 'longitude',
      landSizeSqm: 'land_size_sqm',
      landTitleNumber: 'land_title_number',
      landCost: 'land_cost',
      totalFloors: 'total_floors',
      totalBuildings: 'total_buildings',
      totalBudget: 'total_budget',
      plannedStartDate: 'planned_start_date',
      actualStartDate: 'actual_start_date',
      plannedCompletionDate: 'planned_completion_date',
      estimatedCompletionDate: 'estimated_completion_date',
      actualCompletionDate: 'actual_completion_date',
      buildingPermitNumber: 'building_permit_number',
      buildingPermitDate: 'building_permit_date',
      environmentalPermitNumber: 'environmental_permit_number',
      fireSafetyCertificateNumber: 'fire_safety_certificate_number',
      developerName: 'developer_name',
      developerContact: 'developer_contact',
      developerEmail: 'developer_email',
      projectManagerId: 'project_manager_id',
      marketingName: 'marketing_name',
      tagline: 'tagline',
      websiteUrl: 'website_url',
      brochureUrl: 'brochure_url',
      coverImageUrl: 'cover_image_url',
      logoUrl: 'logo_url',
      galleryUrls: 'gallery_urls',
      amenities: 'amenities',
      settings: 'settings',
      metadata: 'metadata',
      autoCreateDeals: 'auto_create_deals',
      defaultPipelineId: 'default_pipeline_id',
    };

    for (const [key, column] of Object.entries(fieldMappings)) {
      const value = (input as any)[key];
      if (value !== undefined) {
        updates.push(`${column} = $${paramIndex++}`);
        values.push(value);
      }
    }

    if (input.updatedBy) {
      updates.push(`updated_by = $${paramIndex++}`);
      values.push(input.updatedBy);
    }

    if (updates.length === 0) {
      return project;
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);
    values.push(organizationId);

    const result = await this.query(
      `UPDATE development_projects SET ${updates.join(', ')} 
       WHERE id = $${paramIndex++} AND organization_id = $${paramIndex}
       RETURNING *`,
      values
    );

    return mapRowToProject(result.rows[0]);
  }

  /**
   * Soft delete a project
   */
  async delete(id: string, organizationId: string, deletedBy?: string): Promise<boolean> {
    const result = await this.query(
      `UPDATE development_projects 
       SET deleted_at = NOW(), updated_by = $3, status = 'cancelled'
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, organizationId, deletedBy]
    );

    return result.rowCount > 0;
  }

  /**
   * Hard delete a project (use with caution)
   */
  async hardDelete(id: string, organizationId: string): Promise<boolean> {
    return this.executeInTransaction(async (client) => {
      // Delete related records first
      await client.query('DELETE FROM project_phases WHERE project_id = $1', [id]);
      await client.query('DELETE FROM project_units WHERE project_id = $1', [id]);
      await client.query('DELETE FROM project_costs WHERE project_id = $1', [id]);
      await client.query('DELETE FROM project_documents WHERE project_id = $1', [id]);
      await client.query('DELETE FROM project_folders WHERE project_id = $1', [id]);
      
      const result = await client.query(
        'DELETE FROM development_projects WHERE id = $1 AND organization_id = $2 RETURNING id',
        [id, organizationId]
      );

      return result.rowCount > 0;
    });
  }

  /**
   * Check if project exists
   */
  async exists(id: string, organizationId?: string): Promise<boolean> {
    let query = 'SELECT 1 FROM development_projects WHERE id = $1 AND deleted_at IS NULL';
    const params: unknown[] = [id];

    if (organizationId) {
      query += ' AND organization_id = $2';
      params.push(organizationId);
    }

    const result = await this.query(query, params);
    return result.rowCount > 0;
  }

  /**
   * Get projects by manager
   */
  async getByManager(projectManagerId: string, organizationId: string): Promise<DevelopmentProject[]> {
    const result = await this.query(
      `SELECT * FROM development_projects 
       WHERE project_manager_id = $1 AND organization_id = $2 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [projectManagerId, organizationId]
    );

    return result.rows.map(mapRowToProject);
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Generate unique project number
   */
  private async generateProjectNumber(organizationId: string): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    
    const result = await this.query(
      `SELECT COUNT(*) + 1 as next 
       FROM development_projects 
       WHERE organization_id = $1 
       AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW())`,
      [organizationId]
    );

    const sequence = result.rows[0].next.toString().padStart(4, '0');
    return `PRJ-${year}-${sequence}`;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const projectCoreService = new ProjectCoreServiceImpl();
