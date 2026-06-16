# PropMetrik Education Module — Enterprise Implementation Specification

**Version:** 1.1  
**Date:** June 2026  
**Scope:** Full end-to-end specification for `user_type = education` — faculty and student roles, cohort management, assignment workflow, bring-your-own-data valuation, billing, RBAC, database schema, API endpoints, and UI routing.

> **Revision v1.1 — Billing model changed to STUDENT-PAID, hard-gated.**
> v1.0 billed the **faculty/department** per cohort up front (students then enrolled free). v1.1 inverts this: **each student pays their own per-seat semester fee**, and a student gets **no access to the workspace until they pay**. Payment is unlocked only **after the professor approves** their enrollment for that semester. The faculty-invoice path (`edu_invoices`, manual admin confirmation) is **removed**; student seat fees are collected automatically through the platform's existing Paystack/MoMo rails and recorded in the unified `payment_transactions` ledger. Sections changed: 1 (principles), 2 (ADR), 3 (access), 4 (schema — `edu_enrollments` gains an access-gate state machine; `edu_invoices` dropped), 5 (RBAC), 6 (billing), 7 (onboarding), 10 (API), 12 (notifications), 13 (payment), 14 (migrations, renumbered ≥249), 15 (phase plan). Sections 8 (assignment workflow), 9 (BYOD), 11 (UI) are unchanged except where access-gating is referenced.

---

## Table of Contents

