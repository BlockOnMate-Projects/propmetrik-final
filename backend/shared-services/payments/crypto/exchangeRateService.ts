/**
 * Exchange Rate Service
 * Converts GHS amounts to token subunits for on-chain crypto payments.
 * Supports any ERC20 token decimals (6 for USDT/USDC, 8 for WBTC, 18 for WETH).
 *
 * **Data source:** Delegates to the Data Hub's `economicDataService.getExchangeRate('USD')`
 * which resolves a LIVE rate only, in this order:
 *   1. DB last-known live rate (persisted same-day from a prior live fetch)
 *   2. ForexRate-API (live)
 *   3. Yahoo Finance (live)
 *   4. **No static/hardcoded fallback** — if every source fails it THROWS.
 *
 * This is deliberate: money is converted at a real, traceable market rate or
 * not at all. A failed FX lookup blocks the charge rather than guessing a rate.
 * We reuse the same FX feed that powers valuations, dashboards, and indices.
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

/** Result of a fiat FX conversion, carrying the exact rate used so a charge can be rate-stamped. */
export interface FxConversion {
  /** Amount in GHS after conversion (2dp). */
  ghsAmount: number;
  /** Original USD amount that was converted. */
  usdAmount: number;
  /** GHS per 1 USD applied (1 when the source was already GHS). */
  rate: number;
  /** Provenance of the rate, e.g. `data-hub:ForexRate-API` (for the audit trail). */
  source: string;
  /** When the rate was fetched/locked. */
  fetchedAt: Date;
}

let cachedRate: CachedRate | null = null;

/** Per-currency live-rate cache for non-USD foreign settlement (USD keeps its own cache above). */
const foreignRateCache = new Map<string, CachedRate>();

/** Foreign currencies that can be settled to GHS through the gateway. */
const SETTLEABLE_CURRENCIES = new Set(['USD', 'GBP', 'EUR']);

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
   * Delegates to the Data Hub's economicDataService, which resolves a live rate
   * (DB last-known → ForexRate-API → Yahoo Finance) and THROWS if none is
   * available — there is no hardcoded fallback rate.
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

  /**
   * Convert a USD amount to GHS at the current LIVE market rate.
   *
   * Used to settle a USD-denominated obligation (e.g. rent on a property listed
   * in USD) through a Ghana payment gateway that can only settle GHS. The rate
   * is the same live, audited feed used everywhere else — there is **no
   * hardcoded fallback**: if no live rate is available `getGHSPerUSD()` throws,
   * and the caller must abort the charge rather than guess a rate.
   *
   * @param usdAmount - Amount owed in USD (e.g. 1000.00)
   * @returns the GHS equivalent plus the exact rate, source and timestamp used,
   *          so the charge can be rate-stamped on the ledger.
   */
  async convertUsdToGhs(usdAmount: number): Promise<FxConversion> {
    if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
      throw new Error('USD amount must be a positive number');
    }
    const { ghsPerUsd, fetchedAt, source } = await this.getGHSPerUSD();
    const ghsAmount = Math.round(usdAmount * ghsPerUsd * 100) / 100; // 2dp
    return { ghsAmount, usdAmount, rate: ghsPerUsd, source, fetchedAt };
  }

  /**
   * GHS per 1 unit of a foreign currency, from the same live Data Hub feed as USD.
   * USD reuses {@link getGHSPerUSD} (its dedicated cache + audit log); GBP/EUR are
   * cached per-currency for cacheTtlMs. THROWS (no hardcoded fallback) if no live
   * rate is available, so a charge is blocked rather than guessed.
   */
  private async getGHSPerCurrency(ccy: string): Promise<{ rate: number; fetchedAt: Date; source: string }> {
    if (ccy === 'USD') {
      const usd = await this.getGHSPerUSD();
      return { rate: usd.ghsPerUsd, fetchedAt: usd.fetchedAt, source: usd.source };
    }

    const cached = foreignRateCache.get(ccy);
    if (cached && (Date.now() - cached.fetchedAt.getTime()) < this.cacheTtlMs) {
      return { rate: cached.ghsPerUsd, fetchedAt: cached.fetchedAt, source: cached.source };
    }

    logger.info(`Fetching GHS/${ccy} exchange rate from Data Hub`);
    const exchangeRate = await economicDataService.getExchangeRate(ccy);
    const rate = Number(exchangeRate.rate);
    const now = new Date();
    const source = `data-hub:${exchangeRate.source ?? 'unknown'}`;

    if (!rate || rate <= 0 || isNaN(rate)) {
      throw new Error(`Data Hub returned invalid GHS/${ccy} rate: ${exchangeRate.rate}`);
    }

    foreignRateCache.set(ccy, { ghsPerUsd: rate, fetchedAt: now, source });
    this.logForeignRate(ccy, rate, source, now).catch((err) =>
      logger.error({ err }, 'Failed to log exchange rate to DB')
    );
    logger.info({ ccy, rate, source }, 'Foreign exchange rate fetched from Data Hub');
    return { rate, fetchedAt: now, source };
  }

  /**
   * Normalize any supported foreign-currency obligation to GHS (the gateway's
   * settlement currency). GHS passes through untouched (rate 1, no FX lookup).
   * USD/GBP/EUR convert at the LIVE Data Hub rate; any other currency throws,
   * so a misconfigured listing can never be charged at an unconverted number.
   */
  async normalizeToGhs(amount: number, currency: string): Promise<FxConversion> {
    const ccy = (currency || 'GHS').toUpperCase();
    if (ccy === 'GHS') {
      return { ghsAmount: amount, usdAmount: amount, rate: 1, source: 'none', fetchedAt: new Date() };
    }
    if (!SETTLEABLE_CURRENCIES.has(ccy)) {
      throw new Error(`Unsupported obligation currency for GHS settlement: ${ccy}`);
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Amount must be a positive number');
    }

    const { rate, fetchedAt, source } = await this.getGHSPerCurrency(ccy);
    const ghsAmount = Math.round(amount * rate * 100) / 100; // 2dp
    return { ghsAmount, usdAmount: amount, rate, source, fetchedAt };
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

  private async logForeignRate(ccy: string, rate: number, source: string, fetchedAt: Date): Promise<void> {
    await pool.query(
      `INSERT INTO exchange_rate_log (from_currency, to_currency, rate, source, fetched_at)
       VALUES ($1, $2, $3, $4, $5)`,
      ['GHS', ccy, rate, source, fetchedAt]
    );
  }
}

// Singleton export (matches project pattern)
export const exchangeRateService = new ExchangeRateService();
