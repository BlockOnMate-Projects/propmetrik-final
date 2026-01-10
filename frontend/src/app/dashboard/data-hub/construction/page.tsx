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
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from 'recharts'

const regionOptions: { value: RegionCode | 'all'; label: string }[] = [
  { value: 'all', label: 'All Regions' },
  { value: 'greater_accra', label: 'Greater Accra' },
  { value: 'eastern', label: 'Eastern' },
  { value: 'kumasi_metro', label: 'Kumasi Metro' },
  { value: 'western_cluster', label: 'Western Cluster' },
  { value: 'northern_cluster', label: 'Northern Cluster' },
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

const laborCategoryFilters = [
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
  
  // Form states
  const [materialForm, setMaterialForm] = useState({
    material_name: '',
    material_category: undefined as string | undefined,
    unit: undefined as string | undefined,
    price_ghs: '',
    supplier_name: '',
    brand: '',
    is_verified: false
  })
  
  const [laborForm, setLaborForm] = useState({
    role_name: '',
    labor_category: undefined as string | undefined,
    skill_level: 'journeyman' as const,
    daily_rate_ghs: '',
    is_verified: false
  })
  
  // Mutations
  const createMaterialMutation = useMutation({
    mutationFn: constructionApi.createMaterialPrice,
    onSuccess: () => {
      toast.success('Material price added successfully!')
      queryClient.invalidateQueries({ queryKey: ['construction-materials'] })
      queryClient.invalidateQueries({ queryKey: ['construction-material-names'] })
      setMaterialForm({
        material_name: '',
        material_category: undefined,
        unit: undefined,
        price_ghs: '',
        supplier_name: '',
        brand: '',
        is_verified: false
      })
    },
    onError: (error) => {
      toast.error('Failed to add material price')
      console.error('Material creation error:', error)
    }
  })
  
  const createLaborMutation = useMutation({
    mutationFn: constructionApi.createLaborRate,
    onSuccess: () => {
      toast.success('Labor rate added successfully!')
      queryClient.invalidateQueries({ queryKey: ['construction-labor'] })
      queryClient.invalidateQueries({ queryKey: ['construction-labor-roles'] })
      setLaborForm({
        role_name: '',
        labor_category: undefined,
        skill_level: 'journeyman',
        daily_rate_ghs: '',
        is_verified: false
      })
    },
    onError: (error) => {
      toast.error('Failed to add labor rate')
      console.error('Labor creation error:', error)
    }
  })
  
  // Form handlers
  const handleMaterialSubmit = () => {
    if (!materialForm.material_name || !materialForm.material_category || !materialForm.price_ghs) {
      toast.error('Please fill in all required fields')
      return
    }
    
    createMaterialMutation.mutate({
      material_name: materialForm.material_name,
      material_category: materialForm.material_category!,
      unit: materialForm.unit || 'piece',
      price_ghs: parseFloat(materialForm.price_ghs),
      supplier_name: materialForm.supplier_name,
      brand: materialForm.brand,
      region: 'greater_accra',
      supplier_type: 'retail',
      is_verified: materialForm.is_verified,
      survey_date: new Date().toISOString()
    })
  }
  
  const handleLaborSubmit = () => {
    if (!laborForm.role_name || !laborForm.labor_category || !laborForm.daily_rate_ghs) {
      toast.error('Please fill in all required fields')
      return
    }
    
    createLaborMutation.mutate({
      labor_category: laborForm.labor_category!,
      skill_level: laborForm.skill_level,
      rate_ghs: parseFloat(laborForm.daily_rate_ghs),
      rate_type: 'daily',
      region: 'greater_accra',
      source: 'manual_entry',
      is_verified: laborForm.is_verified
    })
  }
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRegion, setSelectedRegion] = useState<string>('all')
  const [materialsTrendsRegion, setMaterialsTrendsRegion] = useState<string>('all')
  const [laborTrendsRegion, setLaborTrendsRegion] = useState<string>('all')
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

  const { data: indexHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['construction-index-history', selectedRegion],
    queryFn: () => constructionApi.getIndexHistory(
      selectedRegion !== 'all' ? (selectedRegion as RegionCode) : undefined,
      12 // Last 12 months
    ),
  })

  const { data: weeklyMaterialTrends, isLoading: materialTrendsLoading } = useQuery({
    queryKey: ['construction-weekly-material-trends'],
    queryFn: () => constructionApi.getWeeklyMaterialTrends(12), // Last 12 weeks
  })

  const { data: weeklyLaborTrends, isLoading: laborTrendsLoading } = useQuery({
    queryKey: ['construction-weekly-labor-trends'],
    queryFn: () => constructionApi.getWeeklyLaborTrends(12), // Last 12 weeks
  })

  const { data: materialNames } = useQuery({
    queryKey: ['construction-material-names'],
    queryFn: () => constructionApi.getMaterialNames(),
  })

  const { data: materialCategoriesApi } = useQuery({
    queryKey: ['construction-material-categories'],
    queryFn: () => constructionApi.getMaterialCategories(),
  })

  const { data: laborRoles } = useQuery({
    queryKey: ['construction-labor-roles'],
    queryFn: () => constructionApi.getLaborRoles(),
  })

  const { data: laborCategories } = useQuery({
    queryKey: ['construction-labor-categories'],
    queryFn: () => constructionApi.getLaborCategories(),
  })

  const { data: regionalMaterialComparison, isLoading: materialComparisonLoading } = useQuery({
    queryKey: ['construction-regional-material-comparison'],
    queryFn: () => constructionApi.getRegionalMaterialComparison(10),
  })

  const { data: regionalLaborComparison, isLoading: laborComparisonLoading } = useQuery({
    queryKey: ['construction-regional-labor-comparison'],
    queryFn: () => constructionApi.getRegionalLaborComparison(8),
  })

  const selectedRegionCode = selectedRegion !== 'all' ? (selectedRegion as RegionCode) : undefined
  const materialsTrendsRegionCode = materialsTrendsRegion !== 'all' ? (materialsTrendsRegion as RegionCode) : undefined
  const laborTrendsRegionCode = laborTrendsRegion !== 'all' ? (laborTrendsRegion as RegionCode) : undefined

  const { data: weeklyMaterialCategoryAverages, isLoading: weeklyMaterialCategoryLoading } = useQuery({
    queryKey: ['construction-weekly-material-category-averages', materialsTrendsRegionCode],
    queryFn: () => constructionApi.getWeeklyMaterialCategoryAverages(materialsTrendsRegionCode, 2),
  })

  const { data: weeklyLaborCategoryAverages, isLoading: weeklyLaborCategoryLoading } = useQuery({
    queryKey: ['construction-weekly-labor-category-averages', laborTrendsRegionCode],
    queryFn: () => constructionApi.getWeeklyLaborCategoryAverages(laborTrendsRegionCode, 2),
  })

  const { data: materialWeights, isLoading: weightsLoading } = useQuery({
    queryKey: ['construction-material-category-weights'],
    queryFn: () => constructionApi.getMaterialCategoryWeights(),
  })

  // Cost parameter queries
  const { data: qualityMultipliers, isLoading: qualityLoading } = useQuery({
    queryKey: ['construction-quality-multipliers'],
    queryFn: () => constructionApi.getQualityMultipliers(),
  })

  const { data: regionMultipliers, isLoading: regionMultLoading } = useQuery({
    queryKey: ['construction-region-multipliers'],
    queryFn: () => constructionApi.getRegionMultipliers(),
  })

  const { data: baseCosts, isLoading: baseCostsLoading } = useQuery({
    queryKey: ['construction-base-costs'],
    queryFn: () => constructionApi.getBaseCosts(),
  })

  const { data: costBreakdown, isLoading: breakdownLoading } = useQuery({
    queryKey: ['construction-cost-breakdown'],
    queryFn: () => constructionApi.getCostBreakdown(),
  })

  const [editableWeights, setEditableWeights] = useState<Record<string, number>>({})
  const [editableQualityMult, setEditableQualityMult] = useState<Record<string, number>>({})
  const [editableRegionMult, setEditableRegionMult] = useState<Record<string, number>>({})
  const [editableBaseCosts, setEditableBaseCosts] = useState<Record<string, number>>({})
  const [editableBreakdown, setEditableBreakdown] = useState<Record<string, number>>({})

  // Hydrate local edit state when weights load (only once)
  useEffect(() => {
    if (!materialWeights?.data) return
    setEditableWeights((prev) => {
      if (Object.keys(prev).length > 0) return prev
      const initial: Record<string, number> = {}
      for (const w of materialWeights.data) {
        initial[w.category] = Math.round(w.weight * 1000) / 10
      }
      return initial
    })
  }, [materialWeights?.data])

  // Hydrate quality multipliers
  useEffect(() => {
    if (!qualityMultipliers?.data) return
    setEditableQualityMult((prev) => {
      if (Object.keys(prev).length > 0) return prev
      const initial: Record<string, number> = {}
      for (const m of qualityMultipliers.data) {
        initial[m.quality_level] = m.multiplier
      }
      return initial
    })
  }, [qualityMultipliers?.data])

  // Hydrate region multipliers
  useEffect(() => {
    if (!regionMultipliers?.data) return
    setEditableRegionMult((prev) => {
      if (Object.keys(prev).length > 0) return prev
      const initial: Record<string, number> = {}
      for (const m of regionMultipliers.data) {
        initial[m.region] = m.multiplier
      }
      return initial
    })
  }, [regionMultipliers?.data])

  // Hydrate base costs
  useEffect(() => {
    if (!baseCosts?.data) return
    setEditableBaseCosts((prev) => {
      if (Object.keys(prev).length > 0) return prev
      const initial: Record<string, number> = {}
      for (const c of baseCosts.data) {
        const key = `${c.property_type}_${c.quality_level}`
        initial[key] = c.cost_ghs
      }
      return initial
    })
  }, [baseCosts?.data])

  // Hydrate cost breakdown
  useEffect(() => {
    if (!costBreakdown?.data) return
    setEditableBreakdown((prev) => {
      if (Object.keys(prev).length > 0) return prev
      const initial: Record<string, number> = {}
      for (const b of costBreakdown.data) {
        initial[b.category] = Math.round(b.percentage * 1000) / 10
      }
      return initial
    })
  }, [costBreakdown?.data])

  const saveWeightsMutation = useMutation({
    mutationFn: async () => {
      const weightsArray = Object.entries(editableWeights).map(([category, pct]) => ({
        category,
        weight: (Number(pct) || 0) / 100,
      }))

      const sum = weightsArray.reduce((acc, w) => acc + w.weight, 0)
      if (Math.abs(sum - 1) > 0.001) {
        throw new Error(`Weights must sum to 100% (currently ${(sum * 100).toFixed(1)}%)`)
      }
      return constructionApi.updateMaterialCategoryWeights(weightsArray)
    },
    onSuccess: async () => {
      toast.success('Weights updated')
      await queryClient.invalidateQueries({ queryKey: ['construction-material-category-weights'] })
      await queryClient.invalidateQueries({ queryKey: ['construction-index', selectedRegion] })
      await queryClient.invalidateQueries({ queryKey: ['construction-index-history', selectedRegion] })
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Failed to update weights')
    },
  })

  // Save quality multipliers
  const saveQualityMultMutation = useMutation({
    mutationFn: async () => {
      const arr = Object.entries(editableQualityMult).map(([quality_level, multiplier]) => ({
        quality_level,
        multiplier: Number(multiplier) || 0,
      }))
      return constructionApi.updateQualityMultipliers(arr)
    },
    onSuccess: async () => {
      toast.success('Quality multipliers updated')
      await queryClient.invalidateQueries({ queryKey: ['construction-quality-multipliers'] })
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Failed to update quality multipliers')
    },
  })

  // Save region multipliers
  const saveRegionMultMutation = useMutation({
    mutationFn: async () => {
      const arr = Object.entries(editableRegionMult).map(([region, multiplier]) => ({
        region,
        multiplier: Number(multiplier) || 0,
      }))
      return constructionApi.updateRegionMultipliers(arr)
    },
    onSuccess: async () => {
      toast.success('Region multipliers updated')
      await queryClient.invalidateQueries({ queryKey: ['construction-region-multipliers'] })
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Failed to update region multipliers')
    },
  })

  // Save base costs
  const saveBaseCostsMutation = useMutation({
    mutationFn: async () => {
      const arr = Object.entries(editableBaseCosts).map(([key, cost_ghs]) => {
        const [property_type, quality_level] = key.split('_')
        return { property_type, quality_level, cost_ghs: Number(cost_ghs) || 0 }
      })
      return constructionApi.updateBaseCosts(arr)
    },
    onSuccess: async () => {
      toast.success('Base costs updated')
      await queryClient.invalidateQueries({ queryKey: ['construction-base-costs'] })
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Failed to update base costs')
    },
  })

  // Save cost breakdown
  const saveBreakdownMutation = useMutation({
    mutationFn: async () => {
      const arr = Object.entries(editableBreakdown).map(([category, pct]) => ({
        category,
        percentage: (Number(pct) || 0) / 100,
      }))
      const sum = arr.reduce((acc, b) => acc + b.percentage, 0)
      if (Math.abs(sum - 1) > 0.001) {
        throw new Error(`Breakdown must sum to 100% (currently ${(sum * 100).toFixed(1)}%)`)
      }
      return constructionApi.updateCostBreakdown(arr)
    },
    onSuccess: async () => {
      toast.success('Cost breakdown updated')
      await queryClient.invalidateQueries({ queryKey: ['construction-cost-breakdown'] })
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Failed to update cost breakdown')
    },
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

  // Transform history data for chart
  const indexChartData = indexHistory?.data?.map((item) => ({
    period: item.period,
    date: new Date(item.date).toLocaleDateString('en-US', { 
      month: 'short', 
      year: 'numeric' 
    }),
    material: item.material_index,
    labor: item.labor_index,
    overall: item.overall_index,
    change: item.price_change,
  })) || []

  // Weekly material trends by region chart data
  const materialTrendsChartData = weeklyMaterialTrends?.data?.map((item) => ({
    week: item.week,
    date: new Date(item.date).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric'
    }),
    'Greater Accra': item.greater_accra || 0,
    'Kumasi Metro': item.kumasi_metro || 0,
    'Eastern': item.eastern || 0,
    'Western Cluster': item.western_cluster || 0,
    'Northern Cluster': item.northern_cluster || 0,
  })) || []

  // Weekly labor trends by region chart data
  const laborTrendsChartData = weeklyLaborTrends?.data?.map((item) => ({
    week: item.week,
    date: new Date(item.date).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric'
    }),
    'Greater Accra': item.greater_accra || 0,
    'Kumasi Metro': item.kumasi_metro || 0,
    'Eastern': item.eastern || 0,
    'Western Cluster': item.western_cluster || 0,
    'Northern Cluster': item.northern_cluster || 0,
  })) || []

  // Regional material comparison chart data
  const regionalMaterialChartData = regionalMaterialComparison?.data?.map((item) => ({
    name: item.material_name.length > 15 ? item.material_name.slice(0, 15) + '...' : item.material_name,
    fullName: item.material_name,
    'Greater Accra': item.greater_accra || 0,
    'Kumasi Metro': item.kumasi_metro || 0,
    'Eastern': item.eastern || 0,
    'Western Cluster': item.western_cluster || 0,
    'Northern Cluster': item.northern_cluster || 0,
  })) || []

  // Regional labor comparison chart data
  const regionalLaborChartData = regionalLaborComparison?.data?.map((item) => ({
    name: item.role_name.length > 15 ? item.role_name.slice(0, 15) + '...' : item.role_name,
    fullName: item.role_name,
    'Greater Accra': item.greater_accra || 0,
    'Kumasi Metro': item.kumasi_metro || 0,
    'Eastern': item.eastern || 0,
    'Western Cluster': item.western_cluster || 0,
    'Northern Cluster': item.northern_cluster || 0,
  })) || []

  const materialCategoryWeeks = Array.from(new Set((weeklyMaterialCategoryAverages?.data || []).map((d) => d.week))).sort()
  const materialWeek1 = materialCategoryWeeks.at(-2)
  const materialWeek2 = materialCategoryWeeks.at(-1)
  const materialWeekVsWeekData = (() => {
    const rows = weeklyMaterialCategoryAverages?.data || []
    if (!materialWeek1 || !materialWeek2) return []
    const categories = Array.from(new Set(rows.map((r) => r.category))).sort()
    return categories.map((category) => {
      const v1 = rows.find((r) => r.week === materialWeek1 && r.category === category)?.avg_price ?? 0
      const v2 = rows.find((r) => r.week === materialWeek2 && r.category === category)?.avg_price ?? 0
      return {
        category,
        week1: v1,
        week2: v2,
        delta: Math.round((v2 - v1) * 100) / 100,
      }
    })
  })()

  const laborCategoryWeeks = Array.from(new Set((weeklyLaborCategoryAverages?.data || []).map((d) => d.week))).sort()
  const laborWeek1 = laborCategoryWeeks.at(-2)
  const laborWeek2 = laborCategoryWeeks.at(-1)
  const laborWeekVsWeekData = (() => {
    const rows = weeklyLaborCategoryAverages?.data || []
    if (!laborWeek1 || !laborWeek2) return []
    const categories = Array.from(new Set(rows.map((r) => r.labor_category))).sort()
    return categories.map((labor_category) => {
      const v1 = rows.find((r) => r.week === laborWeek1 && r.labor_category === labor_category)?.avg_rate ?? 0
      const v2 = rows.find((r) => r.week === laborWeek2 && r.labor_category === labor_category)?.avg_rate ?? 0
      return {
        labor_category,
        week1: v1,
        week2: v2,
        delta: Math.round((v2 - v1) * 100) / 100,
      }
    })
  })()

  // Top materials chart data
  const chartData = topMaterials.map((m) => ({
    name: m.material_name.length > 15 ? m.material_name.slice(0, 15) + '...' : m.material_name,
    price: m.price_ghs,
    change: m.price_change_percent || 0,
  }))

  const weightsSummary = (() => {
    const weights = index?.data?.material_weights
    if (!weights) return ''
    const top = Object.entries(weights)
      .filter(([, w]) => typeof w === 'number' && Number.isFinite(w))
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 3)
      .map(([k, w]) => `${k} ${Math.round((w as number) * 100)}%`)
      .join(', ')
    return top ? `Wts: ${top}${Object.keys(weights).length > 3 ? ', …' : ''}` : ''
  })()

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
              subtitle={`Base: ${index?.data?.base_year || 2024}${weightsSummary ? ` • ${weightsSummary}` : ''}`}
              icon={Package}
              color="blue"
              isLoading={indexLoading}
            />
            <MetricCard
              title="Labor Index"
              value={index?.data?.labor_index?.toFixed(1) || '-'}
              subtitle={`Base: ${index?.data?.base_year || 2024}`}
              icon={Users}
              color="green"
              isLoading={indexLoading}
            />
            <MetricCard
              title="Overall Index"
              value={index?.data?.overall_index?.toFixed(1) || '-'}
              subtitle={`60% materials, 40% labor${weightsSummary ? ` • ${weightsSummary}` : ''}`}
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
              <TabsTrigger value="trends">Price Trends</TabsTrigger>
              <TabsTrigger value="comparison">Price Comparison</TabsTrigger>
              <TabsTrigger value="entry">Weekly Data Entry</TabsTrigger>
              <TabsTrigger value="weights">Weights</TabsTrigger>
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
                          <TableHead>Survey Date</TableHead>
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
                              <Badge variant="outline">{material.material_category}</Badge>
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
                              <span className="text-sm text-muted-foreground">
                                {material.survey_date ? new Date(material.survey_date).toLocaleDateString('en-US', { 
                                  month: 'short', 
                                  day: 'numeric',
                                  year: 'numeric'
                                }) : '-'}
                              </span>
                            </TableCell>
                            <TableCell>
                              {material.price_change_percent !== null && material.price_change_percent !== undefined && (
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
                        {laborCategoryFilters.map((cat) => (
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
                          <TableHead>Category</TableHead>
                          <TableHead>Skill Level</TableHead>
                          <TableHead>Rate</TableHead>
                          <TableHead>Survey Date</TableHead>
                          <TableHead>Alt. Rate</TableHead>
                          <TableHead>Region</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {laborRates?.data?.map((rate) => (
                          <TableRow key={rate.id}>
                            <TableCell>
                              <span className="font-medium">{rate.labor_category}</span>
                            </TableCell>
                            <TableCell>
                              <Badge variant={
                                rate.skill_level === 'master' ? 'default' :
                                rate.skill_level === 'specialist' ? 'secondary' :
                                rate.skill_level === 'journeyman' ? 'secondary' : 'outline'
                              }>
                                {rate.skill_level}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className="font-mono font-medium">
                                {formatCurrency(rate.rate_ghs)}
                                <span className="text-xs text-muted-foreground ml-1">
                                  /{rate.rate_type}
                                </span>
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground">
                                {rate.survey_date ? new Date(rate.survey_date).toLocaleDateString('en-US', { 
                                  month: 'short', 
                                  day: 'numeric',
                                  year: 'numeric'
                                }) : '-'}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="font-mono text-muted-foreground">
                                {rate.rate_type === 'daily' 
                                  ? formatCurrency(rate.rate_ghs / 8) + '/hr'
                                  : rate.rate_type === 'hourly'
                                  ? formatCurrency(rate.rate_ghs * 8) + '/day'
                                  : 'N/A'
                                }
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

            {/* Price Trends Tab */}
            <TabsContent value="trends" className="space-y-4">
              {/* Header */}
              <div className="mb-6">
                <h2 className="text-lg font-semibold">Category Week vs Week</h2>
                <p className="text-sm text-muted-foreground">
                  Compare category averages week-over-week (and delta) for the selected region
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-medium">Materials (by Category)</CardTitle>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">
                        {materialWeek1 && materialWeek2 ? `${materialWeek1} vs ${materialWeek2} + delta` : 'Week vs week + delta'}
                      </p>
                      <Select value={materialsTrendsRegion} onValueChange={setMaterialsTrendsRegion}>
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="Region" />
                        </SelectTrigger>
                        <SelectContent>
                          {regionOptions.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {weeklyMaterialCategoryLoading ? (
                      <div className="h-64 flex items-center justify-center">
                        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : materialWeekVsWeekData.length === 0 ? (
                      <div className="h-64 flex items-center justify-center text-muted-foreground">
                        <div className="text-center">
                          <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">Not enough weekly category data</p>
                        </div>
                      </div>
                    ) : (
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={materialWeekVsWeekData} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} label={{ value: 'Avg Price (GHS)', angle: -90, position: 'insideLeft' }} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'hsl(var(--card))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '8px',
                              }}
                              formatter={(value: number, name: string) => [formatCurrency(value), name]}
                            />
                            <Legend />
                            <Bar dataKey="week1" name={materialWeek1 || 'Week 1'} fill="#94a3b8" />
                            <Bar dataKey="week2" name={materialWeek2 || 'Week 2'} fill="#3b82f6" />
                            <Bar dataKey="delta" name="Delta">
                              {materialWeekVsWeekData.map((entry, index) => (
                                <Cell
                                  key={`m-delta-${index}`}
                                  fill={
                                    entry.delta > 0
                                      ? '#ef4444'
                                      : entry.delta < 0
                                        ? '#10b981'
                                        : '#94a3b8'
                                  }
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-medium">Labor (by Category)</CardTitle>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">
                        {laborWeek1 && laborWeek2 ? `${laborWeek1} vs ${laborWeek2} + delta` : 'Week vs week + delta'}
                      </p>
                      <Select value={laborTrendsRegion} onValueChange={setLaborTrendsRegion}>
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="Region" />
                        </SelectTrigger>
                        <SelectContent>
                          {regionOptions.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {weeklyLaborCategoryLoading ? (
                      <div className="h-64 flex items-center justify-center">
                        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : laborWeekVsWeekData.length === 0 ? (
                      <div className="h-64 flex items-center justify-center text-muted-foreground">
                        <div className="text-center">
                          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">Not enough weekly category data</p>
                        </div>
                      </div>
                    ) : (
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={laborWeekVsWeekData} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis dataKey="labor_category" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} label={{ value: 'Avg Daily Rate (GHS)', angle: -90, position: 'insideLeft' }} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'hsl(var(--card))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '8px',
                              }}
                              formatter={(value: number, name: string) => [formatCurrency(value), name]}
                            />
                            <Legend />
                            <Bar dataKey="week1" name={laborWeek1 || 'Week 1'} fill="#94a3b8" />
                            <Bar dataKey="week2" name={laborWeek2 || 'Week 2'} fill="#3b82f6" />
                            <Bar dataKey="delta" name="Delta">
                              {laborWeekVsWeekData.map((entry, index) => (
                                <Cell
                                  key={`l-delta-${index}`}
                                  fill={
                                    entry.delta > 0
                                      ? '#ef4444'
                                      : entry.delta < 0
                                        ? '#10b981'
                                        : '#94a3b8'
                                  }
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
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

            {/* Weekly Data Entry Tab */}
            <TabsContent value="entry" className="space-y-4">
              <div className="mb-6">
                <h2 className="text-lg font-semibold">Weekly Data Entry</h2>
                <p className="text-sm text-muted-foreground">
                  Enter weekly material prices and labor rates by region
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Material Prices Entry */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-medium">Weekly Material Prices</CardTitle>
                    <p className="text-sm text-muted-foreground">Enter new material price data</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-2 block">Region</label>
                        <Select defaultValue="greater_accra">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {regionOptions.slice(1).map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-2 block">Survey Date</label>
                        <Input 
                          type="date" 
                          defaultValue={new Date().toISOString().split('T')[0]}
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium mb-2 block">Material Name</label>
                      <Input 
                        placeholder="Enter material name"
                        value={materialForm.material_name}
                        onChange={(e) => setMaterialForm(prev => ({ ...prev, material_name: e.target.value }))}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-2 block">Category</label>
                        <Select 
                          value={materialForm.material_category || ''}
                          onValueChange={(value) => setMaterialForm(prev => ({ ...prev, material_category: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            {materialCategoriesApi?.data ? materialCategoriesApi.data.map((category) => (
                              <SelectItem key={category} value={category}>
                                {category.charAt(0).toUpperCase() + category.slice(1)}
                              </SelectItem>
                            )) : (
                              <SelectItem value="loading" disabled>Loading categories...</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-2 block">Unit</label>
                        <Select 
                          value={materialForm.unit || ''}
                          onValueChange={(value) => setMaterialForm(prev => ({ ...prev, unit: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select unit" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bag">Bag</SelectItem>
                            <SelectItem value="piece">Piece</SelectItem>
                            <SelectItem value="length">Length</SelectItem>
                            <SelectItem value="trip">Trip</SelectItem>
                            <SelectItem value="sqm">Sqm</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">Price (GHS)</label>
                      <Input 
                        type="number" 
                        step="0.01" 
                        placeholder="0.00" 
                        value={materialForm.price_ghs}
                        onChange={(e) => setMaterialForm(prev => ({ ...prev, price_ghs: e.target.value }))}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">Supplier</label>
                      <Input 
                        placeholder="Supplier name" 
                        value={materialForm.supplier_name}
                        onChange={(e) => setMaterialForm(prev => ({ ...prev, supplier_name: e.target.value }))}
                      />
                    </div>

                    <Button 
                      className="w-full" 
                      onClick={handleMaterialSubmit}
                      disabled={createMaterialMutation.isPending}
                    >
                      <Package className="h-4 w-4 mr-2" />
                      {createMaterialMutation.isPending ? 'Adding...' : 'Add Material Price'}
                    </Button>
                  </CardContent>
                </Card>

                {/* Labor Rates Entry */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-medium">Weekly Labor Rates</CardTitle>
                    <p className="text-sm text-muted-foreground">Enter new labor rate data</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-2 block">Region</label>
                        <Select defaultValue="greater_accra">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {regionOptions.slice(1).map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-2 block">Survey Date</label>
                        <Input 
                          type="date" 
                          defaultValue={new Date().toISOString().split('T')[0]}
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium mb-2 block">Role Name</label>
                      <Input 
                        placeholder="Enter role name"
                        value={laborForm.role_name}
                        onChange={(e) => setLaborForm(prev => ({ ...prev, role_name: e.target.value }))}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-2 block">Category</label>
                        <Select 
                          value={laborForm.labor_category || ''}
                          onValueChange={(value) => setLaborForm(prev => ({ ...prev, labor_category: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            {laborCategories?.data ? laborCategories.data.map((category) => (
                              <SelectItem key={category} value={category}>
                                {category}
                              </SelectItem>
                            )) : (
                              <SelectItem value="loading" disabled>Loading categories...</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-2 block">Skill Level</label>
                        <Select 
                          value={laborForm.skill_level}
                          onValueChange={(value: any) => setLaborForm(prev => ({ ...prev, skill_level: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select skill level" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="apprentice">Apprentice</SelectItem>
                            <SelectItem value="journeyman">Journeyman</SelectItem>
                            <SelectItem value="master">Master</SelectItem>
                            <SelectItem value="specialist">Specialist</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">Daily Rate (GHS)</label>
                      <Input 
                        type="number" 
                        step="0.01" 
                        placeholder="0.00" 
                        value={laborForm.daily_rate_ghs}
                        onChange={(e) => setLaborForm(prev => ({ ...prev, daily_rate_ghs: e.target.value }))}
                      />
                    </div>

                    <div className="flex items-center space-x-2">
                      <input 
                        type="checkbox" 
                        id="verified" 
                        className="rounded border-gray-300" 
                        checked={laborForm.is_verified}
                        onChange={(e) => setLaborForm(prev => ({ ...prev, is_verified: e.target.checked }))}
                      />
                      <label htmlFor="verified" className="text-sm">Mark as verified</label>
                    </div>

                    <Button 
                      className="w-full" 
                      onClick={handleLaborSubmit}
                      disabled={createLaborMutation.isPending}
                    >
                      <Users className="h-4 w-4 mr-2" />
                      {createLaborMutation.isPending ? 'Adding...' : 'Add Labor Rate'}
                    </Button>
                  </CardContent>
                </Card>

              </div>

              {/* Instructions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">Data Entry Guidelines</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                    <div>
                      <h4 className="font-medium mb-2">Material Prices</h4>
                      <ul className="space-y-1 text-muted-foreground">
                        <li>• Enter prices as surveyed at retail/wholesale level</li>
                        <li>• Include supplier information when available</li>
                        <li>• Use standard units (bag for cement, piece for blocks, etc.)</li>
                        <li>• Update prices weekly for accurate trend tracking</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Labor Rates</h4>
                      <ul className="space-y-1 text-muted-foreground">
                        <li>• Enter daily rates as commonly paid in the region</li>
                        <li>• Specify skill level accurately (apprentice to master)</li>
                        <li>• Verify rates with multiple sources when possible</li>
                        <li>• Consider seasonal variations in rural areas</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Weights Tab */}
            <TabsContent value="weights" className="space-y-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold">Construction Cost Parameters</h2>
                <p className="text-sm text-muted-foreground">Configure weights and multipliers used for cost calculations and valuation models</p>
              </div>

              {/* 2x2 Grid Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Card 1: Material Category Weights */}
                <Card className="h-fit">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-medium">Material Category Weights</CardTitle>
                    <p className="text-xs text-muted-foreground">Must sum to 100%</p>
                  </CardHeader>
                  <CardContent>
                    {weightsLoading ? (
                      <div className="h-32 flex items-center justify-center">
                        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : !materialWeights?.data || materialWeights.data.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No weights available</div>
                    ) : (
                      <div className="space-y-3">
                        <div className="max-h-[280px] overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Category</TableHead>
                                <TableHead className="w-24 text-xs">Weight (%)</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {materialWeights.data.map((w) => (
                                <TableRow key={w.category}>
                                  <TableCell className="font-medium text-sm py-2">{w.category}</TableCell>
                                  <TableCell className="py-2">
                                    <Input
                                      type="number"
                                      step="0.1"
                                      className="h-8 text-sm"
                                      value={editableWeights[w.category] ?? Math.round((w.weight * 100) * 10) / 10}
                                      onChange={(e) =>
                                        setEditableWeights((prev) => ({
                                          ...prev,
                                          [w.category]: Number(e.target.value),
                                        }))
                                      }
                                    />
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t">
                          <div className="text-sm text-muted-foreground">
                            Total: {materialWeights.data
                              .reduce((acc, w) => acc + (Number(editableWeights[w.category]) || (w.weight * 100)), 0)
                              .toFixed(1)}%
                          </div>
                          <Button
                            size="sm"
                            onClick={() => saveWeightsMutation.mutate()}
                            disabled={
                              saveWeightsMutation.isPending ||
                              !materialWeights?.data ||
                              materialWeights.data.length === 0 ||
                              Object.keys(editableWeights).length === 0
                            }
                          >
                            {saveWeightsMutation.isPending ? 'Saving...' : 'Save'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Right Column - Card 2: Quality Level Multipliers */}
                <Card className="h-fit">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-medium">Quality Level Multipliers</CardTitle>
                    <p className="text-xs text-muted-foreground">Base = 1.0 (Standard)</p>
                  </CardHeader>
                  <CardContent>
                    {qualityLoading ? (
                      <div className="h-32 flex items-center justify-center">
                        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : !qualityMultipliers?.data || qualityMultipliers.data.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No quality multipliers configured</div>
                    ) : (
                      <div className="space-y-3">
                        <div className="max-h-[280px] overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Level</TableHead>
                                <TableHead className="w-24 text-xs">Multiplier</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {qualityMultipliers.data.map((m) => (
                                <TableRow key={m.quality_level}>
                                  <TableCell className="py-2">
                                    <div className="font-medium capitalize text-sm">{m.quality_level}</div>
                                    {m.description && <div className="text-xs text-muted-foreground">{m.description}</div>}
                                  </TableCell>
                                  <TableCell className="py-2">
                                    <Input
                                      type="number"
                                      step="0.01"
                                      className="h-8 text-sm"
                                      value={editableQualityMult[m.quality_level] ?? m.multiplier}
                                      onChange={(e) =>
                                        setEditableQualityMult((prev) => ({
                                          ...prev,
                                          [m.quality_level]: Number(e.target.value),
                                        }))
                                      }
                                    />
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>

                        <div className="flex justify-end pt-2 border-t">
                          <Button
                            size="sm"
                            onClick={() => saveQualityMultMutation.mutate()}
                            disabled={saveQualityMultMutation.isPending || Object.keys(editableQualityMult).length === 0}
                          >
                            {saveQualityMultMutation.isPending ? 'Saving...' : 'Save'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Left Column - Card 3: Region Multipliers */}
                <Card className="h-fit">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-medium">Region Multipliers</CardTitle>
                    <p className="text-xs text-muted-foreground">Base = 1.0 (Kumasi Metro)</p>
                  </CardHeader>
                  <CardContent>
                    {regionMultLoading ? (
                      <div className="h-32 flex items-center justify-center">
                        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : !regionMultipliers?.data || regionMultipliers.data.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No region multipliers configured</div>
                    ) : (
                      <div className="space-y-3">
                        <div className="max-h-[280px] overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Region</TableHead>
                                <TableHead className="w-24 text-xs">Multiplier</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {regionMultipliers.data.map((m) => (
                                <TableRow key={m.region}>
                                  <TableCell className="py-2">
                                    <div className="font-medium text-sm">{m.region.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</div>
                                    {m.description && <div className="text-xs text-muted-foreground">{m.description}</div>}
                                  </TableCell>
                                  <TableCell className="py-2">
                                    <Input
                                      type="number"
                                      step="0.01"
                                      className="h-8 text-sm"
                                      value={editableRegionMult[m.region] ?? m.multiplier}
                                      onChange={(e) =>
                                        setEditableRegionMult((prev) => ({
                                          ...prev,
                                          [m.region]: Number(e.target.value),
                                        }))
                                      }
                                    />
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>

                        <div className="flex justify-end pt-2 border-t">
                          <Button
                            size="sm"
                            onClick={() => saveRegionMultMutation.mutate()}
                            disabled={saveRegionMultMutation.isPending || Object.keys(editableRegionMult).length === 0}
                          >
                            {saveRegionMultMutation.isPending ? 'Saving...' : 'Save'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Right Column - Card 4: Cost Breakdown */}
                <Card className="h-fit">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-medium">Cost Breakdown</CardTitle>
                    <p className="text-xs text-muted-foreground">Must sum to 100%</p>
                  </CardHeader>
                  <CardContent>
                    {breakdownLoading ? (
                      <div className="h-32 flex items-center justify-center">
                        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : !costBreakdown?.data || costBreakdown.data.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No cost breakdown configured</div>
                    ) : (
                      <div className="space-y-3">
                        <div className="max-h-[280px] overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Category</TableHead>
                                <TableHead className="w-24 text-xs">Pct (%)</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {costBreakdown.data.map((b) => (
                                <TableRow key={b.category}>
                                  <TableCell className="py-2">
                                    <div className="font-medium capitalize text-sm">{b.category}</div>
                                    {b.description && <div className="text-xs text-muted-foreground">{b.description}</div>}
                                  </TableCell>
                                  <TableCell className="py-2">
                                    <Input
                                      type="number"
                                      step="0.1"
                                      className="h-8 text-sm"
                                      value={editableBreakdown[b.category] ?? Math.round(b.percentage * 1000) / 10}
                                      onChange={(e) =>
                                        setEditableBreakdown((prev) => ({
                                          ...prev,
                                          [b.category]: Number(e.target.value),
                                        }))
                                      }
                                    />
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t">
                          <div className="text-sm text-muted-foreground">
                            Total: {costBreakdown.data
                              .reduce((acc, b) => acc + (Number(editableBreakdown[b.category]) || (b.percentage * 100)), 0)
                              .toFixed(1)}%
                          </div>
                          <Button
                            size="sm"
                            onClick={() => saveBreakdownMutation.mutate()}
                            disabled={saveBreakdownMutation.isPending || Object.keys(editableBreakdown).length === 0}
                          >
                            {saveBreakdownMutation.isPending ? 'Saving...' : 'Save'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Full Width - Base Construction Costs */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-medium">Base Construction Costs (GHS per sqm)</CardTitle>
                  <p className="text-xs text-muted-foreground">Base costs by property type and quality level</p>
                </CardHeader>
                <CardContent>
                  {baseCostsLoading ? (
                    <div className="h-32 flex items-center justify-center">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : !baseCosts?.data || baseCosts.data.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No base costs configured</div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {baseCosts.data.map((c) => {
                          const key = `${c.property_type}_${c.quality_level}`
                          return (
                            <div key={key} className="flex items-center gap-3 p-3 border rounded-lg">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm capitalize">{c.property_type}</div>
                                <div className="text-xs text-muted-foreground capitalize">{c.quality_level}</div>
                              </div>
                              <Input
                                type="number"
                                step="100"
                                className="w-28 h-8 text-sm"
                                value={editableBaseCosts[key] ?? c.cost_ghs}
                                onChange={(e) =>
                                  setEditableBaseCosts((prev) => ({
                                    ...prev,
                                    [key]: Number(e.target.value),
                                  }))
                                }
                              />
                            </div>
                          )
                        })}
                      </div>

                      <div className="flex justify-end pt-2 border-t">
                        <Button
                          size="sm"
                          onClick={() => saveBaseCostsMutation.mutate()}
                          disabled={saveBaseCostsMutation.isPending || Object.keys(editableBaseCosts).length === 0}
                        >
                          {saveBaseCostsMutation.isPending ? 'Saving...' : 'Save Base Costs'}
                        </Button>
                      </div>
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
