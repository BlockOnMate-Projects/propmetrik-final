/**
 * PM Portal API Client
 * Centralized API client for all Project Management Portal operations
 * Handles authentication, error handling, and data transformation
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

// =====================================================
// TYPES
// =====================================================

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Project Types
export type ProjectStatus = 'planning' | 'pre_sales' | 'under_construction' | 'nearing_completion' | 'completed' | 'sold_out' | 'on_hold' | 'cancelled' | 'archived';
export type ProjectType = 'residential' | 'commercial' | 'mixed_use' | 'land_development' | 'renovation' | 'infrastructure' | 'other';

export interface Project {
  id: string;
  organization_id?: string;
  project_number?: string;
  project_name: string;
  name?: string;
  description?: string;
  status: ProjectStatus | string;
  project_type: ProjectType;
  total_budget?: number;
  budget?: number;
  currency?: string;
  city?: string;
  region?: string;
  address?: string;
  overall_progress?: number;
  progress?: number;
  planned_start_date?: string;
  planned_end_date?: string;
  planned_completion_date?: string;
  target_end_date?: string;
  actual_start_date?: string;
  actual_end_date?: string;
  client_name?: string;
  client_id?: string;
  manager_id?: string;
  manager_name?: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectStats {
  total: number;
  by_status: Record<ProjectStatus, number>;
  total_budget: number;
  avg_progress: number;
}

// RFI Types
export type RfiStatus = 'draft' | 'open' | 'pending_response' | 'answered' | 'closed' | 'void';
export type RfiPriority = 'low' | 'normal' | 'high' | 'critical';
export type RfiCategory = 'design_clarification' | 'specification_query' | 'drawing_discrepancy' | 'site_condition' | 'material_substitution' | 'regulatory_compliance' | 'contractor_coordination' | 'schedule_impact' | 'cost_inquiry' | 'safety_concern' | 'other';

export interface Rfi {
  id: string;
  rfi_number: string;
  subject: string;
  question: string;
  category: RfiCategory;
  status: RfiStatus;
  priority: RfiPriority;
  due_date?: string;
  project_id: string;
  project_name?: string;
  submitted_by?: string;
  submitted_by_name?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  is_overdue?: boolean;
  days_overdue?: number;
  comment_count?: number;
  response?: string;
  responded_at?: string;
  responded_by_name?: string;
  cost_impact?: number;
  schedule_impact_days?: number;
  attachments?: Attachment[];
  created_at: string;
  updated_at: string;
}

export interface RfiStats {
  total: number;
  by_status: Record<RfiStatus, number>;
  by_priority: Record<RfiPriority, number>;
  overdue: number;
  avg_response_days: number;
  pending_response: number;
}

export interface CreateRfiInput {
  organization_id?: string;
  project_id: string;
  subject: string;
  question: string;
  category: RfiCategory;
  priority: RfiPriority;
  due_date?: string;
  assigned_to?: string;
  submit_immediately?: boolean;
}

// Submittal Types
export type SubmittalStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'approved_as_noted' | 'revise_resubmit' | 'rejected' | 'closed';
export type SubmittalType = 'shop_drawing' | 'product_data' | 'sample' | 'mock_up' | 'design_data' | 'test_report' | 'certificate' | 'manufacturer_instruction' | 'closeout' | 'other';

export interface Submittal {
  id: string;
  submittal_number: string;
  title: string;
  description?: string;
  type: SubmittalType;
  status: SubmittalStatus;
  spec_section?: string;
  project_id: string;
  project_name?: string;
  submitted_by_name?: string;
  reviewer_name?: string;
  due_date?: string;
  is_overdue?: boolean;
  revision_number: number;
  review_comments?: string;
  created_at: string;
  updated_at: string;
}

export interface SubmittalStats {
  total: number;
  by_status: Record<SubmittalStatus, number>;
  overdue: number;
  pending_review: number;
}

// Change Order Types
export type ChangeOrderStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'executed' | 'void';
export type ChangeOrderType = 'addition' | 'deduction' | 'no_cost' | 'time_extension';

export interface ChangeOrder {
  id: string;
  co_number: string;
  title: string;
  description?: string;
  type: ChangeOrderType;
  status: ChangeOrderStatus;
  project_id: string;
  project_name?: string;
  original_amount?: number;
  approved_amount?: number;
  cost_impact?: number;
  schedule_impact_days?: number;
  reason?: string;
  submitted_by_name?: string;
  requested_by_name?: string;
  approved_by_name?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ChangeOrderStats {
  total: number;
  by_status: Record<ChangeOrderStatus, number>;
  total_approved_amount: number;
  total_pending_amount: number;
  total_schedule_impact: number;
}

// Photo Types
export interface Photo {
  id: string;
  filename: string;
  original_name?: string;
  url: string;
  thumbnail_url?: string;
  caption?: string;
  description?: string;
  category?: string;
  tags?: string[];
  project_id: string;
  phase_id?: string;
  location?: string;
  taken_at?: string;
  uploaded_by_name?: string;
  file_size?: number;
  created_at: string;
}

// Site Log Types
export interface SiteLog {
  id: string;
  log_number: string;
  log_date: string;
  project_id: string;
  project_name?: string;
  weather?: string;
  weather_condition?: string;
  temperature_high?: number;
  temperature_low?: number;
  precipitation?: boolean;
  work_performed?: string;
  work_description?: string;
  labor_count?: number;
  visitors?: string;
  safety_observations?: string;
  safety_incidents?: string;
  issues_delays?: string;
  delays?: string;
  equipment_on_site?: string;
  equipment_used?: string[];
  is_approved?: boolean;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

// Punch List Types
export type PunchItemStatus = 'open' | 'in_progress' | 'ready_for_inspection' | 'completed' | 'closed';
export type PunchItemPriority = 'low' | 'medium' | 'high' | 'critical';

export interface PunchItem {
  id: string;
  item_number: string;
  title: string;
  description?: string;
  status: PunchItemStatus;
  priority: PunchItemPriority;
  location?: string;
  trade?: string;
  category?: string;
  project_id: string;
  assigned_to?: string;
  assigned_to_name?: string;
  created_by?: string;
  created_by_name?: string;
  due_date?: string;
  completed_at?: string;
  photos?: Photo[];
  created_at: string;
  updated_at: string;
}

export interface PunchListStats {
  total: number;
  by_status: Record<PunchItemStatus, number>;
  overdue: number;
}

// Milestone Types
export type MilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'overdue' | 'cancelled';

export interface Milestone {
  id: string;
  name: string;
  description?: string;
  status: MilestoneStatus;
  due_date?: string;
  completed_date?: string;
  project_id: string;
  phase_id?: string;
  phase_name?: string;
  is_overdue?: boolean;
  progress?: number;
  created_at: string;
  subphases?: MilestoneSubphase[];
  subphase_count?: number;
}

// Subphase Types
export type SubphaseStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';

export interface MilestoneSubphase {
  id: string;
  milestoneId: string;
  projectId: string;
  name: string;
  description?: string;
  sequenceOrder: number;
  startDate?: string;
  endDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  status: SubphaseStatus;
  progressPercentage: number;
  assignedTo?: string[];
  assignedTeam?: string;
  estimatedHours?: number;
  actualHours?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubphaseData {
  name: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  status?: SubphaseStatus;
  progress_percentage?: number;
  assigned_team?: string;
  estimated_hours?: number;
  notes?: string;
}

export interface UpdateSubphaseData {
  name?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  actual_start_date?: string;
  actual_end_date?: string;
  status?: SubphaseStatus;
  progress_percentage?: number;
  assigned_team?: string;
  estimated_hours?: number;
  actual_hours?: number;
  notes?: string;
}

// Attachment Type
export interface Attachment {
  id: string;
  filename: string;
  url: string;
  file_size?: number;
  mime_type?: string;
  uploaded_by_name?: string;
  created_at: string;
}

// Team Member Type
export interface TeamMember {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  title?: string;
  phone?: string;
  avatar_url?: string;
  is_active: boolean;
}

// =====================================================
// API HELPER
// =====================================================

/**
 * Module-level token storage.
 * Components call configureAuth(token) with the NextAuth session token.
 * This replaces the old localStorage-based PM Portal auth.
 */
