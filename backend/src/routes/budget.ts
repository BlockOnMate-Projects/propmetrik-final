/**
 * Budget Routes
 * Phase 4 Sprint 7 - Enhanced Budget Module
 * 
 * API routes for:
 * - Budget analytics (multi-currency, variance, forecasting)
 * - Exchange rate locking
 * - Invoice management
 * - Expense logging
 * - Budget alerts
 */

import { Router, Request, Response } from 'express';
import { budgetAnalyticsService } from '../services/project-management/budgetAnalyticsService';
import { invoiceService, InvoiceStatus } from '../services/project-management/invoiceService';
import { expenseLogService, ExpenseType, ExpenseStatus } from '../services/project-management/expenseLogService';
import { logger } from '../utils/logger';

const router = Router();

// ============================================================================
// BUDGET ANALYTICS
// ============================================================================

/**
 * GET /budget/:projectId/analytics
 * Get comprehensive budget analytics for a project
 */
router.get('/:projectId/analytics', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const currencies = (req.query.currencies as string)?.split(',') || ['USD', 'GBP', 'EUR'];
    
    const [multiCurrency, variance, forecast] = await Promise.all([
      budgetAnalyticsService.getBudgetWithConversions(projectId, currencies),
      budgetAnalyticsService.calculateVariance(projectId),
      budgetAnalyticsService.forecastBudget(projectId),
    ]);
    
    res.json({
      success: true,
      data: {
        multiCurrency,
        variance,
        forecast,
      },
    });
  } catch (error) {
    logger.error('Error getting budget analytics', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get budget analytics',
    });
  }
});

/**
 * GET /budget/:projectId/conversions
 * Get budget with multi-currency conversions
 */
router.get('/:projectId/conversions', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const currencies = (req.query.currencies as string)?.split(',') || ['USD', 'GBP', 'EUR'];
    
    const data = await budgetAnalyticsService.getBudgetWithConversions(projectId, currencies);
    
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error('Error getting budget conversions', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get budget conversions',
    });
  }
});

/**
 * GET /budget/:projectId/variance
 * Get budget variance analysis
 */
router.get('/:projectId/variance', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    
    const data = await budgetAnalyticsService.calculateVariance(projectId);
    
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error('Error getting budget variance', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get budget variance',
    });
  }
});

/**
 * GET /budget/:projectId/forecast
 * Get budget forecast
 */
router.get('/:projectId/forecast', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    
    const data = await budgetAnalyticsService.forecastBudget(projectId);
    
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error('Error getting budget forecast', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get budget forecast',
    });
  }
});

/**
 * GET /budget/:projectId/trend
 * Get budget trend data
 */
router.get('/:projectId/trend', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    
    const data = await budgetAnalyticsService.getBudgetTrend(projectId, startDate, endDate);
    
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error('Error getting budget trend', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get budget trend',
    });
  }
});

// ============================================================================
// EXCHANGE RATE LOCKS
// ============================================================================

/**
 * POST /budget/:projectId/rate-locks
 * Lock an exchange rate for budget planning
 */
router.post('/:projectId/rate-locks', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { organizationId, fromCurrency, toCurrency, lockedRate, lockReason, validFrom, validUntil, budgetAmountLocked } = req.body;
    const userId = (req as any).user?.id || req.body.lockedBy;
    
    const lock = await budgetAnalyticsService.lockExchangeRate({
      projectId,
      organizationId,
      fromCurrency,
      toCurrency,
      lockedRate,
      lockReason,
      validFrom: validFrom ? new Date(validFrom) : undefined,
      validUntil: validUntil ? new Date(validUntil) : undefined,
      budgetAmountLocked,
      lockedBy: userId,
    });
    
    res.status(201).json({
      success: true,
      data: lock,
    });
  } catch (error) {
    logger.error('Error locking exchange rate', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to lock exchange rate',
    });
  }
});

/**
 * GET /budget/:projectId/rate-locks
 * Get active exchange rate locks
 */
router.get('/:projectId/rate-locks', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    
    const locks = await budgetAnalyticsService.getActiveRateLocks(projectId);
    
    res.json({
      success: true,
      data: locks,
    });
  } catch (error) {
    logger.error('Error getting rate locks', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get rate locks',
    });
  }
});

/**
 * DELETE /budget/rate-locks/:lockId
 * Release an exchange rate lock
 */
