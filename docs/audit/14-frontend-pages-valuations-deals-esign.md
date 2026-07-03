# Audit 14 — Frontend Pages: valuations / deals / e-sign

Auditor: Senior Staff Engineer (read-only). Repo: `/Users/kobby/github/Cedyn Group/propmetrik`.
Scope: every `.tsx`/`.ts` under `frontend/src/app/dashboard/{valuations,deals,e-sign}/`.
Performance is weighted highest — the app is "extremely slow" and the DB is REMOTE, so fetch latency + render cost dominate.

## Scope & Counts

| Subdir | Files | LOC |
|---|---|---|
| valuations | 27 | 21,753 |
| deals | 34 | 16,170 |
| e-sign | 7 | 3,656 |
| **Total** | **68** | **41,579** |

- God files (>500 LOC): **37** of 68.
- `NEXT_PUBLIC_API_URL`/`localhost:4000` contract violations: **15** files.
- Hardcoded `text/bg/border-zinc-*` occurrences: valuations **162**, deals **31**, e-sign **2**. Raw hex: deals **20**, valuations **3**, e-sign **1**.
- `next/dynamic` usages: **1** repo-wide in scope (heavy libs loaded eagerly).

## Scores (1–10, 10 = best)

| Dimension | Score | Rationale |
|---|---|---|
| Performance | **3** | Method pages are single 1,100–2,332-line components; 22–42 `useState` each; whole-tree re-render per keystroke; `pdf-lib` eager-loaded; income DCF effect keyed on an unstable object. |
| Maintainability | **4** | 37 god files; monolithic form components; camelCase/snake_case dual-read scattered everywhere. |
| Duplication | **4** | 6+ deals list pages repeat the same fetch/search/filter/table shell; 5 method pages share the same load→hydrate→python→save scaffold; `API_BASE` const redefined in 11 files. |
| Hardcoded values | **4** | `MARKET_RATES` + `RISK_PREMIUMS` + full WACC/build-up discount-rate math live in `income/page.tsx` client code, against the mig 251–256 DB-config direction. |
| Complexity | **3** | income/page.tsx = 2,332 LOC, 42 useState, 3 fetch effects, one of them dependency-unstable. |

---

## TOP FINDINGS (by priority)

### P0-1 — Monolithic method-page components cause whole-tree re-render per keystroke (PERF, primary cause of "slow forms")
Every valuation method page is ONE component holding all state + all JSX; no child extraction, no `React.memo`.
- `valuations/[id]/income/page.tsx:131` — single `IncomeApproachPage()` spans the entire 2,332-line file; 42 `useState`; 20 controlled `value={}` inputs, each with an inline `onChange` arrow. Typing in any one field re-renders ~1,400 lines of JSX + re-runs all derived math (`potentialGrossIncome`, `effectiveGrossIncome`, `netOperatingIncome`, `calculateDiscountRate`, `crossCheck`) which are computed inline in render (lines 232–307), unmemoized.
- Same monolith shape: `cost/page.tsx` (1,676 LOC, 33 useState, 1 component), `drc/page.tsx` (1,110 LOC, 38 useState), `residual/page.tsx` (1,268 LOC, 34 useState), `profits/page.tsx` (770 LOC, 22 useState).
- Contrast the well-built reference: `valuations/[id]/market/page.tsx` extracts `useCallback`/`useMemo` for `addComparable`, `handleAdjustmentChange`, `calculateQualityScore`, `valueRange`, `subjectProperty` (market/page.tsx:346–713). Method pages should follow it.
Fix: split each method page into a presentational input section + memoized panels; wrap heavy panels in `React.memo`; move inline derived math into `useMemo`. Biggest single win for perceived speed.

