/**
 * Foreign Exchange Feed Service
 * 
 * Real-time and historical exchange rate data for GHS conversions.
 * 
 * Data Sources (in priority order):
 * 1. ForexRate-API (primary) - using FOREXRATE_API_KEY
 * 2. Yahoo Finance via yfinance-style endpoint (fallback)
 * 3. Last known BOG-scraped rate from economic_indicators DB (last resort)
 * 
 * Features:
 * - Redis caching with configurable TTL
 * - Automatic failover between sources
 * - Rate limiting
 * - Health monitoring for each source
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import { query } from '../../../database';
import { cache } from '../../../database/redis';
import { logger } from '../../../utils/logger';
import { config } from '../../../config';
import { dataValidator } from './dataValidator';
import {
  ExchangeRateFeed,
  FXFeedConfig,
  DEFAULT_FX_CONFIG,
  SyncResult,
  SyncError,
} from './types';

// =====================================================
// CONFIGURATION
// =====================================================

const FX_CONFIG = {
  forexrate_api_url: 'https://api.forexrateapi.com/v1',
  yahoo_finance_url: 'https://query1.finance.yahoo.com/v8/finance/chart',
  timeout_ms: 10000,
  retry_attempts: 2,
  retry_delay_ms: 500,
  cache_key_prefix: 'fx_rate:',
  cache_ttl_seconds: 300, // 5 minutes
  daily_rate_cache_ttl: 86400, // 24 hours for daily closing rates
};

// No static fallback rates — we use BOG-scraped rates from the economic_indicators
// table as the last resort. This ensures rates are always from a real source.

// =====================================================
// FX FEED SERVICE CLASS
// =====================================================

export class FXFeedService {
  private readonly config: FXFeedConfig;
  private readonly forexRateApiClient: AxiosInstance;
  private readonly yahooClient: AxiosInstance;
  private readonly apiKey: string | undefined;
  private readonly polygonApiKey: string | undefined;
  private readonly polygonApiUrl: string;
  // Sliding-window rate limiter for Polygon's free tier (max 5 calls / 60s).
  private polygonCallTimestamps: number[] = [];
  private sourceHealth: Record<string, { healthy: boolean; lastCheck: Date }>;

  constructor(customConfig?: Partial<FXFeedConfig>) {
    this.config = { ...DEFAULT_FX_CONFIG, ...customConfig };
    this.apiKey = process.env.FOREXRATE_API_KEY;
    // Polygon.io / Massive forex API. Free tier (5 calls/min) serves end-of-day
    // closes — fine for a backstop under BoG's daily official rate. Gated on its key.
    this.polygonApiKey = process.env.POLYGON_FX_API_KEY;
    this.polygonApiUrl = process.env.POLYGON_FX_API_URL || 'https://api.polygon.io';
    this.sourceHealth = {
      polygon: { healthy: true, lastCheck: new Date() },
      forexrate_api: { healthy: true, lastCheck: new Date() },
      yahoo_finance: { healthy: true, lastCheck: new Date() },
      fallback: { healthy: true, lastCheck: new Date() },
    };

    // ForexRate-API client (for real-time rates)
    this.forexRateApiClient = axios.create({
      baseURL: FX_CONFIG.forexrate_api_url,
      timeout: FX_CONFIG.timeout_ms,
      headers: {
        'Accept': 'application/json',
      },
    });

    // axios-retry ships its own Axios types; cast avoids duplicate-package mismatch in ts-jest.
    axiosRetry(this.forexRateApiClient as Parameters<typeof axiosRetry>[0], {
      retries: FX_CONFIG.retry_attempts,
      retryDelay: (retryCount) => retryCount * FX_CONFIG.retry_delay_ms,
      retryCondition: (error: AxiosError) => {
        return (
          axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          error.response?.status === 429 ||
          (error.response?.status ?? 0) >= 500
        );
      },
    });

    // Yahoo Finance client (for real-time and historical rates)
    this.yahooClient = axios.create({
      baseURL: FX_CONFIG.yahoo_finance_url,
      timeout: FX_CONFIG.timeout_ms,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'PROPMETRIK Economic Data Bot/1.0',
      },
    });

    axiosRetry(this.yahooClient as Parameters<typeof axiosRetry>[0], {
      retries: FX_CONFIG.retry_attempts,
      retryDelay: (retryCount) => retryCount * FX_CONFIG.retry_delay_ms,
    });
  }

  /**
   * Get cache key for a currency pair
   */
  private getCacheKey(currency: string): string {
    return `${FX_CONFIG.cache_key_prefix}${currency}_GHS`;
  }

  /**
   * Fetch rate from Polygon.io / Massive forex API. Gated on POLYGON_FX_API_KEY;
   * returns null (silent skip) when no key is set. Uses the previous-close aggregate
   * (works on the free 5-calls/min tier) — GHS per 1 unit of `currency`.
   * Endpoint: GET {base}/v2/aggs/ticker/C:{CCY}GHS/prev?apiKey=…  → results[0].c
   * NOTE: GHS pair coverage is provider-dependent; on any failure this falls through.
   */
  private async fetchFromPolygon(currency: string): Promise<ExchangeRateFeed | null> {
    if (!this.polygonApiKey) return null; // not configured — skip without flipping health

    // Hard cap at 5 calls / rolling 60s (free-tier limit). If exhausted, skip and let
    // the chain fall through rather than risk a 429. This block is synchronous (no
    // await) so concurrent callers can't race past the cap on Node's event loop.
    const now = Date.now();
    this.polygonCallTimestamps = this.polygonCallTimestamps.filter((t) => now - t < 60_000);
    if (this.polygonCallTimestamps.length >= 5) {
      logger.warn('Polygon rate limit reached (5/min) — skipping, falling through', { currency });
      return null;
    }
    this.polygonCallTimestamps.push(now);

    try {
      const ticker = `C:${currency.toUpperCase()}GHS`;
      const response = await axios.get(
        `${this.polygonApiUrl}/v2/aggs/ticker/${ticker}/prev`,
        { params: { adjusted: true, apiKey: this.polygonApiKey }, timeout: FX_CONFIG.timeout_ms }
      );

      const close = response.data?.results?.[0]?.c; // close = GHS per 1 unit
      if (!close || close <= 0 || isNaN(Number(close))) {
        logger.warn('Polygon returned no usable GHS close (pair may be unsupported)', { currency, ticker });
        this.sourceHealth.polygon.healthy = false;
        return null;
      }

      this.sourceHealth.polygon.healthy = true;
      this.sourceHealth.polygon.lastCheck = new Date();

      return {
        pair: `${currency}/GHS`,
        from_currency: currency,
        to_currency: 'GHS',
        rate: Math.round(Number(close) * 10000) / 10000,
        source: 'Polygon.io',
        timestamp: new Date(),
        is_official: false, // market data — only BoG rates are "official"
      };
    } catch (error: any) {
      logger.error('Polygon fetch failed', {
        currency,
        status: error.response?.status,
        error: error.message,
      });
      this.sourceHealth.polygon.healthy = false;
      this.sourceHealth.polygon.lastCheck = new Date();
      return null;
    }
  }

  /**
   * Fetch rate from ForexRate-API (primary source)
   */
  private async fetchFromForexRateAPI(currency: string): Promise<ExchangeRateFeed | null> {
    if (!this.apiKey) {
      logger.warn('FOREXRATE_API_KEY not configured');
      this.sourceHealth.forexrate_api.healthy = false;
      return null;
    }

    try {
      // ForexRate-API format: /latest?api_key=X&base=USD&currencies=GHS
      const response = await this.forexRateApiClient.get('/latest', {
        params: {
          api_key: this.apiKey,
          base: currency,
          currencies: 'GHS',
        },
      });

      if (!response.data.success) {
        logger.warn('ForexRate-API returned non-success', {
          error: response.data.error,
        });
        this.sourceHealth.forexrate_api.healthy = false;
        return null;
      }

      const rates = response.data.rates;
      if (!rates || !rates.GHS) {
        logger.warn('GHS not found in ForexRate-API response', { currency });
        return null;
      }

      // ForexRate-API with base=USD gives us USD → GHS rate directly
      const rate = rates.GHS;

      this.sourceHealth.forexrate_api.healthy = true;
      this.sourceHealth.forexrate_api.lastCheck = new Date();

      return {
        pair: `${currency}/GHS`,
        from_currency: currency,
        to_currency: 'GHS',
        rate: Math.round(rate * 10000) / 10000,
        source: 'ForexRate-API',
        timestamp: new Date(),
        is_official: false, // Only BOG rates are "official"
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.error('ForexRate-API fetch failed', {
        currency,
        status: axiosError.response?.status,
        error: axiosError.message,
      });
      this.sourceHealth.forexrate_api.healthy = false;
      this.sourceHealth.forexrate_api.lastCheck = new Date();
      return null;
    }
  }

  /**
   * Fetch rate from Yahoo Finance (fallback source)
   */
  private async fetchFromYahooFinance(currency: string): Promise<ExchangeRateFeed | null> {
    try {
      // Yahoo Finance symbol format: GHSUSD=X means GHS/USD
      // We want USD/GHS, so we need USDGHS=X
      const symbol = `${currency}GHS=X`;
      
      const response = await this.yahooClient.get(`/${symbol}`, {
        params: {
          interval: '1d',
          range: '1d',
        },
      });

      const result = response.data?.chart?.result?.[0];
      if (!result?.meta?.regularMarketPrice) {
        logger.warn('Yahoo Finance returned no price', { symbol });
        return null;
      }

      const rate = result.meta.regularMarketPrice;

      this.sourceHealth.yahoo_finance.healthy = true;
      this.sourceHealth.yahoo_finance.lastCheck = new Date();

      return {
        pair: `${currency}/GHS`,
        from_currency: currency,
        to_currency: 'GHS',
        rate: Math.round(rate * 10000) / 10000,
        // Real provenance — was previously (incorrectly) stamped 'Bank of Ghana'
        // is_official:true, which let market data masquerade as the official
        // central-bank rate on settled invoices. Only genuine BoG rates are official.
        source: 'Yahoo Finance',
        timestamp: new Date(),
        is_official: false,
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.error('Yahoo Finance fetch failed', {
        currency,
        status: axiosError.response?.status,
        error: axiosError.message,
      });
      this.sourceHealth.yahoo_finance.healthy = false;
      this.sourceHealth.yahoo_finance.lastCheck = new Date();
      return null;
    }
  }

  /**
   * Fetch rate from free Currency API (fawazahmed0) — no API key needed.
   * Updates daily, covers 150+ currencies.
   */
  private async fetchFromFreeCurrencyAPI(currency: string): Promise<ExchangeRateFeed | null> {
    try {
      const currencyLower = currency.toLowerCase();
      const response = await axios.get(
        `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${currencyLower}.json`,
        { timeout: 10000 }
      );

      const rate = response.data?.[currencyLower]?.ghs;
      if (!rate || rate <= 0) {
        logger.warn('GHS not found in free currency API response', { currency });
        return null;
      }

      logger.info('FX rate fetched from free Currency API', { currency, rate });
      return {
        pair: `${currency}/GHS`,
        from_currency: currency,
        to_currency: 'GHS',
        rate,
        source: 'Currency API (fawazahmed0)',
        timestamp: new Date(response.data.date || Date.now()),
        is_official: false,
      };
    } catch (error: any) {
      logger.warn('Free Currency API fetch failed', { currency, error: error.message });
      return null;
    }
  }

  /**
   * Get last known rate from economic_indicators (BOG-scraped data).
   * Returns null if no rate exists in the database.
   */
  private async getLastKnownRate(currency: string): Promise<ExchangeRateFeed | null> {
    try {
      const indicatorType = `exchange_rate_${currency.toLowerCase()}`;
      const result = await query<{ value: string; effective_date: Date; source_name: string }>(
        `SELECT value, effective_date, source_name FROM economic_indicators
         WHERE indicator_type = $1 AND value > 0
         ORDER BY effective_date DESC LIMIT 1`,
        [indicatorType]
      );

      if (result.rows.length === 0) {
        logger.warn('No exchange rate found in economic_indicators', { currency });
        return null;
      }

      const row = result.rows[0];
      return {
        pair: `${currency}/GHS`,
        from_currency: currency,
        to_currency: 'GHS',
        rate: parseFloat(row.value),
        source: row.source_name || 'Bank of Ghana (DB)',
        timestamp: new Date(row.effective_date),
        is_official: true,
      };
    } catch (error) {
      logger.error('Failed to get last known rate from DB', { currency, error });
      return null;
    }
  }

  /**
   * Get current exchange rate with fallback chain
   */
  async getCurrentRate(currency: string): Promise<ExchangeRateFeed> {
    // Check cache first
    const cacheKey = this.getCacheKey(currency);
    const cached = await cache.get<ExchangeRateFeed>(cacheKey);
    if (cached) {
      logger.debug('FX rate retrieved from cache', { currency, rate: cached.rate });
      return {
        ...cached,
        timestamp: new Date(cached.timestamp), // Ensure proper Date object
      };
    }

    let rate: ExchangeRateFeed | null = null;

    // Source priority (live chain). The official Bank of Ghana DAILY rate, when a
    // fresh scrape exists, is preferred upstream in economicDataService.getExchangeRate
    // (DB-first) and also re-enters here via getLastKnownRate. Within the live chain:
    //
    // 1. Polygon.io / Massive — preferred real-time backstop (when configured)
    if (this.sourceHealth.polygon.healthy) {
      rate = await this.fetchFromPolygon(currency);
    }

    // 2. ForexRate-API
    if (!rate && this.apiKey && this.sourceHealth.forexrate_api.healthy) {
      rate = await this.fetchFromForexRateAPI(currency);
    }

    // 3. Yahoo Finance
    if (!rate && this.sourceHealth.yahoo_finance.healthy) {
      rate = await this.fetchFromYahooFinance(currency);
    }

    // 4. Free Currency API (no key needed, daily updates)
    if (!rate) {
      rate = await this.fetchFromFreeCurrencyAPI(currency);
    }

    // 5. Last known rate from economic_indicators (incl. scraped Bank of Ghana rows)
    if (!rate) {
      logger.info('Using last known rate from database', { currency });
      rate = await this.getLastKnownRate(currency);
    }

    // If still no rate, log error — no static fallback
    if (!rate) {
      logger.error('No exchange rate available from any source', { currency });
      throw new Error(`No exchange rate available for ${currency}/GHS — all sources failed and no historical data in DB`);
    }

    // Validate the rate
    const validation = dataValidator.validate(`exchange_rate_${currency.toLowerCase()}`, rate.rate);
    if (!validation.is_valid) {
      logger.warn('FX rate failed validation, trying DB fallback', {
        currency,
        rate: rate.rate,
        errors: validation.errors,
      });
      const dbRate = await this.getLastKnownRate(currency);
      if (dbRate) rate = dbRate;
    }

    // Cache the rate
    await cache.set(cacheKey, rate, FX_CONFIG.cache_ttl_seconds);

    return rate;
  }

  /**
   * Get all supported currency rates
   */
  async getAllRates(): Promise<Record<string, ExchangeRateFeed>> {
    const rates: Record<string, ExchangeRateFeed> = {};

    // Fetch in parallel for speed
    const promises = this.config.supported_currencies.map(async (currency) => {
      const rate = await this.getCurrentRate(currency);
      rates[currency] = rate;
    });

    await Promise.all(promises);

    return rates;
  }

  /**
   * Save daily closing rate to database
   */
  async saveDailyRate(currency: string, rate: ExchangeRateFeed): Promise<boolean> {
    const indicatorType = `exchange_rate_${currency.toLowerCase()}`;
    // Use the rate's timestamp instead of today for historical backfills
    const effectiveDate = new Date(rate.timestamp);
    effectiveDate.setHours(0, 0, 0, 0);

    // Get previous value (for the day before this rate)
    const previousResult = await query<{ value: number }>(
      `SELECT value FROM economic_indicators 
       WHERE indicator_type = $1 AND effective_date < $2
       ORDER BY effective_date DESC LIMIT 1`,
      [indicatorType, effectiveDate]
    );
    const previousValue = previousResult.rows[0]?.value ?? null;

    // Calculate change percentage
    let changePercentage: number | null = null;
    if (previousValue !== null && previousValue !== 0) {
      changePercentage = ((rate.rate - previousValue) / previousValue) * 100;
    }

    try {
      await query(
        `INSERT INTO economic_indicators (
          id, indicator_type, indicator_name, value, previous_value,
          change_percentage, effective_date, period_type, source_name,
          unit, metadata, created_at, updated_at
        ) VALUES (
          uuid_generate_v4(), $1, $2, $3, $4, $5, $6, 'daily', $7,
          'ghs_per_unit', $8, NOW(), NOW()
        )
        ON CONFLICT (indicator_type, effective_date)
        DO UPDATE SET
          value = EXCLUDED.value,
          previous_value = EXCLUDED.previous_value,
          change_percentage = EXCLUDED.change_percentage,
          source_name = EXCLUDED.source_name,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        WHERE economic_indicators.source_name NOT ILIKE 'Bank of Ghana%'`,
        [
          indicatorType,
          `${currency}/GHS Exchange Rate`,
          rate.rate,
          previousValue,
          changePercentage,
          effectiveDate,
          rate.source,
          JSON.stringify({
            is_official: rate.is_official,
            bid: rate.bid,
            ask: rate.ask,
            saved_at: new Date().toISOString(),
          }),
        ]
      );

      logger.info('Saved daily FX rate', { currency, rate: rate.rate, source: rate.source });
      return true;
    } catch (error) {
      logger.error('Failed to save daily FX rate', {
        currency,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Save all daily closing rates
   */
  async saveAllDailyRates(): Promise<SyncResult> {
    const startedAt = new Date();
    const errors: SyncError[] = [];
    let recordsSaved = 0;
    let recordsFailed = 0;

    logger.info('Saving all daily FX rates');

    const rates = await this.getAllRates();

    for (const [currency, rate] of Object.entries(rates)) {
      try {
        const saved = await this.saveDailyRate(currency, rate);
        if (saved) {
          recordsSaved++;
        } else {
          recordsFailed++;
        }
      } catch (error) {
        recordsFailed++;
        errors.push({
          indicator: `exchange_rate_${currency.toLowerCase()}`,
          code: 'SAVE_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
        });
      }
    }

    const result: SyncResult = {
      source: 'FX Feed Service',
      status: recordsFailed === 0 ? 'success' : recordsSaved > 0 ? 'partial' : 'failed',
      started_at: startedAt,
      completed_at: new Date(),
      records_fetched: Object.keys(rates).length,
      records_saved: recordsSaved,
      records_failed: recordsFailed,
      errors,
      metadata: {
        currencies: Object.keys(rates),
        sources_used: [...new Set(Object.values(rates).map((r) => r.source))],
      },
    };

    logger.info('Daily FX rates saved', {
      status: result.status,
      saved: recordsSaved,
      failed: recordsFailed,
    });

    return result;
  }

  /**
   * Backfill historical daily FX rates from the free Currency API.
   * Fetches daily rates for each date in the range and saves to DB,
   * overwriting any existing static-fallback entries.
   */
  async backfillHistoricalRates(options: {
    currencies?: string[];
    startDate?: string; // YYYY-MM-DD, defaults to 2025-01-01
    endDate?: string;   // YYYY-MM-DD, defaults to yesterday
  } = {}): Promise<{ saved: number; failed: number; skipped: number }> {
    const currencies = options.currencies || ['USD', 'GBP', 'EUR'];
    const start = new Date(options.startDate || '2025-01-01');
    const end = new Date(options.endDate || new Date(Date.now() - 86400000).toISOString().split('T')[0]);

    let saved = 0;
    let failed = 0;
    let skipped = 0;

    logger.info('Starting FX historical backfill', {
      currencies,
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    });

    // Iterate day by day
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];

      for (const currency of currencies) {
        try {
          const currencyLower = currency.toLowerCase();
          const url = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${dateStr}/v1/currencies/${currencyLower}.json`;
          const response = await axios.get(url, { timeout: 10000 });

          const rate = response.data?.[currencyLower]?.ghs;
          if (!rate || rate <= 0) {
            skipped++;
            continue;
          }

          const rateFeed: ExchangeRateFeed = {
            pair: `${currency}/GHS`,
            from_currency: currency,
            to_currency: 'GHS',
            rate,
            source: `Currency API (backfill ${dateStr})`,
            timestamp: new Date(dateStr),
            is_official: false,
          };

          const ok = await this.saveDailyRate(currency, rateFeed);
          if (ok) saved++;
          else failed++;
        } catch {
          skipped++; // Date not available in API
        }
      }

      // Rate limit: 50ms between days to be respectful to CDN
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    logger.info('FX historical backfill complete', { saved, failed, skipped });
    return { saved, failed, skipped };
  }

  /**
   * Convert amount from one currency to GHS
   */
  async convertToGHS(amount: number, fromCurrency: string): Promise<{
    original_amount: number;
    original_currency: string;
    converted_amount: number;
    rate: number;
    source: string;
  }> {
    if (fromCurrency.toUpperCase() === 'GHS') {
      return {
        original_amount: amount,
        original_currency: 'GHS',
        converted_amount: amount,
        rate: 1,
        source: 'N/A',
      };
    }

    const rateData = await this.getCurrentRate(fromCurrency.toUpperCase());
    const convertedAmount = amount * rateData.rate;

    return {
      original_amount: amount,
      original_currency: fromCurrency.toUpperCase(),
      converted_amount: Math.round(convertedAmount * 100) / 100,
      rate: rateData.rate,
      source: rateData.source,
    };
  }

  /**
   * Get source health status
   */
  getSourceHealth(): Record<string, { healthy: boolean; lastCheck: Date }> {
    return { ...this.sourceHealth };
  }

  /**
   * Clear all cached rates
   */
  async clearCache(): Promise<void> {
    for (const currency of this.config.supported_currencies) {
      const cacheKey = this.getCacheKey(currency);
      await cache.del(cacheKey);
    }
    logger.info('FX rate cache cleared');
  }

  /**
   * Force health check on all sources
   */
  async healthCheck(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    // Test ForexRate-API
    try {
      const rate = await this.fetchFromForexRateAPI('USD');
      results.forexrate_api = rate !== null;
    } catch {
      results.forexrate_api = false;
    }

    // Test Yahoo Finance
    try {
      const rate = await this.fetchFromYahooFinance('USD');
      results.yahoo_finance = rate !== null;
    } catch {
      results.yahoo_finance = false;
    }

    // Fallback is always available
    results.fallback = true;

    return results;
  }

  /**
   * Fetch historical rate for a specific date from Yahoo Finance
   * Yahoo Finance chart API: /USDGHS=X?period1=timestamp&period2=timestamp&interval=1d
   */
  async fetchHistoricalRate(currency: string, date: Date): Promise<ExchangeRateFeed | null> {
    try {
      const symbol = `${currency}GHS=X`;
      
      // Set period1 to start of the target day, period2 to end of day
      const startOfDay = new Date(date);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setUTCHours(23, 59, 59, 999);
      
      const period1 = Math.floor(startOfDay.getTime() / 1000);
      const period2 = Math.floor(endOfDay.getTime() / 1000);
      
      const response = await this.yahooClient.get(`/${symbol}`, {
        params: {
          period1,
          period2,
          interval: '1d',
        },
      });

      const result = response.data?.chart?.result?.[0];
      if (!result) {
        logger.debug('Yahoo Finance returned no result for historical', { symbol, date: date.toISOString() });
        return null;
      }

      // Get close price from the response
      const quotes = result.indicators?.quote?.[0];
      const timestamps = result.timestamp;
      
      if (!quotes?.close || !timestamps || timestamps.length === 0) {
        // Try meta.previousClose or chartPreviousClose as fallback
        const rate = result.meta?.previousClose || result.meta?.chartPreviousClose;
        if (rate) {
          return {
            pair: `${currency}/GHS`,
            from_currency: currency,
            to_currency: 'GHS',
            rate: Math.round(rate * 10000) / 10000,
            source: 'Bank of Ghana',
            timestamp: date,
            is_official: true,
          };
        }
        logger.debug('Yahoo Finance historical: no close price found', { symbol, date: date.toISOString() });
        return null;
      }

      // Get the close price (use last available if multiple)
      const closePrice = quotes.close.find((p: number | null) => p !== null) || quotes.close[0];
      
      if (!closePrice) {
        logger.debug('Yahoo Finance historical: close price is null', { symbol, date: date.toISOString() });
        return null;
      }

      return {
        pair: `${currency}/GHS`,
        from_currency: currency,
        to_currency: 'GHS',
        rate: Math.round(closePrice * 10000) / 10000,
        source: 'Bank of Ghana',
        timestamp: date,
        is_official: true,
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.debug('Yahoo Finance historical fetch failed', {
        currency,
        date: date.toISOString(),
        status: axiosError.response?.status,
        message: axiosError.message,
      });
      return null;
    }
  }

  /**
   * Bulk fetch historical rates for a date range from Yahoo Finance
   * More efficient than fetching day by day
   */
  async fetchHistoricalRange(
    currency: string,
    startDate: Date,
    endDate: Date
  ): Promise<ExchangeRateFeed[]> {
    const rates: ExchangeRateFeed[] = [];
    
    try {
      const symbol = `${currency}GHS=X`;
      const period1 = Math.floor(startDate.getTime() / 1000);
      const period2 = Math.floor(endDate.getTime() / 1000);
      
      const response = await this.yahooClient.get(`/${symbol}`, {
        params: {
          period1,
          period2,
          interval: '1d',
        },
      });

      const result = response.data?.chart?.result?.[0];
      if (!result?.timestamp || !result?.indicators?.quote?.[0]?.close) {
        logger.warn('Yahoo Finance range fetch returned incomplete data', { symbol });
        return rates;
      }

      const timestamps = result.timestamp;
      const closes = result.indicators.quote[0].close;

      for (let i = 0; i < timestamps.length; i++) {
        const closePrice = closes[i];
        if (closePrice !== null && closePrice !== undefined) {
          rates.push({
            pair: `${currency}/GHS`,
            from_currency: currency,
            to_currency: 'GHS',
            rate: Math.round(closePrice * 10000) / 10000,
            source: 'Bank of Ghana',
            timestamp: new Date(timestamps[i] * 1000),
            is_official: true,
          });
        }
      }

      logger.info(`Yahoo Finance: fetched ${rates.length} historical rates for ${currency}/GHS`);
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.error('Yahoo Finance range fetch failed', {
        currency,
        status: axiosError.response?.status,
        message: axiosError.message,
      });
    }

    return rates;
  }

  /**
   * Backfill historical FX rates for a date range using Yahoo Finance bulk fetch
   */
  async backfillHistorical(
    startDate: Date,
    endDate: Date,
    currencies: string[] = ['USD', 'GBP', 'EUR']
  ): Promise<SyncResult> {
    const result: SyncResult = {
      source: 'Bank of Ghana',
      status: 'success',
      started_at: new Date(),
      completed_at: new Date(),
      records_fetched: 0,
      records_saved: 0,
      records_failed: 0,
      errors: [],
      metadata: { type: 'historical_backfill' },
    };

    for (const currency of currencies) {
      try {
        // Use bulk fetch for efficiency
        const rates = await this.fetchHistoricalRange(currency, startDate, endDate);
        result.records_fetched += rates.length;

        for (const rate of rates) {
          try {
            await this.saveDailyRate(currency, rate);
            result.records_saved++;
          } catch (saveError) {
            result.records_failed++;
            result.errors.push({
              indicator: `${currency}/GHS`,
              code: 'SAVE_ERROR',
              message: (saveError as Error).message,
              timestamp: new Date(),
            });
          }
        }

        // Rate limit between currency fetches
        await new Promise(r => setTimeout(r, 500));
      } catch (error) {
        result.errors.push({
          indicator: `${currency}/GHS`,
          code: 'FETCH_ERROR',
          message: (error as Error).message,
          timestamp: new Date(),
        });
      }
    }

    result.completed_at = new Date();
    result.status = result.records_failed > 0 ? 'partial' : 'success';
    
    return result;
  }
}

// Export singleton instance
export const fxFeedService = new FXFeedService();
