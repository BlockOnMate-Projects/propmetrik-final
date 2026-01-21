/**
 * CRM & Deal Management Module Types
 * Phase 5: Frontend type definitions mirrored from backend
 */

// =====================================================
// ENUMS
// =====================================================

export enum ContactType {
    FIRST_TIME_BUYER = 'first_time_buyer',
    REPEAT_BUYER = 'repeat_buyer',
    INVESTOR = 'investor',
    DEVELOPER = 'developer',
    DIASPORA_BUYER = 'diaspora_buyer',
    CORPORATE_BUYER = 'corporate_buyer',
    GOVERNMENT_ENTITY = 'government_entity',
    TENANT = 'tenant',
    LANDLORD = 'landlord',
    AGENT = 'agent',
    LAWYER = 'lawyer',
    OTHER = 'other'
}

export enum LeadStatus {
    NEW = 'new',
    CONTACTED = 'contacted',
    QUALIFIED = 'qualified',
    UNQUALIFIED = 'unqualified',
    NURTURING = 'nurturing'
}

export enum BuyerType {
    FIRST_TIME = 'first_time',
    INVESTOR = 'investor',
    RELOCATING = 'relocating',
    UPGRADING = 'upgrading',
    DOWNSIZING = 'downsizing',
    DEVELOPER = 'developer',
    INSTITUTIONAL = 'institutional'
}

export enum CompanyType {
    DEVELOPER = 'developer',
    AGENCY = 'agency',
    INVESTOR = 'investor',
    CORPORATE = 'corporate',
    GOVERNMENT = 'government',
    NGO = 'ngo',
    OTHER = 'other'
}

export enum DealType {
    SALE = 'sale',
    RENTAL = 'rental',
    JOINT_VENTURE = 'joint_venture',
    LAND_ACQUISITION = 'land_acquisition',
    DEVELOPMENT = 'development'
}

export enum DealStatus {
    ACTIVE = 'active',
    WON = 'won',
    LOST = 'lost',
    ON_HOLD = 'on_hold',
    CANCELLED = 'cancelled'
}

export enum TaskPriority {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    URGENT = 'urgent'
}

export enum TaskStatus {
    PENDING = 'pending',
    IN_PROGRESS = 'in_progress',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled'
}

export enum ActivityType {
    CALL = 'call',
    EMAIL = 'email',
    WHATSAPP = 'whatsapp',
    MEETING = 'meeting',
    VIEWING = 'viewing',
    STAGE_CHANGE = 'stage_change',
    NOTE = 'note',
    DOCUMENT = 'document',
    SIGNATURE = 'signature'
}

export enum DocumentType {
    CONTRACT = 'contract',
    AGREEMENT = 'agreement',
    OFFER_LETTER = 'offer_letter',
    DEED = 'deed',
    INDENTURE = 'indenture',
    POWER_OF_ATTORNEY = 'power_of_attorney',
    MOU = 'mou',
    RECEIPT = 'receipt',
    IDENTIFICATION = 'identification',
    TITLE_DOCUMENT = 'title_document',
    SITE_PLAN = 'site_plan',
    OTHER = 'other'
}

export enum SignatureStatus {
    DRAFT = 'draft',
    SENT = 'sent',
    VIEWED = 'viewed',
    SIGNED = 'signed',
    DECLINED = 'declined',
    VOIDED = 'voided',
    EXPIRED = 'expired'
}

// =====================================================
// INTERFACES
// =====================================================

export interface Contact {
    id: string;
    organization_id: string;
    contact_type: ContactType;
    title?: string;
    first_name: string;
    last_name: string;
    full_name?: string;
    email?: string;
    phone_primary?: string;
    phone_secondary?: string;
    whatsapp_number?: string;
    ghana_post_gps?: string;
    region?: string;
    city?: string;
    address?: string;
    occupation?: string;
    company_id?: string;
    company_name?: string;
    job_title?: string;
    income_range?: string;
    buyer_type?: BuyerType;
    budget_min?: number;
    budget_max?: number;
    preferred_regions?: string[];
    property_preferences?: Record<string, any>;
    lead_status: LeadStatus;
    lead_score?: number;
    lead_source?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    assigned_to?: string;
    assigned_to_name?: string;
    tags?: string[];
    notes?: string;
    last_contacted_at?: string;
    created_at: string;
    updated_at: string;
    deal_count?: number;
    total_deal_value?: number;
}

