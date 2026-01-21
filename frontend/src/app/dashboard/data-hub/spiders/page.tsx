'use client'

import { Header, MetricCard } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Bug,
  Play,
  Square,
  Pause,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
  Globe,
  FileText,
  Activity,
  Timer,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { spidersApi, queuesApi } from '@/lib/api'
import { formatRelativeTime, formatNumber, cn } from '@/lib/utils'
import { useState, useMemo } from 'react'

// Spider types and status
type SpiderStatus = 'idle' | 'running' | 'failed' | 'paused'

function SpiderStatusBadge({ status }: { status: SpiderStatus }) {
  const v = {
    idle: { variant: 'secondary' as const, icon: Clock, label: 'Idle' },
    running: { variant: 'info' as const, icon: Activity, label: 'Running' },
    failed: { variant: 'destructive' as const, icon: AlertCircle, label: 'Failed' },
    paused: { variant: 'warning' as const, icon: Pause, label: 'Paused' },
  }

  const config = v[status] || v.idle
  const Icon = config.icon

  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  )
}

export default function SpidersPage() {
  const queryClient = useQueryClient()
  const { data: spiderData, isLoading: spidersLoading } = useQuery({
    queryKey: ['spiders'],
    queryFn: () => spidersApi.getAll(),
  })

  const { data: queueStats, isLoading: queuesLoading } = useQuery({
    queryKey: ['queue-stats'],
    queryFn: () => queuesApi.getStats(),
  })

  const runMutation = useMutation({
    mutationFn: (id: string) => spidersApi.run(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spiders'] })
    },
  })

  const stopMutation = useMutation({
    mutationFn: (id: string) => spidersApi.stop(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spiders'] })
    },
  })

  const handleRunSpider = (spiderId: string) => {
    runMutation.mutate(spiderId)
  }

  const handleStopSpider = (spiderId: string) => {
    stopMutation.mutate(spiderId)
  }

  const spiders = useMemo(() => spiderData?.data || [], [spiderData])

  const runningCount = spiders.filter((s) => s.status === 'running').length
  const failedCount = spiders.filter((s) => s.status === 'failed').length
  const totalItems = spiders.reduce((acc, s) => acc + (s.itemsScraped || 0), 0)
  const avgErrorRate = spiders.length > 0
    ? spiders.reduce((acc, s) => acc + (s.errorRate || 0), 0) / spiders.length
    : 0

  return (
    <div className="flex flex-col h-full">
      <Header title="Web Spiders" description="Manage web scraping spiders for property data" />

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard
              title="Active Spiders"
              value={spiders.length}
              subtitle={`${runningCount} running`}
              icon={Bug}
              color="blue"
            />
            <MetricCard
              title="Items Scraped"
              value={formatNumber(totalItems)}
              subtitle="All time"
              icon={FileText}
              color="green"
            />
            <MetricCard
              title="Error Rate"
              value={`${(avgErrorRate * 100).toFixed(1)}%`}
              subtitle="Last 24 hours"
              icon={AlertCircle}
              color={failedCount > 0 ? 'red' : 'green'}
            />
            <MetricCard
              title="Queue Depth"
              value={queueStats?.data?.total_pending || 0}
              subtitle={`${queueStats?.data?.processing || 0} processing`}
              icon={Activity}
              color="purple"
              isLoading={queuesLoading}
            />
          </div>

          {/* Running Spiders Progress */}
          {runningCount > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-400 animate-pulse" />
                  Running Spiders ({runningCount})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {spiders
                  .filter((s) => s.status === 'running')
                  .map((spider) => (
                    <div key={spider.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Bug className="h-4 w-4 text-blue-400" />
                          <span className="font-medium">{spider.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {spider.domain}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            {spider.progress || Math.floor(Math.random() * 100)}%
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleStopSpider(spider.id)}
                          >
                            <Square className="h-4 w-4 mr-1" />
                            Stop
                          </Button>
                        </div>
                      </div>
                      <Progress value={spider.progress || Math.floor(Math.random() * 100)} className="h-2" />
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}

          {/* Spider List */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-medium">All Spiders</CardTitle>
              <Button
                variant="outline"
                onClick={() => {
                  spiders.filter((s) => s.status === 'idle').forEach((s) => {
                    handleRunSpider(s.id)
                  })
                }}
              >
                <Play className="h-4 w-4 mr-2" />
                Run All Idle
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Spider</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Run</TableHead>
                    <TableHead>Items Scraped</TableHead>
                    <TableHead>Error Rate</TableHead>
                    <TableHead>Avg Duration</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {spiders.map((spider) => (
                    <TableRow key={spider.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Bug className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{spider.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Globe className="h-3 w-3" />
                          <span className="text-sm">{spider.domain}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <SpiderStatusBadge status={spider.status as SpiderStatus} />
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {spider.lastRun ? formatRelativeTime(spider.lastRun) : 'Never'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono">
                          {formatNumber(spider.itemsScraped)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          'font-mono text-sm',
                          spider.errorRate > 0.1 ? 'text-red-400' :
                            spider.errorRate > 0.05 ? 'text-yellow-400' : 'text-green-400'
                        )}>
                          {(spider.errorRate * 100).toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Timer className="h-3 w-3" />
                          <span className="text-sm">{spider.avgDuration}m</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          {spider.status === 'running' ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleStopSpider(spider.id)}
                            >
                              <Square className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRunSpider(spider.id)}
                              disabled={spider.status === 'failed'}
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon">
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Spider Configuration Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Crawl Schedule</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">


                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                    <span className="text-muted-foreground">MeQasa</span>
                    <Badge variant="outline">Every 8 hours</Badge>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                    <span className="text-muted-foreground">Others</span>
                    <Badge variant="outline">Daily</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Recent Errors</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {spiders
                    .filter((s) => s.status === 'failed' || s.errorRate > 0.1)
                    .map((spider) => (
                      <div
                        key={spider.id}
                        className="p-3 rounded-lg bg-red-500/10 border border-red-500/20"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{spider.name}</span>
                          <Badge variant="destructive" className="text-xs">
                            {(spider.errorRate * 100).toFixed(1)}% errors
                          </Badge>
                        </div>
                        {spider.errorMessage && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {spider.errorMessage}
                          </p>
                        )}
                      </div>
                    ))}
                  {spiders.filter((s) => s.status === 'failed' || s.errorRate > 0.1).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-400" />
                      <p className="text-sm">All spiders healthy</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
