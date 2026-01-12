/**
 * Economic Data Scheduler
 * 
 * Manages automated synchronization of economic data from various sources:
 * - Bank of Ghana (BOG): Monthly sync on 1st of each month
 * - World Bank WDI: Quarterly sync
 * - FX Rates: Every 5 minutes for cache, daily for persistence
 * 
 * Also manages construction cost data synchronization:
 * - NPA Fuel Prices: Bi-weekly (1st and 15th of each month)
 * - Local Material Prices: Monthly (1st of each month)
 * - GSS Labor Rates: Monthly (1st of each month)
 * - Construction Index Recalculation: Monthly (after all data syncs complete)
 * 
 * Uses node-cron for scheduling with configurable cron expressions.
 */

import cron, { ScheduledTask } from 'node-cron';
import { logger } from '../../../utils/logger';
import { economicDataSyncService, SyncSource } from '../scrapers/syncService';
import { fxFeedService } from '../scrapers/fxFeedService';
import { constructionCostService } from '../constructionCostService';
import { baseCostCalculationService } from '../baseCostCalculationService';

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
  // === Economic Data ===
  /** Cron expression for BOG sync (default: 8 AM on 1st of each month) */
  bogSyncCron: string;
  /** Cron expression for WDI sync (default: midnight on 1st of Jan, Apr, Jul, Oct) */
  wdiSyncCron: string;
  /** Cron expression for FX cache update (default: every 5 minutes) */
  fxUpdateCron: string;
  /** Cron expression for daily FX persistence (default: 5 PM weekdays) */
  fxDailyCron: string;
  
  // === Construction Data ===
  /** Cron expression for NPA fuel prices (default: 9 AM on 1st and 15th of month) */
  fuelSyncCron: string;
  /** Cron expression for material prices (default: 10 AM on 1st of month) */
  materialSyncCron: string;
  /** Cron expression for labor rates (default: 11 AM on 1st of month) */
  laborSyncCron: string;
  /** Cron expression for construction index recalculation (default: 12 PM on 1st of month) */
  indexRecalcCron: string;
  /** Cron expression for base cost calculation (default: 1 PM on 1st of month, after index recalc) */
  baseCostRecalcCron: string;
  
  // === General ===
  /** Timezone for all scheduled jobs */
  timezone: string;
  /** Enable/disable scheduler */
  enabled: boolean;
  /** Enable/disable construction data scheduling */
  constructionEnabled: boolean;
}

/**
 * Default scheduler configuration from environment or defaults
 */
const DEFAULT_CONFIG: SchedulerConfig = {
  // Economic data
  bogSyncCron: process.env.BOG_SYNC_CRON || '0 8 1 * *',           // 8 AM on 1st of month
  wdiSyncCron: process.env.WDI_SYNC_CRON || '0 0 1 */3 *',         // Midnight on 1st of Jan, Apr, Jul, Oct
  fxUpdateCron: process.env.FX_UPDATE_CRON || '*/5 * * * *',       // Every 5 minutes
  fxDailyCron: process.env.FX_DAILY_CRON || '0 17 * * 1-5',        // 5 PM on weekdays
  
  // Construction data (Ghana NPA updates fuel prices bi-weekly)
  fuelSyncCron: process.env.FUEL_SYNC_CRON || '0 9 1,15 * *',      // 9 AM on 1st and 15th
  materialSyncCron: process.env.MATERIAL_SYNC_CRON || '0 10 1 * *', // 10 AM on 1st of month
  laborSyncCron: process.env.LABOR_SYNC_CRON || '0 11 1 * *',      // 11 AM on 1st of month
  indexRecalcCron: process.env.INDEX_RECALC_CRON || '0 12 1 * *',  // 12 PM on 1st of month (after all syncs)
  baseCostRecalcCron: process.env.BASE_COST_RECALC_CRON || '0 13 1 * *', // 1 PM on 1st (after index recalc)
  
  // General
  timezone: process.env.SCHEDULER_TIMEZONE || 'Africa/Accra',
  enabled: process.env.ECONOMIC_SCHEDULER_ENABLED !== 'false',
  constructionEnabled: process.env.CONSTRUCTION_SCHEDULER_ENABLED !== 'false',
};

