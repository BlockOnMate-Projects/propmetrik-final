# In-House E-Signature System – Implementation & Integration Strategy

> **Status**: Design Document  
> **Date**: 2026-01-17  
> **Author**: PROPMETRIK Engineering

---

## 1. System Overview

### 1.1 Purpose

This document specifies a fully in-house electronic signature system for PROPMETRIK, replacing third-party solutions (e.g., DocuSign). The system is designed to:

- Be legally enforceable under Ghana's Electronic Transactions Act (Act 772) and comparable international frameworks.
- Integrate directly with Property Management, Valuation, and CRM/Deal Management workflows.
- Handle both **internal/logged-in signers** and **external signees** (e.g., tenants via email magic links).
- Store all cryptographic evidence and audit logs on self-hosted infrastructure.

### 1.2 Key Principles

1. **Zero External API Dependency**: All cryptographic operations are performed in-house.
2. **Self-Custody of Keys**: Signing keys are managed via a self-hosted solution (e.g., HashiCorp Vault).
3. **Legally Compliant**: Adheres to Act 772 requirements for attribution, intent, and record integrity.
4. **Auditable**: Full court-readable audit trail for every signature event.

---

## 2. Signature Model & Cryptography

### 2.1 Cryptographic Standards

| Component          | Specification                                  |
|--------------------|------------------------------------------------|
| Document Hashing   | SHA-256                                         |
| Signature Scheme   | ECDSA P-256 (secp256r1) for user keys          |
| PDF Embedding      | PKCS#7 / CMS (Cryptographic Message Syntax)    |
| Timestamping       | RFC 3161-compliant internal TSA                 |
| Key Storage        | HashiCorp Vault (self-hosted)                   |

### 2.2 Signature Binding

Each signature event produces a **Signature Evidence Packet (SEP)** containing:

```json
{
  "document_id": "uuid",
  "document_hash_before_sign": "sha256_hex",
  "document_hash_after_sign": "sha256_hex",
  "signer_id": "user_uuid",
  "signer_identity": { "name": "...", "email": "...", "role": "..." },
  "signature_method": "click_to_sign | typed_name | drawn_signature",
  "signature_image_base64": "...", // Optional, for drawn/typed
  "cryptographic_signature": "ecdsa_p256_base64",
  "public_key": "pem_encoded",
  "timestamp": "2026-01-17T13:00:00.000Z",
  "timestamp_authority_response": "...", // RFC 3161 response
  "consent": {
    "statement_version": "1.0.0",
    "accepted_at": "2026-01-17T12:59:58.000Z"
  },
  "session_metadata": {
    "session_id": "uuid",
    "ip_address": "123.456.78.90",
    "user_agent": "..."
  },
  "step_up_verification": {
    "method": "otp | pin | password_reentry",
    "verified_at": "2026-01-17T12:59:55.000Z"
  }
}
```

### 2.3 Non-Repudiation Strategy

1. **Key Generation**: Each user receives a unique ECDSA P-256 key pair upon first signature request. Private keys are stored encrypted in Vault, accessible only via authenticated session.
2. **Hash Binding**: The SHA-256 hash of the document at the moment of signing is included in the signed payload, making any post-signature modification detectable.
3. **Timestamping**: A self-hosted RFC 3161 Timestamp Authority (TSA) provides cryptographic proof of when the signature occurred.

---

## 3. Authentication & Consent Flow

### 3.1 Internal Signers (Logged-In Users)

```
┌──────────────────┐      ┌─────────────────────┐      ┌─────────────────────┐
│   Document       │      │   Step-Up           │      │   Signature         │
│   Approval UI    │─────▶│   Verification      │─────▶│   Capture UI        │
│                  │      │   (PIN/OTP/Password)│      │   + Consent Checkbox│
└──────────────────┘      └─────────────────────┘      └─────────────────────┘
```

