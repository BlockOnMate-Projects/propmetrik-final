/**
 * Infrastructure Quality Service (Slice 5 §6.3 — NIQS)
 *
 * Computes the Neighbourhood Infrastructure Quality Score (NIQS) — a 0–100
 * composite of PHC 2021 infrastructure access per Ghana region — from the
 * already-ingested census tables (no new scraper):
 *
 *   gss_phc_infrastructure_by_district → electricity, piped/improved water,
 *                                        flush/KVIP toilet, formal waste collection
 *   gss_phc_ict_by_district            → smartphone ownership
 *
 *   NIQS = 0.25·electricity + 0.20·piped_water + 0.15·improved_water
 *        + 0.15·toilet + 0.15·waste_collection + 0.10·smartphone
 *
 * Any component absent for a region is dropped and the remaining weights are
 * re-normalised (no fabricated values), exactly like the RHDS degradation model.
 *
 * Persists to district_infrastructure_scores (upsert per region). Feeds the
 * /analytics/infrastructure page, the PVMAF valuation macro-adjustment, and the
 * RICI investment-climate composite.
 *
 * @module services/analytics/infrastructureQualityService
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';

/** NIQS component weights (sum to 1.0). Re-normalised over present components. */
const WEIGHTS: Record<string, number> = {
  electricity: 0.25,
  piped_water: 0.20,
  improved_water: 0.15,
  toilet: 0.15,
  waste_collection: 0.15,
  smartphone: 0.10,
};

const COMPONENT_LABEL: Record<string, string> = {
  electricity: 'Electricity',
  piped_water: 'Piped water',
  improved_water: 'Improved water',
  toilet: 'Toilet facility',
  waste_collection: 'Waste collection',
  smartphone: 'Smartphone',
};

export interface NIQSScore {
  region: string;
  niqs_score: number | null;
  electricity_pct: number | null;
  piped_water_pct: number | null;
  improved_water_pct: number | null;
  toilet_pct: number | null;
  waste_collection_pct: number | null;
  smartphone_pct: number | null;
  weakest_component: string | null;
  components_used: number;
}

export interface NIQSAvmContext {
  region: string;
  niqs_score: number | null;
  avg_price_per_sqm: number | null;
  listing_count: number;
}

export class InfrastructureQualityService {
  /** Compute NIQS for all regions (no persistence). */
  async compute(): Promise<NIQSScore[]> {
    const res = await pool.query<{
      region: string;
      electricity_grid_pct: string | null;
      piped_water_pct: string | null;
      improved_water_pct: string | null;
      flush_kvip_toilet_pct: string | null;
      formal_collection_pct: string | null;
      smartphone_ownership_pct: string | null;
    }>(
      `SELECT i.region,
              i.electricity_grid_pct,
              i.piped_water_pct,
              i.improved_water_pct,
              i.flush_kvip_toilet_pct,
              i.formal_collection_pct,
              ict.smartphone_ownership_pct
       FROM gss_phc_infrastructure_by_district i
       LEFT JOIN gss_phc_ict_by_district ict ON ict.region = i.region
       WHERE i.locality = 'All Locality Types' OR i.locality ILIKE 'All%'`,
    );

    const num = (v: string | null): number | null => (v !== null && v !== undefined ? parseFloat(v) : null);

    return res.rows.map((r) => {
      const comp: Record<string, number | null> = {
        electricity: num(r.electricity_grid_pct),
        piped_water: num(r.piped_water_pct),
        improved_water: num(r.improved_water_pct),
        toilet: num(r.flush_kvip_toilet_pct),
        waste_collection: num(r.formal_collection_pct),
        smartphone: num(r.smartphone_ownership_pct),
      };

      // Weighted sum over present components, re-normalised by present weight.
      let weighted = 0;
      let presentWeight = 0;
      let used = 0;
      let weakestKey: string | null = null;
      let weakestContribution = Infinity;
      for (const key of Object.keys(WEIGHTS)) {
        const v = comp[key];
        if (v === null) continue;
        const w = WEIGHTS[key];
        weighted += v * w;
        presentWeight += w;
        used++;
        // Weakest = lowest raw access % among present components (what drags the score).
        if (v < weakestContribution) { weakestContribution = v; weakestKey = key; }
      }
      const niqs = presentWeight > 0 ? Math.round((weighted / presentWeight) * 100) / 100 : null;

      return {
        region: r.region,
        niqs_score: niqs,
        electricity_pct: comp.electricity,
        piped_water_pct: comp.piped_water,
        improved_water_pct: comp.improved_water,
        toilet_pct: comp.toilet,
        waste_collection_pct: comp.waste_collection,
        smartphone_pct: comp.smartphone,
        weakest_component: weakestKey ? COMPONENT_LABEL[weakestKey] : null,
        components_used: used,
      };
    }).sort((a, b) => (b.niqs_score ?? -1) - (a.niqs_score ?? -1));
  }

