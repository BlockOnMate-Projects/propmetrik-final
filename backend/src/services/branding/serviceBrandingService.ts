/**
 * Service Branding Service
 *
 * Per-(organization, service) company branding. Each service — valuation,
 * property_management, crm, project_management — owns its own name/logo/palette
 * so a single-service subscriber can brand their documents without touching any
 * other service. Reads fall back to the org's real name (then PROPMETRIK defaults
 * are applied downstream by brandingService.resolveReportBranding).
 *
 * @module services/branding/serviceBrandingService
 */
import { pool } from '../../database';

export type ServiceType = 'valuation' | 'property_management' | 'crm' | 'project_management';

export const SERVICE_TYPES: ServiceType[] = ['valuation', 'property_management', 'crm', 'project_management'];

export function isServiceType(v: any): v is ServiceType {
  return SERVICE_TYPES.includes(v);
}

export interface ServiceBranding {
  organization_id: string;
  service_type: ServiceType;
  name?: string | null;          // COALESCE(service row, organization name)
  tagline?: string | null;
  logo_url?: string | null;
  logo_key?: string | null;      // MinIO object key (for direct byte reads in report gen)
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
  /** True when a per-service row exists (vs. the PROPMETRIK default). */
  configured?: boolean;
}

/** Columns a client may write. */
const WRITABLE = [
  'name', 'tagline', 'logo_url',
  'primary_color', 'secondary_color', 'accent_color', 'font_family',
  'professional_body', 'license_number', 'tax_id',
  'address_line1', 'address_line2', 'city', 'region', 'postal_code', 'country',
  'phone', 'email', 'website',
  'report_header_html', 'report_footer_html', 'email_signature_html', 'footer_text',
] as const;

/**
 * Resolve the raw branding row for an org + service. Always returns an object when
 * the org exists (with `name` defaulted to the org's legal name); `configured`
 * indicates whether a per-service row has actually been saved.
 */
export async function getServiceBranding(
  orgId: string,
  service: ServiceType
): Promise<ServiceBranding | null> {
  // Return the service's OWN saved values (nullable) — blank when unset. There is NO
  // org-name fallback: an unset service resolves to the PROPMETRIK platform default
  // (applied downstream in resolveReportBranding), not the org's legal name.
  const { rows } = await pool.query(
    `SELECT
        o.id AS organization_id,
        $2::text AS service_type,
        sb.name, sb.tagline, sb.logo_url, sb.logo_key,
        sb.primary_color, sb.secondary_color, sb.accent_color, sb.font_family,
        sb.professional_body, sb.license_number, sb.tax_id,
        sb.address_line1, sb.address_line2, sb.city, sb.region, sb.postal_code, sb.country,
        sb.phone, sb.email, sb.website,
        sb.report_header_html, sb.report_footer_html, sb.email_signature_html, sb.footer_text,
        (sb.id IS NOT NULL) AS configured
     FROM organizations o
     LEFT JOIN service_branding sb
        ON sb.organization_id = o.id AND sb.service_type = $2
     WHERE o.id = $1`,
    [orgId, service]
  );
  return (rows[0] as ServiceBranding) || null;
}

/**
 * Create/replace the branding for an org + service (whitelisted upsert).
 * Returns the freshly-resolved branding.
 */
export async function updateServiceBranding(
  orgId: string,
  service: ServiceType,
  updates: Partial<Record<(typeof WRITABLE)[number], string | null>>
): Promise<ServiceBranding | null> {
  const cols: string[] = [];
  const vals: any[] = [];
  for (const key of WRITABLE) {
    if (key in updates) {
      cols.push(key);
      vals.push((updates as any)[key] === '' ? null : (updates as any)[key]);
    }
  }

  if (cols.length === 0) return getServiceBranding(orgId, service);

  // INSERT ... ON CONFLICT upsert. Params: $1 org, $2 service, then the columns.
  const colList = cols.join(', ');
  const placeholders = cols.map((_, i) => `$${i + 3}`).join(', ');
  const setList = cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ');

  await pool.query(
    `INSERT INTO service_branding (organization_id, service_type, ${colList})
     VALUES ($1, $2, ${placeholders})
     ON CONFLICT (organization_id, service_type)
     DO UPDATE SET ${setList}, updated_at = NOW()`,
    [orgId, service, ...vals]
  );

  return getServiceBranding(orgId, service);
}

/** Persist the logo URL + MinIO key for a service (used by the logo upload endpoint). */
export async function setServiceLogo(
  orgId: string,
  service: ServiceType,
  logoUrl: string,
  logoKey: string
): Promise<ServiceBranding | null> {
  await pool.query(
    `INSERT INTO service_branding (organization_id, service_type, logo_url, logo_key)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, service_type)
     DO UPDATE SET logo_url = EXCLUDED.logo_url, logo_key = EXCLUDED.logo_key, updated_at = NOW()`,
    [orgId, service, logoUrl, logoKey]
  );
  return getServiceBranding(orgId, service);
}
