/**
 * Scheduling Module Types
 * 
 * Phase 3.6: Split ganttService
 * 
 * Shared types for Gantt/scheduling functionality:
 * - Gantt visualization data structures
 * - Phase dependencies
 * - Baseline snapshots
 * - Critical path analysis
 * 
 * @module services/project-management/scheduling/types
 */

// =============================================================================
// GANTT VISUALIZATION TYPES
// =============================================================================

export interface GanttMilestone {
  id: string;
  name: string;
  targetDate: string;
  actualDate: string | null;
  baselineDate: string | null;
  status: string;
  type: string;
  priority: string;
  dependencyIds: string[];
}

export interface GanttPhase {
  id: string;
  name: string;
  sequenceOrder: number;
  startDate: string | null;
  endDate: string | null;
  baselineStartDate: string | null;
  baselineEndDate: string | null;
  progress: number;
  status: string;
  isCriticalPath: boolean;
  slackDays: number;
  dependencyIds: string[];
  budgetedCost: number;
  actualCost: number;
  color: string | null;
  milestones: GanttMilestone[];
}

export interface GanttData {
  projectId: string;
  projectName: string;
  startDate: string | null;
  endDate: string | null;
  baselineStartDate: string | null;
  baselineEndDate: string | null;
  totalProgress: number;
  phases: GanttPhase[];
  criticalPath: string[];
  summary: {
    totalPhases: number;
    completedPhases: number;
    totalMilestones: number;
    completedMilestones: number;
    daysRemaining: number;
    daysVariance: number;
  };
}

// =============================================================================
// DEPENDENCY TYPES
// =============================================================================

export type DependencyType = 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish';

export interface PhaseDependency {
  id: string;
  phaseId: string;
  dependsOnPhaseId: string;
  dependencyType: DependencyType;
  lagDays: number;
  createdAt: Date;
}

export interface DependencyUpdate {
  phaseId: string;
  dependencyIds: string[];
  dependencyType?: DependencyType;
  lagDays?: number;
}

export interface UpdatePhaseDatesInput {
  startDate?: string;
  endDate?: string;
  cascadeToSuccessors?: boolean;
}

export interface CascadeResult {
  updatedPhases: Array<{
    phaseId: string;
    phaseName: string;
    oldStartDate: string | null;
    newStartDate: string | null;
    oldEndDate: string | null;
    newEndDate: string | null;
  }>;
  affectedMilestones: string[];
}

// =============================================================================
// BASELINE TYPES
// =============================================================================

export interface Baseline {
  id: string;
  projectId: string;
  organizationId: string;
  name: string;
  description: string | null;
  baselineNumber: number;
  snapshotDate: string;
  phasesSnapshot: any[];
  milestonesSnapshot: any[];
  budgetSnapshot: any;
  totalBudget: number;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  totalPhases: number;
  totalMilestones: number;
  isActive: boolean;
  isLocked: boolean;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface BaselineCreateInput {
  projectId: string;
  organizationId: string;
  name: string;
  description?: string;
  notes?: string;
  createdBy?: string;
}

export interface BaselineComparison {
  projectId: string;
  baseline: Baseline;
  current: {
    startDate: string | null;
    endDate: string | null;
    totalBudget: number;
    actualCost: number;
    progress: number;
  };
  variance: {
    startDays: number;
    endDays: number;
    budgetAmount: number;
    budgetPercent: number;
  };
  phaseComparisons: PhaseVariance[];
}

export interface PhaseVariance {
  phaseId: string;
  phaseName: string;
  baselineStart: string | null;
  baselineEnd: string | null;
  currentStart: string | null;
  currentEnd: string | null;
  startVariance: number;
  endVariance: number;
  baselineProgress: number;
  currentProgress: number;
  progressVariance: number;
}

// =============================================================================
// CRITICAL PATH TYPES
// =============================================================================

export interface CriticalPathResult {
  criticalPath: string[];
  totalDuration: number;
  phases: Array<{
    phaseId: string;
    phaseName: string;
    earlyStart: Date | null;
    earlyFinish: Date | null;
    lateStart: Date | null;
    lateFinish: Date | null;
    slack: number;
    isCritical: boolean;
  }>;
}

export interface ScheduleHealthMetrics {
  schedulePerformanceIndex: number; // SPI
  scheduleVariance: number;
  daysAhead: number;
  daysDelayed: number;
  criticalPathDelay: number;
  atRiskPhases: string[];
}
