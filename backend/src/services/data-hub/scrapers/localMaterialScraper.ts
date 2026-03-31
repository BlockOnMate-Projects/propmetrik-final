/**
 * Local Material Price Scraper
 *
 * Sources construction material prices from:
 * 1. ConstructionGhana.com (primary source - WooCommerce e-commerce)
 * 2. Partner supplier CSV uploads
 *
 * Uses Puppeteer (headless browser) to handle StackProtect/reCAPTCHA
 * challenge on ConstructionGhana.com. The site uses invisible reCAPTCHA
 * that blocks plain HTTP clients (axios/fetch) but passes automatically
 * in a real browser context.
 *
 * Data updates regional material prices used in construction cost calculations
 *
 * Update Frequency: Weekly
 */

import puppeteer, { Browser, Page } from 'puppeteer';
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
  timeout_ms: number;
  retry_attempts: number;
}

// =====================================================
// CONFIGURATION
// =====================================================

const DEFAULT_CONFIG: LocalMaterialScraperConfig = {
  base_url: 'https://constructionghana.com',
  timeout_ms: 60000,
  retry_attempts: 2,
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

  constructor(config: Partial<LocalMaterialScraperConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Launch a Puppeteer browser instance configured for server use
   */
  private async launchBrowser(): Promise<Browser> {
    return puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
      ],
    });
  }

  /**
   * Navigate to a URL and wait for StackProtect challenge to resolve.
   * The invisible reCAPTCHA auto-submits in a real browser and redirects
   * to the actual page content.
   */
  private async navigateWithChallenge(page: Page, url: string): Promise<string> {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: this.config.timeout_ms });

    // Check if we landed on a StackProtect challenge page
    const title = await page.title();
    if (title === 'Security Verification') {
      logger.info('StackProtect challenge detected, waiting for auto-resolve...', { url });
      // The invisible reCAPTCHA auto-submits and redirects — wait for navigation
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
      } catch {
        // May already have navigated; check content
      }
    }

    return await page.content();
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
   * Parse product prices from HTML content using cheerio
   */
  private parseCategoryHtml(html: string, categoryConfig: CategoryConfig): MaterialPrice[] {
    const prices: MaterialPrice[] = [];
    const $ = cheerio.load(html);

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

    return prices;
  }

  /**
   * Scrape a category page from ConstructionGhana.com using Puppeteer
   */
  async scrapeCategoryPage(page: Page, categoryConfig: CategoryConfig): Promise<MaterialPrice[]> {
    const url = `${this.config.base_url}${categoryConfig.url_path}`;

    for (let attempt = 0; attempt <= this.config.retry_attempts; attempt++) {
      try {
        logger.info(`Scraping category: ${categoryConfig.category}`, { url, attempt });

        const html = await this.navigateWithChallenge(page, url);
        const prices = this.parseCategoryHtml(html, categoryConfig);

        logger.info(`Scraped ${prices.length} prices from ${categoryConfig.category}`);
        return prices;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown';
        if (attempt < this.config.retry_attempts) {
          logger.warn(`Retry ${attempt + 1} for category: ${categoryConfig.category}`, { error: msg });
          await new Promise(resolve => setTimeout(resolve, 3000));
        } else {
          logger.error(`Failed to scrape category: ${categoryConfig.category}`, { error: msg, url });
        }
      }
    }

    return [];
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
   * Uses a single Puppeteer browser session to reuse cookies across categories
   */
  async fetchAllPrices(): Promise<MaterialPrice[]> {
    const allPrices: MaterialPrice[] = [];
    const errors: string[] = [];
    let browser: Browser | null = null;

    logger.info('Starting material price scraping from ConstructionGhana.com (Puppeteer)', {
      categories_count: CATEGORY_CONFIGS.length
    });

    try {
      browser = await this.launchBrowser();
      const page = await browser.newPage();

      // Set viewport and user agent
      await page.setViewport({ width: 1280, height: 800 });
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      for (const categoryConfig of CATEGORY_CONFIGS) {
        try {
          const categoryPrices = await this.scrapeCategoryPage(page, categoryConfig);

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
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
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
