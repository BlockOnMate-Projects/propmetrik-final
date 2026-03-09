/**
 * Project Management API Client
 * Phase 5.8: Development Project Management
 */

import { fetchApi } from './api';
import {
  DevelopmentProject,
  ProjectSummary,
  ProjectStats,
  ProjectPhase,
  GanttData,
  ProjectUnit,
  UnitStats,
  ProjectCost,
  BudgetSummary,
  CostCode,
  Contractor,
  ContractorAssignment,
  ContractorPerformance,
  DrawRequest,
  DrawSummary,
  DailyLog,
  BuyerPaymentPlan,
  PunchListItem,
  PaginatedResponse,
  ProjectFilters,
  UnitFilters,
  CostFilters,
  ContractorFilters,
  Milestone,
  UnitUpgrade,
  ProjectStatus,
  PhaseStatus,
} from '@/types/projects';

const PROJECTS_BASE = '/projects';

// =====================================================
// PROJECTS API
// =====================================================

export const projectsApi = {
  // Get all projects with filters
  getAll: async (filters?: ProjectFilters): Promise<PaginatedResponse<DevelopmentProject>> => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.type) params.set('type', filters.type);
    if (filters?.city) params.set('city', filters.city);
    if (filters?.region) params.set('region', filters.region);
    if (filters?.manager) params.set('manager', filters.manager);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.sort) params.set('sort', filters.sort);
    if (filters?.order) params.set('order', filters.order);

    const query = params.toString();
    const response = await fetchApi<any>(`${PROJECTS_BASE}${query ? `?${query}` : ''}`);

    if (response?.projects && Array.isArray(response.projects)) {
      const total = typeof response.total === 'number' ? response.total : response.projects.length;
      const limit = typeof response.limit === 'number' ? response.limit : response.projects.length || 1;
      return {
        data: response.projects,
        total,
        page: response.page || 1,
        limit,
        totalPages: response.totalPages || Math.max(1, Math.ceil(total / limit)),
      };
    }

    return response as PaginatedResponse<DevelopmentProject>;
  },

  // Get project summaries (lightweight)
  getSummaries: (): Promise<ProjectSummary[]> => {
    return fetchApi(`${PROJECTS_BASE}/summaries`);
  },

  // Get project statistics
  getStats: (): Promise<ProjectStats> => {
    return fetchApi(`${PROJECTS_BASE}/stats`);
  },

  // Get single project
  getById: (id: string): Promise<DevelopmentProject> => {
    return fetchApi(`${PROJECTS_BASE}/${id}`);
  },

  // Create project
  create: (data: Partial<DevelopmentProject>): Promise<DevelopmentProject> => {
    return fetchApi(`${PROJECTS_BASE}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update project
  update: (id: string, data: Partial<DevelopmentProject>): Promise<DevelopmentProject> => {
    return fetchApi(`${PROJECTS_BASE}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Update project status
  updateStatus: (id: string, status: ProjectStatus): Promise<DevelopmentProject> => {
    return fetchApi(`${PROJECTS_BASE}/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  // Get Traditional Authorities
  getTraditionalAuthorities: (region?: string): Promise<any[]> => {
    const query = region ? `?region=${encodeURIComponent(region)}` : '';
    return fetchApi(`${PROJECTS_BASE}/traditional-authorities${query}`);
  },

  // Get Assemblies
  getAssemblies: (region?: string): Promise<any[]> => {
    const query = region ? `?region=${encodeURIComponent(region)}` : '';
    return fetchApi(`${PROJECTS_BASE}/assemblies${query}`);
  },

  // Delete project
  delete: (id: string): Promise<void> => {
    return fetchApi(`${PROJECTS_BASE}/${id}`, {
      method: 'DELETE',
    });
  },

  // Get phase templates
  getPhaseTemplates: (projectType?: string): Promise<any[]> => {
    const params = projectType ? `?type=${projectType}` : '';
    return fetchApi(`${PROJECTS_BASE}/phase-templates${params}`);
  },
};

// =====================================================
// PHASES API
// =====================================================

export const phasesApi = {
  // Get project phases
  getByProject: (projectId: string): Promise<ProjectPhase[]> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/phases`);
  },

  // Get Gantt chart data
  getGanttData: (projectId: string): Promise<GanttData> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/gantt`);
  },

  // Create phase
  create: (projectId: string, data: Partial<ProjectPhase>): Promise<ProjectPhase> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/phases`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Bulk create phases
  createBulk: (projectId: string, phases: Partial<ProjectPhase>[]): Promise<ProjectPhase[]> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/phases/bulk`, {
      method: 'POST',
      body: JSON.stringify({ phases }),
    });
  },

  // Update phase
  update: (phaseId: string, data: Partial<ProjectPhase>): Promise<ProjectPhase> => {
    return fetchApi(`${PROJECTS_BASE}/phases/${phaseId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Update progress
  updateProgress: (phaseId: string, progress: number): Promise<ProjectPhase> => {
    return fetchApi(`${PROJECTS_BASE}/phases/${phaseId}/progress`, {
      method: 'PATCH',
      body: JSON.stringify({ progress }),
    });
  },

  // Update status
  updateStatus: (phaseId: string, status: PhaseStatus): Promise<ProjectPhase> => {
    return fetchApi(`${PROJECTS_BASE}/phases/${phaseId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  // Reorder phases
  reorderPhases: (projectId: string, phaseIds: string[]): Promise<void> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/phases/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ phaseIds }),
    });
  },

  // Check if phase can start
  canStartPhase: (phaseId: string): Promise<{ canStart: boolean; blockedBy?: string[] }> => {
    return fetchApi(`${PROJECTS_BASE}/phases/${phaseId}/can-start`);
  },

  // Delete phase
  delete: (phaseId: string): Promise<void> => {
    return fetchApi(`${PROJECTS_BASE}/phases/${phaseId}`, {
      method: 'DELETE',
    });
  },

  // Add milestone
  addMilestone: (phaseId: string, milestone: Partial<Milestone>): Promise<ProjectPhase> => {
    return fetchApi(`${PROJECTS_BASE}/phases/${phaseId}/milestones`, {
      method: 'POST',
      body: JSON.stringify(milestone),
    });
  },

  // Update milestone
  updateMilestone: (phaseId: string, milestoneId: string, data: Partial<Milestone>): Promise<ProjectPhase> => {
    return fetchApi(`${PROJECTS_BASE}/phases/${phaseId}/milestones/${milestoneId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Complete milestone
  completeMilestone: (phaseId: string, milestoneId: string): Promise<ProjectPhase> => {
    return fetchApi(`${PROJECTS_BASE}/phases/${phaseId}/milestones/${milestoneId}/complete`, {
      method: 'POST',
    });
  },

  // Delete milestone
  deleteMilestone: (phaseId: string, milestoneId: string): Promise<ProjectPhase> => {
    return fetchApi(`${PROJECTS_BASE}/phases/${phaseId}/milestones/${milestoneId}`, {
      method: 'DELETE',
    });
  },
};

// =====================================================
// UNITS API
// =====================================================

export const unitsApi = {
  // Get project units
  getByProject: (projectId: string, filters?: UnitFilters): Promise<PaginatedResponse<ProjectUnit>> => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.type) params.set('type', filters.type);
    if (filters?.building) params.set('building', filters.building);
    if (filters?.floor !== undefined) params.set('floor', String(filters.floor));
    if (filters?.min_bedrooms) params.set('min_bedrooms', String(filters.min_bedrooms));
    if (filters?.max_bedrooms) params.set('max_bedrooms', String(filters.max_bedrooms));
    if (filters?.min_price) params.set('min_price', String(filters.min_price));
    if (filters?.max_price) params.set('max_price', String(filters.max_price));
    if (filters?.search) params.set('search', filters.search);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));

    const query = params.toString();
    return fetchApi(`${PROJECTS_BASE}/${projectId}/units${query ? `?${query}` : ''}`);
  },

  // Get unit availability grid
  getAvailability: (projectId: string): Promise<any> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/units/availability`);
  },

  // Get unit statistics
  getStats: (projectId: string): Promise<UnitStats> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/units/stats`);
  },

  // Get upgrade categories
  getUpgradeCategories: (): Promise<string[]> => {
    return fetchApi(`${PROJECTS_BASE}/upgrades/categories`);
  },

  // Get single unit
  getById: (unitId: string): Promise<ProjectUnit> => {
    return fetchApi(`${PROJECTS_BASE}/units/${unitId}`);
  },

  // Create unit
  create: (projectId: string, data: Partial<ProjectUnit>): Promise<ProjectUnit> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/units`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Bulk create units
  createBulk: (projectId: string, data: {
    building?: string;
    floor_start: number;
    floor_end: number;
    units_per_floor: number;
    unit_prefix?: string;
    unit_type: string;
    base_price: number;
    internal_area_sqm?: number;
    bedrooms?: number;
    bathrooms?: number;
    floor_premium_percentage?: number;
  }): Promise<ProjectUnit[]> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/units/bulk`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update unit
  update: (unitId: string, data: Partial<ProjectUnit>): Promise<ProjectUnit> => {
    return fetchApi(`${PROJECTS_BASE}/units/${unitId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Reserve unit
  reserve: (unitId: string, data: {
    contact_id: string;
    deposit_amount?: number;
    expires_in_days?: number;
    notes?: string;
  }): Promise<ProjectUnit> => {
    return fetchApi(`${PROJECTS_BASE}/units/${unitId}/reserve`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Move to contract
  moveToContract: (unitId: string, data: {
    sale_price: number;
    contract_date: string;
    deal_id?: string;
  }): Promise<ProjectUnit> => {
    return fetchApi(`${PROJECTS_BASE}/units/${unitId}/contract`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Mark as sold
  markAsSold: (unitId: string): Promise<ProjectUnit> => {
    return fetchApi(`${PROJECTS_BASE}/units/${unitId}/sold`, {
      method: 'POST',
    });
  },

  // Handover
  handover: (unitId: string, handover_date: string): Promise<ProjectUnit> => {
    return fetchApi(`${PROJECTS_BASE}/units/${unitId}/handover`, {
      method: 'POST',
      body: JSON.stringify({ handover_date }),
    });
  },

  // Cancel reservation
  cancelReservation: (unitId: string, reason?: string): Promise<ProjectUnit> => {
    return fetchApi(`${PROJECTS_BASE}/units/${unitId}/cancel-reservation`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  // Add upgrade
  addUpgrade: (unitId: string, upgrade: Partial<UnitUpgrade>): Promise<ProjectUnit> => {
    return fetchApi(`${PROJECTS_BASE}/units/${unitId}/upgrades`, {
      method: 'POST',
      body: JSON.stringify(upgrade),
    });
  },

  // Remove upgrade
  removeUpgrade: (unitId: string, upgradeId: string): Promise<ProjectUnit> => {
    return fetchApi(`${PROJECTS_BASE}/units/${unitId}/upgrades/${upgradeId}`, {
      method: 'DELETE',
    });
  },

  // Record payment
  recordPayment: (unitId: string, amount: number): Promise<ProjectUnit> => {
    return fetchApi(`${PROJECTS_BASE}/units/${unitId}/payments`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
  },

  // Link to deal
  linkDeal: (unitId: string, dealId: string): Promise<ProjectUnit> => {
    return fetchApi(`${PROJECTS_BASE}/units/${unitId}/link-deal`, {
      method: 'POST',
      body: JSON.stringify({ deal_id: dealId }),
    });
  },

  // Delete unit
  delete: (unitId: string): Promise<void> => {
    return fetchApi(`${PROJECTS_BASE}/units/${unitId}`, {
      method: 'DELETE',
    });
  },
};

// =====================================================
// COSTS API
// =====================================================

export const costsApi = {
  // Get project costs
  getByProject: (projectId: string, filters?: CostFilters): Promise<ProjectCost[]> => {
    const params = new URLSearchParams();
    if (filters?.category) params.set('category', filters.category);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.phase_id) params.set('phase_id', filters.phase_id);
    if (filters?.contractor_id) params.set('contractor_id', filters.contractor_id);
    if (filters?.search) params.set('search', filters.search);

    const query = params.toString();
    return fetchApi(`${PROJECTS_BASE}/${projectId}/costs${query ? `?${query}` : ''}`);
  },

  // Get budget summary
  getBudgetSummary: (projectId: string): Promise<BudgetSummary> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/budget`);
  },

  // Get cost codes
  getCostCodes: (): Promise<CostCode[]> => {
    return fetchApi(`${PROJECTS_BASE}/cost-codes`);
  },

  // Create cost
  create: (projectId: string, data: Partial<ProjectCost>): Promise<ProjectCost> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/costs`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Create from template
  createFromTemplate: (projectId: string): Promise<ProjectCost[]> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/costs/from-template`, {
      method: 'POST',
    });
  },

  // Update cost
  update: (costId: string, data: Partial<ProjectCost>): Promise<ProjectCost> => {
    return fetchApi(`${PROJECTS_BASE}/costs/${costId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Record invoice
  recordInvoice: (costId: string, data: {
    invoice_number: string;
    invoice_date: string;
    due_date: string;
    amount: number;
    document_url?: string;
  }): Promise<ProjectCost> => {
    return fetchApi(`${PROJECTS_BASE}/costs/${costId}/invoice`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Approve for payment
  approve: (costId: string): Promise<ProjectCost> => {
    return fetchApi(`${PROJECTS_BASE}/costs/${costId}/approve`, {
      method: 'POST',
    });
  },

  // Record payment
  pay: (costId: string, data: {
    payment_reference: string;
    payment_method: string;
  }): Promise<ProjectCost> => {
    return fetchApi(`${PROJECTS_BASE}/costs/${costId}/pay`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Bulk approve
  bulkApprove: (costIds: string[]): Promise<{ approved_count: number }> => {
    return fetchApi(`${PROJECTS_BASE}/costs/bulk-approve`, {
      method: 'POST',
      body: JSON.stringify({ cost_ids: costIds }),
    });
  },

  // Delete cost
  delete: (costId: string): Promise<void> => {
    return fetchApi(`${PROJECTS_BASE}/costs/${costId}`, {
      method: 'DELETE',
    });
  },
};

// =====================================================
// CONTRACTORS API
// =====================================================

export const contractorsApi = {
  // Get all contractors
  getAll: (filters?: ContractorFilters): Promise<Contractor[]> => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.trade) params.set('trade', filters.trade);
    if (filters?.search) params.set('search', filters.search);

    const query = params.toString();
    return fetchApi(`${PROJECTS_BASE}/contractors${query ? `?${query}` : ''}`);
  },

  // Get contractor performance
  getPerformance: (): Promise<ContractorPerformance[]> => {
    return fetchApi(`${PROJECTS_BASE}/contractors/performance`);
  },

  // Get trades list
  getTrades: (): Promise<string[]> => {
    return fetchApi(`${PROJECTS_BASE}/contractors/trades`);
  },

  // Get single contractor
  getById: (contractorId: string): Promise<Contractor> => {
    return fetchApi(`${PROJECTS_BASE}/contractors/${contractorId}`);
  },

  // Create contractor
  create: (data: Partial<Contractor>): Promise<Contractor> => {
    return fetchApi(`${PROJECTS_BASE}/contractors`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update contractor
  update: (contractorId: string, data: Partial<Contractor>): Promise<Contractor> => {
    return fetchApi(`${PROJECTS_BASE}/contractors/${contractorId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Approve contractor
  approve: (contractorId: string): Promise<Contractor> => {
    return fetchApi(`${PROJECTS_BASE}/contractors/${contractorId}/approve`, {
      method: 'POST',
    });
  },

  // Activate contractor
  activate: (contractorId: string): Promise<Contractor> => {
    return fetchApi(`${PROJECTS_BASE}/contractors/${contractorId}/activate`, {
      method: 'POST',
    });
  },

  // Suspend contractor
  suspend: (contractorId: string): Promise<Contractor> => {
    return fetchApi(`${PROJECTS_BASE}/contractors/${contractorId}/suspend`, {
      method: 'POST',
    });
  },

  // Rate contractor
  rate: (contractorId: string, rating: number): Promise<Contractor> => {
    return fetchApi(`${PROJECTS_BASE}/contractors/${contractorId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
    });
  },

  // Add document
  addDocument: (contractorId: string, document: {
    document_type: string;
    document_name: string;
    document_url: string;
    expiry_date?: string;
  }): Promise<Contractor> => {
    return fetchApi(`${PROJECTS_BASE}/contractors/${contractorId}/documents`, {
      method: 'POST',
      body: JSON.stringify(document),
    });
  },

  // Get contractor assignments
  getAssignments: (contractorId: string): Promise<ContractorAssignment[]> => {
    return fetchApi(`${PROJECTS_BASE}/contractors/${contractorId}/assignments`);
  },

  // Delete contractor
  delete: (contractorId: string): Promise<void> => {
    return fetchApi(`${PROJECTS_BASE}/contractors/${contractorId}`, {
      method: 'DELETE',
    });
  },
};

// =====================================================
// CONTRACTOR ASSIGNMENTS API
// =====================================================

export const assignmentsApi = {
  // Get project assignments
  getByProject: (projectId: string): Promise<ContractorAssignment[]> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/contractors`);
  },

  // Create assignment
  create: (projectId: string, data: Partial<ContractorAssignment>): Promise<ContractorAssignment> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/contractors`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update assignment
  update: (assignmentId: string, data: Partial<ContractorAssignment>): Promise<ContractorAssignment> => {
    return fetchApi(`${PROJECTS_BASE}/assignments/${assignmentId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Update progress
  updateProgress: (assignmentId: string, percentage: number): Promise<ContractorAssignment> => {
    return fetchApi(`${PROJECTS_BASE}/assignments/${assignmentId}/progress`, {
      method: 'PATCH',
      body: JSON.stringify({ percentage }),
    });
  },

  // Record billing
  recordBilling: (assignmentId: string, amount: number): Promise<ContractorAssignment> => {
    return fetchApi(`${PROJECTS_BASE}/assignments/${assignmentId}/bill`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
  },

  // Record payment
  recordPayment: (assignmentId: string, amount: number): Promise<ContractorAssignment> => {
    return fetchApi(`${PROJECTS_BASE}/assignments/${assignmentId}/pay`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
  },

  // Complete assignment
  complete: (assignmentId: string): Promise<ContractorAssignment> => {
    return fetchApi(`${PROJECTS_BASE}/assignments/${assignmentId}/complete`, {
      method: 'POST',
    });
  },
};


// =====================================================
// DASHBOARD ANALYTICS API (Phase 2)
// =====================================================

export interface PortfolioMetrics {
  totalProjects: number;
  projectsByStatus: Record<string, number>;
  totalBudget: { amount: number; currency: string };
  totalSpent: { amount: number; currency: string };
  budgetUtilization: number;
  avgProgress: number;
  projectsAtRisk: number;
  monthOverMonthChange: number;
}

export interface BudgetOverview {
  categories: Array<{
    category: string;
    budgeted: number;
    spent: number;
    remaining: number;
    percentage: number;
  }>;
  totalBudget: number;
  totalSpent: number;
  totalRemaining: number;
  currency: string;
}

export interface TimelineStatus {
  onTrack: number;
  delayed: number;
  atRisk: number;
  completed: number;
  averageDelayDays: number;
}

export interface ComplianceStatus {
  score: number;
  permits: {
    valid: number;
    expiringSoon: number;
    expired: number;
    pending: number;
  };
  inspections: {
    passed: number;
    failed: number;
    pending: number;
  };
}

export interface ProjectHealthScore {
  overall: number;
  budget: number;
  timeline: number;
  compliance: number;
  quality: number;
  riskFactors: Array<{
    factor: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    impact: number;
  }>;
}

export interface ProjectAlert {
  id: string;
  projectId: string;
  projectName: string;
  type: 'budget' | 'timeline' | 'milestone' | 'permit' | 'compliance';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  createdAt: string;
  isRead: boolean;
  metadata?: Record<string, any>;
}

export interface ProgressTrend {
  data: Array<{
    date: string;
    progress: number;
    budgetSpent: number;
  }>;
  currentProgress: number;
  projectedCompletion: string;
}

export interface CompletionForecast {
  estimatedEndDate: string;
  confidenceLevel: number;
  daysRemaining: number;
  isOnTrack: boolean;
  factors: Array<{
    factor: string;
    impact: 'positive' | 'negative' | 'neutral';
    description: string;
  }>;
}

export const dashboardApi = {
  // Get portfolio metrics
  getPortfolioMetrics: (): Promise<PortfolioMetrics> => {
    return fetchApi(`${PROJECTS_BASE}/dashboard/metrics`);
  },

  // Get budget overview
  getBudgetOverview: (): Promise<BudgetOverview> => {
    return fetchApi(`${PROJECTS_BASE}/dashboard/budget-overview`);
  },

  // Get timeline status
  getTimelineStatus: (): Promise<TimelineStatus> => {
    return fetchApi(`${PROJECTS_BASE}/dashboard/timeline-status`);
  },

  // Get compliance status
  getComplianceStatus: (): Promise<ComplianceStatus> => {
    return fetchApi(`${PROJECTS_BASE}/dashboard/compliance-status`);
  },

  // Get active alerts
  getAlerts: (limit?: number): Promise<ProjectAlert[]> => {
    const params = limit ? `?limit=${limit}` : '';
    return fetchApi(`${PROJECTS_BASE}/dashboard/alerts${params}`);
  },

  // Get upcoming milestones
  getUpcomingMilestones: (days?: number): Promise<ProjectMilestone[]> => {
    const params = days ? `?days=${days}` : '';
    return fetchApi(`${PROJECTS_BASE}/dashboard/upcoming-milestones${params}`);
  },

  // Get project health score
  getProjectHealthScore: (projectId: string): Promise<ProjectHealthScore> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/health-score`);
  },

  // Get budget variance
  getBudgetVariance: (projectId: string): Promise<any> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/budget-variance`);
  },

  // Get progress trend
  getProgressTrend: (projectId: string, days?: number): Promise<ProgressTrend> => {
    const params = days ? `?days=${days}` : '';
    return fetchApi(`${PROJECTS_BASE}/${projectId}/progress-trend${params}`);
  },

  // Forecast completion
  forecastCompletion: (projectId: string): Promise<CompletionForecast> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/forecast-completion`);
  },

  // Dismiss alert
  dismissAlert: (alertId: string): Promise<void> => {
    return fetchApi(`${PROJECTS_BASE}/dashboard/alerts/${alertId}/dismiss`, {
      method: 'POST',
    });
  },

  // Snooze alert
  snoozeAlert: (alertId: string, hours: number): Promise<void> => {
    return fetchApi(`${PROJECTS_BASE}/dashboard/alerts/${alertId}/snooze`, {
      method: 'POST',
      body: JSON.stringify({ hours }),
    });
  },
};

// =====================================================
// MILESTONES API (Phase 2)
// =====================================================

export interface ProjectMilestone {
  id: string;
  project_id: string;
  phase_id?: string;
  name: string;
  description?: string;
  target_date: string;
  actual_date?: string;
  status: 'pending' | 'completed' | 'missed' | 'rescheduled';
  milestone_type?: string;
  is_ghana_specific: boolean;
  phase_name?: string;
  project_name?: string;
  created_at: string;
  updated_at: string;
}

export interface MilestoneTemplate {
  id: string;
  name: string;
  description?: string;
  milestone_type: string;
  default_phase: string;
  is_ghana_specific: boolean;
  typical_duration_days?: number;
  display_order: number;
}

export interface MilestoneStats {
  total: number;
  pending: number;
  completed: number;
  missed: number;
  rescheduled: number;
  upcomingThisWeek: number;
  upcomingThisMonth: number;
  completionRate: number;
  onTimeRate: number;
}

export const milestonesApi = {
  // Get milestones for a project
  getByProject: (projectId: string, status?: string): Promise<ProjectMilestone[]> => {
    const params = status ? `?status=${status}` : '';
    return fetchApi(`${PROJECTS_BASE}/${projectId}/milestones${params}`);
  },

  // Get upcoming milestones across all projects
  getUpcoming: (options?: { days?: number }): Promise<ProjectMilestone[]> => {
    const params = options?.days ? `?days=${options.days}` : '';
    return fetchApi(`${PROJECTS_BASE}/milestones/upcoming${params}`);
  },

  // Get milestone by ID
  getById: (milestoneId: string): Promise<ProjectMilestone> => {
    return fetchApi(`${PROJECTS_BASE}/milestones/${milestoneId}`);
  },

  // Create milestone
  create: (projectId: string, data: Partial<ProjectMilestone>): Promise<ProjectMilestone> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/milestones`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update milestone
  update: (milestoneId: string, data: Partial<ProjectMilestone>): Promise<ProjectMilestone> => {
    return fetchApi(`${PROJECTS_BASE}/milestones/${milestoneId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Complete milestone
  complete: (milestoneId: string, actualDate?: string): Promise<ProjectMilestone> => {
    return fetchApi(`${PROJECTS_BASE}/milestones/${milestoneId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ actual_date: actualDate }),
    });
  },

  // Reschedule milestone
  reschedule: (milestoneId: string, newDate: string, reason?: string): Promise<ProjectMilestone> => {
    return fetchApi(`${PROJECTS_BASE}/milestones/${milestoneId}/reschedule`, {
      method: 'POST',
      body: JSON.stringify({ new_date: newDate, reason }),
    });
  },

  // Delete milestone
  delete: (milestoneId: string): Promise<void> => {
    return fetchApi(`${PROJECTS_BASE}/milestones/${milestoneId}`, {
      method: 'DELETE',
    });
  },

  // Get milestone templates
  getTemplates: (): Promise<MilestoneTemplate[]> => {
    return fetchApi(`${PROJECTS_BASE}/milestone-templates`);
  },

  // Apply Ghana milestone templates
  applyGhanaTemplates: (projectId: string, startDate: string): Promise<ProjectMilestone[]> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/milestones/apply-ghana-templates`, {
      method: 'POST',
      body: JSON.stringify({ start_date: startDate }),
    });
  },

  // Get milestone stats
  getStats: (projectId: string): Promise<MilestoneStats> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/milestones/stats`);
  },
};

