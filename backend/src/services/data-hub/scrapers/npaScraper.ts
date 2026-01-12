/**
 * Fuel Price Scraper
 * 
 * Scrapes fuel prices from GlobalPetrolPrices.com (reliable source)
 * Fallback source: NPA Ghana website (often blocked)
 * Used for transport cost component in construction cost calculation
 * 
 * Data Source: https://www.globalpetrolprices.com/Ghana/
 * Update Frequency: Weekly (fuel prices change bi-weekly in Ghana)
 */

import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import * as cheerio from 'cheerio';
import { query } from '../../../database';
import { logger } from '../../../utils/logger';
import { SyncResult, SyncError } from './types';

// =====================================================
// TYPES
// =====================================================

export interface FuelPrice {
  fuel_type: 'diesel' | 'petrol' | 'lpg';
  price_ghs: number;
  effective_date: Date;
  source: string;
}

interface FuelScraperConfig {
  globalpetrolprices_url: string;
  npa_base_url: string;
  user_agent: string;
  timeout_ms: number;
  retry_attempts: number;
  retry_delay_ms: number;
}

// =====================================================
// CONFIGURATION
// =====================================================

const DEFAULT_CONFIG: FuelScraperConfig = {
  globalpetrolprices_url: 'https://www.globalpetrolprices.com/Ghana/',
  npa_base_url: 'https://npa.gov.gh',
  user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  timeout_ms: 30000,
  retry_attempts: 3,
  retry_delay_ms: 2000,
};

// =====================================================
// FUEL PRICE SCRAPER CLASS
// =====================================================

export class NPAScraper {
  private readonly config: FuelScraperConfig;
  private readonly client: AxiosInstance;

