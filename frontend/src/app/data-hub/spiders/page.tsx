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
import { dataSourcesApi, etlJobsApi, queuesApi } from '@/lib/api'
import { formatRelativeTime, formatNumber, cn } from '@/lib/utils'
import { useState } from 'react'

// Mock spider data - in real implementation, this would come from the API
const mockSpiders = [
  {
    id: 'jiji_spider',
    name: 'Jiji Ghana Spider',
    domain: 'jiji.com.gh',
    status: 'idle',
    lastRun: '2024-01-15T10:30:00Z',
    itemsScraped: 12450,
    errorRate: 0.02,
    avgDuration: 45,
  },
  {
    id: 'tonaton_spider',
    name: 'Tonaton Spider',
    domain: 'tonaton.com',
    status: 'running',
    lastRun: '2024-01-16T08:00:00Z',
    itemsScraped: 8230,
    errorRate: 0.01,
    avgDuration: 38,
    progress: 67,
  },
  {
    id: 'meqasa_spider',
    name: 'MeQasa Spider',
    domain: 'meqasa.com',
    status: 'idle',
    lastRun: '2024-01-15T22:00:00Z',
    itemsScraped: 5670,
    errorRate: 0.03,
    avgDuration: 52,
  },
  {
    id: 'jumia_spider',
    name: 'Jumia House Spider',
    domain: 'jumia.com.gh',
    status: 'error',
    lastRun: '2024-01-14T14:00:00Z',
    itemsScraped: 3200,
    errorRate: 0.15,
    avgDuration: 60,
    errorMessage: 'Rate limited - waiting for cooldown',
  },
  {
    id: 'ghanapropertycentre_spider',
    name: 'Ghana Property Centre',
    domain: 'ghanapropertycentre.com',
    status: 'idle',
    lastRun: '2024-01-15T18:00:00Z',
    itemsScraped: 4120,
    errorRate: 0.02,
    avgDuration: 35,
  },
]

type SpiderStatus = 'idle' | 'running' | 'error' | 'paused'

function SpiderStatusBadge({ status }: { status: SpiderStatus }) {
  const variants = {
    idle: { variant: 'secondary' as const, icon: Clock, label: 'Idle' },
    running: { variant: 'info' as const, icon: Activity, label: 'Running' },
    error: { variant: 'destructive' as const, icon: AlertCircle, label: 'Error' },
    paused: { variant: 'warning' as const, icon: Pause, label: 'Paused' },
  }

  const config = variants[status]
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
  const [runningSpiders, setRunningSpiders] = useState<string[]>([])

  const { data: queueStats, isLoading: queuesLoading } = useQuery({
    queryKey: ['queue-stats'],
    queryFn: () => queuesApi.getStats(),
  })

  const triggerMutation = useMutation({
    mutationFn: ({ queue, data }: { queue: string; data?: Record<string, unknown> }) =>
      queuesApi.trigger(queue, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue-stats'] })
    },
  })

  const handleRunSpider = (spiderId: string) => {
    setRunningSpiders((prev) => [...prev, spiderId])
    triggerMutation.mutate({
      queue: 'spider_crawl',
      data: { spider_name: spiderId },
    })
    // Simulate completion after 10 seconds
    setTimeout(() => {
      setRunningSpiders((prev) => prev.filter((id) => id !== spiderId))
    }, 10000)
  }

  const handleStopSpider = (spiderId: string) => {
    setRunningSpiders((prev) => prev.filter((id) => id !== spiderId))
  }

  const spiders = mockSpiders.map((spider) => ({
    ...spider,
    status: runningSpiders.includes(spider.id) ? 'running' : spider.status,
  }))

  const runningCount = spiders.filter((s) => s.status === 'running').length
  const errorCount = spiders.filter((s) => s.status === 'error').length
  const totalItems = spiders.reduce((acc, s) => acc + s.itemsScraped, 0)

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
              value="2.1%"
              subtitle="Last 24 hours"
              icon={AlertCircle}
              color={errorCount > 0 ? 'red' : 'green'}
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
                          {formatRelativeTime(spider.lastRun)}
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
                              disabled={spider.status === 'error'}
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
                    .filter((s) => s.status === 'error' || s.errorRate > 0.1)
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
                  {spiders.filter((s) => s.status === 'error' || s.errorRate > 0.1).length === 0 && (
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
