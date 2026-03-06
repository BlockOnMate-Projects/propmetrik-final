-- Migration: 021_esign_schema
-- Description: E-Signature system tables for signing requests, evidences, and audit logs
-- Created: 2026-01-17

-- =====================================================
-- USER SIGNING KEYS TABLE
-- Each user has a unique key pair for signing
-- =====================================================
CREATE TABLE IF NOT EXISTS user_signing_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Key material (encrypted for production, plaintext for dev)
  public_key TEXT NOT NULL,
  private_key_encrypted TEXT NOT NULL,
  key_algorithm VARCHAR(50) NOT NULL DEFAULT 'ECDSA-P256',
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  
  UNIQUE(user_id, is_active) -- One active key per user
);

CREATE INDEX IF NOT EXISTS idx_user_signing_keys_user ON user_signing_keys(user_id);

-- =====================================================
-- SIGNING REQUESTS TABLE
-- Represents a document pending signatures
-- =====================================================
CREATE TABLE IF NOT EXISTS signing_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Document info
  document_id UUID NOT NULL, -- Reference to the source document (could be from any service)
  document_type VARCHAR(100) NOT NULL, -- e.g., 'lease_agreement', 'valuation_report'
  document_title VARCHAR(500) NOT NULL,
  document_hash_original VARCHAR(64) NOT NULL, -- SHA-256 of original PDF
  
  -- Storage references
  original_pdf_url TEXT NOT NULL,
  signed_pdf_url TEXT,
  
  -- Request metadata
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'pending_sign',
  -- Possible: draft, pending_sign, partially_signed, signed, voided
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  void_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_signing_requests_document ON signing_requests(document_id);
CREATE INDEX IF NOT EXISTS idx_signing_requests_status ON signing_requests(status);
CREATE INDEX IF NOT EXISTS idx_signing_requests_created_by ON signing_requests(created_by);

-- =====================================================
-- SIGNEES TABLE
-- People required to sign a document
-- =====================================================
CREATE TABLE IF NOT EXISTS signing_request_signees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  signing_request_id UUID NOT NULL REFERENCES signing_requests(id) ON DELETE CASCADE,
  
  -- Signee identification
  signee_type VARCHAR(20) NOT NULL, -- 'internal' or 'external'
  user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- For internal signees
  
  -- External signee info (if signee_type = 'external')
  external_name VARCHAR(255),
  external_email VARCHAR(255),
  external_phone VARCHAR(50),
  
  -- Magic link for external signees
  magic_token VARCHAR(255) UNIQUE,
  magic_token_expires_at TIMESTAMPTZ,
  
  -- Signing order and role
  signing_order INTEGER NOT NULL DEFAULT 1,
  signee_role VARCHAR(100), -- e.g., 'tenant', 'landlord', 'witness'
  
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  -- Possible: pending, viewed, signed, declined
  
  signed_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  decline_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_signees_request ON signing_request_signees(signing_request_id);
CREATE INDEX IF NOT EXISTS idx_signees_user ON signing_request_signees(user_id);
CREATE INDEX IF NOT EXISTS idx_signees_token ON signing_request_signees(magic_token);
CREATE INDEX IF NOT EXISTS idx_signees_status ON signing_request_signees(status);

