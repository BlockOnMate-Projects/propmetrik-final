-- Migration: Add reverse BTC settlement support (ERC-20 → Native BTC)
-- Phase 3 of cross-currency auto-conversion.
-- Tracks when an ERC-20 payment is swapped to WBTC on-chain and
-- needs off-chain conversion to native BTC for the recipient.

-- Add BTC settlement preference columns to payment_accounts
ALTER TABLE payment_accounts
ADD COLUMN IF NOT EXISTS crypto_wants_btc_settlement BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS crypto_btc_address VARCHAR(100),           -- Recipient's Bitcoin address (bc1q..., 1..., 3...)
ADD COLUMN IF NOT EXISTS crypto_btc_settlement_set_at TIMESTAMPTZ;

-- Index for BTC settlement recipients lookup
CREATE INDEX IF NOT EXISTS idx_payment_accounts_btc_settlement
ON payment_accounts (crypto_wants_btc_settlement)
WHERE crypto_wants_btc_settlement = TRUE;

COMMENT ON COLUMN payment_accounts.crypto_wants_btc_settlement IS
  'When TRUE, all ERC-20 payments are swapped to WBTC on-chain and converted off-chain to native BTC.';

COMMENT ON COLUMN payment_accounts.crypto_btc_address IS
  'Recipient Bitcoin address for native BTC delivery (e.g. bc1q...). Required when crypto_wants_btc_settlement = TRUE.';

-- Create reverse BTC settlements table (ERC-20 → WBTC → native BTC)
CREATE TABLE IF NOT EXISTS btc_reverse_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Payment reference linking back to the original ERC-20 payment
    payment_reference VARCHAR(255) NOT NULL,
    recipient_entity_id VARCHAR(66) NOT NULL,      -- bytes32 hex (on-chain entity ID)
    recipient_btc_address VARCHAR(100) NOT NULL,    -- Destination Bitcoin address

    -- Entity info for DB lookups
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,

    -- On-chain ERC-20 → WBTC swap details
    payer_wallet VARCHAR(42) NOT NULL,              -- Tenant's EVM wallet
    token_in VARCHAR(42) NOT NULL,                  -- Token the tenant paid with (e.g. USDT)
    token_in_symbol VARCHAR(20) NOT NULL,
    amount_in NUMERIC(30, 0) NOT NULL,              -- Amount of input token (in subunits)
    wbtc_amount NUMERIC(20, 0) NOT NULL,            -- WBTC received by treasury (in satoshis)
    fee_in NUMERIC(30, 0) NOT NULL,                 -- Platform fee in input token (in subunits)
    swap_tx_hash VARCHAR(66) NOT NULL,              -- Polygon tx hash of the on-chain swap

    -- Off-chain BTC delivery tracking
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'converting', 'sending', 'completed', 'failed')),

    -- Filled after settlement
    btc_tx_hash VARCHAR(64),                        -- Bitcoin tx hash for native BTC transfer
    btc_amount_sent NUMERIC(20, 0),                 -- Actual BTC sent in satoshis
    exchange_fee_satoshis NUMERIC(20, 0),            -- Exchange/network fees in satoshis
    exchange_rate NUMERIC(20, 8),                    -- WBTC/BTC rate (should be ~1.0)

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settled_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Error tracking
    error_message TEXT,
    retry_count SMALLINT DEFAULT 0
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_btc_reverse_settlements_status
ON btc_reverse_settlements (status);

CREATE INDEX IF NOT EXISTS idx_btc_reverse_settlements_entity
ON btc_reverse_settlements (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_btc_reverse_settlements_payment_ref
ON btc_reverse_settlements (payment_reference);

CREATE INDEX IF NOT EXISTS idx_btc_reverse_settlements_created
ON btc_reverse_settlements (created_at DESC);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_btc_reverse_settlements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_btc_reverse_settlements_updated_at ON btc_reverse_settlements;
CREATE TRIGGER trg_btc_reverse_settlements_updated_at
    BEFORE UPDATE ON btc_reverse_settlements
    FOR EACH ROW
    EXECUTE FUNCTION update_btc_reverse_settlements_updated_at();

COMMENT ON TABLE btc_reverse_settlements IS
  'Tracks ERC-20 → WBTC → native BTC reverse settlements (Phase 3). '
  'When a tenant pays ERC-20 and the landlord wants native BTC, '
  'the contract swaps to WBTC → treasury, then this service converts and sends BTC.';
