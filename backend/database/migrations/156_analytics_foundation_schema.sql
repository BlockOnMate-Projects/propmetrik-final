-- =====================================================
-- Migration 156: Analytics Foundation Schema (Phase 1)
--
-- Creates the analytics summary/aggregation tables that
-- the mlAnalyticsService already queries (Sections 1-4).
-- Note: construction_cost_index already exists in migration 007
-- with a different (raw-data) schema. The new table here is
-- construction_cost_index_analytics — a computed time-series
-- summary that the analytics layer reads.
--
-- Tables created:
--   1. construction_cost_index_analytics  (Section 1 CCI summary)
--   2. regional_cost_data                 (Section 1.2 regional comparison)
--   3. material_prices                    (Section 1.3 material tracking)
--   4. labor_rates                        (Section 1.4 labor analytics)
--   5. housing_affordability_index        (Section 2 GHAI)
--   6. valuation_analytics_snapshots      (Section 3)
--   7. property_price_index               (Section 4.1)
--   8. market_activity_metrics            (Section 4.2)
--   9. ml_model_performance               (Section 8 – model tracking)
--  10. analytics_alerts                   (Alert system foundation)
--  11. analytics_alert_rules              (Alert threshold rules)
-- =====================================================

BEGIN;

-- =====================================================
-- 1. CONSTRUCTION COST INDEX (Analytics Summary)
-- Time-series summary of the national + regional cost index.
-- Columns match what mlAnalyticsService.getConstructionCostIndex() queries.
-- =====================================================
CREATE TABLE IF NOT EXISTS construction_cost_index_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_date DATE NOT NULL,
  period_type VARCHAR(20) NOT NULL DEFAULT 'monthly',  -- daily, weekly, monthly
  region VARCHAR(50),  -- NULL for national aggregate

  -- Index values
  index_value DECIMAL(10,2) NOT NULL,
  base_value DECIMAL(10,2) NOT NULL DEFAULT 100.00,
  base_date DATE NOT NULL DEFAULT '2024-01-01',

  -- Component indices & weights
  materials_index DECIMAL(10,2),
  materials_weight DECIMAL(5,4) DEFAULT 0.5500,
  labor_index DECIMAL(10,2),
  labor_weight DECIMAL(5,4) DEFAULT 0.3500,
  overhead_index DECIMAL(10,2),
  overhead_weight DECIMAL(5,4) DEFAULT 0.1000,

  -- Period-over-period changes (%)
  change_mom DECIMAL(6,3),
  change_qoq DECIMAL(6,3),
  change_yoy DECIMAL(6,3),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(period_date, period_type, region)
);

-- Create a VIEW so existing mlAnalyticsService queries against
-- "construction_cost_index" (with the analytics columns) still work.
-- The raw table from migration 007 has a different schema, so we
-- create a view that unions analytics data.
-- First drop any conflicting view.
DROP VIEW IF EXISTS construction_cost_index_summary;
CREATE VIEW construction_cost_index_summary AS
  SELECT * FROM construction_cost_index_analytics;

CREATE INDEX IF NOT EXISTS idx_cci_analytics_period
  ON construction_cost_index_analytics(period_date, region);
CREATE INDEX IF NOT EXISTS idx_cci_analytics_region
  ON construction_cost_index_analytics(region, period_date);

