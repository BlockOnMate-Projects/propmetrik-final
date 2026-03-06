-- ============================================================================
-- E-Sign Phase 1: Source Context & Webhook Support
-- Migration: 05_source_context.sql
-- 
-- Adds source context tracking to envelopes for programmatic integration
-- with Property Management, Valuation, CRM, and Project Management modules.
-- ============================================================================

-- Add source context fields to envelopes table
ALTER TABLE esign.envelopes 
ADD COLUMN IF NOT EXISTS source_module VARCHAR(50),
ADD COLUMN IF NOT EXISTS source_entity_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS source_entity_id UUID,
ADD COLUMN IF NOT EXISTS callback_url TEXT,
ADD COLUMN IF NOT EXISTS is_programmatic BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS webhook_delivered_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS webhook_delivery_attempts INTEGER DEFAULT 0;

-- Create index for efficient source lookups
CREATE INDEX IF NOT EXISTS idx_envelopes_source 
ON esign.envelopes(source_module, source_entity_type, source_entity_id)
WHERE source_module IS NOT NULL;

-- Create index for programmatic envelopes
CREATE INDEX IF NOT EXISTS idx_envelopes_programmatic 
ON esign.envelopes(is_programmatic, status)
WHERE is_programmatic = TRUE;

-- ============================================================================
-- Webhook Registration Table
-- Allows business services to register callback URLs for completion events
-- ============================================================================

CREATE TABLE IF NOT EXISTS esign.webhook_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_module VARCHAR(50) NOT NULL,
    callback_url TEXT NOT NULL,
    secret_key VARCHAR(64) NOT NULL,  -- For HMAC signature verification
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source_module)
);

-- ============================================================================
-- Webhook Delivery Log
-- Tracks all webhook delivery attempts for debugging and retry
-- ============================================================================

CREATE TABLE IF NOT EXISTS esign.webhook_delivery_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id VARCHAR(36) NOT NULL REFERENCES esign.envelopes(id) ON DELETE CASCADE,
    webhook_url TEXT NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    response_status INTEGER,
    response_body TEXT,
    error_message TEXT,
    attempt_number INTEGER DEFAULT 1,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_delivery_log_envelope 
ON esign.webhook_delivery_log(envelope_id);

CREATE INDEX IF NOT EXISTS idx_webhook_delivery_log_status 
ON esign.webhook_delivery_log(response_status)
WHERE response_status IS NOT NULL;

-- ============================================================================
-- Internal API Keys Table
-- For server-to-server authentication (programmatic envelope creation)
-- ============================================================================

CREATE TABLE IF NOT EXISTS esign.internal_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_name VARCHAR(100) NOT NULL UNIQUE,
    api_key_hash VARCHAR(128) NOT NULL,  -- SHA-256 hash of the key
    source_module VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_internal_api_keys_active 
ON esign.internal_api_keys(is_active, source_module)
WHERE is_active = TRUE;

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON COLUMN esign.envelopes.source_module IS 'Origin module: property_management, valuation, crm, project_management';
COMMENT ON COLUMN esign.envelopes.source_entity_type IS 'Type of source entity: tenancy, valuation_report, deal, change_order';
COMMENT ON COLUMN esign.envelopes.source_entity_id IS 'UUID of the source entity in the origin module';
COMMENT ON COLUMN esign.envelopes.callback_url IS 'URL to call when envelope is completed';
COMMENT ON COLUMN esign.envelopes.is_programmatic IS 'TRUE if created via programmatic API (not UI)';

COMMENT ON TABLE esign.webhook_registrations IS 'Registered webhook endpoints per source module';
COMMENT ON TABLE esign.webhook_delivery_log IS 'Log of all webhook delivery attempts';
COMMENT ON TABLE esign.internal_api_keys IS 'API keys for server-to-server authentication';
