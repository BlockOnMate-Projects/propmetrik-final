# PropMetrik — Comprehensive Codebase Audit: Executive Summary

**Audited by:** Senior Staff Engineering review (17 parallel domain auditors, file-by-file)
**Date:** 2026-07-02
**Scope:** 100% of the monorepo — `backend/` (Express + TypeScript), `frontend/` (Next.js 14 App Router), the Python valuation engine, the Scrapy data-collection project, 247 SQL migrations, and build/dependency/security posture.
**Constraint honored:** No source code was modified. This is a pure, evidence-based assessment. Every finding cites `file:line`.

> ⚠️ **Read this first.** The audit surfaced **authentication/authorization defects that are individually sufficient for full account or admin takeover**. They are listed under "Critical Security" below and in the Phase 0 of the roadmap ([18-refactoring-roadmap.md](18-refactoring-roadmap.md)). Before writing any refactor, a human should verify and remediate those items — several are one-to-few-line fixes. Nothing else in this report matters if the front door is open.

---

## 1. How the report is organized

| File | Domain | Files | ~LOC |
|---|---|---|---|
| [01](01-backend-routes-a.md) | Backend routes A–L | 38 | 22.1k |
| [02](02-backend-routes-b.md) | Backend routes M–Z + mount order + tenant/team/rbac | ~53 | 30k+ |
| [03](03-backend-core.md) | Middleware, config, db, utils, jobs, bootstrap | 52 | — |
| [04](04-backend-services-pm.md) | Project-management services | 132 | 74k |
| [05](05-backend-services-datahub.md) | Data-hub services + Scrapy | 81 + 30py | 47.6k |
| [06](06-backend-services-valuation.md) | Valuation engine (TS + Python) | 36 + 48py | 45k |
| [07](07-backend-services-pm-crm-analytics.md) | PM / CRM / analytics services | 73 | — |
| [08](08-backend-shared-services.md) | Workspace, notifications, e-sign, ML | 79 | 35.5k |
| [09](09-database-migrations.md) | 247 migrations + schema/index review | 247 | — |
| [10](10-frontend-lib-infra.md) | lib/, hooks/, providers, next.config, sw.js | ~65 | — |
| [11](11-frontend-components-a.md) | Components: projects, crm, valuation, reports | ~116 | 37k+ |
| [12](12-frontend-components-b.md) | Components: ui, marketing, layout, workspace, rest | ~110 | — |
| [13](13-frontend-pages-projects-pm.md) | Pages: projects + property-management | 93 | 47k |
| [14](14-frontend-pages-valuations-deals-esign.md) | Pages: valuations + deals + e-sign | 68 | 41.6k |
| [15](15-frontend-pages-admin-analytics.md) | Pages: admin + analytics + misc dashboard | 93 | 39.2k |
| [16](16-frontend-pages-marketing-auth-portals.md) | Pages: marketing + auth + portals | 86 | 21.7k |
| [17](17-dependencies-build-security.md) | Dependencies, build config, secrets, tests | — | — |

Each report carries a **coverage ledger** listing every file it reviewed. See §7 for the aggregate coverage confirmation.

---

## 2. Scorecard (1 = critical concern, 10 = excellent)

| Dimension | Score | One-line justification |
|---|:---:|---|
| **Architecture** | 5 | Clean domain boundaries and a real Python engine, but a parallel `shared-services/` layer with bidirectional coupling, duplicate subsystems (2 e-sign stacks, 2 audit stacks, bidding×2), and a ~30k-LOC dead "modular refactor" tree. |
| **Maintainability** | 4 | Pervasive god files (income page 2,332 LOC; crypto admin 1,771; InvoiceBuilder 1,854), 27× copy-pasted query builders, quadruplicated tab components, ~4 currency formatters. |
| **Performance** | **3** | **The "extremely slow" complaint is real and has concrete, fixable causes** (§4). Remote DB + per-request query fan-out + client keystroke-refetch + no code-splitting + root `force-dynamic`. |
| **Security** | **3** | Multiple auth-bypass / IDOR / takeover paths (§3). This is the lowest score and the highest priority. |
| **Tech-debt / Complexity** | 4 | High duplication ratio, dead code in every layer, 86 TODO/FIXME, 167 stray `console.*` in backend. |
| **Testing** | **3** | 47 backend test files, **0 frontend tests**, no coverage gate, no frontend CI. |
| **Scalability** | 5 | Region-partitioned properties table and metering infra are good; but pool max 10, in-process WS/EventEmitter buses, and process-local caches limit horizontal scale. |
| **Data integrity** | 5 | Strong recent work (idempotent payments, strict-fail FX), undercut by float money math, 3 conflicting valuation weight tables, and hardcoded economics in the client. |

