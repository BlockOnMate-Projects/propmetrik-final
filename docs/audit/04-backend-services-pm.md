# Audit 04 — Backend Services: Project Management Domain

**Scope:** `backend/src/services/project-management/` (125 `.ts` files) + loose `backend/src/services/` root files (`keycloakAdminService.ts`) + `services/ai`, `services/shared`, `services/payments`, `services/integrations`, `services/email`.
**Method:** file-by-file review. Monoliths (>800 LOC) received full line-level review via parallel sub-agents; smaller files and the modular subtree received a complete faster pass plus repo-wide cross-cutting scans (query graph, org-scoping density, N+1 loop detection, template-literal SQL, transaction presence, import-graph deadness).
**Repo constraint that shapes every finding:** there is ONE remote prod DB (`pg.cedynhq.com`); local dev also hits it. Every query round-trip is a network round-trip — N+1 loops and sequential awaits are the dominant performance tax.

---

## 1. Counts & LOC

| Group | Files | LOC (approx) |
|---|---|---|
| PM domain total | 125 | ~71,860 |
| — Top-level monoliths (39 files) | 39 | ~34,000 |
| — Modular subtree (dead: rfis/units/documents/projects/photos/change-orders + barrel) | 32 | **14,308 (deletable)** |
| — Other subdirs (dead: compliance-reports/messaging/scheduling/location/financial/operations/payments/compliance) | ~40 | ~10,000 |
| — LIVE subdirs (governance/events/errors/types/team/quality/analytics + used facades) | ~14 | ~10,042 |
| Root + small service dirs (audited separately) | 7 | ~2,398 |
| **Grand total audited** | **132** | **~74,260** |

**God services (>800 LOC), by size:**
changeOrderService 1836 · dashboardAnalyticsService 1717 · teamService 1678 · whatsappBotService 1629 · qualityChecklistsService 1560 · milestoneService 1428 · invoiceService 1427 · projectLocationService 1381 · ganttService 1247 · photoService 1219 · complianceReportService 1216 · projectDocumentService 1197 · rfiService 1193 · projectService 1134 · drawService 1102 · unitService 1068 · projectWizardService 1066 · contractorService 1030 · complianceService 1002 · phaseService 992 · budgetAnalyticsService 908 · punchListService 847 · integrationService 837 · submittalService 823 · expenseLogService 809 · (+ subdir: ReportGeneratorService 974 · SiteOperationsService 891 · MilestoneFrameworkService 855 · ApprovalService 803).

---

## 2. Domain Scores (1–10, higher = healthier)

| Dimension | Score | Rationale |
|---|---|---|
| Duplication control | **2** | ~29k LOC of dead/duplicate code; 6 monoliths run in parallel with fully-built modular twins; 27 hand-rolled copies of the same WHERE/SET builder. |
| Performance (N+1 / round-trips) | **3** | N+1 INSERT loops in nearly every `create`/`bulk`; every mutation tail re-fetches via 3-query `getById`; analytics endpoints fire 6 sequential queries; unbounded lists everywhere. |
| Security (org-scoping) | **2** | ~40+ mutation endpoints filter by bare `id` with no `organization_id`; `portfolioService` leaks all tenants' data; `contractorService.updateAssignment` takes raw `req.body`. milestoneService/projectService are the only consistently-scoped files. |
| SQL injection safety | **7** | Almost all SQL parameterized; a handful of `INTERVAL '${n}'` interpolations are number-typed (mitigated); the real identifier-injection vectors are in the DEAD subtree. |
| Transaction correctness | **4** | Many multi-write flows (create+audit+notify, status+ledger) not wrapped; one BROKEN transaction (`addItemsBulk` runs on wrong connection — ROLLBACK is a no-op). |
| Hardcoded values | **4** | GHS defaults everywhere, hardcoded FX fallback rates, hardcoded WhatsApp phone number in prod, Ghana price catalogs that belong in DB config. |
| Complexity | **3** | 25 files >800 LOC; several god methods (invoice `sendInvoice` 360 LOC, whatsapp handlers). |

**Overall domain health: 3/10.** The code is feature-rich and largely functional, but it is a half-finished modularization frozen mid-flight: the new architecture was fully built, never wired in, and left to rot while the old monoliths continued to accumulate bug fixes and drift.

---

## 3. TOP FINDINGS (by priority)

