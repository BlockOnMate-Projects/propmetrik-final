/**
 * Projects Module - Type Definitions
 * 
 * Phase 3.11: Split projectService (1052 lines → 4 focused services)
 * 
 * @module services/project-management/projects/types
 */

// =============================================================================
// ENUMS & STATUS
// =============================================================================

export type ProjectType = 
  | 'residential_single'
  | 'residential_multi'
  | 'mixed_use'
  | 'commercial'
  | 'industrial'
  | 'land_development'
  | 'renovation';

export type ProjectStatus = 
  | 'planning'
  | 'pre_construction'
  | 'under_construction'
  | 'finishing'
  | 'pre_handover'
  | 'handover'
  | 'completed'
  | 'on_hold'
  | 'cancelled';

// Status transition rules
export const STATUS_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  planning: ['pre_construction', 'on_hold', 'cancelled'],
  pre_construction: ['under_construction', 'planning', 'on_hold', 'cancelled'],
  under_construction: ['finishing', 'pre_construction', 'on_hold', 'cancelled'],
  finishing: ['pre_handover', 'under_construction', 'on_hold'],
  pre_handover: ['handover', 'finishing', 'on_hold'],
  handover: ['completed', 'pre_handover'],
  completed: [],
  on_hold: ['planning', 'pre_construction', 'under_construction', 'finishing', 'pre_handover', 'cancelled'],
  cancelled: [],
};

// =============================================================================
// PROJECT INTERFACES
// =============================================================================

export interface DevelopmentProject {
  id: string;
  organizationId: string;
  projectNumber: string;
  name: string;
  description?: string;
  projectType: ProjectType;
  status: ProjectStatus;
  
  // Location
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  country: string;
  ghanaPostGps?: string;
  latitude?: number;
  longitude?: number;
  
  // Land details
  landSizeSqm?: number;
  landSizeAcres?: number;
  landTitleNumber?: string;
  landAcquisitionDate?: string;
  landCost?: number;
  
  // Scale
  totalUnits: number;
  totalFloors?: number;
  totalBuildings: number;
  totalSqm?: number;
  
  // Financial
  totalBudget: number;
  totalSpent: number;
  totalCommitted: number;
  projectedRevenue: number;
  actualRevenue: number;
  
  // Timeline
  plannedStartDate?: string;
  actualStartDate?: string;
  plannedCompletionDate?: string;
  estimatedCompletionDate?: string;
  actualCompletionDate?: string;
  
  // Progress
  overallProgress: number;
  constructionProgress: number;
  salesProgress: number;
  
  // Permits
  buildingPermitNumber?: string;
  buildingPermitDate?: string;
  environmentalPermitNumber?: string;
  fireSafetyCertificateNumber?: string;
  
  // Developer
  developerName?: string;
  developerContact?: string;
  developerEmail?: string;
  
  // Project manager
  projectManagerId?: string;
  
  // Marketing
  marketingName?: string;
  tagline?: string;
  websiteUrl?: string;
  brochureUrl?: string;
  
  // Images
  coverImageUrl?: string;
  logoUrl?: string;
  galleryUrls: string[];
  
  // Features
  amenities: string[];
  
  // Settings
  settings: Record<string, unknown>;
  metadata: Record<string, unknown>;
  
  // CRM integration
  linkedPropertyId?: string;
  autoCreateDeals: boolean;
  defaultPipelineId?: string;
  
  // Audit
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

// =============================================================================
// INPUT INTERFACES
// =============================================================================

export interface CreateProjectInput {
  organizationId: string;
  name: string;
  description?: string;
  projectType: ProjectType;
  
  // Location
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  country?: string;
  ghanaPostGps?: string;
  latitude?: number;
  longitude?: number;
  
  // Land details
  landSizeSqm?: number;
  landTitleNumber?: string;
  landCost?: number;
  
  // Scale
  totalFloors?: number;
  totalBuildings?: number;
  
  // Financial
  totalBudget?: number;
  
  // Timeline
  plannedStartDate?: string;
  plannedCompletionDate?: string;
  
  // Developer
  developerName?: string;
  developerContact?: string;
  developerEmail?: string;
  
