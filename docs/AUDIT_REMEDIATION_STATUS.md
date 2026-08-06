# Audit remediation — status

**Madhu · Aug 2026**

Living backlog for the full audit report. For PR links, verification commands, and post-pull setup, use **`AUDIT_DELIVERY.md`** — that's the handoff doc to share with the team.

---

## Done (scoped work)

All eight agreed items are merged to `main` (PRs #1–#6). See `AUDIT_DELIVERY.md` for links and details.

### Phase 2 (complete — PRs #10–#14)

| Item | Status |
|------|--------|
| Remove tracked Scrapy HTTP cache (~8,958 files / ~49MB) | Done |
| Delete unused `propertyMapper.ts` | Done |
| Remove obsolete one-off scripts (Python template fixers, cred-bearing diagnostics, broken `queue-worker`) | Done |
| Extract daily logs from `projects.ts` → `dailyLogs.ts` | Done |
| Extract payment plans → `paymentPlans.ts` | Done |
| Extract punch lists → `punchLists.ts` | Done |
| Extract project integration → `projectIntegrationRoutes.ts` | Done |
| Extract project wizard → `projectWizardRoutes.ts` | Done |
| Extract project cost/currency → `projectCostRoutes.ts` | Done |
| Extract location validation → `projectLocationRoutes.ts` | Done |
| Remove dead middleware exports | Done |
| Frontend CI workflow (`next lint` + `next build`) | Done |
| Fix Python image CI GHCR permissions | Done |
| Split `valuations.ts`, `propertyManagement.ts` | Deferred (Phase 4 / audit backlog) |

### Phase 3 — CRM review (complete)

See `docs/PHASE3_CRM_REVIEW.md`. Review + fix only — no new CRM features.

| Item | Status |
|------|--------|
| Fix `getUpcomingTasks` broken SQL interval | Done (#15) |
| ORDER BY injection on CRM list endpoints | Done (#16) |
| Remove `ALTER TABLE DISABLE TRIGGER` on deal updates | Done (#16) |
| CRM PDF generation (empty buffers) | Verified — real Puppeteer; audit claim stale |
| Commission org-scoping on approve/pay | Verified — already guarded |
| `workflow.test.ts` phantom `crm_*` tables | Done (#17) |

---

## Still open (summary)

The audit is a long roadmap. Below is a quick map — not everything from the PDF.

### Security

| Item | Status |
|------|--------|
| `AUTH_DEV_BYPASS` explicit opt-in | Partial — prod ignores it |
| Google login token verify | Done in `auth.ts` |
| `JWT_SECRET` prod fail-fast | Partial — prod strict, dev lenient |
| `AppError` instanceof | Done |
| Team route cross-org guard | Done |
| `serviceTeam` org scoping | Done |
| Admin portal server RBAC | Backlog |
| RBAC `user_type=staff` gate | Done |
| Python engine auth | Backlog |
| E-sign `optionalAuth` | Backlog |
| Charts preview SSRF | Done |
| Signup org-slug takeover | Done |
| Webhook signatures | Backlog |

### Performance, dead code, tooling

- **Performance:** auth middleware DB fan-out, no search debounce, root `force-dynamic` — all backlog
- **Dead code:** scrapy cache + obsolete scripts removed; `projects.ts` split into 8 sub-routers (6.8k → 4.8k lines); mega routes (`valuations.ts`, `propertyManagement.ts`) still backlog
- **Tooling:** backend CI green; **frontend CI added** (`next lint` + `next build`); no coverage gate

### Migrations

- Checksum on edited files: **on in production**
- Fresh install from empty DB: **still broken** on ordering (`054` before CRM tables)

---

## Already on `main` before my pass

From `CODEBASE_AUDIT.md`: credential scrub, mutation audit middleware, immutable `audit_logs`, soft-delete columns (endpoints not all converted), ingestion API key guard, vendors soft-delete pattern.

---

## What I'd do next (Phase 4 — in progress)

See `docs/PHASE4_BACKLOG.md`. First up: split `valuations.ts` (7.3k lines), then `propertyManagement.ts`, then security backlog.

1. Split mega routes (`valuations.ts`, `propertyManagement.ts`)
2. Admin portal server RBAC
3. Webhook signatures + Python engine auth
4. Fresh DB migration ordering fix (`054` before CRM tables)

---

*Evidence: `docs/audit/01`–`17`. Update this file as more items ship.*
