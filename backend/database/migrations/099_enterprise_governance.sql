-- Migration: 099_enterprise_governance.sql
-- Description: Enterprise governance model for project management
-- Phase 1.1: Database migrations for milestone frameworks, templates, approvals
--
-- This migration creates the enterprise governance structure where:
-- 1. Admin defines milestone frameworks and templates (organization-wide standards)
-- 2. Projects apply frameworks, creating concrete phases and milestones
-- 3. PMs work within the defined structure, requesting changes via approvals
-- 4. Clients approve major milestones and structural changes

BEGIN;

-- =============================================================================
-- MILESTONE FRAMEWORKS (Admin-defined organizational standards)
-- =============================================================================

-- Frameworks are organization-level templates for project structure
CREATE TABLE IF NOT EXISTS pm_milestone_frameworks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Framework identification
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50), -- e.g., "GH-RES-STD" for Ghana Residential Standard
    description TEXT,
    
    -- Categorization
    project_type VARCHAR(100) NOT NULL, -- residential, commercial, mixed_use, etc.
    region VARCHAR(100), -- Optional: region-specific frameworks (e.g., "Greater Accra")
    
    -- Version control
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    is_locked BOOLEAN DEFAULT false, -- Locked when in use by active projects
    locked_at TIMESTAMP WITH TIME ZONE,
    locked_by UUID REFERENCES users(id),
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT unique_framework_name_org UNIQUE (organization_id, name, version)
);

-- Index for common queries
CREATE INDEX idx_milestone_frameworks_org ON pm_milestone_frameworks(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_milestone_frameworks_type ON pm_milestone_frameworks(project_type, is_active) WHERE deleted_at IS NULL;

-- =============================================================================
-- FRAMEWORK PHASES (Standard phases within a framework)
-- =============================================================================

-- Phases are the high-level structure defined in a framework
CREATE TABLE IF NOT EXISTS pm_framework_phases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    framework_id UUID NOT NULL REFERENCES pm_milestone_frameworks(id) ON DELETE CASCADE,
    
    -- Phase definition
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50), -- e.g., "FNDTN" for Foundation
    description TEXT,
    
    -- Ordering
    sequence_order INTEGER NOT NULL,
    
    -- Default timing (in days)
    default_duration_days INTEGER,
    buffer_days INTEGER DEFAULT 0,
    
    -- Phase configuration
    is_required BOOLEAN DEFAULT true,
    can_overlap_previous BOOLEAN DEFAULT false, -- Can this phase start before previous ends?
    max_overlap_percentage INTEGER DEFAULT 0, -- If overlap allowed, how much?
    
    -- Milestone type restrictions (which milestone types are allowed in this phase)
    allowed_milestone_types TEXT[], -- e.g., ['foundation', 'inspection', 'payment']
    required_milestone_types TEXT[], -- Must have at least one of these
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    
    CONSTRAINT unique_phase_sequence UNIQUE (framework_id, sequence_order),
    CONSTRAINT unique_phase_name UNIQUE (framework_id, name)
);

CREATE INDEX idx_framework_phases_framework ON pm_framework_phases(framework_id);

-- =============================================================================
-- MILESTONE TEMPLATES (Standard milestones within a phase)
-- =============================================================================

-- Templates define what milestones should exist in each phase
CREATE TABLE IF NOT EXISTS pm_milestone_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    framework_phase_id UUID NOT NULL REFERENCES pm_framework_phases(id) ON DELETE CASCADE,
    
    -- Milestone definition
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50), -- e.g., "FNDTN-INSP-1"
    description TEXT,
    milestone_type VARCHAR(100) NOT NULL, -- inspection, payment, approval, compliance, etc.
    
    -- Ordering within phase
    sequence_order INTEGER NOT NULL,
    
    -- Timing relative to phase
    default_day_offset INTEGER DEFAULT 0, -- Days from phase start
    default_duration_days INTEGER DEFAULT 1,
    
    -- Requirements
    is_required BOOLEAN DEFAULT true,
    requires_client_approval BOOLEAN DEFAULT false,
    requires_inspection BOOLEAN DEFAULT false,
    requires_documentation BOOLEAN DEFAULT false,
    
    -- Financial linkage
    payment_percentage NUMERIC(5,2), -- If payment milestone, what % of phase budget?
    
    -- Compliance requirements
    compliance_type VARCHAR(100), -- gra_tax, ssnit, building_permit, etc.
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    
    CONSTRAINT unique_milestone_sequence UNIQUE (framework_phase_id, sequence_order)
);

