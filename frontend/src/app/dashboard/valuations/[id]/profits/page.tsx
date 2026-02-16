'use client'

/**
 * Profits Method Page
 * 
 * Used for trading properties where value relates to business potential:
 * - Hotels and hospitality
 * - Healthcare facilities
 * - Educational institutions
 * - Petrol/fuel stations
 * - Restaurants and entertainment venues
 */

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import {
  TerminalPanel,
  AlertBanner,
  MethodBadge,
  ConfidenceBar,
} from '@/components/ui/terminal'
import { valuationsApi, pythonMethodsApi } from '@/lib/valuation-api'
import type { Valuation } from '@/types/valuation'
import {
  ArrowLeft,
  Loader2,
  Info,
  TrendingUp,
  DollarSign,
  Percent,
  Building2,
  Users,
  Fuel,
  GraduationCap,
  Hotel,
  Utensils,
  Stethoscope,
  HelpCircle,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// Property types for Profits Method
const PROPERTY_TYPES = [
  { id: 'hotel', label: 'Hotel', icon: Hotel, metric: 'rooms', revenuePerUnit: 120000 },
  { id: 'hospital', label: 'Hospital', icon: Stethoscope, metric: 'beds', revenuePerUnit: 180000 },
  { id: 'school', label: 'School', icon: GraduationCap, metric: 'students', revenuePerUnit: 24000 },
  { id: 'restaurant', label: 'Restaurant', icon: Utensils, metric: 'sqm', revenuePerUnit: 6000 },
  { id: 'fuel_station', label: 'Fuel Station', icon: Fuel, metric: 'pumps', revenuePerUnit: 480000 },
  { id: 'healthcare', label: 'Healthcare', icon: Stethoscope, metric: 'sqm', revenuePerUnit: 4800 },
]

// Operating cost ratios by property type
const OPERATING_COSTS: Record<string, { label: string; value: number }[]> = {
  hotel: [
    { label: 'Cost of Sales', value: 25 },
    { label: 'Staff Costs', value: 30 },
    { label: 'Utilities', value: 8 },
    { label: 'Maintenance', value: 5 },
    { label: 'Admin & Marketing', value: 10 },
  ],
  hospital: [
    { label: 'Cost of Sales (Medical)', value: 30 },
    { label: 'Staff Costs', value: 40 },
    { label: 'Utilities', value: 5 },
    { label: 'Maintenance', value: 4 },
    { label: 'Admin', value: 5 },
  ],
  school: [
    { label: 'Staff Costs', value: 55 },
    { label: 'Utilities', value: 5 },
    { label: 'Maintenance', value: 5 },
    { label: 'Admin', value: 8 },
  ],
  restaurant: [
    { label: 'Cost of Sales (Food)', value: 35 },
    { label: 'Staff Costs', value: 25 },
    { label: 'Utilities', value: 6 },
    { label: 'Maintenance', value: 3 },
    { label: 'Admin & Marketing', value: 5 },
  ],
  fuel_station: [
    { label: 'Cost of Sales (Fuel)', value: 85 },
    { label: 'Staff Costs', value: 4 },
    { label: 'Utilities', value: 2 },
    { label: 'Maintenance', value: 2 },
  ],
  healthcare: [
    { label: 'Cost of Sales', value: 25 },
    { label: 'Staff Costs', value: 45 },
    { label: 'Utilities', value: 5 },
    { label: 'Maintenance', value: 4 },
    { label: 'Admin', value: 5 },
  ],
}

// GhIS/RICS-aligned tooltips for Profits Method concepts
const PROFITS_TOOLTIPS = {
  propertyType: 'Select the trading property type. Each type has different revenue profiles, operating cost structures, and capitalization rates based on Ghana market data.',
  unitCount: 'The primary revenue-generating units for this property type (e.g., rooms for hotels, beds for hospitals, students for schools).',
  revenuePerUnit: 'Estimated annual revenue per unit based on market analysis. Default values are derived from Ghana hospitality and trading property benchmarks.',
  occupancyRate: 'Average utilization rate of revenue-generating units. This adjusts Potential Gross Revenue to reflect realistic income expectations.',
  pgr: 'Potential Gross Revenue (PGR): Maximum theoretical income assuming 100% occupancy and full utilization of all units.',
  egr: 'Effective Gross Revenue (EGR): Actual expected income after accounting for vacancy, collection losses, and normal occupancy patterns.',
  operatingCosts: 'Operating expenses as a percentage of Effective Gross Revenue. Includes all costs necessary to operate the trading business.',
  costOfSales: 'Direct costs associated with generating revenue (e.g., food costs for restaurants, fuel costs for petrol stations).',
  staffCosts: 'Personnel expenses including wages, salaries, benefits, and related employment costs.',
  utilities: 'Electricity, water, gas, and other utility expenses necessary for property operations.',
  maintenance: 'Routine repairs, maintenance, and upkeep of property and equipment.',
  adminMarketing: 'Administrative overhead, marketing, advertising, and management expenses.',
  mop: 'Maintainable Operating Profit (MOP): The sustainable annual net profit that a Reasonably Efficient Operator (REO) would achieve, excluding extraordinary items.',
  capRate: 'Capitalization Rate: The rate of return used to convert MOP into capital value. Lower rates indicate lower risk and higher values. Based on Ghana trading property market yields.',
  yearssPurchase: 'Years Purchase (YP): The multiplier applied to MOP to derive capital value. Calculated as 1 ÷ Cap Rate.',
  capitalValue: 'The estimated market value of the property based on its income-generating potential, calculated as MOP ÷ Cap Rate.',
}

// Capitalization rates by property type
const CAP_RATES: Record<string, number> = {
  hotel: 10,
  hospital: 9,
  school: 8.5,
  restaurant: 12,
  fuel_station: 11,
  healthcare: 9,
}

export default function ProfitsMethodPage() {
  const params = useParams()
  const router = useRouter()
  const valuationId = params.id as string

  const [valuation, setValuation] = useState<Valuation | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Property details
  const [propertyType, setPropertyType] = useState('hotel')
  const [unitCount, setUnitCount] = useState(0)
  const [occupancyRate, setOccupancyRate] = useState(70)

  // Revenue inputs
  const [revenuePerUnit, setRevenuePerUnit] = useState(120000)
  const [useCustomRevenue, setUseCustomRevenue] = useState(false)

  // Operating costs (percentages)
  const [operatingCostOverrides, setOperatingCostOverrides] = useState<Record<string, number>>({})

  // Capitalization
  const [capRate, setCapRate] = useState(10)
  const [useCustomCapRate, setUseCustomCapRate] = useState(false)

  // Python calculation results
  const [pythonResult, setPythonResult] = useState<any>(null)

  // Local calculations (fallback/display while calculating)
  const potentialGrossRevenue = unitCount * revenuePerUnit
  const effectiveGrossRevenue = potentialGrossRevenue * (occupancyRate / 100)

  const operatingCosts = OPERATING_COSTS[propertyType] || []
  const totalOperatingCostPercent = operatingCosts.reduce((sum, cost) => {
    return sum + (operatingCostOverrides[cost.label] ?? cost.value)
  }, 0)
  const totalOperatingCostAmount = effectiveGrossRevenue * (totalOperatingCostPercent / 100)

  const netOperatingIncome = effectiveGrossRevenue - totalOperatingCostAmount

  // Maintainable Operating Profit (MOP)
  const mop = pythonResult?.details?.maintainable_profit ?? netOperatingIncome

  // Capital Value - prefer Python result
  const capitalValue = pythonResult?.estimated_value ?? (mop / (capRate / 100))

  // Confidence from Python
  const confidenceScore = pythonResult?.confidence_score ?? 0.5

  // Fetch valuation
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        const res = await valuationsApi.getById(valuationId)
        if (res.error) throw new Error(res.error)
        if (!res.data) throw new Error('Valuation not found')
        setValuation(res.data as Valuation)

        const prop = res.data.property
        if (prop) {
          // Try to infer unit count from property data
          if (prop.bedrooms) setUnitCount(prop.bedrooms) // Rooms for hotel
          else if (prop.built_area_sqm) setUnitCount(Math.round(prop.built_area_sqm))
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load valuation')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [valuationId])

  // Calculate via Python service when inputs change
  useEffect(() => {
    const calculateProfits = async () => {
      if (!valuation?.property || unitCount <= 0) return
      
      setCalculating(true)
      try {
        const prop = valuation.property
        const result = await pythonMethodsApi.calculateProfits(
          {
            id: prop.id,
            property_type: propertyType,
            region: prop.region || 'greater_accra',
            building_size_sqm: prop.building_area_sqm || (prop as any).gfa,
            bedrooms: prop.bedrooms,
          },
          {
            unit_count: unitCount,
            revenue_per_unit: revenuePerUnit,
            occupancy_rate: occupancyRate,
            cap_rate: capRate,
            operating_cost_overrides: operatingCostOverrides,
            trading_property_type: propertyType,
          }
        )
        
        if (result.success && result.data) {
          setPythonResult(result.data)
        }
      } catch (err) {
        console.error('Python calculation error:', err)
        // Keep using local calculation on error
      } finally {
        setCalculating(false)
      }
    }

    // Debounce calculation
    const timer = setTimeout(calculateProfits, 500)
    return () => clearTimeout(timer)
  }, [valuation, propertyType, unitCount, revenuePerUnit, occupancyRate, capRate, operatingCostOverrides])

  // Update defaults when property type changes
  useEffect(() => {
    if (!useCustomRevenue) {
      const typeInfo = PROPERTY_TYPES.find(t => t.id === propertyType)
      if (typeInfo) {
        setRevenuePerUnit(typeInfo.revenuePerUnit)
      }
    }
    if (!useCustomCapRate) {
      setCapRate(CAP_RATES[propertyType] || 10)
    }
    setOperatingCostOverrides({})
  }, [propertyType, useCustomRevenue, useCustomCapRate])

  // Save and continue
  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)

      // Use Python result if available, otherwise use local calculation
      const finalValue = pythonResult?.estimated_value ?? capitalValue
      const finalConfidence = pythonResult?.confidence_score ?? 0.5

      await valuationsApi.update(valuationId, {
        method_results: {
          ...(valuation?.method_results || {}),
          profits_method: {
            value: finalValue,
            confidence: finalConfidence,
            confidence_level: pythonResult?.confidence_level ?? 'medium',
            value_range: pythonResult?.value_range ?? { low: finalValue * 0.8, high: finalValue * 1.2 },
            details: pythonResult?.details ?? {
              potentialGrossRevenue,
              effectiveGrossRevenue,
              occupancyRate,
              totalOperatingCostPercent,
              netOperatingIncome,
              mop,
              capRate,
              propertyType,
              unitCount,
            },
            assumptions: pythonResult?.assumptions ?? [],
            limitations: pythonResult?.limitations ?? [],
            calculated_by: pythonResult ? 'python_rics_engine' : 'frontend_fallback',
          },
        },
        current_step: 8,
      })

      // Navigate to next step
      const selectedMethods = (valuation as any)?.selectedMethods || valuation?.methods_applied || []
      const hasResidual = selectedMethods.includes('residual_method')

      if (hasResidual) {
        router.push(`/dashboard/valuations/${valuationId}/residual`)
      } else {
        router.push(`/dashboard/valuations/${valuationId}/reconciliation`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // Determine back navigation
  const getBackPath = () => {
    const selectedMethods = (valuation as any)?.selectedMethods || valuation?.methods_applied || []
    if (selectedMethods.includes('drc_method')) {
      return `/dashboard/valuations/${valuationId}/drc`
    }
    if (selectedMethods.includes('income_approach')) {
      return `/dashboard/valuations/${valuationId}/income`
    }
    if (selectedMethods.includes('cost_approach')) {
      return `/dashboard/valuations/${valuationId}/cost`
    }
    if (selectedMethods.includes('sales_comparison')) {
      return `/dashboard/valuations/${valuationId}/market`
    }
    return `/dashboard/valuations/${valuationId}/comparables`
  }

  const currentTypeInfo = PROPERTY_TYPES.find(t => t.id === propertyType)
  const TypeIcon = currentTypeInfo?.icon || Building2

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        <span className="ml-3 font-mono text-sm text-zinc-400">Loading profits method...</span>
      </div>
    )
  }

  return (
    <TooltipProvider>
    <div className="min-h-screen bg-black text-white p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href={getBackPath()} className="p-2 hover:bg-zinc-800 transition-colors">
            <ArrowLeft className="w-4 h-4 text-zinc-400" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-xl text-white">PROFITS METHOD</h1>
              <MethodBadge method="PROFITS" />
            </div>
            <p className="font-mono text-xs text-zinc-500">Trading Property Valuation</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {calculating && <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />}
          <ConfidenceBar score={confidenceScore * 100} />
        </div>
      </div>

      {error && <div className="mb-4"><AlertBanner type="error" title="Error" message={error} /></div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column - Trading Details */}
        <div className="lg:col-span-2 space-y-4">
          {/* Property Type Selection */}
          <TerminalPanel title="TRADING PROPERTY TYPE">
            <div className="flex items-center gap-2 px-4 pt-3 pb-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-3 h-3 text-zinc-500 hover:text-amber-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs bg-zinc-900 border border-zinc-700">
                  <p className="text-xs font-mono">{PROFITS_TOOLTIPS.propertyType}</p>
                </TooltipContent>
              </Tooltip>
              <span className="font-mono text-[10px] text-zinc-500">Select property type for appropriate cost ratios</span>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 p-4">
              {PROPERTY_TYPES.map(type => {
                const Icon = type.icon
                return (
                  <button
                    key={type.id}
                    onClick={() => setPropertyType(type.id)}
                    className={`p-3 border text-center transition-colors ${
                      propertyType === type.id
                        ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                        : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                    }`}
                  >
                    <Icon className="w-5 h-5 mx-auto mb-1" />
                    <div className="font-mono text-[10px] font-bold">{type.label}</div>
                  </button>
                )
              })}
            </div>
          </TerminalPanel>

          {/* Revenue Calculation */}
          <TerminalPanel title="GROSS REVENUE">
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <label className="font-mono text-[10px] text-zinc-500">
                      NUMBER OF {currentTypeInfo?.metric?.toUpperCase() || 'UNITS'}
                    </label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-zinc-500 hover:text-amber-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs bg-zinc-900 border border-zinc-700">
                        <p className="text-xs font-mono">{PROFITS_TOOLTIPS.unitCount}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <input
                    type="number"
                    value={unitCount}
                    onChange={(e) => setUnitCount(Number(e.target.value))}
                    className="w-full bg-black border border-zinc-700 p-2 font-mono text-sm text-white"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <label className="font-mono text-[10px] text-zinc-500">
                      REVENUE PER {currentTypeInfo?.metric?.toUpperCase() || 'UNIT'}/YEAR (GH₵)
                    </label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-zinc-500 hover:text-amber-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs bg-zinc-900 border border-zinc-700">
                        <p className="text-xs font-mono">{PROFITS_TOOLTIPS.revenuePerUnit}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <input
                    type="number"
                    value={revenuePerUnit}
                    onChange={(e) => {
                      setUseCustomRevenue(true)
                      setRevenuePerUnit(Number(e.target.value))
                    }}
                    className="w-full bg-black border border-zinc-700 p-2 font-mono text-sm text-white"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <label className="font-mono text-[10px] text-zinc-500">OCCUPANCY RATE %</label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-zinc-500 hover:text-amber-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs bg-zinc-900 border border-zinc-700">
                        <p className="text-xs font-mono">{PROFITS_TOOLTIPS.occupancyRate}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <input
                    type="number"
                    value={occupancyRate}
                    onChange={(e) => setOccupancyRate(Number(e.target.value))}
                    className="w-full bg-black border border-zinc-700 p-2 font-mono text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 p-3 bg-zinc-900 border border-zinc-700">
                <div>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-xs text-zinc-500">Potential Gross Revenue</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-zinc-500 hover:text-amber-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs bg-zinc-900 border border-zinc-700">
                        <p className="text-xs font-mono">{PROFITS_TOOLTIPS.pgr}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="font-mono text-lg text-white">
                    GH₵ {potentialGrossRevenue.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-xs text-zinc-500">Effective Gross Revenue</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-zinc-500 hover:text-amber-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs bg-zinc-900 border border-zinc-700">
                        <p className="text-xs font-mono">{PROFITS_TOOLTIPS.egr}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="font-mono text-lg text-green-400">
                    GH₵ {effectiveGrossRevenue.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </TerminalPanel>

          {/* Operating Costs */}
          <TerminalPanel title="OPERATING COSTS">
            <div className="flex items-center gap-2 px-4 pt-3 pb-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-3 h-3 text-zinc-500 hover:text-amber-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs bg-zinc-900 border border-zinc-700">
                  <p className="text-xs font-mono">{PROFITS_TOOLTIPS.operatingCosts}</p>
                </TooltipContent>
              </Tooltip>
              <span className="font-mono text-[10px] text-zinc-500">Adjust cost percentages based on actual property operations</span>
            </div>
            <div className="p-4 space-y-3">
              {operatingCosts.map(cost => (
                <div key={cost.label} className="flex items-center gap-4">
                  <span className="font-mono text-xs text-zinc-400 w-40">{cost.label}</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={operatingCostOverrides[cost.label] ?? cost.value}
                    onChange={(e) => setOperatingCostOverrides({
                      ...operatingCostOverrides,
                      [cost.label]: Number(e.target.value)
                    })}
                    className="flex-1"
                  />
                  <span className="font-mono text-sm text-amber-400 w-12 text-right">
                    {operatingCostOverrides[cost.label] ?? cost.value}%
                  </span>
                  <span className="font-mono text-xs text-zinc-500 w-32 text-right">
                    GH₵ {(effectiveGrossRevenue * ((operatingCostOverrides[cost.label] ?? cost.value) / 100)).toLocaleString()}
                  </span>
                </div>
              ))}

              <div className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/30 mt-4">
                <span className="font-mono text-sm text-red-400">Total Operating Costs</span>
                <span className="font-mono text-lg text-red-400 font-bold">
                  {totalOperatingCostPercent.toFixed(1)}% (GH₵ {totalOperatingCostAmount.toLocaleString()})
                </span>
              </div>
            </div>
          </TerminalPanel>
        </div>

        {/* Right Column - Summary */}
        <div className="space-y-4">
          {/* Net Operating Income */}
          <TerminalPanel title="MAINTAINABLE OPERATING PROFIT">
            <div className="p-4">
              <div className="flex items-center justify-between p-4 bg-green-500/20 border border-green-500/30 mb-4">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-green-400">Annual MOP</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-green-400/60 hover:text-green-400 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs bg-zinc-900 border border-zinc-700">
                      <p className="text-xs font-mono">{PROFITS_TOOLTIPS.mop}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className="font-mono text-2xl text-green-400 font-bold">
                  GH₵ {mop.toLocaleString()}
                </span>
              </div>
              <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/30">
                <Info className="w-4 h-4 text-blue-400 mt-0.5" />
                <div className="font-mono text-xs text-blue-300">
                  MOP represents the sustainable annual profit that a reasonably efficient operator would achieve
                </div>
              </div>
            </div>
          </TerminalPanel>

          {/* Capitalization */}
          <TerminalPanel title="CAPITALIZATION">
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <label className="font-mono text-xs text-zinc-400">Cap Rate:</label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-zinc-500 hover:text-amber-400 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs bg-zinc-900 border border-zinc-700">
                      <p className="text-xs font-mono">{PROFITS_TOOLTIPS.capRate}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <input
                  type="range"
                  min="5"
                  max="18"
                  step="0.5"
                  value={capRate}
                  onChange={(e) => {
                    setUseCustomCapRate(true)
                    setCapRate(Number(e.target.value))
                  }}
                  className="flex-1"
                />
                <span className="font-mono text-sm text-amber-400 w-12 text-right">
                  {capRate}%
                </span>
              </div>
              <div className="font-mono text-xs text-zinc-500">
                Default for {currentTypeInfo?.label || 'this type'}: {CAP_RATES[propertyType] || 10}%
              </div>
            </div>
          </TerminalPanel>

          {/* Capital Value */}
          <TerminalPanel title="CAPITAL VALUE">
            <div className="p-4 space-y-3">
              <div className="flex justify-between py-2 border-b border-zinc-800">
                <span className="font-mono text-xs text-zinc-500">Maintainable Operating Profit</span>
                <span className="font-mono text-sm text-green-400">
                  GH₵ {mop.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-zinc-800">
                <span className="font-mono text-xs text-zinc-500">Capitalization Rate</span>
                <span className="font-mono text-sm text-white">
                  {capRate}%
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-zinc-800">
                <div className="flex items-center gap-1">
                  <span className="font-mono text-xs text-zinc-500">Years Purchase (1/cap rate)</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-zinc-500 hover:text-amber-400 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs bg-zinc-900 border border-zinc-700">
                      <p className="text-xs font-mono">{PROFITS_TOOLTIPS.yearssPurchase}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className="font-mono text-sm text-white">
                  {(100 / capRate).toFixed(2)} YP
                </span>
              </div>
              <div className="flex justify-between py-3 bg-amber-500/20 -mx-4 px-4">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-amber-400 font-bold">CAPITAL VALUE</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-amber-400/60 hover:text-amber-400 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs bg-zinc-900 border border-zinc-700">
                      <p className="text-xs font-mono">{PROFITS_TOOLTIPS.capitalValue}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className="font-mono text-xl text-amber-400 font-bold">
                  GH₵ {capitalValue.toLocaleString()}
                </span>
              </div>
            </div>
          </TerminalPanel>

          {/* Method Notes */}
          <TerminalPanel title="PROFITS METHOD NOTES">
            <div className="p-4 space-y-2">
              <div className="flex items-start gap-2 text-xs">
                <TrendingUp className="w-3 h-3 text-green-400 mt-0.5" />
                <span className="font-mono text-zinc-400">
                  Value based on trading potential, not just property
                </span>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <Users className="w-3 h-3 text-blue-400 mt-0.5" />
                <span className="font-mono text-zinc-400">
                  Assumes reasonably efficient operator (REO)
                </span>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <DollarSign className="w-3 h-3 text-amber-400 mt-0.5" />
                <span className="font-mono text-zinc-400">
                  MOP should reflect normalized, sustainable profits
                </span>
              </div>
            </div>
          </TerminalPanel>
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-6 flex justify-between">
        <Link
          href={getBackPath()}
          className="px-6 py-3 bg-zinc-800 text-zinc-400 font-mono text-sm hover:text-white transition-colors"
        >
          ← BACK
        </Link>
        <button
          onClick={handleSave}
          disabled={saving || capitalValue <= 0}
          className="px-6 py-3 bg-amber-500 text-black font-mono text-sm font-bold hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {(() => {
            const selectedMethods = (valuation as any)?.selectedMethods || valuation?.methods_applied || []
            if (selectedMethods.includes('residual_method')) return 'SAVE & CONTINUE TO RESIDUAL →'
            return 'SAVE & CONTINUE TO RECONCILIATION →'
          })()}
        </button>
      </div>
    </div>
    </TooltipProvider>
  )
}
