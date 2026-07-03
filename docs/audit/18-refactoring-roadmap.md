# PropMetrik — Prioritized Refactoring Roadmap

Companion to [00-executive-summary.md](00-executive-summary.md). Every item traces to a `file:line`-evidenced finding in reports [01](01-backend-routes-a.md)–[17](17-dependencies-build-security.md).

**Effort key:** S = <½ day · M = ½–2 days · L = 3–5 days · XL = 1–3 weeks
**Risk** = chance the change breaks something / needs careful verification.
**No code has been modified.** This is the plan to execute *after* you approve a phase.

**Sequencing principle:** each phase is safe to ship independently and leaves the app in a better state. Phase 0 is non-negotiably first — an open auth door makes every later improvement moot.

---

## Phase 0 — Security containment 🔴 (do first; ~2–4 days total)

These are mostly small, surgical changes with outsized impact. Verify each against current code, add a regression test, ship.

| # | Fix | Evidence | Effort | Risk | Impact |
|---|---|---|:--:|:--:|---|
| 0.1 | Invert dev-auth bypass: gate on explicit `AUTH_DEV_BYPASS=true`, never on `NODE_ENV` default; fail startup if unset in prod. | `config/index.ts:34`, `auth.ts:297–395` | S | Med | Closes total-compromise hole |
| 0.2 | Verify Google ID tokens server-side (google-auth-library); stop trusting client `{email, googleId}`. | `routes/auth.ts:503` | M | Med | Closes account takeover |
| 0.3 | Fail startup when `JWT_SECRET` is missing/default; remove the `'change-this-in-production'` fallback. | `config:151`, `auth.ts:229` | S | Low | Closes token forgery |
| 0.4 | Delete `Object.setPrototypeOf` in the **base** `AppError` ctor (ES2022 target makes it unnecessary); add `instanceof` regression test. | `errorHandler.ts:25` | S | Med | Restores all auth error branching |
| 0.5 | E-sign param guard → 404 on cross-org zero-rows; org-scope `removeTeamMember`/`updateMemberPermissions`/comm-log mutations. | `team.ts:196` + `teamService.ts:789,847,1578` | S | Low | Closes cross-org IDOR |
| 0.6 | Org-scope serviceTeam role UPDATE/DELETE (join to caller org). | `serviceTeam.ts:218,287` | S | Low | Closes cross-org privilege change |
| 0.7 | Enforce server-side RBAC on `/dashboard/admin/*` (middleware role check, not cookie presence; or server-component gate). | `admin/layout.tsx:32`, `middleware.ts:5,108` | M | Med | Stops admin surface leaking to any user |
| 0.8 | Add `user_type='staff'` to the rbac admin gate; use `.includes()` not `realmRoles[0]`. | `rbac.ts:275–309` | S | Low | Closes policy-rewrite escalation |
| 0.9 | Put the Python engine behind auth (shared secret / internal-only network) + tighten CORS off `*`; route browser calls through the Node backend, not directly. | `main.py:157`, `valuation-api.ts:31` | M | Med | Removes world-open compute + data surface |
| 0.10 | eSign routes: require real auth (drop `optionalAuth` + header identity); org-scope `DELETE /documents/:id`. | `routes/eSign.ts:71,2676` | M | Med | Stops unauth access to signed legal docs |
| 0.11 | Allowlist `charts/preview` endpoints (no user-supplied URL into fetch). | `charts.ts:237` | S | Low | Closes SSRF |
| 0.12 | Signup: stop `ON CONFLICT (slug) DO UPDATE` joining existing orgs; treat slug collision as a new-org disambiguation. | `auth.ts:102–110` | M | Med | Closes org-slug takeover |
| 0.13 | Enforce webhook signatures (fail closed when secret unset); add tenant-portal `nowpayments-status` ownership check. | `paystack/index.ts:298`, `nowPaymentsService.ts:447`, tenantPortal `:1122` | M | Med | Hardens money path |

**Deferred within security (schedule into Phase 3):** e-sign real cryptography (sign PDF bytes, real key encryption, real TSA) — see 3.7; it's larger than containment.

**Exit criteria:** a pen-test pass of the 13 items; regression tests for 0.1/0.3/0.4/0.5.

---

## Phase 1 — Performance quick wins 🟠 (1–2 weeks; directly targets "extremely slow")

High impact, low-to-medium risk. Ordered by (impact ÷ effort).

