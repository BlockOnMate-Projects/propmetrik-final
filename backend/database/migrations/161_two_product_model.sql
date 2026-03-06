-- ============================================================
-- Migration 161: Two-Product Model
-- Converts 12 publication types to 5 products + editions
-- ============================================================

BEGIN;

-- STEP 1: Add new columns
ALTER TABLE publications
  ADD COLUMN IF NOT EXISTS product VARCHAR(50),
  ADD COLUMN IF NOT EXISTS edition VARCHAR(50);

-- STEP 2: Map old types to new product + edition
UPDATE publications SET product = 'snapshot', edition = 'adhoc'
  WHERE type = 'market_flash';

UPDATE publications SET product = 'snapshot', edition = 'weekly'
  WHERE type = 'data_brief' AND (title ILIKE '%weekly%' OR title ILIKE '%digest%');

UPDATE publications SET product = 'outlook', edition = 'monthly'
  WHERE type = 'data_brief' AND product IS NULL;

UPDATE publications SET product = 'outlook', edition = 'monthly'
  WHERE type = 'marketbeat';

UPDATE publications SET product = 'outlook', edition = 'monthly'
  WHERE type = 'research_report' AND title ILIKE '%monthly%perspective%';

UPDATE publications SET product = 'outlook', edition = 'monthly'
  WHERE type = 'index_update';

UPDATE publications SET product = 'outlook', edition = 'quarterly'
  WHERE type = 'research_report' AND (title ILIKE '%quarterly%' OR title ILIKE '%ghai%');

UPDATE publications SET product = 'outlook', edition = 'annual'
  WHERE type = 'special_report';

UPDATE publications SET product = 'outlook', edition = 'annual'
  WHERE type = 'annual_flagship';

UPDATE publications SET product = 'policy_paper', edition = 'adhoc'
  WHERE type = 'policy_paper';

UPDATE publications SET product = 'podcast', edition = 'weekly'
  WHERE type = 'podcast' OR type = 'video' OR type = 'webinar';

UPDATE publications SET product = 'press_release', edition = 'adhoc'
  WHERE type = 'press_release';

-- Catch-all for any unmapped
UPDATE publications SET product = 'outlook', edition = 'monthly'
  WHERE product IS NULL;

-- STEP 3: Make columns NOT NULL
ALTER TABLE publications
  ALTER COLUMN product SET NOT NULL,
  ALTER COLUMN edition SET NOT NULL;

-- STEP 4: Add CHECK constraints on new columns
ALTER TABLE publications
  ADD CONSTRAINT chk_product CHECK (product IN ('outlook', 'snapshot', 'policy_paper', 'press_release', 'podcast')),
  ADD CONSTRAINT chk_edition CHECK (edition IN ('monthly', 'quarterly', 'annual', 'weekly', 'adhoc'));

-- STEP 5: Keep old `type` column for rollback safety (drop in future migration)
-- Update CHECK constraint to also accept new product names as type values
ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_type_check;
ALTER TABLE publications ADD CONSTRAINT publications_type_check
  CHECK (type IN (
    'market_flash', 'data_brief', 'marketbeat', 'research_report',
    'special_report', 'annual_flagship', 'policy_paper', 'podcast',
    'video', 'index_update', 'webinar', 'press_release',
    'outlook', 'snapshot'
  ));

-- STEP 6: Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_publications_product ON publications(product);
CREATE INDEX IF NOT EXISTS idx_publications_edition ON publications(edition);
CREATE INDEX IF NOT EXISTS idx_publications_product_edition ON publications(product, edition);

-- STEP 7: Update autopilot_schedules — new product/edition columns
ALTER TABLE autopilot_schedules
  ADD COLUMN IF NOT EXISTS product VARCHAR(50),
  ADD COLUMN IF NOT EXISTS edition VARCHAR(50);

-- Drop old unique constraint to allow multiple editions per product
ALTER TABLE autopilot_schedules DROP CONSTRAINT IF EXISTS autopilot_schedules_publication_type_region_key;


-- Map old schedule types
UPDATE autopilot_schedules SET product = 'snapshot', edition = 'adhoc'
  WHERE publication_type = 'market_flash';

UPDATE autopilot_schedules SET product = 'snapshot', edition = 'weekly'
  WHERE template_id = 'weekly_digest_v1' OR template_id = 'psi_weekly_v1';

UPDATE autopilot_schedules SET product = 'outlook', edition = 'monthly'
  WHERE template_id IN ('monthly_snapshot_v1', 'cci_update_v1', 'monthly_perspective_v1', 'marketbeat_v1');

UPDATE autopilot_schedules SET product = 'outlook', edition = 'quarterly'
  WHERE template_id IN ('quarterly_outlook_v1', 'ghai_quarterly_v1');

