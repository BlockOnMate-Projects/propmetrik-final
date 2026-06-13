'use client'

import React from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  FunnelChart,
  Funnel,
  LabelList,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

// =====================================================
// SHARED
// =====================================================

const CHART_COLORS = [
  'hsl(var(--primary))',
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#f97316', // orange
  '#14b8a6', // teal
  '#6366f1', // indigo
]

const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#84cc16']

interface ChartContainerProps {
  title: string
  subtitle?: string
  className?: string
  action?: React.ReactNode
  children: React.ReactNode
}

export function ChartContainer({ title, subtitle, className, action, children }: ChartContainerProps) {
  return (
    <Card className={cn('border-border shadow-sm', className)}>
      <CardHeader className="pb-2 px-4 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium text-foreground">{title}</CardTitle>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">{children}</CardContent>
    </Card>
  )
}

// =====================================================
// METRIC CARD (enhanced with comparison)
// =====================================================

interface MetricCardProps {
  title: string
  value: string | number
  change?: number          // % change
  changeLabel?: string     // e.g. "vs last month"
  icon?: React.ComponentType<{ className?: string }>
  format?: 'currency' | 'percent' | 'number' | 'days'
  currency?: string
  className?: string
}

export function MetricCard({ title, value, change, changeLabel, icon: Icon, format, currency = 'GHS', className }: MetricCardProps) {
  const formattedValue = (() => {
    if (typeof value === 'string') return value
    switch (format) {
      case 'currency': return formatCurrency(value, currency)
      case 'percent': return `${value.toFixed(1)}%`
      case 'days': return `${value.toFixed(1)} days`
      default: return value.toLocaleString()
    }
  })()

  return (
    <Card className={cn('border-border shadow-sm', className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">{formattedValue}</p>
            {change !== undefined && (
              <div className={cn(
                'flex items-center gap-1 text-xs font-medium',
                change > 0 ? 'text-emerald-600 dark:text-emerald-400' :
                change < 0 ? 'text-red-600 dark:text-red-400' :
                'text-muted-foreground'
              )}>
                {change > 0 ? <TrendingUp className="h-3 w-3" /> :
                 change < 0 ? <TrendingDown className="h-3 w-3" /> :
                 <Minus className="h-3 w-3" />}
                {change > 0 ? '+' : ''}{change}%
                {changeLabel && <span className="text-muted-foreground font-normal ml-1">{changeLabel}</span>}
              </div>
            )}
          </div>
          {Icon && (
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
              <Icon className="h-5 w-5 text-primary" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// =====================================================
// REVENUE TREND (Line + Area Chart)
// =====================================================

interface RevenueTrendChartProps {
  data: Array<{
    period_label: string
    won_value: number
    lost_value: number
    new_pipeline?: number
  }>
  height?: number
  showLost?: boolean
}

export function RevenueTrendChart({ data, height = 300, showLost = true }: RevenueTrendChartProps) {
  const chartData = data.map(d => ({
    name: d.period_label,
    won: Number(d.won_value),
    lost: Number(d.lost_value),
    pipeline: Number(d.new_pipeline || 0),
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="wonGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="lostGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
        <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            fontSize: '12px',
            color: 'hsl(var(--foreground))',
          }}
          formatter={(value: number) => [formatCurrency(value, 'GHS'), undefined]}
        />
        <Legend iconSize={10} wrapperStyle={{ fontSize: '12px' }} />
        <Area type="monotone" dataKey="won" name="Won Revenue" stroke="#10b981" fill="url(#wonGradient)" strokeWidth={2} />
        {showLost && (
          <Area type="monotone" dataKey="lost" name="Lost Value" stroke="#ef4444" fill="url(#lostGradient)" strokeWidth={2} />
        )}
      </AreaChart>
    </ResponsiveContainer>
  )
}

// =====================================================
// PIPELINE FUNNEL CHART
// =====================================================

interface FunnelChartProps {
  data: Array<{
    stage_name: string
    stage_color?: string
    deal_count: number
    total_value: number
    conversion_rate?: number
    cumulative_deals?: number
  }>
  height?: number
}

export function PipelineFunnelChart({ data, height = 350 }: FunnelChartProps) {
  const funnelData = data.map((stage, idx) => ({
    name: stage.stage_name,
    value: stage.cumulative_deals || stage.deal_count,
    deals: stage.deal_count,
    total_value: stage.total_value,
    conversion: stage.conversion_rate,
    fill: stage.stage_color || CHART_COLORS[idx % CHART_COLORS.length],
  }))

  if (funnelData.length === 0) {
    return <div className="text-center py-8 text-sm text-muted-foreground">No funnel data available</div>
  }

  // Custom funnel visualization (horizontal bars that narrow)
  const maxValue = Math.max(...funnelData.map(d => d.value), 1)

  return (
    <div className="space-y-2" style={{ minHeight: height }}>
      {funnelData.map((stage, idx) => {
        const width = Math.max((stage.value / maxValue) * 100, 8)
        return (
          <div key={idx} className="flex items-center gap-3">
            <div className="w-24 text-xs text-muted-foreground text-right truncate">{stage.name}</div>
            <div className="flex-1 relative">
              <div
                className="h-9 rounded-md flex items-center px-3 transition-all relative overflow-hidden"
                style={{
                  width: `${width}%`,
                  backgroundColor: stage.fill,
                  opacity: 0.85,
                }}
              >
                <span className="text-xs font-bold text-foreground drop-shadow-sm whitespace-nowrap">
                  {stage.deals} deals
                </span>
              </div>
              {stage.conversion !== undefined && stage.conversion < 100 && idx > 0 && (
                <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                  {stage.conversion}%
                </span>
              )}
            </div>
            <div className="w-20 text-xs text-muted-foreground text-right">
              {formatCurrency(Number(stage.total_value), 'GHS')}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// =====================================================
// LOSS REASON PIE CHART
// =====================================================

interface LossReasonPieProps {
  data: Array<{
    reason: string
    label?: string
    count: number
    total_value: number
    percentage: number
  }>
  height?: number
}

const LOSS_REASON_DISPLAY: Record<string, string> = {
  price_too_high: 'Price Too High',
  competitor_won: 'Competitor Won',
  timing_not_right: 'Bad Timing',
  budget_constraints: 'Budget',
  requirements_changed: 'Req. Changed',
  no_response: 'No Response',
  location_mismatch: 'Location',
  financing_failed: 'Financing',
  legal_issues: 'Legal',
  other: 'Other',
}

export function LossReasonPie({ data, height = 280 }: LossReasonPieProps) {
  const chartData = data.map((d, idx) => ({
    name: d.label || LOSS_REASON_DISPLAY[d.reason] || d.reason,
    value: d.count,
    amount: d.total_value,
    percentage: d.percentage,
    fill: PIE_COLORS[idx % PIE_COLORS.length],
  }))

  if (chartData.length === 0) {
    return <div className="text-center py-8 text-sm text-muted-foreground">No loss data available</div>
  }

  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width="50%" height={height}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((entry, idx) => (
              <Cell key={idx} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '12px',
              color: 'hsl(var(--foreground))',
            }}
            formatter={(value: number, _name: string, props: any) => [
              `${value} deals (${props.payload.percentage}%)`,
              props.payload.name,
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-2">
        {chartData.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: item.fill }} />
            <span className="text-xs text-foreground flex-1 truncate">{item.name}</span>
            <span className="text-xs font-medium text-muted-foreground tabular-nums">{item.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// =====================================================
// DEAL VELOCITY BAR CHART
// =====================================================

interface VelocityChartProps {
  data: Array<{
    stage_name: string
    stage_color?: string
    avg_days: number
    median_days?: number
    deal_count: number
  }>
  height?: number
}

export function VelocityBarChart({ data, height = 300 }: VelocityChartProps) {
  const chartData = data.map(d => ({
    name: d.stage_name,
    avg_days: Number(d.avg_days),
    median_days: Number(d.median_days || 0),
    deals: d.deal_count,
    fill: d.stage_color || 'hsl(var(--primary))',
  }))

  if (chartData.length === 0) {
    return <div className="text-center py-8 text-sm text-muted-foreground">No velocity data available</div>
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          label={{ value: 'Days', position: 'insideBottom', fill: 'hsl(var(--muted-foreground))', fontSize: 11, offset: -5 }}
        />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={60} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            fontSize: '12px',
            color: 'hsl(var(--foreground))',
          }}
          formatter={(value: number, name: string) => [`${value} days`, name === 'avg_days' ? 'Average' : 'Median']}
        />
        <Bar dataKey="avg_days" name="Average Days" radius={[0, 4, 4, 0]}>
          {chartData.map((entry, idx) => (
            <Cell key={idx} fill={entry.fill} opacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// =====================================================
// VELOCITY TREND (Line Chart)
// =====================================================

interface VelocityTrendProps {
  data: Array<{
    period: string
    avg_days: number
    deal_count: number
  }>
  height?: number
}

export function VelocityTrendChart({ data, height = 250 }: VelocityTrendProps) {
  const chartData = data.map(d => ({
    name: d.period,
    days: Number(d.avg_days),
    deals: d.deal_count,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
        <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            fontSize: '12px',
            color: 'hsl(var(--foreground))',
          }}
          formatter={(value: number) => [`${value} days`]}
        />
        <Line type="monotone" dataKey="days" name="Avg Close Time" stroke="hsl(var(--primary))"
          strokeWidth={2} dot={{ r: 4, fill: 'hsl(var(--primary))' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// =====================================================
// AGENT COMPARISON BAR CHART
// =====================================================

interface AgentComparisonProps {
  data: Array<{
    name: string
    won_value: number
    pipeline_value: number
    win_rate: number
  }>
  height?: number
}

export function AgentComparisonChart({ data, height = 300 }: AgentComparisonProps) {
  const chartData = data.slice(0, 10).map(d => ({
    name: d.name?.split(' ')[0] || 'Unknown', // First name only for space
    won: Number(d.won_value),
    pipeline: Number(d.pipeline_value),
    rate: Number(d.win_rate),
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
        <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            fontSize: '12px',
            color: 'hsl(var(--foreground))',
          }}
          formatter={(value: number, name: string) => [formatCurrency(value, 'GHS'), name === 'won' ? 'Won Value' : 'Pipeline']}
        />
        <Legend iconSize={10} wrapperStyle={{ fontSize: '12px' }} />
        <Bar dataKey="won" name="Won Value" fill="#10b981" radius={[4, 4, 0, 0]} />
        <Bar dataKey="pipeline" name="Pipeline" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} opacity={0.6} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// =====================================================
// PERIOD COMPARISON CARDS
// =====================================================

interface ComparisonMetricProps {
  label: string
  current: number
  previous: number
  change: number
  format?: 'currency' | 'percent' | 'number' | 'days'
  currency?: string
  invertColors?: boolean // for metrics where decrease is positive (e.g. cycle days)
}

export function ComparisonMetric({ label, current, previous, change, format = 'number', currency = 'GHS', invertColors = false }: ComparisonMetricProps) {
  const formatVal = (v: number) => {
    switch (format) {
      case 'currency': return formatCurrency(v, currency)
      case 'percent': return `${Number(v).toFixed(1)}%`
      case 'days': return `${Number(v).toFixed(1)}d`
      default: return Number(v).toLocaleString()
    }
  }

  const isPositive = invertColors ? change < 0 : change > 0

  return (
    <div className="p-3 rounded-lg bg-muted/50 border border-border">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className="text-lg font-bold text-foreground tabular-nums">{formatVal(current)}</p>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-muted-foreground">{formatVal(previous)}</span>
        {change !== 0 && (
          <span className={cn(
            'text-xs font-medium flex items-center gap-0.5',
            isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
          )}>
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {change > 0 ? '+' : ''}{format === 'percent' ? `${change}pp` : `${change}%`}
          </span>
        )}
      </div>
    </div>
  )
}
