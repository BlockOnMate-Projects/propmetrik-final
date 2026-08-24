# Local development setup

The bug fixes from PR #21 are application code only. They do not change how you configure the environment. A fresh clone will not run until the two env files below exist — they are gitignored on purpose (secrets and host-specific URLs).

---

## Quick start (if you already have a dev `.env`)

If you were testing before and only pulled latest `main`:

1. Confirm `backend/.env` still exists (not deleted by a clean checkout).
2. Create `frontend/.env.local` if missing — see [Frontend](#frontend-envlocal) below.
3. From repo root:

```bash
npm ci --legacy-peer-deps
npm run dev:app
```

4. Open http://localhost:3000/login

If `backend/.env` was never set up on this machine, follow the full steps below or ask the team for the shared dev environment file (1Password / secure channel — not Slack or email).

---

## 1. Install dependencies

```bash
npm ci --legacy-peer-deps
```

Node 20+ recommended (matches CI).

---

## 2. Backend (`backend/.env`)

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` with real values. **Minimum to start the API in development:**

| Variable | Purpose | Local example |
|----------|---------|---------------|
| `DATABASE_URL` | Postgres + PostGIS | Shared dev DB URL from team, or `postgresql://propmetrik:propmetrik_dev@127.0.0.1:5432/propmetrik` after [local Docker DB](#optional-local-postgres--redis) |
| `REDIS_URL` | Sessions, cache, queues | Shared dev Redis, or `redis://127.0.0.1:6379` with local Docker |
| `KEYCLOAK_URL` | SSO issuer | `https://sso.propmetrik.com` (shared dev Keycloak) |
| `KEYCLOAK_REALM` | Realm name | `propmetrik` |
| `KEYCLOAK_CLIENT_ID` | API client | From team / Keycloak admin |
| `KEYCLOAK_CLIENT_SECRET` | API client secret | From team / Keycloak admin |
| `JWT_SECRET` | Local JWT signing | Any random string ≥16 chars (`openssl rand -hex 32`) |
| `OPENSEARCH_URL` | Search index | Shared dev OpenSearch URL from team |
| `OPENSEARCH_USERNAME` / `OPENSEARCH_PASSWORD` | OpenSearch auth | From team |

Also set in dev (defaults in `.env.example`):

- `AUTH_DEV_BYPASS=true` — optional dev-only unauthenticated shortcut (local only)
- `RUN_BACKGROUND_JOBS=false` — keeps cron/scrapers off locally
- `FRONTEND_URL=http://localhost:3000`
- `APP_URL=http://localhost:4000`

**Start backend:**

```bash
cd backend
npm run dev
```

Health check: http://localhost:4000/health — Postgres should show `up`. Redis/OpenSearch may show `down` if URLs are wrong; fix those before testing login.

**Run migrations** (first time or empty local DB):

```bash
cd backend
npm run migrate
```

---

## 3. Frontend (`frontend/.env.local`)

```bash
cp frontend/.env.example frontend/.env.local
```

Generate a secret:

```bash
openssl rand -hex 32
```

Put the same value in both `AUTH_SECRET` and `NEXTAUTH_SECRET` in `.env.local`.

| Variable | Purpose |
|----------|---------|
| `AUTH_SECRET` | **Required** — Auth.js throws `MissingSecret` without this |
| `NEXTAUTH_SECRET` | Same value as `AUTH_SECRET` (legacy alias) |
| `NEXTAUTH_URL` | `http://localhost:3000` |
| `INTERNAL_API_URL` | `http://localhost:4000` |
| `NEXT_PUBLIC_API_URL` | `/api` |

**Start frontend:**

```bash
cd frontend
npm run dev
```

Or from repo root: `npm run dev:app` (backend + frontend together).

---

## Optional: local Postgres + Redis

If you do not use the shared dev database:

```bash
cd backend
npm run docker:local   # docker compose --profile local-db up -d
```

Then in `backend/.env`:

```
DATABASE_URL=postgresql://propmetrik:propmetrik_dev@127.0.0.1:5432/propmetrik
REDIS_URL=redis://127.0.0.1:6379
```

Run migrations and seed if needed. You still need Keycloak credentials, OpenSearch, and MinIO URLs from the team for full functionality — login and CRM pages need the shared dev stack or equivalent.

---

## Verifying the PR #21 fixes

After backend and frontend are both running and you can log in:

| Page | What to check |
|------|----------------|
| `/dashboard/valuations` | No demo/customer org valuations in your portal list |
| `/dashboard/deals/contacts` | Summary stat cards show counts; no 500 on `/api/crm/contacts/stats` in console |
| `/dashboard/deals/analytics` | Page loads; no `win_rate.toFixed is not a function` error |

---

## Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| Auth.js `MissingSecret` | No `frontend/.env.local` or empty `AUTH_SECRET` | Copy `frontend/.env.example` → `.env.local`, set secrets |
| Backend exits on startup / OpenSearch `Missing node(s)` | `OPENSEARCH_URL` unset | Add OpenSearch URL from team `.env` |
| `connect ECONNREFUSED` on DB port | Postgres not running or wrong `DATABASE_URL` | Start Docker local DB or use shared dev URL |
| Login returns 500 | Backend down, Redis down, or wrong Keycloak/JWT config | Check `backend/.env`, hit `/health`, read backend logs |
| Frontend builds but login fails | Backend not reachable | Ensure backend on :4000 and `INTERNAL_API_URL` matches |

---

## What is not in the repo

- `backend/.env` — full infrastructure credentials
- `frontend/.env.local` — Auth.js secrets

Request the **shared development `.env`** from the PropMetrik / Cedyn team if you need to match production-like data (Eric's super-admin account, existing valuations, CRM contacts).
