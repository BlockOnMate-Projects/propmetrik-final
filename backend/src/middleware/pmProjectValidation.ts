/**
 * Project Management Validation Schemas
 * 
 * Zod schemas for PM module endpoints:
 * - Projects CRUD
 * - RFIs
 * - Change Orders
 * - Submittals
 * - Budget / Invoices / Expenses
 * - Photos / Albums
 * - Team / Vendors
 * - Checklists
 * - Procurement
 * - Site Diaries
 * - Governance
 */

import { z } from 'zod';
import { uuidSchema, paginationSchema } from './validation';

// ============================================================================
// PROJECTS
// ============================================================================

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(255),
  description: z.string().max(5000).optional(),
  project_type: z.enum([
    'residential', 'residential_single', 'residential_multi',
    'commercial', 'mixed_use', 'industrial',
    'infrastructure', 'renovation', 'land_development',
  ]).optional(),
  status: z.enum([
    'planning', 'pre_construction', 'active', 'on_hold',
    'completed', 'cancelled',
  ]).default('planning'),
  start_date: z.string().datetime().optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  end_date: z.string().datetime().optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  estimated_budget: z.number().nonnegative().optional(),
  currency: z.enum(['GHS', 'USD', 'EUR', 'GBP']).default('GHS'),
  city: z.string().max(100).optional(),
  region: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
  digital_address: z.string().max(20).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  manager_id: uuidSchema.optional(),
  client_name: z.string().max(255).optional(),
  client_email: z.string().email().optional(),
  client_phone: z.string().max(20).optional(),
  total_units: z.number().int().min(0).optional(),
  total_area_sqm: z.number().positive().optional(),
  land_tenure_type: z.string().max(50).optional(),
  land_title_number: z.string().max(100).optional(),
  epa_permit_number: z.string().max(100).optional(),
  building_permit_number: z.string().max(100).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),

  // Property Owner / Developer
  developer_name: z.string().max(200).nullable().optional(),
  developer_contact: z.string().max(100).nullable().optional(),
  developer_email: z.string().max(200).nullable().optional(),

  // Additional DB fields the edit form may send
  address_line1: z.string().max(500).optional(),
  address_line2: z.string().max(500).optional(),
  land_size_sqm: z.number().nonnegative().optional(),
  total_budget: z.number().nonnegative().optional(),
  total_floors: z.number().int().min(0).optional(),
  total_buildings: z.number().int().min(0).optional(),
  cover_image_url: z.string().max(1000).nullable().optional(),
  logo_url: z.string().max(1000).nullable().optional(),
  planned_start_date: z.string().optional(),
  planned_completion_date: z.string().optional(),
  project_manager_id: z.string().uuid().nullable().optional(),
}).passthrough();

export const updateProjectSchema = createProjectSchema.partial();

export const projectQuerySchema = paginationSchema.extend({
  status: z.enum([
    'planning', 'pre_construction', 'active', 'on_hold',
    'completed', 'cancelled',
  ]).optional(),
  type: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  manager: uuidSchema.optional(),
  search: z.string().max(255).optional(),
});

// ============================================================================
// PHASES & MILESTONES
// ============================================================================

export const createPhaseSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  status: z.enum(['not_started', 'in_progress', 'completed', 'on_hold']).default('not_started'),
  order_index: z.number().int().min(0).optional(),
  budget: z.number().nonnegative().optional(),
  parent_phase_id: uuidSchema.optional(),
});

export const updatePhaseSchema = createPhaseSchema.partial();

export const createMilestoneSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  due_date: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'overdue']).default('pending'),
  type: z.string().max(50).optional(),
  is_critical: z.boolean().default(false),
  completion_percentage: z.number().min(0).max(100).default(0),
  assigned_to: uuidSchema.optional(),
});

export const updateMilestoneSchema = createMilestoneSchema.partial();

// ============================================================================
// RFIs
// ============================================================================

