# Audit 10 — Frontend lib/, hooks/, providers, PWA & root infra

**Auditor:** Senior Staff Engineer pass, file-by-file. **Date:** 2026-07-02
**Scope:** `frontend/src/lib/**` (41 files), `frontend/src/hooks/**` (13), providers (`src/providers/`, `src/components/providers.tsx`, `src/components/pwa/`), root infra (`src/app/layout.tsx`, `src/middleware.ts`, `next.config.js`, `tailwind.config.ts`, `tsconfig.json`, `public/sw.js`, `public/manifest.json`, `src/auth.ts`). No `src/i18n/` dir exists (i18n lives in `src/providers/i18n-provider.tsx`).
**Counts:** 67 files, **27,656 LOC** total (largest: `valuation-api.ts` 3,521; `projects-api.ts` 2,118; `api.ts` 1,459; `property-management-api.ts` 1,355; `pm-portal-api.ts` 1,323).
**Method:** every file read (small/medium fully; the six >1,000-LOC API clients read at head/wrapper/auth/URL-construction sections plus exhaustive greps for `fetch(`, `getSession`, `localStorage`, base-URL constants, secrets, intervals). Import-graph verification via repo-wide grep for every dead-code claim. Backend mounts cross-checked (`backend/src/index.ts`) where a proxy-contract violation was suspected.

---

## Domain scores (1–10, higher = healthier)

| Dimension | Score | One-liner |
|---|---|---|
| Duplication | **3/10** | 9 distinct fetch wrappers + 2 parallel SSE stacks + 2 conflicting `formatDate`s in lib + ~39 more local `formatCurrency` defs in app/components |
| Hardcoded values / config | **5/10** | Base-URL guessed differently per client; several violate the `/api` proxy contract; magic TTLs are at least named constants |
| Dead code | **5/10** | ≥1,670 LOC verifiably unimported (pm-api.ts, use-pm-queries.ts, pdf-service.ts) + unused realtime components |
| Performance | **4/10** | `force-dynamic` app-wide, `getSession()` per request in 6 wrappers, 1 s polling hook, SW caches auth'd API responses, dark bundle |
| Security | **4/10** | Client-side payment-bypass flag, JWT in SSE query string, SW Cache-Storage of authenticated JSON, no CSP, RPC API key in NEXT_PUBLIC |
| Middleware efficiency | **9/10** | Fully synchronous, cookie-presence checks only, good matcher |
| Infra config (next/tailwind/ts/auth) | **6/10** | Solid auth.ts refresh logic and rewrites; missing security headers; `console.log` of auth flow in prod |

---

## TOP FINDINGS (by priority)

### C1 — CRITICAL · `NEXT_PUBLIC_PAYMENT_BYPASS=yes` ships a client-side payment bypass
- **Evidence:** `frontend/.env.local:2` (`NEXT_PUBLIC_PAYMENT_BYPASS=yes`); consumed at `src/app/(auth)/signup/page.tsx:105` and `src/app/(auth)/onboarding/page.tsx:53` (`const paymentBypass = process.env.NEXT_PUBLIC_PAYMENT_BYPASS === 'yes'`).
- **Why critical:** (a) Next.js loads `.env.local` in **production builds too** — if the prod image is built on a machine carrying this file, every signup skips payment; (b) even when off, the gate is client-side: `NEXT_PUBLIC_*` values are inlined into the JS bundle, and the decision runs in the browser, so payment enforcement is only as strong as whatever the backend independently checks.
- **Fix:** delete the flag from `.env.local`; if a bypass is needed for testing, make it a **server-side** check (backend env, not `NEXT_PUBLIC_`), and verify the backend rejects unpaid signups regardless of the client path taken.

### C2 — HIGH (correctness) · `pm-portal-api.ts` sends **no Authorization header** — `configureAuth()` is never called
- **Evidence:** `src/lib/pm-portal-api.ts:383-401` — token source is module var `_sessionToken` (set only by exported `configureAuth`) with fallback `localStorage.getItem('pm_access_token')` (legacy, no longer written per the NextAuth migration). Repo-wide grep: **zero** callers of `configureAuth` outside the file itself. Runtime consumers exist: `src/app/dashboard/calendar/page.tsx:39` (`projectsApi`, `milestonesApi`), `src/app/dashboard/projects/[id]/draws-pay-apps/page.tsx:53` (`drawsApi`), plus rfis/change-orders/submittals/photos/milestones pages and `PhaseHierarchy`/`MilestoneSubphases` components.
- **Impact:** every `apiRequest()` (pm-portal-api.ts:403-446) goes out with only `Content-Type` — backend routes are `authenticate`-gated ⇒ 401s / empty pages, or silent reliance on a stale localStorage token. (Verify at runtime; the code path admits no authenticated case today.)
- **Fix:** delete the bespoke `apiRequest` and route pm-portal-api through `authedFetch` (or `fetchApi`) like every migrated client; kill the `pm_access_token` fallback.

