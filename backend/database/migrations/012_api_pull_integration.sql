-- Migration: Add API Pull Integration Tables
-- Version: 012
-- Description: Add tables to support API pull integrations with scheduled data fetching

-- Partner API Endpoints Configuration
CREATE TABLE IF NOT EXISTS partner_api_endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
    endpoint_name VARCHAR(255) NOT NULL,
    endpoint_url TEXT NOT NULL,
    endpoint_type VARCHAR(50) NOT NULL DEFAULT 'rest_api',
    auth_method VARCHAR(50) NOT NULL DEFAULT 'oauth2',
    dataset_type VARCHAR(100) NOT NULL,
    
    -- Pull Configuration
    pull_frequency VARCHAR(20) NOT NULL DEFAULT 'daily', -- hourly, daily, weekly, monthly
    pull_method VARCHAR(20) NOT NULL DEFAULT 'full_sync', -- full_sync, incremental, delta
    data_format VARCHAR(20) NOT NULL DEFAULT 'json', -- json, xml, csv, fixed_width
    
    -- Request/Response Configuration
    request_headers JSONB DEFAULT '{}',
    request_params JSONB DEFAULT '{}',
    response_mapping JSONB, -- Field mapping from partner API to our schema
    
    -- Pagination Configuration
    pagination_config JSONB DEFAULT '{
        "method": "limit_offset",
        "limitParam": "limit",
        "offsetParam": "offset",
        "defaultPageSize": 100,
        "maxPageSize": 1000
    }',
    
    -- Rate Limiting
    requests_per_minute INTEGER DEFAULT 60,
    requests_per_hour INTEGER DEFAULT 1000,
    
    -- Batch Fallback Configuration
    batch_fallback_enabled BOOLEAN DEFAULT false,
    batch_fallback_url TEXT,
    batch_fallback_type VARCHAR(20) DEFAULT 'sftp', -- sftp, ftp, http
    batch_fallback_schedule VARCHAR(50), -- e.g., "0 2 * * *" for 2 AM daily
    
    -- Status and Monitoring
    is_active BOOLEAN DEFAULT true,
    last_successful_pull TIMESTAMPTZ,
    consecutive_failures INTEGER DEFAULT 0,
    max_consecutive_failures INTEGER DEFAULT 5,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100) DEFAULT 'system',
    
    -- Constraints
    CONSTRAINT valid_endpoint_type CHECK (endpoint_type IN ('rest_api', 'soap', 'graphql', 'sftp')),
    CONSTRAINT valid_auth_method CHECK (auth_method IN ('oauth2', 'api_key', 'basic_auth', 'bearer_token', 'mtls')),
    CONSTRAINT valid_pull_frequency CHECK (pull_frequency IN ('hourly', 'daily', 'weekly', 'monthly')),
    CONSTRAINT valid_pull_method CHECK (pull_method IN ('full_sync', 'incremental', 'delta')),
    CONSTRAINT valid_data_format CHECK (data_format IN ('json', 'xml', 'csv', 'fixed_width'))
);

-- API Pull Jobs - Execution tracking
CREATE TABLE IF NOT EXISTS api_pull_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint_id UUID NOT NULL REFERENCES partner_api_endpoints(id) ON DELETE CASCADE,
    job_type VARCHAR(50) NOT NULL DEFAULT 'api_pull', -- api_pull, batch_fallback
    sync_type VARCHAR(20) NOT NULL DEFAULT 'full_sync',
    
    -- Execution Details
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, running, completed, failed, cancelled
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    
    -- Data Metrics
    records_fetched INTEGER DEFAULT 0,
    records_processed INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    data_size_bytes BIGINT DEFAULT 0,
    
    -- API Metrics
    api_calls_made INTEGER DEFAULT 0,
    api_errors INTEGER DEFAULT 0,
    
    -- Sync Tracking for Incremental Pulls
    last_sync_timestamp TIMESTAMPTZ,
    last_sync_token VARCHAR(255), -- For cursor-based pagination
    
    -- Fallback Information
    fallback_triggered BOOLEAN DEFAULT false,
    fallback_reason TEXT,
    
    -- Error Information
    error_message TEXT,
    error_code VARCHAR(100),
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    -- Integration with Ingestion System
    ingestion_submission_id UUID, -- Link to ingestion system (no FK constraint for now)
    
    -- Metadata
    triggered_by VARCHAR(50) DEFAULT 'scheduler', -- scheduler, manual, webhook
    job_config JSONB DEFAULT '{}', -- Runtime configuration for this job
    
    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    CONSTRAINT valid_job_type CHECK (job_type IN ('api_pull', 'batch_fallback')),
    CONSTRAINT completion_consistency CHECK (
        (status IN ('completed', 'failed', 'cancelled') AND completed_at IS NOT NULL) OR
        (status IN ('pending', 'running') AND completed_at IS NULL)
    )
);

