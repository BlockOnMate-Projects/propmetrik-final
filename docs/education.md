# PropMetrik Education Module — Enterprise Implementation Specification

**Version:** 1.0  
**Date:** April 2026  
**Scope:** Full end-to-end specification for `user_type = education` — faculty and student roles, cohort management, assignment workflow, bring-your-own-data valuation, billing, RBAC, database schema, API endpoints, and UI routing.

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

PropMetrik Education is a vertical within the existing platform that enables universities and professional training institutions to teach property valuation using real workflows and real field data. It is **not a separate product** — it is a role-switched experience within the same Next.js frontend and TypeScript/Python backend.

### Core Principles

1. **Bring Your Own Data** — Students source their own comparables, construction costs, and rental evidence from fieldwork and published sources. The platform's Data Hub is shown as read-only reference context only. No platform data is pre-populated into student workspaces.
2. **Faculty as Customer** — The billing relationship is with the faculty member or department, not the student and not the university IT department.
3. **Class Code Enrollment** — No university IT integration required. Professors share a join code; students self-register. University systems are irrelevant.
4. **Same Codebase, Role-Switched UI** — The existing `user_type` pattern (currently `staff` / `customer`) is extended with `education`. Faculty and students log in at the same domain as all other users and receive dashboards appropriate to their role.
5. **Accounts Are Permanent** — Cohort membership expires at semester end; the PropMetrik account does not. A student who used the platform in Semester 1 carries their history forward into Semester 2 with a new cohort code.

---

## 2. Architecture Decision Record

| Decision | Choice | Rationale |
|---|---|---|
| Separate frontend app vs. role-switched views | Role-switched views, same Next.js app | Existing platform already uses this pattern for `admin` / `valuer` / `partner` / `customer`. Minimal overhead, shared auth, single billing context. |
| Separate subdomain | Not used — same root domain | Users share one URL, one login context. No subdomain at any phase. Consistent with how admin/valuer/partner dashboards already work in the same app. |
| University SSO (SAML/OAuth) | Not in MVP | Ghana universities lack reliable identity providers. Class-code enrollment is faster to market and has zero IT dependency. SSO is a Phase 3 feature for institutions that request it after adoption. |
| PropMetrik owns the user relationship | Yes — PropMetrik accounts only | University cannot revoke access. Student account history persists beyond institutional relationship. Platform lock-in is maintained. |
| Data Hub access for students | Read-only reference, never auto-populated | Ensures pedagogical value (different student data → different results). Mirrors real professional practice. |
| Billing unit | Per seat per semester | Aligns with Ghana academic calendar. Semester = defined period. Easier budget approval at HOD level than annual. |
| Payment method | MoMo primary, bank transfer secondary | Institutional budget disbursement in Ghana is predominantly MoMo or GhIPSS. Card is secondary. |

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
| `edu_faculty` | 32 | Professor / lecturer. Creates cohorts and assignments, reviews submissions, manages cohort billing. Treated as a customer (no access to platform `/admin`). |
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
| Run BYOD valuation (all 6 methods) | ✓ (preview) | ✓ (draft → submit) |
| Generate valuation report (PDF/DOCX) | ✓ | ✓ (included in submission) |
| View Data Hub benchmarks (read-only) | ✓ | ✓ (reference panel only) |
| Submit assignment | ✗ | ✓ (enrolled cohorts only) |
| Review / grade submission | ✓ (own cohorts only) | ✗ |
| Manage cohort billing | ✓ (own cohorts only) | ✗ |

---

## 4. Database Schema

### Migration: `230_education_module.sql`

