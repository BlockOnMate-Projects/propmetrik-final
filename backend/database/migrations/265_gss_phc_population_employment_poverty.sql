-- ============================================================================
-- Migration 265: GSS PHC 2021 Population + Employment + Poverty Tables (Slice 3)
--
-- Populated annually (Jan 2nd) by three scrapers from the GSS StatsBank PxWeb API:
--   gssPhcPopulationService.ts  → gss_phc_population_projections
--                                 gss_phc_household_size_by_district
--   gssPhcEmploymentService.ts  → gss_phc_employment_by_district
--                                 (also backfills regional_household_income.formal_employment_pct)
--   gssPhcPovertyService.ts     → gss_phc_mpi_by_district
--
-- regional_housing_demand_scores is a DERIVED table computed by
-- housingDemandScoreService.ts (the RHDS composite feeding the /analytics/demand
-- page). It gracefully degrades until the GLSS7 migration matrix (Slice 4) lands.
--
-- Consistent with the Slice 2 PHC housing convention: rows are stored at REGION
-- granularity (16 GSS regions) with `district = region` and locality retained,
-- because every downstream analytics consumer (RHDS, GHAI MAS, investment MPI
-- discount) joins on region. Source tables carry full district granularity and
-- can be drilled in a future slice without a schema change.
--
-- All upserts are idempotent (ON CONFLICT DO UPDATE) so re-running is safe.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Population projections (projections.px, 2021–2035, by region)
--    One row per (region, year, locality). Feeds RHDS pop-growth component and
--    the Slice 5 housing-deficit model (projections_2030 / avg_hhsize).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gss_phc_population_projections (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

  region              TEXT        NOT NULL,          -- snake_case GSS region key
  year                INTEGER     NOT NULL,          -- projection year (2021..2035)
  locality            TEXT        NOT NULL DEFAULT 'All locality types',

  total_population    NUMERIC(14,0),                 -- all ages, both sexes
  working_age_20_40   NUMERIC(14,0),                 -- 20-24 + 25-29 + 30-34 + 35-39
  youth_15_24         NUMERIC(14,0),                 -- 15-19 + 20-24 (labour entrants)

  synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT gss_phc_pop_proj_uniq UNIQUE (region, year, locality)
);

CREATE INDEX IF NOT EXISTS idx_gss_phc_pop_proj_region_year
  ON gss_phc_population_projections (region, year);

-- ---------------------------------------------------------------------------
-- 2. Household size (avg_hhsize_table.px + hhsize_table.px, by region)
--    avg_household_size feeds the housing-deficit divisor; hhsize_distribution
--    is the full 1..10+ bucket breakdown as JSONB for overcrowding context.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gss_phc_household_size_by_district (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

  district            TEXT        NOT NULL,          -- = region at region granularity
  region              TEXT        NOT NULL,
  locality            TEXT        NOT NULL DEFAULT 'All Locality Types',

  avg_household_size  NUMERIC(6,2),
  total_households    NUMERIC(14,0),
  hhsize_distribution JSONB,                         -- { "1 Person": pct, ..., "10 Persons +": pct }

  synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT gss_phc_hhsize_uniq UNIQUE (district, region, locality)
);

CREATE INDEX IF NOT EXISTS idx_gss_phc_hhsize_region
  ON gss_phc_household_size_by_district (region);

-- ---------------------------------------------------------------------------
-- 3. Employment (sector_table.px + econact_table.px + Unemployment_table_2.px)
--    formal_employment_pct = public + semi-public + private-formal shares.
--    This is the authoritative census source that backfills
--    regional_household_income.formal_employment_pct (upgrades GHAI MAS).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gss_phc_employment_by_district (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

  district              TEXT        NOT NULL,        -- = region at region granularity
  region                TEXT        NOT NULL,
  locality              TEXT        NOT NULL DEFAULT 'All Locality Types',

  public_pct            NUMERIC(6,2),                -- Public (Government) share of employed
  semi_public_pct       NUMERIC(6,2),                -- Semi-Public/Parastatal
  private_formal_pct    NUMERIC(6,2),                -- Private Formal
  private_informal_pct  NUMERIC(6,2),                -- Private Informal
  formal_employment_pct NUMERIC(6,2),                -- public + semi_public + private_formal
  employment_to_pop_pct NUMERIC(6,2),                -- Employed / population 15+
  unemployment_rate     NUMERIC(6,2),                -- from Unemployment_table_2.px

  synced_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT gss_phc_employment_uniq UNIQUE (district, region, locality)
);

