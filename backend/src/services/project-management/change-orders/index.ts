/**
 * Change Orders Module
 * 
 * Phase 3.8: Split changeOrderService (1203 lines)
 * 
 * Provides:
 * - ChangeRequestService: CRUD, items management
 * - ChangeApprovalService: Workflow, signatures, status transitions
 * - ChangeImpactService: Impact analysis, trends, forecasting
 * 
 * @module services/project-management/change-orders
 */

// Types
export * from './types';

// Services
export { changeRequestService } from './ChangeRequestService';
export { changeApprovalService } from './ChangeApprovalService';
export { changeImpactService } from './ChangeImpactService';

// =============================================================================
// FACADE (provides backward-compatible interface)
// =============================================================================

import { changeRequestService } from './ChangeRequestService';
import { changeApprovalService } from './ChangeApprovalService';
import { changeImpactService } from './ChangeImpactService';
import {
  ChangeOrderWithDetails,
  ChangeOrderItem,
  CreateChangeOrderInput,
  UpdateChangeOrderInput,
  ChangeOrderFilters,
  ChangeOrderStats,
  ChangeOrderHistoryEntry,
  ChangeOrderSignature,
  SignatureRequest,
  ImpactAnalysis,
} from './types';

/**
 * Change Orders Facade
 * 
 * Provides unified access to all change order functionality.
 * Use this for backward compatibility with changeOrderService.
 */
export class ChangeOrdersFacade {
  // ==========================================================================
  // CRUD (ChangeRequestService)
  // ==========================================================================

  async create(input: CreateChangeOrderInput): Promise<ChangeOrderWithDetails> {
    return changeRequestService.create(input);
  }

  async getById(id: string): Promise<ChangeOrderWithDetails | null> {
    return changeRequestService.getById(id);
  }

  async getAll(filters: ChangeOrderFilters): Promise<{ data: ChangeOrderWithDetails[]; total: number }> {
    return changeRequestService.getAll(filters);
  }

  async update(id: string, input: UpdateChangeOrderInput): Promise<ChangeOrderWithDetails> {
    return changeRequestService.update(id, input);
  }

  async addItems(coId: string, items: ChangeOrderItem[], userId: string): Promise<ChangeOrderItem[]> {
    return changeRequestService.addItems(coId, items, userId);
  }

  async updateItem(itemId: string, item: Partial<ChangeOrderItem>, userId: string): Promise<ChangeOrderItem> {
    return changeRequestService.updateItem(itemId, item, userId);
  }

  async deleteItem(itemId: string): Promise<void> {
    return changeRequestService.deleteItem(itemId);
  }

  async getHistory(coId: string): Promise<ChangeOrderHistoryEntry[]> {
    return changeRequestService.getHistory(coId);
  }

  async getStats(projectId: string): Promise<ChangeOrderStats> {
    return changeRequestService.getStats(projectId);
  }

  // ==========================================================================
  // APPROVAL WORKFLOW (ChangeApprovalService)
  // ==========================================================================

  async submit(id: string, userId: string): Promise<ChangeOrderWithDetails> {
    return changeApprovalService.submit(id, userId);
  }

  async requestApproval(id: string, userId: string): Promise<ChangeOrderWithDetails> {
    return changeApprovalService.requestApproval(id, userId);
  }

  async sign(request: SignatureRequest): Promise<ChangeOrderWithDetails> {
    return changeApprovalService.sign(request);
  }

  async approve(id: string, userId: string, comment?: string): Promise<ChangeOrderWithDetails> {
    return changeApprovalService.approve(id, userId, comment);
  }

  async reject(id: string, userId: string, reason: string): Promise<ChangeOrderWithDetails> {
    return changeApprovalService.reject(id, userId, reason);
  }

  async execute(id: string, userId: string): Promise<ChangeOrderWithDetails> {
    return changeApprovalService.execute(id, userId);
  }

  async void(id: string, userId: string, reason: string): Promise<ChangeOrderWithDetails> {
    return changeApprovalService.void(id, userId, reason);
  }

  async addSignatureRequirement(
    coId: string,
    signature: Omit<ChangeOrderSignature, 'id' | 'changeOrderId' | 'signed' | 'signedAt'>
  ): Promise<ChangeOrderSignature> {
    return changeApprovalService.addSignatureRequirement(coId, signature);
  }

  async removeSignatureRequirement(signatureId: string): Promise<boolean> {
    return changeApprovalService.removeSignatureRequirement(signatureId);
  }

  async getPendingSignatures(coId: string): Promise<ChangeOrderSignature[]> {
    return changeApprovalService.getPendingSignatures(coId);
  }

  async getChangeOrdersPendingSignature(userId: string, projectId?: string): Promise<ChangeOrderWithDetails[]> {
    return changeApprovalService.getChangeOrdersPendingSignature(userId, projectId);
  }

  // ==========================================================================
  // IMPACT ANALYSIS (ChangeImpactService)
  // ==========================================================================

  async analyzeImpact(changeOrderId: string): Promise<ImpactAnalysis> {
    return changeImpactService.analyzeImpact(changeOrderId);
  }

  async getTrends(projectId: string): Promise<{
    monthly: Array<{ month: string; count: number; amount: number }>;
    byReason: Array<{ reason: string; count: number; amount: number }>;
    cumulative: Array<{ date: string; cumulativeAmount: number }>;
  }> {
    return changeImpactService.getTrends(projectId);
  }

  async getForecast(projectId: string): Promise<{
    projectedTotal: number;
    confidenceLevel: 'low' | 'medium' | 'high';
    remainingContingency: number;
    riskAssessment: string;
  }> {
    return changeImpactService.getForecast(projectId);
  }
}

// Singleton export
export const changeOrdersFacade = new ChangeOrdersFacade();

// Default export for backward compatibility
export default changeOrdersFacade;
