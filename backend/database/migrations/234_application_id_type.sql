-- Migration 234: Capture the applicant's form of ID on tenant applications
-- The applicant selects a form of ID (ghana_card | passport | ...) and enters the number.
-- The ID number continues to be stored in applications.applicant_ghana_card (kept for back-compat);
-- this column records WHICH document that number belongs to. Uploaded ID images (front/back/bio)
-- live in applications.uploaded_documents (JSONB) and migrate to the tenant's documents on conversion.

ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS applicant_id_type VARCHAR(30);
