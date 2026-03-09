import React, { useMemo } from 'react'
import {
  TrendingUp,
  DollarSign,
  Calendar,
  Home,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Pause,
  XCircle,
  Clock
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { BudgetSummary, ProjectStats, UnitStats, DevelopmentProject, ProjectPhase } from '@/types/projects'
import { cn } from '@/lib/utils'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

interface ProjectMetricsProps {
  project?: DevelopmentProject
  phases?: ProjectPhase[]
  budget?: BudgetSummary
  stats?: ProjectStats
  units?: UnitStats
  currency?: string
  rfiStats?: { total: number; overdue: number; by_status?: Record<string, number> }
  coStats?: { total: number; total_cost_impact: number; total_pending: number; by_status?: Record<string, number> }
}

export function ProjectMetrics({
  project,
  phases,
  budget,
  stats,
  units,
  currency = 'GHS',
  rfiStats,
  coStats,
}: ProjectMetricsProps) {

  // ─── Budget calculations ───
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

  // ─── Timeline calculations ───
  const timeline = useMemo(() => {
    const start = project?.actual_start_date || project?.planned_start_date
    const end = project?.planned_end_date || project?.planned_completion_date

    if (!start || !end) return { weeksElapsed: 0, totalWeeks: 0, currentPhase: null as ProjectPhase | null, overallProgress: project?.overall_progress || 0, targetProgress: 0 }

    const startDate = new Date(start)
    const endDate = new Date(end)
    const now = new Date()

    const totalMs = endDate.getTime() - startDate.getTime()
    const elapsedMs = now.getTime() - startDate.getTime()

    const totalWeeks = Math.max(1, Math.round(totalMs / (7 * 24 * 60 * 60 * 1000)))
    const weeksElapsed = Math.max(0, Math.min(totalWeeks, Math.round(elapsedMs / (7 * 24 * 60 * 60 * 1000))))

    const currentPhase = phases?.find(p => p.status === 'in_progress') || null

    // Overall progress: weighted average of phase completion, or project-level field
    const totalPhases = phases?.length || 0
    const overallProgress = totalPhases > 0
      ? Math.round(phases!.reduce((sum, p) => sum + (p.progress_percentage || 0), 0) / totalPhases)
      : (project?.overall_progress || 0)

    const targetProgress = Math.round((weeksElapsed / totalWeeks) * 100)

    return { weeksElapsed, totalWeeks, currentPhase, overallProgress, targetProgress }
  }, [project, phases])

  const scheduleVariance = timeline.overallProgress - timeline.targetProgress

  // ─── Overall Health calculation ───
  const health = useMemo(() => {
    if (!project) return { label: 'No Data', color: 'zinc', bgColor: 'bg-zinc-500/10', textColor: 'text-zinc-400', borderColor: 'border-zinc-500/20', icon: Clock, description: 'No project data loaded' }

    // Terminal project states
    if (project.status === 'on_hold') return { label: 'On Hold', color: 'zinc', bgColor: 'bg-zinc-500/10', textColor: 'text-zinc-400', borderColor: 'border-zinc-500/20', icon: Pause, description: 'Project is on hold' }
    if (project.status === 'cancelled') return { label: 'Cancelled', color: 'red', bgColor: 'bg-red-500/10', textColor: 'text-red-400', borderColor: 'border-red-500/20', icon: XCircle, description: 'Project has been cancelled' }
    if (project.status === 'completed' || project.status === 'sold_out') return { label: 'Completed', color: 'emerald', bgColor: 'bg-emerald-500/10', textColor: 'text-emerald-400', borderColor: 'border-emerald-500/20', icon: CheckCircle2, description: 'Project completed successfully' }

    // Count risk factors
    let issues = 0
    let warnings = 0
    const riskTags: string[] = []

    // Budget risk
    if (budgetUtilization > 100) { issues++; riskTags.push('Over Budget') }
    else if (budgetUtilization > 90) { warnings++; riskTags.push('Budget Risk') }

    // Delayed or blocked phases
    const delayedPhases = phases?.filter(p => p.status === 'delayed' || p.status === 'blocked') || []
    if (delayedPhases.length > 0) { issues += delayedPhases.length; riskTags.push(`${delayedPhases.length} Phase${delayedPhases.length > 1 ? 's' : ''} Delayed`) }

    // Schedule variance (behind schedule by >10%?)
    if (scheduleVariance < -15) { issues++; riskTags.push('Behind Schedule') }
    else if (scheduleVariance < -5) { warnings++; riskTags.push('Schedule Slip') }

    // Overdue RFIs
    if (rfiStats && rfiStats.overdue > 0) { warnings++; riskTags.push(`${rfiStats.overdue} Overdue RFI${rfiStats.overdue > 1 ? 's' : ''}`) }

    // Pending change orders with cost impact
    if (coStats && coStats.total_pending > 0 && coStats.total_cost_impact > 0) { warnings++; riskTags.push('Pending COs') }

    if (issues > 0) return { label: 'At Risk', color: 'red', bgColor: 'bg-red-500/10', textColor: 'text-red-400', borderColor: 'border-red-500/20', icon: ShieldAlert, description: riskTags.slice(0, 2).join(' · '), riskTags }
    if (warnings > 0) return { label: 'Caution', color: 'amber', bgColor: 'bg-amber-500/10', textColor: 'text-amber-400', borderColor: 'border-amber-500/20', icon: AlertTriangle, description: riskTags.slice(0, 2).join(' · '), riskTags }
    return { label: 'On Track', color: 'emerald', bgColor: 'bg-emerald-500/10', textColor: 'text-emerald-400', borderColor: 'border-emerald-500/20', icon: CheckCircle2, description: 'No critical issues detected', riskTags: [] }
  }, [project, phases, budgetUtilization, scheduleVariance, rfiStats, coStats])

  const HealthIcon = health.icon

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">

      {/* 1. HEALTH / OVERVIEW CARD — computed from real data */}
      <Card className="bg-zinc-950/50 border-zinc-800 backdrop-blur-sm shadow-xl hover:border-zinc-700 transition-colors">
        <CardHeader className="flex flex-row items-center justify-between pb-3 space-y-0 border-b border-zinc-800/50 mb-3">
          <CardTitle className="text-[11px] font-sans font-semibold text-zinc-400 uppercase tracking-widest">
            Overall Health
          </CardTitle>
          <div className={cn("p-1.5 rounded-md", health.bgColor)}>
            <HealthIcon className={cn("h-4 w-4", health.textColor)} />
          </div>
        </CardHeader>
        <CardContent>
          <div className={cn("text-2xl font-semibold tracking-tight mb-1", health.textColor)}>{health.label}</div>
          <p className="text-xs text-zinc-500 font-medium">
            {health.description}
          </p>
          <div className="mt-5 flex items-center gap-2 flex-wrap">
            {/* Overall progress badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-800/50 rounded border border-zinc-700">
              <TrendingUp className="h-3 w-3 text-zinc-400" />
              <span className="text-[10px] text-zinc-300 font-medium uppercase tracking-wider">{timeline.overallProgress}% Done</span>
            </div>
            {/* Risk tags */}
            {health.riskTags?.slice(0, 2).map((tag, i) => (
              <div key={i} className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded border", health.bgColor, health.borderColor)}>
                <AlertTriangle className={cn("h-3 w-3", health.textColor, health.color === 'amber' && 'animate-pulse')} />
                <span className={cn("text-[10px] font-medium uppercase tracking-wider", health.textColor)}>{tag}</span>
              </div>
            ))}
            {/* Show compliance OK only when healthy */}
            {health.label === 'On Track' && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 rounded border border-emerald-500/20">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                <span className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider">All Clear</span>
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

      {/* 4. SCHEDULE / TIMELINE CARD — computed from real dates + phases */}
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
          {timeline.totalWeeks > 0 ? (
            <>
              <div className="text-2xl font-semibold text-white tracking-tight mb-1">
                Week {timeline.weeksElapsed} <span className="text-sm text-zinc-500 font-normal tracking-normal">/ {timeline.totalWeeks}</span>
              </div>
              <p className="text-xs text-zinc-400 font-medium truncate">
                {timeline.currentPhase
                  ? `Current: ${timeline.currentPhase.phase_name}`
                  : phases && phases.length > 0
                    ? phases.every(p => p.status === 'completed') ? 'All phases completed' : 'No active phase'
                    : 'No phases defined'}
              </p>

              <div className="mt-5 space-y-2">
                <div className="flex justify-between text-[10px] font-mono uppercase tracking-wider">
                  <span className={cn(
                    "font-semibold",
                    scheduleVariance >= 0 ? 'text-indigo-400' : scheduleVariance > -10 ? 'text-amber-400' : 'text-red-400'
                  )}>
                    {timeline.overallProgress}% Complete
                  </span>
                  <span className="text-zinc-500">Target: {timeline.targetProgress}%</span>
                </div>
                <div className="relative w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  {/* Target Marker */}
                  {timeline.targetProgress > 0 && timeline.targetProgress <= 100 && (
                    <div className="absolute top-0 bottom-0 w-0.5 bg-zinc-500 z-10" style={{ left: `${Math.min(timeline.targetProgress, 100)}%` }}></div>
                  )}
                  <div
                    className={cn(
                      "absolute top-0 bottom-0 rounded-full",
                      scheduleVariance >= 0 ? 'bg-indigo-500' : scheduleVariance > -10 ? 'bg-amber-500' : 'bg-red-500'
                    )}
                    style={{ width: `${Math.min(timeline.overallProgress, 100)}%` }}
                  ></div>
                </div>
                {scheduleVariance !== 0 && (
                  <div className={cn(
                    "text-[10px] font-mono",
                    scheduleVariance > 0 ? 'text-emerald-400' : scheduleVariance > -10 ? 'text-amber-400' : 'text-red-400'
                  )}>
                    {scheduleVariance > 0 ? `+${scheduleVariance}% ahead` : `${scheduleVariance}% behind schedule`}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-[104px] text-zinc-600 text-xs text-center p-4">
              <Calendar className="h-6 w-6 mb-2 opacity-20" />
              No timeline dates set
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