**Flow**:
1. User reviews document in the platform.
2. Clicks "Approve & Sign".
3. System issues a **one-time signing token** (short-lived, ~5 min).
4. User completes **step-up verification** (e.g., OTP, in-app PIN).
5. User selects signature method (click, type, draw).
6. User checks "I consent to sign this document electronically" (versioned statement).
7. Backend captures signature, creates SEP, embeds into PDF.

### 3.2 External Signers (Tenants, Vendors, etc.)

External signers do **not** require a platform account. They sign via a secure magic link.

```
┌──────────────────┐      ┌─────────────────────┐      ┌─────────────────────┐
│   Email Invite   │      │   OTP Verification  │      │   Signature         │
│   (Magic Link)   │─────▶│   (SMS/Email)       │─────▶│   Capture UI        │
│                  │      │                     │      │   + Consent Checkbox│
└──────────────────┘      └─────────────────────┘      └─────────────────────┘
```

**Flow**:
1. Platform user initiates document signing and adds external signee (email + phone).
2. System generates a **single-use, time-limited signing link** (e.g., valid for 7 days).
3. External signee clicks link, is shown document preview.
4. Signee must verify identity via **OTP** sent to their registered phone or email.
5. Signee completes the signature UI (consent checkbox + method selection).
6. Backend creates SEP and updates document status.

> **Security**: The signing link is tied to a specific document, signee email, and session. Any reuse or tampering is rejected.

---

## 4. Document Signing Workflow

### 4.1 Document Lifecycle States

| State           | Description                                                                 |
|-----------------|-----------------------------------------------------------------------------|
| `draft`         | Document is being composed or edited.                                       |
| `pending_sign`  | Document is approved and awaiting signatures from one or more parties.      |
| `partially_signed` | Some signatures captured; awaiting others.                                 |
| `signed`        | All required signatures captured; document is cryptographically sealed.     |
| `voided`        | Document was canceled before completion; all prior signatures invalidated.  |

### 4.2 Integration Points

| Service             | Trigger Event              | E-Sign Action                         |
|---------------------|----------------------------|---------------------------------------|
| **Valuation Engine** | Report Approval            | Generate PDF, request client sign-off |
| **Property Management** | Lease Agreement Ready   | Request tenant signature via magic link |
| **CRM/Deal Mgmt**   | Offer Accepted             | Multi-party signing (buyer, seller, agent) |

---

## 5. Audit Trail & Evidence Design

### 5.1 Audit Log Fields (Immutable)

| Field               | Description                                      |
|---------------------|--------------------------------------------------|
| `event_id`          | Unique UUID for the event                        |
| `document_id`       | Associated document                              |
| `actor_id`          | User or system ID                                |
| `actor_type`        | `user`, `system`, `external_signee`              |
| `event_type`        | `view`, `consent`, `step_up`, `sign`, `seal`     |
| `timestamp`         | UTC ISO-8601                                     |
| `ip_address`        | Client IP                                        |
| `session_id`        | Active session ID                                |
| `document_hash`     | SHA-256 hash at time of event                    |
| `metadata`          | JSONB for additional context                     |

### 5.2 Tamper Evidence

- Audit logs are stored in an **append-only table** with a **hash chain**. Each row includes the hash of the previous row.
- Hash chain integrity is verified on read.
- Logs are replicated to a secondary immutable store (e.g., S3 Object Lock) for court discovery.

---

## 6. Storage & Immutability

### 6.1 Document Storage

- **Original PDF**: Stored in MinIO/S3 before signing.
- **Signed PDF**: PKCS#7 signature embedded directly into the PDF. Stored separately.
- **SEP Archive**: JSON file stored alongside the signed PDF for legal discovery.

### 6.2 Key Management

| Entity              | Storage Location          | Access Control                          |
|---------------------|---------------------------|-----------------------------------------|
| User Signing Keys   | HashiCorp Vault (self-hosted) | User session + step-up auth required |
| TSA Key             | Vault (high-security path) | Root-only, automated TSA service access |
| Service Keys        | Kubernetes Secrets / Vault | Managed via CI/CD                       |

---

## 7. Legal & Compliance Mapping