router.delete('/rate-locks/:lockId', async (req: Request, res: Response) => {
  try {
    const { lockId } = req.params;
    
    await budgetAnalyticsService.releaseRateLock(lockId);
    
    res.json({
      success: true,
      message: 'Rate lock released',
    });
  } catch (error) {
    logger.error('Error releasing rate lock', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to release rate lock',
    });
  }
});

// ============================================================================
// SNAPSHOTS
// ============================================================================

/**
 * POST /budget/:projectId/snapshots
 * Create a budget snapshot
 */
router.post('/:projectId/snapshots', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { organizationId, snapshotType } = req.body;
    const userId = (req as any).user?.id;
    
    const snapshot = await budgetAnalyticsService.createSnapshot(
      projectId,
      organizationId,
      snapshotType || 'manual',
      userId
    );
    
    res.status(201).json({
      success: true,
      data: snapshot,
    });
  } catch (error) {
    logger.error('Error creating snapshot', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to create snapshot',
    });
  }
});

// ============================================================================
// ALERTS
// ============================================================================

/**
 * GET /budget/:projectId/alerts
 * Get active budget alerts
 */
router.get('/:projectId/alerts', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    
    const alerts = await budgetAnalyticsService.getActiveAlerts(projectId);
    
    res.json({
      success: true,
      data: alerts,
    });
  } catch (error) {
    logger.error('Error getting alerts', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get alerts',
    });
  }
});

/**
 * POST /budget/:projectId/alerts/check
 * Check budget thresholds and generate alerts
 */
router.post('/:projectId/alerts/check', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { organizationId } = req.body;
    
    const alerts = await budgetAnalyticsService.checkBudgetThresholds(projectId, organizationId);
    
    res.json({
      success: true,
      data: alerts,
      message: `${alerts.length} new alerts generated`,
    });
  } catch (error) {
    logger.error('Error checking alerts', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to check alerts',
    });
  }
});

/**
 * POST /budget/alerts/:alertId/acknowledge
 * Acknowledge an alert
 */
router.post('/alerts/:alertId/acknowledge', async (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;
    const userId = (req as any).user?.id || req.body.acknowledgedBy;
    
    await budgetAnalyticsService.acknowledgeAlert(alertId, userId);
    
    res.json({
      success: true,
      message: 'Alert acknowledged',
    });
  } catch (error) {
    logger.error('Error acknowledging alert', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to acknowledge alert',
    });
  }
});

// ============================================================================
// INVOICES
// ============================================================================

/**
 * POST /budget/invoices
 * Create a new invoice
 */
router.post('/invoices', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    
    const invoice = await invoiceService.create({
      ...req.body,
      createdBy: userId,
    });
    
    res.status(201).json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    logger.error('Error creating invoice', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to create invoice',
    });
  }
});

/**
 * GET /budget/invoices
 * Get invoices with filters
 */
router.get('/invoices', async (req: Request, res: Response) => {
  try {
    const filters = {
      projectId: req.query.projectId as string,
      organizationId: req.query.organizationId as string,
      vendorId: req.query.vendorId as string,
      status: req.query.status as InvoiceStatus | undefined,
      isOverdue: req.query.isOverdue === 'true',
      search: req.query.search as string,
    };
    
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const { invoices, total } = await invoiceService.getInvoices(filters, limit, offset);
    
    res.json({
      success: true,
      data: invoices,
      pagination: {
        total,
        limit,
        offset,
      },
    });
  } catch (error) {
    logger.error('Error getting invoices', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get invoices',
    });
  }
});

/**
 * GET /budget/invoices/:id
 * Get invoice by ID
 */
router.get('/invoices/:id', async (req: Request, res: Response) => {
  try {
    const invoice = await invoiceService.getById(req.params.id);
    
    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found',
      });
    }
    
    res.json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    logger.error('Error getting invoice', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get invoice',
    });
  }
});

/**
 * GET /budget/:projectId/invoices
 * Get invoices for a project
 */
router.get('/:projectId/invoices', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    
    const invoices = await invoiceService.getByProject(projectId);
    
    res.json({
      success: true,
      data: invoices,
    });
  } catch (error) {
    logger.error('Error getting project invoices', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get project invoices',
    });
  }
});

/**
 * GET /budget/:projectId/invoices/summary
 * Get invoice summary for a project
 */