### P0-2 — API-URL contract violations (15 files) — hardcodes `localhost:4000` / manual `/api/v1`
Contract is relative `/api/*` through the Next proxy (see MEMORY: API Proxy v1 Contract).
- `const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'`:
  `valuations/settings/page.tsx:31`, `valuations/clients/page.tsx:82`, `valuations/finance/page.tsx:98`, `valuations/analytics/page.tsx:25`, `deals/properties/page.tsx:35`, `deals/properties/submit/page.tsx:25`, `deals/properties/[id]/page.tsx:24`, `deals/new/page.tsx:41`.
- `... || 'http://localhost:4000'` (no /api even): `deals/commissions/page.tsx:129`, `deals/targets/page.tsx:118`, `deals/messaging/page.tsx:61`.
- Absolute localhost baked into a live call: `deals/agents/[id]/edit/page.tsx:138` and `:192` — `authedFetch('http://localhost:4000/api/v1/crm/agents/...')`. These will fail in prod unless env is set; brittle.
- Softer: `income/page.tsx:373,583` and `e-sign/{lease,report}-envelope/page.tsx:45,61` default to `/api` (correct fallback) but still read the env var. `market/page.tsx:556` calls `/api/v1/contributions/submit` (manual v1 prefix — double-prefixes through the proxy rewrite).
Fix: delete every `API_BASE`/`NEXT_PUBLIC_API_URL`; use relative `/api/...` via `authedFetch`/`fetchApi`. `deals/agents/[id]/edit` and `market/page.tsx:556` are correctness bugs in prod, not just style.

### P1-3 — Valuation economics hardcoded in client (against DB-config direction)
`income/page.tsx` embeds financial constants that migs 251–256 moved to DB config for the other methods:
- `MARKET_RATES` cap rates / expense ratios / vacancy bands — `income/page.tsx:112–129`.
- `RISK_PREMIUMS` per property type — `income/page.tsx:208–213`.
- Discount-rate engine in the browser: build-up + WACC math with hardcoded `equityPremium = 4`, `debtWeight = 0.6`, and fallbacks `policyRate ?? 27`, `mortgageRate ?? 32` — `income/page.tsx:276–305`, echoed in JSX at `:1931,:1942`.
This duplicates/forks logic the Python engine should own, and drifts from live economic data. Note: income correctly delegates the actual valuation to `pythonMethodsApi.calculateIncomeApproach` (line 523) — but the discount rate it *sends* is computed client-side from these constants. Fix: source premiums/weights/discount-rate from backend config + `data-hub/economic/snapshot`; keep only display fallbacks.

### P1-4 — `pdf-lib` eagerly imported into the e-sign page bundle (PERF)
`e-sign/new/page.tsx:55` — `import { PDFDocument, rgb, StandardFonts } from "pdf-lib"`, used once at `:464`. Loaded on first paint of a 1,161-line page even though PDF stamping only happens on submit. No `next/dynamic` anywhere in e-sign. Fix: `const { PDFDocument } = await import('pdf-lib')` inside the handler, or `next/dynamic` the field-placement flow.

### P2-5 — Referentially-unstable effect dependency in income DCF recalc (PERF / correctness)
`income/page.tsx:514–570` — the Python income recalc effect lists `economicData` (an object rebuilt via `setEconomicData({...})`) in its dependency array. Combined with the 500 ms debounce it is mostly masked, but any state change that reconstructs `economicData` retriggers a remote POST. Also the effect array (lines 570) is long and hand-maintained — easy to desync. Fix: depend on primitive fields (`economicData.inflationRate`) or memoize the payload.

---

## GOD-FILE TABLE (>500 LOC) — 37 files

