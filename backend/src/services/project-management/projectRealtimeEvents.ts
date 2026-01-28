/**
 * Project Management Realtime Events
 * 
 * Emits realtime events for project management operations.
 * Integrates with the SSE-based realtime service for live dashboard updates.
 */

import { realtimeEmitter, RealtimeEventType } from '../../../shared-services/realtime';
import { logger } from '../../utils/logger';

// Extended event types for project management
export enum ProjectEventType {
  // Project lifecycle
  PROJECT_CREATED = 'project.created',
  PROJECT_UPDATED = 'project.updated',
  PROJECT_STATUS_CHANGED = 'project.status_changed',
  PROJECT_DELETED = 'project.deleted',
  
  // Phase events
  PHASE_CREATED = 'phase.created',
  PHASE_UPDATED = 'phase.updated',
  PHASE_PROGRESS_CHANGED = 'phase.progress_changed',
  PHASE_STATUS_CHANGED = 'phase.status_changed',
  PHASE_RESCHEDULED = 'phase.rescheduled',
  
  // Milestone events
  MILESTONE_CREATED = 'milestone.created',
  MILESTONE_COMPLETED = 'milestone.completed',
  MILESTONE_MISSED = 'milestone.missed',
  
  // Budget events
  BUDGET_UPDATED = 'budget.updated',
  BUDGET_THRESHOLD_EXCEEDED = 'budget.threshold_exceeded',
  COST_RECORDED = 'cost.recorded',
  
  // Unit events
  UNIT_CREATED = 'unit.created',
  UNIT_UPDATED = 'unit.updated',
  UNIT_SOLD = 'unit.sold',
  UNIT_RESERVED = 'unit.reserved',
  
  // Alert events
  ALERT_CREATED = 'alert.created',
  ALERT_RESOLVED = 'alert.resolved',
  
  // Dashboard refresh
  METRICS_UPDATED = 'metrics.updated',
  DASHBOARD_REFRESH = 'dashboard.refresh',
}

// Payload interfaces
export interface ProjectEventPayload {
  id: string;
  name?: string;
  status?: string;
  progress?: number;
  changes?: Record<string, { old: unknown; new: unknown }>;
  [key: string]: unknown;
}

export interface PhaseEventPayload {
  id: string;
  projectId: string;
  name?: string;
  status?: string;
  progress?: number;
  startDate?: string;
  endDate?: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
}

export interface BudgetEventPayload {
  projectId: string;
  totalBudget?: number;
  totalSpent?: number;
  variance?: number;
  variancePercent?: number;
  category?: string;
  amount?: number;
}

export interface AlertEventPayload {
  id: string;
  projectId?: string;
  type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message?: string;
}

export interface MetricsEventPayload {
  totalProjects?: number;
  activeProjects?: number;
  totalBudget?: number;
  totalSpent?: number;
  averageProgress?: number;
  projectsAtRisk?: number;
}

/**
 * Emit a project-related realtime event
 */
export async function emitProjectEvent(
  eventType: ProjectEventType | RealtimeEventType,
  organizationId: string,
  payload: Record<string, unknown>,
  options?: {
    entityType?: string;
    entityId?: string;
    userId?: string;
  }
): Promise<void> {
  try {
    await realtimeEmitter.broadcast({
      type: eventType,
      organizationId,
      payload,
      entityType: options?.entityType || 'project',
      entityId: options?.entityId,
      userId: options?.userId,
      timestamp: new Date(),
    });
    
    logger.debug('Project realtime event emitted', {
      eventType,
      organizationId,
      entityId: options?.entityId,
    });
  } catch (error) {
    // Don't throw - realtime events are not critical path
    logger.error('Failed to emit project realtime event', {
      error: (error as Error).message,
      eventType,
      organizationId,
    });
  }
}

// Convenience functions for common events

/**
 * Emit project created event
 */
export async function emitProjectCreated(
  organizationId: string,
  project: {
    id: string;
    name: string;
    projectType: string;
    status: string;
    totalBudget: number;
  },
  userId?: string
): Promise<void> {
  await emitProjectEvent(
    ProjectEventType.PROJECT_CREATED,
    organizationId,
    {
      id: project.id,
      name: project.name,
      projectType: project.projectType,
      status: project.status,
      totalBudget: project.totalBudget,
    },
    { entityType: 'project', entityId: project.id, userId }
  );
  
  // Also trigger dashboard refresh
  await emitDashboardRefresh(organizationId);
}

/**
 * Emit project updated event
 */
export async function emitProjectUpdated(
  organizationId: string,
  projectId: string,
  changes: Record<string, { old: unknown; new: unknown }>,
  userId?: string
): Promise<void> {
  await emitProjectEvent(
    ProjectEventType.PROJECT_UPDATED,
    organizationId,
    { id: projectId, changes },
    { entityType: 'project', entityId: projectId, userId }
  );
}

/**
 * Emit project status changed event
 */
