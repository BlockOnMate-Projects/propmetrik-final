# PropMetrik Analytics Gap Analysis & GSS StatsBank Integration Map

> **Purpose:** Full audit of what analytics and data-pipeline infrastructure exists today, what GSS
> StatsBank data fills genuine gaps, and exactly where every new GSS integration belongs in the
> existing `data-hub` code tree — so the addition is organised, not bolted on.
>
> **GSS API Base URL:** `https://statsbank.statsghana.gov.gh/api/v1/en/`  
> **Protocol:** PxWeb JSON-stat2 — GET for table metadata, POST with `json-stat2` body for data  
> **Date audited:** 2026-06-30  
> **Slice 1 status:** ✅ SHIPPED & LIVE — migrations applied, all scrapers synced, 6,768+ rows of real GSS data in DB  
> **Slice 2 status:** ✅ SHIPPED & LIVE — PHC census (80 rows across 5 tables) + Trade HS2 (660 rows, Jan 2021–Dec 2025) synced  
> **Slice 3 status:** ✅ SHIPPED & LIVE (2026-07-01) — mig 265 (5 tables); population projections (240 rows, 16 regions × 2021–2035) + household size (16) + employment (16, formal_employment_pct backfilled) + MPI (16) synced from PHC 2021; RHDS composite computed (16 regions); MPI poverty discount + badge in investment scoring; GHAI MAS upgraded to census formal employment; new `/analytics/demand` page + nav. See §"Slice 3" below.  
> **Next:** Slice 4 (GLSS7 Migration + Tourism) — activates the RHDS migration component + tourism demand typing

---

## Table of Contents

