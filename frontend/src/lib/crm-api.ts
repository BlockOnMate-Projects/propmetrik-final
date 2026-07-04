/**
 * CRM & Deal Management API Client
 * Phase 5: Frontend API integration for CRM module
 */

import { fetchApi } from './api';
import { authedFetch } from './authed-fetch';
import {
    Contact,
    Company,
    Deal,
    DealPipeline,
    DealStage,
    DealActivity,
    Task,
    Note,
    CrmDocument,
    SignatureEnvelope,
    PaginatedResponse,
    DealMetrics,
    PipelineMetrics,
    ContactStats,
    KanbanColumn,
    ContactType,
    LeadStatus,
    DealType,
    DealStatus,
    TaskPriority,
    TaskStatus,
    DocumentType,
    SignatureStatus,
    Agent,
    AgentStats,
    AgentStatus,
    AgentSpecialization
} from '@/types/crm';

const CRM_BASE = '/crm';

// =====================================================
// CONTACTS API
// =====================================================

export interface ContactFilters {
    page?: number;
    limit?: number;
    search?: string;
    lead_status?: LeadStatus;
    contact_type?: ContactType;
    assigned_to?: string;
    tags?: string[];
}

export const contactsApi = {
    getAll: (filters?: ContactFilters) => {
        const params = new URLSearchParams();
        if (filters?.page) params.set('page', String(filters.page));
        if (filters?.limit) params.set('limit', String(filters.limit));
        if (filters?.search) params.set('search', filters.search);
        if (filters?.lead_status) params.set('lead_status', filters.lead_status);
        if (filters?.contact_type) params.set('contact_type', filters.contact_type);
        if (filters?.assigned_to) params.set('assigned_to', filters.assigned_to);
        if (filters?.tags?.length) params.set('tags', filters.tags.join(','));

        return fetchApi<PaginatedResponse<Contact>>(`${CRM_BASE}/contacts?${params}`);
    },

    getById: (id: string) => fetchApi<Contact>(`${CRM_BASE}/contacts/${id}`),

    create: (data: Partial<Contact>) =>
        fetchApi<Contact>(`${CRM_BASE}/contacts`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    update: (id: string, data: Partial<Contact>) =>
        fetchApi<Contact>(`${CRM_BASE}/contacts/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        }),

    delete: (id: string) =>
        fetchApi<void>(`${CRM_BASE}/contacts/${id}`, {
            method: 'DELETE'
        }),

    getStats: () => fetchApi<ContactStats>(`${CRM_BASE}/contacts/stats`),

    getDeals: (id: string) => fetchApi<Deal[]>(`${CRM_BASE}/contacts/${id}/deals`),

    getTasks: (id: string) => fetchApi<Task[]>(`${CRM_BASE}/contacts/${id}/tasks`),

    getActivities: (id: string) => fetchApi<DealActivity[]>(`${CRM_BASE}/contacts/${id}/activities`)
};

// =====================================================
// COMPANIES API
// =====================================================

export interface CompanyFilters {
    page?: number;
    limit?: number;
    search?: string;
    company_type?: string;
    assigned_to?: string;
}

export const companiesApi = {
    getAll: (filters?: CompanyFilters) => {
        const params = new URLSearchParams();
        if (filters?.page) params.set('page', String(filters.page));
        if (filters?.limit) params.set('limit', String(filters.limit));
        if (filters?.search) params.set('search', filters.search);
        if (filters?.company_type) params.set('company_type', filters.company_type);
        if (filters?.assigned_to) params.set('assigned_to', filters.assigned_to);

        return fetchApi<PaginatedResponse<Company>>(`${CRM_BASE}/companies?${params}`);
    },

    getById: (id: string) => fetchApi<Company>(`${CRM_BASE}/companies/${id}`),

    create: (data: Partial<Company>) =>
        fetchApi<Company>(`${CRM_BASE}/companies`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    update: (id: string, data: Partial<Company>) =>
        fetchApi<Company>(`${CRM_BASE}/companies/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        }),

    delete: (id: string) =>
        fetchApi<void>(`${CRM_BASE}/companies/${id}`, {
            method: 'DELETE'
        }),

    getContacts: (id: string) => fetchApi<Contact[]>(`${CRM_BASE}/companies/${id}/contacts`),

    getDeals: (id: string) => fetchApi<Deal[]>(`${CRM_BASE}/companies/${id}/deals`)
};

// =====================================================
// AGENTS API
// =====================================================

export interface AgentFilters {
    page?: number;
    limit?: number;
    search?: string;
    status?: AgentStatus;
    specialization?: AgentSpecialization;
    region?: string;
    team_id?: string;
}

