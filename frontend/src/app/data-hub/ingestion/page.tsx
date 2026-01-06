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
  Layers,
  Building2,
  Landmark,
  Briefcase,
  Users,
  Globe,
  Upload,
  CheckCircle,
  AlertCircle,
  Clock,
  RefreshCw,
  Play,
  ArrowRight,
  FileText,
  Database,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { dataSourcesApi, queuesApi } from '@/lib/api'
import { formatRelativeTime, formatNumber, getTierLabel, getTierColor, cn } from '@/lib/utils'
import { DataSourceTier } from '@/types/data-hub'

// Tier configurations
const tierConfigs = {
  tier1_government: {
    name: 'Government Sources',
    icon: Landmark,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    sources: [
      { name: 'Lands Commission', type: 'API', status: 'active', records: 125000 },
      { name: 'Ghana Statistical Service', type: 'CSV', status: 'active', records: 45000 },
      { name: 'Town & Country Planning', type: 'Manual', status: 'pending', records: 8500 },
      { name: 'District Assemblies', type: 'Mixed', status: 'active', records: 32000 },
    ],
  },
  tier2_financial: {
    name: 'Financial Institutions',
    icon: Briefcase,
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    sources: [
      { name: 'HFC Bank', type: 'API', status: 'active', records: 18500 },
      { name: 'GCB Bank', type: 'SFTP', status: 'active', records: 12000 },
      { name: 'Stanbic Bank', type: 'API', status: 'pending', records: 0 },
      { name: 'Cal Bank', type: 'Manual', status: 'inactive', records: 5200 },
    ],
  },
  tier3_partners: {
    name: 'Partner Organizations',
    icon: Building2,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    sources: [
      { name: 'Ghana Real Estate Developers', type: 'API', status: 'active', records: 8900 },
      { name: 'Estate Agents Association', type: 'CSV', status: 'active', records: 15600 },
      { name: 'Property Managers Guild', type: 'Manual', status: 'pending', records: 3200 },
    ],
  },
  tier4_contributions: {
    name: 'User Contributions',
    icon: Users,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    sources: [
      { name: 'Field Agents', type: 'Mobile', status: 'active', records: 25600 },
      { name: 'Property Owners', type: 'Web', status: 'active', records: 18200 },
      { name: 'Verified Surveyors', type: 'API', status: 'active', records: 4500 },
    ],
  },
  tier5_web: {
    name: 'Web Scraped',
    icon: Globe,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    sources: [
      { name: 'MeQasa', type: 'Spider', status: 'active', records: 5670 },
      { name: 'Ghana Property Centre', type: 'Spider', status: 'active', records: 4120 },
    ],
  },
}

type TierKey = keyof typeof tierConfigs

function TierCard({ tier, isSelected, onClick }: { tier: TierKey; isSelected: boolean; onClick: () => void }) {
  const config = tierConfigs[tier]
  const Icon = config.icon
  const totalRecords = config.sources.reduce((acc, s) => acc + s.records, 0)
  const activeSources = config.sources.filter((s) => s.status === 'active').length

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
            {activeSources}/{config.sources.length} active
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
  const [selectedTier, setSelectedTier] = useState<TierKey>('tier1_government')

  const { data: sourceStats, isLoading: statsLoading } = useQuery({
    queryKey: ['data-sources-stats'],
    queryFn: () => dataSourcesApi.getStatsByTier(),
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

  const selectedConfig = tierConfigs[selectedTier]
  const SelectedIcon = selectedConfig.icon

  // Calculate totals
  const totalRecords = Object.values(tierConfigs).reduce(
    (acc, tier) => acc + tier.sources.reduce((a, s) => a + s.records, 0),
    0
  )

  const totalActiveSources = Object.values(tierConfigs).reduce(
    (acc, tier) => acc + tier.sources.filter((s) => s.status === 'active').length,
    0
  )

  const handleTriggerIngestion = (source: string) => {
    triggerMutation.mutate({
      queue: 'data_ingestion',
      data: { source, tier: selectedTier },
    })
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Tier Ingestion"
        description="Manage data ingestion from all source tiers"
      />

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
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
              subtitle={`of ${Object.values(tierConfigs).reduce((a, t) => a + t.sources.length, 0)} total`}
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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {(Object.keys(tierConfigs) as TierKey[]).map((tier) => (
              <TierCard
                key={tier}
                tier={tier}
                isSelected={selectedTier === tier}
                onClick={() => setSelectedTier(tier)}
              />
            ))}
          </div>

          {/* Selected Tier Details */}
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
                    {selectedConfig.sources.length} connected sources
                  </p>
                </div>
              </div>
              <Button
                onClick={() => {
                  selectedConfig.sources
                    .filter((s) => s.status === 'active')
                    .forEach((s) => handleTriggerIngestion(s.name))
                }}
                disabled={triggerMutation.isPending}
              >
                <Play className="h-4 w-4 mr-2" />
                Sync All Active
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {selectedConfig.sources.map((source, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        'h-10 w-10 rounded-lg flex items-center justify-center',
                        source.status === 'active' ? 'bg-green-500/10' :
                        source.status === 'pending' ? 'bg-yellow-500/10' : 'bg-muted'
                      )}>
                        <Database className={cn(
                          'h-5 w-5',
                          source.status === 'active' ? 'text-green-400' :
                          source.status === 'pending' ? 'text-yellow-400' : 'text-muted-foreground'
                        )} />
                      </div>
                      <div>
                        <p className="font-medium">{source.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {source.type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatNumber(source.records)} records
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={
                        source.status === 'active' ? 'success' :
                        source.status === 'pending' ? 'warning' : 'secondary'
                      }>
                        {source.status}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTriggerIngestion(source.name)}
                        disabled={source.status !== 'active' || triggerMutation.isPending}
                      >
                        <RefreshCw className={cn(
                          'h-4 w-4',
                          triggerMutation.isPending && 'animate-spin'
                        )} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

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

          {/* Tier Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Records by Tier</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(Object.entries(tierConfigs) as [TierKey, typeof tierConfigs[TierKey]][]).map(([key, config]) => {
                  const tierTotal = config.sources.reduce((a, s) => a + s.records, 0)
                  const percentage = (tierTotal / totalRecords) * 100

                  return (
                    <div key={key} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{config.name}</span>
                        <span className="font-medium">{formatNumber(tierTotal)}</span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Recent Ingestion Activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { source: 'Lands Commission', time: '5 minutes ago', records: 1250, status: 'success' },
                  { source: 'Field Agents', time: '2 hours ago', records: 320, status: 'success' },
                  { source: 'HFC Bank', time: '3 hours ago', records: 0, status: 'failed' },
                  { source: 'MeQasa Spider', time: '4 hours ago', records: 420, status: 'success' },
                ].map((activity, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3">
                      {activity.status === 'success' ? (
                        <CheckCircle className="h-4 w-4 text-green-400" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-400" />
                      )}
                      <div>
                        <p className="text-sm font-medium">{activity.source}</p>
                        <p className="text-xs text-muted-foreground">{activity.time}</p>
                      </div>
                    </div>
                    <span className="text-sm font-mono">
                      {activity.records > 0 ? `+${formatNumber(activity.records)}` : '-'}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}

// Add useState import at the top
import { useState } from 'react'
