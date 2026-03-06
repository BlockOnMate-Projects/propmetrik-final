-- Migration: 033b_property_detail_tables.sql
-- Description: Property detail tables without FK to partitioned properties table
-- Note: Properties table is partitioned by region, so we can't use direct FK
-- Created: 2026-01-15

-- ============================================================================
-- PROPERTY LEGAL TABLE
-- Stores legal and tenure information for properties
-- Note: No FK to properties due to partitioning, use application-level validation
-- ============================================================================
CREATE TABLE IF NOT EXISTS property_legal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL, -- References properties(id) but no FK due to partitioning
  
  -- Tenure type (Ghana-specific options)
  tenure_type VARCHAR(50) NOT NULL DEFAULT 'freehold'
    CHECK (tenure_type IN ('freehold', 'leasehold', 'stool_land', 'family_land', 'government_land', 'customary', 'other')),
  tenure_description TEXT,
  
  -- Leasehold details
  lease_term_years INT,
  lease_start_date DATE,
  lease_expiry_date DATE,
  unexpired_term_years DECIMAL(5,2),
  ground_rent DECIMAL(15,2),
  ground_rent_frequency VARCHAR(20),
  rent_review_dates DATE[],
  lessor VARCHAR(255),
  
  -- Title registration
  land_title_registered BOOLEAN DEFAULT FALSE,
  registration_number VARCHAR(100),
  registration_district VARCHAR(100),
  title_type VARCHAR(50),
  title_date DATE,
  
  -- Ghana-specific: Stool/Family land
  stool_name VARCHAR(255),
  family_name VARCHAR(255),
  customary_allocation_date DATE,
  
  -- Encumbrances and permits
  encumbrances JSONB DEFAULT '[]',
  permits JSONB DEFAULT '{}',
  
  -- Planning/zoning
  zoning_classification VARCHAR(100),
  planning_scheme VARCHAR(255),
  permitted_uses TEXT[],
  planning_constraints TEXT[],
  
  -- Assumptions
  assumptions TEXT[],
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_property_legal_property_id ON property_legal(property_id);
CREATE INDEX IF NOT EXISTS idx_property_legal_tenure ON property_legal(tenure_type);
CREATE INDEX IF NOT EXISTS idx_property_legal_registration ON property_legal(registration_number) WHERE registration_number IS NOT NULL;

