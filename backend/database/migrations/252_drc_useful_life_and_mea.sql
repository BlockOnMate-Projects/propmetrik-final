-- 252_drc_useful_life_and_mea.sql
-- DRC (Depreciated Replacement Cost) methodology parameters move OUT of hardcoded frontend/Python
-- tables and INTO the Data Hub config table `specialized_construction_costs`, alongside the cost
-- rates they accompany. This makes the MEA factor + economic (useful) life data-driven and editable.
--
-- useful_life_years  : RICS/IVS economic life for the asset class (drives age/life depreciation).
-- mea_factor         : Modern Equivalent Asset factor — proportion of a like-for-like reproduction
--                      cost that a modern equivalent would represent (≤ 1.0; 1.0 = no MEA discount).
--
-- Seed values are the recognised professional-standard figures previously hardcoded in the app and
-- are flagged for valuer review (source = 'rics_ivs_standard_seed'); edit per the firm's basis.
-- Idempotent: safe to re-run.

ALTER TABLE specialized_construction_costs
  ADD COLUMN IF NOT EXISTS useful_life_years INTEGER,
  ADD COLUMN IF NOT EXISTS mea_factor NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS drc_params_source TEXT;

-- Seed per building_function (same economic life + MEA across quality levels and regions of a
-- function). UPDATE-based so re-runs refresh only rows still on the seed (or null).
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('institutional_other',   60, 0.95),
      ('government',            60, 0.90),
      ('religious',             80, 1.00),
      ('educational',           50, 0.85),
      ('health_clinic',         50, 0.90),
      ('health_hospital',       50, 0.90),
      ('library',               55, 0.80),
      ('museum',                70, 0.95),
      ('heritage',             100, 1.00),
      ('recreation',            45, 0.85),
      ('stadium',               45, 0.85),
      ('industrial_warehouse',  50, 0.90),
      ('industrial_factory',    50, 0.90),
      ('mixed_use',             60, 0.90)
    ) AS t(building_function, life_years, mea)
  LOOP
    UPDATE specialized_construction_costs
       SET useful_life_years = rec.life_years,
           mea_factor        = rec.mea,
           drc_params_source = 'rics_ivs_standard_seed'
     WHERE building_function::text = rec.building_function
       AND (drc_params_source IS NULL OR drc_params_source = 'rics_ivs_standard_seed');
  END LOOP;
END $$;
