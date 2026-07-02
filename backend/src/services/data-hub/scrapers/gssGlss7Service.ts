/**
 * GSS GLSS7 Service (Slice 4 — P2 Migration + Tourism + Housing)
 *
 * Fetches four GSS StatsBank PxWeb tables from the GLSS7 (2016/17) database and
 * persists region-level metrics:
 *
 *   Migration/Table_6.4.px   → gss_glss7_migration_flows   (inter-regional flow matrix)
 *   Migration/Table_6.15.px  → gss_glss7_tourism_by_region (domestic overnight tourism)
 *   Housing/Table_7.2.px     → gss_glss7_housing_snapshot  (occupancy status)
 *   Housing/Table_7.3.px     → gss_glss7_housing_snapshot  (rent payee, merged in)
 *
 * These complete the Regional Housing Demand Score (RHDS) migration component
 * (housingDemandScoreService reads gss_glss7_migration_flows and flips
 * migration_active true once rows exist), classify short-stay markets by tourism
 * demand type, and activate the migration absorption factor in investment scoring.
 *
 * REGION TAXONOMY: GLSS7 predates the 2019 region split — it uses the OLD 10
 * regions (includes "Brong Ahafo"; lacks Western North, Savannah, North East,
 * Oti, Bono, Bono East, Ahafo). Rows are stored under GLSS7's own snake_case
 * region keys; consumers join on region and pick up the 9 unchanged regions, with
 * Brong Ahafo's successors degrading to null (no fabricated split), consistent
 * with the RHDS graceful-degradation design.
 *
 * Follows the PxWeb client pattern from gssPhcPovertyService.ts exactly (shared
 * pxPost / pxGetValue helpers). Annual refresh (survey is static); idempotent
 * ON CONFLICT upserts.
 *
 * @module services/data-hub/scrapers/gssGlss7Service
 */

import { query } from '../../../database';
import { logger } from '../../../utils/logger';
import { syncLogRepository } from './syncLogRepository';
import type { SyncResult } from './types';
import {
  regionKey,
  pxPost,
  pxGetValue,
  sleep,
  type PxStat2,
} from './gssPhcShared';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const GLSS7_DB = '/api/v1/en/GLSS7';
const MIGRATION_FLOWS_PATH = `${GLSS7_DB}/Migration/Table_6.4.px`;
const TOURISM_PATH = `${GLSS7_DB}/Migration/Table_6.15.px`;
const OCCUPANCY_PATH = `${GLSS7_DB}/Housing/Table_7.2.px`;
const RENT_PAYEE_PATH = `${GLSS7_DB}/Housing/Table_7.3.px`;

/** GLSS7 old 10-region classification (verbatim PxWeb `Region` values, excluding 'Total'). */
const GLSS7_REGIONS = [
  'Western', 'Central', 'Greater Accra', 'Volta', 'Eastern', 'Ashanti',
  'Brong Ahafo', 'Northern', 'Upper East', 'Upper West',
];

/** Occupancy tenure categories in Table_7.2.px (excluding 'Total'). */
const TENURE_CATEGORIES = ['Owning', 'Renting', 'Rent-free', 'Perching', 'Squatting'];
/** Rent-payee categories in Table_7.3.px (excluding 'Total'). */
const PAYEE_CATEGORIES = ['Relative', 'Private individual', 'Government', 'Private employer', 'Other'];

// ---------------------------------------------------------------------------
// 1. Migration flows (Table_6.4.px — column-normalised percent matrix)
// ---------------------------------------------------------------------------

interface MigrationFlowRow {
  origin_region: string;   // snake_case (region of previous residence)
  dest_region: string;     // snake_case (region of current residence)
  flow_pct: number | null;
}

async function fetchMigrationFlows(): Promise<MigrationFlowRow[]> {
  const px: PxStat2 = await pxPost(MIGRATION_FLOWS_PATH, [
    { code: 'Region_of_previous_residence', selection: { filter: 'item', values: GLSS7_REGIONS } },
    { code: 'Region', selection: { filter: 'item', values: GLSS7_REGIONS } },
  ]);

  const rows: MigrationFlowRow[] = [];
  for (const origin of GLSS7_REGIONS) {
    for (const dest of GLSS7_REGIONS) {
      const flow = pxGetValue(px, { Region_of_previous_residence: origin, Region: dest });
      rows.push({
        origin_region: regionKey(origin),
        dest_region: regionKey(dest),
        flow_pct: flow,
      });
    }
  }
  return rows;
}

