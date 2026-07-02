/**
 * Analytics Refresh Scheduler
 *
 * Market Intelligence snapshots, Investment Scoring, Valuation Analytics and the
 * live cap-rate benchmarks are produced by `computeAndStoreSnapshot()` style methods
 * that read the freshly-scraped/market tables (`properties`, listings, `material_prices`)
 * and write computed snapshot rows — but they were ONLY reachable via manual
 * `POST /analytics/.../compute` endpoints, so they froze at the last manual trigger.
 * This job runs them on a schedule. Each step is isolated (one failure never blocks
 * the rest).
 *
 * NOT here (already scheduled elsewhere — do NOT duplicate):
 *  - Construction Cost Index + base cost/sqm (`base_costs_per_sqm`,
 *    `construction_cost_index_analytics`) are owned by `economicDataScheduler`
 *    (weekly Monday cron + startup) via `runConstructionIndexRecalculation` /
 *    `runBaseCostRecalculation`. Adding them here would create a second, divergent writer.
 *  - Housing Affordability Index — `ghaiService.computeAndStore` needs
 *    `median_household_income` per region, which has no DB source yet.
 *
 * @module jobs/analyticsRefreshJob
 */

import cron from 'node-cron';
import { logger } from '../utils/logger';
import { marketIntelligenceService } from '../services/analytics/marketIntelligenceService';
import { investmentScoringService } from '../services/analytics/investmentScoringService';
import { valuationAnalyticsService } from '../services/analytics/valuationAnalyticsService';
import { capRateService } from '../services/valuation-engine/CapRateService';
import { publishAllMarketPriceIndex, publishMacroAlerts } from '../services/analytics/analyticsStreamSnapshots';

let running = false;

// Ghana market segments for live cap-rate benchmark derivation. Segments with too
// few listings throw "insufficient data" and are skipped — that's expected.
const CAP_RATE_REGIONS = ['greater_accra', 'ashanti', 'eastern', 'western', 'central', 'northern', 'volta'];
const CAP_RATE_TYPES = ['residential_house', 'apartment_flat', 'commercial_shop', 'office', 'warehouse'];

/** Run one compute step, isolating failures so the sweep always continues. */
async function step(name: string, fn: () => Promise<unknown>): Promise<void> {
  const t = Date.now();
  try {
    await fn();
    logger.info(`Analytics refresh: ${name} OK`, { ms: Date.now() - t });
  } catch (e: any) {
    logger.error(`Analytics refresh: ${name} FAILED`, { error: e?.message });
  }
}

/** Recompute every platform analytics index from the latest scraped/market data. */
export async function refreshAllAnalytics(): Promise<void> {
  if (running) {
    logger.info('Analytics refresh: previous sweep still in progress, skipping this tick');
    return;
  }
  running = true;
  const now = new Date();
  logger.info('Analytics refresh: starting full sweep');
  try {
    await step('market_intelligence', () => marketIntelligenceService.computeAndStoreSnapshot(now));
    // Push the freshly-recomputed price index + macro alerts to WS subscribers.
    await step('stream_market_price_index', () => publishAllMarketPriceIndex(now.getTime()));
    await step('stream_macro_alerts', () => publishMacroAlerts(now.getTime()));
    await step('investment_scoring', () => investmentScoringService.computeAndStoreSnapshot(now));
    await step('valuation_analytics', () => valuationAnalyticsService.computeAndStoreSnapshot(now, 'monthly'));

    // Cap-rate benchmarks — derive per segment from live listings, then persist.
    let derived = 0;
    let skipped = 0;
    for (const region of CAP_RATE_REGIONS) {
      for (const propertyType of CAP_RATE_TYPES) {
        try {
          const result = await capRateService.deriveCapRateFromListings(region, propertyType);
          await capRateService.saveListingDerivedBenchmark(region, propertyType, result);
          derived++;
        } catch {
          skipped++; // insufficient listing data for this segment — expected
        }
      }
    }
    logger.info('Analytics refresh: cap-rate benchmarks', { derived, skipped });
  } finally {
    running = false;
    logger.info('Analytics refresh: sweep complete');
  }
}

/**
 * Schedule the full analytics recompute daily at 02:30 (off-peak; the raw scrape
 * tables land daily). Also runs once ~60s after startup to heal any staleness.
 */
export function initAnalyticsRefreshJob(): void {
  cron.schedule('30 2 * * *', () => { void refreshAllAnalytics(); });
  setTimeout(() => { void refreshAllAnalytics(); }, 60_000);
  logger.info('Analytics refresh job scheduled (daily 02:30 + startup sweep)');
}

// CLI runner — `tsx src/jobs/analyticsRefreshJob.ts`
if (require.main === module) {
  refreshAllAnalytics()
    .then(() => { console.log('Analytics refresh sweep completed'); process.exit(0); })
    .catch((error) => { console.error('Analytics refresh sweep failed:', error); process.exit(1); });
}