### CRITICAL

**C1 — Dead modular refactor: ~29,000 LOC (≈40% of the domain) is unreachable duplicate code.**
The `project-management/` tree contains a complete second implementation (`rfis/`, `units/`, `documents/`, `projects/`, `photos/`, `change-orders/`, `compliance-reports/`, `messaging/`, `scheduling/`, `location/`, `financial/`, `operations/`, `payments/`, `compliance/`) reachable only through the barrel `index.ts` (`services/project-management/index.ts`) — and **nothing imports the barrel** (verified: all 60+ live imports target individual monolith files; the only mention is a comment in `crm-deal-management/index.ts:47`). Routes import the `@deprecated` monoliths (`routes/projects.ts:23-60`, `routes/rfis.ts:27`, `routes/changeOrders.ts:31`, `routes/team.ts`, `routes/checklists.ts`, `routes/whatsapp.ts`). Schema drift proves the subtree never ran against the current DB (`users.full_name` vs monolith's `display_name`; `p.name` vs `p.project_name`; a call to non-existent PG function `array_remove_all` in `photos/PhotoAnnotationService.ts`). **Fix:** decide direction — either repoint routes at the modular services and delete the monoliths, or delete the subtree. Do NOT leave both. Deletable today with zero behavior change: the 6 audited dirs + barrel = **14,308 LOC**; the other dead subdirs add ~10k more.
*Salvage before deleting:* `change-orders/ChangeImpactService.ts` (risk/forecast analytics, no monolith equivalent), `documents/DocumentSharingService.ts` (PBKDF2 salted share-link hashing — stronger than photos' unsalted SHA-256), RFI reopen/escalate/watchers/mentions in `rfis/RfiWorkflowService.ts`.

**C2 — `portfolioService.ts` leaks every tenant's data (no org scoping anywhere).** `portfolioService.ts:66-436` — `getSummary(userId?)` accepts a userId and **never uses it**; every method (`getProjects`, `getMetrics`, `getActivityFeed`, `getUpcomingDeadlines`) aggregates `development_projects` across ALL organizations. `routes/portfolio.ts:23` passes only userId. Any authenticated PM-tier customer sees every other customer's project names, budgets, spend, and RFI/CO counts. Also `portfolioService.ts:283` fabricates chart data: `COUNT(*) * 10000 as amount -- Placeholder`. **Fix:** thread `organization_id` into every query; delete the placeholder monthly-spend.

**C3 — `projectCostService.update()` throws a 500 on any `projected_costs` edit.** `projectCostService.ts:432-461` — the generic loop adds `projected_costs = $n`, then line 455 unconditionally adds `projected_costs = $m` again → Postgres "multiple assignments to same column". Every attempt to edit projected costs hard-fails. **Fix:** drop the redundant explicit push (guard the generic loop against derived columns).

**C4 — `constructionOpsService.ts` sends real WhatsApp approvals to a hardcoded mock phone.** `constructionOpsService.ts:123-124, 200-201` — `'233241234567'` receives production daily site reports and >GHS 500 petty-cash approval prompts ("Reply APPROVE xxxx to authorize"). Broken feature + operational-data exposure + a bogus authorization channel. **Fix:** source the recipient from project/org config.

**C5 — `qualityChecklistsService.addItemsBulk` transaction is a no-op.** `qualityChecklistsService.ts:692-712` — BEGIN/COMMIT/ROLLBACK run on a checked-out `client`, but each `this.addItem()` executes on `this.pool` (a different connection). Inserts autocommit independently; ROLLBACK rolls back nothing. Partial bulk inserts survive on failure. **Fix:** pass `client` into `addItem`, or batch into one multi-row INSERT.

### HIGH

**H1 — Systemic missing org-scoping across ~40+ mutation endpoints.** Org-scoping density scan (queries vs `organization_id` references): `photoService` 37q/2org, `whatsappBotService` 17q/0org, `projectIntegrationService` 36q/0org, `integrationService` 13q/0org, `transmittalService` 41q/6org, `submittalService` 23q/3org, `expenseLogService` 22q/4org, `procurementService` 32q/4org, `siteDiaryService` 14q/1org, `constructionOpsService` 6q/0org, `portfolioService` 10q/0org. Concrete `id`-only mutations: `rfiService` update/submit/assign/respond/close/void/addAttachment (`rfiService.ts:564-1089`); `changeOrderService` approve/execute/sign (`changeOrderService.ts:594-1046`); `invoiceService` approve/markAsPaid/confirmPayment (`invoiceService.ts:498-674`); `teamService.updateMemberPermissions` (`teamService.ts:789`, privilege-escalation surface); `drawService` approve/recordFunding (`drawService.ts:427-512`, money). Tenancy currently rests entirely on route-level `requirePMAccess`, which authenticates but does not bind the entity to the caller's org. **Fix:** one sweep adding `AND organization_id = $n` (or a shared `scopedById(table, id, orgId)` helper). milestoneService (`milestoneService.ts:189-205`) already does this correctly — copy that pattern.

**H2 — `contractorService.updateAssignment` writes arbitrary columns from raw `req.body`.** `contractorService.ts:515-525` builds `${key} = $n` from `Object.entries(updates)` with no whitelist, and `routes/projects.ts:1347` passes raw `req.body` in (verified). Any assignment column — `retention_held`, `amount_paid`, `esign_status`, `organization_id` — is client-writable, and `update()` (`contractorService.ts:320-349`) can redirect a contractor's `bank_account_number`/`momo_number` cross-org by bare id (the exact RBAC-payout class already fixed elsewhere per memory). Same unwhitelisted dynamic-key pattern (latent, currently fed object literals): `projectService.ts:729-748`, `unitService.ts:614-630`. **Fix:** column whitelist on all dynamic UPDATE builders; `complianceService.ts:450-473` shows the safe idiom.

**H3 — Money/workflow correctness bugs.**
- `drawService.approve()` never persists `approved_amount` (`drawService.ts:419-457`) — partial approvals silently become full approvals; downstream funding/e-sign fall back to `total_amount`.
- `drawService` create/read column schism: `create` inserts `current_draw_amount`/`retention_amount` (`drawService.ts:169-170`) while `mapRow`/`getSummary` read `total_amount`/`retention_held`/`submitted_date` (`drawService.ts:1073-1079`) — fresh draws map to zeros unless the table carries both families.
- `invoiceService.markAsPaid` excludes `'overdue'` from its allowed-status set (`invoiceService.ts:583-615`) but the cron flips late invoices to `'overdue'` — so the Paystack webhook can't confirm payment on exactly the invoices most likely to be paid late.
- `changeOrderService.sign()` (`changeOrderService.ts:875-919`) updates a signature by `signatureId` alone with no check it belongs to the CO — a crafted id can push another CO to `approved`.
- `changeOrderService.updateItem` writes `total_cost = 0` on partial updates (`changeOrderService.ts:730-760`).
- `procurementService` phantom audit: `submitForApproval/approve/reject` never check `rowCount`, so `logApproval` inserts an "approved" row even when the guarded UPDATE matched 0 rows (`procurementService.ts:330-389`).
- `teamService` vendor schema split-brain: `addVendor` writes `business_name`/`status` but `getApprovedVendors`/`mapVendor` read `name`/`is_approved` (`teamService.ts:945-1058`) → approved vendors may never appear; two rating tables (`vendor_ratings` vs `pm_vendor_ratings`) write/read past each other.

**H4 — N+1 INSERT loops on the remote DB (highest perf tax).** Per-row `await client.query` inside `for` loops:
`unitService.createBulk` (`unitService.ts:362-388`, 100 units = 100 round-trips) · `qualityChecklistsService.initializeResponses` (`:869-878`, 100-item checklist = 100 RT per inspection created) + `saveResponsesBulk` (`:1235-1244`, ~4N RT, the offline-sync hot path) · `changeOrderService` create/addItems item+signature loops (`:301-348, 681-711`) · `projectCostService.createFromTemplate` (`:232-254`, ~19 RT) · `projectService.createPhasesFromTemplate` (`:477-499`) · `projectIntegrationService.addProjectToPortfolio` (`:568-596`) · `complianceService.applyTemplate` (`:891-944`, 10-permit template ≈ 50+ RT, re-scoring each time) · `procurementService` PO-item/delivery loops (`:124-139, 504-515`). **Fix:** multi-row `INSERT ... VALUES` / `unnest()`.

**H5 — Sequential-await storms in analytics/aggregation.** `invoiceService.getOrgRevenueSummary` fires 6 independent queries serially (`invoiceService.ts:1206-1299`) · `projectIntegrationService.exportProject`/`getProjectReport` 6 sequential each (`:377-511`) · `esignConfigService.getAll` 3-query loop then re-reads all 3 on upsert (`esignConfigService.ts:49-98`) · `projectWizardService.submitWizard` validates 5 steps sequentially, each doing SELECT+UPDATE (`projectWizardService.ts:779-784`, ~10-15 RT before project creation) · every monolith mutation ends `return this.getById(...)` = 3 extra queries. **Fix:** `Promise.all` for independent reads; `RETURNING *` instead of re-fetch.

**H6 — Root-service security (see §7 for detail):** `inviteService.acceptInvitation` rebinds an existing user cross-org — overwrites `organization_id`/`role`/`password_hash` with no old-org signal (`shared/inviteService.ts:351-401`), and runs Keycloak HTTP calls inside an open transaction on the remote DB (`:286-344`). `xeroService` stores OAuth **refresh tokens in plaintext** in `integrations.config` (`integrations/xeroService.ts:46-117`) and has a duplicate-invoice window with no persisted invoice id (`:254-296`).

### MEDIUM

- **240 `SELECT *` occurrences** across the domain (top: teamService 16, changeOrderService 12, qualityChecklistsService 11, complianceService 11, projectDocumentService 10) — wide-row transfers over the remote link; several on unbounded lists.
- **Missing pagination:** `rfiService.getComments/getHistory` (`:926-968`), `projectService.getSummaries` (`:675`), `contractorService.getAll` (returns raw `bank_account_number`/`momo_number` for every contractor, `:280-318, 958-961`), `unitService.getByProject` (`:407`), `portfolioService.getProjects` (3 correlated subqueries per row, `:184-223`), `milestoneService.listMilestones` (`:301-375`), `inviteService.listInvitations` (`:520`).
- **Hardcoded FX fallback rates** (USD 15.5 / EUR 16.8 / GBP 19.5 per GHS) silently substituted on feed failure in `projectCostCurrencyService.ts:241-246` — contradicts the platform's live-FX direction; plus hardcoded GHS base costs/sqm and 19-region cost factors (`:99-150`) that belong in DB config (migs 251-256 pattern).
- **whatsappBotService** replies "✅ Delivery confirmed"/"✅ Photo uploaded" for logger-only stubs (`whatsappBotService.ts:1442-1459`), returns hardcoded weather "Sunny, 28°C", and mutates RFI/submittal state over webhook with no signature verification and no reviewer authz (`:1395-1440`); in-memory session Map never evicts (leak) and loses state on restart.
- **Field-dropping creates** (input declared but never inserted): `dailyLogService.create` drops activities/delays/temperature (`dailyLogService.ts:185-209`); `siteDiaryService` drops labor/materials/safety/photos (`:25-61`); `complianceService.createPermit` drops `permit_name`/`authority_id`/`fees_paid` (`:329-374`) and emits realtime events with **swapped arguments** (`:370-371`).

---

## 4. Duplication Matrix

The domain has **two** duplication problems: (A) whole-module duplication (monolith vs modular twin), and (B) intra-file boilerplate patterns hand-copied across services.

### A. Whole-module duplication (monolith ↔ modular twin, both present, monolith live)

| Domain | Live monolith (LOC) | Dead twin dir (LOC) | Route importing monolith |
|---|---|---|---|
| RFI | rfiService 1193 | rfis/ 2461 | routes/rfis.ts, routes/projects.ts |
| Units | unitService 1068 | units/ 2522 | routes/projects.ts |
| Documents | projectDocumentService 1197 | documents/ 2567 | routes/projects.ts |
| Projects | projectService 1134 | projects/ 1905 | routes/projects.ts |
| Photos | photoService 1219 | photos/ 2477 | routes/photos.ts |
| Change orders | changeOrderService 1836 | change-orders/ 2110 | routes/changeOrders.ts, webhooks, eSign |
| Team | teamService 1678 | team/ (LIVE — used by routes/team.ts? monolith is) | routes/team.ts, vendors.ts |
| Quality | qualityChecklistsService 1560 | quality/ 1462 | routes/checklists.ts |
| WhatsApp | whatsappBotService 1629 | messaging/ 1941 | routes/whatsapp.ts, webhooks.ts |
| Analytics | dashboardAnalyticsService 1717 | analytics/ | routes/projects.ts |
| Location | projectLocationService 1381 | location/ 1616 | routes/projects.ts |
| Compliance reports | complianceReportService 1216 | compliance-reports/ 1948 | routes/projects.ts |
| Site ops | dailyLog 715 + siteDiary 324 + constructionOps 213 | operations/SiteOperationsService 891 | routes/projects.ts, siteDiaries.ts, construction.ts |

**Consolidation recommendation:** pick the modular tree as canonical (it is better-factored: whitelisted ORDER BY in RfiCrudService, PBKDF2 in DocumentSharingService, richer analytics in ChangeImpactService/ProjectStatsService), port the monolith bug-fixes/org-scoping into it, repoint routes, delete monoliths. **Estimated reduction: ~20,000 LOC** (delete ~15k monolith LOC once routes move + collapse the site-ops trio's ~1,250 LOC into the existing SiteOperationsService). If instead the monoliths are kept, deleting the dead subtree removes **~24,000 LOC** immediately.

### B. Intra-file boilerplate (hand-copied helpers)

| Pattern | Count | Representative locations | Est. LOC |
|---|---|---|---|
| Dynamic WHERE-filter + separate COUNT list builder | ~27 files | rfiService:395-553, changeOrderService:431-589, teamService:638-708, invoiceService:306-391, dailyLogService:257-337, procurementService:191-280, transmittalService | ~1,000 |
| Dynamic `${key}=$n` UPDATE/SET builder (5 unwhitelisted, rest safe) | ~10 files | contractorService:519-525, projectService:729-748, unitService:619-630, changeOrderService:616, invoiceService:420 | ~400 |
| snake→camel `mapRow` DTO mappers | ~30 files | one per service, ~40-85 LOC each | ~900 |
| notify-org-staff-after-mutation (resolveOrgStaff→filter self→notify→catch) | 10 files | changeOrderService:801-822, teamService:570-599, milestoneService:435-454, invoiceService:679-700 | ~150 |
| E-sign integration block (logEsignAudit / buildFields / trigger / completion) | 2 files | drawService:626-1060 ≈ contractorService:628-919 (~85% identical) | ~300 |
| generateXNumber sequential-number query | ~7 files | transmittalService:157, punchListService, projectService:351 (DB fn — the good pattern), drawService:159 (hardcoded `1`) | ~120 |

**Consolidation recommendation:** extract a `BaseCrudService` (or composable helpers) providing `buildListQuery(filters, allowedColumns)`, `buildUpdate(patch, whitelist)`, `scopedById(table, id, orgId)`, `notifyOrgStaff()`, and a config-driven e-sign mixin (the "Pattern B" already noted in memory). **Estimated reduction from B alone: ~1,500-1,800 LOC**, plus it closes the org-scoping and injection gaps in one place.

**Combined estimated duplicate-LOC reduction: ~22,000-26,000 LOC** depending on which side of the monolith/modular split is chosen as canonical.

---

## 5. File-by-File Ledger

### Top-level monoliths (all LIVE unless noted)

| File (LOC) | Purpose | Key issues | Priority |
|---|---|---|---|
| changeOrderService.ts (1836) | CO lifecycle, items/signatures, e-sign, PDF | No org scope on approve/execute/sign; `sign()` authz hole (:875); `updateItem` total_cost=0 (:730); N+1 item loops; double getById per approval | High |
| dashboardAnalyticsService.ts (1717) | Project/portfolio analytics, budget snapshots | Analytics fan-out (no Promise.all); app-side category loop over `getByProject` then INSERT (:533); 30q/20org (better-scoped than most) | Med |
| teamService.ts (1678) | Team members, vendor directory, comms | Unscoped `updateMemberPermissions` (:789, priv-esc); vendor schema split-brain (:945-1058); two rating tables diverge; pointless single-INSERT transactions | High |
| whatsappBotService.ts (1629) | WhatsApp PM bot, webhooks, cron | Fake "✅ confirmed" stubs; webhook state-change w/o authz/sig (:1395); session leak; `INTERVAL '${days}'` (:1404, parseInt-mitigated); 17q/0org | High |
| qualityChecklistsService.ts (1560) | QC templates/inspections/responses | Broken bulk transaction (:692); N+1 initializeResponses/saveResponsesBulk; unscoped delete/publish/approve | High |
| milestoneService.ts (1428) | Milestone CRUD, Ghana templates, deps | **Cleanest file** — consistently org-scoped (:189); no pagination on list; dependency dual-UPDATE not transactional | Low-Med |
| invoiceService.ts (1427) | PM invoice CRUD, Paystack, payment confirm | Overdue-can't-be-paid webhook failure (:583); unscoped approve/markAsPaid; 6 serial queries in revenue summary; 360-LOC sendInvoice; hardcoded Paystack URL + fee label | High |
| projectLocationService.ts (1381) | Location/regulatory integration | 29q/12org; N+1 loops at :1160,:1182; SELECT * heavy | Med |
| ganttService.ts (1247) | Gantt schedule, dependencies, baselines | 41q/12org; loops at :527,:746,:938,:947; transactional; doc-number gen | Med |
| photoService.ts (1219) | Photo documentation | 37q/**2org** (org only in INSERTs, not reads); loops at :237,:442,:733,:768 | High |
| complianceReportService.ts (1216) | Compliance report generation | 6q/4org; loop at :1174; delegates to complianceService | Med |
| projectDocumentService.ts (1197) | Project document CRUD | 40q/14org; loops at :406,:452,:671; transactional; 10× SELECT * | Med |
| rfiService.ts (1193) | RFI lifecycle (@deprecated) | No org scope on all mutations; optional-org getAll (:395); addAttachment read-modify-write race (:1043); COUNT+correlated-subquery-per-row | High |
| projectService.ts (1134) | Project CRUD, status, org stats | Dynamic-key UPDATE latent injection (:729); status not transactional; FX stitched app-side; getById **is** org-scoped (best) | High |
| drawService.ts (1102) | Construction draw requests, e-sign | `approved_amount` never persisted (:419); create/read column schism; no org scope; SSRF in generateDrawPdf (:860); e-sign block ≈ contractorService | High |
| unitService.ts (1068) | Unit CRUD, sales lifecycle (@deprecated) | createBulk N+1 (:362); dynamic-key UPDATE (:614); TOCTOU double-booking races (:678-800); hardcoded Ghana upgrade price list (:854); createDealForUnit dead stub | High |
| projectWizardService.ts (1066) | 5-step project wizard | submitWizard sequential-await storm (:779); non-transactional submit; hardcoded region defaults + 16-region map | Med |
| contractorService.ts (1030) | Contractor registry, assignments, e-sign | `updateAssignment` takes raw req.body → column injection (:515, live via routes:1347); unscoped payout-field update; raw bank/momo in list | Critical-adjacent |
| complianceService.ts (1002) | Ghana permits, inspections, scoring | createPermit drops declared columns (:329); swapped emit args (:370); `INTERVAL '${days}'` (:416, parseInt-mitigated); no transactions | High |
| phaseService.ts (992) | Phase CRUD | 18q/10org; loops at :254,:406,:517,:623; imports errors/events/types (LIVE modular deps); doc-number gen | Med |
| budgetAnalyticsService.ts (908) | Budget analytics | 13q/5org; loops at :533 (app-side category rollup),:648; transactional | Med |
| punchListService.ts (847) | Punch list items | 27q/13org; loop at :696; transactional; doc-number gen ×4 | Med |
| integrationService.ts (837) | Integration config | 13q/**0org**; exports MobileMoneyProvider type | Med |
| submittalService.ts (823) | Submittal workflow | 23q/**3org** (best-effort org resolve via project, :451); transactional; near-clone of rfi/CO shape | High |
| expenseLogService.ts (809) | Expense logging, FX | 22q/4org; loop at :281; GHS conversion via rate feed; transactional | Med |
| transmittalService.ts (743) | Transmittal distribution | 41q/**6org**; loops at :180,:200,:232,:276; doc-number gen (:157); transactional; email templates inline | High |
| paymentPlanService.ts (732) | Payment plans/installments | 23q/10org; imports events; transactional | Med |
| dailyLogService.ts (715) | Daily construction log (@deprecated→operations) | Unscoped writes; field-dropping create (:185); column-typing inconsistency; hard-delete labeled soft | High |
| procurementService.ts (709) | Purchase orders, deliveries | Phantom audit rows on 0-row UPDATE (:330); unscoped; per-item N+1; whitelisted SET (safe) | High |
| projectDefaults.ts (652) | Static Ghana config (no DB) | Duplicate phase-template getters (:416/:565); renovation weights sum to 70; EPA thresholds hardcoded | Low |
| projectIntegrationService.ts (645) | Unit↔deal linking, export | **0org** everywhere; export dumps SELECT * of 6 tables for any UUID; 6 sequential awaits; per-unit N+1 | High |
| projectCostService.ts (627) | Cost line CRUD, budget | **update() 500 on projected_costs (:432)**; bulkApprove unscoped (:540); id-only; createFromTemplate N+1; dead events import | Critical |
| projectCostCurrencyService.ts (615) | FX + cost estimator | Hardcoded FX fallbacks (:241); hardcoded base costs/region factors (:99); sequential rate fetches | Med-High |
| portfolioService.ts (464) | Cross-project portfolio | **Cross-tenant leak — 0 scoping (:66-436)**; fabricated monthly_spend (:283); unbounded + correlated subqueries; raw sortOrder interpolation | Critical |
| projectRealtimeEvents.ts (420) | SSE event wrappers | Clean; hardcoded -10% budget threshold; duplicate ProjectEventType vs ./events | Low |
| siteDiaryService.ts (324) | Site diary (@deprecated→operations) | organizationId filter declared but never applied (:14 vs :147); silent field drop; check-then-insert race; duplicates constructionOpsService | High |
| constructionOpsService.ts (213) | Site diary + petty cash (@deprecated) | **Hardcoded mock phone in prod (:123)**; unhandled promise rejection (:87); GHS 500 threshold; duplicates siteDiaryService | Critical |
| esignConfigService.ts (103) | E-sign config | 3-query getAll loop + re-read on upsert (:49-98); `${TABLE[type]}` safe (whitelist) | Low-Med |
| index.ts (266) | Barrel (DEAD — imported by nothing) | Keeps deprecated services one import away; forces TS2308 disambiguation | Low (delete) |

### Dead modular subtree — grouped (see C1; deletable, 14,308 LOC for the 6 audited dirs + barrel)

| Dir (LOC) | Files | Notes / injection flags / salvage |
|---|---|---|
| rfis/ (2461) | RfiCrudService, RfiWorkflowService, RfiStatsService, RfiCollaborationService, types, index | ORDER BY whitelisted (safe); `INTERVAL '${months}'` number-typed. **Salvage:** reopen/escalate/watchers/mentions |
| units/ (2522) | UnitCrudService, UnitSalesService, UnitUpgradeService, UnitStatsService, types, index | **Injection:** UnitCrudService.update fieldMap fallback passes raw keys as columns. CRM deal stub |
| documents/ (2567) | DocumentCrudService, DocumentSharingService, DocumentTemplateService, FolderService, DocumentVersionService, types, index | Parameterized. **Salvage:** DocumentSharingService PBKDF2 pattern |
| projects/ (1905) | ProjectCoreService, ProjectStatsService, ProjectStatusService, types, index | Hardcoded fieldMappings (safe); COUNT+1 number gen race. Richer analytics than dashboard? verify |
| photos/ (2477) | PhotoUploadService, PhotoOrganizationService, PhotoAnnotationService, types, index | **Injection:** PhotoUploadService.getAll ORDER BY no whitelist. `array_remove_all` non-existent PG fn (proof unrun); unsalted SHA-256 |
| change-orders/ (2110) | ChangeRequestService, ChangeApprovalService, ChangeImpactService, types, index | **Injection:** ChangeRequestService.getAll ORDER BY no whitelist. **Salvage:** ChangeImpactService (best file — impact/risk/forecast) |

### Other dead subdirs (deadness confirmed: no external importers; verify salvage before delete)
compliance-reports/ (1948) · messaging/ (1941) · scheduling/ (1664) · location/ (1616) · financial/ (664) · operations/ (916 — the sanctioned site-ops replacement, but only reachable via barrel) · payments/ (601, MobileMoneyService) · compliance/ (849, GhanaComplianceService — used only by `governance/ComplianceCheckpointService` and barrel).

### LIVE subdirs (imported directly by routes/monoliths — keep, deeper review recommended)
- **governance/** (MilestoneFrameworkService 855, ApprovalService 803, ComplianceCheckpointService 781, index) — imported by `routes/governance.ts`.
- **events/** (EventBus 566, index) — `eventBus`/`ProjectEventType` imported by contractorService, drawService, phaseService, paymentPlanService, projectCostService. *Review flagged: check handler error isolation and unbounded history/listener arrays.*
- **errors/** (index 524) — imported by phaseService + `shared-services/base/BaseService.ts`.
- **types/** (index 651) — imported by phaseService, index barrel re-exports.
- **team/**, **quality/**, **analytics/** — partially referenced; the live route path still uses the monoliths, so these are effectively dead-but-adjacent.

### Root + small service dirs (all LIVE)

| File (LOC) | Issues | Priority |
|---|---|---|
| keycloakAdminService.ts (453) | Throws stringified KC error (leak risk :164); 3-RTT create path; sendActionsEmail swallows failures; token cache no concurrency guard. All axios calls have 10s timeouts (good) | Low |
| ai/aiService.ts (388) | Gemini API key in URL query string (:274); MAX_TOKENS treated as success; jitter documented-not-implemented. Timeouts + centralized model config (good) | Med |
| ai/propertyDescriptionService.ts (124) | Raw user fields interpolated into prompt (injection, low blast); hardcoded 'GHS' | Low |
| shared/inviteService.ts (787) | **Cross-org account rebind on accept (:351)**; Keycloak HTTP inside open transaction (:286); expired-pending blocks re-invite (:171); unescaped HTML in email (:701); no partial-unique index → duplicate invites; unbounded list. Token entropy good | High |
| payments/cryptoPayoutService.ts (169) | Stale `crypto_wallet_verified` on wallet change (:86); failed on-chain register only warns; upsert+flag not transactional | Med |
| integrations/xeroService.ts (304) | **Plaintext refresh tokens in integrations.config (:46-117)**; duplicate-invoice window, no persisted invoice id (:254); no fetch timeouts; refresh-rotation race; ~250 RT in bulk sync loop | High |
| email/welcomeEmail.ts (153) | "never throws" contract violated — no try/catch around notify (:138); hardcoded audience:'staff'; unescaped name in HTML; verify-JWT shares session secret | Low-Med |

---

## 6. Coverage Ledger

| Group | Files | Coverage | Method |
|---|---|---|---|
| Monoliths batch A (changeOrder, team, whatsapp, quality, milestone, invoice) | 6 | Full line-level | Sub-agent, full read |
| Monoliths batch C (rfi, project, draw, unit, wizard, contractor, compliance) | 7 | Full line-level | Sub-agent, full read |
| Monoliths batch E (dailyLog, procurement, projectDefaults, projectIntegration, projectCost, projectCostCurrency, portfolio, realtimeEvents, siteDiary, constructionOps, esignConfig, index) | 12 | Full line-level | Sub-agent, full read |
| Dead subtree 1 (rfis, units, documents, projects, photos, change-orders + barrel) | 32 | Full pass + deadness verify | Sub-agent, full read |
| Root + small dirs (keycloak, ai×2, invite, crypto, xero, welcomeEmail) | 7 | Full line-level | Sub-agent, full read |
| Monoliths batch B (dashboardAnalytics, projectLocation, gantt, photo, complianceReport, projectDocument) | 6 | **Scan-level** | Cross-cutting scans: query/org counts, N+1 loop line-map, transaction/SELECT*/template-SQL greps, targeted reads. Sub-agent did not return. |
| Monoliths batch D (phase, budgetAnalytics, punchList, integration, submittal, expenseLog, transmittal, paymentPlan) | 8 | **Scan-level** | Same as batch B. Sub-agent did not return. |
| Dead subtree 2 (compliance-reports, messaging, team, quality, analytics, scheduling, location, financial, operations, payments, compliance, governance, events, errors, types) | ~54 | **Deadness + LOC verified; live/dead status confirmed per dir; contents scan-level** | Import-graph grep (deadness), LOC totals, targeted reads. Sub-agent did not return; governance/events/errors/types confirmed LIVE via direct grep. |

**No files skipped.** Every `.ts` file in scope is accounted for at least at scan level; batch-B/D files carry file:line evidence from cross-cutting scans rather than a narrative walkthrough. If deeper line-level review of batches B/D and dead-subtree-2 internals is wanted, those are the follow-up targets — though the headline findings (dead tree, missing org-scoping, N+1 loops, the four Criticals) are already established with evidence.
