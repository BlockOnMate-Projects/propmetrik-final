# Backend Routes Audit — Part B (m–z) + index.ts Mounting

Audit date: 2026-07-02 · Method: file-by-file review, every finding cited file:line
Scope: `backend/src/routes/**` files whose basename starts m–z (incl. `crm/`) + the route-mounting section of `backend/src/index.ts` (lines 194–816).

> DRAFT — file-by-file sections being appended as audits complete.

## 5. Mount-Order Map (index.ts)

Middleware semantics verified in source (load-bearing for everything below):

- `authenticate` (middleware/auth.ts:267) **hard-401s when no token in production** (auth.ts:311-312); in development it silently substitutes a dev user (auth.ts:296-309, 361-395) — this masks every ordering bug below in dev.
- `requirePMAccess` (middleware/pmAuth.ts:159) 403s any user whose roles aren't in `PM_READ_ROLES` (pmAuth.ts:134-137) — note the list **excludes `valuer`, `senior_valuer`, `agent`, `compliance_officer`, `probationer`**.
- `requireServiceAccess(key)` (middleware/serviceAccess.ts:107) hard-403s customers without an active subscription for `key` (serviceAccess.ts:193-197); staff/super_admin and a **hardcoded in-middleware role→service map** (serviceAccess.ts:123-145) bypass.
- Express runs `app.use(prefix, mw…, router)` middleware for **every** request matching the prefix, regardless of whether the router matches a route. So a catch-all mount's `authenticate` gates all later mounts on the same prefix.

### 5.1 Ordered mount table

