'use client'

import { Header, MetricCard } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { constructionApi, MaterialFilters, LaborFilters } from '@/lib/api'
import { MaterialPrice, LaborRate, RegionCode } from '@/types/data-hub'
import { formatCurrency, formatNumber, cn, getTierLabel } from '@/lib/utils'
import { useState } from 'react'
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
  { value: 'upper_east', label: 'Upper East' },
  { value: 'upper_west', label: 'Upper West' },
  { value: 'volta', label: 'Volta' },
  { value: 'bono', label: 'Bono' },
]

const materialCategories = [
  { value: 'all', label: 'All Categories' },
  { value: 'cement', label: 'Cement' },
  { value: 'steel', label: 'Steel & Iron' },
  { value: 'sand', label: 'Sand & Aggregates' },
  { value: 'blocks', label: 'Blocks & Bricks' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'finishing', label: 'Finishing' },
]

const laborCategories = [
  { value: 'all', label: 'All Categories' },
  { value: 'masonry', label: 'Masonry' },
  { value: 'carpentry', label: 'Carpentry' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'painting', label: 'Painting' },
  { value: 'tiling', label: 'Tiling' },
  { value: 'roofing', label: 'Roofing' },
]

const skillLevels = [
  { value: 'all', label: 'All Levels' },
  { value: 'apprentice', label: 'Apprentice' },
  { value: 'journeyman', label: 'Journeyman' },
  { value: 'master', label: 'Master' },
  { value: 'specialist', label: 'Specialist' },
]

