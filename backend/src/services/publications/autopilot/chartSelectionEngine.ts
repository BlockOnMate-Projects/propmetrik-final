/**
 * Chart Selection Engine
 *
 * Intelligent chart selection for autopilot publications.
 * Picks charts based on data significance, narrative structure,
 * and visual diversity — per the spec in insights.md §15.3.2.
 */
import { config } from '../../../config';
import { logger } from '../../../utils/logger';
import * as geminiService from '../geminiService';
import type {
  ChartSelectionRules,
  SelectedChart,
  ChartCandidate,
  GeneratedDraft,
} from './types';

// ============================================================
// CHART TYPE CATALOG
// ============================================================

const CHART_TYPES = ['line', 'bar', 'area', 'heatmap', 'forecast', 'donut', 'gauge', 'stacked_bar', 'sparkline'] as const;

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Select and snapshot charts for a publication draft.
 *
 * 1. Fetch data from all consumed analytics endpoints
 * 2. Rank metrics by significance (absolute change, % change, deviation)
 * 3. Select top-N charts based on rules
 * 4. Ensure visual diversity
 * 5. Generate AI insight for each chart
 * 6. Snapshot data for deterministic rendering
 */
export async function selectCharts(
  dataPayload: Record<string, unknown>,
  dataEndpoints: string[],
  rules: ChartSelectionRules,
  region?: string,
): Promise<SelectedChart[]> {
  logger.info({ endpointCount: dataEndpoints.length, rules }, 'Starting chart selection');

  // Step 1: Build candidates from data payload
  const candidates = buildCandidates(dataPayload, dataEndpoints, region);
  logger.info({ totalCandidates: candidates.length, types: [...new Set(candidates.map(c=>c.chartType))] }, 'Chart candidates built');

  if (candidates.length === 0) {
    logger.warn('No chart candidates found from data payload');
    return [];
  }

  // Step 2: Rank by significance
  const ranked = rankBySignificance(candidates);
  const allScored = (ranked as any)._allScored || ranked;
  logger.info({ rankedCount: ranked.length, allScoredCount: allScored.length }, 'Chart ranking complete');

  // Step 3: Select top N respecting rules
  const [minCharts, maxCharts] = rules.count;
  const targetCount = Math.min(maxCharts, Math.max(minCharts, ranked.length));
  let selected = ranked.slice(0, targetCount);

  // Step 4: Enforce visual diversity (use unfiltered list as fallback pool)
  if (rules.diversityMin) {
    selected = enforceDiversity(selected, rules.diversityMin, allScored);
  }

  // Step 5: Ensure "must include" metrics are represented
  if (rules.mustInclude?.length) {
    const allScored = (ranked as any)._allScored || ranked;
    selected = enforceMustInclude(selected, rules.mustInclude, allScored, maxCharts);
  }

  // Step 6: Generate AI insights for each selected chart
  const chartsWithInsights = await Promise.all(
    selected.map(async (candidate, index) => {
      let aiInsight = '';
      try {
        const response = await geminiService.generateChartInsight({
          chartData: candidate.snapshotData || {},
          chartType: candidate.chartType,
          title: candidate.title,
          region,
        });
        aiInsight = response.text;
      } catch (err) {
        logger.warn({ chart: candidate.title, error: (err as Error).message }, 'Failed to generate chart insight');
        aiInsight = `${candidate.title}: ${candidate.metricName} moved ${candidate.percentChange > 0 ? '+' : ''}${candidate.percentChange.toFixed(1)}%.`;
      }

      return {
        endpoint: candidate.endpoint,
        params: candidate.params,
        chartType: candidate.chartType,
        title: candidate.title,
        aiInsight,
        snapshotData: candidate.snapshotData || {},
        significanceRank: index + 1,
      } satisfies SelectedChart;
    }),
  );

  logger.info({ count: chartsWithInsights.length }, 'Chart selection complete');
  return chartsWithInsights;
}

// ============================================================
// CANDIDATE BUILDING
// ============================================================

interface InternalCandidate extends ChartCandidate {
  snapshotData: Record<string, unknown>;
}