router.get('/:projectId/invoices/summary', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    
    const summary = await invoiceService.getProjectSummary(projectId);
    
    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    logger.error('Error getting invoice summary', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get invoice summary',
    });
  }
});

/**
 * PUT /budget/invoices/:id
 * Update an invoice
 */
router.put('/invoices/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    
    const invoice = await invoiceService.update(req.params.id, {
      ...req.body,
      updatedBy: userId,
    });
    
    res.json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    logger.error('Error updating invoice', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to update invoice',
    });
  }
});

/**
 * POST /budget/invoices/:id/submit
 * Submit invoice for approval
 */
router.post('/invoices/:id/submit', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || req.body.submittedBy;
    
    const invoice = await invoiceService.submitForApproval(req.params.id, userId);
    
    res.json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    logger.error('Error submitting invoice', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to submit invoice',
    });
  }
});

/**
 * POST /budget/invoices/:id/approve
 * Approve an invoice
 */
router.post('/invoices/:id/approve', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || req.body.approvedBy;
    
    const invoice = await invoiceService.approve(req.params.id, userId);
    
    res.json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    logger.error('Error approving invoice', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to approve invoice',
    });
  }
});

/**
 * POST /budget/invoices/:id/reject
 * Reject an invoice
 */
router.post('/invoices/:id/reject', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || req.body.rejectedBy;
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Rejection reason is required',
      });
    }
    
    const invoice = await invoiceService.reject(req.params.id, userId, reason);
    
    res.json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    logger.error('Error rejecting invoice', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to reject invoice',
    });
  }
});

/**
 * POST /budget/invoices/:id/pay
 * Mark invoice as paid
 */
router.post('/invoices/:id/pay', async (req: Request, res: Response) => {
  try {
    const { paidDate, paymentReference, paymentMethod } = req.body;
    
    if (!paymentReference) {
      return res.status(400).json({
        success: false,
        error: 'Payment reference is required',
      });
    }
    
    const invoice = await invoiceService.markAsPaid(
      req.params.id,
      paidDate ? new Date(paidDate) : new Date(),
      paymentReference,
      paymentMethod
    );
    
    res.json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    logger.error('Error marking invoice as paid', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to mark invoice as paid',
    });
  }
});

/**
 * GET /budget/invoices/overdue
 * Get overdue invoices
 */
router.get('/invoices/overdue', async (req: Request, res: Response) => {
  try {
    const organizationId = req.query.organizationId as string;
    
    const invoices = await invoiceService.getOverdueInvoices(organizationId);
    
    res.json({
      success: true,
      data: invoices,
    });
  } catch (error) {
    logger.error('Error getting overdue invoices', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get overdue invoices',
    });
  }
});

/**
 * DELETE /budget/invoices/:id
 * Delete an invoice (draft/cancelled only)
 */
router.delete('/invoices/:id', async (req: Request, res: Response) => {
  try {
    await invoiceService.delete(req.params.id);
    
    res.json({
      success: true,
      message: 'Invoice deleted',
    });
  } catch (error) {
    logger.error('Error deleting invoice', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to delete invoice',
    });
  }
});

// ============================================================================
// EXPENSES
// ============================================================================

/**
 * POST /budget/expenses
 * Create a new expense log
 */
router.post('/expenses', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || req.body.loggedBy;
    
    const expense = await expenseLogService.create({
      ...req.body,
      loggedBy: userId,
    });
    
    res.status(201).json({
      success: true,
      data: expense,
    });
  } catch (error) {
    logger.error('Error creating expense', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to create expense',
    });
  }
});

/**
 * POST /budget/expenses/bulk
 * Bulk create expenses (for offline sync)
 */
router.post('/expenses/bulk', async (req: Request, res: Response) => {
  try {
    const { expenses } = req.body;
    
    if (!Array.isArray(expenses)) {
      return res.status(400).json({
        success: false,
        error: 'Expenses array is required',
      });
    }
    
    const result = await expenseLogService.bulkCreate(expenses);
    
    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error bulk creating expenses', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to bulk create expenses',
    });
  }
});

/**
 * GET /budget/expenses
 * Get expenses with filters
 */