```sql
-- ============================================================
-- MIGRATION 230: Education Module
-- PropMetrik Education — Faculty, Students, Cohorts,
-- Assignments, Submissions, Reviews, Billing
-- ============================================================

-- 1. Extend user_type constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_user_type;
ALTER TABLE users ADD CONSTRAINT chk_user_type
  CHECK (user_type IN ('staff', 'customer', 'education'));

-- 2. Add education roles to enum
ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'edu_faculty';
ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'edu_student';

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

    -- Status
    status           VARCHAR(20) NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','active','completed','archived')),

    -- Billing
    billing_status   VARCHAR(20) NOT NULL DEFAULT 'pending'
                       CHECK (billing_status IN ('pending','invoiced','paid','overdue','waived')),
    price_per_seat_ghs DECIMAL(10,2) NOT NULL DEFAULT 50.00,
    invoice_id       UUID,   -- FK to invoices table, set when invoice is generated

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
    status       VARCHAR(20) NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','dropped','suspended')),
    dropped_at   TIMESTAMPTZ,
    UNIQUE (cohort_id, student_id)
);

CREATE INDEX idx_edu_enrollments_cohort  ON edu_enrollments(cohort_id);
CREATE INDEX idx_edu_enrollments_student ON edu_enrollments(student_id);

-- Trigger: maintain enrolled_count on edu_cohorts
CREATE OR REPLACE FUNCTION edu_update_enrolled_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
        UPDATE edu_cohorts SET enrolled_count = enrolled_count + 1 WHERE id = NEW.cohort_id;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status = 'active' AND NEW.status != 'active' THEN
            UPDATE edu_cohorts SET enrolled_count = enrolled_count - 1 WHERE id = NEW.cohort_id;
        ELSIF OLD.status != 'active' AND NEW.status = 'active' THEN
            UPDATE edu_cohorts SET enrolled_count = enrolled_count + 1 WHERE id = NEW.cohort_id;
        END IF;
    ELSIF TG_OP = 'DELETE' AND OLD.status = 'active' THEN
        UPDATE edu_cohorts SET enrolled_count = enrolled_count - 1 WHERE id = OLD.cohort_id;
    END IF;
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
-- 10. COHORT INVOICES
-- Education billing — per cohort, per semester
-- ============================================================
CREATE TABLE edu_invoices (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cohort_id       UUID NOT NULL REFERENCES edu_cohorts(id) ON DELETE RESTRICT,
    faculty_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    institution_id  UUID REFERENCES edu_institutions(id),

    invoice_number  VARCHAR(50) NOT NULL UNIQUE,  -- e.g. EDU-2026-001
    seats_invoiced  INTEGER NOT NULL,
    price_per_seat  DECIMAL(10,2) NOT NULL,
    subtotal_ghs    DECIMAL(10,2) NOT NULL,
    tax_ghs         DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_ghs       DECIMAL(10,2) NOT NULL,

    status          VARCHAR(20) NOT NULL DEFAULT 'unpaid'
                      CHECK (status IN ('unpaid','paid','overdue','cancelled','waived')),
    payment_method  VARCHAR(50),  -- mtn_momo, bank_transfer, card, waived
    payment_reference VARCHAR(100),
    paid_at         TIMESTAMPTZ,
    due_at          TIMESTAMPTZ NOT NULL,

    -- Admin override
    waived_by       UUID REFERENCES users(id),
    waive_reason    TEXT,

    notes           TEXT,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_edu_invoices_cohort   ON edu_invoices(cohort_id);
CREATE INDEX idx_edu_invoices_faculty  ON edu_invoices(faculty_id);
CREATE INDEX idx_edu_invoices_status   ON edu_invoices(status);

-- Update edu_cohorts.invoice_id FK
ALTER TABLE edu_cohorts ADD CONSTRAINT fk_cohort_invoice
  FOREIGN KEY (invoice_id) REFERENCES edu_invoices(id);

-- ============================================================
-- 11. AUDIT LOG entries for education events
-- Uses existing audit_log table pattern
-- ============================================================
-- No new table needed; use existing audit_log with resource_type = 'education'
-- Actions: cohort_created, cohort_activated, student_enrolled, assignment_published,
--          submission_submitted, submission_reviewed, invoice_generated, invoice_paid
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
  ('edu_invoice_read',       'edu_invoice',      'read',   ARRAY['super_admin','admin','edu_faculty']::user_role_enum[], 'View education invoices'),
  ('edu_invoice_manage',     'edu_invoice',      'manage', ARRAY['super_admin','admin']::user_role_enum[], 'Create/waive education invoices');
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

## 6. Billing Model

### Pricing Structure

| Unit | Price | Trigger |
|---|---|---|
| Per seat, per semester | ₵50 GHS | Cohort activation (invoice generated on `max_seats` declaration) |
| Department deal (3+ cohorts/year) | ₵40 GHS/seat | Manual override by PropMetrik admin |
| Annual institutional licence | Flat negotiated | Phase 3 — after ≥5 cohorts at one institution |

### Billing Flow

```
1. Faculty creates cohort → declares max_seats (e.g. 60)
2. System generates edu_invoice:
     invoice_number: EDU-{YEAR}-{SEQ}
     seats_invoiced: 60
     price_per_seat: 50.00
     total_ghs: 3000.00
     due_at: cohort.starts_at - 7 days
