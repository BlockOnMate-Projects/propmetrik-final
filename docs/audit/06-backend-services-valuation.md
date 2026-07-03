# Audit 06 — Backend Services: Valuation Engine (TypeScript + Python)

**Date:** 2026-07-02 · **Auditor:** Staff-engineer file-by-file audit (read-only)
**Scope root:** `backend/src/services/valuation-engine/`

---

## 1. Scope, Counts, LOC

| Layer | Files | LOC | Notes |
|---|---|---|---|
| TypeScript services (`valuation-engine/*.ts` + `geometry/`) | **36** | **26,758** | 27 top-level + 9 geometry |
| Python engine (`python/` excl. `.venv`, `__pycache__`) | **48** | **18,275** | `app/` package 16,822 · `tests/` 1,255 · top-level scripts 198 |
| — of which `app/methods/` (current engine) | 13 | 3,780 | per-method modules + `_shared.py` |
| — of which `app/services/` (mixed live/dead) | 14 | 9,687 | ~3,700 LOC confirmed-orphaned (see §3-F3) |
| **Total in scope** | **84** | **45,033** | |

`app/_archive_legacy/` (expected per project memory) **no longer exists on disk** — previously archived duplicates were deleted. Residual legacy now lives un-archived inside `app/services/` instead (§3-F3).

Boundary context (characterized, not line-audited): `backend/src/routes/valuations.ts` (7,121 LOC) hosts the per-method `/value` runners; `frontend/src/lib/valuation-api.ts` calls the Python engine **directly from the browser**.

## 2. Domain Scores (1–10, higher = healthier)

| Dimension | Score | One-line justification |
|---|---|---|
| Security | **3** | Python engine: zero auth, CORS `*` + credentials, `0.0.0.0:8001`, `/docs` open, browser calls it directly |
| Performance | **4** | Sequential per-method Python hops; un-pooled LibreOffice subprocess per PDF; N+1s; per-request aiohttp sessions |
| Duplication | **3** | 3 conflicting method-weight tables, 4 DOCX paths, 3 building-code copies, 2 data adapters, 3 Python schema layers |
| Hardcoded config | **4** | Migs 251–256 fixed method *inputs*, but engine-side constants remain (75k/40k GHS bedroom/bathroom, cap-rate tables, static market conditions) |
| Dead code | **4** | ~4,300 LOC orphaned (5 Python services + drc_method + ml client + onlyofficeService) |
| Correctness | **5** | Float `Math.round`/banker's-`round()` on money; stale 5-region taxonomy vs mig-241's 16 regions; unchecked `parseFloat` |
| Structure (god files) | **4** | 9 files >800 LOC; `orgSettingsService.ts` is 4 services in 1 |
| **Overall** | **4/10** | Calculation logic itself is defensible; the seams (auth, weights, region model, dead legacy) are the risk |

---

## 3. TOP FINDINGS (by priority)

### P0 — must fix

**F1. Python engine is an unauthenticated, internet-shaped service that the browser calls directly.**
- No auth dependency on ANY endpoint; FastAPI app registers routers with no middleware guard (`python/app/main.py:147-168, 387-425`).
- CORS `allow_origins=[..., "*"]` **with** `allow_credentials=True` (`main.py:157-168`) — the wildcard nullifies the origin list.
- Binds `0.0.0.0:8001` by default (`main.py:442`, `config.py:42`, `Dockerfile` CMD); `/docs` + `/redoc` exposed (`main.py:151-152`); default `secret_key="dev-secret-key-change-in-production"` (`config.py:54`).
- The frontend ships `NEXT_PUBLIC_PYTHON_API_URL` and calls the engine from the browser (`frontend/src/lib/valuation-api.ts:31, 2138, 3347`) — this is *why* the CORS wildcard exists. Anyone reaching the host can run valuations, hit the DB-backed land-comparable search, and enumerate the API schema.
- `pythonClient.ts:346-353` sends no auth header, so adding auth is a two-sided change.
- **Fix:** put the engine behind the TS backend only (remove browser-direct path; proxy `/api/valuation-engine/*`), add `x-api-key`/HMAC dependency in a FastAPI `Depends`, drop `"*"` from CORS, disable docs when `is_production()`, bind `127.0.0.1`/docker-network only.

**F2. Method-weight truth exists in three conflicting places.**
- TS `valuationEngineService.ts:85-92` — sales 0.40 / cost 0.25 / income 0.25 / residual 0.10 (+ per-type table at `getMethodWeight`, ~:585).
- Python `config.py:93-100` — sales 0.60 / cost 0.40 / income 0.30 / residual 0.50 / profits 0.40 / drc 0.35.
- Python `methods/multi_method.py:87-97` (hybrid) and `:205-209` (reconciliation per property type) — a third and fourth set; none read `config.py` or the DB.
- Reconciled value in a regulated report depends on *which code path ran*. **Fix:** one DB-config source (extend migs 251–256), passed in the request; delete the other tables.

