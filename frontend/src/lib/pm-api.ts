/**
 * Project Management API Client
 * Comprehensive API for PM Portal and Client Dashboard
 * Connects to live backend endpoints
 */

import { fetchApi } from './api';

// =====================================================
// TYPES
// =====================================================

// RFI Types
export type RfiStatus = 'draft' | 'submitted' | 'under_review' | 'responded' | 'closed' | 'void';
export type RfiPriority = 'low' | 'normal' | 'high' | 'urgent';
export type RfiCategory = 'design' | 'structural' | 'mep' | 'finish' | 'site' | 'schedule' | 'cost' | 'other';

export interface RFI {
  id: string;
  project_id: string;
  rfi_number: string;
  title: string;
  description: string;
  status: RfiStatus;
  priority: RfiPriority;
  category: RfiCategory;
  phase_id?: string;
  phase_name?: string;
  cost_code_id?: string;
  cost_impact?: number;
  schedule_impact_days?: number;
  submitted_by?: string;
  submitted_by_name?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  due_date?: string;
  responded_at?: string;
  response?: string;
  responded_by?: string;
  closed_at?: string;
  closed_by?: string;
  attachments?: string[];
  created_at: string;
  updated_at: string;
}

export interface RfiStats {
  total: number;
  open: number;
  closed: number;
  overdue: number;
  avg_response_days: number;
  by_status: Record<RfiStatus, number>;
  by_priority: Record<RfiPriority, number>;
  by_category: Record<RfiCategory, number>;
}

