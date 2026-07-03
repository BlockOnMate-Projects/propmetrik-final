# Audit 07 — Backend Services: Property Management · CRM Deal Management · Analytics

**Date:** 2026-07-02 · **Auditor:** Staff-engineer file-by-file review (three parallel domain auditors + cross-domain verification pass)
**Repo:** `/Users/kobby/github/Cedyn Group/propmetrik` · **Method:** every file read in full; all dead-code claims verified by `grep -rn` over `backend/src --include=*.ts`; cross-domain claims re-verified independently. No source files modified.
**Context weighting:** the production DB is REMOTE (`pg.cedynhq.com:5434`), so round-trip count dominates latency — sequential awaits and N+1 loops are weighted as top-priority findings.

---

## 1. Scope & Counts

| Subdomain | Files | LOC | Files >800 LOC |
|---|---|---|---|
| `backend/src/services/property-management/` | 29 | 19,589 | applicationService 2,108 · paymentProcessor 1,299 · tenancyService 1,018 · tenantScoringService 944 · advancedFinancialService 898 · regionalPricingService 854 · bulkOperationsService 845 |
| `backend/src/services/crm-deal-management/` | 23 | 13,677 | dealService 1,472 · crmPropertySyncService 1,148 · commissionService 972 · documentGenerationService 953 · targetService 812 |
| `backend/src/services/analytics/` | 21 | 10,719 | valuationAnalyticsService 1,256 · ghaiService 1,171 · mlAnalyticsService 966 · constructionCostIndexService 908 |
| **Total** | **73** | **43,985** | **16 god files** |

## 2. Domain Scores (1–10)

| Dimension | Property Mgmt | CRM Deals | Analytics |
|---|---|---|---|
| Readability | **7** — consistent DTO→query→mapper structure, excellent comments (currencyFx, paymentProcessor FX); dragged by 2,100-line files | **7** — consistent structure, crmBridgeService exemplary docs; 5 files >800 LOC, in-file type sprawl | **7** — excellent JSDoc/provenance comments; 1,200-line classes |
| Maintainability | **4** — ~20% dead or schema-broken code still routed; arrears/portfolio-value/fees/notifications each exist in 2–4 divergent copies | **4** — 7 copies of the update-builder, 3 document subsystems, 3 commission-default sites, stale doc claims, stubbed deps | **5** — 3 schedulers write the same snapshots with divergent formulas; mlAnalyticsService duplicates 4 services' endpoints; scaffolding copy-pasted 3–8× |
| Performance | **4** — portfolio N+1 (7×N serial queries), vault full-scan + per-row MinIO, per-month INSERT loops, write-on-read arrears | **4** — sequential count+data everywhere, listPipelines/syncEmails N+1, `ALTER TABLE` lock on every deal update | **4** — hot endpoints recompute full-table aggregates per request while their own snapshot tables go unread; zero caching; row-at-a-time upsert loops |
| Security | **6** — parameterized + org-scoped almost everywhere, webhooks verified; but JSON-body HMAC, `Math.random()` OTPs, 2 unvalidated ORDER BYs, plaintext OAuth tokens | **3** — commission/target money mutations unscoped by org, 6 ORDER BY injection sites + direct `'${userId}'` interpolation, `updateTier` key injection, email header injection | **6** — strong `$n` discipline, WS gateway auth genuinely good; one real stored SQL injection (alertService) and cross-org valuer-email leak |
| Complexity | **4** — domain absorbed platform payments/e-sign/calendar/WhatsApp; 4 tenant-creation paths | **6** — functions simple; complexity is accidental (duplication, 3 activity-write paths, dual contributions schemas) | **6** — algorithms well-bounded; accidental complexity from duplication + triple-scheduler topology |

---

## 3. TOP FINDINGS BY PRIORITY

### CRITICAL

**C1. All CRM-generated PDFs are 0 bytes — puppeteer/Handlebars are stubbed with fakes.**
`crm-deal-management/documentGenerationService.ts:16-19` — `const Handlebars: any = { compile: (html) => () => html }` and `const puppeteer: any = { launch: () => ({ ..., pdf: () => Buffer.from([]) }) }`. `htmlToPdf` (:737-801) returns an empty buffer; all merge helpers (:86-134) are dead; `dealService.ts:1002-1009` sends these empty PDFs into e-sign envelopes. **Why:** every generated contract/offer "PDF" is empty, silently, including documents sent for legal signature. **Fix:** import the real libs (the working puppeteer pipeline already exists in `reporting/portfolioFinancialReportService.ts:445` and the valuation renderers) or route through a shared PDF service.

**C2. Stored SQL injection in analytics alert engine.**
`analytics/alertService.ts:586,595` — `` `AND LOWER(region) = LOWER('${rule.region}')` `` where `rule.region` is user-writable via `POST /alerts/rules` (`routes/analyticsFoundation.ts:390`, gated only by `apiAccess('analytics')`). Executed on every `evaluateAllRules()` cron tick. The only true injection in analytics (everything else is `$n`). **Fix:** parameterize (`= LOWER($1)`).

**C3. `ALTER TABLE deals DISABLE TRIGGER` inside every deal update.**
`crm-deal-management/dealService.ts:441-451` (updateDeal) and `:633-648` (updateDealStage). `ALTER TABLE` takes an ACCESS EXCLUSIVE lock on the whole `deals` table per update — all concurrent reads/writes on `deals` serialize behind it; deadlock-prone. The workaround's premise is stale (migration 064 creates `agent_commission_assignments`; 218_fix_deal_commission_trigger.sql exists). **Fix:** drop/fix the trigger in a migration; delete the DISABLE/ENABLE dance.

**C4. Fake transactions in bulk operations — pool-level `BEGIN`/`COMMIT`.**
`property-management/bulk/bulkOperationsService.ts:117/186/199, :254/331/344, :382/425/456, :648/706/712` — `db.query('BEGIN')` runs on `pool.query` (`database/index.ts:41`), so BEGIN lands on one pooled connection and subsequent statements on arbitrary others: zero atomicity, plus an idle-in-transaction connection left in the pool that can swallow unrelated statements. **Fix:** `pool.connect()` + client pattern (as `applicationService.convertToTenant` :1606 already does).

**C5. Payment verify race + non-transactional success path (money loss/double-record).**
`property-management/payment/paymentProcessor.ts:513-717` — idempotency is check-then-act (`SELECT` ledger :516, legacy :525) with no lock; the Paystack webhook (`routes/webhooks.ts:391`) and client verify endpoint can both pass the checks and double-record + double-apply rent. Worse, the success path (:556 UPDATE ledger → :632 recordPayment → :657 applyPayment) has **no transaction** — a crash after the ledger UPDATE marks status=success, so retry hits the early-return at :520 and the rent payment is permanently lost from schedules. **Fix:** `SELECT … FOR UPDATE` on the payment_transactions row as the idempotency gate + wrap the success path in one transaction; add unique index on `rent_payments` reference columns.

