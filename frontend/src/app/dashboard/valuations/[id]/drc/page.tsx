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
import { valuationsApi, pythonMethodsApi, landValueApi, PythonMethodResponse } from '@/lib/valuation-api'
import { valuationConfigApi, mapShortRegionToDataHub } from '@/lib/api'
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

// Fallback specialized types (used only if API fetch fails)
const FALLBACK_SPECIALIZED_TYPES = [
  { id: 'institutional_other', label: 'Institutional (Other)', costPerSqm: 5500 },
  { id: 'government', label: 'Government Office', costPerSqm: 6000 },
  { id: 'religious', label: 'Religious (Church, Mosque)', costPerSqm: 4500 },
  { id: 'educational', label: 'Educational (Schools, Universities)', costPerSqm: 4500 },
  { id: 'health_clinic', label: 'Health Clinic', costPerSqm: 7000 },
  { id: 'health_hospital', label: 'Health Hospital', costPerSqm: 9000 },
  { id: 'library', label: 'Library', costPerSqm: 5500 },
  { id: 'museum', label: 'Museum', costPerSqm: 7000 },
  { id: 'heritage', label: 'Heritage / Conservation', costPerSqm: 8000 },
  { id: 'recreation', label: 'Recreation Facility', costPerSqm: 6000 },
  { id: 'stadium', label: 'Stadium / Sports', costPerSqm: 7000 },
  { id: 'industrial_warehouse', label: 'Industrial Warehouse', costPerSqm: 4500 },
  { id: 'industrial_factory', label: 'Industrial Factory', costPerSqm: 5500 },
  { id: 'mixed_use', label: 'Mixed Use', costPerSqm: 7000 },
]

// Useful lives for specialized properties (years) — keyed by building_function_enum
const USEFUL_LIVES: Record<string, number> = {
  institutional_other: 60,
  government: 60,
  religious: 80,
  educational: 50,
  health_clinic: 50,
  health_hospital: 50,
  library: 55,
  museum: 70,
  heritage: 100,
  recreation: 45,
  stadium: 45,
  industrial_warehouse: 50,
  industrial_factory: 50,
  mixed_use: 60,
}

