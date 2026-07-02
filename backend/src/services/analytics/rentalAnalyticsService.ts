/**
 * Rental Analytics Service (Phase 3)
 *
 * Analytics.md Section 4.3 — RentalMarketAnalytics:
 *   - Average & median rental yields by region / property type
 *   - Rent benchmarks (by bedrooms, per sqm, vacancy)
 *   - Rental price trends (time-series of rental transaction values)
 *   - Lease term analytics from tenancies
 *   - Gross & net yield calculation
 *
 * Sources: property_transactions, tenancies, property_income,
 *          rental_market_benchmarks, market_cap_rate_benchmarks,
 *          rental_yield_analytics (snapshot table from migration 158)
 *
 * @module services/analytics/rentalAnalyticsService
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { gssPhcHousingService } from '../data-hub/scrapers/gssPhcHousingService';
import { gssGlss7Service } from '../data-hub/scrapers/gssGlss7Service';

// ====================================================================
// TYPES
// ====================================================================

export interface RentalSummary {
  region: string;
  property_type: string;
  avg_rent_monthly: number;
  median_rent_monthly: number;
  avg_rent_per_sqm: number;
  rental_transaction_count: number;
  gross_yield_pct: number;
  vacancy_rate_pct: number;
  rent_by_bedrooms: Record<string, number>;
  // GSS enrichments (Slice 1+2 — null when source tables empty)
  rent_to_income_ratio?: number | null;         // median_rent / median_monthly_income
  formal_rental_market_depth_pct?: number | null; // % of households renting (PHC 2021)
  // GSS GLSS7 rent-payee enrichment (Slice 4 — null when snapshot empty)
  private_rental_share_pct?: number | null;     // % of renters paying a private landlord (individual/employer)
  rent_payee_breakdown?: Record<string, number | null> | null; // full payee mix (GLSS7 Table_7.3)
}

export interface RentalAffordabilityBand {
  band: string;
  band_min: number;
  band_max: number | null;
  affordable_pct: number;          // % of households who can afford (income-only)
  effective_demand_pct: number;    // affordable_pct × labour-market risk adjustment
}

export interface RentalAffordabilityRegion {
  region: string;
  median_monthly_income_ghs: number;
  informal_pct: number | null;
  unemployment_rate: number | null;
  risk_adjustment: number;
  bands: RentalAffordabilityBand[];
}

export interface RentalYieldDetail {
  region: string;
  property_type: string;
  gross_yield: number;
  net_yield: number;
  cap_rate: number;
  avg_property_value: number;
  avg_annual_rent: number;
  vacancy_rate: number;
  rent_growth_rate: number;
}

export interface RentalTrend {
  period: string;
  avg_rent: number;
  median_rent: number;
  count: number;
}

export interface RentalBenchmarkRow {
  area_name: string;
  property_type: string;
  listing_count: number;
  avg_rent_monthly: number;
  median_rent_monthly: number;
  avg_rent_per_sqm: number;
  vacancy_rate_estimate: number | null;
  rent_by_bedrooms: Record<string, number>;
}

interface RentalFilterOpts {
  region?: string;
  propertyType?: string;
  months?: number;
}

// ====================================================================
// LOCALITY → GSS REGION RESOLVER
// ====================================================================
// Rental data is keyed by locality/neighbourhood (East Legon, Osu, Tema, Kumasi
// Metropolitan…), not by the 16 GSS regions the GSS enrichment tables use. Without
// this resolver the region-key join never matches, so every GSS enrichment field
// (rent-to-income, market depth, private-rental share) silently stayed null. This
// maps a locality to its GSS region by factual geography (not fabricated data).

/** The 16 canonical GSS region keys (snake_case). */
const GSS_REGION_KEYS = new Set([
  'western', 'central', 'greater_accra', 'volta', 'eastern', 'ashanti',
  'western_north', 'ahafo', 'bono', 'bono_east', 'oti', 'northern',
  'savannah', 'north_east', 'upper_east', 'upper_west',
]);

/**
 * Locality/city token → GSS region. Substring-matched against the lowercased
 * locality, so "East Legon Hills", "Accra Metropolitan", "Teshie-Nungua Estates"
 * all resolve via their contained token. Greater Accra dominates the property
 * dataset; other metros are covered for completeness.
 */
