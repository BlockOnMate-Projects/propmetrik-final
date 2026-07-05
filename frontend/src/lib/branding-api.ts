/**
 * Per-service Company Branding API client.
 * Each service owns its own brand (name/logo/palette) that flows into that
 * service's documents. Backend: /api/v1/branding/:service (proxied via /api).
 */
import { authedFetch } from '@/lib/authed-fetch';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

export type BrandingService = 'valuation' | 'property_management' | 'crm' | 'project_management';

export interface ServiceBranding {
  name?: string | null;
  tagline?: string | null;
  logo_url?: string | null;
  logo_key?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  font_family?: string | null;
  professional_body?: string | null;
  license_number?: string | null;
  tax_id?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  report_header_html?: string | null;
  report_footer_html?: string | null;
  email_signature_html?: string | null;
  footer_text?: string | null;
  configured?: boolean;
}

export async function getBranding(service: BrandingService): Promise<ServiceBranding> {
  const res = await authedFetch(`${API_BASE}/branding/${service}`);
  if (!res.ok) throw new Error('Failed to load branding');
  return (await res.json()).branding as ServiceBranding;
}

export async function saveBranding(service: BrandingService, updates: Partial<ServiceBranding>): Promise<ServiceBranding> {
  const res = await authedFetch(`${API_BASE}/branding/${service}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || 'Failed to save branding');
  }
  return (await res.json()).branding as ServiceBranding;
}

export async function uploadBrandingLogo(
  service: BrandingService,
  file: File
): Promise<{ logo_url: string; branding: ServiceBranding }> {
  const fd = new FormData();
  fd.append('logo', file);
  // NOTE: do NOT set Content-Type — the browser adds the multipart boundary.
  const res = await authedFetch(`${API_BASE}/branding/${service}/logo`, { method: 'POST', body: fd });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || 'Failed to upload logo');
  }
  return res.json();
}
