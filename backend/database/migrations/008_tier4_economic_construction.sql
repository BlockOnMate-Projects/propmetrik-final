-- Migration: 008_tier4_economic_construction
-- Description: Tier 4 Market Data - Economic Indicators and Detailed Construction Costs
-- Created: 2026-01-06
-- Phase: 2 - Data Hub Implementation (Tier 4 Extension)

-- =====================================================
-- ECONOMIC INDICATOR TYPE ENUM
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'economic_indicator_type_enum') THEN
    CREATE TYPE economic_indicator_type_enum AS ENUM (
      'inflation_rate',
      'cpi_index',
      'gdp_growth',
      'interest_rate_policy',
      'interest_rate_prime',
      'mortgage_rate_avg',
      'exchange_rate_usd',
      'exchange_rate_gbp',
      'exchange_rate_eur',
      'exchange_rate_cny',
      'unemployment_rate',
      'construction_pmi',
      'property_price_index'
    );
  END IF;
END$$;

-- =====================================================
-- MATERIAL CATEGORY ENUM
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'material_category_enum') THEN
    CREATE TYPE material_category_enum AS ENUM (
      'cement',
      'steel',
      'sand',
      'gravel',
      'blocks',
      'timber',
      'roofing',
      'paint',
      'tiles',
      'electrical',
      'plumbing',
      'glass',
      'doors_windows',
      'insulation',
      'finishing'
    );
  END IF;
END$$;

-- =====================================================
-- LABOR CATEGORY ENUM
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'labor_category_enum') THEN
    CREATE TYPE labor_category_enum AS ENUM (
      'mason',
      'carpenter',
      'electrician',
      'plumber',
      'painter',
      'roofer',
      'tiler',
      'welder',
      'laborer',
      'foreman',
      'supervisor',
      'architect',
      'engineer'
    );
  END IF;
END$$;

-- =====================================================
-- ECONOMIC INDICATORS TABLE
-- Tracks economic indicators over time from Bank of Ghana, GSS, etc.
-- =====================================================
CREATE TABLE IF NOT EXISTS economic_indicators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Indicator identification
  indicator_type economic_indicator_type_enum NOT NULL,
  indicator_name VARCHAR(100) NOT NULL,
  
  -- Value
  value DECIMAL(15, 6) NOT NULL,
  previous_value DECIMAL(15, 6),
  change_percentage DECIMAL(8, 4),
  
  -- Period
  effective_date DATE NOT NULL,
  period_type VARCHAR(20) NOT NULL DEFAULT 'monthly', -- 'daily', 'weekly', 'monthly', 'quarterly', 'annual'
  
  -- Source
  source_name VARCHAR(100) NOT NULL, -- 'Bank of Ghana', 'Ghana Statistical Service', etc.
  source_url VARCHAR(500),
  source_reference VARCHAR(255),
  
  -- Metadata
  unit VARCHAR(50), -- 'percentage', 'index', 'ghs_per_usd', etc.
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  -- Unique constraint: one value per indicator per effective date
  UNIQUE(indicator_type, effective_date)
);

CREATE INDEX idx_economic_indicators_type ON economic_indicators(indicator_type);
CREATE INDEX idx_economic_indicators_date ON economic_indicators(effective_date);
CREATE INDEX idx_economic_indicators_type_date ON economic_indicators(indicator_type, effective_date DESC);
CREATE INDEX idx_economic_indicators_source ON economic_indicators(source_name);

-- =====================================================
-- MATERIAL PRICES TABLE
-- Detailed tracking of construction material prices
-- =====================================================
CREATE TABLE IF NOT EXISTS material_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Material identification
  category material_category_enum NOT NULL,
  material_name VARCHAR(100) NOT NULL,
  specification TEXT, -- e.g., "50kg bag", "12mm diameter", "2x4 standard"
  brand VARCHAR(100),
  
  -- Pricing
  price_ghs DECIMAL(12, 2) NOT NULL,
  unit VARCHAR(50) NOT NULL, -- 'bag', 'ton', 'trip', 'length', 'sqm', 'piece', etc.
  
  -- Geographic scope
  region region_code_enum NOT NULL,
  district VARCHAR(100),
  
  -- Supplier information
  supplier_type VARCHAR(50), -- 'retail', 'wholesale', 'manufacturer'
  supplier_name VARCHAR(255),
  
  -- Validity period
  effective_date DATE NOT NULL,
  expiry_date DATE,
  
  -- Source
  source_type VARCHAR(50) NOT NULL, -- 'survey', 'supplier_quote', 'market_check', 'api'
  source_reference VARCHAR(255),
  
  -- Metadata
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_material_prices_category ON material_prices(category);
CREATE INDEX idx_material_prices_name ON material_prices(material_name);
CREATE INDEX idx_material_prices_region ON material_prices(region);
CREATE INDEX idx_material_prices_date ON material_prices(effective_date);
CREATE INDEX idx_material_prices_category_region ON material_prices(category, region, effective_date DESC);
CREATE INDEX idx_material_prices_name_region ON material_prices(material_name, region, effective_date DESC);

