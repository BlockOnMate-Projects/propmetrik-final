/**
 * Investment Scoring Service (Phase 3)
 *
 * Analytics.md Section 4.4 — InvestmentAnalytics:
 *   - Composite opportunity score (0–100) per region/property type
 *   - Factor decomposition (cap_rate, price_growth, rental_growth, absorption)
 *   - Risk scoring (volatility, vacancy, market condition)
 *   - Regional comparison matrix
 *   - Investment opportunity discovery
 *
 * Sources: market_cap_rate_benchmarks, property_transactions,
 *          investment_opportunity_metrics (snapshot from migration 158),
 *          property_income, property_price_index, market_activity_metrics
 *
 * @module services/analytics/investmentScoringService
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';

// ====================================================================
// TYPES
// ====================================================================

export interface InvestmentOpportunity {
  region: string;
  property_type: string;
  opportunity_score: number;
  opportunity_factors: {
    cap_rate_score: number;
    price_growth_score: number;
    rental_yield_score: number;
    absorption_score: number;
    risk_score: number;
  };
  cap_rate: number;
  avg_price_growth_yoy: number;
  avg_rental_growth_yoy: number;
  vacancy_rate: number;
  absorption_rate: number;
  inventory_months: number;
  risk_level: string;
  market_condition: string;
  recommendation: string;
}

export interface RegionalComparison {
  region: string;
  opportunity_score: number;
  cap_rate: number;
  price_growth: number;
  rental_yield: number;
  vacancy_rate: number;
  risk_level: string;
  transaction_count: number;
}

export interface InvestmentRegionDetail {
  region: string;
  opportunities: InvestmentOpportunity[];
  summary: {
    avg_opportunity_score: number;
    best_type: string;
    total_transactions: number;
    avg_cap_rate: number;
    avg_price_growth: number;
  };
}

// ====================================================================
// SERVICE
// ====================================================================

class InvestmentScoringService {
  // ------------------------------------------------------------------
  // INVESTMENT OPPORTUNITIES
  // ------------------------------------------------------------------

  /**
   * Get scored investment opportunities.
   */
  async getOpportunities(opts: { region?: string; propertyType?: string }): Promise<InvestmentOpportunity[]> {
    return this.computeOpportunitiesLive(opts);
  }

  /**
   * Live computation from cap rate benchmarks, transactions, and income data.
   */
  private async computeOpportunitiesLive(opts: { region?: string; propertyType?: string }): Promise<InvestmentOpportunity[]> {
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

    const sql = `
      WITH cap_data AS (
        SELECT
          cb.region,
          cb.property_type::text AS property_type,
          COALESCE(cb.benchmark_cap_rate, cb.cap_rate_median, 0) AS cap_rate,
          COALESCE(cb.vacancy_rate_market, 0) AS vacancy,
          COALESCE(cb.absorption_rate, 0) AS absorption,
          COALESCE(cb.rent_growth_rate, 0) AS rent_growth,
          COALESCE(cb.yield_trend, 'stable') AS yield_trend,
          COALESCE(cb.market_condition, 'stable') AS market_condition,
          COALESCE(cb.risk_premium, 0) AS risk_premium
        FROM market_cap_rate_benchmarks cb
        WHERE 1=1 ${where}
      ),
      txn_growth AS (
        SELECT
          pt.property_region::text AS region,
          COALESCE(pt.property_type::text, 'residential') AS property_type,
          ROUND(AVG(pt.final_price)::numeric, 2) AS avg_price_cur,
          COUNT(*) AS txn_count
        FROM property_transactions pt
        WHERE pt.transaction_type = 'sale'
          AND pt.transaction_date >= CURRENT_DATE - INTERVAL '12 months'
          AND pt.final_price > 0
        GROUP BY pt.property_region, pt.property_type
      ),
      txn_prev AS (
        SELECT
          pt.property_region::text AS region,
          COALESCE(pt.property_type::text, 'residential') AS property_type,
          ROUND(AVG(pt.final_price)::numeric, 2) AS avg_price_prev
        FROM property_transactions pt
        WHERE pt.transaction_type = 'sale'
          AND pt.transaction_date >= CURRENT_DATE - INTERVAL '24 months'
          AND pt.transaction_date < CURRENT_DATE - INTERVAL '12 months'
          AND pt.final_price > 0
        GROUP BY pt.property_region, pt.property_type
      )
      SELECT
        cd.region, cd.property_type,
        cd.cap_rate, cd.vacancy, cd.absorption,
        cd.rent_growth, cd.market_condition, cd.risk_premium,
        COALESCE(tg.txn_count, 0) AS transaction_count,
        CASE
          WHEN COALESCE(tp.avg_price_prev, 0) > 0
          THEN ROUND(((tg.avg_price_cur - tp.avg_price_prev) / tp.avg_price_prev * 100)::numeric, 2)
          ELSE 0
        END AS price_growth_yoy,
        CASE
          WHEN COALESCE(tg.txn_count, 0) > 0
            AND (SELECT COUNT(*) FROM properties pp
                 WHERE pp.region::text = cd.region
                   AND pp.property_type::text = cd.property_type
                   AND pp.status = 'active') > 0
          THEN ROUND(((SELECT COUNT(*) FROM properties pp
                        WHERE pp.region::text = cd.region
                          AND pp.property_type::text = cd.property_type
                          AND pp.status = 'active')::numeric / tg.txn_count), 2)
          ELSE 0
        END AS inv_months
      FROM cap_data cd
      LEFT JOIN txn_growth tg ON LOWER(cd.region) = LOWER(tg.region)
        AND LOWER(cd.property_type) = LOWER(tg.property_type)
      LEFT JOIN txn_prev tp ON LOWER(cd.region) = LOWER(tp.region)
        AND LOWER(cd.property_type) = LOWER(tp.property_type)
      ORDER BY cd.cap_rate DESC NULLS LAST
    `;

    const result = await pool.query(sql, params);
    return result.rows.map((r: any) => {
      const capRate = parseFloat(r.cap_rate || '0');
      const priceGrowth = parseFloat(r.price_growth_yoy || '0');
      const rentGrowth = parseFloat(r.rent_growth || '0');
      const absorption = parseFloat(r.absorption || '0');
      const vacancy = parseFloat(r.vacancy || '0');
      const riskPremium = parseFloat(r.risk_premium || '0');

      // Score each factor 0-20, total 0-100
      const capScore = Math.min(20, capRate * 2);
      const priceScore = Math.min(20, Math.max(0, priceGrowth + 10)); // center at 10 = 0% growth
      const rentScore = Math.min(20, Math.max(0, rentGrowth * 2 + 10));
      const absScore = Math.min(20, absorption * 100);
      const riskScore = Math.max(0, 20 - (vacancy * 20) - (riskPremium * 5));

      const totalScore = Math.round(capScore + priceScore + rentScore + absScore + riskScore);
      const clampedScore = Math.min(100, Math.max(0, totalScore));

      let riskLevel = 'moderate';
      if (vacancy > 0.15 || riskPremium > 0.03) riskLevel = 'high';
      else if (vacancy < 0.05 && riskPremium < 0.01) riskLevel = 'low';

      let recommendation = 'Hold / Monitor';
      if (clampedScore >= 70) recommendation = 'Strong Buy';
      else if (clampedScore >= 55) recommendation = 'Buy';
      else if (clampedScore >= 40) recommendation = 'Hold';
      else recommendation = 'Caution';

      return {
        region: r.region,
        property_type: r.property_type,
        opportunity_score: clampedScore,
        opportunity_factors: {
          cap_rate_score: Math.round(capScore * 10) / 10,
          price_growth_score: Math.round(priceScore * 10) / 10,
          rental_yield_score: Math.round(rentScore * 10) / 10,
          absorption_score: Math.round(absScore * 10) / 10,
          risk_score: Math.round(riskScore * 10) / 10,
        },
        cap_rate: capRate,
        avg_price_growth_yoy: priceGrowth,
        avg_rental_growth_yoy: rentGrowth,
        vacancy_rate: vacancy,
        absorption_rate: absorption,
        inventory_months: parseFloat(r.inv_months || '0'),
        risk_level: riskLevel,
        market_condition: r.market_condition || 'stable',
        recommendation,
      };
    });
  }

  // ------------------------------------------------------------------
  // REGIONAL COMPARISON
  // ------------------------------------------------------------------

  /**
   * High-level regional comparison for the investment map.
   */
  async getRegionalComparison(): Promise<RegionalComparison[]> {
    try {
      const opps = await this.getOpportunities({});
      // Aggregate per region (across property types)
      const regionMap = new Map<string, {
        scores: number[]; capRates: number[]; priceGrowths: number[];
        yields: number[]; vacancies: number[]; risks: string[]; txns: number[];
      }>();

      for (const o of opps) {
        if (!regionMap.has(o.region)) {
          regionMap.set(o.region, {
            scores: [], capRates: [], priceGrowths: [],
            yields: [], vacancies: [], risks: [], txns: [],
          });
        }
        const m = regionMap.get(o.region)!;
        m.scores.push(o.opportunity_score);
        m.capRates.push(o.cap_rate);
        m.priceGrowths.push(o.avg_price_growth_yoy);
        m.yields.push(o.avg_rental_growth_yoy);
        m.vacancies.push(o.vacancy_rate);
        m.risks.push(o.risk_level);
        m.txns.push(0); // txn count aggregated separately
      }

      const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      const mode = (arr: string[]) => {
        const freq: Record<string, number> = {};
        arr.forEach(v => freq[v] = (freq[v] || 0) + 1);
        return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || 'moderate';
      };

      return Array.from(regionMap.entries()).map(([region, m]) => ({
        region,
        opportunity_score: Math.round(avg(m.scores)),
        cap_rate: Math.round(avg(m.capRates) * 100) / 100,
        price_growth: Math.round(avg(m.priceGrowths) * 100) / 100,
        rental_yield: Math.round(avg(m.yields) * 100) / 100,
        vacancy_rate: Math.round(avg(m.vacancies) * 1000) / 1000,
        risk_level: mode(m.risks),
        transaction_count: 0,
      })).sort((a, b) => b.opportunity_score - a.opportunity_score);
    } catch (err: any) {
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // REGION DETAIL
  // ------------------------------------------------------------------

  /**
   * Investment detail for a specific region.
   */
  async getRegionDetail(region: string): Promise<InvestmentRegionDetail | null> {
    try {
      const opportunities = await this.getOpportunities({ region });
      if (opportunities.length === 0) return null;

      const avgScore = Math.round(
        opportunities.reduce((s, o) => s + o.opportunity_score, 0) / opportunities.length
      );
      const best = opportunities.reduce((a, b) =>
        a.opportunity_score >= b.opportunity_score ? a : b
      );

      // Transaction count from property_transactions
      const txnResult = await pool.query(`
        SELECT COUNT(*) AS cnt
        FROM property_transactions
        WHERE LOWER(property_region::text) = LOWER($1)
          AND transaction_date >= CURRENT_DATE - INTERVAL '12 months'
      `, [region]);

      return {
        region,
        opportunities,
        summary: {
          avg_opportunity_score: avgScore,
          best_type: best.property_type,
          total_transactions: parseInt(txnResult.rows[0]?.cnt || '0', 10),
          avg_cap_rate: Math.round(
            opportunities.reduce((s, o) => s + o.cap_rate, 0) / opportunities.length * 100
          ) / 100,
          avg_price_growth: Math.round(
            opportunities.reduce((s, o) => s + o.avg_price_growth_yoy, 0) / opportunities.length * 100
          ) / 100,
        },
      };
    } catch (err: any) {
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // SNAPSHOT PERSIST
  // ------------------------------------------------------------------

  /**
   * Compute and persist investment opportunity scores.
   */
  async computeAndStoreSnapshot(date: Date): Promise<void> {
    const dateStr = date.toISOString().split('T')[0];
    logger.info('Computing investment opportunity snapshot', { date: dateStr });

    const opportunities = await this.computeOpportunitiesLive({});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const o of opportunities) {
        await client.query(`
          INSERT INTO investment_opportunity_metrics
            (region, property_type, period_date,
             opportunity_score, opportunity_factors,
             risk_score, risk_level, cap_rate,
             avg_price_growth_yoy, avg_rental_growth_yoy,
             vacancy_rate, absorption_rate, inventory_months,
             market_condition)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (region, property_type, period_date)
          DO UPDATE SET
            opportunity_score = EXCLUDED.opportunity_score,
            opportunity_factors = EXCLUDED.opportunity_factors,
            risk_score = EXCLUDED.risk_score,
            risk_level = EXCLUDED.risk_level,
            cap_rate = EXCLUDED.cap_rate,
            avg_price_growth_yoy = EXCLUDED.avg_price_growth_yoy,
            avg_rental_growth_yoy = EXCLUDED.avg_rental_growth_yoy,
            vacancy_rate = EXCLUDED.vacancy_rate,
            absorption_rate = EXCLUDED.absorption_rate,
            inventory_months = EXCLUDED.inventory_months,
            market_condition = EXCLUDED.market_condition
        `, [
          o.region, o.property_type, dateStr,
          o.opportunity_score, JSON.stringify(o.opportunity_factors),
          o.opportunity_factors.risk_score, o.risk_level, o.cap_rate,
          o.avg_price_growth_yoy, o.avg_rental_growth_yoy,
          o.vacancy_rate, o.absorption_rate, o.inventory_months,
          o.market_condition,
        ]);
      }
      await client.query('COMMIT');
      logger.info('Investment opportunity snapshot stored', { count: opportunities.length });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ------------------------------------------------------------------
  // helpers
  // ------------------------------------------------------------------

  private mapOpportunityRow(r: any): InvestmentOpportunity {
    const score = parseInt(r.opportunity_score || '0', 10);
    const factors = typeof r.opportunity_factors === 'string'
      ? JSON.parse(r.opportunity_factors)
      : (r.opportunity_factors || {});

    let recommendation = 'Hold / Monitor';
    if (score >= 70) recommendation = 'Strong Buy';
    else if (score >= 55) recommendation = 'Buy';
    else if (score >= 40) recommendation = 'Hold';
    else recommendation = 'Caution';

    return {
      region: r.region,
      property_type: r.property_type,
      opportunity_score: score,
      opportunity_factors: {
        cap_rate_score: factors.cap_rate_score || 0,
        price_growth_score: factors.price_growth_score || 0,
        rental_yield_score: factors.rental_yield_score || 0,
        absorption_score: factors.absorption_score || 0,
        risk_score: factors.risk_score || 0,
      },
      cap_rate: parseFloat(r.cap_rate || '0'),
      avg_price_growth_yoy: parseFloat(r.avg_price_growth_yoy || '0'),
      avg_rental_growth_yoy: parseFloat(r.avg_rental_growth_yoy || '0'),
      vacancy_rate: parseFloat(r.vacancy_rate || '0'),
      absorption_rate: parseFloat(r.absorption_rate || '0'),
      inventory_months: parseFloat(r.inventory_months || '0'),
      risk_level: r.risk_level || 'moderate',
      market_condition: r.market_condition || 'stable',
      recommendation,
    };
  }
}

export const investmentScoringService = new InvestmentScoringService();
