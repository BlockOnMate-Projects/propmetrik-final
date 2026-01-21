/**
 * CapRateService - Market-Based Cap Rate Calculation for RICS/GhIS Compliance
 * 
 * This service provides:
 * 1. Market cap rate benchmarks by region and property type
 * 2. Property-specific cap rate estimation with adjustments
 * 3. NOI calculation from income evidence
 * 4. Listing-derived cap rate methodology (fallback when no transactions)
 * 5. Integration with valuation engine for income approach
 * 
 * Replaces hardcoded cap rate values with market-derived data.
 * Implements RICS-compliant fallback hierarchy:
 *   1. Market extraction (from transactions) - Category A
 *   2. Partner/bank data - Category A
 *   3. Listing-derived (adjusted asking prices) - Category B
 *   4. Survey/published data - Category C
 */

import { query } from '../../database';
import { logger } from '../../utils/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface MarketCapRateBenchmark {
  benchmarkCapRate: number;
  capRateRangeLow: number;
  capRateRangeHigh: number;
  confidenceScore: number;
  sampleSize: number;
  marketCondition: 'hot' | 'balanced' | 'cool' | 'distressed' | 'unknown';
  yieldTrend: 'compressing' | 'stable' | 'expanding' | 'unknown';
  dataQuality: 'high' | 'moderate' | 'low' | 'none';
  methodology?: 'market_extraction' | 'listing_derived' | 'partner_data' | 'survey' | 'hybrid';
  effectiveDate: Date;
}

export interface ListingAdjustment {
  factor: string;
  adjustment: number;  // Negative = reduce price
  reason: string;
  source: string;
}

export interface PropertyListing {
  id: string;
  askingPrice: number;
  totalAreaSqm: number;
  daysOnMarket: number;
  dataQualityScore: number;
  evidenceType: string;
  condition?: string;
  locationTier?: string;
  region: string;
  propertyType: string;
}

export interface ImpliedCapRate {
  propertyId: string;
  askingPrice: number;
  adjustedPrice: number;
  adjustmentTotal: number;
  adjustments: ListingAdjustment[];
  estimatedNoi: number;
  impliedCapRate: number;
  confidence: 'high' | 'moderate' | 'low';
  evidenceType: string;
}

export interface ListingDerivedCapRate {
  derivedCapRate: number;
  capRateLow: number;
  capRateHigh: number;
  sampleSize: number;
  methodology: 'listing_derived';
  confidence: number;
  dataQuality: 'high' | 'moderate' | 'low';
  marketCondition: 'hot' | 'balanced' | 'cool' | 'distressed';
  yieldTrend: 'compressing' | 'stable' | 'expanding';
  impliedRates: ImpliedCapRate[];
  warnings: string[];
  ricsDisclosure: string;
}

export interface CapRateMethodology {
  method: 'market_extraction' | 'partner_data' | 'listing_derived' | 'survey_data' | 'default';
  capRate: number;
  capRateLow: number;
  capRateHigh: number;
  confidence: 'high' | 'moderate' | 'limited' | 'insufficient';
  ricsCategory: 'A' | 'B' | 'C';
  sampleSize: number;
  description: string;
  uncertaintyNote?: string;
  source?: string;
}

export interface NOIEstimate {
  grossPotentialRent: number;
  vacancyRate: number;
  collectionLoss: number;
  effectiveGrossIncome: number;
  operatingExpenses: number;
  expenseRatio: number;
  netOperatingIncome: number;
  methodology: 'actual' | 'estimated' | 'market_derived';
  confidence: 'high' | 'moderate' | 'low';
  sampleSize: number;
  warnings: string[];
}

export interface CapRateAdjustment {
  factor: string;
  adjustment: number;  // Positive = higher cap rate (more risk), Negative = lower cap rate (less risk)
  reason: string;
  source?: string;
}

export interface PropertyCapRateEstimate {
  baseCapRate: number;
  adjustments: CapRateAdjustment[];
  adjustedCapRate: number;
  capRateRange: { low: number; high: number };
  confidenceScore: number;
  methodology: 'market_benchmark' | 'comparable_derived' | 'build_up' | 'hybrid';
  justification: string;
  dataQuality: string;
  warnings: string[];
}

export interface NOICalculation {
  grossPotentialRent: number;
  vacancyRate: number;
  vacancyLoss: number;
  effectiveGrossIncome: number;
  otherIncome: number;
  totalEffectiveIncome: number;
  operatingExpenses: number;
  operatingExpenseRatio: number;
  netOperatingIncome: number;
  noiPerSqm: number | null;
  expenseBreakdown: Record<string, number>;
  evidenceCount: number;
  confidenceScore: number;
  methodology: 'actual' | 'estimated' | 'market_derived';
}

export interface IncomeApproachInputs {
  propertyId: string;
  region: string;
  propertyType: string;
  propertySubtype?: string;
  totalAreaSqm?: number;
  customNoi?: number;
  customCapRate?: number;
  vacancyRateOverride?: number;
  expenseRatioOverride?: number;
}

export interface IncomeApproachResult {
  noi: NOICalculation;
  capRate: PropertyCapRateEstimate;
  indicatedValue: number;
  valueRange: { low: number; high: number };
  confidenceScore: number;
  methodology: string;
  ricsCompliance: {
    hasTransactionEvidence: boolean;
    hasIncomeEvidence: boolean;
    hasMarketCapRates: boolean;
    overallQuality: 'compliant' | 'acceptable' | 'limited' | 'insufficient';
    notes: string[];
  };
}

// ============================================================================
// CAP RATE SERVICE CLASS
// ============================================================================

export class CapRateService {

  /**
   * Get market cap rate benchmark for a region and property type.
   * Uses the market_cap_rate_benchmarks table with fallback to defaults.
   */
  async getMarketCapRate(
    region: string,
    propertyType: string,
    propertySubtype?: string,
    asOfDate: Date = new Date()
  ): Promise<MarketCapRateBenchmark> {
    try {
      const result = await query(`
        SELECT * FROM get_market_cap_rate($1::region_code_enum, $2::property_type_enum, $3, $4::date)
      `, [region, propertyType, propertySubtype || null, asOfDate]);

      if (result.rows.length > 0) {
        const row = result.rows[0];
        return {
          benchmarkCapRate: parseFloat(row.benchmark_cap_rate) || 0.08,
          capRateRangeLow: parseFloat(row.cap_rate_range_low) || 0.06,
          capRateRangeHigh: parseFloat(row.cap_rate_range_high) || 0.12,
          confidenceScore: parseFloat(row.confidence_score) || 0.3,
          sampleSize: parseInt(row.sample_size) || 0,
          marketCondition: row.market_condition || 'unknown',
          yieldTrend: row.yield_trend || 'unknown',
          dataQuality: row.data_quality || 'none',
          effectiveDate: row.effective_date || new Date(),
        };
      }

      // Return defaults if no benchmark found
      return this.getDefaultCapRate(propertyType);

    } catch (error: any) {
      logger.warn('Failed to get market cap rate, using defaults', {
        region,
        propertyType,
        error: error.message
      });
      return this.getDefaultCapRate(propertyType);
    }
  }

