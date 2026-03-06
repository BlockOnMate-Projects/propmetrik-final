-- =====================================================
-- 017_valuation_weights_config.sql
-- Valuation Configuration Tables
-- 
-- Stores configurable weights and factors used in valuation calculations.
-- Admin manages these values via Data Hub > Valuation Settings > Weights tab.
-- =====================================================

-- Material Category Weights
-- Used in construction cost index calculation
-- Weights must sum to 1.0 (enforced by trigger)
-- Drop old version of the table if it exists (schema change from migration 012)
DROP TABLE IF EXISTS material_category_weights CASCADE;

CREATE TABLE IF NOT EXISTS material_category_weights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    weight DECIMAL(5,4) NOT NULL CHECK (weight >= 0 AND weight <= 1),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by VARCHAR(100),
    notes TEXT
);

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_material_weights_category ON material_category_weights(category);
CREATE INDEX IF NOT EXISTS idx_material_weights_active ON material_category_weights(is_active);

-- Regional Location Factors
-- Used to adjust construction costs by region
-- Factors are multipliers (e.g., 1.15 = 15% higher costs)
CREATE TABLE IF NOT EXISTS regional_location_factors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region_code VARCHAR(50) NOT NULL UNIQUE,
    region_name VARCHAR(100) NOT NULL,
    location_factor DECIMAL(5,3) NOT NULL CHECK (location_factor > 0 AND location_factor <= 5),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by VARCHAR(100),
    notes TEXT
);

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_regional_factors_code ON regional_location_factors(region_code);
CREATE INDEX IF NOT EXISTS idx_regional_factors_active ON regional_location_factors(is_active);

-- Base Construction Costs (2020 baseline)
-- Used as reference for construction cost calculations
CREATE TABLE IF NOT EXISTS base_construction_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quality_tier VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    base_cost_per_sqm DECIMAL(12,2) NOT NULL CHECK (base_cost_per_sqm > 0),
    base_year INTEGER NOT NULL DEFAULT 2020,
    property_type VARCHAR(50) DEFAULT 'residential',
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by VARCHAR(100),
    notes TEXT
);

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_base_costs_tier ON base_construction_costs(quality_tier);
CREATE INDEX IF NOT EXISTS idx_base_costs_type ON base_construction_costs(property_type);

-- Configuration History (audit trail)
CREATE TABLE IF NOT EXISTS valuation_config_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    field_name VARCHAR(100) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by VARCHAR(100),
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    change_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_config_history_table ON valuation_config_history(table_name);
CREATE INDEX IF NOT EXISTS idx_config_history_record ON valuation_config_history(record_id);
CREATE INDEX IF NOT EXISTS idx_config_history_date ON valuation_config_history(changed_at);

-- =====================================================
-- SEED DATA: Material Category Weights
-- =====================================================
INSERT INTO material_category_weights (category, display_name, weight, description, sort_order) VALUES
    ('cement', 'Cement', 0.2500, 'Portland cement and binding materials', 1),
    ('steel', 'Steel / Iron Rods', 0.2000, 'Reinforcement steel, rebar, iron rods', 2),
    ('sand', 'Sand', 0.1000, 'Sharp sand and plaster sand', 3),
    ('blocks', 'Concrete Blocks', 0.1000, 'Sandcrete blocks and concrete blocks', 4),
    ('gravel', 'Gravel / Aggregates', 0.0750, 'Crushed stone and aggregates', 5),
    ('roofing', 'Roofing Sheets', 0.0750, 'Aluminum and metal roofing sheets', 6),
    ('timber', 'Timber / Wood', 0.0500, 'Structural timber and wood', 7),
    ('tiles', 'Tiles', 0.0500, 'Floor and wall tiles', 8),
    ('paint', 'Paint & Finishes', 0.0500, 'Interior and exterior paint', 9),
    ('plumbing', 'Plumbing Materials', 0.0250, 'Pipes, fittings, fixtures', 10),
    ('electrical', 'Electrical Materials', 0.0250, 'Wiring, switches, fixtures', 11)
ON CONFLICT (category) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    weight = EXCLUDED.weight,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