### C3 — HIGH (duplication, the core ask) · **Nine fetch wrappers**, three of them still carrying the header-clobber bug that was already fixed once
- The recurring `fetchApi` header-clobber (memory: *fetchApi Header Clobber*) was fixed in `api.ts` (comment at `src/lib/api.ts:111-114`), but the same `{ headers: {...merged}, ...options }` ordering — where a caller-supplied `options.headers` **replaces** the merged object and drops `Authorization` — survives in:
  - `src/lib/pm-portal-api.ts:419-425`
  - `src/lib/reports-api.ts:49-55`
  - `src/lib/workspace-api.ts:19-25`
  - `src/lib/valuation-api.ts:165-172` (`fetchTypescriptApi`)
  Today's callers mostly pass only `method`/`body`, so these are landmines rather than live bugs — until someone posts with an explicit `Content-Type`, which is exactly how the original 401 incident happened.
- **Fix:** one canonical client (see HTTP-CLIENT MAP below) and delete the per-file wrappers.

### C4 — HIGH (performance) · `getSession()` fetched **per request** in six wrappers; two more keep separate 60 s caches
- **Evidence:** uncached `await getSession()` on every call: `esign-api.ts:25`, `reports-api.ts:43`, `unified-project-api.ts:22`, `workspace-api.ts:12`, `valuation-api.ts:159`, `realtime-api.ts:14` (+ per-upload dynamic import in `crm-api.ts:508-510`). Each `getSession()` is an HTTP round-trip to `/api/auth/session`. The valuation wizard (valuation-api, 3,521 LOC, dozens of calls per step) pays this tax on **every** request. Meanwhile `authed-fetch.ts:16-35` and `api.ts:35-54` each maintain their **own** 60 s token cache with separate `clearAuthTokenCache`/`clearApiTokenCache` logout hooks (both must be remembered).
- **Fix:** single shared token-cache module (the `authed-fetch.ts` one) used by all clients; one clear-on-logout entry point.

### C5 — HIGH (performance) · `export const dynamic = 'force-dynamic'` in the **root layout** disables static rendering for the entire app
- **Evidence:** `src/app/layout.tsx:7`. Every route — including the marketing pages, `/insights`, guides, the API-docs page — is re-rendered on every request. Combined with the remote-DB tax (memory: *Perf: Remote DB Tax*) this is a top-of-funnel latency multiplier.
- **Fix:** remove from the root layout; apply `force-dynamic` (or `revalidate`) per route-group — dashboard group only.

### C6 — HIGH (security+correctness) · `public/sw.js` caches **authenticated API JSON** in Cache Storage, network-first with unauthenticated background refresh
- **Evidence:** `public/sw.js:122-125` routes all `/api/*` GETs through `networkFirstStrategy`; `sw.js:176-179` writes responses for `CACHEABLE_API_ROUTES` (`/api/crm/contacts`, `/api/valuations`, `/api/projects`… lines 30-46) into `API_CACHE`; `sw.js:184-187` serves them back on any network failure.
  - Cached CRM contacts / valuations persist in browser Cache Storage after logout and are served to **whoever uses the browser next** while offline — cache keys don't vary on user/Authorization.
  - `refreshCachedData()` (`sw.js:358-371`, fired by `periodicsync`) re-fetches those routes **without any Authorization header** — guaranteed 401s (harmless but wasted; `response.ok` guard at 364 prevents cache poisoning).
  - `API_CACHE` has no TTL or size bound.
- **Fix:** stop caching `/api/*` bodies entirely (offline UX already has the IndexedDB layer in `offline-sync.ts`), or scope the cache per session and purge on logout; delete `refreshCachedData`.

