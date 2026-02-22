/**
 * CRM Zod Validation Schemas
 * Phase 1 Task 7: Validation for top 10 most-used CRM routes
 *
 * Usage pattern:
 *   - Body-only: validate(schema)
 *   - Body + params: validateRequest({ body: schema, params: paramsSchema })
 */

import { z } from 'zod';

// =============================================
// Shared Enums
// =============================================

export const contactTypeEnum = z.enum([
    'first_time_buyer', 'repeat_buyer', 'investor', 'developer',
    'diaspora_buyer', 'corporate_buyer', 'government_entity',
    'tenant', 'landlord', 'agent', 'lawyer', 'other'
]);

export const leadSourceEnum = z.enum([
    'website', 'property_listing', 'contact_form', 'valuation_request',
    'facebook', 'instagram', 'whatsapp', 'referral', 'event',
    'walk_in', 'diaspora_campaign', 'google_ads', 'other'
]);

export const leadStatusEnum = z.enum([
    'new', 'contacted', 'qualified', 'proposal_sent',
    'negotiating', 'converted', 'lost', 'unresponsive'
]);

export const dealTypeEnum = z.enum([
    'sale', 'rental', 'jv', 'land_acquisition', 'development', 'investment'
]);

export const dealStatusEnum = z.enum([
    'active', 'won', 'lost', 'archived', 'on_hold'
]);

export const taskPriorityEnum = z.enum(['low', 'medium', 'high', 'urgent']);

export const activityTypeEnum = z.enum([
    'phone_call', 'email', 'whatsapp_message', 'sms',
    'in_person_meeting', 'video_call', 'property_viewing',
    'property_research', 'document_request', 'document_received',
    'document_review', 'offer_preparation', 'offer_submission',
    'negotiation', 'contract_preparation', 'payment_processing',
    'title_verification', 'property_inspection', 'valuation_order',
    'legal_review', 'stage_change', 'deal_status_change',
    'note_added', 'task_created', 'task_completed', 'other'
]);

export const activityOutcomeEnum = z.enum([
    'successful', 'unsuccessful', 'pending', 'follow_up_required',
    'no_answer', 'not_interested', 'interested', 'scheduled',
    'completed', 'cancelled'
]);

export const uuidParam = z.object({
    id: z.string().uuid('Invalid UUID'),
});

// =============================================
// 1. POST /contacts — Create Contact (body only)
// =============================================

export const createContactBody = z.object({
    first_name: z.string().min(1, 'First name is required').max(100),
    last_name: z.string().min(1, 'Last name is required').max(100),
    other_names: z.string().max(100).optional(),
    primary_phone: z.string().min(6, 'Primary phone is required').max(20),
    email: z.string().email('Invalid email').optional().or(z.literal('')),
    whatsapp_number: z.string().max(20).optional(),
    contact_type: contactTypeEnum,
    lead_source: leadSourceEnum.optional(),
    region: z.string().max(100).optional(),
    city: z.string().max(100).optional(),
    digital_address: z.string().max(30).optional(),
    occupation: z.string().max(200).optional(),
    budget_min: z.number().nonnegative().optional(),
    budget_max: z.number().nonnegative().optional(),
    preferred_locations: z.array(z.string()).optional(),
    assigned_to: z.string().uuid().optional(),
    notes: z.string().max(5000).optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
}).passthrough();

// =============================================
// 2. PUT /contacts/:id — Update Contact (body + params)
// =============================================

export const updateContactBody = z.object({
    first_name: z.string().min(1).max(100).optional(),
    last_name: z.string().min(1).max(100).optional(),
    other_names: z.string().max(100).optional(),
    primary_phone: z.string().min(6).max(20).optional(),
    email: z.string().email('Invalid email').optional().or(z.literal('')),
    whatsapp_number: z.string().max(20).optional(),
    lead_status: leadStatusEnum.optional(),
    lead_score: z.number().int().min(0).max(100).optional(),
    qualification_level: z.enum(['unqualified', 'low', 'medium', 'high', 'hot']).optional(),
    assigned_to: z.string().uuid().optional().nullable(),
    notes: z.string().max(5000).optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    custom_fields: z.record(z.unknown()).optional(),
}).passthrough();

// =============================================
// 3. POST /deals — Create Deal (body only)
// =============================================

export const createDealBody = z.object({
    title: z.string().min(1, 'Title is required').max(200),
    description: z.string().max(5000).optional(),
    primary_contact_id: z.string().uuid('Invalid contact ID'),
    secondary_contacts: z.array(z.string().uuid()).optional(),
    property_ids: z.array(z.string().uuid()).optional(),
    company_id: z.string().uuid().optional(),
    assigned_agent: z.string().uuid('Assigned agent is required'),
    assigned_team: z.string().uuid().optional(),
    deal_type: dealTypeEnum,
    pipeline_id: z.string().uuid('Pipeline ID is required'),
    stage_id: z.string().uuid('Stage ID is required'),
    deal_value: z.number().nonnegative().optional(),
    estimated_close_date: z.string().optional(),
    close_probability: z.number().min(0).max(100).optional(),
    lead_source: leadSourceEnum.optional(),
    campaign_source: z.string().max(200).optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    notes: z.string().max(5000).optional(),
}).passthrough();

