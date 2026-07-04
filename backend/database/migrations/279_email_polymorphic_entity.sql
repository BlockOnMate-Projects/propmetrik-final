-- 279_email_polymorphic_entity.sql
-- Generalize the synced-email store beyond CRM so a shared Mail inbox can serve Deals,
-- Property Management (tenant/property) and Projects (contractor/vendor). Adds a polymorphic
-- entity_type + entity_id alongside the existing deal_id/contact_id (kept for back-compat), and
-- backfills them. Idempotent — mirrors emailIntegrationService.ensureEmailsTable().
--
-- Note: crm_emails is created at runtime by the service (CREATE TABLE IF NOT EXISTS); this guards
-- against the table not existing yet on a fresh DB where the service hasn't booted.

CREATE TABLE IF NOT EXISTS crm_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    user_id UUID NOT NULL,
    provider VARCHAR(20) NOT NULL,
    provider_message_id VARCHAR(500) NOT NULL,
    thread_id VARCHAR(500),
    message_id VARCHAR(500),
    subject TEXT,
    snippet TEXT,
    from_address VARCHAR(255) NOT NULL,
    from_name VARCHAR(255),
    to_addresses JSONB DEFAULT '[]',
    cc_addresses JSONB DEFAULT '[]',
    body_text TEXT,
    body_html TEXT,
    is_read BOOLEAN DEFAULT false,
    has_attachments BOOLEAN DEFAULT false,
    labels JSONB DEFAULT '[]',
    direction VARCHAR(10) DEFAULT 'inbound',
    email_date TIMESTAMPTZ NOT NULL,
    deal_id UUID,
    contact_id UUID,
    is_tracked BOOLEAN DEFAULT false,
    open_count INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0,
    first_opened_at TIMESTAMPTZ,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, provider_message_id)
);

-- Polymorphic linkage: entity_type ∈ ('deal','contact','tenant','property','tenancy','contractor','vendor',…)
ALTER TABLE crm_emails ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50);
ALTER TABLE crm_emails ADD COLUMN IF NOT EXISTS entity_id UUID;

-- Backfill from the legacy columns (deal takes precedence over contact when both are set).
UPDATE crm_emails
   SET entity_type = 'deal', entity_id = deal_id
 WHERE deal_id IS NOT NULL AND entity_id IS NULL;
UPDATE crm_emails
   SET entity_type = 'contact', entity_id = contact_id
 WHERE contact_id IS NOT NULL AND entity_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_emails_entity ON crm_emails(entity_type, entity_id) WHERE entity_id IS NOT NULL;
