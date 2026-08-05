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

---

## Fix queue (prioritized)

### P0 — Correctness / runtime errors

| # | Issue | Location | Status |
|---|-------|----------|--------|
| 1 | `getUpcomingTasks` broken SQL (`INTERVAL '$2 days'` never binds) | `taskService.ts` | **Fixed** (PR pending) |
| 2 | CRM PDF generation returns empty buffers (stubbed puppeteer) | `documentGenerationService.ts` | Backlog |
| 3 | `ALTER TABLE deals DISABLE TRIGGER` on every deal update (table lock) | `dealService.ts` | Backlog |

### P1 — Security

| # | Issue | Location | Status |
|---|-------|----------|--------|
| 4 | ORDER BY injection via unconstrained `sort_by` | 6 CRM list services | Backlog |
| 5 | Commission approve/pay without `organization_id` guard | `commissionService.ts` | Backlog |

### P2 — Integration test hygiene

| # | Issue | Location | Status |
|---|-------|----------|--------|
| 6 | `workflow.test.ts` still seeds phantom `crm_*` tables | `tests/integration/` | Backlog |

### Out of scope (Phase 3)

- New CRM modules (offers/reservations UI, social syndication, voice, i18n)
- Outbound disbursement rail / MoMo payout
- Drip campaign execution engine

---

*Update this file as fixes ship.*
