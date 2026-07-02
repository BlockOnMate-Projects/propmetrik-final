/**
 * Regional Composites Service (Slice 5 net-new §6 / §7 composites)
 *
 * Four derived regional composites computed from already-ingested GSS tables:
 *   DPMDI §6.4 — Property market depth/liquidity/formalisation
 *   PTMPI §6.8 — PropTech / digital penetration
 *   ESSI  §6.10 — Economic shock sensitivity (higher = more exposed)
 *   RICI  §7.2 — Regional investment climate (companion to the price index)
 *
 * Where a spec component has no ingested source (apartment/semi-detached share for
 * DPMDI, secondary/tertiary enrolment for PTMPI, mortgage-buyer share for ESSI),
 * the component is dropped and remaining weights are re-normalised — the same
 * graceful-degradation used by NIQS/RHDS. No values are fabricated; the mapping
 * from a raw macro reading to a 0–100 sub-score is a documented modelling choice
 * (like the spec's fixed weights and thresholds).
 *
 * @module services/analytics/regionalCompositesService
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const num = (v: any): number | null => (v !== null && v !== undefined ? parseFloat(v) : null);
/**
 * Normalise a region label to one canonical snake_case key. Source tables are
 * inconsistent — PHC housing/infra/employment/income use title-case ("Greater
 * Accra") while the Slice 3 MPI/RHDS tables use snake_case ("greater_accra").
 * Without this the cross-table joins double-count (16 → 32 rows).
 */
const rk = (s: string): string => s.toLowerCase().replace(/\s+/g, '_');

export interface DPMDIScore {
  region: string; dpmdi_score: number | null;
  tenure_participation_pct: number | null; employment_rate_pct: number | null;
  earnings_percentile: number | null; components_used: number;
}
export interface PTMPIScore {
  region: string; ptmpi_score: number | null;
  smartphone_pct: number | null; mobile_internet_pct: number | null;
  electricity_pct: number | null; formal_employment_pct: number | null; components_used: number;
}
export interface ESSIScore {
  region: string; essi_score: number | null;
  formal_employment_pct: number | null; mpi_intensity: number | null;
  capital_adequacy_ratio: number | null; components_used: number;
}
export interface RICIScore {
  region: string; rici_score: number | null;
  mieg_component: number | null; ppi_component: number | null; lending_component: number | null;
  npl_component: number | null; rhds_component: number | null; niqs_component: number | null;
  components_used: number;
}

/** Weighted mean over present (weight, value) pairs, re-normalised by present weight. */
function weightedMean(pairs: Array<[number, number | null]>): { score: number | null; used: number } {
  let w = 0, acc = 0, used = 0;
  for (const [weight, value] of pairs) {
    if (value === null) continue;
    acc += weight * value; w += weight; used++;
  }
  return { score: w > 0 ? Math.round((acc / w) * 100) / 100 : null, used };
}

