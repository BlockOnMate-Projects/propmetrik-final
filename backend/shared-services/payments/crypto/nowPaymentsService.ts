/**
 * NOWPayments API Service
 *
 * Core integration with the NOWPayments crypto payment processor.
 * Handles payment creation, status polling, IPN verification, and payouts.
 *
 * NOWPayments is used as the off-chain asset normalization layer:
 * - Accepts 200+ cryptocurrencies from payers
 * - Auto-converts to the recipient's preferred settlement asset
 * - Forwards settlement to the configured wallet address
 *
 * @module shared-services/payments/crypto/nowPaymentsService
 */

import crypto from 'crypto';
import { pool } from '../../../src/database';
import { logger } from '../../../src/utils/logger';

// =====================================================
// TYPES
// =====================================================

export interface NowPaymentsConfig {
  apiKey: string;
  ipnSecretKey: string;
  /** 'https://api.nowpayments.io/v1' for production, sandbox URL for testing */
  apiBaseUrl: string;
  /** Base URL for IPN callbacks (e.g. 'https://api.propmetrik.com') */
  callbackBaseUrl: string;
  /** Whether to use sandbox mode */
  sandbox: boolean;
}

export interface CreatePaymentParams {
  /** Amount in USD (or other fiat) */
  priceAmount: number;
  /** Fiat denomination ('usd') */
  priceCurrency: string;
  /** Crypto currency the payer wants to pay with (e.g. 'btc', 'eth', 'ltc') */
  payCurrency: string;
  /** Our internal payment reference */
  orderId: string;
  /** Description */
  orderDescription?: string;
  /** IPN callback URL override */
  ipnCallbackUrl?: string;
  /** URL to redirect payer after payment (invoice flow) */
  successUrl?: string;
  /** URL to redirect on cancel */
  cancelUrl?: string;
  /** If provided, subsequent payments for partial orders */
  purchaseId?: string;
  /** Outcome currency (what the payment converts to) — overrides account default */
  outcomeCurrency?: string;
  /** Outcome wallet address — where converted funds go */
  outcomeAddress?: string;
  /** Fixed-rate payment — locks the exchange rate */
  isFixedRate?: boolean;
}

export interface NowPaymentResponse {
  payment_id: number;
  invoice_id?: number;
  payment_status: NowPaymentStatus;
  pay_address: string;
  pay_amount: number;
  pay_currency: string;
  price_amount: number;
  price_currency: string;
  order_id: string;
  order_description?: string;
  purchase_id?: string;
  actually_paid: number;
  outcome_amount?: number;
  outcome_currency?: string;
  created_at: string;
  updated_at: string;
  expiration_estimate_date?: string;
}

export type NowPaymentStatus =
  | 'waiting'
  | 'confirming'
  | 'confirmed'
  | 'sending'
  | 'partially_paid'
  | 'finished'
  | 'failed'
  | 'refunded'
  | 'expired';

export interface CreateInvoiceParams {
  priceAmount: number;
  priceCurrency: string;
  orderId: string;
  orderDescription?: string;
  successUrl?: string;
  cancelUrl?: string;
  outcomeCurrency?: string;
  outcomeAddress?: string;
  isFixedRate?: boolean;
}

export interface NowInvoiceResponse {
  id: string;
  token_id: string;
  invoice_url: string;
  order_id: string;
  order_description?: string;
  price_amount: number;
  price_currency: string;
  created_at: string;
  updated_at: string;
}

export interface EstimateResult {
  currency_from: string;
  currency_to: string;
  amount_from: number;
  estimated_amount: number;
}

export interface MinAmountResult {
  currency_from: string;
  currency_to: string;
  min_amount: number;
  fiat_equivalent?: number;
}

export interface AvailableCurrency {
  currency: string;
  min_amount: number;
  max_amount: number;
  network?: string;
  name?: string;
}

export interface NowPayoutParams {
  /** Withdraw address */
  address: string;
  /** Currency to send */
  currency: string;
  /** Amount to send in the currency */
  amount: number;
  /** Optional: unique idempotency key */
  ipn_callback_url?: string;
  /** Optional: extra_id for MEMO-based chains */
  extra_id?: string;
}

export interface NowPayoutResponse {
  id: string;
  status: 'WAITING' | 'PROCESSING' | 'FINISHED' | 'FAILED' | 'REJECTED';
  address: string;
  currency: string;
  amount: number;
  hash?: string;
  created_at: string;
}