const LOCALITY_TOKEN_TO_REGION: Array<[string, string]> = [
  // Greater Accra (city + well-known neighbourhoods/areas)
  ['accra', 'greater_accra'], ['legon', 'greater_accra'], ['osu', 'greater_accra'],
  ['cantonment', 'greater_accra'], ['spintex', 'greater_accra'], ['dzorwulu', 'greater_accra'],
  ['labone', 'greater_accra'], ['ridge', 'greater_accra'], ['achimota', 'greater_accra'],
  ['adenta', 'greater_accra'], ['adentan', 'greater_accra'], ['tema', 'greater_accra'],
  ['teshie', 'greater_accra'], ['nungua', 'greater_accra'], ['tse addo', 'greater_accra'],
  ['adjiringanor', 'greater_accra'], ['airport residential', 'greater_accra'],
  ['east airport', 'greater_accra'], ['haatso', 'greater_accra'], ['agbogba', 'greater_accra'],
  ['ashaley botwe', 'greater_accra'], ['abelemkpe', 'greater_accra'], ['batsonaa', 'greater_accra'],
  ['oyarifa', 'greater_accra'], ['lakeside', 'greater_accra'], ['madina', 'greater_accra'],
  ['sakumono', 'greater_accra'], ['dansoman', 'greater_accra'], ['kaneshie', 'greater_accra'],
  ['lapaz', 'greater_accra'], ['la palm', 'greater_accra'], ['ga east', 'greater_accra'],
  ['ga west', 'greater_accra'], ['ga south', 'greater_accra'], ['west hills', 'greater_accra'],
  ['kasoa', 'central'], // Kasoa straddles but is administratively Central
  // Ashanti
  ['kumasi', 'ashanti'], ['obuasi', 'ashanti'], ['ejisu', 'ashanti'], ['asokore', 'ashanti'],
  // Western / Western North
  ['takoradi', 'western'], ['sekondi', 'western'], ['tarkwa', 'western'], ['sefwi', 'western_north'],
  // Central
  ['cape coast', 'central'], ['elmina', 'central'], ['winneba', 'central'],
  // Volta / Oti
  ['ho ', 'volta'], ['aflao', 'volta'], ['hohoe', 'volta'], ['keta', 'volta'], ['dambai', 'oti'],
  // Eastern
  ['koforidua', 'eastern'], ['nsawam', 'eastern'], ['akosombo', 'eastern'], ['akropong', 'eastern'],
  // Bono / Bono East / Ahafo
  ['sunyani', 'bono'], ['techiman', 'bono_east'], ['goaso', 'ahafo'],
  // Northern belt
  ['tamale', 'northern'], ['yendi', 'northern'], ['damongo', 'savannah'], ['nalerigu', 'north_east'],
  ['walewale', 'north_east'], ['bolgatanga', 'upper_east'], ['bawku', 'upper_east'], ['wa ', 'upper_west'],
];

/** Common administrative suffixes stripped before an exact region match. */
const ADMIN_SUFFIX = /_(metropolitan|metropolis|municipal|municipality|district|area|estate|estates|hills|new town|newtown)$/;

/** Resolve a locality/region label to its GSS region key, or null when unidentifiable. */
function resolveGssRegion(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  const key = lower.replace(/\s+/g, '_');
  if (GSS_REGION_KEYS.has(key)) return key;
  const base = key.replace(ADMIN_SUFFIX, '');
  if (GSS_REGION_KEYS.has(base)) return base;
  // Direct region name contained anywhere (e.g. "greater_accra_something")
  for (const region of GSS_REGION_KEYS) if (key.includes(region)) return region;
  // Locality-token substring match (uses the spaced form so "wa " / "ho " don't over-match)
  for (const [token, region] of LOCALITY_TOKEN_TO_REGION) {
    if (lower.includes(token)) return region;
  }
  return null;
}

// ====================================================================
// SERVICE
// ====================================================================

class RentalAnalyticsService {
  // ------------------------------------------------------------------
  // RENTAL SUMMARY
  // ------------------------------------------------------------------

  /**
   * Summary of rental market: avg/median rent, yield, vacancy per region & type.
   */
  async getRentalSummary(opts: RentalFilterOpts): Promise<RentalSummary[]> {
    return this.computeRentalSummaryLive(opts);
  }