export const agentsApi = {
    getAll: (filters?: AgentFilters) => {
        const params = new URLSearchParams();
        if (filters?.page) params.set('page', String(filters.page));
        if (filters?.limit) params.set('limit', String(filters.limit));
        if (filters?.search) params.set('search', filters.search);
        if (filters?.status) params.set('status', filters.status);
        if (filters?.specialization) params.set('specialization', filters.specialization);
        if (filters?.region) params.set('region', filters.region);
        if (filters?.team_id) params.set('team_id', filters.team_id);

        return fetchApi<PaginatedResponse<Agent>>(`${CRM_BASE}/agents?${params}`);
    },

    getById: (id: string) => fetchApi<Agent>(`${CRM_BASE}/agents/${id}`),

    create: (data: Partial<Agent>) =>
        fetchApi<Agent>(`${CRM_BASE}/agents`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    update: (id: string, data: Partial<Agent>) =>
        fetchApi<Agent>(`${CRM_BASE}/agents/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        }),

    delete: (id: string) =>
        fetchApi<void>(`${CRM_BASE}/agents/${id}`, {
            method: 'DELETE'
        }),

    getStats: () => fetchApi<AgentStats>(`${CRM_BASE}/agents/stats`),

    getDeals: (id: string) => fetchApi<Deal[]>(`${CRM_BASE}/agents/${id}/deals`),

    getContacts: (id: string) => fetchApi<Contact[]>(`${CRM_BASE}/agents/${id}/contacts`)
};

// =====================================================
// DEALS API
// =====================================================

export interface DealFilters {
    page?: number;
    limit?: number;
    search?: string;
    deal_type?: DealType;
    deal_status?: DealStatus;
    pipeline_id?: string;
    stage_id?: string;
    assigned_agent?: string;
    min_value?: number;
    max_value?: number;
}

export const dealsApi = {
    getAll: (filters?: DealFilters) => {
        const params = new URLSearchParams();
        if (filters?.page) params.set('page', String(filters.page));
        if (filters?.limit) params.set('limit', String(filters.limit));
        if (filters?.search) params.set('search', filters.search);
        if (filters?.deal_type) params.set('type', filters.deal_type);
        if (filters?.deal_status) params.set('status', filters.deal_status);
        if (filters?.pipeline_id) params.set('pipelineId', filters.pipeline_id);
        if (filters?.stage_id) params.set('stageId', filters.stage_id);
        if (filters?.assigned_agent) params.set('assigned_agent', filters.assigned_agent);
        if (filters?.min_value) params.set('min_value', String(filters.min_value));
        if (filters?.max_value) params.set('max_value', String(filters.max_value));

        return fetchApi<PaginatedResponse<Deal>>(`${CRM_BASE}/deals?${params}`);
    },

    getById: (id: string) => fetchApi<Deal>(`${CRM_BASE}/deals/${id}`),

    create: (data: Partial<Deal>) =>
        fetchApi<Deal>(`${CRM_BASE}/deals`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    update: (id: string, data: Partial<Deal>) =>
        fetchApi<Deal>(`${CRM_BASE}/deals/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        }),

    delete: (id: string) =>
        fetchApi<void>(`${CRM_BASE}/deals/${id}`, {
            method: 'DELETE'
        }),

    updateStage: (id: string, stageId: string, note?: string) =>
        fetchApi<Deal>(`${CRM_BASE}/deals/${id}/stage`, {
            method: 'PUT',
            body: JSON.stringify({ stage_id: stageId, note })
        }),

    getKanban: (pipelineId?: string, dealStatus: DealStatus = DealStatus.ACTIVE) => {
        const params = new URLSearchParams();
        if (pipelineId) params.set('pipeline_id', pipelineId);
        params.set('deal_status', dealStatus);
        return fetchApi<KanbanColumn[]>(`${CRM_BASE}/deals/kanban?${params}`);
    },

    getMetrics: (filters?: { deal_type?: DealType; date_from?: string; date_to?: string }) => {
        const params = new URLSearchParams();
        if (filters?.deal_type) params.set('deal_type', filters.deal_type);
        if (filters?.date_from) params.set('date_from', filters.date_from);
        if (filters?.date_to) params.set('date_to', filters.date_to);
        return fetchApi<DealMetrics>(`${CRM_BASE}/deals/metrics?${params}`);
    },

    // Activities
    getActivities: (id: string) => fetchApi<DealActivity[]>(`${CRM_BASE}/deals/${id}/activities`),

    addActivity: (id: string, data: Partial<DealActivity>) =>
        fetchApi<DealActivity>(`${CRM_BASE}/deals/${id}/activities`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    // Documents
    getDocuments: (id: string) => fetchApi<CrmDocument[]>(`${CRM_BASE}/deals/${id}/documents`),

    // Tasks
    getTasks: (id: string) => fetchApi<Task[]>(`${CRM_BASE}/deals/${id}/tasks`),

    // Notes
    getNotes: (id: string) => fetchApi<Note[]>(`${CRM_BASE}/deals/${id}/notes`),

    // Status (won/lost/archived/active)
    updateStatus: (id: string, data: { status: string; reason?: string; final_value?: number }) =>
        fetchApi<Deal>(`${CRM_BASE}/deals/${id}/status`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),
};

// =====================================================
// PIPELINES API
// =====================================================

export const pipelinesApi = {
    getAll: (includeStages = true) => {
        const params = new URLSearchParams();
        params.set('include_stages', String(includeStages));
        return fetchApi<DealPipeline[]>(`${CRM_BASE}/pipelines?${params}`);
    },

    getById: (id: string) => fetchApi<DealPipeline>(`${CRM_BASE}/pipelines/${id}`),

    create: (data: Partial<DealPipeline>) =>
        fetchApi<DealPipeline>(`${CRM_BASE}/pipelines`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    update: (id: string, data: Partial<DealPipeline>) =>
        fetchApi<DealPipeline>(`${CRM_BASE}/pipelines/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        }),

    delete: (id: string) =>
        fetchApi<void>(`${CRM_BASE}/pipelines/${id}`, {
            method: 'DELETE'
        }),

    clone: (id: string, newName: string) =>
        fetchApi<DealPipeline>(`${CRM_BASE}/pipelines/${id}/clone`, {
            method: 'POST',
            body: JSON.stringify({ pipeline_name: newName })
        }),

    getMetrics: (id: string) => fetchApi<PipelineMetrics>(`${CRM_BASE}/pipelines/${id}/metrics`),

    // Stages
    createStage: (pipelineId: string, data: Partial<DealStage>) =>
        fetchApi<DealStage>(`${CRM_BASE}/pipelines/${pipelineId}/stages`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    updateStage: (pipelineId: string, stageId: string, data: Partial<DealStage>) =>
        fetchApi<DealStage>(`${CRM_BASE}/pipelines/${pipelineId}/stages/${stageId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        }),

    deleteStage: (pipelineId: string, stageId: string) =>
        fetchApi<void>(`${CRM_BASE}/pipelines/${pipelineId}/stages/${stageId}`, {
            method: 'DELETE'
        }),

    reorderStages: (pipelineId: string, stageIds: string[]) =>
        fetchApi<DealStage[]>(`${CRM_BASE}/pipelines/${pipelineId}/stages/reorder`, {
            method: 'PUT',
            body: JSON.stringify({ stage_ids: stageIds })
        })
};

// =====================================================
// TASKS API
// =====================================================

export interface TaskFilters {
    page?: number;
    limit?: number;
    status?: TaskStatus;
    priority?: TaskPriority;
    assigned_to?: string;
    deal_id?: string;
    contact_id?: string;
    due_from?: string;
    due_to?: string;
    overdue?: boolean;
}

export const tasksApi = {
    getAll: (filters?: TaskFilters) => {
        const params = new URLSearchParams();
        if (filters?.page) params.set('page', String(filters.page));
        if (filters?.limit) params.set('limit', String(filters.limit));
        if (filters?.status) params.set('status', filters.status);
        if (filters?.priority) params.set('priority', filters.priority);
        if (filters?.assigned_to) params.set('assigned_to', filters.assigned_to);
        if (filters?.deal_id) params.set('deal_id', filters.deal_id);
        if (filters?.contact_id) params.set('contact_id', filters.contact_id);
        if (filters?.due_from) params.set('due_from', filters.due_from);
        if (filters?.due_to) params.set('due_to', filters.due_to);
        if (filters?.overdue) params.set('overdue', String(filters.overdue));

        return fetchApi<PaginatedResponse<Task>>(`${CRM_BASE}/tasks?${params}`);
    },

    getById: (id: string) => fetchApi<Task>(`${CRM_BASE}/tasks/${id}`),

    create: (data: Partial<Task>) =>
        fetchApi<Task>(`${CRM_BASE}/tasks`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    update: (id: string, data: Partial<Task>) =>
        fetchApi<Task>(`${CRM_BASE}/tasks/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        }),

    delete: (id: string) =>
        fetchApi<void>(`${CRM_BASE}/tasks/${id}`, {
            method: 'DELETE'
        }),

    complete: (id: string) =>
        fetchApi<Task>(`${CRM_BASE}/tasks/${id}/complete`, {
            method: 'PUT'
        }),

    getOverdue: () => fetchApi<Task[]>(`${CRM_BASE}/tasks/overdue`)
};

// =====================================================
// NOTES API
// =====================================================

export interface NoteFilters {
    entity_type?: 'deal' | 'contact' | 'company' | 'property';
    entity_id?: string;
    search?: string;
    pinned_only?: boolean;
}

export const notesApi = {
    getAll: (filters?: NoteFilters) => {
        const params = new URLSearchParams();
        if (filters?.entity_type) params.set('entity_type', filters.entity_type);
        if (filters?.entity_id) params.set('entity_id', filters.entity_id);
        if (filters?.search) params.set('search', filters.search);
        if (filters?.pinned_only) params.set('pinned_only', String(filters.pinned_only));

        return fetchApi<Note[]>(`${CRM_BASE}/notes?${params}`);
    },

    getById: (id: string) => fetchApi<Note>(`${CRM_BASE}/notes/${id}`),

    create: (data: Partial<Note>) =>
        fetchApi<Note>(`${CRM_BASE}/notes`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    update: (id: string, data: Partial<Note>) =>
        fetchApi<Note>(`${CRM_BASE}/notes/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        }),

    delete: (id: string) =>
        fetchApi<void>(`${CRM_BASE}/notes/${id}`, {
            method: 'DELETE'
        }),

    togglePin: (id: string) =>
        fetchApi<Note>(`${CRM_BASE}/notes/${id}/pin`, {
            method: 'PUT'
        })
};

// =====================================================
// DOCUMENTS API
// =====================================================

export interface DocumentFilters {
    entity_type?: 'deal' | 'contact' | 'company' | 'property';
    entity_id?: string;
    document_type?: DocumentType;
    is_signed?: boolean;
}

export const documentsApi = {
    getAll: (filters?: DocumentFilters) => {
        const params = new URLSearchParams();
        if (filters?.entity_type) params.set('entity_type', filters.entity_type);
        if (filters?.entity_id) params.set('entity_id', filters.entity_id);
        if (filters?.document_type) params.set('document_type', filters.document_type);
        if (filters?.is_signed !== undefined) params.set('is_signed', String(filters.is_signed));

        return fetchApi<CrmDocument[]>(`${CRM_BASE}/documents?${params}`);
    },

    getById: (id: string) => fetchApi<CrmDocument>(`${CRM_BASE}/documents/${id}`),

    upload: async (file: File, metadata: {
        entity_type: 'deal' | 'contact' | 'company' | 'property';
        entity_id: string;
        document_type: DocumentType;
        description?: string;
        tags?: string[];
    }) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('entity_type', metadata.entity_type);
        formData.append('entity_id', metadata.entity_id);
        formData.append('document_type', metadata.document_type);
        if (metadata.description) formData.append('description', metadata.description);
        if (metadata.tags) formData.append('tags', JSON.stringify(metadata.tags));

        const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';
        const { getSession } = await import('next-auth/react');
        const session = await getSession();
        const token = (session as any)?.accessToken;
        const authHeaders: Record<string, string> = {};
        if (token) authHeaders['Authorization'] = `Bearer ${token}`;
        const response = await fetch(`${API_BASE}${CRM_BASE}/documents`, {
            method: 'POST',
            body: formData,
            headers: authHeaders,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Upload failed' }));
            throw new Error(error.error || `HTTP ${response.status}`);
        }

        return response.json() as Promise<CrmDocument>;
    },

    delete: (id: string) =>
        fetchApi<void>(`${CRM_BASE}/documents/${id}`, {
            method: 'DELETE'
        }),

    getDownloadUrl: (id: string) =>
        fetchApi<{ url: string }>(`${CRM_BASE}/documents/${id}/download`),

    getVersions: (id: string) =>
        fetchApi<CrmDocument[]>(`${CRM_BASE}/documents/${id}/versions`)
};

// =====================================================
// SIGNATURES API
// =====================================================

export interface SignatureFilters {
    deal_id?: string;
    status?: SignatureStatus;
}

export const signaturesApi = {
    getAll: (filters?: SignatureFilters) => {
        const params = new URLSearchParams();
        if (filters?.deal_id) params.set('dealId', filters.deal_id);
        if (filters?.status) params.set('status', filters.status);

        return fetchApi<SignatureEnvelope[]>(`${CRM_BASE}/signatures?${params}`);
    },

    getById: (id: string) => fetchApi<SignatureEnvelope>(`${CRM_BASE}/signatures/${id}`),

    create: (data: {
        deal_id: string;
        document_id: string;
        envelope_title: string;
        signers: Array<{
            contact_id?: string;
            name: string;
            email: string;
            phone?: string;
            signing_order: number;
        }>;
        message?: string;
        expires_in_days?: number;
    }) =>
        fetchApi<SignatureEnvelope>(`${CRM_BASE}/signatures`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    send: (id: string) =>
        fetchApi<SignatureEnvelope>(`${CRM_BASE}/signatures/${id}/send`, {
            method: 'POST'
        }),

    void: (id: string, reason: string) =>
        fetchApi<SignatureEnvelope>(`${CRM_BASE}/signatures/${id}/void`, {
            method: 'POST',
            body: JSON.stringify({ reason })
        }),

    resend: (id: string, signerId: string) =>
        fetchApi<void>(`${CRM_BASE}/signatures/${id}/resend`, {
            method: 'POST',
            body: JSON.stringify({ signer_id: signerId })
        })
};

// =====================================================
// ANALYTICS API
// =====================================================

export const analyticsApi = {
    getDealMetrics: (filters?: {
        deal_type?: DealType;
        date_from?: string;
        date_to?: string;
    }) => {
        const params = new URLSearchParams();
        if (filters?.deal_type) params.set('deal_type', filters.deal_type);
        if (filters?.date_from) params.set('date_from', filters.date_from);
        if (filters?.date_to) params.set('date_to', filters.date_to);
        return fetchApi<DealMetrics>(`${CRM_BASE}/analytics/deals?${params}`);
    },

    getAgentPerformance: (filters?: {
        date_from?: string;
        date_to?: string;
    }) => {
        const params = new URLSearchParams();
        if (filters?.date_from) params.set('date_from', filters.date_from);
        if (filters?.date_to) params.set('date_to', filters.date_to);
        return fetchApi<any[]>(`${CRM_BASE}/analytics/agents?${params}`);
    },

    getRevenueForecast: () =>
        fetchApi<{
            current_month: number;
            next_month: number;
            quarter: number;
            by_stage: Array<{ stage_name: string; value: number; probability: number }>;
        }>(`${CRM_BASE}/analytics/revenue-forecast`),

    getPipelineAnalytics: (pipelineId: string) =>
        fetchApi<{
            stages: Array<{ stage_id: string; stage_name: string; position: number; deal_count: number; total_value: number }>;
            conversion: { won_deals: number; lost_deals: number; total_deals: number; won_value: number };
        }>(`${CRM_BASE}/analytics/pipeline?pipelineId=${pipelineId}`),

    getLeaderboard: (period?: string) =>
        fetchApi<{
            period: string;
            dateRange: { from: string; to: string };
            leaderboard: Array<{ user_id: string; user_name: string; deals_closed: number; total_value: number; deals_won: number }>;
        }>(`${CRM_BASE}/analytics/leaderboard?period=${period || 'month'}`),

    getRevenueTrend: (months?: number) =>
        fetchApi<{
            data: Array<{ period: string; period_label: string; won_value: number; lost_value: number; new_pipeline: number; deal_count: number; won_count: number; lost_count: number }>;
            total_won: number;
            total_lost: number;
            avg_monthly_won: number;
        }>(`${CRM_BASE}/analytics/revenue-trend?months=${months || 12}`),

    getDealVelocity: (pipelineId?: string) => {
        const params = new URLSearchParams();
        if (pipelineId) params.set('pipelineId', pipelineId);
        return fetchApi<{
            overall_avg_days: number;
            overall_median_days: number;
            by_stage: Array<{ stage_name: string; stage_color: string; avg_days: number; median_days: number; min_days: number; max_days: number; deal_count: number }>;
            by_deal_type: Array<{ deal_type: string; avg_days: number; deal_count: number }>;
            trend: Array<{ period: string; avg_days: number; deal_count: number }>;
        }>(`${CRM_BASE}/analytics/velocity?${params}`);
    },

    getLossReasons: (filters?: { date_from?: string; date_to?: string }) => {
        const params = new URLSearchParams();
        if (filters?.date_from) params.set('date_from', filters.date_from);
        if (filters?.date_to) params.set('date_to', filters.date_to);
        return fetchApi<{
            total_lost: number;
            total_lost_value: number;
            by_reason: Array<{ reason: string; count: number; total_value: number; percentage: number }>;
            by_stage: Array<{ stage_name: string; lost_count: number; lost_value: number }>;
            trend: Array<{ period: string; lost_count: number; lost_value: number }>;
        }>(`${CRM_BASE}/analytics/loss-reasons?${params}`);
    },

    getFunnel: (pipelineId: string) =>
        fetchApi<{
            pipeline_id: string;
            stages: Array<{ stage_id: string; stage_name: string; stage_color: string; position: number; deal_count: number; total_value: number; conversion_rate: number; cumulative_deals: number }>;
            overall_conversion: number;
        }>(`${CRM_BASE}/analytics/funnel?pipelineId=${pipelineId}`),

    getComparison: (period?: string) =>
        fetchApi<{
            current: { deals_created: number; deals_won: number; deals_lost: number; revenue_won: number; revenue_lost: number; pipeline_value: number; avg_deal_value: number; conversion_rate: number; avg_cycle_days: number; label: string };
            previous: { deals_created: number; deals_won: number; deals_lost: number; revenue_won: number; revenue_lost: number; pipeline_value: number; avg_deal_value: number; conversion_rate: number; avg_cycle_days: number; label: string };
            changes: Record<string, number>;
        }>(`${CRM_BASE}/analytics/comparison?period=${period || 'month'}`),

    getScheduledReports: () =>
        fetchApi<Array<{
            id: string; report_type: string; frequency: string; format: string;
            recipients: string[]; pipeline_id?: string; is_active: boolean;
            last_sent_at?: string; next_send_at?: string; created_at: string;
        }>>(`${CRM_BASE}/analytics/scheduled-reports`),

    createScheduledReport: (data: {
        report_type: string; frequency: string; format: string;
        recipients: string[]; pipeline_id?: string;
    }) => fetchApi<any>(`${CRM_BASE}/analytics/scheduled-reports`, {
        method: 'POST',
        body: JSON.stringify(data)
    }),

    deleteScheduledReport: (id: string) =>
        fetchApi<void>(`${CRM_BASE}/analytics/scheduled-reports/${id}`, { method: 'DELETE' }),

    exportData: (type: string, format: string, filters?: { date_from?: string; date_to?: string }) => {
        const params = new URLSearchParams({ type, format });
        if (filters?.date_from) params.set('date_from', filters.date_from);
        if (filters?.date_to) params.set('date_to', filters.date_to);
        return `${CRM_BASE}/analytics/export?${params}`;
    },
};

// =====================================================
// DOCUMENT TEMPLATES API
// =====================================================

export type DocumentTemplateCategory = 
    | 'offer_letter'
    | 'agreement'
    | 'contract'
    | 'receipt'
    | 'disclosure'
    | 'commission'
    | 'other';

export interface DocumentTemplate {
    id: string;
    organization_id?: string;
    name: string;
    template_name?: string;
    category: DocumentTemplateCategory;
    description?: string;
    template_description?: string;
    template_html?: string;
    template_pdf_url?: string;
    merge_fields?: any[];
    signature_fields?: any[];
    signer_roles?: any[];
    is_system_template?: boolean;
    is_shared?: boolean;
    status?: string;
    version: number;
    use_count?: number;
    last_used_at?: string;
    ghana_legal_requirements?: string;
    requires_stamp_duty?: boolean;
    requires_notarization?: boolean;
    requires_witness?: boolean;
    witness_count?: number;
    html_content?: string;
    css_styles?: string;
    header_html?: string;
    footer_html?: string;
    page_size?: string;
    page_orientation?: string;
    margin_top?: string;
    margin_bottom?: string;
    margin_left?: string;
    margin_right?: string;
    stamp_duty_rate?: number;
    notarization_instructions?: string;
    country_code?: string;
    is_active?: boolean;
    created_by?: string;
    created_at: string;
    updated_at: string;
}

export interface MergeField {
    id: string;
    field_key: string;
    field_label: string;
    field_group: string;
    field_type: string;
    description?: string;
    example_value?: string;
    is_required: boolean;
}

export interface GeneratedDocument {
    id: string;
    deal_id: string;
    template_id: string;
    template_name?: string;
    document_number?: string;
    file_name?: string;
    file_path?: string;
    file_url?: string;
    file_size?: number;
    mime_type?: string;
    status?: string;
    generation_status?: 'pending' | 'generating' | 'completed' | 'failed';
    merge_data?: Record<string, any>;
    esign_envelope_id?: string;
    signing_url?: string;
    signed_at?: string;
    signed_by?: string[];
    generated_at?: string;
    error_message?: string;
    created_by?: string;
    created_at: string;
    updated_at?: string;
}

export interface DocumentChecklistItem {
    id: string;
    deal_id: string;
    template_id: string;
    template_name: string;
    category: DocumentTemplateCategory;
    is_required: boolean;
    is_generated: boolean;
    is_signed: boolean;
    generated_document_id?: string;
    signed_document_id?: string;
    generated_at?: string;
    signed_at?: string;
}

export interface TemplateFilters {
    page?: number;
    limit?: number;
    search?: string;
    category?: DocumentTemplateCategory;
    country_code?: string;
    is_active?: boolean;
}

export const documentTemplatesApi = {
    getAll: (filters?: TemplateFilters) => {
        const params = new URLSearchParams();
        if (filters?.page) params.set('page', String(filters.page));
        if (filters?.limit) params.set('limit', String(filters.limit));
        if (filters?.search) params.set('search', filters.search);
        if (filters?.category) params.set('category', filters.category);
        if (filters?.country_code) params.set('country_code', filters.country_code);
        if (filters?.is_active !== undefined) params.set('is_active', String(filters.is_active));

        return fetchApi<{ templates: DocumentTemplate[]; total: number; page: number; limit: number }>(
            `${CRM_BASE}/document-templates?${params}`
        );
    },

    getById: (id: string) => fetchApi<DocumentTemplate>(`${CRM_BASE}/document-templates/${id}`),

    create: (data: Partial<DocumentTemplate>) =>
        fetchApi<DocumentTemplate>(`${CRM_BASE}/document-templates`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    update: (id: string, data: Partial<DocumentTemplate>) =>
        fetchApi<DocumentTemplate>(`${CRM_BASE}/document-templates/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        }),

    delete: (id: string) =>
        fetchApi<void>(`${CRM_BASE}/document-templates/${id}`, {
            method: 'DELETE'
        }),

    duplicate: (id: string) =>
        fetchApi<DocumentTemplate>(`${CRM_BASE}/document-templates/${id}/duplicate`, {
            method: 'POST'
        }),

    getCategories: () =>
        fetchApi<Array<{ category: DocumentTemplateCategory; count: number }>>(
            `${CRM_BASE}/document-templates/categories`
        ),

    getMergeFields: (grouped?: boolean) => {
        const params = new URLSearchParams();
        if (grouped) params.set('grouped', 'true');
        return fetchApi<MergeField[] | Record<string, MergeField[]>>(
            `${CRM_BASE}/document-templates/merge-fields?${params}`
        );
    },

    seedGhanaTemplates: () =>
        fetchApi<{ message: string; templates: DocumentTemplate[] }>(
            `${CRM_BASE}/document-templates/seed-ghana`,
            { method: 'POST' }
        ),

    // Stage document requirements
    getStageRequirements: (stageId: string) =>
        fetchApi<Array<{ id: string; template_id: string; template_name: string; category: string; is_required: boolean; signing_order: number }>>(
            `${CRM_BASE}/stages/${stageId}/document-requirements`
        ),

    setStageRequirements: (stageId: string, requirements: Array<{ template_id: string; is_required: boolean; signing_order: number }>) =>
        fetchApi<Array<{ id: string; template_id: string; is_required: boolean; signing_order: number }>>(
            `${CRM_BASE}/stages/${stageId}/document-requirements`,
            {
                method: 'POST',
                body: JSON.stringify({ requirements })
            }
        )
};

// =====================================================
// DOCUMENT GENERATION API
// =====================================================

export const documentGenerationApi = {
    generate: async (data: {
        template_id: string;
        deal_id: string;
        additional_data?: Record<string, any>;
        output_format?: 'pdf' | 'html';
    }): Promise<GeneratedDocument> => {
        const res = await fetchApi<{ document: GeneratedDocument }>(`${CRM_BASE}/documents/generate`, {
            method: 'POST',
            body: JSON.stringify({
                templateId: data.template_id,
                dealId: data.deal_id,
                customData: data.additional_data,
                outputFormat: data.output_format || 'html',
            })
        });
        return res.document;
    },

    preview: async (data: {
        template_id: string;
        deal_id: string;
        additional_data?: Record<string, any>;
    }): Promise<{ html: string; mergeData: Record<string, any> }> => {
        const res = await fetchApi<{ preview: { html: string; mergeData: Record<string, any> } }>(`${CRM_BASE}/documents/preview`, {
            method: 'POST',
            body: JSON.stringify({
                templateId: data.template_id,
                dealId: data.deal_id,
                customData: data.additional_data,
            })
        });
        return res.preview;
    },

    getById: (id: string) => fetchApi<GeneratedDocument>(`${CRM_BASE}/generated-documents/${id}`),

    getDownloadUrl: (id: string) =>
        fetchApi<{ url: string }>(`${CRM_BASE}/generated-documents/${id}/download`),

    delete: (id: string) =>
        fetchApi<void>(`${CRM_BASE}/generated-documents/${id}`, {
            method: 'DELETE'
        }),

    // Deal document checklist
    getDealChecklist: (dealId: string) =>
        fetchApi<DocumentChecklistItem[]>(`${CRM_BASE}/deals/${dealId}/document-checklist`),

    getDealDocuments: (dealId: string) =>
        fetchApi<GeneratedDocument[]>(`${CRM_BASE}/deals/${dealId}/generated-documents`)
};

// =====================================================
// PAYMENT CONFIGURATION
// =====================================================

import type { PaymentAccountConfig, BankListItem, ResolveAccountResult, CryptoWalletConfig, CryptoWalletSaveResult, SettlementCoin } from '@/lib/property-management-api';

export const crmPaymentConfigApi = {
    /** Get current payout account status */
    getAccount: () =>
        fetchApi<PaymentAccountConfig>(`${CRM_BASE}/payments/account`),

    /** Get list of supported banks */
    getBanks: () =>
        fetchApi<{ status: boolean; data: BankListItem[] }>(`${CRM_BASE}/payments/banks`),

    /** Verify a bank account number (name enquiry) */
    resolveAccount: (accountNumber: string, bankCode: string) =>
        fetchApi<ResolveAccountResult>(`${CRM_BASE}/payments/resolve-account`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountNumber, bankCode })
        }),

    /** Register or update payout account */
    registerAccount: (data: {
        bankCode: string;
        accountNumber: string;
        businessName: string;
        contactEmail?: string;
        contactPhone?: string;
    }) =>
        fetchApi<{ success: boolean; subaccountCode: string }>(`${CRM_BASE}/payments/register-account`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }),

    /** Get crypto wallet configuration */
    getCryptoWallet: () =>
        fetchApi<CryptoWalletConfig>(`${CRM_BASE}/payments/crypto-wallet`),

    /** Save/update crypto wallet + payout currency */
    saveCryptoWallet: (walletAddress: string, payoutCoin?: string, payoutChain?: string) =>
        fetchApi<CryptoWalletSaveResult>(`${CRM_BASE}/payments/crypto-wallet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress, payoutCoin, payoutChain })
        }),

    /** Get supported settlement/payout currencies */
    getSettlementCoins: () =>
        fetchApi<SettlementCoin[]>(`${CRM_BASE}/payments/settlement-coins`),

    /** List this org's deal payment transactions (refund surface). Admin-only. Requires migration 272. */
    listTransactions: (limit = 100) =>
        fetchApi<DealPaymentTransaction[]>(`${CRM_BASE}/payments/transactions?limit=${limit}`),

    /** Initiate a refund (full or partial) on a paid deal payment. Admin-only. Amount in pesewas. */
    refund: (reference: string, body?: { amount?: number; reason?: string }) =>
        fetchApi<{ status: string; refundReference?: string; refundedAmount?: number; message: string }>(
            `${CRM_BASE}/payments/${encodeURIComponent(reference)}/refund`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }
        ),
};

