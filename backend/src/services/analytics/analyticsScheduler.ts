/**
 * Centralized Analytics Scheduler
 *
 * One home for every *derived-analytics* compute-and-persist job. These build the
 * monthly snapshot/history tables that power the trend charts and forecasting
 * (CCI, GHAI, market price index, investment, valuation, RHDS). Without this,
 * the compute methods only ran on demand, so the history tables never accrued
 * points and forecasting/history stayed empty.
 *
 * Design:
 *   - Each job = compute + persist a snapshot into its history table.
 *   - Monthly cron (1st of month) refreshes them all.
 *   - A startup catch-up runs any job whose table has no snapshot for the current
 *     month, so a fresh deploy/restart self-heals immediately instead of waiting.
 *   - Jobs are isolated (one failure never blocks the others) and idempotent
 *     (each persist upserts per period, so re-running is safe).
 *
 * GSS data ingestion + the GSS-income→GHAI chain live in economicDataScheduler;
 * this scheduler owns the derived snapshots and also re-runs GHAI here so the
 * affordability history is guaranteed to advance monthly.
 *
 * @module services/analytics/analyticsScheduler
 */

import cron, { ScheduledTask } from 'node-cron';
import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { ghaiService } from './ghaiService';
import { constructionCostIndexService } from './constructionCostIndexService';
import { marketIntelligenceService } from './marketIntelligenceService';
import { capRateService } from './capRateService';
import { investmentScoringService } from './investmentScoringService';
import { valuationAnalyticsService } from './valuationAnalyticsService';
import { housingDemandScoreService } from './housingDemandScoreService';
import { gssFinancialService } from '../data-hub/scrapers/gssFinancialService';
import { bogChartsPdfService } from '../data-hub/scrapers/bogChartsPdfService';
import { floodRiskService } from '../../../shared-services/risk/floodRiskService';

interface AnalyticsJob {
  name: string;
  /** Table + date column used to decide whether the current month is already covered. */
  freshness?: { table: string; column: string };
  run: () => Promise<void>;
}

export class AnalyticsScheduler {
  private tasks: ScheduledTask[] = [];
  private readonly timezone = process.env.SCHEDULER_TIMEZONE || 'Africa/Accra';
  private readonly enabled = process.env.ANALYTICS_SCHEDULER_ENABLED !== 'false';
  // Monthly snapshots: 1st of month at 03:30. Flood MV refresh: daily 04:00.
  private readonly monthlyCron = process.env.ANALYTICS_SNAPSHOT_CRON || '30 3 1 * *';
  private readonly floodRefreshCron = process.env.ANALYTICS_FLOOD_REFRESH_CRON || '0 4 * * *';

  /** All monthly compute-and-persist jobs. */
  private monthlyJobs(): AnalyticsJob[] {
    const now = new Date();
    // Normalize the GHAI snapshot to the first of the current month so re-runs on
    // any day within a month upsert the SAME (calculation_date, region) row rather
    // than creating an intra-month duplicate. The other snapshots already key on a
    // period_date their services normalize internally.
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return [
      {
        // No freshness → always attempts (idempotent upsert per data month). Must run
        // BEFORE the mortgage job so the mortgage rate is derived from the CURRENT BoG
        // lending rate rather than the lagged GSS observation. Best-effort: if the BoG
        // PDF is unreachable, the mortgage job falls back to the latest GSS lending rate.
        name: 'BoG interest rates (monthly charts PDF)',
        run: async () => { await bogChartsPdfService.refresh(); },
      },
      {
        // No freshness → always refreshes (idempotent upsert per month). Must run
        // BEFORE GHAI so GHAI reads the fresh mortgage rate rather than the seed.
        name: 'Mortgage rate (from live lending rate)',
        run: async () => { await gssFinancialService.refreshMortgageRate(); },
      },
      {
        name: 'GHAI (housing affordability)',
        freshness: { table: 'housing_affordability_index', column: 'calculation_date' },
        run: async () => { await ghaiService.computeAndStoreFromSources(monthStart); },
      },
      {
        name: 'CCI (construction cost index)',
        freshness: { table: 'construction_cost_index_analytics', column: 'period_date' },
        run: async () => { await constructionCostIndexService.computeAndStoreSnapshot(now, 'monthly'); },
      },
      {
        name: 'Market price index',
        freshness: { table: 'property_price_index', column: 'period_date' },
        run: async () => { await marketIntelligenceService.computeAndStoreSnapshot(now); },
      },
      {
        name: 'Investment opportunity metrics',
        freshness: { table: 'investment_opportunity_metrics', column: 'period_date' },
        run: async () => { await investmentScoringService.computeAndStoreSnapshot(now); },
      },
      {
        name: 'Valuation analytics',
        freshness: { table: 'valuation_analytics_snapshots', column: 'snapshot_date' },
        run: async () => { await valuationAnalyticsService.computeAndStoreSnapshot(now, 'monthly'); },
      },
      {
        name: 'RHDS (regional housing demand)',
        freshness: { table: 'regional_housing_demand_scores', column: 'computed_at' },
        run: async () => { await housingDemandScoreService.computeAndStore(); },
      },
      {
        name: 'Rental yield analytics (cap-rate authority)',
        freshness: { table: 'rental_yield_analytics', column: 'period_date' },
        run: async () => { await capRateService.refreshRentalYieldAnalytics(now); },
      },
    ];
  }

