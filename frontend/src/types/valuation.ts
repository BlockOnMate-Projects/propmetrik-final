/**
 * Valuation Engine Types
 * 
 * TypeScript definitions for the PROPMETRIK Valuation Engine.
 * Aligned with IVS/RICS standards for Ghana market.
 */

// =====================================================
// ENUMS
// =====================================================

export type ValuationStatus =
  | 'draft'
  | 'in_progress'
  | 'pending_review'
  | 'under_review'
  | 'approved'
  | 'completed'
  | 'rejected';

export type ValuationType =
  | 'avm'           // Automated Valuation Model
  | 'professional'  // Professional appraisal
  | 'hybrid'        // Hybrid approach
  | 'desktop'       // Desktop appraisal
  | 'drive_by'      // Drive-by inspection
  | 'full_inspection'; // Full on-site inspection

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

export type ValuationMethod =
  | 'sales_comparison'
  | 'cost_approach'
  | 'income_approach'
  | 'residual_method'
  | 'profits_method'
  | 'drc_method';

export type PropertyType =
  | 'residential'
  | 'commercial'
  | 'industrial'
  | 'land'
  | 'mixed_use'
  | 'specialized';

export type RegionCode =
  | 'GAR' // Greater Accra
  | 'ASH' // Ashanti
  | 'WES' // Western
  | 'CEN' // Central
  | 'EAS' // Eastern
  | 'VOL' // Volta
  | 'NOR' // Northern
  | 'UPE' // Upper East
  | 'UPW' // Upper West
  | 'BON' // Bono
  | 'AHA' // Ahafo
  | 'BOE' // Bono East
  | 'OTI' // Oti
  | 'WEN' // Western North
  | 'NEE' // North East
  | 'SAV'; // Savannah

export type RoomType =
  | 'bedroom'
  | 'bathroom'
  | 'toilet'
  | 'kitchen'
  | 'living'
  | 'dining'
  | 'storage'
  | 'corridor'
  | 'porch'
  | 'garage'
  | 'balcony'
  | 'laundry'
  | 'office';

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'very_low';

export type ReconciliationStatus =
  | 'draft'
  | 'under_review'
  | 'approved'
  | 'locked';

export type OverrideCategory =
  | 'cost_input'
  | 'market_data'
  | 'adjustment_factor'
  | 'comparable_weight'
  | 'method_weight'
  | 'cap_rate'
  | 'other';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

// =====================================================
// CORE VALUATION TYPES
// =====================================================

export interface Valuation {
  id: string;
  reference_number: string;
  property_id: string;
  valuation_type: ValuationType;
  valuation_purpose: ValuationPurpose;
  status: ValuationStatus;
  current_step?: number;

  // Property details
  property?: Property;

  // Valuation results
  final_value_ghs?: number;
  final_value_usd?: number;
  value_per_sqm_ghs?: number;
  confidence_level?: ConfidenceLevel;
  confidence_score?: number;

  // Method results
  methods_applied: ValuationMethod[];
  primary_method?: ValuationMethod;
  method_results?: MethodResult[];
  methodResults?: Record<string, MethodResult>;

  // Workflow
  valuation_date: string;
  effective_date?: string;
  report_date?: string;
  request_date?: string;
  completed_date?: string;

  // Audit
  created_by?: string;
  assigned_to?: string;
  reviewed_by?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface Property {
  id: string;
  title?: string;
  reference_number?: string;
  property_type: PropertyType;
  property_sub_type?: string;
  transaction_type?: 'sale' | 'rent';

  // Location
  region?: RegionCode;
  address?: string;
  address_street?: string;
  address_city?: string;
  city?: string;
  location?: string;
  address_district?: string;
  district?: string;
  digital_address?: string;
  latitude?: number;
  longitude?: number;

  // Physical
  description?: string;
  bedrooms?: number;
  bathrooms?: number;
  floors?: number;
  building_area_sqm?: number;
  land_area_sqm?: number;
  plot_size?: number;
  year_built?: number;

  // Owner Information
  owner_name?: string;
  owner_email?: string;
  owner_phone?: string;
  owner_address?: string;
  owner_contact_preference?: 'email' | 'phone' | 'mail' | 'any';

  // Financials
  price_ghs?: number;
  price_usd?: number;

  // Features
  features?: string[];
  amenities?: string[];
  floor_plan?: FloorPlan[];
}

export interface MethodResult {
  method: ValuationMethod;
  value_ghs: number;
  value_usd?: number;
  confidence_score: number;
  weight: number;
  is_primary: boolean;
  notes?: string;
  inputs?: Record<string, unknown>;
  calculated_at: string;
}

// =====================================================
// FLOOR PLAN TYPES
// =====================================================

export interface FloorPlan {
  id: string;
  valuationId: string;
  propertyId?: string;