async function upsertMigrationFlows(rows: MigrationFlowRow[]): Promise<number> {
  let saved = 0;
  for (const r of rows) {
    if (r.flow_pct === null) continue;
    await query(
      `INSERT INTO gss_glss7_migration_flows (origin_region, dest_region, flow_pct, synced_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (origin_region, dest_region) DO UPDATE SET
         flow_pct  = EXCLUDED.flow_pct,
         synced_at = NOW()`,
      [r.origin_region, r.dest_region, r.flow_pct],
    );
    saved++;
  }
  return saved;
}

// ---------------------------------------------------------------------------
// 2. Domestic overnight tourism (Table_6.15.px — visitor counts)
// ---------------------------------------------------------------------------

interface TourismRow {
  region: string;
  domestic_overnight_visitors: number | null;
  urban_visitors: number | null;
  rural_visitors: number | null;
  visitor_share_pct: number | null;
  urban_share_pct: number | null;
}

async function fetchTourism(): Promise<TourismRow[]> {
  const px: PxStat2 = await pxPost(TOURISM_PATH, [
    { code: 'Locality', selection: { filter: 'item', values: ['All localities', 'Urban', 'Rural'] } },
    { code: 'Sex', selection: { filter: 'item', values: ['Both sexes'] } },
    { code: 'Region', selection: { filter: 'item', values: ['Total', ...GLSS7_REGIONS] } },
  ]);

  const national = pxGetValue(px, { Locality: 'All localities', Sex: 'Both sexes', Region: 'Total' });

  const rows: TourismRow[] = [];
  for (const region of GLSS7_REGIONS) {
    const all = pxGetValue(px, { Locality: 'All localities', Sex: 'Both sexes', Region: region });
    const urban = pxGetValue(px, { Locality: 'Urban', Sex: 'Both sexes', Region: region });
    const rural = pxGetValue(px, { Locality: 'Rural', Sex: 'Both sexes', Region: region });

    const visitorShare = (all !== null && national !== null && national > 0)
      ? Math.round((all / national) * 10000) / 100
      : null;
    const urbanShare = (all !== null && urban !== null && all > 0)
      ? Math.round((urban / all) * 10000) / 100
      : null;

    rows.push({
      region: regionKey(region),
      domestic_overnight_visitors: all,
      urban_visitors: urban,
      rural_visitors: rural,
      visitor_share_pct: visitorShare,
      urban_share_pct: urbanShare,
    });
  }
  return rows;
}

async function upsertTourism(rows: TourismRow[]): Promise<number> {
  let saved = 0;
  for (const r of rows) {
    if (r.domestic_overnight_visitors === null) continue;
    await query(
      `INSERT INTO gss_glss7_tourism_by_region
         (region, domestic_overnight_visitors, urban_visitors, rural_visitors,
          visitor_share_pct, urban_share_pct, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (region) DO UPDATE SET
         domestic_overnight_visitors = EXCLUDED.domestic_overnight_visitors,
         urban_visitors              = EXCLUDED.urban_visitors,
         rural_visitors              = EXCLUDED.rural_visitors,
         visitor_share_pct           = EXCLUDED.visitor_share_pct,
         urban_share_pct             = EXCLUDED.urban_share_pct,
         synced_at                   = NOW()`,
      [r.region, r.domestic_overnight_visitors, r.urban_visitors, r.rural_visitors,
       r.visitor_share_pct, r.urban_share_pct],
    );
    saved++;
  }
  return saved;
}

// ---------------------------------------------------------------------------
// 3. Housing occupancy + rent payee snapshot (Table_7.2.px + Table_7.3.px)
// ---------------------------------------------------------------------------

interface HousingSnapshotRow {
  region: string;
  owner_pct: number | null;
  renting_pct: number | null;
  rent_free_pct: number | null;
  perching_pct: number | null;
  squatting_pct: number | null;
  rent_payee: Record<string, number | null>;
}

