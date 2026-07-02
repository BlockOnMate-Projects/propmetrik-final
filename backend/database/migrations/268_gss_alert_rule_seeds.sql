-- ============================================================================
-- Migration 268: GSS macro alert-rule seeds (Slice 5 §E-16)
--
-- Inserts 5 pre-built macro alert rules into analytics_alert_rules. Each is
-- resolved by alertService.fetchMetricValue() case 'macro' against the live GSS
-- tables ingested in Slices 1–2b, so they evaluate for real (not display-only).
--
-- Conditions use direct gt/lt on a metric the resolver computes (YoY or a
-- period delta), rather than the change_gt path (which needs a prior-value
-- fetch the service leaves as a no-op).
--
-- Idempotent: each INSERT is guarded by NOT EXISTS on the rule name.
-- ============================================================================

INSERT INTO analytics_alert_rules
  (id, name, description, category, metric_name, region, condition, threshold_value,
   comparison_period, severity, cooldown_hours, is_active, created_by, created_at, updated_at)
SELECT uuid_generate_v4(), v.name, v.description, 'macro', v.metric_name, NULL, v.condition,
       v.threshold_value, v.comparison_period, v.severity, 24, TRUE, NULL, NOW(), NOW()
FROM (VALUES
  ('PPI Construction Spike',
   'Producer Price Index for Construction rose more than 20% year-on-year (GSS ppi.px). Signals sharp input-cost inflation for developers.',
   'ppi_construction_yoy', 'gt', 20.0, 'yoy', 'critical'),
  ('Lending Rate Surge',
   'Average lending rate climbed more than 3 percentage points over the last quarter (GSS interest.px / BoG). Tightens mortgage affordability.',
   'lending_rate_change_3m', 'gt', 3.0, 'quarter', 'warning'),
  ('NPL Deterioration',
   'Banking non-performing loan ratio exceeded 12% (GSS fin_sound.px). Elevated systemic credit risk.',
   'npl_ratio', 'gt', 12.0, 'latest', 'critical'),
  ('MIEG Contraction',
   'Total Monthly Indicator of Economic Growth turned negative year-on-year (GSS mieg.px). Broad economic contraction signal.',
   'mieg_total_yoy', 'lt', 0.0, 'yoy', 'warning'),
  ('Import Material Inflation',
   'Construction-material import unit-value index rose more than 15% year-on-year (GSS trade HS2). Imported-input cost pressure.',
   'construction_import_uvi_yoy', 'gt', 15.0, 'yoy', 'warning')
) AS v(name, description, metric_name, condition, threshold_value, comparison_period, severity)
WHERE NOT EXISTS (
  SELECT 1 FROM analytics_alert_rules ar WHERE ar.name = v.name
);
