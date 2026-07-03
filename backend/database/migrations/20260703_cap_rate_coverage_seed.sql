-- Cap-rate coverage: persist indicative benchmarks for the property types that had NO row in
-- market_cap_rate_benchmarks (industrial, land, mixed_use) so the analytics cap-rate authority
-- (services/analytics/capRateService.resolveCapRate) reads the DB as the single source of truth
-- instead of falling back to code-level getDefaultCapRate() constants.
--
-- These are INDICATIVE seeds (data_quality='low', confidence 0.40, sample_size 0) — the same
-- bands already used as code defaults, moved into the DB and flagged so real listing-derived /
-- transaction evidence supersedes them via the existing flywheel. Kumasi carries a modest +1pp
-- yield uplift vs Accra (secondary market: lower liquidity/prices → higher yields), a standard
-- indicative assumption pending real evidence. Idempotent: skips any (region, type) that already
-- has an active benchmark row.

INSERT INTO market_cap_rate_benchmarks (
  region, property_type, property_subtype,
  cap_rate_min, cap_rate_max, cap_rate_median, cap_rate_mean,
  typical_cap_rate_low, typical_cap_rate_high, benchmark_cap_rate,
  market_condition, yield_trend, risk_premium, risk_free_rate,
  sample_size, confidence_score, data_quality,
  effective_date, valid_from, methodology_notes
)
SELECT v.region, v.property_type, v.property_subtype,
       v.cap_rate_min, v.cap_rate_max, v.cap_rate_median, v.cap_rate_mean,
       v.typical_low, v.typical_high, v.benchmark,
       'balanced', 'stable', v.risk_premium, 0.025,
       0, 0.40, 'low',
       CURRENT_DATE, CURRENT_DATE, v.notes
FROM (VALUES
  -- Greater Accra (mirrors the former code defaults)
  ('greater_accra'::region_code_enum, 'industrial'::property_type_enum, NULL::text, 0.085::numeric, 0.15::numeric, 0.11::numeric, 0.11::numeric, 0.085::numeric, 0.15::numeric, 0.11::numeric, 0.075::numeric, 'Indicative seed pending transaction evidence — flagged low confidence.'::text),
  ('greater_accra'::region_code_enum, 'land'::property_type_enum,       NULL::text, 0.03::numeric,  0.08::numeric, 0.05::numeric, 0.05::numeric, 0.03::numeric,  0.08::numeric, 0.05::numeric, 0.02::numeric, 'Indicative land yield seed (land is typically valued by comparison, not yield); flagged low confidence.'::text),
  ('greater_accra'::region_code_enum, 'mixed_use'::property_type_enum,  NULL::text, 0.065::numeric, 0.12::numeric, 0.085::numeric,0.085::numeric,0.065::numeric, 0.12::numeric, 0.085::numeric,0.05::numeric,  'Indicative mixed-use seed pending transaction evidence — flagged low confidence.'::text),
  -- Kumasi Metro (+~1pp vs Accra: secondary market)
  ('kumasi_metro'::region_code_enum,  'industrial'::property_type_enum, NULL::text, 0.095::numeric, 0.16::numeric, 0.12::numeric, 0.12::numeric, 0.095::numeric, 0.16::numeric, 0.12::numeric, 0.085::numeric,'Indicative Kumasi industrial seed (+1pp secondary-market uplift); flagged low confidence.'::text),
  ('kumasi_metro'::region_code_enum,  'land'::property_type_enum,       NULL::text, 0.04::numeric,  0.09::numeric, 0.06::numeric, 0.06::numeric, 0.04::numeric,  0.09::numeric, 0.06::numeric, 0.03::numeric, 'Indicative Kumasi land yield seed (+1pp); flagged low confidence.'::text),
  ('kumasi_metro'::region_code_enum,  'mixed_use'::property_type_enum,  NULL::text, 0.075::numeric, 0.13::numeric, 0.095::numeric,0.095::numeric,0.075::numeric, 0.13::numeric, 0.095::numeric,0.06::numeric,  'Indicative Kumasi mixed-use seed (+1pp); flagged low confidence.'::text)
) AS v(region, property_type, property_subtype,
       cap_rate_min, cap_rate_max, cap_rate_median, cap_rate_mean,
       typical_low, typical_high, benchmark, risk_premium, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM market_cap_rate_benchmarks b
   WHERE b.region = v.region
     AND b.property_type = v.property_type
     AND b.valid_until IS NULL
);