// =====================================================
// GANTT CHART API (Phase 2)
// =====================================================

export interface GanttPhase {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  progress: number;
  status: PhaseStatus;
  isCriticalPath: boolean;
  slackDays: number;
  dependencyIds: string[];
  baselineStartDate?: string;
  baselineEndDate?: string;
  color?: string;
}

export interface GanttMilestone {
  id: string;
  phaseId?: string;
  name: string;
  date: string;
  status: string;
  type?: string;
  isGhanaSpecific: boolean;
}

export interface GanttDependency {
  fromPhaseId: string;
  toPhaseId: string;
  type: 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish';
}

export interface GanttDataResponse {
  phases: GanttPhase[];
  milestones: GanttMilestone[];
  dependencies: GanttDependency[];
  criticalPath: string[];
  startDate: string;
  endDate: string;
  totalDurationDays: number;
  hasBaseline: boolean;
}

export interface ProjectBaseline {
  id: string;
  project_id: string;
  name: string;
  snapshot_data: any;
  is_active: boolean;
  created_at: string;
  created_by?: string;
}

export interface BaselineComparison {
  baseline: ProjectBaseline;
  current: {
    phases: any[];
    milestones: any[];
  };
  variance: {
    daysVariance: number;
    budgetVariance: number;
    phaseVariances: Array<{
      phaseId: string;
      phaseName: string;
      startVariance: number;
      endVariance: number;
      progressVariance: number;
    }>;
  };
}