export class RegionalCompositesService {
  // ---------------------------------------------------------------- DPMDI §6.4
  async computeDPMDI(): Promise<DPMDIScore[]> {
    const tenure = await pool.query(`SELECT region, renting_pct, owner_occupied_pct FROM gss_phc_tenure_by_district`);
    const emp = await pool.query(`SELECT region, employment_to_pop_pct FROM gss_phc_employment_by_district`);
    const inc = await pool.query(`SELECT DISTINCT ON (region) region, median_household_income_monthly_ghs AS income FROM regional_household_income ORDER BY region, period_month DESC`);

    const tByR: Record<string, number | null> = {};
    for (const r of tenure.rows) { const rp = num(r.renting_pct), op = num(r.owner_occupied_pct); tByR[rk(r.region)] = (rp !== null || op !== null) ? (rp ?? 0) + (op ?? 0) : null; }
    const eByR: Record<string, number | null> = {};
    for (const r of emp.rows) eByR[rk(r.region)] = num(r.employment_to_pop_pct);

    // Earnings national percentile rank (0–100) across regions.
    const incomes = inc.rows.map((r: any) => ({ region: r.region, income: num(r.income) })).filter(x => x.income !== null) as { region: string; income: number }[];
    incomes.sort((a, b) => a.income - b.income);
    const pctByR: Record<string, number> = {};
    incomes.forEach((x, i) => { pctByR[rk(x.region)] = incomes.length > 1 ? Math.round((i / (incomes.length - 1)) * 10000) / 100 : 50; });

    const regions = new Set<string>([...Object.keys(tByR), ...Object.keys(eByR), ...Object.keys(pctByR)]);
    const out: DPMDIScore[] = [];
    for (const region of regions) {
      const tenurePart = tByR[region] ?? null;
      const empRate = eByR[region] ?? null;
      const earnPct = pctByR[region] ?? null;
      // Spec weights 0.35 tenure / 0.25 apartment(unavailable) / 0.25 employment / 0.15 earnings.
      const { score, used } = weightedMean([[0.35, tenurePart], [0.25, empRate], [0.15, earnPct]]);
      out.push({ region, dpmdi_score: score, tenure_participation_pct: tenurePart, employment_rate_pct: empRate, earnings_percentile: earnPct, components_used: used });
    }
    return out.sort((a, b) => (b.dpmdi_score ?? -1) - (a.dpmdi_score ?? -1));
  }

  // ---------------------------------------------------------------- PTMPI §6.8
  async computePTMPI(): Promise<PTMPIScore[]> {
    const ict = await pool.query(`SELECT region, smartphone_ownership_pct, mobile_internet_use_pct FROM gss_phc_ict_by_district`);
    const infra = await pool.query(`SELECT region, electricity_grid_pct FROM gss_phc_infrastructure_by_district`);
    const emp = await pool.query(`SELECT DISTINCT ON (region) region, formal_employment_pct FROM regional_household_income WHERE formal_employment_pct IS NOT NULL ORDER BY region, period_month DESC`);

    const smByR: Record<string, number | null> = {}, miByR: Record<string, number | null> = {};
    for (const r of ict.rows) { smByR[rk(r.region)] = num(r.smartphone_ownership_pct); miByR[rk(r.region)] = num(r.mobile_internet_use_pct); }
    const elByR: Record<string, number | null> = {};
    for (const r of infra.rows) elByR[rk(r.region)] = num(r.electricity_grid_pct);
    const feByR: Record<string, number | null> = {};
    for (const r of emp.rows) feByR[rk(r.region)] = num(r.formal_employment_pct);

    const regions = new Set<string>([...Object.keys(smByR), ...Object.keys(elByR), ...Object.keys(feByR)]);
    const out: PTMPIScore[] = [];
    for (const region of regions) {
      const sm = smByR[region] ?? null, mi = miByR[region] ?? null, el = elByR[region] ?? null, fe = feByR[region] ?? null;
      // Spec 0.30 smartphone / 0.30 mobile_internet / 0.15 electricity / 0.15 formal_emp / 0.10 enrolment(unavailable).
      const { score, used } = weightedMean([[0.30, sm], [0.30, mi], [0.15, el], [0.15, fe]]);
      out.push({ region, ptmpi_score: score, smartphone_pct: sm, mobile_internet_pct: mi, electricity_pct: el, formal_employment_pct: fe, components_used: used });
    }
    return out.sort((a, b) => (b.ptmpi_score ?? -1) - (a.ptmpi_score ?? -1));
  }

