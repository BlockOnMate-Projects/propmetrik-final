# Backend audit work — delivery notes

**From:** Madhu  
**Date:** August 2026  
**Repo:** `bhardwj-sarvesh-projects/propmetrik-final`  
**Branch:** `main` (all work below is merged unless noted)

---

## Summary

| Phase | Scope | Status |
|-------|--------|--------|
| **Phase 1** | Eight scoped backend audit items | **Complete** — PRs #1–#9 |
| **Phase 2** | Dead code removal, duplicate cleanup, `projects.ts` route splits, maintainability | **Complete** — PRs #10–#14 |
| **Phase 3** | CRM / Deal Management review + fixes only (no new CRM) | **Complete** — PRs #15–#17 |
| **Phase 4** | Full audit report backlog | **In progress** — PRs #18–#20 merged; frontend bug pass below |

Backend + frontend CI are green. Slack deploy notifications are not used — the workflow no longer depends on `SLACK_WEBHOOK_URL`.

Living backlog: `docs/AUDIT_REMEDIATION_STATUS.md` · Phase 4 queue: `docs/PHASE4_BACKLOG.md` · CRM review: `docs/PHASE3_CRM_REVIEW.md`

---

## Frontend bug pass (manager walkthrough, Aug 2026)

Eric flagged three issues while clicking through the app as super-admin. All were wiring/data-shape bugs, not new features.

| Page | Symptom | Cause | Fix |
|------|---------|-------|-----|
| `/dashboard/valuations` | Demo customer's in-progress valuation (VAL-DC9A5A45) visible in Cedyn portal | `super_admin` skipped the org filter on list/stats — saw every org's valuations | Apply `valuer_organization_id` filter whenever the user has an org, including super-admin; block cross-org GET by id |
| `/dashboard/deals/contacts` | Summary cards stuck at 0; console 500 on `/api/crm/contacts/stats` | Frontend calls `/contacts/stats`; backend only had `/contacts/statistics` with a different JSON shape | Added `/contacts/stats` route mapped to the shape the UI expects (`totalContacts`, `newThisMonth`, `byLeadStatus`, `byBuyerType`) |
| `/dashboard/deals/analytics` | Page crash: `win_rate.toFixed is not a function` | Postgres `ROUND()` returns numeric as string in node-pg | Coerce `win_rate` to number in the API response and on the analytics page |

