-- ============================================================================
-- Migration 097: Quality Checklists System
-- Phase 3A Week 4 - Configurable QC Inspection Templates & Digital Signatures
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- Checklist template type
DO $$ BEGIN
    CREATE TYPE checklist_template_type AS ENUM (
        'pre_construction',    -- Before work begins
        'rough_in',            -- MEP rough-in inspections
        'pre_drywall',         -- Before closing walls
        'finish',              -- Final finishes
        'substantial',         -- Substantial completion
        'final',               -- Final walkthrough
        'turnover',            -- Unit turnover
        'safety',              -- Safety inspections
        'daily',               -- Daily safety/quality
        'weekly',              -- Weekly inspections
        'monthly',             -- Monthly inspections
        'warranty',            -- Warranty period
        'custom'               -- User-defined
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Checklist item response type
DO $$ BEGIN
    CREATE TYPE checklist_response_type AS ENUM (
        'pass_fail',           -- Simple pass/fail
        'yes_no',              -- Yes/No answer
        'yes_no_na',           -- Yes/No/N/A
        'rating',              -- 1-5 rating scale
        'numeric',             -- Numeric value entry
        'text',                -- Free text response
        'photo_required',      -- Must include photo
        'measurement',         -- Measurement with units
        'multi_select',        -- Multiple choice (select many)
        'single_select',       -- Single choice
        'date',                -- Date entry
        'signature'            -- Signature capture
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Checklist status
DO $$ BEGIN
    CREATE TYPE checklist_status AS ENUM (
        'draft',               -- Not yet started
        'in_progress',         -- Being filled out
        'pending_review',      -- Submitted for review
        'approved',            -- Approved/signed off
        'rejected',            -- Failed inspection
        'requires_reinspection', -- Need to redo
        'completed',           -- Closed
        'archived'             -- Historical
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Item result
DO $$ BEGIN
    CREATE TYPE checklist_item_result AS ENUM (
        'pass',
        'fail',
        'na',                  -- Not applicable
        'pending',             -- Not yet inspected
        'deferred'             -- Skipped for later
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- TEMPLATE TABLES
-- ============================================================================

-- Checklist Template Categories (for organization)
CREATE TABLE IF NOT EXISTS checklist_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID,
    
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    color VARCHAR(20),
    display_order INTEGER DEFAULT 0,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(organization_id, name)
);

-- Checklist Templates (reusable templates)
CREATE TABLE IF NOT EXISTS checklist_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID,
    category_id UUID REFERENCES checklist_categories(id) ON DELETE SET NULL,
    
    -- Template identification
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50), -- Short code like "ELEC-001"
    description TEXT,
    version INTEGER DEFAULT 1,
    template_type checklist_template_type NOT NULL DEFAULT 'custom',
    
    -- Applicability
    applicable_trades TEXT[] DEFAULT '{}',
    applicable_phases TEXT[] DEFAULT '{}', -- construction phases
    applicable_unit_types TEXT[] DEFAULT '{}', -- unit types
    
    -- Template settings
    requires_signature BOOLEAN DEFAULT false,
    requires_photo BOOLEAN DEFAULT false,
    allow_partial_save BOOLEAN DEFAULT true,
    enforce_sequence BOOLEAN DEFAULT false, -- Must complete in order
    pass_threshold DECIMAL(5,2) DEFAULT 100, -- % required to pass
    
    -- Scoring
    scoring_enabled BOOLEAN DEFAULT false,
    max_score INTEGER,
    passing_score INTEGER,
    
    -- Notifications
    notify_on_fail BOOLEAN DEFAULT true,
    notify_on_complete BOOLEAN DEFAULT true,
    notify_recipients JSONB DEFAULT '[]', -- Array of {role, user_id, email}
    
    -- Standards reference
    reference_standards TEXT[], -- e.g., ["OSHA 1926.150", "IBC 2021 Ch. 7"]
    reference_documents JSONB DEFAULT '[]', -- Links to specification docs
    
    -- Publishing
    is_published BOOLEAN DEFAULT false,
    is_global BOOLEAN DEFAULT false, -- Available to all orgs
    published_at TIMESTAMP,
    published_by UUID,
    
    -- Audit
    created_by UUID NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(organization_id, code, version)
);

-- Template Sections (groups of items)
CREATE TABLE IF NOT EXISTS checklist_template_sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
    
    name VARCHAR(255) NOT NULL,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    
    -- Section settings
    is_required BOOLEAN DEFAULT true,
    is_repeatable BOOLEAN DEFAULT false, -- Can add multiple instances
    repeat_for VARCHAR(50), -- 'room', 'unit', 'floor', etc.
    
    -- Conditional display
    condition_logic JSONB, -- Show/hide based on other responses
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Template Items (individual check items)
CREATE TABLE IF NOT EXISTS checklist_template_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
    section_id UUID REFERENCES checklist_template_sections(id) ON DELETE CASCADE,
    
    -- Item identification
    item_number VARCHAR(20), -- Display number like "1.1"
    question TEXT NOT NULL, -- The actual check/question
    description TEXT, -- Additional guidance
    
    -- Response configuration
    response_type checklist_response_type NOT NULL DEFAULT 'pass_fail',
    response_options JSONB, -- For select types: [{value, label, score}]
    validation_rules JSONB, -- {min, max, pattern, required}
    default_value TEXT,
    
    -- Display
    display_order INTEGER DEFAULT 0,
    is_required BOOLEAN DEFAULT true,
    
    -- Photo requirement
    photo_required_on VARCHAR(50), -- 'always', 'fail', 'pass', null
    min_photos INTEGER DEFAULT 0,
    max_photos INTEGER DEFAULT 10,
    
    -- Scoring
    points INTEGER DEFAULT 0, -- Points if passed
    weight DECIMAL(5,2) DEFAULT 1.0, -- Multiplier for weighted scoring
    is_critical BOOLEAN DEFAULT false, -- Auto-fail if this fails
    
    -- Conditional logic
    depends_on_item_id UUID,
    depends_on_value TEXT,
    show_condition JSONB, -- Complex conditional logic
    
    -- Reference
    reference_code VARCHAR(50), -- Spec section, code reference
    reference_notes TEXT,
    
    -- AI assistance
    ai_detection_enabled BOOLEAN DEFAULT false,
    ai_detection_type VARCHAR(50), -- 'damage', 'cleanliness', 'installation', etc.
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INSTANCE TABLES (Filled-out checklists)
-- ============================================================================

-- Checklist Instances (actual inspections)
CREATE TABLE IF NOT EXISTS checklist_instances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID NOT NULL REFERENCES checklist_templates(id),
    organization_id UUID NOT NULL,
    
    -- Location/scope
    project_id UUID,
    unit_id UUID,
    location_description TEXT, -- Building/floor/area
    
    -- Instance metadata
    instance_number VARCHAR(50), -- Auto-generated reference
    title VARCHAR(255),
    description TEXT,
    
    -- Schedule
    scheduled_date DATE,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    due_date DATE,
    
    -- Assignment
    assigned_to UUID,
    assigned_by UUID,
    inspector_name VARCHAR(255), -- Denormalized
    inspector_company VARCHAR(255),
    
    -- Status
    status checklist_status NOT NULL DEFAULT 'draft',
    status_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status_changed_by UUID,
    
    -- Results
    total_items INTEGER DEFAULT 0,
    completed_items INTEGER DEFAULT 0,
    passed_items INTEGER DEFAULT 0,
    failed_items INTEGER DEFAULT 0,
    na_items INTEGER DEFAULT 0,
    
    -- Scoring
    score DECIMAL(10,2),
    max_possible_score DECIMAL(10,2),
    score_percentage DECIMAL(5,2),
    
    -- Overall result
    overall_result checklist_item_result DEFAULT 'pending',
    result_notes TEXT,
    
    -- Re-inspection tracking
    original_instance_id UUID REFERENCES checklist_instances(id),
    reinspection_count INTEGER DEFAULT 0,
    
    -- Weather (for outdoor inspections)
    weather_conditions JSONB, -- {temp, conditions, wind}
    
    -- Offline support
    offline_id VARCHAR(100),
    sync_status VARCHAR(50) DEFAULT 'synced',
    device_id VARCHAR(100),
    
    -- Audit
    created_by UUID NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Checklist Item Responses
CREATE TABLE IF NOT EXISTS checklist_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instance_id UUID NOT NULL REFERENCES checklist_instances(id) ON DELETE CASCADE,
    template_item_id UUID NOT NULL REFERENCES checklist_template_items(id),
    
    -- Response data
    response_value TEXT, -- The actual response
    result checklist_item_result DEFAULT 'pending',
    
    -- For numeric types
    numeric_value DECIMAL(15,4),
    unit_of_measure VARCHAR(50),
    
    -- Notes
    notes TEXT,
    internal_notes TEXT, -- Inspector-only notes
    
    -- Photos
    photos JSONB DEFAULT '[]', -- Array of {id, url, thumbnail, caption, taken_at}
    
    -- Scoring
    score INTEGER DEFAULT 0,
    
    -- Issue tracking
    created_punch_item_id UUID, -- If failed, link to punch list
    
    -- Timing
    responded_at TIMESTAMP,
    responded_by UUID,
    
    -- Verification
    verified_by UUID,
    verified_at TIMESTAMP,
    
    -- Offline
    offline_id VARCHAR(100),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- SIGNATURES
-- ============================================================================

-- Checklist Signatures
CREATE TABLE IF NOT EXISTS checklist_signatures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instance_id UUID NOT NULL REFERENCES checklist_instances(id) ON DELETE CASCADE,
    
    -- Signatory
    signer_id UUID,
    signer_name VARCHAR(255) NOT NULL,
    signer_title VARCHAR(100),
    signer_company VARCHAR(255),
    signer_email VARCHAR(255),
    signer_role VARCHAR(50) NOT NULL, -- inspector, supervisor, owner, architect
    
    -- Signature data
    signature_type VARCHAR(50) NOT NULL, -- drawn, typed, digital_certificate
    signature_data TEXT, -- Base64 image or cert reference
    
    -- Sign-off
    sign_off_type VARCHAR(50), -- inspection_complete, approval, witness
    statement TEXT, -- What they're signing for
    
    -- Verification
    ip_address VARCHAR(50),
    device_info JSONB,
    location_data JSONB, -- GPS if available
    
    signed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Certificate info (for digital certs)
    certificate_id VARCHAR(255),
    certificate_issuer VARCHAR(255),
    certificate_valid_until DATE
);

