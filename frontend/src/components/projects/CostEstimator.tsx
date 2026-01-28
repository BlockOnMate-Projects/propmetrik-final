'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  Calculator,
  TrendingUp,
  Hammer,
  Users,
  Building2,
  Loader2,
  RefreshCw,
  AlertCircle,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { costEstimationApi, type CostEstimate as CostEstimateType } from '@/lib/projects-api'
import { formatCurrency } from '@/lib/utils'

// Re-export the CostEstimate type
export type CostEstimate = CostEstimateType

// =====================================================
// TYPES
// =====================================================
interface CostEstimatorProps {
  region: string
  areaSqm: number
  onEstimateChange?: (estimate: CostEstimate | null) => void
  className?: string
}

interface CostBreakdownItem {
  category: string
  amount: number
  percentage: number
  icon?: React.ElementType
}

// =====================================================
// CONSTANTS
// =====================================================
const PROJECT_TYPES = [
  { value: 'residential_single', label: 'Residential (Single)' },
  { value: 'residential_multi', label: 'Residential (Multi)' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'mixed_use', label: 'Mixed Use' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'land_development', label: 'Land Development' },
  { value: 'renovation', label: 'Renovation' },
]

const GHANA_REGIONS = [
  'Greater Accra',
  'Ashanti',
  'Western',
  'Central',
  'Eastern',
  'Volta',
  'Northern',
  'Upper East',
  'Upper West',
  'Brong Ahafo',
  'Oti',
  'Bono East',
  'Ahafo',
  'Savannah',
  'North East',
  'Western North',
]

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  materials: Hammer,
  labor: Users,
  equipment: Building2,
  overhead: Calculator,
}