export interface Company {
    id: string;
    organization_id: string;
    company_name: string;
    company_type: CompanyType;
    industry?: string;
    registration_number?: string;
    tin_number?: string;
    website?: string;
    email?: string;
    phone?: string;
    ghana_post_gps?: string;
    region?: string;
    city?: string;
    address?: string;
    employee_count?: string;
    annual_revenue_range?: string;
    primary_contact_id?: string;
    primary_contact_name?: string;
    assigned_to?: string;
    tags?: string[];
    notes?: string;
    created_at: string;
    updated_at: string;
    contact_count?: number;
    deal_count?: number;
    total_deal_value?: number;
}

export interface DealPipeline {
    id: string;
    organization_id: string;
    pipeline_name: string;
    pipeline_type: DealType;
    description?: string;
    is_default: boolean;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    stages?: DealStage[];
}

export interface DealStage {
    id: string;
    pipeline_id: string;
    stage_name: string;
    stage_order: number;
    stage_color?: string;
    description?: string;
    probability?: number;
    sla_days?: number;
    required_fields?: string[];
    allowed_next_stages?: string[];
    is_active: boolean;
    created_at: string;
    updated_at: string;
    deal_count?: number;
    total_value?: number;
}

export interface Deal {
    id: string;
    organization_id: string;
    deal_number: string;
    title: string;
    description?: string;
    deal_type: DealType;
    deal_status: DealStatus;
    pipeline_id: string;
    pipeline_name?: string;
    stage_id: string;
    stage_name?: string;
    stage_color?: string;
    primary_contact_id?: string;
    primary_contact_name?: string;
    company_id?: string;
    company_name?: string;
    property_ids?: string[];
    property_names?: string[];
    deal_value?: number;
    currency: string;
    commission_rate?: number;
    commission_amount?: number;
    probability?: number;
    expected_close_date?: string;
    actual_close_date?: string;
    assigned_agent?: string;
    assigned_agent_name?: string;
    secondary_agents?: string[];
    lead_source?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    tags?: string[];
    custom_fields?: Record<string, any>;
    created_at: string;
    updated_at: string;
    stage_entered_at?: string;
    days_in_stage?: number;
    activity_count?: number;
    document_count?: number;
    task_count?: number;
}

export interface DealActivity {
    id: string;
    deal_id: string;
    organization_id: string;
    activity_type: ActivityType;
    title: string;
    description?: string;
    performed_by: string;
    performed_by_name?: string;
    activity_date: string;
    old_value?: any;
    new_value?: any;
    metadata?: Record<string, any>;
    document_ids?: string[];
    created_at: string;
}

export interface Task {
    id: string;
    organization_id: string;
    title: string;
    description?: string;
    task_type?: string;
    priority: TaskPriority;
    status: TaskStatus;
    due_date?: string;
    completed_at?: string;
    deal_id?: string;
    deal_title?: string;
    contact_id?: string;
    contact_name?: string;
    property_id?: string;
    property_title?: string;
    assigned_to?: string;
    assigned_to_name?: string;
    created_by: string;
    created_by_name?: string;
    reminder_date?: string;
    is_recurring: boolean;
    recurrence_pattern?: string;
    tags?: string[];
    created_at: string;
    updated_at: string;
}

export interface Note {
    id: string;
    organization_id: string;
    entity_type: 'deal' | 'contact' | 'company' | 'property';
    entity_id: string;
    content: string;
    is_private: boolean;
    is_pinned: boolean;
    created_by: string;
    created_by_name?: string;
    mentions?: string[];
    tags?: string[];
    created_at: string;
    updated_at: string;
}

