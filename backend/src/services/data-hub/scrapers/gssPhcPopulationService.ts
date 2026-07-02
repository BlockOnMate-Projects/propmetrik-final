/**
 * GSS PHC Population Service (Slice 3 — P1/P2 Population + Household Size)
 *
 * Fetches three GSS StatsBank PxWeb tables and persists region-level metrics:
 *
 *   gss_phc_population_projections      ← Population/projections.px (2021–2035)
 *   gss_phc_household_size_by_district  ← Population/avg_hhsize_table.px
 *                                         + Population/hhsize_table.px
 *
 * Population projections feed the Regional Housing Demand Score (RHDS) pop-growth
 * component and the Slice 5 housing-deficit model. Household size feeds the
 * deficit divisor and overcrowding context.
 *
 * Rows are stored at REGION granularity (16 GSS regions) with `district = region`,
 * matching the Slice 2 PHC housing convention (every consumer joins on region).
 * Annual refresh (census is static); idempotent ON CONFLICT upserts.
 *
 * Follows the PxWeb client pattern from gssPhcHousingService.ts exactly.
 *
 * @module services/data-hub/scrapers/gssPhcPopulationService
 */

import { query } from '../../../database';
import { logger } from '../../../utils/logger';
import { syncLogRepository } from './syncLogRepository';
import type { SyncResult } from './types';
import {
  GSS_REGIONS,
  regionKey,
  pxPost,
  pxGetValue,
  sleep,
  type PxStat2,
} from './gssPhcShared';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PHC_DB = '/api/v1/en/PHC%202021%20StatsBank';
const PROJECTIONS_PATH = `${PHC_DB}/Population/projections.px`;
const AVG_HHSIZE_PATH = `${PHC_DB}/Population/avg_hhsize_table.px`;
const HHSIZE_PATH = `${PHC_DB}/Population/hhsize_table.px`;

/** Projection years persisted (base census year → 2035 horizon). */
const PROJECTION_YEARS = ['2021', '2022', '2023', '2024', '2025', '2026', '2027',
  '2028', '2029', '2030', '2031', '2032', '2033', '2034', '2035'];

/** 5-year age bands composing the 20–40 prime housing-demand cohort. */
const WORKING_AGE_BANDS = ['20-24', '25-29', '30-34', '35-39'];
/** Youth labour-market entrants (15–24). */
const YOUTH_BANDS = ['15-19', '20-24'];

/** Household-size buckets in hhsize_table.px (excluding 'Total'). */
const HHSIZE_BUCKETS = ['1 Person', '2 Persons', '3 Persons', '4 Persons',
  '5 Persons', '6 Persons', '7 Persons', '8 Persons', '9 Persons', '10 Persons +'];

// ---------------------------------------------------------------------------
// Population projections
// ---------------------------------------------------------------------------

interface ProjectionRow {
  region: string;             // snake_case key
  year: number;
  total_population: number | null;
  working_age_20_40: number | null;
  youth_15_24: number | null;
}

async function fetchProjections(): Promise<ProjectionRow[]> {
  const ages = ['All ages', ...new Set([...WORKING_AGE_BANDS, ...YOUTH_BANDS])];
  const px: PxStat2 = await pxPost(PROJECTIONS_PATH, [
    { code: 'Year', selection: { filter: 'item', values: PROJECTION_YEARS } },
    { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } },
    { code: 'Age', selection: { filter: 'item', values: ages } },
    { code: 'Sex', selection: { filter: 'item', values: ['Both sexes'] } },
    { code: 'Locality', selection: { filter: 'item', values: ['All locality types'] } },
  ]);

  const rows: ProjectionRow[] = [];
  for (const region of GSS_REGIONS) {
    for (const year of PROJECTION_YEARS) {
      const base = { Year: year, Geographic_Area: region, Sex: 'Both sexes', Locality: 'All locality types' };
      const total = pxGetValue(px, { ...base, Age: 'All ages' });
      const workingAge = sumBands(px, base, WORKING_AGE_BANDS);
      const youth = sumBands(px, base, YOUTH_BANDS);
      rows.push({
        region: regionKey(region),
        year: parseInt(year, 10),
        total_population: total,
        working_age_20_40: workingAge,
        youth_15_24: youth,
      });
    }
  }
  return rows;
}

