-- Migration: 031_etl_deduplication_enhancement.sql
-- Adds tables and columns needed for enhanced ETL deduplication, 
-- conflict resolution, and multi-source tracking

-- ============================================================================
-- ETL Job History Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS etl_job_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id VARCHAR(100) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    stats JSONB,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_etl_job_history_type ON etl_job_history(type);
CREATE INDEX IF NOT EXISTS idx_etl_job_history_status ON etl_job_history(status);
CREATE INDEX IF NOT EXISTS idx_etl_job_history_started ON etl_job_history(started_at DESC);

-- ============================================================================
-- Property Duplicates Enhancement
-- ============================================================================

-- Add missing columns to property_duplicates if they don't exist
DO $$
BEGIN
    -- Add merged_at column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'property_duplicates' AND column_name = 'merged_at'
    ) THEN
        ALTER TABLE property_duplicates ADD COLUMN merged_at TIMESTAMPTZ;
    END IF;
    
    -- Add merged_into_id column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'property_duplicates' AND column_name = 'merged_into_id'
    ) THEN
        ALTER TABLE property_duplicates ADD COLUMN merged_into_id UUID;
    END IF;
    
    -- Add confirmed_at column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'property_duplicates' AND column_name = 'confirmed_at'
    ) THEN
        ALTER TABLE property_duplicates ADD COLUMN confirmed_at TIMESTAMPTZ;
    END IF;
    
    -- Add rejected_at column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'property_duplicates' AND column_name = 'rejected_at'
    ) THEN
        ALTER TABLE property_duplicates ADD COLUMN rejected_at TIMESTAMPTZ;
    END IF;
    
    -- Add rejection_reason column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'property_duplicates' AND column_name = 'rejection_reason'
    ) THEN
        ALTER TABLE property_duplicates ADD COLUMN rejection_reason TEXT;
    END IF;
    
    -- Add title_similarity column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'property_duplicates' AND column_name = 'title_similarity'
    ) THEN
        ALTER TABLE property_duplicates ADD COLUMN title_similarity DECIMAL(5,4);
    END IF;
    
    -- Add image_similarity column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'property_duplicates' AND column_name = 'image_similarity'
    ) THEN
        ALTER TABLE property_duplicates ADD COLUMN image_similarity DECIMAL(5,4);
    END IF;
    
    -- Add match_reasons column (if not using existing one)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'property_duplicates' AND column_name = 'match_reasons'
    ) THEN
        ALTER TABLE property_duplicates ADD COLUMN match_reasons JSONB;
    END IF;
END $$;

-- Index for finding pending duplicates
CREATE INDEX IF NOT EXISTS idx_property_duplicates_status_score 
    ON property_duplicates(status, similarity_score DESC);

-- ============================================================================
-- Property Data Sources Table (create if not exists)
-- ============================================================================

CREATE TABLE IF NOT EXISTS property_data_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL,
    data_source_id UUID,
    source_type VARCHAR(50) NOT NULL,
    data_fields JSONB DEFAULT '{}',
    raw_data JSONB DEFAULT '{}',
    reliability_score DECIMAL(5,4) DEFAULT 0.5,
    is_primary_source BOOLEAN DEFAULT FALSE,
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    update_count INTEGER DEFAULT 1,
    data_hash VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(property_id, data_source_id)
);

-- Create basic indexes (only if columns exist)
CREATE INDEX IF NOT EXISTS idx_property_data_sources_property 
    ON property_data_sources(property_id);

CREATE INDEX IF NOT EXISTS idx_property_data_sources_source_type 
    ON property_data_sources(source_type);

-- ============================================================================
-- Property Data Sources Enhancement (add columns if table already exists)
-- ============================================================================

