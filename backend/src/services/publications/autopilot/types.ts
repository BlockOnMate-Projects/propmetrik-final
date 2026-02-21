/**
 * Autopilot Pipeline — Types & Interfaces
 *
 * Shared type definitions for the autonomous publication pipeline.
 * Two-Product Model: Ghana Real Estate Outlook + Ghana Property Snapshot
 * Covers schedules, pipeline runs, quality gates, chart selection,
 * anomaly detection, and the autopilot settings singleton.
 */

// ============================================================
// TWO-PRODUCT MODEL TYPES
// ============================================================

export type ProductType = 'outlook' | 'snapshot' | 'policy_paper' | 'press_release' | 'podcast';
export type EditionType = 'monthly' | 'quarterly' | 'annual' | 'weekly' | 'adhoc';

/** Weekly rotation for Snapshot lead focus */
export type WeeklyFocus = 'construction' | 'residential' | 'investment' | 'economy';

/** @deprecated Use ProductType instead — kept for backward compat during migration */
export type PublicationType =
  | 'market_flash'
  | 'data_brief'
  | 'marketbeat'
  | 'research_report'
  | 'special_report'
  | 'annual_flagship'
  | 'policy_paper'
  | 'podcast'
  | 'video'
  | 'index_update'
  | 'webinar'
  | 'press_release';

/** Maps old publication types to new product + edition */
export const LEGACY_TYPE_MAP: Record<string, { product: ProductType; edition: EditionType }> = {
  market_flash: { product: 'snapshot', edition: 'adhoc' },
  data_brief: { product: 'snapshot', edition: 'weekly' },
  marketbeat: { product: 'outlook', edition: 'monthly' },
  research_report: { product: 'outlook', edition: 'quarterly' },
  special_report: { product: 'outlook', edition: 'annual' },
  annual_flagship: { product: 'outlook', edition: 'annual' },
  policy_paper: { product: 'policy_paper', edition: 'adhoc' },
  podcast: { product: 'podcast', edition: 'weekly' },
  video: { product: 'podcast', edition: 'weekly' },
  index_update: { product: 'outlook', edition: 'monthly' },
  webinar: { product: 'podcast', edition: 'weekly' },
  press_release: { product: 'press_release', edition: 'adhoc' },
};

/** Valid product → edition combinations */
export const PRODUCT_EDITIONS: Record<ProductType, EditionType[]> = {
  outlook: ['monthly', 'quarterly', 'annual'],
  snapshot: ['weekly', 'adhoc'],
  policy_paper: ['adhoc'],
  press_release: ['adhoc'],
  podcast: ['weekly'],
};

/** Weekly focus rotation: week# mod 4 → focus */
export const WEEKLY_FOCUS_ROTATION: WeeklyFocus[] = ['construction', 'residential', 'investment', 'economy'];

export type AutopilotRunStatus = 'running' | 'published' | 'deferred' | 'failed';

export type AutomationMode = 'manual' | 'autopilot';

// ============================================================
// SCHEDULE
// ============================================================

export interface AutopilotSchedule {
  id: string;
  publication_type: PublicationType; // @deprecated — kept for DB compat
  product: ProductType;
  edition: EditionType;
  region: string | null;
  cron_expression: string;          // node-cron compatible or 'EVENT_DRIVEN'
  enabled: boolean;
  data_endpoints: string[];         // analytics API endpoints to consume
  chart_rules: ChartSelectionRules;
  template_id: string;
  quality_thresholds: QualityThresholds;
  word_count_target: number;
  created_at: string;
  updated_at: string;
}

export interface ChartSelectionRules {
  count: [number, number];          // [min, max] charts to include
  diversityMin?: number;            // min # of distinct chart types
  mustInclude?: string[];           // metric names that must appear
}

export interface QualityThresholds {
  minConfidence: number;            // 0.00 – 1.00
  maxSimilarity: number;            // cosine similarity cap against last edition
  maxDataAgeDays: number;           // max age of consumed data points
}

// ============================================================
// PIPELINE RUN
// ============================================================

export interface AutopilotRun {
  id: string;
  schedule_id: string | null;
  publication_type: PublicationType; // @deprecated — kept for DB compat
  product: ProductType;
  edition: EditionType;
  region: string | null;
  status: AutopilotRunStatus;
  publication_id: string | null;

  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;

  data_endpoints_consumed: string[];
  data_snapshot: Record<string, unknown> | null;

  ai_model: string | null;
  ai_tokens_used: number | null;
  generation_prompt_hash: string | null;

  gate_results: QualityGateResults | null;
  confidence_score: number | null;
  similarity_score: number | null;

  deferred_reason: string | null;
  error_message: string | null;

  created_at: string;
}

export interface AutopilotRunResult {
  status: AutopilotRunStatus;
  publicationId?: string;
  reason?: string;
  error?: string;
}

// ============================================================
// QUALITY GATES
// ============================================================

