/**
 * Publication Templates — Two-Product Model
 *
 * 4 templates for the autonomous pipeline:
 *   - Ghana Real Estate Outlook: Monthly, Quarterly, Annual
 *   - Ghana Property Snapshot: Weekly
 *
 * Each template defines the exact sections the AI should generate,
 * their approximate word counts, and whether a chart slot accompanies them.
 */
import { PublicationTemplate, EditionType, WeeklyFocus } from './types';

// ============================================================
// OUTLOOK — 10 FIXED SECTIONS (depth scales by edition)
// ============================================================

/** Standard 10-section structure shared by all Outlook editions */
function outlookSections(edition: EditionType): PublicationTemplate['sections'] {
  const scale = edition === 'annual' ? 3 : edition === 'quarterly' ? 2 : 1;
  return [
    { sectionType: 'executive_summary', heading: 'Executive Summary', required: true, maxWords: [300, 500, 800][scale - 1] },
    { sectionType: 'macro_context', heading: 'Macroeconomic Context', required: true, maxWords: [250, 600, 1200][scale - 1], chartSlot: true },
    { sectionType: 'residential_market', heading: 'Residential Market', required: true, maxWords: [400, 800, 2000][scale - 1], chartSlot: true },
    { sectionType: 'rental_market', heading: 'Rental Market & Yields', required: true, maxWords: [350, 700, 1800][scale - 1], chartSlot: true },
    { sectionType: 'commercial_market', heading: 'Commercial Market', required: true, maxWords: [250, 700, 1500][scale - 1], chartSlot: true },
    { sectionType: 'construction', heading: 'Construction & Development', required: true, maxWords: [400, 600, 1500][scale - 1], chartSlot: true },
    { sectionType: 'investment', heading: 'Investment & Capital Markets', required: true, maxWords: [250, 600, 1500][scale - 1], chartSlot: true },
    { sectionType: 'regional_snapshots', heading: 'Regional Snapshots', required: true, maxWords: [400, 1200, 3000][scale - 1], chartSlot: true },
    { sectionType: 'risk_resilience', heading: 'Risk & Resilience', required: true, maxWords: [250, 500, 1000][scale - 1], chartSlot: true },
    { sectionType: 'outlook_forecasts', heading: 'Outlook & Forecasts', required: true, maxWords: [400, 600, 1500][scale - 1], chartSlot: true },
    { sectionType: 'methodology', heading: 'Methodology & Data Science Framework', required: true, maxWords: [250, 400, 600][scale - 1] },
    // Annual-only appendices (ignored for monthly/quarterly)
    ...(edition === 'annual' ? [
      { sectionType: 'horizons_appendix' as const, heading: 'Appendix A — Ghana Horizons: Pan-African Benchmarking', required: true, maxWords: 3000, chartSlot: true },
      { sectionType: 'wealth_luxury_appendix' as const, heading: 'Appendix B — Wealth & Luxury Property Review', required: true, maxWords: 2500, chartSlot: true },
    ] : []),
  ];
}

// ============================================================
// TEMPLATE REGISTRY — 4 Templates
// ============================================================

