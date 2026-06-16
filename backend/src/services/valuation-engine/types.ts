/**
 * Valuation Engine Types
 * Type definitions for the Valuation Engine module
 */

// =====================================================
// ENUMS
// =====================================================

export type ValuationType = 
  | 'avm' 
  | 'professional' 
  | 'hybrid' 
  | 'desktop' 
  | 'drive_by' 
  | 'full_inspection';

export type ValuationPurpose = 
  | 'sale' 
  | 'purchase' 
  | 'mortgage' 
  | 'refinance' 
  | 'insurance'
  | 'tax' 
  | 'estate' 
  | 'litigation' 
  | 'investment' 
  | 'development'
  | 'rental' 
  | 'internal' 
  | 'portfolio';

export type ValuationStatus = 
  | 'draft' 
  | 'pending_review' 
  | 'in_progress' 
  | 'completed'
  | 'reviewed' 
  | 'approved' 
  | 'rejected' 
  | 'expired' 
  | 'superseded';

export type ValuationMethod = 
  | 'sales_comparison' 
  | 'cost_approach' 
  | 'income_approach'
  | 'residual_method' 
  | 'profits_method' 
  | 'drc_method';

export type ComparableSourceType = 
  | 'database' 
  | 'user_contributed' 
  | 'manual' 
  | 'api_import' 
  | 'historical';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type RegionCode =
  // Real Ghana regions (current scheme)
  | 'greater_accra'
  | 'ashanti'
  | 'eastern'
  | 'central'
  | 'western'
  | 'volta'
  | 'northern'
  | 'upper_east'
  | 'upper_west'
  | 'bono'
  | 'bono_east'
  | 'ahafo'
  | 'savannah'
  | 'north_east'
  | 'oti'
  | 'western_north'
  // Legacy metro/cluster values (retained for backward compatibility; no partitions)
  | 'kumasi_metro'
  | 'western_cluster'
  | 'northern_cluster';

export type PropertyType = 
  | 'house' 
  | 'apartment' 
  | 'townhouse' 
  | 'villa' 
  | 'penthouse'
  | 'land' 
  | 'commercial' 
  | 'industrial' 
  | 'mixed_use' 
  | 'office'
  | 'retail' 
  | 'warehouse' 
  | 'farm' 
  | 'hotel' 
  | 'hospital'
  | 'school' 
  | 'religious' 
  | 'other';

export type PropertyCondition = 
  | 'new' 
  | 'excellent' 
  | 'good' 
  | 'fair' 
  | 'poor' 
  | 'renovation_needed';

// =====================================================
// PROPERTY INTERFACES
// =====================================================

export interface PropertyForValuation {
  id: string;
  reference_number: string;
  region: RegionCode;
  region_code?: RegionCode;
  address_street: string | null;
  address_city: string;
  address_district: string | null;
  digital_address: string | null;
  latitude: number;
  longitude: number;
  property_type: PropertyType;
  property_sub_type: string | null;
  transaction_type: 'sale' | 'rental';
  listing_type?: 'sale' | 'rent' | 'land' | 'commercial' | 'mixed';
  title: string;
  description: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floors: number | null;
  total_area_sqm: number | null;
  land_area_sqm: number | null;
  built_area_sqm: number | null;
  building_size_sqm: number | null;
  plot_size_acres: number | null;
  year_built: number | null;
  condition: PropertyCondition | null;
  amenities: string[];
  features: string[];
  price: number;
  price_currency: string;
  currency?: string;
  price_per_sqm?: number | null;
  price_per_sqm_rent?: number | null;
  furnished?: string | null;
  parking_spaces?: number | null;
  data_quality_score: number | null;
  created_at: Date;
  updated_at: Date;
  
  // Optional fields for income calculations
  market_rent?: number | null;
  capitalization_rate?: number | null;
  days_on_market?: number;
}

// =====================================================
// VALUATION INTERFACES
// =====================================================

/**
 * Property details embedded in valuation response
 */
export interface ValuationPropertyDetails {
  id: string;
  reference_number?: string;
  title?: string;
  address?: string;
  city?: string;
  district?: string;
  region?: string;
  digitalAddress?: string;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  landArea?: number | null;
  plotSize?: number | null;
  builtArea?: number | null;
  grossFloorArea?: number | null;
  netLettableArea?: number | null;
  yearBuilt?: number;
  condition?: string;
}

export interface MethodResult {
  method: ValuationMethod;
  value: number;
  confidence: number;
  weight: number;
  details: Record<string, unknown>;
}