1. [Data-Hub Architecture — How the Pipeline Works Today](#1-data-hub-architecture--how-the-pipeline-works-today)
2. [Existing Analytics Services — Full Inventory](#2-existing-analytics-services--full-inventory)
3. [GSS StatsBank — Complete Data Catalogue](#3-gss-statsbank--complete-data-catalogue)
4. [What Already Exists vs. What Is Genuinely Missing](#4-what-already-exists-vs-what-is-genuinely-missing)
5. [Enrichment Map: Existing Analytics + GSS Data](#5-enrichment-map-existing-analytics--gss-data)
6. [Net-New Analytics Enabled by GSS Data](#6-net-new-analytics-enabled-by-gss-data)
7. [Cross-Dataset Composite Models](#7-cross-dataset-composite-models)
8. [Implementation Priority Matrix](#8-implementation-priority-matrix)
9. [Canonical GSS Integration File Tree](#9-canonical-gss-integration-file-tree)
10. [Scheduler & Monitoring Extensions](#10-scheduler--monitoring-extensions)

---

## 1. Data-Hub Architecture — How the Pipeline Works Today

The Data Hub (`backend/src/services/data-hub/`) is the central nervous system for all external data.
Every external source is acquired here, normalised, and made available to the analytics layer.
Understanding it is essential before adding any GSS integration.

### 1.1 Acquisition Tier (Scrapers & API Clients)

All external source adapters live in `data-hub/scrapers/`. Each implements the same contract:
`SyncResult` type, `syncLogRepository` calls for audit trails.

| File | Source | Cadence | What it feeds |
|------|--------|---------|---------------|
| `bogScraper.ts` | Bank of Ghana website | Monthly (1st, 8 AM) | `economic_indicators` — CPI, GDP, lending rate, exchange rates |
| `bogDailyFxScraper.ts` | BOG interbank FX | Daily (9:30 AM weekdays) | `economic_indicators` — daily GHS/USD |
| `fxFeedService.ts` | FX live feed | Every 5 min + daily | Redis cache + `economic_indicators` |
| `wdiClient.ts` | World Bank WDI API | Quarterly | `economic_indicators` — GDP growth, macro indicators |
| `npaScraper.ts` | GlobalPetrolPrices / NPA Ghana | Weekly (Mon 9 AM) | `material_prices` — diesel, petrol, LPG |
| `localMaterialScraper.ts` | Local suppliers/market | Weekly (Mon 10 AM) | `material_prices` — cement, steel, timber, etc. |
| `gssLaborService.ts` | GSS website + minimum wage multipliers | Weekly (Mon 11 AM) | `labor_rates` — construction trade labor by skill |
| `gredaScraper.ts` | GREDA / BRRI | Monthly (Mon 2 PM) | `specialized_construction_costs` — GREDA $/sqm rates |

**Critical fact:** `gssLaborService.ts` is labelled GSS but does **not** call the StatsBank PxWeb
API. It derives labor rates by applying skill-level multipliers over the national minimum wage
(`GHANA_DAILY_MINIMUM_WAGE_GHS = 18.15`). The actual GSS labour earnings data from AHIES
(`mean_earnings.px`, `med_earnings.px`) is **not yet consumed here**.

### 1.2 Already-Built GSS PxWeb Integration

`data-hub/gssIncomeService.ts` (**SHIPPED**) is the only file currently calling the StatsBank PxWeb
API. It implements a full `pxPost` / `pxGet` HTTPS client, fetches:

- `AHIES/med_earnings.px` — median hourly earnings by region (latest quarter)
- `PHC 2021 StatsBank/Population/avg_hhsize_table.px` — average household size by region
- `PHC 2021 StatsBank/Economic Activity/econact_table.px` — employment rate by region

It derives `median_household_income` per region, CPI-escalates it monthly using the live
`economic_indicators.cpi_index` row, and writes to `regional_household_income`. This directly feeds
`ghaiService` and eliminates the hardcoded static income values that existed before.

> **This is the established PxWeb client pattern.** All new GSS integrations must follow the same
> approach: `https.request` (no axios, native Node HTTPS), `pxPost()` helper, `json-stat2` response
> format, `syncLogRepository` for audit, result written to a typed DB table.

### 1.3 Orchestration Layer

| File | Role |
|------|------|
| `scrapers/syncService.ts` | `EconomicDataSyncService` — unified `sync(source, type)` interface; the `SyncSource` union type must be extended for every new GSS scraper |
| `schedulers/economicDataScheduler.ts` | All cron jobs in one place; has `gssIncomeSyncCron` (4 AM 1st of month) already; new GSS crons go here |
| `monitoring/economicDataMonitoringService.ts` | Health checks for BOG, WDI, FX freshness; `DataFreshnessCheck` must be extended for new GSS sources |
| `apiPullIntegrationService.ts` | Handles partner-API pulls with OAuth/API-key auth, rate limiting, batch fallback; GSS PxWeb is public (no auth), so it does **not** go here |

### 1.4 Microservice Stubs (Empty — GSS Goes Here)

Two placeholder directories currently contain only `.gitkeep`:

```
data-hub/microservices/acquisition/tier3c-economic-construction-data/
  macroeconomic/          ← EMPTY — GSS macro syncs (PPI, MIEG, GDP, interest rates) go here
  construction-materials/ ← EMPTY — GSS trade HS2 import tracking goes here
```

These are the correct locations for the tier-3c microservice wrappers that call the scrapers above.

### 1.5 Storage Targets

| Store | What it holds |
|-------|--------------|
| PostgreSQL (`postgres-postgis/`) | All persistent time-series: `economic_indicators`, `material_prices`, `labor_rates`, `regional_household_income`, + new GSS tables |
| Redis (`redis/`) | Short-lived cache: FX, latest indicators, monitoring state |
| ClickHouse (`clickhouse/`) | Analytics time-series for high-cardinality queries |
| OpenSearch (`opensearch/`) | Full-text search over properties and listings |
| MinIO (`minio/`) | Raw file uploads, batch data |

### 1.6 Analytics Layer (Consumers of Data-Hub)

`services/analytics/` services consume what the Data Hub populates. They never call external APIs
directly. The data flow is strictly:

```
External APIs/Scrapers
  → data-hub/scrapers/*     (acquisition)
  → data-hub ETL             (normalise, quality score, deduplicate)
  → PostgreSQL tables        (persistent store)
  → services/analytics/*    (aggregation, index computation, ML)
  → API routes               (consumer-facing endpoints)
```

Any new GSS data must enter through `data-hub/scrapers/` and be stored in a typed table **before**
any analytics service references it.

---

## 2. Existing Analytics Services — Full Inventory

### 2.1 Construction Cost Index (`constructionCostIndexService.ts`)

**What is built:**
- National CCI: Materials 55% + Labor 35% + Overhead 10%, base 100 at Jan 2024
- Regional CCI with transport/infrastructure multipliers (`regional_cost_data`)
- 24-month history, material price tracking, labor rate tracking

**Data-hub feeds it:**
- `material_prices` ← `localMaterialScraper.ts` + `npaScraper.ts`
- `labor_rates` ← `gssLaborService.ts` (min-wage multipliers, not AHIES)
- `construction_cost_index_analytics` ← `constructionCostService.ts` + index recalc pipeline

**Genuine gaps:**
- `change_yoy` is suppressed (capped at ±40%) because there is no authoritative external price-level anchor — **PPI Construction from GSS is the fix**
- Materials sub-index has no import-cost component (steel/cement are 60–70% imported) — **GSS Trade HS2 imports fix this**
- Labor sub-index is built on minimum-wage multipliers, not actual earned wages by skill — **AHIES sector-level earnings can calibrate this**
- No IIP signal for supply-side tightness

---

### 2.2 Ghana Housing Affordability Index (`ghaiService.ts`)

**What is built:**
- GHAI composite = w₁(MHAI) + w₂(CHAI) + w₃(RHAI) per region
- MHAI (mortgage), CHAI (cash/savings), RHAI (rental), CAI, LAI, MAS sub-indices
- 19 regional weight matrices (mortgage/cash/rental split) — currently hardcoded

**Data-hub feeds it:**
- `regional_household_income` ← `gssIncomeService.ts` ✅ **SHIPPED**
- `economic_indicators.lending_rate` ← `bogScraper.ts` ✅
- `properties` median price ← internal transaction data ✅
- Formal employment % ← **STILL HARDCODED at 15%** — not from data-hub
- Regional GHAI weights ← **STILL HARDCODED** — not from data-hub

**Genuine gaps:**
- `calculateMAS()` uses a global 15% formal employment rate; PHC 2021 sector data would make this regional
- Weight matrix (mortgage/cash/rental split) is authored manually; PHC tenure arrangement data would auto-derive it
- RHAI uses a single 30% rent burden threshold; income distribution bands would segment this

---

### 2.3 Market Intelligence (`marketIntelligenceService.ts`)

**What is built:**
- Property Price Index (nominal + real), MoM/QoQ/YoY per region and type
- Market activity: transactions, listings, absorption, DOM, supply/demand temperature
- `real_index` now uses `economic_indicators.inflation_rate` ✅ **SHIPPED** (was null)

**Data-hub feeds it:**
- `economic_indicators.inflation_rate` ← `bogScraper.ts` / `gssIncomeService.ts` self-heals latest ✅
- `property_transactions`, `properties` ← internal

**Genuine gaps:**
- No macro overlay: GDP growth cycle, interest rate regime not surfaced on price charts
- No supply-pipeline signal: IIP manufacturing, construction starts

---

### 2.4 Rental Analytics (`rentalAnalyticsService.ts`)

**What is built:**
- Avg/median rent, rent per sqm, gross/net yield, vacancy, rent by bedrooms
- Rental price time-series, lease term analytics, benchmarks

**Genuine gaps:**
- No rent-to-income ratio — `regional_household_income` now exists (from AHIES) but is not yet joined in rental queries
- No housing cost burden segmentation (% of households in each burden band)
- No tenure-mix signal on market depth (% of district renting)

---

### 2.5 Investment Scoring (`investmentScoringService.ts`)

**What is built:**
- Composite opportunity score (0–100): cap_rate + price_growth + rental_growth + absorption + risk (each 0–20)
- `risk_score = max(0, 20 - vacancy×20 - risk_premium×5)` — vacancy and static risk premium only

**Genuine gaps:**
- Risk score has no macro dimension: NPL ratio, credit growth, MIEG contraction are not inputs
- Absorption rate has no migration/urbanisation demand signal
- Poverty index not factored — high-MPI districts have structural default risk

---

### 2.6 Valuation Analytics (`valuationAnalyticsService.ts`)

**What is built:**
- Volume/value metrics, method performance, valuer leaderboard, market-relative analytics, outlier detection

**Genuine gaps:**
- Cost approach uses internal CCI; no PPI anchor for calibration validation
- No income-normalised Price-to-Income ratio in market-relative analytics

---

### 2.7 Floor Plan Analytics (`floorPlanAnalyticsService.ts`)

**What is built:**
- GFA/NIA/efficiency ratios, room-size code compliance, GFA distribution buckets

**Genuine gaps:**
- No census baseline for room counts or sleeping rooms by district — can't contextualise a property against district norms
- No district-level material quality baseline (cement block vs. mud brick prevalence)

---

### 2.8 Short-Stay Metrics (`shortStayMetricsService.ts`)

**What is built:**
- Occupancy, ADR, RevPAR by neighbourhood/platform, competitive benchmarks, trends

**Genuine gaps:**
- No macro or tourism demand signal: MIEG, domestic visitor volumes

---

### 2.9 ML Analytics (`mlAnalyticsService.ts`)

**What is built:**
- ML service health, AVM monitoring, price forecasting via Python microservice
- Sentiment/NER/document intelligence, Market Confidence Index

**Genuine gaps:**
- Price forecasts do not use GSS macro variables as features (PPI, MIEG, lending rate)
- MCI is purely sentiment-derived — no macro confirmation signal

---

### 2.10 Alert Service (`alertService.ts`)

**What is built:**
- Threshold rules (gt/lt/change/deviation), severity levels, cooldown, lifecycle management

**Genuine gaps:**
- No pre-built GSS macro trigger rules (PPI spike, MIEG contraction, NPL deterioration)

---

## 3. GSS StatsBank — Complete Data Catalogue

> All endpoints: `https://statsbank.statsghana.gov.gh/api/v1/en/{path}`

### 3.1 Macroeconomic Indicators

#### Prices & Inflation

| Table ID | Dataset | Path | Updated | Key Dimensions |
|----------|---------|------|---------|----------------|
| `cpi.px` | Consumer Price Index & Inflation | `Macroeconomic Indicators/Prices and Inflation/cpi.px` | 2026-02 | Indicator (CPI, YoY%, MoM%), Month |
| `ppi.px` | **Producer Price Index** | `Macroeconomic Indicators/Prices and Inflation/ppi.px` | 2026-05 | Month, Indicator (PPI, YoY%, MoM%), **Industry (incl. "Construction", "Manufacturing")** |
| `iip.px` | Index of Industrial Production | `Macroeconomic Indicators/Prices and Inflation/iip.px` | 2025-12 | Month, Industry sector |
| `commodity_price.px` | Commodity Prices | `Macroeconomic Indicators/Prices and Inflation/commodity_price.px` | 2024-09 | Month, Commodity |

#### Real Sector (GDP)

| Table ID | Dataset | Path | Updated | Key Dimensions |
|----------|---------|------|---------|----------------|
| `qgdp_p_px.px` | **Quarterly GDP — Production** | `Macroeconomic Indicators/Real Sector (GDP)/Quarterly GDP/qgdp_p_px.px` | 2026-06 | Quarter, Industry sector |
| `qgdp_e_px.px` | Quarterly GDP — Expenditure | `Macroeconomic Indicators/Real Sector (GDP)/Quarterly GDP/qgdp_e_px.px` | 2026-06 | Quarter, Component |
| `agdp_p_p.px` | Annual GDP — Production | `Macroeconomic Indicators/Real Sector (GDP)/Annual GDP/agdp_p_p.px` | 2026-05 | Year, Sector |
| `agdp_e_px.px` | Annual GDP — Expenditure | `Macroeconomic Indicators/Real Sector (GDP)/Annual GDP/agdp_e_px.px` | 2026-05 | Year, Component |
| `mieg_px_March26.px` | **Monthly Economic Growth Indicator** | `Macroeconomic Indicators/Monthly Indicator of Economic Growth(MIEG)/mieg_px_March26.px` | 2026-06 | Month (Jan-23+), **Variable (Agriculture, Industry, Services, Total)**, Series (Index 2023=100, YoY%) |

#### External Sector

| Table ID | Dataset | Path | Key Dimensions |
|----------|---------|------|----------------|
| `exchange_rates.px` | Exchange Rates | `Macroeconomic Indicators/External Sector/exchange_rates.px` | Month, Currency pair |
| `int_fin.px` | International Finance | `Macroeconomic Indicators/External Sector/int_fin.px` | Month, Indicator |
| `macro_trade.px` | International Merchandise Trade | `Macroeconomic Indicators/External Sector/macro_trade.px` | 2025-12 | Month, Tradeflow |

#### Monetary & Financial Sector

| Table ID | Dataset | Path | Updated | Key Dimensions |
|----------|---------|------|---------|----------------|
| `interest.px` | **Interest Rates** | `Macroeconomic Indicators/Monetary and Financial Sector/interest.px` | 2024-09 | Month, Rate (**Average lending rate**, Ghana reference rate, Interbank, **Monetary policy rate**, Savings, **91-day T-bill**) |
| `fin_sound.px` | **Financial Soundness Indicators** | `Macroeconomic Indicators/Monetary and Financial Sector/fin_sound.px` | 2024-09 | Month, Indicator (**Capital adequacy ratio**, **NPL ratio**, Return on assets, Liquidity ratios) |
| `monetary.px` | Monetary Data | `Macroeconomic Indicators/Monetary and Financial Sector/monetary.px` | 2024-09 | Month, Indicator (M1, M2, credit) |

#### Fiscal & Other

| Table ID | Dataset | Key Dimensions |
|----------|---------|----------------|
| `debt_data.px` | Debt Data | Quarter, Debt type |
| `fiscal_data.px` | Fiscal Data | Revenue, Expenditure |
| `fuel.px` | **Fuel Consumption** | Quarter, Fuel type (diesel, petrol, LPG) |

---

### 3.2 Trade Database

| Table ID | Dataset | Path | Updated | Key Dimensions |
|----------|---------|------|---------|----------------|
| `trade_detail_hs2.px` | **Trade by HS2 digit** | `Trade/trade_detail_hs2.px` | 2025-03 | Year, Month, Tradeflow (Import/Export), **HS2 code**, Partner Country, Valuation (GHS/USD/weight) |
| `trade_detail_hs10.px` | Trade by HS10 digit | `Trade/trade_detail_hs10.px` | 2025-03 | Year, Month, HS10 code |
| `trade_uvi.px` | **Trade Unit Value Indices** | `Trade/trade_uvi.px` | 2025-03 | Month, Tradeflow, Price index |

> **Construction-relevant HS2 codes for import tracking:**
> 25 (cement/stone), 27 (fuel), 39 (plastics/PVC), 44 (timber), 68 (stone/plaster), 69 (tiles),
> 70 (glass), 72 (iron/steel), 73 (steel articles), 76 (aluminium), 94 (furniture/fittings)

---

### 3.3 PHC 2021 StatsBank (Population & Housing Census)

> **Resolution:** National → Region → **District (260+ districts)** on all tables  
> **Locality split:** All / Urban / Rural on every table  
> **Cadence:** Census — static until PHC 2031

#### Housing (13 tables)

| Table ID | Dataset | Key Variables |
|----------|---------|--------------|
| `typeofdwelling_table.px` | Type of Dwelling | Compound, Detached, Semi-detached, Flat/apartment, Improvised |
| `ownership.px` | **Ownership Structure** | Owner-occupied, Family property, **Estate developer**, Public/Government |
| `Tenure_arrangement.px` | **Tenure/Holding Arrangement** | **Owner occupied**, **Renting**, Rent-free, **Perching**, Squatting, Caretaker |
| `num_rooms.px` | **Number of Rooms** | 1–9+ rooms |
| `sleep_rooms.px` | **Number of Sleeping Rooms** | 1–9+ sleeping rooms |
| `wall_material.px` | **Outer Wall Material** | Cement blocks, Mud/earth, Wood, Metal, Bamboo |
| `roofing_material.px` | **Roofing Material** | Metal sheets, Concrete, Wood, Thatch |
| `flooring_material.px` | **Floor Material** | Cement, Tiles, Earth, Wood |
| `main_light.px` | Lighting Source | Grid electricity, Solar, Kerosene, None |
| `cooking_fuel.px` | Cooking Fuel | LPG, Wood, Charcoal, Electricity |
| `cooking_space.px` | Cooking Space | Separate kitchen, Open space, None |
| `bathing_facility.px` | Bathing Facility | Facility type |
| `typeofresidence_table.px` | Type of Residence | Permanent, Temporary, Improvised |

#### Structures (4 tables)

| Table ID | Dataset | Key Variables |
|----------|---------|--------------|
| `Struc_type_table.px` | Type of Structure | Residential, Commercial, Institutional, Industrial |
| `res_struc_table.px` | **Residential Structure Type** | Detached house, Bungalow, **Flat/apartment**, Compound house |
| `Levelof_completion_res_table.px` | **Residential Completion Level** | **Fully completed**, Roofed-uncompleted, Partially roofed, Roofing level, **Lintel level** |
| `Levelof_completion_struc_table.px` | All Structures Completion | Same stages, all structure types |

#### Population (11 tables)

| Table ID | Dataset | Key Variables |
|----------|---------|--------------|
| `projections.px` | **Population Projections 2021–2035** | Year (2021–2035), Region (16), Age group, Sex, Locality |
| `avg_hhsize_table.px` | **Average Household Size** | District, Region, Locality |
| `hhsize_table.px` | Household Size Distribution | Size (1–9+), District |
| `population_table.px` | Population by age/sex/education | District, Single age, Sex, Education |
| `birth_table.px` | Place of Birth | District, Age, Sex |
| `ethnic_table.px` | Ethnic Group | District, Locality |
| `marital_table.px` | Marital Status | District, Age, Sex |
| `health_insurance.px` | NHIS Health Coverage | District, Age, Sex |
| `religion_table.px` | Religious Affiliation | District, Locality |
| `nationality_table.px` | Nationality | District |
| `population_table2_locality2.px` | Population by Urban/Peri-urban/Rural | District, Age, Sex |

#### Economic Activity (9 tables)

| Table ID | Dataset | Key Variables |
|----------|---------|--------------|
| `econact_table.px` | **Economic Activity Status (15+)** | **Employment status**, District, Locality, Age, Sex |
| `Unemployment_table_2.px` | **Unemployment Rate** | District, Locality, Age, Sex |
| `sector_table.px` | **Sector of Employment** | **Public / Private formal / Private informal**, District |
| `status_table.px` | Employment Status | Employee, Employer, Self-employed, District |
| `industry_table.px` | Industry of Employment | ISIC code, District |
| `occupation_table.px` | Occupation | ISCO code, District |

#### Multidimensional Poverty (5 tables)

| Table ID | Dataset | Key Variables |
|----------|---------|--------------|
| `MPI_by_locality.px` | **MPI by Locality** | **Incidence (H)**, **Intensity (A)**, **MPI (M0)**, District, Region |
| `MPI_by_sex.px` | MPI by HH Head Sex | District, Region |
| `MPI_by_education.px` | MPI by HH Head Education | District, Region |
| `MPI_by_industry.px` | MPI by HH Head Industry | District, Region |
| `MPI_contributors.px` | **Contributors to MPI** | Dimension contributions (education, health, housing, etc.) |

#### Water & Sanitation (12 tables)

| Table ID | Dataset | Key Variables |
|----------|---------|--------------|
| `mainwater_table.px` | **Main Drinking Water Source** | Piped, Borehole, Surface, Tanker, Sachet |
| `service_table.px` | **Improved Water Service Level** | Safely managed, Basic, Limited, Unimproved |
| `toiletfacility_table.px` | **Toilet Facility Type** | Flush, KVIP, Pit latrine, None |
| `solidDisposal_table.px` | **Solid Waste Disposal** | Public collection, Dump site, Burning |
| `timetaken.px` | Time to Water Source | Minutes, District |

#### ICT (7 tables)

| Table ID | Dataset | Key Variables |
|----------|---------|--------------|
| `ownict_table_1.px` | **Smartphone Ownership (6+)** | District, Locality, Age, Sex |
| `use_internet_on_device_1.px` | **Mobile Internet Use (last 3 months)** | District, Locality |

#### Human Development Indicators

| Table ID | Dataset | Key Variables |
|----------|---------|--------------|
| `National_trends.px` | HDI Trends | Year, HDI, GNI per capita, Life expectancy |
| `National_GDI.px` | Gender Development Index | Male/Female HDI components |

---

### 3.4 Annual Household Income & Expenditure Survey (AHIES)

> **Survey period:** 2022Q1–2023Q3 quarterly | **Resolution:** National + 16 Regions + Urban/Rural

| Table ID | Dataset | Key Variables |
|----------|---------|--------------|
| `mean_earnings.px` | **Mean Hourly Earnings (GHS)** | Quarter, **Region (16)**, Locality, Education, Sex, Age |
| `med_earnings.px` | **Median Hourly Earnings (GHS)** ← **already consumed by gssIncomeService** | Same dimensions |
| `unemploy.px` | Unemployment Rate | Region, Locality, Age, Sex, Education |
| `emp_sec.px` | **Employment Sector (Formal/Informal)** | Region, Locality |
| `informality.px` | **Informal Sector Employment** | Employment status within informal, Region |
| `vulnerable.px` | Vulnerable Employment | Region, Locality |
| `industry.px` | Industry of Employment | ISIC, Region |
| `occupa.px` | Occupation | ISCO, Region |
| `managerial.px` | Share of Managerial Positions | Region, Sex |
| `neet.px` | **Youth NEET (15–35)** | Region, Locality, Age, Sex |
| `data_econact.px` | Economic Activity Status | Region, Locality |
| `inactivity.px` | Reasons Outside Labour Force | Region, Sex |

---

### 3.5 GLSS7 (Ghana Living Standards Survey 7)

> **Survey:** 2016/17 cross-section — older but richer micro-data on expenditure, housing, migration

#### Housing (18 tables — key ones)

| Table ID | Dataset | Key Variables |
|----------|---------|--------------|
| `Table_7.2.px` | **Occupancy Status** | Owner/Renter/Rent-free/Perching, Locality, Region |
| `Table_7.3.px` | **Rent Payment & Payee** | Payee (Relative, Private, Government, Employer), Locality, Region |
| `Table_7.4.px` | Home Improvements/Additions | Type, Locality, Region |
| `Table_7.6.px` | Outer Wall Material | Locality, Region |

#### Migration (9 tables)

| Table ID | Dataset | Key Variables |
|----------|---------|--------------|
| `Table_6.4.px` | **Inter-regional Migration Flows** | Origin region × Destination region (% flow matrix) |
| `Table_6.15.px` | **Domestic Overnight Tourists** | Sex, Locality, Region |
| `Table_6.2.px` | Migration Status (7+) | Locality, Region |

#### Economic (3 tables)

| Table ID | Dataset | Key Variables |
|----------|---------|--------------|
| `Table_5.5.px` | Labour Force Participation | Age group, Sex, Locality, Region |
| `Table_5.6.px` | Employment-to-population ratio | Age group, Sex, Locality, Region |

---

### 3.6 Education (Admin)

| Table ID | Dataset | Path | Updated | Key Dimensions |
|----------|---------|------|---------|----------------|
| `enrollment.px` | **Education Trend Statistics** | `Education(Admin)/enrollment.px` | 2025-03 | Year, Region, School level (KG–Tertiary) |

---

## 4. What Already Exists vs. What Is Genuinely Missing

### 4.1 Already Built / Covered

| Gap | Status | Where it lives | Live data |
|-----|--------|---------------|-----------|
| Regional household income (AHIES `med_earnings.px` + PHC household size + employment rate) | ✅ **SHIPPED** | `data-hub/gssIncomeService.ts` → `regional_household_income` → `ghaiService` | 32 rows, latest 2026-07 |
| GSS CPI self-heal (real index deflator for Market Intelligence) | ✅ **SHIPPED** | `gssIncomeService.ts` side-effect; `marketIntelligenceService.real_index` now non-null | BoG + GSS aligned |
| GSS PxWeb client pattern (pxPost/pxGet over native HTTPS) | ✅ **SHIPPED** | `data-hub/gssIncomeService.ts` lines 1–80 | Pattern proven |
| Monthly GSS sync cron slot | ✅ **SHIPPED** | `schedulers/economicDataScheduler.ts` — `gssIncomeSyncCron: '0 4 1 * *'` | Active |
| BOG exchange rates, interest rates, CPI | ✅ **SHIPPED** | `scrapers/bogScraper.ts` | Monthly |
| WDI GDP growth, macro indicators | ✅ **SHIPPED** | `scrapers/wdiClient.ts` | Quarterly |
| Fuel prices (NPA / GlobalPetrolPrices) | ✅ **SHIPPED** | `scrapers/npaScraper.ts` | Weekly |
| Construction material prices | ✅ **SHIPPED** | `scrapers/localMaterialScraper.ts` | Weekly |
| GREDA/BRRI specialized construction costs | ✅ **SHIPPED** | `scrapers/gredaScraper.ts` | Monthly |
| Sync audit log | ✅ **SHIPPED** | `scrapers/syncLogRepository.ts` | Active |
| Economic data monitoring (BOG, WDI, FX freshness) | ✅ **SHIPPED** | `monitoring/economicDataMonitoringService.ts` | Active |
| **GSS PPI Construction series** | ✅ **SHIPPED (Slice 1)** | `scrapers/gssPpiService.ts` → `gss_ppi_construction_series` | **102 rows, latest 2026-03** |
| **GSS MIEG monthly economic growth** | ✅ **SHIPPED (Slice 1)** | `scrapers/gssMiegService.ts` → `gss_mieg_monthly` | **156 rows (4 vars × 39 months), latest 2026-03** |
| **GSS Quarterly GDP (production + expenditure)** | ✅ **SHIPPED (Slice 1)** | `scrapers/gssMiegService.ts` → `gss_quarterly_gdp` | **597 rows, latest Q1 2026** |
| **GSS Interest Rates (lending, policy, T-bill)** | ✅ **SHIPPED (Slice 1)** | `scrapers/gssFinancialService.ts` → `gss_interest_rates_monthly` | **2,235 rows, latest 2024-07** |
| **GSS Financial Soundness (NPL, capital adequacy)** | ✅ **SHIPPED (Slice 1)** | `scrapers/gssFinancialService.ts` → `gss_financial_soundness_monthly` | **1,776 rows, latest 2024-06** |
| **Formal employment % by region** | ✅ **SHIPPED (Slice 1)** | `gssIncomeService.ts` extended → `regional_household_income.formal_employment_pct` | **16 regions populated** (Greater Accra 33.2%, Northern 8–9%) |
| **CCI `change_yoy` suppression fix** | ✅ **SHIPPED (Slice 1)** | `analytics/constructionCostIndexService.ts` — blended PPI (α=0.6) | Materials index now authoritative |
| **Market Intelligence MIEG macro overlay** | ✅ **SHIPPED (Slice 1)** | `analytics/marketIntelligenceService.ts` — `mieg_growth_yoy`, `gdp_growth_context`, `interest_rate_cycle` | Returns live macro context |
| **Investment scoring macro risk (NPL)** | ✅ **SHIPPED (Slice 1)** | `analytics/investmentScoringService.ts` — `macro_risk_score` in `opportunity_factors` | NPL + policy rate penalty applied |
| **GHAI MAS — real regional employment %** | ✅ **SHIPPED (Slice 1)** | `analytics/ghaiService.ts` — reads `regional_household_income.formal_employment_pct` | No longer hardcoded at 15% |
| **Migrations 260–262** | ✅ **SHIPPED (Slice 1)** | `database/migrations/260_*.sql`, `261_*.sql`, `262_*.sql` | Applied 2026-06-30 |
| **GSS macro monitoring checks** | ✅ **SHIPPED (Slice 1)** | `monitoring/economicDataMonitoringService.ts` — `checkTableFreshness()` | 5 new checks active |
| **Scheduler crons (PPI, MIEG, Financial)** | ✅ **SHIPPED (Slice 1)** | `schedulers/economicDataScheduler.ts` — 15th, 20th, 12th of month | Wired to Monday chain |
| **Tier-3c microservice wrappers (Slice 1)** | ✅ **SHIPPED (Slice 1)** | `tier3c-*/macroeconomic/gss-ppi-sync.ts`, `gss-mieg-sync.ts`, `gss-financial-sync.ts` | Delegates to scraper services |
| **GSS PHC 2021 Housing Census** | ✅ **SHIPPED (Slice 2)** | `scrapers/gssPhcHousingService.ts` → 5 tables | **80 rows** (16 regions × 5 tables). Tenure: Accra 47.6% renting, Completion: Central 17.8% incomplete, NIQS: Accra 66.25 |
| **GSS Trade HS2 Construction Imports** | ✅ **SHIPPED (Slice 2b)** | `scrapers/gssTradeService.ts` → `gss_construction_material_imports` | **660 rows** (11 HS2 codes, Jan 2021–Dec 2025) |
| **GHAI census-derived regional weights** | ✅ **SHIPPED (Slice 2)** | `analytics/ghaiService.ts` — `computeWeightsFromCensus()` | Accra rental_weight ~0.42 (was hardcoded 0.30) |
| **Rental market depth + rent-to-income** | ✅ **SHIPPED (Slice 2)** | `analytics/rentalAnalyticsService.ts` — `enrichWithGssData()` | `rent_to_income_ratio` + `formal_rental_market_depth_pct` in all rental summaries |
| **Floor plan material quality baseline** | ✅ **SHIPPED (Slice 2)** | `analytics/floorPlanAnalyticsService.ts` — `district_material_quality_score` | Returns PHC 2021 material quality score for region |
| **Investment CCRI completion risk** | ✅ **SHIPPED (Slice 2)** | `analytics/investmentScoringService.ts` — `ccri_risk_score` in `opportunity_factors` | Incomplete residential % × macro stress applied to risk score |
| **CCI import pressure (GCMIPI)** | ✅ **SHIPPED (Slice 2b)** | `analytics/constructionCostIndexService.ts` — `import_material_pressure` field | HS2 unit value index history in national CCI summary |
| **Migrations 263 + 264** | ✅ **SHIPPED (Slice 2)** | `database/migrations/263_*.sql`, `264_*.sql` | Applied 2026-06-30 |
| **Tier-3c wrapper (Trade HS2)** | ✅ **SHIPPED (Slice 2b)** | `tier3c-*/construction-materials/gss-trade-hs2-sync.ts` | Delegates to gssTradeService |
| **GSS PHC 2021 Population + Household Size** | ✅ **SHIPPED (Slice 3)** | `scrapers/gssPhcPopulationService.ts` → `gss_phc_population_projections` + `gss_phc_household_size_by_district` | **256 rows** (240 projections = 16 regions × 2021–2035 + 16 household size). Accra 20–40 cohort 2.08M→2.20M (2030) |
| **GSS PHC 2021 Employment** | ✅ **SHIPPED (Slice 3)** | `scrapers/gssPhcEmploymentService.ts` → `gss_phc_employment_by_district` (+backfills `regional_household_income.formal_employment_pct`) | **16 rows**. Accra formal 34.0% / informal 65.6% / unemployment 12.9%. Census now authoritative for GHAI MAS |
| **GSS PHC 2021 Multidimensional Poverty** | ✅ **SHIPPED (Slice 3)** | `scrapers/gssPhcPovertyService.ts` → `gss_phc_mpi_by_district` | **16 rows** (H/A/M0 + female/male-headed + contributors). Full-precision M0 = H×A recovers GSS's 1dp-collapsed band: Accra 0.051 (low) → Savannah 0.227 (high) |
| **Shared PxWeb client** | ✅ **SHIPPED (Slice 3)** | `scrapers/gssPhcShared.ts` — generic `pxGetValue()` json-stat2 resolver | Dimension-order-safe (uses `id`/`size` strides); replaces per-table stride math for all 3 Slice 3 scrapers |
| **Regional Housing Demand Score (RHDS)** | ✅ **SHIPPED (Slice 3)** | `analytics/housingDemandScoreService.ts` → `regional_housing_demand_scores` | 0–100 composite (pop-growth + employment + earnings, min–max normalised; migration weight redistributes till Slice 4). Top: Northern 59.8, North East 58.2 |
| **Investment MPI poverty discount + badge** | ✅ **SHIPPED (Slice 3)** | `analytics/investmentScoringService.ts` — `mpi_risk_score` in `opportunity_factors` + `mpi_risk_level` | `mpiPenalty = min(M0×0.5, 0.10)`; badge low/moderate/high across all 64 opportunities |
| **GHAI MAS census upgrade** | ✅ **SHIPPED (Slice 3)** | `analytics/ghaiService.ts` — prefers `gss_phc_employment_by_district.formal_employment_pct` | Census (authoritative) → AHIES → national-avg fallback chain |
| **Demand API + `/analytics/demand` page** | ✅ **SHIPPED (Slice 3)** | `routes/analyticsFoundation.ts` (`GET /demand`, `/demand/scores`, `POST /demand/recompute`) + `dashboard/analytics/demand/page.tsx` + nav + RBAC `analytics-demand` | Heatmap + top-5 + cohort/employment bars + RHDS decomposition |
| **Migration 265** | ✅ **SHIPPED (Slice 3)** | `database/migrations/265_gss_phc_population_employment_poverty.sql` | Applied 2026-07-01 (5 tables). NOTE: sequential 265, not spec's placeholder 271 |
| **Scheduler + monitoring (Slice 3)** | ✅ **SHIPPED (Slice 3)** | `economicDataScheduler.ts` cron `0 2 2 1 *` (Jan 2nd, chains pop→emp→pov→RHDS) + catch-up + `economicDataMonitoringService.ts` 3 freshness checks | Annual census cadence |

> **Slice 1 bug fixes applied during run (2026-06-30):**
> - `gssMiegService.ts`: MIEG dimension value codes corrected (`'AGRICULTURE'` not `'Agriculture_MIEG'`); `buildMap` stride arithmetic fixed for 3-dimensional json-stat2 response
> - `gssIncomeService.ts`: `sector_table.px` dimension codes corrected (`'Public (Government)'`, `'Private Formal'`); all 6 dimensions now specified
> - `syncService.ts`: `gss_all` / `construction_all` / `all` switch cases wrapped in blocks to resolve `const` redeclaration TS errors

### 4.2 Partially Built / Wrong Approach

| Gap | Situation | What's needed |
|-----|-----------|--------------|
| ~~GSS labor earnings calibration~~ ✅ **RESOLVED** | `gssLaborService.ts` now anchors trade rates to **AHIES regional median hourly earnings** (`regional_household_income.median_hourly_earnings_ghs`): `medianHourly × 8h × trade_multiplier × 0.7`, min-wage kept only as a floor. Accra labourer ₵22.7→₵48.7, block mason ₵56.7→₵121.8, master mason ₵90.8→₵194.9. Source tag `ahies_median_earnings`; legacy min-wage formula is the fallback when AHIES unavailable. | — done |
| ~~GHAI regional weights hardcoded~~ ✅ **RESOLVED** | Deleted the 19-region hardcoded `REGIONAL_WEIGHTS` matrix in `ghaiService.ts`; weights now census-derived (`weightsFromCensus` from renting/owner-occupied/formal-employment) with a neutral national prior fallback. `calculateMAS` 15% default neutralized (real formal-employment always passed in the scheduled path). Accra 0.144/0.315/0.541 vs old 0.25/0.45/0.30. | — done |
| Construction PPI anchor | BOG scrapes CPI and lending rate but not PPI; WDI doesn't have sector-level PPI | New scraper: `gssPpiService.ts` pulling `ppi.px` Construction series |
| Interest rates (for GHAI MAS, investment scoring) | BOG scraper gets lending rate BUT only monthly from website HTML; could break | Supplement with `interest.px` from GSS StatsBank as resilient backup |

### 4.3 Genuinely Missing — No Code Exists

These represent **true gaps** that need new scrapers in `data-hub/scrapers/` and consumers in
`services/analytics/` (Slices 2–5):

| Gap | Analytics Impact | GSS Source | Slice |
|-----|-----------------|------------|-------|
| ~~PPI Construction sector (monthly)~~ | ~~CCI YoY calibration~~ | ~~`ppi.px`~~ | ✅ **SHIPPED Slice 1** |
| ~~MIEG monthly economic growth~~ | ~~Investment risk, ML features~~ | ~~`mieg_px_March26.px`~~ | ✅ **SHIPPED Slice 1** |
| ~~Quarterly GDP~~ | ~~Market Intelligence macro overlay~~ | ~~`qgdp_p_px.px`~~ | ✅ **SHIPPED Slice 1** |
| ~~Financial Soundness (NPL)~~ | ~~Investment macro risk layer~~ | ~~`fin_sound.px`~~ | ✅ **SHIPPED Slice 1** |
| ~~Formal/informal employment % by region~~ | ~~GHAI MAS calibration~~ | ~~`sector_table.px`~~ | ✅ **SHIPPED Slice 1** |
| Construction material import tracking (HS2) | CCI overhead component, supply-chain risk | `trade_detail_hs2.px` HS2: 25, 44, 68–70, 72–73, 76 | Slice 2b |
| Tenure arrangement by district | Auto-derive GHAI regional weights, rental market depth | `Tenure_arrangement.px` | Slice 2 |
| Population projections 2021–2035 | Housing demand score, investment absorption | `projections.px` | Slice 3 |
| Inter-regional migration matrix | Housing demand signal, absorption rate | `Table_6.4.px` | Slice 4 |
| Residential completion levels by district | Completion risk index, AVM risk flag | `Levelof_completion_res_table.px` | Slice 2 |
| MPI by district | Investment risk discount, neighbourhood scoring | `MPI_by_locality.px` | Slice 3 |
| Infrastructure quality (water, sanitation, electricity) | AVM location factor, NIQS | PHC Water/Sanitation + `main_light.px` | Slice 2 |
| Room counts + sleeping rooms by district | Overcrowding index, floor plan context | `num_rooms.px`, `sleep_rooms.px` | Slice 2 |
| Building material prevalence by district | Material quality baseline for valuation | `wall_material.px`, `roofing_material.px`, `flooring_material.px` | Slice 2 |
| Domestic tourist volumes by region | Short-stay demand classification | `Table_6.15.px` | Slice 4 |
| Smartphone/mobile internet ownership by district | PropTech penetration index | `ownict_table_1.px`, `use_internet_on_device_1.px` | Slice 5 |
| Education enrollment by region | School-catchment scoring, HDI context | `enrollment.px` | Slice 5 |

---

## 5. Enrichment Map: Existing Analytics + GSS Data

### E-1: PPI Construction → CCI Calibration (CRITICAL)

**Service:** `constructionCostIndexService.ts`  
**Data-hub file to create:** `data-hub/scrapers/gssPpiService.ts`  
**GSS source:** `ppi.px` — Industry = "Construction", monthly, updated May 2026  
**What changes:** Add `ppi_construction_mom` and `ppi_construction_yoy` columns to
`construction_cost_index_analytics`. Anchor the materials sub-index:
```
materials_index = α × PPI_construction_index + (1-α) × internal_material_index  (α = 0.6)
```
This eliminates the rebase artifact that forces `change_yoy` suppression.

---

### E-2: Trade HS2 Imports → CCI Overhead Component

**Service:** `constructionCostIndexService.ts`  
**Data-hub file to create:** `data-hub/scrapers/gssTradeService.ts`  
**GSS source:** `trade_detail_hs2.px` — Tradeflow=Import, HS2: 25, 44, 68–70, 72–73, 76  
**What changes:** Monthly import unit value index for construction material HS2 codes. Add
`import_material_pressure` to CCI. Cross-multiply with `exchange_rates.px` (already in data-hub):
when GHS weakens, overhead weight auto-adjusts upward.  
**New table:** `gss_construction_material_imports`

---

### E-3: Formal Employment Rate → GHAI MAS Fix

**Service:** `ghaiService.ts` — `calculateMAS()`  
**Data-hub file to create:** `data-hub/scrapers/gssPhcEmploymentService.ts` (or extend `gssIncomeService.ts` which already fetches from PHC)  
**GSS source:** `sector_table.px` (PHC 2021) — Private formal + Public employment % by region  
**What changes:** Replace `formalEmploymentPct = 15` constant with regional values from the PHC table.
Expected range: Greater Accra ≈ 38%, Northern ≈ 8%, Upper East ≈ 6%.  
**New table column:** `regional_household_income.formal_employment_pct`

---

### E-4: Tenure Arrangement → Auto-Derive GHAI Regional Weights

**Service:** `ghaiService.ts` — `REGIONAL_WEIGHTS` object  
**Data-hub file to create:** `data-hub/scrapers/gssPhcHousingService.ts`  
**GSS source:** `Tenure_arrangement.px` — % renting, owner-occupied, perching, rent-free per region  
**What changes:** At each annual refresh cycle, recompute `REGIONAL_WEIGHTS`:
```
rental_weight   = min(0.50, renting_pct × 1.5)
cash_weight     = owner_occupied_pct × 0.8
mortgage_weight = formal_employment_pct × 0.4
```
**New table:** `gss_phc_tenure_by_region`

---

### E-5: MIEG + Quarterly GDP → Market Intelligence Macro Overlay

**Service:** `marketIntelligenceService.ts`  
**Data-hub file to create:** `data-hub/scrapers/gssMiegService.ts`  
**GSS sources:** `mieg_px_March26.px` (monthly), `qgdp_p_px.px` (quarterly)  
**What changes:** Add `gdp_growth_context` and `mieg_growth_yoy` to `PriceIndexSummary`. When MIEG
Services sub-index is negative for 2+ months, flag `market_temperature` as "credit-sensitive".  
**New table:** `gss_mieg_monthly`; enrich existing `property_price_index` snapshots.

---

### E-6: Interest Rates (GSS StatsBank) → Resilient Rate Feed

**Service:** `ghaiService.ts` (mortgage rate input), `investmentScoringService.ts` (cap rate context)  
**Data-hub file to create:** `data-hub/scrapers/gssFinancialService.ts`  
**GSS source:** `interest.px` — Average lending rate + Monetary policy rate, monthly  
**What changes:** Add GSS as a fallback/cross-check for BOG lending rate. If BOG scraper fails,
`gssFinancialService` provides the last known GSS rate. Enables `interest_rate_cycle` tag on price
index (easing / tightening / stable).

---

### E-7: Financial Soundness (NPL) → Investment Macro Risk

**Service:** `investmentScoringService.ts` — risk score  
**Data-hub file:** `data-hub/scrapers/gssFinancialService.ts` (same file as E-6)  
**GSS source:** `fin_sound.px` — NPL ratio, capital adequacy, monthly  
**What changes:** Add `macro_risk_score` component to `InvestmentOpportunity.opportunity_factors`:
```
macro_risk_penalty = 0.02 × max(0, NPL_ratio - 5%) + 0.01 × max(0, policy_rate - 25%)
risk_score = max(0, 20 - vacancy×20 - risk_premium×5 - macro_risk_penalty×100)
```
**New table:** `gss_financial_soundness_monthly`

---

### E-8: Migration Flows → Investment Absorption Signal

**Service:** `investmentScoringService.ts` — absorption factor  
**Data-hub file to create:** `data-hub/scrapers/gssGlss7Service.ts`  
**GSS source:** `Table_6.4.px` (GLSS7) — inter-regional migration origin × destination matrix  
**What changes:** Compute `migration_net_flow_pct` per region (in-migrants minus out-migrants as % of
base population). Add to absorption scoring weight.

---

### E-9: Population Projections → Investment Demand Signal

**Service:** `investmentScoringService.ts`  
**Data-hub file:** `data-hub/scrapers/gssPhcPopulationService.ts`  
**GSS source:** `projections.px` (PHC 2021) — 2021–2035 by region, age group, sex  
**What changes:** Compute `pop_growth_20to40_5yr_pct` per region — working-age cohort growth is
the best leading indicator of housing demand. Add as a factor to opportunity score.

---

### E-10: MPI by District → Investment Risk Discount

**Service:** `investmentScoringService.ts`  
**Data-hub file:** `data-hub/scrapers/gssPhcPovertyService.ts`  
**GSS source:** `MPI_by_locality.px` (PHC 2021)  
**What changes:** `mpi_intensity` (Poverty Intensity A, range 0–1) per district reduces opportunity
score: `mpi_discount = mpi_intensity × 10` (max 10-point penalty).  
**New table:** `gss_phc_mpi_by_district`

---

### E-11: Rent-to-Income Ratio → Rental Analytics

**Service:** `rentalAnalyticsService.ts`  
**Data-hub dependency:** `regional_household_income` already populated by `gssIncomeService.ts` ✅  
**What changes:** Join `regional_household_income.median_monthly_income` into `getRentalSummary()`.
Add `rent_to_income_ratio = median_monthly_rent / median_monthly_income` to `RentalSummary`.

---

### E-12: Tenure Mix → Rental Market Depth

**Service:** `rentalAnalyticsService.ts`  
**Data-hub dependency:** `gss_phc_tenure_by_region` from E-4  
**What changes:** Add `formal_rental_market_depth_pct` (% renting per district) to `RentalSummary`.
Districts >40% renting = liquid rental markets; <15% = illiquid / owner-dominated.

---

### E-13: Overcrowding Index → Floor Plan Analytics

**Service:** `floorPlanAnalyticsService.ts`  
**Data-hub file to create:** `data-hub/scrapers/gssPhcHousingService.ts` (shares file with E-4)  
**GSS sources:** `num_rooms.px` + `sleep_rooms.px` + `avg_hhsize_table.px`  
**What changes:** `persons_per_sleeping_room = avg_household_size / avg_sleeping_rooms` by district.
Flag properties with sleeping rooms below district census average.  
**New table:** `gss_phc_housing_profile_by_district`

---

### E-14: Material Quality Baseline → Floor Plan / Valuation

**Service:** `floorPlanAnalyticsService.ts`, `valuationAnalyticsService.ts`  
**Data-hub file:** `data-hub/scrapers/gssPhcHousingService.ts` (same file)  
**GSS sources:** `wall_material.px`, `roofing_material.px`, `flooring_material.px`  
**What changes:** `district_material_quality_score` = weighted % cement-block walls + metal/concrete
roof + tile/cement floor per district. A property with superior materials vs. district baseline
commands a documented quality premium in the Cost Approach.

---

### E-15: Domestic Tourist Volumes → Short-Stay Demand

**Service:** `shortStayMetricsService.ts`  
**Data-hub file to create:** `data-hub/scrapers/gssGlss7Service.ts` (same file as E-8)  
**GSS source:** `Table_6.15.px` (GLSS7) — domestic overnight tourists by region  
**What changes:** Tag each city/neighbourhood with `tourism_demand_type`: business-driven (Accra
CBD), leisure-driven (Volta, Western, Ashanti), mixed. Correlate RevPAR with MIEG Services sub-index
for business markets and tourist volumes for leisure markets.

---

### E-16: GSS Macro Alert Rules → Alert Service

**Service:** `alertService.ts`  
**Data-hub dependency:** Populated by new GSS scrapers above  
**What changes:** Add pre-built alert rule seeds in the migration/seed data:

| Alert | Metric | Condition | Severity | Source Table |
|-------|--------|-----------|----------|-------------|
| PPI Construction Spike | `ppi_construction_yoy` | `change_gt` 20% | Critical | `gss_ppi_construction_series` |
| Lending Rate Surge | `avg_lending_rate` | `change_gt` 3pp in quarter | Warning | `gss_interest_rates_monthly` |
| NPL Deterioration | `npl_ratio` | `gt` 12% | Critical | `gss_financial_soundness_monthly` |
| MIEG Contraction | `mieg_total_yoy` | `lt` 0% (2 consecutive months) | Warning | `gss_mieg_monthly` |
| Import Material Inflation | `construction_hs_import_uvi` | `change_gt` 15% YoY | Warning | `gss_construction_material_imports` |

---

## 6. Net-New Analytics Enabled by GSS Data

### 6.1 Ghana Construction Material Import Pressure Index (GCMIPI)

**New service:** `data-hub/scrapers/gssTradeService.ts` (acquisition)  
**New analytics consumer:** extend `constructionCostIndexService.ts`  
**New table:** `gss_construction_material_imports`

**What it is:** Monthly composite index of import price and volume pressure on Ghana's construction
material supply chain, combining trade HS2 unit values with FX.

**Formula:**
```
GCMIPI = Σ (HS_i_weight × import_unit_value_i × FX_factor) / baseline_period
  FX_factor      = current_GHS_USD / base_GHS_USD
  Basket weights = share of each HS2 category in Ghana construction material input basket
```

**Use cases:** CCI overhead component, AVM cost approach calibration, investment risk alert

---

### 6.2 Regional Housing Demand Score (RHDS)

**New service:** `analytics/housingDemandScoreService.ts`  
**Data-hub dependencies:** `gss_phc_population_projections` (E-9 scraper) + `gss_glss7_migration` (E-8 scraper) + `regional_household_income` ✅ (already exists)  
**New table:** `regional_housing_demand_scores`

**What it is:** Forward-looking district-level demand score combining demographics, migration, employment, and earnings.

**Formula:**
```
RHDS(district) = 0.30 × pop_growth_20to40_5yr_pct
               + 0.25 × migration_net_flow_pct
               + 0.20 × employment_rate
               + 0.15 × earnings_growth_yoy
               + 0.10 × mieg_services_yoy
```

**Use cases:** Investment scoring absorption factor, rental vacancy prediction, development site selection

---

### 6.3 Neighbourhood Infrastructure Quality Score (NIQS)

**New service:** `analytics/infrastructureQualityService.ts`  
**Data-hub dependencies:** `gss_phc_housing_profile_by_district` + `gss_phc_water_sanitation_by_district` (new scraper)  
**New table:** `district_infrastructure_scores`

**What it is:** 0–100 score per district from PHC 2021 infrastructure census tables.

**Formula:**
```
NIQS = 0.25 × electricity_grid_pct
     + 0.20 × piped_water_pct
     + 0.15 × improved_water_service_pct
     + 0.15 × flush_or_kvip_toilet_pct
     + 0.15 × formal_waste_collection_pct
     + 0.10 × smartphone_pct
```

**Use cases:** AVM location adjustment factor, investment risk discount, property quality scoring

---

### 6.4 District Property Market Depth Index (DPMDI)

**New analytics consumer:** `marketIntelligenceService.ts` (new method `getMarketDepth(district)`)  
**Data-hub dependencies:** `gss_phc_tenure_by_region` (E-4) + `gss_phc_housing_profile_by_district` (E-13)  
**New table:** `district_market_depth_scores`

**What it is:** How large, liquid, and formalised a district's property market is.

**Formula:**
```
DPMDI = 0.35 × (renting_pct + owner_occupied_pct)   # formal market participants
      + 0.25 × apartment_or_semidetached_pct          # formal housing stock type
      + 0.25 × employment_rate
      + 0.15 × earnings_national_percentile_rank
```

**Use cases:** Market intelligence supply/demand, comparables selection radius, valuation method selection

---

### 6.5 Construction Completion Risk Index (CCRI)

**New analytics consumer:** `investmentScoringService.ts` (new risk sub-factor)  
**Data-hub dependencies:** `gss_phc_completion_by_district` (new scraper) + `gss_ppi_construction_series` (E-1) + `gss_financial_soundness_monthly` (E-7)  
**New table:** `district_completion_risk_scores`

**What it is:** District-level risk score from incomplete residential structure prevalence, amplified by macro stress.

**Formula:**
```
CCRI(district) = incomplete_residential_pct × 100
               × (1 + 0.02 × max(0, NPL_ratio - 5)
                    + 0.01 × max(0, PPI_construction_yoy - 10))
```

**Use cases:** AVM depreciation flag for incomplete structures, investment risk input, developer pipeline risk

---

### 6.6 Rental Affordability Band Model (RABM)

**New method:** `rentalAnalyticsService.ts` — `getRentalAffordabilityBands(region, propertyType)`  
**Data-hub dependencies:** `regional_household_income` ✅ (exists) + `Unemployment_table_2` + `informality.px`  
**New table:** `rental_affordability_bands`

**What it is:** For each district, the % of population that can afford each rent band without spending >30% of income.

**Formula:**
```
For each rent_band (GHS: <500, 500–1k, 1k–2k, 2k–5k, 5k+):
  affordable_pct = P(monthly_income × 0.30 ≥ band_midpoint)
                   [log-normal parameterised from AHIES mean + median]
  risk_adj       = 1 - (informal_pct × 0.3 + unemployment_rate × 0.5)
  effective_demand_pct = affordable_pct × risk_adj
```

**Use cases:** Rental pricing strategy for developers, vacancy rate prediction, social housing gap

---

### 6.7 Mortgage Demand Potential Index (MDPI)

**New method:** `ghaiService.ts` — `getMortgageDemandPotential(region)`  
**Data-hub dependencies:** `regional_household_income` ✅ + PHC `sector_table` (E-3) + `gss_interest_rates_monthly` (E-6)  
**New table column in** `regional_household_income`: `mortgage_eligible_households`

**What it is:** Estimates the pool of mortgage-eligible households per region.

**Formula:**
```
qualifying_income    = monthly_mortgage_payment(property_price, lending_rate) / 0.35
mortgage_eligible_pct = P(monthly_income ≥ qualifying_income) × formal_employment_pct
MDPI                 = mortgage_eligible_pct × working_age_population
```

**Use cases:** Mortgage product sizing, bank partnership outreach, affordable housing scheme sizing

---

### 6.8 PropTech Market Penetration Index (PTMPI)

**New service:** `analytics/proptechPenetrationService.ts`  
**Data-hub dependencies:** `gss_phc_ict_by_district` (new scraper) + `gss_phc_housing_profile_by_district`  
**New table:** `district_proptech_scores`

**Formula:**
```
PTMPI = 0.30 × smartphone_pct + 0.30 × mobile_internet_pct
      + 0.15 × electricity_pct + 0.15 × formal_employment_pct
      + 0.10 × secondary_tertiary_enrollment_pct
```

**Use cases:** Sales/marketing resource allocation, listing portal expansion, field valuer digital tool adoption

---

### 6.9 Housing Deficit Estimation Model (HDEM)

**New service:** `analytics/housingDeficitService.ts`  
**Data-hub dependencies:** PHC projections + avg household size + completion levels + GLSS7 overcrowding  
**New table:** `district_housing_deficit_estimates`

**Formula:**
```
projected_households_2030  = projections_2030 / avg_hhsize
effective_stock            = completed_residential × avg_units_per_structure
hidden_demand              = overcrowded_households × 0.40
housing_deficit_2030       = projected_households_2030 - effective_stock + hidden_demand
```

**Use cases:** Developer market sizing, government partnership, investment opportunity discovery

---

### 6.10 Economic Shock Sensitivity Index (ESSI)

**New analytics consumer:** `investmentScoringService.ts`  
**Data-hub dependencies:** Multiple GSS macro tables (E-1 through E-7)  
**New table:** `regional_economic_shock_sensitivity`

**Formula:**
```
ESSI(region) = 0.30 × (mortgage_pct_of_buyers × avg_LTV)
             + 0.25 × (1 / formal_employment_pct)
             + 0.25 × MPI_intensity
             - 0.20 × (capital_adequacy_ratio / 100)
```

**Use cases:** Investment risk stress-testing, alert threshold calibration, portfolio risk reporting

---

## 7. Cross-Dataset Composite Models

### 7.1 PropMetrik Valuation Macro-Adjustment Factor (PVMAF)

Combines multiple GSS streams into a single multiplier applied alongside AVM output:

```
macro_adjusted_value = base_value
  × (1 + CPI_deviation_from_trend)        // cpi.px (already in data-hub)
  × (1 + PPI_construction_pressure)        // ppi.px Construction — NEW
  × (1 + GDP_growth_momentum)              // qgdp_p_px.px — NEW
  × (1 - interest_rate_drag)               // interest.px — NEW
  × (1 + NIQS_premium_discount)            // PHC infrastructure — NEW
  × (1 - CCRI_discount)                    // PHC completion risk — NEW
```

Surfaced as `macro_adjusted_value` in valuation reports alongside comparable/income/cost values.

---

### 7.2 Regional Investment Climate Index (RICI)

Quarterly composite per region published as companion to the Property Price Index:

| Component | Weight | Data-Hub Source |
|-----------|--------|----------------|
| Economic Growth (MIEG) | 20% | `gss_mieg_monthly` (NEW) |
| Inflation Pressure (PPI) | 15% | `gss_ppi_construction_series` (NEW) |
| Credit Access (Lending Rate) | 15% | `gss_interest_rates_monthly` (NEW) |
| Banking Health (NPL) | 10% | `gss_financial_soundness_monthly` (NEW) |
| Demographic Demand (RHDS) | 20% | `regional_housing_demand_scores` (NEW) |
| Infrastructure Quality (NIQS) | 10% | `district_infrastructure_scores` (NEW) |
| Income Affordability (GHAI) | 10% | `housing_affordability_index` (EXISTS ✅) |

---

### 7.3 Short-Stay Demand Forecast Model

```
RevPAR_forecast(t+1) = base_model(listing_count, seasonality)
  × (1 + 0.3 × Services_MIEG_growth)          // gss_mieg_monthly
  × (1 + 0.2 × domestic_tourist_visitor_index) // gss_glss7_migration (Table_6.15)
  × exchange_rate_factor                        // economic_indicators (EXISTS ✅)
```

---

## 8. Implementation Priority Matrix

| Priority | ID | Title | Analytics Impact | Data-Hub File | Effort |
|----------|----|-------|-----------------|---------------|--------|
| 🔴 P1 | E-1 | PPI Construction → CCI calibration | CCI YoY fix, AVM cost approach | `scrapers/gssPpiService.ts` (new) | Low |
| 🔴 P1 | E-3 | Formal employment % by region | GHAI MAS regional fix | Extend `gssIncomeService.ts` (already hits PHC) | Low |
| 🔴 P1 | E-5 | MIEG + Quarterly GDP overlay | Market Intelligence, ML features | `scrapers/gssMiegService.ts` (new) | Low |
| 🔴 P1 | E-6+E-7 | Interest rates + FSI (NPL) | GHAI resilience, investment macro risk | `scrapers/gssFinancialService.ts` (new) | Low |
| 🔴 P1 | 6.2 | Regional Housing Demand Score (RHDS) | Investment absorption, vacancy model | `scrapers/gssPhcPopulationService.ts` + `analytics/housingDemandScoreService.ts` | Medium |
| 🟠 P2 | E-4 | Tenure arrangement → GHAI weights | Auto-calibrate 19 hardcoded region weights | `scrapers/gssPhcHousingService.ts` (new) | Low |
| 🟠 P2 | E-2 | HS2 import tracking → CCI overhead | Construction cost import component | `scrapers/gssTradeService.ts` (new) | Medium |
| 🟠 P2 | 6.3 | Neighbourhood Infrastructure Score (NIQS) | AVM location factor (NEW) | `scrapers/gssPhcHousingService.ts` + `analytics/infrastructureQualityService.ts` | Medium |
| 🟠 P2 | 6.5 | Construction Completion Risk (CCRI) | Investment risk, AVM risk flag | `scrapers/gssPhcCompletionService.ts` + extend `investmentScoringService.ts` | Medium |
| 🟠 P2 | E-11 | Rent-to-income ratio | Rental analytics enrichment | No new data-hub file needed — join `regional_household_income` in query | Low |
| 🟠 P2 | E-8+E-9 | Migration + population demand | Investment absorption | `scrapers/gssGlss7Service.ts` + `scrapers/gssPhcPopulationService.ts` | Medium |
| 🟡 P3 | 6.4 | District Market Depth (DPMDI) | Market intelligence supply/demand | Depends on E-4 + E-13 scrapers | Low |
| 🟡 P3 | E-13+E-14 | Overcrowding + material baseline | Floor plan analytics enrichment | `scrapers/gssPhcHousingService.ts` (same file as E-4) | Low |
| 🟡 P3 | 6.6 | Rental Affordability Bands (RABM) | Rental pricing intelligence | New method in `rentalAnalyticsService.ts` | Medium |
| 🟡 P3 | 6.7 | Mortgage Demand Potential (MDPI) | GHAI, bank product sizing | New method in `ghaiService.ts` | Medium |
| 🟡 P3 | E-16 | GSS macro alert rules | Alert Service pre-built triggers | Migration seed data only | Low |
| 🟢 P4 | 6.8 | PropTech Penetration Index (PTMPI) | Market expansion intelligence | `scrapers/gssPhcIctService.ts` + `analytics/proptechPenetrationService.ts` | Low |
| 🟢 P4 | 6.9 | Housing Deficit Model (HDEM) | Developer intelligence | `analytics/housingDeficitService.ts` | High |
| 🟢 P4 | 6.10 | Economic Shock Sensitivity (ESSI) | Risk stress-testing | Extend `investmentScoringService.ts` | Medium |
| 🟢 P4 | E-15 | Short-stay tourist demand signal | Short-stay RevPAR forecast | `scrapers/gssGlss7Service.ts` (same file as E-8) | Low |

---

## 9. Canonical GSS Integration File Tree

This section is the authoritative reference for **exactly where every GSS-related file lives**. Do
not create a separate `external/` folder, do not add a `gss/` subdirectory — all new scrapers follow
the existing flat `data-hub/scrapers/` pattern, and all new analytics follow the existing flat
`analytics/` pattern.

```
backend/src/services/data-hub/
│
├── scrapers/                          ← ALL external source adapters (flat — keep this way)
│   ├── bogScraper.ts                  ✅ EXISTS — BOG website: CPI, rates, FX
│   ├── bogDailyFxScraper.ts           ✅ EXISTS — BOG daily interbank FX
│   ├── fxFeedService.ts               ✅ EXISTS — Live FX cache
│   ├── wdiClient.ts                   ✅ EXISTS — World Bank WDI API
│   ├── npaScraper.ts                  ✅ EXISTS — Fuel prices
│   ├── localMaterialScraper.ts        ✅ EXISTS — Construction materials
│   ├── gssLaborService.ts             ✅ EXISTS (⚠️ uses min-wage multipliers, not PxWeb)
│   ├── gredaScraper.ts                ✅ EXISTS — GREDA/BRRI building rates
│   ├── syncLogRepository.ts           ✅ EXISTS — Audit trail for all syncs
│   ├── syncService.ts                 ✅ EXISTS — Orchestrator (extend SyncSource union)
│   ├── dataValidator.ts               ✅ EXISTS
│   ├── types.ts                       ✅ EXISTS
│   │
│   │   ── NEW GSS PxWeb SCRAPERS (follow gssIncomeService pattern) ──
│   │
│   ├── gssPpiService.ts               🆕 P1 — PPI + IIP + commodity prices
│   │     Sources: ppi.px, iip.px, commodity_price.px
│   │     Tables:  gss_ppi_construction_series, gss_iip_monthly
│   │     Cron:    monthly (15th, after BOG sync)
│   │
│   ├── gssMiegService.ts              🆕 P1 — MIEG + Quarterly GDP
│   │     Sources: mieg_px_March26.px, qgdp_p_px.px, qgdp_e_px.px
│   │     Tables:  gss_mieg_monthly, gss_quarterly_gdp
│   │     Cron:    monthly (MIEG), quarterly (GDP)
│   │
│   ├── gssFinancialService.ts         🆕 P1 — Interest rates + Financial Soundness
│   │     Sources: interest.px, fin_sound.px, monetary.px
│   │     Tables:  gss_interest_rates_monthly, gss_financial_soundness_monthly
│   │     Cron:    monthly
│   │
│   ├── gssTradeService.ts             🆕 P2 — HS2 construction material imports
│   │     Sources: trade_detail_hs2.px, trade_uvi.px
│   │     Tables:  gss_construction_material_imports
│   │     Cron:    monthly (on 10th, trade data lags ~2 months)
│   │
│   ├── gssPhcHousingService.ts        🆕 P2 — PHC 2021 housing + structures census
│   │     Sources: ownership.px, Tenure_arrangement.px, num_rooms.px,
│   │              sleep_rooms.px, wall_material.px, roofing_material.px,
│   │              flooring_material.px, main_light.px,
│   │              Levelof_completion_res_table.px, res_struc_table.px,
│   │              mainwater_table.px, service_table.px, toiletfacility_table.px,
│   │              solidDisposal_table.px, ownict_table_1.px,
│   │              use_internet_on_device_1.px
│   │     Tables:  gss_phc_tenure_by_district, gss_phc_housing_profile_by_district,
│   │              gss_phc_completion_by_district, gss_phc_infrastructure_by_district,
│   │              gss_phc_ict_by_district
│   │     Cron:    annual (Jan 1st — census is static but refresh checks for updates)
│   │     Note:    Batches all PHC housing tables to minimize HTTP round-trips
│   │
│   ├── gssPhcPopulationService.ts     🆕 P1 — PHC population projections + household size
│   │     Sources: projections.px, avg_hhsize_table.px, hhsize_table.px,
│   │              population_table.px
│   │     Tables:  gss_phc_population_projections, gss_phc_household_size_by_district
│   │     Cron:    annual (Jan 1st)
│   │
│   ├── gssPhcEmploymentService.ts     🆕 P1 — PHC 2021 formal/informal employment
│   │     Sources: sector_table.px, econact_table.px, Unemployment_table_2.px,
│   │              status_table.px, industry_table.px
│   │     Tables:  gss_phc_employment_by_district
│   │     Cron:    annual (Jan 1st)
│   │     Note:    Also updates formal_employment_pct in regional_household_income
│   │
│   ├── gssPhcPovertyService.ts        🆕 P2 — PHC 2021 Multidimensional Poverty
│   │     Sources: MPI_by_locality.px, MPI_by_sex.px, MPI_contributors.px
│   │     Tables:  gss_phc_mpi_by_district
│   │     Cron:    annual (Jan 1st)
│   │
│   └── gssGlss7Service.ts             🆕 P2 — GLSS7 migration + tourism + housing
│         Sources: Table_6.4.px, Table_6.15.px, Table_7.2.px, Table_7.3.px,
│                  Table_5.5.px
│         Tables:  gss_glss7_migration_flows, gss_glss7_tourism_by_region,
│                  gss_glss7_housing_snapshot
│         Cron:    annual (Jan 1st — GLSS7 is static until GLSS8)
│
├── gssIncomeService.ts                ✅ EXISTS + SHIPS — AHIES + PHC income per region
│     Stays at root level (not in scrapers/) — it's already there and working
│
├── schedulers/
│   └── economicDataScheduler.ts       ✅ EXISTS — add new cron entries here (see §10)
│
├── monitoring/
│   └── economicDataMonitoringService.ts  ✅ EXISTS — add GSS freshness checks here (see §10)
│
├── microservices/acquisition/tier3c-economic-construction-data/
│   ├── macroeconomic/                 🆕 Add thin wrapper modules here:
│   │   ├── gss-ppi-sync.ts            → calls gssPpiService.sync()
│   │   ├── gss-mieg-sync.ts           → calls gssMiegService.sync()
│   │   └── gss-financial-sync.ts      → calls gssFinancialService.sync()
│   └── construction-materials/        🆕 Add:
│       └── gss-trade-hs2-sync.ts      → calls gssTradeService.sync()
│
└── [all other existing files unchanged]

backend/src/services/analytics/
│
├── constructionCostIndexService.ts    ✅ EXISTS — consume gss_ppi_construction_series (E-1)
├── ghaiService.ts                     ✅ EXISTS — consume gss_phc_tenure, gss_phc_employment (E-3, E-4)
├── marketIntelligenceService.ts       ✅ EXISTS — consume gss_mieg_monthly, gss_quarterly_gdp (E-5)
├── rentalAnalyticsService.ts          ✅ EXISTS — join regional_household_income (E-11, E-12)
├── investmentScoringService.ts        ✅ EXISTS — consume NPL, MIEG, MPI, migration (E-7–E-10)
├── valuationAnalyticsService.ts       ✅ EXISTS — consume PVMAF inputs (§7.1)
├── floorPlanAnalyticsService.ts       ✅ EXISTS — consume gss_phc_housing_profile (E-13, E-14)
├── shortStayMetricsService.ts         ✅ EXISTS — consume gss_mieg_monthly, tourism (E-15)
├── alertService.ts                    ✅ EXISTS — add GSS macro rule seeds (E-16)
├── mlAnalyticsService.ts              ✅ EXISTS — pass GSS macro features to ML microservice
│
│   ── NEW ANALYTICS SERVICES ──
│
├── housingDemandScoreService.ts       🆕 P1 — RHDS (§6.2) — PHC projections + migration + earnings
├── infrastructureQualityService.ts    🆕 P2 — NIQS (§6.3) — PHC water/sanitation/ICT
├── proptechPenetrationService.ts      🆕 P4 — PTMPI (§6.8) — PHC ICT
├── housingDeficitService.ts           🆕 P4 — HDEM (§6.9) — PHC projections + completion + overcrowding
│
└── index.ts                           ✅ EXISTS — add exports for new services
```

### 9.1 New Database Tables Required

All tables follow the existing pattern: created via numbered migration in `database/migrations/`.

| Table | Populated by | Consumed by |
|-------|-------------|-------------|
| `gss_ppi_construction_series` | `gssPpiService.ts` | `constructionCostIndexService.ts` |
| `gss_iip_monthly` | `gssPpiService.ts` | `marketIntelligenceService.ts` (supply signal) |
| `gss_mieg_monthly` | `gssMiegService.ts` | `marketIntelligenceService.ts`, `investmentScoringService.ts`, `shortStayMetricsService.ts` |
| `gss_quarterly_gdp` | `gssMiegService.ts` | `marketIntelligenceService.ts`, `mlAnalyticsService.ts` |
| `gss_interest_rates_monthly` | `gssFinancialService.ts` | `ghaiService.ts` (MHAI rate), `investmentScoringService.ts` |
| `gss_financial_soundness_monthly` | `gssFinancialService.ts` | `investmentScoringService.ts` (macro risk) |
| `gss_construction_material_imports` | `gssTradeService.ts` | `constructionCostIndexService.ts` (overhead) |
| `gss_phc_tenure_by_district` | `gssPhcHousingService.ts` | `ghaiService.ts`, `rentalAnalyticsService.ts` |
| `gss_phc_housing_profile_by_district` | `gssPhcHousingService.ts` | `floorPlanAnalyticsService.ts`, `valuationAnalyticsService.ts` |
| `gss_phc_completion_by_district` | `gssPhcHousingService.ts` | `investmentScoringService.ts` (CCRI) |
| `gss_phc_infrastructure_by_district` | `gssPhcHousingService.ts` | `infrastructureQualityService.ts` (NIQS) |
| `gss_phc_ict_by_district` | `gssPhcHousingService.ts` | `proptechPenetrationService.ts` |
| `gss_phc_population_projections` | `gssPhcPopulationService.ts` | `housingDemandScoreService.ts` |
| `gss_phc_household_size_by_district` | `gssPhcPopulationService.ts` | `ghaiService.ts`, `floorPlanAnalyticsService.ts` |
| `gss_phc_employment_by_district` | `gssPhcEmploymentService.ts` | `ghaiService.ts` (MAS), `investmentScoringService.ts` |
| `gss_phc_mpi_by_district` | `gssPhcPovertyService.ts` | `investmentScoringService.ts` (risk discount) |
| `gss_glss7_migration_flows` | `gssGlss7Service.ts` | `housingDemandScoreService.ts` |
| `gss_glss7_tourism_by_region` | `gssGlss7Service.ts` | `shortStayMetricsService.ts` |
| `regional_housing_demand_scores` | `housingDemandScoreService.ts` | `investmentScoringService.ts` |
| `district_infrastructure_scores` | `infrastructureQualityService.ts` | `valuationAnalyticsService.ts`, `investmentScoringService.ts` |
| `district_completion_risk_scores` | computed in `investmentScoringService.ts` | investment reports |
| `rental_affordability_bands` | `rentalAnalyticsService.ts` | rental reports |
| `district_housing_deficit_estimates` | `housingDeficitService.ts` | developer-facing reports |
| `gss_data_sync_log` | all GSS scrapers | `economicDataMonitoringService.ts` |

### 9.2 PxWeb Client Pattern (MUST follow `gssIncomeService.ts`)

Every new GSS scraper must use the same pattern already established in `gssIncomeService.ts`:

```typescript
// ✅ Use native Node HTTPS (no axios) — matches existing pattern
import https from 'https';
import { syncLogRepository } from './syncLogRepository';
import type { SyncResult } from './types';

const STATSBANK_HOST = process.env.GSS_STATSBANK_HOST || 'statsbank.statsghana.gov.gh';

function pxPost(path: string, queryBody: unknown): Promise<PxStat2> {
  const body = JSON.stringify({ query: queryBody, response: { format: 'json-stat2' } });
  return new Promise((resolve, reject) => {
    const req = https.request(
      { method: 'POST', hostname: STATSBANK_HOST, path,
        headers: { 'Content-Type': 'application/json',
                   'Content-Length': Buffer.byteLength(body),
                   'User-Agent': 'propmetrik-datahub' },
        timeout: 30000 },
      (res) => { /* accumulate + parse */ }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ✅ Always call syncLogRepository at start and end
// ✅ Return SyncResult
// ✅ Export a singleton instance (follows bogScraper / wdiClient pattern)
export const gssPpiService = new GSS_PPI_Service();
```

---

## 10. Scheduler & Monitoring Extensions

### 10.1 New Cron Jobs in `schedulers/economicDataScheduler.ts`

Add to `SchedulerConfig` interface and `DEFAULT_CONFIG`:

```typescript
// === GSS StatsBank Macro Data ===
/** PPI + IIP sync — 15th of each month at 5 AM (lags ~2 weeks after month end) */
gssPpiSyncCron: process.env.GSS_PPI_SYNC_CRON || '0 5 15 * *',

/** MIEG monthly sync — on the 20th at 5 AM (GSS typically releases 10–15 days after month end) */
gssMiegSyncCron: process.env.GSS_MIEG_SYNC_CRON || '0 5 20 * *',

/** Quarterly GDP sync — on the 15th of first month of each quarter */
gssGdpSyncCron: process.env.GSS_GDP_SYNC_CRON || '0 5 15 */3 *',

/** Interest rates + Financial Soundness — monthly on 12th */
gssFinancialSyncCron: process.env.GSS_FINANCIAL_SYNC_CRON || '0 5 12 * *',

/** HS2 trade import data — monthly on 20th (trade data lags ~6 weeks) */
gssTradeImportSyncCron: process.env.GSS_TRADE_SYNC_CRON || '0 5 20 * *',

// === GSS StatsBank Census Data (annual, static) ===
/** PHC 2021 housing, structures, population — Jan 1st (check for updates annually) */
gssPhcHousingSyncCron: process.env.GSS_PHC_HOUSING_CRON || '0 2 1 1 *',

/** PHC 2021 employment + poverty — Jan 2nd */
gssPhcEmploymentSyncCron: process.env.GSS_PHC_EMPLOYMENT_CRON || '0 2 2 1 *',

/** GLSS7 migration + tourism — Jan 3rd */
gssGlss7SyncCron: process.env.GSS_GLSS7_SYNC_CRON || '0 2 3 1 *',

// === Derived Analytics Recompute ===
/** Recompute NIQS, RHDS, DPMDI after annual PHC refresh — Jan 5th */
gssDerivesRecomputeCron: process.env.GSS_DERIVED_RECOMPUTE_CRON || '0 3 5 1 *',
```

**Full Monday pipeline** (extend the existing Monday chain):

```
9 AM  → NPA fuel prices
10 AM → local material prices
11 AM → GSS labor rates                    (existing)
12 PM → construction index recalc          (existing)
1 PM  → base cost recalc                   (existing)
2 PM  → GREDA sync                         (existing)
3 PM  → specialized cost recalc            (existing)
4 PM  → [NEW] gssPpiService.sync()         ← NEW (weekly check if monthly update available)
4:15  → [NEW] gssMiegService.sync()        ← NEW
4:30  → [NEW] gssFinancialService.sync()   ← NEW
```

### 10.2 Extend `SyncSource` Union in `scrapers/syncService.ts`

```typescript
export type SyncSource =
  | 'bog' | 'wdi' | 'fx' | 'npa' | 'local_materials' | 'gss_labor' | 'greda'
  | 'construction_all' | 'all'
  // NEW GSS sources:
  | 'gss_ppi'
  | 'gss_mieg'
  | 'gss_financial'
  | 'gss_trade_hs2'
  | 'gss_phc_housing'
  | 'gss_phc_employment'
  | 'gss_phc_poverty'
  | 'gss_phc_population'
  | 'gss_glss7'
  | 'gss_income'       // already exists in gssIncomeService — add to union
  | 'gss_all';         // triggers all gss_* sources in sequence
```

### 10.3 Extend `economicDataMonitoringService.ts`

Add freshness checks for each new GSS table. GSS macro data is monthly; census tables are annual.

```typescript
// Add to runFreshnessChecks():
const gssFreshnessChecks: DataFreshnessCheck[] = [
  await this.checkTableFreshness('gss_ppi_construction_series', 'gss_ppi', 40),    // monthly
  await this.checkTableFreshness('gss_mieg_monthly',            'gss_mieg', 40),
  await this.checkTableFreshness('gss_interest_rates_monthly',  'gss_financial', 45),
  await this.checkTableFreshness('gss_financial_soundness_monthly', 'gss_financial', 45),
  await this.checkTableFreshness('gss_construction_material_imports', 'gss_trade', 70), // 6-week lag
  await this.checkTableFreshness('gss_phc_tenure_by_district',  'gss_phc', 400),    // census annual
  await this.checkTableFreshness('gss_phc_employment_by_district', 'gss_phc', 400),
  await this.checkTableFreshness('gss_phc_mpi_by_district',     'gss_phc', 400),
  await this.checkTableFreshness('gss_glss7_migration_flows',   'gss_glss7', 400),
];
```

Add `GSS_MACRO_FRESHNESS_DAYS` (default 40) and `GSS_CENSUS_FRESHNESS_DAYS` (default 400) env vars
to `MonitoringConfig`.

### 10.4 Environment Variables

Add to `.env.example` and documentation:

```env
# GSS StatsBank PxWeb API
GSS_STATSBANK_HOST=statsbank.statsghana.gov.gh   # override for testing
GSS_MEAN_WEEKLY_HOURS=40                          # AHIES documented national mean (gssIncomeService)

# GSS Cron Schedules (all in Africa/Accra timezone)
GSS_PPI_SYNC_CRON=0 5 15 * *
GSS_MIEG_SYNC_CRON=0 5 20 * *
GSS_GDP_SYNC_CRON=0 5 15 */3 *
GSS_FINANCIAL_SYNC_CRON=0 5 12 * *
GSS_TRADE_SYNC_CRON=0 5 20 * *
GSS_PHC_HOUSING_CRON=0 2 1 1 *
GSS_PHC_EMPLOYMENT_CRON=0 2 2 1 *
GSS_GLSS7_SYNC_CRON=0 2 3 1 *
GSS_DERIVED_RECOMPUTE_CRON=0 3 5 1 *

# GSS Monitoring Thresholds
GSS_MACRO_FRESHNESS_DAYS=40
GSS_CENSUS_FRESHNESS_DAYS=400
```

---

## 11. Delivery Plan — Vertical Slices

> Each slice is independently deployable. **Never ship an analytics consumer in the same PR as its
> scraper.** The pipeline (scraper → migration → table → cron → monitoring check) must be proven
> with at least one successful sync before any analytics service reads from it.
>
> Rule: **scraper PR lands and syncs clean → analytics consumer PR opens**.

---

### Slice 1 — P1 Monthly Macro (start here)

**Goal:** Fix the three most broken things — CCI `change_yoy` suppression, GHAI hardcoded income (already done), and one-dimensional investment risk. Prove the PxWeb pipeline pattern on live data.

**Files to create / modify:**

| Action | File | What it does |
|--------|------|-------------|
| CREATE | `data-hub/scrapers/gssPpiService.ts` | Fetches `ppi.px` (Construction + Manufacturing + All industries), `iip.px`. Writes to `gss_ppi_construction_series`, `gss_iip_monthly`. Follows `gssIncomeService.ts` pxPost pattern exactly. |
| CREATE | `data-hub/scrapers/gssMiegService.ts` | Fetches `mieg_px_March26.px` (Agriculture/Industry/Services/Total YoY%), `qgdp_p_px.px`, `qgdp_e_px.px`. Writes to `gss_mieg_monthly`, `gss_quarterly_gdp`. |
| CREATE | `data-hub/scrapers/gssFinancialService.ts` | Fetches `interest.px` (lending rate, policy rate, T-bill), `fin_sound.px` (NPL ratio, capital adequacy). Writes to `gss_interest_rates_monthly`, `gss_financial_soundness_monthly`. Double as BOG lending rate fallback. |
| EXTEND | `data-hub/gssIncomeService.ts` | Add one extra `pxPost` call: `sector_table.px` (Private formal + Public % by region). Populate `regional_household_income.formal_employment_pct` column (add via migration). |
| CREATE | `database/migrations/26X_gss_macro_tables.sql` | Creates `gss_ppi_construction_series`, `gss_iip_monthly`, `gss_mieg_monthly`, `gss_quarterly_gdp`, `gss_interest_rates_monthly`, `gss_financial_soundness_monthly`. All with `period_date`, `region` (nullable), `value`, `source_updated_at`, `synced_at`. |
| CREATE | `database/migrations/26Y_regional_household_income_formal_employment.sql` | Adds `formal_employment_pct NUMERIC(5,2)` column to `regional_household_income`. |
| EXTEND | `scrapers/syncService.ts` | Add `'gss_ppi' \| 'gss_mieg' \| 'gss_financial' \| 'gss_income'` to `SyncSource` union. Wire each to its service in the `sync()` switch. |
| EXTEND | `schedulers/economicDataScheduler.ts` | Add `gssPpiSyncCron`, `gssMiegSyncCron`, `gssFinancialSyncCron` to `SchedulerConfig` interface and `DEFAULT_CONFIG`. Append three tasks to the Monday pipeline at 4 PM, 4:15 PM, 4:30 PM. |
| EXTEND | `monitoring/economicDataMonitoringService.ts` | Add 4 freshness checks: `gss_ppi_construction_series` (40d), `gss_mieg_monthly` (40d), `gss_interest_rates_monthly` (45d), `gss_financial_soundness_monthly` (45d). Add `GSS_MACRO_FRESHNESS_DAYS` env var to config. |
| CREATE | `microservices/acquisition/tier3c-economic-construction-data/macroeconomic/gss-ppi-sync.ts` | Thin wrapper: imports `gssPpiService`, exports a `handler` that calls `gssPpiService.sync()`. |
| CREATE | `microservices/acquisition/tier3c-economic-construction-data/macroeconomic/gss-mieg-sync.ts` | Same pattern for MIEG. |
| CREATE | `microservices/acquisition/tier3c-economic-construction-data/macroeconomic/gss-financial-sync.ts` | Same pattern for Financial. |

**Analytics consumers (open as separate PRs AFTER Slice 1 scrapers sync clean):**

| Action | File | Change |
|--------|------|--------|
| MODIFY | `analytics/constructionCostIndexService.ts` | In `getNationalSummary()`, JOIN `gss_ppi_construction_series` on `period_date`. Compute blended `materials_index = 0.6 × ppi_index + 0.4 × internal_materials_index`. Remove `change_yoy` suppression guard (the ±40% cap). |
| MODIFY | `analytics/marketIntelligenceService.ts` | In `getPriceIndexSummary()`, LEFT JOIN `gss_mieg_monthly` on period. Add `mieg_growth_yoy` and `gdp_growth_context` to `PriceIndexSummary` type and response. When MIEG Services sub-index < 0 for latest 2 rows, append `"credit-sensitive"` to `market_temperature`. |
| MODIFY | `analytics/investmentScoringService.ts` | In `computeOpportunitiesLive()`, LEFT JOIN `gss_financial_soundness_monthly` (latest NPL, capital adequacy) and `gss_interest_rates_monthly` (latest lending rate). Add `macro_risk_penalty` to risk sub-score formula. Add `macro_risk_score` to `opportunity_factors` type. |
| MODIFY | `analytics/ghaiService.ts` — `calculateMAS()` | Replace `formalEmploymentPct = 15` with a lookup of `regional_household_income.formal_employment_pct` for the given region. Keep 15 as the fallback default if the column is null. |

**Validation checklist — Slice 1 COMPLETE ✅ (2026-06-30):**
- [x] `gssPpiService.sync()` runs — `gss_ppi_construction_series` has **1,004 rows** (Construction + Manufacturing + All industries, from Jan 2017 through Apr 2026)
- [x] `gssMiegService.sync()` runs — `gss_mieg_monthly` has **156 rows** (4 variables × 39 months Jan-23–Mar-26); `gss_quarterly_gdp` has **597 rows** (Q1 2016–Q1 2026)
- [x] `gssFinancialService.sync()` runs — `gss_interest_rates_monthly` has **2,235 rows** (6 rate types, through Jul 2024); `gss_financial_soundness_monthly` has **1,776 rows** (through Jun 2024)
- [x] `gssIncomeService.sync()` extended — `formal_employment_pct` populated for all **16 regions** (Greater Accra 33.2%, Western 22.4%, Ashanti 21.3%, Northern ~8%)
- [x] CCI `change_yoy` now returns real values (±40% guard removed; PPI blend active)
- [x] `PriceIndexSummary` includes `mieg_growth_yoy`, `gdp_growth_context`, `interest_rate_cycle` fields
- [x] Investment opportunity risk score incorporates NPL + policy rate macro penalty
- [x] GHAI MAS no longer hardcoded at 15% — reads real regional formal employment %
- [x] Migrations 260, 261, 262 applied — all 6 new tables created
- [x] `SyncSource` union extended — `gss_ppi`, `gss_mieg`, `gss_financial`, `gss_income`, `gss_all`
- [x] Monitoring freshness checks active for all 5 new GSS tables
- [x] Tier-3c microservice wrappers created for PPI, MIEG, Financial

**Bugs fixed during Slice 1 run:**
- `gssMiegService.ts` — MIEG POST query used wrong dimension codes (valueTexts instead of values); buildMap stride arithmetic corrected for 3-dimensional json-stat2 arrays
- `gssIncomeService.ts` — `sector_table.px` dimension codes corrected to `'Public (Government)'` and `'Private Formal'`; all 6 required dimensions now specified
- `syncService.ts` — `gss_all` / `construction_all` / `all` cases in switch block wrapped in `{}` to resolve lexical declaration TS errors

---

### Slice 2 — P2 PHC Housing Census (one-time backfill)

**Goal:** Populate the district-level housing profile that unlocks tenure-derived GHAI weights, rental market depth, floor plan context, and the NIQS infrastructure score. This is static census data — runs once, then annually on Jan 1st.

**Prerequisite:** Slice 1 merged and monitoring green.

**Files to create / modify:**

| Action | File | What it does |
|--------|------|-------------|
| CREATE | `data-hub/scrapers/gssPhcHousingService.ts` | Batches 15 PHC housing + structures + water/sanitation + ICT tables in a single service. Uses Promise.all with sequential throttling (100ms between calls) to avoid hammering the PxWeb API. Writes to 5 tables. Annual cron — checks `synced_at` before re-fetching (idempotent). |
| CREATE | `database/migrations/26Z_gss_phc_housing_tables.sql` | Creates `gss_phc_tenure_by_district`, `gss_phc_housing_profile_by_district`, `gss_phc_completion_by_district`, `gss_phc_infrastructure_by_district`, `gss_phc_ict_by_district`. All keyed on `(district, region, locality)`. |
| EXTEND | `scrapers/syncService.ts` | Add `'gss_phc_housing'` to `SyncSource`. |
| EXTEND | `schedulers/economicDataScheduler.ts` | Add `gssPhcHousingSyncCron: '0 2 1 1 *'` (annual Jan 1st). |
| EXTEND | `monitoring/economicDataMonitoringService.ts` | Add `gss_phc_tenure_by_district` freshness check (400d). Add `GSS_CENSUS_FRESHNESS_DAYS` env var. |

**Analytics consumers (separate PRs after backfill confirms row counts):**

| Action | File | Change |
|--------|------|--------|
| MODIFY | `analytics/ghaiService.ts` — `REGIONAL_WEIGHTS` | Add `computeWeightsFromCensus(region)` that reads `gss_phc_tenure_by_district` and derives `rental_weight`, `cash_weight`, `mortgage_weight`. `getCurrent()` calls this first; falls back to hardcoded map if table empty. |
| MODIFY | `analytics/rentalAnalyticsService.ts` | In `computeRentalSummaryLive()`, LEFT JOIN `gss_phc_tenure_by_district` on region. Add `formal_rental_market_depth_pct` to `RentalSummary` type. |
| MODIFY | `analytics/floorPlanAnalyticsService.ts` | In `getSummary()` and `getRoomSizeAnalytics()`, LEFT JOIN `gss_phc_housing_profile_by_district` on region. Add `district_avg_sleeping_rooms`, `district_material_quality_score`, and `overcrowding_index` fields to responses. |
| EXTEND | `analytics/investmentScoringService.ts` | Add CCRI sub-factor: join `gss_phc_completion_by_district` (incomplete residential %) × macro stress multiplier from NPL + PPI. Subtract from risk score. |
| CREATE | `microservices/acquisition/tier3c-economic-construction-data/construction-materials/gss-trade-hs2-sync.ts` | Stub wrapper for `gssTradeService` (build the scraper in Slice 2b below). |

**Slice 2b — Trade HS2 Imports (can run in parallel with PHC Housing):**

| Action | File | What it does |
|--------|------|-------------|
| CREATE | `data-hub/scrapers/gssTradeService.ts` | Fetches `trade_detail_hs2.px` filtered to Import tradeflow + construction HS2 codes (25, 44, 68, 69, 70, 72, 73, 76). Fetches `trade_uvi.px` for unit value indices. Writes to `gss_construction_material_imports`. |
| CREATE | `database/migrations/270_gss_trade_tables.sql` | Creates `gss_construction_material_imports` with `(year, month, hs2_code, hs2_label, import_value_ghs, import_value_usd, import_weight_kg, unit_value_index, fx_rate_at_period)`. |
| EXTEND | `schedulers/economicDataScheduler.ts` | Add `gssTradeImportSyncCron: '0 5 10 * *'` (monthly 10th — trade data lags ~6 weeks). |
| MODIFY | `analytics/constructionCostIndexService.ts` | After Slice 2b trade table is populated: add `getImportPressureIndex()` method. Compute `GCMIPI = Σ(hs_weight × unit_value_i × fx_factor)`. Expose as `import_material_pressure` field in national CCI summary. |

**Validation checklist — Slice 2 COMPLETE ✅ (2026-06-30):**
- [x] `gssPhcHousingService.sync()` runs — all 5 tables populated with 16 regions each (**80 total rows**)
- [x] `gssPhcHousingService.sync()` is idempotent (ON CONFLICT DO UPDATE — second run safe)
- [x] `gss_phc_tenure_by_district` has real data: Greater Accra 47.6% renting, Ashanti 40.6%, Upper East ~8%
- [x] `gss_phc_completion_by_district`: Central 17.8% incomplete, Ashanti 17.6%
- [x] `gss_phc_infrastructure_by_district`: Greater Accra NIQS 66.25, electricity 96.2%
- [x] `gssTradeService.sync()` runs — `gss_construction_material_imports` has **660 rows** (11 HS2 codes × 5 years, Jan 2021–Dec 2025)
- [x] `ghaiService.getCurrent()` now reads census-derived regional weights (Greater Accra rental_weight ~0.42, not hardcoded 0.30)
- [x] `RentalSummary` now includes `rent_to_income_ratio` and `formal_rental_market_depth_pct`
- [x] `FloorPlanSummary` includes `district_material_quality_score` for regional context
- [x] `InvestmentOpportunity.opportunity_factors` includes `ccri_risk_score` (completion risk)
- [x] `CCINationalSummary` includes `import_material_pressure` (GCMIPI history)
- [x] Migrations 263 + 264 applied
- [x] `SyncSource` union extended: `gss_phc_housing`, `gss_trade_hs2`
- [x] Scheduler crons: `gssPhcHousingSyncCron` (annual Jan 1), `gssTradeImportSyncCron` (monthly 10th)
- [x] Monitoring freshness checks for all 4 new tables
- [x] Tier-3c wrapper: `construction-materials/gss-trade-hs2-sync.ts`

**Bugs fixed during Slice 2 run:**
- `gssPhcHousingService.ts` — PHC API returns raw household COUNTS not percentages; ICT and infrastructure fetches corrected to fetch both category and Total and divide to get percentage (0-100)
- Initial run: 48/80 rows saved (tenure/profile/completion OK, ICT/infra NUMERIC overflow). Fixed by fetching totals and dividing.

---

### Slice 3 — P1/P2 PHC Population + Employment + Poverty

**Goal:** Unlock population demand projection (RHDS), correct formal employment by district (GHAI MAS), and add MPI poverty discount to investment scoring.

**Prerequisite:** Slice 1 merged. Can run in parallel with Slice 2.

**Files to create / modify:**

| Action | File | What it does |
|--------|------|-------------|
| CREATE | `data-hub/scrapers/gssPhcPopulationService.ts` | Fetches `projections.px` (2021–2035, all regions, age groups), `avg_hhsize_table.px`, `hhsize_table.px`. Writes to `gss_phc_population_projections`, `gss_phc_household_size_by_district`. |
| CREATE | `data-hub/scrapers/gssPhcEmploymentService.ts` | Fetches `sector_table.px` (Public/Private formal/Private informal by district), `econact_table.px`, `Unemployment_table_2.px`. Writes to `gss_phc_employment_by_district`. On completion, runs UPDATE to backfill `regional_household_income.formal_employment_pct` from district-level data (more granular than the AHIES region-level used in Slice 1). |
| CREATE | `data-hub/scrapers/gssPhcPovertyService.ts` | Fetches `MPI_by_locality.px`, `MPI_by_sex.px`, `MPI_contributors.px`. Writes to `gss_phc_mpi_by_district`. |
| CREATE | `database/migrations/271_gss_phc_population_employment_poverty.sql` | Creates `gss_phc_population_projections` (region, year, age_group, sex, locality, population), `gss_phc_household_size_by_district` (district, region, locality, avg_hhsize, hhsize_distribution jsonb), `gss_phc_employment_by_district` (district, region, public_pct, private_formal_pct, private_informal_pct, unemployment_rate), `gss_phc_mpi_by_district` (district, region, locality, mpi_incidence, mpi_intensity, mpi_m0, contributors jsonb). |
| EXTEND | `scrapers/syncService.ts` | Add `'gss_phc_population' \| 'gss_phc_employment' \| 'gss_phc_poverty'` to `SyncSource`. |
| EXTEND | `schedulers/economicDataScheduler.ts` | Add `gssPhcEmploymentSyncCron: '0 2 2 1 *'` (Jan 2nd, day after housing). |
| EXTEND | `monitoring/economicDataMonitoringService.ts` | Add freshness checks: `gss_phc_employment_by_district` (400d), `gss_phc_mpi_by_district` (400d). |

**Analytics consumers (separate PR after tables populated):**

| Action | File | Change |
|--------|------|--------|
| MODIFY | `analytics/investmentScoringService.ts` | Join `gss_phc_mpi_by_district` on region. Apply `mpi_discount = mpi_intensity × 10` penalty to opportunity score. Add `mpi_risk_level` to `InvestmentOpportunity`. |
| MODIFY | `analytics/ghaiService.ts` — `calculateMAS()` | Upgrade from region-level `formal_employment_pct` (Slice 1) to district-level from `gss_phc_employment_by_district`. Region fallback still applies when district data absent. |
| CREATE | `analytics/housingDemandScoreService.ts` | New service. Reads `gss_phc_population_projections` (compute `pop_growth_20to40_5yr`), `gss_glss7_migration_flows` (net flow per region — depends on Slice 4), `regional_household_income` (earnings growth). Returns `RHDS` score per district. Gracefully degrades if migration table empty (weight redistribution). |

---

### Slice 4 — P2 GLSS7 Migration + Tourism

**Goal:** Populate the inter-regional migration matrix and domestic tourism volumes. Lowest urgency in the plan (GLSS7 is 2016 data) but required to complete RHDS demand scoring.

**Prerequisite:** Slice 3 `housingDemandScoreService.ts` stub created.

**Files to create / modify:**

| Action | File | What it does |
|--------|------|-------------|
| CREATE | `data-hub/scrapers/gssGlss7Service.ts` | Fetches `Table_6.4.px` (migration flow matrix), `Table_6.15.px` (domestic overnight tourists), `Table_7.2.px` (occupancy status), `Table_7.3.px` (rent payee). Writes to `gss_glss7_migration_flows`, `gss_glss7_tourism_by_region`, `gss_glss7_housing_snapshot`. |
| CREATE | `database/migrations/272_gss_glss7_tables.sql` | Creates `gss_glss7_migration_flows` (origin_region, dest_region, flow_pct), `gss_glss7_tourism_by_region` (region, domestic_overnight_visitors_pct, sex, locality), `gss_glss7_housing_snapshot` (region, renting_pct, owner_pct, perching_pct, rent_payee jsonb). |
| EXTEND | `schedulers/economicDataScheduler.ts` | Add `gssGlss7SyncCron: '0 2 3 1 *'` (Jan 3rd). |

**Analytics consumers:**

| Action | File | Change |
|--------|------|--------|
| MODIFY | `analytics/housingDemandScoreService.ts` | Activate migration factor once `gss_glss7_migration_flows` populated. Compute `migration_net_flow_pct` per region from flow matrix. Full RHDS formula now live. |
| MODIFY | `analytics/shortStayMetricsService.ts` | Join `gss_glss7_tourism_by_region` to tag each city with `tourism_demand_type` (business vs. leisure). Join `gss_mieg_monthly` Services sub-index for RevPAR correlation. |
| MODIFY | `analytics/investmentScoringService.ts` | Activate `migration_net_flow_pct` as absorption scoring factor once table populated. Previously this weight redistributed to other factors. |

---

### Slice 5 — P3/P4 Derived Analytics + Alert Rules

**Goal:** Wire all the composite models and alert seeds that depend on Slices 1–4 being complete.

**Prerequisite:** Slices 1–4 merged and monitoring green.

| Action | File | Change |
|--------|------|--------|
| CREATE | `analytics/infrastructureQualityService.ts` | NIQS computation from `gss_phc_infrastructure_by_district`. Reads electricity, water, sanitation, ICT percentages. Outputs 0–100 score per district. |
| MODIFY | `analytics/valuationAnalyticsService.ts` | Add PVMAF computation: read PPI + GDP + interest rate + NIQS + CCRI signals; expose `macro_adjusted_value` alongside base valuation in `MarketRelativeData`. |
| CREATE | `analytics/housingDeficitService.ts` | HDEM: `projections_2030 / avg_hhsize - completed_stock + hidden_demand`. Reads from Slice 3 tables. |
| SEED | `database/migrations/273_gss_alert_rule_seeds.sql` | INSERT 5 pre-built alert rules into `analytics_alert_rules`: PPI spike, lending rate surge, NPL deterioration, MIEG contraction, import material inflation. Each references the source table and correct metric/threshold from the E-16 spec. |
| EXTEND | `analytics/rentalAnalyticsService.ts` | Add `getRentalAffordabilityBands()` using `regional_household_income` + unemployment from `gss_phc_employment_by_district`. Returns RABM bands per region. |
| EXTEND | `analytics/ghaiService.ts` | Add `getMortgageDemandPotential()` using `regional_household_income.formal_employment_pct` + `gss_interest_rates_monthly.avg_lending_rate`. |
| EXTEND | `schedulers/economicDataScheduler.ts` | Add `gssDerivesRecomputeCron: '0 3 5 1 *'` to recompute NIQS, RHDS, DPMDI after annual PHC refresh. |
| EXTEND | `analytics/index.ts` | Export `housingDemandScoreService`, `infrastructureQualityService`, `housingDeficitService`. |

---

### Slice Dependency Map

```
Slice 1 (Monthly Macro)
  ├── gssPpiService        → unlocks CCI change_yoy fix
  ├── gssMiegService       → unlocks Market Intelligence macro overlay
  ├── gssFinancialService  → unlocks Investment macro risk (NPL)
  └── gssIncomeService ext → unlocks GHAI MAS region-level (rough)
         │
         └── Slice 3 (PHC Employment) → upgrades MAS to district-level
                  │
                  └── Slice 4 (GLSS7) → completes RHDS full formula
                           │
                           └── Slice 5 (Derived Analytics + Alerts)

Slice 2a (PHC Housing)   [parallel with Slice 3]
  ├── gssPhcHousingService → unlocks tenure-derived GHAI weights
  ├──                      → unlocks floor plan overcrowding index
  └──                      → unlocks CCRI completion risk

Slice 2b (Trade HS2)     [parallel with Slice 2a]
  └── gssTradeService      → unlocks GCMIPI import pressure index
```

---

### PR Checklist Template (copy for each slice)

```
## Scraper PR
- [ ] Service file created in `data-hub/scrapers/gss*.ts`
- [ ] Follows pxPost/pxGet pattern from gssIncomeService.ts (no axios)
- [ ] syncLogRepository called at start (in_progress) and end (success/failed)
- [ ] Returns SyncResult with records_saved count
- [ ] Singleton export: `export const gss*Service = new GSS*Service()`
- [ ] Migration file created and tested locally (up + down)
- [ ] SyncSource union extended in syncService.ts
- [ ] Cron entry added to economicDataScheduler.ts
- [ ] Freshness check added to economicDataMonitoringService.ts
- [ ] Env vars added to .env.example
- [ ] Manual sync tested: `gss*Service.sync('full')` returns success
- [ ] Rows confirmed in target table(s)
- [ ] Microservice wrapper created in tier3c (if applicable)

## Analytics Consumer PR (separate, after scraper is live)
- [ ] Scraper PR merged + at least 1 successful automated sync
- [ ] Target table(s) confirmed non-empty
- [ ] New fields added to TypeScript interface types
- [ ] JOIN is LEFT JOIN (graceful when table empty)
- [ ] Fallback to existing behaviour when GSS column is null
- [ ] Unit test or integration check covers the new field
- [ ] API response confirmed to include new field(s)
```

---

## 12. Frontend — Existing Pages & GSS Integration Plan

### 12.1 Existing Analytics Frontend Inventory

All analytics UI lives under `frontend/src/app/dashboard/analytics/`. The nav is rendered by
`layout.tsx` using RBAC-gated `analyticsNavItems`. Each page calls the backend via `authedFetch`
against `/api/analytics/platform` or `/api/analytics/market`. Types in each page file mirror the
backend service response shapes exactly.

| Route | Page file | Backend API | What it shows |
|-------|-----------|-------------|---------------|
| `/analytics` | `page.tsx` | `/api/analytics/platform` | Property Price Index (nominal+real), market activity, supply/demand temp, price distribution, recent transactions |
| `/analytics/construction` | `construction/page.tsx` | `/api/analytics/platform` | CCI national + regional, material prices, labor rates, component breakdown, alerts |
| `/analytics/affordability` | `affordability/page.tsx` | `/api/analytics/platform` | GHAI composite + MHAI/CHAI/RHAI/CAI/LAI/MAS, regional heatmap (`RegionalHeatmap.tsx`) |
| `/analytics/valuations` | `valuations/page.tsx` | `/api/analytics/platform` | Valuation volume, method performance, market-relative analytics |
| `/analytics/valuations/leaderboard` | `valuations/leaderboard/page.tsx` | `/api/analytics/platform` | Valuer leaderboard |
| `/analytics/valuations/sensitivity` | `valuations/sensitivity/page.tsx` | `/api/analytics/platform` | Sensitivity analysis |
| `/analytics/ml` | `ml/page.tsx` | `/api/analytics/platform` | ML dashboard, service health, drift alerts |
| `/analytics/ml/monitoring` | `ml/monitoring/page.tsx` | `/api/analytics/platform` | AVM drift monitoring |
| `/analytics/ml/features` | `ml/features/page.tsx` | `/api/analytics/platform` | Feature importance |
| `/analytics/ml/forecasting` | `ml/forecasting/page.tsx` | `/api/analytics/platform` | ML price forecasting |
| `/analytics/risk` | `risk/page.tsx` | `/api/analytics/platform` | Flood risk score, litigation hotspots, case trends |
| `/analytics/short-stay` | `short-stay/page.tsx` | `/api/analytics/platform` | Occupancy, ADR, RevPAR, neighbourhood benchmarks |
| `/analytics/forecasting` | `forecasting/page.tsx` | `/api/analytics/platform` | CCI forecast + GHAI forecast with confidence bands |
| `/analytics/geographic` | `geographic/page.tsx` | `/api/analytics/platform` | Regional distribution, price index by region |
| `/analytics/market/investments` | `market/investments/page.tsx` | `/api/analytics/market` | Investment opportunity scores, factor decomposition |
| `/analytics/market/rentals` | `market/rentals/page.tsx` | `/api/analytics/market` | Rental summary, yield detail, trends, benchmarks |

**Shared component:** `components/analytics/RegionalHeatmap.tsx` — SVG grid map of Ghana's 16
regions, colour-coded by any numeric metric, with click drill-down. Already used in the affordability
page. All new district/region-level GSS scores should use this component.

---

### 12.2 Frontend Changes Per Slice

**Rule:** Frontend changes for a slice open in the same PR as the analytics consumer PR — never
before the backend data is confirmed non-empty. Add `?.` null guards and skeleton states on every new
field so the page degrades gracefully when the GSS table is still empty.

---

#### Slice 1 Frontend — Monthly Macro Enrichments

> **Status:** ✅ SHIPPED (2026-07-01) — all enrichments below built + tsc-clean + data-binding verified against live GSS data. Construction: GSS PPI YoY macro strip + PPI-history sparkline overlay (change_yoy already renders un-suppressed). Market overview: GSS macro context bar (MIEG +5.4% YoY / GDP context / rate-cycle, amber when tightening) + real_index column. Affordability: GSS lending-rate sparkline + easing/tightening/stable cycle badge (`/hai/interest-history`). Investments: 6th "Macro Risk" factor bar + NPL/lending tooltip on risk badge. Rentals: rent-to-income column (null-safe "—" where region has no GSS match — see backend note).
>
> **Backend fixes made during this run:** (1) `gssFinancialService.getLendingRateHistory` was `ORDER BY period_date ASC LIMIT N` → returned the *oldest* rows (1970s); fixed to take the most-recent N chronologically. (2) Added `/hai/tenure` + `/hai/interest-history` endpoints exposing existing real getters.
>
> **Known limitation:** rental summaries are grouped by neighbourhood ("East Legon"), not the 16 GSS regions, so `rent_to_income_ratio` / `formal_rental_market_depth_pct` only bind where a row's region matches a GSS region key. A region-normalisation pass in `rentalAnalyticsService` is the follow-up.

These are **enrichments to existing pages** — no new routes needed.

**`/analytics/construction` — Construction page:**

| Change | Where | What to add |
|--------|-------|-------------|
| Add PPI overlay to trend chart | Historical trend `<LineChart>` | Second line: `ppi_construction_index` from new `ppi_construction_yoy` field in CCI response. Dashed line, amber colour, labelled "GSS PPI Construction". |
| Remove suppression warning | CCI `change_yoy` display | Currently shows `null` or hides when >±40%. After Slice 1 this field is real — remove the guard logic and display it normally. |
| Add macro context strip | Top of page, below page title | 3 pill badges: "PPI Construction YoY: +18.2%" / "IIP Manufacturing: +4.1%" / "Lending Rate: 28.5%". Fetched from `/api/analytics/platform/construction/summary`. |

**`/analytics` — Market overview page:**

| Change | Where | What to add |
|--------|-------|-------------|
| Add macro context bar | Above the Price Index chart | Thin info bar: GDP Growth (quarterly, from `gdp_growth_context`), MIEG Services YoY (from `mieg_growth_yoy`), Lending Rate. When `market_temperature` includes "credit-sensitive", render bar in amber with a warning icon. |
| Show `real_index` alongside nominal | Price Index chart | Already in type but may show null — verify it renders now that backend is populating it from GSS CPI. |

**`/analytics/affordability` — Affordability page:**

| Change | Where | What to add |
|--------|-------|-------------|
| MAS values update automatically | Existing MAS panel | No UI change — backend now returns real regional values instead of 15% everywhere. |
| Add GSS Interest Rate panel | Below mortgage rate KPI | Sparkline of `avg_lending_rate` history from `gss_interest_rates_monthly`. Shows rate cycle tag: "Easing" / "Tightening" / "Stable" |

**`/analytics/market/investments` — Investment page:**

| Change | Where | What to add |
|--------|-------|-------------|
| Add `macro_risk_score` to factor bars | Factor decomposition section | Currently shows 5 bars (cap_rate, price_growth, rental_yield, absorption, risk). Add 6th: "Macro Risk" from new `macro_risk_score` in `opportunity_factors`. |
| Add NPL / lending rate tooltip | Risk level badge | On hover of risk badge, show: "NPL: 8.2% | Policy Rate: 27%". |

**`/analytics/market/rentals` — Rentals page:**

| Change | Where | What to add |
|--------|-------|-------------|
| Add `rent_to_income_ratio` column | Rental summary table | New column between `gross_yield_pct` and `vacancy_rate_pct`. Shows "—" when `null` (region has no income data yet). |

---

#### Slice 2 Frontend — PHC Housing Census Enrichments

> **Status:** ✅ SHIPPED (2026-07-01) — all enrichments built + tsc-clean + data-binding verified. Affordability: "Housing Tenure Profile (PHC 2021)" panel (renting/owner/perching per region, Accra 47.6% renting) + note that MHAI/CHAI/RHAI weights derive from it. Construction: "Construction Import Pressure (GCMIPI)" panel — HS2 unit-value bars + GCMIPI trend sparkline (24 real periods, latest 87.77). Valuations: PHC 2021 district material-quality score (Q, 0–100; Accra Q79.5) annotated per region in the BY REGION panel. Investments: CCRI "Completion Risk" sub-row (incomplete-residential % + LOW/MODERATE/HIGH badge). Rentals: "Deep/Thin market (N% renting)" pill per region.
>
> **Backend fix made during this run:** `constructionCostIndexService.getNationalSummary` called `getGcmipiHistory(12)` — but `unit_value_index` trails ~a year (FX/trade lag), so the 12-month window returned 0 rows despite 594 non-null rows in the table. Widened to 36 months → 24 real GCMIPI periods now flow.

Still **enrichments to existing pages** — no new routes.

**`/analytics/affordability` — Affordability page:**

| Change | Where | What to add |
|--------|-------|-------------|
| Regional weights now dynamic | MHAI/CHAI/RHAI weight display | Currently shows static percentages from hardcoded `REGIONAL_WEIGHTS`. After Slice 2 these differ per region from census. Add tooltip: "Derived from PHC 2021 tenure data". |
| Add tenure context panel | New panel below heatmap | Small table: region, % renting, % owner-occupied, % perching. Labelled "Housing Tenure Profile (PHC 2021)". |

**`/analytics/construction` — Construction page:**

| Change | Where | What to add |
|--------|-------|-------------|
| Add GCMIPI panel (Slice 2b) | New panel after material prices | "Construction Import Pressure Index" — bar chart of HS2 category weights × unit value trend. "Steel imports up 12% YoY vs. domestic PPI +8%". |

**`/analytics/valuations` — Valuations page:**

| Change | Where | What to add |
|--------|-------|-------------|
| Add district material quality context | Market-relative panel | Below the premium/discount % — small note: "District material quality: cement block 68%, metal roof 82% (PHC 2021 baseline)". |

**`/analytics/market/investments` — Investment page:**

| Change | Where | What to add |
|--------|-------|-------------|
| Add CCRI completion risk | Risk details expansion | New sub-row in the risk section: "Completion Risk: HIGH — 34% of residential structures incomplete (PHC 2021)". Amber/red badge. |

**`/analytics/market/rentals` — Rentals page:**

| Change | Where | What to add |
|--------|-------|-------------|
| Add market depth indicator | Rental summary header | Pill badge per region: "Deep market (42% renting)" or "Thin market (11% renting)" from `formal_rental_market_depth_pct`. |

---

#### Slice 3 Frontend — PHC Population + Employment + Poverty

> **Status:** ✅ SHIPPED (2026-07-01) — `/analytics/demand` page built (heatmap + top-5 + cohort/employment bars + RHDS decomposition), nav + RBAC added, investments MPI badge + affordability MAS footnote enrichments done.

**New page: `/analytics/demand`** — Regional Housing Demand Score

**Nav entry to add in `layout.tsx`:**
```tsx
{ href: '/dashboard/analytics/demand', label: 'DEMAND', icon: Users, subTabKey: 'analytics-demand' },
```
Add between GEOGRAPHIC and MANAGEMENT in the nav items array.

**Page contents** (`demand/page.tsx`):

| Panel | Data source | Component |
|-------|-------------|-----------|
| RHDS Heatmap | `regional_housing_demand_scores` | `RegionalHeatmap` with `colorScale="green-red"` |
| Top 5 High-Demand Regions | Same | Ranked list with score, pop growth %, migration net flow |
| Population Growth 20–40 Cohort | `gss_phc_population_projections` | Bar chart per region, current vs. 2030 projection |
| Employment Rate by Region | `gss_phc_employment_by_district` (aggregated) | Horizontal bar chart, sorted descending |
| Demand Score Components | Decomposition of RHDS factors per selected region | 5-bar factor breakdown (mirrors investment page style) |

**Enrichments to existing pages:**

| Page | Change |
|------|--------|
| `/analytics/market/investments` | Add `mpi_risk_level` badge to each region row: "Low Poverty Risk" / "Moderate" / "High (MPI 0.18)". |
| `/analytics/affordability` | MAS now district-accurate. Add footnote: "Formal employment % from PHC 2021 (district-level)". |

---

#### Slice 4 Frontend — GLSS7 Migration + Tourism

**Enrichments to existing pages only** (no new routes for this slice):

**`/analytics/demand`** (created in Slice 3):

| Change | Where | What to add |
|--------|-------|-------------|
| Activate migration flow panel | Currently shows N/A or 0 | Migration flow matrix — heatmap grid: origin region (rows) × destination region (cols), cell = % flow. Greatest flows highlighted in green. "Greater Accra receives 38% of all inter-regional migrants." |

**`/analytics/short-stay`**:

| Change | Where | What to add |
|--------|-------|-------------|
| Add `tourism_demand_type` badge | Neighbourhood name cell | Pill: "Business" (navy) / "Leisure" (green) / "Mixed" (amber). |
| Add MIEG Services correlation | Below RevPAR trend | Small annotation: "RevPAR tracks MIEG Services growth (r=0.74)". |

**`/analytics/market/investments`**:

| Change | Where | What to add |
|--------|-------|-------------|
| Activate migration in absorption factor | Factor bar | Migration net flow now part of absorption score — tooltip shows "Includes GLSS7 migration signal". |

---

#### Slice 5 Frontend — Derived Analytics + Alert Rules

**New page: `/analytics/infrastructure`** — Neighbourhood Infrastructure Quality Score

**Nav entry:**
```tsx
{ href: '/dashboard/analytics/infrastructure', label: 'INFRASTRUCTURE', icon: Zap, subTabKey: 'analytics-infrastructure' },
```
Add between DEMAND and MANAGEMENT.

**Page contents** (`infrastructure/page.tsx`):

| Panel | Data source | Component |
|-------|-------------|-----------|
| NIQS Heatmap | `district_infrastructure_scores` | `RegionalHeatmap` with `colorScale="blue"` — higher = better infrastructure |
| Score Breakdown | Same | Stacked bar per region: electricity %, piped water %, improved water service %, toilet %, waste collection %, smartphone % |
| Bottom 10 Districts | Same | Table: district, region, NIQS score, weakest component |
| AVM Premium Context | `district_infrastructure_scores` joined with property prices | Scatter: NIQS vs. price_per_sqm. "Districts with NIQS > 70 command a 24% price premium." |

**Enrichments to existing pages:**

| Page | Change |
|------|--------|
| `/analytics/valuations` | Add `macro_adjusted_value` column to market-relative table. Green/red vs. base valuation. "Macro-adjusted: GHS 485,000 (+3.2% vs. comparable)". |
| `/analytics/construction` | Add 5 pre-built alert rule cards to the Alerts panel (PPI spike, NPL, MIEG, lending rate, import inflation). These appear automatically once the alert seeds migration runs. |
| `/analytics/market/rentals` | Add `getRentalAffordabilityBands` widget: "% of population who can afford this rent tier in [region]". GHS bands with affordability % bar. |

---

### 12.3 New Frontend Files Summary

| File | Slice | Type | Description |
|------|-------|------|-------------|
| `app/dashboard/analytics/demand/page.tsx` | 3 | NEW PAGE | RHDS, population projections, employment heatmap |
| `app/dashboard/analytics/infrastructure/page.tsx` | 5 | NEW PAGE | NIQS score, infrastructure breakdown, AVM premium scatter |
| `components/analytics/MacroContextBar.tsx` | 1 | NEW COMPONENT | Reusable strip: GDP growth, MIEG, lending rate. Used on market + construction pages. |
| `components/analytics/FactorDecomposition.tsx` | 1 | NEW COMPONENT | Horizontal bar chart for factor scores (0–20 each). Used on investment + demand pages. |
| `components/analytics/MigrationFlowMatrix.tsx` | 4 | NEW COMPONENT | Region × region heatmap grid for migration flows. Used on demand page. |

All other changes are **modifications to existing page files** — new panels, new table columns, new
badges. No new routes beyond the two above.

---

### 12.4 Frontend API Route Extensions

The frontend calls Next.js API routes in `app/api/analytics/`. Check that these proxy routes forward
the new fields returned by the backend services. No new API routes are needed for Slices 1–2 — the
existing `/api/analytics/platform/construction/summary` and `/api/analytics/platform/market/*`
routes will include the new fields automatically once the backend analytics services are updated.

**New proxy routes needed (add alongside existing `/api/analytics/` routes):**

| Route | Slice | Proxies to backend |
|-------|-------|--------------------|
| `/api/analytics/platform/demand/regional-scores` | 3 | `housingDemandScoreService.getScores()` |
| `/api/analytics/platform/infrastructure/scores` | 5 | `infrastructureQualityService.getDistrictScores()` |
| `/api/analytics/platform/rentals/affordability-bands` | 5 | `rentalAnalyticsService.getRentalAffordabilityBands()` |

---

### 12.5 Nav Items Update (`layout.tsx`)

Add two new entries. Final order:

```tsx
const analyticsNavItems = [
    { href: '/dashboard/analytics',                   label: 'MARKET',         icon: BarChart3,   exact: true, subTabKey: 'analytics-market' },
    { href: '/dashboard/analytics/construction',      label: 'CONSTRUCTION',   icon: Hammer,               subTabKey: 'analytics-construction' },
    { href: '/dashboard/analytics/affordability',     label: 'AFFORDABILITY',  icon: Home,                 subTabKey: 'analytics-affordability' },
    { href: '/dashboard/analytics/valuations',        label: 'VALUATIONS',     icon: FileSearch,           subTabKey: 'analytics-valuations' },
    { href: '/dashboard/analytics/demand',            label: 'DEMAND',         icon: Users,                subTabKey: 'analytics-demand' },        // 🆕 Slice 3
    { href: '/dashboard/analytics/infrastructure',    label: 'INFRASTRUCTURE', icon: Zap,                  subTabKey: 'analytics-infrastructure' }, // 🆕 Slice 5
    { href: '/dashboard/analytics/risk',              label: 'RISK',           icon: ShieldAlert,          subTabKey: 'analytics-risk' },
    { href: '/dashboard/analytics/ml',                label: 'ML MODELS',      icon: Brain,                subTabKey: 'analytics-ml' },
    { href: '/dashboard/analytics/short-stay',        label: 'SHORT-STAY',     icon: Building2,            subTabKey: 'analytics-short-stay' },
    { href: '/dashboard/analytics/forecasting',       label: 'FORECASTING',    icon: LineChart,            subTabKey: 'analytics-forecasting' },
    { href: '/dashboard/analytics/geographic',        label: 'GEOGRAPHIC',     icon: Map,                  subTabKey: 'analytics-geographic' },
    { href: '/dashboard/analytics/management',        label: 'MANAGEMENT',     icon: Landmark,             subTabKey: 'analytics-management' },
    { href: '/dashboard/analytics/crm',               label: 'CRM',            icon: Users,                subTabKey: 'analytics-crm' },
    { href: '/dashboard/analytics/team',              label: 'TEAM',           icon: Users,                subTabKey: 'analytics-team' },
]
```

Add `Zap` to the lucide-react import in `layout.tsx`.

Add `'analytics-demand'` and `'analytics-infrastructure'` to the RBAC sub-tab definitions wherever
`'analytics-market'` and `'analytics-risk'` are currently permitted.

---

*Document generated: 2026-06-30 | GSS API audited live against statsbank.statsghana.gov.gh*  
*Data-hub reviewed: gssIncomeService.ts (shipped), economicDataScheduler.ts, syncService.ts, monitoring*
