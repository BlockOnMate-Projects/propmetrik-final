-- Migration: 077_project_drafts.sql
-- Phase 1 Sprint 2: Project Creation Wizard Draft Persistence
-- 
-- This migration creates the project_drafts table to support the multi-step
-- project creation wizard with auto-save functionality.

-- ============================================================================
-- 1. Project Drafts Table
-- ============================================================================
-- Stores in-progress project creation wizard data with auto-save support

CREATE TABLE IF NOT EXISTS project_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  
  -- Owner tracking
  created_by UUID NOT NULL,
  last_edited_by UUID,
  
  -- Draft metadata
  draft_name VARCHAR(255), -- Auto-generated or user-provided
  draft_type VARCHAR(50) DEFAULT 'new_project', -- 'new_project', 'clone', 'template'
  source_project_id UUID, -- If cloned from existing project
  source_template_id UUID, -- If created from template
  
  -- Wizard progress
  current_step INTEGER DEFAULT 1,
  total_steps INTEGER DEFAULT 5,
  completed_steps INTEGER[] DEFAULT '{}',
  
  -- Step data (JSONB for each wizard step)
  step_data JSONB DEFAULT '{}'::jsonb,
  /*
   Expected structure:
   {
     "step1_basics": {
       "name": "Project Name",
       "project_type": "residential_multi",
       "description": "...",
       "completed_at": "2024-01-15T10:30:00Z"
     },
     "step2_location": {
       "ghana_post_gps": "GA-123-4567",
       "validated_address": { ... from ghanaPostService ... },
       "latitude": 5.6037,
       "longitude": -0.1870,
       "ghana_region": "Greater Accra",
       "ghana_district": "Accra Metropolitan",
       "completed_at": "2024-01-15T10:35:00Z"
     },
     "step3_land": {
       "land_size_sqm": 4046.86,
       "land_tenure_type": "leasehold",
       "land_cost": 500000,
       "land_cost_currency": "USD",
       "traditional_authority_id": null,
       "completed_at": "2024-01-15T10:40:00Z"
     },
     "step4_scope": {
       "total_units": 48,
       "total_floors": 8,
       "total_buildings": 1,
       "unit_mix": [ ... ],
       "amenities": ["gym", "pool", "parking"],
       "completed_at": "2024-01-15T10:45:00Z"
     },
     "step5_budget": {
       "total_budget": 5000000,
       "budget_currency": "USD",
       "funding_sources": [ ... ],
       "estimated_costs": { ... from constructionCostService ... },
       "completed_at": "2024-01-15T10:50:00Z"
     }
   }
  */
  
  -- Validation tracking
  validation_results JSONB DEFAULT '{}'::jsonb,
  /*
   Expected structure:
   {
     "step1_basics": { "valid": true, "errors": [], "validated_at": "..." },
     "step2_location": { 
       "valid": true, 
       "errors": [], 
       "gps_validated": true,
       "address_enriched": true,
       "validated_at": "..." 
     },
     ...
   }
  */
  
  -- Auto-save tracking
  last_auto_save_at TIMESTAMP,
  auto_save_count INTEGER DEFAULT 0,
  
  -- Draft status
  status VARCHAR(50) DEFAULT 'in_progress',
  -- 'in_progress', 'validation_pending', 'ready_to_submit', 'submitted', 'abandoned', 'expired'
  
  -- Completion tracking
  submitted_at TIMESTAMP,
  created_project_id UUID, -- Populated after successful submission
  
  -- Expiration (drafts auto-expire after 30 days of inactivity)
  expires_at TIMESTAMP,
  
  -- Soft delete
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP,
  
  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2. Indexes
-- ============================================================================

-- Primary lookup: drafts by user
CREATE INDEX IF NOT EXISTS idx_project_drafts_user 
  ON project_drafts(created_by, organization_id);

