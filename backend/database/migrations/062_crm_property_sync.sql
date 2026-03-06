-- Migration: 062_crm_property_sync.sql
-- Description: Add Data Hub sync tracking to CRM properties for Phase 5.6
-- Purpose: Enable CRM → Data Hub property synchronization
-- Created: 2026-01-21

-- =====================================================
-- ADD SYNC TRACKING COLUMNS TO CRM_PROPERTIES
-- =====================================================

-- Add Data Hub linkage columns
ALTER TABLE crm_properties 
ADD COLUMN IF NOT EXISTS datahub_property_id UUID,
ADD COLUMN IF NOT EXISTS sync_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sync_error TEXT,
ADD COLUMN IF NOT EXISTS sync_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_sync_attempt_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS data_hash VARCHAR(64);

-- Index for sync status queries
CREATE INDEX IF NOT EXISTS idx_crm_properties_sync_status ON crm_properties(sync_status);
CREATE INDEX IF NOT EXISTS idx_crm_properties_datahub_id ON crm_properties(datahub_property_id);

-- =====================================================
-- UPDATE PROPERTY_SOURCES TABLE FOR CRM SOURCES
-- =====================================================

-- Add CRM as a property source (for properties table) - only if table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'property_sources') THEN
        INSERT INTO property_sources (slug, name, source_type, trust_level, is_active, created_at)
        VALUES 
            ('crm_client', 'CRM Client Submission', 'contribution', 'medium', true, NOW()),
            ('crm_agent', 'CRM Agent Listing', 'contribution', 'high', true, NOW()),
            ('crm_deal', 'CRM Deal Transaction', 'transaction', 'verified', true, NOW())
        ON CONFLICT (slug) DO NOTHING;
    END IF;
END $$;