  private async computeRentalSummaryLive(opts: RentalFilterOpts): Promise<RentalSummary[]> {
    // Try transaction-based summary first
    try {
      const months = opts.months || 12;
      const params: any[] = [months];
      let idx = 2;
      let txnWhere = '';
      if (opts.region) {
        txnWhere += ` AND LOWER(pt.property_region::text) = LOWER($${idx++})`;
        params.push(opts.region);
      }
      if (opts.propertyType) {
        txnWhere += ` AND LOWER(pt.property_type::text) = LOWER($${idx++})`;
        params.push(opts.propertyType);
      }

      const sql = `
        WITH rental_txns AS (
          SELECT
            pt.property_region::text AS region,
            COALESCE(pt.property_type::text, 'residential') AS property_type,
            COUNT(*) AS txn_count,
            ROUND(AVG(pt.final_price)::numeric, 2) AS avg_rent,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pt.final_price)::numeric, 2) AS median_rent,
            ROUND(AVG(pt.price_per_sqm)::numeric, 2) AS avg_rent_sqm
          FROM property_transactions pt
          WHERE pt.transaction_type IN ('rental', 'lease')
            AND pt.transaction_date >= CURRENT_DATE - ($1 || ' months')::interval
            AND pt.final_price > 0
            ${txnWhere}
          GROUP BY pt.property_region, pt.property_type
        ),
        yields AS (
          SELECT
            cb.region::text AS region, cb.property_type::text AS property_type,
            cb.benchmark_cap_rate AS cap_rate,
            cb.vacancy_rate_market AS vacancy,
            cb.rent_growth_rate
          FROM market_cap_rate_benchmarks cb
        )
        SELECT
          r.region, r.property_type,
          r.avg_rent AS avg_rent_monthly,
          r.median_rent AS median_rent_monthly,
          COALESCE(r.avg_rent_sqm, 0) AS avg_rent_per_sqm,
          r.txn_count AS rental_transaction_count,
          COALESCE(y.cap_rate, 0) AS gross_yield_pct,
          COALESCE(y.vacancy, 0) AS vacancy_rate_pct
        FROM rental_txns r
        LEFT JOIN yields y ON LOWER(r.region) = LOWER(y.region) AND LOWER(r.property_type) = LOWER(y.property_type)
        ORDER BY r.txn_count DESC
      `;

      const result = await pool.query(sql, params);
      if (result.rows.length > 0) {
        const summaries: RentalSummary[] = result.rows.map((r: any) => ({
          region: r.region,
          property_type: r.property_type,
          avg_rent_monthly: parseFloat(r.avg_rent_monthly || '0'),
          median_rent_monthly: parseFloat(r.median_rent_monthly || '0'),
          avg_rent_per_sqm: parseFloat(r.avg_rent_per_sqm || '0'),
          rental_transaction_count: parseInt(r.rental_transaction_count || '0', 10),
          gross_yield_pct: parseFloat(r.gross_yield_pct || '0'),
          vacancy_rate_pct: parseFloat(r.vacancy_rate_pct || '0'),
          rent_by_bedrooms: {},
        }));

        // GSS enrichments — non-fatal if source tables empty
        await this.enrichWithGssData(summaries);
        return summaries;
      }
    } catch (_e) {
      logger.warn('Transaction-based rental summary unavailable, falling back to benchmarks');
    }

    // Fallback: synthesize summary from rental_market_benchmarks + market_cap_rate_benchmarks
    const fbParams: any[] = [];
    let fbIdx = 1;
    let fbWhere = '';
    if (opts.region) {
      fbWhere += ` AND LOWER(rmb.area_name) = LOWER($${fbIdx++})`;
      fbParams.push(opts.region);
    }
    if (opts.propertyType) {
      fbWhere += ` AND LOWER(rmb.property_type::text) = LOWER($${fbIdx++})`;
      fbParams.push(opts.propertyType);
    }

    const fbSql = `
      SELECT
        rmb.area_name AS region,
        COALESCE(rmb.property_type::text, 'residential') AS property_type,
        COALESCE(rmb.avg_rent_monthly, 0) AS avg_rent_monthly,
        COALESCE(rmb.median_rent_monthly, 0) AS median_rent_monthly,
        COALESCE(rmb.avg_rent_per_sqm, 0) AS avg_rent_per_sqm,
        COALESCE(rmb.listing_count, 0) AS rental_transaction_count,
        COALESCE(rmb.vacancy_rate_estimate, 0) AS vacancy_rate_pct,
        COALESCE(rmb.rent_by_bedrooms, '{}') AS rent_by_bedrooms
      FROM rental_market_benchmarks rmb
      WHERE 1=1 ${fbWhere}
      ORDER BY rmb.listing_count DESC
    `;

    const fbResult = await pool.query(fbSql, fbParams);
    const fbSummaries: RentalSummary[] = fbResult.rows.map((r: any) => ({
      region: r.region,
      property_type: r.property_type,
      avg_rent_monthly: parseFloat(r.avg_rent_monthly || '0'),
      median_rent_monthly: parseFloat(r.median_rent_monthly || '0'),
      avg_rent_per_sqm: parseFloat(r.avg_rent_per_sqm || '0'),
      rental_transaction_count: parseInt(r.rental_transaction_count || '0', 10),
      gross_yield_pct: 0,
      vacancy_rate_pct: parseFloat(r.vacancy_rate_pct || '0'),
      rent_by_bedrooms: typeof r.rent_by_bedrooms === 'string'
        ? JSON.parse(r.rent_by_bedrooms) : (r.rent_by_bedrooms || {}),
    }));

    await this.enrichWithGssData(fbSummaries);
    return fbSummaries;
  }

