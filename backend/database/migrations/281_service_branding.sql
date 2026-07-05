-- Migration: 281_service_branding
-- PER-SERVICE company branding. Previously branding was a single org-wide profile
-- (columns on `organizations`) surfaced only under Valuation settings — which locked
-- a PM-only / CRM-only subscriber out of setting their own brand. This moves branding
-- to a per-(organization, service) row so EACH service (valuation, property_management,
-- crm, project_management) owns its own name/logo/palette that flows into that service's
-- documents. The org's central account settings stay focused on billing/identity.
--
-- Backfill: the existing org-wide branding is copied into service_type='valuation'
-- so valuation reports/invoices render EXACTLY as before.

CREATE TABLE IF NOT EXISTS service_branding (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    service_type         TEXT NOT NULL
                         CHECK (service_type IN ('valuation', 'property_management', 'crm', 'project_management')),

    -- Identity
    name                 TEXT,          -- firm/company name (falls back to organizations.name, then PROPMETRIK)
    tagline              TEXT,          -- short subtitle under the name

    -- Logo (uploaded via the branding logo endpoint → MinIO). logo_url is the
    -- browser-loadable serve URL; logo_key is the MinIO object key so the report
    -- generator can read the bytes DIRECTLY from MinIO (no HTTP round-trip).
    logo_url             TEXT,
    logo_key             TEXT,

    -- Palette / type
    primary_color        TEXT,
    secondary_color      TEXT,
    accent_color         TEXT,
    font_family          TEXT,

    -- Credentials
    professional_body    TEXT,
    license_number       TEXT,
    tax_id               TEXT,

    -- Address / contact
    address_line1        TEXT,
    address_line2        TEXT,
    city                 TEXT,
    region               TEXT,
    postal_code          TEXT,
    country              TEXT,
    phone                TEXT,
    email                TEXT,
    website              TEXT,

    -- Document/email chrome
    report_header_html   TEXT,
    report_footer_html   TEXT,
    email_signature_html TEXT,
    footer_text          TEXT,

    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (organization_id, service_type)
);

CREATE INDEX IF NOT EXISTS idx_service_branding_org ON service_branding (organization_id);

DROP TRIGGER IF EXISTS update_service_branding_updated_at ON service_branding;
CREATE TRIGGER update_service_branding_updated_at
    BEFORE UPDATE ON service_branding
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Backfill valuation branding from the legacy org-wide columns (idempotent).
-- Only for orgs that actually configured branding, so we don't create noise rows;
-- unconfigured orgs simply resolve to defaults at read time.
INSERT INTO service_branding (
    organization_id, service_type,
    name, tagline, logo_url,
    primary_color, secondary_color, accent_color, font_family,
    professional_body, license_number, tax_id,
    address_line1, address_line2, city, region, postal_code, country,
    phone, email, website,
    report_header_html, report_footer_html, email_signature_html
)
SELECT
    o.id, 'valuation',
    o.name, o.description, o.logo_url,
    o.primary_color, o.secondary_color, o.accent_color, o.font_family,
    o.professional_body, o.license_number, o.tax_id,
    o.address_line1, o.address_line2, o.city, o.region, o.postal_code, o.country,
    o.phone, o.email, o.website,
    o.report_header_html, o.report_footer_html, o.email_signature_html
FROM organizations o
WHERE (
    o.logo_url IS NOT NULL
    OR o.professional_body IS NOT NULL
    OR o.license_number IS NOT NULL
    OR o.report_header_html IS NOT NULL
    OR o.report_footer_html IS NOT NULL
    OR o.email_signature_html IS NOT NULL
    OR o.tax_id IS NOT NULL
)
ON CONFLICT (organization_id, service_type) DO NOTHING;
