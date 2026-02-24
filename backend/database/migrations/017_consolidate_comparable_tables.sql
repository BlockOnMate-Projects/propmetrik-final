-- Migration: 017_consolidate_comparable_tables
-- Description: Consolidate comparable tables to use basket pattern exclusively
-- Phase 4.3: Data Quality & Monitoring - Table Consolidation
-- Created: 2024-01-18
-- Updated: 2025-01-14 - Fixed to match actual schema from 014_valuation_engine.sql and 016_valuation_gaps.sql

-- =====================================================
-- ANALYSIS:
-- There are 3 comparable-related tables:
-- 1. valuation_comparables - direct link to valuations (from 014_valuation_engine.sql)
-- 2. valuation_comparable_baskets - basket metadata (from 016_valuation_gaps.sql)
-- 3. valuation_basket_comparables - comparables organized in baskets (from 016_valuation_gaps.sql)
--
-- DECISION: Keep both patterns but clarify usage:
-- - valuation_comparables: For simple/direct comparable selection
-- - valuation_basket_comparables: For organized basket workflows
--
-- Add missing fields to both for consistency
-- =====================================================

-- Add evidence tracking fields to valuation_basket_comparables
DO $$
BEGIN
  -- Evidence type
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'valuation_basket_comparables' 
                 AND column_name = 'evidence_type') THEN
    ALTER TABLE valuation_basket_comparables 
    ADD COLUMN evidence_type VARCHAR(30) DEFAULT 'listing';
    COMMENT ON COLUMN valuation_basket_comparables.evidence_type IS 
      'Evidence classification: listing, delisted, contributed, bank_collateral';
  END IF;
  
  -- Asking price (original listing price)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'valuation_basket_comparables' 
                 AND column_name = 'asking_price') THEN
    ALTER TABLE valuation_basket_comparables 
    ADD COLUMN asking_price DECIMAL(18,2);
    COMMENT ON COLUMN valuation_basket_comparables.asking_price IS 
      'Original asking/listing price before adjustments';
  END IF;
  
  -- Listing adjustment percentage
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'valuation_basket_comparables' 
                 AND column_name = 'listing_adjustment_pct') THEN
    ALTER TABLE valuation_basket_comparables 
    ADD COLUMN listing_adjustment_pct DECIMAL(8,4);
    COMMENT ON COLUMN valuation_basket_comparables.listing_adjustment_pct IS 
      'Discount from asking to achieved (-0.15 = 15% below asking)';
  END IF;
  
  -- Estimated transaction value
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'valuation_basket_comparables' 
                 AND column_name = 'estimated_value') THEN
    ALTER TABLE valuation_basket_comparables 
    ADD COLUMN estimated_value DECIMAL(18,2);
    COMMENT ON COLUMN valuation_basket_comparables.estimated_value IS 
      'asking_price * (1 + listing_adjustment_pct)';
  END IF;
  
  -- Ghana-specific: Tenure type
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'valuation_basket_comparables' 
                 AND column_name = 'tenure_type') THEN
    ALTER TABLE valuation_basket_comparables 
    ADD COLUMN tenure_type VARCHAR(50);
  END IF;
  
  -- Tenure risk adjustment
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'valuation_basket_comparables' 
                 AND column_name = 'tenure_risk_adjustment') THEN
    ALTER TABLE valuation_basket_comparables 
    ADD COLUMN tenure_risk_adjustment DECIMAL(8,4);
  END IF;
  
  -- Neighborhood
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'valuation_basket_comparables' 
                 AND column_name = 'neighborhood') THEN
    ALTER TABLE valuation_basket_comparables 
    ADD COLUMN neighborhood VARCHAR(100);
  END IF;
  
  -- Neighborhood premium
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'valuation_basket_comparables' 
                 AND column_name = 'neighborhood_premium') THEN
    ALTER TABLE valuation_basket_comparables 
    ADD COLUMN neighborhood_premium DECIMAL(8,4);
  END IF;
  
  -- Similarity score for basket comparables
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'valuation_basket_comparables' 
                 AND column_name = 'similarity_score') THEN
    ALTER TABLE valuation_basket_comparables 
    ADD COLUMN similarity_score DECIMAL(4,3);
  END IF;
END $$;

