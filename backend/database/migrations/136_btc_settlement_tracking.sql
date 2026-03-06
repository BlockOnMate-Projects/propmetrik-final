-- Migration: Create btc_settlements table for BTC → ERC-20 treasury settlement tracking.
-- Phase 2 of cross-currency auto-conversion.

CREATE TABLE IF NOT EXISTS btc_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Payment reference linking back to the original BTC payment
    payment_reference VARCHAR(255) NOT NULL,
    recipient_entity_id VARCHAR(66) NOT NULL,  -- bytes32 hex
    recipient_wallet VARCHAR(42) NOT NULL,       -- EVM address

    -- Entity info for DB lookups
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,

    -- BTC side
    btc_tx_hash VARCHAR(64) NOT NULL,
    principal_satoshis NUMERIC(20) NOT NULL,
    fee_satoshis NUMERIC(20) NOT NULL,
    btc_deposit_address VARCHAR(100) NOT NULL,

    -- ERC-20 conversion target
    preferred_token VARCHAR(42) NOT NULL,        -- ERC-20 address
    preferred_token_symbol VARCHAR(20) NOT NULL,
    preferred_token_decimals SMALLINT NOT NULL,

    -- Settlement tracking
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sweeping', 'converting', 'sending', 'completed', 'failed')),

    -- Filled after settlement
    settlement_tx_hash VARCHAR(66),              -- Polygon tx hash for ERC-20 transfer
    amount_out VARCHAR(100),                      -- Amount of ERC-20 sent (human-readable)
    exchange_rate NUMERIC(20, 8),                 -- BTC/USD rate used

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settled_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_btc_settlements_status ON btc_settlements (status);
CREATE INDEX IF NOT EXISTS idx_btc_settlements_entity ON btc_settlements (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_btc_settlements_payment_ref ON btc_settlements (payment_reference);
CREATE INDEX IF NOT EXISTS idx_btc_settlements_created ON btc_settlements (created_at DESC);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_btc_settlements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_btc_settlements_updated_at ON btc_settlements;
CREATE TRIGGER trg_btc_settlements_updated_at
    BEFORE UPDATE ON btc_settlements
    FOR EACH ROW
    EXECUTE FUNCTION update_btc_settlements_updated_at();

COMMENT ON TABLE btc_settlements IS
  'Tracks BTC → ERC-20 treasury settlements for recipients who prefer ERC-20 tokens over BTC.';