-- Active drafts (not deleted, not expired)
CREATE INDEX IF NOT EXISTS idx_project_drafts_active 
  ON project_drafts(organization_id, status) 
  WHERE is_deleted = false AND status IN ('in_progress', 'ready_to_submit');

-- Expiration cleanup
CREATE INDEX IF NOT EXISTS idx_project_drafts_expiration 
  ON project_drafts(expires_at) 
  WHERE expires_at IS NOT NULL AND status = 'in_progress';

-- Recent drafts for dashboard
CREATE INDEX IF NOT EXISTS idx_project_drafts_recent 
  ON project_drafts(organization_id, updated_at DESC) 
  WHERE is_deleted = false;

-- ============================================================================
-- 3. Wizard Step Templates
-- ============================================================================
-- Reusable templates for common project types

CREATE TABLE IF NOT EXISTS project_wizard_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  organization_id UUID, -- NULL for system-wide templates
  
  -- Template identification
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50), -- e.g., 'residential_apartment', 'commercial_office'
  description TEXT,
  
  -- Which project type this template is for
  project_type VARCHAR(50) NOT NULL,
  
  -- Pre-filled step data
  default_step_data JSONB DEFAULT '{}'::jsonb,
  /*
   Example for apartment complex:
   {
     "step4_scope": {
       "default_amenities": ["lobby", "elevators", "parking", "gym"],
       "suggested_unit_types": ["studio", "1BR", "2BR", "3BR"]
     },
     "step5_budget": {
       "default_cost_categories": [ ... from projectDefaults ... ]
     }
   }
  */
  
  -- Default phase template to use
  phase_template_id UUID,
  
  -- Default cost structure
  default_cost_categories JSONB DEFAULT '[]'::jsonb,
  
  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  
  -- Ordering and visibility
  display_order INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  -- Audit
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Unique template code per organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_wizard_template_code 
  ON project_wizard_templates(organization_id, code) 
  WHERE code IS NOT NULL;

-- Active templates for selection
CREATE INDEX IF NOT EXISTS idx_wizard_templates_active 
  ON project_wizard_templates(organization_id, project_type, is_active) 
  WHERE is_active = true;

-- ============================================================================
-- 4. Seed Default Wizard Templates
-- ============================================================================