-- Add missing columns to valuation_comparable_baskets for summary tracking
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'valuation_comparable_baskets' 
                 AND column_name = 'evidence_summary') THEN
    ALTER TABLE valuation_comparable_baskets 
    ADD COLUMN evidence_summary JSONB DEFAULT '{}';
    COMMENT ON COLUMN valuation_comparable_baskets.evidence_summary IS 
      'Summary of evidence types in basket: {listing: 5, delisted: 2}';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'valuation_comparable_baskets' 
                 AND column_name = 'listing_adjustment_applied') THEN
    ALTER TABLE valuation_comparable_baskets 
    ADD COLUMN listing_adjustment_applied BOOLEAN DEFAULT FALSE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'valuation_comparable_baskets' 
                 AND column_name = 'avg_listing_adjustment') THEN
    ALTER TABLE valuation_comparable_baskets 
    ADD COLUMN avg_listing_adjustment DECIMAL(8,4);
    COMMENT ON COLUMN valuation_comparable_baskets.avg_listing_adjustment IS 
      'Average asking-to-achieved adjustment applied across basket';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'valuation_comparable_baskets' 
                 AND column_name = 'tenure_adjusted') THEN
    ALTER TABLE valuation_comparable_baskets 
    ADD COLUMN tenure_adjusted BOOLEAN DEFAULT FALSE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'valuation_comparable_baskets' 
                 AND column_name = 'avg_tenure_adjustment') THEN
    ALTER TABLE valuation_comparable_baskets 
    ADD COLUMN avg_tenure_adjustment DECIMAL(8,4);
  END IF;
  
  -- Add avg_price_per_sqm if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'valuation_comparable_baskets' 
                 AND column_name = 'avg_price_per_sqm') THEN
    ALTER TABLE valuation_comparable_baskets 
    ADD COLUMN avg_price_per_sqm DECIMAL(18,2);
  END IF;
END $$;

-- Add missing columns to valuation_comparables for Ghana-specific fields
DO $$
BEGIN
  -- Evidence type
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'valuation_comparables' 
                 AND column_name = 'evidence_type') THEN
    ALTER TABLE valuation_comparables 
    ADD COLUMN evidence_type VARCHAR(30) DEFAULT 'listing';
  END IF;
  
  -- Asking price
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'valuation_comparables' 
                 AND column_name = 'asking_price') THEN
    ALTER TABLE valuation_comparables 
    ADD COLUMN asking_price DECIMAL(18,2);
  END IF;
  
  -- Listing adjustment percentage
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'valuation_comparables' 
                 AND column_name = 'listing_adjustment_pct') THEN
    ALTER TABLE valuation_comparables 
    ADD COLUMN listing_adjustment_pct DECIMAL(8,4);
  END IF;
  
  -- Estimated value
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'valuation_comparables' 
                 AND column_name = 'estimated_value') THEN
    ALTER TABLE valuation_comparables 
    ADD COLUMN estimated_value DECIMAL(18,2);
  END IF;
  
  -- Tenure type
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'valuation_comparables' 
                 AND column_name = 'tenure_type') THEN
    ALTER TABLE valuation_comparables 
    ADD COLUMN tenure_type VARCHAR(50);
  END IF;
  
  -- Tenure risk adjustment
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'valuation_comparables' 
                 AND column_name = 'tenure_risk_adjustment') THEN
    ALTER TABLE valuation_comparables 
    ADD COLUMN tenure_risk_adjustment DECIMAL(8,4);
  END IF;
  
  -- Neighborhood
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'valuation_comparables' 
                 AND column_name = 'neighborhood') THEN
    ALTER TABLE valuation_comparables 
    ADD COLUMN neighborhood VARCHAR(100);
  END IF;
  
  -- Neighborhood premium
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'valuation_comparables' 
                 AND column_name = 'neighborhood_premium') THEN
    ALTER TABLE valuation_comparables 
    ADD COLUMN neighborhood_premium DECIMAL(8,4);
  END IF;
END $$;

-- Create additional indexes for performance
CREATE INDEX IF NOT EXISTS idx_basket_comparables_evidence 
  ON valuation_basket_comparables(evidence_type);
