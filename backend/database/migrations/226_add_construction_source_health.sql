-- Add missing source health records for construction data sources
-- These were missing from the initial migration 009, causing silent failures
-- when the sync service tried to track health for construction sources.

INSERT INTO economic_data_source_health (source_name, sync_frequency, is_enabled) VALUES
  ('NPA Fuel Prices', 'weekly', TRUE),
  ('Local Material Prices (ConstructionGhana.com)', 'weekly', TRUE),
  ('GSS Labor Rates', 'weekly', TRUE),
  ('GREDA/BRRI', 'weekly', TRUE)
ON CONFLICT (source_name) DO UPDATE SET
  sync_frequency = EXCLUDED.sync_frequency,
  is_enabled = EXCLUDED.is_enabled;