export const createRfiSchema = z.object({
  project_id: uuidSchema,
  subject: z.string().min(1, 'Subject is required').max(500),
  question: z.string().min(1, 'Question is required').max(10000),
  category: z.enum([
    'design_clarification', 'specification_query', 'drawing_discrepancy',
    'site_condition', 'material_substitution', 'regulatory_compliance',
    'contractor_coordination', 'schedule_impact', 'cost_inquiry',
    'safety_concern', 'other',
  ]).optional(),
  priority: z.enum(['low', 'medium', 'normal', 'high', 'urgent', 'critical']).default('medium'),
  due_date: z.string().optional(),
  assigned_to: uuidSchema.optional(),
  phase_id: uuidSchema.optional(),
  drawing_references: z.array(z.any()).optional(),
  spec_references: z.array(z.any()).optional(),
  location_reference: z.string().max(255).optional(),
  cost_impact: z.number().optional(),
  cost_impact_currency: z.enum(['GHS', 'USD', 'EUR', 'GBP']).default('GHS'),
  schedule_impact_days: z.number().int().optional(),
  attachments: z.array(z.any()).optional(),
  related_rfis: z.array(uuidSchema).optional(),
  submit_immediately: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

export const updateRfiSchema = createRfiSchema.partial().omit({ project_id: true });

export const rfiQuerySchema = paginationSchema.extend({
  project_id: uuidSchema.optional(),
  status: z.enum(['draft', 'open', 'submitted', 'assigned', 'responded', 'closed', 'voided']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assigned_to: uuidSchema.optional(),
  search: z.string().max(255).optional(),
});

export const respondRfiSchema = z.object({
  response: z.string().min(1, 'Response is required').max(10000),
  cost_impact: z.number().optional(),
  schedule_impact_days: z.number().int().optional(),
  response_attachments: z.array(z.any()).optional(),
});

// ============================================================================
// CHANGE ORDERS
// ============================================================================

export const createChangeOrderSchema = z.object({
  project_id: uuidSchema,
  title: z.string().min(1, 'Title is required').max(500),
  description: z.string().min(1).max(10000),
  reason: z.enum([
    'owner_request', 'design_error', 'design_change', 'unforeseen_condition',
    'regulatory_requirement', 'value_engineering', 'scope_addition',
    'scope_reduction', 'material_substitution', 'contractor_request',
    'force_majeure', 'other',
  ]).optional(),
  co_type: z.enum(['additive', 'deductive', 'no_cost', 'time_extension', 'addition', 'deduction']).default('additive'),
  estimated_amount: z.number().optional(),
  currency: z.enum(['GHS', 'USD', 'EUR', 'GBP']).default('GHS'),
  schedule_impact_days: z.number().int().optional(),
  spec_sections: z.array(z.string()).optional(),
  drawings_affected: z.array(z.string()).optional(),
  justification: z.string().max(5000).optional(),
});

export const updateChangeOrderSchema = createChangeOrderSchema.partial().omit({ project_id: true });

export const changeOrderQuerySchema = paginationSchema.extend({
  project_id: uuidSchema.optional(),
  status: z.enum([
    'draft', 'submitted', 'pending_approval', 'approved',
    'rejected', 'executed', 'voided',
  ]).optional(),
  reason: z.string().optional(),
  co_type: z.enum(['additive', 'deductive', 'no_cost', 'time_extension', 'addition', 'deduction']).optional(),
  search: z.string().max(255).optional(),
});

export const changeOrderLineItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unit: z.string().max(50).optional(),
  unit_price: z.number(),
  amount: z.number(),
  cost_code: z.string().max(50).optional(),
});

// ============================================================================
// SUBMITTALS
// ============================================================================

export const createSubmittalSchema = z.object({
  project_id: uuidSchema,
  title: z.string().min(1, 'Title is required').max(500),
  description: z.string().max(5000).optional(),
  submittal_type: z.enum([
    'shop_drawing', 'product_data', 'sample', 'mock_up',
    'design_data', 'test_report', 'certificate', 'other',
  ]).optional(),
  spec_section: z.string().max(100).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  due_date: z.string().optional(),
  contractor_id: uuidSchema.optional(),
  assigned_reviewer: uuidSchema.optional(),
});

export const updateSubmittalSchema = createSubmittalSchema.partial().omit({ project_id: true });

export const submittalReviewSchema = z.object({
  action: z.enum([
    'approved', 'approved_as_noted', 'revise_resubmit',
    'rejected', 'for_information',
  ]),
  comments: z.string().max(5000).optional(),
  markup_url: z.string().url().optional(),
});

export const submittalQuerySchema = paginationSchema.extend({
  project_id: uuidSchema.optional(),
  status: z.string().optional(),
  submittal_type: z.string().optional(),
  priority: z.string().optional(),
  contractor_id: uuidSchema.optional(),
  assigned_reviewer: uuidSchema.optional(),
  search: z.string().max(255).optional(),
});

// ============================================================================
// BUDGET / EXPENSES / INVOICES
// ============================================================================

export const createExpenseSchema = z.object({
  project_id: uuidSchema,
  description: z.string().min(1).max(500),
  amount: z.number().positive('Amount must be positive'),
  currency: z.enum(['GHS', 'USD', 'EUR', 'GBP']).default('GHS'),
  category: z.string().max(100).optional(),
  cost_code: z.string().max(50).optional(),
  vendor_id: uuidSchema.optional(),
  expense_date: z.string(),
  receipt_url: z.string().url().optional(),
  notes: z.string().max(2000).optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'paid']).default('pending'),
});

