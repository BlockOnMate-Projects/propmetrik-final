/**
 * Ghana Housing Affordability Index (GHAI) Service
 *
 * Implements the multi-dimensional affordability index from
 * Analytics.md Section 2. Computes three core sub-indices:
 *
 *   MHAI — Mortgage-Based Housing Affordability Index
 *   CHAI — Cash-Based Housing Affordability Index
 *   RHAI — Rental Affordability Index
 *
 * Plus three supplementary indices:
 *   CAI  — Construction Affordability Index
 *   LAI  — Land Affordability Index
 *   MAS  — Mortgage Accessibility Score
 *
 * Composite: GHAI = w₁(MHAI) + w₂(CHAI) + w₃(RHAI)
 * Weights vary by region based on actual transaction mix.
 *
 * @module services/analytics/ghaiService
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface MHAIParams {
  downPaymentPct: number;   // 0.25 = 25%
  qualifyingRatio: number;  // 0.35 = 35% of income
  tenorMonths: number;      // 180 = 15 years
  propertyTaxRate: number;  // 0.001
  insuranceRate: number;    // 0.003
}

export interface GHAIResult {
  region: string;
  ghai_composite: number;
  ghai_category: string;
  mhai: number;
  chai: number;
  rhai: number;
  mortgage_weight: number;
  cash_weight: number;
  rental_weight: number;
  cai: number;
  lai: number;
  mas: number;
  median_property_price: number;
  median_household_income: number;
  mortgage_rate: number;
  median_monthly_rent: number;
  trend_direction: string;
  change_mom: number;
  change_yoy: number;
}

export interface GHAIHistoryEntry {
  calculation_date: string;
  ghai_composite: number;
  mhai: number;
  chai: number;
  rhai: number;
  ghai_category: string;
}

export interface RegionalInputData {
  region: string;
  median_property_price: number;
  median_household_income: number;
  mortgage_rate: number;           // Annual rate as decimal, e.g. 0.285
  median_monthly_rent: number;
  land_price_per_sqm?: number;
  construction_cost_per_sqm?: number;
  formal_employment_pct?: number;  // % of population in formal sector
}

// ============================================================================
// REGIONAL WEIGHT MATRIX (from Analytics.md Section 2.2)
// ============================================================================

interface RegionWeights {
  mortgage: number;
  cash: number;
  rental: number;
}

const REGIONAL_WEIGHTS: Record<string, RegionWeights> = {
  greater_accra:  { mortgage: 0.25, cash: 0.45, rental: 0.30 },
  ashanti:        { mortgage: 0.15, cash: 0.55, rental: 0.30 },
  kumasi_metro:   { mortgage: 0.15, cash: 0.55, rental: 0.30 },
  eastern:        { mortgage: 0.10, cash: 0.60, rental: 0.30 },
  western:        { mortgage: 0.12, cash: 0.58, rental: 0.30 },
  western_cluster:{ mortgage: 0.12, cash: 0.58, rental: 0.30 },
  northern:       { mortgage: 0.05, cash: 0.65, rental: 0.30 },
  northern_cluster:{ mortgage: 0.05, cash: 0.65, rental: 0.30 },
  central:        { mortgage: 0.08, cash: 0.62, rental: 0.30 },
  volta:          { mortgage: 0.07, cash: 0.63, rental: 0.30 },
  upper_east:     { mortgage: 0.05, cash: 0.65, rental: 0.30 },
  upper_west:     { mortgage: 0.05, cash: 0.65, rental: 0.30 },
  bono:           { mortgage: 0.08, cash: 0.62, rental: 0.30 },
  ahafo:          { mortgage: 0.07, cash: 0.63, rental: 0.30 },
  bono_east:      { mortgage: 0.07, cash: 0.63, rental: 0.30 },
  north_east:     { mortgage: 0.05, cash: 0.65, rental: 0.30 },
  savannah:       { mortgage: 0.05, cash: 0.65, rental: 0.30 },
  oti:            { mortgage: 0.06, cash: 0.64, rental: 0.30 },
  western_north:  { mortgage: 0.08, cash: 0.62, rental: 0.30 },
};

// Default MHAI parameters (Ghana standard)
const DEFAULT_MHAI_PARAMS: MHAIParams = {
  downPaymentPct: 0.25,
  qualifyingRatio: 0.35,
  tenorMonths: 180,        // 15-year standard
  propertyTaxRate: 0.001,
  insuranceRate: 0.003,
};

// ============================================================================
// CALCULATION HELPERS
// ============================================================================

/**
 * Calculate monthly mortgage payment (principal + interest).
 */
