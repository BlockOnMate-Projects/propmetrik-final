/**
 * Project Management Service - Module Index
 * Phase 5.8: Development Project Management
 * Phase 1: Data Hub Integration & Wizard
 * 
 * Standalone service for real estate development project management.
 * Inspired by: Procore, Buildertrend, CoConstruct
 * 
 * This module provides:
 * - Development project lifecycle management
 * - Phase & milestone tracking
 * - Unit sales & management
 * - Budget & cost tracking (with multi-currency support)
 * - Contractor management
 * - Draw request processing
 * - Daily construction logs
 * - Payment plan management
 * - Punch list tracking
 * - CRM integration
 * - Ghana-specific location validation (via Data Hub)
 * - Multi-step project creation wizard
 * - Permit tracking
 * - Enterprise governance (frameworks, approvals, compliance)
 * - Ghana regulatory compliance (EPA, Lands Commission, GRA, SSNIT)
 * 
 * @module services/project-management
 */

// =============================================================================
// NEW ARCHITECTURE MODULES (Phase 0-4 Refactoring)
// =============================================================================

// Base infrastructure
export * from './types';
export * from './errors';
export * from './events';

// Enterprise Governance (Phase 1)
export * from './governance';

// Site Operations (Phase 2 - replaces dailyLogService, siteDiaryService, constructionOpsService)
export * from './operations';

// Financial Aggregator (Phase 2)
export * from './financial';

// Ghana Compliance (Phase 4)
export * from './compliance';

// Ghana Payments (Phase 4)
export * from './payments';

// Analytics (Phase 3.1 - replaces dashboardAnalyticsService)
export * from './analytics';

// Messaging (Phase 3.2 - replaces whatsappBotService)
export * from './messaging';

// Quality (Phase 3.3 - replaces qualityChecklistsService)
export * from './quality';

// Team (Phase 3.4 - replaces teamService)
export * from './team';

// Location (Phase 3.5 - replaces projectLocationService)
export * from './location';

// Scheduling (Phase 3.6 - replaces ganttService)
export * from './scheduling';

// Photos (Phase 3.7 - replaces photoService)
export * from './photos';

// Change Orders (Phase 3.8 - replaces changeOrderService)
export * from './change-orders';

// Compliance Reports (Phase 3.9 - replaces complianceReportService)
export * from './compliance-reports';

// Documents (Phase 3.10 - replaces projectDocumentService)
export * from './documents';

// Projects (Phase 3.11 - replaces projectService)
export * from './projects';

// Units (Phase 3.12 - replaces unitService)
export * from './units';

// RFIs (Phase 3.13 - replaces rfiService)
export * from './rfis';

// =============================================================================
// RESOLVE RE-EXPORT AMBIGUITY (TS2308)
// When multiple modules export the same name via `export *`, TypeScript requires
// an explicit re-export to resolve the ambiguity.
// =============================================================================
export { EventPayload } from './types';
export { MobileMoneyProvider } from './types';
export { PaginationParams } from './types';
export { ChangeOrderStatus, ChangeOrderType } from './types';
export { ComplianceSummary } from './governance';
export { Attachment } from './change-orders';

// =============================================================================
// CORE PROJECT SERVICES
// =============================================================================

// Core Project Services
/**
 * @deprecated Use projectsFacade or individual services from './projects' instead.
 * The monolithic service has been split into focused services.
 */
export { default as projectService } from './projectService';
export { default as phaseService } from './phaseService';
/**
 * @deprecated Use unitsFacade or individual services from './units' instead.
 * The monolithic service has been split into focused services.
 */
export { default as unitService } from './unitService';

// Financial Services
export { default as projectCostService } from './projectCostService';
export { default as drawService } from './drawService';
export { default as paymentPlanService } from './paymentPlanService';

// Operations Services
export { default as contractorService } from './contractorService';
/**
 * @deprecated Use siteOperationsService from './operations' instead.
 */
export { default as dailyLogService } from './dailyLogService';
export { default as punchListService } from './punchListService';

// Integration Services
export { default as projectIntegrationService } from './projectIntegrationService';

// Phase 1: Data Hub Integration Services
export { default as projectLocationService } from './projectLocationService';

export { default as projectCostCurrencyService } from './projectCostCurrencyService';

export { default as projectWizardService } from './projectWizardService';

// Configuration & Defaults
export * as projectDefaults from './projectDefaults';

// Type exports
export type {
  ProjectType,
  ProjectStatus,
  DevelopmentProject,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectFilters,
  ProjectStats,
  ProjectSummary
} from './projectService';

export type {
  PhaseStatus,
  Milestone,
  ProjectPhase
} from './phaseService';

export type {
  UnitStatus,
  UnitType,
  UnitUpgrade,
  ProjectUnit
} from './unitService';

export type {
  CostCategory,
  CostStatus,
  ProjectCost
} from './projectCostService';

export type {
  ContractorStatus,
  Contractor
} from './contractorService';

// Phase 1: Location Service Types
export type {
  LocationValidationInput,
  LocationValidationResult,
  CreateProjectWithLocationInput,
  EnrichedProjectData,
} from './projectLocationService';

// Phase 1: Currency Service Types
export type {
  SupportedCurrency,
  CurrencyAmount,
  ConvertedBudget,
  MultiCurrencyBudgetSummary,
  CostEstimateInput,
  CostBreakdown,
  ProjectCostEstimate,
} from './projectCostCurrencyService';

// Phase 1: Wizard Service Types
export type {
  WizardStep,
  DraftStatus,
  ProjectDraft,
  StepData,
  Step1Data,
  Step2Data,
  Step3Data,
  Step4Data,
  Step5Data,
  ValidationResults,
  StepValidation,
  CreateDraftInput,
  UpdateDraftInput,
  WizardTemplate,
} from './projectWizardService';

// Phase 1: Defaults Types
export type {
  GhanaRegionCode,
  LandTenureType,
  ProjectTypeCode,
  CostCategoryCode,
  PhaseTemplate,
} from './projectDefaults';

// Phase 3: Compliance & Document Services
export { complianceService } from './complianceService';
export { projectDocumentService } from './projectDocumentService';

// Phase 3: Compliance Types
export type {
  PermitType,
  PermitStatus,
  InspectionResult,
  ProjectPermit,
  PermitInspection,
  ComplianceScore,
  RegulatoryAuthority,
  RegulatoryTemplate,
  CreatePermitInput,
  UpdatePermitInput,
  CreateInspectionInput,
  UpdateInspectionInput,
  PermitFilters,
} from './complianceService';

// Phase 3: Document Types
export type {
  DocumentType,
  AccessLevel,
  ProjectFolder,
  ProjectDocument,
  DocumentVersion,
  DocumentTemplate,
  DocumentShare,
  CreateFolderInput,
  UpdateFolderInput,
  CreateDocumentInput,
  UpdateDocumentInput,
  UploadNewVersionInput,
  CreateShareInput,
  DocumentFilters,
} from './projectDocumentService';
