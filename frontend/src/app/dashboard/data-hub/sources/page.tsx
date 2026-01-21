'use client'

import { TerminalPanel, DataMetricCard, TierBadge } from '@/components/ui/terminal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Database,
  Search,
  RefreshCw,
  Pause,
  Play,
  CheckCircle,
  AlertCircle,
  Clock,
  Zap,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { dataSourcesApi, DataSourceFilters } from '@/lib/api'
import { DataSource, DataSourceTier } from '@/types/data-hub'
import { formatRelativeTime, cn } from '@/lib/utils'
import { useState } from 'react'

const tierOptions: { value: DataSourceTier | 'all'; label: string }[] = [
  { value: 'all', label: 'All Tiers' },
  { value: 'tier1_government', label: 'Tier 1' },
  { value: 'tier2_financial', label: 'Tier 2' },
  { value: 'tier3_partners', label: 'Tier 3' },
  { value: 'tier4_contributions', label: 'Tier 4' },
  { value: 'tier5_public_web', label: 'Tier 5' },
]

export default function DataSourcesPage() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTier, setSelectedTier] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')

  const queryFilters: DataSourceFilters = {
    tier: selectedTier !== 'all' ? (selectedTier as DataSourceTier) : undefined,
    is_active: selectedStatus === 'active' ? true : selectedStatus === 'inactive' ? false : undefined,
    is_paused: selectedStatus === 'paused' ? true : undefined,
    search: searchQuery || undefined,
    limit: 50,
  }

  const { data: sources, isLoading } = useQuery({
    queryKey: ['data-sources', queryFilters],
    queryFn: () => dataSourcesApi.getAll(queryFilters),
  })

  const { data: stats } = useQuery({
    queryKey: ['data-sources-stats'],
    queryFn: () => dataSourcesApi.getStatsByTier(),
  })

  const syncMutation = useMutation({
    mutationFn: (id: string) => dataSourcesApi.triggerSync(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-sources'] })
    },
  })

  const pauseMutation = useMutation({
    mutationFn: ({ id, pause }: { id: string; pause: boolean }) =>
      dataSourcesApi.update(id, { is_paused: pause }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-sources'] })
    },
  })

  const totalSources = stats?.data?.reduce((acc, s) => acc + s.total, 0) || 0
  const activeSources = stats?.data?.reduce((acc, s) => acc + s.active, 0) || 0
  const pausedSources = stats?.data?.reduce((acc, s) => acc + s.paused, 0) || 0

  return (
    <div className="min-h-screen bg-black text-white p-4 pb-10">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-mono text-2xl text-amber-500 tracking-wider">DATA SOURCES MANAGEMENT</h1>
        <p className="font-mono text-[10px] text-zinc-500 mt-1">
          MONITOR & CONTROL DATA SOURCE CONNECTIONS • REAL-TIME SYNC STATUS
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <DataMetricCard
          title="Total Sources"
          value={totalSources}
          subtitle="Configured"
          icon={Database}
          color="blue"
        />

        <DataMetricCard
          title="Active Sources"
          value={activeSources}
          subtitle={`${((activeSources / Math.max(totalSources, 1)) * 100).toFixed(0)}% of total`}
          trend={5.2}
          icon={CheckCircle}
          color="green"
          status="live"
        />

        <DataMetricCard
          title="Paused"
          value={pausedSources}
          subtitle="Temporarily disabled"
          icon={Pause}
          color="yellow"
        />

        <DataMetricCard
          title="Sync Rate"
          value="94.5%"
          subtitle="Success rate (24h)"
          trend={2.1}
          icon={Zap}
          color="purple"
        />
      </div>

      {/* Filters */}
      <div className="mb-6">
        <TerminalPanel title="Search & Filter">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search sources..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 text-white font-mono text-sm focus:outline-none focus:border-amber-500"
              />
            </div>

            <Select value={selectedTier} onValueChange={setSelectedTier}>
              <SelectTrigger className="w-40 bg-zinc-800 border-zinc-700 font-mono text-xs">
                <SelectValue placeholder="Tier" />
              </SelectTrigger>
              <SelectContent>
                {tierOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-32 bg-zinc-800 border-zinc-700 font-mono text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </TerminalPanel>
      </div>

      {/* Sources Table */}
      <TerminalPanel title={`Data Sources (${sources?.data?.length || 0})`}>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-zinc-800/30 animate-pulse" />
            ))}
          </div>
        ) : sources?.data?.length === 0 ? (
          <div className="text-center py-12">
            <Database className="w-12 h-12 mx-auto mb-4 text-zinc-700" />
            <p className="font-mono text-sm text-zinc-500">No sources found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sources?.data?.map((source) => (
              <div
                key={source.id}
                className="p-4 bg-zinc-800/30 border border-zinc-800 hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <Database className="w-5 h-5 text-blue-400" />

                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm text-white">{source.name}</span>
                        <TierBadge tier={source.tier} />
                        {source.is_active && !source.is_paused && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-green-900/30 text-green-400 font-mono text-[9px]">
                            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                            ACTIVE
                          </span>
                        )}
                        {source.is_paused && (
                          <span className="px-2 py-0.5 bg-yellow-900/30 text-yellow-400 font-mono text-[9px]">
                            PAUSED
                          </span>
                        )}
                        {!source.is_active && (
                          <span className="px-2 py-0.5 bg-zinc-700 text-zinc-400 font-mono text-[9px]">
                            INACTIVE
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 font-mono text-[10px] text-zinc-500">
                        <span>{source.slug}</span>
                        <span>•</span>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>
                            Last sync: {source.last_sync_at ? formatRelativeTime(source.last_sync_at) : 'Never'}
                          </span>
                        </div>
                        <span>•</span>
                        <span>{(source.total_records_synced || 0).toLocaleString()} records</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => syncMutation.mutate(source.id)}
                      disabled={syncMutation.isPending || source.is_paused}
                      className="p-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-amber-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RefreshCw className={cn(
                        'w-4 h-4 text-zinc-400',
                        syncMutation.isPending && 'animate-spin'
                      )} />
                    </button>

                    <button
                      onClick={() => pauseMutation.mutate({ id: source.id, pause: !source.is_paused })}
                      disabled={pauseMutation.isPending}
                      className="p-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-amber-500 transition-colors disabled:opacity-50"
                    >
                      {source.is_paused ? (
                        <Play className="w-4 h-4 text-green-400" />
                      ) : (
                        <Pause className="w-4 h-4 text-yellow-400" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Sync Status */}
                {source.last_sync_status && (
                  <div className="mt-3 pt-3 border-t border-zinc-800">
                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <div className="flex items-center gap-2">
                        {source.last_sync_status === 'success' && (
                          <>
                            <CheckCircle className="w-3 h-3 text-green-400" />
                            <span className="text-green-400">Last sync successful</span>
                          </>
                        )}
                        {source.last_sync_status === 'failed' && (
                          <>
                            <AlertCircle className="w-3 h-3 text-red-400" />
                            <span className="text-red-400">Last sync failed</span>
                          </>
                        )}
                        {source.last_sync_status === 'running' && (
                          <>
                            <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />
                            <span className="text-blue-400">Sync in progress...</span>
                          </>
                        )}
                      </div>
                      <span className="text-zinc-600">
                        Frequency: {source.sync_frequency || 'Manual'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </TerminalPanel>
    </div>
  )
}
