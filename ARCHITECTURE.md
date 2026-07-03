# PROPMETRIK — Architecture Overview

> Onboarding + technical-due-diligence reference. For strategy see `docs/` (Vision 2040, business plan); for the audit/remediation log see `docs/CODEBASE_AUDIT.md`.

## 1. System at a glance

A monorepo delivering a real-estate intelligence & operations platform (≈513K LOC):

```
propmetrik/
├── backend/          Express + TypeScript API (port 4000)  ── 251K LOC
│   ├── src/
│   │   ├── routes/            81 HTTP routers (domain-organised)
│   │   ├── services/          business logic, by domain (see §3)
│   │   ├── middleware/        auth, audit, request-id, rate-limit, validation
│   │   ├── config/            centralized env/config
│   │   └── database/          pg pool + migration runner
│   ├── shared-services/       cross-cutting engines (e-sign, notifications, publications, document-service, ml-serving)
│   └── database/migrations/   239 SQL migrations (NOT auto-run; `npm run migrate`)
├── frontend/         Next.js 14 App Router (port 3000)  ── 263K LOC
│   └── src/{app, components, lib, types}
└── docs/             strategy + governance documents
```

Plus a **Python valuation service** (FastAPI, port 8001) under `backend/src/services/valuation-engine/python` and an **ML-serving** service under `backend/shared-services/ml-serving`.

## 2. Runtime topology

- **Frontend** (Next.js, Oracle host) proxies `/api/*` → backend `/api/v1/*` (see `frontend/next.config.js` rewrites); `/ml-api/*` → Python service.
- **Backend** (Express, Oracle host) → **PostgreSQL** (single production DB at `pg.cedynhq.com:5434/propmetrik` — there is no separate dev DB; treat all DB commands as production).
- **Infra** (Hetzner): Keycloak (auth), MinIO/S3 (`s3.cedynhq.com`), OpenSearch (marketplace search), Redis.
- **Domains:** `propmetrik.com` (app + marketing), `tenant.propmetrik.com` (tenant portal), `api.propmetrik.com` (backend). `app.propmetrik.com` is retired.

## 3. Backend domains (product services)

| Domain | Path | Responsibility |
|---|---|---|
| **Valuation** | `services/valuation-engine` | Hybrid TS+Python valuation (Sales Comparison, Cost, Income, Residual, Profits, DRC), HBU, reports |
| **Property Management** | `services/property-management` | Leases, tenants, maintenance, vendors, rent collection, financial reporting |
| **Project Management** | `services/project-management` | Construction/dev: budgets, draws, change orders, Gantt, procurement, contractors |
| **Deal Management (CRM)** | `services/crm-deal-management` | Pipelines, contacts, agreements, commissions |
| **Data Hub** | `services/data-hub` | Ingestion, ETL, geocoding, catalog, lineage, quality, anonymisation — the data pipeline |
| **Analytics** | `services/analytics` | Indices (GHPI, GHAI, CCI, GCPI), market intelligence, ML analytics |

### Cross-cutting (`shared-services/` + `middleware/`)
- **Auth:** Keycloak JWT. `middleware/auth.ts` (`authenticate`, `optionalAuth`); PM/CRM routes add `requirePMAccess`/`requireServiceAccess`. Org scoping via `getOrganizationId`/`getAuthOrgId` (`middleware/pmAuth.ts`) — **every tenant-scoped query filters `organization_id`**.
- **Audit:** `middleware/auditMutations.ts` records every write into the canonical, **append-only** `audit_logs` table (immutability enforced by triggers, migration 238). Domain-specific trails also exist (`pm_audit_logs`, valuation `report_audit_log`, e-sign).
- **Logging:** pino (`utils/logger.ts`) with secret redaction; `middleware/requestId.ts` correlation IDs; pino-http access logs.
- **Notifications:** single entry `shared-services/notifications/notify.ts` → `unified/` (3-tier email Graph→SES→SMTP + Twilio SMS + SSE); audience routing staff vs tenant.
- **Documents/PDF:** `shared-services/document-service` (Handlebars→Puppeteer, e.g. the lease template), valuation-engine (LibreOffice/docx), publications (Puppeteer).
- **E-sign:** `shared-services/e-sign` (envelope model — `esign_envelopes`); a legacy magic-link/signing-request system also exists (consolidation tracked in `docs/CODEBASE_AUDIT.md`).
- **Config:** `src/config/index.ts` is the source of truth for env (prefer it over scattered `process.env`).

