/**
 * Branding Service
 *
 * Single source of truth for turning an organization's saved "Company Branding"
 * (Settings → Valuation) into a normalized object that invoices, valuation
 * reports (DOCX/HTML/cover) and emails can all consume.
 *
 * Every field falls back to the legacy PROPMETRIK defaults, so an org that has
 * NOT configured branding renders exactly as before — nothing breaks.
 *
 * @module services/valuation-engine/brandingService
 */
import axios from 'axios';
import { getOrgSettings } from './orgSettingsService';
import { logger } from '../../utils/logger';

export interface ResolvedBranding {
  orgId: string | null;
  name: string;                 // firm/company name (replaces "PROPMETRIK")
  tagline: string;              // short subtitle under the name
  credentialLine: string | null; // e.g. "GhIS Reg. GhIS/REG/2024/001 · Member, Ghana Institution of Surveyors"
  logoUrl: string | null;       // browser-loadable URL (used directly in HTML emails)
  logoBuffer: Buffer | null;    // raster bytes for PDF/DOCX embedding (null if none/failed/SVG)
  logoMime: string | null;
  primaryColor: string;         // "#RRGGBB"
  accentColor: string;          // "#RRGGBB"
  secondaryColor: string;       // "#RRGGBB"
  onPrimary: string;            // "#RRGGBB" — readable text color on primaryColor (contrast-safe)
  onAccent: string;             // "#RRGGBB" — readable text color on accentColor
  fontFamily: string;
  professionalBody: string | null;
  licenseNumber: string | null;
  taxId: string | null;
  phone: string | null;
  website: string | null;
  addressLines: string[];       // composed street/city/country lines (may be empty)
  contactLine: string;          // "phone  ·  website" (may be empty)
}

const DEFAULTS = {
  name: 'PROPMETRIK',
  valuationName: 'PROPMETRIK Valuations',
  tagline: 'REAL ESTATE INTELLIGENCE',
  primaryColor: '#18181B',
  accentColor: '#F59E0B',
  secondaryColor: '#334155',
  fontFamily: 'Calibri',
};

/** Normalize a hex color to "#RRGGBB" (uppercase); fall back if invalid. */
function normHex(v: string | undefined | null, fallback: string): string {
  if (!v) return fallback;
  let s = v.trim();
  if (!s.startsWith('#')) s = `#${s}`;
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : fallback;
}

/** docx/OOXML wants hex WITHOUT the leading '#'. */
export function hexNoHash(hex: string): string {
  return hex.replace('#', '').toUpperCase();
}

// ── Shared color utilities (single source — used by the DOCX theming + report viewer) ──
export function hexToRgb(hex: string): [number, number, number] {
  const s = hex.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
/** WCAG relative luminance (0 dark → 1 light). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Readable text color ('#18181B' dark or '#FFFFFF' white) for the given background. */
export function readableOn(bgHex: string): string {
  return luminance(bgHex) > 0.5 ? '#18181B' : '#FFFFFF';
}
/** Mix a hex toward white (pct>0) or black (pct<0). pct in [-1,1]. Returns "#RRGGBB". */
export function shade(hex: string, pct: number): string {
  const [r, g, b] = hexToRgb(hex);
  const target = pct < 0 ? 0 : 255;
  const p = Math.min(1, Math.abs(pct));
  const mix = (v: number) => Math.round(v + (target - v) * p);
  return '#' + [mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Fetch a logo's raster bytes for embedding. Handles data: URIs and http(s) URLs; returns null on any failure or for SVG (not embeddable in PDFKit/docx). */
async function fetchLogoBuffer(logoUrl: string | null | undefined): Promise<{ buffer: Buffer; mime: string } | null> {
  if (!logoUrl) return null;
  try {
    if (logoUrl.startsWith('data:')) {
      const m = logoUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) return null;
      if (!/(png|jpe?g)/i.test(m[1])) return null; // only raster PNG/JPEG embed safely in PDFKit/docx
      return { buffer: Buffer.from(m[2], 'base64'), mime: m[1] };
    }
    if (/^https?:\/\//i.test(logoUrl)) {
      const res = await axios.get(logoUrl, {
        responseType: 'arraybuffer',
        timeout: 8000,
        maxContentLength: 5 * 1024 * 1024,
      });
      const mime = (res.headers['content-type'] as string) || 'image/png';
      if (!/(png|jpe?g)/i.test(mime)) return null; // reject SVG/webp/gif — unsafe for PDFKit/docx
      return { buffer: Buffer.from(res.data), mime };
    }
    return null;
  } catch (err: any) {
    logger.warn('Branding: logo fetch failed', { logoUrl, error: err?.message });
    return null;
  }
}

/**
 * Resolve an organization's branding into a render-ready object.
 * @param orgId  the organization id (valuer_organization_id for valuations)
 * @param opts.context  'valuation' → default name "PROPMETRIK Valuations"; else "PROPMETRIK"
 * @param opts.withLogo  fetch the logo bytes (true for PDF/DOCX; false for HTML email which uses logoUrl directly)
 */
export async function resolveReportBranding(
  orgId: string | null | undefined,
  opts?: { context?: 'valuation' | 'generic'; withLogo?: boolean }
): Promise<ResolvedBranding> {
  const defaultName = opts?.context === 'valuation' ? DEFAULTS.valuationName : DEFAULTS.name;

  let s: Awaited<ReturnType<typeof getOrgSettings>> = null;
  if (orgId) {
    try {
      s = await getOrgSettings(orgId);
    } catch (err: any) {
      logger.warn('Branding: getOrgSettings failed', { orgId, error: err?.message });
    }
  }

  const addressLines = [
    [s?.address_line1, s?.address_line2].filter(Boolean).join(', '),
    [s?.city, s?.region, s?.postal_code].filter(Boolean).join(', '),
    s?.country || (s ? 'Ghana' : ''),
  ].filter(Boolean) as string[];

  const credParts = [
    s?.license_number ? `Reg. ${s.license_number}` : null,
    s?.professional_body || null,
  ].filter(Boolean) as string[];

  let logo: { buffer: Buffer; mime: string } | null = null;
  if (opts?.withLogo !== false && s?.logo_url) {
    logo = await fetchLogoBuffer(s.logo_url);
  }

  return {
    orgId: orgId || null,
    name: s?.name?.trim() || defaultName,
    tagline: (s?.description?.trim() && s.description.trim().length <= 64)
      ? s.description.trim()
      : DEFAULTS.tagline,
    credentialLine: credParts.length ? credParts.join('  ·  ') : null,
    logoUrl: s?.logo_url || null,
    logoBuffer: logo?.buffer || null,
    logoMime: logo?.mime || null,
    primaryColor: normHex(s?.primary_color, DEFAULTS.primaryColor),
    accentColor: normHex(s?.accent_color, DEFAULTS.accentColor),
    secondaryColor: normHex(s?.secondary_color, DEFAULTS.secondaryColor),
    onPrimary: readableOn(normHex(s?.primary_color, DEFAULTS.primaryColor)),
    onAccent: readableOn(normHex(s?.accent_color, DEFAULTS.accentColor)),
    fontFamily: s?.font_family?.trim() || DEFAULTS.fontFamily,
    professionalBody: s?.professional_body?.trim() || null,
    licenseNumber: s?.license_number?.trim() || null,
    taxId: s?.tax_id?.trim() || null,
    phone: s?.phone?.trim() || null,
    website: s?.website?.trim() || null,
    addressLines,
    contactLine: [s?.phone, s?.website].filter(Boolean).join('  ·  '),
  };
}
