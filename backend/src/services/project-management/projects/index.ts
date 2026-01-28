/**
 * Projects Module
 * 
 * Phase 3.11: Split projectService (1052 lines → 3 focused services)
 * 
 * Architecture:
 * - ProjectCoreService: CRUD operations
 * - ProjectStatusService: Status management and transitions
 * - ProjectStatsService: Statistics and summaries
 * 
 * @module services/project-management/projects
 */

// Types
export * from './types';

// Individual Services
export { projectCoreService } from './ProjectCoreService';
export { projectStatusService } from './ProjectStatusService';
export { projectStatsService } from './ProjectStatsService';

// =============================================================================
// FACADE
// =============================================================================

import { projectCoreService } from './ProjectCoreService';
import { projectStatusService } from './ProjectStatusService';
import { projectStatsService } from './ProjectStatsService';
import {
  DevelopmentProject,
  ProjectSummary,
  ProjectStats,
  ProjectStatus,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectFilters,
} from './types';

/**
 * Facade for project operations
 * 
 * Provides a unified API for working with development projects,
 * delegating to specialized services internally.
 */
export const projectsFacade = {
  // ==========================================================================
  // CORE CRUD OPERATIONS
  // ==========================================================================

  /**
   * Create a new project
   */
  create(input: CreateProjectInput): Promise<DevelopmentProject> {
    return projectCoreService.create(input);
  },

  /**
   * Get project by ID
   */
  getById(id: string, organizationId?: string): Promise<DevelopmentProject | null> {
    return projectCoreService.getById(id, organizationId);
  },

  /**
   * Get project by project number
   */
  getByNumber(projectNumber: string, organizationId: string): Promise<DevelopmentProject | null> {
    return projectCoreService.getByNumber(projectNumber, organizationId);
  },

  /**
   * Get all projects with filters
   */
  getAll(filters: ProjectFilters): Promise<{ projects: DevelopmentProject[]; total: number }> {
    return projectCoreService.getAll(filters);
  },

  /**
   * Update project
   */
  update(id: string, organizationId: string, input: UpdateProjectInput): Promise<DevelopmentProject | null> {
    return projectCoreService.update(id, organizationId, input);
  },

  /**
   * Delete project (soft delete)
   */
  delete(id: string, organizationId: string, deletedBy?: string): Promise<boolean> {
    return projectCoreService.delete(id, organizationId, deletedBy);
  },

  /**
   * Hard delete project
   */
  hardDelete(id: string, organizationId: string): Promise<boolean> {
    return projectCoreService.hardDelete(id, organizationId);
  },

  /**
   * Check if project exists
   */
  exists(id: string, organizationId?: string): Promise<boolean> {
    return projectCoreService.exists(id, organizationId);
  },

  /**
   * Get projects by manager
   */
  getByManager(projectManagerId: string, organizationId: string): Promise<DevelopmentProject[]> {
    return projectCoreService.getByManager(projectManagerId, organizationId);
  },

  // ==========================================================================
  // STATUS OPERATIONS
  // ==========================================================================

  /**
   * Update project status
   */
  updateStatus(
    id: string,
    organizationId: string,
    newStatus: ProjectStatus,
    updatedBy?: string
  ): Promise<DevelopmentProject | null> {
    return projectStatusService.updateStatus(id, organizationId, newStatus, updatedBy);
  },

  /**
   * Get allowed status transitions
   */
  getAllowedTransitions(currentStatus: ProjectStatus): ProjectStatus[] {
    return projectStatusService.getAllowedTransitions(currentStatus);
  },

  /**
   * Check if status transition is valid
   */
  isValidTransition(from: ProjectStatus, to: ProjectStatus): boolean {
    return projectStatusService.isValidTransition(from, to);
  },

  /**
   * Update project progress
   */
  updateProgress(
    id: string,
    organizationId: string,
    progress: {
      overallProgress?: number;
      constructionProgress?: number;
      salesProgress?: number;
    },
    updatedBy?: string
  ): Promise<DevelopmentProject | null> {
    return projectStatusService.updateProgress(id, organizationId, progress, updatedBy);
  },

  /**
   * Recalculate progress from phases
   */
  recalculateProgress(id: string) {
    return projectStatusService.recalculateProgress(id);
  },

  /**
   * Recalculate sales progress from units
   */
  recalculateSalesProgress(id: string): Promise<number> {
    return projectStatusService.recalculateSalesProgress(id);
  },

  /**
   * Put project on hold
   */
  putOnHold(id: string, organizationId: string, reason?: string, updatedBy?: string) {
    return projectStatusService.putOnHold(id, organizationId, reason, updatedBy);
  },

  /**
   * Resume project from hold
   */
  resumeFromHold(id: string, organizationId: string, resumeToStatus: ProjectStatus, updatedBy?: string) {
    return projectStatusService.resumeFromHold(id, organizationId, resumeToStatus, updatedBy);
  },

  /**
   * Cancel project
   */
  cancel(id: string, organizationId: string, reason?: string, updatedBy?: string) {
    return projectStatusService.cancel(id, organizationId, reason, updatedBy);
  },

  // ==========================================================================
  // STATISTICS OPERATIONS
  // ==========================================================================

  /**
   * Get organization-wide statistics
   */
  getStats(organizationId: string): Promise<ProjectStats> {
    return projectStatsService.getStats(organizationId);
  },

  /**
   * Get project summaries for dashboard
   */
  getSummaries(organizationId: string, limit?: number): Promise<ProjectSummary[]> {
    return projectStatsService.getSummaries(organizationId, limit);
  },

  /**
   * Get project summary by ID
   */
  getSummary(projectId: string): Promise<ProjectSummary | null> {
    return projectStatsService.getSummary(projectId);
  },

  /**
   * Get counts by status
   */
  getCountsByStatus(organizationId: string): Promise<Record<ProjectStatus, number>> {
    return projectStatsService.getCountsByStatus(organizationId);
  },

  /**
   * Get active project count
   */
  getActiveCount(organizationId: string): Promise<number> {
    return projectStatsService.getActiveCount(organizationId);
  },

  /**
   * Get projects with budget variance
   */
  getProjectsWithBudgetVariance(organizationId: string, varianceThreshold?: number) {
    return projectStatsService.getProjectsWithBudgetVariance(organizationId, varianceThreshold);
  },

  /**
   * Get projects behind schedule
   */
  getProjectsBehindSchedule(organizationId: string) {
    return projectStatsService.getProjectsBehindSchedule(organizationId);
  },

  /**
   * Get top performing projects by sales
   */
  getTopProjectsBySales(organizationId: string, limit?: number) {
    return projectStatsService.getTopProjectsBySales(organizationId, limit);
  },

  /**
   * Get revenue by region
   */
  getRevenueByRegion(organizationId: string) {
    return projectStatsService.getRevenueByRegion(organizationId);
  },
};

// Default export for convenience
export default projectsFacade;
