-- Seed file: Default CRM Pipelines for Ghana Real Estate
-- This seeds default pipelines for each organization

-- =============================================
-- SALES PIPELINE (Default for property sales)
-- =============================================

-- Function to create default sales pipeline for an organization
CREATE OR REPLACE FUNCTION seed_default_sales_pipeline(org_id UUID)
RETURNS void AS $$
DECLARE
  pipeline_id UUID;
  stage_lead UUID;
  stage_qualified UUID;
  stage_shortlist UUID;
  stage_viewing_scheduled UUID;
  stage_viewing_completed UUID;
  stage_offer_prep UUID;
  stage_offer_submitted UUID;
  stage_negotiation UUID;
  stage_offer_accepted UUID;
  stage_due_diligence UUID;
  stage_title_search UUID;
  stage_inspection UUID;
  stage_valuation UUID;
  stage_financing_app UUID;
  stage_financing_approved UUID;
  stage_legal_docs UUID;
  stage_contract_review UUID;
  stage_contract_signing UUID;
  stage_payment_schedule UUID;
  stage_payment_progress UUID;
  stage_closing UUID;
  stage_handover UUID;
  stage_won UUID;
  stage_lost UUID;
BEGIN
  -- Create Sales Pipeline
  INSERT INTO deal_pipelines (organization_id, pipeline_name, pipeline_type, description, is_default, is_active, color)
  VALUES (org_id, 'Property Sales Pipeline', 'sale', 'Standard pipeline for property sales transactions in Ghana', true, true, '#10B981')
  RETURNING id INTO pipeline_id;

  -- Create stages
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'New Lead', 1, '#6B7280') RETURNING id INTO stage_lead;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Qualified', 2, '#3B82F6') RETURNING id INTO stage_qualified;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Property Shortlist', 3, '#8B5CF6') RETURNING id INTO stage_shortlist;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Viewing Scheduled', 4, '#EC4899') RETURNING id INTO stage_viewing_scheduled;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Viewing Completed', 5, '#F59E0B') RETURNING id INTO stage_viewing_completed;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Offer Preparation', 6, '#14B8A6') RETURNING id INTO stage_offer_prep;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Offer Submitted', 7, '#06B6D4') RETURNING id INTO stage_offer_submitted;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Negotiation', 8, '#F97316') RETURNING id INTO stage_negotiation;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Offer Accepted', 9, '#10B981') RETURNING id INTO stage_offer_accepted;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Due Diligence', 10, '#8B5CF6') RETURNING id INTO stage_due_diligence;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Title Search', 11, '#6366F1') RETURNING id INTO stage_title_search;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Property Inspection', 12, '#EC4899') RETURNING id INTO stage_inspection;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Valuation', 13, '#F59E0B') RETURNING id INTO stage_valuation;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Financing Application', 14, '#14B8A6') RETURNING id INTO stage_financing_app;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Financing Approved', 15, '#10B981') RETURNING id INTO stage_financing_approved;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Legal Documentation', 16, '#8B5CF6') RETURNING id INTO stage_legal_docs;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Contract Review', 17, '#6366F1') RETURNING id INTO stage_contract_review;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Contract Signing', 18, '#10B981') RETURNING id INTO stage_contract_signing;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Payment Schedule', 19, '#F59E0B') RETURNING id INTO stage_payment_schedule;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Payment in Progress', 20, '#14B8A6') RETURNING id INTO stage_payment_progress;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Closing', 21, '#8B5CF6') RETURNING id INTO stage_closing;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Keys Handover', 22, '#10B981') RETURNING id INTO stage_handover;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Deal Won', 23, '#059669') RETURNING id INTO stage_won;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Deal Lost', 24, '#DC2626') RETURNING id INTO stage_lost;

  -- Update allowed transitions
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_qualified, stage_lost] WHERE id = stage_lead;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_shortlist, stage_lost] WHERE id = stage_qualified;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_viewing_scheduled, stage_lost] WHERE id = stage_shortlist;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_viewing_completed, stage_lost] WHERE id = stage_viewing_scheduled;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_offer_prep, stage_viewing_scheduled, stage_lost] WHERE id = stage_viewing_completed;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_offer_submitted, stage_lost] WHERE id = stage_offer_prep;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_negotiation, stage_lost] WHERE id = stage_offer_submitted;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_offer_accepted, stage_offer_prep, stage_lost] WHERE id = stage_negotiation;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_due_diligence, stage_lost] WHERE id = stage_offer_accepted;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_title_search, stage_inspection, stage_valuation, stage_lost] WHERE id = stage_due_diligence;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_financing_app, stage_legal_docs, stage_lost] WHERE id = stage_title_search;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_financing_app, stage_legal_docs, stage_lost] WHERE id = stage_inspection;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_financing_app, stage_legal_docs, stage_lost] WHERE id = stage_valuation;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_financing_approved, stage_legal_docs, stage_lost] WHERE id = stage_financing_app;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_legal_docs] WHERE id = stage_financing_approved;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_contract_review, stage_lost] WHERE id = stage_legal_docs;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_contract_signing, stage_legal_docs, stage_lost] WHERE id = stage_contract_review;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_payment_schedule, stage_lost] WHERE id = stage_contract_signing;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_payment_progress] WHERE id = stage_payment_schedule;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_closing, stage_payment_progress] WHERE id = stage_payment_progress;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_handover] WHERE id = stage_closing;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_won] WHERE id = stage_handover;