| LOC | File | Split recommendation |
|---|---|---|
| 2332 | valuations/[id]/income/page.tsx | Extract IncomePanel, ExpensePanel, CapRatePanel, DcfPanel, DiscountRatePanel as memo'd children; move `INCOME_TOOLTIPS`, `MARKET_RATES`, `RISK_PREMIUMS` to modules/DB. |
| 1759 | valuations/[id]/reconciliation/page.tsx | Split WeightsGrid, SensitivityChart, NarrativeEditor; extract sensitivity effect into a hook. |
| 1676 | valuations/[id]/cost/page.tsx | Extract cost-component roster + result panels; shared method scaffold. |
| 1438 | valuations/finance/page.tsx | Split invoice list / KPI cards / forms. |
| 1268 | valuations/[id]/residual/page.tsx | S-curve + GDV + finance panels into children. |
| 1188 | valuations/[id]/rental-market/page.tsx | Comparable table + benchmark panel + estimate summary. |
| 1161 | e-sign/new/page.tsx | Lazy-load pdf-lib; extract stepper + FieldPlacement wiring. |
| 1110 | valuations/[id]/drc/page.tsx | MEA/useful-life inputs + result into children. |
| 1017 | valuations/[id]/comparables/page.tsx | Search + list + adjustment table. |
| 1013 | valuations/[id]/market/page.tsx | Already best-memoized; still long — extract ComparableRow/AdjustmentTable. |
| 1011 | deals/properties/[id]/page.tsx | Tabs into route segments or child components. |
| 960 | deals/commissions/page.tsx | KPI + table + filters split. |
| 888 | valuations/clients/page.tsx | List + drawer + form. |
| 884 | deals/workflows/[id]/page.tsx | Builder canvas vs config panel. |
| 867 | deals/new/page.tsx | Multi-step wizard steps into components. |
| 851 | valuations/[id]/hbu/page.tsx | Scenario cards + scoring. |
| 818 | deals/[id]/page.tsx | Deal header / activity / tabs. |
| 810 | deals/targets/page.tsx | Chart + table split. |
| 782 | e-sign/report-envelope/page.tsx | Shares scaffold with lease-envelope — extract common envelope builder. |
| 771 | valuations/[id]/methods/page.tsx | Method cards config-driven. |
| 770 | valuations/[id]/profits/page.tsx | Trade inputs + divisible-balance panel. |
| 670 | valuations/settings/page.tsx | Sectioned forms. |
| 658 | deals/pipelines/page.tsx | Stage editor. |
| 655 | valuations/analytics/page.tsx | KPI cards + charts. |
| 650 | valuations/page.tsx | List + filters. |
| 644 | deals/documents/page.tsx | List + upload. |
| 616 | deals/properties/page.tsx | List + filter shell (shared). |
| 616 | deals/page.tsx | Kanban + list views split. |
| 614 | deals/properties/submit/page.tsx | Wizard steps. |
| 612 | deals/analytics/page.tsx | Charts. |
| 607 | valuations/[id]/page.tsx | Overview tabs. |
| 576 | valuations/new/page.tsx | Intake steps. |
| 562 | deals/agents/[id]/edit/page.tsx | Fix localhost URLs; form split. |
| 556 | deals/agents/[id]/page.tsx | Profile tabs. |
| 548 | e-sign/[id]/page.tsx | Viewer + signer panel. |
| 524 | deals/agents/new/page.tsx | Form. |
| 511 | valuations/[id]/floor-plan/page.tsx | Editor canvas. |

## DUPLICATION NOTES

1. **Deals list-page shell** — `deals/{page,contacts,companies,agents,properties,tasks}/page.tsx` each re-implement: `searchTerm`/`statusFilter`/`filterGroup` state + `FilterBuilder` + fetch + table (e.g. deals/page.tsx:160–162, contacts:151–158, companies:143–147, tasks:122–128). `FilterBuilder` + `crm-filters` are shared, but the fetch/state/table shell is copy-pasted ~6×. Extract a `useCrmList()` hook + `<CrmListPage>`.
2. **Valuation method scaffold** — income/cost/residual/drc/profits share the identical lifecycle: `Promise.all([getById, methodApi.getByValuation])` → hydrate from `method_results.<m>.inputs` → debounced `pythonMethodsApi.calculate*` → `handleSave` writing `method_results.<m>`. Extract `useValuationMethod(methodKey)`.
3. **`API_BASE` const** — redefined in 11 files (see P0-2). Single culprit for the contract violations.
4. **e-sign envelope pages** — `report-envelope/page.tsx` (782) and `lease-envelope/page.tsx` (401) share envelope-builder logic; both default `API_BASE` to `/api`.

