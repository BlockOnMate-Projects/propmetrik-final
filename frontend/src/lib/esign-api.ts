/**
 * E-Sign API Client
 * 
 * All API calls for the e-signature module.
 * Uses fetch() with the backend at /api/v1/esign/
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
const ESIGN_BASE = `${API_BASE}/esign`;

function getAuthHeaders(): HeadersInit {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('pm_access_token') || localStorage.getItem('token') || localStorage.getItem('auth_token');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // Pass user info as headers for backend user identification
  try {
    const session = localStorage.getItem('pm_user_session');
    if (session) {
      const user = JSON.parse(session);
      if (user.id) headers['X-User-Id'] = user.id;
    }
  } catch { /* ignore */ }
  return headers;
}

async function esignFetch<T = any>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${ESIGN_BASE}${endpoint}`;
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    // Backend returns { error: "string" } — handle both string and object forms
    const errMsg = typeof data.error === 'string' ? data.error
      : data.error?.message || data.message || data.detail
      || `Request failed: ${response.status}`;
    throw new Error(errMsg);
  }
  // Handle blob responses
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/pdf') || contentType?.includes('application/octet-stream')) {
    return response.blob() as unknown as T;
  }
  return response.json();
}

// ─── Envelopes ─────────────────────────────────────────────────

export async function getEnvelopes(params?: { status?: string; limit?: number; offset?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));
  const qs = searchParams.toString();
  return esignFetch(`/envelopes${qs ? `?${qs}` : ''}`);
}

export async function getEnvelope(id: string) {
  return esignFetch(`/envelopes/${id}`);
}

export async function createEnvelope(data: FormData | Record<string, any>) {
  if (data instanceof FormData) {
    return esignFetch('/envelopes', {
      method: 'POST',
      body: data,
    });
  }
  return esignFetch('/envelopes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function voidEnvelope(id: string, reason?: string) {
  return esignFetch(`/envelopes/${id}/void`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
}

export async function resendEnvelope(id: string, signerEmail?: string) {
  return esignFetch(`/envelopes/${id}/resend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signerEmail }),
  });
}

export async function downloadEnvelopeDocument(envelopeId: string): Promise<Blob> {
  // Backend renders the (partially) signed PDF with all placed fields overlaid.
  return esignFetch(`/envelopes/${envelopeId}/download`);
}

// ─── Templates ─────────────────────────────────────────────────

export async function getTemplates(params?: { category?: string; limit?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.category) searchParams.set('category', params.category);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  const qs = searchParams.toString();
  return esignFetch(`/templates${qs ? `?${qs}` : ''}`);
}

export async function getTemplate(id: string) {
  return esignFetch(`/templates/${id}`);
}

export async function createTemplate(data: FormData | {
  name: string;
  description?: string;
  category?: string;
  fields?: any[];
  recipients?: any[];
}) {
  if (data instanceof FormData) {
    const token = typeof window !== 'undefined'
      ? localStorage.getItem('token') || localStorage.getItem('auth_token') || ''
      : '';
    const res = await fetch(`${API_BASE}/esign/templates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: data,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
  return esignFetch('/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteTemplate(id: string) {
  return esignFetch(`/templates/${id}`, { method: 'DELETE' });
}

// ─── Signing (Public - token-based) ─────────────────────────────

export async function getSignerAccess(token: string) {
  return esignFetch(`/signing/access/${token}`);
}

export async function signDocument(token: string, data: {
  signatureImage: string;
  signatureType: 'drawn' | 'typed' | 'uploaded';
  consentGiven: boolean;
  consentText: string;
  fields?: Array<{ fieldId: string; signatureData?: string; value?: string }>;
}) {
  return esignFetch(`/signing/sign/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function declineSignature(token: string, reason: string) {
  return esignFetch(`/signing/decline/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
}

// ─── Reports ─────────────────────────────────────────────────

export async function getReportStats(days: number = 30) {
  return esignFetch(`/reports/stats?days=${days}`);
}

export async function getReportActivity(limit: number = 20, offset: number = 0) {
  return esignFetch(`/reports/activity?limit=${limit}&offset=${offset}`);
}

// ─── Documents ─────────────────────────────────────────────────

export async function uploadDocument(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return esignFetch('/documents/upload', {
    method: 'POST',
    body: formData,
  });
}

// ─── Users ─────────────────────────────────────────────────

export async function getOrCreateSignerId(email: string, name: string) {
  return esignFetch('/users/get-or-create-signer-id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name }),
  });
}
