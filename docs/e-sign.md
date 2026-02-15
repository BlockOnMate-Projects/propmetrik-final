# E-Sign Integration Architecture

## Executive Summary

This document defines the architecture for integrating PROPMETRIK's E-Signature service as a **headless capability** triggered by business events across all modules. The e-sign tab remains available for manual document signing, but core services integrate e-sign directly into their workflows without requiring navigation to the e-sign UI.

> **Key Principle**: E-sign is not a destination. It is an embedded capability.

---

## 1. Current State Analysis

### 1.1 E-Sign Service (Existing)

Located at: `/backend/shared-services/e-sign/`

**Current Capabilities:**
- FastAPI on port 8002
- Envelope creation with recipients, documents, and signature fields
- Self-sign flow with immediate completion
- Certificate of Completion with SHA-256 security hash
- QR code on certificates linking to verification URL
- Permanent signer IDs (PMT-XXXXXXXXXX)
- Document storage in MinIO/local filesystem

**Current API Endpoints:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/envelopes/create` | POST | Create envelope with documents and recipients |
| `/envelopes/{id}` | GET | Retrieve envelope details |
| `/envelopes/{id}/document` | GET | Download signed document |
| `/signing/{token}/complete` | POST | Complete signing |
| `/users/get-or-create-signer-id` | POST | Get/create permanent signer ID |

### 1.2 Services Requiring E-Sign Integration

| Module | Service | Document Types | Priority |
|--------|---------|----------------|----------|
| **Property Management** | `tenancyService.ts`, `leaseTemplateService.ts` | Lease agreements, renewals | HIGH |
| **Valuation Engine** | `approvalService.ts`, `reportService.ts` | Valuation reports | HIGH |
| **CRM/Deal Management** | `signatureService.ts`, `documentGenerationService.ts` | Contracts, offers, deeds | HIGH |
| **Project Management** | `changeOrderService.ts`, `contractorService.ts`, `drawService.ts` | Change orders, contracts, draws | MEDIUM |

---

## 2. Target Architecture

### 2.1 Conceptual Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Business Services                                │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐               │
│  │ Property Mgmt │  │  Valuation    │  │ Project Mgmt  │               │
│  │   - Leases    │  │  - Reports    │  │ - Contracts   │               │
│  │   - Renewals  │  │  - Approvals  │  │ - Change Ords │               │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘               │
│          │                  │                  │                        │
│          ▼                  ▼                  ▼                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Domain Event Bus                              │   │
│  │  LeaseApproved | ReportApproved | ChangeOrderApproved | ...     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                │                                        │
└────────────────────────────────┼────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     E-Sign Integration Layer                            │
│  ┌────────────────────────────────────────────────────────────────────┐│
│  │                   ESignIntegrationService                          ││
│  │  - createEnvelope(document, signers, fields)                      ││
│  │  - sendForSigning(envelopeId)                                     ││
│  │  - onDocumentCompleted(envelopeId) → callback to source service   ││
│  │  - getSigningUrl(envelopeId, recipientEmail)                      ││
│  │  - getEmbeddedSigning(envelopeId, recipientEmail)                 ││
│  └────────────────────────────────────────────────────────────────────┘│
│                                │                                        │
│                                ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────┐│
│  │                 E-Sign Core Service (Port 8002)                    ││
│  │  - Envelope management                                             ││
│  │  - Signature orchestration                                         ││
│  │  - Certificate generation                                          ││
│  │  - Audit trail                                                     ││
│  └────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Event-Driven Flow

```
┌──────────────┐     ┌───────────────┐     ┌─────────────────┐     ┌──────────────┐
│ Business     │     │ Event Bus     │     │ E-Sign          │     │ Signer       │
│ Service      │     │               │     │ Integration     │     │              │
└──────┬───────┘     └───────┬───────┘     └────────┬────────┘     └──────┬───────┘
       │                     │                      │                     │
       │ emit(LeaseApproved) │                      │                     │
       │────────────────────►│                      │                     │
       │                     │ LeaseApproved        │                     │
       │                     │─────────────────────►│                     │
       │                     │                      │                     │
       │                     │                      │ createEnvelope()    │
       │                     │                      │────────────────────►│
       │                     │                      │                     │
       │                     │                      │ sendSigningLink()   │
       │                     │                      │────────────────────►│
       │                     │                      │                     │
       │                     │                      │◄────────────────────│
       │                     │                      │   [Signature]       │
       │                     │                      │                     │
       │                     │ DocumentCompleted    │                     │
       │◄────────────────────│◄─────────────────────│                     │
       │                     │                      │                     │
       │ updateLeaseRecord() │                      │                     │
       │                     │                      │                     │
