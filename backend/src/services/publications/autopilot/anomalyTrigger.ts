/**
 * Anomaly Trigger — BreakingSnapshotTrigger
 *
 * Runs every 30 minutes (via autopilotScheduler).
 * Checks analytics endpoints for data anomalies (sudden price spikes,
 * volume surges, index divergence, etc.).
 *
 * When an anomaly is detected:
 *  1. Check rate limits (max 2 breaking snapshots per day)
 *  2. Deduplicate: skip if same metric had a snapshot in last 48 h
 *  3. Fetch the EVENT_DRIVEN schedule for snapshot (adhoc)
 *  4. Fire autopilotPipeline.execute() with the schedule + anomaly context
 */
import { pool } from '../../../database';
import { logger } from '../../../utils/logger';
import { autopilotPipeline } from './autopilotPipeline';
import type {
  AutopilotSchedule,
  AnomalyThresholds,
  DetectedAnomaly,
} from './types';

// ============================================================
// DEFAULTS
// ============================================================

const DEFAULT_THRESHOLDS: AnomalyThresholds = {
  priceIndexChange: 5,     // 5 % GHPI move threshold
  cciSpike: 8,             // 8 % CCI move threshold
  vacancyShift: 2,         // 2 percentage-point shift
  volumeSpike: 100,        // 100 % above 30d average
  sentimentSwing: 5,       // 5 PSI point shift
};

const MAX_BREAKING_SNAPSHOTS_PER_DAY = 2;
const DEDUP_HOURS = 48;
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';

// ============================================================
// CLASS
// ============================================================

export class BreakingSnapshotTrigger {
  private thresholds: AnomalyThresholds;

  constructor(thresholds?: Partial<AnomalyThresholds>) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * Main entry — called on a regular interval by the scheduler.
   */
  async checkForAnomalies(): Promise<void> {
    logger.debug('Anomaly trigger running…');

    // 1. Rate-limit check
    const todayCount = await this.countTodayBreakingSnapshots();
    if (todayCount >= MAX_BREAKING_SNAPSHOTS_PER_DAY) {
      logger.debug({ todayCount }, 'Breaking snapshot rate limit reached — skipping anomaly check');
      return;
    }

    // 2. Collect latest metrics
    const anomalies = await this.detectAnomalies();
    if (anomalies.length === 0) {
      logger.debug('No anomalies detected');
      return;
    }

    logger.info({ count: anomalies.length }, 'Anomalies detected');

    // 3. Deduplicate — only fire for metrics not covered recently
    const fresh = await this.deduplicateAnomalies(anomalies);
    if (fresh.length === 0) {
      logger.info('All anomalies already covered by recent flashes');
      return;
    }

    // 4. Get the snapshot (adhoc) schedule
    const schedule = await this.getBreakingSnapshotSchedule();
    if (!schedule) {
      logger.warn('No snapshot (adhoc) autopilot schedule configured — cannot trigger');
      return;
    }

    // 5. Fire pipeline with anomaly context
    logger.info(
      { anomalyCount: fresh.length, metrics: fresh.map(a => a.metric) },
      'Triggering autonomous Breaking Snapshot',
    );

    try {
      // Inject anomaly data into the schedule's data_endpoints context
      const enrichedSchedule: AutopilotSchedule = {
        ...schedule,
        // Store anomaly context so pipeline can reference it
        data_endpoints: [
          ...schedule.data_endpoints,
          // Pseudo-endpoint that passes anomaly payload to pipeline
          ...fresh.map(a => `/api/v1/analytics/${a.metric}`),
        ],
      };

      // Attach anomaly details as extra JSON in data snapshot
      (enrichedSchedule as any).__anomalyContext = fresh;

      const result = await autopilotPipeline.execute(enrichedSchedule);
      logger.info(
        { status: result.status, publicationId: result.publicationId },
        'Breaking Snapshot triggered by anomaly — completed',
      );
    } catch (err) {
      logger.error({ error: (err as Error).message }, 'Breaking Snapshot anomaly trigger failed');
    }
  }

  // ============================================================
  // ANOMALY DETECTION
  // ============================================================

  /**
   * Hit lightweight analytics endpoints and check for threshold breaches.
   */
  private async detectAnomalies(): Promise<DetectedAnomaly[]> {
    const anomalies: DetectedAnomaly[] = [];

    const checks = [
      { metric: 'price-index', endpoint: '/api/v1/analytics/price-trends' },
      { metric: 'rental-yield', endpoint: '/api/v1/analytics/rental-analytics' },
      { metric: 'transaction-volume', endpoint: '/api/v1/analytics/market-volume' },
      { metric: 'cci', endpoint: '/api/v1/analytics/construction-cost' },
    ];

    const results = await Promise.allSettled(
      checks.map(async (check) => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10_000);

          const resp = await fetch(`${BASE_URL}${check.endpoint}?period=7d&summary=true`, {
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (!resp.ok) return null;
          const data = await resp.json();
          return { check, data };
        } catch {
          return null;
        }
      }),
    );

