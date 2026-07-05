-- Migration 282: Brand the lease template letterhead + footer with the managing agent's identity
-- The active lease template (seeded/restyled by migration 237, id
-- '00000000-0000-0000-0000-000000000001') hardcoded a "PROPMETRIK" wordmark + tagline in the
-- letterhead and a "…via the PROPMETRIK Property Management System" footer. Those never reflect
-- the property manager's own company branding.
--
-- This migration swaps the hardcoded HTML for Handlebars branding vars that leaseTemplateService
-- now injects (firmName / firmTagline / firmLogoUrl / firmPrimaryColor / firmAccentColor /
-- firmContact). When a var is blank Handlebars renders empty; the service falls the values back to
-- PROPMETRIK defaults via resolveReportBranding(), so an org with no branding configured renders
-- exactly as before.
--
-- Idempotent + reversible-safe: uses REPLACE on the exact old strings, so re-running is a no-op
-- once applied (the old strings are gone) and it only ever touches the migration-237 template row.

UPDATE lease_templates
SET content = REPLACE(
    REPLACE(
      content,
      -- OLD hardcoded letterhead brand block (from migration 237)
      $OLDHEAD$    <div>
      <div class="wordmark">PROP<span class="mk">METRIK</span></div>
      <div class="tagline">Property Management &middot; Valuations &middot; Real Estate Intelligence</div>
    </div>$OLDHEAD$,
      -- NEW branded letterhead block (firm logo + firm name + firm tagline, primary-colour accent)
      $NEWHEAD$    <div>
      {{#if firmLogoUrl}}<img src="{{firmLogoUrl}}" alt="{{firmName}}" style="height:48px; display:block; margin-bottom:6px;" />{{/if}}
      <div class="wordmark" style="color:{{firmPrimaryColor}};">{{firmName}}</div>
      {{#if firmTagline}}<div class="tagline">{{firmTagline}}</div>{{/if}}
      {{#if firmContact}}<div class="tagline" style="letter-spacing:0.5px; text-transform:none;">{{firmContact}}</div>{{/if}}
    </div>$NEWHEAD$
    ),
    -- OLD hardcoded footer attribution (from migration 237)
    $OLDFOOT$Document generated on {{formatDate generatedAt "long"}} via the PROPMETRIK Property Management System.$OLDFOOT$,
    -- NEW firm-driven footer attribution (falls back to empty if firmName blank)
    $NEWFOOT$Document generated on {{formatDate generatedAt "long"}}{{#if firmName}} via {{firmName}}{{/if}}.$NEWFOOT$
)
WHERE id = '00000000-0000-0000-0000-000000000001';
