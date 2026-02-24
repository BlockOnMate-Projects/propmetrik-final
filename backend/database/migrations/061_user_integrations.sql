-- Migration: 061_user_integrations.sql
-- Description: Store OAuth tokens for third-party integrations (Google Calendar, etc.)
-- Created: 2026-01-21

-- ============================================================================
-- User Integrations Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    provider VARCHAR(50) NOT NULL,
    
    -- OAuth tokens (encrypted at rest)
    access_token TEXT,
    refresh_token TEXT,
    expiry_date BIGINT,
    
    -- Provider-specific data
    provider_user_id VARCHAR(255),
    provider_email VARCHAR(255),
    scopes TEXT[], -- Array of granted scopes
    
    -- Calendar-specific
    default_calendar_id VARCHAR(255),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT unique_user_provider UNIQUE (user_id, provider)
);

-- Create index for lookups
CREATE INDEX IF NOT EXISTS idx_user_integrations_user_id ON user_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_integrations_provider ON user_integrations(provider);

-- ============================================================================
-- Calendar Events Sync Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS calendar_event_sync (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_integration_id UUID NOT NULL REFERENCES user_integrations(id) ON DELETE CASCADE,
    
    -- Local reference
    source_type VARCHAR(50) NOT NULL, -- 'crm_activity', 'crm_task', 'deal_meeting', 'property_viewing'
    source_id UUID NOT NULL,
    
    -- Google Calendar reference
    google_event_id VARCHAR(255) NOT NULL,
    google_calendar_id VARCHAR(255) DEFAULT 'primary',
    google_html_link TEXT,
    google_hangout_link TEXT,
    
    -- Sync status
    sync_status VARCHAR(20) DEFAULT 'synced',
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    sync_error TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Prevent duplicate syncs
    CONSTRAINT unique_calendar_sync UNIQUE (source_type, source_id, google_calendar_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_calendar_sync_source ON calendar_event_sync(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_google_event ON calendar_event_sync(google_event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_status ON calendar_event_sync(sync_status);

-- ============================================================================
-- WhatsApp Message Log Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Message identifiers
    whatsapp_message_id VARCHAR(255) NOT NULL UNIQUE,
    
    -- Direction
    direction VARCHAR(10) NOT NULL, -- 'inbound', 'outbound'
    
    -- Parties
    from_number VARCHAR(20) NOT NULL,
    to_number VARCHAR(20) NOT NULL,
    
    -- Content
    message_type VARCHAR(20) NOT NULL, -- 'text', 'template', 'document', 'image', 'audio', 'video', 'location'
    content JSONB, -- Stores message content based on type
    
    -- CRM linkage
    contact_id UUID,
    deal_id UUID,
    crm_activity_id UUID,
    
    -- Status tracking
    status VARCHAR(20) DEFAULT 'sent', -- 'sent', 'delivered', 'read', 'failed'
    status_updated_at TIMESTAMPTZ,
    error_code VARCHAR(20),
    error_message TEXT,
    
    -- Template info (for outbound template messages)
    template_name VARCHAR(100),
    template_language VARCHAR(10),
    
    -- Timestamps
    whatsapp_timestamp TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_whatsapp_from ON whatsapp_messages(from_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_to ON whatsapp_messages(to_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contact ON whatsapp_messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_deal ON whatsapp_messages(deal_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_status ON whatsapp_messages(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_direction ON whatsapp_messages(direction);
CREATE INDEX IF NOT EXISTS idx_whatsapp_created ON whatsapp_messages(created_at);

-- ============================================================================
-- Integration Webhook Log (for debugging)
-- ============================================================================

CREATE TABLE IF NOT EXISTS integration_webhook_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL, -- 'whatsapp', 'google', 'paystack'
    event_type VARCHAR(100),
    payload JSONB,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMPTZ,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-cleanup old webhook logs (keep 30 days)
CREATE INDEX IF NOT EXISTS idx_webhook_log_created ON integration_webhook_log(created_at);

-- ============================================================================
-- Add triggers for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_integration_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_integrations_timestamp ON user_integrations;
CREATE TRIGGER update_user_integrations_timestamp
    BEFORE UPDATE ON user_integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_integration_timestamp();

DROP TRIGGER IF EXISTS update_calendar_sync_timestamp ON calendar_event_sync;
CREATE TRIGGER update_calendar_sync_timestamp
    BEFORE UPDATE ON calendar_event_sync
    FOR EACH ROW
    EXECUTE FUNCTION update_integration_timestamp();

DROP TRIGGER IF EXISTS update_whatsapp_messages_timestamp ON whatsapp_messages;
CREATE TRIGGER update_whatsapp_messages_timestamp
    BEFORE UPDATE ON whatsapp_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_integration_timestamp();

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE user_integrations IS 'Stores OAuth tokens for third-party integrations (Google Calendar, future: Outlook, etc.)';
COMMENT ON TABLE calendar_event_sync IS 'Tracks sync state between CRM events and Google Calendar events';
COMMENT ON TABLE whatsapp_messages IS 'Logs all WhatsApp messages sent/received for CRM audit trail';
COMMENT ON TABLE integration_webhook_log IS 'Debug log for incoming webhooks from third-party services';