export interface QualityGateResults {
  allPassed: boolean;
  confidence: number;
  failureReason: string | null;
  layers: {
    structural: QualityLayerResult;
    factual: QualityLayerResult;
    content: QualityLayerResult;
    freshness: QualityLayerResult;
  };
}

export interface QualityLayerResult {
  name: string;
  passed: boolean;
  checks: QualityCheck[];
  score?: number;
  details?: string;
}

export interface QualityCheck {
  name: string;
  passed: boolean;
  expected?: string;
  actual?: string;
  message?: string;
}

// ============================================================
// CONTENT GENERATION
// ============================================================

export interface GenerationInput {
  product: ProductType;
  edition: EditionType;
  type: PublicationType;           // @deprecated — kept for backward compat
  template: string;
  region?: string;
  weeklyFocus?: WeeklyFocus;       // for snapshot weekly rotation
  data: Record<string, unknown>;
  macro: Record<string, unknown>;
  previousEdition: PreviousEdition | null;
  chartRules: ChartSelectionRules;
}

export interface PreviousEdition {
  id: string;
  title: string;
  content_json: unknown[];
  content_html: string | null;
  published_at: string;
  word_count: number;
}

export interface GeneratedDraft {
  title: string;
  subtitle: string | null;
  product: ProductType;
  edition: EditionType;
  type: PublicationType;           // @deprecated — kept for backward compat
  templateId: string;
  sections: GeneratedSection[];
  keyFindings: string[];
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
  sectors: string[];
  topics: string[];
  regions: string[];
  charts: SelectedChart[];
  wordCount: number;
  aiModel: string;
  aiTokensUsed: number;
}

export interface GeneratedSection {
  heading: string;
  content: string;
  aiGenerated: boolean;
  sectionType: string;
}

// ============================================================
// CHART SELECTION
// ============================================================

export interface SelectedChart {
  endpoint: string;
  params: Record<string, unknown>;
  chartType: string;
  title: string;
  aiInsight: string;
  snapshotData: Record<string, unknown>;
  significanceRank: number;         // 1 = most significant
}

export interface ChartCandidate {
  endpoint: string;
  params: Record<string, unknown>;
  title: string;
  chartType: string;
  metricName: string;
  currentValue: number;
  previousValue: number;
  absoluteChange: number;
  percentChange: number;
  deviationFromTrend: number;
  dataTimestamp: string;
}

// ============================================================
// ANOMALY DETECTION (Market Flash)
// ============================================================

export interface AnomalyThresholds {
  priceIndexChange: number;         // % GHPI move threshold
  cciSpike: number;                 // % CCI move threshold
  vacancyShift: number;             // percentage-point shift
  volumeSpike: number;              // % above 30d average
  sentimentSwing: number;           // PSI point shift
}

export interface DetectedAnomaly {
  metric: string;
  endpoint: string;
  currentValue: number;
  previousValue: number;
  change: number;
  changeType: 'percent' | 'absolute' | 'points';
  severity: 'moderate' | 'high' | 'critical';
  detectedAt: string;
  description: string;
}

// ============================================================
// AUTOPILOT SETTINGS (singleton)
// ============================================================

export interface AutopilotSettings {
  id: number;
  global_enabled: boolean;
  max_publishes_per_day: number;
  max_flashes_per_day: number;
  default_confidence_floor: number;
  review_window_hours: number;
  updated_at: string;
}

// ============================================================
// PUBLISH OPTIONS
// ============================================================

export interface PublishOptions {
  gateResults: QualityGateResults;
  generatePdf: boolean;
  distributeNewsletter: boolean;
  postSocial: boolean;
  updateIndex: boolean;
}

// ============================================================
// DASHBOARD / HEALTH
// ============================================================

export interface AutopilotHealth {
  globalEnabled: boolean;
  scheduledCount: number;
  last30Days: {
    published: number;
    deferred: number;
    failed: number;
  };
  avgConfidence: number;
  nextScheduled: UpcomingPublication[];
  deferredItems: DeferredItem[];
}

export interface UpcomingPublication {
  scheduleId: string;
  publicationType: PublicationType; // @deprecated
  product: ProductType;
  edition: EditionType;
  region: string | null;
  nextRunAt: string;
  templateId: string;
}

export interface DeferredItem {
  runId: string;
  publicationId: string;
  publicationType: PublicationType; // @deprecated
  product: ProductType;
  edition: EditionType;
  region: string | null;
  reason: string;
  confidence: number | null;
  deferredAt: string;
}

// ============================================================
// TEMPLATE SECTIONS — per publication type
// ============================================================

export interface PublicationTemplate {
  id: string;
  product: ProductType;
  edition: EditionType;
  name: string;
  sections: TemplateSectionDef[];
  wordCountTarget: number;
  chartCountRange: [number, number];
}

export interface TemplateSectionDef {
  sectionType: string;
  heading: string;
  required: boolean;
  maxWords: number;
  chartSlot?: boolean;              // if true, a chart should precede/follow this section
}
