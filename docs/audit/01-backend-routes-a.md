# Audit 01 — backend/src/routes (a–l)

**Auditor:** Senior Staff Engineer file-by-file review · **Date:** 2026-07-02
**Scope:** Every `.ts` file in `backend/src/routes/` whose filename starts with a–l (case-insensitive). Directories (`crm/`, `pdfSection/`) excluded per scope (not `.ts` files at this level).

## 1. Scope

- **Files in scope:** 38
- **Total LOC:** 22,125
- **Context:** routes are mounted in `backend/src/index.ts` with auth applied at mount time; DB is a remote prod Postgres (high per-round-trip latency), so query-count reduction is weighted heavily. Double-mounting `/api/v1` + `/api` is by design and NOT flagged.

## 2. Domain scores (1–10)

| Dimension | Score | Justification |
|---|---|---|
| Readability | 6 | Newer files (developerPortal, ingestion, analyticsFoundation) are well-commented and structured; older CRUD files are dense one-liner handlers but predictable. |
| Maintainability | 5 | Heavy copy-paste (dynamic-UPDATE builder duplicated ~20×, `getUserContext` ×4, `getDefaultOrgId` ×2) and *parallel duplicate subsystems* (bidding vs bid-management, two e-sign stacks, two audit-log stacks). |
| Performance | 5 | Pervasive `COUNT(*) FROM (query)` double round-trips, sequential awaits and N+1 loops against a remote DB; newer files do use `Promise.all` well. |
| Security | 3 | Multiple **critical** auth bypasses (eSign header-identity under `optionalAuth`, unauthenticated `/auth/google` token minting, signup org-slug takeover), plus widespread client-supplied org IDs and spoofable actor identity. |
| Complexity | 5 | Three god files (eSign 3,040 / dataHub 2,508 / admin 2,228 LOC) and 100–500-line handlers; the other 30+ files are small and single-purpose. |

## 3. Top findings (by priority)

### CRITICAL

**C1. `POST /auth/google` mints a session for any email — full account takeover**
- `auth.ts:503-556` (mounted with **no auth**: `index.ts:522`)
- Evidence: handler trusts client-supplied `{ email, googleId }` — there is no verification of a Google ID token. For an existing user it sets `google_id` (`auth.ts:542-547`) and returns a signed platform JWT (`auth.ts:609-622`).
- Why it matters: anyone can POST `{"email":"victim@x.com","googleId":"x"}` and receive a valid JWT for the victim's account.
- Fix: require and verify a Google `id_token` server-side (`google-auth-library` `verifyIdToken`), derive email/sub from the verified token; alternatively restrict the endpoint to an internal shared secret from the NextAuth server.

**C2. E-sign surface trusts headers + falls back to the first org in the DB, under `optionalAuth`**
- `eSign.ts:71-99` (`getUserId` falls back to `x-user-id` header; `getOrganizationId` reads **only** `x-organization-id` header), `eSign.ts:2676-2679` (`getDefaultOrgId()` = `SELECT id FROM organizations LIMIT 1`), mount: `index.ts:757-758` (`optionalAuth`).
- Evidence: `GET /envelopes` (1872), `GET/DELETE /envelopes/:id` (1897, 1947), `GET /envelopes/:id/download` (2282), template CRUD (1363-1537) all resolve org as `header || firstOrgInDb`. `DELETE /documents/:id` (2799-2805) and `GET /documents/:id` (2779) have **no org scoping at all**. `POST /envelopes/:id/resend-completed` (2270-2273) has no auth/ownership check and triggers PDF regeneration + email blast to all signers for any envelope id.
- Why it matters: an unauthenticated caller can list, download, void, and delete signed legal documents of the first organization (or any org whose UUID they set in a header), and spam signers.
- Fix: mount eSign management routes behind `authenticate`; keep only the token-based `/sign-envelope/:token*` and `/external/:token*` paths public; derive org from `req.user`, delete `getDefaultOrgId()` and the header fallbacks.