export const ganttApi = {
  // Get Gantt data for a project
  getData: (projectId: string): Promise<GanttDataResponse> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/gantt`);
  },

  // Calculate critical path
  calculateCriticalPath: (projectId: string): Promise<{ criticalPath: string[]; totalDuration: number }> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/gantt/calculate-critical-path`, {
      method: 'POST',
    });
  },

  // Update phase dates
  updatePhaseDates: (phaseId: string, dates: { start_date?: string; end_date?: string; cascade?: boolean }): Promise<any> => {
    return fetchApi(`${PROJECTS_BASE}/gantt/phases/${phaseId}/dates`, {
      method: 'PUT',
      body: JSON.stringify(dates),
    });
  },

  // Update phase dependencies
  updateDependencies: (phaseId: string, dependencyIds: string[]): Promise<any> => {
    return fetchApi(`${PROJECTS_BASE}/gantt/phases/${phaseId}/dependencies`, {
      method: 'PUT',
      body: JSON.stringify({ dependency_ids: dependencyIds }),
    });
  },

  // Get baselines
  getBaselines: (projectId: string): Promise<ProjectBaseline[]> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/baselines`);
  },

  // Create baseline
  createBaseline: (projectId: string, name: string): Promise<ProjectBaseline> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/baselines`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  // Set active baseline
  setActiveBaseline: (projectId: string, baselineId: string): Promise<void> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/baselines/${baselineId}/set-active`, {
      method: 'POST',
    });
  },

  // Get baseline comparison
  getBaselineComparison: (projectId: string, baselineId: string): Promise<BaselineComparison> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/baselines/${baselineId}/comparison`);
  },

  // Delete baseline
  deleteBaseline: (projectId: string, baselineId: string): Promise<void> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/baselines/${baselineId}`, {
      method: 'DELETE',
    });
  },
};

// =====================================================
// LOCATION VALIDATION API (Phase 1)
// =====================================================

export interface GhanaPostValidation {
  valid: boolean;
  gpsCode: string;
  address?: string;
  district?: string;
  region?: string;
  latitude?: number;
  longitude?: number;
  confidence?: number;
  error?: string;
}

export interface LocationValidation {
  isValid: boolean;
  region?: string;
  district?: string;
  area?: string;
  coordinates?: { lat: number; lng: number };
  gpsCode?: string;
  confidence?: number;
  message?: string;
}

export interface CostEstimate {
  total_estimated_cost_ghs: number;
  total_estimated_cost_display: number;
  display_currency: string;
  cost_per_sqm_ghs: number;
  cost_per_sqm_display: number;
  breakdown: Array<{
    category: string;
    description: string;
    estimated_cost_ghs: number;
    estimated_cost_display: number;
    display_currency: string;
    percentage_of_total: number;
    unit_cost_per_sqm?: number;
    data_source: string;
    confidence: number;
  }>;
  assumptions: string[];
  data_sources: string[];
  generated_at: string;
  valid_for_days: number;
}

export const locationApi = {
  // Validate Ghana PostGPS code
  validateGPS: (gpsCode: string): Promise<GhanaPostValidation> => {
    return fetchApi(`${PROJECTS_BASE}/validate-gps`, {
      method: 'POST',
      body: JSON.stringify({ gps_code: gpsCode }),
    });
  },

  // Reverse geocode coordinates
  reverseGeocode: (lat: number, lng: number): Promise<LocationValidation> => {
    return fetchApi(`${PROJECTS_BASE}/reverse-geocode`, {
      method: 'POST',
      body: JSON.stringify({ latitude: lat, longitude: lng }),
    });
  },

  // Validate location
  validateLocation: (data: { gps_code?: string; latitude?: number; longitude?: number }): Promise<LocationValidation> => {
    return fetchApi(`${PROJECTS_BASE}/validate-location`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get Ghana regions
  getRegions: (): Promise<string[]> => {
    return fetchApi(`${PROJECTS_BASE}/ghana-regions`);
  },

  // Get districts by region
  getDistricts: (region: string): Promise<string[]> => {
    return fetchApi(`${PROJECTS_BASE}/ghana-districts?region=${encodeURIComponent(region)}`);
  },
};

// =====================================================
// COST ESTIMATION API (Phase 1)
// =====================================================

export const costEstimationApi = {
  // Get cost estimate
  estimate: (params: {
    project_type: string;
    region: string;
    total_sqm: number;
    total_floors?: number;
    finish_level?: string;
    include_land?: boolean;
    land_cost_per_sqm?: number;
    display_currency?: string;
  }): Promise<CostEstimate> => {
    return fetchApi(`${PROJECTS_BASE}/estimate-costs`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  // Get budget breakdown suggestion
  suggestBudgetBreakdown: (projectType: string, region: string): Promise<any> => {
    return fetchApi(`${PROJECTS_BASE}/suggest-budget-breakdown`, {
      method: 'POST',
      body: JSON.stringify({ project_type: projectType, region }),
    });
  },

  // Get required permits by location
  getRequiredPermits: (projectType: string, assembly: string): Promise<any[]> => {
    return fetchApi(`${PROJECTS_BASE}/required-permits?project_type=${projectType}&assembly=${encodeURIComponent(assembly)}`);
  },
};

// =====================================================
// WIZARD / DRAFTS API (Phase 1)
// =====================================================

export interface ProjectDraft {
  id: string;
  organization_id: string;
  created_by?: string;
  current_step: number;
  step_data: Record<string, any>;
  is_complete: boolean;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

// =====================================================
// CONSTRUCTION OPS API (The Gaps)
// =====================================================
export const constructionApi = {
  // Log Site Diary (Informal Labor + Weather)
  logSiteDiary: (projectId: string, data: {
    reportDate: string;
    weatherCondition: string;
    informalLaborCount: number;
    informalLaborNotes?: string;
    workPerformed?: string;
    incidentsOrDelays?: string;
  }): Promise<any> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/site-diary`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Record Chop Money / Petty Cash
  recordPettyCash: (projectId: string, data: {
    amount: number;
    currency: string;
    recipientName: string;
    category: 'transport' | 'food' | 'tips' | 'airtime' | 'misc';
    description?: string;
  }): Promise<any> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/petty-cash`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Market Price Intelligence
  getMarketPrices: (filters?: { region?: string, category?: string }): Promise<any[]> => {
    const params = new URLSearchParams();
    if (filters?.region) params.set('region', filters.region);
    if (filters?.category) params.set('category', filters.category);
    return fetchApi(`/market-intelligence/prices?${params.toString()}`);
  },
};

export const wizardApi = {
  // Create draft
  createDraft: (): Promise<ProjectDraft> => {
    return fetchApi(`${PROJECTS_BASE}/wizard/drafts`, {
      method: 'POST',
    });
  },

  // Get draft
  getDraft: (draftId: string): Promise<ProjectDraft> => {
    return fetchApi(`${PROJECTS_BASE}/wizard/drafts/${draftId}`);
  },

  // Update draft (using PATCH as per backend route)
  updateDraft: (draftId: string, data: { step?: string; data?: Record<string, any>; isAutoSave?: boolean }): Promise<ProjectDraft> => {
    return fetchApi(`${PROJECTS_BASE}/wizard/drafts/${draftId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Save draft (create or update)
  saveDraft: async (data: { draftId?: string; step: string; data: any }): Promise<ProjectDraft> => {
    if (data.draftId) {
      return wizardApi.updateDraft(data.draftId, {
        step: data.step,
        data: data.data,
        isAutoSave: true
      });
    }
    const draft = await wizardApi.createDraft();
    return wizardApi.updateDraft(draft.id, {
      step: data.step,
      data: data.data,
      isAutoSave: true
    });
  },

  // Delete draft
  deleteDraft: (draftId: string): Promise<void> => {
    return fetchApi(`${PROJECTS_BASE}/wizard/drafts/${draftId}`, {
      method: 'DELETE',
    });
  },

  // Get user's drafts
  getMyDrafts: (): Promise<ProjectDraft[]> => {
    return fetchApi(`${PROJECTS_BASE}/wizard/drafts`);
  },

  // Create project from draft (submit wizard)
  createFromDraft: (draftId: string): Promise<DevelopmentProject> => {
    return fetchApi(`${PROJECTS_BASE}/wizard/drafts/${draftId}/submit`, {
      method: 'POST',
    });
  },

  // Send resume link to email
  sendResumeLink: (draftId: string, email?: string): Promise<void> => {
    return fetchApi(`${PROJECTS_BASE}/drafts/${draftId}/send-resume-link`, {
      method: 'POST',
      body: email ? JSON.stringify({ email }) : undefined,
    });
  },

  // Get smart defaults
  getSmartDefaults: (projectType: string, region?: string): Promise<any> => {
    const params = new URLSearchParams({ project_type: projectType });
    if (region) params.set('region', region);
    return fetchApi(`${PROJECTS_BASE}/smart-defaults?${params}`);
  },
};