let _sessionToken: string | null = null;

/**
 * Set the auth token for API requests.
 * Call this from a React component/layout that has access to the NextAuth session.
 */
export function configureAuth(token: string | null) {
  _sessionToken = token;
}

/**
 * Get the authentication token.
 * Priority: 1) Explicitly configured session token (NextAuth)
 *           2) Legacy PM Portal localStorage token (migration fallback)
 */
function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return _sessionToken || localStorage.getItem('pm_access_token') || null;
}

async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  
  try {
    // Build auth headers from real session token
    const token = getAuthToken();
    const authHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      authHeaders['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      headers: {
        ...authHeaders,
        ...options?.headers,
      },
      ...options,
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data?.error?.message || data?.message || `HTTP ${response.status}`;
      throw new Error(errorMessage);
    }

    // Handle various response formats
    if (data.success !== undefined) {
      return data.data ?? data;
    }
    
    return data;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error');
  }
}

// =====================================================
// PROJECTS API
// =====================================================

export const projectsApi = {
  getAll: async (filters?: {
    status?: ProjectStatus;
    type?: ProjectType;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<Project>> => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.type) params.set('type', filters.type);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));
    
    const query = params.toString();
    const response = await apiRequest<any>(`/projects${query ? `?${query}` : ''}`);
    
    // Normalize response
    if (response?.projects) {
      return {
        data: response.projects,
        total: response.total || response.projects.length,
        page: response.page || 1,
        limit: response.limit || 20,
        totalPages: response.totalPages || Math.ceil((response.total || response.projects.length) / (response.limit || 20)),
      };
    }
    
    return response;
  },

  getById: async (id: string): Promise<Project> => {
    return apiRequest(`/projects/${id}`);
  },

  getStats: async (): Promise<ProjectStats> => {
    return apiRequest('/projects/stats');
  },

  getMilestones: async (projectId: string, status?: MilestoneStatus): Promise<Milestone[]> => {
    const params = status ? `?status=${status}` : '';
    const response = await apiRequest<any>(`/projects/${projectId}/milestones${params}`);
    return response?.data || response || [];
  },

  getTeam: async (projectId: string): Promise<TeamMember[]> => {
    const response = await apiRequest<any>(`/projects/${projectId}/team`);
    return response?.data || response || [];
  },
};

