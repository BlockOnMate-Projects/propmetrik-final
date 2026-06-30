'use client'

/**
 * Residual Method Page
 * 
 * Used for development land valuation by working backwards from completed value.
 * Formula: Land Value = GDV - Development Costs - Developer's Profit
 */

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import {
  TerminalPanel,
  AlertBanner,
  MethodBadge,
  ConfidenceBar,
} from '@/components/ui/terminal'
import { valuationsApi, PythonMethodResponse } from '@/lib/valuation-api'
import { getSelectedMethods, getNextStep, getPrevStep, stepPath } from '@/lib/valuation-workflow'
import { fetchApi } from '@/lib/api'
import type { Valuation } from '@/types/valuation'
import {
  ArrowLeft,
  Loader2,
  Info,
  Calculator,
  Building2,
  TrendingUp,
  DollarSign,
  Percent,
  Clock,
  MapPin,
  Home,
  Ruler,
  Layers,
  HelpCircle,
  Lock,
  AlertTriangle,
} from 'lucide-react'

// RICS/GhIS Compliant Tooltips
const TOOLTIPS = {
  plotSize: 'Total land area available for development. Assumes good and marketable title and legally developable land.',
  plotCoverage: 'Percentage of land area covered by building footprint, subject to local planning and zoning regulations.',
  efficiency: 'Ratio of net saleable area to gross building area. Reflects design efficiency, circulation, and common areas.',
  netSaleableArea: 'Total area expected to generate revenue. Used as the basis for Gross Development Value.',
  salePricePerSqm: 'Indicative market price per square meter for completed units, derived from market evidence and professional judgment. Not an achieved transaction price.',
  gdv: 'Gross Development Value represents the total expected value of the completed scheme at market conditions prevailing at the valuation date, assuming stabilized sale.',
  constructionCost: 'Base construction cost applied to gross building area. Reflects current market rates and excludes abnormal or site-specific costs unless stated.',
  professionalFees: 'Includes architectural, engineering, quantity surveying, project management, and statutory consulting fees.',
  contingency: 'Allowance for unforeseen costs and construction risk. Higher contingencies may be appropriate in volatile or emerging markets.',
  marketing: 'Allowance for sales, advertising, and promotional costs incurred to achieve disposal of completed units.',
  salesCommission: 'Brokerage or agency fees payable upon sale. Applied to Gross Development Value.',
  legalFees: 'Legal and conveyancing costs associated with development and disposal.',
  interestRate: 'Development finance interest rate reflecting prevailing lending conditions and project risk. Includes lender margin.',
  loanToValue: 'Proportion of total development cost funded by debt. Used to estimate finance costs.',
  timeline: 'Total duration of construction and sales period. Directly impacts finance cost calculations.',
  financeModel: 'S-Curve model reflects time-phased drawdown of construction costs and provides a more accurate estimate of finance costs in line with RICS guidance.',
  developerProfit: 'Allowance for entrepreneurial risk, reflecting market expectations, development risk, and capital exposure. Treated as a deduction from GDV in accordance with RICS and GhIS guidance.',
  residualLandValue: 'Residual Land Value represents the maximum price payable for land after accounting for all development costs and required developer profit. Per RICS guidance, land value cannot be negative — a nil residual indicates the scheme is not viable at stated assumptions. It is highly sensitive to inputs.',
  negativeLandValue: 'A negative residual indicates the proposed development is not financially viable at the stated assumptions.',
  costBasis: 'Select whether the construction rate is quoted on Gross Building Area (standard) or Net Saleable Area. System normalizes to gross for calculation.',
}

// Tooltip component
const Tooltip = ({ text }: { text: string }) => (
  <div className="group relative inline-block ml-1">
    <HelpCircle className="w-3 h-3 text-amber-500/70 cursor-help inline" />
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-muted border border-amber-500/30 text-xs text-muted-foreground rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 w-64 z-50 font-normal">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-amber-500/30"></div>
    </div>
  </div>
)

/**
 * System-vs-User rate field — mirrors the Cost Approach pattern (system-generated value with an
 * explicit toggle for the valuer to enter their own). In SYSTEM mode the engine resolves the value
 * from market evidence (input disabled, value omitted from the request); in MY-VALUE mode the valuer
 * overrides and the variance vs the system figure is disclosed (>±20% flagged for report justification).
 */
