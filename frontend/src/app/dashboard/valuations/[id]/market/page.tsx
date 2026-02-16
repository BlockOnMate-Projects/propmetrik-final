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

  // Fetch valuation and existing comparables
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        setError(null)

        // First get valuation data
        const valuationRes = await valuationsApi.getById(valuationId)
        
        if (valuationRes.error) throw new Error(valuationRes.error)
        if (!valuationRes.data) throw new Error('Valuation not found')

        setValuation(valuationRes.data as unknown as Valuation)

        // Try to get comparables from basket, fallback to direct API
        try {
          const basketRes = await comparablesApi.getBasket(valuationId)
          
          if (basketRes.data && (basketRes.data as any).comparables?.length > 0) {
            setBasket(basketRes.data as unknown as ComparableBasket)
            
            // Currency conversion helper
            const convertToGHS = (price: number, currency: string) => {
              if (currency === 'USD') {
                return price * 15.7 // USD to GHS conversion
              }
              return price
            }
            
            // GFA fallback helper
            const getGFA = (comp: any) => {
              const gfa = comp.gfa || comp.built_area_sqm || comp.building_size_sqm || comp.total_area_sqm
              if (!gfa || gfa === 0) {
                // Use reasonable default based on bedrooms
                const bedrooms = comp.bedrooms || 3
                return bedrooms * 65 // ~65 sqm per bedroom average
              }
              return parseFloat(gfa)
            }
            
            // Load existing comparables with adjustments
            setSelectedComparables(
              (basketRes.data as any).comparables.map((comp: any) => {
                const originalPrice = parseFloat(comp.sale_price || comp.price || 0)
                const currency = comp.price_currency || comp.currency || 'GHS'
                const convertedPrice = convertToGHS(originalPrice, currency)
                const gfaValue = getGFA(comp)
                
                return {
                  ...comp,
                  // Price fields
                  sale_price: convertedPrice,
                  asking_price_ghs: comp.asking_price_ghs || comp.asking_price || convertedPrice,
                  price_original: originalPrice,
                  price_currency: currency,
                  fx_rate_used: currency === 'USD' ? 15.7 : 1,
                  
                  // Size fields  
                  gfa: gfaValue,
                built_area_sqm: comp.built_area_sqm || comp.gfa || comp.building_size_sqm,
                plot_size: comp.plot_size || comp.land_area_sqm || comp.plot_area,
                
                // Property details
                bedrooms: comp.bedrooms || comp.bedroom_count,
                bathrooms: comp.bathrooms || comp.bathroom_count,
                year_built: comp.year_built || comp.construction_year,
                condition: comp.condition || comp.property_condition || 'good',
                quality_rating: comp.quality_rating || comp.quality_tier || 'standard',
                property_type: comp.property_type || comp.type,
                
                // Location
                address_street: comp.address_street || comp.address || comp.street_address,
                address_city: comp.address_city || comp.city,
                neighborhood: comp.neighborhood || comp.area,
                region: comp.region,
                
                // Transaction details
                sale_date: comp.sale_date || comp.transaction_date || new Date().toISOString(),
                listing_type: comp.listing_type || comp.transaction_type || 'sale',
                data_source: comp.data_source || comp.source || 'database',
                
                // Evidence and verification
                evidence_type: comp.evidence_type || (comp.data_source === 'contribution' ? 'Verified Sale' : 'Listing'),
                asking_to_achieved_adj: comp.asking_to_achieved_adj || 'Not Set',
                days_on_market: comp.days_on_market || comp.marketing_period,
                
                // Features
                parking_spaces: comp.parking_spaces || comp.garage_spaces || 0,
                floor_number: comp.floor_number || comp.floor,
                amenities: comp.amenities || [],
                
                  // Adjustments and calculations
                  adjustments: comp.adjustments ? (typeof comp.adjustments === 'string' ? JSON.parse(comp.adjustments) : comp.adjustments) : {},
                  totalAdjustment: comp.total_adjustment || 0,
                  adjustedPrice: comp.adjusted_price || comp.adjusted_value || convertedPrice,
                  adjustedPricePerSqm: comp.adjusted_price_per_sqm || ((comp.adjusted_price || convertedPrice) / gfaValue),
                  weight: comp.weight || (1 / ((basketRes.data as any).comparables?.length || 1)),
                  isLocked: false,
                }
              })
            )
          } else {
            // No basket - try fetching selected comparables from valuation
            const comparablesRes = await comparablesApi.getByValuation(valuationId)
            if (comparablesRes.data && comparablesRes.data.length > 0) {
              setSelectedComparables(
                comparablesRes.data.map((comp: any) => ({
                  ...comp,
                  // Enhanced field mapping for better data display
                  sale_price: comp.sale_price || comp.price || comp.asking_price_ghs || 0,
                  asking_price_ghs: comp.asking_price_ghs || comp.asking_price || comp.price || comp.sale_price,
                  price_currency: comp.price_currency || 'GHS',
                  fx_rate_used: comp.fx_rate_used || 1,
                  gfa: comp.gfa || comp.built_area_sqm || comp.building_size_sqm || comp.total_area_sqm || 0,
                  evidence_type: comp.evidence_type || (comp.data_source === 'contribution' ? 'Verified Sale' : 'Listing'),
                  condition: comp.condition || 'good',
                  quality_rating: comp.quality_rating || 'standard',
                  sale_date: comp.sale_date || comp.transaction_date || new Date().toISOString(),
                  adjustments: {},
                  totalAdjustment: 0,
                  adjustedPrice: comp.sale_price || comp.price || 0,
                  adjustedPricePerSqm: (comp.sale_price || comp.price || 0) / (comp.gfa || comp.built_area_sqm || 1),
                  weight: 1 / comparablesRes.data.length,
                  isLocked: false,
                }))
              )
            }
          }
        } catch (basketErr) {
          console.warn('Failed to load basket, continuing without comparables:', basketErr)
          // Page will show "no comparables" message
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [valuationId])

  // Auto-calculate adjustments for all comparables when loaded
  // This runs every time valuation and comparables are available
  useEffect(() => {
    // Run when we have valuation, comparables, and not loading
    if (!valuation?.property || selectedComparables.length === 0 || loading) return
    
    console.log('Auto-calculating adjustments for all comparables...')
    
    const subject = valuation.property as any
    
    setSelectedComparables(prev => 
      prev.map(comp => {
        if (comp.isLocked) return comp
        
        // Skip if this comparable already has significant adjustments (user has edited)
        const hasUserAdjustments = comp.adjustments && Object.values(comp.adjustments).some(val => Math.abs(val || 0) > 0.1)
        if (hasUserAdjustments) return comp
        
        // Auto-calculate adjustments based on subject vs comparable
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
  }, [valuation, selectedComparables.length, loading, marketContext])

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
      prev.map(comp => comp.id === compId ? { ...comp, weight: weight / 100 } : comp) // Convert percentage to decimal
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

  // Calculate indicated value using Python valuation service
  const calculateIndicatedValue = useMemo(() => {
    // Return null - we'll fetch this from the Python service instead
    return null
  }, [])
  
  // Fetch sales comparison result from Python service
  const [pythonValuationResult, setPythonValuationResult] = useState<any>(null)
  const [isCalculating, setIsCalculating] = useState(false)
  
  // Run Python valuation when comparables are loaded
  useEffect(() => {
    if (selectedComparables.length > 0 && valuation && !isCalculating) {
      runPythonValuation()
    }
  }, [selectedComparables.length, valuation?.id])
  
  const runPythonValuation = async () => {
    if (!valuation?.id) return
    
    setIsCalculating(true)
    try {
      // Note: Next.js rewrites /api/* to /api/v1/*, so we use /api/ (not /api/v1/)
      const response = await fetch(`/api/valuations/${valuation.id}/run-python`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          methods: ['sales_comparison'],
          include_comparables: true
        })
      })
      
      if (response.ok) {
        const result = await response.json()
        setPythonValuationResult(result.data)
        console.log('Python valuation result:', result.data)
      } else {
        console.error('Failed to run Python valuation:', response.statusText)
      }
    } catch (error) {
      console.error('Error calling Python valuation service:', error)
    } finally {
      setIsCalculating(false)
    }
  }

  // Calculate confidence based on number and quality of comparables
  const calculateConfidence = useCallback(() => {
    const count = selectedComparables.length
    if (count === 0) return 0
    
    const avgAdjustment = selectedComparables.reduce(
      (sum, c) => sum + Math.abs(c.totalAdjustment || 0), 0
    ) / count

    // Base confidence on count (max at 5+ comps)
    const countScore = Math.min(count / 5, 1) * 0.4

    // Reduce confidence for high adjustments
    const adjustmentScore = Math.max(0, 1 - avgAdjustment / 30) * 0.3
    
    // Bonus for quality scores
    const avgQuality = selectedComparables.reduce(
      (sum, c) => sum + calculateQualityScore(c), 0
    ) / count
    const qualityScore = (avgQuality / 100) * 0.3

    return Math.min(1, countScore + adjustmentScore + qualityScore)
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

      // Get value from Python RICS result
      const ricsValue = pythonValuationResult?.estimated_value || pythonValuationResult?.rics_result?.estimated_value || 0
      const ricsConfidence = pythonValuationResult?.confidence_score || pythonValuationResult?.rics_result?.confidence_score || 0.7

      // Validate we have a calculated value
      if (ricsValue === 0 && selectedComparables.length > 0) {
        // Try running Python valuation if not done yet
        await runPythonValuation()
        // Wait a moment for state update
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      // Re-read value after potential recalculation
      const finalValue = pythonValuationResult?.estimated_value || pythonValuationResult?.rics_result?.estimated_value || ricsValue
      
      if (finalValue === 0 && selectedComparables.length > 0) {
        setError('Valuation calculation is still in progress. Please wait and try again.')
        setSaving(false)
        return
      }

      await comparablesApi.saveBasket(valuationId, {
        comparables: selectedComparables,
        indicatedValue: finalValue || ricsValue,
        avgPricePerSqm:
          selectedComparables.reduce((sum, c) => sum + (c.adjustedPricePerSqm || 0), 0) /
          (selectedComparables.length || 1),
      })

      const confidenceValue = ricsConfidence
      const indicatedValue = ricsValue
      
      // Get value range from Python RICS result or calculate from comparables
      const ricsValueRange = pythonValuationResult?.value_range || pythonValuationResult?.rics_result?.value_range || valueRange

      // Update valuation method result and summary fields
      await valuationsApi.update(valuationId, {
        method_results: {
          ...(valuation?.method_results || {}),
          sales_comparison: {
            value: indicatedValue,
            value_ghs: indicatedValue, // Also include as value_ghs for reconciliation page compatibility
            confidence: confidenceValue,
            confidence_score: confidenceValue, // Also include as confidence_score
            comparablesCount: selectedComparables.length,
            avgAdjustment:
              selectedComparables.reduce((sum, c) => sum + Math.abs(c.totalAdjustment || 0), 0) /
              (selectedComparables.length || 1),
            method: 'rics_sales_comparison',
            valueRange: ricsValueRange,
          },
        },
        current_step: 7, // Market analysis complete, advance to next method step
        // Also update summary fields on the main valuation record
        sales_comparison_value: indicatedValue,
        sales_comparison_confidence: confidenceValue,
        confidence_score: confidenceValue, // Update main confidence score
        // Update main estimated_value and value_range for reconciliation
        estimated_value: indicatedValue,
        value_range_low: ricsValueRange?.min || (indicatedValue * 0.9),
        value_range_high: ricsValueRange?.max || (indicatedValue * 1.1),
      })

      // Navigate to next step based on selected methods
      // Check which methods are selected (in workflow order)
      const selectedMethods = (valuation as any)?.selectedMethods || valuation?.methods_applied || []
      const hasCostApproach = selectedMethods.includes('cost_approach')
      const hasIncomeApproach = selectedMethods.includes('income_approach')
      const hasDRC = selectedMethods.includes('drc_method')
      const hasProfits = selectedMethods.includes('profits_method')
      const hasResidual = selectedMethods.includes('residual_method')
      
      if (hasCostApproach) {
        router.push(`/dashboard/valuations/${valuationId}/cost`)
      } else if (hasIncomeApproach) {
        // Route to rental-market first for rental comparable analysis
        router.push(`/dashboard/valuations/${valuationId}/rental-market`)
      } else if (hasDRC) {
        router.push(`/dashboard/valuations/${valuationId}/drc`)
      } else if (hasProfits) {
        router.push(`/dashboard/valuations/${valuationId}/profits`)
      } else if (hasResidual) {
        router.push(`/dashboard/valuations/${valuationId}/residual`)
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

      {/* ===== 2-COLUMN REFERENCE DATA GRID: Market | Construction ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Column 1: Market Context */}
        <div className="border border-zinc-800 bg-black/30 rounded overflow-hidden">
          <MarketContextPanel
            region={region}
            propertyType={valuation?.property?.property_type}
            onDataLoad={setMarketContext}
            collapsed={false}
          />
        </div>

        {/* Column 2: Construction Costs (for reference, based on selected region) */}
        <div className="border border-zinc-800 bg-black/30 rounded overflow-hidden">
          <EditableConstructionCostPanel
            region={region}
            qualityTier={subjectProperty.quality_rating}
            onDataChange={setConstructionCosts}
            onSave={async (data) => {
              const response = await fetch('/api/data-hub/economic/construction-costs', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...data, region }),
              });
              if (!response.ok) {
                throw new Error('Failed to save construction costs');
              }
            }}
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
            ) : (
              // Full Adjustment Grid View
              <AdjustmentGrid
                subject={subjectProperty}
                comparables={selectedComparables}
                onAdjustmentChange={handleAdjustmentChange}
                onWeightChange={handleWeightChange}
                onLockToggle={handleLockToggle}
                onAutoCalculate={handleAutoCalculate}
                showWeights={false}
              />
            )}
          </TerminalPanel>

          {/* Value Reconciliation */}
          <TerminalPanel title="VALUE RECONCILIATION">
            {/* RICS Method Indicator */}
            <div className="flex items-center gap-4 mb-4">
              <span className="font-mono text-[10px] text-zinc-500">METHOD:</span>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 font-mono text-[10px] border border-amber-500 bg-amber-500/20 text-amber-500">
                  RICS SALES COMPARISON
                </span>
                {isCalculating && (
                  <span className="font-mono text-[10px] text-amber-400 animate-pulse">
                    CALCULATING...
                  </span>
                )}
              </div>
            </div>
            
            {/* Value Display */}
            <div className="grid grid-cols-4 gap-4">
              <div className="p-4 bg-zinc-800/30 text-center">
                <div className="font-mono text-[10px] text-zinc-500 mb-1">VALUE RANGE</div>
                <div className="font-mono text-sm text-white">
                  {pythonValuationResult?.sales_comparison?.value_range ? (
                    <>₵{Math.round(pythonValuationResult.sales_comparison.value_range.low).toLocaleString()} - ₵{Math.round(pythonValuationResult.sales_comparison.value_range.high).toLocaleString()}</>
                  ) : '—'}
                </div>
              </div>
              <div className="p-4 bg-zinc-800/30 text-center">
                <div className="font-mono text-[10px] text-zinc-500 mb-1">IMPLIED ₵/SQM</div>
                <div className="font-mono text-xl text-white">
                  ₵{pythonValuationResult?.sales_comparison?.estimated_value && subjectProperty.gfa
                    ? Math.round(pythonValuationResult.sales_comparison.estimated_value / subjectProperty.gfa).toLocaleString()
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
                <div className="font-mono text-[10px] text-green-400 mb-1">
                  {isCalculating ? 'CALCULATING...' : 'INDICATED VALUE'}
                </div>
                <div className="font-mono text-2xl text-green-400 font-bold">
                  {isCalculating ? (
                    <div className="animate-pulse">...</div>
                  ) : (
                    <>₵{pythonValuationResult?.sales_comparison?.estimated_value 
                      ? Math.round(pythonValuationResult.sales_comparison.estimated_value).toLocaleString() 
                      : '—'}</>
                  )}
                </div>
                {pythonValuationResult?.sales_comparison?.confidence_level && (
                  <div className="font-mono text-[9px] text-green-400 mt-1 opacity-75">
                    {pythonValuationResult.sales_comparison.confidence_level.toUpperCase()} CONFIDENCE
                  </div>
                )}
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
            const hasDRC = selectedMethods.includes('drc_method')
            const hasProfits = selectedMethods.includes('profits_method')
            const hasResidual = selectedMethods.includes('residual_method')
            if (hasCostApproach) return 'SAVE & CONTINUE TO COST APPROACH →'
            if (hasIncomeApproach) return 'SAVE & CONTINUE TO INCOME APPROACH →'
            if (hasDRC) return 'SAVE & CONTINUE TO DRC →'
            if (hasProfits) return 'SAVE & CONTINUE TO PROFITS →'
            if (hasResidual) return 'SAVE & CONTINUE TO RESIDUAL →'
            return 'SAVE & CONTINUE TO RECONCILIATION →'
          })()}
        </button>
      </div>
    </div>
  )
}