```

---

## 3. API Design

### 3.1 E-Sign Integration Service (TypeScript)

Create: `/backend/src/services/e-sign/eSignIntegrationService.ts`

```typescript
/**
 * E-Sign Integration Service
 * 
 * Provides programmatic access to e-sign capabilities for all business services.
 * This is the ONLY interface business services should use to trigger e-sign workflows.
 */

export interface ESignDocument {
  name: string;
  content: Buffer;
  mimeType: 'application/pdf';
  source: 'system_generated' | 'uploaded';
}

export interface ESignSigner {
  name: string;
  email: string;
  role: 'signer' | 'cc' | 'viewer';
  order: number;
}

export interface ESignField {
  type: 'signature' | 'initials' | 'date' | 'text';
  recipientEmail: string;
  documentIndex: number;
  page: number;
  x: number;         // Percentage 0-1 or absolute pixels
  y: number;
  width: number;
  height: number;
  required: boolean;
}

export interface CreateEnvelopeInput {
  subject: string;
  message?: string;
  documents: ESignDocument[];
  signers: ESignSigner[];
  fields: ESignField[];
  sourceModule: 'property_management' | 'valuation' | 'crm' | 'project_management';
  sourceEntityType: string;
  sourceEntityId: string;
  callbackUrl?: string;
  expiresInDays?: number;
}

export interface EnvelopeResult {
  envelopeId: string;
  status: 'pending' | 'sent' | 'completed' | 'voided';
  signingUrls: Record<string, string>;  // email -> signing URL
  embeddedSigningUrls?: Record<string, string>;
}

export interface CompletionEvent {
  envelopeId: string;
  sourceModule: string;
  sourceEntityType: string;
  sourceEntityId: string;
  signedDocumentUrl: string;
  certificateUrl: string;
  securityHash: string;
  completedAt: Date;
  signers: {
    email: string;
    name: string;
    pmtId: string;
    signedAt: Date;
  }[];
}

export class ESignIntegrationService {
  private baseUrl: string = 'http://localhost:8002';
  
  /**
   * Create an envelope and optionally send for signing
   */
  async createEnvelope(input: CreateEnvelopeInput): Promise<EnvelopeResult>;
  
  /**
   * Send an existing envelope for signing (if not auto-sent on creation)
   */
  async sendForSigning(envelopeId: string): Promise<void>;
  
  /**
   * Get signing URL for a specific recipient
   */
  async getSigningUrl(envelopeId: string, recipientEmail: string): Promise<string>;
  
  /**
   * Get embedded signing URL (for iframe integration)
   */
  async getEmbeddedSigningUrl(envelopeId: string, recipientEmail: string): Promise<string>;
  
  /**
   * Get envelope status
   */
  async getEnvelopeStatus(envelopeId: string): Promise<EnvelopeResult>;
  
  /**
   * Download signed document
   */
  async downloadSignedDocument(envelopeId: string): Promise<Buffer>;
  
  /**
   * Download certificate of completion
   */
  async downloadCertificate(envelopeId: string): Promise<Buffer>;
  
  /**
   * Void an envelope
   */
  async voidEnvelope(envelopeId: string, reason: string): Promise<void>;
  
  /**
   * Handle completion webhook (called by e-sign service)
   */
  async handleCompletionWebhook(event: CompletionEvent): Promise<void>;
}

export const eSignIntegrationService = new ESignIntegrationService();
```

### 3.2 E-Sign Service API Extensions (Python)

Add to: `/backend/shared-services/e-sign/api/`

**New Endpoint: `/envelopes/create-programmatic`**

```python
class ProgrammaticEnvelopeInput(BaseModel):
    """Input for programmatic envelope creation from business services"""
    subject: str
    message: Optional[str] = ""
    documents: List[DocumentInput]  # Base64 encoded PDF content
    signers: List[SignerInput]
    fields: List[FieldInput]
    sourceModule: str
    sourceEntityType: str
    sourceEntityId: str
    callbackUrl: Optional[str] = None
    expiresInDays: int = 30
    autoSend: bool = True  # Immediately send for signing

