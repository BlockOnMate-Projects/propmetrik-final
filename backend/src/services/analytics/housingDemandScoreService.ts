/**
 * Housing Demand Score Service (Slice 3)
 *
 * Computes the Regional Housing Demand Score (RHDS) — a 0–100 composite ranking
 * of latent housing demand per Ghana region — from real GSS PHC 2021 sources:
 *
 *   pop_growth_component   ← gss_phc_population_projections (20–40 cohort growth)
 *   employment_component   ← gss_phc_employment_by_district (formal employment − unemployment drag)
 *   earnings_component     ← regional_household_income (annual income growth, real)
 *   migration_component    ← gss_glss7_migration_flows (net inflow) — Slice 4; 0 until present
 *
 * Each raw component is min–max normalised ACROSS regions (relative demand
 * ranking, which is exactly what the green→red heatmap encodes) — no hardcoded
 * thresholds. The migration weight redistributes proportionally to the other
 * components until the GLSS7 migration matrix (Slice 4) is populated, so RHDS is
 * fully live now and simply gains a factor later without a schema or API change.
 *
 * Results are persisted to regional_housing_demand_scores (upsert per region).
 *
 * @module services/analytics/housingDemandScoreService
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { gssPhcPopulationService } from '../data-hub/scrapers/gssPhcPopulationService';
import { gssPhcEmploymentService } from '../data-hub/scrapers/gssPhcEmploymentService';

// Base component weights (sum to 1.0). Migration is redistributed when inactive.
const WEIGHTS = { pop_growth: 0.35, employment: 0.25, earnings: 0.20, migration: 0.20 };

export interface RHDSComponent {
  region: string;
  rhds_score: number | null;
  pop_growth_component: number | null;
  employment_component: number | null;
  earnings_component: number | null;
  migration_component: number | null;
  migration_active: boolean;
  pop_growth_20to40_pct: number | null;
  total_pop_current: number | null;
  total_pop_2030: number | null;
}

interface RawFactors {
  region: string;
  popGrowth: number | null;      // % growth of 20–40 cohort base→horizon
  employmentRaw: number | null;  // formal_employment_pct − 0.5 × unemployment_rate
  earningsGrowth: number | null; // % YoY change in annual household income
  migrationNet: number | null;   // net inter-regional inflow % (Slice 4)
  totalCurrent: number | null;
  total2030: number | null;
}

/** Min–max normalise a value within [min,max] to 0–100. Returns 50 if the range collapses. */
function normalise(value: number | null, min: number, max: number): number | null {
  if (value === null) return null;
  if (max - min < 1e-9) return 50;
  return Math.round(((value - min) / (max - min)) * 10000) / 100;
}

export class HousingDemandScoreService {
  /**
   * Earnings growth (% YoY) per region from the two most-distant income periods
   * on record. Falls back to null when a region has fewer than two periods.
   */
  private async getEarningsGrowthByRegion(): Promise<Record<string, number | null>> {
    const out: Record<string, number | null> = {};
    try {
      const res = await pool.query<{ region: string; first_income: string; last_income: string; n: string }>(
        `SELECT region,
                (ARRAY_AGG(median_household_income_annual_ghs ORDER BY period_month ASC))[1]  AS first_income,
                (ARRAY_AGG(median_household_income_annual_ghs ORDER BY period_month DESC))[1] AS last_income,
                COUNT(*)::text AS n
         FROM regional_household_income
         GROUP BY region`,
      );
      for (const r of res.rows) {
        const first = parseFloat(r.first_income);
        const last = parseFloat(r.last_income);
        out[r.region] = (parseInt(r.n, 10) >= 2 && first > 0)
          ? Math.round(((last / first) - 1) * 10000) / 100
          : null;
      }
    } catch (err: any) {
      logger.warn('[RHDS] earnings growth read failed', { error: err.message });
    }
    return out;
  }

  /** Income level per region (fallback for the earnings component when growth is unavailable). */
  private async getIncomeLevelByRegion(): Promise<Record<string, number | null>> {
    const out: Record<string, number | null> = {};
    try {
      const res = await pool.query<{ region: string; income: string | null }>(
        `SELECT DISTINCT ON (region) region, median_household_income_annual_ghs AS income
         FROM regional_household_income
         ORDER BY region, period_month DESC`,
      );
      for (const r of res.rows) out[r.region] = r.income !== null ? parseFloat(r.income) : null;
    } catch { /* table absent */ }
    return out;
  }

