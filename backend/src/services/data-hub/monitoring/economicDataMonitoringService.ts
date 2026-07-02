/**
 * Economic Data Monitoring Service
 * 
 * Monitors data freshness, source health, and generates alerts
 * for stale or missing economic data.
 * 
 * Configured thresholds (via environment variables):
 * - BOG_DATA_FRESHNESS_DAYS: Max days since last BOG data (default: 35)
 * - WDI_DATA_FRESHNESS_DAYS: Max days since last WDI data (default: 400)
 * - FX_DATA_FRESHNESS_MINUTES: Max minutes since last FX update (default: 10)
 */

import { query } from '../../../database';
import { cache } from '../../../database/redis';
import { logger } from '../../../utils/logger';

// =====================================================
// CONFIGURATION
// =====================================================

interface MonitoringConfig {
  bogFreshnessDays: number;
  wdiFreshnessDays: number;
  fxFreshnessMinutes: number;
  // GSS StatsBank (Slice 1)
  gssMacroFreshnessDays: number;    // monthly data — allow 40 days for GSS publication lag
  gssCensusFreshnessDays: number;   // census/survey data — annual refresh
  alertEmailEnabled: boolean;
  alertEmailTo: string;
  alertSlackEnabled: boolean;
  alertSlackWebhook: string;
}

const DEFAULT_CONFIG: MonitoringConfig = {
  bogFreshnessDays: parseInt(process.env.BOG_DATA_FRESHNESS_DAYS || '35', 10),
  wdiFreshnessDays: parseInt(process.env.WDI_DATA_FRESHNESS_DAYS || '400', 10),
  fxFreshnessMinutes: parseInt(process.env.FX_DATA_FRESHNESS_MINUTES || '10', 10),
  // GSS StatsBank
  gssMacroFreshnessDays: parseInt(process.env.GSS_MACRO_FRESHNESS_DAYS || '40', 10),
  gssCensusFreshnessDays: parseInt(process.env.GSS_CENSUS_FRESHNESS_DAYS || '400', 10),
  alertEmailEnabled: process.env.ALERT_EMAIL_ENABLED === 'true',
  alertEmailTo: process.env.ALERT_EMAIL_TO || '',
  alertSlackEnabled: process.env.ALERT_SLACK_ENABLED === 'true',
  alertSlackWebhook: process.env.ALERT_SLACK_WEBHOOK || '',
};

// =====================================================
// TYPES
// =====================================================

export type HealthStatus = 'healthy' | 'degraded' | 'critical' | 'unknown';
export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface DataFreshnessCheck {
  source: string;
  indicatorType?: string;
  lastUpdate: Date | null;
  thresholdDays: number;
  ageInDays: number | null;
  isStale: boolean;
  status: HealthStatus;
}

export interface SourceHealthReport {
  source: string;
  status: HealthStatus;
  lastSuccessfulSync: Date | null;
  lastFailedSync: Date | null;
  consecutiveFailures: number;
  successRate: number;
  totalSyncsLast30Days: number;
}

export interface MonitoringReport {
  timestamp: Date;
  overallStatus: HealthStatus;
  dataFreshness: DataFreshnessCheck[];
  sourceHealth: SourceHealthReport[];
  alerts: Alert[];
  metrics: {
    totalIndicators: number;
    indicatorsBySource: Record<string, number>;
    oldestData: Date | null;
    newestData: Date | null;
  };
}

export interface Alert {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  source?: string;
  createdAt: Date;
  resolvedAt?: Date;
  acknowledged: boolean;
}

// =====================================================
// MONITORING SERVICE
// =====================================================

export class EconomicDataMonitoringService {
  private config: MonitoringConfig;
  private readonly ALERT_CACHE_KEY = 'economic_monitoring:alerts';

