/**
 * Shared Types for Project Management Services
 * 
 * Phase 0.3: Foundation & Standards
 * 
 * This module provides all shared types, enums, and interfaces
 * used across project management services. Types are organized by domain.
 * 
 * @module services/project-management/types
 */

// =============================================================================
// BASE TYPES
// =============================================================================

/**
 * UUID type alias for better type safety
 */
export type UUID = string;

/**
 * Timestamp type alias
 */
export type Timestamp = Date | string;

/**
 * Money type for financial values (stored as cents/pesewas in database)
 */
export type Money = number;

/**
 * Percentage type (0-100)
 */
export type Percentage = number;

/**
 * Base entity fields present in all database records
 */
export interface BaseEntity {
  id: UUID;
  created_at: Timestamp;
  updated_at: Timestamp;
  created_by?: UUID;
  updated_by?: UUID;
}

/**
 * Soft-deletable entity
 */
export interface SoftDeletable {
  deleted_at?: Timestamp;
  deleted_by?: UUID;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page: number;
  limit: number;
  offset?: number;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Sort parameters
 */
export interface SortParams {
  field: string;
  direction: SortDirection;
}

// =============================================================================
// PROJECT STATUS & WORKFLOW
// =============================================================================

/**
 * Project lifecycle status
 */
export enum ProjectStatus {
  DRAFT = 'draft',
  PLANNING = 'planning',
  ACTIVE = 'active',
  ON_HOLD = 'on_hold',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  ARCHIVED = 'archived'
}

/**
 * Phase status within a project
 */
export enum PhaseStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  ON_HOLD = 'on_hold',
  COMPLETED = 'completed',
  SKIPPED = 'skipped'
}

/**
 * Milestone status
 */
export enum MilestoneStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  COMPLETED = 'completed'
}

/**
 * Task status
 */
export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  IN_REVIEW = 'in_review',
  BLOCKED = 'blocked',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

/**
 * Unit/property status
 */
export enum UnitStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  UNDER_INSPECTION = 'under_inspection',
  COMPLETED = 'completed',
  SOLD = 'sold',
  OCCUPIED = 'occupied',
  RESERVED = 'reserved'
}

/**
 * Approval status for governance workflow
 */
export enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn'
}

// =============================================================================
// PROJECT TYPES
// =============================================================================

/**
 * Project type classification
 */
export enum ProjectType {
  RESIDENTIAL = 'residential',
  COMMERCIAL = 'commercial',
  MIXED_USE = 'mixed_use',
  INDUSTRIAL = 'industrial',
  INFRASTRUCTURE = 'infrastructure',
  RENOVATION = 'renovation'
}

/**
 * Project priority levels
 */
export enum ProjectPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// =============================================================================
// FINANCIAL TYPES
// =============================================================================

/**
 * Cost category for budget tracking
 */
export enum CostCategory {
  LAND = 'land',
  PERMITS = 'permits',
  PROFESSIONAL_FEES = 'professional_fees',
  SITE_PREPARATION = 'site_preparation',
  FOUNDATION = 'foundation',
  STRUCTURE = 'structure',
  MEP = 'mep', // Mechanical, Electrical, Plumbing
  FINISHES = 'finishes',
  LANDSCAPING = 'landscaping',
  CONTINGENCY = 'contingency',
  OVERHEAD = 'overhead',
  PROFIT = 'profit',
  OTHER = 'other'
}

/**
 * Payment status
 */
export enum PaymentStatus {
  PENDING = 'pending',
  SCHEDULED = 'scheduled',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled'
}

/**
 * Payment method (Ghana-specific included)
 */
export enum PaymentMethod {
  BANK_TRANSFER = 'bank_transfer',
  CHEQUE = 'cheque',
  CASH = 'cash',
  MTN_MOMO = 'mtn_momo',
  VODAFONE_CASH = 'vodafone_cash',
  AIRTELTIGO_MONEY = 'airteltigo_money',
  CREDIT_CARD = 'credit_card',
  OTHER = 'other'
}

/**
 * Invoice status
 */
export enum InvoiceStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  VIEWED = 'viewed',
  PARTIALLY_PAID = 'partially_paid',
  PAID = 'paid',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled'
}

