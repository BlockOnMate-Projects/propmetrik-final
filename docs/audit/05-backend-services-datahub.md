# Audit 05 — backend/src/services/data-hub (Data Hub: scrapers, ETL, sync, schedulers, GSS ingestors)

**Date:** 2026-07-02 · **Auditor:** Senior Staff Engineering review (4 parallel deep-audit passes + coordinator cross-verification)
**Repo root:** `/Users/kobby/github/Cedyn Group/propmetrik` · All paths below relative to `backend/src/services/data-hub/` unless prefixed.

## Scope & counts

| Slice | Files | LOC |
|---|---|---|
| TypeScript under `data-hub/` (excl. `pipelines/scrapy/venv/`) | **81** | **38,203** |
| Scrapy project's own Python source (spiders, settings, pipelines, worker, utils) + Airflow DAG | **30** | **9,437** |
| **Total audited** | **111** | **47,640** |

Excluded: `pipelines/scrapy/venv/` (vendored Python), empty `stores/*` directories (no source files).

## Domain scores (1–10, higher = better)

| Dimension | Score | Rationale |
|---|---|---|
| **Performance** | **3** | Row-by-row single-INSERT loops are the dominant write pattern (GSS ×15 loops, bogScraper, wdiClient, localMaterialScraper, baseCost, jobQueue, pipelines.py) against a REMOTE prod DB; full-history refetch every run with no watermarks; N+1 index computation; sequential fetches where parallel is safe. |
| **Resilience** | **4** | Timeouts/retry mostly present on HTTP (axios-retry, AbortSignal) — but failure MASKING is systemic: "success with 0 records" on total fetch failure, swallowed catches, scheduler jobStatus that never reports GSS failures, catch-up name mismatches, no overlap mutex on compute jobs, stuck-'running' sync logs. |
| **Security** | **4** | SQL is parameterized essentially everywhere (2 benign interval interpolations) — good. But: SSRF via DB-stored partner URLs, unauthenticated scrapy worker on 0.0.0.0, `rejectUnauthorized:false` ×3 on BoG feeds, hardcoded anonymization salt in repo, credential rotation bug. |
| **Duplication / DRY** | **3** | PxWeb transport copy-pasted 7×, stride resolver 6×, sync-boilerplate 10×, syncService wrapper 7×, 3 incompatible RegionCode enums, 4 Ghana-bounds/haversine copies, 3 spider-list copies, 3 Ghana-geo implementations (TS ×2 + Python). |
| **Dead code** | **3** | ~5,000+ LOC dead or unreachable: entire TS ETL layer (orchestrators, propertyStorage, etlJobProcessor), dataSourceScheduler, bookingScraper, mlIntegrationService, scheduledGeocodingService, 4 microservice wrappers, root middlewares.py, Airflow DAG, ownkey spider (unreachable), tonaton (stub still scheduled). |
| **Config hygiene** | **4** | Cron expressions are env-overridable (good pattern, economicDataScheduler DEFAULT_CONFIG); everything else — URLs, UA strings ×3 duplicated, table codes, retry counts, cost matrices, FX fallbacks — is scattered hardcode. |
| **Correctness / data quality** | **3** | Yahoo FX stamped as official Bank of Ghana; hardcoded FX 12 on public listings; PPI history returns oldest-N; several services fabricate metrics (Math.random job stats, hardcoded predictions, fake SLA, checksum theater). |
| **Overall** | **3.5** | The GSS Slice-3/4 work and scrapyScheduler are genuinely good; around them sits a large ring of dead, duplicated, and silently-failing machinery. |

---

## TOP FINDINGS (by priority)

### P0 — fix now

1. **SSRF via DB-stored partner endpoint URLs** — `apiPullIntegrationService.ts:256-264,386-395` uses `endpoint.endpoint_url` / `batch_fallback_url` from `partner_api_endpoints` rows as axios `baseURL` with no allowlist/scheme/private-IP validation; `partnerApiClient.ts:167` POSTs OAuth client_id/secret to a stored `token_endpoint` with **no timeout** — anyone who can write an endpoint row (via `routes/pullIntegrations.ts`) can make the backend hit `169.254.169.254`, localhost admin APIs, or the Hetzner infra host, and exfiltrate OAuth secrets. **Fix:** URL validator (https-only, deny private/link-local ranges, optional hostname allowlist) applied at row-save AND request time; timeout on the token call.

2. **Unauthenticated scrapy worker with unlimited process spawn** — `pipelines/scrapy/api_server.py:100-141,264`: Flask on `0.0.0.0:5000`, `/run` and `/run-sync` have zero auth and no concurrent-run cap (command injection is mitigated by the spider whitelist + list-form subprocess args). Anyone with network reach can fork-bomb the worker or tie up threads 1h each. **Fix:** shared-secret header (checked in api_server, sent by `scrapyScheduler.ts:214`), max-running-jobs cap.

3. **Official-FX provenance poisoning** — `fxFeedService.ts:769-772,786-794,848-851` stamps Yahoo Finance historical data as `source:'Bank of Ghana', is_official:true`; `economicDataService.ts:417-443` saves it. Fresh INSERTs bypass the `NOT ILIKE 'Bank of Ghana%'` UPDATE guard (`fxFeedService.ts:496`) and land exactly where `getLatestDailyBankOfGhanaRate` (`economicDataService.ts:180-189`) — the FX-settled rent settlement path — looks for the official rate. **Compounding:** the real official source, `bogDailyFxScraper.ts:57`, uses the bot UA `'PROPMETRIK Economic Data Bot/1.0'` that `bogScraper.ts:38-39` documents as **blocked by BoG's Cloudflare**, and it bypasses syncService so its failures are never sync-logged — the settlement-critical daily scrape is plausibly silently dead while Yahoo data masquerades as BoG. **Fix:** correct source labels on the Yahoo paths; browser UA + sync-logging on bogDailyFxScraper.

4. **Bull job queue silently drops every job in production** — `jobQueue.ts:328-336`: the API process always initializes stub mode (`backend/src/index.ts:931` → `jobQueue.ts:159-170`); stub `addJob` logs a warning and returns a **fake job object**. The full-mode entrypoint `scripts/queue-worker.ts` has no npm script and no deploy artifact. Producers — CRM property/transaction sync (`routes/crm/deals.ts:344`, `routes/crm/properties.ts:639,759`), manual queue triggers (`routes/dataHub.ts:230,1039`), `ingestionService.ts:41` — all believe their jobs queued; they vanish. **Fix:** deploy the worker or reroute producers to the DB-backed `etl_jobs` path; make stub `addJob` throw.

5. **Spider fleet drift: ownkey unreachable, tonaton fake-success** — `scrapyScheduler.ts:68-77` schedules `ownkey`, but `api_server.py:54-57` `AVAILABLE_SPIDERS` omits it → every dispatch is HTTP 400 → permanent failed ETL jobs + hourly retry churn (the ownkey spider that was built never runs). `tonaton` is a disabled stub (`spiders/tonaton.py:32-35`) still scheduled — exits 0, marked "completed", 0 records → fake green metrics and a wasted concurrency slot. **Fix:** one line each (add ownkey to whitelist; drop tonaton from defaults).

### P1 — fix soon

6. **Every restart triggers a full material + GREDA rescrape and the whole construction recalc chain** — catch-up lookups use source names `'Local Material Prices (ConstructionGhana.com)'` / `'GREDA/BRRI'` (`schedulers/economicDataScheduler.ts:381-382,396-397`) but sync logs are written as `'Local Material Prices'` / `'GREDA/BRRI Construction Costs'` (`scrapers/syncService.ts:399,587`) — never matches → always "stale" at boot. Compounds with **`localMaterialScraper.ts:346-385`: plain INSERT, no ON CONFLICT** — ~1,000 append-only rows per run (each product ×5 fabricated regional rows), so `material_prices` bloats on every deploy. Also: flat 7-day staleness applied to ANNUAL census sources (`:370-371,460`) re-ingests the full census after any week-old restart. **Fix:** align the name constants (or match on a stable source key); ON CONFLICT upsert keyed (material, region, effective_date); per-source staleness thresholds.