  /**
   * Net inter-regional migration inflow % per region (Slice 4). Returns an empty
   * map + active=false until gss_glss7_migration_flows exists and is populated.
   */
  private async getMigrationNetByRegion(): Promise<{ map: Record<string, number | null>; active: boolean }> {
    try {
      const res = await pool.query<{ region: string; net_flow: string | null }>(
        `SELECT dest_region AS region,
                SUM(flow_pct)::numeric AS net_flow
         FROM gss_glss7_migration_flows
         WHERE dest_region <> origin_region
         GROUP BY dest_region`,
      );
      if (res.rows.length === 0) return { map: {}, active: false };
      const map: Record<string, number | null> = {};
      for (const r of res.rows) map[r.region] = r.net_flow !== null ? parseFloat(r.net_flow) : null;
      return { map, active: true };
    } catch {
      // Table not created yet (Slice 4) — degrade gracefully.
      return { map: {}, active: false };
    }
  }

  /** Compute RHDS for all regions and persist to regional_housing_demand_scores. */
  async computeAndStore(): Promise<RHDSComponent[]> {
    const results = await this.compute();
    for (const r of results) {
      try {
        await pool.query(
          `INSERT INTO regional_housing_demand_scores
             (region, rhds_score, pop_growth_component, employment_component,
              earnings_component, migration_component, migration_active,
              pop_growth_20to40_pct, total_pop_current, total_pop_2030, computed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
           ON CONFLICT (region) DO UPDATE SET
             rhds_score            = EXCLUDED.rhds_score,
             pop_growth_component  = EXCLUDED.pop_growth_component,
             employment_component  = EXCLUDED.employment_component,
             earnings_component    = EXCLUDED.earnings_component,
             migration_component   = EXCLUDED.migration_component,
             migration_active      = EXCLUDED.migration_active,
             pop_growth_20to40_pct = EXCLUDED.pop_growth_20to40_pct,
             total_pop_current     = EXCLUDED.total_pop_current,
             total_pop_2030        = EXCLUDED.total_pop_2030,
             computed_at           = NOW()`,
          [r.region, r.rhds_score, r.pop_growth_component, r.employment_component,
           r.earnings_component, r.migration_component, r.migration_active,
           r.pop_growth_20to40_pct, r.total_pop_current, r.total_pop_2030],
        );
      } catch (err: any) {
        logger.error('[RHDS] upsert failed', { region: r.region, error: err.message });
      }
    }
    logger.info('[RHDS] Computed + stored', { regions: results.length });
    return results;
  }

