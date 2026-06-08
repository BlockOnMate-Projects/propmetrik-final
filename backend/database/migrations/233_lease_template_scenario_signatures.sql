-- Migration 233: Guarantee every active lease template renders the landlord per signing scenario
-- Strict governance: whether the user is the landlord, signs on the landlord's behalf, or the
-- landlord will also sign, the landlord must appear as a named signatory on the agreement.
--
-- This upgrades any active lease template that still carries a STATIC "LANDLORD / TENANT"
-- signature block to the scenario-aware block (matching the Ghana Residential template).
-- It is a safe no-op for templates that are already scenario-aware (REPLACE finds no match).

UPDATE lease_templates
SET content = REPLACE(
    content,
'    <div class="signature-block">
        <div class="signature">
            <div class="signature-line">
                <strong>LANDLORD</strong><br>
                {{landlordName}}<br>
                Date: _______________
            </div>
        </div>
        <div class="signature">
            <div class="signature-line">
                <strong>TENANT</strong><br>
                {{tenantName}}<br>
                Date: _______________
            </div>
        </div>
    </div>',
'    {{#if propertyManagerSignsOnBehalf}}
    <div class="signature-block">
        <div class="signature">
            <div class="signature-line">
                <strong>FOR AND ON BEHALF OF THE LANDLORD</strong><br>
                {{propertyManagerName}}<br>
                <em>(Property Manager / Authorized Agent)</em><br>
                Acting on behalf of: {{landlordName}}<br>
                Date: _______________
            </div>
        </div>
        <div class="signature">
            <div class="signature-line">
                <strong>TENANT</strong><br>
                {{tenantName}}<br>
                Date: _______________
            </div>
        </div>
    </div>
    {{else}}{{#if isUserLandlord}}
    <div class="signature-block">
        <div class="signature">
            <div class="signature-line">
                <strong>LANDLORD</strong><br>
                {{landlordName}}<br>
                Date: _______________
            </div>
        </div>
        <div class="signature">
            <div class="signature-line">
                <strong>TENANT</strong><br>
                {{tenantName}}<br>
                Date: _______________
            </div>
        </div>
    </div>
    {{else}}{{#if landlordWillSign}}
    <div style="margin-bottom: 30px;">
        <div class="signature" style="width: 100%; margin-bottom: 30px;">
            <div class="signature-line">
                <strong>PROPERTY MANAGER</strong><br>
                {{propertyManagerName}}<br>
                <em>(Managing Agent)</em><br>
                Date: _______________
            </div>
        </div>
    </div>
    <div class="signature-block">
        <div class="signature">
            <div class="signature-line">
                <strong>LANDLORD / PROPERTY OWNER</strong><br>
                {{landlordName}}<br>
                Date: _______________
            </div>
        </div>
        <div class="signature">
            <div class="signature-line">
                <strong>TENANT</strong><br>
                {{tenantName}}<br>
                Date: _______________
            </div>
        </div>
    </div>
    {{else}}
    <div class="signature-block">
        <div class="signature">
            <div class="signature-line">
                <strong>LANDLORD</strong><br>
                {{landlordName}}<br>
                Date: _______________
            </div>
        </div>
        <div class="signature">
            <div class="signature-line">
                <strong>TENANT</strong><br>
                {{tenantName}}<br>
                Date: _______________
            </div>
        </div>
    </div>
    {{/if}}{{/if}}{{/if}}'
),
updated_at = NOW()
WHERE is_active = TRUE
  AND content LIKE '%<strong>LANDLORD</strong>%'
  AND content NOT LIKE '%propertyManagerSignsOnBehalf%';

-- Register the scenario flags as known variables on every active template that lacks them
UPDATE lease_templates
SET variables = COALESCE(variables, '[]'::jsonb) || '["isUserLandlord","landlordWillSign","propertyManagerName","propertyManagerSignsOnBehalf","signers"]'::jsonb,
    updated_at = NOW()
WHERE is_active = TRUE
  AND NOT (COALESCE(variables, '[]'::jsonb) @> '["propertyManagerSignsOnBehalf"]'::jsonb);