**C6. FIFO payment application is non-atomic.**
`property-management/rent-collection/rentScheduleService.ts:311-390` — per-schedule loop of INSERT + UPDATE (2×N statements) with no transaction and no row locking; `amount_paid` read at :350 then written at :369 is a lost-update race. Combined with C5's race this corrupts schedule state. **Fix:** single transaction + `SET amount_paid = amount_paid + $x` (or `FOR UPDATE`).

**C7. Commission money mutations have no org scoping; clawback double-reverses.**
`crm-deal-management/commissionService.ts` — `approveRecord` :546-555, `markAsPaid` :557-566, `createClawback` :568-610, `approveStatement` :724-746, `markStatementPaid` :748-774, `approveAdjustment` :832-841 (plus ~12 reads) all operate `WHERE id = $1` with no `organization_id`. Any authenticated user can approve/pay another org's commissions by UUID (routes must be audited; `approvePendingRecords` :922-928 shows the correct pattern). `createClawback` is also non-idempotent: the guard checks `original.is_clawback` but the first clawback only flips `status` (:604-607), so a second call inserts a second negative record — **double reversal of agent pay** — and the INSERT+UPDATE pair is transactionless. **Fix:** add org predicates everywhere; guard on status; wrap in a transaction.

**C8. ORDER BY injection pattern across 6 CRM list endpoints + direct userId interpolation.**
`types.ts:582-583` declares `sort_by?: string` unconstrained, then it is interpolated raw: `dealService.ts:318-320,345` · `taskService.ts:236-238,260` · `noteService.ts:201-203,221` · `contactService.ts:191-193,209` · `companyService.ts:189-191,208` · `crmDocumentService.ts:309-311,328`. Also `noteService.ts:115-117` interpolates `'${userId}'` directly (JWT-sourced today, one refactor from injectable), and `commissionService.updateTier` :277-283 builds SET clauses from unvalidated `Object.entries(updates)` keys. PM has the same class in two spots without allowlists: `financial-reporting/financialService.ts:141` and `documents/documentService.ts:169` (every other PM service allowlists, e.g. `tenantService.ts:178-179`). **Fix:** one shared sort-whitelist helper; column-key allowlists for dynamic updates.

**C9. 2,531 LOC of provably dead PM services querying phantom tables.**
`tenants/tenantScoringService.ts` (944), `pricing/regionalPricingService.ts` (854), `vendors/vendorSLAService.ts` (733) — zero importers repo-wide (grep-verified twice, including routes/jobs/frontend), and all query non-existent `pm_*` tables (`pm_tenants`, `pm_units`, `pm_vendor_slas`, …) so they would throw on first call anyway. Another ~1,500 LOC is schema-broken but still routed: `bulkOperationsService` rent-increase/import paths (:76 `ten.first_name` vs live `full_name`; `units` table :815), `calendarService.createLeaseEvents/createPaymentReminders` (:620-631, :733-740 — `t.start_date`, `units` join), `tenantWhatsAppService` bulk paths (:499-513, :557-569). **Fix:** delete the three dead files; fix-or-delete the schema-broken paths before traffic reaches them.

**C10. Platform-wide dashboard N+1: portfolio financial summary.**
`property-management/financial-reporting/advancedFinancialService.ts:787-895` — sequential `await getPropertyFinancialSummary()` per property (:820-857), each running ~7 queries (calculateNOI=3, occupancy, size, cash-flow, lookup) = **~7×N serial remote round-trips per dashboard load, explicitly uncached** (comment :788). 50 properties ≈ 350 serial round-trips. Also dragged into every PDF via `portfolioFinancialReportService.gatherData` :188. **Fix:** one set-based GROUP BY query (the pattern already exists in `reportingService.getBuildingPerformanceReport`) + short TTL cache.

### HIGH

**H1. Analytics hot paths recompute full-table aggregates per request while their own snapshot tables sit unread.**
`marketIntelligenceService.ts:132-136` (getPriceIndex always live; snapshot written :668-681, never read here) · `investmentScoringService.ts:108-115` (live; snapshot :513-556 written, its reader `mapOpportunityRow` :562-595 is dead) · `rentalAnalyticsService.ts:184-188` (header names `rental_yield_analytics` as source; never queried) · `valuationAnalyticsService` volume/method/quality always live (snapshot :1154-1249 read only by mlAnalyticsService) · `analyticsStreamSnapshots.ts:36` re-runs the live price index **per WS subscribe**. Zero in-process caching domain-wide. **Fix:** serve stored snapshots with live fallback, or add 60s TTL caches.

**H2. Three snapshot schedulers with divergent formulas + daily-rows-labeled-monthly bug.**
`analyticsScheduler.ts:50` (monthly) vs `jobs/analyticsRefreshJob.ts:59-64` (daily, same three `computeAndStoreSnapshot` calls) vs `economicDataScheduler.ts:850-880` (CCI with weights 55/30/10/5 vs `constructionCostIndexService.ts:102-104`'s 55/35/10 — and analyticsRefreshJob's own header warns not to duplicate CCI, yet `analyticsScheduler.ts:82-85` schedules it). Daily runs key rows on today's date with `period_type='monthly'` (`marketIntelligenceService.ts:644,679`; `valuationAnalyticsService.ts:1156,1233`) → ~30 "monthly" rows/month inflating every trend chart. **Fix:** one owner per snapshot table; period-truncate the snapshot date.

**H3. Phantom `crm_contacts` table breaks matching + email auto-link.**
No migration creates `crm_contacts` (domain table is `contacts`); queried at `propertyMatchService.ts:75,217` (both entry points throw) and `emailIntegrationService.ts:468,585` (per-row catch :497-499 silently swallows it — contact auto-link never works). `routes/crm/ai.ts` shares the assumption. **Fix:** rename to `contacts` or create a view.

**H4. Five independent Paystack integrations, two webhook-HMAC implementations, JSON-body HMAC.**
`property-management/payment/paystackService.ts` (full client, HMAC :221-228) vs `backend/shared-services/payments/paystack/index.ts` (second full client :173, HMAC :298-305) + raw `axios` calls at `src/index.ts:299`, `routes/valuation-invoices.ts:696,739-743` (third HMAC), `project-management/invoiceService.ts:841`, `project-management/integrationService.ts:218` (hardcoded `https://api.paystack.co`), `valuation-engine/valuationInvoiceService.ts:529`. The PM HMAC signs `JSON.stringify(req.body)` not the raw body — fragile vs Paystack's raw-byte signature. **Fix:** consolidate on the shared client; `express.raw()` + buffer HMAC.

**H5. `targetService` mutations unscoped + gamification event path dead.**
`crm-deal-management/targetService.ts` — `update` :338-343, `delete` :355-360, `updateProgress` :370-372, `createCheckpoint` :669-675 etc. all bare-id. `onDealClosed` :783-797 references non-existent columns (`assigned_agent_id`, `status='won'`, `closed_at`) AND has zero callers (grep-verified) — streaks/achievements/milestones never fire.