@router.post("/create-programmatic")
async def create_programmatic_envelope(
    data: ProgrammaticEnvelopeInput,
    db: Session = Depends(get_db),
    api_key: str = Depends(verify_internal_api_key)  # Server-to-server auth
):
    """
    Create envelope programmatically from business services.
    No user authentication required - uses internal API key.
    """
```

**New Endpoint: `/webhooks/completion`**

```python
@router.post("/webhooks/register")
async def register_completion_webhook(
    data: WebhookRegistration,
    db: Session = Depends(get_db)
):
    """Register a webhook URL to receive completion events"""

@router.post("/webhooks/test/{envelope_id}")
async def test_webhook(envelope_id: str):
    """Test webhook delivery for an envelope"""
```

---

## 4. Integration Flows

### 4.1 Property Management: Lease Signing

**Trigger Event:** `TenancyApproved` (tenancy status changes from `pending` to `active`)

**Flow:**
1. Property manager approves tenant application
2. `tenancyService.activateTenancy()` is called
3. System calls `leaseTemplateService.generateLease()` to create PDF
4. System calls `eSignIntegrationService.createEnvelope()`:
   - Documents: Generated lease PDF
   - Signers: Tenant(s), Property owner, Witness (optional)
   - Fields: Signature placements (tenant page 12, owner page 12)
5. E-sign service sends signing links to all signers
6. Upon completion, webhook triggers:
   - `tenancyService.recordSignedLease(envelopeId, signedPdfUrl)`
   - Lease PDF with certificate stored in property documents
   - Tenancy record updated with `signed_lease_document_id`

**Code Location Changes:**

```typescript
// /backend/src/services/property-management/leases/tenancyService.ts

async activateTenancy(
  tenancyId: string,
  organizationId: string,
  userId: string
): Promise<Tenancy> {
  // Existing activation logic...
  
  // NEW: Trigger e-sign workflow
  const leaseDoc = await this.leaseTemplateService.generateLease(
    organizationId,
    { tenancyId, format: 'pdf' }
  );
  
  const tenancy = await this.getTenancyById(tenancyId, organizationId);
  const tenant = await this.getTenantById(tenancy.tenantId);
  const property = await this.getPropertyById(tenancy.propertyId);
  
  const envelope = await eSignIntegrationService.createEnvelope({
    subject: `Lease Agreement - ${property.title}`,
    message: `Please sign the lease agreement for ${property.address}`,
    documents: [{
      name: 'Lease Agreement',
      content: leaseDoc.buffer,
      mimeType: 'application/pdf',
      source: 'system_generated'
    }],
    signers: [
      { name: tenant.fullName, email: tenant.email, role: 'signer', order: 1 },
      { name: property.ownerName, email: property.ownerEmail, role: 'signer', order: 2 }
    ],
    fields: [
      { type: 'signature', recipientEmail: tenant.email, documentIndex: 0, page: 12, x: 0.1, y: 0.7, width: 0.3, height: 0.1, required: true },
      { type: 'date', recipientEmail: tenant.email, documentIndex: 0, page: 12, x: 0.5, y: 0.7, width: 0.2, height: 0.05, required: true },
      { type: 'signature', recipientEmail: property.ownerEmail, documentIndex: 0, page: 12, x: 0.1, y: 0.5, width: 0.3, height: 0.1, required: true }
    ],
    sourceModule: 'property_management',
    sourceEntityType: 'tenancy',
    sourceEntityId: tenancyId
  });
  
  // Store envelope reference
  await this.db.query(
    `UPDATE tenancies SET esign_envelope_id = $1 WHERE id = $2`,
    [envelope.envelopeId, tenancyId]
  );
  
  return tenancy;
}
```

### 4.2 Valuation Engine: Report Signing

**Trigger Event:** `ValuationReportApproved` (report status changes to `approved`)

**Flow:**
1. Valuer approves valuation report via `approvalService.approveReport()`
2. Report is locked with digital seal hash
3. System calls `eSignIntegrationService.createEnvelope()`:
   - Documents: Final valuation report PDF
   - Signers: Client (report recipient)
   - Fields: Client acknowledgment signature
4. Upon completion:
   - `reportService.recordClientSignature(reportId, signedPdfUrl)`
   - Report marked as `client_acknowledged`

**Code Location Changes:**

```typescript
// /backend/src/services/valuation-engine/approvalService.ts

