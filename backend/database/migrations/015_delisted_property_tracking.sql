-- Migration: 015_delisted_property_tracking
-- Description: Add columns for tracking property listing lifecycle and delisted status
-- Purpose: Enable quasi-transaction evidence from delisted properties (RICS/GhIS compliant)
-- Created: 2026-01-11

-- =====================================================
-- DELISTED PROPERTY TRACKING COLUMNS
-- =====================================================
-- These columns track the lifecycle of a listing to detect potential sales
-- When a property is no longer visible on source sites, it may indicate:
--   1. Property was sold (most common)
--   2. Listing expired/removed by owner
--   3. Price change with new listing
--
-- Delisted properties provide "quasi-transaction" evidence that is more
-- reliable than active asking prices, per RICS guidance for thin markets.

-- Add tracking columns to properties table
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_delisted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS delisted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS inferred_sale_price DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS evidence_type VARCHAR(30) DEFAULT 'listing';

-- Add comments explaining the columns
COMMENT ON COLUMN properties.first_seen_at IS 'Timestamp when property was first scraped from source';
COMMENT ON COLUMN properties.last_seen_at IS 'Timestamp when property was last seen active on source';
COMMENT ON COLUMN properties.is_delisted IS 'True if property has not been seen for 7+ days (potential sale)';
COMMENT ON COLUMN properties.delisted_at IS 'Timestamp when property was marked as delisted';
COMMENT ON COLUMN properties.inferred_sale_price IS 'Estimated achieved price = last_asking_price * (1 - typical_discount)';
COMMENT ON COLUMN properties.evidence_type IS 'Evidence classification: listing, delisted_inferred, verified_sale, contributed';

-- =====================================================
-- EVIDENCE TYPE ENUM (if not using VARCHAR)
-- =====================================================
-- Using VARCHAR for flexibility, but could use enum:
-- CREATE TYPE evidence_type_enum AS ENUM (
--   'listing',           -- Active listing (asking price)
--   'delisted_inferred', -- Delisted property (inferred sale)
--   'verified_sale',     -- Confirmed transaction with proof
--   'contributed'        -- User-contributed with verification
-- );