/**
 * Draw request status
 */
export enum DrawStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  DISBURSED = 'disbursed'
}

// =============================================================================
// CONTRACTOR & PROCUREMENT
// =============================================================================

/**
 * Contractor type
 */
export enum ContractorType {
  GENERAL = 'general',
  SUBCONTRACTOR = 'subcontractor',
  SPECIALIST = 'specialist',
  SUPPLIER = 'supplier'
}

/**
 * Contractor status
 */
export enum ContractorStatus {
  PENDING_VERIFICATION = 'pending_verification',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BLACKLISTED = 'blacklisted',
  SUSPENDED = 'suspended'
}

/**
 * Contract type
 */
export enum ContractType {
  FIXED_PRICE = 'fixed_price',
  COST_PLUS = 'cost_plus',
  TIME_AND_MATERIALS = 'time_and_materials',
  UNIT_RATE = 'unit_rate',
  MILESTONE_BASED = 'milestone_based'
}

/**
 * Procurement status
 */
export enum ProcurementStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  BIDDING = 'bidding',
  EVALUATION = 'evaluation',
  AWARDED = 'awarded',
  CANCELLED = 'cancelled'
}

// =============================================================================
// DOCUMENTATION TYPES
// =============================================================================

/**
 * RFI (Request for Information) status
 */
export enum RFIStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  ANSWERED = 'answered',
  CLOSED = 'closed'
}

/**
 * Submittal status
 */
export enum SubmittalStatus {
  PENDING = 'pending',
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  APPROVED_AS_NOTED = 'approved_as_noted',
  REVISE_RESUBMIT = 'revise_resubmit',
  REJECTED = 'rejected'
}

/**
 * Change order status
 */
export enum ChangeOrderStatus {
  DRAFT = 'draft',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXECUTED = 'executed'
}

/**
 * Change order type
 */
export enum ChangeOrderType {
  ADDITION = 'addition',
  DELETION = 'deletion',
  MODIFICATION = 'modification',
  TIME_EXTENSION = 'time_extension'
}

// =============================================================================
// QUALITY & COMPLIANCE
// =============================================================================

/**
 * Punch list priority
 */
export enum PunchListPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Punch list status
 */
export enum PunchListStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  READY_FOR_INSPECTION = 'ready_for_inspection',
  PASSED = 'passed',
  FAILED = 'failed',
  CLOSED = 'closed'
}

/**
 * Inspection type
 */
export enum InspectionType {
  ROUTINE = 'routine',
  MILESTONE = 'milestone',
  QUALITY = 'quality',
  SAFETY = 'safety',
  FINAL = 'final',
  REGULATORY = 'regulatory'
}

/**
 * Inspection result
 */
export enum InspectionResult {
  PASSED = 'passed',
  PASSED_WITH_COMMENTS = 'passed_with_comments',
  FAILED = 'failed',
  PENDING = 'pending'
}

/**
 * Compliance check type (Ghana-specific)
 */
export enum ComplianceType {
  GRA_TAX = 'gra_tax',
  SSNIT = 'ssnit',
  BUILDING_PERMIT = 'building_permit',
  ENVIRONMENTAL = 'environmental',
  SAFETY = 'safety',
  FIRE_SAFETY = 'fire_safety',
  OTHER = 'other'
}

/**
 * Compliance status
 */
export type ComplianceStatus = string;

/**
 * Cost status
 */
export type CostStatus = string;

// =============================================================================
// DAILY OPERATIONS (MERGED)
// =============================================================================

/**
 * Weather condition for daily logs
 */
export enum WeatherCondition {
  SUNNY = 'sunny',
  PARTLY_CLOUDY = 'partly_cloudy',
  CLOUDY = 'cloudy',
  RAINY = 'rainy',
  HEAVY_RAIN = 'heavy_rain',
  STORMY = 'stormy',
  HOT = 'hot'
}

/**
 * Incident severity
 */
export enum IncidentSeverity {
  MINOR = 'minor',
  MODERATE = 'moderate',
  MAJOR = 'major',
  CRITICAL = 'critical'
}

/**
 * Equipment status
 */