async approveReport(request: ApprovalRequest): Promise<ApprovalResult> {
  // Existing approval logic...
  
  // After approval, trigger client signature request
  if (result.success && request.sendToClient) {
    const report = await reportService.getReportById(request.reportId);
    const client = await this.getClientInfo(report.clientId);
    
    const reportPdf = await reportService.generatePdf(request.reportId);
    
    await eSignIntegrationService.createEnvelope({
      subject: `Valuation Report - ${report.propertyAddress}`,
      message: `Your valuation report is ready. Please review and sign to acknowledge receipt.`,
      documents: [{
        name: 'Valuation Report',
        content: reportPdf,
        mimeType: 'application/pdf',
        source: 'system_generated'
      }],
      signers: [
        { name: client.name, email: client.email, role: 'signer', order: 1 }
      ],
      fields: [
        { type: 'signature', recipientEmail: client.email, documentIndex: 0, page: 1, x: 0.6, y: 0.2, width: 0.25, height: 0.08, required: true }
      ],
      sourceModule: 'valuation',
      sourceEntityType: 'valuation_report',
      sourceEntityId: request.reportId
    });
  }
  
  return result;
}
```

### 4.3 CRM/Deal Management: Contract Signing

**Trigger Event:** `DealStageChange` (deal enters "Offer Accepted" or "Contract" stage)

**Flow:**
1. Deal moves to contract stage
2. Agent generates contract from template via `documentGenerationService.generate()`
3. System calls `eSignIntegrationService.createEnvelope()`:
   - Documents: Contract PDF
   - Signers: Buyer, Seller, Witnesses
   - Fields: Multiple signature locations per signer
4. Upon completion:
   - `dealService.recordContractSigned(dealId, signedPdfUrl)`
   - Deal auto-advances to next stage

**Code Location Changes:**

```typescript
// /backend/src/services/crm-deal-management/dealService.ts

async updateDealStage(
  dealId: string,
  newStageId: string,
  userId: string
): Promise<Deal> {
  // Existing stage update logic...
  
  const stage = await this.getStageById(newStageId);
  
  // Check if stage triggers e-sign workflow
  if (stage.triggerEsign && stage.templateId) {
    const deal = await this.getDealById(dealId, organizationId);
    const contact = await contactService.getContactById(deal.primaryContactId);
    
    // Generate contract
    const contract = await documentGenerationService.generate(organizationId, {
      templateId: stage.templateId,
      dealId: dealId
    }, userId);
    
    const contractBuffer = await this.downloadDocument(contract.file_url);
    
    await eSignIntegrationService.createEnvelope({
      subject: `${stage.documentSubject || 'Contract'} - ${deal.title}`,
      documents: [{
        name: contract.file_name,
        content: contractBuffer,
        mimeType: 'application/pdf',
        source: 'system_generated'
      }],
      signers: stage.signerConfig.map((config, idx) => ({
        name: this.resolveSignerName(deal, config.role),
        email: this.resolveSignerEmail(deal, config.role),
        role: 'signer',
        order: idx + 1
      })),
      fields: stage.fieldPlacements,
      sourceModule: 'crm',
      sourceEntityType: 'deal',
      sourceEntityId: dealId
    });
  }
  
  return deal;
}
```

### 4.4 Project Management: Change Order Signing

**Trigger Event:** `ChangeOrderApproved` (all required signatures collected)

**Flow:**
1. Change order created and submitted for approval
2. Multi-level approval chain progresses
3. Once approved, `eSignIntegrationService.createEnvelope()`:
   - Documents: Change order PDF
   - Signers: Owner, Contractor, Project Manager
   - Fields: Signature blocks for each party
4. Upon completion:
   - `changeOrderService.recordExecution(coId, signedPdfUrl)`
   - Change order status → `executed`
   - Budget/schedule impacts applied

---

## 5. State Transitions

### 5.1 Envelope States

```
┌─────────┐     ┌──────┐     ┌────────────┐     ┌───────────┐
│ created │────►│ sent │────►│ in_progress│────►│ completed │
└─────────┘     └──────┘     └────────────┘     └───────────┘
     │               │              │                  │
     │               │              │                  │
     ▼               ▼              ▼                  │
┌─────────┐     ┌──────┐     ┌──────────┐             │
│ voided  │◄────│voided│◄────│  voided  │◄────────────┘
└─────────┘     └──────┘     └──────────┘