  constructor(config: Partial<FuelScraperConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.client = axios.create({
      timeout: this.config.timeout_ms,
      headers: {
        'User-Agent': this.config.user_agent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
      },
    });

    // Configure retry logic
    axiosRetry(this.client, {
      retries: this.config.retry_attempts,
      retryDelay: (retryCount) => retryCount * this.config.retry_delay_ms,
      retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          (error.response?.status ?? 0) >= 500;
      },
      onRetry: (retryCount, error) => {
        logger.warn('Fuel scraper retry attempt', {
          attempt: retryCount,
          url: error.config?.url,
          error: error.message,
        });
      },
    });
  }

  /**
   * Fetch fuel prices from GlobalPetrolPrices.com (primary source)
   */
  async fetchFromGlobalPetrolPrices(): Promise<FuelPrice[]> {
    try {
      const response = await this.client.get(this.config.globalpetrolprices_url);
      const $ = cheerio.load(response.data);
      const prices: FuelPrice[] = [];

      // GlobalPetrolPrices shows data in tables with specific patterns
      // Look for gasoline and diesel price tables
      $('table tr').each((_, row) => {
        const cells = $(row).find('td');
        const headerCell = $(row).find('th').text().toLowerCase();
        
        if (cells.length >= 2) {
          const rowText = $(cells[0]).text().toLowerCase();
          
          // Parse the price value (usually in local currency column)
          let priceText = '';
          cells.each((i, cell) => {
            const text = $(cell).text();
            // Look for numbers with decimal points
            const match = text.match(/(\d+\.?\d*)/);
            if (match && parseFloat(match[1]) > 1) {
              priceText = match[1];
            }
          });

          const price = parseFloat(priceText);
          
          if (!isNaN(price) && price > 5 && price < 50) { // Sanity check for GHS prices
            if (rowText.includes('diesel')) {
              if (!prices.find(p => p.fuel_type === 'diesel')) {
                prices.push({
                  fuel_type: 'diesel',
                  price_ghs: price,
                  effective_date: new Date(),
                  source: 'globalpetrolprices.com',
                });
              }
            } else if (rowText.includes('gasoline') || rowText.includes('petrol')) {
              if (!prices.find(p => p.fuel_type === 'petrol')) {
                prices.push({
                  fuel_type: 'petrol',
                  price_ghs: price,
                  effective_date: new Date(),
                  source: 'globalpetrolprices.com',
                });
              }
            }
          }
        }
      });

      // Also try to find prices in text content
      if (prices.length < 2) {
        const pageText = $('body').text();
        
        // Pattern: "Gasoline prices | DD.MM.YYYY | XX.XX |"
        const gasolineMatch = pageText.match(/gasoline\s*prices?\s*\|?\s*[\d.]+\s*\|?\s*([\d.]+)/i);
        const dieselMatch = pageText.match(/diesel\s*prices?\s*\|?\s*[\d.]+\s*\|?\s*([\d.]+)/i);
        
        if (gasolineMatch && !prices.find(p => p.fuel_type === 'petrol')) {
          const price = parseFloat(gasolineMatch[1]);
          if (price > 5 && price < 50) {
            prices.push({
              fuel_type: 'petrol',
              price_ghs: price,
              effective_date: new Date(),
              source: 'globalpetrolprices.com',
            });
          }
        }
        
        if (dieselMatch && !prices.find(p => p.fuel_type === 'diesel')) {
          const price = parseFloat(dieselMatch[1]);
          if (price > 5 && price < 50) {
            prices.push({
              fuel_type: 'diesel',
              price_ghs: price,
              effective_date: new Date(),
              source: 'globalpetrolprices.com',
            });
          }
        }
      }

      if (prices.length > 0) {
        logger.info('Fuel prices fetched from GlobalPetrolPrices', { 
          count: prices.length,
          prices: prices.map(p => ({ type: p.fuel_type, price: p.price_ghs }))
        });
      }

      return prices;
    } catch (error) {
      logger.warn('GlobalPetrolPrices fetch failed', { 
        error: error instanceof Error ? error.message : 'Unknown' 
      });
      return [];
    }
  }

  /**
   * Fetch fuel prices from NPA website (backup source)
   */
  async fetchFromNPA(): Promise<FuelPrice[]> {
    try {
      const urls = ['/fuel-prices', '/petroleum-prices', '/'];
      let html: string | null = null;

      for (const url of urls) {
        try {
          const response = await this.client.get(`${this.config.npa_base_url}${url}`);
          html = response.data;
          break;
        } catch (e) {
          continue;
        }
      }

      if (!html) return [];

      const $ = cheerio.load(html);
      const prices: FuelPrice[] = [];

      $('table tr').each((_, row) => {
        const cells = $(row).find('td');
        if (cells.length >= 2) {
          const fuelType = $(cells[0]).text().trim().toLowerCase();
          const priceText = $(cells[1]).text().replace(/[^0-9.]/g, '');
          const price = parseFloat(priceText);

          if (!isNaN(price) && price > 5 && price < 50) {
            let normalizedType: FuelPrice['fuel_type'] | null = null;
            
            if (fuelType.includes('diesel') || fuelType.includes('ago')) {
              normalizedType = 'diesel';
            } else if (fuelType.includes('petrol') || fuelType.includes('gasoline') || fuelType.includes('pms')) {
              normalizedType = 'petrol';
            } else if (fuelType.includes('lpg') || fuelType.includes('gas') || fuelType.includes('cooking')) {
              normalizedType = 'lpg';
            }

            if (normalizedType && !prices.find(p => p.fuel_type === normalizedType)) {
              prices.push({
                fuel_type: normalizedType,
                price_ghs: price,
                effective_date: new Date(),
                source: 'npa.gov.gh',
              });
            }
          }
        }
      });

      if (prices.length > 0) {
        logger.info('Fuel prices fetched from NPA', { count: prices.length });
      }

      return prices;
    } catch (error) {
      logger.warn('NPA fetch failed', { 
        error: error instanceof Error ? error.message : 'Unknown' 
      });
      return [];
    }
  }

  /**
   * Fetch current fuel prices - tries multiple sources
   */
  async fetchCurrentPrices(): Promise<FuelPrice[]> {
    // Try GlobalPetrolPrices first (more reliable)
    let prices = await this.fetchFromGlobalPetrolPrices();

    // If that fails, try NPA
    if (prices.length === 0) {
      prices = await this.fetchFromNPA();
    }

    if (prices.length === 0) {
      throw new Error('Failed to fetch fuel prices from all sources');
    }

    return prices;
  }

  /**
   * Save fuel prices to database
   */
  async savePrices(prices: FuelPrice[]): Promise<number> {
    let saved = 0;
    
    for (const price of prices) {
      try {
        await query(`
          INSERT INTO fuel_prices (
            fuel_type, price_ghs, effective_date, source, created_at
          ) VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (fuel_type, effective_date) 
          DO UPDATE SET price_ghs = EXCLUDED.price_ghs, source = EXCLUDED.source
        `, [price.fuel_type, price.price_ghs, price.effective_date, price.source]);
        saved++;
      } catch (error) {
        logger.error('Failed to save fuel price', { 
          fuel_type: price.fuel_type, 
          error: error instanceof Error ? error.message : 'Unknown'
        });
      }
    }

    return saved;
  }

  /**
   * Sync latest fuel prices
   */
  async syncLatest(): Promise<SyncResult> {
    const started_at = new Date();
    const errors: SyncError[] = [];

    try {
      const prices = await this.fetchCurrentPrices();
      const saved = await this.savePrices(prices);

      logger.info('NPA sync completed', { 
        fetched: prices.length, 
        saved 
      });

      return {
        source: 'NPA Fuel Prices',
        status: prices.length > 0 ? 'success' : 'partial',
        started_at,
        completed_at: new Date(),
        records_fetched: prices.length,
        records_saved: saved,
        records_failed: prices.length - saved,
        errors,
        metadata: { 
          prices: prices.map(p => ({ type: p.fuel_type, price: p.price_ghs }))
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push({
        code: 'SCRAPE_FAILED',
        message: errorMessage,
        timestamp: new Date(),
      });

      logger.error('NPA sync failed', { error: errorMessage });

      return {
        source: 'NPA Fuel Prices',
        status: 'failed',
        started_at,
        completed_at: new Date(),
        records_fetched: 0,
        records_saved: 0,
        records_failed: 1,
        errors,
        metadata: {},
      };
    }
  }

  /**
   * Get latest fuel prices from database
   */
  async getLatestPrices(): Promise<FuelPrice[]> {
    const result = await query(`
      SELECT DISTINCT ON (fuel_type)
        fuel_type, price_ghs, effective_date, source
      FROM fuel_prices
      ORDER BY fuel_type, effective_date DESC
    `);

    return result.rows.map(row => ({
      fuel_type: row.fuel_type,
      price_ghs: parseFloat(row.price_ghs),
      effective_date: row.effective_date,
      source: row.source,
    }));
  }

  /**
   * Get diesel price (most relevant for transport costs)
   * Throws error if no data available - no fallback values
   */
  async getDieselPrice(): Promise<number> {
    const result = await query(`
      SELECT price_ghs FROM fuel_prices 
      WHERE fuel_type = 'diesel'
      ORDER BY effective_date DESC 
      LIMIT 1
    `);

    if (result.rows.length > 0) {
      return parseFloat(result.rows[0].price_ghs);
    }

    throw new Error('No diesel price data available in database - run NPA sync first');
  }
}

// Export singleton instance
export const npaScraper = new NPAScraper();
