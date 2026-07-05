-- 285_crm_properties_video_url.sql
-- Add a marketing-video URL to CRM properties so a video uploaded on a CRM listing
-- can surface in the public Marketplace (PM `properties` already has `video_url` from
-- migration 003). Single walkthrough video per listing; stored as an s3:// object ref
-- and resolved to a presigned URL at read time (same as images). Idempotent.

ALTER TABLE crm_properties
  ADD COLUMN IF NOT EXISTS video_url VARCHAR(500);

COMMENT ON COLUMN crm_properties.video_url IS
  'Optional marketing/walkthrough video (s3:// object ref) shown on the public Marketplace listing.';
