'use client'

import { TerminalPanel, DataMetricCard } from '@/components/ui/terminal'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  GitBranch,
  Square,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  XCircle,
  Terminal,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { etlJobsApi, EtlJobFilters } from '@/lib/api'
import { EtlJobStatus, EtlJobType } from '@/types/data-hub'
import { formatRelativeTime, formatDuration, cn } from '@/lib/utils'
import { useState } from 'react'

export default function EtlJobsPage() {
  const queryClient = useQueryClient()
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [selectedType, setSelectedType] = useState<string>('all')

  const queryFilters: EtlJobFilters = {
    status: selectedStatus !== 'all' ? (selectedStatus as EtlJobStatus) : undefined,
    job_type: selectedType !== 'all' ? (selectedType as EtlJobType) : undefined,
    limit: 50,
  }

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['etl-jobs', queryFilters],
    queryFn: () => etlJobsApi.getAll(queryFilters),
    refetchInterval: 5000,
  })

  const { data: stats } = useQuery({
    queryKey: ['etl-jobs-stats'],
    queryFn: () => etlJobsApi.getStats(),
    refetchInterval: 10000,
  })

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      etlJobsApi.cancel(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['etl-jobs'] })
    },
  })

  const runningJobs = jobs?.data?.filter((j) => j.status === 'running') || []

  const getStatusIcon = (status: EtlJobStatus) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-400" />
      case 'running': return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
      case 'pending': return <Clock className="w-4 h-4 text-yellow-400" />
      case 'failed': return <XCircle className="w-4 h-4 text-red-400" />
      case 'cancelled': return <Square className="w-4 h-4 text-zinc-400" />
      default: return <GitBranch className="w-4 h-4" />
    }
  }

  const getStatusColor = (status: EtlJobStatus) => {
    switch (status) {
      case 'completed': return 'text-green-400 bg-green-900/20 border-green-500/30'
      case 'running': return 'text-blue-400 bg-blue-900/20 border-blue-500/30'
      case 'pending': return 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30'
      case 'failed': return 'text-red-400 bg-red-900/20 border-red-500/30'
      case 'cancelled': return 'text-zinc-400 bg-zinc-800/20 border-zinc-700/30'
      default: return 'text-zinc-400 bg-zinc-800/20 border-zinc-700/30'
    }
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 pb-10">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-mono text-2xl text-amber-500 tracking-wider">ETL JOBS MONITOR</h1>
        <p className="font-mono text-[10px] text-zinc-500 mt-1">
          REAL-TIME JOB TRACKING • PIPELINE MONITORING • PERFORMANCE ANALYTICS
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <DataMetricCard
          title="Running"
          value={stats?.data?.running || 0}
          subtitle="Active jobs"
          icon={Loader2}
          color="blue"
          status={(stats?.data?.running ?? 0) > 0 ? 'live' : undefined}
        />

        <DataMetricCard
          title="Pending"
          value={stats?.data?.pending || 0}
          subtitle="In queue"
          icon={Clock}
          color="yellow"
        />

        <DataMetricCard
          title="Completed"
          value={stats?.data?.completed_today || 0}
          subtitle="Last 24h"
          trend={12.5}
          icon={CheckCircle}
          color="green"
        />

        <DataMetricCard
          title="Failed"
          value={stats?.data?.failed_today || 0}
          subtitle="Last 24h"
          icon={AlertCircle}
          color="red"
        />

        <DataMetricCard
          title="Success Rate"
          value={`${((stats?.data?.completed_today || 0) / Math.max((stats?.data?.completed_today || 0) + (stats?.data?.failed_today || 0), 1) * 100).toFixed(0)}%`}
          subtitle="Today"
          icon={GitBranch}
          color="purple"
        />
      </div>

      {/* Running Jobs */}
      {runningJobs.length > 0 && (
        <div className="mb-6">
          <TerminalPanel title={`Running Jobs (${runningJobs.length})`} status="live">
            <div className="space-y-4">
              {runningJobs.map((job) => (
                <div key={job.id} className="p-4 bg-zinc-800/30 border border-zinc-800">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                      <div>
                        <div className="font-mono text-sm text-white">{job.job_type.replace('_', ' ').toUpperCase()}</div>
                        <div className="font-mono text-[10px] text-zinc-500">
                          Started {formatRelativeTime(job.started_at || job.created_at)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-white">{job.progress || 0}%</span>
                      <button
                        onClick={() => cancelMutation.mutate({ id: job.id })}
                        className="px-3 py-1 bg-red-900/30 text-red-400 border border-red-500/30 font-mono text-[10px] hover:bg-red-900/50 transition-colors"
                      >
                        CANCEL
                      </button>
                    </div>
                  </div>

                  <Progress value={job.progress || 0} className="h-2 mb-2" />

                  <div className="flex justify-between font-mono text-[10px] text-zinc-500">
                    <span>{(job.records_processed || 0).toLocaleString()} / {(job.total_records || 0).toLocaleString()} records</span>
                    <span>{job.current_step || 'Processing...'}</span>
                  </div>
                </div>
              ))}
            </div>
          </TerminalPanel>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6">
        <TerminalPanel title="Filter Jobs">
          <div className="flex items-center gap-4">
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-40 bg-zinc-800 border-zinc-700 font-mono text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-48 bg-zinc-800 border-zinc-700 font-mono text-xs">
                <SelectValue placeholder="Job Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="extract">Extract</SelectItem>
                <SelectItem value="transform">Transform</SelectItem>
                <SelectItem value="load">Load</SelectItem>
                <SelectItem value="full_etl">Full ETL</SelectItem>
                <SelectItem value="validation">Validation</SelectItem>
                <SelectItem value="deduplication">Deduplication</SelectItem>
                <SelectItem value="enrichment">Enrichment</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </TerminalPanel>
      </div>

      {/* Jobs History */}
      <TerminalPanel title={`Job History (${jobs?.data?.length || 0})`}>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 bg-zinc-800/30 animate-pulse" />
            ))}
          </div>
        ) : jobs?.data?.length === 0 ? (
          <div className="text-center py-12">
            <GitBranch className="w-12 h-12 mx-auto mb-4 text-zinc-700" />
            <p className="font-mono text-sm text-zinc-500">No jobs found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {jobs?.data?.map((job) => (
              <div
                key={job.id}
                className="p-4 bg-zinc-800/30 border border-zinc-800 hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    {getStatusIcon(job.status)}

                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm text-white">
                          {job.job_type.replace('_', ' ').toUpperCase()}
                        </span>
                        <span className={`px-2 py-0.5 border font-mono text-[9px] ${getStatusColor(job.status)}`}>
                          {job.status.toUpperCase()}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 font-mono text-[10px] text-zinc-500">
                        <span>{job.source_name || job.data_source_id?.slice(0, 8) || 'System'}</span>
                        <span>•</span>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>Started {formatRelativeTime(job.started_at || job.created_at)}</span>
                        </div>
                        <span>•</span>
                        <span>
                          {job.completed_at
                            ? formatDuration(Math.floor((new Date(job.completed_at).getTime() - new Date(job.started_at || job.created_at).getTime()) / 1000))
                            : job.status === 'running'
                              ? formatDuration(Math.floor((Date.now() - new Date(job.started_at || job.created_at).getTime()) / 1000))
                              : '-'}
                        </span>
                        <span>•</span>
                        <span>{(job.records_processed || 0).toLocaleString()} records</span>
                        {(job.errors_count || 0) > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-red-400">{job.errors_count} errors</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button className="p-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-amber-500 transition-colors">
                      <Terminal className="w-4 h-4 text-zinc-400" />
                    </button>
                    {job.status === 'running' && (
                      <button
                        onClick={() => cancelMutation.mutate({ id: job.id })}
                        className="p-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-red-500 transition-colors"
                      >
                        <Square className="w-4 h-4 text-red-400" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </TerminalPanel>
    </div>
  )
}
