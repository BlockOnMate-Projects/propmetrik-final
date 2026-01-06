'use client'

import { Header, MetricCard } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Database,
  Plus,
  Search,
  RefreshCw,
  Pause,
  Play,
  Trash2,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Clock,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { dataSourcesApi, DataSourceFilters } from '@/lib/api'
import { DataSource, DataSourceTier } from '@/types/data-hub'
import { formatRelativeTime, getTierLabel, getTierColor, cn } from '@/lib/utils'
import { useState } from 'react'

const tierOptions: { value: DataSourceTier | 'all'; label: string }[] = [
  { value: 'all', label: 'All Tiers' },
  { value: 'tier1_government', label: 'Tier 1 - Government' },
  { value: 'tier2_financial', label: 'Tier 2 - Financial' },
  { value: 'tier3_partners', label: 'Tier 3 - Partners' },
  { value: 'tier4_contributions', label: 'Tier 4 - Contributions' },
  { value: 'tier5_web', label: 'Tier 5 - Web Scraped' },
]

const statusOptions = [
  { value: 'all', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'inactive', label: 'Inactive' },
]

export default function DataSourcesPage() {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<DataSourceFilters>({
    page: 1,
    limit: 20,
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTier, setSelectedTier] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')

  // Build query filters
  const queryFilters: DataSourceFilters = {
    ...filters,
    tier: selectedTier !== 'all' ? (selectedTier as DataSourceTier) : undefined,
    is_active: selectedStatus === 'active' ? true : selectedStatus === 'inactive' ? false : undefined,
    is_paused: selectedStatus === 'paused' ? true : undefined,
    search: searchQuery || undefined,
  }

  const { data: sources, isLoading } = useQuery({
    queryKey: ['data-sources', queryFilters],
    queryFn: () => dataSourcesApi.getAll(queryFilters),
  })

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['data-sources-stats'],
    queryFn: () => dataSourcesApi.getStatsByTier(),
  })

  const syncMutation = useMutation({
    mutationFn: (id: string) => dataSourcesApi.triggerSync(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-sources'] })
    },
  })

  const totalSources = stats?.data?.reduce((acc, s) => acc + s.total, 0) || 0
  const activeSources = stats?.data?.reduce((acc, s) => acc + s.active, 0) || 0
  const pausedSources = stats?.data?.reduce((acc, s) => acc + s.paused, 0) || 0

  const getSourceStatus = (source: DataSource) => {
    if (source.is_paused) return 'paused'
    if (!source.is_active) return 'inactive'
    return 'active'
  }

  const getStatusBadge = (source: DataSource) => {
    const status = getSourceStatus(source)
    switch (status) {
      case 'active':
        return <Badge variant="success">Active</Badge>
      case 'paused':
        return <Badge variant="warning">Paused</Badge>
      case 'inactive':
        return <Badge variant="secondary">Inactive</Badge>
    }
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Data Sources" description="Manage and monitor data source connections" />

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard
              title="Total Sources"
              value={totalSources}
              icon={Database}
              color="blue"
              isLoading={statsLoading}
            />
            <MetricCard
              title="Active"
              value={activeSources}
              subtitle={`${((activeSources / Math.max(totalSources, 1)) * 100).toFixed(0)}% of total`}
              icon={CheckCircle}
              color="green"
              isLoading={statsLoading}
            />
            <MetricCard
              title="Paused"
              value={pausedSources}
              icon={Pause}
              color="yellow"
              isLoading={statsLoading}
            />
            <MetricCard
              title="Error Rate"
              value="2.3%"
              subtitle="Last 24 hours"
              icon={AlertCircle}
              color="red"
              isLoading={statsLoading}
            />
          </div>

          {/* Filters & Actions */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="flex flex-1 gap-4 items-center w-full md:w-auto">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search sources..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={selectedTier} onValueChange={setSelectedTier}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Filter by tier" />
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
                    <SelectTrigger className="w-36">
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
                </div>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Source
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Data Sources Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">
                Data Sources
                <span className="ml-2 text-muted-foreground font-normal">
                  ({sources?.total || 0} total)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
                      <Skeleton className="h-10 w-10 rounded-lg" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-64" />
                      </div>
                      <Skeleton className="h-6 w-20 rounded-full" />
                      <Skeleton className="h-8 w-8 rounded" />
                    </div>
                  ))}
                </div>
              ) : sources?.data?.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No data sources found</p>
                  <p className="text-sm">Try adjusting your filters or add a new source</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Sync</TableHead>
                      <TableHead>Records</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sources?.data?.map((source) => (
                      <TableRow key={source.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              'h-10 w-10 rounded-lg flex items-center justify-center',
                              getTierColor(source.tier)
                            )}>
                              <Database className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="font-medium">{source.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {source.source_type} • {source.provider}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('border-0', getTierColor(source.tier))}>
                            {getTierLabel(source.tier)}
                          </Badge>
                        </TableCell>
                        <TableCell>{getStatusBadge(source)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span className="text-sm">
                              {source.last_sync_at
                                ? formatRelativeTime(source.last_sync_at)
                                : 'Never'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm">
                            {source.record_count?.toLocaleString() || 0}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => syncMutation.mutate(source.id)}
                              disabled={syncMutation.isPending}
                            >
                              <RefreshCw className={cn(
                                'h-4 w-4',
                                syncMutation.isPending && 'animate-spin'
                              )} />
                            </Button>
                            <Button variant="ghost" size="icon">
                              {source.is_paused ? (
                                <Play className="h-4 w-4" />
                              ) : (
                                <Pause className="h-4 w-4" />
                              )}
                            </Button>
                            <Button variant="ghost" size="icon">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* Pagination */}
              {sources && sources.total > filters.limit! && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {((filters.page! - 1) * filters.limit!) + 1} to{' '}
                    {Math.min(filters.page! * filters.limit!, sources.total)} of {sources.total}
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
                      disabled={filters.page! * filters.limit! >= sources.total}
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
