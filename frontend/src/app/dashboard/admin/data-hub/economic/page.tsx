'use client'

import { TerminalPanel, DataMetricCard, AnalyticsChart } from '@/components/ui/terminal'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Percent,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { economicApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useState, useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

const indicatorTypes = [
  { value: 'inflation_rate', label: 'Inflation Rate', unit: '%', color: 'yellow' },
  { value: 'exchange_rate_usd', label: 'USD/GHS Rate', unit: 'GHS', color: 'blue' },
  { value: 'interest_rate_policy', label: 'BoG Policy Rate', unit: '%', color: 'purple' },
  { value: 'gdp_growth', label: 'GDP Growth', unit: '%', color: 'green' },
]

export default function EconomicDataPage() {
  const queryClient = useQueryClient()
  const [selectedIndicator, setSelectedIndicator] = useState('inflation_rate')

  const { data: snapshot, isLoading: snapshotLoading } = useQuery({
    queryKey: ['economic-snapshot'],
    queryFn: () => economicApi.getSnapshot(),
  })

  const { data: indicatorHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['indicator-history', selectedIndicator],
    queryFn: () => economicApi.getIndicatorHistory(selectedIndicator, undefined, undefined, 30),
  })

  const seedMutation = useMutation({
    mutationFn: () => economicApi.seed(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['economic'] })
    },
  })

  const chartData = useMemo(() =>
    indicatorHistory?.data?.map((item) => ({
      date: new Date(item.effective_date).toLocaleDateString('en-GB', {
        month: 'short',
        day: 'numeric',
      }),
      value: parseFloat(item.value as any) || 0,
    })).reverse() || [],
    [indicatorHistory]
  )

  const currentIndicator = indicatorTypes.find((t) => t.value === selectedIndicator)

  const getChangeColor = (change: number | undefined) => {
    if (change === undefined) return 'text-muted-foreground'
    return change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pb-10">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-mono text-2xl text-amber-500 tracking-wider">ECONOMIC INDICATORS DASHBOARD</h1>
        <p className="font-mono text-[10px] text-muted-foreground mt-1">
          GHANA ECONOMIC DATA • BANK OF GHANA • REAL-TIME MARKET INDICATORS
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <DataMetricCard
          title="USD/GHS Rate"
          value={parseFloat(snapshot?.data?.exchange_rate_usd as any)?.toFixed(2) || '-'}
          subtitle="Exchange rate"
          icon={DollarSign}
          color="blue"
          status="live"
        />

        <DataMetricCard
          title="Inflation Rate"
          value={`${parseFloat(snapshot?.data?.inflation_rate as any)?.toFixed(1) || '-'}%`}
          subtitle="Year-over-year"
          icon={TrendingUp}
          color="yellow"
        />

        <DataMetricCard
          title="BoG Policy Rate"
          value={`${parseFloat(snapshot?.data?.interest_rate_policy as any)?.toFixed(1) || '-'}%`}
          subtitle="Monetary policy"
          icon={Percent}
          color="purple"
        />

        <DataMetricCard
          title="GDP Growth"
          value={`${parseFloat(snapshot?.data?.gdp_growth as any)?.toFixed(1) || '-'}%`}
          subtitle="Annual growth"
          trend={2.3}
          icon={Activity}
          color="green"
        />
      </div>

      {/* Historical Trends Chart */}
      <div className="mb-6">
        <TerminalPanel
          title="Historical Trends"
          action={
            <div className="flex items-center gap-2">
              <Select value={selectedIndicator} onValueChange={setSelectedIndicator}>
                <SelectTrigger className="w-48 bg-muted border-border font-mono text-xs">
                  <SelectValue placeholder="Select indicator" />
                </SelectTrigger>
                <SelectContent>
                  {indicatorTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
                className="p-2 bg-muted hover:bg-zinc-700 border border-border hover:border-amber-500 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn(
                  'w-4 h-4 text-muted-foreground',
                  seedMutation.isPending && 'animate-spin'
                )} />
              </button>
            </div>
          }
        >
          {historyLoading ? (
            <div className="h-80 flex items-center justify-center">
              <RefreshCw className="w-8 h-8 animate-spin text-zinc-700" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-80 flex items-center justify-center">
              <div className="text-center">
                <Activity className="w-12 h-12 mx-auto mb-4 text-zinc-700" />
                <p className="font-mono text-sm text-muted-foreground mb-4">No data available</p>
                <button
                  onClick={() => seedMutation.mutate()}
                  disabled={seedMutation.isPending}
                  className="px-4 py-2 bg-amber-500 text-foreground font-mono text-xs hover:bg-amber-400 transition-colors disabled:opacity-50"
                >
                  SEED DATA
                </button>
              </div>
            </div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#71717a"
                    fontSize={10}
                    fontFamily="monospace"
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#71717a"
                    fontSize={10}
                    fontFamily="monospace"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) =>
                      currentIndicator?.unit === '%' ? `${value}%` : value.toFixed(2)
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      border: '1px solid #27272a',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                    }}
                    formatter={(value: number) => [
                      `${value.toFixed(2)}${currentIndicator?.unit || ''}`,
                      currentIndicator?.label,
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    fill="url(#colorValue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </TerminalPanel>
      </div>

      {/* Additional Indicators Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Exchange Rates */}
        <TerminalPanel title="Exchange Rates">
          <div className="space-y-3">
            {[
              { label: 'USD/GHS', value: snapshot?.data?.exchange_rate_usd },
              { label: 'EUR/GHS', value: snapshot?.data?.exchange_rate_eur },
              { label: 'GBP/GHS', value: snapshot?.data?.exchange_rate_gbp },
            ].map((rate) => (
              <div key={rate.label} className="flex items-center justify-between p-3 bg-muted/30 border border-border">
                <span className="font-mono text-xs text-muted-foreground">{rate.label}</span>
                <span className="font-mono text-sm text-foreground">
                  {parseFloat(rate.value as any)?.toFixed(2) || '-'}
                </span>
              </div>
            ))}
          </div>
        </TerminalPanel>

        {/* Housing Affordability */}
        <TerminalPanel title="Housing Affordability">
          <div className="text-center p-8">
            <div className="text-4xl font-mono text-zinc-700 mb-2">-</div>
            <div className="font-mono text-[10px] text-muted-foreground">Affordability Index</div>
            <div className="font-mono text-[10px] text-muted-foreground mt-4">
              Requires property price and income data
            </div>
          </div>
        </TerminalPanel>

        {/* Data Source Info */}
        <TerminalPanel title="Data Source">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted/30 border border-border">
              <span className="font-mono text-xs text-muted-foreground">Last Updated</span>
              <span className="font-mono text-xs text-foreground">
                {snapshot?.data?.date
                  ? new Date(snapshot.data.date).toLocaleDateString('en-GB')
                  : 'Unknown'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/30 border border-border">
              <span className="font-mono text-xs text-muted-foreground">Primary Source</span>
              <span className="font-mono text-xs text-foreground">Bank of Ghana</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/30 border border-border">
              <span className="font-mono text-xs text-muted-foreground">Update Frequency</span>
              <span className="font-mono text-xs text-foreground">Daily</span>
            </div>
          </div>
        </TerminalPanel>
      </div>
    </div>
  )
}
