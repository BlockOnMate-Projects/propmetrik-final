/**
 * Team API Client
 * Phase 4 Sprint 8 - Team & Integration
 */

import { fetchApi } from './api';

const TEAM_BASE = '/team';
const VENDORS_BASE = '/vendors';

// =====================================================
// TYPES
// =====================================================

// Ghana-specific team roles
export type GhanaTeamRole = 
  // Construction roles
  | 'site_manager'
  | 'project_engineer'
  | 'quantity_surveyor'
  | 'site_supervisor'
  | 'foreman'
  | 'mason'
  | 'carpenter'
  | 'electrician'
  | 'plumber'
  | 'welder'
  | 'tiler'
  | 'painter'
  | 'steel_fixer'
  | 'crane_operator'
  | 'equipment_operator'
  | 'general_laborer'
  | 'security_guard'
  | 'store_keeper'
  | 'driver'
  | 'cleaner'
  // Professional roles
  | 'architect'
  | 'structural_engineer'
  | 'mep_engineer'
  | 'civil_engineer'
  | 'geotechnical_engineer'
  | 'environmental_consultant'
  | 'land_surveyor'
  | 'interior_designer'
  | 'landscape_architect'
  | 'cost_consultant'
  | 'project_manager'
  | 'construction_manager'
  | 'health_safety_officer'
  | 'quality_control_inspector'
  // Government roles
  | 'epa_officer'
  | 'town_planning_officer'
  | 'building_inspector'
  | 'fire_service_officer'
  | 'lands_commission_officer'
  | 'utility_officer'
  | 'assembly_member'
  // Stakeholder roles
  | 'client_representative'
  | 'investor'
  | 'bank_representative'
  | 'insurance_agent'
  | 'legal_counsel'
  | 'chief'
  | 'community_liaison'
  | 'landlord'
  // Internal roles
  | 'admin'
  | 'accountant'
  | 'procurement_officer'
  | 'hr_officer'
  | 'it_support'
  | 'other';

export type RoleCategory = 'construction' | 'professional' | 'government' | 'stakeholder' | 'internal' | 'contractor' | 'consultant' | 'vendor' | 'other';

export interface RoleInfo {
  role: GhanaTeamRole;
  category: RoleCategory;
  displayName: string;
  description: string;
}

export interface TeamMemberPermissions {
  canViewBudget: boolean;
  canEditBudget: boolean;
  canApproveExpenses: boolean;
  canManageTeam: boolean;
  canViewDocuments: boolean;
  canUploadDocuments: boolean;
  canCreateTasks: boolean;
  canAssignTasks: boolean;
}

export interface TeamMember {
  id: string;
  projectId: string;
  organizationId: string;
  userId: string;
  role: GhanaTeamRole;
  roleCategory: RoleCategory;
  roleType?: string;
  title?: string;
  department?: string;
  permissions: TeamMemberPermissions;
  hourlyRate?: number;
  rateCurrency: string;
  startDate?: Date;
  endDate?: Date;
  isActive: boolean;
  contactPhone?: string;
  contactEmail?: string;
  notes?: string;
  addedBy: string;
  createdAt: Date;
  updatedAt: Date;
  // Backend uses these fields
  fullName?: string;
  email?: string;
  phone?: string;
  // Also support legacy/joined field names
  userName?: string;
  userEmail?: string;
  userAvatar?: string;
}

export interface MemberAvailability {
  id: string;
  teamMemberId: string;
  date: Date;
  startTime?: string;
  endTime?: string;
  isAvailable: boolean;
  notes?: string;
}

export type CommunicationType = 
  | 'phone_call'
  | 'phone'
  | 'email'
  | 'meeting'
  | 'site_visit'
  | 'video_call'
  | 'whatsapp'
  | 'sms'
  | 'letter'
  | 'other';

