# Audit 15 — Frontend Pages: Admin + Analytics + Misc Dashboard Slice

Auditor: Senior Staff Engineer pass. Repo: `/Users/kobby/github/Cedyn Group/propmetrik`.
Scope root: `frontend/src/app/dashboard/`. Read-only audit; no source modified.

## Scope & Counts

| Subdir | Files | LOC | Notes |
|---|---|---|---|
| admin/ | 49 | 18,811 | CRUD + data-hub console + publications + crypto |
| analytics/ | 24 | 12,945 | market/ML/risk/forecasting; manual SVG charts |
| billing/ | 1 | 793 | authedFetch + Promise.all |
| calendar/ | 1 | 592 | N+1 milestone fan-out |
| marketplace/ | 1 | 54 | error.tsx ONLY — no page.tsx (see dead-code) |
| notifications/ | 2 | 338 | page + error; paginated (good) |
| portfolio/ | 1 | 325 | react-query, 5 queries, staleTime set (good) |
| profile/ | 1 | 801 | tabbed, authedFetch |
| tenant/ | 12 | 3,361 | tenant portal pages |
| top-level | 3 | 1,114 | page.tsx (930) + layout (128) + error (56) |
| **TOTAL** | **~93** | **~39,172** | |

Charting: analytics pages do NOT use recharts — they hand-roll inline SVG (`<polyline>`/`<path>`). Only 6 admin/data-hub pages import `recharts`. No `next/dynamic` anywhere in the slice.

## Scores (1–10, 10 = best)

| Dimension | Score | Rationale |
|---|---|---|
| Performance | **5** | Landing page + most analytics use `Promise.all/allSettled` (good), but: inline unmemoized SVG-path computation on every render across ~10 chart pages; admin user/org tables have zero pagination + no search debounce (keystroke → remote DB); calendar N+1 fan-out; no `next/dynamic` code-splitting on 700–1771-LOC pages. |
| Maintainability | **4** | 28 files >500 LOC; crypto page 1771 LOC w/ 35 `useState`; per-page copy-pasted card/chart/format helpers. |
| Duplication | **4** | `API_BASE` const + `fetchData<T>` wrapper + local `MetricCard`/`StatCard`/`fmt`/SVG-chart helpers re-declared per page across ~20 analytics files. |
| Hardcoded-values | **6** | Analytics is clean (relative `/api/...` + tokens). 5 admin pages hardcode `NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'`; 101 raw hex in admin, 12 in analytics SVGs. |
| Security | **3** | Admin subtree gated CLIENT-SIDE ONLY (layout `useEffect` redirect); middleware checks only cookie presence, never role. 5 admin pages fetch backend directly with `credentials:'include'`, bypassing proxy + Bearer contract. |

---

## TOP FINDINGS (by priority)

### P0-1 — Admin portal has NO server-side RBAC enforcement (security)
`admin/layout.tsx:32-41` gates the entire `/dashboard/admin/*` subtree only via a client `useEffect` that calls `router.replace('/dashboard')` when `canAccessAdmin` fails. `frontend/src/middleware.ts:5,108` protects `/dashboard` on cookie **presence only** (`request.cookies.has('authjs.session-token')`) — it never decodes the JWT nor checks `role`/`userType`. Any authenticated non-admin can request an admin route; the page JS/HTML (including sensitive labels, endpoint shapes, config UIs) ships to the browser and renders for a frame before the client redirect. Backend route auth is the only real gate.
- Fix: add role decode in `middleware.ts` (getToken from next-auth) and 302 non-admins off `/dashboard/admin/*` before any admin JS is served. Keep the client check as defense-in-depth.

### P0-2 — 5 admin pages violate the API-proxy contract + use cookie auth (security + correctness)
`admin/crypto/page.tsx:42`, `admin/subscription-pricing/page.tsx:28`, `admin/subscription-costs/page.tsx:28`, `admin/platform-fees/page.tsx:25`, `admin/data-hub/contributions/page.tsx:42` all define `const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'` and fetch e.g. `admin/crypto/page.tsx:306` `fetch(\`${API_BASE}/admin/crypto/metrics\`, { credentials:'include' })`. This (a) bypasses the `next.config` `/api/* → /api/v1/*` rewrite contract (per MEMORY: "client calls /api/<resource>, NEVER prefix NEXT_PUBLIC_API_URL"), and (b) relies on cookie auth instead of `authedFetch` Bearer — cross-origin cookies won't send when `NEXT_PUBLIC_API_URL` points at a different host, silently 401ing in prod while working locally.
- Fix: replace with `authedFetch('/api/admin/crypto/metrics')` like `admin/users/page.tsx:44` already does.