  /** Compute RHDS for all regions (no persistence). */
  async compute(): Promise<RHDSComponent[]> {
    const [projections, formalEmp, unemployment, earningsGrowth, incomeLevel, migration] = await Promise.all([
      gssPhcPopulationService.getProjectionsByRegion(2021, 2030),
      gssPhcEmploymentService.getFormalEmploymentByRegion(),
      gssPhcEmploymentService.getUnemploymentByRegion(),
      this.getEarningsGrowthByRegion(),
      this.getIncomeLevelByRegion(),
      this.getMigrationNetByRegion(),
    ]);

    // Union of regions that appear in any source.
    const regions = new Set<string>([
      ...Object.keys(projections), ...Object.keys(formalEmp),
      ...Object.keys(unemployment), ...Object.keys(earningsGrowth), ...Object.keys(incomeLevel),
    ]);

    const raw: RawFactors[] = [];
    for (const region of regions) {
      const proj = projections[region];
      let popGrowth: number | null = null;
      let totalCurrent: number | null = null;
      let total2030: number | null = null;
      if (proj) {
        totalCurrent = proj.base_total;
        total2030 = proj.horizon_total;
        if (proj.base_working_age !== null && proj.horizon_working_age !== null && proj.base_working_age > 0) {
          popGrowth = Math.round(((proj.horizon_working_age / proj.base_working_age) - 1) * 10000) / 100;
        }
      }

      const fe = formalEmp[region];
      const un = unemployment[region];
      const employmentRaw = fe !== null && fe !== undefined
        ? fe - 0.5 * (un ?? 0)
        : null;

      // Prefer real earnings growth; fall back to income level when a region has only one period.
      const earnings = earningsGrowth[region] ?? incomeLevel[region] ?? null;

      raw.push({
        region,
        popGrowth,
        employmentRaw,
        earningsGrowth: earnings,
        migrationNet: migration.map[region] ?? null,
        totalCurrent,
        total2030,
      });
    }

    // Min–max bounds per factor across regions (ignoring nulls).
    const bounds = (pick: (f: RawFactors) => number | null) => {
      const vals = raw.map(pick).filter((v): v is number => v !== null);
      return vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : { min: 0, max: 0 };
    };
    const bPop = bounds(f => f.popGrowth);
    const bEmp = bounds(f => f.employmentRaw);
    const bEarn = bounds(f => f.earningsGrowth);
    const bMig = bounds(f => f.migrationNet);

    // Effective weights: redistribute migration weight when inactive.
    const w = { ...WEIGHTS };
    if (!migration.active) {
      const active = WEIGHTS.pop_growth + WEIGHTS.employment + WEIGHTS.earnings;
      const scale = 1 / active;
      w.pop_growth = WEIGHTS.pop_growth * scale;
      w.employment = WEIGHTS.employment * scale;
      w.earnings = WEIGHTS.earnings * scale;
      w.migration = 0;
    }

    const out: RHDSComponent[] = [];
    for (const f of raw) {
      const popC = normalise(f.popGrowth, bPop.min, bPop.max);
      const empC = normalise(f.employmentRaw, bEmp.min, bEmp.max);
      const earnC = normalise(f.earningsGrowth, bEarn.min, bEarn.max);
      const migC = migration.active ? normalise(f.migrationNet, bMig.min, bMig.max) : 0;

      // Weighted sum over available components; re-normalise by present weight so a
      // region missing one source is not unfairly penalised to 0.
      let weighted = 0;
      let presentWeight = 0;
      const add = (comp: number | null, weight: number) => {
        if (comp !== null && weight > 0) { weighted += comp * weight; presentWeight += weight; }
      };
      add(popC, w.pop_growth);
      add(empC, w.employment);
      add(earnC, w.earnings);
      if (migration.active) add(migC, w.migration);

      const rhds = presentWeight > 0 ? Math.round((weighted / presentWeight) * 100) / 100 : null;

      out.push({
        region: f.region,
        rhds_score: rhds,
        pop_growth_component: popC,
        employment_component: empC,
        earnings_component: earnC,
        migration_component: migC,
        migration_active: migration.active,
        pop_growth_20to40_pct: f.popGrowth,
        total_pop_current: f.totalCurrent,
        total_pop_2030: f.total2030,
      });
    }

    return out.sort((a, b) => (b.rhds_score ?? -1) - (a.rhds_score ?? -1));
  }

  /** Read stored RHDS scores (for the /analytics/demand page). Recomputes if empty. */
  async getScores(): Promise<RHDSComponent[]> {
    try {
      const res = await pool.query(
        `SELECT region, rhds_score, pop_growth_component, employment_component,
                earnings_component, migration_component, migration_active,
                pop_growth_20to40_pct, total_pop_current, total_pop_2030
         FROM regional_housing_demand_scores
         ORDER BY rhds_score DESC NULLS LAST`,
      );
      if (res.rows.length === 0) return this.computeAndStore();
      return res.rows.map((r: any) => ({
        region: r.region,
        rhds_score: r.rhds_score !== null ? parseFloat(r.rhds_score) : null,
        pop_growth_component: r.pop_growth_component !== null ? parseFloat(r.pop_growth_component) : null,
        employment_component: r.employment_component !== null ? parseFloat(r.employment_component) : null,
        earnings_component: r.earnings_component !== null ? parseFloat(r.earnings_component) : null,
        migration_component: r.migration_component !== null ? parseFloat(r.migration_component) : null,
        migration_active: r.migration_active,
        pop_growth_20to40_pct: r.pop_growth_20to40_pct !== null ? parseFloat(r.pop_growth_20to40_pct) : null,
        total_pop_current: r.total_pop_current !== null ? parseFloat(r.total_pop_current) : null,
        total_pop_2030: r.total_pop_2030 !== null ? parseFloat(r.total_pop_2030) : null,
      }));
    } catch (err: any) {
      logger.error('[RHDS] getScores failed', { error: err.message });
      return [];
    }
  }
}

export const housingDemandScoreService = new HousingDemandScoreService();
