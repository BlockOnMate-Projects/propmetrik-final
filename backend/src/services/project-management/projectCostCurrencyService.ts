/**
 * Project Cost Currency Service
 * Phase 1 Sprint 1: Multi-Currency Budget Support
 * 
 * Extends project cost management with currency conversion capabilities
 * using existing Data Hub services:
 * - fxFeedService (real-time exchange rates)
 * - constructionCostService (material/labor cost benchmarks)
 * 
 * IMPORTANT: This service CONSUMES Data Hub services, NOT duplicates them.
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';

// Import existing Data Hub services - DO NOT DUPLICATE
import { FXFeedService } from '../data-hub/scrapers/fxFeedService';
import { constructionCostService, ConstructionEstimate, RegionCode, MaterialCategory } from '../data-hub/constructionCostService';

// Import project cost types
import { CostCategory, BudgetSummary, CategoryBudget } from './projectCostService';

// ============================================================================
// TYPES
// ============================================================================

export type SupportedCurrency = 'GHS' | 'USD' | 'EUR' | 'GBP';

export interface CurrencyAmount {
  amount: number;
  currency: SupportedCurrency;
}

export interface ConvertedBudget {
  original: CurrencyAmount;
  converted: CurrencyAmount;
  exchangeRate: number;
  rateSource: string;
  rateTimestamp: Date;
}

export interface MultiCurrencyBudgetSummary extends BudgetSummary {
  display_currency: SupportedCurrency;
  original_currency: SupportedCurrency;
  exchange_rates: Record<string, number>;
  rates_as_of: Date;
  
  // Amounts in display currency
  total_original_budget_display: number;
  total_committed_display: number;
  total_actual_display: number;
  total_projected_display: number;
}

export interface CostEstimateInput {
  project_type: 'residential_single' | 'residential_multi' | 'commercial' | 'mixed_use';
  total_sqm: number;
  total_floors: number;
  region: RegionCode;
  finish_level: 'basic' | 'standard' | 'premium' | 'luxury';
  include_land?: boolean;
  land_cost_per_sqm?: number;
}

export interface CostBreakdown {
  category: CostCategory;
  description: string;
  estimated_cost_ghs: number;
  estimated_cost_display: number;
  display_currency: SupportedCurrency;
  percentage_of_total: number;
  unit_cost_per_sqm?: number;
  data_source: string;
  confidence: number;
}

export interface ProjectCostEstimate {
  total_estimated_cost_ghs: number;
  total_estimated_cost_display: number;
  display_currency: SupportedCurrency;
  cost_per_sqm_ghs: number;
  cost_per_sqm_display: number;
  breakdown: CostBreakdown[];
  assumptions: string[];
  data_sources: string[];
  generated_at: Date;
  valid_for_days: number;
}

// Finish level multipliers (relative to standard = 1.0)
const FINISH_LEVEL_MULTIPLIERS: Record<string, number> = {
  basic: 0.75,
  standard: 1.0,
  premium: 1.35,
  luxury: 1.85,
};

// Project type base cost adjustments (per sqm in GHS)
const PROJECT_TYPE_BASE_COSTS: Record<string, number> = {
  residential_single: 3500,    // Single house
  residential_multi: 4200,     // Apartment building (higher due to shared systems)
  commercial: 5000,            // Office building
  mixed_use: 4800,             // Mixed commercial/residential
};

// Regional cost adjustments (relative to Greater Accra = 1.0)
const REGIONAL_COST_FACTORS: Record<string, number> = {
  greater_accra: 1.0,
  kumasi_metro: 0.92,
  ashanti: 0.90,
  eastern: 0.88,
  western: 0.90,
  western_cluster: 0.88,
  central: 0.88,
  volta: 0.85,
  northern: 0.82,
  northern_cluster: 0.80,
  upper_east: 0.78,
  upper_west: 0.75,
  bono: 0.85,
  bono_east: 0.84,
  ahafo: 0.83,
  savannah: 0.78,
  north_east: 0.77,
  oti: 0.80,
  western_north: 0.85,
};

// Category allocation percentages (based on Ghana construction data)
const CATEGORY_ALLOCATIONS: Record<CostCategory, { percentage: number; name: string }> = {
  land_acquisition: { percentage: 0, name: 'Land Acquisition' }, // Handled separately
  permits_approvals: { percentage: 0.025, name: 'Permits & Approvals' },
  design_engineering: { percentage: 0.06, name: 'Design & Engineering' },
  site_preparation: { percentage: 0.04, name: 'Site Preparation' },
  foundation: { percentage: 0.12, name: 'Foundation' },
  structural: { percentage: 0.20, name: 'Structural Works' },
  roofing: { percentage: 0.08, name: 'Roofing' },
  mep: { percentage: 0.15, name: 'MEP (Electrical, Plumbing, HVAC)' },
  exterior_finishing: { percentage: 0.08, name: 'Exterior Finishing' },
  interior_finishing: { percentage: 0.12, name: 'Interior Finishing' },
  landscaping: { percentage: 0.02, name: 'Landscaping' },
  amenities: { percentage: 0.03, name: 'Amenities' },
  contingency: { percentage: 0.05, name: 'Contingency' },
  professional_fees: { percentage: 0.04, name: 'Professional Fees' },
  insurance: { percentage: 0.015, name: 'Insurance' },
  marketing_sales: { percentage: 0.025, name: 'Marketing & Sales' },
  legal: { percentage: 0.01, name: 'Legal Fees' },
  financing_costs: { percentage: 0.02, name: 'Financing Costs' },
  other: { percentage: 0, name: 'Other' },
};

// ============================================================================
// SERVICE CLASS
// ============================================================================

class ProjectCostCurrencyService {
  private fxService: FXFeedService;

  constructor() {
    this.fxService = new FXFeedService();
  }

  /**
   * Convert an amount from one currency to another
   * Uses Data Hub fxFeedService for real-time rates
   */
  async convertCurrency(
    amount: number,
    fromCurrency: SupportedCurrency,
    toCurrency: SupportedCurrency
  ): Promise<ConvertedBudget> {
    // If same currency, no conversion needed
    if (fromCurrency === toCurrency) {
      return {
        original: { amount, currency: fromCurrency },
        converted: { amount, currency: toCurrency },
        exchangeRate: 1,
        rateSource: 'identity',
        rateTimestamp: new Date(),
      };
    }

    // All rates are stored as X/GHS, so we need to calculate cross-rates
    let exchangeRate: number;
    let rateSource: string;
    let rateTimestamp: Date;

    if (fromCurrency === 'GHS') {
      // Converting FROM GHS to foreign currency
      const rate = await this.fxService.getCurrentRate(toCurrency);
      exchangeRate = 1 / rate.rate; // Invert: GHS→USD = 1/(USD→GHS)
      rateSource = rate.source;
      rateTimestamp = rate.timestamp;
    } else if (toCurrency === 'GHS') {
      // Converting TO GHS from foreign currency
      const rate = await this.fxService.getCurrentRate(fromCurrency);
      exchangeRate = rate.rate;
      rateSource = rate.source;
      rateTimestamp = rate.timestamp;
    } else {
      // Cross-rate through GHS
      const fromRate = await this.fxService.getCurrentRate(fromCurrency);
      const toRate = await this.fxService.getCurrentRate(toCurrency);
      
      // fromCurrency → GHS → toCurrency
      exchangeRate = fromRate.rate / toRate.rate;
      rateSource = `${fromRate.source} + ${toRate.source} (cross-rate)`;
      rateTimestamp = fromRate.timestamp;
    }

    const convertedAmount = Math.round(amount * exchangeRate * 100) / 100;

    return {
      original: { amount, currency: fromCurrency },
      converted: { amount: convertedAmount, currency: toCurrency },
      exchangeRate,
      rateSource,
      rateTimestamp,
    };
  }

  /**
   * Get current exchange rates for all supported currencies
   */
  async getAllExchangeRates(): Promise<{
    rates: Record<string, number>;
    baseCurrency: 'GHS';
    timestamp: Date;
    sources: Record<string, string>;
  }> {
    const rates: Record<string, number> = { GHS: 1 };
    const sources: Record<string, string> = { GHS: 'base' };
    let latestTimestamp = new Date();

    for (const currency of ['USD', 'EUR', 'GBP'] as const) {
      try {
        const rate = await this.fxService.getCurrentRate(currency);
        rates[currency] = rate.rate;
        sources[currency] = rate.source;
        latestTimestamp = rate.timestamp;
      } catch (error) {
        logger.warn(`Failed to fetch ${currency} rate`, { error });
        // Use fallback
        rates[currency] = currency === 'USD' ? 15.5 : currency === 'EUR' ? 16.8 : 19.5;
        sources[currency] = 'fallback';
      }
    }

    return {
      rates,
      baseCurrency: 'GHS',
      timestamp: latestTimestamp,
      sources,
    };
  }

  /**
   * Convert project budget summary to display currency
   */
  async convertBudgetSummary(
    summary: BudgetSummary,
    displayCurrency: SupportedCurrency
  ): Promise<MultiCurrencyBudgetSummary> {
    const ratesData = await this.getAllExchangeRates();
    
    // Assume original budget is in GHS
    const rate = displayCurrency === 'GHS' ? 1 : (1 / ratesData.rates[displayCurrency]);

    return {
      ...summary,
      display_currency: displayCurrency,
      original_currency: 'GHS',
      exchange_rates: ratesData.rates,
      rates_as_of: ratesData.timestamp,
      
      total_original_budget_display: Math.round(summary.total_original_budget * rate * 100) / 100,
      total_committed_display: Math.round(summary.total_committed * rate * 100) / 100,
      total_actual_display: Math.round(summary.total_actual * rate * 100) / 100,
      total_projected_display: Math.round(summary.total_projected * rate * 100) / 100,
    };
  }

  /**
   * Generate construction cost estimate using Data Hub constructionCostService
   * plus Ghana-specific calculation logic
   */
  async generateCostEstimate(
    input: CostEstimateInput,
    displayCurrency: SupportedCurrency = 'GHS'
  ): Promise<ProjectCostEstimate> {
    const assumptions: string[] = [];
    const dataSources: string[] = [];

    // 1. Get base construction cost from Data Hub
    let baseCostPerSqm: number;
    let constructionEstimate: ConstructionEstimate | null = null;

    try {
      // Map project type to constructionCostService property types
      const propertyTypeMap: Record<string, 'residential' | 'commercial' | 'industrial'> = {
        residential: 'residential',
        residential_single: 'residential',
        residential_multi: 'residential',
        commercial: 'commercial',
        industrial: 'industrial',
        mixed_use: 'commercial',
      };
      const propertyType = propertyTypeMap[input.project_type] || 'residential';
      const qualityLevel = (input.finish_level || 'standard') as 'basic' | 'standard' | 'premium' | 'luxury';
      
      // Try to get actual cost estimate from constructionCostService
      constructionEstimate = await constructionCostService.estimateConstructionCost(
        propertyType,
        qualityLevel,
        input.region,
        input.total_sqm,
        input.total_floors
      );

      if (constructionEstimate && constructionEstimate.estimates.total > 0) {
        baseCostPerSqm = constructionEstimate.estimates.cost_per_sqm;
        dataSources.push('Data Hub Construction Cost Service');
        assumptions.push(`Cost estimate calculated with ${constructionEstimate.assumptions.length} assumptions`);
      } else {
        throw new Error('No construction estimate available');
      }
    } catch (error) {
      // Fallback to calculated estimate
      logger.warn('Using fallback construction cost calculation', { error, input });
      
      const projectBaseRate = PROJECT_TYPE_BASE_COSTS[input.project_type] || 4000;
      const finishMultiplier = FINISH_LEVEL_MULTIPLIERS[input.finish_level] || 1.0;
      const regionFactor = REGIONAL_COST_FACTORS[input.region] || 1.0;
      
      // Multi-floor premium (5% per floor above ground)
      const floorPremium = 1 + (Math.max(0, input.total_floors - 1) * 0.05);
      
      baseCostPerSqm = projectBaseRate * finishMultiplier * regionFactor * floorPremium;
      
      dataSources.push('PropMetrik Cost Calculator');
      assumptions.push('Using standard Ghana construction cost indices');
      assumptions.push(`Finish level: ${input.finish_level} (${finishMultiplier}x multiplier)`);
      assumptions.push(`Regional factor for ${input.region}: ${regionFactor}x`);
    }

    // 2. Calculate total construction cost (excluding land)
    const constructionCostGhs = baseCostPerSqm * input.total_sqm;

    // 3. Add land cost if applicable
    let landCostGhs = 0;
    if (input.include_land && input.land_cost_per_sqm) {
      landCostGhs = input.land_cost_per_sqm * input.total_sqm;
      assumptions.push(`Land cost: GHS ${input.land_cost_per_sqm}/sqm`);
    }

    // 4. Calculate breakdown by category
    const breakdown: CostBreakdown[] = [];
    const totalCostGhs = constructionCostGhs + landCostGhs;

    // Add land as first item if included
    if (landCostGhs > 0) {
      breakdown.push({
        category: 'land_acquisition',
        description: CATEGORY_ALLOCATIONS.land_acquisition.name,
        estimated_cost_ghs: landCostGhs,
        estimated_cost_display: 0, // Will be converted below
        display_currency: displayCurrency,
        percentage_of_total: (landCostGhs / totalCostGhs) * 100,
        unit_cost_per_sqm: input.land_cost_per_sqm,
        data_source: 'user_provided',
        confidence: 1.0,
      });
    }

    // Add construction cost categories
    for (const [category, info] of Object.entries(CATEGORY_ALLOCATIONS)) {
      if (category === 'land_acquisition' || info.percentage === 0) continue;
      
      const categoryCostGhs = constructionCostGhs * info.percentage;
      
      breakdown.push({
        category: category as CostCategory,
        description: info.name,
        estimated_cost_ghs: Math.round(categoryCostGhs),
        estimated_cost_display: 0, // Will be converted below
        display_currency: displayCurrency,
        percentage_of_total: (categoryCostGhs / totalCostGhs) * 100,
        unit_cost_per_sqm: baseCostPerSqm * info.percentage,
        data_source: constructionEstimate ? 'data_hub' : 'calculated',
        confidence: constructionEstimate ? 0.85 : 0.7,
      });
    }

    // 5. Convert to display currency
    const ratesData = await this.getAllExchangeRates();
    const displayRate = displayCurrency === 'GHS' ? 1 : (1 / ratesData.rates[displayCurrency]);

    for (const item of breakdown) {
      item.estimated_cost_display = Math.round(item.estimated_cost_ghs * displayRate);
    }

    const result: ProjectCostEstimate = {
      total_estimated_cost_ghs: Math.round(totalCostGhs),
      total_estimated_cost_display: Math.round(totalCostGhs * displayRate),
      display_currency: displayCurrency,
      cost_per_sqm_ghs: Math.round(baseCostPerSqm),
      cost_per_sqm_display: Math.round(baseCostPerSqm * displayRate),
      breakdown,
      assumptions,
      data_sources: dataSources,
      generated_at: new Date(),
      valid_for_days: 30, // Construction costs typically valid for 30 days
    };

    logger.info('Generated construction cost estimate', {
      totalCostGhs: result.total_estimated_cost_ghs,
      costPerSqm: result.cost_per_sqm_ghs,
      totalSqm: input.total_sqm,
      region: input.region,
      projectType: input.project_type,
      finishLevel: input.finish_level,
    });

    return result;
  }

  /**
   * Get material cost benchmarks for a specific region
   * Delegates to Data Hub constructionCostService
   */
  async getMaterialCostBenchmarks(
    region: RegionCode,
    category?: string
  ): Promise<Array<{
    material: string;
    category: string;
    price_ghs: number;
    unit: string;
    last_updated: Date;
    source: string;
  }>> {
    try {
      const prices = await constructionCostService.getMaterialPrices({
        region,
        category: category as MaterialCategory | undefined,
      });

      return prices.map(p => ({
        material: p.material_name,
        category: p.material_category,
        price_ghs: p.price_ghs,
        unit: p.unit,
        last_updated: p.survey_date,
        source: p.is_verified ? 'verified' : 'survey',
      }));
    } catch (error) {
      logger.warn('Failed to fetch material cost benchmarks', { error, region });
      return [];
    }
  }

  /**
   * Get labor rate benchmarks for a specific region
   * Delegates to Data Hub constructionCostService
   */
  async getLaborRateBenchmarks(
    region: RegionCode
  ): Promise<Array<{
    labor_type: string;
    skill_level: string;
    daily_rate_ghs: number;
    last_updated: Date;
  }>> {
    try {
      const rates = await constructionCostService.getLaborRates({
        region,
      });

      return rates.map(r => ({
        labor_type: r.labor_category,
        skill_level: r.skill_level,
        daily_rate_ghs: r.rate_ghs,
        last_updated: r.survey_date,
      }));
    } catch (error) {
      logger.warn('Failed to fetch labor rate benchmarks', { error, region });
      return [];
    }
  }

  /**
   * Capture exchange rate snapshot for a project
   * Stores rates at project creation for historical reference
   */
  async captureExchangeRateSnapshot(
    projectId: string
  ): Promise<Record<string, any>> {
    const ratesData = await this.getAllExchangeRates();

    const snapshot = {
      USD_GHS: ratesData.rates.USD,
      EUR_GHS: ratesData.rates.EUR,
      GBP_GHS: ratesData.rates.GBP,
      captured_at: ratesData.timestamp.toISOString(),
      sources: ratesData.sources,
    };

    // Update project with exchange rate snapshot
    await pool.query(
      `UPDATE development_projects 
       SET base_exchange_rate = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [JSON.stringify(snapshot), projectId]
    );

    logger.info('Captured exchange rate snapshot for project', {
      projectId,
      rates: snapshot,
    });

    return snapshot;
  }

  /**
   * Get stored exchange rate snapshot for a project
   * Returns historical rates from project creation
   */
  async getProjectExchangeRateSnapshot(
    projectId: string
  ): Promise<Record<string, any> | null> {
    const result = await pool.query(
      `SELECT base_exchange_rate FROM development_projects WHERE id = $1`,
      [projectId]
    );

    if (result.rows.length === 0 || !result.rows[0].base_exchange_rate) {
      return null;
    }

    return result.rows[0].base_exchange_rate;
  }

  /**
   * Calculate budget variance in multiple currencies
   */
  async calculateBudgetVarianceMultiCurrency(
    projectId: string,
    displayCurrency: SupportedCurrency = 'GHS'
  ): Promise<{
    budgeted: CurrencyAmount;
    spent: CurrencyAmount;
    variance: CurrencyAmount;
    variance_percent: number;
    using_current_rates: boolean;
    rate_comparison?: {
      original_rate: number;
      current_rate: number;
      rate_change_percent: number;
    };
  }> {
    // Get project budget info
    const projectResult = await pool.query(
      `SELECT total_budget, total_spent, base_exchange_rate, display_currency
       FROM development_projects WHERE id = $1`,
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      throw new Error('Project not found');
    }

    const project = projectResult.rows[0];
    const totalBudget = parseFloat(project.total_budget) || 0;
    const totalSpent = parseFloat(project.total_spent) || 0;
    const variance = totalBudget - totalSpent;
    const variancePercent = totalBudget > 0 ? ((variance / totalBudget) * 100) : 0;

    // Convert to display currency
    const budgetConverted = await this.convertCurrency(totalBudget, 'GHS', displayCurrency);
    const spentConverted = await this.convertCurrency(totalSpent, 'GHS', displayCurrency);

    const result: any = {
      budgeted: budgetConverted.converted,
      spent: spentConverted.converted,
      variance: {
        amount: budgetConverted.converted.amount - spentConverted.converted.amount,
        currency: displayCurrency,
      },
      variance_percent: Math.round(variancePercent * 100) / 100,
      using_current_rates: true,
    };

    // Compare with original rates if available
    if (project.base_exchange_rate && displayCurrency !== 'GHS') {
      const originalRate = project.base_exchange_rate[`${displayCurrency}_GHS`];
      const currentRate = 1 / budgetConverted.exchangeRate;
      
      if (originalRate) {
        result.rate_comparison = {
          original_rate: originalRate,
          current_rate: currentRate,
          rate_change_percent: Math.round(((currentRate - originalRate) / originalRate) * 100 * 100) / 100,
        };
      }
    }

    return result;
  }
}

export const projectCostCurrencyService = new ProjectCostCurrencyService();
export default projectCostCurrencyService;
