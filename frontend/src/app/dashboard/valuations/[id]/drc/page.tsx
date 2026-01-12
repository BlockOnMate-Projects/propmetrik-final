'use client'

/**
 * DRC (Depreciated Replacement Cost) Method Page
 * 
 * Used for specialized properties with no market evidence:
 * - Government/institutional buildings
 * - Religious buildings (churches, mosques)
 * - Community centers, libraries, museums
 * - Heritage/historic properties
 * - Utilities and infrastructure
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
  Landmark,
  Wrench,
  TrendingDown,
  AlertTriangle,
} from 'lucide-react'

// Specialized property types for DRC
const SPECIALIZED_TYPES = [
  { id: 'institutional', label: 'Institutional', costPerSqm: 5500 },
  { id: 'government', label: 'Government', costPerSqm: 6000 },
  { id: 'religious', label: 'Religious', costPerSqm: 4500 },
  { id: 'church', label: 'Church', costPerSqm: 5000 },
  { id: 'mosque', label: 'Mosque', costPerSqm: 5500 },
  { id: 'community_center', label: 'Community Center', costPerSqm: 4000 },
  { id: 'library', label: 'Library', costPerSqm: 5500 },
  { id: 'museum', label: 'Museum', costPerSqm: 7000 },
  { id: 'heritage', label: 'Heritage Building', costPerSqm: 8000 },
  { id: 'hospital', label: 'Hospital', costPerSqm: 9000 },
  { id: 'school', label: 'School', costPerSqm: 4500 },
  { id: 'utility', label: 'Utility', costPerSqm: 3500 },
  { id: 'stadium', label: 'Stadium', costPerSqm: 7000 },
]

// Useful lives for specialized properties (years)
const USEFUL_LIVES: Record<string, number> = {
  institutional: 60,
  government: 60,
  religious: 80,
  church: 80,
  mosque: 80,
  community_center: 45,
  library: 55,
  museum: 70,
  heritage: 100,
  hospital: 50,
  school: 50,
  utility: 50,
  stadium: 45,
}

// MEA (Modern Equivalent Asset) factors
const MEA_FACTORS: Record<string, number> = {
  institutional: 0.95,
  government: 0.90,
  religious: 1.00,
  church: 1.00,
  mosque: 1.00,
  community_center: 0.85,
  library: 0.80,
  museum: 0.95,
  heritage: 1.00,
  hospital: 0.90,
  school: 0.85,
  utility: 0.90,
  stadium: 0.85,
}

export default function DRCMethodPage() {
  const params = useParams()
  const router = useRouter()
  const valuationId = params.id as string

  const [valuation, setValuation] = useState<Valuation | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Asset details
  const [assetType, setAssetType] = useState('institutional')
  const [gfa, setGfa] = useState(0)
  const [effectiveAge, setEffectiveAge] = useState(0)
  const [landValue, setLandValue] = useState(0)

  // Replacement cost inputs
  const [replacementCostPerSqm, setReplacementCostPerSqm] = useState(5500)
  const [meaFactor, setMeaFactor] = useState(0.95)
  const [useCustomCost, setUseCustomCost] = useState(false)

  // Depreciation inputs
  const [physicalDepreciation, setPhysicalDepreciation] = useState(0)
  const [functionalObsolescence, setFunctionalObsolescence] = useState(0)
  const [economicObsolescence, setEconomicObsolescence] = useState(0)

  // Calculations
  const usefulLife = USEFUL_LIVES[assetType] || 60
  const grossReplacementCost = gfa * replacementCostPerSqm
  const meaAdjustedCost = grossReplacementCost * meaFactor

  // Calculate age-based physical depreciation if not overridden
  const calculatedPhysicalDep = Math.min((effectiveAge / usefulLife) * 100, 90)
  const appliedPhysicalDep = physicalDepreciation > 0 ? physicalDepreciation : calculatedPhysicalDep

  const totalDepreciation = appliedPhysicalDep + functionalObsolescence + economicObsolescence
  const depreciationAmount = meaAdjustedCost * (totalDepreciation / 100)
  const depreciatedReplacementCost = meaAdjustedCost - depreciationAmount
  const totalValue = depreciatedReplacementCost + landValue

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
          setGfa(prop.built_area_sqm || prop.gfa || 0)
          setEffectiveAge(prop.age || (prop.year_built ? new Date().getFullYear() - prop.year_built : 0))
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load valuation')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [valuationId])

  // Update cost when asset type changes
  useEffect(() => {
    if (!useCustomCost) {
      const typeInfo = SPECIALIZED_TYPES.find(t => t.id === assetType)
      if (typeInfo) {
        setReplacementCostPerSqm(typeInfo.costPerSqm)
      }
      setMeaFactor(MEA_FACTORS[assetType] || 0.95)
    }
  }, [assetType, useCustomCost])

  // Save and continue
  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)

      await valuationsApi.update(valuationId, {
        method_results: {
          ...(valuation?.method_results || {}),
          drc_method: {
            value: totalValue,
            confidence: calculateConfidence(),
            grossReplacementCost,
            meaAdjustedCost,
            physicalDepreciation: appliedPhysicalDep,
            functionalObsolescence,
            economicObsolescence,
            totalDepreciation,
            depreciatedReplacementCost,
            landValue,
            assetType,
          },
        },
        current_step: 6,
      })

      // Navigate to next step
      const selectedMethods = (valuation as any)?.selectedMethods || valuation?.methods_applied || []
      const hasProfits = selectedMethods.includes('profits_method')
      const hasResidual = selectedMethods.includes('residual_method')

      if (hasProfits) {
        router.push(`/dashboard/valuations/${valuationId}/profits`)
      } else if (hasResidual) {
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

  const calculateConfidence = () => {
    let score = 0.5
    if (gfa > 0) score += 0.15
    if (landValue > 0) score += 0.15
    if (totalDepreciation < 60) score += 0.1
    if (meaFactor > 0.8) score += 0.1
    return Math.min(score, 1)
  }

  // Determine back navigation
  const getBackPath = () => {
    const selectedMethods = (valuation as any)?.selectedMethods || valuation?.methods_applied || []
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
        <span className="ml-3 font-mono text-sm text-zinc-400">Loading DRC method...</span>
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
              <h1 className="font-mono text-xl text-white">DRC METHOD</h1>
              <MethodBadge method="DRC" />
            </div>
            <p className="font-mono text-xs text-zinc-500">Depreciated Replacement Cost for Specialized Assets</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ConfidenceBar score={calculateConfidence() * 100} />
        </div>
      </div>

      {error && <div className="mb-4"><AlertBanner type="error" title="Error" message={error} /></div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column - Asset Details */}
        <div className="lg:col-span-2 space-y-4">
          {/* Asset Type Selection */}
          <TerminalPanel title="SPECIALIZED ASSET TYPE">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-4">
              {SPECIALIZED_TYPES.map(type => (
                <button
                  key={type.id}
                  onClick={() => setAssetType(type.id)}
                  className={`p-3 border text-left transition-colors ${
                    assetType === type.id
                      ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                  }`}
                >
                  <div className="font-mono text-xs font-bold">{type.label}</div>
                  <div className="font-mono text-[10px] text-zinc-500">
                    GH₵ {type.costPerSqm.toLocaleString()}/sqm
                  </div>
                </button>
              ))}
            </div>
          </TerminalPanel>

          {/* Replacement Cost Calculation */}
          <TerminalPanel title="GROSS REPLACEMENT COST">
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 block mb-1">GFA (SQM)</label>
                  <input
                    type="number"
                    value={gfa}
                    onChange={(e) => setGfa(Number(e.target.value))}
                    className="w-full bg-black border border-zinc-700 p-2 font-mono text-sm text-white"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 block mb-1">
                    REPLACEMENT COST/SQM (GH₵)
                  </label>
                  <input
                    type="number"
                    value={replacementCostPerSqm}
                    onChange={(e) => {
                      setUseCustomCost(true)
                      setReplacementCostPerSqm(Number(e.target.value))
                    }}
                    className="w-full bg-black border border-zinc-700 p-2 font-mono text-sm text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-700">
                <span className="font-mono text-sm text-zinc-400">Gross Replacement Cost</span>
                <span className="font-mono text-lg text-white font-bold">
                  GH₵ {grossReplacementCost.toLocaleString()}
                </span>
              </div>
            </div>
          </TerminalPanel>

          {/* MEA Adjustment */}
          <TerminalPanel title="MODERN EQUIVALENT ASSET (MEA)">
            <div className="p-4 space-y-4">
              <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/30">
                <Info className="w-4 h-4 text-blue-400 mt-0.5" />
                <div className="font-mono text-xs text-blue-300">
                  MEA considers whether a modern equivalent would be built to the same specification. 
                  A library may need less space due to digital resources (factor &lt; 1.0).
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="font-mono text-xs text-zinc-400">MEA Factor:</label>
                <input
                  type="range"
                  min="0.5"
                  max="1.0"
                  step="0.05"
                  value={meaFactor}
                  onChange={(e) => setMeaFactor(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="font-mono text-sm text-amber-400 w-16 text-right">
                  {(meaFactor * 100).toFixed(0)}%
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-700">
                <span className="font-mono text-sm text-zinc-400">MEA-Adjusted Cost</span>
                <span className="font-mono text-lg text-white font-bold">
                  GH₵ {meaAdjustedCost.toLocaleString()}
                </span>
              </div>
            </div>
          </TerminalPanel>

          {/* Depreciation */}
          <TerminalPanel title="DEPRECIATION & OBSOLESCENCE">
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 block mb-1">EFFECTIVE AGE (YEARS)</label>
                  <input
                    type="number"
                    value={effectiveAge}
                    onChange={(e) => setEffectiveAge(Number(e.target.value))}
                    className="w-full bg-black border border-zinc-700 p-2 font-mono text-sm text-white"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 block mb-1">USEFUL LIFE (YEARS)</label>
                  <input
                    type="number"
                    value={usefulLife}
                    disabled
                    className="w-full bg-zinc-900 border border-zinc-700 p-2 font-mono text-sm text-zinc-500"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="font-mono text-xs text-zinc-400">Physical Depreciation</label>
                    <span className="font-mono text-xs text-amber-400">{appliedPhysicalDep.toFixed(1)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="90"
                    value={physicalDepreciation || calculatedPhysicalDep}
                    onChange={(e) => setPhysicalDepreciation(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="font-mono text-[10px] text-zinc-500">
                    Auto-calculated: {calculatedPhysicalDep.toFixed(1)}% based on age
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <label className="font-mono text-xs text-zinc-400">Functional Obsolescence</label>
                    <span className="font-mono text-xs text-amber-400">{functionalObsolescence}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    value={functionalObsolescence}
                    onChange={(e) => setFunctionalObsolescence(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <label className="font-mono text-xs text-zinc-400">Economic Obsolescence</label>
                    <span className="font-mono text-xs text-amber-400">{economicObsolescence}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    value={economicObsolescence}
                    onChange={(e) => setEconomicObsolescence(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/30">
                <span className="font-mono text-sm text-red-400">Total Depreciation</span>
                <span className="font-mono text-lg text-red-400 font-bold">
                  -{totalDepreciation.toFixed(1)}% (GH₵ {depreciationAmount.toLocaleString()})
                </span>
              </div>
            </div>
          </TerminalPanel>
        </div>

        {/* Right Column - Summary */}
        <div className="space-y-4">
          {/* Land Value */}
          <TerminalPanel title="LAND VALUE">
            <div className="p-4">
              <input
                type="number"
                value={landValue}
                onChange={(e) => setLandValue(Number(e.target.value))}
                className="w-full bg-black border border-zinc-700 p-3 font-mono text-lg text-white mb-2"
                placeholder="Enter land value"
              />
              <div className="font-mono text-[10px] text-zinc-500">
                Land value should be assessed separately using market evidence
              </div>
            </div>
          </TerminalPanel>

          {/* DRC Calculation Summary */}
          <TerminalPanel title="DRC CALCULATION">
            <div className="p-4 space-y-3">
              <div className="flex justify-between py-2 border-b border-zinc-800">
                <span className="font-mono text-xs text-zinc-500">Gross Replacement Cost</span>
                <span className="font-mono text-sm text-white">
                  GH₵ {grossReplacementCost.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-zinc-800">
                <span className="font-mono text-xs text-zinc-500">MEA Adjustment ({(meaFactor * 100).toFixed(0)}%)</span>
                <span className="font-mono text-sm text-amber-400">
                  GH₵ {meaAdjustedCost.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-zinc-800">
                <span className="font-mono text-xs text-zinc-500">Less: Depreciation ({totalDepreciation.toFixed(1)}%)</span>
                <span className="font-mono text-sm text-red-400">
                  -GH₵ {depreciationAmount.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-zinc-800">
                <span className="font-mono text-xs text-zinc-500">Depreciated Replacement Cost</span>
                <span className="font-mono text-sm text-white">
                  GH₵ {depreciatedReplacementCost.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-zinc-800">
                <span className="font-mono text-xs text-zinc-500">Plus: Land Value</span>
                <span className="font-mono text-sm text-green-400">
                  +GH₵ {landValue.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-3 bg-amber-500/20 -mx-4 px-4">
                <span className="font-mono text-sm text-amber-400 font-bold">TOTAL DRC VALUE</span>
                <span className="font-mono text-xl text-amber-400 font-bold">
                  GH₵ {totalValue.toLocaleString()}
                </span>
              </div>
            </div>
          </TerminalPanel>

          {/* Method Notes */}
          <TerminalPanel title="DRC NOTES">
            <div className="p-4 space-y-2">
              <div className="flex items-start gap-2 text-xs">
                <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5" />
                <span className="font-mono text-zinc-400">
                  DRC is a last resort method when no market evidence exists
                </span>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <Landmark className="w-3 h-3 text-blue-400 mt-0.5" />
                <span className="font-mono text-zinc-400">
                  MEA reflects modern functional requirements
                </span>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <TrendingDown className="w-3 h-3 text-red-400 mt-0.5" />
                <span className="font-mono text-zinc-400">
                  Depreciation includes physical, functional & economic factors
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
          disabled={saving || totalValue <= 0}
          className="px-6 py-3 bg-amber-500 text-black font-mono text-sm font-bold hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          SAVE & CONTINUE TO RECONCILIATION →
        </button>
      </div>
    </div>
  )
}
