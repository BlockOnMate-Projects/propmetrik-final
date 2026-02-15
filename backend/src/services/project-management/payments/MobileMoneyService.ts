/**
 * Mobile Money Service
 * 
 * Phase 4.3: Ghana Mobile Money Integration
 * 
 * Handles mobile money transactions for:
 * - MTN Mobile Money (MoMo)
 * - Vodafone Cash
 * - AirtelTigo Money
 * 
 * Use cases:
 * - Petty cash disbursements
 * - Informal labor payments
 * - Material purchases
 * - Utility payments
 * 
 * @module services/project-management/payments/MobileMoneyService
 */

import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../../database';
import { BaseService } from '../../../../shared-services/base/BaseService';
import { UUID } from '../types';
import { ValidationError, NotFoundError, ServiceError } from '../errors';
import { eventBus, ProjectEventType } from '../events';

// =============================================================================
// TYPES
// =============================================================================

export enum MobileMoneyProvider {
  MTN = 'mtn',
  VODAFONE = 'vodafone',
  AIRTELTIGO = 'airteltigo',
}

export enum TransactionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCESSFUL = 'successful',
  FAILED = 'failed',
  REVERSED = 'reversed',
  TIMEOUT = 'timeout',
}

export enum TransactionType {
  DISBURSEMENT = 'disbursement', // Sending money out
  COLLECTION = 'collection',     // Receiving money
  REVERSAL = 'reversal',         // Reversing a transaction
}

export interface MobileMoneyTransaction {
  id: UUID;
  projectId?: UUID;
  organizationId: UUID;
  
  // Transaction details
  provider: MobileMoneyProvider;
  transactionType: TransactionType;
  externalTransactionId?: string;
  
  // Amount
  amount: number;
  currency: string;
  fee?: number;
  
  // Parties
  senderPhoneNumber: string;
  senderName?: string;
  recipientPhoneNumber: string;
  recipientName: string;
  
  // Reference
  reference: string;
  description?: string;
  category?: string;
  
  // Status
  status: TransactionStatus;
  failureReason?: string;
  
  // Linked entities
  pettyCashId?: UUID;
  expenseLogId?: UUID;
  invoiceId?: UUID;
  
  // Timestamps
  initiatedAt: Date;
  completedAt?: Date;
  
  // Audit
  initiatedBy: UUID;
  approvedBy?: UUID;
  createdAt: Date;
  updatedAt: Date;
}

export interface InitiateTransactionInput {
  projectId?: UUID;
  organizationId: UUID;
  provider: MobileMoneyProvider;
  transactionType: TransactionType;
  amount: number;
  currency?: string;
  recipientPhoneNumber: string;
  recipientName: string;
  senderPhoneNumber: string;
  senderName?: string;
  reference?: string;
  description?: string;
  category?: string;
  pettyCashId?: UUID;
  expenseLogId?: UUID;
  initiatedBy: UUID;
}

export interface TransactionCallback {
  transactionId: string;
  externalTransactionId: string;
  status: 'SUCCESS' | 'FAILED' | 'TIMEOUT';
  amount: number;
  fee?: number;
  completedAt: string;
  failureReason?: string;
  providerReference?: string;
}

export interface MobileMoneyBalance {
  provider: MobileMoneyProvider;
  accountNumber: string;
  balance: number;
  currency: string;
  lastUpdated: Date;
}

export interface DailyTransactionSummary {
  date: Date;
  provider: MobileMoneyProvider;
  totalDisbursements: number;
  totalCollections: number;
  transactionCount: number;
  totalFees: number;
  successRate: number;
}

// =============================================================================
// PHONE NUMBER VALIDATION
// =============================================================================