const EvidenceRateField = ({
  label, tooltip, value, onChange, isUser, onModeChange, systemValue, systemLabel, evidence, unit = 'currency',
}: {
  label: string
  tooltip: string
  value: number
  onChange: (v: number) => void
  isUser: boolean
  onModeChange: (user: boolean) => void
  systemValue: number | null
  systemLabel: string | null
  evidence?: { count: number; p25: number; p75: number; median: number } | null
  unit?: 'currency' | 'percent'
}) => {
  const fmt = (v: number) => unit === 'percent' ? `${v}%` : `GH₵${v.toLocaleString()}`
  const variancePct = (isUser && systemValue && systemValue > 0 && value > 0)
    ? Math.round(((value - systemValue) / systemValue) * 100)
    : null
  const highVariance = variancePct !== null && Math.abs(variancePct) > 20
  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
        <label className="font-mono text-[10px] text-muted-foreground">
          {label} <Tooltip text={tooltip} />
        </label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onModeChange(false)}
            className={`px-2 py-0.5 font-mono text-[9px] border transition-colors ${
              !isUser
                ? 'bg-amber-500/20 border-amber-500 text-amber-600 dark:text-amber-400'
                : 'bg-muted border-border text-muted-foreground hover:border-zinc-600'
            }`}
          >◉ SYSTEM</button>
          <button
            type="button"
            onClick={() => onModeChange(true)}
            className={`px-2 py-0.5 font-mono text-[9px] border transition-colors ${
              isUser
                ? 'bg-amber-500/20 border-amber-500 text-amber-600 dark:text-amber-400'
                : 'bg-muted border-border text-muted-foreground hover:border-zinc-600'
            }`}
          >◯ MY VALUE</button>
        </div>
      </div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={!isUser}
        className={`w-full bg-background border p-2 font-mono text-sm text-foreground ${
          !isUser ? 'border-zinc-600 opacity-70 cursor-not-allowed' : 'border-amber-500'
        }`}
      />
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        {!isUser && systemLabel && (
          <span className="font-mono text-[9px] text-green-600 dark:text-green-400">
            ⚙ SYSTEM-GENERATED · {systemLabel.toUpperCase()}
          </span>
        )}
        {isUser && systemValue !== null && systemValue > 0 && (
          <>
            <button
              type="button"
              onClick={() => { onChange(systemValue); onModeChange(false) }}
              className="font-mono text-[9px] text-amber-600 dark:text-amber-400 hover:underline"
            >↺ reset to system: {fmt(systemValue)}</button>
            {variancePct !== null && (
              <span className={`font-mono text-[9px] ${highVariance ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {variancePct > 0 ? '+' : ''}{variancePct}% vs system
              </span>
            )}
            {highVariance && (
              <span className="font-mono text-[9px] text-red-600 dark:text-red-400 inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> &gt;±20% — justify in report
              </span>
            )}
          </>
        )}
      </div>
      {evidence && (
        <div className="font-mono text-[9px] text-muted-foreground mt-1">
          {evidence.count} comps · P25 GH₵{evidence.p25.toLocaleString()} | MED GH₵{evidence.median.toLocaleString()} | P75 GH₵{evidence.p75.toLocaleString()}
        </div>
      )}
    </div>
  )
}

// Development types available
const DEVELOPMENT_TYPES = ['house', 'apartment', 'townhouse', 'commercial', 'office', 'industrial', 'warehouse']

export default function ResidualMethodPage() {
  const params = useParams()
  const router = useRouter()
  const valuationId = params.id as string

  const [valuation, setValuation] = useState<Valuation | null>(null)
  const hydratedRef = useRef(false) // rehydrate saved inputs once on load
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Development inputs
  const [developmentType, setDevelopmentType] = useState('apartment')
  const [plotSize, setPlotSize] = useState(0)
  const [plotCoverage, setPlotCoverage] = useState(0.45)
  const [numberOfFloors, setNumberOfFloors] = useState(4)
  const [efficiency, setEfficiency] = useState(0.78)

  // Cost inputs
  // Sale price/sqm is resolved from comparable evidence by the engine — NO hardcoded default.
  // It starts unset; the engine's resolved median is echoed in. Only an explicit valuer override
  // is sent back to the engine.
  const [salePricePerSqm, setSalePricePerSqm] = useState(0)
  const [salePriceOverridden, setSalePriceOverridden] = useState(false)
  // Construction cost/sqm is resolved from the Data Hub base costs by the engine — NO hardcoded
  // default. It starts unset; the engine's resolved rate is echoed in. Only an explicit valuer
  // override is sent back to the engine.
  const [constructionCostPerSqm, setConstructionCostPerSqm] = useState(0)
  const [constructionCostOverridden, setConstructionCostOverridden] = useState(false)
  const [costBasis, setCostBasis] = useState<'gross' | 'net'>('gross') // NEW: Cost basis toggle
  const [professionalFees, setProfessionalFees] = useState(14.5)
  const [contingency, setContingency] = useState(5)
  const [marketingCost, setMarketingCost] = useState(3)
  const [salesCommission, setSalesCommission] = useState(3)
  const [legalFees, setLegalFees] = useState(1.5)

  // Finance inputs — interest rate is resolved from the Data Hub (economic_indicators, live BoG
  // benchmark) by the engine. Starts unset; the resolved live rate is echoed in. Only an explicit
  // valuer override is sent back. No hardcoded default.
  const [interestRate, setInterestRate] = useState(0)
  const [interestRateOverridden, setInterestRateOverridden] = useState(false)
  const [systemInterestRate, setSystemInterestRate] = useState<number | null>(null)
  const [loanToValue, setLoanToValue] = useState(65)
  const [targetProfit, setTargetProfit] = useState(20)
  const [useAdvancedFinance, setUseAdvancedFinance] = useState(true) // NEW: S-curve vs simple

  const [interestRateSource, setInterestRateSource] = useState<string | null>(null)

  // API-driven market data
  const [systemSalePrices, setSystemSalePrices] = useState<Record<string, number>>({})
  const [comparableEvidence, setComparableEvidence] = useState<Record<string, { count: number; p25: number; p75: number; median: number }>>({})
  const [systemConstructionCosts, setSystemConstructionCosts] = useState<Record<string, number>>({})
  const [salePriceSource, setSalePriceSource] = useState<string | null>(null)
  const [constructionCostSource, setConstructionCostSource] = useState<string | null>(null)

  // Python calculation state
  const [pythonResult, setPythonResult] = useState<PythonMethodResponse | null>(null)
  const [calculating, setCalculating] = useState(false)

  // ── Render-only: every figure comes from the Python residual engine (single source of truth). ──
  const det: any = pythonResult?.details || {}
  const grossBuildingArea = det.gross_building_area ?? 0
  const netSaleableArea = det.net_saleable_area ?? 0
  const gdv = det.gross_development_value ?? 0
  const effectiveConstructionCost = det.construction_cost_per_sqm ?? 0
  const constructionCost = det.construction_cost ?? 0
  const professionalFeesAmount = det.professional_fees ?? 0
  const contingencyAmount = det.contingency ?? 0
  const totalConstructionCost = det.total_construction_cost ?? 0
  const marketingAmount = det.marketing ?? 0
  const salesCommissionAmount = det.sales_commission ?? 0
  const legalFeesAmount = det.legal_fees ?? 0
  const totalSalesCost = det.total_sales_cost ?? 0
  const financeCost = det.finance_cost ?? 0
  const constructionMonths = det.construction_months ?? 0
  const financeAsPercentOfCost = totalConstructionCost > 0 ? (financeCost / totalConstructionCost) * 100 : 0
  const totalDevelopmentCosts = det.total_development_costs ?? 0
  const targetProfitAmount = det.developer_profit ?? 0
  const rawResidualLandValue = det.raw_residual_land_value ?? 0
  const residualLandValue = det.residual_land_value ?? (pythonResult?.estimated_value ?? 0)
  const landValuePerSqm = det.land_value_per_sqm ?? 0
  const breakEvenProfit = det.break_even_profit ?? 0
  const breakEvenProfitPercent = (det.break_even_profit_pct ?? 0) * 100
  const isViable = !!det.is_viable
  const minViableLandValue = det.min_viable_land_value ?? 0
  const profitGap = targetProfitAmount - breakEvenProfit
  const totalMonths = constructionMonths

  // Fetch valuation and economic data
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        const res = await valuationsApi.getById(valuationId)
        if (res.error) throw new Error(res.error)
        if (!res.data) throw new Error('Valuation not found')
        setValuation(res.data as Valuation)

        const prop = res.data.property
        let devType = 'house'
        if (prop) {
          // Set plot/land size from property
          const landSize = prop.land_area_sqm || prop.plot_size || 0
          setPlotSize(landSize)
          
          // Set number of floors from property
          const floors = prop.floors || 1
          setNumberOfFloors(floors)
          
          // Determine development type from property type
          const propType = (prop.property_type || '').toLowerCase()
          const propSubType = (prop.property_sub_type || '').toLowerCase()
          
          if (propType.includes('commercial') || propSubType.includes('commercial')) {
            devType = 'commercial'
          } else if (propType.includes('office') || propSubType.includes('office')) {
            devType = 'office'
          } else if (propType.includes('industrial') || propSubType.includes('industrial')) {
            devType = 'industrial'
          } else if (propType.includes('warehouse') || propSubType.includes('warehouse')) {
            devType = 'warehouse'
          } else if (propType.includes('apartment') || propSubType.includes('apartment') || propSubType.includes('flat')) {
            devType = 'apartment'
          } else if (propType.includes('townhouse') || propSubType.includes('townhouse')) {
            devType = 'townhouse'
          }
          
          setDevelopmentType(devType)

          // Calculate plot coverage if we have both land and building size
          if (landSize > 0 && prop.building_area_sqm && floors > 0) {
            const calculatedCoverage = prop.building_area_sqm / (landSize * floors)
            if (calculatedCoverage > 0 && calculatedCoverage <= 1) {
              setPlotCoverage(calculatedCoverage)
            }
          }
        }
        
        // Sale prices, construction costs, finance rate and development assumptions are all
        // resolved server-side by the /valuations/:id/residual/value route from the Data Hub.

        // Rehydrate the valuer's saved inputs (overrides the property-derived defaults) so
        // adjustments survive navigating away and back. Runs once.
        const saved = (res.data as any)?.method_results?.residual_method?.inputs
        if (!hydratedRef.current && saved && typeof saved === 'object') {
          if (saved.developmentType !== undefined) setDevelopmentType(saved.developmentType)
          if (saved.plotSize !== undefined) setPlotSize(saved.plotSize)
          if (saved.plotCoverage !== undefined) setPlotCoverage(saved.plotCoverage)
          if (saved.numberOfFloors !== undefined) setNumberOfFloors(saved.numberOfFloors)
          if (saved.efficiency !== undefined) setEfficiency(saved.efficiency)
          if (saved.salePricePerSqm !== undefined) setSalePricePerSqm(saved.salePricePerSqm)
          if (saved.salePriceOverridden !== undefined) setSalePriceOverridden(saved.salePriceOverridden)
          if (saved.constructionCostPerSqm !== undefined) setConstructionCostPerSqm(saved.constructionCostPerSqm)
          if (saved.constructionCostOverridden !== undefined) setConstructionCostOverridden(saved.constructionCostOverridden)
          if (saved.costBasis !== undefined) setCostBasis(saved.costBasis)
          if (saved.professionalFees !== undefined) setProfessionalFees(saved.professionalFees)
          if (saved.contingency !== undefined) setContingency(saved.contingency)
          if (saved.marketingCost !== undefined) setMarketingCost(saved.marketingCost)
          if (saved.salesCommission !== undefined) setSalesCommission(saved.salesCommission)
          if (saved.legalFees !== undefined) setLegalFees(saved.legalFees)
          if (saved.interestRate !== undefined) setInterestRate(saved.interestRate)
          if (saved.interestRateOverridden !== undefined) setInterestRateOverridden(saved.interestRateOverridden)
          if (saved.loanToValue !== undefined) setLoanToValue(saved.loanToValue)
          if (saved.targetProfit !== undefined) setTargetProfit(saved.targetProfit)
          if (saved.useAdvancedFinance !== undefined) setUseAdvancedFinance(saved.useAdvancedFinance)
          hydratedRef.current = true
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load valuation')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [valuationId])

  // Run the residual engine via the Node route — the SINGLE source of truth. It resolves the sale
  // price (from comparables), construction cost (base costs), finance rate (economic indicators) and
  // development assumptions (config) from the Data Hub, applies any valuer overrides, and runs the
  // Python RICS engine. The frontend renders the result only.
  useEffect(() => {
    const calculateResidual = async () => {
      if (!valuation?.property || plotSize <= 0) return

      setCalculating(true)
      setError(null)
      try {
        const body: any = {
          development_type: developmentType,
          plot_size: plotSize,
          plot_coverage: plotCoverage,
          floors: numberOfFloors,
          efficiency,
          cost_basis: costBasis,
          professional_fees_pct: professionalFees,
          contingency_pct: contingency,
          marketing_pct: marketingCost,
          sales_commission_pct: salesCommission,
          legal_fees_pct: legalFees,
          finance_ltv_pct: loanToValue,
          developer_profit_pct: targetProfit,
        }

        // Sale price: OMIT so the engine resolves the comparable median; send ONLY when the valuer
        // has explicitly overridden it. No hardcoded fallback.
        if (salePriceOverridden && salePricePerSqm > 0) body.sale_price_per_sqm = salePricePerSqm

        // Construction cost: OMIT so the engine resolves the Data Hub base rate; send ONLY when the
        // valuer has explicitly overridden it. No hardcoded fallback.
        if (constructionCostOverridden && constructionCostPerSqm > 0) body.construction_cost_per_sqm = constructionCostPerSqm

        // Finance rate: OMIT so the engine resolves the live Data Hub rate (economic_indicators, BoG
        // benchmark); send ONLY when the valuer has explicitly overridden it. No hardcoded fallback.
        if (interestRateOverridden && interestRate > 0) body.finance_rate = interestRate

        // Finance model toggle: SIMPLE assumes the FULL loan is outstanding for the whole period
        // (avg balance factor = 1.0); S-CURVE reflects time-phased drawdown, using the published
        // factor (~0.55) the engine resolves from the Data Hub config. Only SIMPLE needs an override.
        if (!useAdvancedFinance) body.finance_avg_balance_factor = 1.0

        const response = await fetchApi<any>(`/valuations/${valuationId}/residual/value`, {
          method: 'POST',
          body: JSON.stringify(body),
        })
        const data = response?.data
        if (!data) { setPythonResult(null); return }
        setPythonResult(data)

        // Echo engine-resolved values into the editable fields for display.
        const d = data.details || {}
        if (d.efficiency) setEfficiency(d.efficiency)
        if (d.plot_coverage) setPlotCoverage(d.plot_coverage)
        // Echo the engine's resolved sale price (from comparable evidence) into the field when the
        // valuer hasn't overridden it, and record the system value + provenance for the badge/reset.
        if (d.sale_price_per_sqm) {
          if (!salePriceOverridden) setSalePricePerSqm(d.sale_price_per_sqm)
          const spSrc = response?.meta?.sources?.sale_price_per_sqm
          if (spSrc === 'comparables') {
            setSystemSalePrices(prev => ({ ...prev, [developmentType]: d.sale_price_per_sqm }))
          }
        }
        // Echo the engine's resolved construction rate (from the Data Hub) into the field when the
        // valuer hasn't overridden it, and record the system value + provenance so the source badge
        // and "reset to system" affordance work.
        if (d.construction_cost_per_sqm) {
          if (!constructionCostOverridden) setConstructionCostPerSqm(d.construction_cost_per_sqm)
          const ccSrc = response?.meta?.sources?.construction_cost_per_sqm
          if (ccSrc === 'base_costs') {
            setSystemConstructionCosts(prev => ({ ...prev, [developmentType]: d.construction_cost_per_sqm }))
            setConstructionCostSource('Data Hub base costs')
          } else if (ccSrc === 'user') {
            setConstructionCostSource('valuer override')
          }
        }
        // Echo the engine's resolved finance rate (live from economic_indicators / BoG) into the
        // field when the valuer hasn't overridden it, and record the system value + provenance.
        if (d.finance_rate) {
          const ratePct = Math.round(d.finance_rate * 1000) / 10
          if (!interestRateOverridden) setInterestRate(ratePct)
          const frSrc = response?.meta?.sources?.finance_rate
          if (frSrc === 'economic_indicators') {
            setSystemInterestRate(ratePct)
            setInterestRateSource('Bank of Ghana benchmark')
          } else if (frSrc === 'user') {
            setInterestRateSource('valuer override')
          }
        }

        // Evidence + provenance from meta.
        if (response?.meta?.sale_price_evidence) {
          setComparableEvidence({
            [developmentType]: {
              count: response.meta.sale_price_evidence.count,
              p25: response.meta.sale_price_evidence.p25,
              p75: response.meta.sale_price_evidence.p75,
              median: response.meta.sale_price_evidence.median,
            },
          })
          setSalePriceSource(`${response.meta.sale_price_evidence.count} comparable listings`)
        }
      } catch (err: any) {
        setPythonResult(null)
        setError(err?.message || 'The residual engine could not value this scheme — check the required inputs.')
      } finally {
        setCalculating(false)
      }
    }

    // Debounce the calculation
    const timer = setTimeout(calculateResidual, 500)
    return () => clearTimeout(timer)
  }, [valuation, valuationId, developmentType, plotSize, plotCoverage, numberOfFloors, efficiency, salePricePerSqm, salePriceOverridden, constructionCostPerSqm, costBasis, professionalFees, contingency, marketingCost, salesCommission, legalFees, interestRate, interestRateOverridden, loanToValue, targetProfit, useAdvancedFinance, constructionCostOverridden])

  // The valuer's editable inputs — persisted so adjustments survive navigation.
  const collectInputs = () => ({
    developmentType, plotSize, plotCoverage, numberOfFloors, efficiency,
    salePricePerSqm, salePriceOverridden, constructionCostPerSqm, constructionCostOverridden,
    costBasis, professionalFees, contingency, marketingCost, salesCommission, legalFees,
    interestRate, interestRateOverridden, loanToValue, targetProfit, useAdvancedFinance,
  })

  // Persist the residual result + the valuer's inputs. Returns false if nothing to save yet.
  const persist = async () => {
    if (!pythonResult) return false
    await valuationsApi.update(valuationId, {
      method_results: {
        ...(valuation?.method_results || {}),
        residual_method: {
          value: pythonResult.estimated_value,
          confidence: pythonResult.confidence_score,
          confidence_level: pythonResult.confidence_level,
          value_range: pythonResult.value_range,
          details: pythonResult.details,
          assumptions: pythonResult.assumptions ?? [],
          limitations: pythonResult.limitations ?? [],
          developmentType,
          costBasis,
          calculated_by: 'python_rics_engine',
          inputs: collectInputs(),
        },
      },
      current_step: 8,
    })
    return true
  }

  // Save and navigate. goBack=true persists best-effort then steps to the previous methodology.
  const handleSave = async (goBack = false) => {
    try {
      setSaving(true)
      setError(null)

      if (goBack) {
        try { await persist() } catch (e) { console.warn('residual back-save failed', e) }
      } else {
        // Strict: only the engine result is persisted — no local fallback calculation.
        if (!pythonResult) {
          setError('Cannot save — the residual engine has not returned a value yet. Resolve the required inputs first.')
          setSaving(false)
          return
        }
        await persist()
      }

      const methods = getSelectedMethods(valuation)
      const dest = goBack ? getPrevStep('residual', methods) : getNextStep('residual', methods)
      router.push(stepPath(valuationId, dest))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        <span className="ml-3 font-mono text-sm text-muted-foreground">Loading residual method...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => handleSave(true)} disabled={saving} className="p-2 hover:bg-muted transition-colors disabled:opacity-50">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-xl text-foreground">RESIDUAL METHOD</h1>
              <MethodBadge method="RESIDUAL" />
            </div>
            <p className="font-mono text-xs text-muted-foreground">Development Land Valuation</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Purpose Badge - RICS Compliance */}
          <div className="px-3 py-1 bg-blue-500/10 border border-blue-500/30 rounded">
            <span className="font-mono text-[10px] text-blue-600 dark:text-blue-400">PURPOSE: DEVELOPMENT FEASIBILITY</span>
          </div>
          <ConfidenceBar score={(pythonResult?.confidence_score ?? 0) * 100} />
        </div>
      </div>

      {error && <div className="mb-4"><AlertBanner type="error" title="Error" message={error} /></div>}

      {/* Subject Property Card */}
      {valuation?.property && (
        <div className="mb-4 p-4 bg-card/50 border border-border">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-500/20 border border-amber-500/30">
                <Home className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h2 className="font-mono text-lg text-foreground mb-1">SUBJECT PROPERTY</h2>
                <div className="flex items-center gap-2 text-muted-foreground font-mono text-sm mb-3">
                  <MapPin className="w-4 h-4" />
                  <span>
                    {valuation.property.address_street || valuation.property.address || 'Address not set'}
                    {valuation.property.address_city && `, ${valuation.property.address_city}`}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-6">
                  <div>
                    <span className="font-mono text-[10px] text-muted-foreground block">PROPERTY TYPE</span>
                    <span className="font-mono text-sm text-foreground uppercase">
                      {(valuation.property.property_type || 'N/A').replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div>
                    <span className="font-mono text-[10px] text-muted-foreground block">LAND AREA</span>
                    <span className="font-mono text-sm text-amber-600 dark:text-amber-400">
                      {(valuation.property.land_area_sqm || valuation.property.plot_size || 0).toLocaleString()} sqm
                    </span>
                  </div>
                  <div>
                    <span className="font-mono text-[10px] text-muted-foreground block">BUILDING SIZE</span>
                    <span className="font-mono text-sm text-foreground">
                      {(valuation.property.building_area_sqm || 0).toLocaleString()} sqm
                    </span>
                  </div>
                  <div>
                    <span className="font-mono text-[10px] text-muted-foreground block">FLOORS</span>
                    <span className="font-mono text-sm text-foreground">
                      {valuation.property.floors || 1}
                    </span>
                  </div>
                </div>
                {(valuation.property.bedrooms || valuation.property.bathrooms) && (
                  <div className="grid grid-cols-4 gap-6 mt-2">
                    {valuation.property.bedrooms && (
                      <div>
                        <span className="font-mono text-[10px] text-muted-foreground block">BEDROOMS</span>
                        <span className="font-mono text-sm text-foreground">{valuation.property.bedrooms}</span>
                      </div>
                    )}
                    {valuation.property.bathrooms && (
                      <div>
                        <span className="font-mono text-[10px] text-muted-foreground block">BATHROOMS</span>
                        <span className="font-mono text-sm text-foreground">{valuation.property.bathrooms}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="text-right">
              <span className="font-mono text-[10px] text-muted-foreground block">CURRENT PLOT SIZE</span>
              <span className="font-mono text-2xl text-amber-600 dark:text-amber-400 font-bold">{plotSize.toLocaleString()}</span>
              <span className="font-mono text-sm text-muted-foreground ml-1">sqm</span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column - Development Details */}
        <div className="lg:col-span-2 space-y-4">
          {/* Development Type & Site */}
          <TerminalPanel title="DEVELOPMENT SCHEME">
            <div className="p-4 space-y-4">
              <div>
                <label className="font-mono text-[10px] text-muted-foreground block mb-2">DEVELOPMENT TYPE</label>
                <div className="grid grid-cols-4 gap-2">
                  {DEVELOPMENT_TYPES.map(type => (
                    <button
                      key={type}
                      onClick={() => setDevelopmentType(type)}
                      className={`p-2 border text-center transition-colors ${
                        developmentType === type
                          ? 'bg-amber-500/20 border-amber-500 text-amber-600 dark:text-amber-400'
                          : 'bg-card border-border text-muted-foreground hover:border-zinc-500'
                      }`}
                    >
                      <div className="font-mono text-xs font-bold uppercase">{type}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="font-mono text-[10px] text-muted-foreground block mb-1">
                    PLOT SIZE (SQM) <Tooltip text={TOOLTIPS.plotSize} />
                  </label>
                  <input
                    type="number"
                    value={plotSize}
                    onChange={(e) => setPlotSize(Number(e.target.value))}
                    className="w-full bg-background border border-border p-2 font-mono text-sm text-foreground"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-muted-foreground block mb-1">
                    PLOT COVERAGE % <Tooltip text={TOOLTIPS.plotCoverage} />
                  </label>
                  <input
                    type="number"
                    value={plotCoverage * 100}
                    onChange={(e) => setPlotCoverage(Number(e.target.value) / 100)}
                    className="w-full bg-background border border-border p-2 font-mono text-sm text-foreground"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-muted-foreground block mb-1">NO. OF FLOORS</label>
                  <input
                    type="number"
                    value={numberOfFloors}
                    onChange={(e) => setNumberOfFloors(Number(e.target.value))}
                    className="w-full bg-background border border-border p-2 font-mono text-sm text-foreground"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-muted-foreground block mb-1">
                    EFFICIENCY % <Tooltip text={TOOLTIPS.efficiency} />
                  </label>
                  <input
                    type="number"
                    value={efficiency * 100}
                    onChange={(e) => setEfficiency(Number(e.target.value) / 100)}
                    className="w-full bg-background border border-border p-2 font-mono text-sm text-foreground"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 p-3 bg-card border border-border">
                <div>
                  <span className="font-mono text-xs text-muted-foreground">Gross Building Area</span>
                  <div className="font-mono text-lg text-foreground">{grossBuildingArea.toLocaleString()} sqm</div>
                </div>
                <div>
                  <span className="font-mono text-xs text-muted-foreground">
                    Net Saleable Area <Tooltip text={TOOLTIPS.netSaleableArea} />
                  </span>
                  <div className="font-mono text-lg text-amber-600 dark:text-amber-400">{netSaleableArea.toLocaleString()} sqm</div>
                </div>
              </div>
            </div>
          </TerminalPanel>

          {/* Gross Development Value */}
          <TerminalPanel title="GROSS DEVELOPMENT VALUE (GDV)">
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <EvidenceRateField
                  label="SALE PRICE/SQM (GH₵)"
                  tooltip={TOOLTIPS.salePricePerSqm}
                  value={salePricePerSqm}
                  onChange={setSalePricePerSqm}
                  isUser={salePriceOverridden}
                  onModeChange={(user) => {
                    setSalePriceOverridden(user)
                    if (!user && systemSalePrices[developmentType]) setSalePricePerSqm(systemSalePrices[developmentType])
                  }}
                  systemValue={systemSalePrices[developmentType] ?? null}
                  systemLabel={salePriceSource}
                  evidence={comparableEvidence[developmentType] ?? null}
                />
                <div className="flex items-end">
                  <div className="w-full p-3 bg-green-500/20 border border-green-500/30">
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-xs text-green-600 dark:text-green-400">GDV</span>
                      <Tooltip text={TOOLTIPS.gdv} />
                    </div>
                    <span className="font-mono text-xl text-green-600 dark:text-green-400 font-bold">
                      GH₵ {gdv.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </TerminalPanel>

          {/* Development Costs */}
          <TerminalPanel title="DEVELOPMENT COSTS">
            <div className="p-4 space-y-4">
              {/* Cost Basis Toggle */}
              <div className="flex items-center justify-between p-3 bg-card border border-border">
                <div>
                  <span className="font-mono text-xs text-muted-foreground block">
                    COST BASIS <Tooltip text={TOOLTIPS.costBasis} />
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {costBasis === 'gross' ? 'Rate applied to GROSS building area' : 'Rate applied to NET saleable area (auto-converted)'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCostBasis('gross')}
                    className={`px-3 py-1 font-mono text-xs border transition-colors ${
                      costBasis === 'gross'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-600 dark:text-amber-400'
                        : 'bg-background border-border text-muted-foreground hover:border-zinc-500'
                    }`}
                  >
                    GROSS
                  </button>
                  <button
                    onClick={() => setCostBasis('net')}
                    className={`px-3 py-1 font-mono text-xs border transition-colors ${
                      costBasis === 'net'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-600 dark:text-amber-400'
                        : 'bg-background border-border text-muted-foreground hover:border-zinc-500'
                    }`}
                  >
                    NET
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <EvidenceRateField
                    label="CONSTRUCTION/SQM (GH₵)"
                    tooltip={TOOLTIPS.constructionCost}
                    value={constructionCostPerSqm}
                    onChange={setConstructionCostPerSqm}
                    isUser={constructionCostOverridden}
                    onModeChange={(user) => {
                      setConstructionCostOverridden(user)
                      if (!user && systemConstructionCosts[developmentType]) setConstructionCostPerSqm(systemConstructionCosts[developmentType])
                    }}
                    systemValue={systemConstructionCosts[developmentType] ?? null}
                    systemLabel={constructionCostSource}
                  />
                  {costBasis === 'net' && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      Effective GROSS rate: GH₵{Math.round(constructionCostPerSqm / efficiency).toLocaleString()}/sqm
                    </span>
                  )}
                </div>
                <div>
                  <label className="font-mono text-[10px] text-muted-foreground block mb-1">
                    PROFESSIONAL FEES % <Tooltip text={TOOLTIPS.professionalFees} />
                  </label>
                  <input
                    type="number"
                    value={professionalFees}
                    onChange={(e) => setProfessionalFees(Number(e.target.value))}
                    className="w-full bg-background border border-border p-2 font-mono text-sm text-foreground"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-muted-foreground block mb-1">
                    CONTINGENCY % <Tooltip text={TOOLTIPS.contingency} />
                  </label>
                  <input
                    type="number"
                    value={contingency}
                    onChange={(e) => setContingency(Number(e.target.value))}
                    className="w-full bg-background border border-border p-2 font-mono text-sm text-foreground"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="font-mono text-[10px] text-muted-foreground block mb-1">
                    MARKETING % <Tooltip text={TOOLTIPS.marketing} />
                  </label>
                  <input
                    type="number"
                    value={marketingCost}
                    onChange={(e) => setMarketingCost(Number(e.target.value))}
                    className="w-full bg-background border border-border p-2 font-mono text-sm text-foreground"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-muted-foreground block mb-1">
                    SALES COMMISSION % <Tooltip text={TOOLTIPS.salesCommission} />
                  </label>
                  <input
                    type="number"
                    value={salesCommission}
                    onChange={(e) => setSalesCommission(Number(e.target.value))}
                    className="w-full bg-background border border-border p-2 font-mono text-sm text-foreground"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-muted-foreground block mb-1">
                    LEGAL FEES % <Tooltip text={TOOLTIPS.legalFees} />
                  </label>
                  <input
                    type="number"
                    value={legalFees}
                    onChange={(e) => setLegalFees(Number(e.target.value))}
                    className="w-full bg-background border border-border p-2 font-mono text-sm text-foreground"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <EvidenceRateField
                  label="INTEREST RATE %"
                  tooltip={TOOLTIPS.interestRate}
                  unit="percent"
                  value={interestRate}
                  onChange={setInterestRate}
                  isUser={interestRateOverridden}
                  onModeChange={(user) => {
                    setInterestRateOverridden(user)
                    if (!user && systemInterestRate != null) setInterestRate(systemInterestRate)
                  }}
                  systemValue={systemInterestRate}
                  systemLabel={interestRateSource}
                />
                <div>
                  <label className="font-mono text-[10px] text-muted-foreground block mb-1">
                    LOAN TO VALUE % <Tooltip text={TOOLTIPS.loanToValue} />
                  </label>
                  <input
                    type="number"
                    value={loanToValue}
                    onChange={(e) => setLoanToValue(Number(e.target.value))}
                    className="w-full bg-background border border-border p-2 font-mono text-sm text-foreground"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-muted-foreground block mb-1">
                    DEV. TIMELINE (MONTHS) <Tooltip text={TOOLTIPS.timeline} />
                  </label>
                  <input
                    type="number"
                    value={totalMonths}
                    disabled
                    className="w-full bg-card border border-border p-2 font-mono text-sm text-muted-foreground"
                  />
                </div>
              </div>

              {/* Finance Model Toggle */}
              <div className="flex items-center justify-between p-3 bg-card border border-border">
                <div>
                  <span className="font-mono text-xs text-muted-foreground block">
                    FINANCE MODEL <Tooltip text={TOOLTIPS.financeModel} />
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {useAdvancedFinance 
                      ? 'S-curve drawdown: avg. 55% of loan outstanding' 
                      : 'Simple model: 100% loan for full period'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setUseAdvancedFinance(false)}
                    className={`px-3 py-1 font-mono text-xs border transition-colors ${
                      !useAdvancedFinance
                        ? 'bg-amber-500/20 border-amber-500 text-amber-600 dark:text-amber-400'
                        : 'bg-background border-border text-muted-foreground hover:border-zinc-500'
                    }`}
                  >
                    SIMPLE
                  </button>
                  <button
                    onClick={() => setUseAdvancedFinance(true)}
                    className={`px-3 py-1 font-mono text-xs border transition-colors ${
                      useAdvancedFinance
                        ? 'bg-amber-500/20 border-amber-500 text-amber-600 dark:text-amber-400'
                        : 'bg-background border-border text-muted-foreground hover:border-zinc-500'
                    }`}
                  >
                    S-CURVE
                  </button>
                </div>
              </div>

              {/* Finance Cost Preview */}
              <div className="grid grid-cols-2 gap-4 p-3 bg-card/50 border border-border">
                <div>
                  <span className="font-mono text-[10px] text-muted-foreground">Finance Cost</span>
                  <div className="font-mono text-sm text-red-600 dark:text-red-400">GH₵ {financeCost.toLocaleString()}</div>
                </div>
                <div>
                  <span className="font-mono text-[10px] text-muted-foreground">As % of Construction</span>
                  <div className="font-mono text-sm text-muted-foreground">
                    {totalConstructionCost > 0 ? ((financeCost / totalConstructionCost) * 100).toFixed(1) : 0}%
                  </div>
                </div>
              </div>
            </div>
          </TerminalPanel>
        </div>

        {/* Right Column - Summary */}
        <div className="space-y-4">
          {/* Developer Profit */}
          <TerminalPanel title="DEVELOPER'S PROFIT & VIABILITY">
            <div className="p-4 space-y-4">
              <div>
                <div className="flex items-center gap-4 mb-2">
                  <label className="font-mono text-xs text-muted-foreground">
                    Target Profit on Cost: <Tooltip text={TOOLTIPS.developerProfit} />
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="35"
                    value={targetProfit}
                    onChange={(e) => setTargetProfit(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="font-mono text-sm text-amber-600 dark:text-amber-400 w-12 text-right">
                    {targetProfit}%
                  </span>
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  Target profit: GH₵ {targetProfitAmount.toLocaleString()}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground mt-1">
                  Typical Ghana residential range: 20–30% of GDV
                </div>
              </div>

              {/* Break-even Analysis */}
              <div className={`p-3 border ${breakEvenProfitPercent >= 15 ? 'bg-green-500/10 border-green-500/30' : breakEvenProfitPercent >= 10 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                <div className="flex justify-between items-center mb-2">
                  <span className="font-mono text-[10px] text-muted-foreground">BREAK-EVEN PROFIT</span>
                  <span className={`font-mono text-sm font-bold ${breakEvenProfitPercent >= 15 ? 'text-green-600 dark:text-green-400' : breakEvenProfitPercent >= 10 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                    {breakEvenProfitPercent.toFixed(1)}%
                  </span>
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  {breakEvenProfitPercent >= 20 
                    ? 'Achievable profit is above typical Ghana market benchmarks.'
                    : breakEvenProfitPercent >= 15
                    ? 'Achievable profit is within acceptable range for Ghana market.'
                    : 'Achievable profit is below typical Ghana market benchmarks.'}
                </div>
                {profitGap !== 0 && (
                  <div className={`font-mono text-xs mt-1 ${profitGap > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {profitGap > 0 ? '↑' : '↓'} {Math.abs(profitGap).toFixed(1)}% {profitGap > 0 ? 'above' : 'below'} target
                  </div>
                )}
              </div>

              {/* Min Viable Land Value */}
              {minViableLandValue > 0 && minViableLandValue < residualLandValue && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/30">
                  <div className="font-mono text-[10px] text-muted-foreground mb-1">MIN VIABLE LAND VALUE (at 15% profit)</div>
                  <div className="font-mono text-sm text-blue-600 dark:text-blue-400">GH₵ {minViableLandValue.toLocaleString()}</div>
                  <div className="font-mono text-[10px] text-muted-foreground mt-1">
                    Buffer: GH₵ {(residualLandValue - minViableLandValue).toLocaleString()} above minimum
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/30">
                <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div className="font-mono text-xs text-blue-600 dark:text-blue-300">
                  Ghana market typically requires 20-25% profit margin due to risk factors
                </div>
              </div>
            </div>
          </TerminalPanel>

          {/* Sensitivity Toggles */}
          <TerminalPanel title="QUICK SENSITIVITY">
            <div className="p-4 space-y-2">
              <div className="font-mono text-[10px] text-muted-foreground mb-3">Test impact of changes:</div>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => { setSalePricePerSqm(Math.round(salePricePerSqm * 1.1)); setSalePriceOverridden(true) }}
                  className="p-2 bg-green-500/10 border border-green-500/30 hover:bg-green-500/20 transition-colors"
                >
                  <span className="font-mono text-xs text-green-600 dark:text-green-400">Sale +10%</span>
                </button>
                <button 
                  onClick={() => { setConstructionCostPerSqm(Math.round(constructionCostPerSqm * 0.9)); setConstructionCostOverridden(true) }}
                  className="p-2 bg-green-500/10 border border-green-500/30 hover:bg-green-500/20 transition-colors"
                >
                  <span className="font-mono text-xs text-green-600 dark:text-green-400">Cost -10%</span>
                </button>
                <button 
                  onClick={() => setNumberOfFloors(numberOfFloors + 1)}
                  className="p-2 bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 transition-colors"
                >
                  <span className="font-mono text-xs text-blue-600 dark:text-blue-400">Floors +1</span>
                </button>
                <button 
                  onClick={() => setTargetProfit(Math.max(10, targetProfit - 5))}
                  className="p-2 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
                >
                  <span className="font-mono text-xs text-amber-600 dark:text-amber-400">Profit -5%</span>
                </button>
              </div>
              <button 
                onClick={() => {
                  // Reset to property defaults
                  const prop = valuation?.property
                  if (prop) {
                    setPlotSize(prop.land_area_sqm || 500)
                    setNumberOfFloors(prop.floors || 1)
                    setPlotCoverage(0.5)
                    const propType = (prop.property_type || '').toLowerCase()
                    let devType = 'house'
                    if (propType.includes('office')) devType = 'office'
                    else if (propType.includes('apartment')) devType = 'apartment'
                    else if (propType.includes('commercial') || propType.includes('retail')) devType = 'commercial'
                    else if (propType.includes('warehouse')) devType = 'warehouse'
                    else if (propType.includes('industrial')) devType = 'industrial'
                    
                    setDevelopmentType(devType)
                    // Sale price, construction cost and efficiency are re-resolved by the engine.
                    setTargetProfit(20)
                  }
                }}
                className="w-full p-2 bg-muted border border-border hover:border-zinc-500 transition-colors"
              >
                <span className="font-mono text-xs text-muted-foreground">↺ Reset to Defaults</span>
              </button>
              <div className="font-mono text-[9px] text-muted-foreground mt-2 italic">
                Sensitivity testing is indicative only and does not replace full scenario analysis.
              </div>
            </div>
          </TerminalPanel>

          {/* Residual Calculation */}
          <TerminalPanel title="RESIDUAL CALCULATION">
            <div className="p-4 space-y-3">
              <div className="flex justify-between py-2 border-b border-border">
                <span className="font-mono text-xs text-muted-foreground">Gross Development Value</span>
                <span className="font-mono text-sm text-green-600 dark:text-green-400">
                  GH₵ {gdv.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="font-mono text-xs text-muted-foreground">Less: Construction Costs</span>
                <span className="font-mono text-sm text-red-600 dark:text-red-400">
                  -GH₵ {totalConstructionCost.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="font-mono text-xs text-muted-foreground">Less: Sales & Marketing</span>
                <span className="font-mono text-sm text-red-600 dark:text-red-400">
                  -GH₵ {totalSalesCost.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="font-mono text-xs text-muted-foreground">
                  Less: Finance Costs {useAdvancedFinance ? '(S-curve)' : '(Simple)'}
                </span>
                <span className="font-mono text-sm text-red-600 dark:text-red-400">
                  -GH₵ {financeCost.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="font-mono text-xs text-muted-foreground">Less: Developer Profit ({targetProfit}%)</span>
                <span className="font-mono text-sm text-red-600 dark:text-red-400">
                  -GH₵ {targetProfitAmount.toLocaleString()}
                </span>
              </div>
              <div className={`flex justify-between py-3 -mx-4 px-4 ${isViable ? 'bg-amber-500/20' : 'bg-red-500/20'}`}>
                <div>
                  <span className={`font-mono text-sm font-bold ${isViable ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                    RESIDUAL LAND VALUE <Tooltip text={TOOLTIPS.residualLandValue} />
                  </span>
                  {!isViable && (
                    <span className="ml-2 px-2 py-0.5 bg-red-500/20 border border-red-500/40 rounded font-mono text-[9px] text-red-600 dark:text-red-400">
                      RICS: LAND VALUE CANNOT BE NEGATIVE — SCHEME NOT VIABLE
                    </span>
                  )}
                </div>
                <span className={`font-mono text-xl font-bold ${isViable ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                  GH₵ {residualLandValue.toLocaleString()}
                </span>
              </div>
              {!isViable && (
                <div className="flex justify-between py-2 bg-red-500/10 -mx-4 px-4 border-t border-red-500/20">
                  <span className="font-mono text-[10px] text-red-600 dark:text-red-400">Shortfall (development not viable by)</span>
                  <span className="font-mono text-sm text-red-600 dark:text-red-400">
                    GH₵ {Math.abs(rawResidualLandValue).toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-2 bg-card -mx-4 px-4">
                <span className="font-mono text-xs text-muted-foreground">Value per SQM of Land</span>
                <span className="font-mono text-sm text-foreground">
                  GH₵ {landValuePerSqm.toLocaleString()}/sqm
                </span>
              </div>
              
              {/* Break-even Land Value Indicator */}
              {minViableLandValue > 0 && (
                <div className="flex justify-between py-2 bg-blue-500/10 -mx-4 px-4 border-t border-blue-500/20">
                  <span className="font-mono text-xs text-blue-600 dark:text-blue-400">Break-even Land Value (at 15%)</span>
                  <span className="font-mono text-sm text-blue-600 dark:text-blue-400">
                    GH₵ {minViableLandValue.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </TerminalPanel>

          {/* Viability Status */}
          {!isViable ? (
            <div className="p-4 bg-red-500/10 border border-red-500/30">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                <div>
                  <div className="font-mono text-sm text-red-600 dark:text-red-400 font-bold mb-1">⚠ SCHEME NOT VIABLE — LAND VALUE: NIL</div>
                  <div className="font-mono text-xs text-red-600 dark:text-red-300">
                    Per RICS Valuation of Development Property guidance, land value cannot be negative.
                    A nil residual indicates the proposed development is not financially viable at stated assumptions.
                  </div>
                  <div className="font-mono text-xs text-red-600 dark:text-red-300 mt-1">
                    Shortfall: GH₵ {Math.abs(rawResidualLandValue).toLocaleString()} — the development costs exceed achievable GDV.
                  </div>
                  <div className="font-mono text-xs text-muted-foreground mt-2">
                    Adjust assumptions to achieve viability:
                    <ul className="list-disc list-inside mt-1 space-y-0.5 text-red-600 dark:text-red-300/80">
                      <li>Increase sale price per sqm</li>
                      <li>Reduce construction costs</li>
                      <li>Add more floors (increase density)</li>
                      <li>Accept lower profit margin</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ) : breakEvenProfitPercent < 15 ? (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                <div>
                  <div className="font-mono text-sm text-amber-600 dark:text-amber-400 font-bold mb-1">⚡ MARGINAL VIABILITY</div>
                  <div className="font-mono text-xs text-amber-600 dark:text-amber-300">
                    Scheme is viable but profit ({breakEvenProfitPercent.toFixed(1)}%) is below typical 15% threshold.
                  </div>
                  <div className="font-mono text-xs text-muted-foreground mt-1">
                    Consider reducing land bid or improving scheme economics.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-green-500/10 border border-green-500/30">
              <div className="flex items-start gap-3">
                <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                <div>
                  <div className="font-mono text-sm text-green-600 dark:text-green-400 font-bold mb-1">✓ VIABLE SCHEME</div>
                  <div className="font-mono text-xs text-green-600 dark:text-green-300">
                    Development achieves {breakEvenProfitPercent.toFixed(1)}% profit on cost.
                  </div>
                  {breakEvenProfitPercent >= targetProfit && (
                    <div className="font-mono text-xs text-green-600 dark:text-green-300/80 mt-1">
                      Exceeds target profit of {targetProfit}% by {(breakEvenProfitPercent - targetProfit).toFixed(1)}%.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RICS/GhIS Compliance Disclosure */}
      <div className="mt-6 p-4 bg-card/50 border border-border">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="font-mono text-[10px] text-muted-foreground leading-relaxed">
            <strong className="text-muted-foreground">Residual Valuation Disclosure:</strong> This residual valuation is prepared for 
            feasibility and decision-support purposes. It is highly sensitive to assumptions regarding value, cost, finance, 
            and profit. Results should not be relied upon in isolation and must be interpreted with professional judgment. 
            Methodology is aligned with RICS residual valuation principles and GhIS development practice.
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-6 flex justify-between">
        <button
          onClick={() => handleSave(true)}
          disabled={saving}
          className="px-6 py-3 bg-muted text-muted-foreground font-mono text-sm hover:text-foreground disabled:opacity-50 transition-colors"
        >
          ← BACK TO {getPrevStep('residual', getSelectedMethods(valuation)).label}
        </button>
        <button
          onClick={() => handleSave(false)}
          disabled={saving}
          className="px-6 py-3 bg-amber-500 text-foreground font-mono text-sm font-bold hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          SAVE & CONTINUE TO {getNextStep('residual', getSelectedMethods(valuation)).label} →
        </button>
      </div>
    </div>
  )
}
