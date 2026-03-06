-- Migration: 149_add_client_id_to_valuations
-- Description: Add client_id linkage to valuations table
-- Created: 2026-02-17

ALTER TABLE valuations
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES valuation_clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_valuations_client_id ON valuations(client_id);
