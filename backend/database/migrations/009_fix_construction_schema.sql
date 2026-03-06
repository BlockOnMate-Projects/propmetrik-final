-- Migration: 009_fix_construction_schema
-- Description: Fix construction cost schema to match service expectations
-- Created: 2026-01-06
-- Purpose: Align database columns with constructionCostService.ts requirements

-- =====================================================
-- FIX MATERIAL PRICES TABLE
-- Add missing columns and rename existing ones to match service
-- =====================================================

-- Add missing columns to material_prices
ALTER TABLE material_prices 
ADD COLUMN IF NOT EXISTS material_category material_category_enum,
ADD COLUMN IF NOT EXISTS survey_date DATE,
ADD COLUMN IF NOT EXISTS previous_price_ghs DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS price_change_percent DECIMAL(5, 2),
ADD COLUMN IF NOT EXISTS quantity_per_unit INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS confidence_level DECIMAL(3, 2) DEFAULT 0.80,
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

-- Copy data from old columns to new columns
UPDATE material_prices 
SET 
  material_category = category,
  survey_date = effective_date
WHERE material_category IS NULL OR survey_date IS NULL;

-- Make new columns not null after data migration
ALTER TABLE material_prices 
ALTER COLUMN material_category SET NOT NULL,
ALTER COLUMN survey_date SET NOT NULL;

-- =====================================================
-- FIX LABOR RATES TABLE  
-- Add missing columns and rename existing ones to match service
-- =====================================================

-- Add missing columns to labor_rates
ALTER TABLE labor_rates
ADD COLUMN IF NOT EXISTS labor_category labor_category_enum,
ADD COLUMN IF NOT EXISTS survey_date DATE,
ADD COLUMN IF NOT EXISTS previous_rate_ghs DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS rate_change_percent DECIMAL(5, 2),
ADD COLUMN IF NOT EXISTS source VARCHAR(100) DEFAULT 'survey',
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

-- Copy data from old columns to new columns  
UPDATE labor_rates
SET
  labor_category = category,
  survey_date = effective_date
WHERE labor_category IS NULL OR survey_date IS NULL;

-- Make new columns not null after data migration
ALTER TABLE labor_rates
ALTER COLUMN labor_category SET NOT NULL,
ALTER COLUMN survey_date SET NOT NULL;

-- =====================================================
-- ADD EQUIPMENT RATES TABLE
-- New table for equipment rental tracking
-- =====================================================

CREATE TABLE IF NOT EXISTS equipment_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Equipment identification
  equipment_name VARCHAR(100) NOT NULL,
  equipment_type VARCHAR(50) NOT NULL,
  
  -- Pricing
  rate_ghs DECIMAL(12, 2) NOT NULL,
  rate_period VARCHAR(20) NOT NULL CHECK (rate_period IN ('hourly', 'daily', 'weekly', 'monthly')),
  includes_operator BOOLEAN DEFAULT false,
  includes_fuel BOOLEAN DEFAULT false,
  deposit_required_ghs DECIMAL(12, 2),
  
  -- Geographic scope
  region region_code_enum NOT NULL,
  
  -- Supplier information
  supplier_name VARCHAR(255),
  
  -- Validity
  survey_date DATE NOT NULL,
  is_verified BOOLEAN DEFAULT false,
  
  -- Metadata
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_equipment_rates_type ON equipment_rates(equipment_type);
CREATE INDEX idx_equipment_rates_region ON equipment_rates(region);
CREATE INDEX idx_equipment_rates_name_region ON equipment_rates(equipment_name, region, survey_date DESC);

-- =====================================================
-- ADD CONSTRUCTION COST INDICES TABLE
-- For tracking composite construction cost indices
-- =====================================================

CREATE TABLE IF NOT EXISTS construction_cost_indices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Index identification
  index_name VARCHAR(100) NOT NULL,
  index_value DECIMAL(8, 4) NOT NULL,
  base_year INTEGER NOT NULL DEFAULT 2024,
  base_value DECIMAL(8, 4) NOT NULL DEFAULT 100.0,
  
  -- Time period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  change_from_previous DECIMAL(5, 2),
  change_year_on_year DECIMAL(5, 2),
  
  -- Geographic scope
  region region_code_enum,
  property_type VARCHAR(50),
  
  -- Methodology
  calculation_methodology TEXT,
  components JSONB DEFAULT '[]',
  
  -- Source information
  source VARCHAR(100) NOT NULL,
  is_official BOOLEAN DEFAULT false,
  
  -- Metadata
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_construction_indices_name ON construction_cost_indices(index_name);
CREATE INDEX idx_construction_indices_region ON construction_cost_indices(region);
CREATE INDEX idx_construction_indices_period ON construction_cost_indices(period_start, period_end);

-- =====================================================
-- ADD TRIGGERS FOR UPDATED_AT
-- =====================================================

CREATE TRIGGER update_equipment_rates_updated_at
  BEFORE UPDATE ON equipment_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- UPDATE EXISTING INDEXES 
-- Add indexes for new columns
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_material_prices_material_category ON material_prices(material_category);
CREATE INDEX IF NOT EXISTS idx_material_prices_survey_date ON material_prices(survey_date DESC);
CREATE INDEX IF NOT EXISTS idx_material_prices_material_category_region ON material_prices(material_category, region, survey_date DESC);

CREATE INDEX IF NOT EXISTS idx_labor_rates_labor_category ON labor_rates(labor_category);  
CREATE INDEX IF NOT EXISTS idx_labor_rates_survey_date ON labor_rates(survey_date DESC);
CREATE INDEX IF NOT EXISTS idx_labor_rates_labor_category_region ON labor_rates(labor_category, region, survey_date DESC);