7. **"Success" reported on total failure — systemic masking.** `bogScraper.ts:235-266,438` (category fetch errors → `[]`, `recordsFailed===0` → 'success'); `wdiClient.ts:369-376,440-447` (same); `gredaScraper.ts:233,453-472` (all probe 404s debug-logged; derived-recalc rows count as "records_saved" so a 0-row scrape is green); `apiPullIntegrationService.ts:352-380` (`executeBatchFallback` = sleep(2000) then `status:'completed'`); `ingestionSubmissionService.ts:344-419` (checksum "verification" never reads the object; validation sleeps 1s and accepts everything at quality 0.95); scheduler GSS wrappers swallow errors so `jobStatus.lastStatus` is always 'success' (`economicDataScheduler.ts:993-1143`); `syncService.ts:885-896` healthCheck returns hardcoded `true` for 5 sources. **Fix:** status must derive from fetch success, not just save failures; delete or implement the stubs.

8. **GSS write path: thousands of sequential single-row INSERTs to the remote prod DB, full-history refetch every run.** 15 row-by-row upsert loops (matrix below); worst: `gssFinancialService.ts:135,159-177` interest.px with `Month:'all'` ≈ 3,600 round-trips per run; `gssTradeService.ts:121,268-296` ≈ 2,000–3,000/run monthly. No watermark anywhere. **Fix:** shared `batchUpsert()` (multi-row VALUES, chunk 200) + per-series MAX(period_date) watermark → request only newer months.

9. **PPI history bug (live, feeds CCI charts)** — `gssPpiService.ts:503-515`: `getConstructionPpiHistory(months)` uses `ORDER BY period_date ASC LIMIT $1` → returns the 36 **oldest** months. The identical bug was found and fixed in `gssFinancialService.ts:439-453`; the PPI copy wasn't ported. `constructionCostIndexService.ts:209` charts stale history.

10. **Partner-credential pipeline broken in three independent places** — (a) `credentialsService.ts:243` `rotateCredentials` derives the key with `:credential:` while store/get use `:${credentialType}:` (`:129,:200`) and never updates `encryption_key_id` → rotation bricks the credential (GCM auth failure); (b) `apiPullIntegrationService.ts:462-468` `UPDATE api_pull_jobs ... ORDER BY ... LIMIT 1` is **invalid Postgres** → incremental sync tracking can never persist; (c) `initializeScheduler()`/`initialize()` are never called at boot → the cron machinery in both apiPull services is dead. Consistent picture: the partner-pull pipeline has never run end-to-end.

11. **Weak anonymization of Tier-2 financial PII** — `anonymizationService.ts:69,225-233`: unsalted-per-record SHA-256 with hardcoded in-repo default salt `'propmetrik-anonymization-2026'` — dictionary-reversible for phones/Ghana Card IDs/accounts; `:96-112` no-rules → raw records pass through with `compliance_verified:false` and the caller (`apiPullIntegrationService.ts:290-295`) stages them anyway. Ghana DPA exposure.

12. **Public listing pages: broken comparables + hardcoded FX 12** — `propertyEnrichmentService.ts:941` overrides the working PostGIS `fetchComparables` with the OpenSearch variant whose own comment (`:525`) says it's broken; `:233-234` converts with hardcoded 12 GHS/USD (live ≈15.5; `currencyFx` helper exists) → USD listings mispriced ~30% publicly.

13. **`rejectUnauthorized: false` on all BoG feeds** — `bogScraper.ts:78`, `bogDailyFxScraper.ts:46`, `bogChartsPdfService.ts:88`: TLS verification disabled on the feeds that set official rates. Replace the blanket disable with a pinned CA for BoG's incomplete chain, defined once.

### P2 — plan

14. **Dead-code sweep (~5,000 LOC, some actively misleading):** entire TS ETL layer — `etl/orchestrator.ts` (699), `etl/index.ts` ETLPipeline (231, contains an infinite loop at `:215` — `batchSize:0` → `offset+=0`), `etl/propertyStorage.ts` (625), `etl/dataEnrichment.ts` (578, hardcoded FX 12.5 at `:373`), most of `etl/deduplication.ts` legacy path — zero callers; the real property writer is Python `pipelines.py`. Plus `etlJobProcessor.ts` (421 — **fabricates job stats with Math.random** `:288-390`), `schedulers/dataSourceScheduler.ts` (338, never started, not even exported by `schedulers/index.ts`), `scrapers/bookingScraper.ts` (78, mock returning 2 fake listings), `mlIntegrationService.ts` (469), `scheduledGeocodingService.ts` (243), the 4 `microservices/**/gss-*-sync.ts` wrappers (77), root `middlewares.py` (310, shadowed by the package), `pipelines/airflow/dags/cap_rate_benchmark_refresh_dag.py` (388, no Airflow deployment exists), `economicDataService.updateExchangeRates` (`:499`), 4 dead GSS getters. Several dead files would ALSO be broken if revived (legacy column names, non-existent tables/functions — see file-by-file).

15. **Config module.** Recommend `data-hub/config.ts` (or grow `scrapers/types.ts`, which already holds BOG_INDICATOR_MAPPING/WDI_INDICATORS/VALIDATION_RULES): StatsBank host + `.px` table paths (incl. the version-stamped `mieg_px_March26.px`, `gssMiegService.ts:30` — breaks on next GSS republish), all scraper base URLs, the 3×-duplicated browser UA, bot UA, timeouts/retries/batch sizes, currency lists, worker URL, spider list (single source shared with `api_server.py`/`run_spider.py` — currently 3 diverging copies). Cron expressions are already env-driven (keep).

16. **RegionCode / Ghana-geo unification.** Three incompatible RegionCode enums (`types.ts:79-84` legacy-5, `constructionCostService.ts:66-85` 19-value, `specializedCostService.ts:38` legacy-5) vs the 16-region partitioned `properties` table (mig 241 — writes with unknown region 500 at the partition layer). Four copies of GHANA_BOUNDS/haversine (geocodingService `:13/:618`, ghanaPostGeocodingService `:86`, addressValidationService `:62/:483`) with **differing bounds**; region-name maps duplicated in scheduledGeocoding `:189` / propertyEnrichment `:713`; Ghana-geo logic triplicated (etl/addressStandardization.ts, etl/propertyStorage.ts, Python `utils/ghana_location.py`).

17. **baseCost/constructionCost schema mismatch (verify against migrations):** `baseCostCalculationService.ts:560-567,603-610` queries `material_prices.category/effective_date` and `labor_rates.category` while `constructionCostService.ts:528-531,572-575` uses `material_category/labor_category/survey_date` on the same tables — if both column sets don't exist, `recalculateAllBaseCosts` (Mon 1 PM cron) throws immediately and valuations quietly run on 2024-era hardcoded matrices. Related: `constructionCostService.ts:1032-1075` "index" averages absolute prices across incompatible units (GHS/bag with GHS/trip) and can arbitrarily scale `estimateConstructionCost` (`:902`) when `construction_cost_indices` is empty.

---

## GSS-SCAFFOLD DUPLICATION ANALYSIS

12 GSS TypeScript services + 4 wrapper stubs, 5,398 LOC. All PxWeb consumers hit `statsbank.statsghana.gov.gh` (json-stat2). `scrapers/gssPhcShared.ts` (118 LOC) is the intended shared module — **only 4 of 11 PxWeb services use it; 6 bypass it with copy-pasted scaffolding** (ironically including `gssPhcHousingService.ts`, the file shared was extracted FROM, and `gssIncomeService.ts`, the original template).