**Overall: 4/10 — a feature-rich, ambitious platform carrying serious security and performance debt that is very addressable because it is concentrated in a small number of shared chokepoints.**

The encouraging part: most of the worst issues are *systemic* (one bad pattern repeated), so a handful of well-chosen fixes at shared layers (auth middleware, one fetch client, one list-page hook, one query helper) cascade across hundreds of files.

---

## 3. Critical security findings (fix before anything else)

Each is independently serious. `file:line` is the auditor's evidence anchor — verify against current code before acting.

1. **Dev-auth bypass defaults ON in production.** `config/index.ts:34` defaults `NODE_ENV` → `'development'`; with the var unset, `auth.ts:297–395` logs *any* request (no/expired/garbage token) in as the **first super_admin**, and rate-limiting/authorize/virus-scan also fail-open. One unset env var = total compromise. *(Report 03)*
2. **`POST /auth/google` account takeover.** `routes/auth.ts:503`, mounted unauthenticated, trusts client-supplied `{email, googleId}` with **no Google token verification** and mints a valid JWT for any existing email. *(Report 01)*
3. **JWT_SECRET constant fallback.** `config:151` → `'change-this-in-production'`; `tryDecodeLocalJwt` (auth.ts:229) will accept attacker-minted super_admin tokens if the env var is missing. Env validation only warns. *(Report 03)*
4. **`AppError` prototype bug silently disables auth error handling.** `errorHandler.ts:25` runs `Object.setPrototypeOf(this, AppError.prototype)` in the **base** constructor, so `instanceof UnauthorizedError/ForbiddenError` is *always false* — auth guards that branch on it never fire, falling through to permissive paths. Root cause of the `pmk_`-key handling workaround. *(Report 03)*
5. **E-sign is cryptographically void.** `signingService.ts:39–41` hashes the **PDF URL string, not the PDF bytes** — the signature attests to nothing; `keyManagementService.ts:124–136` "encrypts" private keys with **XOR under a hardcoded `'dev-secret-change-in-prod'`**; timestamps are a self-signed in-memory mock. Wired into live valuation + lease signing. *(Report 08)*
6. **E-sign route auth bypass.** `routes/eSign.ts` mounted with `optionalAuth`; identity taken from `x-user-id`/`x-organization-id` headers, falling back to the *first org in the DB*; `DELETE /documents/:id` has **zero org scoping** — unauthenticated list/download/delete of signed legal documents. *(Report 01)*
7. **Cross-org IDOR in `team.ts` (×2).** The `router.param('id')` guard calls `next()` on zero rows instead of 404; downstream `removeTeamMember` / `updateMemberPermissions` / communication-log mutations are **unscoped by org** — any PM-write user edits/deletes another org's members and logs. One-line fix. *(Report 02)*
8. **`serviceTeam.ts` unscoped role UPDATE/DELETE.** `serviceTeam.ts:218–228, 287–297` filter only on service key + target user id, **no org scope** — a service_admin of org A can change roles / deactivate users in any org. *(Report 02)*
9. **Admin portal has no server-side RBAC.** `admin/layout.tsx:32–41` gates `/dashboard/admin/*` with only a client `useEffect` redirect; `middleware.ts` checks cookie *presence*, never role. Admin JS/HTML + data is served to any authenticated user before the redirect. *(Report 15)*
10. **Python valuation engine is unauthenticated and world-open.** `main.py:157–168` CORS `allow_origins=['*']` with credentials, binds `0.0.0.0:8001`, `/docs` exposed — **and the browser calls it directly** (`valuation-api.ts:31`), no auth header. *(Report 06)*
11. **`rbac.ts` admin gate missing `user_type='staff'`.** `rbac.ts:275–309` lets a customer-org user holding an `admin` role rewrite platform-wide authorization policies. *(Report 02)*
12. **SSRF via `GET /charts/preview`.** `charts.ts:237–245` concatenates a user-supplied `endpoint` into a server-side `fetch` with no allowlist, relaying forged identity headers. *(Report 01)*
13. **Signup org-slug takeover.** `auth.ts:102–110` `ON CONFLICT (slug) DO UPDATE ... RETURNING id` joins a self-service signup into an *existing* org as `firm_principal`. *(Report 01)*

