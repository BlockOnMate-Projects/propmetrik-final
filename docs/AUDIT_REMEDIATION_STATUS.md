# PROPMETRIK — Audit Remediation Status

> **Deliverable:** Manager-approved audit engagement (items 1–8)  
> **Date:** 2026-08-04  
> **Author:** Madhu (contractor)  
> **Source audit:** [docs/audit/00-executive-summary.md](audit/00-executive-summary.md) (17 domain reports, July 2026)  
> **Companion:** [docs/CODEBASE_AUDIT.md](CODEBASE_AUDIT.md) (prior in-repo remediation log)

---

## Status legend

| Status | Meaning |
|--------|---------|
| **Done** | Implemented, tested, and merged to `main` |
| **Partially Done** | Material progress; known gaps remain |
| **Backlog** | Not started in this engagement; documented for follow-up |

**Effort key (for backlog):** S = &lt;½ day · M = ½–2 days · L = 3–5 days · XL = 1–3 weeks

---

## 1. Contract deliverables (engagement scope)

All eight manager-prioritized items are **Done**.

| # | Deliverable | Status | PR / evidence |
|---|-------------|--------|---------------|
| 1 | Background jobs gated (`RUN_BACKGROUND_JOBS`) | **Done** | PR #1 — `config.app.runBackgroundJobs`; cron/schedulers gated in bootstrap |
| 2 | Fix all failing unit test suites | **Done** | PR #1 — 17 suites, 260 tests pass locally & in CI |
| 3 | Restore ESLint; CI lint passes | **Done** | PR #1 — `lint:ci`, monorepo install, knip fixes |
| 4 | Prod fail-fast on required env vars | **Done** | PR #2 — `validateEnvironment()` in `config/index.ts` |
| 5 | Refactor `index.ts` → bootstrap modules | **Done** | PR #3 — `backend/src/bootstrap/*` (1,187 → 7 lines in entry) |
| 6 | Migration checksum + runner hardening | **Done** | PR #4 — checksum enforced in production; unit tests added |
| 7 | Zod validation on modified POST/PUT/PATCH | **Done** | PR #5 — public PM crypto routes in `bootstrap/publicRoutes.ts` |
| 8 | This remediation status document | **Done** | PR #6 (this file) |

### PRs merged during engagement

| PR | Branch | Summary |
|----|--------|---------|
| #1 | `fix/audit-background-jobs-gate` | Jobs gate, CI fixes, unit/integration test green |
| #2 | `fix/audit-env-validation` | Production fail-fast env validation |
| #3 | `fix/audit-bootstrap-modules` | Bootstrap refactor |
| #4 | `fix/ci-slack-and-migration-checksum` | Slack notify fix + migration checksum |
| #5 | `fix/audit-public-route-validation` | Public crypto route zod validation |

---

## 2. Roadmap phase summary

Mapped to [18-refactoring-roadmap.md](audit/18-refactoring-roadmap.md).

### Phase 0 — Security containment 🔴

| Item | Finding | Status | Notes |
|------|---------|--------|-------|
| 0.1 | Dev-auth bypass defaults ON | **Partially Done** | `AUTH_DEV_BYPASS` requires explicit `true`; prod ignores it. Still worth a regression test. |
| 0.2 | `POST /auth/google` no token verify | **Backlog** | M · account takeover risk |
| 0.3 | `JWT_SECRET` constant fallback | **Partially Done** | Prod startup throws if missing/weak; dev may still warn-only |
| 0.4 | `AppError` prototype bug | **Done** | Uses `new.target.prototype` in `errorHandler.ts` |
| 0.5 | Cross-org IDOR in `team.ts` | **Backlog** | S · one-line guard fix |
| 0.6 | `serviceTeam.ts` unscoped UPDATE/DELETE | **Backlog** | S |
| 0.7 | Admin portal client-only RBAC | **Backlog** | M · server-side role gate needed |
| 0.8 | `rbac.ts` missing `user_type='staff'` | **Backlog** | S |
| 0.9 | Python engine unauthenticated | **Backlog** | M · route through Node + tighten CORS |
| 0.10 | E-sign `optionalAuth` + header identity | **Backlog** | M |
| 0.11 | SSRF via `charts/preview` | **Backlog** | S · endpoint allowlist |
| 0.12 | Signup org-slug takeover | **Backlog** | M |
| 0.13 | Webhook signatures opt-in | **Backlog** | M |

**Phase 0 overall:** **Partially Done** (2 done, 2 partial, 9 backlog). Highest priority for next sprint.

