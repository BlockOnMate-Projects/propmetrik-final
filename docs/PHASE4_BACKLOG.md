# Phase 4 — Full audit backlog

**Scope:** Work through the remaining audit items from `docs/audit/` — security hardening, mega-route splits, migration hygiene, and tooling. Same approach as Phases 1–3: small PRs, CI green, one item at a time.

**Sources:** `docs/AUDIT_REMEDIATION_STATUS.md`, `docs/audit/18-refactoring-roadmap.md`, `docs/audit/00-executive-summary.md`

---

## Prioritized queue

### P0 — Maintainability (route splits, deferred from Phase 2)

| # | Item | File(s) | Lines | Status |
|---|------|---------|------:|--------|
| 1 | Split valuation AI/writeup routes | `valuations.ts` → `valuationAiRoutes.ts` | ~7,344 → ~7,049 | **Done** (#18) |
| 2 | Split valuation comparables + method routes | `valuations.ts` | (same file) | Backlog |
| 3 | Split valuation report/approval/e-sign routes | `valuations.ts` | (same file) | Backlog |
| 4 | Split PM tenant/tenancy routes | `propertyManagement.ts` | ~3,852 | Backlog |
| 5 | Split PM payments/maintenance routes | `propertyManagement.ts` | (same file) | Backlog |

Target: same pattern as Phase 2 (`projects.ts` → 8 sub-routers). `valuations.ts` is the largest file in the backend.

### P1 — Security

| # | Item | Location | Status |
|---|------|----------|--------|
| 6 | Admin portal server-side RBAC | `frontend` admin routes + backend guards | Backlog |
| 7 | Webhook signature enforcement when secrets unset | webhook handlers | Backlog |
| 8 | Python valuation engine auth | `engineProxy.ts` / engine service | Backlog |
| 9 | E-sign route auth hardening (`optionalAuth` on sensitive paths) | `eSign.ts` | Backlog |

### P2 — Infrastructure / data

| # | Item | Location | Status |
|---|------|----------|--------|
| 10 | Fresh DB migration ordering (`054` before CRM tables) | `database/migrations/` | Backlog |
| 11 | Auth middleware DB fan-out (2–4 round-trips per request) | `middleware/auth.ts` | Backlog |
| 12 | CI Node heap fix | `.github/workflows/backend-ci.yml` | **Done** (#17) |

### P3 — Quality (interleave as needed)

| # | Item | Status |
|---|------|--------|
| 13 | Frontend test suite + coverage gate | Backlog |
| 14 | CSP/HSTS headers on frontend | Backlog |
| 15 | Dependency dedupe (`bcrypt`/`bcryptjs`, PDF libs) | Backlog |
| 16 | `shared-services/` boundary cleanup | Backlog (XL) |

---

## Suggested PR order

1. **#18** — Extract valuation AI routes from `valuations.ts` ✅
2. **#19** — Extract valuation comparables routes
3. **#20** — Extract valuation report/approval routes
4. **#21** — Extract PM tenant/tenancy routes from `propertyManagement.ts`
5. Security items (#6–#9) — one PR each, after route splits or in parallel if scoped small

---

## Out of scope (Phase 4)

- New product features
- Real e-sign cryptography / PKI (audit Phase 3.7 — XL, legal implications)
- Full theming token sweep (~31k colors)
- `shared-services/` full collapse (4.1 — schedule separately if needed)

---

*Update this file as fixes ship.*
