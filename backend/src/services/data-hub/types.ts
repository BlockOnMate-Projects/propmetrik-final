/**
 * Data Hub Types and Interfaces
 * Central type definitions for the Data Hub module
 */

// =====================================================
// ENUMS (matching database enums)
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
  credentials_ref: string | null;
  auth_type: string | null;
  sync_frequency: SyncFrequency;
  last_sync_at: Date | null;
  last_sync_status: EtlJobStatus | null;
  next_sync_at: Date | null;
  total_records_synced: number;
  total_properties_added: number;
  total_properties_updated: number;
  total_errors: number;
  spider_config: Record<string, unknown>;
  rate_limit_requests_per_minute: number;
  regions_covered: RegionCode[];
  is_active: boolean;
  is_paused: boolean;
  pause_reason: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
}

export interface CreateDataSourceInput {
  name: string;
  slug: string;
  description?: string;
  tier: DataSourceTier;
  trust_score?: number;
  api_endpoint?: string;
  credentials_ref?: string;
  auth_type?: string;
  sync_frequency?: SyncFrequency;
  spider_config?: Record<string, unknown>;
  rate_limit_requests_per_minute?: number;
  regions_covered?: RegionCode[];
  metadata?: Record<string, unknown>;
  created_by?: string;
}

export interface UpdateDataSourceInput {
  name?: string;
  description?: string;
  trust_score?: number;
  api_endpoint?: string;
  credentials_ref?: string;
  auth_type?: string;
  sync_frequency?: SyncFrequency;
  spider_config?: Record<string, unknown>;
  rate_limit_requests_per_minute?: number;
  regions_covered?: RegionCode[];
  is_active?: boolean;
  is_paused?: boolean;
  pause_reason?: string;
  metadata?: Record<string, unknown>;
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
  scheduled_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  duration_seconds: number | null;
  error_count: number;
  error_log: Array<{ timestamp: string; error: string; record_id?: string }>;
  last_error: string | null;
  retry_count: number;
  max_retries: number;
  config: Record<string, unknown>;
  result: Record<string, unknown>;
  worker_id: string | null;
  worker_hostname: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateEtlJobInput {
  source_id?: string;
  job_type: EtlJobType;
  job_name?: string;
  priority?: number;
  scheduled_at?: Date;
  config?: Record<string, unknown>;
  max_retries?: number;
}

export interface UpdateEtlJobInput {
  status?: EtlJobStatus;
  records_total?: number;
  records_processed?: number;
  records_successful?: number;
  records_failed?: number;
  records_skipped?: number;
  progress_percentage?: number;
  properties_created?: number;
  properties_updated?: number;
  properties_deduplicated?: number;
  started_at?: Date;
  completed_at?: Date;
  duration_seconds?: number;
  error_count?: number;
  error_log?: Array<{ timestamp: string; error: string; record_id?: string }>;
  last_error?: string;
  retry_count?: number;
  result?: Record<string, unknown>;
  worker_id?: string;
  worker_hostname?: string;
}

export interface EtlJobLog {
  id: string;
  job_id: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  step: string | null;
  record_id: string | null;
  record_data: Record<string, unknown> | null;
  error_stack: string | null;
  logged_at: Date;
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
  data_hash: string | null;
  validation_status: ValidationStatus;
  trust_score: number | null;
  quality_score: number | null;
  validated_by: string | null;
  validated_at: Date | null;
  validation_notes: string | null;
  auto_validation_result: Record<string, unknown> | null;
  is_applied: boolean;
  applied_at: Date | null;
  applied_property_id: string | null;
  credits_awarded: number;
  credits_pending: boolean;
  source_context: string | null;
  session_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateContributionInput {
  contributor_id: string;
  contributor_type: ContributorType;
  contribution_type: ContributionType;
  property_id?: string;
  property_region?: RegionCode;
  data: Record<string, unknown>;
  source_context?: string;
  session_id?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateContributionInput {
  validation_status?: ValidationStatus;
  trust_score?: number;
  quality_score?: number;
  validated_by?: string;
  validation_notes?: string;
  auto_validation_result?: Record<string, unknown>;
  is_applied?: boolean;
  applied_property_id?: string;
  credits_awarded?: number;
  credits_pending?: boolean;
  metadata?: Record<string, unknown>;
}

// =====================================================
// CONTRIBUTOR PROFILE INTERFACES
// =====================================================

export interface ContributorProfile {
  user_id: string;
  tier: ContributorTier;
  reputation_score: number;
  total_contributions: number;
  accepted_contributions: number;
  rejected_contributions: number;
  pending_contributions: number;
  average_quality_score: number;
  verification_rate: number;
  credits_balance: number;
  credits_lifetime_earned: number;
  credits_lifetime_spent: number;
  is_verified_professional: boolean;
  professional_type: ContributorType | null;
  license_number: string | null;
  license_verified_at: Date | null;
  primary_region: RegionCode | null;
  regions_active: RegionCode[];
  last_contribution_at: Date | null;
  streak_days: number;
  longest_streak_days: number;
  badges: Array<{ id: string; name: string; earned_at: string }>;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateContributorProfileInput {
  user_id: string;
  professional_type?: ContributorType;
  license_number?: string;
  primary_region?: RegionCode;
  metadata?: Record<string, unknown>;
}

export interface UpdateContributorProfileInput {
  reputation_score?: number;
  is_verified_professional?: boolean;
  professional_type?: ContributorType;
  license_number?: string;
  primary_region?: RegionCode;
  regions_active?: RegionCode[];
  metadata?: Record<string, unknown>;
}

// =====================================================
// CREDIT TRANSACTION INTERFACES
// =====================================================

export interface CreditTransaction {
  id: string;
  user_id: string;
  amount: number;
  balance_after: number;
  transaction_type: 'contribution_reward' | 'referral' | 'redemption' | 'adjustment';
  contribution_id: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

// =====================================================
// GEOCODING INTERFACES
// =====================================================

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  street_address: string | null;
  neighborhood: string | null;
  district: string | null;
  region: string | null;
  postal_code: string | null;
  country: string;
  confidence: number;
  match_type: 'exact' | 'interpolated' | 'approximate' | 'centroid';
  provider: 'mapbox' | 'google' | 'nominatim';
  provider_place_id: string | null;
}

export interface GeocodingCacheEntry extends GeocodingResult {
  id: string;
  address_input: string;
  address_normalized: string | null;
  address_hash: string;
  hit_count: number;
  last_used_at: Date;
  expires_at: Date | null;
  is_valid: boolean;
  raw_response: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

// =====================================================
// MARKET DATA INTERFACES
// =====================================================

export interface MarketDataSnapshot {
  id: string;
  snapshot_date: Date;
  period_type: 'daily' | 'weekly' | 'monthly';
  region: RegionCode;
  district: string | null;
  neighborhood: string | null;
  property_type: string | null;
  transaction_type: string | null;
  avg_price_ghs: number | null;
  median_price_ghs: number | null;
  min_price_ghs: number | null;
  max_price_ghs: number | null;
  price_per_sqm_avg: number | null;
  total_listings: number;
  new_listings: number;
  sold_listings: number;
  expired_listings: number;
  avg_days_on_market: number | null;
  median_days_on_market: number | null;
  price_change_pct: number | null;
  price_change_yoy_pct: number | null;
  supply_index: number | null;
  demand_index: number | null;
  absorption_rate: number | null;
  sample_size: number;
  confidence_level: number | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

// =====================================================
// PROPERTY DUPLICATE INTERFACES
// =====================================================

export interface PropertyDuplicate {
  id: string;
  property_id_1: string;
  property_region_1: RegionCode;
  property_id_2: string;
  property_region_2: RegionCode;
  similarity_score: number;
  address_similarity: number | null;
  location_similarity: number | null;
  features_similarity: number | null;
  image_similarity: number | null;
  status: 'potential' | 'confirmed' | 'rejected' | 'merged';
  resolved_by: string | null;
  resolved_at: Date | null;
  resolution_notes: string | null;
  merged_into_id: string | null;
  detected_by: 'algorithm' | 'user_report' | 'etl_job';
  detection_job_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

// =====================================================
// PROPERTY QUALITY METRICS INTERFACES
// =====================================================

export interface PropertyQualityMetrics {
  id: string;
  property_id: string;
  property_region: RegionCode;
  overall_score: number;
  completeness_score: number;
  accuracy_score: number;
  timeliness_score: number;
  consistency_score: number;
  uniqueness_score: number;
  fields_total: number;
  fields_filled: number;
  fields_verified: number;
  issues: Array<{ field: string; issue: string; severity: string }>;
  assessed_at: Date;
  assessed_by: string;
  created_at: Date;
}

// =====================================================
// PAGINATION & FILTERING
// =====================================================

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
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

export interface DataSourceFilters extends PaginationParams {
  tier?: DataSourceTier;
  is_active?: boolean;
  is_paused?: boolean;
  search?: string;
}

export interface EtlJobFilters extends PaginationParams {
  source_id?: string;
  job_type?: EtlJobType;
  status?: EtlJobStatus;
  from_date?: Date;
  to_date?: Date;
}

export interface ContributionFilters extends PaginationParams {
  contributor_id?: string;
  contribution_type?: ContributionType;
  validation_status?: ValidationStatus;
  property_region?: RegionCode;
  source_context?: string;
  from_date?: Date;
  to_date?: Date;
}