export interface DealPaymentTransaction {
    reference: string;
    paystack_reference: string | null;
    payment_type: string;
    gross_amount: number;      // pesewas
    principal_amount: number;  // pesewas
    currency: string;
    status: 'pending' | 'success' | 'failed' | 'refunded' | 'abandoned';
    refund_status: 'pending' | 'processing' | 'processed' | 'failed' | null;
    refunded_amount: number | null;
    refund_reference: string | null;
    refunded_at: string | null;
    payer_email: string | null;
    channel: string | null;
    created_at: string;
    verified_at: string | null;
}

// CRM AI API removed: the standalone CRM assistant popup was retired in favour of
// the Workspace panel's CRM-scoped "KOBBY AI" tab (backend: KobbyAIService 'crm'
// scope). The former /crm/ai/* endpoints (ask/suggestions/deal-score/next-actions)
// had no remaining callers and were deleted with the route.

// =====================================================
// EMAIL INTEGRATION API
// =====================================================

export interface EmailConnectionStatus {
    connected: boolean;
    email?: string;
    expires_at?: string;
    needsReauth?: boolean; // connected but the mailbox scope is missing/expired → reconnect
}

export interface CrmEmail {
    id: string;
    provider: string;
    message_id: string;
    thread_id?: string;
    from_address: string;
    to_addresses: string[];
    cc_addresses?: string[];
    subject: string;
    body_text?: string;
    body_html?: string;
    direction: 'inbound' | 'outbound';
    received_at: string;
    deal_id?: string;
    contact_id?: string;
    entity_type?: string;
    entity_id?: string;
    provider_message_id?: string; // provider's message id (Gmail id / Graph id) — for threaded replies
    is_read?: boolean;
    has_attachments?: boolean;
    open_count: number;
}

