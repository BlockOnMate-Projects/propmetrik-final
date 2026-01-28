/**
 * Change Orders Module - Type Definitions
 * 
 * Phase 3.8: Split changeOrderService (1203 lines)
 * 
 * Shared types for change order management:
 * - Change order statuses and reasons
 * - Item and signature types
 * - Filter and stats interfaces
 * 
 * @module services/project-management/change-orders/types
 */

// =============================================================================
// ENUMS
// =============================================================================

export type ChangeOrderStatus = 
  | 'draft'
  | 'pending_review'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'void';

export type ChangeOrderReason = 
  | 'scope_change'
  | 'design_error'
  | 'unforeseen_conditions'
  | 'owner_request'
  | 'regulatory_requirement'
  | 'value_engineering'
  | 'schedule_acceleration'
  | 'material_substitution'
  | 'force_majeure'
  | 'other';

export type ChangeOrderType = 'additive' | 'deductive' | 'no_cost' | 'time_extension';

export type ItemType = 'labor' | 'material' | 'equipment' | 'subcontractor' | 'overhead' | 'fee' | 'other';

export type ApprovalAction = 'submit' | 'request_approval' | 'sign' | 'approve' | 'reject' | 'execute' | 'void';

// =============================================================================
// CORE INTERFACES
// =============================================================================

export interface ChangeOrderItem {
  id?: string;
  changeOrderId?: string;
  description: string;
  itemType: ItemType;
  quantity: number;
  unit: string;
  unitCost: number;
  markupPercentage: number;
  totalCost?: number;
  costCode?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChangeOrderSignature {
  id?: string;
  changeOrderId?: string;
  signatoryRole: string;
  signatoryName?: string;
  signatoryUserId?: string;
  isRequired: boolean;
  signed: boolean;
  signedAt?: string;
  signatureData?: string;
  comments?: string;
  signatureOrder?: number;
}

export interface Attachment {
  id: string;
  filename: string;
  url: string;
  type: string;
  size: number;
  uploadedAt: string;
  uploadedBy?: string;
}

export interface ChangeOrder {
  id: string;
  organizationId: string;
  projectId: string;
  coNumber: string;
  revisionNumber: number;
  title: string;
  description: string;
  reason: ChangeOrderReason;
  reasonDetails?: string;
  coType: ChangeOrderType;
  status: ChangeOrderStatus;
  originalContractAmount: number;
  previousChangesAmount: number;
  thisChangeAmount: number;
  newContractAmount: number;
  currency: string;
  originalCompletionDate?: string;
  scheduleImpactDays: number;
  newCompletionDate?: string;
  submittedBy?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  executedBy?: string;
  executedAt?: string;
  phaseId?: string;
  relatedRfiId?: string;
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface ChangeOrderWithDetails extends ChangeOrder {
  projectName?: string;
  projectNumber?: string;
  submittedByName?: string;
  approvedByName?: string;
  executedByName?: string;
  phaseName?: string;
  relatedRfiNumber?: string;
  items?: ChangeOrderItem[];
  signatures?: ChangeOrderSignature[];
  pendingSignatures?: number;
  history?: ChangeOrderHistoryEntry[];
}

export interface ChangeOrderHistoryEntry {
  id: string;
  changeOrderId: string;
  action: ApprovalAction | string;
  previousStatus?: ChangeOrderStatus;
  newStatus?: ChangeOrderStatus;
  fieldChanges?: Record<string, { old: any; new: any }>;
  comment?: string;
  performedBy?: string;
  performedByName?: string;
  performedAt: string;
}

// =============================================================================
// INPUT INTERFACES
// =============================================================================

export interface CreateChangeOrderInput {
  organizationId: string;
  projectId: string;
  title: string;
  description: string;
  reason: ChangeOrderReason;
  reasonDetails?: string;
  coType?: ChangeOrderType;
  originalContractAmount: number;
  previousChangesAmount?: number;
  originalCompletionDate?: string;
  scheduleImpactDays?: number;
  phaseId?: string;
  relatedRfiId?: string;
  attachments?: Attachment[];
  items?: ChangeOrderItem[];
  signatures?: ChangeOrderSignature[];
  createdBy?: string;
}

export interface UpdateChangeOrderInput {
  title?: string;
  description?: string;
  reason?: ChangeOrderReason;
  reasonDetails?: string;
  coType?: ChangeOrderType;
  scheduleImpactDays?: number;
  phaseId?: string;
  relatedRfiId?: string;
  attachments?: Attachment[];
  updatedBy?: string;
}

export interface ChangeOrderFilters {
  organizationId?: string;
  projectId?: string;
  status?: ChangeOrderStatus | ChangeOrderStatus[];
  reason?: ChangeOrderReason | ChangeOrderReason[];
  coType?: ChangeOrderType | ChangeOrderType[];
  submittedBy?: string;
  approvedBy?: string;
  phaseId?: string;
  createdFrom?: string;
  createdTo?: string;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// =============================================================================
// IMPACT ANALYSIS
// =============================================================================

export interface ScheduleImpact {
  originalCompletionDate: string | null;
  impactDays: number;
  newCompletionDate: string | null;
  affectedPhases: Array<{
    phaseId: string;
    phaseName: string;
    currentEndDate: string;
    newEndDate: string;
    delayDays: number;
  }>;
  affectedMilestones: Array<{
    milestoneId: string;
    milestoneName: string;
    currentDate: string;
    newDate: string;
    delayDays: number;
  }>;
  criticalPathImpact: boolean;
}

export interface CostImpact {
  originalContractAmount: number;
  previousChangesAmount: number;
  thisChangeAmount: number;
  newContractAmount: number;
  percentageChange: number;
  budgetRemaining: number;
  contingencyUsed: number;
  contingencyRemaining: number;
  byCategory: Record<ItemType, number>;
}

export interface ImpactAnalysis {
  changeOrderId: string;
  schedule: ScheduleImpact;
  cost: CostImpact;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
  analyzedAt: string;
}

// =============================================================================
// STATISTICS
// =============================================================================

export interface ChangeOrderStats {
  total: number;
  byStatus: Record<ChangeOrderStatus, number>;
  byReason: Record<ChangeOrderReason, number>;
  byType: Record<ChangeOrderType, number>;
  totalAdditions: number;
  totalDeductions: number;
  netChange: number;
  avgProcessingDays: number;
  pendingApproval: number;
  totalScheduleImpactDays: number;
}

// =============================================================================
// APPROVAL WORKFLOW
// =============================================================================

export interface ApprovalChainConfig {
  projectId: string;
  thresholds: Array<{
    minAmount: number;
    maxAmount: number;
    requiredSignatures: Array<{
      role: string;
      required: boolean;
      order: number;
    }>;
  }>;
}

export interface SignatureRequest {
  changeOrderId: string;
  signatureId: string;
  userId: string;
  signatureData?: string;
  comments?: string;
}