function sumBands(px: PxStat2, base: Record<string, string>, bands: string[]): number | null {
  let sum = 0;
  let any = false;
  for (const band of bands) {
    const v = pxGetValue(px, { ...base, Age: band });
    if (v !== null && v !== undefined) { sum += v; any = true; }
  }
  return any ? sum : null;
}

async function upsertProjections(rows: ProjectionRow[]): Promise<number> {
  let saved = 0;
  for (const r of rows) {
    if (r.total_population === null) continue;
    await query(
      `INSERT INTO gss_phc_population_projections
         (region, year, locality, total_population, working_age_20_40, youth_15_24, synced_at)
       VALUES ($1,$2,'All locality types',$3,$4,$5,NOW())
       ON CONFLICT (region, year, locality) DO UPDATE SET
         total_population  = EXCLUDED.total_population,
         working_age_20_40 = EXCLUDED.working_age_20_40,
         youth_15_24       = EXCLUDED.youth_15_24,
         synced_at         = NOW()`,
      [r.region, r.year, r.total_population, r.working_age_20_40, r.youth_15_24],
    );
    saved++;
  }
  return saved;
}

// ---------------------------------------------------------------------------
// Household size (average + distribution)
// ---------------------------------------------------------------------------

interface HouseholdSizeRow {
  region: string;
  avg_household_size: number | null;
  total_households: number | null;
  distribution: Record<string, number | null>;
}

async function fetchHouseholdSize(): Promise<HouseholdSizeRow[]> {
  const [avgPx, distPx]: [PxStat2, PxStat2] = await Promise.all([
    pxPost(AVG_HHSIZE_PATH, [
      { code: 'Locality', selection: { filter: 'item', values: ['All Locality Types'] } },
      { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } },
    ]),
    pxPost(HHSIZE_PATH, [
      { code: 'Locality', selection: { filter: 'item', values: ['All Locality Types'] } },
      { code: 'Household_size', selection: { filter: 'item', values: ['Total', ...HHSIZE_BUCKETS] } },
      { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } },
    ]),
  ]);

  const rows: HouseholdSizeRow[] = [];
  for (const region of GSS_REGIONS) {
    const avg = pxGetValue(avgPx, { Locality: 'All Locality Types', Geographic_Area: region });
    const total = pxGetValue(distPx, { Locality: 'All Locality Types', Household_size: 'Total', Geographic_Area: region });

    const distribution: Record<string, number | null> = {};
    for (const bucket of HHSIZE_BUCKETS) {
      const count = pxGetValue(distPx, { Locality: 'All Locality Types', Household_size: bucket, Geographic_Area: region });
      distribution[bucket] = (count !== null && total !== null && total > 0)
        ? Math.round((count / total) * 10000) / 100  // percentage 0–100
        : null;
    }

    rows.push({
      region: regionKey(region),
      avg_household_size: avg,
      total_households: total,
      distribution,
    });
  }
  return rows;
}