// =====================================================
// MILESTONES API
// =====================================================

export interface CreateMilestoneData {
  name: string;
  description?: string;
  target_date?: string;
  phase_id?: string;
}

export interface UpdateMilestoneData {
  name?: string;
  description?: string;
  target_date?: string;
  status?: MilestoneStatus;
  phase_id?: string;
}

export const milestonesApi = {
  getAll: async (projectId: string, options?: { includeCompleted?: boolean }): Promise<Milestone[]> => {
    const params = new URLSearchParams();
    if (options?.includeCompleted) params.set('includeCompleted', 'true');
    const query = params.toString();
    const response = await apiRequest<any>(`/projects/${projectId}/milestones${query ? `?${query}` : ''}`);
    return response?.data || response || [];
  },

  getById: async (projectId: string, milestoneId: string): Promise<Milestone> => {
    return apiRequest(`/projects/${projectId}/milestones/${milestoneId}`);
  },

  getWithSubphases: async (projectId: string, milestoneId: string): Promise<{
    milestone: Milestone;
    subphases: MilestoneSubphase[];
    summary: {
      totalSubphases: number;
      completedSubphases: number;
      inProgressSubphases: number;
      pendingSubphases: number;
      blockedSubphases: number;
      avgProgress: number;
      totalEstimatedHours: number;
      totalActualHours: number;
    };
  }> => {
    return apiRequest(`/projects/${projectId}/milestones/${milestoneId}/with-subphases`);
  },

  create: async (projectId: string, data: CreateMilestoneData): Promise<Milestone> => {
    return apiRequest(`/projects/${projectId}/milestones`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (projectId: string, milestoneId: string, data: UpdateMilestoneData): Promise<Milestone> => {
    return apiRequest(`/projects/${projectId}/milestones/${milestoneId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete: async (projectId: string, milestoneId: string): Promise<void> => {
    await apiRequest(`/projects/${projectId}/milestones/${milestoneId}`, {
      method: 'DELETE',
    });
  },

  complete: async (projectId: string, milestoneId: string, actualDate?: string): Promise<Milestone> => {
    return apiRequest(`/projects/${projectId}/milestones/${milestoneId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ actualDate }),
    });
  },

  // Sub-phases API
  subphases: {
    getAll: async (projectId: string, milestoneId: string): Promise<MilestoneSubphase[]> => {
      const response = await apiRequest<any>(`/projects/${projectId}/milestones/${milestoneId}/subphases`);
      return response?.data || response || [];
    },

    getById: async (projectId: string, milestoneId: string, subphaseId: string): Promise<MilestoneSubphase> => {
      return apiRequest(`/projects/${projectId}/milestones/${milestoneId}/subphases/${subphaseId}`);
    },

    create: async (projectId: string, milestoneId: string, data: CreateSubphaseData): Promise<MilestoneSubphase> => {
      return apiRequest(`/projects/${projectId}/milestones/${milestoneId}/subphases`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    update: async (projectId: string, milestoneId: string, subphaseId: string, data: UpdateSubphaseData): Promise<MilestoneSubphase> => {
      return apiRequest(`/projects/${projectId}/milestones/${milestoneId}/subphases/${subphaseId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },

    delete: async (projectId: string, milestoneId: string, subphaseId: string): Promise<void> => {
      await apiRequest(`/projects/${projectId}/milestones/${milestoneId}/subphases/${subphaseId}`, {
        method: 'DELETE',
      });
    },

    reorder: async (projectId: string, milestoneId: string, orderedIds: string[]): Promise<MilestoneSubphase[]> => {
      return apiRequest(`/projects/${projectId}/milestones/${milestoneId}/subphases/reorder`, {
        method: 'POST',
        body: JSON.stringify({ orderedIds }),
      });
    },
  },
};

// =====================================================
// RFIS API
// =====================================================

export const rfisApi = {
  getAll: async (filters?: {
    projectId?: string;
    status?: RfiStatus;
    priority?: RfiPriority;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<Rfi>> => {
    const params = new URLSearchParams();
    if (filters?.projectId) params.set('projectId', filters.projectId);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.priority) params.set('priority', filters.priority);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));
    
    const query = params.toString();
    const response = await apiRequest<any>(`/rfis${query ? `?${query}` : ''}`);
    
    return {
      data: response?.data || response || [],
      total: response?.pagination?.total || response?.total || 0,
      page: Math.floor((filters?.offset || 0) / (filters?.limit || 50)) + 1,
      limit: filters?.limit || 50,
      totalPages: Math.ceil((response?.pagination?.total || response?.total || 0) / (filters?.limit || 50)),
    };
  },

  getById: async (id: string): Promise<Rfi> => {
    return apiRequest(`/rfis/${id}`);
  },

  getStats: async (projectId: string): Promise<RfiStats> => {
    return apiRequest(`/rfis/stats/${projectId}`);
  },

  create: async (data: CreateRfiInput): Promise<Rfi> => {
    return apiRequest('/rfis', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: Partial<Rfi>): Promise<Rfi> => {
    return apiRequest(`/rfis/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  submit: async (id: string): Promise<Rfi> => {
    return apiRequest(`/rfis/${id}/submit`, { method: 'POST' });
  },

  respond: async (id: string, response: string): Promise<Rfi> => {
    return apiRequest(`/rfis/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify({ response }),
    });
  },

  close: async (id: string): Promise<Rfi> => {
    return apiRequest(`/rfis/${id}/close`, { method: 'POST' });
  },
};

// =====================================================
// SUBMITTALS API
// =====================================================

export const submittalsApi = {
  getAll: async (filters?: {
    projectId?: string;
    status?: SubmittalStatus;
    type?: SubmittalType;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<Submittal>> => {
    const params = new URLSearchParams();
    if (filters?.projectId) params.set('projectId', filters.projectId);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.type) params.set('type', filters.type);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));
    
    const query = params.toString();
    const response = await apiRequest<any>(`/submittals${query ? `?${query}` : ''}`);
    
    return {
      data: response?.data || response || [],
      total: response?.pagination?.total || response?.total || 0,
      page: Math.floor((filters?.offset || 0) / (filters?.limit || 50)) + 1,
      limit: filters?.limit || 50,
      totalPages: Math.ceil((response?.pagination?.total || response?.total || 0) / (filters?.limit || 50)),
    };
  },

  getById: async (id: string): Promise<Submittal> => {
    return apiRequest(`/submittals/${id}`);
  },

  getStats: async (projectId: string): Promise<SubmittalStats> => {
    return apiRequest(`/submittals/stats/${projectId}`);
  },

  create: async (data: Partial<Submittal>): Promise<Submittal> => {
    return apiRequest('/submittals', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: Partial<Submittal>): Promise<Submittal> => {
    return apiRequest(`/submittals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  approve: async (id: string, comments?: string): Promise<Submittal> => {
    return apiRequest(`/submittals/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ comments }),
    });
  },

  reject: async (id: string, reason: string): Promise<Submittal> => {
    return apiRequest(`/submittals/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
};

// =====================================================
// CHANGE ORDERS API
// =====================================================

// Normalize backend change order response to expected format
function normalizeChangeOrder(co: any): ChangeOrder {
  // Map backend co_type to frontend type
  const typeMapping: Record<string, ChangeOrderType> = {
    'additive': 'addition',
    'deductive': 'deduction',
    'no_cost': 'no_cost',
    'time_extension': 'time_extension',
    'addition': 'addition',
    'deduction': 'deduction',
  };
  
  const rawType = co.type || co.co_type || 'addition';
  const normalizedType = typeMapping[rawType] || 'addition';
  
  return {
    id: co.id,
    co_number: co.co_number || co.coNumber || '',
    title: co.title || '',
    description: co.description || '',
    type: normalizedType,
    status: co.status || 'draft',
    project_id: co.project_id || co.projectId || '',
    project_name: co.project_name,
    original_amount: co.original_amount || co.original_contract_amount || 0,
    approved_amount: co.approved_amount,
    cost_impact: co.cost_impact || co.this_change_amount || 0,
    schedule_impact_days: co.schedule_impact_days || 0,
    reason: co.reason || '',
    submitted_by_name: co.submitted_by_name || co.created_by_name,
    requested_by_name: co.requested_by_name,
    approved_by_name: co.approved_by_name,
    approved_at: co.approved_at,
    created_at: co.created_at || new Date().toISOString(),
    updated_at: co.updated_at || new Date().toISOString(),
  };
}

export const changeOrdersApi = {
  getAll: async (filters?: {
    projectId?: string;
    status?: ChangeOrderStatus;
    type?: ChangeOrderType;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<ChangeOrder>> => {
    const params = new URLSearchParams();
    if (filters?.projectId) params.set('projectId', filters.projectId);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.type) params.set('type', filters.type);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));
    
    const query = params.toString();
    const response = await apiRequest<any>(`/change-orders${query ? `?${query}` : ''}`);
    
    const rawData = response?.data || response || [];
    const normalizedData = Array.isArray(rawData) ? rawData.map(normalizeChangeOrder) : [];
    
    return {
      data: normalizedData,
      total: response?.pagination?.total || response?.total || 0,
      page: Math.floor((filters?.offset || 0) / (filters?.limit || 50)) + 1,
      limit: filters?.limit || 50,
      totalPages: Math.ceil((response?.pagination?.total || response?.total || 0) / (filters?.limit || 50)),
    };
  },

  getById: async (id: string): Promise<ChangeOrder> => {
    const response = await apiRequest<any>(`/change-orders/${id}`);
    return normalizeChangeOrder(response?.data || response);
  },

  getStats: async (projectId: string): Promise<ChangeOrderStats> => {
    return apiRequest(`/change-orders/stats/${projectId}`);
  },

  create: async (data: Partial<ChangeOrder>): Promise<ChangeOrder> => {
    return apiRequest('/change-orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: Partial<ChangeOrder>): Promise<ChangeOrder> => {
    return apiRequest(`/change-orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  approve: async (id: string, amount?: number): Promise<ChangeOrder> => {
    return apiRequest(`/change-orders/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approved_amount: amount }),
    });
  },

  reject: async (id: string, reason: string): Promise<ChangeOrder> => {
    return apiRequest(`/change-orders/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  submitForApproval: async (id: string): Promise<ChangeOrder> => {
    return apiRequest(`/change-orders/${id}/submit`, {
      method: 'POST',
    });
  },

  execute: async (id: string): Promise<ChangeOrder> => {
    return apiRequest(`/change-orders/${id}/execute`, {
      method: 'POST',
    });
  },

  delete: async (id: string): Promise<void> => {
    return apiRequest(`/change-orders/${id}`, {
      method: 'DELETE',
    });
  },
};

// =====================================================
// PHOTOS API
// =====================================================

export const photosApi = {
  getAll: async (filters?: {
    projectId?: string;
    category?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<Photo>> => {
    const params = new URLSearchParams();
    if (filters?.projectId) params.set('projectId', filters.projectId);
    if (filters?.category) params.set('category', filters.category);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));
    
    const query = params.toString();
    const response = await apiRequest<any>(`/photos${query ? `?${query}` : ''}`);
    
    return {
      data: response?.data || response || [],
      total: response?.pagination?.total || response?.total || 0,
      page: Math.floor((filters?.offset || 0) / (filters?.limit || 50)) + 1,
      limit: filters?.limit || 50,
      totalPages: Math.ceil((response?.pagination?.total || response?.total || 0) / (filters?.limit || 50)),
    };
  },

  upload: async (formData: FormData): Promise<Photo | Photo[]> => {
    const response = await fetch(`${API_BASE}/photos`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error('Failed to upload photo');
    }
    
    return response.json();
  },

  uploadSingle: async (projectId: string, file: File, metadata?: { caption?: string; category?: string; location?: string }): Promise<Photo> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('project_id', projectId);
    if (metadata?.caption) formData.append('caption', metadata.caption);
    if (metadata?.category) formData.append('category', metadata.category);
    if (metadata?.location) formData.append('location', metadata.location);
    
    const response = await fetch(`${API_BASE}/photos`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error('Failed to upload photo');
    }
    
    return response.json();
  },

  delete: async (id: string): Promise<void> => {
    await apiRequest(`/photos/${id}`, { method: 'DELETE' });
  },
};

// =====================================================
// SITE LOGS API
// =====================================================

export const siteLogsApi = {
  getAll: async (filters?: {
    projectId?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<SiteLog>> => {
    const params = new URLSearchParams();
    if (filters?.projectId) params.set('projectId', filters.projectId);
    if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params.set('dateTo', filters.dateTo);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));
    
    const query = params.toString();
    const response = await apiRequest<any>(`/site-diaries${query ? `?${query}` : ''}`);
    
    return {
      data: response?.data || response || [],
      total: response?.pagination?.total || response?.total || 0,
      page: Math.floor((filters?.offset || 0) / (filters?.limit || 50)) + 1,
      limit: filters?.limit || 50,
      totalPages: Math.ceil((response?.pagination?.total || response?.total || 0) / (filters?.limit || 50)),
    };
  },

  getById: async (id: string): Promise<SiteLog> => {
    return apiRequest(`/site-diaries/${id}`);
  },

  create: async (data: Partial<SiteLog>): Promise<SiteLog> => {
    return apiRequest('/site-diaries', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: Partial<SiteLog>): Promise<SiteLog> => {
    return apiRequest(`/site-diaries/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};

// =====================================================
// PUNCH LISTS API
// =====================================================

export const punchListsApi = {
  getAll: async (filters?: {
    projectId?: string;
    status?: PunchItemStatus;
    priority?: PunchItemPriority;
    category?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<PunchItem>> => {
    const params = new URLSearchParams();
    if (filters?.projectId) params.set('projectId', filters.projectId);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.priority) params.set('priority', filters.priority);
    if (filters?.category) params.set('category', filters.category);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));
    
    const query = params.toString();
    // Note: Using a likely endpoint - adjust based on actual backend
    const response = await apiRequest<any>(`/projects/${filters?.projectId || 'all'}/punch-items${query ? `?${query}` : ''}`);
    
    return {
      data: response?.data || response || [],
      total: response?.pagination?.total || response?.total || 0,
      page: Math.floor((filters?.offset || 0) / (filters?.limit || 50)) + 1,
      limit: filters?.limit || 50,
      totalPages: Math.ceil((response?.pagination?.total || response?.total || 0) / (filters?.limit || 50)),
    };
  },

  getById: async (projectId: string, id: string): Promise<PunchItem> => {
    return apiRequest(`/projects/${projectId}/punch-items/${id}`);
  },

  getStats: async (projectId: string): Promise<PunchListStats> => {
    return apiRequest(`/projects/${projectId}/punch-items/stats`);
  },

  create: async (projectId: string, data: Partial<PunchItem>): Promise<PunchItem> => {
    return apiRequest(`/projects/${projectId}/punch-items`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (projectId: string, id: string, data: Partial<PunchItem>): Promise<PunchItem> => {
    return apiRequest(`/projects/${projectId}/punch-items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  complete: async (projectId: string, id: string): Promise<PunchItem> => {
    return apiRequest(`/projects/${projectId}/punch-items/${id}/complete`, { method: 'POST' });
  },
};

// =====================================================
// CHECKLISTS API
// =====================================================

export interface ChecklistTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  item_count: number;
}

export interface ChecklistInstance {
  id: string;
  template_id: string;
  template_name?: string;
  project_id: string;
  status: 'not_started' | 'in_progress' | 'completed';
  progress: number;
  assigned_to_name?: string;
  completed_at?: string;
  created_at: string;
}

export const checklistsApi = {
  getTemplates: async (): Promise<ChecklistTemplate[]> => {
    const response = await apiRequest<any>('/checklists/templates');
    return response?.data || response || [];
  },

  getInstances: async (projectId: string): Promise<ChecklistInstance[]> => {
    const response = await apiRequest<any>(`/checklists?projectId=${projectId}`);
    return response?.data || response || [];
  },

  createInstance: async (projectId: string, templateId: string): Promise<ChecklistInstance> => {
    return apiRequest('/checklists', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId, template_id: templateId }),
    });
  },
};

// =====================================================
// PROCUREMENT API
// =====================================================

export type ProcurementStatus = 'draft' | 'pending' | 'approved' | 'ordered' | 'received' | 'closed';

export interface ProcurementOrder {
  id: string;
  po_number: string;
  title: string;
  description?: string;
  status: ProcurementStatus;
  vendor_name?: string;
  total_amount?: number;
  currency?: string;
  project_id: string;
  ordered_at?: string;
  expected_delivery?: string;
  received_at?: string;
  created_at: string;
}

export const procurementApi = {
  getAll: async (filters?: {
    projectId?: string;
    status?: ProcurementStatus;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<ProcurementOrder>> => {
    const params = new URLSearchParams();
    if (filters?.projectId) params.set('projectId', filters.projectId);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));
    
    const query = params.toString();
    const response = await apiRequest<any>(`/procurement${query ? `?${query}` : ''}`);
    
    return {
      data: response?.data || response || [],
      total: response?.pagination?.total || response?.total || 0,
      page: Math.floor((filters?.offset || 0) / (filters?.limit || 50)) + 1,
      limit: filters?.limit || 50,
      totalPages: Math.ceil((response?.pagination?.total || response?.total || 0) / (filters?.limit || 50)),
    };
  },

  getById: async (id: string): Promise<ProcurementOrder> => {
    return apiRequest(`/procurement/${id}`);
  },

  create: async (data: Partial<ProcurementOrder>): Promise<ProcurementOrder> => {
    return apiRequest('/procurement', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// =====================================================
// BUDGET API
// =====================================================

export interface BudgetSummary {
  total_budget: number;
  committed: number;
  spent: number;
  remaining: number;
  variance: number;
  variance_percentage: number;
  currency: string;
}

export interface CostItem {
  id: string;
  code: string;
  description: string;
  category: string;
  budgeted: number;
  committed: number;
  spent: number;
  remaining: number;
  variance: number;
}

export const budgetApi = {
  getSummary: async (projectId: string): Promise<BudgetSummary> => {
    return apiRequest(`/projects/${projectId}/budget/summary`);
  },

  getCostItems: async (projectId: string): Promise<CostItem[]> => {
    const response = await apiRequest<any>(`/projects/${projectId}/costs`);
    return response?.data || response || [];
  },
};

// =====================================================
// DRAWS API
// =====================================================

export type DrawStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'paid' | 'rejected';

export interface DrawRequest {
  id: string;
  draw_number: number;
  title: string;
  description?: string;
  status: DrawStatus;
  amount: number;
  approved_amount?: number;
  project_id: string;
  submitted_at?: string;
  approved_at?: string;
  paid_at?: string;
  created_at: string;
}

export interface DrawSummary {
  total_requested: number;
  total_approved: number;
  total_paid: number;
  pending: number;
  currency: string;
}

export const drawsApi = {
  getAll: async (projectId: string): Promise<DrawRequest[]> => {
    const response = await apiRequest<any>(`/projects/${projectId}/draws`);
    return response?.data || response || [];
  },

  getSummary: async (projectId: string): Promise<DrawSummary> => {
    return apiRequest(`/projects/${projectId}/draws/summary`);
  },

  create: async (projectId: string, data: Partial<DrawRequest>): Promise<DrawRequest> => {
    return apiRequest(`/projects/${projectId}/draws`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  submit: async (projectId: string, id: string): Promise<DrawRequest> => {
    return apiRequest(`/projects/${projectId}/draws/${id}/submit`, { method: 'POST' });
  },
};

// =====================================================
// TEAM API
// =====================================================

export const teamApi = {
  getProjectTeam: async (projectId: string): Promise<TeamMember[]> => {
    const response = await apiRequest<any>(`/team?projectId=${projectId}`);
    return response?.data || response || [];
  },

  getOrganizationTeam: async (): Promise<TeamMember[]> => {
    const response = await apiRequest<any>('/team');
    return response?.data || response || [];
  },
};
