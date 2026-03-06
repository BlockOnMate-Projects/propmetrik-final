-- Migration: API Pull Integration (Phase 3)
-- Description: Add support for PROPMETRIK pulling data from partner APIs with batch fallback

-- Partner API Endpoints Configuration
CREATE TABLE IF NOT EXISTS partner_api_endpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  
  -- API Configuration
  endpoint_url TEXT NOT NULL,
  endpoint_type VARCHAR(50) NOT NULL CHECK (endpoint_type IN ('rest_api', 'soap', 'graphql', 'sftp')),
  auth_method VARCHAR(50) NOT NULL CHECK (auth_method IN ('oauth2', 'api_key', 'basic_auth', 'mtls', 'bearer_token')),
  
  -- Authentication Details (encrypted)
  auth_config JSONB NOT NULL, -- Contains encrypted credentials
  
  -- Pull Configuration
  dataset_type VARCHAR(100) NOT NULL,
  pull_frequency VARCHAR(20) NOT NULL CHECK (pull_frequency IN ('hourly', 'daily', 'weekly', 'monthly')),
  pull_method VARCHAR(20) NOT NULL CHECK (pull_method IN ('full_sync', 'incremental', 'delta')),
  
  -- Data Processing
  data_format VARCHAR(20) NOT NULL CHECK (data_format IN ('json', 'xml', 'csv', 'fixed_width')),
  response_mapping JSONB, -- Field mapping configuration
  pagination_config JSONB, -- Pagination parameters
  
  -- Batch Fallback Configuration
  batch_fallback_enabled BOOLEAN DEFAULT true,
  batch_fallback_url TEXT, -- SFTP/FTP endpoint for fallback
  batch_fallback_schedule VARCHAR(50) DEFAULT '0 2 * * *', -- Daily at 2 AM
  
  -- Status and Monitoring
  is_active BOOLEAN DEFAULT true,
  last_successful_pull TIMESTAMP,
  last_attempted_pull TIMESTAMP,
  consecutive_failures INTEGER DEFAULT 0,
  max_failures_before_pause INTEGER DEFAULT 5,
  
  -- Rate Limiting
  requests_per_minute INTEGER DEFAULT 60,
  requests_per_hour INTEGER DEFAULT 1000,
  
  -- Audit
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by VARCHAR(100),
  
  UNIQUE(source_id, dataset_type)
);

-- Pull Job History and Tracking
CREATE TABLE IF NOT EXISTS api_pull_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  endpoint_id UUID NOT NULL REFERENCES partner_api_endpoints(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES ingestion_submissions(id) ON DELETE SET NULL,
  
  -- Job Details
  job_type VARCHAR(20) NOT NULL CHECK (job_type IN ('api_pull', 'batch_fallback')),
  sync_type VARCHAR(20) NOT NULL CHECK (sync_type IN ('full_sync', 'incremental', 'delta')),
  
  -- Timing
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  duration_seconds INTEGER,
  
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  
  -- Results
  records_fetched INTEGER DEFAULT 0,
  records_processed INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  bytes_processed BIGINT DEFAULT 0,
  
  -- API Call Statistics
  api_calls_made INTEGER DEFAULT 0,
  api_errors INTEGER DEFAULT 0,
  rate_limit_hits INTEGER DEFAULT 0,
  
  -- Incremental Tracking
  last_sync_token TEXT, -- For delta pulls
  last_sync_timestamp TIMESTAMP,
  
  -- Error Information
  error_message TEXT,
  error_details JSONB,
  
  -- Batch Fallback
  fallback_triggered BOOLEAN DEFAULT false,
  fallback_reason TEXT,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Credentials Vault (encrypted storage)
CREATE TABLE IF NOT EXISTS partner_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  
  -- Credential Identification
  credential_name VARCHAR(100) NOT NULL,
  credential_type VARCHAR(50) NOT NULL CHECK (credential_type IN ('oauth2_client', 'api_key', 'username_password', 'certificate', 'bearer_token')),
  
  -- Encrypted Storage
  encrypted_value BYTEA NOT NULL, -- AES-256 encrypted credential data
  encryption_key_id VARCHAR(100) NOT NULL, -- Reference to encryption key
  
  -- Metadata
  expires_at TIMESTAMP,
  last_rotated_at TIMESTAMP,
  rotation_frequency_days INTEGER DEFAULT 90,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Audit
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by VARCHAR(100),
  
  UNIQUE(source_id, credential_name)
);