  // ---------------------------------------------------------------- ESSI §6.10
  async computeESSI(): Promise<ESSIScore[]> {
    const emp = await pool.query(`SELECT DISTINCT ON (region) region, formal_employment_pct FROM regional_household_income WHERE formal_employment_pct IS NOT NULL ORDER BY region, period_month DESC`);
    const mpi = await pool.query(`SELECT region, mpi_intensity FROM gss_phc_mpi_by_district WHERE locality = 'All locality types'`);
    const capQ = await pool.query(`SELECT value_pct FROM gss_financial_soundness_monthly WHERE indicator = 'Capital adequacy ratio' AND value_pct IS NOT NULL ORDER BY period_date DESC LIMIT 1`).catch(() => ({ rows: [] as any[] }));
    const capAdequacy = capQ.rows.length ? num(capQ.rows[0].value_pct) : null; // national buffer

    const feByR: Record<string, number | null> = {};
    for (const r of emp.rows) feByR[rk(r.region)] = num(r.formal_employment_pct);
    const mpiByR: Record<string, number | null> = {};
    for (const r of mpi.rows) mpiByR[rk(r.region)] = num(r.mpi_intensity);

    const regions = new Set<string>([...Object.keys(feByR), ...Object.keys(mpiByR)]);
    const out: ESSIScore[] = [];
    for (const region of regions) {
      const fe = feByR[region] ?? null, mp = mpiByR[region] ?? null;
      // Higher ESSI = more exposed. Low formal employment + high poverty raise it; a
      // strong national capital-adequacy buffer lowers it. Spec's mortgage×LTV term
      // has no source and is dropped (weights re-normalised). Bounded 0–100.
      const employmentRisk = fe !== null ? 100 - fe : null;   // 0–100
      const povertyRisk = mp;                                  // 0–100 (%)
      const bufferRelief = capAdequacy !== null ? capAdequacy : null; // ~15–20, protective
      const { score, used } = weightedMean([[0.45, employmentRisk], [0.45, povertyRisk], [-0.10, bufferRelief]]);
      // weightedMean with a negative weight would mis-normalise; compute directly instead.
      let essi: number | null = null; let cnt = 0;
      if (employmentRisk !== null || povertyRisk !== null) {
        let acc = 0, w = 0;
        if (employmentRisk !== null) { acc += 0.45 * employmentRisk; w += 0.45; cnt++; }
        if (povertyRisk !== null) { acc += 0.45 * povertyRisk; w += 0.45; cnt++; }
        let base = w > 0 ? acc / w : 0;
        if (bufferRelief !== null) { base = base - 0.10 * bufferRelief; cnt++; }
        essi = Math.round(clamp(base, 0, 100) * 100) / 100;
      }
      void score; void used;
      out.push({ region, essi_score: essi, formal_employment_pct: fe, mpi_intensity: mp, capital_adequacy_ratio: capAdequacy, components_used: cnt });
    }
    return out.sort((a, b) => (b.essi_score ?? -1) - (a.essi_score ?? -1));
  }

  // ---------------------------------------------------------------- RICI §7.2
  async computeRICI(): Promise<RICIScore[]> {
    // National macro sub-scores (0–100, higher = better climate).
    const mieg = num((await pool.query(`SELECT growth_yoy_pct FROM gss_mieg_monthly WHERE variable='Total_MIEG' AND growth_yoy_pct IS NOT NULL ORDER BY period_date DESC LIMIT 1`)).rows[0]?.growth_yoy_pct);
    const ppi = num((await pool.query(`SELECT change_yoy_pct FROM gss_ppi_construction_series WHERE series_code='Construction' AND change_yoy_pct IS NOT NULL ORDER BY period_date DESC LIMIT 1`)).rows[0]?.change_yoy_pct);
    const lending = num((await pool.query(`SELECT rate_pct FROM gss_interest_rates_monthly WHERE rate_type='Average lending rate' AND rate_pct IS NOT NULL ORDER BY period_date DESC LIMIT 1`)).rows[0]?.rate_pct);
    const npl = num((await pool.query(`SELECT value_pct FROM gss_financial_soundness_monthly WHERE indicator='Non performing loan ratio' AND value_pct IS NOT NULL ORDER BY period_date DESC LIMIT 1`)).rows[0]?.value_pct);

    const miegC = mieg !== null ? clamp(50 + mieg * 5, 0, 100) : null;        // growth good
    const ppiC = ppi !== null ? clamp(100 - ppi * 2, 0, 100) : null;          // high inflation bad
    const lendingC = lending !== null ? clamp(100 - (lending - 15) * 3, 0, 100) : null; // high rate bad
    const nplC = npl !== null ? clamp(100 - npl * 3, 0, 100) : null;          // high NPL bad

    // Regional sub-scores (already 0–100).
    const rhds = await pool.query(`SELECT region, rhds_score FROM regional_housing_demand_scores`);
    const rhdsByR: Record<string, number | null> = {};
    for (const r of rhds.rows) rhdsByR[rk(r.region)] = num(r.rhds_score);
    const niqs = await pool.query(`SELECT region, niqs_score FROM district_infrastructure_scores`);
    const niqsByR: Record<string, number | null> = {};
    for (const r of niqs.rows) niqsByR[rk(r.region)] = num(r.niqs_score);

    const regions = new Set<string>([...Object.keys(rhdsByR), ...Object.keys(niqsByR)]);
    const out: RICIScore[] = [];
    for (const region of regions) {
      const rhdsC = rhdsByR[region] ?? null, niqsC = niqsByR[region] ?? null;
      const { score, used } = weightedMean([
        [0.20, miegC], [0.15, ppiC], [0.15, lendingC], [0.10, nplC], [0.20, rhdsC], [0.10, niqsC],
      ]);
      out.push({ region, rici_score: score, mieg_component: miegC, ppi_component: ppiC, lending_component: lendingC, npl_component: nplC, rhds_component: rhdsC, niqs_component: niqsC, components_used: used });
    }
    return out.sort((a, b) => (b.rici_score ?? -1) - (a.rici_score ?? -1));
  }

