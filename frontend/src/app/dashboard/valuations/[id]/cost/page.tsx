'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import {
  TerminalPanel,
  AlertBanner,
  MethodBadge,
  ConfidenceBar,
  PropertyTypeBadge,
} from '@/components/ui/terminal'
import { EditableConstructionCostPanel, type ConstructionCostEditableData, type MaterialIndex } from '@/components/valuation/EditableConstructionCostPanel'
import { valuationsApi, costApproachApi, overridesApi, landValueApi, pythonMethodsApi } from '@/lib/valuation-api'
import { valuationConfigApi, mapPropertyRegionToConstructionCluster, mapShortRegionToDataHub } from '@/lib/api'
import type { Valuation, CostApproachData } from '@/types/valuation'
import type { RegionCode as DataHubRegionCode } from '@/types/data-hub'
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
  AlertTriangle,
  MessageSquare,
  RefreshCw,
  HelpCircle,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// Quality tier configuration (labels and descriptions only - costs come from Data Hub)
const QUALITY_TIER_CONFIG: Record<string, { label: string; description: string }> = {
  basic: { label: 'Basic/Economy', description: 'Sandcrete blocks, basic finishes' },
  standard: { label: 'Standard', description: 'Quality blocks, standard finishes' },
  premium: { label: 'Premium', description: 'High-quality materials, good finishes' },
  luxury: { label: 'Luxury', description: 'Premium materials, imported finishes' },
  custom: { label: 'Custom', description: 'User-customized pricing and materials' },
  ultra_luxury: { label: 'Ultra Luxury', description: 'Bespoke, international standards' },
}

interface BaseCostData {
  quality_tier: string
  display_name: string
  base_cost_per_sqm: number
  base_year: number
}

interface RegionalFactorData {
  region_code: string
  region_name: string
  location_factor: number
}

