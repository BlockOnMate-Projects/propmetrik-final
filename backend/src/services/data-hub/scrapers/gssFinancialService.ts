/**
 * GSS Financial Service (Slice 1 — P1 Monthly Macro)
 *
 * Fetches Interest Rates and Financial Soundness Indicators from the
 * GSS StatsBank PxWeb API and persists them into:
 *   - gss_interest_rates_monthly       (interest.px)
 *   - gss_financial_soundness_monthly  (fin_sound.px)
 *
 * Dual purpose:
 *   1. Resilient fallback for BOG lending rate (BOG website scraper can break)
 *   2. NPL ratio → macro_risk_penalty in investmentScoringService
 *
 * @module services/data-hub/scrapers/gssFinancialService
 */

import https from 'https';
import { query } from '../../../database';
import { logger } from '../../../utils/logger';
import { syncLogRepository } from './syncLogRepository';
import type { SyncResult } from './types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const STATSBANK_HOST = process.env.GSS_STATSBANK_HOST || 'statsbank.statsghana.gov.gh';
const MACRO_DB = '/api/v1/en/Macroeconomic%20Indicators';
const INTEREST_PATH = `${MACRO_DB}/Monetary%20and%20Financial%20Sector/interest.px`;
const FSI_PATH = `${MACRO_DB}/Monetary%20and%20Financial%20Sector/fin_sound.px`;

const INTEREST_RATES = [
  'Average lending rate',
  'Ghana reference rate',
  'Interbank weighted average rate',
  'Monetary policy rate',
  'Savings deposits rate',
  'Treasury bill rate (91-day)',
];

const FSI_INDICATORS = [
  'Capital adequacy ratio',
  'Core liquid assets to short-term liabilities',
  'Core liquid assets to total assets',
  'Non performing loan ratio',
  'Operational cost/income',
  'Return on assets',
  'Return on equity',
  'Total cost to gross income ratio',
];

// ---------------------------------------------------------------------------
// PxWeb helpers
// ---------------------------------------------------------------------------

interface PxStat2 {
  value: (number | null)[];
  dimension: Record<string, { category: { index: Record<string, number>; label: Record<string, string> } }>;
  updated?: string;
}
interface PxMeta {
  variables: Array<{ code: string; values: string[]; valueTexts: string[]; updated?: string }>;
  updated?: string;
}

function pxPost(path: string, queryBody: unknown): Promise<PxStat2> {
  const body = JSON.stringify({ query: queryBody, response: { format: 'json-stat2' } });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: 'POST', hostname: STATSBANK_HOST, path,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'User-Agent': 'propmetrik-datahub' },
        timeout: 60000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (!res.statusCode || res.statusCode >= 400) { reject(new Error(`GSS ${res.statusCode}: ${data.slice(0, 300)}`)); return; }
          try { resolve(JSON.parse(data) as PxStat2); } catch (e) { reject(new Error(`Parse: ${(e as Error).message}`)); }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`GSS timeout: ${path}`)));
    req.write(body);
    req.end();
  });
}

function pxGet(path: string): Promise<PxMeta> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      { hostname: STATSBANK_HOST, path, headers: { 'User-Agent': 'propmetrik-datahub' }, timeout: 30000 },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => { try { resolve(JSON.parse(data) as PxMeta); } catch (e) { reject(e); } });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`GSS meta timeout: ${path}`)));
  });
}

