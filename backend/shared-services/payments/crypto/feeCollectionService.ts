/**
 * Fee Collection Service
 *
 * Handles platform fee collection for ALL NOWPayments direct-mode payments
 * across every PropMetrik vertical:
 *
 *   - Property Management (rent):  max(1%, GHS 25)
 *   - Deal Management (CRM):       0.25% of deal transaction value
 *   - Project Management:          0.25% of project payment value
 *
 * In "direct" mode, NOWPayments sends the full payment amount directly to the
 * organization/recipient's wallet. The platform fee is recorded in the unified
 * payment_transactions ledger but must be collected separately.
 *
 * Fee collection strategies:
 * 1. "payout" — After a direct-mode payment is confirmed, trigger a NOWPayments
 *    payout from the platform's NOWPayments balance to the platform fee wallet.
 *    Requires the platform to maintain a NOWPayments balance.
 *
 * 2. "invoice" — Record the fee as an accounts-receivable entry and collect
 *    via monthly settlement invoice to the organization.
 *
 * 3. "deduct" — In escrow mode, the fee is deducted before forwarding to the
 *    recipient. Handled by the smart contract or escrow payout flow.
 *
 * This service is **payment-type agnostic** — it reads the fee already calculated
 * by the FeeEngine (which applies the correct rule for rent/deal/project) from
 * the payment_transactions ledger. It works identically for all verticals.
 *
 * Current implementation uses the "invoice" approach for direct mode (record
 * the fee in nowpayments_fee_payouts for audit) and "deduct" for escrow mode.
 * When the platform has a funded NOWPayments balance, "payout" mode can be
 * enabled via nowpayments_config.fee_collection.mode.
 * 
 * 
 */

import { pool } from '../../../src/database';
import { logger } from '../../../src/utils/logger';

export interface FeeCollectionResult {
  status: 'recorded' | 'initiated' | 'completed' | 'skipped' | 'failed';
  feeAmountGhs: number;
  feeAmountUsd: number;
  payoutId?: string | number;
  reason?: string;
}

class FeeCollectionService {
  /**
   * Record and optionally trigger fee collection after a direct-mode payment completes.
   *
   * Called from the IPN webhook handler when a payment_status = 'finished'
   * and settlement_mode = 'direct'.
   */
  async collectFeeForPayment(paymentReference: string): Promise<FeeCollectionResult> {
    try {
      // 1. Look up the payment transaction for fee details
      const txResult = await pool.query(`
        SELECT reference, payment_type, service_fee, gross_amount, principal_amount, currency,
               fee_mode, fee_percentage_applied, fee_flat_applied, metadata
        FROM payment_transactions
        WHERE reference = $1
      `, [paymentReference]);

      if (txResult.rows.length === 0) {
        logger.warn('Fee collection: payment_transaction not found', { paymentReference });
        return { status: 'skipped', feeAmountGhs: 0, feeAmountUsd: 0, reason: 'payment_transaction not found' };
      }

      const tx = txResult.rows[0];
      const paymentType = tx.payment_type || 'rent'; // rent | deal | project
      const serviceFeePesewas = parseInt(tx.service_fee, 10);

      if (serviceFeePesewas <= 0) {
        logger.info('Fee collection: no fee to collect', { paymentReference, paymentType, serviceFeePesewas });
        return { status: 'skipped', feeAmountGhs: 0, feeAmountUsd: 0, reason: 'no fee' };
      }

      const feeAmountGhs = serviceFeePesewas / 100;
      const metadata = tx.metadata || {};
      const feeAmountUsd = metadata.service_fee_ghs
        ? (metadata.usd_amount || 0) * (metadata.service_fee_ghs / metadata.total_charge_ghs || 1)
        : 0;

      // 2. Look up the NP payment for outcome details
      const npResult = await pool.query(`
        SELECT nowpayments_id, outcome_amount, outcome_currency, settlement_mode
        FROM nowpayments_payments
        WHERE payment_reference = $1
      `, [paymentReference]);

      if (npResult.rows.length === 0) {
        logger.warn('Fee collection: nowpayments_payment not found', { paymentReference });
        return { status: 'skipped', feeAmountGhs: 0, feeAmountUsd: 0, reason: 'np_payment not found' };
      }

      const npPayment = npResult.rows[0];

      // 3. Get the platform fee wallet from config
      const platformWallet = await this.getPlatformFeeWallet();
      if (!platformWallet.configured || !platformWallet.walletAddress) {
        logger.error('Fee collection: platform fee wallet not configured', { paymentReference, paymentType });
        // Still record it — fee is owed but can't be collected yet
        await this.recordFeeEntry(paymentReference, npPayment.nowpayments_id, feeAmountGhs, feeAmountUsd, {
          status: 'pending',
          reason: 'platform fee wallet not configured',
        });
        return { status: 'recorded', feeAmountGhs, feeAmountUsd, reason: 'wallet not configured — fee recorded for manual collection' };
      }

      // 4. Get fee collection mode from config
      const feeMode = await this.getFeeCollectionMode();

      if (feeMode === 'payout') {
        // Trigger NOWPayments payout for the fee amount
        return this.triggerFeePayout(paymentReference, npPayment, feeAmountGhs, feeAmountUsd, {
          walletAddress: platformWallet.walletAddress,
          coinSymbol: platformWallet.coinSymbol,
          chain: platformWallet.chain,
        });
      } else {
        // "invoice" mode — just record the fee for manual/monthly collection
        await this.recordFeeEntry(paymentReference, npPayment.nowpayments_id, feeAmountGhs, feeAmountUsd, {
          status: 'recorded',
          payoutCoin: platformWallet.coinSymbol,
          payoutChain: platformWallet.chain,
          payoutAddress: platformWallet.walletAddress,
        });

        logger.info('Fee recorded for collection', {
          paymentReference,
          paymentType,
          feeAmountGhs,
          feeAmountUsd,
          feeMode: tx.fee_mode,
          feePercentage: tx.fee_percentage_applied,
          mode: 'invoice',
          platformWallet: platformWallet.walletAddress,
        });

        return { status: 'recorded', feeAmountGhs, feeAmountUsd, reason: 'recorded for invoice settlement' };
      }
    } catch (err: any) {
      logger.error('Fee collection failed', {
        error: err.message,
        stack: err.stack,
        paymentReference,
      });
      return { status: 'failed', feeAmountGhs: 0, feeAmountUsd: 0, reason: err.message };
    }
  }

