'use client'

import { Header, MetricCard } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Server,
  Activity,
  Clock,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Play,
  Pause,
  Trash2,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queuesApi } from '@/lib/api'
import { formatNumber, cn } from '@/lib/utils'

// Mock queue data
const mockQueues = [
  {
    name: 'data_ingestion',
    displayName: 'Data Ingestion',
    pending: 45,
    processing: 3,
    completed: 1250,
    failed: 12,
    avgProcessTime: 2.4,
    status: 'active',
  },
  {
    name: 'spider_crawl',
    displayName: 'Spider Crawl',
    pending: 8,
    processing: 2,
    completed: 890,
    failed: 5,
    avgProcessTime: 45.2,
    status: 'active',
  },
  {
    name: 'etl_transform',
    displayName: 'ETL Transform',
    pending: 120,
    processing: 5,
    completed: 3450,
    failed: 23,
    avgProcessTime: 8.7,
    status: 'active',
  },
  {
    name: 'geocoding',
    displayName: 'Geocoding',
    pending: 350,
    processing: 10,
    completed: 8900,
    failed: 156,
    avgProcessTime: 0.8,
    status: 'active',
  },
  {
    name: 'notifications',
    displayName: 'Notifications',
    pending: 12,
    processing: 1,
    completed: 2340,
    failed: 8,
    avgProcessTime: 0.3,
    status: 'paused',
  },
  {
    name: 'validation',
    displayName: 'Data Validation',
    pending: 85,
    processing: 4,
    completed: 5670,
    failed: 45,
    avgProcessTime: 1.2,
    status: 'active',
  },
]

export default function QueuesPage() {
  const queryClient = useQueryClient()

  const { data: queueStats, isLoading } = useQuery({
    queryKey: ['queue-stats'],
    queryFn: () => queuesApi.getStats(),
    refetchInterval: 5000,
  })

  const triggerMutation = useMutation({
    mutationFn: ({ queue, data }: { queue: string; data?: Record<string, unknown> }) =>
      queuesApi.trigger(queue, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue-stats'] })
    },
  })

  const totalPending = mockQueues.reduce((a, q) => a + q.pending, 0)
  const totalProcessing = mockQueues.reduce((a, q) => a + q.processing, 0)
  const totalFailed = mockQueues.reduce((a, q) => a + q.failed, 0)

  return (
    <div className="flex flex-col h-full">
      <Header title="Queue Status" description="Monitor background job queues" />

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Summary Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard
              title="Total Pending"
              value={formatNumber(queueStats?.data?.total_pending || totalPending)}
              subtitle="Across all queues"
              icon={Clock}
              color="yellow"
              isLoading={isLoading}
            />
            <MetricCard
              title="Processing"
              value={formatNumber(queueStats?.data?.processing || totalProcessing)}
              subtitle="Currently active"
              icon={Activity}
              color="blue"
              isLoading={isLoading}
            />
            <MetricCard
              title="Completed Today"
              value={formatNumber(queueStats?.data?.completed_today || 12540)}
              icon={CheckCircle}
              color="green"
              isLoading={isLoading}
            />
            <MetricCard
              title="Failed Today"
              value={formatNumber(queueStats?.data?.failed_today || totalFailed)}
              subtitle={`${((totalFailed / (totalFailed + 12540)) * 100).toFixed(1)}% error rate`}
              icon={AlertCircle}
              color="red"
              isLoading={isLoading}
            />
          </div>

          {/* Queue List */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {mockQueues.map((queue) => (
              <Card key={queue.name}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="flex items-center gap-2">
                    <Server className={cn(
                      'h-5 w-5',
                      queue.status === 'active' ? 'text-green-400' : 'text-yellow-400'
                    )} />
                    <CardTitle className="text-base font-medium">
                      {queue.displayName}
                    </CardTitle>
                  </div>
                  <Badge variant={queue.status === 'active' ? 'success' : 'warning'}>
                    {queue.status}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Queue Stats */}
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-yellow-400">
                        {formatNumber(queue.pending)}
                      </p>
                      <p className="text-xs text-muted-foreground">Pending</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-blue-400">
                        {queue.processing}
                      </p>
                      <p className="text-xs text-muted-foreground">Processing</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-green-400">
                        {formatNumber(queue.completed)}
                      </p>
                      <p className="text-xs text-muted-foreground">Completed</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-red-400">
                        {queue.failed}
                      </p>
                      <p className="text-xs text-muted-foreground">Failed</p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Queue Progress</span>
                      <span className="font-mono">
                        {((queue.completed / (queue.completed + queue.pending)) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <Progress
                      value={(queue.completed / (queue.completed + queue.pending)) * 100}
                      className="h-2"
                    />
                  </div>

                  {/* Avg Process Time */}
                  <div className="flex items-center justify-between text-sm pt-2 border-t">
                    <span className="text-muted-foreground">Avg. Process Time</span>
                    <span className="font-mono">{queue.avgProcessTime}s</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => triggerMutation.mutate({ queue: queue.name })}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Retry Failed
                    </Button>
                    {queue.status === 'active' ? (
                      <Button variant="ghost" size="sm">
                        <Pause className="h-4 w-4 mr-1" />
                        Pause
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm">
                        <Play className="h-4 w-4 mr-1" />
                        Resume
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* System Health */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">System Health</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-muted/50 text-center">
                  <p className="text-2xl font-bold text-green-400">99.9%</p>
                  <p className="text-sm text-muted-foreground">Uptime</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 text-center">
                  <p className="text-2xl font-bold">2.1s</p>
                  <p className="text-sm text-muted-foreground">Avg Response</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 text-center">
                  <p className="text-2xl font-bold">48MB</p>
                  <p className="text-sm text-muted-foreground">Memory Usage</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 text-center">
                  <p className="text-2xl font-bold">12%</p>
                  <p className="text-sm text-muted-foreground">CPU Usage</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  )
}
