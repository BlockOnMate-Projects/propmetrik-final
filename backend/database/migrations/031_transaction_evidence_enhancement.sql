-- =====================================================
-- Migration 031: Transaction Evidence Enhancement
-- Purpose: Add proper transaction classification for RICS/GhIS compliance
-- =====================================================
-- This migration:
-- 1. Adds transaction classification fields to properties table
-- 2. Enhances evidence_type to be more granular based on source tier
-- 3. Creates triggers to auto-set evidence_type from data_source tier
-- 4. Creates evidence_weight configuration table for dynamic weights
-- =====================================================

-- =====================================================
-- SECTION 1: TRANSACTION CLASSIFICATION FIELDS
-- =====================================================

-- Add boolean to distinguish actual transactions from listings
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS is_transaction_record BOOLEAN DEFAULT FALSE;

-- Add transaction_value for verified/calculated transaction amounts
-- (Different from price which is asking price, and sold_price which may be null)
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS transaction_value DECIMAL(18, 2);

-- Transaction date (when the transaction actually occurred)
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS transaction_date DATE;

-- Transaction source - where the transaction data came from
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS transaction_source VARCHAR(50);

-- Transaction confidence score (0-1)
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS transaction_confidence DECIMAL(4, 3);

-- Comments for documentation
COMMENT ON COLUMN properties.is_transaction_record IS 'TRUE if this is a verified/confirmed transaction, FALSE if it''s a listing/asking price';
COMMENT ON COLUMN properties.transaction_value IS 'The actual or inferred transaction value (from sales, bank valuations, etc.)';
COMMENT ON COLUMN properties.transaction_date IS 'Date when the transaction occurred';
COMMENT ON COLUMN properties.transaction_source IS 'Source of transaction data: lands_commission, bank_valuation, agent_reported, delisting_inferred, etc.';
COMMENT ON COLUMN properties.transaction_confidence IS 'Confidence in transaction value (1.0=verified, 0.85=bank, 0.7=inferred)';

-- =====================================================
-- SECTION 2: ENHANCED EVIDENCE TYPE
-- =====================================================

-- The current evidence_type values are:
-- 'listing' - Active asking price
-- 'delisted_inferred' - Inferred from delisting
-- 'verified_sale' - Confirmed sale
-- 'contributed' - User contributed data

-- We'll add more granular types for source-tier alignment:
-- Update evidence_type to VARCHAR(50) to accommodate longer names
ALTER TABLE properties 
ALTER COLUMN evidence_type TYPE VARCHAR(50);

-- Update the default for scraped listings
-- (Note: We don't need to change existing data, just ensure new data is classified correctly)

-- =====================================================
-- SECTION 3: EVIDENCE WEIGHT CONFIGURATION TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS evidence_weight_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Evidence type this weight applies to
    evidence_type VARCHAR(50) NOT NULL,
    
    -- Source tier this applies to (NULL means applies to all tiers)
    source_tier VARCHAR(20),
    
    -- Base weight for comparable selection (0.0-1.0)
    base_weight DECIMAL(4, 3) NOT NULL DEFAULT 0.6,
    
    -- Trust score for conflict resolution (0.0-1.0)
    trust_score DECIMAL(4, 3) NOT NULL DEFAULT 0.65,
    
    -- Whether this evidence represents an actual transaction
    is_transaction BOOLEAN DEFAULT FALSE,
    
    -- Priority order for comparable selection (lower = higher priority)
    selection_priority INTEGER NOT NULL DEFAULT 100,
    
    -- Description for documentation
    description TEXT,
    
    -- RICS classification for this evidence type
    rics_classification VARCHAR(50),
    
    -- Whether this evidence type is currently active
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(evidence_type, source_tier)
);

COMMENT ON TABLE evidence_weight_config IS 'Configuration for evidence type weights, replacing hardcoded values in comparable selection';

