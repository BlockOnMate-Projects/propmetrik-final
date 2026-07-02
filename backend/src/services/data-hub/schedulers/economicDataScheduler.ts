/**
 * Economic Data Scheduler
 * 
 * Manages automated synchronization of economic data from various sources:
 * - Bank of Ghana (BOG): Monthly sync on 1st of each month
 * - World Bank WDI: Quarterly sync
 * - FX Rates: Every 5 minutes for cache, daily for persistence
 * 
 * Also manages construction cost data synchronization:
 * - NPA Fuel Prices: Weekly (every Monday at 9 AM)
 * - Local Material Prices: Weekly (every Monday at 10 AM)
 * - GSS Labor Rates: Weekly (every Monday at 11 AM)
 * - Construction Index Recalculation: Weekly (every Monday after all data syncs complete)
 * 
 * Uses node-cron for scheduling with configurable cron expressions.
 */

import cron, { ScheduledTask } from 'node-cron';
import { logger } from '../../../utils/logger';
import { economicDataSyncService, SyncSource } from '../scrapers/syncService';
import { fxFeedService } from '../scrapers/fxFeedService';
import { bogDailyFxScraper } from '../scrapers/bogDailyFxScraper';
import { constructionCostService } from '../constructionCostService';
import { baseCostCalculationService } from '../baseCostCalculationService';
import { specializedCostService } from '../specializedCostService';
import { housingDemandScoreService } from '../../analytics/housingDemandScoreService';

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
  /** Cron expression for the official Bank of Ghana daily interbank FX scrape (default: 9:30 AM weekdays) */
  bogFxDailyCron: string;

  // === Construction Data ===
  /** Cron expression for NPA fuel prices (default: 9 AM every Monday) */
  fuelSyncCron: string;
  /** Cron expression for material prices (default: 10 AM every Monday) */
  materialSyncCron: string;
  /** Cron expression for labor rates (default: 11 AM every Monday) */
  laborSyncCron: string;
  /** Cron expression for construction index recalculation (default: 12 PM every Monday) */
  indexRecalcCron: string;
  /** Cron expression for base cost calculation (default: 1 PM every Monday, after index recalc) */
  baseCostRecalcCron: string;
  /** Cron expression for GREDA/BRRI specialized cost sync (default: 2 PM every Monday, after base cost recalc) */
  gredaSyncCron: string;
  /** Cron expression for specialized cost recalculation (default: 3 PM every Monday, after GREDA sync) */
  specializedCostRecalcCron: string;
  /** Cron expression for the daily construction-analytics freshness self-heal (default: 6 AM daily) */
  freshnessCheckCron: string;
  /** Cron expression for the monthly GSS household-income sync + affordability recompute (default: 4 AM on the 1st) */
  gssIncomeSyncCron: string;

  // === GSS StatsBank Macro (Slice 1) ===
  /** PPI + IIP sync — 15th of each month at 5 AM */
  gssPpiSyncCron: string;
  /** MIEG monthly sync — 20th at 5 AM */
  gssMiegSyncCron: string;
  /** Interest rates + Financial Soundness — monthly on 12th at 5 AM */
  gssFinancialSyncCron: string;

  // === GSS StatsBank Census (Slice 2) — annual ===
  /** PHC 2021 housing census backfill — Jan 1st at 2 AM */
  gssPhcHousingSyncCron: string;
  /** Trade HS2 construction import data — monthly on 10th at 5 AM */
  gssTradeImportSyncCron: string;

  // === GSS StatsBank Census (Slice 3) — annual ===
  /** PHC 2021 population + employment + poverty census — Jan 2nd at 2 AM (day after housing) */
  gssPhcPopEmpPovSyncCron: string;

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
  bogFxDailyCron: process.env.BOG_FX_DAILY_CRON || '30 9 * * 1-5', // 9:30 AM weekdays (after BoG publishes the day's interbank rate)

  // Construction data - weekly on Mondays (Ghana NPA updates fuel prices bi-weekly)
  fuelSyncCron: process.env.FUEL_SYNC_CRON || '0 9 * * 1',          // 9 AM every Monday
  materialSyncCron: process.env.MATERIAL_SYNC_CRON || '0 10 * * 1', // 10 AM every Monday
  laborSyncCron: process.env.LABOR_SYNC_CRON || '0 11 * * 1',      // 11 AM every Monday
  indexRecalcCron: process.env.INDEX_RECALC_CRON || '0 12 * * 1',  // 12 PM every Monday (after all syncs)
  baseCostRecalcCron: process.env.BASE_COST_RECALC_CRON || '0 13 * * 1', // 1 PM every Monday (after index recalc)
  gredaSyncCron: process.env.GREDA_SYNC_CRON || '0 14 * * 1',            // 2 PM every Monday (after base cost recalc)
  specializedCostRecalcCron: process.env.SPECIALIZED_COST_RECALC_CRON || '0 15 * * 1', // 3 PM every Monday (after GREDA sync)
  freshnessCheckCron: process.env.CONSTRUCTION_FRESHNESS_CRON || '0 6 * * *', // 6 AM daily — self-heal if computed tables go stale
  gssIncomeSyncCron: process.env.GSS_INCOME_SYNC_CRON || '0 4 1 * *', // 4 AM on the 1st — GSS income + affordability

  // GSS StatsBank Macro (Slice 1)
  gssPpiSyncCron: process.env.GSS_PPI_SYNC_CRON || '0 5 15 * *',           // 15th at 5 AM — PPI/IIP monthly
  gssMiegSyncCron: process.env.GSS_MIEG_SYNC_CRON || '0 5 20 * *',         // 20th at 5 AM — MIEG/GDP monthly
  gssFinancialSyncCron: process.env.GSS_FINANCIAL_SYNC_CRON || '0 5 12 * *', // 12th at 5 AM — rates/FSI monthly

  // GSS StatsBank Census (Slice 2)
  gssPhcHousingSyncCron: process.env.GSS_PHC_HOUSING_CRON || '0 2 1 1 *',   // Jan 1st at 2 AM — annual census
  gssTradeImportSyncCron: process.env.GSS_TRADE_SYNC_CRON || '0 5 10 * *',  // 10th at 5 AM — trade monthly

  // GSS StatsBank Census (Slice 3)
  gssPhcPopEmpPovSyncCron: process.env.GSS_PHC_POP_CRON || '0 2 2 1 *',     // Jan 2nd at 2 AM — annual census (day after housing)

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

    // Official Bank of Ghana daily interbank FX scrape (the settlement source of truth)
    this.scheduleJob('bog-fx-daily', this.config.bogFxDailyCron, async () => {
      await this.runBOGDailyFX();
    });

    // GSS regional household income (AHIES + PHC 2021, CPI-escalated) + affordability recompute.
    // Monthly: re-pulls the latest GSS earnings/census, re-escalates by live GSS CPI, then recomputes
    // the Housing Affordability Index from real sources. This is the income source the GHAI lacked.
    this.scheduleJob('gss-income-affordability', this.config.gssIncomeSyncCron, async () => {
      await this.runGSSIncomeAndAffordability();
    });

    // GSS StatsBank Macro data (Slice 1) — PPI, MIEG, Financial
    // These run weekly on Mondays (idempotent — only updates if GSS has published a new month).
    // Monthly definitive crons ensure we catch any Monday misses.
    this.scheduleJob('gss-ppi-sync', this.config.gssPpiSyncCron, async () => {
      await this.runGSSPpiSync();
    });

    this.scheduleJob('gss-mieg-sync', this.config.gssMiegSyncCron, async () => {
      await this.runGSSMiegSync();
    });

    this.scheduleJob('gss-financial-sync', this.config.gssFinancialSyncCron, async () => {
      await this.runGSSFinancialSync();
    });

    // GSS StatsBank Census (Slice 2) — PHC Housing and Trade HS2
    // PHC is annual (census is static); trade is monthly.
    this.scheduleJob('gss-phc-housing-sync', this.config.gssPhcHousingSyncCron, async () => {
      await this.runGSSPhcHousingSync();
    });

    this.scheduleJob('gss-trade-hs2-sync', this.config.gssTradeImportSyncCron, async () => {
      await this.runGSSTradeSync();
    });

    // GSS StatsBank Census (Slice 3) — PHC Population + Employment + Poverty (annual).
    // Recomputes the Regional Housing Demand Score (RHDS) after ingest.
    this.scheduleJob('gss-phc-pop-emp-pov-sync', this.config.gssPhcPopEmpPovSyncCron, async () => {
      await this.runGSSPhcSlice3Sync();
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

      // GREDA/BRRI Specialized Cost Sync - monthly (runs after base cost recalc)
      this.scheduleJob('greda-sync', this.config.gredaSyncCron, async () => {
        await this.runGREDASync();
      });

      // Specialized Cost Recalculation - monthly (runs after GREDA sync)
      this.scheduleJob('specialized-cost-recalc', this.config.specializedCostRecalcCron, async () => {
        await this.runSpecializedCostRecalculation();
      });

      // Daily freshness self-heal — recompute the construction index + base cost/sqm if their
      // computed tables go stale (a long-running instance that missed a weekly Monday window would
      // otherwise drift for weeks, as happened Apr–Jun 2026). Cheap when fresh (one COUNT/MAX query).
      this.scheduleJob('construction-freshness-check', this.config.freshnessCheckCron, async () => {
        await this.runFreshnessSelfHeal();
      });

      logger.info('Construction data scheduling enabled');
    } else {
      logger.info('Construction data scheduling disabled by configuration');
    }

    this.isRunning = true;
    logger.info('Economic data scheduler started successfully', {
      jobCount: this.jobs.size,
    });

    // Run catch-up check after startup (delayed to let server fully initialize)
    setTimeout(() => {
      this.runStartupCatchUp().catch(err => {
        logger.error('[Scheduler] Startup catch-up failed', { error: err });
      });
    }, 30_000); // 30 second delay
  }

  /**
   * Check for missed syncs on startup and run them if needed.
   * This handles the case where the container was restarted and missed
   * its weekly cron window.
   */
  private async runStartupCatchUp(): Promise<void> {
    logger.info('[Scheduler] Running startup catch-up check...');

    try {
      const { query: dbQuery } = await import('../../../database');

      // Check when each source last ran successfully
      const result = await dbQuery<{ source_name: string; last_sync: Date }>(`
        SELECT source_name, MAX(started_at) as last_sync
        FROM economic_data_sync_log
        WHERE status IN ('success', 'partial')
        GROUP BY source_name
      `);

      const lastSyncs = new Map<string, Date>();
      for (const row of result.rows) {
        lastSyncs.set(row.source_name, new Date(row.last_sync));
      }

      const now = new Date();
      const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
      const staleThreshold = new Date(now.getTime() - ONE_WEEK_MS);

      // Define sources and their catch-up actions
      const catchUpSources = [
        {
          logName: 'NPA Fuel Prices',
          lastSync: lastSyncs.get('NPA Fuel Prices'),
          run: () => this.runFuelSync(),
        },
        {
          logName: 'Local Material Prices (ConstructionGhana.com)',
          lastSync: lastSyncs.get('Local Material Prices (ConstructionGhana.com)'),
          run: () => this.runMaterialSync(),
        },
        {
          logName: 'GSS Labor Rates',
          lastSync: lastSyncs.get('GSS Labor Rates'),
          run: () => this.runLaborSync(),
        },
        {
          logName: 'Bank of Ghana',
          lastSync: lastSyncs.get('Bank of Ghana'),
          run: () => this.runBOGSync(),
        },
        {
          logName: 'GREDA/BRRI',
          lastSync: lastSyncs.get('GREDA/BRRI'),
          run: () => this.runGREDASync(),
        },
        {
          // Repopulates regional_household_income + the affordability index on a fresh deploy
          // (migration 260 clears the seeded affordability rows) or a missed monthly window.
          logName: 'GSS Regional Household Income',
          lastSync: lastSyncs.get('GSS Regional Household Income'),
          run: () => this.runGSSIncomeAndAffordability(),
        },
        // GSS StatsBank Macro (Slice 1) — check weekly cadence
        {
          logName: 'GSS StatsBank PPI/IIP',
          lastSync: lastSyncs.get('GSS StatsBank PPI/IIP'),
          run: () => this.runGSSPpiSync(),
        },
        {
          logName: 'GSS StatsBank MIEG/GDP',
          lastSync: lastSyncs.get('GSS StatsBank MIEG/GDP'),
          run: () => this.runGSSMiegSync(),
        },
        {
          logName: 'GSS StatsBank Financial',
          lastSync: lastSyncs.get('GSS StatsBank Financial'),
          run: () => this.runGSSFinancialSync(),
        },
        // GSS StatsBank Census (Slice 2) — check annual cadence
        {
          logName: 'GSS StatsBank PHC Housing',
          lastSync: lastSyncs.get('GSS StatsBank PHC Housing'),
          run: () => this.runGSSPhcHousingSync(),
        },
        {
          logName: 'GSS StatsBank Trade HS2',
          lastSync: lastSyncs.get('GSS StatsBank Trade HS2'),
          run: () => this.runGSSTradeSync(),
        },
        // GSS StatsBank Census (Slice 3) — check annual cadence.
        // Keyed on the population source; the runner also does employment + poverty + RHDS.
        {
          logName: 'GSS StatsBank PHC Population',
          lastSync: lastSyncs.get('GSS StatsBank PHC Population'),
          run: () => this.runGSSPhcSlice3Sync(),
        },
      ];

      const stale: string[] = [];

      for (const source of catchUpSources) {
        const isStale = !source.lastSync || source.lastSync < staleThreshold;
        if (isStale) {
          stale.push(source.logName);
        }
      }

      if (stale.length === 0) {
        logger.info('[Scheduler] All sources are up to date, no catch-up needed');
        return;
      }

      logger.info('[Scheduler] Stale sources detected, running catch-up', {
        staleSources: stale,
      });

      // Run stale syncs sequentially to avoid overwhelming external sources
      for (const source of catchUpSources) {
        const isStale = !source.lastSync || source.lastSync < staleThreshold;
        if (isStale) {
          try {
            logger.info(`[Scheduler] Catch-up: running ${source.logName}...`);
            await source.run();
            logger.info(`[Scheduler] Catch-up: ${source.logName} complete`);
          } catch (err) {
            logger.error(`[Scheduler] Catch-up: ${source.logName} failed`, { error: err });
          }
        }
      }

      // After data syncs, recalculate indices if any construction source was stale
      const constructionStale = stale.some(s =>
        ['NPA Fuel Prices', 'Local Material Prices (ConstructionGhana.com)', 'GSS Labor Rates', 'GREDA/BRRI'].includes(s)
      );

      if (constructionStale) {
        try {
          logger.info('[Scheduler] Catch-up: recalculating construction indices...');
          await this.runConstructionIndexRecalculation();
          await this.runBaseCostRecalculation();
          await this.runSpecializedCostRecalculation();
          logger.info('[Scheduler] Catch-up: construction index recalculation complete');
        } catch (err) {
          logger.error('[Scheduler] Catch-up: construction index recalculation failed', { error: err });
        }
      }

      logger.info('[Scheduler] Startup catch-up complete');
    } catch (error) {
      logger.error('[Scheduler] Startup catch-up check failed', { error });
    }
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
      await this.runBaseCostRecalculation();
      await this.runGREDASync();
      await this.runSpecializedCostRecalculation();
    } else if (normalizedSource === 'npa') {
      await this.runFuelSync();
    } else if (normalizedSource === 'local_materials') {
      await this.runMaterialSync();
    } else if (normalizedSource === 'gss_labor') {
      await this.runLaborSync();
    } else if (normalizedSource === 'gss_ppi') {
      await this.runGSSPpiSync();
    } else if (normalizedSource === 'gss_mieg') {
      await this.runGSSMiegSync();
    } else if (normalizedSource === 'gss_financial') {
      await this.runGSSFinancialSync();
    } else if (normalizedSource === 'gss_income') {
      await this.runGSSIncomeAndAffordability();
    } else if (normalizedSource === 'gss_phc_housing') {
      await this.runGSSPhcHousingSync();
    } else if (normalizedSource === 'gss_trade_hs2') {
      await this.runGSSTradeSync();
    } else if (normalizedSource === 'gss_phc_population' || normalizedSource === 'gss_phc_employment'
               || normalizedSource === 'gss_phc_poverty' || normalizedSource === 'gss_phc_slice3') {
      await this.runGSSPhcSlice3Sync();
    } else if (normalizedSource === 'gss_all') {
      await this.runGSSPpiSync();
      await this.runGSSMiegSync();
      await this.runGSSFinancialSync();
      await this.runGSSIncomeAndAffordability();
      await this.runGSSPhcHousingSync();
      await this.runGSSTradeSync();
      await this.runGSSPhcSlice3Sync();
    } else if (normalizedSource === 'greda') {
      await this.runGREDASync();
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

  private async runBOGDailyFX(): Promise<void> {
    logger.info('[Scheduler] Scraping Bank of Ghana daily interbank FX rates...');
    try {
      const result = await bogDailyFxScraper.syncDailyRates();
      logger.info('[Scheduler] BoG daily interbank FX synced', {
        saved: result.saved,
        currencies: result.currencies,
      });
    } catch (error) {
      logger.error('[Scheduler] BoG daily FX scrape failed', { error });
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
        source: 'PROPMETRIK Calculation (Automated)',
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
   * Daily freshness self-heal for the computed construction analytics.
   *
   * The construction index + base cost/sqm normally recompute on the weekly Monday cron (and on the
   * startup catch-up). But a long-running instance that misses a Monday window would otherwise leave
   * the computed tables stale for weeks (exactly what happened Apr 22 → Jun 30 2026 — they only
   * refreshed on the next restart). This daily check recomputes them if the latest computed row is
   * older than a week, so the dashboard Construction Index and DRC/Cost/Residual valuations never
   * silently drift on stale cost data again. Cheap when fresh (a single MAX() check, then no-op).
   */
  private async runFreshnessSelfHeal(): Promise<void> {
    try {
      const { query: dbQuery } = await import('../../../database');
      const res = await dbQuery<{ stale: boolean }>(
        `SELECT (
           COALESCE((SELECT MAX(created_at) FROM construction_cost_index_analytics), 'epoch') < NOW() - INTERVAL '7 days'
           OR COALESCE((SELECT MAX(updated_at) FROM base_costs_per_sqm), 'epoch') < NOW() - INTERVAL '7 days'
         ) AS stale`
      );
      if (!res.rows[0]?.stale) {
        return; // fresh — nothing to do (runs daily, silent on the happy path)
      }
      logger.warn('[Scheduler] Construction analytics stale (>7d) — running freshness self-heal recompute');
      await this.runConstructionIndexRecalculation();
      await this.runBaseCostRecalculation();
      await this.runSpecializedCostRecalculation();
      logger.info('[Scheduler] Construction analytics freshness self-heal complete');
    } catch (error) {
      logger.error('[Scheduler] Construction analytics freshness self-heal failed', { error });
    }
  }

  /**
   * Sync GSS regional household income (AHIES earnings + PHC 2021 census, CPI-escalated via GSS
   * cpi.px) and then recompute the Housing Affordability Index from real sources. Both steps are
   * isolated so an affordability failure never leaves the income unsynced.
   */
  private async runGSSIncomeAndAffordability(): Promise<void> {
    try {
      const { gssIncomeService } = await import('../gssIncomeService');
      const result = await gssIncomeService.syncRegionalHouseholdIncome('scheduler');
      logger.info('[Scheduler] GSS household income synced', {
        status: result.status, saved: result.records_saved,
      });
    } catch (error) {
      logger.error('[Scheduler] GSS household income sync failed', { error });
    }
    try {
      const { ghaiService } = await import('../../analytics/ghaiService');
      const rows = await ghaiService.computeAndStoreFromSources(new Date());
      logger.info('[Scheduler] Affordability index recomputed from real sources', { regions: rows.length });
    } catch (error) {
      logger.error('[Scheduler] Affordability recompute failed', { error });
    }
  }

  /** Sync GSS PPI + IIP. Idempotent — only upserts if GSS has a newer month. */
  private async runGSSPpiSync(): Promise<void> {
    logger.info('[Scheduler] Running GSS PPI/IIP sync...');
    try {
      const result = await economicDataSyncService.syncGSSPpi('scheduler');
      logger.info('[Scheduler] GSS PPI sync complete', {
        status: result.status, saved: result.records_saved,
      });
    } catch (error) {
      logger.error('[Scheduler] GSS PPI sync failed', { error });
    }
  }

  /** Sync GSS MIEG + Quarterly GDP. */
  private async runGSSMiegSync(): Promise<void> {
    logger.info('[Scheduler] Running GSS MIEG/GDP sync...');
    try {
      const result = await economicDataSyncService.syncGSSMieg('scheduler');
      logger.info('[Scheduler] GSS MIEG sync complete', {
        status: result.status, saved: result.records_saved,
      });
    } catch (error) {
      logger.error('[Scheduler] GSS MIEG sync failed', { error });
    }
  }

  /** Sync GSS Interest Rates + Financial Soundness Indicators. */
  private async runGSSFinancialSync(): Promise<void> {
    logger.info('[Scheduler] Running GSS Financial sync...');
    try {
      const result = await economicDataSyncService.syncGSSFinancial('scheduler');
      logger.info('[Scheduler] GSS Financial sync complete', {
        status: result.status, saved: result.records_saved,
      });
    } catch (error) {
      logger.error('[Scheduler] GSS Financial sync failed', { error });
    }
  }

  /** Sync GSS PHC 2021 Housing Census (annual). */
  private async runGSSPhcHousingSync(): Promise<void> {
    logger.info('[Scheduler] Running GSS PHC Housing census sync...');
    try {
      const result = await economicDataSyncService.syncGSSPhcHousing('scheduler');
      logger.info('[Scheduler] GSS PHC Housing sync complete', {
        status: result.status, saved: result.records_saved,
      });
    } catch (error) {
      logger.error('[Scheduler] GSS PHC Housing sync failed', { error });
    }
  }

  /** Sync GSS Trade HS2 construction import data (monthly). */
  private async runGSSTradeSync(): Promise<void> {
    logger.info('[Scheduler] Running GSS Trade HS2 sync...');
    try {
      const result = await economicDataSyncService.syncGSSTradeHs2('scheduler');
      logger.info('[Scheduler] GSS Trade HS2 sync complete', {
        status: result.status, saved: result.records_saved,
      });
    } catch (error) {
      logger.error('[Scheduler] GSS Trade HS2 sync failed', { error });
    }
  }

  /**
   * Sync GSS PHC 2021 Population + Employment + Poverty (Slice 3, annual), then
   * recompute the Regional Housing Demand Score (RHDS). Steps are isolated so a
   * single-source failure never blocks the rest of the chain.
   */
  private async runGSSPhcSlice3Sync(): Promise<void> {
    logger.info('[Scheduler] Running GSS PHC Slice 3 (population/employment/poverty) sync...');
    try {
      const pop = await economicDataSyncService.syncGSSPhcPopulation('scheduler');
      logger.info('[Scheduler] GSS PHC Population sync complete', { status: pop.status, saved: pop.records_saved });
    } catch (error) {
      logger.error('[Scheduler] GSS PHC Population sync failed', { error });
    }
    try {
      const emp = await economicDataSyncService.syncGSSPhcEmployment('scheduler');
      logger.info('[Scheduler] GSS PHC Employment sync complete', { status: emp.status, saved: emp.records_saved });
    } catch (error) {
      logger.error('[Scheduler] GSS PHC Employment sync failed', { error });
    }
    try {
      const pov = await economicDataSyncService.syncGSSPhcPoverty('scheduler');
      logger.info('[Scheduler] GSS PHC Poverty sync complete', { status: pov.status, saved: pov.records_saved });
    } catch (error) {
      logger.error('[Scheduler] GSS PHC Poverty sync failed', { error });
    }
    // Recompute RHDS composite from the freshly ingested population + employment data.
    try {
      const rhds = await housingDemandScoreService.computeAndStore();
      logger.info('[Scheduler] RHDS recompute complete', { regions: rhds.length });
    } catch (error) {
      logger.error('[Scheduler] RHDS recompute failed', { error });
    }
  }

  /**
   * Run GREDA/BRRI specialized construction cost sync
   */
  private async runGREDASync(): Promise<void> {
    logger.info('[Scheduler] Running GREDA/BRRI sync...');
    try {
      const result = await economicDataSyncService.sync({
        source: 'greda',
        type: 'latest',
        triggeredBy: 'scheduler',
      });

      const syncResult = Array.isArray(result) ? result[0] : result;
      logger.info('[Scheduler] GREDA/BRRI sync complete', {
        status: syncResult.status,
        fetched: syncResult.records_fetched,
        saved: syncResult.records_saved,
        metadata: syncResult.metadata,
      });
    } catch (error) {
      logger.error('[Scheduler] GREDA/BRRI sync failed', { error });
      throw error;
    }
  }

  /**
   * Recalculate derived specialized construction costs
   * Runs after base costs are updated, fills in any building functions
   * not covered by published GREDA/BRRI rates
   */
  private async runSpecializedCostRecalculation(): Promise<void> {
    logger.info('[Scheduler] Running specialized cost recalculation...');
    try {
      const result = await specializedCostService.recalculateDerivedCosts();
      
      logger.info('[Scheduler] Specialized cost recalculation complete', {
        success: result.success,
        totalCalculated: result.total_calculated,
        skippedPublished: result.skipped_published,
        errors: result.errors.length,
      });
    } catch (error) {
      logger.error('[Scheduler] Specialized cost recalculation failed', { error });
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