  /**
   * Get default cap rate based on property type.
   * Used as fallback when no market data available.
   * Ghana market typical cap rates by property type.
   */
  private getDefaultCapRate(propertyType: string): MarketCapRateBenchmark {
    // Normalize property type to handle both snake_case and uppercase formats
    const normalized = propertyType.toLowerCase().replace(/_/g, '');

    const defaults: Record<string, { rate: number; low: number; high: number }> = {
      // Residential
      'residentialhouse': { rate: 0.065, low: 0.05, high: 0.09 },
      'house': { rate: 0.065, low: 0.05, high: 0.09 },
      // Apartments
      'apartmentflat': { rate: 0.075, low: 0.055, high: 0.10 },
      'apartment': { rate: 0.075, low: 0.055, high: 0.10 },
      // Commercial
      'commercialoffice': { rate: 0.095, low: 0.075, high: 0.14 },
      'commercialshop': { rate: 0.10, low: 0.08, high: 0.14 },
      'commercial': { rate: 0.095, low: 0.075, high: 0.14 },
      // Industrial
      'warehouse': { rate: 0.12, low: 0.09, high: 0.16 },
      'industrial': { rate: 0.11, low: 0.085, high: 0.15 },
      // Land
      'land': { rate: 0.05, low: 0.03, high: 0.08 },
      // Mixed use
      'mixeduse': { rate: 0.085, low: 0.065, high: 0.12 },
    };

    const def = defaults[normalized] || { rate: 0.08, low: 0.06, high: 0.12 };

    return {
      benchmarkCapRate: def.rate,
      capRateRangeLow: def.low,
      capRateRangeHigh: def.high,
      confidenceScore: 0.3,  // Low confidence for defaults
      sampleSize: 0,
      marketCondition: 'unknown',
      yieldTrend: 'unknown',
      dataQuality: 'none',
      effectiveDate: new Date(),
    };
  }

  /**
   * Calculate property-specific cap rate with adjustments from market benchmark.
   */
  async calculatePropertyCapRate(
    propertyId: string,
    region: string,
    propertyType: string,
    propertySubtype?: string,
    propertyAttributes?: {
      age?: number;
      condition?: string;
      occupancyRate?: number;
      leaseTermRemaining?: number;
      tenantQuality?: string;
      locationQuality?: string;
      buildingClass?: string;
    }
  ): Promise<PropertyCapRateEstimate> {
    // Get market benchmark
    const benchmark = await this.getMarketCapRate(region, propertyType, propertySubtype);

    const adjustments: CapRateAdjustment[] = [];
    let totalAdjustment = 0;
    const warnings: string[] = [];

    // Apply property-specific adjustments
    if (propertyAttributes) {
      // Age adjustment
      if (propertyAttributes.age !== undefined) {
        const ageAdjustment = this.calculateAgeAdjustment(propertyAttributes.age);
        if (ageAdjustment !== 0) {
          adjustments.push({
            factor: 'building_age',
            adjustment: ageAdjustment,
            reason: `Building age: ${propertyAttributes.age} years`,
            source: 'standard_adjustment',
          });
          totalAdjustment += ageAdjustment;
        }
      }

      // Condition adjustment
      if (propertyAttributes.condition) {
        const conditionAdjustment = this.calculateConditionAdjustment(propertyAttributes.condition);
        if (conditionAdjustment !== 0) {
          adjustments.push({
            factor: 'condition',
            adjustment: conditionAdjustment,
            reason: `Property condition: ${propertyAttributes.condition}`,
            source: 'standard_adjustment',
          });
          totalAdjustment += conditionAdjustment;
        }
      }

      // Occupancy adjustment
      if (propertyAttributes.occupancyRate !== undefined) {
        const occupancyAdjustment = this.calculateOccupancyAdjustment(propertyAttributes.occupancyRate);
        if (occupancyAdjustment !== 0) {
          adjustments.push({
            factor: 'occupancy',
            adjustment: occupancyAdjustment,
            reason: `Occupancy rate: ${(propertyAttributes.occupancyRate * 100).toFixed(1)}%`,
            source: 'standard_adjustment',
          });
          totalAdjustment += occupancyAdjustment;
        }
      }

      // Tenant quality adjustment (for commercial)
      if (propertyAttributes.tenantQuality) {
        const tenantAdjustment = this.calculateTenantQualityAdjustment(propertyAttributes.tenantQuality);
        if (tenantAdjustment !== 0) {
          adjustments.push({
            factor: 'tenant_quality',
            adjustment: tenantAdjustment,
            reason: `Tenant quality: ${propertyAttributes.tenantQuality}`,
            source: 'standard_adjustment',
          });
          totalAdjustment += tenantAdjustment;
        }
      }

      // Location quality adjustment
      if (propertyAttributes.locationQuality) {
        const locationAdjustment = this.calculateLocationAdjustment(propertyAttributes.locationQuality);
        if (locationAdjustment !== 0) {
          adjustments.push({
            factor: 'location_quality',
            adjustment: locationAdjustment,
            reason: `Location quality: ${propertyAttributes.locationQuality}`,
            source: 'standard_adjustment',
          });
          totalAdjustment += locationAdjustment;
        }
      }
    }

    // Calculate adjusted cap rate
    const adjustedCapRate = Math.max(0.02, Math.min(0.25, benchmark.benchmarkCapRate + totalAdjustment));

    // Adjust range based on total adjustments
    const capRateRange = {
      low: Math.max(0.02, benchmark.capRateRangeLow + totalAdjustment * 0.5),
      high: Math.min(0.25, benchmark.capRateRangeHigh + totalAdjustment * 0.5),
    };

    // Calculate confidence score
    let confidenceScore = benchmark.confidenceScore;
    if (adjustments.length > 0) {
      confidenceScore = Math.max(0.3, confidenceScore - 0.05 * adjustments.length);
    }

    // Generate warnings
    if (benchmark.dataQuality === 'none' || benchmark.dataQuality === 'low') {
      warnings.push('Limited market cap rate data available for this region/property type');
    }
    if (adjustments.length > 3) {
      warnings.push('Multiple adjustments applied - consider additional market research');
    }
    if (Math.abs(totalAdjustment) > 0.02) {
      warnings.push('Significant cap rate adjustments applied - verify with market evidence');
    }

    // Generate justification
    const justification = this.generateCapRateJustification(
      benchmark,
      adjustments,
      adjustedCapRate,
      region,
      propertyType
    );

    return {
      baseCapRate: benchmark.benchmarkCapRate,
      adjustments,
      adjustedCapRate,
      capRateRange,
      confidenceScore,
      methodology: benchmark.sampleSize > 5 ? 'market_benchmark' : 'hybrid',
      justification,
      dataQuality: benchmark.dataQuality,
      warnings,
    };
  }

