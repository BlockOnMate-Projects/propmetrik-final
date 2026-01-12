/**
 * Local Material Price Scraper
 * 
 * Sources construction material prices from:
 * 1. ConstructionGhana.com (primary source - WooCommerce e-commerce)
 * 2. Partner supplier CSV uploads
 * 
 * Data updates regional material prices used in construction cost calculations
 * 
 * Update Frequency: Monthly
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

export interface MaterialPrice {
  category: string;          // Must match material_category_enum
  material_name: string;
  specification?: string;
  unit: string;
  price_ghs: number;
  region: string;            // Must match region_code_enum
  source_type: string;
  source_reference: string;
  effective_date: Date;
  metadata?: Record<string, any>;
}

interface CategoryConfig {
  url_path: string;
  category: string;  // Must match material_category_enum
  unit: string;
}

interface LocalMaterialScraperConfig {
  base_url: string;
  user_agent: string;
  timeout_ms: number;
  retry_attempts: number;
  retry_delay_ms: number;
}

// =====================================================
// CONFIGURATION
// =====================================================

const DEFAULT_CONFIG: LocalMaterialScraperConfig = {
  base_url: 'https://constructionghana.com',
  user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  timeout_ms: 45000,
  retry_attempts: 3,
  retry_delay_ms: 3000,
};

// ConstructionGhana.com category URLs mapped to material_category_enum values
const CATEGORY_CONFIGS: CategoryConfig[] = [
  { url_path: '/product-category/cement/', category: 'cement', unit: 'bag (50kg)' },
  { url_path: '/product-category/iron-rod/', category: 'steel', unit: 'piece' },
  { url_path: '/product-category/sand-stone-and-gravel/', category: 'sand', unit: 'trip' },
  { url_path: '/product-category/blocks/', category: 'blocks', unit: 'piece' },
  { url_path: '/product-category/roofing-sheets/', category: 'roofing', unit: 'sheet' },
  { url_path: '/product-category/paint/', category: 'paint', unit: 'gallon' },
  { url_path: '/product-category/plumbing/', category: 'plumbing', unit: 'piece' },
  { url_path: '/product-category/electrical/', category: 'electrical', unit: 'piece' },
  { url_path: '/product-category/tiles/', category: 'tiles', unit: 'box' },
  { url_path: '/product-category/timber/', category: 'timber', unit: 'piece' },
];

// Valid region_code_enum values (only 5 regions in database)
const VALID_REGIONS = [
  { code: 'greater_accra', name: 'Greater Accra' },
  { code: 'kumasi_metro', name: 'Kumasi Metro' },
  { code: 'eastern', name: 'Eastern' },
  { code: 'western_cluster', name: 'Western Cluster' },
  { code: 'northern_cluster', name: 'Northern Cluster' },
];

// Regional price adjustment factors (Greater Accra = 1.0 baseline)
const REGIONAL_PRICE_FACTORS: Record<string, number> = {
  'greater_accra': 1.00,
  'kumasi_metro': 0.95,
  'eastern': 0.98,
  'western_cluster': 1.05,
  'northern_cluster': 1.15,
};

// =====================================================
// LOCAL MATERIAL SCRAPER CLASS
// =====================================================

export class LocalMaterialScraper {
  private readonly config: LocalMaterialScraperConfig;
  private readonly client: AxiosInstance;

  constructor(config: Partial<LocalMaterialScraperConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.client = axios.create({
      baseURL: this.config.base_url,
      timeout: this.config.timeout_ms,
      headers: {
        'User-Agent': this.config.user_agent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Cache-Control': 'max-age=0',
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

  /**
   * Parse price from text (handles ₵ currency symbol)
   */
  private parsePrice(priceText: string): number | null {
    // Remove currency symbols and extract number
    const cleaned = priceText
      .replace(/₵|GH₵|GHS|,/gi, '')
      .trim();
    
    // Match the first number (price before any range)
    const match = cleaned.match(/[\d.]+/);
    if (match) {
      const price = parseFloat(match[0]);
      if (!isNaN(price) && price > 0) {
        return price;
      }
    }
    return null;
  }

  /**
   * Scrape a category page from ConstructionGhana.com
   */
  async scrapeCategoryPage(categoryConfig: CategoryConfig): Promise<MaterialPrice[]> {
    const prices: MaterialPrice[] = [];
    
    try {
      logger.info(`Scraping category: ${categoryConfig.category}`, { url: categoryConfig.url_path });
      
      const response = await this.client.get(categoryConfig.url_path);
      const $ = cheerio.load(response.data);

      // WooCommerce product selectors
      const products = $('li.product, .product-item, .products .product');
      
      logger.info(`Found ${products.length} products in ${categoryConfig.category}`);

      products.each((_, element) => {
        try {
          const $product = $(element);
          
          // Get product name
          const nameElement = $product.find('.woocommerce-loop-product__title, .product-title, h2, h3').first();
          const name = nameElement.text().trim();
          
          if (!name) return;

          // Get price - WooCommerce uses .price .amount or similar
          const priceElement = $product.find('.price .amount, .price ins .amount, .woocommerce-Price-amount').first();
          let priceText = priceElement.text().trim();
          
          // Fallback to any element with price class
          if (!priceText) {
            priceText = $product.find('.price').first().text().trim();
          }

          const price = this.parsePrice(priceText);
          
          if (price && price > 0) {
            prices.push({
              category: categoryConfig.category,
              material_name: name,
              unit: categoryConfig.unit,
              price_ghs: price,
              region: 'greater_accra', // Base region
              source_type: 'scraped',
              source_reference: 'constructionghana.com',
              effective_date: new Date(),
              metadata: {
                url_path: categoryConfig.url_path,
                original_price_text: priceText,
              },
            });
          }
        } catch (err) {
          // Skip individual product errors
        }
      });

      logger.info(`Scraped ${prices.length} prices from ${categoryConfig.category}`);
      
    } catch (error) {
      logger.error(`Failed to scrape category: ${categoryConfig.category}`, {
        error: error instanceof Error ? error.message : 'Unknown',
        url: categoryConfig.url_path,
      });
    }

    return prices;
  }

  /**
   * Process partner CSV upload
   */
  async processPartnerCSV(
    csvContent: string, 
    partnerId: string, 
    partnerName: string
  ): Promise<MaterialPrice[]> {
    const lines = csvContent.trim().split('\n');
    const prices: MaterialPrice[] = [];
    const validRegions = VALID_REGIONS.map(r => r.code);

    // Expected CSV format: category,material_name,unit,price,region
    for (let i = 1; i < lines.length; i++) { // Skip header
      const parts = lines[i].split(',').map(p => p.trim());
      
      if (parts.length >= 5) {
        const [category, material_name, unit, priceStr, region] = parts;
        const price = parseFloat(priceStr);

        // Validate region against enum
        if (!isNaN(price) && price > 0 && validRegions.includes(region)) {
          prices.push({
            category,
            material_name,
            unit,
            price_ghs: price,
            region,
            source_type: 'partner_csv',
            source_reference: partnerName,
            effective_date: new Date(),
            metadata: { partner_id: partnerId },
          });
        }
      }
    }

    logger.info('Partner CSV processed', { 
      partner: partnerName, 
      materials: prices.length 
    });

    return prices;
  }

  /**
   * Apply regional price adjustments
   */
  applyRegionalPricing(basePrice: MaterialPrice): MaterialPrice[] {
    const regionalPrices: MaterialPrice[] = [];

    for (const region of VALID_REGIONS) {
      const factor = REGIONAL_PRICE_FACTORS[region.code] || 1.0;
      
      regionalPrices.push({
        ...basePrice,
        region: region.code,
        price_ghs: Math.round(basePrice.price_ghs * factor * 100) / 100,
        metadata: {
          ...basePrice.metadata,
          base_region: basePrice.region,
          adjustment_factor: factor,
        },
      });
    }

    return regionalPrices;
  }

  /**
   * Fetch all construction material prices from ConstructionGhana.com
   */
  async fetchAllPrices(): Promise<MaterialPrice[]> {
    const allPrices: MaterialPrice[] = [];
    const errors: string[] = [];

    logger.info('Starting material price scraping from ConstructionGhana.com', { 
      categories_count: CATEGORY_CONFIGS.length 
    });

    for (const categoryConfig of CATEGORY_CONFIGS) {
      try {
        const categoryPrices = await this.scrapeCategoryPage(categoryConfig);
        
        // Apply regional pricing to each base price
        for (const basePrice of categoryPrices) {
          const regionalPrices = this.applyRegionalPricing(basePrice);
          allPrices.push(...regionalPrices);
        }

        // Rate limiting - wait between category requests
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        errors.push(categoryConfig.category);
        logger.error(`Failed to scrape category: ${categoryConfig.category}`, {
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    logger.info('Material price scraping completed', { 
      total_prices: allPrices.length,
      failed_categories: errors.length,
      failed: errors,
    });

    return allPrices;
  }

  /**
   * Save material prices to database
   */
  async savePrices(prices: MaterialPrice[]): Promise<number> {
    let saved = 0;

    for (const price of prices) {
      try {
        // Use proper enum casting for category and region
        // Note: material_category duplicates category, survey_date duplicates effective_date (both are NOT NULL)
        // No UNIQUE constraint exists on (material_name, region, effective_date) so we just INSERT
        await query(`
          INSERT INTO material_prices (
            category, material_category, material_name, specification, price_ghs, unit,
            region, source_type, source_reference, effective_date, survey_date,
            metadata, created_at
          ) VALUES (
            $1::material_category_enum, $1::material_category_enum, $2, $3, $4, $5, 
            $6::region_code_enum, $7, $8, $9, $9,
            $10, NOW()
          )
        `, [
          price.category,
          price.material_name,
          price.specification || null,
          price.price_ghs,
          price.unit,
          price.region,
          price.source_type,
          price.source_reference,
          price.effective_date,
          JSON.stringify(price.metadata || {}),
        ]);
        saved++;
      } catch (error) {
        logger.error('Failed to save material price', {
          material: price.material_name,
          category: price.category,
          region: price.region,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    return saved;
  }

  /**
   * Sync all local material prices
   */
  async syncLatest(): Promise<SyncResult> {
    const started_at = new Date();
    const errors: SyncError[] = [];

    try {
      const prices = await this.fetchAllPrices();
      const saved = await this.savePrices(prices);

      logger.info('Local material sync completed', {
        fetched: prices.length,
        saved,
      });

      return {
        source: 'Local Material Prices (ConstructionGhana.com)',
        status: saved > 0 ? 'success' : 'partial',
        started_at,
        completed_at: new Date(),
        records_fetched: prices.length,
        records_saved: saved,
        records_failed: prices.length - saved,
        errors,
        metadata: {
          materials_count: new Set(prices.map(p => p.material_name)).size,
          regions_count: new Set(prices.map(p => p.region)).size,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push({
        code: 'SYNC_FAILED',
        message: errorMessage,
        timestamp: new Date(),
      });

      logger.error('Local material sync failed', { error: errorMessage });

      return {
        source: 'Local Material Prices (ConstructionGhana.com)',
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
   * Get current prices for a specific region
   */
  async getPricesByRegion(region: string): Promise<MaterialPrice[]> {
    const result = await query(`
      SELECT DISTINCT ON (material_name)
        category::text, material_name, specification, unit, price_ghs,
        region::text, source_type, source_reference, effective_date,
        metadata
      FROM material_prices
      WHERE region = $1::region_code_enum
      ORDER BY material_name, effective_date DESC
    `, [region]);

    return result.rows.map(row => ({
      category: row.category,
      material_name: row.material_name,
      specification: row.specification,
      unit: row.unit,
      price_ghs: parseFloat(row.price_ghs),
      region: row.region,
      source_type: row.source_type,
      source_reference: row.source_reference,
      effective_date: row.effective_date,
      metadata: row.metadata,
    }));
  }
}

// Export singleton instance
export const localMaterialScraper = new LocalMaterialScraper();