-- =====================================================
-- SECTION 4: SEED EVIDENCE WEIGHT CONFIGURATION
-- =====================================================

INSERT INTO evidence_weight_config (
    evidence_type, source_tier, base_weight, trust_score, 
    is_transaction, selection_priority, description, rics_classification
) VALUES
    -- Tier 1: Government sources (highest trust)
    ('government_record', 'tier1_government', 1.00, 0.98, TRUE, 10, 
     'Verified transaction from Lands Commission or government registry',
     'verified_transaction'),
    
    ('lands_commission', 'tier1_government', 1.00, 0.98, TRUE, 10,
     'Land transaction from Ghana Lands Commission registry',
     'verified_transaction'),
    
    -- Tier 2: Financial institution sources  
    ('bank_valuation', 'tier2_financial', 0.95, 0.90, TRUE, 20,
     'Valuation conducted by bank for mortgage/collateral purposes',
     'verified_valuation'),
    
    ('bank_collateral', 'tier2_financial', 0.92, 0.88, TRUE, 25,
     'Property registered as bank collateral with recent valuation',
     'verified_valuation'),
    
    ('forced_sale', 'tier2_financial', 0.88, 0.85, TRUE, 30,
     'Bank foreclosure or forced sale - may be below market value',
     'distressed_sale'),
    
    -- Tier 3: Partner/Agent sources
    ('partner_transaction', 'tier3_partner', 0.88, 0.80, TRUE, 35,
     'Transaction reported by verified partner agency',
     'agent_reported'),
    
    ('agent_confirmed', 'tier3_partner', 0.85, 0.78, TRUE, 40,
     'Sale confirmed by listing agent after transaction',
     'agent_reported'),
    
    -- Verified sales (any source)
    ('verified_sale', NULL, 0.95, 0.90, TRUE, 15,
     'Verified sale with confirmed transaction value',
     'verified_transaction'),
    
    -- User contributions
    ('contributed', 'tier4_user', 0.75, 0.70, FALSE, 60,
     'User contributed comparable data - requires validation',
     'unverified'),
    
    -- Tier 5: Web scraped sources
    ('delisted_inferred', 'tier5_web', 0.80, 0.72, TRUE, 50,
     'Inferred transaction from delisting - asking price with adjustment',
     'inferred_transaction'),
    
    ('listing', 'tier5_web', 0.60, 0.65, FALSE, 80,
     'Active listing with asking price only',
     'asking_price'),
    
    ('listing_aged', 'tier5_web', 0.55, 0.60, FALSE, 85,
     'Listing older than 6 months - may be stale',
     'asking_price'),
    
    -- Default/Unknown
    ('unknown', NULL, 0.50, 0.50, FALSE, 100,
     'Unknown evidence type - apply with caution',
     'unverified')
ON CONFLICT (evidence_type, source_tier) DO UPDATE SET
    base_weight = EXCLUDED.base_weight,
    trust_score = EXCLUDED.trust_score,
    is_transaction = EXCLUDED.is_transaction,
    selection_priority = EXCLUDED.selection_priority,
    description = EXCLUDED.description,
    rics_classification = EXCLUDED.rics_classification,
    updated_at = NOW();

-- =====================================================
-- SECTION 5: TRIGGER TO AUTO-SET EVIDENCE TYPE FROM DATA SOURCE
-- =====================================================

CREATE OR REPLACE FUNCTION set_evidence_type_from_source()
RETURNS TRIGGER AS $$
DECLARE
    source_slug TEXT;
