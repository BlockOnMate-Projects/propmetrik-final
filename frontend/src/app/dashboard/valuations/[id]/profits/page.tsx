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
import { valuationsApi } from '@/lib/valuation-api'
import { fetchApi } from '@/lib/api'
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
// Trading types are only id/label/icon/metric here. Revenue/unit, operating cost ratios, operator's
// remuneration and the trading cap rate ALL come from the Data Hub (trading_property_benchmarks),
// resolved by the Node /profits/value route. No hardcoded values drive the valuation.
const PROPERTY_TYPES = [
  { id: 'hotel', label: 'Hotel', icon: Hotel, metric: 'rooms' },
  { id: 'hospital', label: 'Hospital', icon: Stethoscope, metric: 'beds' },
  { id: 'school', label: 'School', icon: GraduationCap, metric: 'students' },
  { id: 'restaurant', label: 'Restaurant', icon: Utensils, metric: 'sqm' },
  { id: 'fuel_station', label: 'Fuel Station', icon: Fuel, metric: 'pumps' },
  { id: 'healthcare', label: 'Healthcare', icon: Stethoscope, metric: 'sqm' },
]

// Humanise an operating-cost ratio key (e.g. "cost_of_sales" → "Cost Of Sales") for display.
const humanizeCost = (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())

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

  // Revenue inputs — benchmark revenue/unit is resolved server-side; the valuer may override it or
  // enter actual audited turnover (Fair Maintainable Turnover, preferred).
  const [revenuePerUnit, setRevenuePerUnit] = useState(0)
  const [useCustomRevenue, setUseCustomRevenue] = useState(false)
  const [actualTurnover, setActualTurnover] = useState<number | ''>('')

  // Operating cost overrides (keyed by ratio key, stored as percentages)
  const [operatingCostOverrides, setOperatingCostOverrides] = useState<Record<string, number>>({})

  // Capitalization — trading cap rate from the benchmark (echoed from the result), overridable.
  const [capRate, setCapRate] = useState(0)
  const [useCustomCapRate, setUseCustomCapRate] = useState(false)
  const [systemCapRate, setSystemCapRate] = useState<number | null>(null)
  const [capRateMethodology, setCapRateMethodology] = useState<string | null>(null)
  const [capRateConfidence, setCapRateConfidence] = useState<string | null>(null)
  const [capRateRange, setCapRateRange] = useState<{ low: number; high: number } | null>(null)
  const [unitMetric, setUnitMetric] = useState<string | null>(null)
  const [capRateProvenance, setCapRateProvenance] = useState<any>(null)

  // Python calculation results
  const [pythonResult, setPythonResult] = useState<any>(null)

  // ── Render-only: every figure comes from the Python profits engine (single source of truth). ──
  const det: any = pythonResult?.details || {}
  // When actual Fair Maintainable Turnover is entered it is the valuation basis (RICS-preferred);
  // the unit estimate is then disabled.
  const hasActualTurnover = typeof actualTurnover === 'number' && actualTurnover > 0
  const potentialGrossRevenue = det.potential_gross_revenue ?? 0
  const effectiveGrossRevenue = det.effective_gross_revenue ?? 0
  const operatingCosts = Object.entries(det.operating_cost_ratios || {}).map(
    ([label, frac]: any) => ({ label, value: Math.round((frac as number) * 1000) / 10 })
  )
  const totalOperatingCostPercent = (det.operating_ratio ?? 0) * 100
  const totalOperatingCostAmount = det.operating_costs ?? 0
  const netOperatingIncome = det.net_profit ?? 0
  const operatorRemuneration = det.operator_remuneration ?? 0
  const returnOnOperatorCapital = det.return_on_operator_capital ?? 0
  const mop = det.maintainable_profit ?? 0
  const capitalValue = pythonResult?.estimated_value ?? 0
  const confidenceScore = pythonResult?.confidence_score ?? 0

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
          // Infer a starting unit count from the property; the valuer adjusts it. The trading cap
          // rate + benchmarks now come from the Data Hub via the /profits/value route, not here.
          if (prop.bedrooms) setUnitCount(prop.bedrooms)
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

  // Run the profits engine via the Node route — the SINGLE source of truth. It resolves the
  // revenue/unit, operating cost ratios, operator's remuneration % and trading cap rate from the
  // Data Hub (applying any valuer overrides / actual turnover) and runs the Python engine.
  useEffect(() => {
    const calculateProfits = async () => {
      if (!valuation?.property || !propertyType) return
      const hasActual = typeof actualTurnover === 'number' && actualTurnover > 0
      if (!hasActual && unitCount <= 0) return
      setCalculating(true)
      setError(null)
      try {
        const body: any = { trading_property_type: propertyType }
        if (hasActual) {
          body.gross_annual_revenue = actualTurnover
        } else {
          body.unit_count = unitCount
          if (occupancyRate > 0) body.occupancy_rate = occupancyRate
          if (useCustomRevenue && revenuePerUnit > 0) body.revenue_per_unit = revenuePerUnit
        }
        if (useCustomCapRate && capRate > 0) body.cap_rate = capRate / 100
        // Operating-cost overrides: send the full ratio set (benchmark values + the valuer's edits)
        // whenever any slider has been changed.
        if (Object.keys(operatingCostOverrides).length > 0) {
          const merged: Record<string, number> = {}
          for (const c of operatingCosts) merged[c.label] = (operatingCostOverrides[c.label] ?? c.value) / 100
          body.operating_cost_ratios = merged
        }

        const response = await fetchApi<any>(`/valuations/${valuationId}/profits/value`, {
          method: 'POST',
          body: JSON.stringify(body),
        })
        const data = response?.data
        if (!data) { setPythonResult(null); return }
        setPythonResult(data)

        const d = data.details || {}
        // Echo engine-resolved values into the editable fields (display only, when not overridden).
        if (!useCustomCapRate && d.cap_rate) setCapRate(Math.round(d.cap_rate * 10000) / 100)
        if (d.cap_rate_range) setCapRateRange({ low: d.cap_rate_range.low * 100, high: d.cap_rate_range.high * 100 })
        if (!useCustomRevenue && d.revenue_per_unit) setRevenuePerUnit(d.revenue_per_unit)
        if (response?.meta?.unit_metric) setUnitMetric(response.meta.unit_metric)
        setCapRateProvenance(response?.meta?.cap_rate_provenance || null)
      } catch (err: any) {
        setPythonResult(null)
        setError(err?.message || 'The profits engine could not value this property — check the required inputs (unit count or actual turnover).')
      } finally {
        setCalculating(false)
      }
    }
    const timer = setTimeout(calculateProfits, 500)
    return () => clearTimeout(timer)
  }, [valuation, valuationId, propertyType, unitCount, occupancyRate, revenuePerUnit, useCustomRevenue, capRate, useCustomCapRate, actualTurnover, operatingCostOverrides])

  // Reset overrides when the trading type changes (benchmarks differ per type).
  useEffect(() => {
    setOperatingCostOverrides({})
    setUseCustomRevenue(false)
    setUseCustomCapRate(false)
  }, [propertyType])

  // Save and continue
  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)

      // Strict: only the engine result is persisted — no local fallback calculation.
      if (!pythonResult) {
        setError('Cannot save — the profits engine has not returned a value yet. Resolve the required inputs first.')
        setSaving(false)
        return
      }

      await valuationsApi.update(valuationId, {
        method_results: {
          ...(valuation?.method_results || {}),
          profits_method: {
            value: pythonResult.estimated_value,
            confidence: pythonResult.confidence_score,
            confidence_level: pythonResult.confidence_level,
            value_range: pythonResult.value_range,
            details: { ...pythonResult.details, propertyType, unitCount },
            assumptions: pythonResult.assumptions ?? [],
            limitations: pythonResult.limitations ?? [],
            calculated_by: 'python_rics_engine',
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
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        <span className="ml-3 font-mono text-sm text-muted-foreground">Loading profits method...</span>
      </div>
    )
  }

  return (
    <TooltipProvider>
    <div className="min-h-screen bg-background text-foreground p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href={getBackPath()} className="p-2 hover:bg-muted transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-xl text-foreground">PROFITS METHOD</h1>
              <MethodBadge method="PROFITS" />
            </div>
            <p className="font-mono text-xs text-muted-foreground">Trading Property Valuation</p>
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
                  <HelpCircle className="w-3 h-3 text-muted-foreground hover:text-amber-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs bg-card border border-border">
                  <p className="text-xs font-mono">{PROFITS_TOOLTIPS.propertyType}</p>
                </TooltipContent>
              </Tooltip>
              <span className="font-mono text-[10px] text-muted-foreground">Select property type for appropriate cost ratios</span>
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
                        ? 'bg-amber-500/20 border-amber-500 text-amber-600 dark:text-amber-400'
                        : 'bg-card border-border text-muted-foreground hover:border-zinc-500'
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
                    <label className="font-mono text-[10px] text-muted-foreground">
                      NUMBER OF {currentTypeInfo?.metric?.toUpperCase() || 'UNITS'}
                    </label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-muted-foreground hover:text-amber-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs bg-card border border-border">
                        <p className="text-xs font-mono">{PROFITS_TOOLTIPS.unitCount}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <input
                    type="number"
                    value={unitCount}
                    disabled={hasActualTurnover}
                    onChange={(e) => setUnitCount(Number(e.target.value))}
                    className={`w-full bg-background border border-border p-2 font-mono text-sm text-foreground ${hasActualTurnover ? 'opacity-40' : ''}`}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <label className="font-mono text-[10px] text-muted-foreground">
                      REVENUE PER {currentTypeInfo?.metric?.toUpperCase() || 'UNIT'}/YEAR (GH₵)
                    </label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-muted-foreground hover:text-amber-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs bg-card border border-border">
                        <p className="text-xs font-mono">{PROFITS_TOOLTIPS.revenuePerUnit}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <input
                    type="number"
                    value={revenuePerUnit}
                    disabled={hasActualTurnover}
                    onChange={(e) => {
                      setUseCustomRevenue(true)
                      setRevenuePerUnit(Number(e.target.value))
                    }}
                    className={`w-full bg-background border border-border p-2 font-mono text-sm text-foreground ${hasActualTurnover ? 'opacity-40' : ''}`}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <label className="font-mono text-[10px] text-muted-foreground">OCCUPANCY RATE %</label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-muted-foreground hover:text-amber-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs bg-card border border-border">
                        <p className="text-xs font-mono">{PROFITS_TOOLTIPS.occupancyRate}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <input
                    type="number"
                    value={occupancyRate}
                    disabled={hasActualTurnover}
                    onChange={(e) => setOccupancyRate(Number(e.target.value))}
                    className={`w-full bg-background border border-border p-2 font-mono text-sm text-foreground ${hasActualTurnover ? 'opacity-40' : ''}`}
                  />
                </div>
              </div>

              {/* Actual audited turnover (Fair Maintainable Turnover) — preferred over the unit estimate. */}
              <div className="flex items-center gap-3 p-3 bg-card border border-border">
                <label className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">ACTUAL ANNUAL TURNOVER (GH₵)</label>
                <input
                  type="number"
                  value={actualTurnover}
                  placeholder="optional — from trading accounts; overrides the unit estimate"
                  onChange={(e) => setActualTurnover(e.target.value === '' ? '' : Number(e.target.value))}
                  className="flex-1 bg-background border border-border p-2 font-mono text-sm text-foreground placeholder-zinc-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 p-3 bg-card border border-border">
                <div>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-xs text-muted-foreground">Potential Gross Revenue</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-muted-foreground hover:text-amber-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs bg-card border border-border">
                        <p className="text-xs font-mono">{PROFITS_TOOLTIPS.pgr}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="font-mono text-lg text-foreground">
                    GH₵ {potentialGrossRevenue.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-xs text-muted-foreground">Effective Gross Revenue</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-muted-foreground hover:text-amber-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs bg-card border border-border">
                        <p className="text-xs font-mono">{PROFITS_TOOLTIPS.egr}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="font-mono text-lg text-green-600 dark:text-green-400">
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
                  <HelpCircle className="w-3 h-3 text-muted-foreground hover:text-amber-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs bg-card border border-border">
                  <p className="text-xs font-mono">{PROFITS_TOOLTIPS.operatingCosts}</p>
                </TooltipContent>
              </Tooltip>
              <span className="font-mono text-[10px] text-muted-foreground">Adjust cost percentages based on actual property operations</span>
            </div>
            <div className="p-4 space-y-3">
              {operatingCosts.map(cost => (
                <div key={cost.label} className="flex items-center gap-4">
                  <span className="font-mono text-xs text-muted-foreground w-40">{humanizeCost(cost.label)}</span>
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
                  <span className="font-mono text-sm text-amber-600 dark:text-amber-400 w-12 text-right">
                    {operatingCostOverrides[cost.label] ?? cost.value}%
                  </span>
                  <span className="font-mono text-xs text-muted-foreground w-32 text-right">
                    GH₵ {(effectiveGrossRevenue * ((operatingCostOverrides[cost.label] ?? cost.value) / 100)).toLocaleString()}
                  </span>
                </div>
              ))}

              <div className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/30 mt-4">
                <span className="font-mono text-sm text-red-600 dark:text-red-400">Total Operating Costs</span>
                <span className="font-mono text-lg text-red-600 dark:text-red-400 font-bold">
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
                  <span className="font-mono text-sm text-green-600 dark:text-green-400">Annual MOP</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-green-600 dark:text-green-400/60 hover:text-green-400 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs bg-card border border-border">
                      <p className="text-xs font-mono">{PROFITS_TOOLTIPS.mop}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className="font-mono text-2xl text-green-600 dark:text-green-400 font-bold">
                  GH₵ {mop.toLocaleString()}
                </span>
              </div>
              {/* Divisible balance: net profit less the operator's share = profit to the property. */}
              <div className="space-y-1 mb-3 px-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-muted-foreground">Net operating profit</span>
                  <span className="font-mono text-xs text-foreground">GH₵ {netOperatingIncome.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    Less: operator&apos;s remuneration ({((det.operator_remuneration_pct ?? 0) * 100).toFixed(0)}%)
                  </span>
                  <span className="font-mono text-xs text-red-600 dark:text-red-400">− GH₵ {operatorRemuneration.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    Less: return on operator&apos;s capital ({((det.return_on_operator_capital_pct ?? 0) * 100).toFixed(0)}% on FF&amp;E + stock)
                  </span>
                  <span className="font-mono text-xs text-red-600 dark:text-red-400">− GH₵ {returnOnOperatorCapital.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-1">
                  <span className="font-mono text-[11px] text-muted-foreground">= Maintainable profit (to property)</span>
                  <span className="font-mono text-xs text-green-600 dark:text-green-400">GH₵ {mop.toLocaleString()}</span>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/30">
                <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div className="font-mono text-xs text-blue-600 dark:text-blue-300">
                  MOP is the profit attributable to the property — net operating profit after the
                  Reasonably Efficient Operator&apos;s remuneration (the divisible balance).
                </div>
              </div>
            </div>
          </TerminalPanel>

          {/* Capitalization */}
          <TerminalPanel title="CAPITALIZATION">
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <label className="font-mono text-xs text-muted-foreground">Cap Rate:</label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-muted-foreground hover:text-amber-400 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs bg-card border border-border">
                      <p className="text-xs font-mono">{PROFITS_TOOLTIPS.capRate}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <input
                  type="range"
                  min="3"
                  max="20"
                  step="0.25"
                  value={capRate}
                  onChange={(e) => {
                    setUseCustomCapRate(true)
                    setCapRate(Number(e.target.value))
                  }}
                  className="flex-1"
                />
                <span className="font-mono text-sm text-amber-600 dark:text-amber-400 w-14 text-right">
                  {capRate ? `${capRate}%` : '—'}
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {(() => {
                    const src = useCustomCapRate ? 'valuer_override' : (capRateProvenance?.source || 'indicative_benchmark')
                    const label = src === 'valuer_override' ? 'VALUER OVERRIDE'
                      : src === 'market_analytics' ? `MARKET ANALYTICS${capRateProvenance?.sample_size ? ` · ${capRateProvenance.sample_size} comps` : ''}`
                      : 'INDICATIVE BENCHMARK'
                    const cls = src === 'market_analytics' ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                      : src === 'indicative_benchmark' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                      : 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                    return <span className={`font-mono text-[9px] px-1.5 py-0.5 ${cls}`}>{label}</span>
                  })()}
                  {useCustomCapRate && (
                    <button
                      onClick={() => { setUseCustomCapRate(false); if (det?.cap_rate) setCapRate(Math.round(det.cap_rate * 10000) / 100) }}
                      className="font-mono text-[9px] text-blue-600 dark:text-blue-400 hover:text-blue-300 underline"
                    >
                      Reset to analytics
                    </button>
                  )}
                </div>
                {!useCustomCapRate && capRateProvenance?.note && (
                  <div className="font-mono text-[10px] text-muted-foreground">{capRateProvenance.note}</div>
                )}
                {capRateRange && (
                  <div className="font-mono text-[10px] text-muted-foreground">
                    Yield range: {capRateRange.low.toFixed(2)}% – {capRateRange.high.toFixed(2)}%
                  </div>
                )}
              </div>
            </div>
          </TerminalPanel>

          {/* Capital Value */}
          <TerminalPanel title="CAPITAL VALUE">
            <div className="p-4 space-y-3">
              <div className="flex justify-between py-2 border-b border-border">
                <span className="font-mono text-xs text-muted-foreground">Maintainable Operating Profit</span>
                <span className="font-mono text-sm text-green-600 dark:text-green-400">
                  GH₵ {mop.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="font-mono text-xs text-muted-foreground">Capitalization Rate</span>
                <span className="font-mono text-sm text-foreground">
                  {capRate}%
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <div className="flex items-center gap-1">
                  <span className="font-mono text-xs text-muted-foreground">Years Purchase (1/cap rate)</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-muted-foreground hover:text-amber-400 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs bg-card border border-border">
                      <p className="text-xs font-mono">{PROFITS_TOOLTIPS.yearssPurchase}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className="font-mono text-sm text-foreground">
                  {(100 / capRate).toFixed(2)} YP
                </span>
              </div>
              <div className="flex justify-between py-3 bg-amber-500/20 -mx-4 px-4">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-amber-600 dark:text-amber-400 font-bold">CAPITAL VALUE</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-amber-600 dark:text-amber-400/60 hover:text-amber-400 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs bg-card border border-border">
                      <p className="text-xs font-mono">{PROFITS_TOOLTIPS.capitalValue}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className="font-mono text-xl text-amber-600 dark:text-amber-400 font-bold">
                  GH₵ {capitalValue.toLocaleString()}
                </span>
              </div>
            </div>
          </TerminalPanel>

          {/* Method Notes */}
          <TerminalPanel title="PROFITS METHOD NOTES">
            <div className="p-4 space-y-2">
              <div className="flex items-start gap-2 text-xs">
                <TrendingUp className="w-3 h-3 text-green-600 dark:text-green-400 mt-0.5" />
                <span className="font-mono text-muted-foreground">
                  Value based on trading potential, not just property
                </span>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <Users className="w-3 h-3 text-blue-600 dark:text-blue-400 mt-0.5" />
                <span className="font-mono text-muted-foreground">
                  Assumes reasonably efficient operator (REO)
                </span>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <DollarSign className="w-3 h-3 text-amber-600 dark:text-amber-400 mt-0.5" />
                <span className="font-mono text-muted-foreground">
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
          className="px-6 py-3 bg-muted text-muted-foreground font-mono text-sm hover:text-foreground transition-colors"
        >
          ← BACK
        </Link>
        <button
          onClick={handleSave}
          disabled={saving || capitalValue <= 0}
          className="px-6 py-3 bg-amber-500 text-foreground font-mono text-sm font-bold hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
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
