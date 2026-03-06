-- =====================================================
-- Migration: 021_calculated_multipliers.sql
-- Purpose: Tables for data-driven multiplier calculation
-- =====================================================

-- 1. Completed projects for quality multiplier calculation
CREATE TABLE IF NOT EXISTS completed_projects (
  id SERIAL PRIMARY KEY,
  project_name VARCHAR(255),
  property_type VARCHAR(50) NOT NULL,
  quality_level VARCHAR(50) NOT NULL,
  region VARCHAR(50) NOT NULL,
  building_size_sqm DECIMAL(12,2) NOT NULL,
  actual_cost_ghs DECIMAL(14,2) NOT NULL,
  actual_cost_per_sqm DECIMAL(10,2) GENERATED ALWAYS AS (
    actual_cost_ghs / NULLIF(building_size_sqm, 0)
  ) STORED,
  completion_date DATE NOT NULL,
  data_source VARCHAR(100),
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Calculated multipliers audit table
CREATE TABLE IF NOT EXISTS calculated_multipliers (
  id SERIAL PRIMARY KEY,
  multiplier_type VARCHAR(50) NOT NULL, -- 'quality', 'region', 'condition', 'time'
  category VARCHAR(50) NOT NULL,
  value DECIMAL(8,4) NOT NULL,
  confidence DECIMAL(4,3),
  sample_size INTEGER,
  calculation_date DATE NOT NULL,
  valid_from DATE NOT NULL,
  valid_to DATE,
  methodology TEXT,
  source VARCHAR(50) DEFAULT 'calculated', -- 'calculated', 'survey', 'static'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enhance property_transactions if not already done
ALTER TABLE property_transactions 
  ADD COLUMN IF NOT EXISTS condition_rating INTEGER CHECK (condition_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS location_score INTEGER CHECK (location_score BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS net_operating_income DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS gross_rent DECIMAL(14,2);

-- 4. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_completed_projects_region ON completed_projects(region);
CREATE INDEX IF NOT EXISTS idx_completed_projects_quality ON completed_projects(quality_level);
CREATE INDEX IF NOT EXISTS idx_calculated_multipliers_type ON calculated_multipliers(multiplier_type, category);
CREATE INDEX IF NOT EXISTS idx_calculated_multipliers_valid ON calculated_multipliers(valid_from, valid_to);

-- 5. Update trigger
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_completed_projects_timestamp ON completed_projects;
CREATE TRIGGER update_completed_projects_timestamp
  BEFORE UPDATE ON completed_projects
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
