/**
 * RFIs Module - Type Definitions
 * Phase 3.13 - Split from rfiService
 * 
 * Comprehensive type definitions for Request for Information management
 * inspired by Procore's RFI module with Ghana-specific enhancements.
 */

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

/**
 * RFI status lifecycle
 */
export type RfiStatus = 
  | 'draft' 
  | 'open' 
  | 'pending_response' 
  | 'answered' 
  | 'closed' 
  | 'void';

/**
 * RFI priority levels
 */
export type RfiPriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * RFI categorization
 */
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

/**
 * Valid status transitions
 */
export const RFI_STATUS_TRANSITIONS: Record<RfiStatus, RfiStatus[]> = {
  draft: ['open', 'void'],
  open: ['pending_response', 'answered', 'closed', 'void'],
  pending_response: ['answered', 'open', 'void'],
  answered: ['closed', 'open', 'void'], // Can reopen if answer insufficient
  closed: ['open'], // Can reopen
  void: [] // Terminal state
};

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Reference to a drawing
 */
export interface DrawingReference {
  number: string;
  title: string;
  sheet?: string;
  revision?: string;
}

/**
 * Reference to a specification
 */
export interface SpecReference {
  section: string;
  title: string;
  paragraph?: string;
}

/**
 * File attachment
 */
export interface Attachment {
  id: string;
  filename: string;
  url: string;
  type: string;
  size: number;
  uploadedAt: string;
  uploadedBy?: string;
}

/**
 * Core RFI entity
 */