  /**
   * Trigger a NOWPayments payout to collect the platform fee.
   * Requires the platform to have a funded NOWPayments balance.
   */
  private async triggerFeePayout(
    paymentReference: string,
    npPayment: any,
    feeAmountGhs: number,
    feeAmountUsd: number,
    platformWallet: { walletAddress: string; coinSymbol?: string; chain?: string },
  ): Promise<FeeCollectionResult> {
    try {
      const { nowPaymentsService } = await import('./nowPaymentsService');
      const { exchangeRateService } = await import('./exchangeRateService');

      // Convert fee to USD for payout
      const feeUsd = feeAmountUsd || await exchangeRateService.convertGhsToUsd(feeAmountGhs);

      // Determine payout coin ticker
      const payoutCoin = platformWallet.coinSymbol || 'eth';
      const payoutTicker = await nowPaymentsService.getNowPaymentsTicker(
        payoutCoin, platformWallet.chain || 'ethereum'
      );

      // Get estimate for the payout amount
      const estimate = await nowPaymentsService.getEstimate(feeUsd, 'usd', payoutTicker || payoutCoin);

      // Create the payout
      const payout = await nowPaymentsService.createPayout({
        address: platformWallet.walletAddress!,
        currency: payoutTicker || payoutCoin,
        amount: estimate.estimated_amount,
        extra_id: paymentReference,
        ipn_callback_url: undefined,
      });

      // Record in fee_payouts table
      await this.recordFeeEntry(paymentReference, npPayment.nowpayments_id, feeAmountGhs, feeUsd, {
        status: 'initiated',
        payoutCoin,
        payoutChain: platformWallet.chain,
        payoutAddress: platformWallet.walletAddress,
        payoutAmount: estimate.estimated_amount,
        nowpaymentsPayoutId: payout.id,
      });

      logger.info('Fee payout initiated', {
        paymentReference,
        feeAmountGhs,
        feeUsd,
        payoutAmount: estimate.estimated_amount,
        payoutCoin,
        payoutId: payout.id,
      });

      return { status: 'initiated', feeAmountGhs, feeAmountUsd: feeUsd, payoutId: payout.id };
    } catch (err: any) {
      logger.error('Fee payout failed, recording for manual collection', {
        error: err.message,
        stack: err.stack,
        paymentReference,
      });

      // Still record the fee — it'll need manual collection
      await this.recordFeeEntry(paymentReference, npPayment.nowpayments_id, feeAmountGhs, feeAmountUsd, {
        status: 'failed',
        errorMessage: err.message,
      });

      return { status: 'failed', feeAmountGhs, feeAmountUsd, reason: `payout failed: ${err.message}` };
    }
  }