## DEAD CODE / CONFIDENCE
- No leftover local valuation "engines" found — method pages correctly delegate to `pythonMethodsApi`; the only client math is preload/fallback (labeled as such). No `_archive`/`legacy`/`deprecated` markers in scope. (Confidence: high — grep clean.)
- `valuations/team/page.tsx` and `deals/team/page.tsx` (5 LOC each) are legit thin wrappers around `ServiceTeamManager`, NOT dead. (Confidence: high.)

## CORRECTNESS BUGS
- `deals/agents/[id]/edit/page.tsx:138,192` — absolute `http://localhost:4000/...` in `authedFetch` will 404 in prod when `NEXT_PUBLIC_API_URL` unset. (High.)
- `valuations/[id]/market/page.tsx:556` — `fetch('/api/v1/contributions/submit')` double-prefixes v1 through the proxy rewrite; should be `/api/contributions/submit`. (Medium.)
- `income/page.tsx:570` — hand-maintained long effect-dep array including object `economicData`; drift/extra-fetch risk (P2-5). (Medium.)

---

## FILE-BY-FILE / COVERAGE LEDGER (all 68)

### valuations (27)
| File | LOC | Method | Notes |
|---|---|---|---|
| [id]/income/page.tsx | 2332 | full read | P0-1 monolith, P1-3 hardcoded econ, P0-2 env, P2-5 effect |
| [id]/reconciliation/page.tsx | 1759 | read (sensitivity/weights) | weights from backend + equal fallback OK; sensitivity = single debounced POST (good); weight keystrokes retrigger POST (400ms mitigated) |
| [id]/cost/page.tsx | 1676 | grep+skim | monolith, python-delegated, Promise.all present |
| finance/page.tsx | 1438 | grep | P0-2 env; large; invoice/KPI split |
| [id]/residual/page.tsx | 1268 | grep+skim | 3 components (some extraction), python-delegated |
| [id]/rental-market/page.tsx | 1188 | grep | 19 useState; area-benchmark fallback panel |
| [id]/drc/page.tsx | 1110 | grep+skim | 38 useState monolith, python-delegated |
| [id]/comparables/page.tsx | 1017 | grep | 16 useState; search+adjust |
| [id]/market/page.tsx | 1013 | read (recalc) | REFERENCE: well-memoized; :556 v1 bug; recalc keyed on count not keystroke (good) |
| clients/page.tsx | 888 | grep | P0-2 env; Promise.all present |
| [id]/hbu/page.tsx | 851 | grep | 11 useState |
| [id]/methods/page.tsx | 771 | grep | method cards config |
| [id]/profits/page.tsx | 770 | grep+skim | monolith, python-delegated |
| settings/page.tsx | 670 | grep | P0-2 env |
| analytics/page.tsx | 655 | grep | P0-2 env; BarChart3 icon only (no heavy chart lib) |
| page.tsx | 650 | grep | list; Promise.all present |
| [id]/page.tsx | 607 | grep | overview; Promise.all present |
| new/page.tsx | 576 | grep | intake; :153 relative /api note OK |
| [id]/floor-plan/page.tsx | 511 | grep | editor canvas |
| [id]/subject/page.tsx | 486 | grep | 10 useState form |
| documents/page.tsx | 375 | grep | Promise.all present |
| [id]/documents/page.tsx | 319 | grep | uploads |
| [id]/property/page.tsx | 255 | grep | 5 useState, light |
| layout.tsx | 94 | skim | nav (BarChart3 icon) |
| error.tsx | 54 | skim | boundary |
| [id]/report/page.tsx | 415 | grep | report viewer |
| team/page.tsx | 5 | read | thin wrapper (not dead) |

