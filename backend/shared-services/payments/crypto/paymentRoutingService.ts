/**
 * Payment Routing Service
 *
 * The decision engine that routes incoming crypto payments to the correct handler:
 *
 * Path 1 — On-Chain (Smart Contract):
 *   Payer uses ERC-20 on the same EVM chain (Polygon).
 *   Contract handles: DEX swap (if needed), fee split, escrow, payout.
 *
 * Path 2 — Off-Chain (NOWPayments):
 *   Payer uses native BTC, ETH L1, SOL, LTC, or any non-Polygon asset.
 *   NOWPayments handles: accept → auto-convert → settle.
 *
 * Settlement Modes:
 *   'direct'  — NOWPayments sends directly to the client's configured wallet.
 *   'escrow'  — NOWPayments normalizes to USDT on Polygon → deposits into smart contract
 *               for escrow/fee-split → on release, triggers NOWPayments payout to
 *               client's preferred coin/wallet.
 *
 * @module shared-services/payments/crypto/paymentRoutingService
 */

import { pool } from '../../../src/database';
import { logger } from '../../../src/utils/logger';
import { cryptoPaymentService } from './cryptoPaymentService';
import { nowPaymentsService, type NowPaymentResponse, type CreatePaymentParams } from './nowPaymentsService';
import type { CryptoPaymentInitResult } from './types';

// =====================================================
// TYPES
// =====================================================

export type PaymentRoute = 'on_chain' | 'nowpayments';
export type SettlementMode = 'direct' | 'escrow';

export interface RoutingDecision {
  /** Which path to use */
  route: PaymentRoute;
  /** For NOWPayments: direct to client or through our contract for escrow */
  settlementMode: SettlementMode;
  /** Reason for the routing decision */
  reason: string;
  /** Whether the payer's chosen coin can be handled on-chain */
  payerCoinIsEvmNative: boolean;
  /** Whether the recipient requires NOWPayments for their settlement */
  recipientNeedsNowPayments: boolean;
}

export interface UnifiedPaymentInitParams {
  /** 'rent' | 'deal' | 'project' */
  paymentType: string;
  /** tenancy_id, deal_id, or project_id */
  entityId: string;
  /** 'organization' | 'deal_manager' | 'project_manager' */
  entityType: string;
  /** Amount in GHS (backend converts) */
  principalAmountGHS: number;
  /** Connected wallet address (0x... for EVM, bc1... for BTC, etc) */
  payerWalletAddress?: string;
  /** What the payer wants to pay with — NOWPayments ticker (e.g. 'btc', 'eth', 'ltc') or ERC20 token address */
  payerCurrency: string;
  /** Chain the payer is on ('polygon', 'bitcoin', 'ethereum', 'solana', etc.) */
  payerChain: string;
  /** PROPMETRIK-generated reference */
  paymentReference: string;
  /** Whether this payment requires escrow (milestone-based, etc.) */
  requiresEscrow: boolean;
  /** Additional context */
  metadata: Record<string, any>;
}

export interface UnifiedPaymentInitResult {
  /** Routing path used */
  route: PaymentRoute;
  /** Settlement mode */
  settlementMode: SettlementMode;

  // ── On-chain result (when route = 'on_chain') ──
  onChainResult?: CryptoPaymentInitResult;

  // ── NOWPayments result (when route = 'nowpayments') ──
  nowPaymentsResult?: {
    /** NOWPayments payment_id */
    paymentId: number;
    /** Deposit address for the payer to send crypto to */
    depositAddress: string;
    /** Amount to send (in pay_currency) */
    payAmount: number;
    /** Currency the payer sends */
    payCurrency: string;
    /** Price amount (in USD) */
    priceAmountUsd: number;
    /** What the recipient will receive (after conversion) */
    outcomeCurrency: string;
    /** Estimated outcome amount */
    estimatedOutcomeAmount?: number;
    /** Expiration estimate */
    expiresAt?: string;
    /** Status */
    status: string;
  };

  // ── Invoice URL (alternative flow — payer selects currency on NOWPayments page) ──
  invoiceUrl?: string;

