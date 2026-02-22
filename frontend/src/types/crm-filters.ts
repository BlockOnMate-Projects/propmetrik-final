/**
 * Phase 3: Types for Filter Builder, Saved Views, Bulk Operations, CSV Import
 */

// =====================================================
// FILTER BUILDER TYPES
// =====================================================

export type FilterFieldType = 'text' | 'number' | 'select' | 'multi-select' | 'date' | 'boolean'

export type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equal'
  | 'less_than_or_equal'
  | 'between'
  | 'is_empty'
  | 'is_not_empty'
  | 'in'
  | 'not_in'
  | 'before'
  | 'after'
  | 'is_true'
  | 'is_false'

export interface FilterFieldDefinition {
  key: string
  label: string
  type: FilterFieldType
  options?: { label: string; value: string }[]
  /** Operators allowed for this field type */
  operators: FilterOperator[]
}

export interface FilterCondition {
  id: string
  field: string
  operator: FilterOperator
  value: string | number | boolean | string[]
}

export interface FilterGroup {
  id: string
  conjunction: 'and' | 'or'
  conditions: FilterCondition[]
}

// =====================================================
// SAVED VIEW TYPES
// =====================================================

export interface SavedView {
  id: string
  name: string
  entity_type: 'deals' | 'contacts' | 'companies' | 'tasks'
  filters: FilterGroup
  sort_by?: string
  sort_order?: 'asc' | 'desc'
  columns?: string[]
  is_default?: boolean
  is_pinned?: boolean
  created_at: string
  updated_at: string
}

// =====================================================
// BULK OPERATION TYPES
// =====================================================

export type BulkActionType =
  | 'assign_agent'
  | 'change_stage'
  | 'change_status'
  | 'add_tags'
  | 'remove_tags'
  | 'change_lead_status'
  | 'delete'
  | 'export'

export interface BulkActionConfig {
  type: BulkActionType
  label: string
  icon: string
  requiresValue: boolean
  destructive?: boolean
  confirmMessage?: string
}

// =====================================================
// CSV IMPORT TYPES
// =====================================================

export interface CsvColumnMapping {
  csvColumn: string
  targetField: string | null
  sampleValues: string[]
}

export interface ImportPreview {
  totalRows: number
  validRows: number
  invalidRows: number
  duplicateRows: number
  errors: ImportError[]
}

export interface ImportError {
  row: number
  column: string
  message: string
  value: string
}

export interface ImportResult {
  created: number
  updated: number
  skipped: number
  errors: ImportError[]
}

// =====================================================
// FIELD DEFINITIONS FOR EACH ENTITY
// =====================================================

export const DEAL_FILTER_FIELDS: FilterFieldDefinition[] = [
  {
    key: 'title',
    label: 'Title',
    type: 'text',
    operators: ['contains', 'not_contains', 'equals', 'starts_with', 'ends_with'],
  },
  {
    key: 'deal_type',
    label: 'Deal Type',
    type: 'select',
    operators: ['equals', 'not_equals', 'in'],
    options: [
      { label: 'Sale', value: 'sale' },
      { label: 'Rental', value: 'rental' },
      { label: 'Joint Venture', value: 'joint_venture' },
      { label: 'Land Acquisition', value: 'land_acquisition' },
      { label: 'Development', value: 'development' },
    ],
  },
  {
    key: 'deal_status',
    label: 'Status',
    type: 'select',
    operators: ['equals', 'not_equals', 'in'],
    options: [
      { label: 'Active', value: 'active' },
      { label: 'Won', value: 'won' },
      { label: 'Lost', value: 'lost' },
      { label: 'On Hold', value: 'on_hold' },
      { label: 'Cancelled', value: 'cancelled' },
    ],
  },
  {
    key: 'deal_value',
    label: 'Deal Value',
    type: 'number',
    operators: ['equals', 'greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal', 'between'],
  },
  {
    key: 'probability',
    label: 'Probability',
    type: 'number',
    operators: ['equals', 'greater_than', 'less_than', 'between'],
  },
  {
    key: 'assigned_agent_name',
    label: 'Agent',
    type: 'text',
    operators: ['contains', 'equals', 'is_empty', 'is_not_empty'],
  },
  {
    key: 'primary_contact_name',
    label: 'Contact',
    type: 'text',
    operators: ['contains', 'equals', 'is_empty', 'is_not_empty'],
  },
  {
    key: 'expected_close_date',
    label: 'Expected Close',
    type: 'date',
    operators: ['before', 'after', 'between', 'is_empty', 'is_not_empty'],
  },
  {
    key: 'created_at',
    label: 'Created Date',
    type: 'date',
    operators: ['before', 'after', 'between'],
  },
  {
    key: 'lead_source',
    label: 'Lead Source',
    type: 'text',
    operators: ['equals', 'contains', 'is_empty', 'is_not_empty'],
  },
  {
    key: 'has_valuation',
    label: 'Has Valuation',
    type: 'boolean',
    operators: ['is_true', 'is_false'],
  },
]

