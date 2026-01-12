'use client'

import { Header, MetricCard } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Database,
  MapPin,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  ArrowUp,
  ArrowDown,
  Building,
  Map,
  BarChart3,
  FileText,
  RefreshCcw,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { dataQualityApi } from '@/lib/api'
import { formatNumber, formatRelativeTime } from '@/lib/utils'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts'

// Chart colors
const COLORS = ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#a855f7', '#06b6d4', '#f97316', '#ec4899']

// Evidence type labels
const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  listing: 'Active Listing',
  delisted: 'Delisted (Sold Indicator)',
  contributed: 'Verified Contribution',
  bank_collateral: 'Bank Collateral Data',
  unclassified: 'Unclassified',
}

export default function DataQualityDashboard() {
  const { data: stats, isLoading, isError, refetch } = useQuery({
    queryKey: ['data-quality-stats'],
    queryFn: () => dataQualityApi.getStats(),
    refetchInterval: 60000, // Refresh every minute
  })

  const { data: geocodingStats, isLoading: geocodingLoading } = useQuery({
    queryKey: ['geocoding-stats'],
    queryFn: () => dataQualityApi.getGeocodingStats(),
  })

  if (isError) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Data Quality Dashboard" description="Monitor property data coverage and quality" />
        <div className="flex-1 flex items-center justify-center">
          <Card className="p-6">
            <div className="flex items-center gap-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <div>
                <h3 className="font-semibold">Error Loading Data</h3>
                <p className="text-muted-foreground text-sm">Unable to fetch data quality statistics</p>
              </div>
              <Button onClick={() => refetch()}>Retry</Button>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  const overview = stats?.data?.overview
  const bySource = stats?.data?.by_source || []
  const evidenceDistribution = stats?.data?.evidence_distribution || []
  const propertyTypeDistribution = stats?.data?.property_type_distribution || []
  const regionDistribution = stats?.data?.region_distribution || []
  const weeklyTrends = stats?.data?.weekly_trends || []

  // Prepare chart data
  const sourceChartData = bySource.map(s => ({
    name: s.source || 'Unknown',
    total: s.total,
    geocoded: s.geocoded,
    withPrice: s.with_price,
  }))

  const evidenceChartData = evidenceDistribution.map(e => ({
    name: EVIDENCE_TYPE_LABELS[e.type] || e.type,
    value: e.count,
  }))

  const weeklyChartData = weeklyTrends.slice().reverse().map(w => ({
    week: new Date(w.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    properties: w.new_properties,
    geocoded: w.geocoded,
    withPrice: w.with_price,
  }))

  return (
    <div className="flex flex-col h-full">
      <Header 
        title="Data Quality Dashboard" 
        description="Monitor property data coverage and quality metrics"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCcw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Overview Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Total Properties"
              value={formatNumber(overview?.total_properties || 0)}
              subtitle="In database (last 12 months)"
              icon={Database}
              color="blue"
              isLoading={isLoading}
            />
            <MetricCard
              title="Geocoding Coverage"
              value={`${overview?.geocoding_coverage || 0}%`}
              subtitle={`${formatNumber(Math.round((overview?.total_properties || 0) * parseFloat(overview?.geocoding_coverage || '0') / 100))} geocoded`}
              icon={MapPin}
              color={parseFloat(overview?.geocoding_coverage || '0') >= 90 ? 'green' : parseFloat(overview?.geocoding_coverage || '0') >= 70 ? 'yellow' : 'red'}
              isLoading={isLoading}
            />
            <MetricCard
              title="Price Coverage"
              value={`${overview?.price_coverage || 0}%`}
              subtitle="Properties with price data"
              icon={DollarSign}
              color={parseFloat(overview?.price_coverage || '0') >= 90 ? 'green' : parseFloat(overview?.price_coverage || '0') >= 70 ? 'yellow' : 'red'}
              isLoading={isLoading}
            />
            <MetricCard
              title="Delisted Properties"
              value={formatNumber(overview?.delisted_count || 0)}
              subtitle="Potential sold indicators"
              icon={TrendingUp}
              color="purple"
              isLoading={isLoading}
            />
          </div>

          {/* Secondary Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Ghana GPS Codes</p>
                    <p className="text-2xl font-bold">{formatNumber(overview?.with_digital_address || 0)}</p>
                  </div>
                  <Map className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">With Size Data</p>
                    <p className="text-2xl font-bold">{formatNumber(overview?.with_size_data || 0)}</p>
                  </div>
                  <Building className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">With Images</p>
                    <p className="text-2xl font-bold">{formatNumber(overview?.with_images || 0)}</p>
                  </div>
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Completeness</p>
                    <p className="text-2xl font-bold">{((overview?.avg_completeness_score || 0) * 100).toFixed(0)}%</p>
                  </div>
                  <BarChart3 className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Weekly Trends */}
            <Card>
              <CardHeader>
                <CardTitle>Weekly Trends</CardTitle>
                <CardDescription>Properties added per week (last 12 weeks)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  {isLoading ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="animate-pulse bg-muted rounded h-full w-full" />
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={weeklyChartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="week" className="text-xs" />
                        <YAxis className="text-xs" />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))' 
                          }} 
                        />
                        <Legend />
                        <Line 
                          type="monotone" 
                          dataKey="properties" 
                          stroke="#3b82f6" 
                          strokeWidth={2}
                          name="New Properties"
                        />
                        <Line 
                          type="monotone" 
                          dataKey="geocoded" 
                          stroke="#22c55e" 
                          strokeWidth={2}
                          name="Geocoded"
                        />
                        <Line 
                          type="monotone" 
                          dataKey="withPrice" 
                          stroke="#eab308" 
                          strokeWidth={2}
                          name="With Price"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Evidence Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Evidence Type Distribution</CardTitle>
                <CardDescription>Classification of property evidence quality</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  {isLoading ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="animate-pulse bg-muted rounded h-full w-full" />
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={evidenceChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={2}
                          dataKey="value"
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                          labelLine={false}
                        >
                          {evidenceChartData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number) => formatNumber(value)}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))' 
                          }} 
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Source Quality Table */}
          <Card>
            <CardHeader>
              <CardTitle>Quality by Data Source</CardTitle>
              <CardDescription>Coverage metrics for each property source</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-medium">Source</th>
                      <th className="text-right py-3 px-4 font-medium">Total</th>
                      <th className="text-right py-3 px-4 font-medium">Geocoded</th>
                      <th className="text-right py-3 px-4 font-medium">With Price</th>
                      <th className="text-right py-3 px-4 font-medium">Delisted</th>
                      <th className="text-right py-3 px-4 font-medium">Avg Age (days)</th>
                      <th className="text-right py-3 px-4 font-medium">Completeness</th>
                      <th className="text-right py-3 px-4 font-medium">Last Scraped</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          {Array.from({ length: 8 }).map((_, j) => (
                            <td key={j} className="py-3 px-4">
                              <div className="h-4 bg-muted rounded animate-pulse" />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      bySource.map((source) => (
                        <tr key={source.source} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-4 font-medium">{source.source || 'Unknown'}</td>
                          <td className="text-right py-3 px-4">{formatNumber(source.total)}</td>
                          <td className="text-right py-3 px-4">
                            <div className="flex items-center justify-end gap-2">
                              <span>{formatNumber(source.geocoded)}</span>
                              <Badge 
                                variant={parseFloat(source.geocoding_pct) >= 90 ? 'default' : parseFloat(source.geocoding_pct) >= 70 ? 'secondary' : 'destructive'}
                                className="text-xs"
                              >
                                {source.geocoding_pct}%
                              </Badge>
                            </div>
                          </td>
                          <td className="text-right py-3 px-4">
                            <div className="flex items-center justify-end gap-2">
                              <span>{formatNumber(source.with_price)}</span>
                              <Badge 
                                variant={parseFloat(source.price_pct) >= 90 ? 'default' : parseFloat(source.price_pct) >= 70 ? 'secondary' : 'destructive'}
                                className="text-xs"
                              >
                                {source.price_pct}%
                              </Badge>
                            </div>
                          </td>
                          <td className="text-right py-3 px-4">{formatNumber(source.delisted)}</td>
                          <td className="text-right py-3 px-4">{source.avg_age_days?.toFixed(0) || 'N/A'}</td>
                          <td className="text-right py-3 px-4">
                            <div className="flex items-center justify-end gap-2">
                              <Progress 
                                value={(source.avg_completeness || 0) * 100} 
                                className="w-16 h-2" 
                              />
                              <span className="text-xs text-muted-foreground">
                                {((source.avg_completeness || 0) * 100).toFixed(0)}%
                              </span>
                            </div>
                          </td>
                          <td className="text-right py-3 px-4 text-muted-foreground">
                            {source.last_scraped ? formatRelativeTime(source.last_scraped) : 'Never'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Region Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By Region */}
            <Card>
              <CardHeader>
                <CardTitle>Coverage by Region</CardTitle>
                <CardDescription>Property distribution across Ghana regions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-4">
                        <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                        <div className="flex-1 h-2 bg-muted rounded animate-pulse" />
                        <div className="h-4 w-16 bg-muted rounded animate-pulse" />
                      </div>
                    ))
                  ) : (
                    regionDistribution.map((region) => (
                      <div key={region.region} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{region.region || 'Unknown'}</span>
                          <span className="text-muted-foreground">
                            {formatNumber(region.count)} properties
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Progress 
                            value={parseFloat(region.geocoding_pct)} 
                            className="h-2 flex-1" 
                          />
                          <span className="text-xs text-muted-foreground w-12 text-right">
                            {region.geocoding_pct}%
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Property Type Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Property Types</CardTitle>
                <CardDescription>Distribution by property category</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[400px]">
                  {isLoading ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="animate-pulse bg-muted rounded h-full w-full" />
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={propertyTypeDistribution.slice(0, 10)} 
                        layout="vertical"
                        margin={{ left: 100 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" className="text-xs" />
                        <YAxis 
                          dataKey="type" 
                          type="category" 
                          className="text-xs" 
                          width={90}
                          tick={{ fontSize: 11 }}
                        />
                        <Tooltip 
                          formatter={(value: number) => formatNumber(value)}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))' 
                          }} 
                        />
                        <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Geocoding Details */}
          {!geocodingLoading && geocodingStats?.data?.by_source && (
            <Card>
              <CardHeader>
                <CardTitle>Geocoding Method Breakdown</CardTitle>
                <CardDescription>How coordinates were obtained for each source</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium">Source</th>
                        <th className="text-right py-3 px-4 font-medium">Total</th>
                        <th className="text-right py-3 px-4 font-medium">Geocoded</th>
                        <th className="text-right py-3 px-4 font-medium">Via Ghana GPS</th>
                        <th className="text-right py-3 px-4 font-medium">Via API</th>
                        <th className="text-right py-3 px-4 font-medium">Original</th>
                        <th className="text-right py-3 px-4 font-medium">Has GPS Code</th>
                      </tr>
                    </thead>
                    <tbody>
                      {geocodingStats.data.by_source.map((source) => (
                        <tr key={source.source} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-4 font-medium">{source.source}</td>
                          <td className="text-right py-3 px-4">{formatNumber(source.total)}</td>
                          <td className="text-right py-3 px-4">
                            <Badge variant={parseFloat(source.geocoding_pct) >= 90 ? 'default' : 'secondary'}>
                              {source.geocoding_pct}%
                            </Badge>
                          </td>
                          <td className="text-right py-3 px-4">{formatNumber(source.geocoded_via_gps)}</td>
                          <td className="text-right py-3 px-4">{formatNumber(source.geocoded_via_api)}</td>
                          <td className="text-right py-3 px-4">{formatNumber(source.original_coords)}</td>
                          <td className="text-right py-3 px-4">{formatNumber(source.with_gps_code)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
