-- =====================================================
-- Migration 157: Valuation Analytics Phase 2
--
-- Extends the analytics layer with valuation-specific
-- aggregation tables for Section 3 (Valuation Analytics).
--
-- New tables:
--   1. valuer_performance_snapshots   — Per-valuer periodic metrics
--   2. method_performance_history     — Method accuracy/usage trends
--   3. floor_plan_analytics           — Aggregated floor plan metrics
--   4. market_relative_analytics      — Valuation vs market position
--
-- Also adds missing columns to valuation_analytics_snapshots
-- for richer breakdowns (by_purpose, by_type, drc counts, etc.)
-- =====================================================

BEGIN;

-- =====================================================
-- 1. VALUER PERFORMANCE SNAPSHOTS
-- Per-valuer periodic metrics for leaderboard/benchmarking.
-- Aggregated from raw valuations + reconciliations tables.
-- =====================================================
CREATE TABLE IF NOT EXISTS valuer_performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  period_type VARCHAR(20) NOT NULL DEFAULT 'monthly',

  -- Valuer identification
  valuer_id UUID NOT NULL,
  valuer_name VARCHAR(200),
  organization_id UUID,
  organization_name VARCHAR(200),

  -- Volume metrics
  total_valuations INTEGER NOT NULL DEFAULT 0,
  completed_valuations INTEGER NOT NULL DEFAULT 0,
  by_property_type JSONB DEFAULT '{}'::jsonb,
  -- Structure: {"residential": 12, "commercial": 5, "land": 3}
  by_region JSONB DEFAULT '{}'::jsonb,
  -- Structure: {"greater_accra": 8, "ashanti": 7}
  by_purpose JSONB DEFAULT '{}'::jsonb,
  -- Structure: {"mortgage": 12, "sale": 5, "insurance": 3}
  total_value_ghs DECIMAL(18,2) DEFAULT 0,

  -- Quality metrics
  avg_confidence_score DECIMAL(5,3),
  avg_time_to_complete_days DECIMAL(8,2),
  override_rate DECIMAL(5,4),
  avg_comparables_used DECIMAL(4,2),

  -- Method preferences
  primary_method_distribution JSONB DEFAULT '{}'::jsonb,
  -- Structure: {"sales_comparison": 0.60, "cost_approach": 0.25, ...}

  -- Peer comparison percentiles (0-100)
  percentile_volume INTEGER,
  percentile_quality INTEGER,
  percentile_speed INTEGER,
  percentile_accuracy INTEGER,

  -- Accuracy vs resale (when available)
  accuracy_vs_resale DECIMAL(6,3),
  accuracy_sample_size INTEGER DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(snapshot_date, period_type, valuer_id)
);

CREATE INDEX IF NOT EXISTS idx_vps_valuer ON valuer_performance_snapshots(valuer_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_vps_date ON valuer_performance_snapshots(snapshot_date DESC, period_type);
CREATE INDEX IF NOT EXISTS idx_vps_org ON valuer_performance_snapshots(organization_id, snapshot_date DESC);

-- =====================================================
-- 2. METHOD PERFORMANCE HISTORY
-- Tracks per-method accuracy and usage over time.
-- Aggregated from valuations + reconciliations.
-- =====================================================
CREATE TABLE IF NOT EXISTS method_performance_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  period_type VARCHAR(20) NOT NULL DEFAULT 'monthly',
  region VARCHAR(50),
  property_type VARCHAR(50),

  -- Method identification
  method_name VARCHAR(50) NOT NULL,
  -- Values: sales_comparison, cost_approach, income_approach, residual_method, profits_method, drc_method

  -- Usage metrics
  usage_count INTEGER NOT NULL DEFAULT 0,
  as_primary_count INTEGER NOT NULL DEFAULT 0,
  avg_weight DECIMAL(5,4),

  -- Confidence metrics
  avg_confidence DECIMAL(5,3),
  min_confidence DECIMAL(5,3),
  max_confidence DECIMAL(5,3),
  confidence_stddev DECIMAL(5,3),

  -- Value metrics
  avg_value DECIMAL(15,2),
  median_value DECIMAL(15,2),
  value_range_low DECIMAL(15,2),
  value_range_high DECIMAL(15,2),

  -- Accuracy (when resale data available)
  accuracy_vs_actual DECIMAL(6,3),
  accuracy_sample_size INTEGER DEFAULT 0,
  mape DECIMAL(6,4),

  -- Comparable metrics (for sales_comparison)
  avg_comparables_used DECIMAL(4,2),
  avg_similarity_score DECIMAL(5,3),
  avg_adjustment_pct DECIMAL(6,3),
  avg_comparable_freshness_days DECIMAL(8,2),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(snapshot_date, period_type, region, property_type, method_name)
);