  /**
   * Enrich RentalSummary rows with GSS data (Slice 1+2).
   * Adds rent_to_income_ratio (from regional_household_income) and
   * formal_rental_market_depth_pct (from gss_phc_tenure_by_district).
   * Non-fatal: sets fields to null if source tables are empty.
   */
  private async enrichWithGssData(summaries: RentalSummary[]): Promise<void> {
    try {
      // Fetch income per region (Slice 1 — already populated)
      const incomeRows = await pool.query<{ region: string; median_household_income_monthly_ghs: string }>(
        `SELECT DISTINCT ON (region) region, median_household_income_monthly_ghs
         FROM regional_household_income ORDER BY region, period_month DESC`,
      );
      const incomeByRegion: Record<string, number> = {};
      for (const row of incomeRows.rows) {
        incomeByRegion[row.region.toLowerCase().replace(/\s+/g, '_')] = parseFloat(row.median_household_income_monthly_ghs);
      }

      // Fetch renting % per region (Slice 2 — PHC tenure)
      const tenureByRegion = await gssPhcHousingService.getTenureByRegion();

      // Fetch GLSS7 rent-payee snapshot per region (Slice 4 — private-market maturity)
      const glss7HousingByRegion = await gssGlss7Service.getHousingSnapshotByRegion();

      for (const s of summaries) {
        // Rental rows are keyed by locality/neighbourhood — resolve to the GSS region
        // so the enrichment tables (all keyed by the 16 GSS regions) actually join.
        const regionKey = resolveGssRegion(s.region);
        if (!regionKey) continue;
        const income = incomeByRegion[regionKey] ?? null;
        if (income && income > 0 && s.median_rent_monthly > 0) {
          s.rent_to_income_ratio = Math.round((s.median_rent_monthly / income) * 1000) / 1000;
        }
        const tenure = tenureByRegion[regionKey];
        if (tenure?.renting_pct !== null && tenure?.renting_pct !== undefined) {
          s.formal_rental_market_depth_pct = tenure.renting_pct;
        }
        const glss7 = glss7HousingByRegion[regionKey];
        if (glss7) {
          s.private_rental_share_pct = glss7.private_rental_share_pct;
          s.rent_payee_breakdown = glss7.rent_payee;
        }
      }
    } catch {
      // Silently degrade — fields stay undefined
    }
  }

  // ------------------------------------------------------------------
  // RENTAL AFFORDABILITY BANDS (RABM — Slice 5 §6.6)
  // ------------------------------------------------------------------