BEGIN
    -- Get source slug from external_source or data_source
    source_slug := LOWER(COALESCE(NEW.external_source, NEW.data_source::text, ''));
    
    -- Only set if evidence_type is NULL or 'listing' (default)
    IF NEW.evidence_type IS NULL OR NEW.evidence_type = 'listing' THEN
        CASE
            -- Tier 1: Government sources
            WHEN source_slug IN ('lands-commission', 'lands_commission', 'gra', 'ama') THEN
                NEW.evidence_type := 'government_record';
                NEW.is_transaction_record := TRUE;
                NEW.transaction_confidence := 0.98;
                NEW.transaction_source := source_slug;
                -- Set transaction_value from sold_price or price
                NEW.transaction_value := COALESCE(NEW.sold_price, NEW.price);
                NEW.transaction_date := COALESCE(NEW.sold_at::date, CURRENT_DATE);
            
            -- Tier 2: Financial sources
            WHEN source_slug IN ('ecobank', 'gcb', 'stanbic', 'absa', 'fidelity', 'zenith') THEN
                NEW.evidence_type := 'bank_valuation';
                NEW.is_transaction_record := TRUE;
                NEW.transaction_confidence := 0.90;
                NEW.transaction_source := source_slug;
                NEW.transaction_value := COALESCE(NEW.sold_price, NEW.price);
                NEW.transaction_date := COALESCE(NEW.sold_at::date, CURRENT_DATE);
            
            -- Tier 3: Partner sources
            WHEN source_slug IN ('broll', 'agency-network', 'devtraco', 'kpone-associates') THEN
                NEW.evidence_type := 'partner_transaction';
                NEW.is_transaction_record := FALSE; -- Set to TRUE when confirmed
                NEW.transaction_confidence := 0.78;
                NEW.transaction_source := source_slug;
            
            -- Tier 5: Web scraped (keep as listing by default)
            WHEN source_slug IN ('meqasa', 'gpc', 'jiji', 'tonaton', 'housemaster', 'realtor') THEN
                NEW.evidence_type := 'listing';
                NEW.is_transaction_record := FALSE;
                NEW.transaction_confidence := 0.65;
                NEW.transaction_source := source_slug;
            
            ELSE
                -- Default to listing if unknown source
                NEW.evidence_type := COALESCE(NEW.evidence_type, 'listing');
                NEW.is_transaction_record := FALSE;
        END CASE;
    END IF;
    
    -- If sold_price and sold_at are set, upgrade to verified_sale
    IF NEW.sold_price IS NOT NULL AND NEW.sold_at IS NOT NULL THEN
        NEW.evidence_type := 'verified_sale';
        NEW.is_transaction_record := TRUE;
        NEW.transaction_value := NEW.sold_price;
        NEW.transaction_date := NEW.sold_at::date;
        NEW.transaction_confidence := 0.95;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (drop existing if any)
DROP TRIGGER IF EXISTS trg_set_evidence_type ON properties;

CREATE TRIGGER trg_set_evidence_type
    BEFORE INSERT OR UPDATE ON properties
    FOR EACH ROW
    EXECUTE FUNCTION set_evidence_type_from_source();

-- =====================================================
-- SECTION 6: TRIGGER FOR DELISTING TO INFERRED TRANSACTION
-- =====================================================

-- Update the existing delisting trigger to also set transaction fields
CREATE OR REPLACE FUNCTION handle_property_delisting()
RETURNS TRIGGER AS $$
DECLARE
    listing_age_days INTEGER;
    asking_to_achieved_adjustment DECIMAL(4, 3);
