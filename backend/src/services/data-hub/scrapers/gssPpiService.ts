/**
 * GSS PPI Service (Slice 1 — P1 Monthly Macro)
 *
 * Fetches Producer Price Index (PPI) and Index of Industrial Production (IIP)
 * from the GSS StatsBank PxWeb API and persists them into:
 *   - gss_ppi_construction_series  (ppi.px — all industries incl. Construction)
 *   - gss_iip_monthly              (iip.px — industrial production)
 *
 * The Construction PPI series is the authoritative external anchor that
 * eliminates the ±40% rebase-artifact suppression in constructionCostIndexService.
 *
 * Follows the exact client pattern established in gssIncomeService.ts:
 *   - Native Node HTTPS (no axios)
 *   - pxPost() helper with json-stat2 format
 *   - syncLogRepository audit trail
 *   - Singleton export
 *
 * @module services/data-hub/scrapers/gssPpiService
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
const PPI_PATH = `${MACRO_DB}/Prices%20and%20Inflation/ppi.px`;
const IIP_PATH = `${MACRO_DB}/Prices%20and%20Inflation/iip.px`;

/** PPI industry series to persist. 'All industries' is the aggregate. */
const PPI_INDUSTRIES = [
  'All industries',
  'Construction',
  'Manufacturing',
  'Mining and quarrying',
  'Electricity and gas',
  'Transportation and storage',
  'Accommdation and food service',
];

/** IIP sectors to persist. */
const IIP_SECTORS = [
  'All sectors',
  'Mining and quarrying',
  'Manufacturing',
  'Electricity and gas supply',
  'Water supply and waste management',
];

// ---------------------------------------------------------------------------
// PxWeb helpers (mirrors gssIncomeService.ts)
// ---------------------------------------------------------------------------

interface PxStat2 {
  value: (number | null)[];
  dimension: Record<string, {
    category: {
      index: Record<string, number>;
      label: Record<string, string>;
    };
  }>;
  updated?: string;
}

interface PxMeta {
  variables: Array<{
    code: string;
    values: string[];
    valueTexts: string[];
    updated?: string;
  }>;
  updated?: string;
}

function pxPost(path: string, queryBody: unknown): Promise<PxStat2> {
  const body = JSON.stringify({ query: queryBody, response: { format: 'json-stat2' } });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: 'POST',
        hostname: STATSBANK_HOST,
        path,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'propmetrik-datahub',
        },
        timeout: 60000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(`GSS PxWeb ${res.statusCode} for ${path}: ${data.slice(0, 300)}`));
            return;
          }
          try {
            resolve(JSON.parse(data) as PxStat2);
          } catch (e) {
            reject(new Error(`GSS PxWeb parse error for ${path}: ${(e as Error).message}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`GSS PxWeb timeout for ${path}`)));
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
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as PxMeta);
          } catch (e) {
            reject(new Error(`GSS PxWeb meta parse error for ${path}: ${(e as Error).message}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`GSS PxWeb meta timeout for ${path}`)));
  });
}

