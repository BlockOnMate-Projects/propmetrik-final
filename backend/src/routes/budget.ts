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
import { registerPMParamValidation, registerProjectAccessParams, enforceFinancialsParamAccess, requirePMWrite } from '../middleware/pmAuth';
import { generateInvoicePdf, InvoicePdfData } from '../utils/invoicePdfGenerator';
import { validate } from '../middleware/validation';
import { createExpenseSchema, updateExpenseSchema, createBudgetInvoiceSchema } from '../middleware/pmProjectValidation';

const router = Router();

// Register UUID parameter validation
registerPMParamValidation(router);
// Budget routes keyed by :projectId are financial — gate by project membership
// AND can_view_financials. Membership param guard runs first (attaches
// req.projectAccess), then the financials-permission guard. Owners/PMs + org
// admins pass automatically.
registerProjectAccessParams(router, ['projectId']);
router.param('projectId', enforceFinancialsParamAccess);

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
router.post('/:projectId/rate-locks', requirePMWrite, async (req: Request, res: Response) => {
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
router.delete('/rate-locks/:lockId', requirePMWrite, async (req: Request, res: Response) => {
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
router.post('/:projectId/snapshots', requirePMWrite, async (req: Request, res: Response) => {
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
router.post('/:projectId/alerts/check', requirePMWrite, async (req: Request, res: Response) => {
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
router.post('/alerts/:alertId/acknowledge', requirePMWrite, async (req: Request, res: Response) => {
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
router.post('/invoices', requirePMWrite, validate(createBudgetInvoiceSchema), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const b = req.body;
    
    // Zod schema uses snake_case; invoiceService expects camelCase
    const invoice = await invoiceService.create({
      projectId: b.project_id,
      organizationId: b.organization_id || (req as any).user?.organizationId,
      costId: b.cost_id,
      vendorId: b.vendor_id,
      invoiceNumber: b.invoice_number,
      referenceNumber: b.reference_number,
      amount: b.amount,
      currency: b.currency,
      taxAmount: b.tax_amount,
      discountAmount: b.discount_amount,
      invoiceDate: b.issue_date,
      dueDate: b.due_date,
      receivedDate: b.received_date,
      paymentMethod: b.payment_method,
      fileUrl: b.file_url,
      fileName: b.file_name,
      lineItems: b.line_items?.map((li: any) => ({
        description: li.description,
        quantity: li.quantity,
        unit: li.unit || 'unit',
        unitPrice: li.unit_price,
        amount: li.amount,
      })),
      description: b.description,
      notes: b.notes,
      internalNotes: b.internal_notes,
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
 * GET /budget/revenue/summary
 * Get organization-level revenue summary across all projects
 * Query params: ?projectId=xxx to filter by specific project
 */
router.get('/revenue/summary', async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization not found' });
    }

    const projectId = req.query.projectId as string | undefined;
    const summary = await invoiceService.getOrgRevenueSummary(organizationId, projectId);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    logger.error('Error getting revenue summary', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get revenue summary',
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
router.put('/invoices/:id', requirePMWrite, async (req: Request, res: Response) => {
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
router.post('/invoices/:id/submit', requirePMWrite, async (req: Request, res: Response) => {
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
router.post('/invoices/:id/approve', requirePMWrite, async (req: Request, res: Response) => {
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
router.post('/invoices/:id/reject', requirePMWrite, async (req: Request, res: Response) => {
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
router.post('/invoices/:id/pay', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const { paidDate, paymentReference, paymentMethod } = req.body;
    
    if (!paymentReference) {
      return res.status(400).json({
        success: false,
        error: 'Payment reference is required',
      });
    }
    
    // Route through confirmPayment so a manual "mark paid" also writes a linked
    // ledger row (reconciliation parity with gateway-confirmed payments).
    const { invoice } = await invoiceService.confirmPayment(req.params.id, paymentReference, {
      method: paymentMethod || 'manual',
      channel: paymentMethod || 'manual',
      provider: 'manual',
      paidDate: paidDate ? new Date(paidDate) : new Date(),
    });

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
 * POST /budget/invoices/:id/send
 * Send invoice — generates Paystack payment link (with split payment if subaccount
 * configured), sends branded email to client, and updates invoice with payment ref.
 * Follows the same proven pattern as valuation invoice sending.
 *
 * Body: {
 *   clientEmail: string,
 *   clientName: string,
 *   vendorCompany?: string,
 *   vendorEmail?: string,
 *   projectName?: string,
 *   lineItems?: { description, quantity, amount }[],
 *   totalAmount?: number,
 *   currency?: string,
 *   dueDate?: string,
 *   platformFee?: number,
 * }
 */
router.post('/invoices/:id/send', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const { clientEmail, clientName, ...sendData } = req.body;

    if (!clientEmail) {
      return res.status(400).json({
        success: false,
        error: 'clientEmail is required to send an invoice',
      });
    }

    const result = await invoiceService.sendInvoice(
      req.params.id,
      clientEmail,
      clientName || 'Client',
      sendData
    );

    res.json({
      success: true,
      data: result.invoice,
      paymentLink: result.paymentLink,
      paystackReference: result.paystackReference,
    });
  } catch (error: any) {
    logger.error('Error sending invoice', { error });
    res.status(error.message?.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message || 'Failed to send invoice',
    });
  }
});

/**
 * POST /budget/invoices/render-pdf
 * Render an invoice as a downloadable PDF (PDFKit) and stream it back.
 * Accepts the live invoice payload so it works BEFORE the invoice is saved
 * (the builder lets users download while drafting). Produces the same
 * artifact that sendInvoice() attaches to the client email.
 */
router.post('/invoices/render-pdf', async (req: Request, res: Response) => {
  try {
    const b = req.body || {};
    const lineItems = Array.isArray(b.lineItems) ? b.lineItems : [];
    if (lineItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one line item is required to generate a PDF',
      });
    }

    const pdfData: InvoicePdfData = {
      invoiceNumber: b.invoiceNumber || 'DRAFT',
      issueDate: b.issueDate || b.invoiceDate || '',
      dueDate: b.dueDate || '',
      currency: b.currency || 'GHS',
      vendorCompany: b.vendorCompany || 'PROPMETRIK',
      vendorEmail: b.vendorEmail,
      clientName: b.clientName || 'Client',
      clientEmail: b.clientEmail,
      lineItems: lineItems.map((li: any) => ({
        description: li.description || 'Line item',
        qty: Number(li.qty ?? li.quantity ?? 1),
        unit: li.unit,
        unitRate: Number(li.unitRate ?? li.unit_price ?? 0),
        amount: li.amount != null ? Number(li.amount) : undefined,
      })),
      subtotal: Number(b.subtotal || 0),
      taxAmount: b.taxAmount != null ? Number(b.taxAmount) : undefined,
      discount: b.discount != null ? Number(b.discount) : undefined,
      retention: b.retention != null ? Number(b.retention) : undefined,
      platformFee: b.platformFee != null ? Number(b.platformFee) : undefined,
      totalDue: Number(b.totalDue || 0),
      projectName: b.projectName,
      notes: b.notes,
      terms: b.terms,
      paymentLink: b.paymentLink,
    };

    const pdf = await generateInvoicePdf(pdfData);
    const safeNumber = String(pdfData.invoiceNumber).replace(/[^a-zA-Z0-9_-]/g, '-');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice-${safeNumber}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  } catch (error: any) {
    logger.error('Error rendering invoice PDF', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to render invoice PDF',
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
router.delete('/invoices/:id', requirePMWrite, async (req: Request, res: Response) => {
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
router.post('/expenses', requirePMWrite, validate(createExpenseSchema), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || req.body.loggedBy;
    const orgId = (req as any).user?.organizationId || req.headers['x-organization-id'] as string;
    
    const expense = await expenseLogService.create({
      ...req.body,
      // Map snake_case body fields to camelCase for the service
      projectId: req.body.projectId || req.body.project_id,
      organizationId: req.body.organizationId || req.body.organization_id || orgId,
      categoryId: req.body.categoryId || req.body.category_id,
      costId: req.body.costId || req.body.cost_id,
      expenseType: req.body.expenseType || req.body.expense_type || 'general',
      receiptUrl: req.body.receiptUrl || req.body.receipt_url,
      expenseDate: req.body.expenseDate || req.body.expense_date,
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
router.post('/expenses/bulk', requirePMWrite, async (req: Request, res: Response) => {
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
router.put('/expenses/:id', requirePMWrite, validate(updateExpenseSchema), async (req: Request, res: Response) => {
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
router.post('/expenses/:id/approve', requirePMWrite, async (req: Request, res: Response) => {
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
router.post('/expenses/:id/reject', requirePMWrite, async (req: Request, res: Response) => {
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
router.post('/expenses/bulk-approve', requirePMWrite, async (req: Request, res: Response) => {
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
router.delete('/expenses/:id', requirePMWrite, async (req: Request, res: Response) => {
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

// ============================================================================
// PAYMENT MILESTONES
// ============================================================================

/**
 * GET /budget/:projectId/milestones
 * List payment milestones for a project
 */
router.get('/:projectId/milestones', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const orgId = (req as any).user?.organizationId;
    const { phaseId, status } = req.query;

    let sql = `
      SELECT * FROM payment_milestones
      WHERE project_id = $1 AND organization_id = $2
    `;
    const params: any[] = [projectId, orgId];
    let idx = 3;

    if (phaseId) {
      sql += ` AND phase_id = $${idx++}`;
      params.push(phaseId);
    }
    if (status) {
      sql += ` AND status = $${idx++}`;
      params.push(status);
    }

    sql += ` ORDER BY scheduled_date ASC, created_at ASC`;

    const { pool } = await import('../database');
    const { rows } = await pool.query(sql, params);

    // Map to camelCase for the frontend PaymentMilestone interface
    const milestones = rows.map((r: any) => ({
      id: r.id,
      projectId: r.project_id,
      phaseId: r.phase_id,
      costId: r.cost_id,
      vendorId: r.vendor_id,
      name: r.name,
      description: r.description,
      percentage: r.payment_percentage ? Number(r.payment_percentage) : undefined,
      amount: Number(r.payment_amount),
      currency: r.currency || 'GHS',
      dueDate: r.scheduled_date,
      triggerCondition: r.trigger_condition,
      status: r.status || 'pending',
      completionPercentage: r.completion_percentage ? Number(r.completion_percentage) : 0,
      paidAmount: r.actual_amount ? Number(r.actual_amount) : undefined,
      paidDate: r.actual_payment_date,
      invoiceId: r.invoice_id,
      milestoneOrder: 0,
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.created_at,
    }));

    res.json(milestones);
  } catch (error) {
    logger.error('Error fetching payment milestones', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment milestones',
    });
  }
});

/**
 * POST /budget/:projectId/milestones
 * Create a payment milestone
 */
router.post('/:projectId/milestones', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const orgId = (req as any).user?.organizationId;
    const userId = (req as any).user?.id;
    const {
      phaseId, costId, vendorId, name, description,
      percentage, amount, currency, dueDate,
      triggerCondition, status,
    } = req.body;

    if (!name || !amount) {
      return res.status(400).json({ success: false, error: 'name and amount are required' });
    }

    const { pool } = await import('../database');
    const { rows } = await pool.query(`
      INSERT INTO payment_milestones
        (project_id, organization_id, phase_id, cost_id, vendor_id,
         name, description, payment_percentage, payment_amount, currency,
         scheduled_date, trigger_condition, status, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      projectId, orgId, phaseId || null, costId || null, vendorId || null,
      name, description || null,
      percentage || null, amount, currency || 'GHS',
      dueDate || new Date(), triggerCondition || null,
      status || 'scheduled', userId,
    ]);

    const r = rows[0];
    res.status(201).json({
      id: r.id,
      projectId: r.project_id,
      phaseId: r.phase_id,
      name: r.name,
      description: r.description,
      amount: Number(r.payment_amount),
      currency: r.currency,
      dueDate: r.scheduled_date,
      status: r.status,
      createdBy: r.created_by,
      createdAt: r.created_at,
    });
  } catch (error) {
    logger.error('Error creating payment milestone', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to create payment milestone',
    });
  }
});

/**
 * GET /budget/milestones/:id
 * Get a single payment milestone
 */
router.get('/milestones/:id', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    const { pool } = await import('../database');
    const { rows } = await pool.query(
      `SELECT * FROM payment_milestones WHERE id = $1 AND organization_id = $2`,
      [req.params.id, orgId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Milestone not found' });
    }

    const r = rows[0];
    res.json({
      id: r.id,
      projectId: r.project_id,
      phaseId: r.phase_id,
      name: r.name,
      description: r.description,
      amount: Number(r.payment_amount),
      currency: r.currency,
      dueDate: r.scheduled_date,
      status: r.status,
      paidAmount: r.actual_amount ? Number(r.actual_amount) : undefined,
      paidDate: r.actual_payment_date,
      createdBy: r.created_by,
      createdAt: r.created_at,
    });
  } catch (error) {
    logger.error('Error fetching milestone', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch milestone' });
  }
});

/**
 * PUT /budget/milestones/:id
 * Update a payment milestone
 */
router.put('/milestones/:id', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    const userId = (req as any).user?.id;
    const { name, description, amount, currency, dueDate, status, percentage, triggerCondition } = req.body;

    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 3;

    if (name !== undefined) { sets.push(`name = $${idx++}`); vals.push(name); }
    if (description !== undefined) { sets.push(`description = $${idx++}`); vals.push(description); }
    if (amount !== undefined) { sets.push(`payment_amount = $${idx++}`); vals.push(amount); }
    if (currency !== undefined) { sets.push(`currency = $${idx++}`); vals.push(currency); }
    if (dueDate !== undefined) { sets.push(`scheduled_date = $${idx++}`); vals.push(dueDate); }
    if (status !== undefined) { sets.push(`status = $${idx++}`); vals.push(status); }
    if (percentage !== undefined) { sets.push(`payment_percentage = $${idx++}`); vals.push(percentage); }
    if (triggerCondition !== undefined) { sets.push(`trigger_condition = $${idx++}`); vals.push(triggerCondition); }
    sets.push(`updated_by = $${idx++}`); vals.push(userId);

    if (sets.length <= 1) {
      return res.status(400).json({ success: false, error: 'Nothing to update' });
    }

    const { pool } = await import('../database');
    const { rows } = await pool.query(
      `UPDATE payment_milestones SET ${sets.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, orgId, ...vals]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Milestone not found' });
    }

    const r = rows[0];
    res.json({
      id: r.id,
      projectId: r.project_id,
      name: r.name,
      amount: Number(r.payment_amount),
      currency: r.currency,
      dueDate: r.scheduled_date,
      status: r.status,
    });
  } catch (error) {
    logger.error('Error updating milestone', { error });
    res.status(500).json({ success: false, error: 'Failed to update milestone' });
  }
});

/**
 * POST /budget/milestones/:id/pay
 * Mark a payment milestone as paid
 */
router.post('/milestones/:id/pay', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    const userId = (req as any).user?.id;
    const { paidDate } = req.body;

    const { pool } = await import('../database');
    const { rows } = await pool.query(
      `UPDATE payment_milestones
       SET status = 'paid', actual_payment_date = $3, completion_percentage = 100,
           completion_verified_by = $4, completion_verified_at = NOW(), updated_by = $4
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [req.params.id, orgId, paidDate || new Date(), userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Milestone not found' });
    }

    const r = rows[0];
    res.json({
      id: r.id,
      projectId: r.project_id,
      name: r.name,
      status: r.status,
      paidDate: r.actual_payment_date,
    });
  } catch (error) {
    logger.error('Error marking milestone as paid', { error });
    res.status(500).json({ success: false, error: 'Failed to mark milestone as paid' });
  }
});

/**
 * POST /budget/milestones/:id/cancel
 * Cancel a payment milestone
 */
router.post('/milestones/:id/cancel', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    const userId = (req as any).user?.id;

    const { pool } = await import('../database');
    const { rows } = await pool.query(
      `UPDATE payment_milestones SET status = 'cancelled', updated_by = $3
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, orgId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Milestone not found' });
    }

    res.json({ id: rows[0].id, status: 'cancelled' });
  } catch (error) {
    logger.error('Error cancelling milestone', { error });
    res.status(500).json({ success: false, error: 'Failed to cancel milestone' });
  }
});

/**
 * POST /budget/milestones/:milestoneId/invoices/:invoiceId
 * Link an invoice to a milestone
 */
router.post('/milestones/:milestoneId/invoices/:invoiceId', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    const { milestoneId, invoiceId } = req.params;

    const { pool } = await import('../database');
    await pool.query(
      `UPDATE payment_milestones SET invoice_id = $3
       WHERE id = $1 AND organization_id = $2`,
      [milestoneId, orgId, invoiceId]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Error linking invoice to milestone', { error });
    res.status(500).json({ success: false, error: 'Failed to link invoice' });
  }
});

/**
 * DELETE /budget/milestones/:milestoneId/invoices/:invoiceId
 * Unlink an invoice from a milestone
 */
router.delete('/milestones/:milestoneId/invoices/:invoiceId', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    const { milestoneId } = req.params;

    const { pool } = await import('../database');
    await pool.query(
      `UPDATE payment_milestones SET invoice_id = NULL
       WHERE id = $1 AND organization_id = $2`,
      [milestoneId, orgId]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Error unlinking invoice from milestone', { error });
    res.status(500).json({ success: false, error: 'Failed to unlink invoice' });
  }
});

export default router;