export const updateExpenseSchema = createExpenseSchema.partial().omit({ project_id: true });

export const createBudgetInvoiceSchema = z.object({
  project_id: uuidSchema,
  organization_id: uuidSchema.optional(),
  vendor_id: uuidSchema.optional(),
  invoice_number: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  amount: z.number().positive(),
  currency: z.enum(['GHS', 'USD', 'EUR', 'GBP']).default('GHS'),
  tax_amount: z.number().nonnegative().default(0),
  issue_date: z.string(),
  due_date: z.string(),
  cost_code: z.string().max(50).optional(),
  line_items: z.array(z.object({
    description: z.string().max(255),
    quantity: z.number().positive(),
    unit_price: z.number(),
    amount: z.number(),
  })).optional(),
}).passthrough();

// ============================================================================
// PHOTOS / ALBUMS
// ============================================================================

export const createAlbumSchema = z.object({
  project_id: uuidSchema,
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  location: z.string().max(255).optional(),
  date: z.string().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export const updateAlbumSchema = createAlbumSchema.partial().omit({ project_id: true });

export const photoQuerySchema = paginationSchema.extend({
  project_id: uuidSchema.optional(),
  album_id: uuidSchema.optional(),
  location: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  search: z.string().max(255).optional(),
  tags: z.string().optional(), // comma-separated
});

// ============================================================================
// TEAM MEMBERS
// ============================================================================

export const addTeamMemberSchema = z.object({
  project_id: uuidSchema.optional(),
  project_ids: z.array(uuidSchema).optional(),
  user_id: uuidSchema.optional(),
  name: z.string().min(1).max(255),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  role: z.string().max(50),
  // Relationship to the org, independent of discipline: 'staff' = internal
  // employee, 'external' = invited outside collaborator. Omitted → inferred.
  member_type: z.enum(['staff', 'external']).optional(),
  permissions: z.array(z.string()).optional(),
  hourly_rate: z.number().positive().optional(),
  currency: z.enum(['GHS', 'USD', 'EUR', 'GBP']).default('GHS'),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

export const updateTeamMemberSchema = addTeamMemberSchema.partial();

// ============================================================================
// PUNCH LISTS
// ============================================================================

export const createPunchItemSchema = z.object({
  description: z.string().min(1).max(2000),
  location: z.string().max(255).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  assigned_to: uuidSchema.optional(),
  due_date: z.string().optional(),
  category: z.string().max(100).optional(),
  spec_section: z.string().max(100).optional(),
  drawing_reference: z.string().max(255).optional(),
  photos: z.array(z.string().url()).max(10).optional(),
});

export const updatePunchItemSchema = createPunchItemSchema.partial().extend({
  status: z.enum([
    'open', 'in_progress', 'ready_for_review',
    'accepted', 'rejected', 'closed',
  ]).optional(),
  resolution_notes: z.string().max(2000).optional(),
});

// ============================================================================
// DAILY LOGS
// ============================================================================

export const createDailyLogSchema = z.object({
  report_date: z.string(),
  weather_condition: z.string().max(100).optional(),
  temperature_high: z.number().optional(),
  temperature_low: z.number().optional(),
  work_summary: z.string().min(1).max(5000),
  safety_incidents: z.number().int().min(0).default(0),
  safety_notes: z.string().max(2000).optional(),
  labor_count: z.number().int().min(0).optional(),
  informal_labor_count: z.number().int().min(0).optional(),
  visitor_count: z.number().int().min(0).optional(),
  delay_hours: z.number().min(0).optional(),
  delay_reason: z.string().max(500).optional(),
  notes: z.string().max(5000).optional(),
  equipment_used: z.array(z.string()).optional(),
  materials_received: z.array(z.object({
    material: z.string().max(255),
    quantity: z.number(),
    unit: z.string().max(50).optional(),
  })).optional(),
});

export const updateDailyLogSchema = createDailyLogSchema.partial();

// ============================================================================
// PROCUREMENT
// ============================================================================

export const createPurchaseOrderSchema = z.object({
  project_id: uuidSchema,
  vendor_id: uuidSchema,
  description: z.string().min(1).max(500),
  amount: z.number().positive(),
  currency: z.enum(['GHS', 'USD', 'EUR', 'GBP']).default('GHS'),
  delivery_date: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  items: z.array(z.object({
    description: z.string().max(255),
    quantity: z.number().positive(),
    unit: z.string().max(50).optional(),
    unit_price: z.number(),
    amount: z.number(),
  })).optional(),
  notes: z.string().max(2000).optional(),
  terms: z.string().max(5000).optional(),
});

export const updatePurchaseOrderSchema = createPurchaseOrderSchema.partial().omit({ project_id: true });

// ============================================================================
// SITE DIARIES
// ============================================================================

export const createSiteDiarySchema = z.object({
  project_id: uuidSchema,
  report_date: z.string(),
  weather_condition: z.string().max(100),
  informal_labor_count: z.number().int().min(0).default(0),
  work_description: z.string().min(1).max(5000),
  safety_observations: z.string().max(2000).optional(),
  materials_used: z.array(z.object({
    material: z.string().max(255),
    quantity: z.number(),
    unit: z.string().max(50).optional(),
  })).optional(),
  equipment_used: z.array(z.string()).optional(),
  photos: z.array(z.string().url()).max(20).optional(),
  notes: z.string().max(5000).optional(),
});

export const updateSiteDiarySchema = createSiteDiarySchema.partial().omit({ project_id: true });

// ============================================================================
// GOVERNANCE
// ============================================================================

export const createFrameworkSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  project_type: z.string().max(50).optional(),
  is_template: z.boolean().default(false),
  phases: z.array(z.object({
    name: z.string().min(1).max(255),
    description: z.string().max(2000).optional(),
    order_index: z.number().int().min(0),
    milestones: z.array(z.object({
      name: z.string().min(1).max(255),
      description: z.string().max(2000).optional(),
      is_required: z.boolean().default(false),
      requires_approval: z.boolean().default(false),
    })).optional(),
  })).optional(),
});

export const updateFrameworkSchema = createFrameworkSchema.partial();

// ============================================================================
// CHECKLISTS
// ============================================================================

export const createChecklistSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  category_id: uuidSchema.optional(),
  template_id: uuidSchema.optional(),
  project_id: uuidSchema.optional(),
  due_date: z.string().optional(),
  assigned_to: uuidSchema.optional(),
  items: z.array(z.object({
    description: z.string().min(1).max(500),
    is_required: z.boolean().default(true),
    order_index: z.number().int().min(0),
    section: z.string().max(100).optional(),
  })).optional(),
});

