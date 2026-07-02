/**
 * GSS MIEG Service (Slice 1 — P1 Monthly Macro)
 *
 * Fetches the Monthly Indicator of Economic Growth (MIEG) and Quarterly GDP
 * from the GSS StatsBank PxWeb API and persists them into:
 *   - gss_mieg_monthly    (mieg_px_March26.px — Agriculture/Industry/Services/Total)
 *   - gss_quarterly_gdp   (qgdp_p_px.px + qgdp_e_px.px — GDP by sector/approach)
 *
 * MIEG enables:
 *   - Market Intelligence macro context bar (Services MIEG → credit-sensitive flag)
 *   - Investment scoring MIEG contraction risk
 *   - Short-stay RevPAR correlation with economic activity
 *   - ML price forecast macro features
 *
 * @module services/data-hub/scrapers/gssMiegService
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
const MIEG_PATH = `${MACRO_DB}/Monthly%20Indicator%20of%20Economic%20Growth(MIEG)/mieg_px_March26.px`;
const QGDP_PROD_PATH = `${MACRO_DB}/Real%20Sector%20(GDP)/Quarterly%20GDP/qgdp_p_px.px`;
const QGDP_EXP_PATH = `${MACRO_DB}/Real%20Sector%20(GDP)/Quarterly%20GDP/qgdp_e_px.px`;

const MIEG_VARIABLES = ['AGRICULTURE', 'INDUSTRY', 'SERVICES', 'TOTAL'];  // dimension value codes (not valueTexts)
const MIEG_SERIES = ['INDEX', 'GROWTH'];  // GDP_Series codes: INDEX = "MIEG Index Value (2023=100)", GROWTH = "year-on-year %"

// ---------------------------------------------------------------------------
// PxWeb helpers (same pattern as gssIncomeService.ts + gssPpiService.ts)
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
          try { resolve(JSON.parse(data) as PxStat2); } catch (e) { reject(new Error(`Parse error: ${(e as Error).message}`)); }
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

/**
 * Convert a MIEG label like 'Jan-23' or 'Mar-26' to a Date (first of that month UTC).
 * GSS uses short month abbreviations + 2-digit year.
 */
const MONTH_ABBR: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};
function miegLabelToDate(label: string): Date {
  const m = /^([A-Za-z]{3})-(\d{2})$/.exec(label.trim());
  if (!m) throw new Error(`Unexpected MIEG label: ${label}`);
  const monthNum = MONTH_ABBR[m[1]];
  if (monthNum === undefined) throw new Error(`Unknown month abbr: ${m[1]}`);
  const year = 2000 + Number(m[2]);
  return new Date(Date.UTC(year, monthNum, 1));
}

/**
 * Convert a quarter label like '2026Q1' to first day of that quarter.
 */
function quarterToDate(label: string): Date {
  const m = /^(\d{4})Q([1-4])$/.exec(label);
  if (!m) throw new Error(`Unexpected quarter label: ${label}`);
  const month = (Number(m[2]) - 1) * 3; // Q1→0, Q2→3, Q3→6, Q4→9
  return new Date(Date.UTC(Number(m[1]), month, 1));
}

// ---------------------------------------------------------------------------
// MIEG fetch + upsert
// ---------------------------------------------------------------------------

