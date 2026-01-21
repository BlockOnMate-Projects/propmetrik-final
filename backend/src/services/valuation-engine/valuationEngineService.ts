/**
 * Valuation Engine - Core Service
 * 
 * Main orchestrator for property valuations.
 * Coordinates with Python Valuation Engine for method calculations.
 * 
 * Architecture:
 *   TypeScript Backend (Port 4000)        Python Engine (Port 8001)
 *   - API Routes                         - Sales Comparison
 *   - Workflow Services                  - Cost Approach
 *   - Database Operations                - Income Approach
 *   - Report Generation                  - Residual Method
 *                                        - Profits Method
 *                                        - DRC Method
 * 
 * @module valuation-engine
 */

import { query, getClient } from '../../database';
import { cache } from '../../database/redis';
import { logger } from '../../utils/logger';
import {
  ValuationPurpose,
  ValuationMethod,
  ValuationResult,
  CreateValuationInput,
  ValuationOptions,
  PropertyForValuation,
  MethodResult,
  MarketConditions,
  EconomicFactors,
  AdjustmentsSummary,
  ConfidenceLevel,
  PaginatedResult,
  ValuationFilters,
} from './types';
import { PythonClient } from './pythonClient';
import { economicDataService } from '../data-hub/economicDataService';
import { constructionCostService } from '../data-hub/constructionCostService';
import { capRateService } from './CapRateService';

// Initialize Python client for valuation method calculations
const pythonClient = new PythonClient();

// =====================================================
// CONSTANTS
// =====================================================

const DEFAULT_OPTIONS: ValuationOptions = {
  min_comparables: 3,
  max_comparables: 10,
  max_comparable_distance_km: 5,
  max_comparable_age_days: 365,
  include_user_contributions: true,
  force_recalculate: false,
};

// Method applicability by property type
const METHOD_APPLICABILITY: Record<string, ValuationMethod[]> = {
  house: ['sales_comparison', 'cost_approach'],
  residential_house: ['sales_comparison', 'cost_approach'],
  apartment: ['sales_comparison', 'cost_approach', 'income_approach'],
  residential_apartment: ['sales_comparison', 'cost_approach', 'income_approach'],
  townhouse: ['sales_comparison', 'cost_approach'],
  villa: ['sales_comparison', 'cost_approach'],
  land: ['sales_comparison', 'residual_method'],
  residential_land: ['sales_comparison', 'residual_method'],
  commercial_land: ['sales_comparison', 'residual_method'],
  commercial: ['sales_comparison', 'income_approach', 'cost_approach'],
  commercial_office: ['income_approach', 'sales_comparison', 'cost_approach'],
  commercial_retail: ['income_approach', 'sales_comparison', 'profits_method'],
  commercial_warehouse: ['cost_approach', 'income_approach'],
  office: ['income_approach', 'sales_comparison', 'cost_approach'],
  retail: ['income_approach', 'sales_comparison', 'profits_method'],
  industrial: ['cost_approach', 'income_approach', 'sales_comparison'],
  warehouse: ['cost_approach', 'income_approach'],
  hotel: ['profits_method', 'income_approach'],
  hospital: ['drc_method', 'profits_method'],
  school: ['drc_method', 'cost_approach'],
  religious: ['drc_method', 'cost_approach'],
  mixed_use: ['income_approach', 'sales_comparison', 'residual_method'],
  default: ['sales_comparison', 'cost_approach'],
};

// Method weights by property type and purpose
const DEFAULT_METHOD_WEIGHTS: Record<ValuationMethod, number> = {
  sales_comparison: 0.40,
  cost_approach: 0.25,
  income_approach: 0.25,
  residual_method: 0.10,
  profits_method: 0.00,
  drc_method: 0.00,
};

// =====================================================
// VALUATION SERVICE
// =====================================================

