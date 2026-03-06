-- =====================================================
-- Migration: 023_scraper_compatible_schema.sql
-- Purpose: Enhance material_prices and labor_rates tables for scraper compatibility
-- Author: PropMetrik Data Hub
-- Date: 2025-01-XX
-- Dependencies: 008_tier4_economic_construction.sql
-- =====================================================

-- =====================================================
-- ADD SCRAPER-COMPATIBLE COLUMNS TO MATERIAL_PRICES
-- =====================================================

-- Add material_code column for standardized material identification
ALTER TABLE material_prices 
ADD COLUMN IF NOT EXISTS material_code VARCHAR(20);

-- Add region_id column (string version for scraper compatibility)
ALTER TABLE material_prices 
ADD COLUMN IF NOT EXISTS region_id VARCHAR(50);

-- Add source_name column for tracking specific source
ALTER TABLE material_prices 
ADD COLUMN IF NOT EXISTS source_name VARCHAR(100);

-- Populate region_id from existing region enum values
UPDATE material_prices 
SET region_id = LOWER(REPLACE(region::text, '_', '-'))
WHERE region_id IS NULL;

-- Create unique constraint for scraper upsert operations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'material_prices_code_region_date_unique'
  ) THEN
    -- Create partial unique index (allows multiple nulls in material_code)
    CREATE UNIQUE INDEX IF NOT EXISTS idx_material_prices_code_region_date 
    ON material_prices(material_code, region_id, effective_date) 
    WHERE material_code IS NOT NULL;
  END IF;
END$$;

-- Create index for region_id lookups
CREATE INDEX IF NOT EXISTS idx_material_prices_region_id ON material_prices(region_id);

-- =====================================================
-- ADD SCRAPER-COMPATIBLE COLUMNS TO LABOR_RATES
-- =====================================================

-- Add skill_category column for scraper compatibility
ALTER TABLE labor_rates 
ADD COLUMN IF NOT EXISTS skill_category VARCHAR(50);

-- Add region_id column (string version for scraper compatibility)
ALTER TABLE labor_rates 
ADD COLUMN IF NOT EXISTS region_id VARCHAR(50);

-- Add source_name column for tracking specific source
ALTER TABLE labor_rates 
ADD COLUMN IF NOT EXISTS source_name VARCHAR(100);

-- Populate skill_category from existing role_name
UPDATE labor_rates 
SET skill_category = role_name
WHERE skill_category IS NULL;

-- Populate region_id from existing region enum values
UPDATE labor_rates 
SET region_id = LOWER(REPLACE(region::text, '_', '-'))
WHERE region_id IS NULL;

-- Create unique constraint for scraper upsert operations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'labor_rates_category_region_date_unique'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_labor_rates_category_region_date 
    ON labor_rates(skill_category, region_id, effective_date) 
    WHERE skill_category IS NOT NULL;
  END IF;
END$$;

-- Create index for region_id lookups
CREATE INDEX IF NOT EXISTS idx_labor_rates_region_id ON labor_rates(region_id);

-- =====================================================
-- REGION LOOKUP HELPER VIEW
-- Maps string region_id to enum values for compatibility
-- =====================================================

CREATE OR REPLACE VIEW region_mapping AS
SELECT 
  'greater-accra'::text AS region_id, 'GREATER_ACCRA'::text AS region_enum_value
UNION ALL SELECT 'ashanti', 'ASHANTI'
UNION ALL SELECT 'western', 'WESTERN'
UNION ALL SELECT 'eastern', 'EASTERN'
UNION ALL SELECT 'central', 'CENTRAL'
UNION ALL SELECT 'northern', 'NORTHERN'
UNION ALL SELECT 'volta', 'VOLTA'
UNION ALL SELECT 'upper-east', 'UPPER_EAST'
UNION ALL SELECT 'upper-west', 'UPPER_WEST'
UNION ALL SELECT 'brong-ahafo', 'BONO';

-- =====================================================
-- MATERIAL CODE TO CATEGORY MAPPING VIEW
-- =====================================================

CREATE OR REPLACE VIEW material_code_category_mapping AS
SELECT 
  'CEM001'::text AS material_code, 'cement'::text AS category
UNION ALL SELECT 'BLK001', 'blocks'
UNION ALL SELECT 'SAN001', 'sand'
UNION ALL SELECT 'GRV001', 'gravel'
UNION ALL SELECT 'STL001', 'steel'
UNION ALL SELECT 'STL002', 'steel'
UNION ALL SELECT 'ROF001', 'roofing'
UNION ALL SELECT 'ROF002', 'roofing'
UNION ALL SELECT 'PLB001', 'plumbing'
UNION ALL SELECT 'PLB002', 'plumbing'
UNION ALL SELECT 'ELC001', 'electrical'
UNION ALL SELECT 'ELC002', 'electrical'
UNION ALL SELECT 'FIN001', 'paint'
UNION ALL SELECT 'FIN002', 'tiles'
UNION ALL SELECT 'FIN003', 'glass'
UNION ALL SELECT 'WOD001', 'timber'
UNION ALL SELECT 'WOD002', 'timber';

-- =====================================================
-- TRIGGER TO AUTO-POPULATE ENUM COLUMNS FROM SCRAPER DATA
-- =====================================================