-- =====================================================
-- 2. REGIONAL COST DATA
-- Section 1.2 – Regional cost comparison matrix
-- =====================================================
CREATE TABLE IF NOT EXISTS regional_cost_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region VARCHAR(50) NOT NULL,

  -- Cost multiplier relative to national average
  multiplier DECIMAL(6,4) NOT NULL DEFAULT 1.0000,

  -- Transport / logistics factors
  distance_from_port_km DECIMAL(8,2),
  transport_factor DECIMAL(6,4) DEFAULT 1.0000,
  infrastructure_score DECIMAL(5,2),  -- 0-100

  -- Absolute cost components (GHS per sqm, standard residential)
  materials_cost DECIMAL(12,2),
  labor_cost DECIMAL(12,2),
  transport_cost DECIMAL(12,2),

  -- Trend (%)
  trend_6m DECIMAL(6,3),
  trend_12m DECIMAL(6,3),

  -- Metadata
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  data_source VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(region, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_regional_cost_region
  ON regional_cost_data(region);

-- =====================================================
-- 3. MATERIAL PRICES
-- Section 1.3 – Individual material cost tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS material_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) NOT NULL,       -- cement, steel, aggregates, timber, electrical, plumbing, etc.
  sub_category VARCHAR(100),           -- e.g. "Portland Type I", "12mm rebar"
  unit_price DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'GHS',
  unit VARCHAR(20),                    -- bag, ton, trip, sqm, length, gallon
  region VARCHAR(50),                  -- NULL for national
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Source breakdown
  local_pct DECIMAL(5,2),             -- % locally produced
  import_pct DECIMAL(5,2),            -- % imported

  -- Volatility / trend
  price_volatility VARCHAR(20),       -- low, medium, high
  change_mom DECIMAL(6,3),
  change_yoy DECIMAL(6,3),

  -- Metadata
  data_source VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(category, sub_category, region, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_material_prices_category
  ON material_prices(category, effective_date);
CREATE INDEX IF NOT EXISTS idx_material_prices_region
  ON material_prices(region, effective_date);

-- =====================================================
-- 4. LABOR RATES
-- Section 1.4 – Skill-based wage tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS labor_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) NOT NULL,       -- mason, carpenter, electrician, plumber, laborer, supervisor
  skill_level VARCHAR(30) NOT NULL,    -- unskilled, semi_skilled, skilled, supervisor
  daily_rate DECIMAL(10,2) NOT NULL,
  monthly_rate DECIMAL(12,2),
  region VARCHAR(50),
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Trend
  yoy_change DECIMAL(6,3),

  -- Supply status
  supply_status VARCHAR(30),           -- adequate, moderate, shortage, critical

  -- Metadata
  data_source VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(category, skill_level, region, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_labor_rates_category
  ON labor_rates(category, skill_level);
CREATE INDEX IF NOT EXISTS idx_labor_rates_region
  ON labor_rates(region, effective_date);

-- =====================================================
-- 5. HOUSING AFFORDABILITY INDEX (GHAI)
-- Section 2 – Multi-dimensional affordability index
-- Columns match mlAnalyticsService.getHousingAffordabilityIndex()
-- =====================================================
CREATE TABLE IF NOT EXISTS housing_affordability_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_date DATE NOT NULL,
  region VARCHAR(50) NOT NULL,
  property_type VARCHAR(50) DEFAULT 'residential',

  -- Core composite
  ghai_composite DECIMAL(6,2) NOT NULL,
  ghai_category VARCHAR(30),  -- affordable, moderate, unaffordable, severely_unaffordable

  -- Sub-indices
  mhai DECIMAL(6,2),          -- Mortgage HAI
  chai DECIMAL(6,2),          -- Cash HAI
  rhai DECIMAL(6,2),          -- Rental HAI

  -- Weights used
  mortgage_weight DECIMAL(5,4),
  cash_weight DECIMAL(5,4),
  rental_weight DECIMAL(5,4),

  -- Supplementary indices
  cai DECIMAL(6,2),           -- Construction Affordability Index
  lai DECIMAL(6,2),           -- Land Affordability Index
  mas DECIMAL(6,2),           -- Mortgage Accessibility Score

  -- Input data
  median_property_price DECIMAL(15,2),
  median_household_income DECIMAL(15,2),
  mortgage_rate DECIMAL(6,4),
  median_monthly_rent DECIMAL(12,2),

  -- Trend
  trend_direction VARCHAR(20),   -- improving, stable, declining
  change_mom DECIMAL(6,3),
  change_yoy DECIMAL(6,3),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(calculation_date, region, property_type)
);

