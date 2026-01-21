/**
 * CRM Types and Interfaces
 * Phase 5.2: Service Layer
 */

// =============================================
// Contact Types
// =============================================

export type ContactType =
    | 'first_time_buyer'
    | 'repeat_buyer'
    | 'investor'
    | 'developer'
    | 'diaspora_buyer'
    | 'corporate_buyer'
    | 'government_entity'
    | 'tenant'
    | 'landlord'
    | 'agent'
    | 'lawyer'
    | 'other';

export type LeadSource =
    | 'website'
    | 'property_listing'
    | 'contact_form'
    | 'valuation_request'
    | 'facebook'
    | 'instagram'
    | 'whatsapp'
    | 'referral'
    | 'event'
    | 'walk_in'
    | 'diaspora_campaign'
    | 'google_ads'
    | 'other';

export type LeadStatus =
    | 'new'
    | 'contacted'
    | 'qualified'
    | 'proposal_sent'
    | 'negotiating'
    | 'converted'
    | 'lost'
    | 'unresponsive';

export type QualificationLevel = 'unqualified' | 'low' | 'medium' | 'high' | 'hot';

export type ContactMethod = 'phone' | 'whatsapp' | 'email' | 'sms' | 'in_person' | 'video_call';

export type Language = 'english' | 'twi' | 'ga' | 'ewe' | 'dagbani' | 'fante' | 'other';

export type EmploymentStatus = 'employed' | 'self_employed' | 'unemployed' | 'student' | 'retired' | 'other';

export type IncomeRange =
    | 'under_2000'
    | '2000_5000'
    | '5000_10000'
    | '10000_20000'
    | '20000_50000'
    | 'over_50000';

export interface Contact {
    id: string;
    organization_id: string;

    // Personal information
    first_name: string;
    last_name: string;
    other_names?: string;
    title?: string;
    date_of_birth?: Date;
    gender?: string;
    marital_status?: string;
    nationality?: string;
    languages?: Language[];

    // Contact details
    primary_phone: string;
    alternate_phone?: string;
    whatsapp_number?: string;
    email?: string;
    alternate_email?: string;
    preferred_contact_method?: ContactMethod;
    best_call_time?: string;

    // Location
    current_address?: Record<string, any>;
    permanent_address?: Record<string, any>;
    country_of_residence?: string;
    region?: string;
    city?: string;
    digital_address?: string;

    // Professional information
    occupation?: string;
    employer?: string;
    industry?: string;
    work_address?: Record<string, any>;
    monthly_income_range?: IncomeRange;
    employment_status?: EmploymentStatus;

    // CRM classification
    contact_type: ContactType;
    lead_source?: LeadSource;
    lead_status?: LeadStatus;
    customer_segment?: string;
    company_id?: string;

    // Scoring and qualification
    lead_score?: number;
    qualification_level?: QualificationLevel;
    conversion_probability?: number;

    // Property interests
    property_interests?: Record<string, any>;
    budget_min?: number;
    budget_max?: number;
    preferred_locations?: string[];
    preferred_property_types?: string[];

    // Communication preferences
    preferred_language?: Language;
    communication_frequency?: string;
    opt_in_email?: boolean;
    opt_in_sms?: boolean;
    opt_in_whatsapp?: boolean;

    // Relationship mapping
    referred_by?: string;
    family_connections?: Record<string, any>;

    // Assignment
    assigned_to?: string;
    assigned_team?: string;

    // Metadata
    notes?: string;
    tags?: string[];
    custom_fields?: Record<string, any>;
    last_contact_at?: Date;

    // Timestamps
    created_at: Date;
    updated_at: Date;
    deleted_at?: Date;
    created_by?: string;
    updated_by?: string;
}

export interface CreateContactInput {
    first_name: string;
    last_name: string;
    other_names?: string;
    primary_phone: string;
    email?: string;
    whatsapp_number?: string;
    contact_type: ContactType;
    lead_source?: LeadSource;
    region?: string;
    city?: string;
    digital_address?: string;
    occupation?: string;
    budget_min?: number;
    budget_max?: number;
    preferred_locations?: string[];
    assigned_to?: string;
    notes?: string;
    tags?: string[];
}

export interface UpdateContactInput {
    first_name?: string;
    last_name?: string;
    other_names?: string;
    primary_phone?: string;
    email?: string;
    whatsapp_number?: string;
    lead_status?: LeadStatus;
    lead_score?: number;
    qualification_level?: QualificationLevel;
    assigned_to?: string;
    notes?: string;
    tags?: string[];
    custom_fields?: Record<string, any>;
}

// =============================================
// Company Types
// =============================================

