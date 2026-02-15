/**
 * Financial Aggregator Service
 * 
 * Phase 2.4: Unified Financial Facade
 * 
 * This service provides a unified interface to all financial operations
 * while delegating to specialized services:
 * - projectCostService: Cost line items, budget tracking
 * - budgetAnalyticsService: Multi-currency analytics, forecasting
 * - expenseLogService: Field expense logging with GPS
 * - invoiceService: Invoice management with approval workflow
 * - drawService: Construction financing draws
 * 
 * Use this service when you need:
 * - Complete financial overview for a project
 * - Cross-service financial calculations
 * - Unified financial reporting
 * 
 * @module services/project-management/financial/FinancialAggregatorService
 */

import { Pool, PoolClient } from 'pg';
import { pool } from '../../../database';
import { BaseService } from '../../../../shared-services/base/BaseService';
import {
  UUID,
  CostCategory,
  CostStatus,
  PaymentMethod,
  PaginatedResponse,
  PaginationParams,
} from '../types';
import { ValidationError, NotFoundError } from '../errors';

// =============================================================================
// TYPES
// =============================================================================

export interface ProjectFinancialSummary {
  projectId: UUID;
  projectName: string;
  currency: string;
  
  // Budget
  originalBudget: number;
  budgetModifications: number;
  revisedBudget: number;
  
  // Costs
  committedCosts: number;
  actualCosts: number;
  pendingCosts: number;
  projectedCosts: number;
  
  // Variance
  budgetVariance: number;
  budgetVariancePercent: number;
  
  // Invoices
  totalInvoiced: number;
  invoicesPaid: number;
  invoicesPending: number;
  invoicesOverdue: number;
  
  // Draws
  totalDrawRequests: number;
  drawsApproved: number;
  drawsFunded: number;
  totalRetentionHeld: number;
  
  // Expenses
  totalExpenses: number;
  expensesPending: number;
  expensesApproved: number;
  
  // Cash Flow
  cashInflow: number;
  cashOutflow: number;
  netCashFlow: number;
  
  // Health Indicators
  budgetHealthScore: number; // 0-100
  paymentHealthScore: number; // 0-100
  cashFlowHealthScore: number; // 0-100
  overallHealthScore: number; // 0-100
  
  lastUpdated: Date;
}

export interface CashFlowEntry {
  date: Date;
  type: 'inflow' | 'outflow';
  category: string;
  amount: number;
  runningBalance: number;
  description: string;
  referenceId?: string;
  referenceType?: 'invoice' | 'payment' | 'expense' | 'draw';
}

export interface CostBreakdown {
  category: CostCategory;
  categoryName: string;
  budgeted: number;
  committed: number;
  actual: number;
  remaining: number;
  percentUsed: number;
  itemCount: number;
}

export interface PaymentSchedule {
  id: UUID;
  dueDate: Date;
  amount: number;
  payee: string;
  description: string;
  status: 'upcoming' | 'due_today' | 'overdue' | 'paid';
  daysUntilDue: number;
  referenceType: 'invoice' | 'payment_plan' | 'milestone';
  referenceId: UUID;
}

