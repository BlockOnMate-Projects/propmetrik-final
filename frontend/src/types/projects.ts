/**
 * Project Management Types
 * Phase 5.8: Development Project Management
 */

// =====================================================
// ENUMS
// =====================================================

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
  | 'land_development'
  | 'renovation';

export type PhaseStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'delayed'
  | 'blocked'
  | 'cancelled';

export type UnitStatus =
  | 'available'
  | 'reserved'
  | 'under_contract'
  | 'sold'
  | 'under_construction'
  | 'completed'
  | 'handed_over'
  | 'not_for_sale';

export type UnitType =
  | 'studio'
  | 'one_bed'
  | 'two_bed'
  | 'three_bed'
  | 'four_bed'
  | 'five_plus_bed'
  | 'penthouse'
  | 'townhouse'
  | 'villa'
  | 'duplex'
  | 'triplex'
  | 'retail'
  | 'office'
  | 'warehouse'
  | 'land_plot'
  | 'other';

export type CostCategory =
  | 'land_acquisition'
  | 'site_preparation'
  | 'foundation'
  | 'structure'
  | 'exterior'
  | 'roofing'
  | 'plumbing'
  | 'electrical'
  | 'hvac'
  | 'interior_finishes'
  | 'landscaping'
  | 'permits_fees'
  | 'professional_services'
  | 'equipment'
  | 'labor'
  | 'materials'
  | 'contingency'
  | 'financing'
  | 'other';

export type CostStatus =
  | 'draft'
  | 'budgeted'
  | 'committed'
  | 'invoiced'
  | 'approved'
  | 'paid'
  | 'cancelled';

export type ContractorStatus =
  | 'pending_approval'
  | 'approved'
  | 'active'
  | 'suspended'
  | 'inactive';

export type DrawStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'partially_funded'
  | 'funded'
  | 'rejected'
  | 'cancelled';

export type WeatherCondition =
  | 'sunny'
  | 'cloudy'
  | 'overcast'
  | 'light_rain'
  | 'heavy_rain'
  | 'thunderstorm'
  | 'harmattan'
  | 'hot'
  | 'mild';

// =====================================================
// PROJECT TYPES
// =====================================================

export interface DevelopmentProject {
  id: string;
  organization_id: string;
  project_number: string;
  project_name: string;
  name?: string; // Alias for project_name (backend compatibility)
  project_type: ProjectType;
  status: ProjectStatus;
  description?: string;
  
  // Location
  address?: string;
  address_line1?: string; // Backend field name
  city?: string;
  region?: string;
  latitude?: number;
  longitude?: number;
  land_area_sqm?: number;
  land_size_sqm?: number; // Backend field name
  total_built_area_sqm?: number;
  
  // Ghana Specific
  land_tenure?: 'freehold' | 'leasehold' | 'customary';
  traditional_authority?: string;
  district_assembly?: string; // Aligning naming with backend schema potentially, or just assembly

  
  // Timeline
  planned_start_date?: string;
  planned_end_date?: string;
  planned_completion_date?: string; // Backend field name
  actual_start_date?: string;
  actual_end_date?: string;
  
  // Financial
  total_budget?: number;
  total_spent?: number;
  currency: string;
  display_currency?: string; // Currency stored from wizard
  
  // Units
  total_units?: number;
  units_available?: number;
  units_reserved?: number;
  units_sold?: number;
  
  // Progress
  overall_progress?: number;
  construction_progress?: number;
  sales_progress?: number;
  
  // Relationships
  project_manager_id?: string;
  project_manager_name?: string;
  land_property_id?: string;
  milestone_framework_id?: string;

  // Property Owner / Developer
  developer_name?: string;
  developer_contact?: string;
  developer_email?: string;
  
  // Metadata
  hero_image_url?: string;
  cover_image_url?: string; // Backend field name
  gallery_urls?: string[];
  tags?: string[];
  metadata?: Record<string, any>;
  
