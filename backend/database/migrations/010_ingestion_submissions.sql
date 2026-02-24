-- Migration: Ingestion Submissions (Phase 2)
-- Description: Create ingestion_submissions table for unified Partner API submissions

-- Ingestion Submissions (unified across all channels)
CREATE TABLE IF NOT EXISTS ingestion_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  
  -- Submission metadata
  dataset_type VARCHAR(100) NOT NULL,
  schema_version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('portal_file', 'api_push', 'api_pull')),
  
  -- Content and integrity
  content_uri TEXT NOT NULL, -- MinIO path or external URL
  content_type VARCHAR(100) NOT NULL, -- MIME type
  content_size_bytes BIGINT NOT NULL,
  checksum_sha256 VARCHAR(64),
  
  -- Idempotency and deduplication
  idempotency_key VARCHAR(255),
  correlation_id UUID DEFAULT uuid_generate_v4(),
  
  -- Processing status
  status VARCHAR(20) NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'validating', 'accepted', 'rejected', 'processing', 'completed', 'failed')),
  
  -- Timestamps
  received_at TIMESTAMP NOT NULL DEFAULT NOW(),
  validated_at TIMESTAMP,
  processed_at TIMESTAMP,
  completed_at TIMESTAMP,
  
  -- Processing results
  validation_report JSONB,
  processing_summary JSONB,
  error_message TEXT,
  error_details JSONB,
  
  -- Audit fields
  submitted_by VARCHAR(100), -- user ID or client ID
  client_id VARCHAR(100), -- Keycloak client for partner API
  ip_address INET,
  user_agent TEXT,
  
  -- ETL Job linkage
  etl_job_id UUID REFERENCES etl_jobs(id) ON DELETE SET NULL,
  
  -- Legacy file upload linkage (for portal uploads)
  file_upload_id UUID REFERENCES file_uploads(id) ON DELETE SET NULL,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ingestion_submissions_source ON ingestion_submissions(source_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_submissions_status ON ingestion_submissions(status);
CREATE INDEX IF NOT EXISTS idx_ingestion_submissions_channel ON ingestion_submissions(channel);
CREATE INDEX IF NOT EXISTS idx_ingestion_submissions_dataset_type ON ingestion_submissions(dataset_type);
CREATE INDEX IF NOT EXISTS idx_ingestion_submissions_received_at ON ingestion_submissions(received_at);
CREATE INDEX IF NOT EXISTS idx_ingestion_submissions_client_id ON ingestion_submissions(client_id);

-- Unique constraint for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_ingestion_submissions_idempotency 
ON ingestion_submissions(source_id, idempotency_key) 
WHERE idempotency_key IS NOT NULL;

-- Trigger for updating updated_at
CREATE OR REPLACE FUNCTION update_ingestion_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_ingestion_submissions_updated_at
  BEFORE UPDATE ON ingestion_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_ingestion_submissions_updated_at();

-- Add delivery_channels and data_classification to data_sources for Tier ingestion
ALTER TABLE data_sources
  ADD COLUMN IF NOT EXISTS delivery_channels TEXT[] DEFAULT ARRAY['portal_file'],
  ADD COLUMN IF NOT EXISTS allowed_datasets TEXT[] DEFAULT ARRAY['land_title_record'],
  ADD COLUMN IF NOT EXISTS data_classification VARCHAR(20) DEFAULT 'internal' CHECK (data_classification IN ('public', 'internal', 'confidential', 'restricted')),
  ADD COLUMN IF NOT EXISTS partner_client_id VARCHAR(255); -- Keycloak client ID for partner authentication

-- Update existing sources with sensible defaults
UPDATE data_sources 
SET 
  delivery_channels = CASE 
    WHEN tier = 'tier1_government' THEN ARRAY['portal_file', 'api_push', 'api_pull']
    WHEN tier = 'tier2_financial' THEN ARRAY['portal_file', 'api_push']
    ELSE ARRAY['portal_file']
  END,
  allowed_datasets = CASE 
    WHEN tier = 'tier1_government' THEN ARRAY['land_title_record', 'cadastral_boundary', 'tax_assessment', 'building_permit', 'zoning_plan']
    WHEN tier = 'tier2_financial' THEN ARRAY['mortgage_transaction_stats', 'collateral_valuation']
    ELSE ARRAY['property_listing']
  END,
  data_classification = CASE 
    WHEN tier IN ('tier1_government', 'tier2_financial') THEN 'confidential'
    WHEN tier = 'tier3_partners' THEN 'internal'
    ELSE 'public'
  END
WHERE delivery_channels IS NULL OR allowed_datasets IS NULL OR data_classification IS NULL;