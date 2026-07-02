-- ============================================================================
-- Migration 262: Add formal_employment_pct column to regional_household_income
--
-- This column is populated by gssIncomeService.ts (extended in Slice 1) via
-- the PHC 2021 sector_table.px endpoint (Public + Private formal employment %).
-- It replaces the hardcoded 15% in ghaiService.calculateMAS().
-- ============================================================================

ALTER TABLE regional_household_income
  ADD COLUMN IF NOT EXISTS formal_employment_pct NUMERIC(5,2);

COMMENT ON COLUMN regional_household_income.formal_employment_pct IS
  'Formal employment % for this region — populated from PHC 2021 sector_table.px
   (Public sector + Private formal sector as % of total employed population 15+).
   Used by ghaiService.calculateMAS() to replace the hardcoded national 15% figure.
   Regional range: Greater Accra ~38%, Northern ~8%, Upper East ~6%.
   NULL means not yet fetched; ghaiService falls back to 15 when NULL.';