async function fetchMieg(): Promise<{
  variable: string;
  label: string;
  indexValue: number | null;
  growthYoy: number | null;
  sourceUpdated: string | null;
}[]> {
  const meta = await pxGet(MIEG_PATH);
  const sourceUpdated = meta.updated ?? null;

  // Fetch index value and YoY growth together
  const [pxIndex, pxGrowth] = await Promise.all([
    pxPost(MIEG_PATH, [
      { code: 'Month', selection: { filter: 'all', values: ['*'] } },
      { code: 'GDP_Series', selection: { filter: 'item', values: ['INDEX'] } },
      { code: 'Variable', selection: { filter: 'item', values: MIEG_VARIABLES } },
    ]),
    pxPost(MIEG_PATH, [
      { code: 'Month', selection: { filter: 'all', values: ['*'] } },
      { code: 'GDP_Series', selection: { filter: 'item', values: ['GROWTH'] } },
      { code: 'Variable', selection: { filter: 'item', values: MIEG_VARIABLES } },
    ]),
  ]);

  // Build maps [varLabel][monthLabel] → value using proper json-stat2 stride arithmetic.
  // Dimensions in the MIEG response: Month (outer) × GDP_Series (middle) × Variable (inner).
  // We fetch one series at a time, so GDP_Series has 1 item (index 0, stride contribution = 0).
  // json-stat2 flat idx = Σ(dim_i_index × stride_i), stride_i = product of sizes of trailing dims.
  function buildMap(px: PxStat2, varDimCode: string, monthDimCode: string): Record<string, Record<string, number | null>> {
    const varDim = px.dimension[varDimCode];
    const monthDim = px.dimension[monthDimCode];
    if (!varDim || !monthDim) return {};

    const dimNames = Object.keys(px.dimension);
    const sizes = dimNames.map((n) => Object.keys(px.dimension[n].category.index).length);
    const strides: number[] = new Array(dimNames.length).fill(1);
    for (let i = dimNames.length - 2; i >= 0; i--) strides[i] = strides[i + 1] * sizes[i + 1];

    const varDimPos = dimNames.indexOf(varDimCode);
    const monthDimPos = dimNames.indexOf(monthDimCode);

    const out: Record<string, Record<string, number | null>> = {};
    for (const [vCode, vIdx] of Object.entries(varDim.category.index)) {
      const vLabel = varDim.category.label[vCode] ?? vCode;
      out[vLabel] = {};
      for (const [mCode, mIdx] of Object.entries(monthDim.category.index)) {
        const mLabel = monthDim.category.label[mCode] ?? mCode;
        const flatIdx = (vIdx as number) * strides[varDimPos] + (mIdx as number) * strides[monthDimPos];
        out[vLabel][mLabel] = px.value[flatIdx] ?? null;
      }
    }
    return out;
  }

  const indexMap = buildMap(pxIndex, 'Variable', 'Month');
  const growthMap = buildMap(pxGrowth, 'Variable', 'Month');

  const rows: ReturnType<typeof fetchMieg> extends Promise<infer T> ? T : never = [];

  // Iterate over labels returned from the API (e.g. 'Agriculture_MIEG'), not the code constants
  const variableLabels = Object.keys(indexMap);
  for (const variable of variableLabels) {
    const months = Object.keys(indexMap[variable] ?? {});
    for (const label of months) {
      rows.push({
        variable,
        label,
        indexValue: indexMap[variable]?.[label] ?? null,
        growthYoy: growthMap[variable]?.[label] ?? null,
        sourceUpdated,
      });
    }
  }

  return rows as any;
}

async function upsertMiegRows(rows: Awaited<ReturnType<typeof fetchMieg>>): Promise<number> {
  let saved = 0;
  for (const row of rows) {
    if (row.indexValue === null && row.growthYoy === null) continue;
    let periodDate: string;
    try {
      periodDate = miegLabelToDate(row.label).toISOString().slice(0, 10);
    } catch (e) {
      logger.warn('[GSS-MIEG] Skipping unexpected month label', { label: row.label });
      continue;
    }
    await query(
      `INSERT INTO gss_mieg_monthly
         (variable, period_date, index_value, growth_yoy_pct, source_label, source_updated_at, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (variable, period_date) DO UPDATE SET
         index_value       = EXCLUDED.index_value,
         growth_yoy_pct    = EXCLUDED.growth_yoy_pct,
         source_updated_at = EXCLUDED.source_updated_at,
         synced_at         = NOW()`,
      [row.variable, periodDate, row.indexValue, row.growthYoy, row.label, row.sourceUpdated],
    );
    saved++;
  }
  return saved;
}

// ---------------------------------------------------------------------------
// Quarterly GDP fetch + upsert
// ---------------------------------------------------------------------------

interface GdpRow {
  sector: string;
  quarterLabel: string;
  gdpValue: number | null;
  growthYoy: number | null;
  approach: 'production' | 'expenditure';
  sourceUpdated: string | null;
}

