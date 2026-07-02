/**
 * GSS Trade Service (Slice 2b — P2 HS2 Construction Import Tracking)
 *
 * Fetches monthly import values for construction-relevant HS2 codes from
 * GSS StatsBank trade_detail_hs2.px and persists them into:
 *   gss_construction_material_imports
 *
 * The resulting data powers the Ghana Construction Material Import Pressure
 * Index (GCMIPI) consumed by constructionCostIndexService as the CCI overhead
 * component.
 *
 * Construction-relevant HS2 codes tracked:
 *   25 — Salt, stone, cement, plaster
 *   27 — Mineral fuels (diesel, fuel costs)
 *   39 — Plastics (PVC pipes, fittings)
 *   44 — Timber / wood
 *   68 — Stone, plaster, cement articles
 *   69 — Ceramic tiles
 *   70 — Glass
 *   72 — Iron and steel
 *   73 — Steel articles (rebar, sections)
 *   76 — Aluminium (windows, roofing)
 *   94 — Furniture, prefabricated buildings
 *
 * @module services/data-hub/scrapers/gssTradeService
 */

import https from 'https';
import { query, pool } from '../../../database';
import { logger } from '../../../utils/logger';
import { syncLogRepository } from './syncLogRepository';
import type { SyncResult } from './types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const STATSBANK_HOST = process.env.GSS_STATSBANK_HOST || 'statsbank.statsghana.gov.gh';
const TRADE_PATH = '/api/v1/en/Trade/trade_detail_hs2.px';

/**
 * Exact HS2 dimension value strings as returned by the GSS PxWeb API.
 * Verified 2026-06-30 against live API.
 */
const CONSTRUCTION_HS2_CODES: Record<string, string> = {
  '25': '25 - Salt sulphur earths and stone plastering materials, lime and cement.',
  '27': '27 - Mineral fuels, mineral oils and products of their distillation bituminous substances mineral waxes',
  '39': '39 - Plastics and articles thereof',
  '44': '44 - Wood and articles of wood wood charcoal',
  '68': '68 - Articles of stone, plaster, cement, asbestos, mica or similar materials',
  '69': '69 - Ceramic products',
  '70': '70 - Glass and glassware',
  '72': '72 - Iron and steel',
  '73': '73 - Articles of iron or steel',
  '76': '76 - Aluminium and articles thereof',
  '94': '94 - Furniture bedding, mattresses, mattress supports, cushions and similar stuffed furnishings lamps and lighting fittings, not elsewhere specified or included illuminated signs, illuminated name-plates and the like prefabricated buildings',
};

// Base period for unit value index normalisation (2021 = 100)
const BASE_YEAR = 2021;

// ---------------------------------------------------------------------------
// PxWeb helpers
// ---------------------------------------------------------------------------

interface PxStat2 {
  value: (number | null)[];
  dimension: Record<string, { category: { index: Record<string, number>; label: Record<string, string> } }>;
  updated?: string;
}

function pxPost(path: string, queryBody: unknown): Promise<PxStat2> {
  const body = JSON.stringify({ query: queryBody, response: { format: 'json-stat2' } });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: 'POST', hostname: STATSBANK_HOST, path,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'User-Agent': 'propmetrik-datahub' },
        timeout: 90000,  // trade data is large
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(`GSS Trade ${res.statusCode}: ${data.slice(0, 200)}`));
            return;
          }
          try { resolve(JSON.parse(data) as PxStat2); }
          catch (e) { reject(new Error(`Parse error: ${(e as Error).message}`)); }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`GSS Trade timeout`)));
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Trade data fetch
// ---------------------------------------------------------------------------

interface TradeRow {
  year: number;
  month: number;
  hs2_code: string;
  hs2_label: string;
  import_value_ghs: number | null;
  import_value_usd: number | null;
  import_weight_kg: number | null;
}