States:
- created: Envelope created, not yet sent
- sent: Signing invitations sent to all recipients
- in_progress: At least one recipient has signed
- completed: All required signatures collected, certificate generated
- voided: Cancelled by sender or expired
```

### 5.2 Business Entity State Integration

| Module | Entity | E-Sign Trigger | On Completion |
|--------|--------|----------------|---------------|
| Property Mgmt | Tenancy | `status = active` | `is_signed = true`, `signed_lease_url` populated |
| Valuation | Report | `status = approved` | `client_acknowledged = true` |
| CRM | Deal | Stage with `trigger_esign = true` | Stage auto-advances, document linked |
| Project Mgmt | ChangeOrder | `status = approved` | `status = executed`, impacts applied |

---

## 6. Webhook & Callback System

### 6.1 Completion Webhook Payload

```json
{
  "event": "envelope.completed",
  "timestamp": "2026-01-30T12:00:00Z",
  "envelope": {
    "id": "uuid",
    "subject": "Lease Agreement - 123 Main St",
    "completedAt": "2026-01-30T12:00:00Z"
  },
  "sourceContext": {
    "module": "property_management",
    "entityType": "tenancy",
    "entityId": "uuid"
  },
  "documents": [
    {
      "id": "uuid",
      "name": "Lease Agreement",
      "signedUrl": "https://...",
      "certificateUrl": "https://..."
    }
  ],
  "signers": [
    {
      "email": "tenant@example.com",
      "name": "John Doe",
      "pmtId": "PMT-ABC123DEF456",
      "signedAt": "2026-01-30T11:55:00Z",
      "ipAddress": "192.168.1.1"
    }
  ],
  "security": {
    "hash": "sha256:abc123...",
    "algorithm": "SHA-256",
    "verifyUrl": "https://propmetrik.com/verify/uuid"
  }
}
```

### 6.2 Webhook Handler

Create: `/backend/src/api/webhooks/esign.ts`

```typescript
router.post('/esign/completion', async (req, res) => {
  const event = req.body;
  
  // Verify webhook signature (HMAC)
  if (!verifyWebhookSignature(req)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Route to appropriate service based on sourceContext
  switch (event.sourceContext.module) {
    case 'property_management':
      await tenancyService.handleEsignCompletion(event);
      break;
    case 'valuation':
      await reportService.handleEsignCompletion(event);
      break;
    case 'crm':
      await dealService.handleEsignCompletion(event);
      break;
    case 'project_management':
      await changeOrderService.handleEsignCompletion(event);
      break;
  }
  
  res.status(200).json({ received: true });
});
```

---

## 7. Dual-Mode Support

### 7.1 Standalone E-Sign UI (Existing)

The current e-sign tab at `/e-sign` continues to function for:
- Manual document uploads
- Ad-hoc signature requests
- Documents not originating from system workflows

### 7.2 Programmatic Mode (New)

Business services use `eSignIntegrationService` to:
- Bypass upload steps (documents generated programmatically)
- Bypass manual signer assignment (signers from entity data)
- Auto-populate signature field placements (from templates)
- Link back to source entity on completion

### 7.3 Convergence

Both modes use the same:
- E-sign core service (`/backend/shared-services/e-sign/`)
- Database schema (`esign` schema)
- Certificate generation logic
- Security hash computation
- Audit trail storage

---

## 8. Database Schema Extensions

### 8.1 Add Source Context to Envelopes

```sql
-- Add to esign.envelopes table
ALTER TABLE esign.envelopes ADD COLUMN IF NOT EXISTS source_module VARCHAR(50);
ALTER TABLE esign.envelopes ADD COLUMN IF NOT EXISTS source_entity_type VARCHAR(50);
ALTER TABLE esign.envelopes ADD COLUMN IF NOT EXISTS source_entity_id UUID;
ALTER TABLE esign.envelopes ADD COLUMN IF NOT EXISTS callback_url TEXT;

CREATE INDEX idx_envelopes_source ON esign.envelopes(source_module, source_entity_type, source_entity_id);
```

### 8.2 Add E-Sign References to Business Tables

```sql
-- Property Management
ALTER TABLE tenancies ADD COLUMN IF NOT EXISTS esign_envelope_id UUID;
ALTER TABLE tenancies ADD COLUMN IF NOT EXISTS signed_lease_url TEXT;
ALTER TABLE tenancies ADD COLUMN IF NOT EXISTS lease_signed_at TIMESTAMPTZ;

-- Valuation
ALTER TABLE valuation_reports ADD COLUMN IF NOT EXISTS client_esign_envelope_id UUID;
ALTER TABLE valuation_reports ADD COLUMN IF NOT EXISTS client_acknowledged_at TIMESTAMPTZ;

-- CRM
ALTER TABLE deals ADD COLUMN IF NOT EXISTS current_esign_envelope_id UUID;
ALTER TABLE crm_generated_documents ADD COLUMN IF NOT EXISTS esign_envelope_id UUID;

-- Project Management
ALTER TABLE project_change_orders ADD COLUMN IF NOT EXISTS esign_envelope_id UUID;
ALTER TABLE project_change_orders ADD COLUMN IF NOT EXISTS executed_document_url TEXT;
```

---

## 9. Implementation Phases

### Phase 1: Foundation (Week 1) ✅ COMPLETED
- [x] Create `eSignIntegrationService.ts` → `/backend/src/services/e-sign/eSignIntegrationService.ts`
- [x] Create types and interfaces → `/backend/src/services/e-sign/types.ts`
- [x] Add `/envelopes/create-programmatic` endpoint → `/backend/shared-services/e-sign/api/programmatic.py`
- [x] Add source context fields to envelope schema → `/backend/shared-services/e-sign/init-scripts/05_source_context.sql`
- [x] Update Envelope model with source context columns → `/backend/shared-services/e-sign/models.py`
- [x] Implement webhook registration and delivery → `/backend/shared-services/e-sign/api/webhooks.py`
- [x] Add e-sign webhook handler to TypeScript backend → `/backend/src/routes/webhooks.ts`

### Phase 2: Property Management Integration (Week 2) ✅ COMPLETED
- [x] Modify `tenancyService.activateTenancy()` to trigger e-sign → `/backend/src/services/property-management/leases/tenancyService.ts`
- [x] Add lease template field placement configuration → `lease_template_signature_fields` table
- [x] Implement completion webhook handler for tenancies → `tenancyService.handleEsignCompletion()`
- [x] Create audit trail table for signed leases → `tenancy_document_audit` table
- [x] Add e-sign columns to tenancies table → `esign_envelope_id`, `esign_status`, etc.

### Phase 3: Valuation Integration (Week 3) ✅ COMPLETED
- [x] Modify `approvalService.approveReport()` to trigger client e-sign → `/backend/src/services/valuation-engine/approvalService.ts`
- [x] Add report acknowledgment signature placement → `report_signature_configs` table + `getReportSignatureConfig()` method
- [x] Implement completion handler for reports → `approvalService.handleEsignCompletion()`
- [x] Add e-sign columns to valuation_reports → `client_esign_envelope_id`, `client_esign_status`, `client_acknowledged_at`, `signed_report_url`
- [x] Create report e-sign audit trail → `report_esign_audit` table
- [x] Update webhooks router for valuation module → `/backend/src/routes/webhooks.ts`

### Phase 4: CRM Integration (Week 4) ✅ COMPLETED
- [x] Add `trigger_esign` and `signer_config` to deal stages → `deal_stages` table columns
- [x] Modify `dealService.updateDealStage()` to trigger e-sign → `/backend/src/services/crm-deal-management/dealService.ts`
- [x] Re-implement `signatureService` to use integration service → `/backend/src/services/crm-deal-management/signatureService.ts`
- [x] Add e-sign columns to deals table → `current_esign_envelope_id`, `esign_status`, `esign_triggered_at`, `esign_completed_at`
- [x] Create signer role configuration table → `crm_signer_role_config` table
- [x] Create CRM e-sign audit trail → `crm_esign_audit` table
- [x] Implement `handleEsignCompletion()` webhook handler with auto-stage-advance
- [x] Update webhooks router for CRM module → `/backend/src/routes/webhooks.ts`

### Phase 5: Project Management Integration (Week 5) ✅ COMPLETED
- [x] Modify `changeOrderService` for e-sign integration → `/backend/src/services/project-management/changeOrderService.ts`
  - Added `checkAndTriggerEsign()` called after `approve()` method
  - Added `triggerChangeOrderEsign()` to create envelope via eSignIntegrationService
  - Added `handleEsignCompletion()` webhook handler with auto-execute on completion
  - Added signer resolution for project_manager, owner_representative, contractor roles
- [x] Add e-sign to contractor contract workflow → `/backend/src/services/project-management/contractorService.ts`
  - Added `triggerContractEsign()` for manual contract signing trigger
  - Added `handleEsignCompletion()` webhook handler
  - Added signer resolution for project owner and contractor representative
  - Updates assignment with `signed_contract_url` and `contract_status = 'signed'`
- [x] Add e-sign to draw request approval → `/backend/src/services/project-management/drawService.ts`
  - Added `checkAndTriggerEsign()` called after `approve()` method
  - Added `triggerDrawEsign()` to create envelope via eSignIntegrationService
  - Added `handleEsignCompletion()` webhook handler with optional auto-fund
  - Added signer resolution for project_owner, general_contractor, lender_representative
- [x] Database migration → `/backend/database/migrations/20260130_add_esign_to_project_management.sql`
  - Added e-sign columns to `change_orders` table
  - Added e-sign columns to `project_contractor_assignments` table
  - Added e-sign columns to `draw_requests` table
  - Created `change_order_esign_config` table for org-level configuration
  - Created `contractor_contract_esign_config` table
  - Created `draw_request_esign_config` table
  - Created `project_esign_audit` table for audit trail
  - Created `project_signer_role_config` table
- [x] Update webhooks router → `/backend/src/routes/webhooks.ts`
  - Added full project_management case handling
  - Routes to changeOrderService, contractorService, drawService based on entityType
- [x] Add e-sign event types → `/backend/src/services/project-management/events/EventBus.ts`
  - Added `CONTRACTOR_CONTRACT_SIGNED`, `DRAW_ESIGN_COMPLETED`, `CHANGE_ORDER_ESIGN_COMPLETED`

---

## 10. Constraints & Guidelines

### 10.1 DO NOT

- ❌ Duplicate signing logic across services
- ❌ Require UI navigation to e-sign tabs for workflow-triggered documents
- ❌ Weaken audit or certificate standards for programmatic envelopes
- ❌ Allow business services to directly call e-sign HTTP endpoints
- ❌ Store signed documents only in e-sign storage (copy back to source)

### 10.2 DO

- ✅ Use `eSignIntegrationService` as the ONLY interface for business services
- ✅ Maintain complete audit trail for all envelopes
- ✅ Generate Certificate of Completion for ALL completed envelopes
- ✅ Store signed documents back in source entity record
- ✅ Support both programmatic and manual e-sign modes
- ✅ Use permanent signer IDs (PMT-XXXX) consistently

---

## 11. Appendix: Service File Locations

| Service | Path | Key Methods to Modify |
|---------|------|----------------------|
| E-Sign Integration | `/backend/src/services/e-sign/eSignIntegrationService.ts` | NEW |
| Tenancy Service | `/backend/src/services/property-management/leases/tenancyService.ts` | `activateTenancy()` |
| Lease Template Service | `/backend/src/services/property-management/leases/leaseTemplateService.ts` | `generateLease()` |
| Approval Service | `/backend/src/services/valuation-engine/approvalService.ts` | `approveReport()` |
| Report Service | `/backend/src/services/valuation-engine/reportService.ts` | `generateReport()` |
| Deal Service | `/backend/src/services/crm-deal-management/dealService.ts` | `updateDealStage()` |
| Signature Service | `/backend/src/services/crm-deal-management/signatureService.ts` | REFACTOR to use integration |
| Document Generation | `/backend/src/services/crm-deal-management/documentGenerationService.ts` | `generate()` |
| Change Order Service | `/backend/src/services/project-management/changeOrderService.ts` | `approveChangeOrder()` |
| Contractor Service | `/backend/src/services/project-management/contractorService.ts` | Contract assignment |
| Draw Service | `/backend/src/services/project-management/drawService.ts` | `approveDraw()` |

---

## 12. Summary

This architecture transforms e-sign from a standalone UI into a **headless capability** that business services can invoke programmatically. The key principle is:

> **E-sign is a headless capability triggered by domain events.**

Users never need to navigate to the e-sign tab for workflow-generated documents. The system automatically:
1. Generates the document from templates
2. Creates an envelope with appropriate signers
3. Places signature fields at configured locations
4. Sends signing invitations
5. Collects signatures
6. Generates Certificate of Completion
7. Stores signed document back in source entity
8. Updates source entity status

The standalone e-sign UI remains for manual, ad-hoc signing needs.