router.get('/expenses', async (req: Request, res: Response) => {
  try {
    const filters = {
      projectId: req.query.projectId as string,
      organizationId: req.query.organizationId as string,
      loggedBy: req.query.loggedBy as string,
      categoryId: req.query.categoryId as string,
      expenseType: req.query.expenseType as ExpenseType | undefined,
      status: req.query.status as ExpenseStatus | undefined,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      search: req.query.search as string,
    };
    
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const { expenses, total } = await expenseLogService.getExpenses(filters, limit, offset);
    
    res.json({
      success: true,
      data: expenses,
      pagination: {
        total,
        limit,
        offset,
      },
    });
  } catch (error) {
    logger.error('Error getting expenses', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get expenses',
    });
  }
});

/**
 * GET /budget/expenses/:id
 * Get expense by ID
 */
router.get('/expenses/:id', async (req: Request, res: Response) => {
  try {
    const expense = await expenseLogService.getById(req.params.id);
    
    if (!expense) {
      return res.status(404).json({
        success: false,
        error: 'Expense not found',
      });
    }
    
    res.json({
      success: true,
      data: expense,
    });
  } catch (error) {
    logger.error('Error getting expense', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get expense',
    });
  }
});

/**
 * GET /budget/:projectId/expenses
 * Get expenses for a project
 */
router.get('/:projectId/expenses', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    
    const expenses = await expenseLogService.getByProject(projectId);
    
    res.json({
      success: true,
      data: expenses,
    });
  } catch (error) {
    logger.error('Error getting project expenses', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get project expenses',
    });
  }
});

/**
 * GET /budget/:projectId/expenses/summary
 * Get expense summary for a project
 */
router.get('/:projectId/expenses/summary', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    
    const summary = await expenseLogService.getProjectSummary(projectId);
    
    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    logger.error('Error getting expense summary', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get expense summary',
    });
  }
});

/**
 * PUT /budget/expenses/:id
 * Update an expense
 */
router.put('/expenses/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    
    const expense = await expenseLogService.update(req.params.id, {
      ...req.body,
      updatedBy: userId,
    });
    
    res.json({
      success: true,
      data: expense,
    });
  } catch (error) {
    logger.error('Error updating expense', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to update expense',
    });
  }
});

/**
 * POST /budget/expenses/:id/approve
 * Approve an expense
 */
router.post('/expenses/:id/approve', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || req.body.approvedBy;
    
    const expense = await expenseLogService.approve(req.params.id, userId);
    
    res.json({
      success: true,
      data: expense,
    });
  } catch (error) {
    logger.error('Error approving expense', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to approve expense',
    });
  }
});

/**
 * POST /budget/expenses/:id/reject
 * Reject an expense
 */
router.post('/expenses/:id/reject', async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Rejection reason is required',
      });
    }
    
    const expense = await expenseLogService.reject(req.params.id, reason);
    
    res.json({
      success: true,
      data: expense,
    });
  } catch (error) {
    logger.error('Error rejecting expense', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to reject expense',
    });
  }
});

/**
 * POST /budget/expenses/bulk-approve
 * Bulk approve expenses
 */
router.post('/expenses/bulk-approve', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    const userId = (req as any).user?.id || req.body.approvedBy;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Expense IDs array is required',
      });
    }
    
    const count = await expenseLogService.bulkApprove(ids, userId);
    
    res.json({
      success: true,
      message: `${count} expenses approved`,
    });
  } catch (error) {
    logger.error('Error bulk approving expenses', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to bulk approve expenses',
    });
  }
});

/**
 * DELETE /budget/expenses/:id
 * Delete an expense (pending only)
 */
router.delete('/expenses/:id', async (req: Request, res: Response) => {
  try {
    await expenseLogService.delete(req.params.id);
    
    res.json({
      success: true,
      message: 'Expense deleted',
    });
  } catch (error) {
    logger.error('Error deleting expense', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to delete expense',
    });
  }
});

/**
 * GET /budget/expenses/nearby
 * Get expenses near a location
 */
router.get('/expenses/nearby', async (req: Request, res: Response) => {
  try {
    const latitude = parseFloat(req.query.latitude as string);
    const longitude = parseFloat(req.query.longitude as string);
    const radius = parseInt(req.query.radius as string) || 1000;
    
    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        success: false,
        error: 'Valid latitude and longitude are required',
      });
    }
    
    const expenses = await expenseLogService.getNearbyExpenses(latitude, longitude, radius);
    
    res.json({
      success: true,
      data: expenses,
    });
  } catch (error) {
    logger.error('Error getting nearby expenses', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get nearby expenses',
    });
  }
});

export default router;
