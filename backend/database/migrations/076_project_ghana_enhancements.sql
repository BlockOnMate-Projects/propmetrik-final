-- Migration: 076_project_ghana_enhancements.sql
-- Phase 1 Sprint 1: Ghana-Specific Project Model Enhancements
-- 
-- This migration extends development_projects with Ghana-specific fields
-- for location validation, land tenure tracking, and search functionality.
-- NOTE: Uses Data Hub services for validation, NOT duplicate implementations.

-- ============================================================================
-- 1. Add Ghana-Specific Location Fields
-- ============================================================================
-- These fields complement the existing ghana_post_gps, latitude, longitude
-- by adding validated administrative divisions and location geometry.

-- Ghana administrative divisions
ALTER TABLE development_projects 
  ADD COLUMN IF NOT EXISTS ghana_region VARCHAR(100);

ALTER TABLE development_projects 
  ADD COLUMN IF NOT EXISTS ghana_district VARCHAR(150);

ALTER TABLE development_projects 
  ADD COLUMN IF NOT EXISTS ghana_area VARCHAR(200);

COMMENT ON COLUMN development_projects.ghana_region IS 'Validated Ghana region (16 regions) - populated via Data Hub ghanaPostService';
COMMENT ON COLUMN development_projects.ghana_district IS 'Ghana district - validated via Data Hub geocodingService';
COMMENT ON COLUMN development_projects.ghana_area IS 'Neighborhood/locality - validated via Data Hub addressValidationService';

-- ============================================================================
-- 2. Traditional Authority & Land Tenure
-- ============================================================================

-- Link to traditional authority (for customary land)
ALTER TABLE development_projects 
  ADD COLUMN IF NOT EXISTS traditional_authority_id UUID REFERENCES traditional_authorities(id);

-- Land tenure type (critical for Ghana real estate)
ALTER TABLE development_projects 
  ADD COLUMN IF NOT EXISTS land_tenure_type VARCHAR(50);

COMMENT ON COLUMN development_projects.land_tenure_type IS 'Land tenure: government_lease, stool_land_lease, family_land, freehold, leasehold';

-- Lands Commission parcel ID (for registered land)
ALTER TABLE development_projects 
  ADD COLUMN IF NOT EXISTS land_parcel_id VARCHAR(100);

COMMENT ON COLUMN development_projects.land_parcel_id IS 'Ghana Lands Commission parcel identifier';

-- Regulatory contacts reference
ALTER TABLE development_projects 
  ADD COLUMN IF NOT EXISTS assembly_id UUID REFERENCES assembly_regulatory_contacts(id);

-- ============================================================================
-- 3. Marketing & Presentation
-- ============================================================================

-- Hero image (prominent display image different from cover)
ALTER TABLE development_projects 
  ADD COLUMN IF NOT EXISTS hero_image_url TEXT;

-- Floor plan master image
ALTER TABLE development_projects 
  ADD COLUMN IF NOT EXISTS floor_plan_url TEXT;

-- Site plan image
ALTER TABLE development_projects 
  ADD COLUMN IF NOT EXISTS site_plan_url TEXT;

-- 3D render/visualization
ALTER TABLE development_projects 
  ADD COLUMN IF NOT EXISTS render_url TEXT;

-- ============================================================================
-- 4. Financial Structure
-- ============================================================================

-- Funding sources (array for flexibility)
ALTER TABLE development_projects 
  ADD COLUMN IF NOT EXISTS funding_sources JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN development_projects.funding_sources IS 'Array of funding sources: [{"type": "equity", "amount": 500000, "currency": "GHS", "provider": "Developer"}, {"type": "debt", "amount": 2000000, "currency": "USD", "provider": "Bank XYZ", "interest_rate": 12.5}]';

-- Display currency (for multi-currency projects)
ALTER TABLE development_projects 
  ADD COLUMN IF NOT EXISTS display_currency VARCHAR(3) DEFAULT 'GHS';

-- Exchange rate snapshot (at project creation, for historical reference)
ALTER TABLE development_projects 
  ADD COLUMN IF NOT EXISTS base_exchange_rate JSONB;

COMMENT ON COLUMN development_projects.base_exchange_rate IS 'Exchange rates at project creation: {"USD_GHS": 15.50, "EUR_GHS": 16.80, "captured_at": "2024-01-15"}';

-- ============================================================================
-- 5. Unit Mix Summary
-- ============================================================================
-- Denormalized summary for quick dashboard display (source of truth is units table)