1. [Overview & Objectives](#1-overview--objectives)
2. [Architecture Decision Record](#2-architecture-decision-record)
3. [User Types & Roles](#3-user-types--roles)
4. [Database Schema](#4-database-schema)
5. [RBAC & Permissions](#5-rbac--permissions)
6. [Billing Model](#6-billing-model)
7. [Onboarding Flows](#7-onboarding-flows)
8. [Assignment & Submission Workflow](#8-assignment--submission-workflow)
9. [Bring-Your-Own-Data (BYOD) Valuation Mode](#9-bring-your-own-data-byod-valuation-mode)
10. [API Endpoints](#10-api-endpoints)
11. [Frontend Routing & UI Structure](#11-frontend-routing--ui-structure)
12. [Notifications](#12-notifications)
13. [Payment Integration](#13-payment-integration)
14. [Migration Files](#14-migration-files)
15. [Phase Plan](#15-phase-plan)

---

## 1. Overview & Objectives

### What This Module Does

PropMetrik Education is a **course module for real-estate-related programmes** (valuation, and adjacent courses such as real estate finance, property/asset management, and real estate development) within the existing platform. It lets faculty teach the practical, data-driven side of these courses using real workflows and real field data. It is **not a separate product** — it is a role-switched experience within the same Next.js frontend and TypeScript/Python backend.

### Scope & Non-Goals

This is a **subject-specific teaching/assessment module, NOT a general-purpose Learning Management System (LMS).** It is designed to sit *alongside* whatever a lecturer already uses for the rest of the course (lecture delivery, the official gradebook, attendance), and to own the one thing a general LMS cannot do: students performing **real valuations / real-estate analyses with the professional engine on their own sourced data**, and faculty assessing those runs.

**In scope (the module's job):** cohorts/enrolment, the BYOD valuation workspace (all engine methods), assignments framed as real valuation/analysis tasks, immutable submissions + generated GHIS-standard reports, faculty review & grading of those submissions, per-student seat billing, and the Data Hub reference panel.

**Explicitly NOT in scope (use the institution's LMS for these):** general course-content hosting (lecture slides/videos/readings/syllabus), quizzes/exams, the **official weighted course gradebook** (we grade *our* assignments and can export them — the final course grade lives in the institution's system), discussion forums, calendar/attendance, and group/peer work beyond what's listed in the Phase Plan. Positioning it as a Moodle/Canvas replacement would be a mistake — the moat is the valuation engine, not course administration.

> Note: today's assignment + submission model is **valuation-centric** (the 6 methods + GHIS report). Serving non-valuation real-estate courses (e.g. a development-appraisal or property-management brief) well may need additional assignment/submission types later; the flagship and the only fully-specced path is valuation.

### Core Principles

1. **Bring Your Own Data** — Students source their own comparables, construction costs, and rental evidence from fieldwork and published sources. The platform's Data Hub is shown as read-only reference context only. No platform data is pre-populated into student workspaces.
2. **Student as Payer, Professor as Gatekeeper** — Each student pays their own per-seat semester fee. The professor does **not** pay and carries no financial liability; the professor controls **who** is allowed to pay by approving enrolments. A student cannot pay (and therefore cannot use the workspace) until the professor approves them for that semester.
3. **Pay-to-Unlock (hard gate)** — Approval alone does not grant access. After approval, the student must pay the seat fee; only a confirmed payment unlocks the BYOD workspace, assignments, and submission. No free tier, no preview run.
4. **Class Code Enrollment** — No university IT integration required. Professors share a join code; students self-register, then await approval. University systems are irrelevant.
5. **Same Codebase, Role-Switched UI** — The existing `user_type` pattern (currently `staff` / `customer`) is extended with `education`. Faculty and students log in at the same domain as all other users and receive dashboards appropriate to their role.
6. **Accounts Are Permanent** — Cohort membership and paid access expire at semester end; the PropMetrik account does not. A student who used the platform in Semester 1 carries their history forward into Semester 2 — but must be approved and pay again for the new cohort. Past submissions remain read-only accessible.

---

## 2. Architecture Decision Record

| Decision | Choice | Rationale |
|---|---|---|
| Separate frontend app vs. role-switched views | Role-switched views, same Next.js app | Existing platform already uses this pattern for `admin` / `valuer` / `partner` / `customer`. Minimal overhead, shared auth, single billing context. |
| Separate subdomain | Not used — same root domain | Users share one URL, one login context. No subdomain at any phase. Consistent with how admin/valuer/partner dashboards already work in the same app. |
| University SSO (SAML/OAuth) | Not in MVP | Ghana universities lack reliable identity providers. Class-code enrollment is faster to market and has zero IT dependency. SSO is a Phase 3 feature for institutions that request it after adoption. |
| PropMetrik owns the user relationship | Yes — PropMetrik accounts only | University cannot revoke access. Student account history persists beyond institutional relationship. Platform lock-in is maintained. |
| Data Hub access for students | Read-only reference, never auto-populated | Ensures pedagogical value (different student data → different results). Mirrors real professional practice. |
| Billing unit | Per seat per semester | Aligns with Ghana academic calendar. Semester = defined period. |
| **Who pays** (v1.1) | **The student, individually** | A ₵50 seat fee is individually affordable via MoMo and removes the months-long friction of getting a Ghanaian department's budget approved. The professor takes on no financial liability. Trade-off accepted: collection is fragmented across many small payers, and a class may be partially gated (some paid, some not) — mitigated by the per-student waiver and the faculty roster's paid/unpaid visibility. |
| **Access gating** (v1.1) | **Hard paywall after professor approval** | Two-step gate: (1) professor approves the enrolment for the semester; (2) student pays. Only a confirmed payment flips access to `active`. Approval without payment = no access. Enforced by `requireEduPaidEnrollment` middleware mirroring the existing `requireServiceAccess` pattern. |
| Payment method | MoMo primary, card secondary — **automated** | Collected through the platform's existing Paystack integration (`channel: 'mobile_money'`), the same automated rail tenants use to pay rent. Confirmation is webhook-driven; **no manual admin confirmation** (v1.0's manual step is removed). |
| Payment record | Unified `payment_transactions` ledger | A seat fee is 100% platform revenue (no third-party split), so it is recorded like a subscription charge: `payment_type='education'`, `recipient_type='platform'`, `service_fee=0`. The per-cohort faculty-invoice table (`edu_invoices`) is **not used** and is dropped. |

---

## 3. User Types & Roles

### New `user_type` Value

The existing `user_type` constraint (`'staff'`, `'customer'`) is extended:

```sql
ALTER TABLE users DROP CONSTRAINT chk_user_type;
ALTER TABLE users ADD CONSTRAINT chk_user_type 
  CHECK (user_type IN ('staff', 'customer', 'education'));
```

### New Roles

Two new roles are added to `user_role_enum`:

| Role | Level | Description |
|---|---|---|
| `edu_faculty` | 32 | Professor / lecturer. Creates cohorts and assignments, **approves/waives student enrolments**, reviews submissions. Pays nothing (students self-pay). Treated as a customer (no access to platform `/admin`). |
| `edu_student` | 80 | Student enrolled in at least one active cohort. Can run BYOD valuations and submit assignments. Read-only access to own submission history. |

Both roles have `user_type = 'education'`.

### Role Hierarchy Position

```
30  valuer / agent
32  edu_faculty        ← new
35  finance_manager
...
55  inspector
60  analyst
80  edu_student        ← new
90  viewer
```

### Access Scope by Role

| | `edu_faculty` | `edu_student` |
|---|---|---|
| Platform admin (`/admin`) | ✗ | ✗ |
| Main valuation dashboard | ✗ | ✗ |
| Education dashboard | ✓ (faculty view) | ✓ (student view) |
| Create cohort | ✓ | ✗ |
| Create assignment | ✓ (own cohorts only) | ✗ |
| View all submissions in cohort | ✓ | ✗ |
| View own submissions | ✓ | ✓ |
| Run BYOD valuation (all 6 methods) | ✓ (preview) | ✓ (draft → submit) — **only after seat fee paid** |
| Generate valuation report (PDF/DOCX) | ✓ | ✓ (included in submission) — paid access |
| View Data Hub benchmarks (read-only) | ✓ | ✓ (reference panel only) |
| Submit assignment | ✗ | ✓ (enrolled **and paid** cohorts only) |
| Review / grade submission | ✓ (own cohorts only) | ✗ |
| Approve / reject enrolments | ✓ (own cohorts only) | ✗ |
| Waive a student's seat fee (grant free access) | ✓ (own cohorts only) | ✗ |
| Pay own seat fee to unlock access | ✗ | ✓ |

---

## 4. Database Schema

### Migration: `249_education_module.sql`

> Renumbered from 230 (v1.0): migrations 230–248 are already used by other features; 249 is the next free number. `ALTER TYPE … ADD VALUE` (roles, `payment_type_enum`) requires the enum **owner/superuser** and cannot be added-and-used in the same transaction — run those statements first, autocommit, then the table DDL (same operational pattern as the region-partition migration). The faculty-invoice table (`edu_invoices`) from v1.0 is **removed**; student seat fees live in the unified `payment_transactions` ledger (see §6, §13).

```sql
-- ============================================================
-- MIGRATION 249: Education Module (student-paid, hard-gated)
-- PropMetrik Education — Faculty, Students, Cohorts,
-- Assignments, Submissions, Reviews. Per-student seat billing.
-- ============================================================

-- 1. Extend user_type constraint (re-add whatever the live constraint is named)
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_user_type;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_user_type_check;
ALTER TABLE users ADD CONSTRAINT chk_user_type
  CHECK (user_type IN ('staff', 'customer', 'education'));

-- 2. Add education roles to enum (SUPERUSER; commit before use)
ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'edu_faculty';
ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'edu_student';

-- 2b. Allow education seat fees in the unified payments ledger (SUPERUSER; commit before use)
ALTER TYPE payment_type_enum ADD VALUE IF NOT EXISTS 'education';

-- ============================================================
-- 3. INSTITUTIONS
-- ============================================================
CREATE TABLE edu_institutions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    short_name      VARCHAR(50),  -- e.g. KNUST, UG, GIMPA
    country         VARCHAR(10) NOT NULL DEFAULT 'GH',
    city            VARCHAR(100),
    staff_email_domains  TEXT[],  -- e.g. ARRAY['knust.edu.gh','st.knust.edu.gh']
    logo_url        TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_edu_institutions_active ON edu_institutions(is_active);

-- 4. Extend users table for education profile
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS edu_institution_id UUID REFERENCES edu_institutions(id),
    ADD COLUMN IF NOT EXISTS edu_department     VARCHAR(255),
    ADD COLUMN IF NOT EXISTS edu_staff_id       VARCHAR(100),   -- faculty staff/employee number (optional)
    ADD COLUMN IF NOT EXISTS edu_student_id     VARCHAR(100);   -- student index number (required for edu_student role, validated at enrollment)

CREATE INDEX idx_users_edu_institution ON users(edu_institution_id) WHERE edu_institution_id IS NOT NULL;

-- ============================================================
-- 5. COHORTS
-- A cohort = one course section for one semester
-- ============================================================
CREATE TABLE edu_cohorts (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    faculty_id       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    institution_id   UUID REFERENCES edu_institutions(id),

    -- Identity
    name             VARCHAR(255) NOT NULL,  -- e.g. "Valuation III – Sem 1 2026"
    course_code      VARCHAR(50),            -- e.g. "VAL 305"
    description      TEXT,

    -- Access control
    join_code        VARCHAR(20) NOT NULL UNIQUE,  -- e.g. "KNUST-VAL-4F9X"
    join_link_token  VARCHAR(64) NOT NULL UNIQUE,  -- token in shareable URL
    max_seats        INTEGER NOT NULL DEFAULT 60,
    enrolled_count   INTEGER NOT NULL DEFAULT 0,

    -- Period
    semester_label   VARCHAR(50),            -- e.g. "Semester 1, 2026/2027"
    starts_at        DATE NOT NULL,
    ends_at          DATE NOT NULL,

    -- Status — a cohort goes live as soon as the professor publishes it.
    -- There is NO faculty payment to wait for (students pay individually).
    -- draft → active (join code live) → completed (semester ended) → archived
    status           VARCHAR(20) NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','active','completed','archived')),

    -- Billing (student-paid): the per-seat fee EACH student pays to unlock access.
    -- There is no cohort-level invoice; payment is per enrolment (see edu_enrollments).
    price_per_seat_ghs DECIMAL(10,2) NOT NULL DEFAULT 50.00,
    allow_waivers    BOOLEAN NOT NULL DEFAULT TRUE,  -- may the professor grant free seats?
    paid_seats       INTEGER NOT NULL DEFAULT 0,     -- enrolments with access_status='active'

    metadata         JSONB DEFAULT '{}',
    created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_edu_cohorts_faculty    ON edu_cohorts(faculty_id);
CREATE INDEX idx_edu_cohorts_join_code  ON edu_cohorts(join_code);
CREATE INDEX idx_edu_cohorts_status     ON edu_cohorts(status);
CREATE INDEX idx_edu_cohorts_institution ON edu_cohorts(institution_id);

-- ============================================================
-- 6. COHORT ENROLLMENTS
-- ============================================================
CREATE TABLE edu_enrollments (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cohort_id    UUID NOT NULL REFERENCES edu_cohorts(id) ON DELETE CASCADE,
    student_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    enrolled_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Membership lifecycle (is the student still in the class at all)
    status       VARCHAR(20) NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','dropped','suspended')),
    dropped_at   TIMESTAMPTZ,

    -- ── ACCESS-GATE STATE MACHINE (the heart of the student-paid model) ──
    -- pending_approval → (professor approves) → awaiting_payment
    --                 → (student pays OR professor waives) → active
    --                 → (semester ends) → expired
    -- requireEduPaidEnrollment() grants workspace/submit access ONLY when access_status = 'active'.
    access_status   VARCHAR(20) NOT NULL DEFAULT 'pending_approval'
                      CHECK (access_status IN ('pending_approval','awaiting_payment','active','expired','rejected')),

    -- Approval (professor admits the student for this semester)
    approved_at     TIMESTAMPTZ,
    approved_by     UUID REFERENCES users(id),
    rejected_reason TEXT,

    -- Payment (links to the unified payment_transactions ledger by reference)
    seat_price_ghs    DECIMAL(10,2),   -- snapshot of cohort price at approval time
    payment_reference VARCHAR(100),    -- payment_transactions.reference (edu_<enrollmentId>_…)
    paid_at           TIMESTAMPTZ,

    -- Waiver (professor/admin grants free access — scholarship/hardship)
    waived_by       UUID REFERENCES users(id),
    waive_reason    TEXT,
    waived_at       TIMESTAMPTZ,

    expired_at      TIMESTAMPTZ,        -- set when cohort ends; access drops to read-only history

    UNIQUE (cohort_id, student_id)
);

CREATE INDEX idx_edu_enrollments_cohort  ON edu_enrollments(cohort_id);
CREATE INDEX idx_edu_enrollments_student ON edu_enrollments(student_id);
CREATE INDEX idx_edu_enrollments_access  ON edu_enrollments(access_status);
CREATE INDEX idx_edu_enrollments_payref  ON edu_enrollments(payment_reference) WHERE payment_reference IS NOT NULL;

-- Trigger: maintain both counters on edu_cohorts by recomputing for the affected cohort.
--   enrolled_count = students still in the class (status='active', i.e. not dropped)
--   paid_seats     = students with unlocked access (access_status='active')
-- Recompute (rather than +/- deltas) so the two-axis state machine can't drift the counts.
CREATE OR REPLACE FUNCTION edu_update_enrolled_count()
RETURNS TRIGGER AS $$
DECLARE
    target_cohort UUID := COALESCE(NEW.cohort_id, OLD.cohort_id);
BEGIN
    UPDATE edu_cohorts c SET
        enrolled_count = (SELECT COUNT(*) FROM edu_enrollments e
                           WHERE e.cohort_id = target_cohort AND e.status = 'active'),
        paid_seats     = (SELECT COUNT(*) FROM edu_enrollments e
                           WHERE e.cohort_id = target_cohort AND e.access_status = 'active')
    WHERE c.id = target_cohort;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_edu_enrolled_count
AFTER INSERT OR UPDATE OR DELETE ON edu_enrollments
FOR EACH ROW EXECUTE FUNCTION edu_update_enrolled_count();

-- ============================================================
-- 7. ASSIGNMENTS
-- Created by faculty for a cohort
-- ============================================================
CREATE TABLE edu_assignments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cohort_id       UUID NOT NULL REFERENCES edu_cohorts(id) ON DELETE CASCADE,
    faculty_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    brief_url       TEXT,  -- Optional: URL to uploaded assignment brief PDF

    -- Requirements
    required_method VARCHAR(50) CHECK (required_method IN (
        'sales_comparison','cost_approach','income_approach',
        'residual_method','profits_method','any'
    )) DEFAULT 'any',
    min_comparables INTEGER DEFAULT 3,  -- Minimum comparable entries required before submission
    required_fields TEXT[],            -- List of field names that must be filled

    -- Grading
    max_score       INTEGER DEFAULT 100,
    pass_score      INTEGER DEFAULT 50,
    grading_rubric  JSONB DEFAULT '{}', -- Optional structured rubric

    -- Timing
    opens_at        TIMESTAMPTZ,
    due_at          TIMESTAMPTZ NOT NULL,
    late_submissions_allowed BOOLEAN DEFAULT FALSE,
    late_penalty_pct DECIMAL(5,2) DEFAULT 0,

    status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','published','closed','archived')),
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_edu_assignments_cohort  ON edu_assignments(cohort_id);
CREATE INDEX idx_edu_assignments_status  ON edu_assignments(status);
CREATE INDEX idx_edu_assignments_due     ON edu_assignments(due_at);

-- ============================================================
-- 8. SUBMISSIONS
-- A student's locked valuation run submitted for an assignment
-- ============================================================
CREATE TABLE edu_submissions (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id    UUID NOT NULL REFERENCES edu_assignments(id) ON DELETE CASCADE,
    student_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- The valuation run this submission is based on
    -- Stored as a snapshot so edits after submission don't affect it
    valuation_snapshot JSONB NOT NULL,  -- Full payload: inputs + engine output
    comparables_count  INTEGER NOT NULL DEFAULT 0,
    method_used        VARCHAR(50),
    estimated_value    DECIMAL(15,2),
    confidence_score   DECIMAL(4,3),
    report_url         TEXT,  -- URL to generated PDF/DOCX valuation report
    report_format      VARCHAR(10) CHECK (report_format IN ('pdf','docx')),

    -- Student commentary
    commentary         TEXT,
    data_sources       TEXT,  -- Student's notes on where they sourced data

    -- Submission meta
    submitted_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_late            BOOLEAN DEFAULT FALSE,

    -- Review
    review_status      VARCHAR(20) NOT NULL DEFAULT 'pending'
                         CHECK (review_status IN ('pending','in_review','reviewed','resubmit_requested')),
    reviewed_at        TIMESTAMPTZ,
    reviewer_id        UUID REFERENCES users(id),

    -- Grade
    score              INTEGER,
    grade_label        VARCHAR(20),   -- e.g. "Pass", "Distinction", "Fail"
    feedback           TEXT,
    internal_notes     TEXT,          -- Faculty only, not shown to student

    UNIQUE (assignment_id, student_id)  -- One submission per student per assignment
);

CREATE INDEX idx_edu_submissions_assignment ON edu_submissions(assignment_id);
CREATE INDEX idx_edu_submissions_student    ON edu_submissions(student_id);
CREATE INDEX idx_edu_submissions_status     ON edu_submissions(review_status);

-- ============================================================
-- 9. SUBMISSION REVISION HISTORY
-- Tracks re-submissions when faculty requests revisions
-- ============================================================
CREATE TABLE edu_submission_revisions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id   UUID NOT NULL REFERENCES edu_submissions(id) ON DELETE CASCADE,
    revision_number INTEGER NOT NULL,
    valuation_snapshot JSONB NOT NULL,
    commentary      TEXT,
    submitted_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_edu_revisions_submission ON edu_submission_revisions(submission_id);

-- ============================================================
-- 10. SEAT PAYMENTS — NO DEDICATED TABLE
-- ============================================================
-- Student seat fees are NOT invoiced per cohort. Each student's payment is a row in the
-- existing unified `payment_transactions` ledger (migration 133), written by the same
-- Paystack flow that handles rent/subscriptions:
--     payment_type      = 'education'
--     payer_id          = student user id
--     payer_email       = student email
--     recipient_type    = 'platform'        -- 100% platform revenue, no third-party split
--     service_fee       = 0
--     principal_amount  = total = cohort.price_per_seat_ghs (pesewas)
--     domain_record_type= 'edu_enrollment'
--     domain_record_id  = edu_enrollments.id
--     reference         = 'edu_<enrollmentId>_<uuid>'
-- On charge.success, edu_enrollments.access_status flips to 'active' and paid_at/payment_reference
-- are set (see §13). The v1.0 `edu_invoices` table and edu_cohorts.invoice_id FK are removed.

-- ============================================================
-- 11. AUDIT LOG entries for education events
-- Uses existing audit_log table pattern
-- ============================================================
-- No new table needed; use existing audit_log with resource_type = 'education'
-- Actions: cohort_created, cohort_activated, student_enrolled, enrollment_approved,
--          enrollment_rejected, seat_paid, seat_waived, access_expired,
--          assignment_published, submission_submitted, submission_reviewed
```

---

## 5. RBAC & Permissions

### New Authorization Policies

Added to `authorization_policies` table in the seed migration:

```sql
-- Education policies
INSERT INTO authorization_policies (policy_name, resource_type, action, allowed_roles, description)
VALUES
  ('edu_institution_read',   'edu_institution',  'read',   ARRAY['super_admin','admin']::user_role_enum[], 'View institutions'),
  ('edu_institution_manage', 'edu_institution',  'manage', ARRAY['super_admin']::user_role_enum[], 'Create/edit institutions'),
  ('edu_cohort_create',      'edu_cohort',       'create', ARRAY['super_admin','edu_faculty']::user_role_enum[], 'Create a cohort'),
  ('edu_cohort_read_own',    'edu_cohort',       'read',   ARRAY['super_admin','admin','edu_faculty','edu_student']::user_role_enum[], 'Read own cohorts/enrolled cohorts'),
  ('edu_cohort_manage_own',  'edu_cohort',       'manage', ARRAY['super_admin','edu_faculty']::user_role_enum[], 'Edit/archive own cohorts'),
  ('edu_assignment_create',  'edu_assignment',   'create', ARRAY['super_admin','edu_faculty']::user_role_enum[], 'Create assignment'),
  ('edu_assignment_read',    'edu_assignment',   'read',   ARRAY['super_admin','edu_faculty','edu_student']::user_role_enum[], 'Read published assignments'),
  ('edu_submission_create',  'edu_submission',   'create', ARRAY['edu_student']::user_role_enum[], 'Submit assignment'),
  ('edu_submission_read_own','edu_submission',   'read',   ARRAY['edu_faculty','edu_student']::user_role_enum[], 'Read submissions (faculty=all in cohort, student=own only)'),
  ('edu_submission_review',  'edu_submission',   'review', ARRAY['edu_faculty','super_admin']::user_role_enum[], 'Grade/review a submission'),
  ('edu_enrollment_approve', 'edu_enrollment',   'approve',ARRAY['super_admin','edu_faculty']::user_role_enum[], 'Approve/reject/waive a student enrolment in own cohort'),
  ('edu_enrollment_pay',     'edu_enrollment',   'pay',    ARRAY['edu_student']::user_role_enum[], 'Pay own seat fee to unlock access'),
  ('edu_payment_read',       'edu_payment',      'read',   ARRAY['super_admin','admin','edu_faculty']::user_role_enum[], 'View seat-payment status (faculty=own cohort roster, admin=all)');
```

### Access Gate Middleware (the pay-to-unlock enforcement)

```typescript
// backend/src/middleware/eduGuard.ts — mirrors requireServiceAccess, but keyed on enrolment.
// Apply to BYOD valuation + submission routes. Approval alone is NOT enough — access_status
// must be 'active' (paid or waived).
export function requireEduPaidEnrollment(cohortIdParam = 'cohortId') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (user?.role === 'super_admin') return next();           // platform staff bypass
    const cohortId = req.params[cohortIdParam] ?? req.body.cohortId;
    const row = await pool.query(
      `SELECT access_status FROM edu_enrollments
        WHERE cohort_id = $1 AND student_id = $2 AND status = 'active'`,
      [cohortId, user.id]
    );
    const access = row.rows[0]?.access_status;
    if (access === 'active') return next();
    return res.status(403).json({
      error: 'Seat fee not paid',
      code: access === 'awaiting_payment' ? 'PAYMENT_REQUIRED'
          : access === 'pending_approval' ? 'AWAITING_APPROVAL'
          : 'NOT_ENROLLED',
    });
  };
}
```

### Middleware Pattern

```typescript
// backend/src/middleware/eduGuard.ts
export function requireEduRole(...roles: ('edu_faculty' | 'edu_student')[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    if (user.userType !== 'education') return res.status(403).json({ error: 'Education account required' });
    if (roles.length && !roles.includes(user.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
    }
    next();
  };
}

// Usage:
router.post('/cohorts',           authenticate, requireEduRole('edu_faculty'), createCohort);
router.post('/submissions',       authenticate, requireEduRole('edu_student'), createSubmission);
router.patch('/submissions/:id/review', authenticate, requireEduRole('edu_faculty'), reviewSubmission);
```

### Cohort Ownership Checks

Faculty can only manage their own cohorts. Implemented as a service-layer check, not middleware:

```typescript
// In eduCohortService.ts
async assertFacultyOwnsCohort(cohortId: string, facultyId: string): Promise<void> {
  const cohort = await pool.query(
    'SELECT faculty_id FROM edu_cohorts WHERE id = $1', [cohortId]
  );
  if (!cohort.rows[0] || cohort.rows[0].faculty_id !== facultyId) {
    throw new ForbiddenError('You do not own this cohort');
  }
}
```

### Student Enrollment Checks

Students can only submit to assignments in cohorts they are actively enrolled in:

```typescript
async assertStudentEnrolled(cohortId: string, studentId: string): Promise<void> {
  const enroll = await pool.query(
    `SELECT id FROM edu_enrollments 
     WHERE cohort_id = $1 AND student_id = $2 AND status = 'active'`,
    [cohortId, studentId]
  );
  if (!enroll.rows[0]) throw new ForbiddenError('Not enrolled in this cohort');
}
```

---

## 6. Billing Model — Student-Paid, Per Seat, Per Semester

Each **student** pays their own seat fee to unlock the cohort for the semester. The professor never pays and there is no cohort-level invoice. Collection is automated end-to-end through the platform's existing Paystack/MoMo rails (the same loop tenants use to pay rent); confirmation is webhook-driven, with **no manual admin step**.

### Pricing Structure

| Unit | Price | Who pays | Set by |
|---|---|---|---|
| Per seat, per semester | ₵50 GHS (default `edu_cohorts.price_per_seat_ghs`) | The student | Professor may set a different per-seat price per cohort; PropMetrik admin can cap/override |
| Waived seat (scholarship/hardship) | ₵0 | Nobody — professor grants free access | `edu_enrollments.waived_by` |
| Annual institutional licence | Flat negotiated | Institution | Phase 3 — after ≥5 cohorts at one institution (would re-introduce a sponsored billing mode) |

### Billing Flow (per student)

```
1. Professor creates cohort and publishes it → cohort.status = 'active'.
   (No payment required to go live — the join code is immediately usable.)
2. Student joins via the cohort join code
   → edu_enrollments row, access_status = 'pending_approval'. NO workspace access yet.
3. Professor reviews the roster and APPROVES the student (or rejects/waives)
   → access_status = 'awaiting_payment'
   → seat_price_ghs snapshotted from the cohort
   → Student notified: "You're approved — pay ₵50 to unlock your workspace."
   (Waive instead → access_status = 'active', free; skip steps 4–6.)
4. Student initiates payment: POST /education/enrollments/:id/pay
   → paymentProcessor → paystackService.initializeTransaction({ channel: 'mobile_money'|'card' })
   → returns authorization_url; reference = 'edu_<enrollmentId>_<uuid>'
   → a 'pending' row is written to payment_transactions (payment_type='education',
      recipient_type='platform', service_fee=0, principal = seat_price_ghs)
5. Student pays on Paystack (MoMo prompt / card)
6. Paystack 'charge.success' webhook (existing POST /api/v1/webhooks/paystack)
   → verify, mark payment_transactions 'success'
   → edu_enrollments: access_status='active', paid_at=now, payment_reference set
   → Student notified: "Payment confirmed — your workspace is unlocked."
   → Professor notified (digest): "[Student] has paid and is active."
7. At semester end (cohort.ends_at):
   → cohort.status='completed'; a job sets active enrolments → access_status='expired'
   → students keep READ-ONLY access to their own submissions; join code deactivated
```

The **hard gate**: `requireEduPaidEnrollment` (see §5) allows the BYOD workspace and submission **only** when `access_status='active'`. `pending_approval` → 403 `AWAITING_APPROVAL`; `awaiting_payment` → 403 `PAYMENT_REQUIRED` (the UI shows the pay screen).

### Seat Capacity

`max_seats` caps how many students may hold a non-dropped enrolment (`enrolled_count`). The professor sees, on the roster, the split of **pending / awaiting payment / active** so they can chase unpaid students or prune no-shows. `paid_seats` (active enrolments) is the revenue-bearing count. Raising `max_seats` requires no payment from the professor (students self-pay), so seat overage is just a settings change.

### Waivers (per student)

Because some Ghanaian students genuinely cannot afford even ₵50, the professor (if `cohort.allow_waivers`) or a PropMetrik admin may waive an individual seat: `access_status='active'`, `waived_by`/`waive_reason` set, no payment. This is the per-student equivalent of v1.0's cohort-level waiver and is essential to avoid locking out hardship cases.

### Refund / Dispute Policy

- Seat fees are **non-refundable once `access_status='active'`** (the student has had workspace access). Stated clearly on the pay screen.
- Pre-payment, a student who is rejected or drops owes nothing (no charge was made).
- Paystack chargebacks/disputes are handled through the existing payments dispute path; a successful dispute reverses `access_status` to `awaiting_payment`.

---

## 7. Onboarding Flows

### Faculty Onboarding (Phase 1: Admin-Approved)

```
1. Faculty visits /signup/faculty
2. Fills form: name, email, institution (select from edu_institutions), 
   department, staff/employee ID (optional), phone
3. Submits → status = 'pending_approval'
4. PropMetrik admin receives email notification
5. Admin reviews in /admin/education/faculty-requests
6. Admin approves → user created with:
     user_type = 'education'
     role = 'edu_faculty'
     edu_institution_id = selected institution
7. Faculty receives welcome email with login link
8. Faculty completes profile, creates first cohort
```

**Phase 2 upgrade:** If faculty email domain matches `edu_institutions.staff_email_domains`, auto-approve without admin review.

### Student Enrollment Flow (join → approve → pay → unlock)

```
1. Professor shares join code (e.g. "KNUST-VAL-4F9X") or join link
   (/join/KNUST-VAL-4F9X or /join?token=<join_link_token>)

2. Student visits the join URL
   → If not logged in: prompted to sign up or log in
   → If logged in as wrong user_type: shown error "This link is for student enrollment"
   → If cohort is full (enrolled_count ≥ max_seats): "This cohort is full — contact your lecturer"
   → (Cohort is active on creation — there is no "not yet paid by faculty" state.)

3. Student signs up:
   - Name, email (or phone for SMS OTP), password
   - Institution auto-populated from cohort
   - **Student ID number (required)** — the university index number (e.g. `20245678`). Stored as `edu_student_id`. Faculty can see this alongside submissions.
   - user_type = 'education', role = 'edu_student'

4. On account creation / join:
   → edu_enrollments row created: access_status = 'pending_approval'
   → Student lands on the cohort with a banner: "Awaiting your lecturer's approval."
   → NO workspace/assignment access yet (requireEduPaidEnrollment blocks it).
   → Faculty notified: "New student awaiting approval: [name] ([student ID])"

5. Professor approves the student (roster → Approve)
   → access_status = 'awaiting_payment'; seat_price_ghs snapshotted
   → Student notified: "Approved — pay ₵50 to unlock your workspace for the semester."
   (Or professor waives → access_status='active', free; student skips to step 7.)

6. Student pays the seat fee (MoMo / card via Paystack — see §6 and §13)
   → on webhook confirmation: access_status='active'

7. Access unlocked
   → Student sees assignments, opens the BYOD workspace, can submit.
   → Faculty roster shows the student as Active (paid / waived).
```

### Returning Student (New Semester)

```
1. Student already has PropMetrik account from previous semester
2. Professor shares new cohort's join code
3. Student logs in → visits join link → joins (access_status='pending_approval')
4. Professor approves → student pays the new cohort's seat fee → access unlocked
   (Approval + payment are per cohort, every semester — access does not carry over.)
5. Previous submission history remains accessible (read-only) regardless of new-cohort payment
6. New cohort workspace is fresh
```

---

## 8. Assignment & Submission Workflow

### Assignment Lifecycle

```
draft → published → [due_at passes] → closed → archived
```

**Faculty creates assignment:**
- Title, description, optional PDF brief upload
- Required valuation method (or "any")
- Minimum comparable entries required (default: 3)
- Due date, optional open date
- Max score and pass score
- Optional late submission policy

**Faculty publishes assignment:**
- Enrolled students receive notification
- Assignment appears on student dashboard with deadline countdown

### Student Submission Flow

```
1. Student opens assignment from their dashboard
2. Student opens BYOD valuation workspace (see section 9)
3. Student enters:
   - Subject property details
   - Their own comparable sales / rental evidence / cost data
   - Adjustments and rationale
4. Student runs the valuation engine on their inputs
5. Platform auto-generates the GHIS-standard report [Preview Report — opens PDF in modal]
6. Student reviews the generated report, writes commentary and data source notes
7. Student clicks "Submit" → confirmation modal
8. On submit:
   → valuation_snapshot stored (inputs + engine output + report_url, immutable)
   → submission.submitted_at set
   → submission.is_late = (submitted_at > assignment.due_at)
   → review_status = 'pending'
   → Faculty notified: "[Student name] submitted Assignment 2"
```

**Submission is immutable after submission.** The student cannot edit after clicking Submit unless the faculty explicitly requests a revision.

### Faculty Review Flow

```
1. Faculty opens "Pending Reviews" from dashboard
2. Clicks a submission → split-view review screen:
   
   LEFT PANEL                      RIGHT PANEL
   ─────────────────────           ─────────────────────
   Student's inputs:               Engine output:
   - Subject property details      - Estimated value
   - Comparables entered           - Method breakdown
   - Adjustments made              - Confidence score
   - Data sources noted            - Sensitivity analysis
   - Commentary                    - Full report
                                   [Download Report PDF ↓]
                                   [Download Report DOCX ↓]
   
   BOTTOM:
   ─────────────────────────────────────────────────────
   Feedback text area (shown to student)
   Internal notes (faculty only)
   Score: [  ] / 100
   Grade: Pass / Fail / Distinction / Resubmit
   [Save Draft]  [Submit Review]

3. On "Submit Review":
   → submission.review_status = 'reviewed' (or 'resubmit_requested')
   → submission.reviewed_at = now
   → submission.reviewer_id = faculty.id
   → Student notified: "Your Assignment 2 has been reviewed"
   → If resubmit_requested → student can submit a new revision
```

### Revision Handling

When faculty requests revision:
- `review_status = 'resubmit_requested'`
- Student can submit again — new valuation snapshot
- Original submission saved to `edu_submission_revisions` before overwrite
- Faculty sees revision history tab in the review panel

---

## 9. Bring-Your-Own-Data (BYOD) Valuation Mode

### Concept

Students use the **same valuation engine** as professional valuers — every method, every module. The only difference is the data input layer: students supply their own field data instead of the platform auto-fetching from Data Hub.

1. **No auto-fetch from Data Hub** — The "fetch comparables" buttons and API calls to Data Hub are disabled for `edu_student` and `edu_faculty` users
2. **Reference panel** — A collapsed sidebar shows Data Hub benchmarks as read-only context ("Industry benchmark: ₵1,800–2,200/sqm for this region"). Labelled clearly as reference only.
3. **Manual entry required** — All comparable sales, construction costs, and rental evidence must be entered manually by the student

### Valuation Modules Available to Students

Students have access to every module the engine exposes — restricted only by whether the assignment requires a specific method:

| Module | Type | Student Access | Notes |
|---|---|---|---|
| **Sales Comparison Method** | Python engine | ✓ Full | Student enters own comparable sales with adjustments |
| **Income Approach** | Python engine | ✓ Full | Student enters own rental evidence, cap rate, YP |
| **Cost Approach** | Python engine | ✓ Full | Student enters construction costs from field research |
| **Residual Method** | Python engine | ✓ Full | Student enters GDV, build costs, developer margin |
| **Profits Method** | Python engine | ✓ Full | Student enters turnover, operating ratios, cap rate |
| **DRC Method** | Python engine | ✓ Full | Student enters replacement cost, depreciation inputs |
| **Reconciliation** | Python engine | ✓ Full | Multi-method reconciliation with weighted average |
| **Sensitivity Analysis** | Python engine | ✓ Full | ±cap rate / yield / rent scenarios auto-generated |
| **Confidence Scoring** | Python engine | ✓ Full | Score reflects quality of student-supplied data |
| **HBU Analysis** | TypeScript service | ✓ Full | Highest & Best Use analysis on subject property |
| **Floor Plan Service** | TypeScript service | ✓ Full | Floor plan data and geometry validation |
| **Valuation Report (PDF/DOCX)** | TypeScript + GHIS template | ✓ Full | Full GHIS-standard report generated from submission snapshot — see below |
| **Cap Rate Service** | TypeScript service | ✓ Full | Cap rate lookup used in income / profits methods |
| **Override Tracking** | TypeScript service | ✓ Full | Tracks any manual overrides student applies |

### Valuation Report Generation for Students

When a student runs the valuation engine and is ready to submit, the platform generates a full **GHIS-standard valuation report** (PDF and/or DOCX) from their inputs and engine output. This report becomes part of the submission snapshot.

**Report sections generated (from existing `ghis-standard.json` template):**
- Cover page (assignment title, student name, student ID, institution, date)
- Table of contents
- Letter of transmittal
- Summary of key data
- Property risk assessment
- General introduction
- Legal attributes
- Data influencing values
- Property description
- Valuation process (method applied, comparables table, adjustments)
- Certification (student signs off — not a professional certification)
- Limiting conditions
- Appendices (comparable data sheets, photos if uploaded)

**Certification section in student reports** is modified to read: *"This report is submitted as an academic assignment. It does not constitute a professional valuation opinion and has not been certified by a registered valuer."* The faculty's name appears as the supervising assessor rather than a commissioned client.

Faculty can view the generated report PDF directly from the review workspace alongside the raw engine inputs.

**Report generation API in BYOD context:**
```typescript
// Reuses existing valuationReportService / pdfGenerationService
// Called at submission time — stored in submission snapshot as report_url
POST /api/v1/education/submissions/:id/report
// Returns: { report_url: string, format: 'pdf' | 'docx' }
```

### Input Difference: Professional vs. BYOD

| Field | Professional Mode | BYOD Mode |
|---|---|---|
| Comparable sales | Auto-fetched from Data Hub + manual add | Manual entry only |
| Construction costs | Fetched from market data API | Student enters from field research |
| Rental benchmarks | Fetched from Data Hub | Student enters from surveys |
| Regional multipliers | Live API | Reference-only display |
| Land values | Comparable land sales API | Manual entry |

### BYOD Technical Implementation

The Python valuation engine already raises `ValueError` when no live data is available (as updated in the cost_approach.py cleanup). In BYOD mode, this is the expected path — the engine receives all data from the student's manual inputs, passed as explicit overrides in the request payload.

```typescript
// In frontend: byodValuationService.ts
interface BYODValuationRequest {
  property: PropertyInput;
  mode: 'byod';  // signals no Data Hub fetch
  manual_comparables: ManualComparable[];
  manual_construction_costs?: {
    cost_per_sqm_standard: number;
    cost_per_sqm_premium: number;
    source_description: string;  // e.g. "Obtained from Kantanka Homes contractor, April 2026"
  };
  manual_rental_evidence?: ManualRentalEvidence[];
  valuation_options: ValuationOptions;
}
```

The backend BYOD endpoint strips any Data Hub fetch calls and passes `manual_comparables` directly to the Python engine's comparable array.

### Reference Panel (Data Hub Context)

A collapsed right-side panel visible to students during BYOD entry:

```
┌─ Data Hub Reference (read-only) ─────────────────────┐
│ ℹ  This data is shown for reference only.             │
│    Your submission must use your own sourced data.    │
│                                                        │
│  Construction cost benchmark (Greater Accra):         │
│  Standard: ₵1,800–2,100 /sqm                         │
│  Premium:  ₵3,200–3,800 /sqm                         │
│  Source: PropMetrik Data Hub, Q1 2026                 │
│                                                        │
│  Rental benchmark (3BR, East Legon):                  │
│  ₵5,500–7,000/month                                   │
│                                                        │
│  [Expand for more benchmarks...]                      │
└────────────────────────────────────────────────────────┘
```

---

## 10. API Endpoints

All endpoints are prefixed `/api/v1/education/`.

### Institutions

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/institutions` | `super_admin`, `admin` | List all institutions |
| POST | `/institutions` | `super_admin` | Create institution |
| PATCH | `/institutions/:id` | `super_admin` | Update institution |

### Faculty Management

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/faculty/signup` | Public | Faculty account request (status=pending) |
| GET | `/faculty/requests` | `super_admin`, `admin` | List pending faculty requests |
| PATCH | `/faculty/requests/:id/approve` | `super_admin`, `admin` | Approve faculty account |
| PATCH | `/faculty/requests/:id/reject` | `super_admin`, `admin` | Reject with reason |
| GET | `/faculty/profile` | `edu_faculty` | Own profile |
| PATCH | `/faculty/profile` | `edu_faculty` | Update own profile |

### Cohorts

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/cohorts` | `edu_faculty` | Create cohort (generates join code, draft status) |
| GET | `/cohorts` | `edu_faculty` | List own cohorts |
| GET | `/cohorts/:id` | `edu_faculty` | Cohort detail |
| PATCH | `/cohorts/:id` | `edu_faculty` | Update cohort |
| POST | `/cohorts/:id/activate` | `edu_faculty` | Publish cohort → status `active`, join code live (no invoice, no payment) |
| POST | `/cohorts/:id/archive` | `edu_faculty` | Archive completed cohort |
| GET | `/cohorts/:id/students` | `edu_faculty` | Roster with per-student `access_status` (pending / awaiting payment / active / waived) |
| POST | `/cohorts/:id/students/:studentId/approve` | `edu_faculty` | Approve enrolment → `awaiting_payment` |
| POST | `/cohorts/:id/students/:studentId/reject` | `edu_faculty` | Reject enrolment (with reason) |
| POST | `/cohorts/:id/students/:studentId/waive` | `edu_faculty` | Waive seat fee → `active` (free), if `allow_waivers` |
| DELETE | `/cohorts/:id/students/:studentId` | `edu_faculty` | Remove/drop student from cohort |
| GET | `/cohorts/:id/submissions` | `edu_faculty` | All submissions across all assignments |

### Enrollment (Student-facing)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/join/:code` | Public | Preview cohort info from join code (name, faculty, institution, period, seat price) |
| POST | `/enroll` | `edu_student` | Join cohort by join code/token → enrolment `pending_approval` |
| GET | `/my-cohorts` | `edu_student` | Own cohorts, each with own `access_status` |
| DELETE | `/my-cohorts/:cohortId` | `edu_student` | Drop from cohort |
| POST | `/enrollments/:id/pay` | `edu_student` | Initiate seat-fee payment (returns Paystack `authorization_url`); allowed only when `awaiting_payment` |
| GET | `/enrollments/:id/payment-status` | `edu_student` | Poll access/payment state after returning from Paystack |

### Assignments

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/cohorts/:cohortId/assignments` | `edu_faculty` | Create assignment |
| GET | `/cohorts/:cohortId/assignments` | `edu_faculty`, `edu_student` | List assignments in cohort |
| GET | `/assignments/:id` | `edu_faculty`, `edu_student` | Assignment detail |
| PATCH | `/assignments/:id` | `edu_faculty` | Update (draft only) |
| POST | `/assignments/:id/publish` | `edu_faculty` | Publish to enrolled students |
| POST | `/assignments/:id/close` | `edu_faculty` | Close (no more submissions) |
| DELETE | `/assignments/:id` | `edu_faculty` | Delete (draft only) |

### Submissions

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/assignments/:id/submit` | `edu_student` | Submit valuation snapshot |
| GET | `/assignments/:id/my-submission` | `edu_student` | Own submission for this assignment |
| GET | `/assignments/:id/submissions` | `edu_faculty` | All submissions for assignment |
| GET | `/submissions/:id` | `edu_faculty`, `edu_student` (own only) | Submission detail |
| GET | `/submissions/:id/revisions` | `edu_faculty`, `edu_student` (own only) | Revision history |
| PATCH | `/submissions/:id/review` | `edu_faculty` | Submit review + grade |
| POST | `/submissions/:id/request-revision` | `edu_faculty` | Request resubmission |
| POST | `/submissions/:id/report` | `edu_student`, `edu_faculty` | Generate PDF/DOCX valuation report for submission |
| GET | `/submissions/:id/report` | `edu_faculty`, `edu_student` (own only) | Download generated report |

### BYOD Valuation

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/valuation/byod` | `edu_student`, `edu_faculty` | Run BYOD valuation (no Data Hub fetch) |
| GET | `/valuation/reference/:region` | `edu_student`, `edu_faculty` | Read-only Data Hub benchmarks for reference panel |

### Billing (Student Seat Payments)

No per-cohort invoices. Each student pays their own seat fee; the existing Paystack webhook confirms it.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/enrollments/:id/pay` | `edu_student` | Initiate seat-fee payment (see Enrollment section) |
| GET | `/enrollments/:id/payment-status` | `edu_student` | Own payment/access state |
| POST | `/api/v1/webhooks/paystack` | Paystack (signed) | **Existing** handler, extended: `charge.success` with `reference` `edu_…` / `metadata.payment_type='education'` → set enrolment `access_status='active'` |
| GET | `/cohorts/:id/payments` | `edu_faculty` | Seat-payment status for own cohort roster (read-only) |
| GET | `/admin/payments` | `super_admin`, `admin` | All education seat payments (filter by institution/cohort/date) — reads `payment_transactions` |
| POST | `/cohorts/:id/students/:studentId/waive` | `edu_faculty` | Grant free access (also listed under Cohorts) |

---

## 11. Frontend Routing & UI Structure

### Route Layout

```
/education/
  dashboard/                     ← role-switches to faculty or student view

  -- FACULTY --
  cohorts/                       ← list all cohorts
  cohorts/new                    ← create cohort
  cohorts/[id]/                  ← cohort overview (enrollment, billing status)
  cohorts/[id]/assignments/      ← list assignments
  cohorts/[id]/assignments/new   ← create assignment
  cohorts/[id]/assignments/[aid] ← assignment detail + submission list
  cohorts/[id]/students          ← roster: approve / reject / waive + per-student access_status
  cohorts/[id]/payments          ← seat-payment status (who's paid / awaiting / waived)
  submissions/[sid]/review       ← review workspace (split-view)
  profile/                       ← faculty profile

  -- STUDENT --
  my-cohorts/                    ← enrolled cohorts
  my-cohorts/[id]/               ← cohort workspace
  my-cohorts/[id]/assignments/[aid]  ← BYOD valuation workspace + submit
  my-submissions/                ← history of all submissions
  my-submissions/[sid]           ← submission detail (read-only after submit)

  -- SHARED --
  join/[code]                    ← public enrollment page (or with ?token=)
```

### Faculty Dashboard

```
┌─ PropMetrik Education ─────────────────────────────────────┐
│  Welcome, Dr. Mensah                                        │
│  [+ New Cohort]                                            │
├─────────────────────────────────────────────────────────────┤
│  MY COHORTS                                                 │
│  ┌──────────────────────────────────────────┐              │
│  │ Valuation III – Sem 1 2026/27            │              │
│  │ KNUST · VAL 305 · 34 joined              │              │
│  │ Status: Active │ 28 paid · 4 awaiting    │              │
│  │ 2 pending approval                       │              │
│  │ [Assignments] [Roster] [Payments]         │              │
│  └──────────────────────────────────────────┘              │
├─────────────────────────────────────────────────────────────┤
│  PENDING APPROVALS (2)   ← approve so they can pay          │
│  Yaw Owusu (20231145)   joined 1h ago   [Approve] [Reject] │
│  Esi Mensah (20230987)  joined 3h ago   [Approve] [Reject] │
├─────────────────────────────────────────────────────────────┤
│  PENDING REVIEWS (7)                                        │
│  Kwame Asante    Assignment 2  Submitted 2h ago  [Review]  │
│  Ama Boateng     Assignment 1  Submitted 1d ago  [Review]  │
│  Fiifi Mensah    Assignment 2  Submitted 3d ago  [Review]  │
│  [View all 7...]                                           │
├─────────────────────────────────────────────────────────────┤
│  UPCOMING DEADLINES                                         │
│  Assignment 2: Income Approach  due 30 Apr 2026            │
│  28/34 submitted · 6 pending                               │
└─────────────────────────────────────────────────────────────┘
```

### Student Dashboard

The student's view depends on their `access_status`. Before paying, the whole cohort is gated behind a single pay (or "awaiting approval") banner; assignments are listed but locked.

**Awaiting approval / awaiting payment (gated):**
```
┌─ PropMetrik Education ─────────────────────────────────────┐
│  Welcome, Kwame                                             │
│  Valuation III – Dr. Mensah (KNUST · VAL 305)              │
├─────────────────────────────────────────────────────────────┤
│  ⏳ Awaiting your lecturer's approval.                      │   ← pending_approval
│     You'll be able to pay once approved.                   │
│  ── OR (once approved) ──────────────────────────────────  │
│  🔒 You're approved! Pay ₵50 to unlock this semester.      │   ← awaiting_payment
│     [ Pay ₵50 with Mobile Money / Card ]                   │
│     Assignment 2: Income Approach · Due 30 Apr (locked)    │
└─────────────────────────────────────────────────────────────┘
```

**After payment (unlocked):**
```
┌─ PropMetrik Education ─────────────────────────────────────┐
│  Welcome, Kwame                                             │
├─────────────────────────────────────────────────────────────┤
│  MY ASSIGNMENTS                                             │
│  ┌──────────────────────────────────────────┐              │
│  │ Assignment 2: Income Approach             │              │
│  │ Valuation III – Dr. Mensah                │              │
│  │ Due: 30 Apr 2026  (8 days remaining)     │              │
│  │ Status: Not started                      │              │
│  │ [Start Assignment]                        │              │
│  └──────────────────────────────────────────┘              │
│  ┌──────────────────────────────────────────┐              │
│  │ Assignment 1: Sales Comparison           │              │
│  │ Due: 15 Apr 2026  · Submitted            │              │
│  │ Review: Pass · Score: 72/100             │              │
│  │ [View Feedback]                           │              │
│  └──────────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

### BYOD Valuation Workspace (Student)

Full-page workspace, similar to the professional valuation form but with BYOD restrictions active:

```
┌─ Assignment 2: Income Approach ────────────────────────────┐
│  Due: 30 Apr 2026 · KNUST VAL 305                         │
│  [Assignment Brief ↗]                                      │
├─ Subject Property ──────────────────────────────────────────┤
│  [Property details form — manual entry]                    │
├─ Your Evidence ─────────────────────────────────────────────┤
│  + Add rental comparable    + Add lease comparable         │
│  Minimum required: 3 comparables                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Comparable 1: 3BR apartment, East Legon               │  │
│  │ Monthly rent: ₵6,500 · Source: meQasa listing, Apr26 │  │
│  │ [Edit] [Delete]                                       │  │
│  └──────────────────────────────────────────────────────┘  │
├─ Data Sources & Notes ──────────────────────────────────────┤
│  [Text area: explain where you sourced your data]          │
├─ [Run Valuation Engine]  ────────────────────────────────────┤
│  Results appear here after running...                      │
├─ Commentary ────────────────────────────────────────────────┤
│  [Text area: your valuation commentary and conclusions]    │
├────────────────────────────────────────────────────────────┤
│  [Save Draft]              [Submit Assignment]             │
└─────────────────────────────────────────────────────────────┘

                              ┌─ Reference Panel (collapsed by default) ─┐
                              │ ℹ Data Hub benchmarks (read-only)        │
                              │ East Legon 3BR rental:                   │
                              │ ₵5,500–7,000/month (Q1 2026)            │
                              │ Source: PropMetrik Data Hub              │
                              └──────────────────────────────────────────┘
```

### Faculty Review Workspace

```
┌─ Review: Kwame Asante (ID: 20218834) · Assignment 2 ───────────────────────────┐
│                                                                                  │
│  STUDENT INPUTS                        ENGINE OUTPUT                            │
│  ─────────────────────────────         ─────────────────────────────            │
│  Subject: 4BR house, East Legon        Estimated Value: ₵ 1,240,000            │
│  Built area: 320 sqm                   Method: Income Approach                  │
│  Year built: 2018                      Confidence: 0.72                         │
│                                        YP: 9.5  Cap rate: 10.5%                 │
│  RENTAL EVIDENCE (4 comparables)       Gross Revenue: ₵ 168,000/yr             │
│  ─────────────────────────────         Net Operating Income: ₵ 130,560         │
│  1. East Legon 4BR: ₵8,500/mo         ─────────────────────────────            │
│     Source: meQasa, Apr 2026          Sensitivity Analysis:                     │
│  2. Dzorwulu 4BR: ₵7,800/mo           Low (-10%): ₵1,116,000                   │
│     Source: Site visit, Apr 2026      High (+10%): ₵1,364,000                  │
│  3. Labone 4BR: ₵9,200/mo            ─────────────────────────────            │
│     Source: Estate agent survey       Full Report [Expand]                      │
│  4. Airport Hills 4BR: ₵8,100/mo                                               │
│     Source: Tonaton, Apr 2026                                                   │
│                                                                                  │
│  STUDENT COMMENTARY                                                              │
│  ─────────────────────────────                                                   │
│  "I selected East Legon as the primary market area given the subject            │
│  property's location. Comparable 3 (Labone) was included as it shares           │
│  similar accessibility characteristics despite being ₵700 above the             │
│  mean. I applied a -5% downward adjustment for its slightly superior            │
│  frontage..."                                                                    │
│                                                                                  │
│  DATA SOURCES: meQasa, Tonaton, 2 direct agent surveys (names on file)          │
│                                                                                  │
├──────────────────────────────────────────────────────────────────────────────────┤
│  FEEDBACK (shown to student)                                                     │
│  [Text area]                                                                     │
│                                                                                  │
│  INTERNAL NOTES (not shown to student)                                           │
│  [Text area]                                                                     │
│                                                                                  │
│  Score: [72] / 100     Grade: [Pass ▼]     [Save Draft]  [Submit Review]        │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Notifications

All notifications use the existing notification system. New event types:

| Event | Recipient | Channel | Message |
|---|---|---|---|
| Faculty account approved | Faculty | Email + in-app | "Your PropMetrik Education account has been approved. Log in to create your first cohort." |
| Student awaiting approval | Faculty | In-app (digest) | "[Student name] ([student ID]) joined [Cohort name] and is awaiting your approval." |
| Enrolment approved | Student | Email + in-app | "You've been approved for [Cohort name]. Pay your ₵50 seat fee to unlock your workspace. [Pay now]" |
| Seat fee paid / access unlocked | Student | Email + in-app | "Payment confirmed — your [Cohort name] workspace is now unlocked." |
| Seat fee waived | Student | Email + in-app | "Your lecturer has granted you free access to [Cohort name]. Your workspace is unlocked." |
| Student paid / active | Faculty | In-app (digest) | "[Student name] has paid and is now active in [Cohort name]." |
| Cohort 80% full | Faculty | Email + in-app | "Your cohort [name] is 80% full (48/60 seats). Request additional seats if needed." |
| Assignment published | Enrolled students | Email + in-app | "New assignment: [title]. Due [date]. [Open assignment]" |
| Assignment deadline 3 days | Students without submission | In-app + SMS | "Reminder: [Assignment] is due in 3 days." |
| Submission received | Faculty | In-app (digest) | "[Student name] submitted [Assignment name]" |
| Review submitted | Student | Email + in-app | "Your submission for [Assignment] has been reviewed. Score: X/100. [View feedback]" |
| Revision requested | Student | Email + in-app | "Your lecturer has requested a revision for [Assignment]. [View feedback]" |
| Cohort expiring in 7 days | Faculty | Email | "Cohort [name] ends in 7 days. Consider creating next semester's cohort." |
| Approved but unpaid (reminder) | Student | In-app + SMS | "You're approved for [Cohort name] but haven't paid. Pay ₵50 to unlock your workspace before the next deadline. [Pay now]" |

---

## 13. Payment Integration

Automated from day one — no manual-confirmation phase. Seat fees ride the platform's **existing** Paystack integration (the same rail tenants use to pay rent and customers use to pay subscriptions). The seat fee is 100% platform revenue, so it is collected like a **subscription** charge (recipient = platform, no subaccount split, `service_fee=0`), not like rent.

### Initiate (student clicks "Pay ₵50")

```typescript
// POST /api/v1/education/enrollments/:id/pay   (requireEduRole('edu_student'))
// Reuses the existing paymentProcessor → paystackService path.
const ref = `edu_${enrollmentId}_${uuid()}`;
const init = await paystackService.initializeTransaction({
  email: student.email,
  amountSubunits: toPesewas(enrollment.seat_price_ghs),   // whole fee = principal
  reference: ref,
  channels: [channel],                                    // 'mobile_money' | 'card'
  metadata: { payment_type: 'education', enrollment_id: enrollmentId, cohort_id, student_id },
});
// write a 'pending' row to payment_transactions (payment_type='education',
// recipient_type='platform', service_fee=0, principal = total = seat fee)
return { authorization_url: init.authorization_url, reference: ref };
```

Guard: only callable when `access_status='awaiting_payment'` (i.e. professor already approved). If an enrolment is already `active`, return its state — never double-charge.

### Confirm (automatic, webhook-driven)

Extend the **existing** `POST /api/v1/webhooks/paystack` `charge.success` branch — no new endpoint:

```typescript
case 'charge.success': {
  const ref = data.reference;
  if (ref.startsWith('edu_') || data.metadata?.payment_type === 'education') {
    // idempotent: verifyAndRecordPayment already no-ops if this reference is recorded 'success'
    await paymentProcessor.verifyAndRecordPayment(ref);   // marks payment_transactions 'success'
    await eduEnrollmentService.markPaid(ref, {            // by payment_reference
      paidAt: new Date(data.paid_at),
      channel: data.channel,                              // 'mobile_money' | 'card'
    });
    // → edu_enrollments: access_status='active', paid_at set
    // → notify student "unlocked", notify faculty (digest) "student active"
  }
  break;
}
```

A student returning from Paystack polls `GET /enrollments/:id/payment-status` until `access_status='active'` (covers the race where the redirect lands before the webhook). Verification is idempotent on `reference`, so the poll and the webhook can't double-apply.

### Admin / Faculty Capabilities (no invoices to manage)

| Action | Who |
|---|---|
| View own cohort's seat-payment roster (paid / awaiting / pending) | `edu_faculty` |
| Waive an individual student's seat fee | `edu_faculty` (own cohort), `super_admin` |
| Set the per-seat price for a cohort | `edu_faculty` (subject to admin cap), `super_admin` |
| View / export all education seat payments | `super_admin`, `admin` (reads `payment_transactions`) |
| Refund a seat payment (Paystack) | `super_admin` (reverses `access_status` → `awaiting_payment`) |

---

## 14. Migration Files

### File list (in order):

> Renumbered from 230–232. Migrations 230–248 are already in use; education starts at **249**. The `ALTER TYPE … ADD VALUE` statements (roles, `payment_type_enum`) need the enum **owner/superuser** and must commit before the values are used — run them first (autocommit), then the table DDL, same as the region-partition migration. No `edu_invoices` table (student-paid uses `payment_transactions`).

| File | Description |
|---|---|
| `249_education_module.sql` | All education tables (institutions, cohorts, enrolments **with the access-gate state machine**, assignments, submissions, revisions). Extends `user_type` constraint. Adds `edu_faculty`/`edu_student` roles and `'education'` to `payment_type_enum`. **No invoices table.** |
| `250_education_rbac_policies.sql` | Inserts `authorization_policies` rows for all education resources, incl. enrolment approve/pay and seat-payment read |
| `251_education_seat_fee.sql` | Inserts the `'education'` row into `fee_configurations` (zero platform split — whole fee is revenue) and the `education_cohort` reference plan into `subscription_plans` |

### `250_education_rbac_policies.sql`

```sql
-- Migration 250: Education RBAC Policies
INSERT INTO authorization_policies 
  (policy_name, resource_type, action, allowed_roles, description)
VALUES
  ('edu_institution_read',      'edu_institution',  'read',   
   ARRAY['super_admin','admin']::user_role_enum[], 'View institutions'),
  ('edu_institution_manage',    'edu_institution',  'manage', 
   ARRAY['super_admin']::user_role_enum[], 'Create/edit institutions'),
  ('edu_cohort_create',         'edu_cohort',       'create', 
   ARRAY['super_admin','edu_faculty']::user_role_enum[], 'Create a cohort'),
  ('edu_cohort_read',           'edu_cohort',       'read',   
   ARRAY['super_admin','admin','edu_faculty','edu_student']::user_role_enum[], 'Read cohorts'),
  ('edu_cohort_manage',         'edu_cohort',       'manage', 
   ARRAY['super_admin','edu_faculty']::user_role_enum[], 'Edit/archive cohorts'),
  ('edu_assignment_create',     'edu_assignment',   'create', 
   ARRAY['super_admin','edu_faculty']::user_role_enum[], 'Create assignment'),
  ('edu_assignment_read',       'edu_assignment',   'read',   
   ARRAY['super_admin','edu_faculty','edu_student']::user_role_enum[], 'Read assignments'),
  ('edu_assignment_manage',     'edu_assignment',   'manage', 
   ARRAY['super_admin','edu_faculty']::user_role_enum[], 'Edit/publish/close assignments'),
  ('edu_submission_create',     'edu_submission',   'create', 
   ARRAY['edu_student']::user_role_enum[], 'Submit assignment'),
  ('edu_submission_read',       'edu_submission',   'read',   
   ARRAY['super_admin','edu_faculty','edu_student']::user_role_enum[], 'Read submissions'),
  ('edu_submission_review',     'edu_submission',   'review', 
   ARRAY['super_admin','edu_faculty']::user_role_enum[], 'Grade/review a submission'),
  ('edu_enrollment_approve',    'edu_enrollment',   'approve',
   ARRAY['super_admin','edu_faculty']::user_role_enum[], 'Approve/reject/waive a student enrolment in own cohort'),
  ('edu_enrollment_pay',        'edu_enrollment',   'pay',
   ARRAY['edu_student']::user_role_enum[], 'Pay own seat fee to unlock access'),
  ('edu_payment_read',          'edu_payment',      'read',
   ARRAY['super_admin','admin','edu_faculty']::user_role_enum[], 'View seat-payment status'),
  ('edu_faculty_approve',       'edu_faculty',      'approve',
   ARRAY['super_admin','admin']::user_role_enum[], 'Approve faculty signup requests')
ON CONFLICT (policy_name) DO NOTHING;
```

### `251_education_seat_fee.sql`

```sql
-- Migration 251: Education seat fee config + reference plan

-- 1. Fee rule so feeEngine.calculate('education', amount) returns a ZERO platform split.
--    A seat fee has no third-party recipient (PropMetrik IS the recipient), so the whole
--    amount is principal/revenue and service_fee = 0 — same shape as a subscription charge.
--    (Pattern mirrors 151_invoice_platform_fee.sql which seeded the 'valuation' fee row.)
--    Requires payment_type_enum to already contain 'education' (added in migration 249).
INSERT INTO fee_configurations (payment_type, fee_mode, percentage_rate, flat_amount, currency)
VALUES ('education', 'flat', 0.0000, 0.00, 'GHS')
ON CONFLICT DO NOTHING;

-- 2. Reference plan (internal pricing display only; students are billed per enrolment,
--    NOT via a recurring subscription row).
ALTER TABLE subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_category_check;
ALTER TABLE subscription_plans ADD CONSTRAINT subscription_plans_category_check
  CHECK (category IN (
    'full_platform', 'property_management', 'crm',
    'data_intelligence', 'project_management', 'education'
  ));

INSERT INTO subscription_plans (
  slug, name, description, category, tier, segment,
  price_monthly_ghs, currency,
  max_users, target_audience, features, cta_text,
  is_featured, is_public, trial_days, metadata
) VALUES (
  'education_seat',
  'Education Seat (per semester)',
  'Per-student, per-semester access for university courses. The student pays this seat fee after their professor approves them; it unlocks the BYOD valuation workspace, assignment workflow, and submission for that cohort.',
  'education', 'starter', 'b2c',
  50.00, 'GHS',
  1,
  'University students enrolled in a valuation course',
  '["BYOD valuation workspace","All 6 valuation methods","Assignment submission","Generated GHIS-standard report","Data Hub reference panel","MoMo and card payment"]'::jsonb,
  'Pay seat fee',
  FALSE, FALSE,  -- not a public marketplace plan; charged per enrolment
  0,
  '{"billing_unit":"per_seat_per_semester","payer":"student","gating":"hard_paywall_after_approval"}'::jsonb
) ON CONFLICT (slug) DO NOTHING;
```

---

## 15. Phase Plan

### Phase 1 — MVP (Target: First 3 Universities)

**Goal:** Get one paying faculty cohort live end-to-end.

| Feature | Status |
|---|---|
| DB schema (migration 230, 231, 232) | Build |
| `edu_faculty` + `edu_student` roles in enum and RBAC | Build |
| Faculty signup request + admin approval | Build |
| Cohort creation with join code generation | Build |
| Student enrollment via join code (→ `pending_approval`) | Build |
| Faculty roster: approve / reject / waive a student enrolment | Build |
| Per-student seat payment via Paystack (MoMo + card), webhook-confirmed (reuse existing rails) | Build |
| `requireEduPaidEnrollment` hard gate on workspace + submission | Build |
| Assignment creation and publish | Build |
| BYOD valuation workspace (manual comparable entry, engine runs on student data) | Build |
| Reference panel (read-only Data Hub benchmarks) | Build |
| Student submission (snapshot + commentary) | Build |
| Faculty review workspace (split-view) | Build |
| Education dashboard (faculty + student, role-switched) | Build |
| Email + in-app notifications for key events (approved, paid, reviewed) | Build |
| Admin panel: faculty requests, seat-payment view | Build |

### Phase 2 — Growth (After First Paying Semester)

| Feature | Notes |
|---|---|
| Bulk-approve roster + "approved but unpaid" reminder/dunning cadence | Reduce the partial-class gap |
| Per-student waiver/hardship workflow with audit | Faculty grants free seats; admin oversight |
| CSV bulk student upload | Faculty uploads a CSV; system creates invite tokens (still pending approval) |
| In-app notification digest for faculty (submission counts) | Reduce email noise |
| Assignment late submission enforcement with penalty scoring | |
| Revision history UI for faculty | Show diffs between submission versions |
| Cohort renewal flow (copy assignments to new semester) | |
| Gradebook export (CSV) per cohort | |
| Seat overage request flow | |
| SMS notifications via mNotify (Ghana) | For students without reliable email |

### Phase 3 — Scale (After ≥5 Institutions)

| Feature | Notes |
|---|---|
| University email domain auto-approval for faculty | Match against `edu_institutions.staff_email_domains` |
| Annual institutional licence billing | Flat fee covering all cohorts at one institution |
| SAML/OAuth SSO for institutions with Microsoft Entra or LDAP | Optional for IT departments that request it |
| Structured grading rubrics | Professor defines criteria with weights |
| Comparative analytics for faculty | Class distribution, common errors, score histograms |
| Student self-assessment before submission | |
| Peer review mode (optional, faculty-enabled) | Student reviews another student's submission |
| PropMetrik-issued CPD certificates on completion | Continuing Professional Development for GhIS/RICS |
| API integration for institutions with functional SIS | Optional webhook: SIS enrols student → PropMetrik provisions account |

---

*End of Education Module Specification — v1.0*
