-- Migration: 083_team_management.sql
-- Phase 4 Sprint 8: Team & Integration
-- Creates tables for team members, vendors, and communication logging

-- ============================================================================
-- GHANA-SPECIFIC ROLE TYPES
-- ============================================================================
DO $$ BEGIN
    CREATE TYPE ghana_team_role AS ENUM (
        -- Internal roles
        'project_owner',
        'project_manager',
        'assistant_project_manager',
        'site_manager',
        
        -- Design & Engineering
        'architect',
        'structural_engineer',
        'quantity_surveyor',
        'mechanical_engineer',
        'electrical_engineer',
        'civil_engineer',
        'geotechnical_engineer',
        'interior_designer',
        
        -- Construction
        'main_contractor',
        'site_supervisor',
        'foreman',
        'safety_officer',
        
        -- Specialist Contractors
        'electrical_contractor',
        'plumbing_contractor',
        'masonry_contractor',
        'steel_contractor',
        'roofing_contractor',
        'painting_contractor',
        'tiling_contractor',
        'landscaping_contractor',
        'hvac_contractor',
        
        -- Government & Regulatory
        'lands_commission_officer',
        'assembly_officer',
        'fire_service_inspector',
        'epa_officer',
        'town_planning_officer',
        
        -- Stakeholders
        'traditional_chief',
        'community_liaison',
        'investor',
        'financier',
        
        -- Operations
        'accountant',
        'procurement_officer',
        'mobile_money_agent',
        'security_coordinator',
        'logistics_coordinator',
        
        -- Other
        'consultant',
        'legal_advisor',
        'surveyor',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE role_category AS ENUM (
        'internal',
        'contractor',
        'consultant',
        'government',
        'stakeholder',
        'vendor',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE vendor_category AS ENUM (
        'general_contractor',
        'specialist_contractor',
        'material_supplier',
        'equipment_rental',
        'consultant',
        'service_provider',
        'transport',
        'security',
        'cleaning',
        'catering',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE communication_type AS ENUM (
        'phone_call',
        'whatsapp',
        'email',
        'sms',
        'in_person',
        'site_visit',
        'virtual_meeting',
        'letter',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- PROJECT TEAM MEMBERS
-- Links users/contacts to projects with roles and permissions
-- ============================================================================
CREATE TABLE IF NOT EXISTS project_team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    user_id UUID, -- If internal user (links to auth system)
    vendor_id UUID, -- If vendor contact
    
    -- Contact information
    full_name VARCHAR(200) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    phone_alt VARCHAR(50),
    whatsapp VARCHAR(50),
    
    -- Role
    role VARCHAR(100) NOT NULL,
    role_type ghana_team_role DEFAULT 'other',
    role_category role_category DEFAULT 'other',
    title VARCHAR(200), -- e.g., "Senior Site Engineer"
    department VARCHAR(100),
    company VARCHAR(200),
    
    -- Assignment details
    responsibilities TEXT,
    assignment_type VARCHAR(50) DEFAULT 'full_time' CHECK (assignment_type IN (
        'full_time',
        'part_time',
        'on_call',
        'as_needed',
        'temporary'
    )),
    
    -- Permissions
    can_view BOOLEAN DEFAULT true,
    can_edit BOOLEAN DEFAULT false,
    can_approve_costs BOOLEAN DEFAULT false,
    can_upload_documents BOOLEAN DEFAULT true,
    can_add_tasks BOOLEAN DEFAULT true,
    can_manage_team BOOLEAN DEFAULT false,
    can_view_financials BOOLEAN DEFAULT false,
    can_receive_notifications BOOLEAN DEFAULT true,
    
    -- Dates
    start_date DATE,
    end_date DATE,
    last_active_date DATE,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN (
        'active',
        'inactive',
        'pending',
        'on_leave',
        'terminated'
    )),
    
    -- Location tracking
    primary_location VARCHAR(255), -- For site-based roles
    can_work_remote BOOLEAN DEFAULT false,
    
    -- Cost tracking
    hourly_rate NUMERIC(10, 2),
    daily_rate NUMERIC(10, 2),
    monthly_rate NUMERIC(10, 2),
    rate_currency VARCHAR(3) DEFAULT 'GHS',
    
    -- Emergency contact
    emergency_contact_name VARCHAR(200),
    emergency_contact_phone VARCHAR(50),
    
    -- Notes
    notes TEXT,
    
    -- Profile
    avatar_url TEXT,
    linkedin_url TEXT,
    
    -- Invited/Added tracking
    invited_by UUID,
    invited_at TIMESTAMP,
    accepted_at TIMESTAMP,
    
    -- Audit
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for team member queries
CREATE INDEX IF NOT EXISTS idx_project_team_members_project ON project_team_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_team_members_org ON project_team_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_project_team_members_user ON project_team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_team_members_vendor ON project_team_members(vendor_id);
CREATE INDEX IF NOT EXISTS idx_project_team_members_role ON project_team_members(role_type);
CREATE INDEX IF NOT EXISTS idx_project_team_members_category ON project_team_members(role_category);
CREATE INDEX IF NOT EXISTS idx_project_team_members_active ON project_team_members(is_active);
CREATE INDEX IF NOT EXISTS idx_project_team_members_email ON project_team_members(email);

-- ============================================================================
-- VENDORS
-- Organization-wide vendor directory
-- ============================================================================
CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    
    -- Business details
    name VARCHAR(200) NOT NULL,
    trading_name VARCHAR(200),
    category vendor_category NOT NULL DEFAULT 'other',
    specializations TEXT[], -- Array of specializations
    
    -- Registration
    business_registration VARCHAR(100),
    tin_number VARCHAR(50), -- Ghana TIN
    vat_registered BOOLEAN DEFAULT false,
    vat_number VARCHAR(50),
    
    -- Contact - Primary
    primary_contact_name VARCHAR(200),
    primary_contact_title VARCHAR(100),
    primary_contact_email VARCHAR(255),
    primary_contact_phone VARCHAR(50),
    primary_contact_whatsapp VARCHAR(50),
    
    -- Contact - Alternative
    alt_contact_name VARCHAR(200),
    alt_contact_email VARCHAR(255),
    alt_contact_phone VARCHAR(50),
    
    -- Address
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    region VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Ghana',
    ghana_post_gps VARCHAR(50),
    postal_code VARCHAR(20),
    
    -- Location
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    
    -- Banking
    bank_name VARCHAR(100),
    bank_branch VARCHAR(100),
    bank_account_number VARCHAR(50),
    bank_account_name VARCHAR(200),
    mobile_money_number VARCHAR(50),
    mobile_money_provider VARCHAR(50), -- 'MTN', 'Vodafone', 'AirtelTigo'
    
    -- Rating & Performance
    rating_avg NUMERIC(3, 2) DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    quality_score NUMERIC(3, 2),
    reliability_score NUMERIC(3, 2),
    communication_score NUMERIC(3, 2),
    value_score NUMERIC(3, 2),
    
    -- Financial
    credit_limit NUMERIC(15, 2),
    payment_terms VARCHAR(50) DEFAULT 'net_30', -- 'immediate', 'net_15', 'net_30', 'net_60', 'milestone'
    preferred_currency VARCHAR(3) DEFAULT 'GHS',
    
    -- Compliance
    has_insurance BOOLEAN DEFAULT false,
    insurance_expiry DATE,
    insurance_document_url TEXT,
    
    has_safety_certification BOOLEAN DEFAULT false,
    safety_certification_expiry DATE,
    safety_document_url TEXT,
    
    has_work_permit BOOLEAN DEFAULT false,
    work_permit_expiry DATE,
    
    -- Documents
    business_registration_url TEXT,
    tax_clearance_url TEXT,
    portfolio_url TEXT,
    
    -- Approval workflow
    is_approved BOOLEAN DEFAULT false,
    approval_status VARCHAR(50) DEFAULT 'pending' CHECK (approval_status IN (
        'pending',
        'under_review',
        'approved',
        'rejected',
        'suspended',
        'blacklisted'
    )),
    approved_by UUID,
    approved_at TIMESTAMP,
    rejection_reason TEXT,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_preferred BOOLEAN DEFAULT false,
    
    -- Historical stats
    total_projects INTEGER DEFAULT 0,
    total_contract_value NUMERIC(15, 2) DEFAULT 0,
    completed_projects INTEGER DEFAULT 0,
    on_time_completion_rate NUMERIC(5, 2),
    
    -- Tags and categorization
    tags TEXT[],
    notes TEXT,
    internal_notes TEXT,
    
    -- Audit
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for vendor queries - only create if columns exist
DO $$
BEGIN
    CREATE INDEX IF NOT EXISTS idx_vendors_org ON vendors(organization_id);
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'category') THEN
        CREATE INDEX IF NOT EXISTS idx_vendors_category ON vendors(category);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'is_approved') THEN
        CREATE INDEX IF NOT EXISTS idx_vendors_approved ON vendors(is_approved);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'is_active') THEN
        CREATE INDEX IF NOT EXISTS idx_vendors_active ON vendors(is_active);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'is_preferred') THEN
        CREATE INDEX IF NOT EXISTS idx_vendors_preferred ON vendors(is_preferred);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'rating_avg') THEN
        CREATE INDEX IF NOT EXISTS idx_vendors_rating ON vendors(rating_avg);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'name') THEN
        CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors(name);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'specializations') THEN
        CREATE INDEX IF NOT EXISTS idx_vendors_specializations ON vendors USING GIN(specializations);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'tags') THEN
        CREATE INDEX IF NOT EXISTS idx_vendors_tags ON vendors USING GIN(tags);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;  -- Ignore errors if table doesn't exist