  /**
   * Calculate NOI from income evidence for a property.
   */
  async calculateNOI(
    propertyId: string,
    vacancyRateOverride?: number,
    expenseRatioOverride?: number
  ): Promise<NOICalculation | null> {
    try {
      const result = await query(`
        SELECT * FROM calculate_noi_from_evidence($1, $2, $3)
      `, [propertyId, vacancyRateOverride || null, expenseRatioOverride || null]);

      if (result.rows.length === 0 || result.rows[0].gross_rent_annual === null) {
        return null;
      }

      const row = result.rows[0];
      const grossRent = parseFloat(row.gross_rent_annual);
      const egi = parseFloat(row.effective_gross_income);
      const opex = parseFloat(row.operating_expenses);
      const noi = parseFloat(row.net_operating_income);
      const vacancyRate = parseFloat(row.applied_vacancy_rate);
      const expenseRatio = parseFloat(row.applied_expense_ratio);

      return {
        grossPotentialRent: grossRent,
        vacancyRate: vacancyRate,
        vacancyLoss: grossRent * vacancyRate,
        effectiveGrossIncome: egi,
        otherIncome: 0,
        totalEffectiveIncome: egi,
        operatingExpenses: opex,
        operatingExpenseRatio: expenseRatio,
        netOperatingIncome: noi,
        noiPerSqm: null,  // Would need property area
        expenseBreakdown: {},  // Would need detailed expense data
        evidenceCount: parseInt(row.evidence_count) || 0,
        confidenceScore: parseFloat(row.confidence_score) || 0.5,
        methodology: row.evidence_count > 0 ? 'actual' : 'estimated',
      };

    } catch (error: any) {
      logger.error('Failed to calculate NOI', { propertyId, error: error.message });
      return null;
    }
  }

  /**
   * Estimate NOI using market rental data when no property-specific income exists.
   */
  async estimateNOIFromMarket(
    region: string,
    propertyType: string,
    totalAreaSqm: number,
    customVacancyRate?: number,
    customExpenseRatio?: number
  ): Promise<NOICalculation> {
    // Get average rent per sqm from market
    const rentResult = await query(`
      SELECT 
        AVG(p.price) / NULLIF(COALESCE(p.total_area_sqm, p.built_area_sqm), 0) AS avg_rent_per_sqm,
        COUNT(*) as sample_count
      FROM properties p
      WHERE p.region = $1::region_code_enum
        AND p.property_type = $2::property_type_enum
        AND p.transaction_type = 'rent'
        AND p.price > 0
        AND COALESCE(p.total_area_sqm, p.built_area_sqm) > 0
        AND p.created_at >= NOW() - INTERVAL '12 months'
    `, [region, propertyType]);

    let rentPerSqm = 15; // Default GHS 15/sqm/month for Ghana
    let sampleCount = 0;

    if (rentResult.rows.length > 0 && rentResult.rows[0].avg_rent_per_sqm) {
      rentPerSqm = parseFloat(rentResult.rows[0].avg_rent_per_sqm);
      sampleCount = parseInt(rentResult.rows[0].sample_count) || 0;
    }

    // Calculate NOI
    const monthlyRent = rentPerSqm * totalAreaSqm;
    const grossAnnualRent = monthlyRent * 12;
    const vacancyRate = customVacancyRate || 0.08; // 8% default
    const expenseRatio = customExpenseRatio || 0.35; // 35% default for Ghana

    const egi = grossAnnualRent * (1 - vacancyRate);
    const opex = egi * expenseRatio;
    const noi = egi - opex;

    return {
      grossPotentialRent: grossAnnualRent,
      vacancyRate: vacancyRate,
      vacancyLoss: grossAnnualRent * vacancyRate,
      effectiveGrossIncome: egi,
      otherIncome: 0,
      totalEffectiveIncome: egi,
      operatingExpenses: opex,
      operatingExpenseRatio: expenseRatio,
      netOperatingIncome: noi,
      noiPerSqm: noi / totalAreaSqm,
      expenseBreakdown: {
        estimated_management: opex * 0.25,
        estimated_maintenance: opex * 0.30,
        estimated_insurance: opex * 0.15,
        estimated_taxes: opex * 0.20,
        estimated_other: opex * 0.10,
      },
      evidenceCount: sampleCount,
      confidenceScore: sampleCount > 10 ? 0.7 : sampleCount > 5 ? 0.5 : 0.3,
      methodology: 'market_derived',
    };
  }

  /**
   * Perform full income approach valuation.
   */
  async performIncomeApproachValuation(
    inputs: IncomeApproachInputs
  ): Promise<IncomeApproachResult> {
    const warnings: string[] = [];
    let noiBased = false;

    // Get or calculate NOI
    let noiCalc: NOICalculation;

    if (inputs.customNoi) {
      // Use provided NOI
      noiCalc = {
        grossPotentialRent: inputs.customNoi / 0.65, // Estimate GPR from NOI
        vacancyRate: 0.08,
        vacancyLoss: 0,
        effectiveGrossIncome: inputs.customNoi / (1 - 0.35),
        otherIncome: 0,
        totalEffectiveIncome: inputs.customNoi / (1 - 0.35),
        operatingExpenses: inputs.customNoi / (1 - 0.35) * 0.35,
        operatingExpenseRatio: 0.35,
        netOperatingIncome: inputs.customNoi,
        noiPerSqm: inputs.totalAreaSqm ? inputs.customNoi / inputs.totalAreaSqm : null,
        expenseBreakdown: {},
        evidenceCount: 0,
        confidenceScore: 0.8, // Assume good if provided
        methodology: 'actual',
      };
      noiBased = true;
    } else {
      // Try property-specific income first
      const propertyNoi = await this.calculateNOI(
        inputs.propertyId,
        inputs.vacancyRateOverride,
        inputs.expenseRatioOverride
      );

      if (propertyNoi && propertyNoi.netOperatingIncome > 0) {
        noiCalc = propertyNoi;
        noiBased = true;
      } else {
        // Fall back to market estimate
        if (!inputs.totalAreaSqm) {
          throw new Error('Total area required for market-based NOI estimation');
        }
        noiCalc = await this.estimateNOIFromMarket(
          inputs.region,
          inputs.propertyType,
          inputs.totalAreaSqm,
          inputs.vacancyRateOverride,
          inputs.expenseRatioOverride
        );
        warnings.push('NOI estimated from market rental data - actual income data preferred');
      }
    }

    // Get cap rate
    let capRateEstimate: PropertyCapRateEstimate;

    if (inputs.customCapRate) {
      // Use provided cap rate
      capRateEstimate = {
        baseCapRate: inputs.customCapRate,
        adjustments: [],
        adjustedCapRate: inputs.customCapRate,
        capRateRange: { low: inputs.customCapRate * 0.9, high: inputs.customCapRate * 1.1 },
        confidenceScore: 0.8,
        methodology: 'market_benchmark',
        justification: 'Cap rate provided by user/appraiser',
        dataQuality: 'moderate',
        warnings: [],
      };
    } else {
      capRateEstimate = await this.calculatePropertyCapRate(
        inputs.propertyId,
        inputs.region,
        inputs.propertyType,
        inputs.propertySubtype
      );
    }

    // Calculate indicated value
    const indicatedValue = noiCalc.netOperatingIncome / capRateEstimate.adjustedCapRate;

    // Calculate value range
    const valueRange = {
      low: noiCalc.netOperatingIncome / capRateEstimate.capRateRange.high,
      high: noiCalc.netOperatingIncome / capRateEstimate.capRateRange.low,
    };

    // Calculate overall confidence
    const confidenceScore = (noiCalc.confidenceScore + capRateEstimate.confidenceScore) / 2;

    // RICS compliance check
    const ricsCompliance = {
      hasTransactionEvidence: noiBased || noiCalc.evidenceCount > 0,
      hasIncomeEvidence: noiCalc.methodology === 'actual',
      hasMarketCapRates: capRateEstimate.dataQuality !== 'none',
      overallQuality: this.determineRicsQuality(noiCalc, capRateEstimate) as
        'compliant' | 'acceptable' | 'limited' | 'insufficient',
      notes: [
        ...warnings,
        ...capRateEstimate.warnings,
        noiCalc.methodology === 'market_derived' ?
          'NOI derived from market rental data - property-specific income preferred' : '',
        capRateEstimate.dataQuality === 'none' ?
          'No market cap rate data available - using defaults' : '',
      ].filter(n => n),
    };

    return {
      noi: noiCalc,
      capRate: capRateEstimate,
      indicatedValue: Math.round(indicatedValue),
      valueRange: {
        low: Math.round(valueRange.low),
        high: Math.round(valueRange.high),
      },
      confidenceScore,
      methodology: `Income Approach: NOI (${noiCalc.methodology}) / Cap Rate (${capRateEstimate.methodology})`,
      ricsCompliance,
    };
  }

