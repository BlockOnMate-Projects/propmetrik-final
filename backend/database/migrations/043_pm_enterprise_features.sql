-- Phase 4.5: Property Management Enterprise Features
-- Audit Trail & Supporting Tables

-- Audit Logs Table
CREATE TABLE IF NOT EXISTS pm_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    user_id UUID NOT NULL,
    user_name VARCHAR(255),
    action VARCHAR(50) NOT NULL,
    resource VARCHAR(50) NOT NULL,
    resource_id VARCHAR(255) NOT NULL,
    resource_name VARCHAR(255),
    previous_data JSONB,
    new_data JSONB,
    changed_fields TEXT[],
    ip_address INET,
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_pm_audit_logs_org ON pm_audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_pm_audit_logs_user ON pm_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_pm_audit_logs_action ON pm_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_pm_audit_logs_resource ON pm_audit_logs(resource);
CREATE INDEX IF NOT EXISTS idx_pm_audit_logs_resource_id ON pm_audit_logs(resource_id);
CREATE INDEX IF NOT EXISTS idx_pm_audit_logs_created ON pm_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pm_audit_logs_org_created ON pm_audit_logs(organization_id, created_at DESC);

-- Add rent increase tracking columns to tenancies (using existing table name without pm_ prefix)
ALTER TABLE tenancies 
ADD COLUMN IF NOT EXISTS rent_increase_effective_date DATE,
ADD COLUMN IF NOT EXISTS rent_increase_reason TEXT,
ADD COLUMN IF NOT EXISTS previous_rent DECIMAL(12, 2);

-- Notification Preferences Table
CREATE TABLE IF NOT EXISTS pm_notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    tenant_id UUID REFERENCES tenants(id),
    notification_type VARCHAR(50) NOT NULL,
    channel VARCHAR(20) NOT NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, tenant_id, notification_type, channel)
);

-- Notification Log Table (for tracking sent notifications)
CREATE TABLE IF NOT EXISTS pm_notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    tenant_id UUID REFERENCES tenants(id),
    notification_type VARCHAR(50) NOT NULL,
    channel VARCHAR(20) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(255),
    content TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pm_notification_logs_org ON pm_notification_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_pm_notification_logs_tenant ON pm_notification_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pm_notification_logs_status ON pm_notification_logs(status);
CREATE INDEX IF NOT EXISTS idx_pm_notification_logs_created ON pm_notification_logs(created_at DESC);

-- Scheduled Tasks Table (for rent reminders, lease expiry warnings)
CREATE TABLE IF NOT EXISTS pm_scheduled_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    task_type VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    scheduled_for TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    executed_at TIMESTAMPTZ,
    result JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pm_scheduled_tasks_org ON pm_scheduled_tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_pm_scheduled_tasks_scheduled ON pm_scheduled_tasks(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_pm_scheduled_tasks_status ON pm_scheduled_tasks(status);

-- Add created_by column to maintenance_work_orders if not exists
ALTER TABLE maintenance_work_orders 
ADD COLUMN IF NOT EXISTS created_by UUID;

-- Add created_by column to properties if not exists (using valuation properties table)
-- Properties table is in properties schema, skip this

-- Add created_by column to tenants if not exists
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS created_by UUID;
