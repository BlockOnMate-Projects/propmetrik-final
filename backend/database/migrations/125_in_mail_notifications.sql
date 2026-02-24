-- Migration: In-Mail Notification System
-- Creates a unified notification inbox for all PropMetrik users
-- Supports notifications from all services: E-Sign, Property Management, Valuation, CRM, Projects

-- =============================================================================
-- USER NOTIFICATIONS (In-Mail Inbox)
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Recipient
    user_id UUID NOT NULL,  -- PropMetrik user (Keycloak sub)
    organization_id UUID,    -- Optional organization context
    
    -- Notification content
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    summary TEXT,            -- Short preview for notification list
    
    -- Categorization
    category TEXT NOT NULL CHECK (category IN (
        'esign',           -- E-Sign documents
        'property',        -- Property management
        'valuation',       -- Valuation reports
        'crm',             -- CRM deals/leads
        'project',         -- Project management
        'finance',         -- Payments, invoices
        'system',          -- System notifications
        'alert'            -- Alerts and warnings
    )),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    
    -- Source context
    source_type TEXT NOT NULL,     -- e.g., 'esign_envelope', 'lease', 'valuation_report', 'deal'
    source_id TEXT,                -- ID of the related entity
    source_url TEXT,               -- Deep link to the entity
    
    -- Action buttons
    actions JSONB DEFAULT '[]',    -- Array of {label, url, type: 'primary'|'secondary'}
    
    -- Status
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    is_archived BOOLEAN DEFAULT FALSE,
    archived_at TIMESTAMPTZ,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',   -- Additional context-specific data
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,        -- Optional expiration for time-sensitive notifications
    
    -- Soft delete
    deleted_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON user_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON user_notifications(user_id, is_read) WHERE is_read = FALSE AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_category ON user_notifications(user_id, category);
CREATE INDEX IF NOT EXISTS idx_notifications_source ON user_notifications(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON user_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON user_notifications(user_id, priority) WHERE priority IN ('high', 'urgent');

-- =============================================================================
-- NOTIFICATION PREFERENCES (Update existing table)
-- =============================================================================

-- Ensure table exists (it should from 067_realtime_presence.sql, but just in case)
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns safely
DO $$
BEGIN
    -- inbox_enabled
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'inbox_enabled') THEN
        ALTER TABLE notification_preferences ADD COLUMN inbox_enabled BOOLEAN DEFAULT TRUE;
    END IF;

    -- email_digest_enabled
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'email_digest_enabled') THEN
        ALTER TABLE notification_preferences ADD COLUMN email_digest_enabled BOOLEAN DEFAULT FALSE;
    END IF;

    -- email_digest_frequency
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'email_digest_frequency') THEN
        ALTER TABLE notification_preferences ADD COLUMN email_digest_frequency TEXT DEFAULT 'daily' CHECK (email_digest_frequency IN ('immediate', 'hourly', 'daily', 'weekly'));
    END IF;

    -- email_address
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'email_address') THEN
        ALTER TABLE notification_preferences ADD COLUMN email_address TEXT;
    END IF;

    -- category_settings
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'category_settings') THEN
        ALTER TABLE notification_preferences ADD COLUMN category_settings JSONB DEFAULT '{
            "esign": {"inbox": true, "email": true, "push": false},
            "property": {"inbox": true, "email": false, "push": false},
            "valuation": {"inbox": true, "email": true, "push": false},
            "crm": {"inbox": true, "email": false, "push": false},
            "project": {"inbox": true, "email": false, "push": false},
            "finance": {"inbox": true, "email": true, "push": false},
            "system": {"inbox": true, "email": false, "push": false},
            "alert": {"inbox": true, "email": true, "push": true}
        }'::jsonb;
    END IF;
    
    -- quiet_hours_enabled (might exist from 067)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'quiet_hours_enabled') THEN
        ALTER TABLE notification_preferences ADD COLUMN quiet_hours_enabled BOOLEAN DEFAULT FALSE;
    END IF;

    -- quiet_hours_start (might exist from 067 as TIME)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'quiet_hours_start') THEN
        ALTER TABLE notification_preferences ADD COLUMN quiet_hours_start TIME;
    END IF;

    -- quiet_hours_end (might exist from 067 as TIME)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'quiet_hours_end') THEN
        ALTER TABLE notification_preferences ADD COLUMN quiet_hours_end TIME;
    END IF;
    
    -- timezone (067 uses quiet_hours_timezone, this adds timezone)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'timezone') THEN
        ALTER TABLE notification_preferences ADD COLUMN timezone TEXT DEFAULT 'Africa/Accra';
    END IF;

END $$;

