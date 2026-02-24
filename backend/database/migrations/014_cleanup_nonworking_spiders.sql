-- Migration: 014_cleanup_nonworking_spiders.sql
-- Description: Remove non-working web scraping data sources
-- Date: 2025-01-06
-- 
-- Background: The following spiders were created but never worked:
--   - Jiji Ghana Real Estate: Platform blocked scraping attempts
--   - Facebook Property Groups: Requires authentication, not suitable for scraping
--   - Tonaton Ghana: Platform blocked scraping attempts
--
-- These platforms actively block web scraping and require authentication
DELETE FROM data_sources 
WHERE slug IN ('jiji', 'tonaton', 'facebook-groups')
AND tier = 'tier5_public_web';