export interface RfiFilters {
  project_id?: string;
  status?: RfiStatus;
  priority?: RfiPriority;
  category?: RfiCategory;
  assigned_to?: string;
  phase_id?: string;
  is_overdue?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// Submittal Types
export type SubmittalStatus = 
  | 'draft' 
  | 'pending_submission' 
  | 'submitted' 
  | 'under_review' 
  | 'approved' 
  | 'approved_as_noted' 
  | 'revise_resubmit' 
  | 'rejected' 
  | 'void';

export type SubmittalType = 
  | 'shop_drawings' 
  | 'product_data' 
  | 'samples' 
  | 'mock_ups' 
  | 'design_data' 
  | 'test_reports' 
  | 'certificates' 
  | 'manufacturers_instructions' 
  | 'o_and_m_data' 
  | 'closeout' 
  | 'other';

export interface Submittal {
  id: string;
  project_id: string;
  submittal_number: string;
  title: string;
  description?: string;
  status: SubmittalStatus;
  submittal_type: SubmittalType;
  spec_section?: string;
  priority?: string;
  contractor_id?: string;
  contractor_name?: string;
  assigned_reviewer?: string;
  assigned_reviewer_name?: string;
  revision_number: number;
  required_date?: string;
  submitted_date?: string;
  review_due_date?: string;
  approved_date?: string;
  lead_time_days?: number;
  cost_code_id?: string;
  phase_id?: string;
  phase_name?: string;
  attachments?: string[];
  review_comments?: string;
  created_at: string;
  updated_at: string;
}

export interface SubmittalStats {
  total: number;
  pending_review: number;
  approved: number;
  rejected: number;
  overdue: number;
  by_status: Record<SubmittalStatus, number>;
  by_type: Record<SubmittalType, number>;
  avg_review_days: number;
}

export interface SubmittalFilters {
  project_id?: string;
  status?: SubmittalStatus;
  submittal_type?: SubmittalType;
  contractor_id?: string;
  assigned_reviewer?: string;
  spec_section?: string;
  overdue_only?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// Change Order Types
export type ChangeOrderStatus = 
  | 'draft' 
  | 'pending_review' 
  | 'approved' 
  | 'rejected' 
  | 'executed' 
  | 'void';

export type ChangeOrderType = 'additive' | 'deductive' | 'no_cost';

export interface ChangeOrder {
  id: string;
  project_id: string;
  change_order_number: string;
  title: string;
  description?: string;
  status: ChangeOrderStatus;
  change_order_type: ChangeOrderType;
  reason?: string;
  original_amount: number;
  revised_amount: number;
  cost_impact: number;
  schedule_impact_days?: number;
  contractor_id?: string;
  contractor_name?: string;
  phase_id?: string;
  phase_name?: string;
  requested_by?: string;
  requested_by_name?: string;
  approved_by?: string;
  approved_by_name?: string;
  approved_at?: string;
  executed_at?: string;
  attachments?: string[];
  line_items?: ChangeOrderLineItem[];
  created_at: string;
  updated_at: string;
}

export interface ChangeOrderLineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  cost_code_id?: string;
}

export interface ChangeOrderStats {
  total: number;
  pending: number;
  approved: number;
  executed: number;
  total_cost_impact: number;
  total_schedule_impact_days: number;
  by_status: Record<ChangeOrderStatus, number>;
  by_type: Record<ChangeOrderType, number>;
}

export interface ChangeOrderFilters {
  project_id?: string;
  status?: ChangeOrderStatus;
  change_order_type?: ChangeOrderType;
  contractor_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// Photo Documentation Types
export type PhotoCategory = 
  | 'progress' 
  | 'safety' 
  | 'quality' 
  | 'issue' 
  | 'inspection' 
  | 'delivery' 
  | 'weather' 
  | 'equipment' 
  | 'other';

export interface ProjectPhoto {
  id: string;
  project_id: string;
  phase_id?: string;
  phase_name?: string;
  title?: string;
  description?: string;
  category: PhotoCategory;
  photo_url: string;
  thumbnail_url?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  taken_at: string;
  taken_by?: string;
  taken_by_name?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  created_at: string;
}

export interface PhotoFilters {
  project_id?: string;
  phase_id?: string;
  category?: PhotoCategory;
  date_from?: string;
  date_to?: string;
  taken_by?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// Site Log Types
export interface SiteLog {
  id: string;
  project_id: string;
  log_date: string;
  weather_morning?: string;
  weather_afternoon?: string;
  temperature_high?: number;
  temperature_low?: number;
  work_performed?: string;
  materials_delivered?: string;
  equipment_on_site?: string;
  visitors?: string;
  safety_incidents?: string;
  delays_issues?: string;
  labor_count?: number;
  labor_details?: { trade: string; count: number; hours: number }[];
  photos?: string[];
  submitted_by?: string;
  submitted_by_name?: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface SiteLogFilters {
  project_id?: string;
  date_from?: string;
  date_to?: string;
  submitted_by?: string;
  page?: number;
  limit?: number;
}

// Punch List Types
export type PunchListStatus = 'open' | 'in_progress' | 'completed' | 'verified' | 'rejected';
export type PunchListPriority = 'low' | 'normal' | 'high' | 'critical';

export interface PunchListItem {
  id: string;
  project_id: string;
  unit_id?: string;
  unit_number?: string;
  phase_id?: string;
  phase_name?: string;
  item_number: string;
  description: string;
  location?: string;
  status: PunchListStatus;
  priority: PunchListPriority;
  category?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  due_date?: string;
  completed_date?: string;
  verified_date?: string;
  verified_by?: string;
  photos?: string[];
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface PunchListStats {
  total: number;
  open: number;
  in_progress: number;
  completed: number;
  verified: number;
  overdue: number;
  by_priority: Record<PunchListPriority, number>;
  by_unit: { unit_id: string; unit_number: string; count: number }[];
}

export interface PunchListFilters {
  project_id?: string;
  unit_id?: string;
  phase_id?: string;
  status?: PunchListStatus;
  priority?: PunchListPriority;
  assigned_to?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// Procurement Types
export type ProcurementStatus = 
  | 'draft' 
  | 'pending_approval' 
  | 'approved' 
  | 'ordered' 
  | 'partially_received' 
  | 'received' 
  | 'cancelled';

export interface ProcurementOrder {
  id: string;
  project_id: string;
  order_number: string;
  vendor_id?: string;
  vendor_name?: string;
  description: string;
  status: ProcurementStatus;
  total_amount: number;
  currency: string;
  order_date?: string;
  expected_delivery_date?: string;
  actual_delivery_date?: string;
  phase_id?: string;
  cost_code_id?: string;
  line_items?: ProcurementLineItem[];
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ProcurementLineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  received_quantity?: number;
}

export interface ProcurementFilters {
  project_id?: string;
  status?: ProcurementStatus;
  vendor_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// Ghana Compliance Types
export interface GhanaComplianceItem {
  id: string;
  project_id: string;
  compliance_type: 'epa' | 'lands_commission' | 'gra' | 'ssnit' | 'nhis' | 'district_assembly' | 'fire_service';
  reference_number?: string;
  status: 'pending' | 'submitted' | 'approved' | 'rejected' | 'expired';
  description: string;
  issue_date?: string;
  expiry_date?: string;
  documents?: string[];
  notes?: string;
  created_at: string;
  updated_at: string;
}

// Governance Types
export interface ApprovalRequest {
  id: string;
  organization_id: string;
  project_id: string;
  request_type: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  title: string;
  description?: string;
  entity_type: string;
  entity_id: string;
  requested_by: string;
  requested_by_name?: string;
  reviewed_by?: string;
  reviewed_by_name?: string;
  reviewed_at?: string;
  review_notes?: string;
  created_at: string;
}

export interface ComplianceCheckpoint {
  id: string;
  project_id: string;
  milestone_id?: string;
  checkpoint_type: string;
  name: string;
  description?: string;
  status: 'pending' | 'passed' | 'failed' | 'waived';
  required_evidence?: string[];
  submitted_evidence?: string[];
  verified_by?: string;
  verified_at?: string;
  notes?: string;
  created_at: string;
}

// Paginated Response
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// =====================================================
// API ENDPOINTS
// =====================================================

const BASE = '/api';

// RFI API
export const rfiApi = {
  getAll: async (filters?: RfiFilters): Promise<PaginatedResponse<RFI>> => {
    const params = new URLSearchParams();
    if (filters?.project_id) params.set('projectId', filters.project_id);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.priority) params.set('priority', filters.priority);
    if (filters?.category) params.set('category', filters.category);
    if (filters?.assigned_to) params.set('assignedTo', filters.assigned_to);
    if (filters?.phase_id) params.set('phaseId', filters.phase_id);
    if (filters?.is_overdue) params.set('isOverdue', 'true');
    if (filters?.search) params.set('search', filters.search);
    if (filters?.page) params.set('offset', String((filters.page - 1) * (filters.limit || 20)));
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.sort_by) params.set('sortBy', filters.sort_by);
    if (filters?.sort_order) params.set('sortOrder', filters.sort_order);
    
