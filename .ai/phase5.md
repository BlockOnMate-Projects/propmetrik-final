PROPMETRIK Phase 5: CRM & Deal Management Service Implementation Plan
Executive Summary
This plan details the complete implementation of PROPMETRIK's CRM & Deal Management Service as outlined in the predefined architecture. This service is designed as a production-grade, institutional real estate CRM with data integrity, auditability, and long-lived record management at its core.

Architecture Alignment
Service Positioning
PROPMETRIK follows a monolithic backend with service-segmented architecture:

api.propmetrik.com (Single Backend)
        |
-------------------------------------------------
|                  |                  |
valuation           management          crm
(Phase 3)           (Phase 4)         (Phase 5)
Key Architectural Principles:

Same authentication system - Leverages shared Keycloak auth
Same organization model - Organization-scoped at DB level
Same user identities - Unified user management
Clean module boundaries - No duplication of existing services
Shared services integration - E-sign, notifications, payments
Backend Stack (Non-Negotiable)
Framework: NestJS (mandatory for Guards, Policies, DTOs)
Language: TypeScript
ORM: Prisma (strict typing, explicit migrations)
Database: PostgreSQL with explicit migrations
Validation: Zod for DTOs
Why: Modular architecture, Policy-based access, Enterprise scalability
Data Integrity Requirements
This is an operational system of record for:

Multi-year real estate deals
Multi-stakeholder transactions
Legal compliance and audit trails
Document lifecycle management
Commission calculations
Core Domain Model
1. Required Entities
Organization & User (Reuse Existing)
✅ Organizations table (existing)
✅ Users table (existing)
✅ Keycloak auth (existing)
CRM Core Entities (New - Phase 5)
Contact

Personal information (name, demographics)
Contact details (phone, WhatsApp, email)
Location (Ghana Post GPS, region)
Professional info (occupation, income range)
Real estate profile (buyer type, budget, preferences)
Lead scoring and qualification
Soft delete support
Company

Company profile for corporate buyers/developers
Industry classification
Company size and type
Multiple contact associations
Relationship to deals
Deal

Deal identification (auto-generated numbers)
Primary/secondary contacts
Property associations (link to properties DB)
Deal type (sale, rental, JV, land acquisition)
Deal stage (configurable pipeline)
Financial tracking (value, commission)
Probability and forecasting
UTM and campaign attribution
Timeline and performance metrics
DealStage

Stage definition and ordering
Stage-specific requirements
Validation rules per stage
SLA and duration tracking
DealPipeline

Organization-specific pipeline configuration
Custom stage definitions
Stage transition rules
Different pipelines per deal type
Activity (Immutable Timeline)

Activity type (call, email, WhatsApp, meeting, viewing)
Who performed the action
When it happened (timestamp)
What changed (state diff)
Linked documents
Next action reminders
Immutable - no updates, only inserts
Task

Task definition and assignment
Due dates and priorities
Task status tracking
Task dependencies
Recurring task support
Note

Free-form notes
Attachments support
Mentions and tags
Associated entity (deal, contact, property)
Document

Document metadata
MinIO storage links
Document type classification
Version history
Document tags and categories
Property (Reference Existing)

Do not duplicate - use existing properties table
Link deals to existing property_id
Sync property inquiries to CRM
SignatureEnvelope (Use Shared E-Sign)

Links to shared e-sign service
Tracks signing status
Associates with deal and document
Stores signer information
2. Relationships & Rules
Key Business Rules:

✅ A deal can have multiple properties (e.g., portfolio purchases)
✅ A deal can have multiple contacts (buyer, seller, agent, lawyer)
✅ A deal can have multiple owners/agents (team-based selling)
✅ Deals span long timelines (months to years)
✅ State transitions must be validated server-side
✅ All changes are audited via activity log
✅ Documents are immutable once signed
Organization Scoping:

All entities are scoped to organization_id
DB-level row security
No cross-organization data leakage
Configurable Pipeline & Workflow Engine
Critical: No Hardcoded Stages
Build configurable pipelines per organization with enforced transitions.

Pipeline Configuration Model
DealPipeline {
  organization_id
  pipeline_name (e.g., "Land Acquisition Pipeline")
  pipeline_type (sale, rental, jv, land_acquisition)
  stages[] (ordered)
  is_active
}
DealStage {
  pipeline_id
  stage_name
  stage_order
  color
  requirements[] (e.g., "Property viewing completed")
  allowed_next_stages[]
  auto_transition_rules
}
Default Ghana Real Estate Stages
Sales Pipeline:

Lead → Under Review → Property Shortlist → Viewing Scheduled → 
Viewing Completed → Offer Preparation → Offer Submitted → 
Offer Negotiation → Offer Accepted → Due Diligence → 
Title Search → Property Inspection → Valuation → 
Financing Application → Financing Approved → 
Legal Documentation → Contract Review → Contract Signing → 
Payment Schedule → Payment in Progress → Closing → 
Keys Handover → Deal Won / Deal Lost
Rental Pipeline:

Inquiry → Qualified Tenant → Viewing → Application Submitted → 
Tenant Screening → Reference Check → Lease Negotiation → 
Advance Payment → Lease Signing → Move-In → Active / Rejected
Backend Validation Engine
class PipelineValidator {
  async validateStageTransition(
    deal: Deal, 
    newStage: DealStage
  ): Promise<ValidationResult> {
    // 1. Check if transition is allowed
    // 2. Validate requirements met
    // 3. Enforce business rules
    // 4. Return errors or proceed
  }
}
Server-side rejection of invalid transitions is mandatory.

Activity & Audit Log
Immutable Activity Timeline
Every deal must have:

Immutable activity timeline
Who performed the action (user_id)
When it happened (timestamp)
What changed (old_value, new_value)
Linked documents (document_ids[])
Activity type (call, email, stage_change, etc.)
Implementation
CREATE TABLE deal_activities (
  id UUID PRIMARY KEY,
  deal_id UUID NOT NULL,
  user_id UUID NOT NULL,
  activity_type VARCHAR(50) NOT NULL,
  description TEXT,
  old_value JSONB,
  new_value JSONB,
  documents JSONB, -- array of document metadata
  created_at TIMESTAMP NOT NULL,
  
  -- NO updated_at, NO soft delete
  -- IMMUTABLE RECORD
);
No updates allowed - activities are append-only logs.

Document & E-Sign Integration
Shared E-Sign Service Integration
PROPMETRIK uses its own e-signature capability via shared services.

Shared E-Sign Service Responsibilities
Located at: backend/shared-services/e-sign/

Store PDFs in MinIO
Hash documents before signing
Create signing envelopes
Track signer identity
Capture consent and timestamps
Maintain immutable audit logs
Bind signatures to user accounts
Security Requirements
User already authenticated (Keycloak)
Session-bound signing
Email + OTP verification
Anti-replay protection
Timestamping
Document hash verification
IP and user agent capture
CRM Integration Points
CRM creates document → Uploads to MinIO
CRM requests signature → Calls shared e-sign service API
E-Sign service handles signing workflow → OTP, consent, signature capture
E-Sign callback → CRM receives signed document URL
CRM links signed document to:
Deal
Organization
Contact (signer)
Activity log
Document Types (Ghana Real Estate)
Freehold/Leasehold Sale Agreements
Stool Land Sale Agreements
Residential/Commercial Lease Agreements
Power of Attorney
Deed of Assignment
Indenture
Memorandum of Understanding (MOU)
Offer Letters
Receipt Acknowledgments
All signed documents are immutable and linked to audit trail.

Auth, Roles & Permissions
Shared Authentication System
✅ Keycloak (existing setup)
✅ JWT tokens
✅ Organization-based scoping
Role Definitions
Roles:

Admin - Full access
Deal Manager - Create/edit deals, assign tasks
Analyst - Read-only analytics
External Partner - Limited read-only (e.g., lawyers, banks)
Policy-Based Access (NestJS Guards)
@UseGuards(JwtAuthGuard, PoliciesGuard)
@CheckPolicies((ability: AppAbility) => 
  ability.can(Action.Update, 'Deal')
)
async updateDeal(@Param('id') id: string, @Body() dto: UpdateDealDto) {
  // NestJS guard enforces permission
}
Rules:

Policy-based access (not role-only)
Deal-level permissions
Organization scoping enforced at DB level
Payments Integration (Decoupled)
CRM may reference:

Booking fees
Option fees
Commission payments
Rules:
Use shared Paystack integration (existing)
Do not tightly couple payments to deals at v1
Payments reference deals, not embedded logic
Deal stores payment_reference_id
Payment service owns payment lifecycle
Search & Filtering
Phase 1: PostgreSQL
Full-text search on contacts, deals
Trigram search for fuzzy matching
GIN indexes on TSVECTOR columns
CREATE INDEX idx_contacts_search 
ON contacts USING GIN (search_vector);
CREATE INDEX idx_deals_search 
ON deals USING GIN (to_tsvector('english', title || ' ' || description));
Phase 2: OpenSearch (Optional)
Defer to future phase if needed.

Events & Notifications
Internal Event Bus
Use NestJS EventEmitter for internal events.

Events:
deal.stage.changed
document.sent
document.signed
task.overdue
activity.created
Consumers:
In-app notifications
Email notifications (shared service)
Audit log
Webhooks (future)
Example:

@OnEvent('deal.stage.changed')
async handleDealStageChange(event: DealStageChangedEvent) {
  // Send notification
  // Log to activity
  // Update metrics
}
Security & Compliance
Mandatory Requirements
Row-level access enforcement

Organization-scoped queries
Guard-based permission checks
Soft deletes

All entities have deleted_at
Never hard delete
Filter WHERE deleted_at IS NULL
Audit logs

Immutable activity table
Track all state changes
Capture user, timestamp, diff
Encryption at rest

PostgreSQL encryption
MinIO server-side encryption
Secrets management

Environment variables
Never commit secrets
Use .env.example for templates
Rate limiting

API throttling
NestJS throttler module
Input sanitization

Zod validation on all DTOs
Parameterized queries (Prisma)
XSS protection
Proposed File Structure
backend/
└── src/
    └── services/
        └── crm-deal-management/
            ├── contacts/
            │   ├── contactService.ts
            │   ├── contactRepository.ts
            │   ├── dto/
            │   │   ├── create-contact.dto.ts
            │   │   ├── update-contact.dto.ts
            │   │   └── query-contact.dto.ts
            │   └── contact.types.ts
            ├── companies/
            │   ├── companyService.ts
            │   ├── companyRepository.ts
            │   └── dto/
            ├── deals/
            │   ├── dealService.ts
            │   ├── dealRepository.ts
            │   ├── dealPipelineService.ts
            │   ├── dealStageValidator.ts
            │   ├── dto/
            │   │   ├── create-deal.dto.ts
            │   │   ├── update-deal.dto.ts
            │   │   ├── update-deal-stage.dto.ts
            │   │   └── query-deal.dto.ts
            │   └── deal.types.ts
            ├── activities/
            │   ├── activityService.ts
            │   ├── activityRepository.ts
            │   ├── dto/
            │   │   ├── create-activity.dto.ts
            │   │   └── query-activity.dto.ts
            │   └── activity.types.ts
            ├── tasks/
            │   ├── taskService.ts
            │   ├── taskRepository.ts
            │   └── dto/
            ├── notes/
            │   ├── noteService.ts
            │   └── dto/
            ├── documents/
            │   ├── documentService.ts
            │   ├── documentRepository.ts
            │   ├── documentWorkflowService.ts
            │   └── dto/
            ├── pipelines/
            │   ├── pipelineService.ts
            │   ├── pipelineRepository.ts
            │   ├── pipelineValidator.ts
            │   └── dto/
            ├── analytics/
            │   ├── crmAnalyticsService.ts
            │   └── dto/
            ├── integrations/
            │   ├── esignIntegration.ts
            │   ├── propertyIntegration.ts
            │   ├── dataHubIntegration.ts
            │   └── paymentIntegration.ts
            ├── guards/
            │   ├── deal-ownership.guard.ts
            │   └── crm-policies.guard.ts
            └── events/
                ├── deal.events.ts
                └── activity.events.ts