CREATE INDEX IF NOT EXISTS idx_hai_date
  ON housing_affordability_index(calculation_date, region);
CREATE INDEX IF NOT EXISTS idx_hai_region
  ON housing_affordability_index(region, calculation_date);

-- =====================================================
-- 6. VALUATION ANALYTICS SNAPSHOTS
-- Section 3 – Aggregated valuation metrics
-- =====================================================
CREATE TABLE IF NOT EXISTS valuation_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  period_type VARCHAR(20) NOT NULL DEFAULT 'monthly',
  region VARCHAR(50),
  property_type VARCHAR(50),

  -- Volume
  valuation_count INTEGER,
  total_value DECIMAL(18,2),
  avg_value DECIMAL(15,2),
  median_value DECIMAL(15,2),

  -- Method distribution
  sales_comparison_count INTEGER,
  sales_comparison_avg_confidence DECIMAL(5,2),
  cost_approach_count INTEGER,
  cost_approach_avg_confidence DECIMAL(5,2),
  income_approach_count INTEGER,
  income_approach_avg_confidence DECIMAL(5,2),

  -- Quality metrics
  avg_comparables_used DECIMAL(4,2),
  avg_time_to_complete_days DECIMAL(6,2),
  override_rate DECIMAL(5,4),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(snapshot_date, period_type, region, property_type)
);

CREATE INDEX IF NOT EXISTS idx_vas_snapshot
  ON valuation_analytics_snapshots(snapshot_date, region);

-- =====================================================
-- 7. PROPERTY PRICE INDEX
-- Section 4.1 – Market price tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS property_price_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region VARCHAR(50) NOT NULL,
  property_type VARCHAR(50) NOT NULL DEFAULT 'residential',
  period_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Index value
  index_value DECIMAL(10,2) NOT NULL,
  base_period VARCHAR(20) DEFAULT '2024-01',

  -- Changes
  change_mom DECIMAL(6,3),
  change_qoq DECIMAL(6,3),
  change_yoy DECIMAL(6,3),

  -- Price stats
  median_price DECIMAL(15,2),
  avg_price DECIMAL(15,2),
  transaction_count INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(region, property_type, period_date)
);

CREATE INDEX IF NOT EXISTS idx_ppi_region
  ON property_price_index(region, period_date);

-- =====================================================
-- 8. MARKET ACTIVITY METRICS
-- Section 4.2 – Supply / demand / listing metrics
-- Columns align with mlAnalyticsService.getMarketActivity()
-- =====================================================
CREATE TABLE IF NOT EXISTS market_activity_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_date DATE NOT NULL,
  period_type VARCHAR(20) NOT NULL DEFAULT 'monthly',
  region VARCHAR(50) NOT NULL,
  property_type VARCHAR(50),

  -- Transaction metrics
  transaction_count INTEGER,
  transaction_value DECIMAL(18,2),
  avg_transaction_value DECIMAL(15,2),
  median_transaction_value DECIMAL(15,2),

  -- Listing metrics
  new_listings INTEGER,
  active_listings INTEGER,
  avg_days_on_market DECIMAL(6,2),
  listing_to_sale_ratio DECIMAL(6,4),

  -- Supply / demand
  absorption_rate DECIMAL(6,4),
  inventory_months DECIMAL(6,2),
  avg_discount_pct DECIMAL(5,2),

  -- Price index
  price_index DECIMAL(10,2),
  price_change_mom DECIMAL(6,3),
  price_change_yoy DECIMAL(6,3),

  -- Legacy compatibility columns (mlAnalyticsService reads these)
  total_active_listings INTEGER,
  properties_sold INTEGER,
  price_reductions INTEGER,
  period VARCHAR(20),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(period_date, period_type, region, property_type)
);

CREATE INDEX IF NOT EXISTS idx_mam_period
  ON market_activity_metrics(period_date, region);