UPDATE autopilot_schedules SET product = 'outlook', edition = 'annual'
  WHERE template_id = 'annual_outlook_v1';

UPDATE autopilot_schedules SET product = 'outlook', edition = 'monthly'
  WHERE product IS NULL;

-- STEP 8: Delete old schedules and insert new ones
DELETE FROM autopilot_schedules;

INSERT INTO autopilot_schedules (id, publication_type, product, edition, region, cron_expression, enabled, data_endpoints, chart_rules, template_id, quality_thresholds, word_count_target)
VALUES
  -- Weekly Snapshot (Mon 8AM GMT)
  (gen_random_uuid(), 'snapshot', 'snapshot', 'weekly', NULL,
   '0 8 * * 1', true,
   '{"ml/market/price-index","ml/construction/index","ml/hai/current","ml/market/activity"}',
   '{"count":[2,2],"diversityMin":2}',
   'snapshot_weekly_v1',
   '{"minConfidence":0.70,"maxSimilarity":0.85,"maxDataAgeDays":7}',
   500),

  -- Breaking Snapshot (Event-driven)
  (gen_random_uuid(), 'snapshot', 'snapshot', 'adhoc', NULL,
   'EVENT_DRIVEN', true,
   '{"ml/market/price-index","ml/construction/index","ml/market/activity"}',
   '{"count":[1,2],"diversityMin":1}',
   'snapshot_weekly_v1',
   '{"minConfidence":0.65,"maxSimilarity":0.80,"maxDataAgeDays":1}',
   500),

  -- Monthly Outlook (1st of month)
  (gen_random_uuid(), 'outlook', 'outlook', 'monthly', 'national',
   '0 8 1 * *', true,
   '{"ml/market/price-index","ml/construction/index","ml/construction/regional","ml/construction/materials","ml/construction/labor","ml/construction/forecast","ml/hai/current","ml/hai/region/greater_accra","ml/hai/region/ashanti","ml/hai/region/western","ml/market/activity","ml/market/investment","dashboard"}',
   '{"count":[6,10],"diversityMin":3,"mustInclude":["ghpi","cci"]}',
   'outlook_monthly_v1',
   '{"minConfidence":0.75,"maxSimilarity":0.80,"maxDataAgeDays":35}',
   4000),

  -- Quarterly Outlook (Jan, Apr, Jul, Oct)
  (gen_random_uuid(), 'outlook', 'outlook', 'quarterly', 'national',
   '0 8 1 1,4,7,10 *', true,
   '{"ml/market/price-index","ml/construction/index","ml/construction/regional","ml/construction/materials","ml/construction/labor","ml/construction/forecast","ml/hai/current","ml/hai/history","ml/market/activity","ml/market/investment","ml/valuations/volume","ml/performance","ml/features","ml/confidence","ml/monitoring/drift","dashboard","cohorts","velocity"}',
   '{"count":[10,15],"diversityMin":4,"mustInclude":["ghpi","cci","ghai","gcpi"]}',
   'outlook_quarterly_v1',
   '{"minConfidence":0.75,"maxSimilarity":0.75,"maxDataAgeDays":95}',
   10000),

  -- Annual Outlook (Jan 15th)
  (gen_random_uuid(), 'outlook', 'outlook', 'annual', 'national',
   '0 8 15 1 *', true,
   '{"ml/market/price-index","ml/construction/index","ml/construction/regional","ml/construction/materials","ml/construction/labor","ml/construction/forecast","ml/hai/current","ml/hai/history","ml/market/activity","ml/market/investment","ml/valuations/volume","ml/performance","ml/performance/segments","ml/performance/trend","ml/features","ml/predictions","ml/confidence","ml/monitoring/drift","dashboard","cohorts","velocity","agent-performance"}',
   '{"count":[20,30],"diversityMin":5,"mustInclude":["ghpi","cci","ghai","gcpi","gprs","dii"]}',
   'outlook_annual_v1',
   '{"minConfidence":0.80,"maxSimilarity":0.70,"maxDataAgeDays":370}',
   25000);

-- Add new unique constraint
ALTER TABLE autopilot_schedules ADD CONSTRAINT autopilot_schedules_product_edition_region_key UNIQUE (product, edition, region);


-- STEP 9: Update autopilot_runs — add product/edition
ALTER TABLE autopilot_runs
  ADD COLUMN IF NOT EXISTS product VARCHAR(50),
  ADD COLUMN IF NOT EXISTS edition VARCHAR(50);

UPDATE autopilot_runs AS ar SET
  product = p.product,
  edition = p.edition
FROM publications p
WHERE ar.publication_id = p.id AND ar.product IS NULL;

COMMIT;
