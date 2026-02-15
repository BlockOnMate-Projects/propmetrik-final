/**
 * Site Operations Service
 * 
 * Phase 2.1: Merge Duplicate Services
 * 
 * UNIFIED service that consolidates:
 * - dailyLogService.ts (721 lines)
 * - siteDiaryService.ts (325 lines)
 * - constructionOpsService.ts (197 lines)
 * 
 * Provides a single, consistent API for all daily site operations:
 * - Daily logs / Site diaries
 * - Weather tracking
 * - Labor and crew management
 * - Equipment tracking
 * - Material deliveries
 * - Safety incidents
 * - Petty cash (Ghana "chop money")
 * - Photo documentation
 * - WhatsApp notifications
 * 
 * @module services/project-management/operations/SiteOperationsService
 */

import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../../database';
import { BaseService } from '../../../../shared-services/base/BaseService';
import {
  UUID,
  WeatherCondition,
  PaginatedResponse,
  PaginationParams,
} from '../types';
import { ValidationError, NotFoundError } from '../errors';
import { eventBus, ProjectEventType } from '../events';

// =============================================================================
// TYPES
// =============================================================================

export interface DailyLog {
  id: UUID;
  projectId: UUID;
  organizationId: UUID;
  logDate: Date;
  
  // Weather
  weather: WeatherCondition;
  temperatureHigh?: number;
  temperatureLow?: number;
  
  // Labor
  workersOnSite: number;
  informalLaborCount?: number;
  informalLaborNotes?: string;
  laborDetails?: LaborDetail[];
  subcontractorsOnSite: string[];
  
  // Activities
  activities: DailyActivity[];
  workPerformed?: string;
  plannedWork?: string;
  
  // Issues
  delays: string[];
  issues: string[];
  incidentsOrDelays?: string;
  
  // Safety
  safetyIncidents: number;
  safetyNotes?: string;
  safetyObservations?: string;
  
  // Materials & Equipment
  materialsDelivered: string[];
  materialsUsed: string[];
  equipmentOnSite: string[];
  
  // Visitors
  visitors: string[];
  
  // Photos
  photos: string[];
  photoIds: string[];
  
  // Approval
  submittedBy?: UUID;
  submittedByName?: string;
  approvedBy?: UUID;
  approvedByName?: string;
  approvedAt?: Date;
  isApproved: boolean;
  
  // Submission
  submissionSource: 'web' | 'whatsapp' | 'mobile_app';
  
  notes?: string;
  
  // Audit
  createdAt: Date;
  updatedAt: Date;
}

export interface LaborDetail {
  trade: string;
  count: number;
  notes?: string;
}

export interface DailyActivity {
  id?: string;
  time?: string;
  activity: string;
  location?: string;
  notes?: string;
  contractorId?: string;
}

export interface CreateDailyLogInput {
  projectId: UUID;
  organizationId: UUID;
  logDate: Date | string;
  
  // Weather
  weather?: WeatherCondition;
  temperatureHigh?: number;
  temperatureLow?: number;
  
  // Labor
  workersOnSite?: number;
  informalLaborCount?: number;
  informalLaborNotes?: string;
  laborDetails?: LaborDetail[];
  subcontractorsOnSite?: string[];
  
  // Activities
  activities?: DailyActivity[];
  workPerformed?: string;
  plannedWork?: string;
  
  // Issues
  delays?: string[];
  issues?: string[];
  incidentsOrDelays?: string;
  
  // Safety
  safetyIncidents?: number;
  safetyNotes?: string;
  safetyObservations?: string;
  
  // Materials & Equipment
  materialsDelivered?: string[];
  materialsUsed?: string[];
  equipmentOnSite?: string[];
  
  // Visitors
  visitors?: string[];
  
  // Photos
  photos?: string[];
  photoIds?: string[];
  
  // Submission
  submittedBy: UUID;
  submissionSource?: 'web' | 'whatsapp' | 'mobile_app';
  
  notes?: string;
}

