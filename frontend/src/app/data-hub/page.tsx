'use client'

import { Header, MetricCard } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import {
  Database,
  GitBranch,
  Users,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  ArrowRight,
  Activity,
  Layers,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  dataSourcesApi,
  etlJobsApi,
  contributionsApi,
  economicApi,
  queuesApi,
} from '@/lib/api'
import { formatNumber, formatRelativeTime, getStatusColor, getTierLabel } from '@/lib/utils'
import Link from 'next/link'

export default function DataHubOverview() {
  // Fetch stats from various endpoints
  const { data: sourceStats, isLoading: sourcesLoading } = useQuery({
    queryKey: ['data-sources-stats'],
    queryFn: () => dataSourcesApi.getStatsByTier(),
  })

  const { data: jobStats, isLoading: jobsLoading } = useQuery({
    queryKey: ['etl-jobs-stats'],
    queryFn: () => etlJobsApi.getStats(),
  })

  const { data: pendingContributions, isLoading: contributionsLoading } = useQuery({
    queryKey: ['pending-contributions'],
    queryFn: () => contributionsApi.getPending(5),
  })

  const { data: economicSnapshot, isLoading: economicLoading } = useQuery({
    queryKey: ['economic-snapshot'],
    queryFn: () => economicApi.getSnapshot(),
  })

  const { data: queueStats, isLoading: queuesLoading } = useQuery({
    queryKey: ['queue-stats'],
    queryFn: () => queuesApi.getStats(),
  })

  const { data: recentJobs, isLoading: recentJobsLoading } = useQuery({
    queryKey: ['recent-jobs'],
    queryFn: () => etlJobsApi.getAll({ limit: 5 }),
  })

  // Calculate totals from source stats
  const totalSources = sourceStats?.data?.reduce((acc, s) => acc + s.total, 0) || 0
  const activeSources = sourceStats?.data?.reduce((acc, s) => acc + s.active, 0) || 0

  return (
    <div className="flex flex-col h-full">
      <Header title="Data Hub Overview" description="Monitor your data pipeline health" />

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Top Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Data Sources"
              value={formatNumber(totalSources)}
              subtitle={`${activeSources} active`}
              icon={Database}
              color="blue"
              isLoading={sourcesLoading}
            />
            <MetricCard
              title="Running Jobs"
              value={formatNumber(jobStats?.data?.running || 0)}
              subtitle={`${jobStats?.data?.completed_today || 0} completed today`}
              icon={GitBranch}
              color="green"
              isLoading={jobsLoading}
            />
            <MetricCard
              title="Pending Reviews"
              value={formatNumber(pendingContributions?.count || 0)}
              subtitle="User contributions"
              icon={Users}
              color="yellow"
              isLoading={contributionsLoading}
            />
            <MetricCard
              title="Queue Depth"
              value={formatNumber(queueStats?.data?.total_pending || 0)}
              subtitle={`${queueStats?.data?.processing || 0} processing`}
              icon={Activity}
              color="purple"
              isLoading={queuesLoading}
            />
          </div>

          {/* Source Distribution & Economic Snapshot */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Data Source Distribution */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base font-medium">Data Source Distribution</CardTitle>
                <Link href="/data-hub/sources">
                  <Button variant="ghost" size="sm">
                    View All <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {sourcesLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                          <div className="h-4 w-8 bg-muted rounded animate-pulse" />
                        </div>
                        <Progress value={0} className="h-2" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sourceStats?.data?.map((tier) => (
                      <div key={tier.tier} className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {getTierLabel(tier.tier)}
                          </span>
                          <span className="font-medium">
                            {tier.active}/{tier.total}
                          </span>
                        </div>
                        <Progress
                          value={tier.total > 0 ? (tier.active / tier.total) * 100 : 0}
                          className="h-2"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Economic Snapshot */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base font-medium">Economic Indicators</CardTitle>
                <Link href="/data-hub/economic">
                  <Button variant="ghost" size="sm">
                    View Details <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {economicLoading ? (
                  <div className="grid grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="p-4 rounded-lg bg-muted/50">
                        <div className="h-4 w-20 bg-muted rounded animate-pulse mb-2" />
                        <div className="h-6 w-16 bg-muted rounded animate-pulse" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground">USD/GHS Rate</p>
                      <p className="text-xl font-bold">
                        {economicSnapshot?.data?.exchange_rate_usd?.toFixed(2) || '-'}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground">Inflation Rate</p>
                      <p className="text-xl font-bold">
                        {economicSnapshot?.data?.inflation_rate?.toFixed(1) || '-'}%
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground">BoG Policy Rate</p>
                      <p className="text-xl font-bold">
                        {economicSnapshot?.data?.interest_rate_policy?.toFixed(1) || '-'}%
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground">GDP Growth</p>
                      <p className="text-xl font-bold">
                        {economicSnapshot?.data?.gdp_growth?.toFixed(1) || '-'}%
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Jobs & Pending Contributions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent ETL Jobs */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base font-medium">Recent ETL Jobs</CardTitle>
                <Link href="/data-hub/jobs">
                  <Button variant="ghost" size="sm">
                    View All <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentJobsLoading ? (
                    [1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 bg-muted rounded animate-pulse" />
                          <div>
                            <div className="h-4 w-32 bg-muted rounded animate-pulse mb-1" />
                            <div className="h-3 w-24 bg-muted rounded animate-pulse" />
                          </div>
                        </div>
                        <div className="h-5 w-16 bg-muted rounded-full animate-pulse" />
                      </div>
                    ))
                  ) : recentJobs?.data?.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No recent jobs</p>
                    </div>
                  ) : (
                    recentJobs?.data?.map((job) => (
                      <div
                        key={job.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${getStatusColor(job.status)}`}>
                            {job.status === 'completed' ? (
                              <CheckCircle className="h-4 w-4" />
                            ) : job.status === 'running' ? (
                              <Clock className="h-4 w-4" />
                            ) : job.status === 'failed' ? (
                              <AlertCircle className="h-4 w-4" />
                            ) : (
                              <GitBranch className="h-4 w-4" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{job.job_type}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatRelativeTime(job.started_at || job.created_at)}
                            </p>
                          </div>
                        </div>
                        <Badge variant={
                          job.status === 'completed' ? 'success' :
                            job.status === 'running' ? 'info' :
                              job.status === 'failed' ? 'destructive' : 'secondary'
                        }>
                          {job.status}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Pending Contributions */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base font-medium">Pending Contributions</CardTitle>
                <Link href="/data-hub/contributions">
                  <Button variant="ghost" size="sm">
                    Review All <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {contributionsLoading ? (
                    [1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 bg-muted rounded-full animate-pulse" />
                          <div>
                            <div className="h-4 w-32 bg-muted rounded animate-pulse mb-1" />
                            <div className="h-3 w-24 bg-muted rounded animate-pulse" />
                          </div>
                        </div>
                        <div className="h-5 w-16 bg-muted rounded-full animate-pulse" />
                      </div>
                    ))
                  ) : (pendingContributions?.data?.length || 0) === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No pending contributions</p>
                    </div>
                  ) : (
                    pendingContributions?.data?.map((contribution) => (
                      <div
                        key={contribution.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                            <Users className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{contribution.contribution_type}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatRelativeTime(contribution.submitted_at)}
                            </p>
                          </div>
                        </div>
                        <Badge variant="warning">
                          {contribution.validation_status}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Job Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Job Statistics (24h)</CardTitle>
            </CardHeader>
            <CardContent>
              {jobsLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="text-center p-4 rounded-lg bg-muted/30">
                      <div className="h-8 w-12 bg-muted rounded animate-pulse mx-auto mb-2" />
                      <div className="h-4 w-16 bg-muted rounded animate-pulse mx-auto" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  <div className="text-center p-4 rounded-lg bg-green-500/10">
                    <p className="text-2xl font-bold text-green-400">
                      {jobStats?.data?.completed || 0}
                    </p>
                    <p className="text-sm text-muted-foreground">Completed</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-blue-500/10">
                    <p className="text-2xl font-bold text-blue-400">
                      {jobStats?.data?.running || 0}
                    </p>
                    <p className="text-sm text-muted-foreground">Running</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-yellow-500/10">
                    <p className="text-2xl font-bold text-yellow-400">
                      {jobStats?.data?.pending || 0}
                    </p>
                    <p className="text-sm text-muted-foreground">Pending</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-red-500/10">
                    <p className="text-2xl font-bold text-red-400">
                      {jobStats?.data?.failed || 0}
                    </p>
                    <p className="text-sm text-muted-foreground">Failed</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-purple-500/10">
                    <p className="text-2xl font-bold text-purple-400">
                      {jobStats?.data?.cancelled || 0}
                    </p>
                    <p className="text-sm text-muted-foreground">Cancelled</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-muted/50">
                    <p className="text-2xl font-bold">
                      {((jobStats?.data?.completed || 0) / Math.max((jobStats?.data?.completed || 0) + (jobStats?.data?.failed || 0), 1) * 100).toFixed(0)}%
                    </p>
                    <p className="text-sm text-muted-foreground">Success Rate</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  )
}