| # | Fix | Evidence | Effort | Risk | Impact |
|---|---|---|:--:|:--:|---|
| 1.1 | **One cached per-request user resolver**; make `enrichUserFromDb`/service-catalog/authorize share it; make `logAuthDecision` fire-and-forget (non-blocking). Raise pool max. | `auth.ts`, `serviceAccess:162`, `authorize:191`, report 03 §P1 | M | Med | Removes 2–4 blocking RTT from *every* request |
| 1.2 | Short-TTL tenant-session cache + throttled `last_used_at`; drop the 6 redundant `SELECT organization_id`. | `tenantAuthService.ts:437`, `tenantPortal.ts:606…` | M | Low | Removes 3–4 RTT/tenant request |
| 1.3 | Scope `force-dynamic` off the root layout (dashboard-only); let marketing/legal pages static-render. | `layout.tsx:6` | S | Med | Biggest public-page latency win |
| 1.4 | Shared `useDebouncedListQuery` hook (debounce + AbortController + pagination); adopt in the ~8 keystroke-refetch pages. | `CommunicationLog`, `VendorDirectory`, admin `users`/`orgs`, pm-data tabs; pattern in `documents/page.tsx` | M | Low | Kills per-keystroke request storms |
| 1.5 | `next/dynamic` (ssr:false) the heavy client libs: recharts, Konva, mapbox, pdf-lib; lazy-load framer-motion-heavy sections. | 63 framer + 14 recharts static imports; only 3 `next/dynamic` | M | Low | Large client-bundle + TTI reduction |
| 1.6 | `Promise.all` the worst waterfalls. | `projects/[id]:958`, `[id]/logs:825`, profile/stats leading RTT, bid-management detail, dataHub `/quality/stats` | M | Low | Cuts detail-page load 2–3× |
| 1.7 | Stop invalidate+refetch double round-trips; invalidate only. | `ProjectGantt.tsx:316–367` | S | Low | Halves mutation latency |
| 1.8 | Add the missing hot-path indexes from report 09's table. | [09](09-database-migrations.md) missing-index table | M | Low | Speeds hottest list/filter queries |

**Exit criteria:** measure p50/p95 on dashboard landing, a project detail page, and a valuation method page before/after. Target: dashboard interactive < 2s on a warm cache.

---

## Phase 2 — Dead-code & duplication removal 🟡 (2–4 weeks; shrinks the surface)

Lower risk than it looks because most targets are provably unimported. Do the deletions first (they make everything else smaller), then the consolidations.

| # | Fix | Evidence | Effort | Risk | Impact |
|---|---|---|:--:|:--:|---|
| 2.1 | Delete the ~30k-LOC dead PM "modular refactor" tree (verify zero importers first). | report 04 | M | Low | −30k LOC, −42% of PM domain |
| 2.2 | Delete ~4,300 LOC dead Python services + `onlyofficeService.ts` (446 LOC, hardcoded JWT). | report 06 | M | Low | −~4.7k LOC, removes a hardcoded secret |
| 2.3 | Delete confirmed dead backend modules (compression, requireSubscription, userType, tierGuard ~800 LOC) — **note:** tierGuard being dead means tier gating is unenforced; decide enforce-or-remove. | report 03 | M | Med | −800 LOC + closes a policy gap |
| 2.4 | Remove dead frontend pages (contractor-portal mock placeholder, orphan `marketplace/error.tsx`) and unused components (dead InstallPrompt, motion visuals). | reports 16, 12 | S | Low | Less confusion, smaller bundle |
| 2.5 | Consolidate to **one** HTTP client (canonical `authedFetch` via `/api` proxy); codemod the 47 API-URL contract violations across pages. | reports 10, 13, 14, 15, 16 | L | Med | Fixes prod-broken `localhost:4000` calls + one auth path |
| 2.6 | One `lib/format` (currency×~4, date×~5, file-size×3, trend-indicator×3). | reports 11, 14 | M | Low | Removes drift/inconsistency bugs |
| 2.7 | Extract `useCrmList()` (deals) and `useValuationMethod()` (load→hydrate→python→save) shared hooks. | reports 13, 14 | L | Med | −thousands of LOC, one place to optimize |
| 2.8 | Config-driven `<PmDataTab>` shell + shared `StatCard`; collapse the RFI/Submittal/ChangeOrder/Milestone quadruplets and the `[id]/{checklists,punch-lists,site-logs,procurement}` copies. | reports 11, 13 | L | Med | −~4.5k LOC |
| 2.9 | Extract the 27× `paramIndex` WHERE/SET builder into one query helper; sweep 240 `SELECT *`. | report 04 | L | Med | Consistency + smaller attack surface |
| 2.10 | Collapse Konva floor-plan family to 1 editor + 1 read-only renderer + 1 palette. | report 11 | L | Med | −~2k LOC in the heaviest components |
| 2.11 | Retire one of each duplicate subsystem (e-sign ×2, audit ×2, bidding ×2, Paystack/WhatsApp/geocoding clients, legacy notificationService). | reports 01, 08 | XL | Med | Major architectural simplification |

**Exit criteria:** `tsc` = 0 both projects; every deleted module confirmed unimported; LOC delta reported.

---

## Phase 3 — Correctness & config hardening 🟢 (3–5 weeks)

