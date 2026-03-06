-- Migration: 130_global_lease_templates.sql
-- Description: Create global lease templates available to ALL organizations
-- Global templates have organization_id = NULL

-- ============================================
-- MAKE ORGANIZATION_ID NULLABLE
-- ============================================
ALTER TABLE lease_templates ALTER COLUMN organization_id DROP NOT NULL;

-- ============================================
-- DELETE EXISTING PER-ORG TEMPLATES
-- (They were duplicates anyway)
-- ============================================
DELETE FROM lease_templates WHERE organization_id IS NOT NULL;

-- ============================================
-- INSERT GLOBAL DEFAULT TEMPLATE
-- ============================================
INSERT INTO lease_templates (
    id, 
    organization_id, 
    name, 
    description, 
    content, 
    variables, 
    category, 
    is_default, 
    is_active, 
    version, 
    created_at, 
    updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    NULL,  -- NULL means available to ALL organizations
    'Standard Residential Lease (Ghana)',
    'Default residential lease agreement template for Ghana properties. Available to all organizations.',
    '<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Georgia, serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { text-align: center; margin-bottom: 30px; }
        h2 { border-bottom: 1px solid #333; padding-bottom: 5px; }
        .parties { margin-bottom: 30px; }
        .section { margin-bottom: 25px; }
        .signature-block { margin-top: 50px; display: flex; justify-content: space-between; }
        .signature { width: 45%; }
        .signature-line { border-top: 1px solid #000; margin-top: 50px; padding-top: 5px; }
    </style>
</head>
<body>
    <h1>RESIDENTIAL LEASE AGREEMENT</h1>
    
    <p style="text-align: center;">Made this {{formatDate today}} in Accra, Ghana</p>
    
    <div class="parties">
        <h2>BETWEEN</h2>
        <p><strong>LANDLORD:</strong> {{landlordName}}<br>
        Address: {{landlordAddress}}<br>
        Phone: {{landlordPhone}}<br>
        Email: {{landlordEmail}}</p>
        
        <p style="text-align: center;">(hereinafter referred to as the "Landlord")</p>
        
        <p style="text-align: center;"><strong>AND</strong></p>
        
        <p><strong>TENANT:</strong> {{tenantName}}<br>
        ID Type: {{tenantIdType}}<br>
        ID Number: {{tenantIdNumber}}<br>
        Phone: {{tenantPhone}}<br>
        Email: {{tenantEmail}}</p>
        
        <p style="text-align: center;">(hereinafter referred to as the "Tenant")</p>
    </div>
    
    <div class="section">
        <h2>1. PREMISES</h2>
        <p>The Landlord hereby agrees to rent to the Tenant, and the Tenant agrees to rent from the Landlord, the premises located at:</p>
        <p><strong>{{propertyAddress}}</strong>
        {{#if unitNumber}}<br>Unit: {{unitNumber}}{{/if}}
        {{#if bedrooms}}<br>Bedrooms: {{bedrooms}}{{/if}}
        {{#if bathrooms}}<br>Bathrooms: {{bathrooms}}{{/if}}</p>
    </div>
    
    <div class="section">
        <h2>2. TERM</h2>
        <p>This lease shall commence on <strong>{{formatDate leaseStartDate}}</strong> and terminate on <strong>{{formatDate leaseEndDate}}</strong>, a period of <strong>{{leaseTerm}}</strong>.</p>
    </div>
    
    <div class="section">
        <h2>3. RENT</h2>
        <p>The Tenant agrees to pay rent of <strong>{{currency monthlyRent rentCurrency}}</strong> per month.</p>
        <p>Rent is due on the <strong>{{ordinal paymentDueDay}}</strong> day of each month.</p>
        {{#if securityDeposit}}
        <p>A security deposit of <strong>{{currency securityDeposit rentCurrency}}</strong> has been collected and will be refunded at the end of the tenancy, subject to the terms of this agreement.</p>
        {{/if}}
        {{#if advanceMonths}}
        <p>The Tenant shall pay <strong>{{advanceMonths}} month(s)</strong> advance rent totaling <strong>{{currency advanceAmount rentCurrency}}</strong>.</p>
        {{/if}}
    </div>
    
    <div class="section">
        <h2>4. USE OF PREMISES</h2>
        <p>The premises shall be used exclusively for residential purposes only. The Tenant shall not use the premises for any unlawful purpose.</p>
    </div>
    
    <div class="section">
        <h2>5. MAINTENANCE</h2>
        <p>The Tenant shall maintain the premises in good condition and promptly notify the Landlord of any necessary repairs. The Landlord shall be responsible for major structural repairs.</p>
    </div>
    
    <div class="section">
        <h2>6. UTILITIES</h2>
        {{#if tenantUtilities}}
        <p><strong>Tenant shall pay for:</strong> {{#each tenantUtilities}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}</p>
        {{else}}
        <p>The Tenant shall be responsible for payment of all utilities including electricity, water, and other services.</p>
        {{/if}}
        {{#if landlordUtilities}}
        <p><strong>Landlord shall pay for:</strong> {{#each landlordUtilities}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}</p>
        {{/if}}
    </div>
    
    <div class="section">
        <h2>7. TERMINATION</h2>
        <p>Either party may terminate this agreement by providing {{noticePeriodDays}} days written notice as required by Ghanaian law. Early termination may result in forfeiture of the security deposit.</p>
    </div>
    
    <div class="section">
        <h2>8. GOVERNING LAW</h2>
        <p>This agreement shall be governed by and construed in accordance with the laws of the Republic of Ghana, including the Rent Act, 1963 (Act 220) and Rent Control Law, 1986 (PNDCL 138).</p>
    </div>

    {{#if additionalTerms}}
    <div class="section">
        <h2>9. ADDITIONAL TERMS</h2>
        <p>{{additionalTerms}}</p>
    </div>
    {{/if}}
    
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
    
    <p style="margin-top: 50px; text-align: center; font-size: 0.9em; color: #666;">
        Document generated on {{formatDate generatedAt "short"}} via PropMetrik
    </p>
</body>
</html>',
    '["today", "landlordName", "landlordAddress", "landlordPhone", "landlordEmail", "tenantName", "tenantIdType", "tenantIdNumber", "tenantPhone", "tenantEmail", "propertyAddress", "unitNumber", "bedrooms", "bathrooms", "leaseStartDate", "leaseEndDate", "leaseTerm", "monthlyRent", "rentCurrency", "securityDeposit", "paymentDueDay", "advanceMonths", "advanceAmount", "tenantUtilities", "landlordUtilities", "noticePeriodDays", "additionalTerms", "generatedAt"]'::jsonb,
    'residential',
    TRUE,
    TRUE,
    1,
    NOW(),
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    organization_id = NULL,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    content = EXCLUDED.content,
    variables = EXCLUDED.variables,
    is_default = TRUE,
    is_active = TRUE,
    updated_at = NOW();

-- ============================================
-- CREATE INDEX FOR GLOBAL TEMPLATES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_lease_templates_global 
ON lease_templates(category, is_default) 
WHERE organization_id IS NULL AND is_active = TRUE;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE lease_templates IS 'Lease templates - global templates (org_id IS NULL) available to all organizations, org-specific templates override globals';