END $$;

-- ============================================================================
-- VENDOR RATINGS
-- Individual project ratings for vendors
-- ============================================================================
CREATE TABLE IF NOT EXISTS vendor_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    
    -- Contract context
    contract_value NUMERIC(15, 2),
    contract_start DATE,
    contract_end DATE,
    work_description TEXT,
    
    -- Ratings (1-5 scale)
    overall_rating NUMERIC(2, 1) NOT NULL CHECK (overall_rating >= 1 AND overall_rating <= 5),
    quality_rating NUMERIC(2, 1) CHECK (quality_rating >= 1 AND quality_rating <= 5),
    timeliness_rating NUMERIC(2, 1) CHECK (timeliness_rating >= 1 AND timeliness_rating <= 5),
    communication_rating NUMERIC(2, 1) CHECK (communication_rating >= 1 AND communication_rating <= 5),
    value_rating NUMERIC(2, 1) CHECK (value_rating >= 1 AND value_rating <= 5),
    safety_rating NUMERIC(2, 1) CHECK (safety_rating >= 1 AND safety_rating <= 5),
    
    -- Feedback
    review_title VARCHAR(255),
    review_text TEXT,
    pros TEXT,
    cons TEXT,
    
    -- Recommendations
    would_hire_again BOOLEAN,
    would_recommend BOOLEAN,
    
    -- Verification
    is_verified BOOLEAN DEFAULT false,
    verified_by UUID,
    verified_at TIMESTAMP,
    
    -- Status
    is_public BOOLEAN DEFAULT false, -- Whether visible to other orgs
    
    -- Audit
    rated_by UUID NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for rating queries