Database Schema
New Tables for Phase 5
1. contacts
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL, -- scoping
  
  -- Personal info
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  other_names VARCHAR(100),
  
  -- Contact details
  primary_phone VARCHAR(20) NOT NULL,
  whatsapp_number VARCHAR(20),
  email VARCHAR(255),
  
  -- Location
  country_of_residence VARCHAR(100) DEFAULT 'Ghana',
  region VARCHAR(100),
  digital_address VARCHAR(50), -- Ghana Post GPS
  
  -- Professional
  occupation VARCHAR(200),
  monthly_income_range VARCHAR(50),
  
  -- CRM classification
  contact_type VARCHAR(50) NOT NULL, -- buyer, seller, tenant, agent
  lead_source VARCHAR(50),
  lead_status VARCHAR(50) DEFAULT 'new',
  
  -- Scoring
  lead_score INTEGER DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),
  qualification_level VARCHAR(50) DEFAULT 'unqualified',
  
  -- Property interests
  property_interests JSONB,
  budget_min DECIMAL(12,2),
  budget_max DECIMAL(12,2),
  preferred_locations TEXT[],
  
  -- Communication preferences
  preferred_contact_method VARCHAR(20) DEFAULT 'phone',
  preferred_language VARCHAR(20) DEFAULT 'english',
  
  -- Assignment
  assigned_to UUID, -- agent user_id
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP, -- soft delete
  created_by UUID,
  
  -- Search
  search_vector TSVECTOR,
  
  CONSTRAINT fk_organization FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
CREATE INDEX idx_contacts_org ON contacts(organization_id);
CREATE INDEX idx_contacts_assigned ON contacts(assigned_to);
CREATE INDEX idx_contacts_search ON contacts USING GIN (search_vector);
2. companies
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  
  company_name VARCHAR(255) NOT NULL,
  company_type VARCHAR(50), -- developer, investor, corporate
  industry VARCHAR(100),
  company_size VARCHAR(50),
  
  -- Contact
  primary_contact_id UUID, -- references contacts
  phone VARCHAR(20),
  email VARCHAR(255),
  website VARCHAR(255),
  
  -- Location
  address JSONB,
  region VARCHAR(100),
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  created_by UUID,
  
  CONSTRAINT fk_organization FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