export interface ValuationResult {
  id?: string;
  property_id: string;
  property?: ValuationPropertyDetails | null;  // Property details from JOIN
  valuation_type: ValuationType;
  valuation_purpose: ValuationPurpose;
  
  // Workflow
  current_step?: number;
  status: ValuationStatus;
  
  // Core Results
  estimated_value: number;
  final_value_ghs?: number;  // Alias for frontend compatibility
  value_range_low: number;
  value_range_high: number;
  value_per_sqm: number | null;
  value_currency: string;
  
  // Confidence
  confidence_score: number;
  confidence_level: ConfidenceLevel;
  data_quality_score: number;
  comparable_quality_score: number | null;
  
  // Methods
  methods_used: MethodResult[];
  methods_applied?: string[];          // Selected methods from method selection step
  method_weights?: Record<string, number>;  // Weights assigned to each method
  method_results?: Record<string, any>;     // Results from each method execution
  primary_method: ValuationMethod;
  
  // Individual Method Values
  sales_comparison_value: number | null;
  sales_comparison_confidence: number | null;
  cost_approach_value: number | null;
  cost_approach_confidence: number | null;
  income_approach_value: number | null;
  income_approach_confidence: number | null;
  residual_value: number | null;
  residual_confidence: number | null;
  profits_value: number | null;
  profits_confidence: number | null;
  drc_value: number | null;
  drc_confidence: number | null;
  
  // Comparables
  comparables_count: number;
  comparables: ComparableProperty[];
  
  // Context
  market_conditions: MarketConditions;
  economic_factors: EconomicFactors;
  adjustments_summary: AdjustmentsSummary;
  
  // Rental Analysis (for Income Approach)
  rental_market_analysis?: any;
  
  // Dates
  effective_date: Date;
  expiry_date: Date;
  created_by?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateValuationInput {
  property_id: string;
  valuation_type?: ValuationType;
  valuation_purpose?: ValuationPurpose;
  valuer_id?: string;
  effective_date?: Date;
  is_retrospective?: boolean;
  special_assumptions?: string[];
  limiting_conditions?: string[];
}

export interface ValuationOptions {
  methods?: ValuationMethod[];
  valuation_type?: ValuationType;
  valuation_purpose?: ValuationPurpose;
  min_comparables?: number;
  max_comparables?: number;
  max_comparable_distance_km?: number;
  max_comparable_age_days?: number;
  include_user_contributions?: boolean;
  ml_model_id?: string;
  force_recalculate?: boolean;
}

// =====================================================
// COMPARABLE INTERFACES
// =====================================================

export interface ComparableProperty {
  id: string;
  property_id: string | null;
  external_reference: string | null;
  source_type: ComparableSourceType;
  
  // Property Details
  address_formatted: string;
  property_type: string;
  bedrooms: number | null;
  bathrooms: number | null;
  building_size_sqm: number | null;
  built_area_sqm: number | null;
  land_size_sqm: number | null;
  year_built: number | null;
  condition: string | null;
  floors: number | null;
  amenities: string[];
  
  // Location
  latitude: number;
  longitude: number;
  distance_km: number;
  same_neighborhood: boolean;
  same_district: boolean;
  
  // Transaction
  sale_price: number;
  sale_currency: string;
  sale_date: Date;
  sale_type: string | null;
  verified_transaction: boolean;
  days_since_sale: number;
  
  // Scoring
  similarity_score: number;
  quality_score: number;
  
  // Adjustments
  adjustments: ComparableAdjustments;
  total_adjustment: number;
  total_adjustment_percent: number;
  adjusted_price: number;
  
  // Weight
  weight: number;
  weight_reason: string | null;
  
  // Flags
  is_primary: boolean;
  is_excluded: boolean;
  exclusion_reason: string | null;
  