  // Audit
  created_at: string;
  updated_at: string;
  created_by?: string;
  deleted_at?: string;
}

export interface ProjectSummary {
  id: string;
  project_number: string;
  project_name: string;
  project_type: ProjectType;
  status: ProjectStatus;
  city?: string;
  region?: string;
  total_units?: number;
  units_sold?: number;
  overall_progress?: number;
  total_budget?: number;
  currency: string;
  hero_image_url?: string;
  project_manager_name?: string;
  planned_end_date?: string;
}

export interface ProjectStats {
  total_projects: number;
  by_status: Record<string, number>;
  by_type: Record<string, number>;
  total_budget: number;
  total_spent: number;
  total_units: number;
  units_sold: number;
  avg_progress: number;
}

// =====================================================
// PHASE TYPES
// =====================================================

export interface Milestone {
  id: string;
  name: string;
  target_date?: string;
  completed_date?: string;
  is_completed: boolean;
  description?: string;
  status?: 'not_started' | 'in_progress' | 'completed' | 'blocked' | 'overdue';
  progress?: number;
  project_id?: string;
  phase_id?: string;
}

// Alias for PM portal compatibility
export type ProjectMilestone = Milestone;

export interface ProjectPhase {
  id: string;
  project_id: string;
  organization_id: string;
  phase_name: string;
  phase_number: number;
  status: PhaseStatus;
  description?: string;
  
  // Timeline
  planned_start_date?: string;
  planned_end_date?: string;
  actual_start_date?: string;
  actual_end_date?: string;
  
  // Progress
  progress_percentage: number;
  
  // Budget
  budget_amount?: number;
  spent_amount?: number;
  
  // Dependencies
  depends_on_phase_id?: string;
  
  // Milestones
  milestones: Milestone[];
  
  // Audit
  created_at: string;
  updated_at: string;
}

export interface GanttPhase {
  id: string;
  name: string;
  phase_number: number;
  status: PhaseStatus;
  planned_start: string;
  planned_end: string;
  actual_start?: string;
  actual_end?: string;
  progress: number;
  depends_on?: string;
  milestones: {
    id: string;
    name: string;
    date: string;
    is_completed: boolean;
  }[];
}

export interface GanttData {
  project_id: string;
  project_name: string;
  project_start: string;
  project_end: string;
  phases: GanttPhase[];
}

// =====================================================
// UNIT TYPES
// =====================================================

export interface UnitUpgrade {
  id: string;
  category: string;
  item_name: string;
  description?: string;
  price: number;
  selected_at?: string;
  selected_by?: string;
}

export interface ProjectUnit {
  id: string;
  project_id: string;
  organization_id: string;
  unit_number: string;
  unit_type: UnitType;
  status: UnitStatus;
  
  // Location
  building?: string;
  floor?: number;
  
  // Dimensions
  internal_area_sqm?: number;
  external_area_sqm?: number;
  total_area_sqm?: number;
  
  // Configuration
  bedrooms?: number;
  bathrooms?: number;
  parking_spaces?: number;
  has_balcony?: boolean;
  has_garden?: boolean;
  
  // Pricing
  base_price?: number;
  premium?: number;
  discount?: number;
  final_price?: number;
  currency: string;
  
  // Sales
  reserved_by_contact_id?: string;
  reserved_by_name?: string;
  reservation_date?: string;
  reservation_expires?: string;
  reservation_deposit?: number;
  sale_price?: number;
  contract_date?: string;
  handover_date?: string;
  
  // Upgrades
  upgrades: UnitUpgrade[];
  upgrades_total?: number;
  
  // Payment tracking
  total_due?: number;
  total_paid?: number;
  balance_due?: number;
  
  // Relationships
  deal_id?: string;
  floor_plan_url?: string;
  
  // Features
  features?: string[];
  notes?: string;
  
  // Audit
  created_at: string;
  updated_at: string;
}

export interface UnitStats {
  total: number;
  by_status: Record<string, number>;
  by_type: Record<string, number>;
  total_value: number;
  sold_value: number;
  avg_price_per_sqm?: number;
}