**Secondary security:** payment webhook signature verification is opt-in / returns false when the secret is unset (`paystack/index.ts:298`, `nowPaymentsService.ts:447`); tenant-portal `nowpayments-status/:paymentId` has no ownership check (sequential-int IDOR); partner JWKS built from realm *name* not URL (all `/ingestion` partner auth 401s); token blacklist never written (logout doesn't revoke). *(Reports 08, 02, 03)*

**Good news:** **0 committed secrets.** `.gitignore` correctly covers env/keys/venv/models; only placeholder `.env.example` files are tracked. *(Report 17)*

---

## 4. Why the app is "extremely slow" — root causes (your stated top priority)

The slowness is **not** mysterious. It is the sum of four compounding, individually-fixable patterns, all amplified by the fact that local dev and prod both hit **one remote PostgreSQL** where each round-trip carries real latency.

### 4a. Backend: per-request query fan-out against the remote DB
- **Every authenticated request** runs 2–4 sequential uncached queries in middleware: `enrichUserFromDb` on every request, a per-request `platform_services` lookup, a duplicate user query in `authorize`, and a **blocking** `await logAuthDecision` audit INSERT. Pool max is **10** for the whole monolith. *(Report 03)*
- `requireTenantAuth` adds **3–4 more round-trips per tenant request** (session SELECT + `last_used_at` UPDATE + full profile), uncached. *(Report 02)*
- Dozens of handlers do sequential `await`s over **independent** queries that should be `Promise.all` (e.g. `projects/[id]` runs 3 serial batches of 10+ calls; profile/stats burn a leading round-trip to fetch an org id already on the auth context). *(Reports 01, 02, 13)*
- Redundant re-lookups: 6 tenant-portal handlers re-`SELECT organization_id` that they already hold in memory. *(Report 02)*

### 4b. Frontend: keystroke-triggered network storms
- Search inputs put `searchQuery` directly in the fetch dependency — **one remote request per character typed**, no debounce, no AbortController (stale responses can overwrite fresh). Confirmed in `CommunicationLog` (**3 calls/keystroke**), `VendorDirectory`, `DocumentManager`, admin `users`/`organizations`, and the pm-data tabs (`rfis`, `change-orders`, `submittals`). The fix pattern (debounce) already exists in `documents/page.tsx`. *(Reports 11, 13, 15)*
- Invalidate **and** `refetch()` on every mutation → double round-trips (`ProjectGantt`). *(Report 11)*

### 4c. Frontend: god components re-rendering on every keystroke
- Valuation method pages are single components with dozens of controlled inputs and no child extraction/memo: `income/page.tsx` = **2,332 LOC / 42 useState / 20 inline-onChange inputs**; cost/drc/residual/profits the same shape; `InvoiceBuilder` = 1,854 LOC rebuilding a full A4 preview per keypress; `AdjustmentGrid` = ~250 unmemoized controlled cells. Every keystroke re-renders the whole tree. `market/page.tsx` is the in-repo memoized reference to copy. *(Reports 11, 14)*

### 4d. Frontend: no code-splitting + no static rendering
- **`export const dynamic = 'force-dynamic'` at the ROOT `layout.tsx:6`** disables static prerender for all 46 public marketing/legal pages — every visit pays full server + remote-DB latency. Single biggest public-page lever. *(Report 16)*
- **Only 3 files in the entire frontend use `next/dynamic`.** `framer-motion` is statically imported in 63 files, `recharts` in 14, Konva/mapbox/pdf-lib eagerly loaded. Frontend `node_modules` = 707 MB; the shipped client bundle is far larger than it needs to be. *(Reports 13, 15, 16, 17)*
- 43/46 marketing pages are `'use client'` (the marketing layout itself is client via `usePathname`), so the whole public subtree hydrates unnecessarily. *(Report 16)*

**Net:** the cheapest high-impact wins are (1) make the auth/tenant middleware do **one cached** user resolve + fire-and-forget audits, (2) add a shared debounced list hook, (3) scope `force-dynamic` off the root, (4) `next/dynamic` the heavy libs, (5) split the top 10 god pages. None require schema changes.

---

## 5. Cross-cutting structural findings

**Duplication (the maintainability tax):**
- **~30k LOC dead "modular refactor" tree** in project-management — 16 subdirectories bulk-added in one commit, imported only by doc-comments; routes use the top-level monoliths, nothing imports the barrel. Delete candidate #1. *(Report 04)*
- **~4,300 LOC dead Python** (7 orphaned services incl. a fully-mocked `market_data`) + dead `onlyofficeService.ts` (446 LOC, hardcoded JWT secret). *(Report 06)*
- **27 monoliths** hand-roll the same `paramIndex` dynamic WHERE/SET builder; **240 `SELECT *`**. *(Report 04)*
- **pm-data tab quadruplets** (RFIs/Submittals/ChangeOrders/Milestones ~65–70% identical, `StatCard` pasted 4×); ~3,300 LOC of duplicated `[id]/{checklists,punch-lists,site-logs,procurement}` pages; 6+ deals list pages repeat the fetch/search/table shell. *(Reports 11, 13, 14)*
- **5 Konva floor-plan implementations**, 4 duplicated color palettes, 2 competing exported editors. *(Report 11)*
- **Duplicate subsystems:** 2 e-sign stacks, 2 audit-log stacks, bidding vs bid-management, duplicate Paystack/WhatsApp/geocoding clients, legacy PM `notificationService` parallel to canonical `notify()`. *(Reports 01, 08)*
- **~4 currency formatters, ~5 date formatters, multiple fetch wrappers** (authedFetch / fetchApi / per-feature api clients / raw fetch). Consolidate to one each. *(Reports 10, 11)*

**Hardcoded values that should be config/DB:**
- Valuation economics hardcoded in the **client**, some **falsely labeled "loaded from database"**: `AdjustmentGrid` 50-entry neighborhood premium table + discount tables (duplicated in `ListingAdjustmentPanel`); `income/page.tsx` MARKET_RATES/RISK_PREMIUMS/WACC constants; `MarketContextPanel` risk premiums presented as "derived"; `LaborCostsPanel` fabricated fallback rates. Contradicts the migrations 251–256 DB-config direction and risks front-end ↔ Python divergence. *(Reports 11, 14)*
- **3 conflicting method-weight tables** decide the reconciled valuation depending on code path (`valuationEngineService.ts:85` vs Python `config.py:93` vs `multi_method.py:87`). *(Report 06)*
- ~443 hardcoded colors in projects/PM pages alone; theming migration is ~31k colors deep and stalled. *(Reports 12, 13)*
- **24 + 15 + 5 + 3 files** with API-URL contract violations (`NEXT_PUBLIC_API_URL`/`localhost:4000`/manual `/api/v1`) across pages — several bake `localhost:4000` into live calls (prod-broken) or use cross-origin cookie auth (silent 401). *(Reports 13, 14, 15, 16)*

**Database/schema:** money stored as FLOAT in places (should be DECIMAL); relationships FK-by-convention with missing constraints; two numbering schemes (`NNN_` vs timestamp); index coverage gaps on hot filtered columns — see [09](09-database-migrations.md) for the missing-index table cross-referenced to the queries that need them.

**Build/tooling:** `eslint.ignoreDuringBuilds: true` (lint never blocks prod); no CSP/HSTS on the frontend origin; duplicate `bcrypt` + `bcryptjs`; 0 frontend tests + no frontend CI; Node engine drift (18/20/22, no `.nvmrc`). *(Report 17)*

---

## 6. What is genuinely good (keep these)

- **Workspace org-isolation** and the canonical `notify()` core are clean. *(Report 08)*
- **Recent money-path work**: idempotent payment confirmation, strict-fail FX (no silent fallbacks), dual-currency ledger. *(Reports 07, and prior task history)*
- **Region-partitioned `properties`**, metering infra, and the developer-portal dual-auth are solid foundations. *(Reports 09, 07)*
- **Reference implementations to copy exist in-repo**: `market/page.tsx` (memoized form), `properties/[id]` (server-component + client-island split), dashboard `page.tsx` (parallel `allSettled` + skeleton + tokens), `portfolio` (react-query + staleTime), `documents/page.tsx` (debounced search), analytics pages (contract-compliant `authedFetch`). The fixes are "make the rest look like these," not "invent something new."
- **0 committed secrets; correct `.gitignore`.** *(Report 17)*

---

## 7. Coverage confirmation

Every domain was reviewed with a per-file ledger inside its report. Aggregate:

- **Backend** — routes (reports 01–02, incl. tenant/team/serviceTeam/rbac/user-profile), core middleware/config/db/utils/jobs/bootstrap (03), and all service domains: project-management (04), data-hub incl. Scrapy (05), valuation TS+Python (06), PM/CRM/analytics (07), shared-services incl. workspace/notifications/e-sign/ML (08). 
- **Database** — all 247 migrations classified + schema/index review (09).
- **Frontend** — lib/hooks/providers/config (10), all component directories (11–12), and all app route pages: projects/PM (13), valuations/deals/e-sign (14), admin/analytics/misc dashboard (15), marketing/auth/portals (16).
- **Cross-cutting** — dependencies, build config, secrets, and test posture (17).

Gaps intentionally noted rather than skipped: the Scrapy `.venv` and ML model binaries are **on-disk local bloat but not git-tracked** (reconciled between reports 08 and 17 — 17's git-level check is authoritative: not committed). No source directory was left unaudited.

---

## 8. Bottom line & recommended sequence

The platform is **ambitious and largely functional**, but it is running with the **security posture of a prototype** and the **performance profile of an un-optimized one**, on top of **real, concentrated technical debt**. Because the worst problems are systemic patterns at shared layers, remediation is high-leverage.

Recommended order (full detail, effort, risk, and dependencies in [18-refactoring-roadmap.md](18-refactoring-roadmap.md)):

1. **Phase 0 — Security containment (days).** The 13 critical items in §3. Mostly small, surgical fixes. Do these before touching anything else.
2. **Phase 1 — Performance quick wins (1–2 weeks).** Cached auth middleware + fire-and-forget audits; shared debounced list hook; scope off root `force-dynamic`; `next/dynamic` the heavy libs; `Promise.all` the worst waterfalls. Directly targets the "extremely slow" complaint with low risk.
3. **Phase 2 — Dead-code & duplication removal (2–4 weeks).** Delete the ~30k-LOC dead PM tree and ~4,300 LOC dead Python; consolidate fetch clients/formatters/query builder; extract the list-page and valuation-method hooks; split the top 10 god files.
4. **Phase 3 — Correctness & config hardening (3–5 weeks).** Single source of truth for valuation weights/economics (DB, not client); DECIMAL money; missing indexes; DECIMAL/FK/schema fixes; webhook signature enforcement; e-sign real cryptography.
5. **Phase 4 — Structural & quality (ongoing).** shared-services boundary, theming-token sweep completion, frontend test suite + CI + coverage gate, CSP/HSTS, dependency dedupe.

> Reminder: per your instruction, **no code has been changed.** Say the word on which phase to start and I'll begin — Phase 0 security is the recommended first move.