3. Faculty receives invoice via email + in-app notification
4. Faculty pays via MoMo or bank transfer
5. PropMetrik admin confirms payment → invoice.status = 'paid'
     → cohort.billing_status = 'paid'
     → cohort.status = 'active'   (join code becomes live)
6. Students can now enrol using the join code
7. At semester end (cohort.ends_at):
     → cohort.status = 'completed'
     → students retain read-only access to their submissions
     → join code deactivated (new enrollments blocked)
```

### Seat Overage

If enrolled_count approaches max_seats, the faculty receives a notification at 80% and 100% capacity. To add seats:
1. Faculty requests seat increase from their cohort settings
2. System generates a supplementary invoice: `additional_seats × ₵50`
3. Payment confirmed → max_seats updated

### Payment Methods (Phase 1)

Both are confirmed manually by PropMetrik admin in the admin panel:

| Method | Mechanism |
|---|---|
| MTN Mobile Money | Faculty pays to PropMetrik MoMo merchant number. Reference = invoice number. Admin confirms in `/admin/education/invoices`. |
| Bank Transfer / GhIPSS | Faculty pays to PropMetrik bank account. Reference = invoice number. Admin confirms. |

**Phase 2:** Paystack webhook → auto-confirmation on successful card/MoMo payment.

### Refund Policy

- No refund after cohort is activated and join code has been used by ≥1 student
- Full refund if cohort is cancelled before any enrollment
- Pro-rata refund for unused seats if cohort is cancelled after partial enrollment (PropMetrik admin discretion)

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

### Student Enrollment Flow

```
1. Professor shares join code (e.g. "KNUST-VAL-4F9X") or join link
   (/join/KNUST-VAL-4F9X or /join?token=<join_link_token>)

2. Student visits the join URL
   → If not logged in: prompted to sign up or log in
   → If logged in as wrong user_type: shown error "This link is for student enrollment"
   → If cohort is full: shown "This cohort is full — contact your lecturer"
   → If cohort billing not paid: shown "This cohort is not yet active"

3. Student signs up:
   - Name, email (or phone for SMS OTP), password
   - Institution auto-populated from cohort
   - **Student ID number (required)** — the university index number (e.g. `20245678`). Stored as `edu_student_id`. Faculty can see this alongside submissions.
   - user_type = 'education', role = 'edu_student'

4. On account creation:
   → edu_enrollments record created (cohort_id, student_id)
   → Student lands on education dashboard, cohort visible
   → Faculty notified: "New student enrolled: [name]"
