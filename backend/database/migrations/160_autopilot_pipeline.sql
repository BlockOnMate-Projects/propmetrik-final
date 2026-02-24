-- ============================================================
-- Migration 160: Autonomous Publication Pipeline (Autopilot)
-- 
-- Adds:
-- 1. autopilot_schedules — configurable cron schedules per pub type
-- 2. autopilot_runs     — execution log for every pipeline run
-- 3. Automation columns  on existing publications table
-- ============================================================

-- ── 1. Autopilot Schedules ──────────────────────────────────
CREATE TABLE IF NOT EXISTS autopilot_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_type TEXT NOT NULL,
  region          TEXT,                            -- NULL = national/all
  cron_expression TEXT NOT NULL,                   -- node-cron compatible or 'EVENT_DRIVEN'
  enabled         BOOLEAN NOT NULL DEFAULT true,
  data_endpoints  TEXT[] NOT NULL DEFAULT '{}',    -- analytics API endpoints to consume
  chart_rules     JSONB NOT NULL DEFAULT '{}',     -- { count: [min, max], diversityMin, mustInclude }
  template_id     TEXT NOT NULL,                   -- publication template reference
  quality_thresholds JSONB NOT NULL DEFAULT '{
    "minConfidence": 0.75,
    "maxSimilarity": 0.85,
    "maxDataAgeDays": 35
  }',
  word_count_target  INT NOT NULL DEFAULT 1000,    -- target word count for structural validation
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (publication_type, region)
);

-- ── 2. Autopilot Runs ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS autopilot_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id         UUID REFERENCES autopilot_schedules(id) ON DELETE SET NULL,
  publication_type    TEXT NOT NULL,
  region              TEXT,
  status              TEXT NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running', 'published', 'deferred', 'failed')),
  publication_id      UUID REFERENCES publications(id) ON DELETE SET NULL,
  
  -- Timing
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,
  duration_ms         INT,
  
  -- Data collection
  data_endpoints_consumed TEXT[] DEFAULT '{}',
  data_snapshot       JSONB,                       -- raw data used for generation
  
  -- AI generation
  ai_model            TEXT,
  ai_tokens_used      INT,
  generation_prompt_hash TEXT,                     -- for audit reproducibility
  
  -- Quality gate results
  gate_results        JSONB,                       -- per-layer pass/fail details
  confidence_score    NUMERIC(4,3),                 -- 0.000 – 1.000
  similarity_score    NUMERIC(4,3),                 -- vs previous edition
  
  -- Outcome
  deferred_reason     TEXT,
  error_message       TEXT,
  trigger_type        TEXT DEFAULT 'scheduled',     -- 'scheduled', 'manual', 'anomaly'
  
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_autopilot_runs_status ON autopilot_runs(status);
CREATE INDEX IF NOT EXISTS idx_autopilot_runs_type   ON autopilot_runs(publication_type);
CREATE INDEX IF NOT EXISTS idx_autopilot_runs_started ON autopilot_runs(started_at DESC);

-- ── 3. Add automation columns to publications ───────────────
DO $$
BEGIN
  -- automation mode: 'manual' (default) | 'autopilot'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'publications' AND column_name = 'automation_mode'
  ) THEN
    ALTER TABLE publications ADD COLUMN automation_mode TEXT NOT NULL DEFAULT 'manual'
      CHECK (automation_mode IN ('manual', 'autopilot'));
  END IF;

  -- link to the autopilot run that created this publication
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'publications' AND column_name = 'autopilot_run_id'
  ) THEN
    ALTER TABLE publications ADD COLUMN autopilot_run_id UUID REFERENCES autopilot_runs(id) ON DELETE SET NULL;
  END IF;

  -- quality gate JSON results stored on the publication itself
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'publications' AND column_name = 'quality_gate_results'
  ) THEN
    ALTER TABLE publications ADD COLUMN quality_gate_results JSONB;
  END IF;

  -- auto-approved timestamp (NULL = not auto-approved)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'publications' AND column_name = 'auto_approved_at'
  ) THEN
    ALTER TABLE publications ADD COLUMN auto_approved_at TIMESTAMPTZ;
  END IF;
END $$;