export enum EquipmentStatus {
  AVAILABLE = 'available',
  IN_USE = 'in_use',
  MAINTENANCE = 'maintenance',
  BROKEN = 'broken',
  RETIRED = 'retired'
}

// =============================================================================
// GOVERNANCE & FRAMEWORK TYPES
// =============================================================================

/**
 * User role in project governance
 */
export enum ProjectRole {
  ADMIN = 'admin',
  PROJECT_MANAGER = 'project_manager',
  CLIENT = 'client',
  TEAM_MEMBER = 'team_member',
  CONTRACTOR = 'contractor',
  VIEWER = 'viewer'
}

/**
 * Permission scope
 */
export enum PermissionScope {
  ORGANIZATION = 'organization',
  PROJECT = 'project',
  PHASE = 'phase',
  MILESTONE = 'milestone'
}

/**
 * Action types for audit logging
 */
export enum AuditAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  APPROVE = 'approve',
  REJECT = 'reject',
  LOCK = 'lock',
  UNLOCK = 'unlock',
  ASSIGN = 'assign',
  TRANSITION = 'transition'
}

// =============================================================================
// GHANA-SPECIFIC TYPES
// =============================================================================

/**
 * Ghana regions
 */
export enum GhanaRegion {
  GREATER_ACCRA = 'Greater Accra',
  ASHANTI = 'Ashanti',
  WESTERN = 'Western',
  WESTERN_NORTH = 'Western North',
  CENTRAL = 'Central',
  EASTERN = 'Eastern',
  VOLTA = 'Volta',
  OTI = 'Oti',
  BONO = 'Bono',
  BONO_EAST = 'Bono East',
  AHAFO = 'Ahafo',
  NORTHERN = 'Northern',
  SAVANNAH = 'Savannah',
  NORTH_EAST = 'North East',
  UPPER_EAST = 'Upper East',
  UPPER_WEST = 'Upper West'
}

/**
 * Mobile money provider
 */
export enum MobileMoneyProvider {
  MTN = 'MTN',
  VODAFONE = 'Vodafone',
  AIRTELTIGO = 'AirtelTigo'
}

// =============================================================================
// EVENT TYPES
// =============================================================================

/**
 * Event payload for real-time updates
 */
export interface EventPayload {
  eventType: string;
  entityType: string;
  entityId: UUID;
  projectId?: UUID;
  userId?: UUID;
  data?: Record<string, any>;
  timestamp: Timestamp;
}

/**
 * Notification type
 */
export enum NotificationType {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error'
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Make all properties of T optional recursively
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Pick only the keys of T that are not in K
 */
export type ExcludeKeys<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

/**
 * Make specific properties optional
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Create input type from entity (excludes id, timestamps)
 */
export type CreateInput<T extends BaseEntity> = ExcludeKeys<T, 'id' | 'created_at' | 'updated_at'>;

/**
 * Create update input type from entity (all fields optional except id)
 */
export type UpdateInput<T extends BaseEntity> = Partial<Omit<T, 'id'>> & Pick<T, 'id'>;

// =============================================================================
// FILTER & QUERY TYPES
// =============================================================================

/**
 * Date range filter
 */
export interface DateRange {
  from?: Date | string;
  to?: Date | string;
}

/**
 * Amount range filter
 */
export interface AmountRange {
  min?: number;
  max?: number;
}

/**
 * Generic filter operator
 */
export enum FilterOperator {
  EQUALS = 'eq',
  NOT_EQUALS = 'ne',
  GREATER_THAN = 'gt',
  GREATER_OR_EQUAL = 'gte',
  LESS_THAN = 'lt',
  LESS_OR_EQUAL = 'lte',
  CONTAINS = 'contains',
  STARTS_WITH = 'starts_with',
  ENDS_WITH = 'ends_with',
  IN = 'in',
  NOT_IN = 'not_in',
  IS_NULL = 'is_null',
  IS_NOT_NULL = 'is_not_null'
}

/**
 * Search/filter parameters for list queries
 */
export interface ListQueryParams extends PaginationParams {
  search?: string;
  sort?: SortParams | SortParams[];
  filters?: Record<string, any>;
}