export const updateChecklistSchema = createChecklistSchema.partial();

export const checklistItemResponseSchema = z.object({
  status: z.enum(['pass', 'fail', 'na', 'pending']),
  notes: z.string().max(2000).optional(),
  photos: z.array(z.string().url()).max(5).optional(),
  signature: z.string().optional(), // base64 signature data
});

// ============================================================================
// CALENDAR
// ============================================================================

export const createCalendarEventSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  event_type: z.string().max(50).optional(),
  location: z.string().max(255).optional(),
  all_day: z.boolean().default(false),
  recurrence: z.string().max(255).optional(),
  attendees: z.array(uuidSchema).optional(),
  project_id: uuidSchema.optional(),
  deal_id: uuidSchema.optional(),
  color: z.string().max(20).optional(),
  reminders: z.array(z.object({
    minutes_before: z.number().int().min(0),
    type: z.enum(['email', 'push', 'sms']),
  })).optional(),
});

export const updateCalendarEventSchema = createCalendarEventSchema.partial();

export const calendarQuerySchema = z.object({
  start: z.string(),
  end: z.string(),
  user: uuidSchema.optional(),
  eventType: z.string().optional(),
  dealId: uuidSchema.optional(),
  contactId: uuidSchema.optional(),
  propertyId: uuidSchema.optional(),
  service: z.string().optional(),
});