**C3. Signup org-slug collision joins a new user into an EXISTING org as `firm_principal`**
- `auth.ts:102-110` + `auth.ts:118`
- Evidence: `INSERT INTO organizations ... ON CONFLICT (slug) DO UPDATE SET updated_at = NOW() RETURNING id` — on a slug collision this **returns the existing org's id**, and the new self-service user is created with `organization_id = <existing org>` and role `firm_principal` (`auth.ts:118-131`).
- Why it matters: tenant takeover — signing up with a victim company's name grants principal membership in the victim's org.
- Fix: `ON CONFLICT DO NOTHING` + explicit conflict check → 409, or generate a unique slug suffix; never attach a self-service signup to a pre-existing org.

### HIGH

**H1. `GET /charts/preview` — SSRF + header-forged identity relay**
- `charts.ts:229-252`
- Evidence: fetches `` `${apiBase}${endpoint}` `` where `endpoint` is raw user input (no allowlist against `CHART_CATALOG`), and forwards attacker-controlled `x-user-id` / `x-organization-id` headers (242-243). `endpoint = "@evil.com/x"` makes the URL `http://localhost:4000@evil.com/x` → request to attacker host; any internal path is also reachable with a forged org header.
- Fix: validate `endpoint` against the `CHART_CATALOG` endpoints (charts.ts:15-206) and call the service layer directly instead of self-HTTP.

**H2. budget.ts — client-supplied org filters, spoofable actor identity, and shadowed routes**
- Client org: `budget.ts:426, 817, 932` (`organizationId` read from `req.query`, not `getAuthOrgId`) — a caller can list any org's invoices/expenses/overdue if the service doesn't re-scope. Body org on writes: 176, 262, 319.
- Actor spoof: `(req as any).user?.id || req.body.<xxx>By` at 177, 344, 590, 613, 636, 865, 1071, 1125 — approval/audit identity can be set by the client.
- Route shadowing (functional bug): `GET /invoices/overdue` (815) and `GET /expenses/nearby` (1174) are registered AFTER `GET /invoices/:id` (460) and `GET /expenses/:id` (969) — Express matches `:id='overdue'|'nearby'` first, so both endpoints are unreachable (UUID-param validation makes them 400).
- Fix: always derive org/user from auth context; move literal-path routes above `:id` routes.

**H3. checklists.ts — org scoping is entirely client-controlled**
- `checklists.ts:26, 37, 53, 294, 515` (`organizationId` from `req.query`/`req.body`), actor from `x-user-id` header or body at 108, 122, 355, 369, 383, 397.
- Why it matters: cross-org read/write of QC templates and inspection instances; template/section/item and instance routes (70-273, 317-427) also operate by bare id with no org check.
- Fix: use `getAuthOrgId`/`getAuthUserId` from `pmAuth` like sibling PM routers (issues.ts does this correctly).

**H4. auth-integrations.ts — unsigned OAuth `state` + dead auth wiring**
- `auth-integrations.ts:32-35` builds `state = base64({userId})`, `63-69` decodes it **without signature/nonce verification** in the public callback → attacker can bind their Google tokens to any userId (login-CSRF / token-injection).
- Also, the router is mounted with no `authenticate` (`index.ts:523`) yet `/google/authorize`, `/disconnect`, `/status` require `req.user` (25-28, 102-105, 127-130) → they always 401; the feature is unreachable as wired.
- Fix: HMAC-sign the state (+ expiry), verify on callback; mount authorize/disconnect/status behind `authenticate`.

**H5. dataHub.ts — platform-wide mutations with no admin gate ("TODO: add auth" shipped)**
- `dataHub.ts:155-157, 520-522, 711-713, 739-740, 1276-1284, 1290-1298, 1364, 1397, 1504, 1722-1762` — creating/deleting data sources, approving/rejecting contributions (with body-supplied `reviewer_id`), seeding economic data, starting/stopping the global scheduler, and PUT `/settings` (483) are all reachable by ANY customer with `data_hub` service access (mount `index.ts:204`). These are platform-global resources, not org-scoped.
- Also `dataHub.ts:1516` returns `error.stack` to the client.
- Fix: add `requireAdmin` (or platform-staff check) on mutating/global endpoints; take actor identity from `req.user`.