// =============================================
// 4. PUT /deals/:id — Update Deal (body + params)
// =============================================

export const updateDealBody = z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).optional(),
    secondary_contacts: z.array(z.string().uuid()).optional(),
    property_ids: z.array(z.string().uuid()).optional(),
    assigned_agent: z.string().uuid().optional(),
    pipeline_id: z.string().uuid().optional(),
    stage_id: z.string().uuid().optional(),
    primary_contact_id: z.string().uuid().optional(),
    company_id: z.string().uuid().optional().nullable(),
    deal_type: dealTypeEnum.optional(),
    deal_status: dealStatusEnum.optional(),
    deal_value: z.number().nonnegative().optional(),
    estimated_close_date: z.string().optional(),
    expected_close_date: z.string().optional(),
    close_probability: z.number().min(0).max(100).optional(),
    probability: z.number().min(0).max(100).optional(),
    commission_rate: z.number().min(0).max(100).optional(),
    commission_amount: z.number().nonnegative().optional(),
    lead_source: leadSourceEnum.optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    notes: z.string().max(5000).optional(),
    custom_fields: z.record(z.unknown()).optional(),
}).passthrough();

// =============================================
// 5. POST /companies — Create Company (body only)
// =============================================

export const createCompanyBody = z.object({
    company_name: z.string().min(1, 'Company name is required').max(200),
    company_type: z.enum([
        'developer', 'investor', 'corporate', 'real_estate_agency',
        'construction', 'financial_institution', 'government', 'other'
    ]).optional(),
    industry: z.string().max(100).optional(),
    company_size: z.string().max(50).optional(),
    registration_number: z.string().max(50).optional(),
    primary_contact_id: z.string().uuid().optional(),
    phone: z.string().max(20).optional(),
    email: z.string().email().optional().or(z.literal('')),
    website: z.string().url().optional().or(z.literal('')),
    address: z.record(z.unknown()).optional(),
    region: z.string().max(100).optional(),
    city: z.string().max(100).optional(),
    digital_address: z.string().max(30).optional(),
    notes: z.string().max(5000).optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
}).passthrough();

// =============================================
// 6. POST /tasks — Create Task (body only)
// =============================================

export const createTaskBody = z.object({
    title: z.string().min(1, 'Title is required').max(200),
    description: z.string().max(5000).optional(),
    task_type: z.string().max(50).optional(),
    priority: taskPriorityEnum.optional(),
    deal_id: z.string().uuid().optional(),
    contact_id: z.string().uuid().optional(),
    property_id: z.string().uuid().optional(),
    assigned_to: z.string().uuid('Assigned to is required'),
    due_date: z.string().optional(),
    start_date: z.string().optional(),
    reminder_date: z.string().optional(),
    is_recurring: z.boolean().optional(),
    recurrence_pattern: z.record(z.unknown()).optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
}).passthrough();

// =============================================
// 7. POST /notes — Create Note (body only)
// =============================================

export const createNoteBody = z.object({
    content: z.string().min(1, 'Content is required').max(10000),
    entity_type: z.string().min(1, 'Entity type is required'),
    entity_id: z.string().uuid('Entity ID is required'),
    is_private: z.boolean().optional(),
    is_pinned: z.boolean().optional(),
    mentions: z.array(z.string().uuid()).optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
}).passthrough();

// =============================================
// 8. PUT /deals/:id/stage — Move Deal Stage (body + params)
// =============================================

export const moveDealStageBody = z.object({
    stage_id: z.string().uuid('Stage ID is required'),
    notes: z.string().max(2000).optional(),
}).passthrough();

// =============================================
// 9. POST /deals/:id/activities — Log Activity (body + params)
// =============================================

export const createActivityBody = z.object({
    activity_type: activityTypeEnum,
    subject: z.string().max(200).optional(),
    description: z.string().max(5000).optional(),
    outcome: activityOutcomeEnum.optional(),
    contact_id: z.string().uuid().optional(),
    duration_minutes: z.number().int().nonnegative().optional(),
    next_action: z.string().max(500).optional(),
    next_action_date: z.string().optional(),
    next_action_assigned_to: z.string().uuid().optional(),
    activity_date: z.string().optional(),
    notes: z.string().max(5000).optional(),
}).passthrough();

// =============================================
// 10. POST /pipelines — Create Pipeline (body only)
// =============================================

export const createPipelineBody = z.object({
    pipeline_name: z.string().min(1, 'Pipeline name is required').max(100),
    pipeline_type: dealTypeEnum,
    description: z.string().max(1000).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color').optional(),
    is_default: z.boolean().optional(),
    stages: z.array(z.object({
        stage_name: z.string().min(1).max(100),
        stage_order: z.number().int().nonnegative(),
        stage_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        description: z.string().max(500).optional(),
    })).optional(),
}).passthrough();
