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
import { valuationsApi, pythonMethodsApi, PythonMethodResponse } from '@/lib/valuation-api'
import { valuationConfigApi, mapShortRegionToDataHub } from '@/lib/api'
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

// Development types available
const DEVELOPMENT_TYPES = ['house', 'apartment', 'townhouse', 'commercial', 'office', 'industrial', 'warehouse']

// Map development type to base_costs_per_sqm property_type
const DEV_TYPE_TO_PROPERTY_TYPE: Record<string, string> = {
  house: 'residential',
  apartment: 'residential',
  townhouse: 'residential',
  commercial: 'commercial',
  office: 'commercial',
  industrial: 'industrial',
  warehouse: 'industrial',
}

// Realistic efficiency rates by development type (Ghana market) - engineering constants
const EFFICIENCY_RATES: Record<string, number> = {
  house: 0.92,      // Houses have minimal common areas
  apartment: 0.78,  // Corridors, stairs, lift lobbies
  townhouse: 0.88,  // Some shared walls/access
  commercial: 0.75, // Shopping mall common areas
  office: 0.72,     // Lobbies, lifts, services, toilets
  industrial: 0.90, // Mostly usable space
  warehouse: 0.95,  // Minimal non-usable space
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

// S-curve drawdown factors (% of cost drawn at each stage)
const S_CURVE_DRAWDOWN = {
  month1_25: 0.15,   // First 25% of timeline: 15% of cost
  month25_50: 0.35,  // 25-50%: additional 35%
  month50_75: 0.35,  // 50-75%: additional 35%
  month75_100: 0.15, // Last 25%: final 15%
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
  const [efficiency, setEfficiency] = useState(0.78)

  // Cost inputs
  const [salePricePerSqm, setSalePricePerSqm] = useState(9500)
  const [constructionCostPerSqm, setConstructionCostPerSqm] = useState(5000)
  const [costBasis, setCostBasis] = useState<'gross' | 'net'>('gross') // NEW: Cost basis toggle
  const [professionalFees, setProfessionalFees] = useState(14.5)
  const [contingency, setContingency] = useState(5)
  const [marketingCost, setMarketingCost] = useState(3)
  const [salesCommission, setSalesCommission] = useState(3)
  const [legalFees, setLegalFees] = useState(1.5)

  // Finance inputs
  const [interestRate, setInterestRate] = useState(25)
  const [loanToValue, setLoanToValue] = useState(65)
  const [targetProfit, setTargetProfit] = useState(20)
  const [useAdvancedFinance, setUseAdvancedFinance] = useState(true) // NEW: S-curve vs simple

  // Economic data from API
  const [economicData, setEconomicData] = useState<{
    interest_rate_policy?: string;
    interest_rate_prime?: string;
    lending_rate?: string;
    mortgage_rate_avg?: string;
  } | null>(null)
  const [interestRateSource, setInterestRateSource] = useState<string | null>(null)

  // API-driven market data
  const [systemSalePrices, setSystemSalePrices] = useState<Record<string, number>>({})
  const [comparableEvidence, setComparableEvidence] = useState<Record<string, { count: number; p25: number; p75: number; median: number }>>({})
  const [systemConstructionCosts, setSystemConstructionCosts] = useState<Record<string, number>>({})
  const [loadingMarketData, setLoadingMarketData] = useState(false)
  const [salePriceSource, setSalePriceSource] = useState<string | null>(null)
  const [constructionCostSource, setConstructionCostSource] = useState<string | null>(null)

  // Python calculation state
  const [pythonResult, setPythonResult] = useState<PythonMethodResponse | null>(null)
  const [calculating, setCalculating] = useState(false)

  // Calculations
  const grossBuildingArea = plotSize * plotCoverage * numberOfFloors
  const netSaleableArea = grossBuildingArea * efficiency

  // Gross Development Value (always on NET saleable area)
  const gdv = netSaleableArea * salePricePerSqm

  // Construction Costs - normalize based on cost basis
  // If cost rate is NET-based, we need to gross it up
  const effectiveConstructionCost = costBasis === 'net' 
    ? constructionCostPerSqm / efficiency  // Convert NET rate to GROSS rate
    : constructionCostPerSqm               // Already GROSS rate
  
  const constructionCost = grossBuildingArea * effectiveConstructionCost
  const professionalFeesAmount = constructionCost * (professionalFees / 100)
  const contingencyAmount = constructionCost * (contingency / 100)
  const totalConstructionCost = constructionCost + professionalFeesAmount + contingencyAmount

  // Sales & Marketing Costs
  const marketingAmount = gdv * (marketingCost / 100)
  const salesCommissionAmount = gdv * (salesCommission / 100)
  const legalFeesAmount = gdv * (legalFees / 100)
  const totalSalesCost = marketingAmount + salesCommissionAmount + legalFeesAmount

  // Finance Costs - S-curve drawdown model (more realistic)
  const timeline = TIMELINES[developmentType] || { construction: 18, sales: 12 }
  const constructionMonths = timeline.construction
  const totalMonths = timeline.construction + timeline.sales
  
  // Calculate finance using weighted average balance with S-curve
  const calculateFinanceCost = () => {
    const loanAmount = totalConstructionCost * (loanToValue / 100)
    const monthlyRate = interestRate / 100 / 12
    
    if (useAdvancedFinance) {
      // S-curve drawdown: average balance is ~50% due to progressive drawdown
      // But we also account for timing - early months have lower balance
      const avgBalanceFactor = 0.55 // Accounts for S-curve drawdown pattern
      const avgBalance = loanAmount * avgBalanceFactor
      
      // Interest only during construction (sales period repays from proceeds)
      const interestCost = avgBalance * monthlyRate * constructionMonths
      
      return interestCost
    } else {
      // Simple model (legacy): full balance for full period
      const avgBalance = loanAmount * 0.5
      const totalMonths = constructionMonths + timeline.sales
      return avgBalance * (interestRate / 100) * (totalMonths / 12)
    }
  }
  
  const financeCost = calculateFinanceCost()
  const financeAsPercentOfCost = totalConstructionCost > 0 
    ? (financeCost / totalConstructionCost) * 100 
    : 0

  // Total Development Costs (before profit)
  const totalDevelopmentCosts = totalConstructionCost + totalSalesCost + financeCost

  // Developer's Profit Calculations
  const targetProfitAmount = totalDevelopmentCosts * (targetProfit / 100)
  
  // Residual Land Value (with target profit)
  // Raw calculation can be negative (indicates non-viable scheme)
  const rawResidualLandValue = gdv - totalDevelopmentCosts - targetProfitAmount
  // Per RICS Valuation of Development Property: market value of land cannot be negative.
  // A negative residual indicates the scheme is not viable, but land value is floored at nil.
  const residualLandValue = Math.max(0, rawResidualLandValue)
  const landValuePerSqm = plotSize > 0 ? residualLandValue / plotSize : 0

  // Break-even analysis - what profit is achievable at zero land value?
  const breakEvenProfit = gdv - totalDevelopmentCosts
  const breakEvenProfitPercent = totalDevelopmentCosts > 0 
    ? (breakEvenProfit / totalDevelopmentCosts) * 100 
    : 0
  const isViable = rawResidualLandValue > 0
  const profitGap = targetProfitAmount - breakEvenProfit

  // Minimum viable land value (at market minimum profit of 15%)
  const minimumProfit = 0.15
  const minProfitAmount = totalDevelopmentCosts * minimumProfit
  const rawMinViableLandValue = gdv - totalDevelopmentCosts - minProfitAmount
  const minViableLandValue = Math.max(0, rawMinViableLandValue)

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
          // Set realistic efficiency for this development type
          setEfficiency(EFFICIENCY_RATES[devType] || 0.78)
          
          // Calculate plot coverage if we have both land and building size
          if (landSize > 0 && prop.building_area_sqm && floors > 0) {
            const calculatedCoverage = prop.building_area_sqm / (landSize * floors)
            if (calculatedCoverage > 0 && calculatedCoverage <= 1) {
              setPlotCoverage(calculatedCoverage)
            }
          }
        }
        
        // Fetch economic data for interest rate
        try {
          const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'
          const econRes = await fetch(`${baseUrl}/data-hub/economic/snapshot`)
          if (econRes.ok) {
            const econJson = await econRes.json()
            const econData = econJson.data || econJson
            setEconomicData(econData)
            // Priority: lending_rate (actual bank rate) > prime rate > policy rate
            const lendingRate = parseFloat(econData.lending_rate || '0')
            const primeRate = parseFloat(econData.interest_rate_prime || '0')
            const policyRate = parseFloat(econData.interest_rate_policy || '0')
            const mortgageRate = parseFloat(econData.mortgage_rate_avg || '0')
            if (lendingRate > 0) {
              setInterestRate(lendingRate)
              setInterestRateSource('BOG Commercial Lending Rate')
            } else if (primeRate > 0) {
              setInterestRate(primeRate)
              setInterestRateSource('Ghana Reference Rate (Prime)')
            } else if (mortgageRate > 0) {
              setInterestRate(mortgageRate)
              setInterestRateSource('BOG Avg Mortgage Rate')
            } else if (policyRate > 0) {
              setInterestRate(policyRate + 5)
              setInterestRateSource(`BOG Policy Rate + 5% spread`)
            }
          }
        } catch {
          // Economic data fetch failed, use defaults
        }

        // Fetch market data (comparable prices + construction costs) for this region
        const regionCode = (res.data as any).property?.region || 'GAR'
        const dataHubRegion = mapShortRegionToDataHub(regionCode)
        setLoadingMarketData(true)
        try {
          const [comparablePricesRes, baseCostsRes] = await Promise.all([
            valuationConfigApi.getComparablePrices({ region: dataHubRegion }),
            valuationConfigApi.getBaseCosts({ region: dataHubRegion }),
          ])

          // Process comparable sale prices: map property_type → median price/sqm
          if (comparablePricesRes.success && comparablePricesRes.data?.length) {
            const pricesByPropType: Record<string, number> = {}
            const evidenceByPropType: Record<string, { count: number; p25: number; p75: number; median: number }> = {}
            comparablePricesRes.data.forEach((cp: any) => {
              pricesByPropType[cp.property_type] = cp.median_price_sqm
              evidenceByPropType[cp.property_type] = {
                count: cp.comparable_count,
                p25: cp.p25_price_sqm,
                p75: cp.p75_price_sqm,
                median: cp.median_price_sqm,
              }
            })
            // Map to development types
            const pricesByDevType: Record<string, number> = {}
            const evidenceByDevType: Record<string, { count: number; p25: number; p75: number; median: number }> = {}
            const devTypeToPropType: Record<string, string> = {
              house: 'residential_house',
              apartment: 'apartment_flat',
              townhouse: 'residential_house',
              commercial: 'commercial_shop',
              office: 'commercial_shop',
              industrial: 'commercial_shop',
              warehouse: 'commercial_shop',
            }
            DEVELOPMENT_TYPES.forEach(dt => {
              const propType = devTypeToPropType[dt]
              if (pricesByPropType[propType]) {
                pricesByDevType[dt] = pricesByPropType[propType]
                evidenceByDevType[dt] = evidenceByPropType[propType]
              }
            })
            setSystemSalePrices(pricesByDevType)
            setComparableEvidence(evidenceByDevType)
            const totalComps = comparablePricesRes.data.reduce((sum: number, cp: any) => sum + cp.comparable_count, 0)
            setSalePriceSource(`${totalComps} comparable listings`)

            // Set initial sale price for detected dev type
            const detectedType = devType || 'apartment'
            if (pricesByDevType[detectedType]) {
              setSalePricePerSqm(pricesByDevType[detectedType])
            }
          }

          // Process construction costs: group by property_type → standard quality cost
          if (baseCostsRes.success && baseCostsRes.data?.length) {
            const costsByDevType: Record<string, number> = {}
            // Map base costs (by property_type) to each development type
            DEVELOPMENT_TYPES.forEach(dt => {
              const propType = DEV_TYPE_TO_PROPERTY_TYPE[dt]
              const stdCost = baseCostsRes.data.find(
                (c: any) => c.property_type === propType && c.quality_tier === 'standard'
              )
              if (stdCost) {
                costsByDevType[dt] = stdCost.base_cost_per_sqm
              }
            })
            setSystemConstructionCosts(costsByDevType)
            setConstructionCostSource('Base cost calculation service')

            // Set initial construction cost for detected dev type
            const detectedType = devType || 'apartment'
            if (costsByDevType[detectedType]) {
              setConstructionCostPerSqm(costsByDevType[detectedType])
            }
          }
        } catch {
          // Market data fetch failed silently
        } finally {
          setLoadingMarketData(false)
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
    if (systemSalePrices[developmentType]) {
      setSalePricePerSqm(systemSalePrices[developmentType])
    }
    if (systemConstructionCosts[developmentType]) {
      setConstructionCostPerSqm(systemConstructionCosts[developmentType])
    }
    setEfficiency(EFFICIENCY_RATES[developmentType] || 0.78)
  }, [developmentType, systemSalePrices, systemConstructionCosts])

  // Call Python service for Residual Method calculation
  useEffect(() => {
    const calculateResidual = async () => {
      if (!valuation?.property || plotSize <= 0 || netSaleableArea <= 0) return
      
      setCalculating(true)
      try {
        const prop = valuation.property as any
        const response = await pythonMethodsApi.calculateResidual(
          {
            id: valuation.id,
            property_type: developmentType,
            region: prop.region || 'greater_accra',
            land_area_sqm: plotSize,
            building_size_sqm: grossBuildingArea,
          },
          {
            proposed_gfa: netSaleableArea,
            sale_price_per_sqm: salePricePerSqm,
            construction_cost_per_sqm: constructionCostPerSqm,
            developer_profit_pct: targetProfit,
            finance_cost_pct: interestRate,
            professional_fees_pct: professionalFees,
            marketing_cost_pct: marketingCost,
          }
        )
        
        if (response.success && response.data) {
          setPythonResult(response.data)
          console.log('Residual Python result:', response.data)
        }
      } catch (err) {
        console.error('Failed to calculate Residual via Python:', err)
      } finally {
        setCalculating(false)
      }
    }

    // Debounce the calculation
    const timer = setTimeout(calculateResidual, 500)
    return () => clearTimeout(timer)
  }, [valuation, plotSize, netSaleableArea, grossBuildingArea, developmentType, salePricePerSqm, constructionCostPerSqm, targetProfit, interestRate, professionalFees, marketingCost])

  // Save and continue
  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)

      // Use Python result as primary, fallback to local calculation
      // Per RICS: land value floored at 0 (nil if scheme not viable)
      const finalValue = Math.max(0, pythonResult?.estimated_value || residualLandValue)
      const finalConfidence = pythonResult?.confidence_score || calculateConfidence()

      await valuationsApi.update(valuationId, {
        method_results: {
          ...(valuation?.method_results || {}),
          residual_method: {
            value: finalValue,
            confidence: finalConfidence,
            confidence_level: pythonResult?.confidence_level || 'medium',
            value_range: pythonResult?.value_range,
            gdv: pythonResult?.details?.gross_development_value || gdv,
            grossBuildingArea,
            netSaleableArea,
            totalConstructionCost: pythonResult?.details?.construction_cost || totalConstructionCost,
            totalSalesCost,
            financeCost: pythonResult?.details?.finance_cost || financeCost,
            financeAsPercentOfCost,
            targetProfit,
            targetProfitAmount,
            residualLandValue: pythonResult?.details?.residual_land_value || residualLandValue,
            landValuePerSqm: pythonResult?.details?.land_value_per_sqm || landValuePerSqm,
            developmentType,
            costBasis,
            efficiency,
            useAdvancedFinance,
            isViable: pythonResult?.details?.is_viable ?? isViable,
            breakEvenProfitPercent,
            breakEvenProfit,
            profitGap,
            minViableLandValue,
            professionalFees: pythonResult?.details?.professional_fees || professionalFeesAmount,
            assumptions: pythonResult?.assumptions || [],
            limitations: pythonResult?.limitations || [],
            calculated_by: pythonResult ? 'python_rics_engine' : 'frontend_calculation',
          },
        },
        current_step: 8,
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
    let score = 0.35
    if (plotSize > 0) score += 0.10
    if (gdv > 0) score += 0.10
    if (residualLandValue > 0) score += 0.20 // Viable scheme is important
    if (targetProfit >= 15 && targetProfit <= 25) score += 0.10
    if (financeAsPercentOfCost >= 8 && financeAsPercentOfCost <= 12) score += 0.10 // Realistic finance
    if (efficiency >= 0.70 && efficiency <= 0.95) score += 0.05 // Realistic efficiency
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
          <Link href={getBackPath()} className="p-2 hover:bg-muted transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </Link>
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
          <ConfidenceBar score={calculateConfidence() * 100} />
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
              {salePriceSource && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 bg-green-500/10 border border-green-500/30 rounded font-mono text-[9px] text-green-600 dark:text-green-400">
                    {loadingMarketData ? 'LOADING...' : `EVIDENCE: ${salePriceSource.toUpperCase()}`}
                  </span>
                  {comparableEvidence[developmentType] && (
                    <span className="px-2 py-0.5 bg-muted border border-border rounded font-mono text-[9px] text-muted-foreground">
                      P25: GH₵{comparableEvidence[developmentType].p25.toLocaleString()} | MEDIAN: GH₵{comparableEvidence[developmentType].median.toLocaleString()} | P75: GH₵{comparableEvidence[developmentType].p75.toLocaleString()}
                    </span>
                  )}
                  {systemSalePrices[developmentType] && salePricePerSqm !== systemSalePrices[developmentType] && (
                    <button
                      onClick={() => setSalePricePerSqm(systemSalePrices[developmentType])}
                      className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded font-mono text-[9px] text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
                    >
                      ↺ RESET TO MEDIAN (GH₵{systemSalePrices[developmentType].toLocaleString()})
                    </button>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-mono text-[10px] text-muted-foreground block mb-1">
                    SALE PRICE/SQM (GH₵) <Tooltip text={TOOLTIPS.salePricePerSqm} />
                  </label>
                  <input
                    type="number"
                    value={salePricePerSqm}
                    onChange={(e) => setSalePricePerSqm(Number(e.target.value))}
                    className="w-full bg-background border border-border p-2 font-mono text-sm text-foreground"
                  />
                </div>
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
              {constructionCostSource && (
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/30 rounded font-mono text-[9px] text-cyan-600 dark:text-cyan-400">
                    {loadingMarketData ? 'LOADING...' : `SOURCE: ${constructionCostSource.toUpperCase()}`}
                  </span>
                  {systemConstructionCosts[developmentType] && constructionCostPerSqm !== systemConstructionCosts[developmentType] && (
                    <button
                      onClick={() => setConstructionCostPerSqm(systemConstructionCosts[developmentType])}
                      className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded font-mono text-[9px] text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
                    >
                      ↺ RESET TO SYSTEM (GH₵{systemConstructionCosts[developmentType].toLocaleString()})
                    </button>
                  )}
                </div>
              )}
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
                  <label className="font-mono text-[10px] text-muted-foreground block mb-1">
                    CONSTRUCTION/SQM (GH₵) <Tooltip text={TOOLTIPS.constructionCost} />
                  </label>
                  <input
                    type="number"
                    value={constructionCostPerSqm}
                    onChange={(e) => setConstructionCostPerSqm(Number(e.target.value))}
                    className="w-full bg-background border border-border p-2 font-mono text-sm text-foreground"
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
                <div>
                  <label className="font-mono text-[10px] text-muted-foreground block mb-1">
                    INTEREST RATE % <Tooltip text={TOOLTIPS.interestRate} />
                    {interestRateSource && (
                      <span className="text-muted-foreground ml-1">({interestRateSource})</span>
                    )}
                  </label>
                  <input
                    type="number"
                    value={interestRate}
                    onChange={(e) => setInterestRate(Number(e.target.value))}
                    className="w-full bg-background border border-border p-2 font-mono text-sm text-foreground"
                  />
                </div>
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

              {/* BOG Rate Reference */}
              {economicData && (
                <div className="flex items-center gap-3 flex-wrap">
                  {economicData.lending_rate && (
                    <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/30 rounded font-mono text-[9px] text-blue-600 dark:text-blue-400">
                      LENDING: {parseFloat(economicData.lending_rate).toFixed(1)}%
                    </span>
                  )}
                  {economicData.interest_rate_prime && (
                    <span className="px-2 py-0.5 bg-muted border border-border rounded font-mono text-[9px] text-muted-foreground">
                      PRIME: {parseFloat(economicData.interest_rate_prime).toFixed(1)}%
                    </span>
                  )}
                  {economicData.interest_rate_policy && (
                    <span className="px-2 py-0.5 bg-muted border border-border rounded font-mono text-[9px] text-muted-foreground">
                      POLICY: {parseFloat(economicData.interest_rate_policy).toFixed(1)}%
                    </span>
                  )}
                  {economicData.mortgage_rate_avg && (
                    <span className="px-2 py-0.5 bg-muted border border-border rounded font-mono text-[9px] text-muted-foreground">
                      MORTGAGE: {parseFloat(economicData.mortgage_rate_avg).toFixed(1)}%
                    </span>
                  )}
                </div>
              )}

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
                  onClick={() => setSalePricePerSqm(Math.round(salePricePerSqm * 1.1))}
                  className="p-2 bg-green-500/10 border border-green-500/30 hover:bg-green-500/20 transition-colors"
                >
                  <span className="font-mono text-xs text-green-600 dark:text-green-400">Sale +10%</span>
                </button>
                <button 
                  onClick={() => setConstructionCostPerSqm(Math.round(constructionCostPerSqm * 0.9))}
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
                    setEfficiency(EFFICIENCY_RATES[devType] || 0.78)
                    if (systemSalePrices[devType]) setSalePricePerSqm(systemSalePrices[devType])
                    if (systemConstructionCosts[devType]) setConstructionCostPerSqm(systemConstructionCosts[devType])
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
        <Link
          href={getBackPath()}
          className="px-6 py-3 bg-muted text-muted-foreground font-mono text-sm hover:text-foreground transition-colors"
        >
          ← BACK
        </Link>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 bg-amber-500 text-foreground font-mono text-sm font-bold hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          SAVE & CONTINUE TO RECONCILIATION →
        </button>
      </div>
    </div>
  )
}
