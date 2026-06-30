-- 253_drc_mea_feature_range.sql
-- Completes the data-driven MEA model for DRC. Migration 252 added the per-class MEA *baseline*
-- (the anchor for an average asset of the class). This adds the bounded RANGE within which the
-- building's own features may modulate that baseline (feature-driven MEA, RICS DRC "Model A":
-- the MEA factor captures functional/design adequacy, so functional obsolescence is NOT deducted
-- separately — no double counting).
--
-- mea_feature_range : max proportional adjustment of the baseline from feature scoring (e.g. 0.10
--                     => an average building stays at baseline; the best/worst move ±10%, clamped
--                     to [0.5, 1.0] in the engine). Editable per class; 0 = pure baseline (no
--                     feature modulation).
-- Idempotent.

ALTER TABLE specialized_construction_costs
  ADD COLUMN IF NOT EXISTS mea_feature_range NUMERIC(4, 3);

UPDATE specialized_construction_costs
   SET mea_feature_range = 0.100
 WHERE mea_feature_range IS NULL;
