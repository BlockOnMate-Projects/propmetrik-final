-- Migration: 067_realtime_presence.sql
-- Real-time presence and event tracking for Phase 5.11
-- Created: 2026-01-21

-- =============================================================================
-- PRESENCE TRACKING
-- Track which users are currently viewing/editing which resources
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_presence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    resource_type VARCHAR(50) NOT NULL, -- deal, property, contact, project
    resource_id UUID NOT NULL,
    action VARCHAR(50) DEFAULT 'viewing', -- viewing, editing
    session_id VARCHAR(255) NOT NULL, -- Browser session/tab identifier
    user_info JSONB DEFAULT '{}', -- name, avatar, etc cached for display
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 minutes'),
    
    CONSTRAINT unique_user_session_resource UNIQUE (user_id, session_id, resource_type, resource_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_presence_resource ON user_presence(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_user_presence_org ON user_presence(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_presence_expires ON user_presence(expires_at);

-- =============================================================================
-- REALTIME EVENTS LOG
-- Store recent events for replay and debugging
-- =============================================================================

CREATE TABLE IF NOT EXISTS realtime_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL, -- deal.updated, activity.created, presence.joined, etc.
    entity_type VARCHAR(50), -- deal, contact, property, project
    entity_id UUID,
    payload JSONB NOT NULL,
    user_id UUID, -- User who triggered the event
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Partition by time for efficient cleanup
    CONSTRAINT realtime_events_time_check CHECK (created_at >= '2026-01-01')
);

-- Indexes for event queries
CREATE INDEX IF NOT EXISTS idx_realtime_events_org_time ON realtime_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_realtime_events_entity ON realtime_events(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_realtime_events_type ON realtime_events(event_type, created_at DESC);

-- =============================================================================
-- CALENDAR EVENTS (for Phase 5.11 Week 2)
-- Unified calendar view for all CRM activities
-- =============================================================================

CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    user_id UUID NOT NULL, -- Event owner
    
    -- Event Details
    title VARCHAR(500) NOT NULL,
    description TEXT,
    event_type VARCHAR(50) NOT NULL, -- viewing, meeting, task, reminder, follow_up
    location VARCHAR(500),
    location_type VARCHAR(50), -- in_person, virtual, phone
    
    -- Timing
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    all_day BOOLEAN DEFAULT FALSE,
    timezone VARCHAR(100) DEFAULT 'Africa/Accra',
    
    -- Recurrence
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_rule VARCHAR(500), -- iCal RRULE format
    recurrence_end_date DATE,
    parent_event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
    
    -- Related Entities
    deal_id UUID,
    contact_id UUID,
    property_id UUID,
    task_id UUID, -- Link to CRM task if this is a task deadline
    
    -- Attendees (stored as JSONB for flexibility)
    attendees JSONB DEFAULT '[]', -- [{user_id, email, name, status: accepted/declined/tentative}]
    
    -- External Calendar Sync
    google_event_id VARCHAR(255),
    outlook_event_id VARCHAR(255),
    external_sync_status VARCHAR(50), -- synced, pending, failed
    last_synced_at TIMESTAMPTZ,
    
    -- Reminders
    reminders JSONB DEFAULT '[]', -- [{minutes_before: 30, type: "email"}, {minutes_before: 5, type: "push"}]
    
    -- Status
    status VARCHAR(50) DEFAULT 'scheduled', -- scheduled, completed, cancelled
    color VARCHAR(50), -- Custom color for calendar display
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for calendar queries
CREATE INDEX IF NOT EXISTS idx_calendar_events_org_time ON calendar_events(organization_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user ON calendar_events(user_id, start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_deal ON calendar_events(deal_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_contact ON calendar_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_external_google ON calendar_events(google_event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_external_outlook ON calendar_events(outlook_event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_type ON calendar_events(event_type, start_time);

-- =============================================================================
-- VIEWING SLOTS (for property viewing scheduler)
-- =============================================================================

CREATE TABLE IF NOT EXISTS viewing_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    property_id UUID NOT NULL,
    agent_id UUID NOT NULL,
    
    -- Availability Window
    day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    slot_duration_minutes INTEGER DEFAULT 30,
    max_slots INTEGER DEFAULT 4, -- Max viewings per day
    
    -- Or specific date availability
    specific_date DATE,
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_viewing_availability_property ON viewing_availability(property_id);
CREATE INDEX IF NOT EXISTS idx_viewing_availability_agent ON viewing_availability(agent_id);

CREATE TABLE IF NOT EXISTS viewing_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    property_id UUID NOT NULL,
    contact_id UUID NOT NULL,
    agent_id UUID NOT NULL,
    deal_id UUID,
    
    -- Booking Details
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    status VARCHAR(50) DEFAULT 'pending', -- pending, confirmed, completed, cancelled, no_show
    
    -- Contact Info for reminders
    contact_name VARCHAR(255),
    contact_phone VARCHAR(50),
    contact_email VARCHAR(255),
    
    -- Notes
    notes TEXT,
    agent_notes TEXT,
    
    -- Reminders
    reminder_sent_24h BOOLEAN DEFAULT FALSE,
    reminder_sent_1h BOOLEAN DEFAULT FALSE,
    
    -- Calendar Event Link
    calendar_event_id UUID REFERENCES calendar_events(id) ON DELETE SET NULL,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID,
    cancellation_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_viewing_bookings_property ON viewing_bookings(property_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_viewing_bookings_agent ON viewing_bookings(agent_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_viewing_bookings_contact ON viewing_bookings(contact_id);
CREATE INDEX IF NOT EXISTS idx_viewing_bookings_deal ON viewing_bookings(deal_id);

-- =============================================================================
-- USER NOTIFICATION PREFERENCES (for push notifications)
-- =============================================================================

CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    organization_id UUID NOT NULL,
    
    -- Channel Preferences
    email_enabled BOOLEAN DEFAULT TRUE,
    push_enabled BOOLEAN DEFAULT TRUE,
    whatsapp_enabled BOOLEAN DEFAULT FALSE,
    sms_enabled BOOLEAN DEFAULT FALSE,
    
    -- Event Type Preferences (JSONB for flexibility)
    event_preferences JSONB DEFAULT '{
        "deal_assigned": {"email": true, "push": true},
        "deal_stage_changed": {"email": true, "push": true},
        "task_due": {"email": true, "push": true},
        "task_assigned": {"email": true, "push": true},
        "viewing_reminder": {"email": true, "push": true, "whatsapp": true},
        "document_signed": {"email": true, "push": true},
        "commission_paid": {"email": true, "push": true},
        "target_achieved": {"email": true, "push": true}
    }',
    
    -- Quiet Hours
    quiet_hours_enabled BOOLEAN DEFAULT FALSE,
    quiet_hours_start TIME DEFAULT '22:00',
    quiet_hours_end TIME DEFAULT '07:00',
    quiet_hours_timezone VARCHAR(100) DEFAULT 'Africa/Accra',
    
    -- Digest Settings
    daily_digest_enabled BOOLEAN DEFAULT FALSE,
    daily_digest_time TIME DEFAULT '08:00',
    weekly_digest_enabled BOOLEAN DEFAULT TRUE,
    weekly_digest_day INTEGER DEFAULT 1, -- Monday
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- PUSH NOTIFICATION SUBSCRIPTIONS (for web push)
-- =============================================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    
    -- Web Push Subscription Details
    endpoint VARCHAR(1000) NOT NULL,
    p256dh_key VARCHAR(500), -- Encryption key
    auth_key VARCHAR(500), -- Auth secret
    
    -- Device Info
    user_agent VARCHAR(500),
    device_type VARCHAR(50), -- desktop, mobile, tablet
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_push_endpoint UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

-- =============================================================================
-- CLEANUP FUNCTION
-- =============================================================================

-- Function to clean up expired presence records
CREATE OR REPLACE FUNCTION cleanup_expired_presence()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM user_presence WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old realtime events (keep last 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_realtime_events()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM realtime_events WHERE created_at < NOW() - INTERVAL '7 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- UPDATED_AT TRIGGERS
-- =============================================================================

-- Only create the function if it doesn't already exist (avoid ownership issues)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        EXECUTE $func$
            CREATE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $trigger$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $trigger$ LANGUAGE plpgsql
        $func$;
    END IF;
END $$;

DROP TRIGGER IF EXISTS update_calendar_events_updated_at ON calendar_events;
CREATE TRIGGER update_calendar_events_updated_at
    BEFORE UPDATE ON calendar_events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_viewing_availability_updated_at ON viewing_availability;
CREATE TRIGGER update_viewing_availability_updated_at
    BEFORE UPDATE ON viewing_availability
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_viewing_bookings_updated_at ON viewing_bookings;
CREATE TRIGGER update_viewing_bookings_updated_at
    BEFORE UPDATE ON viewing_bookings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER update_notification_preferences_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE user_presence IS 'Real-time presence tracking for collaborative features';
COMMENT ON TABLE realtime_events IS 'Event log for SSE real-time updates';
COMMENT ON TABLE calendar_events IS 'Unified calendar for all CRM events';
COMMENT ON TABLE viewing_availability IS 'Agent availability slots for property viewings';
COMMENT ON TABLE viewing_bookings IS 'Property viewing appointments';
COMMENT ON TABLE notification_preferences IS 'User notification channel preferences';
COMMENT ON TABLE push_subscriptions IS 'Web push notification subscriptions';