export const PUBLICATION_TEMPLATES: Record<string, PublicationTemplate> = {

  // ── OUTLOOK — MONTHLY (8-14 pages, ~4,000 words) ─────────
  outlook_monthly_v1: {
    id: 'outlook_monthly_v1',
    product: 'outlook',
    edition: 'monthly',
    name: 'Ghana Real Estate Outlook — Monthly Edition',
    wordCountTarget: 4500,
    chartCountRange: [8, 12],
    sections: outlookSections('monthly'),
  },

  // ── OUTLOOK — QUARTERLY (20-30 pages, ~10,000 words) ─────
  outlook_quarterly_v1: {
    id: 'outlook_quarterly_v1',
    product: 'outlook',
    edition: 'quarterly',
    name: 'Ghana Real Estate Outlook — Quarterly Edition',
    wordCountTarget: 10000,
    chartCountRange: [10, 15],
    sections: outlookSections('quarterly'),
  },

  // ── OUTLOOK — ANNUAL (50-80 pages, ~25,000 words) ────────
  outlook_annual_v1: {
    id: 'outlook_annual_v1',
    product: 'outlook',
    edition: 'annual',
    name: 'Ghana Real Estate Outlook — Annual Edition',
    wordCountTarget: 25000,
    chartCountRange: [20, 30],
    sections: outlookSections('annual'),
  },

  // ── SNAPSHOT — WEEKLY (400-600 words, 5 fixed blocks) ────
  snapshot_weekly_v1: {
    id: 'snapshot_weekly_v1',
    product: 'snapshot',
    edition: 'weekly',
    name: 'Ghana Property Snapshot',
    wordCountTarget: 500,
    chartCountRange: [2, 2],
    sections: [
      { sectionType: 'weekly_lead', heading: "This Week's Lead", required: true, maxWords: 200, chartSlot: true },
      { sectionType: 'index_pulse', heading: 'Index Pulse', required: true, maxWords: 50 },
      { sectionType: 'chart_of_week', heading: 'Chart of the Week', required: true, maxWords: 50, chartSlot: true },
      { sectionType: 'what_to_watch', heading: 'What to Watch', required: true, maxWords: 60 },
      { sectionType: 'from_archive', heading: 'From the Archive', required: true, maxWords: 30 },
    ],
  },

  // ── INDEX DIGEST — WEEKLY (1,000-1,500 words, 3-5 charts) ─
  index_digest_v1: {
    id: 'index_digest_v1',
    product: 'outlook',
    edition: 'weekly',
    name: 'Ghana Indices & Data Digest',
    wordCountTarget: 1200,
    chartCountRange: [3, 5],
    sections: [
      { sectionType: 'executive_summary', heading: 'Index Summary', required: true, maxWords: 200 },
      { sectionType: 'cci_update', heading: 'Construction Cost Index (CCI)', required: true, maxWords: 250, chartSlot: true },
      { sectionType: 'ghai_update', heading: 'Housing Affordability Index (GHAI)', required: true, maxWords: 250, chartSlot: true },
      { sectionType: 'ghpi_update', heading: 'Property Price Index (GHPI)', required: true, maxWords: 200, chartSlot: true },
      { sectionType: 'rental_market', heading: 'Rental Yield & Cap Rates', required: true, maxWords: 200, chartSlot: true },
      { sectionType: 'what_to_watch', heading: 'What Changed & What to Watch', required: true, maxWords: 150 },
    ],
  },
};

// ============================================================
// WEEKLY ROTATION — determines Snapshot lead focus
// ============================================================

/** Map week-of-month (1-4) to content focus area */
export const WEEKLY_ROTATION: Record<number, WeeklyFocus> = {
  1: 'construction',
  2: 'residential',
  3: 'investment',
  4: 'economy',
};

/** Data endpoints per weekly focus */
export const WEEKLY_FOCUS_ENDPOINTS: Record<WeeklyFocus, string[]> = {
  construction: [
    'ml/construction/index',
    'ml/construction/regional',
    'ml/construction/materials',
    'ml/construction/labor',
    'ml/construction/forecast',
  ],
  residential: [
    'ml/market/price-index',
    'ml/hai/current',
    'ml/hai/region/greater_accra',
    'ml/market/activity',
    'rental/summary',
    'rental/yields',
    'rental/trends',
  ],
  investment: [
    'ml/market/investment',
    'ml/valuations/volume',
    'velocity',
    'cohorts',
    'rental/yields',
    'rental/benchmarks',
  ],
  economy: [
    'dashboard',
    'ml/market/price-index',
    'ml/performance',
    'ml/monitoring/drift',
  ],
};

/**
 * Get a template by ID, or fall back to monthly outlook
 */
export function getTemplate(templateId: string): PublicationTemplate {
  return PUBLICATION_TEMPLATES[templateId] || PUBLICATION_TEMPLATES['outlook_monthly_v1'];
}

/**
 * Get the weekly focus for a given date
 */
export function getWeeklyFocus(date: Date = new Date()): WeeklyFocus {
  const weekOfMonth = Math.ceil(date.getDate() / 7);
  return WEEKLY_ROTATION[Math.min(weekOfMonth, 4)] || 'economy';
}