export interface Rfi {
  id: string;
  organizationId: string;
  projectId: string;
  rfiNumber: string;
  revisionNumber: number;
  subject: string;
  question: string;
  category: RfiCategory;
  response?: string;
  responseAttachments: Attachment[];
  status: RfiStatus;
  priority: RfiPriority;
  dueDate?: Date;
  respondedAt?: Date;
  closedAt?: Date;
  submittedBy?: string;
  assignedTo?: string;
  answeredBy?: string;
  phaseId?: string;
  drawingReferences: DrawingReference[];
  specReferences: SpecReference[];
  locationReference?: string;
  costImpact?: number;
  costImpactCurrency: string;
  scheduleImpactDays?: number;
  attachments: Attachment[];
  relatedRfis: string[];
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

/**
 * RFI with additional details for display
 */
export interface RfiWithDetails extends Rfi {
  projectName?: string;
  projectNumber?: string;
  submittedByName?: string;
  assignedToName?: string;
  answeredByName?: string;
  phaseName?: string;
  isOverdue?: boolean;
  daysOverdue?: number;
  commentCount?: number;
}

/**
 * RFI comment
 */
export interface RfiComment {
  id: string;
  rfiId: string;
  comment: string;
  attachments: Attachment[];
  isInternal: boolean;
  createdBy?: string;
  createdByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * RFI history entry for audit trail
 */
export interface RfiHistoryEntry {
  id: string;
  rfiId: string;
  action: string;
  previousStatus?: RfiStatus;
  newStatus?: RfiStatus;
  fieldChanges?: Record<string, { old: unknown; new: unknown }>;
  comment?: string;
  performedBy?: string;
  performedByName?: string;
  performedAt: Date;
}

/**
 * RFI watcher
 */
export interface RfiWatcher {
  id: string;
  rfiId: string;
  userId: string;
  userName?: string;
  addedAt: Date;
}

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Input for creating an RFI
 */
export interface CreateRfiInput {
  organizationId: string;
  projectId: string;
  subject: string;
  question: string;
  category?: RfiCategory;
  priority?: RfiPriority;
  dueDate?: Date;
  assignedTo?: string;
  phaseId?: string;
  drawingReferences?: DrawingReference[];
  specReferences?: SpecReference[];
  locationReference?: string;
  costImpact?: number;
  costImpactCurrency?: string;
  scheduleImpactDays?: number;
  attachments?: Attachment[];
  relatedRfis?: string[];
  submitImmediately?: boolean;
  createdBy?: string;
}

/**
 * Input for updating an RFI
 */
export interface UpdateRfiInput {
  subject?: string;
  question?: string;
  category?: RfiCategory;
  priority?: RfiPriority;
  dueDate?: Date;
  assignedTo?: string;
  phaseId?: string;
  drawingReferences?: DrawingReference[];
  specReferences?: SpecReference[];
  locationReference?: string;
  costImpact?: number;
  costImpactCurrency?: string;
  scheduleImpactDays?: number;
  attachments?: Attachment[];
  relatedRfis?: string[];
  updatedBy?: string;
}

/**
 * Input for responding to an RFI
 */
export interface RespondToRfiInput {
  response: string;
  responseAttachments?: Attachment[];
  costImpact?: number;
  scheduleImpactDays?: number;
  answeredBy: string;
}

/**
 * Input for adding a comment
 */
export interface AddCommentInput {
  comment: string;
  isInternal?: boolean;
  attachments?: Attachment[];
  createdBy: string;
}

// ============================================================================
// FILTER & STATS TYPES
// ============================================================================

/**
 * Filters for querying RFIs
 */
export interface RfiFilters {
  organizationId?: string;
  projectId?: string;
  status?: RfiStatus | RfiStatus[];
  priority?: RfiPriority | RfiPriority[];
  category?: RfiCategory | RfiCategory[];
  assignedTo?: string;
  submittedBy?: string;
  phaseId?: string;
  isOverdue?: boolean;
  dueDateFrom?: Date;
  dueDateTo?: Date;
  createdFrom?: Date;
  createdTo?: Date;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated RFI result
 */
export interface PaginatedRfis {
  data: RfiWithDetails[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * RFI statistics
 */
export interface RfiStats {
  total: number;
  byStatus: Record<RfiStatus, number>;
  byPriority: Record<RfiPriority, number>;
  byCategory: Record<string, number>;
  overdue: number;
  avgResponseDays: number;
  pendingResponse: number;
  closedThisWeek: number;
}

// ============================================================================
// ROW MAPPERS
// ============================================================================

/**
 * Parse JSON field safely
 */
function parseJsonField<T>(value: unknown): T {
  if (!value) return [] as unknown as T;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return [] as unknown as T;
    }
  }
  return value as T;
}

/**
 * Map attachment from DB format to camelCase
 */
function mapAttachment(a: Record<string, unknown>): Attachment {
  return {
    id: a.id as string,
    filename: a.filename as string,
    url: a.url as string,
    type: a.type as string,
    size: a.size as number,
    uploadedAt: (a.uploaded_at || a.uploadedAt) as string,
    uploadedBy: (a.uploaded_by || a.uploadedBy) as string | undefined
  };
}

/**
 * Map attachments array
 */
function mapAttachments(attachments: unknown): Attachment[] {
  const parsed = parseJsonField<Array<Record<string, unknown>>>(attachments);
  return parsed.map(mapAttachment);
}

/**
 * Map drawing reference
 */
function mapDrawingRef(d: Record<string, unknown>): DrawingReference {
  return {
    number: d.number as string,
    title: d.title as string,
    sheet: d.sheet as string | undefined,
    revision: d.revision as string | undefined
  };
}

/**
 * Map spec reference
 */
function mapSpecRef(s: Record<string, unknown>): SpecReference {
  return {
    section: s.section as string,
    title: s.title as string,
    paragraph: s.paragraph as string | undefined
  };
}

/**
 * Maps database row to Rfi entity
 */
export function mapRowToRfi(row: Record<string, unknown>): Rfi {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    projectId: row.project_id as string,
    rfiNumber: row.rfi_number as string,
    revisionNumber: (row.revision_number as number) || 1,
    subject: row.subject as string,
    question: row.question as string,
    category: row.category as RfiCategory,
    response: row.response as string | undefined,
    responseAttachments: mapAttachments(row.response_attachments),
    status: row.status as RfiStatus,
    priority: row.priority as RfiPriority,
    dueDate: row.due_date as Date | undefined,
    respondedAt: row.responded_at as Date | undefined,
    closedAt: row.closed_at as Date | undefined,
    submittedBy: row.submitted_by as string | undefined,
    assignedTo: row.assigned_to as string | undefined,
    answeredBy: row.answered_by as string | undefined,
    phaseId: row.phase_id as string | undefined,
    drawingReferences: parseJsonField<Array<Record<string, unknown>>>(row.drawing_references).map(mapDrawingRef),
    specReferences: parseJsonField<Array<Record<string, unknown>>>(row.spec_references).map(mapSpecRef),
    locationReference: row.location_reference as string | undefined,
    costImpact: row.cost_impact ? parseFloat(row.cost_impact as string) : undefined,
    costImpactCurrency: (row.cost_impact_currency as string) || 'GHS',
    scheduleImpactDays: row.schedule_impact_days as number | undefined,
    attachments: mapAttachments(row.attachments),
    relatedRfis: (row.related_rfis as string[]) || [],
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
    createdBy: row.created_by as string | undefined,
    updatedBy: row.updated_by as string | undefined
  };
}

/**
 * Maps database row to RfiWithDetails entity
 */
export function mapRowToRfiWithDetails(row: Record<string, unknown>): RfiWithDetails {
  return {
    ...mapRowToRfi(row),
    projectName: row.project_name as string | undefined,
    projectNumber: row.project_number as string | undefined,
    submittedByName: row.submitted_by_name as string | undefined,
    assignedToName: row.assigned_to_name as string | undefined,
    answeredByName: row.answered_by_name as string | undefined,
    phaseName: row.phase_name as string | undefined,
    isOverdue: row.is_overdue as boolean | undefined,
    daysOverdue: row.days_overdue ? parseInt(row.days_overdue as string, 10) : 0,
    commentCount: row.comment_count ? parseInt(row.comment_count as string, 10) : 0
  };
}

/**
 * Maps database row to RfiComment entity
 */
export function mapRowToComment(row: Record<string, unknown>): RfiComment {
  return {
    id: row.id as string,
    rfiId: row.rfi_id as string,
    comment: row.comment as string,
    attachments: mapAttachments(row.attachments),
    isInternal: row.is_internal as boolean,
    createdBy: row.created_by as string | undefined,
    createdByName: row.created_by_name as string | undefined,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date
  };
}

/**
 * Maps database row to RfiHistoryEntry entity
 */
export function mapRowToHistory(row: Record<string, unknown>): RfiHistoryEntry {
  return {
    id: row.id as string,
    rfiId: row.rfi_id as string,
    action: row.action as string,
    previousStatus: row.previous_status as RfiStatus | undefined,
    newStatus: row.new_status as RfiStatus | undefined,
    fieldChanges: parseJsonField<Record<string, { old: unknown; new: unknown }>>(row.field_changes),
    comment: row.comment as string | undefined,
    performedBy: row.performed_by as string | undefined,
    performedByName: row.performed_by_name as string | undefined,
    performedAt: row.performed_at as Date
  };
}

/**
 * Serialize attachments for database
 */
export function serializeAttachments(attachments: Attachment[]): string {
  return JSON.stringify(attachments.map(a => ({
    id: a.id,
    filename: a.filename,
    url: a.url,
    type: a.type,
    size: a.size,
    uploaded_at: a.uploadedAt,
    uploaded_by: a.uploadedBy
  })));
}

/**
 * Serialize drawing references for database
 */
export function serializeDrawingRefs(refs: DrawingReference[]): string {
  return JSON.stringify(refs);
}

/**
 * Serialize spec references for database
 */
export function serializeSpecRefs(refs: SpecReference[]): string {
  return JSON.stringify(refs);
}