// Depreciation factors with GhIS/RICS-aligned tooltips
const DEPRECIATION_TYPES = {
  physical: { 
    label: 'Physical Depreciation', 
    description: 'Wear and tear, age-related deterioration',
    tooltip: 'Loss in value due to age-related wear and tear of the building structure. Automatically estimated based on effective age unless manually adjusted.',
    icon: Wrench,
  },
  functional: { 
    label: 'Functional Obsolescence', 
    description: 'Outdated design, layout inefficiencies',
    tooltip: 'Loss in value arising from outdated design, inefficient layouts, or inadequate specifications relative to modern standards.',
    icon: Building2,
  },
  external: { 
    label: 'External Obsolescence', 
    description: 'Neighborhood decline, economic factors',
    tooltip: 'Loss in value caused by external factors beyond the property, such as neighborhood decline, infrastructure issues, or adverse economic conditions.',
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
  const [loadingCosts, setLoadingCosts] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Data Hub fetched data
  const [baseCosts, setBaseCosts] = useState<Record<string, { cost: number; displayName: string }>>({})
  const [regionalFactor, setRegionalFactor] = useState<{ name: string; factor: number }>({ name: 'Ghana', factor: 1.0 })
  const [dataSourceInfo, setDataSourceInfo] = useState<{ lastUpdated: string; baseYear: number } | null>(null)

  // Cost inputs
  const [landValue, setLandValue] = useState(0)
  const [landValueMode, setLandValueMode] = useState<'system' | 'user'>('user') // Land value mode
  const [systemLandValue, setSystemLandValue] = useState<number | null>(null) // System-estimated land value
  const [constructionQuality, setConstructionQuality] = useState<string>('standard')
  const [constructionRate, setConstructionRate] = useState(5000)
  const [systemRate, setSystemRate] = useState<number | null>(null) // Track the system default
  const [gfa, setGfa] = useState(0)
  const [plotSize, setPlotSize] = useState(0) // Land area from property
  const [components, setComponents] = useState<ComponentCost[]>([])

  // Override tracking
  const [hasOverride, setHasOverride] = useState(false)
  const [showReasonDialog, setShowReasonDialog] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')

  // Material cost panel state
  const [showMaterialPanel, setShowMaterialPanel] = useState(false)
  const [materialCostData, setMaterialCostData] = useState<ConstructionCostEditableData | null>(null)
  const [materialOverrides, setMaterialOverrides] = useState<MaterialIndex[]>([])

  // Memoized callback to prevent infinite loops
  const handleMaterialDataChange = useCallback((data: ConstructionCostEditableData) => {
    setMaterialCostData(data)
    // If materials are edited, recalculate construction rate
    if (data.material_indices && data.material_indices.length > 0) {
      setMaterialOverrides(data.material_indices)
    }
  }, [])

  // Depreciation inputs
  const [physicalDepreciation, setPhysicalDepreciation] = useState(0)
  const [functionalObsolescence, setFunctionalObsolescence] = useState(0)
  const [externalObsolescence, setExternalObsolescence] = useState(0)

  // Additional costs
  const [softCosts, setSoftCosts] = useState(10) // % of hard costs
  const [entrepreneurialProfit, setEntrepreneurialProfit] = useState(15) // % of total
  const [siteworks, setSiteworks] = useState(0)

  // Python RICS Engine calculation result
  const [pythonResult, setPythonResult] = useState<any>(null)
  const [calculating, setCalculating] = useState(false)

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
        // API returns property with camelCase fields: builtArea, grossFloorArea, landArea, plotSize
        const property = valuationRes.data.property
        setGfa(property?.builtArea || property?.grossFloorArea || property?.building_area_sqm || 200)
        setPlotSize(property?.plotSize || property?.landArea || property?.land_area_sqm || 0)

        // Load existing cost approach data if available
        if (costRes.data) {
          const data = costRes.data
          const gfaValue = property?.builtArea || property?.grossFloorArea || property?.building_area_sqm || 200
          setLandValue(data.land_value || 0)
          setConstructionRate(data.replacement_cost_new ? data.replacement_cost_new / gfaValue : 5000)
          setPhysicalDepreciation(data.physical_depreciation || 0)
          setFunctionalObsolescence(data.functional_obsolescence || 0)
          setExternalObsolescence(data.external_obsolescence || 0)
          setSoftCosts(data.calculations?.softCostsPercent || 10)
          setEntrepreneurialProfit(data.calculations?.entrepreneurialProfitPercent || 15)
          setSiteworks(data.calculations?.siteworks || 0)
          if (data.calculations?.components) setComponents(data.calculations.components)
          if (data.calculations?.constructionQuality) setConstructionQuality(data.calculations.constructionQuality)
          if (data.calculations?.hasOverride) setHasOverride(true)
          if (data.calculations?.overrideReason) setOverrideReason(data.calculations.overrideReason)
        }

        // Fetch system-estimated land value (weighted average from Residual + Comparable methods)
        try {
          const landValueRes = await landValueApi.calculate(valuationId, { force_recalculate: false })
          if (landValueRes.success && landValueRes.data) {
            const sysLandValue = landValueRes.data.final_land_value
            setSystemLandValue(sysLandValue)
            // If no saved land value, use system value and switch to system mode
            if (!costRes.data?.land_value || costRes.data.land_value === 0) {
              setLandValue(sysLandValue)
              setLandValueMode('system')
            }
          }
        } catch (landErr) {
          console.warn('Could not fetch system land value:', landErr)
          // Non-blocking - user can still enter manually
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [valuationId])

  // Calculate via Python RICS Engine when inputs change
  useEffect(() => {
    const calculateCost = async () => {
      if (!valuation?.property || gfa <= 0) return
      
      setCalculating(true)
      try {
        const prop = valuation.property as any
        const result = await pythonMethodsApi.calculateCostApproach(
          {
            id: prop.id,
            property_type: prop.property_type || 'residential',
            region: prop.region || 'greater_accra',
            land_area_sqm: plotSize || prop.land_area_sqm,
            building_size_sqm: gfa,
            year_built: prop.year_built,
            condition: prop.condition,
            quality_tier: constructionQuality,
          },
          {
            land_value_per_sqm: plotSize > 0 ? landValue / plotSize : undefined,
            construction_cost_per_sqm: constructionRate,
            depreciation_overrides: {
              physical: physicalDepreciation,
              functional: functionalObsolescence,
              external: externalObsolescence,
            },
          }
        )
        
        if (result.success && result.data) {
          setPythonResult(result.data)
        }
      } catch (err) {
        console.error('Python Cost calculation error:', err)
        // Keep using local calculation on error
      } finally {
        setCalculating(false)
      }
    }

    // Debounce calculation
    const timer = setTimeout(calculateCost, 500)
    return () => clearTimeout(timer)
  }, [valuation, gfa, plotSize, constructionQuality, constructionRate, landValue, physicalDepreciation, functionalObsolescence, externalObsolescence])

  // Fetch construction costs from Data Hub
  const fetchConstructionCosts = useCallback(async (shortRegionCode: string) => {
    try {
      setLoadingCosts(true)

      // Map short region code (GAR, ASH) to data-hub format (greater_accra, ashanti)
      const dataHubRegion = mapShortRegionToDataHub(shortRegionCode)
      // Then map to construction cost cluster
      const apiRegion = mapPropertyRegionToConstructionCluster(dataHubRegion)

      const [baseCostsRes, regionalsRes] = await Promise.all([
        valuationConfigApi.getBaseCosts(),
        valuationConfigApi.getRegionalFactors(),
      ])

      // Process base costs from Data Hub
      if (baseCostsRes.success && baseCostsRes.data && baseCostsRes.data.length > 0) {
        const costs: Record<string, { cost: number; displayName: string }> = {}
        let baseYear = 2020

        baseCostsRes.data.forEach((c: BaseCostData) => {
          costs[c.quality_tier] = { 
            cost: c.base_cost_per_sqm, 
            displayName: c.display_name || QUALITY_TIER_CONFIG[c.quality_tier]?.label || c.quality_tier 
          }
          if (c.base_year) baseYear = c.base_year
        })

        setBaseCosts(costs)
        setDataSourceInfo({ lastUpdated: new Date().toISOString(), baseYear })

        // Set default rate from fetched data if not already set
        if (costs[constructionQuality]) {
          const fetchedRate = costs[constructionQuality].cost
          setSystemRate(fetchedRate)
          // Only set construction rate if it's the default (not from saved data)
          if (constructionRate === 5000) {
            setConstructionRate(fetchedRate)
          }
        }
      }

      // Process regional factors
      if (regionalsRes.success && regionalsRes.data && regionalsRes.data.length > 0) {
        const factor = regionalsRes.data.find((r: RegionalFactorData) => r.region_code === apiRegion)
        if (factor) {
          setRegionalFactor({ name: factor.region_name, factor: factor.location_factor })
        }
      }
    } catch (err) {
      console.error('Failed to fetch construction costs from Data Hub:', err)
      // Don't set error - page can still work with user input
    } finally {
      setLoadingCosts(false)
    }
  }, [constructionQuality, constructionRate])

  // Fetch construction costs when valuation is loaded
  useEffect(() => {
    if (valuation?.property?.region) {
      fetchConstructionCosts(valuation.property.region)
    } else {
      // Default to Greater Accra if no region
      fetchConstructionCosts('GAR')
    }
  }, [valuation?.property?.region, fetchConstructionCosts])

  // Update construction rate when quality changes
  useEffect(() => {
    // For custom quality, use standard tier rate as base (before user edits material prices)
    const effectiveQuality = constructionQuality === 'custom' ? 'standard' : constructionQuality;
    
    if (baseCosts[effectiveQuality]) {
      const baseRate = baseCosts[effectiveQuality].cost;
      const adjustedRate = Math.round(baseRate * regionalFactor.factor);
      setSystemRate(adjustedRate);
      
      // Only auto-update rate if user hasn't made custom edits
      if (!hasOverride) {
        setConstructionRate(adjustedRate);
      }
    }
  }, [constructionQuality, baseCosts, regionalFactor.factor])

  // Auto-calculate depreciation when valuation data is available
  useEffect(() => {
    if (valuation?.property && !calculatingDepreciation) {
      calculateAgeDepreciation()
    }
  }, [valuation?.property?.year_built, (valuation?.property as any)?.condition])

  // Track when user modifies the rate from system default
  const handleRateChange = (newRate: number) => {
    setConstructionRate(newRate)
    if (systemRate !== null && newRate !== systemRate) {
      setHasOverride(true)
    } else {
      setHasOverride(false)
    }
  }

  // Reset to system rate
  const resetToSystemRate = () => {
    if (systemRate !== null) {
      setConstructionRate(systemRate)
      setHasOverride(false)
      setOverrideReason('')
    }
  }

  // Handle quality tier selection - properly reset rate when changing from custom to standard tier
  const handleQualityChange = (quality: string) => {
    setConstructionQuality(quality)
    
    // If selecting a non-custom tier, reset to that tier's base cost
    if (quality !== 'custom' && baseCosts[quality]) {
      const baseRate = baseCosts[quality].cost
      const adjustedRate = Math.round(baseRate * regionalFactor.factor)
      setConstructionRate(adjustedRate)
      setSystemRate(adjustedRate)
      setHasOverride(false)
      setOverrideReason('')
    }
    // If selecting custom, keep current rate and set hasOverride based on whether it differs from standard
    else if (quality === 'custom' && baseCosts['standard']) {
      const standardRate = Math.round(baseCosts['standard'].cost * regionalFactor.factor)
      setSystemRate(standardRate)
      // Only mark as override if current rate differs from standard
      if (constructionRate !== standardRate) {
        setHasOverride(true)
      }
    }
  }

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

  // Auto-calculate depreciation using Python valuation engine
  const [calculatingDepreciation, setCalculatingDepreciation] = useState(false)
  
  const calculateAgeDepreciation = async () => {
    const property = valuation?.property as any
    if (!property?.year_built) {
      // Fallback to simple calculation if no property data
      const yearBuilt = property?.year_built || new Date().getFullYear() - 15
      const age = new Date().getFullYear() - yearBuilt
      const effectiveLife = 60
      const straightLineDepreciation = Math.min((age / effectiveLife) * 100, 80)
      setPhysicalDepreciation(Math.round(straightLineDepreciation))
      return
    }

    try {
      setCalculatingDepreciation(true)
      
      // Call Python valuation engine depreciation API via the API client
      const result = await pythonMethodsApi.calculateDepreciation(
        {
          id: valuation?.id || 'unknown',
          property_type: property.propertyType || property.property_type || 'residential_house',
          region: property.region || 'greater_accra',
          year_built: property.year_built,
          condition: property.condition || 'good',
          building_size_sqm: property.builtArea || property.grossFloorArea || property.building_area_sqm || gfa,
          bedrooms: property.bedrooms,
          bathrooms: property.bathrooms,
          parking_spaces: property.parking_spaces,
          has_ac: property.has_air_conditioning || property.hasAirConditioning,
          has_generator: property.has_generator || property.hasGenerator,
          has_borehole: property.has_borehole || property.hasBorehole,
        },
        {
          include_external: true,
          location_data: {
            road_type: property.roadAccess || property.road_access,
            flood_zone: property.floodZone || property.flood_zone,
          },
          market_data: {},
        }
      )

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Depreciation calculation failed')
      }

      const data = result.data
      
      // Update state with calculated values (convert from decimal to percentage)
      setPhysicalDepreciation(Math.round(data.physical.depreciation_rate * 100))
      setFunctionalObsolescence(Math.round(data.functional.depreciation_rate * 100))
      if (data.external) {
        setExternalObsolescence(Math.round(data.external.depreciation_rate * 100))
      }
      
      console.log('Depreciation auto-calculated:', {
        physical: data.physical.depreciation_percent,
        functional: data.functional.depreciation_percent,
        external: data.external?.depreciation_percent || 0,
        total: data.total?.percent || 0,
      })
    } catch (err) {
      console.error('Depreciation calculation error:', err)
      // Fallback to simple age-based calculation
      const age = new Date().getFullYear() - (property.year_built || new Date().getFullYear() - 15)
      const effectiveLife = 60
      const straightLineDepreciation = Math.min((age / effectiveLife) * 100, 80)
      setPhysicalDepreciation(Math.round(straightLineDepreciation))
    } finally {
      setCalculatingDepreciation(false)
    }
  }

  // Save and continue
  const handleSave = async () => {
    // Validate override reason if user has overridden the rate
    if (hasOverride && !overrideReason.trim()) {
      setError('Please provide a justification for using a custom construction rate')
      return
    }

    try {
      setSaving(true)
      setError(null)

      // Save cost approach data
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
        cost_source: hasOverride || materialOverrides.length > 0 ? 'user_override' : 'propmetrik_data_hub',
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
          // Track override information
          hasOverride,
          systemRate,
          overrideReason: hasOverride ? overrideReason : undefined,
          regionalFactor: regionalFactor.factor,
          regionName: regionalFactor.name,
          // Track material cost overrides
          materialOverrides: materialOverrides.length > 0 ? materialOverrides : undefined,
          materialCostData: materialCostData || undefined,
        },
      })

      // Save override record if user overrode the rate
      if (hasOverride && systemRate !== null) {
        try {
          await overridesApi.create(valuationId, {
            category: 'cost_input',
            field_path: 'construction_rate',
            field_label: 'Construction Rate per SQM',
            system_default_value: systemRate,
            user_override_value: constructionRate,
            reason: overrideReason,
            value_unit: 'GHS/sqm',
          })
        } catch (overrideErr) {
          console.warn('Failed to save override record:', overrideErr)
          // Don't fail the entire save for this
        }
      }

      // Update valuation method result and ensure methods_applied is set
      const existingMethods = valuation?.methods_applied || []
      const updatedMethods = existingMethods.includes('cost_approach') 
        ? existingMethods 
        : [...existingMethods, 'cost_approach']
      
      // Always use the displayed indicatedValue as the saved value
      // Python result provides confidence/metadata but the user's configured value is authoritative
      const finalValue = indicatedValue
      const finalConfidence = pythonResult?.confidence_score ?? calculateConfidence()
      
      await valuationsApi.update(valuationId, {
        method_results: {
          ...(valuation?.method_results || {}),
          cost_approach: {
            method: 'cost_approach',
            value: finalValue,
            value_ghs: finalValue,
            confidence: finalConfidence,
            confidence_score: finalConfidence,
            confidence_level: pythonResult?.confidence_level ?? 'medium',
            value_range: pythonResult?.value_range ?? { low: finalValue * 0.9, high: finalValue * 1.1 },
            details: pythonResult?.details ?? {
              land_value: landValue,
              construction_cost_new: reproductionCostNew,
              depreciation_amount: depreciationAmount,
              depreciated_building_value: depreciatedBuildingValue,
            },
            assumptions: pythonResult?.assumptions ?? [],
            limitations: pythonResult?.limitations ?? [],
            calculated_by: pythonResult ? 'python_rics_engine' : 'frontend_fallback',
            weight: 0,
            is_primary: false,
            notes: hasOverride ? 'Includes user overrides' : 'System-calculated',
            calculated_at: new Date().toISOString(),
            inputs: {
              landValue,
              buildingValue: depreciatedBuildingValue,
              totalDepreciation,
              hasOverride,
            },
          },
        },
        methods_applied: updatedMethods,
        current_step: 6,
        // Also update summary fields on the main valuation record
        cost_approach_value: finalValue,
        cost_approach_confidence: finalConfidence,
      })

      // Navigate to next step based on selected methods
      const selectedMethods = (valuation as any)?.selectedMethods || valuation?.methods_applied || []
      const hasIncomeApproach = selectedMethods.includes('income_approach')
      const hasDRC = selectedMethods.includes('drc_method')
      const hasProfits = selectedMethods.includes('profits_method')
      const hasResidual = selectedMethods.includes('residual_method')
      
      if (hasIncomeApproach) {
        // Route to rental-market first for rental comparable analysis
        router.push(`/dashboard/valuations/${valuationId}/rental-market`)
      } else if (hasDRC) {
        router.push(`/dashboard/valuations/${valuationId}/drc`)
      } else if (hasProfits) {
        router.push(`/dashboard/valuations/${valuationId}/profits`)
      } else if (hasResidual) {
        router.push(`/dashboard/valuations/${valuationId}/residual`)
      } else {
        // No more methods selected - go directly to reconciliation
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
      // If Sales Comparison is selected, we came from Market page
      return `/dashboard/valuations/${valuationId}/market`
    }
    // If no Sales Comparison, we came directly from Methods (skipped Comparables)
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
            {/* Land Value Mode Selector */}
            <div className="mb-4 flex items-center gap-4">
              <span className="font-mono text-[10px] text-zinc-500">MODE:</span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setLandValueMode('system')
                    if (systemLandValue !== null) setLandValue(systemLandValue)
                  }}
                  className={`px-3 py-1 font-mono text-[10px] border transition-colors ${
                    landValueMode === 'system'
                      ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  ◉ System-Estimated
                </button>
                <button
                  onClick={() => setLandValueMode('user')}
                  className={`px-3 py-1 font-mono text-[10px] border transition-colors ${
                    landValueMode === 'user'
                      ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  ◯ User-Entered
                </button>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-3.5 h-3.5 text-amber-500 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-sm bg-zinc-900 border border-amber-500/30 text-zinc-200 p-3">
                    <p className="font-mono text-xs mb-2">
                      <strong className="text-amber-500">Land Value Input Mode</strong>
                    </p>
                    <p className="text-[10px] text-zinc-400 mb-2">
                      Choose how land value is determined.
                    </p>
                    <p className="text-[10px] text-zinc-400 mb-1">
                      <strong className="text-amber-500">System-Estimated:</strong> Uses modeled market evidence and development feasibility.
                    </p>
                    <p className="text-[10px] text-zinc-400 mb-2">
                      <strong className="text-amber-500">User-Entered:</strong> Manual override based on specific transaction knowledge.
                    </p>
                    <p className="text-[9px] text-zinc-500 italic">
                      User-entered values override system estimates in all calculations.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="font-mono text-[10px] text-zinc-500 mb-2 flex items-center gap-1">
                  LAND / SITE VALUE (₵)
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-amber-500/70 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-3">
                        <p className="font-mono text-xs mb-2">
                          <strong className="text-amber-500">Land Value (₵)</strong>
                        </p>
                        <p className="text-[10px] text-zinc-400 mb-2">
                          Estimated value of the land as at the valuation date.
                        </p>
                        <p className="text-[10px] text-zinc-400 mb-2">
                          System estimates are derived from development feasibility and adjusted market listings in accordance with GhIS practice and RICS guidance for thin markets.
                        </p>
                        <p className="text-[9px] text-zinc-500 italic">
                          This is an indicative land value, not a verified transaction price.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </label>
                <input
                  type="number"
                  value={landValue}
                  onChange={(e) => setLandValue(parseFloat(e.target.value) || 0)}
                  className={`w-full px-3 py-2 bg-black border text-white font-mono text-lg focus:border-amber-500 ${
                    landValueMode === 'system' ? 'border-zinc-600 opacity-70' : 'border-zinc-700'
                  }`}
                  placeholder="Enter land value..."
                  disabled={landValueMode === 'system'}
                />
                {/* Show system estimate and variance when in user mode */}
                {landValueMode === 'user' && systemLandValue !== null && systemLandValue > 0 && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-[10px] text-zinc-500">
                      System: ₵{systemLandValue.toLocaleString()}
                    </span>
                    {landValue > 0 && (
                      <span className={`font-mono text-[10px] ${
                        Math.abs((landValue - systemLandValue) / systemLandValue) > 0.2
                          ? 'text-red-400'
                          : 'text-green-400'
                      }`}>
                        {landValue > systemLandValue ? '+' : ''}{Math.round(((landValue - systemLandValue) / systemLandValue) * 100)}%
                      </span>
                    )}
                    {Math.abs((landValue - systemLandValue) / systemLandValue) > 0.2 && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertTriangle className="w-3 h-3 text-red-400" />
                          </TooltipTrigger>
                          <TooltipContent className="bg-red-900/90 border-red-500/50 text-red-200 p-2">
                            <span className="text-[10px]">Variance exceeds ±20% — justification required</span>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                )}
                {landValueMode === 'system' ? (
                  <p className="font-mono text-[10px] text-zinc-500 mt-1">
                    Based on comparable land sales / benchmark
                  </p>
                ) : (
                  <p className="font-mono text-[10px] text-zinc-500 mt-1">
                    Use comparable land sales or residual land value
                  </p>
                )}
              </div>
              <div className="flex items-end">
                <div className="w-full p-3 bg-zinc-800/30">
                  <div className="font-mono text-[10px] text-zinc-500 flex items-center gap-1">
                    PLOT SIZE
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3 h-3 text-amber-500/70 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-3">
                          <p className="font-mono text-xs mb-1">
                            <strong className="text-amber-500">Plot Size</strong>
                          </p>
                          <p className="text-[10px] text-zinc-400">
                            Total site area measured in square meters. Used to derive implied land value per sqm and assess development density assumptions.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="font-mono text-lg text-white">
                    {plotSize > 0 ? plotSize.toLocaleString() : '—'} sqm
                  </div>
                  {landValue > 0 && plotSize > 0 && (
                    <div className="font-mono text-xs text-zinc-400 mt-1">
                      ₵{Math.round(landValue / plotSize).toLocaleString()}/sqm
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TerminalPanel>

          {/* Construction Costs */}
          <TerminalPanel title="CONSTRUCTION COSTS">
            {/* Data Source Info */}
            {dataSourceInfo && (
              <div className="mb-4 p-2 bg-zinc-800/30 border border-zinc-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Info className="w-3 h-3 text-amber-500" />
                  <span className="font-mono text-[10px] text-zinc-400">
                    Data from PROPMETRIK Data Hub • Base Year: {dataSourceInfo.baseYear}
                    {regionalFactor.factor !== 1.0 && ` • ${regionalFactor.name} Factor: ${regionalFactor.factor}x`}
                  </span>
                </div>
                <button
                  onClick={() => valuation?.property?.region && fetchConstructionCosts(valuation.property.region)}
                  className="p-1 hover:bg-zinc-700 rounded transition-colors"
                  title="Refresh data"
                >
                  <RefreshCw className={`w-3 h-3 text-zinc-400 ${loadingCosts ? 'animate-spin' : ''}`} />
                </button>
              </div>
            )}

            {/* Quality Selection */}
            <div className="mb-4">
              <label className="font-mono text-[10px] text-zinc-500 mb-2 flex items-center gap-1">
                CONSTRUCTION QUALITY
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-amber-500/70 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-3">
                      <p className="font-mono text-xs mb-2">
                        <strong className="text-amber-500">Construction Quality Assumption</strong>
                      </p>
                      <p className="text-[10px] text-zinc-400 mb-2">
                        Select the expected build quality level. Rates reflect prevailing construction costs for similar projects in the selected region and base year.
                      </p>
                      <p className="text-[9px] text-zinc-500 italic">
                        Actual project costs may vary depending on design complexity, procurement strategy, and market conditions.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </label>
              {loadingCosts ? (
                <div className="flex items-center justify-center p-8 border border-zinc-800">
                  <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                  <span className="ml-2 font-mono text-xs text-zinc-400">Loading construction costs...</span>
                </div>
              ) : Object.keys(baseCosts).length > 0 ? (
                <div className="grid grid-cols-6 gap-2">
                  {Object.entries(baseCosts).map(([key, data]) => {
                    const config = QUALITY_TIER_CONFIG[key] || { label: data.displayName, description: '' }
                    return (
                      <button
                        key={key}
                        onClick={() => handleQualityChange(key)}
                        className={`p-3 text-left border transition-colors ${
                          constructionQuality === key
                            ? 'border-amber-500 bg-amber-900/20'
                            : 'border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        <div className="font-mono text-xs text-white">{config.label}</div>
                        <div className="font-mono text-[10px] text-zinc-500">
                          ₵{Math.round(data.cost * regionalFactor.factor).toLocaleString()}/sqm
                        </div>
                      </button>
                    )
                  })}
                  
                  {/* Custom Quality Card */}
                  <button
                    onClick={() => handleQualityChange('custom')}
                    className={`p-3 text-left border transition-colors ${
                      constructionQuality === 'custom'
                        ? 'border-amber-500 bg-amber-900/20'
                        : 'border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="font-mono text-xs text-white">Custom</div>
                    <div className="font-mono text-[10px] text-zinc-500">
                      User-defined
                    </div>
                  </button>
                </div>
              ) : (
                <div className="p-4 border border-amber-500/30 bg-amber-900/10">
                  <div className="flex items-center gap-2 text-amber-500 mb-2">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="font-mono text-xs">No construction cost data available</span>
                  </div>
                  <p className="font-mono text-[10px] text-zinc-400">
                    Enter construction rate manually below or contact admin to update Data Hub.
                  </p>
                </div>
              )}
            </div>

            {/* Rate and GFA */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="font-mono text-[10px] text-zinc-500 mb-2 flex items-center gap-1">
                  RATE PER SQM (₵)
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-amber-500/70 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-3">
                        <p className="font-mono text-xs mb-2">
                          <strong className="text-amber-500">Construction Rate per sqm</strong>
                        </p>
                        <p className="text-[10px] text-zinc-400">
                          Average all-in construction cost per square meter, excluding land. Includes materials, labor, preliminaries, and contractor overheads based on regional cost indices.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {constructionQuality === 'custom' && hasOverride && (
                    <span className="ml-2 text-amber-500">CUSTOM</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={constructionRate}
                    onChange={(e) => handleRateChange(parseFloat(e.target.value) || 0)}
                    className={`w-full px-3 py-2 bg-black border text-white font-mono focus:border-amber-500 ${
                      constructionQuality === 'custom' && hasOverride ? 'border-amber-500' : 'border-zinc-700'
                    }`}
                  />
                  {constructionQuality === 'custom' && hasOverride && systemRate !== null && (
                    <button
                      onClick={resetToSystemRate}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-700 rounded text-amber-500"
                      title="Reset to system rate"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {constructionQuality === 'custom' && hasOverride && systemRate !== null && (
                  <p className="font-mono text-[10px] text-amber-500 mt-1">
                    System rate: ₵{systemRate.toLocaleString()}/sqm
                  </p>
                )}
              </div>
              <div>
                <label className="font-mono text-[10px] text-zinc-500 mb-2 flex items-center gap-1">
                  GROSS FLOOR AREA (SQM)
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-amber-500/70 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-3">
                        <p className="font-mono text-xs mb-2">
                          <strong className="text-amber-500">Gross Floor Area (GFA)</strong>
                        </p>
                        <p className="text-[10px] text-zinc-400">
                          Total constructed floor area used for cost estimation. Includes all usable floors but excludes external works unless explicitly stated.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
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
                  <div className="font-mono text-[10px] text-zinc-500 flex items-center gap-1">
                    HARD COSTS
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3 h-3 text-amber-500/70 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-3">
                          <p className="font-mono text-xs mb-2">
                            <strong className="text-amber-500">Hard Construction Costs</strong>
                          </p>
                          <p className="text-[10px] text-zinc-400">
                            Direct costs associated with building the structure, calculated as: Rate per sqm × Gross Floor Area.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="font-mono text-lg text-white">₵{hardCosts.toLocaleString()}</div>
                </div>
              </div>
            </div>

            {/* Override Reason (shown when user overrides in custom mode) */}
            {hasOverride && constructionQuality === 'custom' && (
              <div className="mb-4 p-3 border border-amber-500/30 bg-amber-900/10">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-4 h-4 text-amber-500" />
                  <span className="font-mono text-xs text-amber-500">OVERRIDE JUSTIFICATION REQUIRED</span>
                </div>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Explain why you're using a custom rate (e.g., recent contractor quotes, specific material requirements)..."
                  className="w-full px-3 py-2 bg-black border border-amber-500/50 text-white font-mono text-xs focus:border-amber-500 min-h-[60px]"
                />
                <p className="font-mono text-[10px] text-zinc-500 mt-1">
                  This justification will be included in the valuation report as a disclaimer.
                </p>
              </div>
            )}

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
                <label className="font-mono text-[10px] text-zinc-500 mb-2 flex items-center gap-1">
                  SOFT COSTS (% OF HARD)
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-amber-500/70 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-3">
                        <p className="font-mono text-xs mb-2">
                          <strong className="text-amber-500">Soft Costs</strong>
                        </p>
                        <p className="text-[10px] text-zinc-400 mb-2">
                          Allowance for professional fees, permits, approvals, supervision, and project management.
                        </p>
                        <p className="text-[9px] text-zinc-500 italic">
                          Typically ranges between 8–15% of hard construction costs depending on project complexity.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
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
                <label className="font-mono text-[10px] text-zinc-500 mb-2 flex items-center gap-1">
                  SITEWORKS (₵)
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-amber-500/70 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-3">
                        <p className="font-mono text-xs mb-2">
                          <strong className="text-amber-500">Siteworks</strong>
                        </p>
                        <p className="text-[10px] text-zinc-400 mb-2">
                          Costs related to land preparation and external works, including drainage, utilities, landscaping, and access roads.
                        </p>
                        <p className="text-[9px] text-zinc-500 italic">
                          Enter zero if siteworks are already included in construction rates.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
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
                <label className="font-mono text-[10px] text-zinc-500 mb-2 flex items-center gap-1">
                  ENTREPRENEURIAL PROFIT (%)
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-amber-500/70 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-sm bg-zinc-900 border border-amber-500/30 text-zinc-200 p-3">
                        <p className="font-mono text-xs mb-2">
                          <strong className="text-amber-500">Entrepreneurial Profit</strong>
                        </p>
                        <p className="text-[10px] text-zinc-400 mb-2">
                          Allowance for developer risk and return. This reflects market-required compensation for construction, financing, planning, and market risk — it is not a guaranteed margin.
                        </p>
                        <p className="text-[10px] text-zinc-400 mb-1">
                          <strong>Typical ranges (Ghana):</strong>
                        </p>
                        <ul className="text-[10px] text-zinc-400 list-disc list-inside mb-2">
                          <li>Residential: 15–20%</li>
                          <li>Commercial: 18–25%</li>
                          <li>High-risk projects: 25–30%</li>
                        </ul>
                        <p className="text-[9px] text-zinc-500 italic">
                          Aligned with GhIS and RICS cost approach guidelines.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
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

          {/* Material Costs Panel - Expandable with Override Capability */}
          {valuation?.property?.region && (
            <EditableConstructionCostPanel
              region={mapShortRegionToDataHub(valuation.property.region) as DataHubRegionCode}
              qualityTier={constructionQuality}
              valuationId={valuationId}
              collapsed={!showMaterialPanel}
              constructionQuality={constructionQuality}
              onConstructionQualityChange={setConstructionQuality}
              onDataChange={handleMaterialDataChange}
              onSave={async (data, overrides) => {
                // Handle saving overrides - the component already saves to the overrides API
                // Just update local state with any changes
                if (data.effective_cost_per_sqm) {
                  setConstructionRate(data.effective_cost_per_sqm)
                  setHasOverride(true)
                }
                console.log('Construction cost overrides saved:', overrides?.length || 0, 'overrides')
              }}
              className="mt-4"
            />
          )}

          {/* Depreciation */}
          <TerminalPanel title="DEPRECIATION">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] text-zinc-500 font-mono">
                {calculatingDepreciation ? 'Calculating...' : 'Auto-calculated from property data'}
              </span>
              <button
                onClick={calculateAgeDepreciation}
                disabled={calculatingDepreciation}
                className="flex items-center gap-1 px-2 py-1 bg-zinc-800 text-zinc-400 font-mono text-[10px] hover:text-white disabled:opacity-50"
              >
                {calculatingDepreciation ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> CALCULATING...</>
                ) : (
                  <><Calculator className="w-3 h-3" /> RECALCULATE</>
                )}
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
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3 h-3 text-amber-500/70 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-3">
                            <p className="font-mono text-xs mb-1">
                              <strong className="text-amber-500">{type.label}</strong>
                            </p>
                            <p className="text-[10px] text-zinc-400">{type.tooltip}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
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

            {/* Depreciation Summary Inline */}
            <div className="mt-4 p-3 bg-zinc-900/50 border border-zinc-800">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-zinc-400">DEPRECIATION IMPACT</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-amber-500/70 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-3">
                        <p className="font-mono text-xs mb-1">
                          <strong className="text-amber-500">Total Depreciation</strong>
                        </p>
                        <p className="text-[10px] text-zinc-400">
                          Combined effect of physical, functional, and external depreciation applied to reproduction cost new. 
                          The total percentage deducted from RCN to arrive at the depreciated building value.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <span className="font-mono text-xl text-red-400">−{totalDepreciation}%</span>
              </div>
              <div className="flex items-center gap-4 text-[10px] font-mono">
                <span className="text-zinc-500">
                  Loss: <span className="text-red-400">₵{Math.round(depreciationAmount).toLocaleString()}</span>
                </span>
                {totalDepreciation > 0 && (
                  <span className="text-zinc-500">
                    Primary driver: <span className="text-amber-500">
                      {physicalDepreciation >= functionalObsolescence && physicalDepreciation >= externalObsolescence
                        ? `Physical (${physicalDepreciation}%)`
                        : functionalObsolescence >= externalObsolescence
                        ? `Functional (${functionalObsolescence}%)`
                        : `External (${externalObsolescence}%)`}
                    </span>
                  </span>
                )}
              </div>
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
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400">Reproduction Cost New</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-amber-500/70 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-3">
                        <p className="font-mono text-xs mb-1">
                          <strong className="text-amber-500">Reproduction Cost New (RCN)</strong>
                        </p>
                        <p className="text-[10px] text-zinc-400">
                          Estimated cost to construct an equivalent building with similar utility and quality at current prices, excluding land. 
                          Includes hard costs, soft costs, siteworks, and entrepreneurial profit.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <span className="text-white font-bold">₵{Math.round(reproductionCostNew).toLocaleString()}</span>
              </div>

              <div className="flex justify-between text-xs font-mono text-red-400">
                <span>− Depreciation ({totalDepreciation}%)</span>
                <span>(₵{Math.round(depreciationAmount).toLocaleString()})</span>
              </div>

              <div className="border-t border-zinc-800 pt-3 flex justify-between text-sm font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400">Depreciated Building Value</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-amber-500/70 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-3">
                        <p className="font-mono text-xs mb-1">
                          <strong className="text-amber-500">Depreciated Building Value</strong>
                        </p>
                        <p className="text-[10px] text-zinc-400">
                          Reproduction cost new less total depreciation. Represents the current contributory value of 
                          the improvements after accounting for physical wear, functional obsolescence, and external factors.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <span className="text-white font-bold">₵{Math.round(depreciatedBuildingValue).toLocaleString()}</span>
              </div>

              <div className="flex justify-between text-xs font-mono">
                <span className="text-zinc-500">+ Land Value</span>
                <span className="text-white">₵{landValue.toLocaleString()}</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t-2 border-zinc-700">
              <div className="text-center p-4 bg-green-900/20 border border-green-800">
                <div className="flex items-center justify-center gap-2">
                  <div className="font-mono text-[10px] text-green-400 mb-1">INDICATED VALUE (COST)</div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-green-400/70 cursor-help mb-1" />
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs bg-zinc-900 border border-green-500/30 text-zinc-200 p-3">
                        <p className="font-mono text-xs mb-1">
                          <strong className="text-green-400">Indicated Value (Cost Approach)</strong>
                        </p>
                        <p className="text-[10px] text-zinc-400">
                          Value indication derived from the cost approach: Depreciated Building Value + Land Value. 
                          This method is most reliable for newer or specialized properties where comparable sales may be limited.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="font-mono text-3xl text-green-400 font-bold">
                  ₵{Math.round(indicatedValue).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-zinc-500">CONFIDENCE</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-amber-500/70 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-3">
                        <p className="font-mono text-xs mb-1">
                          <strong className="text-amber-500">Confidence Level</strong>
                        </p>
                        <p className="text-[10px] text-zinc-400">
                          Qualitative indicator reflecting data completeness, assumption reliability, and method suitability. 
                          Higher confidence indicates stronger supporting evidence; it does not imply certainty.
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-1 italic">
                          Per RICS Valuation Standards, confidence levels should be disclosed in valuation reports.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <ConfidenceBar score={calculateConfidence() * 100} />
              </div>
            </div>
          </TerminalPanel>

          {/* Visual Breakdown */}
          <TerminalPanel title="VALUE COMPOSITION">
            <div className="flex items-center gap-2 mb-3 -mt-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-1 text-zinc-500 cursor-help">
                      <HelpCircle className="w-3 h-3 text-amber-500/70" />
                      <span className="font-mono text-[10px]">What is this?</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-3">
                    <p className="font-mono text-xs mb-1">
                      <strong className="text-amber-500">Value Composition</strong>
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      Visual breakdown of the indicated value showing the proportional contribution of land and depreciated 
                      building value. A healthy composition typically shows building value exceeding land value for improved properties.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
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

      {/* Global Disclaimer */}
      <div className="mt-6 p-4 bg-zinc-900/50 border border-zinc-800 rounded">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-mono text-xs text-amber-500 font-bold mb-2">VALUATION DISCLAIMER</p>
            <p className="font-mono text-[10px] text-zinc-400 leading-relaxed">
              All values presented are indicative estimates based on market data and professional judgment. 
              They do not constitute formal appraisals and should not be relied upon for legal, lending, or transactional purposes 
              without independent verification by a registered valuer. Construction rates are sourced from GhIS/GREDA benchmarks and 
              may vary based on specifications, location, and market conditions. Adjustments may be required following physical inspection.
            </p>
            <p className="font-mono text-[10px] text-zinc-500 mt-2 italic">
              Prepared in accordance with RICS Valuation – Global Standards and Ghana Institution of Surveyors guidance.
            </p>
          </div>
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
          className="px-6 py-3 bg-amber-500 text-white font-mono text-sm font-bold hover:bg-amber-400 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {(() => {
            const selectedMethods = (valuation as any)?.selectedMethods || valuation?.methods_applied || []
            const hasIncomeApproach = selectedMethods.includes('income_approach')
            return hasIncomeApproach 
              ? 'SAVE & CONTINUE TO RENTAL MARKET →' 
              : 'SAVE & CONTINUE TO RECONCILIATION →'
          })()}
        </button>
      </div>
    </div>
  )
}
