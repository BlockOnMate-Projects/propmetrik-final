-- Migration: Tier Ingestion Phase 1
-- Description: Add portal ingestion Phase 1 fields and create initial Tier 1/2 staging tables

-- Extend file_uploads for Phase 1 portal ingestion
ALTER TABLE file_uploads
  ADD COLUMN IF NOT EXISTS dataset_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS source_tier VARCHAR(50),
  ADD COLUMN IF NOT EXISTS validation_report JSONB;

-- Tier 1: Land Title Records (staging)
CREATE TABLE IF NOT EXISTS tier1_land_title_records_staging (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES file_uploads(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  row_hash TEXT NOT NULL,
  raw_row JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (submission_id, row_hash)
);

CREATE INDEX IF NOT EXISTS idx_t1_titles_staging_submission ON tier1_land_title_records_staging(submission_id);
CREATE INDEX IF NOT EXISTS idx_t1_titles_staging_source ON tier1_land_title_records_staging(source_id);

-- Tier 2: Mortgage Transaction Stats (anonymized) (staging)
CREATE TABLE IF NOT EXISTS tier2_mortgage_transaction_stats_staging (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES file_uploads(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  row_hash TEXT NOT NULL,
  raw_row JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (submission_id, row_hash)
);

CREATE INDEX IF NOT EXISTS idx_t2_mortgage_staging_submission ON tier2_mortgage_transaction_stats_staging(submission_id);
CREATE INDEX IF NOT EXISTS idx_t2_mortgage_staging_source ON tier2_mortgage_transaction_stats_staging(source_id);
