/**
 * Unified Project API Client
 * 
 * Enterprise-grade API client for project management that serves both:
 * - Client Portal (Admin/Client view - read PM data, approve, respond)
 * - PM Portal (Project Manager view - create/manage operational data)
 * 
 * Architecture Principles:
 * 1. Single source of truth for all project-related API calls
 * 2. Role-based access control (RBAC) awareness
 * 3. Bidirectional communication (PM creates, Client responds/approves)
 * 4. Document upload support for RFI responses
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

import { getSession } from 'next-auth/react';

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (typeof window === 'undefined') return {};
  try {
    const session = await getSession();
    const token = (session as any)?.accessToken;
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

// =====================================================
// TYPES - Shared across both portals
// =====================================================

// Project Types
export type ProjectStatus = 
  | 'planning' 
  | 'pre_sales' 
  | 'under_construction' 
  | 'nearing_completion' 
  | 'completed' 
  | 'sold_out' 
  | 'on_hold' 
  | 'cancelled' 
  | 'archived';

export type ProjectType = 
  | 'residential_single' 
  | 'residential_multi' 
  | 'commercial' 
  | 'mixed_use' 
  | 'industrial' 
  | 'infrastructure';

export interface Project {
  id: string;
  organization_id: string;
  project_number: string;
  name: string;
  description?: string;
  project_type: ProjectType;
  status: ProjectStatus;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  region?: string;
  country?: string;
  ghana_post_gps?: string;
  latitude?: number;
  longitude?: number;
  land_size_sqm?: number;
  land_size_acres?: number;
  total_units?: number;
  total_floors?: number;
  total_buildings?: number;
  total_sqm?: number;
  total_budget?: number;
  total_spent?: number;
  total_committed?: number;
  projected_revenue?: number;
  actual_revenue?: number;
  planned_start_date?: string;
  actual_start_date?: string;
  planned_completion_date?: string;
  estimated_completion_date?: string;
  actual_completion_date?: string;
  overall_progress?: number;
  construction_progress?: number;
  sales_progress?: number;
  // Framework reference (governance)
  milestone_framework_id?: string;
  framework_name?: string;
  created_at: string;
  updated_at: string;
}

// RFI Types
export type RfiStatus = 'draft' | 'open' | 'pending_response' | 'answered' | 'closed' | 'void';
export type RfiPriority = 'low' | 'normal' | 'high' | 'critical';
export type RfiCategory = 
  | 'design_clarification'
  | 'specification_query'
  | 'drawing_discrepancy'
  | 'site_condition'
  | 'material_substitution'
  | 'regulatory_compliance'
  | 'contractor_coordination'
  | 'schedule_impact'
  | 'cost_inquiry'
  | 'safety_concern'
  | 'other';

export interface Attachment {
  id: string;
  filename: string;
  url: string;
  type: string;
  size: number;
  uploaded_at: string;
  uploaded_by?: string;
  uploaded_by_name?: string;
}

export interface Rfi {
  id: string;
  organization_id: string;
  project_id: string;
  rfi_number: string;
  revision_number: number;
  subject: string;
  question: string;
  category: RfiCategory;
  response?: string;
  response_attachments?: Attachment[];
  status: RfiStatus;
  priority: RfiPriority;
  due_date?: string;
  responded_at?: string;
  closed_at?: string;
  submitted_by?: string;
  submitted_by_name?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  answered_by?: string;
  answered_by_name?: string;
  phase_id?: string;
  phase_name?: string;
  drawing_references?: any[];
  spec_references?: any[];
  location_reference?: string;
  cost_impact?: number;
  cost_impact_currency?: string;
  schedule_impact_days?: number;
  attachments?: Attachment[];
  is_overdue?: boolean;
  days_overdue?: number;
  comment_count?: number;
  project_name?: string;
  project_number?: string;
  created_at: string;
  updated_at: string;
}

export interface RfiComment {
  id: string;
  rfi_id: string;
  comment: string;
  is_internal: boolean;
  attachments?: Attachment[];
  created_by?: string;
  created_by_name?: string;
  created_at: string;
}

export interface RfiStats {
  total: number;
  by_status: Record<RfiStatus, number>;
  overdue: number;
  average_response_time_days?: number;
}

// Submittal Types
export type SubmittalStatus = 'draft' | 'pending_review' | 'under_review' | 'approved' | 'approved_as_noted' | 'revise_resubmit' | 'rejected' | 'void';
export type SubmittalType = 'shop_drawing' | 'product_data' | 'sample' | 'mock_up' | 'design_data' | 'test_report' | 'certificate' | 'warranty' | 'operation_manual' | 'other';

export interface Submittal {
  id: string;
  organization_id: string;
  project_id: string;
  submittal_number: string;
  revision_number: number;
  title: string;
  description?: string;
  type: SubmittalType;
  status: SubmittalStatus;
  spec_section?: string;
  submitted_by?: string;
  submitted_by_name?: string;
  reviewer_id?: string;
  reviewer_name?: string;
  due_date?: string;
  reviewed_at?: string;
  review_comments?: string;
  attachments?: Attachment[];
  is_overdue?: boolean;
  project_name?: string;
  project_number?: string;
  created_at: string;
  updated_at: string;
}

export interface SubmittalStats {
  total: number;
  by_status: Record<SubmittalStatus, number>;
  overdue: number;
}

// Change Order Types
export type ChangeOrderStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'executed' | 'void';
export type ChangeOrderType = 'addition' | 'deduction' | 'substitution' | 'scope_change' | 'time_extension' | 'other';

export interface ChangeOrderItem {
  id: string;
  change_order_id: string;
  description: string;
  quantity?: number;
  unit?: string;
  unit_cost?: number;
  total_cost: number;
  cost_code?: string;
  category?: string;
}

export interface ChangeOrder {
  id: string;
  organization_id: string;
  project_id: string;
  co_number: string;
  title: string;
  description?: string;
  type: ChangeOrderType;
  status: ChangeOrderStatus;
  reason?: string;
  justification?: string;
  original_amount: number;
  revised_amount?: number;
  cost_impact: number;
  schedule_impact_days?: number;
  currency?: string;
  submitted_by?: string;
  submitted_by_name?: string;
  approved_by?: string;
  approved_by_name?: string;
  executed_by?: string;
  executed_by_name?: string;
  submitted_at?: string;
  approved_at?: string;
  executed_at?: string;
  rejection_reason?: string;
  items?: ChangeOrderItem[];
  attachments?: Attachment[];
  project_name?: string;
  project_number?: string;
  created_at: string;
  updated_at: string;
}

export interface ChangeOrderStats {
  total: number;
  by_status: Record<ChangeOrderStatus, number>;
  total_cost_impact: number;
  total_approved: number;
  total_pending: number;
}

// Milestone Types
export type MilestoneStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked' | 'overdue';

export interface Milestone {
  id: string;
  project_id: string;
  phase_id?: string;
  phase_name?: string;
  name: string;
  description?: string;
  status: MilestoneStatus;
  target_date?: string;
  completed_date?: string;
  progress?: number;
  is_required?: boolean;
  requires_client_approval?: boolean;
  approved_by_client?: boolean;
  approved_at?: string;
  dependencies?: string[];
  created_at: string;
  updated_at: string;
}

// Milestone Framework Types (Governance)
export interface MilestoneFramework {
  id: string;
  organization_id: string;
  name: string;
  code?: string;
  description?: string;
  project_type: string;
  region?: string;
  version: number;
  is_active: boolean;
  is_locked: boolean;
  phases?: FrameworkPhase[];
  created_at: string;
  updated_at: string;
}

export interface FrameworkPhase {
  id: string;
  framework_id: string;
  name: string;
  code?: string;
  description?: string;
  sequence_order: number;
  default_duration_days?: number;
  buffer_days?: number;
  is_required: boolean;
  can_overlap_previous: boolean;
  max_overlap_percentage?: number;
  allowed_milestone_types?: string[];
  required_milestone_types?: string[];
  milestone_templates?: MilestoneTemplate[];
}

export interface MilestoneTemplate {
  id: string;
  framework_phase_id: string;
  name: string;
  code?: string;
  description?: string;
  milestone_type: string;
  sequence_order: number;
  default_day_offset?: number;
  default_duration_days?: number;
  is_required: boolean;
  requires_client_approval: boolean;
  requires_inspection: boolean;
  requires_documentation: boolean;
}

// Punch List Types
export type PunchItemStatus = 'open' | 'in_progress' | 'ready_for_inspection' | 'completed' | 'closed';
export type PunchItemPriority = 'low' | 'medium' | 'high' | 'critical';

export interface PunchItem {
  id: string;
  project_id: string;
  item_number: string;
  title: string;
  description?: string;
  status: PunchItemStatus;
  priority: PunchItemPriority;
  location?: string;
  trade?: string;
  category?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  due_date?: string;
  completed_at?: string;
  photos?: Attachment[];
  created_at: string;
  updated_at: string;
}

export interface PunchListStats {
  total: number;
  by_status: Record<PunchItemStatus, number>;
  overdue: number;
}

// Photo Types
export interface Photo {
  id: string;
  project_id: string;
  filename: string;
  url: string;
  thumbnail_url?: string;
  description?: string;
  location?: string;
  tags?: string[];
  phase_id?: string;
  phase_name?: string;
  uploaded_by?: string;
  uploaded_by_name?: string;
  taken_at?: string;
  created_at: string;
}

// Daily Log Types
export interface DailyLog {
  id: string;
  project_id: string;
  log_date: string;
  weather?: string;
  temperature_high?: number;
  temperature_low?: number;
  work_performed?: string;
  issues_delays?: string;
  manpower_count?: number;
  safety_incidents?: number;
  notes?: string;
  is_approved?: boolean;
  approved_by?: string;
  approved_by_name?: string;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

// Approval Request Types (Governance)
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type ApprovalType = 'change_order' | 'milestone_change' | 'phase_unlock' | 'budget_change' | 'timeline_change';

export interface ApprovalRequest {
  id: string;
  project_id: string;
  type: ApprovalType;
  status: ApprovalStatus;
  title: string;
  description?: string;
  requested_by?: string;
  requested_by_name?: string;
  approved_by?: string;
  approved_by_name?: string;
  rejection_reason?: string;
  reference_id?: string;
  reference_type?: string;
  changes_summary?: any;
  created_at: string;
  updated_at: string;
}

// Pagination
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// =====================================================
// API REQUEST HELPER
// =====================================================

async function apiRequest<T>(
  endpoint: string, 
  options: RequestInit = {},
  params?: Record<string, any>
): Promise<T> {
  let url = `${API_BASE}${endpoint}`;
  
  if (params) {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.set(key, String(value));
      }
    });
    const queryString = queryParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }
  
  const authHeaders = await getAuthHeaders();

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `API error: ${response.status}`);
  }
  
  return response.json();
}

async function uploadFile(
  endpoint: string,
  formData: FormData
): Promise<any> {
  const url = `${API_BASE}${endpoint}`;
  const authHeaders = await getAuthHeaders();
  
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
    headers: {
      ...authHeaders,
    },
    // Don't set Content-Type header - let browser set it with boundary
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Upload failed' }));
    throw new Error(error.message || `Upload error: ${response.status}`);
  }
  
  return response.json();
}

// =====================================================
// PROJECT API
// =====================================================

export const projectApi = {
  getAll: async (filters?: {
    organizationId?: string;
    status?: ProjectStatus;
    projectType?: ProjectType;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<Project>> => {
    const response = await apiRequest<any>('/projects', {}, {
      organization_id: filters?.organizationId,
      status: filters?.status,
      project_type: filters?.projectType,
      search: filters?.search,
      limit: filters?.limit || 50,
      offset: filters?.offset || 0,
    });
    
    return {
      data: response.data || response.projects || [],
      total: response.pagination?.total || response.total || 0,
      page: Math.floor((filters?.offset || 0) / (filters?.limit || 50)) + 1,
      limit: filters?.limit || 50,
      totalPages: Math.ceil((response.pagination?.total || response.total || 0) / (filters?.limit || 50)),
    };
  },

  getById: async (id: string): Promise<Project> => {
    return apiRequest(`/projects/${id}`);
  },

  create: async (data: Partial<Project>): Promise<Project> => {
    return apiRequest('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: Partial<Project>): Promise<Project> => {
    return apiRequest(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Apply a milestone framework to a project (Admin/Client action)
  applyFramework: async (projectId: string, frameworkId: string): Promise<{ success: boolean; phases: any[] }> => {
    return apiRequest(`/projects/${projectId}/apply-framework`, {
      method: 'POST',
      body: JSON.stringify({ framework_id: frameworkId }),
    });
  },
};

// =====================================================
// RFI API - Bidirectional Communication
// =====================================================

export const rfiApi = {
  // Get RFIs for a project
  getAll: async (filters?: {
    projectId?: string;
    status?: RfiStatus;
    priority?: RfiPriority;
    category?: RfiCategory;
    assignedTo?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<Rfi>> => {
    const response = await apiRequest<any>('/rfis', {}, {
      projectId: filters?.projectId,
      status: filters?.status,
      priority: filters?.priority,
      category: filters?.category,
      assignedTo: filters?.assignedTo,
      search: filters?.search,
      limit: filters?.limit || 50,
      offset: filters?.offset || 0,
    });
    
    return {
      data: response.data || [],
      total: response.pagination?.total || response.total || 0,
      page: Math.floor((filters?.offset || 0) / (filters?.limit || 50)) + 1,
      limit: filters?.limit || 50,
      totalPages: Math.ceil((response.pagination?.total || response.total || 0) / (filters?.limit || 50)),
    };
  },

  getById: async (id: string): Promise<Rfi> => {
    return apiRequest(`/rfis/${id}`);
  },

  getStats: async (projectId: string): Promise<RfiStats> => {
    const res = await apiRequest<any>(`/rfis/stats/${projectId}`);
    // Backend wraps in { success, data } — unwrap
    const d = res?.data || res;
    return {
      total: d.total ?? 0,
      by_status: d.by_status ?? {},
      overdue: d.overdue ?? 0,
      average_response_time_days: d.average_response_time_days,
    };
  },

  // PM creates an RFI
  create: async (data: Partial<Rfi>): Promise<Rfi> => {
    return apiRequest('/rfis', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // PM updates an RFI
  update: async (id: string, data: Partial<Rfi>): Promise<Rfi> => {
    return apiRequest(`/rfis/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // PM submits a draft RFI
  submit: async (id: string): Promise<Rfi> => {
    return apiRequest(`/rfis/${id}/submit`, { method: 'POST' });
  },

  // PM assigns an RFI to someone (could be client)
  assign: async (id: string, assignedTo: string): Promise<Rfi> => {
    return apiRequest(`/rfis/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ assigned_to: assignedTo }),
    });
  },

  // CLIENT/EXTERNAL responds to an RFI with optional document attachments
  respond: async (id: string, response: string, attachmentIds?: string[]): Promise<Rfi> => {
    return apiRequest(`/rfis/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify({ 
        response,
        response_attachments: attachmentIds,
      }),
    });
  },

  // Upload documents for RFI response (Client action)
  uploadResponseDocument: async (rfiId: string, file: File): Promise<Attachment> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('rfi_id', rfiId);
    formData.append('type', 'response');
    
    return uploadFile(`/rfis/${rfiId}/attachments`, formData);
  },

  // Close an RFI (PM action)
  close: async (id: string): Promise<Rfi> => {
    return apiRequest(`/rfis/${id}/close`, { method: 'POST' });
  },

  // Get comments on an RFI
  getComments: async (id: string): Promise<RfiComment[]> => {
    const response = await apiRequest<any>(`/rfis/${id}/comments`);
    return response.comments || response.data || [];
  },

  // Add comment to an RFI (both PM and Client can comment)
  addComment: async (id: string, comment: string, isInternal: boolean = false, attachments?: string[]): Promise<RfiComment> => {
    return apiRequest(`/rfis/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ comment, is_internal: isInternal, attachments }),
    });
  },

  // Upload attachment for comment
  uploadCommentAttachment: async (rfiId: string, file: File): Promise<Attachment> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'comment');
    
    return uploadFile(`/rfis/${rfiId}/attachments`, formData);
  },
};

// =====================================================
// SUBMITTAL API
// =====================================================

export const submittalApi = {
  getAll: async (filters?: {
    projectId?: string;
    status?: SubmittalStatus;
    type?: SubmittalType;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<Submittal>> => {
    const response = await apiRequest<any>('/submittals', {}, {
      projectId: filters?.projectId,
      status: filters?.status,
      type: filters?.type,
      search: filters?.search,
      limit: filters?.limit || 50,
      offset: filters?.offset || 0,
    });
    
    // Normalize backend field names: submittal_type → type
    const rawData = response.submittals || response.data || [];
    const data = rawData.map((s: any) => ({
      ...s,
      type: s.type || s.submittal_type || 'other',
    }));

    return {
      data,
      total: response.total || 0,
      page: filters?.offset ? Math.floor(filters.offset / (filters?.limit || 50)) + 1 : 1,
      limit: filters?.limit || 50,
      totalPages: Math.ceil((response.total || 0) / (filters?.limit || 50)),
    };
  },

  getById: async (id: string): Promise<Submittal> => {
    const s = await apiRequest<any>(`/submittals/${id}`);
    return { ...s, type: s.type || s.submittal_type || 'other' };
  },

  getStats: async (projectId: string): Promise<SubmittalStats> => {
    const res = await apiRequest<any>(`/submittals/stats/${projectId}`);
    // Backend returns flat shape with different field names — normalize
    const d = res?.data || res;
    return {
      total: d.total ?? d.total_submittals ?? 0,
      by_status: d.by_status ?? {
        draft: d.draft_count ?? 0,
        pending_review: d.pending_count ?? d.pending_review_count ?? 0,
        under_review: d.under_review_count ?? 0,
        approved: d.approved_count ?? 0,
        approved_as_noted: d.approved_as_noted_count ?? 0,
        revise_resubmit: d.revise_resubmit_count ?? 0,
        rejected: d.rejected_count ?? 0,
        void: d.void_count ?? 0,
      },
      overdue: d.overdue ?? d.overdue_count ?? 0,
    };
  },

  // PM creates a submittal
  create: async (data: Partial<Submittal>): Promise<Submittal> => {
    return apiRequest('/submittals', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // PM submits for review
  submitForReview: async (id: string): Promise<Submittal> => {
    return apiRequest(`/submittals/${id}/submit`, { method: 'POST' });
  },

  // CLIENT reviews a submittal (approve, reject, revise)
  review: async (id: string, status: 'approved' | 'approved_as_noted' | 'revise_resubmit' | 'rejected', comments?: string): Promise<Submittal> => {
    return apiRequest(`/submittals/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ status, review_comments: comments }),
    });
  },

  // Upload attachment to submittal
  uploadAttachment: async (submittalId: string, file: File): Promise<Attachment> => {
    const formData = new FormData();
    formData.append('file', file);
    
    return uploadFile(`/submittals/${submittalId}/attachments`, formData);
  },
};

// =====================================================
// CHANGE ORDER API
// =====================================================

// Normalize backend change order response to frontend format
function normalizeChangeOrder(co: any): ChangeOrder {
  // Map backend co_type to frontend type
  const typeMapping: Record<string, ChangeOrderType> = {
    'additive': 'addition',
    'deductive': 'deduction',
    'no_cost': 'other',
    'time_extension': 'time_extension',
    'addition': 'addition',
    'deduction': 'deduction',
    'substitution': 'substitution',
    'scope_change': 'scope_change',
    'other': 'other',
  };
  
  const rawType = co.type || co.co_type || 'other';
  const normalizedType = typeMapping[rawType] || 'other';
  
  return {
    id: co.id,
    organization_id: co.organization_id || co.organizationId || '',
    project_id: co.project_id || co.projectId || '',
    co_number: co.co_number || co.coNumber || '',
    title: co.title || '',
    description: co.description || '',
    type: normalizedType,
    status: co.status || 'draft',
    reason: co.reason || '',
    justification: co.justification || co.reason_details || '',
    original_amount: co.original_amount || co.original_contract_amount || 0,
    revised_amount: co.revised_amount || co.approved_amount,
    cost_impact: co.cost_impact || co.this_change_amount || 0,
    schedule_impact_days: co.schedule_impact_days || 0,
    currency: co.currency || 'GHS',
    submitted_by: co.submitted_by || co.created_by,
    submitted_by_name: co.submitted_by_name || co.created_by_name,
    approved_by: co.approved_by,
    approved_by_name: co.approved_by_name,
    executed_by: co.executed_by,
    executed_by_name: co.executed_by_name,
    submitted_at: co.submitted_at,
    approved_at: co.approved_at,
    executed_at: co.executed_at,
    rejection_reason: co.rejection_reason,
    items: co.items,
    attachments: co.attachments,
    project_name: co.project_name,
    project_number: co.project_number,
    created_at: co.created_at || new Date().toISOString(),
    updated_at: co.updated_at || new Date().toISOString(),
  };
}

export const changeOrderApi = {
  getAll: async (filters?: {
    projectId?: string;
    status?: ChangeOrderStatus;
    type?: ChangeOrderType;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<ChangeOrder>> => {
    const response = await apiRequest<any>('/change-orders', {}, {
      projectId: filters?.projectId,
      status: filters?.status,
      type: filters?.type,
      search: filters?.search,
      limit: filters?.limit || 50,
      offset: filters?.offset || 0,
    });
    
    const rawData = response.data || response || [];
    const normalizedData = Array.isArray(rawData) ? rawData.map(normalizeChangeOrder) : [];
    
    return {
      data: normalizedData,
      total: response.pagination?.total || response.total || 0,
      page: Math.floor((filters?.offset || 0) / (filters?.limit || 50)) + 1,
      limit: filters?.limit || 50,
      totalPages: Math.ceil((response.pagination?.total || response.total || 0) / (filters?.limit || 50)),
    };
  },

  getById: async (id: string): Promise<ChangeOrder> => {
    const response = await apiRequest<any>(`/change-orders/${id}`);
    return normalizeChangeOrder(response.data || response);
  },

  getStats: async (projectId: string): Promise<ChangeOrderStats> => {
    const res = await apiRequest<any>(`/change-orders/stats/${projectId}`);
    const d = res?.data || res;
    return {
      total: d.total ?? 0,
      by_status: d.by_status ?? {},
      total_cost_impact: d.total_cost_impact ?? 0,
      total_approved: d.total_approved ?? 0,
      total_pending: d.total_pending ?? 0,
    };
  },

  // PM creates a change order
  create: async (data: Partial<ChangeOrder>): Promise<ChangeOrder> => {
    return apiRequest('/change-orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // PM submits for approval
  submitForApproval: async (id: string): Promise<ChangeOrder> => {
    return apiRequest(`/change-orders/${id}/submit`, { method: 'POST' });
  },

  // CLIENT approves a change order
  approve: async (id: string, comments?: string): Promise<ChangeOrder> => {
    return apiRequest(`/change-orders/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ comments }),
    });
  },

  // CLIENT rejects a change order
  reject: async (id: string, reason: string): Promise<ChangeOrder> => {
    return apiRequest(`/change-orders/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ rejection_reason: reason }),
    });
  },

  // PM marks as executed after approval
  execute: async (id: string): Promise<ChangeOrder> => {
    return apiRequest(`/change-orders/${id}/execute`, { method: 'POST' });
  },
};

// =====================================================
// MILESTONE API
// =====================================================

// Helper to normalize milestone data from API (camelCase) to frontend (snake_case)
function normalizeMilestone(m: any): Milestone {
  // Map API status to frontend status
  let status: MilestoneStatus = 'not_started';
  if (m.status === 'in_progress') status = 'in_progress';
  else if (m.status === 'completed') status = 'completed';
  else if (m.status === 'blocked') status = 'blocked';
  else if (m.status === 'overdue') status = 'overdue';
  else if (m.status === 'pending') status = 'not_started';
  
  return {
    id: m.id,
    project_id: m.projectId || m.project_id,
    phase_id: m.phaseId || m.phase_id,
    phase_name: m.phase_name || m.phaseName,
    name: m.name,
    description: m.description,
    status,
    target_date: m.targetDate || m.target_date || m.due_date,
    completed_date: m.actualDate || m.completed_date,
    progress: m.progress || 0,
    is_required: m.isRequired || m.is_required || false,
    requires_client_approval: m.requiresClientApproval || m.requires_client_approval || false,
    approved_by_client: m.approvedByClient || m.approved_by_client || false,
    approved_at: m.approvedAt || m.approved_at,
    dependencies: m.dependsOnMilestoneIds || m.dependencies || [],
    created_at: m.createdAt || m.created_at,
    updated_at: m.updatedAt || m.updated_at,
  };
}

export const milestoneApi = {
  getByProject: async (projectId: string): Promise<Milestone[]> => {
    const response = await apiRequest<any>(`/projects/${projectId}/milestones`);
    // Handle both array response and wrapped response formats
    let milestones: any[];
    if (Array.isArray(response)) {
      milestones = response;
    } else {
      milestones = response.milestones || response.data || [];
    }
    // Normalize each milestone
    return milestones.map(normalizeMilestone);
  },

  getById: async (projectId: string, milestoneId: string): Promise<Milestone> => {
    const response = await apiRequest<any>(`/projects/${projectId}/milestones/${milestoneId}`);
    return normalizeMilestone(response);
  },

  // PM creates milestone within allowed phase
  create: async (projectId: string, data: Partial<Milestone>): Promise<Milestone> => {
    return apiRequest(`/projects/${projectId}/milestones`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // PM updates milestone
  update: async (projectId: string, milestoneId: string, data: Partial<Milestone>): Promise<Milestone> => {
    return apiRequest(`/projects/${projectId}/milestones/${milestoneId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // PM marks milestone complete
  complete: async (projectId: string, milestoneId: string): Promise<Milestone> => {
    return apiRequest(`/projects/${projectId}/milestones/${milestoneId}/complete`, { method: 'POST' });
  },

  // CLIENT approves milestone (for those requiring approval)
  approve: async (projectId: string, milestoneId: string): Promise<Milestone> => {
    return apiRequest(`/projects/${projectId}/milestones/${milestoneId}/approve`, { method: 'POST' });
  },
};

// =====================================================
// MILESTONE FRAMEWORK API (Admin/Governance)
// =====================================================

export const frameworkApi = {
  getAll: async (filters?: {
    organizationId?: string;
    projectType?: string;
    isActive?: boolean;
  }): Promise<MilestoneFramework[]> => {
    const response = await apiRequest<any>('/milestone-frameworks', {}, {
      organization_id: filters?.organizationId,
      project_type: filters?.projectType,
      is_active: filters?.isActive,
    });
    return response.frameworks || response.data || [];
  },

  getById: async (id: string): Promise<MilestoneFramework> => {
    return apiRequest(`/milestone-frameworks/${id}`);
  },

  // Admin creates a framework
  create: async (data: Partial<MilestoneFramework>): Promise<MilestoneFramework> => {
    return apiRequest('/milestone-frameworks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get phases for a framework
  getPhases: async (frameworkId: string): Promise<FrameworkPhase[]> => {
    const response = await apiRequest<any>(`/milestone-frameworks/${frameworkId}/phases`);
    return response.phases || response.data || [];
  },

  // Get templates for a phase
  getTemplates: async (phaseId: string): Promise<MilestoneTemplate[]> => {
    const response = await apiRequest<any>(`/framework-phases/${phaseId}/templates`);
    return response.templates || response.data || [];
  },
};

// =====================================================
// PUNCH LIST API
// =====================================================

export const punchListApi = {
  getAll: async (filters?: {
    projectId?: string;
    status?: PunchItemStatus;
    priority?: PunchItemPriority;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<PunchItem>> => {
    const projectId = filters?.projectId || 'all';
    const response = await apiRequest<any>(`/projects/${projectId}/punch-items`, {}, {
      status: filters?.status,
      priority: filters?.priority,
      search: filters?.search,
      limit: filters?.limit || 50,
      offset: filters?.offset || 0,
    });
    
    return {
      data: response.data || [],
      total: response.pagination?.total || response.total || 0,
      page: Math.floor((filters?.offset || 0) / (filters?.limit || 50)) + 1,
      limit: filters?.limit || 50,
      totalPages: Math.ceil((response.pagination?.total || response.total || 0) / (filters?.limit || 50)),
    };
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
};

// =====================================================
// PHOTO API
// =====================================================

export const photoApi = {
  getAll: async (filters?: {
    projectId?: string;
    phaseId?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<Photo>> => {
    const response = await apiRequest<any>('/photos', {}, {
      project_id: filters?.projectId,
      phase_id: filters?.phaseId,
      tags: filters?.tags?.join(','),
      limit: filters?.limit || 50,
      offset: filters?.offset || 0,
    });
    
    return {
      data: response.photos || response.data || [],
      total: response.total || 0,
      page: Math.floor((filters?.offset || 0) / (filters?.limit || 50)) + 1,
      limit: filters?.limit || 50,
      totalPages: Math.ceil((response.total || 0) / (filters?.limit || 50)),
    };
  },

  upload: async (projectId: string, file: File, metadata?: { description?: string; location?: string; tags?: string[] }): Promise<Photo> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('project_id', projectId);
    if (metadata?.description) formData.append('description', metadata.description);
    if (metadata?.location) formData.append('location', metadata.location);
    if (metadata?.tags) formData.append('tags', JSON.stringify(metadata.tags));
    
    return uploadFile('/photos/upload', formData);
  },
};

// =====================================================
// DAILY LOG API
// =====================================================

export const dailyLogApi = {
  getAll: async (filters?: {
    projectId?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<DailyLog>> => {
    const response = await apiRequest<any>('/site-diaries', {}, {
      project_id: filters?.projectId,
      date_from: filters?.dateFrom,
      date_to: filters?.dateTo,
      limit: filters?.limit || 50,
      offset: filters?.offset || 0,
    });
    
    return {
      data: response.logs || response.data || [],
      total: response.total || 0,
      page: Math.floor((filters?.offset || 0) / (filters?.limit || 50)) + 1,
      limit: filters?.limit || 50,
      totalPages: Math.ceil((response.total || 0) / (filters?.limit || 50)),
    };
  },

  create: async (data: Partial<DailyLog>): Promise<DailyLog> => {
    return apiRequest('/site-diaries', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// =====================================================
// APPROVAL API (Governance)
// =====================================================

export const approvalApi = {
  getPending: async (filters?: {
    projectId?: string;
    type?: ApprovalType;
  }): Promise<ApprovalRequest[]> => {
    const response = await apiRequest<any>('/approvals/pending', {}, {
      project_id: filters?.projectId,
      type: filters?.type,
    });
    return response.approvals || response.data || [];
  },

  approve: async (id: string, comments?: string): Promise<ApprovalRequest> => {
    return apiRequest(`/approvals/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ comments }),
    });
  },

  reject: async (id: string, reason: string): Promise<ApprovalRequest> => {
    return apiRequest(`/approvals/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ rejection_reason: reason }),
    });
  },
};

// =====================================================
// DOCUMENT UPLOAD API (For RFI Responses)
// =====================================================

export const documentApi = {
  upload: async (file: File, context: {
    projectId: string;
    entityType: 'rfi' | 'submittal' | 'change_order' | 'milestone';
    entityId: string;
    documentType?: string;
  }): Promise<Attachment> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('project_id', context.projectId);
    formData.append('entity_type', context.entityType);
    formData.append('entity_id', context.entityId);
    if (context.documentType) formData.append('document_type', context.documentType);
    
    return uploadFile('/documents/upload', formData);
  },

  getByEntity: async (entityType: string, entityId: string): Promise<Attachment[]> => {
    const response = await apiRequest<any>(`/documents`, {}, {
      entity_type: entityType,
      entity_id: entityId,
    });
    return response.documents || response.data || [];
  },
};
