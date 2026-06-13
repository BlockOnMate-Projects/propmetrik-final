# PROPMETRIK — Codebase Audit & Remediation Log

> **Status:** Living · Internal
> **Scope:** ~513K LOC (backend 251K, frontend 263K), 81 route files, 239 migrations, 315 pages.
> **Lens:** maintainability + **auditability** (the company is heading toward regulated financial infrastructure).

---

## 1. What was REMEDIATED in this pass (done)

### 🔴 Critical — leaked production credential
- **Removed** the prod DB password (`propmetrik_app@pg.cedynhq.com`) from **24 tracked ad-hoc scripts** (deleted them all).
- **Fixed** the e2e helper (`frontend/e2e/helpers/auth.ts`) to require `E2E_PASSWORD` from env — no hardcoded credential, throws if unset.
- **Verified:** `git grep` for the secret now returns **0**.
- **Still required from the operator (cannot be done in-repo):**
  1. **Rotate** the password: `ALTER USER propmetrik_app WITH PASSWORD '<new>';` then update `DATABASE_URL` in server `.env`s.
  2. **Purge git history** + force-push: `git filter-repo --replace-text` then `git push --force --all`.

### 🟠 Auditability foundation
- **Platform-wide mutation audit** — new `backend/src/middleware/auditMutations.ts`, mounted once in `index.ts`. Every write (POST/PUT/PATCH/DELETE) is recorded into the canonical `audit_logs` table (actor, org, entity, action, request-id, IP, UA, redacted body, status). Best-effort: never throws into the request. **Zero per-handler wiring.**
- **Immutable audit trail** — migration **238** installs row-level triggers rejecting `UPDATE`/`DELETE` on `audit_logs` (append-only) + query indexes. **Verified:** real mutations are blocked.
- **Soft-delete foundation** — migration **239** adds `deleted_at` to `properties`, `vendors`, `maintenance_work_orders`, `rent_payments`, `deals` (+ partial "active" indexes). `tenants` already had it (230).
- **Vendors converted end-to-end** (reference implementation) — `deleteVendor` now soft-deletes; all three vendor read paths filter `deleted_at IS NULL` (`teamService.ts`).
- **Guarded data-intake routes** — new `backend/src/middleware/ingestionAuth.ts`; `/api/v1/ingestion` and `/api/(v1/)pull-integrations` now require a valid `x-api-key` (`INGESTION_API_KEY`) **or** an authenticated user. Anonymous access is blocked.

---

## 2. Remaining soft-delete conversions (staged backlog)

`deleted_at` columns exist; the **endpoints + read paths** must be flipped table-by-table. **Rule:** convert the delete to `UPDATE … SET deleted_at = NOW()` AND add `AND deleted_at IS NULL` to *every* read of that table (a half-conversion makes deleted rows reappear). Per table:

| Table | Hard-delete endpoint(s) | Read paths to filter | Notes |
|---|---|---|---|
| `properties` | `DELETE /api/v1/pm/properties/:id` | `propertyService` reads use `status != 'withdrawn'` — add `deleted_at IS NULL` to all `FROM properties` queries (lines ~268, 278, 290, 538) | property domain uses `status` as a pseudo-delete; standardise on `deleted_at` |
| `maintenance_work_orders` | work-order delete | `workOrderService` reads | — |
| `rent_payments` | (financial — should have **no** delete endpoint) | — | financial records: never hard-delete; verify no DELETE route exists |
| `deals` | CRM deal delete | `dealService` reads (some already filter `deleted_at`) | confirm all reads filter |
| project domain | various `project_*` deletes | many | **no single `projects` parent table** — needs its own design pass |

## 3. Retention policy (to implement as a scheduled job — NOT in-band deletes)

- **Financial records** (`rent_payments`, invoices) and **`audit_logs`**: retain indefinitely / per statutory minimum; never hard-delete.
- **Soft-deleted operational rows**: archive after a defined window (e.g. 7 years) via an **out-of-band, audited** archival job — never via application DELETE endpoints.