  // Project manager
  projectManagerId?: string;
  
  // Marketing
  marketingName?: string;
  tagline?: string;
  
  // Images
  coverImageUrl?: string;
  
  // Amenities
  amenities?: string[];
  
  // CRM integration
  autoCreateDeals?: boolean;
  defaultPipelineId?: string;
  
  // Template for phases
  phaseTemplateId?: string;
  
  // Creator
  createdBy?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  projectType?: ProjectType;
  status?: ProjectStatus;
  
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  ghanaPostGps?: string;
  latitude?: number;
  longitude?: number;
  
  landSizeSqm?: number;
  landTitleNumber?: string;
  landCost?: number;
  
  totalFloors?: number;
  totalBuildings?: number;
  
  totalBudget?: number;
  
  plannedStartDate?: string;
  actualStartDate?: string;
  plannedCompletionDate?: string;
  estimatedCompletionDate?: string;
  actualCompletionDate?: string;
  
  buildingPermitNumber?: string;
  buildingPermitDate?: string;
  environmentalPermitNumber?: string;
  fireSafetyCertificateNumber?: string;
  
  developerName?: string;
  developerContact?: string;
  developerEmail?: string;
  
  projectManagerId?: string;
  
  marketingName?: string;
  tagline?: string;
  websiteUrl?: string;
  brochureUrl?: string;
  
  coverImageUrl?: string;
  logoUrl?: string;
  galleryUrls?: string[];
  
  amenities?: string[];
  settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  
  autoCreateDeals?: boolean;
  defaultPipelineId?: string;
  
