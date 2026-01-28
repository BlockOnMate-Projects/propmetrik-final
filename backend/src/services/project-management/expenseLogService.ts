/**
 * Expense Log Service
 * Phase 4 Sprint 7 - Enhanced Budget Module
 * 
 * Handles:
 * - Mobile-first expense logging with GPS
 * - Receipt capture and storage
 * - Offline sync support
 * - Expense categorization and approval
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { fxFeedService } from '../data-hub/scrapers/fxFeedService';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export type ExpenseType = 
  | 'material_purchase'
  | 'labor_payment'
  | 'equipment_rental'
  | 'transport'
  | 'permit_fee'
  | 'utility'
  | 'site_expense'
  | 'petty_cash'
  | 'general';

export type ExpenseStatus = 'pending' | 'approved' | 'rejected' | 'reimbursed';

export interface ExpenseLog {
  id: string;
  projectId: string;
  organizationId: string;
  categoryId: string | null;
  costId: string | null;
  
  amount: number;
  currency: string;
  description: string;
  expenseType: ExpenseType;
  
  exchangeRate: number | null;
  amountInGHS: number | null;
  
  receiptUrl: string | null;
  receiptFileName: string | null;
  receiptOcrData: Record<string, any> | null;
  
  locationGps: { latitude: number; longitude: number } | null;
  locationAddress: string | null;
  locationGhanaPostGps: string | null;
  
  payeeName: string | null;
  payeePhone: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  
  expenseDate: Date;
  expenseTime: string | null;
  
  weatherConditions: string | null;
  
  status: ExpenseStatus;
  approvedBy: string | null;
  approvedAt: Date | null;
  rejectionReason: string | null;
  
  isSynced: boolean;
  offlineId: string | null;
  syncedAt: Date | null;
  
  loggedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateExpenseInput {
  projectId: string;
  organizationId: string;
  categoryId?: string;
  costId?: string;
  
  amount: number;
  currency?: string;
  description: string;
  expenseType?: ExpenseType;
  
  receiptUrl?: string;
  receiptFileName?: string;
  
  latitude?: number;
  longitude?: number;
  locationAddress?: string;
  locationGhanaPostGps?: string;
  
  payeeName?: string;
  payeePhone?: string;
  paymentMethod?: string;
  paymentReference?: string;
  
  expenseDate: Date;
  expenseTime?: string;
  
  weatherConditions?: string;
  
  offlineId?: string;
  
  loggedBy: string;
}

export interface UpdateExpenseInput {
  categoryId?: string;
  costId?: string;
  amount?: number;
  currency?: string;
  description?: string;
  expenseType?: ExpenseType;
  receiptUrl?: string;
  receiptFileName?: string;
  payeeName?: string;
  payeePhone?: string;
  paymentMethod?: string;
  paymentReference?: string;
  expenseDate?: Date;
  expenseTime?: string;
  weatherConditions?: string;
  updatedBy?: string;
}

export interface ExpenseFilters {
  projectId?: string;
  organizationId?: string;
  loggedBy?: string;
  categoryId?: string;
  expenseType?: ExpenseType | ExpenseType[];
  status?: ExpenseStatus | ExpenseStatus[];
  startDate?: Date;
  endDate?: Date;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
}

export interface ExpenseSummary {
  projectId: string;
  totalExpenses: number;
  totalPending: number;
  totalApproved: number;
  expenseCount: number;
  byCategory: Record<string, number>;
  byType: Record<string, number>;
  dailyAverage: number;
}

// ============================================================================
// EXPENSE LOG SERVICE
// ============================================================================

class ExpenseLogService {
  
  /**
   * Create a new expense log
   */
  async create(input: CreateExpenseInput): Promise<ExpenseLog> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Check for duplicate offline ID
      if (input.offlineId) {
        const existing = await client.query(
          'SELECT id FROM expense_logs WHERE offline_id = $1',
          [input.offlineId]
        );
        if (existing.rows.length > 0) {
          await client.query('COMMIT');
          const result = await pool.query(
            'SELECT * FROM expense_logs WHERE offline_id = $1',
            [input.offlineId]
          );
          return this.mapExpense(result.rows[0]);
        }
      }
      
      const currency = input.currency || 'GHS';
      
      // Get exchange rate if foreign currency
      let exchangeRate: number | null = null;
      let amountInGHS: number | null = null;
      
      if (currency !== 'GHS') {
        try {
          const rateData = await fxFeedService.getCurrentRate(currency);
          exchangeRate = rateData.rate;
          amountInGHS = input.amount * rateData.rate;
        } catch (error) {
          logger.warn('Failed to get exchange rate for expense', { currency, error });
        }
      } else {
        amountInGHS = input.amount;
      }
      
      // Build GPS point if provided
      let gpsPoint: string | null = null;
      if (input.latitude && input.longitude) {
        gpsPoint = `SRID=4326;POINT(${input.longitude} ${input.latitude})`;
      }
      
      const id = uuidv4();
      const result = await client.query(
        `INSERT INTO expense_logs (
          id, project_id, organization_id, category_id, cost_id,
          amount, currency, description, expense_type,
          exchange_rate, amount_in_ghs,
          receipt_url, receipt_file_name,
          location_gps, location_address, location_ghana_post_gps,
          payee_name, payee_phone, payment_method, payment_reference,
          expense_date, expense_time, weather_conditions,
          status, is_synced, offline_id, synced_at, logged_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
          ST_GeomFromEWKT($14), $15, $16, $17, $18, $19, $20, $21, $22, $23,
          'pending', true, $24, NOW(), $25
        )
        RETURNING *,
          ST_Y(location_gps) as latitude,
          ST_X(location_gps) as longitude`,
        [
          id,
          input.projectId,
          input.organizationId,
          input.categoryId || null,
          input.costId || null,
          input.amount,
          currency,
          input.description,
          input.expenseType || 'general',
          exchangeRate,
          amountInGHS,
          input.receiptUrl || null,
          input.receiptFileName || null,
          gpsPoint,
          input.locationAddress || null,
          input.locationGhanaPostGps || null,
          input.payeeName || null,
          input.payeePhone || null,
          input.paymentMethod || null,
          input.paymentReference || null,
          input.expenseDate,
          input.expenseTime || null,
          input.weatherConditions || null,
          input.offlineId || null,
          input.loggedBy,
        ]
      );
      
      await client.query('COMMIT');
      
      logger.info('Expense logged', { expenseId: id, projectId: input.projectId });
      return this.mapExpense(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating expense', { input, error });
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Bulk create expenses (for offline sync)
   */
  async bulkCreate(expenses: CreateExpenseInput[]): Promise<{ created: ExpenseLog[]; duplicates: string[] }> {
    const created: ExpenseLog[] = [];
    const duplicates: string[] = [];
    
    for (const expense of expenses) {
      try {
        if (expense.offlineId) {
          const existing = await pool.query(
            'SELECT id FROM expense_logs WHERE offline_id = $1',
            [expense.offlineId]
          );
          if (existing.rows.length > 0) {
            duplicates.push(expense.offlineId);
            continue;
          }
        }
        const result = await this.create(expense);
        created.push(result);
      } catch (error) {
        logger.error('Error in bulk create', { expense, error });
      }
    }
    
    return { created, duplicates };
  }
  
  /**
   * Get expense by ID
   */
  async getById(id: string): Promise<ExpenseLog | null> {
    try {
      const result = await pool.query(
        `SELECT *, 
          ST_Y(location_gps) as latitude,
          ST_X(location_gps) as longitude
         FROM expense_logs WHERE id = $1`,
        [id]
      );
      return result.rows[0] ? this.mapExpense(result.rows[0]) : null;
    } catch (error) {
      logger.error('Error getting expense', { id, error });
      throw error;
    }
  }
  
  /**
   * Get expenses with filters
   */
  async getExpenses(filters: ExpenseFilters, limit = 50, offset = 0): Promise<{ expenses: ExpenseLog[]; total: number }> {
    try {
      let query = `
        SELECT *, 
          ST_Y(location_gps) as latitude,
          ST_X(location_gps) as longitude
        FROM expense_logs WHERE 1=1`;
      let countQuery = 'SELECT COUNT(*) FROM expense_logs WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;
      
      if (filters.projectId) {
        query += ` AND project_id = $${paramIndex}`;
        countQuery += ` AND project_id = $${paramIndex}`;
        params.push(filters.projectId);
        paramIndex++;
      }
      
      if (filters.organizationId) {
        query += ` AND organization_id = $${paramIndex}`;
        countQuery += ` AND organization_id = $${paramIndex}`;
        params.push(filters.organizationId);
        paramIndex++;
      }
      
      if (filters.loggedBy) {
        query += ` AND logged_by = $${paramIndex}`;
        countQuery += ` AND logged_by = $${paramIndex}`;
        params.push(filters.loggedBy);
        paramIndex++;
      }
      
      if (filters.categoryId) {
        query += ` AND category_id = $${paramIndex}`;
        countQuery += ` AND category_id = $${paramIndex}`;
        params.push(filters.categoryId);
        paramIndex++;
      }
      
      if (filters.expenseType) {
        if (Array.isArray(filters.expenseType)) {
          query += ` AND expense_type = ANY($${paramIndex})`;
          countQuery += ` AND expense_type = ANY($${paramIndex})`;
          params.push(filters.expenseType);
        } else {
          query += ` AND expense_type = $${paramIndex}`;
          countQuery += ` AND expense_type = $${paramIndex}`;
          params.push(filters.expenseType);
        }
        paramIndex++;
      }
      
      if (filters.status) {
        if (Array.isArray(filters.status)) {
          query += ` AND status = ANY($${paramIndex})`;
          countQuery += ` AND status = ANY($${paramIndex})`;
          params.push(filters.status);
        } else {
          query += ` AND status = $${paramIndex}`;
          countQuery += ` AND status = $${paramIndex}`;
          params.push(filters.status);
        }
        paramIndex++;
      }
      
      if (filters.startDate) {
        query += ` AND expense_date >= $${paramIndex}`;
        countQuery += ` AND expense_date >= $${paramIndex}`;
        params.push(filters.startDate);
        paramIndex++;
      }
      
      if (filters.endDate) {
        query += ` AND expense_date <= $${paramIndex}`;
        countQuery += ` AND expense_date <= $${paramIndex}`;
        params.push(filters.endDate);
        paramIndex++;
      }
      
      if (filters.minAmount !== undefined) {
        query += ` AND amount >= $${paramIndex}`;
        countQuery += ` AND amount >= $${paramIndex}`;
        params.push(filters.minAmount);
        paramIndex++;
      }
      
      if (filters.maxAmount !== undefined) {
        query += ` AND amount <= $${paramIndex}`;
        countQuery += ` AND amount <= $${paramIndex}`;
        params.push(filters.maxAmount);
        paramIndex++;
      }
      
      if (filters.search) {
        query += ` AND (description ILIKE $${paramIndex} OR payee_name ILIKE $${paramIndex})`;
        countQuery += ` AND (description ILIKE $${paramIndex} OR payee_name ILIKE $${paramIndex})`;
        params.push(`%${filters.search}%`);
        paramIndex++;
      }
      
      // Count query
      const countResult = await pool.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count, 10);
      
      // Main query with pagination
      query += ` ORDER BY expense_date DESC, created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);
      
      const result = await pool.query(query, params);
      
      return {
        expenses: result.rows.map(this.mapExpense),
        total,
      };
    } catch (error) {
      logger.error('Error getting expenses', { filters, error });
      throw error;
    }
  }
  
  /**
   * Get expenses by project
   */
  async getByProject(projectId: string): Promise<ExpenseLog[]> {
    try {
      const result = await pool.query(
        `SELECT *,
          ST_Y(location_gps) as latitude,
          ST_X(location_gps) as longitude
         FROM expense_logs 
         WHERE project_id = $1 
         ORDER BY expense_date DESC, created_at DESC`,
        [projectId]
      );
      return result.rows.map(this.mapExpense);
    } catch (error) {
      logger.error('Error getting project expenses', { projectId, error });
      throw error;
    }
  }
  
  /**
   * Update expense
   */
  async update(id: string, input: UpdateExpenseInput): Promise<ExpenseLog> {
    try {
      const updates: string[] = [];
      const params: any[] = [id];
      let paramIndex = 2;
      
      const fieldMap: Record<string, string> = {
        categoryId: 'category_id',
        costId: 'cost_id',
        expenseType: 'expense_type',
        receiptUrl: 'receipt_url',
        receiptFileName: 'receipt_file_name',
        payeeName: 'payee_name',
        payeePhone: 'payee_phone',
        paymentMethod: 'payment_method',
        paymentReference: 'payment_reference',
        expenseDate: 'expense_date',
        expenseTime: 'expense_time',
        weatherConditions: 'weather_conditions',
        updatedBy: 'updated_by',
      };
      
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined && key !== 'updatedBy') {
          const dbField = fieldMap[key] || key;
          updates.push(`${dbField} = $${paramIndex}`);
          params.push(value);
          paramIndex++;
        }
      }
      
      if (input.updatedBy) {
        updates.push(`updated_by = $${paramIndex}`);
        params.push(input.updatedBy);
        paramIndex++;
      }
      
      // Update exchange rate if currency changed
      if (input.currency && input.currency !== 'GHS') {
        try {
          const rateData = await fxFeedService.getCurrentRate(input.currency);
          updates.push(`exchange_rate = $${paramIndex}`);
          params.push(rateData.rate);
          paramIndex++;
          
          if (input.amount) {
            updates.push(`amount_in_ghs = $${paramIndex}`);
            params.push(input.amount * rateData.rate);
            paramIndex++;
          }
        } catch {
          // Skip rate update on error
        }
      }
      
      updates.push('updated_at = NOW()');
      
      const result = await pool.query(
        `UPDATE expense_logs SET ${updates.join(', ')} 
         WHERE id = $1 
         RETURNING *, ST_Y(location_gps) as latitude, ST_X(location_gps) as longitude`,
        params
      );
      
      if (!result.rows[0]) {
        throw new Error(`Expense not found: ${id}`);
      }
      
      logger.info('Expense updated', { expenseId: id });
      return this.mapExpense(result.rows[0]);
    } catch (error) {
      logger.error('Error updating expense', { id, input, error });
      throw error;
    }
  }
  
  /**
   * Approve expense
   */
  async approve(id: string, approvedBy: string): Promise<ExpenseLog> {
    try {
      const result = await pool.query(
        `UPDATE expense_logs 
         SET status = 'approved', 
             approved_by = $2, 
             approved_at = NOW(),
             updated_at = NOW()
         WHERE id = $1 AND status = 'pending'
         RETURNING *, ST_Y(location_gps) as latitude, ST_X(location_gps) as longitude`,
        [id, approvedBy]
      );
      
      if (!result.rows[0]) {
        throw new Error(`Expense not found or cannot be approved: ${id}`);
      }
      
      logger.info('Expense approved', { expenseId: id, approvedBy });
      return this.mapExpense(result.rows[0]);
    } catch (error) {
      logger.error('Error approving expense', { id, error });
      throw error;
    }
  }
  
  /**
   * Reject expense
   */
  async reject(id: string, reason: string): Promise<ExpenseLog> {
    try {
      const result = await pool.query(
        `UPDATE expense_logs 
         SET status = 'rejected', 
             rejection_reason = $2,
             updated_at = NOW()
         WHERE id = $1 AND status = 'pending'
         RETURNING *, ST_Y(location_gps) as latitude, ST_X(location_gps) as longitude`,
        [id, reason]
      );
      
      if (!result.rows[0]) {
        throw new Error(`Expense not found or cannot be rejected: ${id}`);
      }
      
      logger.info('Expense rejected', { expenseId: id, reason });
      return this.mapExpense(result.rows[0]);
    } catch (error) {
      logger.error('Error rejecting expense', { id, error });
      throw error;
    }
  }
  
  /**
   * Bulk approve expenses
   */
  async bulkApprove(ids: string[], approvedBy: string): Promise<number> {
    try {
      const result = await pool.query(
        `UPDATE expense_logs 
         SET status = 'approved', 
             approved_by = $2, 
             approved_at = NOW(),
             updated_at = NOW()
         WHERE id = ANY($1) AND status = 'pending'
         RETURNING id`,
        [ids, approvedBy]
      );
      
      logger.info('Bulk approved expenses', { count: result.rows.length, approvedBy });
      return result.rows.length;
    } catch (error) {
      logger.error('Error bulk approving expenses', { ids, error });
      throw error;
    }
  }
  
  /**
   * Get expense summary for project
   */
  async getProjectSummary(projectId: string): Promise<ExpenseSummary> {
    try {
      // Get totals
      const totalsResult = await pool.query(
        `SELECT 
          COALESCE(SUM(COALESCE(amount_in_ghs, amount)), 0) as total_expenses,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN COALESCE(amount_in_ghs, amount) ELSE 0 END), 0) as total_pending,
          COALESCE(SUM(CASE WHEN status = 'approved' THEN COALESCE(amount_in_ghs, amount) ELSE 0 END), 0) as total_approved,
          COUNT(*) as expense_count
         FROM expense_logs 
         WHERE project_id = $1 AND status != 'rejected'`,
        [projectId]
      );
      
      // Get by category
      const byCategoryResult = await pool.query(
        `SELECT 
          COALESCE(c.name, 'Uncategorized') as category,
          SUM(COALESCE(e.amount_in_ghs, e.amount)) as total
         FROM expense_logs e
         LEFT JOIN project_cost_categories c ON e.category_id = c.id
         WHERE e.project_id = $1 AND e.status != 'rejected'
         GROUP BY c.name`,
        [projectId]
      );
      
      // Get by type
      const byTypeResult = await pool.query(
        `SELECT expense_type, SUM(COALESCE(amount_in_ghs, amount)) as total
         FROM expense_logs 
         WHERE project_id = $1 AND status != 'rejected'
         GROUP BY expense_type`,
        [projectId]
      );
      
      // Calculate daily average
      const dateRangeResult = await pool.query(
        `SELECT 
          MIN(expense_date) as first_date,
          MAX(expense_date) as last_date
         FROM expense_logs 
         WHERE project_id = $1`,
        [projectId]
      );
      
      const row = totalsResult.rows[0];
      const totalExpenses = parseFloat(row.total_expenses);
      let dailyAverage = 0;
      
      if (dateRangeResult.rows[0]?.first_date && dateRangeResult.rows[0]?.last_date) {
        const firstDate = new Date(dateRangeResult.rows[0].first_date);
        const lastDate = new Date(dateRangeResult.rows[0].last_date);
        const days = Math.max(1, Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
        dailyAverage = totalExpenses / days;
      }
      
      const byCategory: Record<string, number> = {};
      for (const r of byCategoryResult.rows) {
        byCategory[r.category] = parseFloat(r.total);
      }
      
      const byType: Record<string, number> = {};
      for (const r of byTypeResult.rows) {
        byType[r.expense_type] = parseFloat(r.total);
      }
      
      return {
        projectId,
        totalExpenses,
        totalPending: parseFloat(row.total_pending),
        totalApproved: parseFloat(row.total_approved),
        expenseCount: parseInt(row.expense_count, 10),
        byCategory,
        byType,
        dailyAverage,
      };
    } catch (error) {
      logger.error('Error getting project expense summary', { projectId, error });
      throw error;
    }
  }
  
  /**
   * Delete expense
   */
  async delete(id: string): Promise<void> {
    try {
      const result = await pool.query(
        'DELETE FROM expense_logs WHERE id = $1 AND status = \'pending\'',
        [id]
      );
      
      if (result.rowCount === 0) {
        throw new Error(`Expense not found or cannot be deleted: ${id}`);
      }
      
      logger.info('Expense deleted', { expenseId: id });
    } catch (error) {
      logger.error('Error deleting expense', { id, error });
      throw error;
    }
  }
  
  /**
   * Get expenses near a location
   */
  async getNearbyExpenses(
    latitude: number,
    longitude: number,
    radiusMeters: number = 1000
  ): Promise<ExpenseLog[]> {
    try {
      const result = await pool.query(
        `SELECT *,
          ST_Y(location_gps) as latitude,
          ST_X(location_gps) as longitude,
          ST_Distance(
            location_gps::geography,
            ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
          ) as distance
         FROM expense_logs 
         WHERE location_gps IS NOT NULL
           AND ST_DWithin(
             location_gps::geography,
             ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
             $3
           )
         ORDER BY distance ASC`,
        [latitude, longitude, radiusMeters]
      );
      
      return result.rows.map(this.mapExpense);
    } catch (error) {
      logger.error('Error getting nearby expenses', { latitude, longitude, error });
      throw error;
    }
  }
  
  private mapExpense(row: any): ExpenseLog {
    return {
      id: row.id,
      projectId: row.project_id,
      organizationId: row.organization_id,
      categoryId: row.category_id,
      costId: row.cost_id,
      amount: parseFloat(row.amount),
      currency: row.currency,
      description: row.description,
      expenseType: row.expense_type,
      exchangeRate: row.exchange_rate ? parseFloat(row.exchange_rate) : null,
      amountInGHS: row.amount_in_ghs ? parseFloat(row.amount_in_ghs) : null,
      receiptUrl: row.receipt_url,
      receiptFileName: row.receipt_file_name,
      receiptOcrData: row.receipt_ocr_data,
      locationGps: row.latitude && row.longitude
        ? { latitude: parseFloat(row.latitude), longitude: parseFloat(row.longitude) }
        : null,
      locationAddress: row.location_address,
      locationGhanaPostGps: row.location_ghana_post_gps,
      payeeName: row.payee_name,
      payeePhone: row.payee_phone,
      paymentMethod: row.payment_method,
      paymentReference: row.payment_reference,
      expenseDate: row.expense_date,
      expenseTime: row.expense_time,
      weatherConditions: row.weather_conditions,
      status: row.status,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      rejectionReason: row.rejection_reason,
      isSynced: row.is_synced,
      offlineId: row.offline_id,
      syncedAt: row.synced_at,
      loggedBy: row.logged_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// Export singleton
export const expenseLogService = new ExpenseLogService();
export default expenseLogService;