/** Convert GSS month code '2024M07' → first-of-month Date UTC. */
function monthCodeToDate(code: string): Date {
  const m = /^(\d{4})M(\d{2})$/.exec(code);
  if (!m) throw new Error(`Invalid month code: ${code}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
}

// ---------------------------------------------------------------------------
// Interest Rates fetch + upsert
// ---------------------------------------------------------------------------

async function fetchInterestRates(rateTypes: string[]): Promise<{
  rateType: string;
  monthCode: string;
  ratePct: number;
  sourceUpdated: string | null;
}[]> {
  const meta = await pxGet(INTEREST_PATH);
  const sourceUpdated = meta.updated ?? null;

  const rateVar = meta.variables.find((v) => v.code === 'Rate');
  const availableRates = rateVar?.values ?? [];
  const wantedRates = rateTypes.filter((r) => availableRates.includes(r));
  if (wantedRates.length === 0) {
    logger.warn('[GSS-Financial] No matching rate types found, fetching all available');
    wantedRates.push(...availableRates);
  }

  const px = await pxPost(INTEREST_PATH, [
    { code: 'Rate', selection: { filter: 'item', values: wantedRates } },
    { code: 'Month', selection: { filter: 'all', values: ['*'] } },
  ]);

  const rateDim = px.dimension.Rate;
  const monthDim = px.dimension.Month;
  if (!rateDim || !monthDim) return [];

  const nMonths = Object.keys(monthDim.category.index).length;
  const rows: ReturnType<typeof fetchInterestRates> extends Promise<infer T> ? T : never = [];

  for (const [rCode, rIdx] of Object.entries(rateDim.category.index)) {
    const rLabel = rateDim.category.label[rCode] ?? rCode;
    for (const [mCode, mIdx] of Object.entries(monthDim.category.index)) {
      const mLabel = monthDim.category.label[mCode] ?? mCode;
      const val = px.value[rIdx * nMonths + mIdx];
      if (typeof val === 'number') {
        (rows as any[]).push({ rateType: rLabel, monthCode: mLabel, ratePct: val, sourceUpdated });
      }
    }
  }

  return rows as any;
}

async function upsertInterestRates(rows: Awaited<ReturnType<typeof fetchInterestRates>>): Promise<number> {
  let saved = 0;
  for (const row of rows) {
    let periodDate: string;
    try { periodDate = monthCodeToDate(row.monthCode).toISOString().slice(0, 10); } catch { continue; }
    await query(
      `INSERT INTO gss_interest_rates_monthly
         (rate_type, period_date, rate_pct, source_month, source_updated_at, synced_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (rate_type, period_date) DO UPDATE SET
         rate_pct          = EXCLUDED.rate_pct,
         source_updated_at = EXCLUDED.source_updated_at,
         synced_at         = NOW()`,
      [row.rateType, periodDate, row.ratePct, row.monthCode, row.sourceUpdated],
    );
    saved++;
  }
  return saved;
}

// ---------------------------------------------------------------------------
// Financial Soundness Indicators fetch + upsert
// ---------------------------------------------------------------------------

async function fetchFsi(indicators: string[]): Promise<{
  indicator: string;
  monthCode: string;
  valuePct: number;
  sourceUpdated: string | null;
}[]> {
  const meta = await pxGet(FSI_PATH);
  const sourceUpdated = meta.updated ?? null;

  const indVar = meta.variables.find((v) => v.code === 'Indicator');
  const availableInds = indVar?.values ?? [];
  const wantedInds = indicators.filter((i) => availableInds.includes(i));
  if (wantedInds.length === 0) {
    logger.warn('[GSS-Financial] No matching FSI indicators found, fetching all available');
    wantedInds.push(...availableInds);
  }

  const px = await pxPost(FSI_PATH, [
    { code: 'Indicator', selection: { filter: 'item', values: wantedInds } },
    { code: 'Month', selection: { filter: 'all', values: ['*'] } },
  ]);

  const indDim = px.dimension.Indicator;
  const monthDim = px.dimension.Month;
  if (!indDim || !monthDim) return [];

  const nMonths = Object.keys(monthDim.category.index).length;
  const rows: { indicator: string; monthCode: string; valuePct: number; sourceUpdated: string | null }[] = [];

  for (const [iCode, iIdx] of Object.entries(indDim.category.index)) {
    const iLabel = indDim.category.label[iCode] ?? iCode;
    for (const [mCode, mIdx] of Object.entries(monthDim.category.index)) {
      const mLabel = monthDim.category.label[mCode] ?? mCode;
      const val = px.value[iIdx * nMonths + mIdx];
      if (typeof val === 'number') {
        rows.push({ indicator: iLabel, monthCode: mLabel, valuePct: val, sourceUpdated });
      }
    }
  }

  return rows;
}

async function upsertFsiRows(rows: Awaited<ReturnType<typeof fetchFsi>>): Promise<number> {
  let saved = 0;
  for (const row of rows) {
    let periodDate: string;
    try { periodDate = monthCodeToDate(row.monthCode).toISOString().slice(0, 10); } catch { continue; }
    await query(
      `INSERT INTO gss_financial_soundness_monthly
         (indicator, period_date, value_pct, source_month, source_updated_at, synced_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (indicator, period_date) DO UPDATE SET
         value_pct         = EXCLUDED.value_pct,
         source_updated_at = EXCLUDED.source_updated_at,
         synced_at         = NOW()`,
      [row.indicator, periodDate, row.valuePct, row.monthCode, row.sourceUpdated],
    );
    saved++;
  }
  return saved;
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

export class GSS_FinancialService {
  async sync(triggeredBy: string = 'scheduled'): Promise<SyncResult> {
    const source = 'GSS StatsBank Financial';
    const startedAt = new Date();
    let syncId: string | undefined;
    let totalFetched = 0;
    let totalSaved = 0;
    const errors: SyncResult['errors'] = [];

    try {
      syncId = await syncLogRepository.startSync(source, 'scheduled', triggeredBy);
      logger.info('[GSS-Financial] Starting interest rates + FSI sync', { triggeredBy, syncId });

      // --- Interest Rates ---
      try {
        const rateRows = await fetchInterestRates(INTEREST_RATES);
        totalFetched += rateRows.length;
        const rateSaved = await upsertInterestRates(rateRows);
        totalSaved += rateSaved;
        logger.info('[GSS-Financial] Interest rates upserted', { fetched: rateRows.length, saved: rateSaved });
      } catch (err: any) {
        logger.error('[GSS-Financial] Interest rates fetch failed', { error: err.message });
        errors.push({ code: 'INTEREST_FETCH_ERROR', message: err.message, timestamp: new Date() });
      }

      // --- Financial Soundness ---
      try {
        const fsiRows = await fetchFsi(FSI_INDICATORS);
        totalFetched += fsiRows.length;
        const fsiSaved = await upsertFsiRows(fsiRows);
        totalSaved += fsiSaved;
        logger.info('[GSS-Financial] FSI upserted', { fetched: fsiRows.length, saved: fsiSaved });
      } catch (err: any) {
        logger.error('[GSS-Financial] FSI fetch failed', { error: err.message });
        errors.push({ code: 'FSI_FETCH_ERROR', message: err.message, timestamp: new Date() });
      }

      const result: SyncResult = {
        source,
        status: errors.length === 0 ? 'success' : (totalSaved > 0 ? 'partial' : 'failed'),
        started_at: startedAt,
        completed_at: new Date(),
        records_fetched: totalFetched,
        records_saved: totalSaved,
        records_failed: totalFetched - totalSaved,
        errors,
        metadata: { tables: ['gss_interest_rates_monthly', 'gss_financial_soundness_monthly'] },
      };

      await syncLogRepository.completeSync(syncId, result);
      logger.info('[GSS-Financial] Sync complete', { saved: totalSaved, errors: errors.length });
      return result;
    } catch (err: any) {
      const result: SyncResult = {
        source,
        status: 'failed',
        started_at: startedAt,
        completed_at: new Date(),
        records_fetched: totalFetched,
        records_saved: totalSaved,
        records_failed: 0,
        errors: [{ code: 'SYNC_ERROR', message: err.message, timestamp: new Date() }],
        metadata: {},
      };
      if (syncId) await syncLogRepository.completeSync(syncId, result);
      logger.error('[GSS-Financial] Sync failed', { error: err.message });
      return result;
    }
  }

  /**
   * Get latest lending rate (% p.a.). Returns null if not yet synced.
   * Used by ghaiService as a resilient fallback when BOG scraper fails.
   */
  async getLatestLendingRate(): Promise<{ period_date: string; rate_pct: number; source_month: string | null } | null> {
    try {
      const r = await query<{ period_date: string; rate_pct: string; source_month: string | null }>(
        `SELECT period_date::text, rate_pct, source_month
         FROM gss_interest_rates_monthly
         WHERE rate_type = 'Average lending rate'
         ORDER BY period_date DESC
         LIMIT 1`,
      );
      if (!r.rows.length) return null;
      return {
        period_date: r.rows[0].period_date,
        rate_pct: parseFloat(r.rows[0].rate_pct),
        source_month: r.rows[0].source_month,
      };
    } catch {
      return null;
    }
  }

  /**
   * Refresh `economic_indicators.mortgage_rate_avg` from the REAL observed lending
   * rate (GSS `gss_interest_rates_monthly` average lending rate), replacing the
   * static January seed. Mortgage ≈ average lending rate + a small documented
   * spread (env MORTGAGE_RATE_SPREAD_PP, default 0 — Ghana mortgages price close
   * to the average lending rate). Upserts a current-month row so GHAI reads a live,
   * self-updating value instead of a frozen seed. Idempotent per (type, month).
   */
  async refreshMortgageRate(): Promise<{ rate_pct: number; source: string } | null> {
    const lending = await this.getLatestLendingRate();
    if (!lending) {
      logger.warn('[GSS-Financial] No observed lending rate — mortgage rate not refreshed');
      return null;
    }
    const spread = parseFloat(process.env.MORTGAGE_RATE_SPREAD_PP || '0');
    const rate = Math.round((lending.rate_pct + spread) * 100) / 100;
    // Reflect the true publisher of the latest lending observation — BoG monthly
    // charts PDF (current) or the lagged GSS StatsBank series (fallback).
    const publisher = lending.source_month?.startsWith('BoG') ? 'BoG' : 'GSS StatsBank';
    const source = `${publisher} avg lending rate (${lending.period_date.slice(0, 7)})${spread ? ` + ${spread}pp spread` : ''}`;
    try {
      await query(
        `INSERT INTO economic_indicators
           (id, indicator_type, indicator_name, value, effective_date, period_type, source_name, unit, notes, created_at, updated_at)
         VALUES (uuid_generate_v4(), 'mortgage_rate_avg', 'Average Mortgage Rate', $1,
                 date_trunc('month', NOW())::date, 'monthly', $2, 'percent', $3, NOW(), NOW())
         ON CONFLICT (indicator_type, effective_date) DO UPDATE SET
           value = EXCLUDED.value, source_name = EXCLUDED.source_name,
           notes = EXCLUDED.notes, updated_at = NOW()`,
        [rate, 'Bank of Ghana / GSS', `Derived from ${source}`],
      );
      logger.info('[GSS-Financial] Mortgage rate refreshed from live lending rate', { rate, source });
      return { rate_pct: rate, source };
    } catch (err: any) {
      logger.error('[GSS-Financial] Mortgage rate upsert failed', { error: err.message });
      return null;
    }
  }

  /**
   * Get latest monetary policy rate.
   */
  async getLatestPolicyRate(): Promise<number | null> {
    try {
      const r = await query<{ rate_pct: string }>(
        `SELECT rate_pct
         FROM gss_interest_rates_monthly
         WHERE rate_type = 'Monetary policy rate'
         ORDER BY period_date DESC
         LIMIT 1`,
      );
      return r.rows.length ? parseFloat(r.rows[0].rate_pct) : null;
    } catch {
      return null;
    }
  }

  /**
   * Get latest NPL ratio and capital adequacy ratio.
   * Used by investmentScoringService macro_risk_penalty calculation.
   */
  async getLatestFsi(): Promise<{
    npl_ratio: number | null;
    capital_adequacy_ratio: number | null;
    return_on_assets: number | null;
    period_date: string | null;
  }> {
    try {
      const r = await query<{ indicator: string; value_pct: string; period_date: string }>(
        `SELECT DISTINCT ON (indicator)
           indicator, value_pct, period_date::text
         FROM gss_financial_soundness_monthly
         WHERE indicator IN ('Non performing loan ratio', 'Capital adequacy ratio', 'Return on assets')
         ORDER BY indicator, period_date DESC`,
      );
      const byInd: Record<string, number> = {};
      let periodDate: string | null = null;
      for (const row of r.rows) {
        byInd[row.indicator] = parseFloat(row.value_pct);
        if (!periodDate) periodDate = row.period_date;
      }
      return {
        npl_ratio: byInd['Non performing loan ratio'] ?? null,
        capital_adequacy_ratio: byInd['Capital adequacy ratio'] ?? null,
        return_on_assets: byInd['Return on assets'] ?? null,
        period_date: periodDate,
      };
    } catch {
      return { npl_ratio: null, capital_adequacy_ratio: null, return_on_assets: null, period_date: null };
    }
  }

  /**
   * Get interest rate history for sparkline display on affordability page.
   */
  async getLendingRateHistory(months = 24): Promise<Array<{ period_date: string; rate_pct: number }>> {
    try {
      // Take the most-recent N months, then return them in chronological (ascending)
      // order so a sparkline reads left-to-right oldest→newest. (Was ORDER BY ASC LIMIT N,
      // which returned the OLDEST rows — 1970s — instead of the latest.)
      const r = await query<{ period_date: string; rate_pct: string }>(
        `SELECT period_date::text, rate_pct FROM (
           SELECT period_date, rate_pct
           FROM gss_interest_rates_monthly
           WHERE rate_type = 'Average lending rate' AND rate_pct IS NOT NULL
           ORDER BY period_date DESC
           LIMIT $1
         ) recent
         ORDER BY period_date ASC`,
        [months],
      );
      return r.rows.map((row) => ({ period_date: row.period_date, rate_pct: parseFloat(row.rate_pct) }));
    } catch {
      return [];
    }
  }

  /**
   * Classify the current interest rate cycle: 'easing' | 'tightening' | 'stable'.
   * Compares latest 3-month average vs. prior 3-month average of the policy rate.
   */
  async getInterestRateCycle(): Promise<'easing' | 'tightening' | 'stable'> {
    try {
      const r = await query<{ rate_pct: string }>(
        `SELECT rate_pct FROM gss_interest_rates_monthly
         WHERE rate_type = 'Monetary policy rate'
         ORDER BY period_date DESC LIMIT 6`,
      );
      if (r.rows.length < 6) return 'stable';
      const recent = r.rows.slice(0, 3).reduce((sum, row) => sum + parseFloat(row.rate_pct), 0) / 3;
      const prior = r.rows.slice(3, 6).reduce((sum, row) => sum + parseFloat(row.rate_pct), 0) / 3;
      const diff = recent - prior;
      if (diff > 0.5) return 'tightening';
      if (diff < -0.5) return 'easing';
      return 'stable';
    } catch {
      return 'stable';
    }
  }
}

export const gssFinancialService = new GSS_FinancialService();
