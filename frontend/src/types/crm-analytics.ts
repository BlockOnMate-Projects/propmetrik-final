// =====================================================
// CRM ANALYTICS TYPES — Phase 4
// =====================================================

// ── Period & Date Range ──────────────────────────────

export type AnalyticsPeriod = 'week' | 'month' | 'quarter' | 'year' | 'custom'

export interface DateRange {
  from: string // ISO date
  to: string
}

export interface PeriodPreset {
  label: string
  period: AnalyticsPeriod
  getRange: () => DateRange
}

// ── Pipeline Funnel ──────────────────────────────────

export interface FunnelStage {
  stage_id: string
  stage_name: string
  stage_color: string
  position: number
  deal_count: number
  total_value: number
  conversion_rate: number // % that moved to next stage
  avg_time_days: number   // avg days in this stage
}

export interface FunnelData {
  pipeline_id: string
  pipeline_name: string
  stages: FunnelStage[]
  overall_conversion: number // lead → won %
}

// ── Revenue Time Series ──────────────────────────────

export interface RevenueDataPoint {
  period: string       // e.g. '2026-01', '2026-02'
  period_label: string // e.g. 'Jan 2026'
  won_value: number
  lost_value: number
  new_pipeline: number
  deal_count: number
  won_count: number
  lost_count: number
}

export interface RevenueTrend {
  data: RevenueDataPoint[]
  total_won: number
  total_lost: number
  avg_monthly_won: number
}

// ── Deal Velocity ────────────────────────────────────

export interface StageVelocity {
  stage_name: string
  stage_color: string
  avg_days: number
  median_days: number
  min_days: number
  max_days: number
  deal_count: number
}

export interface DealVelocity {
  overall_avg_days: number
  overall_median_days: number
  by_stage: StageVelocity[]
  by_deal_type: Array<{
    deal_type: string
    avg_days: number
    deal_count: number
  }>
  trend: Array<{
    period: string
    avg_days: number
    deal_count: number
  }>
}

// ── Loss Reason Analysis ─────────────────────────────

export const LOSS_REASONS = [
  'price_too_high',
  'competitor_won',
  'timing_not_right',
  'budget_constraints',
  'requirements_changed',
  'no_response',
  'location_mismatch',
  'financing_failed',
  'legal_issues',
  'other',
] as const

export type LossReason = typeof LOSS_REASONS[number]

export const LOSS_REASON_LABELS: Record<LossReason, string> = {
  price_too_high: 'Price Too High',
  competitor_won: 'Competitor Won',
  timing_not_right: 'Timing Not Right',
  budget_constraints: 'Budget Constraints',
  requirements_changed: 'Requirements Changed',
  no_response: 'No Response / Ghost',
  location_mismatch: 'Location Mismatch',
  financing_failed: 'Financing Failed',
  legal_issues: 'Legal Issues',
  other: 'Other',
}

export interface LossReasonData {
  reason: string
  label: string
  count: number
  total_value: number
  percentage: number
}

export interface LossAnalysis {
  total_lost: number
  total_lost_value: number
  by_reason: LossReasonData[]
  by_stage: Array<{
    stage_name: string
    lost_count: number
    lost_value: number
  }>
  trend: Array<{
    period: string
    lost_count: number
    lost_value: number
  }>
}

// ── Period Comparison ────────────────────────────────

export interface PeriodMetrics {
  deals_created: number
  deals_won: number
  deals_lost: number
  revenue_won: number
  revenue_lost: number
  pipeline_value: number
  avg_deal_value: number
  conversion_rate: number
  avg_cycle_days: number
}

export interface PeriodComparison {
  current: PeriodMetrics & { label: string }
  previous: PeriodMetrics & { label: string }
  changes: {
    deals_created: number    // % change
    deals_won: number
    deals_lost: number
    revenue_won: number
    revenue_lost: number
    pipeline_value: number
    avg_deal_value: number
    conversion_rate: number  // absolute point change
    avg_cycle_days: number
  }
}

// ── Agent Performance (enhanced) ─────────────────────

export interface AgentPerformanceRow {
  user_id: string
  name: string
  avatar_url?: string
  total_deals: number
  won_deals: number
  lost_deals: number
  active_deals: number
  pipeline_value: number
  won_value: number
  win_rate: number
  avg_cycle_days: number
}

// ── Scheduled Reports ────────────────────────────────

export type ReportType =
  | 'pipeline_summary'
  | 'agent_performance'
  | 'revenue_forecast'
  | 'deal_velocity'
  | 'loss_analysis'

export type ReportFrequency = 'daily' | 'weekly' | 'monthly'
export type ReportFormat = 'pdf' | 'excel'

export interface ScheduledReport {
  id: string
  report_type: ReportType
  frequency: ReportFrequency
  format: ReportFormat
  recipients: string[]
  pipeline_id?: string
  is_active: boolean
  last_sent_at?: string
  next_send_at?: string
  created_at: string
}

export interface CreateScheduledReport {
  report_type: ReportType
  frequency: ReportFrequency
  format: ReportFormat
  recipients: string[]
  pipeline_id?: string
}

// ── Export ────────────────────────────────────────────

export type ExportFormat = 'pdf' | 'excel' | 'csv'

export interface ExportRequest {
  type: 'deals' | 'contacts' | 'companies' | 'analytics'
  format: ExportFormat
  filters?: Record<string, string>
  date_range?: DateRange
}