**H6. Per-month INSERT loop for rent schedules; double-waive corrupts expected_amount.**
`rentScheduleService.ts:133-179` — one INSERT per lease month (36 round-trips for a 3-year lease); `waiveLateFee` :491-494 subtracts `late_fee_applied` without checking `late_fee_waived`, so waiving twice corrupts `expected_amount` downward.

**H7. Document vault loads everything, migrates data-URLs inline.**
`property-management/documents/documentService.ts:272-425` — 3 unbounded queries merged/deduped/sorted in memory, paginated in JS (:564); per-row MinIO `getObjectSize` (:504) and synchronous data-URL→S3 migration + UPDATE inside the row loop (:474-482). **Fix:** SQL-side UNION ALL + LIMIT; move backfills out-of-band.

**H8. CRM per-list sequential COUNT+data (9 files) and hot N+1s.**
Sequential count→data pairs: `dealService.ts:323/331`, `taskService.ts:241/249`, `noteService.ts:206/214`, `contactService.ts:196/204`, `companyService.ts:194/202`, `crmDocumentService.ts:314/322`, `signatureService.ts:413/421`, `agentService.ts:172/180`, `crmDocumentTemplateService.ts:241/260` (only `emailIntegrationService.ts:581-592` uses Promise.all). `pipelineService.listPipelines` :180-197 queries stages per pipeline (dashboard hot path); `emailIntegrationService.syncEmails` :464-500 does 2 round-trips per email (~100/sync).

**H9. Analytics sequential-await fans on hot endpoints.**
`valuationAnalyticsService.getVolumeSummary` — 6 sequential independent aggregates (:190,206,224,242,260,276); `computePvmafByRegion` — 6 sequential (:717-737), uncached, run per `getMarketRelative` request; `constructionCostIndexService.getNationalSummary` — 6 sequential (:124-213); `mlAnalyticsService.getDashboardSummary` — 4 sequential (:144-193); `alertService.getSummary` — 4 sequential (:105-142) plus query-per-rule N+1 in `getMacroAlertStatus` (:506-507); `regionalCompositesService.computeRICI` — 4 sequential (:162-165); `ghaiService.computeAndStore` — ~48 sequential round-trips for 16 regions (:730-823).

**H10. Tenant-auth weaknesses.**
`property-management/auth/tenantAuthService.ts:694` — OTP digits from `Math.random()` (use `crypto.randomInt`); OTP attempt-counter race + resettable via new OTP requests (:347-380); per-request profile queries + write-on-read backfill on every session validation (:454, :516-626). `calendar/calendarService.ts:195-208` stores Google OAuth tokens plaintext and shares one `oauth2Client` across requests (:117, :259) — cross-org credential interleave hazard. `emailIntegrationService.ts:139-149` also stores OAuth tokens plaintext; `:244-249` allows SMTP header injection via unsanitized subject.

**H11. `createTenancy` missing org check on property.**
`property-management/leases/tenancyService.ts:51` — `SELECT id … FROM properties WHERE id = $1` despite the comment claiming org validation; cross-org property linkage possible.

**H12. `taskService.getUpcomingTasks` is broken SQL.**
`crm-deal-management/taskService.ts:542` — `INTERVAL '$2 days'`: the placeholder sits inside a string literal, never bound → runtime error. Fix: `NOW() + ($2 || ' days')::interval`.

**H13. Money math is float throughout both money domains.**
`commissionService.ts:408-423,594-596,875-884,960-961` (incl. hardcoded fallback `dealValue * 0.03` with agent_share=100%), `dealService.ts:110-113` (`deal_value * 0.05`), `rentScheduleService/rentCollectionService` `parseFloat` arithmetic on amounts. `paymentProcessor` correctly uses pesewa integers at :1243-1245 but mixes GHS metadata with `amount/100` fallback at :585 (records principal inflated by the service fee for externally-initialized payments).

**H14. Frozen CCI trend chart.**
`analytics/constructionCostIndexService.ts:171-177` — "last 24 months" query is `ORDER BY period_date ASC LIMIT 24` → returns the **oldest** 24 rows; once history exceeds 24 months the chart freezes forever. (The duplicate in `mlAnalyticsService.ts:242-247` uses DESC correctly.)

**H15. `generateLeaseDocument` transactionless multi-write with swallowed errors.**
`applicationService.ts:1234-1330` — void envelopes, terminate old tenancy, create new tenancy, update application, with `.catch(() => {})` at :1261/:1268; can leave a terminated tenancy with no replacement (contrast the correct `convertToTenant` :1606). Related: `sendLease` :1096 marks LEASE_GENERATED even when tenancy creation failed.

### MEDIUM (selected)

