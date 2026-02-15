/**
 * Escrow Payout Service
 *
 * Handles the two-step escrow flow for cross-chain payments:
 *
 * Step 1 (Intake): NOWPayments receives non-EVM payment → converts to USDT on Polygon
 *                  → sends to our platform wallet → we deposit into smart contract for escrow.
 *
 * Step 2 (Release): When escrow is released (milestone hit, lease confirmed, etc.),
 *                   the contract sends stablecoin to the platform wallet.
 *                   This service then triggers a NOWPayments payout to convert the
 *                   stablecoin into the recipient's preferred settlement coin and
 *                   sends it to their configured wallet.
 *
 * @module shared-services/payments/crypto/escrowPayoutService
 */

import { pool } from '../../../src/database';
import { logger } from '../../../src/utils/logger';
import { nowPaymentsService } from './nowPaymentsService';
import { cryptoPaymentService } from './cryptoPaymentService';

// =====================================================
// TYPES
// =====================================================

export interface EscrowDepositResult {
  success: boolean;
  paymentReference: string;
  txHash?: string;
  error?: string;
}

export interface EscrowReleasePayoutResult {
  success: boolean;
  paymentReference: string;
  payoutId?: string;
  destinationCurrency?: string;
  destinationAddress?: string;
  error?: string;
}

// =====================================================
// SERVICE
// =====================================================