-- =====================================================
-- SIGNATURE EVIDENCES TABLE
-- Cryptographic proof of each signature
-- =====================================================
CREATE TABLE IF NOT EXISTS signature_evidences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  signing_request_id UUID NOT NULL REFERENCES signing_requests(id) ON DELETE CASCADE,
  signee_id UUID NOT NULL REFERENCES signing_request_signees(id) ON DELETE CASCADE,
  
  -- Document state at signing
  document_hash_before VARCHAR(64) NOT NULL,
  document_hash_after VARCHAR(64) NOT NULL,
  
  -- Signer identity snapshot
  signer_identity JSONB NOT NULL,
  -- { name, email, role, user_id (if internal) }
  
  -- Signature details
  signature_method VARCHAR(50) NOT NULL, -- 'click_to_sign', 'typed_name', 'drawn_signature'
  signature_image_base64 TEXT, -- Optional, for drawn/typed
  
  -- Cryptographic signature
  cryptographic_signature TEXT NOT NULL, -- ECDSA signature
  public_key TEXT NOT NULL,
  
  -- Timestamping
  timestamp_utc TIMESTAMPTZ NOT NULL,
  timestamp_authority_response TEXT, -- RFC 3161 response (if applicable)
  
  -- Consent
  consent_statement_version VARCHAR(20) NOT NULL,
  consent_accepted_at TIMESTAMPTZ NOT NULL,
  
  -- Session metadata
  session_id VARCHAR(255),
  ip_address INET,
  user_agent TEXT,
  
  -- Step-up verification
  step_up_method VARCHAR(50), -- 'otp', 'pin', 'password'
  step_up_verified_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_signature_evidences_request ON signature_evidences(signing_request_id);
CREATE INDEX IF NOT EXISTS idx_signature_evidences_signee ON signature_evidences(signee_id);

-- =====================================================
-- E-SIGN AUDIT LOGS TABLE
-- Immutable, hash-chained audit trail
-- =====================================================
CREATE TABLE IF NOT EXISTS esign_audit_logs (
  id BIGSERIAL PRIMARY KEY, -- Sequential for hash chain integrity
  event_id UUID NOT NULL UNIQUE DEFAULT uuid_generate_v4(),
  
  -- Reference
  signing_request_id UUID REFERENCES signing_requests(id) ON DELETE SET NULL,
  signee_id UUID REFERENCES signing_request_signees(id) ON DELETE SET NULL,
  
  -- Actor
  actor_id UUID, -- User ID or null for system
  actor_type VARCHAR(50) NOT NULL, -- 'user', 'system', 'external_signee'
  
  -- Event details
  event_type VARCHAR(100) NOT NULL,
  -- Possible: request_created, signee_added, document_viewed, consent_given,
  -- step_up_verified, signature_captured, document_sealed, request_voided
  
  -- Timestamp
  timestamp_utc TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Context
  ip_address INET,
  session_id VARCHAR(255),
  document_hash VARCHAR(64),
  
  -- Additional data
  metadata JSONB DEFAULT '{}',
  
  -- Hash chain for tamper evidence
  previous_hash VARCHAR(64), -- SHA-256 of previous row
  row_hash VARCHAR(64) NOT NULL, -- SHA-256 of this row's content
  
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_esign_audit_request ON esign_audit_logs(signing_request_id);
CREATE INDEX IF NOT EXISTS idx_esign_audit_event_type ON esign_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_esign_audit_timestamp ON esign_audit_logs(timestamp_utc);

-- =====================================================
-- CONSENT STATEMENT VERSIONS TABLE
-- Versioned consent statements for legal compliance
-- =====================================================
CREATE TABLE IF NOT EXISTS consent_statement_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version VARCHAR(20) NOT NULL UNIQUE,
  statement_text TEXT NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  effective_until TIMESTAMPTZ,
  is_current BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial consent statement
INSERT INTO consent_statement_versions (version, statement_text, is_current) VALUES (
  '1.0.0',
  'By clicking "Sign", I agree to sign this document electronically. I understand that my electronic signature is legally binding and has the same legal effect as my handwritten signature. I consent to the use of electronic records and signatures in connection with this document pursuant to the Electronic Transactions Act (Act 772) of Ghana.',
  TRUE
) ON CONFLICT (version) DO NOTHING;

-- =====================================================
-- TRIGGERS
-- =====================================================
DROP TRIGGER IF EXISTS update_signing_requests_updated_at ON signing_requests;
CREATE TRIGGER update_signing_requests_updated_at
  BEFORE UPDATE ON signing_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