// MEA (Modern Equivalent Asset) factors — keyed by building_function_enum
const MEA_FACTORS: Record<string, number> = {
  institutional_other: 0.95,
  government: 0.90,
  religious: 1.00,
  educational: 0.85,
  health_clinic: 0.90,
  health_hospital: 0.90,
  library: 0.80,
  museum: 0.95,
  heritage: 1.00,
  recreation: 0.85,
  stadium: 0.85,
  industrial_warehouse: 0.90,
  industrial_factory: 0.90,
  mixed_use: 0.90,
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
  const [assetType, setAssetType] = useState('institutional_other')
  const [gfa, setGfa] = useState(0)
  const [gfaSource, setGfaSource] = useState<'property' | 'estimated' | 'user'>('property')
  const [effectiveAge, setEffectiveAge] = useState(0)
  
  // Specialized costs grouped by building function → quality level → cost
  const [costsByFunction, setCostsByFunction] = useState<Record<string, Record<string, number>>>({})
  const [assetTypeLabels, setAssetTypeLabels] = useState<Record<string, string>>({})
  const [qualityLevel, setQualityLevel] = useState<'basic' | 'standard' | 'premium' | 'luxury'>('standard')
  const [costsLoading, setCostsLoading] = useState(true)
  
  // Land Value - follows system-wide Land Value Calculation (not from Cost Approach)
  const [landValue, setLandValue] = useState(0)
  const [landValueMode, setLandValueMode] = useState<'system' | 'user'>('system')
  const [systemLandValue, setSystemLandValue] = useState(0)
  const [userLandValue, setUserLandValue] = useState(0)
  const [landValueLoading, setLandValueLoading] = useState(false)
  const [landValueCalculating, setLandValueCalculating] = useState(false)
  const [landValueConfidence, setLandValueConfidence] = useState(0)
  const [landValueMethods, setLandValueMethods] = useState<string[]>([])

  // Replacement cost inputs
  const [replacementCostPerSqm, setReplacementCostPerSqm] = useState(5500)
  const [meaFactor, setMeaFactor] = useState(0.95)
  const [useCustomCost, setUseCustomCost] = useState(false)

  // Depreciation inputs - track whether user has overridden each component
  const [physicalDepreciation, setPhysicalDepreciation] = useState(0)
  const [physicalDepMode, setPhysicalDepMode] = useState<'system' | 'user'>('system')
  const [functionalObsolescence, setFunctionalObsolescence] = useState(0)
  const [functionalObsMode, setFunctionalObsMode] = useState<'system' | 'user'>('system')
  const [economicObsolescence, setEconomicObsolescence] = useState(0)
  const [economicObsMode, setEconomicObsMode] = useState<'system' | 'user'>('system')
  
  // System-calculated depreciation values from Python
  const [systemPhysicalDep, setSystemPhysicalDep] = useState(0)
  const [systemFunctionalObs, setSystemFunctionalObs] = useState(0)
  const [systemExternalObs, setSystemExternalObs] = useState(0)

  // Python calculation state
  const [pythonResult, setPythonResult] = useState<PythonMethodResponse | null>(null)
  const [calculating, setCalculating] = useState(false)

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

  // Fetch valuation and land value from database
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        setLandValueLoading(true)
        
        // Fetch valuation data
        const res = await valuationsApi.getById(valuationId)
        if (res.error) throw new Error(res.error)
        if (!res.data) throw new Error('Valuation not found')
        setValuation(res.data as Valuation)

        const prop = res.data.property as any
        if (prop) {
          // Try multiple possible field names for building area / GFA
          const gfaValue = prop.built_area_sqm || prop.building_area_sqm || prop.gfa || 
                           prop.grossFloorArea || prop.builtArea || prop.gross_floor_area || 0
          
          // If no GFA, estimate from land area (common for DRC properties)
          if (gfaValue === 0 && (prop.land_area_sqm || prop.landArea || prop.plot_size_sqm)) {
            // DRC properties often have 30-50% floor area ratio
            const landArea = prop.land_area_sqm || prop.landArea || prop.plot_size_sqm || 0
            const estimatedGfa = Math.round(landArea * 0.4) // 40% FAR estimate
            setGfa(estimatedGfa)
            setGfaSource('estimated')
            console.log('⚠️ No GFA data - estimated from land area:', estimatedGfa)
          } else if (gfaValue > 0) {
            setGfa(gfaValue)
            setGfaSource('property')
          }
          
          // Calculate effective age
          const yearBuilt = prop.year_built || prop.yearBuilt
          const actualAge = yearBuilt ? new Date().getFullYear() - yearBuilt : 0
          setEffectiveAge(prop.age || actualAge)
          
          console.log('📊 DRC Property Data:', {
            gfa: gfaValue || 'estimated',
            yearBuilt,
            actualAge,
            condition: prop.condition,
            region: prop.region
          })

          // Fetch specialized construction costs from Data Hub API
          try {
            const region = prop.region ? mapShortRegionToDataHub(prop.region) : 'greater_accra'
            const [costsRes, functionsRes] = await Promise.all([
              valuationConfigApi.getSpecializedCosts({ region }),
              valuationConfigApi.getBuildingFunctions(),
            ])
            
            // Build label map from building functions API
            const labelMap: Record<string, string> = {}
            if (functionsRes.success && functionsRes.data) {
              functionsRes.data.forEach((f: any) => { labelMap[f.value] = f.label })
            }
            setAssetTypeLabels(labelMap)
            
            if (costsRes.success && costsRes.data && costsRes.data.length > 0) {
              // Group costs by building_function → quality_level → cost
              const grouped: Record<string, Record<string, number>> = {}
              costsRes.data.forEach((c: any) => {
                if (!grouped[c.building_function]) grouped[c.building_function] = {}
                grouped[c.building_function][c.quality_level] = Math.round(c.base_cost_sqm)
              })
              setCostsByFunction(grouped)
              console.log('✅ Specialized costs from API:', Object.keys(grouped).length, 'types for', region)
            }
          } catch (costErr) {
            console.warn('Specialized costs API unavailable, using fallback:', costErr)
          } finally {
            setCostsLoading(false)
          }
        }

        // Pull replacement cost from Cost Approach if already calculated
        const costResult = (res.data as any)?.method_results?.cost_approach?.details
        if (costResult?.cost_per_sqm && costResult.cost_per_sqm > 0) {
          setReplacementCostPerSqm(costResult.cost_per_sqm)
          setUseCustomCost(true) // Prevent asset type from overwriting
          console.log('✅ Replacement cost from Cost Approach:', costResult.cost_per_sqm)
        }
        
        // Fetch land value from system-wide Land Value Calculation
        // Per architecture: Land Value is calculated INDEPENDENTLY and flows INTO Cost/DRC/Income
        try {
          const landValueRes = await landValueApi.getByValuation(valuationId)
          if (landValueRes.success && landValueRes.data) {
            const data = landValueRes.data as any
            const fetchedLandValue = data.land_value || data.final_land_value || 0
            if (fetchedLandValue > 0) {
              setSystemLandValue(fetchedLandValue)
              setLandValue(fetchedLandValue)
              setLandValueMode('system')
              setLandValueConfidence(data.confidence_score || data.calculation_result?.confidence_score || 0)
              
              // Get methods used
              const methods: string[] = []
              if (data.calculation_result?.methods?.comparable) methods.push('Comparable')
              if (data.calculation_result?.methods?.residual) methods.push('Residual')
              if (data.is_user_override) methods.push('User Override')
              setLandValueMethods(methods)
              
              console.log('✅ Land value loaded from Land Value System:', fetchedLandValue)
            } else {
              // No land value exists - try to auto-calculate (may fail for specialized/DRC properties)
              console.log('🔄 No land value found, auto-calculating...')
              setLandValueCalculating(true)
              try {
                const calcRes = await landValueApi.calculate(valuationId)
                if (calcRes.success && calcRes.data) {
                  const value = calcRes.data.final_land_value || 0
                  setSystemLandValue(value)
                  setLandValue(value)
                  setLandValueConfidence(calcRes.data.confidence_score || 0)
                  const methods: string[] = []
                  if (calcRes.data.methods?.comparable) methods.push('Comparable')
                  if (calcRes.data.methods?.residual) methods.push('Residual')
                  setLandValueMethods(methods)
                  console.log('✅ Land value auto-calculated:', value)
                }
              } catch {
                // Expected for specialized DRC properties without market comparables
                console.log('ℹ️ Auto land value not available for this property — use User-Entered')
              }
              setLandValueCalculating(false)
            }
          } else {
            // No land value record - try to auto-calculate (may fail for specialized/DRC properties)
            console.log('🔄 No land value record, auto-calculating...')
            setLandValueCalculating(true)
            try {
              const calcRes = await landValueApi.calculate(valuationId)
              if (calcRes.success && calcRes.data) {
                const value = calcRes.data.final_land_value || 0
                setSystemLandValue(value)
                setLandValue(value)
                setLandValueConfidence(calcRes.data.confidence_score || 0)
                const methods: string[] = []
                if (calcRes.data.methods?.comparable) methods.push('Comparable')
                if (calcRes.data.methods?.residual) methods.push('Residual')
                setLandValueMethods(methods)
                console.log('✅ Land value auto-calculated:', value)
              }
            } catch {
              console.log('ℹ️ Auto land value not available for this property — use User-Entered')
            }
            setLandValueCalculating(false)
          }
        } catch (landErr) {
          console.warn('Land value calculation failed:', landErr)
          setLandValueCalculating(false)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load valuation')
      } finally {
        setLoading(false)
        setLandValueLoading(false)
      }
    }
    fetchData()
  }, [valuationId])

  // Update cost when asset type or quality level changes
  useEffect(() => {
    if (!useCustomCost) {
      const costForFunction = costsByFunction[assetType]
      if (costForFunction && costForFunction[qualityLevel]) {
        setReplacementCostPerSqm(costForFunction[qualityLevel])
      } else {
        // Fallback to static defaults
        const fallback = FALLBACK_SPECIALIZED_TYPES.find(t => t.id === assetType)
        if (fallback) setReplacementCostPerSqm(fallback.costPerSqm)
      }
      setMeaFactor(MEA_FACTORS[assetType] || 0.95)
    }
  }, [assetType, qualityLevel, useCustomCost, costsByFunction])

  // Call Python service for DRC calculation
  useEffect(() => {
    const calculateDRC = async () => {
      if (!valuation?.property || gfa <= 0 || landValue <= 0) return
      
      setCalculating(true)
      try {
        const prop = valuation.property as any
        const response = await pythonMethodsApi.calculateDRC(
          {
            id: valuation.id,
            property_type: assetType,
            region: prop.region || 'greater_accra',
            building_size_sqm: gfa,
            year_built: prop.year_built,
            land_area_sqm: prop.land_area_sqm || prop.plot_size_sqm || 0,
          },
          {
            replacement_cost_per_sqm: replacementCostPerSqm,
            land_value: landValue, // Pass land value from Land Value System (3-method reconciliation)
            mea_factor: meaFactor,
            useful_life: usefulLife,
            // Only pass overrides when user has explicitly overridden
            depreciation_overrides: {
              physical: physicalDepMode === 'user' ? physicalDepreciation / 100 : undefined,
              functional: functionalObsMode === 'user' ? functionalObsolescence / 100 : undefined,
              external: economicObsMode === 'user' ? economicObsolescence / 100 : undefined,
            },
          }
        )
        
        if (response.success && response.data) {
          setPythonResult(response.data)
          console.log('DRC Python result:', response.data)
          
          // Extract system-calculated depreciation values from Python result
          const depDetails = response.data.details?.depreciation
          if (depDetails) {
            // Only update system values, not user-entered values
            if (depDetails.physical?.source === 'calculated') {
              setSystemPhysicalDep(depDetails.physical.rate || 0)
              if (physicalDepMode === 'system') {
                setPhysicalDepreciation(depDetails.physical.rate || 0)
              }
            }
            if (depDetails.functional?.source === 'calculated') {
              setSystemFunctionalObs(depDetails.functional.rate || 0)
              if (functionalObsMode === 'system') {
                setFunctionalObsolescence(depDetails.functional.rate || 0)
              }
            }
            if (depDetails.external?.source === 'calculated') {
              setSystemExternalObs(depDetails.external.rate || 0)
              if (economicObsMode === 'system') {
                setEconomicObsolescence(depDetails.external.rate || 0)
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to calculate DRC via Python:', err)
      } finally {
        setCalculating(false)
      }
    }

    // Debounce the calculation
    const timer = setTimeout(calculateDRC, 500)
    return () => clearTimeout(timer)
  }, [valuation, gfa, replacementCostPerSqm, meaFactor, usefulLife, physicalDepreciation, physicalDepMode, functionalObsolescence, functionalObsMode, economicObsolescence, economicObsMode, landValue, assetType])

  // Save and continue
  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)

      // Use Python result as primary, fallback to local calculation
      const finalValue = pythonResult?.estimated_value || totalValue
      const finalConfidence = pythonResult?.confidence_score || calculateConfidence()

      await valuationsApi.update(valuationId, {
        method_results: {
          ...(valuation?.method_results || {}),
          drc_method: {
            value: finalValue,
            confidence: finalConfidence,
            confidence_level: pythonResult?.confidence_level || 'medium',
            value_range: pythonResult?.value_range,
            grossReplacementCost: pythonResult?.details?.gross_replacement_cost || grossReplacementCost,
            meaAdjustedCost,
            physicalDepreciation: pythonResult?.details?.physical_depreciation_pct || appliedPhysicalDep,
            functionalObsolescence: pythonResult?.details?.functional_obsolescence_pct || functionalObsolescence,
            economicObsolescence: pythonResult?.details?.external_obsolescence_pct || economicObsolescence,
            totalDepreciation: pythonResult?.details?.total_depreciation_pct || totalDepreciation,
            depreciatedReplacementCost: pythonResult?.details?.depreciated_replacement_cost || depreciatedReplacementCost,
            landValue: pythonResult?.details?.land_value || landValue,
            buildingAge: pythonResult?.details?.building_age_years || effectiveAge,
            assetType,
            assumptions: pythonResult?.assumptions || [],
            limitations: pythonResult?.limitations || [],
            calculated_by: pythonResult ? 'python_rics_engine' : 'frontend_calculation',
          },
        },
        current_step: 7,
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
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        <span className="ml-3 font-mono text-sm text-muted-foreground">Loading DRC method...</span>
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
              <h1 className="font-mono text-xl text-foreground">DRC METHOD</h1>
              <MethodBadge method="DRC" />
            </div>
            <p className="font-mono text-xs text-muted-foreground">Depreciated Replacement Cost for Specialized Assets</p>
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
            <div className="p-4 space-y-4">
              {/* Asset Type Dropdown */}
              <div>
                <label className="font-mono text-[10px] text-muted-foreground block mb-1">BUILDING FUNCTION</label>
                <select
                  value={assetType}
                  onChange={(e) => { setAssetType(e.target.value); setUseCustomCost(false) }}
                  className="w-full bg-background border border-border p-2.5 font-mono text-sm text-foreground appearance-none cursor-pointer hover:border-zinc-500 focus:border-amber-500 focus:outline-none"
                >
                  {(() => {
                    const functionIds = Object.keys(costsByFunction).length > 0
                      ? Object.keys(costsByFunction)
                      : FALLBACK_SPECIALIZED_TYPES.map(t => t.id)
                    return functionIds.map(id => (
                      <option key={id} value={id}>
                        {assetTypeLabels[id] || FALLBACK_SPECIALIZED_TYPES.find(t => t.id === id)?.label || id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </option>
                    ))
                  })()}
                </select>
              </div>

              {/* Quality Level Selector */}
              <div>
                <label className="font-mono text-[10px] text-muted-foreground block mb-1">QUALITY LEVEL</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['basic', 'standard', 'premium', 'luxury'] as const).map(level => {
                    const cost = costsByFunction[assetType]?.[level]
                    return (
                      <button
                        key={level}
                        onClick={() => { setQualityLevel(level); setUseCustomCost(false) }}
                        disabled={!cost && Object.keys(costsByFunction).length > 0}
                        className={`p-3 border text-center transition-colors ${
                          qualityLevel === level
                            ? 'bg-amber-500/20 border-amber-500 text-amber-600 dark:text-amber-400'
                            : cost || Object.keys(costsByFunction).length === 0
                              ? 'bg-card border-border text-muted-foreground hover:border-zinc-500'
                              : 'bg-card/50 border-border text-muted-foreground cursor-not-allowed'
                        }`}
                      >
                        <div className="font-mono text-[10px] font-bold uppercase">{level === 'basic' ? 'Basic' : level}</div>
                        {cost ? (
                          <div className="font-mono text-[10px] text-muted-foreground mt-1">
                            GH₵ {cost.toLocaleString()}/sqm
                          </div>
                        ) : Object.keys(costsByFunction).length > 0 ? (
                          <div className="font-mono text-[10px] text-muted-foreground mt-1">N/A</div>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Selected cost summary */}
              <div className="flex items-center justify-between p-2 bg-card/50 border border-border">
                <span className="font-mono text-[10px] text-muted-foreground">Selected Rate</span>
                <span className="font-mono text-sm text-amber-600 dark:text-amber-400 font-bold">
                  GH₵ {replacementCostPerSqm.toLocaleString()}/sqm
                </span>
              </div>
            </div>
          </TerminalPanel>

          {/* Replacement Cost Calculation */}
          <TerminalPanel title="GROSS REPLACEMENT COST">
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-mono text-[10px] text-muted-foreground">GFA (SQM)</label>
                    <span className={`font-mono text-[9px] px-1.5 py-0.5 ${
                      gfaSource === 'property' ? 'bg-green-500/20 text-green-600 dark:text-green-400' :
                      gfaSource === 'estimated' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' :
                      'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                    }`}>
                      {gfaSource === 'property' ? 'FROM PROPERTY' :
                       gfaSource === 'estimated' ? 'ESTIMATED' : 'USER'}
                    </span>
                  </div>
                  <input
                    type="number"
                    value={gfa}
                    readOnly
                    className={`w-full bg-background border p-2 font-mono text-sm text-foreground cursor-not-allowed opacity-80 ${
                      gfaSource === 'estimated' ? 'border-amber-500/50' : 'border-border'
                    }`}
                  />
                  {gfaSource === 'estimated' && (
                    <div className="font-mono text-[9px] text-amber-600 dark:text-amber-400 mt-1">
                      ⚠️ No GFA in property data. Estimated from land area (40% FAR).
                    </div>
                  )}
                </div>
                <div>
                  <label className="font-mono text-[10px] text-muted-foreground block mb-1">
                    REPLACEMENT COST/SQM (GH₵)
                  </label>
                  <input
                    type="number"
                    value={replacementCostPerSqm}
                    onChange={(e) => {
                      setUseCustomCost(true)
                      setReplacementCostPerSqm(Number(e.target.value))
                    }}
                    className="w-full bg-background border border-border p-2 font-mono text-sm text-foreground"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-card border border-border">
                <span className="font-mono text-sm text-muted-foreground">Gross Replacement Cost</span>
                <span className="font-mono text-lg text-foreground font-bold">
                  GH₵ {grossReplacementCost.toLocaleString()}
                </span>
              </div>
            </div>
          </TerminalPanel>

          {/* MEA Adjustment */}
          <TerminalPanel title="MODERN EQUIVALENT ASSET (MEA)">
            <div className="p-4 space-y-4">
              <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/30">
                <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div className="font-mono text-xs text-blue-600 dark:text-blue-300">
                  MEA considers whether a modern equivalent would be built to the same specification. 
                  A library may need less space due to digital resources (factor &lt; 1.0).
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="font-mono text-xs text-muted-foreground">MEA Factor:</label>
                <input
                  type="range"
                  min="0.5"
                  max="1.0"
                  step="0.05"
                  value={meaFactor}
                  onChange={(e) => setMeaFactor(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="font-mono text-sm text-amber-600 dark:text-amber-400 w-16 text-right">
                  {(meaFactor * 100).toFixed(0)}%
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-card border border-border">
                <span className="font-mono text-sm text-muted-foreground">MEA-Adjusted Cost</span>
                <span className="font-mono text-lg text-foreground font-bold">
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
                  <label className="font-mono text-[10px] text-muted-foreground block mb-1">EFFECTIVE AGE (YEARS)</label>
                  <input
                    type="number"
                    value={effectiveAge}
                    onChange={(e) => setEffectiveAge(Number(e.target.value))}
                    className="w-full bg-background border border-border p-2 font-mono text-sm text-foreground"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-muted-foreground block mb-1">USEFUL LIFE (YEARS)</label>
                  <input
                    type="number"
                    value={usefulLife}
                    disabled
                    className="w-full bg-card border border-border p-2 font-mono text-sm text-muted-foreground"
                  />
                </div>
              </div>

              <div className="space-y-4">
                {/* Physical Depreciation */}
                <div className="p-3 bg-card/50 border border-border">
                  <div className="flex justify-between items-center mb-2">
                    <label className="font-mono text-xs text-muted-foreground">Physical Depreciation</label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setPhysicalDepMode('system')
                          setPhysicalDepreciation(systemPhysicalDep)
                        }}
                        className={`px-2 py-1 font-mono text-[9px] transition-all ${
                          physicalDepMode === 'system'
                            ? 'bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/50'
                            : 'bg-muted text-muted-foreground border border-border'
                        }`}
                      >
                        SYS
                      </button>
                      <button
                        onClick={() => setPhysicalDepMode('user')}
                        className={`px-2 py-1 font-mono text-[9px] transition-all ${
                          physicalDepMode === 'user'
                            ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/50'
                            : 'bg-muted text-muted-foreground border border-border'
                        }`}
                      >
                        USER
                      </button>
                      <span className="font-mono text-sm text-amber-600 dark:text-amber-400">{appliedPhysicalDep.toFixed(1)}%</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="90"
                    value={physicalDepreciation || calculatedPhysicalDep}
                    onChange={(e) => {
                      setPhysicalDepreciation(Number(e.target.value))
                      setPhysicalDepMode('user')
                    }}
                    className="w-full"
                    disabled={physicalDepMode === 'system'}
                  />
                  <div className="flex justify-between mt-1">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {physicalDepMode === 'system' 
                        ? `System: Age-Life method (${effectiveAge}y / ${usefulLife}y)`
                        : 'User override'}
                    </span>
                    {systemPhysicalDep > 0 && physicalDepMode === 'user' && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        System: {systemPhysicalDep.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>

                {/* Functional Obsolescence */}
                <div className="p-3 bg-card/50 border border-border">
                  <div className="flex justify-between items-center mb-2">
                    <label className="font-mono text-xs text-muted-foreground">Functional Obsolescence</label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setFunctionalObsMode('system')
                          setFunctionalObsolescence(systemFunctionalObs)
                        }}
                        className={`px-2 py-1 font-mono text-[9px] transition-all ${
                          functionalObsMode === 'system'
                            ? 'bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/50'
                            : 'bg-muted text-muted-foreground border border-border'
                        }`}
                      >
                        SYS
                      </button>
                      <button
                        onClick={() => setFunctionalObsMode('user')}
                        className={`px-2 py-1 font-mono text-[9px] transition-all ${
                          functionalObsMode === 'user'
                            ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/50'
                            : 'bg-muted text-muted-foreground border border-border'
                        }`}
                      >
                        USER
                      </button>
                      <span className="font-mono text-sm text-amber-600 dark:text-amber-400">{functionalObsolescence.toFixed(1)}%</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    value={functionalObsolescence}
                    onChange={(e) => {
                      setFunctionalObsolescence(Number(e.target.value))
                      setFunctionalObsMode('user')
                    }}
                    className="w-full"
                    disabled={functionalObsMode === 'system'}
                  />
                  <div className="flex justify-between mt-1">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {functionalObsMode === 'system' 
                        ? 'System: Auto-detection from property specs'
                        : 'User override'}
                    </span>
                    {systemFunctionalObs > 0 && functionalObsMode === 'user' && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        System: {systemFunctionalObs.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>

                {/* External/Economic Obsolescence */}
                <div className="p-3 bg-card/50 border border-border">
                  <div className="flex justify-between items-center mb-2">
                    <label className="font-mono text-xs text-muted-foreground">External Obsolescence</label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEconomicObsMode('system')
                          setEconomicObsolescence(systemExternalObs)
                        }}
                        className={`px-2 py-1 font-mono text-[9px] transition-all ${
                          economicObsMode === 'system'
                            ? 'bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/50'
                            : 'bg-muted text-muted-foreground border border-border'
                        }`}
                      >
                        SYS
                      </button>
                      <button
                        onClick={() => setEconomicObsMode('user')}
                        className={`px-2 py-1 font-mono text-[9px] transition-all ${
                          economicObsMode === 'user'
                            ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/50'
                            : 'bg-muted text-muted-foreground border border-border'
                        }`}
                      >
                        USER
                      </button>
                      <span className="font-mono text-sm text-amber-600 dark:text-amber-400">{economicObsolescence.toFixed(1)}%</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    value={economicObsolescence}
                    onChange={(e) => {
                      setEconomicObsolescence(Number(e.target.value))
                      setEconomicObsMode('user')
                    }}
                    className="w-full"
                    disabled={economicObsMode === 'system'}
                  />
                  <div className="flex justify-between mt-1">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {economicObsMode === 'system' 
                        ? 'System: Location & market factors'
                        : 'User override'}
                    </span>
                    {systemExternalObs > 0 && economicObsMode === 'user' && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        System: {systemExternalObs.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/30">
                <span className="font-mono text-sm text-red-600 dark:text-red-400">Total Depreciation</span>
                <span className="font-mono text-lg text-red-600 dark:text-red-400 font-bold">
                  -{totalDepreciation.toFixed(1)}% (GH₵ {depreciationAmount.toLocaleString()})
                </span>
              </div>
            </div>
          </TerminalPanel>
        </div>

        {/* Right Column - Summary */}
        <div className="space-y-4">
          {/* Land Value - System-wide calculation */}
          <TerminalPanel title="LAND VALUE">
            <div className="p-4 space-y-3">
              {/* Mode Toggle */}
              <div className="flex gap-1 p-1 bg-card border border-border">
                <button
                  onClick={() => {
                    setLandValueMode('system')
                    setLandValue(systemLandValue)
                  }}
                  className={`flex-1 py-2 px-3 font-mono text-[10px] transition-all ${
                    landValueMode === 'system'
                      ? 'bg-amber-500 text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Calculator className="w-3 h-3 inline mr-1" />
                  SYSTEM
                </button>
                <button
                  onClick={() => {
                    setLandValueMode('user')
                    setLandValue(userLandValue || systemLandValue)
                  }}
                  className={`flex-1 py-2 px-3 font-mono text-[10px] transition-all ${
                    landValueMode === 'user'
                      ? 'bg-amber-500 text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  USER-ENTERED
                </button>
              </div>

              {landValueLoading ? (
                <div className="flex items-center gap-2 p-3 bg-card border border-border">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                  <span className="font-mono text-xs text-muted-foreground">Loading land value...</span>
                </div>
              ) : landValueMode === 'system' ? (
                /* System-Calculated Mode */
                <div className="space-y-2">
                  {systemLandValue > 0 ? (
                    <>
                      <div className="p-3 bg-card border border-green-500/30">
                        <div className="font-mono text-2xl text-foreground mb-1">
                          GH₵ {systemLandValue.toLocaleString()}
                        </div>
                        {landValueMethods.length > 0 && (
                          <div className="font-mono text-[10px] text-muted-foreground">
                            Methods: {landValueMethods.join(' + ')}
                          </div>
                        )}
                        {landValueConfidence > 0 && (
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex-1 h-1 bg-muted rounded">
                              <div 
                                className="h-1 bg-green-500 rounded" 
                                style={{ width: `${landValueConfidence * 100}%` }}
                              />
                            </div>
                            <span className="font-mono text-[10px] text-green-600 dark:text-green-400">
                              {(landValueConfidence * 100).toFixed(0)}%
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        Land value from system-wide 3-method reconciliation
                      </div>
                    </>
                  ) : landValueCalculating ? (
                    /* Auto-calculating in progress */
                    <div className="p-3 bg-card border border-amber-500/30">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                        <span className="font-mono text-xs text-amber-600 dark:text-amber-400">
                          Auto-calculating land value...
                        </span>
                      </div>
                      <p className="font-mono text-[10px] text-muted-foreground mt-2">
                        Using Comparable Sales & Residual methods
                      </p>
                    </div>
                  ) : (
                    /* Calculation failed or returned 0 */
                    <div className="space-y-2">
                      <div className="p-3 bg-amber-500/10 border border-amber-500/30">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          <span className="font-mono text-xs text-amber-600 dark:text-amber-400">
                            Could not calculate land value
                          </span>
                        </div>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          Insufficient data for Comparable/Residual methods. Switch to User-Entered.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* User-Entered Mode */
                <div className="space-y-2">
                  <input
                    type="number"
                    value={userLandValue || ''}
                    onChange={(e) => {
                      const val = Number(e.target.value)
                      setUserLandValue(val)
                      setLandValue(val)
                    }}
                    className="w-full bg-background border border-amber-500/50 p-3 font-mono text-lg text-foreground"
                    placeholder="Enter land value (GH₵)"
                  />
                  <div className="font-mono text-[10px] text-muted-foreground">
                    Manual land value entry. Should be supported by market evidence.
                  </div>
                  {systemLandValue > 0 && userLandValue > 0 && (
                    <div className={`p-2 border ${
                      Math.abs((userLandValue - systemLandValue) / systemLandValue) > 0.2
                        ? 'bg-red-500/10 border-red-500/30'
                        : 'bg-card border-border'
                    }`}>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        System value: GH₵ {systemLandValue.toLocaleString()}
                        <span className={`ml-2 ${
                          Math.abs((userLandValue - systemLandValue) / systemLandValue) > 0.2
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-green-600 dark:text-green-400'
                        }`}>
                          ({((userLandValue - systemLandValue) / systemLandValue * 100).toFixed(1)}% variance)
                        </span>
                      </div>
                      {Math.abs((userLandValue - systemLandValue) / systemLandValue) > 0.2 && (
                        <div className="font-mono text-[10px] text-red-600 dark:text-red-400 mt-1">
                          ⚠️ Variance &gt;20% requires justification
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </TerminalPanel>

          {/* DRC Calculation Summary */}
          <TerminalPanel title="DRC CALCULATION">
            <div className="p-4 space-y-3">
              {/* Show Python result indicator if available */}
              {pythonResult && (
                <div className="flex items-center gap-2 pb-2 mb-2 border-b border-border">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="font-mono text-[10px] text-green-600 dark:text-green-400">RICS-COMPLIANT CALCULATION</span>
                </div>
              )}
              <div className="flex justify-between py-2 border-b border-border">
                <span className="font-mono text-xs text-muted-foreground">Gross Replacement Cost</span>
                <span className="font-mono text-sm text-foreground">
                  GH₵ {(pythonResult?.details?.gross_replacement_cost || grossReplacementCost).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="font-mono text-xs text-muted-foreground">MEA Adjustment ({(meaFactor * 100).toFixed(0)}%)</span>
                <span className="font-mono text-sm text-amber-600 dark:text-amber-400">
                  GH₵ {(pythonResult?.details?.mea_adjusted_grc || meaAdjustedCost).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="font-mono text-xs text-muted-foreground">
                  Less: Depreciation ({(pythonResult?.details?.depreciation?.total?.rate || totalDepreciation).toFixed(1)}%)
                </span>
                <span className="font-mono text-sm text-red-600 dark:text-red-400">
                  -GH₵ {(pythonResult?.details?.depreciation?.total?.amount || depreciationAmount).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="font-mono text-xs text-muted-foreground">Depreciated Replacement Cost</span>
                <span className="font-mono text-sm text-foreground">
                  GH₵ {(pythonResult?.details?.depreciated_building_value || depreciatedReplacementCost).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="font-mono text-xs text-muted-foreground">Plus: Land Value</span>
                <span className="font-mono text-sm text-green-600 dark:text-green-400">
                  +GH₵ {(pythonResult?.details?.land_value || landValue).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-3 bg-amber-500/20 -mx-4 px-4">
                <span className="font-mono text-sm text-amber-600 dark:text-amber-400 font-bold">TOTAL DRC VALUE</span>
                <span className="font-mono text-xl text-amber-600 dark:text-amber-400 font-bold">
                  GH₵ {(pythonResult?.estimated_value || totalValue).toLocaleString()}
                </span>
              </div>
            </div>
          </TerminalPanel>

          {/* Method Notes */}
          <TerminalPanel title="DRC NOTES">
            <div className="p-4 space-y-2">
              <div className="flex items-start gap-2 text-xs">
                <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5" />
                <span className="font-mono text-muted-foreground">
                  DRC is a last resort method when no market evidence exists
                </span>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <Landmark className="w-3 h-3 text-blue-600 dark:text-blue-400 mt-0.5" />
                <span className="font-mono text-muted-foreground">
                  MEA reflects modern functional requirements
                </span>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <TrendingDown className="w-3 h-3 text-red-600 dark:text-red-400 mt-0.5" />
                <span className="font-mono text-muted-foreground">
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
          className="px-6 py-3 bg-muted text-muted-foreground font-mono text-sm hover:text-foreground transition-colors"
        >
          ← BACK
        </Link>
        <button
          onClick={handleSave}
          disabled={saving || totalValue <= 0}
          className="px-6 py-3 bg-amber-500 text-foreground font-mono text-sm font-bold hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {(() => {
            const methods = valuation?.methods_applied || []
            if (methods.includes('profits_method')) return 'SAVE & CONTINUE TO PROFITS →'
            if (methods.includes('residual_method')) return 'SAVE & CONTINUE TO RESIDUAL →'
            return 'SAVE & CONTINUE TO RECONCILIATION →'
          })()}
        </button>
      </div>
    </div>
  )
}
