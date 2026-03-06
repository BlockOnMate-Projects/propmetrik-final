-- Migration: 094_submittals.sql
-- Description: Submittals management system for shop drawings, materials, and samples
-- Phase 3A Week 2

-- Submittal status enum
DO $$ BEGIN
    CREATE TYPE submittal_status AS ENUM (
        'draft',
        'pending_review',
        'under_review',
        'approved',
        'approved_as_noted',
        'revise_resubmit',
        'rejected',
        'for_record_only',
        'void'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Submittal type enum
DO $$ BEGIN
    CREATE TYPE submittal_type AS ENUM (
        'shop_drawing',
        'product_data',
        'sample',
        'mock_up',
        'design_data',
        'test_report',
        'certificate',
        'manufacturer_instruction',
        'operation_manual',
        'warranty',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Main submittals table
CREATE TABLE IF NOT EXISTS submittals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    
    -- Identification
    submittal_number VARCHAR(50) NOT NULL,
    revision_number INTEGER DEFAULT 0,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    
    -- Classification
    submittal_type submittal_type NOT NULL DEFAULT 'product_data',
    spec_section VARCHAR(50),
    spec_section_title VARCHAR(255),
    category VARCHAR(100),
    
    -- Status & Workflow
    status submittal_status NOT NULL DEFAULT 'draft',
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
    
    -- Dates
    submitted_date DATE,
    required_date DATE,
    returned_date DATE,
    
    -- Lead times
    lead_time_days INTEGER,
    approval_days_required INTEGER DEFAULT 14,
    
    -- Assignments
    submitted_by UUID REFERENCES users(id),
    assigned_reviewer UUID REFERENCES users(id),
    contractor_id UUID REFERENCES project_contractors(id),
    subcontractor_name VARCHAR(255),
    
    -- Supplier/Manufacturer
    supplier_name VARCHAR(255),
    manufacturer VARCHAR(255),
    product_name VARCHAR(255),
    model_number VARCHAR(100),
    
    -- Review info
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP,
    review_comments TEXT,
    
    -- References
    drawing_references JSONB DEFAULT '[]',
    related_rfis UUID[] DEFAULT '{}',
    related_change_orders UUID[] DEFAULT '{}',
    
    -- Attachments
    attachments JSONB DEFAULT '[]',
    
    -- Cost tracking
    cost_code VARCHAR(50),
    estimated_cost NUMERIC(14, 2),
    currency VARCHAR(3) DEFAULT 'GHS',
    
    -- Metadata
    tags TEXT[] DEFAULT '{}',
    custom_fields JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    
    UNIQUE(project_id, submittal_number, revision_number)
);

-- Submittal distribution list
CREATE TABLE IF NOT EXISTS submittal_distribution (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submittal_id UUID NOT NULL REFERENCES submittals(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    company_name VARCHAR(255),
    contact_name VARCHAR(255),
    email VARCHAR(255),
    action_required VARCHAR(50) DEFAULT 'for_information',
    copies_requested INTEGER DEFAULT 1,
    sent_at TIMESTAMP,
    viewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Submittal reviews/approvals
CREATE TABLE IF NOT EXISTS submittal_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submittal_id UUID NOT NULL REFERENCES submittals(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES users(id),
    review_type VARCHAR(50) DEFAULT 'standard',
    status submittal_status NOT NULL,
    comments TEXT,
    stamp_applied BOOLEAN DEFAULT false,
    stamp_type VARCHAR(50),
    reviewed_at TIMESTAMP DEFAULT NOW(),
    attachments JSONB DEFAULT '[]'
);

-- Submittal history/audit trail
CREATE TABLE IF NOT EXISTS submittal_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submittal_id UUID NOT NULL REFERENCES submittals(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    old_status submittal_status,
    new_status submittal_status,
    changed_by UUID REFERENCES users(id),
    change_details JSONB DEFAULT '{}',
    comments TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Submittal packages (for grouping related submittals)
CREATE TABLE IF NOT EXISTS submittal_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    package_number VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date DATE,
    status VARCHAR(50) DEFAULT 'open',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(project_id, package_number)
);

-- Link submittals to packages
CREATE TABLE IF NOT EXISTS submittal_package_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES submittal_packages(id) ON DELETE CASCADE,
    submittal_id UUID NOT NULL REFERENCES submittals(id) ON DELETE CASCADE,
    sequence_number INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(package_id, submittal_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_submittals_project ON submittals(project_id);
CREATE INDEX IF NOT EXISTS idx_submittals_status ON submittals(status);
CREATE INDEX IF NOT EXISTS idx_submittals_type ON submittals(submittal_type);
CREATE INDEX IF NOT EXISTS idx_submittals_number ON submittals(submittal_number);
CREATE INDEX IF NOT EXISTS idx_submittals_contractor ON submittals(contractor_id);
CREATE INDEX IF NOT EXISTS idx_submittals_reviewer ON submittals(assigned_reviewer);
CREATE INDEX IF NOT EXISTS idx_submittals_submitted_date ON submittals(submitted_date);
CREATE INDEX IF NOT EXISTS idx_submittals_required_date ON submittals(required_date);
CREATE INDEX IF NOT EXISTS idx_submittals_spec_section ON submittals(spec_section);
CREATE INDEX IF NOT EXISTS idx_submittal_reviews_submittal ON submittal_reviews(submittal_id);
CREATE INDEX IF NOT EXISTS idx_submittal_history_submittal ON submittal_history(submittal_id);
CREATE INDEX IF NOT EXISTS idx_submittal_packages_project ON submittal_packages(project_id);

-- Auto-generate submittal number trigger
CREATE OR REPLACE FUNCTION generate_submittal_number()
RETURNS TRIGGER AS $$
DECLARE
    next_num INTEGER;
    prefix VARCHAR(10);
BEGIN
    -- Get prefix based on type
    prefix := CASE NEW.submittal_type
        WHEN 'shop_drawing' THEN 'SD'
        WHEN 'product_data' THEN 'PD'
        WHEN 'sample' THEN 'SAM'
        WHEN 'mock_up' THEN 'MU'
        WHEN 'test_report' THEN 'TR'
        WHEN 'certificate' THEN 'CERT'
        ELSE 'SUB'
    END;
    
    IF NEW.submittal_number IS NULL OR NEW.submittal_number = '' THEN
        SELECT COALESCE(MAX(
            CASE 
                WHEN submittal_number ~ ('^' || prefix || '-[0-9]+$')
                THEN CAST(SUBSTRING(submittal_number FROM '[0-9]+$') AS INTEGER)
                ELSE 0
            END
        ), 0) + 1 INTO next_num
        FROM submittals 
        WHERE project_id = NEW.project_id;
        
        NEW.submittal_number := prefix || '-' || LPAD(next_num::TEXT, 4, '0');
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_submittal_number ON submittals;
CREATE TRIGGER trg_generate_submittal_number
    BEFORE INSERT ON submittals
    FOR EACH ROW
    EXECUTE FUNCTION generate_submittal_number();

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_submittals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_submittals_updated_at ON submittals;
CREATE TRIGGER trg_submittals_updated_at
    BEFORE UPDATE ON submittals
    FOR EACH ROW
    EXECUTE FUNCTION update_submittals_updated_at();

-- History tracking trigger
CREATE OR REPLACE FUNCTION track_submittal_history()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO submittal_history (
            submittal_id, action, old_status, new_status, 
            changed_by, change_details
        ) VALUES (
            NEW.id,
            'status_change',
            OLD.status,
            NEW.status,
            NEW.updated_by,
            jsonb_build_object(
                'old_status', OLD.status,
                'new_status', NEW.status,
                'timestamp', NOW()
            )
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_track_submittal_history ON submittals;
CREATE TRIGGER trg_track_submittal_history
    AFTER UPDATE ON submittals
    FOR EACH ROW
    EXECUTE FUNCTION track_submittal_history();

-- Submittal statistics view
CREATE OR REPLACE VIEW submittal_stats_by_project AS
SELECT 
    s.project_id,
    dp.name as project_name,
    COUNT(*) as total_submittals,
    COUNT(*) FILTER (WHERE s.status = 'draft') as draft_count,
    COUNT(*) FILTER (WHERE s.status IN ('pending_review', 'under_review')) as pending_count,
    COUNT(*) FILTER (WHERE s.status IN ('approved', 'approved_as_noted')) as approved_count,
    COUNT(*) FILTER (WHERE s.status = 'revise_resubmit') as revise_count,
    COUNT(*) FILTER (WHERE s.status = 'rejected') as rejected_count,
    COUNT(*) FILTER (WHERE s.required_date < CURRENT_DATE AND s.status NOT IN ('approved', 'approved_as_noted', 'rejected', 'void')) as overdue_count,
    COUNT(*) FILTER (WHERE s.required_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' AND s.status NOT IN ('approved', 'approved_as_noted', 'rejected', 'void')) as due_this_week,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE s.status IN ('approved', 'approved_as_noted')) / NULLIF(COUNT(*), 0),
        1
    ) as approval_rate,
    AVG(
        CASE 
            WHEN s.returned_date IS NOT NULL AND s.submitted_date IS NOT NULL 
            THEN s.returned_date - s.submitted_date 
        END
    )::INTEGER as avg_review_days
FROM submittals s
LEFT JOIN development_projects dp ON s.project_id = dp.id
GROUP BY s.project_id, dp.name;

-- Submittal detail view with related data
DROP VIEW IF EXISTS submittal_details;
CREATE VIEW submittal_details AS
SELECT 
    s.*,
    dp.name as project_name,
    CONCAT(sub_by.first_name, ' ', sub_by.last_name) as submitted_by_name,
    CONCAT(reviewer.first_name, ' ', reviewer.last_name) as reviewer_name,
    CONCAT(reviewed.first_name, ' ', reviewed.last_name) as reviewed_by_name,
    c.company_name as contractor_company,
    CASE 
        WHEN s.required_date < CURRENT_DATE AND s.status NOT IN ('approved', 'approved_as_noted', 'rejected', 'void')
        THEN CURRENT_DATE - s.required_date
        ELSE 0
    END as days_overdue,
    CASE 
        WHEN s.submitted_date IS NOT NULL AND s.returned_date IS NULL
        THEN CURRENT_DATE - s.submitted_date
        ELSE NULL
    END as days_in_review
FROM submittals s
LEFT JOIN development_projects dp ON s.project_id = dp.id
LEFT JOIN users sub_by ON s.submitted_by = sub_by.id
LEFT JOIN users reviewer ON s.assigned_reviewer = reviewer.id
LEFT JOIN users reviewed ON s.reviewed_by = reviewed.id
LEFT JOIN project_contractors c ON s.contractor_id = c.id;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON submittals TO propmetrik_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON submittal_distribution TO propmetrik_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON submittal_reviews TO propmetrik_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON submittal_history TO propmetrik_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON submittal_packages TO propmetrik_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON submittal_package_items TO propmetrik_app;
GRANT SELECT ON submittal_stats_by_project TO propmetrik_app;
GRANT SELECT ON submittal_details TO propmetrik_app;

-- Success message
DO $$ BEGIN RAISE NOTICE 'Migration 094_submittals.sql completed successfully'; END $$;