export default function ConstructionCostsPage() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRegion, setSelectedRegion] = useState<string>('all')
  const [materialCategory, setMaterialCategory] = useState<string>('all')
  const [laborCategory, setLaborCategory] = useState<string>('all')
  const [skillLevel, setSkillLevel] = useState<string>('all')

  const materialFilters: MaterialFilters = {
    category: materialCategory !== 'all' ? materialCategory : undefined,
    region: selectedRegion !== 'all' ? (selectedRegion as RegionCode) : undefined,
  }

  const laborFilters: LaborFilters = {
    category: laborCategory !== 'all' ? laborCategory : undefined,
    skill_level: skillLevel !== 'all' ? (skillLevel as 'apprentice' | 'journeyman' | 'master' | 'specialist') : undefined,
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

  const { data: index, isLoading: indexLoading } = useQuery({
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

  // Filter materials by search
  const filteredMaterials = materials?.data?.filter((m) =>
    m.material_name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || []

  // Top 10 materials for chart
  const topMaterials = [...(materials?.data || [])]
    .sort((a, b) => b.price_ghs - a.price_ghs)
    .slice(0, 10)

  const chartData = topMaterials.map((m) => ({
    name: m.material_name.length > 15 ? m.material_name.slice(0, 15) + '...' : m.material_name,
    price: m.price_ghs,
    change: m.price_change_percent || 0,
  }))

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Construction Costs"
        description="Material prices and labor rates across Ghana"
      />

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Construction Index */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard
              title="Material Index"
              value={index?.data?.material_index?.toFixed(1) || '-'}
              subtitle="Base: 100"
              icon={Package}
              color="blue"
              isLoading={indexLoading}
            />
            <MetricCard
              title="Labor Index"
              value={index?.data?.labor_index?.toFixed(1) || '-'}
              subtitle="Base: 100"
              icon={Users}
              color="green"
              isLoading={indexLoading}
            />
            <MetricCard
              title="Overall Index"
              value={index?.data?.overall_index?.toFixed(1) || '-'}
              subtitle="Combined metric"
              icon={HardHat}
              color="purple"
              isLoading={indexLoading}
            />
            <MetricCard
              title="Materials Tracked"
              value={materials?.count || 0}
              subtitle={`${laborRates?.count || 0} labor rates`}
              icon={Calculator}
              color="yellow"
              isLoading={materialsLoading}
            />
          </div>

          {/* Region Filter */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span className="text-sm">Region:</span>
                </div>
                <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                  <SelectTrigger className="w-48">
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
                <Button
                  variant="outline"
                  onClick={() => seedMutation.mutate()}
                  disabled={seedMutation.isPending}
                >
                  <RefreshCw className={cn(
                    'h-4 w-4 mr-2',
                    seedMutation.isPending && 'animate-spin'
                  )} />
                  Refresh Data
                </Button>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="materials" className="space-y-4">
            <TabsList>
              <TabsTrigger value="materials">
                Material Prices
                <Badge variant="secondary" className="ml-2">
                  {materials?.count || 0}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="labor">
                Labor Rates
                <Badge variant="secondary" className="ml-2">
                  {laborRates?.count || 0}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="comparison">Price Comparison</TabsTrigger>
            </TabsList>

            {/* Materials Tab */}
            <TabsContent value="materials" className="space-y-4">
              {/* Filters */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex gap-4 items-center">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search materials..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <Select value={materialCategory} onValueChange={setMaterialCategory}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        {materialCategories.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Materials Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">Material Prices</CardTitle>
                </CardHeader>
                <CardContent>
                  {materialsLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="flex items-center gap-4">
                          <Skeleton className="h-10 w-10 rounded" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24" />
                          </div>
                          <Skeleton className="h-6 w-20" />
                        </div>
                      ))}
                    </div>
                  ) : filteredMaterials.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium">No materials found</p>
                      <p className="text-sm">Try adjusting your filters or seed data</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Material</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Unit</TableHead>
                          <TableHead>Price (GHS)</TableHead>
                          <TableHead>Change</TableHead>
                          <TableHead>Supplier</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredMaterials.map((material) => (
                          <TableRow key={material.id}>
                            <TableCell>
                              <span className="font-medium">{material.material_name}</span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{material.category}</Badge>
                            </TableCell>
                            <TableCell>
                              <span className="text-muted-foreground">{material.unit}</span>
                            </TableCell>
                            <TableCell>
                              <span className="font-mono font-medium">
                                {formatCurrency(material.price_ghs)}
                              </span>
                            </TableCell>
                            <TableCell>
                              {material.price_change_percent !== undefined && (
                                <div className={cn(
                                  'flex items-center gap-1',
                                  material.price_change_percent >= 0 ? 'text-red-400' : 'text-green-400'
                                )}>
                                  {material.price_change_percent >= 0 ? (
                                    <ArrowUpRight className="h-4 w-4" />
                                  ) : (
                                    <ArrowDownRight className="h-4 w-4" />
                                  )}
                                  <span className="text-sm">
                                    {Math.abs(material.price_change_percent).toFixed(1)}%
                                  </span>
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground">
                                {material.supplier_type || '-'}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Labor Tab */}
            <TabsContent value="labor" className="space-y-4">
              {/* Filters */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex gap-4 items-center">
                    <Select value={laborCategory} onValueChange={setLaborCategory}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        {laborCategories.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={skillLevel} onValueChange={setSkillLevel}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Skill Level" />
                      </SelectTrigger>
                      <SelectContent>
                        {skillLevels.map((level) => (
                          <SelectItem key={level.value} value={level.value}>
                            {level.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Labor Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">Labor Rates</CardTitle>
                </CardHeader>
                <CardContent>
                  {laborLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="flex items-center gap-4">
                          <Skeleton className="h-10 w-10 rounded" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24" />
                          </div>
                          <Skeleton className="h-6 w-20" />
                        </div>
                      ))}
                    </div>
                  ) : (laborRates?.data?.length || 0) === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium">No labor rates found</p>
                      <p className="text-sm">Try adjusting your filters or seed data</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Trade</TableHead>
                          <TableHead>Skill Level</TableHead>
                          <TableHead>Daily Rate</TableHead>
                          <TableHead>Hourly Rate</TableHead>
                          <TableHead>Region</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {laborRates?.data?.map((rate) => (
                          <TableRow key={rate.id}>
                            <TableCell>
                              <span className="font-medium">{rate.trade_name}</span>
                            </TableCell>
                            <TableCell>
                              <Badge variant={
                                rate.skill_level === 'master' ? 'default' :
                                rate.skill_level === 'specialist' ? 'info' :
                                rate.skill_level === 'journeyman' ? 'secondary' : 'outline'
                              }>
                                {rate.skill_level}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className="font-mono font-medium">
                                {formatCurrency(rate.daily_rate_ghs)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="font-mono text-muted-foreground">
                                {formatCurrency(rate.hourly_rate_ghs || rate.daily_rate_ghs / 8)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground">
                                {regionOptions.find((r) => r.value === rate.region)?.label || rate.region}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Comparison Tab */}
            <TabsContent value="comparison" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">Top 10 Material Prices</CardTitle>
                </CardHeader>
                <CardContent>
                  {materialsLoading ? (
                    <div className="h-80 flex items-center justify-center">
                      <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : chartData.length === 0 ? (
                    <div className="h-80 flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No data available</p>
                      </div>
                    </div>
                  ) : (
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} layout="vertical">
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="hsl(var(--border))"
                            horizontal={true}
                            vertical={false}
                          />
                          <XAxis
                            type="number"
                            stroke="hsl(var(--muted-foreground))"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => `₵${formatNumber(value)}`}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            stroke="hsl(var(--muted-foreground))"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            width={120}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'hsl(var(--card))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px',
                            }}
                            formatter={(value: number) => [formatCurrency(value), 'Price']}
                          />
                          <Bar dataKey="price" radius={[0, 4, 4, 0]}>
                            {chartData.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={`hsl(217.2 91.2% ${59.8 - index * 3}%)`}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  )
}