// Ghana mobile number prefixes by provider
const PROVIDER_PREFIXES: Record<MobileMoneyProvider, string[]> = {
  [MobileMoneyProvider.MTN]: ['024', '054', '055', '059'],
  [MobileMoneyProvider.VODAFONE]: ['020', '050'],
  [MobileMoneyProvider.AIRTELTIGO]: ['027', '057', '026', '056'],
};

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class MobileMoneyServiceImpl extends BaseService {
  constructor() {
    super('MobileMoneyService');
  }

  // ===========================================================================
  // ROW MAPPING
  // ===========================================================================

  protected mapRow(row: any): MobileMoneyTransaction {
    return {
      id: row.id,
      projectId: row.project_id,
      organizationId: row.organization_id,
      provider: row.provider,
      transactionType: row.transaction_type,
      externalTransactionId: row.external_transaction_id,
      amount: parseFloat(row.amount),
      currency: row.currency || 'GHS',
      fee: row.fee ? parseFloat(row.fee) : undefined,
      senderPhoneNumber: row.sender_phone_number,
      senderName: row.sender_name,
      recipientPhoneNumber: row.recipient_phone_number,
      recipientName: row.recipient_name,
      reference: row.reference,
      description: row.description,
      category: row.category,
      status: row.status,
      failureReason: row.failure_reason,
      pettyCashId: row.petty_cash_id,
      expenseLogId: row.expense_log_id,
      invoiceId: row.invoice_id,
      initiatedAt: row.initiated_at,
      completedAt: row.completed_at,
      initiatedBy: row.initiated_by,
      approvedBy: row.approved_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ===========================================================================
  // VALIDATION
  // ===========================================================================

  /**
   * Validate and normalize a Ghana mobile number.
   */
  normalizePhoneNumber(phone: string): string {
    // Remove all non-digits
    let digits = phone.replace(/\D/g, '');
    
    // Handle +233 prefix
    if (digits.startsWith('233')) {
      digits = '0' + digits.substring(3);
    }
    
    // Ensure starts with 0
    if (!digits.startsWith('0')) {
      digits = '0' + digits;
    }
    
    // Should be 10 digits for Ghana
    if (digits.length !== 10) {
      throw ValidationError.forField('phoneNumber', 'Ghana mobile numbers must be 10 digits');
    }
    
    return digits;
  }

  /**
   * Detect provider from phone number.
   */
  detectProvider(phone: string): MobileMoneyProvider {
    const normalized = this.normalizePhoneNumber(phone);
    const prefix = normalized.substring(0, 3);
    
    for (const [provider, prefixes] of Object.entries(PROVIDER_PREFIXES)) {
      if (prefixes.includes(prefix)) {
        return provider as MobileMoneyProvider;
      }
    }
    
    throw ValidationError.forField('phoneNumber', `Unknown mobile money provider for prefix ${prefix}`);
  }

  /**
   * Validate that phone number matches expected provider.
   */
  validateProviderMatch(phone: string, provider: MobileMoneyProvider): boolean {
    const detectedProvider = this.detectProvider(phone);
    return detectedProvider === provider;
  }

  // ===========================================================================
  // TRANSACTION OPERATIONS
  // ===========================================================================

  /**
   * Initiate a mobile money transaction.
   * Note: In production, this would call the provider's API.
   */
  async initiateTransaction(input: InitiateTransactionInput): Promise<MobileMoneyTransaction> {
    // Normalize phone numbers
    const recipientPhone = this.normalizePhoneNumber(input.recipientPhoneNumber);
    const senderPhone = this.normalizePhoneNumber(input.senderPhoneNumber);
    
    // Validate amount
    if (input.amount <= 0) {
      throw ValidationError.forField('amount', 'Amount must be positive');
    }
    
    // Generate reference if not provided
    const reference = input.reference || this.generateReference(input.provider);
    
    const id = uuidv4();

    const result = await this.query(
      `INSERT INTO pm_mobile_money_transactions (
        id, project_id, organization_id, provider, transaction_type,
        amount, currency, 
        sender_phone_number, sender_name, recipient_phone_number, recipient_name,
        reference, description, category,
        status, petty_cash_id, expense_log_id,
        initiated_by, initiated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14,
        'pending', $15, $16,
        $17, NOW()
      ) RETURNING *`,
      [
        id, input.projectId, input.organizationId, input.provider, input.transactionType,
        input.amount, input.currency || 'GHS',
        senderPhone, input.senderName, recipientPhone, input.recipientName,
        reference, input.description, input.category,
        input.pettyCashId, input.expenseLogId,
        input.initiatedBy,
      ]
    );

    const transaction = this.mapRow(result.rows[0]);

    // In production: Call provider API to initiate transaction
    // For now, simulate by updating to processing
    await this.updateTransactionStatus(id, TransactionStatus.PROCESSING);

    // Emit event
    eventBus.emit(ProjectEventType.PAYMENT_SUBMITTED, {
      entityType: 'mobile_money_transaction',
      entityId: id,
      projectId: input.projectId,
      organizationId: input.organizationId,
      userId: input.initiatedBy,
      data: {
        provider: input.provider,
        amount: input.amount,
        recipient: recipientPhone,
      },
    });

    return transaction;
  }

  /**
   * Handle callback from mobile money provider.
   */
  async handleCallback(callback: TransactionCallback): Promise<MobileMoneyTransaction> {
    // Find the transaction
    const result = await this.query(
      `SELECT * FROM pm_mobile_money_transactions WHERE id = $1`,
      [callback.transactionId]
    );

    if (result.rows.length === 0) {
      throw NotFoundError.forResource('MobileMoneyTransaction', callback.transactionId);
    }

    const existingTx = this.mapRow(result.rows[0]);

    // Determine new status
    let newStatus: TransactionStatus;
    switch (callback.status) {
      case 'SUCCESS':
        newStatus = TransactionStatus.SUCCESSFUL;
        break;
      case 'FAILED':
        newStatus = TransactionStatus.FAILED;
        break;
      case 'TIMEOUT':
        newStatus = TransactionStatus.TIMEOUT;
        break;
      default:
        newStatus = TransactionStatus.FAILED;
    }

    // Update transaction
    const updateResult = await this.query(
      `UPDATE pm_mobile_money_transactions SET
        external_transaction_id = $1,
        status = $2,
        fee = $3,
        completed_at = $4,
        failure_reason = $5,
        updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        callback.externalTransactionId,
        newStatus,
        callback.fee,
        callback.completedAt,
        callback.failureReason,
        callback.transactionId,
      ]
    );

    const updated = this.mapRow(updateResult.rows[0]);

    // If successful disbursement, update linked petty cash
    if (newStatus === TransactionStatus.SUCCESSFUL && existingTx.pettyCashId) {
      await this.query(
        `UPDATE project_petty_cash_ledger SET status = 'disbursed', updated_at = NOW() WHERE id = $1`,
        [existingTx.pettyCashId]
      );
    }

    // Emit event
    eventBus.emit(
      newStatus === TransactionStatus.SUCCESSFUL
        ? ProjectEventType.PAYMENT_COMPLETED
        : ProjectEventType.PAYMENT_FAILED,
      {
        entityType: 'mobile_money_transaction',
        entityId: callback.transactionId,
        projectId: existingTx.projectId,
        organizationId: existingTx.organizationId,
        data: {
          status: newStatus,
          amount: updated.amount,
          failureReason: callback.failureReason,
        },
      }
    );

    return updated;
  }

  /**
   * Update transaction status.
   */
  private async updateTransactionStatus(
    id: UUID,
    status: TransactionStatus,
    failureReason?: string
  ): Promise<void> {
    await this.query(
      `UPDATE pm_mobile_money_transactions SET 
        status = $1, 
        failure_reason = $2,
        updated_at = NOW() 
       WHERE id = $3`,
      [status, failureReason, id]
    );
  }

  // ===========================================================================
  // QUERY OPERATIONS
  // ===========================================================================

  /**
   * Get transaction by ID.
   */
  async getTransactionById(id: UUID): Promise<MobileMoneyTransaction> {
    const result = await this.query(
      `SELECT * FROM pm_mobile_money_transactions WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw NotFoundError.forResource('MobileMoneyTransaction', id);
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * List transactions for a project.
   */
  async listProjectTransactions(
    projectId: UUID,
    filters: {
      provider?: MobileMoneyProvider;
      status?: TransactionStatus;
      fromDate?: Date;
      toDate?: Date;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ transactions: MobileMoneyTransaction[]; total: number }> {
    const { limit = 50, offset = 0 } = filters;
    
    const conditions: string[] = ['project_id = $1'];
    const params: any[] = [projectId];
    let paramIndex = 2;

    if (filters.provider) {
      conditions.push(`provider = $${paramIndex++}`);
      params.push(filters.provider);
    }

    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (filters.fromDate) {
      conditions.push(`initiated_at >= $${paramIndex++}`);
      params.push(filters.fromDate);
    }

    if (filters.toDate) {
      conditions.push(`initiated_at <= $${paramIndex++}`);
      params.push(filters.toDate);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await this.query(
      `SELECT COUNT(*) FROM pm_mobile_money_transactions WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get transactions
    const result = await this.query(
      `SELECT * FROM pm_mobile_money_transactions 
       WHERE ${whereClause}
       ORDER BY initiated_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, limit, offset]
    );

    return {
      transactions: result.rows.map(row => this.mapRow(row)),
      total,
    };
  }

  // ===========================================================================
  // REPORTING
  // ===========================================================================

  /**
   * Get daily transaction summary.
   */
  async getDailyTransactionSummary(
    organizationId: UUID,
    date: Date,
    provider?: MobileMoneyProvider
  ): Promise<DailyTransactionSummary[]> {
    const conditions: string[] = [
      'organization_id = $1',
      'DATE(initiated_at) = DATE($2)',
    ];
    const params: any[] = [organizationId, date];

    if (provider) {
      conditions.push('provider = $3');
      params.push(provider);
    }

    const result = await this.query(
      `SELECT 
         DATE(initiated_at) as date,
         provider,
         COUNT(*) as transaction_count,
         COALESCE(SUM(CASE WHEN transaction_type = 'disbursement' THEN amount ELSE 0 END), 0) as total_disbursements,
         COALESCE(SUM(CASE WHEN transaction_type = 'collection' THEN amount ELSE 0 END), 0) as total_collections,
         COALESCE(SUM(fee), 0) as total_fees,
         ROUND(
           (COUNT(*) FILTER (WHERE status = 'successful')::decimal / NULLIF(COUNT(*), 0)) * 100,
           2
         ) as success_rate
       FROM pm_mobile_money_transactions
       WHERE ${conditions.join(' AND ')}
       GROUP BY DATE(initiated_at), provider`,
      params
    );

    return result.rows.map(row => ({
      date: row.date,
      provider: row.provider,
      transactionCount: parseInt(row.transaction_count, 10),
      totalDisbursements: parseFloat(row.total_disbursements),
      totalCollections: parseFloat(row.total_collections),
      totalFees: parseFloat(row.total_fees),
      successRate: parseFloat(row.success_rate) || 0,
    }));
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private generateReference(provider: MobileMoneyProvider): string {
    const prefix = provider.toUpperCase().substring(0, 3);
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const mobileMoneyService = new MobileMoneyServiceImpl();