### P1-3 — Admin `users`/`organizations` tables: no pagination + no search debounce (performance, REMOTE DB)
`admin/users/page.tsx:44,54,56` — `fetchUsers` depends on `[search]` and `useEffect` re-runs it on every change ⇒ **one remote-DB query per keystroke**, no debounce; response rendered in full via `users.map` (`:124`) with no pagination/virtualization. Identical in `admin/organizations/page.tsx:33,45,122`. On the remote prod DB this is the classic latency multiplier.
- Fix: debounce search (300ms), add server `limit/offset` + pagination controls (audit-logs page already does this at `admin/audit-logs/page.tsx`).

### P1-4 — Inline unmemoized SVG chart geometry recomputed every render (performance)
`analytics/forecasting/page.tsx:174-198` computes `values`, min/max, and full `polyline`/`polygon` point strings by `.map()`-ing the dataset directly in the render body (no `useMemo`). Repeated across the hand-rolled-chart pages (`ml/`, `risk/`, `short-stay/`, `construction/`). Only `analytics/api/page.tsx` uses `useMemo` at all. Every parent state change (tab toggle, filter, hover) rebuilds all path strings.
- Fix: wrap chart-geometry derivations in `useMemo` keyed on the data array; extract a shared `<LineChart>`/`<AreaChart>` SVG primitive.

### P1-5 — God files without code-splitting; crypto page 1771 LOC / 35 useState (maintainability + perf)
`admin/crypto/page.tsx` (1771 LOC, 35 `useState`, single client component, no `dynamic`) plus 27 other >500-LOC pages ship as monolithic client bundles. No `next/dynamic` anywhere ⇒ heavy tab-panel trees (crypto has 5+ tabs, all mounted) load eagerly.
- Fix: split crypto into tab-level components lazy-loaded via `next/dynamic`; extract shared analytics chart/card primitives to cut per-page bundle.

Secondary: `calendar/page.tsx:100-116` N+1 fan-out (1 projects request + 1 milestones request per active project) — parallelized via `allSettled` but still O(projects) round-trips to the remote DB. `marketplace/` ships only `error.tsx` with no `page.tsx` (dead route boundary).

---

## GOD-FILE TABLE (>500 LOC)

| File | LOC | Split recommendation |
|---|---|---|
| admin/crypto/page.tsx | 1771 | Tab components (metrics/transactions/wallets/config/settlement) + `dynamic()`; extract token/network consts |
| admin/data-hub/pull-integrations/page.tsx | 1049 | Per-integration cards → components |
| admin/publications/new/page.tsx | 1038 | Form-step components; share with `[id]` editor |
| admin/publications/[id]/page.tsx | 918 | Merge shared editor with new/ |
| admin/subscription-pricing/page.tsx | 830 | Table + editor split; dedupe with subscription-costs |
| admin/subscription-costs/page.tsx | 830 | Near-twin of subscription-pricing — unify |
| analytics/crm/page.tsx | 808 | Extract chart/kpi primitives |
| profile/page.tsx | 801 | Tab panels → components |
| admin/data-hub/valuation-config/page.tsx | 773 | Section components |
| analytics/valuations/page.tsx | 761 | Shared chart primitives |
| analytics/valuations/sensitivity/page.tsx | 759 | " |
| analytics/short-stay/page.tsx | 750 | " |
| calendar/page.tsx | 592 (subdir) | Fix N+1; extract month grid |
| analytics/construction, ml, affordability, forecasting, risk, market/investments, ml/forecasting, ml/monitoring, valuations/leaderboard, management, market/rentals, demand | 514–708 each | All share the same chart/card scaffolding — extract |
| admin/api-keys, publications/autopilot, platform-fees, data-hub/contributions | 533–693 | Component extraction |

28 files exceed 500 LOC (18 analytics, 10 admin/misc).

## DUPLICATION NOTES

- **Fetch scaffold**: every analytics page redeclares `const API_BASE = '/api/analytics/...'` + a local `async function fetchData<T>(endpoint, signal)` wrapper (`analytics/page.tsx:99-113` and ~20 twins). Extract one `analyticsFetch(base)` factory.
- **Card/format helpers**: `MetricCard`, `StatCard`, `fmt`, `PctBadge`, `Section`, SVG mini-chart helpers re-defined per page (landing page `page.tsx:157-300` has the canonical set; analytics pages each ship their own copies).
- **subscription-pricing vs subscription-costs** (830 LOC each): near-identical table+editor scaffolding on parallel domains — prime unify candidate.
- **publications/new vs publications/[id]** (1038 vs 918): duplicated publication editor form.
- **API_BASE localhost fallback**: same violating string copy-pasted across 5 admin pages (P0-2).

## FILE-BY-FILE LEDGER (notable)

