-- Migration: 280_tenant_autopay_mandates
-- Tenant rent Auto-Pay: stores a REUSABLE Paystack authorization ("mandate") per
-- tenancy so the daily autopay job can charge outstanding rent customer-not-present.
--
-- Design notes:
--  * A mandate is created `pending` when the tenant enables autopay, then activated
--    when a successful CARD rent payment yields a reusable authorization_code
--    (captured in paymentProcessor.verifyAndRecordPayment). Ghana MoMo typically
--    returns reusable:false, so autopay is effectively card-backed.
--  * Every actual charge is logged in payment_transactions (the ledger) — this table
--    only holds the standing mandate + operational state, NOT a duplicate charge log.
--  * One active mandate per tenancy (partial unique index below).

CREATE TABLE IF NOT EXISTS tenant_autopay_mandates (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    tenancy_id            UUID NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
    tenant_id             UUID NOT NULL,
    organization_id       UUID NOT NULL,

    -- Reusable Paystack authorization (the "mandate"). NULL while status = 'pending'.
    authorization_code    TEXT,
    authorization_email   TEXT,            -- email the auth was created with (must match on recharge)
    channel               TEXT,            -- 'card' | 'mobile_money'
    card_last4            TEXT,
    card_bank             TEXT,
    card_exp              TEXT,            -- "MM/YY"

    -- Schedule
    charge_day            INTEGER NOT NULL DEFAULT 5,   -- day of month to attempt (1-28)
    currency              TEXT NOT NULL DEFAULT 'GHS',

    -- Lifecycle: pending (awaiting first card auth) → active → paused | revoked
    status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'active', 'paused', 'revoked')),

    -- Operational state
    last_charge_at        TIMESTAMPTZ,
    last_charge_reference TEXT,
    last_attempt_at       TIMESTAMPTZ,     -- guards against double-charging within a day
    last_error            TEXT,
    consecutive_failures  INTEGER NOT NULL DEFAULT 0,

    enabled_by            TEXT,            -- 'tenant' (audit)
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- At most ONE non-revoked mandate per tenancy.
CREATE UNIQUE INDEX IF NOT EXISTS uq_autopay_mandate_active_per_tenancy
    ON tenant_autopay_mandates (tenancy_id)
    WHERE status <> 'revoked';

CREATE INDEX IF NOT EXISTS idx_autopay_mandates_tenant       ON tenant_autopay_mandates (tenant_id);
CREATE INDEX IF NOT EXISTS idx_autopay_mandates_org          ON tenant_autopay_mandates (organization_id);
-- The cron sweep: active mandates due on a given charge_day.
CREATE INDEX IF NOT EXISTS idx_autopay_mandates_active_day   ON tenant_autopay_mandates (charge_day)
    WHERE status = 'active';

-- Keep updated_at fresh (reuses the shared trigger fn created in earlier migrations).
DROP TRIGGER IF EXISTS update_tenant_autopay_mandates_updated_at ON tenant_autopay_mandates;
CREATE TRIGGER update_tenant_autopay_mandates_updated_at
    BEFORE UPDATE ON tenant_autopay_mandates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
