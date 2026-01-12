'use client'

/**
 * Residual Method Page
 * 
 * Used for development land valuation by working backwards from completed value.
 * Formula: Land Value = GDV - Development Costs - Developer's Profit
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
} from 'lucide-react'

// Sale prices per sqm by property type (GHS)
const SALE_PRICES: Record<string, number> = {
  house: 8500,
  apartment: 9500,
  townhouse: 8000,
  commercial: 12000,
  office: 14000,
  industrial: 5000,
  warehouse: 4000,
}

// Construction costs per sqm (GHS)
const CONSTRUCTION_COSTS: Record<string, number> = {
  house: 4500,
  apartment: 5000,
  townhouse: 4800,
  commercial: 5500,
  office: 6500,
  industrial: 3000,
  warehouse: 2500,
}

// Development timelines (months)
const TIMELINES: Record<string, { construction: number; sales: number }> = {
  house: { construction: 18, sales: 6 },
  apartment: { construction: 24, sales: 12 },
  townhouse: { construction: 20, sales: 8 },
  commercial: { construction: 18, sales: 12 },
  office: { construction: 24, sales: 18 },
  industrial: { construction: 12, sales: 6 },
  warehouse: { construction: 10, sales: 4 },
}

export default function ResidualMethodPage() {
  const params = useParams()
  const router = useRouter()
  const valuationId = params.id as string

  const [valuation, setValuation] = useState<Valuation | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Development inputs
  const [developmentType, setDevelopmentType] = useState('apartment')
  const [plotSize, setPlotSize] = useState(0)
  const [plotCoverage, setPlotCoverage] = useState(0.45)
  const [numberOfFloors, setNumberOfFloors] = useState(4)
  const [efficiency, setEfficiency] = useState(0.85)

  // Cost inputs
  const [salePricePerSqm, setSalePricePerSqm] = useState(9500)
  const [constructionCostPerSqm, setConstructionCostPerSqm] = useState(5000)
  const [professionalFees, setProfessionalFees] = useState(14.5)
  const [contingency, setContingency] = useState(5)
  const [marketingCost, setMarketingCost] = useState(3)
  const [salesCommission, setSalesCommission] = useState(3)
  const [legalFees, setLegalFees] = useState(1.5)

  // Finance inputs
  const [interestRate, setInterestRate] = useState(25)
  const [loanToValue, setLoanToValue] = useState(65)
  const [developerProfit, setDeveloperProfit] = useState(20)

  // Calculations
  const grossBuildingArea = plotSize * plotCoverage * numberOfFloors
  const netSaleableArea = grossBuildingArea * efficiency

  // Gross Development Value
  const gdv = netSaleableArea * salePricePerSqm

  // Construction Costs
  const constructionCost = grossBuildingArea * constructionCostPerSqm
  const professionalFeesAmount = constructionCost * (professionalFees / 100)
  const contingencyAmount = constructionCost * (contingency / 100)
  const totalConstructionCost = constructionCost + professionalFeesAmount + contingencyAmount

  // Sales & Marketing Costs
  const marketingAmount = gdv * (marketingCost / 100)
  const salesCommissionAmount = gdv * (salesCommission / 100)
  const legalFeesAmount = gdv * (legalFees / 100)
  const totalSalesCost = marketingAmount + salesCommissionAmount + legalFeesAmount

  // Finance Costs (simplified - average outstanding balance over construction period)
  const timeline = TIMELINES[developmentType] || { construction: 18, sales: 12 }
  const totalMonths = timeline.construction + timeline.sales
  const avgOutstanding = totalConstructionCost * (loanToValue / 100) * 0.5
  const financeCost = avgOutstanding * (interestRate / 100) * (totalMonths / 12)

  // Total Development Costs
  const totalDevelopmentCosts = totalConstructionCost + totalSalesCost + financeCost

  // Developer's Profit
  const profitAmount = totalDevelopmentCosts * (developerProfit / 100)

  // Residual Land Value
  const residualLandValue = gdv - totalDevelopmentCosts - profitAmount
  const landValuePerSqm = plotSize > 0 ? residualLandValue / plotSize : 0

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
          setPlotSize(prop.total_area_sqm || prop.plot_size || 0)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load valuation')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [valuationId])

  // Update defaults when development type changes
  useEffect(() => {
    setSalePricePerSqm(SALE_PRICES[developmentType] || 8500)
    setConstructionCostPerSqm(CONSTRUCTION_COSTS[developmentType] || 5000)
  }, [developmentType])

  // Save and continue
  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)

      await valuationsApi.update(valuationId, {
        method_results: {
          ...(valuation?.method_results || {}),
          residual_method: {
            value: residualLandValue,
            confidence: calculateConfidence(),
            gdv,
            totalConstructionCost,
            totalSalesCost,
            financeCost,
            profitAmount,
            residualLandValue,
            landValuePerSqm,
            developmentType,
            netSaleableArea,
          },
        },
        current_step: 7,
      })

      // Navigate to reconciliation (Residual is typically last specialized method)
      router.push(`/dashboard/valuations/${valuationId}/reconciliation`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const calculateConfidence = () => {
    let score = 0.4
    if (plotSize > 0) score += 0.15
    if (gdv > 0) score += 0.15
    if (residualLandValue > 0) score += 0.15
    if (developerProfit >= 15 && developerProfit <= 25) score += 0.15
    return Math.min(score, 1)
  }

  // Determine back navigation
  const getBackPath = () => {
    const selectedMethods = (valuation as any)?.selectedMethods || valuation?.methods_applied || []
    if (selectedMethods.includes('profits_method')) {
      return `/dashboard/valuations/${valuationId}/profits`
    }
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

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        <span className="ml-3 font-mono text-sm text-zinc-400">Loading residual method...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href={getBackPath()} className="p-2 hover:bg-zinc-800 transition-colors">
            <ArrowLeft className="w-4 h-4 text-zinc-400" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-xl text-white">RESIDUAL METHOD</h1>
              <MethodBadge method="RESIDUAL" />
            </div>
            <p className="font-mono text-xs text-zinc-500">Development Land Valuation</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ConfidenceBar score={calculateConfidence() * 100} />
        </div>
      </div>

      {error && <div className="mb-4"><AlertBanner type="error" title="Error" message={error} /></div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column - Development Details */}
        <div className="lg:col-span-2 space-y-4">
          {/* Development Type & Site */}
          <TerminalPanel title="DEVELOPMENT SCHEME">
            <div className="p-4 space-y-4">
              <div>
                <label className="font-mono text-[10px] text-zinc-500 block mb-2">DEVELOPMENT TYPE</label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.keys(SALE_PRICES).map(type => (
                    <button
                      key={type}
                      onClick={() => setDevelopmentType(type)}
                      className={`p-2 border text-center transition-colors ${
                        developmentType === type
                          ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                          : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                      }`}
                    >
                      <div className="font-mono text-xs font-bold uppercase">{type}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 block mb-1">PLOT SIZE (SQM)</label>
                  <input
                    type="number"
                    value={plotSize}
                    onChange={(e) => setPlotSize(Number(e.target.value))}
                    className="w-full bg-black border border-zinc-700 p-2 font-mono text-sm text-white"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 block mb-1">PLOT COVERAGE %</label>
                  <input
                    type="number"
                    value={plotCoverage * 100}
                    onChange={(e) => setPlotCoverage(Number(e.target.value) / 100)}
                    className="w-full bg-black border border-zinc-700 p-2 font-mono text-sm text-white"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 block mb-1">NO. OF FLOORS</label>
                  <input
                    type="number"
                    value={numberOfFloors}
                    onChange={(e) => setNumberOfFloors(Number(e.target.value))}
                    className="w-full bg-black border border-zinc-700 p-2 font-mono text-sm text-white"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 block mb-1">EFFICIENCY %</label>
                  <input
                    type="number"
                    value={efficiency * 100}
                    onChange={(e) => setEfficiency(Number(e.target.value) / 100)}
                    className="w-full bg-black border border-zinc-700 p-2 font-mono text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 p-3 bg-zinc-900 border border-zinc-700">
                <div>
                  <span className="font-mono text-xs text-zinc-500">Gross Building Area</span>
                  <div className="font-mono text-lg text-white">{grossBuildingArea.toLocaleString()} sqm</div>
                </div>
                <div>
                  <span className="font-mono text-xs text-zinc-500">Net Saleable Area</span>
                  <div className="font-mono text-lg text-amber-400">{netSaleableArea.toLocaleString()} sqm</div>
                </div>
              </div>
            </div>
          </TerminalPanel>

          {/* Gross Development Value */}
          <TerminalPanel title="GROSS DEVELOPMENT VALUE (GDV)">
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 block mb-1">SALE PRICE/SQM (GH₵)</label>
                  <input
                    type="number"
                    value={salePricePerSqm}
                    onChange={(e) => setSalePricePerSqm(Number(e.target.value))}
                    className="w-full bg-black border border-zinc-700 p-2 font-mono text-sm text-white"
                  />
                </div>
                <div className="flex items-end">
                  <div className="w-full p-3 bg-green-500/20 border border-green-500/30">
                    <span className="font-mono text-xs text-green-400 block">GDV</span>
                    <span className="font-mono text-xl text-green-400 font-bold">
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
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 block mb-1">CONSTRUCTION/SQM (GH₵)</label>
                  <input
                    type="number"
                    value={constructionCostPerSqm}
                    onChange={(e) => setConstructionCostPerSqm(Number(e.target.value))}
                    className="w-full bg-black border border-zinc-700 p-2 font-mono text-sm text-white"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 block mb-1">PROFESSIONAL FEES %</label>
                  <input
                    type="number"
                    value={professionalFees}
                    onChange={(e) => setProfessionalFees(Number(e.target.value))}
                    className="w-full bg-black border border-zinc-700 p-2 font-mono text-sm text-white"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 block mb-1">CONTINGENCY %</label>
                  <input
                    type="number"
                    value={contingency}
                    onChange={(e) => setContingency(Number(e.target.value))}
                    className="w-full bg-black border border-zinc-700 p-2 font-mono text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 block mb-1">MARKETING %</label>
                  <input
                    type="number"
                    value={marketingCost}
                    onChange={(e) => setMarketingCost(Number(e.target.value))}
                    className="w-full bg-black border border-zinc-700 p-2 font-mono text-sm text-white"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 block mb-1">SALES COMMISSION %</label>
                  <input
                    type="number"
                    value={salesCommission}
                    onChange={(e) => setSalesCommission(Number(e.target.value))}
                    className="w-full bg-black border border-zinc-700 p-2 font-mono text-sm text-white"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 block mb-1">LEGAL FEES %</label>
                  <input
                    type="number"
                    value={legalFees}
                    onChange={(e) => setLegalFees(Number(e.target.value))}
                    className="w-full bg-black border border-zinc-700 p-2 font-mono text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 block mb-1">INTEREST RATE %</label>
                  <input
                    type="number"
                    value={interestRate}
                    onChange={(e) => setInterestRate(Number(e.target.value))}
                    className="w-full bg-black border border-zinc-700 p-2 font-mono text-sm text-white"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 block mb-1">LOAN TO VALUE %</label>
                  <input
                    type="number"
                    value={loanToValue}
                    onChange={(e) => setLoanToValue(Number(e.target.value))}
                    className="w-full bg-black border border-zinc-700 p-2 font-mono text-sm text-white"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 block mb-1">DEV. TIMELINE (MONTHS)</label>
                  <input
                    type="number"
                    value={totalMonths}
                    disabled
                    className="w-full bg-zinc-900 border border-zinc-700 p-2 font-mono text-sm text-zinc-500"
                  />
                </div>
              </div>
            </div>
          </TerminalPanel>
        </div>

        {/* Right Column - Summary */}
        <div className="space-y-4">
          {/* Developer Profit */}
          <TerminalPanel title="DEVELOPER'S PROFIT">
            <div className="p-4">
              <div className="flex items-center gap-4 mb-4">
                <label className="font-mono text-xs text-zinc-400">Profit on Cost:</label>
                <input
                  type="range"
                  min="10"
                  max="35"
                  value={developerProfit}
                  onChange={(e) => setDeveloperProfit(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="font-mono text-sm text-amber-400 w-12 text-right">
                  {developerProfit}%
                </span>
              </div>
              <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/30">
                <Info className="w-4 h-4 text-blue-400 mt-0.5" />
                <div className="font-mono text-xs text-blue-300">
                  Ghana market typically requires 20-25% profit margin due to risk factors
                </div>
              </div>
            </div>
          </TerminalPanel>

          {/* Residual Calculation */}
          <TerminalPanel title="RESIDUAL CALCULATION">
            <div className="p-4 space-y-3">
              <div className="flex justify-between py-2 border-b border-zinc-800">
                <span className="font-mono text-xs text-zinc-500">Gross Development Value</span>
                <span className="font-mono text-sm text-green-400">
                  GH₵ {gdv.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-zinc-800">
                <span className="font-mono text-xs text-zinc-500">Less: Construction Costs</span>
                <span className="font-mono text-sm text-red-400">
                  -GH₵ {totalConstructionCost.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-zinc-800">
                <span className="font-mono text-xs text-zinc-500">Less: Sales & Marketing</span>
                <span className="font-mono text-sm text-red-400">
                  -GH₵ {totalSalesCost.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-zinc-800">
                <span className="font-mono text-xs text-zinc-500">Less: Finance Costs</span>
                <span className="font-mono text-sm text-red-400">
                  -GH₵ {financeCost.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-zinc-800">
                <span className="font-mono text-xs text-zinc-500">Less: Developer Profit ({developerProfit}%)</span>
                <span className="font-mono text-sm text-red-400">
                  -GH₵ {profitAmount.toLocaleString()}
                </span>
              </div>
              <div className={`flex justify-between py-3 -mx-4 px-4 ${residualLandValue >= 0 ? 'bg-amber-500/20' : 'bg-red-500/20'}`}>
                <span className={`font-mono text-sm font-bold ${residualLandValue >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                  RESIDUAL LAND VALUE
                </span>
                <span className={`font-mono text-xl font-bold ${residualLandValue >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                  GH₵ {residualLandValue.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-2 bg-zinc-900 -mx-4 px-4">
                <span className="font-mono text-xs text-zinc-500">Value per SQM of Land</span>
                <span className="font-mono text-sm text-white">
                  GH₵ {landValuePerSqm.toLocaleString()}/sqm
                </span>
              </div>
            </div>
          </TerminalPanel>

          {/* Viability Check */}
          {residualLandValue < 0 && (
            <div className="p-4 bg-red-500/10 border border-red-500/30">
              <div className="flex items-start gap-3">
                <Building2 className="w-5 h-5 text-red-400" />
                <div>
                  <div className="font-mono text-sm text-red-400 font-bold mb-1">NEGATIVE LAND VALUE</div>
                  <div className="font-mono text-xs text-red-300">
                    The development scheme is not viable at current assumptions. Consider:
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>Increasing sale price</li>
                      <li>Reducing construction costs</li>
                      <li>Increasing density/floors</li>
                      <li>Reducing developer profit</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
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
          disabled={saving || residualLandValue <= 0}
          className="px-6 py-3 bg-amber-500 text-black font-mono text-sm font-bold hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          SAVE & CONTINUE TO RECONCILIATION →
        </button>
      </div>
    </div>
  )
}