export async function emitProjectStatusChanged(
  organizationId: string,
  project: {
    id: string;
    name: string;
    oldStatus: string;
    newStatus: string;
    progress?: number;
  },
  userId?: string
): Promise<void> {
  await emitProjectEvent(
    ProjectEventType.PROJECT_STATUS_CHANGED,
    organizationId,
    {
      id: project.id,
      name: project.name,
      oldStatus: project.oldStatus,
      newStatus: project.newStatus,
      progress: project.progress,
    },
    { entityType: 'project', entityId: project.id, userId }
  );
  
  // Trigger metrics update
  await emitMetricsUpdated(organizationId, {});
}

/**
 * Emit phase updated event
 */
export async function emitPhaseUpdated(
  organizationId: string,
  phase: {
    id: string;
    projectId: string;
    name: string;
    status?: string;
    progress?: number;
    startDate?: Date;
    endDate?: Date;
  },
  userId?: string
): Promise<void> {
  await emitProjectEvent(
    ProjectEventType.PHASE_UPDATED,
    organizationId,
    {
      id: phase.id,
      projectId: phase.projectId,
      name: phase.name,
      status: phase.status,
      progress: phase.progress,
      startDate: phase.startDate?.toISOString(),
      endDate: phase.endDate?.toISOString(),
    },
    { entityType: 'phase', entityId: phase.id, userId }
  );
}

/**
 * Emit phase rescheduled event (for Gantt chart updates)
 */
export async function emitPhaseRescheduled(
  organizationId: string,
  phase: {
    id: string;
    projectId: string;
    name: string;
    oldStartDate?: Date;
    newStartDate?: Date;
    oldEndDate?: Date;
    newEndDate?: Date;
  },
  userId?: string
): Promise<void> {
  await emitProjectEvent(
    ProjectEventType.PHASE_RESCHEDULED,
    organizationId,
    {
      id: phase.id,
      projectId: phase.projectId,
      name: phase.name,
      changes: {
        startDate: {
          old: phase.oldStartDate?.toISOString(),
          new: phase.newStartDate?.toISOString(),
        },
        endDate: {
          old: phase.oldEndDate?.toISOString(),
          new: phase.newEndDate?.toISOString(),
        },
      },
    },
    { entityType: 'phase', entityId: phase.id, userId }
  );
}

/**
 * Emit milestone completed event
 */
export async function emitMilestoneCompleted(
  organizationId: string,
  milestone: {
    id: string;
    projectId: string;
    phaseId?: string;
    name: string;
    completedDate: Date;
  },
  userId?: string
): Promise<void> {
  await emitProjectEvent(
    ProjectEventType.MILESTONE_COMPLETED,
    organizationId,
    {
      id: milestone.id,
      projectId: milestone.projectId,
      phaseId: milestone.phaseId,
      name: milestone.name,
      completedDate: milestone.completedDate.toISOString(),
    },
    { entityType: 'milestone', entityId: milestone.id, userId }
  );
}

/**
 * Emit budget updated event
 */
export async function emitBudgetUpdated(
  organizationId: string,
  projectId: string,
  budget: {
    totalBudget: number;
    totalSpent: number;
    variance: number;
    variancePercent: number;
  },
  userId?: string
): Promise<void> {
  await emitProjectEvent(
    ProjectEventType.BUDGET_UPDATED,
    organizationId,
    {
      projectId,
      ...budget,
    },
    { entityType: 'budget', entityId: projectId, userId }
  );
  
  // Check if budget threshold exceeded
  if (budget.variancePercent < -10) {
    await emitProjectEvent(
      ProjectEventType.BUDGET_THRESHOLD_EXCEEDED,
      organizationId,
      {
        projectId,
        variance: budget.variance,
        variancePercent: budget.variancePercent,
        threshold: -10,
      },
      { entityType: 'alert', entityId: projectId, userId }
    );
  }
}

/**
 * Emit alert created event
 */
export async function emitAlertCreated(
  organizationId: string,
  alert: AlertEventPayload,
  userId?: string
): Promise<void> {
  await emitProjectEvent(
    ProjectEventType.ALERT_CREATED,
    organizationId,
    alert as unknown as Record<string, unknown>,
    { entityType: 'alert', entityId: alert.id, userId }
  );
}

/**
 * Emit metrics updated event
 */
export async function emitMetricsUpdated(
  organizationId: string,
  metrics: Partial<MetricsEventPayload>
): Promise<void> {
  await emitProjectEvent(
    ProjectEventType.METRICS_UPDATED,
    organizationId,
    metrics,
    { entityType: 'metrics' }
  );
}

/**
 * Emit dashboard refresh signal
 */
export async function emitDashboardRefresh(
  organizationId: string,
  scope?: string[]
): Promise<void> {
  await emitProjectEvent(
    ProjectEventType.DASHBOARD_REFRESH,
    organizationId,
    { 
      scope: scope || ['metrics', 'projects', 'alerts', 'milestones'],
      timestamp: new Date().toISOString(),
    },
    { entityType: 'dashboard' }
  );
}

export default {
  emitProjectEvent,
  emitProjectCreated,
  emitProjectUpdated,
  emitProjectStatusChanged,
  emitPhaseUpdated,
  emitPhaseRescheduled,
  emitMilestoneCompleted,
  emitBudgetUpdated,
  emitAlertCreated,
  emitMetricsUpdated,
  emitDashboardRefresh,
  ProjectEventType,
};
