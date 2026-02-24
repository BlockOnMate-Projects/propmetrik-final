-- Migration: 010_add_fx_currency_types.sql
-- Description: Add additional currency exchange rate types for FX sync
-- Created: 2026-01-05

BEGIN;

-- Add exchange rate types for additional currencies tracked by FX service
DO $$
BEGIN
  -- Nigerian Naira
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'exchange_rate_ngn' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'economic_indicator_type_enum')) THEN
    ALTER TYPE economic_indicator_type_enum ADD VALUE IF NOT EXISTS 'exchange_rate_ngn';
  END IF;
  
  -- Chinese Yuan
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'exchange_rate_cny' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'economic_indicator_type_enum')) THEN
    ALTER TYPE economic_indicator_type_enum ADD VALUE IF NOT EXISTS 'exchange_rate_cny';
  END IF;
  
  -- Add any other common trading partner currencies
  -- South African Rand
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'exchange_rate_zar' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'economic_indicator_type_enum')) THEN
    ALTER TYPE economic_indicator_type_enum ADD VALUE IF NOT EXISTS 'exchange_rate_zar';
  END IF;
  
  -- Japanese Yen
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'exchange_rate_jpy' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'economic_indicator_type_enum')) THEN
    ALTER TYPE economic_indicator_type_enum ADD VALUE IF NOT EXISTS 'exchange_rate_jpy';
  END IF;
  
  -- Swiss Franc
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'exchange_rate_chf' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'economic_indicator_type_enum')) THEN
    ALTER TYPE economic_indicator_type_enum ADD VALUE IF NOT EXISTS 'exchange_rate_chf';
  END IF;
  
  -- Canadian Dollar
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'exchange_rate_cad' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'economic_indicator_type_enum')) THEN
    ALTER TYPE economic_indicator_type_enum ADD VALUE IF NOT EXISTS 'exchange_rate_cad';
  END IF;
  
  -- Australian Dollar
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'exchange_rate_aud' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'economic_indicator_type_enum')) THEN
    ALTER TYPE economic_indicator_type_enum ADD VALUE IF NOT EXISTS 'exchange_rate_aud';
  END IF;
  
  -- CFA Franc (West African)
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'exchange_rate_xof' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'economic_indicator_type_enum')) THEN
    ALTER TYPE economic_indicator_type_enum ADD VALUE IF NOT EXISTS 'exchange_rate_xof';
  END IF;
END$$;

COMMIT;
