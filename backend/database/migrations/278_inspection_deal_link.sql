-- Migration 278: link property inspections to CRM deals (dual-surface reuse)
--
-- The same inspection engine (mig 277) now serves two workflows: PM landlord/tenant
-- condition reports (move-in/out) AND CRM buyer due-diligence inspections attached to a
-- sales deal. This adds the optional deal/contact link so a CRM deal can own an inspection
-- without duplicating the schema or service.
--
-- Idempotent (IF NOT EXISTS); safe to re-run.

ALTER TABLE property_inspections
    ADD COLUMN IF NOT EXISTS deal_id    UUID,   -- CRM deal this inspection belongs to (NULL for PM-only inspections)
    ADD COLUMN IF NOT EXISTS contact_id UUID;   -- deal's primary contact, for convenience

CREATE INDEX IF NOT EXISTS idx_inspections_deal ON property_inspections (deal_id) WHERE deal_id IS NOT NULL;
