-- Migration: 016_valuation_gaps.sql
-- Description: Complete backend gaps for Valuation Engine
-- Tables: floor_plans, hbu_analyses, user_overrides, comparable_baskets, sensitivity_analyses, reconciliations
-- Author: PropMetrik Engineering
-- Date: 2026-01-08

-- ============================================================================
-- 1. FLOOR PLAN STORAGE
-- ============================================================================

CREATE TABLE IF NOT EXISTS valuation_floor_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
  property_id UUID,
  property_region region_code_enum,
  FOREIGN KEY (property_id, property_region) REFERENCES properties(id, region) ON DELETE SET NULL,
  
  -- Fabric.js canvas state
  canvas_json JSONB NOT NULL,
  canvas_version VARCHAR(20) DEFAULT '5.3.0',
  
  -- Scale and calibration
  scale_pixels_per_meter DECIMAL(10,4) NOT NULL DEFAULT 20.0,
  calibration_reference VARCHAR(200),
  
  -- Calculated measurements (cached from canvas)
  gross_building_area_sqm DECIMAL(12,4),
  net_usable_area_sqm DECIMAL(12,4),
  site_boundary_sqm DECIMAL(12,4),
  site_coverage_ratio DECIMAL(5,4),
  efficiency_ratio DECIMAL(5,4),
  
  -- Room breakdown (derived from canvas)
  rooms JSONB DEFAULT '[]'::jsonb,
  -- Structure: [{id, name, type, area_sqm, perimeter_m, vertices: [{x,y}]}]
  
  -- Floor information (for multi-story)
  floor_number INTEGER DEFAULT 0,
  floor_label VARCHAR(50) DEFAULT 'Ground Floor',
  
  -- Validation
  is_locked BOOLEAN DEFAULT false,
  locked_at TIMESTAMP WITH TIME ZONE,
  locked_by UUID REFERENCES users(id),
  
  -- Quality indicators
  has_scale_reference BOOLEAN DEFAULT false,
  measurement_confidence VARCHAR(20) DEFAULT 'estimated',
  -- Values: 'verified', 'measured', 'estimated', 'rough'
  
  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(valuation_id, floor_number)
);

-- Room measurements detail table (normalized from JSONB for querying)
CREATE TABLE IF NOT EXISTS valuation_floor_plan_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_plan_id UUID NOT NULL REFERENCES valuation_floor_plans(id) ON DELETE CASCADE,
  
  room_name VARCHAR(100) NOT NULL,
  room_type VARCHAR(50) NOT NULL,
  -- Types: bedroom, bathroom, kitchen, living, dining, storage, corridor, porch, garage, laundry, office
  
  area_sqm DECIMAL(10,4) NOT NULL,
  perimeter_m DECIMAL(10,4),
  
  -- Dimensions (for rectangular rooms)
  length_m DECIMAL(10,4),
  width_m DECIMAL(10,4),
  height_m DECIMAL(10,4) DEFAULT 3.0,
  
  -- Polygon vertices (for complex shapes)
  vertices JSONB,
  
  -- Ghana Building Code validation
  meets_minimum_size BOOLEAN DEFAULT true,
  minimum_size_sqm DECIMAL(10,4),
  validation_notes TEXT,
  
  -- Display
  display_order INTEGER DEFAULT 0,
  fill_color VARCHAR(20) DEFAULT '#E5E7EB',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_floor_plans_valuation ON valuation_floor_plans(valuation_id);
CREATE INDEX idx_floor_plans_property ON valuation_floor_plans(property_id);
CREATE INDEX idx_floor_plan_rooms_plan ON valuation_floor_plan_rooms(floor_plan_id);
CREATE INDEX idx_floor_plan_rooms_type ON valuation_floor_plan_rooms(room_type);

-- ============================================================================
-- 2. HIGHEST & BEST USE (HBU) ANALYSIS
-- ============================================================================

