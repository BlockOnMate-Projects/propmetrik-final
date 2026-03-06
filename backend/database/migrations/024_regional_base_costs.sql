-- Migration: 024_regional_base_costs.sql
-- Description: Add region column to base_costs_per_sqm for regional base cost calculation
-- Date: 2026-01-10

-- Add region column to base_costs_per_sqm
ALTER TABLE base_costs_per_sqm 
ADD COLUMN IF NOT EXISTS region VARCHAR(50) DEFAULT 'greater_accra';

-- Add is_calculated flag to track auto-calculated vs manual entries
ALTER TABLE base_costs_per_sqm 
ADD COLUMN IF NOT EXISTS is_calculated BOOLEAN DEFAULT FALSE;

-- Add source tracking
ALTER TABLE base_costs_per_sqm 
ADD COLUMN IF NOT EXISTS calculation_source VARCHAR(100);

-- Add economic adjustment factors used in calculation
ALTER TABLE base_costs_per_sqm 
ADD COLUMN IF NOT EXISTS material_component_ghs NUMERIC(12,2);
ALTER TABLE base_costs_per_sqm 
ADD COLUMN IF NOT EXISTS labor_component_ghs NUMERIC(12,2);
ALTER TABLE base_costs_per_sqm 
ADD COLUMN IF NOT EXISTS overhead_component_ghs NUMERIC(12,2);
ALTER TABLE base_costs_per_sqm 
ADD COLUMN IF NOT EXISTS cpi_adjustment_factor NUMERIC(6,4) DEFAULT 1.0;
ALTER TABLE base_costs_per_sqm 
ADD COLUMN IF NOT EXISTS fx_adjustment_factor NUMERIC(6,4) DEFAULT 1.0;

-- Drop old unique constraint (property_type, quality_level)
ALTER TABLE base_costs_per_sqm 
DROP CONSTRAINT IF EXISTS base_costs_per_sqm_property_type_quality_level_key;

-- Add new unique constraint including region
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'base_costs_per_sqm_property_quality_region_key') THEN
        ALTER TABLE base_costs_per_sqm 
        ADD CONSTRAINT base_costs_per_sqm_property_quality_region_key 
        UNIQUE (property_type, quality_level, region);
    END IF;
END $$;

-- Add index for region lookups
CREATE INDEX IF NOT EXISTS idx_base_costs_region ON base_costs_per_sqm(region);

-- Create regional_cost_multipliers table for regional adjustments
CREATE TABLE IF NOT EXISTS regional_cost_multipliers (
    id SERIAL PRIMARY KEY,
    region VARCHAR(50) NOT NULL UNIQUE,
    material_multiplier NUMERIC(5,4) NOT NULL DEFAULT 1.0,
    labor_multiplier NUMERIC(5,4) NOT NULL DEFAULT 1.0,
    transport_multiplier NUMERIC(5,4) NOT NULL DEFAULT 1.0,
    combined_multiplier NUMERIC(5,4) GENERATED ALWAYS AS (
        (material_multiplier * 0.55 + labor_multiplier * 0.35 + transport_multiplier * 0.10)
    ) STORED,
    notes TEXT,
    last_calculated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default regional multipliers (Greater Accra as base = 1.0)
INSERT INTO regional_cost_multipliers (region, material_multiplier, labor_multiplier, transport_multiplier, notes) VALUES
    ('greater_accra', 1.0000, 1.0000, 1.0000, 'Base region - reference point'),
    ('ashanti', 0.9500, 0.9200, 1.0800, 'Kumasi - second largest market'),
    ('western', 0.9800, 0.9000, 1.1200, 'Sekondi-Takoradi - port access'),
    ('eastern', 0.9600, 0.8800, 1.0600, 'Koforidua - proximity to Accra'),
    ('central', 0.9700, 0.8500, 1.1000, 'Cape Coast - coastal region'),
    ('volta', 0.9400, 0.8200, 1.1500, 'Ho - eastern border'),
    ('northern', 0.9200, 0.7500, 1.2500, 'Tamale - northern hub'),
    ('upper_east', 0.9000, 0.7000, 1.3500, 'Bolgatanga - remote'),
    ('upper_west', 0.8800, 0.6800, 1.4000, 'Wa - most remote'),
    ('bono', 0.9300, 0.8000, 1.1800, 'Sunyani - central region'),
    ('bono_east', 0.9200, 0.7800, 1.2000, 'Techiman - market town'),
    ('ahafo', 0.9100, 0.7600, 1.2200, 'Goaso - new region'),
    ('savannah', 0.8900, 0.7200, 1.3000, 'Damongo - new region'),
    ('north_east', 0.8800, 0.7000, 1.3200, 'Nalerigu - new region'),
    ('oti', 0.9300, 0.8000, 1.1800, 'Dambai - new region'),
    ('western_north', 0.9400, 0.8200, 1.1500, 'Sefwi Wiawso - new region')
ON CONFLICT (region) DO UPDATE SET
    material_multiplier = EXCLUDED.material_multiplier,
    labor_multiplier = EXCLUDED.labor_multiplier,
    transport_multiplier = EXCLUDED.transport_multiplier,
    notes = EXCLUDED.notes,
    updated_at = CURRENT_TIMESTAMP;

-- Add base cost calculation history table
CREATE TABLE IF NOT EXISTS base_cost_calculation_log (
    id SERIAL PRIMARY KEY,
    calculation_date DATE NOT NULL,
    property_type VARCHAR(50) NOT NULL,
    quality_level VARCHAR(50) NOT NULL,
    region VARCHAR(50) NOT NULL,
    calculated_cost_ghs NUMERIC(12,2) NOT NULL,
    material_component_ghs NUMERIC(12,2),
    labor_component_ghs NUMERIC(12,2),
    overhead_component_ghs NUMERIC(12,2),
    cpi_value NUMERIC(8,2),
    usd_ghs_rate NUMERIC(8,4),
    calculation_method VARCHAR(50) DEFAULT 'weighted_average',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_base_cost_log_date ON base_cost_calculation_log(calculation_date);
CREATE INDEX IF NOT EXISTS idx_base_cost_log_region ON base_cost_calculation_log(region);

-- Update existing base costs to set region to greater_accra (the base region)
UPDATE base_costs_per_sqm SET region = 'greater_accra' WHERE region IS NULL;

COMMENT ON TABLE base_costs_per_sqm IS 'Regional base construction costs per square meter, calculated from material prices, labor rates, and economic adjustments';
COMMENT ON COLUMN base_costs_per_sqm.region IS 'Ghana region code for regional cost variation';
COMMENT ON COLUMN base_costs_per_sqm.is_calculated IS 'TRUE if auto-calculated by baseCostCalculationService, FALSE if manually entered';
COMMENT ON COLUMN base_costs_per_sqm.material_component_ghs IS 'Material cost component used in calculation';
COMMENT ON COLUMN base_costs_per_sqm.labor_component_ghs IS 'Labor cost component used in calculation';
COMMENT ON COLUMN base_costs_per_sqm.cpi_adjustment_factor IS 'CPI adjustment factor applied (1.0 = no adjustment)';
