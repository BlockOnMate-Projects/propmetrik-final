-- Fix esign_envelopes schema: add missing columns that exist in the original migration
-- but were not present in the live database schema.
-- Migration: 216_esign_envelopes_fix_schema.sql

ALTER TABLE esign_envelopes
    ADD COLUMN IF NOT EXISTS name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS document_html TEXT,
    ADD COLUMN IF NOT EXISTS document_pdf_url TEXT;

-- Backfill name from subject or context_entity_name for existing rows
UPDATE esign_envelopes
SET name = COALESCE(subject, context_entity_name, 'Document')
WHERE name IS NULL;

COMMENT ON COLUMN esign_envelopes.name IS 'Human-readable envelope name / title';
COMMENT ON COLUMN esign_envelopes.document_html IS 'Original HTML content of the document';
COMMENT ON COLUMN esign_envelopes.document_pdf_url IS 'Generated PDF storage URL (MinIO/S3)';