-- Add missing columns to property_data_sources if they don't exist
DO $$
BEGIN
    -- Add last_updated column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'property_data_sources' AND column_name = 'last_updated'
    ) THEN
        ALTER TABLE property_data_sources ADD COLUMN last_updated TIMESTAMPTZ DEFAULT NOW();
    END IF;
    
    -- Add update_count column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'property_data_sources' AND column_name = 'update_count'
    ) THEN
        ALTER TABLE property_data_sources ADD COLUMN update_count INTEGER DEFAULT 1;
    END IF;
    
    -- Add data_hash column for change detection
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'property_data_sources' AND column_name = 'data_hash'
    ) THEN
        ALTER TABLE property_data_sources ADD COLUMN data_hash VARCHAR(64);
    END IF;
    
    -- Add data_source_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'property_data_sources' AND column_name = 'data_source_id'
    ) THEN
        ALTER TABLE property_data_sources ADD COLUMN data_source_id UUID;
    END IF;
END $$;

-- Create last_updated index after ensuring column exists
CREATE INDEX IF NOT EXISTS idx_property_data_sources_last_updated 
    ON property_data_sources(last_updated DESC);

-- ============================================================================
-- Properties Enhancement for Merge Support
-- ============================================================================

-- Add merge tracking columns to properties
DO $$
BEGIN
    -- Add merged_into_property_id column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'properties' AND column_name = 'merged_into_property_id'
    ) THEN
        ALTER TABLE properties ADD COLUMN merged_into_property_id UUID;
    END IF;
    
    -- Add conflict_resolution_metadata column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'properties' AND column_name = 'conflict_resolution_metadata'
    ) THEN
        ALTER TABLE properties ADD COLUMN conflict_resolution_metadata JSONB;
    END IF;
    
    -- Add image_hashes column for perceptual matching
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'properties' AND column_name = 'image_hashes'
    ) THEN
        ALTER TABLE properties ADD COLUMN image_hashes JSONB;
    END IF;
END $$;

-- Add 'merged' to listing status enum if not exists
-- Note: This requires owner privileges on the enum type.
-- If this fails, the 'merged' status will need to be added manually by the DB admin.
DO $$
BEGIN
    -- Check if 'merged' exists in the enum (using listing_status_enum per 001_initial_schema.sql)
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'listing_status_enum' AND e.enumlabel = 'merged'
    ) THEN
        -- Try to add the value, but catch permission errors
        BEGIN
            ALTER TYPE listing_status_enum ADD VALUE IF NOT EXISTS 'merged';
            RAISE NOTICE 'Added merged value to listing_status_enum';
        EXCEPTION
            WHEN insufficient_privilege THEN
                RAISE NOTICE 'Skipping listing_status_enum modification - insufficient privileges. Please add merged value manually as DB admin.';
        END;
    END IF;
EXCEPTION
    WHEN undefined_object THEN
        -- Enum doesn't exist, skip
        RAISE NOTICE 'listing_status_enum does not exist, skipping';
    WHEN duplicate_object THEN
        -- Value already exists, skip
        RAISE NOTICE 'merged value already exists in listing_status_enum';
END $$;

-- ============================================================================
-- Property History Table for Audit Trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS property_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    details JSONB,
    user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_history_property 
    ON property_history(property_id);
CREATE INDEX IF NOT EXISTS idx_property_history_event 
    ON property_history(event_type);
CREATE INDEX IF NOT EXISTS idx_property_history_created 
    ON property_history(created_at DESC);

-- ============================================================================
-- Data Quality Metrics View
-- ============================================================================

CREATE OR REPLACE VIEW v_data_quality_metrics AS
SELECT 
    p.region,
    p.data_source as source,
    COUNT(*) as property_count,
    AVG(p.completeness_score) as avg_completeness,
    AVG(CASE 
        WHEN p.bedrooms IS NOT NULL THEN 1.0 ELSE 0.0 END +
        CASE WHEN p.bathrooms IS NOT NULL THEN 1.0 ELSE 0.0 END +
        CASE WHEN p.price IS NOT NULL THEN 1.0 ELSE 0.0 END +
        CASE WHEN p.latitude IS NOT NULL THEN 1.0 ELSE 0.0 END +
        CASE WHEN p.address_street IS NOT NULL THEN 1.0 ELSE 0.0 END
    ) / 5.0 as key_field_coverage,
    -- Count properties involved in duplicates (using property_id_1 or property_id_2)
    COUNT(DISTINCT CASE WHEN pd.merged_into_id IS NOT NULL THEN p.id END) as duplicate_count,
    COUNT(DISTINCT pds.property_id) FILTER (WHERE pds.id IS NOT NULL) as multi_source_count