-- =====================================================
-- LABOR RATES TABLE
-- Tracks labor costs by skill type and region
-- =====================================================
CREATE TABLE IF NOT EXISTS labor_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Labor identification
  category labor_category_enum NOT NULL,
  role_name VARCHAR(100) NOT NULL,
  skill_level VARCHAR(50) DEFAULT 'journeyman', -- 'apprentice', 'journeyman', 'master', 'specialist'
  
  -- Rates
  daily_rate_ghs DECIMAL(10, 2) NOT NULL,
  hourly_rate_ghs DECIMAL(10, 2),
  overtime_multiplier DECIMAL(3, 2) DEFAULT 1.50,
  
  -- Geographic scope
  region region_code_enum NOT NULL,
  district VARCHAR(100),
  
  -- Validity period
  effective_date DATE NOT NULL,
  expiry_date DATE,
  
  -- Source
  source_type VARCHAR(50) NOT NULL, -- 'survey', 'union_rate', 'market_check', 'contractor_quote'
  source_reference VARCHAR(255),
  
  -- Additional benefits/costs
  includes_meals BOOLEAN DEFAULT false,
  includes_transport BOOLEAN DEFAULT false,
  social_security_rate DECIMAL(5, 4) DEFAULT 0.055, -- SSNIT contribution rate
  
  -- Metadata
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_labor_rates_category ON labor_rates(category);
CREATE INDEX idx_labor_rates_region ON labor_rates(region);
CREATE INDEX idx_labor_rates_date ON labor_rates(effective_date);
CREATE INDEX idx_labor_rates_category_region ON labor_rates(category, region, effective_date DESC);
CREATE INDEX idx_labor_rates_skill ON labor_rates(skill_level);

-- =====================================================
-- EQUIPMENT RATES TABLE
-- Tracks equipment rental/operation costs
-- =====================================================
CREATE TABLE IF NOT EXISTS equipment_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Equipment identification
  equipment_type VARCHAR(100) NOT NULL, -- 'excavator', 'concrete_mixer', 'crane', 'generator', etc.
  model VARCHAR(100),
  capacity VARCHAR(50), -- e.g., '5 tons', '0.5 cubic meter'
  
  -- Rates
  daily_rate_ghs DECIMAL(12, 2) NOT NULL,
  hourly_rate_ghs DECIMAL(12, 2),
  includes_operator BOOLEAN DEFAULT false,
  includes_fuel BOOLEAN DEFAULT false,
  
  -- Geographic scope
  region region_code_enum NOT NULL,
  
  -- Validity period
  effective_date DATE NOT NULL,
  expiry_date DATE,
  
  -- Source
  source_type VARCHAR(50) NOT NULL,
  source_reference VARCHAR(255),
  
  -- Metadata
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_equipment_rates_type ON equipment_rates(equipment_type);
CREATE INDEX idx_equipment_rates_region ON equipment_rates(region);
CREATE INDEX idx_equipment_rates_date ON equipment_rates(effective_date);

