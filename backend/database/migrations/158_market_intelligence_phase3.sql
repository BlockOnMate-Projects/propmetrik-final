-- =====================================================
-- Migration 158: Market Intelligence Phase 3
-- Purpose: Extends analytics for property price indices, rental markets,
--          investment scoring, and market supply/demand — Analytics.md Section 4
-- =====================================================

-- =====================================================
-- 1. RENTAL YIELD ANALYTICS (Section 4.3)
-- Aggregated rental yield metrics by region/type
-- =====================================================
CREATE TABLE IF NOT EXISTS rental_yield_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region VARCHAR(50) NOT NULL,
  property_type VARCHAR(50) NOT NULL DEFAULT 'residential',
  period_date DATE NOT NULL DEFAULT CURRENT_DATE,
  period_type VARCHAR(20) NOT NULL DEFAULT 'monthly',

  -- Rental price stats
  sample_size INTEGER DEFAULT 0,
  median_monthly_rent DECIMAL(14,2),
  avg_monthly_rent DECIMAL(14,2),
  avg_rent_per_sqm DECIMAL(10,2),
  rent_change_mom DECIMAL(6,3),
  rent_change_yoy DECIMAL(6,3),
  rent_range_min DECIMAL(14,2),
  rent_range_max DECIMAL(14,2),

  -- Yield metrics (from cap rate / income data)
  avg_gross_yield DECIMAL(6,4),
  avg_net_yield DECIMAL(6,4),
  yield_trend_12m DECIMAL(6,4),

  -- Market conditions
  vacancy_rate_estimate DECIMAL(5,4),
  avg_lease_term_months DECIMAL(6,2),
  avg_advance_months DECIMAL(4,2),
  avg_days_on_market DECIMAL(6,2),

  -- By bedrooms breakdown (JSONB)
  rent_by_bedrooms JSONB DEFAULT '{}',
  -- Structure: {"1": {"avg": 1500, "median": 1400, "count": 20}, "2": {...}, ...}

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(region, property_type, period_date, period_type)
);

CREATE INDEX IF NOT EXISTS idx_rya_region_period
ON rental_yield_analytics(region, period_date DESC);

CREATE INDEX IF NOT EXISTS idx_rya_property_type
ON rental_yield_analytics(property_type, period_date DESC);

-- =====================================================
-- 2. INVESTMENT OPPORTUNITY METRICS (Section 4.4)
-- Scored investment hotspots per region/type
-- =====================================================
CREATE TABLE IF NOT EXISTS investment_opportunity_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region VARCHAR(50) NOT NULL,
  property_type VARCHAR(50) NOT NULL DEFAULT 'residential',
  period_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Yield metrics
  avg_cap_rate DECIMAL(6,4),
  cap_rate_trend_12m DECIMAL(6,4),
  risk_premium_vs_tbill DECIMAL(6,4),

  -- Growth indicators
  price_growth_12m DECIMAL(6,3),
  price_growth_36m DECIMAL(6,3),
  rental_growth_12m DECIMAL(6,3),
  transaction_volume_trend DECIMAL(6,3),

  -- Supply/demand signals
  absorption_rate DECIMAL(6,4),
  inventory_months DECIMAL(6,2),
  days_on_market_trend DECIMAL(6,3),
  new_listing_trend DECIMAL(6,3),

  -- Composite opportunity score (0-100)
  opportunity_score DECIMAL(5,2) DEFAULT 0,
  opportunity_factors JSONB DEFAULT '[]',
  -- Structure: [{"factor": "price_growth", "weight": 0.25, "value": 0.8, "contribution": 20}, ...]

  -- Risk scoring
  risk_score DECIMAL(5,2) DEFAULT 50,  -- 0 = low risk, 100 = high risk
  risk_factors JSONB DEFAULT '[]',

  -- Infrastructure/development impact
  infrastructure_score DECIMAL(5,2),
  development_pipeline_count INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(region, property_type, period_date)
);

CREATE INDEX IF NOT EXISTS idx_iom_opportunity
ON investment_opportunity_metrics(opportunity_score DESC);