export type CompanyType =
    | 'developer'
    | 'investor'
    | 'corporate'
    | 'real_estate_agency'
    | 'construction'
    | 'financial_institution'
    | 'government'
    | 'other';

export interface Company {
    id: string;
    organization_id: string;
    company_name: string;
    company_type?: CompanyType;
    industry?: string;
    company_size?: string;
    registration_number?: string;
    primary_contact_id?: string;
    phone?: string;
    email?: string;
    website?: string;
    address?: Record<string, any>;
    region?: string;
    city?: string;
    digital_address?: string;
    notes?: string;
    tags?: string[];
    custom_fields?: Record<string, any>;
    created_at: Date;
    updated_at: Date;
    deleted_at?: Date;
    created_by?: string;
    updated_by?: string;
}


export interface CreateCompanyInput {
    company_name: string;
    company_type?: CompanyType;
    industry?: string;
    company_size?: string;
    registration_number?: string;
    primary_contact_id?: string;
    phone?: string;
    email?: string;
    website?: string;
    address?: Record<string, any>;
    region?: string;
    city?: string;
    digital_address?: string;
    notes?: string;
    tags?: string[];
}

export interface UpdateCompanyInput {
    company_name?: string;
    company_type?: CompanyType;
    industry?: string;
    company_size?: string;
    registration_number?: string;
    primary_contact_id?: string;
    phone?: string;
    email?: string;
    website?: string;
    address?: Record<string, any>;
    notes?: string;
    tags?: string[];
    custom_fields?: Record<string, any>;
}

// ... existing Deal Types ...

export type DealType = 'sale' | 'rental' | 'jv' | 'land_acquisition' | 'development' | 'investment';

export type DealStatus = 'active' | 'won' | 'lost' | 'archived' | 'on_hold';

export interface Deal {
    id: string;
    organization_id: string;
    deal_number: string;
    title: string;
    description?: string;
    primary_contact_id: string;
    secondary_contacts?: string[];
    property_ids?: string[];
    company_id?: string;
    assigned_agent: string;
    assigned_team?: string;
    deal_owners?: string[];
    deal_type: DealType;
    pipeline_id: string;
    stage_id: string;
    deal_status: DealStatus;
    deal_value?: number;
    currency?: string;
    commission_amount?: number;
    commission_percentage?: number;
    estimated_close_date?: Date;
    actual_close_date?: Date;
    close_probability?: number;
    weighted_value?: number;
    lead_source?: LeadSource;
    campaign_source?: string;
    utm_data?: Record<string, any>;
    created_at: Date;
    updated_at: Date;
    deleted_at?: Date;
    stage_changed_at?: Date;
    first_contact_at?: Date;
    last_activity_at?: Date;
    days_in_pipeline?: number;
    stage_duration?: number;
    total_activities?: number;
    tags?: string[];
    custom_fields?: Record<string, any>;
    notes?: string;
    created_by?: string;
    updated_by?: string;
}

export interface CreateDealInput {
    title: string;
    description?: string;
    primary_contact_id: string;
    secondary_contacts?: string[];
    property_ids?: string[];
    company_id?: string;
    assigned_agent: string;
    assigned_team?: string;
    deal_type: DealType;
    pipeline_id: string;
    stage_id: string;
    deal_value?: number;
    estimated_close_date?: Date;
    close_probability?: number;
    lead_source?: LeadSource;
    campaign_source?: string;
    tags?: string[];
    notes?: string;
}

export interface UpdateDealInput {
    title?: string;
    description?: string;
    secondary_contacts?: string[];
    property_ids?: string[];
    assigned_agent?: string;
    pipeline_id?: string;
    stage_id?: string;
    primary_contact_id?: string;
    company_id?: string;
    deal_type?: DealType;
    deal_status?: DealStatus;
    deal_value?: number;
    estimated_close_date?: Date;
    expected_close_date?: Date;
    close_probability?: number;
    probability?: number;
    commission_rate?: number;
    commission_amount?: number;
    lead_source?: LeadSource;
    tags?: string[];
    notes?: string;
    custom_fields?: Record<string, any>;
}

// =============================================
// Activity Types
// =============================================

export type ActivityType =
    | 'phone_call'
    | 'email'
    | 'whatsapp_message'
    | 'sms'
    | 'in_person_meeting'
    | 'video_call'
    | 'property_viewing'
    | 'property_research'
    | 'document_request'
    | 'document_received'
    | 'document_review'
    | 'offer_preparation'
    | 'offer_submission'
    | 'negotiation'
    | 'contract_preparation'
    | 'payment_processing'
    | 'title_verification'
    | 'property_inspection'
    | 'valuation_order'
    | 'legal_review'
    | 'stage_change'
    | 'deal_status_change'
    | 'note_added'
    | 'task_created'
    | 'task_completed'
    | 'other';

