/**
 * Project Service
 * Phase 5.8 Week 1 - Development Project Management
 * Competitive Inspiration: Procore, Buildertrend, CoConstruct
 * 
 * @deprecated This file is deprecated. Use the new modular projects module:
 * 
 * import { 
 *   projectsFacade,
 *   projectCoreService,
 *   projectStatusService,
 *   projectStatsService 
 * } from './projects';
 * 
 * The monolithic service has been split into:
 * - ProjectCoreService: CRUD operations
 * - ProjectStatusService: Status management and transitions  
 * - ProjectStatsService: Statistics and summaries
 * 
 * This file remains for backward compatibility and will be removed in a future version.
 * 
 * Handles:
 * - Project CRUD with auto-number generation
 * - Status management and transitions
 * - Progress tracking and calculations
 * - CRM integration (auto-create deals on unit sales)
 * - Real-time event emissions for dashboard updates
 */

import { pool } from '../../database';
import { v4 as uuidv4 } from 'uuid';
import {
  emitProjectCreated,
  emitProjectUpdated,
  emitProjectStatusChanged,
  emitDashboardRefresh,
} from './projectRealtimeEvents';
import projectCostCurrencyService from './projectCostCurrencyService';

// ============================================================================
// TYPES
// ============================================================================

export type ProjectType = 
  | 'residential_single'
  | 'residential_multi'
  | 'mixed_use'
  | 'commercial'
  | 'industrial'
  | 'land_development'
  | 'renovation';

export type ProjectStatus = 
  | 'planning'
  | 'pre_construction'
  | 'under_construction'
  | 'finishing'
  | 'pre_handover'
  | 'handover'
  | 'completed'
  | 'on_hold'
  | 'cancelled';

export interface DevelopmentProject {
  id: string;
  organization_id: string;
  project_number: string;
  name: string;
  description?: string;
  project_type: ProjectType;
  status: ProjectStatus;
  
  // Location
  address_line1?: string;
  address_line2?: string;
  city?: string;
  region?: string;
  country: string;
  ghana_post_gps?: string;
  latitude?: number;
  longitude?: number;
  
  // Land details
  land_size_sqm?: number;
  land_size_acres?: number;
  land_title_number?: string;
  land_acquisition_date?: Date;
  land_cost?: number;
  
  // Scale
  total_units: number;
  total_floors?: number;
  total_buildings: number;
  total_sqm?: number;
  
  // Financial
  total_budget: number;
  total_spent: number;
  total_committed: number;
  projected_revenue: number;
  actual_revenue: number;
  display_currency?: string;
  
  // Timeline
  planned_start_date?: Date;
  actual_start_date?: Date;
  planned_completion_date?: Date;
  estimated_completion_date?: Date;
  actual_completion_date?: Date;
  
  // Progress
  overall_progress: number;
  construction_progress: number;
  sales_progress: number;
  
  // Permits
  building_permit_number?: string;
  building_permit_date?: Date;
  environmental_permit_number?: string;
  fire_safety_certificate_number?: string;
  
  // Developer
  developer_name?: string;
  developer_contact?: string;
  developer_email?: string;
  
  // Project manager
  project_manager_id?: string;
  
  // Marketing
  marketing_name?: string;
  tagline?: string;
  website_url?: string;
  brochure_url?: string;
  
  // Images
  cover_image_url?: string;
  logo_url?: string;
  gallery_urls: string[];
  
  // Features
  amenities: string[];
  
  // Settings
  settings: Record<string, any>;
  metadata: Record<string, any>;
  
  // CRM integration
  linked_property_id?: string;
  auto_create_deals: boolean;
  default_pipeline_id?: string;
  