async function fetchQuarterlyGdp(path: string, approach: 'production' | 'expenditure'): Promise<GdpRow[]> {
  const meta = await pxGet(path);
  const sourceUpdated = meta.updated ?? null;

  // Discover dimension codes — production uses 'Sector', expenditure may differ
  const sectorVarCode = meta.variables.find((v) => v.code !== 'Quarter' && v.code !== 'Indicator')?.code;
  if (!sectorVarCode) {
    logger.warn('[GSS-MIEG] Quarterly GDP: no sector dimension found', { path });
    return [];
  }
  const sectors = meta.variables.find((v) => v.code === sectorVarCode)?.values ?? [];

  // Try to get both levels (index value + growth). Some tables only have one.
  const allQuarters = meta.variables.find((v) => v.code === 'Quarter')?.values ?? [];
  if (allQuarters.length === 0) {
    logger.warn('[GSS-MIEG] Quarterly GDP: no Quarter dimension', { path });
    return [];
  }

  const px = await pxPost(path, [
    { code: sectorVarCode, selection: { filter: 'all', values: ['*'] } },
    { code: 'Quarter', selection: { filter: 'all', values: ['*'] } },
  ]);

  const sectorDim = px.dimension[sectorVarCode];
  const quarterDim = px.dimension.Quarter;
  if (!sectorDim || !quarterDim) return [];

  const nQ = Object.keys(quarterDim.category.index).length;
  const rows: GdpRow[] = [];

  for (const [sCode, sIdx] of Object.entries(sectorDim.category.index)) {
    const sLabel = sectorDim.category.label[sCode] ?? sCode;
    for (const [qCode, qIdx] of Object.entries(quarterDim.category.index)) {
      const qLabel = quarterDim.category.label[qCode] ?? qCode;
      const val = px.value[sIdx * nQ + qIdx] ?? null;
      rows.push({
        sector: sLabel,
        quarterLabel: qLabel,
        gdpValue: typeof val === 'number' ? val : null,
        growthYoy: null, // will be computed or fetched separately if needed
        approach,
        sourceUpdated,
      });
    }
  }

  return rows;
}