  // Canvas
  canvasJson: object;
  canvasVersion: string;
  scalePixelsPerMeter: number;
  calibrationReference?: string;

  // Measurements
  totalArea?: number;
  grossBuildingAreaSqm?: number;
  netUsableAreaSqm?: number;
  siteBoundarySqm?: number;
  siteCoverageRatio?: number;
  efficiencyRatio?: number;

  // Floor info
  floorNumber: number;
  floorLabel: string;

  // Rooms
  rooms?: FloorPlanRoom[];

  // Status
  isLocked: boolean;
  lockedAt?: string;
  lockedBy?: string;

  // Quality
  hasScaleReference: boolean;
  measurementConfidence: 'verified' | 'measured' | 'estimated' | 'rough';

  // Audit
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FloorPlanRoom {
  id: string;
  floor_plan_id: string;
  room_name: string;
  room_type: RoomType;
  area_sqm: number;
  perimeter_m?: number;
  length_m?: number;
  width_m?: number;
  height_m?: number;
  meets_minimum_size: boolean;
  minimum_size_sqm?: number;
  validation_notes?: string;
  display_order: number;
  fill_color: string;
}

export interface FloorPlanSummary {
  valuation_id: string;
  total_floors: number;
  total_gba_sqm: number;
  total_nua_sqm: number;
  efficiency_ratio: number;
  room_count: number;
  room_breakdown: Record<RoomType, number>;
  validation_issues: ValidationIssue[];
  has_locked_plans: boolean;
}

export interface ValidationIssue {
  room_id: string;
  room_name: string;
  issue_type: 'below_minimum' | 'missing_required' | 'invalid_shape';
  message: string;
  severity: 'error' | 'warning';
}

// =====================================================
// HBU ANALYSIS TYPES
// =====================================================

export interface HBUAnalysis {
  id: string;
  valuationId: string;

  // Four tests
  legalAnalysis: LegalAnalysis;
  legallyPermissible: boolean;
  legalScore?: number;

  physicalAnalysis: PhysicalAnalysis;
  physicallyPossible: boolean;
  physicalScore?: number;

  financialAnalysis: FinancialAnalysis;
  financiallyFeasible: boolean;
  financialScore?: number;

  productivityAnalysis: ProductivityAnalysis;
  maximallyProductive: boolean;
  productivityScore?: number;

  // Conclusion
  overallPassed: boolean;
  overallScore?: number;
  hbuConclusion?: string;
  hbuJustification?: string;
  hbuAsVacant?: string;
  hbuAsImproved?: string;
  recommendedUse?: string;

  // Recommendations
  recommendedMethods: ValuationMethod[];
  methodJustifications: Record<ValuationMethod, string>;

