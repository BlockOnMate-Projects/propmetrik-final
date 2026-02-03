import axios, { AxiosError, AxiosRequestHeaders } from 'axios';
import config from './config';
import { getAuthHeader, updateToken } from './propmetrik-auth';
import { toast } from 'react-toastify';

// Log config on startup - v2
console.log('🔧 E-Sign API Config:', { apiBaseUrl: config.apiBaseUrl, version: '1.0.1' });

// Create axios instance
const api = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use(
  async (config) => {
    // Try to update token before request
    await updateToken();
    
    // Add authorization header
    const authHeaders = getAuthHeader();
    console.log('🔑 Request to:', config.url);
    console.log('🔑 Auth header:', authHeaders.Authorization ? `Present (Bearer ${authHeaders.Authorization.substring(7, 30)}...)` : 'MISSING!');
    
    if (authHeaders.Authorization) {
      const mergedHeaders: AxiosRequestHeaders = {
        ...(config.headers ?? {}),
        ...authHeaders,
      } as AxiosRequestHeaders;
      config.headers = mergedHeaders;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response) {
      const status = error.response.status;
      const message = (error.response.data as any)?.detail || error.message;
      
      switch (status) {
        case 401:
          toast.error('Unauthorized. Please log in again.');
          break;
        case 403:
          toast.error('Access denied. You do not have permission.');
          break;
        case 404:
          toast.error('Resource not found.');
          break;
        case 500:
          toast.error('Server error. Please try again later.');
          break;
        default:
          toast.error(message || 'An error occurred.');
      }
    } else if (error.request) {
      toast.error('Network error. Please check your connection.');
    } else {
      toast.error('An unexpected error occurred.');
    }
    
    return Promise.reject(error);
  }
);

export default api;

// API endpoints
export const healthCheck = () => api.get('/health');

export const testKeycloak = () => api.get('/auth/test-keycloak');

export const getCurrentUser = () => api.get('/auth/me');

export const getUserGroups = () => api.get('/auth/groups');

// Google Drive endpoints (to be implemented in backend)
export const getGoogleDriveFiles = () => api.get('/google/drive/files');

export const getGoogleDoc = (fileId: string) => api.get(`/google/docs/${fileId}`);

export const connectGoogleDrive = (accessToken: string) =>
  api.post('/google/drive/connect', { access_token: accessToken });

