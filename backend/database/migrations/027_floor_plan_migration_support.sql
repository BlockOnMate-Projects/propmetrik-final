-- Migration: Phase 5 - Floor Plan Migration Support
-- Adds columns and tables for tracking migration status of legacy floor plans
-- 
-- @version 1.0.0
-- @since Phase 5 - Week 15

-- ============================================================================
-- ADD MIGRATION COLUMNS TO EXISTING TABLES
-- ============================================================================

-- Add migration tracking columns to valuation_floor_plans
ALTER TABLE valuation_floor_plans
ADD COLUMN IF NOT EXISTS migration_status VARCHAR(20) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS migration_error TEXT,
ADD COLUMN IF NOT EXISTS migrated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS legacy_canvas_json JSONB,
ADD COLUMN IF NOT EXISTS migration_metadata JSONB;

-- Add index for migration queries
CREATE INDEX IF NOT EXISTS idx_floor_plans_migration_status 
ON valuation_floor_plans(migration_status) 
WHERE migration_status IS NOT NULL;

-- Add constraint for valid migration status values
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_migration_status'
  ) THEN
    ALTER TABLE valuation_floor_plans
    ADD CONSTRAINT chk_migration_status 
    CHECK (migration_status IN ('pending', 'in_progress', 'completed', 'failed', 'skipped'));
  END IF;
END $$;

-- ============================================================================
-- MIGRATION TRACKING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS floor_plan_migrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Migration run information
  run_id UUID NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Statistics
  total_count INTEGER NOT NULL DEFAULT 0,
  migrated_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  
  -- Options used
  options JSONB,
  
  -- Results
  success BOOLEAN DEFAULT FALSE,
  error_summary JSONB,
  
  -- Audit
  initiated_by UUID REFERENCES users(id),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_migrations_run_id 
ON floor_plan_migrations(run_id);

CREATE INDEX IF NOT EXISTS idx_migrations_started_at 
ON floor_plan_migrations(started_at DESC);

-- ============================================================================
-- MIGRATION ERROR LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS floor_plan_migration_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference to migration run
  migration_id UUID REFERENCES floor_plan_migrations(id) ON DELETE CASCADE,
  
  -- Floor plan reference
  floor_plan_id UUID REFERENCES valuation_floor_plans(id),
  valuation_id UUID REFERENCES valuations(id),
  
  -- Error details
  stage VARCHAR(50) NOT NULL, -- analyze, design_intent, geometry, store, update
  error_message TEXT NOT NULL,
  error_stack TEXT,
  
  -- Context
  canvas_hash VARCHAR(64),
  analysis_result JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_migration_errors_migration_id 
ON floor_plan_migration_errors(migration_id);

CREATE INDEX IF NOT EXISTS idx_migration_errors_floor_plan_id 
ON floor_plan_migration_errors(floor_plan_id);

-- ============================================================================
-- FEATURE FLAGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Flag definition
  key VARCHAR(100) UNIQUE NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('boolean', 'string', 'number', 'json')),
  default_value JSONB NOT NULL,
  description TEXT,
  
  -- Status
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Targeting rules (JSON array)
  targeting JSONB DEFAULT '[]'::jsonb,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_key 
ON feature_flags(key);

-- ============================================================================
-- FEATURE FLAG OVERRIDES (PER USER/ORG)
-- ============================================================================

