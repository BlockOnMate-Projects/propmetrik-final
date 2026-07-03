-- Migration 273: outbound payout rail with two-person maker-checker approval
--
-- The first OUTBOUND disbursement path in PROPMETRIK. Money could be taken IN
-- (payment_transactions) and refunded (mig 272), but nothing could be paid OUT — commission
-- markAsPaid() only flipped a status, no funds moved. This table is the ledger + approval gate
-- for real disbursements (agent commissions first; contractor/vendor/settlement later).
--
-- It is deliberately NOT part of payment_transactions (inbound charges) — payouts are a
-- structurally different money movement (no payment_type_enum value, different lifecycle,
-- different destination model) and get their own ledger.
--
-- Enterprise controls baked into the schema:
--  - Two-person rule: CHECK(requested_by IS DISTINCT FROM approved_by) — the DB itself refuses
--    to let the maker approve their own payout (the service enforces it too, for a clean error).
--  - Idempotency: a partial UNIQUE index allows at most ONE active (non-terminal) payout per
--    source, so a commission can never be paid out twice, while still allowing a fresh request
--    after a failed/rejected/cancelled one.
--  - Amounts in pesewas (BIGINT) — exact for the Paystack transfer API (no float drift).
--
-- Status lifecycle:
--   pending_approval → approved → processing → paid        (happy path)
--                    → rejected                            (checker declines)
--                    → processing → failed                 (rail/webhook failure; re-requestable)
--   (any pre-execution) → cancelled                        (maker withdraws)
--
-- Idempotent (IF NOT EXISTS); safe to re-run.

CREATE TABLE IF NOT EXISTS payout_requests (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       UUID NOT NULL REFERENCES organizations(id),

    -- What is being paid out (polymorphic source for idempotency + traceability)
    payout_type           VARCHAR(30) NOT NULL,              -- 'commission' | 'contractor' | 'vendor' | 'settlement' | 'manual'
    source_id             UUID,                              -- e.g. commission_records.id (NULL for ad-hoc manual)
    source_reference      VARCHAR(120),                      -- human-facing ref

    -- Money (pesewas — matches Paystack transfer + payment_transactions)
    amount                BIGINT NOT NULL CHECK (amount > 0),
    currency              VARCHAR(3) NOT NULL DEFAULT 'GHS',

    -- Recipient
    recipient_id          UUID,                              -- users.id (agent) / contractor / vendor
    recipient_type        VARCHAR(30),                       -- 'agent' | 'contractor' | 'vendor' | 'organization'
    recipient_name        VARCHAR(255),

    -- Destination (resolved at request time; the rail branches on settlement_method)
    settlement_method     VARCHAR(20) NOT NULL,              -- 'bank' | 'momo' | 'crypto'
    bank_code             VARCHAR(20),                       -- Paystack bank/telco code
    account_number        VARCHAR(60),                       -- bank account or MoMo number
    wallet_address        VARCHAR(255),                      -- crypto
    settlement_coin       VARCHAR(20),                       -- crypto coin symbol
    settlement_chain      VARCHAR(30),                       -- crypto chain
    recipient_code        VARCHAR(120),                      -- Paystack transfer_recipient code (cached after creation)

    -- Maker-checker approval
    status                VARCHAR(20) NOT NULL DEFAULT 'pending_approval',
    requested_by          UUID NOT NULL REFERENCES users(id),
    requested_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_notes         TEXT,
    approved_by           UUID REFERENCES users(id),
    approved_at           TIMESTAMPTZ,
    review_notes          TEXT,

    -- Execution / reconciliation
    provider              VARCHAR(20),                       -- 'paystack' | 'nowpayments'
    provider_reference    VARCHAR(120),                      -- transfer reference / payout id (webhook match key)
    paid_at               TIMESTAMPTZ,
    error                 TEXT,

    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- The DB itself enforces the two-person rule.
    CONSTRAINT chk_payout_maker_not_checker CHECK (requested_by IS DISTINCT FROM approved_by)
);

-- Idempotency: at most one ACTIVE payout per source (allows re-request after a terminal failure).
CREATE UNIQUE INDEX IF NOT EXISTS uq_payout_active_source
    ON payout_requests (payout_type, source_id)
    WHERE source_id IS NOT NULL
      AND status NOT IN ('failed', 'rejected', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_payout_requests_org_status ON payout_requests (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_payout_requests_provider_ref ON payout_requests (provider_reference) WHERE provider_reference IS NOT NULL;

-- Keep updated_at fresh.
CREATE OR REPLACE FUNCTION set_payout_requests_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payout_requests_updated_at ON payout_requests;
CREATE TRIGGER trg_payout_requests_updated_at
    BEFORE UPDATE ON payout_requests
    FOR EACH ROW EXECUTE FUNCTION set_payout_requests_updated_at();