**Uses shared (4):** gssGlss7Service, gssPhcEmploymentService, gssPhcPopulationService, gssPhcPovertyService.
**Bypasses (6):** gssFinancialService, gssPpiService, gssMiegService, gssTradeService, gssPhcHousingService, gssIncomeService.
**N/A (1):** gssLaborService — axios+cheerio HTML scraping, not PxWeb.

### Duplication matrix

| Scaffold block | Canonical | Copies (file:lines) | ~dup LOC |
|---|---|---|---|
| `pxPost` json-stat2 POST transport | gssPhcShared.ts:51-82 | gssFinancialService.ts:65-88 · gssPpiService.ts:81-117 · gssMiegService.ts:51-74 · gssTradeService.ts:72-99 (90s timeout) · gssPhcHousingService.ts:76-103 · gssIncomeService.ts:65-101 (30s) — **7 implementations total** | ~178 |
| `pxGet` metadata GET | **missing from shared** | gssFinancialService.ts:90-103 · gssPpiService.ts:119-138 · gssMiegService.ts:76-89 · gssIncomeService.ts:233-252 — none check statusCode (404 HTML → misleading "parse error") | ~68 |
| `PxStat2`/`PxMeta` types | gssPhcShared.ts:34-42 | financial:55-63 · ppi:60-79 · mieg:41-49 · trade:66-70 · housing:68-74 · income:59-62 | ~55 |
| `STATSBANK_HOST` const | gssPhcShared.ts:15 | 6 more copies (financial:26, ppi:31, mieg:28, trade:38, housing:37, income:33) | ~6 |
| `GSS_REGIONS` 16-region list | gssPhcShared.ts:18-22 | housing:53-57 · income:48-52 | ~12 |
| `regionKey()` / `sleep()` | gssPhcShared.ts:25-27,45 | housing:60-62,106 · income:55-57 | ~7 |
| Dimension/stride resolution | gssPhcShared.ts:95-118 `pxGetValue` | **6 parallel implementations**: mieg buildMap :150-174 · trade buildTradeMap :139-173 · ppi buildMap :196-211 (fixed-order — fragile; `'Industry '` trailing-space probe at :197 shows it already bit) · housing valuesByRegionSingleClass :116-142 (index-0 assumption) + getRegionValue :587-602 · income valuesByRegion :104-114 · financial inline stride math :145-154,212-221 | ~140 |
| `monthCodeToDate` | — | financial:106-110 ≡ ppi:141-145; near-twin income:267-271 | ~14 |
| sync() boilerplate (startSync → per-section try/catch → SyncResult → completeSync) | — | 10 copies: financial:251-318 · ppi:394-462 · mieg:320-401 · trade:303-355 · glss7:271-347 · housing:641-755 · population:201-263 · employment:190-251 · poverty:153-200 · income:366-526 | ~480 |
| Row-by-row upsert loop shape | — | 15 instances (see per-file) | ~200 |

**Total duplicated scaffold ≈ 950–1,150 LOC (~20% of the GSS surface).** Two live bugs trace directly to divergent copies: the PPI ASC/LIMIT history bug (fixed in financial, unfixed in the ppi copy) and the trailing-space dimension probe.

### Consolidation plan

Grow `gssPhcShared.ts` → `scrapers/gssStatsbankClient.ts` (~200 LOC; keep re-exports for the 4 current importers):

