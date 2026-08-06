# Phase 3 — CRM / Deal Management review

**Scope:** Review existing CRM code and fix issues. Not building new CRM features.

**Sources:** `docs/audit/07-backend-services-pm-crm-analytics.md`, `docs/audit/crm_gaps_VERIFIED.md`, live code review.

---

## Already verified on `main` (no action needed)

| Item | Status |
|------|--------|
| Phantom `crm_*` table refs in `backend/src` | Fixed — build guard in `scripts/check-crm-tables.mjs` |
| CRM central RBAC dispatcher | Live in `routes/crm/index.ts` |
| FX normalization on CRM money endpoints | Done (prior session) |
| Contact import + export | Routes exist |
| CRM PDF generation (real Puppeteer) | Verified — `documentGenerationService.htmlToPdf()` uses Puppeteer `page.pdf()`; audit stub claim is stale |
| Commission approve/pay org guards | Verified — `approveRecord` / `markAsPaid` filter on `organization_id` |

---

## Fix queue (prioritized)

### P0 — Correctness / runtime errors

| # | Issue | Location | Status |
|---|-------|----------|--------|
| 1 | `getUpcomingTasks` broken SQL (`INTERVAL '$2 days'` never binds) | `taskService.ts` | **Fixed** (#15) |
| 2 | CRM PDF generation returns empty buffers (stubbed puppeteer) | `documentGenerationService.ts` | **Verified** — no code change needed |
| 3 | `ALTER TABLE deals DISABLE TRIGGER` on every deal update (table lock) | `dealService.ts`, `routes/crm/deals.ts` | **Fixed** (#16) |

### P1 — Security

| # | Issue | Location | Status |
|---|-------|----------|--------|
| 4 | ORDER BY injection via unconstrained `sort_by` | 6 CRM list services | **Fixed** (#16) |
| 5 | Commission approve/pay without `organization_id` guard | `commissionService.ts` | **Verified** — already guarded |

### P2 — Integration test hygiene

| # | Issue | Location | Status |
|---|-------|----------|--------|
| 6 | `workflow.test.ts` still seeds phantom `crm_*` tables | `tests/integration/` | **Fixed** (#17) |

### Out of scope (Phase 3)

- New CRM modules (offers/reservations UI, social syndication, voice, i18n)
- Outbound disbursement rail / MoMo payout
- Drip campaign execution engine

---

*Update this file as fixes ship.*