  // Timestamps
  created_at?: Date;
  updated_at?: Date;
}

export interface ComparableAdjustments {
  location: number;
  size: number;
  condition: number;
  age: number;
  amenities: number;
  time: number;
  property_type: number;
  floor_level?: number;
  view?: number;
  parking?: number;
  other: number;
}

export interface ComparableSearchCriteria {
  property_id: string;
  latitude: number;
  longitude: number;
  property_type: PropertyType;
  bedrooms: number | null;
  bathrooms: number | null;
  building_size_sqm: number | null;
  max_distance_km: number;
  max_age_days: number;
  min_count: number;
  max_count: number;
  include_contributed: boolean;
}

// =====================================================
// ADJUSTMENT INTERFACES
// =====================================================

export interface AdjustmentFactor {
  id: string;
  region: RegionCode | null;
  property_type: string | null;
  adjustment_category: string;
  adjustment_factor: string;
  base_adjustment_percent: number | null;
  base_adjustment_amount: number | null;
  unit: string;
  calculation_method: string;
  effective_date: Date;
  is_active: boolean;
}

export interface AdjustmentsSummary {
  total_adjustments_count: number;
  total_positive_adjustments: number;
  total_negative_adjustments: number;
  net_adjustment_percent: number;
  adjustment_categories: Record<string, number>;
}

// =====================================================
// MARKET & ECONOMIC INTERFACES
// =====================================================

export interface MarketConditions {
  trend: 'rising' | 'stable' | 'falling' | 'unknown';
  trend_strength: number;
  activity_level: 'high' | 'moderate' | 'low' | 'unknown';
  days_on_market_avg: number | null;
  supply_demand_ratio: number | null;
  price_index: number | null;
  price_index_change_yoy: number | null;
  
  // Extended conditions for market analysis
  market_trend?: 'declining' | 'stable' | 'increasing' | string;
  price_trend_12m?: number;
  price_trend_3m?: number;
  market_activity?: 'low' | 'moderate' | 'high' | 'very_low';
  days_on_market?: number;
  inventory_level?: 'low' | 'moderate' | 'high' | 'balanced';
  seasonal_factor?: number;
  cycle_phase?: 'expansion' | 'peak' | 'contraction' | 'trough' | 'stable' | string;
  market_index?: number;
  market_adjustment?: number;
  economic_factors?: EconomicFactors;
  
  price_metrics?: {
    median_price?: number;
    avg_price?: number;
    price_per_sqm?: number;
    average_per_sqm?: number;
    median_per_sqm?: number;
    year_over_year_change?: number;
    price_range?: { min: number; max: number };
  };
  
