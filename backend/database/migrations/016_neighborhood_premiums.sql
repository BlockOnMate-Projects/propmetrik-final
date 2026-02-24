-- Migration: 016_neighborhood_premiums
-- Description: Create neighborhood_premiums reference table for Ghana location adjustments
-- Purpose: Auto-apply location premiums in sales comparison (RICS/GhIS compliant)
-- Created: 2026-01-11

-- =====================================================
-- NEIGHBORHOOD PREMIUMS TABLE
-- =====================================================
-- Location premiums based on Ghana market research
-- Used by frontend AdjustmentGrid and Python valuation engine
-- Premiums are multipliers relative to baseline (1.00)

CREATE TABLE IF NOT EXISTS neighborhood_premiums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Location identification
  neighborhood VARCHAR(100) NOT NULL,
  region VARCHAR(50) NOT NULL DEFAULT 'greater_accra',
  city VARCHAR(100),
  district VARCHAR(100),
  
  -- Premium factors
  premium_factor DECIMAL(4,2) NOT NULL DEFAULT 1.00,
  
  -- Breakdown by property type (optional granularity)
  residential_premium DECIMAL(4,2),
  commercial_premium DECIMAL(4,2),
  land_premium DECIMAL(4,2),
  
  -- Market characteristics
  market_tier VARCHAR(20) DEFAULT 'secondary', -- prime_plus, prime, secondary, tertiary
  development_stage VARCHAR(30), -- mature, developing, emerging
  income_level VARCHAR(30), -- high, upper-middle, middle, lower-middle, low
  
  -- Data quality
  data_confidence VARCHAR(20) DEFAULT 'medium', -- high, medium, low
  sample_size INTEGER,
  last_updated_from VARCHAR(100), -- Source: market research, transaction data, etc.
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID,
  notes TEXT,
  
  -- Unique constraint on neighborhood + region
  UNIQUE (neighborhood, region)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_neighborhood_premiums_region ON neighborhood_premiums(region);
CREATE INDEX IF NOT EXISTS idx_neighborhood_premiums_tier ON neighborhood_premiums(market_tier);
CREATE INDEX IF NOT EXISTS idx_neighborhood_premiums_lookup ON neighborhood_premiums(neighborhood, region);

-- Comments
COMMENT ON TABLE neighborhood_premiums IS 'Location premium factors for sales comparison adjustments per GhIS/RICS guidance';
COMMENT ON COLUMN neighborhood_premiums.premium_factor IS 'Multiplier relative to baseline (1.00). E.g., 1.30 = 30% premium';
COMMENT ON COLUMN neighborhood_premiums.market_tier IS 'prime_plus: Top 5%, prime: Top 15%, secondary: Middle 50%, tertiary: Bottom 35%';

-- =====================================================
-- TENURE RISK ADJUSTMENTS TABLE
-- =====================================================
-- Ghana-specific land tenure risk adjustments
-- Per GhIS Practice: Different tenure types carry different risks

CREATE TABLE IF NOT EXISTS tenure_risk_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Tenure identification
  tenure_type VARCHAR(50) NOT NULL UNIQUE,
  tenure_label VARCHAR(100) NOT NULL,
  
  -- Risk adjustment (negative percentage, e.g., -15 for 15% discount)
  risk_adjustment_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  
  -- Risk classification
  risk_level VARCHAR(20) DEFAULT 'medium', -- low, medium, high, very_high
  
  -- Details
  description TEXT,
  documentation_required TEXT[],
  typical_issues TEXT[],
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID
);

-- Index
CREATE INDEX IF NOT EXISTS idx_tenure_risk_type ON tenure_risk_adjustments(tenure_type);

-- Comments
COMMENT ON TABLE tenure_risk_adjustments IS 'Land tenure risk adjustments for Ghana market per GhIS guidance';
COMMENT ON COLUMN tenure_risk_adjustments.risk_adjustment_pct IS 'Percentage adjustment. E.g., -15 means 15% discount for title risk';

-- =====================================================
-- TRIGGER: Auto-update updated_at
-- =====================================================