// =====================================================
// COMPLIANCE API (Phase 3)
// =====================================================

export interface ProjectPermit {
  id: string;
  project_id: string;
  organization_id: string;
  permit_type: string;
  permit_name: string;
  description?: string;
  authority_id?: string;
  authority_name?: string;
  authority_contact?: string;
  application_date?: string;
  application_reference?: string;
  expected_approval_date?: string;
  approval_date?: string;
  approval_reference?: string;
  approved_by?: string;
  approval_document_url?: string;
  effective_date?: string;
  expiration_date?: string;
  renewal_reminder_days: number;
  renewal_reminder_sent: boolean;
  status: PermitStatus;
  conditions?: string;
  fees_paid?: number;
  fees_currency: string;
  receipt_url?: string;
  related_document_ids: string[];
  notes?: string;
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
}

export type PermitType =
  | 'development_permit'
  | 'building_permit'
  | 'epa_permit'
  | 'fire_certificate'
  | 'occupancy_permit'
  | 'water_connection'
  | 'electricity_connection'
  | 'highway_access'
  | 'aviation_clearance'
  | 'forestry_clearance'
  | 'mining_rights'
  | 'land_title'
  | 'stool_lands_consent'
  | 'traditional_authority_approval'
  | 'works_permit'
  | 'demolition_permit'
  | 'excavation_permit'
  | 'crane_permit'
  | 'hoarding_permit'
  | 'signage_permit'
  | 'other';