/** Convert GSS month code '2024M01' → Date (first of month UTC). */
function monthCodeToDate(code: string): Date {
  const m = /^(\d{4})M(\d{2})$/.exec(code);
  if (!m) throw new Error(`Invalid GSS month code: ${code}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
}

// ---------------------------------------------------------------------------
// PPI fetch + upsert
// ---------------------------------------------------------------------------

/**
 * Fetch all available PPI months for the requested industries.
 * Returns { rows } where each row has industry, monthCode, ppiIndex, mom, yoy.
 */
async function fetchPpi(industries: string[]): Promise<{
  industry: string;
  monthCode: string;
  ppiIndex: number | null;
  mom: number | null;
  yoy: number | null;
  sourceUpdated: string | null;
}[]> {
  const meta = await pxGet(PPI_PATH);
  const monthVar = meta.variables.find((v) => v.code === 'Month');
  if (!monthVar || monthVar.values.length === 0) throw new Error('PPI: no Month dimension');
  const allMonths = monthVar.values; // newest first

  // Filter requested industries to those available in the table
  const indVar = meta.variables.find((v) => v.code === 'Industry');
  const availableIndustries = indVar?.values ?? [];
  const wantedIndustries = industries.filter((i) => availableIndustries.includes(i));
  if (wantedIndustries.length === 0) throw new Error('PPI: none of the requested industries found in table');

  // Fetch all three indicators in parallel
  const [pxIndex, pxMom, pxYoy] = await Promise.all([
    pxPost(PPI_PATH, [
      { code: 'Industry', selection: { filter: 'item', values: wantedIndustries } },
      { code: 'Indicator', selection: { filter: 'item', values: ['Producer Price Index'] } },
      { code: 'Month', selection: { filter: 'all', values: ['*'] } },
    ]),
    pxPost(PPI_PATH, [
      { code: 'Industry', selection: { filter: 'item', values: wantedIndustries } },
      { code: 'Indicator', selection: { filter: 'item', values: ['Month-on-month PPI change (%)'] } },
      { code: 'Month', selection: { filter: 'all', values: ['*'] } },
    ]),
    pxPost(PPI_PATH, [
      { code: 'Industry', selection: { filter: 'item', values: wantedIndustries } },
      { code: 'Indicator', selection: { filter: 'item', values: ['Year-on-year PPI change (%)'] } },
      { code: 'Month', selection: { filter: 'all', values: ['*'] } },
    ]),
  ]);

  const sourceUpdated = meta.updated ?? null;

  // Build index maps: [industry][month] → value
  function buildMap(px: PxStat2): Record<string, Record<string, number | null>> {
    const indDim = px.dimension.Industry ?? px.dimension['Industry '];
    const monthDim = px.dimension.Month;
    if (!indDim || !monthDim) return {};
    const out: Record<string, Record<string, number | null>> = {};
    for (const [indCode, indIdx] of Object.entries(indDim.category.index)) {
      const indLabel = indDim.category.label[indCode] ?? indCode;
      out[indLabel] = {};
      for (const [mCode, mIdx] of Object.entries(monthDim.category.index)) {
        const mLabel = monthDim.category.label[mCode] ?? mCode;
        const flatIdx = indIdx * Object.keys(monthDim.category.index).length + mIdx;
        out[indLabel][mLabel] = px.value[flatIdx] ?? null;
      }
    }
    return out;
  }

  const indexMap = buildMap(pxIndex);
  const momMap = buildMap(pxMom);
  const yoyMap = buildMap(pxYoy);

  const rows: {
    industry: string;
    monthCode: string;
    ppiIndex: number | null;
    mom: number | null;
    yoy: number | null;
    sourceUpdated: string | null;
  }[] = [];

  for (const industry of wantedIndustries) {
    const months = Object.keys(indexMap[industry] ?? {});
    for (const monthCode of months) {
      rows.push({
        industry,
        monthCode,
        ppiIndex: indexMap[industry]?.[monthCode] ?? null,
        mom: momMap[industry]?.[monthCode] ?? null,
        yoy: yoyMap[industry]?.[monthCode] ?? null,
        sourceUpdated,
      });
    }
  }

  return rows;
}

async function upsertPpiRows(rows: Awaited<ReturnType<typeof fetchPpi>>): Promise<number> {
  let saved = 0;
  for (const row of rows) {
    if (row.ppiIndex === null && row.mom === null && row.yoy === null) continue;
    const periodDate = monthCodeToDate(row.monthCode).toISOString().slice(0, 10);
    await query(
      `INSERT INTO gss_ppi_construction_series
         (series_code, period_date, ppi_index, change_mom_pct, change_yoy_pct,
          source_month, source_updated_at, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (series_code, period_date) DO UPDATE SET
         ppi_index          = EXCLUDED.ppi_index,
         change_mom_pct     = EXCLUDED.change_mom_pct,
         change_yoy_pct     = EXCLUDED.change_yoy_pct,
         source_updated_at  = EXCLUDED.source_updated_at,
         synced_at          = NOW()`,
      [
        row.industry,
        periodDate,
        row.ppiIndex,
        row.mom,
        row.yoy,
        row.monthCode,
        row.sourceUpdated,
      ],
    );
    saved++;
  }
  return saved;
}

// ---------------------------------------------------------------------------
// IIP fetch + upsert
// ---------------------------------------------------------------------------

async function fetchIip(sectors: string[]): Promise<{
  sector: string;
  monthCode: string;
  iipIndex: number | null;
  mom: number | null;
  yoy: number | null;
  sourceUpdated: string | null;
}[]> {
  const meta = await pxGet(IIP_PATH);
  if (!meta.variables || meta.variables.length === 0) {
    logger.warn('[GSS-PPI] IIP table metadata returned no variables — skipping IIP sync');
    return [];
  }

  const monthVar = meta.variables.find((v) => v.code === 'Month');
  if (!monthVar || monthVar.values.length === 0) {
    logger.warn('[GSS-PPI] IIP: no Month dimension');
    return [];
  }

  const sectorVar = meta.variables.find((v) => v.code === 'Sector' || v.code === 'Industry');
  const availableSectors = sectorVar?.values ?? [];
  const wantedSectors = sectors.filter((s) => availableSectors.includes(s));
  if (wantedSectors.length === 0) {
    logger.warn('[GSS-PPI] IIP: none of the requested sectors found, trying all');
    // Fall back to fetching whatever is available
    wantedSectors.push(...availableSectors.slice(0, 5));
    if (wantedSectors.length === 0) return [];
  }

  const sectorCode = sectorVar?.code ?? 'Sector';
  const sourceUpdated = meta.updated ?? null;

  const px = await pxPost(IIP_PATH, [
    { code: sectorCode, selection: { filter: 'item', values: wantedSectors } },
    { code: 'Month', selection: { filter: 'all', values: ['*'] } },
  ]);

  const sectorDim = px.dimension[sectorCode];
  const monthDim = px.dimension.Month;
  if (!sectorDim || !monthDim) return [];

  const rows: {
    sector: string;
    monthCode: string;
    iipIndex: number | null;
    mom: number | null;
    yoy: number | null;
    sourceUpdated: string | null;
  }[] = [];

  for (const [sCode, sIdx] of Object.entries(sectorDim.category.index)) {
    const sLabel = sectorDim.category.label[sCode] ?? sCode;
    for (const [mCode, mIdx] of Object.entries(monthDim.category.index)) {
      const mLabel = monthDim.category.label[mCode] ?? mCode;
      const flatIdx = sIdx * Object.keys(monthDim.category.index).length + mIdx;
      const val = px.value[flatIdx] ?? null;
      rows.push({
        sector: sLabel,
        monthCode: mLabel,
        iipIndex: typeof val === 'number' ? val : null,
        mom: null,
        yoy: null,
        sourceUpdated,
      });
    }
  }

  return rows;
}

async function upsertIipRows(rows: Awaited<ReturnType<typeof fetchIip>>): Promise<number> {
  let saved = 0;
  for (const row of rows) {
    if (row.iipIndex === null) continue;
    let periodDate: string;
    try {
      periodDate = monthCodeToDate(row.monthCode).toISOString().slice(0, 10);
    } catch {
      continue; // skip rows with unexpected month code formats
    }
    await query(
      `INSERT INTO gss_iip_monthly
         (industry_sector, period_date, iip_index, change_mom_pct, change_yoy_pct,
          source_month, source_updated_at, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (industry_sector, period_date) DO UPDATE SET
         iip_index         = EXCLUDED.iip_index,
         change_mom_pct    = EXCLUDED.change_mom_pct,
         change_yoy_pct    = EXCLUDED.change_yoy_pct,
         source_updated_at = EXCLUDED.source_updated_at,
         synced_at         = NOW()`,
      [
        row.sector,
        periodDate,
        row.iipIndex,
        row.mom,
        row.yoy,
        row.monthCode,
        row.sourceUpdated,
      ],
    );
    saved++;
  }
  return saved;
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

export class GSS_PPIService {
  /**
   * Full sync: fetch all available PPI + IIP history from GSS and upsert.
   * Safe to call repeatedly — all writes are ON CONFLICT DO UPDATE.
   */
  async sync(triggeredBy: string = 'scheduled'): Promise<SyncResult> {
    const source = 'GSS StatsBank PPI/IIP';
    const startedAt = new Date();
    let syncId: string | undefined;
    let totalFetched = 0;
    let totalSaved = 0;
    const errors: SyncResult['errors'] = [];

    try {
      syncId = await syncLogRepository.startSync(source, 'scheduled', triggeredBy);
      logger.info('[GSS-PPI] Starting PPI + IIP sync', { triggeredBy, syncId });

      // --- PPI ---
      try {
        const ppiRows = await fetchPpi(PPI_INDUSTRIES);
        totalFetched += ppiRows.length;
        const ppiSaved = await upsertPpiRows(ppiRows);
        totalSaved += ppiSaved;
        logger.info('[GSS-PPI] PPI upserted', { fetched: ppiRows.length, saved: ppiSaved });
      } catch (err: any) {
        logger.error('[GSS-PPI] PPI fetch failed', { error: err.message });
        errors.push({ code: 'PPI_FETCH_ERROR', message: err.message, timestamp: new Date() });
      }

      // --- IIP ---
      try {
        const iipRows = await fetchIip(IIP_SECTORS);
        totalFetched += iipRows.length;
        const iipSaved = await upsertIipRows(iipRows);
        totalSaved += iipSaved;
        logger.info('[GSS-PPI] IIP upserted', { fetched: iipRows.length, saved: iipSaved });
      } catch (err: any) {
        logger.error('[GSS-PPI] IIP fetch failed (non-fatal)', { error: err.message });
        // IIP is supplementary — don't fail the whole sync
        errors.push({ code: 'IIP_FETCH_ERROR', message: err.message, timestamp: new Date() });
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
        metadata: { tables: ['gss_ppi_construction_series', 'gss_iip_monthly'] },
      };

      await syncLogRepository.completeSync(syncId, result);
      logger.info('[GSS-PPI] Sync complete', { saved: totalSaved, errors: errors.length });
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
      logger.error('[GSS-PPI] Sync failed', { error: err.message });
      return result;
    }
  }

  /**
   * Get latest Construction PPI index + changes. Used by constructionCostIndexService.
   */
  async getLatestConstructionPpi(): Promise<{
    period_date: string;
    ppi_index: number | null;
    change_mom_pct: number | null;
    change_yoy_pct: number | null;
  } | null> {
    try {
      const r = await query<{
        period_date: string;
        ppi_index: string;
        change_mom_pct: string | null;
        change_yoy_pct: string | null;
      }>(
        `SELECT period_date::text, ppi_index, change_mom_pct, change_yoy_pct
         FROM gss_ppi_construction_series
         WHERE series_code = 'Construction'
         ORDER BY period_date DESC
         LIMIT 1`,
      );
      if (!r.rows.length) return null;
      const row = r.rows[0];
      return {
        period_date: row.period_date,
        ppi_index: row.ppi_index ? parseFloat(row.ppi_index) : null,
        change_mom_pct: row.change_mom_pct ? parseFloat(row.change_mom_pct) : null,
        change_yoy_pct: row.change_yoy_pct ? parseFloat(row.change_yoy_pct) : null,
      };
    } catch (err: any) {
      if (err.code === '42P01') return null; // table not yet created
      throw err;
    }
  }

  /**
   * Get full Construction PPI history (for overlay on CCI trend chart).
   */
  async getConstructionPpiHistory(months = 36): Promise<Array<{
    period_date: string;
    ppi_index: number | null;
    change_yoy_pct: number | null;
  }>> {
    try {
      const r = await query<{ period_date: string; ppi_index: string; change_yoy_pct: string | null }>(
        `SELECT period_date::text, ppi_index, change_yoy_pct
         FROM gss_ppi_construction_series
         WHERE series_code = 'Construction'
         ORDER BY period_date ASC
         LIMIT $1`,
        [months],
      );
      return r.rows.map((row) => ({
        period_date: row.period_date,
        ppi_index: row.ppi_index ? parseFloat(row.ppi_index) : null,
        change_yoy_pct: row.change_yoy_pct ? parseFloat(row.change_yoy_pct) : null,
      }));
    } catch {
      return [];
    }
  }
}

export const gssPpiService = new GSS_PPIService();