  constructor(config: Partial<MonitoringConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check data freshness for all sources
   */
  async checkDataFreshness(): Promise<DataFreshnessCheck[]> {
    const checks: DataFreshnessCheck[] = [];

    // Check BOG data freshness
    const bogFreshness = await this.checkSourceFreshness(
      'Bank of Ghana',
      this.config.bogFreshnessDays
    );
    checks.push(bogFreshness);

    // Check WDI data freshness
    const wdiFreshness = await this.checkSourceFreshness(
      'World Bank WDI',
      this.config.wdiFreshnessDays
    );
    checks.push(wdiFreshness);

    // Check FX data freshness
    const fxFreshness = await this.checkFxFreshness();
    checks.push(fxFreshness);

    // GSS StatsBank Macro (Slice 1) — check dedicated sync log entries
    const gssTableChecks: Array<{ table: string; source: string; threshold: number }> = [
      { table: 'gss_ppi_construction_series', source: 'GSS StatsBank PPI/IIP',      threshold: this.config.gssMacroFreshnessDays },
      { table: 'gss_mieg_monthly',            source: 'GSS StatsBank MIEG/GDP',     threshold: this.config.gssMacroFreshnessDays },
      { table: 'gss_interest_rates_monthly',  source: 'GSS StatsBank Financial',    threshold: this.config.gssMacroFreshnessDays + 5 },
      { table: 'gss_financial_soundness_monthly', source: 'GSS StatsBank Financial (FSI)', threshold: this.config.gssMacroFreshnessDays + 5 },
      { table: 'regional_household_income',   source: 'GSS Regional Household Income', threshold: this.config.gssMacroFreshnessDays },
      // GSS StatsBank Census (Slice 2) — annual cadence
      { table: 'gss_phc_tenure_by_district',     source: 'GSS StatsBank PHC Housing (tenure)',     threshold: this.config.gssCensusFreshnessDays },
      { table: 'gss_phc_completion_by_district', source: 'GSS StatsBank PHC Housing (completion)', threshold: this.config.gssCensusFreshnessDays },
      { table: 'gss_phc_infrastructure_by_district', source: 'GSS StatsBank PHC Housing (infra)', threshold: this.config.gssCensusFreshnessDays },
      // GSS Trade (Slice 2b) — monthly
      { table: 'gss_construction_material_imports', source: 'GSS StatsBank Trade HS2', threshold: 70 },
      // GSS StatsBank Census (Slice 3) — annual cadence
      { table: 'gss_phc_population_projections',    source: 'GSS StatsBank PHC Population',   threshold: this.config.gssCensusFreshnessDays },
      { table: 'gss_phc_employment_by_district',    source: 'GSS StatsBank PHC Employment',   threshold: this.config.gssCensusFreshnessDays },
      { table: 'gss_phc_mpi_by_district',           source: 'GSS StatsBank PHC Poverty',      threshold: this.config.gssCensusFreshnessDays },
    ];
    for (const tc of gssTableChecks) {
      checks.push(await this.checkTableFreshness(tc.table, tc.source, tc.threshold));
    }

    return checks;
  }

  /**
   * Check freshness for a specific source
   */
  private async checkSourceFreshness(
    source: string,
    thresholdDays: number
  ): Promise<DataFreshnessCheck> {
    try {
      const result = await query(`
        SELECT MAX(effective_date) as last_update
        FROM economic_indicators
        WHERE source_name = $1
      `, [source]);

      const lastUpdate = result.rows[0]?.last_update;
      let ageInDays: number | null = null;
      let isStale = false;
      let status: HealthStatus = 'healthy';

      if (lastUpdate) {
        ageInDays = Math.floor(
          (Date.now() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60 * 24)
        );
        isStale = ageInDays > thresholdDays;

        if (isStale) {
          status = ageInDays > thresholdDays * 2 ? 'critical' : 'degraded';
        }
      } else {
        status = 'unknown';
      }

      return {
        source,
        lastUpdate: lastUpdate ? new Date(lastUpdate) : null,
        thresholdDays,
        ageInDays,
        isStale,
        status,
      };
    } catch (error) {
      logger.error('Failed to check data freshness', { source, error });
      return {
        source,
        lastUpdate: null,
        thresholdDays,
        ageInDays: null,
        isStale: true,
        status: 'unknown',
      };
    }
  }

  /**
   * Check freshness of a GSS-specific table by querying its MAX(synced_at).
   * Used for tables that don't write to economic_indicators (gss_ppi_*, gss_mieg_*, etc.).
   */
  private async checkTableFreshness(
    tableName: string,
    source: string,
    thresholdDays: number,
  ): Promise<DataFreshnessCheck> {
    try {
      const result = await query(
        `SELECT MAX(synced_at) AS last_update FROM ${tableName}`,
      );
      const lastUpdate = result.rows[0]?.last_update;
      let ageInDays: number | null = null;
      let isStale = false;
      let status: HealthStatus = 'healthy';

      if (lastUpdate) {
        ageInDays = Math.floor(
          (Date.now() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60 * 24),
        );
        isStale = ageInDays > thresholdDays;
        if (isStale) status = ageInDays > thresholdDays * 2 ? 'critical' : 'degraded';
      } else {
        // Table exists but no rows yet — not an error, just not seeded
        status = 'unknown';
      }

      return { source, lastUpdate: lastUpdate ? new Date(lastUpdate) : null, thresholdDays, ageInDays, isStale, status };
    } catch (error: any) {
      // Table not yet created (migration pending) — report as unknown, not critical
      if (error.code === '42P01') {
        return { source, lastUpdate: null, thresholdDays, ageInDays: null, isStale: false, status: 'unknown' };
      }
      logger.error('Failed to check GSS table freshness', { tableName, source, error });
      return { source, lastUpdate: null, thresholdDays, ageInDays: null, isStale: true, status: 'unknown' };
    }
  }

  /**
   * Check FX data freshness (uses cache timestamp)
   */
  private async checkFxFreshness(): Promise<DataFreshnessCheck> {
    const thresholdMinutes = this.config.fxFreshnessMinutes;
    const thresholdDays = thresholdMinutes / (60 * 24);

    try {
      // Check cache for recent FX data
      const cached = await cache.get<{ timestamp: string }>('fx_rate:USD');
      
      let lastUpdate: Date | null = null;
      let ageInDays: number | null = null;
      let isStale = true;
      let status: HealthStatus = 'unknown';

      if (cached?.timestamp) {
        lastUpdate = new Date(cached.timestamp);
        const ageInMinutes = (Date.now() - lastUpdate.getTime()) / (1000 * 60);
        ageInDays = ageInMinutes / (60 * 24);
        isStale = ageInMinutes > thresholdMinutes;

        if (!isStale) {
          status = 'healthy';
        } else if (ageInMinutes > thresholdMinutes * 2) {
          status = 'critical';
        } else {
          status = 'degraded';
        }
      }

      return {
        source: 'ForexRate-API',
        lastUpdate,
        thresholdDays,
        ageInDays,
        isStale,
        status,
      };
    } catch (error) {
      logger.error('Failed to check FX freshness', { error });
      return {
        source: 'ForexRate-API',
        lastUpdate: null,
        thresholdDays,
        ageInDays: null,
        isStale: true,
        status: 'unknown',
      };
    }
  }

  /**
   * Get health report for all sources
   */
  async getSourceHealth(): Promise<SourceHealthReport[]> {
    const reports: SourceHealthReport[] = [];
    const sources = ['Bank of Ghana', 'World Bank WDI', 'ForexRate-API'];

    for (const source of sources) {
      try {
        const result = await query(`
          WITH sync_stats AS (
            SELECT 
              source_name,
              status,
              started_at,
              completed_at,
              ROW_NUMBER() OVER (PARTITION BY source_name ORDER BY started_at DESC) as rn
            FROM economic_data_sync_log
            WHERE source_name = $1
              AND started_at > NOW() - INTERVAL '30 days'
          ),
          health_metrics AS (
            SELECT
              COUNT(*) as total_syncs,
              COUNT(*) FILTER (WHERE status = 'success') as successful_syncs,
              MAX(CASE WHEN status = 'success' THEN completed_at END) as last_success,
              MAX(CASE WHEN status = 'failed' THEN started_at END) as last_failure
            FROM sync_stats
          ),
          consecutive_failures AS (
            SELECT COUNT(*) as failures
            FROM sync_stats
            WHERE status = 'failed'
              AND rn <= (
                SELECT COALESCE(MIN(rn) - 1, (SELECT COUNT(*) FROM sync_stats WHERE status = 'failed'))
                FROM sync_stats 
                WHERE status = 'success'
              )
          )
          SELECT 
            h.*,
            COALESCE(c.failures, 0) as consecutive_failures
          FROM health_metrics h
          CROSS JOIN consecutive_failures c
        `, [source]);

        const stats = result.rows[0] || {};
        const totalSyncs = parseInt(stats.total_syncs || '0', 10);
        const successfulSyncs = parseInt(stats.successful_syncs || '0', 10);
        const consecutiveFailures = parseInt(stats.consecutive_failures || '0', 10);
        const successRate = totalSyncs > 0 ? (successfulSyncs / totalSyncs) * 100 : 0;

        let status: HealthStatus = 'healthy';
        if (consecutiveFailures >= 3 || successRate < 50) {
          status = 'critical';
        } else if (consecutiveFailures >= 1 || successRate < 80) {
          status = 'degraded';
        }

        reports.push({
          source,
          status,
          lastSuccessfulSync: stats.last_success ? new Date(stats.last_success) : null,
          lastFailedSync: stats.last_failure ? new Date(stats.last_failure) : null,
          consecutiveFailures,
          successRate: Math.round(successRate * 100) / 100,
          totalSyncsLast30Days: totalSyncs,
        });
      } catch (error) {
        logger.error('Failed to get source health', { source, error });
        reports.push({
          source,
          status: 'unknown',
          lastSuccessfulSync: null,
          lastFailedSync: null,
          consecutiveFailures: 0,
          successRate: 0,
          totalSyncsLast30Days: 0,
        });
      }
    }

    return reports;
  }

  /**
   * Get metrics about stored economic data
   */
  async getDataMetrics(): Promise<MonitoringReport['metrics']> {
    try {
      const result = await query(`
        SELECT 
          COUNT(*) as total,
          MIN(effective_date) as oldest,
          MAX(effective_date) as newest
        FROM economic_indicators
      `);

      const bySourceResult = await query(`
        SELECT source_name, COUNT(*) as count
        FROM economic_indicators
        GROUP BY source_name
      `);

      const indicatorsBySource: Record<string, number> = {};
      for (const row of bySourceResult.rows) {
        indicatorsBySource[row.source_name] = parseInt(row.count, 10);
      }

      return {
        totalIndicators: parseInt(result.rows[0]?.total || '0', 10),
        indicatorsBySource,
        oldestData: result.rows[0]?.oldest ? new Date(result.rows[0].oldest) : null,
        newestData: result.rows[0]?.newest ? new Date(result.rows[0].newest) : null,
      };
    } catch (error) {
      logger.error('Failed to get data metrics', { error });
      return {
        totalIndicators: 0,
        indicatorsBySource: {},
        oldestData: null,
        newestData: null,
      };
    }
  }

  /**
   * Generate full monitoring report
   */
  async getFullReport(): Promise<MonitoringReport> {
    const [freshness, health, metrics] = await Promise.all([
      this.checkDataFreshness(),
      this.getSourceHealth(),
      this.getDataMetrics(),
    ]);

    // Determine overall status
    const statuses = [
      ...freshness.map((f) => f.status),
      ...health.map((h) => h.status),
    ];

    let overallStatus: HealthStatus = 'healthy';
    if (statuses.includes('critical')) {
      overallStatus = 'critical';
    } else if (statuses.includes('degraded')) {
      overallStatus = 'degraded';
    } else if (statuses.includes('unknown')) {
      overallStatus = 'degraded';
    }

    // Generate alerts based on findings
    const alerts = await this.generateAlerts(freshness, health);

    return {
      timestamp: new Date(),
      overallStatus,
      dataFreshness: freshness,
      sourceHealth: health,
      alerts,
      metrics,
    };
  }

  /**
   * Generate alerts based on monitoring data
   */
  private async generateAlerts(
    freshness: DataFreshnessCheck[],
    health: SourceHealthReport[]
  ): Promise<Alert[]> {
    const alerts: Alert[] = [];

    // Check for stale data
    for (const check of freshness) {
      if (check.isStale && check.status !== 'healthy') {
        alerts.push({
          id: `stale_data_${check.source.replace(/\s+/g, '_').toLowerCase()}`,
          severity: check.status === 'critical' ? 'critical' : 'warning',
          title: `Stale data from ${check.source}`,
          message: check.ageInDays !== null
            ? `Data is ${Math.round(check.ageInDays)} days old (threshold: ${check.thresholdDays} days)`
            : `No data available from ${check.source}`,
          source: check.source,
          createdAt: new Date(),
          acknowledged: false,
        });
      }
    }

    // Check for unhealthy sources
    for (const source of health) {
      if (source.consecutiveFailures >= 3) {
        alerts.push({
          id: `sync_failures_${source.source.replace(/\s+/g, '_').toLowerCase()}`,
          severity: 'critical',
          title: `${source.source} sync failing`,
          message: `${source.consecutiveFailures} consecutive sync failures. Success rate: ${source.successRate}%`,
          source: source.source,
          createdAt: new Date(),
          acknowledged: false,
        });
      } else if (source.successRate < 80 && source.totalSyncsLast30Days > 0) {
        alerts.push({
          id: `low_success_rate_${source.source.replace(/\s+/g, '_').toLowerCase()}`,
          severity: 'warning',
          title: `Low sync success rate for ${source.source}`,
          message: `Success rate is ${source.successRate}% over the last 30 days`,
          source: source.source,
          createdAt: new Date(),
          acknowledged: false,
        });
      }
    }

    return alerts;
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(): Promise<Alert[]> {
    const report = await this.getFullReport();
    return report.alerts.filter((a) => !a.resolvedAt);
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string): Promise<void> {
    const cachedAlerts = await cache.get<Alert[]>(this.ALERT_CACHE_KEY) || [];
    const updatedAlerts = cachedAlerts.map((a) =>
      a.id === alertId ? { ...a, acknowledged: true } : a
    );
    await cache.set(this.ALERT_CACHE_KEY, updatedAlerts, 86400);
    logger.info('Alert acknowledged', { alertId });
  }

  /**
   * Send alert notifications (email/slack)
   */
  async sendAlertNotifications(alerts: Alert[]): Promise<void> {
    const criticalAlerts = alerts.filter((a) => a.severity === 'critical' && !a.acknowledged);
    
    if (criticalAlerts.length === 0) return;

    // Log alerts (actual email/slack integration would go here)
    logger.warn('Critical alerts detected', {
      count: criticalAlerts.length,
      alerts: criticalAlerts.map((a) => ({ id: a.id, title: a.title })),
    });

    // TODO: Implement email notification
    if (this.config.alertEmailEnabled && this.config.alertEmailTo) {
      logger.info('Would send email alert to', { to: this.config.alertEmailTo });
      // await sendEmail({ to: this.config.alertEmailTo, ... });
    }

    // TODO: Implement Slack notification
    if (this.config.alertSlackEnabled && this.config.alertSlackWebhook) {
      logger.info('Would send Slack alert');
      // await sendSlackMessage({ webhook: this.config.alertSlackWebhook, ... });
    }
  }
}

// Export singleton
export const economicDataMonitoringService = new EconomicDataMonitoringService();