// ============================================================================
// EXPORT ALL AS NAMESPACE
// ============================================================================

export const PMProjectSchemas = {
  createProject: createProjectSchema,
  updateProject: updateProjectSchema,
  projectQuery: projectQuerySchema,
  createPhase: createPhaseSchema,
  updatePhase: updatePhaseSchema,
  createMilestone: createMilestoneSchema,
  updateMilestone: updateMilestoneSchema,
  createRfi: createRfiSchema,
  updateRfi: updateRfiSchema,
  rfiQuery: rfiQuerySchema,
  respondRfi: respondRfiSchema,
  createChangeOrder: createChangeOrderSchema,
  updateChangeOrder: updateChangeOrderSchema,
  changeOrderQuery: changeOrderQuerySchema,
  changeOrderLineItem: changeOrderLineItemSchema,
  createSubmittal: createSubmittalSchema,
  updateSubmittal: updateSubmittalSchema,
  submittalReview: submittalReviewSchema,
  submittalQuery: submittalQuerySchema,
  createExpense: createExpenseSchema,
  updateExpense: updateExpenseSchema,
  createBudgetInvoice: createBudgetInvoiceSchema,
  createAlbum: createAlbumSchema,
  updateAlbum: updateAlbumSchema,
  photoQuery: photoQuerySchema,
  addTeamMember: addTeamMemberSchema,
  updateTeamMember: updateTeamMemberSchema,
  createPunchItem: createPunchItemSchema,
  updatePunchItem: updatePunchItemSchema,
  createDailyLog: createDailyLogSchema,
  updateDailyLog: updateDailyLogSchema,
  createPurchaseOrder: createPurchaseOrderSchema,
  updatePurchaseOrder: updatePurchaseOrderSchema,
  createSiteDiary: createSiteDiarySchema,
  updateSiteDiary: updateSiteDiarySchema,
  createFramework: createFrameworkSchema,
  updateFramework: updateFrameworkSchema,
  createChecklist: createChecklistSchema,
  updateChecklist: updateChecklistSchema,
  checklistItemResponse: checklistItemResponseSchema,
  createCalendarEvent: createCalendarEventSchema,
  updateCalendarEvent: updateCalendarEventSchema,
  calendarQuery: calendarQuerySchema,
};
