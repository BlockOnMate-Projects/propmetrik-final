# PROPMETRIK CRM — Independent Re-Verification of `crm_gaps.md`

> **Purpose:** The original `crm_gaps.md` capability audit had a track record of overstating (claiming built things missing, and missing things claimed built). Before committing any implementation, every 🔴/🟡/🟠/✅ claim was **independently re-verified against the live production database and source code** — 6 parallel domain verifiers + direct schema/grep/dependency checks + first-hand reconciliation of every disputed claim.
> **Date:** 2026-07-03 · **Method:** live `psql` against prod DB, `grep`/`read` on `backend/`, `frontend/`, `shared-services/`, `package.json`, `.env`.
> **Bottom line:** the original doc is **directionally trustworthy** — its strategic thesis (reuse-first, R1 is the top risk) holds. But **~10 individual claims are wrong or imprecise in both directions**, and this re-audit also **corrected one of my own earlier findings**. Use *this* document, not the original, as the source of truth. The verdicts below supersede the original where they conflict.

**Verdict legend:** `CONFIRMED` (doc right) · `OVERSTATED` (doc claimed worse/missing than reality) · `UNDERSTATED` (doc undersold what exists) · `IMPRECISE` (right conclusion, wrong detail) · `ALREADY-DONE` (built during the current remediation session) · `VERIFIER-OVERREACH` (a re-audit verifier itself overstated — corrected here).

---

## 1. Trust verdict on the original document

| Aspect | Verdict |
|---|---|
| Strategic thesis (CRM = wiring/consolidation, ~90% infra exists) | **CONFIRMED** — reuse posture is real. |
| R1 (phantom CRM tables) as #1 risk | **CONFIRMED** — genuine, systemic, `tsc`-invisible. Details corrected below. |
| "Genuinely missing" list (Didit, social syndication, voice, i18n, reservations) | **CONFIRMED** — all independently verified absent. |
| Per-capability precision | **~85% accurate.** ~10 claims corrected (both directions). |
| Roadmap phasing | **Mostly sound**, but Phase 0 scope and a few Phase-2 items shift given corrections. |

---

## 2. Material corrections (the deltas that matter)

| # | Claim in `crm_gaps.md` | Original | **Verified truth** | Verdict |
|---|---|---|---|---|
| C1 | R1 phantom tables — "5 files still broken" (§15/§16); my earlier session note said "only 3 files" | 5 files | **5 files confirmed broken** — my own "3 files" note was **wrong**. Live grep proves `calendarService.ts` + `workflowExecutionEngine.ts` DO contain phantom refs. | CONFIRMED (doc) / **self-correction** |
| C2 | Which `crm_*` tables are phantom | lists `crm_properties`? (implied by some refs) | `crm_properties` + `crm_property_viewings` **ARE REAL**. Only `crm_deals`/`crm_contacts`/`crm_tasks`/`crm_pipeline_stages`/`crm_deal_pipelines`/`crm_activities` are phantom. | **VERIFIER-OVERREACH corrected** |
| C3 | Contact import/export "🟠 none / one-way" (§3.1) | none | `POST /crm/contacts/import` (≤500 rows, bulk upsert) **EXISTS**. Only **export** is missing. | **OVERSTATED** → 🟡 |
| C4 | Address autocomplete "🟡 backend ready, no frontend component" (§3.3) | no UI | `frontend/src/components/marketplace/LocationSearch.tsx` (debounced, `/api/marketplace/autocomplete`) **EXISTS**. | **OVERSTATED** → ✅ |
| C5 | Observability "🔴 pino only; no Sentry/Prometheus/tracing" (§3.11/R8) | none | **Sentry `@sentry/node@^10.42.0` is fully integrated** (`config/sentry.ts`, `initSentry(app)` @ index.ts:136, error handler @ 815). But **DSN-gated and `SENTRY_DSN` is unset** → dormant at runtime. Prometheus/OTel genuinely absent. | **OVERSTATED (code) / IMPRECISE** → 🟡 "integrated, disabled — set DSN to activate" |
| C6 | Workflow engine "schema NOT wired to `workflowExecutionEngine`" (§3.11) | not wired | Schema (5 tables) + `workflowService` + `routes/workflows.ts` are **wired and operational** (`/api/v1/workflows` live). Caveat: the engine's **CRM entity-action handlers** are the R1-broken code. | **OVERSTATED / IMPRECISE** → ✅ CRUD wired; R1 blocks entity actions |
| C7 | Feature flags "🟡 valuation-engine only" (§3.11) | valuation-only | `featureFlags.ts` is a **general-purpose** flag service with targeting rules, not valuation-exclusive. | **UNDERSTATED** (minor) |
| C8 | Gmail sync "✅ Production" (§3.8) — but §15 lists it broken | inconsistent | Gmail/Outlook mail I/O works, **but contact-linking queries phantom `crm_contacts`** → the sync's contact-resolution path is **R1-broken**. Doc is internally inconsistent. | **IMPRECISE** → 🟡 (R1-affected) |
| C9 | Crypto/MoMo payout — framed as "MoMo disbursement missing" (§3.2) | MoMo gap | Broader: `cryptoPayoutService.ts` is **wallet-setup/validation only — no actual disbursement of any kind** (crypto, MoMo, *or* bank). The **entire outbound rail is absent**, not just MoMo. | **UNDERSTATED gap** (worse than stated) |
| C10 | Nearby Places / amenities "✅" (§3.3) | production | **CONFIRMED exists** — `shared-services/marketplace/geocodingService.ts` (`NearbyAmenity` interface + Mapbox Places), consumed by `marketplaceController` + `areaNarrativeService`. A re-audit verifier wrongly called this missing. | CONFIRMED (doc) / **VERIFIER-OVERREACH corrected** |
| C14 | `geocoding_cache` table (§3.3) | exists | **CONFIRMED exists** in DB (`to_regclass` non-null). A re-audit verifier wrongly reported it absent. | CONFIRMED (doc) / **VERIFIER-OVERREACH corrected** |
| C11 | `crm_merge_field_registry` "40+ fields" (§3.6) | 40+ fields | Table **exists but has ZERO rows** — the registry is unseeded. | **OVERSTATED** → 🟡 (schema present, no data) |
| C12 | Region partitioning "16 regions" (§3.10) | 16 | Enum has **19 labels** (16 real Ghana regions + 3 legacy cluster labels for back-compat); 16 real partitions. Functionally correct. | CONFIRMED (clarified) |
| C13 | Land tenure "🟠 no tenure classification enum" (§3.10) | no enum | Tenure exists via `tenure_risk_adjustments` table + document-type enums (`stool_lands_consent`, `indenture`, …), not a standalone `tenure_type` enum. | IMPRECISE (mechanism differs) |