async function upsertHouseholdSize(rows: HouseholdSizeRow[]): Promise<number> {
  let saved = 0;
  for (const r of rows) {
    if (r.avg_household_size === null && r.total_households === null) continue;
    await query(
      `INSERT INTO gss_phc_household_size_by_district
         (district, region, locality, avg_household_size, total_households, hhsize_distribution, synced_at)
       VALUES ($1,$1,'All Locality Types',$2,$3,$4,NOW())
       ON CONFLICT (district, region, locality) DO UPDATE SET
         avg_household_size  = EXCLUDED.avg_household_size,
         total_households    = EXCLUDED.total_households,
         hhsize_distribution = EXCLUDED.hhsize_distribution,
         synced_at           = NOW()`,
      [r.region, r.avg_household_size, r.total_households, JSON.stringify(r.distribution)],
    );
    saved++;
  }
  return saved;
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

export class GSS_PHCPopulationService {
  async sync(triggeredBy: string = 'scheduled'): Promise<SyncResult> {
    const source = 'GSS StatsBank PHC Population';
    const startedAt = new Date();
    let syncId: string | undefined;
    let totalSaved = 0;
    const errors: SyncResult['errors'] = [];

    try {
      syncId = await syncLogRepository.startSync(source, 'scheduled', triggeredBy);
      logger.info('[GSS-PHC-Population] Starting population + household-size sync', { triggeredBy, syncId });

      // --- Population projections ---
      try {
        logger.info('[GSS-PHC-Population] Fetching population projections...');
        const projRows = await fetchProjections();
        const projSaved = await upsertProjections(projRows);
        totalSaved += projSaved;
        logger.info('[GSS-PHC-Population] Projections upserted', { saved: projSaved });
      } catch (err: any) {
        logger.error('[GSS-PHC-Population] Projections failed', { error: err.message });
        errors.push({ code: 'PROJECTIONS_ERROR', message: err.message, timestamp: new Date() });
      }

      await sleep(300);

      // --- Household size ---
      try {
        logger.info('[GSS-PHC-Population] Fetching household size...');
        const hhRows = await fetchHouseholdSize();
        const hhSaved = await upsertHouseholdSize(hhRows);
        totalSaved += hhSaved;
        logger.info('[GSS-PHC-Population] Household size upserted', { saved: hhSaved });
      } catch (err: any) {
        logger.error('[GSS-PHC-Population] Household size failed', { error: err.message });
        errors.push({ code: 'HHSIZE_ERROR', message: err.message, timestamp: new Date() });
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
        metadata: { tables: ['gss_phc_population_projections', 'gss_phc_household_size_by_district'] },
      };
      await syncLogRepository.completeSync(syncId, result);
      logger.info('[GSS-PHC-Population] Sync complete', { saved: totalSaved, errors: errors.length });
      return result;
    } catch (err: any) {
      const result: SyncResult = {
        source, status: 'failed', started_at: startedAt, completed_at: new Date(),
        records_fetched: 0, records_saved: totalSaved, records_failed: 0,
        errors: [{ code: 'SYNC_ERROR', message: err.message, timestamp: new Date() }],
        metadata: {},
      };
      if (syncId) await syncLogRepository.completeSync(syncId, result);
      logger.error('[GSS-PHC-Population] Sync failed', { error: err.message });
      return result;
    }
  }

  /**
   * Population projections per region for two years (default current census-year
   * base 2021 vs 2030 horizon). Used by housingDemandScoreService (RHDS pop-growth)
   * and the /analytics/demand cohort chart.
   */
  async getProjectionsByRegion(baseYear = 2021, horizonYear = 2030): Promise<Record<string, {
    base_working_age: number | null;
    horizon_working_age: number | null;
    base_total: number | null;
    horizon_total: number | null;
  }>> {
    try {
      const r = await query<{
        region: string; year: number;
        total_population: string | null; working_age_20_40: string | null;
      }>(
        `SELECT region, year, total_population, working_age_20_40
         FROM gss_phc_population_projections
         WHERE year IN ($1, $2) AND locality = 'All locality types'`,
        [baseYear, horizonYear],
      );
      const out: Record<string, any> = {};
      for (const row of r.rows) {
        const key = row.region;
        if (!out[key]) out[key] = { base_working_age: null, horizon_working_age: null, base_total: null, horizon_total: null };
        const wa = row.working_age_20_40 !== null ? parseFloat(row.working_age_20_40) : null;
        const tot = row.total_population !== null ? parseFloat(row.total_population) : null;
        if (row.year === baseYear) { out[key].base_working_age = wa; out[key].base_total = tot; }
        else if (row.year === horizonYear) { out[key].horizon_working_age = wa; out[key].horizon_total = tot; }
      }
      return out;
    } catch {
      return {};
    }
  }

  /** Average household size per region — used by the Slice 5 housing-deficit model. */
  async getAvgHouseholdSizeByRegion(): Promise<Record<string, number | null>> {
    try {
      const r = await query<{ region: string; avg_household_size: string | null }>(
        `SELECT DISTINCT ON (region) region, avg_household_size
         FROM gss_phc_household_size_by_district
         WHERE locality = 'All Locality Types'
         ORDER BY region, synced_at DESC`,
      );
      const out: Record<string, number | null> = {};
      for (const row of r.rows) {
        out[row.region] = row.avg_household_size !== null ? parseFloat(row.avg_household_size) : null;
      }
      return out;
    } catch {
      return {};
    }
  }
}

export const gssPhcPopulationService = new GSS_PHCPopulationService();