export interface IpnPayload {
  payment_id: number;
  invoice_id?: number;
  payment_status: NowPaymentStatus;
  pay_address: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  actually_paid: number;
  pay_currency: string;
  order_id: string;
  order_description?: string;
  purchase_id?: string;
  outcome_amount?: number;
  outcome_currency?: string;
  created_at: string;
  updated_at: string;
}

export interface SupportedSettlementCoin {
  id: number;
  coin_symbol: string;
  coin_name: string;
  chain: string;
  nowpayments_ticker: string;
  address_regex: string | null;
  is_evm_native: boolean;
  is_enabled: boolean;
  min_settlement_usd: number;
}

// =====================================================
// SERVICE
// =====================================================

class NowPaymentsService {
  private config: NowPaymentsConfig | null = null;
  private currencyCache: AvailableCurrency[] = [];
  private currencyCacheExpiry = 0;
  private readonly CACHE_TTL_MS = 3600000; // 1 hour

  // ─── Configuration ──────────────────────────────

  /**
   * Load config from environment variables.
   */
  loadConfig(): NowPaymentsConfig | null {
    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    if (!apiKey) return null;

    const sandbox = process.env.NOWPAYMENTS_SANDBOX === 'true';
    this.config = {
      apiKey,
      ipnSecretKey: process.env.NOWPAYMENTS_IPN_SECRET || '',
      apiBaseUrl: sandbox
        ? 'https://api-sandbox.nowpayments.io/v1'
        : 'https://api.nowpayments.io/v1',
      callbackBaseUrl: process.env.NOWPAYMENTS_CALLBACK_URL || process.env.API_BASE_URL || '',
      sandbox,
    };
    return this.config;
  }

  isConfigured(): boolean {
    if (!this.config) this.loadConfig();
    return !!this.config?.apiKey;
  }

  getConfig(): NowPaymentsConfig | null {
    if (!this.config) this.loadConfig();
    return this.config;
  }

  // ─── HTTP Helpers ──────────────────────────────

