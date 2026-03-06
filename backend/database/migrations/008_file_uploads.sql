-- Migration: File Uploads Table
-- Description: Add support for manual file uploads (CSV, Excel, PDF) for Tier 1 and Tier 2 data sources

-- Create file_uploads table
CREATE TABLE IF NOT EXISTS file_uploads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID REFERENCES data_sources(id) ON DELETE CASCADE,
  
  -- File metadata
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(50) NOT NULL CHECK (file_type IN ('csv', 'excel', 'pdf')),
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 52428800), -- Max 50MB
  file_path VARCHAR(500) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  
  -- Processing status
  upload_status VARCHAR(50) NOT NULL DEFAULT 'pending' 
    CHECK (upload_status IN ('pending', 'parsing', 'validating', 'processing', 'completed', 'failed', 'cancelled')),
  
  -- Data preview
  rows_detected INTEGER,
  columns_detected INTEGER,
  preview_data JSONB, -- First 10 rows for preview
  column_mapping JSONB, -- User-defined column mappings
  
  -- Processing results
  records_imported INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,
  error_message TEXT,
  error_details JSONB,
  
  -- ETL job reference
  etl_job_id UUID REFERENCES etl_jobs(id) ON DELETE SET NULL,
  
  -- Audit fields
  uploaded_by VARCHAR(255) NOT NULL,
  processed_at TIMESTAMP,
  deleted_at TIMESTAMP, -- Soft delete
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_file_uploads_source_id ON file_uploads(source_id);
CREATE INDEX idx_file_uploads_upload_status ON file_uploads(upload_status);
CREATE INDEX idx_file_uploads_uploaded_by ON file_uploads(uploaded_by);
CREATE INDEX idx_file_uploads_created_at ON file_uploads(created_at DESC);
CREATE INDEX idx_file_uploads_etl_job_id ON file_uploads(etl_job_id);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_file_uploads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_file_uploads_updated_at
  BEFORE UPDATE ON file_uploads
  FOR EACH ROW
  EXECUTE FUNCTION update_file_uploads_updated_at();

-- Add comment
COMMENT ON TABLE file_uploads IS 'Stores metadata and processing status for manually uploaded data files (CSV, Excel, PDF)';
COMMENT ON COLUMN file_uploads.preview_data IS 'JSON array containing first 10 rows for user preview';
COMMENT ON COLUMN file_uploads.column_mapping IS 'User-defined mapping of file columns to database fields';