### C7 — MEDIUM-HIGH (security) · Access JWT sent as a **query-string parameter** for SSE
- **Evidence:** `src/hooks/use-realtime.ts:249` — `url.searchParams.set('token', token)` on `/api/realtime/events`. Query strings land in Traefik/Cloudflare/backend access logs and browser history. (Known EventSource limitation, but there are alternatives.)
- **Fix:** short-lived one-time SSE ticket endpoint, or cookie-scoped SSE auth, or `fetch`-based streaming (ReadableStream) which allows headers.

### C8 — MEDIUM (correctness) · Proxy-contract violations: double-`v1` and unauthenticated replays
- `src/lib/xero-api.ts:8` — `BASE = '/api/v1/xero'`. Browser `/api/v1/xero/status` → rewrite (`next.config.js:64-67`) → backend `/api/v1/v1/xero/status`; backend mounts are `/api/v1` + `/api` with routes `/xero/*` (`backend/src/index.ts:688-692`, `backend/src/routes/xero.ts:50-173`) ⇒ **404 in prod**. Fix: `BASE = '/api/xero'`. (Same class as the admin-console 404 incident — memory: *API Proxy v1 Contract*.)
- `src/lib/offline-sync.ts:462,488` — sync replays `fetch('/api/budget/expenses')` / `'/api/projects/daily-logs'` with **no Authorization header** ⇒ queued offline expenses/daily-logs can never sync (401), and errors are swallowed into `failed++`.
- `src/hooks/use-realtime.ts:390-401,408-419` — `subscribe`/`unsubscribe` raw `fetch` with only `X-User-Id`/`X-Organization-Id` headers, no Bearer.
- `src/lib/realtime-api.ts:9` — `API_BASE = NEXT_PUBLIC_API_URL || 'http://localhost:4000'`; dev fallback lacks `/api/v1` entirely, and `RealtimeClient.connect()` (realtime-api.ts:124-136) opens the EventSource **without any token** (its own comment admits the workaround was never done) ⇒ 401 reconnect loop ×5 wherever `useRealtimeConnection` is mounted.

### C9 — MEDIUM (dead code, verified by import grep) · ≥1,670 LOC deletable
| File | LOC | Evidence |
|---|---|---|
| `src/lib/pm-api.ts` | 1,098 | 0 importers repo-wide; also self-broken (`BASE='/api'` + `fetchApi` prepends `/api` ⇒ `/api/api/rfis` ⇒ backend `/api/v1/api/rfis` = 404) — confidence **high** |
| `src/hooks/use-pm-queries.ts` | 445 | 0 importers; also builds `${'/api'}/api/v1/projects` = `/api/api/v1/…` (double-broken) — **high** |
| `src/lib/pdf-service.ts` | 127 | 0 importers — **high** |
| `src/components/realtime/PresenceIndicator.tsx`, `LiveActivityFeed.tsx` | (outside strict scope, found via realtime-api graph) | 0 importers — **high** |
| `src/lib/realtime-api.ts` `RealtimeClient`/`useRealtimeConnection`/`usePresence` portion | ~250 of 544 | importers use mostly `calendarApi`; the SSE client half duplicates `hooks/use-realtime.ts` and is broken (no token) — **medium** (verify per-symbol before deleting) |
| `src/lib/features.ts` | 47 | 1 importer (`dashboard/deals/[id]/page.tsx`); "simulated" flags read from localStorage, always-true defaults — **medium**, replace with rbac.ts gates |

### C10 — MEDIUM (security) · Missing browser security headers; secrets-adjacent NEXT_PUBLIC values
- `next.config.js:70-104` `headers()` sets only SW/manifest/Apple-Pay headers — **no CSP, no X-Frame-Options/frame-ancestors, no HSTS, no X-Content-Type-Options, no Referrer-Policy** (Referrer-Policy matters more given C7 puts tokens in URLs).
- `frontend/.env.local` / `.env.production`: `NEXT_PUBLIC_POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/<key>` — an **Alchemy API key inlined into the public bundle** (consumed at `src/lib/tenant/web3.ts:21`). Alchemy keys are billable; restrict by domain/allowlist or proxy RPC server-side. Mapbox `pk.` token and WalletConnect project id are public-by-design (OK, but URL-restrict the Mapbox token).
- `src/lib/esign-api.ts:29,34-38` — last-resort token from `localStorage` (`pm_access_token`/`token`/`auth_token`) plus an `X-User-Id` header taken from localStorage `pm_user_session`; if any backend path trusts `X-User-Id` for identity this is spoofable client input. Remove the fallback (the comment itself calls it legacy).
- `src/auth.ts:76-90,208,213` — `console.log` of login URL, email, response bodies (first 200 chars) and JWT-callback activity in production server logs. Gate on `NODE_ENV`.

