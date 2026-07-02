/**
 * GSS PHC Poverty Service (Slice 3 — P1/P2 Multidimensional Poverty)
 *
 * Fetches three GSS StatsBank PxWeb tables and persists region-level poverty
 * metrics into gss_phc_mpi_by_district:
 *
 *   MPI_by_locality.px    → incidence (H), intensity (A), MPI (M0)
 *   MPI_by_sex.px         → M0 for female-headed vs male-headed households
 *   MPI_contributors.px   → per-indicator contribution breakdown (JSONB) + top driver
 *
 * mpi_m0 drives the investment-scoring poverty discount + the /analytics/market
 * poverty risk badge. Region granularity (16 GSS regions, district = region),
 * annual refresh, idempotent upserts.
 *
 * NOTE: MPI_contributors.px has a code/label misalignment in the GSS source
 * file, so contributions are keyed by the PxWeb value CODE (the query key),
 * which is stable, rather than the display label.
 *
 * @module services/data-hub/scrapers/gssPhcPovertyService
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
const MPI_LOCALITY_PATH = `${PHC_DB}/Multidimensional%20Poverty/MPI_by_locality.px`;
const MPI_SEX_PATH = `${PHC_DB}/Multidimensional%20Poverty/MPI_by_sex.px`;
const MPI_CONTRIB_PATH = `${PHC_DB}/Multidimensional%20Poverty/MPI_contributors.px`;

const H = 'Incidence of Poverty (H)';
const A = 'Intensity of Poverty (A)';
const M0 = 'Multidimensional Poverty Index (M0)';

// ---------------------------------------------------------------------------
// Poverty fetch
// ---------------------------------------------------------------------------

interface MpiRow {
  region: string;               // snake_case key
  mpi_incidence: number | null;
  mpi_intensity: number | null;
  mpi_m0: number | null;
  female_headed_m0: number | null;
  male_headed_m0: number | null;
  top_contributor: string | null;
  contributors: Record<string, number | null>;
}

async function fetchPoverty(): Promise<MpiRow[]> {
  // Core H/A/M0 by region.
  const localityPx: PxStat2 = await pxPost(MPI_LOCALITY_PATH, [
    { code: 'poverty_measure', selection: { filter: 'item', values: [H, A, M0] } },
    { code: 'locality', selection: { filter: 'item', values: ['All locality types'] } },
    { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } },
  ]);

  await sleep(250);

  // M0 by sex of household head.
  const sexPx: PxStat2 = await pxPost(MPI_SEX_PATH, [
    { code: 'poverty_measure', selection: { filter: 'item', values: [M0] } },
    { code: 'sex_head_of_household', selection: { filter: 'item', values: ['Female', 'Male'] } },
    { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } },
  ]);

  await sleep(250);

  // Contributors to poverty by indicator (all indicators).
  const contribPx: PxStat2 = await pxPost(MPI_CONTRIB_PATH, [
    { code: 'indicator', selection: { filter: 'all', values: ['*'] } },
    { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } },
  ]);
  const indicatorCodes = Object.keys(contribPx.dimension.indicator?.category.index ?? {});

  const rows: MpiRow[] = [];
  for (const region of GSS_REGIONS) {
    const incidence = pxGetValue(localityPx, { poverty_measure: H, locality: 'All locality types', Geographic_Area: region });
    const intensity = pxGetValue(localityPx, { poverty_measure: A, locality: 'All locality types', Geographic_Area: region });
    const m0 = pxGetValue(localityPx, { poverty_measure: M0, locality: 'All locality types', Geographic_Area: region });

    const femaleM0 = pxGetValue(sexPx, { poverty_measure: M0, sex_head_of_household: 'Female', Geographic_Area: region });
    const maleM0 = pxGetValue(sexPx, { poverty_measure: M0, sex_head_of_household: 'Male', Geographic_Area: region });

    const contributors: Record<string, number | null> = {};
    let topContributor: string | null = null;
    let topValue = -Infinity;
    for (const code of indicatorCodes) {
      const v = pxGetValue(contribPx, { indicator: code, Geographic_Area: region });
      contributors[code] = v;
      if (v !== null && v > topValue) { topValue = v; topContributor = code; }
    }

    rows.push({
      region: regionKey(region),
      mpi_incidence: incidence,
      mpi_intensity: intensity,
      mpi_m0: m0,
      female_headed_m0: femaleM0,
      male_headed_m0: maleM0,
      top_contributor: topContributor,
      contributors,
    });
  }
  return rows;
}

async function upsertPoverty(rows: MpiRow[]): Promise<number> {
  let saved = 0;
  for (const r of rows) {
    if (r.mpi_m0 === null && r.mpi_incidence === null) continue;
    await query(
      `INSERT INTO gss_phc_mpi_by_district
         (district, region, locality,
          mpi_incidence, mpi_intensity, mpi_m0, female_headed_m0, male_headed_m0,
          top_contributor, contributors, synced_at)
       VALUES ($1,$1,'All locality types',$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (district, region, locality) DO UPDATE SET
         mpi_incidence    = EXCLUDED.mpi_incidence,
         mpi_intensity    = EXCLUDED.mpi_intensity,
         mpi_m0           = EXCLUDED.mpi_m0,
         female_headed_m0 = EXCLUDED.female_headed_m0,
         male_headed_m0   = EXCLUDED.male_headed_m0,
         top_contributor  = EXCLUDED.top_contributor,
         contributors     = EXCLUDED.contributors,
         synced_at        = NOW()`,
      [r.region, r.mpi_incidence, r.mpi_intensity, r.mpi_m0, r.female_headed_m0, r.male_headed_m0,
       r.top_contributor, JSON.stringify(r.contributors)],
    );
    saved++;
  }
  return saved;
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

export class GSS_PHCPovertyService {
  async sync(triggeredBy: string = 'scheduled'): Promise<SyncResult> {
    const source = 'GSS StatsBank PHC Poverty';
    const startedAt = new Date();
    let syncId: string | undefined;
    let totalSaved = 0;
    const errors: SyncResult['errors'] = [];

    try {
      syncId = await syncLogRepository.startSync(source, 'scheduled', triggeredBy);
      logger.info('[GSS-PHC-Poverty] Starting multidimensional poverty sync', { triggeredBy, syncId });

      try {
        logger.info('[GSS-PHC-Poverty] Fetching MPI locality/sex/contributors...');
        const rows = await fetchPoverty();
        const saved = await upsertPoverty(rows);
        totalSaved += saved;
        logger.info('[GSS-PHC-Poverty] MPI upserted', { saved });
      } catch (err: any) {
        logger.error('[GSS-PHC-Poverty] MPI fetch failed', { error: err.message });
        errors.push({ code: 'MPI_ERROR', message: err.message, timestamp: new Date() });
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
        metadata: { tables: ['gss_phc_mpi_by_district'] },
      };
      await syncLogRepository.completeSync(syncId, result);
      logger.info('[GSS-PHC-Poverty] Sync complete', { saved: totalSaved, errors: errors.length });
      return result;
    } catch (err: any) {
      const result: SyncResult = {
        source, status: 'failed', started_at: startedAt, completed_at: new Date(),
        records_fetched: 0, records_saved: totalSaved, records_failed: 0,
        errors: [{ code: 'SYNC_ERROR', message: err.message, timestamp: new Date() }],
        metadata: {},
      };
      if (syncId) await syncLogRepository.completeSync(syncId, result);
      logger.error('[GSS-PHC-Poverty] Sync failed', { error: err.message });
      return result;
    }
  }

  /**
   * MPI metrics per region — consumed by investmentScoringService for the
   * poverty discount + risk badge.
   */
  async getMpiByRegion(): Promise<Record<string, {
    mpi_incidence: number | null;
    mpi_intensity: number | null;
    mpi_m0: number | null;
    top_contributor: string | null;
  }>> {
    try {
      const r = await query<{
        region: string; mpi_incidence: string | null; mpi_intensity: string | null;
        mpi_m0: string | null; top_contributor: string | null;
      }>(
        `SELECT DISTINCT ON (region) region, mpi_incidence, mpi_intensity, mpi_m0, top_contributor
         FROM gss_phc_mpi_by_district
         WHERE locality = 'All locality types'
         ORDER BY region, synced_at DESC`,
      );
      const out: Record<string, any> = {};
      for (const row of r.rows) {
        const incidence = row.mpi_incidence !== null ? parseFloat(row.mpi_incidence) : null;
        const intensity = row.mpi_intensity !== null ? parseFloat(row.mpi_intensity) : null;
        const publishedM0 = row.mpi_m0 !== null ? parseFloat(row.mpi_m0) : null;
        // The published M0 is rounded to 1 dp by GSS, which collapses the low band
        // (Accra 0.05 → 0.1). Recover full resolution as M0 = H × A when both present.
        const m0 = (incidence !== null && intensity !== null)
          ? Math.round((incidence / 100) * (intensity / 100) * 10000) / 10000
          : publishedM0;
        out[row.region] = {
          mpi_incidence: incidence,
          mpi_intensity: intensity,
          mpi_m0: m0,
          top_contributor: row.top_contributor,
        };
      }
      return out;
    } catch {
      return {};
    }
  }
}

export const gssPhcPovertyService = new GSS_PHCPovertyService();