  updatedBy?: string;
}

// =============================================================================
// FILTER & QUERY INTERFACES
// =============================================================================

export interface ProjectFilters {
  organizationId: string;
  status?: ProjectStatus | ProjectStatus[];
  projectType?: ProjectType | ProjectType[];
  city?: string;
  region?: string;
  projectManagerId?: string;
  search?: string;
  minProgress?: number;
  maxProgress?: number;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export interface ProjectStats {
  totalProjects: number;
  byStatus: Record<ProjectStatus, number>;
  byType: Record<ProjectType, number>;
  totalUnits: number;
  unitsSold: number;
  unitsAvailable: number;
  totalBudget: number;
  totalSpent: number;
  totalRevenue: number;
  avgProgress: number;
}

export interface ProjectSummary {
  id: string;
  projectNumber: string;
  name: string;
  projectType: ProjectType;
  status: ProjectStatus;
  city?: string;
  region?: string;
  totalUnits: number;
  unitsAvailable: number;
  unitsReserved: number;
  unitsSold: number;
  unitsHandedOver: number;
  overallProgress: number;
  constructionProgress: number;
  salesProgress: number;
  totalBudget: number;
  totalSpent: number;
  projectedRevenue: number;
  actualRevenue: number;
  coverImageUrl?: string;
  daysToCompletion?: number;
  phasesCompleted: number;
  phasesTotal: number;
}

// =============================================================================
// PHASE TEMPLATE INTERFACES
// =============================================================================

export interface PhaseTemplate {
  id: string;
  organizationId?: string;
  name: string;
  description?: string;
  projectType: ProjectType;
  phases: Array<{
    name: string;
    description?: string;
    orderIndex: number;
    defaultDurationDays?: number;
    milestones?: Array<{
      name: string;
      description?: string;
      orderIndex: number;
    }>;
  }>;
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePhaseTemplateInput {
  organizationId: string;
  name: string;
  description?: string;
  projectType: ProjectType;
  phases: Array<{
    name: string;
    description?: string;
    orderIndex: number;
    defaultDurationDays?: number;
    milestones?: Array<{
      name: string;
      description?: string;
      orderIndex: number;
    }>;
  }>;
}

// =============================================================================
// ROW MAPPERS
// =============================================================================

export function mapRowToProject(row: any): DevelopmentProject {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectNumber: row.project_number,
    name: row.name,
    description: row.description,
    projectType: row.project_type,
    status: row.status,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    region: row.region,
    country: row.country || 'Ghana',
    ghanaPostGps: row.ghana_post_gps,
    latitude: row.latitude,
    longitude: row.longitude,
    landSizeSqm: row.land_size_sqm,
    landSizeAcres: row.land_size_acres,
    landTitleNumber: row.land_title_number,
    landAcquisitionDate: row.land_acquisition_date?.toISOString().split('T')[0],
    landCost: row.land_cost,
    totalUnits: row.total_units ?? 0,
    totalFloors: row.total_floors,
    totalBuildings: row.total_buildings ?? 1,
    totalSqm: row.total_sqm,
    totalBudget: parseFloat(row.total_budget) || 0,
    totalSpent: parseFloat(row.total_spent) || 0,
    totalCommitted: parseFloat(row.total_committed) || 0,
    projectedRevenue: parseFloat(row.projected_revenue) || 0,
    actualRevenue: parseFloat(row.actual_revenue) || 0,
    plannedStartDate: row.planned_start_date?.toISOString().split('T')[0],
    actualStartDate: row.actual_start_date?.toISOString().split('T')[0],
    plannedCompletionDate: row.planned_completion_date?.toISOString().split('T')[0],
    estimatedCompletionDate: row.estimated_completion_date?.toISOString().split('T')[0],
    actualCompletionDate: row.actual_completion_date?.toISOString().split('T')[0],
    overallProgress: row.overall_progress ?? 0,
    constructionProgress: row.construction_progress ?? 0,
    salesProgress: row.sales_progress ?? 0,
    buildingPermitNumber: row.building_permit_number,
    buildingPermitDate: row.building_permit_date?.toISOString().split('T')[0],
    environmentalPermitNumber: row.environmental_permit_number,
    fireSafetyCertificateNumber: row.fire_safety_certificate_number,
    developerName: row.developer_name,
    developerContact: row.developer_contact,
    developerEmail: row.developer_email,
    projectManagerId: row.project_manager_id,
    marketingName: row.marketing_name,
    tagline: row.tagline,
    websiteUrl: row.website_url,
    brochureUrl: row.brochure_url,
    coverImageUrl: row.cover_image_url,
    logoUrl: row.logo_url,
    galleryUrls: row.gallery_urls ?? [],
    amenities: row.amenities ?? [],
    settings: row.settings ?? {},
    metadata: row.metadata ?? {},
    linkedPropertyId: row.linked_property_id,
    autoCreateDeals: row.auto_create_deals ?? false,
    defaultPipelineId: row.default_pipeline_id,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at?.toISOString(),
    updatedAt: row.updated_at?.toISOString(),
    deletedAt: row.deleted_at?.toISOString(),
  };
}

export function mapRowToPhaseTemplate(row: any): PhaseTemplate {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    projectType: row.project_type,
    phases: row.phases ?? [],
    isSystem: row.is_system ?? false,
    isActive: row.is_active ?? true,
    createdAt: row.created_at?.toISOString(),
    updatedAt: row.updated_at?.toISOString(),
  };
}

export function mapRowToSummary(row: any): ProjectSummary {
  return {
    id: row.id,
    projectNumber: row.project_number,
    name: row.name,
    projectType: row.project_type,
    status: row.status,
    city: row.city,
    region: row.region,
    totalUnits: parseInt(row.total_units) || 0,
    unitsAvailable: parseInt(row.units_available) || 0,
    unitsReserved: parseInt(row.units_reserved) || 0,
    unitsSold: parseInt(row.units_sold) || 0,
    unitsHandedOver: parseInt(row.units_handed_over) || 0,
    overallProgress: parseFloat(row.overall_progress) || 0,
    constructionProgress: parseFloat(row.construction_progress) || 0,
    salesProgress: parseFloat(row.sales_progress) || 0,
    totalBudget: parseFloat(row.total_budget) || 0,
    totalSpent: parseFloat(row.total_spent) || 0,
    projectedRevenue: parseFloat(row.projected_revenue) || 0,
    actualRevenue: parseFloat(row.actual_revenue) || 0,
    coverImageUrl: row.cover_image_url,
    daysToCompletion: row.days_to_completion,
    phasesCompleted: parseInt(row.phases_completed) || 0,
    phasesTotal: parseInt(row.phases_total) || 0,
  };
}