FROM properties p
LEFT JOIN property_duplicates pd ON (pd.property_id_1 = p.id OR pd.property_id_2 = p.id)
LEFT JOIN property_data_sources pds ON pds.property_id = p.id
WHERE p.status = 'active'
GROUP BY p.region, p.data_source;

-- ============================================================================
-- Duplicate Detection Function
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_property_similarity(
    p1_id UUID,
    p2_id UUID
) RETURNS TABLE(
    overall_score DECIMAL,
    address_score DECIMAL,
    location_score DECIMAL,
    price_score DECIMAL,
    features_score DECIMAL
) AS $$
DECLARE
    p1 RECORD;
    p2 RECORD;
    addr_sim DECIMAL := 0;
    loc_sim DECIMAL := 0;
    price_sim DECIMAL := 0;
    feat_sim DECIMAL := 0;
    distance_km DECIMAL;
BEGIN
    -- Get property 1
    SELECT * INTO p1 FROM properties WHERE id = p1_id;
    -- Get property 2
    SELECT * INTO p2 FROM properties WHERE id = p2_id;
    
    -- Address similarity (using trigram if available, else simple)
    IF p1.address_street IS NOT NULL AND p2.address_street IS NOT NULL THEN
        addr_sim := similarity(LOWER(p1.address_street), LOWER(p2.address_street));
    END IF;
    
    -- Location similarity using haversine formula (fallback for no PostGIS)
    IF p1.latitude IS NOT NULL AND p2.latitude IS NOT NULL THEN
        -- Haversine distance in km
        distance_km := 6371 * acos(
            LEAST(1.0, 
                cos(radians(p1.latitude)) * cos(radians(p2.latitude)) * 
                cos(radians(p2.longitude) - radians(p1.longitude)) + 
                sin(radians(p1.latitude)) * sin(radians(p2.latitude))
            )
        );
        -- Convert to similarity (1 at 0m, 0 at 200m+)
        loc_sim := GREATEST(0, 1.0 - (distance_km * 1000) / 200.0);
    END IF;
    
    -- Price similarity
    IF p1.price IS NOT NULL AND p2.price IS NOT NULL AND 
       GREATEST(p1.price, p2.price) > 0 THEN
        price_sim := 1.0 - ABS(p1.price - p2.price) / GREATEST(p1.price, p2.price);
    END IF;
    
    -- Features similarity
    IF p1.bedrooms IS NOT NULL AND p2.bedrooms IS NOT NULL THEN
        feat_sim := feat_sim + (CASE WHEN p1.bedrooms = p2.bedrooms THEN 0.5 ELSE 0 END);
    END IF;
    IF p1.bathrooms IS NOT NULL AND p2.bathrooms IS NOT NULL THEN
        feat_sim := feat_sim + (CASE WHEN p1.bathrooms = p2.bathrooms THEN 0.3 ELSE 0 END);
    END IF;
    IF p1.property_type IS NOT NULL AND p2.property_type IS NOT NULL THEN
        feat_sim := feat_sim + (CASE WHEN p1.property_type = p2.property_type THEN 0.2 ELSE 0 END);
    END IF;
    
    -- Calculate overall
    overall_score := (addr_sim * 0.3 + loc_sim * 0.3 + price_sim * 0.2 + feat_sim * 0.2);
    address_score := addr_sim;
    location_score := loc_sim;
    price_score := price_sim;
    features_score := feat_sim;
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Helper Function: Ensure pg_trgm extension
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- Scheduled Job Registration (for pg_cron if available)
-- ============================================================================

-- Note: pg_cron must be installed separately
-- This is just a template for setting up scheduled ETL jobs

-- SELECT cron.schedule(
--     'etl-full-pipeline-daily',
--     '0 2 * * *',  -- Run at 2 AM daily
--     $$SELECT run_etl_pipeline()$$
-- );

COMMENT ON TABLE etl_job_history IS 'Tracks ETL job execution history for monitoring and debugging';
COMMENT ON TABLE property_history IS 'Audit trail for property changes including merges and conflict resolution';