### Phase 1 — Performance quick wins 🟠

| Item | Finding | Status | Effort |
|------|---------|--------|--------|
| 1.1 | Auth middleware 2–4 DB round-trips/request | **Backlog** | M |
| 1.2 | Tenant session cache + redundant org lookups | **Backlog** | M |
| 1.3 | Root `force-dynamic` on all pages | **Backlog** | S |
| 1.4 | Keystroke-refetch (no debounce) | **Backlog** | M |
| 1.5 | No code-splitting for heavy libs | **Backlog** | M |
| 1.6 | Sequential query waterfalls | **Backlog** | M |
| 1.7 | invalidate + refetch double round-trips | **Backlog** | S |
| 1.8 | Missing hot-path DB indexes | **Backlog** | M |

**Phase 1 overall:** **Backlog** — directly addresses “extremely slow” user complaint.

### Phase 2 — Dead code & duplication 🟡

| Item | Finding | Status | Effort |
|------|---------|--------|--------|
| 2.1 | ~30k LOC dead PM modular tree | **Backlog** | M |
| 2.2 | ~4.3k LOC dead Python services | **Backlog** | M |
| 2.3 | Dead middleware (~800 LOC) | **Backlog** | M |
| 2.4 | Dead frontend pages/components | **Backlog** | S |
| 2.5 | Unify fetch clients (47 URL violations) | **Backlog** | L |
| 2.6 | Consolidate formatters | **Backlog** | M |
| 2.7 | Shared CRM/valuation hooks | **Backlog** | L |
| 2.8 | PM tab quadruplets | **Backlog** | L |
| 2.9 | 27× query-builder duplication | **Backlog** | L |
| 2.10 | 5 Konva floor-plan implementations | **Backlog** | L |
| 2.11 | Duplicate subsystems (e-sign×2, audit×2, bidding×2) | **Backlog** | XL |

**Phase 2 overall:** **Backlog**

### Phase 3 — Correctness & config hardening 🟢

| Item | Finding | Status | Notes |
|------|---------|--------|-------|
| 3.1 | 3 conflicting valuation weight tables | **Backlog** | L · High risk |
| 3.2 | Client-side valuation economics hardcoded | **Backlog** | L |
| 3.3 | Float money math → DECIMAL | **Backlog** | L |
| 3.4 | Schema FK/NOT NULL/index hardening | **Backlog** | XL |
| 3.5 | Partner JWKS + token blacklist | **Backlog** | M |
| 3.6 | Region taxonomy mismatch | **Partially Done** | `ghanaRegionSchema` updated to 16 regions; Python side may still diverge |
| 3.7 | Real e-sign cryptography | **Backlog** | XL |
| 3.8 | UI correctness bugs (NaN%, blob leaks, etc.) | **Backlog** | M |

**Phase 3 overall:** **Partially Done** (region schema only)

### Phase 4 — Structural, quality & scalability 🔵

| Item | Finding | Status | Notes |
|------|---------|--------|-------|
| 4.1 | `shared-services/` boundary | **Backlog** | XL |
| 4.2 | WebSocket server base + leak fixes | **Backlog** | L |
| 4.3 | Frontend tests + CI + coverage gate | **Backlog** | XL · 0 frontend tests today |
| 4.4 | CSP/HSTS; `eslint.ignoreDuringBuilds` off | **Partially Done** | Backend `lint:ci` green; frontend build still ignores ESLint |
| 4.5 | Theming token sweep (~31k colors) | **Backlog** | XL |
| 4.6 | Dependency dedupe, `.nvmrc` | **Backlog** | M |
| 4.7 | `console.log` → pino (~167 backend) | **Backlog** | M |
| 4.8 | DB pool sizing + horizontal scale | **Backlog** | L |

**Phase 4 overall:** **Partially Done** (backend CI/lint only)

---

## 3. Per-report finding summary

Condensed from audit reports [01](audit/01-backend-routes-a.md)–[17](audit/17-dependencies-build-security.md).

