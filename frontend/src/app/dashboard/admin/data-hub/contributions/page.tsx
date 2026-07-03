'use client'

import { TerminalPanel, DataMetricCard } from '@/components/ui/terminal'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Users,
  CheckCircle,
  XCircle,
  Clock,
  Trophy,
  MapPin,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Star,
  Building2,
  FileText,
  RefreshCw,
  Upload,
  AlertCircle,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contributionsApi, ContributionFilters } from '@/lib/api'
import { ContributionType, ValidationStatus } from '@/types/data-hub'
import { formatRelativeTime, cn } from '@/lib/utils'
import { useState } from 'react'

const CONTEXT_OPTIONS = [
  { id: 'all', label: 'ALL SOURCES' },
  { id: 'valuation_workflow', label: 'VALUATION' },
  { id: 'property_management', label: 'PROPERTY MGMT' },
  { id: 'crm_deal_management', label: 'CRM / DEALS' },
]

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'

interface CRMSyncStats {
  total_properties: number
  synced_count: number
  pending_count: number
  failed_count: number
}

interface CRMPendingProperty {
  id: string
  property_name: string
  property_type: string
  city: string
  region: string
  created_at: string
  sync_status: string
}

export default function ContributionsPage() {
  const queryClient = useQueryClient()
  const [selectedStatus, setSelectedStatus] = useState<string>('pending')
  const [selectedType, setSelectedType] = useState<string>('all')
  const [selectedContext, setSelectedContext] = useState<string>('all')
  const [syncingAll, setSyncingAll] = useState(false)
  const [retryingFailed, setRetryingFailed] = useState(false)

  const queryFilters: ContributionFilters = {
    validation_status: selectedStatus !== 'all' ? (selectedStatus as ValidationStatus) : undefined,
    contribution_type: selectedType !== 'all' ? (selectedType as ContributionType) : undefined,
    source_context: selectedContext !== 'all' ? selectedContext : undefined,
    limit: 50,
  }

  const { data: contributions, isLoading } = useQuery({
    queryKey: ['contributions', queryFilters],
    queryFn: () => contributionsApi.getAll(queryFilters),
  })

  const { data: stats } = useQuery({
    queryKey: ['contributions-stats'],
    queryFn: () => contributionsApi.getStats(),
  })

  const { data: leaderboard } = useQuery({
    queryKey: ['contributors-leaderboard'],
    queryFn: () => contributionsApi.getLeaderboard(10),
  })

  // CRM Sync Stats - only fetch when CRM tab is selected
  const { data: crmSyncStats, refetch: refetchCrmStats } = useQuery<CRMSyncStats>({
    queryKey: ['crm-sync-stats'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/crm/properties/sync/stats`)
      if (!res.ok) throw new Error('Failed to fetch CRM sync stats')
      return res.json()
    },
    enabled: selectedContext === 'crm_deal_management',
  })

  // CRM Pending Properties - only fetch when CRM tab is selected
  const { data: crmPendingProperties } = useQuery<{ properties: CRMPendingProperty[] }>({
    queryKey: ['crm-pending-properties'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/crm/properties/sync/pending?limit=10`)
      if (!res.ok) throw new Error('Failed to fetch pending properties')
      return res.json()
    },
    enabled: selectedContext === 'crm_deal_management',
  })

  // Bulk sync all pending CRM properties
  const handleBulkSync = async () => {
    setSyncingAll(true)
    try {
      const res = await fetch(`${API_BASE}/crm/properties/sync/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (res.ok) {
        refetchCrmStats()
        queryClient.invalidateQueries({ queryKey: ['crm-pending-properties'] })
      }
    } catch (err) {
      console.error('Bulk sync failed:', err)
    } finally {
      setSyncingAll(false)
    }
  }

  // Retry failed CRM syncs
  const handleRetryFailed = async () => {
    setRetryingFailed(true)
    try {
      const res = await fetch(`${API_BASE}/crm/properties/sync/retry-failed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (res.ok) {
        refetchCrmStats()
      }
    } catch (err) {
      console.error('Retry failed:', err)
    } finally {
      setRetryingFailed(false)
    }
  }

  const approveMutation = useMutation({
    mutationFn: ({ id, credits }: { id: string; credits?: number }) =>
      contributionsApi.approve(id, credits),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contributions'] })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      contributionsApi.reject(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contributions'] })
    },
  })

  const getContributionIcon = (type: string) => {
    switch (type) {
      case 'property_listing': return <Building2 className="w-4 h-4" />
      case 'price_update': return <FileText className="w-4 h-4" />
      default: return <FileText className="w-4 h-4" />
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pb-10">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-mono text-2xl text-amber-500 tracking-wider">USER CONTRIBUTIONS REVIEW</h1>
        <p className="font-mono text-[10px] text-muted-foreground mt-1">
          COMMUNITY DATA VALIDATION • QUALITY CONTROL • CONTRIBUTOR REWARDS
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <DataMetricCard
          title="Pending Review"
          value={stats?.data?.pending || 0}
          subtitle="Awaiting validation"
          icon={Clock}
          color="amber"
          status={(stats?.data?.pending ?? 0) > 0 ? 'live' : undefined}
        />

        <DataMetricCard
          title="Approved Today"
          value={stats?.data?.approvedToday || 0}
          subtitle={`${stats?.data?.totalApproved || 0} total`}
          trend={12.5}
          icon={CheckCircle}
          color="green"
        />

        <DataMetricCard
          title="Rejection Rate"
          value={`${((stats?.data?.rejectionRate || 0) * 100).toFixed(1)}%`}
          subtitle="Last 30 days"
          trend={-2.3}
          icon={XCircle}
          color="red"
        />

        <DataMetricCard
          title="Active Contributors"
          value={stats?.data?.activeContributors || 0}
          subtitle="This month"
          icon={Users}
          color="blue"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Sub-tabs */}
          <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide">
            {CONTEXT_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => setSelectedContext(option.id)}
                className={cn(
                  'px-4 py-2 font-mono text-[10px] tracking-wider transition-colors border whitespace-nowrap',
                  selectedContext === option.id
                    ? 'bg-amber-500 text-foreground border-amber-500 font-bold'
                    : 'bg-card text-muted-foreground border-border hover:border-border hover:text-muted-foreground'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* CRM Sync Panel - Only visible when CRM tab is selected */}
          {selectedContext === 'crm_deal_management' && crmSyncStats && (
            <TerminalPanel title="CRM PROPERTY SYNC STATUS">
              <div className="space-y-4">
                {/* Sync Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-muted/50 border border-border">
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 className="h-3 w-3 text-muted-foreground" />
                      <span className="font-mono text-[9px] text-muted-foreground">TOTAL</span>
                    </div>
                    <span className="font-mono text-xl text-foreground">{crmSyncStats.total_properties}</span>
                  </div>
                  <div className="p-3 bg-muted/50 border border-green-500/30">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle className="h-3 w-3 text-green-500" />
                      <span className="font-mono text-[9px] text-muted-foreground">SYNCED</span>
                    </div>
                    <span className="font-mono text-xl text-green-600 dark:text-green-400">{crmSyncStats.synced_count}</span>
                  </div>
                  <div className="p-3 bg-muted/50 border border-blue-500/30">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-3 w-3 text-blue-500" />
                      <span className="font-mono text-[9px] text-muted-foreground">PENDING</span>
                    </div>
                    <span className="font-mono text-xl text-blue-600 dark:text-blue-400">{crmSyncStats.pending_count}</span>
                  </div>
                  <div className="p-3 bg-muted/50 border border-red-500/30">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertCircle className="h-3 w-3 text-red-500" />
                      <span className="font-mono text-[9px] text-muted-foreground">FAILED</span>
                    </div>
                    <span className="font-mono text-xl text-red-600 dark:text-red-400">{crmSyncStats.failed_count}</span>
                  </div>
                </div>

                {/* Sync Actions */}
                <div className="flex items-center gap-3 pt-2 border-t border-border">
                  <Button
                    onClick={handleBulkSync}
                    disabled={syncingAll || crmSyncStats.pending_count === 0}
                    className="bg-blue-600 hover:bg-blue-700 text-foreground font-mono text-[10px] h-8"
                  >
                    {syncingAll ? (
                      <RefreshCw className="h-3 w-3 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-3 w-3 mr-2" />
                    )}
                    SYNC ALL PENDING ({crmSyncStats.pending_count})
                  </Button>

                  {crmSyncStats.failed_count > 0 && (
                    <Button
                      onClick={handleRetryFailed}
                      disabled={retryingFailed}
                      variant="outline"
                      className="border-red-500/50 text-red-600 dark:text-red-400 hover:bg-red-500/10 font-mono text-[10px] h-8"
                    >
                      {retryingFailed ? (
                        <RefreshCw className="h-3 w-3 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3 mr-2" />
                      )}
                      RETRY FAILED ({crmSyncStats.failed_count})
                    </Button>
                  )}
                </div>

                {/* Pending Properties Preview */}
                {crmPendingProperties?.properties && crmPendingProperties.properties.length > 0 && (
                  <div className="pt-3 border-t border-border">
                    <div className="font-mono text-[10px] text-muted-foreground mb-2">PENDING SYNC QUEUE</div>
                    <div className="space-y-1">
                      {crmPendingProperties.properties.slice(0, 5).map((prop) => (
                        <div
                          key={prop.id}
                          className="flex items-center justify-between p-2 bg-card/50 border border-border"
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <Building2 className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            <span className="font-mono text-xs text-foreground truncate">
                              {prop.property_name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            <span className="font-mono text-[10px]">{prop.city}</span>
                          </div>
                        </div>
                      ))}
                      {crmPendingProperties.properties.length > 5 && (
                        <div className="font-mono text-[10px] text-muted-foreground text-center py-1">
                          +{crmPendingProperties.properties.length - 5} more pending...
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </TerminalPanel>
          )}

          {/* Filters */}
          <TerminalPanel title="Filter Contributions">
            <div className="flex items-center gap-4">
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-40 bg-muted border-border font-mono text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="needs_review">Needs Review</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-48 bg-muted border-border font-mono text-xs">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="property_listing">Property Listing</SelectItem>
                  <SelectItem value="price_update">Price Update</SelectItem>
                  <SelectItem value="property_correction">Correction</SelectItem>
                  <SelectItem value="new_development">New Development</SelectItem>
                  <SelectItem value="market_insight">Market Insight</SelectItem>
                  <SelectItem value="photo_submission">Photo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TerminalPanel>

          {/* Contributions List */}
          <TerminalPanel title={`Contributions (${contributions?.data?.length || 0})`}>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-24 bg-muted/30 animate-pulse" />
                ))}
              </div>
            ) : contributions?.data?.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-zinc-700" />
                <p className="font-mono text-sm text-muted-foreground">No contributions found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {contributions?.data?.map((contribution) => (
                  <div
                    key={contribution.id}
                    className="p-4 bg-muted/30 border border-border hover:border-border transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3 flex-1">
                        {getContributionIcon(contribution.contribution_type)}

                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-sm text-foreground">
                              {contribution.contribution_type.replace(/_/g, ' ').toUpperCase()}
                            </span>
                            {contribution.validation_status === 'pending' && (
                              <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30 font-mono text-[9px]">
                                PENDING
                              </span>
                            )}
                            {contribution.validation_status === 'approved' && (
                              <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-500/30 font-mono text-[9px]">
                                APPROVED
                              </span>
                            )}
                            {contribution.validation_status === 'rejected' && (
                              <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-500/30 font-mono text-[9px]">
                                REJECTED
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-4 font-mono text-[10px] text-muted-foreground">
                            {contribution.property_region && (
                              <>
                                <div className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  <span>{contribution.property_region}</span>
                                </div>
                                <span>•</span>
                              </>
                            )}
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>Submitted {formatRelativeTime(contribution.submitted_at)}</span>
                            </div>
                            {contribution.confidence_score !== undefined && (
                              <>
                                <span>•</span>
                                <span className={cn(
                                  contribution.confidence_score >= 0.8 ? 'text-green-600 dark:text-green-400' :
                                    contribution.confidence_score >= 0.5 ? 'text-yellow-600 dark:text-yellow-400' :
                                      'text-red-600 dark:text-red-400'
                                )}>
                                  {(contribution.confidence_score * 100).toFixed(0)}% confidence
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {contribution.validation_status === 'pending' && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => approveMutation.mutate({ id: contribution.id, credits: 10 })}
                            disabled={approveMutation.isPending}
                            className="p-2 bg-green-100 dark:bg-green-900/30 hover:bg-green-900/50 border border-green-500/30 hover:border-green-500 transition-colors disabled:opacity-50"
                          >
                            <ThumbsUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                          </button>
                          <button
                            onClick={() => rejectMutation.mutate({ id: contribution.id, reason: 'Does not meet quality standards' })}
                            disabled={rejectMutation.isPending}
                            className="p-2 bg-red-100 dark:bg-red-900/30 hover:bg-red-900/50 border border-red-500/30 hover:border-red-500 transition-colors disabled:opacity-50"
                          >
                            <ThumbsDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                          </button>
                          <button className="p-2 bg-muted hover:bg-zinc-700 border border-border hover:border-amber-500 transition-colors">
                            <Eye className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Data Preview */}
                    <div className="p-3 bg-card/50 border border-border font-mono text-[10px] text-muted-foreground">
                      <pre className="overflow-x-auto">
                        {JSON.stringify(contribution.data, null, 2).slice(0, 200)}
                        {JSON.stringify(contribution.data).length > 200 && '...'}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TerminalPanel>
        </div>

        {/* Leaderboard Sidebar */}
        <div>
          <TerminalPanel title="Top Contributors">
            <div className="space-y-3">
              {leaderboard?.data?.map((contributor, index) => (
                <div
                  key={contributor.id}
                  className="flex items-center gap-3 p-3 bg-muted/30 border border-border"
                >
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center font-mono text-sm font-bold',
                    index === 0 && 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400',
                    index === 1 && 'bg-gray-400/20 text-gray-300',
                    index === 2 && 'bg-orange-500/20 text-orange-600 dark:text-orange-400',
                    index > 2 && 'bg-zinc-700 text-muted-foreground'
                  )}>
                    {index + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm text-foreground truncate">
                      {contributor.display_name || 'Anonymous'}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {contributor.total_contributions} contributions
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />
                    <span className="font-mono text-xs text-foreground">
                      {(contributor.total_credits || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </TerminalPanel>
        </div>
      </div>
    </div>
  )
}
