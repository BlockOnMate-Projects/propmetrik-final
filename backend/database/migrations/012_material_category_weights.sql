-- Migration: 012_material_category_weights
-- Description: Persist material category weights for weighted construction materials index
-- Created: 2026-01-06

-- =====================================================
-- MATERIAL CATEGORY WEIGHTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS material_category_weights (
  category material_category_enum PRIMARY KEY,
  weight DECIMAL(6, 5) NOT NULL CHECK (weight >= 0 AND weight <= 1),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Keep updated_at fresh
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'update_material_category_weights_updated_at'
    ) THEN
      CREATE TRIGGER update_material_category_weights_updated_at
        BEFORE UPDATE ON material_category_weights
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
  END IF;
END$$;

-- Seed defaults (aligns with ConstructionCostService default weights)
INSERT INTO material_category_weights (category, weight)
VALUES
  ('cement', 0.25),
  ('steel', 0.20),
  ('sand', 0.10),
  ('blocks', 0.10),
  ('gravel', 0.075),
  ('roofing', 0.075),
  ('timber', 0.05),
  ('tiles', 0.05),
  ('paint', 0.05),
  ('plumbing', 0.05)
ON CONFLICT (category) DO NOTHING;