CREATE TABLE IF NOT EXISTS valuation_hbu_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
  
  -- Four-Test Framework Results
  
  -- 1. Legal Permissibility Test
  legal_analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
  {
    "zoning_classification": "R1-Residential",
    "zoning_source": "Town Planning Department",
    "permitted_uses": ["single_family", "duplex"],
    "conditional_uses": ["home_office"],
    "prohibited_uses": ["commercial", "industrial"],
    "density_allowed": 2.5,
    "height_limit_m": 12,
    "setbacks": {"front": 6, "rear": 3, "side": 2},
    "encumbrances": ["utility_easement"],
    "title_restrictions": [],
    "compliance_status": "compliant",
    "legal_notes": "..."
  }
  */
  legal_test_passed BOOLEAN DEFAULT false,
  
  -- 2. Physical Possibility Test
  physical_analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
  {
    "site_size_sqm": 650,
    "topography": "level",
    "soil_conditions": "stable",
    "access_type": "paved_road",
    "utilities_available": ["water", "electricity", "sewer"],
    "flood_zone": false,
    "environmental_constraints": [],
    "max_developable_gfa_sqm": 975,
    "physical_notes": "..."
  }
  */
  physical_test_passed BOOLEAN DEFAULT false,
  
  -- 3. Financial Feasibility Test
  financial_analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
  {
    "development_scenarios": [
      {
        "use": "residential_4bed",
        "development_cost": 800000,
        "expected_value": 1200000,
        "profit_margin": 0.33,
        "irr": 0.18,
        "is_feasible": true
      }
    ],
    "market_demand_rating": "strong",
    "absorption_rate_months": 6,
    "risk_assessment": "moderate",
    "financial_notes": "..."
  }
  */
  financial_test_passed BOOLEAN DEFAULT false,
  
  -- 4. Maximum Productivity Test
  productivity_analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
  {
    "options_evaluated": [
      {"use": "residential_4bed", "npv": 350000, "irr": 0.18},
      {"use": "mixed_use", "npv": 280000, "irr": 0.15}
    ],
    "highest_npv_use": "residential_4bed",
    "value_differential": 70000,
    "productivity_notes": "..."
  }
  */
  productivity_test_passed BOOLEAN DEFAULT false,
  
  -- HBU Conclusion
  hbu_as_vacant VARCHAR(100),
  hbu_as_improved VARCHAR(100),
  hbu_conclusion VARCHAR(100) NOT NULL,
  hbu_justification TEXT NOT NULL,
  
  -- Valuation Method Recommendations
  recommended_methods JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- ["sales_comparison", "income_approach"]
  
  method_justifications JSONB DEFAULT '{}'::jsonb,
  /*
  {
    "sales_comparison": "Active market with good comparables",
    "income_approach": "Property generates rental income",
    "cost_approach": "Not recommended - property is 7 years old"
  }
  */
  
  -- Status
  status VARCHAR(20) DEFAULT 'draft',
  -- Values: draft, in_progress, completed, locked
  
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID REFERENCES users(id),
  
  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(valuation_id)
);

CREATE INDEX idx_hbu_valuation ON valuation_hbu_analyses(valuation_id);
CREATE INDEX idx_hbu_conclusion ON valuation_hbu_analyses(hbu_conclusion);
CREATE INDEX idx_hbu_status ON valuation_hbu_analyses(status);

-- ============================================================================
-- 3. USER OVERRIDE TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS valuation_user_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
  
  -- Override identification
  category VARCHAR(50) NOT NULL,
  -- Values: measurement, cost_input, market_data, adjustment, cap_rate, method_weight, comparable_weight
  
  field_path VARCHAR(200) NOT NULL,
  -- e.g., "cost_inputs.materials.steel_rebar_12mm", "sales_comparison.adjustments.C1.physical.area"
  
  field_label VARCHAR(200) NOT NULL,
  -- Human-readable: "Steel Rebar (12mm)", "C1 Area Adjustment"
  
  -- Values
  system_default_value JSONB NOT NULL,
  user_override_value JSONB NOT NULL,
  value_unit VARCHAR(50),
  -- e.g., "GHS/ton", "%", "sqm"
  
  -- Deviation tracking
  deviation_percentage DECIMAL(8,4),
  deviation_absolute DECIMAL(18,4),
  
  -- Justification (REQUIRED)
  reason TEXT NOT NULL,
  supporting_evidence TEXT,
  evidence_document_id UUID REFERENCES documents(id),
  
  -- Risk flags
  requires_approval BOOLEAN DEFAULT false,
  approval_status VARCHAR(20) DEFAULT 'pending',
  -- Values: pending, approved, rejected
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  approval_notes TEXT,
  
  -- Disclaimer generation
  include_in_report BOOLEAN DEFAULT true,
  disclaimer_text TEXT,
  
  -- Audit
  overridden_by UUID NOT NULL REFERENCES users(id),
  overridden_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_overrides_valuation ON valuation_user_overrides(valuation_id);