function monthlyPayment(principal: number, annualRate: number, months: number): number {
  const r = annualRate / 12;
  if (r === 0) return principal / months;
  return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

/**
 * Calculate total monthly housing cost including tax and insurance.
 */
function monthlyHousingCost(
  propertyPrice: number,
  annualRate: number,
  params: MHAIParams = DEFAULT_MHAI_PARAMS,
): number {
  const loanAmount = propertyPrice * (1 - params.downPaymentPct);
  const mortgage = monthlyPayment(loanAmount, annualRate, params.tenorMonths);
  const tax = (propertyPrice * params.propertyTaxRate) / 12;
  const insurance = (propertyPrice * params.insuranceRate) / 12;
  return mortgage + tax + insurance;
}

/**
 * MHAI: Mortgage-Based Housing Affordability Index
 *
 * MHAI = (medianHouseholdIncome / qualifyingIncome) × 100
 * qualifyingIncome = (monthlyHousing / qualifyingRatio) × 12
 *
 * ≥ 100 = affordable, < 50 = severely unaffordable
 */
function calculateMHAI(
  medianPropertyPrice: number,
  medianHouseholdIncome: number,
  mortgageRate: number,
  params: MHAIParams = DEFAULT_MHAI_PARAMS,
): number {
  const housing = monthlyHousingCost(medianPropertyPrice, mortgageRate, params);
  const qualifyingIncome = (housing / params.qualifyingRatio) * 12;
  return (medianHouseholdIncome / qualifyingIncome) * 100;
}

/**
 * CHAI: Cash-Based Housing Affordability Index
 *
 * CHAI = (savingsHorizon / yearsToSave) × 100
 * yearsToSave = medianPropertyPrice / (income × savingsRate)
 *
 * ≥ 100 = achievable within 10 years
 */
function calculateCHAI(
  medianPropertyPrice: number,
  medianHouseholdIncome: number,
  savingsRate: number = 0.20,
  savingsHorizonYears: number = 10,
): { chai: number; yearsToSave: number; pir: number } {
  const annualSavings = medianHouseholdIncome * savingsRate;
  const yearsToSave = annualSavings > 0 ? medianPropertyPrice / annualSavings : Infinity;
  const pir = medianHouseholdIncome > 0 ? medianPropertyPrice / medianHouseholdIncome : Infinity;
  const chai = yearsToSave > 0 ? (savingsHorizonYears / yearsToSave) * 100 : 0;
  return { chai: Math.min(chai, 200), yearsToSave, pir };
}

/**
 * RHAI: Rental Affordability Index
 *
 * RHAI = (targetRatio / rentToIncomeRatio) × 100
 * target = 30% of monthly income
 *
 * ≥ 100 = affordable (< 30% burden)
 */
function calculateRHAI(
  medianMonthlyRent: number,
  medianMonthlyIncome: number,
): { rhai: number; rentToIncomeRatio: number } {
  const rentToIncomeRatio = medianMonthlyIncome > 0 ? medianMonthlyRent / medianMonthlyIncome : 1;
  const targetRatio = 0.30;
  const rhai = rentToIncomeRatio > 0 ? (targetRatio / rentToIncomeRatio) * 100 : 0;
  return { rhai: Math.min(rhai, 200), rentToIncomeRatio };
}

/**
 * CAI: Construction Affordability Index
 * Can you afford to build rather than buy?
 * CAI = (income × horizon × savingsRate) / (landCost + constructionCost) × 100
 */
function calculateCAI(
  medianHouseholdIncome: number,
  landPricePerSqm: number,
  constructionCostPerSqm: number,
  plotSizeSqm: number = 465,     // ≈ 5000 sqft (standard Ghana plot)
  buildingSizeSqm: number = 150, // Standard 3-bed
  savingsRate: number = 0.20,
  horizonYears: number = 10,
): number {
  const totalLandCost = landPricePerSqm * plotSizeSqm;
  const totalBuildCost = constructionCostPerSqm * buildingSizeSqm;
  const totalCost = totalLandCost + totalBuildCost;
  const availableSavings = medianHouseholdIncome * savingsRate * horizonYears;
  return totalCost > 0 ? (availableSavings / totalCost) * 100 : 0;
}

/**
 * LAI: Land Affordability Index
 * Track land price trends relative to income.
 * LAI = (income × horizon × savingsRate) / plotCost × 100
 */
function calculateLAI(
  medianHouseholdIncome: number,
  landPricePerSqm: number,
  plotSizeSqm: number = 465,
  savingsRate: number = 0.20,
  horizonYears: number = 5,
): number {
  const plotCost = landPricePerSqm * plotSizeSqm;
  const available = medianHouseholdIncome * savingsRate * horizonYears;
  return plotCost > 0 ? (available / plotCost) * 100 : 0;
}

/**
 * MAS: Mortgage Accessibility Score
 * % of households that can qualify for a mortgage.
 * Based on formal employment rate + income threshold.
 */
function calculateMAS(formalEmploymentPct: number = 15): number {
  // Ghana-specific: only formal sector can access mortgages
  // Of formal workers, ~30% earn enough to qualify
  return Math.round(formalEmploymentPct * 0.30 * 10) / 10;
}

/**
 * Classify GHAI composite into a category.
 */
function classifyGHAI(composite: number): string {
  if (composite >= 100) return 'affordable';
  if (composite >= 80) return 'moderate';
  if (composite >= 50) return 'unaffordable';
  return 'severely_unaffordable';
}

/**
 * Determine trend direction from change value.
 */
function trendDirection(changeMom: number): string {
  if (changeMom > 0.5) return 'improving';
  if (changeMom < -0.5) return 'declining';
  return 'stable';
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class GHAIService {
  // ==========================================================================
  // READ OPERATIONS
  // ==========================================================================

  /**
   * Get latest GHAI values for all regions or a specific region.
   */
  async getCurrent(region?: string): Promise<GHAIResult[]> {
    try {
      let sql = `
        SELECT *
        FROM housing_affordability_index
        WHERE calculation_date = (SELECT MAX(calculation_date) FROM housing_affordability_index)
      `;
      const params: any[] = [];
      if (region) {
        sql += ' AND LOWER(region) = LOWER($1)';
        params.push(region);
      }
      sql += ' ORDER BY ghai_composite ASC';

      const result = await pool.query(sql, params);
      return result.rows.map(this.mapRow);
    } catch (err: any) {
      if (err.code === '42P01') return [];
      throw err;
    }
  }

  /**
   * Get GHAI history for a region.
   */
  async getHistory(region: string, months: number = 24): Promise<GHAIHistoryEntry[]> {
    try {
      const result = await pool.query(
        `SELECT calculation_date, ghai_composite, mhai, chai, rhai, ghai_category
         FROM housing_affordability_index
         WHERE LOWER(region) = LOWER($1)
         ORDER BY calculation_date DESC
         LIMIT $2`,
        [region, months],
      );
      return result.rows.map((r: any) => ({
        calculation_date: r.calculation_date,
        ghai_composite: parseFloat(r.ghai_composite),
        mhai: parseFloat(r.mhai || '0'),
        chai: parseFloat(r.chai || '0'),
        rhai: parseFloat(r.rhai || '0'),
        ghai_category: r.ghai_category,
      }));
    } catch (err: any) {
      if (err.code === '42P01') return [];
      throw err;
    }
  }

  /**
   * Get GHAI comparison across all regions (latest).
   */
  async getRegionalComparison(): Promise<GHAIResult[]> {
    return this.getCurrent();
  }

  /**
   * Get supplementary indices for a region.
   */
  async getSupplementaryIndices(region: string): Promise<{
    cai: number;
    lai: number;
    mas: number;
    region: string;
  } | null> {
    try {
      const result = await pool.query(
        `SELECT cai, lai, mas, region
         FROM housing_affordability_index
         WHERE LOWER(region) = LOWER($1)
         ORDER BY calculation_date DESC
         LIMIT 1`,
        [region],
      );
      if (result.rows.length === 0) return null;
      const r = result.rows[0];
      return {
        cai: parseFloat(r.cai || '0'),
        lai: parseFloat(r.lai || '0'),
        mas: parseFloat(r.mas || '0'),
        region: r.region,
      };
    } catch (err: any) {
      if (err.code === '42P01') return null;
      throw err;
    }
  }

  // ==========================================================================
  // GHAI FORECASTING
  // ==========================================================================

  /**
   * Forecast GHAI values using weighted linear regression on historical data.
   * Projects composite GHAI plus sub-indices (MHAI, CHAI, RHAI) for each region.
   *
   * @param region - Region to forecast
   * @param horizonMonths - Number of months to project (default 6)
   * @param historyMonths - Historical months used for regression (default 24)
   */
  async forecastGHAI(
    region: string,
    horizonMonths: number = 6,
    historyMonths: number = 24,
  ): Promise<{
    region: string;
    horizon_months: number;
    current_ghai: number;
    current_category: string;
    forecast: Array<{
      period_date: string;
      predicted_ghai: number;
      lower_bound: number;
      upper_bound: number;
      predicted_category: string;
      confidence: number;
    }>;
    sub_index_forecasts: {
      mhai: Array<{ period_date: string; predicted: number }>;
      chai: Array<{ period_date: string; predicted: number }>;
      rhai: Array<{ period_date: string; predicted: number }>;
    };
    model_info: {
      method: string;
      data_points: number;
      r_squared: number;
      trend_direction: string;
      monthly_change_rate: number;
    };
  } | null> {
    try {
      let history = await pool.query(
        `SELECT calculation_date, ghai_composite, mhai, chai, rhai, ghai_category
         FROM housing_affordability_index
         WHERE LOWER(region) = LOWER($1)
         ORDER BY calculation_date DESC
         LIMIT $2`,
        [region, historyMonths],
      );

      // Fall back to all-region average if region-specific data < 3 rows
      if (history.rows.length < 3) {
        logger.info('Insufficient region GHAI data, falling back to all-region average', { region, rows: history.rows.length });
        history = await pool.query(
          `SELECT calculation_date,
                  AVG(ghai_composite) as ghai_composite,
                  AVG(mhai) as mhai,
                  AVG(chai) as chai,
                  AVG(rhai) as rhai,
                  (ARRAY_AGG(ghai_category ORDER BY ghai_composite DESC))[1] as ghai_category
           FROM housing_affordability_index
           GROUP BY calculation_date
           ORDER BY calculation_date DESC
           LIMIT $1`,
          [historyMonths],
        );
      }

      if (history.rows.length < 3) {
        // Not enough for regression — generate flat projection from current data
        if (history.rows.length >= 1) {
          logger.info('Only 1-2 GHAI points, generating flat projection', { region, rows: history.rows.length });
          const current = history.rows[0];
          const ghai = parseFloat(current.ghai_composite);
          const mhai = parseFloat(current.mhai);
          const chai = parseFloat(current.chai);
          const rhai = parseFloat(current.rhai);
          const category = current.ghai_category || 'unknown';
          const forecast = [];
          const mhaiForecast = [];
          const chaiForecast = [];
          const rhaiForecast = [];
          const baseDate = new Date(current.calculation_date);
          for (let i = 1; i <= horizonMonths; i++) {
            const futureDate = new Date(baseDate);
            futureDate.setMonth(futureDate.getMonth() + i);
            const dateStr = futureDate.toISOString().split('T')[0];
            forecast.push({
              period_date: dateStr,
              predicted_ghai: ghai,
              lower_bound: Math.max(0, ghai * 0.95),
              upper_bound: Math.min(100, ghai * 1.05),
              predicted_category: category,
              confidence: 0.5,
            });
            mhaiForecast.push({ period_date: dateStr, predicted: mhai });
            chaiForecast.push({ period_date: dateStr, predicted: chai });
            rhaiForecast.push({ period_date: dateStr, predicted: rhai });
          }
          return {
            region,
            horizon_months: horizonMonths,
            current_ghai: ghai,
            current_category: category,
            forecast,
            sub_index_forecasts: { mhai: mhaiForecast, chai: chaiForecast, rhai: rhaiForecast },
            model_info: {
              method: 'flat_projection',
              data_points: history.rows.length,
              r_squared: 0,
              trend_direction: 'stable',
              monthly_change_rate: 0,
            },
          };
        }
        logger.warn('Insufficient GHAI history for forecasting', { region, dataPoints: history.rows.length });
        return null;
      }

      // Reverse to chronological order
      const data = history.rows.reverse();
      const n = data.length;

      // Weighted linear regression
      const regression = (values: number[]) => {
        const m = values.length;
        let sumW = 0, sumWX = 0, sumWY = 0, sumWXX = 0, sumWXY = 0;
        for (let i = 0; i < m; i++) {
          const w = 1 + i * 0.5;
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
        const meanY = values.reduce((a, b) => a + b, 0) / m;
        let ssTot = 0, ssRes = 0;
        for (let i = 0; i < m; i++) {
          ssRes += (values[i] - (intercept + slope * i)) ** 2;
          ssTot += (values[i] - meanY) ** 2;
        }
        return { slope, intercept, rSquared: ssTot > 0 ? 1 - ssRes / ssTot : 0 };
      };

      const computeStdError = (values: number[], slope: number, intercept: number): number => {
        const m = values.length;
        if (m <= 2) return 0;
        let ssRes = 0;
        for (let i = 0; i < m; i++) {
          ssRes += (values[i] - (intercept + slope * i)) ** 2;
        }
        return Math.sqrt(ssRes / (m - 2));
      };

      const compositeValues = data.map((r: any) => parseFloat(r.ghai_composite));
      const mhaiValues = data.map((r: any) => parseFloat(r.mhai || '0'));
      const chaiValues = data.map((r: any) => parseFloat(r.chai || '0'));
      const rhaiValues = data.map((r: any) => parseFloat(r.rhai || '0'));

      const compositeReg = regression(compositeValues);
      const mhaiReg = regression(mhaiValues);
      const chaiReg = regression(chaiValues);
      const rhaiReg = regression(rhaiValues);
      const stdError = computeStdError(compositeValues, compositeReg.slope, compositeReg.intercept);

      const lastDate = new Date(data[n - 1].calculation_date);
      const currentGhai = compositeValues[n - 1];

      const forecast: Array<{
        period_date: string;
        predicted_ghai: number;
        lower_bound: number;
        upper_bound: number;
        predicted_category: string;
        confidence: number;
      }> = [];
      const mhaiForecast: Array<{ period_date: string; predicted: number }> = [];
      const chaiForecast: Array<{ period_date: string; predicted: number }> = [];
      const rhaiForecast: Array<{ period_date: string; predicted: number }> = [];

      for (let h = 1; h <= horizonMonths; h++) {
        const futureDate = new Date(lastDate);
        futureDate.setMonth(futureDate.getMonth() + h);
        const dateStr = futureDate.toISOString().slice(0, 10);
        const x = n - 1 + h;

        const predicted = Math.round((compositeReg.intercept + compositeReg.slope * x) * 100) / 100;
        const margin = 1.96 * stdError * Math.sqrt(1 + (1 / n) + ((x - (n - 1) / 2) ** 2) / (n * n));
        const confidence = Math.max(0.5, 0.95 - h * 0.02);

        forecast.push({
          period_date: dateStr,
          predicted_ghai: Math.max(predicted, 0),
          lower_bound: Math.max(Math.round((predicted - margin) * 100) / 100, 0),
          upper_bound: Math.round((predicted + margin) * 100) / 100,
          predicted_category: classifyGHAI(predicted),
          confidence: Math.round(confidence * 100) / 100,
        });

        mhaiForecast.push({
          period_date: dateStr,
          predicted: Math.max(Math.round((mhaiReg.intercept + mhaiReg.slope * x) * 100) / 100, 0),
        });
        chaiForecast.push({
          period_date: dateStr,
          predicted: Math.max(Math.round((chaiReg.intercept + chaiReg.slope * x) * 100) / 100, 0),
        });
        rhaiForecast.push({
          period_date: dateStr,
          predicted: Math.max(Math.round((rhaiReg.intercept + rhaiReg.slope * x) * 100) / 100, 0),
        });
      }

      const monthlyChangeRate = compositeValues.length > 1
        ? ((compositeValues[compositeValues.length - 1] - compositeValues[0]) / compositeValues[0]) / (compositeValues.length - 1) * 100
        : 0;

      return {
        region,
        horizon_months: horizonMonths,
        current_ghai: currentGhai,
        current_category: classifyGHAI(currentGhai),
        forecast,
        sub_index_forecasts: {
          mhai: mhaiForecast,
          chai: chaiForecast,
          rhai: rhaiForecast,
        },
        model_info: {
          method: 'weighted_linear_regression',
          data_points: n,
          r_squared: Math.round(compositeReg.rSquared * 10000) / 10000,
          trend_direction: compositeReg.slope > 0.3 ? 'improving' : compositeReg.slope < -0.3 ? 'worsening' : 'stable',
          monthly_change_rate: Math.round(monthlyChangeRate * 1000) / 1000,
        },
      };
    } catch (err: any) {
      if (err.code === '42P01') return null;
      logger.error('Error forecasting GHAI', { error: err.message, region });
      throw err;
    }
  }

  // ==========================================================================
  // COMPUTATION
  // ==========================================================================

  /**
   * Compute GHAI for a single region from provided input data.
   * Does NOT persist — just returns the calculated result.
   */
  computeForRegion(input: RegionalInputData): GHAIResult {
    const weights = REGIONAL_WEIGHTS[input.region] || { mortgage: 0.10, cash: 0.60, rental: 0.30 };

    // Core indices
    const mhai = calculateMHAI(
      input.median_property_price,
      input.median_household_income,
      input.mortgage_rate,
    );

    const { chai } = calculateCHAI(
      input.median_property_price,
      input.median_household_income,
    );

    const monthlyIncome = input.median_household_income / 12;
    const { rhai } = calculateRHAI(input.median_monthly_rent, monthlyIncome);

    // Composite
    const composite = weights.mortgage * mhai + weights.cash * chai + weights.rental * rhai;

    // Supplementary indices
    const cai = input.construction_cost_per_sqm
      ? calculateCAI(input.median_household_income, input.land_price_per_sqm || 200, input.construction_cost_per_sqm)
      : 0;

    const lai = input.land_price_per_sqm
      ? calculateLAI(input.median_household_income, input.land_price_per_sqm)
      : 0;

    const mas = calculateMAS(input.formal_employment_pct || 15);

    return {
      region: input.region,
      ghai_composite: Math.round(composite * 100) / 100,
      ghai_category: classifyGHAI(composite),
      mhai: Math.round(mhai * 100) / 100,
      chai: Math.round(chai * 100) / 100,
      rhai: Math.round(rhai * 100) / 100,
      mortgage_weight: weights.mortgage,
      cash_weight: weights.cash,
      rental_weight: weights.rental,
      cai: Math.round(cai * 100) / 100,
      lai: Math.round(lai * 100) / 100,
      mas,
      median_property_price: input.median_property_price,
      median_household_income: input.median_household_income,
      mortgage_rate: input.mortgage_rate,
      median_monthly_rent: input.median_monthly_rent,
      trend_direction: 'stable',
      change_mom: 0,
      change_yoy: 0,
    };
  }

  /**
   * Compute and persist GHAI for all regions.
   * Reads input data from existing economic / market tables,
   * or uses the provided data array.
   */
  async computeAndStore(
    inputs: RegionalInputData[],
    calculationDate: Date = new Date(),
  ): Promise<GHAIResult[]> {
    const client = await pool.connect();
    const results: GHAIResult[] = [];
    const dateStr = calculationDate.toISOString().slice(0, 10);

    try {
      await client.query('BEGIN');

      for (const input of inputs) {
        const computed = this.computeForRegion(input);

        // Get previous month for trend
        const prev = await client.query(
          `SELECT ghai_composite, calculation_date
           FROM housing_affordability_index
           WHERE LOWER(region) = LOWER($1)
           ORDER BY calculation_date DESC
           LIMIT 1`,
          [input.region],
        );

        let changeMom = 0;
        if (prev.rows.length > 0) {
          const prevComposite = parseFloat(prev.rows[0].ghai_composite);
          changeMom = prevComposite > 0 ? ((computed.ghai_composite - prevComposite) / prevComposite) * 100 : 0;
        }

        // Get YoY
        const yoyRow = await client.query(
          `SELECT ghai_composite
           FROM housing_affordability_index
           WHERE LOWER(region) = LOWER($1)
             AND calculation_date <= $2::DATE - INTERVAL '11 months'
           ORDER BY calculation_date DESC
           LIMIT 1`,
          [input.region, dateStr],
        );

        let changeYoy = 0;
        if (yoyRow.rows.length > 0) {
          const yoyComposite = parseFloat(yoyRow.rows[0].ghai_composite);
          changeYoy = yoyComposite > 0 ? ((computed.ghai_composite - yoyComposite) / yoyComposite) * 100 : 0;
        }

        computed.change_mom = Math.round(changeMom * 1000) / 1000;
        computed.change_yoy = Math.round(changeYoy * 1000) / 1000;
        computed.trend_direction = trendDirection(changeMom);

        // Persist
        await client.query(
          `INSERT INTO housing_affordability_index (
             calculation_date, region, property_type,
             ghai_composite, ghai_category, mhai, chai, rhai,
             mortgage_weight, cash_weight, rental_weight,
             cai, lai, mas,
             median_property_price, median_household_income,
             mortgage_rate, median_monthly_rent,
             trend_direction, change_mom, change_yoy
           ) VALUES ($1,$2,'residential',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
           ON CONFLICT (calculation_date, region, property_type)
           DO UPDATE SET
             ghai_composite = EXCLUDED.ghai_composite,
             ghai_category = EXCLUDED.ghai_category,
             mhai = EXCLUDED.mhai,
             chai = EXCLUDED.chai,
             rhai = EXCLUDED.rhai,
             cai = EXCLUDED.cai,
             lai = EXCLUDED.lai,
             mas = EXCLUDED.mas,
             trend_direction = EXCLUDED.trend_direction,
             change_mom = EXCLUDED.change_mom,
             change_yoy = EXCLUDED.change_yoy`,
          [
            dateStr,
            input.region,
            computed.ghai_composite,
            computed.ghai_category,
            computed.mhai,
            computed.chai,
            computed.rhai,
            computed.mortgage_weight,
            computed.cash_weight,
            computed.rental_weight,
            computed.cai,
            computed.lai,
            computed.mas,
            computed.median_property_price,
            computed.median_household_income,
            computed.mortgage_rate,
            computed.median_monthly_rent,
            computed.trend_direction,
            computed.change_mom,
            computed.change_yoy,
          ],
        );

        results.push(computed);
      }

      await client.query('COMMIT');
      logger.info('GHAI computed for regions', {
        date: dateStr,
        regions: results.map((r) => r.region),
      });
      return results;
    } catch (err: any) {
      await client.query('ROLLBACK');
      logger.error('Error computing GHAI', { error: err.message });
      throw err;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private mapRow(r: any): GHAIResult {
    return {
      region: r.region,
      ghai_composite: parseFloat(r.ghai_composite),
      ghai_category: r.ghai_category || classifyGHAI(parseFloat(r.ghai_composite)),
      mhai: parseFloat(r.mhai || '0'),
      chai: parseFloat(r.chai || '0'),
      rhai: parseFloat(r.rhai || '0'),
      mortgage_weight: parseFloat(r.mortgage_weight || '0'),
      cash_weight: parseFloat(r.cash_weight || '0'),
      rental_weight: parseFloat(r.rental_weight || '0'),
      cai: parseFloat(r.cai || '0'),
      lai: parseFloat(r.lai || '0'),
      mas: parseFloat(r.mas || '0'),
      median_property_price: parseFloat(r.median_property_price || '0'),
      median_household_income: parseFloat(r.median_household_income || '0'),
      mortgage_rate: parseFloat(r.mortgage_rate || '0'),
      median_monthly_rent: parseFloat(r.median_monthly_rent || '0'),
      trend_direction: r.trend_direction || 'stable',
      change_mom: parseFloat(r.change_mom || '0'),
      change_yoy: parseFloat(r.change_yoy || '0'),
    };
  }

  /**
   * Get available region weights for the weight matrix.
   */
  getRegionalWeights(): Record<string, RegionWeights> {
    return { ...REGIONAL_WEIGHTS };
  }
}

// Singleton
export const ghaiService = new GHAIService();

// Export calculation helpers for testing
export const _internal = {
  calculateMHAI,
  calculateCHAI,
  calculateRHAI,
  calculateCAI,
  calculateLAI,
  calculateMAS,
  classifyGHAI,
  monthlyPayment,
  monthlyHousingCost,
};