| # | index.ts line | Path | Middleware chain | Router | Risk notes |
|---|---|---|---|---|---|
| 1 | 202 | `/health` | none | health | fine (public by design) |
| 2 | 203 | `/api/docs` | none | docs | public API docs |
| 3 | 204 | `/api/v1/data-hub` | authenticate + requireServiceAccess('data_hub') | dataHub | ok |
| 4 | 205-206 | `/api/v1/valuations`, `/api/valuations` | **optionalAuth only** | valuations | **Critical** — ~45 mutating handlers incl. DELETE /:id have no internal auth (see §4 valuations.ts) |
| 5 | 207-208 | `/api/v1/properties`, `/api/public/properties` | **none** | publicProperties | public by design; see §4 |
| 6 | 209 | `/api/v1/ingestion` | requireIngestionAuth | ingestion | ok (key auth) |
| 7 | 210 | `/api/v1/contributions` | authenticate | contributions | no service gate |
| 8 | 211-212 | `/api(/v1)/pull-integrations` | requireIngestionAuth | pullIntegrations | ok |
| 9 | 213-214 | `/api(/v1)/reports` | **none** | reports | **Critical** — router applies no internal auth; full report lifecycle incl. seal/approve open (see §4 reports.ts) |
| 10 | 215-216 | `/api(/v1)/valuers` | authenticate + requireServiceAccess('valuations') | valuers | ok |
| 11 | 220 | `/api/v1/pm` | **none** (public token router) | propertyManagementPublicRouter | by design (token-scoped tenant application endpoints); mounted BEFORE authed twin — correct |
| 12 | 221 | `/api/v1/pm` | authenticate + requireServiceAccess('property_management') | propertyManagement | ok |
| 13 | 222-223 | `/api(/v1)/crm` | authenticate + requireServiceAccess('crm') | crm/* | ok |
| 14 | 224 | `/api/v1/marketplace` | **none** | marketplace | public by design; verify no mutations (§4) |
| 15 | 227-489 | `/api/v1/pm-invoices/public/*`, inline `app.get/post` ×4 | none | inline handlers in index.ts | public payment endpoints — business logic in index.ts (see findings) |
| 16 | 493 | `/api/guides/:folder/:file` | none | inline | public, path-sanitized (index.ts:497) — ok |
| 17 | 521 | `/api/v1/webhooks` | **none** | webhooks | payment webhooks — signature validation must be internal (§4) |
| 18 | 522-523 | `/api/v1/auth` | none | auth + authIntegrations | by design |
| 19 | 524-525 | `/api(/v1)/messaging` | authenticate | messaging | ok |
| 20 | 526-533 | `/api(/v1)/projects,workflows,realtime,calendar` | authenticate + requirePMAccess + requireServiceAccess('projects') | projects, workflows, realtime, calendar | ok at mount; IDOR inside (§4) |
| 21 | 536-547 | `/api(/v1)/analytics{,/ml,/platform,/valuations,/market,/management}` | apiAccess(...) dual-auth | analytics cluster | by design (recent). NOTE sub-path mounts `/analytics/ml` etc. come AFTER the broad `/analytics` mount — requests hit `analyticsRoutes` first; only unmatched paths fall through. Fragile but works today |
| 22 | 548-549 | `/api(/v1)/ticker` | optionalAuth | ticker | public aggregates; 11 uncached queries/hit (§4) |
| 23 | 550-557 | `/api(/v1)/budget,team,vendors,integrations` | authenticate + PM chain (integrations: requireAdmin) | budget, team, vendors, integrations | ok |
| 24 | 560-561 | `/api(/v1)/valuation-invoices` | **none** | valuation-invoices | internal auth expected — verified in §4 |
| 25 | 567-578 | `/api(/v1)/notifications,admin,user,rbac,service-team,workspace` | authenticate (+requireAdmin for admin) | various | rbac/user/service-team/workspace have no admin/service gate at mount — authz must be internal (§4) |
| 26 | 585-586 | `/api(/v1)/subscriptions` | **none** | subscription | public pricing/webhooks by design; internal auth checked in §4 |
| 27 | 593-594 | `/api(/v1)/short-stay` | apiAccess('short_stay') | shortStay | by design; deliberately placed before catch-alls (comment index.ts:588-592) |
| 28 | **597** | **`/api/v1` CATCH-ALL A** | **authenticate + requirePMAccess + requireServiceAccess('construction')** | construction | **Gates EVERY /api/v1/* mount below this line** (rows 29-55). Three middlewares run for every falling-through request |
| 29 | 598-615 | `/api(/v1)/rfis,change-orders,submittals,portfolio,whatsapp,photos,checklists,procurement,site-diaries` | own chains (whatsapp: **none**) | various | `/api/v1/*` variants double-run `authenticate` (catch-all A already ran it). **whatsapp: `/api/v1/whatsapp` (606) is force-authenticated by row 28 → Meta webhook calls (no bearer) 401; only `/api/whatsapp` (607) is genuinely public, and only because it precedes catch-all C** |
| 30 | **616** | **`/api/v1` CATCH-ALL B** | authenticate + requirePMAccess + requireServiceAccess('projects') | governance | second bare-prefix catch-all; **all governance routes additionally require 'construction' service via catch-all A** — a projects-only customer 403s on milestone-frameworks |
| 31 | 619-624 | `/api(/v1)/litigation,rics-compliance,flood-risk` | authenticate + requireServiceAccess(litigation/valuations) | litigation, ricsCompliance, floodRisk | **valuations-service routes behind PM+construction gate**: catch-all A's `requirePMAccess` 403s `valuer`/`senior_valuer` roles (not in PM_READ_ROLES, pmAuth.ts:134-137) and `requireServiceAccess('construction')` 403s valuations-only customers on the `/api/v1/*` paths — before their own (correct) valuations gate ever runs |
| 32 | **627-628** | `/api/v1` + **`/api` CATCH-ALL C** | authenticate + requirePMAccess + requireServiceAccess('projects') | issues | line 628 gates EVERY `/api/*` mount below (rows 33-55's `/api` variants) |
| 33 | 631-644 | `/api(/v1)` bare-prefix | PM 'projects' chain | drawings, meetings, exports, pm-reports | 8 more bare-prefix catch-alls; route-collision risk between routers sharing path shapes |
| 34 | 647-664 | `/api(/v1)` bare-prefix | PM 'construction' chain | safety, timesheets, equipment, bidding, bid-management | same |
| 35 | **667-668** | `/api(/v1)` | **none (public vendor bid portal)** | bidVendorRouter | **SHADOWED: unreachable anonymously in prod.** `/api/v1/*` gated by catch-all A (597); `/api/*` gated by catch-all C (628). External vendors without a JWT get 401 before this router is consulted. Works in dev only via auth dev-bypass |
| 36 | 671-684 | `/api(/v1)` bare-prefix | PM chains | closeout, audit-log, custom-fields, app-integrations | more bare-prefix catch-alls |
| 37 | **688-689** | `/api(/v1)` | **none (Xero OAuth public callback)** | xeroPublicRouter | **SHADOWED**: Xero's browser redirect to `/api/v1/xero/callback` carries no bearer → 401 at catch-all A; `/api/xero/callback` → 401 at catch-all C. OAuth completion broken in prod unless the user's session token is somehow attached |
| 38 | 691-692 | `/api(/v1)` | authenticate + requirePMAccess | xero (protected) | ok (double-auth) |
| 39 | **696, 716** | `/api/v1/transmittals/public/acknowledge/:token`, `/api/v1/transmittals/public/download/:token/:itemId` | none (inline app.get) | inline | **SHADOWED**: registered AFTER catch-all A → email-link recipients (no bearer) 401 in prod. Also inline DB/business logic in index.ts |
| 40 | 744-745 | `/api(/v1)/transmittals` | PM 'projects' chain | transmittals | ok |
| 41 | 748-749 | `/api(/v1)/admin/platform` | authenticate + requireAdmin | commercialization | ok (plus catch-all gates) |
| 42 | **752-753** | `/api(/v1)/tenant-portal` | **none at mount** | tenantPortal | **SHADOWED**: both prefixes sit behind catch-alls A (597) and C (628) → anonymous tenant login/registration requests 401 before the router's own token auth runs. Matches the documented "Broad /api Auth Footgun" incident class |
| 43 | **757-758** | `/api(/v1)/esign` | optionalAuth | eSign | **SHADOWED**: the mount's optionalAuth never gets a say — catch-alls A/C already hard-authenticated the request. Public token-based signer endpoints 401 for anonymous signers in prod |
| 44 | **762-763** | `/api(/v1)/invitations` | none (token endpoints public by design) | invitations | **SHADOWED** — same mechanism; public invite-accept links 401 in prod |
| 45 | **766-767** | `/api(/v1)/valuation-org` | none | valuation-org | **SHADOWED** + whatever internal auth it has is preceded by PM-role + construction-subscription gates → valuers 403 (§4) |
| 46 | 770-771 | `/api(/v1)/enterprise` | none | enterprise | same shadowing; internal auth unverified at mount |
| 47 | 775-776 | `/api(/v1)/developers` | authenticate | developerPortal | double-auth via catch-alls; construction gate applies |
| 48 | 780-781 | `/api(/v1)/valuation-clients` | authenticate | valuation-clients | **cross-gated**: catch-all A imposes PM role + construction sub on a valuations feature |
| 49 | 786-791 | `/api(/v1)/publications,charts` | authenticate + requireServiceAccess('valuations') | publications, charts | **cross-gated** like row 48 — valuer roles 403 at catch-all A's requirePMAccess before the valuations gate runs |
| 50 | 794-795 | `/api(/v1)/autopilot` | authenticate + requireAdmin | autopilot | ok (admins pass catch-alls) |
| 51 | 798-799 | `/api(/v1)/ai/kobby` | authenticate | kobbyAI | cross-gated by catch-alls (construction/projects sub required) |
| 52 | 803 | 404 handler | — | — | ok |

### 5.2 Catch-all shadowing summary (the load-bearing defect)

Two bare-prefix authenticated catch-alls — **index.ts:597** (`/api/v1`, construction chain) and **index.ts:628** (`/api`, projects chain; also 616/627/631/635/639/643/647/651/655/659/663/671/675/679/683 re-run auth on the same prefixes) — sit in the MIDDLE of the mount list. Consequences:

1. **Public routes mounted after them are dead in prod** (dev bypass masks): bidVendorRouter (667-668), xeroPublicRouter callback (688-689), transmittal public ack/download (696, 716), tenantPortal token auth (752-753), eSign public signer endpoints (757-758), invitations public accept (762-763), valuation-org (766-767), enterprise (770-771). Each of these is exactly the incident class the codebase itself documents at index.ts:559-592 ("MUST be mounted BEFORE the broad `/api/v1` authenticate… it was mounted after them, the broad authenticate 401'd the key before apiAccess ran") — the fix was applied for subscriptions/short-stay but not for these eight.
2. **Cross-service privilege coupling**: every `/api/v1/*` request falling through line 597 must pass `requirePMAccess` (PM roles only) + `requireServiceAccess('construction')`. Valuations-domain mounts placed below (rics-compliance 621, flood-risk 623, valuation-org 766, valuation-clients 780, publications 786, charts 790) therefore 403 for `valuer`/`senior_valuer`/`analyst`-only users and for customers without a construction subscription — regardless of their valid valuations subscription.
3. **Double/triple authentication cost**: routes below line 597 with their own `authenticate` run JWKS verification + `enrichUserFromDb` (a remote-DB query) **twice per request**, and `requireServiceAccess` runs its subscription query up to 3× (catch-all A + catch-all B/C + own mount) — pure added latency on a high-RTT DB (partially mitigated by the 60s in-memory cache, serviceAccess.ts:23).
4. **Bare-prefix route-collision risk**: 15+ routers mounted on bare `/api/v1`/`/api` (construction, governance, issues, drawings, meetings, exports, pm-reports, safety, timesheets, equipment, bidding, bid-management, bidVendor, closeout, audit-log, custom-fields, app-integrations, xero) rely on non-overlapping internal path shapes. construction.ts defines `/projects/:projectId/site-diary` while a dedicated `/api/v1/projects` router exists (526) — requests only reach the right handler because the earlier mount happens to lack the same sub-path. Any new route in projects.ts matching `/:id/site-diary` would silently shadow it.

### 5.3 Mounts safe only because of their position (do not reorder)

- propertyManagementPublicRouter (220) before authed PM twin (221) — commented, correct.
- whatsapp `/api/whatsapp` (607) public only because it precedes catch-all C (628).
- subscriptions (585), short-stay (593), valuation-invoices (560), webhooks (521), auth (522), marketplace (224), reports (213), inline pm-invoice/guides handlers (227-519) — all public-capable only because they precede line 597/628.

### 5.4 Other index.ts findings

- **[High] Business logic in the bootstrap file** — index.ts:227-489: four full public payment handlers (PM invoice fetch, Paystack verify, crypto initiate, crypto confirm) with FX conversion, ledger writes and NOWPayments integration live inline in index.ts instead of a router; duplicates the public-payment pattern of valuation-invoices.ts. Fix: extract to `routes/pm-invoices-public.ts`.
- **[High] Paystack verify does not bind reference→invoice or amount** — index.ts:288-324: `GET /pm-invoices/public/:id/verify-payment/:reference` marks invoice paid when Paystack says the reference succeeded, without checking the transaction's amount/metadata matches THIS invoice at the route boundary (any successful reference of any amount confirms any invoice unless `invoiceService.confirmPayment` internally validates). Fix: verify `verifyData.data.amount` ≥ invoice total and reference↔invoice linkage.
- **[Medium] `requireServiceAccess` role→service matrix hardcoded in middleware** — serviceAccess.ts:123-145, with a comment admitting it "must mirror frontend RBAC config" — guaranteed drift. Fix: single source (DB/authorization_policies).
- **[Low] auditMutations global (199) runs before auth** — relies on routers populating req.user by response-finish; inline index.ts public handlers (227-489) mutate payment state and are audited with no user attribution.

---

## 4. File-by-File Entries

Priority tags: [C]=Critical [H]=High [M]=Medium [L]=Low. All line refs are in the named file unless prefixed.

### 4.1 valuations.ts — 7,121 LOC, ~78 routes
Purpose: entire valuation engine API (CRUD, comp search, 7 method engines via Python proxy, reconciliation, sensitivity, floor plans, HBU, documents, engagements). Mounted `optionalAuth` only (index.ts:205-206) — the outlier vs sibling valuation mounts which use `authenticate + requireServiceAccess('valuations')` (index.ts:215, 621).

- [C] Security — ~45 mutating handlers accept anonymous writes because the mount is optionalAuth and handlers don't check `req.user`. Worst: `DELETE /:id` (:1649) anonymous hard-delete of any valuation; `PUT /:id` (:1419) allowlist includes `final_value_ghs`, `status`, `method_results` (:1457-1488) — anonymous rewrite of the legal value of record; `POST /reconciliation/:id/finalize` (:5839, comment "Make userId optional for development") anonymously finalizes `final_market_value` (:5875); `PUT /:id/property` (:6011) + `PUT /:id/engagement` (:6976) mutate owner/client PII anonymously. Full list also covers writeups (:573), create (:600), run-python (:929), comparables search-writes (:1787/:1845), method /value+/sensitivity routes (:2715-:3343), cap-rate/derive (:3781 — docblock says admin/valuer only, zero check), quick (:4248), batch (:4304), documents (:4393/:4430/:4440), floor-plans (:4468-:4742), HBU (:4779-4918), baskets (:5155-5405), sensitivity inserts (:5437-5532), reconciliation (:5612/:5759/:5935), method inputs (:6299-6497), land-value (:6570/:6770). Fix: remount `authenticate + requireServiceAccess('valuations')` + org-scoping helper.
- [H] Security — unauthenticated `GET /` returns EVERY org's valuations: both scoping branches skip when `!userId && !orgId` (:122-149; same at /stats :264).
- [H] Security IDOR — no detail route filters by `valuer_organization_id` (:1383, :4077, :5089, :6511) — any UUID readable/mutable cross-org.
- [H] Security DoS — `POST /batch` up to 50 anonymous engine runs (:4304-4325); Monte Carlo `iterations || 1000` unbounded (:5541); `POST /:id/documents` unauthenticated base64 upload, no size/MIME cap (:4393-4409); location-map endpoint spends Google Maps quota anonymously (:4440).
- [H] Perf — per-comparable INSERT loop after DELETE, no transaction (:5176-5197, :6365-6387); reconciliation N+1 per method (:5658-5673, :5798-5807); batch loop fully sequential (:4330-4350); comparable search Haversine full-scans with no lat/lng bounding-box prefilter, retried up to 4× by radius widening (:1997-2084, :2462-2521, :2580-2588); `PUT /:id` costs up to 5 sequential round-trips (:1443-:1618).
- [H] Bug — `POST /batch` `meta: { total: properties.length }` TypeErrors → 500 when `property_ids` path used (:4361, supported at :4311).
- [H] Dup/dead — `GET /:id/engagement` registered twice; second (:6953) unreachable (first at :6933).
- [M] Bug — weighted-average never normalized by totalWeight; two 100-weight methods yield the SUM of both values (:1590-1605; same math :5687-5702). `SELECT vbc.*, p.*` — `p.*` overwrites `vbc.*` keys, returned `id` is the property id (:5106). History `offset` parsed but never passed (:1699-1712).
- [M] Perf — FX rate re-queried per request instead of cached (:968, :2730, :1877, :2422); COUNT+page sequential (:161/:166); 3 correlated subqueries per candidate row (:1938-1988); sensitivity re-runs call the engine over HTTP to itself `http://127.0.0.1:${PORT}` (:3478-3484); no pagination on :1737, :3891-3929 (no LIMIT at all), :5259, :5418; `SELECT v.*, p.*`/`SELECT *` at :395, :473, :1811, :2346, :5106, :6581, :6715, :1738, :5095, :5220, :5966, :6516.
- [M] Security — `logger.error({ body: req.body })` logs client PII (:4059-4063, :7112; :1547-1550 debug-logs UPDATE values); `INTERVAL '${months} months'` template-interpolated (parseInt-coerced, NaN → 500) (:4213); `error.message` leaked to clients unconditionally (:1639, :2306, :2829, :5203) while others env-gate (:919).
- [M] Dup — validRegions/validPropertyTypes copy-pasted 3× (:3704, :3793, :4137-4154); `PYTHON_VALUATION_URL || 'http://localhost:8001'` ×7 (:1124, :1337, :2796, :2941, :3114, :3279, :3405); two write paths to valuation_comparables (:5155-5205 vs :6325-6497); two median implementations (:2163 vs :2609); confidence formula duplicated (:6421 vs :6433).
- [M] Hardcoded — sanity bands `BETWEEN 50000 AND 100000000` / `500 AND 60000` in SQL (:2073, :2082); complexity: god handlers :1787-2309 (~520 lines), :2326-2707, :929-1328, :600-922.
- [L] Dead (High conf) — unreachable `selected_methods` condition (:1516); unused `forceRefresh` (:3783); unused type imports (:34, :38). Reward-credit economics inline (:2282); MAX_RADIUS_KM (:2579); sentinel UUID literals (:2100/:2561); fullAccessRoles duplicated (:133, :256). Empty-result handled 3 different ways (:1744 vs :5126 vs :5599); swallowed engine errors (:3412, :2582-2587).

Scores: readability 5 · maintainability 3 · performance 4 · security 2 · complexity 3.

### 4.2 projects.ts — 6,808 LOC, ~230 routes
Purpose: entire projects module (CRUD, phases, 2 milestone systems, units, costs, contractors, draws, logs, payment plans, punch lists, wizard, Ghana civic data, dashboards, Gantt, documents, payments, cost estimates, PDF reports). Auth: `registerProjectAccessParams` guards only `:id`/`:projectId` params (pmAuth.ts:361); child-id routes fall through to role guards with NO org filter in services; org-admins bypass entirely (pmAuth.ts:296-298).

- [C] IDOR writes cross-tenant — all child-id mutations unscoped: phases (:421-:562), units (:699-:2436), costs (:989-:1093, incl. `DELETE FROM project_costs WHERE id=$1`), bulk-approve (:1080-1086 — approves invoices across all tenants), contractors (:1186-1297), assignments (:1345-1426), draws incl. approve/fund money flows (:1537-1646, :1570/:1606), logs (:1759-1853), payment plans (:1966-2012), punch lists (:2233-2348), deal-links (:2411), documents/folders/permits/inspections (:5353-:5869). Fix: extend existing `enforceChildProjectAccess` (pmAuth.ts:378) to these child tables.
- [C] IDOR reads cross-tenant — units/draws/logs/plans/punch/documents by child id, incl. presigned download `getDocumentById(req.params.documentId)` with no org match (:684, :1503, :1725, :1907, :2142, :2471, :5692, :5711).
- [H] Org-admin bypass + unscoped handlers = cross-org reads for any customer-org admin (:338, :348, :581, :609, :907, :1316, :1475, :2401, :2471, :5283, :5536, :5606 et al).
- [H] Cost-estimate mutations missing `requirePMWrite` (:6448, :6485, :6524, :6564 — convert-to-project creates projects/milestones with read-level role).
- [H] Dead (High conf) — 4 unreachable duplicate routes (first registration wins): `POST /units/:unitId/handover` :2454 shadowed by :785 (different service never runs); `link-deal` :2382 shadowed by :871; `GET /:id/gantt` :5124 (org-scoped) shadowed by :348 (unscoped — the dead one is the SAFER one); permits :5303/:5319 shadowed by :4397/:4407.
- [H] Perf — ~18 sequential awaits in `/cost-estimator/market-data` (:4188-4276); convert-to-project: 2 queries per phase in a loop, NO transaction (:6656-6702, :6737-6749).
- [M] `/dashboard/alerts/:id/*` param guard treats alert UUID as project id → wasted membership query + non-admins 403 (:4628-4667). Sequential count+list (:228-244, :6384-6409, :4520-4540). No pagination: :907, :1112, :5606, :338, :2401, :1316, :5446; unclamped limits :599, :1483, :1680, :1886, :2087. `SELECT *` :234, :6044/:6052, :6431, :6573. Two parallel milestone systems (:517-574 vs :4745-5117). VALID_COST_CATEGORIES duplicated (:959, :997). ~800 lines of Ghana civic data inline (:3463-3720, :3798-3886, :3903-4148 — 'Bono' vs 'Brong-Ahafo' key inconsistency). Body validation absent on ~90% of mutations (zod schemas imported at :22, mostly unused); `.catch(() => null)` swallows in reports (:2514-2519, :2778-2785, :4540). Share-token route comment says public but router is authed (:5883-5884).
- [L] Per-request dynamic imports of database (:206, :2038, :4531, :6042 …); no caching/Cache-Control on static Ghana data (:3425-:4499); payout account unmasked to PM-read users (:6063-6094); fee fallback unit inconsistency `|| 1` vs `|| 0.01` (:6071 vs :6090); god handlers :2770-3144 (374 lines), :2507-2765, :6564-6806; 400-for-not-found (:893, :1047, :1070, :1098, :1302); FULL_ACCESS_ROLES duplicated from pmAuth (:91).

Scores: readability 5 · maintainability 3 · performance 4 · security 2 · complexity 4.

### 4.3 propertyManagement.ts — 3,686 LOC, ~137 routes
Purpose: entire PM module (properties, tenants, tenancies, payments/payouts, work orders, vendors, documents, financials, applications, e-sign, messaging). Public router (4 routes, :3053-:3114) verified token-scoped — no unscoped public mutations.

- [C] Org spoofing — `getOrganizationId` falls back to client-supplied `x-organization-id` header (:172-191); `getUserId` trusts `x-user-id` (:196-214). ~130 handlers derive tenancy from it → org-level IDOR + attribution spoofing (:305, :3608). Same pattern in crm/helpers.ts and messaging.ts (see §6).
- [H] IDOR — `POST /leases/:id/sign` unscoped lookup (:2340-2343), writes caller's signature onto first unsigned signer with no identity check, can flip envelope to completed (:2365-2374, :2421-2429) — cross-org signature forgery.
- [H] Token leak — `GET /applications/:id/lease` unscoped (:2713-2720), returns `signerToken: tenantSigner?.access_token` (:2801) to any authenticated user; dev mode returns with no auth (:2704-2708) against the single prod DB. Currently masked by a bug: SELECT omits `envelope_id` so :2730 is always undefined → route always 404s (fixing the bug without the authz fix opens the leak).
- [M] Dev fallback `SELECT id FROM organizations LIMIT 1` picks an arbitrary REAL org (single prod DB) (:182-187, :205-211). Public 25MB upload, no rate limit / per-link cap (:3063-3091). `GET /payments/account` returns unmasked account numbers via `SELECT *` (:806-861). Fee fallback unit inconsistency `|| 1` vs `|| 0.01) * 100` (:837-838 vs :856-857). Crypto-revenue: sequential queries, no pagination, join on `(pt.metadata->>'tenancy_id')::uuid` unindexable (:995-1031). Messages: 3-4 sequential round-trips per op (:3557-3599, :3606-3639); conversations correlated subquery + no pagination (:3438-3452). Dead guards: `if (!organizationId)` can never fire (helper returns nil-UUID, :190) — silent empty 200s instead of 401. Hand-rolled CSV export: quote/formula-injection unsafe, Viewer-exportable tenant PII (:2177-2195). Error control-flow via `error.message.includes(...)` (:1204-1212, :2535-2540, :2878-2889); trailing "error middleware" is a no-op (:3680-3684).
- [L] Route naming `/tenancies-expiring`, `/work-orders-stats` vs documented slash paths (:766, :1365); `LIMIT 200` no pagination (:277); bucket fallback ×3 (:1500/:1596/:3076); GET with side effects (signed-lease migration-on-read :668-709); messaging mirrored vs tenantPortal.ts:1846-1990; `/payments/resolve-account` unthrottled (:902).

Scores: readability 5 · maintainability 4 · performance 5 · security 4 · complexity 3.

### 4.4 publicProperties.ts — 388 LOC, 7 routes
Purpose: public property list/detail/report-data + one PUT. Mounted NO auth (index.ts:207-208).

- [C] `PUT /:id` — unauthenticated internet-writable property update: owner PII (:263), arbitrary metadata JSONB merge (:324). Poisons the valuation-comp source (`properties` IS the data hub). Fix: delete or move behind authed PM route (propertyManagement.ts:1848 exists).
- [H] `RETURNING *` sends full row incl. owner PII back to anonymous caller (:344) — undoes the careful public-field filtering the GETs do.
- [M] Unclamped `?limit=` dumps the table (:21); uncached `getPropertyCounts()` full-table GROUP BY per list call. Bug: guard at :47 `return`s without response → request hangs.
- [L] Full generated UPDATE SQL logged per call (:348-353); UUID regex duplicated 7× (:49-:244); `GET /:id` vs `/:id/enriched` same data different envelopes (:43 vs :83); double try/catch + asyncHandler pattern.

Scores: readability 7 · maintainability 6 · performance 6 · security 2 · complexity 7.

### 4.5 marketplace.ts — 395 LOC, 10 routes
Purpose: public marketplace search/detail/geo + inquiry→CRM bridge. Mounted NO auth by design (index.ts:224).

- [H] `POST /inquiries` unauthenticated, NO rate limit — ~8 DB round-trips + CRM contact/deal creation + 2 emails per request (:111, :358, :376). Inbox-bombing/CRM-pollution/UUID-oracle. Fix: strict IP limiter + captcha.
- [H] User-controlled name/message interpolated unescaped into HTML email (:336-346, :360-362) — phishing from trusted sender. Fix: HTML-escape.
- [M] Unauthenticated analytics `trackEvent` free-text insert, no rate limit (:95 → marketplaceController.ts:342-380); public geocoder proxy quota abuse (:67-88); ~9 sequential awaits per inquiry, correlated COUNT per agent in round-robin (:126-382, :251-255); 280-line god handler with inline HTML template (:111-393).
- [L] No inquiry dedup/idempotency; `'GHS'` fallback + magic strings (:188, :324, :267-278); parallel public read pipeline duplicates publicProperties.ts.

Scores: readability 6 · maintainability 5 · performance 5 · security 4 · complexity 5.

### 4.6 portfolio.ts — 99 LOC, 5 routes
Purpose: PM portfolio overview. Mounted full PM chain (index.ts:604-605).

- [H] NO tenant scoping anywhere — service queries are `FROM development_projects WHERE deleted_at IS NULL` with no org filter (:23, :47, :61, :76, :91 → portfolioService.ts:66-79, 149-200, 242, 333, 396); `getSummary(userId)` ignores userId. Any portfolio-service customer sees every org's projects/budgets/spend.
- [M] No pagination + correlated per-row subqueries + uncached full-table aggregates (:47, portfolioService.ts:196-200).
- [L] `console.error` + `details: error.message` to clients (:26, :50, :64, :79, :94); unclamped limit/days (:75, :90); dead userId param (:22-23).

Scores: readability 8 · maintainability 7 · performance 6 · security 3 · complexity 9.

### 4.7 reports.ts — 2,451 LOC, 36 routes
Purpose: valuation report lifecycle (CRUD, photos, DOCX/PDF gen, approval/seal/e-sign, public verification). Mounted with NO middleware (index.ts:213-214) — and the router applies none internally.

- [C] IDOR — every endpoint operates purely on `req.params.id`; reportService has zero org references (grep-verified); no `getAuthOrgId` calls (:250, :278, :323, :1035, :1647, :2078). Any caller can read/edit/delete/approve/seal/stream any org's report.
- [C] Seal forgery — `valuer_id` taken from `req.body` and used to approve + digitally seal (:1649, :1672; same in /reject :2115, /prepare-esign :1941). Signer identity is client-supplied.
- [H] Stack trace returned unconditionally `details: templateError.stack` (:1003-1007; contrast env-gated :816). Dead (High conf): `GET /pdf-converter-status` (:2434) unreachable behind `validateUUID` on `GET /:id` (:250); nine `generate*HTML` helpers ~265 lines with zero call sites (:1102-1366, comment at :1009-1017 confirms fallback removed).
- [H] Perf — photo upload: `getPhotos(reportId)` per file inside Promise.all → N queries + display_order race (:1413-1467, :1432).
- [M] Two sequential presigns per photo (:1449-1457, :1497-1506); `/pdf-stream` buffers whole PDF in memory (:2091-2099); bucket fallback mismatch `'propmetrik-documents'` vs `'propmetrik-reports'` from same env var (:743 vs :847/:1724/:2007/:2090); `/approve` 285-line god handler with mixed failure semantics (:1647-1932); duplicate property-address lookup within one request (:1751-1764, :1857-1870).
- [L] Public `/verify/:hash` unvalidated/unbounded + audit-row per hit (:123-136); `error.message.includes('not found')` dispatch ×12 (:190-207); `'PROPMETRIK Ghana Ltd.'` + TTLs inline (:1797, :744, :848, :2410).

Scores: readability 6 · maintainability 4 · performance 5 · security 2 · complexity 3.

### 4.8 pm-reports.ts — 331 LOC, 4 routes
Purpose: PM PDF reports. Near-model citizen: org scoping on entry queries, Promise.all batching (:28-35, :126-129, :184-188).
- [M] Budget-bar math reduces to spent==budget in both ternary branches → every bar renders 100% (:310). `SELECT * FROM project_issues/project_risks` no LIMIT (:127-128).
- [L] `SELECT * FROM development_projects` (:22); `console.error` + possible headers-after-stream 500 (:112, :169, :260, :325); stat-card block duplicated (:66-74 vs :285-304).

Scores: readability 8 · maintainability 7 · performance 7 · security 9 · complexity 8.

### 4.9 ricsCompliance.ts — 143 LOC, 3 routes
- [M] No org scoping / UUID validation on report reads (:84-88, :114-123); temp upload not cleaned on failure path → disk fill (:53-64).
- [L] limit/offset/min_score unclamped (:116-122); multer fileFilter errors bypass try/catch (:42); 50MB + upload dir literals inline (:19, :33). NOTE: additionally cross-gated by the index.ts:597 catch-all (valuers 403 — see §5.2.2).

Scores: readability 8 · maintainability 8 · performance 8 · security 5 · complexity 9.

### 4.10 realtime.ts — 201 LOC, 8 routes
- [C] Trusts client `x-user-id`/`x-organization-id` headers instead of `req.user` (:16-20, :89-95); `/replay` returns up to 500 org events filtered only by the spoofable header — cross-org event exfiltration; presence writes impersonable.
- [H] `/subscribe`/`/unsubscribe` accept arbitrary clientId with no ownership check (:45-60, :67).
- [M] `/stats` documented admin-only, no role check (:189-199).
- [L] `new Date(req.query.since)` unvalidated (:92); `req.on('close')` doesn't remove client (:35-37).

Scores: readability 8 · maintainability 8 · performance 8 · security 2 · complexity 9.

### 4.11 mlAnalytics.ts — 585 LOC, 27 routes
- [H] Zero route-level caching — slowly-changing analytics (GHAI is monthly) recomputed against remote DB per request (whole file). Duplicate forecast endpoints `/construction/forecast` vs `/forecast` (:125-133 vs :378-391).
- [M] `/market/*` endpoints duplicate marketIntelligence.ts:37-140/208-239 through a different service stack (:207-242) — the exact wrong-source bug class previously hit; `/ner/batch` + `/documents/batch` unbounded arrays fanned to ML service (:474-484, :539-557); parseInt without NaN guard ×15 (:256, :332, :350-351, :436-437).
- [L] Local asyncHandler returns raw `err.message`, duplicates shared middleware (:22-29).

Scores: readability 7 · maintainability 5 · performance 4 · security 6 · complexity 8.

### 4.12 marketIntelligence.ts — 261 LOC, 15 routes
- [M] `POST /compute-snapshot`: 2 heavyweight full-market recomputes, no role gate/rate limit, unvalidated client date persisted (:245-259); no caching on any GET.
- [L] 13 handlers same template (~150 collapsible lines, :37-201); unclamped parseInt (:44, :57, :136); `/investment/:region` ordering-fragile after `/investment/regional` (:228-238).

Scores: readability 8 · maintainability 6 · performance 5 · security 6 · complexity 9.

### 4.13 managementMetrics.ts — 194 LOC, 1 route
- [H] Dead (High conf) + wasted query — `rentalResult` computed with admittedly-broken params (comment :71 "wrong param positions") then never used: a full GROUP BY over remote `properties` burned per request (:53-69).
- [M] 3 sequential full-table aggregates, no Promise.all, no caching (:73-114); region/no-region SQL ×4 copies duplicating rentalAnalyticsService (:74-94 vs :97-114); `operatingExpenseRatio = 0.30` inline — valuation-grade assumption that belongs in DB config per migs 251-256 pattern (:118).
- [L] In-code dedup of duplicate benchmark rows masks data issue (:44-50); unweighted vs listing-weighted KPI inconsistency (:169-171); dead `regionFilter` (:24-25).

Scores: readability 6 · maintainability 4 · performance 3 · security 7 · complexity 6.

### 4.14 ticker.ts — 228 LOC, 1 route
- [H] 11 aggregate queries (3 PERCENTILE_CONT full scans, :29-71) per render, effectively public (optionalAuth, index.ts:548), no cache/rate limit — worst RTT amplifier + free DoS surface. Fix: 60s TTL cache.
- [M] Every query `.catch(() => default)` — the exact silent-zero pattern behind the prior VALUATIONS=0 bug (:38, :71, :78, :85, :88, :94, :102, :111, :120, :127, :134). Segment taxonomy/regions/'Tema'/slice(0,6)/45-day window inline — won't track the 16-region expansion (:49-55, :143, :165).
- [L] `console.error` (:223); pending-valuation/active-deal counts exposed to anonymous users.

Scores: readability 7 · maintainability 6 · performance 3 · security 7 · complexity 7.

### 4.15 shortStay.ts — 200 LOC, 7 routes
- [M] `POST /refresh-metrics` — any short-stay user can spam `REFRESH MATERIALIZED VIEW`, no role gate/debounce/concurrency guard (:183-198).
- [L] parseInt unclamped (:36, :105); `city = 'Accra'` default ×4 + `as any` casts (:21, :32-33, :57, :84, :160); shared asyncHandler exists but unused (:17-177). Error handling at least consistent.

Scores: readability 8 · maintainability 7 · performance 7 · security 6 · complexity 9.

### 4.16 CRM subdirectory (11 files, 2,970 LOC total)
Shared context: all behind `authenticate + requireServiceAccess('crm')`; org id comes from `crm/helpers.ts:8-20` which falls back to the client-controlled `x-organization-id` header — group-wide IDOR enabler (see §6). Zero-UUID guard copy-pasted ~30× with inconsistent application.

- **crm/properties.ts** (1,047 LOC, 19 routes) — [M] pagination total ignores agent/filter scoping (:158 vs :52-88); geom param index via `values.indexOf(updates.longitude)+1` — value-collision corrupts geometry (:504-506); `CRM-YYYY-NNNN` from MAX+1 non-atomic (:298-299); sequential per-file image upload+presign loop up to 20 files (:861-895). [L] one handler uses console.error + raw err.message (:155, :184-187); 7-day presigned URLs persisted in stored JSON (:872). Scores: R7/M6/P5/S5/C6.
- **crm/pipelines.ts** (205, 11 routes) — [H] Dead route (High conf): `PUT …/stages/reorder` (:195) registered after `…/stages/:stageId` (:166) → captured as stageId='reorder', unreachable. [L] metrics join misses `deleted_at IS NULL` + org filter (:84-93); avg_days_to_close proxied by updated_at (:106). Otherwise the Promise.all model file (:83). Scores: R8/M7/P8/S6/C8.
- **crm/targets.ts** (191, 16 routes) — [C] `GET/PATCH/DELETE /targets/:id`, `/refresh`, checkpoints (:111-156) and `/agents/:agentId/*` (:168-183) pass only the raw id with NO organizationId — cross-org read/modify/delete of targets + agent performance data. Scores: R7/M7/P7/S2/C8.
- **crm/notifications.ts** (169, 8 routes) — [M] preferences upsert inserts hardcoded `true`×8; user's FIRST save silently discarded (:159-164). [L] list+unread sequential (:30-41); POST "internal/admin" has no role gate, arbitrary user_id (:92-106); duplicate mark-all bodies (:68-77 vs :80-89). Scores: R7/M7/P7/S5/C8.
- **crm/saved-views.ts** (127, 5 routes) — [M] UPDATE/DELETE scope by org only, missing the `user_id` filter reads have — colleagues can rewrite/delete each other's private views; pre-check unscoped (:98-110, :123, :89). Scores: R8/M8/P8/S5/C9.
- **crm/payments.ts** (439, 13 routes) — [M] idempotency store is in-process memory (lost on restart, not multi-instance) and caches 4xx/5xx for replay (:42-53, :84-93). [L] unmasked account number to finance roles (:134, :151); fee semantics diverge legacy (`:137` raw, default 1) vs new (`:156` ×100, default 0.01) + flat 25 fallback; GET crypto routes skip the limiter POSTs have (:232, :260, :307, :414). Otherwise the hardest-target file in the group. Scores: R7/M7/P7/S7/C7.
- **crm/tasks.ts** (113, 8 routes) — [L] PUT returns 200 null (no 404 unlike notes.ts:74-78); agent auto-scoping on list (:29-35) not applied to by-id routes (:78-83). Scores: R8/M8/P8/S6/C9.
- **crm/notes.ts** (129, 7 routes) — clean; POST+PUT /pin identical copy-paste (:102-127). Scores: R8/M8/P8/S7/C9.
- **crm/signatures.ts** (108, 8 routes) — clean; /remind vs /resend same op, different error handling (:79-83 vs :98-106). Scores: R8/M8/P8/S7/C9.
- **crm/stacking-plan.ts** (62, 5 routes) — clean, tidiest of the group; upsert returns 201 on update. Scores: R9/M8/P8/S7/C9.
- **crm/templates.ts** (382, 20 routes) — [L] `GET /document-templates/:id` (:90-92) and `/merge-fields` (:60-71) skip the org guard; `organizationId || undefined` branch effectively dead (Med conf); body-alias mapping duplicated (:80-85, :107-111). Scores: R7/M7/P7/S6/C8.

### 4.17 messaging.ts — 571 LOC, 11 routes
- [C] `GET /conversations` — `WHERE 1=1`, no org filter: every org's conversation list + last message to any authenticated user (:351). `GET /messages/:id` and `/contacts/:id/messages` unscoped by org (:306-315, :544-553).
- [H] Schema drift: two conflicting whatsapp_messages migrations (061 vs 1737413002000); INSERTs use `to_phone`+`organization_id` (:87-91), reads filter `to_number/from_number` (:271, :334) — one path throws column-not-exist at runtime; stale comment :443-444 contradicts inserts.
- [M] `/stats` aggregates all orgs (:442-461); correlated last-message subquery + non-sargable COALESCE group (:341-347); count+list sequential (:276-293); hardcoded template array (:370-409).
- [L] Dead (High conf): `ensureMessageLogTable` no-op (:52-55); raw phone-number logging (:108); re-implements crm/helpers verbatim (:26-45).

Scores: readability 6 · maintainability 5 · performance 5 · security 2 · complexity 7.

### 4.18 meetings.ts — 266 LOC, 12 routes
- [H] Attendee/action-item routes never verify parent meeting belongs to caller's org — cross-org write/delete IDOR (:177-187, :190-213, :220-263; org scoping exists only on meeting CRUD, :54).
- [M] `MTG-` number from COUNT(*)+1 race (:79-80); per-row inserts in txn loops (:95-111); post-COMMIT re-select instead of RETURNING (:117-120).
- [L] list total ignores filters (:36); empty-body PUT builds `UPDATE … SET WHERE` syntax error (:194-200).

Scores: readability 7 · maintainability 7 · performance 6 · security 4 · complexity 8.

### 4.19 workspace.ts — 887 LOC, ~24 routes
- [H] `POST /:workspaceId/files` accepts arbitrary `fileKey` and returns a presigned READ URL with no prefix validation (:752-788, :779) — cross-org object exfiltration from the bucket (upload route enforces prefix :734-735; this one doesn't).
- [M] Any member can add users as `admin` / remove any member — TODO at :622 admits missing check (:579-605, :611-632); 2-3 serial guard queries before every handler ×~20 routes (:65-71 pattern); member-validation N+1 loop (:319-325); `/export` unbounded in-memory CSV, quote/formula-unsafe (:695-712, :700-706).
- [L] `/read` skips isMember check siblings do (:811-823); 'General' channel literal (:438).

Scores: readability 7 · maintainability 6 · performance 5 · security 4 · complexity 7.

### 4.20 whatsapp.ts — 992 LOC, 22 routes
Purpose: WhatsApp PM-bot + tenant notifications. Mounted NO middleware (index.ts:606-607); header comment "Protected - Authenticated" (:74) is false. (Additionally: `/api/v1/whatsapp` is force-gated by the index.ts:597 catch-all, so only `/api/whatsapp` is actually public — see §5.)

- [C] `POST /send`, `POST /send-bulk` internet-reachable with zero auth — arbitrary WhatsApp sends from the org business number (:81, :135).
- [C] Unauthed `/notify/rfi|submittal|change-order`: attacker-supplied `additionalRecipients` (:235/:319/:401) exfiltrates RFI/submittal/CO content; lookups unscoped (:204-217).
- [C] Unauthed tenant endpoints (:643-990): rent reminders/payment confirmations/emergency alerts to any tenantId; `/tenant/bulk-emergency-alert` (:963) blasts any property; `/tenant/bulk-rent-reminders` (:929) trusts `x-organization-id`.
- [H] Cron triggers only guarded `if (cronSecret && …)` — open when CRON_SECRET unset (:504-507, :524, :544). `POST /webhook` never validates Meta `X-Hub-Signature-256` (:51).
- [M] Default verify token `'propmetrik-pm-bot'` (:35); sequential per-recipient send loops (:241, :325, :407, :463); six tenant endpoints copy-paste (:643-921); webhook GET verification duplicated vs webhooks.ts:207 (two live WhatsApp webhooks, one likely dead — Med conf). [L] unauthed `/status` config disclosure (:566).

Scores: readability 6 · maintainability 5 · performance 5 · security 1 · complexity 6.

### 4.21 webhooks.ts — 435 LOC, 5 routes
Purpose: payment/e-sign/WhatsApp webhooks. Mounted NO middleware (index.ts:521), correct for webhooks IF signatures enforced.

- [H] E-sign HMAC returns `true` when `ESIGN_WEBHOOK_SECRET` unset (:37-40) — forged completion events mark leases/valuations signed in prod misconfig. Fail closed in production.
- [M] `timingSafeEqual` throws on length mismatch → outer catch returns 200 (:66-69, :195); HMAC over `JSON.stringify(req.body)` not raw body (:59); NOWPayments skips signature when `NOWPAYMENTS_SANDBOX==='true'` (:269-273); WhatsApp POST no Meta signature + double res.send in catch (:225, :237).
- [L] NOWPayments IPN full processing before ack (:297-367 — ack early like Paystack path); 500-char payment body logged (:372-374). Paystack handler clean (:391-394). Stale "(future)" comments (:9, :381).

Scores: readability 7 · maintainability 7 · performance 6 · security 6 · complexity 7.

### 4.22 workflows.ts — 668 LOC, 14 routes
Cleanest file audited: express-validator everywhere, `requireRoles` on mutations, org-ownership check on every id access.
- [L] Sequential getById→getSteps pairs (:246-256, :302-307, :460-476); "getById + org check + 404" block ×9 (:248…:607); `(req as any).user.organization_id || organizationId` dual-casing ×12.

Scores: readability 8 · maintainability 8 · performance 7 · security 9 · complexity 8.

### 4.23 xero.ts — 181 LOC, 6 routes (1 public)
OAuth state/CSRF: present and correct (16 random bytes, one-time use :84-85, 10-min TTL :41-46; tokens never echoed :148-157).
- [H] (mount) `app.use('/api/v1', authenticate, requirePMAccess, xeroRoutes)` (index.ts:691-692) is another bare catch-all layer; the public callback mount (index.ts:688-689) sits AFTER the 597 catch-all → prod OAuth redirect 401s (see §5).
- [M] In-memory state store breaks OAuth on multi-instance/restart (:38). [L] localhost fallback URLs (:29, :34); `console.error` (:107); disconnect/sync have no role gate beyond requirePMAccess (:163, :173).

Scores: readability 8 · maintainability 7 · performance 8 · security 7 · complexity 8.

### 4.24 photos.ts — 829 LOC, 27 routes
- [H] IDOR — no org/project scoping anywhere (:128, :238, :286, :366, :407, :486, :509, :551, :566, :589, :643); contrast rfis.ts:83 `enforceChildProjectAccess`. Cross-org view/modify/delete of site photos.
- [M] `getUserId` falls back to `'system'`, org to `'default'` (:71-77); share-link password in query param + `GET /share/:token` behind the authed mount, defeating external sharing (:710-712, index.ts:608); sequential create loop ×20 files (:189-214).
- [L] Unguarded `JSON.parse(req.body.tags)` → 500 (:205); `GET /nearby` reachable only via next('route') fallthrough from `/:id` (:807, :126).

Scores: readability 7 · maintainability 6 · performance 6 · security 3 · complexity 6.

### 4.25 pullIntegrations.ts — 778 LOC, 12 routes
- [M] Double auth: mounted behind `requireIngestionAuth` (index.ts:211) AND `router.use(authenticate)` internally (:25) — API-key clients without JWT 401; one is wrong/redundant.
- [H-conf stub] `POST /endpoints/:id/test` returns hardcoded fake success `connection_successful: true, response_time_ms: 245` (:368-376) — misleads operators. Implement or 501.
- [M] `GET /endpoints` unpaginated, LEFT JOINs entire api_pull_jobs for 7-day aggregates per call (:52-92). [L] list+COUNT 2 round-trips (:488, :501). Validation coverage otherwise best of group (allowlisted dynamic UPDATE :222-237).

Scores: readability 7 · maintainability 7 · performance 6 · security 6 · complexity 7.

### 4.26 rfis.ts — 638 LOC, 16 routes
Org/project scoping otherwise best-in-class (`enforceChildProjectAccess` :83, `registerProjectAccessParams` :84, `requireProjectQueryAccess` :100).
- [H] Path traversal — `GET /attachments/:filename`: Express decodes `%2f`, `path.join(uploadsDir, filename)` (:622) normalizes outside uploads, `res.sendFile(filePath)` (:631) serves absolute paths → authenticated arbitrary file read (.env, keys). Fix: `path.basename()` or `res.sendFile(filename, { root })`.
- [M] Same route bypasses project access (no `:id` param → guard never runs) — cross-org attachment download (:619).
- [L] "userId required" block ×7 (:305-:552); manual required-field checks duplicate applied zod schemas (:235, :379); sync `fs.mkdirSync` at module load (:35-37).

Scores: readability 8 · maintainability 7 · performance 8 · security 5 · complexity 7.

### 4.27 vendors.ts — 555 LOC, 20 routes
- [H] IDOR — `GET /` queries `vendors` with NO organization_id filter (:68-96) — full cross-org vendor directory; update/approve/suspend/delete by bare id (:148, :169, :192, :215).
- [M] Identity from `req.body.createdBy/approvedBy/ratedBy` + `x-organization-id` header (:34-35, :171, :243, :317-318) — contradicts pmAuth.ts:76 ("NEVER falls back to x-user-id headers"); `const ts = teamService as any` disables type checking for 15/20 handlers (:18).
- [L] `/compliance/expiring`, `/top-rated` take organizationId from query string (:487, :536); literal routes after `/:id` rely on next('route') fallthrough (:513, :534).

Scores: readability 7 · maintainability 6 · performance 7 · security 3 · complexity 7.

### 4.28 procurement.ts — 246 LOC, 17 routes
- [H] Actor identity from `req.body.approvedBy || req.headers['x-user-id']`, never req.user (:63-64, :93, :104, :119, :130, :145, :210) — PO approval audit integrity broken.
- [M] organizationId from query/body/header (:27, :64, :237); no org check on `/:id`. Otherwise clean (zod :61/:77, consistent next(error)).

Scores: readability 8 · maintainability 8 · performance 8 · security 4 · complexity 8.

### 4.29 safety.ts — 266 LOC, 14 routes (raw SQL)
Org scoping on every query — best of the raw-SQL files; allowlisted dynamic UPDATEs (:70, :146, :217).
- [M] `COUNT(*)+1` incident numbering — duplicates under concurrency + reuse after delete (:55-56, :131-132, :202-203); COUNT-subquery + data query 2 round-trips ×3 lists (:29-34, :115-120, :186-191); list/update/delete builder pattern ×3 mirrored again in timesheets.ts.
- [L] `parseInt(limit)` NaN → pg error 500 (:33); GET `:id` ignores `:projectId` in WHERE (:43). Mounted via bare catch-all (index.ts:647-648) — see §5.

Scores: readability 7 · maintainability 6 · performance 5 · security 7 · complexity 6.

### 4.30 siteDiaries.ts — 114 LOC, 7 routes
- [M] organizationId only from query on list; `getAuthOrgId` never used; no org check on id routes — scoping rests on the service, unverified (:23, :43, :70, :83).
- [L] `submittedBy` prefers req.body over authenticated user (:56). Otherwise thin/clean (zod, next(error)).

Scores: readability 8 · maintainability 8 · performance 8 · security 5 · complexity 9.

### 4.31 submittals.ts — 352 LOC, 17 routes
- [M/H] Every actor field is `req.body.X || user.id` — body wins: reviews/submissions/voids recordable as any user (:67, :131, :151, :170, :194, :223, :241, :312).
- [M] `getAll` no organization_id filter; id routes unscoped; no enforceChildProjectAccess (rfis has it) (:29-49, :112, :134, :288).
- [L] `console.error` throughout; raw results vs `{success,data}` envelope inconsistency (:52-:87); `ballInCourt=me` copy-pasted from rfis.ts:111-113 (:37-39).

Scores: readability 7 · maintainability 6 · performance 8 · security 4 · complexity 7.

### 4.32 timesheets.ts — 282 LOC, 15 routes (raw SQL)
Org scoping consistent on every query.
- [H] Generic `PUT /time-entries/:id` allowlist includes `status`, `total_cost`, `hourly_rate` (:95) — self-approval + arbitrary cost, bypassing the approve endpoint (:111). Payroll integrity bypass.
- [M] Approve endpoints gated only requirePMWrite — workers approve own hours (:111, :209); clock-out recomputes hours but never total_cost → `/time-stats` undercounts labor (:74-89, :271-273); bare catch-all mount (index.ts:651-652) + `/projects/:projectId/time-entries` path collision risk with projects router.
- [L] COUNT double round-trips, NaN limit (:31, :164); no per-week uniqueness on timesheet create (:174-193).

Scores: readability 7 · maintainability 6 · performance 6 · security 4 · complexity 6.

### 4.33 transmittals.ts — 278 LOC, 13 routes
Zod validation strongest in the PM group (:40-92, length/array caps).
- [M] All `:id` operations by bare id — no org/membership check (:133, :160, :171, :184, :195, :206, :216, :224, :260, :270); `/stats` project_id from query, no access check (:121); upload stores the PRESIGNED URL as `file_url` — expires ≤7d, stored links go dead; `file_key` already saved (:236, :244-245).
- [H] (mount) public acknowledge/download token endpoints live inline in index.ts:696/716 AFTER the catch-alls → email links 401 in prod (see §5).
- [L] 500 for probable not-found/state errors + err.message leak (:163, :187, :198).

Scores: readability 8 · maintainability 7 · performance 8 · security 5 · complexity 7.

### 4.34 valuation-invoices.ts — 1,074 LOC, 22 routes
Mounted NO middleware; internal `router.use` auth gate at :40-51 exempts `/webhook/paystack` + `/public/*`. Public mutations are payment endpoints by design.

- [C] IDOR — GET/PUT `/:id`, `/send`, `/mark-paid`, `/cancel`, `/receipt` pass only the id; service is `SELECT * FROM valuation_invoices WHERE id = $1`, no org filter (:177-290; valuationInvoiceService.ts:314-316). `DELETE /:id` (:266-269) proves the correct org-scoped pattern exists. Cross-org read/edit/cancel/mark-paid.
- [H] `POST /webhook/nowpayments-ipn` NOT in the auth exemption list → authenticate 401s every IPN (:40-51 vs :776); `ipnCallbackUrl` (:493) points exactly there — the crypto "safety net" (:773-775) never fires; settlements depend on client polling.
- [H] `mark-paid` trusts client `amount` — written to paid_amount, status flipped, receipt minted, never compared to total (:228-246; service :1074-1105). Combined with the IDOR: cross-org "mark any invoice paid for GHS 1".
- [H] Dup cross-file — `verify-payment` (:686-723) + `initiate-crypto` (:458-572) near-identical to the inline pm-invoice handlers in index.ts:288-326/:327-438; ledger inserts already drifted (pesewas cols :519-526 vs gross_amount+ON CONFLICT index.ts:396-404).
- [M] Fail-open Paystack signature — `if (secret) {…}` skips verification when key unset; HMAC over JSON.stringify not raw body (:736-746). Polling endpoint does 1 HTTP + up to 6 sequential DB round-trips per poll (:579-679). Reconcile block copy-pasted between poller and IPN (~55 lines, :610-660 vs :832-892).
- [L] Hardcoded URL fallbacks (:361, :484, :493); non-UUID `:id` → pg cast error 500 (:177-187); `error.message.includes('draft')` status mapping (:193-203).

Scores: readability 6 · maintainability 5 · performance 5 · security 3 · complexity 5.

### 4.35 valuation-clients.ts — 203 LOC, 9 routes
Mounted authenticate; in-file `requireServiceAccess('valuations')` + `requireOrganization()` (:11-13).
- [H] `POST /:id/send-email` — arbitrary `to` recipient override (:169) + unsanitized `messageBody` into branded HTML (:183): open relay/phishing vector on PropMetrik sending infra.
- [M] `stack: error.stack` returned to clients (:41); dead `orgId === 'default'` dev-fallback block duplicated ×7 (:49-:160 — requireOrganization already guarantees the claim).
- [L] `console.log` of headers per list call (:20, :39-40); empty-string org passed (:88); no total count for pagination (:37).

Scores: readability 7 · maintainability 6 · performance 8 · security 5 · complexity 6.

### 4.36 valuation-org.ts — 499 LOC, 14 routes
Mounted NO middleware; internal auth verified — only the two token-gated invitation endpoints are public (defined before `router.use(authenticate)` :111-112). No unauthenticated mutations.
- [H] Cross-org valuation-team tampering — `POST/GET/DELETE /valuations/:id/team` no authorize(); service unscoped `WHERE valuation_id=$1 AND user_id=$2` (:427-497; orgTeamService.ts:479-495, :502-509).
- [H] Invitation revoke IDOR — authorize present but service is `WHERE id=$1 AND status='pending'`, no org filter (:262-277; orgTeamService.ts:308-315).
- [M] `/invitations/:id/resend` has NO authorize AND unscoped service (:283-298; service :349-360); org/user spoof via `x-organization-id`/`x-user-id` fallbacks, no requireOrganization on this router (:193, :233, :338, :366, :398, :194/:307/:430); duplicates serviceTeam.ts:84-317 member-management with a different enforcement model (the RBAC-incident inconsistency class).
- [L] `accept-and-setup` creates users/Keycloak accounts unthrottled (:66-105); VALID_ORG_ROLES fallback duplicated and already drifted (:134-147 vs :166-178).

Scores: readability 7 · maintainability 6 · performance 7 · security 4 · complexity 6.

### 4.37 valuationAnalytics.ts — 354 LOC, 15 routes
Cleanest of the valuation suite (consistent asyncHandler, no SQL).
- [M] `POST /compute-snapshot` reachable with read-scope external API keys — analyticsApiAccess grants on scope 'read' regardless of HTTP method (:344-352; analyticsApiAccess.ts:78-82).
- [L] `GET /sensitivity/:valuationId` returns any valuation's sensitivity to any key holder (:289-299 — needs an explicit design decision); `new Date(date)` unchecked → 500 (:347-350); no caching on dashboard-hot endpoints despite Redis being available.

Scores: readability 9 · maintainability 8 · performance 6 · security 7 · complexity 9.

### 4.38 valuers.ts — 563 LOC, 8 routes
Mounted authenticate + requireServiceAccess('valuations'). No ownership model at all.
- [H] Cross-org signature forgery — valuers rows are global (INSERT :419-447 has no organization_id); any valuations user can `PUT /:id` any valuer and `POST/DELETE /:id/signature` — replacing the digital signature embedded in sealed reports (:206-306, :312-345, :465-561).
- [M] `POST /` "(admin only)" comment, no admin check; `license_status` hardcoded 'active' (:348-459, :437); base64 signature path bypasses multer 2MB/PNG-JPEG filter — client-controlled contentType (`image/svg+xml` → stored-XSS via presigned URL) (:231-245, :255).
- [L] Presigned-signature block copy-pasted (:106-119 vs :147-161); no pagination on `GET /` (:73-88). Positive: whitelist-driven dynamic UPDATE (:488-544), no injection.

Scores: readability 7 · maintainability 7 · performance 7 · security 4 · complexity 7.

### 4.39 publications.ts — 671 LOC, 26 routes
- [H] The file's PUBLIC section (`/taxonomy` :148, `/public` :156, `/public/:slug` :182, `/indices*` :212-254, `/newsletter/subscribe` :263) sits behind the authenticate mount (index.ts:786-787) — marketing-site requests 401. Dead code or broken feature; fix via `publicationsPublicRouter` export (xero pattern).
- [H] No role gating on platform-wide admin ops — any valuations customer can create/publish/archive/delete platform publications, publish official index values, and `GET /newsletter/subscribers` dumps subscriber PII (:359-437, :641-649, :659-669).
- [M] Header-spoofable identity fallback (:16-22, attribution at :362). [L] six Gemini AI endpoints unbounded content, no rate limit (:518-631); `GET /:id/pdf` redirects to persisted (expiring) presigned URL (:493-508); deprecated TAXONOMY duplicates (:78-90).

Scores: readability 7 · maintainability 6 · performance 7 · security 4 · complexity 7.

### 4.40 subscription.ts — 890 LOC, 30 routes
Mounted NO middleware (public pricing/verify by design); internal auth verified — every mutation carries authenticate (+authorize/requireSuperAdmin); public surface GET-only. Good hygiene: authorization codes stripped (:129); charge amounts server-derived (:211, :595); verify + webhook share one idempotent reconcile (:97; webhooks.ts:408).
- [C] Billing bypass — `requiresPayment = !paymentBypass && (payment_provider === 'paystack' || payment_provider === 'bank_transfer')` with client-supplied `payment_provider` (:156-168): send `{plan_slug:'enterprise', payment_provider:'crypto', start_trial:false}` → subscriptionService.ts:541 sets status 'active' with zero payment. Fix: whitelist provider; default payment_pending=true.
- [M] `PUT /admin/subscriptions/:id` writes raw body status via inline SQL, skipping enum validation + lifecycle side-effects (:763-788); Paystack initialize + FX-lock block duplicated signup vs invoice-pay (~60 lines, :186-254 vs :581-624); ownership check duplicated (:533-541 vs :567-573).
- [L] Sequential awaits on hot endpoints (:124-126, :749-750); public `GET /verify/:reference` unthrottled Paystack proxy (:95-103).

Scores: readability 7 · maintainability 6 · performance 6 · security 4 · complexity 6.

*(Sections 1–3, 4.41–4.45 (tenantPortal, team, serviceTeam, user-profile, rbac), 6, 7 pending final audit batch.)*
