// Data Hub API Types

// =====================================================
// ENUMS
// =====================================================

export type DataSourceTier =
  | 'tier1_government'
  | 'tier2_financial'
  | 'tier3_partners'
  | 'tier3b_user_generated'
  | 'tier4_market_data'
  | 'tier5_public_web';

export type SyncFrequency =
  | 'realtime'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'on_demand';

export type EtlJobType =
  | 'scrape'
  | 'api_sync'
  | 'file_import'
  | 'contribution'
  | 'geocoding'
  | 'enrichment'
  | 'deduplication'
  | 'quality_scoring';

export type EtlJobStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'retrying';

export type ContributorType =
  | 'valuer'
  | 'agent'
  | 'owner'
  | 'developer'
  | 'lender'
  | 'system';

export type ContributionType =
  | 'new_property'
  | 'comparable'
  | 'enrichment'
  | 'correction'
  | 'verification'
  | 'photo'
  | 'document'
  | 'transaction';

export type ValidationStatus =
  | 'pending'
  | 'auto_approved'
  | 'auto_rejected'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'needs_info';

export type ContributorTier =
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'expert';

export type RegionCode =
  | 'greater_accra'
  | 'kumasi_metro'
  | 'eastern'
  | 'western_cluster'
  | 'northern_cluster';

// =====================================================
// DATA SOURCE INTERFACES
// =====================================================

export interface DataSource {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  tier: DataSourceTier;
  trust_score: number;
  data_quality_score: number;
  api_endpoint: string | null;
  sync_frequency: SyncFrequency;
  last_sync_at: string | null;
  last_sync_status: EtlJobStatus | null;
  next_sync_at: string | null;
  total_records_synced: number;
  total_properties_added: number;
  total_properties_updated: number;
  total_errors: number;
  regions_covered: RegionCode[];
  is_active: boolean;
  is_paused: boolean;
  pause_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface DataSourceStats {
  tier: DataSourceTier;
  count: number;
  active: number;
  paused: number;
  total_records: number;
}

// =====================================================
// ETL JOB INTERFACES
// =====================================================

export interface EtlJob {
  id: string;
  source_id: string | null;
  job_type: EtlJobType;
  job_name: string | null;
  status: EtlJobStatus;
  priority: number;
  records_total: number;
  records_processed: number;
  records_successful: number;
  records_failed: number;
  records_skipped: number;
  progress_percentage: number;
  properties_created: number;
  properties_updated: number;
  properties_deduplicated: number;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  error_count: number;
  last_error: string | null;
  retry_count: number;
  max_retries: number;
  created_at: string;
  updated_at: string;
}

export interface EtlJobStats {
  total: number;
  by_status: Record<EtlJobStatus, number>;
  by_type: Record<EtlJobType, number>;
  avg_duration_seconds: number;
  total_records_processed: number;
}

export interface EtlJobLog {
  id: string;
  job_id: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  step: string | null;
  logged_at: string;
}

// =====================================================
// CONTRIBUTION INTERFACES
// =====================================================

export interface Contribution {
  id: string;
  contributor_id: string;
  contributor_type: ContributorType;
  contribution_type: ContributionType;
  property_id: string | null;
  property_region: RegionCode | null;
  data: Record<string, unknown>;
  validation_status: ValidationStatus;
  trust_score: number | null;
  quality_score: number | null;
  validated_by: string | null;
  validated_at: string | null;
  validation_notes: string | null;
  is_applied: boolean;
  credits_awarded: number;
  credits_pending: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContributorProfile {
  user_id: string;
  tier: ContributorTier;
  reputation_score: number;
  total_contributions: number;
  accepted_contributions: number;
  rejected_contributions: number;
  pending_contributions: number;
  average_quality_score: number;
  credits_balance: number;
  is_verified_professional: boolean;
  professional_type: ContributorType | null;
  primary_region: RegionCode | null;
  streak_days: number;
}

// =====================================================
// ECONOMIC DATA INTERFACES
// =====================================================

export interface EconomicSnapshot {
  date: string;
  inflation_rate: number | null;
  interest_rate_policy: number | null;
  exchange_rate_usd: number | null;
  exchange_rate_gbp: number | null;
  exchange_rate_eur: number | null;
  gdp_growth: number | null;
  unemployment_rate: number | null;
  mortgage_rate_avg: number | null;
}

export interface EconomicIndicator {
  id: string;
  indicator_type: string;
  indicator_name: string;
  value: number;
  previous_value: number | null;
  change_percentage: number | null;
  unit: string;
  effective_date: string;
  period_type: string;
  source_name: string;
  source_url: string | null;
  source_reference: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
}

// =====================================================
// CONSTRUCTION COST INTERFACES
// =====================================================

export interface MaterialPrice {
  id: string;
  material_category: string;
  material_name: string;
  brand: string | null;
  specification: string | null;
  price_ghs: number;
  previous_price_ghs: number | null;
  price_change_percent: number | null;
  unit: string;
  region: RegionCode;
  supplier_type: 'retail' | 'wholesale' | 'manufacturer';
  survey_date: string;
}

export interface LaborRate {
  id: string;
  labor_category: string;
  skill_level: 'apprentice' | 'journeyman' | 'master' | 'specialist';
  rate_ghs: number;
  previous_rate_ghs: number | null;
  rate_change_percent: number | null;
  rate_type: 'daily' | 'hourly';
  region: RegionCode;
  survey_date: string;
}

export interface ConstructionEstimate {
  total_cost: number;
  cost_per_sqm: number;
  breakdown: {
    materials: number;
    labor: number;
    equipment: number;
    overheads: number;
  };
  region_multiplier: number;
  quality_multiplier: number;
}

// =====================================================
// QUEUE INTERFACES
// =====================================================

export interface QueueStats {
  [queueName: string]: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
}

// =====================================================
// API RESPONSE INTERFACES
// =====================================================

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}