export interface UpdateDailyLogInput extends Partial<Omit<CreateDailyLogInput, 'projectId' | 'organizationId' | 'logDate'>> {
  updatedBy?: UUID;
}

export interface DailyLogFilters {
  projectId?: UUID;
  organizationId?: UUID;
  fromDate?: Date | string;
  toDate?: Date | string;
  weather?: WeatherCondition;
  submittedBy?: UUID;
  isApproved?: boolean;
  submissionSource?: 'web' | 'whatsapp' | 'mobile_app';
  search?: string;
}

// Petty Cash (Ghana "Chop Money")
export interface PettyCashEntry {
  id: UUID;
  projectId: UUID;
  amount: number;
  currency: string;
  recipientName: string;
  category: 'transport' | 'food' | 'tips' | 'airtime' | 'misc';
  description?: string;
  requestedBy?: UUID;
  approvedBy?: UUID;
  status: 'pending' | 'approved' | 'rejected' | 'disbursed';
  createdAt: Date;
}

export interface CreatePettyCashInput {
  projectId: UUID;
  amount: number;
  currency?: string;
  recipientName: string;
  category: 'transport' | 'food' | 'tips' | 'airtime' | 'misc';
  description?: string;
  requestedBy: UUID;
}

// Stats
export interface DailyLogStats {
  totalLogs: number;
  totalWorkerDays: number;
  averageWorkersPerDay: number;
  totalSafetyIncidents: number;
  daysWithDelays: number;
  lastLogDate?: Date;
}

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class SiteOperationsServiceImpl extends BaseService {
  constructor() {
    super('SiteOperationsService');
  }

  // ===========================================================================
  // ROW MAPPING
  // ===========================================================================

  protected mapRow(row: any): DailyLog {
    return {
      id: row.id,
      projectId: row.project_id,
      organizationId: row.organization_id,
      logDate: row.log_date || row.report_date,
      
      weather: row.weather || row.weather_condition || 'sunny',
      temperatureHigh: row.temperature_high,
      temperatureLow: row.temperature_low || row.temperature_celsius,
      
      workersOnSite: row.workers_on_site || row.labor_count || 0,
      informalLaborCount: row.informal_labor_count,
      informalLaborNotes: row.informal_labor_notes,
      laborDetails: row.labor_details || [],
      subcontractorsOnSite: row.subcontractors_on_site || [],
      
      activities: row.activities || [],
      workPerformed: row.work_performed,
      plannedWork: row.planned_work,
      
      delays: row.delays || [],
      issues: row.issues || [],
      incidentsOrDelays: row.incidents_or_delays || row.indecents_or_delays, // Handle typo
      
      safetyIncidents: row.safety_incidents || 0,
      safetyNotes: row.safety_notes,
      safetyObservations: row.safety_observations,
      
      materialsDelivered: row.materials_delivered || [],
      materialsUsed: row.materials_used || [],
      equipmentOnSite: row.equipment_on_site || [],
      
      visitors: row.visitors || [],
      
      photos: row.photos || [],
      photoIds: row.photo_ids || [],
      
      submittedBy: row.submitted_by,
      submittedByName: row.submitted_by_name,
      approvedBy: row.approved_by,
      approvedByName: row.approved_by_name,
      approvedAt: row.approved_at,
      isApproved: row.is_approved || false,
      
      submissionSource: row.submission_source || 'web',
      
      notes: row.notes,
      
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected mapPettyCashRow(row: any): PettyCashEntry {
    return {
      id: row.id,
      projectId: row.project_id,
      amount: parseFloat(row.amount),
      currency: row.currency || 'GHS',
      recipientName: row.recipient_name,
      category: row.category,
      description: row.description,
      requestedBy: row.requested_by,
      approvedBy: row.approved_by,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  // ===========================================================================
  // DAILY LOG CRUD
  // ===========================================================================

  /**
   * Create or update a daily log.
   * If a log exists for the same project/date, updates it (upsert behavior).
   */
  async createOrUpdateDailyLog(input: CreateDailyLogInput): Promise<DailyLog> {
    // Validate required fields
    if (!input.projectId) {
      throw ValidationError.missingField('projectId');
    }
    if (!input.logDate) {
      throw ValidationError.missingField('logDate');
    }

    const logDate = typeof input.logDate === 'string' 
      ? input.logDate 
      : input.logDate.toISOString().split('T')[0];

    // Check for existing log
    const existing = await this.query(
      `SELECT id FROM project_daily_logs WHERE project_id = $1 AND log_date = $2`,
      [input.projectId, logDate]
    );

    if (existing.rows.length > 0) {
      // Update existing
      return this.updateDailyLog(existing.rows[0].id, input);
    }

    // Create new
    const id = uuidv4();
    const result = await this.query(
      `INSERT INTO project_daily_logs (
        id, project_id, organization_id, log_date,
        weather, temperature_high, temperature_low,
        workers_on_site, informal_labor_count, informal_labor_notes, labor_details, subcontractors_on_site,
        activities, work_performed, planned_work,
        delays, issues, incidents_or_delays,
        safety_incidents, safety_notes, safety_observations,
        materials_delivered, materials_used, equipment_on_site,
        visitors, photos, photo_ids,
        submitted_by, submission_source, notes
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9, $10, $11, $12,
        $13, $14, $15,
        $16, $17, $18,
        $19, $20, $21,
        $22, $23, $24,
        $25, $26, $27,
        $28, $29, $30
      ) RETURNING *`,
      [
        id, input.projectId, input.organizationId, logDate,
        input.weather || 'sunny', input.temperatureHigh, input.temperatureLow,
        input.workersOnSite || 0, input.informalLaborCount, input.informalLaborNotes, 
        JSON.stringify(input.laborDetails || []), JSON.stringify(input.subcontractorsOnSite || []),
        JSON.stringify(input.activities || []), input.workPerformed, input.plannedWork,
        JSON.stringify(input.delays || []), JSON.stringify(input.issues || []), input.incidentsOrDelays,
        input.safetyIncidents || 0, input.safetyNotes, input.safetyObservations,
        JSON.stringify(input.materialsDelivered || []), JSON.stringify(input.materialsUsed || []), 
        JSON.stringify(input.equipmentOnSite || []),
        JSON.stringify(input.visitors || []), JSON.stringify(input.photos || []), 
        JSON.stringify(input.photoIds || []),
        input.submittedBy, input.submissionSource || 'web', input.notes,
      ]
    );

    const log = this.mapRow(result.rows[0]);

    // Emit event
    eventBus.emit(ProjectEventType.DAILY_LOG_CREATED, {
      entityType: 'daily_log',
      entityId: log.id,
      projectId: input.projectId,
      organizationId: input.organizationId,
      userId: input.submittedBy,
      data: { logDate, submissionSource: input.submissionSource },
    });

    return log;
  }

  /**
   * Get daily log by ID.
   */
  async getDailyLogById(id: UUID): Promise<DailyLog> {
    const result = await this.query(
      `SELECT dl.*, u.name as submitted_by_name, ua.name as approved_by_name
       FROM project_daily_logs dl
       LEFT JOIN users u ON u.id = dl.submitted_by
       LEFT JOIN users ua ON ua.id = dl.approved_by
       WHERE dl.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw NotFoundError.forResource('DailyLog', id);
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * Get daily log for a specific project and date.
   */
  async getDailyLogByDate(projectId: UUID, date: Date | string): Promise<DailyLog | null> {
    const logDate = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    
    const result = await this.query(
      `SELECT dl.*, u.name as submitted_by_name
       FROM project_daily_logs dl
       LEFT JOIN users u ON u.id = dl.submitted_by
       WHERE dl.project_id = $1 AND dl.log_date = $2`,
      [projectId, logDate]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * List daily logs with filters and pagination.
   */
  async listDailyLogs(
    filters: DailyLogFilters & PaginationParams
  ): Promise<PaginatedResponse<DailyLog>> {
    const { page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.projectId) {
      conditions.push(`dl.project_id = $${paramIndex++}`);
      params.push(filters.projectId);
    }

    if (filters.organizationId) {
      conditions.push(`dl.organization_id = $${paramIndex++}`);
      params.push(filters.organizationId);
    }

    if (filters.fromDate) {
      conditions.push(`dl.log_date >= $${paramIndex++}`);
      params.push(filters.fromDate);
    }

    if (filters.toDate) {
      conditions.push(`dl.log_date <= $${paramIndex++}`);
      params.push(filters.toDate);
    }

    if (filters.weather) {
      conditions.push(`dl.weather = $${paramIndex++}`);
      params.push(filters.weather);
    }

    if (filters.submittedBy) {
      conditions.push(`dl.submitted_by = $${paramIndex++}`);
      params.push(filters.submittedBy);
    }

    if (filters.isApproved !== undefined) {
      conditions.push(`dl.is_approved = $${paramIndex++}`);
      params.push(filters.isApproved);
    }

    if (filters.submissionSource) {
      conditions.push(`dl.submission_source = $${paramIndex++}`);
      params.push(filters.submissionSource);
    }

    if (filters.search) {
      conditions.push(`(dl.work_performed ILIKE $${paramIndex} OR dl.notes ILIKE $${paramIndex})`);
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}` 
      : '';

    // Get total count
    const countResult = await this.query(
      `SELECT COUNT(*) FROM project_daily_logs dl ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get logs
    const result = await this.query(
      `SELECT dl.*, u.name as submitted_by_name
       FROM project_daily_logs dl
       LEFT JOIN users u ON u.id = dl.submitted_by
       ${whereClause}
       ORDER BY dl.log_date DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, limit, offset]
    );

    return {
      data: result.rows.map(row => this.mapRow(row)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    };
  }

  /**
   * Update a daily log.
   */
  async updateDailyLog(id: UUID, updates: UpdateDailyLogInput): Promise<DailyLog> {
    const existing = await this.getDailyLogById(id);

    const result = await this.query(
      `UPDATE project_daily_logs SET
        weather = COALESCE($1, weather),
        temperature_high = COALESCE($2, temperature_high),
        temperature_low = COALESCE($3, temperature_low),
        workers_on_site = COALESCE($4, workers_on_site),
        informal_labor_count = COALESCE($5, informal_labor_count),
        informal_labor_notes = COALESCE($6, informal_labor_notes),
        labor_details = COALESCE($7, labor_details),
        subcontractors_on_site = COALESCE($8, subcontractors_on_site),
        activities = COALESCE($9, activities),
        work_performed = COALESCE($10, work_performed),
        planned_work = COALESCE($11, planned_work),
        delays = COALESCE($12, delays),
        issues = COALESCE($13, issues),
        incidents_or_delays = COALESCE($14, incidents_or_delays),
        safety_incidents = COALESCE($15, safety_incidents),
        safety_notes = COALESCE($16, safety_notes),
        safety_observations = COALESCE($17, safety_observations),
        materials_delivered = COALESCE($18, materials_delivered),
        materials_used = COALESCE($19, materials_used),
        equipment_on_site = COALESCE($20, equipment_on_site),
        visitors = COALESCE($21, visitors),
        photos = COALESCE($22, photos),
        photo_ids = COALESCE($23, photo_ids),
        notes = COALESCE($24, notes),
        updated_at = NOW()
       WHERE id = $25
       RETURNING *`,
      [
        updates.weather,
        updates.temperatureHigh,
        updates.temperatureLow,
        updates.workersOnSite,
        updates.informalLaborCount,
        updates.informalLaborNotes,
        updates.laborDetails ? JSON.stringify(updates.laborDetails) : null,
        updates.subcontractorsOnSite ? JSON.stringify(updates.subcontractorsOnSite) : null,
        updates.activities ? JSON.stringify(updates.activities) : null,
        updates.workPerformed,
        updates.plannedWork,
        updates.delays ? JSON.stringify(updates.delays) : null,
        updates.issues ? JSON.stringify(updates.issues) : null,
        updates.incidentsOrDelays,
        updates.safetyIncidents,
        updates.safetyNotes,
        updates.safetyObservations,
        updates.materialsDelivered ? JSON.stringify(updates.materialsDelivered) : null,
        updates.materialsUsed ? JSON.stringify(updates.materialsUsed) : null,
        updates.equipmentOnSite ? JSON.stringify(updates.equipmentOnSite) : null,
        updates.visitors ? JSON.stringify(updates.visitors) : null,
        updates.photos ? JSON.stringify(updates.photos) : null,
        updates.photoIds ? JSON.stringify(updates.photoIds) : null,
        updates.notes,
        id,
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Delete a daily log.
   */
  async deleteDailyLog(id: UUID): Promise<boolean> {
    const result = await this.query(
      `DELETE FROM project_daily_logs WHERE id = $1 RETURNING id`,
      [id]
    );

    return result.rows.length > 0;
  }

  // ===========================================================================
  // APPROVAL WORKFLOW
  // ===========================================================================

  /**
   * Approve a daily log.
   */
  async approveDailyLog(id: UUID, approvedBy: UUID): Promise<DailyLog> {
    const result = await this.query(
      `UPDATE project_daily_logs SET
        is_approved = true,
        approved_by = $1,
        approved_at = NOW(),
        updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [approvedBy, id]
    );

    if (result.rows.length === 0) {
      throw NotFoundError.forResource('DailyLog', id);
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * Unapprove a daily log.
   */
  async unapproveDailyLog(id: UUID): Promise<DailyLog> {
    const result = await this.query(
      `UPDATE project_daily_logs SET
        is_approved = false,
        approved_by = NULL,
        approved_at = NULL,
        updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      throw NotFoundError.forResource('DailyLog', id);
    }

    return this.mapRow(result.rows[0]);
  }

  // ===========================================================================
  // PETTY CASH (GHANA "CHOP MONEY")
  // ===========================================================================

  /**
   * Record a petty cash transaction.
   */
  async recordPettyCash(input: CreatePettyCashInput): Promise<PettyCashEntry> {
    const id = uuidv4();

    const result = await this.query(
      `INSERT INTO project_petty_cash_ledger (
        id, project_id, amount, currency, recipient_name,
        category, description, requested_by, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING *`,
      [
        id, 
        input.projectId, 
        input.amount, 
        input.currency || 'GHS',
        input.recipientName,
        input.category,
        input.description,
        input.requestedBy,
      ]
    );

    return this.mapPettyCashRow(result.rows[0]);
  }

  /**
   * List petty cash transactions for a project.
   */
  async listPettyCash(
    projectId: UUID,
    options: PaginationParams & { status?: string; category?: string }
  ): Promise<PaginatedResponse<PettyCashEntry>> {
    const { page = 1, limit = 50, status, category } = options;
    const offset = (page - 1) * limit;

    const conditions: string[] = ['project_id = $1'];
    const params: any[] = [projectId];
    let paramIndex = 2;

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    if (category) {
      conditions.push(`category = $${paramIndex++}`);
      params.push(category);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await this.query(
      `SELECT COUNT(*) FROM project_petty_cash_ledger WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await this.query(
      `SELECT * FROM project_petty_cash_ledger 
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, limit, offset]
    );

    return {
      data: result.rows.map(row => this.mapPettyCashRow(row)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    };
  }

  /**
   * Approve a petty cash request.
   */
  async approvePettyCash(id: UUID, approvedBy: UUID): Promise<PettyCashEntry> {
    const result = await this.query(
      `UPDATE project_petty_cash_ledger SET
        status = 'approved',
        approved_by = $1,
        updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [approvedBy, id]
    );

    if (result.rows.length === 0) {
      throw NotFoundError.forResource('PettyCashEntry', id);
    }

    return this.mapPettyCashRow(result.rows[0]);
  }

  /**
   * Mark petty cash as disbursed.
   */
  async disbursePettyCash(id: UUID): Promise<PettyCashEntry> {
    const result = await this.query(
      `UPDATE project_petty_cash_ledger SET
        status = 'disbursed',
        updated_at = NOW()
       WHERE id = $1 AND status = 'approved'
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      throw NotFoundError.forResource('PettyCashEntry', id);
    }

    return this.mapPettyCashRow(result.rows[0]);
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  /**
   * Get statistics for a project's daily logs.
   */
  async getProjectStats(projectId: UUID): Promise<DailyLogStats> {
    const result = await this.query(
      `SELECT 
         COUNT(*) as total_logs,
         COALESCE(SUM(workers_on_site), 0) as total_worker_days,
         COALESCE(AVG(workers_on_site), 0) as avg_workers,
         COALESCE(SUM(safety_incidents), 0) as total_safety_incidents,
         COUNT(*) FILTER (WHERE delays IS NOT NULL AND delays != '[]') as days_with_delays,
         MAX(log_date) as last_log_date
       FROM project_daily_logs
       WHERE project_id = $1`,
      [projectId]
    );

    const row = result.rows[0];

    return {
      totalLogs: parseInt(row.total_logs, 10),
      totalWorkerDays: parseInt(row.total_worker_days, 10),
      averageWorkersPerDay: parseFloat(row.avg_workers) || 0,
      totalSafetyIncidents: parseInt(row.total_safety_incidents, 10),
      daysWithDelays: parseInt(row.days_with_delays, 10),
      lastLogDate: row.last_log_date,
    };
  }

  /**
   * Get petty cash summary for a project.
   */
  async getPettyCashSummary(projectId: UUID): Promise<{
    total: number;
    pending: number;
    approved: number;
    disbursed: number;
    byCategory: Record<string, number>;
  }> {
    const result = await this.query(
      `SELECT 
         COALESCE(SUM(amount), 0) as total,
         COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) as pending,
         COALESCE(SUM(amount) FILTER (WHERE status = 'approved'), 0) as approved,
         COALESCE(SUM(amount) FILTER (WHERE status = 'disbursed'), 0) as disbursed
       FROM project_petty_cash_ledger
       WHERE project_id = $1`,
      [projectId]
    );

    const categoryResult = await this.query(
      `SELECT category, COALESCE(SUM(amount), 0) as total
       FROM project_petty_cash_ledger
       WHERE project_id = $1
       GROUP BY category`,
      [projectId]
    );

    const byCategory: Record<string, number> = {};
    for (const row of categoryResult.rows) {
      byCategory[row.category] = parseFloat(row.total);
    }

    const row = result.rows[0];

    return {
      total: parseFloat(row.total),
      pending: parseFloat(row.pending),
      approved: parseFloat(row.approved),
      disbursed: parseFloat(row.disbursed),
      byCategory,
    };
  }

  // ===========================================================================
  // LEGACY COMPATIBILITY
  // ===========================================================================

  /**
   * Legacy method: Create site diary (maps to createOrUpdateDailyLog).
   * @deprecated Use createOrUpdateDailyLog instead
   */
  async logSiteDiary(entry: {
    projectId: string;
    reportDate: string;
    weatherCondition: string;
    temperatureCelsius?: number;
    informalLaborCount: number;
    informalLaborNotes?: string;
    workPerformed?: string;
    incidentsOrDelays?: string;
    submittedBy?: string;
    submissionSource?: 'web' | 'whatsapp' | 'mobile_app';
  }): Promise<DailyLog> {
    return this.createOrUpdateDailyLog({
      projectId: entry.projectId,
      organizationId: '', // Will need to be looked up
      logDate: entry.reportDate,
      weather: entry.weatherCondition as WeatherCondition,
      temperatureLow: entry.temperatureCelsius,
      informalLaborCount: entry.informalLaborCount,
      informalLaborNotes: entry.informalLaborNotes,
      workPerformed: entry.workPerformed,
      incidentsOrDelays: entry.incidentsOrDelays,
      submittedBy: entry.submittedBy || '',
      submissionSource: entry.submissionSource,
    });
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const siteOperationsService = new SiteOperationsServiceImpl();