export type PermitStatus =
  | 'not_required'
  | 'not_started'
  | 'documents_gathering'
  | 'application_submitted'
  | 'under_review'
  | 'additional_info_required'
  | 'approved'
  | 'approved_with_conditions'
  | 'rejected'
  | 'expired'
  | 'renewed';

export type InspectionResult =
  | 'passed'
  | 'passed_with_observations'
  | 'conditional_pass'
  | 'failed'
  | 'reinspection_required'
  | 'cancelled';

export interface PermitInspection {
  id: string;
  permit_id: string;
  project_id: string;
  inspection_type: string;
  inspector_name?: string;
  inspector_organization?: string;
  inspector_contact?: string;
  scheduled_date?: string;
  actual_date?: string;
  result?: InspectionResult;
  findings?: string;
  deficiencies?: string;
  recommendations?: string;
  certificate_issued: boolean;
  certificate_number?: string;
  certificate_url?: string;
  follow_up_required: boolean;
  follow_up_date?: string;
  photos: string[];
  attachments: string[];
  conducted_by?: string;
  created_at: string;
  updated_at: string;
  permit_name?: string;
  permit_type?: string;
}

export interface ComplianceScore {
  id: string;
  project_id: string;
  organization_id: string;
  total_permits: number;
  approved_permits: number;
  pending_permits: number;
  expired_permits: number;
  rejected_permits: number;
  compliance_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  last_calculated_at: string;
  created_at: string;
  updated_at: string;
}