- `page.tsx` (930) — GOOD reference: `Promise.allSettled` parallel fetch (`:352`), `DashboardSkeleton` (`:306`), semantic tokens throughout, `authedFetch` relative paths. Only nit: local helper set not shared.
- `layout.tsx` (128) — client RBAC only; see P0-1. `error.tsx` (56) — standard boundary, fine.
- `admin/layout.tsx` — client-only `canAccessAdmin` gate (P0-1).
- `admin/crypto/page.tsx` — P0-2 + P1-5; `credentials:'include'` cookie fetch, 35 useState.
- `admin/subscription-pricing|subscription-costs|platform-fees|data-hub/contributions` — P0-2 (localhost API_BASE + cookie fetch).
- `admin/users/page.tsx` / `admin/organizations/page.tsx` — P1-3 (no pagination, keystroke refetch). Uses correct `authedFetch`.
- `admin/audit-logs/page.tsx` — pagination present (good pattern to copy).
- `admin/rbac/page.tsx:7` — `const API = NEXT_PUBLIC_API_URL || ''` (empty fallback = relative, lower risk but non-standard).
- `admin/publications/autopilot/page.tsx:83` — `NEXT_PUBLIC_API_URL || '/api'` + `setInterval` polling (verify cleanup).
- `admin/publications/list/page.tsx` (13) — pure redirect stub → publications (intentional, not dead).
- `admin/data-hub/settings/page.tsx:194` — hardcoded `defaultValue="http://localhost:4000/api/v1"` in an input (display only, low risk).
- `admin/api-docs/page.tsx:173,283` — `/api/v1` shown as documentation copy (intentional, not a call).
- `analytics/page.tsx` + all analytics pages — relative `/api/...` + `authedFetch` + `Promise.all` (contract-compliant); charts unmemoized (P1-4). 14/22 use AbortController/signal (good), 8 do not.
- `analytics/{management,infrastructure,valuations/leaderboard,ml/features}/page.tsx` — fetch WITHOUT `Promise.all` (sequential awaits) — minor perf.
- `billing/page.tsx` — authedFetch + Promise.all, no skeleton (minor).
- `calendar/page.tsx` — N+1 milestone fan-out (`:100-116`); uses `projectsApi`/`milestonesApi` helpers.
- `portfolio/page.tsx` — react-query, 5 queries, `staleTime` set, skeletons — GOOD.
- `profile/page.tsx` — authedFetch, tabbed, 801 LOC (split candidate).
- `notifications/page.tsx` — paginated (`page,limit` `:49`), `notificationApi` helper — GOOD.
- `marketplace/error.tsx` — only file in dir; NO `page.tsx` → orphan error boundary (dead-code, medium confidence — route may be intentionally removed).
- `tenant/payments/callback/page.tsx:7,42` — `NEXT_PUBLIC_API_URL || 'http://localhost:4000'` + manual `/api/v1/...` fetch (public verify endpoint; the one arguably-legit direct call, but still hardcodes localhost fallback).
- tenant/* (12 files, 3,361 LOC) — generally use api-helper libs; `payments/page.tsx` (702) is the largest, split candidate.

## COVERAGE LEDGER (all files)

admin/ (49): crypto, data-hub/pull-integrations, publications/new, publications/[id], subscription-pricing, subscription-costs, data-hub/valuation-config, api-keys, publications/autopilot, platform-fees, data-hub/contributions, data-hub/page, publications/page, rbac, data-hub/construction, data-hub/analytics, page, integrations, data-hub/performance, data-hub/spiders, customer-success, api-docs, data-hub/quality, data-hub/jobs, data-hub/economic, usage, data-hub/sources, data-hub/settings, onboarding, data-hub/lineage, data-hub/insights, data-hub/catalog, billing, audit-logs, organizations, data-hub/queues, users, system, publications/settings, data-hub/ingestion, activity, publications/newsletter, publications/indices, publications/analytics, publications/layout, layout, error, data-hub/layout, publications/list — **all reviewed (read big, grep/skim small)**.

analytics/ (24): crm, valuations, valuations/sensitivity, short-stay, construction, ml, affordability, forecasting, page, risk, market/investments, ml/forecasting, ml/monitoring, valuations/leaderboard, management, market/rentals, demand, ml/features, geographic, api, infrastructure, services, layout, error — **all reviewed**.

Misc: billing/page, calendar/page, marketplace/error, notifications/page, notifications/error, portfolio/page, profile/page — **all reviewed**.
tenant/ (12): page, payments/page, payments/callback, settings, maintenance/[id], maintenance/new, maintenance/page, messages, documents, lease/[id], profile, layout — **reviewed via grep/LOC + spot-read callback**.
top-level: page.tsx, layout.tsx, error.tsx — **read fully**.

Total ~93/93 files covered.