async function fetchHousingSnapshot(): Promise<HousingSnapshotRow[]> {
  const [occPx, payeePx]: [PxStat2, PxStat2] = await Promise.all([
    pxPost(OCCUPANCY_PATH, [
      { code: 'Occupacy_status', selection: { filter: 'item', values: ['Total', ...TENURE_CATEGORIES] } },
      { code: 'Locality', selection: { filter: 'item', values: ['All localities'] } },
      { code: 'Region', selection: { filter: 'item', values: GLSS7_REGIONS } },
    ]),
    pxPost(RENT_PAYEE_PATH, [
      { code: 'Payee', selection: { filter: 'item', values: ['Total', ...PAYEE_CATEGORIES] } },
      { code: 'Locality', selection: { filter: 'item', values: ['All localities'] } },
      { code: 'Region', selection: { filter: 'item', values: GLSS7_REGIONS } },
    ]),
  ]);

  const rows: HousingSnapshotRow[] = [];
  for (const region of GLSS7_REGIONS) {
    const occ = (cat: string) => pxGetValue(occPx, { Occupacy_status: cat, Locality: 'All localities', Region: region });

    const payee: Record<string, number | null> = {};
    for (const cat of PAYEE_CATEGORIES) {
      payee[cat] = pxGetValue(payeePx, { Payee: cat, Locality: 'All localities', Region: region });
    }

    rows.push({
      region: regionKey(region),
      owner_pct: occ('Owning'),
      renting_pct: occ('Renting'),
      rent_free_pct: occ('Rent-free'),
      perching_pct: occ('Perching'),
      squatting_pct: occ('Squatting'),
      rent_payee: payee,
    });
  }
  return rows;
}

