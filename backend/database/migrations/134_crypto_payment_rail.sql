-- ============================================================
-- Migration 134: Crypto Payment Rail Support
-- ============================================================
-- Adds USDT/Polygon payment support alongside existing Paystack fiat rail.
-- All changes are ADDITIVE — existing payment flow is completely untouched.
-- See: docs/smartcontract.md Section 7
-- ============================================================

-- 1. Add crypto channel option to payment_transactions
-- NOTE: PostgreSQL enums cannot be altered in a transaction easily.
-- If payment_channel is a VARCHAR, this is a no-op conceptually (any value accepted).
-- If it's an ENUM type, we add the new value.
DO $$
BEGIN
    -- Check if payment_channel is an enum type and add value if so
    IF EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'payment_channel'
    ) THEN
        BEGIN
            ALTER TYPE payment_channel ADD VALUE IF NOT EXISTS 'crypto_usdt';
        EXCEPTION WHEN duplicate_object THEN
            NULL; -- Already exists, skip
        END;
    END IF;
END $$;

-- 2. Add crypto-specific columns to existing payment_transactions ledger
-- These are nullable — only populated for crypto payments.
ALTER TABLE payment_transactions
    ADD COLUMN IF NOT EXISTS tx_hash VARCHAR(66),
    ADD COLUMN IF NOT EXISTS block_number BIGINT,
    ADD COLUMN IF NOT EXISTS payer_wallet VARCHAR(42),
    ADD COLUMN IF NOT EXISTS recipient_wallet VARCHAR(42),
    ADD COLUMN IF NOT EXISTS crypto_currency VARCHAR(10),
    ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(12,6),
    ADD COLUMN IF NOT EXISTS principal_crypto NUMERIC(20,6),
    ADD COLUMN IF NOT EXISTS fee_crypto NUMERIC(20,6),
    ADD COLUMN IF NOT EXISTS gas_cost_matic NUMERIC(20,8);

-- 3. Add wallet address to payment_accounts (alongside existing bank/MoMo)
ALTER TABLE payment_accounts
    ADD COLUMN IF NOT EXISTS crypto_wallet_address VARCHAR(42),
    ADD COLUMN IF NOT EXISTS crypto_wallet_verified BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS crypto_wallet_registered_at TIMESTAMPTZ;

-- 4. Index for tx hash lookups (partial — only for rows that have one)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_tx_hash
    ON payment_transactions(tx_hash) WHERE tx_hash IS NOT NULL;

-- 5. Blockchain listener crash recovery table
CREATE TABLE IF NOT EXISTS blockchain_sync_state (
    id SERIAL PRIMARY KEY,
    chain_id INTEGER NOT NULL,
    contract_address VARCHAR(42) NOT NULL,
    last_processed_block BIGINT NOT NULL,
    last_processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(chain_id, contract_address)
);

-- 6. Exchange rate audit log
CREATE TABLE IF NOT EXISTS exchange_rate_log (
    id SERIAL PRIMARY KEY,
    from_currency VARCHAR(3) NOT NULL,
    to_currency VARCHAR(10) NOT NULL,
    rate NUMERIC(12,6) NOT NULL,
    source VARCHAR(50) NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Index for exchange_rate_log queries (by date)
CREATE INDEX IF NOT EXISTS idx_exchange_rate_log_fetched_at
    ON exchange_rate_log(fetched_at DESC);

-- 8. Comment documentation
COMMENT ON COLUMN payment_transactions.tx_hash IS 'Polygon transaction hash (crypto payments only)';
COMMENT ON COLUMN payment_transactions.block_number IS 'Polygon block number (crypto payments only)';
COMMENT ON COLUMN payment_transactions.payer_wallet IS 'Payer wallet address (crypto payments only)';
COMMENT ON COLUMN payment_transactions.recipient_wallet IS 'Recipient wallet address (crypto payments only)';
COMMENT ON COLUMN payment_transactions.crypto_currency IS 'Crypto token symbol, e.g. USDT (crypto payments only)';
COMMENT ON COLUMN payment_transactions.exchange_rate IS 'GHS to USDT rate at payment time (crypto payments only)';
COMMENT ON COLUMN payment_transactions.principal_crypto IS 'Principal amount in USDT 6-decimal (crypto payments only)';
COMMENT ON COLUMN payment_transactions.fee_crypto IS 'Service fee in USDT 6-decimal (crypto payments only)';
COMMENT ON COLUMN payment_transactions.gas_cost_matic IS 'Gas cost in MATIC (crypto payments only)';
COMMENT ON COLUMN payment_accounts.crypto_wallet_address IS 'Polygon wallet for crypto payouts (optional)';
COMMENT ON TABLE blockchain_sync_state IS 'Tracks last processed block for blockchain listener crash recovery';
COMMENT ON TABLE exchange_rate_log IS 'Audit trail for GHS/USD exchange rates used in crypto payments';
