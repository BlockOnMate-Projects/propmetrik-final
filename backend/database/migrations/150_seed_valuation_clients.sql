-- Migration: 150_seed_valuation_clients
-- Description: Seed initial valuation clients
-- Created: 2026-02-17

INSERT INTO valuation_clients (name, type, email, phone, company_name, address, organization_id)
SELECT 'Ghana National Housing Authority', 'government', 'procur@gnha.gov.gh', '+233 302 123456', 'GNHA', 'Ministry of Works and Housing, Accra', id FROM organizations LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO valuation_clients (name, type, email, phone, company_name, address, organization_id)
SELECT 'Goldkey Properties Ltd.', 'corporate', 'info@goldkeygh.com', '+233 30 277 8899', 'Goldkey Properties', 'Cantonments, Accra', id FROM organizations LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO valuation_clients (name, type, email, phone, company_name, address, organization_id)
SELECT 'Ecobank Ghana', 'corporate', 'realestate@ecobank.com', '+233 30 222 3344', 'Ecobank', 'Head Office, Ridge, Accra', id FROM organizations LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO valuation_clients (name, type, email, phone, company_name, address, organization_id)
SELECT 'Kwame Mensah', 'individual', 'k.mensah@gmail.com', '+233 24 555 1234', NULL, 'East Legon, Accra', id FROM organizations LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO valuation_clients (name, type, email, phone, company_name, address, organization_id)
SELECT 'Ama Boateng', 'individual', 'aboateng@yahoo.com', '+233 20 333 4567', NULL, 'Airport Residential, Accra', id FROM organizations LIMIT 1
ON CONFLICT DO NOTHING;