  /** Compute NIQS and persist to district_infrastructure_scores. */
  async computeAndStore(): Promise<NIQSScore[]> {
    const scores = await this.compute();
    for (const s of scores) {
      try {
        await pool.query(
          `INSERT INTO district_infrastructure_scores
             (region, niqs_score, electricity_pct, piped_water_pct, improved_water_pct,
              toilet_pct, waste_collection_pct, smartphone_pct, weakest_component, components_used, computed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
           ON CONFLICT (region) DO UPDATE SET
             niqs_score           = EXCLUDED.niqs_score,
             electricity_pct      = EXCLUDED.electricity_pct,
             piped_water_pct      = EXCLUDED.piped_water_pct,
             improved_water_pct   = EXCLUDED.improved_water_pct,
             toilet_pct           = EXCLUDED.toilet_pct,
             waste_collection_pct = EXCLUDED.waste_collection_pct,
             smartphone_pct       = EXCLUDED.smartphone_pct,
             weakest_component    = EXCLUDED.weakest_component,
             components_used      = EXCLUDED.components_used,
             computed_at          = NOW()`,
          [s.region, s.niqs_score, s.electricity_pct, s.piped_water_pct, s.improved_water_pct,
           s.toilet_pct, s.waste_collection_pct, s.smartphone_pct, s.weakest_component, s.components_used],
        );
      } catch (err: any) {
        logger.error('[NIQS] upsert failed', { region: s.region, error: err.message });
      }
    }
    logger.info('[NIQS] Computed + stored', { regions: scores.length });
    return scores;
  }

  /** Read stored NIQS scores (for the /analytics/infrastructure page). Recomputes if empty. */
  async getDistrictScores(): Promise<NIQSScore[]> {
    try {
      const res = await pool.query(
        `SELECT region, niqs_score, electricity_pct, piped_water_pct, improved_water_pct,
                toilet_pct, waste_collection_pct, smartphone_pct, weakest_component, components_used
         FROM district_infrastructure_scores
         ORDER BY niqs_score DESC NULLS LAST`,
      );
      if (res.rows.length === 0) return this.computeAndStore();
      const num = (v: any) => (v !== null && v !== undefined ? parseFloat(v) : null);
      return res.rows.map((r: any) => ({
        region: r.region,
        niqs_score: num(r.niqs_score),
        electricity_pct: num(r.electricity_pct),
        piped_water_pct: num(r.piped_water_pct),
        improved_water_pct: num(r.improved_water_pct),
        toilet_pct: num(r.toilet_pct),
        waste_collection_pct: num(r.waste_collection_pct),
        smartphone_pct: num(r.smartphone_pct),
        weakest_component: r.weakest_component,
        components_used: r.components_used,
      }));
    } catch (err: any) {
      logger.error('[NIQS] getDistrictScores failed', { error: err.message });
      return [];
    }
  }

  /**
   * NIQS score per region as a lookup map — consumed by PVMAF (valuation macro
   * adjustment) and RICI (investment climate). Empty when the table is absent.
   */
  async getScoreMap(): Promise<Record<string, number | null>> {
    const out: Record<string, number | null> = {};
    try {
      const res = await pool.query<{ region: string; niqs_score: string | null }>(
        `SELECT region, niqs_score FROM district_infrastructure_scores`,
      );
      for (const r of res.rows) out[r.region] = r.niqs_score !== null ? parseFloat(r.niqs_score) : null;
    } catch { /* not computed yet */ }
    return out;
  }

  /**
   * NIQS vs. price-per-sqm per region for the AVM-premium scatter: does better
   * infrastructure command a documented price premium? Prices are real regional
   * medians from the `properties` table.
   */
  async getAvmPremiumContext(): Promise<NIQSAvmContext[]> {
    try {
      const res = await pool.query<{ region: string; avg_price_per_sqm: string | null; listing_count: string }>(
        `SELECT LOWER(region::text) AS region,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_per_sqm) AS avg_price_per_sqm,
                COUNT(*)::text AS listing_count
         FROM properties
         WHERE price_per_sqm > 0 AND region IS NOT NULL
         GROUP BY LOWER(region::text)`,
      );
      const priceByRegion = new Map<string, { p: number | null; n: number }>();
      for (const r of res.rows) {
        priceByRegion.set(r.region.replace(/\s+/g, '_'), {
          p: r.avg_price_per_sqm !== null ? Math.round(parseFloat(r.avg_price_per_sqm)) : null,
          n: parseInt(r.listing_count, 10),
        });
      }
      const scores = await this.getDistrictScores();
      return scores.map((s) => {
        const price = priceByRegion.get(s.region);
        return {
          region: s.region,
          niqs_score: s.niqs_score,
          avg_price_per_sqm: price?.p ?? null,
          listing_count: price?.n ?? 0,
        };
      });
    } catch (err: any) {
      logger.error('[NIQS] getAvmPremiumContext failed', { error: err.message });
      return [];
    }
  }
}

export const infrastructureQualityService = new InfrastructureQualityService();