-- =====================================================
-- INDEXES FOR DELISTED TRACKING
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_properties_is_delisted ON properties(is_delisted) WHERE is_delisted = TRUE;
CREATE INDEX IF NOT EXISTS idx_properties_last_seen_at ON properties(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_properties_evidence_type ON properties(evidence_type);
CREATE INDEX IF NOT EXISTS idx_properties_first_seen_at ON properties(first_seen_at);

-- Composite index for delisting detection queries
CREATE INDEX IF NOT EXISTS idx_properties_delisting_detection 
ON properties(last_seen_at, is_delisted) 
WHERE data_source = 'tier5_web';

-- =====================================================
-- UPDATE EXISTING RECORDS
-- =====================================================
-- Set first_seen_at and last_seen_at for existing scraped properties
UPDATE properties 
SET 
  first_seen_at = COALESCE(first_seen_at, created_at),
  last_seen_at = COALESCE(last_seen_at, updated_at, created_at),
  evidence_type = COALESCE(evidence_type, 'listing')
WHERE data_source = 'tier5_web' OR data_source IS NULL;

-- Set evidence_type for manual entries
UPDATE properties 
SET evidence_type = 'contributed'
WHERE data_source = 'manual_entry' AND evidence_type IS NULL;

-- =====================================================
-- FUNCTION: Mark Delisted Properties
-- =====================================================
-- This function should be called periodically (e.g., daily cron job)
-- to identify properties that have not been seen for 7+ days

CREATE OR REPLACE FUNCTION mark_delisted_properties(
  days_threshold INTEGER DEFAULT 7,
  typical_discount DECIMAL DEFAULT 0.12
)
RETURNS TABLE(
  properties_marked INTEGER,
  avg_inferred_price DECIMAL
) AS $$
DECLARE
  marked_count INTEGER;
  avg_price DECIMAL;
BEGIN
  -- Mark properties as delisted if not seen for threshold days
  WITH updated AS (
    UPDATE properties
    SET 
      is_delisted = TRUE,
      delisted_at = CURRENT_TIMESTAMP,
      evidence_type = 'delisted_inferred',
      -- Calculate inferred sale price with typical discount
      -- Using quality-based discount: luxury 20%, high 15%, standard 12%, basic 8%
      inferred_sale_price = price * (1 - 
        CASE condition
          WHEN 'excellent' THEN 0.10
          WHEN 'good' THEN 0.12
          WHEN 'fair' THEN 0.15
          WHEN 'poor' THEN 0.08
          ELSE typical_discount
        END
      )
    WHERE 
      data_source = 'tier5_web'
      AND is_delisted = FALSE
      AND last_seen_at IS NOT NULL
      AND last_seen_at < CURRENT_TIMESTAMP - (days_threshold || ' days')::INTERVAL
      AND price IS NOT NULL
      AND price > 0
    RETURNING *
  )
  SELECT COUNT(*), AVG(inferred_sale_price) 
  INTO marked_count, avg_price
  FROM updated;

  RETURN QUERY SELECT marked_count, COALESCE(avg_price, 0::DECIMAL);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mark_delisted_properties IS 
'Marks properties as delisted if not seen for specified days. 
Calculates inferred_sale_price using typical asking-to-achieved discount.
Call daily via cron: SELECT * FROM mark_delisted_properties(7, 0.12);';

-- =====================================================
-- FUNCTION: Get Properties for Delisting Check
-- =====================================================
-- Returns properties that should be checked in next spider run

CREATE OR REPLACE FUNCTION get_properties_for_delisting_check(
  check_after_hours INTEGER DEFAULT 24
)
RETURNS TABLE(
  id UUID,
  source_url VARCHAR,
  source_id VARCHAR,
  last_seen_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.source_url,
    p.external_id AS source_id,
    p.last_seen_at
  FROM properties p
  WHERE 
    p.data_source = 'tier5_web'
    AND p.is_delisted = FALSE
    AND p.source_url IS NOT NULL
    AND (
      p.last_seen_at IS NULL 
      OR p.last_seen_at < CURRENT_TIMESTAMP - (check_after_hours || ' hours')::INTERVAL
    )
  ORDER BY p.last_seen_at ASC NULLS FIRST
  LIMIT 1000;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- VIEW: Comparable Evidence Quality
-- =====================================================
-- View for analyzing evidence quality across the database

CREATE OR REPLACE VIEW v_comparable_evidence_stats AS
SELECT 
  region,
  property_type,
  evidence_type,
  COUNT(*) AS property_count,
  AVG(price) AS avg_asking_price,
  AVG(inferred_sale_price) AS avg_inferred_price,
  AVG(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - first_seen_at)) / 86400)::INTEGER AS avg_days_listed,
  COUNT(*) FILTER (WHERE is_delisted = TRUE) AS delisted_count,
  MIN(last_seen_at) AS oldest_seen,
  MAX(last_seen_at) AS newest_seen
FROM properties
WHERE price IS NOT NULL AND price > 0
GROUP BY region, property_type, evidence_type
ORDER BY region, property_type, evidence_type;

COMMENT ON VIEW v_comparable_evidence_stats IS 
'Statistics on comparable evidence quality by region, property type, and evidence type.
Use for monitoring data coverage and evidence quality.';

-- =====================================================
-- TRIGGER: Auto-update last_seen_at on update
-- =====================================================
-- When a property is updated via scraping, update last_seen_at

CREATE OR REPLACE FUNCTION update_last_seen_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update last_seen_at for scraped properties
  IF NEW.data_source = 'tier5_web' THEN
    NEW.last_seen_at = CURRENT_TIMESTAMP;
    
    -- If property was previously delisted but is now seen again, un-delist it
    IF OLD.is_delisted = TRUE THEN
      NEW.is_delisted = FALSE;
      NEW.delisted_at = NULL;
      NEW.evidence_type = 'listing';
      NEW.inferred_sale_price = NULL;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (drop first if exists to allow re-running migration)
DROP TRIGGER IF EXISTS trg_update_last_seen ON properties;
CREATE TRIGGER trg_update_last_seen
  BEFORE UPDATE ON properties
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION update_last_seen_timestamp();

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