CREATE INDEX idx_overrides_category ON valuation_user_overrides(category);
CREATE INDEX idx_overrides_approval ON valuation_user_overrides(requires_approval, approval_status);

-- ============================================================================
-- 4. COMPARABLE BASKET MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS valuation_comparable_baskets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
  
  -- Basket metadata
  basket_name VARCHAR(100) DEFAULT 'Primary Basket',
  is_primary BOOLEAN DEFAULT true,
  
  -- Selection criteria used
  search_criteria JSONB DEFAULT '{}'::jsonb,
  /*
  {
    "max_distance_km": 3,
    "max_age_days": 365,
    "property_types": ["house"],
    "size_range": {"min": 200, "max": 300},
    "bedroom_range": {"min": 3, "max": 5}
  }
  */
  
  -- Statistics
  comparable_count INTEGER DEFAULT 0,
  avg_adjusted_value DECIMAL(18,2),
  median_adjusted_value DECIMAL(18,2),
  value_range_low DECIMAL(18,2),
  value_range_high DECIMAL(18,2),
  coefficient_of_variation DECIMAL(8,4),
  
  -- Status
  is_locked BOOLEAN DEFAULT false,
  locked_at TIMESTAMP WITH TIME ZONE,
  locked_by UUID REFERENCES users(id),
  
  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(valuation_id, basket_name)
);

-- Individual comparable entries in basket
CREATE TABLE IF NOT EXISTS valuation_basket_comparables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  basket_id UUID NOT NULL REFERENCES valuation_comparable_baskets(id) ON DELETE CASCADE,
  
  -- Comparable reference
  comparable_property_id UUID,
  comparable_property_region region_code_enum,
  FOREIGN KEY (comparable_property_id, comparable_property_region) REFERENCES properties(id, region),
  comparable_transaction_id UUID,
  
  -- Manual entry (if not from database)
  is_manual_entry BOOLEAN DEFAULT false,
  manual_data JSONB,
  /*
  {
    "address": "12 Boundary Road, East Legon",
    "sale_price": 385000,
    "sale_date": "2025-11-15",
    "property_type": "house",
    "bedrooms": 4,
    "bathrooms": 3,
    "building_area_sqm": 260,
    "source": "Agent confirmation"
  }
  */
  
  -- Selection metadata
  selection_method VARCHAR(20) DEFAULT 'auto',
  -- Values: auto, manual, imported
  
  -- Quality & weighting
  quality_score DECIMAL(5,4),
  -- 0-1 score based on similarity, data quality, recency
  
  weight DECIMAL(5,4) DEFAULT 0.25,
  -- Weighting for value calculation
  
  is_weight_manual BOOLEAN DEFAULT false,
  weight_justification TEXT,
  
  -- Tagging
  tags JSONB DEFAULT '[]'::jsonb,
  -- e.g., ["primary", "best_match", "excluded", "needs_verification"]
  
  -- Exclusion
  is_excluded BOOLEAN DEFAULT false,
  exclusion_reason TEXT,
  
  -- Calculated values (after adjustments)
  raw_sale_price DECIMAL(18,2),
  adjusted_sale_price DECIMAL(18,2),
  total_adjustment_percentage DECIMAL(8,4),
  gross_adjustment_percentage DECIMAL(8,4),
  
  -- Adjustment breakdown (summary)
  adjustments_summary JSONB DEFAULT '{}'::jsonb,
  /*
  {
    "time": 0.012,
    "location": 0.0,
    "physical": -0.046,
    "legal": 0.0,
    "total_net": -0.034,
    "total_gross": 0.058
  }
  */
  
  -- Display order
  display_order INTEGER DEFAULT 0,
  
  -- Audit
  added_by UUID REFERENCES users(id),
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_baskets_valuation ON valuation_comparable_baskets(valuation_id);
CREATE INDEX idx_basket_comps_basket ON valuation_basket_comparables(basket_id);
CREATE INDEX idx_basket_comps_property ON valuation_basket_comparables(comparable_property_id);
CREATE INDEX idx_basket_comps_excluded ON valuation_basket_comparables(is_excluded);

-- ============================================================================
-- 5. SENSITIVITY ANALYSIS
-- ============================================================================