-- ============================================================================
-- PROPERTY CONSTRUCTION TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS property_construction (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL, -- References properties(id) but no FK due to partitioning
  
  -- Structure
  construction_type VARCHAR(255),
  foundation_type VARCHAR(255),
  structural_frame VARCHAR(255),
  
  -- Walls
  external_walls VARCHAR(255),
  internal_walls VARCHAR(255),
  wall_finish TEXT,
  
  -- Floors
  floor_structure VARCHAR(255),
  floor_finish TEXT,
  
  -- Doors and windows
  door_types TEXT,
  window_types TEXT,
  
  -- Ceiling and roof
  ceiling_types TEXT,
  roof_structure VARCHAR(255),
  roof_types TEXT,
  roof_finish VARCHAR(255),
  
  -- Fixtures
  fixtures TEXT[],
  kitchen_fittings TEXT,
  bathroom_fittings TEXT,
  
  -- Services
  water_supply VARCHAR(100),
  water_storage_capacity INT,
  electricity_supply VARCHAR(100),
  electricity_phase VARCHAR(20),
  backup_power VARCHAR(255),
  drainage_system VARCHAR(255),
  telecom_available BOOLEAN DEFAULT TRUE,
  internet_available BOOLEAN DEFAULT TRUE,
  
  -- Condition
  condition_overall VARCHAR(20) DEFAULT 'good'
    CHECK (condition_overall IN ('excellent', 'good', 'fair', 'poor', 'very_poor')),
  condition_age_years INT,
  effective_age_years INT,
  remaining_life_years INT,
  
  -- Defects
  structural_notes TEXT,
  defects TEXT[],
  deferred_maintenance TEXT[],
  recommended_repairs TEXT[],
  estimated_repair_cost DECIMAL(15,2),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_property_construction_property_id ON property_construction(property_id);
CREATE INDEX IF NOT EXISTS idx_property_construction_condition ON property_construction(condition_overall);

-- ============================================================================
-- PROPERTY RISK ASSESSMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS property_risk_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL, -- References properties(id) but no FK due to partitioning
  assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  assessor_id UUID REFERENCES users(id),
  
  -- Neighbourhood/Location Factors
  employment_stability VARCHAR(10) CHECK (employment_stability IN ('good', 'average', 'fair', 'poor')),
  convenience_employment VARCHAR(10) CHECK (convenience_employment IN ('good', 'average', 'fair', 'poor')),
  convenience_shopping VARCHAR(10) CHECK (convenience_shopping IN ('good', 'average', 'fair', 'poor')),
  convenience_school VARCHAR(10) CHECK (convenience_school IN ('good', 'average', 'fair', 'poor')),
  convenience_healthcare VARCHAR(10) CHECK (convenience_healthcare IN ('good', 'average', 'fair', 'poor')),
  public_transportation VARCHAR(10) CHECK (public_transportation IN ('good', 'average', 'fair', 'poor')),
  utilities_adequacy VARCHAR(10) CHECK (utilities_adequacy IN ('good', 'average', 'fair', 'poor')),
  recreation_facilities VARCHAR(10) CHECK (recreation_facilities IN ('good', 'average', 'fair', 'poor')),
  police_fire_protection VARCHAR(10) CHECK (police_fire_protection IN ('good', 'average', 'fair', 'poor')),
  general_appearance VARCHAR(10) CHECK (general_appearance IN ('good', 'average', 'fair', 'poor')),
  
  -- Property-specific factors
  accessibility VARCHAR(10) CHECK (accessibility IN ('good', 'average', 'fair', 'poor')),
  road_condition VARCHAR(10) CHECK (road_condition IN ('good', 'average', 'fair', 'poor')),
  drainage_adequacy VARCHAR(10) CHECK (drainage_adequacy IN ('good', 'average', 'fair', 'poor')),
  flood_risk VARCHAR(10) CHECK (flood_risk IN ('low', 'medium', 'high', 'very_high')),
  environmental_hazards VARCHAR(10) CHECK (environmental_hazards IN ('none', 'low', 'medium', 'high')),
  
  -- Overall assessment
  overall_risk_level VARCHAR(10) NOT NULL DEFAULT 'low'
    CHECK (overall_risk_level IN ('low', 'medium', 'high', 'very_high')),
  risk_score INT CHECK (risk_score >= 0 AND risk_score <= 100),
  
  -- Notes
  notes TEXT,
  key_risks TEXT[],
  mitigating_factors TEXT[],
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_property_risk_assessments_property_id ON property_risk_assessments(property_id);
CREATE INDEX IF NOT EXISTS idx_property_risk_assessments_risk_level ON property_risk_assessments(overall_risk_level);
CREATE INDEX IF NOT EXISTS idx_property_risk_assessments_date ON property_risk_assessments(assessment_date DESC);

-- ============================================================================
-- TRIGGERS
-- ============================================================================
DROP TRIGGER IF EXISTS update_property_legal_updated_at ON property_legal;
CREATE TRIGGER update_property_legal_updated_at
  BEFORE UPDATE ON property_legal
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_property_construction_updated_at ON property_construction;
CREATE TRIGGER update_property_construction_updated_at
  BEFORE UPDATE ON property_construction
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_property_risk_assessments_updated_at ON property_risk_assessments;
CREATE TRIGGER update_property_risk_assessments_updated_at
  BEFORE UPDATE ON property_risk_assessments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE property_legal IS 'Legal and tenure information for properties including Ghana-specific land types';
COMMENT ON TABLE property_construction IS 'Detailed construction specifications and condition assessments';
COMMENT ON TABLE property_risk_assessments IS 'Risk assessment matrix for properties';