function buildCandidates(
  dataPayload: Record<string, unknown>,
  endpoints: string[],
  region?: string,
): InternalCandidate[] {
  const candidates: InternalCandidate[] = [];

  for (const endpoint of endpoints) {
    if (endpoint === '*') continue; // wildcard handled by anomaly trigger separately

    const endpointData = dataPayload[endpoint] as Record<string, unknown> | undefined;
    if (!endpointData) {
      logger.debug({ endpoint }, 'Chart: no data for endpoint');
      continue;
    }

    // Extract metrics from the endpoint data — pass endpoint for shape detection
    const metrics = extractMetrics(endpointData, endpoint);
    if (metrics.length > 0) logger.debug({ endpoint, metricCount: metrics.length }, 'Chart: extracted metrics');

    for (const metric of metrics) {
      // Determine best chart type for this metric — always use inferChartType for
      // smart selection, then fall back to shape-based defaults only if it returns 'line'
      const inferred = inferChartType(metric, endpoint);
      let chartType: string;

      if (metric.breakdownData) {
        // Categorical/breakdown data — prefer specialized types
        const mName = (metric.name || '').toLowerCase();
        const isComposition = endpoint.includes('composition') || mName.includes('distribution') || mName.includes('vacancy');
        const isRegional = endpoint.includes('regional') || mName.includes('by_region') || mName.includes('benchmark');
        const isYield = mName.includes('yield') || mName.includes('cap_rate') || mName.includes('rent');

        if (isComposition && metric.breakdownData.length <= 6) {
          chartType = 'donut';
        } else if (isRegional || isYield || metric.breakdownData.length > 3) {
          chartType = 'stacked_bar';
        } else {
          chartType = 'bar';
        }
      } else if (metric.seriesData) {
        // Time series — use inferred type if it's non-line, otherwise apply defaults
        const mName = (metric.name || '').toLowerCase();
        if (inferred !== 'line') {
          chartType = inferred; // e.g. area, gauge from inferChartType
        } else if (mName.includes('national_index') || mName.startsWith('cci_') || endpoint.includes('forecast') || endpoint.includes('prediction')) {
          chartType = 'area';
        } else if (endpoint.includes('investment') || endpoint.includes('capital')) {
          chartType = 'area';
        } else {
          chartType = 'line';
        }
      } else {
        // Single-value metric — use inferred
        chartType = inferred;
      }

      candidates.push({
        endpoint,
        params: region ? { region } : {},
        title: metric.label || metric.name,
        chartType,
        metricName: metric.name,
        currentValue: metric.current,
        previousValue: metric.previous,
        absoluteChange: Math.abs(metric.current - metric.previous),
        percentChange: metric.previous !== 0
          ? ((metric.current - metric.previous) / Math.abs(metric.previous)) * 100
          : 0,
        deviationFromTrend: metric.deviationFromTrend ?? 0,
        dataTimestamp: metric.timestamp || new Date().toISOString(),
        snapshotData: {
          ...(metric.seriesData ? { series: metric.seriesData } : {}),
          ...(metric.breakdownData ? { breakdown: metric.breakdownData } : {}),
          _metricName: metric.name,
          _metricLabel: metric.label,
          _currentValue: metric.current,
          _previousValue: metric.previous,
          _chartType: chartType,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  return candidates;
}

interface ExtractedMetric {
  name: string;
  label?: string;
  current: number;
  previous: number;
  deviationFromTrend?: number;
  timestamp?: string;
  /** Full series data for chart rendering — kept in snapshot */
  seriesData?: Array<Record<string, unknown>>;
  /** Categorical breakdown data for bar/donut charts */
  breakdownData?: Array<{ label: string; value: number }>;
}

/**
 * Extract named metrics from an analytics API response.
 * Handles the real shapes returned by our mlAnalytics endpoints:
 *
 * CCI:       { national_index, components: { materials: {value,weight,change_mom,change_yoy}, ... }, historical_trend: [{date,value}], regional_indices }
 * PriceIndex: [{ region, property_type, index_value, change_mom, change_yoy, median_price, ... }]
 * Activity:   [{ region, period, new_listings, properties_sold, avg_days_on_market, ... }]
 * Investment: { data_points: [{metric,value,location}], investment_scores: [{location,overall_score,...}] }
 * HAI:        [{ region, ghai_composite, ghai_category, mhai, chai, rhai, median_property_price, ... }]
 * Sentiment:  { index_value, change_1d, change_7d, change_30d, sentiment_distribution: {positive,neutral,negative} }
 */
function extractMetrics(data: Record<string, unknown>, endpoint: string): ExtractedMetric[] {
  const metrics: ExtractedMetric[] = [];
  if (!data || typeof data !== 'object' || data.error) return metrics;

  const ep = endpoint.toLowerCase();

  // ── CCI Shape: { national_index, components, historical_trend, regional_indices }
  if (typeof data.national_index === 'number') {
    const trend = Array.isArray(data.historical_trend) ? data.historical_trend as Array<{ date: string; value: number }> : [];
    const prev = trend.length >= 2 ? trend[1].value : (data.national_index as number);

    metrics.push({
      name: 'national_index',
      label: 'Construction Cost Index (CCI)',
      current: data.national_index as number,
      previous: prev,
      timestamp: trend[0]?.date,
      seriesData: trend.map(t => ({ date: t.date?.split('T')[0], value: t.value })),
    });

    // Component breakdown for bar/donut chart
    const comps = data.components as Record<string, { value: number; weight: number; change_mom: number; change_yoy: number }> | undefined;
    if (comps && typeof comps === 'object') {
      const breakdownData = Object.entries(comps).map(([k, v]) => ({
        label: k.charAt(0).toUpperCase() + k.slice(1),
        value: v.value,
        weight: v.weight,
        change_yoy: v.change_yoy,
      }));

      metrics.push({
        name: 'cci_components',
        label: 'CCI Components Breakdown',
        current: breakdownData.reduce((s, c) => s + c.value, 0),
        previous: breakdownData.reduce((s, c) => s + c.value, 0), // no previous for breakdown
        breakdownData: breakdownData.map(d => ({ label: d.label, value: d.value })),
      });

      // Individual component line charts — derive historical series from CCI trend
      const nationalNow = data.national_index as number;
      for (const [name, comp] of Object.entries(comps)) {
        // Approximate component history: scale CCI trend by component's current share
        const componentRatio = nationalNow > 0 ? comp.value / nationalNow : 0;
        const componentSeries = trend.length >= 2
          ? trend.map(t => ({
              date: t.date?.split('T')[0],
              value: Math.round(t.value * componentRatio * 100) / 100,
            }))
          : undefined;

        metrics.push({
          name: `cci_${name}`,
          label: `${name.charAt(0).toUpperCase() + name.slice(1)} Cost Index`,
          current: comp.value,
          previous: comp.value / (1 + comp.change_yoy / 100),
          deviationFromTrend: comp.change_yoy - (comps.materials?.change_yoy || 0),
          timestamp: trend[0]?.date,
          seriesData: componentSeries,
        });
      }
    }

    // Regional indices as bar chart if available
    const regIdx = data.regional_indices as Record<string, number> | undefined;
    if (regIdx && Object.keys(regIdx).length > 0) {
      metrics.push({
        name: 'cci_regional',
        label: 'Regional Construction Cost Indices',
        current: data.national_index as number,
        previous: prev,
        breakdownData: Object.entries(regIdx).map(([k, v]) => ({
          label: k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          value: v,
        })),
      });
    }

    return metrics; // CCI is fully handled
  }

  // ── HAI Shape: Array of { region, ghai_composite, ghai_category, mhai, chai, rhai, ... }
  if (Array.isArray(data) && (data as any[]).length > 0 && typeof (data as any[])[0]?.ghai_composite === 'number') {
    const items = data as Array<Record<string, unknown>>;
    // Regional affordability comparison bar chart
    metrics.push({
      name: 'ghai_regional',
      label: 'Housing Affordability by Region',
      current: items.reduce((s, i) => s + (i.ghai_composite as number), 0) / items.length,
      previous: items.reduce((s, i) => s + (i.ghai_composite as number), 0) / items.length,
      breakdownData: items.map(i => ({
        label: (i.region as string || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        value: i.ghai_composite as number,
      })).sort((a, b) => a.value - b.value),
    });

    // Individual metric comparisons
    for (const item of items.slice(0, 3)) {
      metrics.push({
        name: `ghai_${item.region}`,
        label: `${(item.region as string || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} Affordability`,
        current: item.ghai_composite as number,
        previous: (item.ghai_composite as number) - (item.change_mom as number || 0),
        deviationFromTrend: item.change_yoy as number || 0,
      });
    }
    return metrics;
  }

  // ── Price Index Shape: Array of { region, property_type, index_value, change_mom, change_yoy, median_price, ... }
  if (Array.isArray(data) && (data as any[]).length > 0 && typeof (data as any[])[0]?.index_value === 'number') {
    const items = data as Array<Record<string, unknown>>;
    // Regional price index comparison
    metrics.push({
      name: 'price_index_regional',
      label: 'Property Price Index by Region',
      current: items[0]?.index_value as number || 0,
      previous: (items[0]?.index_value as number || 0) / (1 + ((items[0]?.change_yoy as number || 0) / 100)),
      breakdownData: items.map(i => ({
        label: `${(i.region as string || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} (${i.property_type})`,
        value: i.index_value as number,
      })),
    });

    for (const item of items.slice(0, 4)) {
      metrics.push({
        name: `price_${item.region}_${item.property_type}`,
        label: `${(item.region as string || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} ${item.property_type} Price`,
        current: item.median_price as number || item.index_value as number,
        previous: (item.median_price as number || item.index_value as number) / (1 + ((item.change_yoy as number || 0) / 100)),
        deviationFromTrend: item.change_yoy as number || 0,
      });
    }
    return metrics;
  }

  // ── Market Activity Shape: Array of { region, period, new_listings, properties_sold, avg_days_on_market, ... }
  if (Array.isArray(data) && (data as any[]).length > 0 && typeof (data as any[])[0]?.new_listings === 'number') {
    const items = data as Array<Record<string, unknown>>;
    const latest = items[0];
    const prev = items.length >= 2 ? items[1] : latest;

    metrics.push({
      name: 'new_listings',
      label: 'New Listings',
      current: latest.new_listings as number,
      previous: prev.new_listings as number,
      timestamp: latest.period as string,
      seriesData: items.map(i => ({ period: i.period, value: i.new_listings })).reverse(),
    });
    metrics.push({
      name: 'properties_sold',
      label: 'Properties Sold',
      current: latest.properties_sold as number,
      previous: prev.properties_sold as number,
      timestamp: latest.period as string,
      seriesData: items.map(i => ({ period: i.period, value: i.properties_sold })).reverse(),
    });
    metrics.push({
      name: 'avg_days_on_market',
      label: 'Avg Days on Market',
      current: latest.avg_days_on_market as number,
      previous: prev.avg_days_on_market as number,
      timestamp: latest.period as string,
    });
    return metrics;
  }

  // ── Investment Shape: { data_points, investment_scores, ... }
  if (data.investment_scores && Array.isArray(data.investment_scores)) {
    const scores = data.investment_scores as Array<Record<string, unknown>>;
    metrics.push({
      name: 'investment_scores',
      label: 'Investment Opportunity Scores',
      current: scores[0]?.overall_score as number || 0,
      previous: scores[0]?.overall_score as number || 0,
      breakdownData: scores.slice(0, 8).map(s => ({
        label: s.location as string || 'Unknown',
        value: s.overall_score as number || 0,
      })),
    });
    return metrics;
  }

  // ── Sentiment Shape: { index_value, change_1d, change_7d, change_30d, sentiment_distribution }
  if (typeof data.index_value === 'number' && data.sentiment_distribution) {
    metrics.push({
      name: 'sentiment_index',
      label: 'Market Confidence Index',
      current: data.index_value as number,
      previous: (data.index_value as number) - (data.change_30d as number || 0),
      deviationFromTrend: data.change_7d as number || 0,
    });

    const dist = data.sentiment_distribution as Record<string, number>;
    if (dist) {
      metrics.push({
        name: 'sentiment_distribution',
        label: 'Market Sentiment Distribution',
        current: dist.positive || 0,
        previous: dist.positive || 0,
        breakdownData: [
          { label: 'Positive', value: (dist.positive || 0) * 100 },
          { label: 'Neutral', value: (dist.neutral || 0) * 100 },
          { label: 'Negative', value: (dist.negative || 0) * 100 },
        ],
      });
    }
    return metrics;
  }

  // ── Rental Benchmarks Shape: Array of { area_name, property_type, avg_rent_monthly, listing_count, ... }
  // NOTE: Must check BEFORE Rental Summary — benchmarks data also has avg_rent_monthly
  if (Array.isArray(data) && (data as any[]).length > 0 && typeof (data as any[])[0]?.listing_count === 'number') {
    const items = data as Array<Record<string, unknown>>;
    metrics.push({
      name: 'rental_benchmarks',
      label: 'Rental Benchmarks by Area',
      current: items[0]?.avg_rent_monthly as number || 0,
      previous: items[0]?.avg_rent_monthly as number || 0,
      breakdownData: items.slice(0, 8).map(i => ({
        label: `${i.area_name as string || 'Unknown'}`,
        value: i.avg_rent_monthly as number || 0,
      })),
    });
    return metrics;
  }

  // ── Rental Summary Shape: Array of { region, property_type, avg_rent_monthly, gross_yield_pct, vacancy_rate_pct, ... }
  if (Array.isArray(data) && (data as any[]).length > 0 && typeof (data as any[])[0]?.avg_rent_monthly === 'number') {
    const items = data as Array<Record<string, unknown>>;
    // Regional rent comparison
    metrics.push({
      name: 'avg_rent_by_region',
      label: 'Average Monthly Rent by Region',
      current: items[0]?.avg_rent_monthly as number || 0,
      previous: items[0]?.avg_rent_monthly as number || 0,
      breakdownData: items.slice(0, 8).map(i => ({
        label: `${(i.region as string || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`,
        value: i.avg_rent_monthly as number || 0,
      })),
    });
    // Yield comparison (stacked_bar)
    const yieldsItems = items.filter(i => (i.gross_yield_pct as number) > 0);
    if (yieldsItems.length > 0) {
      metrics.push({
        name: 'gross_yield_by_region',
        label: 'Gross Rental Yield by Region',
        current: yieldsItems[0]?.gross_yield_pct as number || 0,
        previous: yieldsItems[0]?.gross_yield_pct as number || 0,
        breakdownData: yieldsItems.slice(0, 8).map(i => ({
          label: `${(i.region as string || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`,
          value: Math.round((i.gross_yield_pct as number || 0) * 100) / 100,
        })),
      });
    }
    // Vacancy rate donut
    const vacantItems = items.filter(i => (i.vacancy_rate_pct as number) > 0);
    if (vacantItems.length > 0) {
      const avgVacancy = vacantItems.reduce((s, i) => s + (i.vacancy_rate_pct as number), 0) / vacantItems.length;
      metrics.push({
        name: 'vacancy_rate',
        label: 'Vacancy Rate Distribution',
        current: avgVacancy,
        previous: avgVacancy,
        breakdownData: [
          { label: 'Occupied', value: Math.round((100 - avgVacancy) * 10) / 10 },
          { label: 'Vacant', value: Math.round(avgVacancy * 10) / 10 },
        ],
      });
    }
    return metrics;
  }

  // ── Rental Yield Detail Shape: Array of { region, property_type, cap_rate, gross_yield, net_yield, ... }
  if (Array.isArray(data) && (data as any[]).length > 0 && typeof (data as any[])[0]?.cap_rate === 'number') {
    const items = data as Array<Record<string, unknown>>;
    metrics.push({
      name: 'cap_rate_by_region',
      label: 'Capitalisation Rate by Region',
      current: items[0]?.cap_rate as number || 0,
      previous: items[0]?.cap_rate as number || 0,
      breakdownData: items.slice(0, 8).map(i => ({
        label: `${(i.region as string || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`,
        value: Math.round((i.cap_rate as number || 0) * 100) / 100,
      })),
    });
    // Net yield comparison
    const netItems = items.filter(i => (i.net_yield as number) > 0);
    if (netItems.length > 0) {
      metrics.push({
        name: 'net_yield_by_region',
        label: 'Net Rental Yield by Region',
        current: netItems[0]?.net_yield as number || 0,
        previous: netItems[0]?.net_yield as number || 0,
        breakdownData: netItems.slice(0, 8).map(i => ({
          label: `${(i.region as string || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`,
          value: Math.round((i.net_yield as number || 0) * 100) / 100,
        })),
      });
    }
    return metrics;
  }

  // ── Rental Trends Shape: Array of { period, avg_rent, median_rent, count }
  if (Array.isArray(data) && (data as any[]).length > 0 && typeof (data as any[])[0]?.avg_rent === 'number') {
    const items = data as Array<Record<string, unknown>>;
    const latest = items[items.length - 1];
    const prev = items.length >= 2 ? items[items.length - 2] : latest;
    metrics.push({
      name: 'rental_price_trend',
      label: 'Average Rental Price Trend',
      current: latest.avg_rent as number,
      previous: prev.avg_rent as number,
      timestamp: latest.period as string,
      seriesData: items.map(i => ({ period: i.period, value: i.avg_rent })),
    });
    metrics.push({
      name: 'rental_volume_trend',
      label: 'Rental Transaction Volume',
      current: latest.count as number,
      previous: prev.count as number,
      timestamp: latest.period as string,
      seriesData: items.map(i => ({ period: i.period, value: i.count })),
    });
    return metrics;
  }

  // ── Generic fallbacks (original logic for unknown shapes) ──

  // Shape: { value, previousValue }
  if (typeof data.value === 'number') {
    metrics.push({
      name: (data.name as string) || 'index_value',
      label: (data.label as string) || (data.name as string) || 'Index',
      current: data.value as number,
      previous: (data.previousValue as number) ?? (data.value as number),
      timestamp: data.timestamp as string,
    });
  }

  // Shape: { data: [...] } — time series array under .data key
  if (typeof data === 'object' && !Array.isArray(data) && Array.isArray((data as any).data)) {
    const series = (data as any).data as Array<Record<string, unknown>>;
    if (series.length >= 2) {
      const latest = series[series.length - 1];
      const prev = series[series.length - 2];
      const valueKey = Object.keys(latest).find(k => typeof latest[k] === 'number' && !['period', 'date'].includes(k));
      if (valueKey) {
        metrics.push({
          name: valueKey,
          label: (data.title as string) || valueKey,
          current: latest[valueKey] as number,
          previous: prev[valueKey] as number,
          timestamp: (latest.period as string) || (latest.date as string),
          seriesData: series.map(s => ({ date: s.period || s.date, value: s[valueKey] })),
        });
      }
    }
  }

  // Shape: sub-objects with { value, ... }
  for (const [key, val] of Object.entries(data)) {
    if (
      val && typeof val === 'object' && !Array.isArray(val) &&
      typeof (val as Record<string, unknown>).value === 'number' &&
      !['metadata', 'params', '_metricName', 'components', 'regional_indices', 'sentiment_distribution'].includes(key)
    ) {
      const sub = val as Record<string, unknown>;
      metrics.push({
        name: key,
        label: (sub.label as string) || key,
        current: sub.value as number,
        previous: (sub.previousValue as number) ?? (sub.value as number),
        timestamp: sub.timestamp as string,
      });
    }
  }

  return metrics;
}

/**
 * Infer the best chart type for a metric based on its nature and endpoint path.
 */
function inferChartType(metric: ExtractedMetric, endpoint: string): string {
  const ep = endpoint.toLowerCase();
  const name = (metric.name || '').toLowerCase();
  const hasSeriesData = metric.seriesData && metric.seriesData.length >= 2;
  const hasBreakdownData = metric.breakdownData && metric.breakdownData.length >= 2;

  // Composition / breakdown data → donut or stacked_bar
  if (hasBreakdownData) {
    if (ep.includes('regional') || ep.includes('region') || name.includes('by_region')) return 'stacked_bar';
    if (name.includes('distribution') || name.includes('composition') || ep.includes('breakdown') || ep.includes('share')) return 'donut';
    if (name.includes('yield') || name.includes('cap_rate') || name.includes('benchmark') || name.includes('rent')) return 'stacked_bar';
    return 'bar';
  }

  // Time series data → line or area  
  if (hasSeriesData) {
    if (ep.includes('forecast') || ep.includes('prediction') || ep.includes('investment') || ep.includes('capital')) return 'area';
    if (name.includes('volume') || name.includes('count') || name.includes('transaction')) return 'bar';
    return 'line';
  }

  // Single-value metrics without time series → gauge (score, index, rate, ratio)
  if (name.includes('index') || name.includes('score') || name.includes('ratio') || name.includes('rate')) return 'gauge';
  // Forecasts / predictions → area fill chart
  if (ep.includes('forecast') || ep.includes('prediction')) return 'area';
  // Geographic / risk data
  if (ep.includes('geographic') || ep.includes('heatmap') || ep.includes('risk')) return 'heatmap';
  // Regional comparisons → stacked_bar
  if (ep.includes('regional') && !ep.includes('hai')) return 'stacked_bar';
  // Other comparisons → bar
  if (ep.includes('comparison') || ep.includes('activity') || ep.includes('volume')) return 'bar';
  // Investment / capital data → area
  if (ep.includes('investment') || ep.includes('capital') || ep.includes('flow')) return 'area';
  // Time series is the default
  return 'line';
}

// ============================================================
// RANKING & SELECTION
// ============================================================

/**
 * Rank candidates by composite significance score.
 * Weight: 40% absolute % change, 30% deviation from trend, 30% data recency.
 */
function rankBySignificance(candidates: InternalCandidate[]): InternalCandidate[] {
  const maxPctChange = Math.max(...candidates.map(c => Math.abs(c.percentChange)), 1);
  const maxDeviation = Math.max(...candidates.map(c => Math.abs(c.deviationFromTrend)), 1);

  const scored = candidates.map(c => {
    const pctScore = Math.abs(c.percentChange) / maxPctChange;
    const devScore = Math.abs(c.deviationFromTrend) / maxDeviation;
    const recencyScore = computeRecency(c.dataTimestamp);

    const composite = pctScore * 0.4 + devScore * 0.3 + recencyScore * 0.3;
    return { ...c, _score: composite };
  });

  // Keep unfiltered list for diversity enforcement
  const allScored = scored.sort((a, b) => b._score - a._score);

  const filtered = scored
    .filter(c => {
      // Always keep candidates with breakdown data (categorical comparisons, not time-series changes)
      if ((c.snapshotData as any)?.breakdown) return true;
      // Keep significant movers or high composite scorers
      return Math.abs(c.percentChange) >= 0.5 || c._score >= 0.3;
    })
    .sort((a, b) => b._score - a._score);

  // Attach the unfiltered list for diversity enforcement
  (filtered as any)._allScored = allScored;

  return filtered;
}

function computeRecency(timestamp: string): number {
  const age = Date.now() - new Date(timestamp).getTime();
  const maxAge = 90 * 24 * 60 * 60 * 1000; // 90 days
  return Math.max(0, 1 - age / maxAge);
}

/**
 * Ensure selected charts include at least `diversityMin` distinct chart types.
 * If lacking diversity, swap out least-significant same-typed charts for different-typed ones.
 */
function enforceDiversity(
  selected: InternalCandidate[],
  diversityMin: number,
  allRanked: InternalCandidate[],
): InternalCandidate[] {
  const typeSet = new Set(selected.map(c => c.chartType));
  if (typeSet.size >= diversityMin) return selected;

  const result = [...selected];
  const usedEndpoints = new Set(result.map(c => `${c.endpoint}:${c.metricName}`));

  // Find candidates with different chart types not yet represented
  const alternatives = allRanked.filter(
    c => !typeSet.has(c.chartType) && !usedEndpoints.has(`${c.endpoint}:${c.metricName}`),
  );

  for (const alt of alternatives) {
    if (typeSet.size >= diversityMin) break;

    // Replace least significant chart that shares type with another
    const typeCounts = new Map<string, number>();
    for (const r of result) {
      typeCounts.set(r.chartType, (typeCounts.get(r.chartType) || 0) + 1);
    }

    const duplicatedType = [...typeCounts.entries()].find(([_, count]) => count > 1)?.[0];
    if (duplicatedType) {
      const idx = result.findIndex((r, i) => r.chartType === duplicatedType && i > 0);
      if (idx >= 0) {
        result[idx] = alt;
        typeSet.add(alt.chartType);
      }
    } else {
      // Can't swap — just append if under max
      result.push(alt);
      typeSet.add(alt.chartType);
    }
  }

  return result;
}

/**
 * Ensure "must include" metric names are represented in the selection.
 */
function enforceMustInclude(
  selected: InternalCandidate[],
  mustInclude: string[],
  allRanked: InternalCandidate[],
  maxCharts: number,
): InternalCandidate[] {
  const result = [...selected];

  for (const required of mustInclude) {
    if (required === 'trigger_metric') continue; // handled by anomaly trigger
    // Match on either metric name OR endpoint name (e.g. 'rental' matches 'rental/summary')
    const matches = (c: InternalCandidate) =>
      c.metricName.includes(required) || c.endpoint.includes(required);
    if (result.some(matches)) continue;

    const candidate = allRanked.find(matches);
    if (!candidate) continue;

    if (result.length < maxCharts) {
      // Room to add
      result.push(candidate);
    } else {
      // At capacity — swap out the lowest-scored chart of the most-common type
      const typeCounts: Record<string, number> = {};
      result.forEach(c => { typeCounts[c.chartType] = (typeCounts[c.chartType] || 0) + 1; });
      const mostCommonType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (mostCommonType) {
        // Find the last (lowest-scored) chart of the most common type and replace it
        for (let i = result.length - 1; i >= 0; i--) {
          if (result[i].chartType === mostCommonType) {
            logger.info({ swappedOut: result[i].metricName, swappedIn: candidate.metricName, required }, 'mustInclude: swapped chart');
            result[i] = candidate;
            break;
          }
        }
      }
    }
  }

  return result;
}

// ============================================================
// AI-BASED CHART DATA GENERATION (fallback for sparse analytics)
// ============================================================

/**
 * When analytics endpoints return sparse/empty data, ask Gemini to generate
 * structured chart data from the article text so publications always ship with visuals.
 */
export async function generateAICharts(
  draft: GeneratedDraft,
  existingCharts: SelectedChart[],
  rules: ChartSelectionRules,
  region?: string,
): Promise<SelectedChart[]> {
  const [minCharts] = rules.count;
  if (existingCharts.length >= minCharts) return existingCharts;

  const needed = minCharts - existingCharts.length;
  logger.info({ needed, existing: existingCharts.length }, 'Analytics data sparse — generating AI chart data');

  const articleText = draft.sections.map(s => `## ${s.heading}\n${s.content}`).join('\n\n');

  const prompt = `You are a data visualization assistant for PROPMETRIK real estate research.
The article below mentions data & statistics. Extract or synthesize ${needed} chart(s) from it.

ARTICLE:
${articleText.substring(0, 6000)}

For each chart return a JSON object with:
- "title": short descriptive chart title (string)
- "chartType": one of "line", "bar", "area", "donut", "gauge", "stacked_bar" (string)
- "series": for "bar"/"line"/"area"/"stacked_bar" charts: array of {"label": "Category or Time Period", "value": 123} with 3-8 items. Set null ONLY for "donut"/"gauge".
- "breakdown": for "donut" charts: array of {"label": "Segment", "value": 45} with 2-6 slices. Set null for others.
- "gaugeValue": for "gauge" charts ONLY: a number 0-100 representing a score/index. Set null for others.
- "gaugeLabel": for "gauge" charts ONLY: the metric name (e.g. "Housing Affordability Index"). Set null for others.
- "insight": one-sentence key takeaway (string)

AVAILABLE CHART TYPES (use at least 3 different types for variety):
- "line": Time series trends (price indices, monthly changes)
- "bar": Category comparisons (costs by material, regional volumes)
- "area": Filled area for forecasts, cumulative trends, investment flows
- "donut": Proportional breakdowns (market share, composition splits)
- "gauge": Single index/score values 0-100 (affordability index, confidence score)
- "stacked_bar": Multi-category comparisons (regional breakdowns by sector)

CRITICAL RULES:
- Every "bar"/"line"/"area"/"stacked_bar" chart MUST have a non-empty "series" array with real numeric values.
- Every "donut" chart MUST have a non-empty "breakdown" array.
- Every "gauge" chart MUST have a numeric "gaugeValue" (0-100).
- NEVER return empty arrays []. If exact data is unknown, use reasonable estimates consistent with the article.
- Use at LEAST 3 different chartTypes across all charts for visual variety.
- DO NOT use more than 2 charts of the same type.

Return a JSON array of ${needed} chart objects. ONLY return valid JSON, no markdown fencing.`;

  try {
    const response = await geminiService.generateSection({
      sectionType: 'custom',
      customPrompt: prompt,
      dataContext: { region: region || 'Ghana', product: draft.product, edition: draft.edition },
    });

    // Parse the AI response
    let aiCharts: Array<{
      title: string;
      chartType: string;
      series?: Array<{ label: string; value: number }>;
      breakdown?: Array<{ label: string; value: number }>;
      gaugeValue?: number;
      gaugeLabel?: string;
      insight: string;
    }>;

    try {
      const cleaned = response.text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      aiCharts = JSON.parse(cleaned);
      if (!Array.isArray(aiCharts)) aiCharts = [aiCharts];
    } catch {
      logger.warn('Failed to parse AI chart JSON — skipping AI charts');
      return existingCharts;
    }

    const augmented = [...existingCharts];
    for (const ac of aiCharts.slice(0, needed)) {
      const type = ac.chartType || 'bar';
      // Normalize: bar charts with series should use breakdown for the frontend renderer
      let series = ac.series && ac.series.length > 0 ? ac.series : null;
      let breakdown = ac.breakdown && ac.breakdown.length > 0 ? ac.breakdown : null;
      const gaugeValue = typeof ac.gaugeValue === 'number' ? ac.gaugeValue : null;

      // For bar/donut/stacked_bar, move series → breakdown if breakdown is missing
      if ((type === 'bar' || type === 'donut' || type === 'stacked_bar') && !breakdown && series) {
        breakdown = series;
        series = null;
      }

      // Gauge charts only need a value
      if (type === 'gauge' && gaugeValue != null) {
        augmented.push({
          endpoint: 'ai-generated',
          params: { region: region || 'Ghana' },
          chartType: 'gauge',
          title: ac.title || 'Index Score',
          aiInsight: ac.insight || '',
          snapshotData: {
            _gaugeValue: gaugeValue,
            _gaugeLabel: ac.gaugeLabel || ac.title || 'Score',
            _chartType: 'gauge',
            _metricLabel: ac.title,
            _aiGenerated: true,
            timestamp: new Date().toISOString(),
          },
          significanceRank: existingCharts.length + augmented.length,
        });
        continue;
      }

      // Skip charts with no renderable data
      if (!series && !breakdown) {
        logger.warn({ title: ac.title }, 'AI chart has no data — skipping');
        continue;
      }

      augmented.push({
        endpoint: 'ai-generated',
        params: { region: region || 'Ghana' },
        chartType: type,
        title: ac.title || 'Data Visualization',
        aiInsight: ac.insight || '',
        snapshotData: {
          ...(series ? { series } : {}),
          ...(breakdown ? { breakdown } : {}),
          _chartType: type,
          _metricLabel: ac.title,
          _aiGenerated: true,
          timestamp: new Date().toISOString(),
        },
        significanceRank: existingCharts.length + augmented.length,
      });
    }

    logger.info({ aiChartsAdded: augmented.length - existingCharts.length }, 'AI chart generation complete');
    return augmented;
  } catch (err) {
    logger.warn({ error: (err as Error).message }, 'AI chart generation failed — continuing without');
    return existingCharts;
  }
}