CREATE TABLE IF NOT EXISTS valuation_sensitivity_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
  
  -- Analysis type
  analysis_type VARCHAR(30) NOT NULL,
  -- Values: single_variable, two_variable, tornado, monte_carlo
  
  -- Method being analyzed
  valuation_method VARCHAR(30) NOT NULL,
  -- Values: sales_comparison, cost_approach, income_approach, residual_method, etc.
  
  -- Configuration
  config JSONB NOT NULL,
  /*
  Single Variable:
  {
    "variable": "cap_rate",
    "base_value": 0.073,
    "range_min": 0.06,
    "range_max": 0.09,
    "step_size": 0.005
  }
  
  Two Variable:
  {
    "variable_x": {"name": "cap_rate", "values": [0.06, 0.07, 0.08, 0.09]},
    "variable_y": {"name": "vacancy_rate", "values": [0.03, 0.05, 0.07, 0.10]}
  }
  
  Monte Carlo:
  {
    "iterations": 10000,
    "variables": [
      {"name": "cap_rate", "distribution": "normal", "mean": 0.073, "std": 0.01},
      {"name": "rent_growth", "distribution": "uniform", "min": 0.02, "max": 0.06}
    ]
  }
  */
  
  -- Results
  results JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
  Single Variable:
  {
    "data_points": [
      {"variable_value": 0.06, "result_value": 1460000},
      {"variable_value": 0.065, "result_value": 1348000},
      ...
    ],
    "elasticity": -0.85,
    "breakeven_value": 0.095
  }
  
  Monte Carlo:
  {
    "mean": 1320000,
    "median": 1305000,
    "std": 125000,
    "percentiles": {"5": 1120000, "25": 1240000, "75": 1400000, "95": 1550000},
    "probability_below": [{"threshold": 1000000, "probability": 0.08}],
    "histogram_data": [...]
  }
  */
  
  -- Summary metrics
  base_case_value DECIMAL(18,2),
  best_case_value DECIMAL(18,2),
  worst_case_value DECIMAL(18,2),
  value_at_risk_5pct DECIMAL(18,2),
  
  -- Status
  status VARCHAR(20) DEFAULT 'completed',
  -- Values: pending, running, completed, failed
  
  error_message TEXT,
  
  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sensitivity_valuation ON valuation_sensitivity_analyses(valuation_id);
CREATE INDEX idx_sensitivity_type ON valuation_sensitivity_analyses(analysis_type);
CREATE INDEX idx_sensitivity_method ON valuation_sensitivity_analyses(valuation_method);

-- ============================================================================
-- 6. RECONCILIATION WORKFLOW
-- ============================================================================

CREATE TABLE IF NOT EXISTS valuation_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
  
  -- Method results snapshot
  method_results JSONB NOT NULL,
  /*
  {
    "sales_comparison": {
      "indicated_value": 1390000,
      "confidence_score": 0.85,
      "data_quality_score": 0.82,
      "applicability_score": 0.95,
      "comparable_count": 4,
      "avg_gross_adjustment": 0.12
    },
    "cost_approach": {
      "indicated_value": 1350000,
      "confidence_score": 0.68,
      "data_quality_score": 0.75,
      "applicability_score": 0.65
    },
    "income_approach": {
      "indicated_value": 1200000,
      "confidence_score": 0.78,
      "data_quality_score": 0.70,
      "applicability_score": 0.85
    }
  }
  */
  
  -- Value range
  value_range_low DECIMAL(18,2) NOT NULL,
  value_range_high DECIMAL(18,2) NOT NULL,
  value_spread_percentage DECIMAL(8,4),
  
  -- Weighting
  weighting_method VARCHAR(30) NOT NULL DEFAULT 'confidence_based',
  -- Values: confidence_based, standard_property_type, custom, equal
  
  method_weights JSONB NOT NULL,
  /*
  {
    "sales_comparison": {"weight": 0.50, "is_manual": false, "reason": null},
    "cost_approach": {"weight": 0.25, "is_manual": false, "reason": null},
    "income_approach": {"weight": 0.25, "is_manual": false, "reason": null}
  }
  */
  
  -- Calculated values
  weighted_average_value DECIMAL(18,2) NOT NULL,
  
  -- Final value selection
  final_value_selection VARCHAR(30) NOT NULL DEFAULT 'weighted_average',
  -- Values: weighted_average, primary_method, rounded_midpoint, custom
  
  final_market_value DECIMAL(18,2) NOT NULL,
  final_value_currency VARCHAR(3) DEFAULT 'GHS',
  final_value_usd DECIMAL(18,2),
  exchange_rate_used DECIMAL(10,4),
  
  -- Per unit metrics
  value_per_sqm DECIMAL(12,2),
  value_per_sqm_usd DECIMAL(12,2),
  
  -- Reconciliation narrative (REQUIRED)
  reconciliation_narrative TEXT NOT NULL,
  narrative_word_count INTEGER,
  narrative_meets_minimum BOOLEAN DEFAULT false,
  
  -- Confidence
  overall_confidence_level VARCHAR(20) NOT NULL,
  -- Values: high, moderate, low
  overall_confidence_score DECIMAL(5,4),
  confidence_factors JSONB DEFAULT '[]'::jsonb,
  
  -- Special conditions
  special_assumptions JSONB DEFAULT '[]'::jsonb,
  departures_from_standards JSONB DEFAULT '[]'::jsonb,
  
  -- Status
  status VARCHAR(20) DEFAULT 'draft',
  -- Values: draft, pending_review, approved, locked
  
  finalized_at TIMESTAMP WITH TIME ZONE,
  finalized_by UUID REFERENCES users(id),
  
  -- Review workflow
  requires_review BOOLEAN DEFAULT false,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_notes TEXT,
  
  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(valuation_id)
);

