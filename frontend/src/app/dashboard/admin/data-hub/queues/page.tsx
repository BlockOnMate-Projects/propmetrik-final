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
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queuesApi } from '@/lib/api'
import { formatNumber, cn } from '@/lib/utils'
import { useMemo } from 'react'

interface QueueEntry {
  name: string
  displayName: string
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
}

function formatQueueName(name: string): string {
  return name
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

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

  const queues: QueueEntry[] = useMemo(() => {
    if (!queueStats?.data) return []
    return Object.entries(queueStats.data)
      .filter(([key]) => !['total_pending', 'processing'].includes(key))
      .map(([name, stats]: [string, any]) => ({
        name,
        displayName: formatQueueName(name),
        waiting: stats?.waiting ?? 0,
        active: stats?.active ?? 0,
        completed: stats?.completed ?? 0,
        failed: stats?.failed ?? 0,
        delayed: stats?.delayed ?? 0,
      }))
  }, [queueStats])

  const totalPending = queues.reduce((a, q) => a + q.waiting + q.delayed, 0)
  const totalProcessing = queues.reduce((a, q) => a + q.active, 0)
  const totalCompleted = queues.reduce((a, q) => a + q.completed, 0)
  const totalFailed = queues.reduce((a, q) => a + q.failed, 0)
  const errorRate = totalCompleted + totalFailed > 0
    ? ((totalFailed / (totalCompleted + totalFailed)) * 100).toFixed(1)
    : '0.0'

  return (
    <div className="flex flex-col h-full">
      <Header title="Queue Status" description="Monitor background job queues" />

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Summary Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard
              title="Total Pending"
              value={formatNumber(totalPending)}
              subtitle="Across all queues"
              icon={Clock}
              color="yellow"
              isLoading={isLoading}
            />
            <MetricCard
              title="Processing"
              value={formatNumber(totalProcessing)}
              subtitle="Currently active"
              icon={Activity}
              color="blue"
              isLoading={isLoading}
            />
            <MetricCard
              title="Completed"
              value={formatNumber(totalCompleted)}
              icon={CheckCircle}
              color="green"
              isLoading={isLoading}
            />
            <MetricCard
              title="Failed"
              value={formatNumber(totalFailed)}
              subtitle={`${errorRate}% error rate`}
              icon={AlertCircle}
              color="red"
              isLoading={isLoading}
            />
          </div>

          {/* Queue List */}
          {queues.length === 0 && !isLoading && (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No queue data available
              </CardContent>
            </Card>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {queues.map((queue) => {
              const total = queue.completed + queue.waiting + queue.delayed
              const progress = total > 0 ? (queue.completed / total) * 100 : 0
              const isActive = queue.active > 0 || queue.waiting > 0

              return (
                <Card key={queue.name}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div className="flex items-center gap-2">
                      <Server className={cn(
                        'h-5 w-5',
                        isActive ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
                      )} />
                      <CardTitle className="text-base font-medium">
                        {queue.displayName}
                      </CardTitle>
                    </div>
                    <Badge variant={isActive ? 'success' : 'secondary'}>
                      {isActive ? 'active' : 'idle'}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-4 gap-4 text-center">
                      <div>
                        <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                          {formatNumber(queue.waiting + queue.delayed)}
                        </p>
                        <p className="text-xs text-muted-foreground">Pending</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                          {queue.active}
                        </p>
                        <p className="text-xs text-muted-foreground">Processing</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                          {formatNumber(queue.completed)}
                        </p>
                        <p className="text-xs text-muted-foreground">Completed</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                          {queue.failed}
                        </p>
                        <p className="text-xs text-muted-foreground">Failed</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Queue Progress</span>
                        <span className="font-mono">{progress.toFixed(0)}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => triggerMutation.mutate({ queue: queue.name })}
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Retry Failed
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
