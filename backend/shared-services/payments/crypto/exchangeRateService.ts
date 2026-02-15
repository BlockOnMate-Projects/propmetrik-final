/**
 * Exchange Rate Service
 * Converts GHS amounts to token subunits for on-chain crypto payments.
 * Supports any ERC20 token decimals (6 for USDT/USDC, 8 for WBTC, 18 for WETH).
 *
 * **Data source:** Delegates to the Data Hub's `economicDataService.getExchangeRate('USD')`
 * which already implements a robust fallback chain:
 *   1. DB cache (daily persistence from prior live fetches)
 *   2. ForexRate-API (live)
 *   3. Yahoo Finance (live)
 *   4. Static fallback (15.50 GHS/USD)
 *
 * This avoids needing a separate API key — we reuse the same FX feed that
 * powers valuations, dashboards, and affordability indices.
 *
 * Rates are cached in-memory for 5 minutes and logged to the
 * `exchange_rate_log` table for crypto payment audit.
 *
 * @module shared-services/payments/crypto/exchangeRateService
 */

import { pool } from '../../../src/database';
import { logger } from '../../../src/utils/logger';
import { ExchangeRateResult, loadCryptoConfig } from './types';
import { economicDataService } from '../../../src/services/data-hub/economicDataService';

// Default decimals (USDT/USDC = 6, but callers can override)
const DEFAULT_DECIMALS = 6;

// =====================================================
// Internal cache
// =====================================================

interface CachedRate {
  ghsPerUsd: number;
  fetchedAt: Date;
  source: string;
}

let cachedRate: CachedRate | null = null;

// =====================================================
// Exchange Rate Service Class
// =====================================================

class ExchangeRateService {
  private cacheTtlMs: number;

  constructor() {
    const config = loadCryptoConfig();
    this.cacheTtlMs = config?.exchangeRateCacheTtlMs ?? 300_000; // 5 min default
  }

  /**
   * Refresh config from env (e.g. after hot-reload).
   */
  reloadConfig(): void {
    const config = loadCryptoConfig();
    this.cacheTtlMs = config?.exchangeRateCacheTtlMs ?? 300_000;
    cachedRate = null;
  }

  /**
   * Get current GHS per USD rate.
   * Delegates to the Data Hub's economicDataService, which uses
   * ForexRate-API → Yahoo Finance → static fallback.
   */
  async getGHSPerUSD(): Promise<CachedRate> {
    // Return cached if still valid
    if (cachedRate && (Date.now() - cachedRate.fetchedAt.getTime()) < this.cacheTtlMs) {
      return cachedRate;
    }

    logger.info('Fetching GHS/USD exchange rate from Data Hub');

    const exchangeRate = await economicDataService.getExchangeRate('USD');
    const ghsPerUsd = Number(exchangeRate.rate);
    const now = new Date();
    const source = `data-hub:${exchangeRate.source ?? 'unknown'}`;

    if (!ghsPerUsd || ghsPerUsd <= 0 || isNaN(ghsPerUsd)) {
      throw new Error(`Data Hub returned invalid GHS/USD rate: ${exchangeRate.rate}`);
    }

    // Update cache
    cachedRate = { ghsPerUsd, fetchedAt: now, source };

    // Log to audit table (fire-and-forget, don't block the payment)
    this.logRate(ghsPerUsd, source, now).catch((err) =>
      logger.error({ err }, 'Failed to log exchange rate to DB')
    );

    logger.info({ ghsPerUsd, source }, 'Exchange rate fetched from Data Hub');
    return cachedRate;
  }

  /**
   * Convert a GHS amount to a USD-pegged token amount, scaled to the token's native decimals.
   * For stablecoins (USDT, USDC): 1 USD ≈ 1 token.
   * For non-stablecoin tokens (WETH, WBTC): this still converts to USD equivalent —
   * the frontend must handle market-price conversion for volatile tokens.
   *
   * @param ghsAmount - Amount in Ghana Cedis (e.g. 5000.00)
   * @param tokenDecimals - Token's decimal places (6 for USDT/USDC, 8 for WBTC, 18 for WETH)
   * @returns ExchangeRateResult with human-readable amount and subunits scaled to tokenDecimals
   */
  async convertGHStoToken(ghsAmount: number, tokenDecimals: number = DEFAULT_DECIMALS): Promise<ExchangeRateResult> {
    if (ghsAmount <= 0) {
      throw new Error('GHS amount must be positive');
    }

    const { ghsPerUsd, fetchedAt, source } = await this.getGHSPerUSD();

    // GHS ÷ (GHS per 1 USD) = USD amount ≈ token amount (for stablecoins)
    const tokenAmount = ghsAmount / ghsPerUsd;

    // Round to token's decimal precision
    const multiplier = 10 ** tokenDecimals;
    const tokenRounded = Math.round(tokenAmount * multiplier) / multiplier;

    // Convert to subunits (BigInt for contract calls)
    const tokenSubunits = BigInt(Math.round(tokenAmount * multiplier));

    return {
      tokenAmount: tokenRounded,
      tokenSubunits,
      rate: ghsPerUsd,
      rateTimestamp: fetchedAt,
      source,
    };
  }

  /**
   * Clear the in-memory rate cache.
   */
  clearCache(): void {
    cachedRate = null;
    logger.info('Exchange rate cache cleared');
  }

  /**
   * Convert a GHS amount to USD.
   * Simple division: GHS ÷ (GHS per 1 USD) = USD.
   */
  async convertGhsToUsd(ghsAmount: number): Promise<number> {
    if (ghsAmount <= 0) throw new Error('GHS amount must be positive');
    const { ghsPerUsd } = await this.getGHSPerUSD();
    return Math.round((ghsAmount / ghsPerUsd) * 100) / 100; // Round to 2 decimal places
  }

  // ===================================================
  // Private
  // ===================================================

  private async logRate(ghsPerUsd: number, source: string, fetchedAt: Date): Promise<void> {
    await pool.query(
      `INSERT INTO exchange_rate_log (from_currency, to_currency, rate, source, fetched_at)
       VALUES ($1, $2, $3, $4, $5)`,
      ['GHS', 'USD', ghsPerUsd, source, fetchedAt]
    );
  }
}

// Singleton export (matches project pattern)
export const exchangeRateService = new ExchangeRateService();
