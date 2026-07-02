/**
 * Construction Cost Index Service
 *
 * Provides computation, aggregation, and querying for Ghana's
 * Construction Cost Index (CCI). Reads raw material/labor prices
 * from the data-hub tables and computes weighted composite indices
 * that get stored in `construction_cost_index_analytics`.
 *
 * Analytics.md Section 1 — Construction & Labour Analytics
 *
 * Component Weights (per spec):
 *   Materials: 55%
 *   Labor:     35%
 *   Overhead:  10%
 *
 * @module services/analytics/constructionCostIndexService
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { gssPpiService } from '../data-hub/scrapers/gssPpiService';
import { gssMiegService } from '../data-hub/scrapers/gssMiegService';
import { gssTradeService } from '../data-hub/scrapers/gssTradeService';

// ============================================================================
// TYPES
// ============================================================================

export interface CCISnapshot {
  period_date: string;
  period_type: string;
  region: string | null;
  index_value: number;
  base_value: number;
  base_date: string;
  materials_index: number;
  materials_weight: number;
  labor_index: number;
  labor_weight: number;
  overhead_index: number;
  overhead_weight: number;
  change_mom: number | null;
  change_qoq: number | null;
  change_yoy: number | null;
}

export interface CCINationalSummary {
  national_index: number;
  baseline_date: string;
  components: {
    materials: { value: number; weight: number; change_mom: number; change_yoy: number | null };
    labor: { value: number; weight: number; change_mom: number; change_yoy: number | null };
    overhead: { value: number; weight: number; change_mom: number; change_yoy: number | null };
  };
  regional_indices: Record<string, number>;
  historical_trend: Array<{ date: string; value: number }>;
  // GSS PPI enrichment (Slice 1) — present when gss_ppi_construction_series is populated
  ppi_construction_yoy?: number | null;
  ppi_construction_history?: Array<{ period_date: string; ppi_index: number | null; change_yoy_pct: number | null }>;
  // GSS Trade HS2 import pressure (Slice 2b) — present when gss_construction_material_imports is populated
  import_material_pressure?: Array<{ period_date: string; gcmipi: number | null; hs2_breakdown: Record<string, number | null> }> | null;
}

export interface RegionalCostComparison {
  region: string;
  multiplier: number;
  distance_from_port_km: number;
  transport_factor: number;
  infrastructure_score: number;
  cost_components: { materials: number; labor: number; transport: number };
  trend_6m: number;
  trend_12m: number;
}

export interface MaterialPriceTrend {
  category: string;
  sub_category: string | null;
  unit_price: number;
  currency: string;
  unit: string | null;
  region: string | null;
  effective_date: string;
  local_pct: number | null;
  import_pct: number | null;
  price_volatility: string | null;
  change_mom: number | null;
  change_yoy: number | null;
}

export interface LaborRateEntry {
  category: string;
  skill_level: string;
  daily_rate: number;
  monthly_rate: number | null;
  region: string | null;
  effective_date: string;
  yoy_change: number | null;
  supply_status: string | null;
}

// Default component weights
const MATERIALS_WEIGHT = 0.55;
const LABOR_WEIGHT = 0.35;
const OVERHEAD_WEIGHT = 0.10;
const BASE_INDEX = 100.0;
const BASE_DATE = '2024-01-01';

// ============================================================================
// SERVICE CLASS
// ============================================================================

class ConstructionCostIndexService {
  // ==========================================================================
  // NATIONAL CCI
  // ==========================================================================

  /**
   * Get latest national CCI summary with component breakdown,
   * regional indices, and 24-month historical trend.
   */
  async getNationalSummary(): Promise<CCINationalSummary | null> {
    try {
      // Latest national record
      const latest = await pool.query(
        `SELECT *
         FROM construction_cost_index_analytics
         WHERE region IS NULL
         ORDER BY period_date DESC
         LIMIT 1`,
      );
      if (latest.rows.length === 0) return null;

      const row = latest.rows[0];

      // Fetch latest GSS PPI Construction data to blend into materials sub-index.
      // α = 0.6 weight to authoritative GSS PPI, 0.4 to internal material prices.
      // When gss_ppi_construction_series is empty (before first sync), falls back to internal-only.
      let gssYoy: number | null = null;
      let blendedMaterialsIndex = parseFloat(row.materials_index || '0');
      try {
        const ppiLatest = await gssPpiService.getLatestConstructionPpi();
        if (ppiLatest && ppiLatest.ppi_index !== null) {
          // Blend: 60% GSS PPI, 40% internal materials index
          blendedMaterialsIndex = 0.6 * ppiLatest.ppi_index + 0.4 * parseFloat(row.materials_index || '0');
          gssYoy = ppiLatest.change_yoy_pct;
        }
      } catch (ppiErr: any) {
        logger.warn('CCI: GSS PPI fetch failed, using internal materials only', { error: ppiErr.message });
      }

      // Use GSS PPI yoy if available; otherwise use CCI stored yoy without the ±40% suppression.
      // The suppression guard is REMOVED now that we have an authoritative anchor.
      const rawYoY = gssYoy ?? parseFloat(row.change_yoy || '0');
      const yoy = Number.isFinite(rawYoY) ? rawYoY : null;

      // Regional indices for the same period
      const regional = await pool.query(
        `SELECT region, index_value
         FROM construction_cost_index_analytics
         WHERE period_date = $1 AND region IS NOT NULL
         ORDER BY index_value DESC`,
        [row.period_date],
      );

      const regionalIndices: Record<string, number> = {};
      for (const r of regional.rows) {
        regionalIndices[r.region] = parseFloat(r.index_value);
      }

      // Historical trend (24 months)
      const history = await pool.query(
        `SELECT period_date AS date, index_value AS value
         FROM construction_cost_index_analytics
         WHERE region IS NULL
         ORDER BY period_date ASC
         LIMIT 24`,
      );

      return {
        national_index: parseFloat(row.index_value),
        baseline_date: row.base_date || BASE_DATE,
        components: {
          materials: {
            value: blendedMaterialsIndex,
            weight: parseFloat(row.materials_weight || String(MATERIALS_WEIGHT)),
            change_mom: parseFloat(row.change_mom || '0'),
            change_yoy: yoy,
          },
          labor: {
            value: parseFloat(row.labor_index || '0'),
            weight: parseFloat(row.labor_weight || String(LABOR_WEIGHT)),
            change_mom: parseFloat(row.change_mom || '0'),
            change_yoy: yoy,
          },
          overhead: {
            value: parseFloat(row.overhead_index || '0'),
            weight: parseFloat(row.overhead_weight || String(OVERHEAD_WEIGHT)),
            change_mom: parseFloat(row.change_mom || '0'),
            change_yoy: yoy,
          },
        },
        regional_indices: regionalIndices,
        historical_trend: history.rows.map((r: any) => ({
          date: r.date,
          value: parseFloat(r.value),
        })),
        // GSS PPI enrichment — fetch history for frontend overlay chart
        ppi_construction_yoy: gssYoy,
        ppi_construction_history: await gssPpiService.getConstructionPpiHistory(24).catch(() => []),
        // GSS Trade HS2 import pressure (Slice 2b) — non-fatal if table not yet populated.
        // 36-month window: unit_value_index depends on FX + trade lag, so the latest
        // fully-computed period trails the current month by ~a year.
        import_material_pressure: await gssTradeService.getGcmipiHistory(36).catch(() => null),
      };
    } catch (err: any) {
      if (err.code === '42P01') {
        logger.warn('construction_cost_index_analytics table not found');
        return null;
      }
      logger.error('Error fetching national CCI summary', { error: err.message });
      throw err;
    }
  }

  /**
   * Get CCI history for a specific region or national.
   */
  async getHistory(
    region?: string,
    periodType: string = 'monthly',
    months: number = 24,
  ): Promise<CCISnapshot[]> {
    try {
      const params: any[] = [periodType, months];
      let regionClause = 'region IS NULL';
      if (region) {
        regionClause = 'LOWER(region) = LOWER($3)';
        params.push(region);
      }

      const result = await pool.query(
        `SELECT *
         FROM construction_cost_index_analytics
         WHERE ${regionClause}
           AND period_type = $1
         ORDER BY period_date DESC
         LIMIT $2`,
        params,
      );

      return result.rows.map((r: any) => ({
        period_date: r.period_date,
        period_type: r.period_type,
        region: r.region,
        index_value: parseFloat(r.index_value),
        base_value: parseFloat(r.base_value),
        base_date: r.base_date,
        materials_index: parseFloat(r.materials_index || '0'),
        materials_weight: parseFloat(r.materials_weight || '0'),
        labor_index: parseFloat(r.labor_index || '0'),
        labor_weight: parseFloat(r.labor_weight || '0'),
        overhead_index: parseFloat(r.overhead_index || '0'),
        overhead_weight: parseFloat(r.overhead_weight || '0'),
        change_mom: r.change_mom ? parseFloat(r.change_mom) : null,
        change_qoq: r.change_qoq ? parseFloat(r.change_qoq) : null,
        change_yoy: r.change_yoy ? parseFloat(r.change_yoy) : null,
      }));
    } catch (err: any) {
      if (err.code === '42P01') return [];
      throw err;
    }
  }

  // ==========================================================================
  // REGIONAL COST DATA
  // ==========================================================================

  /**
   * Get regional cost comparison matrix.
   * Reads from `regional_cost_data`.
   */
  async getRegionalComparison(region?: string): Promise<RegionalCostComparison[]> {
    try {
      let sql = `
        SELECT region, multiplier, distance_from_port_km, transport_factor,
               infrastructure_score, materials_cost, labor_cost, transport_cost,
               trend_6m, trend_12m
        FROM regional_cost_data
      `;
      const params: any[] = [];
      if (region) {
        sql += ' WHERE LOWER(region) = LOWER($1)';
        params.push(region);
      }
      sql += ' ORDER BY multiplier DESC';

      const result = await pool.query(sql, params);
      return result.rows.map((r: any) => ({
        region: r.region,
        multiplier: parseFloat(r.multiplier),
        distance_from_port_km: parseFloat(r.distance_from_port_km || '0'),
        transport_factor: parseFloat(r.transport_factor || '1'),
        infrastructure_score: parseFloat(r.infrastructure_score || '0'),
        cost_components: {
          materials: parseFloat(r.materials_cost || '0'),
          labor: parseFloat(r.labor_cost || '0'),
          transport: parseFloat(r.transport_cost || '0'),
        },
        trend_6m: parseFloat(r.trend_6m || '0'),
        trend_12m: parseFloat(r.trend_12m || '0'),
      }));
    } catch (err: any) {
      if (err.code === '42P01') return [];
      throw err;
    }
  }

  // ==========================================================================
  // MATERIAL PRICES
  // ==========================================================================

  /**
   * Get material price data with optional filtering.
   */
  async getMaterialPrices(opts?: {
    category?: string;
    region?: string;
    months?: number;
    limit?: number;
  }): Promise<MaterialPriceTrend[]> {
    try {
      const { category, region, months = 12, limit = 500 } = opts || {};
      const params: any[] = [];
      let paramIdx = 1;
      const conditions: string[] = [];

      if (category) {
        conditions.push(`LOWER(category::text) = LOWER($${paramIdx++})`)
        params.push(category);
      }
      if (region) {
        conditions.push(`LOWER(region) = LOWER($${paramIdx++})`);
        params.push(region);
      }
      conditions.push(`effective_date >= NOW() - INTERVAL '${months} months'`);

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await pool.query(
        `SELECT category, material_name, price_ghs, unit,
                region, effective_date, price_change_percent
         FROM material_prices
         ${where}
         ORDER BY effective_date DESC, category ASC
         LIMIT ${limit}`,
        params,
      );

      return result.rows.map((r: any) => ({
        category: r.category,
        sub_category: r.material_name,
        unit_price: parseFloat(r.price_ghs),
        currency: 'GHS',
        unit: r.unit,
        region: r.region,
        effective_date: r.effective_date,
        local_pct: null,
        import_pct: null,
        price_volatility: null,
        change_mom: r.price_change_percent ? parseFloat(r.price_change_percent) : null,
        change_yoy: null,
      }));
    } catch (err: any) {
      if (err.code === '42P01') return [];
      throw err;
    }
  }

  /**
   * Get material price summary grouped by category (latest prices).
   */
  async getMaterialSummary(): Promise<
    Array<{
      category: string;
      items: MaterialPriceTrend[];
      avg_change_yoy: number;
      volatility: string;
    }>
  > {
    try {
      const result = await pool.query(
        `SELECT DISTINCT ON (category, material_name)
                category, material_name, price_ghs, unit,
                region, effective_date, price_change_percent
         FROM material_prices
         WHERE region IS NULL OR region = 'greater_accra'
         ORDER BY category, material_name, effective_date DESC`,
      );

      const grouped = new Map<string, MaterialPriceTrend[]>();
      for (const r of result.rows) {
        const entry: MaterialPriceTrend = {
          category: r.category,
          sub_category: r.material_name,
          unit_price: parseFloat(r.price_ghs),
          currency: 'GHS',
          unit: r.unit,
          region: r.region,
          effective_date: r.effective_date,
          local_pct: null,
          import_pct: null,
          price_volatility: null,
          change_mom: r.price_change_percent ? parseFloat(r.price_change_percent) : null,
          change_yoy: null,
        };
        const arr = grouped.get(r.category) || [];
        arr.push(entry);
        grouped.set(r.category, arr);
      }

      return Array.from(grouped.entries()).map(([category, items]) => {
        const yoyValues = items.filter((i) => i.change_yoy !== null).map((i) => i.change_yoy!);
        const avgYoy = yoyValues.length > 0 ? yoyValues.reduce((a, b) => a + b, 0) / yoyValues.length : 0;
        const volatilities = items.map((i) => i.price_volatility).filter(Boolean);
        const predominantVolatility =
          volatilities.filter((v) => v === 'high').length > volatilities.length / 2
            ? 'high'
            : volatilities.filter((v) => v === 'medium').length > volatilities.length / 2
              ? 'medium'
              : 'low';

        return { category, items, avg_change_yoy: Math.round(avgYoy * 100) / 100, volatility: predominantVolatility };
      });
    } catch (err: any) {
      if (err.code === '42P01') return [];
      throw err;
    }
  }

  // ==========================================================================
  // LABOR RATES
  // ==========================================================================

  /**
   * Get labor rate data with optional filtering.
   */
  async getLaborRates(opts?: {
    category?: string;
    skillLevel?: string;
    region?: string;
    limit?: number;
  }): Promise<LaborRateEntry[]> {
    try {
      const { category, skillLevel, region, limit = 200 } = opts || {};
      const params: any[] = [];
      let paramIdx = 1;
      const conditions: string[] = [];

      if (category) {
        conditions.push(`LOWER(category::text) = LOWER($${paramIdx++})`);
        params.push(category);
      }
      if (skillLevel) {
        conditions.push(`LOWER(skill_level) = LOWER($${paramIdx++})`);
        params.push(skillLevel);
      }
      if (region) {
        conditions.push(`LOWER(region) = LOWER($${paramIdx++})`);
        params.push(region);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await pool.query(
        `SELECT category, skill_level, daily_rate_ghs, 
                daily_rate_ghs * 22 AS monthly_rate,
                region, effective_date, rate_change_percent
         FROM labor_rates
         ${where}
         ORDER BY effective_date DESC, category ASC
         LIMIT ${limit}`,
        params,
      );

      return result.rows.map((r: any) => ({
        category: r.category,
        skill_level: r.skill_level,
        daily_rate: parseFloat(r.daily_rate_ghs),
        monthly_rate: r.monthly_rate ? parseFloat(r.monthly_rate) : null,
        region: r.region,
        effective_date: r.effective_date,
        yoy_change: r.rate_change_percent ? parseFloat(r.rate_change_percent) : null,
        supply_status: null,
      }));
    } catch (err: any) {
      if (err.code === '42P01') return [];
      throw err;
    }
  }

  // ==========================================================================
  // CCI FORECASTING (linear regression on historical data)
  // ==========================================================================

  /**
   * Forecast CCI values using weighted linear regression on historical snapshots.
   * Returns point estimates with confidence intervals for each forecast month.
   *
   * @param region - Region to forecast (null = national)
   * @param horizonMonths - Number of months to project (default 6)
   * @param historyMonths - Number of historical months used for regression (default 24)
   */
  async forecastCCI(
    region?: string,
    horizonMonths: number = 6,
    historyMonths: number = 24,
  ): Promise<{
    region: string | null;
    horizon_months: number;
    forecast: Array<{
      period_date: string;
      predicted_index: number;
      lower_bound: number;
      upper_bound: number;
      confidence: number;
    }>;
    model_info: {
      method: string;
      data_points: number;
      r_squared: number;
      trend_direction: string;
      monthly_change_rate: number;
    };
    component_forecasts: {
      materials: Array<{ period_date: string; predicted: number }>;
      labor: Array<{ period_date: string; predicted: number }>;
      overhead: Array<{ period_date: string; predicted: number }>;
    };
  } | null> {
    try {
      // Try region-specific data first, fall back to national (region IS NULL)
      let regionClause = region ? 'region = $1' : 'region IS NULL';
      let params: any[] = region ? [region, historyMonths] : [historyMonths];

      let history = await pool.query(
        `SELECT period_date, index_value, materials_index, labor_index, overhead_index,
                change_mom, change_yoy
         FROM construction_cost_index_analytics
         WHERE ${regionClause} AND period_type = 'monthly'
         ORDER BY period_date DESC
         LIMIT $${region ? 2 : 1}`,
        params,
      );

      // Fall back to national data if region-specific has < 3 rows
      if (history.rows.length < 3 && region) {
        logger.info('No region-specific CCI data, falling back to national', { region });
        regionClause = 'region IS NULL';
        params = [historyMonths];
        history = await pool.query(
          `SELECT period_date, index_value, materials_index, labor_index, overhead_index,
                  change_mom, change_yoy
           FROM construction_cost_index_analytics
           WHERE ${regionClause} AND period_type = 'monthly'
           ORDER BY period_date DESC
           LIMIT $1`,
          params,
        );
      }

      if (history.rows.length < 3) {
        logger.warn('Insufficient CCI history for forecasting', { region, dataPoints: history.rows.length });
        return null;
      }

      // Reverse to chronological order
      const data = history.rows.reverse();
      const n = data.length;

      // Weighted linear regression (recent points weighted higher)
      const regression = (values: number[]) => {
        const m = values.length;
        let sumW = 0, sumWX = 0, sumWY = 0, sumWXX = 0, sumWXY = 0;
        for (let i = 0; i < m; i++) {
          const w = 1 + i * 0.5; // linearly increasing weights
          sumW += w;
          sumWX += w * i;
          sumWY += w * values[i];
          sumWXX += w * i * i;
          sumWXY += w * i * values[i];
        }
        const denom = sumW * sumWXX - sumWX * sumWX;
        if (Math.abs(denom) < 1e-10) return { slope: 0, intercept: values[m - 1] || 0, rSquared: 0 };

        const slope = (sumW * sumWXY - sumWX * sumWY) / denom;
        const intercept = (sumWY - slope * sumWX) / sumW;

        // R² calculation
        const meanY = values.reduce((a, b) => a + b, 0) / m;
        let ssTot = 0, ssRes = 0;
        for (let i = 0; i < m; i++) {
          const predicted = intercept + slope * i;
          ssRes += (values[i] - predicted) ** 2;
          ssTot += (values[i] - meanY) ** 2;
        }
        const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
        return { slope, intercept, rSquared };
      };

      // Residual standard error for confidence intervals
      const computeStdError = (values: number[], slope: number, intercept: number): number => {
        const m = values.length;
        if (m <= 2) return 0;
        let ssRes = 0;
        for (let i = 0; i < m; i++) {
          ssRes += (values[i] - (intercept + slope * i)) ** 2;
        }
        return Math.sqrt(ssRes / (m - 2));
      };

      const indexValues = data.map((r: any) => parseFloat(r.index_value));
      const materialsValues = data.map((r: any) => parseFloat(r.materials_index || '0'));
      const laborValues = data.map((r: any) => parseFloat(r.labor_index || '0'));
      const overheadValues = data.map((r: any) => parseFloat(r.overhead_index || '0'));

      const indexReg = regression(indexValues);
      const materialsReg = regression(materialsValues);
      const laborReg = regression(laborValues);
      const overheadReg = regression(overheadValues);
      const stdError = computeStdError(indexValues, indexReg.slope, indexReg.intercept);

      // Generate forecasts
      const lastDate = new Date(data[n - 1].period_date);
      const forecast: Array<{
        period_date: string;
        predicted_index: number;
        lower_bound: number;
        upper_bound: number;
        confidence: number;
      }> = [];
      const materialsForecast: Array<{ period_date: string; predicted: number }> = [];
      const laborForecast: Array<{ period_date: string; predicted: number }> = [];
      const overheadForecast: Array<{ period_date: string; predicted: number }> = [];

      for (let h = 1; h <= horizonMonths; h++) {
        const futureDate = new Date(lastDate);
        futureDate.setMonth(futureDate.getMonth() + h);
        const dateStr = futureDate.toISOString().slice(0, 10);
        const x = n - 1 + h;

        const predicted = Math.round((indexReg.intercept + indexReg.slope * x) * 100) / 100;
        // Widen confidence interval as we project further out
        const marginFactor = 1.96 * stdError * Math.sqrt(1 + (1 / n) + ((x - (n - 1) / 2) ** 2) / (n * n));
        const confidence = Math.max(0.5, 0.95 - h * 0.02); // degrades with horizon

        forecast.push({
          period_date: dateStr,
          predicted_index: Math.max(predicted, 0),
          lower_bound: Math.max(Math.round((predicted - marginFactor) * 100) / 100, 0),
          upper_bound: Math.round((predicted + marginFactor) * 100) / 100,
          confidence: Math.round(confidence * 100) / 100,
        });

        materialsForecast.push({
          period_date: dateStr,
          predicted: Math.max(Math.round((materialsReg.intercept + materialsReg.slope * x) * 100) / 100, 0),
        });
        laborForecast.push({
          period_date: dateStr,
          predicted: Math.max(Math.round((laborReg.intercept + laborReg.slope * x) * 100) / 100, 0),
        });
        overheadForecast.push({
          period_date: dateStr,
          predicted: Math.max(Math.round((overheadReg.intercept + overheadReg.slope * x) * 100) / 100, 0),
        });
      }

      const monthlyChangeRate = indexValues.length > 1
        ? ((indexValues[indexValues.length - 1] - indexValues[0]) / indexValues[0]) / (indexValues.length - 1) * 100
        : 0;

      return {
        region: region || null,
        horizon_months: horizonMonths,
        forecast,
        model_info: {
          method: 'weighted_linear_regression',
          data_points: n,
          r_squared: Math.round(indexReg.rSquared * 10000) / 10000,
          trend_direction: indexReg.slope > 0.5 ? 'rising' : indexReg.slope < -0.5 ? 'falling' : 'stable',
          monthly_change_rate: Math.round(monthlyChangeRate * 1000) / 1000,
        },
        component_forecasts: {
          materials: materialsForecast,
          labor: laborForecast,
          overhead: overheadForecast,
        },
      };
    } catch (err: any) {
      if (err.code === '42P01') return null;
      logger.error('Error forecasting CCI', { error: err.message, region });
      throw err;
    }
  }

  // ==========================================================================
  // CCI COMPUTATION (from raw data-hub prices)
  // ==========================================================================

  /**
   * Compute and store a new CCI snapshot from raw material & labor prices.
   * This is the main aggregation function run on a schedule (e.g., monthly).
   *
   * Algorithm:
   * 1. Read latest material prices from `material_prices`
   * 2. Read latest labor rates from `labor_rates`
   * 3. Compute weighted material index
   * 4. Compute weighted labor index
   * 5. Compute overhead index (derived)
   * 6. Compute composite CCI
   * 7. Store in `construction_cost_index_analytics`
   */
  async computeAndStoreSnapshot(
    periodDate: Date = new Date(),
    periodType: string = 'monthly',
  ): Promise<CCISnapshot | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Material index — base-100 index of per-category PRICE RELATIVES (latest price level vs the
      // base period). NOTE: the scraper writes raw prices but leaves `price_change_percent` = 0 on
      // every row, so the old `AVG(price_change_percent)` formula always produced 100. We instead
      // derive the movement from the actual scraped price history. Averaging per-category relatives
      // (not raw prices) keeps the index robust to basket-composition changes between scrapes.
      const materials = await client.query(
        `WITH base AS (
           SELECT category, AVG(price_ghs) AS p
           FROM material_prices
           WHERE effective_date = (SELECT MIN(effective_date) FROM material_prices)
             AND (region IS NULL OR region = 'greater_accra')
           GROUP BY category
         ),
         curr AS (
           SELECT category, AVG(price_ghs) AS p
           FROM material_prices
           WHERE effective_date = (SELECT MAX(effective_date) FROM material_prices)
             AND (region IS NULL OR region = 'greater_accra')
           GROUP BY category
         )
         SELECT AVG(100.0 * c.p / NULLIF(b.p, 0)) AS index_value,
                (SELECT MIN(effective_date) FROM material_prices) AS base_date
         FROM curr c JOIN base b USING (category)
         WHERE b.p > 0`,
      );

      // Labor index — same per-category base-100 relative approach on daily rates.
      const labor = await client.query(
        `WITH base AS (
           SELECT category, AVG(daily_rate_ghs) AS p
           FROM labor_rates
           WHERE effective_date = (SELECT MIN(effective_date) FROM labor_rates)
             AND (region IS NULL OR region = 'greater_accra')
           GROUP BY category
         ),
         curr AS (
           SELECT category, AVG(daily_rate_ghs) AS p
           FROM labor_rates
           WHERE effective_date = (SELECT MAX(effective_date) FROM labor_rates)
             AND (region IS NULL OR region = 'greater_accra')
           GROUP BY category
         )
         SELECT AVG(100.0 * c.p / NULLIF(b.p, 0)) AS index_value
         FROM curr c JOIN base b USING (category)
         WHERE b.p > 0`,
      );

      const matIdxRaw = parseFloat(materials.rows[0]?.index_value);
      const laborIdxRaw = parseFloat(labor.rows[0]?.index_value);
      if (!Number.isFinite(matIdxRaw) && !Number.isFinite(laborIdxRaw)) {
        await client.query('ROLLBACK');
        logger.warn('No material/labor price data available for CCI computation');
        return null;
      }
      // A missing component defaults to the base (100, neutral) so it doesn't distort the composite.
      const materialsIndex = Number.isFinite(matIdxRaw) ? matIdxRaw : BASE_INDEX;
      const laborIndex = Number.isFinite(laborIdxRaw) ? laborIdxRaw : BASE_INDEX;
      const baseDate = materials.rows[0]?.base_date || BASE_DATE;

      // Overhead index = blended from material + labor (derived)
      const overheadIndex = materialsIndex * 0.4 + laborIndex * 0.6;

      // Composite CCI
      const compositeIndex =
        materialsIndex * MATERIALS_WEIGHT + laborIndex * LABOR_WEIGHT + overheadIndex * OVERHEAD_WEIGHT;

      // Get the previous PERIOD's index for MoM change — strictly earlier than the one being
      // computed, so a same-day recompute compares against the prior period, not itself.
      const prev = await client.query(
        `SELECT index_value
         FROM construction_cost_index_analytics
         WHERE region IS NULL AND period_type = $1 AND period_date < $2::DATE
         ORDER BY period_date DESC
         LIMIT 1`,
        [periodType, periodDate.toISOString().slice(0, 10)],
      );
      const prevValue = prev.rows.length > 0 ? parseFloat(prev.rows[0].index_value) : null;
      const changeMom = prevValue ? ((compositeIndex - prevValue) / prevValue) * 100 : null;

      // Get YoY value
      const yoyRow = await client.query(
        `SELECT index_value
         FROM construction_cost_index_analytics
         WHERE region IS NULL
           AND period_type = $1
           AND period_date <= $2::DATE - INTERVAL '11 months'
         ORDER BY period_date DESC
         LIMIT 1`,
        [periodType, periodDate.toISOString().slice(0, 10)],
      );
      const yoyValue = yoyRow.rows.length > 0 ? parseFloat(yoyRow.rows[0].index_value) : null;
      const changeYoy = yoyValue ? ((compositeIndex - yoyValue) / yoyValue) * 100 : null;

      const dateStr = periodDate.toISOString().slice(0, 10);

      // Remove any existing national row(s) for this period FIRST. National rows use region=NULL,
      // and a UNIQUE(period_date, period_type, region) constraint does NOT dedupe NULLs in Postgres,
      // so plain re-runs accumulated duplicate national rows. Deleting first guarantees exactly one.
      await client.query(
        `DELETE FROM construction_cost_index_analytics
         WHERE region IS NULL AND period_date = $1 AND period_type = $2`,
        [dateStr, periodType],
      );

      // Insert national record
      const result = await client.query(
        `INSERT INTO construction_cost_index_analytics (
           period_date, period_type, region,
           index_value, base_value, base_date,
           materials_index, materials_weight,
           labor_index, labor_weight,
           overhead_index, overhead_weight,
           change_mom, change_yoy
         ) VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (period_date, period_type, region)
         DO UPDATE SET
           index_value = EXCLUDED.index_value,
           materials_index = EXCLUDED.materials_index,
           labor_index = EXCLUDED.labor_index,
           overhead_index = EXCLUDED.overhead_index,
           change_mom = EXCLUDED.change_mom,
           change_yoy = EXCLUDED.change_yoy
         RETURNING *`,
        [
          dateStr,
          periodType,
          Math.round(compositeIndex * 100) / 100,
          BASE_INDEX,
          baseDate,
          Math.round(materialsIndex * 100) / 100,
          MATERIALS_WEIGHT,
          Math.round(laborIndex * 100) / 100,
          LABOR_WEIGHT,
          Math.round(overheadIndex * 100) / 100,
          OVERHEAD_WEIGHT,
          changeMom !== null ? Math.round(changeMom * 1000) / 1000 : null,
          changeYoy !== null ? Math.round(changeYoy * 1000) / 1000 : null,
        ],
      );

      await client.query('COMMIT');

      const row = result.rows[0];
      logger.info('CCI snapshot computed', {
        period_date: dateStr,
        index_value: compositeIndex,
        change_mom: changeMom,
      });

      return {
        period_date: row.period_date,
        period_type: row.period_type,
        region: row.region,
        index_value: parseFloat(row.index_value),
        base_value: parseFloat(row.base_value),
        base_date: row.base_date,
        materials_index: parseFloat(row.materials_index),
        materials_weight: parseFloat(row.materials_weight),
        labor_index: parseFloat(row.labor_index),
        labor_weight: parseFloat(row.labor_weight),
        overhead_index: parseFloat(row.overhead_index),
        overhead_weight: parseFloat(row.overhead_weight),
        change_mom: changeMom !== null ? Math.round(changeMom * 1000) / 1000 : null,
        change_qoq: null,
        change_yoy: changeYoy !== null ? Math.round(changeYoy * 1000) / 1000 : null,
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      logger.error('Error computing CCI snapshot', { error: err.message });
      throw err;
    } finally {
      client.release();
    }
  }
}

// Singleton
export const constructionCostIndexService = new ConstructionCostIndexService();