### C11 — MEDIUM (duplication) · Formatters
- Two conflicting `formatDate` exports inside lib: `src/lib/utils.ts:54` (`en-GB`, "12 Jun 2026") vs `src/lib/dateFormat.ts:14` (dd/mm/yyyy, `—` fallback; the canonical Ghana one per the DateField work). Importing the wrong one is a one-keystroke autocomplete away; `dateFormat.ts` has only **1** importer while `utils.formatDate` is spread everywhere.
- `formatCurrency`: canonical in `utils.ts:28` + private copy in `lease-generator.ts:99` + **39 more local definitions** across `src/app`/`src/components` (grep `function formatCurrency|const formatCurrency =`). Consolidate onto `utils.ts` (or a new `format.ts`), add an ESLint `no-restricted-syntax` rule.

### C12 — LOW/MEDIUM (perf polish)
- `src/lib/realtime-api.ts:352-355` — `useRealtimeConnection` polls `isConnected()` on a **1-second** `setInterval` forever.
- `src/hooks/use-toast.ts` — toast state is **per-hook-instance** (`useState` inside `useToast`), no global store/Toaster: a toast fired in component A renders only if A itself maps `toasts`. 29 importers; several likely show nothing. Replace with the shadcn global-reducer version or sonner.
- `src/components/providers.tsx:52` — app-wide `staleTime: 30s` is aggressive for a data-heavy dashboard on a remote DB; `refetchOnWindowFocus:false` and `retry:1` are good. Consider 2–5 min default with per-query overrides (crm/use-analytics.ts already does 60–120 s).
- `src/app/layout.tsx:30` — `maximumScale: 1, userScalable: false` blocks pinch-zoom (accessibility).
- `providers.tsx:67-78` — PWAProvider/OfflineIndicator only mounted in prod is fine, but the dev branch still mounts RealtimeProvider twice-differently; harmless, just asymmetric.
- Heavy libs: OK overall — `html2canvas` is dynamically imported (`pdf-service.ts:47`, dead anyway); no pdf/chart/mapbox static imports in lib; `tenant/web3.ts` statically pulls **wagmi/viem** — confirm it's only imported by tenant payment pages (it is: tenant flow), else dynamic-import it.

---

## HTTP-CLIENT MAP (every fetch entry point in scope)

