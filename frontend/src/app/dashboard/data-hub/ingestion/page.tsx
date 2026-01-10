'use client'

import { Header, MetricCard } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Layers,
  Building2,
  Landmark,
  Briefcase,
  Users,
  Globe,
  Upload,
  CheckCircle,
  Clock,
  RefreshCw,
  Play,
  ArrowRight,
  FileText,
  Database,
  Zap,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { dataSourcesApi, queuesApi } from '@/lib/api'
import { formatNumber, cn } from '@/lib/utils'
import { DataSourceTier } from '@/types/data-hub'
import { useState } from 'react'
import { DataIngestionPanel } from '@/components/data-hub/DataIngestionPanel'
import { PullIntegrationsPanel } from '@/components/data-hub/PullIntegrationsPanel'

// Tier configurations - For UI Display only
const tierUiConfigs = {
  tier1_government: {
    name: 'Government Sources',
    icon: Landmark,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  tier2_financial: {
    name: 'Financial Institutions',
    icon: Briefcase,
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
  },
  tier3_partners: {
    name: 'Partner Organizations',
    icon: Building2,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
  },
  tier4_contributions: {
    name: 'User Contributions',
    icon: Users,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
  },
  tier5_public_web: {
    name: 'Web Scraped',
    icon: Globe,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
  },
} as const

// Define a type for the keys of tierUiConfigs
type TierKey = keyof typeof tierUiConfigs

function TierCard({ tier, isSelected, onClick, stats }: { tier: string; isSelected: boolean; onClick: () => void; stats?: any }) {
  const config = tierUiConfigs[tier as TierKey]

  if (!config) return null

  const Icon = config.icon
  // Stats mapping - updated to match API types
  const totalRecords = stats?.total_records || 0
  const activeSources = stats?.active || 0
  const totalSources = stats?.count || 0

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:border-primary/50',
        isSelected && 'border-primary ring-1 ring-primary'
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className={cn('rounded-lg p-2', config.bgColor)}>
            <Icon className={cn('h-5 w-5', config.color)} />
          </div>
          <Badge variant="outline" className="text-xs">
            {activeSources}/{totalSources} active
          </Badge>
        </div>
        <h3 className="font-medium mt-3">{config.name}</h3>
        <p className="text-2xl font-bold mt-1">{formatNumber(totalRecords)}</p>
        <p className="text-xs text-muted-foreground">records</p>
      </CardContent>
    </Card>
  )
}