  // Audit
  created_by?: string;
  updated_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateProjectInput {
  organization_id: string;
  name: string;
  description?: string;
  project_type: ProjectType;
  
  // Location (optional at creation)
  address_line1?: string;
  address_line2?: string;
  city?: string;
  region?: string;
  country?: string;
  ghana_post_gps?: string;
  latitude?: number;
  longitude?: number;
  
  // Land details
  land_size_sqm?: number;
  land_title_number?: string;
  land_cost?: number;
  
  // Scale
  total_floors?: number;
  total_buildings?: number;
  
  // Financial
  total_budget?: number;
  
  // Timeline
  planned_start_date?: Date;
  planned_completion_date?: Date;
  
  // Developer
  developer_name?: string;
  developer_contact?: string;
  developer_email?: string;
  
  // Project manager
  project_manager_id?: string;
  
  // Marketing
  marketing_name?: string;
  tagline?: string;
  
  // Images
  cover_image_url?: string;
  
  // Amenities
  amenities?: string[];
  
  // CRM integration
  auto_create_deals?: boolean;
  default_pipeline_id?: string;
  
  // Template to use for phases
  phase_template_id?: string;
  
  // Who's creating
  created_by?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  project_type?: ProjectType;
  status?: ProjectStatus;
  
  address_line1?: string;
  address_line2?: string;
  city?: string;
  region?: string;
  ghana_post_gps?: string;
  latitude?: number;
  longitude?: number;
  
  land_size_sqm?: number;
  land_title_number?: string;
  land_cost?: number;
  
  total_floors?: number;
  total_buildings?: number;
  
  total_budget?: number;
  
  planned_start_date?: Date;
  actual_start_date?: Date;
  planned_completion_date?: Date;
  estimated_completion_date?: Date;
  actual_completion_date?: Date;
  
  building_permit_number?: string;
  building_permit_date?: Date;
  environmental_permit_number?: string;
  fire_safety_certificate_number?: string;
  
  developer_name?: string;
  developer_contact?: string;
  developer_email?: string;
  
  project_manager_id?: string;
  
  marketing_name?: string;
  tagline?: string;
  website_url?: string;
  brochure_url?: string;
  
  cover_image_url?: string;
  logo_url?: string;
  gallery_urls?: string[];
  
  amenities?: string[];
  settings?: Record<string, any>;
  metadata?: Record<string, any>;
  
  auto_create_deals?: boolean;
  default_pipeline_id?: string;
  
  updated_by?: string;
}

export interface ProjectFilters {
  organization_id: string;
  status?: ProjectStatus | ProjectStatus[];
  project_type?: ProjectType | ProjectType[];
  city?: string;
  region?: string;
  project_manager_id?: string;
  search?: string;
  min_progress?: number;
  max_progress?: number;
  date_from?: Date;
  date_to?: Date;
  /** When set, only return projects assigned to this user (via project_manager_id or project_team_members) */
  assigned_user_id?: string;
}

export interface ProjectStats {
  total_projects: number;
  by_status: Record<ProjectStatus, number>;
  by_type: Record<ProjectType, number>;
  total_units: number;
  units_sold: number;
  units_available: number;
  total_budget: number;
  total_spent: number;
  total_revenue: number;
  avg_progress: number;
}

export interface ProjectSummary {
  id: string;
  project_number: string;
  name: string;
  project_type: ProjectType;
  status: ProjectStatus;
  city?: string;
  region?: string;
  total_units: number;
  units_available: number;
  units_reserved: number;
  units_sold: number;
  units_handed_over: number;
  overall_progress: number;
  construction_progress: number;
  sales_progress: number;
  total_budget: number;
  total_spent: number;
  projected_revenue: number;
  actual_revenue: number;
  cover_image_url?: string;
  days_to_completion?: number;
  phases_completed: number;
  phases_total: number;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class ProjectService {
  // --------------------------------------------------------------------------
  // CREATE
  // --------------------------------------------------------------------------

  async create(input: CreateProjectInput): Promise<DevelopmentProject> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Generate project number
      const numberResult = await client.query(
        'SELECT generate_project_number($1) as project_number',
        [input.organization_id]
      );
      const projectNumber = numberResult.rows[0].project_number;
      
      // Calculate acres from sqm if provided
      let landSizeAcres: number | null = null;
      if (input.land_size_sqm) {
        landSizeAcres = input.land_size_sqm / 4046.86;
      }
      
      const id = uuidv4();
      const result = await client.query(
        `INSERT INTO development_projects (
          id, organization_id, project_number, name, description,
          project_type, status,
          address_line1, address_line2, city, region, country,
          ghana_post_gps, latitude, longitude,
          land_size_sqm, land_size_acres, land_title_number, land_cost,
          total_floors, total_buildings,
          total_budget,
          planned_start_date, planned_completion_date,
          developer_name, developer_contact, developer_email,
          project_manager_id,
          marketing_name, tagline,
          cover_image_url,
          amenities,
          auto_create_deals, default_pipeline_id,
          created_by
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, 'planning',
          $7, $8, $9, $10, $11,
          $12, $13, $14,
          $15, $16, $17, $18,
          $19, $20,
          $21,
          $22, $23,
          $24, $25, $26,
          $27,
          $28, $29,
          $30,
          $31,
          $32, $33,
          $34
        ) RETURNING *`,
        [
          id, input.organization_id, projectNumber, input.name, input.description,
          input.project_type,
          input.address_line1, input.address_line2, input.city, input.region, input.country || 'Ghana',
          input.ghana_post_gps, input.latitude, input.longitude,
          input.land_size_sqm, landSizeAcres, input.land_title_number, input.land_cost,
          input.total_floors, input.total_buildings || 1,
          input.total_budget || 0,
          input.planned_start_date, input.planned_completion_date,
          input.developer_name, input.developer_contact, input.developer_email,
          input.project_manager_id,
          input.marketing_name, input.tagline,
          input.cover_image_url,
          JSON.stringify(input.amenities || []),
          input.auto_create_deals !== false, input.default_pipeline_id,
          input.created_by
        ]
      );
      
      const project = this.mapRow(result.rows[0]);
      
      // If phase template specified, create phases from template
      if (input.phase_template_id) {
        await this.createPhasesFromTemplate(
          client, 
          id, 
          input.organization_id, 
          input.phase_template_id,
          input.planned_start_date,
          input.created_by
        );
      }
      
      await client.query('COMMIT');
      
      // Emit realtime event for dashboard updates
      emitProjectCreated(
        input.organization_id,
        {
          id: project.id,
          name: project.name,
          projectType: project.project_type,
          status: project.status,
          totalBudget: project.total_budget,
        },
        input.created_by
      ).catch(() => {}); // Fire and forget
      
      return project;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async createPhasesFromTemplate(
    client: any,
    projectId: string,
    organizationId: string,
    templateId: string,
    startDate?: Date,
    createdBy?: string
  ): Promise<void> {
    // Get template
    const templateResult = await client.query(
      'SELECT phases FROM project_phase_templates WHERE id = $1',
      [templateId]
    );
    
    if (templateResult.rows.length === 0) {
      return;
    }
    
    const phases = templateResult.rows[0].phases as any[];
    let currentDate = startDate ? new Date(startDate) : new Date();
    
    for (const phase of phases) {
      const plannedEndDate = new Date(currentDate);
      plannedEndDate.setDate(plannedEndDate.getDate() + (phase.duration_days || 30));
      
      await client.query(
        `INSERT INTO project_phases (
          id, project_id, organization_id,
          phase_number, name, weight, duration_days,
          planned_start_date, planned_end_date,
          color, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          uuidv4(), projectId, organizationId,
          phase.phase_number, phase.name, phase.weight, phase.duration_days,
          currentDate, plannedEndDate,
          phase.color || '#3B82F6', createdBy
        ]
      );
      
      // Next phase starts after this one ends
      currentDate = new Date(plannedEndDate);
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  // --------------------------------------------------------------------------
  // READ
  // --------------------------------------------------------------------------

  async getById(id: string, organizationId: string): Promise<DevelopmentProject | null> {
    const result = await pool.query(
      `SELECT * FROM development_projects 
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, organizationId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRow(result.rows[0]);
  }

  async getByNumber(projectNumber: string, organizationId: string): Promise<DevelopmentProject | null> {
    const result = await pool.query(
      `SELECT * FROM development_projects 
       WHERE project_number = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [projectNumber, organizationId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRow(result.rows[0]);
  }

  async getAll(
    filters: ProjectFilters,
    page: number = 1,
    limit: number = 20,
    sortBy: string = 'created_at',
    sortOrder: 'asc' | 'desc' = 'desc'
  ): Promise<{ projects: DevelopmentProject[]; total: number; page: number; limit: number }> {
    const conditions: string[] = ['organization_id = $1', 'deleted_at IS NULL'];
    const params: any[] = [filters.organization_id];
    let paramIndex = 2;
    
    // Status filter
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(`status = ANY($${paramIndex})`);
        params.push(filters.status);
      } else {
        conditions.push(`status = $${paramIndex}`);
        params.push(filters.status);
      }
      paramIndex++;
    }
    
    // Type filter
    if (filters.project_type) {
      if (Array.isArray(filters.project_type)) {
        conditions.push(`project_type = ANY($${paramIndex})`);
        params.push(filters.project_type);
      } else {
        conditions.push(`project_type = $${paramIndex}`);
        params.push(filters.project_type);
      }
      paramIndex++;
    }
    
    // Location filters
    if (filters.city) {
      conditions.push(`city ILIKE $${paramIndex}`);
      params.push(`%${filters.city}%`);
      paramIndex++;
    }
    
    if (filters.region) {
      conditions.push(`region ILIKE $${paramIndex}`);
      params.push(`%${filters.region}%`);
      paramIndex++;
    }
    
    // Project manager filter
    if (filters.project_manager_id) {
      conditions.push(`project_manager_id = $${paramIndex}`);
      params.push(filters.project_manager_id);
      paramIndex++;
    }
    
    // Assignment-based scoping: only show projects assigned to this user
    if (filters.assigned_user_id) {
      conditions.push(`(
        project_manager_id = $${paramIndex} OR
        id IN (SELECT project_id FROM project_team_members WHERE user_id = $${paramIndex} AND is_active = true)
      )`);
      params.push(filters.assigned_user_id);
      paramIndex++;
    }
    
    // Search
    if (filters.search) {
      conditions.push(`(
        name ILIKE $${paramIndex} OR 
        project_number ILIKE $${paramIndex} OR
        marketing_name ILIKE $${paramIndex} OR
        city ILIKE $${paramIndex}
      )`);
      params.push(`%${filters.search}%`);
      paramIndex++;
    }
    
    // Progress filters
    if (filters.min_progress !== undefined) {
      conditions.push(`overall_progress >= $${paramIndex}`);
      params.push(filters.min_progress);
      paramIndex++;
    }
    
    if (filters.max_progress !== undefined) {
      conditions.push(`overall_progress <= $${paramIndex}`);
      params.push(filters.max_progress);
      paramIndex++;
    }
    
    // Date filters
    if (filters.date_from) {
      conditions.push(`planned_start_date >= $${paramIndex}`);
      params.push(filters.date_from);
      paramIndex++;
    }
    
    if (filters.date_to) {
      conditions.push(`planned_completion_date <= $${paramIndex}`);
      params.push(filters.date_to);
      paramIndex++;
    }
    
    const whereClause = conditions.join(' AND ');
    
    // Validate sort column
    const validSortColumns = [
      'created_at', 'updated_at', 'name', 'project_number', 
      'status', 'overall_progress', 'planned_start_date', 'planned_completion_date',
      'total_budget', 'total_units'
    ];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const sortDir = sortOrder === 'asc' ? 'ASC' : 'DESC';
    
    // Count total
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM development_projects WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);
    
    // Get paginated results
    const offset = (page - 1) * limit;
    params.push(limit, offset);
    
    const result = await pool.query(
      `SELECT * FROM development_projects 
       WHERE ${whereClause}
       ORDER BY ${sortColumn} ${sortDir}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );
    
    return {
      projects: result.rows.map(row => this.mapRow(row)),
      total,
      page,
      limit
    };
  }

  async getSummaries(organizationId: string, assignedUserId?: string): Promise<ProjectSummary[]> {
    let query = `SELECT * FROM v_project_summary WHERE organization_id = $1`;
    const params: any[] = [organizationId];

    if (assignedUserId) {
      query += ` AND (id IN (SELECT id FROM development_projects WHERE project_manager_id = $2) OR id IN (SELECT project_id FROM project_team_members WHERE user_id = $2 AND is_active = true))`;
      params.push(assignedUserId);
    }

    query += ` ORDER BY created_at DESC`;
    const result = await pool.query(query, params);
    
    return result.rows.map(row => ({
      id: row.id,
      project_number: row.project_number,
      name: row.name,
      project_name: row.name,
      project_type: row.project_type,
      status: row.status,
      city: row.city,
      region: row.region,
      total_units: row.total_units || 0,
      units_available: parseInt(row.units_available) || 0,
      units_reserved: parseInt(row.units_reserved) || 0,
      units_sold: parseInt(row.units_sold) || 0,
      units_handed_over: parseInt(row.units_handed_over) || 0,
      overall_progress: parseFloat(row.overall_progress) || 0,
      construction_progress: parseFloat(row.construction_progress) || 0,
      sales_progress: parseFloat(row.sales_progress) || 0,
      total_budget: parseFloat(row.total_budget) || 0,
      total_spent: parseFloat(row.total_spent) || 0,
      projected_revenue: parseFloat(row.projected_revenue) || 0,
      actual_revenue: parseFloat(row.actual_revenue) || 0,
      cover_image_url: row.cover_image_url,
      days_to_completion: row.days_to_completion,
      phases_completed: parseInt(row.phases_completed) || 0,
      phases_total: parseInt(row.phases_total) || 0
    }));
  }

  // --------------------------------------------------------------------------
  // UPDATE
  // --------------------------------------------------------------------------

  async update(
    id: string, 
    organizationId: string, 
    input: UpdateProjectInput
  ): Promise<DevelopmentProject | null> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;
    
    // Build dynamic update
    const updateFields = Object.entries(input).filter(([_, value]) => value !== undefined);
    
    for (const [key, value] of updateFields) {
      if (key === 'amenities' || key === 'gallery_urls') {
        updates.push(`${key} = $${paramIndex}`);
        params.push(JSON.stringify(value));
      } else if (key === 'settings' || key === 'metadata') {
        updates.push(`${key} = $${paramIndex}`);
        params.push(JSON.stringify(value));
      } else if (key === 'land_size_sqm') {
        updates.push(`land_size_sqm = $${paramIndex}`);
        params.push(value);
        paramIndex++;
        updates.push(`land_size_acres = $${paramIndex}`);
        params.push((value as number) / 4046.86);
      } else {
        updates.push(`${key} = $${paramIndex}`);
        params.push(value);
      }
      paramIndex++;
    }
    
    if (updates.length === 0) {
      return this.getById(id, organizationId);
    }
    
    updates.push(`updated_at = NOW()`);
    params.push(id, organizationId);
    
    const result = await pool.query(
      `UPDATE development_projects 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1} AND deleted_at IS NULL
       RETURNING *`,
      params
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const project = this.mapRow(result.rows[0]);
    
    // Emit realtime event for dashboard updates
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    for (const [key, value] of updateFields) {
      changes[key] = { old: undefined, new: value };
    }
    emitProjectUpdated(
      organizationId,
      id,
      changes,
      input.updated_by as string | undefined
    ).catch(() => {});
    
    return project;
  }

  async updateStatus(
    id: string,
    organizationId: string,
    newStatus: ProjectStatus,
    updatedBy?: string
  ): Promise<DevelopmentProject | null> {
    // Get current status before update
    const currentProject = await this.getById(id, organizationId);
    const oldStatus = currentProject?.status;
    
    // Handle status-specific updates
    const statusUpdates: Record<string, any> = {
      status: newStatus,
      updated_by: updatedBy
    };
    
    if (newStatus === 'under_construction' && !await this.hasActualStartDate(id)) {
      statusUpdates.actual_start_date = new Date();
    }
    
    if (newStatus === 'completed') {
      statusUpdates.actual_completion_date = new Date();
      statusUpdates.overall_progress = 100;
      statusUpdates.construction_progress = 100;
    }
    
    const updated = await this.update(id, organizationId, statusUpdates);
    
    // Emit status change event
    if (updated && oldStatus !== newStatus) {
      emitProjectStatusChanged(
        organizationId,
        {
          id: updated.id,
          name: updated.name,
          oldStatus: oldStatus || 'unknown',
          newStatus,
          progress: updated.overall_progress,
        },
        updatedBy
      ).catch(() => {});
    }
    
    return updated;
  }

  private async hasActualStartDate(id: string): Promise<boolean> {
    const result = await pool.query(
      'SELECT actual_start_date FROM development_projects WHERE id = $1',
      [id]
    );
    return result.rows.length > 0 && result.rows[0].actual_start_date !== null;
  }

  // --------------------------------------------------------------------------
  // DELETE
  // --------------------------------------------------------------------------

  async delete(id: string, organizationId: string, deletedBy?: string): Promise<boolean> {
    const result = await pool.query(
      `UPDATE development_projects 
       SET deleted_at = NOW(), updated_by = $3
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, organizationId, deletedBy]
    );
    
    return result.rows.length > 0;
  }

  async hardDelete(id: string, organizationId: string): Promise<boolean> {
    // Only allow hard delete if project has no units or other related data
    const unitsResult = await pool.query(
      'SELECT COUNT(*) FROM project_units WHERE project_id = $1',
      [id]
    );
    
    if (parseInt(unitsResult.rows[0].count, 10) > 0) {
      throw new Error('Cannot delete project with units. Use soft delete instead.');
    }
    
    const result = await pool.query(
      'DELETE FROM development_projects WHERE id = $1 AND organization_id = $2 RETURNING id',
      [id, organizationId]
    );
    
    return result.rows.length > 0;
  }

  // --------------------------------------------------------------------------
  // STATS
  // --------------------------------------------------------------------------

  async getStats(organizationId: string, assignedUserId?: string): Promise<ProjectStats> {
    // Build assignment filter
    const assignmentClause = assignedUserId
      ? ` AND (project_manager_id = $2 OR id IN (SELECT project_id FROM project_team_members WHERE user_id = $2 AND is_active = true))`
      : '';
    const params: any[] = [organizationId];
    if (assignedUserId) params.push(assignedUserId);

    // Get project counts by status and type
    const projectResult = await pool.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'planning') as planning,
        COUNT(*) FILTER (WHERE status = 'pre_construction') as pre_construction,
        COUNT(*) FILTER (WHERE status = 'under_construction') as under_construction,
        COUNT(*) FILTER (WHERE status = 'finishing') as finishing,
        COUNT(*) FILTER (WHERE status = 'pre_handover') as pre_handover,
        COUNT(*) FILTER (WHERE status = 'handover') as handover,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'on_hold') as on_hold,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        COUNT(*) FILTER (WHERE project_type = 'residential_single') as type_residential_single,
        COUNT(*) FILTER (WHERE project_type = 'residential_multi') as type_residential_multi,
        COUNT(*) FILTER (WHERE project_type = 'mixed_use') as type_mixed_use,
        COUNT(*) FILTER (WHERE project_type = 'commercial') as type_commercial,
        COUNT(*) FILTER (WHERE project_type = 'industrial') as type_industrial,
        COUNT(*) FILTER (WHERE project_type = 'land_development') as type_land_development,
        COUNT(*) FILTER (WHERE project_type = 'renovation') as type_renovation,
        COALESCE(AVG(overall_progress), 0) as avg_progress
       FROM development_projects 
       WHERE organization_id = $1 AND deleted_at IS NULL${assignmentClause}`,
      params
    );

    // Get per-project financial data with currency for FX normalization
    const finResult = await pool.query(
      `SELECT COALESCE(display_currency, 'GHS') as display_currency,
              COALESCE(total_budget, 0) as total_budget,
              COALESCE(total_spent, 0) as total_spent,
              COALESCE(actual_revenue, 0) as actual_revenue
       FROM development_projects
       WHERE organization_id = $1 AND deleted_at IS NULL${assignmentClause}`,
      params
    );

    // Fetch live FX rates for normalization to GHS
    let fxRates: Record<string, number> = { GHS: 1 };
    try {
      const ratesData = await projectCostCurrencyService.getAllExchangeRates();
      // ratesData.rates is currency→GHS (e.g. USD→GHS = 16)
      for (const [cur, rate] of Object.entries(ratesData.rates)) {
        fxRates[cur] = rate as number;
      }
    } catch { /* fallback: treat everything as GHS */ }

    let totalBudgetGHS = 0;
    let totalSpentGHS = 0;
    let totalRevenueGHS = 0;
    for (const row of finResult.rows) {
      const cur = row.display_currency || 'GHS';
      const rate = fxRates[cur] || 1;
      totalBudgetGHS += parseFloat(row.total_budget) * rate;
      totalSpentGHS += parseFloat(row.total_spent) * rate;
      totalRevenueGHS += parseFloat(row.actual_revenue) * rate;
    }
    
    // Get unit counts
    const unitAssignmentClause = assignedUserId
      ? ` AND (p.project_manager_id = $2 OR p.id IN (SELECT project_id FROM project_team_members WHERE user_id = $2 AND is_active = true))`
      : '';
    const unitResult = await pool.query(
      `SELECT 
        COUNT(*) as total_units,
        COUNT(*) FILTER (WHERE u.status IN ('sold', 'handed_over')) as units_sold,
        COUNT(*) FILTER (WHERE u.status = 'available') as units_available
       FROM project_units u
       JOIN development_projects p ON p.id = u.project_id
       WHERE p.organization_id = $1 AND p.deleted_at IS NULL${unitAssignmentClause}`,
      params
    );
    
    const p = projectResult.rows[0];
    const u = unitResult.rows[0];

    // Include FX rate info for frontend display
    const usdRate = fxRates['USD'] || null;
    
    return {
      total_projects: parseInt(p.total, 10),
      by_status: {
        planning: parseInt(p.planning, 10),
        pre_construction: parseInt(p.pre_construction, 10),
        under_construction: parseInt(p.under_construction, 10),
        finishing: parseInt(p.finishing, 10),
        pre_handover: parseInt(p.pre_handover, 10),
        handover: parseInt(p.handover, 10),
        completed: parseInt(p.completed, 10),
        on_hold: parseInt(p.on_hold, 10),
        cancelled: parseInt(p.cancelled, 10)
      },
      by_type: {
        residential_single: parseInt(p.type_residential_single, 10),
        residential_multi: parseInt(p.type_residential_multi, 10),
        mixed_use: parseInt(p.type_mixed_use, 10),
        commercial: parseInt(p.type_commercial, 10),
        industrial: parseInt(p.type_industrial, 10),
        land_development: parseInt(p.type_land_development, 10),
        renovation: parseInt(p.type_renovation, 10)
      },
      total_units: parseInt(u.total_units, 10),
      units_sold: parseInt(u.units_sold, 10),
      units_available: parseInt(u.units_available, 10),
      total_budget: Math.round(totalBudgetGHS * 100) / 100,
      total_spent: Math.round(totalSpentGHS * 100) / 100,
      total_revenue: Math.round(totalRevenueGHS * 100) / 100,
      avg_progress: parseFloat(p.avg_progress),
      display_currency: 'GHS',
      fx_rates: usdRate ? { USD: usdRate } : undefined,
    } as any;
  }

  // --------------------------------------------------------------------------
  // PHASE TEMPLATES
  // --------------------------------------------------------------------------

  async getPhaseTemplates(
    organizationId: string, 
    projectType?: ProjectType
  ): Promise<any[]> {
    let query = `
      SELECT * FROM project_phase_templates 
      WHERE (organization_id = $1 OR is_system = true) AND is_active = true
    `;
    const params: any[] = [organizationId];
    
    if (projectType) {
      // Support partial matching: 'residential' matches 'residential_single', 'residential_multi'
      // Cast enum to text for LIKE pattern matching
      query += ` AND (project_type::text LIKE $2 OR project_type IS NULL)`;
      params.push(`${projectType}%`);
    }
    
    query += ` ORDER BY is_system DESC, template_name ASC`;
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  async createPhaseTemplate(
    organizationId: string,
    templateName: string,
    phases: any[],
    projectType?: ProjectType
  ): Promise<any> {
    const result = await pool.query(
      `INSERT INTO project_phase_templates (
        id, organization_id, template_name, project_type, phases, is_system
      ) VALUES ($1, $2, $3, $4, $5, false)
      RETURNING *`,
      [uuidv4(), organizationId, templateName, projectType, JSON.stringify(phases)]
    );
    
    return result.rows[0];
  }

  // --------------------------------------------------------------------------
  // HELPER METHODS
  // --------------------------------------------------------------------------

  private mapRow(row: any): DevelopmentProject {
    return {
      id: row.id,
      organization_id: row.organization_id,
      project_number: row.project_number,
      name: row.name,
      description: row.description,
      project_type: row.project_type,
      status: row.status,

      address_line1: row.address_line1,
      address_line2: row.address_line2,
      city: row.city,
      region: row.region,
      country: row.country,
      ghana_post_gps: row.ghana_post_gps,
      latitude: row.latitude ? parseFloat(row.latitude) : undefined,
      longitude: row.longitude ? parseFloat(row.longitude) : undefined,
      
      land_size_sqm: row.land_size_sqm ? parseFloat(row.land_size_sqm) : undefined,
      land_size_acres: row.land_size_acres ? parseFloat(row.land_size_acres) : undefined,
      land_title_number: row.land_title_number,
      land_acquisition_date: row.land_acquisition_date,
      land_cost: row.land_cost ? parseFloat(row.land_cost) : undefined,
      
      total_units: row.total_units || 0,
      total_floors: row.total_floors,
      total_buildings: row.total_buildings || 1,
      total_sqm: row.total_sqm ? parseFloat(row.total_sqm) : undefined,
      
      total_budget: parseFloat(row.total_budget) || 0,
      total_spent: parseFloat(row.total_spent) || 0,
      total_committed: parseFloat(row.total_committed) || 0,
      projected_revenue: parseFloat(row.projected_revenue) || 0,
      actual_revenue: parseFloat(row.actual_revenue) || 0,
      display_currency: row.display_currency || 'GHS',
      
      planned_start_date: row.planned_start_date,
      actual_start_date: row.actual_start_date,
      planned_completion_date: row.planned_completion_date,
      estimated_completion_date: row.estimated_completion_date,
      actual_completion_date: row.actual_completion_date,
      
      overall_progress: parseFloat(row.overall_progress) || 0,
      construction_progress: parseFloat(row.construction_progress) || 0,
      sales_progress: parseFloat(row.sales_progress) || 0,
      
      building_permit_number: row.building_permit_number,
      building_permit_date: row.building_permit_date,
      environmental_permit_number: row.environmental_permit_number,
      fire_safety_certificate_number: row.fire_safety_certificate_number,
      
      developer_name: row.developer_name,
      developer_contact: row.developer_contact,
      developer_email: row.developer_email,
      
      project_manager_id: row.project_manager_id,
      
      marketing_name: row.marketing_name,
      tagline: row.tagline,
      website_url: row.website_url,
      brochure_url: row.brochure_url,
      
      cover_image_url: row.cover_image_url,
      logo_url: row.logo_url,
      gallery_urls: row.gallery_urls || [],
      
      amenities: row.amenities || [],
      
      settings: row.settings || {},
      metadata: row.metadata || {},
      
      linked_property_id: row.linked_property_id,
      auto_create_deals: row.auto_create_deals,
      default_pipeline_id: row.default_pipeline_id,
      
      created_by: row.created_by,
      updated_by: row.updated_by,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

export const projectService = new ProjectService();
export default projectService;