| # | Wrapper | File:lines | Base URL | Auth | Token caching | Error behavior | Clobber-safe? | Used by |
|---|---|---|---|---|---|---|---|---|
| 1 | `authedFetch` | `authed-fetch.ts:50-63` | caller-supplied (callers use `/api/...`) | NextAuth `getSession` → Bearer; never overwrites caller `Authorization` | **60 s module cache** | none — returns raw `Response` | ✅ (Headers API) | **126 files** (developer-api, xero-api, notification-api, service-team-api, tenant/api, contributions-api, projects-api download, PWAProvider, pages) |
| 2 | `fetchApi` / `fetchApiBlob` | `api.ts:95-137 / 67-93` | `NEXT_PUBLIC_API_URL \|\| 'http://localhost:4000/api/v1'` | same, own copy | **second, duplicate 60 s cache** | throws `Error(message)`; 204→undefined; FormData-aware | ✅ (fixed, documented at 111-114) | 48 files via domain clients: budget-, crm-, projects-, property-management-, publications-, team-, valuation-api |
| 3 | `esignFetch` | `esign-api.ts:43-68` | `NEXT_PUBLIC_API_URL \|\| localhost:4000/api/v1` + `/esign` | getSession **per call**, localStorage fallback, `X-User-Id` from localStorage | none | throws; PDF/octet-stream→Blob | ✅ (headers spread last) | e-sign pages, transmittals |
| 4 | `apiRequest` | `pm-portal-api.ts:403-446` | `NEXT_PUBLIC_API_URL \|\| localhost:4000/api/v1` | `configureAuth()` module token (**never set**) → legacy localStorage | n/a | throws; unwraps `{success,data}` | ❌ `...options` after `headers` | calendar, rfis, change-orders, submittals, photos, draws, milestones pages |
| 5 | `fetchApi` (private) | `reports-api.ts:31-72` | `NEXT_PUBLIC_API_URL \|\| ('/api'\|localhost)` | getSession **per call** | none | throws; 204→`{}` | ❌ same ordering | reports pages (2 importers) |
| 6 | `fetchWorkspaceApi` | `workspace-api.ts:17-31` | hardcoded `'/api/workspace'` ✅ contract-correct | getSession **per call** | none | throws `err.error` | ❌ same ordering | messenger (7 importers) |
| 7 | `fetchTypescriptApi` / `fetchPythonApi` | `valuation-api.ts:155-202 / 125-149` | TS: `NEXT_PUBLIC_API_URL \|\| '/api'` (+SSR branch); Py: `'/ml-api'` proxy | TS: getSession **per call**; **Python: no auth at all** | none | throws `[status] msg`; 404/land-value log-suppression | ❌ TS helper same ordering | 24 importers (whole valuation wizard) |
| 8 | `getAuthHeaders` + inline fetch | `unified-project-api.ts:19-28` + call sites | `NEXT_PUBLIC_API_URL \|\| localhost:4000/api/v1` | getSession **per call** | none | per-call ad hoc | per-call | 6 importers (client/PM portal views) |
| 9 | `getAuthHeaders` + inline fetch / `RealtimeClient` | `realtime-api.ts:11-20,103-218,411-544` | `NEXT_PUBLIC_API_URL \|\| 'http://localhost:4000'` (**no `/api/v1` fallback**) | calendarApi: per-call Bearer; SSE: **none** | none | throws `data.error` | per-call | schedule page, deals page, calendar components |
| — | `EventSource` + subscribe fetch | `use-realtime.ts:216-355,386-420` | `NEXT_PUBLIC_API_URL \|\| '/api'` | token **in query string**; subscribe fetch has no Bearer | getSession at connect | reconnect w/ backoff, visibility-aware (well done) | n/a | RealtimeProvider (app-wide) |
| — | `performSync` raw fetch | `offline-sync.ts:462,488` | hardcoded `/api/...` | **none** | n/a | count-and-continue | n/a | mobile capture components |
| — | `fetchRbacConfig` | `rbac.ts:112-152` | `NEXT_PUBLIC_API_URL \|\| ''` | optional token param | **5-min cache + inflight dedupe** (good pattern) | null on failure → fallback | ✅ | RBAC gates app-wide |
| — | raw `fetch(` in app/components | ~166 call sites (grep) | mixed | mixed | — | — | — | out of this audit's file scope; quantified for the consolidation case |

### Consolidation plan (recommended end state)
1. **Canonical transport:** `authedFetch` (already 126 importers, correct header semantics, only shared token cache). Add to it: the 401-retry-once-after-cache-bust nicety.
2. **Canonical JSON layer:** new `src/lib/http.ts` exporting `apiJson<T>(path, init?)` and `apiBlob(path, init?)` = `authedFetch('/api'+path)` + the error-normalization/204/FormData handling currently in `api.ts:95-137`. Enforce the proxy contract in one place (assert path does **not** start with `/api/v1` or `http`).
3. **Migrate** in order of risk: pm-portal-api (C2, broken today) → xero-api one-liner (C8) → reports/workspace/valuation TS helper (clobber landmines) → esign (drop localStorage fallback) → unified-project/realtime calendarApi. `api.ts`'s `fetchApi` becomes a re-export of `apiJson` until the 48 importers are mechanically swept.
4. **Delete** duplicate token cache in `api.ts`, `clearApiTokenCache` (keep one logout hook), the `realtime-api.ts` SSE half (keep `hooks/use-realtime.ts` as the only SSE stack, merging the two `RealtimeEventType` enums), and the dead files in C9.
5. **Python engine calls** (`fetchPythonApi`): decide auth story — today any browser can hit `/ml-api/*` unauthenticated through the proxy.

---

## FILE-BY-FILE