export type ActivityOutcome =
    | 'successful'
    | 'unsuccessful'
    | 'pending'
    | 'follow_up_required'
    | 'no_answer'
    | 'not_interested'
    | 'interested'
    | 'scheduled'
    | 'completed'
    | 'cancelled';

export interface DealActivity {
    id: string;
    deal_id: string;
    contact_id?: string;
    user_id: string;
    activity_type: ActivityType;
    subject?: string;
    description?: string;
    outcome?: ActivityOutcome;
    old_value?: Record<string, any>;
    new_value?: Record<string, any>;
    activity_date: Date;
    duration_minutes?: number;
    next_action?: string;
    next_action_date?: Date;
    next_action_assigned_to?: string;
    documents?: Record<string, any>[];
    attachments?: string[];
    notes?: string;
    created_at: Date;
}

export interface CreateActivityInput {
    deal_id: string;
    contact_id?: string;
    user_id: string;
    activity_type: ActivityType;
    subject?: string;
    description?: string;
    outcome?: ActivityOutcome;
    old_value?: Record<string, any>;
    new_value?: Record<string, any>;
    duration_minutes?: number;
    next_action?: string;
    next_action_date?: Date;
    next_action_assigned_to?: string;
    activity_date?: Date;
    notes?: string;
}

// =============================================
// Task Types
// =============================================

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'overdue';

export interface Task {
    id: string;
    organization_id: string;
    title: string;
    description?: string;
    task_type?: string;
    priority: TaskPriority;
    deal_id?: string;
    contact_id?: string;
    property_id?: string;
    assigned_to: string;
    assigned_by?: string;
    assigned_team?: string;
    task_status: TaskStatus;
    due_date?: Date;
    start_date?: Date;
    completed_at?: Date;
    reminder_date?: Date;
    is_recurring?: boolean;
    recurrence_pattern?: Record<string, any>;
    parent_task_id?: string;
    tags?: string[];
    notes?: string;
    created_at: Date;
    updated_at: Date;
    deleted_at?: Date;
    created_by?: string;
}


export interface CreateTaskInput {
    title: string;
    description?: string;
    task_type?: string;
    priority?: TaskPriority;
    deal_id?: string;
    contact_id?: string;
    property_id?: string;
    assigned_to: string;
    due_date?: Date;
    start_date?: Date;
    reminder_date?: Date;
    is_recurring?: boolean;
    recurrence_pattern?: Record<string, any>;
    tags?: string[];
}

export interface UpdateTaskInput {
    title?: string;
    description?: string;
    priority?: TaskPriority;
    task_status?: TaskStatus;
    assigned_to?: string;
    due_date?: Date;
    completed_at?: Date;
    notes?: string;
    tags?: string[];
}

// =============================================
// Note Types
// =============================================

export interface Note {
    id: string;
    organization_id: string;
    content: string;
    entity_type: string;
    entity_id: string;
    is_private: boolean;
    is_pinned: boolean;
    mentions?: string[];
    tags?: string[];
    created_at: Date;
    updated_at: Date;
    created_by: string;
}

export interface CreateNoteInput {
    content: string;
    entity_type: string;
    entity_id: string;
    is_private?: boolean;
    is_pinned?: boolean;
    mentions?: string[];
    tags?: string[];
}

// =============================================
// Pipeline Types
// =============================================

export interface DealPipeline {
    id: string;
    organization_id: string;
    pipeline_name: string;
    pipeline_type: DealType;
    description?: string;
    color?: string;
    is_default: boolean;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
    deleted_at?: Date;
    created_by?: string;
}

export interface DealStage {
    id: string;
    pipeline_id: string;
    stage_name: string;
    stage_order: number;
    stage_color?: string;
    description?: string;
    requirements?: Record<string, any>;
    allowed_next_stages?: string[];
    auto_transition_rules?: Record<string, any>;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

// =============================================
// Query Types
// =============================================

export interface PaginationParams {
    page?: number;
    limit?: number;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
}

export interface ContactFilters extends PaginationParams {
    search?: string;
    contact_type?: ContactType;
    lead_status?: LeadStatus;
    lead_score_min?: number;
    lead_score_max?: number;
    assigned_to?: string;
    region?: string;
    tags?: string[];
}

export interface DealFilters extends PaginationParams {
    search?: string;
    deal_type?: DealType;
    deal_status?: DealStatus;
    pipeline_id?: string;
    stage_id?: string;
    assigned_agent?: string;
    estimated_close_date_from?: Date;
    estimated_close_date_to?: Date;
    deal_value_min?: number;
    deal_value_max?: number;
    tags?: string[];
}

export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        total_pages: number;
    };
}