-- =====================================================
-- CONSTRUCTION COST INDICES TABLE
-- More detailed construction cost tracking with breakdown
-- =====================================================
CREATE TABLE IF NOT EXISTS construction_cost_indices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Period
  effective_date DATE NOT NULL,
  period_type VARCHAR(20) NOT NULL DEFAULT 'monthly',
  
  -- Geographic scope
  region region_code_enum,
  
  -- Index values (base January 2020 = 100)
  base_year INTEGER DEFAULT 2020,
  base_month INTEGER DEFAULT 1,
  
  -- Material sub-indices
  cement_index DECIMAL(8, 2) DEFAULT 100,
  steel_index DECIMAL(8, 2) DEFAULT 100,
  timber_index DECIMAL(8, 2) DEFAULT 100,
  finishing_index DECIMAL(8, 2) DEFAULT 100,
  
  -- Labor sub-indices
  skilled_labor_index DECIMAL(8, 2) DEFAULT 100,
  unskilled_labor_index DECIMAL(8, 2) DEFAULT 100,
  
  -- Aggregate indices
  material_index DECIMAL(8, 2) DEFAULT 100,
  labor_index DECIMAL(8, 2) DEFAULT 100,
  equipment_index DECIMAL(8, 2) DEFAULT 100,
  overall_index DECIMAL(8, 2) DEFAULT 100,
  
  -- Change metrics
  material_change_mom DECIMAL(8, 4), -- Month-over-month
  labor_change_mom DECIMAL(8, 4),
  overall_change_mom DECIMAL(8, 4),
  overall_change_yoy DECIMAL(8, 4), -- Year-over-year
  
  -- Cost per sqm estimates by property type (GHS)
  residential_basic_per_sqm DECIMAL(12, 2),
  residential_standard_per_sqm DECIMAL(12, 2),
  residential_premium_per_sqm DECIMAL(12, 2),
  residential_luxury_per_sqm DECIMAL(12, 2),
  commercial_basic_per_sqm DECIMAL(12, 2),
  commercial_standard_per_sqm DECIMAL(12, 2),
  commercial_premium_per_sqm DECIMAL(12, 2),
  industrial_per_sqm DECIMAL(12, 2),
  
  -- Source
  source_name VARCHAR(100),
  sample_size INTEGER,
  confidence_level DECIMAL(3, 2),
  
  -- Metadata
  notes TEXT,
  methodology TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  -- Unique constraint
  UNIQUE(effective_date, region)
);

CREATE INDEX idx_construction_indices_date ON construction_cost_indices(effective_date);
CREATE INDEX idx_construction_indices_region ON construction_cost_indices(region);
CREATE INDEX idx_construction_indices_region_date ON construction_cost_indices(region, effective_date DESC);

-- =====================================================
-- TRIGGERS FOR UPDATED_AT
-- =====================================================

CREATE TRIGGER update_economic_indicators_updated_at
  BEFORE UPDATE ON economic_indicators
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_material_prices_updated_at
  BEFORE UPDATE ON material_prices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_labor_rates_updated_at
  BEFORE UPDATE ON labor_rates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_equipment_rates_updated_at
  BEFORE UPDATE ON equipment_rates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_construction_indices_updated_at
  BEFORE UPDATE ON construction_cost_indices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SEED INITIAL ECONOMIC INDICATORS (January 2026)
-- =====================================================
INSERT INTO economic_indicators (indicator_type, indicator_name, value, effective_date, source_name, unit, period_type)
VALUES
  -- Inflation and Prices
  ('inflation_rate', 'Ghana Headline Inflation', 23.20, '2026-01-01', 'Ghana Statistical Service', 'percentage', 'monthly'),
  ('cpi_index', 'Consumer Price Index', 158.40, '2026-01-01', 'Ghana Statistical Service', 'index', 'monthly'),
  ('property_price_index', 'Ghana Property Price Index', 112.50, '2026-01-01', 'PropMetrik Analytics', 'index', 'monthly'),
  
  -- Interest Rates
  ('interest_rate_policy', 'Bank of Ghana Policy Rate', 30.00, '2026-01-01', 'Bank of Ghana', 'percentage', 'monthly'),
  ('interest_rate_prime', 'Ghana Reference Rate (Prime)', 33.50, '2026-01-01', 'Bank of Ghana', 'percentage', 'monthly'),
  ('mortgage_rate_avg', 'Average Mortgage Rate', 32.00, '2026-01-01', 'Bank of Ghana', 'percentage', 'monthly'),
  
  -- Exchange Rates
  ('exchange_rate_usd', 'USD/GHS Exchange Rate', 15.50, '2026-01-01', 'Bank of Ghana', 'ghs_per_usd', 'daily'),
  ('exchange_rate_gbp', 'GBP/GHS Exchange Rate', 19.50, '2026-01-01', 'Bank of Ghana', 'ghs_per_gbp', 'daily'),
  ('exchange_rate_eur', 'EUR/GHS Exchange Rate', 16.80, '2026-01-01', 'Bank of Ghana', 'ghs_per_eur', 'daily'),
  
  -- GDP and Employment
  ('gdp_growth', 'Ghana GDP Growth Rate', 3.20, '2026-01-01', 'Ghana Statistical Service', 'percentage', 'quarterly'),
  ('unemployment_rate', 'Ghana Unemployment Rate', 13.40, '2026-01-01', 'Ghana Statistical Service', 'percentage', 'quarterly'),
  
  -- Construction
  ('construction_pmi', 'Construction Purchasing Managers Index', 51.20, '2026-01-01', 'Industry Survey', 'index', 'monthly')
