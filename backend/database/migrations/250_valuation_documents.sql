-- 250_valuation_documents.sql
-- Valuation-scoped documents & photos (subject photos, title documents, location/satellite map).
-- Mirrors valuation_floor_plans: the file lives in MinIO; we store the reference here and the
-- report (viewer + signed DOCX) embeds by valuation_id. Idempotent.

CREATE TABLE IF NOT EXISTS valuation_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    valuation_id    UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
    property_id     UUID,
    -- 'photo' (subject pictures -> Appendix D), 'title_document' (indenture/title -> Appendix E),
    -- 'location_map' (auto-generated satellite/location map -> Appendix C)
    doc_type        VARCHAR(32) NOT NULL DEFAULT 'photo',
    storage_url     TEXT NOT NULL,              -- minio://bucket/key
    filename        VARCHAR(512),
    mime_type       VARCHAR(128),
    caption         TEXT,
    file_size_bytes INTEGER,
    display_order   INTEGER NOT NULL DEFAULT 0,
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_valuation_documents_valuation
    ON valuation_documents (valuation_id, doc_type, display_order);