CREATE INDEX IF NOT EXISTS idx_basket_comparables_tenure 
  ON valuation_basket_comparables(tenure_type);

-- Drop and recreate the unified view for comparable analysis across both patterns
-- (DROP is needed because column types may be changing)
DROP VIEW IF EXISTS v_all_comparables CASCADE;
CREATE VIEW v_all_comparables AS
-- From valuation_comparables (direct pattern - uses columns from 014_valuation_engine.sql)
SELECT 
  'direct' AS source_pattern,
  vc.id,
  vc.valuation_id,
  NULL::UUID AS basket_id,
  NULL::VARCHAR AS basket_name,
  vc.comparable_property_id,
  p.title AS property_title,
  p.address_street,
  p.address_city,
  p.region,
  p.property_type,
  p.transaction_type,
  p.price AS original_price,
  p.price_currency,
  p.bedrooms,
  p.bathrooms,
  p.built_area_sqm,
  p.land_area_sqm,
  p.year_built,
  p.condition,
  p.latitude,
  p.longitude,
  p.data_source,
  p.updated_at AS property_updated_at,
  p.status AS listing_status,
  p.sold_at,
  -- Use COALESCE to handle columns that may not exist yet
  vc.evidence_type,
  vc.asking_price,
  vc.listing_adjustment_pct,
  vc.estimated_value,
  vc.tenure_type,
  vc.tenure_risk_adjustment,
  vc.neighborhood,
  vc.neighborhood_premium,
  vc.similarity_score,
  vc.adjustments,
  vc.adjusted_price,
  vc.weight,
  vc.is_excluded,
  vc.exclusion_reason
FROM valuation_comparables vc
LEFT JOIN properties p ON vc.comparable_property_id = p.id
UNION ALL
-- From valuation_basket_comparables (basket pattern - uses columns from 016_valuation_gaps.sql)
SELECT 
  'basket' AS source_pattern,
  vbc.id,
  vcb.valuation_id,
  vbc.basket_id,
  vcb.basket_name,
  vbc.comparable_property_id,
  p.title AS property_title,
  p.address_street,
  p.address_city,
  p.region,
  p.property_type,
  p.transaction_type,
  p.price AS original_price,
  p.price_currency,
  p.bedrooms,
  p.bathrooms,
  p.built_area_sqm,
  p.land_area_sqm,
  p.year_built,
  p.condition,
  p.latitude,
  p.longitude,
  p.data_source,
  p.updated_at AS property_updated_at,
  p.status AS listing_status,
  p.sold_at,
  vbc.evidence_type,
  vbc.asking_price,
  vbc.listing_adjustment_pct,
  vbc.estimated_value,
  vbc.tenure_type,
  vbc.tenure_risk_adjustment,
  vbc.neighborhood,
  vbc.neighborhood_premium,
  vbc.similarity_score,
  vbc.adjustments_summary AS adjustments,
  vbc.adjusted_sale_price AS adjusted_price,
  vbc.weight,
  vbc.is_excluded,
  vbc.exclusion_reason
FROM valuation_basket_comparables vbc
JOIN valuation_comparable_baskets vcb ON vbc.basket_id = vcb.id
LEFT JOIN properties p ON vbc.comparable_property_id = p.id;

-- Create view for basket analysis with evidence summary
-- Using actual columns from 016_valuation_gaps.sql: avg_adjusted_value, not indicated_value
DROP VIEW IF EXISTS v_basket_analysis CASCADE;
CREATE VIEW v_basket_analysis AS
SELECT 
  vcb.id AS basket_id,
  vcb.valuation_id,
  vcb.basket_name,
  vcb.is_primary,
  vcb.avg_adjusted_value AS indicated_value,  -- Map avg_adjusted_value to indicated_value
  vcb.avg_price_per_sqm,
  vcb.evidence_summary,
  vcb.listing_adjustment_applied,
  vcb.avg_listing_adjustment,
  vcb.tenure_adjusted,
  vcb.avg_tenure_adjustment,
  vcb.comparable_count,
  vcb.median_adjusted_value,
  vcb.value_range_low,
  vcb.value_range_high,
  vcb.coefficient_of_variation,
  vcb.created_at,
  vcb.updated_at,
  -- Calculated metrics
  (SELECT COUNT(*) FROM valuation_basket_comparables WHERE basket_id = vcb.id AND is_excluded = FALSE) AS active_comparables,
  (SELECT COUNT(*) FROM valuation_basket_comparables WHERE basket_id = vcb.id AND is_excluded = TRUE) AS excluded_comparables,
  (SELECT jsonb_object_agg(COALESCE(evidence_type, 'listing'), cnt) 
   FROM (SELECT evidence_type, COUNT(*) as cnt 
         FROM valuation_basket_comparables 
         WHERE basket_id = vcb.id AND is_excluded = FALSE 
         GROUP BY evidence_type) e) AS calculated_evidence_summary
