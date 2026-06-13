'use client'

import { TerminalPanel, DataMetricCard } from '@/components/ui/terminal'
import {
  Layers,
  CheckCircle,
  Clock,
  FileText,
  Database,
  ArrowRight,
  Upload,
  RefreshCw,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { dataSourcesApi, queuesApi } from '@/lib/api'
import { formatNumber } from '@/lib/utils'
import { useState } from 'react'
import { DataIngestionPanel } from '@/components/data-hub/DataIngestionPanel'
import { PullIntegrationsPanel } from '@/components/data-hub/PullIntegrationsPanel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function TierIngestionPage() {
  const [viewMode, setViewMode] = useState<'upload' | 'pull'>('upload')

  const { data: sourceStats } = useQuery({
    queryKey: ['data-sources-stats'],
    queryFn: () => dataSourcesApi.getStatsByTier(),
  })

  const { data: queueStats } = useQuery({
    queryKey: ['queue-stats'],
    queryFn: () => queuesApi.getStats(),
  })

  const totalRecords = sourceStats?.data?.reduce((acc, s) => acc + s.total_records, 0) || 0
  const totalSources = sourceStats?.data?.reduce((acc, s) => acc + s.total, 0) || 0
  const activeSources = sourceStats?.data?.reduce((acc, s) => acc + s.active, 0) || 0

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pb-10">
      {/* Header */}
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="font-mono text-2xl text-amber-500 tracking-wider">TIER INGESTION CONTROL</h1>
          <p className="font-mono text-[10px] text-muted-foreground mt-1">
            5-TIER DATA ARCHITECTURE • SOURCE MANAGEMENT • PIPELINE ORCHESTRATION
          </p>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <DataMetricCard
          title="Total Records"
          value={formatNumber(totalRecords)}
          subtitle="Across all tiers"
          icon={Database}
          color="blue"
        />

        <DataMetricCard
          title="Active Sources"
          value={activeSources}
          subtitle={`of ${totalSources} total`}
          icon={CheckCircle}
          color="green"
        />

        <DataMetricCard
          title="Pending Jobs"
          value={queueStats?.data?.total_pending || 0}
          subtitle="In queue"
          icon={Clock}
          color="amber"
        />

        <DataMetricCard
          title="Data Quality"
          value="94.2%"
          subtitle="Validation pass rate"
          trend={1.5}
          icon={FileText}
          color="purple"
        />
      </div>

      {/* View Switcher */}
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="mb-6">
        <TabsList className="bg-card border-border">
          <TabsTrigger value="upload" className="data-[state=active]:bg-amber-500 data-[state=active]:text-foreground">
            DATA UPLOADS (TIERS 1-4)
          </TabsTrigger>
          <TabsTrigger value="pull" className="data-[state=active]:bg-amber-500 data-[state=active]:text-foreground">
            PARTNER API PULLS
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="mt-6">
          <DataIngestionPanel />
        </TabsContent>

        <TabsContent value="pull" className="mt-6">
          <PullIntegrationsPanel />
        </TabsContent>
      </Tabs>

      {/* Data Flow Diagram (Keep the aesthetic) */}
      <div className="mb-8 border-t border-border pt-8">
        <TerminalPanel title="Data Ingestion Pipeline">
          <div className="flex items-center justify-between gap-4 overflow-x-auto py-4">
            <div className="flex flex-col items-center gap-2 min-w-[120px]">
              <div className="w-16 h-16 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Layers className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="font-mono text-xs text-foreground">SOURCES</span>
              <span className="font-mono text-[9px] text-muted-foreground">5 TIERS</span>
            </div>

            <ArrowRight className="w-6 h-6 text-zinc-700 shrink-0" />

            <div className="flex flex-col items-center gap-2 min-w-[120px]">
              <div className="w-16 h-16 rounded-xl bg-green-500/10 flex items-center justify-center">
                <Upload className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <span className="font-mono text-xs text-foreground">EXTRACT</span>
              <span className="font-mono text-[9px] text-muted-foreground">API, SFTP, PDF</span>
            </div>

            <ArrowRight className="w-6 h-6 text-zinc-700 shrink-0" />

            <div className="flex flex-col items-center gap-2 min-w-[120px]">
              <div className="w-16 h-16 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                <RefreshCw className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
              </div>
              <span className="font-mono text-xs text-foreground">TRANSFORM</span>
              <span className="font-mono text-[9px] text-muted-foreground">PDF PARSE, CLEAN</span>
            </div>

            <ArrowRight className="w-6 h-6 text-zinc-700 shrink-0" />

            <div className="flex flex-col items-center gap-2 min-w-[120px]">
              <div className="w-16 h-16 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <Database className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              </div>
              <span className="font-mono text-xs text-foreground">LOAD</span>
              <span className="font-mono text-[9px] text-muted-foreground">PROPERTIES DB</span>
            </div>
          </div>
        </TerminalPanel>
      </div>
    </div>
  )
}
