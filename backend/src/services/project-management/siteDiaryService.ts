/**
 * Site Diaries Service
 * Manages daily site logs, inspections, labor tracking
 * 
 * @deprecated This service has been replaced by SiteOperationsService.
 *             Please migrate to: import { siteOperationsService } from './operations'
 *             This file will be removed in the next major version.
 *             Migration Date: 2024-01-XX
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export interface SiteDiaryFilters {
  organizationId?: string;
  projectId?: string;
  fromDate?: string;
  toDate?: string;
  createdBy?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateSiteDiaryDTO {
  projectId: string;
  reportDate: string;
  weatherCondition?: string;
  temperatureCelsius?: number;
  
  // Labor
  laborCount?: number;
  informalLaborCount?: number;
  informalLaborNotes?: string;
  laborDetails?: {
    trade: string;
    count: number;
    notes?: string;
  }[];
  
  // Work
  workPerformed?: string;
  plannedWork?: string;
  
  // Materials
  materialsUsed?: string[];
  materialsReceived?: string[];
  
  // Issues
  incidentsOrDelays?: string;
  safetyObservations?: string;
  
  // Photos
  photoIds?: string[];
  
  // Visitors
  visitors?: string[];
  
  submittedBy: string;
  submissionSource?: 'web' | 'whatsapp' | 'mobile_app';
}

export class SiteDiaryService {
  constructor(private pool: Pool) {}

  async createSiteDiary(dto: CreateSiteDiaryDTO): Promise<any> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const id = uuidv4();
      
      // Check if entry exists for this date
      const existing = await client.query(
        `SELECT id FROM project_site_diaries WHERE project_id = $1 AND report_date = $2`,
        [dto.projectId, dto.reportDate]
      );

      if (existing.rows.length > 0) {
        // Update existing
        const result = await client.query(
          `UPDATE project_site_diaries SET
            weather_condition = COALESCE($1, weather_condition),
            temperature_celsius = COALESCE($2, temperature_celsius),
            informal_labor_count = COALESCE($3, informal_labor_count),
            informal_labor_notes = COALESCE($4, informal_labor_notes),
            work_performed = COALESCE($5, work_performed),
            indecents_or_delays = COALESCE($6, indecents_or_delays),
            submission_source = COALESCE($7, submission_source),
            submitted_by = COALESCE($8, submitted_by),
            updated_at = NOW()
          WHERE id = $9
          RETURNING *`,
          [
            dto.weatherCondition, dto.temperatureCelsius, dto.informalLaborCount,
            dto.informalLaborNotes, dto.workPerformed, dto.incidentsOrDelays,
            dto.submissionSource, dto.submittedBy, existing.rows[0].id
          ]
        );

        await client.query('COMMIT');
        return this.getSiteDiaryById(existing.rows[0].id);
      }

      // Insert new
      const result = await client.query(
        `INSERT INTO project_site_diaries (
          id, project_id, report_date, weather_condition, temperature_celsius,
          informal_labor_count, informal_labor_notes, work_performed,
          indecents_or_delays, submission_source, submitted_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          id, dto.projectId, dto.reportDate, dto.weatherCondition || null, dto.temperatureCelsius || null,
          dto.informalLaborCount || 0, dto.informalLaborNotes || null, dto.workPerformed || null,
          dto.incidentsOrDelays || null, dto.submissionSource || 'web', dto.submittedBy
        ]
      );

      await client.query('COMMIT');
      return this.getSiteDiaryById(id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getSiteDiaryById(id: string): Promise<any> {
    const result = await this.pool.query(
      `SELECT sd.*,
        dp.name AS project_name,
        COALESCE(u.display_name, u.first_name || ' ' || u.last_name) AS submitted_by_name,
        0 AS photo_count
      FROM project_site_diaries sd
      LEFT JOIN development_projects dp ON sd.project_id = dp.id
      LEFT JOIN users u ON sd.submitted_by = u.id
      WHERE sd.id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.mapSiteDiary(result.rows[0]);
  }

  async getSiteDiaries(filters: SiteDiaryFilters): Promise<{ data: any[]; total: number; page: number; pageSize: number }> {
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;
    const offset = (page - 1) * pageSize;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.projectId) {
      whereClause += ` AND sd.project_id = $${paramIndex++}`;
      params.push(filters.projectId);
    }

    if (filters.fromDate) {
      whereClause += ` AND sd.report_date >= $${paramIndex++}`;
      params.push(filters.fromDate);
    }

    if (filters.toDate) {
      whereClause += ` AND sd.report_date <= $${paramIndex++}`;
      params.push(filters.toDate);
    }

    if (filters.createdBy) {
      whereClause += ` AND sd.submitted_by = $${paramIndex++}`;
      params.push(filters.createdBy);
    }

    if (filters.search) {
      whereClause += ` AND (sd.work_performed ILIKE $${paramIndex} OR sd.indecents_or_delays ILIKE $${paramIndex} OR dp.name ILIKE $${paramIndex++})`;
      params.push(`%${filters.search}%`);
    }

    // Count total
    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM project_site_diaries sd
       LEFT JOIN development_projects dp ON sd.project_id = dp.id
       ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get data
    const dataResult = await this.pool.query(
      `SELECT sd.*,
        dp.name AS project_name,
        COALESCE(u.display_name, u.first_name || ' ' || u.last_name) AS submitted_by_name,
        0 AS photo_count
      FROM project_site_diaries sd
      LEFT JOIN development_projects dp ON sd.project_id = dp.id
      LEFT JOIN users u ON sd.submitted_by = u.id
      ${whereClause}
      ORDER BY sd.report_date DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, pageSize, offset]
    );

    return {
      data: dataResult.rows.map(this.mapSiteDiary),
      total,
      page,
      pageSize
    };
  }

  async updateSiteDiary(id: string, updates: Partial<CreateSiteDiaryDTO>): Promise<any> {
    const fields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      reportDate: 'report_date',
      weatherCondition: 'weather_condition',
      temperatureCelsius: 'temperature_celsius',
      informalLaborCount: 'informal_labor_count',
      informalLaborNotes: 'informal_labor_notes',
      workPerformed: 'work_performed',
      incidentsOrDelays: 'indecents_or_delays'
    };

    for (const [key, value] of Object.entries(updates)) {
      if (fieldMap[key] && value !== undefined) {
        fields.push(`${fieldMap[key]} = $${paramIndex++}`);
        params.push(value);
      }
    }

    if (fields.length === 0) return this.getSiteDiaryById(id);

    fields.push(`updated_at = NOW()`);
    params.push(id);

    await this.pool.query(
      `UPDATE project_site_diaries SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      params
    );

    return this.getSiteDiaryById(id);
  }

  async deleteSiteDiary(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM project_site_diaries WHERE id = $1`,
      [id]
    );
    return result.rowCount! > 0;
  }

  async getProjectStats(projectId: string): Promise<any> {
    const result = await this.pool.query(
      `SELECT
        COUNT(*) AS total_logs,
        SUM(COALESCE(informal_labor_count, 0)) AS total_informal_labor,
        AVG(COALESCE(informal_labor_count, 0))::INTEGER AS avg_informal_labor,
        COUNT(CASE WHEN indecents_or_delays IS NOT NULL AND indecents_or_delays != '' THEN 1 END) AS logs_with_incidents,
        MIN(report_date) AS first_log_date,
        MAX(report_date) AS last_log_date
      FROM project_site_diaries
      WHERE project_id = $1`,
      [projectId]
    );

    // Photo count placeholder - site_photos doesn't have site_diary_id column yet
    const totalPhotos = 0;

    return {
      ...result.rows[0],
      total_photos: totalPhotos
    };
  }

  async getAllProjectsStats(organizationId?: string): Promise<any> {
    let whereClause = '';
    const params: any[] = [];
    
    if (organizationId) {
      whereClause = 'WHERE dp.organization_id = $1';
      params.push(organizationId);
    }

    const result = await this.pool.query(
      `SELECT
        COUNT(*) AS total_logs,
        COUNT(DISTINCT sd.project_id) AS projects_with_logs,
        SUM(COALESCE(informal_labor_count, 0)) AS total_labor,
        AVG(COALESCE(informal_labor_count, 0))::INTEGER AS avg_labor,
        COUNT(CASE WHEN indecents_or_delays IS NOT NULL AND indecents_or_delays != '' THEN 1 END) AS logs_with_incidents
      FROM project_site_diaries sd
      LEFT JOIN development_projects dp ON sd.project_id = dp.id
      ${whereClause}`,
      params
    );

    return result.rows[0];
  }

  private mapSiteDiary(row: any): any {
    return {
      id: row.id,
      projectId: row.project_id,
      projectName: row.project_name,
      reportDate: row.report_date,
      weatherCondition: row.weather_condition,
      temperatureCelsius: row.temperature_celsius ? parseFloat(row.temperature_celsius) : null,
      informalLaborCount: row.informal_labor_count || 0,
      informalLaborNotes: row.informal_labor_notes,
      workPerformed: row.work_performed,
      incidentsOrDelays: row.indecents_or_delays,
      submissionSource: row.submission_source,
      submittedBy: row.submitted_by,
      submittedByName: row.submitted_by_name,
      photoCount: parseInt(row.photo_count || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
