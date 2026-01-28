/**
 * Team Module Types
 * 
 * Phase 3.4: Split teamService
 * 
 * Shared types for team management:
 * - Team members with Ghana-specific roles
 * - Vendors with ratings
 * - Communication logging
 * 
 * @module services/project-management/team/types
 */

// =============================================================================
// ROLE TYPES
// =============================================================================

/**
 * Ghana-specific team roles covering:
 * - Internal roles (project management)
 * - Design & Engineering
 * - Construction
 * - Specialist Contractors
 * - Government & Regulatory
 * - Stakeholders
 * - Operations
 */
export type GhanaTeamRole =
  // Internal roles
  | 'project_owner'
  | 'project_manager'
  | 'assistant_project_manager'
  | 'site_manager'
  // Design & Engineering
  | 'architect'
  | 'structural_engineer'
  | 'quantity_surveyor'
  | 'mechanical_engineer'
  | 'electrical_engineer'
  | 'civil_engineer'
  | 'geotechnical_engineer'
  | 'interior_designer'
  // Construction
  | 'main_contractor'
  | 'site_supervisor'
  | 'foreman'
  | 'safety_officer'
  // Specialist Contractors
  | 'electrical_contractor'
  | 'plumbing_contractor'
  | 'masonry_contractor'
  | 'steel_contractor'
  | 'roofing_contractor'
  | 'painting_contractor'
  | 'tiling_contractor'
  | 'landscaping_contractor'
  | 'hvac_contractor'
  // Government & Regulatory
  | 'lands_commission_officer'
  | 'assembly_officer'
  | 'fire_service_inspector'
  | 'epa_officer'
  | 'town_planning_officer'
  // Stakeholders
  | 'traditional_chief'
  | 'community_liaison'
  | 'investor'
  | 'financier'
  // Operations
  | 'accountant'
  | 'procurement_officer'
  | 'mobile_money_agent'
  | 'security_coordinator'
  | 'logistics_coordinator'
  // Other
  | 'consultant'
  | 'legal_advisor'
  | 'surveyor'
  | 'other';

export type RoleCategory =
  | 'internal'
  | 'contractor'
  | 'consultant'
  | 'government'
  | 'stakeholder'
  | 'vendor'
  | 'other';

// =============================================================================
// VENDOR TYPES
// =============================================================================

export type VendorCategory =
  | 'general_contractor'
  | 'specialist_contractor'
  | 'material_supplier'
  | 'equipment_rental'
  | 'consultant'
  | 'service_provider'
  | 'transport'
  | 'security'
  | 'cleaning'
  | 'catering'
  | 'other';

export type VendorStatus = 'pending' | 'approved' | 'suspended' | 'blacklisted';

// =============================================================================
// COMMUNICATION TYPES
// =============================================================================

export type CommunicationType =
  | 'phone_call'
  | 'whatsapp'
  | 'email'
  | 'sms'
  | 'in_person'
  | 'site_visit'
  | 'virtual_meeting'
  | 'letter'
  | 'other';

// =============================================================================
// TEAM MEMBER INTERFACES
// =============================================================================

export interface TeamMemberPermissions {
  canView: boolean;
  canEdit: boolean;
  canApproveCosts: boolean;
  canUploadDocuments: boolean;
  canAddTasks: boolean;
  canManageTeam: boolean;
  canViewFinancials: boolean;
  canReceiveNotifications: boolean;
}

export interface ProjectTeamMember {
  id: string;
  projectId: string;
  organizationId: string;
  userId: string | null;
  vendorId: string | null;
  
  fullName: string;
  email: string | null;
  phone: string | null;
  phoneAlt: string | null;
  whatsapp: string | null;
  
  role: string;
  roleType: GhanaTeamRole;
  roleCategory: RoleCategory;
  title: string | null;
  department: string | null;
  company: string | null;
  
  responsibilities: string | null;
  assignmentType: string;
  
  permissions: TeamMemberPermissions;
  
  startDate: Date | null;
  endDate: Date | null;
  lastActiveDate: Date | null;
  
  isActive: boolean;
  status: string;
  
  hourlyRate: number | null;
  dailyRate: number | null;
  monthlyRate: number | null;
  rateCurrency: string;
  