### Route mounting
Routers mount in `src/index.ts`, typically **double-mounted** at `/api/v1/<x>` and `/api/<x>` (frontend compatibility), each with its own auth/service-access middleware. Global middleware order: body-parser → request-id → pino-http → rate-limit → **auditMutations** → routers. Data-intake routes (`/ingestion`, `/pull-integrations`) are guarded by `middleware/ingestionAuth.ts` (API key or authenticated user).

## 4. Frontend structure

- **App Router** under `src/app`: route groups `(marketing)` (public site), `(auth)`; `dashboard/*` (authenticated app, by domain); tenant/vendor/contractor portals; `sign`/`esign` (signing).
- **API clients** in `src/lib/*-api.ts` — go through the shared `fetchApi`/`authedFetch` wrapper (`lib/api.ts`, `lib/authed-fetch.ts`). Auth via NextAuth (`src/auth.ts`, Keycloak).
- **Data fetching:** React Query (Tanstack) is the dominant pattern; some server components and a minority of raw `useEffect`.
- **Components** in `src/components`, organised by domain + `ui/` primitives. **Types** in `src/types` mirror backend enums (a shared types package is a known improvement).

## 5. Data-model conventions

- **Multi-tenant:** rows carry `organization_id`; reads are org-scoped.
- **Multi-currency:** money is `NUMERIC(x,2)` (never float) + a currency enum; **never hardcode a currency** (the lease/rent-currency bug is the cautionary tale — always read `rent_currency`/`rentCurrency`).
- **Soft delete:** `deleted_at` on core/financial tables (tenants, vendors, properties, work-orders, rent_payments, deals); reads filter `deleted_at IS NULL`. Financial records + `audit_logs` are never hard-deleted.
- **Migrations:** sequentially numbered SQL in `backend/database/migrations`; **NOT auto-run** — apply with `npm run migrate`. Must be **idempotent** (`IF NOT EXISTS`); no down-migrations (append-only).

## 6. Local development

```bash
# Backend (tsx watch, hot-reload) — needs backend/.env (DATABASE_URL, Keycloak, MinIO, etc.)
cd backend && npm run dev          # http://localhost:4000
npm run migrate                    # apply pending migrations (hits PROD DB — there is no dev DB)

# Frontend
cd frontend && npm run dev         # http://localhost:3000

# Python valuation service (single entrypoint app.main:app — mounts all app/methods/* routers)
cd backend/src/services/valuation-engine/python && uvicorn app.main:app --port 8001 --reload   # :8001
```

## 7. Key conventions & gotchas

- **One production database.** Local `NODE_ENV=development` still points `DATABASE_URL` at prod. No dev sandbox.
- **Config-driven, never hardcoded** hosts/currencies/fees (4000+ users, multiple domains/currencies).
- **Notifications are best-effort** — wrap in try/catch, never throw into the triggering business action.
- **Audit is append-only** — `audit_logs` rejects UPDATE/DELETE at the DB level.
- **Secrets** live only in `.env` (git-ignored); never commit credentials (see `docs/CODEBASE_AUDIT.md`).

## 8. Where to look next
- `docs/VISION_2040_BLUEPRINT.md` + `docs/vision-2040/` — long-range strategy.
- `docs/PROPMETRIK_BUSINESS_PLAN.md`, `docs/INVESTOR_MATERIALS_MASTER_BRIEF.md` — investor materials.
- `docs/CODEBASE_AUDIT.md` — audit findings, remediation log, and the prioritised backlog.
