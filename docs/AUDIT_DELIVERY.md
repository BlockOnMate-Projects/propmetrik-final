# Backend audit work — delivery notes

**From:** Madhu  
**Date:** August 2026  
**Repo:** `bhardwj-sarvesh-projects/propmetrik-final`  
**Branch:** `main` (all work below is merged)

---

## Summary

I completed the eight backend audit items we scoped. Everything is merged into `main` across six pull requests. Backend CI is green (lint, type-check, unit tests, integration tests, knip, Docker build).

Slack deploy notifications are not used on your side — the workflow no longer depends on `SLACK_WEBHOOK_URL`, so production deploy jobs stay green without that secret.

For what is still open in the full audit report, see the backlog section at the end. The detailed living status file is `docs/AUDIT_REMEDIATION_STATUS.md`.

---

## Completed work

| # | Item | PR |
|---|------|-----|
| 1 | `RUN_BACKGROUND_JOBS` gate (cron/schedulers off in local dev unless opted in) | [#1](https://github.com/bhardwj-sarvesh-projects/propmetrik-final/pull/1) |
| 2 | Fix failing unit test suites (260 tests passing in CI) | [#1](https://github.com/bhardwj-sarvesh-projects/propmetrik-final/pull/1) |
| 3 | Restore ESLint + `lint:ci` in the pipeline | [#1](https://github.com/bhardwj-sarvesh-projects/propmetrik-final/pull/1) |
| 4 | Production fail-fast for required environment variables | [#2](https://github.com/bhardwj-sarvesh-projects/propmetrik-final/pull/2) |
| 5 | Split `backend/src/index.ts` into bootstrap modules | [#3](https://github.com/bhardwj-sarvesh-projects/propmetrik-final/pull/3) |
| 6 | Migration checksum validation in production | [#4](https://github.com/bhardwj-sarvesh-projects/propmetrik-final/pull/4) |
| 7 | Zod validation on public PM crypto POST routes (touched during bootstrap move) | [#5](https://github.com/bhardwj-sarvesh-projects/propmetrik-final/pull/5) |
| 8 | Audit remediation status documentation | [#6](https://github.com/bhardwj-sarvesh-projects/propmetrik-final/pull/6) |

### Merge confirmation

All six PRs are merged. Latest merge on `main`:

```
7e53f30e Merge pull request #6 (audit remediation status doc)
```

To verify locally:

```bash
git checkout main
git pull origin main
git log --oneline -8
```

You should see merge commits for PRs #1 through #6.

### Merged branches

- `fix/audit-background-jobs-gate`
- `fix/audit-env-validation`
- `fix/audit-bootstrap-modules`
- `fix/ci-slack-and-migration-checksum`
- `fix/audit-public-route-validation`
- `docs/audit-remediation-status`

---

## How I verified (same as CI)

Run from the **repo root** unless noted.

**Install dependencies:**

```bash
npm ci --legacy-peer-deps
```

**Lint and type-check:**

```bash
cd backend
npm run lint:ci
npm run type-check
```

**Unit tests (260 tests):**

```bash
cd backend
NODE_ENV=test npm run test:unit -- --forceExit --runInBand --ci
```

**Integration tests (90 tests, same filters as CI):**

```bash
cd backend
NODE_ENV=test npm run test:integration -- \
  --testPathIgnorePatterns='workflow.test|crmSchemaContract' \
  --forceExit --runInBand --ci
```

Integration tests need Postgres and Redis running. CI uses:

- `DATABASE_URL=postgresql://propmetrik_test:test_password@127.0.0.1:5432/propmetrik_test`
- `REDIS_URL=redis://127.0.0.1:6379`

**Knip (dead code check):**

```bash
npm run knip
```

**Docker build:**

```bash
docker build -f backend/Dockerfile --target production ./backend
```

GitHub Actions runs these on push to `main` when `backend/**` or `.github/workflows/backend-ci.yml` changes.

---

## After pulling latest `main`

### 1. Reinstall dependencies

```bash
npm ci --legacy-peer-deps
```

### 2. Backend environment

No new SQL migrations were added in this work. No database migration step is required for these changes alone.

Two variables were added to `backend/.env.example`:

| Variable | Local default | Notes |
|----------|---------------|-------|
| `RUN_BACKGROUND_JOBS` | `false` | Keeps cron/schedulers off in dev. Set `true` only if you want jobs running against remote infra. |
| `MIGRATION_STRICT_CHECKSUM` | `false` | Lenient in dev/test. **Auto-enabled in production** — edited migration files fail startup. |

Production already fails fast (PR #2) if these are missing:

`DATABASE_URL`, `REDIS_URL`, `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `JWT_SECRET`

### 3. Deploy workflow

Deploy jobs are still stubs (`echo` only). No `SLACK_WEBHOOK_URL` is required. No Slack setup needed.

### 4. Local frontend (optional)

If NextAuth shows `MissingSecret`, add to `frontend/.env.local`:

```
AUTH_SECRET=<any-long-random-string-for-local-dev>
```

### 5. Local dev with remote database

If you use the SSH tunnel to Hetzner (`devtunnel@178.156.251.53` → `localhost:6379` / `5434`), restart the tunnel when it drops, then restart the backend.

---

## CI status (August 2026)

| Check | Status |
|-------|--------|
| Backend lint (`lint:ci`) | Green |
| Backend type-check | Green |
| Unit tests (260) | Green |
| Integration tests (90, filtered) | Green |
| Knip | Green |
| Docker build | Green |
| Frontend CI | Not configured |
| Full migration chain on empty DB | Known issue (ordering) — see backlog |

---

## What is still open in the audit

The full audit report (`docs/audit/`) is a multi-month roadmap. I only closed the eight items above.

**Highest priority remaining:**

- Admin portal server-side RBAC (client-only gate today)
- E-sign route authentication hardening
- Webhook signature enforcement when secrets are unset
- Auth middleware performance (2–4 DB round-trips per request)
- Frontend CI pipeline (no `next build` / `next lint` in GitHub Actions today)
- Mega route file splits (`projects.ts`, `valuations.ts`, etc.)
- Fresh-DB migration ordering (migration `054` before CRM tables on empty install)

Some Phase 0 security items from the audit PDF were already fixed in the codebase before my pass (Google token verification, charts SSRF allowlist, signup slug handling, rbac `user_type=staff` check, serviceTeam org scoping). I verified those in the repo.

See `docs/AUDIT_REMEDIATION_STATUS.md` for a fuller backlog breakdown.

---

## Reference

- Original audit summary: `docs/audit/00-executive-summary.md`
- Roadmap phases: `docs/audit/18-refactoring-roadmap.md`
- Prior in-repo remediation log: `docs/CODEBASE_AUDIT.md`

---

*Questions on any of the above, ping me on the thread.*
