-- Migration: 011_add_wdi_indicator_types
-- Description: Add missing indicator types for WDI backfill
-- Created: 2026-01-05

-- Add missing indicator types for WDI data
ALTER TYPE economic_indicator_type_enum ADD VALUE IF NOT EXISTS 'lending_rate';
ALTER TYPE economic_indicator_type_enum ADD VALUE IF NOT EXISTS 'prime_rate';
ALTER TYPE economic_indicator_type_enum ADD VALUE IF NOT EXISTS 'exchange_rate_usd_annual';
ALTER TYPE economic_indicator_type_enum ADD VALUE IF NOT EXISTS 'gdp_per_capita_usd';
ALTER TYPE economic_indicator_type_enum ADD VALUE IF NOT EXISTS 'population';
