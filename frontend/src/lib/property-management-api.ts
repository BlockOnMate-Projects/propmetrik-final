
import { fetchApi } from './api';
import {
    PaginatedResponse,
    Tenant,
    Tenancy,
    WorkOrder,
    Vendor,
    PropertyDocument,
    PropertyDocumentType,
    FinancialRecord,
    TenantStatus,
    TenancyStatus,
    WorkOrderStatus,
    MaintenanceCategory,
    VendorStatus,
    PortfolioMetrics,
    PortfolioValue,
    PortfolioComposition,
    LeasePortfolioSummary,
    PortfolioFxMeta,
    Property,
    VaultDocument,
    VaultSummary
} from '@/types/property-management';

const PM_BASE = '/pm';

// Generated lease document response
export interface GeneratedLeaseDocument {
    tenantId: string;
    tenancyId: string;
    documentId: string;
    documentKey: string;
    documentUrl: string;
    filename: string;
    signers: Array<{ name: string; email: string; role: string; order?: number }>;
}

export const propertyManagementApi = {
    // =====================================================
    // PROPERTIES
    // =====================================================
    getProperties: (params?: {
        page?: number;
        limit?: number;
        searchTerm?: string;
        region?: string;
        status?: string;
    }) => {
        const query = new URLSearchParams();
        if (params?.page) query.append('page', String(params.page));
        if (params?.limit) query.append('limit', String(params.limit));
        if (params?.searchTerm) query.append('searchTerm', params.searchTerm);
        if (params?.region) query.append('region', params.region);
        if (params?.status) query.append('status', params.status);

        return fetchApi<Property[] | PaginatedResponse<Property>>(`${PM_BASE}/properties?${query.toString()}`);
    },

    getPropertyById: (id: string) => fetchApi<Property>(`${PM_BASE}/properties/${id}`),

    // Live GHS conversion rates (USD/EUR/GBP -> GHS) for client-side aggregates.
    getFxRates: () => fetchApi<PortfolioFxMeta>(`${PM_BASE}/fx/rates`),

    getPropertyUnits: (id: string) => fetchApi<Property[]>(`${PM_BASE}/properties/${id}/units`),

    createProperty: (data: Partial<Property>) =>
        fetchApi<Property>(`${PM_BASE}/properties`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    updateProperty: (id: string, data: Partial<Property>) =>
        fetchApi<Property>(`${PM_BASE}/properties/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        }),

    deleteProperty: (id: string) =>
        fetchApi<void>(`${PM_BASE}/properties/${id}`, {
            method: 'DELETE'
        }),


    // =====================================================
    // VENDORS
    // =====================================================
    getVendors: (params?: {
        page?: number;
        limit?: number;
        search?: string;
        category?: MaintenanceCategory;
        status?: VendorStatus;
    }) => {
        const query = new URLSearchParams();
        if (params?.page) query.append('page', String(params.page));
        if (params?.limit) query.append('limit', String(params.limit));
        if (params?.search) query.append('search', params.search);
        if (params?.category) query.append('category', params.category);
        if (params?.status) query.append('status', params.status);

        return fetchApi<PaginatedResponse<Vendor>>(`${PM_BASE}/vendors?${query.toString()}`);
    },

    getVendorById: (id: string) => fetchApi<Vendor>(`${PM_BASE}/vendors/${id}`),

    createVendor: (data: Partial<Vendor>) =>
        fetchApi<Vendor>(`${PM_BASE}/vendors`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    updateVendor: (id: string, data: Partial<Vendor>) =>
        fetchApi<Vendor>(`${PM_BASE}/vendors/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        }),

    deleteVendor: (id: string) =>
        fetchApi<void>(`${PM_BASE}/vendors/${id}`, {
            method: 'DELETE'
        }),

    // =====================================================
    // TENANTS
    // =====================================================
    getTenants: (params?: {
        page?: number;
        limit?: number;
        search?: string;
        status?: TenantStatus;
    }) => {
        const query = new URLSearchParams();
        if (params?.page) query.append('page', String(params.page));
        if (params?.limit) query.append('limit', String(params.limit));
        if (params?.search) query.append('search', params.search);
        if (params?.status) query.append('status', params.status);

        return fetchApi<PaginatedResponse<Tenant>>(`${PM_BASE}/tenants?${query.toString()}`);
    },

    getTenantById: (id: string) => fetchApi<Tenant>(`${PM_BASE}/tenants/${id}`),

    createTenant: (data: Partial<Tenant>) =>
        fetchApi<Tenant>(`${PM_BASE}/tenants`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    deleteTenant: (id: string) =>
        fetchApi<void>(`${PM_BASE}/tenants/${id}`, { method: 'DELETE' }),

    inviteTenantPortal: (tenantId: string, redirectUri?: string) =>
        fetchApi<{
            success: boolean;
            message: string;
            tenantId: string;
            keycloakUserId: string;
            portalAccessStatus: string;
            onboardingUrl: string;
            inviteExpiresAt: string;
            emailSent: boolean;
            emailError?: string;
        }>(`${PM_BASE}/tenants/${tenantId}/portal-invite`, {
            method: 'POST',
            body: JSON.stringify({ redirectUri })
        }),

    // =====================================================
    // LEASES / TENANCIES
    // =====================================================
    getTenancies: (params?: {
        page?: number;
        limit?: number;
        status?: TenancyStatus;
        propertyId?: string;
        tenantId?: string;
    }) => {
        const query = new URLSearchParams();
        if (params?.page) query.append('page', String(params.page));
        if (params?.limit) query.append('limit', String(params.limit));
        if (params?.status) query.append('status', params.status);
        if (params?.propertyId) query.append('propertyId', params.propertyId);
        if (params?.tenantId) query.append('tenantId', params.tenantId);

        return fetchApi<PaginatedResponse<Tenancy>>(`${PM_BASE}/tenancies?${query.toString()}`);
    },

    getTenancyById: (id: string) => fetchApi<Tenancy>(`${PM_BASE}/tenancies/${id}`),

    createTenancy: (data: Partial<Tenancy>) =>
        fetchApi<Tenancy>(`${PM_BASE}/tenancies`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    updateTenancy: (id: string, data: Partial<Tenancy>) =>
        fetchApi<Tenancy>(`${PM_BASE}/tenancies/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        }),

    terminateTenancy: (id: string, terminationDate: string, reason?: string) =>
        fetchApi<Tenancy>(`${PM_BASE}/tenancies/${id}/terminate`, {
            method: 'POST',
            body: JSON.stringify({ terminationDate, reason })
        }),

    renewTenancy: (id: string, newEndDate: string, newMonthlyRent?: number) =>
        fetchApi<Tenancy>(`${PM_BASE}/tenancies/${id}/renew`, {
            method: 'POST',
            body: JSON.stringify({ newEndDate, newMonthlyRent })
        }),

    deleteTenancy: (id: string) =>
        fetchApi<void>(`${PM_BASE}/tenancies/${id}`, {
            method: 'DELETE'
        }),

    // =====================================================
    // WORK ORDERS
    // =====================================================
    getWorkOrders: (params?: {
        page?: number;
        limit?: number;
        status?: WorkOrderStatus;
        category?: MaintenanceCategory;
        priority?: string;
        propertyId?: string;
    }) => {
        const query = new URLSearchParams();
        if (params?.page) query.append('page', String(params.page));
        if (params?.limit) query.append('limit', String(params.limit));
        if (params?.status) query.append('status', params.status);
        if (params?.category) query.append('category', params.category);
        if (params?.priority) query.append('priority', params.priority);
        if (params?.propertyId) query.append('propertyId', params.propertyId);

        return fetchApi<PaginatedResponse<WorkOrder>>(`${PM_BASE}/work-orders?${query.toString()}`);
    },

    getWorkOrderById: (id: string) => fetchApi<WorkOrder>(`${PM_BASE}/work-orders/${id}`),

    createWorkOrder: (data: Partial<WorkOrder>) =>
        fetchApi<WorkOrder>(`${PM_BASE}/work-orders`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    updateWorkOrder: (id: string, data: Partial<WorkOrder>) =>
        fetchApi<WorkOrder>(`${PM_BASE}/work-orders/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        }),

    assignWorkOrder: (
        id: string,
        vendorId: string,
        schedule?: { scheduledDate?: string; scheduledTimeStart?: string; scheduledTimeEnd?: string }
    ) =>
        fetchApi<WorkOrder>(`${PM_BASE}/work-orders/${id}/assign`, {
            method: 'POST',
            body: JSON.stringify({ vendorId, ...schedule })
        }),

    completeWorkOrder: (id: string, data: { actualCost: number; completionNotes: string }) =>
        fetchApi<WorkOrder>(`${PM_BASE}/work-orders/${id}/complete`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    getWorkOrderStats: () => fetchApi<{
        total: number;
        byStatus: Record<string, number>;
        urgentPending: number;
        totalCosts: number;
        avgResolutionDays: number;
        byCategory: Record<string, number>;
    }>(`${PM_BASE}/work-orders-stats`),

    // =====================================================
    // DOCUMENTS
    // =====================================================
    getDocuments: (params?: {
        page?: number;
        limit?: number;
        propertyId?: string;
        type?: string;
        search?: string;
    }) => {
        const query = new URLSearchParams();
        if (params?.page) query.append('page', String(params.page));
        if (params?.limit) query.append('limit', String(params.limit));
        if (params?.propertyId) query.append('propertyId', params.propertyId);
        if (params?.type) query.append('type', params.type);
        if (params?.search) query.append('search', params.search);

        return fetchApi<PaginatedResponse<PropertyDocument>>(`${PM_BASE}/documents?${query.toString()}`);
    },

    /** Unified document vault: all sources (uploads + leases + signed leases) */
    getVaultDocuments: (params?: {
        page?: number;
        limit?: number;
        search?: string;
        source?: 'upload' | 'lease' | 'signed_lease' | 'all';
        category?: 'legal' | 'financial' | 'tenant' | 'all';
        propertyId?: string;
        tenancyId?: string;
    }) => {
        const query = new URLSearchParams();
        if (params?.page) query.append('page', String(params.page));
        if (params?.limit) query.append('limit', String(params.limit));
        if (params?.search) query.append('search', params.search);
        if (params?.source) query.append('source', params.source);
        if (params?.category) query.append('category', params.category);
        if (params?.propertyId) query.append('propertyId', params.propertyId);
        if (params?.tenancyId) query.append('tenancyId', params.tenancyId);

        return fetchApi<{
            data: VaultDocument[];
            total: number;
            page: number;
            limit: number;
            totalPages: number;
            summary: VaultSummary;
        }>(`${PM_BASE}/documents/vault?${query.toString()}`);
    },

    createDocument: (data: Partial<PropertyDocument>) =>
        fetchApi<PropertyDocument>(`${PM_BASE}/documents`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    uploadDocument: (data: {
        file: File;
        propertyId: string;
        tenancyId?: string;
        documentType: PropertyDocumentType;
        title?: string;
        description?: string;
    }) => {
        const formData = new FormData();
        formData.append('file', data.file);
        formData.append('propertyId', data.propertyId);
        if (data.tenancyId) formData.append('tenancyId', data.tenancyId);
        formData.append('documentType', data.documentType);
        if (data.title) formData.append('title', data.title);
        if (data.description) formData.append('description', data.description);

        return fetchApi<PropertyDocument>(`${PM_BASE}/documents/upload`, {
            method: 'POST',
            body: formData
        });
    },

    uploadPropertyPhoto: (propertyId: string, file: File, title?: string) => {
        const formData = new FormData();
        formData.append('file', file);
        if (title) formData.append('title', title);

        return fetchApi<PropertyDocument>(`${PM_BASE}/properties/${propertyId}/photos`, {
            method: 'POST',
            body: formData
        });
    },

    deleteDocument: (id: string) =>
        fetchApi<void>(`${PM_BASE}/documents/${id}`, {
            method: 'DELETE'
        }),

    // =====================================================
    // FINANCIALS
    // =====================================================
    getFinancials: (params?: {
        page?: number;
        limit?: number;
        propertyId?: string;
        recordType?: 'income' | 'expense';
        dateFrom?: string;
        dateTo?: string;
    }) => {
        const query = new URLSearchParams();
        if (params?.page) query.append('page', String(params.page));
        if (params?.limit) query.append('limit', String(params.limit));
        if (params?.propertyId) query.append('propertyId', params.propertyId);
        if (params?.recordType) query.append('recordType', params.recordType);
        if (params?.dateFrom) query.append('dateFrom', params.dateFrom);
        if (params?.dateTo) query.append('dateTo', params.dateTo);

        return fetchApi<PaginatedResponse<FinancialRecord>>(`${PM_BASE}/financials?${query.toString()}`);
    },

    // Create a financial record
    createFinancial: (data: Partial<FinancialRecord>): Promise<FinancialRecord> => {
        return fetchApi<FinancialRecord>(`${PM_BASE}/financials`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    getROI: (propertyId: string) => fetchApi<any>(`${PM_BASE}/financials/roi/${propertyId}`),

    getCashFlow: (params?: { propertyId?: string; startDate?: string; endDate?: string }) => {
        const query = new URLSearchParams();
        if (params?.propertyId) query.append('propertyId', params.propertyId);
        if (params?.startDate) query.append('startDate', params.startDate);
        if (params?.endDate) query.append('endDate', params.endDate);
        return fetchApi<any>(`${PM_BASE}/financials/cash-flow?${query.toString()}`);
    },

    // =====================================================
    // ADVANCED FINANCIAL ANALYTICS
    // =====================================================
    getNOI: (propertyId: string) =>
        fetchApi<{
            propertyId: string; period: string; grossPotentialRent: number; vacancyLoss: number;
            effectiveGrossIncome: number; otherIncome: number; totalOperatingIncome: number;
            operatingExpenses: Record<string, number>; netOperatingIncome: number; noiMargin: number;
        }>(`${PM_BASE}/financials/noi/${propertyId}`),

    getCapRate: (propertyId: string) =>
        fetchApi<{
            propertyId: string; marketValue: number; annualNOI: number; capRate: number;
            impliedValue: number; marketCapRate: number; valueSpread: number; recommendation: string;
        }>(`${PM_BASE}/financials/cap-rate/${propertyId}`),

    getIRR: (propertyId: string) =>
        fetchApi<{
            propertyId: string; initialInvestment: number; holdingPeriodYears: number;
            annualCashFlows: number[]; terminalValue: number; irr: number; npv: number;
            paybackPeriodYears: number; profitabilityIndex: number;
        }>(`${PM_BASE}/financials/irr/${propertyId}`),

    getDSCR: (propertyId: string, annualDebtService?: number) => {
        const query = new URLSearchParams();
        if (annualDebtService) query.append('annualDebtService', String(annualDebtService));
        return fetchApi<{
            propertyId: string; netOperatingIncome: number; annualDebtService: number;
            dscr: number; breakEvenRatio: number; debtYield: number;
            rating: string; interpretation: string;
        }>(`${PM_BASE}/financials/dscr/${propertyId}?${query.toString()}`);
    },

    getFinancialSummary: (propertyId: string) =>
        fetchApi<{
            propertyId: string; propertyName: string; currency: string; asOfDate: string;
            noi: { netOperatingIncome: number; noiMargin: number; effectiveGrossIncome: number };
            capRate: { capRate: number; marketCapRate: number; recommendation: string };
            cashFlow: { totalIncome: number; totalExpenses: number; netCashFlow: number };
            occupancy: { rate: number; occupiedUnits: number; totalUnits: number };
            irr?: { irr: number; npv: number; paybackPeriodYears: number };
        }>(`${PM_BASE}/financials/summary/${propertyId}`),

    getPortfolioFinancialSummary: () =>
        fetchApi<{
            totalProperties: number; totalValue: number; portfolioNOI: number;
            weightedCapRate: number; averageOccupancy: number; totalMonthlyIncome: number;
            totalMonthlyExpenses: number; netMonthlyCashFlow: number;
            properties: Array<{
                propertyId: string; propertyName: string; noi: number;
                capRate: number; occupancy: number; value: number;
            }>;
        }>(`${PM_BASE}/financials/portfolio-summary`),

    // =====================================================
    // PORTFOLIO ANALYTICS
    // =====================================================
    getPortfolioOverview: () => fetchApi<PortfolioMetrics>(`${PM_BASE}/portfolio/overview`),
    getPortfolioValue: () => fetchApi<PortfolioValue>(`${PM_BASE}/portfolio/value`),
    getPortfolioComposition: () => fetchApi<PortfolioComposition>(`${PM_BASE}/portfolio/composition`),
    getLeasePortfolioSummary: () => fetchApi<LeasePortfolioSummary>(`${PM_BASE}/portfolio/leases`),

    // =====================================================
    // AUDIT TRAIL
    // =====================================================
    getAuditLogs: (params?: {
        page?: number;
        limit?: number;
        action?: string;
        resource?: string;
        resourceId?: string;
        userId?: string;
        startDate?: string;
        endDate?: string;
    }) => {
        const query = new URLSearchParams();
        if (params?.page) query.append('page', String(params.page));
        if (params?.limit) query.append('limit', String(params.limit));
        if (params?.action) query.append('action', params.action);
        if (params?.resource) query.append('resource', params.resource);
        if (params?.resourceId) query.append('resourceId', params.resourceId);
        if (params?.userId) query.append('userId', params.userId);
        if (params?.startDate) query.append('startDate', params.startDate);
        if (params?.endDate) query.append('endDate', params.endDate);
        return fetchApi<any>(`${PM_BASE}/audit?${query.toString()}`);
    },

    getAuditSummary: (days: number = 30) =>
        fetchApi<any>(`${PM_BASE}/audit/summary?days=${days}`),

    getResourceHistory: (resource: string, resourceId: string) =>
        fetchApi<any>(`${PM_BASE}/audit/resource/${resource}/${resourceId}`),

    // =====================================================
    // ENTERPRISE REPORTS
    // =====================================================
    getAgedReceivablesReport: (params?: { asOfDate?: string; agingBuckets?: string }) => {
        const query = new URLSearchParams();
        if (params?.asOfDate) query.append('asOfDate', params.asOfDate);
        if (params?.agingBuckets) query.append('agingBuckets', params.agingBuckets);
        return fetchApi<any>(`${PM_BASE}/reports/aged-receivables?${query.toString()}`);
    },

    getVacancyReport: (params?: { includeInactive?: boolean }) => {
        const query = new URLSearchParams();
        if (params?.includeInactive) query.append('includeInactive', 'true');
        return fetchApi<any>(`${PM_BASE}/reports/vacancy?${query.toString()}`);
    },

    getPropertyPerformanceReport: (params?: { startDate?: string; endDate?: string; propertyIds?: string[] }) => {
        const query = new URLSearchParams();
        if (params?.startDate) query.append('startDate', params.startDate);
        if (params?.endDate) query.append('endDate', params.endDate);
        if (params?.propertyIds?.length) query.append('propertyIds', params.propertyIds.join(','));
        return fetchApi<any>(`${PM_BASE}/reports/property-performance?${query.toString()}`);
    },

    getTenantTurnoverReport: (params?: { startDate?: string; endDate?: string }) => {
        const query = new URLSearchParams();
        if (params?.startDate) query.append('startDate', params.startDate);
        if (params?.endDate) query.append('endDate', params.endDate);
        return fetchApi<any>(`${PM_BASE}/reports/tenant-turnover?${query.toString()}`);
    },

    getMaintenanceAnalyticsReport: (params?: { startDate?: string; endDate?: string }) => {
        const query = new URLSearchParams();
        if (params?.startDate) query.append('startDate', params.startDate);
        if (params?.endDate) query.append('endDate', params.endDate);
        return fetchApi<any>(`${PM_BASE}/reports/maintenance-analytics?${query.toString()}`);
    },

    // =====================================================
    // NOTIFICATIONS
    // =====================================================
    sendRentReminders: (daysUntilDue?: number) => {
        const query = new URLSearchParams();
        if (daysUntilDue) query.append('daysUntilDue', String(daysUntilDue));
        return fetchApi<any>(`${PM_BASE}/notifications/rent-reminders?${query.toString()}`, {
            method: 'POST'
        });
    },

    sendLeaseExpiryNotifications: (daysBeforeExpiry?: number) => {
        const query = new URLSearchParams();
        if (daysBeforeExpiry) query.append('daysBeforeExpiry', String(daysBeforeExpiry));
        return fetchApi<any>(`${PM_BASE}/notifications/lease-expiry?${query.toString()}`, {
            method: 'POST'
        });
    },

    // =====================================================
    // BULK OPERATIONS
    // =====================================================
    bulkRentIncrease: (data: {
        propertyIds?: string[];
        percentage?: number;
        fixedAmount?: number;
        effectiveDate: string;
    }) =>
        fetchApi<any>(`${PM_BASE}/bulk/rent-increase`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    bulkCreateWorkOrders: (workOrders: Array<{
        propertyId: string;
        title: string;
        description?: string;
        category: string;
        priority: string;
    }>) =>
        fetchApi<any>(`${PM_BASE}/bulk/work-orders`, {
            method: 'POST',
            body: JSON.stringify({ workOrders })
        }),

    bulkExport: (resource: string, format: 'csv' | 'json' | 'excel' = 'csv', filters?: Record<string, any>) => {
        const query = new URLSearchParams({ resource, format });
        if (filters) query.append('filters', JSON.stringify(filters));
        return fetchApi<any>(`${PM_BASE}/bulk/export?${query.toString()}`);
    },

    bulkImport: (resource: string, data: any[]) =>
        fetchApi<any>(`${PM_BASE}/bulk/import`, {
            method: 'POST',
            body: JSON.stringify({ resource, data })
        }),

    // =====================================================
    // APPLICATIONS
    // =====================================================
    getApplications: (params?: {
        page?: number;
        limit?: number;
        search?: string;
        status?: ApplicationStatus | ApplicationStatus[];
        propertyId?: string;
        applicantEmail?: string;
        submittedAfter?: string;
        submittedBefore?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
    }) => {
        const query = new URLSearchParams();
        if (params?.page) query.append('page', String(params.page));
        if (params?.limit) query.append('limit', String(params.limit));
        if (params?.search) query.append('search', params.search);
        if (params?.status) {
            if (Array.isArray(params.status)) {
                params.status.forEach(s => query.append('status', s));
            } else {
                query.append('status', params.status);
            }
        }
        if (params?.propertyId) query.append('propertyId', params.propertyId);
        if (params?.applicantEmail) query.append('applicantEmail', params.applicantEmail);
        if (params?.submittedAfter) query.append('submittedAfter', params.submittedAfter);
        if (params?.submittedBefore) query.append('submittedBefore', params.submittedBefore);
        if (params?.sortBy) query.append('sortBy', params.sortBy);
        if (params?.sortOrder) query.append('sortOrder', params.sortOrder);

        return fetchApi<PaginatedResponse<Application>>(`${PM_BASE}/applications?${query.toString()}`);
    },

    getApplicationById: (id: string) => fetchApi<Application>(`${PM_BASE}/applications/${id}`),

    getApplicationStats: () => fetchApi<ApplicationStats>(`${PM_BASE}/applications/stats`),

    getApplicationHistory: (id: string) => fetchApi<ApplicationStatusChange[]>(`${PM_BASE}/applications/${id}/history`),

    createApplication: (data: CreateApplicationDto) =>
        fetchApi<Application>(`${PM_BASE}/applications`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    updateApplication: (id: string, data: Partial<CreateApplicationDto>) =>
        fetchApi<Application>(`${PM_BASE}/applications/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        }),

    deleteApplication: (id: string) =>
        fetchApi<void>(`${PM_BASE}/applications/${id}`, {
            method: 'DELETE'
        }),

    submitApplication: (id: string) =>
        fetchApi<Application>(`${PM_BASE}/applications/${id}/submit`, {
            method: 'POST'
        }),

    startReviewApplication: (id: string) =>
        fetchApi<Application>(`${PM_BASE}/applications/${id}/start-review`, {
            method: 'POST'
        }),

    approveApplication: (id: string, notes?: string) =>
        fetchApi<Application>(`${PM_BASE}/applications/${id}/approve`, {
            method: 'POST',
            body: JSON.stringify({ notes })
        }),

    rejectApplication: (id: string, reason: string) =>
        fetchApi<Application>(`${PM_BASE}/applications/${id}/reject`, {
            method: 'POST',
            body: JSON.stringify({ reason })
        }),

    withdrawApplication: (id: string) =>
        fetchApi<Application>(`${PM_BASE}/applications/${id}/withdraw`, {
            method: 'POST'
        }),

    sendLease: (id: string, leaseData?: {
        templateId?: string;
        startDate?: string;
        endDate?: string;
        monthlyRent?: number;
        securityDeposit?: number;
        advanceMonths?: number;
        noticePeriodDays?: number;
        autoRenew?: boolean;
        additionalTerms?: string;
        landlordName?: string;
        landlordEmail?: string;
        tenantName?: string;
        tenantEmail?: string;
        tenantPhone?: string;
        propertyId?: string;
        propertyAddress?: string;
        propertyName?: string;
        envelopeId?: string;
        pdfUrl?: string;
        signers?: { name: string; email: string; role: string }[];
    }) =>
        fetchApi<{ tenantId?: string; tenancyId?: string; envelopeId?: string } & Application>(`${PM_BASE}/applications/${id}/send-lease`, {
            method: 'POST',
            body: JSON.stringify({ leaseData })
        }),

    /**
     * Generate lease document without sending to e-sign
     * Returns document URL for redirect to e-sign wizard
     */
    generateLeaseDocument: (id: string, leaseData: {
        templateId?: string;
        startDate: string;
        endDate: string;
        monthlyRent: number;
        securityDeposit?: number;
        advanceMonths?: number;
        noticePeriodDays?: number;
        autoRenew?: boolean;
        additionalTerms?: string;
        landlordName?: string;
        landlordEmail?: string;
        tenantUtilities?: string[];
        landlordUtilities?: string[];
        isUserLandlord?: boolean;
        landlordWillSign?: boolean;
        signers?: Array<{ role: string; name: string; email: string; order: number }>;
    }): Promise<GeneratedLeaseDocument> =>
        fetchApi<GeneratedLeaseDocument>(`${PM_BASE}/applications/${id}/generate-lease-document`, {
            method: 'POST',
            body: JSON.stringify(leaseData)
        }),

    convertApplicationToTenant: (id: string) =>
        fetchApi<{ tenantId: string; tenancyId: string }>(`${PM_BASE}/applications/${id}/convert-to-tenant`, {
            method: 'POST'
        }),

    addApplicationDocument: (id: string, data: { type: string; url: string; filename?: string }) =>
        fetchApi<Application>(`${PM_BASE}/applications/${id}/documents`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    // =====================================================
    // APPLICATION LINKS
    // =====================================================
    getApplicationLinks: (params?: { propertyId?: string; status?: string }) => {
        const query = new URLSearchParams();
        if (params?.propertyId) query.append('propertyId', params.propertyId);
        if (params?.status) query.append('status', params.status);
        return fetchApi<any[]>(`${PM_BASE}/application-links?${query.toString()}`);
    },

    createApplicationLink: (data: {
        propertyId: string;
        applicationType?: 'rental' | 'purchase';
        maxUses?: number;
        expiresInDays?: number;
    }) =>
        fetchApi<ApplicationLink & { url: string }>(`${PM_BASE}/application-links`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    deleteApplicationLink: (id: string) =>
        fetchApi<void>(`${PM_BASE}/application-links/${id}`, {
            method: 'DELETE'
        }),

    validateApplicationLink: (token: string) =>
        fetchApi<{ valid: boolean; propertyId?: string; organizationId?: string }>(
            `${PM_BASE}/application-links/${token}/validate`
        ),

    // =====================================================
    // LEASE TEMPLATES
    // =====================================================
    getLeaseTemplates: (params?: {
        category?: 'residential' | 'commercial' | 'short_term' | 'custom';
        activeOnly?: boolean;
        limit?: number;
        offset?: number;
    }) => {
        const query = new URLSearchParams();
        if (params?.category) query.append('category', params.category);
        if (params?.activeOnly !== undefined) query.append('activeOnly', String(params.activeOnly));
        if (params?.limit) query.append('limit', String(params.limit));
        if (params?.offset) query.append('offset', String(params.offset));
        return fetchApi<{ templates: LeaseTemplate[]; total: number }>(`${PM_BASE}/lease-templates?${query.toString()}`);
    },

    getLeaseTemplateById: (id: string) => 
        fetchApi<LeaseTemplate>(`${PM_BASE}/lease-templates/${id}`),

    createLeaseTemplate: (data: CreateLeaseTemplateDto) =>
        fetchApi<LeaseTemplate>(`${PM_BASE}/lease-templates`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    updateLeaseTemplate: (id: string, data: Partial<CreateLeaseTemplateDto>) =>
        fetchApi<LeaseTemplate>(`${PM_BASE}/lease-templates/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        }),

    deleteLeaseTemplate: (id: string) =>
        fetchApi<void>(`${PM_BASE}/lease-templates/${id}`, {
            method: 'DELETE'
        }),

    previewLeaseTemplate: (id: string, sampleData?: Record<string, any>) =>
        fetchApi<string>(`${PM_BASE}/lease-templates/${id}/preview`, {
            method: 'POST',
            body: JSON.stringify({ sampleData }),
            headers: { 'Accept': 'text/html' }
        }),

    // =====================================================
    // LEASE DOCUMENT GENERATION (from existing tenancy)
    // =====================================================
    generateLeaseDocumentFromTenancy: (data: {
        tenancyId: string;
        templateId?: string;
        additionalData?: Record<string, any>;
        format?: 'pdf' | 'html';
    }) =>
        fetchApi<GeneratedLeaseDocument>(`${PM_BASE}/lease-documents/generate`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    // =====================================================
    // UTILITY CHARGES
    // =====================================================
    getUtilityCharges: (tenancyId: string) =>
        fetchApi<{ charges: UtilityCharge[] }>(`${PM_BASE}/tenancies/${tenancyId}/utility-charges`),

    createUtilityCharge: (tenancyId: string, data: CreateUtilityChargeDto) =>
        fetchApi<{ success: boolean; charge: UtilityCharge }>(`${PM_BASE}/tenancies/${tenancyId}/utility-charges`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    updateUtilityCharge: (chargeId: string, data: Partial<UtilityCharge>) =>
        fetchApi<{ success: boolean; charge: UtilityCharge }>(`${PM_BASE}/utility-charges/${chargeId}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        }),

    deleteUtilityCharge: (chargeId: string) =>
        fetchApi<{ success: boolean }>(`${PM_BASE}/utility-charges/${chargeId}`, {
            method: 'DELETE'
        }),

    applyUtilityCharge: (chargeId: string, scheduleId: string) =>
        fetchApi<{ success: boolean; charge: UtilityCharge; schedule: any }>(`${PM_BASE}/utility-charges/${chargeId}/apply`, {
            method: 'POST',
            body: JSON.stringify({ scheduleId })
        }),

    getRentSchedules: (tenancyId: string) =>
        fetchApi<{ schedules: RentScheduleItem[] }>(`${PM_BASE}/tenancies/${tenancyId}/rent-schedules`)
};

// =====================================================
// APPLICATION TYPES
// =====================================================

export enum ApplicationStatus {
    DRAFT = 'draft',
    SUBMITTED = 'submitted',
    UNDER_REVIEW = 'under_review',
    APPROVED = 'approved',
    REJECTED = 'rejected',
    WITHDRAWN = 'withdrawn',
    LEASE_GENERATED = 'lease_generated',
    LEASE_SIGNED = 'lease_signed',
    EXPIRED = 'expired'
}

export interface CharacterReference {
    name: string;
    phone: string;
    relationship: string;
    email?: string;
}

export interface PreviousAddress {
    address: string;
    landlordName?: string;
    landlordPhone?: string;
    duration: string;
    reasonForLeaving?: string;
}

export interface UploadedDocument {
    type: string;
    url: string;
    uploadedAt: string;
    filename?: string;
}

export interface Application {
    id: string;
    organizationId: string;
    propertyId: string;
    applicantFullName: string;
    applicantEmail: string;
    applicantPhone: string;
    applicantPhoneSecondary?: string;
    applicantDateOfBirth?: string;
    applicantGhanaCard?: string;
    applicantCurrentAddress?: string;
    applicantDigitalAddress?: string;
    occupation?: string;
    employerName?: string;
    employerAddress?: string;
    employerPhone?: string;
    monthlyIncome?: number;
    employmentDurationMonths?: number;
    emergencyContactName?: string;
    emergencyContactRelationship?: string;
    emergencyContactPhone?: string;
    desiredMoveInDate?: string;
    desiredLeaseTermMonths: number;
    numberOfOccupants: number;
    hasPets: boolean;
    petDetails?: string;
    reasonForMoving?: string;
    specialRequirements?: string;
    howDidYouHear?: string;
    characterReferences: CharacterReference[];
    previousAddresses: PreviousAddress[];
    uploadedDocuments: UploadedDocument[];
    applicationToken?: string;
    applicationTokenExpiresAt?: string;
    status: ApplicationStatus;
    submittedAt?: string;
    reviewedAt?: string;
    reviewedBy?: string;
    approvalNotes?: string;
    rejectionReason?: string;
    tenantId?: string;
    tenancyId?: string;
    envelopeId?: string;
    createdAt: string;
    updatedAt: string;
    expiresAt?: string;
    deletedAt?: string;
    propertyName?: string;
    propertyAddress?: string;
    propertyPrice?: number;
    propertyPriceCurrency?: string;
    propertyBedrooms?: number;
    propertyBathrooms?: number;
    propertyType?: string;
}

export interface CreateApplicationDto {
    propertyId: string;
    applicantFullName: string;
    applicantEmail: string;
    applicantPhone: string;
    applicantPhoneSecondary?: string;
    applicantDateOfBirth?: string;
    applicantGhanaCard?: string;
    applicantCurrentAddress?: string;
    applicantDigitalAddress?: string;
    occupation?: string;
    employerName?: string;
    employerAddress?: string;
    employerPhone?: string;
    monthlyIncome?: number;
    employmentDurationMonths?: number;
    emergencyContactName?: string;
    emergencyContactRelationship?: string;
    emergencyContactPhone?: string;
    desiredMoveInDate?: string;
    desiredLeaseTermMonths?: number;
    numberOfOccupants?: number;
    hasPets?: boolean;
    petDetails?: string;
    reasonForMoving?: string;
    specialRequirements?: string;
    howDidYouHear?: string;
    characterReferences?: CharacterReference[];
    previousAddresses?: PreviousAddress[];
}

export interface ApplicationStats {
    total: number;
    byStatus: Record<ApplicationStatus, number>;
    submittedThisMonth: number;
    approvalRate: number;
    averageReviewTime: number;
}

export interface ApplicationStatusChange {
    id: string;
    fromStatus: ApplicationStatus | null;
    toStatus: ApplicationStatus;
    changedBy: string | null;
    changedByType: string;
    reason: string | null;
    changedAt: string;
}

export interface ApplicationLink {
    id: string;
    organizationId: string;
    propertyId: string;
    token: string;
    applicationType: string;
    maxUses?: number;
    currentUses: number;
    expiresAt: string;
    isActive: boolean;
    createdBy: string;
    createdAt: string;
    deactivatedAt?: string;
    deactivatedBy?: string;
    propertyName?: string;
    propertyAddress?: string;
}

// =====================================================
// LEASE TEMPLATE TYPES
// =====================================================

export interface LeaseTemplate {
    id: string;
    organizationId: string;
    name: string;
    description?: string;
    content: string;
    variables: string[];
    category: 'residential' | 'commercial' | 'short_term' | 'custom';
    isDefault: boolean;
    isActive: boolean;
    version: number;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}

export interface CreateLeaseTemplateDto {
    name: string;
    description?: string;
    content: string;
    category?: 'residential' | 'commercial' | 'short_term' | 'custom';
    isDefault?: boolean;
}

export interface GeneratedLeaseDocument {
    documentId: string;
    documentKey: string;
    filename: string;
    downloadUrl: string;
    tenancyId: string;
    templateId: string;
    generatedAt: string;
}

// =====================================================
// UTILITY CHARGE TYPES
// =====================================================

export type UtilityType = 'electricity' | 'water' | 'gas' | 'internet' | 'waste' | 'security' | 'sewage' | 'maintenance' | 'other';
export type UtilityChargeStatus = 'pending' | 'applied' | 'paid' | 'waived' | 'disputed';

export interface UtilityCharge {
    id: string;
    tenancy_id: string;
    organization_id: string;
    utility_type: UtilityType;
    billing_period_start: string;
    billing_period_end: string;
    amount: string;
    currency: string;
    description: string | null;
    evidence_document_id: string | null;
    status: UtilityChargeStatus;
    applied_to_schedule_id: string | null;
    applied_at: string | null;
    dispute_reason: string | null;
    dispute_resolved_at: string | null;
    dispute_resolution: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    // Joined fields
    evidence_title?: string;
    evidence_file_url?: string;
    evidence_file_name?: string;
    schedule_period_number?: number;
    schedule_period_start?: string;
}

export interface CreateUtilityChargeDto {
    utilityType: UtilityType;
    billingPeriodStart: string;
    billingPeriodEnd: string;
    amount: number;
    currency?: string;
    description?: string;
    evidenceDocumentId?: string;
}

export interface RentScheduleItem {
    id: string;
    period_number: number;
    period_start_date: string;
    period_end_date: string;
    due_date: string;
    expected_amount: string;
    amount_paid: string;
    amount_outstanding: string;
    utility_charges_total: string;
    currency: string;
    status: string;
}

// =====================================================
// PAYMENT CONFIGURATION
// =====================================================

export interface PaymentAccountConfig {
    configured: boolean;
    settlementMethod?: 'bank' | 'mobile_money';
    bankName?: string;
    bankCode?: string;
    accountNumber?: string;
    accountName?: string;
    momoProvider?: string;
    momoNumber?: string;
    subaccountCode?: string;
    platformFeePercentage?: number;
    platformFeeFlat?: number;
    isVerified?: boolean;
    verifiedAt?: string;
    createdAt?: string;
}

export interface BankListItem {
    id: number;
    name: string;
    slug: string;
    code: string;
    active: boolean;
    country: string;
    currency: string;
    type: string;
}

export interface ResolveAccountResult {
    status: boolean;
    message: string;
    data: {
        account_number: string;
        account_name: string;
        bank_id: number;
    };
}

export interface CryptoWalletConfig {
    configured: boolean;
    walletAddress?: string;
    isVerified?: boolean;
    registeredAt?: string | null;
    payoutCoin?: string;
    payoutChain?: string;
    payoutWalletAddress?: string;
    useNowPayments?: boolean;
}

export interface CryptoWalletSaveResult {
    success: boolean;
    walletAddress: string;
    payoutCoin: string;
    payoutChain: string;
    useNowPayments: boolean;
    isVerified: boolean;
    registeredAt: string | null;
}

export interface SettlementCoin {
    id: string;
    coin_symbol: string;
    coin_name: string;
    chain: string;
    nowpayments_ticker: string;
    address_regex: string | null;
    address_placeholder: string | null;
    is_evm_native: boolean;
    is_enabled: boolean;
}

export const paymentConfigApi = {
    /** Get current payout account status */
    getAccount: () =>
        fetchApi<PaymentAccountConfig>(`${PM_BASE}/payments/account`),

    /** Get list of supported banks */
    getBanks: () =>
        fetchApi<{ status: boolean; data: BankListItem[] }>(`${PM_BASE}/payments/banks`),

    /** Verify a bank account number (name enquiry) */
    resolveAccount: (accountNumber: string, bankCode: string) =>
        fetchApi<ResolveAccountResult>(`${PM_BASE}/payments/resolve-account`, {
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
        fetchApi<{ success: boolean; subaccountCode: string }>(`${PM_BASE}/payments/register-account`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }),

    /** Get crypto wallet configuration */
    getCryptoWallet: () =>
        fetchApi<CryptoWalletConfig>(`${PM_BASE}/payments/crypto-wallet`),

    /** Save/update crypto wallet + payout currency */
    saveCryptoWallet: (walletAddress: string, payoutCoin?: string, payoutChain?: string) =>
        fetchApi<CryptoWalletSaveResult>(`${PM_BASE}/payments/crypto-wallet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress, payoutCoin, payoutChain })
        }),

    /** Get supported settlement/payout currencies */
    getSettlementCoins: () =>
        fetchApi<SettlementCoin[]>(`${PM_BASE}/payments/settlement-coins`),
};

// =====================================================
// CRYPTO REVENUE
// =====================================================

export interface CryptoPaymentDetail {
    reference: string;
    principalGhs: number;
    feeGhs: number;
    grossGhs: number;
    cryptoCurrency: string | null;
    cryptoAmountPaid: number | null;
    settlementCurrency: string | null;
    settlementAmount: number | null;
    date: string;
}

export interface CryptoRevenueSummary {
    totalCryptoPayments: number;
    totalCryptoRentGhs: number;
    totalCryptoFeesGhs: number;
    totalFeesCollectedGhs: number;
    currenciesAccepted: string[];
    platformFeeWallet: string | null;
    payments: CryptoPaymentDetail[];
    feePayouts: {
        paymentReference: string;
        feeAmountGhs: number;
        status: string;
        payoutAddress: string;
        date: string;
    }[];
}

export const cryptoRevenueApi = {
    /** Get crypto payment and fee revenue summary for PM */
    getSummary: () =>
        fetchApi<CryptoRevenueSummary>(`${PM_BASE}/payments/crypto-revenue`),
};
