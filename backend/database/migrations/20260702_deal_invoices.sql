-- Deal-level billing: invoices raised against a won (or in-progress) CRM deal,
-- tracked through to payment with AR aging. Reuses the platform payment stack
-- conceptually (payment_transactions remains the settlement ledger); this table
-- is the receivable/AR layer the CRM never had.
-- Idempotent.

CREATE TABLE IF NOT EXISTS deal_invoices (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL,
    deal_id           UUID REFERENCES deals(id) ON DELETE SET NULL,
    invoice_number    VARCHAR(50) NOT NULL,
    client_name       VARCHAR(255),
    contact_id        UUID,
    description       TEXT,
    currency          VARCHAR(3) NOT NULL DEFAULT 'GHS',
    amount            NUMERIC(15,2) NOT NULL DEFAULT 0,     -- total invoiced
    paid_amount       NUMERIC(15,2) NOT NULL DEFAULT 0,     -- settled to date
    status            VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft|sent|partially_paid|paid|overdue|cancelled
    issue_date        DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date          DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '30 days'),
    sent_at           TIMESTAMPTZ,
    paid_at           TIMESTAMPTZ,
    payment_method    VARCHAR(50),
    payment_reference VARCHAR(100),
    notes             TEXT,
    created_by        UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT deal_invoices_status_chk CHECK (
        status IN ('draft','sent','partially_paid','paid','overdue','cancelled')
    ),
    CONSTRAINT deal_invoices_number_uniq UNIQUE (organization_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_deal_invoices_org      ON deal_invoices (organization_id);
CREATE INDEX IF NOT EXISTS idx_deal_invoices_deal     ON deal_invoices (deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_invoices_status   ON deal_invoices (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_deal_invoices_due      ON deal_invoices (organization_id, due_date);

-- Individual payments applied to an invoice (partial payments supported).
CREATE TABLE IF NOT EXISTS deal_invoice_payments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL,
    invoice_id        UUID NOT NULL REFERENCES deal_invoices(id) ON DELETE CASCADE,
    amount            NUMERIC(15,2) NOT NULL,
    payment_method    VARCHAR(50),
    payment_reference VARCHAR(100),
    paid_at           DATE NOT NULL DEFAULT CURRENT_DATE,
    recorded_by       UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deal_invoice_payments_invoice ON deal_invoice_payments (invoice_id);

-- Keep updated_at fresh (platform convention).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at')
       AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_deal_invoices')
    THEN
        CREATE TRIGGER set_updated_at_deal_invoices
        BEFORE UPDATE ON deal_invoices
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
END $$;