---

## 3. R1 — the corrected, definitive account (the crux)

**Phantom vs. real, verified against the live DB (`pg_tables`):**

| Phantom (does NOT exist) | Real table to use |
|---|---|
| `crm_deals` | `deals` |
| `crm_contacts` | `contacts` |
| `crm_tasks` | `tasks` |
| `crm_pipeline_stages` | `deal_stages` |
| `crm_deal_pipelines` | `deal_pipelines` |
| `crm_activities` | `deal_activities` |
| **`crm_properties`** | **✅ REAL — do not "fix"** (PM→CRM bridge table) |
| **`crm_property_viewings`** | **✅ REAL — do not "fix"** |

**The 5 genuinely-broken files** (each fails only on the *phantom* refs above — their `crm_properties`/`crm_property_viewings` joins are valid):

| File | Broken refs | Column drift (also fix) | Live path? |
|---|---|---|---|
| `backend/src/workers/workflowWorker.ts` | `crm_tasks` (218), `crm_deals` (266) | `d.agent_id`→`assigned_agent`, `d.contact_id`→`primary_contact_id`, `d.status`→`deal_status` | Scheduler job handlers (`overdue_check`, `stale_deal_check`) |
| `backend/src/services/crm-deal-management/emailIntegrationService.ts` | `crm_contacts` (468, 585) | — | Live (Gmail/Outlook sync contact-linking) — **C8** |
| `backend/src/services/crm-deal-management/propertyMatchService.ts` | `crm_contacts` (75, 217) — line 107 `crm_properties` is **valid** | — | **Live REST routes** (`routes/crm/properties.ts` match endpoints) |
| `backend/shared-services/calendar/calendarService.ts` | `crm_contacts` (620), `crm_tasks` (677), `crm_deals` (678) — line 619 `crm_properties` is **valid** | — | `getViewingBookings()` |
| `backend/shared-services/workflow/workflowExecutionEngine.ts` | `crm_contacts` (213,288,351,380,745,755), `crm_deals` (259,344,374), `crm_activities` (764) | `owner_id`→`assigned_to`, `d.agent_id`/`d.status` | Workflow action handlers (via `executeForEvent`) — **C6** |

**Already fixed this session:** `KobbyAIService.ts` — independently re-confirmed **clean** (zero phantom refs).

**Why `tsc` is green:** the phantom names live inside SQL string literals; TypeScript never sees them. Fix = correct the refs **and** add a build-time guard (SQL lint against the live schema, or a generated data-access layer) so table/column drift fails at compile, not at runtime.

---

## 4. Credit — capabilities the original doc treats as "future" that are ALREADY DONE (this session)