// =====================================================
// COST TYPES
// =====================================================

export interface ProjectCost {
  id: string;
  project_id: string;
  organization_id: string;
  cost_code: string;
  description: string;
  category: CostCategory;
  status: CostStatus;
  
  // Budget
  original_budget: number;
  budget_modifications: number;
  revised_budget: number;
  
  // Actuals
  committed_costs: number;
  pending_costs: number;
  projected_costs: number;
  actual_costs: number;
  variance: number;
  
  // Invoice
  invoice_number?: string;
  invoice_date?: string;
  invoice_due_date?: string;
  invoice_document_url?: string;
  
  // Payment
  payment_date?: string;
  payment_reference?: string;
  payment_method?: string;
  approved_by?: string;
  approved_at?: string;
  
  // Relationships
  phase_id?: string;
  contractor_id?: string;
  
  // Audit
  created_at: string;
  updated_at: string;
}

export interface CategoryBudget {
  category: CostCategory;
  original_budget: number;
  revised_budget: number;
  committed: number;
  pending: number;
  projected: number;
  actual: number;
  variance: number;
  item_count: number;
}

export interface BudgetSummary {
  project_id: string;
  total_original_budget: number;
  total_revised_budget: number;
  total_committed: number;
  total_pending: number;
  total_projected: number;
  total_actual: number;
  total_variance: number;
  by_category: CategoryBudget[];
  health: 'on_budget' | 'under_budget' | 'over_budget' | 'at_risk';
}

export interface CostCode {
  code: string;
  description: string;
  category: CostCategory;
  default_budget?: number;
}

// =====================================================
// CONTRACTOR TYPES
// =====================================================

export interface ContractorDocument {
  id: string;
  document_type: string;
  document_name: string;
  document_url: string;
  expiry_date?: string;
  uploaded_at: string;
}

export interface Contractor {
  id: string;
  organization_id: string;
  company_name: string;
  trade: string;
  contact_person: string;
  email?: string;
  phone?: string;
  address?: string;
  
  // Payment
  bank_name?: string;
  bank_account_number?: string;
  bank_branch?: string;
  momo_provider?: string;
  momo_number?: string;
  
  // Licensing
  license_number?: string;
  license_expiry?: string;
  insurance_expiry?: string;
  
  // Rating
  status: ContractorStatus;
  rating?: number;
  total_projects?: number;
  total_contract_value?: number;
  
  // Documents
  documents: ContractorDocument[];
  
  // Audit
  created_at: string;
  updated_at: string;
}

export interface ContractorAssignment {
  id: string;
  project_id: string;
  contractor_id: string;
  organization_id: string;
  scope_of_work: string;
  
  // Contract
  contract_amount: number;
  retention_percentage: number;
  retention_amount: number;
  
  // Timeline
  start_date?: string;
  end_date?: string;
  actual_start_date?: string;
  actual_end_date?: string;
  
  // Progress
  progress_percentage: number;
  
  // Billing
  billed_amount: number;
  paid_amount: number;
  balance_due: number;
  
  // Status
  is_active: boolean;
  notes?: string;
  
  // Related data
  contractor?: Contractor;
  project_name?: string;
  
  // Audit
  created_at: string;
  updated_at: string;
}

export interface ContractorPerformance {
  contractor_id: string;
  company_name: string;
  trade: string;
  rating?: number;
  total_assignments: number;
  total_contract_value: number;
  total_paid: number;
  avg_progress: number;
  on_time_completion_rate?: number;
}

// =====================================================
// DRAW REQUEST TYPES
// =====================================================

export interface DrawLineItem {
  cost_id: string;
  cost_code: string;
  description: string;
  budgeted_amount: number;
  previously_drawn: number;
  current_draw_amount: number;
  remaining_amount: number;
}

export interface DrawRequest {
  id: string;
  project_id: string;
  organization_id: string;
  draw_number: string;
  status: DrawStatus;
  