export default function TierIngestionPage() {
  const queryClient = useQueryClient()
  const [selectedTier, setSelectedTier] = useState<string>('tier1_government')

  const { data: sourceStats } = useQuery({
    queryKey: ['data-sources-stats'],
    queryFn: () => dataSourcesApi.getStatsByTier(),
  })

  // Fetch sources for selected tier
  const { data: tierSources } = useQuery({
    queryKey: ['data-sources', selectedTier],
    queryFn: () => dataSourcesApi.getAll({ tier: selectedTier as DataSourceTier, limit: 100 }),
    enabled: !!selectedTier
  })

  const { data: queueStats } = useQuery({
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

  const selectedConfig = tierUiConfigs[selectedTier as TierKey]
  const SelectedIcon = selectedConfig?.icon || Layers

  // Calculate totals from stats if available
  const totalRecords = sourceStats?.data?.reduce((acc, s) => acc + (s.total_records || 0), 0) || 0
  const totalActiveSources = sourceStats?.data?.reduce((acc, s) => acc + (s.active || 0), 0) || 0
  const totalSourcesCount = sourceStats?.data?.reduce((acc, s) => acc + (s.total || 0), 0) || 0

  const handleTriggerIngestion = (source: string) => {
    triggerMutation.mutate({
      queue: 'data_ingestion',
      data: { source, tier: selectedTier },
    })
  }

  // Helper to map stats to tier keys
  const getStatsForTier = (tier: string) => {
    return sourceStats?.data?.find(s => s.tier === tier)
  }

  return (
    <div className="flex h-full flex-col">
      <Header
        title="Tier Ingestion"
        description="Manage data ingestion from all source tiers"
      />

      <div className="flex-1 overflow-hidden px-6 pb-6">
        <Tabs defaultValue="overview" className="h-full flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="ingestion">Data Ingestion</TabsTrigger>
              <TabsTrigger value="pull-integrations">
                <Zap className="h-4 w-4 mr-2" />
                Pull Integrations
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-hidden">
            <TabsContent value="overview" className="h-full m-0 data-[state=active]:flex flex-col">
              <ScrollArea className="flex-1">
                <div className="space-y-6 pr-4">
                  {/* Summary Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <MetricCard
                      title="Total Records"
                      value={formatNumber(totalRecords)}
                      subtitle="Across all tiers"
                      icon={Database}
                      color="blue"
                    />
                    <MetricCard
                      title="Active Sources"
                      value={totalActiveSources}
                      subtitle={`of ${totalSourcesCount} total`}
                      icon={CheckCircle}
                      color="green"
                    />
                    <MetricCard
                      title="Pending Jobs"
                      value={queueStats?.data?.total_pending || 0}
                      subtitle="In queue"
                      icon={Clock}
                      color="yellow"
                    />
                    <MetricCard
                      title="Data Quality"
                      value="94.2%"
                      subtitle="Validation pass rate"
                      icon={FileText}
                      color="purple"
                    />
                  </div>

                  {/* Tier Selection */}
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    {Object.keys(tierUiConfigs).map((tier) => (
                      <TierCard
                        key={tier}
                        tier={tier}
                        isSelected={selectedTier === tier}
                        onClick={() => setSelectedTier(tier)}
                        stats={getStatsForTier(tier)}
                      />
                    ))}
                  </div>

                  {/* Selected Tier Details */}
                  {selectedConfig && (
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0">
                        <div className="flex items-center gap-3">
                          <div className={cn('rounded-lg p-2', selectedConfig.bgColor)}>
                            <SelectedIcon className={cn('h-5 w-5', selectedConfig.color)} />
                          </div>
                          <div>
                            <CardTitle className="text-base font-medium">
                              {selectedConfig.name}
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                              {tierSources?.data?.length || 0} connected sources
                            </p>
                          </div>
                        </div>
                        <Button
                          onClick={() => {
                            // Logic to sync all active
                            tierSources?.data
                              ?.filter(s => s.is_active)
                              .forEach(s => handleTriggerIngestion(s.name))
                          }}
                          disabled={triggerMutation.isPending}
                        >
                          <Play className="h-4 w-4 mr-2" />
                          Sync All Active
                        </Button>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {tierSources?.data?.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                              No data sources found for this tier.
                            </div>
                          ) : (
                            tierSources?.data?.map((source) => (
                              <div
                                key={source.id}
                                className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                              >
                                <div className="flex items-center gap-4">
                                  <div className={cn(
                                    'h-10 w-10 rounded-lg flex items-center justify-center',
                                    source.is_active ? 'bg-green-500/10' : 'bg-muted'
                                  )}>
                                    <Database className={cn(
                                      'h-5 w-5',
                                      source.is_active ? 'text-green-400' : 'text-muted-foreground'
                                    )} />
                                  </div>
                                  <div>
                                    <p className="font-medium">{source.name}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <Badge variant="outline" className="text-xs">
                                        {source.api_endpoint ? 'API' : 'Manual'}
                                      </Badge>
                                      <span className="text-xs text-muted-foreground">
                                        {formatNumber(source.total_properties_added || 0)} records
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <Badge variant={source.is_active ? 'success' : 'secondary'}>
                                    {source.is_active ? 'Active' : 'Inactive'}
                                  </Badge>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleTriggerIngestion(source.name)}
                                    disabled={!source.is_active || triggerMutation.isPending}
                                  >
                                    <RefreshCw className={cn(
                                      'h-4 w-4',
                                      triggerMutation.isPending && 'animate-spin'
                                    )} />
                                  </Button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Data Flow Diagram */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base font-medium">Data Ingestion Pipeline</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between gap-4 overflow-x-auto py-4">
                        {/* Sources */}
                        <div className="flex flex-col items-center gap-2 min-w-[120px]">
                          <div className="h-16 w-16 rounded-xl bg-blue-500/10 flex items-center justify-center">
                            <Layers className="h-8 w-8 text-blue-400" />
                          </div>
                          <span className="text-sm font-medium">Sources</span>
                          <span className="text-xs text-muted-foreground">5 Tiers</span>
                        </div>

                        <ArrowRight className="h-6 w-6 text-muted-foreground shrink-0" />

                        {/* Extract */}
                        <div className="flex flex-col items-center gap-2 min-w-[120px]">
                          <div className="h-16 w-16 rounded-xl bg-green-500/10 flex items-center justify-center">
                            <Upload className="h-8 w-8 text-green-400" />
                          </div>
                          <span className="text-sm font-medium">Extract</span>
                          <span className="text-xs text-muted-foreground">API, SFTP, Web</span>
                        </div>

                        <ArrowRight className="h-6 w-6 text-muted-foreground shrink-0" />

                        {/* Transform */}
                        <div className="flex flex-col items-center gap-2 min-w-[120px]">
                          <div className="h-16 w-16 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                            <RefreshCw className="h-8 w-8 text-yellow-400" />
                          </div>
                          <span className="text-sm font-medium">Transform</span>
                          <span className="text-xs text-muted-foreground">Clean, Validate</span>
                        </div>

                        <ArrowRight className="h-6 w-6 text-muted-foreground shrink-0" />

                        {/* Load */}
                        <div className="flex flex-col items-center gap-2 min-w-[120px]">
                          <div className="h-16 w-16 rounded-xl bg-purple-500/10 flex items-center justify-center">
                            <Database className="h-8 w-8 text-purple-400" />
                          </div>
                          <span className="text-sm font-medium">Load</span>
                          <span className="text-xs text-muted-foreground">PostgreSQL</span>
                        </div>

                        <ArrowRight className="h-6 w-6 text-muted-foreground shrink-0" />

                        {/* Index */}
                        <div className="flex flex-col items-center gap-2 min-w-[120px]">
                          <div className="h-16 w-16 rounded-xl bg-orange-500/10 flex items-center justify-center">
                            <FileText className="h-8 w-8 text-orange-400" />
                          </div>
                          <span className="text-sm font-medium">Index</span>
                          <span className="text-xs text-muted-foreground">OpenSearch</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="ingestion" className="h-full m-0 data-[state=active]:flex flex-col">
              <ScrollArea className="flex-1">
                <div className="pr-4 pb-6">
                  <DataIngestionPanel />
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="pull-integrations" className="h-full m-0 data-[state=active]:flex flex-col">
              <ScrollArea className="flex-1">
                <div className="pr-4 pb-6">
                  <PullIntegrationsPanel />
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}
