/**
 * Invoice Service
 * Phase 4 Sprint 7 - Enhanced Budget Module
 * 
 * Handles:
 * - Invoice CRUD with approval workflow
 * - Exchange rate capture at invoice time
 * - Payment tracking and status management
 * - Due date monitoring
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { fxFeedService } from '../data-hub/scrapers/fxFeedService';
import { v4 as uuidv4 } from 'uuid';
import { feeEngine } from '../../../shared-services/payments/feeEngine';
import { notificationService } from '../../../shared-services/notifications/unified';
import { notify, resolveOrgStaff } from '../../../shared-services/notifications/in-mail';
import { generateInvoicePdf } from '../../utils/invoicePdfGenerator';

// ============================================================================
// TYPES
// ============================================================================

export type InvoiceStatus = 
  | 'draft'
  | 'pending'
  | 'sent'
  | 'viewed'
  | 'under_review'
  | 'approved'
  | 'partially_paid'
  | 'paid'
  | 'settled'
  | 'overdue'
  | 'disputed'
  | 'rejected'
  | 'cancelled'
  | 'void';

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  taxRate?: number;
  taxAmount?: number;
}

export interface ProjectInvoice {
  id: string;
  projectId: string;
  costId: string | null;
  vendorId: string | null;
  organizationId: string;
  
  invoiceNumber: string;
  referenceNumber: string | null;
  
  amount: number;
  currency: string;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  
  exchangeRateAtInvoice: number | null;
  exchangeRateSource: string | null;
  exchangeRateDate: Date | null;
  amountInGHS: number | null;
  
  status: InvoiceStatus;
  
  invoiceDate: Date;
  dueDate: Date | null;
  receivedDate: Date | null;
  paidDate: Date | null;
  
  paymentMethod: string | null;
  paymentReference: string | null;
  paymentAccount: string | null;
  
  fileUrl: string | null;
  fileName: string | null;
  
  lineItems: InvoiceLineItem[];
  
  description: string | null;
  notes: string | null;
  internalNotes: string | null;
  
  submittedBy: string | null;
  submittedAt: Date | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  rejectedBy: string | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;

  // Payment fields (migration 205)
  paystackReference: string | null;
  paystackAccessCode: string | null;
  paymentLink: string | null;
  sentAt: Date | null;
  clientName: string | null;
  clientEmail: string | null;
  clientCompany: string | null;
  vendorName: string | null;
  vendorEmail: string | null;
  vendorCompany: string | null;
  platformFee: number;
  totalDue: number | null;
}

export interface CreateInvoiceInput {
  projectId: string;
  organizationId: string;
  costId?: string;
  vendorId?: string;
  
  invoiceNumber: string;
  referenceNumber?: string;
  
  amount: number;
  currency?: string;
  taxAmount?: number;
  discountAmount?: number;
  
  invoiceDate: Date;
  dueDate?: Date;
  receivedDate?: Date;
  
  paymentMethod?: string;
  
  fileUrl?: string;
  fileName?: string;
  
  lineItems?: InvoiceLineItem[];
  
  description?: string;
  notes?: string;
  internalNotes?: string;
  
  createdBy?: string;
}

export interface UpdateInvoiceInput {
  invoiceNumber?: string;
  referenceNumber?: string;
  amount?: number;
  currency?: string;
  taxAmount?: number;
  discountAmount?: number;
  invoiceDate?: Date;
  dueDate?: Date;
  receivedDate?: Date;
  paymentMethod?: string;
  fileUrl?: string;
  fileName?: string;
  lineItems?: InvoiceLineItem[];
  description?: string;
  notes?: string;
  internalNotes?: string;
  updatedBy?: string;
}

export interface InvoiceFilters {
  projectId?: string;
  organizationId?: string;
  vendorId?: string;
  status?: InvoiceStatus | InvoiceStatus[];
  dueBefore?: Date;
  dueAfter?: Date;
  isOverdue?: boolean;
  search?: string;
}

export interface InvoiceSummary {
  projectId: string;
  totalInvoiced: number;
  totalPaid: number;
  totalPending: number;
  totalOverdue: number;
  overdueCount: number;
  averageDaysToPay: number;
}

// ============================================================================
// INVOICE SERVICE
// ============================================================================

class InvoiceService {
  
  /**
   * Create a new invoice
   */
  async create(input: CreateInvoiceInput): Promise<ProjectInvoice> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const currency = input.currency || 'GHS';
      const taxAmount = input.taxAmount || 0;
      const discountAmount = input.discountAmount || 0;
      const totalAmount = input.amount + taxAmount - discountAmount;
      
      // Get exchange rate if foreign currency
      let exchangeRate: number | null = null;
      let exchangeRateSource: string | null = null;
      let amountInGHS: number | null = null;
      
      if (currency !== 'GHS') {
        try {
          const rateData = await fxFeedService.getCurrentRate(currency);
          exchangeRate = rateData.rate;
          exchangeRateSource = rateData.source;
          amountInGHS = totalAmount * rateData.rate;
        } catch (error) {
          logger.warn('Failed to get exchange rate for invoice', { currency, error });
        }
      }
      
      const id = uuidv4();
      const result = await client.query(
        `INSERT INTO project_invoices (
          id, project_id, organization_id, cost_id, vendor_id,
          invoice_number, reference_number,
          amount, currency, tax_amount, discount_amount, total_amount,
          exchange_rate_at_invoice, exchange_rate_source, exchange_rate_date, amount_in_ghs,
          status, invoice_date, due_date, received_date,
          payment_method, file_url, file_name, line_items,
          description, notes, internal_notes,
          created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_DATE, $15,
          'pending', $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
        )
        RETURNING *`,
        [
          id,
          input.projectId,
          input.organizationId,
          input.costId || null,
          input.vendorId || null,
          input.invoiceNumber,
          input.referenceNumber || null,
          input.amount,
          currency,
          taxAmount,
          discountAmount,
          totalAmount,
          exchangeRate,
          exchangeRateSource,
          amountInGHS,
          input.invoiceDate,
          input.dueDate || null,
          input.receivedDate || null,
          input.paymentMethod || null,
          input.fileUrl || null,
          input.fileName || null,
          JSON.stringify(input.lineItems || []),
          input.description || null,
          input.notes || null,
          input.internalNotes || null,
          input.createdBy || null,
        ]
      );
      
      await client.query('COMMIT');
      
      logger.info('Invoice created', { invoiceId: id, projectId: input.projectId });
      return this.mapInvoice(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating invoice', { input, error });
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get invoice by ID
   */
  async getById(id: string): Promise<ProjectInvoice | null> {
    try {
      const result = await pool.query(
        'SELECT * FROM project_invoices WHERE id = $1',
        [id]
      );
      return result.rows[0] ? this.mapInvoice(result.rows[0]) : null;
    } catch (error) {
      logger.error('Error getting invoice', { id, error });
      throw error;
    }
  }
  
  /**
   * Get invoices with filters
   */
  async getInvoices(filters: InvoiceFilters, limit = 50, offset = 0): Promise<{ invoices: ProjectInvoice[]; total: number }> {
    try {
      let query = 'SELECT * FROM project_invoices WHERE 1=1';
      let countQuery = 'SELECT COUNT(*) FROM project_invoices WHERE 1=1';
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
      
      if (filters.vendorId) {
        query += ` AND vendor_id = $${paramIndex}`;
        countQuery += ` AND vendor_id = $${paramIndex}`;
        params.push(filters.vendorId);
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
      
      if (filters.isOverdue) {
        query += ` AND due_date < CURRENT_DATE AND status NOT IN ('paid', 'cancelled')`;
        countQuery += ` AND due_date < CURRENT_DATE AND status NOT IN ('paid', 'cancelled')`;
      }
      
      if (filters.dueBefore) {
        query += ` AND due_date <= $${paramIndex}`;
        countQuery += ` AND due_date <= $${paramIndex}`;
        params.push(filters.dueBefore);
        paramIndex++;
      }
      
      if (filters.dueAfter) {
        query += ` AND due_date >= $${paramIndex}`;
        countQuery += ` AND due_date >= $${paramIndex}`;
        params.push(filters.dueAfter);
        paramIndex++;
      }
      
      if (filters.search) {
        query += ` AND (invoice_number ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
        countQuery += ` AND (invoice_number ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
        params.push(`%${filters.search}%`);
        paramIndex++;
      }
      
      // Count query
      const countResult = await pool.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count, 10);
      
      // Main query with pagination
      query += ` ORDER BY invoice_date DESC, created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);
      
      const result = await pool.query(query, params);
      
      return {
        invoices: result.rows.map(this.mapInvoice),
        total,
      };
    } catch (error) {
      logger.error('Error getting invoices', { filters, error });
      throw error;
    }
  }
  
  /**
   * Get invoices by project
   */
  async getByProject(projectId: string): Promise<ProjectInvoice[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM project_invoices 
         WHERE project_id = $1 
         ORDER BY invoice_date DESC, created_at DESC`,
        [projectId]
      );
      return result.rows.map(this.mapInvoice);
    } catch (error) {
      logger.error('Error getting project invoices', { projectId, error });
      throw error;
    }
  }
  
  /**
   * Update invoice
   */
  async update(id: string, input: UpdateInvoiceInput): Promise<ProjectInvoice> {
    try {
      const updates: string[] = [];
      const params: any[] = [id];
      let paramIndex = 2;
      
      const fields: (keyof UpdateInvoiceInput)[] = [
        'invoiceNumber', 'referenceNumber', 'amount', 'currency',
        'taxAmount', 'discountAmount', 'invoiceDate', 'dueDate',
        'receivedDate', 'paymentMethod', 'fileUrl', 'fileName',
        'description', 'notes', 'internalNotes',
      ];
      
      const fieldMap: Record<string, string> = {
        invoiceNumber: 'invoice_number',
        referenceNumber: 'reference_number',
        taxAmount: 'tax_amount',
        discountAmount: 'discount_amount',
        invoiceDate: 'invoice_date',
        dueDate: 'due_date',
        receivedDate: 'received_date',
        paymentMethod: 'payment_method',
        fileUrl: 'file_url',
        fileName: 'file_name',
        internalNotes: 'internal_notes',
        updatedBy: 'updated_by',
      };
      
      for (const field of fields) {
        if (input[field] !== undefined) {
          const dbField = fieldMap[field] || field;
          updates.push(`${dbField} = $${paramIndex}`);
          params.push(input[field]);
          paramIndex++;
        }
      }
      
      if (input.lineItems !== undefined) {
        updates.push(`line_items = $${paramIndex}`);
        params.push(JSON.stringify(input.lineItems));
        paramIndex++;
      }
      
      if (input.updatedBy) {
        updates.push(`updated_by = $${paramIndex}`);
        params.push(input.updatedBy);
        paramIndex++;
      }
      
      // Recalculate total if amount components changed
      if (input.amount !== undefined || input.taxAmount !== undefined || input.discountAmount !== undefined) {
        const current = await this.getById(id);
        if (current) {
          const amount = input.amount ?? current.amount;
          const tax = input.taxAmount ?? current.taxAmount;
          const discount = input.discountAmount ?? current.discountAmount;
          updates.push(`total_amount = $${paramIndex}`);
          params.push(amount + tax - discount);
          paramIndex++;
        }
      }
      
      updates.push('updated_at = NOW()');
      
      const result = await pool.query(
        `UPDATE project_invoices SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
        params
      );
      
      if (!result.rows[0]) {
        throw new Error(`Invoice not found: ${id}`);
      }
      
      logger.info('Invoice updated', { invoiceId: id });
      return this.mapInvoice(result.rows[0]);
    } catch (error) {
      logger.error('Error updating invoice', { id, input, error });
      throw error;
    }
  }
  
  /**
   * Submit invoice for approval
   */
  async submitForApproval(id: string, submittedBy: string): Promise<ProjectInvoice> {
    try {
      const result = await pool.query(
        `UPDATE project_invoices 
         SET status = 'under_review', 
             submitted_by = $2, 
             submitted_at = NOW(),
             updated_at = NOW()
         WHERE id = $1 AND status IN ('draft', 'pending')
         RETURNING *`,
        [id, submittedBy]
      );
      
      if (!result.rows[0]) {
        throw new Error(`Invoice not found or cannot be submitted: ${id}`);
      }
      
      logger.info('Invoice submitted for approval', { invoiceId: id, submittedBy });
      return this.mapInvoice(result.rows[0]);
    } catch (error) {
      logger.error('Error submitting invoice', { id, error });
      throw error;
    }
  }
  
  /**
   * Approve invoice
   */
  async approve(id: string, approvedBy: string): Promise<ProjectInvoice> {
    try {
      const result = await pool.query(
        `UPDATE project_invoices 
         SET status = 'approved', 
             approved_by = $2, 
             approved_at = NOW(),
             updated_at = NOW()
         WHERE id = $1 AND status IN ('pending', 'under_review')
         RETURNING *`,
        [id, approvedBy]
      );
      
      if (!result.rows[0]) {
        throw new Error(`Invoice not found or cannot be approved: ${id}`);
      }
      
      logger.info('Invoice approved', { invoiceId: id, approvedBy });
      return this.mapInvoice(result.rows[0]);
    } catch (error) {
      logger.error('Error approving invoice', { id, error });
      throw error;
    }
  }
  
  /**
   * Reject invoice
   */
  async reject(id: string, rejectedBy: string, reason: string): Promise<ProjectInvoice> {
    try {
      const result = await pool.query(
        `UPDATE project_invoices 
         SET status = 'rejected', 
             rejected_by = $2, 
             rejected_at = NOW(),
             rejection_reason = $3,
             updated_at = NOW()
         WHERE id = $1 AND status IN ('pending', 'under_review')
         RETURNING *`,
        [id, rejectedBy, reason]
      );
      
      if (!result.rows[0]) {
        throw new Error(`Invoice not found or cannot be rejected: ${id}`);
      }
      
      logger.info('Invoice rejected', { invoiceId: id, rejectedBy, reason });
      return this.mapInvoice(result.rows[0]);
    } catch (error) {
      logger.error('Error rejecting invoice', { id, error });
      throw error;
    }
  }
  
  /**
   * Mark invoice as paid
   */
  async markAsPaid(
    id: string, 
    paidDate: Date, 
    paymentReference: string, 
    paymentMethod?: string
  ): Promise<ProjectInvoice> {
    try {
      const result = await pool.query(
        `UPDATE project_invoices 
         SET status = 'paid', 
             paid_date = $2,
             payment_reference = $3,
             payment_method = COALESCE($4, payment_method),
             updated_at = NOW()
         WHERE id = $1 AND status IN ('sent', 'pending', 'viewed', 'approved', 'partially_paid')
         RETURNING *`,
        [id, paidDate, paymentReference, paymentMethod]
      );
      
      if (!result.rows[0]) {
        throw new Error(`Invoice not found or cannot be marked as paid: ${id}`);
      }
      
      logger.info('Invoice marked as paid', { invoiceId: id, paymentReference });

      const invoice = this.mapInvoice(result.rows[0]);
      await this.dispatchPaidNotification(invoice);
      return invoice;
    } catch (error) {
      logger.error('Error marking invoice as paid', { id, error });
      throw error;
    }
  }

  /**
   * Notify org staff that a project invoice has been paid. Best-effort.
   */
  private async dispatchPaidNotification(invoice: ProjectInvoice): Promise<void> {
    try {
      if (!invoice.organizationId) return;
      const staff = await resolveOrgStaff(invoice.organizationId);
      if (!staff.length) return;
      await notify({
        recipients: staff,
        category: 'finance',
        type: 'project_invoice.paid',
        title: 'Project invoice paid',
        body: `Invoice ${invoice.invoiceNumber} (GHS ${invoice.totalAmount}) has been marked paid.`,
        priority: 'normal',
        organizationId: invoice.organizationId,
        sourceType: 'project_invoice',
        sourceId: invoice.id,
        sourceUrl: invoice.projectId ? `/dashboard/projects/${invoice.projectId}/budget-cost` : '/dashboard/projects',
        channels: { inApp: true },
      });
    } catch (notifyError: any) {
      logger.warn('Failed to notify staff of paid invoice', { invoiceId: invoice.id, error: notifyError.message });
    }
  }

  /**
   * Notify staff of a paid invoice by id — used by payment paths that update the
   * invoice row directly (e.g. crypto settlement) instead of calling markAsPaid.
   */
  async notifyPaidById(invoiceId: string): Promise<void> {
    const invoice = await this.getById(invoiceId);
    if (invoice) await this.dispatchPaidNotification(invoice);
  }

  /**
   * Send invoice — generates Paystack payment link (with split payment if subaccount configured),
   * sends email notification to client, and updates invoice with payment reference.
   * Follows the same pattern as valuationInvoiceService.sendInvoice().
   */
  async sendInvoice(
    id: string,
    clientEmail: string,
    clientName: string,
    sendData?: {
      vendorCompany?: string;
      vendorEmail?: string;
      projectName?: string;
      lineItems?: any[];
      subtotal?: number;
      totalAmount?: number;
      invoiceTotal?: number;
      totalTax?: number;
      discount?: number;
      retention?: number;
      currency?: string;
      dueDate?: string;
      platformFee?: number;
      customMessage?: string;
    }
  ): Promise<{ invoice: ProjectInvoice; paymentLink: string | null; paystackReference: string | null }> {
    const invoice = await this.getById(id);
    if (!invoice) throw new Error('Invoice not found');

    // Allow sending from pending or draft
    if (!['pending', 'draft'].includes(invoice.status)) {
      throw new Error(`Invoice cannot be sent from status "${invoice.status}". Must be pending or draft.`);
    }

    const reference = `PM-INV-${Date.now()}-${uuidv4().slice(0, 8)}`;
    let paymentLink: string | null = null;
    let accessCode: string | null = null;
    let platformFeePesewas = 0;
    let platformFeeAmount = 0;

    // ── Paystack split-payment ──────────────────────────────────
    // Paystack Ghana only supports GHS. For non-GHS invoices, convert
    // the amount to GHS using live FX rates so the payment link works.
    try {
      const { paystackService } = await import('../property-management/payment/paystackService').catch(() => ({ paystackService: null }));

      if (paystackService && clientEmail) {
        // ── FX conversion: always charge in GHS on Paystack ──
        const invoiceCcy = (invoice.currency || 'GHS').toUpperCase();
        let paystackAmountGHS = invoice.totalAmount;
        let fxRate = 1;
        let fxSource = 'N/A';

        if (invoiceCcy !== 'GHS') {
          try {
            const fx = await fxFeedService.convertToGHS(invoice.totalAmount, invoiceCcy);
            paystackAmountGHS = fx.converted_amount;
            fxRate = fx.rate;
            fxSource = fx.source;
            logger.info('PM invoice: FX conversion for Paystack', {
              from: invoiceCcy, to: 'GHS',
              originalAmount: invoice.totalAmount,
              convertedAmount: paystackAmountGHS,
              rate: fxRate, source: fxSource,
            });
          } catch (fxErr: any) {
            logger.warn('PM invoice: FX conversion failed, using raw amount', { error: fxErr.message });
          }
        }

        const paystackPesewas = Math.round(paystackAmountGHS * 100);

        const payoutConfig = await paystackService.getPaymentAccountConfig(invoice.organizationId, 'organization', 'project_management');

        if (payoutConfig?.subaccountCode) {
          logger.info('PM invoice: Using subaccount split payment', { orgId: invoice.organizationId, subaccount: payoutConfig.subaccountCode });
          const feeCalc = await feeEngine.calculate('project', paystackAmountGHS, invoice.organizationId, 'organization');
          platformFeePesewas = feeCalc.serviceFeeSubunits;
          platformFeeAmount = feeCalc.serviceFee;

          const frontendUrl = process.env.FRONTEND_URL || 'https://propmetrik.com';
          const response = await paystackService.initializeWithSubaccount(
            {
              email: clientEmail,
              amount: paystackPesewas,
              currency: 'GHS',
              reference,
              channels: ['mobile_money', 'card', 'bank_transfer', 'bank', 'ussd', 'qr'],
              callback_url: `${frontendUrl}/payment/invoice?id=${invoice.id}&status=success`,
              metadata: {
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                clientName,
                type: 'pm_invoice',
                splitPayment: true,
                originalCurrency: invoiceCcy,
                originalAmount: invoice.totalAmount,
                fxRate,
                fxSource,
              },
            },
            payoutConfig.subaccountCode,
            platformFeePesewas
          );

          if (response.status) {
            paymentLink = response.data.authorization_url;
            accessCode = response.data.access_code;
          }

          logger.info('PM invoice sent with split payment', {
            id, reference,
            subaccount: payoutConfig.subaccountCode,
            totalGHS: paystackAmountGHS,
            platformFee: platformFeeAmount,
            originalCurrency: invoiceCcy,
          });
        } else {
          // No subaccount — basic Paystack initialization
          logger.info('PM invoice: No subaccount found, using basic Paystack', { orgId: invoice.organizationId });
          const paystackKey = config.paystack.secretKey;
          if (paystackKey) {
            const axios = (await import('axios')).default;

            const response = await axios.post(
              'https://api.paystack.co/transaction/initialize',
              {
                email: clientEmail,
                amount: paystackPesewas,
                reference,
                currency: 'GHS',
                channels: ['mobile_money', 'card', 'bank_transfer', 'bank', 'ussd', 'qr'],
                send_notification: false,
                callback_url: `${config.app.frontendUrl}/payment/invoice?id=${invoice.id}&status=success`,
                metadata: {
                  invoiceId: invoice.id,
                  invoiceNumber: invoice.invoiceNumber,
                  clientName,
                  type: 'pm_invoice',
                  originalCurrency: invoiceCcy,
                  originalAmount: invoice.totalAmount,
                  fxRate,
                  fxSource,
                },
              },
              {
                headers: {
                  Authorization: `Bearer ${paystackKey}`,
                  'Content-Type': 'application/json',
                },
              }
            );

            logger.info('PM invoice: Paystack basic init response', {
              status: response.data.status,
              hasLink: !!response.data?.data?.authorization_url,
              amountGHS: paystackAmountGHS,
            });

            if (response.data.status) {
              paymentLink = response.data.data.authorization_url;
              accessCode = response.data.data.access_code;
            }
          } else {
            logger.warn('PM invoice: Paystack not configured, cannot generate payment link (FINANCE_MODE=' + config.app.financeMode + ')');
          }
        }
      }
    } catch (error: any) {
      logger.warn('Paystack initialization failed, invoice still marked as sent', {
        error: error.message,
        response: error.response?.data,
        invoiceId: id,
        currency: invoice.currency,
        amount: invoice.totalAmount,
      });
    }

    // ── Update invoice with payment references ──────────────────
    const result = await pool.query(
      `UPDATE project_invoices SET
        status = 'sent',
        paystack_reference = $2,
        paystack_access_code = $3,
        payment_link = $4,
        platform_fee = $5,
        client_name = COALESCE($6, client_name),
        client_email = COALESCE($7, client_email),
        total_due = COALESCE($8, total_due),
        vendor_company = COALESCE($9, vendor_company),
        sent_at = NOW(),
        updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, reference, accessCode, paymentLink, platformFeeAmount,
       clientName || null, clientEmail || null,
       sendData?.totalAmount || null, sendData?.vendorCompany || null]
    );

    const sentInvoice = this.mapInvoice(result.rows[0]);

    // ── Send email notification ─────────────────────────────────
    if (clientEmail) {
      try {
        let organizationName = sendData?.vendorCompany || 'PROPMETRIK';
        try {
          const orgResult = await pool.query(
            `SELECT name FROM organizations WHERE id = $1`,
            [sentInvoice.organizationId]
          );
          if (orgResult.rows[0]?.name) organizationName = orgResult.rows[0].name;
        } catch { /* fallback to default */ }

        const dueDate = sentInvoice.dueDate
          ? new Date(sentInvoice.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
          : 'Upon receipt';

        const ccy = sendData?.currency || sentInvoice.currency || 'GHS';
        const fmtAmt = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });

        // Use sendData.totalAmount (which is totalDue = invoiceTotal + platformFee) for display
        const displayTotal = sendData?.totalAmount || sentInvoice.totalAmount;
        const displaySubtotal = sendData?.invoiceTotal || sendData?.subtotal || sentInvoice.totalAmount;
        const displayPlatformFee = sendData?.platformFee || platformFeeAmount || 0;

        // Always link to the payment page — it handles inline Paystack checkout
        // even when server-side Paystack init failed (e.g. amount over test limits)
        const paymentPageUrl = `${process.env.FRONTEND_URL || 'https://propmetrik.com'}/payment/invoice?id=${sentInvoice.id}`;
        const paymentSection = `
            <div style="text-align: center; margin: 32px 0;">
              <a href="${paymentPageUrl}"
                 style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #eab308 100%); color: #000; padding: 16px 40px; text-decoration: none; font-weight: 700; font-size: 15px; border-radius: 8px; letter-spacing: 0.5px;">
                  VIEW & PAY INVOICE — ${ccy} ${fmtAmt(displaySubtotal)}
              </a>
              <p style="margin-top: 12px; font-size: 12px; color: #94a3b8;">Pay securely via Mobile Money, Card, or Crypto</p>
            </div>`;

        // Build line items table rows
        const items = sendData?.lineItems || sentInvoice.lineItems || [];
        const lineItemsHtml = items.map((li: any) => {
          const qty = li.quantity || li.qty || 1;
          const rate = li.unitRate || li.unit_price || li.unitPrice || 0;
          const amt = li.amount || (qty * rate);
          return `<tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155;">${li.description}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; text-align: center;">${qty}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; text-align: right;">${ccy} ${fmtAmt(amt)}</td>
          </tr>`;
        }).join('');

        // Platform fee row (if applicable)
        const platformFeeRow = displayPlatformFee > 0
          ? `<tr>
              <td colspan="2" style="padding: 8px 12px; font-size: 13px; color: #64748b;">PROPMETRIK Fee (0.25%)</td>
              <td style="padding: 8px 12px; text-align: right; font-size: 13px; color: #64748b;">${ccy} ${fmtAmt(displayPlatformFee)}</td>
            </tr>`
          : '';

        // ── Generate Invoice PDF ──────────────────────────────────
        let invoicePdfBuffer: Buffer | null = null;
        try {
          const pdfLineItems = items.map((li: any) => ({
            description: li.description || '—',
            qty: li.quantity || li.qty || 1,
            unit: li.unit || '—',
            unitRate: li.unitRate || li.unit_price || li.unitPrice || 0,
            amount: li.amount || ((li.quantity || li.qty || 1) * (li.unitRate || li.unit_price || li.unitPrice || 0)),
          }));

          invoicePdfBuffer = await generateInvoicePdf({
            invoiceNumber: sentInvoice.invoiceNumber,
            issueDate: sentInvoice.invoiceDate?.toString() || new Date().toISOString(),
            dueDate: sentInvoice.dueDate?.toString() || '',
            currency: ccy,
            vendorCompany: organizationName,
            vendorEmail: sendData?.vendorEmail,
            clientName,
            clientEmail,
            lineItems: pdfLineItems,
            subtotal: displaySubtotal,
            taxAmount: sendData?.totalTax || sentInvoice.taxAmount || 0,
            discount: sendData?.discount || sentInvoice.discountAmount || 0,
            retention: sendData?.retention || 0,
            platformFee: displayPlatformFee,
            totalDue: displayTotal,
            projectName: sendData?.projectName,
            notes: sentInvoice.notes || undefined,
            paymentLink: paymentLink || undefined,
          });
          logger.info('Invoice PDF generated', { invoiceId: id, size: invoicePdfBuffer.length });
        } catch (pdfErr: any) {
          logger.warn('Failed to generate invoice PDF, sending email without attachment', { invoiceId: id, error: pdfErr.message });
        }

        await notificationService.sendEmail({
          to: clientEmail,
          subject: `Invoice ${sentInvoice.invoiceNumber} from ${organizationName}${sendData?.projectName ? ` — ${sendData.projectName}` : ''}`,
          html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1e293b;">
              <div style="background: #09090b; padding: 28px 32px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="margin: 0; font-size: 20px; color: #fbbf24; letter-spacing: 3px; font-weight: 800;">PROPMETRIK</h1>
                <p style="margin: 4px 0 0; font-size: 12px; color: #94a3b8; letter-spacing: 1px;">PROJECT MANAGEMENT</p>
              </div>
              <div style="background: #ffffff; padding: 32px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="margin: 0 0 8px; font-size: 15px; color: #0f172a;">Dear <strong>${clientName}</strong>,</p>
                ${sendData?.customMessage
                  ? `<p style="margin: 0 0 20px; font-size: 14px; color: #334155; line-height: 1.6; white-space: pre-line;">${sendData.customMessage}</p>`
                  : `<p style="margin: 0 0 20px; font-size: 14px; color: #334155; line-height: 1.6;">Please find below the details for invoice <strong>${sentInvoice.invoiceNumber}</strong>${sendData?.projectName ? ` for project <strong>${sendData.projectName}</strong>` : ''}. Payment is due by <strong>${dueDate}</strong>.</p>`
                }
                <h2 style="margin: 0 0 8px; font-size: 22px; color: #0f172a;">Invoice ${sentInvoice.invoiceNumber}</h2>
                <p style="margin: 0 0 24px; font-size: 14px; color: #64748b;">
                  From: <strong>${organizationName}</strong>${sendData?.projectName ? ` &bull; Project: <strong>${sendData.projectName}</strong>` : ''} &bull;
                  Due: <strong>${dueDate}</strong>
                </p>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                  <thead>
                    <tr style="background: #f8fafc;">
                      <th style="padding: 10px 12px; text-align: left; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Description</th>
                      <th style="padding: 10px 12px; text-align: center; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Qty</th>
                      <th style="padding: 10px 12px; text-align: right; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Amount</th>
                    </tr>
                  </thead>
                  <tbody>${lineItemsHtml}</tbody>
                  <tfoot>
                    <tr style="background: #f8fafc;">
                      <td colspan="2" style="padding: 12px; font-weight: 700; font-size: 14px; color: #0f172a;">TOTAL DUE</td>
                      <td style="padding: 12px; text-align: right; font-weight: 700; font-size: 14px; color: #0f172a;">${ccy} ${fmtAmt(displaySubtotal)}</td>
                    </tr>
                  </tfoot>
                </table>
                ${paymentSection}
              </div>
              <div style="background: #f8fafc; padding: 20px 32px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none; text-align: center;">
                <p style="margin: 0; font-size: 12px; color: #94a3b8;">Powered by PROPMETRIK &bull; Secure payments via Paystack</p>
              </div>
            </div>
          `,
          attachments: invoicePdfBuffer ? [
            {
              filename: `${sentInvoice.invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`,
              content: invoicePdfBuffer,
              contentType: 'application/pdf',
            },
          ] : undefined,
        });

        logger.info('Invoice email sent', { invoiceId: id, to: clientEmail });
      } catch (error: any) {
        logger.warn('Failed to send invoice email', { invoiceId: id, error: error.message });
        // Non-blocking — invoice is still "sent" even if email fails
      }
    }

    return { invoice: sentInvoice, paymentLink, paystackReference: reference };
  }
  
  /**
   * Get overdue invoices
   */
  async getOverdueInvoices(organizationId?: string): Promise<ProjectInvoice[]> {
    try {
      let query = `
        SELECT * FROM project_invoices 
        WHERE due_date < CURRENT_DATE 
          AND status NOT IN ('paid', 'cancelled', 'rejected')
      `;
      const params: any[] = [];
      
      if (organizationId) {
        query += ' AND organization_id = $1';
        params.push(organizationId);
      }
      
      query += ' ORDER BY due_date ASC';
      
      const result = await pool.query(query, params);
      return result.rows.map(this.mapInvoice);
    } catch (error) {
      logger.error('Error getting overdue invoices', { error });
      throw error;
    }
  }
  
  /**
   * Update overdue status for all invoices
   */
  async updateOverdueStatus(): Promise<number> {
    try {
      const result = await pool.query(
        `UPDATE project_invoices 
         SET status = 'overdue', updated_at = NOW()
         WHERE due_date < CURRENT_DATE 
           AND status IN ('pending', 'under_review', 'approved')
         RETURNING id`
      );
      
      const count = result.rows.length;
      if (count > 0) {
        logger.info('Updated overdue invoices', { count });
      }
      return count;
    } catch (error) {
      logger.error('Error updating overdue status', { error });
      throw error;
    }
  }
  
  /**
   * Get invoice summary for project
   */
  async getProjectSummary(projectId: string): Promise<InvoiceSummary> {
    try {
      const result = await pool.query(
        `SELECT 
          COALESCE(SUM(total_amount), 0) as total_invoiced,
          COALESCE(SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END), 0) as total_paid,
          COALESCE(SUM(CASE WHEN status NOT IN ('paid', 'cancelled', 'rejected') THEN total_amount ELSE 0 END), 0) as total_pending,
          COALESCE(SUM(CASE WHEN status = 'overdue' THEN total_amount ELSE 0 END), 0) as total_overdue,
          COUNT(CASE WHEN status = 'overdue' THEN 1 END) as overdue_count,
          COALESCE(AVG(
            CASE WHEN status = 'paid' AND paid_date IS NOT NULL AND invoice_date IS NOT NULL 
            THEN (paid_date - invoice_date)
            END
          ), 0) as avg_days_to_pay
         FROM project_invoices 
         WHERE project_id = $1 AND status != 'cancelled'`,
        [projectId]
      );
      
      const row = result.rows[0];
      return {
        projectId,
        totalInvoiced: parseFloat(row.total_invoiced),
        totalPaid: parseFloat(row.total_paid),
        totalPending: parseFloat(row.total_pending),
        totalOverdue: parseFloat(row.total_overdue),
        overdueCount: parseInt(row.overdue_count, 10),
        averageDaysToPay: parseFloat(row.avg_days_to_pay),
      };
    } catch (error) {
      logger.error('Error getting project invoice summary', { projectId, error });
      throw error;
    }
  }
  
  /**
   * Get organization-level revenue summary across all projects (or one specific project)
   */
  async getOrgRevenueSummary(organizationId: string, projectId?: string): Promise<{
    currency: string;
    totalBudget: number;
    totalInvoiced: number;
    totalPaid: number;
    totalPending: number;
    totalOverdue: number;
    platformFeesCollected: number;
    overdueCount: number;
    paidCount: number;
    sentCount: number;
    totalCount: number;
    activeProjectCount: number;
    projects: Array<{ id: string; name: string; currency: string }>;
    recentTransactions: Array<{
      id: string;
      invoiceNumber: string;
      clientName: string | null;
      vendorCompany: string | null;
      projectId: string;
      projectName: string | null;
      amount: number;
      totalAmount: number;
      currency: string;
      status: string;
      paidDate: Date | null;
      sentAt: Date | null;
      createdAt: Date;
      platformFee: number;
      paymentMethod: string | null;
    }>;
    monthlyRevenue: Array<{
      month: string;
      invoiced: number;
      paid: number;
    }>;
  }> {
    try {
      // Build WHERE clause
      const invoiceWhere = projectId
        ? `organization_id = $1 AND project_id = $2`
        : `organization_id = $1`;
      const invoiceParams = projectId ? [organizationId, projectId] : [organizationId];

      // Summary aggregates
      const summaryResult = await pool.query(
        `SELECT 
          COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END), 0) as total_invoiced,
          COALESCE(SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END), 0) as total_paid,
          COALESCE(SUM(CASE WHEN status IN ('sent', 'pending', 'viewed', 'approved', 'partially_paid') THEN total_amount ELSE 0 END), 0) as total_pending,
          COALESCE(SUM(CASE WHEN status = 'overdue' THEN total_amount ELSE 0 END), 0) as total_overdue,
          COALESCE(SUM(CASE WHEN status = 'paid' THEN COALESCE(platform_fee, 0) ELSE 0 END), 0) as platform_fees_collected,
          COUNT(CASE WHEN status = 'overdue' THEN 1 END)::int as overdue_count,
          COUNT(CASE WHEN status = 'paid' THEN 1 END)::int as paid_count,
          COUNT(CASE WHEN status = 'sent' THEN 1 END)::int as sent_count,
          COUNT(*)::int as total_count,
          COUNT(DISTINCT project_id)::int as active_project_count
         FROM project_invoices 
         WHERE ${invoiceWhere}`,
        invoiceParams
      );

      // Total budget
      const budgetWhere = projectId
        ? `id = $1 AND organization_id = $2 AND status != 'cancelled'`
        : `organization_id = $1 AND status != 'cancelled'`;
      const budgetParams = projectId ? [projectId, organizationId] : [organizationId];
      const budgetResult = await pool.query(
        `SELECT COALESCE(SUM(COALESCE(total_budget, 0)), 0) as total_budget
         FROM development_projects WHERE ${budgetWhere}`,
        budgetParams
      );

      // Projects list for dropdown (include display_currency)
      const projectsResult = await pool.query(
        `SELECT id, name, COALESCE(display_currency, 'GHS') as display_currency FROM development_projects 
         WHERE organization_id = $1 AND status != 'cancelled'
         ORDER BY name ASC`,
        [organizationId]
      );

      // Determine dominant currency:
      // If filtering by project, use that project's display_currency.
      // Otherwise, use the most common invoice currency (or the first project's currency).
      let dominantCurrency = 'GHS';
      if (projectId) {
        const projRow = projectsResult.rows.find(r => r.id === projectId);
        if (projRow) dominantCurrency = projRow.display_currency || 'GHS';
      } else {
        // Most common invoice currency
        const ccyResult = await pool.query(
          `SELECT currency, COUNT(*) as cnt FROM project_invoices 
           WHERE organization_id = $1 AND status != 'cancelled' AND currency IS NOT NULL
           GROUP BY currency ORDER BY cnt DESC LIMIT 1`,
          [organizationId]
        );
        if (ccyResult.rows.length > 0) {
          dominantCurrency = ccyResult.rows[0].currency;
        } else if (projectsResult.rows.length > 0) {
          dominantCurrency = projectsResult.rows[0].display_currency || 'GHS';
        }
      }

      // Recent transactions (last 20)
      const recentResult = await pool.query(
        `SELECT pi.id, pi.invoice_number, pi.client_name, pi.vendor_company, pi.project_id,
                dp.name as project_name,
                pi.amount, pi.total_amount, pi.currency, pi.status, pi.paid_date, pi.sent_at, pi.created_at,
                COALESCE(pi.platform_fee, 0) as platform_fee, pi.payment_method
         FROM project_invoices pi
         LEFT JOIN development_projects dp ON dp.id = pi.project_id
         WHERE pi.${invoiceWhere} AND pi.status != 'draft'
         ORDER BY COALESCE(pi.paid_date, pi.sent_at, pi.created_at) DESC
         LIMIT 20`,
        invoiceParams
      );

      // Monthly revenue (last 12 months)
      const monthlyResult = await pool.query(
        `SELECT 
          TO_CHAR(DATE_TRUNC('month', COALESCE(invoice_date, created_at)), 'YYYY-MM') as month,
          COALESCE(SUM(total_amount), 0) as invoiced,
          COALESCE(SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END), 0) as paid
         FROM project_invoices
         WHERE ${invoiceWhere}
           AND status != 'cancelled'
           AND COALESCE(invoice_date, created_at) >= DATE_TRUNC('month', NOW()) - INTERVAL '11 months'
         GROUP BY DATE_TRUNC('month', COALESCE(invoice_date, created_at))
         ORDER BY month ASC`,
        invoiceParams
      );

      const summary = summaryResult.rows[0];
      return {
        currency: dominantCurrency,
        totalBudget: parseFloat(budgetResult.rows[0].total_budget),
        totalInvoiced: parseFloat(summary.total_invoiced),
        totalPaid: parseFloat(summary.total_paid),
        totalPending: parseFloat(summary.total_pending),
        totalOverdue: parseFloat(summary.total_overdue),
        platformFeesCollected: parseFloat(summary.platform_fees_collected),
        overdueCount: summary.overdue_count,
        paidCount: summary.paid_count,
        sentCount: summary.sent_count,
        totalCount: summary.total_count,
        activeProjectCount: summary.active_project_count,
        projects: projectsResult.rows.map(row => ({ id: row.id, name: row.name, currency: row.display_currency || 'GHS' })),
        recentTransactions: recentResult.rows.map(row => ({
          id: row.id,
          invoiceNumber: row.invoice_number,
          clientName: row.client_name,
          vendorCompany: row.vendor_company,
          projectId: row.project_id,
          projectName: row.project_name || null,
          amount: parseFloat(row.amount),
          totalAmount: parseFloat(row.total_amount),
          currency: row.currency,
          status: row.status,
          paidDate: row.paid_date,
          sentAt: row.sent_at,
          createdAt: row.created_at,
          platformFee: parseFloat(row.platform_fee),
          paymentMethod: row.payment_method,
        })),
        monthlyRevenue: monthlyResult.rows.map(row => ({
          month: row.month,
          invoiced: parseFloat(row.invoiced),
          paid: parseFloat(row.paid),
        })),
      };
    } catch (error) {
      logger.error('Error getting org revenue summary', { organizationId, error });
      throw error;
    }
  }

  /**
   * Delete invoice
   */
  async delete(id: string): Promise<void> {
    try {
      const result = await pool.query(
        'DELETE FROM project_invoices WHERE id = $1 AND status IN (\'draft\', \'cancelled\')',
        [id]
      );
      
      if (result.rowCount === 0) {
        throw new Error(`Invoice not found or cannot be deleted: ${id}`);
      }
      
      logger.info('Invoice deleted', { invoiceId: id });
    } catch (error) {
      logger.error('Error deleting invoice', { id, error });
      throw error;
    }
  }
  
  private mapInvoice(row: any): ProjectInvoice {
    return {
      id: row.id,
      projectId: row.project_id,
      costId: row.cost_id,
      vendorId: row.vendor_id,
      organizationId: row.organization_id,
      invoiceNumber: row.invoice_number,
      referenceNumber: row.reference_number,
      amount: parseFloat(row.amount),
      currency: row.currency,
      taxAmount: parseFloat(row.tax_amount || 0),
      discountAmount: parseFloat(row.discount_amount || 0),
      totalAmount: parseFloat(row.total_amount),
      exchangeRateAtInvoice: row.exchange_rate_at_invoice ? parseFloat(row.exchange_rate_at_invoice) : null,
      exchangeRateSource: row.exchange_rate_source,
      exchangeRateDate: row.exchange_rate_date,
      amountInGHS: row.amount_in_ghs ? parseFloat(row.amount_in_ghs) : null,
      status: row.status,
      invoiceDate: row.invoice_date,
      dueDate: row.due_date,
      receivedDate: row.received_date,
      paidDate: row.paid_date,
      paymentMethod: row.payment_method,
      paymentReference: row.payment_reference,
      paymentAccount: row.payment_account,
      fileUrl: row.file_url,
      fileName: row.file_name,
      lineItems: row.line_items || [],
      description: row.description,
      notes: row.notes,
      internalNotes: row.internal_notes,
      submittedBy: row.submitted_by,
      submittedAt: row.submitted_at,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      rejectedBy: row.rejected_by,
      rejectedAt: row.rejected_at,
      rejectionReason: row.rejection_reason,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // New columns from migration 205
      paystackReference: row.paystack_reference || null,
      paystackAccessCode: row.paystack_access_code || null,
      paymentLink: row.payment_link || null,
      sentAt: row.sent_at || null,
      clientName: row.client_name || null,
      clientEmail: row.client_email || null,
      clientCompany: row.client_company || null,
      vendorName: row.vendor_name || null,
      vendorEmail: row.vendor_email || null,
      vendorCompany: row.vendor_company || null,
      platformFee: row.platform_fee ? parseFloat(row.platform_fee) : 0,
      totalDue: row.total_due ? parseFloat(row.total_due) : null,
    };
  }
}

// Export singleton
export const invoiceService = new InvoiceService();
export default invoiceService;
