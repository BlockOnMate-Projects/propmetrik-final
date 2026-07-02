-- ============================================================================
-- Migration 267: Slice 5 derived-analytics tables (NIQS + HDEM)
--
-- Two DERIVED tables computed by the new Slice 5 analytics services from the
-- already-ingested PHC 2021 census tables (no new scrapers):
--   infrastructureQualityService.ts → district_infrastructure_scores  (NIQS §6.3)
--   housingDeficitService.ts        → district_housing_deficit_estimates (HDEM §6.9)
--
-- Region granularity (16 GSS regions, district = region), matching every other
-- PHC-derived table. Idempotent upserts (UNIQUE region). Recomputed annually
-- after the census refresh (economicDataScheduler gssDerivesRecomputeCron).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Neighbourhood Infrastructure Quality Score (NIQS §6.3)
--    0–100 weighted composite of PHC 2021 infrastructure percentages:
--    electricity, piped water, improved water service, flush/KVIP toilet,
--    formal waste collection, smartphone ownership. Component columns retained
--    for the score-breakdown stacked bar and weakest-component labelling.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS district_infrastructure_scores (
  id                     UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

  region                 TEXT        NOT NULL,

  niqs_score             NUMERIC(6,2),          -- 0–100 weighted composite

  electricity_pct        NUMERIC(6,2),
  piped_water_pct        NUMERIC(6,2),
  improved_water_pct     NUMERIC(6,2),
  toilet_pct             NUMERIC(6,2),          -- flush + KVIP
  waste_collection_pct   NUMERIC(6,2),
  smartphone_pct         NUMERIC(6,2),

  weakest_component      TEXT,                  -- lowest weighted contributor label
  components_used        INTEGER,               -- how many of the 6 inputs were present

  computed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT district_infrastructure_uniq UNIQUE (region)
);

CREATE INDEX IF NOT EXISTS idx_district_infrastructure_score
  ON district_infrastructure_scores (niqs_score DESC);

-- ---------------------------------------------------------------------------
-- 2. Housing Deficit Estimation Model (HDEM §6.9)
--    projected_households_2030 = projections_2030 / avg_hhsize
--    effective_stock           = completed_residential proxy (share of stock
--                                fully completed × current households)
--    hidden_demand             = overcrowded/incomplete pressure
--    housing_deficit_2030      = projected - effective_stock + hidden_demand
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS district_housing_deficit_estimates (
  id                        UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

  region                    TEXT        NOT NULL,

  total_pop_2030            NUMERIC(14,0),
  avg_household_size        NUMERIC(6,2),
  projected_households_2030 NUMERIC(14,0),
  current_households        NUMERIC(14,0),
  fully_completed_pct       NUMERIC(6,2),
  effective_stock           NUMERIC(14,0),
  incomplete_residential_pct NUMERIC(6,2),
  hidden_demand             NUMERIC(14,0),
  housing_deficit_2030      NUMERIC(14,0),      -- may be negative (surplus)

  computed_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT district_housing_deficit_uniq UNIQUE (region)
);

CREATE INDEX IF NOT EXISTS idx_district_housing_deficit
  ON district_housing_deficit_estimates (housing_deficit_2030 DESC);

COMMENT ON TABLE district_infrastructure_scores      IS 'Derived NIQS (Neighbourhood Infrastructure Quality Score) per region from PHC 2021 infra + ICT. Slice 5 §6.3.';
COMMENT ON TABLE district_housing_deficit_estimates  IS 'Derived HDEM (Housing Deficit Estimation Model) per region from PHC projections + household size + completion. Slice 5 §6.9.';