class EscrowPayoutService {
  private pollIntervalMs: number;
  private pollTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    this.pollIntervalMs = parseInt(process.env.ESCROW_PAYOUT_POLL_INTERVAL_MS || '60000', 10);
  }

  // ─── Lifecycle ──────────────────────────────

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('EscrowPayoutService started');
    this.pollTimer = setInterval(() => this.pollPendingPayouts(), this.pollIntervalMs);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isRunning = false;
    logger.info('EscrowPayoutService stopped');
  }

  // ─── Step 1: Handle Escrow Deposit ──────────────────────────────

  /**
   * After NOWPayments finishes converting a cross-chain payment to USDT on Polygon,
   * we receive the USDT at our platform wallet. This method deposits it into the
   * smart contract for escrow management.
   *
   * This is called after a NOWPayments IPN with status='finished' and settlement_mode='escrow'.
   */
  async handleEscrowDeposit(paymentReference: string): Promise<EscrowDepositResult> {
    try {
      const paymentRow = await pool.query(
        `SELECT * FROM nowpayments_payments WHERE payment_reference = $1`,
        [paymentReference]
      );

      if (paymentRow.rows.length === 0) {
        return { success: false, paymentReference, error: 'Payment not found' };
      }

      const payment = paymentRow.rows[0];

      if (payment.settlement_mode !== 'escrow') {
        return { success: false, paymentReference, error: 'Not an escrow payment' };
      }

      if (payment.escrow_deposit_tx_hash) {
        return { success: true, paymentReference, txHash: payment.escrow_deposit_tx_hash };
      }

      // The USDT has arrived at our platform wallet from NOWPayments.
      // Now we need to deposit it into the smart contract.
      // This is done via the standard processPayment() contract call from the admin signer.

      logger.info('Initiating escrow deposit to smart contract', {
        reference: paymentReference,
        outcomeAmount: payment.outcome_amount,
        outcomeCurrency: payment.outcome_currency,
      });

      // For now, we record that the escrow deposit is pending.
      // The actual contract deposit requires the admin to approve + call processPayment().
      // This could be automated with a keeper/relayer in the future.
      await pool.query(`
        UPDATE nowpayments_payments SET
          status = 'escrow_pending',
          updated_at = NOW()
        WHERE payment_reference = $1
      `, [paymentReference]);

      // Update the unified ledger
      await pool.query(`
        UPDATE payment_transactions SET
          status = 'escrow_pending',
          metadata = metadata || jsonb_build_object(
            'nowpayments_outcome_amount', $1,
            'nowpayments_outcome_currency', $2,
            'escrow_pending_at', NOW()
          )
        WHERE reference = $3
      `, [payment.outcome_amount, payment.outcome_currency, paymentReference]);

      return {
        success: true,
        paymentReference,
      };
    } catch (err: any) {
      logger.error('Escrow deposit failed', { reference: paymentReference, error: err.message });
      return { success: false, paymentReference, error: err.message };
    }
  }

  /**
   * Record that escrow deposit to the smart contract has been completed.
   * Called after admin/keeper deposits the USDT into the contract.
   */
  async confirmEscrowDeposit(paymentReference: string, txHash: string): Promise<void> {
    await pool.query(`
      UPDATE nowpayments_payments SET
        status = 'escrow_deposited',
        escrow_deposit_tx_hash = $1,
        updated_at = NOW()
      WHERE payment_reference = $2
    `, [txHash, paymentReference]);

    await pool.query(`
      UPDATE payment_transactions SET
        status = 'escrowed',
        tx_hash = $1,
        metadata = metadata || jsonb_build_object('escrow_deposited_at', NOW())
      WHERE reference = $2
    `, [txHash, paymentReference]);

    logger.info('Escrow deposit confirmed', { reference: paymentReference, txHash });
  }

  // ─── Step 2: Handle Escrow Release → Payout ──────────────────────────────

  /**
   * When an escrowed payment is released (milestone hit, lease confirmed, etc.),
   * trigger a NOWPayments payout to convert the released stablecoin into the
   * recipient's preferred settlement coin.
   *
   * @param paymentReference - Our internal payment reference
   * @param releaseTxHash - The smart contract transaction hash of the release
   * @param releaseAmount - Amount released in the contract's stablecoin (USDT, usually)
   */
  async handleEscrowRelease(
    paymentReference: string,
    releaseTxHash: string,
    releaseAmount: number,
  ): Promise<EscrowReleasePayoutResult> {
    try {
      const paymentRow = await pool.query(
        `SELECT * FROM nowpayments_payments WHERE payment_reference = $1`,
        [paymentReference]
      );

      if (paymentRow.rows.length === 0) {
        return { success: false, paymentReference, error: 'Payment not found' };
      }

      const payment = paymentRow.rows[0];

      // Get recipient's settlement preference
      const recipientPref = await nowPaymentsService.getClientSettlementPreference(
        payment.recipient_entity_type,
        payment.recipient_entity_id
      );

      if (!recipientPref?.configured || !recipientPref.useNowPayments) {
        // Recipient wants EVM native — the contract already sent it directly.
        // No payout needed.
        await pool.query(`
          UPDATE nowpayments_payments SET
            status = 'completed',
            escrow_release_tx_hash = $1,
            settled_at = NOW()
          WHERE payment_reference = $2
        `, [releaseTxHash, paymentReference]);

        return { success: true, paymentReference };
      }

      // Recipient wants non-EVM settlement (BTC, ETH L1, etc.)
      // Trigger NOWPayments payout to convert the released stablecoin.
      const destinationTicker = await nowPaymentsService.getNowPaymentsTicker(
        recipientPref.coinSymbol!, recipientPref.chain!
      );

      if (!destinationTicker) {
        return {
          success: false,
          paymentReference,
          error: `No NOWPayments ticker for ${recipientPref.coinSymbol} on ${recipientPref.chain}`,
        };
      }

      logger.info('Triggering NOWPayments payout for escrow release', {
        reference: paymentReference,
        amount: releaseAmount,
        destinationCurrency: destinationTicker,
        destinationAddress: recipientPref.walletAddress,
      });

      // Create the payout via NOWPayments
      const payoutResult = await nowPaymentsService.createPayout({
        address: recipientPref.walletAddress!,
        currency: destinationTicker,
        amount: releaseAmount,
        ipn_callback_url: `${nowPaymentsService.getConfig()?.callbackBaseUrl}/api/v1/webhooks/nowpayments/ipn`,
      });

      // Record the payout
      const payoutDbId = await nowPaymentsService.recordPayout({
        paymentReference,
        sourceCurrency: 'usdtmatic',
        sourceAmount: releaseAmount,
        destinationCurrency: destinationTicker,
        destinationAddress: recipientPref.walletAddress!,
        recipientEntityType: payment.recipient_entity_type,
        recipientEntityId: payment.recipient_entity_id,
        nowpaymentsPayoutId: parseInt(payoutResult.id, 10) || undefined,
      });

      // Update the main payment record
      await pool.query(`
        UPDATE nowpayments_payments SET
          status = 'payout_sent',
          escrow_release_tx_hash = $1,
          escrow_payout_id = $2
        WHERE payment_reference = $3
      `, [releaseTxHash, payoutDbId, paymentReference]);

      return {
        success: true,
        paymentReference,
        payoutId: payoutDbId,
        destinationCurrency: destinationTicker,
        destinationAddress: recipientPref.walletAddress!,
      };
    } catch (err: any) {
      logger.error('Escrow release payout failed', {
        reference: paymentReference,
        error: err.message,
      });
      return { success: false, paymentReference, error: err.message };
    }
  }

  // ─── Polling for Payout Completion ──────────────────────────────

  /**
   * Poll pending payouts and check their status via NOWPayments.
   * Primary settlement is via IPN callbacks — this is a fallback
   * to catch payouts whose IPN was missed or delayed.
   */
  private async pollPendingPayouts(): Promise<void> {
    try {
      const pendingPayouts = await pool.query(`
        SELECT * FROM nowpayments_payouts
        WHERE status IN ('pending', 'processing')
        AND created_at > NOW() - INTERVAL '7 days'
        ORDER BY created_at ASC
        LIMIT 50
      `);

      if (pendingPayouts.rows.length === 0) return;

      logger.debug(`Polling ${pendingPayouts.rows.length} pending payouts`);

      for (const payout of pendingPayouts.rows) {
        if (!payout.nowpayments_payout_id) continue;

        try {
          const status = await nowPaymentsService.getPayoutStatus(payout.nowpayments_payout_id);

          logger.debug('Payout status check', {
            payoutId: payout.id,
            nowpaymentsPayoutId: payout.nowpayments_payout_id,
            currentStatus: payout.status,
            remoteStatus: status.status,
          });

          // Map NOWPayments status to our internal status
          const statusMap: Record<string, string> = {
            'WAITING': 'pending',
            'PROCESSING': 'processing',
            'FINISHED': 'completed',
            'FAILED': 'failed',
            'REJECTED': 'failed',
          };

          const mappedStatus = statusMap[status.status] || payout.status;

          if (mappedStatus !== payout.status) {
            // Status changed — update DB
            await pool.query(`
              UPDATE nowpayments_payouts SET
                status = $1,
                destination_amount = COALESCE($2, destination_amount),
                completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN NOW() ELSE completed_at END,
                updated_at = NOW()
              WHERE id = $3
            `, [mappedStatus, status.amount || null, payout.id]);

            logger.info('Payout status updated via polling', {
              payoutId: payout.id,
              oldStatus: payout.status,
              newStatus: mappedStatus,
              txHash: status.hash,
            });

            // If completed or failed, update the parent payment record
            if (mappedStatus === 'completed') {
              await pool.query(`
                UPDATE nowpayments_payments SET
                  status = 'completed',
                  settled_at = NOW()
                WHERE payment_reference = $1
              `, [payout.payment_reference]);

              await pool.query(`
                UPDATE payment_transactions SET
                  status = 'success',
                  updated_at = NOW()
                WHERE reference = $1
              `, [payout.payment_reference]);

              logger.info('Escrow payout completed', {
                payoutId: payout.id,
                paymentReference: payout.payment_reference,
              });
            } else if (mappedStatus === 'failed') {
              await pool.query(`
                UPDATE nowpayments_payments SET
                  status = 'payout_failed',
                  updated_at = NOW()
                WHERE payment_reference = $1
              `, [payout.payment_reference]);

              logger.error('Escrow payout failed', {
                payoutId: payout.id,
                paymentReference: payout.payment_reference,
                remoteStatus: status.status,
              });
            }
          }
        } catch (err: any) {
          logger.warn('Failed to check payout status', {
            payoutId: payout.id,
            error: err.message,
          });
        }
      }
    } catch (err: any) {
      logger.error('Payout poll error', { error: err.message });
    }
  }

  // ─── Admin Methods ──────────────────────────────

  /**
   * Get a summary of escrow payments and payouts.
   */
  async getSummary(): Promise<{
    escrowPayments: Record<string, number>;
    payouts: Record<string, number>;
  }> {
    const escrowResult = await pool.query(`
      SELECT status, COUNT(*)::int AS count
      FROM nowpayments_payments
      WHERE settlement_mode = 'escrow'
      GROUP BY status
    `);

    const payoutResult = await pool.query(`
      SELECT status, COUNT(*)::int AS count
      FROM nowpayments_payouts
      GROUP BY status
    `);

    const escrowPayments: Record<string, number> = {};
    for (const row of escrowResult.rows) {
      escrowPayments[row.status] = row.count;
    }

    const payouts: Record<string, number> = {};
    for (const row of payoutResult.rows) {
      payouts[row.status] = row.count;
    }

    return { escrowPayments, payouts };
  }

  /**
   * Manually mark a payout as completed (for manual settlement scenarios).
   */
  async markPayoutCompleted(
    payoutId: string,
    params: { txHash?: string; actualAmount?: number }
  ): Promise<void> {
    await pool.query(`
      UPDATE nowpayments_payouts SET
        status = 'completed',
        destination_amount = COALESCE($1, destination_amount),
        completed_at = NOW()
      WHERE id = $2
    `, [params.actualAmount, payoutId]);

    // Also update the parent payment
    const payoutRow = await pool.query(
      `SELECT payment_reference FROM nowpayments_payouts WHERE id = $1`,
      [payoutId]
    );

    if (payoutRow.rows[0]) {
      await pool.query(`
        UPDATE nowpayments_payments SET
          status = 'completed',
          settled_at = NOW()
        WHERE payment_reference = $1
      `, [payoutRow.rows[0].payment_reference]);

      await pool.query(`
        UPDATE payment_transactions SET
          status = 'success'
        WHERE reference = $1
      `, [payoutRow.rows[0].payment_reference]);
    }

    logger.info('Payout manually completed', { payoutId, ...params });
  }

  /**
   * Get pending escrow deposits (NOWPayments finished but not yet deposited to contract).
   */
  async getPendingEscrowDeposits(): Promise<any[]> {
    const result = await pool.query(`
      SELECT * FROM nowpayments_payments
      WHERE settlement_mode = 'escrow'
        AND status IN ('escrow_pending', 'finished')
        AND escrow_deposit_tx_hash IS NULL
      ORDER BY created_at ASC
    `);
    return result.rows;
  }
}

// Singleton
export const escrowPayoutService = new EscrowPayoutService();