3. deal_pipelines
CREATE TABLE deal_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  
  pipeline_name VARCHAR(255) NOT NULL,
  pipeline_type VARCHAR(50) NOT NULL, -- sale, rental, jv, land_acquisition
  description TEXT,
  
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  
  CONSTRAINT fk_organization FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT unique_org_pipeline UNIQUE (organization_id, pipeline_name)
);
4. deal_stages
CREATE TABLE deal_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL,
  
  stage_name VARCHAR(100) NOT NULL,
  stage_order INTEGER NOT NULL,
  stage_color VARCHAR(7), -- hex color
  
  requirements JSONB, -- array of requirements
  allowed_next_stages UUID[], -- array of stage IDs
  
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT fk_pipeline FOREIGN KEY (pipeline_id) REFERENCES deal_pipelines(id) ON DELETE CASCADE,
  CONSTRAINT unique_pipeline_order UNIQUE (pipeline_id, stage_order),
  CONSTRAINT unique_pipeline_name UNIQUE (pipeline_id, stage_name)
);
5. deals
CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  
  -- Identification
  deal_number VARCHAR(50) UNIQUE, -- auto-generated
  title VARCHAR(500) NOT NULL,
  description TEXT,
  
  -- Relationships
  primary_contact_id UUID NOT NULL,
  secondary_contacts UUID[], -- array of contact IDs
  property_ids UUID[], -- array of property IDs (can be multiple)
  company_id UUID,
  
  -- Assignment
  assigned_agent UUID NOT NULL,
  assigned_team UUID,
  
  -- Classification
  deal_type VARCHAR(50) NOT NULL, -- sale, rental, jv, land_acquisition
  pipeline_id UUID NOT NULL,
  stage_id UUID NOT NULL,
  deal_status VARCHAR(50) DEFAULT 'active', -- active, won, lost, archived
  
  -- Financial
  deal_value DECIMAL(15,2),
  commission_amount DECIMAL(12,2),
  commission_percentage DECIMAL(5,2),
  estimated_close_date DATE,
  actual_close_date DATE,
  
  -- Probability
  close_probability INTEGER DEFAULT 50 CHECK (close_probability >= 0 AND close_probability <= 100),
  weighted_value DECIMAL(15,2), -- deal_value * close_probability
  
  -- Attribution
  lead_source VARCHAR(50),
  campaign_source VARCHAR(100),
  utm_data JSONB,
  
  -- Timeline
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  stage_changed_at TIMESTAMP DEFAULT NOW(),
  first_contact_at TIMESTAMP,
  last_activity_at TIMESTAMP,
  
  -- Metrics
  days_in_pipeline INTEGER DEFAULT 0,
  stage_duration INTEGER DEFAULT 0,
  total_activities INTEGER DEFAULT 0,
  
  -- Additional
  tags TEXT[],
  custom_fields JSONB,
  
  created_by UUID,
  
  CONSTRAINT fk_organization FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_primary_contact FOREIGN KEY (primary_contact_id) REFERENCES contacts(id),
  CONSTRAINT fk_pipeline FOREIGN KEY (pipeline_id) REFERENCES deal_pipelines(id),
  CONSTRAINT fk_stage FOREIGN KEY (stage_id) REFERENCES deal_stages(id),
  CONSTRAINT valid_deal_value CHECK (deal_value >= 0)
);
CREATE INDEX idx_deals_org ON deals(organization_id);
CREATE INDEX idx_deals_contact ON deals(primary_contact_id);
CREATE INDEX idx_deals_agent ON deals(assigned_agent);
CREATE INDEX idx_deals_stage ON deals(stage_id);
CREATE INDEX idx_deals_status ON deals(deal_status);
6. deal_activities (Immutable)
CREATE TABLE deal_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL,
  contact_id UUID,
  user_id UUID NOT NULL, -- who performed it
  
  -- Activity details
  activity_type VARCHAR(50) NOT NULL, -- call, email, whatsapp, meeting, viewing, stage_change
  subject VARCHAR(500),
  description TEXT,
  outcome VARCHAR(100),
  
  -- State change tracking
  old_value JSONB,
  new_value JSONB,
  
  -- Timing
  activity_date TIMESTAMP DEFAULT NOW(),
  duration_minutes INTEGER,
  
  -- Follow-up
  next_action VARCHAR(500),
  next_action_date DATE,
  next_action_assigned_to UUID,
  
  -- Documentation
  documents JSONB, -- array of document metadata
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  -- NO updated_at, NO deleted_at
  -- IMMUTABLE
  
  CONSTRAINT fk_deal FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE
);
CREATE INDEX idx_activities_deal ON deal_activities(deal_id);
CREATE INDEX idx_activities_date ON deal_activities(activity_date DESC);
7. tasks
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  
  -- Task details
  title VARCHAR(500) NOT NULL,
  description TEXT,
  task_type VARCHAR(50), -- follow_up, document_request, viewing, etc.
  priority VARCHAR(20) DEFAULT 'medium', -- low, medium, high, urgent
  
  -- Relationships
  deal_id UUID,
  contact_id UUID,
  property_id UUID,
  
  -- Assignment
  assigned_to UUID NOT NULL,
  assigned_by UUID,
  
  -- Status
  task_status VARCHAR(50) DEFAULT 'pending', -- pending, in_progress, completed, cancelled
  
  -- Timing
  due_date DATE,
  completed_at TIMESTAMP,
  
  -- Recurrence
  is_recurring BOOLEAN DEFAULT false,
  recurrence_pattern JSONB,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  created_by UUID,
  
  CONSTRAINT fk_organization FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_tasks_deal ON tasks(deal_id);
CREATE INDEX idx_tasks_due ON tasks(due_date);
8. notes
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  
  -- Content
  content TEXT NOT NULL,
  
  -- Relationships (polymorphic)
  entity_type VARCHAR(50) NOT NULL, -- deal, contact, property, task
  entity_id UUID NOT NULL,
  
  -- Visibility
  is_private BOOLEAN DEFAULT false,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  created_by UUID NOT NULL,
  
  CONSTRAINT fk_organization FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
CREATE INDEX idx_notes_entity ON notes(entity_type, entity_id);
CREATE INDEX idx_notes_created_by ON notes(created_by);
9. documents
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  
  -- Document info
  document_name VARCHAR(255) NOT NULL,
  document_type VARCHAR(100), -- contract, offer_letter, legal_doc, etc.
  file_url VARCHAR(500) NOT NULL, -- MinIO URL
  file_size BIGINT,
  mime_type VARCHAR(100),
  
  -- Relationships (polymorphic)
  entity_type VARCHAR(50), -- deal, contact, property
  entity_id UUID,
  
  -- Versioning
  version INTEGER DEFAULT 1,
  parent_document_id UUID, -- for versioning
  
  -- E-Sign integration
  signature_envelope_id UUID, -- reference to e-sign service
  is_signed BOOLEAN DEFAULT false,
  signed_at TIMESTAMP,
  
  -- Metadata
  tags TEXT[],
  description TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  created_by UUID,
  
  CONSTRAINT fk_organization FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