**How to verify:** log in as super-admin, open Valuations (no other org's demo rows), Contacts (stat cards match the list), Analytics (agent table renders). Check the browser console on those pages — the stats 500 and analytics TypeError should be gone.

PR: [#21](https://github.com/bhardwj-sarvesh-projects/propmetrik-final/pull/21)

---

## PM portfolio-summary 500 (Aug 2026)

Eric reported `GET /api/pm/financials/portfolio-summary` returning 500 with socket hang up on Property Management dashboard load.

**Cause:** `getPortfolioFinancialSummary()` looped every active property and ran `getPropertyFinancialSummary()` (~8 DB queries each). With 80+ properties that meant hundreds of sequential queries and request timeouts.

**Fix:** Replaced the per-property loop with six org-scoped aggregate SQL queries (same FX normalization pattern as `portfolioService`). Response shape unchanged.

PR: pending

---

## Phase 4 — in progress (audit report backlog)

| PR | What shipped |
|----|----------------|
| [#18](https://github.com/bhardwj-sarvesh-projects/propmetrik-final/pull/18) | Extract valuation AI/writeup routes → `valuationAiRoutes.ts` |
| [#19](https://github.com/bhardwj-sarvesh-projects/propmetrik-final/pull/19) | Extract comparables, method calc, cap-rate routes → `valuationComparablesRoutes.ts` |
| [#20](https://github.com/bhardwj-sarvesh-projects/propmetrik-final/pull/20) | Extract report, documents, overrides, reconciliation → `valuationReportRoutes.ts` |
| [#17](https://github.com/bhardwj-sarvesh-projects/propmetrik-final/pull/17) | CI Node heap fix (lint/tests OOM on GitHub Actions) |

**Impact:** `valuations.ts` reduced from **7,344 → ~3,595 lines** (AI, comparables, report routes extracted). Still splitting remaining valuation routes and `propertyManagement.ts`.

**Next:** PM route splits, then security items (admin RBAC, webhooks, engine auth).

---

## Phase 3 — completed (PRs #15–#17)

Review + fix only — no new CRM features. See `docs/PHASE3_CRM_REVIEW.md`.

| Item | PR |
|------|-----|
| Fix `getUpcomingTasks` broken SQL interval | #15 |
| Remove deal trigger locks + CRM sort injection hardening | #16 |
| Fix `workflow.test.ts` phantom `crm_*` tables; verify PDF + commission guards | #17 |

---

## Phase 2 — completed (PRs #10–#14)

| PR | What shipped |
|----|----------------|
| [#10](https://github.com/bhardwj-sarvesh-projects/propmetrik-final/pull/10) | Remove tracked Scrapy cache (~8,958 files), dead scripts, `propertyMapper`; extract `dailyLogs.ts`; dead middleware cleanup |
| [#11](https://github.com/bhardwj-sarvesh-projects/propmetrik-final/pull/11) | Extract `paymentPlans.ts`, `punchLists.ts`, `projectIntegrationRoutes.ts`, `projectWizardRoutes.ts` |
| [#12](https://github.com/bhardwj-sarvesh-projects/propmetrik-final/pull/12) | Fix Python service image CI (GHCR push to repo namespace) |
| [#13](https://github.com/bhardwj-sarvesh-projects/propmetrik-final/pull/13) | Extract `projectCostRoutes.ts` |
| [#14](https://github.com/bhardwj-sarvesh-projects/propmetrik-final/pull/14) | Extract `projectLocationRoutes.ts` |

**Impact:** `projects.ts` **6,833 → 4,765 lines** (eight sub-routers). Frontend CI added (`.github/workflows/frontend-ci.yml`).

**Deferred to Phase 4:** `valuations.ts` and `propertyManagement.ts` splits (too large for Phase 2 scope).

---

## Phase 1 — completed (PRs #1–#9)

| # | Item | PR |
|---|------|-----|
| 1 | `RUN_BACKGROUND_JOBS` gate | [#1](https://github.com/bhardwj-sarvesh-projects/propmetrik-final/pull/1) |
| 2 | Fix failing unit test suites (265 tests in CI) | [#1](https://github.com/bhardwj-sarvesh-projects/propmetrik-final/pull/1) |
| 3 | Restore ESLint + `lint:ci` in the pipeline | [#1](https://github.com/bhardwj-sarvesh-projects/propmetrik-final/pull/1) |
| 4 | Production fail-fast for required environment variables | [#2](https://github.com/bhardwj-sarvesh-projects/propmetrik-final/pull/2) |
| 5 | Split `backend/src/index.ts` into bootstrap modules | [#3](https://github.com/bhardwj-sarvesh-projects/propmetrik-final/pull/3) |
| 6 | Migration checksum validation in production | [#4](https://github.com/bhardwj-sarvesh-projects/propmetrik-final/pull/4) |
| 7 | Zod validation on public PM crypto POST routes | [#5](https://github.com/bhardwj-sarvesh-projects/propmetrik-final/pull/5) |
| 8 | Audit remediation status documentation | [#6](https://github.com/bhardwj-sarvesh-projects/propmetrik-final/pull/6) |

---

## How I verified (same as CI)

Run from the **repo root** unless noted.

```bash
npm ci --legacy-peer-deps
cd backend && npm run lint:ci && npm run type-check
NODE_ENV=test npm run test:unit -- --forceExit --runInBand --ci
NODE_ENV=test npm run test:integration -- \
  --testPathIgnorePatterns='workflow.test|crmSchemaContract' \
  --forceExit --runInBand --ci
npm run knip
```

Integration tests need Postgres and Redis. CI uses `DATABASE_URL=postgresql://propmetrik_test:test_password@127.0.0.1:5432/propmetrik_test` and `REDIS_URL=redis://127.0.0.1:6379`.

GitHub Actions runs on push to `main` when `backend/**` or workflow files change. CI sets `NODE_OPTIONS=--max-old-space-size=8192` for lint/tests.

---

## After pulling latest `main`

```bash
npm ci --legacy-peer-deps
```

No new SQL migrations in Phases 1–4 work so far. Key env vars in `backend/.env.example`:

| Variable | Local default | Notes |
|----------|---------------|-------|
| `RUN_BACKGROUND_JOBS` | `false` | Cron/schedulers off in dev unless opted in |
| `MIGRATION_STRICT_CHECKSUM` | `false` | Auto-enabled in production |

Production requires: `DATABASE_URL`, `REDIS_URL`, `KEYCLOAK_*`, `JWT_SECRET`.

Deploy jobs are still stubs. No `SLACK_WEBHOOK_URL` needed.

---

## CI status (August 2026)

| Check | Status |
|-------|--------|
| Backend lint + type-check | Green |
| Unit tests (265) | Green |
| Integration tests (filtered) | Green |
| Knip | Green |
| Frontend CI (`next lint` + `next build`) | Green |
| Python service image builds | Green |
| Full migration chain on empty DB | Known issue — see backlog |

---

## What is still open (Phase 4 / audit report)

The full audit (`docs/audit/`) is a multi-month roadmap. Highest priority remaining:

- Finish `valuations.ts` + `propertyManagement.ts` route splits
- Admin portal server-side RBAC
- Webhook signature enforcement
- Python valuation engine auth
- E-sign route auth hardening
- Fresh-DB migration ordering (`054` before CRM tables)
- Auth middleware DB fan-out, frontend test suite, CSP headers

Some items were already fixed before this pass (Google token verify, charts SSRF, signup slug, RBAC `user_type=staff`, serviceTeam org scoping).

See `docs/AUDIT_REMEDIATION_STATUS.md` and `docs/PHASE4_BACKLOG.md`.

---

## Reference

- Audit summary: `docs/audit/00-executive-summary.md`
- Roadmap: `docs/audit/18-refactoring-roadmap.md`
- Prior log: `docs/CODEBASE_AUDIT.md`

---

*Questions on any of the above, ping me on the thread.*