/**
 * Job status tracking
 */
interface JobStatus {
  name: string;
  cronExpression: string;
  lastRun: Date | null;
  lastStatus: 'success' | 'failed' | 'running' | null;
  nextRun: Date | null;
  runCount: number;
  errorCount: number;
}

/**
 * Economic Data Scheduler
 * 
 * Manages scheduled jobs for economic data synchronization.
 */
export class EconomicDataScheduler {
  private jobs: Map<string, ScheduledTask> = new Map();
  private jobStatus: Map<string, JobStatus> = new Map();
  private isRunning = false;
  private config: SchedulerConfig;

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start all scheduled jobs
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Economic data scheduler already running');
      return;
    }

    if (!this.config.enabled) {
      logger.info('Economic data scheduler disabled by configuration');
      return;
    }

    logger.info('Starting economic data scheduler', {
      bogSyncCron: this.config.bogSyncCron,
      wdiSyncCron: this.config.wdiSyncCron,
      fxUpdateCron: this.config.fxUpdateCron,
      fxDailyCron: this.config.fxDailyCron,
      fuelSyncCron: this.config.fuelSyncCron,
      materialSyncCron: this.config.materialSyncCron,
      laborSyncCron: this.config.laborSyncCron,
      indexRecalcCron: this.config.indexRecalcCron,
      timezone: this.config.timezone,
      constructionEnabled: this.config.constructionEnabled,
    });

    // =====================================================
    // ECONOMIC DATA JOBS
    // =====================================================

    // Bank of Ghana monthly sync
    this.scheduleJob('bog-sync', this.config.bogSyncCron, async () => {
      await this.runBOGSync();
    });

    // World Bank WDI quarterly sync
    this.scheduleJob('wdi-sync', this.config.wdiSyncCron, async () => {
      await this.runWDISync();
    });

    // Real-time FX cache update (silent, no persistence)
    this.scheduleJob('fx-cache-update', this.config.fxUpdateCron, async () => {
      await this.runFXCacheUpdate();
    });

    // Daily FX close - save to database
    this.scheduleJob('fx-daily-save', this.config.fxDailyCron, async () => {
      await this.runFXDailySave();
    });

    // =====================================================
    // CONSTRUCTION DATA JOBS
    // =====================================================
    
    if (this.config.constructionEnabled) {
      // NPA Fuel Prices - bi-weekly (affects transport costs)
      this.scheduleJob('npa-fuel-sync', this.config.fuelSyncCron, async () => {
        await this.runFuelSync();
      });

      // Local Material Prices - monthly
      this.scheduleJob('material-price-sync', this.config.materialSyncCron, async () => {
        await this.runMaterialSync();
      });

      // GSS Labor Rates - monthly
      this.scheduleJob('labor-rate-sync', this.config.laborSyncCron, async () => {
        await this.runLaborSync();
      });

      // Construction Index Recalculation - monthly (runs after all data syncs)
      this.scheduleJob('construction-index-recalc', this.config.indexRecalcCron, async () => {
        await this.runConstructionIndexRecalculation();
      });

      // Base Cost per SQM Recalculation - monthly (runs after index recalc)
      this.scheduleJob('base-cost-recalc', this.config.baseCostRecalcCron, async () => {
        await this.runBaseCostRecalculation();
      });

      logger.info('Construction data scheduling enabled');
    } else {
      logger.info('Construction data scheduling disabled by configuration');
    }

    this.isRunning = true;
    logger.info('Economic data scheduler started successfully', {
      jobCount: this.jobs.size,
    });
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    if (!this.isRunning) {
      logger.warn('Scheduler is not running');
      return;
    }

    logger.info('Stopping economic data scheduler...');

    for (const [name, job] of this.jobs) {
      job.stop();
      logger.debug(`Stopped job: ${name}`);
    }

    this.jobs.clear();
    this.isRunning = false;
    logger.info('Economic data scheduler stopped');
  }

  /**
   * Get status of all scheduled jobs
   */
  getStatus(): Record<string, JobStatus> {
    const status: Record<string, JobStatus> = {};
    for (const [name, jobStatus] of this.jobStatus) {
      status[name] = { ...jobStatus };
    }
    return status;
  }

  /**
   * Check if scheduler is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Trigger immediate sync for a specific source
   * Accepts both lowercase ('bog') and uppercase ('BOG') source names
   */
  async triggerSync(source: SyncSource | 'all' | 'BOG' | 'WDI' | 'FX' | 'construction_all' | 'CONSTRUCTION_ALL'): Promise<void> {
    const normalizedSource = source.toLowerCase();
    logger.info(`Manual sync triggered for: ${source}`);

    if (normalizedSource === 'all') {
      await Promise.all([
        this.runBOGSync(),
        this.runWDISync(),
        this.runFXDailySave(),
        this.runFuelSync(),
        this.runMaterialSync(),
        this.runLaborSync(),
      ]);
      // Run index recalculation after all syncs complete
      await this.runConstructionIndexRecalculation();
    } else if (normalizedSource === 'bog') {
      await this.runBOGSync();
    } else if (normalizedSource === 'wdi') {
      await this.runWDISync();
    } else if (normalizedSource === 'fx') {
      await this.runFXDailySave();
    } else if (normalizedSource === 'construction_all') {
      // Run all construction syncs in sequence
      await this.runFuelSync();
      await this.runMaterialSync();
      await this.runLaborSync();
      await this.runConstructionIndexRecalculation();
    } else if (normalizedSource === 'npa') {
      await this.runFuelSync();
    } else if (normalizedSource === 'local_materials') {
      await this.runMaterialSync();
    } else if (normalizedSource === 'gss_labor') {
      await this.runLaborSync();
    }
  }

  /**
   * Schedule a job with error handling and status tracking
   */
  private scheduleJob(name: string, cronExpression: string, handler: () => Promise<void>): void {
    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      logger.error(`Invalid cron expression for job ${name}: ${cronExpression}`);
      return;
    }

    // Initialize status
    this.jobStatus.set(name, {
      name,
      cronExpression,
      lastRun: null,
      lastStatus: null,
      nextRun: null,
      runCount: 0,
      errorCount: 0,
    });

    // Create scheduled task
    const task = cron.schedule(
      cronExpression,
      async () => {
        const status = this.jobStatus.get(name)!;
        status.lastRun = new Date();
        status.lastStatus = 'running';
        status.runCount++;

        try {
          await handler();
          status.lastStatus = 'success';
        } catch (error) {
          status.lastStatus = 'failed';
          status.errorCount++;
          logger.error(`Scheduled job ${name} failed`, { error });
        }
      },
      {
        timezone: this.config.timezone,
      }
    );

    this.jobs.set(name, task);
    logger.debug(`Scheduled job: ${name}`, { cronExpression });
  }

  /**
   * Run BOG synchronization
   */
  private async runBOGSync(): Promise<void> {
    logger.info('[Scheduler] Running BOG sync...');
    try {
      const result = await economicDataSyncService.sync({
        source: 'bog',
        type: 'latest',
      });
      // Handle both single result and array
      const singleResult = Array.isArray(result) ? result[0] : result;
      logger.info('[Scheduler] BOG sync complete', {
        recordsSaved: singleResult?.records_saved ?? 0,
        duration: singleResult?.completed_at && singleResult?.started_at
          ? new Date(singleResult.completed_at).getTime() - new Date(singleResult.started_at).getTime()
          : null,
      });
    } catch (error) {
      logger.error('[Scheduler] BOG sync failed', { error });
      throw error;
    }
  }

  /**
   * Run WDI synchronization
   */
  private async runWDISync(): Promise<void> {
    logger.info('[Scheduler] Running WDI sync...');
    try {
      const result = await economicDataSyncService.sync({
        source: 'wdi',
        type: 'full',
      });
      // Handle both single result and array
      const singleResult = Array.isArray(result) ? result[0] : result;
      logger.info('[Scheduler] WDI sync complete', {
        recordsSaved: singleResult?.records_saved ?? 0,
        duration: singleResult?.completed_at && singleResult?.started_at
          ? new Date(singleResult.completed_at).getTime() - new Date(singleResult.started_at).getTime()
          : null,
      });
    } catch (error) {
      logger.error('[Scheduler] WDI sync failed', { error });
      throw error;
    }
  }

  /**
   * Update FX cache (no database persistence)
   */
  private async runFXCacheUpdate(): Promise<void> {
    try {
      // Just refresh the cache by fetching all rates
      await fxFeedService.getAllRates();
      // Silent success - don't log every 5 minutes
    } catch (error) {
      // Only log errors for cache updates
      logger.warn('[Scheduler] FX cache update failed', { error });
    }
  }

  /**
   * Save daily FX rates to database
   */
  private async runFXDailySave(): Promise<void> {
    logger.info('[Scheduler] Saving daily FX rates...');
    try {
      const result = await economicDataSyncService.sync({
        source: 'fx',
        type: 'latest',
      });
      // Handle both single result and array
      const singleResult = Array.isArray(result) ? result[0] : result;
      logger.info('[Scheduler] Daily FX rates saved', {
        recordsSaved: singleResult?.records_saved ?? 0,
      });
    } catch (error) {
      logger.error('[Scheduler] Daily FX save failed', { error });
      throw error;
    }
  }

  // =====================================================
  // CONSTRUCTION DATA SYNC METHODS
  // =====================================================

  /**
   * Run NPA Fuel Price synchronization
   * Fuel prices affect transport costs for construction materials
   */
  private async runFuelSync(): Promise<void> {
    logger.info('[Scheduler] Running NPA fuel price sync...');
    try {
      const result = await economicDataSyncService.sync({
        source: 'npa',
        type: 'latest',
        triggeredBy: 'scheduler',
      });
      const singleResult = Array.isArray(result) ? result[0] : result;
      logger.info('[Scheduler] NPA fuel sync complete', {
        recordsSaved: singleResult?.records_saved ?? 0,
        status: singleResult?.status,
      });
    } catch (error) {
      logger.error('[Scheduler] NPA fuel sync failed', { error });
      throw error;
    }
  }

  /**
   * Run Local Material Price synchronization
   * Scrapes construction material prices from ConstructionGhana.com
   */
  private async runMaterialSync(): Promise<void> {
    logger.info('[Scheduler] Running material price sync...');
    try {
      const result = await economicDataSyncService.sync({
        source: 'local_materials',
        type: 'latest',
        triggeredBy: 'scheduler',
      });
      const singleResult = Array.isArray(result) ? result[0] : result;
      logger.info('[Scheduler] Material price sync complete', {
        recordsSaved: singleResult?.records_saved ?? 0,
        materialsCount: singleResult?.metadata?.materials_count ?? 0,
        regionsCount: singleResult?.metadata?.regions_count ?? 0,
      });
    } catch (error) {
      logger.error('[Scheduler] Material price sync failed', { error });
      throw error;
    }
  }

  /**
   * Run GSS Labor Rate synchronization
   * Calculates labor rates from minimum wage × skill multipliers × regional factors
   */
  private async runLaborSync(): Promise<void> {
    logger.info('[Scheduler] Running GSS labor rate sync...');
    try {
      const result = await economicDataSyncService.sync({
        source: 'gss_labor',
        type: 'latest',
        triggeredBy: 'scheduler',
      });
      const singleResult = Array.isArray(result) ? result[0] : result;
      logger.info('[Scheduler] GSS labor sync complete', {
        recordsSaved: singleResult?.records_saved ?? 0,
      });
    } catch (error) {
      logger.error('[Scheduler] GSS labor sync failed', { error });
      throw error;
    }
  }

  /**
   * Recalculate Construction Cost Index
   * 
   * This runs AFTER all data syncs complete to update the composite index.
   * Uses the Laspeyres Price Index formula with weighted components:
   * - Materials (55% weight)
   * - Labor (30% weight)
   * - Equipment (10% weight)
   * - Overheads (5% weight)
   */
  private async runConstructionIndexRecalculation(): Promise<void> {
    logger.info('[Scheduler] Running construction index recalculation...');
    try {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      // Calculate component indices from current data
      const materialIndex = await this.calculateMaterialIndex();
      const laborIndex = await this.calculateLaborIndex();
      
      // Equipment and overhead indices use CPI as proxy (they track general inflation)
      const cpiData = await this.getLatestCPI();
      const equipmentIndex = cpiData ? cpiData * 0.95 : 108.0; // Equipment slightly lags CPI
      const overheadIndex = cpiData ? cpiData * 1.02 : 115.0;  // Overheads slightly exceed CPI

      // Weighted composite index (base year 2020 = 100)
      const components = [
        { name: 'Materials', weight: 0.55, value: materialIndex },
        { name: 'Labor', weight: 0.30, value: laborIndex },
        { name: 'Equipment', weight: 0.10, value: equipmentIndex },
        { name: 'Overheads', weight: 0.05, value: overheadIndex },
      ];

      const compositeIndex = components.reduce(
        (sum, comp) => sum + comp.weight * comp.value,
        0
      );

      // Update the construction cost index
      await constructionCostService.updateConstructionIndex({
        index_name: 'Ghana Construction Cost Index',
        index_value: Math.round(compositeIndex * 100) / 100,
        base_year: 2020,
        base_value: 100,
        period_start: periodStart,
        period_end: periodEnd,
        source: 'PropMetrik Calculation (Automated)',
        is_official: false,
        components,
        notes: `Automated monthly recalculation. Materials: ${materialIndex.toFixed(1)}, Labor: ${laborIndex.toFixed(1)}, Equipment: ${equipmentIndex.toFixed(1)}, Overheads: ${overheadIndex.toFixed(1)}`,
      });

      logger.info('[Scheduler] Construction index recalculation complete', {
        compositeIndex: compositeIndex.toFixed(2),
        materialIndex: materialIndex.toFixed(2),
        laborIndex: laborIndex.toFixed(2),
        period: `${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)}`,
      });
    } catch (error) {
      logger.error('[Scheduler] Construction index recalculation failed', { error });
      throw error;
    }
  }

  /**
   * Recalculate base costs per sqm for all regions/property types/quality levels
   * Uses material prices, labor rates, category weights, and economic adjustments
   */
  private async runBaseCostRecalculation(): Promise<void> {
    logger.info('[Scheduler] Running base cost recalculation...');
    try {
      const result = await baseCostCalculationService.recalculateAllBaseCosts();
      
      logger.info('[Scheduler] Base cost recalculation complete', {
        success: result.success,
        totalRecords: result.total_records,
        regionsCalculated: result.regions_calculated,
        errors: result.errors.length,
      });

      // Validate against actual completed projects if available
      const validation = await baseCostCalculationService.validateAgainstActual();
      if (validation.validation_count > 0) {
        logger.info('[Scheduler] Base cost validation results', {
          avgDeviation: `${validation.avg_deviation.toFixed(1)}%`,
          maxDeviation: `${validation.max_deviation.toFixed(1)}%`,
          sampleSize: validation.validation_count,
        });
      }
    } catch (error) {
      logger.error('[Scheduler] Base cost recalculation failed', { error });
      throw error;
    }
  }

  /**
   * Calculate material price index from current prices vs base period (Jan 2020)
   * Uses weighted average of material categories
   */
  private async calculateMaterialIndex(): Promise<number> {
    try {
      // Get current average prices by category (Greater Accra as baseline)
      const currentPrices = await constructionCostService.getMaterialPrices({ region: 'greater_accra' });
      
      if (!currentPrices || currentPrices.length === 0) {
        logger.warn('[Scheduler] No current material prices found, using default index');
        return 118.0; // Default if no data
      }

      // Base period prices (January 2020 - hardcoded baseline)
      // These represent the average prices in GHS when base index = 100
      const basePrices: Record<string, number> = {
        cement: 35.00,      // 50kg bag
        steel: 10.00,       // per kg
        sand: 800.00,       // per trip
        blocks: 3.50,       // per block
        roofing: 100.00,    // per sheet
        paint: 35.00,       // per gallon
        plumbing: 100.00,   // average item
        electrical: 50.00,  // average item
        tiles: 80.00,       // per box
        timber: 200.00,     // per piece
      };

      // Category weights from cost breakdown
      const weights: Record<string, number> = {
        cement: 0.15,
        steel: 0.20,
        sand: 0.08,
        blocks: 0.12,
        roofing: 0.10,
        paint: 0.08,
        plumbing: 0.08,
        electrical: 0.07,
        tiles: 0.06,
        timber: 0.06,
      };

      // Group current prices by category and get average
      const categoryAverages: Record<string, { sum: number; count: number }> = {};
      for (const price of currentPrices) {
        const cat = String(price.material_category).toLowerCase();
        if (!categoryAverages[cat]) {
          categoryAverages[cat] = { sum: 0, count: 0 };
        }
        categoryAverages[cat].sum += Number(price.price_ghs);
        categoryAverages[cat].count += 1;
      }

      // Calculate weighted index
      let weightedSum = 0;
      let totalWeight = 0;

      for (const [category, weight] of Object.entries(weights)) {
        const basePrice = basePrices[category];
        const currentAvg = categoryAverages[category];
        
        if (basePrice && currentAvg && currentAvg.count > 0) {
          const avgCurrentPrice = currentAvg.sum / currentAvg.count;
          const categoryIndex = (avgCurrentPrice / basePrice) * 100;
          weightedSum += categoryIndex * weight;
          totalWeight += weight;
        }
      }

      if (totalWeight === 0) {
        return 118.0; // Default
      }

      return weightedSum / totalWeight;
    } catch (error) {
      logger.error('[Scheduler] Material index calculation failed', { error });
      return 118.0; // Default on error
    }
  }

  /**
   * Calculate labor rate index from current rates vs base period (Jan 2020)
   */
  private async calculateLaborIndex(): Promise<number> {
    try {
      const currentRates = await constructionCostService.getLaborRates({ region: 'greater_accra' });
      
      if (!currentRates || currentRates.length === 0) {
        logger.warn('[Scheduler] No current labor rates found, using default index');
        return 112.0; // Default if no data
      }

      // Base daily rates in January 2020 when index = 100
      const baseRates: Record<string, number> = {
        laborer: 35.00,
        mason: 80.00,
        carpenter: 85.00,
        electrician: 100.00,
        plumber: 95.00,
        painter: 70.00,
        welder: 90.00,
        tiler: 85.00,
        roofer: 90.00,
        foreman: 120.00,
        supervisor: 150.00,
      };

      // Calculate average index across all labor categories
      let totalIndex = 0;
      let count = 0;

      for (const rate of currentRates) {
        const category = String(rate.labor_category).toLowerCase();
        const baseRate = baseRates[category];
        
        if (baseRate) {
          const categoryIndex = (Number(rate.rate_ghs) / baseRate) * 100;
          totalIndex += categoryIndex;
          count++;
        }
      }

      if (count === 0) {
        return 112.0; // Default
      }

      return totalIndex / count;
    } catch (error) {
      logger.error('[Scheduler] Labor index calculation failed', { error });
      return 112.0; // Default on error
    }
  }

  /**
   * Get latest CPI value for equipment/overhead proxy
   */
  private async getLatestCPI(): Promise<number | null> {
    try {
      // Try to get CPI from BOG economic data
      const { query } = await import('../../../database');
      const result = await query<{ value: number }>(
        `SELECT value FROM exchange_rates_historical 
         WHERE indicator_code = 'CPI' 
         ORDER BY period DESC LIMIT 1`
      );
      
      if (result.rows[0]) {
        // CPI is typically expressed as percentage, normalize to index
        return result.rows[0].value;
      }
      return null;
    } catch {
      return null;
    }
  }
}

// Export singleton instance
export const economicDataScheduler = new EconomicDataScheduler();
