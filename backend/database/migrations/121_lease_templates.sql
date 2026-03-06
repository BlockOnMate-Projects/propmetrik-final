-- Migration: 121_lease_templates.sql
-- Description: Lease template management tables
-- Phase 2: Production Hardening - Lease Template Engine

-- ============================================
-- LEASE TEMPLATES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS lease_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    content TEXT NOT NULL, -- Handlebars/HTML template content
    variables JSONB DEFAULT '[]', -- Extracted variable names
    category VARCHAR(50) NOT NULL DEFAULT 'residential',
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    version INTEGER DEFAULT 1,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_category CHECK (category IN ('residential', 'commercial', 'short_term', 'custom'))
);

-- Index for querying by organization
CREATE INDEX IF NOT EXISTS idx_lease_templates_org ON lease_templates(organization_id);

-- Index for default template lookup
CREATE INDEX IF NOT EXISTS idx_lease_templates_default ON lease_templates(organization_id, category, is_default) WHERE is_active = TRUE;

-- ============================================
-- GENERATED LEASE DOCUMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS lease_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenancy_id UUID NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
    template_id UUID REFERENCES lease_templates(id),
    document_key VARCHAR(512) NOT NULL, -- S3/MinIO key
    filename VARCHAR(255) NOT NULL,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    signed_at TIMESTAMP WITH TIME ZONE,
    esign_envelope_id VARCHAR(255), -- Reference to e-sign envelope
    status VARCHAR(50) DEFAULT 'draft',
    organization_id UUID NOT NULL REFERENCES organizations(id),
    metadata JSONB DEFAULT '{}',
    
    CONSTRAINT valid_status CHECK (status IN ('draft', 'sent_for_signature', 'partially_signed', 'signed', 'expired', 'voided'))
);

-- Index for looking up documents by tenancy
CREATE INDEX IF NOT EXISTS idx_lease_documents_tenancy ON lease_documents(tenancy_id);

-- Index for organization queries
CREATE INDEX IF NOT EXISTS idx_lease_documents_org ON lease_documents(organization_id);

-- ============================================
-- DEFAULT LEASE TEMPLATE (Ghana Residential)
-- ============================================
INSERT INTO lease_templates (id, organization_id, name, description, content, category, is_default, created_at)
SELECT 
    '00000000-0000-0000-0000-000000000001'::UUID,
    id,
    'Standard Residential Lease (Ghana)',
    'Default residential lease agreement template for Ghana properties',
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
        <p>Unless otherwise agreed in writing, the Tenant shall be responsible for payment of all utilities including electricity, water, and other services.</p>
    </div>
    
    <div class="section">
        <h2>7. TERMINATION</h2>
        <p>Either party may terminate this agreement by providing written notice as required by Ghanaian law. Early termination may result in forfeiture of the security deposit.</p>
    </div>
    
    <div class="section">
        <h2>8. GOVERNING LAW</h2>
        <p>This agreement shall be governed by and construed in accordance with the laws of the Republic of Ghana.</p>
    </div>
    
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
    'residential',
    TRUE,
    NOW()
FROM organizations
WHERE id = (SELECT id FROM organizations LIMIT 1)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE lease_templates IS 'Customizable lease agreement templates with Handlebars variable substitution';
COMMENT ON TABLE lease_documents IS 'Generated lease documents from templates, tracks signing status';
COMMENT ON COLUMN lease_templates.content IS 'HTML/Handlebars template content with variable placeholders';
COMMENT ON COLUMN lease_templates.variables IS 'Auto-extracted list of template variable names';
