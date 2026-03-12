-- ============================================================
-- Migration: Seed Sales Agreement & Offer Letter Templates
-- Date: 2026-03-12
-- Purpose: Create branded Ghana-compliant document templates
--          and wire e-sign triggers to pipeline stages
-- ============================================================

-- ============================================================
-- 1. OFFER LETTER TEMPLATE
-- ============================================================
INSERT INTO crm_document_templates (
  id, organization_id, name, category, description,
  template_html, merge_fields, signature_fields, signer_roles,
  is_system_template, is_shared, status, version,
  ghana_legal_requirements, requires_stamp_duty, requires_notarization,
  created_by
) VALUES (
  'a0000001-0001-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'Property Offer Letter — Ghana',
  'offer_letter',
  'Formal offer letter for Ghana property transactions. Includes property details, offer price, conditions, and validity period. Compliant with Ghana Land Act 2020 (Act 1036).',
  -- template_html (see below)
  $TMPL_OFFER$
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Georgia', 'Times New Roman', serif; font-size: 11pt; line-height: 1.7; color: #1a1a1a; }

  /* ── Cover Page ── */
  .cover {
    width: 100%; min-height: 100vh; background: #0B0B0F; color: #fff;
    display: flex; flex-direction: column; padding: 60px 50px;
    border-left: 6px solid #C9A84C; page-break-after: always;
  }
  .cover-logo { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 26px; font-weight: 700; letter-spacing: 2px; }
  .cover-logo .gold { color: #C9A84C; }
  .cover-tagline { font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-top: 4px; }
  .cover-center { flex: 1; display: flex; flex-direction: column; justify-content: center; }
  .cover-type { font-size: 11px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; color: #C9A84C; margin-bottom: 12px; }
  .cover-divider { width: 60px; height: 2px; background: #C9A84C; margin-bottom: 24px; }
  .cover-title { font-family: Georgia, serif; font-size: 34px; font-weight: 700; line-height: 1.2; margin-bottom: 16px; }
  .cover-subtitle { font-size: 15px; font-style: italic; color: rgba(255,255,255,0.7); margin-bottom: 30px; }
  .cover-meta { font-size: 11px; color: rgba(255,255,255,0.5); }
  .cover-meta strong { color: rgba(255,255,255,0.8); }
  .cover-footer { border-top: 1px solid rgba(255,255,255,0.15); padding-top: 20px; }
  .cover-footer-brand { font-size: 11px; font-weight: 600; letter-spacing: 1px; color: rgba(255,255,255,0.4); }
  .cover-footer-legal { font-size: 8px; color: rgba(255,255,255,0.25); margin-top: 6px; }

  /* ── Content Pages ── */
  .content { padding: 50px; }
  .header-bar {
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 2px solid #C9A84C; padding-bottom: 12px; margin-bottom: 30px;
  }
  .header-bar .logo-text { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 1px; color: #1B3A5C; }
  .header-bar .logo-text .gold { color: #C9A84C; }
  .header-bar .doc-ref { font-size: 9px; color: #666; text-align: right; }

  h1 { font-size: 20pt; color: #1B3A5C; text-align: center; margin-bottom: 6px; }
  h2 { font-size: 13pt; color: #1B3A5C; margin: 24px 0 10px; border-bottom: 1px solid #D6E4F0; padding-bottom: 4px; }
  .subtitle { text-align: center; font-size: 10pt; color: #666; margin-bottom: 30px; }

  .info-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  .info-table td { padding: 8px 12px; border: 1px solid #D6E4F0; font-size: 10.5pt; vertical-align: top; }
  .info-table td:first-child { width: 35%; font-weight: 600; color: #1B3A5C; background: #F2F2F2; }

  .clause { margin: 14px 0; text-align: justify; }
  .clause-num { font-weight: 700; color: #1B3A5C; }

  .conditions-list { margin: 10px 0 10px 24px; }
  .conditions-list li { margin: 6px 0; }

  .sig-block { margin-top: 50px; page-break-inside: avoid; }
  .sig-row { display: flex; justify-content: space-between; gap: 40px; margin-top: 30px; }
  .sig-col { flex: 1; }
  .sig-line { border-top: 1px solid #000; margin-top: 50px; padding-top: 5px; font-size: 10pt; }
  .sig-label { font-size: 9pt; color: #666; margin-top: 2px; }

  .footer-bar {
    margin-top: 40px; border-top: 1px solid #D6E4F0; padding-top: 10px;
    font-size: 8pt; color: #999; text-align: center;
  }

  .highlight-box {
    background: #FFFBE6; border: 1px solid #C9A84C; border-radius: 4px;
    padding: 14px 18px; margin: 20px 0; font-size: 10pt;
  }
  .highlight-box strong { color: #92400e; }

  .company-header { text-align: right; font-size: 10pt; color: #333; margin-bottom: 20px; line-height: 1.5; }
  .company-header .org-name { font-size: 13pt; font-weight: 700; color: #1B3A5C; }
</style>
</head>
<body>

<!-- ═══════════ COVER PAGE ═══════════ -->
<div class="cover">
  <div>
    <div class="cover-logo">PROP<span class="gold">METRIK</span></div>
    <div class="cover-tagline">Real Estate Intelligence Platform</div>
  </div>
  <div class="cover-center">
    <div class="cover-type">Offer Letter</div>
    <div class="cover-divider"></div>
    <div class="cover-title">{{property.name}}</div>
    <div class="cover-subtitle">Property Offer — {{contact.full_name}}</div>
    <div class="cover-meta">
      <div><strong>Date:</strong> {{current.date_long}}</div>
      <div><strong>Reference:</strong> OL-{{deal.id}}</div>
      <div><strong>Prepared by:</strong> {{organization.name}}</div>
    </div>
  </div>
  <div class="cover-footer">
    <div class="cover-footer-brand">PROPMETRIK — Powered by Cedyn Group</div>
    <div class="cover-footer-legal">This document is confidential and intended for the named recipient only.</div>
  </div>
</div>

<!-- ═══════════ LETTER CONTENT ═══════════ -->
<div class="content">
  <div class="header-bar">
    <div class="logo-text">PROP<span class="gold">METRIK</span></div>
    <div class="doc-ref">
      Ref: OL-{{deal.id}}<br>
      Date: {{current.date_long}}
    </div>
  </div>

  <!-- Company Info Block -->
  <div class="company-header">
    <div class="org-name">{{organization.name}}</div>
    <div>{{organization.address}}</div>
    <div>{{organization.phone}} | {{organization.email}}</div>
    <div>{{organization.website}}</div>
  </div>

  <h1>OFFER LETTER</h1>
  <div class="subtitle">For the Purchase of Real Property in the Republic of Ghana</div>

  <!-- Recipient -->
  <p class="clause" style="margin-bottom: 20px;">
    <strong>To:</strong> {{contact.full_name}}<br>
    {{contact.address}}<br>
    {{contact.city}}, {{contact.country}}<br>
    {{contact.email}} | {{contact.phone}}
  </p>

  <p class="clause">
    Dear <strong>{{contact.full_name}}</strong>,
  </p>

  <p class="clause">
    We are pleased to submit this formal offer for the purchase of the property described herein,
    subject to the terms and conditions set out below.
  </p>

  <!-- Property Details -->
  <h2>1. Property Details</h2>
  <table class="info-table">
    <tr><td>Property Name</td><td>{{property.name}}</td></tr>
    <tr><td>Location / Address</td><td>{{property.address}}, {{property.city}}, {{property.region}}</td></tr>
    <tr><td>GhanaPost GPS</td><td>{{property.ghana_post_gps}}</td></tr>
    <tr><td>Property Type</td><td>{{property.property_type}}</td></tr>
    <tr><td>Land Title Number</td><td>{{property.land_title}}</td></tr>
    <tr><td>Plot Number</td><td>{{property.plot_number}}</td></tr>
    <tr><td>Land Size</td><td>{{property.land_size}} {{property.land_size_unit}}</td></tr>
    <tr><td>Bedrooms / Bathrooms</td><td>{{property.bedrooms}} Bed / {{property.bathrooms}} Bath</td></tr>
    <tr><td>Description</td><td>{{property.description}}</td></tr>
  </table>

  <!-- Offer Details -->
  <h2>2. Offer Price</h2>
  <div class="highlight-box">
    <strong>Offered Purchase Price:</strong> {{deal.value_formatted}} ({{deal.currency}})
  </div>
  <p class="clause">
    The above price is inclusive of the agreed purchase consideration for the property described above.
    Payment terms shall be as mutually agreed upon acceptance of this offer and documented in the
    subsequent Sales Agreement.
  </p>

  <!-- Conditions -->
  <h2>3. Conditions of Offer</h2>
  <p class="clause">This offer is subject to the following conditions:</p>
  <ol class="conditions-list">
    <li>Satisfactory title search and verification at the Lands Commission confirming the Vendor's
        unencumbered ownership of the property.</li>
    <li>Satisfactory physical inspection and property valuation by a qualified surveyor or valuer.</li>
    <li>Confirmation that the property is free from all encumbrances, liens, caveats, and third-party
        claims.</li>
    <li>Completion of due diligence including verification of all planning permissions, building
        permits, and compliance with local zoning regulations.</li>
    <li>Execution of a formal Sales Agreement between both parties within thirty (30) days of
        acceptance of this offer.</li>
    <li>Compliance with all requirements under the Land Act, 2020 (Act 1036) and related legislation.</li>
  </ol>

  <!-- Validity -->
  <h2>4. Validity Period</h2>
  <p class="clause">
    This offer shall remain valid for a period of <strong>fourteen (14) calendar days</strong> from the date
    of this letter. If no written acceptance is received within this period, the offer shall be
    deemed to have lapsed automatically without further notice.
  </p>

  <!-- Earnest Money -->
  <h2>5. Earnest Money Deposit</h2>
  <p class="clause">
    Upon acceptance of this offer, the Purchaser shall pay an earnest money deposit equivalent to
    <strong>ten percent (10%)</strong> of the offered purchase price into an escrow account designated
    by the parties' legal representatives. This deposit shall be applied toward the purchase price
    upon completion or forfeited if the Purchaser defaults without cause.
  </p>

  <!-- Governing Law -->
  <h2>6. Governing Law</h2>
  <p class="clause">
    This offer and any agreement arising therefrom shall be governed by and construed in accordance
    with the laws of the Republic of Ghana, including but not limited to the Land Act, 2020 (Act 1036),
    the Conveyancing Act, 1973 (NRCD 175), and the Stamp Duty Act, 2005 (Act 689).
  </p>

  <!-- Acceptance -->
  <h2>7. Acceptance</h2>
  <p class="clause">
    To accept this offer, please sign and return a copy of this letter to the address above or via
    electronic signature as facilitated through the PropMetrik platform.
  </p>

  <!-- Signatures -->
  <div class="sig-block">
    <p style="font-weight: 600; color: #1B3A5C;">IN WITNESS WHEREOF, the parties have executed this Offer Letter.</p>
    <div class="sig-row">
      <div class="sig-col">
        <div class="sig-line">Signature — Offeror / Purchaser</div>
        <div class="sig-label">Name: {{contact.full_name}}</div>
        <div class="sig-label">Date: ________________________</div>
      </div>
      <div class="sig-col">
        <div class="sig-line">Signature — Vendor / Authorized Agent</div>
        <div class="sig-label">For & on behalf of: {{organization.name}}</div>
        <div class="sig-label">Date: ________________________</div>
      </div>
    </div>
  </div>

  <div class="footer-bar">
    <p>{{organization.name}} | {{organization.address}} | {{organization.phone}} | {{organization.email}}</p>
    <p style="margin-top: 4px;">Generated via PROPMETRIK — Powered by Cedyn Group</p>
  </div>
</div>

</body>
</html>
$TMPL_OFFER$,
  -- merge_fields
  '[
    {"key": "organization.name", "required": true},
    {"key": "organization.address", "required": true},
    {"key": "organization.phone", "required": false},
    {"key": "organization.email", "required": false},
    {"key": "organization.website", "required": false},
    {"key": "contact.full_name", "required": true},
    {"key": "contact.address", "required": false},
    {"key": "contact.city", "required": false},
    {"key": "contact.country", "required": false},
    {"key": "contact.email", "required": false},
    {"key": "contact.phone", "required": false},
    {"key": "deal.id", "required": true},
    {"key": "deal.value_formatted", "required": true},
    {"key": "deal.currency", "required": true},
    {"key": "property.name", "required": true},
    {"key": "property.address", "required": true},
    {"key": "property.city", "required": false},
    {"key": "property.region", "required": false},
    {"key": "property.ghana_post_gps", "required": false},
    {"key": "property.property_type", "required": false},
    {"key": "property.land_title", "required": false},
    {"key": "property.plot_number", "required": false},
    {"key": "property.land_size", "required": false},
    {"key": "property.land_size_unit", "required": false},
    {"key": "property.bedrooms", "required": false},
    {"key": "property.bathrooms", "required": false},
    {"key": "property.description", "required": false},
    {"key": "current.date_long", "required": true}
  ]'::jsonb,
  -- signature_fields
  '[
    {"role": "buyer", "page": 2, "x": 0.08, "y": 0.80, "width": 0.35, "height": 0.04, "required": true},
    {"role": "seller", "page": 2, "x": 0.55, "y": 0.80, "width": 0.35, "height": 0.04, "required": true}
  ]'::jsonb,
  -- signer_roles
  '[
    {"name": "buyer", "order": 1, "required": true},
    {"name": "seller", "order": 2, "required": true}
  ]'::jsonb,
  true,   -- is_system_template
  true,   -- is_shared
  'active',
  1,
  'Compliant with Land Act 2020 (Act 1036). Offer letter is a preliminary document and does not transfer title.',
  false,  -- requires_stamp_duty
  false,  -- requires_notarization
  NULL
) ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 2. SALES AGREEMENT (FREEHOLD) TEMPLATE
-- ============================================================
INSERT INTO crm_document_templates (
  id, organization_id, name, category, description,
  template_html, merge_fields, signature_fields, signer_roles,
  is_system_template, is_shared, status, version,
  ghana_legal_requirements, requires_stamp_duty, requires_notarization,
  created_by
) VALUES (
  'a0000001-0001-4000-8000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'Property Sales Agreement — Ghana (Freehold)',
  'sales_agreement_freehold',
  'Comprehensive freehold property sales agreement compliant with Ghana Land Act 2020 (Act 1036). Includes all 15 clauses covering parties, definitions, property description, purchase price, warranties, conditions precedent, completion, taxes, risk, obligations, default, dispute resolution, AML/KYC, general provisions, and execution.',
  -- template_html
  $TMPL_SALES$
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Georgia', 'Times New Roman', serif; font-size: 11pt; line-height: 1.7; color: #1a1a1a; }

  /* ── Cover Page ── */
  .cover {
    width: 100%; min-height: 100vh; background: #0B0B0F; color: #fff;
    display: flex; flex-direction: column; padding: 60px 50px;
    border-left: 6px solid #C9A84C; page-break-after: always;
  }
  .cover-logo { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 26px; font-weight: 700; letter-spacing: 2px; }
  .cover-logo .gold { color: #C9A84C; }
  .cover-tagline { font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-top: 4px; }
  .cover-center { flex: 1; display: flex; flex-direction: column; justify-content: center; }
  .cover-type { font-size: 11px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; color: #C9A84C; margin-bottom: 12px; }
  .cover-divider { width: 60px; height: 2px; background: #C9A84C; margin-bottom: 24px; }
  .cover-title { font-family: Georgia, serif; font-size: 34px; font-weight: 700; line-height: 1.2; margin-bottom: 16px; }
  .cover-subtitle { font-size: 15px; font-style: italic; color: rgba(255,255,255,0.7); margin-bottom: 30px; }
  .cover-meta { font-size: 11px; color: rgba(255,255,255,0.5); }
  .cover-meta strong { color: rgba(255,255,255,0.8); }
  .cover-parties { margin-top: 30px; display: flex; gap: 40px; }
  .cover-party { flex: 1; border-left: 2px solid rgba(201,168,76,0.4); padding-left: 16px; }
  .cover-party-label { font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: #C9A84C; margin-bottom: 4px; }
  .cover-party-name { font-size: 14px; font-weight: 600; }
  .cover-footer { border-top: 1px solid rgba(255,255,255,0.15); padding-top: 20px; }
  .cover-footer-brand { font-size: 11px; font-weight: 600; letter-spacing: 1px; color: rgba(255,255,255,0.4); }
  .cover-footer-legal { font-size: 8px; color: rgba(255,255,255,0.25); margin-top: 6px; }

  /* ── Content Pages ── */
  .content { padding: 50px; }
  .header-bar {
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 2px solid #C9A84C; padding-bottom: 12px; margin-bottom: 30px;
  }
  .header-bar .logo-text { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 1px; color: #1B3A5C; }
  .header-bar .logo-text .gold { color: #C9A84C; }
  .header-bar .doc-ref { font-size: 9px; color: #666; text-align: right; }

  h1 { font-size: 20pt; color: #1B3A5C; text-align: center; margin-bottom: 6px; }
  .doc-subtitle { text-align: center; font-size: 10pt; color: #666; margin-bottom: 30px; }
  h2 { font-size: 13pt; color: #1B3A5C; margin: 28px 0 10px; border-bottom: 1px solid #D6E4F0; padding-bottom: 4px; }
  h3 { font-size: 11pt; color: #1B3A5C; margin: 16px 0 8px; }

  .section-band {
    background: #1B3A5C; color: #fff; padding: 8px 16px; font-size: 12pt;
    font-weight: 700; letter-spacing: 1px; margin: 30px 0 16px;
    page-break-after: avoid;
  }

  .info-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  .info-table td { padding: 8px 12px; border: 1px solid #D6E4F0; font-size: 10.5pt; vertical-align: top; }
  .info-table td:first-child { width: 35%; font-weight: 600; color: #1B3A5C; background: #F2F2F2; }

  .clause { margin: 12px 0; text-align: justify; }
  .clause-head { font-weight: 700; color: #1B3A5C; margin: 18px 0 6px; }
  .sub-clause { margin: 8px 0 8px 24px; text-align: justify; }

  .conditions-list { margin: 8px 0 8px 24px; }
  .conditions-list li { margin: 5px 0; }

  .sig-block { margin-top: 50px; page-break-inside: avoid; }
  .sig-row { display: flex; justify-content: space-between; gap: 40px; margin-top: 30px; }
  .sig-col { flex: 1; }
  .sig-line { border-top: 1px solid #000; margin-top: 50px; padding-top: 5px; font-size: 10pt; }
  .sig-label { font-size: 9pt; color: #666; margin-top: 2px; }

  .footer-bar {
    margin-top: 40px; border-top: 1px solid #D6E4F0; padding-top: 10px;
    font-size: 8pt; color: #999; text-align: center;
  }

  .legal-disclaimer {
    background: #FEF2F2; border: 1px solid #FECACA; border-radius: 4px;
    padding: 14px 18px; margin: 24px 0; font-size: 9pt; color: #991B1B;
  }
  .legal-disclaimer strong { color: #7F1D1D; }

  .highlight-box {
    background: #FFFBE6; border: 1px solid #C9A84C; border-radius: 4px;
    padding: 14px 18px; margin: 16px 0; font-size: 10pt;
  }
  .highlight-box strong { color: #92400e; }

  .company-header { text-align: right; font-size: 10pt; color: #333; margin-bottom: 20px; line-height: 1.5; }
  .company-header .org-name { font-size: 13pt; font-weight: 700; color: #1B3A5C; }
</style>
</head>
<body>

<!-- ═══════════ COVER PAGE ═══════════ -->
<div class="cover">
  <div>
    <div class="cover-logo">PROP<span class="gold">METRIK</span></div>
    <div class="cover-tagline">Real Estate Intelligence Platform</div>
  </div>
  <div class="cover-center">
    <div class="cover-type">Sales Agreement</div>
    <div class="cover-divider"></div>
    <div class="cover-title">{{property.name}}</div>
    <div class="cover-subtitle">Property Sale Contract — Freehold Interest</div>
    <div class="cover-meta">
      <div><strong>Contract Date:</strong> {{current.date_long}}</div>
      <div><strong>Reference:</strong> SA-{{deal.id}}</div>
    </div>
    <div class="cover-parties">
      <div class="cover-party">
        <div class="cover-party-label">Vendor</div>
        <div class="cover-party-name">{{organization.name}}</div>
      </div>
      <div class="cover-party">
        <div class="cover-party-label">Purchaser</div>
        <div class="cover-party-name">{{contact.full_name}}</div>
      </div>
    </div>
  </div>
  <div class="cover-footer">
    <div class="cover-footer-brand">PROPMETRIK — Powered by Cedyn Group</div>
    <div class="cover-footer-legal">This document is confidential. Prepared for the exclusive use of the named parties.</div>
  </div>
</div>

<!-- ═══════════ CONTRACT CONTENT ═══════════ -->
<div class="content">
  <div class="header-bar">
    <div class="logo-text">PROP<span class="gold">METRIK</span></div>
    <div class="doc-ref">
      Ref: SA-{{deal.id}}<br>
      Date: {{current.date_long}}
    </div>
  </div>

  <!-- Company Info -->
  <div class="company-header">
    <div class="org-name">{{organization.name}}</div>
    <div>{{organization.address}}</div>
    <div>{{organization.phone}} | {{organization.email}}</div>
    <div>{{organization.website}}</div>
  </div>

  <h1>AGREEMENT FOR SALE OF LAND</h1>
  <div class="doc-subtitle">Made pursuant to the Land Act, 2020 (Act 1036) of the Republic of Ghana</div>

  <p class="clause">
    <strong>THIS AGREEMENT</strong> is made this <strong>{{current.date_long}}</strong>
  </p>

  <!-- ── CLAUSE 1: PARTIES ── -->
  <div class="section-band">CLAUSE 1 — PARTIES</div>

  <p class="clause"><strong>BETWEEN:</strong></p>

  <table class="info-table">
    <tr><td colspan="2" style="background: #1B3A5C; color: #fff; font-weight: 700; text-align: center;">THE VENDOR</td></tr>
    <tr><td>Name / Company</td><td>{{organization.name}}</td></tr>
    <tr><td>Address</td><td>{{organization.address}}</td></tr>
    <tr><td>Contact</td><td>{{organization.phone}} | {{organization.email}}</td></tr>
  </table>

  <p class="clause" style="text-align: center; font-weight: 700; margin: 16px 0;">— AND —</p>

  <table class="info-table">
    <tr><td colspan="2" style="background: #1B3A5C; color: #fff; font-weight: 700; text-align: center;">THE PURCHASER</td></tr>
    <tr><td>Full Name</td><td>{{contact.full_name}}</td></tr>
    <tr><td>Address</td><td>{{contact.address}}, {{contact.city}}, {{contact.country}}</td></tr>
    <tr><td>Ghana Card / National ID</td><td>{{contact.ghana_card_number}}</td></tr>
    <tr><td>TIN</td><td>{{contact.tin_number}}</td></tr>
    <tr><td>Contact</td><td>{{contact.phone}} | {{contact.email}}</td></tr>
    <tr><td>Occupation</td><td>{{contact.occupation}}</td></tr>
  </table>

  <p class="clause">
    (The Vendor and the Purchaser are hereinafter individually referred to as a <strong>"Party"</strong>
    and collectively as the <strong>"Parties"</strong>.)
  </p>

  <!-- ── CLAUSE 2: DEFINITIONS ── -->
  <div class="section-band">CLAUSE 2 — DEFINITIONS &amp; INTERPRETATION</div>

  <p class="clause">In this Agreement, unless the context otherwise requires:</p>
  <table class="info-table">
    <tr><td>"Agreement"</td><td>This Agreement for Sale of Land, including all Schedules and amendments.</td></tr>
    <tr><td>"Completion"</td><td>The transfer of title and possession of the Property from the Vendor to the Purchaser.</td></tr>
    <tr><td>"Completion Date"</td><td>The date specified in Clause 7, or such later date as the Parties may agree in writing.</td></tr>
    <tr><td>"Encumbrance"</td><td>Any mortgage, charge, lien, caveat, adverse claim, easement, restrictive covenant, or any other interest affecting the Property.</td></tr>
    <tr><td>"Ghana Card"</td><td>The national identification card issued under the National Identity Register Act, 2008 (Act 750).</td></tr>
    <tr><td>"Land Title Certificate"</td><td>A certificate of title issued by the Lands Commission under the Land Act, 2020 (Act 1036).</td></tr>
    <tr><td>"Property"</td><td>The real property described in Clause 3 and Schedule 1.</td></tr>
    <tr><td>"Purchase Price"</td><td>The total consideration payable by the Purchaser as specified in Clause 4.</td></tr>
  </table>

  <!-- ── CLAUSE 3: PROPERTY DESCRIPTION ── -->
  <div class="section-band">CLAUSE 3 — PROPERTY DESCRIPTION</div>

  <p class="clause">The Vendor agrees to sell and the Purchaser agrees to buy the following property:</p>
  <table class="info-table">
    <tr><td>Property Name</td><td>{{property.name}}</td></tr>
    <tr><td>Location / Address</td><td>{{property.address}}, {{property.city}}, {{property.region}}</td></tr>
    <tr><td>GhanaPost GPS Code</td><td>{{property.ghana_post_gps}}</td></tr>
    <tr><td>Property Type</td><td>{{property.property_type}}</td></tr>
    <tr><td>Land Title Number</td><td>{{property.land_title}}</td></tr>
    <tr><td>Plot / Block Number</td><td>Plot {{property.plot_number}}, Block {{property.block_number}}</td></tr>
    <tr><td>Land Size</td><td>{{property.land_size}} {{property.land_size_unit}}</td></tr>
    <tr><td>Bedrooms</td><td>{{property.bedrooms}}</td></tr>
    <tr><td>Bathrooms</td><td>{{property.bathrooms}}</td></tr>
    <tr><td>Description</td><td>{{property.description}}</td></tr>
  </table>
  <p class="clause">
    Together with all buildings, structures, fixtures, improvements, rights, easements, and
    appurtenances belonging to or enjoyed with the Property.
  </p>

  <!-- ── CLAUSE 4: PURCHASE PRICE ── -->
  <div class="section-band">CLAUSE 4 — PURCHASE PRICE &amp; PAYMENT</div>

  <div class="highlight-box">
    <strong>Total Purchase Price:</strong> {{deal.value_formatted}} ({{deal.currency}})
  </div>

  <p class="clause-head">4.1 Payment Schedule</p>
  <p class="clause">The Purchase Price shall be paid as follows:</p>
  <table class="info-table">
    <tr><td>Initial Deposit (10%)</td><td>Due upon execution of this Agreement</td></tr>
    <tr><td>Second Instalment (40%)</td><td>Due within thirty (30) days of execution</td></tr>
    <tr><td>Balance (50%)</td><td>Due on or before the Completion Date</td></tr>
  </table>

  <p class="clause-head">4.2 Payment Method</p>
  <p class="clause">
    All payments shall be made by bank transfer, banker's draft, or such other method as the
    Parties may agree in writing. Cash payments exceeding the threshold set by the Anti-Money
    Laundering Act, 2020 (Act 1044) shall not be accepted.
  </p>

  <p class="clause-head">4.3 Escrow</p>
  <p class="clause">
    All payments shall be made into an escrow account held by the Vendor's solicitor or such
    other account as the Parties may designate, pending completion of all conditions precedent.
  </p>

  <!-- ── CLAUSE 5: VENDOR WARRANTIES ── -->
  <div class="section-band">CLAUSE 5 — VENDOR WARRANTIES &amp; REPRESENTATIONS</div>
  <p class="clause">The Vendor warrants and represents that:</p>
  <ol class="conditions-list">
    <li>The Vendor is the sole legal and beneficial owner of the Property and has full power and
        authority to sell and transfer the Property.</li>
    <li>The Property is free from all Encumbrances, liens, caveats, and adverse claims of any kind.</li>
    <li>There are no pending or threatened legal proceedings, disputes, or claims relating to or
        affecting the Property.</li>
    <li>All taxes, rates, levies, and outgoings in respect of the Property have been paid up to
        the date of this Agreement.</li>
    <li>The Property complies with all applicable planning permissions, building regulations, and
        environmental laws.</li>
    <li>The information provided regarding the Property is true, accurate, and complete in all
        material respects.</li>
    <li>The Vendor has not entered into any agreement, option, or arrangement that would restrict
        the sale of the Property.</li>
    <li>No customary or stool land interest subsists over the Property that has not been disclosed
        to the Purchaser.</li>
  </ol>

  <!-- ── CLAUSE 6: CONDITIONS PRECEDENT ── -->
  <div class="section-band">CLAUSE 6 — CONDITIONS PRECEDENT</div>
  <p class="clause">Completion of this Agreement is conditional upon:</p>
  <ol class="conditions-list">
    <li>Satisfactory official search at the Lands Commission confirming the Vendor's title and
        the absence of any Encumbrances.</li>
    <li>Satisfactory physical inspection and independent valuation of the Property by a licensed
        valuer or surveyor.</li>
    <li>Receipt by the Purchaser of a clean title search report from the Purchaser's solicitor.</li>
    <li>Compliance with all regulatory requirements including consent from the Lands Commission
        (where applicable) for the transfer.</li>
    <li>Completion of all Anti-Money Laundering (AML) and Know-Your-Customer (KYC) checks as
        required under Act 1044.</li>
  </ol>
  <p class="clause">
    If any condition precedent is not satisfied or waived within sixty (60) days of execution,
    either Party may terminate this Agreement by written notice, and all sums paid by the Purchaser
    shall be refunded in full within fourteen (14) business days.
  </p>

  <!-- ── CLAUSE 7: COMPLETION ── -->
  <div class="section-band">CLAUSE 7 — COMPLETION</div>
  <p class="clause-head">7.1 Completion Date</p>
  <p class="clause">
    Completion shall take place within ninety (90) days of the date of this Agreement, or such
    other date as the Parties may agree in writing (the "Completion Date").
  </p>
  <p class="clause-head">7.2 Vendor Obligations on Completion</p>
  <p class="clause">On the Completion Date, the Vendor shall deliver to the Purchaser:</p>
  <ol class="conditions-list">
    <li>A duly executed Deed of Assignment / Conveyance / Indenture in registrable form.</li>
    <li>The original Land Title Certificate and all title documents.</li>
    <li>Site plan prepared by a licensed surveyor.</li>
    <li>Receipts for all ground rent, rates, and taxes paid to date.</li>
    <li>Vacant possession of the Property free from all Encumbrances.</li>
  </ol>
  <p class="clause-head">7.3 Purchaser Obligations on Completion</p>
  <p class="clause">
    On the Completion Date, the Purchaser shall pay the balance of the Purchase Price and execute
    all documents necessary to complete the transfer.
  </p>

  <!-- ── CLAUSE 8: TAXES & FEES ── -->
  <div class="section-band">CLAUSE 8 — STAMP DUTY, TAXES &amp; FEES</div>
  <table class="info-table">
    <tr><td>Stamp Duty</td><td>Payable by the Purchaser per the Stamp Duty Act, 2005 (Act 689)</td></tr>
    <tr><td>Capital Gains Tax</td><td>Payable by the Vendor at the prevailing rate under the Income Tax Act</td></tr>
    <tr><td>Registration Fees</td><td>Payable by the Purchaser for registration at the Lands Commission</td></tr>
    <tr><td>Legal Fees</td><td>Each Party shall bear their own legal costs</td></tr>
    <tr><td>Commission</td><td>As separately agreed between the Vendor and the designated agent</td></tr>
  </table>

  <!-- ── CLAUSE 9: RISK & INSURANCE ── -->
  <div class="section-band">CLAUSE 9 — RISK &amp; INSURANCE</div>
  <p class="clause">
    Risk in the Property shall pass to the Purchaser upon Completion. Until Completion, the Vendor
    shall maintain adequate insurance coverage on the Property and shall not do or permit anything
    that may adversely affect the Property.
  </p>

  <!-- ── CLAUSE 10: VENDOR POST-SALE OBLIGATIONS ── -->
  <div class="section-band">CLAUSE 10 — VENDOR OBLIGATIONS</div>
  <p class="clause">The Vendor undertakes to:</p>
  <ol class="conditions-list">
    <li>Cooperate fully with the Purchaser and the Lands Commission to effect the transfer and
        registration of the Property in the Purchaser's name.</li>
    <li>Execute all documents and take all steps reasonably necessary to complete the transfer.</li>
    <li>Not create or permit any Encumbrance on the Property between the date of this Agreement
        and Completion.</li>
    <li>Maintain the Property in its current condition and not make any material alterations
        without the Purchaser's consent.</li>
  </ol>

  <!-- ── CLAUSE 11: DEFAULT & REMEDIES ── -->
  <div class="section-band">CLAUSE 11 — DEFAULT &amp; REMEDIES</div>
  <p class="clause-head">11.1 Purchaser Default</p>
  <p class="clause">
    If the Purchaser fails to pay any instalment within fourteen (14) days of the due date,
    the Vendor may serve a written notice requiring payment within a further fourteen (14) days.
    If payment is not received, the Vendor may terminate this Agreement and retain the initial
    deposit as liquidated damages.
  </p>
  <p class="clause-head">11.2 Vendor Default</p>
  <p class="clause">
    If the Vendor fails to complete the sale or breaches any material warranty, the Purchaser
    shall be entitled to: (a) specific performance; (b) refund of all sums paid plus interest
    at the prevailing Bank of Ghana monetary policy rate; or (c) damages for breach of contract.
  </p>

  <!-- ── CLAUSE 12: DISPUTE RESOLUTION ── -->
  <div class="section-band">CLAUSE 12 — DISPUTE RESOLUTION</div>
  <p class="clause">
    Any dispute arising out of or in connection with this Agreement shall first be referred to
    mediation under the Alternative Dispute Resolution Act, 2010 (Act 798). If mediation fails
    within thirty (30) days, the dispute shall be referred to arbitration conducted in accordance
    with the Arbitration Act, 2010 (Act 798), with the seat of arbitration in Accra, Ghana.
  </p>

  <!-- ── CLAUSE 13: AML / KYC ── -->
  <div class="section-band">CLAUSE 13 — ANTI-MONEY LAUNDERING &amp; KYC</div>
  <p class="clause">
    Both Parties agree to comply with the Anti-Money Laundering Act, 2020 (Act 1044) and shall
    provide all necessary identification documents, proof of funds, and other information required
    for KYC verification. Either Party may terminate this Agreement if KYC requirements are not
    satisfied.
  </p>

  <!-- ── CLAUSE 14: GENERAL PROVISIONS ── -->
  <div class="section-band">CLAUSE 14 — GENERAL PROVISIONS</div>
  <p class="clause-head">14.1 Entire Agreement</p>
  <p class="clause">
    This Agreement constitutes the entire agreement between the Parties and supersedes all prior
    negotiations, representations, and agreements.
  </p>
  <p class="clause-head">14.2 Amendments</p>
  <p class="clause">
    No amendment or variation of this Agreement shall be effective unless made in writing and
    signed by both Parties.
  </p>
  <p class="clause-head">14.3 Notices</p>
  <p class="clause">
    All notices shall be in writing and delivered personally, by registered post, or by email
    to the addresses specified in Clause 1.
  </p>
  <p class="clause-head">14.4 Severability</p>
  <p class="clause">
    If any provision of this Agreement is held to be invalid or unenforceable, the remaining
    provisions shall continue in full force and effect.
  </p>
  <p class="clause-head">14.5 Governing Law</p>
  <p class="clause">
    This Agreement shall be governed by and construed in accordance with the laws of the Republic
    of Ghana, including the Land Act, 2020 (Act 1036), the Conveyancing Act, 1973 (NRCD 175),
    and the Stamp Duty Act, 2005 (Act 689).
  </p>
  <p class="clause-head">14.6 Successors</p>
  <p class="clause">
    This Agreement shall be binding upon and enure to the benefit of the Parties and their
    respective heirs, executors, administrators, successors, and permitted assigns.
  </p>

  <!-- ── CLAUSE 15: EXECUTION ── -->
  <div class="section-band">CLAUSE 15 — EXECUTION</div>

  <p class="clause">
    <strong>IN WITNESS WHEREOF</strong>, the Parties have executed this Agreement on the day and year
    first above written.
  </p>

  <div class="sig-block">
    <div class="sig-row">
      <div class="sig-col">
        <p style="font-weight: 700; color: #1B3A5C; margin-bottom: 4px;">THE VENDOR</p>
        <div class="sig-line">Signature</div>
        <div class="sig-label">Name: {{organization.name}}</div>
        <div class="sig-label">Date: ________________________</div>
      </div>
      <div class="sig-col">
        <p style="font-weight: 700; color: #1B3A5C; margin-bottom: 4px;">THE PURCHASER</p>
        <div class="sig-line">Signature</div>
        <div class="sig-label">Name: {{contact.full_name}}</div>
        <div class="sig-label">ID: {{contact.ghana_card_number}}</div>
        <div class="sig-label">Date: ________________________</div>
      </div>
    </div>

    <div class="sig-row" style="margin-top: 50px;">
      <div class="sig-col">
        <p style="font-weight: 700; color: #1B3A5C; margin-bottom: 4px;">WITNESS 1</p>
        <div class="sig-line">Signature</div>
        <div class="sig-label">Name: ________________________</div>
        <div class="sig-label">Address: ________________________</div>
        <div class="sig-label">Date: ________________________</div>
      </div>
      <div class="sig-col">
        <p style="font-weight: 700; color: #1B3A5C; margin-bottom: 4px;">WITNESS 2</p>
        <div class="sig-line">Signature</div>
        <div class="sig-label">Name: ________________________</div>
        <div class="sig-label">Address: ________________________</div>
        <div class="sig-label">Date: ________________________</div>
      </div>
    </div>
  </div>

  <!-- ── LEGAL DISCLAIMER ── -->
  <div class="legal-disclaimer">
    <strong>LEGAL DISCLAIMER:</strong> This document has been prepared as a standard form agreement
    and may not address all circumstances specific to the transaction. Both Parties are strongly
    advised to seek independent legal counsel before executing this Agreement. PropMetrik and Cedyn
    Group accept no liability for the use of this template.
  </div>

  <div class="footer-bar">
    <p>{{organization.name}} | {{organization.address}} | {{organization.phone}} | {{organization.email}}</p>
    <p style="margin-top: 4px;">Generated via PROPMETRIK — Powered by Cedyn Group</p>
  </div>
</div>

</body>
</html>
$TMPL_SALES$,
  -- merge_fields
  '[
    {"key": "organization.name", "required": true},
    {"key": "organization.address", "required": true},
    {"key": "organization.phone", "required": false},
    {"key": "organization.email", "required": false},
    {"key": "organization.website", "required": false},
    {"key": "contact.full_name", "required": true},
    {"key": "contact.address", "required": false},
    {"key": "contact.city", "required": false},
    {"key": "contact.country", "required": false},
    {"key": "contact.email", "required": false},
    {"key": "contact.phone", "required": false},
    {"key": "contact.ghana_card_number", "required": false},
    {"key": "contact.tin_number", "required": false},
    {"key": "contact.occupation", "required": false},
    {"key": "deal.id", "required": true},
    {"key": "deal.value_formatted", "required": true},
    {"key": "deal.currency", "required": true},
    {"key": "property.name", "required": true},
    {"key": "property.address", "required": true},
    {"key": "property.city", "required": false},
    {"key": "property.region", "required": false},
    {"key": "property.ghana_post_gps", "required": false},
    {"key": "property.property_type", "required": false},
    {"key": "property.land_title", "required": false},
    {"key": "property.plot_number", "required": false},
    {"key": "property.block_number", "required": false},
    {"key": "property.land_size", "required": false},
    {"key": "property.land_size_unit", "required": false},
    {"key": "property.bedrooms", "required": false},
    {"key": "property.bathrooms", "required": false},
    {"key": "property.description", "required": false},
    {"key": "current.date_long", "required": true}
  ]'::jsonb,
  -- signature_fields
  '[
    {"role": "seller", "page": -1, "x": 0.08, "y": 0.35, "width": 0.35, "height": 0.04, "required": true},
    {"role": "buyer", "page": -1, "x": 0.55, "y": 0.35, "width": 0.35, "height": 0.04, "required": true},
    {"role": "witness1", "page": -1, "x": 0.08, "y": 0.65, "width": 0.35, "height": 0.04, "required": true},
    {"role": "witness2", "page": -1, "x": 0.55, "y": 0.65, "width": 0.35, "height": 0.04, "required": true}
  ]'::jsonb,
  -- signer_roles
  '[
    {"name": "seller", "order": 1, "required": true},
    {"name": "buyer", "order": 2, "required": true},
    {"name": "witness1", "order": 3, "required": true},
    {"name": "witness2", "order": 4, "required": true}
  ]'::jsonb,
  true,   -- is_system_template
  true,   -- is_shared
  'active',
  1,
  'Full compliance with Land Act 2020 (Act 1036), Conveyancing Act 1973 (NRCD 175), Stamp Duty Act 2005 (Act 689), Anti-Money Laundering Act 2020 (Act 1044), and ADR Act 2010 (Act 798).',
  true,   -- requires_stamp_duty
  true,   -- requires_notarization
  NULL
) ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 3. WIRE E-SIGN TO PIPELINE STAGES
-- ============================================================

-- Wire "Offer Submitted" stage (stage_order = 7) to trigger e-sign with the Offer Letter template
UPDATE deal_stages
SET
  trigger_esign = true,
  esign_template_id = 'a0000001-0001-4000-8000-000000000001',
  esign_document_subject = 'Property Offer Letter — Signature Required',
  esign_document_message = 'Please review and sign the attached Property Offer Letter. This offer is valid for 14 days from the date of issue.',
  signer_config = '[
    {"role": "buyer", "source": "primary_contact"},
    {"role": "seller", "source": "assigned_agent"}
  ]'::jsonb,
  field_placements = '[
    {"page": 2, "x": 0.08, "y": 0.80, "width": 0.35, "height": 0.04, "role": "buyer"},
    {"page": 2, "x": 0.55, "y": 0.80, "width": 0.35, "height": 0.04, "role": "seller"}
  ]'::jsonb,
  auto_advance_on_sign = true
WHERE stage_order = 7
  AND pipeline_id = '2c76531d-1759-4d14-b79a-8f43921191cf';

-- Wire "Contract Signing" stage (stage_order = 18) to trigger e-sign with the Sales Agreement template
UPDATE deal_stages
SET
  trigger_esign = true,
  esign_template_id = 'a0000001-0001-4000-8000-000000000002',
  esign_document_subject = 'Property Sales Agreement — Signature Required',
  esign_document_message = 'Please review and sign the attached Property Sales Agreement. This agreement is governed by the laws of the Republic of Ghana.',
  signer_config = '[
    {"role": "seller", "source": "assigned_agent"},
    {"role": "buyer", "source": "primary_contact"},
    {"role": "witness1", "source": "manual"},
    {"role": "witness2", "source": "manual"}
  ]'::jsonb,
  field_placements = '[
    {"page": -1, "x": 0.08, "y": 0.35, "width": 0.35, "height": 0.04, "role": "seller"},
    {"page": -1, "x": 0.55, "y": 0.35, "width": 0.35, "height": 0.04, "role": "buyer"},
    {"page": -1, "x": 0.08, "y": 0.65, "width": 0.35, "height": 0.04, "role": "witness1"},
    {"page": -1, "x": 0.55, "y": 0.65, "width": 0.35, "height": 0.04, "role": "witness2"}
  ]'::jsonb,
  auto_advance_on_sign = true
WHERE stage_order = 18
  AND pipeline_id = '2c76531d-1759-4d14-b79a-8f43921191cf';

-- Set next_stage_on_sign for Offer Submitted → Negotiation (stage_order 8)
UPDATE deal_stages
SET next_stage_on_sign = (
  SELECT id FROM deal_stages
  WHERE stage_order = 8 AND pipeline_id = '2c76531d-1759-4d14-b79a-8f43921191cf'
  LIMIT 1
)
WHERE stage_order = 7
  AND pipeline_id = '2c76531d-1759-4d14-b79a-8f43921191cf';

-- Set next_stage_on_sign for Contract Signing → Payment Schedule (stage_order 19)
UPDATE deal_stages
SET next_stage_on_sign = (
  SELECT id FROM deal_stages
  WHERE stage_order = 19 AND pipeline_id = '2c76531d-1759-4d14-b79a-8f43921191cf'
  LIMIT 1
)
WHERE stage_order = 18
  AND pipeline_id = '2c76531d-1759-4d14-b79a-8f43921191cf';


-- ============================================================
-- 4. ADD STAGE DOCUMENT REQUIREMENTS
-- ============================================================

-- Offer Submitted stage requires Offer Letter
INSERT INTO crm_stage_document_requirements (
  organization_id, pipeline_id, stage_id,
  template_id, document_type, document_name,
  is_required, is_blocking, order_index, instructions, created_by
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  '2c76531d-1759-4d14-b79a-8f43921191cf',
  s.id,
  'a0000001-0001-4000-8000-000000000001',
  'offer_letter',
  'Property Offer Letter',
  true, true, 0,
  'Generate and send the Offer Letter to the purchaser for electronic signature.',
  NULL
FROM deal_stages s
WHERE s.stage_order = 7
  AND s.pipeline_id = '2c76531d-1759-4d14-b79a-8f43921191cf'
ON CONFLICT DO NOTHING;

-- Contract Signing stage requires Sales Agreement
INSERT INTO crm_stage_document_requirements (
  organization_id, pipeline_id, stage_id,
  template_id, document_type, document_name,
  is_required, is_blocking, order_index, instructions, created_by
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  '2c76531d-1759-4d14-b79a-8f43921191cf',
  s.id,
  'a0000001-0001-4000-8000-000000000002',
  'sales_agreement_freehold',
  'Property Sales Agreement (Freehold)',
  true, true, 0,
  'Generate and send the Sales Agreement for execution by all parties. Requires witness signatures.',
  NULL
FROM deal_stages s
WHERE s.stage_order = 18
  AND s.pipeline_id = '2c76531d-1759-4d14-b79a-8f43921191cf'
ON CONFLICT DO NOTHING;