  /**
   * Rental Affordability Band Model: for each GHS rent band, the % of a region's
   * households that can afford it without spending >30% of monthly income, then
   * discounted for labour-market risk (informality + unemployment).
   *
   *   affordable_pct       = P(monthly_income × 0.30 ≥ band_midpoint)
   *                          [log-normal, mu = ln(median income), sigma = INCOME_SIGMA]
   *   risk_adj             = 1 - (informal_pct × 0.3 + unemployment_rate × 0.5)
   *   effective_demand_pct = affordable_pct × risk_adj
   *
   * Inputs are all real: median monthly income (regional_household_income), and
   * informal/unemployment shares (gss_phc_employment_by_district). INCOME_SIGMA is
   * a documented log-normal dispersion parameter (not a data value), like the 0.30
   * rent-burden threshold the spec prescribes.
   */
  async getRentalAffordabilityBands(region?: string): Promise<RentalAffordabilityRegion[]> {
    const INCOME_SIGMA = 0.85;   // log-normal dispersion for LMIC household income
    const RENT_BURDEN = 0.30;    // max share of income spent on rent
    const BANDS: { label: string; min: number; max: number | null }[] = [
      { label: '<500', min: 0, max: 500 },
      { label: '500–1k', min: 500, max: 1000 },
      { label: '1k–2k', min: 1000, max: 2000 },
      { label: '2k–5k', min: 2000, max: 5000 },
      { label: '5k+', min: 5000, max: null },
    ];
    // Standard normal CDF (Abramowitz–Stegun approximation).
    const normCdf = (z: number): number => {
      const t = 1 / (1 + 0.2316419 * Math.abs(z));
      const d = 0.3989423 * Math.exp(-z * z / 2);
      let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
      p = z > 0 ? 1 - p : p;
      return p;
    };

    try {
      const incomeRows = await pool.query<{ region: string; income: string | null }>(
        `SELECT DISTINCT ON (region) region, median_household_income_monthly_ghs AS income
         FROM regional_household_income ORDER BY region, period_month DESC`,
      );
      const incomeByRegion: Record<string, number> = {};
      for (const r of incomeRows.rows) {
        if (r.income !== null) incomeByRegion[r.region.toLowerCase().replace(/\s+/g, '_')] = parseFloat(r.income);
      }

      const empRows = await pool.query<{ region: string; informal: string | null; unemp: string | null }>(
        `SELECT region, private_informal_pct AS informal, unemployment_rate AS unemp
         FROM gss_phc_employment_by_district`,
      );
      const empByRegion: Record<string, { informal: number | null; unemp: number | null }> = {};
      for (const r of empRows.rows) {
        empByRegion[r.region] = {
          informal: r.informal !== null ? parseFloat(r.informal) : null,
          unemp: r.unemp !== null ? parseFloat(r.unemp) : null,
        };
      }

      const wantKey = region ? resolveGssRegion(region) : null;
      const out: RentalAffordabilityRegion[] = [];
      for (const [regionKey, median] of Object.entries(incomeByRegion)) {
        if (wantKey && regionKey !== wantKey) continue;
        if (!(median > 0)) continue;
        const mu = Math.log(median);
        const emp = empByRegion[regionKey];
        const informal = emp?.informal ?? null;
        const unemp = emp?.unemp ?? null;
        const riskAdj = Math.max(0, Math.min(1,
          1 - ((informal ?? 0) / 100 * 0.3 + (unemp ?? 0) / 100 * 0.5)));

        const bands = BANDS.map((b) => {
          // Affordability threshold = band midpoint (or floor for the open top band) ÷ 0.30.
          const midpoint = b.max !== null ? (b.min + b.max) / 2 : b.min * 1.2;
          const requiredIncome = midpoint / RENT_BURDEN;
          const z = (Math.log(requiredIncome) - mu) / INCOME_SIGMA;
          const affordablePct = Math.round((1 - normCdf(z)) * 10000) / 100; // P(income ≥ required)
          const effectiveDemandPct = Math.round(affordablePct * riskAdj * 100) / 100;
          return {
            band: b.label,
            band_min: b.min,
            band_max: b.max,
            affordable_pct: affordablePct,
            effective_demand_pct: effectiveDemandPct,
          };
        });

        out.push({
          region: regionKey,
          median_monthly_income_ghs: Math.round(median),
          informal_pct: informal,
          unemployment_rate: unemp,
          risk_adjustment: Math.round(riskAdj * 1000) / 1000,
          bands,
        });
      }
      return out.sort((a, b) => b.median_monthly_income_ghs - a.median_monthly_income_ghs);
    } catch (err: any) {
      logger.error('RentalAnalytics.getRentalAffordabilityBands error', err);
      return [];
    }
  }