  // Workflow
  isCompleted: boolean;
  completedBy?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LegalAnalysis {
  zoning_classification?: string;
  permitted_uses: string[];
  conditional_uses: string[];
  prohibited_uses: string[];
  max_building_height_m?: number;
  max_floor_area_ratio?: number;
  max_site_coverage_percent?: number;
  setback_requirements?: SetbackRequirements;
  easements: string[];
  restrictions: string[];
  compliance_status: 'compliant' | 'non_compliant' | 'conditional' | 'unknown';
  notes?: string;
}

export interface SetbackRequirements {
  front_m: number;
  rear_m: number;
  left_m: number;
  right_m: number;
}

export interface PhysicalAnalysis {
  site_size_sqm?: number;
  site_shape: 'regular' | 'irregular' | 'corner' | 'flag';
  topography: 'flat' | 'sloped' | 'steep';
  soil_conditions: 'good' | 'moderate' | 'poor' | 'unknown';
  flood_zone: boolean;
  flood_zone_type?: string;
  access_quality: 'excellent' | 'good' | 'fair' | 'poor';
  utilities_available: string[];
  environmental_constraints: string[];
  buildable_area_sqm?: number;
  max_developable_gfa_sqm?: number;
  notes?: string;
}

export interface FinancialAnalysis {
  development_scenarios: DevelopmentScenario[];
  market_demand_rating: 'high' | 'moderate' | 'low';
  absorption_rate_months?: number;
  required_roi_percent?: number;
  financing_available: boolean;
  risk_assessment: 'low' | 'moderate' | 'high';
  notes?: string;
}

export interface DevelopmentScenario {
  name: string;
  description: string;
  estimated_cost_ghs: number;
  estimated_value_ghs: number;
  roi_percent: number;
  is_feasible: boolean;
}

export interface ProductivityAnalysis {
  options_evaluated: HBUOption[];
  highest_value_option?: HBUOption;
  value_differential?: number;
  notes?: string;
}

export interface HBUOption {
  name: string;
  description: string;
  estimated_value_ghs: number;
  annual_income_ghs?: number;
  yield_percent?: number;
  is_current_use: boolean;
}

// =====================================================
// OVERRIDE TRACKING TYPES
// =====================================================

export interface UserOverride {
  id: string;
  valuation_id: string;
  category: OverrideCategory;
  field_path: string;
  field_label: string;
  system_default_value: unknown;
  user_override_value: unknown;
  value_unit?: string;
  deviation_percent?: number;
  deviation_absolute?: number;
  reason: string;
  supporting_evidence?: string;
  approval_status: ApprovalStatus;
  approved_by?: string;
  approved_at?: string;
  approval_notes?: string;
  overridden_by: string;
  overridden_at: string;
}

export interface OverrideSummary {
  valuation_id: string;
  total_overrides: number;
  by_category: Record<OverrideCategory, number>;
  by_status: Record<ApprovalStatus, number>;
  avg_deviation_percent: number;
  max_deviation_percent: number;
  disclaimers: string[];
  material_uncertainty_statement?: string;
  requires_approval: boolean;
}

// =====================================================
// COMPARABLE BASKET TYPES
// =====================================================

export interface ComparableBasket {
  id: string;
  valuation_id: string;
  basket_name: string;
  is_primary: boolean;
  search_criteria?: SearchCriteria;
  total_comparables: number;
  active_comparables: number;
  weighted_avg_price?: number;
  quality_score?: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface SearchCriteria {
  radius_km?: number;
  min_similarity?: number;
  property_types?: PropertyType[];
  date_range_months?: number;
}

export interface BasketComparable {
  id: string;
  basket_id: string;
  comparable_property_id?: string;
  is_manual_entry: boolean;
  manual_data?: ManualComparableData;
  similarity_score?: number;
  quality_score?: number;
  weight: number;
  is_weight_manual: boolean;
  weight_justification?: string;
  adjusted_sale_price?: number;
  adjustments_summary?: Record<string, number>;
  net_adjustment_percent?: number;
  gross_adjustment_percent?: number;
  is_excluded: boolean;
  exclusion_reason?: string;
  tags: string[];
  added_by?: string;
  added_at: string;