CREATE OR REPLACE FUNCTION update_premium_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_neighborhood_premium_updated ON neighborhood_premiums;
CREATE TRIGGER trg_neighborhood_premium_updated
  BEFORE UPDATE ON neighborhood_premiums
  FOR EACH ROW
  EXECUTE FUNCTION update_premium_timestamp();

DROP TRIGGER IF EXISTS trg_tenure_risk_updated ON tenure_risk_adjustments;
CREATE TRIGGER trg_tenure_risk_updated
  BEFORE UPDATE ON tenure_risk_adjustments
  FOR EACH ROW
  EXECUTE FUNCTION update_premium_timestamp();

-- =====================================================
-- VIEW: Neighborhood Premium Lookup (Fast Access)
-- =====================================================

CREATE OR REPLACE VIEW v_neighborhood_premium_lookup AS
SELECT 
  neighborhood,
  region,
  premium_factor,
  residential_premium,
  commercial_premium,
  land_premium,
  market_tier,
  -- Calculate adjustment percentage (for UI display)
  ROUND((premium_factor - 1.0) * 100, 1) AS adjustment_pct
FROM neighborhood_premiums
ORDER BY region, premium_factor DESC;

COMMENT ON VIEW v_neighborhood_premium_lookup IS 
'Quick lookup view for neighborhood premiums with calculated adjustment percentages';

-- =====================================================
-- FUNCTION: Get Neighborhood Premium
-- =====================================================

CREATE OR REPLACE FUNCTION get_neighborhood_premium(
  p_neighborhood VARCHAR,
  p_region VARCHAR DEFAULT 'greater_accra',
  p_property_type VARCHAR DEFAULT 'residential'
)
RETURNS DECIMAL AS $$
DECLARE
  v_premium DECIMAL;
  v_type_premium DECIMAL;
BEGIN
  -- Try exact match first
  SELECT 
    CASE 
      WHEN p_property_type = 'commercial' AND commercial_premium IS NOT NULL THEN commercial_premium
      WHEN p_property_type = 'land' AND land_premium IS NOT NULL THEN land_premium
      WHEN p_property_type = 'residential' AND residential_premium IS NOT NULL THEN residential_premium
      ELSE premium_factor
    END
  INTO v_premium
  FROM neighborhood_premiums
  WHERE LOWER(neighborhood) = LOWER(p_neighborhood)
    AND LOWER(region) = LOWER(p_region);
  
  -- If not found, try partial match
  IF v_premium IS NULL THEN
    SELECT 
      COALESCE(
        CASE 
          WHEN p_property_type = 'commercial' THEN commercial_premium
          WHEN p_property_type = 'land' THEN land_premium
          ELSE residential_premium
        END,
        premium_factor
      )
    INTO v_premium
    FROM neighborhood_premiums
    WHERE LOWER(p_neighborhood) LIKE '%' || LOWER(neighborhood) || '%'
       OR LOWER(neighborhood) LIKE '%' || LOWER(p_neighborhood) || '%'
    ORDER BY LENGTH(neighborhood) DESC
    LIMIT 1;
  END IF;
  
  -- Return 1.0 if no premium found (neutral)
  RETURN COALESCE(v_premium, 1.0);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_neighborhood_premium IS 
'Get location premium factor for a neighborhood. Returns 1.0 if not found.';

-- =====================================================
-- FUNCTION: Get Tenure Risk Adjustment
-- =====================================================

CREATE OR REPLACE FUNCTION get_tenure_risk_adjustment(
  p_tenure_type VARCHAR
)
RETURNS DECIMAL AS $$
DECLARE
  v_adjustment DECIMAL;
BEGIN
  SELECT risk_adjustment_pct
  INTO v_adjustment
  FROM tenure_risk_adjustments
  WHERE LOWER(tenure_type) = LOWER(p_tenure_type);
  
  -- Return 0 if not found (no adjustment)
  RETURN COALESCE(v_adjustment, 0);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_tenure_risk_adjustment IS 
'Get title risk adjustment percentage for a tenure type. Returns 0 if not found.';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
