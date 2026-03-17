/**
 * GREDA Construction Cost Scraper
 * 
 * Scrapes published construction cost rates from the Ghana Real Estate
 * Developers Association (GREDA) and related public sources.
 * 
 * Sources:
 * 1. GREDA (grfreda.org) — Published building rates by category
 * 2. BRRI (brri.gov.gh) — Building & Road Research Institute cost indices
 * 
 * Notes:
 * - GREDA publishes rates by building function + quality level
 * - Rates are for Greater Accra; regional adjustments applied for other zones
 * - Per RICS: published rates override derived (Tier 3) calculations
 * 
 * Update Frequency: Monthly (1st of month, after base cost recalc)
 */

import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import * as cheerio from 'cheerio';
import { query } from '../../../database';
import { logger } from '../../../utils/logger';
import { SyncResult, SyncError } from './types';
import {
  specializedCostService,
  BuildingFunction,
  QualityLevel,
  RegionCode,
} from '../specializedCostService';

// =====================================================
// TYPES
// =====================================================

export interface GREDARateRaw {
  building_function: BuildingFunction;
  quality_level: QualityLevel;
  base_cost_sqm: number;
  me_services_pct?: number;
  source_url: string;
  source_date: Date;
  notes?: string;
  metadata?: Record<string, unknown>;
}

interface GREDAScraperConfig {
  greda_url: string;
  brri_url: string;
  user_agent: string;
  timeout_ms: number;
  retry_attempts: number;
  retry_delay_ms: number;
}

// =====================================================
// CONFIGURATION
// =====================================================

const DEFAULT_CONFIG: GREDAScraperConfig = {
  greda_url: 'https://grfreda.org',
  brri_url: 'https://brri.gov.gh',
  user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  timeout_ms: 45000,
  retry_attempts: 3,
  retry_delay_ms: 3000,
};

// GREDA publishes rates for Greater Accra.
// Regional adjustments for other zones.
const REGIONAL_ADJUSTMENT_FACTORS: Record<RegionCode, number> = {
  greater_accra: 1.00,
  kumasi_metro: 0.92,
  eastern: 0.90,
  western_cluster: 0.95,
  northern_cluster: 0.88,
};

const ALL_REGIONS: RegionCode[] = [
  'greater_accra', 'kumasi_metro', 'eastern', 'western_cluster', 'northern_cluster'
];

// Mapping from GREDA page category text → building_function_enum
const CATEGORY_FUNCTION_MAP: Record<string, BuildingFunction> = {
  'educational': 'educational',
  'school': 'educational',
  'university': 'educational',
  'clinic': 'health_clinic',
  'health clinic': 'health_clinic',
  'hospital': 'health_hospital',
  'health hospital': 'health_hospital',
  'church': 'religious',
  'mosque': 'religious',
  'religious': 'religious',
  'government': 'government',
  'government office': 'government',
  'heritage': 'heritage',
  'recreation': 'recreation',
  'sports': 'recreation',
  'library': 'library',
  'museum': 'museum',
  'stadium': 'stadium',
  'warehouse': 'industrial_warehouse',
  'factory': 'industrial_factory',
  'industrial': 'industrial_factory',
  'mixed use': 'mixed_use',
  'mixed-use': 'mixed_use',
  'institutional': 'institutional_other',
};

// Quality level text mapping
const QUALITY_MAP: Record<string, QualityLevel> = {
  'basic': 'basic',
  'economy': 'basic',
  'low': 'basic',
  'standard': 'standard',
  'medium': 'standard',
  'average': 'standard',
  'premium': 'premium',
  'high': 'premium',
  'superior': 'premium',
  'luxury': 'luxury',
  'deluxe': 'luxury',
  'first class': 'luxury',
};

// =====================================================
// GREDA SCRAPER
// =====================================================

export class GREDAScraper {
  private readonly config: GREDAScraperConfig;
  private readonly client: AxiosInstance;