    for (const settledResult of results) {
      if (settledResult.status !== 'fulfilled' || !settledResult.value) continue;
      const { check, data } = settledResult.value;

      const anomaly = this.evaluateMetric(check.metric, data);
      if (anomaly) {
        anomalies.push(anomaly);
      }
    }

    return anomalies;
  }

  /**
   * Evaluate a single metric against thresholds.
   */
  private evaluateMetric(metric: string, data: any): DetectedAnomaly | null {
    try {
      // Try to find a percentage change in common shapes
      const pctChange = data?.percentChange ?? data?.summary?.percentChange ?? data?.changePct;
      const currentValue = data?.currentValue ?? data?.summary?.current ?? data?.value;
      const previousValue = data?.previousValue ?? data?.summary?.previous;
      const avgVolume = data?.avgVolume ?? data?.summary?.avgVolume;
      const currentVolume = data?.currentVolume ?? data?.summary?.currentVolume;

      // Check price/index change threshold
      if (pctChange !== undefined && Math.abs(pctChange) >= this.thresholds.priceIndexChange) {
        return {
          metric,
          endpoint: `/api/v1/analytics/${metric}`,
          currentValue: currentValue ?? pctChange,
          previousValue: previousValue ?? 0,
          change: pctChange,
          changeType: 'percent' as const,
          severity: Math.abs(pctChange) >= this.thresholds.priceIndexChange * 2 ? 'high' : 'moderate',
          detectedAt: new Date().toISOString(),
          description: `${metric} changed ${pctChange.toFixed(1)}% (threshold: ±${this.thresholds.priceIndexChange}%)`,
        };
      }

      // Check volume surge
      if (avgVolume && currentVolume) {
        const surgePercent = ((currentVolume / avgVolume) - 1) * 100;
        if (surgePercent >= this.thresholds.volumeSpike) {
          return {
            metric: `${metric}-volume`,
            endpoint: `/api/v1/analytics/${metric}`,
            currentValue: currentVolume,
            previousValue: avgVolume,
            change: surgePercent,
            changeType: 'percent' as const,
            severity: surgePercent >= this.thresholds.volumeSpike * 1.5 ? 'high' : 'moderate',
            detectedAt: new Date().toISOString(),
            description: `${metric} volume surged ${(currentVolume / avgVolume).toFixed(1)}× above 30-day average`,
          };
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  // ============================================================
  // DEDUPLICATION
  // ============================================================

  /**
   * Remove anomalies for metrics that already had a flash published
   * within the last DEDUP_HOURS.
   */
  private async deduplicateAnomalies(anomalies: DetectedAnomaly[]): Promise<DetectedAnomaly[]> {
    const cutoff = new Date(Date.now() - DEDUP_HOURS * 3600 * 1000).toISOString();

    const recentResult = await pool.query(
      `SELECT DISTINCT jsonb_array_elements_text(content_json->'anomalyMetrics') AS metric
       FROM publications
       WHERE product = 'snapshot'
         AND automation_mode = 'autopilot'
         AND published_at >= $1`,
      [cutoff],
    );

    const coveredMetrics = new Set(recentResult.rows.map(r => r.metric));

    return anomalies.filter(a => !coveredMetrics.has(a.metric));
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private async countTodayBreakingSnapshots(): Promise<number> {
    const result = await pool.query(
      `SELECT COUNT(*) FROM autopilot_runs
       WHERE product = 'snapshot'
         AND edition = 'adhoc'
         AND DATE(started_at) = CURRENT_DATE
         AND status IN ('published', 'deferred')`,
    );
    return parseInt(result.rows[0].count, 10);
  }

  private async getBreakingSnapshotSchedule(): Promise<AutopilotSchedule | null> {
    const result = await pool.query(
      `SELECT * FROM autopilot_schedules WHERE product = 'snapshot' AND edition = 'adhoc' AND enabled = true LIMIT 1`,
    );
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      ...row,
      chart_rules: typeof row.chart_rules === 'string' ? JSON.parse(row.chart_rules) : row.chart_rules,
      quality_thresholds: typeof row.quality_thresholds === 'string'
        ? JSON.parse(row.quality_thresholds)
        : row.quality_thresholds,
    } as AutopilotSchedule;
  }
}

// ── Singleton Export ──────────────────────────────────────────
export const anomalyTrigger = new BreakingSnapshotTrigger();
