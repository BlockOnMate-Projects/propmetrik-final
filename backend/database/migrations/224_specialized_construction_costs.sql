-- Migration 224: Specialized Construction Costs
-- RICS/GhIS compliant specialized asset construction cost table
-- Data populated ONLY from live scraped GREDA/BRRI sources — no seed data

-- =====================================================
-- BUILDING FUNCTION ENUM
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'building_function_enum') THEN
    CREATE TYPE building_function_enum AS ENUM (
      'educational',
      'health_clinic',
      'health_hospital',
      'religious',
      'government',
      'heritage',
      'recreation',
      'library',
      'museum',
      'stadium',
      'industrial_warehouse',
      'industrial_factory',
      'mixed_use',
      'institutional_other'
    );
  END IF;
END $$;

-- =====================================================
-- SPECIALIZED CONSTRUCTION COSTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS specialized_construction_costs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Classification
  building_function     building_function_enum NOT NULL,
  quality_level         VARCHAR(20) NOT NULL DEFAULT 'standard',
  region                region_code_enum NOT NULL DEFAULT 'greater_accra',

  -- Cost components (RICS elemental breakdown)
  base_cost_sqm         NUMERIC(12,2) NOT NULL,  -- Total GHS/sqm

  -- RICS elemental percentages (IVS 105 / Red Book Appendix 7)
  substructure_pct      NUMERIC(5,2) DEFAULT 18.0,    -- Foundations, piling (15-20%)
  superstructure_pct    NUMERIC(5,2) DEFAULT 40.0,     -- Frame, walls, roof (35-45%)
  internal_finishes_pct NUMERIC(5,2) DEFAULT 12.0,     -- Floors, walls, ceilings (10-15%)
  me_services_pct       NUMERIC(5,2) DEFAULT 20.0,     -- Electrical, plumbing, HVAC, fire (15-35%)
  external_works_pct    NUMERIC(5,2) DEFAULT 5.0,      -- Drainage, landscaping (5-10%)
  professional_fees_pct NUMERIC(5,2) DEFAULT 12.0,     -- Architect, QS, engineer (10-15%)

  -- Derivation factors (Mode A: derived from base_costs_per_sqm)
  structural_complexity_factor NUMERIC(5,3) DEFAULT 1.000,  -- Multiplier vs commercial base
  me_addon_sqm                NUMERIC(10,2) DEFAULT 0.00,    -- Absolute M&E addon GHS/sqm

  -- Provenance
  source                VARCHAR(100) NOT NULL,          -- 'GREDA', 'BRRI', 'GhIS Survey', 'calculated'
  source_url            TEXT,                            -- URL of the data source
  source_date           DATE,                            -- Publication date of source data
  is_published_rate     BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE = Tier 2 (published), FALSE = Tier 3 (derived)
  is_calculated         BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE if auto-calculated from base costs
  calculation_source    VARCHAR(100),                    -- Service name that calculated

  -- Metadata
  notes                 TEXT,
  metadata              JSONB DEFAULT '{}',
  effective_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint: one rate per function/quality/region
CREATE UNIQUE INDEX IF NOT EXISTS idx_specialized_costs_unique
  ON specialized_construction_costs(building_function, quality_level, region);

-- Query indexes
CREATE INDEX IF NOT EXISTS idx_specialized_costs_function
  ON specialized_construction_costs(building_function);
CREATE INDEX IF NOT EXISTS idx_specialized_costs_region
  ON specialized_construction_costs(region);
CREATE INDEX IF NOT EXISTS idx_specialized_costs_source
  ON specialized_construction_costs(source);
CREATE INDEX IF NOT EXISTS idx_specialized_costs_effective
  ON specialized_construction_costs(effective_date);

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER update_specialized_costs_updated_at
  BEFORE UPDATE ON specialized_construction_costs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SPECIALIZED COST CALCULATION LOG (audit trail)
-- =====================================================
CREATE TABLE IF NOT EXISTS specialized_cost_calculation_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_date      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  building_function     building_function_enum NOT NULL,
  quality_level         VARCHAR(20) NOT NULL,
  region                region_code_enum NOT NULL,
  calculated_cost_sqm   NUMERIC(12,2) NOT NULL,
  base_cost_used        NUMERIC(12,2),                   -- base_costs_per_sqm value used
  structural_factor     NUMERIC(5,3),
  me_addon              NUMERIC(10,2),
  source                VARCHAR(100) NOT NULL,
  calculation_method    VARCHAR(50) NOT NULL DEFAULT 'derived'  -- 'derived' or 'published'
);

CREATE INDEX IF NOT EXISTS idx_spec_cost_log_date
  ON specialized_cost_calculation_log(calculation_date DESC);

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE specialized_construction_costs IS 'RICS/GhIS compliant specialized asset construction costs per sqm. Data sourced from GREDA/BRRI publications via automated scraping. No mock/seed data.';
COMMENT ON COLUMN specialized_construction_costs.building_function IS 'Building functional use per BRRI classification (educational, health, religious, etc.)';
COMMENT ON COLUMN specialized_construction_costs.base_cost_sqm IS 'Total construction cost per sqm in GHS — either published (GREDA/BRRI) or derived from base_costs_per_sqm';
COMMENT ON COLUMN specialized_construction_costs.me_services_pct IS 'M&E services as percentage of total — key differentiator between building functions (10% religious to 35% hospital)';
COMMENT ON COLUMN specialized_construction_costs.is_published_rate IS 'TRUE = RICS Tier 2 (published cost guide rate), FALSE = RICS Tier 3 (elemental cost analysis / derived)';
COMMENT ON COLUMN specialized_construction_costs.structural_complexity_factor IS 'Multiplier applied to commercial base cost for Tier 3 derivation (e.g. hospital 1.15, church 0.85)';
COMMENT ON COLUMN specialized_construction_costs.me_addon_sqm IS 'Absolute M&E services addon in GHS/sqm for Tier 3 derivation';