  constructor(config: Partial<GREDAScraperConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.client = axios.create({
      timeout: this.config.timeout_ms,
      headers: {
        'User-Agent': this.config.user_agent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
      },
    });

    axiosRetry(this.client, {
      retries: this.config.retry_attempts,
      retryDelay: (retryCount) => retryCount * this.config.retry_delay_ms,
      retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          (error.response?.status ?? 0) >= 500;
      },
    });
  }

  // =====================================================
  // PARSING
  // =====================================================

  /**
   * Parse GHŠ price from text
   */
  private parsePrice(text: string): number | null {
    const cleaned = text
      .replace(/₵|GH₵|GHS|GH¢|,/gi, '')
      .trim();
    const match = cleaned.match(/[\d,]+(?:\.\d{1,2})?/);
    if (match) {
      const price = parseFloat(match[0].replace(/,/g, ''));
      if (!isNaN(price) && price > 0 && price < 100_000) {
        return price;
      }
    }
    return null;
  }

  /**
   * Map text label to BuildingFunction enum
   */
  private mapCategory(text: string): BuildingFunction | null {
    const lower = text.toLowerCase().trim();
    for (const [key, fn] of Object.entries(CATEGORY_FUNCTION_MAP)) {
      if (lower.includes(key)) return fn;
    }
    return null;
  }

  /**
   * Map text label to QualityLevel
   */
  private mapQuality(text: string): QualityLevel {
    const lower = text.toLowerCase().trim();
    for (const [key, ql] of Object.entries(QUALITY_MAP)) {
      if (lower.includes(key)) return ql;
    }
    return 'standard'; // Default
  }

  // =====================================================
  // SCRAPING
  // =====================================================

  /**
   * Attempt to scrape construction cost rates from GREDA website
   */
  async scrapeGREDA(): Promise<GREDARateRaw[]> {
    const rates: GREDARateRaw[] = [];
    const urls = [
      `${this.config.greda_url}/construction-costs`,
      `${this.config.greda_url}/building-rates`,
      `${this.config.greda_url}/publications`,
      `${this.config.greda_url}/resources`,
    ];

    for (const url of urls) {
      try {
        logger.info('[GREDA] Trying URL', { url });
        const response = await this.client.get(url);
        const $ = cheerio.load(response.data);

        // Look for tables with cost data
        const pageRates = this.extractRatesFromPage($, url);
        if (pageRates.length > 0) {
          rates.push(...pageRates);
          logger.info('[GREDA] Found rates', { url, count: pageRates.length });
        }
      } catch (error) {
        // Some URLs may 404 — that's expected
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        logger.debug('[GREDA] URL not available', { url, status });
      }
    }

    return rates;
  }

  /**
   * Attempt to scrape from BRRI
   */
  async scrapeBRRI(): Promise<GREDARateRaw[]> {
    const rates: GREDARateRaw[] = [];
    const urls = [
      `${this.config.brri_url}/construction-cost-index`,
      `${this.config.brri_url}/publications`,
      `${this.config.brri_url}/research/building-costs`,
    ];

    for (const url of urls) {
      try {
        logger.info('[BRRI] Trying URL', { url });
        const response = await this.client.get(url);
        const $ = cheerio.load(response.data);

        const pageRates = this.extractRatesFromPage($, url);
        if (pageRates.length > 0) {
          rates.push(...pageRates);
          logger.info('[BRRI] Found rates', { url, count: pageRates.length });
        }
      } catch (error) {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        logger.debug('[BRRI] URL not available', { url, status });
      }
    }

    return rates;
  }

  /**
   * Extract rates from an HTML page looking for table/list patterns
   * GREDA and BRRI typically publish rates in HTML tables or
   * definition lists with building type + cost per sqm
   */
  private extractRatesFromPage($: cheerio.CheerioAPI, sourceUrl: string): GREDARateRaw[] {
    const rates: GREDARateRaw[] = [];
    const seen = new Set<string>();

    // Strategy 1: Look for <table> elements with cost data
    $('table').each((_i, table) => {
      const rows = $(table).find('tr');
      rows.each((_j, row) => {
        const cells = $(row).find('td, th');
        if (cells.length < 2) return;

        const cellTexts = cells.map((_k, cell) => $(cell).text().trim()).get();

        // Look for a cell with a building function and another with a price
        let fn: BuildingFunction | null = null;
        let price: number | null = null;
        let quality: QualityLevel = 'standard';

        for (const text of cellTexts) {
          if (!fn) fn = this.mapCategory(text);
          if (!price) price = this.parsePrice(text);
          const q = this.mapQuality(text);
          if (q !== 'standard') quality = q;
        }

        if (fn && price) {
          const key = `${fn}|${quality}`;
          if (!seen.has(key)) {
            seen.add(key);
            rates.push({
              building_function: fn,
              quality_level: quality,
              base_cost_sqm: price,
              source_url: sourceUrl,
              source_date: new Date(),
              notes: `Scraped from table: ${cellTexts.join(' | ')}`,
            });
          }
        }
      });
    });

    // Strategy 2: Look for definition lists or structured text
    $('dl dt, .rate-item, .cost-item, [class*="building"], [class*="rate"]').each((_i, el) => {
      const text = $(el).text().trim();
      const fn = this.mapCategory(text);
      if (!fn) return;

      // Look for price in the next sibling or parent
      const priceText = $(el).next().text() || $(el).parent().text();
      const price = this.parsePrice(priceText);
      const quality = this.mapQuality(text);

      if (price) {
        const key = `${fn}|${quality}`;
        if (!seen.has(key)) {
          seen.add(key);
          rates.push({
            building_function: fn,
            quality_level: quality,
            base_cost_sqm: price,
            source_url: sourceUrl,
            source_date: new Date(),
            notes: `Scraped from structured element: ${text}`,
          });
        }
      }
    });

    return rates;
  }

  // =====================================================
  // SAVE & SYNC
  // =====================================================

  /**
   * Save scraped rates to specialized_construction_costs via
   * specializedCostService (which handles published rate priority)
   */
  async saveRates(rates: GREDARateRaw[]): Promise<{ saved: number; errors: number }> {
    // Expand each scraped rate to all regions with adjustments
    const expanded: Array<{
      building_function: BuildingFunction;
      quality_level: QualityLevel;
      region: RegionCode;
      base_cost_sqm: number;
      me_services_pct?: number;
      source: string;
      source_url?: string;
      source_date?: Date;
      notes?: string;
      metadata?: Record<string, unknown>;
    }> = [];

    for (const rate of rates) {
      for (const region of ALL_REGIONS) {
        const factor = REGIONAL_ADJUSTMENT_FACTORS[region];
        const adjustedCost = Math.round(rate.base_cost_sqm * factor * 100) / 100;

        expanded.push({
          building_function: rate.building_function,
          quality_level: rate.quality_level,
          region,
          base_cost_sqm: adjustedCost,
          me_services_pct: rate.me_services_pct,
          source: 'GREDA',
          source_url: rate.source_url,
          source_date: rate.source_date,
          notes: region === 'greater_accra'
            ? rate.notes
            : `${rate.notes} | Regional adjustment ${factor}x from Greater Accra`,
          metadata: {
            original_cost: rate.base_cost_sqm,
            regional_factor: factor,
            ...rate.metadata,
          },
        });
      }
    }

    return specializedCostService.bulkUpsertPublishedRates(expanded);
  }

  /**
   * Main sync entry point — follows the scraper pattern convention.
   * 
   * Scrapes GREDA + BRRI, saves published rates, then recalculates
   * derived rates for any building functions not covered by published data.
   */
  async syncLatest(): Promise<SyncResult> {
    const started_at = new Date();
    const errors: SyncError[] = [];

    try {
      logger.info('[GREDA] Starting sync...');

      // 1. Scrape from all sources
      const [gredaRates, brriRates] = await Promise.all([
        this.scrapeGREDA().catch(err => {
          errors.push({
            code: 'GREDA_SCRAPE_ERROR',
            message: err instanceof Error ? err.message : 'GREDA scrape failed',
            timestamp: new Date(),
          });
          return [] as GREDARateRaw[];
        }),
        this.scrapeBRRI().catch(err => {
          errors.push({
            code: 'BRRI_SCRAPE_ERROR',
            message: err instanceof Error ? err.message : 'BRRI scrape failed',
            timestamp: new Date(),
          });
          return [] as GREDARateRaw[];
        }),
      ]);

      const allRates = [...gredaRates, ...brriRates];
      logger.info('[GREDA] Scraped rates', {
        greda: gredaRates.length,
        brri: brriRates.length,
        total: allRates.length,
      });

      let saved = 0;
      let saveErrors = 0;

      // 2. Save published rates (if any found)
      if (allRates.length > 0) {
        const result = await this.saveRates(allRates);
        saved = result.saved;
        saveErrors = result.errors;
      }

      // 3. Always recalculate derived costs for any functions
      //    NOT covered by published data
      const derivedResult = await specializedCostService.recalculateDerivedCosts();
      const totalSaved = saved + derivedResult.total_calculated;

      if (derivedResult.errors.length > 0) {
        errors.push(...derivedResult.errors.map(e => ({
          code: 'DERIVED_CALC_ERROR',
          message: e,
          timestamp: new Date(),
        })));
      }

      logger.info('[GREDA] Sync complete', {
        published_saved: saved,
        derived_calculated: derivedResult.total_calculated,
        skipped_published: derivedResult.skipped_published,
        total_saved: totalSaved,
      });

      return {
        source: 'GREDA/BRRI Construction Costs',
        status: totalSaved > 0 ? 'success' : (errors.length > 0 ? 'partial' : 'success'),
        started_at,
        completed_at: new Date(),
        records_fetched: allRates.length,
        records_saved: totalSaved,
        records_failed: saveErrors,
        errors,
        metadata: {
          greda_rates: gredaRates.length,
          brri_rates: brriRates.length,
          published_saved: saved,
          derived_calculated: derivedResult.total_calculated,
          skipped_published: derivedResult.skipped_published,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push({
        code: 'SYNC_FAILED',
        message: errorMessage,
        timestamp: new Date(),
      });

      logger.error('[GREDA] Sync failed', { error: errorMessage });

      return {
        source: 'GREDA/BRRI Construction Costs',
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
   * Get current published rate count from DB
   */
  async getPublishedRateCount(): Promise<number> {
    const result = await query<{ count: string }>(`
      SELECT COUNT(*) as count
      FROM specialized_construction_costs
      WHERE is_published_rate = TRUE
    `);
    return parseInt(result.rows[0].count, 10);
  }
}

// Export singleton
export const gredaScraper = new GREDAScraper();
