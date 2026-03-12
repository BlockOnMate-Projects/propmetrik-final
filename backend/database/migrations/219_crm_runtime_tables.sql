-- Migration 219: Move CRM runtime-created tables to proper migration
-- These tables were previously auto-created at runtime by route files.
-- All use IF NOT EXISTS so this migration is idempotent.

-- From drip-campaigns.ts
CREATE TABLE IF NOT EXISTS crm_drip_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    trigger_type VARCHAR(50) NOT NULL DEFAULT 'manual',
    is_active BOOLEAN DEFAULT false,
    enrollment_count INTEGER DEFAULT 0,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS crm_drip_campaign_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES crm_drip_campaigns(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL DEFAULT 0,
    delay_days INTEGER NOT NULL DEFAULT 1,
    subject VARCHAR(300) NOT NULL,
    body TEXT NOT NULL,
    template_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_drip_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES crm_drip_campaigns(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL,
    current_step INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    last_step_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- From saved-views.ts
CREATE TABLE IF NOT EXISTS crm_saved_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    user_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('deals','contacts','companies','tasks')),
    filters JSONB NOT NULL DEFAULT '{}',
    sort_by VARCHAR(50),
    sort_order VARCHAR(4) DEFAULT 'desc',
    columns TEXT[],
    is_default BOOLEAN DEFAULT false,
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_views_org_user ON crm_saved_views(organization_id, user_id);

-- From notifications.ts
CREATE TABLE IF NOT EXISTS crm_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    user_id UUID NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(300) NOT NULL,
    message TEXT,
    entity_type VARCHAR(30),
    entity_id UUID,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_notif_user ON crm_notifications(user_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    user_id UUID NOT NULL,
    deal_stage_change BOOLEAN DEFAULT true,
    deal_won BOOLEAN DEFAULT true,
    deal_lost BOOLEAN DEFAULT true,
    task_due_soon BOOLEAN DEFAULT true,
    task_overdue BOOLEAN DEFAULT true,
    new_contact_assigned BOOLEAN DEFAULT true,
    new_deal_assigned BOOLEAN DEFAULT true,
    email_notifications BOOLEAN DEFAULT false,
    UNIQUE(organization_id, user_id)
);

-- From analytics.ts
CREATE TABLE IF NOT EXISTS crm_scheduled_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    report_type VARCHAR(50) NOT NULL,
    frequency VARCHAR(20) NOT NULL,
    format VARCHAR(10) NOT NULL DEFAULT 'pdf',
    recipients TEXT[] NOT NULL,
    pipeline_id UUID,
    is_active BOOLEAN DEFAULT true,
    last_sent_at TIMESTAMPTZ,
    next_send_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);
