'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign, Clock,
  AlertTriangle, CheckCircle, Loader2, ArrowUpRight, ArrowDownRight,
  Activity, Target, Calendar, PieChart, Download, FileText
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { subTabsListClass, subTabsTriggerClass } from '@/components/layout/subTabStyles'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { authedFetch } from '@/lib/authed-fetch'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'

interface PortfolioMetrics {
  summary: {
    totalProjects: number
    activeProjects: number
    completedProjects: number
    onHoldProjects: number
    totalBudget: number
    totalSpent: number
    avgProgress: number
  }
  budgetHealth: {
    underBudget: number
    onBudget: number
    overBudget: number
  }
}

interface BudgetOverview {
  totalBudget: number
  totalActualCost: number
  totalCommitted: number
  totalRemaining: number
  overallVariance: number
  overallVariancePercent: number
  byCategory: Array<{
    category: string
    budgeted: number
    actual: number
    variance: number
    variancePercent: number
    utilizationPercent: number
  }>
}

interface TimelineStatus {
  onSchedule: number
  delayed: number
  ahead: number
  avgDelay: number
  projects: Array<{
    id: string
    name: string
    status: string
    progress: number
    daysRemaining?: number
    isDelayed?: boolean
  }>
}

interface ProjectHealth {
  score: number
  budgetScore: number
  scheduleScore: number
  qualityScore: number
  riskLevel: string
}

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null || isNaN(amount)) return 'GHS 0'
  if (amount >= 1_000_000) return `GHS ${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `GHS ${(amount / 1_000).toFixed(0)}K`
  return `GHS ${amount.toFixed(0)}`
}

function MetricCard({ title, value, subtitle, icon: Icon, trend, trendLabel }: {
  title: string; value: string | number; subtitle?: string; icon: React.ElementType
  trend?: 'up' | 'down' | 'neutral'; trendLabel?: string
}) {
  return (
    <Card className="bg-background border border-border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">{title}</CardTitle>
        <Icon className="h-4 w-4 text-amber-600" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground font-mono">{value}</div>
        {subtitle && <p className="text-[10px] text-muted-foreground mt-1 font-mono">{subtitle}</p>}
        {trend && trendLabel && (
          <div className={`flex items-center gap-1 mt-1 text-[10px] font-mono ${trend === 'up' ? 'text-emerald-600 dark:text-emerald-400' : trend === 'down' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
            {trend === 'up' ? <ArrowUpRight className="h-3 w-3" /> : trend === 'down' ? <ArrowDownRight className="h-3 w-3" /> : null}
            {trendLabel}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function PMReportsPage() {
  const [metrics, setMetrics] = useState<PortfolioMetrics | null>(null)
  const [budget, setBudget] = useState<BudgetOverview | null>(null)
  const [timeline, setTimeline] = useState<TimelineStatus | null>(null)
  const [health, setHealth] = useState<ProjectHealth | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [period, setPeriod] = useState('30d')
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [selectedReportProject, setSelectedReportProject] = useState('')
  const [generatingReport, setGeneratingReport] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true); setError(null)
    try {
      const [metricsRes, budgetRes, timelineRes] = await Promise.all([
        authedFetch(`${API_BASE}/projects/dashboard/metrics?period=${period}`).then(r => r.ok ? r.json() : null).catch(() => null),
        authedFetch(`${API_BASE}/projects/dashboard/budget-overview?period=${period}`).then(r => r.ok ? r.json() : null).catch(() => null),
        authedFetch(`${API_BASE}/projects/dashboard/timeline-status?period=${period}`).then(r => r.ok ? r.json() : null).catch(() => null),
      ])
      setMetrics(metricsRes)
      setBudget(budgetRes)
      setTimeline(timelineRes)
    } catch (err: any) {
      setError(err?.message || 'Failed to load analytics')
    } finally {
      setIsLoading(false)
    }
  }, [period])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    (async () => {
      try {
        const res = await authedFetch(`${API_BASE}/projects?limit=100`);
        const json = await res.json();
        const list = json.projects || json.data?.projects || json.data || [];
        setProjects(list);
        if (list.length > 0 && !selectedReportProject) setSelectedReportProject('__all__');
      } catch (e) { /* ignore */ }
    })();
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 text-amber-600 animate-spin" />
      </div>
    )
  }

  const summary = metrics?.summary
  const budgetUtilization = summary && summary.totalBudget > 0 
    ? Math.round((summary.totalSpent / summary.totalBudget) * 100) 
    : 0

  // Generate and open a PDF report in a new tab
  async function generateReport(projectOrAll: string, reportType: string) {
    setGeneratingReport(reportType)
    try {
      const pdfUrl = projectOrAll === '__all__'
        ? `${API_BASE}/projects/portfolio/reports/${reportType}`
        : `${API_BASE}/projects/${projectOrAll}/reports/${reportType}`
      const res = await authedFetch(pdfUrl)
      if (!res.ok) throw new Error(`Failed to fetch report (${res.status})`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err: any) {
      alert(err.message || 'Failed to generate report')
    } finally {
      setGeneratingReport(null)
    }
  }

  // Export current analytics data as CSV
  function exportAnalytics() {
    let csv = ''
    if (activeTab === 'overview' && summary) {
      csv = 'Metric,Value\n'
      csv += `Total Projects,${summary.totalProjects}\n`
      csv += `Active Projects,${summary.activeProjects}\n`
      csv += `Completed,${summary.completedProjects}\n`
      csv += `On Hold,${summary.onHoldProjects}\n`
      csv += `Total Budget,${summary.totalBudget}\n`
      csv += `Total Spent,${summary.totalSpent}\n`
      csv += `Avg Progress,${summary.avgProgress}%\n`
      csv += `Budget Utilization,${budgetUtilization}%\n`
    } else if (activeTab === 'budget' && budget) {
      csv = 'Category,Budget,Actual,Variance\n'
      ;(budget.byCategory || []).forEach(c => {
        csv += `"${(c.category||'other').replace(/_/g,' ')}",${c.budgeted},${c.actual},${c.variance}\n`
      })
      csv += `\nTotal Budget,${budget.totalBudget}\nTotal Actual,${budget.totalActualCost}\nTotal Committed,${budget.totalCommitted}\nVariance,${budget.overallVariance}\n`
    } else if (activeTab === 'timeline' && timeline) {
      csv = 'Project,Status,Progress,Delayed,Days Remaining\n'
      ;(timeline.projects || []).forEach(p => {
        csv += `"${p.name}","${(p.status||'').replace(/_/g,' ')}",${p.progress}%,${p.isDelayed ? 'Yes' : 'No'},${p.daysRemaining ?? '-'}\n`
      })
    }
    if (!csv) return
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `propmetrik-${activeTab}-report-${new Date().toISOString().split('T')[0]}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground font-mono">REPORTS & ANALYTICS</h1>
          <p className="text-sm text-muted-foreground font-mono">Portfolio KPIs, cost analysis, and risk dashboards</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[120px] bg-background border-border text-muted-foreground font-mono text-xs h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="7d" className="text-muted-foreground font-mono text-xs">7 Days</SelectItem>
              <SelectItem value="30d" className="text-muted-foreground font-mono text-xs">30 Days</SelectItem>
              <SelectItem value="90d" className="text-muted-foreground font-mono text-xs">90 Days</SelectItem>
              <SelectItem value="all" className="text-muted-foreground font-mono text-xs">All Time</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8 px-3 text-[10px] font-mono border-border text-muted-foreground hover:text-foreground" onClick={exportAnalytics}>
            <Download className="mr-1 h-3 w-3" /> EXPORT CSV
          </Button>
        </div>
      </div>

      {error && (
        <div className="text-red-600 dark:text-red-400 text-sm font-mono p-3 bg-red-100 dark:bg-red-900/10 border border-red-900/30 rounded">{error}</div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className={subTabsListClass}>
          <TabsTrigger value="overview" className={subTabsTriggerClass}>Overview</TabsTrigger>
          <TabsTrigger value="budget" className={subTabsTriggerClass}>Budget</TabsTrigger>
          <TabsTrigger value="timeline" className={subTabsTriggerClass}>Timeline</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard title="Total Projects" value={summary?.totalProjects ?? 0} subtitle={`${summary?.activeProjects ?? 0} active`} icon={BarChart3} />
            <MetricCard title="Total Budget" value={formatCurrency(summary?.totalBudget ?? 0)} subtitle={`${formatCurrency(summary?.totalSpent ?? 0)} spent`} icon={DollarSign}
              trend={budgetUtilization > 90 ? 'down' : 'up'} trendLabel={`${budgetUtilization}% utilized`} />
            <MetricCard title="Avg Progress" value={`${summary?.avgProgress?.toFixed(1) ?? 0}%`} subtitle="Across active projects" icon={Target} />
            <MetricCard title="Completed" value={summary?.completedProjects ?? 0} subtitle={`${summary?.onHoldProjects ?? 0} on hold`} icon={CheckCircle} />
          </div>

          {/* Budget Health Bar */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-mono uppercase text-amber-500">Budget Health Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 items-center">
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                    <span>Under Budget: {metrics?.budgetHealth?.underBudget ?? 0}</span>
                    <span>On Budget: {metrics?.budgetHealth?.onBudget ?? 0}</span>
                    <span>Over Budget: {metrics?.budgetHealth?.overBudget ?? 0}</span>
                  </div>
                  <div className="flex h-3 rounded-full overflow-hidden bg-muted">
                    {(metrics?.budgetHealth?.underBudget ?? 0) > 0 && (
                      <div className="bg-emerald-500 h-full" style={{ width: `${((metrics?.budgetHealth?.underBudget ?? 0) / Math.max(summary?.totalProjects ?? 1, 1)) * 100}%` }} />
                    )}
                    {(metrics?.budgetHealth?.onBudget ?? 0) > 0 && (
                      <div className="bg-amber-500 h-full" style={{ width: `${((metrics?.budgetHealth?.onBudget ?? 0) / Math.max(summary?.totalProjects ?? 1, 1)) * 100}%` }} />
                    )}
                    {(metrics?.budgetHealth?.overBudget ?? 0) > 0 && (
                      <div className="bg-red-500 h-full" style={{ width: `${((metrics?.budgetHealth?.overBudget ?? 0) / Math.max(summary?.totalProjects ?? 1, 1)) * 100}%` }} />
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Budget utilization */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-mono uppercase text-amber-500">Budget Utilization</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono text-muted-foreground">
                  <span>Spent: {formatCurrency(summary?.totalSpent ?? 0)}</span>
                  <span>Budget: {formatCurrency(summary?.totalBudget ?? 0)}</span>
                </div>
                <Progress value={budgetUtilization} className="h-2" />
                <div className="text-[10px] font-mono text-muted-foreground">{budgetUtilization}% of total budget utilized</div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Budget Tab */}
      {activeTab === 'budget' && budget && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard title="Total Budget" value={formatCurrency(budget.totalBudget)} icon={DollarSign} />
            <MetricCard title="Total Spent" value={formatCurrency(budget.totalActualCost)} icon={TrendingDown} />
            <MetricCard title="Committed" value={formatCurrency(budget.totalCommitted)} icon={Clock} />
            <MetricCard title="Variance" value={formatCurrency(Math.abs(budget.overallVariance ?? 0))}
              icon={(budget.overallVariance ?? 0) >= 0 ? TrendingUp : TrendingDown}
              trend={(budget.overallVariance ?? 0) >= 0 ? 'up' : 'down'}
              trendLabel={`${(budget.overallVariancePercent ?? 0).toFixed(1)}%`} />
          </div>

          {/* Category breakdown */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-mono uppercase text-amber-500">Budget by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(budget.byCategory || []).map((cat, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-muted-foreground capitalize">{cat.category?.replace(/_/g, ' ') || 'Unknown'}</span>
                      <span className={(cat.variance ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                        {(cat.variance ?? 0) >= 0 ? '+' : ''}{formatCurrency(cat.variance)}
                      </span>
                    </div>
                    <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                      <div className="bg-amber-500 h-full" style={{ width: `${(cat.budgeted ?? 0) > 0 ? Math.min(((cat.actual ?? 0) / cat.budgeted) * 100, 100) : 0}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                      <span>Actual: {formatCurrency(cat.actual)}</span>
                      <span>Budget: {formatCurrency(cat.budgeted)}</span>
                    </div>
                  </div>
                ))}
                {(!budget.byCategory || budget.byCategory.length === 0) && (
                  <div className="text-center py-8 text-muted-foreground font-mono text-sm">No budget categories found</div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Timeline Tab */}
      {activeTab === 'timeline' && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard title="On Schedule" value={timeline?.onSchedule ?? 0} icon={CheckCircle} />
            <MetricCard title="Delayed" value={timeline?.delayed ?? 0} icon={AlertTriangle}
              trend={(timeline?.delayed ?? 0) > 0 ? 'down' : 'up'} trendLabel={`Avg delay: ${timeline?.avgDelay ?? 0} days`} />
            <MetricCard title="Ahead" value={timeline?.ahead ?? 0} icon={TrendingUp} />
          </div>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-mono uppercase text-amber-500">Project Timeline Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(timeline?.projects || []).map(project => (
                  <div key={project.id} className="flex items-center gap-4 p-3 bg-background rounded border border-border">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono text-zinc-200 truncate">{project.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <Progress value={project.progress} className="h-1.5 flex-1" />
                        <span className="text-[10px] font-mono text-muted-foreground">{project.progress}%</span>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-[10px] font-mono uppercase whitespace-nowrap ${
                      project.isDelayed ? 'border-red-900 text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/10'
                      : project.status === 'completed' ? 'border-emerald-900 text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/10'
                      : 'border-amber-900 text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/10'
                    }`}>
                      {project.isDelayed ? 'Delayed' : project.status?.replace(/_/g, ' ')}
                    </Badge>
                    {project.daysRemaining !== undefined && (
                      <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">{project.daysRemaining}d rem</span>
                    )}
                  </div>
                ))}
                {(!timeline?.projects || timeline.projects.length === 0) && (
                  <div className="text-center py-8 text-muted-foreground font-mono text-sm">No project timeline data available</div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
      {/* PDF Report Generation */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm font-mono uppercase text-amber-500"><FileText className="h-4 w-4 inline mr-2" />Generate PDF Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
            <label className="text-xs font-mono text-muted-foreground">Select Project:</label>
            <Select value={selectedReportProject} onValueChange={setSelectedReportProject}>
              <SelectTrigger className="w-[260px] bg-background border-border text-muted-foreground font-mono text-xs h-8"><SelectValue placeholder="Select project" /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="__all__" className="text-amber-600 dark:text-amber-400 font-mono text-xs font-semibold">All Projects (Portfolio)</SelectItem>
                {projects.map(p => <SelectItem key={p.id} value={p.id} className="text-muted-foreground font-mono text-xs">{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Individual Reports */}
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-3">Individual Reports</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Project Summary', desc: 'Project status, KPIs, budget overview, issues, risks, and team metrics', endpoint: 'summary', icon: BarChart3, color: 'text-blue-600 dark:text-blue-400' },
              { label: 'Budget & Financial', desc: 'Detailed budget breakdown, spending by category, cost variance analysis', endpoint: 'budget', icon: DollarSign, color: 'text-green-600 dark:text-green-400' },
              { label: 'Issues & Risks', desc: 'Risk assessment, schedule status, compliance alerts, and milestones', endpoint: 'issues', icon: AlertTriangle, color: 'text-red-600 dark:text-red-400' },
            ].map(report => (
              <button
                key={report.endpoint}
                onClick={() => { if (selectedReportProject) generateReport(selectedReportProject, report.endpoint) }}
                disabled={!selectedReportProject || generatingReport === report.endpoint}
                className="flex flex-col items-start gap-2 p-4 rounded-lg bg-background border border-border hover:border-amber-500/50 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {generatingReport === report.endpoint ? <Loader2 className={`h-5 w-5 ${report.color} animate-spin`} /> : <report.icon className={`h-5 w-5 ${report.color}`} />}
                <div>
                  <p className="text-xs font-mono text-foreground font-semibold">{report.label}</p>
                  <p className="text-[10px] font-mono text-muted-foreground mt-1">{report.desc}</p>
                </div>
                <Badge variant="outline" className="border-amber-800 text-amber-600 dark:text-amber-400 text-[10px] mt-1">PDF</Badge>
              </button>
            ))}
          </div>

          {/* Master Report */}
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-3">Comprehensive</p>
          <button
            onClick={() => { if (selectedReportProject) generateReport(selectedReportProject, 'all') }}
            disabled={!selectedReportProject || generatingReport === 'all'}
            className="w-full flex items-center gap-4 p-4 rounded-lg bg-background border border-border hover:border-amber-500/50 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {generatingReport === 'all' ? <Loader2 className="h-6 w-6 text-amber-600 dark:text-amber-400 animate-spin flex-shrink-0" /> : <Download className="h-6 w-6 text-amber-600 dark:text-amber-400 flex-shrink-0" />}
            <div className="flex-1">
              <p className="text-xs font-mono text-foreground font-semibold">Master Report — All Sections</p>
              <p className="text-[10px] font-mono text-muted-foreground mt-1">
                {selectedReportProject === '__all__'
                  ? 'Portfolio summary, budget analysis, and risk & timeline — all combined in one comprehensive PDF'
                  : 'Project summary, financial report, and issues & risks — all combined in one comprehensive PDF'}
              </p>
            </div>
            <Badge variant="outline" className="border-amber-600 text-amber-600 dark:text-amber-400 text-[10px]">FULL PDF</Badge>
          </button>
        </CardContent>
      </Card>
    </div>
  )
}