CREATE INDEX IF NOT EXISTS idx_gss_phc_employment_region
  ON gss_phc_employment_by_district (region);

-- ---------------------------------------------------------------------------
-- 4. Multidimensional Poverty (MPI_by_locality + MPI_by_sex + MPI_contributors)
--    mpi_m0 drives the investment-scoring poverty discount + risk badge.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gss_phc_mpi_by_district (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

  district            TEXT        NOT NULL,          -- = region at region granularity
  region              TEXT        NOT NULL,
  locality            TEXT        NOT NULL DEFAULT 'All locality types',

  mpi_incidence       NUMERIC(7,3),                  -- Incidence of Poverty (H), %
  mpi_intensity       NUMERIC(7,3),                  -- Intensity of Poverty (A), %
  mpi_m0              NUMERIC(7,4),                  -- Multidimensional Poverty Index (M0)
  female_headed_m0    NUMERIC(7,4),                  -- M0 for female-headed households
  male_headed_m0      NUMERIC(7,4),                  -- M0 for male-headed households

  top_contributor     TEXT,                          -- indicator with the largest contribution
  contributors        JSONB,                         -- { indicator: contribution_pct, ... }

  synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT gss_phc_mpi_uniq UNIQUE (district, region, locality)
);

CREATE INDEX IF NOT EXISTS idx_gss_phc_mpi_region
  ON gss_phc_mpi_by_district (region);

-- ---------------------------------------------------------------------------
-- 5. Regional Housing Demand Score (RHDS) — DERIVED composite
--    Computed by housingDemandScoreService.ts from population growth +
--    employment + earnings growth (+ migration once Slice 4 lands). Feeds the
--    /analytics/demand heatmap and top-demand ranking.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS regional_housing_demand_scores (
  id                       UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

  region                   TEXT        NOT NULL,

  rhds_score               NUMERIC(6,2),             -- 0–100 composite
  pop_growth_component     NUMERIC(6,2),             -- 0–100 sub-score
  employment_component     NUMERIC(6,2),             -- 0–100 sub-score
  earnings_component       NUMERIC(6,2),             -- 0–100 sub-score
  migration_component      NUMERIC(6,2),             -- 0–100 sub-score (0 until Slice 4)
  migration_active         BOOLEAN     NOT NULL DEFAULT FALSE,  -- true once GLSS7 flows present

  pop_growth_20to40_pct    NUMERIC(7,2),             -- % growth of 20-40 cohort to horizon
  total_pop_current        NUMERIC(14,0),
  total_pop_2030           NUMERIC(14,0),

  computed_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT regional_housing_demand_uniq UNIQUE (region)
);

CREATE INDEX IF NOT EXISTS idx_regional_housing_demand_score
  ON regional_housing_demand_scores (rhds_score DESC);

-- ---------------------------------------------------------------------------
-- Column comments (documentation)
-- ---------------------------------------------------------------------------
COMMENT ON TABLE gss_phc_population_projections     IS 'GSS PHC 2021 population projections by region/year (projections.px). Slice 3.';
COMMENT ON TABLE gss_phc_household_size_by_district IS 'GSS PHC 2021 household size by region (avg_hhsize + hhsize distribution). Slice 3.';
COMMENT ON TABLE gss_phc_employment_by_district     IS 'GSS PHC 2021 employment by region (sector/econact/unemployment). Backfills formal_employment_pct. Slice 3.';
COMMENT ON TABLE gss_phc_mpi_by_district            IS 'GSS PHC 2021 multidimensional poverty by region (MPI H/A/M0 + contributors). Slice 3.';
COMMENT ON TABLE regional_housing_demand_scores     IS 'Derived Regional Housing Demand Score (RHDS) composite. Computed by housingDemandScoreService. Slice 3.';
