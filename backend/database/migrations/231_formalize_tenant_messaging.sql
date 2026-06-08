-- Migration 231: Formalize tenant messaging + notification tables
--
-- tenant_conversations, tenant_messages and tenant_notifications were created
-- ad hoc (no prior migration) and are referenced by the tenant portal and the
-- landlord PM messaging routes. This migration codifies their schema so the DB
-- is reproducible and adds the indexes the notification core relies on.
-- All statements are idempotent — they will not disturb existing rows.

-- =============================================================================
-- TENANT NOTIFICATIONS (tenant-portal in-app inbox)
-- =============================================================================
CREATE TABLE IF NOT EXISTS tenant_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    type TEXT NOT NULL DEFAULT 'system',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    action_url TEXT,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_notifications_tenant ON tenant_notifications(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_notifications_unread ON tenant_notifications(tenant_id) WHERE is_read = FALSE;

-- =============================================================================
-- TENANT CONVERSATIONS (tenant <-> landlord threads)
-- =============================================================================
CREATE TABLE IF NOT EXISTS tenant_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenancy_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    subject TEXT,
    landlord_unread_count INTEGER NOT NULL DEFAULT 0,
    tenant_unread_count INTEGER NOT NULL DEFAULT 0,
    last_message_at TIMESTAMPTZ,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_conversations_org ON tenant_conversations(organization_id, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_tenant_conversations_tenancy ON tenant_conversations(tenancy_id);

-- =============================================================================
-- TENANT MESSAGES
-- =============================================================================
CREATE TABLE IF NOT EXISTS tenant_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES tenant_conversations(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('tenant', 'landlord')),
    sender_id TEXT NOT NULL,
    content TEXT NOT NULL,
    attachment_url TEXT,
    attachment_name TEXT,
    attachment_type TEXT,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_messages_conversation ON tenant_messages(conversation_id, created_at ASC);

COMMENT ON TABLE tenant_conversations IS 'Tenant <-> landlord message threads (one per tenancy subject)';
COMMENT ON TABLE tenant_messages IS 'Individual messages within a tenant conversation';
COMMENT ON TABLE tenant_notifications IS 'Tenant-portal in-app notification inbox';