ALTER TABLE development_projects 
  ADD COLUMN IF NOT EXISTS unit_mix JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN development_projects.unit_mix IS 'Summary of unit types: [{"type": "2BR", "count": 20, "min_price": 85000, "max_price": 95000, "available": 15}]';

-- ============================================================================
-- 6. PostGIS Location Geometry
-- ============================================================================
-- Enable spatial queries for property radius searches, map clusters, etc.

-- Add PostGIS geometry column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'development_projects' 
    AND column_name = 'location_geom'
  ) THEN
    EXECUTE 'ALTER TABLE development_projects ADD COLUMN location_geom GEOMETRY(Point, 4326)';
  END IF;
END $$;

-- Create spatial index
CREATE INDEX IF NOT EXISTS idx_projects_location_geom 
  ON development_projects USING GIST (location_geom);

-- Function to auto-update geometry from lat/lng
CREATE OR REPLACE FUNCTION update_project_location_geom()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location_geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  ELSE
    NEW.location_geom = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger
DROP TRIGGER IF EXISTS trigger_update_project_location_geom ON development_projects;
CREATE TRIGGER trigger_update_project_location_geom
  BEFORE INSERT OR UPDATE OF latitude, longitude ON development_projects
  FOR EACH ROW EXECUTE FUNCTION update_project_location_geom();

-- ============================================================================
-- 7. Full-Text Search Vector
-- ============================================================================
-- For fast project search across name, description, location, developer

-- Add search vector column
ALTER TABLE development_projects 
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_projects_search_vector 
  ON development_projects USING GIN (search_vector);

-- Function to update search vector
CREATE OR REPLACE FUNCTION update_project_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector = 
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.marketing_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.project_number, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.city, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.region, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.ghana_region, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.ghana_district, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.ghana_area, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.developer_name, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.address_line1, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger
DROP TRIGGER IF EXISTS trigger_update_project_search_vector ON development_projects;
CREATE TRIGGER trigger_update_project_search_vector
  BEFORE INSERT OR UPDATE OF name, marketing_name, project_number, description, 
    city, region, ghana_region, ghana_district, ghana_area, developer_name, address_line1
  ON development_projects
  FOR EACH ROW EXECUTE FUNCTION update_project_search_vector();

-- ============================================================================
-- 8. Additional Indexes for Ghana Fields
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_projects_ghana_region 
  ON development_projects(ghana_region);

CREATE INDEX IF NOT EXISTS idx_projects_ghana_district 
  ON development_projects(ghana_district);

CREATE INDEX IF NOT EXISTS idx_projects_land_tenure 
  ON development_projects(land_tenure_type);

CREATE INDEX IF NOT EXISTS idx_projects_traditional_authority 
  ON development_projects(traditional_authority_id);

CREATE INDEX IF NOT EXISTS idx_projects_assembly 
  ON development_projects(assembly_id);

CREATE INDEX IF NOT EXISTS idx_projects_display_currency 
  ON development_projects(display_currency);

-- ============================================================================
-- 9. Backfill geometry for existing projects
-- ============================================================================

UPDATE development_projects 
SET location_geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE latitude IS NOT NULL 
  AND longitude IS NOT NULL 
  AND location_geom IS NULL;

-- ============================================================================
-- 10. Backfill search vectors for existing projects
-- ============================================================================

UPDATE development_projects 
SET search_vector = 
  setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(marketing_name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(project_number, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(city, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(region, '')), 'B')
WHERE search_vector IS NULL;

-- ============================================================================
-- 11. Constraints
-- ============================================================================

-- Land tenure type validation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_land_tenure_type'
  ) THEN
    ALTER TABLE development_projects 
    ADD CONSTRAINT chk_land_tenure_type 
    CHECK (land_tenure_type IS NULL OR land_tenure_type IN (
      'government_lease', 
      'stool_land_lease', 
      'family_land', 
      'freehold', 
      'leasehold',
      'government_allocation'
    ));
  END IF;
END $$;

-- Display currency validation (common currencies in Ghana real estate)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_display_currency'
  ) THEN
    ALTER TABLE development_projects 
    ADD CONSTRAINT chk_display_currency 
    CHECK (display_currency IN ('GHS', 'USD', 'EUR', 'GBP'));
  END IF;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN development_projects.location_geom IS 'PostGIS point geometry for spatial queries - auto-populated from lat/lng';
COMMENT ON COLUMN development_projects.search_vector IS 'Full-text search vector for fast project search';
COMMENT ON COLUMN development_projects.display_currency IS 'Primary currency for displaying project financials';