class ValuationEngineService {
  /**
   * Create a new valuation for a property
   */
  async createValuation(
    input: CreateValuationInput,
    options: ValuationOptions = {}
  ): Promise<ValuationResult> {
    const startTime = Date.now();
    const opts = { ...DEFAULT_OPTIONS, ...options };

    logger.info('Starting valuation', {
      propertyId: input.property_id,
      type: input.valuation_type || 'avm',
      purpose: input.valuation_purpose || 'sale'
    });

    try {
      // 1. Fetch property data
      const property = await this.getPropertyForValuation(input.property_id);
      if (!property) {
        throw new Error(`Property not found: ${input.property_id}`);
      }

      // 2. Check for cached valuation (if not force recalculate)
      if (!opts.force_recalculate) {
        const cached = await this.getCachedValuation(input.property_id);
        if (cached && this.isValuationValid(cached)) {
          logger.info('Returning cached valuation', {
            propertyId: input.property_id,
            cacheAge: Date.now() - new Date(cached.effective_date).getTime()
          });
          return cached;
        }
      }

      // 3. Get market conditions from Python service
      const pythonProperty = PythonClient.toPropertyInput(property);
      const marketConditionsResponse = await pythonClient.getMarketConditions({
        region: property.region || 'Greater Accra',
        property_type: property.property_type,
      });

      // Use Python service results for market conditions
      const marketConditions: MarketConditions = marketConditionsResponse.success
        ? PythonClient.toMarketConditions(marketConditionsResponse)
        : {
          trend: 'stable',
          trend_strength: 0.5,
          activity_level: 'moderate',
          days_on_market_avg: 90,
          supply_demand_ratio: 0.5,
          price_index: 100,
          price_index_change_yoy: 0.05,
        };

      // 3b. Get economic factors from live data service
      const economicFactors = await this.getEconomicFactors(property.region);

      // 4. Determine applicable methods
      const applicableMethods = this.determineApplicableMethods(
        property,
        input.valuation_purpose || 'sale',
        opts.methods
      );

      // 5. Execute each applicable method
      const methodResults: MethodResult[] = [];

      for (const method of applicableMethods) {
        try {
          const result = await this.executeMethod(method, property, opts, marketConditions);
          if (result && result.value > 0) {
            methodResults.push(result);
          }
        } catch (err: any) {
          logger.warn(`Method ${method} failed`, {
            propertyId: input.property_id,
            error: err.message
          });
        }
      }

      if (methodResults.length === 0) {
        throw new Error('No valuation methods produced valid results');
      }

      // 6. Calculate hybrid value with intelligent weighting
      const hybridResult = this.calculateHybridValue(methodResults, property, input.valuation_purpose || 'sale');

      // 7. Calculate confidence score using Python service
      let confidenceResult: { score: number; level: ConfidenceLevel; dataQuality: number };
      try {
        const confidenceResponse = await pythonClient.calculateConfidence({
          property: pythonProperty,
          method_results: methodResults.map(m => ({
            method: m.method,
            value: m.value,
            confidence: m.confidence,
          })),
          market_conditions: {
            market_trend: marketConditions.market_trend || marketConditions.trend || 'stable',
            supply_demand_ratio: marketConditions.supply_demand_ratio || 0.5,
            price_volatility: 0.1, // Default volatility
            average_dom: marketConditions.days_on_market_avg || marketConditions.days_on_market || 90,
          },
          data_quality: {
            completeness: 0.85, // Could calculate from property data
            recency: 0.9,
            source_reliability: 0.8,
          },
        });

        // Map Python response to expected format
        confidenceResult = {
          score: confidenceResponse.confidence_score || 0.75,
          level: (confidenceResponse.confidence_level as ConfidenceLevel) || 'medium',
          dataQuality: confidenceResponse.data_quality_score || 0.8,
        };
      } catch (error: any) {
        logger.warn('Confidence calculation failed, using fallback', { error: error.message });
        confidenceResult = {
          score: 0.75,
          level: 'medium',
          dataQuality: 0.7,
        };
      }

      // 8. Build final valuation result
      const valuation = this.buildValuationResult(
        input,
        property,
        hybridResult,
        methodResults,
        confidenceResult,
        marketConditions,
        economicFactors
      );

      // 9. Save to database
      const savedValuation = await this.saveValuation(valuation, property);

      // 10. Cache the result
      await this.cacheValuation(savedValuation);

      const duration = Date.now() - startTime;
      logger.info('Valuation completed', {
        propertyId: input.property_id,
        valuationId: savedValuation.id,
        estimatedValue: savedValuation.estimated_value,
        confidence: savedValuation.confidence_score,
        duration
      });

      return savedValuation;

    } catch (error: any) {
      logger.error('Valuation failed', {
        propertyId: input.property_id,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get a property with all data needed for valuation
   */
  private async getPropertyForValuation(propertyId: string): Promise<PropertyForValuation | null> {
    const result = await query<PropertyForValuation>(
      `SELECT 
        id, reference_number, region, 
        address_street, address_city, address_district, digital_address,
        latitude, longitude,
        property_type, property_sub_type, transaction_type,
        title, description,
        bedrooms, bathrooms, floors,
        total_area_sqm, land_area_sqm, built_area_sqm, building_size_sqm, plot_size_acres,
        year_built, condition,
        amenities, features,
        price, price_currency,
        data_quality_score,
        created_at, updated_at
      FROM properties
      WHERE id = $1`,
      [propertyId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      ...row,
      amenities: Array.isArray(row.amenities) ? row.amenities : [],
      features: Array.isArray(row.features) ? row.features : [],
      latitude: parseFloat(row.latitude as any),
      longitude: parseFloat(row.longitude as any),
    };
  }

  /**
   * Determine which valuation methods are applicable
   */
  private determineApplicableMethods(
    property: PropertyForValuation,
    purpose: ValuationPurpose,
    requestedMethods?: ValuationMethod[]
  ): ValuationMethod[] {
    // If specific methods requested, validate and return them
    if (requestedMethods && requestedMethods.length > 0) {
      return requestedMethods;
    }

    // Get methods applicable to this property type
    const propertyType = property.property_type || 'default';
    let methods = METHOD_APPLICABILITY[propertyType] || METHOD_APPLICABILITY.default;

    // Adjust based on purpose
    if (purpose === 'mortgage' || purpose === 'insurance') {
      // Banks prefer sales comparison and cost approach
      methods = methods.filter(m =>
        ['sales_comparison', 'cost_approach'].includes(m)
      );
    } else if (purpose === 'investment' || purpose === 'rental') {
      // Prioritize income approach for investment purposes
      if (!methods.includes('income_approach')) {
        methods = ['income_approach', ...methods];
      }
    } else if (purpose === 'development') {
      // Development valuations need residual method
      if (!methods.includes('residual_method')) {
        methods = ['residual_method', ...methods];
      }
    }

    // Ensure at least sales comparison if applicable
    if (methods.length === 0) {
      methods = ['sales_comparison'];
    }

    return methods;
  }

  /**
   * Execute a specific valuation method via Python service
   * For income_approach, uses CapRateService with RICS-compliant fallback hierarchy
   */
  private async executeMethod(
    method: ValuationMethod,
    property: PropertyForValuation,
    options: ValuationOptions,
    marketConditions: MarketConditions
  ): Promise<MethodResult | null> {
    try {
      logger.debug(`Executing method ${method}`);

      // Special handling for income_approach using CapRateService
      if (method === 'income_approach') {
        return await this.executeIncomeApproach(property, options, marketConditions);
      }

      // Convert property to Python input format
      const pythonProperty = PythonClient.toPropertyInput(property);

      // Call Python service for the specific method
      const pythonResponse = await pythonClient.executeMethod(method, pythonProperty, {
        max_comparable_distance_km: options.max_comparable_distance_km,
        max_comparable_age_days: options.max_comparable_age_days,
        min_comparables: options.min_comparables,
      });

      if (!pythonResponse.success) {
        logger.warn(`Method ${method} failed in Python service`);
        return null;
      }

      // Convert to TypeScript MethodResult format with weights
      const result = PythonClient.toMethodResult(pythonResponse);
      result.weight = this.getMethodWeight(method, property.property_type);

      return result;

    } catch (error: any) {
      logger.error(`Error executing method ${method}:`, { error: error.message });
      return null;
    }
  }

  /**
   * Execute income approach valuation using CapRateService.
   * Implements RICS-compliant cap rate selection with fallback hierarchy:
   *   1. Market extraction (transactions) - Category A
   *   2. Partner/bank data - Category A  
   *   3. Listing-derived - Category B
   *   4. Survey/default - Category C
   */
  private async executeIncomeApproach(
    property: PropertyForValuation,
    options: ValuationOptions,
    marketConditions: MarketConditions
  ): Promise<MethodResult | null> {
    try {
      logger.debug('Executing income approach with CapRateService', {
        propertyId: property.id,
        region: property.region,
        propertyType: property.property_type
      });

      // Get total area for NOI estimation
      const totalAreaSqm = property.total_area_sqm ||
        property.built_area_sqm ||
        property.building_size_sqm ||
        property.land_area_sqm ||
        0;

      if (totalAreaSqm <= 0) {
        logger.warn('Income approach requires area data', { propertyId: property.id });
        return null;
      }

      // Perform income approach valuation using CapRateService
      const incomeResult = await capRateService.performIncomeApproachValuation({
        propertyId: property.id,
        region: property.region || 'greater_accra',
        propertyType: property.property_type || 'residential_house',
        propertySubtype: property.property_sub_type || undefined,
        totalAreaSqm
      });

      // Calculate confidence level based on RICS compliance
      let confidence: number;
      switch (incomeResult.ricsCompliance.overallQuality) {
        case 'compliant':
          confidence = 0.85;
          break;
        case 'acceptable':
          confidence = 0.70;
          break;
        case 'limited':
          confidence = 0.55;
          break;
        default:
          confidence = 0.40;
      }

      // Build method result
      const methodResult: MethodResult = {
        method: 'income_approach',
        value: incomeResult.indicatedValue,
        confidence,
        weight: this.getMethodWeight('income_approach', property.property_type),
        details: {
          noi: {
            grossPotentialRent: incomeResult.noi.grossPotentialRent,
            vacancyRate: incomeResult.noi.vacancyRate,
            effectiveGrossIncome: incomeResult.noi.effectiveGrossIncome,
            operatingExpenses: incomeResult.noi.operatingExpenses,
            operatingExpenseRatio: incomeResult.noi.operatingExpenseRatio,
            netOperatingIncome: incomeResult.noi.netOperatingIncome,
            noiPerSqm: incomeResult.noi.noiPerSqm,
            methodology: incomeResult.noi.methodology,
            evidenceCount: incomeResult.noi.evidenceCount
          },
          capRate: {
            baseCapRate: incomeResult.capRate.baseCapRate,
            adjustedCapRate: incomeResult.capRate.adjustedCapRate,
            adjustments: incomeResult.capRate.adjustments,
            methodology: incomeResult.capRate.methodology,
            dataQuality: incomeResult.capRate.dataQuality,
            justification: incomeResult.capRate.justification
          },
          valueRange: incomeResult.valueRange,
          ricsCompliance: incomeResult.ricsCompliance,
          adjustments: incomeResult.capRate.adjustments.map(adj => ({
            type: adj.factor,
            amount: adj.adjustment,
            reason: adj.reason
          })),
          comparables_used: incomeResult.noi.evidenceCount,
          data_quality: incomeResult.capRate.dataQuality === 'high' ? 0.9
            : incomeResult.capRate.dataQuality === 'moderate' ? 0.7
              : 0.5,
          warnings: [
            ...incomeResult.capRate.warnings,
            ...incomeResult.ricsCompliance.notes
          ].filter(w => w)
        }
      };

      logger.info('Income approach completed via CapRateService', {
        propertyId: property.id,
        indicatedValue: incomeResult.indicatedValue,
        capRate: incomeResult.capRate.adjustedCapRate,
        noi: incomeResult.noi.netOperatingIncome,
        ricsQuality: incomeResult.ricsCompliance.overallQuality
      });

      return methodResult;

    } catch (error: any) {
      logger.error('Income approach execution failed', {
        propertyId: property.id,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Get economic factors from live data service with fallback to defaults
   * Uses economicDataService for real-time BOG rates, exchange rates, and CPI
   */
  private async getEconomicFactors(region?: string): Promise<EconomicFactors> {
    try {
      // Fetch latest economic snapshot from database
      const snapshot = await economicDataService.getLatestSnapshot();

      // Get latest construction cost index
      const constructionIndex = await constructionCostService.getLatestConstructionIndex(
        (region || 'greater_accra') as any
      );

      const factors: EconomicFactors = {
        inflation_rate: snapshot.inflation_rate ?? 0.12,
        interest_rate_policy: snapshot.interest_rate_policy ?? 0.27,
        mortgage_rate_avg: snapshot.mortgage_rate_avg ?? 0.32,
        exchange_rate_usd: snapshot.exchange_rate_usd ?? 15.5,
        gdp_growth: snapshot.gdp_growth ?? 0.032,
        construction_cost_index: constructionIndex?.index_value ?? 110,
        snapshot_date: snapshot.date || new Date(),
      };

      logger.debug('Loaded live economic factors', {
        inflation: factors.inflation_rate,
        policy_rate: factors.interest_rate_policy,
        usd_rate: factors.exchange_rate_usd,
        construction_index: factors.construction_cost_index,
      });

      return factors;
    } catch (error: any) {
      logger.warn('Failed to load live economic factors, using defaults', {
        error: error.message
      });

      // Fallback to sensible defaults
      return {
        inflation_rate: 0.12,
        interest_rate_policy: 0.27,
        mortgage_rate_avg: 0.32,
        exchange_rate_usd: 15.5,
        gdp_growth: 0.032,
        construction_cost_index: 110,
        snapshot_date: new Date(),
      };
    }
  }

  /**
   * Get weight for a valuation method based on property type
   */
  private getMethodWeight(method: ValuationMethod, propertyType: string): number {
    const weights: Record<string, Record<string, number>> = {
      residential: {
        sales_comparison: 0.50,
        cost_approach: 0.30,
        income_approach: 0.20,
        residual_method: 0.00,
        profits_method: 0.00,
        drc_method: 0.00,
      },
      commercial: {
        sales_comparison: 0.25,
        cost_approach: 0.20,
        income_approach: 0.55,
        residual_method: 0.00,
        profits_method: 0.00,
        drc_method: 0.00,
      },
      industrial: {
        sales_comparison: 0.20,
        cost_approach: 0.45,
        income_approach: 0.35,
        residual_method: 0.00,
        profits_method: 0.00,
        drc_method: 0.00,
      },
      land: {
        sales_comparison: 0.40,
        cost_approach: 0.00,
        income_approach: 0.00,
        residual_method: 0.60,
        profits_method: 0.00,
        drc_method: 0.00,
      },
    };

    const normalizedType = this.normalizePropertyType(propertyType);
    const typeWeights = weights[normalizedType] || weights.residential;
    return typeWeights[method] || 0.1;
  }

  /**
   * Normalize property type string
   */
  private normalizePropertyType(type: string): string {
    const typeMap: Record<string, string> = {
      house: 'residential',
      residential_house: 'residential',
      apartment: 'residential',
      residential_apartment: 'residential',
      townhouse: 'residential',
      villa: 'residential',
      commercial: 'commercial',
      commercial_office: 'commercial',
      office: 'commercial',
      retail: 'commercial',
      industrial: 'industrial',
      warehouse: 'industrial',
      land: 'land',
      residential_land: 'land',
      commercial_land: 'land',
    };
    return typeMap[type?.toLowerCase()] || 'residential';
  }

  /**
   * Calculate hybrid value from multiple methods with intelligent weighting
   */
  private calculateHybridValue(
    methodResults: MethodResult[],
    property: PropertyForValuation,
    purpose: ValuationPurpose
  ): {
    estimated_value: number;
    value_range_low: number;
    value_range_high: number;
    primary_method: ValuationMethod;
    comparables_count: number;
  } {
    if (methodResults.length === 0) {
      throw new Error('No method results to calculate hybrid value');
    }

    if (methodResults.length === 1) {
      const result = methodResults[0];
      const range = this.calculateValueRange(result.value, result.confidence);
      return {
        estimated_value: result.value,
        value_range_low: range.low,
        value_range_high: range.high,
        primary_method: result.method,
        comparables_count: (result.details as any)?.comparables_count || 0,
      };
    }

    // Normalize weights based on confidence
    const totalWeight = methodResults.reduce((sum, r) => sum + (r.weight * r.confidence), 0);

    // Calculate weighted average
    let weightedSum = 0;
    let highestWeight = 0;
    let primaryMethod: ValuationMethod = methodResults[0].method;
    let totalComparables = 0;

    for (const result of methodResults) {
      const normalizedWeight = (result.weight * result.confidence) / totalWeight;
      weightedSum += result.value * normalizedWeight;

      if (result.weight * result.confidence > highestWeight) {
        highestWeight = result.weight * result.confidence;
        primaryMethod = result.method;
      }

      totalComparables += (result.details as any)?.comparables_count || 0;
    }

    // Calculate confidence-weighted average confidence
    const avgConfidence = methodResults.reduce((sum, r) => sum + r.confidence, 0) / methodResults.length;
    const range = this.calculateValueRange(weightedSum, avgConfidence);

    return {
      estimated_value: Math.round(weightedSum),
      value_range_low: range.low,
      value_range_high: range.high,
      primary_method: primaryMethod,
      comparables_count: totalComparables,
    };
  }

  /**
   * Calculate value range based on confidence
   */
  private calculateValueRange(value: number, confidence: number): { low: number; high: number } {
    // Higher confidence = narrower range
    // Confidence 1.0 = ±5%, 0.5 = ±15%, 0.0 = ±25%
    const spreadPercent = 0.25 - (0.20 * confidence);

    return {
      low: Math.round(value * (1 - spreadPercent)),
      high: Math.round(value * (1 + spreadPercent)),
    };
  }

  /**
   * Build the final valuation result object
   */
  private buildValuationResult(
    input: CreateValuationInput,
    property: PropertyForValuation,
    hybridResult: any,
    methodResults: MethodResult[],
    confidenceResult: { score: number; level: ConfidenceLevel; dataQuality: number },
    marketConditions: MarketConditions,
    economicFactors: EconomicFactors
  ): ValuationResult {
    // Extract individual method values
    const getMethodValue = (method: ValuationMethod): number | null => {
      const result = methodResults.find(r => r.method === method);
      return result ? result.value : null;
    };

    const getMethodConfidence = (method: ValuationMethod): number | null => {
      const result = methodResults.find(r => r.method === method);
      return result ? result.confidence : null;
    };

    // Calculate value per sqm
    const buildingSize = property.building_size_sqm || property.built_area_sqm || property.total_area_sqm;
    const valuePerSqm = buildingSize ? Math.round(hybridResult.estimated_value / buildingSize) : null;

    // Build adjustments summary
    const adjustmentsSummary = this.buildAdjustmentsSummary(methodResults);

    // Calculate expiry date (typically 3 months for AVM, 6 months for professional)
    const effectiveDate = input.effective_date || new Date();
    const expiryMonths = input.valuation_type === 'professional' ? 6 : 3;
    const expiryDate = new Date(effectiveDate);
    expiryDate.setMonth(expiryDate.getMonth() + expiryMonths);

    return {
      property_id: input.property_id,
      valuation_type: input.valuation_type || 'avm',
      valuation_purpose: input.valuation_purpose || 'sale',

      estimated_value: hybridResult.estimated_value,
      value_range_low: hybridResult.value_range_low,
      value_range_high: hybridResult.value_range_high,
      value_per_sqm: valuePerSqm,
      value_currency: 'GHS',

      confidence_score: confidenceResult.score,
      confidence_level: confidenceResult.level,
      data_quality_score: confidenceResult.dataQuality,
      comparable_quality_score: null, // TODO: Calculate from comparables

      methods_used: methodResults,
      primary_method: hybridResult.primary_method,

      sales_comparison_value: getMethodValue('sales_comparison'),
      sales_comparison_confidence: getMethodConfidence('sales_comparison'),
      cost_approach_value: getMethodValue('cost_approach'),
      cost_approach_confidence: getMethodConfidence('cost_approach'),
      income_approach_value: getMethodValue('income_approach'),
      income_approach_confidence: getMethodConfidence('income_approach'),
      residual_value: getMethodValue('residual_method'),
      residual_confidence: getMethodConfidence('residual_method'),
      profits_value: getMethodValue('profits_method'),
      profits_confidence: getMethodConfidence('profits_method'),
      drc_value: getMethodValue('drc_method'),
      drc_confidence: getMethodConfidence('drc_method'),

      comparables_count: hybridResult.comparables_count,
      comparables: [], // Populated by sales comparison service

      market_conditions: marketConditions,
      economic_factors: economicFactors,
      adjustments_summary: adjustmentsSummary,

      effective_date: effectiveDate,
      expiry_date: expiryDate,

      status: 'completed',
    };
  }

  /**
   * Build adjustments summary from method results
   */
  private buildAdjustmentsSummary(methodResults: MethodResult[]): AdjustmentsSummary {
    const summary: AdjustmentsSummary = {
      total_adjustments_count: 0,
      total_positive_adjustments: 0,
      total_negative_adjustments: 0,
      net_adjustment_percent: 0,
      adjustment_categories: {},
    };

    // Extract adjustment info from sales comparison method
    const salesComparison = methodResults.find(r => r.method === 'sales_comparison');
    if (salesComparison?.details) {
      const details = salesComparison.details as any;
      if (details.adjustments_summary) {
        Object.assign(summary, details.adjustments_summary);
      }
    }

    return summary;
  }

  /**
   * Save valuation to database
   */
  private async saveValuation(
    valuation: ValuationResult,
    property: PropertyForValuation
  ): Promise<ValuationResult> {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Create property snapshot
      const propertySnapshot = {
        id: property.id,
        address: `${property.address_street || ''}, ${property.address_city}`.trim().replace(/^,\s*/, ''),
        property_type: property.property_type,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        building_size_sqm: property.building_size_sqm || property.built_area_sqm,
        land_size_sqm: property.land_area_sqm,
        year_built: property.year_built,
        condition: property.condition,
        current_price: property.price,
        snapshot_date: new Date(),
      };

      // Insert valuation
      const result = await client.query<{ id: string }>(
        `INSERT INTO valuations (
          property_id, property_snapshot,
          valuation_type, valuation_purpose,
          estimated_value, value_range_low, value_range_high, value_per_sqm, value_currency,
          confidence_score, confidence_level, data_quality_score, comparable_quality_score,
          methods_used, primary_method,
          sales_comparison_value, sales_comparison_confidence,
          cost_approach_value, cost_approach_confidence,
          income_approach_value, income_approach_confidence,
          residual_value, residual_confidence,
          profits_value, profits_confidence,
          drc_value, drc_confidence,
          comparables_count, comparables_used,
          market_conditions, economic_factors, adjustments_summary,
          effective_date, expiry_date,
          status, is_latest
        ) VALUES (
          $1, $2,
          $3, $4,
          $5, $6, $7, $8, $9,
          $10, $11, $12, $13,
          $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,
          $28, $29,
          $30, $31, $32,
          $33, $34,
          $35, true
        ) RETURNING id`,
        [
          valuation.property_id,
          JSON.stringify(propertySnapshot),
          valuation.valuation_type,
          valuation.valuation_purpose,
          valuation.estimated_value,
          valuation.value_range_low,
          valuation.value_range_high,
          valuation.value_per_sqm,
          valuation.value_currency,
          valuation.confidence_score,
          valuation.confidence_level,
          valuation.data_quality_score,
          valuation.comparable_quality_score,
          JSON.stringify(valuation.methods_used),
          valuation.primary_method,
          valuation.sales_comparison_value,
          valuation.sales_comparison_confidence,
          valuation.cost_approach_value,
          valuation.cost_approach_confidence,
          valuation.income_approach_value,
          valuation.income_approach_confidence,
          valuation.residual_value,
          valuation.residual_confidence,
          valuation.profits_value,
          valuation.profits_confidence,
          valuation.drc_value,
          valuation.drc_confidence,
          valuation.comparables_count,
          JSON.stringify(valuation.comparables.map(c => ({ id: c.id, price: c.sale_price, adjusted_price: c.adjusted_price }))),
          JSON.stringify(valuation.market_conditions),
          JSON.stringify(valuation.economic_factors),
          JSON.stringify(valuation.adjustments_summary),
          valuation.effective_date,
          valuation.expiry_date,
          valuation.status,
        ]
      );

      await client.query('COMMIT');

      return {
        ...valuation,
        id: result.rows[0].id,
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get cached valuation
   */
  private async getCachedValuation(propertyId: string): Promise<ValuationResult | null> {
    try {
      const cached = await cache.get<ValuationResult>(`valuation:${propertyId}`);
      return cached;
    } catch {
      return null;
    }
  }

  /**
   * Cache valuation result
   */
  private async cacheValuation(valuation: ValuationResult): Promise<void> {
    try {
      // Cache for 24 hours
      await cache.set(`valuation:${valuation.property_id}`, valuation, 24 * 60 * 60);
    } catch (err: any) {
      logger.warn('Failed to cache valuation', { error: err.message });
    }
  }

  /**
   * Check if cached valuation is still valid
   */
  private isValuationValid(valuation: ValuationResult): boolean {
    if (!valuation.expiry_date) return false;
    return new Date(valuation.expiry_date) > new Date();
  }

  /**
   * Get valuation by ID with property details
   */
  async getValuation(id: string): Promise<ValuationResult | null> {
    const result = await query(
      `SELECT v.*, 
        p.id as prop_id,
        p.reference_number as prop_reference_number,
        p.title as prop_title,
        p.address_street as prop_address,
        p.address_city as prop_city,
        p.address_district as prop_district,
        p.region as prop_region,
        p.digital_address as prop_digital_address,
        p.property_type as prop_property_type,
        p.bedrooms as prop_bedrooms,
        p.bathrooms as prop_bathrooms,
        p.land_area_sqm as prop_land_area,
        p.built_area_sqm as prop_built_area,
        p.year_built as prop_year_built,
        p.condition as prop_condition
       FROM valuations v
       LEFT JOIN properties p ON v.property_id = p.id
       WHERE v.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToValuation(result.rows[0]);
  }

  /**
   * Get latest valuation for a property
   */
  async getLatestValuation(propertyId: string): Promise<ValuationResult | null> {
    const result = await query(
      `SELECT * FROM valuations 
       WHERE property_id = $1 AND is_latest = true
       ORDER BY created_at DESC LIMIT 1`,
      [propertyId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToValuation(result.rows[0]);
  }

  /**
   * Get valuation history for a property
   */
  async getValuationHistory(propertyId: string, limit: number = 10): Promise<ValuationResult[]> {
    const result = await query(
      `SELECT * FROM valuations 
       WHERE property_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [propertyId, limit]
    );

    return result.rows.map(row => this.mapRowToValuation(row));
  }

  /**
   * List valuations with filtering and pagination
   */
  async listValuations(filters: ValuationFilters = {}): Promise<PaginatedResult<ValuationResult>> {
    const {
      page = 1,
      limit = 20,
      property_id,
      valuer_id,
      valuation_type,
      status,
      from_date,
      to_date,
      min_value,
      max_value,
      sort_by = 'created_at',
      sort_order = 'desc',
    } = filters;

    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (property_id) {
      conditions.push(`property_id = $${paramIndex++}`);
      params.push(property_id);
    }
    if (valuer_id) {
      conditions.push(`valuer_id = $${paramIndex++}`);
      params.push(valuer_id);
    }
    if (valuation_type) {
      conditions.push(`valuation_type = $${paramIndex++}`);
      params.push(valuation_type);
    }
    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }
    if (from_date) {
      conditions.push(`effective_date >= $${paramIndex++}`);
      params.push(from_date);
    }
    if (to_date) {
      conditions.push(`effective_date <= $${paramIndex++}`);
      params.push(to_date);
    }
    if (min_value) {
      conditions.push(`estimated_value >= $${paramIndex++}`);
      params.push(min_value);
    }
    if (max_value) {
      conditions.push(`estimated_value <= $${paramIndex++}`);
      params.push(max_value);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const validSortColumns = ['created_at', 'effective_date', 'estimated_value', 'confidence_score'];
    const safeSortBy = validSortColumns.includes(sort_by) ? sort_by : 'created_at';
    const safeSortOrder = sort_order === 'asc' ? 'ASC' : 'DESC';

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) FROM valuations ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await query(
      `SELECT * FROM valuations ${whereClause}
       ORDER BY ${safeSortBy} ${safeSortOrder}
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, limit, offset]
    );

    const totalPages = Math.ceil(total / limit);

    return {
      data: dataResult.rows.map(row => this.mapRowToValuation(row)),
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  /**
   * Map database row to ValuationResult
   */
  private mapRowToValuation(row: any): ValuationResult {
    // Build property object if property data is present (from JOIN)
    // Include both camelCase and snake_case fields for frontend compatibility
    const property = row.prop_id ? {
      id: row.prop_id,
      reference_number: row.prop_reference_number,
      title: row.prop_title,
      address: row.prop_address,
      address_street: row.prop_address,
      city: row.prop_city,
      address_city: row.prop_city,
      district: row.prop_district,
      address_district: row.prop_district,
      region: row.prop_region,
      digitalAddress: row.prop_digital_address,
      digital_address: row.prop_digital_address,
      propertyType: row.prop_property_type,
      property_type: row.prop_property_type,
      bedrooms: row.prop_bedrooms,
      bathrooms: row.prop_bathrooms,
      landArea: row.prop_land_area ? parseFloat(row.prop_land_area) : null,
      land_area_sqm: row.prop_land_area ? parseFloat(row.prop_land_area) : null,
      plotSize: row.prop_land_area ? parseFloat(row.prop_land_area) : null,
      plot_size: row.prop_land_area ? parseFloat(row.prop_land_area) : null,
      builtArea: row.prop_built_area ? parseFloat(row.prop_built_area) : null,
      building_area_sqm: row.prop_built_area ? parseFloat(row.prop_built_area) : null,
      grossFloorArea: row.prop_built_area ? parseFloat(row.prop_built_area) : null,
      yearBuilt: row.prop_year_built,
      year_built: row.prop_year_built,
      condition: row.prop_condition,
    } : null;

    return {
      id: row.id,
      property_id: row.property_id,
      property,  // Include property data
      valuation_type: row.valuation_type,
      valuation_purpose: row.valuation_purpose,
      current_step: row.current_step || 1,
      status: row.status,
      estimated_value: parseFloat(row.estimated_value),
      final_value_ghs: parseFloat(row.estimated_value), // Map for frontend compatibility
      value_range_low: parseFloat(row.value_range_low),
      value_range_high: parseFloat(row.value_range_high),
      value_per_sqm: row.value_per_sqm ? parseFloat(row.value_per_sqm) : null,
      value_currency: row.value_currency,
      confidence_score: parseFloat(row.confidence_score),
      confidence_level: row.confidence_level,
      data_quality_score: parseFloat(row.data_quality_score),
      comparable_quality_score: row.comparable_quality_score ? parseFloat(row.comparable_quality_score) : null,
      methods_used: row.methods_used || [],
      methods_applied: row.methods_applied || [],  // Selected methods from method selection step
      method_weights: row.method_weights || {},    // Method weights from method selection step
      method_results: row.method_results || {},    // Results from each method
      primary_method: row.primary_method,
      sales_comparison_value: row.sales_comparison_value ? parseFloat(row.sales_comparison_value) : null,
      sales_comparison_confidence: row.sales_comparison_confidence ? parseFloat(row.sales_comparison_confidence) : null,
      cost_approach_value: row.cost_approach_value ? parseFloat(row.cost_approach_value) : null,
      cost_approach_confidence: row.cost_approach_confidence ? parseFloat(row.cost_approach_confidence) : null,
      income_approach_value: row.income_approach_value ? parseFloat(row.income_approach_value) : null,
      income_approach_confidence: row.income_approach_confidence ? parseFloat(row.income_approach_confidence) : null,
      residual_value: row.residual_value ? parseFloat(row.residual_value) : null,
      residual_confidence: row.residual_confidence ? parseFloat(row.residual_confidence) : null,
      profits_value: row.profits_value ? parseFloat(row.profits_value) : null,
      profits_confidence: row.profits_confidence ? parseFloat(row.profits_confidence) : null,
      drc_value: row.drc_value ? parseFloat(row.drc_value) : null,
      drc_confidence: row.drc_confidence ? parseFloat(row.drc_confidence) : null,
      comparables_count: row.comparables_count,
      comparables: [],
      market_conditions: row.market_conditions || {},
      economic_factors: row.economic_factors || {},
      adjustments_summary: row.adjustments_summary || {},
      rental_market_analysis: row.rental_market_analysis || null,  // Rental comparable analysis data
      effective_date: row.effective_date,
      expiry_date: row.expiry_date,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

export const valuationEngineService = new ValuationEngineService();
export default valuationEngineService;
