/**
 * Refund Service
 *
 * The first refund path in PROPMETRIK. Before this, payment_transactions.status had a
 * 'refunded' value that was never written and there was no way to return money to a payer.
 *
 * Enterprise controls:
 *  - Admin-gated at the route (requireServiceRole('crm', ['service_admin'])).
 *  - Idempotent: refund_status is the guard — a refund can only be initiated when it is
 *    NULL or 'failed', so a double-submit can never issue two Paystack refunds for one
 *    transaction. The claim is a conditional UPDATE (compare-and-set), race-safe.
 *  - Amount-capped: cannot refund more than the principal.
 *  - Audited: refund_initiated_by/at on the row + append-only audit_logs (route middleware)
 *    + structured auditLog().
 *  - Async-correct: Paystack refunds complete later; markRefundProcessed/Failed reconcile
 *    the ledger from the webhook. status flips to 'refunded' only on webhook confirmation.
 *
 * @module services/property-management/payment/refundService
 */

import { pool } from '../../../database';
import { paystackService } from './paystackService';
import { logger, auditLog } from '../../../utils/logger';

export interface InitiateRefundParams {
    reference: string;         // original transaction reference
    amount?: number;           // pesewas; omit = full principal
    reason?: string;
    initiatedBy: string;       // staff user id (maker)
    organizationId: string;
}

export interface RefundResult {
    status: 'pending' | 'processing' | 'processed' | 'failed';
    refundReference?: string;
    refundedAmount?: number;
    message: string;
    alreadyInProgress?: boolean;
}

class RefundService {
    /**
     * Initiate a refund on a successful payment transaction.
     * Submits to Paystack (async); the ledger reaches 'refunded' on the webhook.
     */
    async initiateRefund(params: InitiateRefundParams): Promise<RefundResult> {
        const { reference, amount, reason, initiatedBy, organizationId } = params;

        // 1. Load + validate the transaction.
        const txRes = await pool.query(
            `SELECT id, status, principal_amount, gross_amount, paystack_reference,
                    refund_status, refund_reference, recipient_id
               FROM payment_transactions
              WHERE reference = $1`,
            [reference]
        );
        const tx = txRes.rows[0];
        if (!tx) throw new Error('Transaction not found');

        // Idempotent short-circuit: already refunding/refunded.
        if (tx.refund_status && tx.refund_status !== 'failed') {
            return {
                status: tx.refund_status,
                refundReference: tx.refund_reference || undefined,
                message: 'A refund is already in progress or completed for this transaction',
                alreadyInProgress: true,
            };
        }

        if (tx.status !== 'success') {
            throw new Error(`Only successful payments can be refunded (current status: ${tx.status})`);
        }
        if (!tx.paystack_reference) {
            throw new Error('Transaction has no Paystack reference to refund (was it a crypto payment?)');
        }

        const maxRefundable = Number(tx.principal_amount ?? tx.gross_amount ?? 0);
        const refundAmount = amount && amount > 0 ? Math.round(amount) : maxRefundable;
        if (refundAmount <= 0) throw new Error('Refund amount must be greater than zero');
        if (refundAmount > maxRefundable) {
            throw new Error(`Refund amount (${refundAmount}) exceeds refundable principal (${maxRefundable}) in pesewas`);
        }

        // 2. Claim (compare-and-set): only proceed if still NULL/failed — race-safe idempotency.
        const claim = await pool.query(
            `UPDATE payment_transactions
                SET refund_status = 'pending',
                    refund_reason = $2,
                    refunded_amount = $3,
                    refund_initiated_by = $4,
                    refund_initiated_at = NOW()
              WHERE reference = $1
                AND (refund_status IS NULL OR refund_status = 'failed')
          RETURNING id`,
            [reference, reason || null, refundAmount, initiatedBy]
        );
        if (claim.rowCount === 0) {
            // Another request claimed it between our read and write.
            return { status: 'pending', message: 'A refund is already in progress for this transaction', alreadyInProgress: true };
        }

        // 3. Submit to Paystack (async on their side).
        try {
            const result = await paystackService.refundTransaction(tx.paystack_reference, refundAmount, reason);
            const refundRef =
                result?.data?.id != null ? String(result.data.id)
                    : (result?.data?.reference || null);

            await pool.query(
                `UPDATE payment_transactions
                    SET refund_status = 'processing', refund_reference = $2
                  WHERE reference = $1`,
                [reference, refundRef]
            );

            auditLog({
                action: 'payment.refund.initiated',
                userId: initiatedBy,
                resourceType: 'payment_transaction',
                resourceId: tx.id,
                metadata: { reference, organizationId, refundAmount, refundReference: refundRef, reason },
            });
            logger.info('Refund submitted to Paystack', { reference, refundAmount, refundRef });

            return {
                status: 'processing',
                refundReference: refundRef || undefined,
                refundedAmount: refundAmount,
                message: 'Refund submitted; completion is confirmed via webhook',
            };
        } catch (err: any) {
            // Roll the claim back to 'failed' so it can be retried; do NOT lose the audit fields.
            await pool.query(
                `UPDATE payment_transactions SET refund_status = 'failed' WHERE reference = $1`,
                [reference]
            ).catch(() => { /* best-effort */ });
            logger.error('Refund submission to Paystack failed', { reference, error: err?.message });
            throw err;
        }
    }

    /**
     * Webhook: Paystack confirmed the refund. Flip the ledger to 'refunded'.
     * Idempotent — safe to receive twice. `txReference` is the ORIGINAL transaction
     * reference (Paystack echoes it as data.transaction.reference on refund events).
     */
    async markRefundProcessed(txReference: string, refundedAmount?: number): Promise<void> {
        const res = await pool.query(
            `UPDATE payment_transactions
                SET status = 'refunded',
                    refund_status = 'processed',
                    refunded_at = NOW(),
                    refunded_amount = COALESCE($2, refunded_amount)
              WHERE paystack_reference = $1
                AND refund_status IS DISTINCT FROM 'processed'
          RETURNING id`,
            [txReference, refundedAmount ?? null]
        );
        if (res.rowCount && res.rowCount > 0) {
            logger.info('Refund confirmed via webhook', { txReference, refundedAmount });
        } else {
            logger.info('Refund webhook: no matching in-flight transaction (already processed or unknown)', { txReference });
        }
    }

    /**
     * Webhook: Paystack failed the refund. Mark it 'failed' so it can be retried.
     */
    async markRefundFailed(txReference: string): Promise<void> {
        await pool.query(
            `UPDATE payment_transactions
                SET refund_status = 'failed'
              WHERE paystack_reference = $1
                AND refund_status IS DISTINCT FROM 'processed'`,
            [txReference]
        ).catch(() => { /* best-effort */ });
        logger.error('Refund failed (per Paystack webhook)', { txReference });
    }
}

export const refundService = new RefundService();
export default refundService;