-- ============================================================================
-- AUDIT & HISTORY
-- ============================================================================

-- Checklist Activity Log
CREATE TABLE IF NOT EXISTS checklist_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instance_id UUID REFERENCES checklist_instances(id) ON DELETE CASCADE,
    template_id UUID REFERENCES checklist_templates(id) ON DELETE CASCADE,
    
    activity_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    
    -- Changes
    previous_value JSONB,
    new_value JSONB,
    
    -- Who
    performed_by UUID NOT NULL,
    performed_by_name VARCHAR(255),
    performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Context
    device_type VARCHAR(50),
    ip_address VARCHAR(50)
);

-- Template Version History
CREATE TABLE IF NOT EXISTS checklist_template_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    
    -- Snapshot
    template_data JSONB NOT NULL, -- Full template JSON at this version
    
    -- Change info
    change_description TEXT,
    changed_by UUID NOT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(template_id, version)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Categories
CREATE INDEX IF NOT EXISTS idx_checklist_categories_org ON checklist_categories(organization_id);

-- Templates
CREATE INDEX IF NOT EXISTS idx_checklist_templates_org ON checklist_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_category ON checklist_templates(category_id);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_type ON checklist_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_published ON checklist_templates(is_published);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_code ON checklist_templates(code);

-- Template sections
CREATE INDEX IF NOT EXISTS idx_template_sections_template ON checklist_template_sections(template_id);
CREATE INDEX IF NOT EXISTS idx_template_sections_order ON checklist_template_sections(template_id, display_order);