// Document endpoints
export const uploadDocument = (formData: FormData) => 
  api.post('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

export const getDocuments = (skip: number = 0, limit: number = 50, status?: string) => {
  const params = new URLSearchParams({ skip: skip.toString(), limit: limit.toString() });
  if (status) params.append('status_filter', status);
  return api.get(`/documents/?${params.toString()}`);
};

export const getDocument = (id: number) => api.get(`/documents/${id}`);

export const deleteDocument = (id: number) => api.delete(`/documents/${id}`);

export const downloadDocument = (id: number) => 
  api.get(`/documents/${id}/download`, { responseType: 'blob' });

// Signature request endpoints
export const createSignatureRequest = (data: {
  document_id: number;
  title: string;
  message?: string;
  signers: Array<{ email: string; full_name?: string; order: number }>;
  expires_in_days?: number;
}) => api.post('/signature-requests/', data);

export const getSignatureRequests = (skip: number = 0, limit: number = 50, status?: string) => {
  const params = new URLSearchParams({ skip: skip.toString(), limit: limit.toString() });
  if (status) params.append('status_filter', status);
  return api.get(`/signature-requests/?${params.toString()}`);
};

export const getSignatureRequest = (id: number) => 
  api.get(`/signature-requests/${id}`);

export const updateSignatureRequestStatus = (id: number, status: string) =>
  api.patch(`/signature-requests/${id}/status`, { status });

export const deleteSignatureRequest = (id: number) => 
  api.delete(`/signature-requests/${id}`);

export const getSignatureRequestSigners = (id: number) =>
  api.get(`/signature-requests/${id}/signers`);

// Public signing endpoints (no authentication required)
export const getSignerInfo = (accessToken: string) =>
  axios.get(`${config.apiBaseUrl}/signing/access/${accessToken}`);

export const signDocumentPublic = (
  accessToken: string,
  signatureData: string,
  signatureType: string = 'drawn',
  placement?: { page: number; x: number; y: number; width: number; height: number }
) =>
  axios.post(`${config.apiBaseUrl}/signing/sign/${accessToken}`, {
    signature_data: signatureData,
    signature_type: signatureType,
    page: placement?.page ?? 1,
    x: placement?.x ?? 0.1,
    y: placement?.y ?? 0.1,
    width: placement?.width ?? 0.3,
    height: placement?.height ?? 0.1,
  });

export const declineSignature = (accessToken: string, reason?: string) =>
  axios.post(`${config.apiBaseUrl}/signing/decline/${accessToken}`, { decline_reason: reason });

export const getDocumentForSigning = (accessToken: string) =>
  axios.get(`${config.apiBaseUrl}/signing/signature-request/${accessToken}/document`);

// Inbox endpoints - signature requests where you're a signer
export const getInboxSignatureRequests = (skip: number = 0, limit: number = 50, status?: string) => {
  const params = new URLSearchParams({ skip: skip.toString(), limit: limit.toString() });
  if (status) params.append('status_filter', status);
  return api.get(`/signature-requests/inbox?${params.toString()}`);
};

// Google Drive endpoints
export const getGoogleDriveStatus = () => api.get('/google/drive/status');

export const initiateGoogleAuth = () => api.get('/google/auth/google');

export const listGoogleDriveFiles = (pageToken?: string, folderId?: string) => {
  const params = new URLSearchParams();
  if (pageToken) params.append('page_token', pageToken);
  if (folderId) params.append('folder_id', folderId);
  return api.get(`/google/drive/files?${params.toString()}`);
};

export const importGoogleDriveDocument = (fileId: string) => 
  api.post(`/google/drive/import/${fileId}`);

export const disconnectGoogleDrive = () => api.delete('/google/drive/disconnect');

// Template endpoints
export const getTemplates = (category?: string, search?: string) => {
  const params = new URLSearchParams();
  if (category) params.append('category', category);
  if (search) params.append('search', search);
  const queryString = params.toString();
  return api.get(`/templates/${queryString ? `?${queryString}` : ''}`);
};

export const getTemplate = (id: string) => api.get(`/templates/${id}`);

export const createTemplate = (data: {
  name: string;
  description?: string;
  category?: string;
  document_name?: string;
  document_drive_id?: string;
  fields?: Array<{
    type: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    required?: boolean;
  }>;
}) => api.post('/templates/', data);

export const updateTemplate = (id: string, data: {
  name?: string;
  description?: string;
  category?: string;
  fields?: Array<{
    type: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    required?: boolean;
  }>;
}) => api.put(`/templates/${id}`, data);

export const deleteTemplate = (id: string) => api.delete(`/templates/${id}`);

export const useTemplate = (id: string) => api.post(`/templates/${id}/use`);

export const getTemplateCategories = () => api.get('/templates/categories/list');

// Reports endpoints
export const getReportStats = (days: number = 30) => 
  api.get(`/reports/stats?days=${days}`);

export const getReportActivity = (limit: number = 20, offset: number = 0) =>
  api.get(`/reports/activity?limit=${limit}&offset=${offset}`);

export const getEnvelopesByDate = (days: number = 30) =>
  api.get(`/reports/envelopes-by-date?days=${days}`);

export const getRecipientsPerformance = (days: number = 30, limit: number = 10) =>
  api.get(`/reports/recipients-performance?days=${days}&limit=${limit}`);

export const exportReport = (reportType: string, format: string = 'csv', days: number = 30) =>
  api.get(`/reports/export?report_type=${reportType}&format=${format}&days=${days}`);

// Envelope endpoints
export const getEnvelopes = (status?: string) => {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  const queryString = params.toString();
  return api.get(`/envelopes/${queryString ? `?${queryString}` : ''}`);
};

export const getEnvelope = (id: string) => api.get(`/envelopes/${id}`);

export const createEnvelope = (formData: FormData) => 
  api.post('/envelopes/create', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

export const voidEnvelope = (id: string) => api.post(`/envelopes/${id}/void`);

export const resendEnvelope = (id: string) => api.post(`/envelopes/${id}/resend`);

export const downloadEnvelopeDocument = (envelopeId: string, documentId?: string) => {
  const url = documentId 
    ? `/envelopes/${envelopeId}/documents/${documentId}/download`
    : `/envelopes/${envelopeId}/documents/0/download`;
  return api.get(url, { responseType: 'blob' });
};