-- =============================================================================
-- NOTIFICATION TEMPLATES
-- =============================================================================
CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Template identification
    code TEXT NOT NULL UNIQUE,    -- e.g., 'esign.document_ready', 'lease.payment_due'
    category TEXT NOT NULL,
    
    -- Template content
    title_template TEXT NOT NULL,
    body_template TEXT NOT NULL,
    summary_template TEXT,
    
    -- Default settings
    default_priority TEXT DEFAULT 'normal',
    default_actions JSONB DEFAULT '[]',
    
    -- Active/inactive
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SEED DEFAULT NOTIFICATION TEMPLATES
-- =============================================================================
INSERT INTO notification_templates (code, category, title_template, body_template, summary_template, default_priority, default_actions) VALUES

-- E-Sign templates
('esign.document_ready', 'esign', 
 'Document Ready to Sign', 
 'You have a new document "{{document_title}}" waiting for your signature from {{sender_name}}.', 
 'New document from {{sender_name}}',
 'high',
 '[{"label": "Sign Now", "url": "{{signing_url}}", "type": "primary"}]'),

('esign.document_signed', 'esign',
 'Document Signed',
 '{{signer_name}} has signed the document "{{document_title}}".',
 '{{signer_name}} signed',
 'normal',
 '[{"label": "View Document", "url": "{{document_url}}", "type": "primary"}]'),

('esign.document_completed', 'esign',
 'Document Completed',
 'All parties have signed "{{document_title}}". The completed document is ready for download.',
 'All signatures collected',
 'normal',
 '[{"label": "Download", "url": "{{download_url}}", "type": "primary"}]'),

-- Property Management templates
('lease.payment_due', 'property',
 'Rent Payment Due',
 'Rent payment of {{amount}} is due on {{due_date}} for {{property_address}}.',
 'Payment due: {{amount}}',
 'high',
 '[{"label": "Pay Now", "url": "{{payment_url}}", "type": "primary"}]'),

('lease.payment_received', 'property',
 'Payment Received',
 'We received your payment of {{amount}} for {{property_address}}.',
 'Payment confirmed',
 'low',
 '[]'),

('lease.maintenance_update', 'property',
 'Maintenance Request Update',
 'Your maintenance request "{{request_title}}" has been {{status}}.',
 'Maintenance: {{status}}',
 'normal',
 '[{"label": "View Details", "url": "{{request_url}}", "type": "primary"}]'),

-- Valuation templates
('valuation.report_ready', 'valuation',
 'Valuation Report Ready',
 'The valuation report for {{property_address}} is ready for review.',
 'Report ready for review',
 'normal',
 '[{"label": "View Report", "url": "{{report_url}}", "type": "primary"}]'),

('valuation.approval_required', 'valuation',
 'Approval Required',
 'Valuation report for {{property_address}} requires your approval.',
 'Approval needed',
 'high',
 '[{"label": "Review & Approve", "url": "{{report_url}}", "type": "primary"}]'),

-- CRM templates
('crm.lead_assigned', 'crm',
 'New Lead Assigned',
 'You have been assigned a new lead: {{lead_name}} for {{property_address}}.',
 'New lead: {{lead_name}}',
 'normal',
 '[{"label": "View Lead", "url": "{{lead_url}}", "type": "primary"}]'),

('crm.deal_stage_changed', 'crm',
 'Deal Stage Updated',
 'Deal "{{deal_name}}" has moved to {{new_stage}}.',
 'Deal moved to {{new_stage}}',
 'normal',
 '[{"label": "View Deal", "url": "{{deal_url}}", "type": "primary"}]'),

-- Project Management templates
('project.task_assigned', 'project',
 'Task Assigned',
 'You have been assigned a new task: "{{task_name}}" in project {{project_name}}.',
 'New task: {{task_name}}',
 'normal',
 '[{"label": "View Task", "url": "{{task_url}}", "type": "primary"}]'),

('project.milestone_due', 'project',
 'Milestone Due Soon',
 'Milestone "{{milestone_name}}" in {{project_name}} is due on {{due_date}}.',
 'Due: {{due_date}}',
 'high',
 '[{"label": "View Milestone", "url": "{{milestone_url}}", "type": "primary"}]')

ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE user_notifications IS 'Unified in-mail notification inbox for all PropMetrik users';
COMMENT ON TABLE notification_preferences IS 'User preferences for notification delivery';
COMMENT ON TABLE notification_templates IS 'Templates for generating notifications across services';

COMMENT ON COLUMN user_notifications.actions IS 'JSON array of action buttons: [{label, url, type}]';
COMMENT ON COLUMN user_notifications.metadata IS 'Context-specific data for the notification';
COMMENT ON COLUMN notification_preferences.category_settings IS 'Per-category notification channel preferences';
