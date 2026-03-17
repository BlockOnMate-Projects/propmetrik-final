-- Migration 225: REMOVED
-- Seeded GDV data was fabricated. Residual method now derives sale price/sqm
-- from actual comparable transaction evidence (valuation_comparables table).
-- This migration is intentionally empty.

DROP TABLE IF EXISTS development_sale_prices CASCADE;