  /**
   * Record a fee collection entry in the audit table.
   */
  private async recordFeeEntry(
    paymentReference: string,
    nowpaymentsPaymentId: number,
    feeAmountGhs: number,
    feeAmountUsd: number,
    details: {
      status: string;
      payoutCoin?: string;
      payoutChain?: string;
      payoutAddress?: string;
      payoutAmount?: number;
      nowpaymentsPayoutId?: string | number;
      errorMessage?: string;
      reason?: string;
    },
  ): Promise<void> {
    try {
      await pool.query(`
        INSERT INTO nowpayments_fee_payouts (
          payment_reference, nowpayments_payment_id,
          fee_amount_ghs, fee_amount_usd,
          payout_coin, payout_chain, payout_address, payout_amount,
          nowpayments_payout_id, status, error_message,
          initiated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT DO NOTHING
      `, [
        paymentReference,
        nowpaymentsPaymentId,
        feeAmountGhs,
        feeAmountUsd,
        details.payoutCoin || null,
        details.payoutChain || null,
        details.payoutAddress || null,
        details.payoutAmount || null,
        details.nowpaymentsPayoutId || null,
        details.status,
        details.errorMessage || details.reason || null,
        details.status === 'initiated' ? new Date() : null,
      ]);
    } catch (err: any) {
      logger.error('Failed to record fee entry', {
        error: err.message,
        paymentReference,
      });
    }
  }

  /**
   * Get the platform fee wallet from DB config chain.
   */
  private async getPlatformFeeWallet(): Promise<{
    configured: boolean;
    walletAddress: string | null;
    coinSymbol?: string;
    chain?: string;
  }> {
    // 1. platform_settings (primary — set by admin UI)
    try {
      const result = await pool.query(
        `SELECT setting_value FROM platform_settings WHERE setting_key = 'platform_settlement_wallet'`
      );
      if (result.rows.length > 0 && result.rows[0].setting_value?.configured) {
        const val = result.rows[0].setting_value;
        return {
          configured: true,
          walletAddress: val.walletAddress,
          coinSymbol: val.coinSymbol,
          chain: val.chain,
        };
      }
    } catch (err: any) {
      logger.warn('platform_settings lookup failed', { error: err.message });
    }

    // 2. nowpayments_config (synced copy)
    try {
      const result = await pool.query(
        `SELECT config_value FROM nowpayments_config WHERE config_key = 'platform_payout_wallet'`
      );
      if (result.rows.length > 0 && result.rows[0].config_value?.configured) {
        const val = result.rows[0].config_value;
        return {
          configured: true,
          walletAddress: val.walletAddress,
          coinSymbol: val.coinSymbol,
          chain: val.chain,
        };
      }
    } catch (err: any) {
      logger.warn('nowpayments_config lookup failed', { error: err.message });
    }

    // 3. Env var fallback
    const envWallet = process.env.PLATFORM_SETTLEMENT_WALLET || process.env.PROPMETRIK_PLATFORM_WALLET;
    if (envWallet) {
      logger.warn('Using env var fallback for platform fee wallet — configure via Admin UI for audit compliance');
    }
    return {
      configured: !!envWallet,
      walletAddress: envWallet || null,
    };
  }

  /**
   * Get the configured fee collection mode from nowpayments_config.
   * Returns 'invoice' (default) or 'payout'.
   */
  private async getFeeCollectionMode(): Promise<'payout' | 'invoice'> {
    try {
      const result = await pool.query(
        `SELECT config_value FROM nowpayments_config WHERE config_key = 'fee_collection'`
      );
      if (result.rows.length > 0 && result.rows[0].config_value?.enabled) {
        return result.rows[0].config_value.mode === 'payout' ? 'payout' : 'invoice';
      }
    } catch (err: any) {
      logger.warn('Fee collection config lookup failed, defaulting to invoice', { error: err.message });
    }
    return 'invoice';
  }

  /**
   * Get a summary of outstanding fees for a given period.
   * Used by admin dashboard for settlement reporting.
   */
  async getOutstandingFees(filters?: {
    status?: string;
    fromDate?: Date;
    toDate?: Date;
  }): Promise<{
    totalCount: number;
    totalFeeGhs: number;
    totalFeeUsd: number;
    entries: any[];
  }> {
    let query = `
      SELECT fp.*, pt.payment_type, pt.recipient_id, pt.recipient_type
      FROM nowpayments_fee_payouts fp
      LEFT JOIN payment_transactions pt ON pt.reference = fp.payment_reference
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIdx = 1;

    if (filters?.status) {
      query += ` AND fp.status = $${paramIdx++}`;
      params.push(filters.status);
    }
    if (filters?.fromDate) {
      query += ` AND fp.created_at >= $${paramIdx++}`;
      params.push(filters.fromDate);
    }
    if (filters?.toDate) {
      query += ` AND fp.created_at <= $${paramIdx++}`;
      params.push(filters.toDate);
    }

    query += ' ORDER BY fp.created_at DESC';

    const result = await pool.query(query, params);

    const totalFeeGhs = result.rows.reduce((sum: number, r: any) => sum + parseFloat(r.fee_amount_ghs || 0), 0);
    const totalFeeUsd = result.rows.reduce((sum: number, r: any) => sum + parseFloat(r.fee_amount_usd || 0), 0);

    return {
      totalCount: result.rows.length,
      totalFeeGhs,
      totalFeeUsd,
      entries: result.rows,
    };
  }
}

export const feeCollectionService = new FeeCollectionService();
