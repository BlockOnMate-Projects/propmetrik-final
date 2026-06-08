# Vendor Portal — Future Specification

Status: **NOT BUILT** — spec only. Captured 2026-06-07 so we don't lose the design.

This document describes a future **vendor portal**: giving maintenance vendors their
own login so they can accept/decline jobs, update status, schedule visits, and upload
completion evidence themselves — instead of staff doing everything on their behalf.

---

## 1. Why this isn't built yet (current state)

Today vendors are **contact records only**. The `vendors` table
(`backend/database/migrations/035_property_management_module.sql`) has
`business_name`, `contact_person`, `phone_primary`, `email`, service categories,
ratings, and payment details — but **no `user_id`**. A vendor cannot authenticate.

As of 2026-06-07 the maintenance notification gap was closed **without** a portal:

- **Vendor is notified by email + SMS** on assignment / reschedule
  (`workOrderService.notifyVendorAndTenant`). Uses the `notify()` email-only path
  (`shared-services/notifications/notify.ts`) since vendors have no inbox.
- **Tenant sees** the assigned vendor (name, contact, phone) and the scheduled visit
  window on the tenant maintenance detail page, and is notified in-app + email.
- **Staff set the visit** (date + time-from/to) in the Assign Vendor modal.

That is production-grade for a *contact-based* vendor model. The portal below is the
next tier: vendors as **active platform participants**.

### What email/SMS-only CANNOT do (the actual gap a portal fills)
1. Vendor cannot **accept or decline** a job — staff assume acceptance.
2. Vendor cannot **propose / confirm** their own visit time — scheduling is one-way.
3. Vendor cannot **update status** (en route, on site, in progress, completed).
4. Vendor cannot **upload completion photos / notes / invoice** — staff transcribe it.
5. No vendor-side **job history, earnings, or document store**.
6. No **two-way thread** between vendor and staff/tenant scoped to a work order.

---

## 2. Design principles (carry over from the platform)

- **Config-driven URLs only.** No hardcoded hosts — 4000+ users, multiple domains.
  Vendor portal host is a config value, never a literal.
- **Session isolation.** Never set a shared cookie domain. Staff, tenant, and vendor
  sessions must stay isolated (host-only cookies), exactly like the
  tenant.propmetrik.com split. See `tenant-subdomain-split` memory.
- **Best-effort notifications.** Every `notify()` call wrapped in try/catch, logged,
  never rethrown into the business action.
- **Notifications are centralized.** Reuse `notify()` + a new `resolveVendor()` /
  `resolveVendorUser()` resolver. Add a `'vendor'` audience to `NotifyAudience`.
- **Canonical domains** (see `domain-architecture` memory): propmetrik.com (app),
  tenant.propmetrik.com (tenant portal), api.propmetrik.com (backend).
  `app.propmetrik.com` is DEAD. Proposed vendor host: **vendor.propmetrik.com**.

---

## 3. Domain & routing

- New subdomain **vendor.propmetrik.com**, routed the same way the tenant portal is
  (Next.js `trustHost` + middleware host routing). Host-only cookies → isolated session.
- Reuse the existing Next.js middleware host-routing pattern; add a `vendor` branch.
- Backend: a `vendor-portal` route module under `backend/src/routes/vendorPortal.ts`,
  mounted at `/api/v1/vendor-portal` (+ `/api` double-mount per platform convention),
  guarded by a new `requireVendorAuth` middleware.

---

## 4. Authentication model

Decision point — pick ONE:

**Option A — Keycloak users (recommended, matches tenants).**
- Add `vendors.user_id UUID REFERENCES users(id)` (nullable until invited).
- Vendor users get `user_type = 'vendor'` in `users` (extend the enum/check).
- Invite flow mirrors tenant invite (`inviteTenant` → notifier + set-password link;
  see `magicLink` / `/tenant/set-password` work). New `/vendor/set-password` page.
- `requireVendorAuth` validates the Keycloak JWT and confirms `user_type='vendor'`
  AND that the user is linked to a vendor in the caller's context.
- **Pro:** one identity system, SSO-ready, consistent with staff/tenant.

**Option B — lightweight magic-link only (no password).**
- Each work-order assignment generates a signed, expiring deep link
  (reuse `generateMagicLink`, already dynamic for path + expiry).
