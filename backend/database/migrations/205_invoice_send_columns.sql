-- ============================================================================
-- Migration 205: Add send / payment columns to project_invoices
-- Following the valuation_invoices pattern so PM invoices can be sent to
-- clients with Paystack payment links and email notifications.
-- ============================================================================

-- 1. Add 'sent' to the status CHECK constraint
ALTER TABLE project_invoices DROP CONSTRAINT IF EXISTS project_invoices_status_check;
ALTER TABLE project_invoices ADD CONSTRAINT project_invoices_status_check
    CHECK (status IN (
        'draft', 'pending', 'sent', 'under_review', 'approved',
        'partially_paid', 'paid', 'overdue', 'disputed', 'rejected', 'cancelled'
    ));

-- 2. Paystack / payment link columns (mirrors valuation_invoices)
ALTER TABLE project_invoices
    ADD COLUMN IF NOT EXISTS paystack_reference VARCHAR(255),
    ADD COLUMN IF NOT EXISTS paystack_access_code VARCHAR(255),
    ADD COLUMN IF NOT EXISTS payment_link TEXT,
    ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- 3. Client contact info (so the invoice email knows where to send)
ALTER TABLE project_invoices
    ADD COLUMN IF NOT EXISTS client_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS client_email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS client_company VARCHAR(255);

-- 4. Vendor (from) info stored on invoice
ALTER TABLE project_invoices
    ADD COLUMN IF NOT EXISTS vendor_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS vendor_email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS vendor_company VARCHAR(255);

-- 5. Platform fee tracking
ALTER TABLE project_invoices
    ADD COLUMN IF NOT EXISTS platform_fee NUMERIC(15, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_due NUMERIC(15, 2);

-- Index on paystack reference for webhook lookups
CREATE INDEX IF NOT EXISTS idx_project_invoices_paystack_ref
    ON project_invoices(paystack_reference) WHERE paystack_reference IS NOT NULL;
