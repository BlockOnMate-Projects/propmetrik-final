/**
 * RFIs Module - Barrel Export
 * Phase 3.13 - Split from rfiService
 * 
 * Provides modular RFI management with:
 * - RfiCrudService: Core CRUD operations
 * - RfiWorkflowService: Status transitions and lifecycle
 * - RfiCollaborationService: Comments, history, watchers
 * - RfiStatsService: Statistics and analytics
 */

// Types
export * from './types';

// Services
export { rfiCrudService } from './RfiCrudService';
export { rfiWorkflowService } from './RfiWorkflowService';
export { rfiCollaborationService } from './RfiCollaborationService';
export { rfiStatsService } from './RfiStatsService';

// Re-import for facade
import { rfiCrudService } from './RfiCrudService';
import { rfiWorkflowService } from './RfiWorkflowService';
import { rfiCollaborationService } from './RfiCollaborationService';
import { rfiStatsService } from './RfiStatsService';
import {
  Rfi,
  RfiWithDetails,
  RfiComment,
  RfiHistoryEntry,
  RfiWatcher,
  RfiStats,
  RfiStatus,
  RfiPriority,
  CreateRfiInput,
  UpdateRfiInput,
  RespondToRfiInput,
  AddCommentInput,
  RfiFilters,
  PaginatedRfis
} from './types';

/**
 * Unified facade for all RFI operations
 * Provides backward-compatible API
 */
class RfisFacade {
  // ==========================================================================
  // CRUD OPERATIONS (delegated to RfiCrudService)
  // ==========================================================================

  /**
   * Create a new RFI
   */
  async create(input: CreateRfiInput): Promise<Rfi> {
    return rfiCrudService.create(input);
  }

  /**
   * Get RFI by ID
   */
  async getById(id: string): Promise<RfiWithDetails | null> {
    return rfiCrudService.getById(id);
  }

  /**
   * Get RFI by number
   */
  async getByNumber(projectId: string, rfiNumber: string): Promise<RfiWithDetails | null> {
    return rfiCrudService.getByNumber(projectId, rfiNumber);
  }

  /**
   * Get RFIs with filters
   */
  async getAll(filters: RfiFilters): Promise<PaginatedRfis> {
    return rfiCrudService.getAll(filters);
  }

  /**
   * Get RFIs for a project
   */
  async getByProject(projectId: string): Promise<RfiWithDetails[]> {
    return rfiCrudService.getByProject(projectId);
  }

  /**
   * Update an RFI
   */
  async update(id: string, input: UpdateRfiInput): Promise<Rfi> {
    return rfiCrudService.update(id, input);
  }

  /**
   * Delete an RFI (soft delete)
   */
  async delete(id: string, userId: string): Promise<void> {
    return rfiCrudService.delete(id, userId);
  }

  /**
   * Check if RFI exists
   */
  async exists(id: string): Promise<boolean> {
    return rfiCrudService.exists(id);
  }

  // ==========================================================================
  // WORKFLOW OPERATIONS (delegated to RfiWorkflowService)
  // ==========================================================================

  /**
   * Submit a draft RFI
   */
  async submit(id: string, userId: string): Promise<Rfi> {
    return rfiWorkflowService.submit(id, userId);
  }

  /**
   * Assign RFI to a user
   */
  async assign(id: string, assigneeId: string, assignedBy: string): Promise<Rfi> {
    return rfiWorkflowService.assign(id, assigneeId, assignedBy);
  }

  /**
   * Reassign RFI to a different user
   */
  async reassign(id: string, newAssigneeId: string, reassignedBy: string, reason?: string): Promise<Rfi> {
    return rfiWorkflowService.reassign(id, newAssigneeId, reassignedBy, reason);
  }

  /**
   * Respond to an RFI
   */
  async respond(id: string, input: RespondToRfiInput): Promise<Rfi> {
    return rfiWorkflowService.respond(id, input);
  }

  /**
   * Close an RFI
   */
  async close(id: string, userId: string, comment?: string): Promise<Rfi> {
    return rfiWorkflowService.close(id, userId, comment);
  }

  /**
   * Void an RFI
   */
  async void(id: string, userId: string, reason: string): Promise<Rfi> {
    return rfiWorkflowService.void(id, userId, reason);
  }

  /**
   * Reopen a closed RFI
   */
  async reopen(id: string, userId: string, reason: string): Promise<Rfi> {
    return rfiWorkflowService.reopen(id, userId, reason);
  }

