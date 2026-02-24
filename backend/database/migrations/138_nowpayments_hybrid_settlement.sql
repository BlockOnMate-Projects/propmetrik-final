-- Migration 138: NOWPayments Hybrid Settlement Architecture
-- Generalizes crypto receiving preferences beyond BTC-only.
-- Clients (Deal Management, Property Management, Project Management) can configure
-- ANY preferred receiving asset (ETH, USDT, BTC, MATIC, etc.) and their wallet address.
-- NOWPayments handles cross-chain / non-EVM intake and auto-conversion.

BEGIN;

-- =====================================================
-- 1. Generalized Crypto Receiving Preferences on payment_accounts
-- =====================================================

-- Preferred settlement coin (e.g. 'eth', 'usdt', 'btc', 'matic', 'usdc')
ALTER TABLE payment_accounts
    ADD COLUMN IF NOT EXISTS crypto_preferred_settlement_coin VARCHAR(20);

-- The chain/network for settlement (e.g. 'polygon', 'ethereum', 'bitcoin', 'bsc')
ALTER TABLE payment_accounts
    ADD COLUMN IF NOT EXISTS crypto_preferred_settlement_chain VARCHAR(30);

-- Settlement wallet address (may differ from the on-chain ERC-20 wallet)
-- For BTC this is a bc1/1/3 address; for EVM chains it's 0x...
ALTER TABLE payment_accounts
    ADD COLUMN IF NOT EXISTS crypto_settlement_wallet_address VARCHAR(200);

-- When the settlement preference was last configured
ALTER TABLE payment_accounts
    ADD COLUMN IF NOT EXISTS crypto_settlement_configured_at TIMESTAMPTZ;

-- Whether NOWPayments should be used for this recipient's settlements
-- (true = off-chain via NOWPayments, false/null = on-chain ERC-20 direct)
ALTER TABLE payment_accounts
    ADD COLUMN IF NOT EXISTS crypto_use_nowpayments_settlement BOOLEAN DEFAULT FALSE;

-- =====================================================
-- 2. NOWPayments Payment Tracking Table
-- Tracks every payment created through NOWPayments (intake side)
-- =====================================================

CREATE TABLE IF NOT EXISTS nowpayments_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Our internal reference (ties to payment_transactions.reference)
    payment_reference VARCHAR(100) NOT NULL,

    -- NOWPayments identifiers
    nowpayments_id BIGINT UNIQUE,          -- payment_id from NOWPayments API
    nowpayments_invoice_id BIGINT,         -- invoice_id if using invoice flow
    purchase_id VARCHAR(100),              -- purchase_id from NOWPayments

    -- What the payer is sending
    pay_currency VARCHAR(20) NOT NULL,     -- e.g. 'btc', 'eth', 'ltc', 'sol'
    pay_amount NUMERIC(30, 10),            -- estimated amount payer sends
    actually_paid NUMERIC(30, 10) DEFAULT 0,
    pay_address VARCHAR(200),              -- deposit address for the payer

    -- Price denomination (what the payment is worth)
    price_currency VARCHAR(10) NOT NULL DEFAULT 'usd',  -- denominated in
    price_amount NUMERIC(20, 6) NOT NULL,               -- the price

    -- What NOWPayments converts to (outcome)
    outcome_currency VARCHAR(20),          -- e.g. 'usdtpolygon', 'eth', 'btc'
    outcome_amount NUMERIC(30, 10),        -- amount after conversion
    outcome_address VARCHAR(200),          -- where NOWPayments sends the outcome

    -- Settlement routing
    settlement_mode VARCHAR(20) NOT NULL DEFAULT 'direct',  -- 'direct' | 'escrow'
    -- 'direct' = NOWPayments sends directly to client wallet
    -- 'escrow' = NOWPayments normalizes to USDT on Polygon → our smart contract for escrow/fee-split

    -- For escrow mode: track the on-chain deposit
    escrow_deposit_tx_hash VARCHAR(66),    -- tx hash when escrowed USDT lands in contract
    escrow_release_tx_hash VARCHAR(66),    -- tx hash when escrow released
    escrow_payout_id VARCHAR(100),         -- NOWPayments payout ID for final conversion on release

    -- Status lifecycle:
    -- created → waiting → confirming → confirmed → sending → finished → [escrow_deposited → escrow_released → payout_sent → completed]
    -- OR: created → expired / failed / refunded
    status VARCHAR(30) NOT NULL DEFAULT 'created',

    -- Recipient info
    recipient_entity_type VARCHAR(30),
    recipient_entity_id UUID,

    -- Payer info
    payer_entity_type VARCHAR(30),         -- 'tenant', 'buyer', 'client'
    payer_entity_id UUID,

    -- Domain link (same as payment_transactions)
    domain_record_type VARCHAR(50),        -- 'rent_payment', 'deal_payment', 'project_payment'
    domain_record_id UUID,

    -- Error tracking
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,               -- when NOWPayments confirmed finished
    settled_at TIMESTAMPTZ                 -- when final settlement to client completed
);

