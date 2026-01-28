/**
 * Financial Services Module
 * 
 * Unified access to all financial services:
 * - FinancialAggregatorService: Cross-service financial overview
 * 
 * For specialized operations, import the individual services:
 * - projectCostService: Cost line items
 * - budgetAnalyticsService: Multi-currency analytics
 * - expenseLogService: Field expense logging
 * - invoiceService: Invoice management
 * - drawService: Construction financing
 * 
 * @module services/project-management/financial
 */

export {
  financialAggregatorService,
  ProjectFinancialSummary,
  CashFlowEntry,
  CostBreakdown,
  PaymentSchedule,
  FinancialAlert,
} from './FinancialAggregatorService';
