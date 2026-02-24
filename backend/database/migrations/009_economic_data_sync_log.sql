-- Migration: 009_economic_data_sync_log
-- Description: Sync history tracking for economic data sources
-- Created: 2026-01-05
-- Phase: 2 - Data Hub Implementation (Economic Data Scrapers)

-- =====================================================
-- SYNC LOG TABLE
-- Tracks all sync operations from external data sources
-- =====================================================
CREATE TABLE IF NOT EXISTS economic_data_sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Source identification
  source_name VARCHAR(100) NOT NULL,
  sync_type VARCHAR(50) NOT NULL DEFAULT 'scheduled',
  
  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER GENERATED ALWAYS AS (
    CASE WHEN completed_at IS NOT NULL 
    THEN EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000 
    ELSE NULL END
  ) STORED,
  
  -- Results
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  records_fetched INTEGER DEFAULT 0,
  records_saved INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,
  
  -- Error tracking
  error_message TEXT,
  error_details JSONB DEFAULT '{}',
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  triggered_by VARCHAR(100), -- 'scheduler', 'manual', 'api'
  
  -- Constraints
  CONSTRAINT valid_sync_type CHECK (sync_type IN ('full', 'incremental', 'manual', 'scheduled', 'retry')),
  CONSTRAINT valid_status CHECK (status IN ('running', 'success', 'failed', 'partial', 'cancelled'))
);

-- Indexes for common queries
CREATE INDEX idx_sync_log_source_date ON economic_data_sync_log(source_name, started_at DESC);
CREATE INDEX idx_sync_log_status ON economic_data_sync_log(status, started_at DESC);
CREATE INDEX idx_sync_log_started ON economic_data_sync_log(started_at DESC);

-- =====================================================
-- SOURCE HEALTH TABLE
-- Tracks health metrics for each data source
-- =====================================================
CREATE TABLE IF NOT EXISTS economic_data_source_health (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_name VARCHAR(100) UNIQUE NOT NULL,
  
  -- Status
  is_healthy BOOLEAN DEFAULT TRUE,
  last_successful_sync TIMESTAMPTZ,
  last_failed_sync TIMESTAMPTZ,
  consecutive_failures INTEGER DEFAULT 0,
  
  -- Metrics
  total_syncs INTEGER DEFAULT 0,
  successful_syncs INTEGER DEFAULT 0,
  failed_syncs INTEGER DEFAULT 0,
  average_duration_ms INTEGER,
  
  -- Configuration
  sync_frequency VARCHAR(50), -- 'hourly', 'daily', 'weekly', 'monthly'
  next_scheduled_sync TIMESTAMPTZ,
  is_enabled BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Index for health checks
CREATE INDEX idx_source_health_name ON economic_data_source_health(source_name);
CREATE INDEX idx_source_health_status ON economic_data_source_health(is_healthy, is_enabled);

-- =====================================================
-- SEED INITIAL SOURCE HEALTH RECORDS
-- =====================================================
INSERT INTO economic_data_source_health (source_name, sync_frequency, is_enabled) VALUES
  ('Bank of Ghana', 'monthly', TRUE),
  ('World Bank WDI', 'quarterly', TRUE),
  ('ExchangeRate-API', 'daily', TRUE),
  ('Yahoo Finance', 'daily', TRUE)
ON CONFLICT (source_name) DO NOTHING;

-- =====================================================
-- FUNCTION: Log sync start
-- =====================================================
CREATE OR REPLACE FUNCTION start_economic_sync(
  p_source_name VARCHAR,
  p_sync_type VARCHAR DEFAULT 'scheduled',
  p_triggered_by VARCHAR DEFAULT 'scheduler'
) RETURNS UUID AS $$
DECLARE
  v_sync_id UUID;
BEGIN
  INSERT INTO economic_data_sync_log (source_name, sync_type, triggered_by, status)
  VALUES (p_source_name, p_sync_type, p_triggered_by, 'running')
  RETURNING id INTO v_sync_id;
  
  -- Update source health
  UPDATE economic_data_source_health
  SET total_syncs = total_syncs + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE source_name = p_source_name;
  
  RETURN v_sync_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION: Complete sync (success or failure)
-- =====================================================
CREATE OR REPLACE FUNCTION complete_economic_sync(
  p_sync_id UUID,
  p_status VARCHAR,
  p_records_fetched INTEGER DEFAULT 0,
  p_records_saved INTEGER DEFAULT 0,
  p_records_failed INTEGER DEFAULT 0,
  p_error_message TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS VOID AS $$
DECLARE
  v_source_name VARCHAR;
  v_started_at TIMESTAMPTZ;
  v_duration_ms INTEGER;
BEGIN
  -- Update sync log
  UPDATE economic_data_sync_log
  SET status = p_status,
      completed_at = CURRENT_TIMESTAMP,
      records_fetched = p_records_fetched,
      records_saved = p_records_saved,
      records_failed = p_records_failed,
      error_message = p_error_message,
      metadata = p_metadata
  WHERE id = p_sync_id
  RETURNING source_name, started_at INTO v_source_name, v_started_at;
  
  v_duration_ms := EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - v_started_at)) * 1000;
  
  -- Update source health based on result
  IF p_status IN ('success', 'partial') THEN
    UPDATE economic_data_source_health
    SET is_healthy = TRUE,
        last_successful_sync = CURRENT_TIMESTAMP,
        consecutive_failures = 0,
        successful_syncs = successful_syncs + 1,
        average_duration_ms = COALESCE(
          (average_duration_ms * (successful_syncs - 1) + v_duration_ms) / successful_syncs,
          v_duration_ms
        ),
        updated_at = CURRENT_TIMESTAMP
    WHERE source_name = v_source_name;
  ELSE
    UPDATE economic_data_source_health
    SET last_failed_sync = CURRENT_TIMESTAMP,
        consecutive_failures = consecutive_failures + 1,
        failed_syncs = failed_syncs + 1,
        is_healthy = CASE WHEN consecutive_failures >= 3 THEN FALSE ELSE is_healthy END,
        updated_at = CURRENT_TIMESTAMP
    WHERE source_name = v_source_name;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- VIEW: Latest sync status for each source
