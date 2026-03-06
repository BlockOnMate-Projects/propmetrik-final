-- Migration 139: BTC Native Cleanup
-- Removes BTC-specific tables and columns that are no longer needed
-- after switching to NOWPayments for all cross-chain conversions.
-- WBTC remains as an ERC-20 token in the on-chain allowlist.

BEGIN;

-- Drop BTC settlement tracking tables (Phase 2 & Phase 3)
DROP TABLE IF EXISTS btc_settlements CASCADE;
DROP TABLE IF EXISTS btc_reverse_settlements CASCADE;

-- Remove BTC-specific columns from payment_accounts
ALTER TABLE payment_accounts
    DROP COLUMN IF EXISTS crypto_wants_btc_settlement,
    DROP COLUMN IF EXISTS crypto_btc_address,
    DROP COLUMN IF EXISTS crypto_btc_settlement_set_at;

-- Remove BTC derivation index from app_settings (if table exists)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_settings') THEN
        DELETE FROM app_settings WHERE key = 'btc_derivation_index';
    END IF;
END $$;

COMMIT;
