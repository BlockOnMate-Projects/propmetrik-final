'use client'

/**
 * Rental Market Analysis Page
 * 
 * Dedicated page for rental comparables selection and market rent estimation.
 * Similar to the sales /market page but for rental properties.
 * 
 * Flow: Method Selection → Rental Market (this page) → Income Approach
 * Only accessible when income_approach is selected.
 * 
 * Features:
 * - Search and filter rental comparables within radius
 * - Select and adjust rental comparables
 * - Calculate market rent estimation
 * - Save rental basket for use in Income Approach
 */

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { FloorPlanAreasBadge } from '@/components/valuation/floorplan-studio/FloorPlanAreas'
import {
  TerminalPanel,
  StatusBadge,
  AlertBanner,
  MethodBadge,
  ConfidenceBar,
  PropertyTypeBadge,
} from '@/components/ui/terminal'
import { valuationsApi, rentalComparablesApi, type RentalComparable, type RentalSearchResponse } from '@/lib/valuation-api'
import { getSelectedMethods, getNextStep, getPrevStep, stepPath } from '@/lib/valuation-workflow'
import type { Valuation } from '@/types/valuation'
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Plus,
  X,
  MapPin,
  Home,
  Calendar,
  Ruler,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Search,
  Filter,
  Check,
  Calculator,
  BarChart3,
  Settings2,
  Eye,
  Scale,
  Lock,
  Unlock,
  Info,
  RefreshCw,
  Bed,
  Bath,
  DollarSign,
} from 'lucide-react'
import {
  RentalAdjustmentGrid,
  type RentalSubjectProperty,
  type RentalComparableWithAdjustments,
} from '@/components/valuation'
import { cn } from '@/lib/utils'

// =====================================================
// TYPES
// =====================================================

type WeightingMethod = 'quality_weighted' | 'simple_average' | 'median' | 'manual'

interface RentalComparableSelected extends RentalComparable {
  adjustments: Record<string, number>
  totalAdjustment: number
  adjustedRent: number
  adjustedRentPerSqm: number
  weight: number
  isLocked?: boolean
}

// =====================================================
// HELPER COMPONENTS
// =====================================================

function StatCard({
  label,
  value,
  unit = '',
  subtext,
  highlight = false
}: {
  label: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn(
      'p-3 border',
      highlight ? 'border-amber-500/50 bg-amber-100 dark:bg-amber-900/10' : 'border-border bg-card/50'
    )}>
      <div className="font-mono text-[10px] text-muted-foreground uppercase mb-1">{label}</div>
      <div className={cn(
        'font-mono text-lg',
        highlight ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'
      )}>
        {value}{unit && <span className="text-xs text-muted-foreground ml-1">{unit}</span>}
      </div>
      {subtext && (
        <div className="font-mono text-[10px] text-muted-foreground mt-1">{subtext}</div>
      )}
    </div>
  )
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const getColor = (c: number) => {
    if (c >= 80) return 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 border-green-800'
    if (c >= 60) return 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 border-amber-800'
    return 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 border-red-800'
  }

  const getLabel = (c: number) => {
    if (c >= 80) return 'HIGH'
    if (c >= 60) return 'MODERATE'
    return 'LOW'
  }

  return (
    <span className={cn(
      'px-2 py-0.5 font-mono text-[10px] border',
      getColor(confidence)
    )}>
      {getLabel(confidence)} ({confidence}%)
    </span>
  )
}

// Format currency
const formatCurrency = (value: number | null | undefined): string => {
  if (!value) return '₵0'
  return `₵${value.toLocaleString('en-GH', { maximumFractionDigits: 0 })}`
}