-- =====================================================
-- SEED DATA: Regional Location Factors
-- =====================================================
INSERT INTO regional_location_factors (region_code, region_name, location_factor, description, sort_order) VALUES
    ('greater_accra', 'Greater Accra', 1.150, 'Capital region - highest construction costs', 1),
    ('kumasi_metro', 'Kumasi Metro', 1.080, 'Second largest city - elevated costs', 2),
    ('ashanti', 'Ashanti Region', 1.050, 'Major regional hub', 3),
    ('western', 'Western Region', 0.950, 'Industrial region with moderate costs', 4),
    ('western_cluster', 'Western Cluster', 0.950, 'Western region cluster', 5),
    ('eastern', 'Eastern Region', 0.920, 'Close proximity to Accra', 6),
    ('central', 'Central Region', 0.900, 'Coastal region with moderate costs', 7),
    ('volta', 'Volta Region', 0.880, 'Eastern border region', 8),
    ('brong_ahafo', 'Bono Region', 0.880, 'Central-northern transition zone', 9),
    ('northern', 'Northern Region', 0.850, 'Northern savanna - lower costs', 10),
    ('northern_cluster', 'Northern Cluster', 0.850, 'Northern region cluster', 11),
    ('upper_east', 'Upper East Region', 0.820, 'Upper region - lowest costs', 12),
    ('upper_west', 'Upper West Region', 0.800, 'Remote upper region - lowest costs', 13)
ON CONFLICT (region_code) DO UPDATE SET
    region_name = EXCLUDED.region_name,
    location_factor = EXCLUDED.location_factor,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

-- =====================================================
-- SEED DATA: Base Construction Costs (2020 baseline)
-- =====================================================
INSERT INTO base_construction_costs (quality_tier, display_name, base_cost_per_sqm, base_year, description, sort_order) VALUES
    ('luxury', 'Luxury', 8500.00, 2020, 'High-end finishes, premium materials, smart home features', 1),
    ('high', 'High Quality', 5800.00, 2020, 'Quality finishes, good materials, modern fixtures', 2),
    ('standard', 'Standard', 3800.00, 2020, 'Average finishes, standard materials', 3),
    ('basic', 'Basic', 2400.00, 2020, 'Minimal finishes, economy materials', 4),
    ('substandard', 'Substandard', 1500.00, 2020, 'Below standard construction, low-cost materials', 5)
ON CONFLICT (quality_tier) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    base_cost_per_sqm = EXCLUDED.base_cost_per_sqm,
    base_year = EXCLUDED.base_year,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

-- =====================================================
-- TRIGGER: Auto-update updated_at timestamp
-- =====================================================
CREATE OR REPLACE FUNCTION update_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all config tables
DROP TRIGGER IF EXISTS update_material_weights_timestamp ON material_category_weights;
CREATE TRIGGER update_material_weights_timestamp
    BEFORE UPDATE ON material_category_weights
    FOR EACH ROW EXECUTE FUNCTION update_config_timestamp();

DROP TRIGGER IF EXISTS update_regional_factors_timestamp ON regional_location_factors;
CREATE TRIGGER update_regional_factors_timestamp
    BEFORE UPDATE ON regional_location_factors
    FOR EACH ROW EXECUTE FUNCTION update_config_timestamp();

DROP TRIGGER IF EXISTS update_base_costs_timestamp ON base_construction_costs;
CREATE TRIGGER update_base_costs_timestamp
    BEFORE UPDATE ON base_construction_costs
    FOR EACH ROW EXECUTE FUNCTION update_config_timestamp();

-- =====================================================
-- VIEWS: Convenient access to active configuration
-- =====================================================
CREATE OR REPLACE VIEW v_active_material_weights AS
SELECT category, display_name, weight, updated_at
FROM material_category_weights
WHERE is_active = TRUE
ORDER BY sort_order;

CREATE OR REPLACE VIEW v_active_regional_factors AS
SELECT region_code, region_name, location_factor, updated_at
FROM regional_location_factors
WHERE is_active = TRUE
ORDER BY sort_order;

CREATE OR REPLACE VIEW v_active_base_costs AS
SELECT quality_tier, display_name, base_cost_per_sqm, base_year, updated_at
FROM base_construction_costs
WHERE is_active = TRUE
ORDER BY sort_order;

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE material_category_weights IS 'Configurable weights for material categories in construction cost index calculation. Managed via Data Hub.';
COMMENT ON TABLE regional_location_factors IS 'Regional adjustment factors for construction costs. Higher factors = higher costs.';
COMMENT ON TABLE base_construction_costs IS 'Base construction costs per sqm by quality tier, using 2020 as baseline year.';
COMMENT ON TABLE valuation_config_history IS 'Audit trail for all valuation configuration changes.';