export interface CommunicationLog {
  id: string;
  projectId: string;
  organizationId: string;
  teamMemberId?: string;
  vendorId?: string;
  communicationType: CommunicationType;
  subject: string;
  summary: string;
  content?: string;
  outcome?: string;
  isIncoming?: boolean;
  followUpRequired: boolean;
  followUpDate?: Date;
  followUpCompleted: boolean;
  followUpNotes?: string;
  attachments: Array<string | { url: string; name: string }>;
  participants: string[];
  communicationDate: Date;
  duration?: number;
  loggedBy: string;
  createdAt: Date;
  updatedAt: Date;
  // Joined fields
  contactName?: string;
  contactType?: 'team_member' | 'vendor';
}

// Vendor Types
export type VendorCategory = 
  | 'supplier'
  | 'subcontractor'
  | 'consultant'
  | 'equipment_rental'
  | 'logistics'
  | 'professional_services'
  | 'other';

export interface VendorComplianceDocument {
  type: 'business_registration' | 'tax_clearance' | 'insurance' | 'license' | 'certification' | 'other';
  documentUrl: string;
  expiryDate?: Date;
  isVerified: boolean;
}

export interface Vendor {
  id: string;
  organizationId: string;
  name: string;
  category: VendorCategory;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  region?: string;
  tinNumber?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankBranch?: string;
  mobileMoneyProvider?: string;
  mobileMoneyNumber?: string;
  averageRating: number;
  totalRatings: number;
  isApproved: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  complianceDocuments: VendorComplianceDocument[];
  specializations: string[];
  notes?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface VendorRating {
  id: string;
  vendorId: string;
  projectId: string;
  ratedBy: string;
  qualityRating: number;
  timelinessRating: number;
  communicationRating: number;
  valueRating: number;
  overallRating: number;
  comments?: string;
  createdAt: Date;
}

export interface VendorAssignment {
  id: string;
  vendorId: string;
  projectId: string;
  organizationId: string;
  assignmentType: string;
  contractAmount?: number;
  contractCurrency: string;
  startDate?: Date;
  endDate?: Date;
  status: 'active' | 'completed' | 'terminated';
  assignedBy: string;
  createdAt: Date;
  updatedAt: Date;
  // Joined fields
  vendorName?: string;
  projectName?: string;
}

// =====================================================
// TEAM MEMBERS API
// =====================================================

export interface TeamMemberFilters {
  projectId?: string;
  organizationId?: string;
  userId?: string;
  role?: GhanaTeamRole;
  isActive?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export const teamApi = {
  // Add team member
  addMember: async (data: Partial<TeamMember>): Promise<TeamMember> => {
    const response = await fetchApi<{ success: boolean; data: TeamMember }>(`${TEAM_BASE}/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.data;
  },

  // Get team members with filters
  getMembers: async (filters?: TeamMemberFilters): Promise<{ data: TeamMember[]; pagination: { total: number; limit: number; offset: number } }> => {
    const params = new URLSearchParams();
    if (filters?.projectId) params.set('projectId', filters.projectId);
    if (filters?.organizationId) params.set('organization_id', filters.organizationId); // Backend expects snake_case
    if (filters?.userId) params.set('userId', filters.userId);
    if (filters?.role) params.set('role', filters.role);
    if (filters?.isActive !== undefined) params.set('isActive', String(filters.isActive));
    if (filters?.search) params.set('search', filters.search);
    if (filters?.page) params.set('offset', String((filters.page - 1) * (filters.limit || 50)));
    if (filters?.limit) params.set('limit', String(filters.limit));
    const query = params.toString();
    const response = await fetchApi<{ success: boolean; data: TeamMember[]; pagination: { total: number; limit: number; offset: number } }>(`${TEAM_BASE}/members${query ? `?${query}` : ''}`);
    return { data: response.data || [], pagination: response.pagination };
  },

  // Get team member by ID
  getMemberById: async (id: string): Promise<TeamMember> => {
    const response = await fetchApi<{ success: boolean; data: TeamMember }>(`${TEAM_BASE}/members/${id}`);
    return response.data;
  },

  // Get project team
  getProjectTeam: async (projectId: string): Promise<TeamMember[]> => {
    const response = await fetchApi<{ success: boolean; data: TeamMember[] }>(`${TEAM_BASE}/projects/${projectId}/members`);
    return response.data || [];
  },

  // Update team member
  updateMember: async (id: string, data: Partial<TeamMember>): Promise<TeamMember> => {
    const response = await fetchApi<{ success: boolean; data: TeamMember }>(`${TEAM_BASE}/members/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response.data;
  },

  // Update permissions
  updatePermissions: async (id: string, permissions: Partial<TeamMemberPermissions>): Promise<TeamMember> => {
    const response = await fetchApi<{ success: boolean; data: TeamMember }>(`${TEAM_BASE}/members/${id}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions }),
    });
    return response.data;
  },

  // Deactivate member
  deactivate: async (id: string): Promise<TeamMember> => {
    const response = await fetchApi<{ success: boolean; data: TeamMember }>(`${TEAM_BASE}/members/${id}/deactivate`, {
      method: 'POST',
    });
    return response.data;
  },

  // Reactivate member
  reactivate: async (id: string): Promise<TeamMember> => {
    const response = await fetchApi<{ success: boolean; data: TeamMember }>(`${TEAM_BASE}/members/${id}/reactivate`, {
      method: 'POST',
    });
    return response.data;
  },

  // Remove member
  remove: (id: string): Promise<void> => {
    return fetchApi(`${TEAM_BASE}/members/${id}`, {
      method: 'DELETE',
    });
  },

  // Get user's projects
  getUserProjects: async (userId: string): Promise<Array<{ projectId: string; projectName: string; role: GhanaTeamRole }>> => {
    const response = await fetchApi<{ success: boolean; data: Array<{ projectId: string; projectName: string; role: GhanaTeamRole }> }>(`${TEAM_BASE}/users/${userId}/projects`);
    return response.data || [];
  },
};

// =====================================================
// ROLES API
// =====================================================

export const rolesApi = {
  // Get all Ghana roles
  getAll: async (): Promise<RoleInfo[]> => {
    const response = await fetchApi<{ success: boolean; data: RoleInfo[] }>(`${TEAM_BASE}/roles`);
    return response.data || [];
  },

  // Get roles by category
  getByCategory: async (category: RoleCategory): Promise<RoleInfo[]> => {
    const response = await fetchApi<{ success: boolean; data: RoleInfo[] }>(`${TEAM_BASE}/roles/${category}`);
    return response.data || [];
  },
};

// =====================================================
// AVAILABILITY API
// =====================================================

export const availabilityApi = {
  // Set availability
  set: (memberId: string, data: { date: Date; startTime?: string; endTime?: string; isAvailable: boolean; notes?: string }): Promise<MemberAvailability> => {
    return fetchApi(`${TEAM_BASE}/members/${memberId}/availability`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get member availability
  get: (memberId: string, startDate?: Date, endDate?: Date): Promise<MemberAvailability[]> => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate.toISOString());
    if (endDate) params.set('endDate', endDate.toISOString());
    const query = params.toString();
    return fetchApi(`${TEAM_BASE}/members/${memberId}/availability${query ? `?${query}` : ''}`);
  },

  // Get project team availability
  getProjectAvailability: (projectId: string, date?: Date): Promise<Array<{ member: TeamMember; availability: MemberAvailability[] }>> => {
    const params = date ? `?date=${date.toISOString()}` : '';
    return fetchApi(`${TEAM_BASE}/projects/${projectId}/availability${params}`);
  },
};

// =====================================================
// COMMUNICATIONS API
// =====================================================

export interface CommunicationFilters {
  projectId?: string;
  organizationId?: string;
  teamMemberId?: string;
  vendorId?: string;
  communicationType?: CommunicationType;
  hasFollowUp?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export const communicationApi = {
  // Log communication
  log: (data: Partial<CommunicationLog>): Promise<CommunicationLog> => {
    return fetchApi(`${TEAM_BASE}/communications`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get communications with filters
  getAll: (filters?: CommunicationFilters): Promise<{ data: CommunicationLog[]; pagination: { total: number; limit: number; offset: number } }> => {
    const params = new URLSearchParams();
    if (filters?.projectId) params.set('projectId', filters.projectId);
    if (filters?.organizationId) params.set('organizationId', filters.organizationId);
    if (filters?.teamMemberId) params.set('teamMemberId', filters.teamMemberId);
    if (filters?.vendorId) params.set('vendorId', filters.vendorId);
    if (filters?.communicationType) params.set('communicationType', filters.communicationType);
    if (filters?.hasFollowUp !== undefined) params.set('hasFollowUp', String(filters.hasFollowUp));
    if (filters?.search) params.set('search', filters.search);
    if (filters?.page) params.set('offset', String((filters.page - 1) * (filters.limit || 50)));
    if (filters?.limit) params.set('limit', String(filters.limit));
    const query = params.toString();
    return fetchApi(`${TEAM_BASE}/communications${query ? `?${query}` : ''}`);
  },

  // Get by ID
  getById: (id: string): Promise<CommunicationLog> => {
    return fetchApi(`${TEAM_BASE}/communications/${id}`);
  },

  // Get project communications
  getByProject: (projectId: string): Promise<CommunicationLog[]> => {
    return fetchApi(`${TEAM_BASE}/projects/${projectId}/communications`);
  },

  // Update communication
  update: (id: string, data: Partial<CommunicationLog>): Promise<CommunicationLog> => {
    return fetchApi(`${TEAM_BASE}/communications/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Complete follow-up
  completeFollowUp: (id: string): Promise<CommunicationLog> => {
    return fetchApi(`${TEAM_BASE}/communications/${id}/complete-followup`, {
      method: 'POST',
    });
  },

  // Get pending follow-ups
  getPendingFollowUps: (organizationId?: string): Promise<CommunicationLog[]> => {
    const params = organizationId ? `?organizationId=${organizationId}` : '';
    return fetchApi(`${TEAM_BASE}/follow-ups/pending${params}`);
  },

  // Delete communication
  delete: (id: string): Promise<void> => {
    return fetchApi(`${TEAM_BASE}/communications/${id}`, {
      method: 'DELETE',
    });
  },
};

// =====================================================
// VENDORS API
// =====================================================

export interface VendorFilters {
  organizationId?: string;
  category?: VendorCategory;
  isApproved?: boolean;
  search?: string;
  minRating?: number;
  page?: number;
  limit?: number;
}

export const vendorApi = {
  // Add vendor
  add: (data: Partial<Vendor>): Promise<Vendor> => {
    return fetchApi(`${VENDORS_BASE}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get vendors with filters
  getAll: (filters?: VendorFilters): Promise<{ data: Vendor[]; pagination: { total: number; limit: number; offset: number } }> => {
    const params = new URLSearchParams();
    if (filters?.organizationId) params.set('organizationId', filters.organizationId);
    if (filters?.category) params.set('category', filters.category);
    if (filters?.isApproved !== undefined) params.set('isApproved', String(filters.isApproved));
    if (filters?.search) params.set('search', filters.search);
    if (filters?.minRating !== undefined) params.set('minRating', String(filters.minRating));
    if (filters?.page) params.set('offset', String((filters.page - 1) * (filters.limit || 50)));
    if (filters?.limit) params.set('limit', String(filters.limit));
    const query = params.toString();
    return fetchApi(`${VENDORS_BASE}${query ? `?${query}` : ''}`);
  },

  // Get vendor by ID
  getById: (id: string): Promise<Vendor> => {
    return fetchApi(`${VENDORS_BASE}/${id}`);
  },

  // Update vendor
  update: (id: string, data: Partial<Vendor>): Promise<Vendor> => {
    return fetchApi(`${VENDORS_BASE}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Approve vendor
  approve: (id: string): Promise<Vendor> => {
    return fetchApi(`${VENDORS_BASE}/${id}/approve`, {
      method: 'POST',
    });
  },

  // Suspend vendor
  suspend: (id: string, reason?: string): Promise<Vendor> => {
    return fetchApi(`${VENDORS_BASE}/${id}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  // Delete vendor
  delete: (id: string): Promise<void> => {
    return fetchApi(`${VENDORS_BASE}/${id}`, {
      method: 'DELETE',
    });
  },

  // Get categories
  getCategories: (): Promise<Array<{ value: VendorCategory; label: string }>> => {
    return fetchApi(`${VENDORS_BASE}/categories/all`);
  },

  // Get top rated
  getTopRated: (organizationId?: string, category?: VendorCategory, limit?: number): Promise<Vendor[]> => {
    const params = new URLSearchParams();
    if (organizationId) params.set('organizationId', organizationId);
    if (category) params.set('category', category);
    if (limit) params.set('limit', String(limit));
    const query = params.toString();
    return fetchApi(`${VENDORS_BASE}/top-rated${query ? `?${query}` : ''}`);
  },
};

// =====================================================
// VENDOR RATINGS API
// =====================================================

export const vendorRatingApi = {
  // Rate vendor
  rate: (vendorId: string, data: {
    projectId: string;
    qualityRating: number;
    timelinessRating: number;
    communicationRating: number;
    valueRating: number;
    comments?: string;
  }): Promise<VendorRating> => {
    return fetchApi(`${VENDORS_BASE}/${vendorId}/ratings`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get vendor ratings
  get: (vendorId: string): Promise<VendorRating[]> => {
    return fetchApi(`${VENDORS_BASE}/${vendorId}/ratings`);
  },

  // Get rating summary
  getSummary: (vendorId: string): Promise<{
    averageRating: number;
    totalRatings: number;
    qualityAvg: number;
    timelinessAvg: number;
    communicationAvg: number;
    valueAvg: number;
  }> => {
    return fetchApi(`${VENDORS_BASE}/${vendorId}/ratings/summary`);
  },
};

// =====================================================
// VENDOR ASSIGNMENTS API
// =====================================================

export const vendorAssignmentApi = {
  // Assign vendor to project
  assign: (vendorId: string, data: {
    projectId: string;
    organizationId: string;
    assignmentType: string;
    contractAmount?: number;
    contractCurrency?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<VendorAssignment> => {
    return fetchApi(`${VENDORS_BASE}/${vendorId}/assignments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get vendor assignments
  getByVendor: (vendorId: string): Promise<VendorAssignment[]> => {
    return fetchApi(`${VENDORS_BASE}/${vendorId}/assignments`);
  },

  // Get project vendors
  getByProject: (projectId: string): Promise<Vendor[]> => {
    return fetchApi(`${VENDORS_BASE}/projects/${projectId}/vendors`);
  },

  // Update assignment
  update: (assignmentId: string, data: Partial<VendorAssignment>): Promise<VendorAssignment> => {
    return fetchApi(`${VENDORS_BASE}/assignments/${assignmentId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Complete assignment
  complete: (assignmentId: string): Promise<VendorAssignment> => {
    return fetchApi(`${VENDORS_BASE}/assignments/${assignmentId}/complete`, {
      method: 'POST',
    });
  },

  // Remove from project
  remove: (assignmentId: string): Promise<void> => {
    return fetchApi(`${VENDORS_BASE}/assignments/${assignmentId}`, {
      method: 'DELETE',
    });
  },
};

// =====================================================
// VENDOR COMPLIANCE API
// =====================================================

export const vendorComplianceApi = {
  // Update compliance documents
  update: (vendorId: string, documents: VendorComplianceDocument[]): Promise<Vendor> => {
    return fetchApi(`${VENDORS_BASE}/${vendorId}/compliance`, {
      method: 'PUT',
      body: JSON.stringify({ complianceDocuments: documents }),
    });
  },

  // Get vendors with expiring compliance
  getExpiring: (organizationId?: string, daysAhead?: number): Promise<Vendor[]> => {
    const params = new URLSearchParams();
    if (organizationId) params.set('organizationId', organizationId);
    if (daysAhead) params.set('daysAhead', String(daysAhead));
    const query = params.toString();
    return fetchApi(`${VENDORS_BASE}/compliance/expiring${query ? `?${query}` : ''}`);
  },
};