  // Amounts
  total_amount: number;
  approved_amount?: number;
  funded_amount?: number;
  retention_held: number;
  net_amount: number;
  
  // Dates
  submitted_date?: string;
  approved_date?: string;
  funded_date?: string;
  
  // Approvals
  submitted_by?: string;
  approved_by?: string;
  
  // Line items
  line_items: DrawLineItem[];
  
  // Documents
  supporting_documents?: string[];
  notes?: string;
  
  // Audit
  created_at: string;
  updated_at: string;
}

export interface DrawSummary {
  project_id: string;
  total_draws: number;
  total_drawn: number;
  total_funded: number;
  pending_draws: number;
  pending_amount: number;
  retention_held: number;
  draw_history: {
    draw_number: string;
    amount: number;
    status: DrawStatus;
    date: string;
  }[];
}

// =====================================================
// DAILY LOG TYPES
// =====================================================

export interface DailyLogEntry {
  time?: string;
  activity: string;
  notes?: string;
}

export interface DailyLog {
  id: string;
  project_id: string;
  organization_id: string;
  log_date: string;
  weather: WeatherCondition;
  temperature_high?: number;
  temperature_low?: number;
  
  // Crew
  workers_on_site: number;
  subcontractors_on_site: string[];
  
  // Progress
  activities: DailyLogEntry[];
  delays?: string[];
  issues?: string[];
  
  // Safety
  safety_incidents: number;
  safety_notes?: string;
  
  // Materials
  materials_delivered?: string[];
  equipment_on_site?: string[];
  
  // Photos
  photos?: string[];
  
  // Approvals
  submitted_by?: string;
  approved_by?: string;
  approved_at?: string;
  
  notes?: string;
  
  // Audit
  created_at: string;
  updated_at: string;
}

// =====================================================
// PAYMENT PLAN TYPES (Ghana-specific)
// =====================================================

export interface BuyerPaymentRecord {
  id: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  reference_number?: string;
  receipt_url?: string;
  notes?: string;
}

export interface BuyerPaymentPlan {
  id: string;
  unit_id: string;
  organization_id: string;
  buyer_contact_id: string;
  buyer_name?: string;
  
  // Plan details
  total_amount: number;
  down_payment: number;
  financed_amount: number;
  installment_months: number;
  monthly_payment: number;
  
  // Progress
  total_paid: number;
  remaining_balance: number;
  payments_made: number;
  next_payment_date?: string;
  
  // Status
  is_active: boolean;
  is_completed: boolean;
  
  // Payment records
  payments: BuyerPaymentRecord[];
  
  // Audit
  created_at: string;
  updated_at: string;
}

// =====================================================
// PUNCH LIST TYPES
// =====================================================

export interface PunchListItem {
  id: string;
  unit_id?: string;
  project_id: string;
  organization_id: string;
  
  // Details
  title: string;
  description?: string;
  location?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  
  // Status
  is_completed: boolean;
  
  // Assignment
  assigned_to_contractor_id?: string;
  assigned_contractor_name?: string;
  
  // Timeline
  due_date?: string;
  completed_date?: string;
  
  // Evidence
  before_photos?: string[];
  after_photos?: string[];
  
  notes?: string;
  
  // Audit
  created_at: string;
  updated_at: string;
}

// =====================================================
// API RESPONSE TYPES
// =====================================================

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ProjectFilters {
  status?: ProjectStatus;
  type?: ProjectType;
  city?: string;
  region?: string;
  manager?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface UnitFilters {
  status?: UnitStatus;
  type?: UnitType;
  building?: string;
  floor?: number;
  min_bedrooms?: number;
  max_bedrooms?: number;
  min_price?: number;
  max_price?: number;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CostFilters {
  category?: CostCategory;
  status?: CostStatus;
  phase_id?: string;
  contractor_id?: string;
  search?: string;
}

export interface ContractorFilters {
  status?: ContractorStatus;
  trade?: string;
  search?: string;
}
