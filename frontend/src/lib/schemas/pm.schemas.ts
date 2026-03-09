/**
 * Zod schemas for Project Management forms.
 *
 * Usage in any page with formData + useState pattern:
 *
 *   import { changeOrderSchema } from '@/lib/schemas/pm.schemas'
 *
 *   const handleSubmit = () => {
 *     const result = changeOrderSchema.safeParse(formData)
 *     if (!result.success) {
 *       setErrors(result.error.flatten().fieldErrors)
 *       return
 *     }
 *     // result.data is typed & validated
 *     await fetch(...)
 *   }
 */
import { z } from 'zod'

// ── Shared helpers ─────────────────────────────────
const nonEmpty = (label: string) =>
  z.string().min(1, `${label} is required`).max(500)

const optStr = z.string().optional().or(z.literal(''))
const optNum = z
  .union([z.number(), z.string().transform((v) => (v === '' ? undefined : Number(v)))])
  .optional()
const optDate = z.string().optional().or(z.literal(''))

// ── 1. Change Orders ──────────────────────────────
export const changeOrderReasons = [
  'owner_request',
  'scope_change',
  'design_error',
  'unforeseen_conditions',
  'regulatory_requirement',
  'value_engineering',
  'schedule_acceleration',
  'material_substitution',
  'force_majeure',
  'other',
] as const

export const changeOrderSchema = z.object({
  title: nonEmpty('Title'),
  reason: z.enum(changeOrderReasons, { required_error: 'Reason is required' }),
  cost_impact: optNum,
  schedule_impact_days: optNum,
  description: nonEmpty('Description'),
})
export type ChangeOrderFormValues = z.infer<typeof changeOrderSchema>

// ── 2. Submittals ─────────────────────────────────
export const submittalTypes = [
  'shop_drawing',
  'product_data',
  'sample',
  'mock_up',
  'design_data',
  'test_report',
  'certificate',
  'manufacturer_instruction',
  'closeout',
  'other',
] as const

export const submittalSchema = z.object({
  title: nonEmpty('Title'),
  type: z.enum(submittalTypes).optional(),
  spec_section: optStr,
  description: optStr,
})
export type SubmittalFormValues = z.infer<typeof submittalSchema>

// ── 3. RFIs ───────────────────────────────────────
export const rfiCategories = [
  'design_clarification',
  'specification_query',
  'drawing_discrepancy',
  'site_condition',
  'material_substitution',
  'regulatory_compliance',
  'contractor_coordination',
  'schedule_impact',
  'cost_inquiry',
  'safety_concern',
  'other',
] as const

export const rfiPriorities = ['low', 'normal', 'high', 'critical'] as const

export const rfiSchema = z.object({
  subject: nonEmpty('Subject'),
  category: z.enum(rfiCategories).optional(),
  priority: z.enum(rfiPriorities).optional(),
  due_date: optDate,
  question: nonEmpty('Question'),
  submit_immediately: z.boolean().optional(),
})
export type RfiFormValues = z.infer<typeof rfiSchema>

// ── 4. Procurement ────────────────────────────────
export const currencies = ['GHS', 'USD', 'EUR', 'GBP'] as const
export const unitsOfMeasure = [
  'pcs', 'bags', 'kg', 'tonnes', 'liters', 'meters', 'm2', 'm3',
  'ft', 'ft2', 'ft3', 'rolls', 'sheets', 'bundles', 'sets', 'lots',
] as const

export const procurementLineItemSchema = z.object({
  description: z.string().min(1, 'Item description is required'),
  quantity: z.union([z.number().positive('Must be > 0'), z.string().transform((v) => Number(v))]),
  unitOfMeasure: z.enum(unitsOfMeasure).optional(),
  unitPrice: z.union([z.number().min(0), z.string().transform((v) => Number(v))]),
})

export const procurementSchema = z.object({
  projectId: nonEmpty('Project'),
  vendorName: nonEmpty('Vendor name'),
  title: nonEmpty('Title'),
  vendorContact: optStr,
  currency: z.enum(currencies).optional(),
  requestedDeliveryDate: optDate,
  description: optStr,
  items: z.array(procurementLineItemSchema).min(1, 'At least one line item is required'),
})
export type ProcurementFormValues = z.infer<typeof procurementSchema>

// ── 5. Punch Lists ────────────────────────────────
export const punchListCategories = [
  'deficiency', 'incomplete', 'damage', 'missing', 'cosmetic',
  'safety', 'code_violation', 'warranty', 'other',
] as const

export const punchListPriorities = ['critical', 'high', 'medium', 'low'] as const

export const punchListSchema = z.object({
  title: nonEmpty('Title'),
  description: optStr,
  category: z.enum(punchListCategories).optional(),
  priority: z.enum(punchListPriorities).optional(),
  location: optStr,
  dueDate: optDate,
  unitId: optStr,
})
export type PunchListFormValues = z.infer<typeof punchListSchema>

// ── 6. Checklists ─────────────────────────────────
export const checklistSchema = z.object({
  templateId: nonEmpty('Template'),
  projectId: nonEmpty('Project'),
  location: optStr,
  dueDate: optDate,
})
export type ChecklistFormValues = z.infer<typeof checklistSchema>

// ── 7. Site Logs ──────────────────────────────────
export const weatherConditions = ['sunny', 'partly_cloudy', 'cloudy', 'rainy'] as const

export const siteLogSchema = z.object({
  projectId: nonEmpty('Project'),
  reportDate: nonEmpty('Report date'),
  weatherCondition: z.enum(weatherConditions).optional(),
  temperatureCelsius: optNum,
  informalLaborCount: optNum,
  workPerformed: optStr,
  informalLaborNotes: optStr,
  incidentsOrDelays: optStr,
})
export type SiteLogFormValues = z.infer<typeof siteLogSchema>

// ── 8. Photos ─────────────────────────────────────
export const photoCategories = [
  'site', 'progress', 'safety', 'quality',
  'weather', 'equipment', 'material', 'other',
] as const

export const photoUploadSchema = z.object({
  category: z.enum(photoCategories).optional(),
  location: optStr,
  description: optStr,
  tags: optStr,
})
export type PhotoUploadFormValues = z.infer<typeof photoUploadSchema>

// ── 9. Schedule Events ────────────────────────────
export const eventTypes = [
  'meeting', 'task', 'deadline',
  'follow_up', 'reminder', 'viewing',
] as const

export const scheduleEventSchema = z.object({
  title: nonEmpty('Title'),
  eventType: z.enum(eventTypes).optional(),
  startTime: nonEmpty('Start time'),
  endTime: nonEmpty('End time'),
  location: optStr,
  description: optStr,
}).refine(
  (data) => {
    if (!data.startTime || !data.endTime) return true
    return new Date(data.endTime) > new Date(data.startTime)
  },
  { message: 'End time must be after start time', path: ['endTime'] }
)
export type ScheduleEventFormValues = z.infer<typeof scheduleEventSchema>

// ── Form error helper ─────────────────────────────
/**
 * Validate formData against a zod schema.
 * Returns { success, data, errors } where errors is a flat record for display.
 */
export function validateForm<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): {
  success: boolean
  data?: z.infer<T>
  errors?: Record<string, string[]>
} {
  const result = schema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return {
    success: false,
    errors: result.error.flatten().fieldErrors as Record<string, string[]>,
  }
}