  // ------------------------------------------------------------------
  // RENTAL YIELDS
  // ------------------------------------------------------------------

  /**
   * Detailed yield analytics per region.
   */
  async getRentalYields(opts: RentalFilterOpts): Promise<RentalYieldDetail[]> {
    try {
      const params: any[] = [];
      let idx = 1;
      let where = '';
      if (opts.region) {
        where += ` AND LOWER(cb.region) = LOWER($${idx++})`;
        params.push(opts.region);
      }
      if (opts.propertyType) {
        where += ` AND LOWER(cb.property_type::text) = LOWER($${idx++})`;
        params.push(opts.propertyType);
      }

      // Combine market_cap_rate_benchmarks with property_income averages
      const sql = `
        WITH income_avg AS (
          SELECT
            p.region::text AS region,
            p.property_type::text AS property_type,
            ROUND(AVG(pi.gross_potential_rent * 12)::numeric, 2) AS avg_annual_rent,
            ROUND(AVG(pi.property_value)::numeric, 2) AS avg_property_value,
            ROUND(AVG(pi.vacancy_rate)::numeric, 4) AS avg_vacancy,
            ROUND(AVG(pi.cap_rate)::numeric, 4) AS avg_cap_rate,
            ROUND(AVG(pi.net_operating_income)::numeric, 2) AS avg_noi
          FROM property_income pi
          JOIN properties p ON pi.property_id = p.id
          WHERE pi.property_value > 0 AND pi.gross_potential_rent > 0
          GROUP BY p.region, p.property_type
        )
        SELECT
          cb.region::text AS region,
          cb.property_type::text AS property_type,
          COALESCE(ia.avg_annual_rent, 0) AS avg_annual_rent,
          COALESCE(ia.avg_property_value, 0) AS avg_property_value,
          COALESCE(cb.benchmark_cap_rate, ia.avg_cap_rate, 0) AS cap_rate,
          CASE WHEN COALESCE(ia.avg_property_value, 0) > 0
            THEN ROUND((COALESCE(ia.avg_annual_rent, 0) / ia.avg_property_value * 100)::numeric, 2)
            ELSE 0 END AS gross_yield,
          CASE WHEN COALESCE(ia.avg_property_value, 0) > 0
            THEN ROUND((COALESCE(ia.avg_noi, 0) * 12 / ia.avg_property_value * 100)::numeric, 2)
            ELSE 0 END AS net_yield,
          COALESCE(cb.vacancy_rate_market, ia.avg_vacancy, 0) AS vacancy_rate,
          COALESCE(cb.rent_growth_rate, 0) AS rent_growth_rate
        FROM market_cap_rate_benchmarks cb
        LEFT JOIN income_avg ia ON LOWER(cb.region::text) = LOWER(ia.region)
          AND LOWER(cb.property_type::text) = LOWER(ia.property_type)
        WHERE 1=1 ${where}
        ORDER BY cb.benchmark_cap_rate DESC NULLS LAST
      `;

      const result = await pool.query(sql, params);
      return result.rows.map((r: any) => ({
        region: r.region,
        property_type: r.property_type,
        gross_yield: parseFloat(r.gross_yield || '0'),
        net_yield: parseFloat(r.net_yield || '0'),
        cap_rate: parseFloat(r.cap_rate || '0'),
        avg_property_value: parseFloat(r.avg_property_value || '0'),
        avg_annual_rent: parseFloat(r.avg_annual_rent || '0'),
        vacancy_rate: parseFloat(r.vacancy_rate || '0'),
        rent_growth_rate: parseFloat(r.rent_growth_rate || '0'),
      }));
    } catch (err: any) {
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // RENTAL TRENDS
  // ------------------------------------------------------------------

  /**
   * Monthly rental price trends from transactions.
   */
  async getRentalTrends(opts: RentalFilterOpts): Promise<RentalTrend[]> {
    try {
      const months = opts.months || 24;
      const params: any[] = [months];
      let idx = 2;
      let where = '';
      if (opts.region) {
        where += ` AND LOWER(pt.property_region::text) = LOWER($${idx++})`;
        params.push(opts.region);
      }
      if (opts.propertyType) {
        where += ` AND LOWER(pt.property_type::text) = LOWER($${idx++})`;
        params.push(opts.propertyType);
      }

      const sql = `
        SELECT
          TO_CHAR(DATE_TRUNC('month', pt.transaction_date), 'YYYY-MM') AS period,
          ROUND(AVG(pt.final_price)::numeric, 2) AS avg_rent,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pt.final_price)::numeric, 2) AS median_rent,
          COUNT(*) AS count
        FROM property_transactions pt
        WHERE pt.transaction_type IN ('rental', 'lease')
          AND pt.transaction_date >= CURRENT_DATE - ($1 || ' months')::interval
          AND pt.final_price > 0
          ${where}
        GROUP BY DATE_TRUNC('month', pt.transaction_date)
        ORDER BY DATE_TRUNC('month', pt.transaction_date) ASC
      `;

      const result = await pool.query(sql, params);
      return result.rows.map((r: any) => ({
        period: r.period,
        avg_rent: parseFloat(r.avg_rent || '0'),
        median_rent: parseFloat(r.median_rent || '0'),
        count: parseInt(r.count || '0', 10),
      }));
    } catch (err: any) {
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // RENTAL BENCHMARKS
  // ------------------------------------------------------------------

  /**
   * Rental benchmarks from the rental_market_benchmarks table.
   */
  async getRentalBenchmarks(opts: { region?: string; propertyType?: string }): Promise<RentalBenchmarkRow[]> {
    try {
      const params: any[] = [];
      let idx = 1;
      let where = '';
      if (opts.region) {
        where += ` AND LOWER(area_name) = LOWER($${idx++})`;
        params.push(opts.region);
      }
      if (opts.propertyType) {
        where += ` AND LOWER(property_type::text) = LOWER($${idx++})`;
        params.push(opts.propertyType);
      }

      const sql = `
        SELECT
          area_name, property_type::text AS property_type,
          listing_count,
          COALESCE(avg_rent_monthly, 0) AS avg_rent_monthly,
          COALESCE(median_rent_monthly, 0) AS median_rent_monthly,
          COALESCE(avg_rent_per_sqm, 0) AS avg_rent_per_sqm,
          vacancy_rate_estimate,
          COALESCE(rent_by_bedrooms, '{}') AS rent_by_bedrooms
        FROM rental_market_benchmarks
        WHERE 1=1 ${where}
        ORDER BY listing_count DESC
      `;

      const result = await pool.query(sql, params);
      return result.rows.map((r: any) => ({
        area_name: r.area_name,
        property_type: r.property_type,
        listing_count: parseInt(r.listing_count || '0', 10),
        avg_rent_monthly: parseFloat(r.avg_rent_monthly || '0'),
        median_rent_monthly: parseFloat(r.median_rent_monthly || '0'),
        avg_rent_per_sqm: parseFloat(r.avg_rent_per_sqm || '0'),
        vacancy_rate_estimate: r.vacancy_rate_estimate ? parseFloat(r.vacancy_rate_estimate) : null,
        rent_by_bedrooms: typeof r.rent_by_bedrooms === 'string'
          ? JSON.parse(r.rent_by_bedrooms) : (r.rent_by_bedrooms || {}),
      }));
    } catch (err: any) {
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // RENTAL BY REGION
  // ------------------------------------------------------------------

  /**
   * Rental summary grouped by region (for the rental heatmap / comparison).
   */
  async getRentalByRegion(): Promise<RentalSummary[]> {
    return this.getRentalSummary({});
  }

  // ------------------------------------------------------------------
  // helpers
  // ------------------------------------------------------------------

  private mapRentalSummaryRow(r: any): RentalSummary {
    return {
      region: r.region,
      property_type: r.property_type,
      avg_rent_monthly: parseFloat(r.avg_rent_monthly || '0'),
      median_rent_monthly: parseFloat(r.median_rent_monthly || '0'),
      avg_rent_per_sqm: parseFloat(r.avg_rent_per_sqm || '0'),
      rental_transaction_count: parseInt(r.rental_transaction_count || '0', 10),
      gross_yield_pct: parseFloat(r.gross_yield_pct || '0'),
      vacancy_rate_pct: parseFloat(r.vacancy_rate_pct || '0'),
      rent_by_bedrooms: typeof r.rent_by_bedrooms === 'string'
        ? JSON.parse(r.rent_by_bedrooms) : (r.rent_by_bedrooms || {}),
    };
  }
}

export const rentalAnalyticsService = new RentalAnalyticsService();