export interface EmailAttachmentRef { bucket: string; key: string; name: string; mimeType: string; size: number; }

export const emailsApi = {
    /** Get the OAuth URL for connecting an email provider */
    getAuthUrl: (provider: 'gmail' | 'outlook') =>
        fetchApi<{ url: string }>(`${CRM_BASE}/emails/auth/${provider}`),

    /** Get connection status for all providers */
    getStatus: () =>
        fetchApi<{ gmail: EmailConnectionStatus; outlook: EmailConnectionStatus }>(`${CRM_BASE}/emails/status`),

    /** Trigger email sync */
    sync: (provider: 'gmail' | 'outlook', maxResults?: number) =>
        fetchApi<{ synced: number }>(`${CRM_BASE}/emails/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, maxResults }),
        }),

    /** Fetch synced emails (filter by legacy deal/contact OR the polymorphic entity_type+entity_id) */
    list: (filters?: { deal_id?: string; contact_id?: string; entity_type?: string; entity_id?: string; provider?: string; search?: string; direction?: string; limit?: number; offset?: number }) =>
        fetchApi<{ emails: CrmEmail[]; total: number }>(`${CRM_BASE}/emails${filters ? '?' + new URLSearchParams(Object.entries(filters).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString() : ''}`),

    /** Send email via connected provider (optionally attach to any service entity, with attachments + threading) */
    send: (data: {
        provider: 'gmail' | 'outlook'; to: string[]; cc?: string[]; subject: string; body_html: string;
        deal_id?: string; contact_id?: string; entity_type?: string; entity_id?: string;
        attachments?: EmailAttachmentRef[]; in_reply_to?: string; thread_id?: string; reply_to_provider_id?: string;
    }) =>
        fetchApi<{ id: string; message_id: string }>(`${CRM_BASE}/emails/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),

    /** Upload a compose attachment (multipart) → returns a MinIO reference the send call embeds. */
    uploadAttachment: async (file: File): Promise<EmailAttachmentRef> => {
        const form = new FormData();
        form.append('file', file);
        const res = await authedFetch('/api/crm/emails/attachments', { method: 'POST', body: form });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Attachment upload failed');
        return res.json();
    },

    /** Link email to a deal (legacy CRM helper) */
    linkToDeal: (emailId: string, dealId: string) =>
        fetchApi<{ success: boolean }>(`${CRM_BASE}/emails/${emailId}/link-deal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deal_id: dealId }),
        }),

    /** Link email to any service entity (deal/contact/tenant/property/contractor/vendor/…) */
    linkToEntity: (emailId: string, entityType: string, entityId: string) =>
        fetchApi<{ success: boolean }>(`${CRM_BASE}/emails/${emailId}/link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entity_type: entityType, entity_id: entityId }),
        }),

    /** Disconnect a provider */
    disconnect: (provider: 'gmail' | 'outlook') =>
        fetchApi<{ success: boolean }>(`${CRM_BASE}/emails/disconnect/${provider}`, {
            method: 'POST',
        }),
};