-- API Pull Schedules - Cron-style scheduling
CREATE TABLE IF NOT EXISTS api_pull_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint_id UUID NOT NULL REFERENCES partner_api_endpoints(id) ON DELETE CASCADE,
    schedule_name VARCHAR(255) NOT NULL,
    cron_expression VARCHAR(100) NOT NULL, -- e.g., "0 1 * * *" for daily at 1 AM
    timezone VARCHAR(50) DEFAULT 'UTC',
    
    -- Schedule Configuration
    is_active BOOLEAN DEFAULT true,
    sync_type VARCHAR(20) NOT NULL DEFAULT 'full_sync',
    priority INTEGER DEFAULT 5, -- 1 (highest) to 10 (lowest)
    
    -- Execution Windows
    execution_window_start TIME, -- e.g., 01:00:00
    execution_window_end TIME,   -- e.g., 05:00:00
    max_execution_time_minutes INTEGER DEFAULT 60,
    
    -- Failure Handling
    retry_failed_jobs BOOLEAN DEFAULT true,
    retry_delay_minutes INTEGER DEFAULT 15,
    notify_on_failure BOOLEAN DEFAULT true,
    notification_channels JSONB DEFAULT '[]', -- ["email", "slack", "webhook"]
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_triggered TIMESTAMPTZ,
    next_run TIMESTAMPTZ,
    
    -- Performance Tracking
    average_duration_minutes NUMERIC(8,2),
    success_rate NUMERIC(5,2), -- Percentage
    last_success TIMESTAMPTZ,
    
    CONSTRAINT valid_sync_type CHECK (sync_type IN ('full_sync', 'incremental', 'delta')),
    CONSTRAINT valid_priority CHECK (priority BETWEEN 1 AND 10),
    CONSTRAINT valid_execution_window CHECK (
        (execution_window_start IS NULL AND execution_window_end IS NULL) OR
        (execution_window_start IS NOT NULL AND execution_window_end IS NOT NULL)
    )
);

-- API Error Tracking - For monitoring and alerting
CREATE TABLE IF NOT EXISTS api_pull_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES api_pull_jobs(id) ON DELETE CASCADE,
    endpoint_id UUID NOT NULL REFERENCES partner_api_endpoints(id) ON DELETE CASCADE,
    
    -- Error Classification
    error_type VARCHAR(50) NOT NULL, -- connection, authentication, rate_limit, server_error, data_error
    error_code VARCHAR(100),
    http_status INTEGER,
    
    -- Error Details
    error_message TEXT NOT NULL,
    error_context JSONB DEFAULT '{}', -- Request details, response headers, etc.
    stack_trace TEXT,
    
    -- Occurrence Tracking
    occurred_at TIMESTAMPTZ DEFAULT NOW(),
    first_occurrence TIMESTAMPTZ DEFAULT NOW(),
    occurrence_count INTEGER DEFAULT 1,
    
    -- Resolution Information
    is_resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    
    -- Impact Assessment
    affected_records INTEGER DEFAULT 0,
    business_impact VARCHAR(20) DEFAULT 'low', -- low, medium, high, critical
    
    CONSTRAINT valid_error_type CHECK (error_type IN ('connection', 'authentication', 'rate_limit', 'server_error', 'data_error')),
    CONSTRAINT valid_business_impact CHECK (business_impact IN ('low', 'medium', 'high', 'critical'))
);