CREATE TABLE IF NOT EXISTS feature_flag_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Flag reference
  flag_key VARCHAR(100) NOT NULL,
  
  -- Target (only one should be set)
  user_id UUID REFERENCES users(id),
  organization_id UUID REFERENCES organizations(id),
  valuation_id UUID REFERENCES valuations(id),
  
  -- Override value
  value JSONB NOT NULL,
  
  -- Metadata
  reason TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  
  -- Ensure at least one target is set
  CONSTRAINT chk_override_target CHECK (
    user_id IS NOT NULL OR 
    organization_id IS NOT NULL OR 
    valuation_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_flag_overrides_key 
ON feature_flag_overrides(flag_key);

CREATE INDEX IF NOT EXISTS idx_flag_overrides_user 
ON feature_flag_overrides(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_flag_overrides_org 
ON feature_flag_overrides(organization_id) WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_flag_overrides_valuation 
ON feature_flag_overrides(valuation_id) WHERE valuation_id IS NOT NULL;

-- ============================================================================
-- GEOMETRY CACHE STATISTICS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS geometry_cache_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Time bucket (hourly)
  hour TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Statistics
  cache_hits INTEGER NOT NULL DEFAULT 0,
  cache_misses INTEGER NOT NULL DEFAULT 0,
  cache_size_bytes BIGINT DEFAULT 0,
  avg_hit_latency_ms NUMERIC(10, 2),
  avg_miss_latency_ms NUMERIC(10, 2),
  
  -- Unique constraint on hour
  CONSTRAINT uq_cache_stats_hour UNIQUE (hour)
);

CREATE INDEX IF NOT EXISTS idx_cache_stats_hour 
ON geometry_cache_stats(hour DESC);

-- ============================================================================
-- INSERT DEFAULT FEATURE FLAGS
-- ============================================================================

INSERT INTO feature_flags (key, type, default_value, description, enabled, targeting)
VALUES 
  ('floor-plan-v2-enabled', 'boolean', 'false'::jsonb, 
   'Enable Floor Plan V2 with Blender geometry rendering', true,
   '[{"condition": "internal_users", "value": true, "percentage": 100}, 
     {"condition": "beta_organizations", "value": true, "percentage": 100},
     {"condition": "all_users", "value": true, "percentage": 10}]'::jsonb),
  
  ('floor-plan-force-legacy', 'boolean', 'false'::jsonb,
   'Force legacy floor plan renderer for problematic valuations', true,
   '[]'::jsonb),
   
  ('floor-plan-llm-model', 'string', '"claude-sonnet-4-20250514"'::jsonb,
   'LLM model to use for floor plan design intent generation', true,
   '[{"condition": "a_b_test", "value": "claude-3-5-haiku-20241022", "percentage": 20}]'::jsonb),
   
  ('floor-plan-realtime-enabled', 'boolean', 'true'::jsonb,
   'Enable real-time geometry updates via WebSocket', true,
   '[]'::jsonb),
   
  ('floor-plan-cache-enabled', 'boolean', 'true'::jsonb,
   'Enable Redis caching for Blender geometry', true,
   '[]'::jsonb),
   
  ('floor-plan-adjustments-enabled', 'boolean', 'true'::jsonb,
   'Allow users to make constrained adjustments to floor plans', true,
   '[{"condition": "internal_users", "value": true, "percentage": 100},
     {"condition": "all_users", "value": true, "percentage": 50}]'::jsonb)
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  targeting = EXCLUDED.targeting,
  updated_at = NOW();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get migration statistics
CREATE OR REPLACE FUNCTION get_migration_stats()
RETURNS TABLE (
  status VARCHAR(20),
  count BIGINT,
  percentage NUMERIC(5,2)
) AS $$
BEGIN
  RETURN QUERY
  WITH total AS (
    SELECT COUNT(*) as total_count FROM valuation_floor_plans
  ),
  by_status AS (
    SELECT 
      COALESCE(migration_status, 'not_started') as status,
      COUNT(*) as count
    FROM valuation_floor_plans
    GROUP BY migration_status
  )
  SELECT 
    bs.status,
    bs.count,
    ROUND(bs.count * 100.0 / NULLIF(t.total_count, 0), 2) as percentage
  FROM by_status bs, total t
  ORDER BY bs.count DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to record hourly cache stats
CREATE OR REPLACE FUNCTION record_cache_stats(
  p_hits INTEGER,
  p_misses INTEGER,
  p_size_bytes BIGINT DEFAULT NULL,
  p_hit_latency_ms NUMERIC DEFAULT NULL,
  p_miss_latency_ms NUMERIC DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  current_hour TIMESTAMP WITH TIME ZONE;
BEGIN
  current_hour := date_trunc('hour', NOW());
  
  INSERT INTO geometry_cache_stats (hour, cache_hits, cache_misses, cache_size_bytes, avg_hit_latency_ms, avg_miss_latency_ms)
  VALUES (current_hour, p_hits, p_misses, p_size_bytes, p_hit_latency_ms, p_miss_latency_ms)
  ON CONFLICT (hour) DO UPDATE SET
    cache_hits = geometry_cache_stats.cache_hits + EXCLUDED.cache_hits,
    cache_misses = geometry_cache_stats.cache_misses + EXCLUDED.cache_misses,
    cache_size_bytes = COALESCE(EXCLUDED.cache_size_bytes, geometry_cache_stats.cache_size_bytes);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE floor_plan_migrations IS 'Tracks batch migration runs from legacy to V2 floor plans';
COMMENT ON TABLE floor_plan_migration_errors IS 'Detailed error log for failed migrations';
COMMENT ON TABLE feature_flags IS 'Feature flag configuration for gradual rollout';
COMMENT ON TABLE feature_flag_overrides IS 'Per-user/org/valuation feature flag overrides';
COMMENT ON TABLE geometry_cache_stats IS 'Hourly statistics for geometry caching performance';

COMMENT ON COLUMN valuation_floor_plans.migration_status IS 'Status: pending, in_progress, completed, failed, skipped';
COMMENT ON COLUMN valuation_floor_plans.legacy_canvas_json IS 'Preserved original canvas JSON before migration';
COMMENT ON COLUMN valuation_floor_plans.migration_metadata IS 'Additional migration details (hash, confidence, etc.)';