async function fetchTradeData(hs2Values: string[]): Promise<TradeRow[]> {
  // Fetch GHS value, USD value, and weight in three separate calls
  // (Valuation_Parameter can only be filtered one at a time for clean dimension access)
  const makeQuery = (valParam: string) => [
    { code: 'Valuation_Parameter', selection: { filter: 'item', values: [valParam] } },
    { code: 'Tradeflow', selection: { filter: 'item', values: ['Import'] } },
    { code: 'Year', selection: { filter: 'all', values: ['*'] } },
    { code: 'Month', selection: { filter: 'item', values: [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ] } },
    { code: 'HS_2_digit', selection: { filter: 'item', values: hs2Values } },
    { code: 'Partner_Country', selection: { filter: 'item', values: ['All Partner Countries'] } },
  ];

  logger.info('[GSS-Trade] Fetching GHS, USD, and weight for', { codes: hs2Values.length });

  const [pxGhs, pxUsd, pxWeight] = await Promise.all([
    pxPost(TRADE_PATH, makeQuery('Value in Ghana Cedis (nominal)')),
    pxPost(TRADE_PATH, makeQuery('Value in US Dollars')),
    pxPost(TRADE_PATH, makeQuery('Net weight in KG')),
  ]);

  // Build value maps: [hs2_code][year][month] → value
  function buildTradeMap(px: PxStat2): Record<string, Record<string, Record<string, number | null>>> {
    const hsDim = px.dimension.HS_2_digit;
    const yearDim = px.dimension.Year;
    const monthDim = px.dimension.Month;
    if (!hsDim || !yearDim || !monthDim) return {};

    const dimNames = Object.keys(px.dimension);
    const sizes = dimNames.map(n => Object.keys(px.dimension[n].category.index).length);
    const strides: number[] = new Array(dimNames.length).fill(1);
    for (let i = dimNames.length - 2; i >= 0; i--) strides[i] = strides[i + 1] * sizes[i + 1];

    const hsPos = dimNames.indexOf('HS_2_digit');
    const yearPos = dimNames.indexOf('Year');
    const monthPos = dimNames.indexOf('Month');

    const out: Record<string, Record<string, Record<string, number | null>>> = {};

    for (const [hCode, hIdx] of Object.entries(hsDim.category.index)) {
      const hLabel = hsDim.category.label[hCode] ?? hCode;
      out[hLabel] = {};
      for (const [yCode, yIdx] of Object.entries(yearDim.category.index)) {
        const yLabel = yearDim.category.label[yCode] ?? yCode;
        out[hLabel][yLabel] = {};
        for (const [mCode, mIdx] of Object.entries(monthDim.category.index)) {
          const mLabel = monthDim.category.label[mCode] ?? mCode;
          // All other dims (Valuation_Parameter=1, Tradeflow=1, Partner_Country=1) have index 0
          const flatIdx = (hIdx as number) * strides[hsPos]
            + (yIdx as number) * strides[yearPos]
            + (mIdx as number) * strides[monthPos];
          out[hLabel][yLabel][mLabel] = px.value[flatIdx] ?? null;
        }
      }
    }
    return out;
  }

  const ghsMap = buildTradeMap(pxGhs);
  const usdMap = buildTradeMap(pxUsd);
  const wgtMap = buildTradeMap(pxWeight);

  const MONTH_MAP: Record<string, number> = {
    January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
    July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
  };

  // Get the HS2 code (2-digit prefix) from the full label
  const getCode = (label: string) => label.split(' - ')[0].trim();

  const rows: TradeRow[] = [];
  for (const [hsLabel, yearData] of Object.entries(ghsMap)) {
    const hsCode = getCode(hsLabel);
    for (const [year, monthData] of Object.entries(yearData)) {
      for (const [month, ghsVal] of Object.entries(monthData)) {
        const monthNum = MONTH_MAP[month];
        if (!monthNum) continue;
        rows.push({
          year: parseInt(year, 10),
          month: monthNum,
          hs2_code: hsCode,
          hs2_label: hsLabel,
          import_value_ghs: ghsVal ?? null,
          import_value_usd: usdMap[hsLabel]?.[year]?.[month] ?? null,
          import_weight_kg: wgtMap[hsLabel]?.[year]?.[month] ?? null,
        });
      }
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Unit value index computation
// ---------------------------------------------------------------------------

/** Compute unit value index (USD per tonne, base year = 100) per HS2 code. */
function computeUnitValueIndex(rows: TradeRow[]): Map<string, Map<string, number | null>> {
  // Step 1: compute base year average USD/tonne per HS2
  const baseValues: Record<string, { totalUsd: number; totalKg: number }> = {};
  for (const row of rows) {
    if (row.year !== BASE_YEAR || !row.import_value_usd || !row.import_weight_kg || row.import_weight_kg <= 0) continue;
    if (!baseValues[row.hs2_code]) baseValues[row.hs2_code] = { totalUsd: 0, totalKg: 0 };
    baseValues[row.hs2_code].totalUsd += row.import_value_usd;
    baseValues[row.hs2_code].totalKg += row.import_weight_kg;
  }
  const baseUviByCode: Record<string, number> = {};
  for (const [code, { totalUsd, totalKg }] of Object.entries(baseValues)) {
    if (totalKg > 0) baseUviByCode[code] = (totalUsd / totalKg) * 1000; // USD per tonne
  }

  // Step 2: compute UVI for each row
  const result = new Map<string, Map<string, number | null>>();
  for (const row of rows) {
    const key = `${row.year}-${String(row.month).padStart(2, '0')}`;
    if (!result.has(row.hs2_code)) result.set(row.hs2_code, new Map());
    const baseUvi = baseUviByCode[row.hs2_code];
    let uvi: number | null = null;
    if (baseUvi && row.import_value_usd && row.import_weight_kg && row.import_weight_kg > 0) {
      const currentUvi = (row.import_value_usd / row.import_weight_kg) * 1000;
      uvi = Math.round((currentUvi / baseUvi) * 100 * 10) / 10; // index base 100
    }
    result.get(row.hs2_code)!.set(key, uvi);
  }
  return result;
}

// ---------------------------------------------------------------------------
// FX rates lookup
// ---------------------------------------------------------------------------

async function getMonthlyFxRates(): Promise<Map<string, number>> {
  try {
    const r = await pool.query<{ effective_date: string; value: string }>(
      `SELECT TO_CHAR(effective_date, 'YYYY-MM') AS effective_date, value
       FROM economic_indicators
       WHERE indicator_type = 'exchange_rate_usd' AND period_type = 'monthly'
       ORDER BY effective_date ASC`,
    );
    const fxMap = new Map<string, number>();
    for (const row of r.rows) fxMap.set(row.effective_date, parseFloat(row.value));
    return fxMap;
  } catch {
    return new Map();
  }
}

// ---------------------------------------------------------------------------
// Upsert
// ---------------------------------------------------------------------------

async function upsertTradeRows(rows: TradeRow[], uviMap: Map<string, Map<string, number | null>>, fxRates: Map<string, number>): Promise<number> {
  let saved = 0;
  for (const row of rows) {
    const periodDate = new Date(Date.UTC(row.year, row.month - 1, 1)).toISOString().slice(0, 10);
    const monthKey = `${row.year}-${String(row.month).padStart(2, '0')}`;
    const uvi = uviMap.get(row.hs2_code)?.get(monthKey) ?? null;
    const fxRate = fxRates.get(monthKey) ?? null;

    await query(
      `INSERT INTO gss_construction_material_imports
         (hs2_code, hs2_label, year, month, period_date,
          import_value_ghs, import_value_usd, import_weight_kg,
          unit_value_index, fx_rate_ghs_usd, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (hs2_code, period_date) DO UPDATE SET
         import_value_ghs  = EXCLUDED.import_value_ghs,
         import_value_usd  = EXCLUDED.import_value_usd,
         import_weight_kg  = EXCLUDED.import_weight_kg,
         unit_value_index  = EXCLUDED.unit_value_index,
         fx_rate_ghs_usd   = EXCLUDED.fx_rate_ghs_usd,
         synced_at         = NOW()`,
      [row.hs2_code, row.hs2_label, row.year, row.month, periodDate,
       row.import_value_ghs, row.import_value_usd, row.import_weight_kg,
       uvi, fxRate],
    );
    saved++;
  }
  return saved;
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

export class GSS_TradeService {
  async sync(triggeredBy: string = 'scheduled'): Promise<SyncResult> {
    const source = 'GSS StatsBank Trade HS2';
    const startedAt = new Date();
    let syncId: string | undefined;
    let totalSaved = 0;
    const errors: SyncResult['errors'] = [];

    try {
      syncId = await syncLogRepository.startSync(source, 'scheduled', triggeredBy);
      logger.info('[GSS-Trade] Starting HS2 construction import sync', { triggeredBy, syncId });

      const hs2Values = Object.values(CONSTRUCTION_HS2_CODES);
      const fxRates = await getMonthlyFxRates();
      logger.info('[GSS-Trade] FX rates loaded', { count: fxRates.size });

      try {
        const rows = await fetchTradeData(hs2Values);
        logger.info('[GSS-Trade] Trade data fetched', { rows: rows.length });

        const uviMap = computeUnitValueIndex(rows);
        totalSaved = await upsertTradeRows(rows, uviMap, fxRates);
        logger.info('[GSS-Trade] Trade data upserted', { saved: totalSaved });
      } catch (err: any) {
        logger.error('[GSS-Trade] Trade fetch failed', { error: err.message });
        errors.push({ code: 'TRADE_FETCH_ERROR', message: err.message, timestamp: new Date() });
      }

      const result: SyncResult = {
        source,
        status: errors.length > 0 ? (totalSaved > 0 ? 'partial' : 'failed') : 'success',
        started_at: startedAt,
        completed_at: new Date(),
        records_fetched: totalSaved,
        records_saved: totalSaved,
        records_failed: 0,
        errors,
        metadata: { tables: ['gss_construction_material_imports'], hs2_codes: Object.keys(CONSTRUCTION_HS2_CODES) },
      };
      await syncLogRepository.completeSync(syncId, result);
      logger.info('[GSS-Trade] Sync complete', { saved: totalSaved });
      return result;
    } catch (err: any) {
      const result: SyncResult = {
        source, status: 'failed', started_at: startedAt, completed_at: new Date(),
        records_fetched: 0, records_saved: totalSaved, records_failed: 0,
        errors: [{ code: 'SYNC_ERROR', message: err.message, timestamp: new Date() }],
        metadata: {},
      };
      if (syncId) await syncLogRepository.completeSync(syncId, result);
      logger.error('[GSS-Trade] Sync failed', { error: err.message });
      return result;
    }
  }

  /**
   * Compute the Ghana Construction Material Import Pressure Index (GCMIPI).
   * Returns a monthly composite index (base 2021 = 100) combining unit value
   * indices of all construction-relevant HS2 codes.
   *
   * Basket weights (approximate share of construction material input cost):
   *   72+73 (steel): 30%, 25 (cement): 25%, 44 (timber): 15%,
   *   76 (aluminium): 10%, 70 (glass): 5%, 68 (stone/plaster): 5%,
   *   69 (tiles): 5%, 39 (plastics): 3%, 27 (fuel): 2%
   */
  async getGcmipiHistory(months = 36): Promise<Array<{
    period_date: string;
    gcmipi: number | null;
    hs2_breakdown: Record<string, number | null>;
  }>> {
    try {
      const r = await query<{ period_date: string; hs2_code: string; unit_value_index: string }>(
        `SELECT period_date::text, hs2_code, unit_value_index
         FROM gss_construction_material_imports
         WHERE period_date >= CURRENT_DATE - INTERVAL '${months} months'
         AND unit_value_index IS NOT NULL
         ORDER BY period_date ASC`,
      );

      const WEIGHTS: Record<string, number> = {
        '72': 0.20, '73': 0.10, '25': 0.25, '44': 0.15, '76': 0.10,
        '70': 0.05, '68': 0.05, '69': 0.05, '39': 0.03, '27': 0.02,
      };

      // Group by period
      const byPeriod: Record<string, Record<string, number>> = {};
      for (const row of r.rows) {
        if (!byPeriod[row.period_date]) byPeriod[row.period_date] = {};
        byPeriod[row.period_date][row.hs2_code] = parseFloat(row.unit_value_index);
      }

      return Object.entries(byPeriod).map(([period_date, breakdown]) => {
        let totalWeight = 0;
        let weightedSum = 0;
        for (const [code, uvi] of Object.entries(breakdown)) {
          const w = WEIGHTS[code] ?? 0;
          weightedSum += w * uvi;
          totalWeight += w;
        }
        const gcmipi = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : null;
        return { period_date, gcmipi, hs2_breakdown: breakdown };
      });
    } catch {
      return [];
    }
  }
}

export const gssTradeService = new GSS_TradeService();