### src/lib (41)
| File | LOC | Verdict / notes |
|---|---|---|
| `analytics-resources.ts` | 595 | Static docs catalog for `/analytics/api` page. `ANALYTICS_API_BASE_URL`/`ANALYTICS_WS_URL` (l.21-30) default to prod host but are **display-only** (used in marketing docs snippets, not fetched) — OK. 4 importers. |
| `api.ts` | 1,459 | Home of `fetchApi`/`fetchApiBlob` + Data-Hub domain APIs (sources/spiders/ETL/contributions/economic). Duplicate token cache (l.35-54, see C4). Header-clobber fixed here (l.111-123). Keep as JSON layer donor. |
| `authed-fetch.ts` | 63 | Canonical transport. Clean. `TOKEN_CACHE_TTL=60s` (l.19). |
| `budget-api.ts` | 725 | `fetchApi`-based, `BUDGET_BASE='/budget'` ✅ contract-correct. 5 importers. Fine. |
| `contributions-api.ts` | 229 | Mixes `fetchApi` + `authedFetch` imports (l.8-9); `CONTRIBUTIONS_BASE='/api/data-hub/contributions'` ✅. Stray `console.log` of payloads (l.66). Minor. |
| `crm-api.ts` | 1,250 | `fetchApi`-based ✅. One inline fetch for FormData upload (l.507-517) with per-call dynamic `getSession` — migrate to `fetchApi` (it's FormData-aware now). 32 importers. |
| `dateFormat.ts` | 47 | Canonical Ghana dd/mm/yyyy formatter. **Only 1 importer** — the ~61-file sweep from memory is still pending; collides with `utils.formatDate` (C11). |
| `developer-api.ts` | 147 | Model citizen: `authedFetch`, `/api/developers` contract-correct, typed, documents the contract in its header. Use as migration template. |
| `esign-api.ts` | 218 | Own wrapper; localStorage token fallback + `X-User-Id` (C10); per-call getSession (C4). `createTemplate` FormData branch bypasses `esignFetch` (l.142-148) with `await res.text()` errors — inconsistent. |
| `esign-types.ts` | 200 | Types only (percent-based FieldPlacement per e-sign memory). 2 importers. Fine. |
| `features.ts` | 47 | Demo-grade feature flags read from localStorage `disabled_features` (l.32); always-true defaults; 1 importer. Fold into rbac.ts and delete (C9). |
| `guide-content.ts` | 58 | Markdown loader; layered `/api/guides` fallbacks incl. hardcoded `http://localhost:4000` dev branch (l.18) — acceptable, dev-only. |
| `guides.ts` | 178 | Static guide catalog + lucide icons. Fine. |
| `lease-generator.ts` | 1,000 | Pure HTML lease template generator (Rent Act 2020 etc.), no fetch. Private `formatCurrency` (l.99) dup. 1 importer — verify the lease flow still uses it before any cleanup. |
| `notification-api.ts` | 86 | `authedFetch`, `'/api'` base ✅. Clean. |
| `offline-sync.ts` | 586 | idb-backed offline store, solid schema; **sync replays lack auth** (l.462,488 — C8). |
| `pdf-service.ts` | 127 | **Dead** (0 importers). html2canvas iframe capture, single-page only. Delete (C9). |
| `pm-api.ts` | 1,098 | **Dead** (0 importers) and double-broken URL construction (`BASE='/api'` through `fetchApi`). Delete (C9). |
| `pm-portal-api.ts` | 1,323 | The unauthenticated client (C2) + clobber ordering (C3). `getDocumentBlob` (l.914-923) same dead token source. Types are still referenced widely — extract types, kill transport. |
| `projects-api.ts` | 2,118 | `fetchApi`-based ✅, `PROJECTS_BASE='/projects'`; one `authedFetch` blob download (l.2058). 26 importers. Healthy. |
| `property-management-api.ts` | 1,355 | `fetchApi`, `PM_BASE='/pm'` ✅. 31 importers. Healthy. |
| `publications-api.ts` | 389 | `fetchApi` ✅. 21 importers. Fine. |
| `rbac.ts` | 820 | Best-practice remote-config cache (5-min TTL + inflight dedupe, l.104-152) with hardcoded fallbacks. Uses bare `fetch` — would be nicer on authedFetch but takes explicit token for SSR. Fine. |
| `realtime-api.ts` | 544 | Split personality: broken tokenless `RealtimeClient` SSE (delete) + working per-call-auth `calendarApi` (migrate) + 1 s `useRealtimeConnection` poll + 2-min presence heartbeat. C8/C9/C12. |
| `realtime-provider.tsx` | 240 | Good: SSE gated to authenticated `/dashboard` routes (l.91-92), query-invalidation map. `useRealtimeEvents` joins eventTypes for deps (l.208) — OK. Keep. |
| `reports-api.ts` | 402 | Own wrapper (C3/C4). Otherwise clean typed CRUD. |
| `roleProfileConfig.ts` | 138 | Static role→profile-tabs map. Fine. |
| `sentry.ts` | 104 | Guarded init, sane sampling (20% traces / 10% replay), masks text. Fine. |
| `service-team-api.ts` | 156 | `authedFetch`; `API = NEXT_PUBLIC_API_URL || '/api/v1'` — fallback violates contract but prod env supplies `/api`; normalize to `'/api'`. |
| `team-api.ts` | 695 | `fetchApi`, `/team` + `/vendors` ✅. Fine. |
| `unified-project-api.ts` | 1,249 | Per-call getSession helper (C4); otherwise contract-OK via env. 6 importers. Migrate to canonical client. |
| `use-exchange-rates.ts` | 65 | Module-level 5-min FX cache + inflight dedupe — textbook. Keep. |
| `utils.ts` | 151 | `cn` + formatters + tier helpers. `formatDate` collision (C11). Keep as formatter home. |
| `valuation-api.ts` | 3,521 | Biggest client. Dual-backend routing documented; TS helper per-call getSession + clobber ordering (C3/C4); **Python calls unauthenticated** (l.125-149); error-log suppression heuristics (l.185-199) hide real failures containing "not found". 24 importers. Priority migration target. |
| `valuation-workflow.ts` | 72 | Clean single-source wizard step engine. Keep. |
| `workspace-api.ts` | 217 | Hardcoded `'/api/workspace'` ✅; per-call getSession + clobber ordering (C3/C4). |
| `xero-api.ts` | 45 | `authedFetch` but `BASE='/api/v1/xero'` ⇒ prod 404 (C8). One-line fix. |
| `schemas/crm.schemas.ts` | 94 | Zod deal/contact schemas. Fine. |
| `schemas/pm.schemas.ts` | 228 | Zod PM form schemas w/ usage docs. Fine. |
| `tenant/api.ts` | 1,279 | `authedFetch`-based ✅ with an over-defensive 3-branch `apiUrl()` normalizer (l.13-32) — collapses to one line once env is standardized. 16 importers. |
| `tenant/web3.ts` | 74 | wagmi/viem config; Alchemy key via NEXT_PUBLIC (C10); USDT/contract addresses env-driven with sane defaults. |

### src/hooks (13)
| File | LOC | Verdict |
|---|---|---|
| `use-pm-queries.ts` | 445 | **Dead** (0 importers) + double-broken URLs (`'/api'+'/api/v1/...'`). Delete (C9). |
| `use-realtime.ts` | 484 | The good SSE stack: backoff cap 30 s, visibility-aware suspend/resume, ref-stabilized handlers. Token-in-query (C7); subscribe fetch unauthenticated (C8). Keep, patch. |
| `use-toast.ts` | 42 | Per-instance toast state — likely invisible toasts (C12). Replace. |
| `useOfflineSync.ts` | 184 | Solid wrapper over offline-sync; auto-sync on reconnect. Inherits C8 (unauth replay). |
| `useServiceWorker.ts` | 324 | Registration + push helpers. **Overlaps PWAProvider** (both register `/sw.js` in prod — double registration is idempotent but two sources of truth); push subscribe posts to `/api/notifications/subscribe` **without auth** (l.266-270) vs PWAProvider's authed `/api/push/subscribe` (l.174-188) — different endpoints, one of them is wrong; reconcile. Used only by marketing/mobile components. |
| `crm/index.ts` | 7 | Barrel. Fine. |
| `crm/use-analytics.ts` | 165 | React-query with explicit 60–120 s staleTime — good. |
| `crm/use-companies.ts` | 88 | Standard query/mutation + key factory. Fine. |
| `crm/use-contacts.ts` | 105 | Same pattern. Fine. |
| `crm/use-deals.ts` | 227 | Same pattern. Fine. |
| `crm/use-drip-campaigns.ts` | 102 | Fine. |
| `crm/use-pipelines.ts` | 103 | Fine. |
| `crm/use-tasks-notes-agents.ts` | 205 | Fine. |

### Providers & PWA (4)
| File | LOC | Verdict |
|---|---|---|
| `providers/i18n-provider.tsx` | 75 | Hand-rolled en/fr (5.5 KB each, eagerly bundled — fine at this size); localStorage-persisted locale; safe fallback hook. OK. |
| `components/providers.tsx` | 86 | SessionProvider tuned to avoid session-poll storms (refetchInterval 0, no focus refetch — deliberate, documented); react-query defaults 30 s stale/retry 1 (C12); dark default pending theming sweep; devtools import (dev-only bundle in v5, OK). |
| `components/pwa/PWAProvider.tsx` | 304 | Dev-mode SW+cache cleanup (nice); prod registration; authed push subscribe. Overlap w/ useServiceWorker (above). |
| `components/pwa/index.ts` | 1 | Barrel. |

### Root infra (9)
| File | LOC | Verdict |
|---|---|---|
| `src/app/layout.tsx` | 52 | `force-dynamic` app-wide (C5); `userScalable:false` (C12); otherwise minimal. |
| `src/middleware.ts` | 119 | **Efficient**: fully synchronous, no fetch/crypto, cookie-presence only; env-driven tenant host; matcher excludes `_next`/static/api. Note: cookie-presence ≠ validity (an expired cookie passes middleware; page-level auth still catches it) — acceptable. |
| `next.config.js` | 119 | Rewrites implement the `/api`→`/api/v1` contract + `/ml-api` + `/api/public` + `/api/guides` carve-outs; legacy redirects consolidated. **No security headers** (C10). `ignoreDuringBuilds: true` for ESLint (tracked debt). |
| `tailwind.config.ts` | 90 | Standard shadcn token setup, class dark-mode. Fine. |
| `tsconfig.json` | 43 | `strict: true` ✅ (matches enterprise-gap work), excludes mobile tests + e2e. Fine. |
| `public/sw.js` | 371 | v3 caches; auth-route/SSE/_next exclusions learned from past incidents; but API-cache design is the C6 problem; push + background-sync handlers OK (sync replays stored headers, so those *do* carry auth, unlike offline-sync.ts's own path — two competing replay mechanisms). |
| `public/manifest.json` | 124 | `start_url:/dashboard`, standalone, icon set complete. Fine. |
| `src/auth.ts` | 399 | NextAuth v5: credentials/tenant/Keycloak/Google, proactive refresh 60 s before expiry for both token families, trustHost for the tenant subdomain. Verbose auth logging in prod (C10); 30-day JWT sessions (long; consider shorter with refresh). |

---

## COVERAGE LEDGER

| Area | Files | LOC | Read depth |
|---|---|---|---|
| `src/lib` top-level | 37 (35 .ts + realtime-provider.tsx + use-exchange-rates.ts counted once) | ~24,000 | Full read: authed-fetch, utils, dateFormat, features, sentry, esign-api, workspace-api, realtime-api, realtime-provider, use-exchange-rates, valuation-workflow, developer-api, pdf-service, guide-content, guides(head+static), tenant/web3, xero(sections), notification/service-team/contributions (wrapper sections + greps). Wrapper/auth/URL sections + exhaustive greps (`fetch(`, `getSession`, `localStorage`, BASE consts, `setInterval`, secrets): api.ts, crm-api, budget-api, pm-api, pm-portal-api, projects-api, property-management-api, publications-api, rbac, reports-api, team-api, unified-project-api, valuation-api, lease-generator, offline-sync, analytics-resources, esign-types(head) |
| `src/lib/schemas` | 2 | 322 | Heads + structure (pure zod) |
| `src/lib/tenant` | 2 | 1,353 | web3 full; api.ts wrapper + head (rest is typed endpoint list on authedFetch) |
| `src/hooks` | 13 | 2,462 | Full: use-realtime, useServiceWorker, useOfflineSync, use-toast, use-pm-queries(head+grep+dead-verified), crm/index, crm/use-contacts; pattern-verified + staleTime grep: remaining 5 crm hooks |
| Providers/PWA | 4 | 466 | Full |
| Root infra | 9 | 1,277 | Full (layout, middleware, next.config, tailwind, tsconfig, sw.js, manifest, auth.ts) |
| Cross-checks | — | — | `frontend/.env.local`/`.env.production`/`.env.marketplace` NEXT_PUBLIC values; `backend/src/index.ts` + `backend/src/routes/xero.ts` mounts; repo-wide importer greps for every dead/duplication claim; raw-fetch census of app/components (166 call sites, quantified only) |

**Not modified:** no source files were changed; this document is the only artifact.