**F3. ~4,300 LOC of dead code shipped inside the production engine (High confidence).**
- Python `app/services/`: `reconciliation.py` (586), `sensitivity_analysis.py` (572), `confidence_scoring.py` (546), `comparable_basket.py` (468), `market_data.py` (700, fully mocked data), `drc_method.py` (727), `ml_serving_client.py` (417) — **zero importers** (verified by grep across `app/`; the live `/sensitivity` endpoint is self-contained in `methods/multi_method.py:262`). ≈ 4,016 LOC.
- TS `onlyofficeService.ts` (446 LOC) — zero importers anywhere in `backend/src` (verified), plus a hardcoded fallback JWT secret `'propmetrik_onlyoffice_secret'` (`onlyofficeService.ts:20-30`).
- `main.py:314-364 _calculate_adjustments()` defined, never called (own hardcoded regional multipliers at :352-358).
- `simple_start.py` (mock server) + `debug_land_value_request.py` (hardcoded prod IDs :18-19) are git-tracked and `Dockerfile` `COPY . .` puts them (and stray `uvicorn*.log`) in the image.
- **Fix:** delete (git history is the archive); add `.dockerignore`.

**F4. Report-generation pipeline blocks and serializes.**
- `pdfGenerationService.ts:130` spawns a LibreOffice subprocess per request, 60s timeout, no queue/pool — N concurrent reports = N soffice processes.
- `docGenerationService.ts:~796` fetches floor-plan images sequentially via axios (30s timeout each; 10 images ⇒ up to 300s). Same sequential-download pattern in `valuationDocumentService.ts:115-152` for photo buffers.
- `reportTemplateService.ts:256-573 collectReportData()` chains ~8 sequential awaited DB queries (contrast: `reportDataService.ts:189-211` correctly uses `Promise.all`).
- `htmlToDocx.ts:52` re-runs `cheerio.load()` per TipTap section per generation.
- **Fix:** `Promise.all` the image fetches and data collection; a 1–2-worker subprocess queue for LibreOffice; parse editor HTML once.

### P1 — high

**F5. Remaining hardcoded financial parameters post-migrations 251–256** (the migrations moved *inputs* to DB config; these engine-side constants bypass that audit trail):
- Python `methods/sales_comparison.py:173` `bedroom_value = 75000` GHS, `:180` `bathroom_value = 40000` GHS, `:228` `annual_appreciation = 9.0`%/yr, `:204-216` premium/standard area lists ±15%, `:191-198` evidence-type discounts — **not overridable via request**.
- Python `methods/market_conditions.py:37-78` — entire regional market-conditions endpoint returns static hardcoded data (DOM, price trend, yields).
- Python `methods/drc.py:320-327` age-band depreciation caps; `:264-266` construction-type inference; `methods/income.py:65` 5% vacancy default; `methods/residual.py:110` 15% min-profit default; `methods/depreciation.py:237` `cost_per_sqm = 8500` RCN fallback.
- Python legacy tables still reachable via live imports: `services/depreciation.py:461-509` economic-life/condition tables, `:1350-1368` regional environmental risk; `services/land_comparable_sales.py:57-203` appreciation/zoning/tenure/scoring tables; `services/residual_method.py:35-181` region sale-price + cost + fees + 25% finance tables.
- TS: `CapRateService.ts:235-253` cap-rate fallback table, `:492-509` 8% vacancy / 35% expense / 15 GHS-sqm rent, `:1029-1038` expense ratios; `valuationEngineService.ts:530-577` macro fallbacks (inflation 0.12, policy 0.27, mortgage 0.32); `valuationEngineService.ts:199-209` fabricated confidence inputs (completeness 0.85, volatility 0.1); `valuationInvoiceService.ts:131-172` MWH man-day rates + 0.5% platform fee, `:194-210` tax brackets; `hbuAnalysisService.ts:147-167` + `contributionWorkflowService.ts:147-174` thresholds/credits/multipliers.
- **Fix:** extend the mig-251–256 pattern: engine strict-fails when the value isn't in the request; TS sources from DB config.

**F6. Stale 5-region taxonomy in the Python engine vs the 16-region production DB (mig 241).**
- `config.py:84-90, 196-232` and `methods/_shared.py:68-87` normalize everything into {greater_accra, kumasi_metro, eastern, western_cluster, northern_cluster}; unknown regions **silently default to `greater_accra`** (`_shared.py:87`) — a Northern-region property can silently get the 1.30 Accra multiplier. `data_hub_api_adapter.py:420-464` keeps its own separate mapping.
- **Fix:** single region map sourced from the DB's 16 canonical regions; warn/fail on unknown instead of defaulting.

