-- Migration 122: WhatsApp Tenant Notifications
-- Adds tracking for WhatsApp notifications sent to tenants

-- WhatsApp notifications log table
CREATE TABLE IF NOT EXISTS whatsapp_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tenancy_id UUID REFERENCES tenancies(id) ON DELETE SET NULL,
    notification_type VARCHAR(50) NOT NULL,
    whatsapp_message_id VARCHAR(100),
    status VARCHAR(20) DEFAULT 'sent',  -- sent, delivered, read, failed
    sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_tenant 
    ON whatsapp_notifications(tenant_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_type 
    ON whatsapp_notifications(notification_type);

CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_sent_at 
    ON whatsapp_notifications(sent_at);

CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_message_id 
    ON whatsapp_notifications(whatsapp_message_id);

-- Add notification_preferences to tenants table if not exists
ALTER TABLE tenants 
    ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{
        "email": true,
        "sms": true,
        "whatsapp": true,
        "push": true
    }';

-- Add calendar_event_id to maintenance_work_orders if not exists
ALTER TABLE maintenance_work_orders
    ADD COLUMN IF NOT EXISTS calendar_event_id VARCHAR(255);

-- Add comment
COMMENT ON TABLE whatsapp_notifications IS 'Tracks all WhatsApp notifications sent to tenants for auditing and analytics';
COMMENT ON COLUMN whatsapp_notifications.notification_type IS 'Type: rent_reminder, overdue_notice, payment_confirmation, maintenance_ack, maintenance_scheduled, maintenance_in_progress, maintenance_completed, lease_renewal, lease_signed, emergency_alert, announcement';