    const query = params.toString();
    const response = await fetchApi<any>(`${BASE}/rfis${query ? `?${query}` : ''}`);
    
    return {
      data: response.data || [],
      total: response.pagination?.total || 0,
      page: filters?.page || 1,
      limit: filters?.limit || 20,
      totalPages: Math.ceil((response.pagination?.total || 0) / (filters?.limit || 20))
    };
  },

  getById: (id: string): Promise<RFI> => {
    return fetchApi(`${BASE}/rfis/${id}`);
  },

  getStats: (projectId: string): Promise<RfiStats> => {
    return fetchApi<any>(`${BASE}/rfis/stats/${projectId}`).then(r => r.data || r);
  },

  create: (data: Partial<RFI>): Promise<RFI> => {
    return fetchApi(`${BASE}/rfis`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: (id: string, data: Partial<RFI>): Promise<RFI> => {
    return fetchApi(`${BASE}/rfis/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  submit: (id: string): Promise<RFI> => {
    return fetchApi(`${BASE}/rfis/${id}/submit`, { method: 'POST' });
  },

  assign: (id: string, userId: string): Promise<RFI> => {
    return fetchApi(`${BASE}/rfis/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ assignedTo: userId }),
    });
  },

  respond: (id: string, response: string, attachments?: string[]): Promise<RFI> => {
    return fetchApi(`${BASE}/rfis/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify({ response, attachments }),
    });
  },

  close: (id: string): Promise<RFI> => {
    return fetchApi(`${BASE}/rfis/${id}/close`, { method: 'POST' });
  },

  void: (id: string, reason: string): Promise<RFI> => {
    return fetchApi(`${BASE}/rfis/${id}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  getComments: (id: string): Promise<any[]> => {
    return fetchApi(`${BASE}/rfis/${id}/comments`);
  },

  addComment: (id: string, comment: string, attachments?: string[]): Promise<any> => {
    return fetchApi(`${BASE}/rfis/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ comment, attachments }),
    });
  },

  getHistory: (id: string): Promise<any[]> => {
    return fetchApi(`${BASE}/rfis/${id}/history`);
  },
};

// Submittal API
export const submittalApi = {
  getAll: async (filters?: SubmittalFilters): Promise<PaginatedResponse<Submittal>> => {
    const params = new URLSearchParams();
    if (filters?.project_id) params.set('project_id', filters.project_id);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.submittal_type) params.set('submittal_type', filters.submittal_type);
    if (filters?.contractor_id) params.set('contractor_id', filters.contractor_id);
    if (filters?.assigned_reviewer) params.set('assigned_reviewer', filters.assigned_reviewer);
    if (filters?.spec_section) params.set('spec_section', filters.spec_section);
    if (filters?.overdue_only) params.set('overdue_only', 'true');
    if (filters?.search) params.set('search', filters.search);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.sort_by) params.set('sort_by', filters.sort_by);
    if (filters?.sort_order) params.set('sort_order', filters.sort_order);
    
    const query = params.toString();
    const response = await fetchApi<any>(`${BASE}/submittals${query ? `?${query}` : ''}`);
    
    return {
      data: response.data || response.submittals || [],
      total: response.total || response.pagination?.total || 0,
      page: response.page || filters?.page || 1,
      limit: response.limit || filters?.limit || 20,
      totalPages: response.totalPages || Math.ceil((response.total || 0) / (filters?.limit || 20))
    };
  },

  getById: (id: string): Promise<Submittal> => {
    return fetchApi(`${BASE}/submittals/${id}`);
  },

  getStats: (projectId: string): Promise<SubmittalStats> => {
    return fetchApi(`${BASE}/submittals/stats/${projectId}`);
  },

  getBySpecSection: (projectId: string): Promise<any[]> => {
    return fetchApi(`${BASE}/submittals/by-spec/${projectId}`);
  },

  create: (data: Partial<Submittal>): Promise<Submittal> => {
    return fetchApi(`${BASE}/submittals`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: (id: string, data: Partial<Submittal>): Promise<Submittal> => {
    return fetchApi(`${BASE}/submittals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  submit: (id: string): Promise<Submittal> => {
    return fetchApi(`${BASE}/submittals/${id}/submit`, { method: 'POST' });
  },

  review: (id: string, status: SubmittalStatus, comments?: string): Promise<Submittal> => {
    return fetchApi(`${BASE}/submittals/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ status, comments }),
    });
  },

  addRevision: (id: string, data: { attachments: string[]; notes?: string }): Promise<Submittal> => {
    return fetchApi(`${BASE}/submittals/${id}/revisions`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// Change Order API
export const changeOrderApi = {
  getAll: async (filters?: ChangeOrderFilters): Promise<PaginatedResponse<ChangeOrder>> => {
    const params = new URLSearchParams();
    if (filters?.project_id) params.set('project_id', filters.project_id);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.change_order_type) params.set('type', filters.change_order_type);
    if (filters?.contractor_id) params.set('contractor_id', filters.contractor_id);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));
    
    const query = params.toString();
    const response = await fetchApi<any>(`${BASE}/change-orders${query ? `?${query}` : ''}`);
    
    return {
      data: response.data || response.changeOrders || [],
      total: response.total || 0,
      page: response.page || filters?.page || 1,
      limit: response.limit || filters?.limit || 20,
      totalPages: response.totalPages || Math.ceil((response.total || 0) / (filters?.limit || 20))
    };
  },

  getById: (id: string): Promise<ChangeOrder> => {
    return fetchApi(`${BASE}/change-orders/${id}`);
  },

  getStats: (projectId: string): Promise<ChangeOrderStats> => {
    return fetchApi(`${BASE}/change-orders/stats/${projectId}`);
  },

  create: (data: Partial<ChangeOrder>): Promise<ChangeOrder> => {
    return fetchApi(`${BASE}/change-orders`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: (id: string, data: Partial<ChangeOrder>): Promise<ChangeOrder> => {
    return fetchApi(`${BASE}/change-orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  submit: (id: string): Promise<ChangeOrder> => {
    return fetchApi(`${BASE}/change-orders/${id}/submit`, { method: 'POST' });
  },

  approve: (id: string, notes?: string): Promise<ChangeOrder> => {
    return fetchApi(`${BASE}/change-orders/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  },

  reject: (id: string, reason: string): Promise<ChangeOrder> => {
    return fetchApi(`${BASE}/change-orders/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  execute: (id: string): Promise<ChangeOrder> => {
    return fetchApi(`${BASE}/change-orders/${id}/execute`, { method: 'POST' });
  },
};

// Photo Documentation API
export const photoApi = {
  getAll: async (filters?: PhotoFilters): Promise<PaginatedResponse<ProjectPhoto>> => {
    const params = new URLSearchParams();
    if (filters?.project_id) params.set('project_id', filters.project_id);
    if (filters?.phase_id) params.set('phase_id', filters.phase_id);
    if (filters?.category) params.set('category', filters.category);
    if (filters?.date_from) params.set('date_from', filters.date_from);
    if (filters?.date_to) params.set('date_to', filters.date_to);
    if (filters?.taken_by) params.set('taken_by', filters.taken_by);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));
    
    const query = params.toString();
    const response = await fetchApi<any>(`${BASE}/photos${query ? `?${query}` : ''}`);
    
    return {
      data: response.data || response.photos || [],
      total: response.total || 0,
      page: response.page || filters?.page || 1,
      limit: response.limit || filters?.limit || 20,
      totalPages: response.totalPages || Math.ceil((response.total || 0) / (filters?.limit || 20))
    };
  },

  getById: (id: string): Promise<ProjectPhoto> => {
    return fetchApi(`${BASE}/photos/${id}`);
  },

  upload: (data: Partial<ProjectPhoto>): Promise<ProjectPhoto> => {
    return fetchApi(`${BASE}/photos`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: (id: string, data: Partial<ProjectPhoto>): Promise<ProjectPhoto> => {
    return fetchApi(`${BASE}/photos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete: (id: string): Promise<void> => {
    return fetchApi(`${BASE}/photos/${id}`, { method: 'DELETE' });
  },

  getByProject: (projectId: string, limit?: number): Promise<ProjectPhoto[]> => {
    const params = limit ? `?limit=${limit}` : '';
    return fetchApi<any>(`${BASE}/photos/project/${projectId}${params}`).then(r => r.data || r.photos || []);
  },
};

// Site Log API
export const siteLogApi = {
  getAll: async (filters?: SiteLogFilters): Promise<PaginatedResponse<SiteLog>> => {
    const params = new URLSearchParams();
    if (filters?.project_id) params.set('project_id', filters.project_id);
    if (filters?.date_from) params.set('date_from', filters.date_from);
    if (filters?.date_to) params.set('date_to', filters.date_to);
    if (filters?.submitted_by) params.set('submitted_by', filters.submitted_by);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));
    
    const query = params.toString();
    const response = await fetchApi<any>(`${BASE}/site-diaries${query ? `?${query}` : ''}`);
    
    return {
      data: response.data || response.logs || [],
      total: response.total || 0,
      page: response.page || filters?.page || 1,
      limit: response.limit || filters?.limit || 20,
      totalPages: response.totalPages || Math.ceil((response.total || 0) / (filters?.limit || 20))
    };
  },

  getById: (id: string): Promise<SiteLog> => {
    return fetchApi(`${BASE}/site-diaries/${id}`);
  },

  getByDate: (projectId: string, date: string): Promise<SiteLog | null> => {
    return fetchApi(`${BASE}/site-diaries/project/${projectId}/date/${date}`);
  },

  create: (data: Partial<SiteLog>): Promise<SiteLog> => {
    return fetchApi(`${BASE}/site-diaries`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: (id: string, data: Partial<SiteLog>): Promise<SiteLog> => {
    return fetchApi(`${BASE}/site-diaries/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  approve: (id: string): Promise<SiteLog> => {
    return fetchApi(`${BASE}/site-diaries/${id}/approve`, { method: 'POST' });
  },
};

// Punch List API
export const punchListApi = {
  getAll: async (filters?: PunchListFilters): Promise<PaginatedResponse<PunchListItem>> => {
    const params = new URLSearchParams();
    if (filters?.project_id) params.set('project_id', filters.project_id);
    if (filters?.unit_id) params.set('unit_id', filters.unit_id);
    if (filters?.phase_id) params.set('phase_id', filters.phase_id);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.priority) params.set('priority', filters.priority);
    if (filters?.assigned_to) params.set('assigned_to', filters.assigned_to);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));
    
    const query = params.toString();
    const response = await fetchApi<any>(`/projects/punch-list${query ? `?${query}` : ''}`);
    
    return {
      data: response.data || response.items || [],
      total: response.total || 0,
      page: response.page || filters?.page || 1,
      limit: response.limit || filters?.limit || 20,
      totalPages: response.totalPages || Math.ceil((response.total || 0) / (filters?.limit || 20))
    };
  },

  getById: (id: string): Promise<PunchListItem> => {
    return fetchApi(`/projects/punch-list/${id}`);
  },

  getStats: (projectId: string): Promise<PunchListStats> => {
    return fetchApi(`/projects/${projectId}/punch-list/stats`);
  },

  create: (data: Partial<PunchListItem>): Promise<PunchListItem> => {
    return fetchApi(`/projects/punch-list`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: (id: string, data: Partial<PunchListItem>): Promise<PunchListItem> => {
    return fetchApi(`/projects/punch-list/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  updateStatus: (id: string, status: PunchListStatus): Promise<PunchListItem> => {
    return fetchApi(`/projects/punch-list/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  verify: (id: string): Promise<PunchListItem> => {
    return fetchApi(`/projects/punch-list/${id}/verify`, { method: 'POST' });
  },
};

// Procurement API
export const procurementApi = {
  getAll: async (filters?: ProcurementFilters): Promise<PaginatedResponse<ProcurementOrder>> => {
    const params = new URLSearchParams();
    if (filters?.project_id) params.set('project_id', filters.project_id);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.vendor_id) params.set('vendor_id', filters.vendor_id);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));
    
    const query = params.toString();
    const response = await fetchApi<any>(`${BASE}/procurement${query ? `?${query}` : ''}`);
    
    return {
      data: response.data || response.orders || [],
      total: response.total || 0,
      page: response.page || filters?.page || 1,
      limit: response.limit || filters?.limit || 20,
      totalPages: response.totalPages || Math.ceil((response.total || 0) / (filters?.limit || 20))
    };
  },

  getById: (id: string): Promise<ProcurementOrder> => {
    return fetchApi(`${BASE}/procurement/${id}`);
  },

  create: (data: Partial<ProcurementOrder>): Promise<ProcurementOrder> => {
    return fetchApi(`${BASE}/procurement`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: (id: string, data: Partial<ProcurementOrder>): Promise<ProcurementOrder> => {
    return fetchApi(`${BASE}/procurement/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  approve: (id: string): Promise<ProcurementOrder> => {
    return fetchApi(`${BASE}/procurement/${id}/approve`, { method: 'POST' });
  },

  recordDelivery: (id: string, items: { item_id: string; received_quantity: number }[]): Promise<ProcurementOrder> => {
    return fetchApi(`${BASE}/procurement/${id}/receive`, {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  },
};

// Governance API
export const governanceApi = {
  getApprovalRequests: async (projectId: string): Promise<ApprovalRequest[]> => {
    const response = await fetchApi<any>(`/projects/${projectId}/approvals`);
    return response.data || response.requests || [];
  },

  getPendingApprovals: async (organizationId?: string): Promise<ApprovalRequest[]> => {
    const params = organizationId ? `?organization_id=${organizationId}` : '';
    const response = await fetchApi<any>(`/projects/approvals/pending${params}`);
    return response.data || response.requests || [];
  },

  approveRequest: (id: string, notes?: string): Promise<ApprovalRequest> => {
    return fetchApi(`/projects/approvals/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  },

  rejectRequest: (id: string, reason: string): Promise<ApprovalRequest> => {
    return fetchApi(`/projects/approvals/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  getComplianceCheckpoints: async (projectId: string): Promise<ComplianceCheckpoint[]> => {
    const response = await fetchApi<any>(`/projects/${projectId}/compliance`);
    return response.data || response.checkpoints || [];
  },

  updateCheckpoint: (id: string, data: Partial<ComplianceCheckpoint>): Promise<ComplianceCheckpoint> => {
    return fetchApi(`/projects/compliance/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  submitEvidence: (checkpointId: string, evidence: string[]): Promise<ComplianceCheckpoint> => {
    return fetchApi(`/projects/compliance/${checkpointId}/evidence`, {
      method: 'POST',
      body: JSON.stringify({ evidence }),
    });
  },
};

// Ghana Compliance API
export const ghanaComplianceApi = {
  getAll: async (projectId: string): Promise<GhanaComplianceItem[]> => {
    const response = await fetchApi<any>(`/projects/${projectId}/ghana-compliance`);
    return response.data || response.items || [];
  },

  create: (data: Partial<GhanaComplianceItem>): Promise<GhanaComplianceItem> => {
    return fetchApi(`/projects/${data.project_id}/ghana-compliance`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: (id: string, data: Partial<GhanaComplianceItem>): Promise<GhanaComplianceItem> => {
    return fetchApi(`/projects/ghana-compliance/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  getExpiringDocuments: (days?: number): Promise<GhanaComplianceItem[]> => {
    const params = days ? `?days=${days}` : '';
    return fetchApi<any>(`/projects/ghana-compliance/expiring${params}`).then(r => r.data || []);
  },
};

// Portfolio / Dashboard Analytics API
export const portfolioApi = {
  getStats: (): Promise<{
    total_projects: number;
    active_projects: number;
    total_units: number;
    units_sold: number;
    total_budget: number;
    total_spent: number;
    avg_progress: number;
    projects_on_schedule: number;
    projects_delayed: number;
  }> => {
    return fetchApi('/projects/stats');
  },

  getProjectsByStatus: (): Promise<{ status: string; count: number }[]> => {
    return fetchApi('/projects/analytics/by-status');
  },

  getRecentActivity: (limit?: number): Promise<any[]> => {
    const params = limit ? `?limit=${limit}` : '';
    return fetchApi(`/projects/analytics/activity${params}`);
  },

  getUpcomingMilestones: (days?: number): Promise<any[]> => {
    const params = days ? `?days=${days}` : '';
    return fetchApi(`/projects/analytics/milestones${params}`);
  },

  getBudgetOverview: (): Promise<{
    total_budget: number;
    total_committed: number;
    total_spent: number;
    remaining: number;
    by_category: { category: string; budgeted: number; spent: number }[];
  }> => {
    return fetchApi('/projects/analytics/budget');
  },
};

// Team API
export const teamApi = {
  getProjectTeam: (projectId: string): Promise<any[]> => {
    return fetchApi(`/projects/${projectId}/team`);
  },

  addTeamMember: (projectId: string, data: { user_id: string; role: string }): Promise<any> => {
    return fetchApi(`/projects/${projectId}/team`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  removeTeamMember: (projectId: string, userId: string): Promise<void> => {
    return fetchApi(`/projects/${projectId}/team/${userId}`, { method: 'DELETE' });
  },

  updateRole: (projectId: string, userId: string, role: string): Promise<any> => {
    return fetchApi(`/projects/${projectId}/team/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
  },
};

// Schedule API
export const scheduleApi = {
  getGantt: (projectId: string): Promise<any> => {
    return fetchApi(`/projects/${projectId}/gantt`);
  },

  getCalendarEvents: (projectId: string, startDate: string, endDate: string): Promise<any[]> => {
    return fetchApi(`/projects/${projectId}/calendar?start=${startDate}&end=${endDate}`);
  },

  updateTaskDates: (taskId: string, data: { start_date: string; end_date: string }): Promise<any> => {
    return fetchApi(`/projects/tasks/${taskId}/dates`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  createDependency: (data: { predecessor_id: string; successor_id: string; type: string }): Promise<any> => {
    return fetchApi('/projects/dependencies', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteDependency: (id: string): Promise<void> => {
    return fetchApi(`/projects/dependencies/${id}`, { method: 'DELETE' });
  },
};
