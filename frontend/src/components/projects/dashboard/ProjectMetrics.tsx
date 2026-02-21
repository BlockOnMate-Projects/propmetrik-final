import React from 'react'
import {
  TrendingUp,
  DollarSign,
  Calendar,
  Home,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { formatCurrency } from '@/lib/utils'
import { BudgetSummary, ProjectStats, UnitStats } from '@/types/projects'
import { cn } from '@/lib/utils'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

interface ProjectMetricsProps {
  budget?: BudgetSummary
  stats?: ProjectStats
  units?: UnitStats
  currency?: string
}

export function ProjectMetrics({
  budget,
  stats,
  units,
  currency = 'GHS'
}: ProjectMetricsProps) {

  // Calculate Progress Percentages
  // According to types/projects.ts:
  // BudgetSummary has total_revised_budget, total_actual
  const totalBudgetVal = budget?.total_revised_budget || budget?.total_original_budget || 0
  const totalSpentVal = budget?.total_actual || 0

  const budgetUtilization = budget && totalBudgetVal > 0
    ? (totalSpentVal / totalBudgetVal) * 100
    : 0

  const budgetColor = budgetUtilization > 100 ? 'text-red-500'
    : budgetUtilization > 90 ? 'text-amber-500'
      : 'text-emerald-500'

  const budgetHex = budgetUtilization > 100 ? '#ef4444'
    : budgetUtilization > 90 ? '#f59e0b'
      : '#10b981'

  const pieData = budget ? [
    { name: 'Spent', value: totalSpentVal, color: budgetHex },
    { name: 'Remaining', value: Math.max(0, totalBudgetVal - totalSpentVal), color: '#27272a' }
  ] : []

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">

      {/* 1. HEALTH / OVERVIEW CARD */}
      <Card className="bg-zinc-950/50 border-zinc-800 backdrop-blur-sm shadow-xl hover:border-zinc-700 transition-colors">
        <CardHeader className="flex flex-row items-center justify-between pb-3 space-y-0 border-b border-zinc-800/50 mb-3">
          <CardTitle className="text-[11px] font-sans font-semibold text-zinc-400 uppercase tracking-widest">
            Overall Health
          </CardTitle>
          <div className="p-1.5 bg-emerald-500/10 rounded-md">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold text-white tracking-tight mb-1">On Track</div>
          <p className="text-xs text-zinc-500 font-medium">
            No critical operational issues detected
          </p>
          <div className="mt-5 flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 rounded border border-emerald-500/20">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              <span className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider">Compliance OK</span>
            </div>
            {budgetUtilization > 95 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 rounded border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]">
                <AlertTriangle className="h-3 w-3 text-amber-500 animate-pulse" />
                <span className="text-[10px] text-amber-400 font-medium uppercase tracking-wider">Budget Risk</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 2. BUDGET CARD (WITH RECHARTS DONUT) */}
      <Card className="bg-zinc-950/50 border-zinc-800 backdrop-blur-sm shadow-xl hover:border-zinc-700 transition-colors relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
        <CardHeader className="flex flex-row items-center justify-between pb-3 space-y-0 border-b border-zinc-800/50 mb-3">
          <CardTitle className="text-[11px] font-sans font-semibold text-zinc-400 uppercase tracking-widest">
            Active Budget
          </CardTitle>
          <div className="p-1.5 bg-zinc-800/50 rounded-md">
            <DollarSign className="h-4 w-4 text-zinc-400" />
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="flex-1">
            <div className="text-2xl font-semibold text-white tracking-tight mb-1">
              {formatCurrency(totalSpentVal, currency)}
            </div>
            <div className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">
              of {formatCurrency(totalBudgetVal, currency)} Total
            </div>
            <div className={cn("mt-4 text-[11px] font-semibold uppercase tracking-wider", budgetColor)}>
              {budgetUtilization.toFixed(1)}% Utilized
            </div>
          </div>

          {budget && (
            <div className="w-16 h-16 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={20}
                    outerRadius={30}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', fontSize: '12px' }}
                    itemStyle={{ color: '#fff' }}
                    formatter={(value: number) => formatCurrency(value, currency)}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. UNITS / SALES CARD */}
      <Card className="bg-zinc-950/50 border-zinc-800 backdrop-blur-sm shadow-xl hover:border-zinc-700 transition-colors">
        <CardHeader className="flex flex-row items-center justify-between pb-3 space-y-0 border-b border-zinc-800/50 mb-3">
          <CardTitle className="text-[11px] font-sans font-semibold text-zinc-400 uppercase tracking-widest">
            Sales & Inventory
          </CardTitle>
          <div className="p-1.5 bg-blue-500/10 rounded-md">
            <Home className="h-4 w-4 text-blue-400" />
          </div>
        </CardHeader>
        <CardContent>
          {units ? (
            <div className="space-y-4">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-3xl font-semibold text-white tracking-tight leading-none mb-1">
                    {units.by_status?.['sold'] || 0}
                  </div>
                  <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">
                    Units Sold / {units.total} Total
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-white tracking-tight">{units.total > 0 ? (((units.by_status?.['sold'] || 0) / units.total) * 100).toFixed(0) : 0}%</div>
                </div>
              </div>

              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden flex">
                <div style={{ width: `${units.total > 0 ? ((units.by_status?.['sold'] || 0) / units.total) * 100 : 0}%` }} className="bg-blue-500 h-full"></div>
                <div style={{ width: `${units.total > 0 ? ((units.by_status?.['reserved'] || 0) / units.total) * 100 : 0}%` }} className="bg-amber-500 h-full"></div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-800/50">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-zinc-500 uppercase font-medium tracking-wider flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-zinc-600"></div> Available</span>
                  <span className="text-sm font-semibold text-zinc-300">{units.by_status?.['available'] || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-zinc-500 uppercase font-medium tracking-wider flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div> Reserved</span>
                  <span className="text-sm font-semibold text-amber-400">{units.by_status?.['reserved'] || 0}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-[104px] text-zinc-600 text-xs text-center p-4">
              <Home className="h-6 w-6 mb-2 opacity-20" />
              Not applicable for this project type
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. SCHEDULE / TIMELINE CARD */}
      <Card className="bg-zinc-950/50 border-zinc-800 backdrop-blur-sm shadow-xl hover:border-zinc-700 transition-colors">
        <CardHeader className="flex flex-row items-center justify-between pb-3 space-y-0 border-b border-zinc-800/50 mb-3">
          <CardTitle className="text-[11px] font-sans font-semibold text-zinc-400 uppercase tracking-widest">
            Timeline Progress
          </CardTitle>
          <div className="p-1.5 bg-indigo-500/10 rounded-md">
            <Calendar className="h-4 w-4 text-indigo-400" />
          </div>
        </CardHeader>
        <CardContent>
          {/* Placeholder for timeline calculation */}
          <div className="text-2xl font-semibold text-white tracking-tight mb-1">Week 12 <span className="text-sm text-zinc-500 font-normal tracking-normal">/ 48</span></div>
          <p className="text-xs text-zinc-400 font-medium truncate">
            Current: Phase 2 Foundation
          </p>

          <div className="mt-5 space-y-2">
            <div className="flex justify-between text-[10px] font-mono uppercase tracking-wider">
              <span className="text-indigo-400 font-semibold">35% Complete</span>
              <span className="text-zinc-500">Target: 40%</span>
            </div>
            <div className="relative w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              {/* Target Marker */}
              <div className="absolute top-0 bottom-0 w-0.5 bg-zinc-500 z-10" style={{ left: '40%' }}></div>
              <div className="absolute top-0 bottom-0 bg-indigo-500 rounded-full" style={{ width: '35%' }}></div>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  )
}