  /** Our internal payment reference */
  paymentReference: string;
  /** Human-readable description of what will happen */
  description: string;
}

// =====================================================
// ROUTING SERVICE
// =====================================================

class PaymentRoutingService {

  /**
   * Determine the routing path for a payment.
   */
  async determineRoute(params: {
    payerCurrency: string;
    payerChain: string;
    recipientEntityType: string;
    recipientEntityId: string;
    requiresEscrow: boolean;
  }): Promise<RoutingDecision> {
    const { payerCurrency, payerChain, recipientEntityType, recipientEntityId, requiresEscrow } = params;

    // Check if payer's currency is an EVM token on our chain (Polygon)
    const payerIsEvmNative = await this.isPayerCurrencyOnChain(payerCurrency, payerChain);

    // Check recipient's settlement preference
    const recipientPref = await nowPaymentsService.getClientSettlementPreference(
      recipientEntityType, recipientEntityId
    );

    const recipientNeedsNowPayments = recipientPref?.useNowPayments ?? false;

    // ─── Routing Logic ───────────────────────────────

    // Case 1: Payer uses Polygon ERC-20 AND recipient wants Polygon ERC-20
    // → Fully on-chain. Contract handles swap + fees + payout.
    if (payerIsEvmNative && !recipientNeedsNowPayments) {
      return {
        route: 'on_chain',
        settlementMode: requiresEscrow ? 'escrow' : 'direct',
        reason: 'Both payer and recipient are on the same EVM chain — smart contract handles everything',
        payerCoinIsEvmNative: true,
        recipientNeedsNowPayments: false,
      };
    }

    // Case 2: Payer uses Polygon ERC-20 BUT recipient wants non-EVM settlement (BTC, ETH L1, etc.)
    // → On-chain for intake + fee split, then NOWPayments payout for final conversion.
    //   OR if escrow is required, keep in contract for escrow, trigger payout on release.
    if (payerIsEvmNative && recipientNeedsNowPayments) {
      return {
        route: 'on_chain',
        settlementMode: 'escrow', // Always escrow when we need to do a payout conversion
        reason: 'Payer is on-chain ERC-20 but recipient wants non-EVM settlement — on-chain intake + NOWPayments payout on release',
        payerCoinIsEvmNative: true,
        recipientNeedsNowPayments: true,
      };
    }

    // Case 3: Payer uses non-EVM (BTC, ETH L1, SOL, etc.) AND recipient wants the same coin
    // → NOWPayments direct (no conversion needed, just forwarding)
    if (!payerIsEvmNative && recipientPref?.configured &&
        payerCurrency.toLowerCase() === recipientPref.coinSymbol?.toLowerCase() &&
        payerChain.toLowerCase() === recipientPref.chain?.toLowerCase()) {
      return {
        route: 'nowpayments',
        settlementMode: requiresEscrow ? 'escrow' : 'direct',
        reason: 'Payer and recipient use the same non-EVM coin — NOWPayments forwards directly',
        payerCoinIsEvmNative: false,
        recipientNeedsNowPayments: true,
      };
    }

    // Case 4: Payer uses non-EVM AND recipient wants different coin OR no preference set
    // → NOWPayments intake + auto-convert.
    //   If escrow is needed, normalize to USDT on Polygon → smart contract → NOWPayments payout on release.
    //   If no escrow, NOWPayments direct settlement.
    if (!payerIsEvmNative) {
      return {
        route: 'nowpayments',
        settlementMode: requiresEscrow ? 'escrow' : 'direct',
        reason: requiresEscrow
          ? 'Non-EVM payer with escrow required — NOWPayments normalizes to USDT → contract escrow → payout on release'
          : 'Non-EVM payer — NOWPayments handles intake, conversion, and settlement',
        payerCoinIsEvmNative: false,
        recipientNeedsNowPayments: true,
      };
    }

    // Fallback: on-chain
    return {
      route: 'on_chain',
      settlementMode: requiresEscrow ? 'escrow' : 'direct',
      reason: 'Default: on-chain processing',
      payerCoinIsEvmNative: true,
      recipientNeedsNowPayments: false,
    };
  }

