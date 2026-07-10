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
import { useState, useEffect, useRef } from 'react'
import { FloorPlanAreasBadge } from '@/components/valuation/floorplan-studio/FloorPlanAreas'
import {
  TerminalPanel,
  AlertBanner,
  MethodBadge,
  ConfidenceBar,
} from '@/components/ui/terminal'
import { valuationsApi, pythonMethodsApi, landValueApi, PythonMethodResponse } from '@/lib/valuation-api'
import { fetchApi } from '@/lib/api'
import { valuationConfigApi, mapShortRegionToDataHub } from '@/lib/api'
import { getSelectedMethods, getNextStep, getPrevStep, stepPath } from '@/lib/valuation-workflow'
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

// Specialized cost rates, MEA factors and useful lives all come from the Data Hub
// (specialized_construction_costs) and are resolved by the Node DRC route — no hardcoded tables.
// Human-readable label for a building_function id when the building-functions API has none.
const humanizeFunction = (id: string) =>
  id.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())

export default function DRCMethodPage() {
  const params = useParams()
  const router = useRouter()
  const valuationId = params.id as string

  const [valuation, setValuation] = useState<Valuation | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Rehydrate saved user inputs exactly once on load (avoids clobbering live edits).
  const hydratedRef = useRef(false)

  // Asset details
  const [assetType, setAssetType] = useState('institutional_other')
  const [gfa, setGfa] = useState(0)
  const [gfaSource, setGfaSource] = useState<'property' | 'estimated' | 'user'>('property')
  const [effectiveAge, setEffectiveAge] = useState(0)
  
  // Specialized costs grouped by building function → quality level → cost
  const [costsByFunction, setCostsByFunction] = useState<Record<string, Record<string, number>>>({})
  const [assetTypeLabels, setAssetTypeLabels] = useState<Record<string, string>>({})
  const [qualityLevel, setQualityLevel] = useState<'basic' | 'standard' | 'premium' | 'luxury'>('standard')
  // Building condition — a required RICS DRC input (drives physical depreciation). Prefilled from the
  // property when set; the valuer confirms/overrides it. Sent on every run (no silent backend default).
  const [condition, setCondition] = useState<string>('good')
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

  // Replacement cost inputs — initialised from the Data Hub config (no hardcoded defaults).
  const [replacementCostPerSqm, setReplacementCostPerSqm] = useState(0)
  const [meaFactor, setMeaFactor] = useState(0)
  const [meaOverride, setMeaOverride] = useState<number | null>(null)
  const [usefulLife, setUsefulLife] = useState(0)
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

  // ── Render-only: every figure below comes from the Python DRC engine (single source of truth).
  //    No calculation happens in the browser. ──
  const det: any = pythonResult?.details || {}
  const grossReplacementCost = det.gross_replacement_cost ?? 0
  const meaAdjustedCost = det.mea_adjusted_grc ?? 0
  const appliedPhysicalDep = det.depreciation?.physical?.rate ?? 0
  const totalDepreciation = det.depreciation?.total?.rate ?? 0
  const depreciationAmount = det.depreciation?.total?.amount ?? 0
  const depreciatedReplacementCost = det.depreciated_building_value ?? 0
  const totalValue = pythonResult?.estimated_value ?? 0

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

        // Rehydrate previously-saved user inputs ONCE so editable fields survive
        // navigating away and back (results alone are not enough).
        const savedInputs = (res.data as any)?.method_results?.drc_method?.inputs
        if (!hydratedRef.current && savedInputs) {
          if (savedInputs.assetType !== undefined) setAssetType(savedInputs.assetType)
          if (savedInputs.qualityLevel !== undefined) setQualityLevel(savedInputs.qualityLevel)
          if (savedInputs.condition !== undefined) setCondition(savedInputs.condition)
          if (savedInputs.effectiveAge !== undefined) setEffectiveAge(savedInputs.effectiveAge)
          if (savedInputs.gfa !== undefined) setGfa(savedInputs.gfa)
          if (savedInputs.gfaSource !== undefined) setGfaSource(savedInputs.gfaSource)
          if (savedInputs.replacementCostPerSqm !== undefined) setReplacementCostPerSqm(savedInputs.replacementCostPerSqm)
          if (savedInputs.useCustomCost !== undefined) setUseCustomCost(savedInputs.useCustomCost)
          if (savedInputs.meaOverride !== undefined) setMeaOverride(savedInputs.meaOverride)
          if (savedInputs.physicalDepreciation !== undefined) setPhysicalDepreciation(savedInputs.physicalDepreciation)
          if (savedInputs.physicalDepMode !== undefined) setPhysicalDepMode(savedInputs.physicalDepMode)
          if (savedInputs.economicObsolescence !== undefined) setEconomicObsolescence(savedInputs.economicObsolescence)
          if (savedInputs.economicObsMode !== undefined) setEconomicObsMode(savedInputs.economicObsMode)
          if (savedInputs.landValueMode !== undefined) setLandValueMode(savedInputs.landValueMode)
          if (savedInputs.userLandValue !== undefined) setUserLandValue(savedInputs.userLandValue)
          hydratedRef.current = true
        }

        const prop = res.data.property as any
        if (prop) {
          // Try multiple possible field names for building area / GFA
          const gfaValue = prop.built_area_sqm || prop.building_area_sqm || prop.gfa || 
                           prop.grossFloorArea || prop.builtArea || prop.gross_floor_area || 0
          
          // GFA must be a real measured figure — NO land-area estimate. If the property has none,
          // gfa stays 0 and the engine strict-fails until the valuer enters it manually.
          if (gfaValue > 0) {
            setGfa(gfaValue)
            setGfaSource('property')
          }
          
          // Calculate effective age
          const yearBuilt = prop.year_built || prop.yearBuilt
          const actualAge = yearBuilt ? new Date().getFullYear() - yearBuilt : 0
          setEffectiveAge(prop.age || actualAge)
          if (prop.condition) setCondition(String(prop.condition))

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

  // Cost rate from the Data Hub config when the asset type / quality changes (no static fallback).
  // MEA factor + useful life are resolved server-side and echoed back in the engine result.
  useEffect(() => {
    if (!useCustomCost) {
      const rate = costsByFunction[assetType]?.[qualityLevel]
      setReplacementCostPerSqm(rate ?? 0)
    }
  }, [assetType, qualityLevel, useCustomCost, costsByFunction])

  // Run the DRC engine via the Node route — the SINGLE source of truth. It resolves the cost rate,
  // MEA factor, useful life, land value and building attributes from the Data Hub / property
  // (applying any explicit valuer overrides) and runs the Python engine. We only render the result.
  useEffect(() => {
    const calculateDRC = async () => {
      if (!valuation?.property || !assetType || !qualityLevel) return
      setCalculating(true)
      setError(null)
      try {
        const body: any = { building_function: assetType, quality_level: qualityLevel, condition }
        // Only send a field as an OVERRIDE when the valuer has explicitly set it; otherwise the
        // Node route resolves it from the Data Hub / property.
        if (gfaSource === 'user' && gfa > 0) body.gfa_sqm = gfa
        if (useCustomCost && replacementCostPerSqm > 0) body.replacement_cost_per_sqm = replacementCostPerSqm
        if (landValueMode === 'user' && landValue > 0) body.land_value = landValue
        // MEA: send an explicit final override only when the valuer sets one; otherwise the engine
        // computes it from the per-class baseline + the property's features.
        if (meaOverride && meaOverride > 0) body.mea_factor_override = meaOverride
        // Functional obsolescence is captured in the MEA factor (Model A) — never sent separately.
        const depOv: any = {}
        if (physicalDepMode === 'user') depOv.physical = physicalDepreciation / 100
        if (economicObsMode === 'user') depOv.external = economicObsolescence / 100
        if (Object.keys(depOv).length) body.depreciation_overrides = depOv

        const response = await fetchApi<any>(`/valuations/${valuationId}/drc/value`, {
          method: 'POST',
          body: JSON.stringify(body),
        })
        const data = response?.data
        if (!data) { setPythonResult(null); return }
        setPythonResult(data)

        const d = data.details || {}
        // Echo the engine's resolved inputs into the editable fields (display only, when not overridden).
        if (d.mea_factor) setMeaFactor(d.mea_factor)
        if (d.useful_life_years) setUsefulLife(d.useful_life_years)
        if (landValueMode === 'system' && d.land_value) setLandValue(d.land_value)

        const dep = d.depreciation
        if (dep) {
          if (dep.physical?.source === 'calculated') {
            setSystemPhysicalDep(dep.physical.rate || 0)
            if (physicalDepMode === 'system') setPhysicalDepreciation(dep.physical.rate || 0)
          }
          if (dep.functional?.source === 'calculated') {
            setSystemFunctionalObs(dep.functional.rate || 0)
            if (functionalObsMode === 'system') setFunctionalObsolescence(dep.functional.rate || 0)
          }
          if (dep.external?.source === 'calculated') {
            setSystemExternalObs(dep.external.rate || 0)
            if (economicObsMode === 'system') setEconomicObsolescence(dep.external.rate || 0)
          }
        }
      } catch (err: any) {
        setPythonResult(null)
        setError(err?.message || 'The DRC engine could not value this property — check the required inputs (GFA, cost rate, land value).')
      } finally {
        setCalculating(false)
      }
    }

    const timer = setTimeout(calculateDRC, 500)
    return () => clearTimeout(timer)
  }, [valuation, valuationId, assetType, qualityLevel, condition, gfa, gfaSource, useCustomCost, replacementCostPerSqm, landValue, landValueMode, meaOverride, physicalDepreciation, physicalDepMode, economicObsolescence, economicObsMode])

  // Save and navigate. goBack=true persists best-effort then steps to the previous
  // methodology (so editable inputs are never lost on BACK); forward keeps validation.
  const handleSave = async (goBack = false) => {
    try {
      setSaving(true)
      setError(null)

      // Strict (forward only): only the engine result is persisted — no local fallback.
      // On BACK we still persist whatever inputs exist even if the engine hasn't run.
      if (!goBack && !pythonResult) {
        setError('Cannot save — the DRC engine has not returned a value yet. Resolve the required inputs first.')
        setSaving(false)
        return
      }
      const d: any = pythonResult?.details || {}

      // Every user-editable engine input — persisted so the page can rehydrate on return.
      const inputs = {
        assetType,
        qualityLevel,
        condition,
        effectiveAge,
        gfa,
        gfaSource,
        replacementCostPerSqm,
        useCustomCost,
        meaOverride,
        physicalDepreciation,
        physicalDepMode,
        economicObsolescence,
        economicObsMode,
        landValueMode,
        userLandValue,
      }

      try {
        await valuationsApi.update(valuationId, {
          method_results: {
            ...(valuation?.method_results || {}),
            drc_method: {
              ...((valuation?.method_results as any)?.drc_method || {}),
              value: pythonResult?.estimated_value,
              confidence: pythonResult?.confidence_score,
              confidence_level: pythonResult?.confidence_level,
              value_range: pythonResult?.value_range,
              grossReplacementCost: d.gross_replacement_cost,
              meaAdjustedCost: d.mea_adjusted_grc,
              physicalDepreciation: d.depreciation?.physical?.rate,
              functionalObsolescence: d.depreciation?.functional?.rate,
              economicObsolescence: d.depreciation?.external?.rate,
              totalDepreciation: d.depreciation?.total?.rate,
              depreciatedReplacementCost: d.depreciated_building_value,
              landValue: d.land_value,
              buildingAge: d.building_age_years,
              assetType,
              assumptions: pythonResult?.assumptions || [],
              limitations: pythonResult?.limitations || [],
              calculated_by: 'python_rics_engine',
              inputs,
            },
          },
          current_step: 7,
        })
      } catch (saveErr) {
        // On BACK, navigate anyway (best-effort persistence). On forward, surface the error.
        if (!goBack) throw saveErr
      }

      // Navigate to the previous/next active methodology (driven by methods_applied).
      const methods = getSelectedMethods(valuation)
      const dest = goBack ? getPrevStep('drc', methods) : getNextStep('drc', methods)
      router.push(stepPath(valuationId, dest))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // Confidence comes from the engine (no local heuristic / hardcoded thresholds).
  const calculateConfidence = () => pythonResult?.confidence_score ?? 0

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
          <Link href={stepPath(valuationId, getPrevStep('drc', getSelectedMethods(valuation)))} className="p-2 hover:bg-muted transition-colors">
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
                  {Object.keys(costsByFunction).map(id => (
                    <option key={id} value={id}>
                      {assetTypeLabels[id] || humanizeFunction(id)}
                    </option>
                  ))}
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

              {/* Building condition — required RICS DRC input (drives physical depreciation) */}
              <div className="mt-4">
                <label className="font-mono text-[10px] text-muted-foreground block mb-1">BUILDING CONDITION</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['excellent', 'good', 'fair', 'poor'] as const).map(c => (
                    <button
                      key={c}
                      onClick={() => setCondition(c)}
                      className={`p-3 border text-center transition-colors ${
                        condition === c
                          ? 'bg-amber-500/20 border-amber-500 text-amber-600 dark:text-amber-400'
                          : 'bg-card border-border text-muted-foreground hover:border-zinc-500'
                      }`}
                    >
                      <div className="font-mono text-[10px] font-bold uppercase">{c}</div>
                    </button>
                  ))}
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
                  <FloorPlanAreasBadge
                    valuationId={valuationId}
                    basis="gfa"
                    current={gfa}
                    onApply={(v) => {
                      setGfa(v)
                      setGfaSource('user')
                    }}
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
                  MEA is the cost of a modern equivalent. The Data Hub sets the per-class baseline; the
                  property’s own features (design era, specification, services, configuration) modulate it.
                  Functional/design obsolescence is captured here — not deducted again (no double count).
                </div>
              </div>

              {/* Feature-driven MEA breakdown (auditable). Sourced entirely from the engine result. */}
              {(() => {
                const mb: any = det.mea_breakdown
                if (!mb) return null
                return (
                  <div className="p-3 bg-card border border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {mb.source === 'valuer_override' ? 'MEA FACTOR (VALUER OVERRIDE)' : 'MEA FACTOR (BASELINE → FEATURES)'}
                      </span>
                      <span className="font-mono text-lg text-amber-600 dark:text-amber-400 font-bold">
                        {(meaFactor * 100).toFixed(1)}%
                      </span>
                    </div>
                    {mb.source !== 'valuer_override' && (
                      <>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          Baseline {(mb.baseline * 100).toFixed(0)}% · adequacy {mb.adequacy_score}/5 · range ±{(mb.feature_range * 100).toFixed(0)}%
                        </div>
                        <div className="space-y-1">
                          {(mb.dimensions || []).map((dim: any) => (
                            <div key={dim.key} className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[10px] text-muted-foreground capitalize">{dim.note}</span>
                              <span className="font-mono text-[10px] text-foreground">{dim.score}/5</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )
              })()}

              {/* Optional valuer override of the final MEA factor (RICS judgment). */}
              <div className="flex items-center gap-3">
                <label className="font-mono text-[10px] text-muted-foreground">OVERRIDE MEA (%)</label>
                <input
                  type="number"
                  min={50}
                  max={100}
                  step={1}
                  value={meaOverride != null ? Math.round(meaOverride * 100) : ''}
                  placeholder="auto"
                  onChange={(e) => {
                    const v = e.target.value
                    setMeaOverride(v === '' ? null : Math.max(0.5, Math.min(1, Number(v) / 100)))
                  }}
                  className="w-24 bg-background border border-border p-2 font-mono text-sm text-foreground"
                />
                {meaOverride != null && (
                  <button type="button" onClick={() => setMeaOverride(null)} className="font-mono text-[10px] text-amber-500 hover:underline">use feature model</button>
                )}
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
                    value={physicalDepreciation || appliedPhysicalDep}
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

                {/* Functional Obsolescence — folded into the feature-driven MEA factor (Model A). */}
                <div className="p-3 bg-muted/40 border border-dashed border-border">
                  <div className="flex justify-between items-center">
                    <label className="font-mono text-xs text-muted-foreground">Functional Obsolescence</label>
                    <span className="font-mono text-[10px] text-muted-foreground">captured in MEA →</span>
                  </div>
                  <p className="font-mono text-[10px] text-muted-foreground mt-1">
                    Functional / design adequacy is assessed in the MEA factor above (from the property’s
                    features). It is not deducted again here, to avoid double counting (RICS).
                  </p>
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
        <button
          onClick={() => handleSave(true)}
          disabled={saving}
          className="px-6 py-3 bg-muted text-muted-foreground font-mono text-sm hover:text-foreground disabled:opacity-50 transition-colors"
        >
          ← BACK TO {getPrevStep('drc', getSelectedMethods(valuation)).label}
        </button>
        <button
          onClick={() => handleSave(false)}
          disabled={saving || totalValue <= 0}
          className="px-6 py-3 bg-amber-500 text-foreground font-mono text-sm font-bold hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          SAVE & CONTINUE TO {getNextStep('drc', getSelectedMethods(valuation)).label} →
        </button>
      </div>
    </div>
  )
}