-- =====================================================
-- 3. NOWPayments Payout Tracking Table
-- Tracks outbound payouts (used in escrow release flow)
-- When escrow releases, we trigger a NOWPayments payout to convert
-- the released stablecoin into the client's preferred settlement coin.
-- =====================================================

CREATE TABLE IF NOT EXISTS nowpayments_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Link to the original payment
    payment_reference VARCHAR(100) NOT NULL,
    nowpayments_payment_id UUID REFERENCES nowpayments_payments(id),

    -- NOWPayments payout identifiers
    nowpayments_payout_id BIGINT,          -- payout_id from NOWPayments Payout API
    nowpayments_withdrawal_id VARCHAR(100),

    -- Source (what we're sending to NOWPayments for conversion)
    source_currency VARCHAR(20) NOT NULL,  -- e.g. 'usdtpolygon'
    source_amount NUMERIC(20, 6) NOT NULL,

    -- Destination (what the client receives)
    destination_currency VARCHAR(20) NOT NULL,  -- e.g. 'btc', 'eth'
    destination_amount NUMERIC(30, 10),         -- actual amount received
    destination_address VARCHAR(200) NOT NULL,

    -- Status: pending → processing → completed → failed
    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    -- Recipient
    recipient_entity_type VARCHAR(30),
    recipient_entity_id UUID,

    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- =====================================================
-- 4. Supported Settlement Coins Reference Table
-- Defines which coins/chains we support for client settlement
-- =====================================================

CREATE TABLE IF NOT EXISTS supported_settlement_coins (
    id SERIAL PRIMARY KEY,
    coin_symbol VARCHAR(20) NOT NULL,         -- 'btc', 'eth', 'usdt', 'usdc', 'matic'
    coin_name VARCHAR(50) NOT NULL,           -- 'Bitcoin', 'Ethereum', etc.
    chain VARCHAR(30) NOT NULL,               -- 'bitcoin', 'ethereum', 'polygon', 'bsc'
    nowpayments_ticker VARCHAR(30) NOT NULL,  -- NOWPayments currency code (e.g. 'usdtpolygon', 'btc', 'eth')
    address_regex VARCHAR(200),               -- regex for wallet address validation
    is_evm_native BOOLEAN DEFAULT FALSE,      -- can be handled by our smart contract directly
    is_enabled BOOLEAN DEFAULT TRUE,
    min_settlement_usd NUMERIC(10, 2) DEFAULT 1.00,  -- minimum settlement amount in USD
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(coin_symbol, chain)
);

-- Seed supported settlement coins
INSERT INTO supported_settlement_coins (coin_symbol, coin_name, chain, nowpayments_ticker, address_regex, is_evm_native, min_settlement_usd) VALUES
    -- EVM tokens on Polygon (handled by smart contract — no NOWPayments needed for intake)
    ('usdt',  'Tether USD',       'polygon',   'usdtmatic',    '^0x[a-fA-F0-9]{40}$', TRUE,  1.00),
    ('usdc',  'USD Coin',         'polygon',   'usdcmatic',    '^0x[a-fA-F0-9]{40}$', TRUE,  1.00),
    ('weth',  'Wrapped Ether',    'polygon',   'eth',          '^0x[a-fA-F0-9]{40}$', TRUE,  1.00),
    ('matic', 'Polygon (MATIC)',  'polygon',   'maticmainnet', '^0x[a-fA-F0-9]{40}$', TRUE,  1.00),
    ('wbtc',  'Wrapped Bitcoin',  'polygon',   'wbtcmatic',    '^0x[a-fA-F0-9]{40}$', TRUE,  1.00),
    -- Non-EVM (requires NOWPayments for intake AND/OR payout)
    ('btc',   'Bitcoin',          'bitcoin',   'btc',          '^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$', FALSE, 5.00),
    ('eth',   'Ethereum',         'ethereum',  'eth',          '^0x[a-fA-F0-9]{40}$', FALSE, 2.00),
    ('ltc',   'Litecoin',         'litecoin',  'ltc',          '^[LM3][a-km-zA-HJ-NP-Z1-9]{26,33}$', FALSE, 2.00),
    ('sol',   'Solana',           'solana',    'sol',          '^[1-9A-HJ-NP-Za-km-z]{32,44}$', FALSE, 2.00),
    ('usdt',  'Tether USD',       'ethereum',  'usdterc20',    '^0x[a-fA-F0-9]{40}$', FALSE, 5.00),
    ('usdc',  'USD Coin',         'ethereum',  'usdc',         '^0x[a-fA-F0-9]{40}$', FALSE, 5.00),
    ('trx',   'Tron',             'tron',      'trx',          '^T[a-zA-HJ-NP-Z0-9]{33}$', FALSE, 2.00),
    ('usdt',  'Tether USD',       'tron',      'usdttrc20',    '^T[a-zA-HJ-NP-Z0-9]{33}$', FALSE, 2.00),
    ('bnb',   'BNB',              'bsc',       'bnbbsc',       '^0x[a-fA-F0-9]{40}$', FALSE, 2.00)
ON CONFLICT (coin_symbol, chain) DO NOTHING;

-- =====================================================
-- 5. Indexes
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_nowpayments_payments_status ON nowpayments_payments(status);
CREATE INDEX IF NOT EXISTS idx_nowpayments_payments_reference ON nowpayments_payments(payment_reference);
CREATE INDEX IF NOT EXISTS idx_nowpayments_payments_nowpay_id ON nowpayments_payments(nowpayments_id);
CREATE INDEX IF NOT EXISTS idx_nowpayments_payments_recipient ON nowpayments_payments(recipient_entity_type, recipient_entity_id);
CREATE INDEX IF NOT EXISTS idx_nowpayments_payments_created ON nowpayments_payments(created_at);
CREATE INDEX IF NOT EXISTS idx_nowpayments_payouts_status ON nowpayments_payouts(status);
CREATE INDEX IF NOT EXISTS idx_nowpayments_payouts_reference ON nowpayments_payouts(payment_reference);
CREATE INDEX IF NOT EXISTS idx_payment_accounts_settlement ON payment_accounts(crypto_preferred_settlement_coin) WHERE crypto_preferred_settlement_coin IS NOT NULL;

-- Auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION update_nowpayments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_nowpayments_payments_updated ON nowpayments_payments;
CREATE TRIGGER tr_nowpayments_payments_updated
    BEFORE UPDATE ON nowpayments_payments
    FOR EACH ROW EXECUTE FUNCTION update_nowpayments_updated_at();

DROP TRIGGER IF EXISTS tr_nowpayments_payouts_updated ON nowpayments_payouts;
CREATE TRIGGER tr_nowpayments_payouts_updated
    BEFORE UPDATE ON nowpayments_payouts
    FOR EACH ROW EXECUTE FUNCTION update_nowpayments_updated_at();

COMMIT;