CREATE INDEX idx_reconciliation_valuation ON valuation_reconciliations(valuation_id);
CREATE INDEX idx_reconciliation_status ON valuation_reconciliations(status);
CREATE INDEX idx_reconciliation_confidence ON valuation_reconciliations(overall_confidence_level);

-- ============================================================================
-- 7. GHANA BUILDING CODE STANDARDS (Reference Table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ghana_building_code_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  room_type VARCHAR(50) NOT NULL,
  property_type VARCHAR(50) DEFAULT 'residential',
  
  minimum_area_sqm DECIMAL(8,2) NOT NULL,
  recommended_area_sqm DECIMAL(8,2),
  
  minimum_width_m DECIMAL(6,2),
  minimum_height_m DECIMAL(6,2) DEFAULT 2.7,
  
  natural_light_required BOOLEAN DEFAULT true,
  ventilation_required BOOLEAN DEFAULT true,
  
  notes TEXT,
  
  effective_date DATE DEFAULT '2024-01-01',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed Ghana Building Code standards
INSERT INTO ghana_building_code_standards (room_type, property_type, minimum_area_sqm, recommended_area_sqm, minimum_width_m, minimum_height_m, notes)
VALUES
  ('bedroom', 'residential', 9.0, 12.0, 2.5, 2.7, 'Master bedroom should be minimum 12 sqm'),
  ('bathroom', 'residential', 3.0, 4.5, 1.5, 2.4, 'Half bath minimum 1.5 sqm'),
  ('kitchen', 'residential', 5.0, 9.0, 2.0, 2.7, 'Kitchen should have ventilation'),
  ('living', 'residential', 12.0, 18.0, 3.0, 2.7, 'Living room is main gathering space'),
  ('dining', 'residential', 8.0, 12.0, 2.5, 2.7, 'Can be combined with living'),
  ('storage', 'residential', 1.5, 3.0, 1.0, 2.4, 'Walk-in minimum 2.5 sqm'),
  ('corridor', 'residential', 1.0, 1.5, 1.0, 2.4, 'Width measured at narrowest point'),
  ('porch', 'residential', 4.0, 8.0, 2.0, 2.4, 'Covered outdoor area'),
  ('garage', 'residential', 15.0, 30.0, 3.0, 2.4, 'Single car minimum 15 sqm'),
  ('laundry', 'residential', 3.0, 6.0, 1.5, 2.4, 'Should have water access'),
  ('office', 'residential', 6.0, 9.0, 2.0, 2.7, 'Home office space')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 8. GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions (adjust role names as needed)
GRANT SELECT, INSERT, UPDATE, DELETE ON valuation_floor_plans TO propmetrik_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON valuation_floor_plan_rooms TO propmetrik_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON valuation_hbu_analyses TO propmetrik_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON valuation_user_overrides TO propmetrik_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON valuation_comparable_baskets TO propmetrik_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON valuation_basket_comparables TO propmetrik_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON valuation_sensitivity_analyses TO propmetrik_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON valuation_reconciliations TO propmetrik_app;
GRANT SELECT ON ghana_building_code_standards TO propmetrik_app;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
