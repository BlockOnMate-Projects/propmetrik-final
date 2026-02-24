-- =============================================================================
-- Migration 141: Platform Settlement Configuration
-- =============================================================================
-- Stores the platform's (PropMetrik's) preferred wallet for fee collection.
-- Admin selects coin type (BTC, ETH, USDT, etc.) and enters wallet address.
-- Replaces the hardcoded PLATFORM_SETTLEMENT_WALLET env var.
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value JSONB NOT NULL DEFAULT '{}',
    updated_by UUID,                              -- admin user who last changed
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the platform settlement wallet setting (empty — admin must configure via UI)
INSERT INTO platform_settings (setting_key, setting_value)
VALUES (
    'platform_settlement_wallet',
    '{
        "configured": false,
        "coinSymbol": null,
        "chain": null,
        "walletAddress": null,
        "useNowPayments": false,
        "note": "Admin must configure via Crypto Payments → Platform tab"
    }'::jsonb
)
ON CONFLICT (setting_key) DO NOTHING;

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_platform_settings_key ON platform_settings (setting_key);
