'use client'

/**
 * Sales Comparison Approach / Market Data Page
 * 
 * Enhanced RICS-compliant comparable analysis workflow with:
 * - Market Context Panel (economic indicators, market conditions)
 * - Comprehensive Comparable Search & Selection
 * - Full Adjustment Grid with all RICS factors
 * - Value Reconciliation with weighting options
 * - Contribution workflow for data gaps
 */

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  TerminalPanel,
  StatusBadge,
  AlertBanner,
  MethodBadge,
  Currency,
  ConfidenceBar,
  PropertyTypeBadge,
} from '@/components/ui/terminal'
import { valuationsApi, comparablesApi, marketApi } from '@/lib/valuation-api'
import type { Valuation, ComparableProperty, ComparableBasket } from '@/types/valuation'
import {
  ArrowLeft,
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
  Gift,
  Calculator,
  BarChart3,
  Settings2,
  Eye,
  Scale,
  Lock,
  Unlock,
  Info,
  RefreshCw,
} from 'lucide-react'

// Import new components
import { 
  MarketContextPanel,
  ComparableDetailCard,
  AdjustmentGrid,
  EditableConstructionCostPanel,
  LaborCostsPanel,
  GapAnalysisAlert, 
  ContributionDialog, 
  type GapAnalysis, 
  type ContributionPrompt,
  type ComparableWithAdjustments,
  type SubjectProperty,
  type ConstructionCostEditableData,
  type MarketContextData,
} from '@/components/valuation'

// =====================================================
// TYPES
// =====================================================

type ViewMode = 'cards' | 'grid' | 'compact'
type WeightingMethod = 'quality_weighted' | 'simple_average' | 'median' | 'manual'

// =====================================================
// MAIN COMPONENT
// =====================================================