// Format date
const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export default function RentalMarketPage() {
  const params = useParams()
  const router = useRouter()
  const valuationId = params.id as string

  // Core state
  const [valuation, setValuation] = useState<Valuation | null>(null)
  const [searchResponse, setSearchResponse] = useState<RentalSearchResponse | null>(null)
  const [searchResults, setSearchResults] = useState<RentalComparable[]>([])
  const [selectedComparables, setSelectedComparables] = useState<RentalComparableSelected[]>([])
  // Market-rent ENGINE result (single source of truth). The frontend computes no rent itself.
  const [engineResult, setEngineResult] = useState<any>(null)
  const [engineRunning, setEngineRunning] = useState(false)
  const [recalcNonce, setRecalcNonce] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Market benchmarks fallback
  const [benchmark, setBenchmark] = useState<{
    areaName: string
    listingCount: number
    avgRentMonthly: number
    medianRentMonthly: number
    minRentMonthly: number
    maxRentMonthly: number
  } | null>(null)

  // View options
  const [weightingMethod, setWeightingMethod] = useState<WeightingMethod>('quality_weighted')
  const [showWeights, setShowWeights] = useState(false)

  // Search filters
  const [searchRadius, setSearchRadius] = useState(5) // km
  const [maxAge, setMaxAge] = useState(12) // months
  const [bedroomRange, setBedroomRange] = useState({ min: 0, max: 10 })
  const [showFilters, setShowFilters] = useState(false)

  // =====================================================
  // DATA FETCHING
  // =====================================================

  // Fetch valuation data
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        setError(null)

        const valuationRes = await valuationsApi.getById(valuationId)
        if (valuationRes.error) throw new Error(valuationRes.error)
        if (!valuationRes.data) throw new Error('Valuation not found')

        setValuation(valuationRes.data as Valuation)

        // Check if income approach is selected
        const selectedMethods = (valuationRes.data as any)?.selectedMethods || valuationRes.data.methods_applied || []
        const hasIncomeApproach = selectedMethods.includes('income_approach')

        if (!hasIncomeApproach) {
          // Redirect if income approach not selected
          router.replace(`/dashboard/valuations/${valuationId}/methods`)
          return
        }

        // Set initial bedroom range based on subject property
        const bedrooms = valuationRes.data.property?.bedrooms
        if (bedrooms) {
          setBedroomRange({ min: Math.max(1, bedrooms - 1), max: bedrooms + 1 })
        }

        // Load any existing saved rental basket from valuation data
        const savedAnalysis = (valuationRes.data as any)?.rental_market_analysis
        if (savedAnalysis && savedAnalysis.comparables && savedAnalysis.comparables.length > 0) {
          // Restore saved comparables with their adjustments
          const restoredComparables: RentalComparableSelected[] = savedAnalysis.comparables.map((c: any) => ({
            id: c.id,
            title: c.address || '',
            address_street: c.address,
            asking_rent_monthly: c.asking_rent || 0,
            adjustedRent: c.adjusted_rent || c.asking_rent || 0,
            adjustments: c.adjustments || {},
            totalAdjustment: c.total_adjustment || 0,
            bedrooms: c.bedrooms,
            bathrooms: c.bathrooms,
            gfa_sqm: c.gfa_sqm,
            distance_km: c.distance_km || 0,
            similarity_score: c.similarity_score || 0,
            weight: 1 / savedAnalysis.comparables.length,
            qualityScore: c.quality_score || 3,
          }))
          setSelectedComparables(restoredComparables)

          // Restore search criteria if available
          if (savedAnalysis.search_criteria) {
            if (savedAnalysis.search_criteria.radius_km) setSearchRadius(savedAnalysis.search_criteria.radius_km)
            if (savedAnalysis.search_criteria.max_age_months) setMaxAge(savedAnalysis.search_criteria.max_age_months)
            if (savedAnalysis.search_criteria.bedrooms_range) setBedroomRange(savedAnalysis.search_criteria.bedrooms_range)
          }

          // Restore weighting method
          if (savedAnalysis.methodology) setWeightingMethod(savedAnalysis.methodology)

          console.log('Restored', restoredComparables.length, 'saved comparables from previous analysis')
        }

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [valuationId, router])

  // =====================================================
  // SEARCH & SELECTION
  // =====================================================

  // Search for rental comparables
  const handleSearch = async () => {
    if (!valuation?.property) return

    try {
      setSearching(true)
      setError(null)

      const response = await rentalComparablesApi.search(valuationId, {
        radiusKm: searchRadius,
        maxAgeMonths: maxAge,
        propertyType: valuation.property.property_type,
        bedroomsMin: bedroomRange.min,
        bedroomsMax: bedroomRange.max,
        excludeIds: selectedComparables.map(c => c.id),
        limit: 20,
      })

      if (!response.success) {
        throw new Error(response.error || 'Failed to search rental comparables')
      }

      setSearchResponse(response)
      // Postgres returns numeric columns as STRINGS — coerce here so all downstream math and
      // `.toFixed()` calls (e.g. adjustedRentPerSqm) operate on real numbers, not strings.
      setSearchResults((response.data || []).map((c: any) => ({
        ...c,
        asking_rent_monthly: Number(c.asking_rent_monthly) || 0,
        rent_per_sqm_monthly: Number(c.rent_per_sqm_monthly) || 0,
        distance_km: Number(c.distance_km) || 0,
        similarity_score: Number(c.similarity_score) || 0,
        gfa_sqm: c.gfa_sqm != null ? Number(c.gfa_sqm) : c.gfa_sqm,
      })))

      // Fetch benchmark if few results
      const compCount = response.data?.length || 0
      const prop = valuation.property as any
      const neighborhood = prop?.neighborhood || prop?.district || prop?.address_city || prop?.city
      if (compCount < 5 && neighborhood) {
        try {
          const benchmarkRes = await rentalComparablesApi.getMarketBenchmarks(
            neighborhood
          )
          if (benchmarkRes.success && benchmarkRes.data) {
            setBenchmark({
              areaName: benchmarkRes.data.areaName,
              listingCount: benchmarkRes.data.listingCount,
              avgRentMonthly: benchmarkRes.data.avgRentMonthly,
              medianRentMonthly: benchmarkRes.data.medianRentMonthly,
              minRentMonthly: benchmarkRes.data.minRentMonthly,
              maxRentMonthly: benchmarkRes.data.maxRentMonthly,
            })
          }
        } catch {
          // Benchmark fetch is optional
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  // Initial search on load
  useEffect(() => {
    if (valuation && !searchResponse && !loading) {
      handleSearch()
    }
  }, [valuation, searchResponse, loading])

  // Add comparable to selection with auto-calculate
  const addComparable = useCallback((comp: RentalComparable) => {
    // Calculate rent per sqm if not available
    const rentPerSqm = comp.rent_per_sqm_monthly || (comp.gfa_sqm ? comp.asking_rent_monthly / comp.gfa_sqm : 0)

    // No local adjustment math — the market-rent engine computes every adjustment (using the
    // factors from valuation_adjustment_factors) and merges the result back in. Start neutral.
    const selected: RentalComparableSelected = {
      ...comp,
      adjustments: {},
      totalAdjustment: 0,
      adjustedRent: comp.asking_rent_monthly,
      adjustedRentPerSqm: rentPerSqm,
      weight: 1 / (selectedComparables.length + 1),
      isLocked: false,
    }

    // Recalculate weights
    const newComps = [...selectedComparables, selected].map(c => ({
      ...c,
      weight: 1 / (selectedComparables.length + 1),
    }))

    setSelectedComparables(newComps)
    setSearchResults(searchResults.filter(c => c.id !== comp.id))
  }, [selectedComparables, searchResults, valuation])

  // Remove comparable from selection
  const removeComparable = useCallback((compId: string) => {
    const comp = selectedComparables.find(c => c.id === compId)
    if (comp) {
      const remaining = selectedComparables.filter(c => c.id !== compId)
      const newComps = remaining.map(c => ({
        ...c,
        weight: remaining.length > 0 ? 1 / remaining.length : 0,
      }))

      setSearchResults([...searchResults, comp])
      setSelectedComparables(newComps)
    }
  }, [selectedComparables, searchResults])

  // =====================================================
  // ADJUSTMENT HANDLERS
  // =====================================================

  // Update single adjustment
  const handleAdjustmentChange = useCallback((compId: string, adjustmentId: string, value: number) => {
    setSelectedComparables(prev =>
      prev.map(comp => {
        if (comp.id !== compId || comp.isLocked) return comp

        const newAdjustments = { ...comp.adjustments, [adjustmentId]: value }
        const totalAdjustment = Object.values(newAdjustments).reduce((sum, v) => sum + (v || 0), 0)
        const adjustedRent = comp.asking_rent_monthly * (1 + totalAdjustment / 100)
        const adjustedRentPerSqm = comp.gfa_sqm ? adjustedRent / comp.gfa_sqm : 0

        return {
          ...comp,
          adjustments: newAdjustments,
          totalAdjustment,
          adjustedRent,
          adjustedRentPerSqm,
        }
      })
    )
  }, [])

  // Toggle lock on comparable
  const handleLockToggle = useCallback((compId: string) => {
    setSelectedComparables(prev =>
      prev.map(comp => comp.id === compId ? { ...comp, isLocked: !comp.isLocked } : comp)
    )
  }, [])

  // Auto-calculate adjustments for a comparable
  const handleAutoCalculate = useCallback((compId: string) => {
    if (!valuation?.property) return

    setSelectedComparables(prev =>
      // The engine computes every adjustment (factors from valuation_adjustment_factors) and
      // merges the result back in via the selection effect — there is no per-comp math here.
      prev.map(comp => comp)
    )
  }, [valuation])

  // "Auto-calculate all" simply nudges the engine to re-run for the current basket.
  const handleAutoCalculateAll = useCallback(() => {
    setRecalcNonce((n) => n + 1)
  }, [])

  // =====================================================
  // VALUE CALCULATIONS
  // =====================================================

  // Calculate quality scores for weighting
  const calculateQualityScore = useCallback((comp: RentalComparableSelected): number => {
    // Prefer the engine's comparability score once it has run (single source of truth).
    if ((comp as any).qualityScore != null) return Math.round((comp as any).qualityScore)
    let score = 0
    const subject = valuation?.property as any

    // 1. SIZE MATCH (up to 30 points) - how close is the GFA to subject
    if (subject?.gfa_sqm && comp.gfa_sqm) {
      const sizeDiff = Math.abs(subject.gfa_sqm - comp.gfa_sqm) / subject.gfa_sqm
      const sizeScore = Math.max(0, 30 - sizeDiff * 100) // 0% diff = 30pts, 30%+ diff = 0pts
      score += sizeScore
    } else {
      score += 15 // Default if can't compare
    }

    // 2. BEDROOM MATCH (up to 20 points)
    if (subject?.bedrooms !== undefined && comp.bedrooms !== undefined) {
      const bedDiff = Math.abs(subject.bedrooms - comp.bedrooms)
      const bedScore = Math.max(0, 20 - bedDiff * 10) // Same = 20pts, 1 diff = 10pts, 2+ diff = 0pts
      score += bedScore
    } else {
      score += 10
    }

    // 3. DISTANCE SCORE (up to 25 points) - closer is better
    if (comp.distance_km !== undefined) {
      const distScore = Math.max(0, 25 - comp.distance_km * 5) // 0km = 25pts, 5km = 0pts
      score += distScore
    } else {
      score += 12.5
    }

    // 4. LOW ADJUSTMENT BONUS (up to 15 points) - less adjustment needed = more reliable
    const absAdjustment = Math.abs(comp.totalAdjustment || 0)
    const adjScore = Math.max(0, 15 - absAdjustment * 0.5) // 0% adj = 15pts, 30%+ adj = 0pts
    score += adjScore

    // 5. RECENCY BONUS (up to 10 points)
    if (comp.listing_date) {
      const listingDate = new Date(comp.listing_date)
      const monthsAgo = (Date.now() - listingDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
      score += Math.max(0, 10 - monthsAgo * 2) // 0 months = 10pts, 5+ months = 0pts
    } else {
      score += 5
    }

    // Use similarity_score if provided (override up to 20 bonus points)
    if (comp.similarity_score) {
      score += comp.similarity_score * 20
    }

    return Math.max(5, Math.min(100, score)) // Min score of 5 to avoid zero weights
  }, [valuation])

  // Run the market-rent ENGINE whenever the selection changes. The engine sources its
  // adjustment factors from valuation_adjustment_factors + the live FX rate and returns the
  // weighted indicated rent, range, per-comp adjustments and quality. No rent math runs here.
  const selectedKey = selectedComparables.map(c => `${c.id}:${c.weight ?? ''}`).join(',')
  useEffect(() => {
    if (!valuation?.id || selectedComparables.length === 0) { setEngineResult(null); return }
    let cancelled = false
    const run = async () => {
      setEngineRunning(true)
      try {
        const res = await fetch(`/api/valuations/${valuation.id}/rental-comparables/value`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            comparables: selectedComparables.map(c => ({ id: c.id, weight: c.weight, furnishing: (c as any).furnishing })),
            subject_furnishing: (valuation?.property as any)?.furnishing,
          }),
        })
        if (!res.ok) { if (!cancelled) setEngineResult(null); return }
        const json = await res.json()
        const data = json.data
        if (cancelled) return
        setEngineResult(data)
        // Merge engine per-comp results into the grid (display only — grid computes nothing).
        const PY2GRID: Record<string, string> = { bedrooms: 'bedrooms', bathrooms: 'bathrooms', furnishing: 'furnishing', age: 'age_condition', size: 'gfa' }
        const byId = new Map<string, any>((data?.comparables_analyzed || []).map((a: any) => [String(a.id), a]))
        setSelectedComparables(prev => prev.map(c => {
          const a = byId.get(String(c.id))
          if (!a) return c
          const adjustments: Record<string, number> = {}
          Object.entries(a.adjustments_applied || {}).forEach(([k, v]) => { adjustments[PY2GRID[k] || k] = v as number })
          return { ...c, adjustments, totalAdjustment: a.total_adjustment_percent, adjustedRent: a.adjusted_rent_ghs, adjustedRentPerSqm: a.adjusted_rent_per_sqm, qualityScore: a.quality_score } as any
        }))
      } finally { if (!cancelled) setEngineRunning(false) }
    }
    run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuation?.id, selectedKey, recalcNonce])

  // Indicated rent comes straight from the engine result.
  const calculateIndicatedRent = useMemo(() => {
    if (!engineResult) return null
    return { perSqm: engineResult.rent_per_sqm || 0, monthly: engineResult.indicated_monthly_rent || 0 }
  }, [engineResult])

  // Calculate confidence
  // Confidence comes from the engine (0-1) -> percent.
  const calculateConfidence = useCallback(() => {
    return engineResult ? Math.round((engineResult.confidence_score || 0) * 100) : 0
  }, [engineResult])

  // =====================================================
  // SAVE & NAVIGATION
  // =====================================================

  // Save and navigate. goBack=true persists best-effort then steps to the previous
  // methodology (so selected rental comparables + weighting are never lost on BACK).
  const handleSave = async (goBack = false) => {
    try {
      setSaving(true)
      setError(null)

      const indicatedRent = calculateIndicatedRent
      const confidence = calculateConfidence()

      // Save rental basket to valuation
      const result = await valuationsApi.update(valuationId, {
        rental_market_analysis: {
          comparables: selectedComparables.map(c => ({
            id: c.id,
            address: c.address_street || c.title,
            asking_rent: c.asking_rent_monthly,
            adjusted_rent: c.adjustedRent,
            adjustments: c.adjustments,
            total_adjustment: c.totalAdjustment,
            bedrooms: c.bedrooms,
            gfa_sqm: c.gfa_sqm,
            distance_km: c.distance_km,
            similarity_score: c.similarity_score,
          })),
          indicated_rent_monthly: indicatedRent?.monthly || 0,
          indicated_rent_per_sqm: indicatedRent?.perSqm || 0,
          methodology: weightingMethod,
          confidence,
          comparables_count: selectedComparables.length,
          search_criteria: {
            radius_km: searchRadius,
            max_age_months: maxAge,
            bedrooms_range: bedroomRange,
          },
          analyzed_at: new Date().toISOString(),
        },
        method_results: {
          ...(valuation?.method_results || {}),
          rental_market: {
            indicatedRentMonthly: indicatedRent?.monthly || 0,
            indicatedRentPerSqm: indicatedRent?.perSqm || 0,
            confidence,
            comparablesCount: selectedComparables.length,
            methodology: weightingMethod,
          },
        },
      })

      // Check if save was successful. On forward, a save error blocks navigation;
      // on BACK we persist best-effort and step away regardless so nothing is lost.
      if (result.error && !goBack) {
        console.error('Failed to save rental market analysis:', result.error)
        setError(result.error)
        return
      }

      console.log('Rental market analysis saved successfully:', result.data?.rental_market_analysis)

      // Navigate to the previous/next active methodology (driven by methods_applied).
      const methods = getSelectedMethods(valuation)
      const dest = goBack ? getPrevStep('rental-market', methods) : getNextStep('rental-market', methods)
      router.push(stepPath(valuationId, dest))
    } catch (err) {
      console.error('Exception saving rental market analysis:', err)
      // On BACK, never block navigation on a save failure.
      if (goBack) {
        const methods = getSelectedMethods(valuation)
        router.push(stepPath(valuationId, getPrevStep('rental-market', methods)))
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // =====================================================
  // DERIVED DATA
  // =====================================================

  const property = valuation?.property as any
  const aggregates = searchResponse?.meta?.aggregates
  const comparablesCount = selectedComparables.length

  // =====================================================
  // RENDER
  // =====================================================

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        <span className="ml-3 font-mono text-sm text-muted-foreground">Loading rental market data...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="p-2 hover:bg-muted transition-colors disabled:opacity-50"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">VALUATION:</span>
              <span className="font-mono text-sm text-amber-500">{valuationId.slice(0, 8).toUpperCase()}</span>
              <MethodBadge method="Rental Analysis" />
            </div>
            <h1 className="text-xl font-mono text-foreground mt-1">
              RENTAL MARKET ANALYSIS
            </h1>
            <p className="font-mono text-xs text-muted-foreground mt-0.5">
              Select rental comparables to estimate market rent for Income Approach
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => handleSave(false)}
            disabled={saving || selectedComparables.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-foreground font-mono text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                SAVING...
              </>
            ) : (
              <>
                SAVE & CONTINUE TO {getNextStep('rental-market', getSelectedMethods(valuation)).label}
                <ArrowRight className="w-3 h-3" />
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <AlertBanner type="error" title="Error" message={error} />
        </div>
      )}

      {/* Subject Property Reference - At Top */}
      <TerminalPanel title="SUBJECT PROPERTY REFERENCE">
        <div className="grid grid-cols-6 gap-4">
          <div className="col-span-2">
            <div className="font-mono text-[10px] text-muted-foreground">ADDRESS</div>
            <div className="font-mono text-sm text-foreground">{property?.address_street || property?.address || '—'}</div>
          </div>
          <div>
            <div className="font-mono text-[10px] text-muted-foreground">TYPE</div>
            <PropertyTypeBadge type={property?.property_type || 'residential'} />
          </div>
          <div>
            <div className="font-mono text-[10px] text-muted-foreground">SIZE</div>
            <div className="font-mono text-sm text-foreground">{property?.gfa_sqm || property?.built_area_sqm || property?.plot_size || '—'} sqm</div>
            <FloorPlanAreasBadge valuationId={valuationId} basis="net" />
          </div>
          <div>
            <div className="font-mono text-[10px] text-muted-foreground">BEDROOMS</div>
            <div className="font-mono text-sm text-foreground">{property?.bedrooms || '—'}</div>
          </div>
          <div>
            <div className="font-mono text-[10px] text-muted-foreground">BATHROOMS</div>
            <div className="font-mono text-sm text-foreground">{property?.bathrooms || '—'}</div>
          </div>
        </div>
      </TerminalPanel>

      {/* Main Grid */}
      <div className="grid grid-cols-12 gap-4 mt-4">
        {/* Left Column - Market Stats, Search & Results */}
        <div className="col-span-5 space-y-4">
          {/* Market Stats */}
          {aggregates && (
            <TerminalPanel title="MARKET STATISTICS">
              <div className="grid grid-cols-3 gap-2">
                <StatCard
                  label="Average Rent"
                  value={formatCurrency(aggregates.avgRentMonthly)}
                  subtext="Monthly"
                />
                <StatCard
                  label="Median Rent"
                  value={formatCurrency(aggregates.medianRentMonthly)}
                  subtext="Monthly"
                />
                <StatCard
                  label="Rent Range"
                  value={`${formatCurrency(aggregates.minRent)} - ${formatCurrency(aggregates.maxRent)}`}
                  subtext="Min - Max"
                />
              </div>
              {aggregates.suggestedRentForSubject && (
                <div className="mt-3 p-2 border border-amber-500/30 bg-amber-100 dark:bg-amber-900/10">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400">SUGGESTED FOR SUBJECT</span>
                    <span className="font-mono text-lg text-amber-600 dark:text-amber-400">{formatCurrency(aggregates.suggestedRentForSubject)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <ConfidenceBadge confidence={aggregates.confidence || 0} />
                    <span className="font-mono text-[10px] text-muted-foreground">Based on {searchResults.length + selectedComparables.length} listings</span>
                  </div>
                </div>
              )}
            </TerminalPanel>
          )}

          {/* Search Panel */}
          <TerminalPanel title="RENTAL COMPARABLE SEARCH">
            <div className="space-y-4">
              {/* Search Filters */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-mono text-[10px] text-muted-foreground mb-1">RADIUS (KM)</label>
                  <input
                    type="number"
                    value={searchRadius}
                    onChange={(e) => setSearchRadius(Number(e.target.value))}
                    className="w-full px-2 py-1.5 bg-card border border-border text-foreground font-mono text-sm focus:border-amber-500 outline-none"
                    min={1}
                    max={20}
                  />
                </div>
                <div>
                  <label className="block font-mono text-[10px] text-muted-foreground mb-1">MAX AGE (MONTHS)</label>
                  <input
                    type="number"
                    value={maxAge}
                    onChange={(e) => setMaxAge(Number(e.target.value))}
                    className="w-full px-2 py-1.5 bg-card border border-border text-foreground font-mono text-sm focus:border-amber-500 outline-none"
                    min={1}
                    max={24}
                  />
                </div>
                <div>
                  <label className="block font-mono text-[10px] text-muted-foreground mb-1">BEDROOMS</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={bedroomRange.min}
                      onChange={(e) => setBedroomRange({ ...bedroomRange, min: Number(e.target.value) })}
                      className="w-12 px-1 py-1.5 bg-card border border-border text-foreground font-mono text-sm focus:border-amber-500 outline-none text-center"
                      min={0}
                      max={10}
                    />
                    <span className="text-muted-foreground">-</span>
                    <input
                      type="number"
                      value={bedroomRange.max}
                      onChange={(e) => setBedroomRange({ ...bedroomRange, max: Number(e.target.value) })}
                      className="w-12 px-1 py-1.5 bg-card border border-border text-foreground font-mono text-sm focus:border-amber-500 outline-none text-center"
                      min={0}
                      max={10}
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={handleSearch}
                disabled={searching}
                className="w-full flex items-center justify-center gap-2 py-2 bg-muted text-foreground font-mono text-xs hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                {searching ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    SEARCHING...
                  </>
                ) : (
                  <>
                    <Search className="w-3 h-3" />
                    SEARCH RENTALS
                  </>
                )}
              </button>
            </div>
          </TerminalPanel>

          {/* Benchmark Fallback */}
          {benchmark && searchResults.length < 5 && (
            <TerminalPanel title="AREA BENCHMARK (FALLBACK)">
              <div className="p-2 border border-blue-500/30 bg-blue-100 dark:bg-blue-900/10">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="font-mono text-xs text-blue-600 dark:text-blue-400">{benchmark.areaName}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="font-mono text-[10px] text-muted-foreground">AVG RENT:</span>
                    <span className="font-mono text-foreground ml-2">{formatCurrency(benchmark.avgRentMonthly)}</span>
                  </div>
                  <div>
                    <span className="font-mono text-[10px] text-muted-foreground">LISTINGS:</span>
                    <span className="font-mono text-foreground ml-2">{benchmark.listingCount}</span>
                  </div>
                </div>
              </div>
            </TerminalPanel>
          )}

          {/* Search Results */}
          <TerminalPanel title={`AVAILABLE RENTALS (${searchResults.length})`}>
            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {searchResults.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground font-mono text-sm">
                  {searching ? 'Searching...' : 'No rental listings found. Try expanding search radius.'}
                </div>
              ) : (
                searchResults.map(comp => (
                  <div
                    key={comp.id}
                    className="p-3 border border-border bg-card/50 hover:border-zinc-600 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-mono text-sm text-foreground">{comp.title || comp.address_street}</div>
                        <div className="flex items-center gap-3 mt-1 font-mono text-[10px] text-muted-foreground">
                          {comp.neighborhood && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {comp.neighborhood}
                            </span>
                          )}
                          {comp.bedrooms && (
                            <span className="flex items-center gap-1">
                              <Bed className="w-3 h-3" />
                              {comp.bedrooms} bed
                            </span>
                          )}
                          {comp.gfa_sqm && (
                            <span className="flex items-center gap-1">
                              <Ruler className="w-3 h-3" />
                              {comp.gfa_sqm}m²
                            </span>
                          )}
                          {comp.distance_km !== undefined && (
                            <span>{comp.distance_km.toFixed(1)}km</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="font-mono text-sm text-amber-600 dark:text-amber-400">{formatCurrency(comp.asking_rent_monthly)}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">/month</div>
                        </div>
                        <button
                          onClick={() => addComparable(comp)}
                          className="p-1.5 bg-green-100 dark:bg-green-900/50 border border-green-800 text-green-600 dark:text-green-400 hover:bg-green-800/50 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TerminalPanel>
        </div>

        {/* Right Column - Rent Reconciliation & Selected Comparables */}
        <div className="col-span-7 space-y-4">
          {/* Rent Reconciliation */}
          {comparablesCount > 0 && (
            <TerminalPanel title="RENT RECONCILIATION">
              <div className="space-y-4">
                {/* Weighting Method */}
                <div>
                  <label className="block font-mono text-[10px] text-muted-foreground mb-2">WEIGHTING METHOD</label>
                  <div className="flex items-center gap-2">
                    {(['quality_weighted', 'simple_average', 'median'] as WeightingMethod[]).map(method => (
                      <button
                        key={method}
                        onClick={() => setWeightingMethod(method)}
                        className={cn(
                          'px-3 py-1.5 font-mono text-[10px] border transition-colors',
                          weightingMethod === method
                            ? 'border-amber-500 bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                            : 'border-border text-muted-foreground hover:border-zinc-500'
                        )}
                      >
                        {method.replace('_', ' ').toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quality Weights Display (when quality_weighted selected) */}
                {weightingMethod === 'quality_weighted' && (
                  <div className="p-2 border border-blue-800/50 bg-blue-100 dark:bg-blue-900/10">
                    <div className="font-mono text-[10px] text-blue-600 dark:text-blue-400 mb-2">QUALITY WEIGHTS</div>
                    <div className="flex flex-wrap gap-3">
                      {selectedComparables.map((comp, idx) => {
                        const score = calculateQualityScore(comp)
                        const totalScore = selectedComparables.reduce((sum, c) => sum + calculateQualityScore(c), 0)
                        const weight = totalScore > 0 ? (score / totalScore * 100).toFixed(1) : '0'
                        return (
                          <div key={comp.id} className="flex items-center gap-2 text-xs">
                            <span className="font-mono text-muted-foreground">Comp {idx + 1}:</span>
                            <span className="font-mono text-muted-foreground">Score {score.toFixed(0)}</span>
                            <span className="font-mono text-amber-600 dark:text-amber-400 font-bold">{weight}%</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Indicated Value */}
                <div className="grid grid-cols-4 gap-3">
                  <StatCard
                    label="Indicated Monthly Rent"
                    value={formatCurrency(calculateIndicatedRent?.monthly)}
                    highlight
                  />
                  <StatCard
                    label="Rent Per Sqm"
                    value={`₵${calculateIndicatedRent?.perSqm?.toFixed(2) || '0'}`}
                    unit="/sqm/mo"
                  />
                  <div className="p-3 border border-border bg-card/50">
                    <div className="font-mono text-[10px] text-muted-foreground uppercase mb-1">Confidence</div>
                    <ConfidenceBadge confidence={calculateConfidence()} />
                    <div className="font-mono text-[10px] text-muted-foreground mt-1">
                      Based on {comparablesCount} comp{comparablesCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="p-3 border border-border bg-card/50">
                    <div className="font-mono text-[10px] text-muted-foreground uppercase mb-1">Range</div>
                    <div className="font-mono text-sm text-foreground">
                      {engineResult?.value_range
                        ? `${formatCurrency(engineResult.value_range.low)} - ${formatCurrency(engineResult.value_range.high)}`
                        : '—'}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground mt-1">
                      Avg Adj: {(selectedComparables.reduce((sum, c) => sum + Math.abs(c.totalAdjustment), 0) / comparablesCount).toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            </TerminalPanel>
          )}

          {/* Selected Comparables */}
          <TerminalPanel
            title={`SELECTED RENTAL COMPARABLES (${comparablesCount})`}
            action={
              comparablesCount > 0 && (
                <button
                  onClick={handleAutoCalculateAll}
                  className="flex items-center gap-1 px-2 py-1 bg-muted text-muted-foreground font-mono text-[10px] hover:bg-zinc-700"
                >
                  <Calculator className="w-3 h-3" />
                  AUTO-CALCULATE ALL
                </button>
              )
            }
          >
            {comparablesCount === 0 ? (
              <div className="text-center py-8 text-muted-foreground font-mono text-sm">
                Select rental comparables from the search results to begin analysis
              </div>
            ) : (
              <div className="space-y-3">
                {selectedComparables.map((comp, idx) => (
                  <div
                    key={comp.id}
                    className={cn(
                      'p-3 border transition-colors',
                      comp.isLocked ? 'border-blue-800 bg-blue-100 dark:bg-blue-900/10' : 'border-border bg-card/50'
                    )}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-muted-foreground">COMP {idx + 1}</span>
                          {comp.isLocked && (
                            <span className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-mono text-[8px]">LOCKED</span>
                          )}
                        </div>
                        <div className="font-mono text-sm text-foreground mt-1">{comp.title || comp.address_street}</div>
                        <div className="flex items-center gap-3 mt-1 font-mono text-[10px] text-muted-foreground">
                          {comp.bedrooms && <span>{comp.bedrooms} bed</span>}
                          {comp.bathrooms && <span>{comp.bathrooms} bath</span>}
                          {comp.gfa_sqm && <span>{comp.gfa_sqm}m²</span>}
                          {comp.distance_km && <span>{comp.distance_km.toFixed(1)}km</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleLockToggle(comp.id)}
                          className={cn(
                            'p-1 transition-colors',
                            comp.isLocked ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {comp.isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleAutoCalculate(comp.id)}
                          disabled={comp.isLocked}
                          className="p-1 text-muted-foreground hover:text-amber-400 transition-colors disabled:opacity-50"
                        >
                          <Calculator className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => removeComparable(comp.id)}
                          className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Adjustment Summary */}
                    <div className="grid grid-cols-4 gap-3 text-sm">
                      <div>
                        <div className="font-mono text-[10px] text-muted-foreground">ASKING</div>
                        <div className="font-mono text-foreground">{formatCurrency(comp.asking_rent_monthly)}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted-foreground">ADJUSTMENT</div>
                        <div className={cn(
                          'font-mono',
                          comp.totalAdjustment > 0 ? 'text-green-600 dark:text-green-400' : comp.totalAdjustment < 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'
                        )}>
                          {comp.totalAdjustment > 0 ? '+' : ''}{(comp.totalAdjustment || 0).toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted-foreground">ADJUSTED</div>
                        <div className="font-mono text-amber-600 dark:text-amber-400">{formatCurrency(comp.adjustedRent)}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted-foreground">₵/SQM/MO</div>
                        <div className="font-mono text-foreground">{Number.isFinite(Number(comp.adjustedRentPerSqm)) && Number(comp.adjustedRentPerSqm) > 0 ? Number(comp.adjustedRentPerSqm).toFixed(1) : '-'}</div>
                      </div>
                    </div>

                    {/* Individual Adjustments */}
                    {Object.keys(comp.adjustments).length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border">
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(comp.adjustments).map(([key, value]) => (
                            <span
                              key={key}
                              className={cn(
                                'px-2 py-0.5 font-mono text-[10px] border',
                                value > 0 ? 'border-green-800 text-green-600 dark:text-green-400' : value < 0 ? 'border-red-800 text-red-600 dark:text-red-400' : 'border-border text-muted-foreground'
                              )}
                            >
                              {key}: {value > 0 ? '+' : ''}{value.toFixed(1)}%
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TerminalPanel>

        </div>
      </div>

      {/* Fixed Footer Navigation */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 border border-border text-muted-foreground hover:bg-card font-mono text-sm transition-colors disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4" />
            BACK TO {getPrevStep('rental-market', getSelectedMethods(valuation)).label}
          </button>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-sm font-mono">
              <span className="text-muted-foreground">
                {comparablesCount} comparable{comparablesCount !== 1 ? 's' : ''} selected
              </span>
              {calculateIndicatedRent && (
                <span className="text-amber-600 dark:text-amber-400">
                  Indicated Rent: {formatCurrency(calculateIndicatedRent.monthly)}/mo
                </span>
              )}
            </div>

            <button
              onClick={() => handleSave(false)}
              disabled={saving || comparablesCount === 0}
              className={cn(
                'flex items-center gap-2 px-6 py-2 font-mono text-sm transition-colors',
                comparablesCount > 0
                  ? 'bg-amber-600 hover:bg-amber-700 text-foreground'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              )}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  SAVING...
                </>
              ) : (
                <>
                  SAVE & CONTINUE TO {getNextStep('rental-market', getSelectedMethods(valuation)).label}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Spacer for fixed footer */}
      <div className="h-24" />
    </div>
  )
}
