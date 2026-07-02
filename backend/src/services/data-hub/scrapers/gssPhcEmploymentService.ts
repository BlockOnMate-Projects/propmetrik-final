/**
 * GSS PHC Employment Service (Slice 3 — P1/P2 Employment)
 *
 * Fetches three GSS StatsBank PxWeb tables and persists region-level employment
 * structure into gss_phc_employment_by_district:
 *
 *   sector_table.px         → public / semi-public / private-formal / private-informal shares
 *   econact_table.px        → employment-to-population ratio (Employed / pop 15+)
 *   Unemployment_table_2.px → unemployment rate (already a rate in the source)
 *
 * On completion it backfills regional_household_income.formal_employment_pct from
 * this census source (public + semi-public + private-formal). PHC 2021 is the
 * authoritative census figure — more accurate than the AHIES survey estimate the
 * income service uses — which upgrades the GHAI MAS calibration downstream.
 *
 * Region granularity (16 GSS regions, district = region), annual refresh,
 * idempotent upserts. Follows the gssPhcHousingService.ts pattern via gssPhcShared.
 *
 * @module services/data-hub/scrapers/gssPhcEmploymentService
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
const SECTOR_PATH = `${PHC_DB}/Economic%20Activity/sector_table.px`;
const ECONACT_PATH = `${PHC_DB}/Economic%20Activity/econact_table.px`;
const UNEMPLOYMENT_PATH = `${PHC_DB}/Economic%20Activity/Unemployment_table_2.px`;

/** Sector categories composing the formal sector (verified against live metadata). */
const FORMAL_SECTORS = ['Public (Government)', 'Semi-Public/Parastatal', 'Private Formal'];

// ---------------------------------------------------------------------------
// Employment fetch
// ---------------------------------------------------------------------------

interface EmploymentRow {
  region: string;            // snake_case key
  public_pct: number | null;
  semi_public_pct: number | null;
  private_formal_pct: number | null;
  private_informal_pct: number | null;
  formal_employment_pct: number | null;
  employment_to_pop_pct: number | null;
  unemployment_rate: number | null;
}

async function fetchEmployment(): Promise<EmploymentRow[]> {
  // Sector shares: employed population (15+) by sector. Age='All ages', Education/Sex/Locality collapsed.
  const sectorPx: PxStat2 = await pxPost(SECTOR_PATH, [
    { code: 'Sector', selection: { filter: 'item', values: ['Total', ...FORMAL_SECTORS, 'Private Informal'] } },
    { code: 'Education', selection: { filter: 'item', values: ['Total'] } },
    { code: 'Locality', selection: { filter: 'item', values: ['All Locality Types'] } },
    { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } },
    { code: 'Sex', selection: { filter: 'item', values: ['Both sexes'] } },
    { code: 'Age', selection: { filter: 'item', values: ['All ages'] } },
  ]);

  await sleep(250);

  // Economic activity: Total (pop 15+) and Employed → employment-to-population ratio.
  const econPx: PxStat2 = await pxPost(ECONACT_PATH, [
    { code: 'Econact', selection: { filter: 'item', values: ['Total', 'Employed'] } },
    { code: 'Education', selection: { filter: 'item', values: ['Total'] } },
    { code: 'Locality', selection: { filter: 'item', values: ['All Locality Types'] } },
    { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } },
    { code: 'Sex', selection: { filter: 'item', values: ['Both sexes'] } },
    { code: 'Age', selection: { filter: 'item', values: ['Total'] } },
  ]);

  await sleep(250);

  // Unemployment rate: the cell value is already the rate (%).
  const unempPx: PxStat2 = await pxPost(UNEMPLOYMENT_PATH, [
    { code: 'Education', selection: { filter: 'item', values: ['Total'] } },
    { code: 'Locality', selection: { filter: 'item', values: ['All Locality Types'] } },
    { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } },
    { code: 'Sex', selection: { filter: 'item', values: ['Both sexes'] } },
    { code: 'Age', selection: { filter: 'item', values: ['All ages'] } },
  ]);

  const pct = (v: number | null, total: number | null): number | null =>
    v !== null && total !== null && total > 0 ? Math.round((v / total) * 10000) / 100 : null;

  const rows: EmploymentRow[] = [];
  for (const region of GSS_REGIONS) {
    const sBase = { Education: 'Total', Locality: 'All Locality Types', Geographic_Area: region, Sex: 'Both sexes', Age: 'All ages' };
    const sectorTotal = pxGetValue(sectorPx, { ...sBase, Sector: 'Total' });
    const pub = pxGetValue(sectorPx, { ...sBase, Sector: 'Public (Government)' });
    const semi = pxGetValue(sectorPx, { ...sBase, Sector: 'Semi-Public/Parastatal' });
    const privF = pxGetValue(sectorPx, { ...sBase, Sector: 'Private Formal' });
    const privI = pxGetValue(sectorPx, { ...sBase, Sector: 'Private Informal' });

    const formalCount = (pub ?? 0) + (semi ?? 0) + (privF ?? 0);
    const formalPct = (pub !== null || semi !== null || privF !== null)
      ? pct(formalCount, sectorTotal) : null;

    // Employment-to-population ratio.
    const eBase = { Education: 'Total', Locality: 'All Locality Types', Geographic_Area: region, Sex: 'Both sexes', Age: 'Total' };
    const pop15 = pxGetValue(econPx, { ...eBase, Econact: 'Total' });
    const employed = pxGetValue(econPx, { ...eBase, Econact: 'Employed' });
    const empToPop = pct(employed, pop15);

    // Unemployment rate (value is already a rate).
    const unemp = pxGetValue(unempPx, { Education: 'Total', Locality: 'All Locality Types', Geographic_Area: region, Sex: 'Both sexes', Age: 'All ages' });

    rows.push({
      region: regionKey(region),
      public_pct: pct(pub, sectorTotal),
      semi_public_pct: pct(semi, sectorTotal),
      private_formal_pct: pct(privF, sectorTotal),
      private_informal_pct: pct(privI, sectorTotal),
      formal_employment_pct: formalPct,
      employment_to_pop_pct: empToPop,
      unemployment_rate: unemp !== null ? Math.round(unemp * 100) / 100 : null,
    });
  }
  return rows;
}

