'use client';

import { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

// ============================================================
// Types
// ============================================================

interface ChartBlock {
  id?: string;
  chartType: string;
  title: string;
  aiInsight?: string;
  snapshotData?: {
    series?: Array<Record<string, unknown>>;
    breakdown?: Array<{ label: string; value: number }>;
    _chartType?: string;
    _metricLabel?: string;
    _currentValue?: number;
    _previousValue?: number;
    _aiGenerated?: boolean;
    [key: string]: unknown;
  };
  endpoint?: string;
}

interface PublicationChartProps {
  chart: ChartBlock;
}

// ============================================================
// Color Palette (primary gold + complementary)
// ============================================================

const COLORS = [
  '#D4A843',  // primary gold
  '#6366F1',  // indigo
  '#22D3EE',  // cyan
  '#F472B6',  // pink
  '#A3E635',  // lime
  '#FB923C',  // orange
  '#818CF8',  // violet
  '#34D399',  // emerald
];

const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: '#18181b',
    border: '1px solid #3f3f46',
    borderRadius: '8px',
    color: '#e4e4e7',
    fontSize: '13px',
  },
  labelStyle: { color: '#a1a1aa' },
};

// ============================================================
// Individual Chart Renderers
// ============================================================

function LineChartRenderer({ data }: { data: Array<Record<string, unknown>> }) {
  // Figure out the x-axis / value keys
  const sample = data[0] || {};
  const xKey = Object.keys(sample).find(k => typeof sample[k] === 'string') || 'label';
  const valueKeys = Object.keys(sample).filter(
    k => typeof sample[k] === 'number' && k !== 'index',
  );

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis
          dataKey={xKey}
          stroke="#71717a"
          tick={{ fill: '#a1a1aa', fontSize: 11 }}
          tickLine={false}
        />
        <YAxis
          stroke="#71717a"
          tick={{ fill: '#a1a1aa', fontSize: 11 }}
          tickLine={false}
          width={60}
        />
        <Tooltip {...TOOLTIP_STYLE} />
        {valueKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />}
        {valueKeys.map((key, i) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3, fill: COLORS[i % COLORS.length] }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function BarChartRenderer({ data }: { data: Array<{ label: string; value: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis
          dataKey="label"
          stroke="#71717a"
          tick={{ fill: '#a1a1aa', fontSize: 11 }}
          tickLine={false}
          interval={0}
          angle={-30}
          textAnchor="end"
          height={60}
        />
        <YAxis
          stroke="#71717a"
          tick={{ fill: '#a1a1aa', fontSize: 11 }}
          tickLine={false}
          width={60}
        />
        <Tooltip {...TOOLTIP_STYLE} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function DonutChartRenderer({ data }: { data: Array<{ label: string; value: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          strokeWidth={0}
          label={({ label, percent }) => `${label} ${(percent * 100).toFixed(0)}%`}
          labelLine={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip {...TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ============================================================
// Stat Card — shows current/previous as a big number + delta
// ============================================================

function StatHeader({
  label,
  current,
  previous,
}: {
  label?: string;
  current?: number;
  previous?: number;
}) {
  if (current == null) return null;
  const delta = previous != null && previous !== 0
    ? ((current - previous) / Math.abs(previous)) * 100
    : null;

  return (
    <div className="flex items-baseline gap-3 mb-3">
      {label && <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>}
      <span className="text-2xl font-bold text-foreground">
        {current.toLocaleString(undefined, { maximumFractionDigits: 1 })}
      </span>
      {delta != null && (
        <span className={`text-sm font-medium ${delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}%
        </span>
      )}
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function PublicationChart({ chart }: PublicationChartProps) {
  const snap = chart.snapshotData || {};
  const chartType = (snap._chartType || chart.chartType || 'bar').toLowerCase();

  // Memoize data transforms
  const seriesData = useMemo(() => {
    if (!snap.series || !Array.isArray(snap.series)) return null;
    return snap.series as Array<Record<string, unknown>>;
  }, [snap.series]);

  const breakdownData = useMemo(() => {
    if (!snap.breakdown || !Array.isArray(snap.breakdown)) return null;
    return snap.breakdown as Array<{ label: string; value: number }>;
  }, [snap.breakdown]);

  // Determine which renderer to use
  const renderChart = () => {
    // Donut / pie chart
    if (chartType === 'donut' || chartType === 'pie') {
      if (breakdownData) return <DonutChartRenderer data={breakdownData} />;
      if (seriesData) return <BarChartRenderer data={seriesData as any} />;
    }

    // Line chart (time series)
    if (chartType === 'line' || chartType === 'sparkline' || chartType === 'forecast') {
      if (seriesData && seriesData.length >= 2) return <LineChartRenderer data={seriesData} />;
      if (breakdownData) return <BarChartRenderer data={breakdownData} />;
    }

    // Bar chart (default for categorical data)
    if (breakdownData) return <BarChartRenderer data={breakdownData} />;
    if (seriesData) return <LineChartRenderer data={seriesData} />;

    // No chart data — show insight only
    return null;
  };

  const chartNode = renderChart();

  return (
    <div className="my-8 bg-card/50 border border-border rounded-xl p-5 not-prose">
      {/* Title Bar */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold text-foreground">{chart.title || 'Data Visualization'}</h3>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
          {snap._aiGenerated ? 'AI-Synthesized' : snap.timestamp
            ? `Data as of ${new Date(snap.timestamp as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
            : 'Published Data'}
        </span>
      </div>

      {/* Stat Header if we have current/previous */}
      <StatHeader
        label={snap._metricLabel as string}
        current={snap._currentValue as number}
        previous={snap._previousValue as number}
      />

      {/* Chart Visualization */}
      {chartNode ? (
        <div className="mt-2">{chartNode}</div>
      ) : snap._currentValue != null ? (
        /* Stat-only chart — current/previous values displayed in header above */
        <div className="py-4 text-center text-muted-foreground text-xs">
          Metric snapshot — no time-series data available for this indicator
        </div>
      ) : (
        <div className="py-8 text-center text-muted-foreground text-sm">
          No visualization data available
        </div>
      )}

      {/* AI Insight */}
      {chart.aiInsight && (
        <p className="mt-3 text-sm text-muted-foreground bg-background/50 rounded-lg p-3 border border-border/50">
          {chart.aiInsight}
        </p>
      )}
    </div>
  );
}
