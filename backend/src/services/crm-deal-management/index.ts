/**
 * CRM & Deal Management Service - Module Index
 * Phase 5.2: CRM Service Layer
 * 
 * Central export point for all CRM services.
 * This module provides a unified interface for:
 * - Contact management
 * - Company management
 * - Deal lifecycle management
 * - Pipeline configuration
 * - Activity tracking (audit log)
 * - Task management
 * - Note management
 * - Document management
 * - E-Signature integration
 * 
 * @module services/crm-deal-management
 */

// Core Services
export { contactService, ContactService } from './contactService';
export { companyService, CompanyService } from './companyService';
export { dealService, DealService } from './dealService';
export { pipelineService, PipelineService } from './pipelineService';
export { pipelineValidator } from './pipelineValidator';
export { agentService, AgentService } from './agentService';

// Activity & Audit
export { activityService, ActivityService } from './activityService';

// Task & Notes
export { taskService, TaskService } from './taskService';
export { noteService, NoteService } from './noteService';

// Document & Signature
export { crmDocumentService, CrmDocumentService } from './crmDocumentService';
export { signatureService, SignatureService } from './signatureService';

// Data Hub Sync (Phase 5.6)
export { crmPropertySyncService, CrmPropertySyncService } from './crmPropertySyncService';

// Commission & Targets (Phase 5.7)
export { commissionService } from './commissionService';
export { targetService } from './targetService';

// Project Management (Phase 5.8)
export { default as projectService } from './project-management/projectService';
export { default as phaseService } from './project-management/phaseService';
export { default as unitService } from './project-management/unitService';
export { default as projectCostService } from './project-management/projectCostService';
export { default as contractorService } from './project-management/contractorService';
export { default as drawService } from './project-management/drawService';
export { default as dailyLogService } from './project-management/dailyLogService';
export { default as paymentPlanService } from './project-management/paymentPlanService';
export { default as punchListService } from './project-management/punchListService';
export { default as projectIntegrationService } from './project-management/projectIntegrationService';

// Types
export * from './types';

// Re-export specific types from services for convenience
export type { CompanyFilters } from './companyService';
export type { 
    CreatePipelineInput, 
    UpdatePipelineInput, 
    CreateStageInput, 
    UpdateStageInput, 
    PipelineWithStages 
} from './pipelineService';
export type { TaskFilters } from './taskService';
export type { NoteFilters, UpdateNoteInput } from './noteService';
export type { 
    DocumentType, 
    CrmDocument, 
    CreateDocumentInput, 
    UpdateDocumentInput, 
    DocumentFilters 
} from './crmDocumentService';
export type { 
    SignatureStatus, 
    SignatureEnvelope, 
    SignerInfo, 
    CreateSignatureEnvelopeInput, 
    SignatureEnvelopeFilters 
} from './signatureService';

/**
 * CRM Module Summary:
 * 
 * Architecture Placement:
 * /backend/src/services/crm-deal-management/
 * 
 * Database Tables Used:
 * - contacts: Individual contacts, leads, customers
 * - companies: Corporate entities
 * - deals: Real estate transactions
 * - deal_pipelines: Configurable sales pipelines
 * - deal_stages: Pipeline stages with transition rules
 * - deal_activities: Immutable activity/audit log
 * - tasks: Task management (polymorphic)
 * - notes: Notes (polymorphic)
 * - documents: Document storage with versioning
 * - signature_envelopes: E-signature tracking
 * 
 * Integration Points:
 * - Shared E-Sign Service: /backend/shared-services/e-sign/
 * - Data Hub: /backend/src/services/data-hub/
 * - MinIO: Document storage
 * 
 * Security Features:
 * - Organization-scoped queries
 * - Soft deletes on all entities
 * - Immutable activity log
 * - Row-level access control
 * 
 * Key Design Decisions:
 * 1. Deals can have multiple properties and contacts
 * 2. Pipelines are fully configurable per organization
 * 3. Stage transitions are validated server-side
 * 4. Activities are append-only (never updated/deleted)
 * 5. Documents support versioning
 * 6. E-signatures are tracked via shared service integration
 */