  async start(): Promise<void> {
    if (!this.enabled) {
      logger.info('[AnalyticsScheduler] Disabled via ANALYTICS_SCHEDULER_ENABLED=false');
      return;
    }

    // Monthly snapshot refresh (all jobs).
    this.schedule('analytics-monthly-snapshots', this.monthlyCron, async () => {
      await this.runAll('cron-monthly');
    });

    // Daily flood-risk materialized-view refresh (optional — view may not exist yet).
    this.schedule('analytics-flood-refresh', this.floodRefreshCron, async () => {
      await this.refreshFloodView();
    });

    logger.info('[AnalyticsScheduler] Started', { monthlyCron: this.monthlyCron, floodRefreshCron: this.floodRefreshCron });

    // Self-heal on boot: run any job whose current month isn't covered yet.
    setTimeout(() => {
      this.runStartupCatchUp().catch(err => logger.error('[AnalyticsScheduler] Startup catch-up failed', { error: err?.message }));
    }, 90_000);
  }

  /** Run every monthly compute-and-persist job (isolated + logged). */
  async runAll(triggeredBy = 'manual'): Promise<{ name: string; ok: boolean; error?: string }[]> {
    logger.info('[AnalyticsScheduler] Running all analytics snapshots', { triggeredBy });
    const results: { name: string; ok: boolean; error?: string }[] = [];
    for (const job of this.monthlyJobs()) {
      try {
        await job.run();
        results.push({ name: job.name, ok: true });
        logger.info('[AnalyticsScheduler] Snapshot done', { job: job.name });
      } catch (err: any) {
        results.push({ name: job.name, ok: false, error: err?.message });
        logger.error('[AnalyticsScheduler] Snapshot failed', { job: job.name, error: err?.message });
      }
    }
    await this.refreshFloodView();
    return results;
  }

  /** On boot, run only the jobs whose history table has no row for the current month. */
  private async runStartupCatchUp(): Promise<void> {
    logger.info('[AnalyticsScheduler] Startup catch-up check');
    const jobs = this.monthlyJobs();
    const stale: AnalyticsJob[] = [];
    for (const job of jobs) {
      if (!job.freshness) { stale.push(job); continue; }
      const covered = await this.currentMonthCovered(job.freshness.table, job.freshness.column);
      if (!covered) stale.push(job);
    }
    if (stale.length === 0) {
      logger.info('[AnalyticsScheduler] All analytics snapshots current — no catch-up needed');
      return;
    }
    logger.info('[AnalyticsScheduler] Catch-up running stale snapshots', { jobs: stale.map(j => j.name) });
    for (const job of stale) {
      try {
        await job.run();
        logger.info('[AnalyticsScheduler] Catch-up snapshot done', { job: job.name });
      } catch (err: any) {
        logger.error('[AnalyticsScheduler] Catch-up snapshot failed', { job: job.name, error: err?.message });
      }
    }
  }

  /** True when the table already has a row dated within the current calendar month. */
  private async currentMonthCovered(table: string, column: string): Promise<boolean> {
    try {
      const r = await pool.query(
        `SELECT 1 FROM ${table}
         WHERE ${column} >= date_trunc('month', NOW())
         LIMIT 1`,
      );
      return (r.rowCount ?? 0) > 0;
    } catch (err: any) {
      // Missing table → treat as not covered so the job runs and (idempotently) creates data.
      if (err?.code === '42P01') return false;
      logger.warn('[AnalyticsScheduler] Freshness check failed', { table, error: err?.message });
      return true; // don't hammer on an unexpected error
    }
  }

  /** Refresh the flood-risk materialized view (non-fatal — the view may not be built). */
  private async refreshFloodView(): Promise<void> {
    try {
      await floodRiskService.refreshRiskScores();
      logger.info('[AnalyticsScheduler] Flood risk view refreshed');
    } catch (err: any) {
      if (err?.code !== '42P01') logger.warn('[AnalyticsScheduler] Flood view refresh skipped', { error: err?.message });
    }
  }

  private schedule(name: string, expr: string, handler: () => Promise<void>): void {
    if (!cron.validate(expr)) {
      logger.error('[AnalyticsScheduler] Invalid cron', { name, expr });
      return;
    }
    const task = cron.schedule(expr, () => {
      handler().catch(err => logger.error('[AnalyticsScheduler] Job error', { name, error: err?.message }));
    }, { timezone: this.timezone });
    this.tasks.push(task);
  }

  stop(): void {
    this.tasks.forEach(t => t.stop());
    this.tasks = [];
  }
}

export const analyticsScheduler = new AnalyticsScheduler();
