-- Migration: 20260702_seed_neighborhood_premiums
-- Description: Seed the neighborhood_premiums table (created empty in mig 016) with the
--   Greater Accra location premiums that until now lived ONLY as a hardcoded const in the
--   frontend AdjustmentGrid.tsx (falsely commented "Loaded from database"). Seeding the DB
--   with the EXACT same factors is regression-neutral for existing valuations while making
--   the table the editable single source of truth. Idempotent (ON CONFLICT DO UPDATE).
-- Created: 2026-07-02

INSERT INTO neighborhood_premiums (neighborhood, region, premium_factor, market_tier, last_updated_from)
VALUES
  -- Prime+ (30%+ premium)
  ('airport_residential', 'greater_accra', 1.30, 'prime_plus', 'frontend AdjustmentGrid seed'),
  ('cantonments',         'greater_accra', 1.28, 'prime_plus', 'frontend AdjustmentGrid seed'),
  ('ridge',               'greater_accra', 1.25, 'prime_plus', 'frontend AdjustmentGrid seed'),
  -- Prime (15-25% premium)
  ('roman_ridge',         'greater_accra', 1.22, 'prime', 'frontend AdjustmentGrid seed'),
  ('east_legon',          'greater_accra', 1.20, 'prime', 'frontend AdjustmentGrid seed'),
  ('labone',              'greater_accra', 1.18, 'prime', 'frontend AdjustmentGrid seed'),
  ('switchback_road',     'greater_accra', 1.18, 'prime', 'frontend AdjustmentGrid seed'),
  ('osu',                 'greater_accra', 1.15, 'prime', 'frontend AdjustmentGrid seed'),
  ('ringway_estates',     'greater_accra', 1.15, 'prime', 'frontend AdjustmentGrid seed'),
  -- Prime Minus (5-15% premium)
  ('dzorwulu',            'greater_accra', 1.12, 'prime', 'frontend AdjustmentGrid seed'),
  ('north_ridge',         'greater_accra', 1.12, 'prime', 'frontend AdjustmentGrid seed'),
  ('abelemkpe',           'greater_accra', 1.10, 'prime', 'frontend AdjustmentGrid seed'),
  ('adjiringanor',        'greater_accra', 1.10, 'prime', 'frontend AdjustmentGrid seed'),
  ('tesano',              'greater_accra', 1.08, 'secondary', 'frontend AdjustmentGrid seed'),
  ('asylum_down',         'greater_accra', 1.05, 'secondary', 'frontend AdjustmentGrid seed'),
  -- Secondary (baseline ±5%)
  ('spintex',             'greater_accra', 1.02, 'secondary', 'frontend AdjustmentGrid seed'),
  ('spintex_road',        'greater_accra', 1.02, 'secondary', 'frontend AdjustmentGrid seed'),
  ('achimota',            'greater_accra', 1.00, 'secondary', 'frontend AdjustmentGrid seed'),
  ('dansoman',            'greater_accra', 0.98, 'secondary', 'frontend AdjustmentGrid seed'),
  ('sakumono',            'greater_accra', 0.98, 'secondary', 'frontend AdjustmentGrid seed'),
  ('teshie',              'greater_accra', 0.95, 'secondary', 'frontend AdjustmentGrid seed'),
  ('nungua',              'greater_accra', 0.95, 'secondary', 'frontend AdjustmentGrid seed'),
  ('adenta',              'greater_accra', 0.95, 'secondary', 'frontend AdjustmentGrid seed'),
  ('dome',                'greater_accra', 0.95, 'secondary', 'frontend AdjustmentGrid seed'),
  ('madina',              'greater_accra', 0.92, 'secondary', 'frontend AdjustmentGrid seed'),
  -- Tertiary (10-20% discount)
  ('tema',                'greater_accra', 0.90, 'tertiary', 'frontend AdjustmentGrid seed'),
  ('tema_community_1',    'greater_accra', 0.90, 'tertiary', 'frontend AdjustmentGrid seed'),
  ('lashibi',             'greater_accra', 0.88, 'tertiary', 'frontend AdjustmentGrid seed'),
  ('agbogba',             'greater_accra', 0.88, 'tertiary', 'frontend AdjustmentGrid seed'),
  ('pokuase',             'greater_accra', 0.85, 'tertiary', 'frontend AdjustmentGrid seed'),
  ('kasoa',               'greater_accra', 0.82, 'tertiary', 'frontend AdjustmentGrid seed'),
  ('ashaiman',            'greater_accra', 0.80, 'tertiary', 'frontend AdjustmentGrid seed')
ON CONFLICT (neighborhood, region) DO UPDATE
  SET premium_factor = EXCLUDED.premium_factor,
      market_tier    = EXCLUDED.market_tier,
      updated_at     = CURRENT_TIMESTAMP;