// =====================================================
// COST BREAKDOWN CHART
// =====================================================
function CostBreakdownChart({ items, total }: { items: CostBreakdownItem[]; total: number }) {
  const colors = [
    'bg-amber-500',
    'bg-blue-500',
    'bg-green-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-cyan-500',
    'bg-orange-500',
    'bg-red-500',
  ]

  return (
    <div className="space-y-3">
      {/* Horizontal bar chart */}
      <div className="h-4 flex rounded-sm overflow-hidden bg-zinc-800">
        {items.map((item, index) => (
          <TooltipProvider key={item.category}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(colors[index % colors.length], "transition-all hover:opacity-80")}
                  style={{ width: `${item.percentage}%` }}
                />
              </TooltipTrigger>
              <TooltipContent className="bg-zinc-800 border-zinc-700">
                <p className="font-mono text-xs">
                  {item.category}: {formatCurrency(item.amount, 'GHS')}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-2">
        {items.map((item, index) => {
          const Icon = CATEGORY_ICONS[item.category.toLowerCase()] || Calculator
          return (
            <div key={item.category} className="flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-sm", colors[index % colors.length])} />
              <Icon className="h-3 w-3 text-zinc-500" />
              <span className="font-mono text-[10px] text-zinc-400 truncate flex-1">
                {item.category}
              </span>
              <span className="font-mono text-[10px] text-zinc-300">
                {item.percentage.toFixed(1)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// =====================================================
// MATERIALS/LABOR DETAIL LIST
// =====================================================
function CostDetailList({
  title,
  items,
  icon: Icon,
  currency = 'GHS',
}: {
  title: string
  items: Array<{ category: string; amount: number }>
  icon: React.ElementType
  currency?: string
}) {
  const total = items.reduce((sum, item) => sum + item.amount, 0)

  return (
    <div className="border border-zinc-800 bg-zinc-900/50">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-amber-500" />
          <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
        </div>
        <span className="font-mono text-xs text-zinc-300">{formatCurrency(total, currency)}</span>
      </div>
      <div className="p-2 space-y-1 max-h-40 overflow-y-auto">
        {items.map((item) => (
          <div key={item.category} className="flex items-center justify-between py-0.5">
            <span className="font-mono text-[10px] text-zinc-400 capitalize">
              {item.category.replace(/_/g, ' ')}
            </span>
            <span className="font-mono text-[10px] text-zinc-300">
              {formatCurrency(item.amount, currency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// =====================================================
// MAIN COST ESTIMATOR COMPONENT
// =====================================================
export function CostEstimator({
  region: initialRegion,
  areaSqm: initialSqm,
  onEstimateChange,
  className,
}: CostEstimatorProps) {
  const [projectType, setProjectType] = useState('residential_single')
  const [region, setRegion] = useState(initialRegion || '')
  const [sqm, setSqm] = useState(initialSqm || 0)
  const [estimate, setEstimate] = useState<CostEstimate | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Update local state when props change
  useEffect(() => {
    if (initialRegion) setRegion(initialRegion)
    if (initialSqm) setSqm(initialSqm)
  }, [initialRegion, initialSqm])

  // Fetch estimate
  const fetchEstimate = async () => {
    if (!projectType || !region || !sqm) {
      setError('Please fill in all fields')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await costEstimationApi.estimate(projectType, region, sqm)
      setEstimate(result)
      onEstimateChange?.(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get estimate'
      setError(message)
      setEstimate(null)
      onEstimateChange?.(null)
    } finally {
      setIsLoading(false)
    }
  }

  // Auto-fetch when all inputs are provided and valid
  useEffect(() => {
    if (projectType && region && sqm > 0) {
      const timer = setTimeout(fetchEstimate, 500) // Debounce
      return () => clearTimeout(timer)
    }
  }, [projectType, region, sqm])

  // Calculate breakdown items
  const breakdownItems = useMemo((): CostBreakdownItem[] => {
    if (!estimate) return []

    const total = estimate.grandTotal
    const items: CostBreakdownItem[] = []

    if (estimate.totalMaterials) {
      items.push({
        category: 'Materials',
        amount: estimate.totalMaterials,
        percentage: (estimate.totalMaterials / total) * 100,
        icon: Hammer,
      })
    }

    if (estimate.totalLabor) {
      items.push({
        category: 'Labor',
        amount: estimate.totalLabor,
        percentage: (estimate.totalLabor / total) * 100,
        icon: Users,
      })
    }

    return items
  }, [estimate])

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-amber-500" />
          <span className="font-mono text-xs text-amber-500 tracking-wider">
            COST ESTIMATION
          </span>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-4 w-4 text-zinc-500 cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="bg-zinc-800 border-zinc-700 max-w-xs">
              <p className="font-mono text-xs">
                Estimates based on current regional material and labor rates from our construction cost database.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Input Fields */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="font-mono text-xs text-zinc-400">Project Type</Label>
          <Select value={projectType} onValueChange={setProjectType}>
            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-100">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700">
              {PROJECT_TYPES.map((type) => (
                <SelectItem 
                  key={type.value} 
                  value={type.value}
                  className="text-zinc-100 focus:bg-zinc-800"
                >
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="font-mono text-xs text-zinc-400">Region</Label>
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-100">
              <SelectValue placeholder="Select region" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700">
              {GHANA_REGIONS.map((r) => (
                <SelectItem 
                  key={r} 
                  value={r}
                  className="text-zinc-100 focus:bg-zinc-800"
                >
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="font-mono text-xs text-zinc-400">Floor Area (sqm)</Label>
          <Input
            type="number"
            min={0}
            value={sqm || ''}
            onChange={(e) => setSqm(parseFloat(e.target.value) || 0)}
            placeholder="e.g., 500"
            className="bg-zinc-900 border-zinc-700 text-zinc-100 font-mono"
          />
        </div>
      </div>

      {/* Refresh button */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={fetchEstimate}
        disabled={isLoading || !projectType || !region || !sqm}
        className="w-full border-zinc-700 hover:bg-zinc-800"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4 mr-2" />
        )}
        {isLoading ? 'Calculating...' : 'Recalculate Estimate'}
      </Button>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-900/20 border border-red-900/50 rounded">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
          <span className="font-mono text-xs text-red-400">{error}</span>
        </div>
      )}

      {/* Results */}
      {estimate && !error && (
        <div className="space-y-4">
          {/* Grand Total */}
          <div className="bg-gradient-to-r from-amber-900/30 to-amber-800/10 border border-amber-900/50 p-4 rounded">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-mono text-xs text-amber-400/80 block">
                  ESTIMATED TOTAL COST
                </span>
                <span className="font-mono text-2xl text-amber-300 mt-1 block">
                  {formatCurrency(estimate.grandTotal, estimate.currency)}
                </span>
              </div>
              <div className="text-right">
                <span className="font-mono text-xs text-zinc-400 block">
                  per sqm
                </span>
                <span className="font-mono text-lg text-zinc-300">
                  {formatCurrency(estimate.grandTotal / sqm, estimate.currency)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-amber-900/30">
              <TrendingUp className="h-3 w-3 text-zinc-500" />
              <span className="font-mono text-[10px] text-zinc-500">
                Based on {estimate.region} regional rates • Estimated {new Date(estimate.estimatedAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Breakdown Chart */}
          {breakdownItems.length > 0 && (
            <CostBreakdownChart items={breakdownItems} total={estimate.grandTotal} />
          )}

          {/* Detail Lists */}
          <div className="grid grid-cols-2 gap-3">
            {estimate.materials && estimate.materials.length > 0 && (
              <CostDetailList
                title="MATERIALS"
                items={estimate.materials}
                icon={Hammer}
                currency={estimate.currency}
              />
            )}
            {estimate.labor && estimate.labor.length > 0 && (
              <CostDetailList
                title="LABOR"
                items={estimate.labor}
                icon={Users}
                currency={estimate.currency}
              />
            )}
          </div>

          {/* Disclaimer */}
          <p className="font-mono text-[10px] text-zinc-600 leading-relaxed">
            * This is an estimate based on average regional costs and may vary based on specific site conditions, 
            material quality, and market fluctuations. Actual costs should be verified with detailed quotations.
          </p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && !estimate && (
        <div className="flex flex-col items-center justify-center py-8 text-zinc-500">
          <Loader2 className="h-8 w-8 animate-spin mb-2" />
          <span className="font-mono text-xs">Calculating estimate...</span>
        </div>
      )}
    </div>
  )
}

export default CostEstimator