  /**
   * Record cap rate used in a valuation for audit trail.
   */
  async recordValuationCapRate(
    valuationId: string,
    capRate: number,
    source: string,
    justification: string,
    adjustments: CapRateAdjustment[]
  ): Promise<void> {
    try {
      await query(`
        UPDATE valuations 
        SET 
          applied_cap_rate = $2,
          cap_rate_source = $3,
          cap_rate_justification = $4,
          cap_rate_adjustments = $5,
          updated_at = NOW()
        WHERE id = $1
      `, [
        valuationId,
        capRate,
        source,
        justification,
        JSON.stringify(adjustments),
      ]);
    } catch (error: any) {
      logger.error('Failed to record valuation cap rate', {
        valuationId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update market cap rate benchmarks with new transaction data.
   * Called periodically to refresh benchmarks from actual transactions.
   */
  async updateMarketBenchmarks(
    region: string,
    propertyType: string,
    propertySubtype?: string
  ): Promise<{ updated: boolean; newBenchmark: MarketCapRateBenchmark | null }> {
    try {
      // Get transaction data with NOI
      const result = await query(`
        SELECT 
          pi.cap_rate,
          pi.net_operating_income,
          pi.property_value,
          pi.effective_date,
          pi.income_evidence_quality
        FROM property_income pi
        JOIN properties p ON pi.property_id = p.id
        WHERE p.region = $1::region_code_enum
          AND p.property_type = $2::property_type_enum
          AND pi.cap_rate IS NOT NULL
          AND pi.cap_rate > 0.02
          AND pi.cap_rate < 0.25
          AND pi.effective_date >= NOW() - INTERVAL '24 months'
        ORDER BY pi.effective_date DESC
        LIMIT 50
      `, [region, propertyType]);

      if (result.rows.length < 3) {
        return { updated: false, newBenchmark: null };
      }

      // Calculate statistics
      const capRates: number[] = result.rows.map((r: any) => parseFloat(r.cap_rate)).sort((a: number, b: number) => a - b);
      const n = capRates.length;

      const min = capRates[0];
      const max = capRates[n - 1];
      const median = n % 2 === 0
        ? (capRates[n / 2 - 1] + capRates[n / 2]) / 2
        : capRates[Math.floor(n / 2)];
      const mean = capRates.reduce((a: number, b: number) => a + b, 0) / n;
      const q1 = capRates[Math.floor(n * 0.25)];
      const q3 = capRates[Math.floor(n * 0.75)];
      const stdDev = Math.sqrt(
        capRates.reduce((sum: number, x: number) => sum + Math.pow(x - mean, 2), 0) / n
      );

      // Upsert benchmark
      await query(`
        INSERT INTO market_cap_rate_benchmarks (
          region, property_type, property_subtype,
          sample_size, cap_rate_min, cap_rate_max,
          cap_rate_median, cap_rate_mean, cap_rate_std_dev,
          cap_rate_q1, cap_rate_q3,
          typical_cap_rate_low, typical_cap_rate_high,
          benchmark_cap_rate,
          effective_date, valid_from,
          confidence_score, data_quality
        ) VALUES (
          $1::region_code_enum, $2::property_type_enum, $3,
          $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          CURRENT_DATE, CURRENT_DATE,
          CASE WHEN $4 >= 10 THEN 0.85 WHEN $4 >= 5 THEN 0.70 ELSE 0.55 END,
          CASE WHEN $4 >= 10 THEN 'high' WHEN $4 >= 5 THEN 'moderate' ELSE 'low' END
        )
        ON CONFLICT (region, property_type, property_subtype, valid_from)
        DO UPDATE SET
          sample_size = EXCLUDED.sample_size,
          cap_rate_min = EXCLUDED.cap_rate_min,
          cap_rate_max = EXCLUDED.cap_rate_max,
          cap_rate_median = EXCLUDED.cap_rate_median,
          cap_rate_mean = EXCLUDED.cap_rate_mean,
          cap_rate_std_dev = EXCLUDED.cap_rate_std_dev,
          benchmark_cap_rate = EXCLUDED.benchmark_cap_rate,
          last_updated = NOW()
      `, [
        region, propertyType, propertySubtype || null,
        n, min, max, median, mean, stdDev, q1, q3,
        q1, q3, median  // Use median as benchmark, IQR as typical range
      ]);

      return {
        updated: true,
        newBenchmark: {
          benchmarkCapRate: median,
          capRateRangeLow: q1,
          capRateRangeHigh: q3,
          confidenceScore: n >= 10 ? 0.85 : n >= 5 ? 0.70 : 0.55,
          sampleSize: n,
          marketCondition: 'balanced',
          yieldTrend: 'stable',
          dataQuality: n >= 10 ? 'high' : n >= 5 ? 'moderate' : 'low',
          effectiveDate: new Date(),
        },
      };

    } catch (error: any) {
      logger.error('Failed to update market benchmarks', {
        region,
        propertyType,
        error: error.message
      });
      return { updated: false, newBenchmark: null };
    }
  }

  // ============================================================================
  // LISTING-DERIVED CAP RATE METHODOLOGY (RICS Category B Fallback)
  // ============================================================================

  /**
   * Get sale listings for cap rate derivation.
   * Prioritizes by evidence type and data quality.
   */
  async getListingComparables(
    region: string,
    propertyType: string,
    limit: number = 20
  ): Promise<PropertyListing[]> {
    const result = await query(`
      SELECT 
        p.id,
        p.price as asking_price,
        p.property_type,
        p.region,
        COALESCE(p.total_area_sqm, p.built_area_sqm, p.building_size_sqm) as total_area_sqm,
        p.evidence_type,
        EXTRACT(DAY FROM (NOW() - p.created_at))::integer as days_on_market,
        p.data_quality_score,
        p.condition,
        p.address_district
      FROM properties p
      WHERE p.region = $1::region_code_enum
        AND p.property_type = $2::property_type_enum
        AND p.transaction_type = 'sale'
        AND p.price > 0
        AND COALESCE(p.total_area_sqm, p.built_area_sqm, p.building_size_sqm) > 0
        AND p.is_active = true
        AND p.created_at >= NOW() - INTERVAL '12 months'
      ORDER BY 
        CASE p.evidence_type 
          WHEN 'verified_sale' THEN 1
          WHEN 'delisted_inferred' THEN 2
          WHEN 'partner_transaction' THEN 3
          WHEN 'listing' THEN 4
          ELSE 5
        END,
        p.data_quality_score DESC,
        p.created_at DESC
      LIMIT $3
    `, [region, propertyType, limit]);

    return result.rows.map((row: any) => ({
      id: row.id,
      askingPrice: parseFloat(row.asking_price),
      totalAreaSqm: parseFloat(row.total_area_sqm),
      daysOnMarket: parseInt(row.days_on_market) || 0,
      dataQualityScore: parseFloat(row.data_quality_score) || 0.5,
      evidenceType: row.evidence_type || 'listing',
      condition: row.condition || 'average',
      locationTier: this.determineLocationTier(row.address_district),
      region: row.region,
      propertyType: row.property_type,
    }));
  }

  /**
   * Calculate listing adjustments to convert asking price to estimated market value.
   * Ghana market typically sees 5-15% negotiation from asking price.
   */
  calculateListingAdjustments(listing: PropertyListing): ListingAdjustment[] {
    const adjustments: ListingAdjustment[] = [];

    // 1. Asking-to-Sale Discount (standard market adjustment)
    // Ghana market research: Average negotiation is 8-12%
    const askingDiscount = -0.08;  // Default 8% discount
    adjustments.push({
      factor: 'asking_to_sale_discount',
      adjustment: askingDiscount,
      reason: 'Standard negotiation discount (Ghana market 5-15%)',
      source: 'market_research'
    });

    // 2. Days on Market Adjustment
    // Stale listings often indicate overpricing
    if (listing.daysOnMarket > 90) {
      // Additional discount: 1% per 30 days over 90, max 10%
      const domPenalty = Math.min(0.10, ((listing.daysOnMarket - 90) / 30) * 0.01);
      adjustments.push({
        factor: 'days_on_market',
        adjustment: -domPenalty,
        reason: `Extended listing period: ${listing.daysOnMarket} days (overpricing indicator)`,
        source: 'calculated'
      });
    }

    // 3. Data Quality Adjustment
    if (listing.dataQualityScore < 0.7) {
      const qualityPenalty = (0.7 - listing.dataQualityScore) * 0.1; // Up to 7% for very low quality
      adjustments.push({
        factor: 'data_quality',
        adjustment: -qualityPenalty,
        reason: `Low data quality score: ${listing.dataQualityScore.toFixed(2)}`,
        source: 'data_assessment'
      });
    }

    // 4. Location Quality Adjustment
    const locationAdjustments: Record<string, number> = {
      'prime': 0.0,        // No adjustment for prime locations
      'secondary': -0.03,  // 3% discount for secondary
      'tertiary': -0.06,   // 6% discount for tertiary
      'emerging': -0.08    // 8% discount for emerging areas
    };
    const locationAdj = locationAdjustments[listing.locationTier || 'secondary'] || -0.03;
    if (locationAdj !== 0) {
      adjustments.push({
        factor: 'location_tier',
        adjustment: locationAdj,
        reason: `Location tier: ${listing.locationTier || 'secondary'}`,
        source: 'location_analysis'
      });
    }

    // 5. Condition Adjustment
    const conditionAdjustments: Record<string, number> = {
      'new': 0.02,
      'excellent': 0.01,
      'good': 0.0,
      'average': 0.0,
      'fair': -0.03,
      'poor': -0.08,
      'renovation_required': -0.15
    };
    const conditionAdj = conditionAdjustments[listing.condition?.toLowerCase() || 'average'] || 0;
    if (conditionAdj !== 0) {
      adjustments.push({
        factor: 'condition',
        adjustment: conditionAdj,
        reason: `Property condition: ${listing.condition || 'average'}`,
        source: 'property_assessment'
      });
    }

    // 6. Evidence type adjustment - more reliable sources get smaller discounts
    if (listing.evidenceType === 'verified_sale') {
      // Reduce asking discount since this is closer to transaction
      adjustments[0].adjustment = -0.03;
      adjustments[0].reason = 'Reduced discount for verified sale evidence';
    } else if (listing.evidenceType === 'delisted_inferred') {
      // Slightly less discount - property likely sold
      adjustments[0].adjustment = -0.05;
      adjustments[0].reason = 'Reduced discount for delisted/inferred sale';
    }

    return adjustments;
  }

  /**
   * Apply adjustments to asking price to get estimated market value.
   */
  applyListingAdjustments(askingPrice: number, adjustments: ListingAdjustment[]): number {
    const totalAdjustment = adjustments.reduce((sum, adj) => sum + adj.adjustment, 0);
    // Clamp total adjustment between -40% and +10%
    const clampedAdjustment = Math.max(-0.40, Math.min(0.10, totalAdjustment));
    return askingPrice * (1 + clampedAdjustment);
  }

  /**
   * Estimate NOI from rental comparables when actual income data unavailable.
   * This is the core of the listing-derived methodology.
   */
  async estimateNOIFromListings(
    region: string,
    propertyType: string,
    areaSqm: number
  ): Promise<NOIEstimate> {
    // 1. Get rental comparables
    const rentalComps = await query(`
      SELECT 
        p.price as monthly_rent,
        COALESCE(p.total_area_sqm, p.built_area_sqm, p.building_size_sqm) as total_area_sqm,
        p.bedrooms,
        p.property_type,
        p.evidence_type,
        p.data_quality_score
      FROM properties p
      WHERE p.region = $1::region_code_enum
        AND p.property_type = $2::property_type_enum
        AND p.transaction_type = 'rent'
        AND p.price > 0
        AND COALESCE(p.total_area_sqm, p.built_area_sqm, p.building_size_sqm) > 0
        AND p.is_active = true
        AND p.created_at >= NOW() - INTERVAL '12 months'
      ORDER BY 
        CASE p.evidence_type 
          WHEN 'verified_sale' THEN 1
          WHEN 'partner_transaction' THEN 2
          WHEN 'listing' THEN 3
          ELSE 4
        END,
        p.data_quality_score DESC,
        ABS(COALESCE(p.total_area_sqm, p.built_area_sqm, p.building_size_sqm) - $3) ASC
      LIMIT 15
    `, [region, propertyType, areaSqm]);

    const warnings: string[] = [];

    if (rentalComps.rows.length < 3) {
      warnings.push('Insufficient rental comparables - NOI estimate has high uncertainty');
    }

    // 2. Calculate market rent per sqm with weighting by data quality
    let weightedRentSum = 0;
    let totalWeight = 0;

    for (const row of rentalComps.rows) {
      const rentPerSqm = parseFloat(row.monthly_rent) / parseFloat(row.total_area_sqm);
      const weight = parseFloat(row.data_quality_score) || 0.5;
      weightedRentSum += rentPerSqm * weight;
      totalWeight += weight;
    }

    const rentPerSqm = totalWeight > 0 ? weightedRentSum / totalWeight : 15; // Default GHS 15/sqm/month

    // 3. Estimate annual rental income
    const monthlyRent = rentPerSqm * areaSqm;
    const annualRent = monthlyRent * 12;

    // 4. Apply standard expense ratios (Ghana market benchmarks)
    const expenseRatios: Record<string, number> = {
      'residential_house': 0.25,     // 25% operating expense ratio
      'apartment_flat': 0.30,        // 30% for apartments (common areas, management)
      'commercial_office': 0.35,     // 35% for commercial offices
      'commercial_shop': 0.30,       // 30% for retail
      'warehouse': 0.20,             // 20% for industrial/warehouse
      'mixed_use': 0.32,             // 32% for mixed use
      'land': 0.05,                  // 5% for land (minimal expenses)
      'industrial': 0.22             // 22% for industrial
    };

    const vacancyRate = 0.05;  // 5% vacancy (Ghana market average)
    const collectionLoss = 0.02;  // 2% collection loss
    const expenseRatio = expenseRatios[propertyType] || 0.28;

    // 5. Calculate NOI
    const effectiveGrossIncome = annualRent * (1 - vacancyRate - collectionLoss);
    const operatingExpenses = effectiveGrossIncome * expenseRatio;
    const netOperatingIncome = effectiveGrossIncome - operatingExpenses;

    // 6. Determine confidence based on sample size and quality
    let confidence: 'high' | 'moderate' | 'low';
    if (rentalComps.rows.length >= 10) {
      confidence = 'high';
    } else if (rentalComps.rows.length >= 5) {
      confidence = 'moderate';
    } else {
      confidence = 'low';
    }

    return {
      grossPotentialRent: annualRent,
      vacancyRate,
      collectionLoss,
      effectiveGrossIncome,
      operatingExpenses,
      expenseRatio,
      netOperatingIncome,
      methodology: 'market_derived',
      confidence,
      sampleSize: rentalComps.rows.length,
      warnings
    };
  }

  /**
   * Derive cap rate from adjusted listing data.
   * This is the main fallback method when no transaction data exists.
   */
  async deriveCapRateFromListings(
    region: string,
    propertyType: string
  ): Promise<ListingDerivedCapRate> {
    // 1. Get sale listings
    const saleListings = await this.getListingComparables(region, propertyType, 25);

    if (saleListings.length < 3) {
      throw new Error(`Insufficient listing data for ${region}/${propertyType}: only ${saleListings.length} listings found`);
    }

    // 2. For each listing, calculate implied cap rate
    const impliedCapRates: ImpliedCapRate[] = [];

    for (const listing of saleListings) {
      try {
        // Apply adjustments to asking price
        const adjustments = this.calculateListingAdjustments(listing);
        const adjustedPrice = this.applyListingAdjustments(listing.askingPrice, adjustments);

        // Estimate NOI for this property based on its area
        const noiEstimate = await this.estimateNOIFromListings(
          region,
          propertyType,
          listing.totalAreaSqm
        );

        // Calculate implied cap rate
        const impliedCapRate = noiEstimate.netOperatingIncome / adjustedPrice;

        // Only include reasonable cap rates (3% - 20%)
        if (impliedCapRate > 0.03 && impliedCapRate < 0.20) {
          impliedCapRates.push({
            propertyId: listing.id,
            askingPrice: listing.askingPrice,
            adjustedPrice,
            adjustmentTotal: adjustments.reduce((s, a) => s + a.adjustment, 0),
            adjustments,
            estimatedNoi: noiEstimate.netOperatingIncome,
            impliedCapRate,
            confidence: noiEstimate.confidence,
            evidenceType: listing.evidenceType
          });
        }
      } catch (error: any) {
        logger.warn('Failed to calculate implied cap rate for listing', {
          listingId: listing.id,
          error: error.message
        });
      }
    }

    if (impliedCapRates.length < 3) {
      throw new Error(`Insufficient valid cap rates derived: only ${impliedCapRates.length} valid rates`);
    }

    // 3. Calculate weighted average cap rate
    // Weight by evidence quality and data confidence
    const weights = impliedCapRates.map(r => {
      let weight = 1.0;
      // Evidence type weighting
      if (r.evidenceType === 'verified_sale') weight *= 2.5;
      else if (r.evidenceType === 'delisted_inferred') weight *= 2.0;
      else if (r.evidenceType === 'partner_transaction') weight *= 1.8;
      // Confidence weighting
      if (r.confidence === 'high') weight *= 1.5;
      else if (r.confidence === 'moderate') weight *= 1.2;
      return weight;
    });

    const weightedSum = impliedCapRates.reduce((sum, r, i) =>
      sum + (r.impliedCapRate * weights[i]), 0);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const weightedAvgCapRate = weightedSum / totalWeight;

    // 4. Calculate range (IQR)
    const sortedRates = impliedCapRates.map(r => r.impliedCapRate).sort((a, b) => a - b);
    const n = sortedRates.length;
    const capRateLow = sortedRates[Math.floor(n * 0.25)];
    const capRateHigh = sortedRates[Math.floor(n * 0.75)];

    // 5. Determine confidence score
    let confidenceScore: number;
    if (impliedCapRates.length >= 10) {
      confidenceScore = 0.65;
    } else if (impliedCapRates.length >= 5) {
      confidenceScore = 0.55;
    } else {
      confidenceScore = 0.40;
    }

    // Reduce confidence if wide spread in cap rates
    const spread = capRateHigh - capRateLow;
    if (spread > 0.04) confidenceScore -= 0.10;
    else if (spread > 0.03) confidenceScore -= 0.05;

    const warnings = [
      'Cap rate derived from adjusted listings - not direct market extraction',
      'Asking prices adjusted by estimated market discount (8-15%)',
      'NOI estimated from rental comparables - verify with actual income data when available',
      `Based on ${impliedCapRates.length} adjusted listings with ${sortedRates.length} valid implied rates`
    ];

    const ricsDisclosure = `Per RICS VPS 3, material valuation uncertainty exists due to reliance ` +
      `on listing evidence rather than transaction evidence. Asking prices have been adjusted ` +
      `to reflect estimated market values based on: (1) standard negotiation discounts of 8-12%, ` +
      `(2) days-on-market adjustments, and (3) property-specific factors. The derived cap rate ` +
      `of ${(weightedAvgCapRate * 100).toFixed(2)}% is based on ${impliedCapRates.length} ` +
      `comparable listings in the ${region} market.`;

    return {
      derivedCapRate: weightedAvgCapRate,
      capRateLow,
      capRateHigh,
      sampleSize: impliedCapRates.length,
      methodology: 'listing_derived',
      confidence: confidenceScore,
      dataQuality: impliedCapRates.length >= 10 ? 'moderate' : 'low',
      marketCondition: 'balanced',
      yieldTrend: 'stable',
      impliedRates: impliedCapRates,
      warnings,
      ricsDisclosure
    };
  }

  /**
   * Select the best cap rate methodology based on available data.
   * Implements RICS-compliant fallback hierarchy:
   *   1. Market extraction (transactions) - Category A
   *   2. Partner/bank data - Category A  
   *   3. Listing-derived - Category B
   *   4. Survey/default - Category C
   */
  async selectCapRateMethodology(
    region: string,
    propertyType: string
  ): Promise<CapRateMethodology> {

    // 1. Check for transaction-derived cap rates (preferred - Category A)
    try {
      const transactionResult = await query(`
        SELECT 
          benchmark_cap_rate,
          cap_rate_range_low,
          cap_rate_range_high,
          sample_size,
          confidence_score,
          methodology
        FROM market_cap_rate_benchmarks
        WHERE region = $1::region_code_enum
          AND property_type = $2::property_type_enum
          AND methodology = 'market_extraction'
          AND effective_date >= NOW() - INTERVAL '6 months'
          AND sample_size >= 3
        ORDER BY confidence_score DESC, effective_date DESC
        LIMIT 1
      `, [region, propertyType]);

      if (transactionResult.rows.length > 0) {
        const row = transactionResult.rows[0];
        return {
          method: 'market_extraction',
          capRate: parseFloat(row.benchmark_cap_rate),
          capRateLow: parseFloat(row.cap_rate_range_low),
          capRateHigh: parseFloat(row.cap_rate_range_high),
          confidence: parseFloat(row.confidence_score) >= 0.75 ? 'high' : 'moderate',
          ricsCategory: 'A',
          sampleSize: parseInt(row.sample_size),
          description: 'Cap rate derived from comparable sales transactions'
        };
      }
    } catch (error: any) {
      logger.warn('Transaction cap rate lookup failed', { error: error.message });
    }

    // 2. Check for bank/partner data (Category A)
    try {
      const partnerResult = await query(`
        SELECT 
          benchmark_cap_rate,
          cap_rate_range_low,
          cap_rate_range_high,
          sample_size,
          confidence_score
        FROM market_cap_rate_benchmarks
        WHERE region = $1::region_code_enum
          AND property_type = $2::property_type_enum
          AND methodology = 'partner_data'
          AND effective_date >= NOW() - INTERVAL '6 months'
          AND sample_size >= 2
        ORDER BY confidence_score DESC, effective_date DESC
        LIMIT 1
      `, [region, propertyType]);

      if (partnerResult.rows.length > 0) {
        const row = partnerResult.rows[0];
        return {
          method: 'partner_data',
          capRate: parseFloat(row.benchmark_cap_rate),
          capRateLow: parseFloat(row.cap_rate_range_low),
          capRateHigh: parseFloat(row.cap_rate_range_high),
          confidence: 'moderate',
          ricsCategory: 'A',
          sampleSize: parseInt(row.sample_size),
          description: 'Cap rate derived from bank/partner transaction data'
        };
      }
    } catch (error: any) {
      logger.warn('Partner cap rate lookup failed', { error: error.message });
    }

    // 3. Try listing-derived (Category B fallback)
    try {
      const listingCapRate = await this.deriveCapRateFromListings(region, propertyType);

      if (listingCapRate.sampleSize >= 3) {
        // Save the derived benchmark for future use
        await this.saveListingDerivedBenchmark(region, propertyType, listingCapRate);

        return {
          method: 'listing_derived',
          capRate: listingCapRate.derivedCapRate,
          capRateLow: listingCapRate.capRateLow,
          capRateHigh: listingCapRate.capRateHigh,
          confidence: 'limited',
          ricsCategory: 'B',
          sampleSize: listingCapRate.sampleSize,
          description: 'Cap rate derived from adjusted listings - material uncertainty applies',
          uncertaintyNote: listingCapRate.ricsDisclosure
        };
      }
    } catch (error: any) {
      logger.warn('Listing-derived cap rate failed', {
        region,
        propertyType,
        error: error.message
      });
    }

    // 4. Check for survey/published data (Category C)
    try {
      const surveyResult = await query(`
        SELECT 
          benchmark_cap_rate,
          cap_rate_range_low,
          cap_rate_range_high,
          sample_size,
          source_description
        FROM market_cap_rate_benchmarks
        WHERE region = $1::region_code_enum
          AND property_type = $2::property_type_enum
          AND methodology = 'survey'
          AND effective_date >= NOW() - INTERVAL '12 months'
        ORDER BY effective_date DESC
        LIMIT 1
      `, [region, propertyType]);

      if (surveyResult.rows.length > 0) {
        const row = surveyResult.rows[0];
        return {
          method: 'survey_data',
          capRate: parseFloat(row.benchmark_cap_rate),
          capRateLow: parseFloat(row.cap_rate_range_low),
          capRateHigh: parseFloat(row.cap_rate_range_high),
          confidence: 'limited',
          ricsCategory: 'C',
          sampleSize: parseInt(row.sample_size) || 0,
          description: 'Cap rate from published surveys - verify applicability',
          source: row.source_description
        };
      }
    } catch (error: any) {
      logger.warn('Survey cap rate lookup failed', { error: error.message });
    }

    // 5. Use defaults (lowest confidence)
    const defaults = this.getDefaultCapRate(propertyType);
    return {
      method: 'default',
      capRate: defaults.benchmarkCapRate,
      capRateLow: defaults.capRateRangeLow,
      capRateHigh: defaults.capRateRangeHigh,
      confidence: 'insufficient',
      ricsCategory: 'C',
      sampleSize: 0,
      description: 'Using industry standard benchmarks - no market data available',
      uncertaintyNote: 'Material valuation uncertainty: No market evidence available for this region/property type combination.'
    };
  }

  /**
   * Save listing-derived benchmark to database for future use.
   */
  async saveListingDerivedBenchmark(
    region: string,
    propertyType: string,
    listingCapRate: ListingDerivedCapRate
  ): Promise<void> {
    try {
      await query(`
        INSERT INTO market_cap_rate_benchmarks (
          id,
          region,
          property_type,
          transaction_type,
          benchmark_cap_rate,
          cap_rate_range_low,
          cap_rate_range_high,
          sample_size,
          confidence_score,
          market_condition,
          yield_trend,
          data_quality,
          methodology,
          source_description,
          effective_date,
          expiry_date
        ) VALUES (
          gen_random_uuid(),
          $1::region_code_enum,
          $2::property_type_enum,
          'sale',
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          'listing_derived',
          $11,
          CURRENT_DATE,
          CURRENT_DATE + INTERVAL '30 days'
        )
        ON CONFLICT (region, property_type, methodology) 
        WHERE methodology = 'listing_derived'
        DO UPDATE SET
          benchmark_cap_rate = EXCLUDED.benchmark_cap_rate,
          cap_rate_range_low = EXCLUDED.cap_rate_range_low,
          cap_rate_range_high = EXCLUDED.cap_rate_range_high,
          sample_size = EXCLUDED.sample_size,
          confidence_score = EXCLUDED.confidence_score,
          effective_date = EXCLUDED.effective_date,
          expiry_date = EXCLUDED.expiry_date,
          updated_at = NOW()
      `, [
        region,
        propertyType,
        listingCapRate.derivedCapRate,
        listingCapRate.capRateLow,
        listingCapRate.capRateHigh,
        listingCapRate.sampleSize,
        listingCapRate.confidence,
        listingCapRate.marketCondition,
        listingCapRate.yieldTrend,
        listingCapRate.dataQuality,
        `Derived from ${listingCapRate.sampleSize} adjusted listings. ${listingCapRate.warnings[0]}`
      ]);

      logger.info('Saved listing-derived cap rate benchmark', {
        region,
        propertyType,
        capRate: listingCapRate.derivedCapRate,
        sampleSize: listingCapRate.sampleSize
      });
    } catch (error: any) {
      logger.warn('Failed to save listing-derived benchmark', {
        region,
        propertyType,
        error: error.message
      });
    }
  }

  /**
   * Determine location tier based on district/neighborhood.
   * Ghana-specific location classification.
   */
  private determineLocationTier(district?: string): string {
    if (!district) return 'secondary';

    const d = district.toLowerCase();

    // Prime locations in Greater Accra
    const primeAreas = [
      'airport residential', 'cantonments', 'ridge', 'roman ridge',
      'east legon', 'labone', 'osu', 'dzorwulu', 'airport hills',
      'trassaco', 'au village', 'regimanuel', 'east airport'
    ];

    // Good/secondary locations
    const goodAreas = [
      'adjiringanor', 'ashongman', 'kwabenya', 'haatso', 'dome',
      'spintex', 'tema community', 'sakumono', 'lashibi', 'baatsona',
      'dansoman', 'mamprobi', 'abelemkpe', 'tesano', 'north legon'
    ];

    // Tertiary locations
    const tertiaryAreas = [
      'madina', 'adenta', 'dodowa', 'oyarifa', 'abokobi',
      'pokuase', 'amasaman', 'kasoa', 'ablekuma', 'lapaz'
    ];

    if (primeAreas.some(area => d.includes(area))) return 'prime';
    if (goodAreas.some(area => d.includes(area))) return 'secondary';
    if (tertiaryAreas.some(area => d.includes(area))) return 'tertiary';

    return 'emerging';
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private calculateAgeAdjustment(age: number): number {
    if (age <= 5) return -0.005;    // New building - lower risk
    if (age <= 15) return 0;        // Neutral
    if (age <= 25) return 0.005;    // Some wear
    if (age <= 40) return 0.01;     // Significant depreciation
    return 0.015;                   // Old building - higher risk
  }

  private calculateConditionAdjustment(condition: string): number {
    const adjustments: Record<string, number> = {
      'excellent': -0.01,
      'good': -0.005,
      'average': 0,
      'fair': 0.005,
      'poor': 0.015,
    };
    return adjustments[condition.toLowerCase()] || 0;
  }

  private calculateOccupancyAdjustment(occupancyRate: number): number {
    if (occupancyRate >= 0.95) return -0.005;  // Fully occupied
    if (occupancyRate >= 0.85) return 0;       // Normal
    if (occupancyRate >= 0.75) return 0.005;   // Some vacancy
    if (occupancyRate >= 0.60) return 0.01;    // High vacancy
    return 0.02;                               // Very high vacancy risk
  }

  private calculateTenantQualityAdjustment(tenantQuality: string): number {
    const adjustments: Record<string, number> = {
      'national_credit': -0.01,    // National credit tenant
      'investment_grade': -0.005,  // Investment grade tenant
      'regional': 0,               // Regional tenant
      'local': 0.005,              // Local business
      'startup': 0.01,             // Startup/new business
    };
    return adjustments[tenantQuality.toLowerCase()] || 0;
  }

  private calculateLocationAdjustment(locationQuality: string): number {
    const adjustments: Record<string, number> = {
      'prime': -0.01,
      'good': -0.005,
      'average': 0,
      'secondary': 0.005,
      'tertiary': 0.01,
    };
    return adjustments[locationQuality.toLowerCase()] || 0;
  }

  private generateCapRateJustification(
    benchmark: MarketCapRateBenchmark,
    adjustments: CapRateAdjustment[],
    adjustedCapRate: number,
    region: string,
    propertyType: string
  ): string {
    let justification = `Cap rate derived from market analysis of ${propertyType.toLowerCase()} ` +
      `properties in ${region}. `;

    if (benchmark.sampleSize > 0) {
      justification += `Based on ${benchmark.sampleSize} market transactions, ` +
        `the benchmark cap rate is ${(benchmark.benchmarkCapRate * 100).toFixed(2)}% ` +
        `(range: ${(benchmark.capRateRangeLow * 100).toFixed(2)}%-${(benchmark.capRateRangeHigh * 100).toFixed(2)}%). `;
    } else {
      justification += `No recent market transactions available; using industry standard benchmarks. `;
    }

    if (adjustments.length > 0) {
      justification += `Property-specific adjustments applied for: ${adjustments.map(a => a.factor).join(', ')}. `;
    }

    justification += `Applied cap rate: ${(adjustedCapRate * 100).toFixed(2)}%.`;

    return justification;
  }

  private determineRicsQuality(
    noi: NOICalculation,
    capRate: PropertyCapRateEstimate
  ): string {
    let score = 0;

    // NOI quality
    if (noi.methodology === 'actual') score += 2;
    else if (noi.methodology === 'estimated' && noi.evidenceCount > 0) score += 1;

    // Cap rate quality
    if (capRate.dataQuality === 'high') score += 2;
    else if (capRate.dataQuality === 'moderate') score += 1;

    // Confidence
    if (noi.confidenceScore >= 0.7) score += 1;
    if (capRate.confidenceScore >= 0.7) score += 1;

    if (score >= 5) return 'compliant';
    if (score >= 3) return 'acceptable';
    if (score >= 1) return 'limited';
    return 'insufficient';
  }
}

// Export singleton instance
export const capRateService = new CapRateService();