ON CONFLICT (indicator_type, effective_date) DO NOTHING;

-- =====================================================
-- SEED INITIAL MATERIAL PRICES (Greater Accra, January 2026)
-- =====================================================
INSERT INTO material_prices (category, material_name, specification, price_ghs, unit, region, effective_date, source_type)
VALUES
  -- Cement
  ('cement', 'Cement (OPC)', '50kg bag - Diamond, Ghacem', 95.00, 'bag', 'greater_accra', '2026-01-01', 'market_check'),
  ('cement', 'Cement (Pozzolanic)', '50kg bag - Ghacem Superset', 88.00, 'bag', 'greater_accra', '2026-01-01', 'market_check'),
  
  -- Steel
  ('steel', 'Steel Rod 12mm', 'High yield deformed bar', 3800.00, 'ton', 'greater_accra', '2026-01-01', 'market_check'),
  ('steel', 'Steel Rod 16mm', 'High yield deformed bar', 3850.00, 'ton', 'greater_accra', '2026-01-01', 'market_check'),
  ('steel', 'BRC Mesh', 'A142 (6mm)', 85.00, 'sheet', 'greater_accra', '2026-01-01', 'market_check'),
  
  -- Sand and Aggregates
  ('sand', 'Sharp Sand', 'Tipper load (10 tons)', 2500.00, 'trip', 'greater_accra', '2026-01-01', 'market_check'),
  ('sand', 'Plaster Sand', 'Tipper load (10 tons)', 2800.00, 'trip', 'greater_accra', '2026-01-01', 'market_check'),
  ('gravel', 'Gravel (3/4 inch)', 'Tipper load (10 tons)', 3200.00, 'trip', 'greater_accra', '2026-01-01', 'market_check'),
  ('gravel', 'Granite Chippings', 'Tipper load (10 tons)', 3500.00, 'trip', 'greater_accra', '2026-01-01', 'market_check'),
  
  -- Blocks
  ('blocks', 'Sandcrete Block 6-inch', 'Standard hollow block', 12.00, 'piece', 'greater_accra', '2026-01-01', 'market_check'),
  ('blocks', 'Sandcrete Block 5-inch', 'Standard hollow block', 10.00, 'piece', 'greater_accra', '2026-01-01', 'market_check'),
  ('blocks', 'Solid Block 6-inch', 'Solid sandcrete', 15.00, 'piece', 'greater_accra', '2026-01-01', 'market_check'),
  
  -- Timber
  ('timber', 'Wawa Timber 2x4', '12ft length', 45.00, 'length', 'greater_accra', '2026-01-01', 'market_check'),
  ('timber', 'Odum Timber 2x4', '12ft length', 85.00, 'length', 'greater_accra', '2026-01-01', 'market_check'),
  ('timber', 'Plywood 18mm', '8x4 ft sheet', 320.00, 'sheet', 'greater_accra', '2026-01-01', 'market_check'),
  
  -- Roofing
  ('roofing', 'Roofing Sheet 0.45mm', 'Aluminum long span', 280.00, 'length', 'greater_accra', '2026-01-01', 'market_check'),
  ('roofing', 'Roofing Sheet 0.55mm', 'Aluminum long span', 350.00, 'length', 'greater_accra', '2026-01-01', 'market_check'),
  ('roofing', 'Step Tiles', 'Stone coated', 35.00, 'sqm', 'greater_accra', '2026-01-01', 'market_check'),
  
  -- Paint
  ('paint', 'Emulsion Paint', 'Eco Gloss 20L', 450.00, 'bucket', 'greater_accra', '2026-01-01', 'market_check'),
  ('paint', 'Textcoat', 'BK textcoat 20L', 380.00, 'bucket', 'greater_accra', '2026-01-01', 'market_check'),
  
  -- Tiles
  ('tiles', 'Floor Tiles 60x60', 'Ceramic standard', 85.00, 'sqm', 'greater_accra', '2026-01-01', 'market_check'),
  ('tiles', 'Wall Tiles 30x60', 'Ceramic standard', 75.00, 'sqm', 'greater_accra', '2026-01-01', 'market_check'),
  ('tiles', 'Porcelain Tiles 60x60', 'Polished porcelain', 180.00, 'sqm', 'greater_accra', '2026-01-01', 'market_check')