-- Data Source Health Monitoring
CREATE TABLE IF NOT EXISTS partner_health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint_id UUID NOT NULL REFERENCES partner_api_endpoints(id) ON DELETE CASCADE,
    
    -- Health Check Results
    status VARCHAR(20) NOT NULL, -- healthy, degraded, unhealthy, unknown
    response_time_ms INTEGER,
    last_check TIMESTAMPTZ DEFAULT NOW(),
    
    -- Availability Metrics
    uptime_percentage NUMERIC(5,2),
    availability_24h NUMERIC(5,2),
    availability_7d NUMERIC(5,2),
    availability_30d NUMERIC(5,2),
    
    -- Performance Metrics
    avg_response_time_ms INTEGER,
    min_response_time_ms INTEGER,
    max_response_time_ms INTEGER,
    
    -- Error Rates
    error_rate_24h NUMERIC(5,2),
    error_rate_7d NUMERIC(5,2),
    
    -- Health Check Configuration
    check_interval_minutes INTEGER DEFAULT 15,
    timeout_seconds INTEGER DEFAULT 30,
    expected_status_codes INTEGER[] DEFAULT ARRAY[200],
    
    -- Alert Configuration
    alert_threshold_failures INTEGER DEFAULT 3,
    alert_threshold_response_time_ms INTEGER DEFAULT 10000,
    
    CONSTRAINT valid_status CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'unknown'))
);

-- Sync State Tracking for Incremental Pulls
CREATE TABLE IF NOT EXISTS api_sync_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint_id UUID NOT NULL REFERENCES partner_api_endpoints(id) ON DELETE CASCADE,
    
    -- Sync Identifiers
    sync_key VARCHAR(100) NOT NULL, -- dataset_type + sync_method
    last_sync_timestamp TIMESTAMPTZ,
    last_sync_cursor VARCHAR(500),
    last_sync_version VARCHAR(100),
    
    -- Sync Metadata
    total_records_synced BIGINT DEFAULT 0,
    last_record_id VARCHAR(255),
    last_record_updated_at TIMESTAMPTZ,
    
    -- Checksum for Data Integrity
    data_checksum VARCHAR(64), -- SHA-256 hash of last synced batch
    full_sync_checksum VARCHAR(64), -- SHA-256 hash of complete dataset
    
    -- Sync Statistics
    sync_frequency VARCHAR(20),
    average_records_per_sync INTEGER,
    last_successful_sync TIMESTAMPTZ,
    consecutive_sync_failures INTEGER DEFAULT 0,
    
    -- Cleanup Configuration
    retention_days INTEGER DEFAULT 30,
    cleanup_enabled BOOLEAN DEFAULT true,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(endpoint_id, sync_key)
);

-- Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_partner_api_endpoints_source_active 
    ON partner_api_endpoints(source_id, is_active);