  // ---------------------------------------------------------------- persistence
  async computeAndStoreAll(): Promise<{ dpmdi: number; ptmpi: number; essi: number; rici: number }> {
    const [dpmdi, ptmpi, essi, rici] = await Promise.all([this.computeDPMDI(), this.computePTMPI(), this.computeESSI(), this.computeRICI()]);
    for (const s of dpmdi) await pool.query(
      `INSERT INTO district_market_depth_scores (region, dpmdi_score, tenure_participation_pct, employment_rate_pct, earnings_percentile, components_used, computed_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT (region) DO UPDATE SET dpmdi_score=EXCLUDED.dpmdi_score, tenure_participation_pct=EXCLUDED.tenure_participation_pct, employment_rate_pct=EXCLUDED.employment_rate_pct, earnings_percentile=EXCLUDED.earnings_percentile, components_used=EXCLUDED.components_used, computed_at=NOW()`,
      [s.region, s.dpmdi_score, s.tenure_participation_pct, s.employment_rate_pct, s.earnings_percentile, s.components_used]).catch(e => logger.error('[DPMDI] upsert', { region: s.region, e: e.message }));
    for (const s of ptmpi) await pool.query(
      `INSERT INTO district_proptech_scores (region, ptmpi_score, smartphone_pct, mobile_internet_pct, electricity_pct, formal_employment_pct, components_used, computed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) ON CONFLICT (region) DO UPDATE SET ptmpi_score=EXCLUDED.ptmpi_score, smartphone_pct=EXCLUDED.smartphone_pct, mobile_internet_pct=EXCLUDED.mobile_internet_pct, electricity_pct=EXCLUDED.electricity_pct, formal_employment_pct=EXCLUDED.formal_employment_pct, components_used=EXCLUDED.components_used, computed_at=NOW()`,
      [s.region, s.ptmpi_score, s.smartphone_pct, s.mobile_internet_pct, s.electricity_pct, s.formal_employment_pct, s.components_used]).catch(e => logger.error('[PTMPI] upsert', { region: s.region, e: e.message }));
    for (const s of essi) await pool.query(
      `INSERT INTO regional_economic_shock_sensitivity (region, essi_score, formal_employment_pct, mpi_intensity, capital_adequacy_ratio, components_used, computed_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT (region) DO UPDATE SET essi_score=EXCLUDED.essi_score, formal_employment_pct=EXCLUDED.formal_employment_pct, mpi_intensity=EXCLUDED.mpi_intensity, capital_adequacy_ratio=EXCLUDED.capital_adequacy_ratio, components_used=EXCLUDED.components_used, computed_at=NOW()`,
      [s.region, s.essi_score, s.formal_employment_pct, s.mpi_intensity, s.capital_adequacy_ratio, s.components_used]).catch(e => logger.error('[ESSI] upsert', { region: s.region, e: e.message }));
    for (const s of rici) await pool.query(
      `INSERT INTO regional_investment_climate_index (region, rici_score, mieg_component, ppi_component, lending_component, npl_component, rhds_component, niqs_component, components_used, computed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) ON CONFLICT (region) DO UPDATE SET rici_score=EXCLUDED.rici_score, mieg_component=EXCLUDED.mieg_component, ppi_component=EXCLUDED.ppi_component, lending_component=EXCLUDED.lending_component, npl_component=EXCLUDED.npl_component, rhds_component=EXCLUDED.rhds_component, niqs_component=EXCLUDED.niqs_component, components_used=EXCLUDED.components_used, computed_at=NOW()`,
      [s.region, s.rici_score, s.mieg_component, s.ppi_component, s.lending_component, s.npl_component, s.rhds_component, s.niqs_component, s.components_used]).catch(e => logger.error('[RICI] upsert', { region: s.region, e: e.message }));
    logger.info('[RegionalComposites] Computed + stored', { dpmdi: dpmdi.length, ptmpi: ptmpi.length, essi: essi.length, rici: rici.length });
    return { dpmdi: dpmdi.length, ptmpi: ptmpi.length, essi: essi.length, rici: rici.length };
  }