  /**
   * Initialize a payment through the appropriate route.
   */
  async initializePayment(params: UnifiedPaymentInitParams): Promise<UnifiedPaymentInitResult> {
    const { paymentType, entityId, entityType, payerCurrency, payerChain, payerWalletAddress, paymentReference } = params;

    // 1. Determine route
    const routing = await this.determineRoute({
      payerCurrency,
      payerChain,
      recipientEntityType: entityType,
      recipientEntityId: entityId,
      requiresEscrow: params.requiresEscrow,
    });

    logger.info('Payment routing decision', {
      reference: paymentReference,
      route: routing.route,
      settlementMode: routing.settlementMode,
      reason: routing.reason,
    });

    // 2. Execute the chosen route
    if (routing.route === 'on_chain') {
      return this.initializeOnChainPayment(params, routing);
    } else {
      return this.initializeNowPaymentsPayment(params, routing);
    }
  }

  // ─── On-Chain Path ──────────────────────────────

  /**
   * Initialize payment through the smart contract.
   */
  private async initializeOnChainPayment(
    params: UnifiedPaymentInitParams,
    routing: RoutingDecision,
  ): Promise<UnifiedPaymentInitResult> {
    if (!params.payerWalletAddress) {
      throw new Error('Wallet address required for on-chain payments');
    }

    // The payerCurrency for on-chain is an ERC-20 token address
    const tokenAddress = await this.resolveEvmTokenAddress(params.payerCurrency);

    const onChainResult = await cryptoPaymentService.initializeCryptoPayment({
      paymentType: params.paymentType,
      entityId: params.entityId,
      entityType: params.entityType,
      principalAmountGHS: params.principalAmountGHS,
      payerWalletAddress: params.payerWalletAddress,
      tokenAddress,
      paymentReference: params.paymentReference,
      metadata: params.metadata,
    });

    let description = `Pay ${onChainResult.totalAmount} ${onChainResult.tokenSymbol} on-chain`;
    if (onChainResult.swapInfo?.useSwapFunction) {
      description += ` → auto-converted to ${onChainResult.swapInfo.preferredTokenSymbol} for recipient`;
    }
    if (routing.recipientNeedsNowPayments) {
      description += ` → then converted to recipient's preferred coin via NOWPayments`;
    }

    return {
      route: 'on_chain',
      settlementMode: routing.settlementMode,
      onChainResult,
      paymentReference: params.paymentReference,
      description,
    };
  }

  // ─── NOWPayments Path ──────────────────────────────