export const CONTACT_FILTER_FIELDS: FilterFieldDefinition[] = [
  {
    key: 'first_name',
    label: 'First Name',
    type: 'text',
    operators: ['contains', 'equals', 'starts_with'],
  },
  {
    key: 'last_name',
    label: 'Last Name',
    type: 'text',
    operators: ['contains', 'equals', 'starts_with'],
  },
  {
    key: 'email',
    label: 'Email',
    type: 'text',
    operators: ['contains', 'equals', 'is_empty', 'is_not_empty'],
  },
  {
    key: 'phone_primary',
    label: 'Phone',
    type: 'text',
    operators: ['contains', 'equals', 'is_empty', 'is_not_empty'],
  },
  {
    key: 'lead_status',
    label: 'Lead Status',
    type: 'select',
    operators: ['equals', 'not_equals', 'in'],
    options: [
      { label: 'New', value: 'new' },
      { label: 'Contacted', value: 'contacted' },
      { label: 'Qualified', value: 'qualified' },
      { label: 'Unqualified', value: 'unqualified' },
      { label: 'Nurturing', value: 'nurturing' },
    ],
  },
  {
    key: 'contact_type',
    label: 'Contact Type',
    type: 'select',
    operators: ['equals', 'not_equals', 'in'],
    options: [
      { label: 'First-time Buyer', value: 'first_time_buyer' },
      { label: 'Repeat Buyer', value: 'repeat_buyer' },
      { label: 'Investor', value: 'investor' },
      { label: 'Developer', value: 'developer' },
      { label: 'Diaspora', value: 'diaspora_buyer' },
      { label: 'Corporate', value: 'corporate_buyer' },
      { label: 'Tenant', value: 'tenant' },
      { label: 'Landlord', value: 'landlord' },
      { label: 'Agent', value: 'agent' },
      { label: 'Other', value: 'other' },
    ],
  },
  {
    key: 'city',
    label: 'City',
    type: 'text',
    operators: ['contains', 'equals'],
  },
  {
    key: 'region',
    label: 'Region',
    type: 'text',
    operators: ['contains', 'equals'],
  },
  {
    key: 'budget_max',
    label: 'Budget (Max)',
    type: 'number',
    operators: ['greater_than', 'less_than', 'between', 'is_empty', 'is_not_empty'],
  },
  {
    key: 'lead_score',
    label: 'Lead Score',
    type: 'number',
    operators: ['equals', 'greater_than', 'less_than', 'between'],
  },
  {
    key: 'company_name',
    label: 'Company',
    type: 'text',
    operators: ['contains', 'equals', 'is_empty', 'is_not_empty'],
  },
  {
    key: 'created_at',
    label: 'Created Date',
    type: 'date',
    operators: ['before', 'after', 'between'],
  },
]

export const COMPANY_FILTER_FIELDS: FilterFieldDefinition[] = [
  {
    key: 'company_name',
    label: 'Company Name',
    type: 'text',
    operators: ['contains', 'equals', 'starts_with'],
  },
  {
    key: 'company_type',
    label: 'Company Type',
    type: 'select',
    operators: ['equals', 'not_equals', 'in'],
    options: [
      { label: 'Developer', value: 'developer' },
      { label: 'Agency', value: 'agency' },
      { label: 'Investor', value: 'investor' },
      { label: 'Corporate', value: 'corporate' },
      { label: 'Government', value: 'government' },
      { label: 'NGO', value: 'ngo' },
      { label: 'Other', value: 'other' },
    ],
  },
  {
    key: 'city',
    label: 'City',
    type: 'text',
    operators: ['contains', 'equals'],
  },
  {
    key: 'region',
    label: 'Region',
    type: 'text',
    operators: ['contains', 'equals'],
  },
  {
    key: 'email',
    label: 'Email',
    type: 'text',
    operators: ['contains', 'equals', 'is_empty', 'is_not_empty'],
  },
  {
    key: 'industry',
    label: 'Industry',
    type: 'text',
    operators: ['contains', 'equals'],
  },
  {
    key: 'created_at',
    label: 'Created Date',
    type: 'date',
    operators: ['before', 'after', 'between'],
  },
]

// Importable contact fields for CSV mapping
export const CONTACT_IMPORT_FIELDS = [
  { key: 'first_name', label: 'First Name', required: true },
  { key: 'last_name', label: 'Last Name', required: true },
  { key: 'email', label: 'Email', required: false },
  { key: 'phone_primary', label: 'Phone (Primary)', required: true },
  { key: 'phone_secondary', label: 'Phone (Secondary)', required: false },
  { key: 'whatsapp_number', label: 'WhatsApp Number', required: false },
  { key: 'contact_type', label: 'Contact Type', required: false },
  { key: 'lead_status', label: 'Lead Status', required: false },
  { key: 'company_name', label: 'Company', required: false },
  { key: 'job_title', label: 'Job Title', required: false },
  { key: 'address', label: 'Address', required: false },
  { key: 'city', label: 'City', required: false },
  { key: 'region', label: 'Region', required: false },
  { key: 'ghana_post_gps', label: 'Ghana Post GPS', required: false },
  { key: 'occupation', label: 'Occupation', required: false },
  { key: 'budget_min', label: 'Budget (Min)', required: false },
  { key: 'budget_max', label: 'Budget (Max)', required: false },
  { key: 'lead_source', label: 'Lead Source', required: false },
  { key: 'tags', label: 'Tags (comma separated)', required: false },
  { key: 'notes', label: 'Notes', required: false },
] as const

// Operator display labels
export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  equals: 'equals',
  not_equals: 'does not equal',
  contains: 'contains',
  not_contains: 'does not contain',
  starts_with: 'starts with',
  ends_with: 'ends with',
  greater_than: 'greater than',
  less_than: 'less than',
  greater_than_or_equal: 'at least',
  less_than_or_equal: 'at most',
  between: 'between',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
  in: 'is any of',
  not_in: 'is none of',
  before: 'before',
  after: 'after',
  is_true: 'is true',
  is_false: 'is false',
}

// Operators that don't need a value input
export const NO_VALUE_OPERATORS: FilterOperator[] = ['is_empty', 'is_not_empty', 'is_true', 'is_false']