---

## 4. Audit findings NOT yet actioned (prioritised backlog)

**High (auditability / DD):**
- **Wire the in-app/financial mutations through the audit middleware-equivalent for *value* diffs** — the HTTP middleware captures the request; for true before/after field diffs on key entities, add service-level `old_values`/`changed_fields` capture on the money paths (payments, valuation, lease).
- **Tests:** ~25 backend test files vs 251K LOC (<5%). Prioritise tests on money paths (payments, valuation, lease) first.
- **141 `console.log` leaks** in backend bypass pino → route through `logger`.

**Medium (maintainability):**
- **E-sign — partially consolidated (in progress).** Two engines live in the 2,972-line `eSign.ts`: the **Envelope engine** (`esign_envelopes`/`esign_signers`/`esign_fields`, routes `/envelopes/*`, `/sign-envelope/*`) and the **legacy Signing-Request engine** (`signing_requests`, routes `/requests`, `/sign`, `/verify-token`, `/verify-otp`, `/signature-requests/*`, `/signing/*`). The **Envelope engine is the canonical standard** — lease, valuation (`approvalService`), project (`changeOrder`/`draw`/`contractor`), and deal (`dealService`) already create envelopes. **Done this pass:** removed the standalone `E-SIGN` (F7) top-menu item and staff-gated `/dashboard/e-sign/*` (`layout.tsx`); external signers still use the public `/sign/[token]`.
  - **⚠️ PRESERVE (working, reusable reference — do NOT delete):** `shared-services/e-sign/envelopeService.ts`, the `/envelopes`+`/sign-envelope` routes, `frontend/.../dashboard/e-sign/new` (envelope designer), `frontend/.../app/sign/[token]`, `lib/esign-api.ts`, and `tenancyService` lease integration. **Only the PM lease flow is tested/confirmed.**
  - **Deferred (until each domain is sign-tested):** migrate the legacy stragglers (`crm/signatures.ts` + `crm-deal-management/signatureService`'s `signature_envelopes` wrapper; project `complianceReportService`/`ReportManagementService`) onto envelopes, then delete the legacy Signing-Request engine + its tables, then split `eSign.ts`. Verify per-domain (lease ✓, valuation, project, deal) before removing anything legacy.
- **Mega-route-files**: `projects.ts` (6,702), `valuations.ts` (5,938), `propertyManagement.ts` (3,541) — split into sub-routers.
- **~295 scattered `process.env.*`** despite `config/index.ts` — route through config.
- **Frontend:** 3 competing fetch wrappers (`authedFetch`/`fetchApi`/rogue per-client) → unify; ~40–50 enums hand-mirrored backend→frontend → shared types package; ~986 `any`; ~600 console.logs; ~20 hardcoded `localhost`.
- **Migration numbering collisions** (8/9/10/11/… have multiple files at the same prefix) — cosmetic but messy; no down/rollback story.

**Cleanup (safe deletes):**
- Dead files: `backend/src/routes/crm.ts.bak` (3,763 lines), `frontend/.../deals/page.tsx.bak`, `deals/[id]/page.tsx.bak`, `deals/contacts/new/page.tsx.bak`, `valuations/[id]/market/page.tsx.backup`, `frontend/src/lib/valuation-api-old.ts`.
- Content-identical pages: 7 `press-research/*` (same redirect), 16 identical `deals/*/loading.tsx`, `admin/subscription-costs` == `admin/subscription-pricing` → extract one shared component.

---

## 5. What's already good (state to investors)
Domain-organised services; centralized `config`; **pino structured logging (~2,400 calls, with secret redaction), request-id middleware, HTTP access logs**; consistent org-scoping (`getOrganizationId`) in PM/CRM; **NUMERIC(x,2) money columns** (no floats) + currency enum; zod validation on ~55% of write routes; React Query on 63% of pages.

*Last updated: this remediation pass. Sections 2–4 are the open backlog.*