export interface CrmDocument {
    id: string;
    organization_id: string;
    entity_type: 'deal' | 'contact' | 'company' | 'property';
    entity_id: string;
    document_type: DocumentType;
    file_name: string;
    file_size: number;
    mime_type: string;
    storage_key: string;
    version: number;
    parent_document_id?: string;
    description?: string;
    tags?: string[];
    is_signed: boolean;
    signature_envelope_id?: string;
    uploaded_by: string;
    uploaded_by_name?: string;
    created_at: string;
}

export interface SignatureEnvelope {
    id: string;
    organization_id: string;
    deal_id: string;
    document_id: string;
    envelope_title: string;
    status: SignatureStatus;
    signers: SignerInfo[];
    message?: string;
    created_by: string;
    sent_at?: string;
    completed_at?: string;
    expires_at?: string;
    signed_document_key?: string;
    created_at: string;
    updated_at: string;
}

export interface SignerInfo {
    signer_id: string;
    contact_id?: string;
    name: string;
    email: string;
    phone?: string;
    signing_order: number;
    status: 'pending' | 'sent' | 'signed' | 'declined';
    signed_at?: string;
}

// =====================================================
// API RESPONSE TYPES
// =====================================================

export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export interface DealMetrics {
    totalDeals: number;
    activeDeals: number;
    wonDeals: number;
    lostDeals: number;
    totalValue: number;
    wonValue: number;
    avgDealValue: number;
    conversionRate: number;
}

export interface PipelineMetrics {
    pipeline_id: string;
    pipeline_name: string;
    stages: StageMetrics[];
}

export interface StageMetrics {
    stage_id: string;
    stage_name: string;
    stage_color: string;
    stage_order: number;
    deal_count: number;
    total_value: number;
}

export interface ContactStats {
    totalContacts: number;
    newThisMonth: number;
    byLeadStatus: Record<string, number>;
    byBuyerType: Record<string, number>;
}

export interface KanbanColumn {
    stage: DealStage;
    deals: Deal[];
    totalValue: number;
}

// =====================================================
// AGENT TYPES
// =====================================================

export enum AgentStatus {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
    SUSPENDED = 'suspended',
    PENDING_APPROVAL = 'pending_approval'
}

export enum AgentSpecialization {
    RESIDENTIAL_SALES = 'residential_sales',
    COMMERCIAL_SALES = 'commercial_sales',
    RESIDENTIAL_RENTALS = 'residential_rentals',
    COMMERCIAL_RENTALS = 'commercial_rentals',
    LAND_SALES = 'land_sales',
    PROPERTY_MANAGEMENT = 'property_management',
    INVESTMENT_ADVISORY = 'investment_advisory',
    VALUATION = 'valuation',
    GENERAL = 'general'
}

export interface Agent {
    id: string;
    organization_id: string;
    user_id?: string;
    first_name: string;
    last_name: string;
    display_name?: string;
    email: string;
    phone_primary: string;
    phone_secondary?: string;
    whatsapp_number?: string;
    avatar_url?: string;
    license_number?: string;
    license_expiry?: string;
    ghana_real_estate_board_id?: string;
    specializations: AgentSpecialization[];
    regions_covered?: string[];
    languages?: string[];
    years_experience: number;
    bio?: string;
    default_commission_rate: number;
    commission_split_rate: number;
    base_salary?: number;
    total_deals_closed: number;
    total_sales_volume: number;
    total_commission_earned: number;
    average_deal_value: number;
    average_days_to_close: number;
    current_active_deals: number;
    current_active_listings: number;
    customer_rating: number;
    rating_count: number;
    status: AgentStatus;
    hire_date?: string;
    termination_date?: string;
    team_id?: string;
    supervisor_id?: string;
    created_at: string;
    updated_at: string;
}

export interface AgentStats {
    total_agents: number;
    active_agents: number;
    total_deals_this_month: number;
    total_volume_this_month: number;
    average_rating: number;
}