async function upsertEmployment(rows: EmploymentRow[]): Promise<number> {
  let saved = 0;
  for (const r of rows) {
    if (r.formal_employment_pct === null && r.employment_to_pop_pct === null && r.unemployment_rate === null) continue;
    await query(
      `INSERT INTO gss_phc_employment_by_district
         (district, region, locality,
          public_pct, semi_public_pct, private_formal_pct, private_informal_pct,
          formal_employment_pct, employment_to_pop_pct, unemployment_rate, synced_at)
       VALUES ($1,$1,'All Locality Types',$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (district, region, locality) DO UPDATE SET
         public_pct            = EXCLUDED.public_pct,
         semi_public_pct       = EXCLUDED.semi_public_pct,
         private_formal_pct    = EXCLUDED.private_formal_pct,
         private_informal_pct  = EXCLUDED.private_informal_pct,
         formal_employment_pct = EXCLUDED.formal_employment_pct,
         employment_to_pop_pct = EXCLUDED.employment_to_pop_pct,
         unemployment_rate     = EXCLUDED.unemployment_rate,
         synced_at             = NOW()`,
      [r.region, r.public_pct, r.semi_public_pct, r.private_formal_pct, r.private_informal_pct,
       r.formal_employment_pct, r.employment_to_pop_pct, r.unemployment_rate],
    );
    saved++;
  }
  return saved;
}

/**
 * Backfill regional_household_income.formal_employment_pct from the census
 * figure. PHC 2021 is more authoritative than the AHIES estimate the income
 * service writes — this upgrades the GHAI MAS calibration. Non-fatal.
 */
