import { z } from 'zod'
import { ContactType, LeadStatus, BuyerType, DealType, DealStatus } from '@/types/crm'

// =====================================================
// DEAL SCHEMA
// =====================================================

export const dealFormSchema = z.object({
  title: z.string().min(1, 'Deal title is required').max(200),
  description: z.string().max(2000).optional().default(''),
  deal_type: z.nativeEnum(DealType),
  pipeline_id: z.string().min(1, 'Please select a pipeline'),
  stage_id: z.string().min(1, 'Please select a stage'),
  deal_value: z
    .string()
    .optional()
    .default('')
    .transform((v) => (v ? parseFloat(v) : undefined))
    .pipe(z.number().positive('Value must be positive').optional()),
  commission_rate: z
    .string()
    .optional()
    .default('3')
    .transform((v) => (v ? parseFloat(v) : undefined))
    .pipe(z.number().min(0).max(100).optional()),
  probability: z
    .string()
    .optional()
    .default('50')
    .transform((v) => (v ? parseInt(v) : undefined))
    .pipe(z.number().min(0).max(100).optional()),
  expected_close_date: z.string().optional().default(''),
  lead_source: z.string().optional().default(''),
  primary_contact_id: z.string().min(1, 'Please select a primary contact'),
  assigned_agent: z.string().min(1, 'Please select an assigned agent'),
  property_ids: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
  currency: z.string().default('GHS'),
})

export type DealFormValues = z.input<typeof dealFormSchema>
export type DealFormOutput = z.output<typeof dealFormSchema>

// =====================================================
// CONTACT SCHEMA
// =====================================================

export const contactFormSchema = z.object({
  contact_type: z.nativeEnum(ContactType),
  title: z.string().optional().default(''),
  first_name: z.string().min(1, 'First name is required').max(100),
  last_name: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Invalid email').optional().or(z.literal('')).default(''),
  phone_primary: z.string().min(1, 'Primary phone is required').max(20),
  phone_secondary: z.string().max(20).optional().default(''),
  whatsapp_number: z.string().max(20).optional().default(''),
  ghana_post_gps: z.string().max(30).optional().default(''),
  region: z.string().optional().default(''),
  city: z.string().max(100).optional().default(''),
  address: z.string().max(500).optional().default(''),
  occupation: z.string().max(100).optional().default(''),
  company_name: z.string().max(200).optional().default(''),
  job_title: z.string().max(100).optional().default(''),
  income_range: z.string().optional().default(''),
  buyer_type: z.union([z.nativeEnum(BuyerType), z.literal('')]).optional().default(''),
  budget_min: z.string().optional().default(''),
  budget_max: z.string().optional().default(''),
  lead_status: z.nativeEnum(LeadStatus),
  lead_source: z.string().optional().default(''),
  tags: z.string().optional().default(''),
  notes: z.string().max(5000).optional().default(''),
})

export type ContactFormValues = z.input<typeof contactFormSchema>

// =====================================================
// COMPANY SCHEMA
// =====================================================

export const companyFormSchema = z.object({
  name: z.string().min(1, 'Company name is required').max(200),
  company_type: z.string().min(1, 'Company type is required'),
  registration_number: z.string().max(50).optional().default(''),
  tax_id: z.string().max(50).optional().default(''),
  email: z.string().email('Invalid email').optional().or(z.literal('')).default(''),
  phone: z.string().max(20).optional().default(''),
  website: z.string().url('Invalid URL').optional().or(z.literal('')).default(''),
  address: z.string().max(500).optional().default(''),
  city: z.string().max(100).optional().default(''),
  region: z.string().optional().default(''),
  description: z.string().max(2000).optional().default(''),
})

export type CompanyFormValues = z.input<typeof companyFormSchema>