**F7. TS↔Python boundary duplication & contract fragility** — see §4. Highlights: 5 hand-rolled `fetch(pythonBase…)` call sites in `routes/valuations.ts` (1125, 2797, 2942, 3115, 3280) bypassing `pythonClient`; copy-pasted property/region/config sourcing per runner (rental 2719-2769, drc 2859-2878, profits 3019-3038, residual 3199-3225); `pythonClient.toMarketConditions()` **fabricates** `supply_demand_ratio` (1.2/0.8/1.0), `price_index: 100`, and annualizes 6-month change by ×2 (`pythonClient.ts:634-651`).

**F8. Money-math / rounding policy is inconsistent across the boundary.**
- TS: `Math.round` on GHS (`valuationEngineService.ts:705, 752`; `reportDataService.ts:369, 396`); `Number(x.toFixed(2))` (`valuationInvoiceService.ts:226`); unchecked `parseFloat` on rates (`valuationInvoiceService.ts:464`, `CapRateService.ts:528`, `valuationEngineService.ts:302-304` NaN-prone lat/lng).
- Python: float + `round()` (banker's rounding) throughout methods; `Decimal` imported in `main.py:33` but never used. No shared rounding spec exists.
- **Fix:** documented policy (round-half-up at presentation only; integers/pesewas internally), shared validation on every numeric crossing.

**F9. User HTML flows into DOCX unsanitized.** TipTap editor HTML from `valuation_reports.content->'sections'` → `htmlToDocx.ts:47-62` (`cheerio.load`, no sanitizer) → `professionalDocxBuilder.ts:936-1050` interpolation. Malformed/hostile markup can corrupt the sealed report. **Fix:** `sanitize-html` allowlist at write time.

### P2 — moderate

- **F10. Four overlapping DOCX paths:** docxtemplater legacy (`docGenerationService.ts:388-576`), programmatic builder (`professionalDocxBuilder.ts`), TipTap adapter (`htmlToDocx.ts`), dead OnlyOffice callback path. Path chosen by template name (`docGenerationService.ts:340-342`); same report can render differently.
- **F11. Two Python data adapters for the same market data** — `data_hub_adapter.py` (direct PostgreSQL, 770 LOC) vs `data_hub_api_adapter.py` (HTTP to TS backend, 484 LOC), no routing policy; land value uses one, DRC/residual costs the other. Plus `data_hub_api_adapter.py:45-67` effectively creates a new `aiohttp.ClientSession` per request (no connection reuse), and `data_hub_adapter.py:454-475` does regex land-size extraction over title/description per row inside a ~120-line SQL query.
- **F12. Three Python schema layers** (`schemas_extended.py` 523 vs `schemas/` 1,399 vs `models/schemas.py` 135) with duplicate `PropertyLocation`/`PropertyCondition` enums whose *values differ in case* — validation-mismatch risk (`schemas_extended.py` vs `schemas/property.py`).
- **F13. `orgSettingsService.ts` = 4 services in one file:** Org Settings (`:6`), Approval Chain (`:103`), **API Key Service** (`:401`), Firm Analytics (`:637`). API keys are done right (SHA-256 hash, `crypto.randomBytes(32)` — `:406-411`) but `validateApiKey` increments `usage_count` without row locking (`:510-518`) and none of it belongs in "settings". **Fix:** split into 3–4 modules.
- **F14. N+1 patterns:** `CapRateService.ts:1094-1103` per-listing rental-comp SQL inside a 25-iteration loop; `floorPlanService.ts:965-995` row-at-a-time room inserts; `approvalService.ts:760-803` 4 sequential queries that should JOIN.
- **F15. TS orchestrator ignores the batch endpoint:** `valuationEngineService.ts:168-180` loops methods with one HTTP round-trip each while `pythonClient.calculateAllMethods()`/`POST /api/v1/methods/calculate-all` exists (`pythonClient.ts:512-520`). Axios client also lacks HTTP keep-alive agent config (`pythonClient.ts:346-353`), and `withRetry` (`:660-684`) exists but the method calls never use it.
- **F16. Confidence thresholds duplicated:** `methods/_shared.py:115-122` hardcodes 0.80/0.60 bands independently of `config.py:103-104`.
- **F17. Building-code table ×3 in TS:** `CapRateService.ts:799-816` ≈ `floorPlanService.ts:800-816` ≈ `hbuAnalysisService` copy; the canonical `geometry/ghanaBuildingCode.ts` already exists — use it. (`CapRateService.getGhanaBuildingStandards()` DB query at `:790-794` is itself never called — dead, High.)
- **F18. Report renderer prep duplication:** `numberToWords()`/`formatCurrency()` duplicated (`reportTemplateService.ts:593-632` vs `reportDataService.ts:1032-1042`); `METHOD_DESCRIPTIONS` ×3 (`valuationReportService.ts:144-156`, `reportTemplateService.ts:911-919`, `docGenerationService.ts:1107-1115`); FX-missing behavior diverges (throw vs log-and-zero vs degrade — `reportDataService.ts:261-282` vs `reportTemplateService.ts:~888` vs `valuationReportService.ts:~722`).

---

## 4. TS ↔ PYTHON BOUNDARY ANALYSIS

**What crosses:** JSON over HTTP to `:8001`. Requests carry a flattened `PythonPropertyInput` (~15 scalar fields) plus an untyped `options: Record<string, any>` bag (`pythonClient.ts:51-55`) that since migs 251–256 carries all DB-sourced assumptions (rates, factors, benchmarks, comps for market-rent/sales-comparison). Responses carry `estimated_value` + details/assumptions/limitations.

**Three parallel clients for one engine:**
1. `pythonClient.ts` (typed, retry helper, logging) — used by `valuationEngineService`.
2. Hand-rolled `fetch(pythonBase…)` in `routes/valuations.ts:1125, 2797, 2942, 3115, 3280` — the actual per-method `/value` runners; no shared timeout/retry/error mapping; each duplicates property + region + config sourcing (rental 2719-2769, drc 2859-2878, profits 3019-3038, residual 3199-3225 — ~200 LOC of copy-paste; extract `fetchValuationContext()`).
3. **The browser itself** via `NEXT_PUBLIC_PYTHON_API_URL` (`frontend/src/lib/valuation-api.ts:31`) — the security hole (F1) and a contract-versioning nightmare (frontend pinned to engine internals).

**Contract fragility:**
- `options` is schemaless on the TS side; Python methods pluck keys with `opts.get(...)` and silent defaults (income vacancy 5%, cost soft-costs 10%/profit 15%) — a typo'd option key silently yields the default, invisible to the audit trail. Strict-fail is applied inconsistently (residual/profits strict; income/cost partially; sales_comparison not at all — F5).
- Duplicated logic both sides: adjustment/validation exists in TS (CapRateService NOI/cap-rate derivation) *and* Python (income/market-rent); region normalization exists in `_shared.py`, `config.py`, `data_hub_api_adapter.py`, and TS route defaults (`prop.region || 'greater_accra'`); method-name aliases (`residual`/`residual_method` etc.) maintained in `pythonClient.ts:530-540` *and* Python routing.
- Reverse dependency: Python calls back into the TS backend Data Hub API (`config.py:47-51`, `data_hub_api_adapter.py`) — a TS→Py→TS cycle during residual/DRC cost sourcing; slow Data-Hub responses stall valuations with no retry (`data_hub_api_adapter.py:60-64`).
- Type drift risk: TS interfaces in `pythonClient.ts` vs Pydantic models are synchronized by hand only; `toMarketConditions` already papers over drift by fabricating fields (F7).

**Recommended shape:** one typed client, one batch call per valuation (`calculate-all`), signed requests, generated types (OpenAPI from FastAPI → TS), engine strict-fails on every assumption.

---

## 5. FILE-BY-FILE — TypeScript (36 files, 26,758 LOC)

| File | LOC | Purpose | Key findings |
|---|---|---|---|
| `valuationEngineService.ts` | 1,272 | Main AVM orchestrator: cache → market conditions → methods loop → hybrid weighting → save. **God file.** | Sequential per-method Python calls (:168-180, F15); weight table #1 (:85-92, F2); macro fallbacks (:530-577) + fabricated confidence inputs (:199-209, F5); `Math.round` on GHS (:705,752, F8); NaN-prone `parseFloat` lat/lng (:302-304); `persistToMlPredictions` price-band strings likely unread (:980-1015, dead Medium) |
| `pythonClient.ts` | 696 | Typed HTTP client for the Python engine. | No auth header (:346-353, F1); no keep-alive agent; `withRetry` never applied internally (:660-684); fabricated market-condition mapping (:634-651, F7); method-alias map duplicated with Python (:530-540) |
| `index.ts` | 260 | Barrel + convenience wrappers. | Clean; consumed by `routes/{valuations,reports,valuers}.ts` |
| `types.ts` | 760 | Domain types. | Pure types; hand-synced with Pydantic (drift risk, §4) |
| `orgSettingsService.ts` | 765 | **4-in-1**: org settings / approval chains / API keys / firm analytics. | Mixed responsibility (:6,:103,:401,:637, F13); API keys SHA-256-hashed (good, :406-411); usage-count race (:510-518); `recordWsSession` likely uncalled (:614-634, dead Medium) |
| `orgTeamService.ts` | 839 | Invites, roles, valuation team, Keycloak. | invite/resend email duplication (:172-216 vs :365-387); fire-and-forget Keycloak errors swallowed (:208); org_type→user_type silent default (:277) |
| `CapRateService.ts` | 1,595 | Cap-rate benchmarks + NOI + income-approach inputs. **God file.** | N+1 comp queries in listing loop (:1094-1103, F14); hardcoded cap-rate/vacancy/expense/rent tables (:235-253, :492-509, :1029-1038, F5); building-code copy (:799-816, F17); dead `getGhanaBuildingStandards` (:790-794, High); unchecked `parseFloat` (:528) |
| `auditLogService.ts` | 530 | Report audit trail. | Clean; free-form `details` may persist sensitive data unencrypted (:98-126); `deleteOldLogs`/`archiveLogs` unscheduled (:479-507, dead Medium) |
| `overrideTrackingService.ts` | 645 | Manual-override tracking + RICS disclaimers. | Approval thresholds hardcoded (:101-111); deviation via property-name string matching (:378-397, fragile) |
| `approvalService.ts` | 1,068 | Approval workflow, credentials, digital seal, e-sign. **God file.** | 4 sequential queries in `triggerClientEsign` (:760-803, F14); seal = SHA-256, not a cryptographic signature (:321-324); per-call dynamic import (:825-835); `getReportSignatureConfig` hardcoded defaults, likely uncalled (:973-1008, dead Medium) |
| `hbuAnalysisService.ts` | 884 | Highest & Best Use four-test framework. **God file.** | Hardcoded thresholds/credits (:147-167, F5, duplicated w/ contributions); string-match legal test (:361-378); arbitrary 50px size check (:509) |
| `valuationClientService.ts` | 233 | Client CRUD for engagements/invoices. | Clean; per-row subqueries acceptable at current scale (:103-114) |
| `valuationDocumentService.ts` | 240 | Valuation docs (photos/title/maps) in MinIO. | Sequential photo downloads (:115-152, F4); no size cap on base64 data-URLs before upload (:56-91) |
| `valuationInvoiceService.ts` | 1,289 | Invoices, GhIS fee scales, Paystack, receipts. **God file.** | Hardcoded man-day rates/0.5% fee/tax brackets (:131-210, F5); fee-calc duplicated create-vs-calculate (~:157-243 vs :271-373); `toFixed→Number` precision (:226); unchecked `parseFloat(fxConv.rate)` (:464) |
| `contributionWorkflowService.ts` | 943 | Comp-gap detection + contribution rewards. **God file (borderline).** | Duplicate thresholds/credits with HBU (:147-167); reputation multipliers hardcoded (:169-174); naive date/timezone checks (:667-677) |
| `floorPlanService.ts` | 1,458 | Fabric.js floor plans, measurements, LI-1630 validation, geometry versions. **God file.** | Row-at-a-time room inserts (:965-995, F14); building-code copy (:800-816, F17); room-extraction duplication (:428-524 vs :558-652); shoelace sign undocumented (:668/714); geometry-versioning methods possibly unrouted (:1009-1120, dead Medium) |
| `imageProcessingService.ts` | 381 | Sharp compression/thumbnails/EXIF. | Clean; size/quality constants hardcoded (:20-41, :328 — acceptable) |
| `reportService.ts` | 734 | Report CRUD/lifecycle/photos. | Clean, single-responsibility; idempotent draft create (:200-216) |
| `reportDataService.ts` | 1,143 | Phase-2 structured report data (cover/certification/legal/risk). **God file.** | `numberToWords`/`formatCurrency` duplicated (:1032-1042, F18); FX throw-vs-degrade divergence (:261-282, F18); `Math.round` GHS/USD (:369,396, F8); good `Promise.all` usage (:189-211) |
| `reportTemplateService.ts` | 1,762 | Template load + context prep for renderers. **God file.** | ~8 sequential awaits in `collectReportData` (:256-573, F4); formatter duplication (:593-632, :816+); QR generated without await → likely never embedded (:1159-1172); hardcoded region default (:338) + URL (:1156) |
| `valuationReportService.ts` | 807 | ReportData assembly + HTML render. **God file (borderline).** | `METHOD_DESCRIPTIONS` copy #1 (:144-156, F18); `generateHtmlReport` uncalled (:282-289, dead Medium); fragile multi-source result merge (:376-429); hardcoded regions/company (:726,749) |
| `professionalDocxBuilder.ts` | 1,955 | Programmatic DOCX (ghis_standard). **Largest god file.** | Unsanitized user text into paragraphs (:936-1050, F9); boilerplate method justifications ignoring real data (:1005-1070); palette duplicated with htmlToDocx (:45-63); null title renders "null" (:296-300) |
| `pdfGenerationService.ts` | 846 | DOCX→PDF (LibreOffice), QR, PDFKit cover, seal hash. **God file.** | Un-pooled soffice subprocess per request (:130, F4); silent temp-cleanup catch (:209-210); hardcoded `/tmp/propmetrik-pdf` (:66); hash over full PDF bytes → metadata-sensitive (:142) |
| `docGenerationService.ts` | 836 | DOCX orchestration: collect → template-or-builder → MinIO. **God file.** | Path fork docxtemplater vs builder (:340-342, F10); sequential 30s-timeout floor-plan image fetches (:~796, F4); generated `content` cached in `valuation_reports.content` JSONB merge (:144) — regenerate required to see template fixes (invalidation is manual); `generateBasicDocx` uncalled (:582-596, dead Low) |
| `htmlToDocx.ts` | 436 | TipTap HTML → docx elements. | No sanitization (:47-62, F9); cheerio per section (:52, F4); palette copy (:31-41) |
| `onlyofficeService.ts` | 446 | OnlyOffice JWT + callback save. | **Dead — zero importers (High)**; hardcoded fallback JWT secret (:20-30); remove or wire routes |
| `valuationWriteupService.ts` | 281 | AI section drafting grounded in real data. | Clean; citation-strip regex correct (:162-164) |
| `areaNarrativeService.ts` | 267 | Area narrative via geocode + Google Places. | Clean; 60s AI timeout can stack in chained requests (:220-226) |
| `geometry/index.ts` | 56 | Geometry barrel. | Comment drift re removed BlenderGeometryService (:5) |
| `geometry/geometryCache.ts` | 341 | Redis cache for geometry. | Clean |
| `geometry/featureFlags.ts` | 476 | Floor-Plan-V2 flags/targeting/A-B. | LLM model IDs + rollout %s hardcoded in code (:98,:101,:67-69); role-string user segments (:211-214) |
| `geometry/roomSizeValidator.ts` | 387 | LI-1630 room validation + size suggestions. | Clean; circulation 15% & allocation weights hardcoded (:188,:251-255 — design constants, acceptable) |
| `geometry/adjustmentConstraints.ts` | 502 | Per-element adjustment limits + validation. | Clean; ±10%/1m/2m magnitudes hardcoded (:161-194 — acceptable, documented in explanations) |
| `geometry/ghanaBuildingCode.ts` | 569 | Statutory LI-1630 tables. | Statutory constants OK; **should be the single source** replacing the 3 copies (F17) |
| `geometry/accessibilityValidator.ts` | 481 | Accessibility standards + scoring. | Clean; standards tables statutory-style, acceptable |
| `geometry/auditService.ts` | 575 | Floor-plan audit log (versioned, hashed). | Clean; parameterized SQL throughout |

## 6. FILE-BY-FILE — Python (48 files, 18,275 LOC)

### Entrypoint & config
| File | LOC | Purpose | Key findings |
|---|---|---|---|
| `app/main.py` | 446 | FastAPI app, lifespan/db pool, router registration. | F1 (CORS `*`+credentials :157-168, no auth, docs open :151-152, 0.0.0.0 :442); dead `_calculate_adjustments` (:314-364, High); good: strict-fail input policy documented (:194-203), asyncpg pool (:125-130), graceful land-router degradation (:421-425) |
| `app/config.py` | 262 | Pydantic settings + Ghana defaults. | Stale 5-region taxonomy (:84-90,:196-232, F6); weight table #2 (:93-100, F2); default secret key (:54); `ValuationConstants` class unimported (:241-263, dead High); relative log path (:183) |
| `app/__init__.py` | 1 | Package marker. | — |
| `app/schemas_extended.py` | 523 | Extended property/transaction/workflow models. | Schema layer #3 with duplicate `PropertyLocation`/`PropertyCondition` enums (F12); monetary fields lack `ge=0` bounds (:148,:169) |

### `app/methods/` — the live engine
| File | LOC | Purpose | Key findings |
|---|---|---|---|
| `_shared.py` | 122 | Dependency-free shared models/helpers. | Region normalize silently defaults unknown→greater_accra (:87, F6); confidence bands hardcoded independently of config (:115-122, F16) |
| `sales_comparison.py` | 366 | RICS basket sales comparison. | **75k/40k GHS bedroom/bathroom + 9%/yr appreciation + area lists hardcoded, not request-overridable** (:173,:180,:228,:204-216, F5); good div-by-zero guards; banker's `round()` on money (F8) |
| `cost.py` | 180 | Cost approach. | Strict-fails construction rate (:48-53) but soft-costs 10% / profit 15% silent defaults (:64,:66, F5); land value defaults 0 silently (:57); depreciation applied to full RCN (correct) |
| `income.py` | 170 | Direct cap + DCF. | Strict-fails rent & cap rate (good); 5% vacancy + 0% inflation/growth silent defaults (:65,:91-95, F5); inflation-coherent nominal growth documented (:87-90, correct) |
| `residual.py` | 192 | Residual land value. | Best-in-class strict-fail `_req()` on 15 inputs (:50-55); floor at 0 with raw shown (:104,:163, correct); 15% min-profit default (:110, F5) |
| `profits.py` | 213 | Profits method. | Strict-fails revenue path, cost ratios, remuneration, cap rate (:60-133) — the mig-254/255 pattern done right |
| `drc.py` | 449 | DRC w/ feature-driven MEA. | MEA baseline strict-required (:159, good); hardcoded age-band caps (:320-327), spec scores/service lists (:50,:59), construction-type inference (:264-266, F5); silent enum defaulting (:184-232) |
| `market_rent.py` | 202 | Rental comp adjustment engine. | Model pattern: all adjustment factors from request (mig 251); minor hardcoded furnishing map (:84) |
| `market_conditions.py` | 92 | Regional market conditions. | **Entirely static hardcoded data** (:37-78, F5) — feeds TS `getMarketConditions` and hence AVM confidence |
| `depreciation.py` | 541 | D8 depreciation endpoints + override workflow. | RCN fallback 8500 GHS/sqm (:237, F5); enum maps duplicated w/ drc.py (:119-196); override submit doesn't persist to DB (comment-only, :381-463); approval threshold in class constant |
| `land_value.py` | 457 | Land value (residual+comparable reconciliation) endpoints. | User override = clean 100% bypass w/ disclosure (:176-195, correct); provider-unavailable → explicit error not fallback (good); GhIS 70/30–30/70 weighting documented |
| `multi_method.py` | 348 | calculate-all + reconciliation + sensitivity + confidence. | Weight tables #3/#4 (:87-97,:205-209, F2); flat ±range sensitivity (:261-299) — NOTE: real per-method sensitivity re-runs exist here per mig 257; confidence endpoint thin |
| `methods/__init__.py` | 0 | Marker. | — |

### `app/services/` & adapters
| File | LOC | Status | Key findings |
|---|---|---|---|
| `services/__init__.py` | 69 | LIVE | Re-exports depreciation classes for methods/ |
| `services/depreciation.py` | 1,958 | **LIVE** (via `methods/depreciation.py`, `methods/drc.py`). **God file.** | Economic-life/condition/renovation tables hardcoded (:461-509, F5); regional env-risk defaults (:1350-1368); math clean (`round(x,4)`, guards) |
| `services/land_comparable_sales.py` | 1,282 | **LIVE** (via land_value_provider). **God file.** | Appreciation/zoning/tenure/topography/scoring tables hardcoded (:57-203, F5); dual IQR+MAD outlier logic correct (:947-1006) |
| `services/drc_method.py` | 727 | **DEAD (High)** — zero importers; superseded by `methods/drc.py` | Duplicate SPECIALIZED_COSTS/MEA/regional tables (:71-155) |
| `services/market_data.py` | 700 | **DEAD (High)** — zero importers; fully mocked data (:243-252, USD rate 12.5 :194) | Delete |
| `services/land_value_provider.py` | 672 | **LIVE** (methods/land_value.py:35) | Orchestrates comps+residual+reconciliation; 5-min TTL cache without workflow invalidation; override path correctly isolated (:206-216) |
| `services/land_value_reconciliation.py` | 596 | **LIVE** | GhIS strength-based weights + 40% divergence flag hardcoded (:46-73); weight redistribution on single-method failure correct (:254-401) |
| `services/reconciliation.py` | 586 | **DEAD (High)** — zero importers; superseded by multi_method.py | Delete |
| `services/sensitivity_analysis.py` | 572 | **DEAD (High)** — zero importers; live `/sensitivity` is in multi_method.py:262 | Delete |
| `services/confidence_scoring.py` | 546 | **DEAD (High)** — zero importers; confidence computed in-method | Delete |
| `services/residual_method.py` | 524 | **LIVE** (land_value_provider:36) | Region sale-price/cost/fees/25%-finance/profit tables hardcoded (:35-181, F5); live Data-Hub cost fetch w/ hardcoded fallback (:403-432); floor-at-0 + finance accrual correct |
| `services/comparable_basket.py` | 468 | **DEAD (High)** — zero importers | Delete or wire to a manual-basket feature |
| `services/ml_serving_client.py` | 417 | **DEAD/orphaned (High)** — zero importers | 30s timeout, no retry (:137); delete or integrate |
| `adapters/data_hub_adapter.py` | 770 | **LIVE** (PostgreSQL/PostGIS) | Parameterized SQL throughout (no injection); regex land-size extraction per row (:454-475, F11); heavy per-row `_row_to_property` (:607-771) |
| `adapters/data_hub_api_adapter.py` | 484 | **LIVE** (HTTP→TS Data Hub) | New session per request (:45-67, F11); no retry (:60-64); own region map (:420-464, F6); no auth on internal hop |
| `adapters/market_data.py` | 10 | LIVE passthrough | Back-compat re-export |
| `adapters/__init__.py` | 1 | Marker | — |

### Schemas, models, utils
| File | LOC | Key findings |
|---|---|---|
| `app/schemas/__init__.py` | 137 | Central re-exports; schema layer #1 |
| `app/schemas/property.py` | 216 | Good bounds (`gt=0`, `le=…`, floor-ratio ≤3× land :124-128, lease validation :130-137); enum-case conflict w/ schemas_extended (F12) |
| `app/schemas/valuation.py` | 218 | Valuation models; part of layer #1 |
| `app/schemas/comparable.py` | 183 | Comparable models |
| `app/schemas/land_comparable.py` | 437 | Land comp models incl. adjustments |
| `app/schemas/market_data.py` | 208 | Market data models (partly serving dead market_data service) |
| `app/models/schemas.py` | 135 | Layer #2 — `PropertyForValuation` overlaps `Property` (F12) |
| `app/models/__init__.py` | 20 | Marker/re-export |
| `app/utils/ghana_validation.py` | 322 | Ghana bounds check defensible (:113); regional land-size/price guideline tables hardcoded (:147-162 — advisory only) |

### Top-level & tests
| File | LOC | Key findings |
|---|---|---|
| `simple_start.py` | 115 | Mock server, git-tracked, copied into Docker image via `COPY . .` — move to tests/ or dockerignore (dead-ish, High) |
| `debug_land_value_request.py` | 83 | Debug script with hardcoded prod property/valuation UUIDs (:18-19) — remove (dead, High) |
| `tests/test_depreciation.py` | 1,242 | Real depreciation coverage — the only tested method area |
| `tests/conftest.py` | 12 | sys.path fixture |
| `tests/__init__.py` | 1 | Marker |
| `Dockerfile` | — | Correct entrypoint `app.main:app`; `COPY . .` includes logs/debug/tests (add `.dockerignore`); `0.0.0.0` bind (F1) |

---

## 7. COVERAGE LEDGER

| # | File | Read | Findings above |
|---|---|---|---|
| 1–27 | All 27 top-level TS services | Full | §5 |
| 28–36 | All 9 `geometry/*.ts` | Full (accessibilityValidator & geometry/auditService: full structure + first ~150 lines line-by-line, remainder scanned) | §5 |
| 37 | `routes/valuations.ts` (out of scope) | Targeted (per-method runners + python call sites only) | F7, §4 |
| 38–41 | `app/main.py`, `config.py`, `schemas_extended.py`, `__init__.py` | Full | §6 |
| 42–54 | All 13 `app/methods/*.py` | Full | §6 |
| 55–68 | All 14 `app/services/*.py` incl. `__init__` | Full (dead files: purpose + import-graph + constant-table verification) | §6 |
| 69–72 | All 4 `app/adapters/*.py` | Full | §6 |
| 73–81 | All 9 schema/model/util files | Full (`ghana_validation.py`, `schemas/property.py`: full structure, validation sections line-by-line) | §6 |
| 82–83 | `simple_start.py`, `debug_land_value_request.py` | Full | §6 |
| 84–86 | `tests/*` (3 files) | Skim (as scoped) | §6 |
| — | `app/_archive_legacy/` | **Absent from disk** (verified `find`) — previously-archived duplicates deleted; successor dead code identified in `app/services/` (F3) | F3 |
| — | `Dockerfile`, stray `uvicorn*.log` | Full / noted | F1, F3 |

**Cross-verification performed:** every dead-code claim above was grep-verified for importers (TS: across `backend/src`; Python: across `app/` excluding `__pycache__`); the three method-weight tables, CORS/auth posture, browser-direct engine calls, org-settings 4-way split, sequential method loop, and hardcoded sales-comparison constants were re-read first-hand rather than taken from a single pass.
