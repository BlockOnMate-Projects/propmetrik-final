'use client'

import { Header, MetricCard } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  GitBranch,
  Play,
  Square,
  Eye,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  Terminal,
  XCircle,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { etlJobsApi, EtlJobFilters } from '@/lib/api'
import { EtlJob, EtlJobStatus, EtlJobType } from '@/types/data-hub'
import { formatRelativeTime, formatDuration, cn } from '@/lib/utils'
import { useState } from 'react'

const statusOptions: { value: EtlJobStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Status' },
  { value: 'pending', label: 'Pending' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const typeOptions: { value: EtlJobType | 'all'; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: 'extract', label: 'Extract' },
  { value: 'transform', label: 'Transform' },
  { value: 'load', label: 'Load' },
  { value: 'full_etl', label: 'Full ETL' },
  { value: 'incremental', label: 'Incremental' },
  { value: 'validation', label: 'Validation' },
  { value: 'deduplication', label: 'Deduplication' },
  { value: 'enrichment', label: 'Enrichment' },
]

function JobStatusIcon({ status }: { status: EtlJobStatus }) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-400" />
    case 'running':
      return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
    case 'pending':
      return <Clock className="h-4 w-4 text-yellow-400" />
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-400" />
    case 'cancelled':
      return <Square className="h-4 w-4 text-gray-400" />
    default:
      return <GitBranch className="h-4 w-4" />
  }
}

function JobLogsDialog({ job }: { job: EtlJob }) {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['job-logs', job.id],
    queryFn: () => etlJobsApi.getLogs(job.id),
    enabled: false, // Only fetch when dialog opens
  })

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Terminal className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Job Logs - {job.job_type}</DialogTitle>
          <DialogDescription>
            Job ID: {job.id}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[400px] rounded-lg bg-black p-4 font-mono text-sm">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          ) : logs?.data?.length === 0 ? (
            <p className="text-muted-foreground">No logs available</p>
          ) : (
            logs?.data?.map((log, i) => (
              <div key={i} className="flex gap-2 text-xs">
                <span className="text-muted-foreground whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={cn(
                  log.level === 'error' && 'text-red-400',
                  log.level === 'warning' && 'text-yellow-400',
                  log.level === 'info' && 'text-blue-400',
                  log.level === 'debug' && 'text-gray-400'
                )}>
                  [{log.level.toUpperCase()}]
                </span>
                <span className="text-foreground">{log.message}</span>
              </div>
            ))
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

export default function EtlJobsPage() {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<EtlJobFilters>({
    page: 1,
    limit: 20,
  })
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [selectedType, setSelectedType] = useState<string>('all')

  const queryFilters: EtlJobFilters = {
    ...filters,
    status: selectedStatus !== 'all' ? (selectedStatus as EtlJobStatus) : undefined,
    job_type: selectedType !== 'all' ? (selectedType as EtlJobType) : undefined,
  }

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['etl-jobs', queryFilters],
    queryFn: () => etlJobsApi.getAll(queryFilters),
    refetchInterval: 5000, // Refresh every 5 seconds for running jobs
  })

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['etl-jobs-stats'],
    queryFn: () => etlJobsApi.getStats(),
    refetchInterval: 10000,
  })

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      etlJobsApi.cancel(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['etl-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['etl-jobs-stats'] })
    },
  })

  const runningJobs = jobs?.data?.filter((j) => j.status === 'running') || []

  return (
    <div className="flex flex-col h-full">
      <Header title="ETL Jobs" description="Monitor and manage data processing pipelines" />

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <MetricCard
              title="Running"
              value={stats?.data?.running || 0}
              icon={Loader2}
              color="blue"
              isLoading={statsLoading}
            />
            <MetricCard
              title="Pending"
              value={stats?.data?.pending || 0}
              icon={Clock}
              color="yellow"
              isLoading={statsLoading}
            />
            <MetricCard
              title="Completed"
              value={stats?.data?.completed || 0}
              subtitle="Last 24h"
              icon={CheckCircle}
              color="green"
              isLoading={statsLoading}
            />
            <MetricCard
              title="Failed"
              value={stats?.data?.failed || 0}
              subtitle="Last 24h"
              icon={AlertCircle}
              color="red"
              isLoading={statsLoading}
            />
            <MetricCard
              title="Success Rate"
              value={`${((stats?.data?.completed || 0) / Math.max((stats?.data?.completed || 0) + (stats?.data?.failed || 0), 1) * 100).toFixed(0)}%`}
              icon={GitBranch}
              color="purple"
              isLoading={statsLoading}
            />
          </div>

          {/* Running Jobs Progress */}
          {runningJobs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                  Running Jobs ({runningJobs.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {runningJobs.map((job) => (
                  <div key={job.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="info">{job.job_type}</Badge>
                        <span className="text-sm text-muted-foreground">
                          Started {formatRelativeTime(job.started_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {job.progress || 0}%
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => cancelMutation.mutate({ id: job.id })}
                        >
                          <Square className="h-4 w-4 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                    <Progress value={job.progress || 0} className="h-2" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        {job.records_processed?.toLocaleString() || 0} / {job.total_records?.toLocaleString() || '?'} records
                      </span>
                      <span>
                        {job.current_step || 'Processing...'}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex gap-4 items-center">
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Job Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Jobs Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">
                Job History
                <span className="ml-2 text-muted-foreground font-normal">
                  ({jobs?.total || 0} jobs)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
                      <Skeleton className="h-4 w-4" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                      <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : jobs?.data?.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No jobs found</p>
                  <p className="text-sm">Try adjusting your filters</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Job Type</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Records</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs?.data?.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <JobStatusIcon status={job.status} />
                            <Badge variant={
                              job.status === 'completed' ? 'success' :
                              job.status === 'running' ? 'info' :
                              job.status === 'failed' ? 'destructive' :
                              job.status === 'pending' ? 'warning' : 'secondary'
                            }>
                              {job.status}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{job.job_type}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-muted-foreground text-sm">
                            {job.source_name || job.data_source_id?.slice(0, 8) || '-'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {formatRelativeTime(job.started_at || job.created_at)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-mono">
                            {job.completed_at
                              ? formatDuration(
                                  new Date(job.started_at!).getTime(),
                                  new Date(job.completed_at).getTime()
                                )
                              : job.status === 'running'
                              ? formatDuration(
                                  new Date(job.started_at!).getTime(),
                                  Date.now()
                                )
                              : '-'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <span className="font-mono">
                              {job.records_processed?.toLocaleString() || 0}
                            </span>
                            {job.errors_count > 0 && (
                              <span className="text-red-400 ml-2">
                                ({job.errors_count} errors)
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            <JobLogsDialog job={job} />
                            <Button variant="ghost" size="icon">
                              <Eye className="h-4 w-4" />
                            </Button>
                            {job.status === 'running' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => cancelMutation.mutate({ id: job.id })}
                              >
                                <Square className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* Pagination */}
              {jobs && jobs.total > filters.limit! && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {((filters.page! - 1) * filters.limit!) + 1} to{' '}
                    {Math.min(filters.page! * filters.limit!, jobs.total)} of {jobs.total}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={filters.page === 1}
                      onClick={() => setFilters((f) => ({ ...f, page: f.page! - 1 }))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={filters.page! * filters.limit! >= jobs.total}
                      onClick={() => setFilters((f) => ({ ...f, page: f.page! + 1 }))}
                    >
                      Next
                    </Button>
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