CREATE INDEX IF NOT EXISTS idx_iom_region
ON investment_opportunity_metrics(region, period_date DESC);

-- =====================================================
-- 3. EXTEND property_price_index WITH real/nominal COLUMNS
-- (migration 156 created it — add Phase 3 columns)
-- =====================================================
DO $$
BEGIN
  -- Real (inflation-adjusted) index
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'property_price_index' AND column_name = 'real_index') THEN
    ALTER TABLE property_price_index ADD COLUMN real_index DECIMAL(10,2);
  END IF;

  -- Nominal index (same as index_value, for symmetry)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'property_price_index' AND column_name = 'nominal_index') THEN
    ALTER TABLE property_price_index ADD COLUMN nominal_index DECIMAL(10,2);
  END IF;

  -- Sub-indices JSONB
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'property_price_index' AND column_name = 'sub_indices') THEN
    ALTER TABLE property_price_index ADD COLUMN sub_indices JSONB DEFAULT '{}';
    -- Structure: {"new_builds": 102.5, "resales": 99.1, "rental": 105.3}
  END IF;

  -- Period type for aggregation granularity
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'property_price_index' AND column_name = 'period_type') THEN
    ALTER TABLE property_price_index ADD COLUMN period_type VARCHAR(20) DEFAULT 'monthly';
  END IF;

  -- Volume / transaction total value for weighting
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'property_price_index' AND column_name = 'total_transaction_value') THEN
    ALTER TABLE property_price_index ADD COLUMN total_transaction_value DECIMAL(18,2);
  END IF;
END $$;

-- =====================================================
-- 4. EXTEND market_activity_metrics WITH PHASE 3 COLUMNS
-- =====================================================
DO $$
BEGIN
  -- Rental-specific metrics
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'market_activity_metrics' AND column_name = 'rental_transaction_count') THEN
    ALTER TABLE market_activity_metrics ADD COLUMN rental_transaction_count INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'market_activity_metrics' AND column_name = 'avg_rental_value') THEN
    ALTER TABLE market_activity_metrics ADD COLUMN avg_rental_value DECIMAL(14,2);
  END IF;

  -- Price distribution buckets
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'market_activity_metrics' AND column_name = 'price_distribution') THEN
    ALTER TABLE market_activity_metrics ADD COLUMN price_distribution JSONB DEFAULT '{}';
    -- Structure: {"under_200k": 15, "200k_400k": 28, "400k_600k": 32, "600k_1m": 18, "over_1m": 7}
  END IF;

  -- Market temperature / sentiment
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'market_activity_metrics' AND column_name = 'market_temperature') THEN
    ALTER TABLE market_activity_metrics ADD COLUMN market_temperature VARCHAR(20);
    -- 'hot', 'warm', 'balanced', 'cool', 'cold'
  END IF;

  -- Supply/demand ratio
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'market_activity_metrics' AND column_name = 'supply_demand_ratio') THEN
    ALTER TABLE market_activity_metrics ADD COLUMN supply_demand_ratio DECIMAL(6,4);
  END IF;
END $$;

-- =====================================================
-- 5. MARKET REPORT SNAPSHOTS (Section 4 — Custom Reports)
-- Store generated market intelligence reports
-- =====================================================
CREATE TABLE IF NOT EXISTS market_report_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type VARCHAR(50) NOT NULL,  -- 'monthly_summary', 'quarterly_review', 'investment_brief', 'rental_digest'
  region VARCHAR(50),                -- NULL = national
  property_type VARCHAR(50),         -- NULL = all types
  period_date DATE NOT NULL,

  -- Report content
  title VARCHAR(500),
  summary TEXT,
  key_metrics JSONB DEFAULT '{}',
  sections JSONB DEFAULT '[]',
  -- Structure: [{"title": "...", "content": "...", "charts": [...]}]

  -- Metadata
  generated_by VARCHAR(50) DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mrs_type_period
ON market_report_snapshots(report_type, period_date DESC);

CREATE INDEX IF NOT EXISTS idx_mrs_region
ON market_report_snapshots(region, period_date DESC);