CREATE INDEX idx_documents_entity ON documents(entity_type, entity_id);
CREATE INDEX idx_documents_type ON documents(document_type);
10. signature_envelopes (Link to E-Sign)
CREATE TABLE signature_envelopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  deal_id UUID,
  document_id UUID NOT NULL,
  
  -- E-sign tracking
  esign_envelope_id UUID, -- from shared e-sign service
  status VARCHAR(50) DEFAULT 'pending', -- pending, sent, signed, declined, expired
  
  -- Signers
  signers JSONB NOT NULL, -- array of {contact_id, email, status, signed_at}
  
  -- Tracking
  sent_at TIMESTAMP,
  completed_at TIMESTAMP,
  expires_at TIMESTAMP,
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID,
  
  CONSTRAINT fk_organization FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_deal FOREIGN KEY (deal_id) REFERENCES deals(id),
  CONSTRAINT fk_document FOREIGN KEY (document_id) REFERENCES documents(id)
);
CREATE INDEX idx_envelopes_deal ON signature_envelopes(deal_id);
CREATE INDEX idx_envelopes_status ON signature_envelopes(status);
API Routes (RESTful Design)
CRM Routes
POST   /api/v1/crm/contacts
GET    /api/v1/crm/contacts
GET    /api/v1/crm/contacts/:id
PUT    /api/v1/crm/contacts/:id
DELETE /api/v1/crm/contacts/:id (soft delete)
POST   /api/v1/crm/companies
GET    /api/v1/crm/companies
GET    /api/v1/crm/companies/:id
POST   /api/v1/crm/deals
GET    /api/v1/crm/deals
GET    /api/v1/crm/deals/:id
PUT    /api/v1/crm/deals/:id
PUT    /api/v1/crm/deals/:id/stage (stage transition)
DELETE /api/v1/crm/deals/:id (soft delete)
GET    /api/v1/crm/deals/:id/activities
POST   /api/v1/crm/deals/:id/activities
POST   /api/v1/crm/tasks
GET    /api/v1/crm/tasks
PUT    /api/v1/crm/tasks/:id
DELETE /api/v1/crm/tasks/:id
POST   /api/v1/crm/notes
GET    /api/v1/crm/notes
DELETE /api/v1/crm/notes/:id
POST   /api/v1/crm/documents
GET    /api/v1/crm/documents
DELETE /api/v1/crm/documents/:id
POST   /api/v1/crm/documents/:id/request-signature
GET    /api/v1/crm/documents/:id/signature-status
GET    /api/v1/crm/pipelines
POST   /api/v1/crm/pipelines
PUT    /api/v1/crm/pipelines/:id
GET    /api/v1/crm/analytics/deals
GET    /api/v1/crm/analytics/agents
GET    /api/v1/crm/analytics/revenue-forecast
Frontend Stack (CRM Dashboard)
Technologies
Framework: Next.js (App Router)
UI: Tailwind CSS + shadcn/ui
State: TanStack Query
Forms: React Hook Form + Zod
Charts: Recharts or Chart.js
Design Requirements
Professional, enterprise-grade design
Align visually with valuation & management modules
Neutral, credible appearance (not flashy)
Server components for heavy lists
Client components only where needed
Key Pages
Dashboard (deals overview, pipeline metrics)
Contacts List & Detail
Companies List & Detail
Deals List & Detail (with Kanban view)
Deal Detail (timeline, activities, documents)
Tasks & Calendar
Analytics & Reports
Pipeline Configuration
Phased Implementation Strategy
Phase 5.1: Core Entities & Services
Deliverables:

Database schema (Prisma migrations)
Contacts service (CRUD)
Companies service (CRUD)
Deals service (CRUD)
Pipeline & Stage management
Basic API routes
Validation:

Create contact via API
Create deal via API
List deals, filter by organization
Phase 5.2: Activity Log & Audit Trail
Deliverables:

Activity service (append-only)
Automatic activity creation on deal changes
Activity timeline API
Event emitters for notifications
Validation:

Stage change creates activity
Activity timeline shows full history
Activities are immutable
Phase 5.3: Document & E-Sign Integration
Deliverables:

Document service (MinIO upload)
E-sign integration (shared service API client)
Signature envelope tracking
Document versioning
Validation:

Upload document to MinIO
Request signature via e-sign service
Receive signed document callback
Link signed doc to deal
Phase 5.4: Tasks & Notes
Deliverables:

Task service (CRUD, assignments)
Task due date notifications
Note service (polymorphic entity links)
Validation:

Create task for deal
Task overdue event fires
Notes attached to deals/contacts
Phase 5.5: Frontend Dashboard
Deliverables:

Next.js pages for CRM
Contacts & Companies UI
Deals List (table + Kanban)
Deal Detail page
Activity timeline component
Document viewer
Task management UI
Validation:

Visual consistency with valuation/management
Server-side rendering for lists
Client-side filtering/search
Mobile-responsive
Phase 5.6: Analytics & Reporting
Deliverables:

CRM analytics service
Deal metrics (conversion rates, pipeline velocity)
Agent performance reports
Revenue forecasting
Validation:

Dashboard shows key metrics
Charts render correctly
Data exports to CSV/PDF
Testing Strategy
Unit Tests
Service layer (all CRUD operations)
Validation logic (stage transitions)
DTO validation (Zod schemas)
Integration Tests
API routes (end-to-end)
Database operations (Prisma)
E-sign integration (mock external service)
E2E Tests (Optional)
Create deal workflow
Document signing workflow
Task assignment workflow
Deployment & Infrastructure
Environment Variables
DATABASE_URL=
REDIS_URL=
MINIO_ENDPOINT=
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=
KEYCLOAK_URL=
ESIGN_SERVICE_URL=
PAYSTACK_SECRET_KEY=
Docker Services
✅ PostgreSQL (existing)
✅ Redis (existing)
✅ MinIO (existing)
✅ Keycloak (existing)
E-Sign Service (shared)
Database Migrations
Use Prisma migrations:

npx prisma migrate dev --name init_crm
npx prisma migrate deploy # production
Seeding (Optional)
Seed default pipelines and stages for Ghana real estate.

Success Criteria
Functional Requirements
✅ Create and manage contacts
✅ Create and manage companies
✅ Create deals with multiple properties
✅ Configurable pipelines per organization
✅ Server-side stage validation
✅ Immutable activity log
✅ Document upload and e-sign
✅ Task management
✅ Notes and collaboration
✅ Analytics and reporting
Non-Functional Requirements
✅ Organization-scoped data access
✅ Soft delete for all entities
✅ Audit trail for all changes
✅ API response time <500ms
✅ Database query optimization (indexes)
✅ TypeScript strict mode
✅ Zod validation on all inputs
✅ NestJS guards for permissions
Compliance Requirements
✅ GDPR-compliant data handling
✅ Encryption at rest
✅ Secrets management
✅ Rate limiting
✅ Input sanitization
Risk Management
Risk	Impact	Mitigation
E-sign integration breaks	High	Comprehensive error handling, fallback to manual signing
Pipeline validation too rigid	Medium	Allow admin override with audit log
Performance issues with large datasets	High	Database indexes, query optimization, pagination
Auth/permissions misconfigured	Critical	Thorough testing of guards, org-scoping validation
Document storage failures	High	MinIO redundancy, retry logic, error logging
Architectural Conflicts & Clarifications
⚠️ IMPORTANT: Check for Conflicts
Before proceeding, confirm:

Does the existing backend use NestJS or Express?

If Express, migration to NestJS is required per architecture
If NestJS, proceed as planned
Are there existing CRM tables?

The dealService.ts file suggests minimal implementation
Confirm no table conflicts before migration
Is the e-sign service already implemented?

Check backend/shared-services/e-sign/ for existing implementation
Integrate with existing or build if missing
Is Prisma already in use or is it raw SQL?

Check for prisma/schema.prisma
Confirm ORM choice
Next Steps
User approval of this plan
Confirm architectural choices (NestJS vs Express, Prisma vs SQL)
Create Prisma schema for CRM entities
Generate and run migrations
Scaffold service structure (Phase 5.1)
Build and test API routes
Integrate e-sign service
Build frontend dashboard
Testing and validation
Documentation and handover
