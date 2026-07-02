/**
 * PropMetrik Analytics — Resources Catalog
 *
 * Canonical definitions, methodologies and metric inventories for every component
 * of the PropMetrik analytics suite. This is the single source of truth for the
 * Documentation → Resources view under /dashboard/analytics/api. Per-endpoint API
 * reference (paths, params, response schemas) is intentionally NOT included yet —
 * the analytics surface is still being finalised. This catalog documents WHAT each
 * metric means and HOW it is derived, so the eventual API reference can point here.
 *
 * All values are computed from real Ghana Statistical Service (GSS), Bank of Ghana
 * (BoG) and PropMetrik transaction data. No metric is seeded or fabricated; where a
 * source component is unavailable a documented re-normalisation is applied.
 */

/**
 * Base URL for every analytics API endpoint. Driven by
 * NEXT_PUBLIC_ANALYTICS_API_BASE_URL so it differs per environment
 * (local / staging / production); falls back to the production host.
 */
export const ANALYTICS_API_BASE_URL =
  process.env.NEXT_PUBLIC_ANALYTICS_API_BASE_URL || 'https://api.propmetrik.com/api/v1'

/**
 * WebSocket streaming gateway URL. The `/ws/analytics` endpoint lives at the API
 * host root (not under /api/v1) and is not proxied through Next, so the browser
 * connects directly. Driven by NEXT_PUBLIC_ANALYTICS_WS_URL per environment.
 */
export const ANALYTICS_WS_URL =
  process.env.NEXT_PUBLIC_ANALYTICS_WS_URL || 'wss://api.propmetrik.com/ws/analytics'

/** Published real-time channels (documentation). */
export const ANALYTICS_STREAM_CHANNELS: { channel: string; product: string; description: string }[] = [
  { channel: 'market.price-index[.<region>]', product: 'market_intelligence', description: 'Property price index — all regions or a single region; pushed on each analytics refresh.' },
  { channel: 'macro.mieg', product: 'analytics', description: 'Monthly Indicator of Economic Growth (Total) — index + YoY.' },
  { channel: 'macro.alerts', product: 'analytics', description: 'Macro alert triggers (NPL / PPI / lending-rate breaches) as they fire.' },
]

/** Copy-paste connect examples for the WebSocket streaming docs. */
export const ANALYTICS_STREAM_EXAMPLES: { lang: string; code: string }[] = [
  {
    lang: 'JavaScript (browser)',
    code: `// Browsers can't set headers on a WS, so the key rides the subprotocol.
const ws = new WebSocket(
  "${ANALYTICS_WS_URL}",
  ["propmetrik-api-key", "pmk_your_key"]
);
ws.onopen = () => ws.send(JSON.stringify({
  action: "subscribe",
  channels: ["market.price-index.greater_accra", "macro.alerts"]
}));
ws.onmessage = (e) => console.log(JSON.parse(e.data)); // snapshot, then update frames`,
  },
  {
    lang: 'Python (websockets)',
    code: `import asyncio, json, websockets

async def main():
    async with websockets.connect(
        "${ANALYTICS_WS_URL}",
        additional_headers={"Authorization": "Bearer pmk_your_key"},
    ) as ws:
        await ws.send(json.dumps({"action": "subscribe",
                                  "channels": ["macro.mieg"]}))
        async for msg in ws:
            print(json.loads(msg))

asyncio.run(main())`,
  },
]

/** Logical route groups that sit under the base URL (reference finalised later). */
export const ANALYTICS_API_GROUPS: { label: string; base: string; note: string }[] = [
  { label: 'Platform analytics', base: '/analytics/platform', note: 'Macro, demand, infrastructure, composites, alerts, affordability' },
  { label: 'Market analytics', base: '/analytics/market', note: 'Price index, investment scoring, rentals, valuations' },
  { label: 'Short-stay analytics', base: '/short-stay', note: 'RevPAR/ADR/occupancy, tourism demand context' },
]

export interface Metric {
  name: string
  /** Short units / range, e.g. "0–100", "GHS/month", "% YoY". */
  unit?: string
  description: string
}