CREATE INDEX IF NOT EXISTS idx_partner_api_endpoints_frequency_active 
    ON partner_api_endpoints(pull_frequency, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_api_pull_jobs_endpoint_status 
    ON api_pull_jobs(endpoint_id, status);

CREATE INDEX IF NOT EXISTS idx_api_pull_jobs_started_at 
    ON api_pull_jobs(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_pull_jobs_status_created 
    ON api_pull_jobs(status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_pull_schedules_active_next_run 
    ON api_pull_schedules(is_active, next_run) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_api_pull_errors_endpoint_occurred 
    ON api_pull_errors(endpoint_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_pull_errors_type_unresolved 
    ON api_pull_errors(error_type, is_resolved) WHERE is_resolved = false;

CREATE INDEX IF NOT EXISTS idx_partner_health_checks_endpoint_check 
    ON partner_health_checks(endpoint_id, last_check DESC);

CREATE INDEX IF NOT EXISTS idx_api_sync_state_endpoint_key 
    ON api_sync_state(endpoint_id, sync_key);

-- Function update_updated_at_column() already defined in earlier migrations

DROP TRIGGER IF EXISTS update_partner_api_endpoints_updated_at ON partner_api_endpoints;
CREATE TRIGGER update_partner_api_endpoints_updated_at 
    BEFORE UPDATE ON partner_api_endpoints 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_api_pull_schedules_updated_at ON api_pull_schedules;
CREATE TRIGGER update_api_pull_schedules_updated_at 
    BEFORE UPDATE ON api_pull_schedules 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_api_sync_state_updated_at ON api_sync_state;
CREATE TRIGGER update_api_sync_state_updated_at 
    BEFORE UPDATE ON api_sync_state 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create views for monitoring and reporting
CREATE OR REPLACE VIEW api_pull_performance AS
SELECT 
    e.id as endpoint_id,
    e.endpoint_name,
    ds.name as source_name,
    ds.tier as source_tier,
    e.pull_frequency,
    e.is_active,
    
    -- Recent Performance Metrics (Last 7 days)
    COUNT(j.id) FILTER (WHERE j.started_at >= NOW() - INTERVAL '7 days') as jobs_last_7d,
    COUNT(j.id) FILTER (WHERE j.status = 'completed' AND j.started_at >= NOW() - INTERVAL '7 days') as successful_jobs_last_7d,
    COUNT(j.id) FILTER (WHERE j.status = 'failed' AND j.started_at >= NOW() - INTERVAL '7 days') as failed_jobs_last_7d,
    
    ROUND(
        COALESCE(
            COUNT(j.id) FILTER (WHERE j.status = 'completed' AND j.started_at >= NOW() - INTERVAL '7 days')::NUMERIC / 
            NULLIF(COUNT(j.id) FILTER (WHERE j.started_at >= NOW() - INTERVAL '7 days'), 0) * 100,
            0
        ), 2
    ) as success_rate_7d,
    
    -- Data Volume Metrics
    COALESCE(SUM(j.records_fetched) FILTER (WHERE j.started_at >= NOW() - INTERVAL '7 days'), 0) as records_fetched_7d,
    COALESCE(AVG(j.records_fetched) FILTER (WHERE j.status = 'completed' AND j.started_at >= NOW() - INTERVAL '7 days'), 0) as avg_records_per_job,
    
    -- Performance Metrics
    COALESCE(AVG(j.duration_seconds) FILTER (WHERE j.status = 'completed' AND j.started_at >= NOW() - INTERVAL '7 days'), 0) as avg_duration_seconds,
    COALESCE(MAX(j.duration_seconds) FILTER (WHERE j.status = 'completed' AND j.started_at >= NOW() - INTERVAL '7 days'), 0) as max_duration_seconds,
    
    -- Status Information
    e.last_successful_pull,
    e.consecutive_failures,
    
    -- Health Status
    CASE 
        WHEN e.consecutive_failures >= e.max_consecutive_failures THEN 'unhealthy'
        WHEN e.consecutive_failures > 0 THEN 'degraded'
        WHEN e.last_successful_pull >= NOW() - INTERVAL '2 days' THEN 'healthy'
        ELSE 'unknown'
    END as health_status

FROM partner_api_endpoints e
LEFT JOIN data_sources ds ON e.source_id = ds.id
LEFT JOIN api_pull_jobs j ON e.id = j.endpoint_id
GROUP BY e.id, e.endpoint_name, ds.name, ds.tier, e.pull_frequency, e.is_active, 
         e.last_successful_pull, e.consecutive_failures, e.max_consecutive_failures;

-- Create view for error analysis
CREATE OR REPLACE VIEW api_pull_error_summary AS
SELECT 
    e.id as endpoint_id,
    e.endpoint_name,
    ds.name as source_name,
    err.error_type,
    err.error_code,
    err.http_status,
    
    -- Error Frequency
    COUNT(err.id) as total_occurrences,
    COUNT(err.id) FILTER (WHERE err.occurred_at >= NOW() - INTERVAL '24 hours') as occurrences_24h,
    COUNT(err.id) FILTER (WHERE err.occurred_at >= NOW() - INTERVAL '7 days') as occurrences_7d,
    
    -- Error Details
    err.error_message,
    MIN(err.first_occurrence) as first_seen,
    MAX(err.occurred_at) as last_seen,
    
    -- Resolution Status
    COUNT(err.id) FILTER (WHERE err.is_resolved = false) as unresolved_count,
    MAX(err.business_impact) as max_business_impact

FROM partner_api_endpoints e
LEFT JOIN data_sources ds ON e.source_id = ds.id
LEFT JOIN api_pull_errors err ON e.id = err.endpoint_id
WHERE err.id IS NOT NULL
GROUP BY e.id, e.endpoint_name, ds.name, err.error_type, err.error_code, 
         err.http_status, err.error_message, err.business_impact
ORDER BY total_occurrences DESC, last_seen DESC;

-- -- Insert audit log entry
-- INSERT INTO data_audit_log (
--     table_name, operation, description, performed_by
-- ) VALUES (
--     'api_pull_tables', 'CREATE', 
--     'Created API pull integration tables: partner_api_endpoints, api_pull_jobs, api_pull_schedules, api_pull_errors, partner_health_checks, api_sync_state',
--     'migration_012'
-- );