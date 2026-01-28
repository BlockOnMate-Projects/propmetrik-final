/**
 * Daily Log Service
 * Phase 5.8 Week 4 - Construction Progress Tracking
 * 
 * Handles daily construction logs with weather, crew tracking, and photos.
 * Inspired by Procore's Daily Log feature.
 * 
 * @deprecated This service has been replaced by SiteOperationsService.
 *             Please migrate to: import { siteOperationsService } from './operations'
 *             This file will be removed in the next major version.
 *             Migration Date: 2024-01-XX
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';

// =====================================================
// TYPES
// =====================================================

export type WeatherCondition = 
  | 'sunny'
  | 'cloudy'
  | 'overcast'
  | 'light_rain'
  | 'heavy_rain'
  | 'thunderstorm'
  | 'harmattan'
  | 'hot'
  | 'mild';

export interface DailyLogActivity {
  time?: string;
  activity: string;
  location?: string;
  notes?: string;
  contractor_id?: string;
}

export interface DailyLog {
  id: string;
  project_id: string;
  organization_id: string;
  log_date: Date;
  
  // Weather
  weather: WeatherCondition;
  temperature_high?: number;
  temperature_low?: number;
  
  // Crew
  workers_on_site: number;
  subcontractors_on_site: string[];
  
  // Activities
  activities: DailyLogActivity[];
  
  // Issues
  delays?: string[];
  issues?: string[];
  
  // Safety
  safety_incidents: number;
  safety_notes?: string;
  
  // Materials & Equipment
  materials_delivered?: string[];
  equipment_on_site?: string[];
  
  // Photos
  photos?: string[];
  
  // Approval
  submitted_by?: string;
  submitted_by_name?: string;
  approved_by?: string;
  approved_by_name?: string;
  approved_at?: Date;
  is_approved: boolean;
  
  notes?: string;
  
  // Audit
  created_at: Date;
  updated_at: Date;
}

export interface CreateDailyLogInput {
  project_id: string;
  organization_id: string;
  log_date: Date;
  weather: WeatherCondition;
  temperature_high?: number;
  temperature_low?: number;
  workers_on_site: number;
  subcontractors_on_site?: string[];
  activities?: DailyLogActivity[];
  delays?: string[];
  issues?: string[];
  safety_incidents?: number;
  safety_notes?: string;
  materials_delivered?: string[];
  equipment_on_site?: string[];
  photos?: string[];
  notes?: string;
  created_by?: string;
}

export interface UpdateDailyLogInput {
  weather?: WeatherCondition;
  temperature_high?: number;
  temperature_low?: number;
  workers_on_site?: number;
  subcontractors_on_site?: string[];
  activities?: DailyLogActivity[];
  delays?: string[];
  issues?: string[];
  safety_incidents?: number;
  safety_notes?: string;
  materials_delivered?: string[];
  equipment_on_site?: string[];
  photos?: string[];
  notes?: string;
  updated_by?: string;
}

export interface DailyLogFilters {
  project_id?: string;
  start_date?: Date;
  end_date?: Date;
  weather?: WeatherCondition;
  weather_condition?: WeatherCondition;
  has_issues?: boolean;
  has_photos?: boolean;
  is_approved?: boolean;
  created_by?: string;
}

export interface DailyLogSummary {
  project_id: string;
  total_logs: number;
  logs_this_week: number;
  logs_this_month: number;
  total_worker_days: number;
  avg_workers_per_day: number;
  total_safety_incidents: number;
  weather_breakdown: Record<WeatherCondition, number>;
  missing_dates: string[];
}

// =====================================================
// DAILY LOG SERVICE CLASS
// =====================================================

class DailyLogService {
  private static instance: DailyLogService;

  private constructor() {}

  public static getInstance(): DailyLogService {
    if (!DailyLogService.instance) {
      DailyLogService.instance = new DailyLogService();
    }
    return DailyLogService.instance;
  }

  // =====================================================
  // CRUD OPERATIONS
  // =====================================================

  /**
   * Create a new daily log
   */
  async create(input: CreateDailyLogInput): Promise<DailyLog> {
    // Check if log already exists for this date
    const existing = await pool.query(`
      SELECT id FROM daily_logs
      WHERE project_id = $1 AND log_date = $2 AND deleted_at IS NULL
    `, [input.project_id, input.log_date]);
    
    if (existing.rows.length > 0) {
      throw new Error('A daily log already exists for this date');
    }
    
    const result = await pool.query(`
      INSERT INTO daily_logs (
        project_id, organization_id, log_date, weather,
        temperature_high, temperature_low, workers_on_site,
        subcontractors_on_site, activities, delays, issues,
        safety_incidents, safety_notes, materials_delivered,
        equipment_on_site, photos, notes, submitted_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `, [
      input.project_id,
      input.organization_id,
      input.log_date,
      input.weather,
      input.temperature_high,
      input.temperature_low,
      input.workers_on_site,
      input.subcontractors_on_site || [],
      JSON.stringify(input.activities || []),
      input.delays || [],
      input.issues || [],
      input.safety_incidents || 0,
      input.safety_notes,
      input.materials_delivered || [],
      input.equipment_on_site || [],
      input.photos || [],
      input.notes,
      input.created_by
    ]);
    
    logger.info({ logId: result.rows[0].id, date: input.log_date }, 'Daily log created');
    
    return this.mapRow(result.rows[0]);
  }

  /**
   * Get daily log by ID
   */
  async getById(id: string): Promise<DailyLog | null> {
    const result = await pool.query(`
      SELECT dl.*,
             u1.full_name as submitted_by_name,
             u2.full_name as approved_by_name
      FROM daily_logs dl
      LEFT JOIN users u1 ON dl.submitted_by = u1.id
      LEFT JOIN users u2 ON dl.approved_by = u2.id
      WHERE dl.id = $1 AND dl.deleted_at IS NULL
    `, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRow(result.rows[0]);
  }

  /**
   * Get daily log by project and date
   */
  async getByDate(projectId: string, date: Date): Promise<DailyLog | null> {
    const result = await pool.query(`
      SELECT dl.*,
             u1.full_name as submitted_by_name,
             u2.full_name as approved_by_name
      FROM daily_logs dl
      LEFT JOIN users u1 ON dl.submitted_by = u1.id
      LEFT JOIN users u2 ON dl.approved_by = u2.id
      WHERE dl.project_id = $1 AND dl.log_date = $2 AND dl.deleted_at IS NULL
    `, [projectId, date]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRow(result.rows[0]);
  }

  /**
   * Get all daily logs for a project with filters
   */
  async getAll(
    projectId: string,
    filters: Partial<DailyLogFilters> = {},
    page = 1,
    limit = 30
  ): Promise<{
    data: DailyLog[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const conditions: string[] = ['dl.deleted_at IS NULL', 'dl.project_id = $1'];
    const params: any[] = [projectId];
    let paramCount = 1;
    
    if (filters.start_date) {
      conditions.push(`dl.log_date >= $${++paramCount}`);
      params.push(filters.start_date);
    }
    
    if (filters.end_date) {
      conditions.push(`dl.log_date <= $${++paramCount}`);
      params.push(filters.end_date);
    }
    
    if (filters.weather_condition) {
      conditions.push(`dl.weather = $${++paramCount}`);
      params.push(filters.weather_condition);
    }
    
    if (filters.has_issues === true) {
      conditions.push(`(array_length(dl.issues, 1) > 0 OR array_length(dl.delays, 1) > 0)`);
    } else if (filters.has_issues === false) {
      conditions.push(`(array_length(dl.issues, 1) IS NULL OR array_length(dl.issues, 1) = 0)`);
      conditions.push(`(array_length(dl.delays, 1) IS NULL OR array_length(dl.delays, 1) = 0)`);
    }
    
    if (filters.has_photos === true) {
      conditions.push(`array_length(dl.photos, 1) > 0`);
    }
    
    if (filters.is_approved !== undefined) {
      conditions.push(`dl.approved_at IS ${filters.is_approved ? 'NOT NULL' : 'NULL'}`);
    }
    
    if (filters.created_by) {
      conditions.push(`dl.submitted_by = $${++paramCount}`);
      params.push(filters.created_by);
    }
    
    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    
    // Count total
    const countResult = await pool.query(`
      SELECT COUNT(*) FROM daily_logs dl ${whereClause}
    `, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Get paginated results
    const offset = (page - 1) * limit;
    const result = await pool.query(`
      SELECT dl.*,
             u1.full_name as submitted_by_name,
             u2.full_name as approved_by_name
      FROM daily_logs dl
      LEFT JOIN users u1 ON dl.submitted_by = u1.id
      LEFT JOIN users u2 ON dl.approved_by = u2.id
      ${whereClause}
      ORDER BY dl.log_date DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `, [...params, limit, offset]);
    
    return {
      data: result.rows.map(row => this.mapRow(row)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Update daily log
   */
  async update(id: string, input: UpdateDailyLogInput): Promise<DailyLog | null> {
    const log = await this.getById(id);
    if (!log || log.is_approved) {
      return null; // Cannot update approved logs
    }
    
    const updates: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    let paramCount = 0;
    
    if (input.weather !== undefined) {
      updates.push(`weather = $${++paramCount}`);
      params.push(input.weather);
    }
    
    if (input.temperature_high !== undefined) {
      updates.push(`temperature_high = $${++paramCount}`);
      params.push(input.temperature_high);
    }
    
    if (input.temperature_low !== undefined) {
      updates.push(`temperature_low = $${++paramCount}`);
      params.push(input.temperature_low);
    }
    
    if (input.workers_on_site !== undefined) {
      updates.push(`workers_on_site = $${++paramCount}`);
      params.push(input.workers_on_site);
    }
    
    if (input.subcontractors_on_site !== undefined) {
      updates.push(`subcontractors_on_site = $${++paramCount}`);
      params.push(input.subcontractors_on_site);
    }
    
    if (input.activities !== undefined) {
      updates.push(`activities = $${++paramCount}`);
      params.push(JSON.stringify(input.activities));
    }
    
    if (input.delays !== undefined) {
      updates.push(`delays = $${++paramCount}`);
      params.push(input.delays);
    }
    
    if (input.issues !== undefined) {
      updates.push(`issues = $${++paramCount}`);
      params.push(input.issues);
    }
    
    if (input.safety_incidents !== undefined) {
      updates.push(`safety_incidents = $${++paramCount}`);
      params.push(input.safety_incidents);
    }
    
    if (input.safety_notes !== undefined) {
      updates.push(`safety_notes = $${++paramCount}`);
      params.push(input.safety_notes);
    }
    
    if (input.materials_delivered !== undefined) {
      updates.push(`materials_delivered = $${++paramCount}`);
      params.push(input.materials_delivered);
    }
    
    if (input.equipment_on_site !== undefined) {
      updates.push(`equipment_on_site = $${++paramCount}`);
      params.push(input.equipment_on_site);
    }
    
    if (input.photos !== undefined) {
      updates.push(`photos = $${++paramCount}`);
      params.push(input.photos);
    }
    
    if (input.notes !== undefined) {
      updates.push(`notes = $${++paramCount}`);
      params.push(input.notes);
    }
    
    if (updates.length === 1) {
      return log;
    }
    
    params.push(id);
    
    const result = await pool.query(`
      UPDATE daily_logs
      SET ${updates.join(', ')}
      WHERE id = $${++paramCount} AND deleted_at IS NULL
      RETURNING *
    `, params);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    logger.info({ logId: id }, 'Daily log updated');
    return this.mapRow(result.rows[0]);
  }

  // =====================================================
  // PHOTO MANAGEMENT
  // =====================================================

  /**
   * Add photo to daily log
   */
  async addPhoto(
    id: string,
    photoUrl: string,
    caption?: string,
    userId?: string
  ): Promise<DailyLog | null> {
    // Store photo with metadata if caption provided
    const photoEntry = caption 
      ? JSON.stringify({ url: photoUrl, caption, uploaded_by: userId, uploaded_at: new Date() })
      : photoUrl;
    
    const result = await pool.query(`
      UPDATE daily_logs
      SET photos = array_append(photos, $2),
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `, [id, photoEntry]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    logger.info({ logId: id, photoUrl, caption, userId }, 'Photo added to daily log');
    return this.mapRow(result.rows[0]);
  }

  /**
   * Remove photo from daily log
   */
  async removePhoto(id: string, photoUrl: string): Promise<DailyLog | null> {
    const result = await pool.query(`
      UPDATE daily_logs
      SET photos = array_remove(photos, $2),
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `, [id, photoUrl]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRow(result.rows[0]);
  }

  // =====================================================
  // ACTIVITY MANAGEMENT
  // =====================================================

  /**
   * Add activity to daily log
   */
  async addActivity(id: string, activity: DailyLogActivity): Promise<DailyLog | null> {
    const log = await this.getById(id);
    if (!log || log.is_approved) {
      return null;
    }
    
    const activities = [...log.activities, activity];
    
    const result = await pool.query(`
      UPDATE daily_logs
      SET activities = $2,
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `, [id, JSON.stringify(activities)]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRow(result.rows[0]);
  }

  // =====================================================
  // APPROVAL WORKFLOW
  // =====================================================

  /**
   * Approve daily log
   */
  async approve(id: string, userId: string): Promise<DailyLog | null> {
    const result = await pool.query(`
      UPDATE daily_logs
      SET approved_by = $2,
          approved_at = NOW(),
          updated_at = NOW()
      WHERE id = $1 AND approved_at IS NULL AND deleted_at IS NULL
      RETURNING *
    `, [id, userId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    logger.info({ logId: id, userId }, 'Daily log approved');
    return this.mapRow(result.rows[0]);
  }

  /**
   * Revoke approval (admin only)
   */
  async revokeApproval(id: string): Promise<DailyLog | null> {
    const result = await pool.query(`
      UPDATE daily_logs
      SET approved_by = NULL,
          approved_at = NULL,
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    logger.info({ logId: id }, 'Daily log approval revoked');
    return this.mapRow(result.rows[0]);
  }

  // =====================================================
  // ANALYTICS
  // =====================================================

  /**
   * Get daily log summary for a project
   */
  async getSummary(
    projectId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<DailyLogSummary> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Build date range condition
    let dateCondition = '';
    const params: any[] = [projectId, weekAgo, monthAgo];
    let paramCount = 3;
    
    if (startDate) {
      dateCondition += ` AND log_date >= $${++paramCount}`;
      params.push(startDate);
    }
    if (endDate) {
      dateCondition += ` AND log_date <= $${++paramCount}`;
      params.push(endDate);
    }
    
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_logs,
        COUNT(CASE WHEN log_date >= $2 THEN 1 END) as logs_this_week,
        COUNT(CASE WHEN log_date >= $3 THEN 1 END) as logs_this_month,
        COALESCE(SUM(workers_on_site), 0) as total_worker_days,
        COALESCE(AVG(workers_on_site), 0) as avg_workers,
        COALESCE(SUM(safety_incidents), 0) as total_incidents
      FROM daily_logs
      WHERE project_id = $1 AND deleted_at IS NULL${dateCondition}
    `, params);
    
    const stats = result.rows[0];
    
    // Weather breakdown
    const weatherResult = await pool.query(`
      SELECT weather, COUNT(*) as count
      FROM daily_logs
      WHERE project_id = $1 AND deleted_at IS NULL
      GROUP BY weather
    `, [projectId]);
    
    const weatherBreakdown: Record<WeatherCondition, number> = {} as any;
    weatherResult.rows.forEach(row => {
      weatherBreakdown[row.weather as WeatherCondition] = parseInt(row.count);
    });
    
    // Find missing dates in last 30 days (weekdays only)
    const existingDates = await pool.query(`
      SELECT log_date::date as date
      FROM daily_logs
      WHERE project_id = $1 AND log_date >= $2 AND deleted_at IS NULL
    `, [projectId, monthAgo]);
    
    const existingSet = new Set(
      existingDates.rows.map(r => r.date.toISOString().split('T')[0])
    );
    
    const missingDates: string[] = [];
    const checkDate = new Date(monthAgo);
    while (checkDate <= now) {
      const day = checkDate.getDay();
      // Skip weekends (0 = Sunday, 6 = Saturday)
      if (day !== 0 && day !== 6) {
        const dateStr = checkDate.toISOString().split('T')[0];
        if (!existingSet.has(dateStr)) {
          missingDates.push(dateStr);
        }
      }
      checkDate.setDate(checkDate.getDate() + 1);
    }
    
    return {
      project_id: projectId,
      total_logs: parseInt(stats.total_logs) || 0,
      logs_this_week: parseInt(stats.logs_this_week) || 0,
      logs_this_month: parseInt(stats.logs_this_month) || 0,
      total_worker_days: parseInt(stats.total_worker_days) || 0,
      avg_workers_per_day: parseFloat(stats.avg_workers) || 0,
      total_safety_incidents: parseInt(stats.total_incidents) || 0,
      weather_breakdown: weatherBreakdown,
      missing_dates: missingDates.slice(-10) // Last 10 missing
    };
  }

  /**
   * Delete daily log (soft)
   */
  async delete(id: string): Promise<boolean> {
    const result = await pool.query(`
      UPDATE daily_logs
      SET deleted_at = NOW()
      WHERE id = $1 AND approved_at IS NULL AND deleted_at IS NULL
    `, [id]);
    
    return (result.rowCount ?? 0) > 0;
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  private mapRow(row: any): DailyLog {
    return {
      id: row.id,
      project_id: row.project_id,
      organization_id: row.organization_id,
      log_date: row.log_date,
      weather: row.weather,
      temperature_high: row.temperature_high ? parseFloat(row.temperature_high) : undefined,
      temperature_low: row.temperature_low ? parseFloat(row.temperature_low) : undefined,
      workers_on_site: parseInt(row.workers_on_site) || 0,
      subcontractors_on_site: row.subcontractors_on_site || [],
      activities: typeof row.activities === 'string' ? JSON.parse(row.activities) : (row.activities || []),
      delays: row.delays || [],
      issues: row.issues || [],
      safety_incidents: parseInt(row.safety_incidents) || 0,
      safety_notes: row.safety_notes,
      materials_delivered: row.materials_delivered || [],
      equipment_on_site: row.equipment_on_site || [],
      photos: row.photos || [],
      submitted_by: row.submitted_by,
      submitted_by_name: row.submitted_by_name,
      approved_by: row.approved_by,
      approved_by_name: row.approved_by_name,
      approved_at: row.approved_at,
      is_approved: !!row.approved_at,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

export default DailyLogService.getInstance();
