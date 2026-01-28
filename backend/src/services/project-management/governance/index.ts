/**
 * Governance Module - Barrel Export
 * 
 * Phase 1: Enterprise Governance Model
 * 
 * This module provides the enterprise governance layer for project management:
 * - MilestoneFrameworkService: Admin defines organizational standards
 * - ApprovalService: PM requests changes, Admin/Client approves
 * - ComplianceCheckpointService: Regulatory and internal compliance gates
 * 
 * @module services/project-management/governance
 */

// =============================================================================
// MILESTONE FRAMEWORK SERVICE
// =============================================================================

export {
  milestoneFrameworkService,
  type MilestoneFramework,
  type FrameworkPhase,
  type MilestoneTemplate,
  type CreateFrameworkInput,
  type CreatePhaseInput,
  type CreateMilestoneTemplateInput,
  type ApplyFrameworkInput,
} from './MilestoneFrameworkService';

// =============================================================================
// APPROVAL SERVICE
// =============================================================================

export {
  approvalService,
  type ApprovalRequest,
  type ApprovalComment,
  type ApprovalRequestType,
  type ApprovalPriority,
  type CreateApprovalRequestInput,
  type ReviewApprovalInput,
  type ApprovalRequestFilters,
} from './ApprovalService';

// =============================================================================
// COMPLIANCE CHECKPOINT SERVICE
// =============================================================================

export {
  complianceCheckpointService,
  type ComplianceCheckpoint,
  type CheckpointStatus,
  type CreateCheckpointInput,
  type UpdateCheckpointInput,
  type VerifyCheckpointInput,
  type CheckpointFilters,
  type ComplianceSummary,
  GHANA_COMPLIANCE_TYPES,
} from './ComplianceCheckpointService';