-- Template items
CREATE INDEX IF NOT EXISTS idx_template_items_template ON checklist_template_items(template_id);
CREATE INDEX IF NOT EXISTS idx_template_items_section ON checklist_template_items(section_id);
CREATE INDEX IF NOT EXISTS idx_template_items_order ON checklist_template_items(template_id, display_order);

-- Instances
CREATE INDEX IF NOT EXISTS idx_checklist_instances_template ON checklist_instances(template_id);
CREATE INDEX IF NOT EXISTS idx_checklist_instances_project ON checklist_instances(project_id);
CREATE INDEX IF NOT EXISTS idx_checklist_instances_unit ON checklist_instances(unit_id);
CREATE INDEX IF NOT EXISTS idx_checklist_instances_status ON checklist_instances(status);
CREATE INDEX IF NOT EXISTS idx_checklist_instances_assigned ON checklist_instances(assigned_to);
CREATE INDEX IF NOT EXISTS idx_checklist_instances_scheduled ON checklist_instances(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_checklist_instances_result ON checklist_instances(overall_result);
CREATE INDEX IF NOT EXISTS idx_checklist_instances_offline ON checklist_instances(offline_id) WHERE offline_id IS NOT NULL;

-- Responses
CREATE INDEX IF NOT EXISTS idx_checklist_responses_instance ON checklist_responses(instance_id);
CREATE INDEX IF NOT EXISTS idx_checklist_responses_item ON checklist_responses(template_item_id);
CREATE INDEX IF NOT EXISTS idx_checklist_responses_result ON checklist_responses(result);

-- Signatures
CREATE INDEX IF NOT EXISTS idx_checklist_signatures_instance ON checklist_signatures(instance_id);
CREATE INDEX IF NOT EXISTS idx_checklist_signatures_signer ON checklist_signatures(signer_id);

-- Activities
CREATE INDEX IF NOT EXISTS idx_checklist_activities_instance ON checklist_activities(instance_id);
CREATE INDEX IF NOT EXISTS idx_checklist_activities_template ON checklist_activities(template_id);
CREATE INDEX IF NOT EXISTS idx_checklist_activities_date ON checklist_activities(performed_at);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_checklist_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_checklist_templates_updated ON checklist_templates;
CREATE TRIGGER trg_checklist_templates_updated
    BEFORE UPDATE ON checklist_templates
    FOR EACH ROW EXECUTE FUNCTION update_checklist_timestamp();

DROP TRIGGER IF EXISTS trg_checklist_instances_updated ON checklist_instances;
CREATE TRIGGER trg_checklist_instances_updated
    BEFORE UPDATE ON checklist_instances
    FOR EACH ROW EXECUTE FUNCTION update_checklist_timestamp();

DROP TRIGGER IF EXISTS trg_checklist_responses_updated ON checklist_responses;
CREATE TRIGGER trg_checklist_responses_updated
    BEFORE UPDATE ON checklist_responses
    FOR EACH ROW EXECUTE FUNCTION update_checklist_timestamp();

-- Update instance statistics when responses change
CREATE OR REPLACE FUNCTION update_checklist_instance_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE checklist_instances SET
        completed_items = (
            SELECT COUNT(*) FROM checklist_responses 
            WHERE instance_id = COALESCE(NEW.instance_id, OLD.instance_id) 
            AND result != 'pending'
        ),
        passed_items = (
            SELECT COUNT(*) FROM checklist_responses 
            WHERE instance_id = COALESCE(NEW.instance_id, OLD.instance_id) 
            AND result = 'pass'
        ),
        failed_items = (
            SELECT COUNT(*) FROM checklist_responses 
            WHERE instance_id = COALESCE(NEW.instance_id, OLD.instance_id) 
            AND result = 'fail'
        ),
        na_items = (
            SELECT COUNT(*) FROM checklist_responses 
            WHERE instance_id = COALESCE(NEW.instance_id, OLD.instance_id) 
            AND result = 'na'
        ),
        score = (
            SELECT COALESCE(SUM(score), 0) FROM checklist_responses 
            WHERE instance_id = COALESCE(NEW.instance_id, OLD.instance_id)
        ),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = COALESCE(NEW.instance_id, OLD.instance_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_checklist_responses_stats ON checklist_responses;
CREATE TRIGGER trg_checklist_responses_stats
    AFTER INSERT OR UPDATE OR DELETE ON checklist_responses
    FOR EACH ROW EXECUTE FUNCTION update_checklist_instance_stats();

-- Auto-generate instance number
CREATE OR REPLACE FUNCTION generate_checklist_instance_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.instance_number IS NULL THEN
        NEW.instance_number := 'CHK-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' ||
            LPAD(COALESCE(
                (SELECT COUNT(*) + 1 FROM checklist_instances 
                 WHERE DATE(created_at) = CURRENT_DATE AND organization_id = NEW.organization_id),
                1
            )::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_checklist_instance_number ON checklist_instances;
CREATE TRIGGER trg_checklist_instance_number
    BEFORE INSERT ON checklist_instances
    FOR EACH ROW EXECUTE FUNCTION generate_checklist_instance_number();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Template overview with stats
CREATE OR REPLACE VIEW checklist_template_overview AS
SELECT 
    ct.*,
    cc.name as category_name,
    (SELECT COUNT(*) FROM checklist_template_sections WHERE template_id = ct.id) as section_count,
    (SELECT COUNT(*) FROM checklist_template_items WHERE template_id = ct.id) as item_count,
    (SELECT COUNT(*) FROM checklist_instances WHERE template_id = ct.id) as usage_count,
    (SELECT COUNT(*) FROM checklist_instances WHERE template_id = ct.id AND status = 'completed') as completed_count,
    (SELECT AVG(score_percentage) FROM checklist_instances WHERE template_id = ct.id AND status = 'completed') as avg_score
FROM checklist_templates ct
LEFT JOIN checklist_categories cc ON ct.category_id = cc.id;

-- Project inspection summary
CREATE OR REPLACE VIEW project_checklist_summary AS
SELECT 
    ci.project_id,
    COUNT(*) as total_inspections,
    COUNT(CASE WHEN ci.status = 'completed' THEN 1 END) as completed_inspections,
    COUNT(CASE WHEN ci.status IN ('draft', 'in_progress') THEN 1 END) as pending_inspections,
    COUNT(CASE WHEN ci.overall_result = 'pass' THEN 1 END) as passed_inspections,
    COUNT(CASE WHEN ci.overall_result = 'fail' THEN 1 END) as failed_inspections,
    COUNT(CASE WHEN ci.scheduled_date < CURRENT_DATE AND ci.status NOT IN ('completed', 'approved') THEN 1 END) as overdue_inspections,
    AVG(CASE WHEN ci.status = 'completed' THEN ci.score_percentage END) as avg_score,
    COUNT(CASE WHEN ci.status = 'pending_review' THEN 1 END) as awaiting_review
FROM checklist_instances ci
WHERE ci.project_id IS NOT NULL
GROUP BY ci.project_id;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Get complete template with sections and items
CREATE OR REPLACE FUNCTION get_checklist_template_full(p_template_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'template', row_to_json(ct.*),
        'sections', COALESCE((
            SELECT json_agg(
                json_build_object(
                    'section', row_to_json(cts.*),
                    'items', COALESCE((
                        SELECT json_agg(row_to_json(cti.*) ORDER BY cti.display_order)
                        FROM checklist_template_items cti
                        WHERE cti.section_id = cts.id
                    ), '[]'::json)
                )
                ORDER BY cts.display_order
            )
            FROM checklist_template_sections cts
            WHERE cts.template_id = ct.id
        ), '[]'::json),
        'standalone_items', COALESCE((
            SELECT json_agg(row_to_json(cti.*) ORDER BY cti.display_order)
            FROM checklist_template_items cti
            WHERE cti.template_id = ct.id AND cti.section_id IS NULL
        ), '[]'::json)
    ) INTO result
    FROM checklist_templates ct
    WHERE ct.id = p_template_id;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Get checklist instance with all responses
CREATE OR REPLACE FUNCTION get_checklist_instance_full(p_instance_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'instance', row_to_json(ci.*),
        'template', (SELECT get_checklist_template_full(ci.template_id)),
        'responses', COALESCE((
            SELECT json_agg(row_to_json(cr.*))
            FROM checklist_responses cr
            WHERE cr.instance_id = ci.id
        ), '[]'::json),
        'signatures', COALESCE((
            SELECT json_agg(row_to_json(cs.*) ORDER BY cs.signed_at)
            FROM checklist_signatures cs
            WHERE cs.instance_id = ci.id
        ), '[]'::json),
        'activities', COALESCE((
            SELECT json_agg(row_to_json(ca.*) ORDER BY ca.performed_at DESC)
            FROM checklist_activities ca
            WHERE ca.instance_id = ci.id
            LIMIT 50
        ), '[]'::json)
    ) INTO result
    FROM checklist_instances ci
    WHERE ci.id = p_instance_id;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Calculate and update instance score
CREATE OR REPLACE FUNCTION calculate_checklist_score(p_instance_id UUID)
RETURNS TABLE(score DECIMAL, max_score DECIMAL, percentage DECIMAL, result checklist_item_result) AS $$
DECLARE
    v_score DECIMAL := 0;
    v_max_score DECIMAL := 0;
    v_percentage DECIMAL := 0;
    v_result checklist_item_result := 'pending';
    v_has_critical_fail BOOLEAN := false;
    v_template_id UUID;
    v_pass_threshold DECIMAL;
BEGIN
    -- Get template info
    SELECT ci.template_id, ct.pass_threshold 
    INTO v_template_id, v_pass_threshold
    FROM checklist_instances ci
    JOIN checklist_templates ct ON ci.template_id = ct.id
    WHERE ci.id = p_instance_id;
    
    -- Calculate scores
    SELECT 
        COALESCE(SUM(cr.score), 0),
        COALESCE(SUM(cti.points), 0)
    INTO v_score, v_max_score
    FROM checklist_template_items cti
    LEFT JOIN checklist_responses cr ON cr.template_item_id = cti.id AND cr.instance_id = p_instance_id
    WHERE cti.template_id = v_template_id;
    
    -- Check for critical failures
    SELECT EXISTS (
        SELECT 1 FROM checklist_responses cr
        JOIN checklist_template_items cti ON cr.template_item_id = cti.id
        WHERE cr.instance_id = p_instance_id 
        AND cti.is_critical = true 
        AND cr.result = 'fail'
    ) INTO v_has_critical_fail;
    
    -- Calculate percentage
    IF v_max_score > 0 THEN
        v_percentage := ROUND((v_score / v_max_score) * 100, 2);
    END IF;
    
    -- Determine result
    IF v_has_critical_fail THEN
        v_result := 'fail';
    ELSIF v_percentage >= v_pass_threshold THEN
        v_result := 'pass';
    ELSIF v_percentage > 0 THEN
        v_result := 'fail';
    END IF;
    
    -- Update instance
    UPDATE checklist_instances SET
        score = v_score,
        max_possible_score = v_max_score,
        score_percentage = v_percentage,
        overall_result = v_result,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_instance_id;
    
    RETURN QUERY SELECT v_score, v_max_score, v_percentage, v_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SAMPLE DATA
-- ============================================================================

-- Insert sample categories
INSERT INTO checklist_categories (id, name, description, icon, display_order, is_active)
VALUES 
    (uuid_generate_v4(), 'Safety', 'Safety inspection checklists', 'shield', 1, true),
    (uuid_generate_v4(), 'Quality Control', 'QC inspection checklists', 'check-circle', 2, true),
    (uuid_generate_v4(), 'Pre-Drywall', 'Pre-drywall inspection items', 'layers', 3, true),
    (uuid_generate_v4(), 'Final Inspection', 'Final walkthrough checklists', 'clipboard-check', 4, true),
    (uuid_generate_v4(), 'MEP', 'Mechanical, Electrical, Plumbing', 'zap', 5, true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- GRANTS
-- ============================================================================

COMMENT ON TABLE checklist_templates IS 'Reusable inspection checklist templates';
COMMENT ON TABLE checklist_template_sections IS 'Logical groupings of checklist items';
COMMENT ON TABLE checklist_template_items IS 'Individual inspection items within templates';
COMMENT ON TABLE checklist_instances IS 'Actual filled-out checklists/inspections';
COMMENT ON TABLE checklist_responses IS 'Responses to individual checklist items';
COMMENT ON TABLE checklist_signatures IS 'Digital signatures for checklist sign-offs';
