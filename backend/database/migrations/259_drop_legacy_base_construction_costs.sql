-- 259_drop_legacy_base_construction_costs.sql
-- Remove the legacy `base_construction_costs` table (static 2020-baseline quality-tier seed) and its
-- view `v_active_base_costs`.
--
-- The LIVE construction cost/sqm is `base_costs_per_sqm`, computed weekly from the scraped
-- `material_prices` + `labor_rates` (with regional multipliers + CPI/FX) by
-- BaseCostCalculationService.recalculateAllBaseCosts() on the economicDataScheduler, and read by
-- constructionCostService.getBaseCosts(). The legacy table was an unused fallback that was mistaken
-- for the live source. Verified: no service queries the table or the view. Idempotent.

DROP VIEW IF EXISTS v_active_base_costs;
DROP TABLE IF EXISTS base_construction_costs;