  /** Read all four composites for the API (recompute-on-empty per composite). */
  async getAll(): Promise<{ dpmdi: DPMDIScore[]; ptmpi: PTMPIScore[]; essi: ESSIScore[]; rici: RICIScore[] }> {
    const readOr = async <T>(table: string, mapper: (r: any) => T, recompute: () => Promise<T[]>): Promise<T[]> => {
      try {
        const r = await pool.query(`SELECT * FROM ${table}`);
        if (r.rows.length === 0) return recompute();
        return r.rows.map(mapper);
      } catch { return []; }
    };
    const [dpmdi, ptmpi, essi, rici] = await Promise.all([
      readOr('district_market_depth_scores', (r) => ({ region: r.region, dpmdi_score: num(r.dpmdi_score), tenure_participation_pct: num(r.tenure_participation_pct), employment_rate_pct: num(r.employment_rate_pct), earnings_percentile: num(r.earnings_percentile), components_used: r.components_used }) as DPMDIScore, () => this.computeDPMDI()),
      readOr('district_proptech_scores', (r) => ({ region: r.region, ptmpi_score: num(r.ptmpi_score), smartphone_pct: num(r.smartphone_pct), mobile_internet_pct: num(r.mobile_internet_pct), electricity_pct: num(r.electricity_pct), formal_employment_pct: num(r.formal_employment_pct), components_used: r.components_used }) as PTMPIScore, () => this.computePTMPI()),
      readOr('regional_economic_shock_sensitivity', (r) => ({ region: r.region, essi_score: num(r.essi_score), formal_employment_pct: num(r.formal_employment_pct), mpi_intensity: num(r.mpi_intensity), capital_adequacy_ratio: num(r.capital_adequacy_ratio), components_used: r.components_used }) as ESSIScore, () => this.computeESSI()),
      readOr('regional_investment_climate_index', (r) => ({ region: r.region, rici_score: num(r.rici_score), mieg_component: num(r.mieg_component), ppi_component: num(r.ppi_component), lending_component: num(r.lending_component), npl_component: num(r.npl_component), rhds_component: num(r.rhds_component), niqs_component: num(r.niqs_component), components_used: r.components_used }) as RICIScore, () => this.computeRICI()),
    ]);
    const sortByScore = <T extends Record<string, any>>(arr: T[], key: string) => arr.sort((a, b) => (b[key] ?? -1) - (a[key] ?? -1));
    return { dpmdi: sortByScore(dpmdi, 'dpmdi_score'), ptmpi: sortByScore(ptmpi, 'ptmpi_score'), essi: sortByScore(essi, 'essi_score'), rici: sortByScore(rici, 'rici_score') };
  }
}

export const regionalCompositesService = new RegionalCompositesService();