**H6. bid-management.ts — connection-pool hold + sequential I/O storms in hot handlers**
- `GET /bid-requests/:id` runs 5 sequential queries (347-356) then presigns attachments in nested sequential loops (361-386) — on the remote DB this is ~10+ serial round-trips per view. Use `Promise.all`.
- `POST /:id/award` checks out a pool client at 826, COMMITs at 850, then sends award/rejection emails (859-893) **while still holding the client** (released in `finally` at 903) — SMTP latency starves the pool.
- Dead-but-dangerous: `countQ` at 319 interpolates `project_id` into SQL (`'${project_id}'`) — the variable is unused (the parameterized count on 320 is used), but it's a template-literal-SQL landmine; delete it.
- Publish/invite loops are sequential per vendor (486-511, 615-630).

**H7. contributions.ts — `POST /credits/spend` leaks open transactions + double-spend race**
- Early `return`s at `contributions.ts:441-443, 453-455, 461-465, 468-474` exit after `BEGIN` (433) without ROLLBACK; `client.release()` returns a connection **idle-in-transaction** to the pool (pg does not auto-rollback on release) — subsequent queries on that connection inherit the open tx.
- The balance check (468) → deduct (477) has no `FOR UPDATE` lock → concurrent spends can both pass.
- Fix: `try { BEGIN ... } finally { ROLLBACK-if-open; release }` pattern, and `SELECT ... FOR UPDATE` on the profile row.

**H8. eSign/dataHub/admin sequential aggregate scans (remote-DB tax)**
- `dataHub.ts:2181-2262` (`/quality/stats`): 6 sequential full-table aggregate scans over `properties` — wrap in `Promise.all` (siblings `/catalog/coverage` 55-74 already do).
- `auth.ts:676-769` (`GET /auth/me`): 3 sequential queries (user, org, services) on the hottest auth path — fold into one JOIN or parallelize; same shape in login (424-460) and refresh (889-904).
- `analytics.ts:203-275` (`/export/excel` with no `type`): 4 sequential service calls; `/export/pdf` 307-308: 2 sequential.

### MEDIUM

**M1. Sequence-number races (duplicate business numbers under concurrency).** `COUNT(*)+1` numbering: `bidding.ts:56-57` (BP-), `closeout.ts:131-132` (WAR-), `closeout.ts:189-190` (CLM-), `issues.ts:69-70` (ISS-), `issues.ts:188-189` (RSK-), `eSign.ts:2568-2570` (CERT sequence). Use a DB sequence or `INSERT ... ON CONFLICT` retry.

**M2. express-validator chains that never run.** `construction.ts:18-23, 46-51` and `integrations.ts` `/mobile-money/webhooks` declare validator arrays but `construction.ts` never calls `validationResult` → validation is a no-op (integrations.ts does have `handleValidationErrors`; construction.ts does not). Same in `contributions.ts:104-114` (`/prompts` skips the check).

**M3. Broken/misleading endpoints.**
- `integrations.ts:102-123` — the mobile-money webhook is documented "unauthenticated, signature-verified", but the router is mounted behind `authenticate + requireAdmin` (`index.ts:556`), so provider callbacks 401; the signature check is a TODO. Dead route, High confidence.
- `app-integrations.ts:96-125` — "test connection" and "sync" endpoints write `status='success'` logs and bump `last_sync_at` **without doing anything** — fake green status.
- `budget.ts` shadowed routes (see H2).

