'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  PieChart,
  Loader2,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { projectsApi, dashboardApi } from '@/lib/projects-api'
import type { DevelopmentProject } from '@/types/projects'
import type { PortfolioMetrics, BudgetOverview } from '@/lib/projects-api'
import { formatCurrency } from '@/lib/utils'

export default function ProjectsCostsPage() {
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState<PortfolioMetrics | null>(null)
  const [budgetOverview, setBudgetOverview] = useState<BudgetOverview | null>(null)
  const [projects, setProjects] = useState<DevelopmentProject[]>([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [metricsRes, budgetRes, projectsRes] = await Promise.allSettled([
        dashboardApi.getPortfolioMetrics(),
        dashboardApi.getBudgetOverview(),
        projectsApi.getAll({ limit: 50 }),
      ])

      if (metricsRes.status === 'fulfilled') setMetrics(metricsRes.value)
      if (budgetRes.status === 'fulfilled') setBudgetOverview(budgetRes.value)
      if (projectsRes.status === 'fulfilled') {
        const data = projectsRes.value
        setProjects(Array.isArray(data) ? data : (data as any)?.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch cost data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const totalBudget = metrics?.totalBudget?.amount || budgetOverview?.totalBudget || 0
  const totalSpent = metrics?.totalSpent?.amount || budgetOverview?.totalSpent || 0
  // Derive remaining from the FX-normalized totals so it stays consistent with the
  // headline budget (the legacy budgetOverview.totalRemaining was a raw, non-FX sum).
  const totalRemaining = totalBudget - totalSpent
  // Derive portfolio currency from the first project that has one, or from metrics/overview
  const currency = metrics?.totalBudget?.currency || budgetOverview?.currency || projects.find(p => p.currency)?.currency || 'GHS'
  const utilization = metrics?.budgetUtilization ?? (totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0)
  const isOverBudget = totalRemaining < 0

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground tracking-tight">
            PORTFOLIO COSTS
          </h1>
          <p className="text-muted-foreground font-mono text-xs mt-1">
            Budget and cost overview across all projects
          </p>
        </div>
        <Button variant="outline" className="border-border text-muted-foreground" onClick={fetchData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-card/80 border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground tracking-wider">TOTAL BUDGET</p>
                    <p className="text-xl font-bold text-foreground mt-1">
                      {formatCurrency(totalBudget, currency)}
                    </p>
                    <p className="text-[10px] font-mono text-muted-foreground mt-1">
                      {metrics?.totalProjects || projects.length} projects
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <PieChart className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/80 border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground tracking-wider">TOTAL SPENT</p>
                    <p className="text-xl font-bold text-foreground mt-1">
                      {formatCurrency(totalSpent, currency)}
                    </p>
                    <p className="text-[10px] font-mono text-muted-foreground mt-1">
                      {utilization}% utilized
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/80 border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground tracking-wider">REMAINING</p>
                    <p className={`text-xl font-bold mt-1 ${isOverBudget ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {formatCurrency(Math.abs(totalRemaining), currency)}
                    </p>
                    <p className="text-[10px] font-mono text-muted-foreground mt-1">
                      {isOverBudget ? 'Over budget' : 'Under budget'}
                    </p>
                  </div>
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${isOverBudget ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
                    {isOverBudget
                      ? <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
                      : <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    }
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/80 border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground tracking-wider">AT RISK</p>
                    <p className="text-xl font-bold text-foreground mt-1">
                      {metrics?.projectsAtRisk ?? 0}
                    </p>
                    <p className="text-[10px] font-mono text-muted-foreground mt-1">
                      projects over budget
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Budget Utilization Bar */}
          <Card className="bg-card/80 border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-foreground text-sm font-mono">Budget Utilization</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${utilization > 100 ? 'bg-red-500' : utilization > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(utilization, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="font-mono text-[10px] text-muted-foreground">0%</span>
                <span className={`font-mono text-xs font-bold ${utilization > 100 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                  {utilization}%
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">100%</span>
              </div>
            </CardContent>
          </Card>

          {/* Budget Breakdown by Category */}
          {budgetOverview?.categories && budgetOverview.categories.length > 0 && (
            <Card className="bg-card/80 border-border">
              <CardHeader>
                <CardTitle className="text-foreground text-sm font-mono">Cost by Category</CardTitle>
                <CardDescription className="text-muted-foreground text-xs">
                  Aggregate budget vs. actual across all projects
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {budgetOverview.categories.map((cat) => {
                    const pct = cat.percentage || (cat.budgeted > 0 ? Math.round((cat.spent / cat.budgeted) * 100) : 0)
                    return (
                      <div key={cat.category} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground capitalize">{cat.category.replace(/_/g, ' ')}</span>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {formatCurrency(cat.spent, currency)} / {formatCurrency(cat.budgeted, currency)}
                            </span>
                            <span className={`font-mono text-xs font-medium ${pct > 100 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                              {pct}%
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${pct > 100 ? 'bg-red-500' : 'bg-amber-500'}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Per-Project Budget Table */}
          <Card className="bg-card/80 border-border">
            <CardHeader>
              <CardTitle className="text-foreground text-sm font-mono">Project Budgets</CardTitle>
              <CardDescription className="text-muted-foreground text-xs">
                Click a project to manage its individual costs
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground font-mono text-[10px] tracking-wider">
                      <th className="text-left p-3">PROJECT</th>
                      <th className="text-left p-3">STATUS</th>
                      <th className="text-right p-3">BUDGET</th>
                      <th className="text-right p-3">SPENT</th>
                      <th className="text-right p-3">UTIL %</th>
                      <th className="text-right p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center py-10 text-muted-foreground font-mono text-xs">
                          No projects found
                        </td>
                      </tr>
                    )}
                    {projects.map((p) => {
                      const pBudget = (p as any).total_budget || (p as any).budget || 0
                      const pSpent = (p as any).total_spent || (p as any).actual_cost || 0
                      const pUtil = pBudget > 0 ? Math.round((pSpent / pBudget) * 100) : 0
                      return (
                        <tr
                          key={p.id}
                          className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
                        >
                          <td className="p-3">
                            <span className="text-foreground font-medium">{p.name}</span>
                          </td>
                          <td className="p-3">
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-mono capitalize ${
                                p.status === 'under_construction' ? 'border-amber-600 text-amber-600 dark:text-amber-400 bg-amber-500/10' :
                                p.status === 'completed' ? 'border-green-600 text-green-600 dark:text-green-400 bg-green-500/10' :
                                p.status === 'planning' ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-500/10' :
                                p.status === 'on_hold' ? 'border-red-600 text-red-600 dark:text-red-400 bg-red-500/10' :
                                p.status === 'cancelled' ? 'border-zinc-600 text-muted-foreground bg-zinc-500/10' :
                                'border-zinc-600 text-muted-foreground bg-muted'
                              }`}
                            >
                              {(p.status || '').replace(/_/g, ' ')}
                            </Badge>
                          </td>
                          <td className="p-3 text-right font-mono text-muted-foreground">
                            {formatCurrency(pBudget, (p as any).currency || currency)}
                          </td>
                          <td className="p-3 text-right font-mono text-muted-foreground">
                            {formatCurrency(pSpent, (p as any).currency || currency)}
                          </td>
                          <td className="p-3 text-right">
                            <span
                              className={`font-mono text-xs font-medium ${
                                pUtil > 100 ? 'text-red-600 dark:text-red-400' : pUtil > 80 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                              }`}
                            >
                              {pUtil}%
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <Link
                              href={`/dashboard/projects/${p.id}/budget-cost`}
                              className="inline-flex items-center gap-1 text-amber-500 hover:text-amber-400 font-mono text-[10px] tracking-wider"
                            >
                              DETAILS <ArrowRight className="h-3 w-3" />
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