async function backfillFormalEmployment(rows: EmploymentRow[]): Promise<number> {
  let updated = 0;
  for (const r of rows) {
    if (r.formal_employment_pct === null) continue;
    const res = await query(
      `UPDATE regional_household_income
         SET formal_employment_pct = $1
       WHERE region = $2
         AND period_month = (
           SELECT MAX(period_month) FROM regional_household_income WHERE region = $2
         )`,
      [r.formal_employment_pct, r.region],
    );
    updated += res.rowCount ?? 0;
  }
  return updated;
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

export class GSS_PHCEmploymentService {
  async sync(triggeredBy: string = 'scheduled'): Promise<SyncResult> {
    const source = 'GSS StatsBank PHC Employment';
    const startedAt = new Date();
    let syncId: string | undefined;
    let totalSaved = 0;
    const errors: SyncResult['errors'] = [];

    try {
      syncId = await syncLogRepository.startSync(source, 'scheduled', triggeredBy);
      logger.info('[GSS-PHC-Employment] Starting employment sync', { triggeredBy, syncId });

      let rows: EmploymentRow[] = [];
      try {
        logger.info('[GSS-PHC-Employment] Fetching sector/econact/unemployment...');
        rows = await fetchEmployment();
        const saved = await upsertEmployment(rows);
        totalSaved += saved;
        logger.info('[GSS-PHC-Employment] Employment upserted', { saved });
      } catch (err: any) {
        logger.error('[GSS-PHC-Employment] Employment fetch failed', { error: err.message });
        errors.push({ code: 'EMPLOYMENT_ERROR', message: err.message, timestamp: new Date() });
      }

      // Backfill formal_employment_pct into regional_household_income (non-fatal).
      if (rows.length > 0) {
        try {
          const updated = await backfillFormalEmployment(rows);
          logger.info('[GSS-PHC-Employment] Backfilled formal_employment_pct', { updated });
        } catch (err: any) {
          logger.warn('[GSS-PHC-Employment] Formal-employment backfill failed (non-fatal)', { error: err.message });
          errors.push({ code: 'BACKFILL_ERROR', message: err.message, timestamp: new Date() });
        }
      }

      const result: SyncResult = {
        source,
        status: errors.some(e => e.code === 'EMPLOYMENT_ERROR')
          ? (totalSaved > 0 ? 'partial' : 'failed')
          : 'success',
        started_at: startedAt,
        completed_at: new Date(),
        records_fetched: totalSaved,
        records_saved: totalSaved,
        records_failed: 0,
        errors,
        metadata: { tables: ['gss_phc_employment_by_district'] },
      };
      await syncLogRepository.completeSync(syncId, result);
      logger.info('[GSS-PHC-Employment] Sync complete', { saved: totalSaved, errors: errors.length });
      return result;
    } catch (err: any) {
      const result: SyncResult = {
        source, status: 'failed', started_at: startedAt, completed_at: new Date(),
        records_fetched: 0, records_saved: totalSaved, records_failed: 0,
        errors: [{ code: 'SYNC_ERROR', message: err.message, timestamp: new Date() }],
        metadata: {},
      };
      if (syncId) await syncLogRepository.completeSync(syncId, result);
      logger.error('[GSS-PHC-Employment] Sync failed', { error: err.message });
      return result;
    }
  }

  /**
   * Formal employment % per region from the PHC census (authoritative).
   * Consumed by ghaiService to upgrade the MAS calibration to census-level.
   */
  async getFormalEmploymentByRegion(): Promise<Record<string, number | null>> {
    try {
      const r = await query<{ region: string; formal_employment_pct: string | null }>(
        `SELECT DISTINCT ON (region) region, formal_employment_pct
         FROM gss_phc_employment_by_district
         WHERE locality = 'All Locality Types'
         ORDER BY region, synced_at DESC`,
      );
      const out: Record<string, number | null> = {};
      for (const row of r.rows) {
        out[row.region] = row.formal_employment_pct !== null ? parseFloat(row.formal_employment_pct) : null;
      }
      return out;
    } catch {
      return {};
    }
  }

  /** Unemployment rate per region — used by the RHDS employment component + rental affordability bands. */
  async getUnemploymentByRegion(): Promise<Record<string, number | null>> {
    try {
      const r = await query<{ region: string; unemployment_rate: string | null }>(
        `SELECT DISTINCT ON (region) region, unemployment_rate
         FROM gss_phc_employment_by_district
         WHERE locality = 'All Locality Types'
         ORDER BY region, synced_at DESC`,
      );
      const out: Record<string, number | null> = {};
      for (const row of r.rows) {
        out[row.region] = row.unemployment_rate !== null ? parseFloat(row.unemployment_rate) : null;
      }
      return out;
    } catch {
      return {};
    }
  }
}

export const gssPhcEmploymentService = new GSS_PHCEmploymentService();
