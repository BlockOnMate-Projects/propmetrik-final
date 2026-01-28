'use client'

import React, { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts'
import { DollarSign, TrendingUp, TrendingDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'

// =====================================================
// TYPES
// =====================================================
export interface BudgetCategory {
  category: string
  budgeted: number
  spent: number
  remaining: number
  percentage: number
}

export interface BudgetOverviewData {
  categories: BudgetCategory[]
  totalBudget: number
  totalSpent: number
  totalRemaining: number
  currency: string
}

interface BudgetDonutChartProps {
  data: BudgetOverviewData | null
  isLoading?: boolean
  onCategoryClick?: (category: string) => void
  showCurrencyToggle?: boolean
  className?: string
}

// =====================================================
// CONSTANTS
// =====================================================
const COLORS = [
  '#f59e0b', // amber
  '#3b82f6', // blue
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ef4444', // red
  '#84cc16', // lime
  '#6366f1', // indigo
]

const CATEGORY_LABELS: Record<string, string> = {
  land_acquisition: 'Land Acquisition',
  site_preparation: 'Site Prep',
  foundation: 'Foundation',
  structure: 'Structure',
  exterior: 'Exterior',
  roofing: 'Roofing',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  hvac: 'HVAC',
  interior_finishes: 'Interior',
  landscaping: 'Landscaping',
  permits_fees: 'Permits & Fees',
  professional_services: 'Professional',
  equipment: 'Equipment',
  labor: 'Labor',
  materials: 'Materials',
  contingency: 'Contingency',
  financing: 'Financing',
  other: 'Other',
}

// =====================================================
// CUSTOM TOOLTIP
// =====================================================
function CustomTooltip({ active, payload, currency }: any) {
  if (!active || !payload || !payload.length) return null

  const data = payload[0].payload
  const percentSpent = data.budgeted > 0 ? (data.spent / data.budgeted) * 100 : 0

  return (
    <div className="bg-zinc-900 border border-zinc-700 p-3 shadow-xl rounded">
      <p className="font-mono text-xs text-amber-500 mb-2">{data.label}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="font-mono text-[10px] text-zinc-500">Budgeted:</span>
          <span className="font-mono text-xs text-zinc-300">
            {formatCurrency(data.budgeted, currency)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="font-mono text-[10px] text-zinc-500">Spent:</span>
          <span className="font-mono text-xs text-zinc-300">
            {formatCurrency(data.spent, currency)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="font-mono text-[10px] text-zinc-500">Remaining:</span>
          <span className={cn(
            "font-mono text-xs",
            data.remaining >= 0 ? "text-green-400" : "text-red-400"
          )}>
            {formatCurrency(data.remaining, currency)}
          </span>
        </div>
        <div className="pt-1 border-t border-zinc-700 mt-1">
          <div className="flex justify-between gap-4">
            <span className="font-mono text-[10px] text-zinc-500">Utilized:</span>
            <span className={cn(
              "font-mono text-xs font-medium",
              percentSpent > 100 ? "text-red-400" : percentSpent > 90 ? "text-amber-400" : "text-green-400"
            )}>
              {percentSpent.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// =====================================================
// CENTER LABEL COMPONENT
// =====================================================
function CenterLabel({
  totalBudget,
  totalSpent,
  currency,
}: {
  totalBudget: number
  totalSpent: number
  currency: string
}) {
  const utilization = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0
  const isOverBudget = totalSpent > totalBudget

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
      <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">
        Total Budget
      </span>
      <span className="font-mono text-lg font-semibold text-zinc-100">
        {formatCurrency(totalBudget, currency)}
      </span>
      <div className="flex items-center gap-1 mt-1">
        {isOverBudget ? (
          <TrendingDown className="h-3 w-3 text-red-400" />
        ) : (
          <TrendingUp className="h-3 w-3 text-green-400" />
        )}
        <span className={cn(
          "font-mono text-xs",
          isOverBudget ? "text-red-400" : "text-green-400"
        )}>
          {utilization.toFixed(1)}% used
        </span>
      </div>
    </div>
  )
}

// =====================================================
// BUDGET LEGEND
// =====================================================
function BudgetLegend({
  data,
  currency,
  onCategoryClick,
}: {
  data: BudgetCategory[]
  currency: string
  onCategoryClick?: (category: string) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2 mt-4">
      {data.map((item, index) => {
        const percentSpent = item.budgeted > 0 ? (item.spent / item.budgeted) * 100 : 0
        const label = CATEGORY_LABELS[item.category] || item.category

        return (
          <button
            key={item.category}
            onClick={() => onCategoryClick?.(item.category)}
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded transition-colors text-left",
              onCategoryClick && "hover:bg-zinc-800 cursor-pointer"
            )}
          >
            <div
              className="w-3 h-3 rounded-sm shrink-0"
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-zinc-400 truncate">
                  {label}
                </span>
                <span className="font-mono text-[10px] text-zinc-300">
                  {item.percentage.toFixed(1)}%
                </span>
              </div>
              {/* Mini progress bar */}
              <div className="h-1 bg-zinc-800 rounded-full mt-0.5 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    percentSpent > 100 ? "bg-red-500" : percentSpent > 90 ? "bg-amber-500" : "bg-green-500"
                  )}
                  style={{ width: `${Math.min(percentSpent, 100)}%` }}
                />
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// =====================================================
// MAIN BUDGET DONUT CHART COMPONENT
// =====================================================
export function BudgetDonutChart({
  data,
  isLoading = false,
  onCategoryClick,
  showCurrencyToggle = false,
  className,
}: BudgetDonutChartProps) {
  const [viewMode, setViewMode] = useState<'budgeted' | 'spent'>('budgeted')

  // Transform data for chart
  const chartData = useMemo(() => {
    if (!data?.categories) return []

    return data.categories
      .filter(cat => cat.budgeted > 0 || cat.spent > 0)
      .map((cat, index) => ({
        ...cat,
        label: CATEGORY_LABELS[cat.category] || cat.category,
        value: viewMode === 'budgeted' ? cat.budgeted : cat.spent,
        color: COLORS[index % COLORS.length],
      }))
      .sort((a, b) => b.value - a.value)
  }, [data, viewMode])

  if (isLoading) {
    return (
      <div className={cn("border border-zinc-800 bg-zinc-900/50 p-4", className)}>
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="h-4 w-4 text-amber-500" />
          <span className="font-mono text-xs text-amber-500 tracking-wider">
            BUDGET OVERVIEW
          </span>
        </div>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
        </div>
      </div>
    )
  }

  if (!data || chartData.length === 0) {
    return (
      <div className={cn("border border-zinc-800 bg-zinc-900/50 p-4", className)}>
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="h-4 w-4 text-amber-500" />
          <span className="font-mono text-xs text-amber-500 tracking-wider">
            BUDGET OVERVIEW
          </span>
        </div>
        <div className="flex items-center justify-center h-64 text-zinc-500">
          <span className="font-mono text-sm">No budget data available</span>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("border border-zinc-800 bg-zinc-900/50 p-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-amber-500" />
          <span className="font-mono text-xs text-amber-500 tracking-wider">
            BUDGET OVERVIEW
          </span>
        </div>
        
        {/* View toggle */}
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode('budgeted')}
            className={cn(
              "text-xs h-7",
              viewMode === 'budgeted' ? "bg-amber-500/10 text-amber-500" : "text-zinc-500"
            )}
          >
            Budgeted
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode('spent')}
            className={cn(
              "text-xs h-7",
              viewMode === 'spent' ? "bg-amber-500/10 text-amber-500" : "text-zinc-500"
            )}
          >
            Spent
          </Button>
        </div>
      </div>

      {/* Chart */}
      <div className="relative h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
              animationBegin={0}
              animationDuration={800}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={entry.category}
                  fill={entry.color}
                  stroke="transparent"
                  style={{ cursor: onCategoryClick ? 'pointer' : 'default' }}
                  onClick={() => onCategoryClick?.(entry.category)}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip currency={data.currency} />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Center label */}
        <CenterLabel
          totalBudget={data.totalBudget}
          totalSpent={data.totalSpent}
          currency={data.currency}
        />
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-zinc-800">
        <div className="text-center">
          <span className="font-mono text-[10px] text-zinc-500 block">Total Budget</span>
          <span className="font-mono text-sm text-zinc-100">
            {formatCurrency(data.totalBudget, data.currency)}
          </span>
        </div>
        <div className="text-center">
          <span className="font-mono text-[10px] text-zinc-500 block">Spent</span>
          <span className="font-mono text-sm text-amber-400">
            {formatCurrency(data.totalSpent, data.currency)}
          </span>
        </div>
        <div className="text-center">
          <span className="font-mono text-[10px] text-zinc-500 block">Remaining</span>
          <span className={cn(
            "font-mono text-sm",
            data.totalRemaining >= 0 ? "text-green-400" : "text-red-400"
          )}>
            {formatCurrency(data.totalRemaining, data.currency)}
          </span>
        </div>
      </div>

      {/* Legend */}
      <BudgetLegend
        data={chartData}
        currency={data.currency}
        onCategoryClick={onCategoryClick}
      />
    </div>
  )
}

export default BudgetDonutChart