  // Joined property data
  property?: Property;
}

export interface ManualComparableData {
  address: string;
  sale_price_ghs: number;
  sale_date: string;
  property_type: PropertyType;
  building_area_sqm?: number;
  land_area_sqm?: number;
  bedrooms?: number;
  bathrooms?: number;
  year_built?: number;
  condition?: string;
  source?: string;
  notes?: string;
}

export interface BasketStatistics {
  basket_id: string;
  count: number;
  mean_price: number;
  median_price: number;
  std_dev: number;
  coefficient_of_variation: number;
  min_price: number;
  max_price: number;
  weighted_avg_price: number;
  avg_adjustment_percent: number;
  total_weight: number;
}

// =====================================================
// SENSITIVITY ANALYSIS TYPES
// =====================================================

export interface SensitivityAnalysis {
  id: string;
  valuation_id: string;
  analysis_type: 'single_variable' | 'two_variable' | 'tornado' | 'monte_carlo';
  method: ValuationMethod;
  config: SensitivityConfig;
  results: SensitivityResult;
  created_by?: string;
  created_at: string;
}

export interface SensitivityConfig {
  variables: SensitivityVariable[];
  variation_range?: number;
  step_size?: number;
  iterations?: number;
}

export interface SensitivityVariable {
  name: string;
  label: string;
  base_value: number;
  min_value?: number;
  max_value?: number;
  distribution?: 'normal' | 'uniform' | 'triangular';
  std_dev?: number;
}

export interface SensitivityResult {
  base_case_value: number;
  scenarios: SensitivityScenario[];
  statistics?: MonteCarloStatistics;
}

export interface SensitivityScenario {
  variable: string;
  variation_percent: number;
  input_value: number;
  output_value: number;
  value_change: number;
  value_change_percent: number;
}

export interface MonteCarloStatistics {
  mean: number;
  median: number;
  std_dev: number;
  min: number;
  max: number;
  percentile_5: number;
  percentile_25: number;
  percentile_75: number;
  percentile_95: number;
  histogram: HistogramBin[];
}

export interface HistogramBin {
  range_start: number;
  range_end: number;
  count: number;
  percentage: number;
}

// =====================================================
// RECONCILIATION TYPES
// =====================================================

export interface Reconciliation {
  id: string;
  valuation_id: string;

  // Method results
  method_results: Record<ValuationMethod, MethodResultInput>;

  // Weighting
  weighting_method: 'confidence_based' | 'equal' | 'custom';
  method_weights: Record<ValuationMethod, MethodWeight>;

  // Calculated values
  weighted_average_ghs: number;
  weighted_average_usd?: number;
  value_range_low_ghs?: number;
  value_range_high_ghs?: number;
  value_per_sqm_ghs?: number;

  // Final value
  final_value_selection: 'weighted_average' | 'specific_method' | 'manual';
  final_market_value_ghs?: number;
  final_market_value_usd?: number;
  selected_method?: ValuationMethod;

  // Narrative
  reconciliation_narrative?: string;
  special_assumptions?: string[];
  departures_from_standards?: string[];

  // Workflow
  status: ReconciliationStatus;
  finalized_by?: string;
  finalized_at?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;

  // Audit
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface MethodResultInput {
  value_ghs: number;
  confidence_score: number;
  notes?: string;
}

export interface MethodWeight {
  weight: number;
  is_manual: boolean;
  justification?: string;
}

// =====================================================
// MARKET DATA TYPES
// =====================================================

export interface MarketConditions {
  region: RegionCode;
  property_type: PropertyType;
  trend: 'appreciating' | 'stable' | 'declining';
  trend_percent: number;
  avg_days_on_market: number;
  supply_level: 'high' | 'balanced' | 'low';
  demand_level: 'high' | 'moderate' | 'low';
  transaction_volume: number;
  avg_price_per_sqm_ghs: number;
  median_price_ghs: number;
  yoy_change_percent: number;
  vacancy_rate_percent?: number;
  cap_rate_percent?: number;
  updated_at: string;
}

export interface MarketIndex {
  id: string;
  region: RegionCode;
  property_type: PropertyType;
  index_value: number;
  base_value: number;
  period_start: string;
  period_end: string;
  change_percent: number;
}

// =====================================================
// REPORT TYPES
// =====================================================

export interface ValuationReport {
  valuation_id: string;
  format: 'json' | 'html' | 'pdf';
  template: string;
  generated_at: string;
  content?: string;
  download_url?: string;