export interface RegulatoryAuthority {
  id: string;
  name: string;
  abbreviation?: string;
  authority_type: string;
  address?: string;
  city?: string;
  region?: string;
  phone?: string;
  email?: string;
  website?: string;
  permit_types: PermitType[];
  typical_processing_days?: number;
  application_fees?: any;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RegulatoryTemplate {
  id: string;
  template_name: string;
  description?: string;
  region: string;
  assembly?: string;
  project_types: string[];
  required_permits: PermitType[];
  recommended_sequence?: any;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ComplianceDashboard {
  score: ComplianceScore | null;
  permits: ProjectPermit[];
  upcoming_inspections: PermitInspection[];
  expiring_soon: ProjectPermit[];
  recent_activity: any[];
}

export interface ComplianceSummary {
  total_projects: number;
  avg_score: number;
  by_risk_level: Record<string, number>;
  expiring_permits: number;
  expired_permits: number;
}

export const complianceApi = {
  // Get compliance dashboard for a project
  getDashboard: (projectId: string): Promise<ComplianceDashboard> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/compliance`);
  },

  // Get compliance score
  getScore: (projectId: string): Promise<ComplianceScore> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/compliance/score`);
  },

  // Get permits for a project
  getPermits: (projectId: string, filters?: { status?: PermitStatus; type?: PermitType; expiring?: number }): Promise<ProjectPermit[]> => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.type) params.set('type', filters.type);
    if (filters?.expiring) params.set('expiring', String(filters.expiring));
    const query = params.toString();
    return fetchApi(`${PROJECTS_BASE}/${projectId}/permits${query ? `?${query}` : ''}`);
  },

  // Create a permit
  createPermit: (projectId: string, data: Partial<ProjectPermit>): Promise<ProjectPermit> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/permits`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get a specific permit
  getPermit: (projectId: string, permitId: string): Promise<ProjectPermit> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/permits/${permitId}`);
  },

  // Update a permit
  updatePermit: (projectId: string, permitId: string, data: Partial<ProjectPermit>): Promise<ProjectPermit> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/permits/${permitId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Delete a permit
  deletePermit: (projectId: string, permitId: string): Promise<void> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/permits/${permitId}`, {
      method: 'DELETE',
    });
  },

  // Get inspections for a permit
  getInspections: (projectId: string, permitId: string): Promise<PermitInspection[]> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/permits/${permitId}/inspections`);
  },

  // Get all inspections for a project
  getAllInspections: (projectId: string): Promise<PermitInspection[]> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/inspections`);
  },

  // Create an inspection
  createInspection: (projectId: string, permitId: string, data: Partial<PermitInspection>): Promise<PermitInspection> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/permits/${permitId}/inspections`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update an inspection
  updateInspection: (projectId: string, inspectionId: string, data: Partial<PermitInspection>): Promise<PermitInspection> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/inspections/${inspectionId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Delete an inspection
  deleteInspection: (projectId: string, inspectionId: string): Promise<void> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/inspections/${inspectionId}`, {
      method: 'DELETE',
    });
  },

  // Get regulatory authorities
  getAuthorities: (region?: string): Promise<RegulatoryAuthority[]> => {
    const params = region ? `?region=${encodeURIComponent(region)}` : '';
    return fetchApi(`${PROJECTS_BASE}/compliance/authorities${params}`);
  },

  // Get regulatory templates
  getTemplates: (region?: string, projectType?: string): Promise<RegulatoryTemplate[]> => {
    const params = new URLSearchParams();
    if (region) params.set('region', region);
    if (projectType) params.set('project_type', projectType);
    const query = params.toString();
    return fetchApi(`${PROJECTS_BASE}/compliance/templates${query ? `?${query}` : ''}`);
  },

  // Apply regulatory template
  applyTemplate: (projectId: string, templateId: string): Promise<ProjectPermit[]> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/compliance/apply-template`, {
      method: 'POST',
      body: JSON.stringify({ templateId }),
    });
  },

  // Get expiring permits
  getExpiringPermits: (days?: number): Promise<(ProjectPermit & { project_name: string })[]> => {
    const params = days ? `?days=${days}` : '';
    return fetchApi(`${PROJECTS_BASE}/compliance/expiring${params}`);
  },

  // Get expired permits
  getExpiredPermits: (): Promise<(ProjectPermit & { project_name: string })[]> => {
    return fetchApi(`${PROJECTS_BASE}/compliance/expired`);
  },

  // Get compliance summary for organization
  getSummary: (): Promise<ComplianceSummary> => {
    return fetchApi(`${PROJECTS_BASE}/compliance/summary`);
  },
};