FROM valuation_comparable_baskets vcb;

-- Function to get evidence type summary for a basket
CREATE OR REPLACE FUNCTION get_basket_evidence_summary(p_basket_id UUID)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_object_agg(evidence_type, cnt)
  INTO result
  FROM (
    SELECT 
      COALESCE(evidence_type, 'listing') AS evidence_type,
      COUNT(*) AS cnt
    FROM valuation_basket_comparables
    WHERE basket_id = p_basket_id AND is_excluded = FALSE
    GROUP BY evidence_type
  ) AS evidence_counts;
  
  RETURN COALESCE(result, '{}'::JSONB);
END;
$$ LANGUAGE plpgsql;

-- Function to calculate weighted average value for a basket
CREATE OR REPLACE FUNCTION calculate_basket_weighted_value(p_basket_id UUID)
RETURNS TABLE(
  indicated_value DECIMAL(18,2),
  weighted_price_per_sqm DECIMAL(18,2),
  total_comparables INTEGER,
  evidence_summary JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    -- Use adjusted_sale_price or estimated_value, whichever is available
    (SUM(COALESCE(vbc.estimated_value, vbc.adjusted_sale_price, vbc.raw_sale_price) * vbc.weight) 
      / NULLIF(SUM(vbc.weight), 0))::DECIMAL(18,2) AS indicated_value,
    (SUM(
      CASE WHEN p.built_area_sqm > 0 
        THEN (COALESCE(vbc.estimated_value, vbc.adjusted_sale_price, vbc.raw_sale_price) / p.built_area_sqm) * vbc.weight 
        ELSE 0 
      END
    ) / NULLIF(SUM(CASE WHEN p.built_area_sqm > 0 THEN vbc.weight ELSE 0 END), 0))::DECIMAL(18,2) AS weighted_price_per_sqm,
    COUNT(*)::INTEGER AS total_comparables,
    get_basket_evidence_summary(p_basket_id) AS evidence_summary
  FROM valuation_basket_comparables vbc
  LEFT JOIN properties p ON vbc.comparable_property_id = p.id
  WHERE vbc.basket_id = p_basket_id 
    AND vbc.is_excluded = FALSE;
END;
$$ LANGUAGE plpgsql;

-- Add comments documenting the pattern
COMMENT ON TABLE valuation_comparables IS 
'Direct comparable storage linked to valuations (from 014_valuation_engine.sql). 
Used for simpler workflows where basket organization is not needed.
Contains Ghana-specific fields: evidence_type, tenure_type, neighborhood_premium.';

COMMENT ON TABLE valuation_basket_comparables IS 
'Comparables organized into baskets for structured analysis (from 016_valuation_gaps.sql).
Supports multiple comparison scenarios per valuation.
Contains Ghana-specific fields: evidence_type, tenure_type, neighborhood_premium.
Linked to valuation_comparable_baskets for metadata.';

COMMENT ON TABLE valuation_comparable_baskets IS 
'Basket metadata for organizing comparables (from 016_valuation_gaps.sql).
Tracks summary statistics like evidence distribution and adjustment averages.';

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 017_consolidate_comparable_tables completed successfully';
  RAISE NOTICE 'Added evidence/Ghana fields to valuation_basket_comparables';
  RAISE NOTICE 'Added evidence/Ghana fields to valuation_comparables';
  RAISE NOTICE 'Added summary fields to valuation_comparable_baskets';
  RAISE NOTICE 'Created views: v_all_comparables, v_basket_analysis';
  RAISE NOTICE 'Created functions: get_basket_evidence_summary, calculate_basket_weighted_value';
END $$;