  /**
   * Escalate RFI priority
   */
  async escalate(id: string, userId: string, reason?: string): Promise<Rfi> {
    return rfiWorkflowService.escalate(id, userId, reason);
  }

  /**
   * Check if status transition is valid
   */
  isValidTransition(currentStatus: RfiStatus, newStatus: RfiStatus): boolean {
    return rfiWorkflowService.isValidTransition(currentStatus, newStatus);
  }

  /**
   * Get allowed transitions
   */
  getAllowedTransitions(currentStatus: RfiStatus): RfiStatus[] {
    return rfiWorkflowService.getAllowedTransitions(currentStatus);
  }

  // ==========================================================================
  // COLLABORATION (delegated to RfiCollaborationService)
  // ==========================================================================

  /**
   * Add a comment
   */
  async addComment(rfiId: string, input: AddCommentInput): Promise<RfiComment> {
    return rfiCollaborationService.addComment(rfiId, input);
  }

  /**
   * Get comments
   */
  async getComments(rfiId: string, includeInternal?: boolean): Promise<RfiComment[]> {
    return rfiCollaborationService.getComments(rfiId, includeInternal);
  }

  /**
   * Update a comment
   */
  async updateComment(id: string, comment: string, updatedBy: string): Promise<RfiComment | null> {
    return rfiCollaborationService.updateComment(id, comment, updatedBy);
  }

  /**
   * Delete a comment
   */
  async deleteComment(id: string, userId: string): Promise<boolean> {
    return rfiCollaborationService.deleteComment(id, userId);
  }

  /**
   * Get history
   */
  async getHistory(rfiId: string): Promise<RfiHistoryEntry[]> {
    return rfiCollaborationService.getHistory(rfiId);
  }

  /**
   * Add a watcher
   */
  async addWatcher(rfiId: string, userId: string): Promise<boolean> {
    return rfiCollaborationService.addWatcher(rfiId, userId);
  }

  /**
   * Remove a watcher
   */
  async removeWatcher(rfiId: string, userId: string): Promise<boolean> {
    return rfiCollaborationService.removeWatcher(rfiId, userId);
  }

  /**
   * Get watchers
   */
  async getWatchers(rfiId: string): Promise<RfiWatcher[]> {
    return rfiCollaborationService.getWatchers(rfiId);
  }

  /**
   * Check if user is watching
   */
  async isWatching(rfiId: string, userId: string): Promise<boolean> {
    return rfiCollaborationService.isWatching(rfiId, userId);
  }

  // ==========================================================================
  // STATISTICS (delegated to RfiStatsService)
  // ==========================================================================

  /**
   * Get RFI statistics
   */
  async getStats(projectId: string): Promise<RfiStats> {
    return rfiStatsService.getStats(projectId);
  }

  /**
   * Get counts by status
   */
  async getCountsByStatus(projectId: string): Promise<Record<RfiStatus, number>> {
    return rfiStatsService.getCountsByStatus(projectId);
  }

  /**
   * Get counts by priority
   */
  async getCountsByPriority(projectId: string): Promise<Record<RfiPriority, number>> {
    return rfiStatsService.getCountsByPriority(projectId);
  }

  /**
   * Get overdue count
   */
  async getOverdueCount(projectId: string): Promise<number> {
    return rfiStatsService.getOverdueCount(projectId);
  }

  /**
   * Get average response time
   */
  async getAverageResponseTime(projectId: string): Promise<number> {
    return rfiStatsService.getAverageResponseTime(projectId);
  }

  /**
   * Get creation trend
   */
  async getCreationTrend(projectId: string, months?: number) {
    return rfiStatsService.getCreationTrend(projectId, months);
  }

  /**
   * Get weekly summary
   */
  async getWeeklySummary(projectId: string) {
    return rfiStatsService.getWeeklySummary(projectId);
  }

  /**
   * Get total cost impact
   */
  async getTotalCostImpact(projectId: string) {
    return rfiStatsService.getTotalCostImpact(projectId);
  }

  /**
   * Get total schedule impact
   */
  async getTotalScheduleImpact(projectId: string): Promise<number> {
    return rfiStatsService.getTotalScheduleImpact(projectId);
  }

  /**
   * Get high impact RFIs
   */
  async getHighImpactRfis(projectId: string, limit?: number) {
    return rfiStatsService.getHighImpactRfis(projectId, limit);
  }
}

// Export singleton facade
export const rfisFacade = new RfisFacade();

// Default export for backward compatibility patterns
export default rfisFacade;