// =====================================================
// =====================================================
// DRIP CAMPAIGNS API
// =====================================================

export interface DripCampaign {
    id: string;
    organization_id: string;
    name: string;
    description: string | null;
    trigger_type: string;
    is_active: boolean;
    enrollment_count: number;
    step_count?: number;
    active_enrollments?: number;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    steps?: DripCampaignStep[];
}

export interface DripStepVariant {
    id: string;
    step_id: string;
    label: string;
    subject: string;
    body: string;
    weight: number;
    is_active: boolean;
    created_at: string;
}

export interface DripCampaignStep {
    id: string;
    campaign_id: string;
    step_order: number;
    delay_days: number;
    subject: string;
    body: string;
    template_id: string | null;
    created_at: string;
    variants?: DripStepVariant[];
}

export interface DripEnrollment {
    id: string;
    campaign_id: string;
    contact_id: string;
    current_step: number;
    status: string;
    enrolled_at: string;
    last_step_at: string | null;
    completed_at: string | null;
    first_name?: string;
    last_name?: string;
    email?: string;
}

export const dripCampaignsApi = {
    getAll: () => fetchApi<DripCampaign[]>(`${CRM_BASE}/drip-campaigns`),

    getById: (id: string) => fetchApi<DripCampaign>(`${CRM_BASE}/drip-campaigns/${id}`),

    create: (data: { name: string; description?: string; trigger_type?: string }) =>
        fetchApi<DripCampaign>(`${CRM_BASE}/drip-campaigns`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    update: (id: string, data: Partial<Pick<DripCampaign, 'name' | 'description' | 'trigger_type' | 'is_active'>>) =>
        fetchApi<DripCampaign>(`${CRM_BASE}/drip-campaigns/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),

    delete: (id: string) =>
        fetchApi<void>(`${CRM_BASE}/drip-campaigns/${id}`, { method: 'DELETE' }),

    addStep: (campaignId: string, data: { step_order?: number; delay_days?: number; subject: string; body: string; template_id?: string }) =>
        fetchApi<DripCampaignStep>(`${CRM_BASE}/drip-campaigns/${campaignId}/steps`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    deleteStep: (campaignId: string, stepId: string) =>
        fetchApi<void>(`${CRM_BASE}/drip-campaigns/${campaignId}/steps/${stepId}`, { method: 'DELETE' }),

    addVariant: (campaignId: string, stepId: string, data: { label?: string; subject: string; body: string; weight?: number }) =>
        fetchApi<DripStepVariant>(`${CRM_BASE}/drip-campaigns/${campaignId}/steps/${stepId}/variants`, {
            method: 'POST', body: JSON.stringify(data),
        }),

    deleteVariant: (campaignId: string, stepId: string, variantId: string) =>
        fetchApi<void>(`${CRM_BASE}/drip-campaigns/${campaignId}/steps/${stepId}/variants/${variantId}`, { method: 'DELETE' }),

    enroll: (campaignId: string, contact_ids: string[]) =>
        fetchApi<{ enrolled: number }>(`${CRM_BASE}/drip-campaigns/${campaignId}/enroll`, {
            method: 'POST',
            body: JSON.stringify({ contact_ids }),
        }),

    getEnrollments: (campaignId: string) =>
        fetchApi<DripEnrollment[]>(`${CRM_BASE}/drip-campaigns/${campaignId}/enrollments`),

    /** Delivery log from the execution engine (sent/failed per step). Requires migration 271. */
    getSends: (campaignId: string) =>
        fetchApi<DripStepSend[]>(`${CRM_BASE}/drip-campaigns/${campaignId}/sends`),
};

export interface DripStepSend {
    id: string;
    enrollment_id: string;
    step_id: string;
    status: 'sending' | 'sent' | 'failed';
    attempts: number;
    error: string | null;
    sent_at: string | null;
    created_at: string;
    opened_at: string | null;
    open_count: number;
    first_clicked_at: string | null;
    click_count: number;
    variant_id: string | null;
    subject: string;
    step_order: number;
    first_name?: string;
    last_name?: string;
    email?: string;
}

// ── Campaign audience segments ────────────────────────
export interface SegmentFilter {
    lead_status?: string[];
    contact_type?: string[];
    region?: string[];
    lead_source?: string[];
    city?: string;
    assigned_agent?: string;
    tags?: string[];
    search?: string;
}

export interface CampaignSegment {
    id: string;
    organization_id: string;
    name: string;
    description: string | null;
    filter: SegmentFilter;
    created_at: string;
    updated_at: string;
}

export const segmentsApi = {
    getAll: () => fetchApi<CampaignSegment[]>(`${CRM_BASE}/segments`),
    create: (data: { name: string; description?: string; filter?: SegmentFilter }) =>
        fetchApi<CampaignSegment>(`${CRM_BASE}/segments`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
        }),
    delete: (id: string) => fetchApi<void>(`${CRM_BASE}/segments/${id}`, { method: 'DELETE' }),
    preview: (filter: SegmentFilter) =>
        fetchApi<{ count: number; sample: { id: string; first_name: string; last_name: string; email: string | null }[] }>(
            `${CRM_BASE}/segments/preview`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filter }) }
        ),
    enroll: (segmentId: string, campaignId: string) =>
        fetchApi<{ enrolled: number; matched: number }>(`${CRM_BASE}/segments/${segmentId}/enroll`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaignId }),
        }),
};

// =====================================================
// AGENT TERRITORIES API
// =====================================================

export interface AgentTerritory {
    id: string;
    organization_id: string;
    agent_id: string;
    agent_name?: string | null;
    name: string;
    description: string | null;
    boundary: GeoJSON.Geometry;   // MultiPolygon
    is_exclusive: boolean;
    priority: number;
    color: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    overlaps?: { id: string; name: string; agent_id: string }[];
}

export interface TerritoryInput {
    agentId: string;
    name: string;
    description?: string;
    boundary: GeoJSON.Geometry;   // Polygon or MultiPolygon
    isExclusive?: boolean;
    priority?: number;
    color?: string;
    allowOverlap?: boolean;
}

export const territoriesApi = {
    getAll: () => fetchApi<AgentTerritory[]>(`${CRM_BASE}/territories`),
    getById: (id: string) => fetchApi<AgentTerritory>(`${CRM_BASE}/territories/${id}`),
    create: (data: TerritoryInput) =>
        fetchApi<AgentTerritory>(`${CRM_BASE}/territories`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
        }),
    update: (id: string, data: Partial<TerritoryInput> & { isActive?: boolean }) =>
        fetchApi<AgentTerritory>(`${CRM_BASE}/territories/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
        }),
    delete: (id: string) =>
        fetchApi<void>(`${CRM_BASE}/territories/${id}`, { method: 'DELETE' }),
    /** Resolve owning agent for a point, or auto-assign a contact by its geocoded location. */
    resolve: (body: { lng?: number; lat?: number; contactId?: string }) =>
        fetchApi<{ owner?: { agent_id: string; territory_id: string; name: string } | null; assigned?: { agent_id: string; territory_id: string } | null }>(
            `${CRM_BASE}/territories/resolve`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        ),
};