- Vendor clicks → scoped, time-boxed access to *that* work order only. No account.
- **Pro:** zero onboarding friction. **Con:** no persistent dashboard / history.

> Recommendation: **Option A** for the full portal, but ship **Option B** first as a
> stepping stone (magic-link "manage this job" page) — it delivers accept/decline +
> status + photo upload with almost no auth surface, and upgrades cleanly to A later.

---

## 5. Database changes

```sql
-- Link a vendor to a login account (Option A)
ALTER TABLE vendors ADD COLUMN user_id UUID REFERENCES users(id);
CREATE UNIQUE INDEX idx_vendors_user_id ON vendors(user_id) WHERE user_id IS NOT NULL;

-- Extend users.user_type to include 'vendor' (enum or CHECK constraint)

-- Work-order lifecycle the vendor drives
ALTER TABLE maintenance_work_orders
  ADD COLUMN vendor_accepted_at        TIMESTAMPTZ,
  ADD COLUMN vendor_declined_at        TIMESTAMPTZ,
  ADD COLUMN vendor_decline_reason     TEXT,
  ADD COLUMN vendor_proposed_date      DATE,
  ADD COLUMN vendor_proposed_time_start TIME,
  ADD COLUMN vendor_proposed_time_end   TIME,
  ADD COLUMN en_route_at               TIMESTAMPTZ,
  ADD COLUMN on_site_at                TIMESTAMPTZ;

-- New work_order_status values to add: 'declined', 'accepted', 'scheduled',
-- 'en_route', 'on_site' (extend the enum; keep existing open/assigned/in_progress/
-- pending_approval/completed/cancelled).

-- Optional: vendor invoices / quotes (if vendors submit their own pricing)
CREATE TABLE vendor_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID REFERENCES maintenance_work_orders(id),
  vendor_id     UUID REFERENCES vendors(id),
  organization_id UUID REFERENCES organizations(id),
  amount NUMERIC(12,2),
  currency VARCHAR(3) DEFAULT 'GHS',
  status VARCHAR(20) DEFAULT 'submitted', -- submitted/approved/rejected/paid
  line_items JSONB,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  ...
);
```

Reminder: migrations are **NOT auto-run** — `npm run migrate`, and each migration must
be idempotent. See the `migrations-workflow` memory (the 28-behind incident).

---

## 6. Backend endpoints (`/api/v1/vendor-portal`, `requireVendorAuth`)

| Method | Path | Purpose |
|---|---|---|
| GET  | `/jobs` | List work orders assigned to this vendor (filter by status) |
| GET  | `/jobs/:id` | Job detail — property, location, access, tenant contact*, schedule |
| POST | `/jobs/:id/accept` | Vendor accepts → status `accepted`; notify staff + tenant |
| POST | `/jobs/:id/decline` | Vendor declines (reason) → status `declined`; alert staff to reassign |
| POST | `/jobs/:id/propose-schedule` | Vendor proposes/confirms visit window; notify tenant |
| POST | `/jobs/:id/status` | en_route / on_site / in_progress transitions; notify tenant live |
| POST | `/jobs/:id/complete` | Completion notes + `photos_after` + optional invoice; → pending_approval |
| POST | `/jobs/:id/messages` | Two-way thread scoped to the work order |
| GET  | `/profile` | Vendor's own profile + service categories |
| PUT  | `/profile` | Update contact / payment details (staff re-verify sensitive fields) |
| GET  | `/earnings` | Completed jobs + payment status (read-only) |

\* **Privacy:** expose tenant *first name + phone* only after the vendor has **accepted**
and only for an active job. Never expose tenant email or full PII. Mask before accept.

### Service layer
- Extend `workOrderService` with vendor-driven transitions, OR add a focused
  `vendorJobService` that calls into it. Keep all status writes funneled so
  notifications fire from one place.
- Add resolvers to `notify.ts`: `resolveVendor(vendorId)` (email/phone, audience
  `'vendor'`) and `resolveVendorUser(userId)`. Add `'vendor'` to `NotifyAudience`;
  route vendor in-app inbox to a new `vendor_notifications` table (mirror
  `tenant_notifications`) or to `user_notifications` if Option A (vendor IS a user).

---