-- =====================================================
CREATE OR REPLACE VIEW v_economic_sync_status AS
SELECT DISTINCT ON (source_name)
  source_name,
  sync_type,
  started_at,
  completed_at,
  duration_ms,
  status,
  records_fetched,
  records_saved,
  records_failed,
  error_message
FROM economic_data_sync_log
ORDER BY source_name, started_at DESC;

-- =====================================================
-- VIEW: Source health dashboard
-- =====================================================
CREATE OR REPLACE VIEW v_economic_source_health AS
SELECT 
  h.source_name,
  h.is_healthy,
  h.is_enabled,
  h.sync_frequency,
  h.consecutive_failures,
  h.total_syncs,
  h.successful_syncs,
  h.failed_syncs,
  ROUND(h.successful_syncs::NUMERIC / NULLIF(h.total_syncs, 0) * 100, 1) AS success_rate,
  h.average_duration_ms,
  h.last_successful_sync,
  h.last_failed_sync,
  h.next_scheduled_sync,
  s.status AS last_sync_status,
  s.records_saved AS last_records_saved
FROM economic_data_source_health h
LEFT JOIN v_economic_sync_status s ON h.source_name = s.source_name;

-- =====================================================
-- Add new indicator types to enum if not exists
-- =====================================================
DO $$
BEGIN
  -- Add new indicator types
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'prime_rate' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'economic_indicator_type_enum')) THEN
    ALTER TYPE economic_indicator_type_enum ADD VALUE IF NOT EXISTS 'prime_rate';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'lending_rate' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'economic_indicator_type_enum')) THEN
    ALTER TYPE economic_indicator_type_enum ADD VALUE IF NOT EXISTS 'lending_rate';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'savings_rate' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'economic_indicator_type_enum')) THEN
    ALTER TYPE economic_indicator_type_enum ADD VALUE IF NOT EXISTS 'savings_rate';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'interbank_rate' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'economic_indicator_type_enum')) THEN
    ALTER TYPE economic_indicator_type_enum ADD VALUE IF NOT EXISTS 'interbank_rate';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ciea_index' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'economic_indicator_type_enum')) THEN
    ALTER TYPE economic_indicator_type_enum ADD VALUE IF NOT EXISTS 'ciea_index';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'gdp_per_capita_usd' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'economic_indicator_type_enum')) THEN
    ALTER TYPE economic_indicator_type_enum ADD VALUE IF NOT EXISTS 'gdp_per_capita_usd';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'population' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'economic_indicator_type_enum')) THEN
    ALTER TYPE economic_indicator_type_enum ADD VALUE IF NOT EXISTS 'population';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    -- Type values already exist, ignore
    NULL;
END $$;

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE economic_data_sync_log IS 'Tracks all sync operations from external economic data sources';
COMMENT ON TABLE economic_data_source_health IS 'Monitors health and reliability of each data source';
COMMENT ON VIEW v_economic_sync_status IS 'Latest sync status for each data source';
COMMENT ON VIEW v_economic_source_health IS 'Dashboard view combining health metrics and latest sync status';