END;
$$ LANGUAGE plpgsql;

-- =============================================
-- RENTAL PIPELINE
-- =============================================

CREATE OR REPLACE FUNCTION seed_default_rental_pipeline(org_id UUID)
RETURNS void AS $$
DECLARE
  pipeline_id UUID;
  stage_inquiry UUID;
  stage_qualified UUID;
  stage_viewing UUID;
  stage_application UUID;
  stage_screening UUID;
  stage_reference UUID;
  stage_negotiation UUID;
  stage_advance_payment UUID;
  stage_lease_signing UUID;
  stage_move_in UUID;
  stage_active UUID;
  stage_rejected UUID;
BEGIN
  -- Create Rental Pipeline
  INSERT INTO deal_pipelines (organization_id, pipeline_name, pipeline_type, description, is_default, is_active, color)
  VALUES (org_id, 'Rental Pipeline', 'rental', 'Standard pipeline for rental transactions in Ghana', false, true, '#3B82F6')
  RETURNING id INTO pipeline_id;

  -- Create stages
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'New Inquiry', 1, '#6B7280') RETURNING id INTO stage_inquiry;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Qualified Tenant', 2, '#3B82F6') RETURNING id INTO stage_qualified;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Property Viewing', 3, '#8B5CF6') RETURNING id INTO stage_viewing;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Application Submitted', 4, '#EC4899') RETURNING id INTO stage_application;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Tenant Screening', 5, '#F59E0B') RETURNING id INTO stage_screening;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Reference Check', 6, '#14B8A6') RETURNING id INTO stage_reference;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Lease Negotiation', 7, '#06B6D4') RETURNING id INTO stage_negotiation;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Advance Payment', 8, '#10B981') RETURNING id INTO stage_advance_payment;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Lease Signing', 9, '#8B5CF6') RETURNING id INTO stage_lease_signing;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Move-In', 10, '#10B981') RETURNING id INTO stage_move_in;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Rental Active', 11, '#059669') RETURNING id INTO stage_active;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Application Rejected', 12, '#DC2626') RETURNING id INTO stage_rejected;

  -- Update allowed transitions
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_qualified, stage_rejected] WHERE id = stage_inquiry;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_viewing, stage_rejected] WHERE id = stage_qualified;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_application, stage_viewing, stage_rejected] WHERE id = stage_viewing;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_screening, stage_rejected] WHERE id = stage_application;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_reference, stage_rejected] WHERE id = stage_screening;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_negotiation, stage_rejected] WHERE id = stage_reference;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_advance_payment, stage_reference, stage_rejected] WHERE id = stage_negotiation;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_lease_signing] WHERE id = stage_advance_payment;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_move_in] WHERE id = stage_lease_signing;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_active] WHERE id = stage_move_in;

END;
$$ LANGUAGE plpgsql;

-- =============================================
-- LAND ACQUISITION PIPELINE
-- =============================================

CREATE OR REPLACE FUNCTION seed_default_land_acquisition_pipeline(org_id UUID)
RETURNS void AS $$
DECLARE
  pipeline_id UUID;
  stage_lead UUID;
  stage_initial_review UUID;
  stage_site_visit UUID;
  stage_loi UUID;
  stage_negotiation UUID;
  stage_due_diligence UUID;
  stage_title_verification UUID;
  stage_survey UUID;
  stage_valuation UUID;
  stage_legal_review UUID;
  stage_board_approval UUID;
  stage_contract_drafting UUID;
  stage_contract_signing UUID;
  stage_payment UUID;
  stage_registration UUID;
  stage_closed UUID;
  stage_abandoned UUID;
