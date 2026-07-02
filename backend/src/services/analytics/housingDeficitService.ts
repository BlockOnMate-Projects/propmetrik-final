/**
 * Housing Deficit Service (Slice 5 §6.9 — HDEM)
 *
 * Estimates the 2030 housing deficit per Ghana region from already-ingested PHC
 * 2021 census tables (no new scraper):
 *
 *   projected_households_2030 = population_2030 / avg_household_size
 *   effective_stock           = current_households × fully_completed_pct
 *                               (the completed portion of the existing stock)
 *   hidden_demand             = current_households × incomplete_residential_pct × 0.40
 *                               (latent demand locked in incomplete structures)
 *   housing_deficit_2030      = projected_households_2030 - effective_stock + hidden_demand
 *
 * Sources: gss_phc_population_projections (2030), gss_phc_household_size_by_district
 * (avg size + current households), gss_phc_completion_by_district (completion mix).
 * A negative deficit = projected surplus. Region granularity; annual recompute.
 *
 * NOTE: effective_stock / hidden_demand are census-derived proxies (the PHC does
 * not publish a completed-dwelling COUNT), documented here so the number is read
 * as an estimate, not a survey figure. No values are fabricated.
 *
 * @module services/analytics/housingDeficitService
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';

const HORIZON_YEAR = 2030;
const HIDDEN_DEMAND_FACTOR = 0.40; // share of incomplete-structure households treated as latent demand

export interface HousingDeficitEstimate {
  region: string;
  total_pop_2030: number | null;
  avg_household_size: number | null;
  projected_households_2030: number | null;
  current_households: number | null;
  fully_completed_pct: number | null;
  effective_stock: number | null;
  incomplete_residential_pct: number | null;
  hidden_demand: number | null;
  housing_deficit_2030: number | null;
}

export class HousingDeficitService {
  /** Compute HDEM for all regions (no persistence). */
  async compute(): Promise<HousingDeficitEstimate[]> {
    const res = await pool.query<{
      region: string;
      total_pop_2030: string | null;
      avg_household_size: string | null;
      total_households: string | null;
      fully_completed_pct: string | null;
      incomplete_residential_pct: string | null;
    }>(
      `SELECT hs.region,
              proj.total_population       AS total_pop_2030,
              hs.avg_household_size,
              hs.total_households,
              comp.fully_completed_pct,
              comp.incomplete_residential_pct
       FROM gss_phc_household_size_by_district hs
       LEFT JOIN gss_phc_population_projections proj
              ON proj.region = hs.region AND proj.year = ${HORIZON_YEAR}
       LEFT JOIN gss_phc_completion_by_district comp
              ON comp.region = hs.region`,
    );

    const num = (v: string | null): number | null => (v !== null && v !== undefined ? parseFloat(v) : null);

    return res.rows.map((r) => {
      const pop2030 = num(r.total_pop_2030);
      const avgSize = num(r.avg_household_size);
      const currentHh = num(r.total_households);
      const completedPct = num(r.fully_completed_pct);
      const incompletePct = num(r.incomplete_residential_pct);

      const projectedHh = (pop2030 !== null && avgSize !== null && avgSize > 0)
        ? Math.round(pop2030 / avgSize)
        : null;
      const effectiveStock = (currentHh !== null && completedPct !== null)
        ? Math.round(currentHh * (completedPct / 100))
        : null;
      const hiddenDemand = (currentHh !== null && incompletePct !== null)
        ? Math.round(currentHh * (incompletePct / 100) * HIDDEN_DEMAND_FACTOR)
        : null;

      let deficit: number | null = null;
      if (projectedHh !== null) {
        deficit = projectedHh - (effectiveStock ?? 0) + (hiddenDemand ?? 0);
      }

      return {
        region: r.region,
        total_pop_2030: pop2030,
        avg_household_size: avgSize,
        projected_households_2030: projectedHh,
        current_households: currentHh,
        fully_completed_pct: completedPct,
        effective_stock: effectiveStock,
        incomplete_residential_pct: incompletePct,
        hidden_demand: hiddenDemand,
        housing_deficit_2030: deficit,
      };
    }).sort((a, b) => (b.housing_deficit_2030 ?? -Infinity) - (a.housing_deficit_2030 ?? -Infinity));
  }

  /** Compute HDEM and persist to district_housing_deficit_estimates. */
  async computeAndStore(): Promise<HousingDeficitEstimate[]> {
    const rows = await this.compute();
    for (const r of rows) {
      try {
        await pool.query(
          `INSERT INTO district_housing_deficit_estimates
             (region, total_pop_2030, avg_household_size, projected_households_2030,
              current_households, fully_completed_pct, effective_stock,
              incomplete_residential_pct, hidden_demand, housing_deficit_2030, computed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
           ON CONFLICT (region) DO UPDATE SET
             total_pop_2030             = EXCLUDED.total_pop_2030,
             avg_household_size         = EXCLUDED.avg_household_size,
             projected_households_2030  = EXCLUDED.projected_households_2030,
             current_households         = EXCLUDED.current_households,
             fully_completed_pct        = EXCLUDED.fully_completed_pct,
             effective_stock            = EXCLUDED.effective_stock,
             incomplete_residential_pct = EXCLUDED.incomplete_residential_pct,
             hidden_demand              = EXCLUDED.hidden_demand,
             housing_deficit_2030       = EXCLUDED.housing_deficit_2030,
             computed_at                = NOW()`,
          [r.region, r.total_pop_2030, r.avg_household_size, r.projected_households_2030,
           r.current_households, r.fully_completed_pct, r.effective_stock,
           r.incomplete_residential_pct, r.hidden_demand, r.housing_deficit_2030],
        );
      } catch (err: any) {
        logger.error('[HDEM] upsert failed', { region: r.region, error: err.message });
      }
    }
    logger.info('[HDEM] Computed + stored', { regions: rows.length });
    return rows;
  }

  /** Read stored HDEM estimates (for the /analytics/demand deficit panel). Recomputes if empty. */
  async getEstimates(): Promise<HousingDeficitEstimate[]> {
    try {
      const res = await pool.query(
        `SELECT region, total_pop_2030, avg_household_size, projected_households_2030,
                current_households, fully_completed_pct, effective_stock,
                incomplete_residential_pct, hidden_demand, housing_deficit_2030
         FROM district_housing_deficit_estimates
         ORDER BY housing_deficit_2030 DESC NULLS LAST`,
      );
      if (res.rows.length === 0) return this.computeAndStore();
      const num = (v: any) => (v !== null && v !== undefined ? parseFloat(v) : null);
      return res.rows.map((r: any) => ({
        region: r.region,
        total_pop_2030: num(r.total_pop_2030),
        avg_household_size: num(r.avg_household_size),
        projected_households_2030: num(r.projected_households_2030),
        current_households: num(r.current_households),
        fully_completed_pct: num(r.fully_completed_pct),
        effective_stock: num(r.effective_stock),
        incomplete_residential_pct: num(r.incomplete_residential_pct),
        hidden_demand: num(r.hidden_demand),
        housing_deficit_2030: num(r.housing_deficit_2030),
      }));
    } catch (err: any) {
      logger.error('[HDEM] getEstimates failed', { error: err.message });
      return [];
    }
  }
}

export const housingDeficitService = new HousingDeficitService();