INSERT INTO project_wizard_templates (
  organization_id, name, code, description, project_type, 
  default_step_data, is_featured, display_order
) VALUES
  -- Residential Apartment Complex
  (NULL, 'Apartment Complex', 'apartment_complex', 
   'Multi-story residential building with multiple units per floor', 
   'residential_multi',
   '{
     "step4_scope": {
       "suggested_unit_types": ["Studio", "1BR", "2BR", "3BR", "Penthouse"],
       "default_amenities": ["Lobby", "Elevators", "Parking", "Security", "Generator Backup", "Water Storage"]
     },
     "step5_budget": {
       "budget_allocation_guide": {
         "land_acquisition": 20,
         "construction": 55,
         "permits_approvals": 3,
         "professional_fees": 8,
         "marketing": 4,
         "contingency": 10
       }
     }
   }'::jsonb, 
   true, 1),
   
  -- Gated Community
  (NULL, 'Gated Community', 'gated_community', 
   'Standalone houses in a secure gated estate with shared amenities', 
   'residential_multi',
   '{
     "step4_scope": {
       "suggested_unit_types": ["3BR Townhouse", "4BR Detached", "5BR Executive"],
       "default_amenities": ["Gated Entry", "Security Post", "Club House", "Swimming Pool", "Tennis Court", "Children''s Playground", "Green Spaces"]
     },
     "step5_budget": {
       "budget_allocation_guide": {
         "land_acquisition": 25,
         "infrastructure": 15,
         "construction": 45,
         "permits_approvals": 2,
         "professional_fees": 5,
         "landscaping": 3,
         "contingency": 5
       }
     }
   }'::jsonb, 
   true, 2),
   
  -- Commercial Office Building
  (NULL, 'Office Building', 'office_building', 
   'Commercial office space for lease or sale', 
   'commercial',
   '{
     "step4_scope": {
       "default_floor_types": ["Ground Floor Retail", "Office Floors", "Basement Parking"],
       "default_amenities": ["Reception", "Elevators", "Parking", "Generator", "Central AC", "Fire Safety System", "CCTV"]
     },
     "step5_budget": {
       "budget_allocation_guide": {
         "land_acquisition": 25,
         "construction": 50,
         "mep_systems": 12,
         "permits_approvals": 3,
         "professional_fees": 5,
         "contingency": 5
       }
     }
   }'::jsonb, 
   true, 3),
   
  -- Mixed Use Development
  (NULL, 'Mixed Use Development', 'mixed_use', 
   'Combination of residential, commercial, and retail spaces', 
   'mixed_use',
   '{
     "step4_scope": {
       "default_components": ["Retail Ground Floor", "Office Floors", "Residential Floors"],
       "default_amenities": ["Lobby", "Elevators", "Parking", "Security", "Common Areas"]
     },
     "step5_budget": {
       "budget_allocation_guide": {
         "land_acquisition": 20,
         "construction": 55,
         "mep_systems": 10,
         "permits_approvals": 3,
         "professional_fees": 7,
         "contingency": 5
       }
     }
   }'::jsonb, 
   true, 4),
   
  -- Single House (Build for Client)
  (NULL, 'Custom Home', 'custom_home', 
   'Single residential property built for a specific client', 
   'residential_single',
   '{
     "step4_scope": {
       "suggested_configurations": ["3BR", "4BR", "5BR"],
       "optional_features": ["Swimming Pool", "Boys Quarters", "Garden", "Carport"]
     },
     "step5_budget": {
       "budget_allocation_guide": {
         "land_acquisition": 30,
         "construction": 55,
         "permits_approvals": 2,
         "professional_fees": 5,
         "landscaping": 3,
         "contingency": 5
       }
     }
   }'::jsonb, 
   false, 5)
   
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5. Triggers
-- ============================================================================

-- Auto-update timestamp
DROP TRIGGER IF EXISTS update_project_drafts_updated_at ON project_drafts;
CREATE TRIGGER update_project_drafts_updated_at
  BEFORE UPDATE ON project_drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_project_wizard_templates_updated_at ON project_wizard_templates;
CREATE TRIGGER update_project_wizard_templates_updated_at
  BEFORE UPDATE ON project_wizard_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-set expiration date (30 days from last update)
CREATE OR REPLACE FUNCTION update_project_draft_expiration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'in_progress' THEN
    NEW.expires_at = NEW.updated_at + INTERVAL '30 days';
  ELSE
    NEW.expires_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_project_draft_expiration ON project_drafts;
CREATE TRIGGER trigger_project_draft_expiration
  BEFORE INSERT OR UPDATE ON project_drafts
  FOR EACH ROW EXECUTE FUNCTION update_project_draft_expiration();

-- ============================================================================
-- 6. Cleanup Function for Expired Drafts
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_project_drafts()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  UPDATE project_drafts
  SET 
    status = 'expired',
    is_deleted = true,
    deleted_at = CURRENT_TIMESTAMP
  WHERE 
    expires_at < CURRENT_TIMESTAMP
    AND status = 'in_progress'
    AND is_deleted = false;
    
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_project_drafts() IS 'Called by cron job to mark expired drafts. Returns count of expired drafts.';

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE project_drafts IS 'Stores in-progress project creation wizard data with auto-save support';
COMMENT ON TABLE project_wizard_templates IS 'Reusable templates for common project types with pre-filled defaults';
COMMENT ON COLUMN project_drafts.step_data IS 'JSONB containing data for each wizard step, keyed by step name';
COMMENT ON COLUMN project_drafts.validation_results IS 'JSONB containing validation status for each step';