-- ── 4. Autopilot global settings (singleton row) ────────────
CREATE TABLE IF NOT EXISTS autopilot_settings (
  id              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- singleton
  global_enabled  BOOLEAN NOT NULL DEFAULT true,
  max_publishes_per_day INT NOT NULL DEFAULT 5,
  max_flashes_per_day   INT NOT NULL DEFAULT 2,
  default_confidence_floor NUMERIC(4,3) NOT NULL DEFAULT 0.750,
  review_window_hours   INT NOT NULL DEFAULT 24,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default settings
INSERT INTO autopilot_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ── 5. Seed default schedules ────────────────────────────────
INSERT INTO autopilot_schedules (publication_type, region, cron_expression, data_endpoints, chart_rules, template_id, quality_thresholds, word_count_target) VALUES
  -- Market Flash (event-driven)
  ('market_flash', NULL, 'EVENT_DRIVEN', ARRAY['*'], '{"count":[1,2],"mustInclude":["trigger_metric"]}', 'market_flash_v1', '{"minConfidence":0.80,"maxSimilarity":0.70,"maxDataAgeDays":1}', 500),
  -- Weekly Digest
  ('data_brief', NULL, '0 20 * * 0', ARRAY['/api/v1/publications/public','/api/v1/publications/indices'], '{"count":[3,4],"diversityMin":2}', 'weekly_digest_v1', '{"minConfidence":0.75,"maxSimilarity":0.80,"maxDataAgeDays":7}', 800),
  -- Monthly Property Snapshot
  ('data_brief', 'national', '0 8 1 * *', ARRAY['/api/v1/analytics/ml/market/price-index','/api/v1/analytics/ml/market/activity'], '{"count":[4,6],"diversityMin":3}', 'monthly_snapshot_v1', '{"minConfidence":0.75,"maxSimilarity":0.85,"maxDataAgeDays":35}', 1200),
  -- Monthly CCI Update
  ('index_update', 'national', '0 8 5 * *', ARRAY['/api/v1/analytics/ml/construction/index'], '{"count":[3,4],"diversityMin":2}', 'cci_update_v1', '{"minConfidence":0.75,"maxSimilarity":0.85,"maxDataAgeDays":35}', 800),
  -- Monthly Perspective
  ('research_report', 'national', '0 8 15 * *', ARRAY['/api/v1/analytics/ml/market/price-index','/api/v1/analytics/ml/construction/index','/api/v1/analytics/ml/market/investment'], '{"count":[5,8],"diversityMin":3}', 'monthly_perspective_v1', '{"minConfidence":0.75,"maxSimilarity":0.85,"maxDataAgeDays":35}', 3000),
  -- MarketBeat — Accra
  ('marketbeat', 'greater_accra', '0 8 10 * *', ARRAY['/api/v1/analytics/ml/market/price-index?region=greater_accra','/api/v1/analytics/ml/market/activity?region=greater_accra','/api/v1/analytics/ml/construction/index?region=greater_accra','/api/v1/analytics/ml/hai/region/greater_accra','/api/v1/analytics/ml/market/investment?region=greater_accra'], '{"count":[6,8],"diversityMin":3}', 'marketbeat_v1', '{"minConfidence":0.75,"maxSimilarity":0.85,"maxDataAgeDays":35}', 4000),
  -- MarketBeat — Kumasi
  ('marketbeat', 'ashanti', '0 10 10 * *', ARRAY['/api/v1/analytics/ml/market/price-index?region=ashanti','/api/v1/analytics/ml/market/activity?region=ashanti'], '{"count":[6,8],"diversityMin":3}', 'marketbeat_v1', '{"minConfidence":0.75,"maxSimilarity":0.85,"maxDataAgeDays":35}', 4000),
  -- MarketBeat — Takoradi
  ('marketbeat', 'western', '0 12 10 * *', ARRAY['/api/v1/analytics/ml/market/price-index?region=western','/api/v1/analytics/ml/market/activity?region=western'], '{"count":[6,8],"diversityMin":3}', 'marketbeat_v1', '{"minConfidence":0.75,"maxSimilarity":0.85,"maxDataAgeDays":35}', 4000),
  -- PSI Weekly Update
  ('index_update', NULL, '0 8 * * 1', ARRAY['/api/v1/analytics/ml/market/sentiment'], '{"count":[1,2],"diversityMin":1}', 'psi_weekly_v1', '{"minConfidence":0.75,"maxSimilarity":0.80,"maxDataAgeDays":7}', 600),
  -- Quarterly Outlook
  ('research_report', NULL, '0 8 15 1,4,7,10 *', ARRAY['/api/v1/analytics/ml/market/price-index','/api/v1/analytics/ml/construction/index','/api/v1/analytics/ml/market/investment','/api/v1/analytics/ml/market/forecast'], '{"count":[8,12],"diversityMin":4}', 'quarterly_outlook_v1', '{"minConfidence":0.75,"maxSimilarity":0.85,"maxDataAgeDays":45}', 8000),
  -- GHAI Quarterly Report
  ('research_report', NULL, '0 8 10 1,4,7,10 *', ARRAY['/api/v1/analytics/ml/hai/national'], '{"count":[4,6],"diversityMin":2}', 'ghai_quarterly_v1', '{"minConfidence":0.75,"maxSimilarity":0.85,"maxDataAgeDays":45}', 4000),
  -- Annual Market Outlook
  ('annual_flagship', 'national', '0 8 15 1 *', ARRAY['/api/v1/analytics/ml/market/price-index','/api/v1/analytics/ml/construction/index','/api/v1/analytics/ml/market/investment','/api/v1/analytics/ml/market/forecast','/api/v1/analytics/ml/hai/national'], '{"count":[15,20],"diversityMin":5}', 'annual_outlook_v1', '{"minConfidence":0.80,"maxSimilarity":0.85,"maxDataAgeDays":60}', 20000)
ON CONFLICT (publication_type, region) DO NOTHING;
