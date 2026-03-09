/**
 * Reports API Client
 * 
 * Frontend API client for Valuation Report operations.
 * Implements CRUD operations for RICS/GhIS compliant reports.
 */

import {
  ValuationReport,
  ReportWithValuer,
  ReportPhoto,
  CreateReportInput,
  UpdateReportInput,
  ReportListFilters,
  PaginatedReports,
  PhotosResponse,
  ReportsForValuationResponse,
  ReorderPhotosResponse,
  ReportAuditLog,
  PhotoCategory,
} from '@/types/report';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? '/api' : 'http://localhost:4000/api/v1');

import { getSession } from 'next-auth/react';

// =====================================================
// HELPER FUNCTIONS
// =====================================================

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  // Attach auth token from NextAuth session
  const authHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (typeof window !== 'undefined') {
    try {
      const session = await getSession();
      const token = (session as any)?.accessToken;
      if (token) authHeaders['Authorization'] = `Bearer ${token}`;
    } catch {}
  }

  const response = await fetch(url, {
    headers: {
      ...authHeaders,
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Network error' }));
    // Ensure we always throw a string message
    const errorMessage = typeof error === 'string' 
      ? error 
      : error.message || error.error || error.detail || JSON.stringify(error) || `HTTP ${response.status}`;
    throw new Error(errorMessage);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// =====================================================
// REPORTS API
// =====================================================

export const reportsApi = {
  /**
   * Create a new draft report from a valuation
   */
  create: (input: CreateReportInput) => {
    return fetchApi<ValuationReport>('/reports', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /**
   * Get a report by ID
   */
  getById: (reportId: string) => {
    return fetchApi<ReportWithValuer>(`/reports/${reportId}`);
  },

  /**
   * List reports with filters and pagination
   */
  list: (filters?: ReportListFilters) => {
    const params = new URLSearchParams();
    
    if (filters?.status) params.set('status', filters.status);
    if (filters?.template) params.set('template', filters.template);
    if (filters?.valuation_id) params.set('valuation_id', filters.valuation_id);
    if (filters?.from_date) params.set('from_date', filters.from_date);
    if (filters?.to_date) params.set('to_date', filters.to_date);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));

    const queryString = params.toString();
    return fetchApi<PaginatedReports>(`/reports${queryString ? `?${queryString}` : ''}`);
  },

  /**
   * Update a draft report's content
   */
  update: (reportId: string, input: UpdateReportInput) => {
    return fetchApi<ValuationReport>(`/reports/${reportId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  /**
   * Delete a draft report
   */
  delete: (reportId: string) => {
    return fetchApi<void>(`/reports/${reportId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Create a new version of an approved report (supersede)
   */
  supersede: (reportId: string) => {
    return fetchApi<ValuationReport>(`/reports/${reportId}/supersede`, {
      method: 'POST',
    });
  },

  /**
   * Get all reports for a valuation
   */
  getForValuation: (valuationId: string) => {
    return fetchApi<ReportsForValuationResponse>(`/reports/valuation/${valuationId}`);
  },

  /**
   * Get audit log for a report
   */
  getAuditLog: (reportId: string) => {
    return fetchApi<ReportAuditLog>(`/reports/${reportId}/audit`);
  },

  // -------------------------------------------------
  // PHOTO OPERATIONS
  // -------------------------------------------------

  /**
   * Get all photos for a report
   */
  getPhotos: (reportId: string) => {
    return fetchApi<PhotosResponse>(`/reports/${reportId}/photos`);
  },

  /**
   * Add a photo reference to a report
   * Note: Actual file upload should go through a separate upload endpoint
   */
  addPhoto: (
    reportId: string,
    photo: {
      storage_url: string;
      category: PhotoCategory;
      caption?: string;
      thumbnail_url?: string;
      file_size_bytes?: number;
    }
  ) => {
    return fetchApi<ReportPhoto>(`/reports/${reportId}/photos`, {
      method: 'POST',
      body: JSON.stringify(photo),
    });
  },

  /**
   * Delete a photo from a report
   */
  deletePhoto: (reportId: string, photoId: string) => {
    return fetchApi<void>(`/reports/${reportId}/photos/${photoId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Reorder photos in a report
   */
  reorderPhotos: (reportId: string, photoOrder: string[]) => {
    return fetchApi<ReorderPhotosResponse>(`/reports/${reportId}/photos/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ photo_order: photoOrder }),
    });
  },

  // -------------------------------------------------
  // DOCUMENT GENERATION OPERATIONS
  // -------------------------------------------------

  /**
   * Generate DOCX report from template
   */
  generate: (reportId: string, options?: {
    template?: string;
    include_floor_plans?: boolean;
    include_photos?: boolean;
    include_maps?: boolean;
    include_comparables?: boolean;
    currency?: 'GHS' | 'USD';
    secondary_currency?: 'GHS' | 'USD' | null;
  }) => {
    return fetchApi<{
      report_id: string;
      filename: string;
      docx_url: string;
      generated_at: string;
    }>(`/reports/${reportId}/generate`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
  },

  /**
   * Get download URL for generated DOCX
   */
  download: (reportId: string) => {
    return fetchApi<{
      report_id: string;
      download_url: string;
      filename: string;
      expires_in: number;
      generated_at: string;
    }>(`/reports/${reportId}/download`);
  },

  /**
   * Get document status (is generated, etc.)
   */
  getDocumentStatus: (reportId: string) => {
    return fetchApi<{
      report_id: string;
      status: string;
      template: string;
      version: number;
      is_generated: boolean;
      generated_at: string | null;
      storage_key: string | null;
    }>(`/reports/${reportId}/status`);
  },

  // -------------------------------------------------
  // APPROVAL OPERATIONS
  // -------------------------------------------------

  /**
   * Check if report can be approved
   */
  checkApproval: (reportId: string) => {
    return fetchApi<{
      can_approve: boolean;
      reasons: string[];
    }>(`/reports/${reportId}/approval-check`);
  },

  /**
   * Get valuer credentials for approval
   */
  getValuerCredentials: (valuerId: string) => {
    return fetchApi<{
      id: string;
      name: string;
      title: string | null;
      qualifications: string | null;
      license_number: string | null;
      license_issuer: string | null;
      license_status: string;
      license_valid: boolean;
      pi_insured: boolean;
      pi_valid: boolean;
      has_signature: boolean;
      can_approve: boolean;
      issues: string[];
    }>(`/valuers/${valuerId}/credentials`);
  },

  /**
   * Approve a report with signature
   */
  approve: (reportId: string, data: {
    valuer_id: string;
    comments?: string;
    signature_data_url?: string;
    generate_pdf?: boolean;
  }) => {
    return fetchApi<{
      success: boolean;
      report_id: string;
      status: string;
      approved_at?: string;
      approved_by?: string;
      digital_seal_hash?: string;
      verification_url?: string;
      pdf?: {
        success: boolean;
        url?: string;
        error?: string;
      };
    }>(`/reports/${reportId}/approve`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Prepare e-sign envelope data for report approval (self-sign flow).
   * Returns document URL, signer info, etc. for the e-sign UI.
   */
  prepareEsign: (reportId: string, valuerId: string) => {
    return fetchApi<{
      success: boolean;
      reportId: string;
      valuationId: string;
      documentUrl: string;
      documentKey: string;
      filename: string;
      propertyAddress: string;
      valuer: {
        id: string;
        name: string;
        title: string | null;
        email: string;
        qualifications: string | null;
        license_number: string | null;
      };
      signers: Array<{ name: string; email: string; role: string; order: number }>;
      subject: string;
      message: string;
    }>(`/reports/${reportId}/prepare-esign`, {
      method: 'POST',
      body: JSON.stringify({ valuer_id: valuerId }),
    });
  },
};

// =====================================================
// CONVENIENCE HOOKS (for React Query / SWR)
// =====================================================

/**
 * Generate cache key for a report
 */
export function getReportCacheKey(reportId: string): string[] {
  return ['report', reportId];
}

/**
 * Generate cache key for reports list
 */
export function getReportsListCacheKey(filters?: ReportListFilters): string[] {
  return ['reports', JSON.stringify(filters || {})];
}

/**
 * Generate cache key for valuation reports
 */
export function getValuationReportsCacheKey(valuationId: string): string[] {
  return ['valuation-reports', valuationId];
}

/**
 * Generate cache key for report photos
 */
export function getReportPhotosCacheKey(reportId: string): string[] {
  return ['report-photos', reportId];
}

export default reportsApi;