  price_trends?: PriceTrend[] | {
    trend_1m: number;
    trend_3m: number;
    trend_6m: number;
    trend_12m: number;
  };
}

export interface PriceTrend {
  period: string;
  change: number;
  direction: 'up' | 'down' | 'stable';
}

export interface EconomicFactors {
  inflation_rate: number | null;
  interest_rate_policy: number | null;
  interest_rate?: number;
  mortgage_rate_avg: number | null;
  exchange_rate_usd: number | null;
  gdp_growth: number | null;
  gdp_growth_rate?: number;
  construction_cost_index: number | null;
  unemployment_rate?: number;
  consumer_confidence?: number;
  currency_stability?: 'volatile' | 'stable' | 'strengthening';
  economic_outlook?: 'negative' | 'neutral' | 'positive';
  snapshot_date: Date;
}

export interface MarketIndex {
  id: string;
  region: RegionCode;
  property_type: string | null;
  index_type: string;
  index_value: number;
  base_value: number;
  base_period: Date;
  current_period: Date;
  change_mom: number | null;
  change_qoq: number | null;
  change_yoy: number | null;
  change_1_month?: number;
  change_3_month?: number;
  change_12_month?: number;
  trend_direction: string | null;
  trend_strength: number | null;
}

// =====================================================
// COST APPROACH INTERFACES
// =====================================================

export interface ConstructionCostEstimate {
  land_value: number;
  replacement_cost_new: number;
  physical_depreciation: number;
  functional_obsolescence: number;
  external_obsolescence: number;
  total_depreciation: number;
  depreciated_value: number;
  total_value: number;
  breakdown: CostBreakdown;
  methodology: string;
}

export interface CostBreakdown {
  structure_cost: number;
  finishing_cost: number;
  mechanical_cost: number;
  electrical_cost: number;
  plumbing_cost: number;
  external_works_cost: number;
  professional_fees: number;
  contingency: number;
  total_construction_cost: number;
}

export interface DepreciationCalculation {
  effective_age: number;
  remaining_useful_life: number;
  total_useful_life: number;
  physical_depreciation_rate: number;
  physical_depreciation_amount: number;
  functional_items: FunctionalObsolescenceItem[];
  functional_obsolescence_amount: number;
  external_factors: ExternalObsolescenceItem[];
  external_obsolescence_amount: number;
  total_depreciation_amount: number;
  total_depreciation_percent: number;
}

export interface FunctionalObsolescenceItem {
  item: string;
  type: 'superadequacy' | 'deficiency' | 'outdated';
  amount: number;
  description: string;
}

export interface ExternalObsolescenceItem {
  factor: string;
  impact_percent: number;
  amount: number;
  description: string;
}

// =====================================================
// INCOME APPROACH INTERFACES
// =====================================================

export interface IncomeApproachResult {
  market_rent_monthly: number;
  market_rent_annual: number;
  vacancy_rate: number;
  effective_gross_income: number;
  expense_ratio: number;
  operating_expenses: number;
  net_operating_income: number;
  cap_rate: number;
  direct_cap_value: number;
  dcf_value: number;
  discount_rate: number;
  cash_flow_projections: CashFlowProjection[];
  terminal_value: number;
  grm_value: number;
  gross_rent_multiplier: number;
  weighted_value: number;
}

export interface RentalComparable {
  id: string;
  property_id: string | null;
  address: string;
  property_type: string;
  bedrooms: number | null;
  building_size_sqm: number | null;
  monthly_rent: number;
  rent_currency: string;
  rent_date: Date;
  distance_km: number;
  adjusted_rent: number;
  weight: number;
}

export interface OperatingExpenses {
  property_taxes: number;
  insurance: number;
  management_fee: number;
  maintenance: number;
  utilities: number;
  security: number;
  other: number;
  total: number;
  expense_ratio: number;
}

// =====================================================
// RESIDUAL METHOD INTERFACES
// =====================================================

export interface ResidualValuationResult {
  gross_development_value: number;
  total_development_costs: number;
  developer_profit: number;
  finance_costs: number;
  residual_land_value: number;
  sensitivity_analysis: SensitivityResult[];
  assumptions: ResidualAssumptions;
}

export interface ResidualAssumptions {
  construction_period_months: number;
  sales_period_months: number;
  profit_margin_percent: number;
  finance_rate_percent: number;
  professional_fees_percent: number;
  contingency_percent: number;
}

export interface SensitivityResult {
  variable: string;
  change_percent: number;
  new_residual_value: number;
  change_in_value: number;
}

// =====================================================
// ML MODEL INTERFACES
// =====================================================

export interface MLModel {
  id: string;
  model_name: string;
  model_version: string;
  model_type: string;
  property_types: string[];
  regions: RegionCode[] | null;
  metrics: MLModelMetrics;
  is_active: boolean;
  is_production: boolean;
  trained_at: Date;
  deployed_at: Date | null;
}

export interface MLModelMetrics {
  mae: number;
  mape: number;
  rmse: number;
  r2_score: number;
  accuracy_within_10: number;
  accuracy_within_15: number;
  accuracy_within_20: number;
}

export interface MLPrediction {
  predicted_value: number;
  prediction_interval_low: number;
  prediction_interval_high: number;
  confidence: number;
  feature_contributions: Record<string, number>;
  model_id: string;
  model_version: string;
}

// =====================================================
// REPORT INTERFACES
// =====================================================

export interface ValuationReport {
  valuation_id: string;
  report_url: string;
  report_format: 'pdf' | 'docx' | 'xlsx';
  generated_at: Date;
  template_id: string;
  file_size_bytes: number;
}

export interface ReportTemplate {
  id: string;
  name: string;
  description: string | null;
  template_type: 'standard' | 'professional' | 'bank' | 'insurance';
  is_default: boolean;
  is_active: boolean;
  organization_id: string | null;
}

// =====================================================
// PAGINATION & FILTERS
// =====================================================

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

export interface ValuationFilters {
  page?: number;
  limit?: number;
  property_id?: string;
  valuer_id?: string;
  valuation_type?: ValuationType;
  valuation_purpose?: ValuationPurpose;
  status?: ValuationStatus;
  region?: RegionCode;
  property_type?: PropertyType;
  from_date?: Date;
  to_date?: Date;
  min_value?: number;
  max_value?: number;
  min_confidence?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// =====================================================
// CASH FLOW & INCOME INTERFACES
// =====================================================

export interface CashFlowProjection {
  year: number;
  gross_income: number;
  vacancy_loss: number;
  effective_gross_income: number;
  operating_expenses: number;
  net_operating_income: number;
  capital_expenditure: number;
  cash_flow: number;
  cash_flow_before_debt?: number;
  present_value?: number;
  discounted_value: number;
}

export interface ConfidenceScore {
  overall: number;
  data_quality: number;
  market_activity: number;
  methodology_fit: number;
  comparable_quality: number;
  factors: ConfidenceFactor[];
  components?: Record<string, number>;
  reliability_rating: 'high' | 'medium' | 'low';
  recommendations: string[];
}

export interface ConfidenceFactor {
  name: string;
  score: number;
  weight: number;
  impact: 'positive' | 'negative' | 'neutral';
  description: string;
}

