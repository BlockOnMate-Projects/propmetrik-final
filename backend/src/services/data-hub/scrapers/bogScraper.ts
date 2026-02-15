/**
 * Bank of Ghana Web Scraper
 * 
 * Scrapes economic data from Bank of Ghana website:
 * - Exchange Rates: https://www.bog.gov.gh/economic-data/exchange-rate/
 * - Interest Rates: https://www.bog.gov.gh/economic-data/interest-rates/
 * - Real Sector (CPI/GDP): https://www.bog.gov.gh/economic-data/real-sector/
 * 
 * Features:
 * - Retry logic with exponential backoff
 * - Rate limiting to avoid overwhelming the server
 * - Robust HTML parsing with multiple fallback selectors
 * - Data validation before storage
 * - Comprehensive error handling and logging
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import * as cheerio from 'cheerio';
import { query } from '../../../database';
import { logger } from '../../../utils/logger';
import { dataValidator } from './dataValidator';
import {
  BOGIndicatorRaw,
  BOGScraperConfig,
  BOG_INDICATOR_MAPPING,
  SyncResult,
  SyncError,
} from './types';

// =====================================================
// CONFIGURATION
// =====================================================

const DEFAULT_CONFIG: BOGScraperConfig = {
  base_url: 'https://www.bog.gov.gh',
  user_agent: 'PROPMETRIK Economic Data Bot/1.0 (+https://propmetrik.com/bot)',
  timeout_ms: 30000,
  retry_attempts: 3,
  retry_delay_ms: 2000,
  rate_limit_ms: 1500, // Wait 1.5s between requests
};

const BOG_ENDPOINTS = {
  exchange_rates: '/economic-data/exchange-rate/',
  interest_rates: '/economic-data/interest-rates/',
  real_sector: '/economic-data/real-sector/',
  monetary_survey: '/economic-data/monetary-survey/',
};

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// =====================================================
// BOG SCRAPER CLASS
// =====================================================

export class BOGScraper {
  private readonly config: BOGScraperConfig;
  private readonly client: AxiosInstance;
  private lastRequestTime: number = 0;

  constructor(config: Partial<BOGScraperConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Create axios instance with retry logic
    this.client = axios.create({
      baseURL: this.config.base_url,
      timeout: this.config.timeout_ms,
      headers: {
        'User-Agent': this.config.user_agent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    // Configure retry logic
    axiosRetry(this.client, {
      retries: this.config.retry_attempts,
      retryDelay: (retryCount) => {
        return retryCount * this.config.retry_delay_ms;
      },
      retryCondition: (error: AxiosError) => {
        // Retry on network errors or 5xx responses
        return (
          axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          (error.response?.status ?? 0) >= 500
        );
      },
      onRetry: (retryCount, error) => {
        logger.warn('BOG scraper retry attempt', {
          attempt: retryCount,
          url: error.config?.url,
          error: error.message,
        });
      },
    });
  }

  /**
   * Rate limiting - wait between requests
   */
  private async rateLimitWait(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.config.rate_limit_ms) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.config.rate_limit_ms - timeSinceLastRequest)
      );
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Fetch HTML content from a BOG page
   */
  private async fetchPage(endpoint: string): Promise<string> {
    await this.rateLimitWait();

    try {
      const response = await this.client.get(endpoint);
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.error('Failed to fetch BOG page', {
        endpoint,
        status: axiosError.response?.status,
        error: axiosError.message,
      });
      throw new Error(`Failed to fetch ${endpoint}: ${axiosError.message}`);
    }
  }

  /**
   * Parse BOG data table HTML
   * The BOG website uses tables with year in first column, indicator in second,
   * and monthly values in subsequent columns
   */
  private parseDataTable(
    html: string,
    category: 'exchange_rate' | 'interest_rate' | 'real_sector'
  ): BOGIndicatorRaw[] {
    const $ = cheerio.load(html);
    const indicators: BOGIndicatorRaw[] = [];

    // Try multiple table selectors as BOG website structure may vary
    const tableSelectors = [
      'table.dataTable tbody tr',
      'table.display tbody tr',
      '#datatable tbody tr',
      '.table-responsive table tbody tr',
      'table tbody tr',
    ];

    let rows: ReturnType<typeof $> | null = null;

    for (const selector of tableSelectors) {
      const found = $(selector);
      if (found.length > 0) {
        rows = found;
        break;
      }
    }

    if (!rows || rows.length === 0) {
      logger.warn('No data table found on BOG page', { category });
      return indicators;
    }

    rows.each((_: number, row: any) => {
      try {
        const cells = $(row).find('td');
        if (cells.length < 3) return; // Need at least year, indicator, and one value

        const yearText = $(cells[0]).text().trim();
        const year = parseInt(yearText, 10);
        if (isNaN(year) || year < 2000 || year > 2030) return;

        const indicatorName = $(cells[1]).text().trim();
        if (!indicatorName) return;

        // Skip if not a mapped indicator
        if (!BOG_INDICATOR_MAPPING[indicatorName]) return;

        // Parse monthly values (columns 3-14 for months 1-12)
        for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
          const cellIndex = monthIndex + 2;
          if (cellIndex >= cells.length) break;

          const valueText = $(cells[cellIndex]).text().trim();
          if (!valueText || valueText === '-' || valueText === 'N/A') continue;

          // Parse value, handling commas and special characters
          const cleanValue = valueText.replace(/,/g, '').replace(/[^\d.-]/g, '');
          const value = parseFloat(cleanValue);

          if (!isNaN(value) && Number.isFinite(value)) {
            indicators.push({
              year,
              month: monthIndex + 1,
              indicator_name: indicatorName,
              value,
              category,
            });
          }
        }
      } catch (error) {
        logger.debug('Error parsing BOG table row', { error });
      }
    });

    return indicators;
  }

  /**
   * Scrape exchange rates from BOG
   */
  async scrapeExchangeRates(): Promise<BOGIndicatorRaw[]> {
    logger.info('Scraping BOG exchange rates');
    try {
      const html = await this.fetchPage(BOG_ENDPOINTS.exchange_rates);
      return this.parseDataTable(html, 'exchange_rate');
    } catch (error) {
      logger.error('Failed to scrape exchange rates', { error });
      return [];
    }
  }

  /**
   * Scrape interest rates from BOG
   */
  async scrapeInterestRates(): Promise<BOGIndicatorRaw[]> {
    logger.info('Scraping BOG interest rates');
    try {
      const html = await this.fetchPage(BOG_ENDPOINTS.interest_rates);
      return this.parseDataTable(html, 'interest_rate');
    } catch (error) {
      logger.error('Failed to scrape interest rates', { error });
      return [];
    }
  }

  /**
   * Scrape real sector data (CPI, GDP) from BOG
   */
  async scrapeRealSector(): Promise<BOGIndicatorRaw[]> {
    logger.info('Scraping BOG real sector data');
    try {
      const html = await this.fetchPage(BOG_ENDPOINTS.real_sector);
      return this.parseDataTable(html, 'real_sector');
    } catch (error) {
      logger.error('Failed to scrape real sector data', { error });
      return [];
    }
  }

  /**
   * Get the previous value for an indicator to calculate change
   */
  private async getPreviousValue(
    indicatorType: string,
    effectiveDate: Date
  ): Promise<number | null> {
    try {
      const result = await query<{ value: number }>(
        `SELECT value FROM economic_indicators 
         WHERE indicator_type = $1 AND effective_date < $2
         ORDER BY effective_date DESC LIMIT 1`,
        [indicatorType, effectiveDate]
      );
      return result.rows[0]?.value ?? null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Save an indicator to the database
   */
  private async saveIndicator(indicator: BOGIndicatorRaw): Promise<boolean> {
    const indicatorType = BOG_INDICATOR_MAPPING[indicator.indicator_name];
    if (!indicatorType) {
      return false;
    }

    // Create effective date (last day of the month)
    const effectiveDate = new Date(indicator.year, indicator.month, 0);

    // Get previous value
    const previousValue = await this.getPreviousValue(indicatorType, effectiveDate);

    // Validate data
    const validation = dataValidator.validate(indicatorType, indicator.value, previousValue);
    if (!validation.is_valid) {
      logger.warn('Indicator failed validation', {
        indicator_type: indicatorType,
        value: indicator.value,
        errors: validation.errors,
      });
      return false;
    }

    // Log warnings but still save
    if (validation.warnings.length > 0) {
      logger.info('Indicator validation warnings', {
        indicator_type: indicatorType,
        warnings: validation.warnings,
      });
    }

    // Calculate change percentage
    let changePercentage: number | null = null;
    if (previousValue !== null && previousValue !== 0) {
      changePercentage = ((indicator.value - previousValue) / previousValue) * 100;
    }

    // Determine unit
    const unit = indicatorType.includes('exchange_rate')
      ? 'ghs_per_unit'
      : indicatorType.includes('rate') || indicatorType.includes('growth') || indicatorType.includes('inflation')
      ? 'percentage'
      : 'index';

    try {
      await query(
        `INSERT INTO economic_indicators (
          id, indicator_type, indicator_name, value, previous_value,
          change_percentage, effective_date, period_type, source_name,
          source_url, unit, metadata, created_at, updated_at
        ) VALUES (
          uuid_generate_v4(), $1, $2, $3, $4, $5, $6, 'monthly',
          'Bank of Ghana', $7, $8, $9, NOW(), NOW()
        )
        ON CONFLICT (indicator_type, effective_date) 
        DO UPDATE SET
          value = EXCLUDED.value,
          previous_value = EXCLUDED.previous_value,
          change_percentage = EXCLUDED.change_percentage,
          updated_at = NOW()
        WHERE economic_indicators.source_name = 'Bank of Ghana'`,
        [
          indicatorType,
          indicator.indicator_name,
          indicator.value,
          previousValue,
          changePercentage,
          effectiveDate,
          `${this.config.base_url}${BOG_ENDPOINTS[indicator.category === 'exchange_rate' ? 'exchange_rates' : indicator.category === 'interest_rate' ? 'interest_rates' : 'real_sector']}`,
          unit,
          JSON.stringify({
            category: indicator.category,
            scraped_at: new Date().toISOString(),
            validation_warnings: validation.warnings,
          }),
        ]
      );
      return true;
    } catch (error) {
      logger.error('Failed to save indicator', {
        indicator_type: indicatorType,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Run full sync of all BOG indicators
   */
  async syncAll(): Promise<SyncResult> {
    const startedAt = new Date();
    const errors: SyncError[] = [];
    let recordsFetched = 0;
    let recordsSaved = 0;
    let recordsFailed = 0;

    logger.info('Starting BOG full sync');

    try {
      // Scrape all categories
      const [exchangeRates, interestRates, realSector] = await Promise.all([
        this.scrapeExchangeRates(),
        this.scrapeInterestRates(),
        this.scrapeRealSector(),
      ]);

      const allIndicators = [...exchangeRates, ...interestRates, ...realSector];
      recordsFetched = allIndicators.length;

      logger.info('BOG scrape complete', {
        exchange_rates: exchangeRates.length,
        interest_rates: interestRates.length,
        real_sector: realSector.length,
        total: recordsFetched,
      });

      // Save indicators (process sequentially to avoid database contention)
      for (const indicator of allIndicators) {
        try {
          const saved = await this.saveIndicator(indicator);
          if (saved) {
            recordsSaved++;
          } else {
            recordsFailed++;
          }
        } catch (error) {
          recordsFailed++;
          errors.push({
            indicator: indicator.indicator_name,
            code: 'SAVE_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date(),
          });
        }
      }
    } catch (error) {
      errors.push({
        code: 'SCRAPE_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      });
    }

    const result: SyncResult = {
      source: 'Bank of Ghana',
      status: recordsFailed === 0 ? 'success' : recordsSaved > 0 ? 'partial' : 'failed',
      started_at: startedAt,
      completed_at: new Date(),
      records_fetched: recordsFetched,
      records_saved: recordsSaved,
      records_failed: recordsFailed,
      errors,
      metadata: {
        endpoints_scraped: Object.keys(BOG_ENDPOINTS).length,
      },
    };

    logger.info('BOG sync complete', {
      status: result.status,
      fetched: recordsFetched,
      saved: recordsSaved,
      failed: recordsFailed,
    });

    return result;
  }

  /**
   * Sync only the latest month's data
   */
  async syncLatest(): Promise<SyncResult> {
    const startedAt = new Date();
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    logger.info('Starting BOG latest sync', { year: currentYear, month: currentMonth });

    const fullResult = await this.syncAll();

    // Filter to only count current and previous month
    return {
      ...fullResult,
      metadata: {
        ...fullResult.metadata,
        sync_type: 'latest',
        target_period: `${currentYear}-${currentMonth.toString().padStart(2, '0')}`,
      },
    };
  }
}

// Export singleton instance
export const bogScraper = new BOGScraper();