  /**
   * Initialize payment through NOWPayments.
   */
  private async initializeNowPaymentsPayment(
    params: UnifiedPaymentInitParams,
    routing: RoutingDecision,
  ): Promise<UnifiedPaymentInitResult> {
    if (!nowPaymentsService.isConfigured()) {
      throw new Error('NOWPayments is not configured. Set NOWPAYMENTS_API_KEY environment variable.');
    }

    // Convert GHS to USD for NOWPayments pricing
    const { exchangeRateService } = await import('./exchangeRateService');
    const usdAmount = await exchangeRateService.convertGhsToUsd(params.principalAmountGHS);

    // Determine outcome based on settlement mode
    let outcomeCurrency: string | undefined;
    let outcomeAddress: string | undefined;

    if (routing.settlementMode === 'escrow') {
      // Escrow mode: normalize to USDT on Polygon → our contract wallet
      outcomeCurrency = 'usdtmatic';
      // Load platform settlement wallet from DB (falls back to env var)
      const platformSettlement = await this.getPlatformSettlementWallet();
      outcomeAddress = platformSettlement.walletAddress || undefined;
    } else {
      // Direct mode: convert to recipient's preferred coin → their wallet
      const recipientPref = await nowPaymentsService.getClientSettlementPreference(
        params.entityType, params.entityId
      );

      if (recipientPref?.configured) {
        outcomeCurrency = await nowPaymentsService.getNowPaymentsTicker(
          recipientPref.coinSymbol!, recipientPref.chain!
        ) || undefined;
        outcomeAddress = recipientPref.walletAddress;
      }
      // If no preference configured, NOWPayments uses their account default
    }

    // Resolve payer currency to NOWPayments ticker
    const payerTicker = await this.resolveNowPaymentsTicker(params.payerCurrency, params.payerChain);

    // Check minimum amount
    if (outcomeCurrency) {
      try {
        const minAmount = await nowPaymentsService.getMinimumAmount(payerTicker, outcomeCurrency);
        const estimate = await nowPaymentsService.getEstimate(usdAmount, 'usd', payerTicker);
        if (estimate.estimated_amount < minAmount.min_amount) {
          throw new Error(
            `Payment amount too low. Minimum is ${minAmount.min_amount} ${payerTicker} ` +
            `(~$${minAmount.fiat_equivalent || 'unknown'}). Your payment is ~${estimate.estimated_amount} ${payerTicker}.`
          );
        }
      } catch (err: any) {
        if (err.message.includes('Payment amount too low')) throw err;
        // Non-critical: min-amount check failed, proceed anyway
        logger.warn('Min amount check failed', { error: err.message });
      }
    }

    // Create payment
    const createParams: CreatePaymentParams = {
      priceAmount: usdAmount,
      priceCurrency: 'usd',
      payCurrency: payerTicker,
      orderId: params.paymentReference,
      orderDescription: `PROPMETRIK ${params.paymentType} payment`,
      outcomeCurrency,
      outcomeAddress,
    };

    const nowPayResult = await nowPaymentsService.createPayment(createParams);

    // Store settlement mode and recipient info
    await pool.query(`
      UPDATE nowpayments_payments SET
        settlement_mode = $1,
        recipient_entity_type = $2,
        recipient_entity_id = $3,
        payer_entity_type = $4,
        domain_record_type = $5,
        domain_record_id = $6
      WHERE payment_reference = $7
    `, [
      routing.settlementMode,
      params.entityType,
      params.entityId,
      params.metadata?.payer_type || 'tenant',
      `${params.paymentType}_payment`,
      params.metadata?.domain_record_id || params.entityId,
      params.paymentReference,
    ]);

    // Also record in payment_transactions (unified ledger)
    await this.recordPendingPaymentTransaction(params, nowPayResult, usdAmount);

    const description = routing.settlementMode === 'escrow'
      ? `Send ${nowPayResult.pay_amount} ${nowPayResult.pay_currency.toUpperCase()} to deposit address → auto-converted to USDT → held in escrow`
      : `Send ${nowPayResult.pay_amount} ${nowPayResult.pay_currency.toUpperCase()} to deposit address → auto-converted to ${(outcomeCurrency || 'account default').toUpperCase()} → sent to recipient`;

    return {
      route: 'nowpayments',
      settlementMode: routing.settlementMode,
      nowPaymentsResult: {
        paymentId: nowPayResult.payment_id,
        depositAddress: nowPayResult.pay_address,
        payAmount: nowPayResult.pay_amount,
        payCurrency: nowPayResult.pay_currency,
        priceAmountUsd: usdAmount,
        outcomeCurrency: nowPayResult.outcome_currency || outcomeCurrency || '',
        estimatedOutcomeAmount: nowPayResult.outcome_amount,
        expiresAt: nowPayResult.expiration_estimate_date,
        status: nowPayResult.payment_status,
      },
      paymentReference: params.paymentReference,
      description,
    };
  }

  // ─── Helpers ──────────────────────────────

  /**
   * Check if a payer's currency can be handled on-chain (Polygon ERC-20).
   */
  private async isPayerCurrencyOnChain(currency: string, chain: string): Promise<boolean> {
    // If the currency is a 0x address, it's an ERC-20 token address on the current chain
    if (/^0x[a-fA-F0-9]{40}$/.test(currency)) {
      return chain.toLowerCase() === 'polygon';
    }
    // Otherwise check the supported coins table
    return nowPaymentsService.isEvmNative(currency, chain);
  }

