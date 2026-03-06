-- =====================================================
-- Phase 5.10: E-Sign & Document Integration
-- Document Templates, Checklists, and CRM Integration
-- =====================================================

-- =====================================================
-- SECTION 1: CRM DOCUMENT TEMPLATES
-- Ghana-specific legal document templates with merge fields
-- =====================================================

-- Document category enum
DO $$ BEGIN
    CREATE TYPE document_template_category AS ENUM (
        'offer_letter',
        'mou',
        'reservation_agreement',
        'sales_agreement_freehold',
        'sales_agreement_leasehold',
        'deed_of_assignment',
        'power_of_attorney',
        'indenture',
        'lease_agreement',
        'tenancy_agreement',
        'receipt',
        'letter_of_intent',
        'commission_agreement',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Document template status
DO $$ BEGIN
    CREATE TYPE document_template_status AS ENUM (
        'draft',
        'active',
        'archived'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS crm_document_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Template identification
    name VARCHAR(255) NOT NULL,
    category document_template_category NOT NULL,
    description TEXT,
    
    -- Template content
    template_html TEXT, -- HTML template with merge fields {{deal.title}}, {{contact.name}}, etc.
    template_pdf_url VARCHAR(1024), -- Pre-made PDF template URL
    
    -- Merge field definitions
    merge_fields JSONB NOT NULL DEFAULT '[]', -- Array of field definitions
    
    -- E-sign configuration
    signature_fields JSONB DEFAULT '[]', -- Signature field positions [{role, page, x, y, width, height}]
    signer_roles JSONB DEFAULT '[]', -- Role definitions [{name, order, required}]
    
    -- Metadata
    is_system_template BOOLEAN DEFAULT FALSE,
    is_shared BOOLEAN DEFAULT FALSE,
    status document_template_status DEFAULT 'active',
    version INTEGER DEFAULT 1,
    
    -- Usage tracking
    use_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP WITH TIME ZONE,
    
    -- Ghana-specific
    ghana_legal_requirements TEXT,
    requires_stamp_duty BOOLEAN DEFAULT FALSE,
    requires_notarization BOOLEAN DEFAULT FALSE,
    
    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_crm_doc_templates_org ON crm_document_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_doc_templates_category ON crm_document_templates(category);
CREATE INDEX IF NOT EXISTS idx_crm_doc_templates_status ON crm_document_templates(status);

-- =====================================================
-- SECTION 2: STAGE DOCUMENT REQUIREMENTS
-- Documents required at each pipeline stage
-- =====================================================

CREATE TABLE IF NOT EXISTS crm_stage_document_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    pipeline_id UUID REFERENCES deal_pipelines(id) ON DELETE CASCADE,
    stage_id UUID REFERENCES deal_stages(id) ON DELETE CASCADE,
    
    -- Document requirement
    template_id UUID REFERENCES crm_document_templates(id) ON DELETE SET NULL,
    document_type VARCHAR(100), -- If not using template
    document_name VARCHAR(255) NOT NULL,
    
    -- Requirement settings
    is_required BOOLEAN DEFAULT TRUE,
    is_blocking BOOLEAN DEFAULT FALSE, -- Blocks stage advancement if not completed
    order_index INTEGER DEFAULT 0,
    
    -- Instructions
    instructions TEXT,
    
    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stage_doc_reqs_stage ON crm_stage_document_requirements(stage_id);
CREATE INDEX IF NOT EXISTS idx_stage_doc_reqs_pipeline ON crm_stage_document_requirements(pipeline_id);

-- =====================================================
-- SECTION 3: DEAL DOCUMENT CHECKLIST
-- Track document completion per deal
-- =====================================================

DO $$ BEGIN
    CREATE TYPE deal_document_status AS ENUM (
        'pending',
        'in_progress',
        'completed',
        'waived'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS crm_deal_document_checklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    requirement_id UUID REFERENCES crm_stage_document_requirements(id) ON DELETE SET NULL,
    
    -- Document reference
    template_id UUID REFERENCES crm_document_templates(id) ON DELETE SET NULL,
    generated_document_id UUID, -- Will reference crm_generated_documents after it's created
    
    -- Checklist item info
    document_name VARCHAR(255) NOT NULL,
    document_type VARCHAR(100),
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending',
    is_required BOOLEAN DEFAULT TRUE,
    is_blocking BOOLEAN DEFAULT FALSE,
    order_index INTEGER DEFAULT 0,
    
    -- Dates
    due_date DATE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Notes
    notes TEXT,
    
    -- Audit
    completed_by UUID REFERENCES users(id),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_doc_checklist_deal ON crm_deal_document_checklist(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_doc_checklist_status ON crm_deal_document_checklist(status);
CREATE INDEX IF NOT EXISTS idx_deal_doc_checklist_req ON crm_deal_document_checklist(requirement_id);

-- =====================================================
-- SECTION 4: GENERATED DOCUMENTS
-- Track documents generated from templates
-- =====================================================

CREATE TABLE IF NOT EXISTS crm_generated_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Source template
    template_id UUID NOT NULL REFERENCES crm_document_templates(id) ON DELETE RESTRICT,
    template_version INTEGER DEFAULT 1,
    
    -- Generated document
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    document_name VARCHAR(255),
    file_url VARCHAR(1024) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER,
    mime_type VARCHAR(100) DEFAULT 'application/pdf',
    
    -- Entity association
    deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    property_id UUID,
    property_region VARCHAR(50),  -- For partitioned properties FK
    
    -- Merge data used
    merge_data JSONB NOT NULL DEFAULT '{}',
    
    -- Status
    status VARCHAR(50) DEFAULT 'draft', -- draft, final, signed, expired, voided
    
    -- E-sign tracking
    esign_envelope_id UUID,
    signing_url VARCHAR(1024),
    esign_status VARCHAR(50),
    sent_for_signature_at TIMESTAMP WITH TIME ZONE,
    signed_at TIMESTAMP WITH TIME ZONE,
    signed_by JSONB DEFAULT '[]',
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Document hash for integrity
    document_hash VARCHAR(128),
    
    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generated_docs_template ON crm_generated_documents(template_id);
CREATE INDEX IF NOT EXISTS idx_generated_docs_deal ON crm_generated_documents(deal_id);
CREATE INDEX IF NOT EXISTS idx_generated_docs_contact ON crm_generated_documents(contact_id);
CREATE INDEX IF NOT EXISTS idx_generated_docs_envelope ON crm_generated_documents(esign_envelope_id);

-- =====================================================
-- SECTION 5: MERGE FIELD REGISTRY
-- Standard merge fields available in templates
-- =====================================================

CREATE TABLE IF NOT EXISTS crm_merge_field_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Field identification
    field_key VARCHAR(100) NOT NULL UNIQUE, -- e.g., 'deal.title', 'contact.full_name'
    field_label VARCHAR(255) NOT NULL,
    field_category VARCHAR(50) NOT NULL, -- 'deal', 'contact', 'property', 'agent', 'organization', 'unit', 'project'
    
    -- Field metadata
    description TEXT,
    data_type VARCHAR(50) DEFAULT 'text', -- text, number, date, currency, address
    format_pattern VARCHAR(255), -- Optional formatting pattern
    
    -- Source mapping
    source_table VARCHAR(100),
    source_column VARCHAR(100),
    
    -- System vs custom
    is_system BOOLEAN DEFAULT TRUE,
    organization_id UUID REFERENCES organizations(id), -- NULL for system fields
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merge_fields_category ON crm_merge_field_registry(field_category);

-- =====================================================
-- SECTION 6: SEED GHANA-SPECIFIC DOCUMENT TEMPLATES
-- =====================================================

-- First, insert system merge fields
INSERT INTO crm_merge_field_registry (field_key, field_label, field_category, description, data_type, source_table, source_column) VALUES
-- Organization fields
('organization.name', 'Organization Name', 'organization', 'Company/organization name', 'text', 'organizations', 'name'),
('organization.address', 'Organization Address', 'organization', 'Company registered address', 'text', 'organizations', 'address'),
('organization.phone', 'Organization Phone', 'organization', 'Company phone number', 'text', 'organizations', 'phone'),
('organization.email', 'Organization Email', 'organization', 'Company email address', 'text', 'organizations', 'email'),

-- Deal fields
('deal.title', 'Deal Title', 'deal', 'Name of the deal', 'text', 'deals', 'title'),
('deal.value', 'Deal Value', 'deal', 'Deal monetary value', 'currency', 'deals', 'value'),
('deal.stage', 'Deal Stage', 'deal', 'Current pipeline stage', 'text', 'crm_deal_stages', 'name'),
('deal.expected_close_date', 'Expected Close Date', 'deal', 'Expected closing date', 'date', 'deals', 'expected_close_date'),
('deal.deal_type', 'Deal Type', 'deal', 'Sale or rental', 'text', 'deals', 'deal_type'),
('deal.property_type', 'Property Type', 'deal', 'Type of property', 'text', 'deals', 'property_type'),
('deal.created_date', 'Deal Created Date', 'deal', 'When deal was created', 'date', 'deals', 'created_at'),

-- Contact fields (Buyer/Tenant)
('contact.full_name', 'Contact Full Name', 'contact', 'Full name of contact', 'text', 'crm_contacts', 'first_name || last_name'),
('contact.first_name', 'Contact First Name', 'contact', 'First name', 'text', 'crm_contacts', 'first_name'),
('contact.last_name', 'Contact Last Name', 'contact', 'Last name', 'text', 'crm_contacts', 'last_name'),
('contact.email', 'Contact Email', 'contact', 'Email address', 'text', 'crm_contacts', 'email'),
('contact.phone', 'Contact Phone', 'contact', 'Phone number', 'text', 'crm_contacts', 'phone'),
('contact.address', 'Contact Address', 'contact', 'Mailing address', 'text', 'crm_contacts', 'address'),
('contact.ghana_card_number', 'Ghana Card Number', 'contact', 'National ID number', 'text', 'crm_contacts', 'ghana_card_number'),
('contact.tin_number', 'TIN Number', 'contact', 'Tax identification number', 'text', 'crm_contacts', 'tin_number'),
('contact.occupation', 'Occupation', 'contact', 'Contact occupation/profession', 'text', 'crm_contacts', 'occupation'),

-- Property fields
('property.title', 'Property Title', 'property', 'Property name/title', 'text', 'crm_properties', 'title'),
('property.address', 'Property Address', 'property', 'Full property address', 'text', 'crm_properties', 'address'),
('property.city', 'Property City', 'property', 'City/town', 'text', 'crm_properties', 'city'),
('property.region', 'Property Region', 'property', 'Region', 'text', 'crm_properties', 'region'),
('property.ghana_post_gps', 'Ghana Post GPS', 'property', 'Digital address', 'text', 'crm_properties', 'ghana_post_gps'),
('property.property_type', 'Property Type', 'property', 'Type of property', 'text', 'crm_properties', 'property_type'),
('property.bedrooms', 'Bedrooms', 'property', 'Number of bedrooms', 'number', 'crm_properties', 'bedrooms'),
('property.bathrooms', 'Bathrooms', 'property', 'Number of bathrooms', 'number', 'crm_properties', 'bathrooms'),
('property.size_sqm', 'Size (sqm)', 'property', 'Property size in square meters', 'number', 'crm_properties', 'size_sqm'),
('property.plot_size_sqm', 'Plot Size (sqm)', 'property', 'Land/plot size', 'number', 'crm_properties', 'plot_size_sqm'),
('property.land_title', 'Land Title Type', 'property', 'Type of land title (freehold/leasehold)', 'text', 'crm_properties', 'land_title'),
('property.price', 'Property Price', 'property', 'Asking/sale price', 'currency', 'crm_properties', 'price'),

-- Agent fields
('agent.full_name', 'Agent Full Name', 'agent', 'Sales agent name', 'text', 'crm_agents', 'first_name || last_name'),
('agent.email', 'Agent Email', 'agent', 'Agent email', 'text', 'crm_agents', 'email'),
('agent.phone', 'Agent Phone', 'agent', 'Agent phone', 'text', 'crm_agents', 'phone'),
('agent.license_number', 'Agent License', 'agent', 'Real estate license number', 'text', 'crm_agents', 'license_number'),

-- Date/Time fields
('current.date', 'Current Date', 'system', 'Today''s date', 'date', NULL, NULL),
('current.date_long', 'Current Date (Long)', 'system', 'Today''s date in long format', 'date', NULL, NULL),
('current.year', 'Current Year', 'system', 'Current year', 'text', NULL, NULL),

-- Unit fields (for development projects)
('unit.number', 'Unit Number', 'unit', 'Unit/apartment number', 'text', 'project_units', 'unit_number'),
('unit.floor', 'Floor', 'unit', 'Floor number', 'number', 'project_units', 'floor_number'),
('unit.bedrooms', 'Unit Bedrooms', 'unit', 'Number of bedrooms', 'number', 'project_units', 'bedrooms'),
('unit.size_sqm', 'Unit Size (sqm)', 'unit', 'Unit size', 'number', 'project_units', 'internal_area_sqm'),
('unit.price', 'Unit Price', 'unit', 'Unit sale price', 'currency', 'project_units', 'base_price'),

-- Project fields
('project.name', 'Project Name', 'project', 'Development project name', 'text', 'development_projects', 'name'),
('project.address', 'Project Address', 'project', 'Project location', 'text', 'development_projects', 'address_line1'),
('project.developer', 'Developer Name', 'project', 'Developer company name', 'text', 'development_projects', 'developer_name'),
('project.expected_completion', 'Expected Completion', 'project', 'Project completion date', 'date', 'development_projects', 'planned_end_date')

ON CONFLICT (field_key) DO NOTHING;

-- =====================================================
-- SECTION 7: SEED GHANA DOCUMENT TEMPLATES
-- =====================================================

-- Note: These will be seeded with a specific organization_id in the service
-- For now, create a function to seed templates for an organization

CREATE OR REPLACE FUNCTION seed_ghana_document_templates(p_organization_id UUID, p_created_by UUID)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    -- Offer Letter Template
    INSERT INTO crm_document_templates (
        organization_id, name, category, description, template_html, merge_fields,
        signature_fields, signer_roles, is_system_template, ghana_legal_requirements, created_by
    ) VALUES (
        p_organization_id,
        'Standard Offer Letter',
        'offer_letter',
        'Formal offer letter for property purchase in Ghana',
        E'<html><head><style>body{font-family:Arial,sans-serif;line-height:1.6;margin:40px;}h1{color:#1a365d;}.header{text-align:center;margin-bottom:30px;}.content{margin:20px 0;}.signature-block{margin-top:50px;}.party-signature{display:inline-block;width:45%;margin:20px 0;}</style></head><body>
<div class="header">
<h1>{{organization.name}}</h1>
<p>{{organization.address}}</p>
<p>Tel: {{organization.phone}} | Email: {{organization.email}}</p>
</div>
<p style="text-align:right;">Date: {{current.date_long}}</p>
<p><strong>To:</strong><br>{{contact.full_name}}<br>{{contact.address}}</p>
<h2>OFFER TO PURCHASE PROPERTY</h2>
<p>Dear {{contact.first_name}},</p>
<p>Further to our discussions, we are pleased to present this formal offer for the purchase of the property described below:</p>
<h3>Property Details</h3>
<table style="width:100%;border-collapse:collapse;margin:20px 0;">
<tr><td style="padding:8px;border:1px solid #ddd;width:200px;"><strong>Property Address:</strong></td><td style="padding:8px;border:1px solid #ddd;">{{property.address}}, {{property.city}}, {{property.region}}</td></tr>
<tr><td style="padding:8px;border:1px solid #ddd;"><strong>Ghana Post GPS:</strong></td><td style="padding:8px;border:1px solid #ddd;">{{property.ghana_post_gps}}</td></tr>
<tr><td style="padding:8px;border:1px solid #ddd;"><strong>Property Type:</strong></td><td style="padding:8px;border:1px solid #ddd;">{{property.property_type}}</td></tr>
<tr><td style="padding:8px;border:1px solid #ddd;"><strong>Land Title:</strong></td><td style="padding:8px;border:1px solid #ddd;">{{property.land_title}}</td></tr>
<tr><td style="padding:8px;border:1px solid #ddd;"><strong>Size:</strong></td><td style="padding:8px;border:1px solid #ddd;">{{property.size_sqm}} sqm (Plot: {{property.plot_size_sqm}} sqm)</td></tr>
</table>
<h3>Offer Terms</h3>
<table style="width:100%;border-collapse:collapse;margin:20px 0;">
<tr><td style="padding:8px;border:1px solid #ddd;width:200px;"><strong>Offer Price:</strong></td><td style="padding:8px;border:1px solid #ddd;">{{deal.value}}</td></tr>
<tr><td style="padding:8px;border:1px solid #ddd;"><strong>Offer Valid Until:</strong></td><td style="padding:8px;border:1px solid #ddd;">{{deal.expected_close_date}}</td></tr>
</table>
<h3>Conditions</h3>
<ol>
<li>This offer is subject to satisfactory due diligence on the property title.</li>
<li>A deposit of 10% of the purchase price shall be paid upon acceptance of this offer.</li>
<li>The balance shall be paid on or before the completion date.</li>
<li>The sale is subject to the property being free from encumbrances.</li>
</ol>
<p>Please sign below to indicate your acceptance of this offer.</p>
<div class="signature-block">
<div class="party-signature">
<p>____________________________</p>
<p>{{contact.full_name}}<br>Buyer</p>
<p>Date: ___________________</p>
</div>
<div class="party-signature">
<p>____________________________</p>
<p>{{agent.full_name}}<br>Agent for {{organization.name}}</p>
<p>Date: ___________________</p>
</div>
</div>
</body></html>',
        '[{"key":"organization.name","required":true},{"key":"organization.address","required":true},{"key":"contact.full_name","required":true},{"key":"contact.address","required":true},{"key":"property.address","required":true},{"key":"property.ghana_post_gps","required":false},{"key":"property.property_type","required":true},{"key":"property.land_title","required":true},{"key":"property.size_sqm","required":true},{"key":"property.plot_size_sqm","required":false},{"key":"deal.value","required":true},{"key":"deal.expected_close_date","required":true},{"key":"agent.full_name","required":true},{"key":"current.date_long","required":true}]'::jsonb,
        '[{"role":"buyer","page":1,"x":15,"y":20,"width":150,"height":50,"required":true},{"role":"agent","page":1,"x":55,"y":20,"width":150,"height":50,"required":true}]'::jsonb,
        '[{"name":"buyer","order":1,"required":true},{"name":"agent","order":2,"required":true}]'::jsonb,
        true,
        'Should be on company letterhead. Keep copy for records.',
        p_created_by
    );
    v_count := v_count + 1;

    -- MOU Template
    INSERT INTO crm_document_templates (
        organization_id, name, category, description, template_html, merge_fields,
        signature_fields, signer_roles, is_system_template, ghana_legal_requirements, 
        requires_stamp_duty, created_by
    ) VALUES (
        p_organization_id,
        'Memorandum of Understanding (MOU)',
        'mou',
        'Pre-contract agreement between buyer and seller for property transaction in Ghana',
        E'<html><head><style>body{font-family:Georgia,serif;line-height:1.8;margin:50px;font-size:14px;}h1{text-align:center;color:#1a365d;text-transform:uppercase;letter-spacing:2px;}h2{color:#2c5282;border-bottom:2px solid #2c5282;padding-bottom:5px;}.article{margin:25px 0;}.signature-section{margin-top:60px;page-break-inside:avoid;}.witness-section{margin-top:40px;}</style></head><body>
<h1>Memorandum of Understanding</h1>
<p style="text-align:center;font-style:italic;">For the Sale and Purchase of Real Property</p>
<p style="text-align:right;">Date: {{current.date_long}}</p>
<div class="article">
<h2>PARTIES</h2>
<p>This Memorandum of Understanding ("MOU") is entered into between:</p>
<p><strong>THE VENDOR:</strong><br>
{{organization.name}}<br>
of {{organization.address}}<br>
(hereinafter referred to as "the Vendor")</p>
<p style="text-align:center;"><strong>AND</strong></p>
<p><strong>THE PURCHASER:</strong><br>
{{contact.full_name}}<br>
of {{contact.address}}<br>
Ghana Card No: {{contact.ghana_card_number}}<br>
(hereinafter referred to as "the Purchaser")</p>
</div>
<div class="article">
<h2>PROPERTY DESCRIPTION</h2>
<p>The subject property is described as follows:</p>
<ul>
<li><strong>Property Address:</strong> {{property.address}}, {{property.city}}, {{property.region}}</li>
<li><strong>Digital Address:</strong> {{property.ghana_post_gps}}</li>
<li><strong>Property Type:</strong> {{property.property_type}}</li>
<li><strong>Land Title:</strong> {{property.land_title}}</li>
<li><strong>Land Size:</strong> {{property.plot_size_sqm}} square meters</li>
<li><strong>Building Size:</strong> {{property.size_sqm}} square meters</li>
</ul>
</div>
<div class="article">
<h2>PURCHASE PRICE AND TERMS</h2>
<p>The Purchaser agrees to purchase the Property for the total sum of <strong>{{deal.value}}</strong> (hereinafter referred to as "the Purchase Price").</p>
<p>Payment shall be made as follows:</p>
<ol>
<li>Initial Deposit: 10% of the Purchase Price upon signing of this MOU</li>
<li>Balance: 90% of the Purchase Price upon completion of due diligence and execution of the Sale Agreement</li>
</ol>
</div>
<div class="article">
<h2>CONDITIONS</h2>
<ol>
<li>This MOU is subject to satisfactory verification of the Vendor''s title to the Property.</li>
<li>The Vendor warrants that the Property is free from any encumbrances, liens, or third-party claims.</li>
<li>The Purchaser shall conduct due diligence within 30 days from the date of this MOU.</li>
<li>Upon satisfactory completion of due diligence, the parties shall execute a formal Sale Agreement.</li>
<li>Should either party fail to complete the transaction as agreed, the defaulting party shall be liable for damages.</li>
</ol>
</div>
<div class="article">
<h2>GOVERNING LAW</h2>
<p>This MOU shall be governed by and construed in accordance with the laws of the Republic of Ghana.</p>
</div>
<div class="signature-section">
<h2>SIGNATURES</h2>
<p>IN WITNESS WHEREOF, the parties have executed this Memorandum of Understanding as of the date first written above.</p>
<table style="width:100%;margin-top:30px;">
<tr>
<td style="width:50%;vertical-align:top;">
<p>____________________________</p>
<p><strong>For the Vendor:</strong></p>
<p>Name: {{agent.full_name}}</p>
<p>Title: Authorized Representative</p>
<p>Date: ___________________</p>
</td>
<td style="width:50%;vertical-align:top;">
<p>____________________________</p>
<p><strong>The Purchaser:</strong></p>
<p>Name: {{contact.full_name}}</p>
<p>Date: ___________________</p>
</td>
</tr>
</table>
</div>
<div class="witness-section">
<h2>WITNESSES</h2>
<table style="width:100%;margin-top:20px;">
<tr>
<td style="width:50%;vertical-align:top;">
<p>____________________________</p>
<p>Witness 1 (Vendor''s side)</p>
<p>Name: ___________________</p>
<p>Address: ___________________</p>
</td>
<td style="width:50%;vertical-align:top;">
<p>____________________________</p>
<p>Witness 2 (Purchaser''s side)</p>
<p>Name: ___________________</p>
<p>Address: ___________________</p>
</td>
</tr>
</table>
</div>
</body></html>',
        '[{"key":"organization.name","required":true},{"key":"organization.address","required":true},{"key":"contact.full_name","required":true},{"key":"contact.address","required":true},{"key":"contact.ghana_card_number","required":true},{"key":"property.address","required":true},{"key":"property.city","required":true},{"key":"property.region","required":true},{"key":"property.ghana_post_gps","required":false},{"key":"property.property_type","required":true},{"key":"property.land_title","required":true},{"key":"property.plot_size_sqm","required":true},{"key":"property.size_sqm","required":true},{"key":"deal.value","required":true},{"key":"agent.full_name","required":true},{"key":"current.date_long","required":true}]'::jsonb,
        '[{"role":"vendor","page":1,"x":10,"y":15,"width":150,"height":50,"required":true},{"role":"purchaser","page":1,"x":55,"y":15,"width":150,"height":50,"required":true}]'::jsonb,
        '[{"name":"vendor","order":1,"required":true},{"name":"purchaser","order":2,"required":true}]'::jsonb,
        true,
        'MOU should be witnessed by at least one person from each party. Recommended to have MOU stamped at Lands Commission.',
        true,
        p_created_by
    );
    v_count := v_count + 1;

    -- Reservation Agreement Template
    INSERT INTO crm_document_templates (
        organization_id, name, category, description, template_html, merge_fields,
        signature_fields, signer_roles, is_system_template, ghana_legal_requirements, created_by
    ) VALUES (
        p_organization_id,
        'Reservation Agreement',
        'reservation_agreement',
        'Agreement to reserve a property or unit pending full payment or sale agreement',
        E'<html><head><style>body{font-family:Arial,sans-serif;line-height:1.6;margin:40px;}h1{text-align:center;color:#1a365d;}h2{color:#2c5282;}.important{background:#fef3c7;padding:10px;border-left:4px solid #f59e0b;margin:20px 0;}</style></head><body>
<h1>RESERVATION AGREEMENT</h1>
<p style="text-align:center;">{{organization.name}}</p>
<p style="text-align:right;">Date: {{current.date_long}}</p>
<p style="text-align:right;">Reference: {{deal.title}}</p>
<h2>1. PARTIES</h2>
<p><strong>Developer/Seller:</strong> {{organization.name}} of {{organization.address}}</p>
<p><strong>Buyer:</strong> {{contact.full_name}} of {{contact.address}}</p>
<p>Phone: {{contact.phone}} | Email: {{contact.email}}</p>
<h2>2. PROPERTY/UNIT DETAILS</h2>
<table style="width:100%;border-collapse:collapse;margin:15px 0;">
<tr><td style="padding:8px;border:1px solid #ddd;background:#f3f4f6;width:200px;">Project/Property</td><td style="padding:8px;border:1px solid #ddd;">{{property.title}}</td></tr>
<tr><td style="padding:8px;border:1px solid #ddd;background:#f3f4f6;">Location</td><td style="padding:8px;border:1px solid #ddd;">{{property.address}}, {{property.city}}</td></tr>
<tr><td style="padding:8px;border:1px solid #ddd;background:#f3f4f6;">Unit/Plot Number</td><td style="padding:8px;border:1px solid #ddd;">{{unit.number}}</td></tr>
<tr><td style="padding:8px;border:1px solid #ddd;background:#f3f4f6;">Bedrooms</td><td style="padding:8px;border:1px solid #ddd;">{{unit.bedrooms}}</td></tr>
<tr><td style="padding:8px;border:1px solid #ddd;background:#f3f4f6;">Size</td><td style="padding:8px;border:1px solid #ddd;">{{unit.size_sqm}} sqm</td></tr>
<tr><td style="padding:8px;border:1px solid #ddd;background:#f3f4f6;">Floor</td><td style="padding:8px;border:1px solid #ddd;">{{unit.floor}}</td></tr>
</table>
<h2>3. PURCHASE PRICE</h2>
<p><strong>Total Purchase Price:</strong> {{deal.value}}</p>
<h2>4. RESERVATION DEPOSIT</h2>
<p>The Buyer agrees to pay a non-refundable reservation deposit of <strong>10% of the Purchase Price</strong> to reserve the above property/unit.</p>
<div class="important">
<strong>IMPORTANT:</strong> This reservation deposit is non-refundable and will be forfeited if the Buyer fails to proceed with the purchase within the specified period.
</div>
<h2>5. RESERVATION PERIOD</h2>
<p>This reservation shall be valid for <strong>30 days</strong> from the date of this agreement. Within this period, the Buyer must execute a formal Sale Agreement and pay the required deposit as per the payment schedule.</p>
<h2>6. TERMS AND CONDITIONS</h2>
<ol>
<li>The reservation deposit shall be applied toward the purchase price upon execution of the Sale Agreement.</li>
<li>If the Buyer fails to execute the Sale Agreement within the reservation period, the Seller may release the property and retain the reservation deposit.</li>
<li>The Seller reserves the right to vary prices and specifications before execution of the Sale Agreement.</li>
<li>This reservation does not constitute a binding contract of sale.</li>
</ol>
<h2>7. SIGNATURES</h2>
<table style="width:100%;margin-top:40px;">
<tr>
<td style="width:50%;vertical-align:top;">
<p>____________________________</p>
<p>For {{organization.name}}</p>
<p>Authorized Representative</p>
<p>Date: ___________________</p>
</td>
<td style="width:50%;vertical-align:top;">
<p>____________________________</p>
<p>{{contact.full_name}}</p>
<p>Buyer</p>
<p>Date: ___________________</p>
</td>
</tr>
</table>
</body></html>',
        '[{"key":"organization.name","required":true},{"key":"organization.address","required":true},{"key":"contact.full_name","required":true},{"key":"contact.address","required":true},{"key":"contact.phone","required":true},{"key":"contact.email","required":true},{"key":"property.title","required":true},{"key":"property.address","required":true},{"key":"property.city","required":true},{"key":"unit.number","required":false},{"key":"unit.bedrooms","required":false},{"key":"unit.size_sqm","required":false},{"key":"unit.floor","required":false},{"key":"deal.title","required":true},{"key":"deal.value","required":true},{"key":"current.date_long","required":true}]'::jsonb,
        '[{"role":"seller","page":1,"x":10,"y":15,"width":150,"height":50,"required":true},{"role":"buyer","page":1,"x":55,"y":15,"width":150,"height":50,"required":true}]'::jsonb,
        '[{"name":"seller","order":1,"required":true},{"name":"buyer","order":2,"required":true}]'::jsonb,
        true,
        'Common for off-plan properties. Deposit is typically non-refundable.',
        p_created_by
    );
    v_count := v_count + 1;

    -- Sales Agreement (Freehold) Template
    INSERT INTO crm_document_templates (
        organization_id, name, category, description, template_html, merge_fields,
        signature_fields, signer_roles, is_system_template, ghana_legal_requirements,
        requires_stamp_duty, requires_notarization, created_by
    ) VALUES (
        p_organization_id,
        'Sales Agreement (Freehold)',
        'sales_agreement_freehold',
        'Formal agreement for the sale of freehold property in Ghana',
        E'<html><head><style>body{font-family:Georgia,serif;line-height:1.8;margin:50px;font-size:13px;}h1{text-align:center;color:#1a365d;}h2{color:#2c5282;border-bottom:1px solid #2c5282;padding-bottom:5px;}.clause{margin:20px 0;}.signature-block{margin-top:60px;page-break-inside:avoid;}</style></head><body>
<h1>AGREEMENT FOR SALE OF LAND<br>(FREEHOLD INTEREST)</h1>
<p style="text-align:center;">Made this {{current.date_long}}</p>
<div class="clause">
<h2>BETWEEN</h2>
<p><strong>{{organization.name}}</strong> of {{organization.address}} (hereinafter called "THE VENDOR" which expression shall where the context so admits include its successors and assigns) of the one part;</p>
<p style="text-align:center;font-weight:bold;">AND</p>
<p><strong>{{contact.full_name}}</strong> of {{contact.address}}, holder of Ghana Card Number {{contact.ghana_card_number}} (hereinafter called "THE PURCHASER" which expression shall where the context so admits include their heirs, executors, administrators and assigns) of the other part.</p>
</div>
<div class="clause">
<h2>RECITALS</h2>
<p>A. The Vendor is the owner of that piece or parcel of land situate at {{property.address}}, {{property.city}} in the {{property.region}} Region of the Republic of Ghana and more particularly described in the Schedule hereto.</p>
<p>B. The Vendor has agreed to sell and the Purchaser has agreed to purchase the said land together with all buildings and structures thereon upon the terms and conditions hereinafter contained.</p>
</div>
<div class="clause">
<h2>NOW THIS AGREEMENT WITNESSETH AS FOLLOWS:</h2>
<h3>1. PROPERTY</h3>
<p>The Vendor hereby agrees to sell and the Purchaser agrees to purchase ALL THAT piece or parcel of land containing an approximate area of {{property.plot_size_sqm}} square meters situate at {{property.address}}, {{property.city}}, {{property.region}} Region, with Digital Address: {{property.ghana_post_gps}}, together with all buildings, structures and improvements thereon.</p>
<h3>2. PURCHASE PRICE</h3>
<p>The purchase price for the property is <strong>{{deal.value}}</strong> payable as follows:</p>
<ol type="a">
<li>A deposit of 25% of the purchase price upon execution of this Agreement;</li>
<li>The balance of 75% shall be paid on or before the completion date.</li>
</ol>
<h3>3. COMPLETION</h3>
<p>Completion of this sale shall take place within 60 days from the date of this Agreement or such other date as may be mutually agreed between the parties.</p>
<h3>4. VENDOR''S OBLIGATIONS</h3>
<p>The Vendor covenants and agrees:</p>
<ol type="a">
<li>To deliver good and marketable title to the Purchaser free from all encumbrances;</li>
<li>To execute all necessary documents for the transfer of the property;</li>
<li>To pay all outgoings up to the date of completion;</li>
<li>To deliver vacant possession on completion.</li>
</ol>
<h3>5. PURCHASER''S OBLIGATIONS</h3>
<p>The Purchaser covenants and agrees:</p>
<ol type="a">
<li>To pay the purchase price in accordance with Clause 2;</li>
<li>To pay all stamp duties, registration fees and legal costs associated with the transfer;</li>
<li>To pay all outgoings from the date of completion.</li>
</ol>
<h3>6. TITLE</h3>
<p>The Vendor shall produce evidence of title to the property to the satisfaction of the Purchaser or their solicitor. The title shall be {{property.land_title}}.</p>
<h3>7. DEFAULT</h3>
<p>If the Purchaser fails to complete the purchase in accordance with this Agreement, the Vendor may forfeit the deposit and resell the property. If the Vendor fails to complete, the Purchaser shall be entitled to the return of all monies paid plus damages.</p>
<h3>8. GOVERNING LAW</h3>
<p>This Agreement shall be governed by the laws of the Republic of Ghana.</p>
</div>
<div class="clause">
<h2>SCHEDULE</h2>
<p><strong>Description of Property:</strong></p>
<ul>
<li>Address: {{property.address}}, {{property.city}}, {{property.region}}</li>
<li>Digital Address: {{property.ghana_post_gps}}</li>
<li>Property Type: {{property.property_type}}</li>
<li>Land Size: {{property.plot_size_sqm}} square meters</li>
<li>Building Size: {{property.size_sqm}} square meters</li>
<li>Title Type: {{property.land_title}}</li>
</ul>
</div>
<div class="signature-block">
<h2>IN WITNESS WHEREOF</h2>
<p>The parties have executed this Agreement the day and year first above written.</p>
<table style="width:100%;margin-top:40px;">
<tr>
<td style="width:50%;vertical-align:top;">
<p>SIGNED by the VENDOR</p>
<p style="margin-top:40px;">____________________________</p>
<p>For and on behalf of</p>
<p>{{organization.name}}</p>
<p>Name: {{agent.full_name}}</p>
<p>In the presence of:</p>
<p style="margin-top:30px;">____________________________</p>
<p>Witness Name: _______________</p>
<p>Address: _______________</p>
<p>Occupation: _______________</p>
</td>
<td style="width:50%;vertical-align:top;">
<p>SIGNED by the PURCHASER</p>
<p style="margin-top:40px;">____________________________</p>
<p>{{contact.full_name}}</p>
<p>In the presence of:</p>
<p style="margin-top:30px;">____________________________</p>
<p>Witness Name: _______________</p>
<p>Address: _______________</p>
<p>Occupation: _______________</p>
</td>
</tr>
</table>
</div>
</body></html>',
        '[{"key":"organization.name","required":true},{"key":"organization.address","required":true},{"key":"contact.full_name","required":true},{"key":"contact.address","required":true},{"key":"contact.ghana_card_number","required":true},{"key":"property.address","required":true},{"key":"property.city","required":true},{"key":"property.region","required":true},{"key":"property.ghana_post_gps","required":false},{"key":"property.property_type","required":true},{"key":"property.land_title","required":true},{"key":"property.plot_size_sqm","required":true},{"key":"property.size_sqm","required":true},{"key":"deal.value","required":true},{"key":"agent.full_name","required":true},{"key":"current.date_long","required":true}]'::jsonb,
        '[{"role":"vendor","page":1,"x":10,"y":10,"width":150,"height":50,"required":true},{"role":"purchaser","page":1,"x":55,"y":10,"width":150,"height":50,"required":true}]'::jsonb,
        '[{"name":"vendor","order":1,"required":true},{"name":"purchaser","order":2,"required":true}]'::jsonb,
        true,
        'Must be stamped at Lands Commission. Requires registration at Lands Registry. Witnesses must be of legal age. Recommend legal review before execution.',
        true,
        true,
        p_created_by
    );
    v_count := v_count + 1;

    -- Receipt Template
    INSERT INTO crm_document_templates (
        organization_id, name, category, description, template_html, merge_fields,
        signature_fields, signer_roles, is_system_template, created_by
    ) VALUES (
        p_organization_id,
        'Payment Receipt',
        'receipt',
        'Official receipt for property transaction payments',
        E'<html><head><style>body{font-family:Arial,sans-serif;margin:40px;}h1{text-align:center;color:#1a365d;}.receipt-box{border:2px solid #2c5282;padding:30px;margin:20px 0;}.amount{font-size:24px;font-weight:bold;color:#059669;}.footer{margin-top:40px;font-size:12px;color:#6b7280;}</style></head><body>
<div style="text-align:center;margin-bottom:30px;">
<h1>{{organization.name}}</h1>
<p>{{organization.address}}</p>
<p>Tel: {{organization.phone}} | Email: {{organization.email}}</p>
</div>
<h2 style="text-align:center;background:#2c5282;color:white;padding:10px;">OFFICIAL RECEIPT</h2>
<div class="receipt-box">
<table style="width:100%;">
<tr><td style="width:150px;"><strong>Receipt No:</strong></td><td>{{deal.title}}</td></tr>
<tr><td><strong>Date:</strong></td><td>{{current.date_long}}</td></tr>
</table>
<hr style="margin:20px 0;">
<p><strong>Received From:</strong></p>
<p>{{contact.full_name}}<br>{{contact.address}}<br>Phone: {{contact.phone}}</p>
<hr style="margin:20px 0;">
<p><strong>The Sum Of:</strong></p>
<p class="amount">{{deal.value}}</p>
<p><em>(Amount in words: ________________________________)</em></p>
<hr style="margin:20px 0;">
<p><strong>Being Payment For:</strong></p>
<p>{{property.title}}<br>{{property.address}}, {{property.city}}</p>
<hr style="margin:20px 0;">
<p><strong>Payment Method:</strong> ________________________</p>
</div>
<table style="width:100%;margin-top:40px;">
<tr>
<td style="width:50%;">
<p>____________________________</p>
<p>Received By</p>
<p>{{agent.full_name}}</p>
</td>
<td style="width:50%;text-align:right;">
<p>Company Stamp</p>
<div style="width:150px;height:100px;border:1px dashed #ccc;display:inline-block;"></div>
</td>
</tr>
</table>
<div class="footer">
<p>This receipt is valid only when stamped and signed by an authorized representative.</p>
</div>
</body></html>',
        '[{"key":"organization.name","required":true},{"key":"organization.address","required":true},{"key":"organization.phone","required":true},{"key":"organization.email","required":true},{"key":"contact.full_name","required":true},{"key":"contact.address","required":true},{"key":"contact.phone","required":true},{"key":"property.title","required":true},{"key":"property.address","required":true},{"key":"property.city","required":true},{"key":"deal.title","required":true},{"key":"deal.value","required":true},{"key":"agent.full_name","required":true},{"key":"current.date_long","required":true}]'::jsonb,
        '[{"role":"receiver","page":1,"x":15,"y":15,"width":150,"height":50,"required":true}]'::jsonb,
        '[{"name":"receiver","order":1,"required":true}]'::jsonb,
        true,
        'Official receipts should be numbered sequentially and kept in duplicate.',
        p_created_by
    );
    v_count := v_count + 1;

    -- Commission Agreement Template
    INSERT INTO crm_document_templates (
        organization_id, name, category, description, template_html, merge_fields,
        signature_fields, signer_roles, is_system_template, created_by
    ) VALUES (
        p_organization_id,
        'Commission Agreement',
        'commission_agreement',
        'Agreement for real estate agent commission on property transactions',
        E'<html><head><style>body{font-family:Arial,sans-serif;line-height:1.6;margin:40px;}h1{text-align:center;color:#1a365d;}h2{color:#2c5282;}</style></head><body>
<h1>COMMISSION AGREEMENT</h1>
<p style="text-align:center;">{{organization.name}}</p>
<p style="text-align:right;">Date: {{current.date_long}}</p>
<h2>PARTIES</h2>
<p><strong>Principal:</strong> _________________________________ ("the Principal")</p>
<p><strong>Agent:</strong> {{organization.name}} of {{organization.address}} ("the Agent")</p>
<h2>PROPERTY</h2>
<p>This agreement relates to the property at:<br>
{{property.address}}, {{property.city}}, {{property.region}}<br>
Digital Address: {{property.ghana_post_gps}}</p>
<h2>TERMS</h2>
<p>1. The Principal hereby appoints the Agent as their exclusive agent for the purpose of [SALE/LETTING] of the above property.</p>
<p>2. The Agent shall be entitled to a commission of <strong>____%</strong> of the [sale price / annual rent] upon successful completion of the transaction.</p>
<p>3. Commission shall be payable upon:</p>
<ul>
<li>For Sales: Completion and transfer of title</li>
<li>For Lettings: Execution of tenancy agreement and receipt of first rent</li>
</ul>
<p>4. This appointment shall be valid for a period of <strong>_____ months</strong> from the date of this agreement.</p>
<p>5. The Agent agrees to:</p>
<ul>
<li>Market the property diligently</li>
<li>Report regularly to the Principal on marketing activities</li>
<li>Accompany prospective buyers/tenants on viewings</li>
<li>Assist in negotiations</li>
</ul>
<h2>SIGNATURES</h2>
<table style="width:100%;margin-top:40px;">
<tr>
<td style="width:50%;vertical-align:top;">
<p>____________________________</p>
<p>Principal</p>
<p>Date: ___________________</p>
</td>
<td style="width:50%;vertical-align:top;">
<p>____________________________</p>
<p>For {{organization.name}}</p>
<p>{{agent.full_name}}</p>
<p>Date: ___________________</p>
</td>
</tr>
</table>
</body></html>',
        '[{"key":"organization.name","required":true},{"key":"organization.address","required":true},{"key":"property.address","required":true},{"key":"property.city","required":true},{"key":"property.region","required":true},{"key":"property.ghana_post_gps","required":false},{"key":"agent.full_name","required":true},{"key":"current.date_long","required":true}]'::jsonb,
        '[{"role":"principal","page":1,"x":10,"y":15,"width":150,"height":50,"required":true},{"role":"agent","page":1,"x":55,"y":15,"width":150,"height":50,"required":true}]'::jsonb,
        '[{"name":"principal","order":1,"required":true},{"name":"agent","order":2,"required":true}]'::jsonb,
        true,
        'Ghana Real Estate Agency Council recommends written commission agreements.',
        p_created_by
    );
    v_count := v_count + 1;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SECTION 8: TRIGGER TO UPDATE USE COUNT
-- =====================================================

CREATE OR REPLACE FUNCTION update_template_use_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE crm_document_templates
    SET use_count = use_count + 1,
        last_used_at = NOW()
    WHERE id = NEW.template_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_template_use_count
    AFTER INSERT ON crm_generated_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_template_use_count();

-- =====================================================
-- SECTION 9: VIEW FOR DOCUMENT CHECKLIST STATUS
-- =====================================================

CREATE OR REPLACE VIEW v_deal_document_status AS
SELECT 
    d.id AS deal_id,
    d.title AS deal_title,
    d.organization_id,
    ds.stage_name AS stage_name,
    COUNT(dc.id) AS total_documents,
    COUNT(dc.id) FILTER (WHERE dc.status = 'signed') AS signed_documents,
    COUNT(dc.id) FILTER (WHERE dc.status IN ('uploaded', 'generated', 'approved')) AS completed_documents,
    COUNT(dc.id) FILTER (WHERE dc.status = 'sent_for_signature' OR dc.status = 'partially_signed') AS pending_signature,
    COUNT(dc.id) FILTER (WHERE dc.is_required AND dc.status = 'not_started') AS required_missing,
    CASE 
        WHEN COUNT(dc.id) = 0 THEN 100
        ELSE ROUND((COUNT(dc.id) FILTER (WHERE dc.status IN ('signed', 'uploaded', 'generated', 'approved'))::DECIMAL / COUNT(dc.id)) * 100, 2)
    END AS completion_percentage
FROM deals d
LEFT JOIN deal_stages ds ON d.stage_id = ds.id
LEFT JOIN crm_deal_document_checklist dc ON d.id = dc.deal_id
GROUP BY d.id, d.title, d.organization_id, ds.stage_name;

-- =====================================================
-- SECTION 10: FUNCTION TO INITIALIZE DEAL CHECKLIST
-- =====================================================

CREATE OR REPLACE FUNCTION initialize_deal_document_checklist(
    p_deal_id UUID,
    p_stage_id UUID,
    p_organization_id UUID,
    p_created_by UUID
)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
    req RECORD;
BEGIN
    -- Get requirements for the stage
    FOR req IN 
        SELECT * FROM crm_stage_document_requirements 
        WHERE stage_id = p_stage_id 
        AND organization_id = p_organization_id
        ORDER BY order_index
    LOOP
        -- Check if already exists
        IF NOT EXISTS (
            SELECT 1 FROM crm_deal_document_checklist 
            WHERE deal_id = p_deal_id AND requirement_id = req.id
        ) THEN
            INSERT INTO crm_deal_document_checklist (
                organization_id, deal_id, requirement_id, template_id,
                document_name, document_type, is_required, created_by
            ) VALUES (
                p_organization_id, p_deal_id, req.id, req.template_id,
                req.document_name, req.document_type, req.is_required, p_created_by
            );
            v_count := v_count + 1;
        END IF;
    END LOOP;
    
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE crm_document_templates IS 'Stores reusable document templates with merge fields for Ghana real estate transactions';
COMMENT ON TABLE crm_stage_document_requirements IS 'Defines which documents are required at each pipeline stage';
COMMENT ON TABLE crm_deal_document_checklist IS 'Tracks document completion status for each deal';
COMMENT ON TABLE crm_generated_documents IS 'Records documents generated from templates';
COMMENT ON TABLE crm_merge_field_registry IS 'Registry of available merge fields for document templates';
COMMENT ON FUNCTION seed_ghana_document_templates IS 'Seeds Ghana-specific legal document templates for an organization';