CREATE OR REPLACE FUNCTION sync_material_category_from_code()
RETURNS TRIGGER AS $$
BEGIN
  -- If material_code is set but category is null, derive category
  IF NEW.material_code IS NOT NULL AND NEW.category IS NULL THEN
    SELECT m.category::material_category_enum INTO NEW.category
    FROM material_code_category_mapping m
    WHERE m.material_code = NEW.material_code;
  END IF;
  
  -- If region_id is set but region is null, derive region
  IF NEW.region_id IS NOT NULL AND NEW.region IS NULL THEN
    BEGIN
      NEW.region := (
        CASE NEW.region_id
          WHEN 'greater-accra' THEN 'GREATER_ACCRA'
          WHEN 'ashanti' THEN 'ASHANTI'
          WHEN 'western' THEN 'WESTERN'
          WHEN 'eastern' THEN 'EASTERN'
          WHEN 'central' THEN 'CENTRAL'
          WHEN 'northern' THEN 'NORTHERN'
          WHEN 'volta' THEN 'VOLTA'
          WHEN 'upper-east' THEN 'UPPER_EAST'
          WHEN 'upper-west' THEN 'UPPER_WEST'
          WHEN 'brong-ahafo' THEN 'BONO'
          ELSE 'GREATER_ACCRA'
        END
      )::region_code_enum;
    EXCEPTION WHEN OTHERS THEN
      -- Default to Greater Accra if conversion fails
      NEW.region := 'GREATER_ACCRA'::region_code_enum;
    END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_material_category ON material_prices;
CREATE TRIGGER trg_sync_material_category
  BEFORE INSERT OR UPDATE ON material_prices
  FOR EACH ROW
  EXECUTE FUNCTION sync_material_category_from_code();

-- Similar trigger for labor_rates
CREATE OR REPLACE FUNCTION sync_labor_category_from_skill()
RETURNS TRIGGER AS $$
BEGIN
  -- If region_id is set but region is null, derive region
  IF NEW.region_id IS NOT NULL AND NEW.region IS NULL THEN
    BEGIN
      NEW.region := (
        CASE NEW.region_id
          WHEN 'greater-accra' THEN 'GREATER_ACCRA'
          WHEN 'ashanti' THEN 'ASHANTI'
          WHEN 'western' THEN 'WESTERN'
          WHEN 'eastern' THEN 'EASTERN'
          WHEN 'central' THEN 'CENTRAL'
          WHEN 'northern' THEN 'NORTHERN'
          WHEN 'volta' THEN 'VOLTA'
          WHEN 'upper-east' THEN 'UPPER_EAST'
          WHEN 'upper-west' THEN 'UPPER_WEST'
          WHEN 'brong-ahafo' THEN 'BONO'
          ELSE 'GREATER_ACCRA'
        END
      )::region_code_enum;
    EXCEPTION WHEN OTHERS THEN
      NEW.region := 'GREATER_ACCRA'::region_code_enum;
    END;
  END IF;

  -- If skill_category is set but role_name is null
  IF NEW.skill_category IS NOT NULL AND NEW.role_name IS NULL THEN
    NEW.role_name := NEW.skill_category;
  END IF;

  -- Map skill_category to labor category enum
  IF NEW.skill_category IS NOT NULL AND NEW.category IS NULL THEN
    BEGIN
      NEW.category := (
        CASE 
          WHEN NEW.skill_category ILIKE '%mason%' THEN 'mason'
          WHEN NEW.skill_category ILIKE '%carpenter%' THEN 'carpenter'
          WHEN NEW.skill_category ILIKE '%electrician%' THEN 'electrician'
          WHEN NEW.skill_category ILIKE '%plumber%' THEN 'plumber'
          WHEN NEW.skill_category ILIKE '%painter%' THEN 'painter'
          WHEN NEW.skill_category ILIKE '%roofer%' THEN 'roofer'
          WHEN NEW.skill_category ILIKE '%tiler%' THEN 'tiler'
          WHEN NEW.skill_category ILIKE '%welder%' THEN 'welder'
          WHEN NEW.skill_category ILIKE '%laborer%' OR NEW.skill_category ILIKE '%helper%' THEN 'laborer'
          WHEN NEW.skill_category ILIKE '%foreman%' THEN 'foreman'
          WHEN NEW.skill_category ILIKE '%supervisor%' THEN 'supervisor'
          WHEN NEW.skill_category ILIKE '%architect%' THEN 'architect'
          WHEN NEW.skill_category ILIKE '%engineer%' THEN 'engineer'
          ELSE 'laborer'
        END
      )::labor_category_enum;
    EXCEPTION WHEN OTHERS THEN
      NEW.category := 'laborer'::labor_category_enum;
    END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_labor_category ON labor_rates;
CREATE TRIGGER trg_sync_labor_category
  BEFORE INSERT OR UPDATE ON labor_rates
  FOR EACH ROW
  EXECUTE FUNCTION sync_labor_category_from_skill();

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON COLUMN material_prices.material_code IS 'Standardized material code (e.g., CEM001, STL001) used by scrapers';
COMMENT ON COLUMN material_prices.region_id IS 'String region identifier for scraper compatibility (e.g., greater-accra)';
COMMENT ON COLUMN material_prices.source_name IS 'Name of the data source (e.g., Melcom Ghana, Partner XYZ)';

COMMENT ON COLUMN labor_rates.skill_category IS 'Human-readable skill category name from scraper';
COMMENT ON COLUMN labor_rates.region_id IS 'String region identifier for scraper compatibility (e.g., greater-accra)';
COMMENT ON COLUMN labor_rates.source_name IS 'Name of the data source (e.g., GSS Cost of Living × Fair Wages)';

COMMENT ON VIEW region_mapping IS 'Maps scraper region_id strings to database enum values';
COMMENT ON VIEW material_code_category_mapping IS 'Maps scraper material codes to database category enum values';