ON CONFLICT DO NOTHING;

-- =====================================================
-- SEED INITIAL LABOR RATES (Greater Accra, January 2026)
-- =====================================================
INSERT INTO labor_rates (category, role_name, skill_level, daily_rate_ghs, hourly_rate_ghs, region, effective_date, source_type)
VALUES
  -- Masons
  ('mason', 'Mason (Block Work)', 'journeyman', 200.00, 25.00, 'greater_accra', '2026-01-01', 'market_check'),
  ('mason', 'Mason (Plastering)', 'journeyman', 180.00, 22.50, 'greater_accra', '2026-01-01', 'market_check'),
  ('mason', 'Master Mason', 'master', 350.00, 43.75, 'greater_accra', '2026-01-01', 'market_check'),
  
  -- Carpenters
  ('carpenter', 'Carpenter (Formwork)', 'journeyman', 180.00, 22.50, 'greater_accra', '2026-01-01', 'market_check'),
  ('carpenter', 'Carpenter (Roofing)', 'journeyman', 200.00, 25.00, 'greater_accra', '2026-01-01', 'market_check'),
  ('carpenter', 'Furniture Maker', 'master', 300.00, 37.50, 'greater_accra', '2026-01-01', 'market_check'),
  
  -- Electrical and Plumbing
  ('electrician', 'Electrician', 'journeyman', 250.00, 31.25, 'greater_accra', '2026-01-01', 'market_check'),
  ('electrician', 'Master Electrician', 'master', 400.00, 50.00, 'greater_accra', '2026-01-01', 'market_check'),
  ('plumber', 'Plumber', 'journeyman', 220.00, 27.50, 'greater_accra', '2026-01-01', 'market_check'),
  ('plumber', 'Master Plumber', 'master', 380.00, 47.50, 'greater_accra', '2026-01-01', 'market_check'),
  
  -- Finishing trades
  ('painter', 'Painter', 'journeyman', 150.00, 18.75, 'greater_accra', '2026-01-01', 'market_check'),
  ('tiler', 'Tiler', 'journeyman', 200.00, 25.00, 'greater_accra', '2026-01-01', 'market_check'),
  ('roofer', 'Roofer', 'journeyman', 220.00, 27.50, 'greater_accra', '2026-01-01', 'market_check'),
  ('welder', 'Welder', 'journeyman', 250.00, 31.25, 'greater_accra', '2026-01-01', 'market_check'),
  
  -- General labor and supervision
  ('laborer', 'Laborer', 'apprentice', 80.00, 10.00, 'greater_accra', '2026-01-01', 'market_check'),
  ('laborer', 'Skilled Laborer', 'journeyman', 120.00, 15.00, 'greater_accra', '2026-01-01', 'market_check'),
  ('foreman', 'Site Foreman', 'master', 350.00, 43.75, 'greater_accra', '2026-01-01', 'market_check'),
  ('supervisor', 'Site Supervisor', 'specialist', 500.00, 62.50, 'greater_accra', '2026-01-01', 'market_check'),
  
  -- Professionals
  ('architect', 'Architect (Site)', 'specialist', 800.00, 100.00, 'greater_accra', '2026-01-01', 'market_check'),
  ('engineer', 'Structural Engineer', 'specialist', 900.00, 112.50, 'greater_accra', '2026-01-01', 'market_check')
ON CONFLICT DO NOTHING;