  private async request<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    body?: Record<string, any>,
  ): Promise<T> {
    if (!this.config) throw new Error('NOWPayments not configured');

    const url = `${this.config.apiBaseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'x-api-key': this.config.apiKey,
      'Content-Type': 'application/json',
    };

    const fetchOpts: RequestInit = { method, headers };
    if (body && method === 'POST') {
      fetchOpts.body = JSON.stringify(body);
    }

    logger.debug('NOWPayments API request', { method, endpoint });

    const response = await fetch(url, fetchOpts);
    const data = await response.json() as any;

    if (!response.ok) {
      const errMsg = data?.message || data?.statusCode || response.statusText;
      logger.error('NOWPayments API error', { endpoint, status: response.status, error: errMsg });
      throw new Error(`NOWPayments API error (${response.status}): ${errMsg}`);
    }

    return data as T;
  }

  // ─── API Methods ──────────────────────────────

  /**
   * Check if NOWPayments API is available.
   */
  async getStatus(): Promise<{ message: string }> {
    return this.request('GET', '/status');
  }

  /**
   * Get list of available payment currencies.
   */
  async getAvailableCurrencies(): Promise<AvailableCurrency[]> {
    if (this.currencyCache.length > 0 && Date.now() < this.currencyCacheExpiry) {
      return this.currencyCache;
    }
    const result = await this.request<{ currencies: AvailableCurrency[] }>('GET', '/currencies');
    this.currencyCache = result.currencies || [];
    this.currencyCacheExpiry = Date.now() + this.CACHE_TTL_MS;
    return this.currencyCache;
  }

  /**
   * Get the available payment currencies as simple ticker list.
   */
  async getAvailableCurrencyTickers(): Promise<string[]> {
    const result = await this.request<{ currencies: AvailableCurrency[] }>('GET', '/currencies?fixed_rate=true');
    return (result.currencies || []).map(c => c.currency);
  }

  /**
   * Get minimum payment amount for a currency pair.
   */
  async getMinimumAmount(currencyFrom: string, currencyTo: string): Promise<MinAmountResult> {
    return this.request('GET', `/min-amount?currency_from=${currencyFrom}&currency_to=${currencyTo}`);
  }

  /**
   * Get estimated conversion amount.
   */
  async getEstimate(amount: number, currencyFrom: string, currencyTo: string): Promise<EstimateResult> {
    return this.request('GET',
      `/estimate?amount=${amount}&currency_from=${currencyFrom}&currency_to=${currencyTo}`
    );
  }

  /**
   * Create a payment. Returns deposit address and payment details.
   */
  async createPayment(params: CreatePaymentParams): Promise<NowPaymentResponse> {
    const body: Record<string, any> = {
      price_amount: params.priceAmount,
      price_currency: params.priceCurrency,
      pay_currency: params.payCurrency,
      order_id: params.orderId,
      ipn_callback_url: params.ipnCallbackUrl ||
        `${this.config!.callbackBaseUrl}/api/v1/webhooks/nowpayments/ipn`,
    };

    if (params.orderDescription) body.order_description = params.orderDescription;
    if (params.purchaseId) body.purchase_id = params.purchaseId;
    if (params.outcomeCurrency) body.payout_currency = params.outcomeCurrency;
    if (params.outcomeAddress) body.payout_address = params.outcomeAddress;
    if (params.isFixedRate) body.is_fixed_rate = true;

    const result = await this.request<NowPaymentResponse>('POST', '/payment', body);

    // Record in DB
    await this.recordPaymentCreated(params, result);

    return result;
  }

  /**
   * Create an invoice (hosted checkout page).
   * User is redirected to NOWPayments page and can select their payment currency.
   */
  async createInvoice(params: CreateInvoiceParams): Promise<NowInvoiceResponse> {
    const body: Record<string, any> = {
      price_amount: params.priceAmount,
      price_currency: params.priceCurrency,
      order_id: params.orderId,
      ipn_callback_url: `${this.config!.callbackBaseUrl}/api/v1/webhooks/nowpayments/ipn`,
    };

    if (params.orderDescription) body.order_description = params.orderDescription;
    if (params.successUrl) body.success_url = params.successUrl;
    if (params.cancelUrl) body.cancel_url = params.cancelUrl;
    if (params.outcomeCurrency) body.payout_currency = params.outcomeCurrency;
    if (params.outcomeAddress) body.payout_address = params.outcomeAddress;
    if (params.isFixedRate) body.is_fixed_rate = true;

    return this.request<NowInvoiceResponse>('POST', '/invoice', body);
  }

  /**
   * Get payment status by NOWPayments payment_id.
   */
  async getPaymentStatus(paymentId: number): Promise<NowPaymentResponse> {
    return this.request('GET', `/payment/${paymentId}`);
  }

  /**
   * List payments with filters.
   */
  async listPayments(params?: {
    limit?: number;
    page?: number;
    sortBy?: string;
    orderBy?: 'asc' | 'desc';
    dateFrom?: string;
    dateTo?: string;
  }): Promise<{ data: NowPaymentResponse[]; total: number; }> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.page) qs.set('page', String(params.page));
    if (params?.sortBy) qs.set('sortBy', String(params.sortBy));
    if (params?.orderBy) qs.set('orderBy', String(params.orderBy));
    if (params?.dateFrom) qs.set('dateFrom', params.dateFrom);
    if (params?.dateTo) qs.set('dateTo', params.dateTo);

    const qsStr = qs.toString() ? `?${qs.toString()}` : '';
    return this.request('GET', `/payment/${qsStr}`);
  }

  // ─── Payout Methods ──────────────────────────────

  /**
   * Create a payout (send funds to a wallet).
   * Used in the escrow release flow: contract releases stablecoin → backend triggers
   * NOWPayments payout to convert and send to the client's preferred coin/wallet.
   */
  async createPayout(params: NowPayoutParams): Promise<NowPayoutResponse> {
    // Payouts use a different base URL and auth mechanism
    const body: Record<string, any> = {
      address: params.address,
      currency: params.currency,
      amount: params.amount,
    };
    if (params.ipn_callback_url) body.ipn_callback_url = params.ipn_callback_url;
    if (params.extra_id) body.extra_id = params.extra_id;

    // Wrap in withdrawals array as per NOWPayments Payout API
    const payoutBody = {
      withdrawals: [body],
    };

    return this.request<NowPayoutResponse>('POST', '/payout', payoutBody);
  }

  /**
   * Check the status of a previously created payout.
   * Falls back to IPN callbacks as the primary mechanism, but this provides
   * a polling fallback for payouts that might have missed their IPN.
   */
  async getPayoutStatus(payoutId: number): Promise<NowPayoutResponse> {
    return this.request<NowPayoutResponse>('GET', `/payout/${payoutId}`);
  }

  // ─── IPN (Webhook) Verification ──────────────────────────────

  /**
   * Verify an IPN callback signature.
   * NOWPayments signs callbacks with HMAC-SHA512 using your IPN secret.
   */
  verifyIpnSignature(payload: Record<string, any>, signature: string): boolean {
    if (!this.config?.ipnSecretKey) {
      logger.warn('NOWPayments IPN secret not configured, skipping verification');
      return false;
    }

    const hmac = crypto.createHmac('sha512', this.config.ipnSecretKey);
    // Sort keys alphabetically and stringify
    const sortedPayload = JSON.stringify(payload, Object.keys(payload).sort());
    hmac.update(sortedPayload);
    const expectedSignature = hmac.digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  /**
   * Process an IPN callback from NOWPayments.
   * Updates our DB records and triggers downstream actions (escrow deposit, etc.)
   */
  async processIpnCallback(payload: IpnPayload): Promise<{
    action: 'none' | 'escrow_deposit' | 'completed' | 'failed';
    paymentReference: string;
  }> {
    const { payment_id, payment_status, order_id, actually_paid, outcome_amount, outcome_currency } = payload;

    logger.info('Processing NOWPayments IPN', {
      paymentId: payment_id,
      status: payment_status,
      orderId: order_id,
      actuallyPaid: actually_paid,
    });

    // Update our payment record
    await pool.query(`
      UPDATE nowpayments_payments SET
        status = $1,
        actually_paid = $2,
        outcome_amount = COALESCE($3, outcome_amount),
        outcome_currency = COALESCE($4, outcome_currency),
        nowpayments_id = COALESCE($5, nowpayments_id),
        finished_at = CASE WHEN $1 IN ('finished', 'failed', 'expired', 'refunded') THEN NOW() ELSE finished_at END
      WHERE payment_reference = $6
    `, [
      payment_status,
      actually_paid || 0,
      outcome_amount,
      outcome_currency,
      payment_id,
      order_id,
    ]);

    // Determine action based on status and settlement mode
    const paymentRow = await pool.query(
      `SELECT * FROM nowpayments_payments WHERE payment_reference = $1`,
      [order_id]
    );

    if (paymentRow.rows.length === 0) {
      logger.warn('NOWPayments IPN for unknown payment', { orderId: order_id });
      return { action: 'none', paymentReference: order_id };
    }

    const payment = paymentRow.rows[0];

    if (payment_status === 'finished') {
      if (payment.settlement_mode === 'escrow') {
        // For escrow: NOWPayments converted to USDT on Polygon.
        // Now we need to deposit it into our smart contract.
        return { action: 'escrow_deposit', paymentReference: order_id };
      } else {
        // Direct settlement: NOWPayments sent directly to client wallet. Mark completed.
        await pool.query(
          `UPDATE nowpayments_payments SET settled_at = NOW() WHERE payment_reference = $1`,
          [order_id]
        );

        // Also update payment_transactions
        await pool.query(`
          UPDATE payment_transactions SET
            status = 'success',
            channel = 'crypto_nowpayments',
            metadata = metadata || jsonb_build_object(
              'nowpayments_id', $1,
              'pay_currency', $2,
              'outcome_currency', $3,
              'outcome_amount', $4
            )
          WHERE reference = $5 AND status = 'pending'
        `, [payment_id, payload.pay_currency, outcome_currency, outcome_amount, order_id]);

        return { action: 'completed', paymentReference: order_id };
      }
    }

    if (['failed', 'expired', 'refunded'].includes(payment_status)) {
      // Update payment_transactions to failed
      await pool.query(`
        UPDATE payment_transactions SET
          status = 'failed',
          metadata = metadata || jsonb_build_object('nowpayments_failure_status', $1)
        WHERE reference = $2 AND status = 'pending'
      `, [payment_status, order_id]);

      return { action: 'failed', paymentReference: order_id };
    }

    // waiting, confirming, confirmed, sending — still in progress
    return { action: 'none', paymentReference: order_id };
  }

  // ─── Settlement Coin Management ──────────────────────────────

  /**
   * Get all supported settlement coins.
   */
  async getSupportedSettlementCoins(enabledOnly = true): Promise<SupportedSettlementCoin[]> {
    const whereClause = enabledOnly ? 'WHERE is_enabled = TRUE' : '';
    const result = await pool.query(
      `SELECT * FROM supported_settlement_coins ${whereClause} ORDER BY coin_name`
    );
    return result.rows;
  }

  /**
   * Look up the NOWPayments ticker for a given coin+chain combo.
   */
  async getNowPaymentsTicker(coinSymbol: string, chain: string): Promise<string | null> {
    const result = await pool.query(
      `SELECT nowpayments_ticker FROM supported_settlement_coins
       WHERE coin_symbol = $1 AND chain = $2 AND is_enabled = TRUE`,
      [coinSymbol.toLowerCase(), chain.toLowerCase()]
    );
    return result.rows[0]?.nowpayments_ticker || null;
  }

  /**
   * Validate a wallet address against the expected format for a coin+chain.
   */
  async validateSettlementAddress(coinSymbol: string, chain: string, address: string): Promise<boolean> {
    const result = await pool.query(
      `SELECT address_regex FROM supported_settlement_coins
       WHERE coin_symbol = $1 AND chain = $2`,
      [coinSymbol.toLowerCase(), chain.toLowerCase()]
    );
    if (!result.rows[0]?.address_regex) return true; // No regex = accept anything
    const regex = new RegExp(result.rows[0].address_regex);
    return regex.test(address);
  }

  /**
   * Check if a coin+chain can be handled on-chain (no NOWPayments needed for intake).
   */
  async isEvmNative(coinSymbol: string, chain: string): Promise<boolean> {
    const result = await pool.query(
      `SELECT is_evm_native FROM supported_settlement_coins
       WHERE coin_symbol = $1 AND chain = $2 AND is_enabled = TRUE`,
      [coinSymbol.toLowerCase(), chain.toLowerCase()]
    );
    return result.rows[0]?.is_evm_native ?? false;
  }

  // ─── Client Settlement Configuration ──────────────────────────────

  /**
   * Configure a client's preferred settlement coin and wallet.
   */
  async setClientSettlementPreference(params: {
    entityType: string;
    entityId: string;
    coinSymbol: string;
    chain: string;
    walletAddress: string;
  }): Promise<{ success: boolean; useNowPayments: boolean }> {
    const { entityType, entityId, coinSymbol, chain, walletAddress } = params;

    // Validate coin+chain is supported
    const coinResult = await pool.query(
      `SELECT * FROM supported_settlement_coins WHERE coin_symbol = $1 AND chain = $2 AND is_enabled = TRUE`,
      [coinSymbol.toLowerCase(), chain.toLowerCase()]
    );
    if (coinResult.rows.length === 0) {
      throw new Error(`Unsupported settlement coin: ${coinSymbol} on ${chain}`);
    }

    const coin = coinResult.rows[0] as SupportedSettlementCoin;

    // Validate address format
    if (coin.address_regex) {
      const regex = new RegExp(coin.address_regex);
      if (!regex.test(walletAddress)) {
        throw new Error(`Invalid ${coin.coin_name} address format for ${chain}`);
      }
    }

    // Determine if NOWPayments is needed:
    // - EVM native tokens on Polygon can be handled by smart contract directly
    // - Everything else requires NOWPayments for intake or payout
    const useNowPayments = !coin.is_evm_native;

    await pool.query(`
      UPDATE payment_accounts SET
        crypto_preferred_settlement_coin = $1,
        crypto_preferred_settlement_chain = $2,
        crypto_settlement_wallet_address = $3,
        crypto_use_nowpayments_settlement = $4,
        crypto_settlement_configured_at = NOW(),
        updated_at = NOW()
      WHERE entity_type = $5 AND entity_id = $6
    `, [
      coinSymbol.toLowerCase(),
      chain.toLowerCase(),
      walletAddress,
      useNowPayments,
      entityType,
      entityId,
    ]);

    logger.info('Client settlement preference configured', {
      entityType, entityId,
      coin: coinSymbol,
      chain,
      useNowPayments,
    });

    return { success: true, useNowPayments };
  }

  /**
   * Get a client's settlement preference.
   */
  async getClientSettlementPreference(entityType: string, entityId: string): Promise<{
    configured: boolean;
    coinSymbol?: string;
    chain?: string;
    walletAddress?: string;
    useNowPayments?: boolean;
    configuredAt?: Date;
  } | null> {
    const result = await pool.query(
      `SELECT crypto_preferred_settlement_coin, crypto_preferred_settlement_chain,
              crypto_settlement_wallet_address, crypto_use_nowpayments_settlement,
              crypto_settlement_configured_at
       FROM payment_accounts
       WHERE entity_type = $1 AND entity_id = $2 AND is_active = TRUE`,
      [entityType, entityId]
    );

    if (result.rows.length === 0 || !result.rows[0].crypto_preferred_settlement_coin) {
      return { configured: false };
    }

    const row = result.rows[0];
    return {
      configured: true,
      coinSymbol: row.crypto_preferred_settlement_coin,
      chain: row.crypto_preferred_settlement_chain,
      walletAddress: row.crypto_settlement_wallet_address,
      useNowPayments: row.crypto_use_nowpayments_settlement,
      configuredAt: row.crypto_settlement_configured_at,
    };
  }

  // ─── DB Persistence ──────────────────────────────

  /**
   * Record a newly created NOWPayments payment in our DB.
   */
  private async recordPaymentCreated(
    params: CreatePaymentParams,
    response: NowPaymentResponse,
  ): Promise<void> {
    await pool.query(`
      INSERT INTO nowpayments_payments (
        payment_reference, nowpayments_id, purchase_id,
        pay_currency, pay_amount, pay_address,
        price_currency, price_amount,
        outcome_currency, outcome_address,
        settlement_mode, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (nowpayments_id) DO UPDATE SET
        status = $12, pay_address = $6, updated_at = NOW()
    `, [
      params.orderId,
      response.payment_id,
      response.purchase_id || null,
      response.pay_currency,
      response.pay_amount,
      response.pay_address,
      params.priceCurrency,
      params.priceAmount,
      params.outcomeCurrency || response.outcome_currency || null,
      params.outcomeAddress || null,
      'direct', // Default; will be updated by routing service
      response.payment_status,
    ]);
  }

  /**
   * Record a payout in our DB.
   */
  async recordPayout(params: {
    paymentReference: string;
    nowpaymentsPaymentId?: string;
    sourceCurrency: string;
    sourceAmount: number;
    destinationCurrency: string;
    destinationAddress: string;
    recipientEntityType: string;
    recipientEntityId: string;
    nowpaymentsPayoutId?: number;
  }): Promise<string> {
    const result = await pool.query(`
      INSERT INTO nowpayments_payouts (
        payment_reference, source_currency, source_amount,
        destination_currency, destination_address,
        recipient_entity_type, recipient_entity_id,
        nowpayments_payout_id, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
      RETURNING id
    `, [
      params.paymentReference,
      params.sourceCurrency,
      params.sourceAmount,
      params.destinationCurrency,
      params.destinationAddress,
      params.recipientEntityType,
      params.recipientEntityId,
      params.nowpaymentsPayoutId || null,
    ]);
    return result.rows[0].id;
  }

  /**
   * Get payment summary — counts by status.
   */
  async getPaymentSummary(): Promise<Record<string, number>> {
    const result = await pool.query(`
      SELECT status, COUNT(*)::int AS count FROM nowpayments_payments GROUP BY status
    `);
    const summary: Record<string, number> = {};
    for (const row of result.rows) {
      summary[row.status] = row.count;
    }
    return summary;
  }

  /**
   * Get recent payments with pagination.
   */
  async getPaymentHistory(params: {
    limit?: number;
    offset?: number;
    status?: string;
    entityType?: string;
    entityId?: string;
  }): Promise<{ payments: any[]; total: number }> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (params.status) {
      conditions.push(`status = $${paramIdx++}`);
      values.push(params.status);
    }
    if (params.entityType && params.entityId) {
      conditions.push(`recipient_entity_type = $${paramIdx++}`);
      values.push(params.entityType);
      conditions.push(`recipient_entity_id = $${paramIdx++}`);
      values.push(params.entityId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = params.limit || 50;
    const offset = params.offset || 0;

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM nowpayments_payments ${where}`, values
    );

    const dataResult = await pool.query(
      `SELECT * FROM nowpayments_payments ${where}
       ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...values, limit, offset]
    );

    return {
      payments: dataResult.rows,
      total: countResult.rows[0]?.total || 0,
    };
  }
}

// Singleton
export const nowPaymentsService = new NowPaymentsService();