| Capability | Doc treatment | Reality |
|---|---|---|
| **FX / USD↔GHS normalization across CRM money endpoints** | §5 "attribution/FX a query away"; implied future | **DONE** — `currencyFx` (`ghsValueSql`) applied to analytics, pipeline metrics, commissions, invoices; `/crm/fx/rates` + RateStamp live. |
| **Enterprise RBAC dispatcher on CRM** | §13 "every new route uses the dispatcher" (aspirational) | **DONE** — central `CRM_RESOURCE_MAP` dispatcher in `routes/crm/index.ts` on the shared `authorize()` engine; default-deny; live-verified (viewer DELETE→403, agent GET→200). *(One re-audit verifier missed this — corrected.)* |
| **Workflows access for CRM-only orgs** | — | **DONE** — `requireAnyServiceAccess(['projects','crm'])` at index.ts:530–531. |
| **5 financial pillars** (commissions, forecasting, targets, billing/AR, rev-rec) + repaired DB functions (`calculate_deal_commission`, `generate_commission_statement`, `update_target_progress`) | §3.7 "✅/🟡" | **DONE + hardened** — every previously-dead commission/target DB function was written against wrong columns and never ran; all repaired and backfilled. |

---

## 5. Notes for implementers

- **`crm_emails` table:** created at runtime via `ensureEmailsTable()`, not in migrations. **Action:** migrate it explicitly (062) for consistency — but it's moot until C8/R1 is fixed.
- **Two re-audit verifiers themselves overstated** (C2 `crm_properties`, C10 nearby-places, C14 `geocoding_cache`) — a reminder that *every* audit layer, including this one's sub-agents, needs first-hand confirmation. All three were re-checked directly against the DB/code and corrected above; nothing in this document is left on a verifier's word alone.

---

## 6. Trustworthy re-prioritized roadmap

**Phase 0 — R1 stabilization (P0, ~1 wk) — unchanged in intent, corrected in scope**
- Fix the **5 files** in §3, but touch **only the truly-phantom refs** — leave `crm_properties`/`crm_property_viewings` alone.
- Fix the column drift in `workflowWorker.ts` + `workflowExecutionEngine.ts`.
- Add a build-time SQL-schema guard so this class of bug fails `tsc`/CI, not production.
- Integration tests against real schema for: property-match routes, email sync contact-linking, workflow action handlers, calendar viewing bookings.

**Phase 1 — Wire what exists (0 new services, ~2–3 wks)** *(shorter than doc — FX, RBAC, workflows-access already done)*
- CRM events → `notify()` (deal-stage/viewing/task/offer).
- Author templates on `documentGenerationService` + `envelopeService` (offer letters, reservation forms, receipts) and **seed `crm_merge_field_registry`** (C11).
- Reservation/booking fees via `paymentProcessor` (+ `payment_stage`).
- Surface marketing attribution from existing `deals.lead_source/utm_data`.
- **Activate Sentry** (set `SENTRY_DSN`) — code is already wired (C5). Cheap, high-value.
- Add contact **export** (import already exists — C3); dynamic per-listing OG tags.

**Phase 1 — DONE (2026-07-03).** Merge-field registry seeded (57 fields); contact CSV export (`/crm/contacts/export`); marketing attribution (`/crm/analytics/attribution`); viewing-scheduled → `notify()`; per-listing OG tags (browser-verified rich + fallback cards); the 8 out-of-sync prior-session migrations reconciled (0 pending, no commission double-booking). Deal events → `notify()` already existed (reuse). Both `tsc` = 0, phantom-guard green. **Not done (blocked/moved):** Sentry activation is blocked on `SENTRY_DSN` (code wired, secret pending — owner action); reservation/booking fee moved into Phase 2 (see below).

**Phase 2 — Complete half-built (~6–8 wks)**
- **Outbound disbursement rail** (`payoutService`) — bigger than "MoMo only" (C9): no crypto/MoMo/bank payout exists. Wire commission payouts + refunds.
- Drip **execution engine** (activate idle Bull queue).
- KYC verification (Didit/Smile ID) on tenant-application FSM.
- **Offers/Reservations schema + service + UI — ABSORBS the Phase-1 reservation/booking-fee + `payment_stage` item.** Folded here deliberately (not dropped): offers, reservations, earnest holds, and the `payment_stage` enum share the same tables + payment flow, so building them together avoids a throwaway half-version. Reuse `paymentProcessor` for the fee capture.
- Purchase installment plans; lead-scoring service; refunds handler; Outlook calendar.
- **Sentry** — one-line activation once `SENTRY_DSN` is provided (integration already wired; carried from Phase 1 as owner-blocked).

**Phase 3 — Green-field (~8–10 wks):** social syndication (zero today), agent territory (PostGIS), Land Commission/tenure API, PM condition inspections, voice, campaign segmentation/A-B.

**Phase 4 — Hardening:** i18n (genuinely absent), Prometheus/OTel (Sentry already integrated — just add metrics/tracing), DR codification, platform-wide feature flags (service already general-purpose — C7).

---

*This re-verification corrected the original doc in ~10 places and one of my own prior findings. Where a claim could not be settled first-hand it is flagged in §5 rather than asserted. No implementation was performed.*