export interface FinancialAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  category: 'budget' | 'payment' | 'cash_flow' | 'compliance';
  message: string;
  actionRequired: boolean;
  relatedEntity?: {
    type: string;
    id: UUID;
    name: string;
  };
  createdAt: Date;
}

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class FinancialAggregatorServiceImpl extends BaseService {
  constructor() {
    super('FinancialAggregatorService');
  }

  // ===========================================================================
  // PROJECT FINANCIAL SUMMARY
  // ===========================================================================

  /**
   * Get comprehensive financial summary for a project.
   */
  async getProjectFinancialSummary(projectId: UUID): Promise<ProjectFinancialSummary> {
    // Get project info
    const projectResult = await this.query(
      `SELECT id, name, currency FROM development_projects WHERE id = $1`,
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      throw NotFoundError.forResource('Project', projectId);
    }

    const project = projectResult.rows[0];

    // Get cost summary
    const costResult = await this.query(
      `SELECT 
         COALESCE(SUM(original_budget), 0) as original_budget,
         COALESCE(SUM(budget_modifications), 0) as budget_modifications,
         COALESCE(SUM(revised_budget), 0) as revised_budget,
         COALESCE(SUM(committed_costs), 0) as committed_costs,
         COALESCE(SUM(actual_costs), 0) as actual_costs,
         COALESCE(SUM(pending_costs), 0) as pending_costs,
         COALESCE(SUM(projected_costs), 0) as projected_costs
       FROM project_costs
       WHERE project_id = $1`,
      [projectId]
    );

    const costs = costResult.rows[0];

    // Get invoice summary
    const invoiceResult = await this.query(
      `SELECT 
         COALESCE(SUM(total_amount), 0) as total_invoiced,
         COALESCE(SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END), 0) as paid,
         COALESCE(SUM(CASE WHEN status IN ('pending', 'under_review', 'approved') THEN total_amount ELSE 0 END), 0) as pending,
         COALESCE(SUM(CASE WHEN status = 'overdue' THEN total_amount ELSE 0 END), 0) as overdue
       FROM project_invoices
       WHERE project_id = $1`,
      [projectId]
    );

    const invoices = invoiceResult.rows[0];

    // Get draw summary
    const drawResult = await this.query(
      `SELECT 
         COUNT(*) as total,
         COALESCE(SUM(approved_amount), 0) as approved,
         COALESCE(SUM(funded_amount), 0) as funded,
         COALESCE(SUM(retention_held), 0) as retention
       FROM project_draw_requests
       WHERE project_id = $1`,
      [projectId]
    );

    const draws = drawResult.rows[0];

    // Get expense summary
    const expenseResult = await this.query(
      `SELECT 
         COALESCE(SUM(amount), 0) as total,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as pending,
         COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) as approved
       FROM project_expense_logs
       WHERE project_id = $1`,
      [projectId]
    );

    const expenses = expenseResult.rows[0];

    // Calculate variance
    const revisedBudget = parseFloat(costs.revised_budget) || 0;
    const actualCosts = parseFloat(costs.actual_costs) || 0;
    const budgetVariance = revisedBudget - actualCosts;
    const budgetVariancePercent = revisedBudget > 0 
      ? (budgetVariance / revisedBudget) * 100 
      : 0;

    // Calculate cash flow
    const cashInflow = parseFloat(draws.funded) || 0;
    const cashOutflow = parseFloat(expenses.approved) + parseFloat(invoices.paid);
    const netCashFlow = cashInflow - cashOutflow;

    // Calculate health scores
    const budgetHealthScore = this.calculateBudgetHealth(
      revisedBudget,
      actualCosts,
      parseFloat(costs.committed_costs) || 0
    );
    
    const paymentHealthScore = this.calculatePaymentHealth(
      parseFloat(invoices.total_invoiced) || 0,
      parseFloat(invoices.paid) || 0,
      parseFloat(invoices.overdue) || 0
    );
    
    const cashFlowHealthScore = this.calculateCashFlowHealth(
      cashInflow,
      cashOutflow,
      revisedBudget
    );
    
    const overallHealthScore = Math.round(
      (budgetHealthScore + paymentHealthScore + cashFlowHealthScore) / 3
    );

    return {
      projectId,
      projectName: project.name,
      currency: project.currency || 'GHS',
      
      originalBudget: parseFloat(costs.original_budget) || 0,
      budgetModifications: parseFloat(costs.budget_modifications) || 0,
      revisedBudget,
      
      committedCosts: parseFloat(costs.committed_costs) || 0,
      actualCosts,
      pendingCosts: parseFloat(costs.pending_costs) || 0,
      projectedCosts: parseFloat(costs.projected_costs) || 0,
      
      budgetVariance,
      budgetVariancePercent,
      
      totalInvoiced: parseFloat(invoices.total_invoiced) || 0,
      invoicesPaid: parseFloat(invoices.paid) || 0,
      invoicesPending: parseFloat(invoices.pending) || 0,
      invoicesOverdue: parseFloat(invoices.overdue) || 0,
      
      totalDrawRequests: parseInt(draws.total) || 0,
      drawsApproved: parseFloat(draws.approved) || 0,
      drawsFunded: parseFloat(draws.funded) || 0,
      totalRetentionHeld: parseFloat(draws.retention) || 0,
      
      totalExpenses: parseFloat(expenses.total) || 0,
      expensesPending: parseFloat(expenses.pending) || 0,
      expensesApproved: parseFloat(expenses.approved) || 0,
      
      cashInflow,
      cashOutflow,
      netCashFlow,
      
      budgetHealthScore,
      paymentHealthScore,
      cashFlowHealthScore,
      overallHealthScore,
      
      lastUpdated: new Date(),
    };
  }

  // ===========================================================================
  // COST BREAKDOWN
  // ===========================================================================

  /**
   * Get cost breakdown by category.
   */
  async getCostBreakdownByCategory(projectId: UUID): Promise<CostBreakdown[]> {
    const result = await this.query(
      `SELECT 
         category,
         COALESCE(SUM(revised_budget), 0) as budgeted,
         COALESCE(SUM(committed_costs), 0) as committed,
         COALESCE(SUM(actual_costs), 0) as actual,
         COUNT(*) as item_count
       FROM project_costs
       WHERE project_id = $1
       GROUP BY category
       ORDER BY SUM(revised_budget) DESC`,
      [projectId]
    );

    return result.rows.map(row => {
      const budgeted = parseFloat(row.budgeted) || 0;
      const actual = parseFloat(row.actual) || 0;
      const remaining = budgeted - actual;
      
      return {
        category: row.category as CostCategory,
        categoryName: this.formatCategoryName(row.category),
        budgeted,
        committed: parseFloat(row.committed) || 0,
        actual,
        remaining,
        percentUsed: budgeted > 0 ? (actual / budgeted) * 100 : 0,
        itemCount: parseInt(row.item_count) || 0,
      };
    });
  }

  // ===========================================================================
  // CASH FLOW
  // ===========================================================================

  /**
   * Get cash flow history for a project.
   */
  async getCashFlowHistory(
    projectId: UUID,
    options: { fromDate?: Date; toDate?: Date } & PaginationParams
  ): Promise<PaginatedResponse<CashFlowEntry>> {
    const { page = 1, limit = 50, fromDate, toDate } = options;
    const offset = (page - 1) * limit;

    const conditions: string[] = ['project_id = $1'];
    const params: any[] = [projectId];
    let paramIndex = 2;

    if (fromDate) {
      conditions.push(`transaction_date >= $${paramIndex++}`);
      params.push(fromDate);
    }

    if (toDate) {
      conditions.push(`transaction_date <= $${paramIndex++}`);
      params.push(toDate);
    }

    const whereClause = conditions.join(' AND ');

    // This assumes a cash_flow_ledger table or view exists
    // If not, we'd need to UNION across multiple tables
    const countResult = await this.query(
      `SELECT COUNT(*) FROM project_cash_flow_ledger WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    const result = await this.query(
      `SELECT 
         transaction_date as date,
         transaction_type as type,
         category,
         amount,
         SUM(CASE WHEN transaction_type = 'inflow' THEN amount ELSE -amount END) 
           OVER (ORDER BY transaction_date, created_at) as running_balance,
         description,
         reference_id,
         reference_type
       FROM project_cash_flow_ledger
       WHERE ${whereClause}
       ORDER BY transaction_date DESC, created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, limit, offset]
    );

    return {
      data: result.rows.map(row => ({
        date: row.date,
        type: row.type,
        category: row.category,
        amount: parseFloat(row.amount),
        runningBalance: parseFloat(row.running_balance) || 0,
        description: row.description,
        referenceId: row.reference_id,
        referenceType: row.reference_type,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    };
  }

  // ===========================================================================
  // PAYMENT SCHEDULE
  // ===========================================================================

  /**
   * Get upcoming payments for a project.
   */
  async getUpcomingPayments(
    projectId: UUID,
    options: { daysAhead?: number } = {}
  ): Promise<PaymentSchedule[]> {
    const { daysAhead = 30 } = options;
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const result = await this.query(
      `SELECT 
         id,
         due_date,
         total_amount as amount,
         vendor_name as payee,
         description,
         status,
         'invoice' as reference_type
       FROM project_invoices
       WHERE project_id = $1 
         AND due_date <= $2
         AND status NOT IN ('paid', 'cancelled', 'rejected')
       ORDER BY due_date ASC`,
      [projectId, futureDate]
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return result.rows.map(row => {
      const dueDate = new Date(row.due_date);
      dueDate.setHours(0, 0, 0, 0);
      
      const daysUntilDue = Math.ceil(
        (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      let status: PaymentSchedule['status'] = 'upcoming';
      if (daysUntilDue < 0) {
        status = 'overdue';
      } else if (daysUntilDue === 0) {
        status = 'due_today';
      }

      return {
        id: row.id,
        dueDate,
        amount: parseFloat(row.amount),
        payee: row.payee || 'Unknown',
        description: row.description || '',
        status,
        daysUntilDue,
        referenceType: row.reference_type,
        referenceId: row.id,
      };
    });
  }

  // ===========================================================================
  // FINANCIAL ALERTS
  // ===========================================================================

  /**
   * Get financial alerts for a project.
   */
  async getFinancialAlerts(projectId: UUID): Promise<FinancialAlert[]> {
    const alerts: FinancialAlert[] = [];

    // Check budget overruns
    const costResult = await this.query(
      `SELECT id, description, revised_budget, actual_costs, category
       FROM project_costs
       WHERE project_id = $1 AND actual_costs > revised_budget`,
      [projectId]
    );

    for (const row of costResult.rows) {
      const overrun = parseFloat(row.actual_costs) - parseFloat(row.revised_budget);
      alerts.push({
        id: `budget-overrun-${row.id}`,
        severity: overrun > parseFloat(row.revised_budget) * 0.1 ? 'critical' : 'warning',
        category: 'budget',
        message: `${row.description} is over budget by ${overrun.toFixed(2)}`,
        actionRequired: true,
        relatedEntity: {
          type: 'cost',
          id: row.id,
          name: row.description,
        },
        createdAt: new Date(),
      });
    }

    // Check overdue invoices
    const invoiceResult = await this.query(
      `SELECT id, invoice_number, total_amount, due_date
       FROM project_invoices
       WHERE project_id = $1 
         AND status NOT IN ('paid', 'cancelled', 'rejected')
         AND due_date < CURRENT_DATE`,
      [projectId]
    );

    for (const row of invoiceResult.rows) {
      const daysOverdue = Math.ceil(
        (new Date().getTime() - new Date(row.due_date).getTime()) / (1000 * 60 * 60 * 24)
      );
      
      alerts.push({
        id: `overdue-invoice-${row.id}`,
        severity: daysOverdue > 30 ? 'critical' : 'warning',
        category: 'payment',
        message: `Invoice ${row.invoice_number} is ${daysOverdue} days overdue (${parseFloat(row.total_amount).toFixed(2)})`,
        actionRequired: true,
        relatedEntity: {
          type: 'invoice',
          id: row.id,
          name: row.invoice_number,
        },
        createdAt: new Date(),
      });
    }

    // Check pending expenses awaiting approval
    const expenseResult = await this.query(
      `SELECT COUNT(*) as count, SUM(amount) as total
       FROM project_expense_logs
       WHERE project_id = $1 AND status = 'pending'`,
      [projectId]
    );

    if (parseInt(expenseResult.rows[0].count) > 5) {
      alerts.push({
        id: 'pending-expenses',
        severity: 'info',
        category: 'budget',
        message: `${expenseResult.rows[0].count} expenses pending approval (${parseFloat(expenseResult.rows[0].total || 0).toFixed(2)} total)`,
        actionRequired: true,
        createdAt: new Date(),
      });
    }

    return alerts.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private calculateBudgetHealth(
    revisedBudget: number,
    actualCosts: number,
    committedCosts: number
  ): number {
    if (revisedBudget <= 0) return 100;
    
    const totalCommitted = actualCosts + committedCosts;
    const percentUsed = (totalCommitted / revisedBudget) * 100;
    
    if (percentUsed > 100) return Math.max(0, 100 - (percentUsed - 100) * 2);
    if (percentUsed > 90) return Math.round(100 - (percentUsed - 90) * 1.5);
    return Math.round(100 - percentUsed * 0.1);
  }

  private calculatePaymentHealth(
    totalInvoiced: number,
    paid: number,
    overdue: number
  ): number {
    if (totalInvoiced <= 0) return 100;
    
    const overduePercent = (overdue / totalInvoiced) * 100;
    const paidPercent = (paid / totalInvoiced) * 100;
    
    // Penalize for overdue, reward for paid
    let score = 100 - overduePercent * 2;
    score += (paidPercent - 50) * 0.2; // Bonus for paying more than 50%
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private calculateCashFlowHealth(
    inflow: number,
    outflow: number,
    budget: number
  ): number {
    if (budget <= 0) return 100;
    
    const netFlow = inflow - outflow;
    const flowRatio = budget > 0 ? netFlow / budget : 0;
    
    // Positive flow is healthy
    if (flowRatio >= 0.1) return 100;
    if (flowRatio >= 0) return 90;
    if (flowRatio >= -0.1) return 70;
    if (flowRatio >= -0.2) return 50;
    return Math.max(0, 50 + flowRatio * 100);
  }

  private formatCategoryName(category: string): string {
    return category
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const financialAggregatorService = new FinancialAggregatorServiceImpl();