export interface ResourceComponent {
  id: string
  name: string
  /** One-line abstract shown collapsed. */
  summary: string
  /** Full definition — what the metric represents. */
  definition: string
  /** How it is computed — formula / weighting / approach. */
  methodology: string[]
  /** The individual metrics this component exposes. */
  metrics: Metric[]
  /** Underlying data sources. */
  sources: string[]
}

export interface ResourceCategory {
  id: string
  name: string
  blurb: string
  components: ResourceComponent[]
}

export const ANALYTICS_RESOURCES: ResourceCategory[] = [
  // ======================================================================
  {
    id: 'market',
    name: 'Market Intelligence',
    blurb: 'Price levels, momentum and market activity, with a live macro overlay.',
    components: [
      {
        id: 'property-price-index',
        name: 'Property Price Index (PPI)',
        summary: 'Regional property price level and momentum, nominal and inflation-adjusted.',
        definition:
          'A per-region, per-property-type index of transacted/listed property prices, expressed both nominally and in real (inflation-deflated) terms, with month-, quarter- and year-over-year change.',
        methodology: [
          'Median price per region × property type from the properties transaction dataset.',
          'Nominal index rebased to 100 at the base period; MoM / QoQ / YoY computed against prior periods.',
          'Real index = nominal ÷ (1 + inflation_rate); inflation from BoG/GSS CPI. YoY is null when there is no prior-year basis (never fabricated as 0).',
          'A macro overlay attaches MIEG growth, GDP context and the interest-rate cycle to each region row.',
        ],
        metrics: [
          { name: 'avg_price / median_price', unit: 'GHS', description: 'Central price level per region/type.' },
          { name: 'change_mom / change_qoq / change_yoy', unit: '% ', description: 'Period-over-period price change.' },
          { name: 'nominal_index / real_index', unit: 'index (100 base)', description: 'Price level nominal vs inflation-adjusted.' },
          { name: 'mieg_growth_yoy / gdp_growth_context / interest_rate_cycle', description: 'Macro context tags.' },
        ],
        sources: ['properties (transactions)', 'economic_indicators (CPI/inflation)', 'gss_mieg_monthly', 'gss_quarterly_gdp', 'gss_interest_rates_monthly'],
      },
      {
        id: 'market-activity',
        name: 'Market Activity',
        summary: 'Liquidity signals: transactions, listings, absorption, days-on-market.',
        definition:
          'Supply/demand liquidity indicators describing how quickly stock is transacting in a region.',
        methodology: [
          'Transaction and listing counts per region/period.',
          'Absorption rate = sales ÷ available inventory; days-on-market from listing lifecycles.',
          'Supply/demand "temperature" flagged credit-sensitive when Services MIEG contracts 2+ consecutive months.',
        ],
        metrics: [
          { name: 'transactions / listings', unit: 'count', description: 'Volume of activity.' },
          { name: 'absorption_rate', unit: '0–1', description: 'Share of inventory absorbed per period.' },
          { name: 'days_on_market', unit: 'days', description: 'Median time to transact.' },
          { name: 'market_temperature', description: 'hot / balanced / credit-sensitive.' },
        ],
        sources: ['properties', 'property_transactions', 'gss_mieg_monthly'],
      },
    ],
  },
  // ======================================================================
  {
    id: 'construction',
    name: 'Construction Cost',
    blurb: 'Building-cost index calibrated to producer prices and import pressure.',
    components: [
      {
        id: 'cci',
        name: 'Construction Cost Index (CCI)',
        summary: 'National + regional building-cost index, base 100 at Jan 2024.',
        definition:
          'A composite index of the cost to build in Ghana, blending material, labour and overhead costs, with regional multipliers for transport and infrastructure.',
        methodology: [
          'National CCI = Materials 55% + Labour 35% + Overhead 10%, base 100 at Jan 2024.',
          'Materials sub-index blends the internal material-price basket with GSS PPI Construction (α = 0.6) to anchor YoY.',
          'Labour sub-index anchored to AHIES regional median hourly earnings (× trade multiplier × 8h), min-wage as a floor.',
          'Regional CCI applies transport/infrastructure multipliers; import pressure (GCMIPI) surfaced separately.',
        ],
        metrics: [
          { name: 'cci_index', unit: 'index (100 base)', description: 'Overall build-cost level.' },
          { name: 'materials_index / labor_index / overhead_index', unit: 'index', description: 'Sub-indices.' },
          { name: 'change_mom / change_yoy', unit: '%', description: 'Cost momentum.' },
          { name: 'import_material_pressure (GCMIPI)', unit: 'index', description: 'Imported-input cost pressure.' },
        ],
        sources: ['material_prices', 'labor_rates', 'regional_household_income (AHIES)', 'gss_ppi_construction_series', 'gss_construction_material_imports'],
      },
      {
        id: 'gcmipi',
        name: 'Ghana Construction Material Import Pressure Index (GCMIPI)',
        summary: 'Imported-input cost pressure from HS2 construction-material trade.',
        definition: 'Tracks the unit-value cost pressure of imported construction materials (cement, steel, tiles, glass, aluminium, timber…), FX-adjusted.',
        methodology: [
          'GCMIPI = Σ(hs2_weight × unit_value_index × fx_factor) across construction HS2 codes (25, 44, 68–70, 72–73, 76).',
          'When the cedi weakens the FX factor lifts the overhead weight upward.',
        ],
        metrics: [
          { name: 'unit_value_index', unit: 'index', description: 'Import price per unit weight.' },
          { name: 'import_value_ghs / usd', unit: 'currency', description: 'Import spend.' },
        ],
        sources: ['gss_construction_material_imports', 'economic_indicators (FX)'],
      },
    ],
  },
  // ======================================================================
  {
    id: 'affordability',
    name: 'Affordability & Mortgage',
    blurb: 'Who can afford to buy or rent, and the mortgage-eligible pool.',
    components: [
      {
        id: 'ghai',
        name: 'Ghana Housing Affordability Index (GHAI)',
        summary: 'Composite affordability score per region from mortgage, cash and rental lenses.',
        definition:
          'A 0–100 (higher = more affordable) composite of the ability of a region\'s households to access housing via mortgage, cash purchase and rental.',
        methodology: [
          'GHAI = w₁·MHAI + w₂·CHAI + w₃·RHAI, with region weights derived from PHC 2021 tenure + formal-employment (census-derived, not hardcoded).',
          'MHAI (mortgage) uses the live BoG average lending rate; CHAI (cash/savings); RHAI (rental burden at a 30% threshold).',
          'MAS (mortgage-access sub-index) uses real regional formal-employment % (PHC census, authoritative).',
          'Inputs — median property price, median household income, mortgage rate, median rent — are all live/real.',
        ],
        metrics: [
          { name: 'ghai_composite', unit: '0–100', description: 'Overall affordability.' },
          { name: 'mhai / chai / rhai', unit: '0–100', description: 'Mortgage / cash / rental sub-indices.' },
          { name: 'mas', unit: '0–100', description: 'Mortgage-access sub-index.' },
        ],
        sources: ['properties (median price)', 'regional_household_income', 'gss_interest_rates_monthly / BoG', 'gss_phc_employment_by_district', 'gss_phc_tenure_by_district'],
      },
      {
        id: 'rabm',
        name: 'Rental Affordability Band Model (RABM)',
        summary: '% of households who can afford each GHS rent band, risk-adjusted.',
        definition:
          'For each region and GHS rent band (<500, 500–1k, 1k–2k, 2k–5k, 5k+), the share of households that can afford it without spending >30% of income, discounted for labour-market risk.',
        methodology: [
          'affordable_pct = P(monthly_income × 0.30 ≥ band_midpoint), income modelled log-normal (μ = ln(median income), σ = 0.85 documented dispersion).',
          'risk_adj = 1 − (informal_pct × 0.3 + unemployment_rate × 0.5), clamped to [0,1].',
          'effective_demand_pct = affordable_pct × risk_adj.',
        ],
        metrics: [
          { name: 'affordable_pct', unit: '%', description: 'Income-only affordability per band.' },
          { name: 'effective_demand_pct', unit: '%', description: 'Affordability after labour-market risk.' },
          { name: 'risk_adjustment', unit: '0–1', description: 'Informality/unemployment discount.' },
        ],
        sources: ['regional_household_income (AHIES)', 'gss_phc_employment_by_district'],
      },
      {
        id: 'mdpi',
        name: 'Mortgage Demand Potential Index (MDPI)',
        summary: 'Estimated pool of mortgage-eligible households per region.',
        definition: 'The number of working-age households in a region that could qualify for a mortgage at current prices and lending rates.',
        methodology: [
          'qualifying_income = amortised monthly payment on an 80% LTV, 20-year loan ÷ 0.35 debt-service-to-income.',
          'mortgage_eligible_pct = P(income ≥ qualifying_income) × formal_employment_pct.',
          'MDPI = mortgage_eligible_pct × working-age (20–40) population.',
        ],
        metrics: [
          { name: 'mdpi_eligible_households', unit: 'count', description: 'Estimated eligible pool.' },
          { name: 'monthly_payment_ghs / qualifying_income_ghs', unit: 'GHS', description: 'Payment and income threshold.' },
          { name: 'mortgage_eligible_pct', unit: '%', description: 'Share of working-age pop eligible.' },
        ],
        sources: ['properties (median price)', 'gss_interest_rates_monthly', 'regional_household_income', 'gss_phc_population_projections'],
      },
    ],
  },
  // ======================================================================
  {
    id: 'demand',
    name: 'Housing Demand',
    blurb: 'Latent demand, deficit and inter-regional migration pressure.',
    components: [
      {
        id: 'rhds',
        name: 'Regional Housing Demand Score (RHDS)',
        summary: '0–100 composite of latent housing demand per region.',
        definition: 'A relative ranking (min–max normalised across regions) of latent housing demand.',
        methodology: [
          'RHDS = 0.35·pop-growth + 0.25·employment + 0.20·earnings-growth + 0.20·migration.',
          'pop-growth from the 20–40 cohort (2021→2030 projection); employment = formal − 0.5·unemployment; earnings = income growth; migration = GLSS7 in-migration intensity.',
          'Each component min–max normalised across regions; the migration weight redistributes when GLSS7 data is absent.',
        ],
        metrics: [
          { name: 'rhds_score', unit: '0–100', description: 'Composite demand ranking.' },
          { name: 'pop_growth / employment / earnings / migration components', unit: '0–100', description: 'Normalised sub-scores.' },
        ],
        sources: ['gss_phc_population_projections', 'gss_phc_employment_by_district', 'regional_household_income', 'gss_glss7_migration_flows'],
      },
      {
        id: 'hdem',
        name: 'Housing Deficit Estimation Model (HDEM)',
        summary: 'Projected 2030 household demand vs. effective housing stock.',
        definition: 'An estimate of the housing shortfall a region will face by 2030 (negative = surplus).',
        methodology: [
          'projected_households_2030 = population_2030 ÷ avg_household_size.',
          'effective_stock = current_households × fully_completed_pct (completed portion of stock — census-derived proxy).',
          'hidden_demand = current_households × incomplete_residential_pct × 0.40 (latent demand in incomplete structures).',
          'housing_deficit_2030 = projected_households_2030 − effective_stock + hidden_demand.',
        ],
        metrics: [
          { name: 'housing_deficit_2030', unit: 'households', description: 'Projected shortfall (may be negative).' },
          { name: 'projected_households_2030 / effective_stock / hidden_demand', unit: 'households', description: 'Component estimates.' },
        ],
        sources: ['gss_phc_population_projections', 'gss_phc_household_size_by_district', 'gss_phc_completion_by_district'],
      },
      {
        id: 'migration',
        name: 'Inter-Regional Migration Flows',
        summary: 'GLSS7 origin→destination migration matrix and in-migration intensity.',
        definition: 'The share of a region\'s current residents who previously lived in each other region (column-normalised to 100%).',
        methodology: [
          'From GLSS7 (2016/17) Table 6.4; each destination column sums to 100% across origins; the diagonal is the within-region non-migrant share.',
          'In-migration intensity = Σ off-diagonal inflows per destination — the share of residents who migrated in.',
          'GLSS7 uses the pre-2019 10-region classification; successor regions of Brong Ahafo degrade to null (no fabricated split).',
        ],
        metrics: [
          { name: 'flow_pct', unit: '%', description: 'Origin→destination migration share.' },
          { name: 'in_migration_intensity', unit: '%', description: 'Off-diagonal inflow sum per region.' },
        ],
        sources: ['gss_glss7_migration_flows'],
      },
    ],
  },
  // ======================================================================
  {
    id: 'infrastructure',
    name: 'Infrastructure & Digital',
    blurb: 'Physical infrastructure quality and proptech readiness per region.',
    components: [
      {
        id: 'niqs',
        name: 'Neighbourhood Infrastructure Quality Score (NIQS)',
        summary: '0–100 infrastructure-access composite from PHC 2021.',
        definition: 'A weighted composite of household access to electricity, water, sanitation and ICT.',
        methodology: [
          'NIQS = 0.25·electricity + 0.20·piped-water + 0.15·improved-water + 0.15·toilet + 0.15·waste-collection + 0.10·smartphone.',
          'Any absent component is dropped and remaining weights re-normalised (no fabricated values).',
          'Weakest component labelled per region; correlated against price-per-sqm for the AVM-premium context.',
        ],
        metrics: [
          { name: 'niqs_score', unit: '0–100', description: 'Infrastructure quality composite.' },
          { name: 'electricity/piped/improved-water/toilet/waste/smartphone %', unit: '%', description: 'Component access rates.' },
          { name: 'weakest_component', description: 'Lowest-access input.' },
        ],
        sources: ['gss_phc_infrastructure_by_district', 'gss_phc_ict_by_district'],
      },
      {
        id: 'ptmpi',
        name: 'PropTech Market Penetration Index (PTMPI)',
        summary: '0–100 digital-readiness score per region.',
        definition: 'How digitally reachable a region\'s property market is (smartphone, mobile internet, electricity, formal employment).',
        methodology: [
          'PTMPI = 0.30·smartphone + 0.30·mobile-internet + 0.15·electricity + 0.15·formal-employment (+0.10·enrolment when available).',
          'Enrolment component dropped (no ingested source) and weights re-normalised.',
        ],
        metrics: [
          { name: 'ptmpi_score', unit: '0–100', description: 'Proptech readiness.' },
          { name: 'smartphone / mobile_internet / electricity / formal_employment %', unit: '%', description: 'Component rates.' },
        ],
        sources: ['gss_phc_ict_by_district', 'gss_phc_infrastructure_by_district', 'regional_household_income'],
      },
    ],
  },
  // ======================================================================
  {
    id: 'investment',
    name: 'Investment Analytics',
    blurb: 'Opportunity scoring, market depth, shock sensitivity and climate.',
    components: [
      {
        id: 'opportunity-score',
        name: 'Investment Opportunity Score',
        summary: '0–100 composite ranking investment attractiveness per region/type.',
        definition: 'A composite of return and risk factors, each scored 0–20, ranking regions/types for investment.',
        methodology: [
          'Score = cap_rate + price_growth + rental_growth + absorption + risk (each 0–20).',
          'risk_score = max(0, 20 − vacancy×20 − risk_premium×5), further reduced by macro (NPL/policy), CCRI (completion) and MPI (poverty) penalties.',
          'Absorption blends internal absorption (70%) with GLSS7 migration inflow (30%) when available.',
        ],
        metrics: [
          { name: 'opportunity_score', unit: '0–100', description: 'Composite attractiveness.' },
          { name: 'cap_rate / price_growth / rental_yield / absorption / risk scores', unit: '0–20', description: 'Factor decomposition.' },
          { name: 'macro_risk / ccri_risk / mpi_risk / migration_active', description: 'Risk sub-factors + migration flag.' },
        ],
        sources: ['market_cap_rate_benchmarks', 'property_transactions', 'gss_financial_soundness_monthly', 'gss_phc_completion_by_district', 'gss_phc_mpi_by_district', 'gss_glss7_migration_flows'],
      },
      {
        id: 'dpmdi',
        name: 'District Property Market Depth Index (DPMDI)',
        summary: '0–100 measure of market size, liquidity and formalisation.',
        definition: 'How large, liquid and formalised a region\'s property market is.',
        methodology: [
          'DPMDI = 0.35·(renting + owner-occupied) + 0.25·employment-rate + 0.15·earnings-percentile (+0.25·apartment-share when available).',
          'Apartment/semi-detached component dropped (no ingested source) and weights re-normalised.',
        ],
        metrics: [
          { name: 'dpmdi_score', unit: '0–100', description: 'Market depth composite.' },
          { name: 'tenure_participation / employment_rate / earnings_percentile', unit: '%', description: 'Component inputs.' },
        ],
        sources: ['gss_phc_tenure_by_district', 'gss_phc_employment_by_district', 'regional_household_income'],
      },
      {
        id: 'essi',
        name: 'Economic Shock Sensitivity Index (ESSI)',
        summary: '0–100 vulnerability of a region to a macro shock (higher = more exposed).',
        definition: 'How exposed a region\'s housing market is to an economic shock, from employment informality, poverty and banking buffers.',
        methodology: [
          'ESSI = 0.45·(100 − formal_employment) + 0.45·MPI_intensity − 0.10·capital_adequacy, clamped 0–100.',
          'The mortgage×LTV exposure term is dropped (no ingested source) and weights re-normalised.',
        ],
        metrics: [
          { name: 'essi_score', unit: '0–100', description: 'Shock sensitivity (higher = riskier).' },
          { name: 'formal_employment_pct / mpi_intensity / capital_adequacy_ratio', unit: '%', description: 'Component inputs.' },
        ],
        sources: ['regional_household_income', 'gss_phc_mpi_by_district', 'gss_financial_soundness_monthly'],
      },
      {
        id: 'rici',
        name: 'Regional Investment Climate Index (RICI)',
        summary: '0–100 investment-climate composite, companion to the price index.',
        definition: 'A per-region composite of the macro and demand environment for investment (higher = better climate).',
        methodology: [
          'RICI = 0.20·MIEG + 0.15·PPI + 0.15·lending + 0.10·NPL + 0.20·RHDS + 0.10·NIQS.',
          'Macro sub-scores map raw readings to 0–100 (growth good; high inflation/rate/NPL bad); RHDS and NIQS are already 0–100. National macro applies to all regions; RHDS/NIQS are regional.',
        ],
        metrics: [
          { name: 'rici_score', unit: '0–100', description: 'Investment-climate composite.' },
          { name: 'mieg / ppi / lending / npl / rhds / niqs components', unit: '0–100', description: 'Weighted sub-scores.' },
        ],
        sources: ['gss_mieg_monthly', 'gss_ppi_construction_series', 'gss_interest_rates_monthly', 'gss_financial_soundness_monthly', 'regional_housing_demand_scores', 'district_infrastructure_scores'],
      },
    ],
  },
  // ======================================================================
  {
    id: 'valuation',
    name: 'Valuation Methods',
    blurb: 'The six RICS valuation engines plus the macro-adjustment factor.',
    components: [
      {
        id: 'valuation-engines',
        name: 'Valuation Engines (6 methods)',
        summary: 'Sales comparison, DRC, cost, income, profits and residual, per RICS.',
        definition: 'The six methodologies the single Python valuation engine applies to derive a defensible value, reconciled by weight.',
        methodology: [
          'Sales Comparison — GFA-based grid adjustment against comparables, FX-normalised once at engine entry.',
          'DRC (Depreciated Replacement Cost) — replacement cost new less MEA-driven depreciation over useful life.',
          'Cost Approach — full build-up (soft costs, siteworks, developer profit) then depreciate RCN.',
          'Income Approach — pro forma + direct capitalisation + inflation-coherent DCF.',
          'Profits Method — divisible-balance from trading benchmarks and a live cap rate.',
          'Residual — S-curve development finance, NSA, break-even; residual land value.',
          'Reconciliation weights each method; sensitivity via real per-method re-runs.',
        ],
        metrics: [
          { name: 'indicated_value (per method)', unit: 'GHS', description: 'Value from each method.' },
          { name: 'reconciled_value', unit: 'GHS', description: 'Weighted final value.' },
          { name: 'forced_sale_value (FSV)', unit: 'GHS', description: 'Discounted forced-sale figure.' },
          { name: 'method_weights / confidence', description: 'Reconciliation inputs.' },
        ],
        sources: ['properties (comps)', 'specialized_construction_costs', 'trading_property_benchmarks', 'residual_development_assumptions', 'market_cap_rate_benchmarks'],
      },
      {
        id: 'pvmaf',
        name: 'PropMetrik Valuation Macro-Adjustment Factor (PVMAF)',
        summary: 'A bounded multiplier applying live macro signals to a base value.',
        definition: 'A single multiplier (±15% clamp) that adjusts a base/market value for the prevailing macro and infrastructure environment.',
        methodology: [
          'PVMAF = (1+CPI-deviation)(1+PPI-pressure)(1+GDP-momentum)(1−interest-drag)(1+NIQS-premium)(1−CCRI-discount).',
          'Each component is a small bounded transform of a real reading; total multiplier clamped to [0.85, 1.15].',
          'macro_adjusted_value = market_median × PVMAF; national signals apply to all regions, NIQS/CCRI are regional.',
        ],
        metrics: [
          { name: 'pvmaf_multiplier', unit: '0.85–1.15', description: 'Composite macro multiplier.' },
          { name: 'macro_adjusted_value', unit: 'GHS', description: 'Base value after macro adjustment.' },
          { name: 'components{cpi,ppi,gdp,interest,niqs,ccri}', description: 'Signed contributions.' },
        ],
        sources: ['economic_indicators (inflation)', 'gss_ppi_construction_series', 'gss_mieg_monthly', 'gss_interest_rates_monthly', 'district_infrastructure_scores', 'gss_phc_completion_by_district'],
      },
    ],
  },
  // ======================================================================
  {
    id: 'shortstay',
    name: 'Short-Stay & Tourism',
    blurb: 'AirDNA-style short-let performance and tourism demand typing.',
    components: [
      {
        id: 'shortstay-metrics',
        name: 'Short-Stay Performance (RevPAR / ADR / Occupancy)',
        summary: 'Neighbourhood short-let performance from availability calendars.',
        definition: 'Revenue and utilisation metrics for the short-term rental market, per neighbourhood and platform.',
        methodology: [
          'Occupancy = booked nights ÷ total nights.',
          'ADR (Average Daily Rate) averages only priced nights (unpriced calendar rows excluded, not counted as $0).',
          'RevPAR = occupancy × ADR.',
        ],
        metrics: [
          { name: 'avg_occupancy_rate', unit: '%', description: 'Utilisation.' },
          { name: 'avg_daily_rate (ADR)', unit: 'USD', description: 'Average priced-night rate.' },
          { name: 'avg_revpar', unit: 'USD', description: 'Revenue per available night.' },
        ],
        sources: ['short_stay_listings', 'short_stay_availability'],
      },
      {
        id: 'tourism-demand',
        name: 'Tourism Demand Typing',
        summary: 'Classifies markets business / leisure / mixed from GLSS7 tourism.',
        definition: 'A demand-type label per region derived from domestic overnight tourism volume and its urban concentration.',
        methodology: [
          'From GLSS7 (2016/17) domestic overnight visitors + urban/rural split.',
          'Business = material visitor share AND urban-concentrated; Leisure = material share but less urban; Mixed otherwise (self-calibrating vs medians).',
          'RevPAR↔Services-MIEG correlation computed only with ≥6 overlapping months (never a fabricated coefficient).',
        ],
        metrics: [
          { name: 'tourism_demand_type', description: 'business / leisure / mixed.' },
          { name: 'visitor_share_pct / urban_share_pct', unit: '%', description: 'National share and urban concentration.' },
          { name: 'mieg_services_yoy', unit: '%', description: 'Services-sector macro context.' },
        ],
        sources: ['gss_glss7_tourism_by_region', 'gss_mieg_monthly'],
      },
      {
        id: 'rental-analytics',
        name: 'Rental Market Analytics',
        summary: 'Yields, vacancy, rent-to-income, market depth and private-rental share.',
        definition: 'Long-let market metrics enriched with GSS income, tenure and rent-payee data.',
        methodology: [
          'Avg/median rent and rent-per-sqm; gross/net yield; vacancy per region/type.',
          'rent_to_income_ratio = median rent ÷ median monthly income (AHIES).',
          'formal_rental_market_depth_pct = % renting (PHC 2021); private_rental_share_pct = renters paying a private landlord (GLSS7).',
        ],
        metrics: [
          { name: 'gross_yield_pct / vacancy_rate_pct', unit: '%', description: 'Return and vacancy.' },
          { name: 'rent_to_income_ratio', unit: 'ratio', description: 'Affordability of rent.' },
          { name: 'formal_rental_market_depth_pct / private_rental_share_pct', unit: '%', description: 'Market depth and privatisation.' },
        ],
        sources: ['property_transactions', 'regional_household_income', 'gss_phc_tenure_by_district', 'gss_glss7_housing_snapshot'],
      },
    ],
  },
  // ======================================================================
  {
    id: 'macro',
    name: 'Macro Series & Alerts',
    blurb: 'The GSS/BoG macro series that feed every model, plus alert triggers.',
    components: [
      {
        id: 'macro-series',
        name: 'GSS / BoG Macro Series',
        summary: 'Growth, inflation, rates and banking soundness feeding the models.',
        definition: 'The authoritative macroeconomic series ingested from GSS StatsBank and Bank of Ghana that drive the affordability, investment and valuation models.',
        methodology: [
          'MIEG — Monthly Indicator of Economic Growth (Agriculture/Industry/Services/Total), index + YoY.',
          'PPI Construction — producer price index for construction, MoM/YoY.',
          'Quarterly GDP — production and expenditure by sector.',
          'Interest rates — average lending, monetary policy, T-bill (BoG monthly charts PDF + GSS).',
          'Financial soundness — NPL ratio, capital adequacy, liquidity.',
        ],
        metrics: [
          { name: 'mieg_total_yoy', unit: '%', description: 'Broad growth momentum.' },
          { name: 'ppi_construction_yoy', unit: '%', description: 'Construction input inflation.' },
          { name: 'avg_lending_rate / policy_rate', unit: '%', description: 'Credit cost.' },
          { name: 'npl_ratio / capital_adequacy_ratio', unit: '%', description: 'Banking-sector health.' },
        ],
        sources: ['gss_mieg_monthly', 'gss_ppi_construction_series', 'gss_quarterly_gdp', 'gss_interest_rates_monthly', 'gss_financial_soundness_monthly'],
      },
      {
        id: 'macro-alerts',
        name: 'Macro Alert Rules',
        summary: 'Pre-built triggers evaluated live against the macro series.',
        definition: 'Threshold rules that fire when a macro series breaches a documented level, surfaced as alert cards.',
        methodology: [
          'PPI Construction Spike — ppi_construction_yoy > 20% (critical).',
          'Lending Rate Surge — 3-month change > 3pp (warning).',
          'NPL Deterioration — npl_ratio > 12% (critical).',
          'MIEG Contraction — mieg_total_yoy < 0% (warning).',
          'Import Material Inflation — construction import UVI YoY > 15% (warning).',
        ],
        metrics: [
          { name: 'metric_value / threshold / breached', description: 'Current reading vs trigger.' },
          { name: 'severity', description: 'critical / warning / info.' },
        ],
        sources: ['gss_ppi_construction_series', 'gss_interest_rates_monthly', 'gss_financial_soundness_monthly', 'gss_mieg_monthly', 'gss_construction_material_imports'],
      },
      {
        id: 'mpi',
        name: 'Multidimensional Poverty (MPI)',
        summary: 'PHC 2021 poverty incidence, intensity and index per region.',
        definition: 'The Alkire-Foster multidimensional poverty measures used as a structural risk discount in investment scoring.',
        methodology: [
          'Incidence (H) = share of poor households; Intensity (A) = average deprivation among the poor; M0 = H × A.',
          'Full-precision M0 recovered as H × A to avoid the GSS 1-dp banding collapse.',
        ],
        metrics: [
          { name: 'mpi_incidence (H) / mpi_intensity (A)', unit: '%', description: 'Headcount and depth of poverty.' },
          { name: 'mpi_m0', unit: '0–1', description: 'Multidimensional poverty index.' },
        ],
        sources: ['gss_phc_mpi_by_district'],
      },
    ],
  },
]