BEGIN
    -- Calculate listing age
    listing_age_days := COALESCE(
        EXTRACT(DAY FROM (NEW.delisted_at - NEW.first_seen_at)),
        0
    );
    
    -- Only process if property is being marked as delisted
    IF NEW.is_delisted = TRUE AND (OLD.is_delisted IS NULL OR OLD.is_delisted = FALSE) THEN
        -- Set evidence type to delisted_inferred
        NEW.evidence_type := 'delisted_inferred';
        NEW.is_transaction_record := TRUE;
        NEW.transaction_date := NEW.delisted_at::date;
        NEW.transaction_source := 'delisting_inferred';
        
        -- Calculate asking-to-achieved adjustment based on listing age
        -- Properties that sell quickly likely achieve closer to asking
        -- Properties on market longer typically sell below asking
        CASE
            WHEN listing_age_days <= 30 THEN
                asking_to_achieved_adjustment := 0.95; -- Quick sale, likely near asking
            WHEN listing_age_days <= 60 THEN
                asking_to_achieved_adjustment := 0.92;
            WHEN listing_age_days <= 90 THEN
                asking_to_achieved_adjustment := 0.88;
            WHEN listing_age_days <= 180 THEN
                asking_to_achieved_adjustment := 0.85;
            ELSE
                asking_to_achieved_adjustment := 0.80; -- Long time on market
        END CASE;
        
        -- Set inferred sale price and transaction value
        NEW.inferred_sale_price := COALESCE(NEW.price, 0) * asking_to_achieved_adjustment;
        NEW.transaction_value := NEW.inferred_sale_price;
        NEW.transaction_confidence := asking_to_achieved_adjustment * 0.85; -- Reduce confidence since it's inferred
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate delisting trigger if needed
DROP TRIGGER IF EXISTS trg_property_delisting ON properties;

CREATE TRIGGER trg_property_delisting
    BEFORE UPDATE ON properties
    FOR EACH ROW
    WHEN (NEW.is_delisted = TRUE AND (OLD.is_delisted IS NULL OR OLD.is_delisted = FALSE))
    EXECUTE FUNCTION handle_property_delisting();

-- =====================================================
-- SECTION 7: INDEXES FOR TRANSACTION QUERIES
-- =====================================================

-- Index for finding transaction records
CREATE INDEX IF NOT EXISTS idx_properties_is_transaction 
ON properties(is_transaction_record) 
WHERE is_transaction_record = TRUE;

-- Index for transaction date queries
CREATE INDEX IF NOT EXISTS idx_properties_transaction_date 
ON properties(transaction_date) 
WHERE transaction_date IS NOT NULL;

-- Composite index for comparable selection: evidence type + transaction status
CREATE INDEX IF NOT EXISTS idx_properties_evidence_transaction 
ON properties(evidence_type, is_transaction_record, transaction_date DESC NULLS LAST);

-- Index for evidence weight lookups
CREATE INDEX IF NOT EXISTS idx_evidence_weight_config_lookup 
ON evidence_weight_config(evidence_type, source_tier) 
WHERE is_active = TRUE;

-- =====================================================
-- SECTION 8: VIEW FOR COMPARABLE SELECTION WITH WEIGHTS
-- =====================================================

CREATE OR REPLACE VIEW comparable_properties_with_weights AS
SELECT 
    p.id,
    p.region,
    p.address_street,
    p.address_city,
    p.property_type,
    p.transaction_type,
    p.bedrooms,
    p.bathrooms,
    p.total_area_sqm,
    p.land_area_sqm,
    p.price AS asking_price,
    p.sold_price,
    p.transaction_value,
    p.transaction_date,
    p.evidence_type,
    p.is_transaction_record,
    p.transaction_confidence,
    p.is_delisted,
    p.delisted_at,
    p.inferred_sale_price,
    p.first_seen_at,
    p.last_seen_at,
    p.latitude,
    p.longitude,
    p.data_source,
    p.completeness_score,
    
    -- Calculate effective value for comparisons
    COALESCE(
        p.sold_price,           -- 1. Actual sold price (highest priority)
        p.transaction_value,     -- 2. Transaction value (bank valuation, etc.)
        p.inferred_sale_price,   -- 3. Inferred from delisting
        p.price                  -- 4. Asking price (lowest priority)
    ) AS effective_value,
    
    -- Get evidence weight from config
    COALESCE(ewc.base_weight, 0.6) AS evidence_weight,
    COALESCE(ewc.trust_score, 0.65) AS trust_score,
    COALESCE(ewc.selection_priority, 100) AS selection_priority,
    COALESCE(ewc.rics_classification, 'unverified') AS rics_classification,
    
    -- Listing age in days
    EXTRACT(DAY FROM (NOW() - COALESCE(p.first_seen_at, p.created_at)))::INTEGER AS listing_age_days,
    
    -- Time since transaction (for time adjustments)
    EXTRACT(DAY FROM (NOW() - COALESCE(p.transaction_date, p.delisted_at, p.last_seen_at)))::INTEGER AS days_since_transaction
    
