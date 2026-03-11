-- ============================================================================
-- 213 — BID MANAGEMENT SYSTEM
-- Adds bid_requests, bid_invitations, bid_submissions, bid_qa_threads, bid_awards
-- ============================================================================

-- bid_requests: the core bid solicitation created by project managers
CREATE TABLE IF NOT EXISTS bid_requests (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL,
    project_id              UUID NOT NULL,
    created_by              UUID NOT NULL,
    title                   VARCHAR(500) NOT NULL,
    description             TEXT,
    trade_category          VARCHAR(50) NOT NULL DEFAULT 'OTHER',
    estimated_budget        NUMERIC(15,2),
    currency                VARCHAR(10) NOT NULL DEFAULT 'GHS',
    disclose_budget         BOOLEAN NOT NULL DEFAULT false,
    submission_deadline     TIMESTAMPTZ NOT NULL,
    site_visit_date         TIMESTAMPTZ,
    qa_deadline             TIMESTAMPTZ,
    vendor_eligibility_notes TEXT,
    status                  VARCHAR(30) NOT NULL DEFAULT 'draft',
    attachments             JSONB DEFAULT '[]'::jsonb,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bid_requests_org ON bid_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_bid_requests_project ON bid_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_bid_requests_status ON bid_requests(status);
CREATE INDEX IF NOT EXISTS idx_bid_requests_created_by ON bid_requests(created_by);

-- bid_invitations: invitations sent to vendors (token-based access)
CREATE TABLE IF NOT EXISTS bid_invitations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bid_request_id  UUID NOT NULL REFERENCES bid_requests(id) ON DELETE CASCADE,
    vendor_email    VARCHAR(255) NOT NULL,
    vendor_name     VARCHAR(255),
    vendor_company  VARCHAR(255),
    token           VARCHAR(128) NOT NULL UNIQUE,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
    invited_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    viewed_at       TIMESTAMPTZ,
    responded_at    TIMESTAMPTZ,
    created_by      UUID NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bid_invitations_request ON bid_invitations(bid_request_id);
CREATE INDEX IF NOT EXISTS idx_bid_invitations_token ON bid_invitations(token);
CREATE INDEX IF NOT EXISTS idx_bid_invitations_email ON bid_invitations(vendor_email);

-- bid_submissions: vendor bid responses
CREATE TABLE IF NOT EXISTS bid_submissions (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bid_request_id                  UUID NOT NULL REFERENCES bid_requests(id) ON DELETE CASCADE,
    invitation_id                   UUID NOT NULL REFERENCES bid_invitations(id) ON DELETE CASCADE,
    vendor_name                     VARCHAR(255) NOT NULL,
    vendor_company                  VARCHAR(255),
    vendor_email                    VARCHAR(255) NOT NULL,
    total_bid_price                 NUMERIC(15,2) NOT NULL,
    currency                        VARCHAR(10) NOT NULL DEFAULT 'GHS',
    proposed_timeline               TEXT,
    timeline_weeks                  INTEGER,
    line_items                      JSONB DEFAULT '[]'::jsonb,
    materials_specification         TEXT,
    notes                           TEXT,
    value_engineering_suggestions   TEXT,
    attachments                     JSONB DEFAULT '[]'::jsonb,
    status                          VARCHAR(30) NOT NULL DEFAULT 'submitted',
    score                           NUMERIC(4,1),
    submitted_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bid_submissions_request ON bid_submissions(bid_request_id);
CREATE INDEX IF NOT EXISTS idx_bid_submissions_invitation ON bid_submissions(invitation_id);
CREATE INDEX IF NOT EXISTS idx_bid_submissions_status ON bid_submissions(status);

-- bid_qa_threads: Q&A between vendors and project managers
CREATE TABLE IF NOT EXISTS bid_qa_threads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bid_request_id  UUID NOT NULL REFERENCES bid_requests(id) ON DELETE CASCADE,
    invitation_id   UUID REFERENCES bid_invitations(id) ON DELETE SET NULL,
    question        TEXT NOT NULL,
    asked_by_name   VARCHAR(255) NOT NULL,
    asked_by_email  VARCHAR(255) NOT NULL,
    answer          TEXT,
    answered_by     UUID,
    is_public       BOOLEAN NOT NULL DEFAULT true,
    asked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    answered_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bid_qa_request ON bid_qa_threads(bid_request_id);

-- bid_awards: records of awarded bids
CREATE TABLE IF NOT EXISTS bid_awards (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bid_request_id      UUID NOT NULL REFERENCES bid_requests(id) ON DELETE CASCADE,
    submission_id       UUID NOT NULL REFERENCES bid_submissions(id) ON DELETE CASCADE,
    awarded_by          UUID NOT NULL,
    awarded_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes               TEXT,
    contract_generated  BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_bid_awards_request ON bid_awards(bid_request_id);
CREATE INDEX IF NOT EXISTS idx_bid_awards_submission ON bid_awards(submission_id);

-- bid_activity_log: audit trail for all actions on a bid request
CREATE TABLE IF NOT EXISTS bid_activity_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bid_request_id  UUID NOT NULL REFERENCES bid_requests(id) ON DELETE CASCADE,
    action          VARCHAR(100) NOT NULL,
    actor_id        UUID,
    actor_name      VARCHAR(255),
    details         JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bid_activity_request ON bid_activity_log(bid_request_id);
