-- Migration 237: Professional redesign of the Ghana Residential Tenancy Agreement template
-- Restyles the active global lease template (PROPMETRIK letterhead, brand colour, auto-numbered
-- clauses via CSS counters, party/financial cards, payment schedule, added legal clauses:
-- Definitions, Quiet Enjoyment, Indemnity & Force Majeure, Data Protection, Notices) while
-- PRESERVING every dynamic Handlebars binding and the scenario-aware signature block
-- (propertyManagerSignsOnBehalf / isUserLandlord / landlordWillSign / default). Witnesses and the
-- pre-printed Signer ID are removed (the signer ID is stamped under the signature at signing).
-- Relies on document-service helpers: formatDate (now options-object safe), humanize, currencyName.
-- Idempotent: re-running simply re-sets the same content.

UPDATE lease_templates
SET content = $PMTLEASE$<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="color-scheme" content="light only" />
<style>
  :root{
    color-scheme: light;
    --brand:#E2691A; --brand-dark:#B5470A; --brand-tint:#FFF4EC;
    --ink:#15243B; --ink-soft:#324867; --body:#1F2A37; --muted:#5B6B7F;
    --line:#E3E8EF; --slate-tint:#F6F8FB;
  }
  *{ box-sizing:border-box; }
  html,body{ margin:0; padding:0; background:#ffffff; }
  body{ font-family:"Georgia","Times New Roman",serif; background:#ffffff; color:var(--body);
    font-size:11pt; line-height:1.55; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .contract{ counter-reset:section; }

  .letterhead{ display:flex; align-items:flex-end; justify-content:space-between;
    border-bottom:3px solid var(--brand); padding-bottom:12px; margin-bottom:6px; }
  .wordmark{ font-family:"Helvetica Neue",Arial,sans-serif; font-weight:800; letter-spacing:1.5px; font-size:20pt; color:var(--ink); }
  .wordmark .mk{ color:var(--brand); }
  .tagline{ font-family:"Helvetica Neue",Arial,sans-serif; font-weight:600; letter-spacing:3px; font-size:6.5pt; color:var(--muted); text-transform:uppercase; margin-top:2px; }
  .doc-meta{ text-align:right; font-family:"Helvetica Neue",Arial,sans-serif; font-size:8pt; color:var(--muted); min-width:190px; }
  .doc-meta .pill{ display:inline-block; margin-top:4px; background:var(--brand-tint); color:var(--brand-dark);
    border:1px solid #F3D7C2; border-radius:20px; padding:2px 10px; font-weight:700; font-size:7.5pt; letter-spacing:.6px; }

  .title-wrap{ text-align:center; margin:26px 0 4px; }
  h1.title{ font-family:"Helvetica Neue",Arial,sans-serif; font-size:21pt; letter-spacing:3px; color:var(--ink); margin:0; font-weight:800; }
  .title-rule{ width:90px; height:3px; background:var(--brand); margin:10px auto 0; border-radius:2px; }
  .made-on{ text-align:center; font-style:italic; color:var(--ink-soft); margin:14px 0 22px; font-size:11pt; }
  .made-on b{ font-style:normal; color:var(--ink); }

  .parties{ display:flex; gap:14px; margin:4px 0 8px; }
  .pcard{ flex:1; background:var(--slate-tint); border:1px solid var(--line); border-left:4px solid var(--brand); border-radius:8px; padding:14px 16px; break-inside:avoid; }
  .pcard.tenant{ border-left-color:var(--ink); }
  .pcard .role{ font-family:"Helvetica Neue",Arial,sans-serif; font-size:7.5pt; font-weight:800; letter-spacing:1.5px; text-transform:uppercase; color:var(--brand-dark); margin-bottom:6px; }
  .pcard.tenant .role{ color:var(--ink); }
  .pcard .pname{ font-weight:700; font-size:12.5pt; color:var(--ink); margin-bottom:6px; }
  .pcard dl{ margin:0; font-size:9.5pt; color:var(--ink-soft); }
  .pcard dl .row{ display:flex; gap:6px; margin:2px 0; }
  .pcard dl .k{ color:var(--muted); min-width:92px; }
  .pcard dl .v{ color:var(--body); }
  .andbar{ text-align:center; font-family:"Helvetica Neue",Arial,sans-serif; font-weight:800; letter-spacing:4px; color:var(--brand); font-size:10pt; margin:10px 0; }
  .legal-note{ font-size:8.5pt; color:var(--muted); font-style:italic; margin:6px 2px 0; }
  .agent-line{ margin:12px 0 0; font-size:9.5pt; color:var(--ink-soft); background:var(--brand-tint); border:1px solid #F3D7C2; border-radius:6px; padding:8px 12px; }
  .agent-line b{ color:var(--brand-dark); }

  .recitals{ margin:20px 0 6px; }
  .recitals p{ margin:8px 0; }
  .witnesseth{ font-weight:700; color:var(--ink); }

  .infogrid{ display:flex; gap:14px; margin:10px 0; }
  .infocard{ flex:1; border:1px solid var(--line); border-radius:8px; overflow:hidden; break-inside:avoid; }
  .infocard .cap{ background:var(--ink); color:#fff; font-family:"Helvetica Neue",Arial,sans-serif; font-size:8pt; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; padding:7px 12px; }
  .infocard.fin .cap{ background:var(--brand); }
  .infocard .ibody{ padding:10px 14px; font-size:10pt; }
  .infocard .ibody .row{ display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px dashed var(--line); }
  .infocard .ibody .row:last-child{ border-bottom:0; }
  .infocard .ibody .k{ color:var(--muted); }
  .infocard .ibody .v{ color:var(--ink); font-weight:600; }
  .fin .v.big{ color:var(--brand-dark); }

  h2.sec{ counter-increment:section; counter-reset:clause; font-family:"Helvetica Neue",Arial,sans-serif; font-size:11.5pt; color:var(--ink);
    margin:22px 0 8px; padding-bottom:5px; border-bottom:1.5px solid var(--line); display:flex; align-items:center; gap:10px; font-weight:800; letter-spacing:.3px; }
  h2.sec .badge{ width:24px; height:24px; flex:none; background:var(--brand); color:#fff; border-radius:6px; display:inline-flex; align-items:center; justify-content:center; font-size:10pt; font-weight:800; }
  h2.sec .badge::before{ content:counter(section); }

  p.cl{ counter-increment:clause; margin:7px 0; text-align:left; }
  p.cl > .n{ color:var(--brand-dark); font-weight:700; font-family:"Helvetica Neue",Arial,sans-serif; font-size:9.5pt; margin-right:5px; }
  p.cl > .n::before{ content:counter(section) "." counter(clause); }
  p.cl .lead{ font-weight:700; color:var(--ink); }
  .muted{ color:var(--muted); }

  ul.ll{ margin:6px 0 6px 4px; padding-left:20px; }
  ul.ll li{ margin:3px 0; }
  ul.ll li::marker{ color:var(--brand); }

  .schedule-title{ font-family:"Helvetica Neue",Arial,sans-serif; font-weight:800; letter-spacing:1px; color:#fff; background:var(--ink); padding:8px 14px; border-radius:6px; font-size:10pt; margin:18px 0 10px; }
  table.sched{ width:100%; border-collapse:collapse; font-size:9.5pt; }
  table.sched th{ background:var(--slate-tint); color:var(--ink); text-align:left; padding:7px 10px; border:1px solid var(--line); font-family:"Helvetica Neue",Arial,sans-serif; font-size:8.5pt; letter-spacing:.4px; }
  table.sched td{ padding:7px 10px; border:1px solid var(--line); }

  .exec-head{ font-family:"Helvetica Neue",Arial,sans-serif; font-weight:800; letter-spacing:1.5px; color:var(--ink); font-size:12pt; margin:24px 0 6px; text-transform:uppercase; }
  .exec-rule{ height:3px; width:70px; background:var(--brand); border-radius:2px; margin-bottom:12px; }
  .sigrow{ display:flex; gap:34px; margin:26px 0 6px; break-inside:avoid; }
  .sigblock{ flex:1; }
  .sigblock.full{ flex:0 0 100%; }
  .sigline{ border-bottom:1.4px solid var(--ink); height:34px; }
  .signame{ font-weight:700; color:var(--ink); margin-top:5px; font-size:10.5pt; }
  .sigrole{ font-family:"Helvetica Neue",Arial,sans-serif; font-size:7.5pt; letter-spacing:1px; text-transform:uppercase; color:var(--brand-dark); margin-top:1px; }
  .sigsub{ font-size:8.5pt; color:var(--muted); font-style:italic; margin-top:1px; }
  .dateline{ margin-top:8px; font-size:9pt; color:var(--ink-soft); }

  .footer-note{ margin-top:26px; padding-top:12px; border-top:1px solid var(--line); text-align:center; color:var(--muted); font-size:8.5pt; }
  .footer-note .disc{ font-style:italic; margin-top:4px; }
  .page-break{ break-before:page; }
</style>
</head>
<body>
<div class="contract">

  <div class="letterhead">
    <div>
      <div class="wordmark">PROP<span class="mk">METRIK</span></div>
      <div class="tagline">Property Management &middot; Valuations &middot; Real Estate Intelligence</div>
    </div>
    <div class="doc-meta">
      <div>Issued: {{formatDate today "long"}}</div>
      <div class="pill">RESIDENTIAL TENANCY</div>
    </div>
  </div>

  <div class="title-wrap">
    <h1 class="title">TENANCY AGREEMENT</h1>
    <div class="title-rule"></div>
  </div>
  <p class="made-on">THIS AGREEMENT is made on <b>{{formatDate today "long"}}</b></p>

  <div class="parties">
    <div class="pcard landlord">
      <div class="role">Landlord / Owner</div>
      <div class="pname">{{landlordName}}</div>
      <dl>
        {{#if landlordAddress}}<div class="row"><span class="k">Address</span><span class="v">{{landlordAddress}}</span></div>{{/if}}
        {{#if landlordIdNumber}}<div class="row"><span class="k">Ghana Card</span><span class="v">{{landlordIdNumber}}</span></div>{{/if}}
        {{#if landlordPhone}}<div class="row"><span class="k">Contact</span><span class="v">{{landlordPhone}}</span></div>{{/if}}
        {{#if landlordEmail}}<div class="row"><span class="k">Email</span><span class="v">{{landlordEmail}}</span></div>{{/if}}
      </dl>
    </div>
    <div class="pcard tenant">
      <div class="role">Tenant</div>
      <div class="pname">{{tenantName}}</div>
      <dl>
        {{#if tenantAddress}}<div class="row"><span class="k">Address</span><span class="v">{{tenantAddress}}</span></div>{{/if}}
        {{#if tenantIdNumber}}<div class="row"><span class="k">Ghana Card</span><span class="v">{{tenantIdNumber}}</span></div>{{/if}}
        {{#if tenantPhone}}<div class="row"><span class="k">Contact</span><span class="v">{{tenantPhone}}</span></div>{{/if}}
        {{#if tenantEmail}}<div class="row"><span class="k">Email</span><span class="v">{{tenantEmail}}</span></div>{{/if}}
      </dl>
    </div>
  </div>
  <div class="andbar">&mdash; AND &mdash;</div>
  {{#unless isUserLandlord}}
  <div class="agent-line">Managed and executed on the Landlord's behalf by <b>{{propertyManagerName}}</b> (Managing Agent), duly authorised under a property management mandate.</div>
  {{/unless}}
  <p class="legal-note">The Landlord and the Tenant are hereinafter referred to individually as a "Party" and collectively as the "Parties", which expressions shall, where the context so admits, include their respective successors-in-title, assigns, and legal representatives.</p>

  <div class="recitals">
    <h2 class="sec"><span class="badge"></span> RECITALS &amp; DESCRIPTION OF PREMISES</h2>
    <p>WHEREAS the Landlord is the lawful owner and possessor of the property hereinafter described and has agreed to let the same to the Tenant, and the Tenant has agreed to take the said property upon the terms and conditions hereinafter contained.</p>
    <p class="witnesseth">NOW THIS AGREEMENT WITNESSETH and it is hereby agreed as follows:</p>
    <p class="cl"><span class="n"></span> The Landlord hereby lets to the Tenant ALL THAT property more particularly described below (the "Premises"):</p>
    <div class="infogrid">
      <div class="infocard">
        <div class="cap">Property Particulars</div>
        <div class="ibody">
          {{#if propertyTitle}}<div class="row"><span class="k">Property</span><span class="v">{{propertyTitle}}</span></div>{{/if}}
          <div class="row"><span class="k">Address</span><span class="v">{{propertyAddress}}</span></div>
          {{#if unitNumber}}<div class="row"><span class="k">Unit</span><span class="v">{{unitNumber}}</span></div>{{/if}}
          <div class="row"><span class="k">Type</span><span class="v">{{humanize propertyType}}</span></div>
          <div class="row"><span class="k">Bedrooms / Baths</span><span class="v">{{bedrooms}} Bed &middot; {{bathrooms}} Bath</span></div>
          {{#if furnishing}}<div class="row"><span class="k">Furnishing</span><span class="v">{{furnishing}}</span></div>{{/if}}
        </div>
      </div>
      <div class="infocard fin">
        <div class="cap">Key Financial Terms</div>
        <div class="ibody">
          <div class="row"><span class="k">Monthly Rent</span><span class="v big">{{rentCurrency}} {{formatNumber monthlyRent}}</span></div>
          {{#if securityDeposit}}<div class="row"><span class="k">Security Deposit</span><span class="v">{{rentCurrency}} {{formatNumber securityDeposit}}</span></div>{{/if}}
          {{#if advanceMonths}}<div class="row"><span class="k">Advance</span><span class="v">{{advanceMonths}} month(s) ({{rentCurrency}} {{formatNumber advanceAmount}})</span></div>{{/if}}
          <div class="row"><span class="k">Term</span><span class="v">{{leaseDurationMonths}} months</span></div>
          <div class="row"><span class="k">Commences</span><span class="v">{{formatDate leaseStartDate "medium"}}</span></div>
        </div>
      </div>
    </div>
    {{#if amenities}}<p class="cl"><span class="n"></span> <span class="lead">Inclusions:</span> The Premises include the following fixtures, fittings, and amenities: {{amenities}}.</p>{{/if}}
  </div>

  <h2 class="sec"><span class="badge"></span> DEFINITIONS &amp; INTERPRETATION</h2>
  <p class="cl"><span class="n"></span> In this Agreement, unless the context otherwise requires: <span class="lead">"Premises"</span> means the property described above together with its fixtures and fittings; <span class="lead">"Rent"</span> means the monthly sum payable under the Rent clause; <span class="lead">"Term"</span> means the period of the tenancy; and <span class="lead">"Rent Control"</span> means the Rent Control Department of the Republic of Ghana.</p>
  <p class="cl"><span class="n"></span> Words importing the singular include the plural and vice versa, and headings are for convenience only and shall not affect interpretation.</p>

  <h2 class="sec"><span class="badge"></span> TERM OF TENANCY</h2>
  <p class="cl"><span class="n"></span> The tenancy shall commence on <span class="lead">{{formatDate leaseStartDate "medium"}}</span> and continue for a fixed term of <span class="lead">{{leaseDurationMonths}} month(s)</span>, expiring on <span class="lead">{{formatDate leaseEndDate "medium"}}</span>.</p>
  <p class="cl"><span class="n"></span> The Tenant may request renewal by providing written notice at least <span class="lead">three (3) months</span> prior to expiration. Renewal is subject to the Landlord's consent and compliance with Rent Control regulations.</p>

  <h2 class="sec"><span class="badge"></span> RENT &amp; PAYMENT TERMS</h2>
  <p class="cl"><span class="n"></span> <span class="lead">Monthly Rent:</span> {{rentCurrency}} {{formatNumber monthlyRent}} ({{monthlyRentWords}} {{currencyName rentCurrency}} only).</p>
  {{#if advanceMonths}}<p class="cl"><span class="n"></span> <span class="lead">Advance Payment:</span> The Tenant shall pay {{advanceMonths}} month(s) advance rent, totalling {{rentCurrency}} {{formatNumber advanceAmount}}, upon execution of this Agreement. <span class="muted">(Note: the maximum advance payment is six months as per Ghanaian law.)</span></p>{{/if}}
  <p class="cl"><span class="n"></span> <span class="lead">Payment Schedule:</span> Rent shall be paid on or before the {{ordinal paymentDueDay}} day of each month.</p>
  <p class="cl"><span class="n"></span> <span class="lead">Payment Method:</span> {{paymentMethod}}.</p>
  <p class="cl"><span class="n"></span> <span class="lead">Late Payment:</span> A late payment charge of {{lateFeePercentage}}% per month shall apply to rent overdue beyond 7 days of the due date.</p>
  <p class="cl"><span class="n"></span> <span class="lead">Rent Receipts:</span> The Landlord shall provide official receipts for all payments received.</p>
  <p class="cl"><span class="n"></span> <span class="lead">Rent Review:</span> No rent increase shall occur during the fixed term without mutual written consent and the approval of the Rent Control Department.</p>

  {{#if securityDeposit}}
  <h2 class="sec"><span class="badge"></span> SECURITY DEPOSIT</h2>
  <p class="cl"><span class="n"></span> The Tenant shall pay a refundable security deposit of <span class="lead">{{rentCurrency}} {{formatNumber securityDeposit}}</span> upon signing this Agreement.</p>
  <p class="cl"><span class="n"></span> The deposit shall be refunded within <span class="lead">fourteen (14) days</span> of tenancy termination, less deductions for:</p>
  <ul class="ll"><li>Unpaid rent or utilities;</li><li>Damage beyond normal wear and tear;</li><li>Outstanding cleaning or repair costs.</li></ul>
  <p class="cl"><span class="n"></span> The security deposit shall not be applied as rent without prior written agreement.</p>
  <p class="cl"><span class="n"></span> A joint inspection shall be conducted at commencement and termination to assess and record the condition of the Premises.</p>
  {{/if}}

  <h2 class="sec"><span class="badge"></span> USE OF PREMISES</h2>
  <p class="cl"><span class="n"></span> The Premises shall be used exclusively for <span class="lead">residential purposes</span> and occupied by the Tenant and immediate family members only.</p>
  {{#if maxOccupants}}<p class="cl"><span class="n"></span> <span class="lead">Maximum Occupancy:</span> {{maxOccupants}} persons.</p>{{/if}}
  <p class="cl"><span class="n"></span> The Tenant shall not:</p>
  <ul class="ll"><li>Use the Premises for illegal, immoral, or commercial activities;</li><li>Sublet, assign, or transfer possession without the Landlord's written consent;</li><li>Cause nuisance, disturbance, or damage to the property or neighbouring premises;</li><li>Engage in activities that violate local regulations or community rules.</li></ul>

  <h2 class="sec"><span class="badge"></span> QUIET ENJOYMENT</h2>
  <p class="cl"><span class="n"></span> The Landlord covenants that the Tenant, paying the Rent and performing the obligations herein, shall peaceably hold and enjoy the Premises during the Term without lawful interruption by the Landlord or any person claiming under or in trust for the Landlord.</p>

  <h2 class="sec"><span class="badge"></span> MAINTENANCE &amp; REPAIRS</h2>
  <p class="cl"><span class="n"></span> <span class="lead">Landlord's Responsibilities:</span></p>
  <ul class="ll"><li>Maintain structural integrity (walls, roof, foundation);</li><li>Ensure functional plumbing, electrical, and sewage systems;</li><li>Repair or replace major appliances and fixtures (unless damaged by the Tenant);</li><li>Maintain exterior, common areas, and building services.</li></ul>
  <p class="cl"><span class="n"></span> <span class="lead">Tenant's Responsibilities:</span></p>
  <ul class="ll"><li>Keep the interior clean and in good condition;</li><li>Report defects or needed repairs promptly to the Landlord;</li><li>Perform minor repairs (light bulbs, batteries, minor fixtures);</li><li>Pay for damage caused by negligence or misuse.</li></ul>
  <p class="cl"><span class="n"></span> The Tenant shall not make alterations, additions, improvements, or structural changes without the Landlord's prior written approval.</p>
  <p class="cl"><span class="n"></span> In emergencies (fire, flooding, burst pipes), the Tenant may arrange immediate repairs and seek reimbursement from the Landlord with supporting receipts.</p>

  <h2 class="sec"><span class="badge"></span> UTILITIES &amp; SERVICES</h2>
  {{#if noUtilitiesSpecified}}
  <p class="cl"><span class="n"></span> Unless otherwise agreed in writing, the Tenant shall be responsible for payment of all utilities including electricity, water, and other services.</p>
  {{else}}{{#if tenantPaysAllUtilities}}
  <p class="cl"><span class="n"></span> The <span class="lead">Tenant shall pay for ALL utilities</span>, including: {{tenantUtilitiesText}}.</p>
  {{else}}{{#if landlordPaysAllUtilities}}
  <p class="cl"><span class="n"></span> The <span class="lead">Landlord shall pay for ALL utilities</span>, including: {{landlordUtilitiesText}}.</p>
  {{else}}
  {{#if tenantUtilitiesText}}<p class="cl"><span class="n"></span> <span class="lead">Tenant shall pay for:</span> {{tenantUtilitiesText}}.</p>{{/if}}
  {{#if landlordUtilitiesText}}<p class="cl"><span class="n"></span> <span class="lead">Landlord shall pay for:</span> {{landlordUtilitiesText}}.</p>{{/if}}
  {{/if}}{{/if}}{{/if}}
  <p class="cl"><span class="n"></span> Utility meters shall be read jointly at the commencement and termination of the tenancy.</p>
  <p class="cl"><span class="n"></span> The Landlord shall ensure initial utility connections are functional. The Tenant shall handle ongoing service bills and maintain accounts in good standing.</p>

  <h2 class="sec"><span class="badge"></span> INSURANCE</h2>
  <p class="cl"><span class="n"></span> The Landlord shall maintain insurance coverage for the building structure against fire, natural disasters, and other structural risks.</p>
  <p class="cl"><span class="n"></span> The Tenant is strongly advised to obtain contents insurance for personal belongings and liability coverage.</p>
  <p class="cl"><span class="n"></span> The Landlord shall not be liable for loss, theft, or damage to the Tenant's personal property, except where caused by the Landlord's negligence.</p>

  <h2 class="sec"><span class="badge"></span> ACCESS &amp; INSPECTION</h2>
  <p class="cl"><span class="n"></span> The Landlord or authorised agents may enter the Premises for:</p>
  <ul class="ll"><li>Routine inspections (maximum quarterly);</li><li>Necessary repairs or maintenance;</li><li>Showing the property to prospective tenants/buyers.</li></ul>
  <p class="cl"><span class="n"></span> Except in emergencies, the Landlord shall provide at least <span class="lead">twenty-four (24) hours'</span> written notice before entry.</p>
  <p class="cl"><span class="n"></span> The Tenant shall not unreasonably deny access for legitimate purposes.</p>

  <h2 class="sec"><span class="badge"></span> TERMINATION &amp; RENEWAL</h2>
  <p class="cl"><span class="n"></span> <span class="lead">Fixed Term Expiration:</span> This Agreement shall terminate automatically on the expiration date unless renewed in writing.</p>
  <p class="cl"><span class="n"></span> <span class="lead">Notice for Non-Renewal:</span> Either party wishing not to renew must provide one (1) month's written notice prior to expiration.</p>
  <p class="cl"><span class="n"></span> <span class="lead">Early Termination by Tenant:</span> The Tenant may terminate early by providing {{noticePeriodDays}} days' written notice and may forfeit the security deposit unless otherwise agreed.</p>
  <p class="cl"><span class="n"></span> <span class="lead">Early Termination by Landlord:</span> Early termination by the Landlord (except for breach) requires compensation to the Tenant as prescribed by law.</p>
  <p class="cl"><span class="n"></span> <span class="lead">Termination for Breach:</span> Either party may terminate immediately for material breach, including non-payment of rent for seven (7) days beyond due date, illegal use, material damage, or violation of any fundamental term.</p>
  <p class="cl"><span class="n"></span> <span class="lead">Vacating Procedures:</span> Upon termination, the Tenant shall vacate by the termination date; return all keys, access cards, and remote controls; restore the Premises to original condition (fair wear excepted); clear all personal belongings; and allow final joint inspection.</p>

  <h2 class="sec"><span class="badge"></span> DEFAULT &amp; REMEDIES</h2>
  <p class="cl"><span class="n"></span> <span class="lead">Events of Default</span> include failure to pay rent within seven (7) days of due date; breach of any covenant herein; abandonment of the Premises; or bankruptcy or insolvency of the Tenant.</p>
  <p class="cl"><span class="n"></span> <span class="lead">Landlord's Remedies:</span> recover possession through lawful eviction procedures via Rent Control; claim unpaid rent and damages; forfeit security deposit for legitimate deductions; and pursue legal action for costs and damages.</p>
  <p class="cl"><span class="n"></span> <span class="lead">No Self-Help Eviction:</span> The Landlord shall not lock out, forcibly remove, or disconnect utilities without proper legal process and court order.</p>
  <p class="cl"><span class="n"></span> The Tenant shall be liable for all reasonable legal costs incurred by the Landlord in enforcing rights under this Agreement.</p>

  <h2 class="sec"><span class="badge"></span> INDEMNITY &amp; FORCE MAJEURE</h2>
  <p class="cl"><span class="n"></span> The Tenant shall indemnify and keep the Landlord indemnified against any liability, loss, or claim arising from the Tenant's use of the Premises or breach of this Agreement, save where caused by the Landlord's own negligence.</p>
  <p class="cl"><span class="n"></span> Neither party shall be liable for failure to perform obligations where such failure results from events beyond reasonable control (including natural disaster, civil unrest, or government action), provided the affected party gives prompt written notice.</p>

  <h2 class="sec"><span class="badge"></span> DATA PROTECTION</h2>
  <p class="cl"><span class="n"></span> Each party shall process the other's personal data (including Ghana Card details) solely for the administration of this tenancy and in accordance with the Data Protection Act, 2012 (Act 843), and shall not disclose such data to third parties save as required by law or to the Managing Agent for the performance of its mandate.</p>

  <h2 class="sec"><span class="badge"></span> DISPUTE RESOLUTION &amp; GOVERNING LAW</h2>
  <p class="cl"><span class="n"></span> The parties agree to resolve disputes amicably through good-faith negotiation.</p>
  <p class="cl"><span class="n"></span> Unresolved disputes shall be referred to the Rent Control Department for mediation; Alternative Dispute Resolution (ADR) mechanisms; or the Courts of competent jurisdiction in {{propertyCity}}, Ghana.</p>
  <p class="cl"><span class="n"></span> This Agreement shall be governed by and construed in accordance with the laws of the Republic of Ghana, including the Rent Act, 1963 (Act 220), the Rent Control Law, 1986 (PNDCL 138), and all applicable regulations.</p>

  <h2 class="sec"><span class="badge"></span> NOTICES</h2>
  <p class="cl"><span class="n"></span> All notices shall be in writing and delivered personally, by registered mail, or by electronic means to the addresses set out below:</p>
  <div class="infogrid">
    <div class="infocard">
      <div class="cap">Notices to the Landlord</div>
      <div class="ibody">
        <div class="row"><span class="k">Attn.</span><span class="v">{{landlordName}}</span></div>
        {{#if landlordAddress}}<div class="row"><span class="k">Address</span><span class="v">{{landlordAddress}}</span></div>{{/if}}
        {{#if landlordEmail}}<div class="row"><span class="k">Email</span><span class="v">{{landlordEmail}}</span></div>{{/if}}
      </div>
    </div>
    <div class="infocard">
      <div class="cap">Notices to the Tenant</div>
      <div class="ibody">
        <div class="row"><span class="k">Attn.</span><span class="v">{{tenantName}}</span></div>
        {{#if tenantAddress}}<div class="row"><span class="k">Address</span><span class="v">{{tenantAddress}}</span></div>{{/if}}
        {{#if tenantEmail}}<div class="row"><span class="k">Email</span><span class="v">{{tenantEmail}}</span></div>{{/if}}
      </div>
    </div>
  </div>

  <h2 class="sec"><span class="badge"></span> GENERAL PROVISIONS</h2>
  <p class="cl"><span class="n"></span> <span class="lead">Entire Agreement:</span> This Agreement constitutes the entire understanding between the parties and supersedes all prior negotiations, representations, or agreements.</p>
  <p class="cl"><span class="n"></span> <span class="lead">Amendments:</span> No modification shall be valid unless made in writing and signed by both parties.</p>
  <p class="cl"><span class="n"></span> <span class="lead">Severability:</span> If any provision is deemed invalid or unenforceable, the remaining provisions shall remain in full force.</p>
  <p class="cl"><span class="n"></span> <span class="lead">Waiver:</span> Failure to enforce any provision shall not constitute a waiver of that or any other provision.</p>
  <p class="cl"><span class="n"></span> <span class="lead">Binding Effect:</span> This Agreement shall bind and benefit the parties and their respective heirs, successors, and permitted assigns.</p>

  {{#if additionalTerms}}
  <h2 class="sec"><span class="badge"></span> SPECIAL CONDITIONS</h2>
  <p class="cl"><span class="n"></span> {{additionalTerms}}</p>
  {{/if}}

  <div class="page-break"></div>
  <div class="schedule-title">SCHEDULE &mdash; Payment Schedule</div>
  <table class="sched">
    <thead><tr><th>Payment</th><th>Amount ({{rentCurrency}})</th><th>Due</th><th>Status</th></tr></thead>
    <tbody>
      {{#if securityDeposit}}<tr><td>Security Deposit</td><td>{{formatNumber securityDeposit}}</td><td>On signing</td><td>&nbsp;</td></tr>{{/if}}
      {{#if advanceMonths}}<tr><td>Advance Rent ({{advanceMonths}} month(s))</td><td>{{formatNumber advanceAmount}}</td><td>On signing</td><td>&nbsp;</td></tr>{{/if}}
      <tr><td>Monthly Rent</td><td>{{formatNumber monthlyRent}}</td><td>{{ordinal paymentDueDay}} of each month</td><td>&nbsp;</td></tr>
    </tbody>
  </table>

  <div class="exec-head">Execution</div>
  <div class="exec-rule"></div>
  <p>IN WITNESS WHEREOF, the parties hereto have executed this Agreement on the day and year first above written.</p>

  {{#if propertyManagerSignsOnBehalf}}
  <div class="sigrow">
    <div class="sigblock">
      <div class="sigline"></div>
      <div class="signame">{{propertyManagerName}}</div>
      <div class="sigrole">For and on behalf of the Landlord</div>
      <div class="sigsub">Property Manager / Authorised Agent &middot; Acting on behalf of {{landlordName}}</div>
      <div class="dateline">Date: ____________________</div>
    </div>
    <div class="sigblock">
      <div class="sigline"></div>
      <div class="signame">{{tenantName}}</div>
      <div class="sigrole">Tenant</div>
      <div class="dateline">Date: ____________________</div>
    </div>
  </div>
  {{else}}{{#if isUserLandlord}}
  <div class="sigrow">
    <div class="sigblock">
      <div class="sigline"></div>
      <div class="signame">{{landlordName}}</div>
      <div class="sigrole">Landlord</div>
      <div class="dateline">Date: ____________________</div>
    </div>
    <div class="sigblock">
      <div class="sigline"></div>
      <div class="signame">{{tenantName}}</div>
      <div class="sigrole">Tenant</div>
      <div class="dateline">Date: ____________________</div>
    </div>
  </div>
  {{else}}{{#if landlordWillSign}}
  <div class="sigrow">
    <div class="sigblock full">
      <div class="sigline"></div>
      <div class="signame">{{propertyManagerName}}</div>
      <div class="sigrole">Property Manager &middot; Managing Agent</div>
      <div class="dateline">Date: ____________________</div>
    </div>
  </div>
  <div class="sigrow">
    <div class="sigblock">
      <div class="sigline"></div>
      <div class="signame">{{landlordName}}</div>
      <div class="sigrole">Landlord / Property Owner</div>
      <div class="dateline">Date: ____________________</div>
    </div>
    <div class="sigblock">
      <div class="sigline"></div>
      <div class="signame">{{tenantName}}</div>
      <div class="sigrole">Tenant</div>
      <div class="dateline">Date: ____________________</div>
    </div>
  </div>
  {{else}}
  <div class="sigrow">
    <div class="sigblock">
      <div class="sigline"></div>
      <div class="signame">{{landlordName}}</div>
      <div class="sigrole">Landlord</div>
      <div class="dateline">Date: ____________________</div>
    </div>
    <div class="sigblock">
      <div class="sigline"></div>
      <div class="signame">{{tenantName}}</div>
      <div class="sigrole">Tenant</div>
      <div class="dateline">Date: ____________________</div>
    </div>
  </div>
  {{/if}}{{/if}}{{/if}}

  <div class="footer-note">
    Document generated on {{formatDate generatedAt "long"}} via the PROPMETRIK Property Management System.
    <div class="disc">This agreement should be reviewed by a qualified lawyer and may require registration with the Rent Control Department.</div>
  </div>

</div>
</body>
</html>
$PMTLEASE$,
    updated_at = NOW()
WHERE id = '00000000-0000-0000-0000-000000000001';