CREATE INDEX IF NOT EXISTS idx_vendor_ratings_vendor ON vendor_ratings(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_ratings_project ON vendor_ratings(project_id);
CREATE INDEX IF NOT EXISTS idx_vendor_ratings_org ON vendor_ratings(organization_id);

-- Unique constraint: one rating per vendor per project per org
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_ratings_unique 
ON vendor_ratings(vendor_id, project_id, organization_id);

-- ============================================================================
-- COMMUNICATION LOGS
-- Track all communications with team members
-- ============================================================================
CREATE TABLE IF NOT EXISTS communication_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    team_member_id UUID REFERENCES project_team_members(id) ON DELETE SET NULL,
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    
    -- Contact details (in case team member is deleted)
    contact_name VARCHAR(200),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    
    -- Communication type
    communication_type communication_type NOT NULL DEFAULT 'other',
    direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    
    -- Content
    subject VARCHAR(500),
    summary TEXT,
    notes TEXT,
    
    -- Timing
    communication_date DATE NOT NULL,
    communication_time TIME,
    duration_minutes INTEGER, -- For calls/meetings
    
    -- Outcome
    outcome VARCHAR(100), -- e.g., 'successful', 'no_answer', 'voicemail', 'follow_up_needed'
    follow_up_required BOOLEAN DEFAULT false,
    follow_up_date DATE,
    follow_up_notes TEXT,
    
    -- Related entities
    related_task_id UUID,
    related_issue_id UUID,
    related_document_id UUID,
    
    -- Attachments (for emails, meeting notes)
    attachments JSONB DEFAULT '[]',
    -- Example: [{"name": "meeting_notes.pdf", "url": "...", "type": "application/pdf"}]
    
    -- Tags
    tags TEXT[],
    is_important BOOLEAN DEFAULT false,
    
    -- Status
    status VARCHAR(50) DEFAULT 'logged' CHECK (status IN (
        'logged',
        'pending_follow_up',
        'follow_up_complete',
        'archived'
    )),
    
    -- Audit
    logged_by UUID NOT NULL,
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for communication log queries
CREATE INDEX IF NOT EXISTS idx_communication_logs_project ON communication_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_communication_logs_org ON communication_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_communication_logs_team_member ON communication_logs(team_member_id);
CREATE INDEX IF NOT EXISTS idx_communication_logs_vendor ON communication_logs(vendor_id);
CREATE INDEX IF NOT EXISTS idx_communication_logs_type ON communication_logs(communication_type);
CREATE INDEX IF NOT EXISTS idx_communication_logs_date ON communication_logs(communication_date);
CREATE INDEX IF NOT EXISTS idx_communication_logs_logged_by ON communication_logs(logged_by);
CREATE INDEX IF NOT EXISTS idx_communication_logs_follow_up ON communication_logs(follow_up_required, follow_up_date);
CREATE INDEX IF NOT EXISTS idx_communication_logs_tags ON communication_logs USING GIN(tags);

-- ============================================================================
-- TEAM MEMBER AVAILABILITY
-- Track availability for scheduling
-- ============================================================================
CREATE TABLE IF NOT EXISTS team_member_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_member_id UUID NOT NULL REFERENCES project_team_members(id) ON DELETE CASCADE,
    
    -- Time slot
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    
    -- Availability type
    availability_type VARCHAR(50) NOT NULL CHECK (availability_type IN (
        'available',
        'unavailable',
        'tentative',
        'on_leave',
        'sick',
        'public_holiday',
        'site_visit'
    )),
    
    -- Details
    reason TEXT,
    location VARCHAR(255),
    
    -- Recurrence
    is_recurring BOOLEAN DEFAULT false,
    recurrence_pattern VARCHAR(50), -- 'daily', 'weekly', 'monthly'
    recurrence_end_date DATE,
    
    -- Audit
    created_by UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for availability queries
CREATE INDEX IF NOT EXISTS idx_team_availability_member ON team_member_availability(team_member_id);
CREATE INDEX IF NOT EXISTS idx_team_availability_date ON team_member_availability(date);

-- ============================================================================
-- PROJECT VENDOR ASSIGNMENTS
-- Link vendors to specific projects with contract details
-- ============================================================================
CREATE TABLE IF NOT EXISTS project_vendor_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    
    -- Assignment details
    work_scope TEXT NOT NULL,
    work_category VARCHAR(100),
    
    -- Contract details
    contract_reference VARCHAR(100),
    contract_value NUMERIC(15, 2),
    contract_currency VARCHAR(3) DEFAULT 'GHS',
    contract_start_date DATE,
    contract_end_date DATE,
    
    -- Status
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN (
        'pending',
        'active',
        'on_hold',
        'completed',
        'terminated',
        'cancelled'
    )),
    
    -- Performance tracking
    work_progress NUMERIC(5, 2) DEFAULT 0,
    quality_score NUMERIC(3, 2),
    
    -- Payment tracking
    amount_invoiced NUMERIC(15, 2) DEFAULT 0,
    amount_paid NUMERIC(15, 2) DEFAULT 0,
    
    -- Primary contact for this assignment
    primary_contact_id UUID REFERENCES project_team_members(id) ON DELETE SET NULL,
    
    -- Notes
    notes TEXT,
    
    -- Audit
    assigned_by UUID,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for vendor assignment queries
