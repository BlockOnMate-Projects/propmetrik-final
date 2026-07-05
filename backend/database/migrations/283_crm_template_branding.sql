-- ============================================================
-- Migration: 283_crm_template_branding.sql
-- Purpose: Replace the hardcoded "PROPMETRIK" / "PropMetrik" cover and
--          footer strings baked into the seeded CRM document + lease
--          templates with per-org branding merge fields, so generated
--          documents render the firm's own name/logo instead of the
--          platform wordmark.
--
--          The document renderer (documentGenerationService.gatherMergeData)
--          now supplies an {{organization.*}} + {{branding.*}} context, and
--          the lease renderer (leaseTemplateService) supplies {{firmName}}/
--          {{firmLogoUrl}}. This migration rewrites the stored template
--          bodies to reference those fields.
--
-- Idempotent: each REPLACE only matches the ORIGINAL hardcoded literal.
--             Once rewritten, the literal is gone, so re-running is a no-op.
-- Author: (branding wiring) — review + apply via `npm run migrate`.
-- ============================================================

-- ------------------------------------------------------------
-- 1. OFFER LETTER  (crm_document_templates id ...0001)
-- ------------------------------------------------------------

-- 1a. Cover logo → firm logo (image if configured) or firm name wordmark.
UPDATE crm_document_templates
SET template_html = REPLACE(
  template_html,
  '<div class="cover-logo">PROP<span class="gold">METRIK</span></div>',
  '<div class="cover-logo">{{#if branding.logoUrl}}<img src="{{branding.logoUrl}}" alt="{{organization.name}}" style="max-height:44px;width:auto;"/>{{else}}{{organization.name}}{{/if}}</div>'
)
WHERE id = 'a0000001-0001-4000-8000-000000000001';

-- 1b. Cover footer brand line → firm name.
UPDATE crm_document_templates
SET template_html = REPLACE(
  template_html,
  '<div class="cover-footer-brand">PROPMETRIK — Powered by Cedyn Group</div>',
  '<div class="cover-footer-brand">{{organization.name}}</div>'
)
WHERE id = 'a0000001-0001-4000-8000-000000000001';

-- 1c. Content footer "Generated via" line → firm name.
UPDATE crm_document_templates
SET template_html = REPLACE(
  template_html,
  '<p style="margin-top: 4px;">Generated via PROPMETRIK — Powered by Cedyn Group</p>',
  '<p style="margin-top: 4px;">Generated via {{organization.name}}</p>'
)
WHERE id = 'a0000001-0001-4000-8000-000000000001';


-- ------------------------------------------------------------
-- 2. SALES AGREEMENT (crm_document_templates id ...0002)
-- ------------------------------------------------------------

-- 2a. Cover logo → firm logo (image if configured) or firm name wordmark.
UPDATE crm_document_templates
SET template_html = REPLACE(
  template_html,
  '<div class="cover-logo">PROP<span class="gold">METRIK</span></div>',
  '<div class="cover-logo">{{#if branding.logoUrl}}<img src="{{branding.logoUrl}}" alt="{{organization.name}}" style="max-height:44px;width:auto;"/>{{else}}{{organization.name}}{{/if}}</div>'
)
WHERE id = 'a0000001-0001-4000-8000-000000000002';

-- 2b. Cover footer brand line → firm name.
UPDATE crm_document_templates
SET template_html = REPLACE(
  template_html,
  '<div class="cover-footer-brand">PROPMETRIK — Powered by Cedyn Group</div>',
  '<div class="cover-footer-brand">{{organization.name}}</div>'
)
WHERE id = 'a0000001-0001-4000-8000-000000000002';

-- 2c. Content footer "Generated via" line → firm name.
UPDATE crm_document_templates
SET template_html = REPLACE(
  template_html,
  '<p style="margin-top: 4px;">Generated via PROPMETRIK — Powered by Cedyn Group</p>',
  '<p style="margin-top: 4px;">Generated via {{organization.name}}</p>'
)
WHERE id = 'a0000001-0001-4000-8000-000000000002';


-- ------------------------------------------------------------
-- 3. LEASE TEMPLATES (lease_templates — seeded per-org in mig 129)
--    Renderer exposes {{firmName}} / {{firmLogoUrl}} (leaseTemplateService).
--    Footer literal: "... via PropMetrik". Scope to the seeded default
--    residential template body so we only touch the intended rows.
-- ------------------------------------------------------------
UPDATE lease_templates
SET content = REPLACE(
  content,
  'Document generated on {{formatDate generatedAt "short"}} via PropMetrik',
  'Document generated on {{formatDate generatedAt "short"}} via {{firmName}}'
)
WHERE content LIKE '%Document generated on {{formatDate generatedAt "short"}} via PropMetrik%';