### deals (34)
| File | LOC | Method | Notes |
|---|---|---|---|
| properties/[id]/page.tsx | 1011 | grep | P0-2 env; tabs monolith |
| commissions/page.tsx | 960 | grep | P0-2 env (localhost, no /api); Promise.all present |
| workflows/[id]/page.tsx | 884 | grep | relative /api/v1 calls (:110,:126,:162) manual v1 |
| new/page.tsx | 867 | grep | P0-2 env; wizard |
| [id]/page.tsx | 818 | grep | deal detail tabs |
| targets/page.tsx | 810 | grep | P0-2 env (localhost) |
| pipelines/page.tsx | 658 | grep | stage editor |
| documents/page.tsx | 644 | grep | list+upload |
| properties/page.tsx | 616 | grep | P0-2 env; list shell (dup) |
| page.tsx | 616 | grep | kanban+list; FilterBuilder; Promise.all |
| properties/submit/page.tsx | 614 | grep | P0-2 env; wizard |
| analytics/page.tsx | 612 | grep | charts |
| agents/[id]/edit/page.tsx | 562 | grep | BUG localhost absolute URLs :138,:192 |
| agents/[id]/page.tsx | 556 | grep | Promise.all present |
| agents/new/page.tsx | 524 | grep | form |
| workflows/page.tsx | 486 | grep | manual /api/v1 (:106..:178) |
| contacts/page.tsx | 482 | grep | list shell (dup); Promise.all |
| documents/[id]/edit/page.tsx | 481 | grep | edit form |
| drip-campaigns/page.tsx | 480 | grep | campaigns |
| contacts/[id]/page.tsx | 460 | grep | Promise.all present |
| contacts/new/page.tsx | 441 | grep | form |
| tasks/page.tsx | 400 | grep | list shell (dup); Promise.all |
| [id]/edit/page.tsx | 397 | grep | Promise.all present |
| agents/page.tsx | 378 | grep | list; Promise.all |
| messaging/page.tsx | 357 | grep | P0-2 env (localhost) |
| workflows/[id]/history/page.tsx | 353 | grep | manual /api/v1 |
| companies/page.tsx | 333 | grep | list shell (dup); Promise.all |
| financials/page.tsx | 199 | grep | KPI |
| layout.tsx | 73 | skim | nav |
| error.tsx | 42 | skim | boundary |
| not-found.tsx | 19 | skim | boundary |
| [id]/not-found.tsx | 19 | skim | boundary |
| loading.tsx | 13 | skim | skeleton |
| team/page.tsx | 5 | read | thin wrapper (not dead) |

### e-sign (7)
| File | LOC | Method | Notes |
|---|---|---|---|
| new/page.tsx | 1161 | read (imports) | P1-4 eager pdf-lib :55; 1 component; FieldPlacement |
| report-envelope/page.tsx | 782 | grep | env `/api` (ok); dup w/ lease-envelope |
| [id]/page.tsx | 548 | grep | viewer + signer |
| lease-envelope/page.tsx | 401 | grep | env `/api` (ok); shared builder |
| templates/page.tsx | 377 | grep | template list |
| page.tsx | 354 | grep | list; Promise.all present |
| layout.tsx | 33 | skim | nav |

---
### Recommended fix order (max perceived-speed ROI)
1. P0-1 decompose income/cost/drc/residual/profits into memoized children (fixes keystroke lag).
2. P0-2 delete all `API_BASE`/`NEXT_PUBLIC_API_URL`; fix agents-edit localhost + market v1 double-prefix (prod correctness).
3. P1-4 lazy-load pdf-lib.
4. P1-3 move income economics to DB config.
5. Extract `useCrmList()` + `useValuationMethod()` to kill duplication.
