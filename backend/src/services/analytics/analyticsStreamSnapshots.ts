/**
 * Analytics stream — snapshot resolver + producers.
 *
 * `resolveSnapshot(channel)` returns the CURRENT value for a channel (sent to a
 * client the moment it subscribes, so it never waits for the next push).
 * `publishAllMarketPriceIndex(ts)` is the producer the daily analytics refresh
 * calls to push fresh values to subscribers.
 *
 * All values are read live from the same sources the REST API uses — nothing is
 * synthesised. Region channel scopes are normalised snake_case (`greater_accra`)
 * to match how the composite/demand tables key regions.
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { marketIntelligenceService } from './marketIntelligenceService';
import { alertService } from './alertService';
import { publishAnalyticsUpdate } from './analyticsStreamPublisher';

/** Normalise a region label to a channel scope key: "Greater Accra" → "greater_accra". */
export function regionKey(s: string): string {
  return String(s || '').toLowerCase().trim().replace(/\s+/g, '_');
}

/**
 * Current value for a channel, or null if the channel has no snapshot source yet.
 * Supported today: `market.price-index[.<region>]`, `macro.mieg`.
 */
export async function resolveSnapshot(channel: string): Promise<unknown | null> {
  const parts = channel.split('.');
  const top = parts[0];

  if (top === 'market' && parts[1] === 'price-index') {
    const scope = parts[2]; // optional region key
    const rows = await marketIntelligenceService.getPriceIndex({});
    const filtered = scope ? rows.filter((r) => regionKey(r.region) === scope) : rows;
    if (scope && filtered.length === 0) return null;
    return { region: scope ?? 'all', count: filtered.length, rows: filtered };
  }

  if (top === 'macro' && parts[1] === 'mieg') {
    const { rows } = await pool.query(
      `SELECT to_char(period_date,'YYYY-MM') AS period, index_value, growth_yoy_pct
         FROM gss_mieg_monthly
        WHERE variable = 'Total_MIEG'
        ORDER BY period_date DESC
        LIMIT 1`,
    );
    return rows[0] ?? null;
  }

  if (top === 'macro' && parts[1] === 'alerts') {
    const alerts = await alertService.getMacroAlertStatus();
    return { alerts, breached_count: alerts.filter((a) => a.breached).length };
  }

  return null;
}

/**
 * Producer: push the current macro alert status to `macro.alerts` subscribers.
 * Called by the analytics refresh sweep — an alert firing (or clearing) is a
 * real-time signal subscribers care about.
 */
export async function publishMacroAlerts(ts: number): Promise<void> {
  try {
    const alerts = await alertService.getMacroAlertStatus();
    await publishAnalyticsUpdate('macro.alerts', { alerts, breached_count: alerts.filter((a) => a.breached).length }, ts);
  } catch (err: any) {
    logger.warn('publishMacroAlerts failed', { error: err?.message });
  }
}

/**
 * Producer: push the fresh price index to every `market.price-index[.<region>]`
 * subscriber. Called by the daily analytics refresh after it recomputes the
 * market snapshot. Best-effort — never throws into the refresh sweep.
 */
export async function publishAllMarketPriceIndex(ts: number): Promise<void> {
  try {
    const rows = await marketIntelligenceService.getPriceIndex({});
    if (rows.length === 0) return;

    // Base channel: all regions.
    await publishAnalyticsUpdate('market.price-index', { region: 'all', count: rows.length, rows }, ts);

    // Per-region channels.
    const byRegion = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = regionKey(r.region);
      if (!byRegion.has(key)) byRegion.set(key, [] as typeof rows);
      byRegion.get(key)!.push(r);
    }
    for (const [key, regionRows] of byRegion) {
      await publishAnalyticsUpdate(`market.price-index.${key}`, { region: key, count: regionRows.length, rows: regionRows }, ts);
    }
  } catch (err: any) {
    logger.warn('publishAllMarketPriceIndex failed', { error: err?.message });
  }
}
