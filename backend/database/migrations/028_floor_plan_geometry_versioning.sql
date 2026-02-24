-- Migration: 028_floor_plan_geometry_versioning
-- Description: Create geometry versioning table for floor plan audit trail
-- Created: 2026-01-14
-- Part of Floor Plan Enhancement Phase 1

-- ============================================================================
-- GEOMETRY VERSIONS TABLE
-- Stores authoritative geometry from Blender with full version history
-- ============================================================================

CREATE TABLE IF NOT EXISTS valuation_floor_plan_geometry_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference to valuation
  valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
  floor_plan_id UUID REFERENCES valuation_floor_plans(id) ON DELETE CASCADE,
  
  -- Version tracking
  version_number INTEGER NOT NULL,
  geometry_hash VARCHAR(64) NOT NULL, -- SHA-256 hash of geometry for integrity
  
  -- Geometry data
  blender_output JSONB NOT NULL, -- Raw Blender geometry output
  fabric_projection JSONB NOT NULL, -- 2D projection for Fabric.js rendering
  
  -- Measurements (authoritative, from Blender)
  measurements JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Expected structure:
  -- {
  --   "gfa_sqm": number,
  --   "nia_sqm": number,
  --   "efficiency_ratio": number,
  --   "wall_area_sqm": number,
  --   "rooms": [{ "id", "name", "type", "area_sqm", "perimeter_m" }],
  --   "external_perimeter_m": number,
  --   "calculation_method": "blender_mesh" | "shoelace_2d"
  -- }
  
  -- Validation
  validation_result JSONB DEFAULT '{}'::jsonb,
  -- Expected structure:
  -- {
  --   "valid": boolean,
  --   "errors": [],
  --   "warnings": [],
  --   "code_compliance": { "ghana_building_code": boolean, "minimum_sizes": boolean }
  -- }
  
  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  -- 'draft' - initial geometry
  -- 'validated' - passed all validation
  -- 'approved' - approved by user
  -- 'locked' - finalized for valuation
  -- 'superseded' - replaced by newer version
  
  -- Audit fields
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  superseded_at TIMESTAMP WITH TIME ZONE,
  superseded_by UUID REFERENCES valuation_floor_plan_geometry_versions(id),
  
  -- Constraints
  UNIQUE(valuation_id, version_number)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_geometry_versions_valuation ON valuation_floor_plan_geometry_versions(valuation_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_geometry_versions_floor_plan ON valuation_floor_plan_geometry_versions(floor_plan_id);
CREATE INDEX IF NOT EXISTS idx_geometry_versions_status ON valuation_floor_plan_geometry_versions(status);
CREATE INDEX IF NOT EXISTS idx_geometry_versions_hash ON valuation_floor_plan_geometry_versions(geometry_hash);

-- Comments for documentation
COMMENT ON TABLE valuation_floor_plan_geometry_versions IS 'Stores authoritative geometry versions from Blender for audit trail and reproducibility';
COMMENT ON COLUMN valuation_floor_plan_geometry_versions.geometry_hash IS 'SHA-256 hash of blender_output for integrity verification';
COMMENT ON COLUMN valuation_floor_plan_geometry_versions.blender_output IS 'Raw geometry output from Blender kernel (authoritative)';
COMMENT ON COLUMN valuation_floor_plan_geometry_versions.fabric_projection IS '2D projection for Fabric.js rendering (derived from blender_output)';
COMMENT ON COLUMN valuation_floor_plan_geometry_versions.measurements IS 'Authoritative measurements calculated by Blender';