async function upsertHousingSnapshot(rows: HousingSnapshotRow[]): Promise<number> {
  let saved = 0;
  for (const r of rows) {
    if (r.owner_pct === null && r.renting_pct === null) continue;
    await query(
      `INSERT INTO gss_glss7_housing_snapshot
         (region, owner_pct, renting_pct, rent_free_pct, perching_pct, squatting_pct, rent_payee, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (region) DO UPDATE SET
         owner_pct     = EXCLUDED.owner_pct,
         renting_pct   = EXCLUDED.renting_pct,
         rent_free_pct = EXCLUDED.rent_free_pct,
         perching_pct  = EXCLUDED.perching_pct,
         squatting_pct = EXCLUDED.squatting_pct,
         rent_payee    = EXCLUDED.rent_payee,
         synced_at     = NOW()`,
      [r.region, r.owner_pct, r.renting_pct, r.rent_free_pct, r.perching_pct, r.squatting_pct,
       JSON.stringify(r.rent_payee)],
    );
    saved++;
  }
  return saved;
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

export type TourismDemandType = 'business' | 'leisure' | 'mixed';

export interface TourismRegionMetric {
  region: string;
  domestic_overnight_visitors: number | null;
  visitor_share_pct: number | null;
  urban_share_pct: number | null;
  tourism_demand_type: TourismDemandType | null;
}

export class GSS_GLSS7Service {
  async sync(triggeredBy: string = 'scheduled'): Promise<SyncResult> {
    const source = 'GSS StatsBank GLSS7';
    const startedAt = new Date();
    let syncId: string | undefined;
    let totalSaved = 0;
    const errors: SyncResult['errors'] = [];

    try {
      syncId = await syncLogRepository.startSync(source, 'scheduled', triggeredBy);
      logger.info('[GSS-GLSS7] Starting migration + tourism + housing sync', { triggeredBy, syncId });

      // --- Migration flows ---
      try {
        logger.info('[GSS-GLSS7] Fetching inter-regional migration flows...');
        const rows = await fetchMigrationFlows();
        const saved = await upsertMigrationFlows(rows);
        totalSaved += saved;
        logger.info('[GSS-GLSS7] Migration flows upserted', { saved });
      } catch (err: any) {
        logger.error('[GSS-GLSS7] Migration flows failed', { error: err.message });
        errors.push({ code: 'MIGRATION_ERROR', message: err.message, timestamp: new Date() });
      }

      await sleep(300);

      // --- Tourism ---
      try {
        logger.info('[GSS-GLSS7] Fetching domestic overnight tourism...');
        const rows = await fetchTourism();
        const saved = await upsertTourism(rows);
        totalSaved += saved;
        logger.info('[GSS-GLSS7] Tourism upserted', { saved });
      } catch (err: any) {
        logger.error('[GSS-GLSS7] Tourism failed', { error: err.message });
        errors.push({ code: 'TOURISM_ERROR', message: err.message, timestamp: new Date() });
      }

      await sleep(300);

      // --- Housing snapshot ---
      try {
        logger.info('[GSS-GLSS7] Fetching housing occupancy + rent payee...');
        const rows = await fetchHousingSnapshot();
        const saved = await upsertHousingSnapshot(rows);
        totalSaved += saved;
        logger.info('[GSS-GLSS7] Housing snapshot upserted', { saved });
      } catch (err: any) {
        logger.error('[GSS-GLSS7] Housing snapshot failed', { error: err.message });
        errors.push({ code: 'HOUSING_ERROR', message: err.message, timestamp: new Date() });
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
        metadata: { tables: ['gss_glss7_migration_flows', 'gss_glss7_tourism_by_region', 'gss_glss7_housing_snapshot'] },
      };
      await syncLogRepository.completeSync(syncId, result);
      logger.info('[GSS-GLSS7] Sync complete', { saved: totalSaved, errors: errors.length });
      return result;
    } catch (err: any) {
      const result: SyncResult = {
        source, status: 'failed', started_at: startedAt, completed_at: new Date(),
        records_fetched: 0, records_saved: totalSaved, records_failed: 0,
        errors: [{ code: 'SYNC_ERROR', message: err.message, timestamp: new Date() }],
        metadata: {},
      };
      if (syncId) await syncLogRepository.completeSync(syncId, result);
      logger.error('[GSS-GLSS7] Sync failed', { error: err.message });
      return result;
    }
  }

  /**
   * Net in-migration intensity per region (% of a region's current residents who
   * migrated in from another region) — the off-diagonal inflow sum. Consumed by
   * investmentScoringService (absorption factor). Empty map when the table is
   * absent/empty so callers degrade gracefully.
   */
  async getMigrationInflowByRegion(): Promise<Record<string, number | null>> {
    const out: Record<string, number | null> = {};
    try {
      const r = await query<{ region: string; inflow: string | null }>(
        `SELECT dest_region AS region, SUM(flow_pct)::numeric AS inflow
         FROM gss_glss7_migration_flows
         WHERE dest_region <> origin_region
         GROUP BY dest_region`,
      );
      for (const row of r.rows) out[row.region] = row.inflow !== null ? parseFloat(row.inflow) : null;
    } catch { /* table absent (Slice 4 not yet applied) */ }
    return out;
  }

  /**
   * Full origin×destination flow matrix for the /analytics/demand migration panel.
   * Returns the GLSS7 native region labels (title-case) plus the flow grid.
   */
  async getMigrationMatrix(): Promise<{
    regions: string[];
    flows: { origin: string; dest: string; flow_pct: number | null }[];
  }> {
    try {
      const r = await query<{ origin_region: string; dest_region: string; flow_pct: string | null }>(
        `SELECT origin_region, dest_region, flow_pct FROM gss_glss7_migration_flows`,
      );
      const regionSet = new Set<string>();
      const flows = r.rows.map((row) => {
        regionSet.add(row.origin_region);
        regionSet.add(row.dest_region);
        return {
          origin: row.origin_region,
          dest: row.dest_region,
          flow_pct: row.flow_pct !== null ? parseFloat(row.flow_pct) : null,
        };
      });
      return { regions: Array.from(regionSet).sort(), flows };
    } catch {
      return { regions: [], flows: [] };
    }
  }

  /**
   * Tourism metrics per region with a data-driven demand-type classification.
   *
   * Classification (self-calibrating, no magic thresholds): a region is
   *   - "business" when it draws material tourism (visitor_share ≥ median) AND is
   *     urban-concentrated (urban_share ≥ median) — business travel clusters in
   *     urban commercial hubs;
   *   - "leisure" when it draws material tourism (visitor_share ≥ median) but is
   *     LESS urban-concentrated (urban_share < median) — leisure spreads rural/mixed;
   *   - "mixed" otherwise (thin or middling markets).
   * Consumed by shortStayMetricsService to tag city markets.
   */
  async getTourismByRegion(): Promise<Record<string, TourismRegionMetric>> {
    const out: Record<string, TourismRegionMetric> = {};
    try {
      const r = await query<{
        region: string; domestic_overnight_visitors: string | null;
        visitor_share_pct: string | null; urban_share_pct: string | null;
      }>(
        `SELECT region, domestic_overnight_visitors, visitor_share_pct, urban_share_pct
         FROM gss_glss7_tourism_by_region`,
      );
      if (r.rows.length === 0) return out;

      const parsed = r.rows.map((row) => ({
        region: row.region,
        visitors: row.domestic_overnight_visitors !== null ? parseFloat(row.domestic_overnight_visitors) : null,
        share: row.visitor_share_pct !== null ? parseFloat(row.visitor_share_pct) : null,
        urban: row.urban_share_pct !== null ? parseFloat(row.urban_share_pct) : null,
      }));

      const median = (vals: number[]): number => {
        if (vals.length === 0) return 0;
        const s = [...vals].sort((a, b) => a - b);
        const mid = Math.floor(s.length / 2);
        return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
      };
      const shareMed = median(parsed.map(p => p.share).filter((v): v is number => v !== null));
      const urbanMed = median(parsed.map(p => p.urban).filter((v): v is number => v !== null));

      for (const p of parsed) {
        let type: TourismDemandType | null = null;
        if (p.share !== null && p.urban !== null) {
          if (p.share >= shareMed) type = p.urban >= urbanMed ? 'business' : 'leisure';
          else type = 'mixed';
        }
        out[p.region] = {
          region: p.region,
          domestic_overnight_visitors: p.visitors,
          visitor_share_pct: p.share,
          urban_share_pct: p.urban,
          tourism_demand_type: type,
        };
      }
    } catch { /* table absent */ }
    return out;
  }

  /**
   * Housing occupancy + rent-payee snapshot per region (Table_7.2 + 7.3).
   * Beyond the raw tenure shares, derives `private_rental_share_pct` — the share
   * of renting households paying a PRIVATE landlord (private individual + private
   * employer) rather than a relative / government / other. A high private share =
   * a monetised, investable rental market; a low one = family/informal housing
   * that is thin for institutional investors. Consumed by rentalAnalyticsService.
   * Empty map when the table is absent/empty (graceful degradation).
   */
  async getHousingSnapshotByRegion(): Promise<Record<string, {
    owner_pct: number | null;
    renting_pct: number | null;
    rent_free_pct: number | null;
    perching_pct: number | null;
    squatting_pct: number | null;
    rent_payee: Record<string, number | null>;
    private_rental_share_pct: number | null;
  }>> {
    const out: Record<string, any> = {};
    try {
      const r = await query<{
        region: string; owner_pct: string | null; renting_pct: string | null;
        rent_free_pct: string | null; perching_pct: string | null; squatting_pct: string | null;
        rent_payee: Record<string, number | null> | null;
      }>(
        `SELECT region, owner_pct, renting_pct, rent_free_pct, perching_pct, squatting_pct, rent_payee
         FROM gss_glss7_housing_snapshot`,
      );
      const num = (v: string | null) => (v !== null ? parseFloat(v) : null);
      for (const row of r.rows) {
        const payee = row.rent_payee ?? {};
        const priv = payee['Private individual'];
        const emp = payee['Private employer'];
        const privateShare = (priv !== null && priv !== undefined) || (emp !== null && emp !== undefined)
          ? Math.round(((priv ?? 0) + (emp ?? 0)) * 100) / 100
          : null;
        out[row.region] = {
          owner_pct: num(row.owner_pct),
          renting_pct: num(row.renting_pct),
          rent_free_pct: num(row.rent_free_pct),
          perching_pct: num(row.perching_pct),
          squatting_pct: num(row.squatting_pct),
          rent_payee: payee,
          private_rental_share_pct: privateShare,
        };
      }
    } catch { /* table absent */ }
    return out;
  }
}

export const gssGlss7Service = new GSS_GLSS7Service();