```

### Returning Student (New Semester)

```
1. Student already has PropMetrik account from previous semester
2. Professor shares new cohort's join code
3. Student logs in → visits join link → single click to enroll
4. Previous submission history remains accessible (read-only)
5. New cohort workspace is fresh
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
| PATCH | `/cohorts/:id` | `edu_faculty` | Update cohort (pre-activation only) |
| POST | `/cohorts/:id/activate` | `edu_faculty` | Request activation (triggers invoice) |
| POST | `/cohorts/:id/archive` | `edu_faculty` | Archive completed cohort |
| GET | `/cohorts/:id/students` | `edu_faculty` | List enrolled students |
| DELETE | `/cohorts/:id/students/:studentId` | `edu_faculty` | Remove student from cohort |
| GET | `/cohorts/:id/submissions` | `edu_faculty` | All submissions across all assignments |

### Enrollment (Student-facing)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/join/:code` | Public | Preview cohort info from join code (name, faculty, institution, period) |
| POST | `/enroll` | `edu_student` | Enrol in cohort by join code or token |
| GET | `/my-cohorts` | `edu_student` | List own enrolled cohorts |
| DELETE | `/my-cohorts/:cohortId` | `edu_student` | Drop from cohort |

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

### Billing (Education Invoices)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/invoices` | `edu_faculty` | Own invoices |
| GET | `/invoices/:id` | `edu_faculty` | Invoice detail |
| GET | `/admin/invoices` | `super_admin`, `admin` | All education invoices |
| PATCH | `/admin/invoices/:id/confirm-payment` | `super_admin`, `admin` | Confirm manual payment |
| PATCH | `/admin/invoices/:id/waive` | `super_admin` | Waive invoice |
| POST | `/admin/invoices/generate` | `super_admin`, `admin` | Manually generate invoice for cohort |

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
  cohorts/[id]/students          ← enrolled student list
  cohorts/[id]/billing           ← invoice status and payment instructions
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
│  │ KNUST · VAL 305 · 34/60 students         │              │
│  │ Status: Active  |  Billing: Paid         │              │
│  │ [Assignments] [Students] [Billing]        │              │
│  └──────────────────────────────────────────┘              │
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
| Cohort invoice generated | Faculty | Email + in-app | "Invoice EDU-2026-001 for ₵3,000 has been generated for [Cohort Name]. Payment due by [date]." |
| Invoice payment confirmed | Faculty | Email + in-app | "Payment confirmed. Your cohort [name] is now active. Share join code: XXXX-YYYY-ZZZZ" |
| Student enrolled | Faculty | In-app (digest) | "[Student name] has joined [Cohort name]" |
| Cohort 80% full | Faculty | Email + in-app | "Your cohort [name] is 80% full (48/60 seats). Request additional seats if needed." |
| Assignment published | Enrolled students | Email + in-app | "New assignment: [title]. Due [date]. [Open assignment]" |
| Assignment deadline 3 days | Students without submission | In-app + SMS | "Reminder: [Assignment] is due in 3 days." |
| Submission received | Faculty | In-app (digest) | "[Student name] submitted [Assignment name]" |
| Review submitted | Student | Email + in-app | "Your submission for [Assignment] has been reviewed. Score: X/100. [View feedback]" |
| Revision requested | Student | Email + in-app | "Your lecturer has requested a revision for [Assignment]. [View feedback]" |
| Cohort expiring in 7 days | Faculty | Email | "Cohort [name] ends in 7 days. Consider creating next semester's cohort." |
| Invoice overdue | Faculty | Email + in-app | "Invoice EDU-2026-001 is overdue. Cohort access will be suspended in 48 hours if payment is not received." |

---

## 13. Payment Integration

### Phase 1: Manual Confirmation

```
Faculty pays → PropMetrik admin receives → confirms in admin panel
→ PATCH /api/v1/education/admin/invoices/:id/confirm-payment
   body: { payment_method: 'mtn_momo', payment_reference: 'MoMo TX ref', paid_at: ISO8601 }
→ invoice.status = 'paid'
→ cohort.billing_status = 'paid', cohort.status = 'active'
→ Faculty notified
```

Admin panel page: `/admin/education/invoices` — shows all pending, paid, and overdue invoices. Admin can filter by institution, faculty, date range.