| Report | Domain | Done | Partial | Backlog | Top remaining risk |
|--------|--------|------|---------|---------|-------------------|
| 01 | Backend routes A–L | — | — | Most | Google auth takeover, SSRF, e-sign auth |
| 02 | Backend routes M–Z | — | — | Most | Cross-org IDOR (team, serviceTeam, tenant portal) |
| 03 | Backend core | Bootstrap split, env fail-fast, jobs gate, AppError fix, region schema | JWT/dev-auth hardening | Auth perf, dead middleware, partner JWKS | Middleware DB fan-out on remote DB |
| 04 | PM services | — | — | Most | ~30k dead tree, god files, query duplication |
| 05 | Data-hub + Scrapy | Route ordering fix (clear-cache) | — | Most | Scraper reliability, validation gaps |
| 06 | Valuation engine | — | — | Most | Unauthenticated Python engine, weight table drift |
| 07 | PM/CRM/analytics | — | — | Most | OTP `Math.random()`, OAuth plaintext tokens |
| 08 | Shared services | Mutation audit middleware (prior pass) | — | Most | E-sign crypto void, webhook opt-in signatures |
| 09 | Migrations (247) | Checksum in prod | — | Fresh-DB ordering, baseline snapshot, CI migrate job | `054` before CRM tables on empty DB |
| 10 | Frontend lib/infra | — | — | Most | 3 fetch wrappers, enum drift |
| 11–12 | Frontend components | — | — | Most | God components (income 2,332 LOC), no debounce |
| 13–16 | Frontend pages | — | — | Most | `force-dynamic` root, admin client-only RBAC |
| 17 | Deps/build/security | Backend CI (lint, unit, integration, knip, docker) | — | Frontend CI, coverage gate, CSP | No frontend pipeline |

---

## 4. Prior remediation (pre-engagement, already on `main`)

From [CODEBASE_AUDIT.md](CODEBASE_AUDIT.md) — completed before this contractor engagement:

| Item | Status |
|------|--------|
| Leaked prod DB password removed from 24 scripts | **Done** |
| Platform-wide mutation audit middleware | **Done** |
| Immutable `audit_logs` (migration 238) | **Done** |
| Soft-delete columns (migration 239) | **Done** (columns only; endpoint conversion **Backlog**) |
| Ingestion route API-key guard | **Done** |
| Vendors soft-delete reference implementation | **Done** |

---

## 5. Recommendations — next work (prioritized)

### Immediate (next 1–2 weeks)

1. **Phase 0 security sweep** — items 0.2, 0.5–0.8, 0.11 are mostly S/M fixes with outsized impact. Schedule a focused security PR before new features.
2. **Phase 1.1 + 1.3** — cache auth middleware + scope `force-dynamic` off marketing pages. Low risk, directly improves perceived speed.
3. **Migration CI job (scratch Postgres)** — deferred in item #6 because fresh-DB ordering is broken (report 09 P0-2). Re-enable only after a baseline snapshot migration.

### Medium term (1–2 months)

4. **Phase 2.1–2.3** — delete provably dead code (~35k LOC) after grep verification.
5. **Phase 3.1–3.3** — single valuation weight source + DECIMAL money path.
6. **Frontend CI** — `next build` + `tsc` + `next lint` workflow (report 17 H4).
7. **Soft-delete endpoint conversion** — table-by-table per CODEBASE_AUDIT §2.

### Long term (ongoing)

8. **Mega-route splits** — `projects.ts` (6,702), `valuations.ts` (5,938), `propertyManagement.ts` (3,541).
9. **E-sign consolidation** — envelope engine is canonical; retire legacy signing-request stack after per-domain sign-off.
10. **Frontend test suite + coverage gate** — start with money-path components.

---

## 6. CI & test posture (as of 2026-08-04)

| Check | Status |
|-------|--------|
| Backend lint (`lint:ci`) | **Green** |
| Backend type-check | **Green** |
| Backend unit tests (260) | **Green** |
| Backend integration tests (90, filtered) | **Green** |
| Knip (dead export scan) | **Green** |
| Docker build | **Green** |
| Deploy notify (Slack) | **Green** (skipped when secret unset) |
| Frontend CI | **Not configured** |
| Coverage threshold | **Not enforced** |
| Full migration chain on empty DB | **Known fail** (ordering) |

---

## 7. Scorecard delta (qualitative)

| Dimension | Audit score (Jul 2026) | After engagement | Notes |
|-----------|------------------------|------------------|-------|
| Architecture | 5/10 | 5.5/10 | Bootstrap modularization; subsystems still duplicated |
| Maintainability | 4/10 | 5/10 | `index.ts` split; god route files remain |
| Performance | 3/10 | 3/10 | No perf work in scope |
| Security | 3/10 | 3.5/10 | Env fail-fast, jobs gate; Phase 0 items mostly open |
| Testing | 3/10 | 4/10 | Unit suite restored; still no frontend tests |
| Data integrity | 5/10 | 5.5/10 | Migration checksum in prod; fresh-install ordering open |

---

*This document should be updated when backlog items ship. For file-level evidence, see the individual audit reports in `docs/audit/`.*
