-- Migration: 016_valuation_gaps_fix.sql
-- Description: Fix tables that failed due to FK constraints on partitioned tables
-- Author: PropMetrik Engineering
-- Date: 2026-01-08

-- ============================================================================
-- 1. FLOOR PLAN STORAGE (without FK to partitioned properties table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS valuation_floor_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
  property_id UUID, -- No FK to partitioned table, app-level validation
  
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
  
  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(valuation_id, floor_number)
);

-- Room measurements detail table
CREATE TABLE IF NOT EXISTS valuation_floor_plan_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_plan_id UUID NOT NULL REFERENCES valuation_floor_plans(id) ON DELETE CASCADE,
  
  room_name VARCHAR(100) NOT NULL,
  room_type VARCHAR(50) NOT NULL,
  
  area_sqm DECIMAL(10,4) NOT NULL,
  perimeter_m DECIMAL(10,4),
  
  length_m DECIMAL(10,4),
  width_m DECIMAL(10,4),
  height_m DECIMAL(10,4) DEFAULT 3.0,
  
  vertices JSONB,
  
  meets_minimum_size BOOLEAN DEFAULT true,
  minimum_size_sqm DECIMAL(10,4),
  validation_notes TEXT,
  
  display_order INTEGER DEFAULT 0,
  fill_color VARCHAR(20) DEFAULT '#E5E7EB',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_floor_plans_valuation ON valuation_floor_plans(valuation_id);
CREATE INDEX IF NOT EXISTS idx_floor_plans_property ON valuation_floor_plans(property_id);
CREATE INDEX IF NOT EXISTS idx_floor_plan_rooms_plan ON valuation_floor_plan_rooms(floor_plan_id);
CREATE INDEX IF NOT EXISTS idx_floor_plan_rooms_type ON valuation_floor_plan_rooms(room_type);

-- ============================================================================
-- 3. USER OVERRIDES (without FK to non-existent documents table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS valuation_user_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
  
  -- What was overridden
  category VARCHAR(50) NOT NULL,
  field_path VARCHAR(200) NOT NULL,
  field_label VARCHAR(200),
  
  -- Values (stored as JSONB to handle any type)
  system_default_value JSONB NOT NULL,
  user_override_value JSONB NOT NULL,
  value_unit VARCHAR(50),
  
  -- Deviation tracking
  deviation_percent DECIMAL(10,4),
  deviation_absolute DECIMAL(15,4),
  
  -- Justification
  reason TEXT NOT NULL,
  supporting_evidence TEXT,
  evidence_document_id UUID, -- No FK to documents, app-level validation
  
  -- Approval workflow
  approval_status VARCHAR(20) DEFAULT 'pending',
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  approval_notes TEXT,
  
  -- Source tracking
  source_module VARCHAR(100),
  source_component VARCHAR(100),
  
  -- Audit
  overridden_by UUID NOT NULL REFERENCES users(id),
  overridden_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_overrides_valuation ON valuation_user_overrides(valuation_id);
CREATE INDEX IF NOT EXISTS idx_user_overrides_category ON valuation_user_overrides(category);
CREATE INDEX IF NOT EXISTS idx_user_overrides_status ON valuation_user_overrides(approval_status);

-- ============================================================================
-- 4. COMPARABLE BASKET ITEMS (without FK to partitioned properties table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS valuation_basket_comparables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  basket_id UUID NOT NULL REFERENCES valuation_comparable_baskets(id) ON DELETE CASCADE,
  
  comparable_property_id UUID, -- No FK to partitioned table, app-level validation
  
  -- For manual entries (not from database)
  is_manual_entry BOOLEAN DEFAULT false,
  manual_data JSONB,
  
  -- Quality and similarity
  similarity_score DECIMAL(5,4),
  quality_score DECIMAL(5,4),
  data_completeness_score DECIMAL(5,4),
  
  -- Weighting
  weight DECIMAL(5,4) DEFAULT 0.0,
  is_weight_manual BOOLEAN DEFAULT false,
  weight_justification TEXT,
  
  -- Adjustments summary
  adjusted_sale_price DECIMAL(15,2),
  adjustments_summary JSONB,
  net_adjustment_percent DECIMAL(8,4),
  gross_adjustment_percent DECIMAL(8,4),
  
  -- Status
  is_excluded BOOLEAN DEFAULT false,
  exclusion_reason TEXT,
  
  -- Tags for organization
  tags VARCHAR[] DEFAULT '{}',
  
  -- Audit
  added_by UUID REFERENCES users(id),
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_basket_comparables_basket ON valuation_basket_comparables(basket_id);
CREATE INDEX IF NOT EXISTS idx_basket_comparables_property ON valuation_basket_comparables(comparable_property_id);
CREATE INDEX IF NOT EXISTS idx_basket_comparables_excluded ON valuation_basket_comparables(is_excluded);

-- ============================================================================
-- 5. GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON valuation_floor_plans TO propmetrik_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON valuation_floor_plan_rooms TO propmetrik_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON valuation_user_overrides TO propmetrik_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON valuation_basket_comparables TO propmetrik_app;

-- Confirm completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 016_valuation_gaps_fix completed successfully';
END $$;