**M4. IDOR via missing org scoping on child/id-only routes** (all behind authenticate, so cross-tenant not anonymous):
- `calendar.ts:112-126, 170-229, 303-316` — event/availability by bare id, no org filter passed.
- `drawings.ts:181-218, 221-228, 261-289` — revision create/read/review by bare drawing/revision id, no org check (drawing routes at 87-174 DO check).
- `changeOrders.ts:358-404` — line-item update/delete by `itemId` with no `enforceChildProjectAccess`.
- `equipment.ts:121` — `UPDATE equipment SET current_project_id=$1 WHERE id=$2` without `organization_id` → cross-org equipment hijack via arbitrary `equipment_id`; also the assign/return pairs (115-144) are non-transactional.
- `governance.ts:87, 238, 264, 336, 362` — framework/phase/template reads+writes by bare id, org never checked after list.
- `enterprise.ts:224-234` — `getApprovalRequest(id)` without orgId.
- `kobbyAI.ts:42-75` — `/context/:entityType/:entityId` has no membership check (unlike `/query`, 107-110).
- `ingestion.ts:179-311` — `/submissions/:id/presign` and `/complete` never verify the partner owns the submission (the GET at 331 does).

**M5. Spoofable actor identity via headers/body (audit-integrity).** `analytics.ts:21-22` and `autopilot.ts:24-25` (`x-user-id`/`x-organization-id` fallback — autopilot is admin-mounted so lower risk; analytics is reachable with API keys), `analyticsFoundation.ts:401` (acknowledge by `x-user-id`), `checklists.ts` (H3), `dataHub.ts` reviewer/contributor ids from body, `changeOrders.ts:237-246` org from body → project → **`getDefaultOrgId()` = first org in DB** (61-65) — same dangerous fallback as eSign.

**M6. analyticsFoundation.ts — mutating/compute endpoints without role gating.** `POST /construction/compute` (140), `POST /hai/compute-and-store` (287), alert-rule create/delete (459, 505), `/snapshots/recompute` (750), `/infrastructure/recompute` (646), `/composites/recompute` (709) are all reachable by any analytics-entitled subscriber (mount `index.ts:540`), letting a customer overwrite platform-wide published index snapshots. Gate on staff/admin.

**M7. eSign test endpoints in production.** `eSign.ts:1023-1030, 1143-1214, 1222-1327` — `/test/create-pdf`, `/test/full-pdf`, `/test/certificate` do CPU-heavy PDF generation under `optionalAuth` → DoS lever; remove or admin-gate.

**M8. drawings.ts stores expiring presigned URLs in the DB.** `drawings.ts:124, 199` persist `getPresignedDownloadUrl()` output into `drawing_revisions.file_url` — the link dies after expiry (the `/download` route at 292-317 regenerates correctly). Store only `file_key`.

**M9. Pagination count bugs.** `bidding.ts:29` count ignores status/trade/search filters; `drawings.ts:72-73` count ignores discipline/search; `ingestion.ts:412-414` filters AFTER pagination (page shorter than limit, totals wrong).

**M10. admin.ts assorted.**
- `require()` inside handlers ×10 (`admin.ts:1094, 1113, 1123, 1134, 1172, 1184, 1214, 1239, 1250, 1268, 1278, 1289, 1306, 1325`) while `nowPaymentsService` is ALSO imported at top (line 17) — inconsistent, hides deps.
- `/crypto/fee-calculator` (2151-2220) reimplements the fee-mode math that `feeEngine` owns — drift risk with real billing.
- Catch-all error handler (2223-2226) flattens every error to 500, losing status codes.
- `/users`, `/organizations` hardcode `LIMIT 200` with no offset (60, 86); org-delete loops `isSuperAdmin` per member + sequential Keycloak deletes (493-497, 527).
- Interval interpolation at 590-591, 626-627, 1513-1556 is whitelist-safe (`periodInterval`/`intervalMap`) — not injectable, but the pattern invites copy-paste misuse (see audit-log.ts).

