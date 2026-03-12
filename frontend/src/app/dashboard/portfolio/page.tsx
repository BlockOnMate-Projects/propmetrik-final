'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import {
  Plus,
  Building2,
  RefreshCw,
  ArrowRight,
  BarChart3,
  Clock,
  AlertTriangle,
  Target,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import {
  dashboardApi,
  milestonesApi,
  ganttApi,
} from '@/lib/projects-api'
import {
  PortfolioMetricCards,
  BudgetDonutChart,
  AlertsPanel,
  MilestonesWidget,
  ProjectsTable,
} from '@/components/projects'

// =====================================================
// TYPES
// =====================================================
interface DashboardData {
  metrics: any
  budget: any
  timeline: any
  alerts: any[]
  milestones: any[]
}

// =====================================================
// LOADING SKELETON
// =====================================================
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Metrics skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>

      {/* Main grid skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-96 rounded-lg" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

// =====================================================
// PANEL COMPONENT
// =====================================================
function Panel({
  title,
  icon: Icon,
  children,
  action,
  className,
}: {
  title: string
  icon?: React.ElementType
  children: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('border border-zinc-800 bg-zinc-900/50', className)}>
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/50 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-amber-500" />}
          <span className="font-mono text-xs text-amber-500 tracking-wider">{title}</span>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

// =====================================================
// MAIN PORTFOLIO DASHBOARD PAGE
// =====================================================
export default function PortfolioDashboardPage() {
  const [activeTab, setActiveTab] = useState('overview')

  // Fetch portfolio metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['dashboard', 'metrics'],
    queryFn: () => dashboardApi.getPortfolioMetrics(),
    staleTime: 60000,
  })

  // Fetch budget overview
  const { data: budget, isLoading: budgetLoading } = useQuery({
    queryKey: ['dashboard', 'budget'],
    queryFn: () => dashboardApi.getBudgetOverview(),
    staleTime: 60000,
  })

  // Fetch timeline status
  const { data: timeline, isLoading: timelineLoading } = useQuery({
    queryKey: ['dashboard', 'timeline'],
    queryFn: () => dashboardApi.getTimelineStatus(),
    staleTime: 60000,
  })

  // Fetch alerts
  const { data: alerts, isLoading: alertsLoading } = useQuery({
    queryKey: ['dashboard', 'alerts'],
    queryFn: () => dashboardApi.getAlerts(),
    staleTime: 30000,
  })

  // Fetch upcoming milestones
  const { data: milestones, isLoading: milestonesLoading } = useQuery({
    queryKey: ['milestones', 'upcoming'],
    queryFn: () => milestonesApi.getUpcoming({ days: 30 }),
    staleTime: 60000,
  })

  const isLoading = metricsLoading || budgetLoading || timelineLoading || alertsLoading || milestonesLoading

  // Calculate at-risk count from alerts
  const criticalAlerts = (alerts || []).filter((a: any) => a.severity === 'critical').length

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-xl tracking-tight">PORTFOLIO DASHBOARD</h1>
            <p className="font-mono text-xs text-zinc-500 mt-0.5">
              Real-time overview of all development projects
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/projects/new">
              <Button className="bg-amber-600 hover:bg-amber-700 text-white font-mono text-xs">
                <Plus className="h-4 w-4 mr-2" />
                NEW PROJECT
              </Button>
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-transparent border-b-0 p-0 h-auto gap-0">
              {[
                { value: 'overview', label: 'Overview', icon: BarChart3 },
                { value: 'projects', label: 'All Projects', icon: Building2 },
                { value: 'timeline', label: 'Timeline', icon: Clock },
                { value: 'alerts', label: 'Alerts', icon: AlertTriangle, badge: criticalAlerts },
              ].map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className={cn(
                    "font-mono text-xs px-4 py-2 rounded-none border-b-2 data-[state=active]:border-amber-500 data-[state=active]:text-amber-500",
                    "data-[state=inactive]:border-transparent data-[state=inactive]:text-zinc-500"
                  )}
                >
                  <tab.icon className="h-3 w-3 mr-1.5" />
                  {tab.label}
                  {tab.badge && tab.badge > 0 && (
                    <span className="ml-1.5 bg-red-500 text-white text-[9px] font-bold px-1 py-0.5 rounded">
                      {tab.badge}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {isLoading ? (
          <DashboardSkeleton />
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            {/* Overview Tab */}
            <TabsContent value="overview" className="mt-0 space-y-6">
              {/* Metric Cards */}
              <PortfolioMetricCards
                metrics={metrics || {
                  totalProjects: 0,
                  projectsByStatus: { planning: 0, in_progress: 0, on_hold: 0, completed: 0 },
                  totalBudget: { amount: 0, currency: 'GHS' },
                  totalSpent: { amount: 0, currency: 'GHS' },
                  budgetUtilization: 0,
                  projectsAtRisk: 0,
                  avgProgress: 0,
                  monthOverMonthChange: 0,
                }}
              />

              {/* Main Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Budget Chart */}
                  <Panel title="BUDGET OVERVIEW" icon={BarChart3}>
                    <BudgetDonutChart
                      data={budget || {
                        totalBudget: 0,
                        totalSpent: 0,
                        totalRemaining: 0,
                        categories: [],
                        currency: 'GHS',
                      }}
                    />
                  </Panel>

                  {/* Recent Projects Preview */}
                  <Panel
                    title="RECENT PROJECTS"
                    icon={Building2}
                    action={
                      <Link href="/dashboard/projects">
                        <Button variant="ghost" size="sm" className="h-6 font-mono text-[10px] text-zinc-400 hover:text-amber-500">
                          View All
                          <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      </Link>
                    }
                  >
                    <ProjectsTable className="border-0" />
                  </Panel>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                  {/* Alerts Panel */}
                  <Panel title="ACTIVE ALERTS" icon={AlertTriangle}>
                    <AlertsPanel
                      alerts={alerts || []}
                      maxVisible={5}
                      onDismiss={(id) => console.log('Dismiss:', id)}
                      onSnooze={(id, hours) => console.log('Snooze:', id, hours)}
                    />
                  </Panel>

                  {/* Milestones Widget */}
                  <Panel title="UPCOMING MILESTONES" icon={Target}>
                    <MilestonesWidget
                      milestones={milestones || []}
                      maxVisible={8}
                      onMilestoneClick={(m) => console.log('Milestone:', m)}
                    />
                  </Panel>
                </div>
              </div>
            </TabsContent>

            {/* Projects Tab */}
            <TabsContent value="projects" className="mt-0">
              <ProjectsTable
                onProjectClick={(p) => window.location.href = `/dashboard/projects/${p.id}`}
                onProjectEdit={(p) => window.location.href = `/dashboard/projects/${p.id}/edit`}
              />
            </TabsContent>

            {/* Timeline Tab */}
            <TabsContent value="timeline" className="mt-0">
              <Panel title="PORTFOLIO TIMELINE" icon={Clock}>
                <div className="text-center py-12">
                  <Clock className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
                  <h3 className="font-mono text-sm text-white mb-2">Portfolio Gantt View</h3>
                  <p className="font-mono text-xs text-zinc-500 mb-4">
                    Select a project to view its detailed timeline
                  </p>
                  <Link href="/dashboard/projects">
                    <Button variant="outline" className="font-mono text-xs">
                      <Building2 className="h-4 w-4 mr-2" />
                      View Projects
                    </Button>
                  </Link>
                </div>
              </Panel>
            </TabsContent>

            {/* Alerts Tab */}
            <TabsContent value="alerts" className="mt-0">
              <Panel title="ALL ALERTS" icon={AlertTriangle}>
                <AlertsPanel
                  alerts={alerts || []}
                  maxVisible={50}
                  showViewAll={false}
                  onDismiss={(id) => console.log('Dismiss:', id)}
                  onSnooze={(id, hours) => console.log('Snooze:', id, hours)}
                />
              </Panel>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}