// =====================================================
// DOCUMENTS API (Phase 3)
// =====================================================

export type DocumentType =
  // Pre-Development
  | 'land_title'
  | 'indenture'
  | 'consent_letter'
  | 'site_plan'
  | 'survey_report'
  | 'title_search'
  | 'deed'
  | 'survey_plan'
  | 'site_investigation'
  | 'feasibility_study'
  // Design
  | 'architectural_drawing'
  | 'structural_drawing'
  | 'mep_drawing'
  | 'landscape_plan'
  | 'specification'
  // Construction
  | 'main_contract'
  | 'contract'
  | 'variation_order'
  | 'progress_report'
  | 'site_photo'
  | 'daily_log'
  | 'weekly_report'
  | 'inspection_report'
  // Financial
  | 'invoice'
  | 'receipt'
  | 'budget'
  | 'payment_certificate'
  | 'bank_guarantee'
  // Legal
  | 'agreement'
  | 'insurance'
  | 'legal_opinion'
  // Marketing
  | 'brochure'
  | 'floor_plan'
  | 'floor_plan_marketing'
  | 'render'
  | 'photography'
  | 'price_list'
  // Handover
  | 'snag_list'
  | 'warranty_document'
  // General
  | 'meeting_minutes'
  | 'correspondence'
  | 'other';

export type AccessLevel = 'public' | 'team' | 'restricted' | 'confidential' | 'private' | 'stakeholder';

export interface ProjectFolder {
  id: string;
  project_id: string;
  organization_id: string;
  parent_id?: string;
  name: string;
  description?: string;
  folder_type?: string;
  icon?: string;
  color?: string;
  sort_order: number;
  is_system: boolean;
  is_system_folder?: boolean; // alias for is_system
  auto_categorize: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
  children?: ProjectFolder[];
  document_count?: number;
}

export interface ProjectDocument {
  id: string;
  project_id: string;
  folder_id?: string;
  organization_id: string;
  name: string;
  original_filename?: string;
  description?: string;
  document_type?: string;
  file_url: string;
  file_key?: string;
  file_extension?: string;
  thumbnail_url?: string;
  file_size?: number;
  mime_type?: string;
  version: number;
  current_version?: number; // alias for version
  is_current: boolean;
  previous_version_id?: string;
  version_notes?: string;
  tags: string[];
  metadata: Record<string, any>;
  expiration_date?: string;
  expiration_reminder_days: number;
  access_level: AccessLevel;
  shared_with: string[];
  status: 'active' | 'archived' | 'deleted';
  related_permit_id?: string;
  related_phase_id?: string;
  related_milestone_id?: string;
  uploaded_by?: string;
  created_by_name?: string; // uploader's display name
  last_accessed_at?: string;
  last_accessed_by?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version: number;
  version_number: number; // alias for version
  file_url: string;
  file_key?: string;
  file_size?: number;
  change_summary?: string;
  change_notes?: string; // alias for change_summary
  changed_by?: string;
  created_by_name?: string;
  metadata_snapshot?: Record<string, any>;
  created_at: string;
}

