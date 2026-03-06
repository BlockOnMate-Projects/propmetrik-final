-- ============================================================
-- Migration 162: Add Indices & Data Autopilot Schedule
-- Creates a weekly index digest schedule for CCI/GHAI/GHPI updates
-- ============================================================

BEGIN;

-- Insert the Indices & Data weekly schedule
-- Uses publication_type = 'index_update' so the frontend can filter by type
-- Product remains 'outlook' to satisfy the CHECK constraint
INSERT INTO autopilot_schedules (
  id, publication_type, product, edition, region,
  cron_expression, enabled, data_endpoints, chart_rules,
  template_id, quality_thresholds, word_count_target
)
VALUES (
  gen_random_uuid(),
  'index_update',           -- legacy type — used by frontend /insights/indices
  'outlook',                -- product family
  'weekly',                 -- edition
  NULL,                     -- national scope
  '0 9 * * 3',             -- Wednesday 9AM GMT (mid-week index digest)
  true,
  '{"ml/market/price-index","ml/construction/index","ml/hai/current","ml/hai/history","rental/summary","rental/yields"}',
  '{"count":[3,5],"diversityMin":2,"mustInclude":["cci","ghai","ghpi"]}',
  'index_digest_v1',
  '{"minConfidence":0.70,"maxSimilarity":0.85,"maxDataAgeDays":7}',
  1200
)
ON CONFLICT DO NOTHING;

COMMIT;
