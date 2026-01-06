'use client'

import { Header, MetricCard } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  TrendingUp,
  TrendingDown,
  DollarSign,
  Percent,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  BarChart3,
  LineChart,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { economicApi } from '@/lib/api'
import { formatNumber, formatCurrency, cn } from '@/lib/utils'
import { useState } from 'react'
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts'

const indicatorTypes = [
  { value: 'inflation_rate', label: 'Inflation Rate', unit: '%' },
  { value: 'exchange_rate_usd', label: 'USD/GHS Rate', unit: 'GHS' },
  { value: 'interest_rate_policy', label: 'BoG Policy Rate', unit: '%' },
  { value: 'gdp_growth', label: 'GDP Growth', unit: '%' },
  { value: 'unemployment_rate', label: 'Unemployment', unit: '%' },
  { value: 'construction_pmi', label: 'Construction PMI', unit: '' },
]

function IndicatorCard({
  title,
  value,
  change,
  unit,
  icon: Icon,
  color,
  isLoading,
}: {
  title: string
  value: number | undefined
  change?: number
  unit: string
  icon: typeof TrendingUp
  color: string
  isLoading?: boolean
}) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-10 w-10 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    )
  }

  const isPositive = change !== undefined ? change >= 0 : true

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-2xl font-bold">
                {value?.toFixed(unit === '%' ? 1 : 2) || '-'}
                <span className="text-base font-normal text-muted-foreground ml-1">
                  {unit}
                </span>
              </p>
            </div>
            {change !== undefined && (
              <div className={cn(
                'flex items-center gap-1 mt-2 text-sm',
                isPositive ? 'text-green-400' : 'text-red-400'
              )}>
                {isPositive ? (
                  <ArrowUpRight className="h-4 w-4" />
                ) : (
                  <ArrowDownRight className="h-4 w-4" />
                )}
                <span>{Math.abs(change).toFixed(2)}%</span>
                <span className="text-muted-foreground">vs last month</span>
              </div>
            )}
          </div>
          <div className={cn('rounded-lg p-2.5', color)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

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

  // Transform history data for chart
  const chartData = indicatorHistory?.data?.map((item) => ({
    date: new Date(item.effective_date).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    }),
    value: parseFloat(item.value as any) || 0,
  })).reverse() || []

  const currentIndicator = indicatorTypes.find((t) => t.value === selectedIndicator)

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Economic Indicators"
        description="Ghana economic data and market indicators"
      />

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <IndicatorCard
              title="USD/GHS Exchange Rate"
              value={parseFloat(snapshot?.data?.exchange_rate_usd as any) || undefined}
              unit="GHS"
              icon={DollarSign}
              color="bg-blue-500/10 text-blue-400"
              isLoading={snapshotLoading}
            />
            <IndicatorCard
              title="Inflation Rate"
              value={parseFloat(snapshot?.data?.inflation_rate as any) || undefined}
              unit="%"
              icon={TrendingUp}
              color="bg-yellow-500/10 text-yellow-400"
              isLoading={snapshotLoading}
            />
            <IndicatorCard
              title="BoG Policy Rate"
              value={parseFloat(snapshot?.data?.interest_rate_policy as any) || undefined}
              unit="%"
              icon={Percent}
              color="bg-purple-500/10 text-purple-400"
              isLoading={snapshotLoading}
            />
            <IndicatorCard
              title="GDP Growth"
              value={parseFloat(snapshot?.data?.gdp_growth as any) || undefined}
              unit="%"
              icon={Activity}
              color="bg-green-500/10 text-green-400"
              isLoading={snapshotLoading}
            />
          </div>

          {/* Chart Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <LineChart className="h-5 w-5" />
                  Historical Trends
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={selectedIndicator} onValueChange={setSelectedIndicator}>
                    <SelectTrigger className="w-48">
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
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => seedMutation.mutate()}
                    disabled={seedMutation.isPending}
                  >
                    <RefreshCw className={cn(
                      'h-4 w-4',
                      seedMutation.isPending && 'animate-spin'
                    )} />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="h-80 flex items-center justify-center">
                  <div className="text-center">
                    <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Loading chart data...</p>
                  </div>
                </div>
              ) : chartData.length === 0 ? (
                <div className="h-80 flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">No data available</p>
                    <p className="text-sm">Click refresh to seed economic data</p>
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => seedMutation.mutate()}
                      disabled={seedMutation.isPending}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Seed Data
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(217.2 91.2% 59.8%)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(217.2 91.2% 59.8%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border))"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="date"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) =>
                          currentIndicator?.unit === '%'
                            ? `${value}%`
                            : Number(value).toFixed(2)
                        }
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        labelStyle={{ color: 'hsl(var(--foreground))' }}
                        formatter={(value: number) => [
                          `${Number(value).toFixed(2)}${currentIndicator?.unit || ''}`,
                          currentIndicator?.label,
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="hsl(217.2 91.2% 59.8%)"
                        strokeWidth={2}
                        fill="url(#colorValue)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Additional Indicators */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Exchange Rates */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Exchange Rates</CardTitle>
              </CardHeader>
              <CardContent>
                {snapshotLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex justify-between">
                        <Skeleton className="h-5 w-20" />
                        <Skeleton className="h-5 w-24" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">USD/GHS</span>
                      <span className="font-mono font-medium">
                        {parseFloat(snapshot?.data?.exchange_rate_usd as any)?.toFixed(2) || '-'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">EUR/GHS</span>
                      <span className="font-mono font-medium">
                        {parseFloat(snapshot?.data?.exchange_rate_eur as any)?.toFixed(2) || '-'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">GBP/GHS</span>
                      <span className="font-mono font-medium">
                        {parseFloat(snapshot?.data?.exchange_rate_gbp as any)?.toFixed(2) || '-'}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Housing Affordability */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Housing Affordability</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-center p-4 rounded-lg bg-muted/50">
                    <p className="text-3xl font-bold text-muted-foreground">-</p>
                    <p className="text-sm text-muted-foreground">Affordability Index</p>
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    Requires property price and income data
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Data Freshness */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Data Source</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Last Updated</span>
                    <Badge variant="outline">
                      {snapshot?.data?.date
                        ? new Date(snapshot.data.date).toLocaleDateString()
                        : 'Unknown'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Primary Source</span>
                    <span className="text-sm">Bank of Ghana</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Update Frequency</span>
                    <span className="text-sm">Daily</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
