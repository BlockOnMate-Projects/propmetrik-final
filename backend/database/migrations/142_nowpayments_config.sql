-- =============================================================================
-- Migration 142: NOWPayments Configuration Store
-- =============================================================================
-- Stores NOWPayments-specific configuration that differs from platform_settings.
-- Includes: API keys (encrypted refs), callback URLs, sandbox/production toggle,
-- platform payout wallet for fees, and supported coin overrides.
--
-- This replaces hardcoded env vars and provides audit-friendly config management.
-- =============================================================================

CREATE TABLE IF NOT EXISTS nowpayments_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value JSONB NOT NULL DEFAULT '{}',
    description TEXT,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_nowpayments_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_nowpayments_config_updated ON nowpayments_config;
CREATE TRIGGER trg_nowpayments_config_updated
    BEFORE UPDATE ON nowpayments_config
    FOR EACH ROW EXECUTE FUNCTION update_nowpayments_config_timestamp();

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_nowpayments_config_key ON nowpayments_config (config_key);

-- Seed default entries
-- 1. Platform payout wallet for fee collection (mirrors platform_settings but specific to NOWPayments)
INSERT INTO nowpayments_config (config_key, config_value, description)
VALUES (
    'platform_payout_wallet',
    '{
        "configured": false,
        "walletAddress": null,
        "coinSymbol": null,
        "chain": null,
        "useNowPayments": true,
        "note": "Auto-synced from platform_settings.platform_settlement_wallet when admin configures via UI"
    }'::jsonb,
    'Platform wallet address for receiving fee payouts via NOWPayments'
)
ON CONFLICT (config_key) DO NOTHING;

-- 2. Sandbox/production mode flag
INSERT INTO nowpayments_config (config_key, config_value, description)
VALUES (
    'environment',
    '{
        "sandbox": true,
        "note": "Set to false for production. Controls which NOWPayments API base URL is used."
    }'::jsonb,
    'NOWPayments environment mode (sandbox/production)'
)
ON CONFLICT (config_key) DO NOTHING;

-- 3. Fee collection settings
INSERT INTO nowpayments_config (config_key, config_value, description)
VALUES (
    'fee_collection',
    '{
        "enabled": true,
        "mode": "payout",
        "note": "payout = collect fees via NOWPayments payout API after direct-mode settlement. escrow = fees deducted by smart contract."
    }'::jsonb,
    'Controls how platform fees are collected for NOWPayments direct-mode payments'
)
ON CONFLICT (config_key) DO NOTHING;

-- 4. IPN callback configuration
INSERT INTO nowpayments_config (config_key, config_value, description)
VALUES (
    'ipn_config',
    '{
        "callbackUrl": "https://api.propmetrik.com/api/v1/webhooks/nowpayments/ipn",
        "retryOnFailure": true,
        "maxRetries": 3
    }'::jsonb,
    'NOWPayments IPN (Instant Payment Notification) callback settings'
)
ON CONFLICT (config_key) DO NOTHING;

-- 5. Fee payout tracking table for audit trail
CREATE TABLE IF NOT EXISTS nowpayments_fee_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_reference VARCHAR(100) NOT NULL,
    nowpayments_payment_id BIGINT NOT NULL,
    fee_amount_ghs NUMERIC(12,2) NOT NULL,
    fee_amount_usd NUMERIC(12,2),
    payout_coin VARCHAR(20),
    payout_chain VARCHAR(30),
    payout_address VARCHAR(255),
    payout_amount NUMERIC(20,8),
    nowpayments_payout_id BIGINT,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',  -- pending, initiated, completed, failed, skipped
    error_message TEXT,
    initiated_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_fee_payout_payment FOREIGN KEY (payment_reference)
        REFERENCES payment_transactions(reference) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fee_payouts_payment_ref ON nowpayments_fee_payouts (payment_reference);
CREATE INDEX IF NOT EXISTS idx_fee_payouts_status ON nowpayments_fee_payouts (status);
CREATE INDEX IF NOT EXISTS idx_fee_payouts_np_id ON nowpayments_fee_payouts (nowpayments_payment_id);

-- Auto-update timestamp for fee payouts
DROP TRIGGER IF EXISTS trg_fee_payouts_updated ON nowpayments_fee_payouts;
CREATE TRIGGER trg_fee_payouts_updated
    BEFORE UPDATE ON nowpayments_fee_payouts
    FOR EACH ROW EXECUTE FUNCTION update_nowpayments_config_timestamp();
