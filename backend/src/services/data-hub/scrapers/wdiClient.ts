/**
 * World Bank World Development Indicators (WDI) API Client
 * 
 * Fetches economic indicators from the World Bank Data API:
 * https://api.worldbank.org/v2/
 * 
 * Features:
 * - Automatic pagination handling
 * - Redis caching for API responses
 * - Retry logic with exponential backoff
 * - Rate limiting
 * - Multiple indicator batch fetching
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import { query } from '../../../database';
import { cache } from '../../../database/redis';
import { logger } from '../../../utils/logger';
import { dataValidator } from './dataValidator';
import {
  WDIIndicatorConfig,
  WDI_INDICATORS,
  WDIDataPoint,
  SyncResult,
  SyncError,
} from './types';

// =====================================================
// CONFIGURATION
// =====================================================

const WDI_CONFIG = {
  base_url: 'https://api.worldbank.org/v2',
  country_code: 'GH', // Ghana
  timeout_ms: 30000,
  retry_attempts: 3,
  retry_delay_ms: 1000,
  rate_limit_ms: 500, // WDI allows more frequent requests
  per_page: 100,
  cache_ttl_seconds: 86400, // 24 hours - WDI data updates infrequently
};

// =====================================================
// WDI CLIENT CLASS
// =====================================================

export class WDIClient {
  private readonly client: AxiosInstance;
  private lastRequestTime: number = 0;
  private readonly indicators: WDIIndicatorConfig[];

  constructor(
    customIndicators?: WDIIndicatorConfig[],
    customConfig?: Partial<typeof WDI_CONFIG>
  ) {
    this.indicators = customIndicators || WDI_INDICATORS;
    const config = { ...WDI_CONFIG, ...customConfig };

    this.client = axios.create({
      baseURL: config.base_url,
      timeout: config.timeout_ms,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'PROPMETRIK Economic Data Bot/1.0',
      },
    });

    // Configure retry logic
    axiosRetry(this.client, {
      retries: config.retry_attempts,
      retryDelay: (retryCount) => {
        return retryCount * config.retry_delay_ms;
      },
      retryCondition: (error: AxiosError) => {
        return (
          axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          (error.response?.status ?? 0) >= 500 ||
          error.response?.status === 429 // Rate limit
        );
      },
      onRetry: (retryCount, error) => {
        logger.warn('WDI API retry attempt', {
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
    if (timeSinceLastRequest < WDI_CONFIG.rate_limit_ms) {
      await new Promise((resolve) =>
        setTimeout(resolve, WDI_CONFIG.rate_limit_ms - timeSinceLastRequest)
      );
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Get cache key for an indicator
   */
  private getCacheKey(indicatorCode: string): string {
    return `wdi:${WDI_CONFIG.country_code}:${indicatorCode}`;
  }

  /**
   * Fetch indicator data from WDI API with pagination
   */
  async fetchIndicator(
    indicatorCode: string,
    startYear?: number,
    endYear?: number
  ): Promise<WDIDataPoint[]> {
    // Check cache first
    const cacheKey = this.getCacheKey(indicatorCode);
    const cached = await cache.get<WDIDataPoint[]>(cacheKey);
    if (cached) {
      logger.debug('WDI data retrieved from cache', { indicator: indicatorCode });
      return cached;
    }

    await this.rateLimitWait();

    const defaultStartYear = startYear || 2000;
    const defaultEndYear = endYear || new Date().getFullYear();

    try {
      const url = `/country/${WDI_CONFIG.country_code}/indicator/${indicatorCode}`;
      const response = await this.client.get(url, {
        params: {
          format: 'json',
          date: `${defaultStartYear}:${defaultEndYear}`,
          per_page: WDI_CONFIG.per_page,
        },
      });

      // WDI response format: [metadata, data]
      const [metadata, data] = response.data;

      if (!data || !Array.isArray(data)) {
        logger.warn('No data returned from WDI', { indicator: indicatorCode });
        return [];
      }

      // Filter out null values
      const validData: WDIDataPoint[] = data.filter(
        (point: WDIDataPoint) => point.value !== null
      );

      // Handle pagination if needed
      if (metadata.pages > 1) {
        const allData = [...validData];
        
        for (let page = 2; page <= metadata.pages; page++) {
          await this.rateLimitWait();
          
          const pageResponse = await this.client.get(url, {
            params: {
              format: 'json',
              date: `${defaultStartYear}:${defaultEndYear}`,
              per_page: WDI_CONFIG.per_page,
              page,
            },
          });

          const [, pageData] = pageResponse.data;
          if (pageData && Array.isArray(pageData)) {
            const validPageData = pageData.filter(
              (point: WDIDataPoint) => point.value !== null
            );
            allData.push(...validPageData);
          }
        }

        // Cache the result
        await cache.set(cacheKey, allData, WDI_CONFIG.cache_ttl_seconds);
        return allData;
      }

      // Cache the result
      await cache.set(cacheKey, validData, WDI_CONFIG.cache_ttl_seconds);
      return validData;
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.error('Failed to fetch WDI indicator', {
        indicator: indicatorCode,
        status: axiosError.response?.status,
        error: axiosError.message,
      });
      throw new Error(`Failed to fetch WDI indicator ${indicatorCode}: ${axiosError.message}`);
    }
  }

  /**
   * Get latest value for an indicator
   */
  async getLatestValue(indicatorCode: string): Promise<{
    value: number | null;
    year: number | null;
  }> {
    try {
      const data = await this.fetchIndicator(
        indicatorCode,
        new Date().getFullYear() - 5,
        new Date().getFullYear()
      );

      if (data.length === 0) {
        return { value: null, year: null };
      }

      // Sort by date descending
      const sorted = data.sort((a, b) => parseInt(b.date) - parseInt(a.date));
      const latest = sorted[0];

      return {
        value: latest.value,
        year: parseInt(latest.date),
      };
    } catch (error) {
      logger.error('Failed to get latest WDI value', { indicator: indicatorCode, error });
      return { value: null, year: null };
    }
  }

  /**
   * Get previous value for change calculation
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
   * Save indicator data to database
   */
  private async saveIndicator(
    config: WDIIndicatorConfig,
    dataPoint: WDIDataPoint
  ): Promise<boolean> {
    // WDI annual data - use December 31 as effective date
    const effectiveDate = new Date(`${dataPoint.date}-12-31`);

    // Get previous value
    const previousValue = await this.getPreviousValue(config.map_to, effectiveDate);

    // Validate data
    const validation = dataValidator.validate(config.map_to, dataPoint.value!, previousValue);
    if (!validation.is_valid) {
      logger.warn('WDI indicator failed validation', {
        indicator: config.code,
        value: dataPoint.value,
        errors: validation.errors,
      });
      return false;
    }

    // Calculate change percentage
    let changePercentage: number | null = null;
    if (previousValue !== null && previousValue !== 0) {
      changePercentage = ((dataPoint.value! - previousValue) / previousValue) * 100;
    }

    try {
      await query(
        `INSERT INTO economic_indicators (
          id, indicator_type, indicator_name, value, previous_value,
          change_percentage, effective_date, period_type, source_name,
          source_url, source_reference, unit, metadata, created_at, updated_at
        ) VALUES (
          uuid_generate_v4(), $1, $2, $3, $4, $5, $6, 'annual',
          'World Bank WDI', 'https://data.worldbank.org', $7, $8, $9, NOW(), NOW()
        )
        ON CONFLICT (indicator_type, effective_date) 
        DO UPDATE SET
          value = EXCLUDED.value,
          previous_value = EXCLUDED.previous_value,
          change_percentage = EXCLUDED.change_percentage,
          source_reference = EXCLUDED.source_reference,
          updated_at = NOW()
        WHERE economic_indicators.source_name = 'World Bank WDI'`,
        [
          config.map_to,
          config.name,
          dataPoint.value,
          previousValue,
          changePercentage,
          effectiveDate,
          config.code,
          config.unit,
          JSON.stringify({
            wdi_indicator_code: config.code,
            synced_at: new Date().toISOString(),
            validation_warnings: validation.warnings,
          }),
        ]
      );
      return true;
    } catch (error) {
      logger.error('Failed to save WDI indicator', {
        indicator: config.code,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Sync all configured indicators
   */
  async syncAll(): Promise<SyncResult> {
    const startedAt = new Date();
    const errors: SyncError[] = [];
    let recordsFetched = 0;
    let recordsSaved = 0;
    let recordsFailed = 0;

    logger.info('Starting WDI full sync', { indicators: this.indicators.length });

    for (const config of this.indicators) {
      try {
        logger.info('Fetching WDI indicator', { code: config.code, name: config.name });
        
        const data = await this.fetchIndicator(config.code);
        recordsFetched += data.length;

        logger.info('Processing WDI indicator data', { 
          code: config.code, 
          records: data.length 
        });

        for (const dataPoint of data) {
          try {
            const saved = await this.saveIndicator(config, dataPoint);
            if (saved) {
              recordsSaved++;
            } else {
              recordsFailed++;
            }
          } catch (error) {
            recordsFailed++;
            errors.push({
              indicator: config.name,
              code: 'SAVE_FAILED',
              message: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date(),
            });
          }
        }
      } catch (error) {
        errors.push({
          indicator: config.name,
          code: 'FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
        });
      }
    }

    const result: SyncResult = {
      source: 'World Bank WDI',
      status: recordsFailed === 0 ? 'success' : recordsSaved > 0 ? 'partial' : 'failed',
      started_at: startedAt,
      completed_at: new Date(),
      records_fetched: recordsFetched,
      records_saved: recordsSaved,
      records_failed: recordsFailed,
      errors,
      metadata: {
        indicators_synced: this.indicators.length,
        country: WDI_CONFIG.country_code,
      },
    };

    logger.info('WDI sync complete', {
      status: result.status,
      fetched: recordsFetched,
      saved: recordsSaved,
      failed: recordsFailed,
    });

    return result;
  }

  /**
   * Sync only the latest available data (last 3 years)
   */
  async syncLatest(): Promise<SyncResult> {
    const currentYear = new Date().getFullYear();
    const startedAt = new Date();
    const errors: SyncError[] = [];
    let recordsFetched = 0;
    let recordsSaved = 0;
    let recordsFailed = 0;

    logger.info('Starting WDI latest sync', { years: '3 most recent' });

    for (const config of this.indicators) {
      try {
        const data = await this.fetchIndicator(config.code, currentYear - 3, currentYear);
        recordsFetched += data.length;

        for (const dataPoint of data) {
          try {
            const saved = await this.saveIndicator(config, dataPoint);
            if (saved) {
              recordsSaved++;
            } else {
              recordsFailed++;
            }
          } catch (error) {
            recordsFailed++;
            errors.push({
              indicator: config.name,
              code: 'SAVE_FAILED',
              message: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date(),
            });
          }
        }
      } catch (error) {
        errors.push({
          indicator: config.name,
          code: 'FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
        });
      }
    }

    return {
      source: 'World Bank WDI',
      status: recordsFailed === 0 ? 'success' : recordsSaved > 0 ? 'partial' : 'failed',
      started_at: startedAt,
      completed_at: new Date(),
      records_fetched: recordsFetched,
      records_saved: recordsSaved,
      records_failed: recordsFailed,
      errors,
      metadata: {
        indicators_synced: this.indicators.length,
        sync_type: 'latest',
        year_range: `${currentYear - 3}-${currentYear}`,
      },
    };
  }

  /**
   * Clear cache for all indicators
   */
  async clearCache(): Promise<void> {
    for (const config of this.indicators) {
      const cacheKey = this.getCacheKey(config.code);
      await cache.del(cacheKey);
    }
    logger.info('WDI cache cleared');
  }

  /**
   * Get indicator configuration
   */
  getIndicatorConfigs(): WDIIndicatorConfig[] {
    return [...this.indicators];
  }
}

// Export singleton instance
export const wdiClient = new WDIClient();
