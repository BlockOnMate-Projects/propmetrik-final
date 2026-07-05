-- ============================================================================
-- Listing Mandates — Marketplace Trust & Anti-Fraud, Phase 3 (Gate C).
--
-- "Right to list": before a property appears on the public marketplace it must
-- either (a) carry a signed OWNER MANDATE (the owner e-signed authorization for
-- this company to list this property), or (b) be SELF-ATTESTED by an owner-operator.
-- The linked e-sign envelope (esign_envelopes) is the source of truth for signed
-- state; this row caches metadata + links property ↔ envelope.
--
-- property_id is polymorphic (properties is region-partitioned; crm_properties is
-- separate) → no FK on property_id, disambiguated by property_source.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS listing_mandates (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    property_source      VARCHAR(8) NOT NULL,          -- pm | crm
    property_id          UUID NOT NULL,
    -- owner_mandate (owner e-signs) | self_attested (owner-operator asserts ownership)
    kind                 VARCHAR(20) NOT NULL DEFAULT 'owner_mandate',
    envelope_id          UUID,                          -- esign_envelopes.id (owner_mandate)

    owner_name           VARCHAR(255),
    owner_email          VARCHAR(255),
    owner_phone          VARCHAR(50),
    authorized_txn_type  VARCHAR(20),                   -- sale | rental | lease
    price_ceiling        NUMERIC,
    price_currency       VARCHAR(3),

    -- Cache of the envelope state (envelope is authoritative):
    -- pending | signed | declined | expired | self_attested | voided
    status               VARCHAR(20) NOT NULL DEFAULT 'pending',
    signed_at            TIMESTAMPTZ,
    expires_at           TIMESTAMPTZ,

    created_by           UUID REFERENCES users(id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_mandates_prop     ON listing_mandates(property_source, property_id);
CREATE INDEX IF NOT EXISTS idx_listing_mandates_envelope ON listing_mandates(envelope_id);
CREATE INDEX IF NOT EXISTS idx_listing_mandates_org      ON listing_mandates(organization_id);
