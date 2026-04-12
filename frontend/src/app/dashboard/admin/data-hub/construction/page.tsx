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
  HardHat,
  Search,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Package,
  Users,
  Calculator,
  ArrowUpRight,
  ArrowDownRight,
  MapPin,
  Settings,
} from 'lucide-react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { constructionApi, MaterialFilters, LaborFilters } from '@/lib/api'
import { RegionCode } from '@/types/data-hub'
import { formatCurrency, cn } from '@/lib/utils'
import { useState, useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

const regionOptions: { value: RegionCode | 'all'; label: string }[] = [
  { value: 'all', label: 'All Regions' },
  { value: 'greater_accra', label: 'Greater Accra' },
  { value: 'ashanti', label: 'Ashanti' },
  { value: 'western', label: 'Western' },
  { value: 'eastern', label: 'Eastern' },
  { value: 'central', label: 'Central' },
  { value: 'northern', label: 'Northern' },
]

export default function ConstructionCostsPage() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRegion, setSelectedRegion] = useState<string>('all')
  const [materialCategory, setMaterialCategory] = useState<string>('all')
  const [laborCategory, setLaborCategory] = useState<string>('all')
  const [activeTab, setActiveTab] = useState<'materials' | 'labor'>('materials')

  const materialFilters: MaterialFilters = {
    category: materialCategory !== 'all' ? materialCategory : undefined,
    region: selectedRegion !== 'all' ? (selectedRegion as RegionCode) : undefined,
  }

  const laborFilters: LaborFilters = {
    category: laborCategory !== 'all' ? laborCategory : undefined,
    region: selectedRegion !== 'all' ? (selectedRegion as RegionCode) : undefined,
  }

  const { data: materials, isLoading: materialsLoading } = useQuery({
    queryKey: ['construction-materials', materialFilters],
    queryFn: () => constructionApi.getMaterials(materialFilters),
  })

  const { data: laborRates, isLoading: laborLoading } = useQuery({
    queryKey: ['construction-labor', laborFilters],
    queryFn: () => constructionApi.getLaborRates(laborFilters),
  })

  const { data: index } = useQuery({
    queryKey: ['construction-index', selectedRegion],
    queryFn: () => constructionApi.getIndex(
      selectedRegion !== 'all' ? (selectedRegion as RegionCode) : undefined
    ),
  })

  const seedMutation = useMutation({
    mutationFn: () => constructionApi.seed(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['construction'] })
    },
  })

  const filteredMaterials = useMemo(() =>
    materials?.data?.filter((m) =>
      m.material_name.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [],
    [materials, searchQuery]
  )

  const topMaterials = useMemo(() =>
    [...(materials?.data || [])]
      .sort((a, b) => b.price_ghs - a.price_ghs)
      .slice(0, 10)
      .map((m) => ({
        name: m.material_name.length > 15 ? m.material_name.slice(0, 15) + '...' : m.material_name,
        price: m.price_ghs,
      })),
    [materials]
  )

  return (
    <div className="min-h-screen bg-black text-white p-4 pb-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-mono text-2xl text-amber-500 tracking-wider">CONSTRUCTION COSTS MONITOR</h1>
          <p className="font-mono text-[10px] text-zinc-500 mt-1">
            MATERIAL PRICES • LABOR RATES • REGIONAL COMPARISON • COST INDEX TRACKING
          </p>
        </div>
        <Link
          href="/dashboard/admin/data-hub/valuation-config"
          className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-700 hover:border-amber-500 transition-colors font-mono text-xs text-zinc-300 hover:text-amber-400 shrink-0"
        >
          <Settings className="w-4 h-4" />
          VALUATION CONFIG
        </Link>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <DataMetricCard
          title="Material Index"
          value={index?.data?.material_index != null ? Number(index.data.material_index).toFixed(1) : '-'}
          subtitle="Base: 100"
          icon={Package}
          color="blue"
        />

        <DataMetricCard
          title="Labor Index"
          value={index?.data?.labor_index != null ? Number(index.data.labor_index).toFixed(1) : '-'}
          subtitle="Base: 100"
          icon={Users}
          color="green"
        />

        <DataMetricCard
          title="Overall Index"
          value={index?.data?.overall_index != null ? Number(index.data.overall_index).toFixed(1) : '-'}
          subtitle="Combined metric"
          trend={2.3}
          icon={HardHat}
          color="purple"
        />

        <DataMetricCard
          title="Materials Tracked"
          value={materials?.count || 0}
          subtitle={`${laborRates?.count || 0} labor rates`}
          icon={Calculator}
          color="yellow"
        />
      </div>

      {/* Region Filter */}
      <div className="mb-6">
        <TerminalPanel title="Region & Controls">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-zinc-400">
              <MapPin className="w-4 h-4" />
              <span className="font-mono text-xs">REGION:</span>
            </div>
            <Select value={selectedRegion} onValueChange={setSelectedRegion}>
              <SelectTrigger className="w-48 bg-zinc-800 border-zinc-700 font-mono text-xs">
                <SelectValue placeholder="Select region" />
              </SelectTrigger>
              <SelectContent>
                {regionOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="px-4 py-2 bg-amber-500 text-white font-mono text-xs hover:bg-amber-400 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn(
                'w-4 h-4 inline mr-2',
                seedMutation.isPending && 'animate-spin'
              )} />
              REFRESH DATA
            </button>
          </div>
        </TerminalPanel>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="flex gap-1 mb-4">
          {(['materials', 'labor'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-2 font-mono text-xs transition-colors',
                activeTab === tab
                  ? 'bg-amber-500 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              )}
            >
              {tab.toUpperCase()} ({tab === 'materials' ? materials?.count || 0 : laborRates?.count || 0})
            </button>
          ))}
        </div>

        {activeTab === 'materials' ? (
          <div className="space-y-6">
            {/* Search & Filter */}
            <TerminalPanel title="Search Materials">
              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Search materials..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 text-white font-mono text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
                <Select value={materialCategory} onValueChange={setMaterialCategory}>
                  <SelectTrigger className="w-40 bg-zinc-800 border-zinc-700 font-mono text-xs">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="cement">Cement</SelectItem>
                    <SelectItem value="steel">Steel & Iron</SelectItem>
                    <SelectItem value="sand">Sand & Aggregates</SelectItem>
                    <SelectItem value="blocks">Blocks & Bricks</SelectItem>
                    <SelectItem value="roofing">Roofing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TerminalPanel>

            {/* Materials Table */}
            <TerminalPanel title={`Material Prices (${filteredMaterials.length})`}>
              {materialsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-16 bg-zinc-800/30 animate-pulse" />
                  ))}
                </div>
              ) : filteredMaterials.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-12 h-12 mx-auto mb-4 text-zinc-700" />
                  <p className="font-mono text-sm text-zinc-500">No materials found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredMaterials.map((material) => (
                    <div
                      key={material.id}
                      className="p-3 bg-zinc-800/30 border border-zinc-800 hover:border-zinc-700 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-sm text-white">{material.material_name}</span>
                            <span className="px-2 py-0.5 bg-zinc-700 text-zinc-400 font-mono text-[9px]">
                              {material.material_category}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 font-mono text-[10px] text-zinc-500">
                            <span>{material.unit}</span>
                            <span>•</span>
                            <span>{material.supplier_type || 'Retail'}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-lg text-white">{formatCurrency(material.price_ghs)}</div>
                          {material.price_change_percent !== undefined && material.price_change_percent !== null && (
                            <div className={cn(
                              'flex items-center gap-1 justify-end font-mono text-[10px]',
                              material.price_change_percent >= 0 ? 'text-red-400' : 'text-green-400'
                            )}>
                              {material.price_change_percent >= 0 ? (
                                <ArrowUpRight className="w-3 h-3" />
                              ) : (
                                <ArrowDownRight className="w-3 h-3" />
                              )}
                              <span>{Math.abs(Number(material.price_change_percent)).toFixed(1)}%</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TerminalPanel>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Labor Filter */}
            <TerminalPanel title="Filter Labor Rates">
              <div className="flex items-center gap-4">
                <Select value={laborCategory} onValueChange={setLaborCategory}>
                  <SelectTrigger className="w-40 bg-zinc-800 border-zinc-700 font-mono text-xs">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="masonry">Masonry</SelectItem>
                    <SelectItem value="carpentry">Carpentry</SelectItem>
                    <SelectItem value="plumbing">Plumbing</SelectItem>
                    <SelectItem value="electrical">Electrical</SelectItem>
                    <SelectItem value="painting">Painting</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TerminalPanel>

            {/* Labor Table */}
            <TerminalPanel title={`Labor Rates (${laborRates?.data?.length || 0})`}>
              {laborLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-16 bg-zinc-800/30 animate-pulse" />
                  ))}
                </div>
              ) : (laborRates?.data?.length || 0) === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 mx-auto mb-4 text-zinc-700" />
                  <p className="font-mono text-sm text-zinc-500">No labor rates found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {laborRates?.data?.map((rate) => (
                    <div
                      key={rate.id}
                      className="p-3 bg-zinc-800/30 border border-zinc-800 hover:border-zinc-700 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-sm text-white">{rate.labor_category}</span>
                            <span className={cn(
                              'px-2 py-0.5 border font-mono text-[9px]',
                              rate.skill_level === 'master' ? 'bg-purple-900/30 text-purple-400 border-purple-500/30' :
                                rate.skill_level === 'specialist' ? 'bg-blue-900/30 text-blue-400 border-blue-500/30' :
                                  'bg-zinc-700 text-zinc-400 border-zinc-600'
                            )}>
                              {rate.skill_level.toUpperCase()}
                            </span>
                          </div>
                          <div className="font-mono text-[10px] text-zinc-500">
                            {regionOptions.find((r) => r.value === rate.region)?.label || rate.region}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-lg text-white">
                            {formatCurrency(rate.rate_type === 'daily' ? rate.rate_ghs : rate.rate_ghs * 8)}
                          </div>
                          <div className="font-mono text-[10px] text-zinc-500">
                            {formatCurrency(rate.rate_type === 'hourly' ? rate.rate_ghs : rate.rate_ghs / 8)}/hr
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TerminalPanel>
          </div>
        )}
      </div>

      {/* Price Comparison Chart */}
      {topMaterials.length > 0 && (
        <TerminalPanel title="Top 10 Material Prices">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topMaterials} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal vertical={false} />
                <XAxis
                  type="number"
                  stroke="#71717a"
                  fontSize={10}
                  fontFamily="monospace"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `₵${value}`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="#71717a"
                  fontSize={10}
                  fontFamily="monospace"
                  tickLine={false}
                  axisLine={false}
                  width={120}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                  }}
                  formatter={(value: number) => [formatCurrency(value), 'Price']}
                />
                <Bar dataKey="price" radius={[0, 4, 4, 0]}>
                  {topMaterials.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={`hsl(${45 - index * 3} 91% 60%)`}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TerminalPanel>
      )}
    </div>
  )
}