// =====================================================
// DEAL INSPECTIONS API (CRM surface over the shared inspection engine)
// =====================================================

import type { PropertyInspection, InspectionItem } from './property-management-api';
export type { PropertyInspection, InspectionItem } from './property-management-api';

export const dealInspectionsApi = {
    getForDeal: (dealId: string) => fetchApi<PropertyInspection[]>(`${CRM_BASE}/deals/${dealId}/inspections`),
    create: (dealId: string, data: { inspectionType?: string; scheduledFor?: string; summary?: string; propertyId?: string }) =>
        fetchApi<PropertyInspection>(`${CRM_BASE}/deals/${dealId}/inspections`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
        }),
    getById: (id: string) => fetchApi<PropertyInspection>(`${CRM_BASE}/inspections/${id}`),
    addItem: (id: string, data: { area: string; item: string; condition?: string; notes?: string }) =>
        fetchApi<InspectionItem>(`${CRM_BASE}/inspections/${id}/items`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
        }),
    deleteItem: (itemId: string) => fetchApi<void>(`${CRM_BASE}/inspections/items/${itemId}`, { method: 'DELETE' }),
    complete: (id: string, data: { overallCondition?: string; summary?: string }) =>
        fetchApi<PropertyInspection>(`${CRM_BASE}/inspections/${id}/complete`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
        }),
    remove: (id: string) => fetchApi<void>(`${CRM_BASE}/inspections/${id}`, { method: 'DELETE' }),
};

// COMBINED CRM API EXPORT
// =====================================================

export const crmApi = {
    contacts: contactsApi,
    companies: companiesApi,
    deals: dealsApi,
    pipelines: pipelinesApi,
    tasks: tasksApi,
    notes: notesApi,
    documents: documentsApi,
    signatures: signaturesApi,
    analytics: analyticsApi,
    documentTemplates: documentTemplatesApi,
    documentGeneration: documentGenerationApi,
    emails: emailsApi,
    dripCampaigns: dripCampaignsApi,
    territories: territoriesApi,
    segments: segmentsApi,
    dealInspections: dealInspectionsApi,
};

export default crmApi;