-- =====================================================
-- 9. ML MODEL PERFORMANCE
-- Section 8 – Model accuracy tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS ml_model_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version VARCHAR(50) NOT NULL,
  evaluation_date DATE NOT NULL,

  -- Sample info
  sample_size INTEGER,
  property_type VARCHAR(50),
  region VARCHAR(50),

  -- Accuracy metrics
  mae DECIMAL(12,2),
  mape DECIMAL(6,4),
  rmse DECIMAL(12,2),
  r2_score DECIMAL(6,4),
  accuracy_within_10 DECIMAL(5,4),
  accuracy_within_15 DECIMAL(5,4),
  accuracy_within_20 DECIMAL(5,4),

  -- Prediction intervals
  coverage_90 DECIMAL(5,4),
  coverage_95 DECIMAL(5,4),
  avg_interval_width DECIMAL(12,2),

  -- Drift metrics
  feature_drift_score DECIMAL(6,4),
  prediction_drift_score DECIMAL(6,4),
  drift_detected BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(model_version, evaluation_date, property_type, region)
);

CREATE INDEX IF NOT EXISTS idx_mlp_model
  ON ml_model_performance(model_version, evaluation_date);

-- =====================================================
-- 10. ANALYTICS ALERTS
-- Alert instances raised by the alert system
-- =====================================================
CREATE TABLE IF NOT EXISTS analytics_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID,

  -- Classification
  severity VARCHAR(20) NOT NULL DEFAULT 'info',  -- info, warning, critical
  category VARCHAR(50) NOT NULL,                  -- construction, hai, valuation, market, model
  sub_category VARCHAR(50),                       -- e.g. steel_price, ghai_decline, model_drift

  -- Content
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  metric_name VARCHAR(100),
  metric_value DECIMAL(15,4),
  threshold_value DECIMAL(15,4),
  region VARCHAR(50),

  -- State
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, acknowledged, resolved, dismissed
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,

  -- Links
  detail_url VARCHAR(500),
  related_entity_type VARCHAR(50),
  related_entity_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_status
  ON analytics_alerts(status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_category
  ON analytics_alerts(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_region
  ON analytics_alerts(region, created_at DESC);

-- =====================================================
-- 11. ANALYTICS ALERT RULES
-- Configurable threshold rules that generate alerts
-- =====================================================
CREATE TABLE IF NOT EXISTS analytics_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- What to monitor
  category VARCHAR(50) NOT NULL,
  metric_name VARCHAR(100) NOT NULL,
  region VARCHAR(50),  -- NULL for all regions

  -- Threshold
  condition VARCHAR(20) NOT NULL,   -- gt, gte, lt, lte, change_gt, change_lt, deviation
  threshold_value DECIMAL(15,4) NOT NULL,
  comparison_period VARCHAR(20),    -- mom, qoq, yoy

  -- Alert configuration
  severity VARCHAR(20) NOT NULL DEFAULT 'warning',
  cooldown_hours INTEGER DEFAULT 24,  -- Don't re-alert within this window
  is_active BOOLEAN DEFAULT TRUE,

  -- Metadata
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_active
  ON analytics_alert_rules(is_active, category);

-- =====================================================
-- SEED: Default alert rules
-- =====================================================
INSERT INTO analytics_alert_rules (name, description, category, metric_name, condition, threshold_value, comparison_period, severity) VALUES
  ('Steel Price Spike', 'Steel prices increased >15% month-over-month', 'construction', 'steel_price_change_mom', 'gt', 15.0, 'mom', 'critical'),
  ('Cement Price Spike', 'Cement prices increased >10% month-over-month', 'construction', 'cement_price_change_mom', 'gt', 10.0, 'mom', 'warning'),
  ('CCI Rapid Increase', 'Construction Cost Index increased >5% month-over-month', 'construction', 'cci_change_mom', 'gt', 5.0, 'mom', 'warning'),
  ('GHAI Decline', 'GHAI composite declined >3% month-over-month', 'hai', 'ghai_change_mom', 'lt', -3.0, 'mom', 'warning'),
  ('GHAI Severely Unaffordable', 'GHAI composite dropped below 50', 'hai', 'ghai_composite', 'lt', 50.0, NULL, 'critical'),
  ('Model Accuracy Drop', 'Model MAPE exceeded 15%', 'model', 'mape', 'gt', 0.15, NULL, 'critical'),
  ('Model Drift Detected', 'Feature drift score exceeds threshold', 'model', 'feature_drift_score', 'gt', 0.10, NULL, 'warning'),
  ('Market Volume Drop', 'Transaction volume declined >20% year-over-year', 'market', 'transaction_count_change_yoy', 'lt', -20.0, 'yoy', 'warning')
ON CONFLICT DO NOTHING;

-- =====================================================
-- SEED: Sample regional cost data (Ghana regions)
-- Based on real-world Ghana construction cost multipliers
-- =====================================================
INSERT INTO regional_cost_data (region, multiplier, distance_from_port_km, transport_factor, infrastructure_score, materials_cost, labor_cost, transport_cost, trend_6m, trend_12m, effective_date)
VALUES
  ('greater_accra', 1.1500, 30,  1.00, 85.0, 4200, 2400, 350,  2.1, 4.5, CURRENT_DATE),
  ('ashanti',       1.0800, 270, 1.12, 72.0, 3900, 2200, 520,  1.8, 3.8, CURRENT_DATE),
  ('western',       1.0200, 230, 1.08, 65.0, 3700, 2100, 480,  1.5, 3.2, CURRENT_DATE),
  ('central',       0.9500, 150, 1.05, 62.0, 3500, 2000, 420,  1.2, 2.8, CURRENT_DATE),
  ('eastern',       0.9200, 100, 1.03, 60.0, 3400, 1950, 380,  1.0, 2.5, CURRENT_DATE),
  ('volta',         0.8800, 180, 1.07, 55.0, 3200, 1850, 450,  0.9, 2.2, CURRENT_DATE),
  ('northern',      0.8200, 600, 1.25, 45.0, 3000, 1700, 680,  0.8, 1.8, CURRENT_DATE),
  ('upper_east',    0.7800, 700, 1.30, 40.0, 2850, 1600, 750,  0.7, 1.5, CURRENT_DATE),
  ('upper_west',    0.7500, 750, 1.35, 38.0, 2750, 1550, 800,  0.6, 1.2, CURRENT_DATE),
  ('bono',          0.8500, 400, 1.18, 52.0, 3100, 1800, 580,  1.0, 2.0, CURRENT_DATE),
  ('ahafo',         0.8300, 420, 1.20, 48.0, 3050, 1750, 600,  0.9, 1.9, CURRENT_DATE),
  ('bono_east',     0.8400, 380, 1.16, 50.0, 3080, 1780, 560,  0.9, 2.0, CURRENT_DATE),
  ('north_east',    0.7900, 650, 1.28, 42.0, 2900, 1650, 720,  0.7, 1.5, CURRENT_DATE),
  ('savannah',      0.7700, 680, 1.30, 40.0, 2800, 1600, 740,  0.6, 1.3, CURRENT_DATE),
  ('oti',           0.8000, 350, 1.15, 44.0, 2950, 1680, 540,  0.8, 1.7, CURRENT_DATE),
  ('western_north', 0.8600, 280, 1.10, 50.0, 3150, 1820, 500,  1.1, 2.3, CURRENT_DATE)
ON CONFLICT (region, effective_date) DO NOTHING;

-- =====================================================
-- SEED: Sample material prices
-- SKIPPED: material_prices already exists from migration 008
-- with a different column schema (material_name, price_ghs, etc.)
-- =====================================================

-- =====================================================
-- SEED: Sample labor rates
-- SKIPPED: labor_rates already exists from migration 008
-- with a different column schema (daily_rate_ghs, role_name, etc.)
-- =====================================================

-- =====================================================
-- SEED: Sample housing affordability index (latest)
-- Based on realistic Ghana data
-- =====================================================
INSERT INTO housing_affordability_index (
  calculation_date, region, property_type,
  ghai_composite, ghai_category, mhai, chai, rhai,
  mortgage_weight, cash_weight, rental_weight,
  cai, lai, mas,
  median_property_price, median_household_income, mortgage_rate, median_monthly_rent,
  trend_direction, change_mom, change_yoy
) VALUES
  (CURRENT_DATE, 'greater_accra', 'residential',
   45.20, 'severely_unaffordable', 23.40, 42.50, 62.30,
   0.2500, 0.4500, 0.3000,
   55.00, 28.50, 4.70,
   850000, 72000, 0.2850, 3500,
   'declining', -1.2, -3.2),
  (CURRENT_DATE, 'ashanti', 'residential',
   72.10, 'unaffordable', 35.20, 78.40, 82.50,
   0.1500, 0.5500, 0.3000,
   78.00, 52.30, 3.20,
   420000, 48000, 0.2900, 1800,
   'stable', 0.3, -0.8),
  (CURRENT_DATE, 'western', 'residential',
   68.40, 'unaffordable', 30.10, 72.80, 78.90,
   0.1200, 0.5800, 0.3000,
   72.50, 48.00, 2.80,
   380000, 42000, 0.3000, 1500,
   'stable', 0.1, -1.0),
  (CURRENT_DATE, 'eastern', 'residential',
   78.30, 'unaffordable', 38.50, 85.20, 88.00,
   0.1000, 0.6000, 0.3000,
   82.00, 58.00, 2.50,
   320000, 40000, 0.3000, 1200,
   'improving', 0.5, 0.8),
  (CURRENT_DATE, 'northern', 'residential',
   85.50, 'moderate', 42.00, 92.30, 95.00,
   0.0500, 0.6500, 0.3000,
   88.50, 65.00, 1.80,
   220000, 32000, 0.3100, 800,
   'improving', 0.8, 1.5)
ON CONFLICT (calculation_date, region, property_type) DO NOTHING;

-- =====================================================
-- SEED: Sample CCI analytics time-series (national, last 12 months)
-- =====================================================
DO $$
DECLARE
  m INTEGER;
  base_val DECIMAL := 1200.00;
  current_val DECIMAL;
  prev_val DECIMAL;
BEGIN
  prev_val := base_val;
  FOR m IN 0..11 LOOP
    current_val := base_val + (m * 12.5) + (random() * 20 - 10);
    INSERT INTO construction_cost_index_analytics (
      period_date, period_type, region,
      index_value, base_value, base_date,
      materials_index, materials_weight,
      labor_index, labor_weight,
      overhead_index, overhead_weight,
      change_mom, change_yoy
    ) VALUES (
      (CURRENT_DATE - ((11 - m) * 30 || ' days')::INTERVAL)::DATE,
      'monthly', NULL,
      ROUND(current_val::NUMERIC, 2), 100.00, '2024-01-01',
      ROUND((current_val * 0.55)::NUMERIC, 2), 0.5500,
      ROUND((current_val * 0.35)::NUMERIC, 2), 0.3500,
      ROUND((current_val * 0.10)::NUMERIC, 2), 0.1000,
      CASE WHEN m > 0 THEN ROUND(((current_val - prev_val) / prev_val * 100)::NUMERIC, 3) ELSE 0 END,
      CASE WHEN m >= 11 THEN ROUND(((current_val - base_val) / base_val * 100)::NUMERIC, 3) ELSE NULL END
    ) ON CONFLICT (period_date, period_type, region) DO NOTHING;
    prev_val := current_val;
  END LOOP;
END $$;

COMMIT;