BEGIN
  -- Create Land Acquisition Pipeline
  INSERT INTO deal_pipelines (organization_id, pipeline_name, pipeline_type, description, is_default, is_active, color)
  VALUES (org_id, 'Land Acquisition Pipeline', 'land_acquisition', 'Pipeline for institutional land acquisition transactions', false, true, '#F59E0B')
  RETURNING id INTO pipeline_id;

  -- Create stages
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'New Lead', 1, '#6B7280') RETURNING id INTO stage_lead;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Initial Review', 2, '#3B82F6') RETURNING id INTO stage_initial_review;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Site Visit', 3, '#8B5CF6') RETURNING id INTO stage_site_visit;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'LOI Submitted', 4, '#EC4899') RETURNING id INTO stage_loi;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Negotiation', 5, '#F59E0B') RETURNING id INTO stage_negotiation;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Due Diligence', 6, '#14B8A6') RETURNING id INTO stage_due_diligence;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Title Verification', 7, '#06B6D4') RETURNING id INTO stage_title_verification;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Survey & Mapping', 8, '#8B5CF6') RETURNING id INTO stage_survey;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Valuation', 9, '#F59E0B') RETURNING id INTO stage_valuation;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Legal Review', 10, '#6366F1') RETURNING id INTO stage_legal_review;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Board Approval', 11, '#EC4899') RETURNING id INTO stage_board_approval;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Contract Drafting', 12, '#14B8A6') RETURNING id INTO stage_contract_drafting;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Contract Signing', 13, '#10B981') RETURNING id INTO stage_contract_signing;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Payment Processing', 14, '#F59E0B') RETURNING id INTO stage_payment;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Land Registration', 15, '#8B5CF6') RETURNING id INTO stage_registration;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Acquisition Closed', 16, '#059669') RETURNING id INTO stage_closed;
  INSERT INTO deal_stages (pipeline_id, stage_name, stage_order, stage_color) VALUES (pipeline_id, 'Deal Abandoned', 17, '#DC2626') RETURNING id INTO stage_abandoned;

  -- Update allowed transitions
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_initial_review, stage_abandoned] WHERE id = stage_lead;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_site_visit, stage_abandoned] WHERE id = stage_initial_review;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_loi, stage_initial_review, stage_abandoned] WHERE id = stage_site_visit;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_negotiation, stage_abandoned] WHERE id = stage_loi;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_due_diligence, stage_loi, stage_abandoned] WHERE id = stage_negotiation;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_title_verification, stage_survey, stage_valuation, stage_abandoned] WHERE id = stage_due_diligence;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_legal_review, stage_abandoned] WHERE id = stage_title_verification;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_legal_review, stage_abandoned] WHERE id = stage_survey;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_legal_review, stage_abandoned] WHERE id = stage_valuation;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_board_approval, stage_due_diligence, stage_abandoned] WHERE id = stage_legal_review;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_contract_drafting, stage_legal_review, stage_abandoned] WHERE id = stage_board_approval;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_contract_signing, stage_abandoned] WHERE id = stage_contract_drafting;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_payment, stage_abandoned] WHERE id = stage_contract_signing;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_registration] WHERE id = stage_payment;
  UPDATE deal_stages SET allowed_next_stages = ARRAY[stage_closed] WHERE id = stage_registration;

END;
$$ LANGUAGE plpgsql;

-- =============================================
-- APPLY SEEDS TO EXISTING ORGANIZATIONS
-- =============================================

-- Seed pipelines for all existing organizations
DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id FROM organizations
  LOOP
    PERFORM seed_default_sales_pipeline(org.id);
    PERFORM seed_default_rental_pipeline(org.id);
    PERFORM seed_default_land_acquisition_pipeline(org.id);
  END LOOP;
END $$;

-- =============================================
-- TRIGGER: Auto-seed pipelines for new organizations
-- =============================================

CREATE OR REPLACE FUNCTION auto_seed_crm_pipelines()
RETURNS TRIGGER AS $$
BEGIN
  -- Create default pipelines for new organization
  PERFORM seed_default_sales_pipeline(NEW.id);
  PERFORM seed_default_rental_pipeline(NEW.id);
  PERFORM seed_default_land_acquisition_pipeline(NEW.id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER organizations_auto_seed_crm
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION auto_seed_crm_pipelines();

COMMENT ON FUNCTION seed_default_sales_pipeline IS 'Seeds default property sales pipeline for an organization';
COMMENT ON FUNCTION seed_default_rental_pipeline IS 'Seeds default rental pipeline for an organization';
COMMENT ON FUNCTION seed_default_land_acquisition_pipeline IS 'Seeds default land acquisition pipeline for an organization';