  /**
   * Resolve a currency identifier to an EVM token address.
   * Handles both token addresses (pass-through) and coin symbols (lookup).
   */
  private async resolveEvmTokenAddress(currency: string): Promise<string> {
    // Already a token address
    if (/^0x[a-fA-F0-9]{40}$/.test(currency)) return currency;

    // Map common symbols to Polygon addresses
    const symbolMap: Record<string, string> = {
      usdt: process.env.USDT_TOKEN_ADDRESS || '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      usdc: process.env.USDC_TOKEN_ADDRESS || '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      weth: process.env.WETH_TOKEN_ADDRESS || '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      wbtc: process.env.WBTC_TOKEN_ADDRESS || '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
      matic: '0x0000000000000000000000000000000000001010',  // Native MATIC
    };

    const addr = symbolMap[currency.toLowerCase()];
    if (!addr) throw new Error(`Unknown EVM token symbol: ${currency}`);
    return addr;
  }

  /**
   * Resolve a currency+chain to a NOWPayments ticker.
   */
  private async resolveNowPaymentsTicker(currency: string, chain: string): Promise<string> {
    // If it's already a NOWPayments ticker style (all lowercase, no 0x)
    if (currency.length < 20 && !/^0x/.test(currency)) {
      // Try to look up the proper ticker
      const ticker = await nowPaymentsService.getNowPaymentsTicker(currency, chain);
      if (ticker) return ticker;
      // Fallback to the currency itself (NOWPayments might accept it directly)
      return currency.toLowerCase();
    }

    // It's a token address — reverse-map to a ticker
    const addressToTicker: Record<string, string> = {
      '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': 'usdtmatic',
      '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': 'usdcmatic',
      '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619': 'eth',
      '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6': 'wbtcmatic',
    };

    const ticker = addressToTicker[currency.toLowerCase()];
    if (!ticker) throw new Error(`Cannot resolve token address ${currency} to NOWPayments ticker`);
    return ticker;
  }

  /**
   * Record a pending entry in the unified payment_transactions ledger.
   */
  private async recordPendingPaymentTransaction(
    params: UnifiedPaymentInitParams,
    nowPayResult: NowPaymentResponse,
    usdAmount: number,
  ): Promise<void> {
    try {
      await pool.query(`
        INSERT INTO payment_transactions (
          reference, payment_type,
          domain_record_id, domain_record_type,
          recipient_id, recipient_type,
          gross_amount, principal_amount, service_fee, currency,
          status, channel, provider,
          payer_wallet, crypto_currency,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 'USD', 'pending', 'crypto_nowpayments', 'nowpayments', $9, $10, $11)
        ON CONFLICT (reference) DO NOTHING
      `, [
        params.paymentReference,
        params.paymentType,
        params.metadata?.domain_record_id || params.entityId,
        `${params.paymentType}_payment`,
        params.entityId,
        params.entityType,
        usdAmount,
        usdAmount,
        params.payerWalletAddress || null,
        nowPayResult.pay_currency,
        JSON.stringify({
          ...params.metadata,
          nowpayments_id: nowPayResult.payment_id,
          pay_address: nowPayResult.pay_address,
          pay_amount: nowPayResult.pay_amount,
          pay_currency: nowPayResult.pay_currency,
          principal_ghs: params.principalAmountGHS,
        }),
      ]);
    } catch (err: any) {
      logger.warn('Failed to record pending payment transaction', { error: err.message });
    }
  }

  /**
   * Load the platform settlement wallet from DB, falling back to env var.
   */
  async getPlatformSettlementWallet(): Promise<{
    configured: boolean;
    walletAddress: string | null;
    coinSymbol?: string;
    chain?: string;
    useNowPayments?: boolean;
  }> {
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
          useNowPayments: val.useNowPayments,
        };
      }
    } catch {
      // Table might not exist yet — fall through to env var
    }

    // Fallback to env var
    const envWallet = process.env.PLATFORM_SETTLEMENT_WALLET || process.env.PROPMETRIK_PLATFORM_WALLET;
    return {
      configured: !!envWallet,
      walletAddress: envWallet || null,
    };
  }
}

// Singleton
export const paymentRoutingService = new PaymentRoutingService();
