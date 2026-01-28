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
import { fxFeedService } from '../data-hub/scrapers/fxFeedService';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export type InvoiceStatus = 
  | 'draft'
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'disputed'
  | 'rejected'
  | 'cancelled';

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
         WHERE id = $1 AND status IN ('approved', 'partially_paid')
         RETURNING *`,
        [id, paidDate, paymentReference, paymentMethod]
      );
      
      if (!result.rows[0]) {
        throw new Error(`Invoice not found or cannot be marked as paid: ${id}`);
      }
      
      logger.info('Invoice marked as paid', { invoiceId: id, paymentReference });
      return this.mapInvoice(result.rows[0]);
    } catch (error) {
      logger.error('Error marking invoice as paid', { id, error });
      throw error;
    }
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
            THEN DATE_PART('day', paid_date - invoice_date) 
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
    };
  }
}

// Export singleton
export const invoiceService = new InvoiceService();
export default invoiceService;