export default function MarketDataPage() {
  const params = useParams()
  const router = useRouter()
  const valuationId = params.id as string

  // Core state
  const [valuation, setValuation] = useState<Valuation | null>(null)
  const [basket, setBasket] = useState<ComparableBasket | null>(null)
  const [searchResults, setSearchResults] = useState<ComparableProperty[]>([])
  const [selectedComparables, setSelectedComparables] = useState<ComparableWithAdjustments[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Market context
  const [marketContext, setMarketContext] = useState<MarketContextData | null>(null)
  
  // View options
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [weightingMethod, setWeightingMethod] = useState<WeightingMethod>('quality_weighted')
  const [showWeights, setShowWeights] = useState(false)

  // Search filters
  const [searchRadius, setSearchRadius] = useState(3) // km
  const [priceRange, setPriceRange] = useState({ min: 0, max: 10000000 })
  const [sizeRange, setSizeRange] = useState({ min: 0, max: 2000 })
  const [maxAge, setMaxAge] = useState(12) // months
  const [showFilters, setShowFilters] = useState(false)
  
  // Contribution workflow state
  const [gapAnalysis, setGapAnalysis] = useState<GapAnalysis | null>(null)
  const [showContributionDialog, setShowContributionDialog] = useState(false)
  const [contributionPrompt, setContributionPrompt] = useState<ContributionPrompt | null>(null)
  
  // Construction cost state (for Cost Approach reference)
  const [constructionCosts, setConstructionCosts] = useState<ConstructionCostEditableData | null>(null)

  // =====================================================
  // DATA FETCHING
  // =====================================================

  // Fetch valuation and existing basket
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        setError(null)

        const [valuationRes, basketRes] = await Promise.all([
          valuationsApi.getById(valuationId),
          comparablesApi.getBasket(valuationId),
        ])

        if (valuationRes.error) throw new Error(valuationRes.error)
        if (!valuationRes.data) throw new Error('Valuation not found')

        setValuation(valuationRes.data as unknown as Valuation)

        if (basketRes.data) {
          setBasket(basketRes.data as unknown as ComparableBasket)
          // Load existing comparables with adjustments
          if ((basketRes.data as any).comparables) {
            setSelectedComparables(
              (basketRes.data as any).comparables.map((comp: any) => ({
                ...comp,
                adjustments: comp.adjustments || {},
                totalAdjustment: comp.total_adjustment || 0,
                adjustedPrice: comp.adjusted_value || comp.sale_price,
                adjustedPricePerSqm: comp.adjusted_price_per_sqm || (comp.sale_price / (comp.gfa || 1)),
                weight: comp.weight || 0.25,
              }))
            )
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [valuationId])

  // =====================================================
  // SEARCH & SELECTION
  // =====================================================

  // Search for comparables
  const handleSearch = async () => {
    if (!valuation?.property) return

    try {
      setSearching(true)
      setError(null)

      const searchRes = await comparablesApi.search(valuationId, {
        latitude: valuation.property?.latitude,
        longitude: valuation.property?.longitude,
        radiusKm: searchRadius,
        propertyType: valuation.property?.property_type,
        priceMin: priceRange.min,
        priceMax: priceRange.max,
        sizeMin: sizeRange.min,
        sizeMax: sizeRange.max,
        maxAgeMonths: maxAge,
        excludeIds: selectedComparables.map(c => c.id),
      })

      if (searchRes.data) {
        setSearchResults(searchRes.data)
        
        // Check for gap analysis from response metadata
        const meta = (searchRes as any).meta
        if (meta?.hasGap && meta?.gapAnalysis) {
          const gap: GapAnalysis = {
            hasGap: true,
            gapSeverity: meta.gapSeverity || 'moderate',
            gapReasons: [{
              code: 'INSUFFICIENT_COMPARABLES',
              description: meta.gapAnalysis.message || 'Insufficient comparable data',
              impact: (meta.gapAnalysis.required - meta.gapAnalysis.found) * 30,
              suggestedAction: 'Contribute property data to improve valuation accuracy',
            }],
            requiredComparables: meta.gapAnalysis.required || 3,
            availableComparables: meta.gapAnalysis.found || 0,
            missingDataPoints: [],
            contributionPrompt: meta.gapAnalysis.contributionPrompt ? {
              ...meta.gapAnalysis.contributionPrompt,
              id: `prompt_${Date.now()}`,
              requiredFields: [
                { name: 'address', label: 'Property Address', type: 'text' as const, validation: { required: true } },
                { name: 'transaction_date', label: 'Transaction Date', type: 'date' as const, validation: { required: true } },
                { name: 'transaction_price', label: 'Transaction Price (GHS)', type: 'number' as const, validation: { required: true, min: 0 } },
                { name: 'property_type', label: 'Property Type', type: 'select' as const, options: ['house', 'apartment', 'townhouse', 'villa', 'land'] },
                { name: 'built_area_sqm', label: 'Built Area (sqm)', type: 'number' as const, validation: { required: true, min: 0 } },
              ],
              optionalFields: [
                { name: 'bedrooms', label: 'Bedrooms', type: 'number' as const, bonusCredits: 5 },
                { name: 'bathrooms', label: 'Bathrooms', type: 'number' as const, bonusCredits: 5 },
                { name: 'year_built', label: 'Year Built', type: 'number' as const, bonusCredits: 10 },
                { name: 'condition', label: 'Condition', type: 'select' as const, options: ['excellent', 'good', 'fair', 'poor'], bonusCredits: 10 },
                { name: 'quality_rating', label: 'Quality Rating', type: 'select' as const, options: ['luxury', 'high', 'standard', 'basic'], bonusCredits: 10 },
                { name: 'floor_number', label: 'Floor Number', type: 'number' as const, bonusCredits: 5 },
                { name: 'view_quality', label: 'View Quality', type: 'select' as const, options: ['panoramic', 'ocean', 'city', 'garden', 'standard', 'limited'], bonusCredits: 5 },
                { name: 'parking_spaces', label: 'Parking Spaces', type: 'number' as const, bonusCredits: 5 },
              ],
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            } : null,
            confidenceImpact: (meta.gapAnalysis.required - meta.gapAnalysis.found) * 15,
          }
          setGapAnalysis(gap)
          if (gap.contributionPrompt) {
            setContributionPrompt(gap.contributionPrompt)
          }
        } else {
          setGapAnalysis(null)
          setContributionPrompt(null)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  // Add comparable to basket with default adjustments
  const addComparable = useCallback((comp: ComparableProperty) => {
    const adjusted: ComparableWithAdjustments = {
      ...comp,
      sale_price: comp.sale_price || 0, // Ensure sale_price is always a number
      sale_date: comp.sale_date || new Date().toISOString(), // Ensure sale_date is always a string
      gfa: comp.gfa || 0, // Ensure gfa is always a number
      adjustments: {},
      totalAdjustment: 0,
      adjustedPrice: comp.sale_price || 0,
      adjustedPricePerSqm: (comp.sale_price || 0) / (comp.gfa || 1),
      weight: 1 / (selectedComparables.length + 1),
      isLocked: false,
    }
    
    // Recalculate weights
    const newComps = [...selectedComparables, adjusted].map(c => ({
      ...c,
      weight: 1 / (selectedComparables.length + 1),
    }))
    
    setSelectedComparables(newComps)
    setSearchResults(searchResults.filter(c => c.id !== comp.id))
  }, [selectedComparables, searchResults])

  // Remove comparable from basket
  const removeComparable = useCallback((compId: string) => {
    const comp = selectedComparables.find(c => c.id === compId)
    if (comp) {
      const remaining = selectedComparables.filter(c => c.id !== compId)
      // Recalculate weights
      const newComps = remaining.map(c => ({
        ...c,
        weight: remaining.length > 0 ? 1 / remaining.length : 0,
      }))
      
      setSearchResults([...searchResults, comp as any])
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
        const adjustedPrice = (comp.sale_price || 0) * (1 + totalAdjustment / 100)
        const adjustedPricePerSqm = adjustedPrice / (comp.gfa || 1)

        return {
          ...comp,
          adjustments: newAdjustments,
          totalAdjustment,
          adjustedPrice,
          adjustedPricePerSqm,
        }
      })
    )
  }, [])

  // Update weight for a comparable
  const handleWeightChange = useCallback((compId: string, weight: number) => {
    setSelectedComparables(prev =>
      prev.map(comp => comp.id === compId ? { ...comp, weight } : comp)
    )
    // Switch to manual weighting if user changes weights
    if (weightingMethod !== 'manual') {
      setWeightingMethod('manual')
    }
  }, [weightingMethod])

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
      prev.map(comp => {
        if (comp.id !== compId || comp.isLocked) return comp
        
        // Auto-calculate adjustments based on subject vs comparable
        const subject = valuation.property as any
        const autoAdjustments: Record<string, number> = {}
        
        // Size adjustment (max ±25%)
        if (subject.gfa && comp.gfa) {
          const sizeDiff = (subject.gfa - comp.gfa) / comp.gfa * 100
          autoAdjustments.gfa = Math.max(-25, Math.min(25, sizeDiff))
        }
        
        // Age adjustment (0.5% per year)
        const subjectAge = subject.age || (subject.year_built ? new Date().getFullYear() - subject.year_built : 0)
        const compAge = comp.age || (comp.year_built ? new Date().getFullYear() - comp.year_built : 0)
        if (subjectAge && compAge) {
          autoAdjustments.age = (compAge - subjectAge) * 0.5
        }
        
        // Time adjustment (0.5% per month based on market appreciation)
        const saleDate = new Date(comp.sale_date)
        const now = new Date()
        const months = (now.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
        const annualAppreciation = marketContext?.market?.price_index_change_yoy || 6
        autoAdjustments.time = Math.min(15, months * (annualAppreciation / 12))
        
        // Bedroom adjustment (2.5% per bedroom)
        if (subject.bedrooms && comp.bedrooms) {
          autoAdjustments.bedrooms = (subject.bedrooms - comp.bedrooms) * 2.5
        }
        
        // Bathroom adjustment (2% per bathroom)
        if (subject.bathrooms && comp.bathrooms) {
          autoAdjustments.bathrooms = (subject.bathrooms - comp.bathrooms) * 2
        }
        
        // Condition adjustment (5% per level)
        const conditionLevels: Record<string, number> = { excellent: 4, good: 3, fair: 2, poor: 1 }
        const subjectCondition = conditionLevels[subject.condition || 'good'] || 3
        const compCondition = conditionLevels[comp.condition || 'good'] || 3
        autoAdjustments.condition = (subjectCondition - compCondition) * 5
        
        // Quality adjustment (5% per level)
        const qualityLevels: Record<string, number> = { luxury: 5, high: 4, standard: 3, basic: 2, substandard: 1 }
        const subjectQuality = qualityLevels[subject.quality_rating || 'standard'] || 3
        const compQuality = qualityLevels[comp.quality_rating || 'standard'] || 3
        autoAdjustments.quality = (subjectQuality - compQuality) * 5
        
        // Floor level adjustment (2% per floor)
        if (subject.floor_number && comp.floor_number) {
          autoAdjustments.floor_level = (subject.floor_number - comp.floor_number) * 2
        }
        
        // Parking adjustment (0.5% per space)
        if (subject.parking_spaces !== undefined && comp.parking_spaces !== undefined) {
          autoAdjustments.parking = ((subject.parking_spaces || 0) - (comp.parking_spaces || 0)) * 0.5
        }
        
        const totalAdjustment = Object.values(autoAdjustments).reduce((sum, v) => sum + (v || 0), 0)
        const adjustedPrice = (comp.sale_price || 0) * (1 + totalAdjustment / 100)
        const adjustedPricePerSqm = adjustedPrice / (comp.gfa || 1)
        
        return {
          ...comp,
          adjustments: autoAdjustments,
          totalAdjustment,
          adjustedPrice,
          adjustedPricePerSqm,
        }
      })
    )
  }, [valuation, marketContext])

  // =====================================================
  // VALUE CALCULATIONS
  // =====================================================

  // Calculate quality scores for weighting
  const calculateQualityScore = useCallback((comp: ComparableWithAdjustments): number => {
    let score = 50 // Base score
    
    // Similarity bonus (up to 20 points)
    if ((comp as any).similarity_score) {
      score += (comp as any).similarity_score * 20
    }
    
    // Recency bonus (up to 15 points)
    const saleDate = new Date(comp.sale_date)
    const monthsAgo = (Date.now() - saleDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
    score += Math.max(0, 15 - monthsAgo)
    
    // Low adjustment penalty
    const absAdjustment = Math.abs(comp.totalAdjustment || 0)
    score -= absAdjustment * 0.5
    
    // Distance penalty (if available)
    if ((comp as any).distance_km) {
      score -= (comp as any).distance_km * 2
    }
    
    return Math.max(0, Math.min(100, score))
  }, [])

  // Calculate indicated value based on weighting method
  const calculateIndicatedValue = useMemo(() => {
    if (selectedComparables.length === 0) return null

    const subjectGFA = (valuation?.property as any)?.gfa || (valuation?.property as any)?.plot_size || 200

    switch (weightingMethod) {
      case 'simple_average': {
        const avgPricePerSqm = selectedComparables.reduce((sum, c) => 
          sum + (c.adjustedPricePerSqm || 0), 0) / selectedComparables.length
        return avgPricePerSqm * subjectGFA
      }
      
      case 'median': {
        const sortedPrices = selectedComparables
          .map(c => c.adjustedPricePerSqm || 0)
          .sort((a, b) => a - b)
        const mid = Math.floor(sortedPrices.length / 2)
        const medianPrice = sortedPrices.length % 2 === 0
          ? (sortedPrices[mid - 1] + sortedPrices[mid]) / 2
          : sortedPrices[mid]
        return medianPrice * subjectGFA
      }
      
      case 'quality_weighted': {
        const qualityScores = selectedComparables.map(c => calculateQualityScore(c))
        const totalScore = qualityScores.reduce((sum, s) => sum + s, 0)
        
        let weightedSum = 0
        selectedComparables.forEach((comp, i) => {
          const weight = totalScore > 0 ? qualityScores[i] / totalScore : 1 / selectedComparables.length
          weightedSum += (comp.adjustedPricePerSqm || 0) * weight
        })
        return weightedSum * subjectGFA
      }
      
      case 'manual': {
        const totalWeight = selectedComparables.reduce((sum, c) => sum + (c.weight || 0), 0)
        let weightedSum = 0
        selectedComparables.forEach(comp => {
          const weight = totalWeight > 0 ? (comp.weight || 0) / totalWeight : 1 / selectedComparables.length
          weightedSum += (comp.adjustedPricePerSqm || 0) * weight
        })
        return weightedSum * subjectGFA
      }
      
      default:
        return null
    }
  }, [selectedComparables, weightingMethod, valuation, calculateQualityScore])

  // Calculate confidence based on number and quality of comparables
  const calculateConfidence = useCallback(() => {
    const count = selectedComparables.length
    const avgAdjustment = selectedComparables.reduce(
      (sum, c) => sum + Math.abs(c.totalAdjustment || 0), 0
    ) / (count || 1)

    // Base confidence on count (max at 5+ comps)
    const countScore = Math.min(count / 5, 1) * 0.4

    // Reduce confidence for high adjustments
    const adjustmentScore = Math.max(0, 1 - avgAdjustment / 30) * 0.3
    
    // Bonus for quality scores
    const avgQuality = selectedComparables.reduce(
      (sum, c) => sum + calculateQualityScore(c), 0
    ) / (count || 1)
    const qualityScore = (avgQuality / 100) * 0.3

    return countScore + adjustmentScore + qualityScore
  }, [selectedComparables, calculateQualityScore])

  // Value range calculation
  const valueRange = useMemo(() => {
    if (selectedComparables.length === 0) return null
    
    const adjustedPrices = selectedComparables.map(c => c.adjustedPrice || 0)
    return {
      min: Math.min(...adjustedPrices),
      max: Math.max(...adjustedPrices),
    }
  }, [selectedComparables])

  // =====================================================
  // SAVE & NAVIGATION
  // =====================================================

  // Handle contribution submission
  const handleContributionSubmit = async (data: Record<string, unknown>) => {
    try {
      const response = await fetch('/api/v1/contributions/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptId: contributionPrompt?.id,
          data,
          sourceType: 'personal_knowledge',
          attestation: true,
          valuationId,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to submit contribution')
      }

      setShowContributionDialog(false)
      setGapAnalysis(null)
      await handleSearch()
    } catch (err) {
      throw err
    }
  }

  // Save basket and continue
  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)

      await comparablesApi.saveBasket(valuationId, {
        comparables: selectedComparables,
        indicatedValue: calculateIndicatedValue,
        avgPricePerSqm:
          selectedComparables.reduce((sum, c) => sum + (c.adjustedPricePerSqm || 0), 0) /
          (selectedComparables.length || 1),
      })

      // Update valuation method result
      await valuationsApi.update(valuationId, {
        method_results: {
          ...(valuation?.method_results || {}),
          sales_comparison: {
            value: calculateIndicatedValue || 0,
            confidence: calculateConfidence(),
            comparablesCount: selectedComparables.length,
            avgAdjustment:
              selectedComparables.reduce((sum, c) => sum + Math.abs(c.totalAdjustment || 0), 0) /
              (selectedComparables.length || 1),
            weightingMethod,
            valueRange,
          },
        },
        current_step: 4,
      })

      // Navigate to next step based on selected methods
      // Check if cost_approach or income_approach are selected
      const selectedMethods = (valuation as any)?.selectedMethods || valuation?.methods_applied || []
      const hasCostApproach = selectedMethods.includes('cost_approach')
      const hasIncomeApproach = selectedMethods.includes('income_approach')
      
      if (hasCostApproach) {
        router.push(`/dashboard/valuations/${valuationId}/cost`)
      } else if (hasIncomeApproach) {
        router.push(`/dashboard/valuations/${valuationId}/income`)
      } else {
        // Only sales comparison selected - go directly to reconciliation
        router.push(`/dashboard/valuations/${valuationId}/reconciliation`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // =====================================================
  // DERIVED DATA
  // =====================================================

  // Subject property for adjustment grid
  const subjectProperty: SubjectProperty = useMemo(() => {
    const prop = valuation?.property as any
    return {
      id: prop?.id,
      address: prop?.address_street || prop?.full_address,
      gfa: prop?.gfa || prop?.total_area_sqm || prop?.plot_size,
      plot_size: prop?.plot_size,
      bedrooms: prop?.bedrooms,
      bathrooms: prop?.bathrooms,
      age: prop?.age || (prop?.year_built ? new Date().getFullYear() - prop.year_built : undefined),
      year_built: prop?.year_built,
      condition: prop?.condition,
      quality_rating: prop?.quality_rating,
      floor_number: prop?.floor_number,
      neighborhood_rating: prop?.neighborhood_rating,
      view_quality: prop?.view_quality,
      accessibility_rating: prop?.accessibility_rating,
      tenure_type: prop?.tenure_type,
      parking_spaces: prop?.parking_spaces,
      has_pool: prop?.has_pool,
      has_garden: prop?.has_garden,
      has_security: prop?.has_security,
    }
  }, [valuation])

  // Region for market context
  const region = useMemo(() => {
    const prop = valuation?.property as any
    return prop?.region || prop?.address_region || 'greater_accra'
  }, [valuation])

  // =====================================================
  // RENDER
  // =====================================================

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        <span className="ml-3 font-mono text-sm text-zinc-400">Loading sales comparison data...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/valuations/${valuationId}/comparables`}
            className="p-2 hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-zinc-400" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-zinc-500">VALUATION:</span>
              <span className="font-mono text-sm text-amber-500">{valuationId.slice(0, 8).toUpperCase()}</span>
              <MethodBadge method="Sales Comparison" />
            </div>
            <h1 className="text-xl font-mono text-white mt-1">
              MARKET ANALYSIS
            </h1>
            <p className="font-mono text-xs text-zinc-500 mt-0.5">
              Step 5: Apply adjustments and calculate indicated value
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex items-center gap-1 bg-zinc-800 p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-2 py-1 font-mono text-[10px] ${viewMode === 'grid' ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-white'}`}
            >
              GRID
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`px-2 py-1 font-mono text-[10px] ${viewMode === 'cards' ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-white'}`}
            >
              CARDS
            </button>
            <button
              onClick={() => setViewMode('compact')}
              className={`px-2 py-1 font-mono text-[10px] ${viewMode === 'compact' ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-white'}`}
            >
              COMPACT
            </button>
          </div>
        </div>
      </div>

      {error && (
        <AlertBanner type="error" title="Error" message={error} />
      )}

      {/* Gap Analysis Alert */}
      {gapAnalysis && (
        <div className="mb-4">
          <GapAnalysisAlert
            gapAnalysis={gapAnalysis}
            onContribute={() => setShowContributionDialog(true)}
            onDismiss={() => setGapAnalysis(null)}
          />
        </div>
      )}

      {/* Contribution Dialog */}
      {showContributionDialog && contributionPrompt && (
        <ContributionDialog
          open={showContributionDialog}
          onOpenChange={setShowContributionDialog}
          prompt={contributionPrompt}
          onSubmit={handleContributionSubmit}
        />
      )}

      {/* ===== 3-COLUMN REFERENCE DATA GRID: Market | Construction | Labour ===== */}
      <div className="grid grid-cols-3 gap-4 mb-6" style={{ height: '600px' }}>
        {/* Column 1: Market Context */}
        <div className="overflow-y-auto border border-zinc-800 bg-black/30 rounded">
          <MarketContextPanel
            region={region}
            propertyType={valuation?.property?.property_type}
            onDataLoad={setMarketContext}
            collapsed={false}
          />
        </div>

        {/* Column 2: Construction Costs */}
        <div className="overflow-y-auto border border-zinc-800 bg-black/30 rounded">
          <EditableConstructionCostPanel
            region={region}
            qualityTier={subjectProperty.quality_rating}
            onDataChange={setConstructionCosts}
            onSave={async (data) => {
              const response = await fetch('/api/v1/data-hub/economic/construction-costs', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
              });
              if (!response.ok) {
                throw new Error('Failed to save construction costs');
              }
            }}
            collapsed={false}
          />
        </div>

        {/* Column 3: Labour Costs */}
        <div className="overflow-y-auto border border-zinc-800 bg-black/30 rounded">
          <LaborCostsPanel
            region={region}
            collapsed={false}
          />
        </div>
      </div>

      {/* ===== COMPARABLES SECTION (Sales Approach) ===== */}
      
      {/* Insufficient Comparables Warning */}
      {selectedComparables.length < 3 && (
        <div className="mb-4 p-4 bg-red-500/10 border-2 border-red-500/50 rounded-lg animate-pulse">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-red-500 uppercase">
                  Insufficient Comparables
                </span>
                <span className="px-2 py-0.5 bg-red-500/20 rounded font-mono text-xs text-red-400">
                  {selectedComparables.length} / 3 minimum
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-400">
                RICS standards require a minimum of <strong className="text-white">3 comparable properties</strong> for a reliable market value indication. 
                <Link 
                  href={`/dashboard/valuations/${valuationId}/comparables`}
                  className="ml-2 text-amber-400 hover:text-amber-300 underline"
                >
                  Go back to add more comparables →
                </Link>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Comparables Adjustment Grid - Full Width */}
      <div className="space-y-4">
        {/* Selected Comparables & Adjustments - Full Width */}
        <div className="space-y-4">
          {/* Selection Status */}
          <TerminalPanel 
            title={`SELECTED COMPARABLES (${selectedComparables.length})${selectedComparables.length >= 3 ? ' ✓' : ' - MIN 3 REQUIRED'}`}
            action={
              <Link
                href={`/dashboard/valuations/${valuationId}/comparables`}
                className="px-2 py-1 bg-amber-500/20 text-amber-500 font-mono text-[10px] hover:bg-amber-500/30 transition-colors flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                ADD MORE
              </Link>
            }
          >
            {selectedComparables.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 font-mono text-xs">
                <p>No comparables loaded from basket.</p>
                <Link 
                  href={`/dashboard/valuations/${valuationId}/comparables`}
                  className="mt-2 inline-block text-amber-400 hover:text-amber-300 underline"
                >
                  Go to Comparable Search to select properties →
                </Link>
              </div>
            ) : viewMode === 'grid' ? (
              // Full Adjustment Grid View
              <AdjustmentGrid
                subject={subjectProperty}
                comparables={selectedComparables}
                onAdjustmentChange={handleAdjustmentChange}
                onWeightChange={handleWeightChange}
                onLockToggle={handleLockToggle}
                onAutoCalculate={handleAutoCalculate}
                showWeights={showWeights || weightingMethod === 'manual'}
              />
            ) : viewMode === 'cards' ? (
              // Card View - 2 columns grid
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {selectedComparables.map((comp) => (
                  <ComparableDetailCard
                    key={comp.id}
                    comparable={comp as any}
                    adjustments={comp.adjustments}
                    subjectProperty={subjectProperty as any}
                    isSelected={true}
                    onRemove={() => removeComparable(comp.id)}
                    onAdjustmentChange={(cat, val) => handleAdjustmentChange(comp.id, cat, val)}
                    onExpand={() => {}}
                  />
                ))}
              </div>
            ) : (
              // Compact Table View
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-[10px] font-mono text-zinc-500 border-b border-zinc-800">
                      <th className="text-left pb-2 px-2">PROPERTY</th>
                      <th className="text-right pb-2 px-2">SALE PRICE</th>
                      <th className="text-right pb-2 px-2">₵/SQM</th>
                      <th className="text-right pb-2 px-2">ADJ %</th>
                      <th className="text-right pb-2 px-2">ADJ VALUE</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedComparables.map((comp) => (
                      <tr key={comp.id} className="border-b border-zinc-800/50">
                        <td className="py-2 px-2">
                          <div className="font-mono text-xs text-white">
                            {(comp as any).full_address || (comp as any).address || '—'}
                          </div>
                          <div className="font-mono text-[10px] text-zinc-500">
                            {comp.gfa} sqm • {new Date(comp.sale_date).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-xs text-zinc-400">
                          ₵{(comp.sale_price || 0).toLocaleString()}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-xs text-zinc-400">
                          ₵{Math.round((comp.sale_price || 0) / (comp.gfa || 1)).toLocaleString()}
                        </td>
                        <td className={`py-2 px-2 text-right font-mono text-xs font-bold ${
                          (comp.totalAdjustment || 0) > 0 ? 'text-green-400' : 
                          (comp.totalAdjustment || 0) < 0 ? 'text-red-400' : 'text-zinc-400'
                        }`}>
                          {(comp.totalAdjustment || 0) > 0 ? '+' : ''}{(comp.totalAdjustment || 0).toFixed(1)}%
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-sm text-amber-400">
                          ₵{Math.round(comp.adjustedPrice || 0).toLocaleString()}
                        </td>
                        <td className="py-2">
                          <button
                            onClick={() => removeComparable(comp.id)}
                            className="p-1 text-zinc-500 hover:text-red-400"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TerminalPanel>

          {/* Value Reconciliation */}
          <TerminalPanel title="VALUE RECONCILIATION">
            {/* Weighting Method Selection */}
            <div className="flex items-center gap-4 mb-4">
              <span className="font-mono text-[10px] text-zinc-500">WEIGHTING METHOD:</span>
              <div className="flex gap-1">
                {(['quality_weighted', 'simple_average', 'median', 'manual'] as WeightingMethod[]).map((method) => (
                  <button
                    key={method}
                    onClick={() => setWeightingMethod(method)}
                    className={`px-2 py-1 font-mono text-[10px] border transition-colors ${
                      weightingMethod === method 
                        ? 'border-amber-500 bg-amber-500/20 text-amber-500' 
                        : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    {method.replace('_', ' ').toUpperCase()}
                  </button>
                ))}
              </div>
              {weightingMethod === 'manual' && (
                <button
                  onClick={() => setShowWeights(!showWeights)}
                  className={`px-2 py-1 font-mono text-[10px] flex items-center gap-1 border transition-colors ${
                    showWeights ? 'border-green-500 text-green-500' : 'border-zinc-700 text-zinc-400'
                  }`}
                >
                  <Scale className="w-3 h-3" />
                  {showWeights ? 'HIDE WEIGHTS' : 'SHOW WEIGHTS'}
                </button>
              )}
            </div>
            
            {/* Value Display */}
            <div className="grid grid-cols-4 gap-4">
              <div className="p-4 bg-zinc-800/30 text-center">
                <div className="font-mono text-[10px] text-zinc-500 mb-1">VALUE RANGE</div>
                <div className="font-mono text-sm text-white">
                  {valueRange ? (
                    <>₵{Math.round(valueRange.min).toLocaleString()} - ₵{Math.round(valueRange.max).toLocaleString()}</>
                  ) : '—'}
                </div>
              </div>
              <div className="p-4 bg-zinc-800/30 text-center">
                <div className="font-mono text-[10px] text-zinc-500 mb-1">AVG ADJUSTED ₵/SQM</div>
                <div className="font-mono text-xl text-white">
                  ₵{selectedComparables.length > 0
                    ? Math.round(
                        selectedComparables.reduce((sum, c) => sum + (c.adjustedPricePerSqm || 0), 0) /
                          selectedComparables.length
                      ).toLocaleString()
                    : '—'}
                </div>
              </div>
              <div className="p-4 bg-zinc-800/30 text-center">
                <div className="font-mono text-[10px] text-zinc-500 mb-1">SUBJECT GFA</div>
                <div className="font-mono text-xl text-white">
                  {subjectProperty.gfa || '—'} sqm
                </div>
              </div>
              <div className="p-4 bg-green-900/20 border border-green-800 text-center">
                <div className="font-mono text-[10px] text-green-400 mb-1">INDICATED VALUE</div>
                <div className="font-mono text-2xl text-green-400 font-bold">
                  ₵{calculateIndicatedValue ? Math.round(calculateIndicatedValue).toLocaleString() : '—'}
                </div>
              </div>
            </div>

            {/* Confidence & Stats */}
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="font-mono text-[10px] text-zinc-500">CONFIDENCE: </span>
                    <ConfidenceBar score={calculateConfidence() * 100} />
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-500">
                    <span>{selectedComparables.length} comparables</span>
                    <span>•</span>
                    <span>
                      Avg adjustment: {selectedComparables.length > 0
                        ? (
                            selectedComparables.reduce((sum, c) => sum + Math.abs(c.totalAdjustment || 0), 0) /
                            selectedComparables.length
                          ).toFixed(1)
                        : 0}%
                    </span>
                  </div>
                </div>
                
                {/* Quality score breakdown */}
                {selectedComparables.length > 0 && (
                  <div className="flex items-center gap-4">
                    {selectedComparables.slice(0, 4).map((comp, idx) => (
                      <div key={comp.id} className="text-center">
                        <div className="font-mono text-[9px] text-zinc-500">C{idx + 1} QUALITY</div>
                        <div className="font-mono text-xs text-amber-400">
                          {Math.round(calculateQualityScore(comp))}%
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TerminalPanel>
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-6 flex justify-between">
        <Link
          href={`/dashboard/valuations/${valuationId}/comparables`}
          className="px-6 py-3 bg-zinc-800 text-zinc-400 font-mono text-sm hover:text-white transition-colors"
        >
          ← BACK TO COMPARABLES
        </Link>
        <button
          onClick={handleSave}
          disabled={saving || selectedComparables.length < 3}
          className="px-6 py-3 bg-amber-500 text-black font-mono text-sm font-bold hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {(() => {
            const selectedMethods = (valuation as any)?.selectedMethods || valuation?.methods_applied || []
            const hasCostApproach = selectedMethods.includes('cost_approach')
            const hasIncomeApproach = selectedMethods.includes('income_approach')
            if (hasCostApproach) return 'SAVE & CONTINUE TO COST APPROACH →'
            if (hasIncomeApproach) return 'SAVE & CONTINUE TO INCOME APPROACH →'
            return 'SAVE & CONTINUE TO RECONCILIATION →'
          })()}
        </button>
      </div>
    </div>
  )
}