## 7. Notification matrix (target state)

| Event | Staff | Tenant | Vendor |
|---|---|---|---|
| Work order created | in-app | in-app + email | — |
| Assigned to vendor | — | in-app + email | **in-app + email + SMS** |
| Vendor **accepts** | **in-app** | **in-app + email** | confirmation |
| Vendor **declines** | **in-app (high) → reassign** | (silent or "finding another vendor") | — |
| Visit scheduled / proposed | in-app | **in-app + email** | in-app |
| Vendor en route / on site | (optional) | **in-app + SMS** ("vendor is on the way") | — |
| In progress | — | in-app | — |
| Completed (vendor submits) | **in-app — approve** | in-app + email | confirmation |
| Invoice submitted | **in-app — approve** | — | — |
| Payment released | — | — | **in-app + email** |

Today only the "Assigned to vendor" / "scheduled" rows fire (via email/SMS to vendor,
in-app+email to tenant). Everything in **bold** is the portal's net-new value.

---

## 8. Frontend (vendor.propmetrik.com)

Mirror the tenant `PortalShell` pattern. Pages:

- `/vendor/login` + `/vendor/set-password` (Option A) — reuse tenant auth components.
- `/vendor/jobs` — job queue: New (needs accept/decline), Scheduled, In Progress, Done.
- `/vendor/jobs/[id]` — accept/decline, propose schedule, status buttons
  (En route → On site → In progress → Complete), photo upload, message thread.
- `/vendor/profile` — contact + service categories + payment details.
- `/vendor/earnings` — completed jobs + payment status.
- PWA + push (extend the existing service worker / push setup) so vendors get job
  alerts on mobile — vendors are field workers, mobile-first is essential.

---

## 9. RBAC / security notes

- `requireVendorAuth` must scope every query to `assigned_vendor_id = <this vendor>`.
  A vendor must never read another vendor's jobs or any unassigned work order.
- Sensitive vendor fields (bank account, mobile money) — let vendor view/edit, but
  flag changes for staff re-verification before payouts.
- Rate-limit accept/decline and status endpoints.
- Tenant PII exposure gated on `vendor_accepted_at IS NOT NULL` + active job (§6).
- Audit every vendor-driven status change (who/when) — reuse the PM audit table.

---

## 10. Suggested phasing

1. **Phase 1 (magic-link, no accounts):** Option B deep link → a single-job page with
   accept/decline + status + photo upload. ~Highest value / lowest effort.
2. **Phase 2 (accounts):** `vendors.user_id`, Keycloak `user_type='vendor'`, invite +
   set-password, persistent `/vendor/jobs` dashboard, `vendor_notifications`, PWA push.
3. **Phase 3 (financial):** `vendor_invoices`, quote submission, staff approval,
   payment-released notification, `/vendor/earnings`.
4. **Phase 4 (quality loop):** post-completion tenant rating feeds `vendors.average_rating`,
   auto-suggest best-rated vendor per `service_category` when assigning.

---

## 11. Touch-point index (where today's code lives)

- Vendor schema: `backend/database/migrations/035_property_management_module.sql`
- Vendor service / routes: `backend/src/services/property-management/maintenance/vendorService.ts`,
  `backend/src/routes/vendors.ts`
- Work order service: `backend/src/services/property-management/maintenance/workOrderService.ts`
  (`assignWorkOrder`, `notifyVendorAndTenant`, `updateWorkOrder` reschedule hook)
- Assign route + validation: `backend/src/routes/propertyManagement.ts` (`/work-orders/:id/assign`),
  `backend/src/middleware/validation.ts` (`pmAssignWorkOrderSchema`)
- Tenant API for vendor/schedule: `backend/src/routes/tenantPortal.ts`
  (`GET /maintenance/status/:workOrderId`)
- Notification core: `backend/shared-services/notifications/notify.ts`
- Staff UI: `frontend/src/app/dashboard/property-management/maintenance/[id]/page.tsx`
- Tenant UI: `frontend/src/app/dashboard/tenant/maintenance/[id]/page.tsx`
- Tenant API client: `frontend/src/lib/tenant/api.ts`
- Reusable auth precedents: tenant invite (`inviteTenant`), `generateMagicLink`,
  `/tenant/set-password`, tenant subdomain middleware split.