-- =====================================================
-- SEED INITIAL CONSTRUCTION COST INDEX (January 2026)
-- =====================================================
INSERT INTO construction_cost_indices (
  effective_date, period_type, region,
  material_index, labor_index, equipment_index, overall_index,
  residential_basic_per_sqm, residential_standard_per_sqm, 
  residential_premium_per_sqm, residential_luxury_per_sqm,
  commercial_basic_per_sqm, commercial_standard_per_sqm, commercial_premium_per_sqm,
  industrial_per_sqm,
  source_name
)
VALUES
  -- Greater Accra (premium region, highest costs)
  ('2026-01-01', 'monthly', 'greater_accra', 
   115.00, 112.00, 108.00, 113.00,
   4025.00, 5750.00, 9200.00, 17250.00,
   6900.00, 9200.00, 14950.00, 5750.00,
   'PropMetrik Survey'),
  
  -- Kumasi Metro (baseline region)
  ('2026-01-01', 'monthly', 'kumasi_metro',
   100.00, 100.00, 100.00, 100.00,
   3500.00, 5000.00, 8000.00, 15000.00,
   6000.00, 8000.00, 13000.00, 5000.00,
   'PropMetrik Survey'),
  
  -- Eastern (slightly lower costs)
  ('2026-01-01', 'monthly', 'eastern',
   98.00, 95.00, 100.00, 97.00,
   3395.00, 4850.00, 7760.00, 14550.00,
   5820.00, 7760.00, 12610.00, 4850.00,
   'PropMetrik Survey'),
  
  -- Western Cluster
  ('2026-01-01', 'monthly', 'western_cluster',
   102.00, 98.00, 105.00, 101.00,
   3535.00, 5050.00, 8080.00, 15150.00,
   6060.00, 8080.00, 13130.00, 5050.00,
   'PropMetrik Survey'),
  
  -- Northern Cluster (lower costs, transport challenges)
  ('2026-01-01', 'monthly', 'northern_cluster',
   95.00, 85.00, 110.00, 92.00,
   3150.00, 4500.00, 7200.00, 13500.00,
   5400.00, 7200.00, 11700.00, 4500.00,
   'PropMetrik Survey'),
  
  -- National average (no region specified)
  ('2026-01-01', 'monthly', NULL,
   102.00, 98.00, 105.00, 101.00,
   3600.00, 5150.00, 8240.00, 15450.00,
   6180.00, 8240.00, 13390.00, 5150.00,
   'PropMetrik Survey')
ON CONFLICT (effective_date, region) DO NOTHING;

-- =====================================================
-- UPDATE DATA SOURCES TO INCLUDE NEW TIER 4 SOURCES
-- =====================================================
INSERT INTO data_sources (name, slug, tier, trust_score, sync_frequency, description, is_active)
VALUES
  -- HouseMaster - quality-verified listings
  ('HouseMaster Ghana', 'housemaster', 'tier5_public_web', 0.75, 'daily',
   'Quality-verified property listings from housemaster.house', true),
  
  -- Realtor International
  ('Realtor.com International Ghana', 'realtor-international', 'tier5_public_web', 0.80, 'daily',
   'International property listings from realtor.com/international/gh', true),
  
  -- Ghana Statistical Service
  ('Ghana Statistical Service', 'gss', 'tier4_market_data', 0.90, 'monthly',
   'Economic indicators including CPI, inflation, unemployment from GSS', false),
  
  -- Material Price Surveys
  ('Material Price Survey', 'material-survey', 'tier4_market_data', 0.75, 'weekly',
   'Construction material price surveys from suppliers and markets', true)
ON CONFLICT (slug) DO NOTHING;

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================
COMMENT ON TABLE economic_indicators IS 'Tier 4 economic indicators from Bank of Ghana, GSS, and other sources';
COMMENT ON TABLE material_prices IS 'Detailed construction material prices by region and supplier';
COMMENT ON TABLE labor_rates IS 'Construction labor rates by skill level and region';
COMMENT ON TABLE equipment_rates IS 'Construction equipment rental rates';
COMMENT ON TABLE construction_cost_indices IS 'Aggregate construction cost indices with per-sqm estimates';

COMMENT ON COLUMN economic_indicators.indicator_type IS 'Type of economic indicator (inflation, exchange rate, interest rate, etc.)';
COMMENT ON COLUMN material_prices.supplier_type IS 'retail = retail shops, wholesale = bulk suppliers, manufacturer = direct from factory';
COMMENT ON COLUMN labor_rates.skill_level IS 'apprentice < journeyman < master < specialist';
COMMENT ON COLUMN construction_cost_indices.base_year IS 'Base year for index calculation (100 = base year average)';
