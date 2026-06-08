-- Migration 236: Add the signed-document columns the e-sign completion handler relies on.
-- maybeProcessPropertyManagementCompletion() SELECTs signed_pdf_url + document_image_url and
-- UPDATEs signed_pdf_url, but these columns were never created on esign_envelopes — so the
-- completion query threw on every signing, silently aborting the whole completion flow
-- (no signed PDF stored, no tenant activation, no completion emails).

ALTER TABLE esign_envelopes
    ADD COLUMN IF NOT EXISTS signed_pdf_url TEXT,
    ADD COLUMN IF NOT EXISTS document_image_url TEXT;