  avatarUrl: string | null;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamMemberFilters {
  projectId?: string;
  organizationId?: string;
  userId?: string;
  role?: string;
  roleCategory?: RoleCategory;
  isActive?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface AddTeamMemberInput {
  projectId: string;
  organizationId: string;
  userId?: string;
  vendorId?: string;
  
  fullName: string;
  email?: string;
  phone?: string;
  phoneAlt?: string;
  whatsapp?: string;
  
  role: string;
  roleType?: GhanaTeamRole;
  roleCategory?: RoleCategory;
  title?: string;
  department?: string;
  company?: string;
  
  responsibilities?: string;
  assignmentType?: string;
  
  canView?: boolean;
  canEdit?: boolean;
  canApproveCosts?: boolean;
  canUploadDocuments?: boolean;
  canAddTasks?: boolean;
  canManageTeam?: boolean;
  canViewFinancials?: boolean;
  canReceiveNotifications?: boolean;
  
  startDate?: Date;
  endDate?: Date;
  
  hourlyRate?: number;
  dailyRate?: number;
  monthlyRate?: number;
  rateCurrency?: string;
  
  avatarUrl?: string;
}

export interface UpdateTeamMemberInput {
  role?: string;
  roleType?: GhanaTeamRole;
  roleCategory?: RoleCategory;
  title?: string;
  responsibilities?: string;
  permissions?: Partial<TeamMemberPermissions>;
  startDate?: Date;
  endDate?: Date;
  isActive?: boolean;
}

// =============================================================================
// VENDOR INTERFACES
// =============================================================================

export interface Vendor {
  id: string;
  organizationId: string;
  category: VendorCategory;
  companyName: string;
  tradingName: string | null;
  contactPerson: string;
  email: string;
  phone: string;
  phoneAlt: string | null;
  whatsapp: string | null;
  
  address: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  
  tinNumber: string | null;
  businessRegistration: string | null;
  ssnitNumber: string | null;
  
  bankName: string | null;
  bankBranch: string | null;
  accountNumber: string | null;
  accountName: string | null;
  mobileMoneyProvider: string | null;
  mobileMoneyNumber: string | null;
  
  services: string[];
  specializations: string[];
  
  rating: number | null;
  totalRatings: number;
  completedProjects: number;
  
  status: VendorStatus;
  isApproved: boolean;
  approvedBy: string | null;
  approvedAt: Date | null;
  isPreferred: boolean;
  
  insuranceCertificate: string | null;
  insuranceExpiry: Date | null;
  
  notes: string | null;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateVendorInput {
  organizationId: string;
  category: VendorCategory;
  companyName: string;
  tradingName?: string;
  contactPerson: string;
  email: string;
  phone: string;
  phoneAlt?: string;
  whatsapp?: string;
  
  address?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  
  tinNumber?: string;
  businessRegistration?: string;
  ssnitNumber?: string;
  
  bankName?: string;
  bankBranch?: string;
  accountNumber?: string;
  accountName?: string;
  mobileMoneyProvider?: string;
  mobileMoneyNumber?: string;
  
  services?: string[];
  specializations?: string[];
  
  insuranceCertificate?: string;
  insuranceExpiry?: Date;
  
  notes?: string;
}

export interface VendorFilters {
  organizationId?: string;
  category?: VendorCategory;
  status?: VendorStatus;
  isApproved?: boolean;
  isPreferred?: boolean;
  minRating?: number;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface VendorRating {
  vendorId: string;
  projectId: string;
  ratedBy: string;
  quality: number;
  timeliness: number;
  communication: number;
  value: number;
  overallRating: number;
  feedback?: string;
  wouldRecommend: boolean;
}

// =============================================================================
// COMMUNICATION INTERFACES
// =============================================================================

export interface CommunicationLog {
  id: string;
  organizationId: string;
  projectId: string | null;
  teamMemberId: string | null;
  vendorId: string | null;
  
  type: CommunicationType;
  direction: 'inbound' | 'outbound';
  
  subject: string | null;
  content: string;
  summary: string | null;
  
  initiatedBy: string;
  initiatedByName: string | null;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  
  duration: number | null;
  
  requiresFollowUp: boolean;
  followUpDate: Date | null;
  followUpAssignedTo: string | null;
  followUpCompleted: boolean;
  
  attachments: string[];
  
  createdAt: Date;
}

export interface LogCommunicationInput {
  organizationId: string;
  projectId?: string;
  teamMemberId?: string;
  vendorId?: string;
  
  type: CommunicationType;
  direction: 'inbound' | 'outbound';
  
  subject?: string;
  content: string;
  summary?: string;
  
  initiatedBy: string;
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  
  duration?: number;
  
  requiresFollowUp?: boolean;
  followUpDate?: Date;
  followUpAssignedTo?: string;
  
  attachments?: string[];
}