### 7.1 Ghana Electronic Transactions Act (Act 772) Compliance

| Act Requirement                     | System Fulfillment                                                  |
|-------------------------------------|---------------------------------------------------------------------|
| **Attribution (Sec. 8)**            | Unique user key pair + step-up verification.                        |
| **Intent (Sec. 9)**                 | Explicit consent checkbox + signing action.                         |
| **Integrity (Sec. 12)**             | SHA-256 hash + PKCS#7 embedding + timestamping.                     |
| **Accessibility (Sec. 18)**         | PDF stored in accessible format with audit logs.                    |
| **Record Retention**                | Configurable retention policies (default: indefinite for signed docs). |

### 7.2 Enhanced Signing Scenarios

Certain document types may require additional assurance:

| Document Type         | Risk Level | Required Authentication                       |
|-----------------------|------------|-----------------------------------------------|
| Standard Lease        | Medium     | OTP for external, PIN for internal            |
| High-Value Property Sale | High    | OTP + Password re-entry for all parties        |
| Valuation Report (Client) | Medium | OTP for external signee                        |

---

## 8. Risks, Trade-offs, & Mitigations

| Risk                               | Description                                                        | Mitigation                                                  |
|------------------------------------|--------------------------------------------------------------------|-------------------------------------------------------------|
| Key Compromise                     | Private key theft allows signature forgery.                        | Vault transit secrets engine + HSM support (future).        |
| Internal TSA Trust                 | Self-signed TSA is less trusted than external CAs.                 | Document the TSA; option for future external TSA bridge.    |
| External Signee Impersonation      | Attacker intercepts magic link.                                     | OTP requirement; short link expiry; one-time use.           |
| Auditability in Court              | Judge may not understand cryptographic evidence.                   | Generate human-readable Signature Certificate alongside SEP. |
| Scalability of Key Management      | Large user base = large key store.                                  | Vault auto-unsealing + replication.                          |

---

## 9. Technology Stack

| Layer               | Technology                                                     |
|---------------------|----------------------------------------------------------------|
| **Backend Service** | Node.js (TypeScript) / `@peculiar/x509`, `node-forge`          |
| **PDF Processing**  | `pdf-lib` for PDF manipulation, `node-signpdf` for PKCS#7      |
| **Key Management**  | HashiCorp Vault (self-hosted)                                   |
| **Timestamping**    | Custom TSA service using `node-rfc3161-client` (self-responding) |
| **Audit Storage**   | PostgreSQL (append-only table) + S3 Object Lock                |
| **Email Delivery**  | SendGrid (for magic link invitations)                          |
| **OTP/SMS**         | Twilio (for step-up verification)                              |
| **Database**        | PostgreSQL (shared with main app)                               |

---

## 10. File Structure (Proposed Backend)

```
backend/src/services/shared/e-sign/
├── index.ts                  # Service exports
├── signingService.ts         # Core signing logic
├── keyManagementService.ts   # Vault integration
├── timestampService.ts       # RFC 3161 TSA
├── pdfSigningService.ts      # PKCS#7 PDF embedding
├── auditLogService.ts        # Append-only audit log
├── magicLinkService.ts       # External signee link generation
├── consentService.ts         # Consent statement management
├── types/
│   ├── signatureEvidence.ts
│   ├── auditEvent.ts
│   └── signingRequest.ts
└── routes/
    └── eSignRoutes.ts        # API endpoints
```

---

## 11. Next Steps

1. **Review & Approve**: User reviews this document for completeness and design alignment.
2. **Database Schema**: Define migrations for `signing_requests`, `signature_evidences`, `audit_logs`.
3. **Vault Setup**: Configure HashiCorp Vault for key storage.
4. **Core Service Implementation**: Implement `signingService.ts` and `pdfSigningService.ts`.
5. **Frontend UI**: Build signature capture component (click, type, draw).
6. **Integration**: Connect to Valuation, PM, and CRM workflows.
7. **Testing**: Full integration tests including external signee flow.