- **Config:** `STATSBANK` object — host, timeoutMs (60s) / largeTimeoutMs (90s) / metaTimeoutMs (30s), retries+backoff, politeDelayMs, `.px` path registry; `GSS_REGIONS`, `GLSS7_REGIONS` (old 10), `regionKey`.
- **Transport:** `pxPost(path, query, opts)` — add retry/backoff + statusCode check; **new** `pxGet(path, opts)` for metadata (kills 4 copies, adds the missing statusCode check).
- **Resolution:** existing `pxGetValue`; **new** `pxCollect(px, rowDim, colDim, fixed?)` general-stride map builder (replaces all 6 ad-hoc buildMaps); `monthCodeToDate`, `quarterToDate`.
- **Persistence/orchestration:** `batchUpsert(table, cols, conflictCols, rows, chunk=200)` — multi-row VALUES upsert (fixes P1-#8); `runGssSync(source, sections[])` — the startSync/per-section-catch/completeSync scaffold written once.

Per-service migration: housing = biggest win (delete `:37-106`, replace 2 resolvers, collapse 11+13-call fetch fans into ~8 multi-value queries); income (delete `:33-114,:233-252`, fold the per-region formal-emp UPDATE `:476` into the main upsert: 32 → 2 round-trips); financial/ppi/mieg/trade (delete transport, adopt pxCollect + batchUpsert + runGssSync + watermarks; fix ppi `:503` DESC; parameterize trade `:376` interval); glss7/phc-trio (already on shared; adopt batchUpsert + runGssSync). gssLaborService: out of PxWeb scope, but delete its 3 dead getters and add UNIQUE(role, region, month) + upsert to stop `labor_rates` unbounded growth (`gssLaborService.ts:386-427` appends 120 rows/month forever). Delete the 4 dead `microservices/**` wrappers (77 LOC).

**Estimated net LOC removal: ~700–800** (gross ~950–1,100 minus shared-module growth), plus elimination of 6 divergent timeout behaviors and 6 stride implementations.

---

## SCHEDULER MAP

**Boot wiring** (`backend/src/index.ts`): `scrapyScheduler.start()` at `:937`; `economicDataScheduler.start()` at `:943` (gated `ECONOMIC_SCHEDULER_ENABLED !== 'false'`; construction block additionally `CONSTRUCTION_SCHEDULER_ENABLED`); `analyticsScheduler` at `:955`; `jobQueue.initialize()` (STUB mode) at `:931`. Timezone `Africa/Accra` (env `SCHEDULER_TIMEZONE`), node-cron. **NOT started anywhere:** `schedulers/dataSourceScheduler.ts` (not even exported by `schedulers/index.ts`), `apiPullSchedulerService.initialize()`, `apiPullIntegrationService.initializeScheduler()`, `scheduledGeocodingService.start()`, `etlJobProcessor.start()`.

### economicDataScheduler (`schedulers/economicDataScheduler.ts:206-325`; defaults `:107-138`, all env-overridable)

| Job | Cron (default) | Schedule | Runs → tables |
|---|---|---|---|
| bog-sync | `0 8 1 * *` | 8 AM 1st monthly | syncBOG('latest') → economic_indicators |
| wdi-sync | `0 0 1 */3 *` | midnight 1st Jan/Apr/Jul/Oct | syncWDI('full') → economic_indicators |
| fx-cache-update | `*/5 * * * *` | every 5 min | fxFeedService.getAllRates → Redis only |
| fx-daily-save | `0 17 * * 1-5` | 5 PM weekdays | syncFX → economic_indicators (daily) |
| bog-fx-daily | `30 9 * * 1-5` | 9:30 AM weekdays | bogDailyFxScraper (direct — **bypasses syncService, never sync-logged**) → economic_indicators |
| gss-income-affordability | `0 4 1 * *` | 4 AM 1st | gssIncome + ghaiService.computeAndStoreFromSources → regional_household_income, housing_affordability_index |
| gss-financial-sync | `0 5 12 * *` | 12th 5 AM | → gss_interest_rates_monthly, gss_financial_soundness_monthly |
| gss-ppi-sync | `0 5 15 * *` | 15th 5 AM | → gss_ppi_construction_series, gss_iip_monthly |
| gss-mieg-sync | `0 5 20 * *` | 20th 5 AM | → gss_mieg_monthly + quarterly GDP |
| gss-trade-hs2-sync | `0 5 10 * *` | 10th 5 AM | → gss_construction_material_imports |
| gss-phc-housing-sync | `0 2 1 1 *` | Jan 1 (annual) | → gss_phc_* housing tables |
| gss-phc-pop-emp-pov-sync | `0 2 2 1 *` | Jan 2 (annual) | pop+emp+poverty + RHDS recompute |
| gss-glss7-sync | `0 2 3 1 *` | Jan 3 (annual) | → gss_glss7_* + RHDS recompute |
| gss-derives-recompute | `0 3 5 1 *` | Jan 5 (annual) | NIQS + RHDS + HDEM + composites |
| npa-fuel-sync † | `0 9 * * 1` | Mon 9 AM | → fuel_prices |
| material-price-sync † | `0 10 * * 1` | Mon 10 AM | → material_prices |
| labor-rate-sync † | `0 11 * * 1` | Mon 11 AM | → labor_rates |
| construction-index-recalc † | `0 12 * * 1` | Mon 12 PM | construction_cost_indices |
| base-cost-recalc † | `0 13 * * 1` | Mon 1 PM | base_costs_per_sqm |
| greda-sync † | `0 14 * * 1` | Mon 2 PM | → specialized_construction_costs |
| specialized-cost-recalc † | `0 15 * * 1` | Mon 3 PM | specialized_construction_costs |
| construction-freshness-check † | `0 6 * * *` | daily 6 AM | self-heal recompute if >7d stale |

† = only when constructionEnabled. Plus **startup catch-up** 30s after boot (`:338-510`): any source whose last successful sync-log is >7 days old is re-run sequentially, then the full construction recalc chain if any construction source was stale.

### scrapyScheduler (`scrapyScheduler.ts:126-165`)

| Job | Cron | Runs |
|---|---|---|
| weekly full scrape | `0 2 * * 0` (Sun 2 AM) | all `enabledSpiders` (meqasa, housemaster, gpc, realtor, airbnb_ghana, daily_graphic_legal, **tonaton** (stub), **ownkey** (unreachable)), concurrency 2, via worker `http://scrapy-worker:5000` |
| daily update scrape | `0 3 * * *` | same spiders, update mode |
| retry failed | `0 * * * *` hourly | re-dispatch failed spiders (max 3) |
| reaper | `*/30 * * * *` | fail orphaned running etl_jobs |
| worker health/degradation | `0 */6 * * *` | health + no-new-listings alerts |

### analyticsScheduler (related, `services/analytics/analyticsScheduler.ts`)
`30 3 1 * *` monthly snapshots + `bogChartsPdfService.refresh()` (return value **ignored** — failures invisible); `0 4 * * *` daily flood-MV refresh.

### Scheduler risks

1. **HIGH — catch-up name mismatch** (`economicDataScheduler.ts:381,396` vs `syncService.ts:399,587`) → material+GREDA scrape + full construction recalc chain on **every restart** (see P1-#6).
2. **HIGH — flat 7-day staleness on annual census sources** (`:370-371,460`) — any week-old restart re-ingests the full census.
3. **MED — clock-ordered Monday chain (9→15h) with no completion dependency** — step N never verifies N-1 finished/succeeded before reading its tables.
4. **MED — duplicate recalc:** `gredaScraper.ts:452` already runs `recalculateDerivedCosts`; the 3 PM job repeats it.
5. **MED — no overlap mutex** in `scheduleJob` (`:625-668`); syncService's in-process `runningJobs` map covers scrapes only (and is per-process — replicas would race); recalc + fx-cache jobs have nothing. ALREADY_RUNNING is recorded as a `failed` sync, polluting health stats.
6. **MED — jobStatus lies:** GSS `run*` wrappers (`:993-1143`) swallow errors → `lastStatus` always 'success'; the status endpoint (`routes/dataHub.ts:1706`) reports green on total failure.
7. **MED — 1st-of-month ordering:** analytics snapshot (03:30) precedes income sync (04:00) and bog-sync (08:00) — GHAI snapshot transiently uses prior-month income.
8. **MED — index fallback magic numbers** feed a published index: 118.0/112.0 fallbacks, CPI×0.95/×1.02, Jan-2020 base prices/weights (`:863-864,1204,1209-1234,1264-1323`); `getLatestCPI` reads CPI from `exchange_rates_historical` (`:1335`) — suspicious table.
9. **LOW — `triggerSync('all')`** (`:559-569`) omits GREDA, GSS StatsBank sources, and recalcs — "all" is partial.

---

## FILE-BY-FILE

Severity key: H/M/L. "LIVE" = invoked by a scheduler, route, or live service; evidence given for dead verdicts.

### GSS StatsBank family (12 services + 4 wrappers)

| File | LOC | Verdict | Key findings |
|---|---|---|---|
| scrapers/gssPhcShared.ts | 118 | LIVE (4 importers) | The correct shared PxWeb module. M: pxPost has no retry/backoff (`:51-82`) — inherited by all consumers. L: hardcoded 60s timeout `:62`. Gap: no `pxGet` helper (why 4 services carry their own). |
| scrapers/gssFinancialService.ts | 485 | LIVE (cron + investmentScoring/marketIntelligence/analyticsScheduler) | H-dup: own pxPost `:65-88`/pxGet `:90-103`/types `:55-63`. H-perf: row-by-row upserts `:159-177,226-244` with `Month:'all'` `:135` ≈ 3,600 round-trips/run, no watermark. M: pxGet ignores statusCode. L: getters swallow all errors → null (`:339,396,431,456,479`); hardcoded rate lists `:31-49`. |
| scrapers/gssPpiService.ts | 528 | LIVE (cron + CCI) | **M-BUG `:503-515`: history ORDER BY ASC LIMIT → oldest-N not latest-N** (ported-bug, fixed in financial only). H-dup transport `:81-138`. H-perf: full-history row-by-row `:243-272,349-383` (fetch is properly Promise.all `:175-191`). M: fixed-order buildMap `:196-211` + `'Industry '` trailing-space probe `:197`. L: GSS typo'd industry labels hardcoded `:37-54`. |
| scrapers/gssMiegService.ts | 476 | LIVE (cron + marketIntelligence/CCI) | H-dup transport `:51-89`. H-perf row-by-row full history `:199-224,289-313`. M: buildMap `:150-174` = 3rd stride implementation; sector-dimension discovery by exclusion `:244` fragile. L: **version-stamped table path `mieg_px_March26.px` `:30`** — breaks on GSS republish. |
| scrapers/gssTradeService.ts | 410 | LIVE (cron + CCI) | H-dup transport `:72-99`. H-perf: ~2-3k sequential INSERTs/run `:268-296`, `Year:'all'` `:121`. L-sec: `INTERVAL '${months} months'` `:376` (internal literal today; use make_interval). L: verbatim HS2 label filters `:45-57` silently drop on GSS rewording; GCMIPI weight comment/code drift `:362-384`. |
| scrapers/gssGlss7Service.ts | 506 | LIVE (cron + investmentScoring/rentalAnalytics) | GOOD — model consumer of shared (`:35-41`). M: 3 small row-by-row loops `:94-109,158-180,232-254`. L: getters intentionally swallow "table absent" `:365,451,501`. |
| scrapers/gssLaborService.ts | 544 | LIVE (cron labor-rate-sync) | Not PxWeb (axios+cheerio). **H: `saveRates` `:386-427` plain INSERT, no unique key — +120 near-dup rows/month forever**; readers compensate with DISTINCT ON. M: Fair-Wages homepage regex scrape fragile `:189-216`; `/surveys/cost-of-living` scrape is a permanently-null dead path `:229-265`. DEAD (high conf): getRatesByRegion `:487`, getMinimumWage `:514`, getAverageSkilledRate `:521` — zero callers. |
| scrapers/gssPhcEmploymentService.ts | 295 | LIVE (Slice-3 cron + GHAI/RHDS) | GOOD (uses shared). L: 16-row upsert loop `:135-160`; per-region correlated UPDATE backfill `:167-183` could be one statement. Overlap: re-fetches the same 2 tables gssIncomeService fetches monthly (`gssIncomeService.ts:125-230`). |
| scrapers/gssPhcPopulationService.ts | 321 | LIVE (Slice-3 cron + RHDS) | GOOD (uses shared). M: 240 sequential INSERTs annually `:109-127`. DEAD: getAvgHouseholdSizeByRegion `:302` (Slice-5 not built). Overlap: hhsize table also fetched by gssIncomeService `:193-205`. |
| scrapers/gssPhcPovertyService.ts | 246 | LIVE (Slice-3 cron + investmentScoring) | GOOD — cleanest of the set. L: 16-row loop `:121-146`; hardcoded measure labels `:39-46`. |
| scrapers/gssPhcHousingService.ts | 849 | LIVE (annual cron + GHAI/NIQS/6 consumers) | H-dup: never migrated to the shared module extracted FROM it (`:37-106` all byte-dup). M: 2 more stride resolvers `:116-142,587-602`; 11+13 parallel pxPost fans `:249-263,447-467` where ~8 multi-value queries would do. L: `flushSum||null` zero-vs-null `:503`; `noToilet` fetched but never persisted `:426-434,512-520`. 5 upsert loops ≈ 80 round-trips/run. |
| gssIncomeService.ts | 543 | LIVE (monthly cron + GHAI) | H-dup: the ORIGINAL template others copied (`:33-114,233-252`). M: per-region INSERT+UPDATE = up to 32 sequential round-trips `:409-488`; pxGet ignores statusCode; `valuesByRegion` `:104-114` most assumption-laden resolver. |
| microservices/**/gss-ppi-sync.ts | 22 | **DEAD (high conf)** | Zero imports repo-wide; no dynamic loader over `microservices/`. Scheduler job names merely coincide with file names. Delete. |
| microservices/**/gss-financial-sync.ts | 18 | **DEAD (high conf)** | Same. |
| microservices/**/gss-mieg-sync.ts | 18 | **DEAD (high conf)** | Same. |
| microservices/**/gss-trade-hs2-sync.ts | 19 | **DEAD (high conf)** | Same. |

### Other scrapers + sync + monitoring

| File | LOC | Verdict | Key findings |
|---|---|---|---|
| scrapers/bogScraper.ts | 485 | LIVE (bog-sync monthly + catch-up) | **H: `rejectUnauthorized:false` `:78`** (official-rate feed, MITM-able). H: category errors → `[]` → "success, 0 records" `:235-266,438`. M: 2 round-trips per record `:277,410-427`; `syncLatest` = full refetch `:463-481`. Hardcoded UA/URL/timings `:37-52`. SQL parameterized ✓. |
| scrapers/bogDailyFxScraper.ts | 172 | LIVE (bog-fx-daily weekdays) | **H: bot UA `:57` is the exact UA bogScraper documents as Cloudflare-blocked** — settlement FX source plausibly silently dead; bypasses syncService → failures never sync-logged `:102-104`. M: no retry `:53`; `rejectUnauthorized:false` `:46`. |
| scrapers/bogChartsPdfService.ts | 303 | LIVE (analyticsScheduler monthly) | M: `refresh()` never throws and caller ignores return (`analyticsScheduler.ts:68`) → silent degradation. L: 300KB PDF heuristic `:137`; duplicated browser UA `:42`; `rejectUnauthorized:false` `:88`. |
| scrapers/bookingScraper.ts | 78 | **DEAD (high conf)** | Zero references. `scrapeNeighborhood` only calls `mockScrape` (2 hardcoded fake listings `:52-75`); save commented out; unused import. Delete. |
| scrapers/dataValidator.ts | 280 | LIVE (bog/wdi/fx) | Clean. L: 50% change threshold `:129`, score weights `:222-227` hardcoded; `detectAnomalies`/`calculateQualityScore` appear uncalled. |
| scrapers/fxFeedService.ts | 929 | LIVE (heavily, app-wide) | **H: Yahoo historical stamped `source:'Bank of Ghana', is_official:true` `:769-772,786-794,848-851`** — poisons the official-rate query (see P0-#3). M: sticky unhealthy source flags never retried `:388-399`. L: jsdelivr CDN URL hardcoded twice `:305,612`; stale `'fallback_static'` in config (`types.ts:192`); backfill = 1 GET per day×currency `:606-641`. |
| scrapers/gredaScraper.ts | 525 | LIVE (greda-sync weekly) | M: probes guessed paths on `grfreda.org` (typo-looking domain `:61`) + brri.gov.gh — all 404s debug-logged `:233`; 0-row scrape reports 'success' because derived-recalc rows count `:453-472`. M: duplicate recalc with 3 PM job. Bulk save ✓ retry ✓. |
| scrapers/localMaterialScraper.ts | 471 | LIVE (material-price-sync weekly) | **H: append-only per-row INSERT, no ON CONFLICT `:346-385`** — ~1,000 rows/run, ×catch-up-bug restarts. M: 4/5 regional rows fabricated (Accra × factor `:87-93`) but stored `source_type:'scraped'`. L: naive CSV split `:246`; page-1-only per category `:151`. AbortSignal timeout ✓. |
| scrapers/npaScraper.ts | 401 | LIVE (npa-fuel-sync weekly) | M: "any number >1 in any cell" parse `:113-123` + 5–50 GHS bound `:123,226` (inflation time-bomb, silently drops). L: status 'success' even if all saves failed `:326`; misnamed (primary = globalpetrolprices.com `:44`). Upsert ✓ retry ✓. |
| scrapers/syncLogRepository.ts | 259 | LIVE (core) | M: `INTERVAL '${days} days'` `:244` (route-supplied number — use make_interval). M: if completeSync throws, row stuck 'running' forever (no reaper). L: only errors[0] persisted `:58,80`; fallback path swallows original error `:30-39,62-84`. |
| scrapers/syncService.ts | 900 | LIVE (orchestrator) | M-dup: 7 near-identical ~60-line sync wrappers (`:150-642`) — a generic runSync() deletes ~350 LOC. M: healthCheck hardcodes `true` for 5 sources `:885-896`; in-process mutex only `:105,143-145`; ALREADY_RUNNING returned as 'failed'. L: getStatus omits Slice-3/4 sources `:755-771`. Source-name constants here are half of the catch-up bug. |
| scrapers/types.ts | 341 | LIVE | Natural seed for the config module (BOG_INDICATOR_MAPPING `:52-78`, WDI_INDICATORS `:92-142`, VALIDATION_RULES `:231-304`). L: stale `'fallback_static'` `:192`. |
| scrapers/index.ts | 35 | LIVE (stale barrel) | Missing bogDailyFxScraper, bogChartsPdfService, all GSS services. |
| scrapers/wdiClient.ts | 487 | LIVE (wdi-sync quarterly) | H: all-fetch-failure → 'success' 0 records `:369-376,440-447`. M: ~175 rows × 2 queries row-by-row `:339-368`. L: getPreviousValue mixes sources `:241-247`. Retry+429 ✓, pagination ✓, 24h Redis cache ✓. |
| schedulers/economicDataScheduler.ts | 1,352 | LIVE (boot `index.ts:943`) | See SCHEDULER MAP risks 1–9. Good: all 20+ crons env-overridable `:105-144`. Bad: index fallback constants hardcoded; GSS wrappers swallow errors `:993-1143`; CPI read from `exchange_rates_historical` `:1335`. |
| schedulers/dataSourceScheduler.ts | 338 | **DEAD (high conf)** | Never started; zero imports (not exported by schedulers/index.ts:7-11; singleton `:339` unconsumed — coordinator-verified). If revived: no in-flight dedup `:118-154`, hardcoded tier delays `:209-236`. |
| schedulers/index.ts | 11 | LIVE | Exports economicDataScheduler only (confirms above). |
| monitoring/economicDataMonitoringService.ts | 575 | LIVE endpoints, **DEAD alerting** | M: `sendAlertNotifications` zero callers; email/Slack TODO stubs `:560-570`; no cron ever calls monitoring. M: source-health covers only BoG/WDI/ForexRate `:313` — GSS/NPA/materials invisible. M: acknowledgeAlert writes a cache getActiveAlerts never reads `:529-544` — no-op. L: `MAX(synced_at) FROM ${tableName}` `:227` (internal list only). |
| monitoring/index.ts | 19 | LIVE | Barrel, fine. |
| economicDataService.ts | 804 | LIVE (FX resolution + routes) | H: `getExchangeRateForDate` `:417-443` saves mislabeled Yahoo rows (P0-#3 entry point). M: `seedInitialData` `:716-801` hardcodes 2024 rates as 'Bank of Ghana' and is POST-exposed (`routes/dataHub.ts:1292`). L: `updateExchangeRates` `:499` dead + would violate unique constraint. |

### ETL layer + jobs + ingestion

| File | LOC | Verdict | Key findings |
|---|---|---|---|
| etl/orchestrator.ts | 699 | **DEAD (zero callers)** | M: own `new Pool(DATABASE_URL)` `:108`; job-history writes swallowed + `etl_job_history` has no migration `:651-690`; stage 4 calls a non-existent SQL function (would always fail at 90%). |
| etl/index.ts | 231 | **DEAD** (2nd, competing orchestrator) | H-if-run: `getStats()` → `processAll({batchSize:0})` `:215` = **infinite loop** (`offset+=0`). `processProperty` `:131-136` routes into the broken legacy dedup SQL. |
| etl/deduplication.ts | 1,378 | DEAD except via dead orchestrator | H-if-run: OFFSET pagination while auto-merge mutates the WHERE-set `:970-1048` → skipped rows; "dry run" still performs real provenance writes outside the transaction `:744-777`. M: legacy path queries non-existent columns (`source`,`price_usd`,`location`) `:177-197,249-313`; writes `property_id/canonical_property_id` vs mig 007's `property_id_1/2` `:463-475`; hardcoded trust map `:580-597`. Candidate pre-filter is O(n·100), not O(n²) `:1106-1178` ✓. |
| etl/conflictResolution.ts | 793 | DEAD (via orchestrator only) | M: own Pool `:148`; unnormalized scraped strings into typed columns `:666-710` (whitelist-mapped, no injection); resolution+history not transactional `:706-732`. Strategy logic itself sound. |
| etl/multiSourceTracking.ts | 813 | DEAD (via orchestrator) | H-if-run: `jsonb_object_keys_count()` `:776` doesn't exist in Postgres → guaranteed error. M: staleDays interpolated interval `:735`; unbounded never-invalidated cache `:113`; 23 sequential COUNTs `:785-792`. trackSourceContribution/mergePropertySources properly transactional ✓. Duplicated by the LIVE Python `multi_source_tracker.py`. |
| etl/qualityScoring.ts | 461 | SEMI-LIVE (dataInsightsService imports it) | H: queries `p.location::geometry`/`p.images` `:94-171` — schema-mismatch suspect vs `latitude/longitude` + `image_urls` (verify before trusting metrics). M: full-table OFFSET scan, 2 UPDATEs/row `:143-222`. L: PRICE_RANGES compare `price_usd` (may not exist) `:298`. |
| etl/dataEnrichment.ts | 578 | **DEAD** (via dead ETLPipeline) | H-if-run: UPDATEs non-existent columns (`city`,`region`,`street`,`listing_type`) + enum-invalid property_type values `:469-487,552-565`. **M: hardcoded FX 12.5 `:373`**; stale NEIGHBORHOOD_PRICES `:52-75`; `property_enrichment_log` has no migration `:568-573`. |
| etl/addressStandardization.ts | 540 | LIVE-ish (pure functions) | Fine. M-consistency: 3rd parallel Ghana-geo implementation (with propertyStorage + Python ghana_location.py). |
| etl/propertyStorage.ts | 625 | **DEAD (zero callers)** — Python pipelines.py is the real writer | If revived: M: SELECT-then-INSERT per record (race) `:339-534`; inline reverse-geocode HTTP per property in the loop `:378-390`; `normalizeRegion` maps to legacy-5 regions `:181-227` (16-region partition mismatch); sequential `storeProperties` `:606-621`. Parameterized ✓. |
| etlJobProcessor.ts | 421 | **DEAD (never started)** | **H: all non-scrape handlers are simulations — Math.random() counts + hardcoded 50/100/200/75 "processed" written to etl_jobs as real completions `:288-390`.** Delete or implement. |
| etlJobService.ts | 570 | LIVE (scheduler + routes) | Solid: parameterized, sort whitelist `:64-66`, guarded transitions `:190-207`. M: complete() sets 100% whenever processed>0 `:231-233`. L: fail() error_log read-modify-write race `:288-306`; cleanup() keys on created_at `:553-558`. |
| jobQueue.ts | 1,018 | LIVE-but-STUB (P0-#4) | **H: stub `addJob` silently drops jobs, returns fake job `:328-336`; worker script undeployed.** H: `processDataIngestion` Math.random simulation `:405-431`. M: `processMarketSnapshot` SQL broken (`DATE_TRUNC($3)+INTERVAL '1'||$3` `:758`); `processDeduplication` uses legacy columns + conflicting dup schema `:507-558`; 10k single-row INSERT loop `:664-695`. Bull framework config itself fine (retry/backoff/stalled detection `:127-193`). |
| scrapyScheduler.ts | 681 | LIVE (boot `index.ts:937`) | Best-engineered file in the domain (preflight `:363`, reaper `:582`, degradation alerts `:608`, fetch timeouts). H: default spider list includes unreachable `ownkey` + stub `tonaton` `:68-77` (P0-#5). M: hourly retry bypasses `runningSpiders`/concurrency `:546-561` → same spider can run concurrently with a scheduled run; records-count heuristic `updated_at>=started_at` `:439-445` inflatable. L: hardcoded worker URL `:81`, 4h/30s constants. |
| spiderManagementService.ts | 126 | LIVE (routes/dataHub.ts:2463-2473) | M: `startSpider` for generic sources only flips a status flag (nothing starts) `:92-98`; `stopSpider` is a success-returning no-op `:106-111`. Manages *economic* scrapers, not the Scrapy fleet — misleading admin UI naming. |
| ingestionService.ts | 64 | LIVE-but-broken | H: queues to non-existent `'property-process'` queue `:41-42` — dropped in stub mode, no processor in worker mode; every ingestRawProperty dead-ends. |
| ingestion/nadmoIngestion.ts | 125 | LIVE (routes/floodRisk.ts:151) | OK (backpressure, per-row errors). M: rows without coordinates hard-rejected `:86-94` (geocode TODO) — real-world yield poor. L: unawaited `refreshRiskScores()` rejection risk `:62-68`. |
| ingestionSubmissionService.ts | 493 | LIVE (routes/ingestion.ts) | **H: checksum verification is theater — never reads the object, regex-checks hex format, logs "passed" `:344-374`. H: validation simulated — sleep(1s), everything `accepted` at quality 0.95, nothing transitions to processing `:379-403`.** M: idempotency_key accepted, never checked `:118-131`. |
| fileUploadService.ts | 652 | LIVE | M: non-minio `file_path` used as raw local path `:82-85` — arbitrary-file-read if any route passes user input (verify server-side construction). M: whole-file in-memory parse, no size cap `:169-223` (XLSX OOM risk). L: staging table 2-value whitelist ✓ `:373-375`; conflict-skipped rows counted as staged `:381-402`. |

### Root services

| File | LOC | Verdict | Key findings |
|---|---|---|---|
| addressValidationService.ts | 530 | LIVE (PM location services) | GOOD: batches of 10 Promise.all `:348-379`. L: 3rd GHANA_BOUNDS + own haversine `:62,483`. |
| analyticsService.ts | 383 | LIVE (routes/dataHub.ts:2380) | L: interval/step interpolated from closed switch `:146-224` (safe, fragile); every method swallows errors → `[]` (dashboard "no data" masking — the exact ML-pages lesson); unbounded uncached GROUP BYs per load. |
| anonymizationService.ts | 517 | LIVE (via apiPull pipeline) | **H: hardcoded salt + unsalted-per-record SHA-256 of low-entropy PII `:69,225-233`; H: no-rules → raw pass-through `:96-112`** (P1-#11). M: throwing records silently dropped `:161-167`. L: 6-district/10-old-region lists `:264-292`. |
| apiPullIntegrationService.ts | 673 | SUSPECT (route-only; cron path dead — `initializeScheduler` never called) | **H: SSRF `:256-264,386-395` (P0-#1). H: invalid-Postgres UPDATE…ORDER BY…LIMIT `:462-468`. H: fake-success batch fallback `:352-380`.** M: fetched data never actually persisted `:299-323`; per-endpoint cron no overlap guard + competes with apiPullSchedulerService `:85-117`. |
| apiPullSchedulerService.ts | 708 | SUSPECT (route-imported; `initialize()` never called at boot) | M: `updateNextRunTime` = NOW()+1h regardless of cron `:459-478` (status UI lies); wrong running-average math `:430-453`; setTimeout retry recursion, lost on restart `:380-391`; health-check frees slots without cancelling work `:556-579`. L: 5-min setInterval never cleared `:71`. |
| baseCostCalculationService.ts | 887 | LIVE (Mon 1 PM cron + constructionCost) | **H-suspect: queries `material_prices.category/effective_date` + `labor_rates.category` `:560-567,603-610` while constructionCostService uses `material_category/survey_date` — if mismatched, recalc throws and valuations silently run on hardcoded matrices** (P2-#17). M: 192 sequential upserts, no transaction `:735-778`; `quantity*price*(1+weight)` surcharge math `:499-507`. L: ~250 lines hardcoded QS matrices `:81-352` — should follow the mig-251-256 DB-config pattern. |
| constructionCostService.ts | 1,649 | LIVE (heavily: valuations, projects, PM budget) | M→H: unit-mixing "index" math `:1032-1075` + `avgRate/150` labor base `:1074` can arbitrarily scale `estimateConstructionCost` `:902` when the index table is empty. M: N+1 — one LATERAL query per material category sequential `:1044-1057`. L: DB-first fallback matrices silently activate on any DB error at confidence 0.5-0.6 `:258-311,1214-1241`; `:1191-1252` duplicates DRC logic now owned by the Python engine (retire); 19-value RegionCode `:66-85` (3rd variant). |
| contributionService.ts | 861 | LIVE (contributionProcessorJob + routes) | M: processPendingContributions ~4 queries × row sequential `:533-557`. L: dup-check TOCTOU `:134-144` (add unique index); approve/reject/spendCredits transactional ✓; sort allowlisted ✓. |
| credentialsService.ts | 409 | LIVE (via partnerApiClient) | **H: rotation keyId mismatch `:243` vs `:129` + `encryption_key_id` never updated → rotation bricks credentials** (P1-#10a). GOOD: AES-256-GCM, PBKDF2-100k, required env secret `:67`, parameterized. |
| dataCatalogService.ts | 150 | LIVE (routes/dataHub.ts:2483) | L: every source presented as the `properties` schema; entryId param ignored `:64-110`. Cosmetic. |
| dataInsightsService.ts | 119 | LIVE (routes/dataHub.ts) | M: `getPredictions` returns **hardcoded fabricated forecasts** `:96-116`; canned "Coverage Gap" insight `:75-87`. L: unused qualityScoringService import `:4`. |
| dataLineageService.ts | 103 | LIVE (routes/dataHub.ts) | M: lineage graph is a **static hardcoded fiction** `:43-74`; getAuditLog real. |
| dataQualityService.ts | 500 | LIVE (routes/dataHub.ts) | GOOD: bulk single-SQL scoring `:83-169` — the pattern the domain should copy. L: per-type completeness uncached `:474-482`. |
| dataSourceService.ts | 357 | LIVE (broad) | GOOD: allowlisted sorts `:59-61`. L: tier map duplicated with analyticsService and already drifted (missing tier3c/api_import) `:329-337`. |
| economicDataService.ts | 804 | (covered above) | — |
| geocodingService.ts | 692 | LIVE (marketplace, narratives, PM) | M: all external fetches have **no timeout/AbortController** `:208,288,465,637`; searchNearbyPlaces = up to 10 sequential uncached Places calls `:602-676`. L: legacy 5-cluster REGION_CENTERS `:21-27`; sequential geocodeBatch `:408-420`. GOOD: SHA-256 cache w/ confidence TTL `:159`. |
| ghanaPostGeocodingService.ts | 1,081 | LIVE (8 importers) | M: "mathematical grid decoder" `:567-633` **fabricates coordinates** at confidence 0.75 when APIs fail — invented coords flow into properties with credible scores. M: hard dependency on third-party `ghanapostgps.sperixlabs.org` `:50`. L: 230-line hardcoded gazetteer `:97-325`; GHANA_BOUNDS differs from geocodingService's. Timeouts ✓ Redis 30d ✓. |
| gssIncomeService.ts | 543 | (covered in GSS family) | — |
| index.ts | 106 | LIVE (barrel; 2 importers) | L: re-exports dead mlDataHubIntegrationService `:106`; barrel neither complete nor authoritative. |
| mlIntegrationService.ts | 468 | **DEAD (high conf)** | Export-only; zero call sites; targets the down ML microservice; every table guarded by 42P01 warnings `:87-93`; defunct `brong_ahafo` region `:333-336`. |
| partnerApiClient.ts | 593 | LIVE (via apiPull) | M: OAuth token POST — stored URL, **no timeout** `:167-176` (SSRF adjunct, secret exfiltration). M: extractTotalCount precedence bug `:557-562` (cosmetic). L: interceptor sleeps up to 60s `:340-351`. GOOD: 30s default timeout `:80`, exp backoff `:407-448`, mTLS verify ON `:256`. |
| performanceService.ts | 225 | LIVE (routes/dataHub.ts:2429) | L: "API Uptime SLA" fabricated from process.uptime() `:154-157`. Rest real. |
| propertyEnrichmentService.ts | 941 | LIVE (routes/publicProperties.ts) | **H: `:941` overrides working PostGIS comparables with known-broken OpenSearch version; H: hardcoded FX 12 `:233-234`** (P1-#12). M: per-view reverse-geocode fan-out on a public endpoint `:302-435`; dead response fields (pois always empty `:281-285`, market_context nulls). L: leftover AI-prompt comments in prod `:169-181`; PG comparables selects `p.currency` vs `price_currency` elsewhere `:451` — verify before un-breaking. |
| scheduledGeocodingService.ts | 242 | **DEAD (high conf; zero importers)** | If revived: H — no failure tracking; same 50 newest un-geocodable rows retried every 5 min forever `:95-109`, quota burn. Has a proper isRunning guard `:71`. |
| serviceHooks.ts | 81 | LIVE (8 importers, PM/CRM/valuations) | L: bypasses contributionService.create (no dedup hash/trust score) — second write path to one table; swallow-by-design acceptable for hooks. |
| specializedCostService.ts | 676 | LIVE (dataHub routes, greda, scheduler) | M: legacy 5-region RegionCode `:38,203` while base costs exist for 16 — derived specialized costs cover 5 regions only; enum casts reject new codes. L: 280-combo sequential upsert `:418-505`; bare `catch {}` on audit log `:536-538`; dead `qualityAdj` var `:443`. |
| systemHealthService.ts | 166 | LIVE (routes + monitoring barrel) | M: `execSync('df -k /')` per health request `:143` — event-loop block. L: uptime hardcoded 99.9 `:79`. |
| systemSettingsService.ts | 128 | LIVE (routes/dataHub.ts) | L: set() check-then-insert race `:66-83` (updateBatch already uses ON CONFLICT — reuse). |
| types.ts | 527 | LIVE | M: `RegionCode` legacy-5 `:79-84` vs 16-region partitioned DB (P2-#16). |

### Scrapy pipeline (Python, own source) + Airflow

| File | LOC | Verdict | Key findings |
|---|---|---|---|
| pipelines/scrapy/api_server.py | 264 | LIVE (the worker scrapyScheduler calls) | **H: no auth, 0.0.0.0:5000, no concurrent-run cap `:100-141,264`** (P0-#2). **H: `AVAILABLE_SPIDERS` `:54-57` omits `ownkey`** (P0-#5). M: in-memory `_jobs` `:47` — restart orphans the Node poll loop for up to 4h. L: stdout only drained post-exit (64KB pipe deadlock risk for chatty spiders). Injection mitigated (whitelist + list-args + int casts) ✓. |
| pipelines/scrapy/propmetrik_scrapers/pipelines.py | 1,247 | LIVE (the real property writer) | SQL fully parameterized ✓ (`:596,640,813`); SAVEPOINT-isolated tracking ✓ `:835-848`. M: per-item SELECT→UPDATE/INSERT + commit per listing `:853` (ON CONFLICT + periodic commit ≈3× fewer round-trips). M: tier/trust maps duplicated with 2 TS copies. |
| .../spiders/base.py | 353 | LIVE (shared base) | Healthy — genuinely shared price/bedroom/area/amenity extraction, address parsing, errback `:122-350`. No copy-pasted helpers across spiders (verified). |
| .../spiders/meqasa.py | 557 | LIVE (scheduled + whitelisted) | Site-specific selectors/pagination only — correct split. |
| .../spiders/gpc.py | 362 | LIVE | Same. |
| .../spiders/housemaster.py | 491 | LIVE | Same. |
| .../spiders/realtor_international.py | 949 | LIVE (as `realtor`) | Same; largest spider. |
| .../spiders/airbnb_ghana.py | 580 | LIVE | Plain scrapy.Spider (not BasePropertySpider); needs Selenium middleware — lazy-optional import; load-error risk if selenium absent. |
| .../spiders/daily_graphic_legal.py | 253 | LIVE (litigation data) | Plain scrapy.Spider; writes litigation_risk_data via pipelines.py `:596`. |
| .../spiders/ownkey.py | 180 | **UNREACHABLE** | Scheduled but not whitelisted → every dispatch HTTP 400 (P0-#5). |
| .../spiders/tonaton.py | 41 | **DEAD STUB, still scheduled** | `start_requests` returns immediately `:32-35`; fake "completed" jobs. |
| .../spiders/__init__.py | — | LIVE | — |
| .../middlewares.py (root) | 310 | **DEAD (shadowed)** | Package dir `middlewares/` wins module resolution; root file (incl. RedisDupeFilter/RetryWithProxy/RateLimit `:180,256,278`) referenced only by commented-out `DUPEFILTER_CLASS` (settings.py:205). Edits to it do nothing — delete/merge. |
| .../middlewares/__init__.py + basic (84) + rotation (81) + selenium (173) | 338 | LIVE | The real middlewares; selenium import optional-lazy ✓. |
| .../settings.py | 231 | LIVE | Hardcoded Chrome UA `:26` + rotation list `:178`; RETRY_TIMES=3, CONCURRENT=8, DELAY=2 `:116-118`; secrets via env ✓; ROBOTSTXT_OBEY=True ✓. |
| .../items.py | 431 | LIVE | Item schemas. |
| .../critical_data_items.py | 491 | LIVE | Litigation/critical item schemas. |
| .../multi_source_tracker.py | 474 | LIVE | The live provenance tracker (TS twin is dead). |
| .../extensions/etl_tracker.py | 414 | LIVE | ETL-job progress reporting to backend. |
| .../utils/ghana_location.py | 548 | LIVE | 3rd Ghana-geo implementation (M consistency). |
| .../utils/__init__.py, extensions/__init__.py, propmetrik_scrapers/__init__.py | — | LIVE | — |
| pipelines/scrapy/run_spider.py | 231 | LIVE (subprocess entry) | 3rd copy of the spider list (drift already live via ownkey) — single-source it. |
| pipelines/scrapy/retry_failed.py | 127 | LIVE (ops CLI) | Fine as operator tool. |
| pipelines/scrapy/query_db.py | 89 | LIVE (ops CLI) | Fine. |
| pipelines/airflow/dags/cap_rate_benchmark_refresh_dag.py | 388 | **DEAD (high conf)** | No Airflow deployment artifacts anywhere in the repo; nothing references it; cap-rate refresh lives in Node CapRateService. |

---

## COVERAGE LEDGER

Method: 4 parallel deep-audit passes (A: GSS family · B: scrapers/schedulers/monitoring · C: ETL/jobs/scrapy · D: root services), each reading its files fully, plus coordinator cross-verification of boot wiring (`backend/src/index.ts:931-955`), dead-code greps (dataSourceScheduler, bookingScraper, etlJobProcessor, ingestionService, scheduledGeocodingService, microservice wrappers, barrel consumers), gssPhcShared usage map, scheduler cron extraction, api_server `/run` handler, pipelines.py parameterization, middlewares shadowing, and credentials key derivation.

| Group | Files | Depth |
|---|---|---|
| GSS family (11 scrapers/gss* + gssIncomeService + 4 microservice wrappers) | 16 | Full read (A) + coordinator re-verification of scaffold blocks & wrapper liveness |
| Non-GSS scrapers, syncService, syncLogRepository, types, index, wdiClient (scrapers/) | 14 | Full read (B) + coordinator re-verification (URLs/UA/booking stub) |
| schedulers/ (economicData, dataSource, index) + monitoring/ (2) + economicDataService | 6 | Full read (B) + coordinator cron/mutex/boot-wiring verification |
| etl/ (9) + etlJobProcessor + etlJobService + jobQueue + scrapyScheduler + spiderManagementService + ingestion trio + fileUploadService | 18 | Full read (C) + coordinator verification (propertyStorage loop, jobQueue stub, orchestrator callers) |
| Root services (addressValidation … types, index) | 27 | Full read (D) + coordinator verification (SSRF surface, credentials, cost-trio callers) |
| **TS total** | **81 / 81** | **100% covered** |
| Scrapy python: api_server, pipelines, settings, middlewares (root+package), tonaton, base, run_spider, multi_source_tracker | 12 | Full/near-full read (C + coordinator) |
| Scrapy python: remaining spiders (meqasa, gpc, housemaster, realtor, airbnb, daily_graphic, ownkey), items, critical_data_items, etl_tracker, ghana_location, retry_failed, query_db, __init__ files, airflow DAG | 18 | Structural pass (per brief: liveness, shared-logic split, SQL surface) |
| **PY total** | **30 / 30** | **100% covered (12 deep, 18 structural)** |

Caveats: (1) `baseCostCalculationService` column-name mismatch (P2-#17) and `etl/qualityScoring` `p.images` mismatch are flagged as high-confidence suspects — confirm against live migrations before acting. (2) Python spiders' individual selectors were not line-audited (structural pass per scope). (3) No source files were modified; this document is the only artifact written.