| # | Fix | Evidence | Effort | Risk | Impact |
|---|---|---|:--:|:--:|---|
| 3.1 | **Single source of truth for valuation weights** — one DB-config table; delete the 2 conflicting code tables. | `valuationEngineService.ts:85`, `config.py:93`, `multi_method.py:87` | M | High | Fixes value-depends-on-code-path bug |
| 3.2 | Move client-side valuation economics to DB/backend (neighborhood premiums, discount tables, MARKET_RATES/RISK_PREMIUMS/WACC, labor fallbacks); remove the "loaded from database" lies. | reports 11, 14 | L | High | Ends front-end ↔ engine divergence |
| 3.3 | Money math → DECIMAL end-to-end (DB columns + JS money handling); remove float arithmetic on currency. | reports 08, 09 | L | High | Prevents rounding drift in ledgers |
| 3.4 | Schema hardening: add missing FK constraints, NOT NULL on critical columns, standardize id-gen + migration numbering; updated_at triggers. | report 09 | XL | Med | Integrity + future-proofing |
| 3.5 | Fix partner JWKS (realm URL not name) so `/ingestion` partner auth works; implement token blacklist on logout. | report 03 | M | Low | Restores broken auth + real logout |
| 3.6 | Fix the region taxonomy mismatch (5-region legacy schema/validators vs 16 real regions) that silently defaults unknown regions to Accra's multiplier. | `_shared.py:87`, `ghanaRegionSchema`, reports 03, 06 | M | Med | Correct regional valuation |
| 3.7 | **Real e-sign cryptography**: hash PDF bytes not the URL, real key encryption (KMS/asymmetric), real RFC-3161 TSA. | `signingService.ts:39`, `keyManagementService.ts:124` | XL | High | Makes signatures legally meaningful |
| 3.8 | Fix data-integrity bugs surfaced in pages/components (blob-URL leak, NaN%/div-by-zero in PaymentSchedule, BudgetDonut legend/slice color mismatch, `organizationId=''` TODO to TeamManager, similarity-score 0–1 vs 0–100 unit clash). | reports 11, 13 | M | Low | Visible correctness fixes |

**Exit criteria:** regression fixtures locking the reconciled valuation number per method; ledger DECIMAL migration verified against a known payment set.

---

## Phase 4 — Structural, quality & scalability 🔵 (ongoing / nice-to-have)

| # | Fix | Evidence | Effort | Risk | Impact |
|---|---|---|:--:|:--:|---|
| 4.1 | Resolve the `shared-services/` boundary: collapse into one-way `src/platform/`; kill bidirectional coupling (129 in / 20+ out). | report 08 | XL | High | Real layering, no cycles |
| 4.2 | Extract a `BaseWsServer` (heartbeat/auth/lifecycle) shared by workspace + analytics stream; add `shutdown()` + bound the in-memory maps (leak fix). | report 08 | L | Med | Stops unbounded-map leak on long-lived servers |
| 4.3 | Frontend test suite + frontend CI + coverage gate (currently 0 tests). Start with the money-path and auth-gate components. | report 17 | XL | Low | Safety net for all future refactors |
| 4.4 | Add CSP/HSTS/frame/nosniff headers on the frontend origin; turn `eslint.ignoreDuringBuilds` off (fix the lint debt behind it). | `next.config.js:17,70` | M | Med | Baseline web hardening |
| 4.5 | Finish the theming-token sweep (~31k hardcoded colors; ~443 in projects/PM pages alone) to unlock light mode + shrink class churn. | reports 12, 13 | XL | Low | Completes a half-done migration |
| 4.6 | Dependency dedupe (`bcrypt`+`bcryptjs`→one), pin critical ranges, `.nvmrc` + consistent Node engines, split dependencies/devDependencies. | report 17 | M | Low | Reproducible builds |
| 4.7 | Replace `window.location.reload()` "retry/refresh" patterns with real refetch; remove shipped `console.log`; standardize the 167 backend `console.*` to the pino logger. | reports 11, 03, 17 | M | Low | UX + observability polish |
| 4.8 | Scalability: raise/parametrize the DB pool; evaluate moving process-local caches + in-process WS/EventEmitter buses to a shared store when multi-instance. | reports 03, 08 | L | Med | Enables horizontal scale |

---

## Suggested cadence

- **Week 1:** Phase 0 in full (security). Ship behind a verification pass.
- **Weeks 2–3:** Phase 1 (performance). Measure before/after — this is what the user feels.
- **Weeks 4–7:** Phase 2 (delete + consolidate). Big LOC reduction, momentum.
- **Weeks 8–12:** Phase 3 (correctness/config). The valuation-integrity and money items.
- **Ongoing:** Phase 4, interleaved (tests especially should start early as a safety net).

**Dependencies between phases:** Phase 1.1/1.2 (auth caching) should land before Phase 2.5 (fetch-client consolidation) so the client change targets the already-fast path. Phase 4.3 (tests) ideally *starts* during Phase 0 so later refactors have coverage. Everything else is independent.

> Nothing here is started. Tell me which phase to open — **Phase 0 (security) is the recommended first move** — and I'll begin implementation with tests and verification, one reviewed change at a time.