-- Anonymization Rules for Tier 2 Data
CREATE TABLE IF NOT EXISTS anonymization_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dataset_type VARCHAR(100) NOT NULL,
  source_tier VARCHAR(50) NOT NULL,
  
  -- Field Rules
  field_name VARCHAR(100) NOT NULL,
  anonymization_method VARCHAR(50) NOT NULL CHECK (anonymization_method IN ('remove', 'hash', 'mask', 'generalize', 'noise', 'aggregate')),
  anonymization_config JSONB, -- Method-specific configuration
  
  -- Validation
  is_required BOOLEAN DEFAULT true,
  validation_regex TEXT,
  
  -- Compliance
  regulation_reference VARCHAR(200), -- GDPR, local privacy laws, etc.
  retention_period_days INTEGER,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(dataset_type, field_name)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_partner_api_endpoints_source ON partner_api_endpoints(source_id);
CREATE INDEX IF NOT EXISTS idx_partner_api_endpoints_active ON partner_api_endpoints(is_active);
CREATE INDEX IF NOT EXISTS idx_partner_api_endpoints_frequency ON partner_api_endpoints(pull_frequency);

CREATE INDEX IF NOT EXISTS idx_api_pull_jobs_endpoint ON api_pull_jobs(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_api_pull_jobs_status ON api_pull_jobs(status);
CREATE INDEX IF NOT EXISTS idx_api_pull_jobs_started ON api_pull_jobs(started_at);
CREATE INDEX IF NOT EXISTS idx_api_pull_jobs_submission ON api_pull_jobs(submission_id);

CREATE INDEX IF NOT EXISTS idx_partner_credentials_source ON partner_credentials(source_id);
CREATE INDEX IF NOT EXISTS idx_partner_credentials_type ON partner_credentials(credential_type);
CREATE INDEX IF NOT EXISTS idx_partner_credentials_expires ON partner_credentials(expires_at);

CREATE INDEX IF NOT EXISTS idx_anonymization_rules_dataset ON anonymization_rules(dataset_type);
CREATE INDEX IF NOT EXISTS idx_anonymization_rules_tier ON anonymization_rules(source_tier);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_api_endpoints_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_partner_api_endpoints_updated_at
  BEFORE UPDATE ON partner_api_endpoints
  FOR EACH ROW
  EXECUTE FUNCTION update_api_endpoints_updated_at();

CREATE TRIGGER trigger_partner_credentials_updated_at
  BEFORE UPDATE ON partner_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_api_endpoints_updated_at();

-- Add API pull support to existing data_sources
ALTER TABLE data_sources
  ADD COLUMN IF NOT EXISTS api_pull_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS api_pull_schedule VARCHAR(50) DEFAULT '0 1 * * *', -- Daily at 1 AM
  ADD COLUMN IF NOT EXISTS api_documentation_url TEXT,
  ADD COLUMN IF NOT EXISTS api_contact_email VARCHAR(255);

-- Sample anonymization rules for Tier 2 financial data
INSERT INTO anonymization_rules (dataset_type, source_tier, field_name, anonymization_method, anonymization_config, regulation_reference)
VALUES 
  ('mortgage_transaction_stats', 'tier2_financial', 'borrower_name', 'remove', '{}', 'Data Protection Act 2012 - Ghana'),
  ('mortgage_transaction_stats', 'tier2_financial', 'borrower_id', 'hash', '{"algorithm": "sha256", "salt": "financial_data_2026"}', 'Data Protection Act 2012 - Ghana'),
  ('mortgage_transaction_stats', 'tier2_financial', 'property_address', 'generalize', '{"level": "district"}', 'Data Protection Act 2012 - Ghana'),
  ('mortgage_transaction_stats', 'tier2_financial', 'loan_amount', 'noise', '{"variance_percent": 5, "min_records": 10}', 'Banking Act 2004 - Ghana'),
  ('mortgage_transaction_stats', 'tier2_financial', 'borrower_income', 'aggregate', '{"bin_size": 10000, "min_count": 5}', 'Banking Act 2004 - Ghana'),
  
  ('collateral_valuation', 'tier2_financial', 'owner_name', 'remove', '{}', 'Data Protection Act 2012 - Ghana'),
  ('collateral_valuation', 'tier2_financial', 'owner_phone', 'remove', '{}', 'Data Protection Act 2012 - Ghana'),
  ('collateral_valuation', 'tier2_financial', 'property_coordinates', 'noise', '{"radius_meters": 500}', 'Data Protection Act 2012 - Ghana'),
  ('collateral_valuation', 'tier2_financial', 'valuation_amount', 'noise', '{"variance_percent": 3}', 'Banking Act 2004 - Ghana');

-- Update existing Tier 1 and Tier 2 sources to enable API pulls
UPDATE data_sources 
SET 
  api_pull_enabled = true,
  api_pull_schedule = CASE 
    WHEN tier = 'tier1_government' THEN '0 1 * * *' -- Daily at 1 AM
    WHEN tier = 'tier2_financial' THEN '0 2 1 * *'  -- Monthly on 1st at 2 AM
    ELSE '0 1 * * 0' -- Weekly on Sunday at 1 AM
  END
WHERE tier IN ('tier1_government', 'tier2_financial') 
AND 'api_pull' = ANY(delivery_channels);