CREATE INDEX idx_milestone_templates_phase ON pm_milestone_templates(framework_phase_id);

-- =============================================================================
-- PROJECT FRAMEWORK APPLICATION (Links project to its framework)
-- =============================================================================

-- Tracks which framework a project is using
CREATE TABLE IF NOT EXISTS pm_project_framework_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    framework_id UUID NOT NULL REFERENCES pm_milestone_frameworks(id),
    framework_version INTEGER NOT NULL, -- Snapshot of version at application time
    
    -- Application status
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    applied_by UUID REFERENCES users(id),
    
    -- Deviation tracking
    has_deviations BOOLEAN DEFAULT false,
    deviation_notes TEXT,
    approved_deviations_by UUID REFERENCES users(id),
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_project_framework UNIQUE (project_id)
);

CREATE INDEX idx_project_framework_project ON pm_project_framework_applications(project_id);
CREATE INDEX idx_project_framework_framework ON pm_project_framework_applications(framework_id);

-- =============================================================================
-- APPROVAL REQUESTS (PM requests changes, Admin/Client approves)
-- =============================================================================

CREATE TABLE IF NOT EXISTS pm_approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    
    -- Request details
    request_type VARCHAR(100) NOT NULL, -- phase_extension, budget_change, milestone_skip, structure_change, etc.
    title VARCHAR(255) NOT NULL,
    description TEXT,
    justification TEXT,
    
    -- What entity is being changed?
    entity_type VARCHAR(100) NOT NULL, -- phase, milestone, budget, project
    entity_id UUID NOT NULL,
    
    -- Proposed changes (stored as JSON)
    current_state JSONB,
    proposed_state JSONB,
    
    -- Impact assessment
    impact_summary TEXT,
    budget_impact NUMERIC(15,2) DEFAULT 0,
    schedule_impact_days INTEGER DEFAULT 0,
    
    -- Status workflow
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, under_review, approved, rejected, withdrawn
    priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent
    
    -- Request tracking
    requested_by UUID NOT NULL REFERENCES users(id),
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Review tracking
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    review_notes TEXT,
    
    -- Multi-level approvals
    requires_client_approval BOOLEAN DEFAULT false,
    client_approved BOOLEAN,
    client_approved_by UUID REFERENCES users(id),
    client_approved_at TIMESTAMP WITH TIME ZONE,
    client_notes TEXT,
    
    -- Expiration
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_approval_requests_project ON pm_approval_requests(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_approval_requests_status ON pm_approval_requests(status, organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_approval_requests_type ON pm_approval_requests(request_type, status) WHERE deleted_at IS NULL;

-- =============================================================================
-- APPROVAL COMMENTS (Discussion on approval requests)
-- =============================================================================

CREATE TABLE IF NOT EXISTS pm_approval_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_request_id UUID NOT NULL REFERENCES pm_approval_requests(id) ON DELETE CASCADE,
    
    -- Comment content
    comment TEXT NOT NULL,
    
    -- Attachments
    attachments JSONB, -- Array of file references
    
    -- Author
    author_id UUID NOT NULL REFERENCES users(id),
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_approval_comments_request ON pm_approval_comments(approval_request_id) WHERE deleted_at IS NULL;

-- =============================================================================
-- COMPLIANCE CHECKPOINTS (Required regulatory/internal gates)
-- =============================================================================

CREATE TABLE IF NOT EXISTS pm_compliance_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    phase_id UUID REFERENCES project_phases(id) ON DELETE SET NULL,
    milestone_id UUID REFERENCES project_milestones(id) ON DELETE SET NULL,
    
    -- Checkpoint definition
    name VARCHAR(255) NOT NULL,
    checkpoint_type VARCHAR(100) NOT NULL, -- gra_tax, ssnit, building_permit, environmental, fire_safety, etc.
    description TEXT,
    
    -- Requirements
    is_mandatory BOOLEAN DEFAULT true,
    blocking BOOLEAN DEFAULT true, -- If true, blocks phase/milestone completion
    
    -- Documentation requirements
    required_documents TEXT[], -- List of required document types
    document_urls JSONB, -- Uploaded document references
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, in_progress, passed, failed, waived
    
    -- Verification
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMP WITH TIME ZONE,
    verification_notes TEXT,
    
    -- External references (for regulatory compliance)
    external_reference VARCHAR(255), -- Permit number, certificate number, etc.
    external_url VARCHAR(500),
    
    -- Expiration (for permits that expire)
    valid_from DATE,
    valid_until DATE,
    
    -- Ghana-specific fields
    gra_tin VARCHAR(50), -- GRA TIN for tax-related checkpoints
    ssnit_number VARCHAR(50), -- SSNIT employer number
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_compliance_checkpoints_project ON pm_compliance_checkpoints(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_compliance_checkpoints_phase ON pm_compliance_checkpoints(phase_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_compliance_checkpoints_status ON pm_compliance_checkpoints(status, checkpoint_type) WHERE deleted_at IS NULL;

-- =============================================================================
-- PHASE LOCKS (Track when phases are locked/unlocked)
-- =============================================================================

CREATE TABLE IF NOT EXISTS pm_phase_locks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phase_id UUID NOT NULL REFERENCES project_phases(id) ON DELETE CASCADE,
    
    -- Lock action
    action VARCHAR(20) NOT NULL, -- 'lock' or 'unlock'
    reason TEXT,
    
    -- Actor
    locked_by UUID NOT NULL REFERENCES users(id),
    locked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Approval reference (if unlock was via approval request)
    approval_request_id UUID REFERENCES pm_approval_requests(id),
    
    CONSTRAINT valid_lock_action CHECK (action IN ('lock', 'unlock'))
);

CREATE INDEX idx_phase_locks_phase ON pm_phase_locks(phase_id);

-- =============================================================================
-- ADD COLUMNS TO EXISTING TABLES
-- =============================================================================

-- Add governance fields to project_phases
ALTER TABLE project_phases 
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS lock_reason TEXT,
ADD COLUMN IF NOT EXISTS framework_phase_id UUID REFERENCES pm_framework_phases(id),
ADD COLUMN IF NOT EXISTS can_be_modified_by_pm BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS requires_approval_for_dates BOOLEAN DEFAULT false;

-- Add governance fields to project_milestones
ALTER TABLE project_milestones
ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES pm_milestone_templates(id),
ADD COLUMN IF NOT EXISTS requires_client_approval BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS client_approved BOOLEAN,
ADD COLUMN IF NOT EXISTS client_approved_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS client_approved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_from_template BOOLEAN DEFAULT false;

-- =============================================================================
-- AUDIT LOG FOR GOVERNANCE ACTIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS pm_governance_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES development_projects(id) ON DELETE CASCADE,
    
    -- Action details
    action_type VARCHAR(100) NOT NULL, -- framework_applied, phase_locked, approval_granted, etc.
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    
    -- Change details
    previous_state JSONB,
    new_state JSONB,
    
    -- Actor
    performed_by UUID NOT NULL REFERENCES users(id),
    performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Additional context
    ip_address INET,
    user_agent TEXT,
    notes TEXT
);

CREATE INDEX idx_governance_audit_project ON pm_governance_audit_log(project_id, performed_at DESC);
CREATE INDEX idx_governance_audit_action ON pm_governance_audit_log(action_type, performed_at DESC);

-- =============================================================================
-- SEED DEFAULT FRAMEWORKS (Ghana Construction Standards)
-- =============================================================================

-- Create a default residential framework for Ghana
INSERT INTO pm_milestone_frameworks (
    id, 
    organization_id, 
    name, 
    code, 
    description, 
    project_type, 
    region,
    version
)
SELECT 
    gen_random_uuid(),
    o.id,
    'Ghana Residential Standard',
    'GH-RES-STD',
    'Standard framework for residential construction projects in Ghana. Includes all regulatory compliance checkpoints for GRA, SSNIT, and building permits.',
    'residential',
    NULL,
    1
FROM organizations o
WHERE o.id IN (SELECT DISTINCT organization_id FROM development_projects)
ON CONFLICT DO NOTHING;

COMMIT;

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE pm_milestone_frameworks IS 'Organization-level templates for project structure, defined by admins';
COMMENT ON TABLE pm_framework_phases IS 'Standard phases within a framework, defines allowed milestone types and timing';
COMMENT ON TABLE pm_milestone_templates IS 'Standard milestones within a phase, including compliance and payment requirements';
COMMENT ON TABLE pm_approval_requests IS 'Workflow for PMs to request structural changes that require admin/client approval';
COMMENT ON TABLE pm_compliance_checkpoints IS 'Regulatory and internal compliance gates that must be passed before project can proceed';
COMMENT ON TABLE pm_phase_locks IS 'Audit trail for phase lock/unlock actions';
COMMENT ON TABLE pm_governance_audit_log IS 'Complete audit trail for all governance-related actions';
