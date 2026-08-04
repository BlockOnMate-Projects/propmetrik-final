# Audit remediation — status

**Madhu · Aug 2026**

Living backlog for the full audit report. For PR links, verification commands, and post-pull setup, use **`AUDIT_DELIVERY.md`** — that's the handoff doc to share with the team.

---

## Done (scoped work)

All eight agreed items are merged to `main` (PRs #1–#6). See `AUDIT_DELIVERY.md` for links and details.

### Phase 2 (in progress — branch `chore/phase2-cleanup`)

| Item | Status |
|------|--------|
| Remove tracked Scrapy HTTP cache (~8,958 files / ~49MB) | Done |
| Delete unused `propertyMapper.ts` | Done |
| Remove obsolete one-off scripts (Python template fixers, cred-bearing diagnostics, broken `queue-worker`) | Done |
| Extract daily logs from `projects.ts` → `dailyLogs.ts` | Done |
| Remove dead middleware exports (`clearCustomerSubCache`, duplicate `requireResourcePermission`, `cleanupExpiredIdempotencyRecords`) | Done |
| Split more mega-routes (`valuations.ts`, `propertyManagement.ts`) | Backlog |
| Frontend CI workflow | Backlog |

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
- **Dead code:** scrapy cache + `propertyMapper` + obsolete scripts removed; daily logs split from `projects.ts`; mega routes (`valuations.ts`, `propertyManagement.ts`) still backlog
- **Tooling:** backend CI green; **no frontend CI**; no coverage gate

### Migrations

- Checksum on edited files: **on in production**
- Fresh install from empty DB: **still broken** on ordering (`054` before CRM tables)

---

## Already on `main` before my pass

From `CODEBASE_AUDIT.md`: credential scrub, mutation audit middleware, immutable `audit_logs`, soft-delete columns (endpoints not all converted), ingestion API key guard, vendors soft-delete pattern.

---

## What I'd do next

1. Security leftovers (admin RBAC, e-sign, webhooks)
2. Performance quick wins (auth cache, debounced search)
3. Frontend CI workflow

---

*Evidence: `docs/audit/01`–`17`. Update this file as more items ship.*