CREATE INDEX IF NOT EXISTS idx_mph_method ON method_performance_history(method_name, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_mph_region ON method_performance_history(region, snapshot_date DESC);

-- =====================================================
-- 3. FLOOR PLAN ANALYTICS
-- Aggregated floor plan and measurement data by region/type.
-- Sourced from valuation_floor_plans + valuation_floor_plan_rooms.
-- =====================================================
CREATE TABLE IF NOT EXISTS floor_plan_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  period_type VARCHAR(20) NOT NULL DEFAULT 'monthly',
  region VARCHAR(50),
  property_type VARCHAR(50),

  -- Sample size
  floor_plan_count INTEGER NOT NULL DEFAULT 0,
  room_count INTEGER NOT NULL DEFAULT 0,

  -- Area metrics
  avg_gfa_sqm DECIMAL(10,2),
  median_gfa_sqm DECIMAL(10,2),
  min_gfa_sqm DECIMAL(10,2),
  max_gfa_sqm DECIMAL(10,2),
  avg_nia_sqm DECIMAL(10,2),
  avg_efficiency_ratio DECIMAL(5,4),
  -- efficiency_ratio = NIA / GFA

  -- Room composition
  avg_bedrooms DECIMAL(4,2),
  avg_bathrooms DECIMAL(4,2),
  avg_room_size_sqm JSONB DEFAULT '{}'::jsonb,
  -- Structure: {"bedroom": 14.2, "bathroom": 5.1, "kitchen": 9.5, ...}

  -- Ghana Building Code compliance
  code_compliant_rate DECIMAL(5,4),
  common_violations JSONB DEFAULT '[]'::jsonb,
  -- Structure: [{"type": "bedroom_too_small", "count": 12, "pct": 0.08}]

  -- Size distribution buckets (for histograms)
  gfa_distribution JSONB DEFAULT '[]'::jsonb,
  -- Structure: [{"range": "0-50", "count": 5}, {"range": "50-100", "count": 12}, ...]

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(snapshot_date, period_type, region, property_type)
);

CREATE INDEX IF NOT EXISTS idx_fpa_date ON floor_plan_analytics(snapshot_date DESC, region);

-- =====================================================
-- 4. MARKET RELATIVE ANALYTICS
-- Valuation position relative to market conditions.
-- =====================================================
CREATE TABLE IF NOT EXISTS market_relative_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  period_type VARCHAR(20) NOT NULL DEFAULT 'monthly',
  region VARCHAR(50) NOT NULL,
  property_type VARCHAR(50),

  -- Price position
  valuations_median DECIMAL(15,2),
  market_median DECIMAL(15,2),
  premium_discount_pct DECIMAL(6,3),
  -- positive = valuations above market, negative = below

  -- Distribution buckets  
  distribution JSONB DEFAULT '[]'::jsonb,
  -- Structure: [{"bucket": "-20% to -10%", "count": 5}, {"bucket": "-10% to 0%", "count": 12}, ...]

  -- Trend alignment
  valuation_trend_3m DECIMAL(6,3),
  market_trend_3m DECIMAL(6,3),
  correlation DECIMAL(5,4),
  lag_days INTEGER,

  -- Outlier detection
  high_outlier_count INTEGER DEFAULT 0,
  low_outlier_count INTEGER DEFAULT 0,
  outlier_rate DECIMAL(5,4),
  -- outlier_rate = (high + low) / total

  -- Sample size
  valuation_count INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(snapshot_date, period_type, region, property_type)
);

CREATE INDEX IF NOT EXISTS idx_mra_region ON market_relative_analytics(region, snapshot_date DESC);

-- =====================================================
-- 5. ADD COLUMNS TO valuation_analytics_snapshots
-- Enrich the Phase 1 table with additional breakdowns.
-- =====================================================

-- Purpose breakdown
ALTER TABLE valuation_analytics_snapshots
  ADD COLUMN IF NOT EXISTS by_purpose JSONB DEFAULT '{}'::jsonb;
-- Structure: {"mortgage": 55, "sale": 20, "insurance": 15, ...}

-- Valuation type breakdown
ALTER TABLE valuation_analytics_snapshots
  ADD COLUMN IF NOT EXISTS by_valuation_type JSONB DEFAULT '{}'::jsonb;
-- Structure: {"professional": 80, "avm": 120, "desktop": 15}

-- Additional method counts
ALTER TABLE valuation_analytics_snapshots
  ADD COLUMN IF NOT EXISTS residual_count INTEGER;
ALTER TABLE valuation_analytics_snapshots
  ADD COLUMN IF NOT EXISTS residual_avg_confidence DECIMAL(5,2);
ALTER TABLE valuation_analytics_snapshots
  ADD COLUMN IF NOT EXISTS drc_count INTEGER;
ALTER TABLE valuation_analytics_snapshots
  ADD COLUMN IF NOT EXISTS drc_avg_confidence DECIMAL(5,2);

-- Value distribution
ALTER TABLE valuation_analytics_snapshots
  ADD COLUMN IF NOT EXISTS value_p25 DECIMAL(15,2);
ALTER TABLE valuation_analytics_snapshots
  ADD COLUMN IF NOT EXISTS value_p75 DECIMAL(15,2);
ALTER TABLE valuation_analytics_snapshots
  ADD COLUMN IF NOT EXISTS value_stddev DECIMAL(15,2);

-- Reconciliation metrics
ALTER TABLE valuation_analytics_snapshots
  ADD COLUMN IF NOT EXISTS avg_method_spread_pct DECIMAL(6,3);
ALTER TABLE valuation_analytics_snapshots
  ADD COLUMN IF NOT EXISTS avg_confidence_score DECIMAL(5,3);

COMMIT;
