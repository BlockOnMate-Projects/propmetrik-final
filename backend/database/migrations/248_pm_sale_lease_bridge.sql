-- Migration 248: PM for-sale / for-lease workflow + PM↔CRM bridge foundation
--
-- Context: A PM property carries transaction_type (sale|rental|lease) but the
-- marketplace hard-coded everything to 'rental' and the only buyer/tenant path
-- was the tenant application. This migration lays the data foundation for:
--   (1) capturing sale/lease ENQUIRIES against a PM property (property_inquiries
--       gains transaction_type, an optional offer, a deal back-link, and a
--       denormalized organization_id so the PM "Enquiries" inbox can scope by org), and
--   (2) the OPT-IN BRIDGE for customers who also pay for CRM/Deals: a PM property
--       can be mirrored into a crm_properties row, linked by source_pm_property_id.
--
-- IMPORTANT: this is a BRIDGE, not a merge. crm_properties remains the standalone
-- CRM/Deals service's own table; deals.property_ids still reference crm_properties.
-- The link column lets us (a) avoid duplicate mirrors and (b) flow a closed deal
-- back to the originating PM property. No FK is added on source_pm_property_id
-- because `properties` is range-partitioned with a composite PK (id, region); a
-- loose UUID link keeps the two services decoupled (their stated design goal).
--
-- Idempotent. Additive only — no existing column/row is mutated destructively.

BEGIN;

-- ── property_inquiries: make it sale/lease-aware + org-scoped + deal-linkable ──
ALTER TABLE property_inquiries
  ADD COLUMN IF NOT EXISTS transaction_type transaction_type_enum,
  ADD COLUMN IF NOT EXISTS offer_amount     DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS offer_currency   VARCHAR(10) DEFAULT 'GHS',
  ADD COLUMN IF NOT EXISTS deal_id          UUID,
  ADD COLUMN IF NOT EXISTS organization_id  UUID;

-- Backfill organization_id from the owning PM property (composite key id+region).
UPDATE property_inquiries pi
   SET organization_id = p.organization_id
  FROM properties p
 WHERE p.id = pi.property_id
   AND p.region = pi.property_region
   AND pi.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_inquiries_org         ON property_inquiries(organization_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_deal        ON property_inquiries(deal_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_txn_type    ON property_inquiries(transaction_type);

-- ── crm_properties: bridge link back to the originating PM property ──
ALTER TABLE crm_properties
  ADD COLUMN IF NOT EXISTS source_pm_property_id UUID;

COMMENT ON COLUMN crm_properties.source_pm_property_id IS
  'When set, this CRM property is a bridge-mirror of a Property Management property (properties.id). One mirror per PM property. NULL for native CRM listings.';

-- One CRM mirror per PM property (only enforced where the link is present).
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_properties_source_pm
  ON crm_properties(source_pm_property_id)
  WHERE source_pm_property_id IS NOT NULL;

COMMIT;
