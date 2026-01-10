'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import {
  TerminalPanel,
  AlertBanner,
  MethodBadge,
  ConfidenceBar,
  PropertyTypeBadge,
} from '@/components/ui/terminal'
import { valuationsApi, costApproachApi } from '@/lib/valuation-api'
import type { Valuation, CostApproachData } from '@/types/valuation'
import {
  ArrowLeft,
  Loader2,
  Info,
  Calculator,
  Building2,
  MapPin,
  Wrench,
  TrendingDown,
  Plus,
  X,
} from 'lucide-react'

// Ghana construction cost rates (GHC/sqm) - 2024 estimates
const CONSTRUCTION_RATES = {
  basic: { min: 2500, max: 4000, label: 'Basic/Economy', description: 'Sandcrete blocks, basic finishes' },
  standard: { min: 4000, max: 6500, label: 'Standard', description: 'Quality blocks, standard finishes' },
  premium: { min: 6500, max: 10000, label: 'Premium', description: 'High-quality materials, good finishes' },
  luxury: { min: 10000, max: 18000, label: 'Luxury', description: 'Premium materials, imported finishes' },
  ultra_luxury: { min: 18000, max: 35000, label: 'Ultra Luxury', description: 'Bespoke, international standards' },
}

// Depreciation factors
const DEPRECIATION_TYPES = {
  physical: { 
    label: 'Physical Depreciation', 
    description: 'Wear and tear, age-related deterioration',
    icon: Wrench,
  },
  functional: { 
    label: 'Functional Obsolescence', 
    description: 'Outdated design, layout inefficiencies',
    icon: Building2,
  },
  external: { 
    label: 'External Obsolescence', 
    description: 'Neighborhood decline, economic factors',
    icon: MapPin,
  },
}

interface ComponentCost {
  id: string
  name: string
  area: number
  ratePerSqm: number
  total: number
}

