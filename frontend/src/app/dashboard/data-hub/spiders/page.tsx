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
import { spidersApi, Spider } from '@/lib/api'
import { formatRelativeTime, formatNumber, cn } from '@/lib/utils'
import { toast } from 'sonner'

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

  // Fetch spiders from live API
  const { data: spidersResponse, isLoading: spidersLoading, error: spidersError } = useQuery({
    queryKey: ['spiders'],
    queryFn: () => spidersApi.getAll(),
    refetchInterval: 10000, // Refresh every 10 seconds to update running status
  })

  const { data: statsResponse, isLoading: statsLoading } = useQuery({
    queryKey: ['spider-stats'],
    queryFn: () => spidersApi.getStats(),
    refetchInterval: 10000,
  })

  const runSpiderMutation = useMutation({
    mutationFn: (id: string) => spidersApi.run(id),
    onSuccess: () => {
      toast.success('Spider started successfully')
      queryClient.invalidateQueries({ queryKey: ['spiders'] })
      queryClient.invalidateQueries({ queryKey: ['spider-stats'] })
    },
    onError: (error) => {
      toast.error(`Failed to start spider: ${error.message}`)
    },
  })

  const stopSpiderMutation = useMutation({
    mutationFn: (id: string) => spidersApi.stop(id),
    onSuccess: () => {
      toast.success('Spider stopped')
      queryClient.invalidateQueries({ queryKey: ['spiders'] })
      queryClient.invalidateQueries({ queryKey: ['spider-stats'] })
    },
    onError: (error) => {
      toast.error(`Failed to stop spider: ${error.message}`)
    },
  })

  const resumeSpiderMutation = useMutation({
    mutationFn: (id: string) => spidersApi.resume(id),
    onSuccess: () => {
      toast.success('Spider resumed')
      queryClient.invalidateQueries({ queryKey: ['spiders'] })
    },
    onError: (error) => {
      toast.error(`Failed to resume spider: ${error.message}`)
    },
  })

  const handleRunSpider = (id: string) => {
    runSpiderMutation.mutate(id)
  }

  const handleStopSpider = (id: string) => {
    stopSpiderMutation.mutate(id)
  }

  const handleResumeSpider = (id: string) => {
    resumeSpiderMutation.mutate(id)
  }

  const spiders = spidersResponse?.data || []
  const stats = statsResponse?.data

  const runningSpiders = spiders.filter((s) => s.status === 'running')
  const errorSpiders = spiders.filter((s) => s.status === 'error' || s.errorRate > 0.1)

  return (
    <div className="flex flex-col h-full">
      <Header title="Web Spiders" description="Manage web scraping spiders for property data" />

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard
              title="Active Spiders"
              value={stats?.totalSpiders || spiders.length}
              subtitle={`${stats?.runningCount || runningSpiders.length} running`}
              icon={Bug}
              color="blue"
              isLoading={statsLoading}
            />
            <MetricCard
              title="Items Scraped"
              value={formatNumber(stats?.totalItemsScraped || 0)}
              subtitle="All time"
              icon={FileText}
              color="green"
              isLoading={statsLoading}
            />
            <MetricCard
              title="Error Rate"
              value={`${((stats?.avgErrorRate || 0) * 100).toFixed(1)}%`}
              subtitle="Average"
              icon={AlertCircle}
              color={(stats?.errorCount || 0) > 0 ? 'red' : 'green'}
              isLoading={statsLoading}
            />
            <MetricCard
              title="Error Count"
              value={stats?.errorCount || errorSpiders.length}
              subtitle="Spiders with errors"
              icon={Activity}
              color="purple"
              isLoading={statsLoading}
            />
          </div>

          {/* Loading State */}
          {spidersLoading && (
            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                      <Skeleton className="h-8 w-20" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error State */}
          {spidersError && (
            <Card>
              <CardContent className="p-6 text-center">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-400" />
                <p className="text-lg font-medium">Failed to load spiders</p>
                <p className="text-sm text-muted-foreground">
                  {spidersError instanceof Error ? spidersError.message : 'Unknown error'}
                </p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['spiders'] })}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Empty State */}
          {!spidersLoading && !spidersError && spiders.length === 0 && (
            <Card>
              <CardContent className="p-6 text-center">
                <Bug className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium">No spiders configured</p>
                <p className="text-sm text-muted-foreground">
                  Add web scraping data sources to see them here
                </p>
              </CardContent>
            </Card>
          )}

          {/* Running Spiders Progress */}
          {runningSpiders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-400 animate-pulse" />
                  Running Spiders ({runningSpiders.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {runningSpiders.map((spider) => (
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
                            {spider.progress || 0}%
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleStopSpider(spider.id)}
                            disabled={stopSpiderMutation.isPending}
                          >
                            <Square className="h-4 w-4 mr-1" />
                            Stop
                          </Button>
                        </div>
                      </div>
                      <Progress value={spider.progress || 0} className="h-2" />
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}

          {/* Spider List */}
          {!spidersLoading && !spidersError && spiders.length > 0 && (
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
                  disabled={runSpiderMutation.isPending}
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
                                disabled={stopSpiderMutation.isPending}
                              >
                                <Square className="h-4 w-4" />
                              </Button>
                            ) : spider.status === 'paused' ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleResumeSpider(spider.id)}
                                disabled={resumeSpiderMutation.isPending}
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRunSpider(spider.id)}
                                disabled={spider.status === 'error' || runSpiderMutation.isPending}
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            )}
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => queryClient.invalidateQueries({ queryKey: ['spiders'] })}
                            >
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
          )}

          {/* Spider Configuration Info */}
          {!spidersLoading && !spidersError && spiders.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">Crawl Schedule</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {spiders.map((spider) => (
                      <div 
                        key={spider.id} 
                        className="flex justify-between items-center p-3 rounded-lg bg-muted/30"
                      >
                        <span className="text-muted-foreground">{spider.name}</span>
                        <Badge variant="outline">
                          {spider.schedule || 'Manual'}
                        </Badge>
                      </div>
                    ))}
                    {spiders.length === 0 && (
                      <div className="text-center py-4 text-muted-foreground">
                        No spiders configured
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">Recent Errors</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {errorSpiders.map((spider) => (
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
                    {errorSpiders.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-400" />
                        <p className="text-sm">All spiders healthy</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
