/**
 * GSS Labor Survey Service
 * 
 * Calculates and maintains labor rates for all Ghana regions
 * 
 * Data Sources:
 * 1. Ghana Statistical Service (GSS) - Cost of Living Survey
 * 2. National Minimum Wage from Fair Wages Commission
 * 3. Economic indicators for regional adjustments
 * 
 * Labor categories specific to construction industry:
 * - Mason, Carpenter, Electrician, Plumber, Painter
 * - General Laborer, Welder, Tiler, Roofer
 * 
 * Update Frequency: Monthly (aligned with economic data updates)
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

export interface LaborRate {
  category: string;          // Must match labor_category_enum
  role_name: string;
  skill_level: 'unskilled' | 'semi_skilled' | 'skilled' | 'master';
  daily_rate_ghs: number;
  region: string;             // Must match region_code_enum
  source_type: string;
  source_reference: string;
  effective_date: Date;
  metadata?: Record<string, any>;
}

interface LaborCategoryConfig {
  category: string;         // Must match labor_category_enum
  role_name: string;
  skill_level: LaborRate['skill_level'];
  base_multiplier: number;  // Multiplier over minimum wage
}

interface GSSLaborServiceConfig {
  gss_base_url: string;
  fair_wages_url: string;
  user_agent: string;
  timeout_ms: number;
  retry_attempts: number;
}

// =====================================================
// CONFIGURATION
// =====================================================

const DEFAULT_CONFIG: GSSLaborServiceConfig = {
  gss_base_url: 'https://statsghana.gov.gh',
  fair_wages_url: 'https://fairwages.gov.gh',
  user_agent: 'PROPMETRIK Labor Data Bot/1.0 (+https://propmetrik.com/bot)',
  timeout_ms: 30000,
  retry_attempts: 3,
};

// Ghana Daily Minimum Wage (as of January 2025)
// Updated by Fair Wages and Salaries Commission
const GHANA_DAILY_MINIMUM_WAGE_GHS = 18.15;

// Labor categories matching labor_category_enum:
// mason, carpenter, electrician, plumber, painter, roofer, tiler, welder, laborer, foreman, supervisor, architect, engineer
const LABOR_CATEGORIES: LaborCategoryConfig[] = [
  // Laborer category
  { category: 'laborer', role_name: 'General Laborer', skill_level: 'unskilled', base_multiplier: 1.0 },
  { category: 'laborer', role_name: 'Helper/Assistant', skill_level: 'unskilled', base_multiplier: 1.0 },
  
  // Mason category
  { category: 'mason', role_name: 'Mason Apprentice', skill_level: 'semi_skilled', base_multiplier: 1.5 },
  { category: 'mason', role_name: 'Block Mason', skill_level: 'skilled', base_multiplier: 2.5 },
  { category: 'mason', role_name: 'Master Mason', skill_level: 'master', base_multiplier: 4.0 },
  
  // Carpenter category
  { category: 'carpenter', role_name: 'Carpenter Apprentice', skill_level: 'semi_skilled', base_multiplier: 1.5 },
  { category: 'carpenter', role_name: 'General Carpenter', skill_level: 'skilled', base_multiplier: 2.5 },
  { category: 'carpenter', role_name: 'Master Carpenter', skill_level: 'master', base_multiplier: 4.0 },
  
  // Electrician category
  { category: 'electrician', role_name: 'Electrician Apprentice', skill_level: 'semi_skilled', base_multiplier: 1.8 },
  { category: 'electrician', role_name: 'Licensed Electrician', skill_level: 'skilled', base_multiplier: 3.0 },
  { category: 'electrician', role_name: 'Master Electrician', skill_level: 'master', base_multiplier: 5.0 },
  
  // Plumber category
  { category: 'plumber', role_name: 'Plumber Apprentice', skill_level: 'semi_skilled', base_multiplier: 1.6 },
  { category: 'plumber', role_name: 'Licensed Plumber', skill_level: 'skilled', base_multiplier: 2.8 },
  { category: 'plumber', role_name: 'Master Plumber', skill_level: 'master', base_multiplier: 4.5 },
  
  // Painter category
  { category: 'painter', role_name: 'Painter Helper', skill_level: 'semi_skilled', base_multiplier: 1.4 },
  { category: 'painter', role_name: 'Painter', skill_level: 'skilled', base_multiplier: 2.2 },
  
  // Roofer category
  { category: 'roofer', role_name: 'Roofer', skill_level: 'skilled', base_multiplier: 2.5 },
  
  // Tiler category
  { category: 'tiler', role_name: 'Tiler', skill_level: 'skilled', base_multiplier: 2.8 },
  
  // Welder category
  { category: 'welder', role_name: 'Welder', skill_level: 'skilled', base_multiplier: 2.8 },
  { category: 'welder', role_name: 'Steel Bender', skill_level: 'semi_skilled', base_multiplier: 1.6 },
  
  // Foreman category
  { category: 'foreman', role_name: 'Site Foreman', skill_level: 'master', base_multiplier: 5.5 },
  
  // Supervisor category
  { category: 'supervisor', role_name: 'Project Supervisor', skill_level: 'master', base_multiplier: 6.0 },
];

// Valid region_code_enum values (only 5 regions in database)
const VALID_REGIONS = [
  { code: 'greater_accra', name: 'Greater Accra', cost_of_living_factor: 1.25 },
  { code: 'kumasi_metro', name: 'Kumasi Metro', cost_of_living_factor: 1.10 },
  { code: 'eastern', name: 'Eastern', cost_of_living_factor: 0.95 },
  { code: 'western_cluster', name: 'Western Cluster', cost_of_living_factor: 1.05 },
  { code: 'northern_cluster', name: 'Northern Cluster', cost_of_living_factor: 0.88 },
];

// =====================================================
// GSS LABOR SERVICE CLASS
// =====================================================

export class GSSLaborService {
  private readonly config: GSSLaborServiceConfig;
  private readonly gssClient: AxiosInstance;
  private readonly fairWagesClient: AxiosInstance;
  private currentMinimumWage: number = GHANA_DAILY_MINIMUM_WAGE_GHS;

  constructor(config: Partial<GSSLaborServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.gssClient = axios.create({
      baseURL: this.config.gss_base_url,
      timeout: this.config.timeout_ms,
      headers: {
        'User-Agent': this.config.user_agent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    this.fairWagesClient = axios.create({
      baseURL: this.config.fair_wages_url,
      timeout: this.config.timeout_ms,
      headers: {
        'User-Agent': this.config.user_agent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    // Configure retry logic
    [this.gssClient, this.fairWagesClient].forEach(client => {
      axiosRetry(client, {
        retries: this.config.retry_attempts,
        retryDelay: (retryCount) => retryCount * 2000,
        retryCondition: (error) => {
          return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
            (error.response?.status ?? 0) >= 500;
        },
      });
    });
  }

  /**
   * Fetch current minimum wage from Fair Wages Commission
   */
  async fetchMinimumWage(): Promise<number> {
    try {
      const response = await this.fairWagesClient.get('/');
      const $ = cheerio.load(response.data);

      // Try to find minimum wage on the page
      const textContent = $('body').text();
      
      // Look for patterns like "GHS 18.15" or "GHC 18.15" or "daily minimum wage"
      const patterns = [
        /daily\s+minimum\s+wage\s*[:=]?\s*(?:GH[S₵C]|GHS|cedis?)?\s*(\d+\.?\d*)/i,
        /minimum\s+wage\s*[:=]?\s*(?:GH[S₵C]|GHS|cedis?)?\s*(\d+\.?\d*)/i,
        /GH[S₵C]\s*(\d+\.?\d*)\s*(?:per\s+)?day/i,
      ];

      for (const pattern of patterns) {
        const match = textContent.match(pattern);
        if (match && match[1]) {
          const wage = parseFloat(match[1]);
          if (wage > 0 && wage < 100) { // Sanity check
            logger.info('Minimum wage fetched from Fair Wages', { wage });
            this.currentMinimumWage = wage;
            return wage;
          }
        }
      }

      logger.warn('Could not parse minimum wage, using default', { 
        default: GHANA_DAILY_MINIMUM_WAGE_GHS 
      });
      return GHANA_DAILY_MINIMUM_WAGE_GHS;
    } catch (error) {
      logger.warn('Failed to fetch minimum wage, using default', {
        error: error instanceof Error ? error.message : 'Unknown',
        default: GHANA_DAILY_MINIMUM_WAGE_GHS,
      });
      return GHANA_DAILY_MINIMUM_WAGE_GHS;
    }
  }

  /**
   * Fetch cost of living data from GSS (if available)
   */
  async fetchCostOfLivingData(): Promise<Map<string, number> | null> {
    try {
      // GSS Cost of Living Survey page
      const response = await this.gssClient.get('/surveys/cost-of-living');
      const $ = cheerio.load(response.data);

      const costOfLiving = new Map<string, number>();

      // Try to parse regional cost of living data
      $('table tr').each((_, row) => {
        const cells = $(row).find('td');
        if (cells.length >= 2) {
          const region = $(cells[0]).text().trim().toLowerCase().replace(/\s+/g, '-');
          const indexText = $(cells[1]).text().replace(/[^0-9.]/g, '');
          const index = parseFloat(indexText);

          if (region && !isNaN(index) && index > 0) {
            costOfLiving.set(region, index / 100); // Normalize to factor
          }
        }
      });

      if (costOfLiving.size > 0) {
        logger.info('Cost of living data fetched from GSS', { 
          regions: costOfLiving.size 
        });
        return costOfLiving;
      }

      return null;
    } catch (error) {
      logger.debug('GSS cost of living fetch failed, using defaults', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return null;
    }
  }

  /**
   * Calculate labor rates for all regions
   */
  async calculateLaborRates(): Promise<LaborRate[]> {
    const rates: LaborRate[] = [];

    // Fetch latest minimum wage
    const minimumWage = await this.fetchMinimumWage();

    // Try to fetch cost of living data
    const costOfLivingData = await this.fetchCostOfLivingData();

    // Calculate rates for each region and category
    for (const region of VALID_REGIONS) {
      // Use scraped data if available, otherwise use configured factors
      const costFactor = costOfLivingData?.get(region.code) ?? region.cost_of_living_factor;

      for (const category of LABOR_CATEGORIES) {
        // Base rate = minimum wage × skill multiplier × regional cost of living factor
        const dailyRate = Math.round(minimumWage * category.base_multiplier * costFactor * 100) / 100;

        rates.push({
          category: category.category,
          role_name: category.role_name,
          skill_level: category.skill_level,
          daily_rate_ghs: dailyRate,
          region: region.code,
          source_type: 'calculated',
          source_reference: 'GSS Cost of Living × Fair Wages',
          effective_date: new Date(),
          metadata: {
            minimum_wage: minimumWage,
            base_multiplier: category.base_multiplier,
            cost_of_living_factor: costFactor,
            calculation: `${minimumWage} × ${category.base_multiplier} × ${costFactor}`,
          },
        });
      }
    }

    logger.info('Labor rates calculated', {
      total_rates: rates.length,
      regions: VALID_REGIONS.length,
      categories: LABOR_CATEGORIES.length,
      minimum_wage_used: minimumWage,
    });

    return rates;
  }

  /**
   * Save labor rates to database
   */
  async saveRates(rates: LaborRate[]): Promise<number> {
    let saved = 0;

    for (const rate of rates) {
      try {
        // Use proper enum casting for category and region
        // Note: labor_category duplicates category, survey_date duplicates effective_date (both are NOT NULL)
        // No UNIQUE constraint exists on (role_name, region, effective_date) so we just INSERT
        await query(`
          INSERT INTO labor_rates (
            category, labor_category, role_name, skill_level, daily_rate_ghs,
            region, source_type, source_reference, effective_date, survey_date,
            metadata, created_at
          ) VALUES (
            $1::labor_category_enum, $1::labor_category_enum, $2, $3, $4,
            $5::region_code_enum, $6, $7, $8, $8,
            $9, NOW()
          )
        `, [
          rate.category,
          rate.role_name,
          rate.skill_level,
          rate.daily_rate_ghs,
          rate.region,
          rate.source_type,
          rate.source_reference,
          rate.effective_date,
          JSON.stringify(rate.metadata || {}),
        ]);
        saved++;
      } catch (error) {
        logger.error('Failed to save labor rate', {
          category: rate.category,
          role: rate.role_name,
          region: rate.region,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    return saved;
  }

  /**
   * Sync latest labor rates
   */
  async syncLatest(): Promise<SyncResult> {
    const started_at = new Date();
    const errors: SyncError[] = [];

    try {
      const rates = await this.calculateLaborRates();
      const saved = await this.saveRates(rates);

      logger.info('GSS labor sync completed', {
        calculated: rates.length,
        saved,
      });

      return {
        source: 'GSS Labor Rates',
        status: saved > 0 ? 'success' : 'partial',
        started_at,
        completed_at: new Date(),
        records_fetched: rates.length,
        records_saved: saved,
        records_failed: rates.length - saved,
        errors,
        metadata: {
          minimum_wage_ghs: this.currentMinimumWage,
          regions_count: VALID_REGIONS.length,
          categories_count: LABOR_CATEGORIES.length,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push({
        code: 'SYNC_FAILED',
        message: errorMessage,
        timestamp: new Date(),
      });

      logger.error('GSS labor sync failed', { error: errorMessage });

      return {
        source: 'GSS Labor Rates',
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
   * Get current labor rates for a region
   */
  async getRatesByRegion(regionCode: string): Promise<LaborRate[]> {
    const result = await query(`
      SELECT DISTINCT ON (role_name)
        category::text, role_name, skill_level, daily_rate_ghs,
        region::text, source_type, source_reference, effective_date,
        metadata
      FROM labor_rates
      WHERE region = $1::region_code_enum
      ORDER BY role_name, effective_date DESC
    `, [regionCode]);

    return result.rows.map(row => ({
      category: row.category,
      role_name: row.role_name,
      skill_level: row.skill_level,
      daily_rate_ghs: parseFloat(row.daily_rate_ghs),
      region: row.region,
      source_type: row.source_type,
      source_reference: row.source_reference,
      effective_date: row.effective_date,
      metadata: row.metadata,
    }));
  }

  /**
   * Get current minimum wage
   */
  async getMinimumWage(): Promise<number> {
    return this.currentMinimumWage;
  }

  /**
   * Get average skilled labor rate for a region
   */
  async getAverageSkilledRate(regionCode: string): Promise<number> {
    const result = await query(`
      SELECT AVG(daily_rate_ghs) as avg_rate
      FROM (
        SELECT DISTINCT ON (role_name) daily_rate_ghs
        FROM labor_rates
        WHERE region = $1::region_code_enum AND skill_level = 'skilled'
        ORDER BY role_name, effective_date DESC
      ) subquery
    `, [regionCode]);

    if (result.rows.length > 0 && result.rows[0].avg_rate) {
      return parseFloat(result.rows[0].avg_rate);
    }

    // Fallback: calculate from minimum wage
    const region = VALID_REGIONS.find(r => r.code === regionCode);
    const costFactor = region?.cost_of_living_factor ?? 1.0;
    return this.currentMinimumWage * 2.6 * costFactor; // 2.6 is avg skilled multiplier
  }
}

// Export singleton instance
export const gssLaborService = new GSSLaborService();