CREATE INDEX IF NOT EXISTS idx_project_vendor_assignments_project ON project_vendor_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_project_vendor_assignments_vendor ON project_vendor_assignments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_project_vendor_assignments_org ON project_vendor_assignments(organization_id);
CREATE INDEX IF NOT EXISTS idx_project_vendor_assignments_status ON project_vendor_assignments(status);

-- Unique constraint: one active assignment per vendor per project
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_assignment_unique 
ON project_vendor_assignments(project_id, vendor_id) 
WHERE status = 'active';

-- ============================================================================
-- TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION update_team_tables_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DROP TRIGGER IF EXISTS trg_project_team_members_updated ON project_team_members;
CREATE TRIGGER trg_project_team_members_updated
    BEFORE UPDATE ON project_team_members
    FOR EACH ROW
    EXECUTE FUNCTION update_team_tables_updated_at();

DROP TRIGGER IF EXISTS trg_vendors_updated ON vendors;
CREATE TRIGGER trg_vendors_updated
    BEFORE UPDATE ON vendors
    FOR EACH ROW
    EXECUTE FUNCTION update_team_tables_updated_at();

DROP TRIGGER IF EXISTS trg_vendor_ratings_updated ON vendor_ratings;
CREATE TRIGGER trg_vendor_ratings_updated
    BEFORE UPDATE ON vendor_ratings
    FOR EACH ROW
    EXECUTE FUNCTION update_team_tables_updated_at();