async function upsertGdpRows(rows: GdpRow[]): Promise<number> {
  let saved = 0;
  for (const row of rows) {
    if (row.gdpValue === null) continue;
    let periodDate: string;
    try {
      periodDate = quarterToDate(row.quarterLabel).toISOString().slice(0, 10);
    } catch {
      continue;
    }
    await query(
      `INSERT INTO gss_quarterly_gdp
         (sector, quarter_label, period_date, gdp_value, growth_yoy_pct, approach, source_updated_at, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (sector, period_date, approach) DO UPDATE SET
         gdp_value         = EXCLUDED.gdp_value,
         growth_yoy_pct    = EXCLUDED.growth_yoy_pct,
         source_updated_at = EXCLUDED.source_updated_at,
         synced_at         = NOW()`,
      [row.sector, row.quarterLabel, periodDate, row.gdpValue, row.growthYoy, row.approach, row.sourceUpdated],
    );
    saved++;
  }
  return saved;
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

export class GSS_MIEGService {
  async sync(triggeredBy: string = 'scheduled'): Promise<SyncResult> {
    const source = 'GSS StatsBank MIEG/GDP';
    const startedAt = new Date();
    let syncId: string | undefined;
    let totalFetched = 0;
    let totalSaved = 0;
    const errors: SyncResult['errors'] = [];

    try {
      syncId = await syncLogRepository.startSync(source, 'scheduled', triggeredBy);
      logger.info('[GSS-MIEG] Starting MIEG + Quarterly GDP sync', { triggeredBy, syncId });

      // --- MIEG monthly ---
      try {
        const miegRows = await fetchMieg();
        totalFetched += miegRows.length;
        const miegSaved = await upsertMiegRows(miegRows);
        totalSaved += miegSaved;
        logger.info('[GSS-MIEG] MIEG upserted', { fetched: miegRows.length, saved: miegSaved });
      } catch (err: any) {
        logger.error('[GSS-MIEG] MIEG fetch failed', { error: err.message });
        errors.push({ code: 'MIEG_FETCH_ERROR', message: err.message, timestamp: new Date() });
      }

      // --- Quarterly GDP — production approach ---
      try {
        const gdpProdRows = await fetchQuarterlyGdp(QGDP_PROD_PATH, 'production');
        totalFetched += gdpProdRows.length;
        const gdpProdSaved = await upsertGdpRows(gdpProdRows);
        totalSaved += gdpProdSaved;
        logger.info('[GSS-MIEG] Quarterly GDP (production) upserted', { fetched: gdpProdRows.length, saved: gdpProdSaved });
      } catch (err: any) {
        logger.error('[GSS-MIEG] Quarterly GDP (production) fetch failed', { error: err.message });
        errors.push({ code: 'GDP_PROD_FETCH_ERROR', message: err.message, timestamp: new Date() });
      }

      // --- Quarterly GDP — expenditure approach ---
      try {
        const gdpExpRows = await fetchQuarterlyGdp(QGDP_EXP_PATH, 'expenditure');
        totalFetched += gdpExpRows.length;
        const gdpExpSaved = await upsertGdpRows(gdpExpRows);
        totalSaved += gdpExpSaved;
        logger.info('[GSS-MIEG] Quarterly GDP (expenditure) upserted', { fetched: gdpExpRows.length, saved: gdpExpSaved });
      } catch (err: any) {
        logger.warn('[GSS-MIEG] Quarterly GDP (expenditure) fetch failed (non-fatal)', { error: err.message });
        errors.push({ code: 'GDP_EXP_FETCH_ERROR', message: err.message, timestamp: new Date() });
      }

      const result: SyncResult = {
        source,
        status: errors.some((e) => e.code === 'MIEG_FETCH_ERROR')
          ? (totalSaved > 0 ? 'partial' : 'failed')
          : 'success',
        started_at: startedAt,
        completed_at: new Date(),
        records_fetched: totalFetched,
        records_saved: totalSaved,
        records_failed: totalFetched - totalSaved,
        errors,
        metadata: { tables: ['gss_mieg_monthly', 'gss_quarterly_gdp'] },
      };

      await syncLogRepository.completeSync(syncId, result);
      logger.info('[GSS-MIEG] Sync complete', { saved: totalSaved, errors: errors.length });
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
      logger.error('[GSS-MIEG] Sync failed', { error: err.message });
      return result;
    }
  }

  /**
   * Get latest MIEG values for all four variables (for market intelligence overlay).
   */
  async getLatestMieg(): Promise<Record<string, { index_value: number | null; growth_yoy_pct: number | null }>> {
    try {
      const r = await query<{
        variable: string;
        index_value: string;
        growth_yoy_pct: string | null;
      }>(
        `SELECT DISTINCT ON (variable) variable, index_value, growth_yoy_pct
         FROM gss_mieg_monthly
         ORDER BY variable, period_date DESC`,
      );
      const out: Record<string, { index_value: number | null; growth_yoy_pct: number | null }> = {};
      for (const row of r.rows) {
        out[row.variable] = {
          index_value: row.index_value ? parseFloat(row.index_value) : null,
          growth_yoy_pct: row.growth_yoy_pct ? parseFloat(row.growth_yoy_pct) : null,
        };
      }
      return out;
    } catch {
      return {};
    }
  }

  /**
   * Check if Services MIEG has contracted (YoY < 0) for the past N consecutive months.
   * Used to flag market_temperature as "credit-sensitive".
   */
  async isServicesMiegContracting(consecutiveMonths = 2): Promise<boolean> {
    try {
      const r = await query<{ growth_yoy_pct: string }>(
        `SELECT growth_yoy_pct
         FROM gss_mieg_monthly
         WHERE variable = 'Services_MIEG' AND growth_yoy_pct IS NOT NULL
         ORDER BY period_date DESC
         LIMIT $1`,
        [consecutiveMonths],
      );
      if (r.rows.length < consecutiveMonths) return false;
      return r.rows.every((row) => parseFloat(row.growth_yoy_pct) < 0);
    } catch {
      return false;
    }
  }

  /**
   * Get latest quarterly GDP growth for Total GDP (for market intelligence macro overlay).
   */
  async getLatestGdpGrowth(): Promise<{ quarter_label: string; gdp_value: number | null; sector: string } | null> {
    try {
      const r = await query<{ quarter_label: string; gdp_value: string; sector: string }>(
        `SELECT quarter_label, gdp_value, sector
         FROM gss_quarterly_gdp
         WHERE approach = 'production'
         ORDER BY period_date DESC
         LIMIT 1`,
      );
      if (!r.rows.length) return null;
      const row = r.rows[0];
      return {
        quarter_label: row.quarter_label,
        gdp_value: row.gdp_value ? parseFloat(row.gdp_value) : null,
        sector: row.sector,
      };
    } catch {
      return null;
    }
  }
}

export const gssMiegService = new GSS_MIEGService();
