/**
 * Payment Plan Service
 * Phase 5.8 Week 5 - Ghana-Specific Buyer Payment Plans
 * 
 * Handles installment payment plans for unit buyers.
 * Supports Mobile Money (MoMo) and bank transfers.
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { BaseService } from '../base/BaseService';
import { eventBus, ProjectEventType } from './events';

// =====================================================
// TYPES
// =====================================================

export type PaymentMethod = 
  | 'bank_transfer'
  | 'momo_mtn'
  | 'momo_vodafone'
  | 'momo_airteltigo'
  | 'cash'
  | 'cheque'
  | 'card';

export interface BuyerPaymentRecord {
  id: string;
  payment_plan_id: string;
  payment_date: Date;
  amount: number;
  payment_method: PaymentMethod;
  reference_number?: string;
  momo_transaction_id?: string;
  receipt_url?: string;
  notes?: string;
  recorded_by?: string;
  created_at: Date;
}

export interface BuyerPaymentPlan {
  id: string;
  unit_id: string;
  organization_id: string;
  buyer_contact_id: string;
  buyer_name?: string;
  buyer_email?: string;
  buyer_phone?: string;
  
  // Plan details
  total_amount: number;
  down_payment: number;
  down_payment_date?: Date;
  financed_amount: number;
  installment_months: number;
  monthly_payment: number;
  interest_rate: number;
  
  // Schedule
  start_date: Date;
  end_date: Date;
  payment_day: number; // Day of month (1-28)
  
  // Progress
  total_paid: number;
  remaining_balance: number;
  payments_made: number;
  next_payment_date?: Date;
  last_payment_date?: Date;
  
  // Status
  is_active: boolean;
  is_completed: boolean;
  is_defaulted: boolean;
  days_overdue: number;
  
  // Payments
  payments: BuyerPaymentRecord[];
  
  // Metadata
  notes?: string;
  contract_document_url?: string;
  
  // Audit
  created_at: Date;
  updated_at: Date;
  created_by?: string;
}

export interface CreatePaymentPlanInput {
  unit_id: string;
  organization_id: string;
  buyer_contact_id: string;
  total_amount: number;
  down_payment: number;
  down_payment_date?: Date;
  installment_months: number;
  interest_rate?: number;
  start_date: Date;
  payment_day?: number;
  notes?: string;
  contract_document_url?: string;
  created_by?: string;
}

export interface RecordPaymentInput {
  amount: number;
  payment_method: PaymentMethod;
  payment_date?: Date;
  reference_number?: string;
  momo_transaction_id?: string;
  receipt_url?: string;
  notes?: string;
  recorded_by?: string;
}

export interface PaymentScheduleItem {
  payment_number: number;
  due_date: Date;
  amount: number;
  principal: number;
  interest: number;
  balance: number;
  status: 'paid' | 'partial' | 'pending' | 'overdue';
}

export interface PaymentPlanSummary {
  organization_id: string;
  total_plans: number;
  active_plans: number;
  completed_plans: number;
  defaulted_plans: number;
  total_receivables: number;
  total_collected: number;
  collection_rate: number;
  overdue_amount: number;
  upcoming_payments: {
    unit_number: string;
    buyer_name: string;
    amount: number;
    due_date: Date;
  }[];
}

// =====================================================
// PAYMENT PLAN SERVICE CLASS
// =====================================================

class PaymentPlanService extends BaseService {
  constructor() {
    super('PaymentPlanService');
  }

  // =====================================================
  // CRUD OPERATIONS
  // =====================================================

  /**
   * Create a new payment plan
   */
  async create(input: CreatePaymentPlanInput): Promise<BuyerPaymentPlan> {
    return this.executeInTransaction(async (client) => {
      
      // Calculate plan details
      const interestRate = input.interest_rate || 0;
      const financedAmount = input.total_amount - input.down_payment;
      const totalInterest = financedAmount * (interestRate / 100) * (input.installment_months / 12);
      const totalWithInterest = financedAmount + totalInterest;
      const monthlyPayment = totalWithInterest / input.installment_months;
      
      // Calculate end date
      const startDate = new Date(input.start_date);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + input.installment_months);
      
      const paymentDay = input.payment_day || startDate.getDate();
      
      // Get buyer info
      const buyerResult = await client.query(`
        SELECT full_name, email, phone FROM contacts WHERE id = $1
      `, [input.buyer_contact_id]);
      const buyer = buyerResult.rows[0];
      
      // Create plan
      const result = await client.query(`
        INSERT INTO buyer_payment_plans (
          unit_id, organization_id, buyer_contact_id,
          total_amount, down_payment, down_payment_date,
          financed_amount, installment_months, monthly_payment, interest_rate,
          start_date, end_date, payment_day,
          total_paid, remaining_balance, payments_made,
          is_active, is_completed, is_defaulted,
          notes, contract_document_url, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0, $7, 0, true, false, false, $14, $15, $16)
        RETURNING *
      `, [
        input.unit_id,
        input.organization_id,
        input.buyer_contact_id,
        input.total_amount,
        input.down_payment,
        input.down_payment_date,
        financedAmount,
        input.installment_months,
        monthlyPayment,
        interestRate,
        startDate,
        endDate,
        paymentDay,
        input.notes,
        input.contract_document_url,
        input.created_by
      ]);
      
      // Update unit status to under_contract
      await client.query(`
        UPDATE project_units
        SET status = 'under_contract', updated_at = NOW()
        WHERE id = $1
      `, [input.unit_id]);
      
      this.logger.info({ planId: result.rows[0].id }, 'Payment plan created');
      
      return {
        ...this.mapRow(result.rows[0]),
        buyer_name: buyer?.full_name,
        buyer_email: buyer?.email,
        buyer_phone: buyer?.phone,
        payments: []
      };
    });
  }

  /**
   * Get payment plan by ID
   */
  async getById(id: string): Promise<BuyerPaymentPlan | null> {
    const result = await pool.query(`
      SELECT pp.*,
             c.full_name as buyer_name,
             c.email as buyer_email,
             c.phone as buyer_phone,
             pu.unit_number
      FROM buyer_payment_plans pp
      LEFT JOIN contacts c ON pp.buyer_contact_id = c.id
      LEFT JOIN project_units pu ON pp.unit_id = pu.id
      WHERE pp.id = $1 AND pp.deleted_at IS NULL
    `, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    // Get payments
    const payments = await this.getPayments(id);
    
    return {
      ...this.mapRow(result.rows[0]),
      buyer_name: result.rows[0].buyer_name,
      buyer_email: result.rows[0].buyer_email,
      buyer_phone: result.rows[0].buyer_phone,
      payments
    };
  }

  /**
   * Get payment plan by unit
   */
  async getByUnit(unitId: string): Promise<BuyerPaymentPlan | null> {
    const result = await pool.query(`
      SELECT pp.*,
             c.full_name as buyer_name,
             c.email as buyer_email,
             c.phone as buyer_phone
      FROM buyer_payment_plans pp
      LEFT JOIN contacts c ON pp.buyer_contact_id = c.id
      WHERE pp.unit_id = $1 AND pp.is_active = true AND pp.deleted_at IS NULL
    `, [unitId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const payments = await this.getPayments(result.rows[0].id);
    
    return {
      ...this.mapRow(result.rows[0]),
      buyer_name: result.rows[0].buyer_name,
      buyer_email: result.rows[0].buyer_email,
      buyer_phone: result.rows[0].buyer_phone,
      payments
    };
  }

  /**
   * Get all payment plans for an organization
   */
  async getAll(
    organizationId: string,
    filters?: {
      is_active?: boolean;
      is_defaulted?: boolean;
      buyer_contact_id?: string;
      project_id?: string;
    },
    page = 1,
    limit = 20
  ): Promise<{
    data: BuyerPaymentPlan[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const conditions: string[] = ['pp.organization_id = $1', 'pp.deleted_at IS NULL'];
    const params: any[] = [organizationId];
    let paramCount = 1;
    
    if (filters?.is_active !== undefined) {
      conditions.push(`pp.is_active = $${++paramCount}`);
      params.push(filters.is_active);
    }
    
    if (filters?.is_defaulted !== undefined) {
      conditions.push(`pp.is_defaulted = $${++paramCount}`);
      params.push(filters.is_defaulted);
    }
    
    if (filters?.buyer_contact_id) {
      conditions.push(`pp.buyer_contact_id = $${++paramCount}`);
      params.push(filters.buyer_contact_id);
    }
    
    if (filters?.project_id) {
      conditions.push(`pu.project_id = $${++paramCount}`);
      params.push(filters.project_id);
    }
    
    const whereClause = conditions.join(' AND ');
    
    // Count
    const countResult = await pool.query(`
      SELECT COUNT(*) FROM buyer_payment_plans pp
      LEFT JOIN project_units pu ON pp.unit_id = pu.id
      WHERE ${whereClause}
    `, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Get data
    const offset = (page - 1) * limit;
    const result = await pool.query(`
      SELECT pp.*,
             c.full_name as buyer_name,
             c.email as buyer_email,
             c.phone as buyer_phone,
             pu.unit_number,
             dp.project_name
      FROM buyer_payment_plans pp
      LEFT JOIN contacts c ON pp.buyer_contact_id = c.id
      LEFT JOIN project_units pu ON pp.unit_id = pu.id
      LEFT JOIN development_projects dp ON pu.project_id = dp.id
      WHERE ${whereClause}
      ORDER BY pp.created_at DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `, [...params, limit, offset]);
    
    return {
      data: result.rows.map(row => ({
        ...this.mapRow(row),
        buyer_name: row.buyer_name,
        buyer_email: row.buyer_email,
        buyer_phone: row.buyer_phone,
        payments: []
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  // =====================================================
  // PAYMENT RECORDING
  // =====================================================

  /**
   * Record a payment
   */
  async recordPayment(planId: string, input: RecordPaymentInput): Promise<BuyerPaymentPlan | null> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const plan = await this.getById(planId);
      if (!plan || !plan.is_active) {
        return null;
      }
      
      const paymentDate = input.payment_date || new Date();
      
      // Insert payment record
      await client.query(`
        INSERT INTO buyer_payment_records (
          payment_plan_id, payment_date, amount, payment_method,
          reference_number, momo_transaction_id, receipt_url, notes, recorded_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        planId,
        paymentDate,
        input.amount,
        input.payment_method,
        input.reference_number,
        input.momo_transaction_id,
        input.receipt_url,
        input.notes,
        input.recorded_by
      ]);
      
      // Update plan totals
      const newTotalPaid = plan.total_paid + input.amount;
      const newRemainingBalance = plan.financed_amount - newTotalPaid;
      const newPaymentsMade = plan.payments_made + 1;
      const isCompleted = newRemainingBalance <= 0;
      
      // Calculate next payment date
      let nextPaymentDate: Date | null = null;
      if (!isCompleted) {
        nextPaymentDate = new Date(paymentDate);
        nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
        nextPaymentDate.setDate(plan.payment_day);
      }
      
      await client.query(`
        UPDATE buyer_payment_plans
        SET total_paid = $2,
            remaining_balance = $3,
            payments_made = $4,
            last_payment_date = $5,
            next_payment_date = $6,
            is_completed = $7,
            is_active = NOT $7,
            updated_at = NOW()
        WHERE id = $1
      `, [planId, newTotalPaid, Math.max(0, newRemainingBalance), newPaymentsMade, paymentDate, nextPaymentDate, isCompleted]);
      
      // If completed, update unit status
      if (isCompleted) {
        await client.query(`
          UPDATE project_units
          SET status = 'sold', updated_at = NOW()
          WHERE id = $1
        `, [plan.unit_id]);
      }
      
      // Update unit payment totals
      await client.query(`
        UPDATE project_units
        SET total_paid = COALESCE(total_paid, 0) + $2,
            balance_due = COALESCE(balance_due, 0) - $2,
            updated_at = NOW()
        WHERE id = $1
      `, [plan.unit_id, input.amount]);
      
      await client.query('COMMIT');
      
      logger.info({ planId, amount: input.amount, method: input.payment_method }, 'Payment recorded');
      
      return this.getById(planId);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ error, planId, input }, 'Failed to record payment');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get payment records for a plan
   */
  async getPayments(planId: string): Promise<BuyerPaymentRecord[]> {
    const result = await pool.query(`
      SELECT * FROM buyer_payment_records
      WHERE payment_plan_id = $1
      ORDER BY payment_date DESC
    `, [planId]);
    
    return result.rows.map(row => ({
      id: row.id,
      payment_plan_id: row.payment_plan_id,
      payment_date: row.payment_date,
      amount: parseFloat(row.amount),
      payment_method: row.payment_method,
      reference_number: row.reference_number,
      momo_transaction_id: row.momo_transaction_id,
      receipt_url: row.receipt_url,
      notes: row.notes,
      recorded_by: row.recorded_by,
      created_at: row.created_at,
    }));
  }

  // =====================================================
  // SCHEDULE & ANALYTICS
  // =====================================================

  /**
   * Generate payment schedule
   */
  async getSchedule(planId: string): Promise<PaymentScheduleItem[]> {
    const plan = await this.getById(planId);
    if (!plan) {
      return [];
    }
    
    const schedule: PaymentScheduleItem[] = [];
    let balance = plan.financed_amount;
    let paidSoFar = plan.total_paid;
    const monthlyInterest = plan.interest_rate / 100 / 12;
    
    for (let i = 1; i <= plan.installment_months; i++) {
      const dueDate = new Date(plan.start_date);
      dueDate.setMonth(dueDate.getMonth() + i);
      dueDate.setDate(plan.payment_day);
      
      const interest = balance * monthlyInterest;
      const principal = plan.monthly_payment - interest;
      balance = Math.max(0, balance - principal);
      
      // Determine status
      let status: 'paid' | 'partial' | 'pending' | 'overdue';
      if (paidSoFar >= plan.monthly_payment * i) {
        status = 'paid';
      } else if (paidSoFar > plan.monthly_payment * (i - 1)) {
        status = 'partial';
      } else if (dueDate > new Date()) {
        status = 'pending';
      } else {
        status = 'overdue';
      }
      
      schedule.push({
        payment_number: i,
        due_date: dueDate,
        amount: plan.monthly_payment,
        principal,
        interest,
        balance,
        status
      });
    }
    
    return schedule;
  }

  /**
   * Get payment summary for organization
   */
  async getSummary(organizationId: string): Promise<PaymentPlanSummary> {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_plans,
        COUNT(CASE WHEN is_active THEN 1 END) as active_plans,
        COUNT(CASE WHEN is_completed THEN 1 END) as completed_plans,
        COUNT(CASE WHEN is_defaulted THEN 1 END) as defaulted_plans,
        COALESCE(SUM(financed_amount), 0) as total_receivables,
        COALESCE(SUM(total_paid), 0) as total_collected,
        COALESCE(SUM(CASE 
          WHEN is_active AND next_payment_date < NOW() 
          THEN remaining_balance * (EXTRACT(DAY FROM NOW() - next_payment_date)::int / 30 + 1) / installment_months
          ELSE 0 
        END), 0) as overdue_amount
      FROM buyer_payment_plans
      WHERE organization_id = $1 AND deleted_at IS NULL
    `, [organizationId]);
    
    const stats = result.rows[0];
    
    // Get upcoming payments
    const upcomingResult = await pool.query(`
      SELECT pp.monthly_payment, pp.next_payment_date,
             c.full_name as buyer_name,
             pu.unit_number
      FROM buyer_payment_plans pp
      LEFT JOIN contacts c ON pp.buyer_contact_id = c.id
      LEFT JOIN project_units pu ON pp.unit_id = pu.id
      WHERE pp.organization_id = $1 
        AND pp.is_active = true 
        AND pp.deleted_at IS NULL
        AND pp.next_payment_date IS NOT NULL
      ORDER BY pp.next_payment_date ASC
      LIMIT 10
    `, [organizationId]);
    
    const totalReceivables = parseFloat(stats.total_receivables) || 0;
    const totalCollected = parseFloat(stats.total_collected) || 0;
    
    return {
      organization_id: organizationId,
      total_plans: parseInt(stats.total_plans) || 0,
      active_plans: parseInt(stats.active_plans) || 0,
      completed_plans: parseInt(stats.completed_plans) || 0,
      defaulted_plans: parseInt(stats.defaulted_plans) || 0,
      total_receivables: totalReceivables,
      total_collected: totalCollected,
      collection_rate: totalReceivables > 0 ? (totalCollected / totalReceivables) * 100 : 0,
      overdue_amount: parseFloat(stats.overdue_amount) || 0,
      upcoming_payments: upcomingResult.rows.map(row => ({
        unit_number: row.unit_number,
        buyer_name: row.buyer_name,
        amount: parseFloat(row.monthly_payment),
        due_date: row.next_payment_date
      }))
    };
  }

  /**
   * Mark plan as defaulted
   */
  async markDefaulted(planId: string, reason?: string): Promise<BuyerPaymentPlan | null> {
    const result = await pool.query(`
      UPDATE buyer_payment_plans
      SET is_defaulted = true,
          is_active = false,
          notes = COALESCE(notes || E'\n', '') || 'Defaulted: ' || COALESCE($2, 'No reason provided'),
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `, [planId, reason]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    logger.warn({ planId, reason }, 'Payment plan marked as defaulted');
    return this.getById(planId);
  }

  /**
   * Cancel payment plan
   */
  async cancel(planId: string, reason: string): Promise<boolean> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const plan = await this.getById(planId);
      if (!plan) {
        return false;
      }
      
      // Deactivate plan
      await client.query(`
        UPDATE buyer_payment_plans
        SET is_active = false,
            notes = COALESCE(notes || E'\n', '') || 'Cancelled: ' || $2,
            updated_at = NOW()
        WHERE id = $1
      `, [planId, reason]);
      
      // Reset unit status to available
      await client.query(`
        UPDATE project_units
        SET status = 'available',
            reserved_by_contact_id = NULL,
            reservation_date = NULL,
            sale_price = NULL,
            contract_date = NULL,
            total_paid = 0,
            balance_due = final_price,
            updated_at = NOW()
        WHERE id = $1
      `, [plan.unit_id]);
      
      await client.query('COMMIT');
      
      logger.info({ planId, reason }, 'Payment plan cancelled');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  protected mapRow(row: any): Omit<BuyerPaymentPlan, 'payments' | 'buyer_name' | 'buyer_email' | 'buyer_phone'> {
    // Calculate days overdue
    let daysOverdue = 0;
    if (row.next_payment_date && new Date(row.next_payment_date) < new Date()) {
      daysOverdue = Math.floor((new Date().getTime() - new Date(row.next_payment_date).getTime()) / (1000 * 60 * 60 * 24));
    }
    
    return {
      id: row.id,
      unit_id: row.unit_id,
      organization_id: row.organization_id,
      buyer_contact_id: row.buyer_contact_id,
      total_amount: parseFloat(row.total_amount) || 0,
      down_payment: parseFloat(row.down_payment) || 0,
      down_payment_date: row.down_payment_date,
      financed_amount: parseFloat(row.financed_amount) || 0,
      installment_months: parseInt(row.installment_months) || 0,
      monthly_payment: parseFloat(row.monthly_payment) || 0,
      interest_rate: parseFloat(row.interest_rate) || 0,
      start_date: row.start_date,
      end_date: row.end_date,
      payment_day: parseInt(row.payment_day) || 1,
      total_paid: parseFloat(row.total_paid) || 0,
      remaining_balance: parseFloat(row.remaining_balance) || 0,
      payments_made: parseInt(row.payments_made) || 0,
      next_payment_date: row.next_payment_date,
      last_payment_date: row.last_payment_date,
      is_active: row.is_active,
      is_completed: row.is_completed,
      is_defaulted: row.is_defaulted,
      days_overdue: daysOverdue,
      notes: row.notes,
      contract_document_url: row.contract_document_url,
      created_at: row.created_at,
      updated_at: row.updated_at,
      created_by: row.created_by,
    };
  }
}

export const paymentPlanService = new PaymentPlanService();
export default paymentPlanService;