  // Report sections
  executive_summary?: string;
  property_description?: string;
  market_analysis?: string;
  valuation_methodology?: string;
  reconciliation_summary?: string;
  assumptions_and_conditions?: string;
  certification?: string;
}

// =====================================================
// API RESPONSE TYPES
// =====================================================

export interface ValuationApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ValuationStatsResponse {
  total: number;
  completed: number;
  in_progress: number;
  pending: number;
  failed: number;
  avg_value: number;
  total_value: number;
  byStatus: {
    draft: number;
    in_progress: number;
    pending_review: number;
    completed: number;
    all: number;
  };
}

export interface PaginatedValuations {
  data: Valuation[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

// =====================================================
// FORM INPUT TYPES
// =====================================================

export interface CreateValuationInput {
  property_id: string;
  valuation_type: ValuationType;
  valuation_purpose: ValuationPurpose;
  effective_date?: string;
  special_instructions?: string;
}

export interface CreateFloorPlanInput {
  valuation_id: string;
  canvas_json: object;
  scale_pixels_per_meter?: number;
  floor_number?: number;
  floor_label?: string;
  calibration_reference?: string;
}

export interface CreateBasketInput {
  valuation_id: string;
  basket_name?: string;
  is_primary?: boolean;
  search_criteria?: SearchCriteria;
}

export interface AddComparableInput {
  basket_id: string;
  comparable_property_id?: string;
  is_manual_entry?: boolean;
  manual_data?: ManualComparableData;
  weight?: number;
  tags?: string[];
}

export interface CreateReconciliationInput {
  valuation_id: string;
  method_results: Record<ValuationMethod, MethodResultInput>;
  weighting_method?: 'confidence_based' | 'equal' | 'custom';
}

export interface FinalizeReconciliationInput {
  final_value_selection: 'weighted_average' | 'specific_method' | 'manual';
  final_market_value?: number;
  selected_method?: ValuationMethod;
  reconciliation_narrative: string;
  special_assumptions?: string[];
  departures_from_standards?: string[];
  building_area_sqm?: number;
}

// =====================================================
// COST APPROACH TYPES
// =====================================================

export interface CostApproachData {
  id?: string;
  valuation_id: string;
  land_value: number;
  replacement_cost_new: number;
  physical_depreciation: number;
  functional_obsolescence: number;
  external_obsolescence: number;
  total_depreciation: number;
  depreciated_value: number;
  indicated_value: number;
  effective_age: number;
  remaining_life: number;
  cost_source: string;
  calculations: Record<string, any>;
}

// =====================================================
// INCOME APPROACH TYPES
// =====================================================

export interface IncomeApproachData {
  id?: string;
  valuation_id: string;
  gross_potential_income: number;
  vacancy_rate: number;
  effective_gross_income: number;
  operating_expenses: number;
  net_operating_income: number;
  cap_rate: number;
  indicated_value: number;
  dcf_value?: number;
  grm_value?: number;
  income_streams: any[];
  expense_breakdown: Record<string, any>;
  // Phase 5.5: Rental analysis metadata for disclosure
  rental_analysis?: {
    source: 'market' | 'manual';
    methodology: 'median' | 'weighted_average' | 'manual' | '';
    confidence: number;
    comparables_count: number;
    estimated_at: string | null;
    comparables?: Array<{
      id: string;
      address: string;
      rent: number;
      bedrooms: number;
      distance_km: number;
    }>;
  } | null;
}

// =====================================================
// COMPARABLE PROPERTY TYPES
// =====================================================

export interface ComparableProperty {
  id: string;
  property_id: string;
  property_details: Record<string, any>;
  similarity_score: number;
  weight: number;
  adjustments: Record<string, number>;
  adjusted_value: number;
  is_selected: boolean;
  sale_price?: number;
  sale_date?: string;
  gfa?: number;
  distance_km?: number;
}

// =====================================================
// HBU TEST TYPES
// =====================================================

export interface HBUTest {
  id: string;
  name: string;
  passed: boolean | null;
  notes: string;
  factors: HBUFactor[];
}

export interface HBUFactor {
  name: string;
  value: boolean | null;
  weight: number;
}

export interface UseScenario {
  id: string;
  name: string;
  propertyType: string;
  estimatedValue: number;
  developmentCost: number;
  annualIncome: number;
  roi: number;
  selected: boolean;
}