FROM properties p
LEFT JOIN evidence_weight_config ewc 
    ON ewc.evidence_type = p.evidence_type
    AND ewc.is_active = TRUE
    AND (ewc.source_tier IS NULL OR ewc.source_tier = p.data_source::text);

COMMENT ON VIEW comparable_properties_with_weights IS 'Properties with calculated evidence weights for comparable selection - replaces hardcoded weights';

-- =====================================================
-- SECTION 9: HELPER FUNCTION FOR EVIDENCE WEIGHT LOOKUP
-- =====================================================

CREATE OR REPLACE FUNCTION get_evidence_weight(
    p_evidence_type VARCHAR(50),
    p_source_tier VARCHAR(20) DEFAULT NULL
)
RETURNS TABLE(
    base_weight DECIMAL(4, 3),
    trust_score DECIMAL(4, 3),
    is_transaction BOOLEAN,
    selection_priority INTEGER,
    rics_classification VARCHAR(50)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ewc.base_weight,
        ewc.trust_score,
        ewc.is_transaction,
        ewc.selection_priority,
        ewc.rics_classification
    FROM evidence_weight_config ewc
    WHERE ewc.evidence_type = p_evidence_type
      AND ewc.is_active = TRUE
      AND (
          -- Match specific tier or use NULL (applies to all)
          ewc.source_tier = p_source_tier 
          OR ewc.source_tier IS NULL
      )
    ORDER BY 
        CASE WHEN ewc.source_tier IS NOT NULL THEN 0 ELSE 1 END, -- Prefer tier-specific
        ewc.selection_priority
    LIMIT 1;
    
    -- Return default if not found
    IF NOT FOUND THEN
        RETURN QUERY SELECT 0.6::DECIMAL(4,3), 0.65::DECIMAL(4,3), FALSE, 100, 'unverified'::VARCHAR(50);
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- SECTION 10: UPDATE EXISTING DATA
-- =====================================================

-- Backfill transaction fields for properties with sold_price
UPDATE properties
SET 
    is_transaction_record = TRUE,
    transaction_value = sold_price,
    transaction_date = sold_at::date,
    transaction_source = 'historical_sold_price',
    transaction_confidence = 0.90,
    evidence_type = 'verified_sale'
WHERE sold_price IS NOT NULL 
  AND sold_at IS NOT NULL
  AND is_transaction_record IS NULL;

-- Backfill for delisted properties that have inferred_sale_price
UPDATE properties
SET 
    is_transaction_record = TRUE,
    transaction_value = inferred_sale_price,
    transaction_date = COALESCE(delisted_at::date, last_seen_at::date),
    transaction_source = 'delisting_inferred',
    transaction_confidence = 0.72,
    evidence_type = 'delisted_inferred'
WHERE is_delisted = TRUE 
  AND inferred_sale_price IS NOT NULL
  AND is_transaction_record IS NULL;

-- Set remaining properties as non-transaction (listings)
UPDATE properties
SET 
    is_transaction_record = FALSE,
    evidence_type = COALESCE(evidence_type, 'listing'),
    transaction_source = COALESCE(external_source, 'web_scrape')
WHERE is_transaction_record IS NULL;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

COMMENT ON COLUMN properties.evidence_type IS 'Enhanced evidence type: government_record, bank_valuation, bank_collateral, partner_transaction, verified_sale, delisted_inferred, contributed, listing';
