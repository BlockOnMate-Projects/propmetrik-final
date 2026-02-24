-- Migration: 065_development_projects.sql
-- Description: Phase 5.8 Week 1 - Development Projects, Phases, and Units
-- Competitive Inspiration: Procore, Buildertrend, CoConstruct
-- Created: 2026-01-21

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Project status enum
DO $$ BEGIN
    CREATE TYPE project_status AS ENUM (
        'planning',          -- Initial planning phase
        'pre_construction',  -- Permits, approvals, design
        'under_construction', -- Active construction
        'finishing',         -- Final finishing work
        'pre_handover',      -- Punch lists, inspections
        'handover',          -- Handing over to buyers
        'completed',         -- Project fully completed
        'on_hold',           -- Temporarily paused
        'cancelled'          -- Project cancelled
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Project type enum
DO $$ BEGIN
    CREATE TYPE project_type AS ENUM (
        'residential_single',    -- Single-family homes
        'residential_multi',     -- Apartments/condos
        'mixed_use',             -- Commercial + residential
        'commercial',            -- Office/retail only
        'industrial',            -- Warehouses/factories
        'land_development',      -- Land subdivision
        'renovation'             -- Major renovation project
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Phase status enum
DO $$ BEGIN
    CREATE TYPE phase_status AS ENUM (
        'not_started',
        'in_progress',
        'delayed',
        'on_hold',
        'completed',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Unit status enum
DO $$ BEGIN
    CREATE TYPE unit_status AS ENUM (
        'available',         -- Open for sale/reservation
        'reserved',          -- Buyer has reserved (typically with deposit)
        'under_contract',    -- Contract signed, payments in progress
        'sold',              -- Fully paid, awaiting handover
        'handed_over',       -- Keys delivered to buyer
        'rented',            -- For rental units
        'not_for_sale',      -- Model units, amenities, etc.
        'on_hold'            -- Temporarily unavailable
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Unit type enum
DO $$ BEGIN
    CREATE TYPE unit_type AS ENUM (
        'studio',
        '1_bedroom',
        '2_bedroom',
        '3_bedroom',
        '4_bedroom',
        '5_plus_bedroom',
        'penthouse',
        'townhouse',
        'duplex',
        'triplex',
        'commercial_unit',
        'retail_unit',
        'office_unit',
        'parking',
        'storage',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- DEVELOPMENT PROJECTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS development_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    
    -- Project identification
    project_number VARCHAR(50) NOT NULL,  -- e.g., PRJ-2026-001
    name VARCHAR(200) NOT NULL,
    description TEXT,
    
    -- Project type and status
    project_type project_type NOT NULL DEFAULT 'residential_multi',
    status project_status NOT NULL DEFAULT 'planning',
    
    -- Location information
    address_line1 VARCHAR(200),
    address_line2 VARCHAR(100),
    city VARCHAR(100),
    region VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Ghana',
    ghana_post_gps VARCHAR(20),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    
    -- Land details
    land_size_sqm DECIMAL(12, 2),
    land_size_acres DECIMAL(10, 4),
    land_title_number VARCHAR(100),
    land_acquisition_date DATE,
    land_cost DECIMAL(15, 2),
    
    -- Project scale
    total_units INTEGER DEFAULT 0,
    total_floors INTEGER,
    total_buildings INTEGER DEFAULT 1,
    total_sqm DECIMAL(12, 2),
    
    -- Financial summary (calculated/cached)
    total_budget DECIMAL(15, 2) DEFAULT 0,
    total_spent DECIMAL(15, 2) DEFAULT 0,
    total_committed DECIMAL(15, 2) DEFAULT 0,  -- Contracted but not yet invoiced
    projected_revenue DECIMAL(15, 2) DEFAULT 0,
    actual_revenue DECIMAL(15, 2) DEFAULT 0,
    
    -- Timeline
    planned_start_date DATE,
    actual_start_date DATE,
    planned_completion_date DATE,
    estimated_completion_date DATE,
    actual_completion_date DATE,
    
    -- Progress tracking
    overall_progress DECIMAL(5, 2) DEFAULT 0,  -- 0-100%
    construction_progress DECIMAL(5, 2) DEFAULT 0,
    sales_progress DECIMAL(5, 2) DEFAULT 0,  -- % of units sold
    
    -- Permits and approvals
    building_permit_number VARCHAR(100),
    building_permit_date DATE,
    environmental_permit_number VARCHAR(100),
    fire_safety_certificate_number VARCHAR(100),
    
    -- Developer/owner info
    developer_name VARCHAR(200),
    developer_contact VARCHAR(100),
    developer_email VARCHAR(200),
    
    -- Project manager
    project_manager_id UUID,  -- Reference to users table
    
    -- Marketing
    marketing_name VARCHAR(200),  -- Public-facing name
    tagline VARCHAR(300),
    website_url VARCHAR(500),
    brochure_url VARCHAR(500),
    
    -- Images
    cover_image_url VARCHAR(500),
    logo_url VARCHAR(500),
    gallery_urls JSONB DEFAULT '[]'::jsonb,
    
    -- Amenities
    amenities JSONB DEFAULT '[]'::jsonb,  -- ["pool", "gym", "security", "parking"]
    
    -- Settings
    settings JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- CRM integration
    linked_property_id UUID,  -- Link to crm_properties if synced
    auto_create_deals BOOLEAN DEFAULT true,  -- Auto-create deals on unit sale
    default_pipeline_id UUID,
    
    -- Audit
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT unique_project_number_per_org UNIQUE (organization_id, project_number)
);

-- Indexes for development_projects
CREATE INDEX IF NOT EXISTS idx_dev_projects_org ON development_projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_dev_projects_status ON development_projects(status);
CREATE INDEX IF NOT EXISTS idx_dev_projects_type ON development_projects(project_type);
CREATE INDEX IF NOT EXISTS idx_dev_projects_manager ON development_projects(project_manager_id);
CREATE INDEX IF NOT EXISTS idx_dev_projects_location ON development_projects(city, region);
CREATE INDEX IF NOT EXISTS idx_dev_projects_dates ON development_projects(planned_start_date, planned_completion_date);
CREATE INDEX IF NOT EXISTS idx_dev_projects_deleted ON development_projects(deleted_at) WHERE deleted_at IS NULL;

-- ============================================================================
-- PROJECT PHASES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_phases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    
    -- Phase identification
    phase_number INTEGER NOT NULL,  -- Order within project
    name VARCHAR(200) NOT NULL,
    description TEXT,
    
    -- Status
    status phase_status NOT NULL DEFAULT 'not_started',
    
    -- Timeline
    planned_start_date DATE,
    actual_start_date DATE,
    planned_end_date DATE,
    estimated_end_date DATE,
    actual_end_date DATE,
    duration_days INTEGER,  -- Planned duration
    
    -- Progress
    progress DECIMAL(5, 2) DEFAULT 0,  -- 0-100%
    weight DECIMAL(5, 2) DEFAULT 1,  -- Weight for overall project progress
    
    -- Dependencies
    depends_on JSONB DEFAULT '[]'::jsonb,  -- Array of phase IDs this depends on
    
    -- Budget
    budget DECIMAL(15, 2) DEFAULT 0,
    spent DECIMAL(15, 2) DEFAULT 0,
    committed DECIMAL(15, 2) DEFAULT 0,
    
    -- Milestones within phase
    milestones JSONB DEFAULT '[]'::jsonb,
    -- Structure: [{ "name": "Foundation complete", "target_date": "2026-03-15", "completed": true, "completed_date": "2026-03-14" }]
    
    -- Responsible party
    responsible_id UUID,  -- User or contractor
    responsible_type VARCHAR(50),  -- 'user', 'contractor'
    
    -- Color for Gantt chart
    color VARCHAR(7) DEFAULT '#3B82F6',
    
    -- Notes and documentation
    notes TEXT,
    documents JSONB DEFAULT '[]'::jsonb,  -- Array of document URLs
    
    -- Audit
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_phase_number_per_project UNIQUE (project_id, phase_number)
);

-- Indexes for project_phases
CREATE INDEX IF NOT EXISTS idx_phases_project ON project_phases(project_id);
CREATE INDEX IF NOT EXISTS idx_phases_org ON project_phases(organization_id);
CREATE INDEX IF NOT EXISTS idx_phases_status ON project_phases(status);
CREATE INDEX IF NOT EXISTS idx_phases_dates ON project_phases(planned_start_date, planned_end_date);
CREATE INDEX IF NOT EXISTS idx_phases_responsible ON project_phases(responsible_id, responsible_type);

-- ============================================================================
-- PROJECT UNITS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    
    -- Unit identification
    unit_number VARCHAR(50) NOT NULL,  -- e.g., "A-101", "Block B Unit 5"
    unit_code VARCHAR(50),  -- Internal code
    
    -- Location within project
    building VARCHAR(50),  -- Building name/number
    floor INTEGER,
    block VARCHAR(50),
    
    -- Unit type and status
    unit_type unit_type NOT NULL DEFAULT 'other',
    status unit_status NOT NULL DEFAULT 'available',
    
    -- Physical attributes
    bedrooms INTEGER DEFAULT 0,
    bathrooms DECIMAL(3, 1) DEFAULT 0,
    half_baths INTEGER DEFAULT 0,
    internal_sqm DECIMAL(10, 2),
    external_sqm DECIMAL(10, 2),  -- Balcony, terrace
    total_sqm DECIMAL(10, 2),
    
    -- Pricing
    list_price DECIMAL(15, 2),
    sale_price DECIMAL(15, 2),  -- Actual sale price
    price_per_sqm DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'GHS',
    
    -- Price breakdown (Ghana-specific)
    base_price DECIMAL(15, 2),
    finishing_upgrade_cost DECIMAL(15, 2) DEFAULT 0,
    parking_cost DECIMAL(15, 2) DEFAULT 0,
    storage_cost DECIMAL(15, 2) DEFAULT 0,
    other_costs DECIMAL(15, 2) DEFAULT 0,
    
    -- Upgrades/selections (Buildertrend-style)
    selected_upgrades JSONB DEFAULT '[]'::jsonb,
    -- Structure: [{ "category": "Kitchen", "item": "Granite countertops", "price": 5000, "selected_at": "..." }]
    
    -- Buyer information
    buyer_id UUID,  -- Reference to contacts
    buyer_name VARCHAR(200),
    buyer_phone VARCHAR(50),
    buyer_email VARCHAR(200),
    
    -- Sales status
    reserved_at TIMESTAMP WITH TIME ZONE,
    reserved_by UUID,  -- Agent who made reservation
    contract_date DATE,
    handover_date DATE,
    
    -- Payment tracking
    total_paid DECIMAL(15, 2) DEFAULT 0,
    payment_percentage DECIMAL(5, 2) DEFAULT 0,
    payment_plan_id UUID,  -- Reference to buyer_payment_plans
    
    -- CRM integration
    deal_id UUID,  -- Linked deal
    
    -- Features
    features JSONB DEFAULT '[]'::jsonb,  -- ["corner unit", "sea view", "private garden"]
    
    -- Floor plan and images
    floor_plan_url VARCHAR(500),
    images JSONB DEFAULT '[]'::jsonb,
    virtual_tour_url VARCHAR(500),
    
    -- Notes
    notes TEXT,
    internal_notes TEXT,  -- Not visible to buyers
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Audit
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_unit_number_per_project UNIQUE (project_id, unit_number)
);

-- Indexes for project_units
CREATE INDEX IF NOT EXISTS idx_units_project ON project_units(project_id);
CREATE INDEX IF NOT EXISTS idx_units_org ON project_units(organization_id);
CREATE INDEX IF NOT EXISTS idx_units_status ON project_units(status);
CREATE INDEX IF NOT EXISTS idx_units_type ON project_units(unit_type);
CREATE INDEX IF NOT EXISTS idx_units_building ON project_units(project_id, building, floor);
CREATE INDEX IF NOT EXISTS idx_units_buyer ON project_units(buyer_id);
CREATE INDEX IF NOT EXISTS idx_units_deal ON project_units(deal_id);
CREATE INDEX IF NOT EXISTS idx_units_price ON project_units(list_price);
CREATE INDEX IF NOT EXISTS idx_units_bedrooms ON project_units(bedrooms);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Project summary view
CREATE OR REPLACE VIEW v_project_summary AS
SELECT 
    p.id,
    p.organization_id,
    p.project_number,
    p.name,
    p.project_type,
    p.status,
    p.city,
    p.region,
    p.total_units,
    p.total_budget,
    p.total_spent,
    p.total_committed,
    p.projected_revenue,
    p.actual_revenue,
    p.overall_progress,
    p.construction_progress,
    p.sales_progress,
    p.planned_start_date,
    p.planned_completion_date,
    p.cover_image_url,
    
    -- Unit counts
    COUNT(DISTINCT u.id) FILTER (WHERE u.status = 'available') AS units_available,
    COUNT(DISTINCT u.id) FILTER (WHERE u.status = 'reserved') AS units_reserved,
    COUNT(DISTINCT u.id) FILTER (WHERE u.status = 'under_contract') AS units_under_contract,
    COUNT(DISTINCT u.id) FILTER (WHERE u.status = 'sold') AS units_sold,
    COUNT(DISTINCT u.id) FILTER (WHERE u.status = 'handed_over') AS units_handed_over,
    COUNT(DISTINCT u.id) AS units_total,
    
    -- Phase counts
    COUNT(DISTINCT ph.id) FILTER (WHERE ph.status = 'completed') AS phases_completed,
    COUNT(DISTINCT ph.id) AS phases_total,
    
    -- Financial calculations
    COALESCE(SUM(u.sale_price) FILTER (WHERE u.status IN ('sold', 'handed_over', 'under_contract')), 0) AS total_contracted_revenue,
    COALESCE(SUM(u.total_paid), 0) AS total_collected,
    
    -- Days calculation
    CASE 
        WHEN p.planned_completion_date IS NOT NULL THEN 
            p.planned_completion_date - CURRENT_DATE
        ELSE NULL
    END AS days_to_completion,
    
    p.created_at,
    p.updated_at
FROM development_projects p
LEFT JOIN project_units u ON u.project_id = p.id
LEFT JOIN project_phases ph ON ph.project_id = p.id
WHERE p.deleted_at IS NULL
GROUP BY p.id;

-- Unit availability view
CREATE OR REPLACE VIEW v_unit_availability AS
SELECT 
    u.id,
    u.project_id,
    p.name AS project_name,
    p.project_number,
    u.unit_number,
    u.building,
    u.floor,
    u.unit_type,
    u.status,
    u.bedrooms,
    u.bathrooms,
    u.total_sqm,
    u.list_price,
    u.sale_price,
    u.price_per_sqm,
    u.buyer_name,
    u.payment_percentage,
    u.features,
    u.floor_plan_url,
    u.images,
    u.organization_id,
    CASE 
        WHEN u.status = 'available' THEN 'For Sale'
        WHEN u.status = 'reserved' THEN 'Reserved'
        WHEN u.status = 'under_contract' THEN 'Under Contract'
        WHEN u.status = 'sold' THEN 'Sold'
        WHEN u.status = 'handed_over' THEN 'Handed Over'
        ELSE u.status::text
    END AS status_display
FROM project_units u
JOIN development_projects p ON p.id = u.project_id
WHERE p.deleted_at IS NULL;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to generate project number
CREATE OR REPLACE FUNCTION generate_project_number(org_id UUID)
RETURNS VARCHAR(50) AS $$
DECLARE
    current_year TEXT;
    sequence_num INTEGER;
    new_number VARCHAR(50);
BEGIN
    current_year := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
    
    -- Get the next sequence number for this org and year
    SELECT COALESCE(MAX(
        CASE 
            WHEN project_number ~ ('^PRJ-' || current_year || '-[0-9]+$')
            THEN SUBSTRING(project_number FROM 'PRJ-' || current_year || '-([0-9]+)')::INTEGER
            ELSE 0
        END
    ), 0) + 1
    INTO sequence_num
    FROM development_projects
    WHERE organization_id = org_id
    AND project_number LIKE 'PRJ-' || current_year || '-%';
    
    new_number := 'PRJ-' || current_year || '-' || LPAD(sequence_num::TEXT, 3, '0');
    
    RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Function to update project progress based on phases
CREATE OR REPLACE FUNCTION update_project_progress()
RETURNS TRIGGER AS $$
DECLARE
    total_weighted_progress DECIMAL(10, 4);
    total_weight DECIMAL(10, 4);
    new_progress DECIMAL(5, 2);
BEGIN
    -- Calculate weighted average of phase progress
    SELECT 
        COALESCE(SUM(progress * weight), 0),
        COALESCE(SUM(weight), 1)
    INTO total_weighted_progress, total_weight
    FROM project_phases
    WHERE project_id = COALESCE(NEW.project_id, OLD.project_id);
    
    IF total_weight > 0 THEN
        new_progress := total_weighted_progress / total_weight;
    ELSE
        new_progress := 0;
    END IF;
    
    -- Update project progress
    UPDATE development_projects
    SET 
        construction_progress = new_progress,
        overall_progress = new_progress,  -- Can be adjusted with sales progress
        updated_at = NOW()
    WHERE id = COALESCE(NEW.project_id, OLD.project_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update project progress
DROP TRIGGER IF EXISTS trg_update_project_progress ON project_phases;
CREATE TRIGGER trg_update_project_progress
AFTER INSERT OR UPDATE OR DELETE ON project_phases
FOR EACH ROW
EXECUTE FUNCTION update_project_progress();

-- Function to update project sales progress
CREATE OR REPLACE FUNCTION update_sales_progress()
RETURNS TRIGGER AS $$
DECLARE
    total_units INTEGER;
    sold_units INTEGER;
    new_sales_progress DECIMAL(5, 2);
    new_revenue DECIMAL(15, 2);
    projected DECIMAL(15, 2);
BEGIN
    -- Count units
    SELECT 
        COUNT(*) FILTER (WHERE status NOT IN ('not_for_sale')),
        COUNT(*) FILTER (WHERE status IN ('sold', 'handed_over', 'under_contract'))
    INTO total_units, sold_units
    FROM project_units
    WHERE project_id = COALESCE(NEW.project_id, OLD.project_id);
    
    -- Calculate sales progress
    IF total_units > 0 THEN
        new_sales_progress := (sold_units::DECIMAL / total_units) * 100;
    ELSE
        new_sales_progress := 0;
    END IF;
    
    -- Calculate revenue
    SELECT 
        COALESCE(SUM(COALESCE(sale_price, list_price)) FILTER (WHERE status IN ('sold', 'handed_over', 'under_contract')), 0),
        COALESCE(SUM(list_price), 0)
    INTO new_revenue, projected
    FROM project_units
    WHERE project_id = COALESCE(NEW.project_id, OLD.project_id)
    AND status NOT IN ('not_for_sale');
    
    -- Update project
    UPDATE development_projects
    SET 
        sales_progress = new_sales_progress,
        actual_revenue = new_revenue,
        projected_revenue = projected,
        updated_at = NOW()
    WHERE id = COALESCE(NEW.project_id, OLD.project_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update sales progress
DROP TRIGGER IF EXISTS trg_update_sales_progress ON project_units;
CREATE TRIGGER trg_update_sales_progress
AFTER INSERT OR UPDATE OR DELETE ON project_units
FOR EACH ROW
EXECUTE FUNCTION update_sales_progress();

-- Function to update unit count on project
CREATE OR REPLACE FUNCTION update_project_unit_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE development_projects
    SET 
        total_units = (
            SELECT COUNT(*) 
            FROM project_units 
            WHERE project_id = COALESCE(NEW.project_id, OLD.project_id)
        ),
        updated_at = NOW()
    WHERE id = COALESCE(NEW.project_id, OLD.project_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger for unit count
DROP TRIGGER IF EXISTS trg_update_project_unit_count ON project_units;
CREATE TRIGGER trg_update_project_unit_count
AFTER INSERT OR DELETE ON project_units
FOR EACH ROW
EXECUTE FUNCTION update_project_unit_count();

-- ============================================================================
-- SEED DATA: Default Phase Templates
-- ============================================================================

-- Phase templates table for quick project setup
CREATE TABLE IF NOT EXISTS project_phase_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,  -- NULL for system templates
    
    template_name VARCHAR(100) NOT NULL,
    project_type project_type,
    
    phases JSONB NOT NULL,
    -- Structure: [{ "phase_number": 1, "name": "Site Preparation", "weight": 5, "duration_days": 30, "color": "#..." }]
    
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default construction phase template
INSERT INTO project_phase_templates (id, template_name, project_type, phases, is_system)
VALUES 
(
    gen_random_uuid(),
    'Standard Residential Construction',
    'residential_multi',
    '[
        {"phase_number": 1, "name": "Site Preparation & Excavation", "weight": 5, "duration_days": 21, "color": "#78716C"},
        {"phase_number": 2, "name": "Foundation", "weight": 10, "duration_days": 30, "color": "#A3A3A3"},
        {"phase_number": 3, "name": "Structural Frame", "weight": 20, "duration_days": 60, "color": "#3B82F6"},
        {"phase_number": 4, "name": "Roofing", "weight": 10, "duration_days": 21, "color": "#8B5CF6"},
        {"phase_number": 5, "name": "Mechanical, Electrical & Plumbing (MEP)", "weight": 15, "duration_days": 45, "color": "#F59E0B"},
        {"phase_number": 6, "name": "Exterior Finishing", "weight": 10, "duration_days": 30, "color": "#10B981"},
        {"phase_number": 7, "name": "Interior Finishing", "weight": 20, "duration_days": 60, "color": "#EC4899"},
        {"phase_number": 8, "name": "Landscaping & External Works", "weight": 5, "duration_days": 21, "color": "#22C55E"},
        {"phase_number": 9, "name": "Punch List & Inspection", "weight": 3, "duration_days": 14, "color": "#EF4444"},
        {"phase_number": 10, "name": "Handover", "weight": 2, "duration_days": 7, "color": "#14B8A6"}
    ]'::jsonb,
    true
),
(
    gen_random_uuid(),
    'Single Family Home',
    'residential_single',
    '[
        {"phase_number": 1, "name": "Site Work & Foundation", "weight": 15, "duration_days": 30, "color": "#78716C"},
        {"phase_number": 2, "name": "Framing & Roofing", "weight": 20, "duration_days": 21, "color": "#3B82F6"},
        {"phase_number": 3, "name": "MEP Rough-In", "weight": 15, "duration_days": 14, "color": "#F59E0B"},
        {"phase_number": 4, "name": "Insulation & Drywall", "weight": 10, "duration_days": 14, "color": "#A3A3A3"},
        {"phase_number": 5, "name": "Interior Finishing", "weight": 25, "duration_days": 30, "color": "#EC4899"},
        {"phase_number": 6, "name": "Exterior Finishing", "weight": 10, "duration_days": 14, "color": "#10B981"},
        {"phase_number": 7, "name": "Final Inspection & Handover", "weight": 5, "duration_days": 7, "color": "#14B8A6"}
    ]'::jsonb,
    true
),
(
    gen_random_uuid(),
    'Land Development',
    'land_development',
    '[
        {"phase_number": 1, "name": "Survey & Planning", "weight": 15, "duration_days": 30, "color": "#3B82F6"},
        {"phase_number": 2, "name": "Permits & Approvals", "weight": 10, "duration_days": 60, "color": "#F59E0B"},
        {"phase_number": 3, "name": "Site Clearing", "weight": 10, "duration_days": 14, "color": "#78716C"},
        {"phase_number": 4, "name": "Roads & Infrastructure", "weight": 30, "duration_days": 60, "color": "#A3A3A3"},
        {"phase_number": 5, "name": "Utilities Installation", "weight": 20, "duration_days": 45, "color": "#10B981"},
        {"phase_number": 6, "name": "Plot Demarcation", "weight": 10, "duration_days": 14, "color": "#8B5CF6"},
        {"phase_number": 7, "name": "Final Inspection", "weight": 5, "duration_days": 7, "color": "#14B8A6"}
    ]'::jsonb,
    true
)
ON CONFLICT DO NOTHING;

-- Index for phase templates
CREATE INDEX IF NOT EXISTS idx_phase_templates_org ON project_phase_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_phase_templates_type ON project_phase_templates(project_type);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE development_projects IS 'Development/construction projects with full lifecycle tracking (Procore-inspired)';
COMMENT ON TABLE project_phases IS 'Construction phases with milestones, dependencies, and progress tracking';
COMMENT ON TABLE project_units IS 'Individual units within a development project with sales and buyer tracking';
COMMENT ON TABLE project_phase_templates IS 'Reusable phase templates for quick project setup';

COMMENT ON COLUMN development_projects.total_committed IS 'Contracted costs not yet invoiced - important for Procore-style budget tracking';
COMMENT ON COLUMN project_phases.weight IS 'Relative weight for calculating overall project progress';
COMMENT ON COLUMN project_phases.depends_on IS 'Array of phase IDs that must complete before this phase can start';
COMMENT ON COLUMN project_units.selected_upgrades IS 'Buildertrend-style buyer selections and upgrades';