- **M1.** `INTERVAL '${n} days'`-style interpolation of route-derived numbers (defense-in-depth gap; `NaN` → 500): `tenancyService.ts:243,842` · `notificationService.ts:275,325` · `valuationAnalyticsService.ts:161,314,375,447,498,546,591-655,859,955,1094` (also `LIMIT ${limit}`) · `constructionCostIndexService.ts:345,355,481` · `floorPlanAnalyticsService.ts:105,227,263,331,411,439` · `mlAnalyticsService.ts:341` · `emailIntegrationService.ts:588`. The correct pattern already exists at `marketIntelligenceService.ts:166`.
- **M2.** Cross-org data exposure in analytics: `valuationAnalyticsService.ts:521,577` — valuer leaderboard/detail aggregate all orgs and return `COALESCE(u.full_name, u.email…)` — emails leak as `valuer_name`. `crmPropertySyncService` property reads unscoped (`:141-144, :235-237, :802-804`); `pipelineService.clonePipeline` source unscoped (:617-619); `contactMergeService`/`activityService` write-side gaps (`activityService.ts` createActivity accepts any deal UUID).
- **M3.** Fee/commission config hardcoded in code: `paystackService.ts:458-463` (PM 1%/GH₵25, projects 0.25%, deals 0.25%, valuation 2.5%) duplicating feeEngine defaults; `:533-534` legacy 1.0/25.0; `:440` `percentage_charge: 0.2`; commission defaults in three places with three values (`dealService.ts:110-113` 5%, `commissionService.ts:174,416,960` 0.03, `agentService.ts:253-254` 3.0/50.0 — different units too).
- **M4.** Fabricated metrics served as real: `portfolioService.ts:104,108,113` (occupancyTrend 0.5, valueTrend 2.4, collectionRate 94.2), `:266-276` (dummy occupancy trends); `financialService.calculateROI` :341 (`purchasePrice * 1.05` "dummy appreciation"); `marketIntelligenceService.getPriceIndexHistory` :304,306 (`index_value: 100`, `change_yoy: 0` placeholders); `mlAnalyticsService.ts:153,206` (`active_drift_alerts` always 0); `activityService.ts:159-181` (`avg_response_time_days` hardcoded 0).
- **M5.** Alert engine correctness: `alertService.ts:718-724` — `fetchPreviousMetricValue` always null → `change_gt`/`change_lt` rules can never fire (:441-445); `deviation` (:446-448) mislabeled (no stddev); `:623-628` wrong column for `transaction_count_change_yoy`.
- **M6.** Three arrears definitions in PM: `rentScheduleService.calculateArrears` :255 (canonical, but write-on-read via `updateScheduleStatuses` on every read), `rentCollectionService.getDefaultingTenants` :218 (months×rent approximation), `reportingService.getAgedReceivablesReport` :101-158 (buckets don't sum to total_owed). Three different numbers for the same tenant.
- **M7.** `commissionService.getSummary` :868 excludes clawbacks → `total_paid`/YTD overstate payouts after any clawback; identity-model mismatch `agent_id` joined to `users` (:373-375,:465,:660) while deals use `agents`.
- **M8.** Runtime DDL in services violates the manual-migrations workflow: `emailIntegrationService.ts:71-119`, `stackingPlanService.ts:19-64`.
- **M9.** Transactionless dependent-write pairs: `rentCollectionService.recordPayment` :38-106 (payment + financial record); `workOrderService` completion :361-369 (+ hardcodes currency `'GHS'` :737); `paystackService` dual-write payment_accounts/pm_payment_accounts :469-536 (money-routing state); `documentGenerationService.generate` :194-229; `stackingPlanService.upsertUnit` :242-266; `crmBridgeService.nextCrmReferenceNumber` :166-178 (MAX+1 race → duplicate reference numbers).
- **M10.** `floorPlanAnalyticsService.getSummary` :140 — averages/medians computed over a room-multiplied join, biasing toward room-heavy plans (`getByRegion` :199-232 is correct). `shortStayMetricsService` :176,185-187,308 — `COALESCE(price,0)` zeros crush ADR (the bug fixed in getMetrics :82-84 wasn't propagated). `rentalAnalyticsService` :490/:508 — possible 12× net-yield overstatement if `net_operating_income` is annual.
- **M11.** `crmPropertySyncService` — two incompatible `contributions` INSERT shapes (:498-521/:616-637 vs :719-743); failure path never increments `sync_attempts` (rolled back :247-252 vs post-rollback status write :337-340) so MAX_RETRIES is unenforced; sequential full-sync loops :881-927.
- **M12.** WS metering undercounts: `analyticsStreamServer.ts:325` fanOut bypasses the counting `send()` (:341-346) — billed `messagesOut` misses the bulk of traffic; per-channel sequential entitlement checks (:233-252).
- **M13.** `applicationService.getApplicationByToken` :502-539 raw-ID fallback bypasses token/expiry on a public PII endpoint; application-link `current_uses` increment not atomic (:411/:423-424).
- **M14.** `signatureService.cancelEnvelope` :480-512 never voids the external envelope — signers can still sign a "cancelled" contract; `resendRequest` :518-553 is a shipped always-throw stub; open transaction held across external e-sign call :210-286 (same pattern: `crmDocumentService.uploadNewVersion` :539-614 holds a transaction across a MinIO upload).
- **M15.** `documentGenerationService.storeDocument` :817-821 returns the key even when the MinIO upload failed → DB points at a nonexistent object, e-sign fetch 404s.

### LOW (grouped)

- Hardcoded modelling constants concentrated in analytics (weights/thresholds documented but code-resident; candidates for the DB-config pattern of migs 251-256): `housingDemandScoreService.ts:29` WEIGHTS {0.35,0.25,0.20,0.20}; `ghaiService.ts:111,121-141,201-226,277-289,1059-1062`; `investmentScoringService.ts:214-216,265-269,280-282,292-317`; `constructionCostIndexService.ts:102-106,143-144,791`; `regionalCompositesService.ts:167-170`; `propertyMatchService.ts:52-57` WEIGHTS 0.35/0.25/0.25/0.15; `marketIntelligenceService.ts:536-551` price buckets; `shortStayMetricsService.ts:227-229`; `developerPortalService.ts:30-47` tier limits.
- PM hardcoded literals: lease defaults 12 months / token 30 days (`applicationService.ts:307,376,1389`); late fee 5% / notice 30 days / 'Accra' in legal docs (`leaseTemplateService.ts:426-431,587,618`); 7% cap rate (`portfolioService.ts:97,241`) disagreeing with `advancedFinancialService.getMarketCapRate` :365-392 matrix (whose region keys don't match the enum → default 8.0 always fires) and with the live CapRateService; screening weights (`tenantService.ts:348,442,508`); invite expiry mismatch 7d vs 24h (`keycloakTenantOnboardingService.ts:41,111,143`).
- Dead/vestigial code (grep-verified): `investmentScoringService.mapOpportunityRow` :562-595 (DEAD high); `rentalAnalyticsService.mapRentalSummaryRow` :652-665 (DEAD high); `ghaiService._internal` :1161-1171 (DEAD medium); `commissionService.recalculateCommissions` :933-968 (DEAD high — also references non-existent `deals.owner_id/value`); `targetService.onDealClosed` (DEAD high); `crmPropertySyncService.calculateCredits` :1138-1143 + unused `crypto` import :18; `rentCollectionService.generateInvoice` discarded `paymentsQuery` :350 (dead query, live round-trip); `portfolioService.getOccupancyTrends` (DEAD medium, dummy data anyway); `regionalCompositesService.computeESSI` discarded `weightedMean` call :142-154; `portfolioService.overduePayments` :50 counter likely always 0.
- Barrel exports incomplete/misleading: `analytics/index.ts` exports 7 of 17 services; `crm-deal-management/index.ts:101-105` claims org-scoping/RLS that commissionService/targetService demonstrably lack.
- `mlServingClient.ts` clean; minor: retry wrapper skipped on some GETs (:538,586,649-724), retries non-idempotent POSTs (:490). `analyticsStreamServer` pre-auth DB lookup with no IP throttle (:132-158). `signedLeaseStorage.ts:49` SSRF surface if callers ever pass user URLs. `notificationService` SMS/WhatsApp are stubs returning fake IDs (:384,:420) while routes report sentCount. `tenantWhatsAppService` NULL-preference tenants filtered out of reminders (:512); sequential sends with sleep inside request handler (:543,596). `portfolioFinancialReportService` fresh Chromium per PDF (:445).

---

## 4. CROSS-DOMAIN DUPLICATION TABLE

| # | Concern | Locations (file:line) | Verdict |
|---|---|---|---|
| 1 | **Paystack client ×5, webhook HMAC ×3** | `property-management/payment/paystackService.ts` (client :129, HMAC :221) · `backend/shared-services/payments/paystack/index.ts` (client :173, HMAC :298) · `routes/valuation-invoices.ts:696,739` · `project-management/invoiceService.ts:841` · `project-management/integrationService.ts:218` · `valuation-engine/valuationInvoiceService.ts:529` · `src/index.ts:299` | Consolidate on shared client; raw-body HMAC |
| 2 | **Platform payment orchestrator living inside PM** | `property-management/payment/paymentProcessor.ts` handles deal (:345), project, valuation, subscription, crypto (:820+ → `shared-services/payments/crypto/*`) flows; imported by `routes/projects.ts`, `routes/crm/payments.ts`, `routes/subscription.ts`, `routes/webhooks.ts`. `services/payments/` contains only `cryptoPayoutService.ts` | Relocate beside feeEngine in shared-services/payments |
| 3 | **CRM commission "paid" bookkeeping vs unified ledger** | `commissionService.markStatementPaid` :748-774 records payment_method/reference with no link into `payment_transactions` (the ledger paymentProcessor/feeEngine write) | Parallel money books; reconcile |
| 4 | **Dual PM→CRM property sync paths + shared-table writes** | `crmBridgeService.ts` (syncPmPropertyToCrm :43, ensureCrmMirror :151) vs `crmPropertySyncService.ts` (syncToDataHub :224, syncDealTransaction :667, syncAllPending :901); `crm_properties` written by 5 CRM files + `property-management/properties/propertyService.ts:13` (bridge import); `crmPropertySyncService.ts:563-611` writes directly into PM-owned `properties` | Intentional bridge-not-merge, but two sync engines + shared-table writes need a single owner |
| 5 | **Notification stacks ×4** | Central `notify()` (`backend/shared-services/notifications/in-mail`) used by `workOrderService.ts:12`, `dealService.ts:24`, `taskService.ts:16`, `applicationService.ts:14`, `paymentProcessor.ts:30`, `tenancyService.ts:24` — vs legacy PM `notifications/notificationService.ts` (stubbed SMS/WhatsApp, imported only by `routes/propertyManagement.ts`) vs `tenantWhatsAppService.ts` vs `emailIntegrationService` direct Gmail/Outlook send (:244+). Rent reminders implemented 3× (notificationService :258, tenantWhatsAppService :498, `jobs/rentReminderJob.ts` — only the job is real) | Retire the legacy stub; route email/WhatsApp through the unified service |
| 6 | **computeAndStore snapshot scaffolding ×9 + triple scheduler** | Per-region sequential upsert loops: `ghaiService.ts:730-823` · `valuationAnalyticsService.ts:1202-1242` · `marketIntelligenceService.ts:668-719` · `investmentScoringService.ts:521-547` · `housingDemandScoreService.ts:130-156` · `infrastructureQualityService.ts:139-163` · `regionalCompositesService.ts:195-210` · `housingDeficitService.ts:110-136` · `constructionCostIndexService.ts:723+`; recompute-on-empty accessor ×4 (housingDemand :281, infra :177, deficit :151, composites :216-232); schedulers: `analyticsScheduler.ts:50-104` vs `jobs/analyticsRefreshJob.ts:59-64` vs `economicDataScheduler.ts:850-880` (divergent CCI weights) | Extract one snapshot-upsert helper; one owner per table |
| 7 | **FX/currency conversion reimplemented per domain** | `property-management/utils/currencyFx.ts` (good: cached, shared by 4 PM files) vs `project-management/projectCostCurrencyService.ts`, `budgetAnalyticsService.ts`, `expenseLogService.ts` vs `data-hub/economicDataService.ts` + scrapers vs `valuation-engine/*` (6 files) | PM's currencyFx is the model; promote to shared |
| 8 | **Statistics/math helpers duplicated** | Weighted-regression forecast: `constructionCostIndexService.ts:581-680` ≡ `ghaiService.ts:528-623`; normal CDF + INCOME_SIGMA 0.85: `ghaiService.ts:1059-1069` ≡ `rentalAnalyticsService.ts:377-393`; weighted-mean ×3 (`housingDemandScoreService.ts:244-252`, `infrastructureQualityService.ts:104-119`, `regionalCompositesService.ts:56-63`); region-key normalization ×8+ files (`analyticsStreamSnapshots.ts:21-23`, `regionalCompositesService.ts:31`, `ghaiService.ts:1104-1116`, `valuationAnalyticsService.ts:733,774`, `investmentScoringService.ts:258,417,427`, `infrastructureQualityService.ts:229`, `floorPlanAnalyticsService.ts:176`, richer `rentalAnalyticsService.resolveGssRegion` :156-170) | Shared `forecastUtils`/`regionKey`/`weightedMean` module |
| 9 | **mlAnalyticsService re-serves 4 other services' endpoints (drifted copies)** | `mlAnalyticsService.ts:216-286` vs `constructionCostIndexService.getNationalSummary` :121-223 (only one has the GSS-PPI blend; only one sorts trend correctly); :289-323 vs :282-316; :326-350 vs :325-377; :353-379 vs :447-499; :386-437 vs `ghaiService.getCurrent/getHistory` :314-361. Both route files mounted | Delete the copies; delegate |
| 10 | **PDF generation pipelines ×3** | `documentGenerationService.ts:737-801` (stubbed, broken) vs `property-management/reporting/portfolioFinancialReportService.ts:445` (working puppeteer) vs valuation-engine DOCX/PDF renderers | Reuse the working pipeline |
| 11 | **Two unit/floor models for the same concept** | `stackingPlanService.ts:19-64` (`crm_building_floors/units`, runtime DDL) vs PM multi-unit architecture (buildings = parent `properties` rows, units = child rows) | Disconnected models; converge |
| 12 | **E-sign envelope creation ×3 call-site patterns** | `dealService.ts:1002-1009` + `fetchDocumentFromUrl` :1417-1437 ≡ `signatureService.fetchDocumentContent` :326-346 (+ identical field geometry :1394-1409 ≡ :243-253) + PM Pattern B config-driven path | Consolidate in shared e-sign integration |
| 13 | **`deal_activities` written 3 ways** | `activityService.ts:29-37` (canonical: `user_id`, `subject`) vs `emailIntegrationService.ts:541-544` (`title`, `performed_by`) vs `contactMergeService.ts:300-306` — divergent column shapes; one mismatching set can roll back a whole merge | Route all writes through activityService |
| 14 | **Dynamic-update SQL builder hand-rolled ×7 in CRM** (+ PM equivalents) | `contactService.ts:244-326`, `companyService.ts:258-268`, `agentService.ts:331-337`, `taskService.ts:332-393`, `crmDocumentService.ts:445-495`, `pipelineService.ts:256-306`, `crmDocumentTemplateService.ts:282-333`; PM: `tenantAuthService.ts:665`, `tenantService.ts:279`, etc. | One helper; fixes C8 centrally |
| 15 | **Commission/fee defaults in 3+ places, 3 values** | `dealService.ts:110-113` (5%) · `commissionService.ts:174,416,960` (3% fraction) · `agentService.ts:253-254` (3.0/50.0 percent) · `paystackService.ts:458-463,533-534` (feeEngine duplicate) | One org-level DB config |
| 16 | **Org-scoping helper: NOT duplicated (positive finding)** | Single `getAuthOrgId` at `middleware/pmAuth.ts:90`; services take orgId params | Keep |

---

## 5. FILE-BY-FILE

Priority = highest-severity issue in the file. Line references for each issue appear in §3.

### 5a. property-management (29 files)

| File | LOC | Purpose | Issues | Priority |
|---|---|---|---|---|
| applications/applicationService.ts | 2,108 | Application lifecycle state machine, links, lease gen, tenant conversion | Re-read-before-every-transition (2× round-trips); transactionless `generateLeaseDocument` w/ swallowed errors (H15); raw-ID PII fallback (M13); link-use race; sendLease marks success on failure | High |
| payment/paymentProcessor.ts | 1,299 | Multi-rail payment orchestration + ledger + webhook reconcile | Verify race + transactionless success path (C5); GHS/pesewa fallback mix :585; ledger-insert non-fatal undermines idempotency :1289; sequential summary queries | Critical |
| payment/paystackService.ts | 563 | Paystack client + subaccounts + payment-account config | Duplicate of shared client (H4); JSON-body HMAC :221-228; dual-table money-routing write w/o txn :469-536; fee defaults in code :458-463 | High |
| leases/tenancyService.ts | 1,018 | Tenancy CRUD, activation, e-sign lease flow | createTenancy missing org check :51 (H11); e-sign completion 2 writes no txn :558-604; interval interpolation :243,842; fragile first-signer heuristic :553 | High |
| leases/leaseTemplateService.ts | 760 | Lease template CRUD + Handlebars generation | Default-unset + update transactionless :99-127,262; legal-doc constants in code (late fee 5%, 'Accra') | Medium |
| leases/signedLeaseStorage.ts | 66 | S3 ref parsing + signed-lease upload | Clean; SSRF surface if misused :49 | Low |
| rent-collection/rentCollectionService.ts | 500 | Payment recording, defaulters, collection report | recordPayment 2 financial writes no txn/idempotency :38-106; dead paymentsQuery :350; currency-mixing report :251-303; second arrears formula :218 | High |
| rent-collection/rentScheduleService.ts | 579 | Schedule generation, arrears, FIFO application, late fees | applyPayment non-atomic (C6); per-month INSERT loop :133-179 (H6); waiveLateFee double-waive :491-494; write-on-read arrears :255 | Critical |
| financial-reporting/advancedFinancialService.ts | 898 | NOI/CapRate/IRR/CoC/DSCR + portfolio summary | Portfolio N+1 ~7×N uncached (C10); IRR = NOI per year loop :398-437; FX mis-normalization :202-227/:823; hardcoded cap-rate matrix w/ mismatched region keys :365-392 | Critical |
| financial-reporting/financialService.ts | 407 | Financial record CRUD, cash flow, ROI | Unvalidated ORDER BY :141 (C8-class); fabricated ROI (`×1.05`) :341; 4 sequential queries :173-325 | High |
| reporting/reportingService.ts | 685 | Aged receivables, vacancy, performance, turnover | Receivables buckets don't foot :139-183; sequential turnover queries; otherwise the domain's best set-based SQL | Medium |
| reporting/portfolioFinancialReportService.ts | 478 | Branded portfolio PDF (puppeteer) | Fresh Chromium per PDF :445; inherits C10 via gatherData :188; `.catch(()=>null)` masks broken sections | High |
| portfolios/portfolioService.ts | 281 | Dashboard portfolio metrics | Hardcoded placeholder metrics served as real :104-113; dummy getOccupancyTrends :266-276; 7% cap rate :97,241; dead overduePayments metric :50 | Medium |
| utils/currencyFx.ts | 180 | Cached FX normalization + SQL CASE builders | **Clean** — best file in domain (TTL cache, in-flight dedupe, degraded flag) | Low |
| properties/propertyService.ts | 649 | PM property CRUD, multi-unit, geocoding, CRM bridge | Multi-unit create no txn :78-144; inline geocoding latency :163-189; listProperties no LIMIT :300-304; region map duplicates mig 241 :590-610 | High |
| documents/documentService.ts | 613 | PM documents + 3-source vault | Vault unbounded 3-way fetch + per-row MinIO + inline migration (H7); unvalidated ORDER BY :169 | High |
| maintenance/workOrderService.ts | 771 | Work order lifecycle + notifications + expense records | Completion write pair no txn :361-369; hardcoded 'GHS' expense currency :737; otherwise clean, org-scoped, allowlisted sort | Medium |
| maintenance/vendorService.ts | 289 | Vendor CRUD + rating | updateVendorRating no org scope :253; otherwise clean | Medium |
| tenants/tenantService.ts | 565 | Tenant CRUD, soft delete, naive screening | Unscoped subquery :165-171; screening constants in code; duplicates dead scoring engine conceptually | Low |
| tenants/tenantScoringService.ts | 944 | Rich tenant scoring engine | **DEAD (high confidence)** — zero importers repo-wide; queries phantom `pm_*` tables :141-163,791-810 | Critical (delete) |
| pricing/regionalPricingService.ts | 854 | Regional rent benchmarks + bulk rent increase | **DEAD (high confidence)** — zero importers; phantom `pm_*` tables; ~160 lines hardcoded rent tables :113-275 | Critical (delete) |
| vendors/vendorSLAService.ts | 733 | Vendor SLA definitions, breaches, leaderboard | **DEAD (high confidence)** — zero importers; phantom `pm_*` tables; latent N+1s :617,658 | Critical (delete) |
| bulk/bulkOperationsService.ts | 845 | Bulk rent increase, work orders, CSV import/export | Pool-level fake transactions (C4); schema-broken columns/tables :76,227-244,750-815 (dead-in-practice, medium); per-row loops 2N+ round-trips; unused notifyTenants param :29 | Critical |
| calendar/calendarService.ts | 794 | Google Calendar OAuth + PM events | Plaintext OAuth tokens + shared oauth2Client concurrency hazard :117,195-208,259; createLeaseEvents/createPaymentReminders schema-broken :620-631,733-740 | High |
| auth/tenantAuthService.ts | 719 | Tenant magic-link/OTP auth + sessions | `Math.random()` OTP :694 (H10); OTP counter race :347-380; write-amplified session validation :454,516-626; global tenant matching :678 | High |
| auth/keycloakTenantOnboardingService.ts | 458 | Keycloak tenant onboarding + token verify | Invite-expiry mismatch 7d vs 24h :41,111,143; ROPC password grant :227; setPassword-by-email trusts route gating :301; JWKS verification is good :367-391 | Medium |
| notifications/notificationService.ts | 468 | Legacy PM notification façade | SMS/WhatsApp stubs return fake IDs :384,420 while routes report sentCount; interval interpolation :275,325; N+1 reminder loops :281,331; superseded by shared notify() | High |
| notifications/tenantWhatsAppService.ts | 661 | Tenant WhatsApp sends + bulk | Bulk paths schema-broken :499-513,557-569; sequential sends w/ sleeps in-request :543,596; NULL-preference tenants excluded :512 | Medium |
| audit/auditTrailService.ts | 404 | PM audit logging + queries | **Clean** — parameterized, org-scoped, LIMITed, Promise.all | Low |

### 5b. crm-deal-management (23 files)

| File | LOC | Purpose | Issues | Priority |
|---|---|---|---|---|
| dealService.ts | 1,472 | Deal lifecycle, kanban, e-sign, PM close-loop, notifications | `ALTER TABLE DISABLE TRIGGER` per update (C3); ORDER BY injection :318-345 (C8); closeLoopOnWonDeal transactionless loop :539-592; `commission_rate` update silently broken :399 vs schema `commission_percentage`; unscoped e-sign path queries :922-934,1063-1071,1143-1170; sequential signer resolution :1257-1361 | Critical |
| crmPropertySyncService.ts | 1,148 | CRM property → data-hub sync + transactions | Two incompatible `contributions` shapes :498-521/:616-637 vs :719-743; unscoped property reads :141,235,802; retry counter never increments on failure :247-252/:337-340; sequential full-sync loops :881-927; dead calculateCredits :1138 | High |
| commissionService.ts | 972 | Commission plans/records/statements/clawbacks (money) | Org-scoping absent on all money mutations (C7); createClawback double-reversal + no txn :568-610; updateTier key injection :277-283; DEAD recalculateCommissions w/ phantom columns + hardcoded 3% :933-968; clawbacks excluded from totals :868; float money math throughout | Critical |
| documentGenerationService.ts | 953 | Template → HTML → PDF → MinIO generation | Puppeteer/Handlebars stubbed → 0-byte PDFs into e-sign (C1); 6 sequential merge-data queries :470-666; storeDocument hides upload failure :817-821; 3 writes no txn :194-229; silent placeholder stripping in legal docs :714 | Critical |
| targetService.ts | 812 | Sales targets, pacing, gamification, leaderboard | Unscoped mutations (H5); DEAD onDealClosed w/ phantom columns :783-797 — gamification never fires; N+1 loops :393,717-732,761-780; awardAchievement race :454-495; getAgentRank ignores period :638-645 | High |
| crmDocumentService.ts | 795 | CRM uploads/versioning vs shared `documents` + MinIO | ORDER BY injection :309-328; version-chain N+1 pre-walk :641-647; MinIO upload inside open txn :539-614; parallel storage abstraction to shared document-service | Critical (C8) |
| crmDocumentTemplateService.ts | 719 | Templates, merge-field registry, stage requirements | Global merge-field key cross-org clobber :464-481; order-index race :548-576; otherwise the only file with a proper shared/system visibility model | Medium |
| pipelineService.ts | 714 | Pipeline + stage CRUD, cloning, reordering | listPipelines N+1 :180-197 (dashboard hot path); clonePipeline unscoped source :617-619; per-stage update loops :561-568,658-692 | High |
| taskService.ts | 651 | CRM tasks, overdue/upcoming, stats, notifications | getUpcomingTasks broken bind-inside-literal :542 (H12); ORDER BY injection :236-260; otherwise well org-scoped | High |
| emailIntegrationService.ts | 636 | Gmail/Outlook OAuth, sync, send, tracking | syncEmails N+1 ~100 round-trips :464-500; phantom `crm_contacts` :468,585 (H3); header injection :244-249; plaintext tokens :139-149; wrong `deal_activities` shape :541-544; runtime DDL :71-119 | High |
| types.ts | 619 | Shared CRM types | Unconstrained `sort_by?: string` :582 (root enabler of C8); duplicate near-synonym deal fields :349-354 | Medium |
| signatureService.ts | 607 | Signature envelopes wrapping shared e-sign | cancelEnvelope never voids external envelope :480-512; resendRequest always-throws stub :518-553; txn across external call :210-286; duplicated fetch/geometry w/ dealService | Medium |
| noteService.ts | 518 | Polymorphic notes, privacy, FTS | Direct `'${userId}'` interpolation :115-117; ORDER BY injection :201-221; admin-override TODO :292-304 | Critical (C8) |
| agentService.ts | 484 | Agent CRUD, stats, invite-on-create | getAgentContacts wrong column `assigned_agent` vs `assigned_to` :447; hardcoded commission defaults :253-254; sequential stats | High |
| contactService.ts | 478 | Contact CRUD, lead scoring, stats | ORDER BY injection :191-209; 3 sequential stat queries :421-451; last_contact_at on any edit :329 | Critical (C8) |
| companyService.ts | 414 | Company CRUD + stats | ORDER BY injection :189-208; near carbon-copy of contactService scaffolding | Critical (C8) |
| contactMergeService.ts | 355 | Dup detection + transactional merge | Wrong `deal_activities` shape can roll back whole merge :300-306; 3 sequential O(n²) self-joins :64-163; allowedFields includes non-schema columns :213-218; otherwise best-engineered write path in domain | Medium |
| propertyMatchService.ts | 347 | Contact↔property weighted matching | Phantom `crm_contacts` :75,217 — both entry points likely throw (H3); hardcoded weights :52-57; org scoping correct | High |
| stackingPlanService.ts | 291 | Building floors/units stacking plan | Runtime DDL :19-64; parallel unit model to PM multi-unit; non-transactional upsert+count :242-266; hardcoded 'GHS'/'office' :44-53,251-255 | Medium |
| pipelineValidator.ts | 210 | Stage/transition validation | 3 sequential queries per transition :63-105; `!dealData[field]` falsy trap :167-207; clean otherwise | Low |
| activityService.ts | 190 | Append-only deal activity log (canonical shape) | createActivity accepts any deal UUID (write-side org gap); avg_response_time hardcoded 0 :159-181; clean otherwise | Low |
| crmBridgeService.ts | 178 | PM→CRM property mirror (bridge, not merge) | MAX+1 reference-number race :166-178; redundant existence checks :74-77/:151-160; exemplary documentation | Medium |
| index.ts | 114 | Barrel + module doc | Doc claims org-scoping/RLS that commissionService/targetService lack :101-105; 7 services not exported | Low |

### 5c. analytics (21 files)

| File | LOC | Purpose | Issues | Priority |
|---|---|---|---|---|
| valuationAnalyticsService.ts | 1,256 | Valuation volume/method/valuer/market-relative + snapshot | 6 sequential aggregates in getVolumeSummary; PVMAF 6 sequential uncached per request :712-765; cross-org valuer emails :521,577; interval/LIMIT interpolation ×10+; snapshot upsert loop :1202-1242 | High |
| ghaiService.ts | 1,171 | GHAI (MHAI/CHAI/RHAI) + forecasting + MDPI | ~48 sequential round-trips per computeAndStore :730-823; duplicated regression block w/ CCI :528-623; ~25 modelling constants in code (candidates for DB config); dead `_internal` :1161 | High |
| mlAnalyticsService.ts | 966 | DB analytics ↔ Python ML bridge | Wholesale drifted duplicates of CCI/GHAI/valuation endpoints (dup #9); 4 sequential dashboard queries :144-193; permanently-zero drift KPI :153,206; mislabeled component changes :257-270 | High |
| constructionCostIndexService.ts | 908 | CCI computation/query/forecast | Frozen 24-month trend (ASC LIMIT 24) :171-177 (H14); 6 sequential summary queries; third divergent CCI writer (H2); weights in code :102-106; duplicated forecast block :581-704 | High |
| alertService.ts | 771 | Threshold alert engine | **Stored SQL injection :586,595 (C2)**; change_gt/change_lt rules can never fire :718-724; mislabeled deviation :446-448; wrong metric column :623-628; N+1 macro status :506-507 | Critical |
| marketIntelligenceService.ts | 733 | Live price index / market activity | Always-live despite writing snapshots (H1); placeholder history values :304,306; DOM = listing age :355,458; daily-as-monthly snapshot keying :644,679; has the domain's best interval parameterization :166 | High |
| mlServingClient.ts | 732 | Typed axios client for ML service | **Clean**; minor retry inconsistencies :490,538,586,649-724 | Low |
| rentalAnalyticsService.ts | 668 | Rental yields/trends/benchmarks + GSS enrichment | Sequential GSS enrichment :315-355; catch-all masks outages as "no data" :259-261; possible 12× net-yield overstatement :490/:508; dead mapRentalSummaryRow :652-665; duplicated CDF/sigma w/ ghai :377-393 | Medium |
| investmentScoringService.ts | 598 | Composite investment scoring | Correlated COUNT subquery ×2 per row :178-186; getRegionalComparison/Detail re-run full live pipeline :362,466; snapshot written never read; dead mapOpportunityRow :562-595; dense hardcoded weight lattice :214-317 | High |
| floorPlanAnalyticsService.ts | 467 | Floor-plan/measurement analytics | Room-multiplied join biases all summary averages :140 (getByRegion :199 correct); interval interpolation ×6; fragile param index reuse :440 | High |
| analyticsStreamServer.ts | 375 | WS gateway /ws/analytics | Best-secured file in the 3 domains (API-key auth, entitlements, rate limits); metering undercount via raw fanOut :325 vs :341-346; sequential per-channel entitlement checks :233-252; pre-auth DB lookup no IP throttle :132-158 | Medium |
| shortStayMetricsService.ts | 355 | Occupancy/ADR/RevPAR | COALESCE-zero ADR crush in competitive set + correlation :176,185-187,308 (fix at :82-84 not propagated); live scans of per-night fact table, no cache; refreshMetrics is a no-op :350-352 | Medium |
| housingDemandScoreService.ts | 301 | RHDS composite | Cleanest compute-and-store (Promise.all sources :163-170); per-region upsert loop :130-156; recompute-on-empty stampede :281; WEIGHTS in code :29 | Low |
| developerPortalService.ts | 297 | Org-scoped API usage + entitlements | **Near-clean, correctly org-scoped throughout**; minor sequential pairs :64-75,252-272; tier limits in code :30-47; timezone edge :115-119 | Low |
| infrastructureQualityService.ts | 251 | NIQS composite | Per-region upsert loop :139-163; per-request percentile over all properties :219-226; recompute-on-empty :177 | Medium |
| regionalCompositesService.ts | 235 | DPMDI/PTMPI/ESSI/RICI composites | ~64 sequential upserts :195-210; sequential compute queries :68-165; discarded weightedMean call :142-154; `${table}` readOr pattern (safe, fragile) :219 | Medium |
| analyticsScheduler.ts | 220 | Monthly snapshot cron + catch-up | Schedules snapshots other schedulers own (H2); otherwise well-structured (freshness check, isolation); array-order dependency for GHAI :62-75 | High (arch) |
| housingDeficitService.ts | 172 | HDEM 2030 deficit estimate | Missing-stock→0 turns absent data into 100% deficit :89; per-region upsert loop :110-136; HIDDEN_DEMAND_FACTOR 0.40 :29 | Medium |
| analyticsStreamSnapshots.ts | 100 | WS channel snapshot resolver | Live price-index recompute per subscribe :33-39 and again per publish sweep :79-99; regionKey duplicate :21-23 | Medium |
| analyticsStreamPublisher.ts | 83 | In-process event bus + channel/product map | **Clean**; documented single-instance limitation; setMaxListeners(50) magic :27 | Low |
| index.ts | 60 | Barrel export | Exports only 7 of 17 services — false public surface | Low |

---

## 6. COVERAGE LEDGER

All 73 files in scope were read **in full** by the domain auditors; every dead-code verdict was verified via `grep -rn` over `backend/src --include=*.ts` (the three PM dead services additionally verified repo-wide including frontend, excluding `dist`/`node_modules`). Cross-domain duplication claims (Paystack ×5, notify() import graph, `crm_properties` writers, computeAndStore scaffolding, currencyFx importers, shared-services/payments layout, webhook signature verification in `routes/webhooks.ts`) were independently re-verified by the compiling auditor.

| # | File | Status |
|---|---|---|
| 1–29 | property-management: applicationService, paymentProcessor, paystackService, tenancyService, leaseTemplateService, signedLeaseStorage, rentCollectionService, rentScheduleService, advancedFinancialService, financialService, reportingService, portfolioFinancialReportService, portfolioService, currencyFx, propertyService, documentService, workOrderService, vendorService, tenantService, tenantScoringService, regionalPricingService, vendorSLAService, bulkOperationsService, calendarService, tenantAuthService, keycloakTenantOnboardingService, notificationService, tenantWhatsAppService, auditTrailService | ✅ Audited in full |
| 30–52 | crm-deal-management: dealService, crmPropertySyncService, commissionService, documentGenerationService, targetService, crmDocumentService, crmDocumentTemplateService, pipelineService, taskService, emailIntegrationService, types, signatureService, noteService, agentService, contactService, companyService, contactMergeService, propertyMatchService, stackingPlanService, pipelineValidator, activityService, crmBridgeService, index | ✅ Audited in full |
| 53–73 | analytics: valuationAnalyticsService, ghaiService, mlAnalyticsService, constructionCostIndexService, alertService, marketIntelligenceService, mlServingClient, rentalAnalyticsService, investmentScoringService, floorPlanAnalyticsService, analyticsStreamServer, shortStayMetricsService, housingDemandScoreService, developerPortalService, infrastructureQualityService, regionalCompositesService, analyticsScheduler, housingDeficitService, analyticsStreamSnapshots, analyticsStreamPublisher, index | ✅ Audited in full |

**Skips:** none. Out-of-scope files (routes, shared-services, project-management, data-hub, valuation-engine) were consulted only as evidence for cross-domain findings, not audited.

## 7. Top Remediation Order

1. **C1** un-stub documentGenerationService (legal PDFs are empty today) — 1-line-class fix, huge blast radius.
2. **C2** parameterize alertService region (stored SQLi reachable by any analytics subscriber).
3. **C5+C6** paymentProcessor/rentScheduleService: FOR-UPDATE idempotency gate + transactions around the money path; **C4** replace pool-level BEGIN/COMMIT in bulkOperationsService.
4. **C7+H5** org-scope every commission/target mutation; fix clawback idempotency; **C8** shared sort-whitelist helper kills 8+ injection sites at once.
5. **C3** trigger-fix migration to remove ALTER TABLE per deal update; **C10+H1** snapshot-serving/caching for the portfolio summary and analytics hot paths; **C9** delete the 2,531 LOC of dead PM services and the schema-broken bulk/calendar/whatsapp/`crm_contacts` paths.