**M11. audit-log.ts.** `since` interpolation (43-50) is `parseInt`-guarded but `days=abc` → `INTERVAL 'NaN days'` → SQL error; `SELECT *` on list/export (18, 69); no clamp on `limit` (a caller can pull the whole table via `limit=10000000`); stats runs 4 parallel + 1 sequential count (50) — fold into the `Promise.all`. Note the domain duplicate: this file queries `audit_log` (per-org SOC 2) while admin.ts queries `audit_logs` (platform) — two audit systems with near-identical CSV export code (audit-log.ts:76-82 vs admin.ts:203-227).

**M12. bid-management.ts vendor-email HTML injection.** Vendor-controlled `question`, `vendor_name` etc. interpolated unescaped into HTML emails (`bid-management.ts:161-261`, e.g. 226-227 renders a public vendor's question to other vendors/PM). Escape interpolations.

**M13. Invitation tokens never expire (bid portal).** `bid-management.ts:990-1078` — `bid_invitations.token` grants document access forever; no expiry column checked. Add expiry / revoke-on-award.

### LOW

- **L1.** `analytics.ts:12` imports `fmtGHS` unused (dead import, High confidence); `contributions.ts:15` imports `pythonClient` unused, `:13` `ContributionPrompt` unused (High confidence).
- **L2.** `dataHub.ts:490-493` — duplicate registration of `GET /quality/profiles` (identical to 433-436); second never matches (dead, High confidence). Mid-file imports at 1525, 1698, 1802.
- **L3.** `docs.ts:67-127` — hand-rolled JSON→YAML converter (~60 LOC) instead of `js-yaml`; edge-case-prone dead weight.
- **L4.** Hardcoded catalogs-as-code: `app-integrations.ts:208-226` (marketplace), `charts.ts:15-206` (chart catalog), `kobbyAI.ts:161-198` (suggestions), `commercialization.ts:302-440` (API catalog) — fine functionally, flagged as config candidates.
- **L5.** `floor-plan-design.ts` — Phase-1 scaffolding: both core POSTs return 501 (97-105, 263-271); file is ~70% stubs. `governance.ts` — 5 endpoints return 501 (209-223, 285-321, 383-419). Keep or delete before they rot.
- **L6.** `eSign.ts:2976` — `INTERVAL '${days} days'` with parseInt'd input (NaN → SQL error, not injection).
- **L7.** `health.ts:198-202` — `/health/startup` publicly exposes internal bootstrap errors (mounted unauthenticated, `index.ts:202`).
- **L8.** `integrations.ts` returns raw `error.message` on every 500 (info leak); `contributions.ts` uses `console.error` instead of `logger` throughout (89, 151, 192, ...); `audit-log.ts:112` same.
- **L9.** `budget.ts:1234, 1291, 1337, 1397, 1433, 1470, 1497, 1520` — `await import('../database')` per request instead of a top-level import.
- **L10.** `litigation.ts:154` — `/refresh-hotspots` (materialized-view refresh, heavy) available to any litigation-entitled user.

## 4. File-by-file

Format: **path — purpose — issues (line refs) — priority of worst issue.**

1. **admin.ts** (2,228) — Platform admin: directories, billing/revenue, crypto rail, fee configs. Mount: `authenticate + requireAdmin` ✅. Issues: M10 (inline `require`, feeEngine duplication 2151-2220, 500-flattening error handler 2223, no pagination 36-90, member-loop N+1 493-527); god file mixing 5 domains. **Medium**
2. **analytics.ts** (380) — CRM analytics + Excel/PDF export. Issues: header-fallback identity (21-22, M5); sequential export awaits (203-275, 307-308, H8); dead import `fmtGHS` (L1). **Medium**
3. **analyticsFoundation.ts** (758) — CCI/GHAI/alerts/demand analytics. Issues: mutating compute/alert-rule endpoints un-gated for subscribers (M6); `x-user-id` acknowledge (401); unclamped parseInt query params. **Medium**
4. **app-integrations.ts** (228) — Org integrations + API keys CRUD. Issues: fake test/sync success (96-125, M3); `PUT /:id` `RETURNING *` leaks `webhook_secret`/`config` (79); unclamped page/limit (137); hardcoded catalog (L4). API-key hashing done right (165-167) ✅. **Medium**
5. **audit-log.ts** (116) — Org SOC 2 audit-log query/export. Issues: M11 (NaN interval, SELECT *, unclamped limit, duplicate audit stack vs admin.ts); `logAuditEvent` swallows via console.error. **Medium**
6. **auth-integrations.ts** (159) — Google Calendar OAuth. Issues: **H4** (unsigned state + always-401 wiring). **High**
7. **auth.ts** (945) — Signup/login/me/refresh/google. Issues: **C1** (`/google` ATO), **C3** (slug takeover), H8 (`/me` 3 sequential queries), sequential login queries 424-460. **Critical**
8. **autopilot.ts** (622) — Publication autopilot admin. Mount admin ✅. Issues: header-fallback getUserContext copy (24-25) — moot behind requireAdmin; sequential 2nd query in `/schedules/:id` (121-137). Mostly clean. **Low**
9. **bid-management.ts** (1,339) — Full bid lifecycle + tokenized vendor portal. Issues: **H6** (sequential I/O, pool hold, dead interpolated SQL 319), M1 fixed? no — uses tokens ✅ but M12 (email HTML injection), M13 (non-expiring tokens), duplicate domain vs bidding.ts. Zod validation ✅. **High**
10. **bidding.ts** (232) — Legacy bid packages/bids/vendor prequal. Issues: BP-number race (56-57, M1); filtered-count bug (29, M9); overlaps both bid-management.ts (bids) and vendors.ts (`GET /vendors` vs `/api/v1/vendors` mount) — duplicate/parallel system; unclamped limit. **Medium**
11. **budget.ts** (1,534) — Budget analytics, invoices, expenses, milestones. Issues: **H2** (client org filters, actor spoof, shadowed routes), L9 (per-request dynamic import), 40× identical try/catch-500 blocks. **High**
12. **calendar.ts** (719) — Calendar events, viewings, maintenance scheduling. Issues: M4 (id-only event/availability ops); otherwise consistent; unused `userId` vars (41, 679, 702). **Medium**
13. **changeOrders.ts** (680) — Change-order lifecycle. Good param-level project gating (43-44) ✅. Issues: `getDefaultOrgId()` first-org fallback (61-65, M5); item routes ungated (358-404, M4); org from body (238). **Medium**
14. **charts.ts** (259) — Chart catalog + preview proxy for CMS. Issues: **H1** (SSRF/unvalidated proxy + forged headers); self-HTTP instead of service call. **High**
15. **checklists.ts** (540) — QC templates/instances/responses/signatures. Issues: **H3** (client-controlled org everywhere, header/body actors, id-only template ops). **High**
16. **closeout.ts** (240) — Closeout, warranties, claims. Issues: WAR-/CLM- races (131, 189, M1); dashboard uses Promise.all ✅; org scoping consistent ✅. **Medium**
17. **commercialization.ts** (487) — Admin usage analytics + customer health + API catalog. Mount admin ✅. Issues: broad `.catch(()=>default)` masks schema errors (51-274); onboarding checklist hardcodes step 1/7 done (465, 471). Clean otherwise. **Low**
18. **construction.ts** (91) — Site diary / petty cash / market prices. Issues: validator chains never checked (18-23, 46-51, M2); site-diary overlaps siteDiaries.ts domain. **Medium**
19. **contributions.ts** (617) — Valuation contribution workflow + credits. Issues: **H7** (open-tx leak + double-spend), console.error logging, dead imports (L1), `/prompts` skips validationResult (M2). **High**
20. **custom-fields.ts** (175) — Custom field definitions + values. Issues: N+1 in values upsert loop (119-142); org scoping ✅; whitelist UPDATE builder safe ✅. **Medium**
21. **dataHub.ts** (2,508) — Data-hub: sources, ETL, contributions, geocoding, economic data, schedulers, quality. Issues: **H5** (ungated platform mutations, TODO-auth shipped, stack-trace leak 1516), H8 (6 sequential scans 2183-2262), duplicate route (L2), 185-line contribution handler (520-705), overlapping construction/FX endpoints vs analyticsFoundation + `/economic/convert` vs `/economic/fx/convert` (1222 vs 1626). **High**
22. **developerPortal.ts** (274) — Subscriber API-key console. Entitlement wall + role-gated mutations + tier-derived limits ✅. Issues: sequential `orgHasService` loop (231). Cleanest file in scope. **Low / clean**
23. **docs.ts** (129) — Swagger UI + spec. Issues: hand-rolled YAML (L3); publicly mounted API map (accepted design). **Low**
24. **drawings.ts** (320) — Drawings + revisions. Issues: revision-route IDOR (M4), stale stored presigned URLs (M8), count-filter mismatch (M9), heavy correlated subqueries in list (31-36, 57-63). **Medium**
25. **eSign.ts** (3,040) — Entire e-sign stack (requests, magic links, envelopes, certificates, legacy compat). Issues: **C2** (header/first-org auth bypass under optionalAuth incl. unscoped document delete + resend-completed), M7 (test endpoints), M1 (cert sequence race 2568), L6; ~500-line completion helper (101-605); two parallel signing systems (signing_requests vs esign_envelopes + `esign.*` schema); god file. **Critical**
26. **enterprise.ts** (357) — Org settings, approval chains, API keys, firm analytics. Own authenticate+authorize ✅. Issues: `getApprovalRequest` unscoped (224-234, M4); api-keys CRUD intentionally shared with developerPortal (documented ✅). **Medium**
27. **equipment.ts** (219) — Equipment, assignments, maintenance. Issues: cross-org equipment update (121, M4), non-transactional assign/return; org scoping otherwise ✅. **Medium**
28. **exports.ts** (206) — CSV/JSON project exports. Clean: parameterized, org-scoped, Promise.all in `/export/all` (182-189) ✅; unbounded `SELECT *` in master export acceptable per-project. **Clean**
29. **floodRisk.ts** (173) — Flood risk scores/incidents/NADMO ingest. Mount `authenticate + valuations` ✅. Clean; local-disk multer temp handled. **Clean**
30. **floor-plan-design.ts** (350) — Floor-plan design intents (Phase 1). Mounted inside valuations.ts (`valuations.ts:6899`) — NOT dead, but both core POSTs are 501 stubs (L5); no org scoping on intents. **Low**
31. **governance.ts** (421) — Milestone frameworks/phases/templates. Issues: id-only reads/writes after list (M4); 5× 501 stubs (L5). **Medium**
32. **health.ts** (204) — Liveness/readiness/detailed health. Promise.allSettled ✅. Issue: `/startup` info exposure (L7). **Low / clean**
33. **ingestion.ts** (443) — Partner ingestion API (OAuth2 client-credentials). Best-practice validation/idempotency/rate-limit ✅. Issues: presign/complete missing ownership check, post-pagination filtering (M4/M9). **Medium**
34. **integrations.ts** (277) — MoMo/bank/vendor-verification. Issues: webhook dead behind admin mount + signature TODO (M3); raw error.message leaks (L8). **Medium**
35. **invitations.ts** (227) — Unified invitations (public token + managed). Public-before-auth layout ✅, token stripped from responses ✅, requireCanInvite ✅, bulk cap 50 ✅. **Clean**
36. **issues.ts** (243) — Project issues & risks. Project-membership param gating ✅, org-scoped ✅. Issues: ISS-/RSK- races (M1); count-subquery double round-trip pattern. **Medium**
37. **kobbyAI.ts** (214) — Kobby AI REST fallback. Issues: `/context` lacks membership check (M4); `/query` checks membership ✅; hardcoded suggestions (L4). **Medium**
38. **litigation.ts** (171) — Litigation risk data. Clean; `/refresh-hotspots` open to all entitled users (L10); unclamped limit (27). **Low**

## 5. Cross-file patterns

1. **Two identity idioms, one of them dangerous.** PM-family files correctly use `getAuthOrgId/getAuthUserId` (pmAuth). A second lineage (analytics, autopilot, checklists, eSign, charts, dataHub, budget) accepts `x-user-id`/`x-organization-id` headers or body fields as identity. Where the mount is `requireAdmin` this is latent; where it's `optionalAuth` (eSign) or subscriber-level (analytics, dataHub) it is exploitable. Kill the header fallback pattern globally.
2. **First-org-in-DB fallback** (`SELECT id FROM organizations LIMIT 1`) duplicated in eSign.ts:2676 and changeOrders.ts:61 — silently attributes data to an arbitrary tenant. Should throw instead.
3. **Copy-paste dynamic-UPDATE builder** (`updates.push(\`${f} = $n\`)` over a whitelist array) in ~14 files. Always whitelist-safe here (verified each), but it belongs in one shared helper; ditto `COUNT(*) FROM (${query}) t` + separate page query — two remote round-trips per list; several files' count drifts from the filtered query (bidding, drawings).
4. **Parallel duplicate subsystems:** bidding.ts (bid_packages/bids) vs bid-management.ts (bid_requests/bid_submissions); two e-sign stacks inside eSign.ts (signing_requests vs esign_envelopes, plus the `esign.*` Python-parity schema); audit-log.ts (`audit_log`) vs admin.ts (`audit_logs`); dataHub construction/FX endpoints vs analyticsFoundation's. Each pair doubles maintenance and confuses callers.
5. **Sequence numbers from `COUNT(*)+1`** — race in 5 files (M1).
6. **Sequential awaits/N+1 against a remote DB** — the single biggest cheap perf win: `Promise.all` conversions in bid-management (detail view), dataHub (`/quality/stats`), auth (`/me`, login), analytics exports, admin (org delete loops), bid invitation/email loops (or move email fan-out to background jobs).
7. **Error-handling split:** PM files use `next(error)` consistently (good); analytics/budget/calendar files use per-handler try/catch that flattens everything to 500 and duplicates ~40 identical blocks; two files return `error.stack`/raw messages.
8. **Actor identity from body (`approvedBy`, `reviewer_id`, `lockedBy`)** in budget, checklists, dataHub — undermines approval audit trails even where org scoping is fine.

## 6. Coverage ledger

All 38 in-scope files reviewed in full (line 1 → EOF):

admin.ts ✅ · analytics.ts ✅ · analyticsFoundation.ts ✅ · app-integrations.ts ✅ · audit-log.ts ✅ · auth-integrations.ts ✅ · auth.ts ✅ · autopilot.ts ✅ · bid-management.ts ✅ · bidding.ts ✅ · budget.ts ✅ · calendar.ts ✅ · changeOrders.ts ✅ · charts.ts ✅ · checklists.ts ✅ · closeout.ts ✅ · commercialization.ts ✅ · construction.ts ✅ · contributions.ts ✅ · custom-fields.ts ✅ · dataHub.ts ✅ · developerPortal.ts ✅ · docs.ts ✅ · drawings.ts ✅ · eSign.ts ✅ · enterprise.ts ✅ · equipment.ts ✅ · exports.ts ✅ · floodRisk.ts ✅ · floor-plan-design.ts ✅ · governance.ts ✅ · health.ts ✅ · ingestion.ts ✅ · integrations.ts ✅ · invitations.ts ✅ · issues.ts ✅ · kobbyAI.ts ✅ · litigation.ts ✅

Skipped: none in scope. (`crm/` and `pdfSection/` are directories, not top-level `.ts` files — excluded per scope definition.) Supporting context read (not audited): `index.ts` mounts, `middleware/analyticsApiAccess.ts`.
