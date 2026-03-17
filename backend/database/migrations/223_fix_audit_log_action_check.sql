-- Migration 223: Update report_audit_log action CHECK constraint
-- Add missing action values used in the codebase: generated, submitted,
-- pdf_generated, signature_added, verified

ALTER TABLE report_audit_log DROP CONSTRAINT IF EXISTS report_audit_log_action_check;

ALTER TABLE report_audit_log ADD CONSTRAINT report_audit_log_action_check
  CHECK (action IN (
    'created', 'edited', 'viewed', 'downloaded',
    'approved', 'rejected', 'superseded',
    'shared', 'printed',
    'generated', 'submitted', 'pdf_generated',
    'signature_added', 'verified'
  ));