### Phase 2: Paystack Auto-Confirmation

Paystack webhook → `POST /webhooks/paystack` (existing webhook handler extended):

```typescript
case 'charge.success':
  if (metadata?.invoice_type === 'education') {
    await eduBillingService.confirmPayment({
      invoiceId: metadata.invoice_id,
      paymentReference: data.reference,
      paymentMethod: 'paystack_' + data.channel,
      paidAt: new Date(data.paid_at),
    });
  }
  break;
```

The Paystack payment link is generated at invoice creation and included in the faculty's invoice email.

### Billing Admin Capabilities

| Action | Who |
|---|---|
| View all invoices | `super_admin`, `admin` |
| Confirm payment | `super_admin`, `admin` |
| Waive invoice (e.g. pilot cohort, scholarship) | `super_admin` only |
| Set custom per-seat price per faculty | `super_admin` |
| Generate invoice manually | `super_admin`, `admin` |
| Download invoice PDF | Faculty, admin |
| Export billing report | `super_admin`, `admin` |

---

## 14. Migration Files

### File list (in order):

| File | Description |
|---|---|
| `230_education_module.sql` | All education tables (institutions, cohorts, enrollments, assignments, submissions, revisions, invoices). Extends user_type constraint. Adds edu roles to enum. |
| `231_education_rbac_policies.sql` | Inserts authorization_policies rows for all education resources |
| `232_education_subscription_plan.sql` | Inserts `education_cohort` plan into subscription_plans for billing reference |

### `231_education_rbac_policies.sql`

```sql
-- Migration 231: Education RBAC Policies
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
  ('edu_invoice_read',          'edu_invoice',      'read',   
   ARRAY['super_admin','admin','edu_faculty']::user_role_enum[], 'View education invoices'),
  ('edu_invoice_manage',        'edu_invoice',      'manage', 
   ARRAY['super_admin','admin']::user_role_enum[], 'Create/confirm/waive invoices'),
  ('edu_faculty_approve',       'edu_faculty',      'approve',
   ARRAY['super_admin','admin']::user_role_enum[], 'Approve faculty signup requests')
ON CONFLICT (policy_name) DO NOTHING;
```

### `232_education_subscription_plan.sql`

```sql
-- Migration 232: Education Cohort Plan
-- Adds 'education' to subscription_plans.category enum first
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
  'education_cohort',
  'Education Cohort',
  'Per-student per-semester access for university courses. Faculty-managed cohorts with BYOD valuation workspace, assignment workflows, and faculty review tools.',
  'education', 'starter', 'b2c',
  50.00, 'GHS',
  1,
  'University lecturers and professional training institutions',
  '["BYOD valuation workspace","Assignment creation and management","Faculty review and grading tools","Submission history","Data Hub reference panel","MoMo and bank transfer payment"]'::jsonb,
  'Create Cohort',
  FALSE, FALSE,  -- not shown in public marketplace; sold direct
  0,
  '{"billing_unit":"per_seat_per_semester","min_seats":10,"volume_discount_threshold":3}'::jsonb
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
| Student enrollment via join code | Build |
| Assignment creation and publish | Build |
| BYOD valuation workspace (manual comparable entry, engine runs on student data) | Build |
| Reference panel (read-only Data Hub benchmarks) | Build |
| Student submission (snapshot + commentary) | Build |
| Faculty review workspace (split-view) | Build |
| Education dashboard (faculty + student, role-switched) | Build |
| Education invoice generation (manual) | Build |
| Admin invoice confirmation (MoMo / bank) | Build |
| Email notifications for key events | Build |
| Admin panel: faculty requests, invoice management | Build |

### Phase 2 — Growth (After First Paying Semester)

| Feature | Notes |
|---|---|
| Paystack auto-payment for invoices | Webhook extension to existing handler |
| CSV bulk student upload | Faculty uploads a CSV; system creates invite tokens |
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