DROP TRIGGER IF EXISTS trg_communication_logs_updated ON communication_logs;
CREATE TRIGGER trg_communication_logs_updated
    BEFORE UPDATE ON communication_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_team_tables_updated_at();

DROP TRIGGER IF EXISTS trg_team_member_availability_updated ON team_member_availability;
CREATE TRIGGER trg_team_member_availability_updated
    BEFORE UPDATE ON team_member_availability
    FOR EACH ROW
    EXECUTE FUNCTION update_team_tables_updated_at();

DROP TRIGGER IF EXISTS trg_project_vendor_assignments_updated ON project_vendor_assignments;
CREATE TRIGGER trg_project_vendor_assignments_updated
    BEFORE UPDATE ON project_vendor_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_team_tables_updated_at();

-- ============================================================================
-- FUNCTION: Update vendor ratings
-- ============================================================================
CREATE OR REPLACE FUNCTION update_vendor_rating_aggregates()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE vendors
    SET 
        rating_avg = (
            SELECT COALESCE(AVG(overall_rating), 0)
            FROM vendor_ratings
            WHERE vendor_id = COALESCE(NEW.vendor_id, OLD.vendor_id)
        ),
        rating_count = (
            SELECT COUNT(*)
            FROM vendor_ratings
            WHERE vendor_id = COALESCE(NEW.vendor_id, OLD.vendor_id)
        ),
        quality_score = (
            SELECT COALESCE(AVG(quality_rating), 0)
            FROM vendor_ratings
            WHERE vendor_id = COALESCE(NEW.vendor_id, OLD.vendor_id)
        ),
        communication_score = (
            SELECT COALESCE(AVG(communication_rating), 0)
            FROM vendor_ratings
            WHERE vendor_id = COALESCE(NEW.vendor_id, OLD.vendor_id)
        ),
        value_score = (
            SELECT COALESCE(AVG(value_rating), 0)
            FROM vendor_ratings
            WHERE vendor_id = COALESCE(NEW.vendor_id, OLD.vendor_id)
        ),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = COALESCE(NEW.vendor_id, OLD.vendor_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vendor_ratings_aggregate ON vendor_ratings;
CREATE TRIGGER trg_vendor_ratings_aggregate
    AFTER INSERT OR UPDATE OR DELETE ON vendor_ratings
    FOR EACH ROW
    EXECUTE FUNCTION update_vendor_rating_aggregates();

-- Comments
COMMENT ON TABLE project_team_members IS 'Project team members with Ghana-specific roles';
COMMENT ON TABLE vendors IS 'Organization-wide vendor directory with ratings';
COMMENT ON TABLE vendor_ratings IS 'Individual project ratings for vendors';
COMMENT ON TABLE communication_logs IS 'Communication history with team and vendors';
COMMENT ON TABLE team_member_availability IS 'Team member availability for scheduling';
COMMENT ON TABLE project_vendor_assignments IS 'Vendor assignments to projects with contracts';
