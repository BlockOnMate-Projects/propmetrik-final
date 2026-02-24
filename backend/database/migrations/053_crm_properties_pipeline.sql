-- Migration: 053_crm_properties_pipeline
-- Description: Add pipeline tracking to CRM properties
-- Created: 2026-01-21

-- Add pipeline tracking columns to crm_properties
ALTER TABLE crm_properties 
ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES deal_pipelines(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS current_stage_id UUID REFERENCES deal_stages(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS stage_entered_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS days_in_stage INTEGER DEFAULT 0;

-- Create index for pipeline queries
CREATE INDEX IF NOT EXISTS idx_crm_properties_pipeline ON crm_properties(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_crm_properties_stage ON crm_properties(current_stage_id);

-- =====================================================
-- UPDATE EXISTING SEED DATA WITH DEFAULT PIPELINES
-- =====================================================

DO $$
DECLARE
  v_org_id UUID;
  v_sale_pipeline_id UUID;
  v_rental_pipeline_id UUID;
  v_new_listing_stage_id UUID;
  v_negotiation_stage_id UUID;
  v_rental_listed_stage_id UUID;
  v_rental_viewing_stage_id UUID;
BEGIN
  -- Get organization
  SELECT id INTO v_org_id FROM organizations LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RAISE NOTICE 'No organization found, skipping pipeline assignment';
    RETURN;
  END IF;
  
  -- Get or create Sale pipeline
  SELECT id INTO v_sale_pipeline_id 
  FROM deal_pipelines 
  WHERE organization_id = v_org_id AND (pipeline_type = 'sale' OR pipeline_name ILIKE '%sale%')
  LIMIT 1;
  
  IF v_sale_pipeline_id IS NULL THEN
    INSERT INTO deal_pipelines (organization_id, pipeline_name, pipeline_type, description, is_default)
    VALUES (v_org_id, 'Property Sale Pipeline', 'sale', 'Standard pipeline for property sales', TRUE)
    RETURNING id INTO v_sale_pipeline_id;
    
    -- Create stages for sale pipeline
    INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color, probability) VALUES
    (v_sale_pipeline_id, 'New Listing', 1, '#3B82F6', 10),
    (v_sale_pipeline_id, 'Inquiry', 2, '#8B5CF6', 20),
    (v_sale_pipeline_id, 'Viewing Scheduled', 3, '#EC4899', 30),
    (v_sale_pipeline_id, 'Viewing Completed', 4, '#F59E0B', 40),
    (v_sale_pipeline_id, 'Negotiation', 5, '#EF4444', 60),
    (v_sale_pipeline_id, 'Offer Received', 6, '#10B981', 75),
    (v_sale_pipeline_id, 'Due Diligence', 7, '#06B6D4', 85),
    (v_sale_pipeline_id, 'Contract', 8, '#84CC16', 95),
    (v_sale_pipeline_id, 'Closed', 9, '#22C55E', 100);
  END IF;
  
  -- Get or create Rental pipeline
  SELECT id INTO v_rental_pipeline_id 
  FROM deal_pipelines 
  WHERE organization_id = v_org_id AND (pipeline_type = 'rental' OR pipeline_name ILIKE '%rental%')
  LIMIT 1;
  
  IF v_rental_pipeline_id IS NULL THEN
    INSERT INTO deal_pipelines (organization_id, pipeline_name, pipeline_type, description, is_default)
    VALUES (v_org_id, 'Property Rental Pipeline', 'rental', 'Standard pipeline for property rentals', FALSE)
    RETURNING id INTO v_rental_pipeline_id;
    
    -- Create stages for rental pipeline
    INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color, probability) VALUES
    (v_rental_pipeline_id, 'Listed', 1, '#3B82F6', 10),
    (v_rental_pipeline_id, 'Inquiry', 2, '#8B5CF6', 25),
    (v_rental_pipeline_id, 'Viewing', 3, '#F59E0B', 40),
    (v_rental_pipeline_id, 'Application', 4, '#EC4899', 60),
    (v_rental_pipeline_id, 'Background Check', 5, '#EF4444', 75),
    (v_rental_pipeline_id, 'Lease Signing', 6, '#10B981', 90),
    (v_rental_pipeline_id, 'Move In', 7, '#22C55E', 100);
  END IF;
  
  -- Get first stages for each pipeline
  SELECT id INTO v_new_listing_stage_id FROM deal_stages 
  WHERE pipeline_id = v_sale_pipeline_id ORDER BY stage_order LIMIT 1;
  
  SELECT id INTO v_negotiation_stage_id FROM deal_stages 
  WHERE pipeline_id = v_sale_pipeline_id AND stage_name = 'Negotiation' LIMIT 1;
  
  SELECT id INTO v_rental_listed_stage_id FROM deal_stages 
  WHERE pipeline_id = v_rental_pipeline_id ORDER BY stage_order LIMIT 1;
  
  SELECT id INTO v_rental_viewing_stage_id FROM deal_stages 
  WHERE pipeline_id = v_rental_pipeline_id AND stage_name = 'Viewing' LIMIT 1;
  
  -- Update sale properties with sale pipeline
  UPDATE crm_properties 
  SET 
    pipeline_id = v_sale_pipeline_id,
    current_stage_id = CASE 
      WHEN status = 'under_offer' THEN v_negotiation_stage_id
      ELSE v_new_listing_stage_id
    END,
    stage_entered_at = created_at,
    days_in_stage = EXTRACT(DAY FROM NOW() - created_at)::INTEGER
  WHERE transaction_type = 'sale' AND pipeline_id IS NULL;
  
  -- Update rental properties with rental pipeline
  UPDATE crm_properties 
  SET 
    pipeline_id = v_rental_pipeline_id,
    current_stage_id = CASE 
      WHEN status = 'under_offer' THEN v_rental_viewing_stage_id
      ELSE v_rental_listed_stage_id
    END,
    stage_entered_at = created_at,
    days_in_stage = EXTRACT(DAY FROM NOW() - created_at)::INTEGER
  WHERE transaction_type = 'rental' AND pipeline_id IS NULL;
  
  RAISE NOTICE 'Pipeline assignment complete';
END $$;

-- =====================================================
-- FUNCTION TO UPDATE PROPERTY STAGE
-- =====================================================

CREATE OR REPLACE FUNCTION update_crm_property_stage(
  p_property_id UUID,
  p_new_stage_id UUID
) RETURNS void AS $$
BEGIN
  UPDATE crm_properties
  SET 
    current_stage_id = p_new_stage_id,
    stage_entered_at = NOW(),
    days_in_stage = 0,
    updated_at = NOW()
  WHERE id = p_property_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON COLUMN crm_properties.pipeline_id IS 'The pipeline this property is being tracked in';
COMMENT ON COLUMN crm_properties.current_stage_id IS 'Current stage in the pipeline';
COMMENT ON COLUMN crm_properties.stage_entered_at IS 'When the property entered the current stage';
COMMENT ON COLUMN crm_properties.days_in_stage IS 'Number of days in current stage';