export default function CostApproachPage() {
  const params = useParams()
  const router = useRouter()
  const valuationId = params.id as string

  const [valuation, setValuation] = useState<Valuation | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cost inputs
  const [landValue, setLandValue] = useState(0)
  const [constructionQuality, setConstructionQuality] = useState<keyof typeof CONSTRUCTION_RATES>('standard')
  const [constructionRate, setConstructionRate] = useState(5000)
  const [gfa, setGfa] = useState(0)
  const [components, setComponents] = useState<ComponentCost[]>([])

  // Depreciation inputs
  const [physicalDepreciation, setPhysicalDepreciation] = useState(0)
  const [functionalObsolescence, setFunctionalObsolescence] = useState(0)
  const [externalObsolescence, setExternalObsolescence] = useState(0)

  // Additional costs
  const [softCosts, setSoftCosts] = useState(10) // % of hard costs
  const [entrepreneurialProfit, setEntrepreneurialProfit] = useState(15) // % of total
  const [siteworks, setSiteworks] = useState(0)

  // Calculated values
  const hardCosts = components.reduce((sum, c) => sum + c.total, 0) || (gfa * constructionRate)
  const softCostsAmount = hardCosts * (softCosts / 100)
  const totalConstructionCost = hardCosts + softCostsAmount + siteworks
  const entrepreneurialProfitAmount = totalConstructionCost * (entrepreneurialProfit / 100)
  const reproductionCostNew = totalConstructionCost + entrepreneurialProfitAmount

  const totalDepreciation = physicalDepreciation + functionalObsolescence + externalObsolescence
  const depreciationAmount = reproductionCostNew * (totalDepreciation / 100)
  const depreciatedBuildingValue = reproductionCostNew - depreciationAmount

  const indicatedValue = landValue + depreciatedBuildingValue

  // Fetch existing data
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        setError(null)

        const [valuationRes, costRes] = await Promise.all([
          valuationsApi.getById(valuationId),
          costApproachApi.getByValuation(valuationId),
        ])

        if (valuationRes.error) throw new Error(valuationRes.error)
        if (!valuationRes.data) throw new Error('Valuation not found')

        setValuation(valuationRes.data as Valuation)
        setGfa(valuationRes.data.property?.building_area_sqm || 200)

        // Load existing cost approach data if available
        if (costRes.data) {
          const data = costRes.data
          setLandValue(data.land_value || 0)
          setConstructionRate(data.replacement_cost_new ? data.replacement_cost_new / (valuationRes.data.property?.building_area_sqm || 200) : 5000)
          setPhysicalDepreciation(data.physical_depreciation || 0)
          setFunctionalObsolescence(data.functional_obsolescence || 0)
          setExternalObsolescence(data.external_obsolescence || 0)
          setSoftCosts(data.calculations?.softCostsPercent || 10)
          setEntrepreneurialProfit(data.calculations?.entrepreneurialProfitPercent || 15)
          setSiteworks(data.calculations?.siteworks || 0)
          if (data.calculations?.components) setComponents(data.calculations.components)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [valuationId])

  // Update construction rate when quality changes
  useEffect(() => {
    const range = CONSTRUCTION_RATES[constructionQuality]
    setConstructionRate(Math.round((range.min + range.max) / 2))
  }, [constructionQuality])

  // Add component
  const addComponent = () => {
    setComponents([
      ...components,
      { id: Date.now().toString(), name: '', area: 0, ratePerSqm: constructionRate, total: 0 },
    ])
  }

  // Update component
  const updateComponent = (id: string, field: keyof ComponentCost, value: string | number) => {
    setComponents(prev =>
      prev.map(c => {
        if (c.id !== id) return c
        const updated = { ...c, [field]: value }
        updated.total = updated.area * updated.ratePerSqm
        return updated
      })
    )
  }

  // Remove component
  const removeComponent = (id: string) => {
    setComponents(components.filter(c => c.id !== id))
  }

  // Calculate age-based depreciation
  const calculateAgeDepreciation = () => {
    const yearBuilt = valuation?.property?.year_built
    if (!yearBuilt) return

    const age = new Date().getFullYear() - yearBuilt
    const effectiveLife = 60 // Assumed 60-year life for residential
    const straightLineDepreciation = Math.min((age / effectiveLife) * 100, 80)
    setPhysicalDepreciation(Math.round(straightLineDepreciation))
  }

  // Save and continue
  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)

      await costApproachApi.save(valuationId, {
        land_value: landValue,
        replacement_cost_new: reproductionCostNew,
        physical_depreciation: physicalDepreciation,
        functional_obsolescence: functionalObsolescence,
        external_obsolescence: externalObsolescence,
        total_depreciation: totalDepreciation,
        depreciated_value: depreciatedBuildingValue,
        indicated_value: indicatedValue,
        effective_age: valuation?.property?.year_built ? new Date().getFullYear() - valuation.property.year_built : 0,
        remaining_life: 60 - (valuation?.property?.year_built ? new Date().getFullYear() - valuation.property.year_built : 0),
        cost_source: 'propmetrik_construction_data',
        calculations: {
          gfa,
          constructionRate,
          constructionQuality,
          hardCosts,
          softCostsPercent: softCosts,
          softCostsAmount,
          siteworks,
          entrepreneurialProfitPercent: entrepreneurialProfit,
          entrepreneurialProfitAmount,
          components,
        },
      })

      // Update valuation method result
      await valuationsApi.update(valuationId, {
        method_results: {
          ...(valuation?.method_results || {}),
          cost: {
            value: indicatedValue,
            confidence: calculateConfidence(),
            landValue,
            buildingValue: depreciatedBuildingValue,
            totalDepreciation,
          },
        },
        current_step: 5,
      })

      // Navigate to next step based on selected methods
      const selectedMethods = (valuation as any)?.selectedMethods || valuation?.methods_applied || []
      const hasIncomeApproach = selectedMethods.includes('income_approach')
      
      if (hasIncomeApproach) {
        router.push(`/dashboard/valuations/${valuationId}/income`)
      } else {
        // No income approach selected - go directly to reconciliation
        router.push(`/dashboard/valuations/${valuationId}/reconciliation`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // Calculate confidence
  const calculateConfidence = () => {
    let score = 0.5
    if (landValue > 0) score += 0.15
    if (components.length > 0 || gfa > 0) score += 0.15
    if (totalDepreciation < 50) score += 0.1
    if (totalDepreciation > 0) score += 0.1
    return Math.min(score, 1)
  }
  
  // Determine back navigation path based on selected methods
  const getBackPath = () => {
    const selectedMethods = (valuation as any)?.selectedMethods || valuation?.methods_applied || []
    const hasSalesComparison = selectedMethods.includes('sales_comparison')
    if (hasSalesComparison) {
      return `/dashboard/valuations/${valuationId}/market`
    }
    // If no sales comparison, go back to methods
    return `/dashboard/valuations/${valuationId}/methods`
  }
  
  const getBackLabel = () => {
    const selectedMethods = (valuation as any)?.selectedMethods || valuation?.methods_applied || []
    const hasSalesComparison = selectedMethods.includes('sales_comparison')
    return hasSalesComparison ? '← BACK TO MARKET DATA' : '← BACK TO METHODS'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        <span className="ml-3 font-mono text-sm text-zinc-400">Loading cost approach...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href={getBackPath()}
            className="p-2 hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-zinc-400" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-xl text-white">COST APPROACH</h1>
              <span className="px-2 py-0.5 bg-orange-900/50 text-orange-400 font-mono text-[10px]">
                STEP 5
              </span>
            </div>
            <p className="font-mono text-[10px] text-zinc-500">
              Land value + Depreciated reproduction cost = Value indication
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MethodBadge method="cost" isPrimary={valuation?.primary_method === 'cost_approach'} />
        </div>
      </div>

      {error && <div className="mb-4"><AlertBanner type="error" title="Error" message={error} /></div>}

      <div className="grid grid-cols-3 gap-4">
        {/* Left Column - Inputs */}
        <div className="col-span-2 space-y-4">
          {/* Land Value */}
          <TerminalPanel title="LAND VALUE">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="font-mono text-[10px] text-zinc-500 block mb-2">
                  LAND / SITE VALUE (₵)
                </label>
                <input
                  type="number"
                  value={landValue}
                  onChange={(e) => setLandValue(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-lg focus:border-amber-500"
                  placeholder="Enter land value..."
                />
                <p className="font-mono text-[10px] text-zinc-500 mt-1">
                  Use comparable land sales or residual land value
                </p>
              </div>
              <div className="flex items-end">
                <div className="w-full p-3 bg-zinc-800/30">
                  <div className="font-mono text-[10px] text-zinc-500">PLOT SIZE</div>
                  <div className="font-mono text-lg text-white">
                    {(valuation?.property?.land_area_sqm || valuation?.property?.plot_size)?.toLocaleString() || '—'} sqm
                  </div>
                  {landValue > 0 && (valuation?.property?.land_area_sqm || valuation?.property?.plot_size) && (
                    <div className="font-mono text-xs text-zinc-400 mt-1">
                      ₵{Math.round(landValue / (valuation.property.land_area_sqm || valuation.property.plot_size || 1)).toLocaleString()}/sqm
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TerminalPanel>

          {/* Construction Costs */}
          <TerminalPanel title="CONSTRUCTION COSTS">
            {/* Quality Selection */}
            <div className="mb-4">
              <label className="font-mono text-[10px] text-zinc-500 block mb-2">
                CONSTRUCTION QUALITY
              </label>
              <div className="grid grid-cols-5 gap-2">
                {Object.entries(CONSTRUCTION_RATES).map(([key, rate]) => (
                  <button
                    key={key}
                    onClick={() => setConstructionQuality(key as keyof typeof CONSTRUCTION_RATES)}
                    className={`p-3 text-left border transition-colors ${
                      constructionQuality === key
                        ? 'border-amber-500 bg-amber-900/20'
                        : 'border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="font-mono text-xs text-white">{rate.label}</div>
                    <div className="font-mono text-[10px] text-zinc-500">
                      ₵{rate.min.toLocaleString()}-{rate.max.toLocaleString()}/sqm
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Rate and GFA */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="font-mono text-[10px] text-zinc-500 block mb-2">
                  RATE PER SQM (₵)
                </label>
                <input
                  type="number"
                  value={constructionRate}
                  onChange={(e) => setConstructionRate(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono focus:border-amber-500"
                />
              </div>
              <div>
                <label className="font-mono text-[10px] text-zinc-500 block mb-2">
                  GROSS FLOOR AREA (SQM)
                </label>
                <input
                  type="number"
                  value={gfa}
                  onChange={(e) => setGfa(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono focus:border-amber-500"
                />
              </div>
              <div className="flex items-end">
                <div className="w-full p-3 bg-zinc-800/30">
                  <div className="font-mono text-[10px] text-zinc-500">HARD COSTS</div>
                  <div className="font-mono text-lg text-white">₵{hardCosts.toLocaleString()}</div>
                </div>
              </div>
            </div>

            {/* Component Breakdown (Optional) */}
            <div className="border-t border-zinc-800 pt-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-[10px] text-zinc-500">COMPONENT BREAKDOWN (OPTIONAL)</span>
                <button
                  onClick={addComponent}
                  className="flex items-center gap-1 px-2 py-1 bg-zinc-800 text-zinc-400 font-mono text-[10px] hover:text-white"
                >
                  <Plus className="w-3 h-3" /> ADD
                </button>
              </div>
              {components.length > 0 && (
                <div className="space-y-2">
                  {components.map((comp) => (
                    <div key={comp.id} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={comp.name}
                        onChange={(e) => updateComponent(comp.id, 'name', e.target.value)}
                        placeholder="Component name"
                        className="flex-1 px-2 py-1 bg-black border border-zinc-700 text-white font-mono text-xs"
                      />
                      <input
                        type="number"
                        value={comp.area}
                        onChange={(e) => updateComponent(comp.id, 'area', parseFloat(e.target.value) || 0)}
                        placeholder="Area"
                        className="w-24 px-2 py-1 bg-black border border-zinc-700 text-white font-mono text-xs"
                      />
                      <input
                        type="number"
                        value={comp.ratePerSqm}
                        onChange={(e) => updateComponent(comp.id, 'ratePerSqm', parseFloat(e.target.value) || 0)}
                        placeholder="Rate"
                        className="w-24 px-2 py-1 bg-black border border-zinc-700 text-white font-mono text-xs"
                      />
                      <span className="w-28 font-mono text-xs text-green-400 text-right">
                        ₵{comp.total.toLocaleString()}
                      </span>
                      <button onClick={() => removeComponent(comp.id)} className="text-zinc-500 hover:text-red-400">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Additional Costs */}
            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-zinc-800">
              <div>
                <label className="font-mono text-[10px] text-zinc-500 block mb-2">
                  SOFT COSTS (% OF HARD)
                </label>
                <input
                  type="number"
                  value={softCosts}
                  onChange={(e) => setSoftCosts(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono focus:border-amber-500"
                  min="0"
                  max="30"
                />
                <p className="font-mono text-[10px] text-zinc-500 mt-1">
                  Design, permits, supervision
                </p>
              </div>
              <div>
                <label className="font-mono text-[10px] text-zinc-500 block mb-2">
                  SITEWORKS (₵)
                </label>
                <input
                  type="number"
                  value={siteworks}
                  onChange={(e) => setSiteworks(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono focus:border-amber-500"
                />
                <p className="font-mono text-[10px] text-zinc-500 mt-1">
                  Drainage, landscaping, utilities
                </p>
              </div>
              <div>
                <label className="font-mono text-[10px] text-zinc-500 block mb-2">
                  ENTREPRENEURIAL PROFIT (%)
                </label>
                <input
                  type="number"
                  value={entrepreneurialProfit}
                  onChange={(e) => setEntrepreneurialProfit(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono focus:border-amber-500"
                  min="0"
                  max="30"
                />
                <p className="font-mono text-[10px] text-zinc-500 mt-1">
                  Developer profit margin
                </p>
              </div>
            </div>
          </TerminalPanel>

          {/* Depreciation */}
          <TerminalPanel title="DEPRECIATION">
            <div className="flex justify-end mb-3">
              <button
                onClick={calculateAgeDepreciation}
                className="flex items-center gap-1 px-2 py-1 bg-zinc-800 text-zinc-400 font-mono text-[10px] hover:text-white"
              >
                <Calculator className="w-3 h-3" /> AUTO-CALC
              </button>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {Object.entries(DEPRECIATION_TYPES).map(([key, type]) => {
                const Icon = type.icon
                const value =
                  key === 'physical' ? physicalDepreciation :
                  key === 'functional' ? functionalObsolescence :
                  externalObsolescence
                const setter =
                  key === 'physical' ? setPhysicalDepreciation :
                  key === 'functional' ? setFunctionalObsolescence :
                  setExternalObsolescence

                return (
                  <div key={key} className="p-4 bg-zinc-800/30 border border-zinc-800">
                    <div className="flex items-center gap-2 mb-3">
                      <Icon className="w-4 h-4 text-zinc-500" />
                      <span className="font-mono text-xs text-white">{type.label}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      value={value}
                      onChange={(e) => setter(parseFloat(e.target.value))}
                      className="w-full accent-amber-500 mb-2"
                    />
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-zinc-500">{type.description}</span>
                      <span className={`font-mono text-lg ${value > 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                        {value}%
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-zinc-800 flex items-center justify-between">
              <span className="font-mono text-xs text-zinc-400">TOTAL DEPRECIATION</span>
              <span className="font-mono text-xl text-red-400">{totalDepreciation}%</span>
            </div>
            {valuation?.property?.year_built && (
              <div className="mt-2 flex items-center gap-2 text-zinc-500">
                <Info className="w-3 h-3" />
                <span className="font-mono text-[10px]">
                  Property age: {new Date().getFullYear() - valuation.property.year_built} years (built {valuation.property.year_built})
                </span>
              </div>
            )}
          </TerminalPanel>
        </div>

        {/* Right Column - Summary */}
        <div className="space-y-4">
          <TerminalPanel title="COST APPROACH SUMMARY">
            <div className="space-y-3">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-zinc-500">Hard Costs</span>
                <span className="text-white">₵{hardCosts.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs font-mono">
                <span className="text-zinc-500">+ Soft Costs ({softCosts}%)</span>
                <span className="text-white">₵{Math.round(softCostsAmount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs font-mono">
                <span className="text-zinc-500">+ Siteworks</span>
                <span className="text-white">₵{siteworks.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs font-mono">
                <span className="text-zinc-500">+ Entrepreneur Profit ({entrepreneurialProfit}%)</span>
                <span className="text-white">₵{Math.round(entrepreneurialProfitAmount).toLocaleString()}</span>
              </div>

              <div className="border-t border-zinc-800 pt-3 flex justify-between text-sm font-mono">
                <span className="text-zinc-400">Reproduction Cost New</span>
                <span className="text-white font-bold">₵{Math.round(reproductionCostNew).toLocaleString()}</span>
              </div>

              <div className="flex justify-between text-xs font-mono text-red-400">
                <span>− Depreciation ({totalDepreciation}%)</span>
                <span>(₵{Math.round(depreciationAmount).toLocaleString()})</span>
              </div>

              <div className="border-t border-zinc-800 pt-3 flex justify-between text-sm font-mono">
                <span className="text-zinc-400">Depreciated Building Value</span>
                <span className="text-white font-bold">₵{Math.round(depreciatedBuildingValue).toLocaleString()}</span>
              </div>

              <div className="flex justify-between text-xs font-mono">
                <span className="text-zinc-500">+ Land Value</span>
                <span className="text-white">₵{landValue.toLocaleString()}</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t-2 border-zinc-700">
              <div className="text-center p-4 bg-green-900/20 border border-green-800">
                <div className="font-mono text-[10px] text-green-400 mb-1">INDICATED VALUE (COST)</div>
                <div className="font-mono text-3xl text-green-400 font-bold">
                  ₵{Math.round(indicatedValue).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-zinc-500">CONFIDENCE</span>
                <ConfidenceBar score={calculateConfidence() * 100} />
              </div>
            </div>
          </TerminalPanel>

          {/* Visual Breakdown */}
          <TerminalPanel title="VALUE COMPOSITION">
            <div className="space-y-2">
              {/* Land */}
              <div>
                <div className="flex justify-between font-mono text-[10px] mb-1">
                  <span className="text-zinc-500">Land</span>
                  <span className="text-white">{indicatedValue > 0 ? Math.round((landValue / indicatedValue) * 100) : 0}%</span>
                </div>
                <div className="h-2 bg-zinc-800">
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${indicatedValue > 0 ? (landValue / indicatedValue) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Building */}
              <div>
                <div className="flex justify-between font-mono text-[10px] mb-1">
                  <span className="text-zinc-500">Building</span>
                  <span className="text-white">{indicatedValue > 0 ? Math.round((depreciatedBuildingValue / indicatedValue) * 100) : 0}%</span>
                </div>
                <div className="h-2 bg-zinc-800">
                  <div
                    className="h-full bg-amber-500"
                    style={{ width: `${indicatedValue > 0 ? (depreciatedBuildingValue / indicatedValue) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Depreciation (as negative) */}
              <div className="pt-2 border-t border-zinc-800">
                <div className="flex justify-between font-mono text-[10px] mb-1">
                  <span className="text-zinc-500">Depreciation Lost</span>
                  <span className="text-red-400">−{totalDepreciation}%</span>
                </div>
                <div className="h-2 bg-zinc-800">
                  <div
                    className="h-full bg-red-500"
                    style={{ width: `${Math.min(totalDepreciation, 100)}%` }}
                  />
                </div>
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
          {getBackLabel()}
        </Link>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 bg-amber-500 text-black font-mono text-sm font-bold hover:bg-amber-400 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {(() => {
            const selectedMethods = (valuation as any)?.selectedMethods || valuation?.methods_applied || []
            const hasIncomeApproach = selectedMethods.includes('income_approach')
            return hasIncomeApproach 
              ? 'SAVE & CONTINUE TO INCOME APPROACH →' 
              : 'SAVE & CONTINUE TO RECONCILIATION →'
          })()}
        </button>
      </div>
    </div>
  )
}