-- =====================================================
-- CRM PROPERTY SYNC LOG TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS crm_property_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crm_property_id UUID NOT NULL REFERENCES crm_properties(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    
    -- Sync details
    sync_action VARCHAR(50) NOT NULL, -- 'create', 'update', 'link', 'transaction'
    sync_status VARCHAR(50) NOT NULL, -- 'pending', 'processing', 'completed', 'failed', 'skipped'
    
    -- Result tracking
    datahub_property_id UUID,
    contribution_id UUID,
    
    -- Processing metadata
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    processing_duration_ms INTEGER,
    
    -- Data changes
    data_before JSONB,
    data_after JSONB,
    
    -- Error tracking
    error_code VARCHAR(50),
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- Audit
    triggered_by UUID, -- User who triggered the sync
    trigger_source VARCHAR(50), -- 'auto', 'manual', 'deal_closure', 'update'
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crm_sync_log_property ON crm_property_sync_log(crm_property_id);
CREATE INDEX IF NOT EXISTS idx_crm_sync_log_org ON crm_property_sync_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_sync_log_status ON crm_property_sync_log(sync_status);
CREATE INDEX IF NOT EXISTS idx_crm_sync_log_created ON crm_property_sync_log(created_at DESC);

-- =====================================================
-- CRM TRANSACTION RECORDS TABLE (for closed deals)
-- =====================================================

CREATE TABLE IF NOT EXISTS crm_transaction_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    
    -- Source references
    deal_id UUID NOT NULL,
    crm_property_id UUID REFERENCES crm_properties(id),
    datahub_property_id UUID,
    
    -- Transaction details
    transaction_type VARCHAR(50) NOT NULL, -- 'sale', 'rental', 'lease'
    transaction_date DATE NOT NULL,
    
    -- Pricing
    transaction_price DECIMAL(15, 2),
    price_currency VARCHAR(10) DEFAULT 'GHS',
    price_per_sqm DECIMAL(15, 2),
    
    -- Property snapshot at transaction time
    property_type VARCHAR(100),
    property_region VARCHAR(100),
    property_city VARCHAR(100),
    bedrooms INTEGER,
    bathrooms INTEGER,
    total_area_sqm DECIMAL(15, 2),
    land_area_sqm DECIMAL(15, 2),
    
    -- Location
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    digital_address VARCHAR(50),
    
    -- Verification
    verification_status VARCHAR(50) DEFAULT 'unverified', -- 'unverified', 'agent_verified', 'document_verified'
    verified_by UUID,
    verified_at TIMESTAMPTZ,
    verification_notes TEXT,
    
    -- Data Hub sync
    synced_to_datahub BOOLEAN DEFAULT FALSE,
    datahub_contribution_id UUID,
    synced_at TIMESTAMPTZ,
    
    -- Audit
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crm_transactions_org ON crm_transaction_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_transactions_deal ON crm_transaction_records(deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_transactions_property ON crm_transaction_records(crm_property_id);
CREATE INDEX IF NOT EXISTS idx_crm_transactions_date ON crm_transaction_records(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_crm_transactions_region ON crm_transaction_records(property_region);
CREATE INDEX IF NOT EXISTS idx_crm_transactions_type ON crm_transaction_records(transaction_type);
CREATE INDEX IF NOT EXISTS idx_crm_transactions_synced ON crm_transaction_records(synced_to_datahub);

-- =====================================================
-- CRM SYNC STATS VIEW
-- =====================================================

CREATE OR REPLACE VIEW crm_sync_stats AS
SELECT 
    organization_id,
    COUNT(*) as total_properties,
    COUNT(*) FILTER (WHERE sync_status = 'synced') as synced_count,
    COUNT(*) FILTER (WHERE sync_status = 'pending') as pending_count,
    COUNT(*) FILTER (WHERE sync_status = 'failed') as failed_count,
    COUNT(*) FILTER (WHERE sync_status = 'skipped') as skipped_count,
    COUNT(*) FILTER (WHERE datahub_property_id IS NOT NULL AND sync_status != 'synced') as linked_count,
    COUNT(*) FILTER (WHERE synced_at > NOW() - INTERVAL '7 days') as synced_last_7_days,
    COUNT(*) FILTER (WHERE synced_at > NOW() - INTERVAL '30 days') as synced_last_30_days,
    MAX(synced_at) as last_sync_at
FROM crm_properties
GROUP BY organization_id;

-- =====================================================
-- ADD CONTRIBUTION TYPE ENUM VALUES
-- =====================================================

-- Check if enum values exist before adding (PostgreSQL doesn't support IF NOT EXISTS for enum values)
DO $$
BEGIN
    -- Add CRM contribution types if they don't exist
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'crm_property_new' AND enumtypid = 'contribution_type_enum'::regtype) THEN
        ALTER TYPE contribution_type_enum ADD VALUE 'crm_property_new';
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'crm_property_update' AND enumtypid = 'contribution_type_enum'::regtype) THEN
        ALTER TYPE contribution_type_enum ADD VALUE 'crm_property_update';
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'crm_deal_transaction' AND enumtypid = 'contribution_type_enum'::regtype) THEN
        ALTER TYPE contribution_type_enum ADD VALUE 'crm_deal_transaction';
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- TRIGGER FOR AUTO-UPDATING SYNC STATUS
-- =====================================================

CREATE OR REPLACE FUNCTION update_crm_property_sync_hash()
RETURNS TRIGGER AS $$
BEGIN
    -- Generate hash of key property fields for change detection
    NEW.data_hash = md5(
        COALESCE(NEW.title, '') ||
        COALESCE(NEW.property_type, '') ||
        COALESCE(NEW.address_city, '') ||
        COALESCE(NEW.region, '') ||
        COALESCE(NEW.digital_address, '') ||
        COALESCE(NEW.price::TEXT, '') ||
        COALESCE(NEW.bedrooms::TEXT, '') ||
        COALESCE(NEW.bathrooms::TEXT, '') ||
        COALESCE(NEW.total_area_sqm::TEXT, '') ||
        COALESCE(NEW.latitude::TEXT, '') ||
        COALESCE(NEW.longitude::TEXT, '')
    );
    
    -- If key data changed and already synced, mark for re-sync
    IF OLD.data_hash IS NOT NULL AND OLD.data_hash != NEW.data_hash AND OLD.sync_status = 'synced' THEN
        NEW.sync_status = 'pending';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_crm_property_sync_hash ON crm_properties;
CREATE TRIGGER trg_update_crm_property_sync_hash
    BEFORE UPDATE ON crm_properties
    FOR EACH ROW
    EXECUTE FUNCTION update_crm_property_sync_hash();

-- Also set hash on insert
CREATE OR REPLACE FUNCTION set_crm_property_sync_hash()
RETURNS TRIGGER AS $$
BEGIN
    NEW.data_hash = md5(
        COALESCE(NEW.title, '') ||
        COALESCE(NEW.property_type, '') ||
        COALESCE(NEW.address_city, '') ||
        COALESCE(NEW.region, '') ||
        COALESCE(NEW.digital_address, '') ||
        COALESCE(NEW.price::TEXT, '') ||
        COALESCE(NEW.bedrooms::TEXT, '') ||
        COALESCE(NEW.bathrooms::TEXT, '') ||
        COALESCE(NEW.total_area_sqm::TEXT, '') ||
        COALESCE(NEW.latitude::TEXT, '') ||
        COALESCE(NEW.longitude::TEXT, '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_crm_property_sync_hash ON crm_properties;
CREATE TRIGGER trg_set_crm_property_sync_hash
    BEFORE INSERT ON crm_properties
    FOR EACH ROW
    EXECUTE FUNCTION set_crm_property_sync_hash();

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON COLUMN crm_properties.datahub_property_id IS 'Reference to properties table after sync';
COMMENT ON COLUMN crm_properties.sync_status IS 'pending, syncing, synced, failed, skipped';
COMMENT ON COLUMN crm_properties.synced_at IS 'Timestamp of last successful sync';
COMMENT ON COLUMN crm_properties.data_hash IS 'MD5 hash of key fields for change detection';

COMMENT ON TABLE crm_property_sync_log IS 'Audit log of all CRM → Data Hub sync operations';
COMMENT ON TABLE crm_transaction_records IS 'Verified transaction records from closed deals';
COMMENT ON VIEW crm_sync_stats IS 'Aggregated sync statistics per organization';
