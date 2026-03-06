-- Migration: Update application_links to support permanent links
-- Date: 2026-02-21
-- Description: Add support for permanent marketplace links that don't expire

-- Add support for NULL expires_at (permanent links)
ALTER TABLE application_links 
ALTER COLUMN expires_at DROP NOT NULL;

-- Add flag to indicate permanent links
ALTER TABLE application_links 
ADD COLUMN IF NOT EXISTS is_permanent BOOLEAN DEFAULT FALSE;

-- Update existing links to be non-permanent
UPDATE application_links 
SET is_permanent = FALSE 
WHERE is_permanent IS NULL;

-- Create index for active permanent links
CREATE INDEX IF NOT EXISTS idx_app_links_permanent 
ON application_links(property_id, is_permanent) 
WHERE is_active = TRUE AND is_permanent = TRUE;

-- Update validation query index
CREATE INDEX IF NOT EXISTS idx_app_links_token_active 
ON application_links(token, is_active, expires_at);

-- Add comment
COMMENT ON COLUMN application_links.is_permanent IS 'Whether this is a permanent marketplace link (never expires)';