export interface DocumentTemplate {
  id: string;
  organization_id?: string;
  name: string;
  description?: string;
  template_type: string;
  category?: string;
  template_url?: string;
  template_content?: string;
  format?: string;
  variables: any[];
  preview_url?: string;
  thumbnail_url?: string;
  is_ghana_specific: boolean;
  applicable_regions?: string[];
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentShare {
  id: string;
  document_id: string;
  share_token: string;
  share_url?: string;
  expires_at?: string;
  max_downloads?: number;
  download_count: number;
  recipient_email?: string;
  recipient_name?: string;
  can_download: boolean;
  can_view_only: boolean;
  last_accessed_at?: string;
  access_log: any[];
  created_by?: string;
  created_at: string;
}

export interface DocumentStats {
  total_documents: number;
  by_type: Record<string, number>;
  by_folder: { folder_id: string; folder_name: string; count: number }[];
  total_size_bytes: number;
  total_size?: number; // alias for total_size_bytes
  recent_uploads: ProjectDocument[];
}

export const documentsApi = {
  // Get folder tree for a project
  getFolders: (projectId: string, asTree?: boolean): Promise<ProjectFolder[]> => {
    const params = asTree ? '?tree=true' : '';
    return fetchApi(`${PROJECTS_BASE}/${projectId}/folders${params}`);
  },

  // Create a folder
  createFolder: (projectId: string, data: Partial<ProjectFolder>): Promise<ProjectFolder> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/folders`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update a folder
  updateFolder: (projectId: string, folderId: string, data: Partial<ProjectFolder>): Promise<ProjectFolder> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/folders/${folderId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Delete a folder
  deleteFolder: (projectId: string, folderId: string, moveDocumentsTo?: string): Promise<void> => {
    const params = moveDocumentsTo ? `?moveDocumentsTo=${moveDocumentsTo}` : '';
    return fetchApi(`${PROJECTS_BASE}/${projectId}/folders/${folderId}${params}`, {
      method: 'DELETE',
    });
  },

  // Get documents for a project
  getDocuments: (projectId: string, filters?: { folder?: string; type?: string; tags?: string[]; search?: string; expiring?: number }): Promise<ProjectDocument[]> => {
    const params = new URLSearchParams();
    if (filters?.folder) params.set('folder', filters.folder);
    if (filters?.type) params.set('type', filters.type);
    if (filters?.tags) params.set('tags', filters.tags.join(','));
    if (filters?.search) params.set('search', filters.search);
    if (filters?.expiring) params.set('expiring', String(filters.expiring));
    const query = params.toString();
    return fetchApi(`${PROJECTS_BASE}/${projectId}/documents${query ? `?${query}` : ''}`);
  },

  // Get documents by folder
  getDocumentsByFolder: (projectId: string, folderId: string): Promise<ProjectDocument[]> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/folders/${folderId}/documents`);
  },

  // Get document statistics
  getStats: (projectId: string): Promise<DocumentStats> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/documents/stats`);
  },

  // Alias for getStats
  getDocumentStats: (projectId: string): Promise<DocumentStats> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/documents/stats`);
  },

  // Create a document
  createDocument: (projectId: string, data: Partial<ProjectDocument>): Promise<ProjectDocument> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/documents`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get a specific document
  getDocument: (projectId: string, documentId: string): Promise<ProjectDocument> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/documents/${documentId}`);
  },

  // Update a document
  updateDocument: (projectId: string, documentId: string, data: Partial<ProjectDocument>): Promise<ProjectDocument> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/documents/${documentId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Delete a document
  deleteDocument: (projectId: string, documentId: string, hardDelete?: boolean): Promise<void> => {
    const params = hardDelete ? '?hard=true' : '';
    return fetchApi(`${PROJECTS_BASE}/${projectId}/documents/${documentId}${params}`, {
      method: 'DELETE',
    });
  },

  // Archive a document
  archiveDocument: (projectId: string, documentId: string): Promise<ProjectDocument> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/documents/${documentId}/archive`, {
      method: 'POST',
    });
  },

  // Restore a document
  restoreDocument: (projectId: string, documentId: string): Promise<ProjectDocument> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/documents/${documentId}/restore`, {
      method: 'POST',
    });
  },

  // Upload a new version
  uploadVersion: (projectId: string, documentId: string, data: { file_url: string; file_key?: string; file_size?: number; version_notes?: string }): Promise<ProjectDocument> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/documents/${documentId}/versions`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get document versions
  getVersions: (projectId: string, documentId: string): Promise<DocumentVersion[]> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/documents/${documentId}/versions`);
  },

  // Revert to a version
  revertToVersion: (projectId: string, documentId: string, versionId: string): Promise<ProjectDocument> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/documents/${documentId}/versions/${versionId}/revert`, {
      method: 'POST',
    });
  },

  // Create a share link
  createShare: (projectId: string, documentId: string, data: Partial<DocumentShare>): Promise<DocumentShare> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/documents/${documentId}/share`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get shares for a document
  getShares: (projectId: string, documentId: string): Promise<DocumentShare[]> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/documents/${documentId}/shares`);
  },

  // Delete a share
  deleteShare: (projectId: string, shareId: string): Promise<void> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/shares/${shareId}`, {
      method: 'DELETE',
    });
  },

  // Access shared document (public)
  accessShared: (shareToken: string, password?: string): Promise<ProjectDocument> => {
    const params = password ? `?password=${encodeURIComponent(password)}` : '';
    return fetchApi(`${PROJECTS_BASE}/shared/${shareToken}${params}`);
  },

  // Get document templates
  getTemplates: (category?: string, type?: string): Promise<DocumentTemplate[]> => {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (type) params.set('type', type);
    const query = params.toString();
    return fetchApi(`${PROJECTS_BASE}/documents/templates${query ? `?${query}` : ''}`);
  },

  // Get expiring documents
  getExpiringDocuments: (days?: number): Promise<(ProjectDocument & { project_name: string })[]> => {
    const params = days ? `?days=${days}` : '';
    return fetchApi(`${PROJECTS_BASE}/documents/expiring${params}`);
  },

  // Get expired documents
  getExpiredDocuments: (): Promise<(ProjectDocument & { project_name: string })[]> => {
    return fetchApi(`${PROJECTS_BASE}/documents/expired`);
  },

  // Alias for getFolders with tree=true
  getFolderTree: (projectId: string): Promise<ProjectFolder[]> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/folders?tree=true`);
  },

  // Alias for getVersions
  getDocumentVersions: (projectId: string, documentId: string): Promise<DocumentVersion[]> => {
    return fetchApi(`${PROJECTS_BASE}/${projectId}/documents/${documentId}/versions`);
  },

  // Download a document (optionally a specific version)
  downloadDocument: async (projectId: string, documentId: string, version?: number): Promise<Blob> => {
    const params = version ? `?version=${version}` : '';
    const response = await fetch(`${PROJECTS_BASE}/${projectId}/documents/${documentId}/download${params}`, {
      headers: {
        'Authorization': `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') : ''}`,
      },
    });
    if (!response.ok) {
      throw new Error('Failed to download document');
    }
    return response.blob();
  },
};

// =====================================================
// PAYMENT CONFIGURATION
// =====================================================

import type { PaymentAccountConfig, BankListItem, ResolveAccountResult, CryptoWalletConfig, CryptoWalletSaveResult, SettlementCoin } from '@/lib/property-management-api';

export const projectsPaymentConfigApi = {
  /** Get current payout account status */
  getAccount: () =>
    fetchApi<PaymentAccountConfig>(`${PROJECTS_BASE}/payments/account`),

  /** Get list of supported banks */
  getBanks: () =>
    fetchApi<{ status: boolean; data: BankListItem[] }>(`${PROJECTS_BASE}/payments/banks`),

  /** Verify a bank account number (name enquiry) */
  resolveAccount: (accountNumber: string, bankCode: string) =>
    fetchApi<ResolveAccountResult>(`${PROJECTS_BASE}/payments/resolve-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountNumber, bankCode })
    }),

  /** Register or update payout account */
  registerAccount: (data: {
    bankCode: string;
    accountNumber: string;
    businessName: string;
    contactEmail?: string;
    contactPhone?: string;
  }) =>
    fetchApi<{ success: boolean; subaccountCode: string }>(`${PROJECTS_BASE}/payments/register-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }),

  /** Get crypto wallet configuration */
  getCryptoWallet: () =>
    fetchApi<CryptoWalletConfig>(`${PROJECTS_BASE}/payments/crypto-wallet`),

  /** Save/update crypto wallet + payout currency */
  saveCryptoWallet: (walletAddress: string, payoutCoin?: string, payoutChain?: string) =>
    fetchApi<CryptoWalletSaveResult>(`${PROJECTS_BASE}/payments/crypto-wallet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, payoutCoin, payoutChain })
    }),

  /** Get supported settlement/payout currencies */
  getSettlementCoins: () =>
    fetchApi<SettlementCoin[]>(`${PROJECTS_BASE}/payments/settlement-coins`),
};
