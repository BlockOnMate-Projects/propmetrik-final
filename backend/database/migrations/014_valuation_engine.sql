-- =====================================================
-- Migration 014: Valuation Engine Tables
-- Phase 3: Valuation Engine Implementation
-- =====================================================

-- =====================================================
-- ENUMS
-- =====================================================

-- Valuation type enum
DO $$ BEGIN
  CREATE TYPE valuation_type AS ENUM ('avm', 'professional', 'hybrid', 'desktop', 'drive_by', 'full_inspection');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Valuation purpose enum
DO $$ BEGIN
  CREATE TYPE valuation_purpose AS ENUM (
    'sale', 'purchase', 'mortgage', 'refinance', 'insurance', 
    'tax', 'estate', 'litigation', 'investment', 'development', 
    'rental', 'internal', 'portfolio'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Valuation status enum
DO $$ BEGIN
  CREATE TYPE valuation_status AS ENUM (
    'draft', 'pending_review', 'in_progress', 'completed', 
    'reviewed', 'approved', 'rejected', 'expired', 'superseded'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Valuation method enum
DO $$ BEGIN
  CREATE TYPE valuation_method AS ENUM (
    'sales_comparison', 'cost_approach', 'income_approach',
    'residual_method', 'profits_method', 'drc_method'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Comparable source type enum
DO $$ BEGIN
  CREATE TYPE comparable_source_type AS ENUM (
    'database', 'user_contributed', 'manual', 'api_import', 'historical'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ML model type enum
DO $$ BEGIN
  CREATE TYPE ml_model_type AS ENUM (
    'random_forest', 'gradient_boost', 'xgboost', 'lightgbm',
    'neural_network', 'linear_regression', 'ensemble'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- VALUATIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS valuations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Property Reference (no FK due to partitioned properties table)
  property_id UUID NOT NULL,
  property_snapshot JSONB, -- Snapshot of property data at valuation time
  
  -- Valuer Information
  valuer_id UUID REFERENCES users(id), -- NULL for AVM
  valuer_organization_id UUID REFERENCES organizations(id),
  valuer_license_number VARCHAR(50),
  
  -- Valuation Classification
  valuation_type valuation_type NOT NULL DEFAULT 'avm',
  valuation_purpose valuation_purpose NOT NULL DEFAULT 'sale',
  is_retrospective BOOLEAN DEFAULT false,
  
  -- Core Results
  estimated_value DECIMAL(15,2) NOT NULL,
  value_range_low DECIMAL(15,2),
  value_range_high DECIMAL(15,2),
  value_per_sqm DECIMAL(12,2),
  value_currency VARCHAR(3) DEFAULT 'GHS',
  
  -- Confidence & Quality
  confidence_score DECIMAL(4,3), -- 0.000 to 1.000
  confidence_level VARCHAR(20), -- 'high', 'medium', 'low'
  data_quality_score DECIMAL(4,3),
  comparable_quality_score DECIMAL(4,3),
  
  -- Methods Used & Results
  methods_used JSONB NOT NULL DEFAULT '[]', -- [{method, weight, value, confidence}]
  primary_method valuation_method,
  
  -- Individual Method Values
  sales_comparison_value DECIMAL(15,2),
  sales_comparison_confidence DECIMAL(4,3),
  cost_approach_value DECIMAL(15,2),
  cost_approach_confidence DECIMAL(4,3),
  income_approach_value DECIMAL(15,2),
  income_approach_confidence DECIMAL(4,3),
  residual_value DECIMAL(15,2),
  residual_confidence DECIMAL(4,3),
  profits_value DECIMAL(15,2),
  profits_confidence DECIMAL(4,3),
  drc_value DECIMAL(15,2),
  drc_confidence DECIMAL(4,3),
  
  -- Comparables Summary
  comparables_count INTEGER DEFAULT 0,
  comparables_avg_distance_km DECIMAL(8,3),
  comparables_avg_age_days INTEGER,
  comparables_used JSONB, -- Array of comparable IDs with summary info
  
  -- Market Context
  market_conditions JSONB, -- {trend, activity_level, days_on_market_avg}
  economic_factors JSONB, -- {inflation_rate, interest_rate, exchange_rate}
  
  -- Adjustments Applied
  adjustments_summary JSONB, -- Summary of all adjustments made
  special_assumptions TEXT[], -- Any special assumptions
  limiting_conditions TEXT[], -- Any limiting conditions
  
  -- Dates
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  inspection_date DATE,
  expiry_date DATE,
  
  -- Status & Workflow
  status valuation_status DEFAULT 'draft',
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_notes TEXT,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  
  -- Report
  report_url VARCHAR(500),
  report_generated_at TIMESTAMP WITH TIME ZONE,
  report_format VARCHAR(20), -- 'pdf', 'docx', 'xlsx'
  report_template_id UUID,
  
  -- ML Model Reference
  ml_model_id UUID,
  ml_model_version VARCHAR(20),
  ml_features_used JSONB,
  ml_prediction_details JSONB,
  
  -- Contribution Integration
  contribution_gap_detected BOOLEAN DEFAULT false,
  contribution_prompts_shown INTEGER DEFAULT 0,
  contributions_received INTEGER DEFAULT 0,
  
  -- Audit
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  
  -- Versioning
  version INTEGER DEFAULT 1,
  previous_valuation_id UUID REFERENCES valuations(id),
  is_latest BOOLEAN DEFAULT true
);

-- Indexes for valuations
CREATE INDEX IF NOT EXISTS idx_valuations_property_id ON valuations(property_id);
CREATE INDEX IF NOT EXISTS idx_valuations_valuer_id ON valuations(valuer_id);
CREATE INDEX IF NOT EXISTS idx_valuations_status ON valuations(status);
CREATE INDEX IF NOT EXISTS idx_valuations_type ON valuations(valuation_type);
CREATE INDEX IF NOT EXISTS idx_valuations_effective_date ON valuations(effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_valuations_created_at ON valuations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_valuations_property_latest ON valuations(property_id, is_latest) WHERE is_latest = true;

-- =====================================================
-- VALUATION COMPARABLES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS valuation_comparables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
  
  -- Comparable Property Reference (no FK due to partitioned properties table)
  comparable_property_id UUID,
  external_reference VARCHAR(100), -- For manual/external comparables
  
  -- Source & Attribution
  source_type comparable_source_type NOT NULL DEFAULT 'database',
  contributor_id UUID REFERENCES users(id),
  contribution_id UUID REFERENCES contributions(id),
  
  -- Comparable Property Details (snapshot)
  property_snapshot JSONB, -- Full property details at comparison time
  address_formatted VARCHAR(500),
  property_type VARCHAR(50),
  bedrooms INTEGER,
  bathrooms INTEGER,
  building_size_sqm DECIMAL(10,2),
  land_size_sqm DECIMAL(10,2),
  year_built INTEGER,
  condition VARCHAR(30),
  
  -- Location
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  distance_km DECIMAL(8,3),
  same_neighborhood BOOLEAN,
  same_district BOOLEAN,
  
  -- Transaction Details
  sale_price DECIMAL(15,2) NOT NULL,
  sale_currency VARCHAR(3) DEFAULT 'GHS',
  sale_date DATE NOT NULL,
  sale_type VARCHAR(30), -- 'arm_length', 'distressed', 'auction', 'family'
  verified_transaction BOOLEAN DEFAULT false,
  days_since_sale INTEGER,
  
  -- Similarity & Quality
  similarity_score DECIMAL(4,3), -- 0.000 to 1.000
  quality_score DECIMAL(4,3),
  
  -- Adjustments
  adjustments JSONB NOT NULL DEFAULT '{}', -- {location: -5000, size: 3000, ...}
  adjustment_details JSONB, -- Detailed breakdown with reasoning
  total_adjustment DECIMAL(15,2) DEFAULT 0,
  total_adjustment_percent DECIMAL(6,3),
  adjusted_price DECIMAL(15,2) NOT NULL,
  
  -- Weight in Final Value
  weight DECIMAL(4,3), -- 0.000 to 1.000
  weight_reason TEXT,
  
  -- Flags
  is_primary BOOLEAN DEFAULT false, -- Primary comparable
  is_excluded BOOLEAN DEFAULT false,
  exclusion_reason TEXT,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for valuation_comparables
CREATE INDEX IF NOT EXISTS idx_valuation_comparables_valuation_id ON valuation_comparables(valuation_id);
CREATE INDEX IF NOT EXISTS idx_valuation_comparables_property_id ON valuation_comparables(comparable_property_id);
CREATE INDEX IF NOT EXISTS idx_valuation_comparables_sale_date ON valuation_comparables(sale_date DESC);

-- =====================================================
-- MARKET INDICES TABLE (for valuation adjustments)
-- =====================================================

CREATE TABLE IF NOT EXISTS valuation_market_indices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Classification
  region region_code_enum NOT NULL,
  property_type VARCHAR(50), -- NULL means all property types
  index_type VARCHAR(30) NOT NULL, -- 'price_index', 'rental_index', 'construction_cost'
  
  -- Values
  index_value DECIMAL(12,4) NOT NULL,
  base_value DECIMAL(12,4) DEFAULT 100.0000,
  base_period DATE NOT NULL,
  current_period DATE NOT NULL,
  
  -- Changes
  change_mom DECIMAL(6,3), -- Month over month
  change_qoq DECIMAL(6,3), -- Quarter over quarter
  change_yoy DECIMAL(6,3), -- Year over year
  
  -- Trend
  trend_direction VARCHAR(10), -- 'rising', 'stable', 'falling'
  trend_strength DECIMAL(4,3), -- 0 to 1
  
  -- Source
  source_name VARCHAR(100),
  calculation_methodology TEXT,
  sample_size INTEGER,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(region, property_type, index_type, current_period)
);

CREATE INDEX IF NOT EXISTS idx_market_indices_region_type ON valuation_market_indices(region, index_type);
CREATE INDEX IF NOT EXISTS idx_market_indices_period ON valuation_market_indices(current_period DESC);

-- =====================================================
-- ML MODELS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS valuation_ml_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identification
  model_name VARCHAR(100) NOT NULL,
  model_version VARCHAR(20) NOT NULL,
  model_type ml_model_type NOT NULL,
  
  -- Scope
  property_types VARCHAR[] NOT NULL, -- Which property types this handles
  regions region_code_enum[], -- Which regions (NULL = all)
  
  -- Performance Metrics
  metrics JSONB NOT NULL DEFAULT '{}', -- {mae, rmse, mape, r2, accuracy}
  mae DECIMAL(15,2), -- Mean Absolute Error in GHS
  mape DECIMAL(6,3), -- Mean Absolute Percentage Error
  rmse DECIMAL(15,2), -- Root Mean Square Error
  r2_score DECIMAL(5,4), -- R-squared
  accuracy_within_10 DECIMAL(5,3), -- % predictions within 10%
  accuracy_within_15 DECIMAL(5,3), -- % predictions within 15%
  accuracy_within_20 DECIMAL(5,3), -- % predictions within 20%
  
  -- Training Info
  training_samples INTEGER,
  validation_samples INTEGER,
  test_samples INTEGER,
  feature_count INTEGER,
  feature_names VARCHAR[],
  feature_importances JSONB,
  hyperparameters JSONB,
  
  -- Model Storage
  file_path VARCHAR(500) NOT NULL,
  file_size_bytes BIGINT,
  file_checksum VARCHAR(64),
  
  -- Status
  is_active BOOLEAN DEFAULT false,
  is_production BOOLEAN DEFAULT false,
  
  -- Lifecycle
  trained_at TIMESTAMP WITH TIME ZONE NOT NULL,
  validated_at TIMESTAMP WITH TIME ZONE,
  deployed_at TIMESTAMP WITH TIME ZONE,
  retired_at TIMESTAMP WITH TIME ZONE,
  
  -- Usage Stats
  predictions_count INTEGER DEFAULT 0,
  avg_prediction_ms INTEGER,
  last_prediction_at TIMESTAMP WITH TIME ZONE,
  
  -- Audit
  trained_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(model_name, model_version)
);

CREATE INDEX IF NOT EXISTS idx_ml_models_active ON valuation_ml_models(is_active, is_production);
CREATE INDEX IF NOT EXISTS idx_ml_models_type ON valuation_ml_models(model_type);

-- =====================================================
-- VALUATION ADJUSTMENT FACTORS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS valuation_adjustment_factors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Scope
  region region_code_enum,
  property_type VARCHAR(50),
  adjustment_category VARCHAR(50) NOT NULL, -- 'location', 'size', 'condition', 'age', 'amenities', 'time'
  adjustment_factor VARCHAR(100) NOT NULL, -- Specific factor within category
  
  -- Values
  base_adjustment_percent DECIMAL(8,4), -- Percentage adjustment
  base_adjustment_amount DECIMAL(12,2), -- Fixed amount adjustment
  unit VARCHAR(20), -- 'per_sqm', 'per_unit', 'percentage', 'fixed'
  
  -- Ranges (for size-based adjustments)
  min_value DECIMAL(12,2),
  max_value DECIMAL(12,2),
  
  -- Methodology
  calculation_method VARCHAR(50), -- 'linear', 'logarithmic', 'stepped', 'fixed'
  calculation_formula TEXT,
  
  -- Source
  source_type VARCHAR(30), -- 'market_analysis', 'expert', 'ml_derived'
  source_reference VARCHAR(200),
  sample_size INTEGER,
  confidence_level DECIMAL(4,3),
  
  -- Validity
  effective_date DATE NOT NULL,
  expiry_date DATE,
  is_active BOOLEAN DEFAULT true,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_adjustment_factors_category ON valuation_adjustment_factors(adjustment_category, adjustment_factor);
CREATE INDEX IF NOT EXISTS idx_adjustment_factors_region ON valuation_adjustment_factors(region, property_type);
CREATE INDEX IF NOT EXISTS idx_adjustment_factors_active ON valuation_adjustment_factors(is_active, effective_date);

-- =====================================================
-- VALUATION REPORT TEMPLATES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS valuation_report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identification
  name VARCHAR(100) NOT NULL,
  description TEXT,
  template_type VARCHAR(30) NOT NULL, -- 'standard', 'professional', 'bank', 'insurance'
  
  -- Content
  template_content TEXT NOT NULL, -- HTML/Handlebars template
  css_styles TEXT,
  header_html TEXT,
  footer_html TEXT,
  
  -- Configuration
  page_size VARCHAR(10) DEFAULT 'A4',
  orientation VARCHAR(20) DEFAULT 'portrait',
  margins JSONB DEFAULT '{"top": 20, "right": 20, "bottom": 20, "left": 20}',
  
  -- Branding
  logo_url VARCHAR(500),
  company_name VARCHAR(200),
  company_address TEXT,
  company_license VARCHAR(100),
  
  -- Status
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  -- Ownership
  organization_id UUID REFERENCES organizations(id),
  is_public BOOLEAN DEFAULT false, -- Available to all users
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_report_templates_type ON valuation_report_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_report_templates_org ON valuation_report_templates(organization_id);

-- =====================================================
-- VALUATION AUDIT LOG TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS valuation_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
  
  -- Action
  action VARCHAR(50) NOT NULL, -- 'created', 'updated', 'reviewed', 'approved', 'rejected', 'report_generated'
  action_details JSONB,
  
  -- Changes
  previous_values JSONB,
  new_values JSONB,
  
  -- Actor
  performed_by UUID REFERENCES users(id),
  performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address VARCHAR(45),
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_valuation_audit_valuation_id ON valuation_audit_log(valuation_id);
CREATE INDEX IF NOT EXISTS idx_valuation_audit_action ON valuation_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_valuation_audit_date ON valuation_audit_log(performed_at DESC);

-- =====================================================
-- VIEWS
-- =====================================================

-- View: Latest valuations per property
CREATE OR REPLACE VIEW v_property_latest_valuations AS
SELECT 
  v.*,
  p.title as property_title,
  p.address_street,
  p.address_city,
  p.region as property_region,
  p.property_type as property_type_name
FROM valuations v
JOIN properties p ON v.property_id = p.id
WHERE v.is_latest = true;

-- View: Valuation statistics by region
CREATE OR REPLACE VIEW v_valuation_stats_by_region AS
SELECT 
  p.region,
  COUNT(*) as total_valuations,
  COUNT(CASE WHEN v.valuation_type = 'avm' THEN 1 END) as avm_count,
  COUNT(CASE WHEN v.valuation_type = 'professional' THEN 1 END) as professional_count,
  AVG(v.estimated_value) as avg_value,
  AVG(v.confidence_score) as avg_confidence,
  AVG(v.comparables_count) as avg_comparables,
  DATE_TRUNC('month', v.created_at) as month
FROM valuations v
JOIN properties p ON v.property_id = p.id
WHERE v.status = 'completed'
GROUP BY p.region, DATE_TRUNC('month', v.created_at);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function: Update valuation updated_at timestamp
CREATE OR REPLACE FUNCTION update_valuation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update valuation timestamp
DROP TRIGGER IF EXISTS trg_valuation_updated_at ON valuations;
CREATE TRIGGER trg_valuation_updated_at
  BEFORE UPDATE ON valuations
  FOR EACH ROW
  EXECUTE FUNCTION update_valuation_timestamp();

-- Function: Mark previous valuations as not latest
CREATE OR REPLACE FUNCTION update_valuation_latest_flag()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_latest = true THEN
    UPDATE valuations 
    SET is_latest = false, updated_at = NOW()
    WHERE property_id = NEW.property_id 
      AND id != NEW.id 
      AND is_latest = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update is_latest flag
DROP TRIGGER IF EXISTS trg_valuation_latest_flag ON valuations;
CREATE TRIGGER trg_valuation_latest_flag
  AFTER INSERT OR UPDATE OF is_latest ON valuations
  FOR EACH ROW
  WHEN (NEW.is_latest = true)
  EXECUTE FUNCTION update_valuation_latest_flag();

-- =====================================================
-- SEED DATA: Default Adjustment Factors
-- =====================================================

-- Location adjustments by region
INSERT INTO valuation_adjustment_factors 
  (region, adjustment_category, adjustment_factor, base_adjustment_percent, unit, calculation_method, source_type, effective_date, is_active)
VALUES
  -- Greater Accra premium adjustments
  ('greater_accra', 'location', 'airport_proximity_5km', 8.0, 'percentage', 'fixed', 'market_analysis', '2025-01-01', true),
  ('greater_accra', 'location', 'ocean_view', 15.0, 'percentage', 'fixed', 'market_analysis', '2025-01-01', true),
  ('greater_accra', 'location', 'gated_community', 12.0, 'percentage', 'fixed', 'market_analysis', '2025-01-01', true),
  ('greater_accra', 'location', 'commercial_area', 5.0, 'percentage', 'fixed', 'market_analysis', '2025-01-01', true),
  
  -- Condition adjustments (all regions)
  (NULL, 'condition', 'excellent_vs_good', 10.0, 'percentage', 'fixed', 'market_analysis', '2025-01-01', true),
  (NULL, 'condition', 'good_vs_fair', -8.0, 'percentage', 'fixed', 'market_analysis', '2025-01-01', true),
  (NULL, 'condition', 'fair_vs_poor', -15.0, 'percentage', 'fixed', 'market_analysis', '2025-01-01', true),
  (NULL, 'condition', 'newly_renovated', 12.0, 'percentage', 'fixed', 'market_analysis', '2025-01-01', true),
  
  -- Age adjustments
  (NULL, 'age', 'per_year_depreciation', -1.5, 'percentage', 'linear', 'market_analysis', '2025-01-01', true),
  (NULL, 'age', 'new_construction_premium', 8.0, 'percentage', 'fixed', 'market_analysis', '2025-01-01', true),
  
  -- Amenities adjustments
  (NULL, 'amenities', 'swimming_pool', 5.0, 'percentage', 'fixed', 'market_analysis', '2025-01-01', true),
  (NULL, 'amenities', 'garage_per_car', 3.0, 'percentage', 'linear', 'market_analysis', '2025-01-01', true),
  (NULL, 'amenities', 'security_24hr', 4.0, 'percentage', 'fixed', 'market_analysis', '2025-01-01', true),
  (NULL, 'amenities', 'generator_backup', 3.0, 'percentage', 'fixed', 'market_analysis', '2025-01-01', true),
  (NULL, 'amenities', 'borehole_water', 2.5, 'percentage', 'fixed', 'market_analysis', '2025-01-01', true),
  
  -- Size adjustments
  (NULL, 'size', 'sqm_adjustment_rate', 0.5, 'per_sqm', 'logarithmic', 'market_analysis', '2025-01-01', true),
  (NULL, 'size', 'bedroom_adjustment', 2.0, 'percentage', 'linear', 'market_analysis', '2025-01-01', true),
  (NULL, 'size', 'bathroom_adjustment', 1.5, 'percentage', 'linear', 'market_analysis', '2025-01-01', true),
  
  -- Time adjustments (market appreciation rates by region)
  ('greater_accra', 'time', 'monthly_appreciation', 0.8, 'percentage', 'linear', 'market_analysis', '2025-01-01', true),
  ('kumasi_metro', 'time', 'monthly_appreciation', 0.6, 'percentage', 'linear', 'market_analysis', '2025-01-01', true),
  ('eastern', 'time', 'monthly_appreciation', 0.4, 'percentage', 'linear', 'market_analysis', '2025-01-01', true),
  ('western_cluster', 'time', 'monthly_appreciation', 0.5, 'percentage', 'linear', 'market_analysis', '2025-01-01', true),
  ('northern_cluster', 'time', 'monthly_appreciation', 0.3, 'percentage', 'linear', 'market_analysis', '2025-01-01', true)
ON CONFLICT DO NOTHING;

-- =====================================================
-- Record Migration
-- =====================================================

INSERT INTO migrations (name, executed_at, checksum) 
VALUES ('014_valuation_engine', NOW(), md5('014_valuation_engine'))
ON CONFLICT DO NOTHING;
