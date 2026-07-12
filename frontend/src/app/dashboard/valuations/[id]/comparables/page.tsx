'use client'

/**
 * Comparables Search & Selection Page
 * 
 * Step 4 in the RICS-compliant valuation workflow.
 * Allows users to:
 * 1. Search for comparable properties within radius
 * 2. View gap analysis and data quality metrics
 * 3. Submit new comparable properties (contribution workflow)
 * 4. Select comparables for the adjustment analysis (saved to basket)
 * 
 * This page comes AFTER Method Selection and BEFORE Market Analysis.
 */

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { 
  ArrowLeft,
  Search,
  Plus,
  MapPin,
  Building2,
  Calendar,
  Ruler,
  Bed,
  Bath,
  Car,
  Trees,
  Shield,
  Star,
  Eye,
  Filter,
  Save,
  CheckCircle2,
  AlertTriangle,
  Info,
  Loader2,
  X,
  Check,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import ComprehensivePropertyForm from '@/components/forms/ComprehensivePropertyForm'
import { type ComprehensivePropertyData } from '@/types/comprehensiveProperty'
import { contributionsApi } from '@/lib/contributions-api'
import { valuationsApi, comparableBasketApi } from '@/lib/valuation-api'
import { getNextStep, getPrevStep, stepPath } from '@/lib/valuation-workflow'

// =====================================================
// TYPES
// =====================================================

interface SearchFilters {
  maxDistance: number
  minPrice: number
  maxPrice: number
  minGfa: number
  maxGfa: number
  bedroomsMin?: number
  bedroomsMax?: number
  maxAgeMonths: number
}

interface ComparableResult {
  id: string
  reference_number?: string
  title?: string
  address_street?: string
  address_city?: string
  neighborhood?: string
  region?: string
  latitude?: number
  longitude?: number
  property_type?: string
  bedrooms?: number
  bathrooms?: number
  gfa?: number
  plot_size?: number
  year_built?: number
  condition?: string
  floors?: number
  amenities?: string[]
  sale_price: number
  asking_price_ghs?: number
  price_original?: number
  price_currency?: string
  fx_rate_used?: number
  sale_date?: string
  listing_type?: string
  data_source?: string
  distance_km: number
  similarity_score: number
}

interface SearchMeta {
  valuationId: string
  searchCriteria: {
    latitude: number
    longitude: number
    radiusKm: number
    propertyType: string
    sizeRange: { min: number; max: number }
    maxAgeMonths: number
  }
  count: number
  hasGap: boolean
  gapSeverity: 'severe' | 'moderate' | 'minor' | 'none'
  aggregates?: {
    avgPrice: number
    avgPricePerSqm: number
    avgDistance: number
    avgSimilarity: number
    minPrice: number
    maxPrice: number
    minPricePerSqm: number
    maxPricePerSqm: number
  }
  currencyConversion?: {
    targetCurrency: string
    fxRateUsed: number
    fxRateDate: string
    usdCount: number
    ghsCount: number
    note: string
  }
  gapAnalysis?: {
    required: number
    found: number
    shortfall: number
    message: string
    contributionPrompt?: {
      type: string
      title: string
      description: string
      rewardCredits: number
      searchCriteria: any
    }
  }
}

interface SubjectProperty {
  id: string
  address: string
  city: string
  district?: string
  region: string
  digital_address?: string
  property_type: string
  gfa: number
  plot_size?: number
  year_built?: number
  bedrooms?: number
  bathrooms?: number
  condition?: string
  amenities?: string[]
  latitude?: number
  longitude?: number
}

const DEFAULT_FILTERS: SearchFilters = {
  maxDistance: 15.0,
  minPrice: 0,
  maxPrice: 10000000,
  minGfa: 0,
  maxGfa: 2000,
  maxAgeMonths: 24,
}

// =====================================================
// MAIN COMPONENT
// =====================================================

function ComparablesPageContent() {
  const params = useParams()
  const router = useRouter()
  const valuationId = params.id as string
  
  // State
  const [subjectProperty, setSubjectProperty] = useState<SubjectProperty | null>(null)
  const [searchResults, setSearchResults] = useState<ComparableResult[]>([])
  const [searchMeta, setSearchMeta] = useState<SearchMeta | null>(null)
  const [selectedComparables, setSelectedComparables] = useState<string[]>([])
  // Similarity scores of comps restored from the saved basket — used on re-save when a
  // restored comp isn't in the current search results (else its score would reset to 0).
  const restoredScoresRef = useRef<Record<string, number>>({})
  const [searchFilters, setSearchFilters] = useState<SearchFilters>(DEFAULT_FILTERS)
  const [showFilters, setShowFilters] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newComparable, setNewComparable] = useState<Partial<ComprehensivePropertyData>>({})
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Selected methods from valuation
  const [selectedMethods, setSelectedMethods] = useState<string[]>([])
  const [primaryMethod, setPrimaryMethod] = useState<string | null>(null)

  // Load valuation and initial search
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        setError(null)
        
        // Get valuation with property details
        const valuationRes = await valuationsApi.getById(valuationId)
        if (valuationRes.error || !valuationRes.data) {
          throw new Error(valuationRes.error || 'Valuation not found')
        }
        
        const valuation = valuationRes.data
        const property = valuation.property || {}
        
        // Extract selected methods from valuation
        const methods = (valuation as any).selectedMethods || valuation.methods_applied || []
        const primary = (valuation as any).primaryMethod || (methods.length > 0 ? methods[0] : null)
        setSelectedMethods(methods)
        setPrimaryMethod(primary)
        
        setSubjectProperty({
          id: valuation.property_id || property.id,
          address: property.address_street || property.address || 'Unknown Address',
          city: property.address_city || property.city || '',
          district: property.address_district || property.neighborhood || '',
          region: property.region || 'Greater Accra',
          digital_address: property.digital_address,
          property_type: property.property_type || 'house',
          gfa: property.built_area_sqm || property.gfa || 200,
          plot_size: property.total_area_sqm || property.plot_size,
          year_built: property.year_built,
          bedrooms: property.bedrooms,
          bathrooms: property.bathrooms,
          condition: property.condition,
          amenities: property.amenities,
          latitude: property.latitude,
          longitude: property.longitude,
        })
        
        // Run initial search
        await runSearch()

        // Restore the previously saved selection (comparable basket) so returning to
        // this step shows — and re-saves — the SAME evidence the valuation already
        // used. Without this, going Back reset the selection to zero and forced a
        // reselection that could silently change the value conclusion.
        try {
          const baskets = await comparableBasketApi.getByValuation(valuationId)
          const primaryBasket = baskets.success && baskets.data.length > 0 ? baskets.data[0] : null
          if (primaryBasket) {
            const saved = await comparableBasketApi.getComparables(primaryBasket.id)
            if (saved.success && saved.data.length > 0) {
              const scores: Record<string, number> = {}
              const ids = saved.data
                .map((c: any) => {
                  // Basket rows store the id as comparable_property_id (raw table
                  // columns) — property_id is only the API's INPUT field name.
                  const pid = String(c.comparable_property_id || c.property_id || '')
                  if (pid) scores[pid] = Number(c.quality_score ?? c.similarity_score) || 0
                  return pid
                })
                .filter(Boolean)
              restoredScoresRef.current = scores
              if (ids.length > 0) setSelectedComparables(ids)
            }
          }
        } catch { /* restore is best-effort — a fresh selection still works */ }

      } catch (err) {
        console.error('Failed to load valuation:', err)
        setError(err instanceof Error ? err.message : 'Failed to load valuation')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [valuationId])

  // Run comparable search
  const runSearch = useCallback(async () => {
    try {
      setSearching(true)
      
      const response = await fetch(`/api/valuations/${valuationId}/comparables/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          radiusKm: searchFilters.maxDistance,
          priceMin: searchFilters.minPrice > 0 ? searchFilters.minPrice : undefined,
          priceMax: searchFilters.maxPrice < 10000000 ? searchFilters.maxPrice : undefined,
          sizeMin: searchFilters.minGfa > 0 ? searchFilters.minGfa : undefined,
          sizeMax: searchFilters.maxGfa < 2000 ? searchFilters.maxGfa : undefined,
          bedroomsMin: searchFilters.bedroomsMin,
          bedroomsMax: searchFilters.bedroomsMax,
          maxAgeMonths: searchFilters.maxAgeMonths,
          excludeIds: [],
          limit: 20,
        }),
      })
      
      const result = await response.json()
      
      if (result.success) {
        setSearchResults(result.data || [])
        setSearchMeta(result.meta)
      } else {
        console.error('Search failed:', result.message)
        setSearchResults([])
      }
      
    } catch (err) {
      console.error('Search error:', err)
    } finally {
      setSearching(false)
    }
  }, [valuationId, searchFilters])

  // Debounced search on filter change
  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => {
        runSearch()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [searchFilters, loading, runSearch])

  // Toggle comparable selection
  const toggleComparable = (id: string) => {
    setSelectedComparables(prev => 
      prev.includes(id) 
        ? prev.filter(cId => cId !== id)
        : [...prev, id]
    )
  }

  // Check which methods are selected
  const hasSalesComparison = selectedMethods.includes('sales_comparison')

  // Minimum comparables required (3 for sales comparison, 0 otherwise but still useful)
  const minComparablesRequired = hasSalesComparison ? 3 : 0
  const canProceed = selectedComparables.length >= minComparablesRequired

  // Next/previous steps come from the shared workflow sequence (driven by methods_applied).
  const nextStep = getNextStep('comparables', selectedMethods)
  const prevStep = getPrevStep('comparables', selectedMethods)

  // Save selected comparables to basket and proceed
  const saveAndProceed = async () => {
    if (hasSalesComparison && selectedComparables.length < 3) {
      alert('Please select at least 3 comparable properties for a reliable valuation (RICS requirement)')
      return
    }
    
    try {
      setSaving(true)
      
      // Create or get existing basket (if we have comparables)
      if (selectedComparables.length > 0) {
        let basketId: string
        const basketsRes = await comparableBasketApi.getByValuation(valuationId)
        
        if (basketsRes.success && basketsRes.data.length > 0) {
          basketId = basketsRes.data[0].id
        } else {
          const createRes = await comparableBasketApi.create(valuationId, {
            basket_name: 'Primary Basket',
            is_primary: true,
            search_criteria: searchFilters,
          })
          if (!createRes.success) {
            throw new Error(createRes.error || 'Failed to create basket')
          }
          basketId = createRes.data.id
        }
        
        // Clear existing comparables from basket before adding new selection
        await comparableBasketApi.clearComparables(basketId)

        // Add selected comparables to basket. A restored comp may not be in the
        // current search results — fall back to its previously saved similarity
        // score instead of resetting it to 0.
        for (const propertyId of selectedComparables) {
          const comp = searchResults.find(r => r.id === propertyId)
          await comparableBasketApi.addComparable(basketId, {
            property_id: propertyId,
            similarity_score: comp?.similarity_score ?? restoredScoresRef.current[propertyId] ?? 0,
            weight: 1.0,
          })
        }
      }
      
      // Navigate to the next active step in the shared workflow sequence.
      router.push(stepPath(valuationId, nextStep))

    } catch (err) {
      console.error('Failed to save basket:', err)
      alert('Failed to save selected comparables. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Submit new comparable property
  const handleSubmitComparable = async () => {
    if (!newComparable.address || !newComparable.city || !newComparable.sale_price) {
      alert('Please fill in required fields: address, city, and sale price')
      return
    }

    try {
      setSubmitting(true)
      
      const result = await contributionsApi.submitComparable(
        newComparable,
        subjectProperty?.id || valuationId,
        'User-submitted comparable property via valuation workflow'
      )
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to submit comparable')
      }
      
      // Refresh search results to include new comparable
      await runSearch()
      
      // Reset form
      setNewComparable({})
      setShowAddForm(false)
      
      const trustScore = result.metadata?.trust_score || result.data?.trust_score || 0
      alert(`Comparable property submitted and approved!\nIt will appear in your search results after refreshing.`)
      
    } catch (error) {
      console.error('Error submitting comparable:', error)
      alert('Failed to submit comparable. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  // Calculate property age
  const getAge = (yearBuilt?: number) => {
    if (!yearBuilt) return null
    return new Date().getFullYear() - yearBuilt
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
          <span className="font-mono text-sm text-muted-foreground">Loading comparables...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="font-mono text-sm text-red-600 dark:text-red-400 mb-4">{error}</p>
          <Link
            href="/dashboard/valuations"
            className="font-mono text-sm text-amber-500 hover:text-amber-400"
          >
            ← Back to Valuations
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href={stepPath(valuationId, prevStep)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="font-mono text-sm">BACK TO {prevStep.label}</span>
            </Link>
            <div className="h-6 w-px bg-muted" />
            <div>
              <h1 className="font-mono text-2xl text-foreground">COMPARABLE SEARCH</h1>
              <p className="font-mono text-xs text-muted-foreground">
                Step 4: {hasSalesComparison 
                  ? 'Select comparables for Sales Comparison Approach' 
                  : 'Optional - Select reference comparables for valuation'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-muted-foreground">
              {selectedComparables.length} / {hasSalesComparison ? '3+' : '0+'} SELECTED
            </span>
            <button
              onClick={saveAndProceed}
              disabled={!canProceed || saving}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-foreground font-mono text-sm font-bold hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  SAVING...
                </>
              ) : (
                <>
                  CONTINUE TO {nextStep.label}
                  <ArrowLeft className="w-4 h-4 rotate-180" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Gap Analysis Alert */}
        {searchMeta?.hasGap && searchMeta.gapAnalysis && (
          <div className={cn(
            'p-4 mb-6 border',
            searchMeta.gapSeverity === 'severe' 
              ? 'bg-red-500/10 border-red-500/50' 
              : searchMeta.gapSeverity === 'moderate'
              ? 'bg-amber-500/10 border-amber-500/50'
              : 'bg-blue-500/10 border-blue-500/50'
          )}>
            <div className="flex items-start gap-3">
              <AlertTriangle className={cn(
                'w-5 h-5 mt-0.5',
                searchMeta.gapSeverity === 'severe' ? 'text-red-500' : 'text-amber-500'
              )} />
              <div className="flex-1">
                <div className="font-mono text-sm text-foreground mb-1">
                  {searchMeta.gapAnalysis.message}
                </div>
                {searchMeta.gapAnalysis.contributionPrompt && (
                  <div className="font-mono text-xs text-muted-foreground">
                    {searchMeta.gapAnalysis.contributionPrompt.description}
                    <span className="text-amber-600 dark:text-amber-400 ml-2">
                      +{searchMeta.gapAnalysis.contributionPrompt.rewardCredits} credits for contribution
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-foreground font-mono text-xs hover:bg-emerald-500"
              >
                <Plus className="w-3 h-3" />
                CONTRIBUTE
              </button>
            </div>
          </div>
        )}

        {/* Subject Property Summary */}
        {subjectProperty && (
          <div className="bg-card/50 border border-border p-6 mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Building2 className="w-5 h-5 text-amber-500" />
              <h2 className="font-mono text-lg text-foreground">SUBJECT PROPERTY</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <div className="font-mono text-sm text-foreground">{subjectProperty.address}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {subjectProperty.city}{subjectProperty.district ? `, ${subjectProperty.district}` : ''}, {subjectProperty.region}
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1">
                  <Ruler className="w-4 h-4 text-muted-foreground" />
                  <span className="font-mono text-muted-foreground">{subjectProperty.gfa} sqm</span>
                </span>
                {subjectProperty.bedrooms && (
                  <span className="flex items-center gap-1">
                    <Bed className="w-4 h-4 text-muted-foreground" />
                    <span className="font-mono text-muted-foreground">{subjectProperty.bedrooms}</span>
                  </span>
                )}
                {subjectProperty.bathrooms && (
                  <span className="flex items-center gap-1">
                    <Bath className="w-4 h-4 text-muted-foreground" />
                    <span className="font-mono text-muted-foreground">{subjectProperty.bathrooms}</span>
                  </span>
                )}
              </div>
              <div>
                {subjectProperty.year_built && (
                  <>
                    <div className="font-mono text-sm text-muted-foreground">
                      {subjectProperty.year_built} • {getAge(subjectProperty.year_built)} years old
                    </div>
                    {subjectProperty.condition && (
                      <div className="font-mono text-xs text-muted-foreground">
                        {subjectProperty.condition} condition
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {subjectProperty.amenities?.slice(0, 3).map(amenity => (
                  <div key={amenity} className="p-1 bg-amber-500/20 rounded">
                    <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">{amenity.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Search Controls & Filters */}
          <div className="lg:col-span-1 space-y-6">
            {/* Search Controls */}
            <div className="bg-card/50 border border-border p-4">
              <div className="flex items-center gap-2 mb-4">
                <Search className="w-4 h-4 text-amber-500" />
                <h3 className="font-mono text-sm text-foreground">SEARCH CONTROLS</h3>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="font-mono text-[10px] text-muted-foreground mb-1 block">MAX DISTANCE (KM)</label>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    step="1"
                    value={searchFilters.maxDistance}
                    onChange={(e) => setSearchFilters(prev => ({ ...prev, maxDistance: parseFloat(e.target.value) }))}
                    className="w-full accent-amber-500"
                  />
                  <div className="font-mono text-xs text-amber-600 dark:text-amber-400 mt-1">{searchFilters.maxDistance} km</div>
                </div>
                
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center justify-between w-full p-2 bg-muted hover:bg-zinc-700 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4" />
                    <span className="font-mono text-sm">FILTERS</span>
                  </div>
                  {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                
                {showFilters && (
                  <div className="space-y-3 p-3 bg-muted/50">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="font-mono text-[9px] text-muted-foreground mb-1 block">MIN PRICE</label>
                        <input
                          type="number"
                          value={searchFilters.minPrice || ''}
                          onChange={(e) => setSearchFilters(prev => ({ ...prev, minPrice: parseInt(e.target.value) || 0 }))}
                          placeholder="0"
                          className="w-full px-2 py-1 bg-card border border-border text-foreground font-mono text-xs focus:outline-none focus:border-amber-500/50"
                        />
                      </div>
                      <div>
                        <label className="font-mono text-[9px] text-muted-foreground mb-1 block">MAX PRICE</label>
                        <input
                          type="number"
                          value={searchFilters.maxPrice < 10000000 ? searchFilters.maxPrice : ''}
                          onChange={(e) => setSearchFilters(prev => ({ ...prev, maxPrice: parseInt(e.target.value) || 10000000 }))}
                          placeholder="10000000"
                          className="w-full px-2 py-1 bg-card border border-border text-foreground font-mono text-xs focus:outline-none focus:border-amber-500/50"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="font-mono text-[9px] text-muted-foreground mb-1 block">MIN SIZE (sqm)</label>
                        <input
                          type="number"
                          value={searchFilters.minGfa || ''}
                          onChange={(e) => setSearchFilters(prev => ({ ...prev, minGfa: parseInt(e.target.value) || 0 }))}
                          placeholder="0"
                          className="w-full px-2 py-1 bg-card border border-border text-foreground font-mono text-xs focus:outline-none focus:border-amber-500/50"
                        />
                      </div>
                      <div>
                        <label className="font-mono text-[9px] text-muted-foreground mb-1 block">MAX SIZE (sqm)</label>
                        <input
                          type="number"
                          value={searchFilters.maxGfa < 2000 ? searchFilters.maxGfa : ''}
                          onChange={(e) => setSearchFilters(prev => ({ ...prev, maxGfa: parseInt(e.target.value) || 2000 }))}
                          placeholder="2000"
                          className="w-full px-2 py-1 bg-card border border-border text-foreground font-mono text-xs focus:outline-none focus:border-amber-500/50"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="font-mono text-[9px] text-muted-foreground mb-1 block">MAX AGE (months)</label>
                      <select
                        value={searchFilters.maxAgeMonths}
                        onChange={(e) => setSearchFilters(prev => ({ ...prev, maxAgeMonths: parseInt(e.target.value) }))}
                        className="w-full px-2 py-1 bg-card border border-border text-foreground font-mono text-xs focus:outline-none focus:border-amber-500/50"
                      >
                        <option value={6}>6 months</option>
                        <option value={12}>12 months</option>
                        <option value={18}>18 months</option>
                        <option value={24}>24 months (recommended)</option>
                        <option value={36}>36 months</option>
                      </select>
                    </div>
                  </div>
                )}

                <button
                  onClick={runSearch}
                  disabled={searching}
                  className="flex items-center justify-center gap-2 w-full p-2 bg-zinc-700 hover:bg-zinc-600 transition-colors disabled:opacity-50"
                >
                  {searching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  <span className="font-mono text-sm">REFRESH</span>
                </button>
              </div>
            </div>

            {/* Add New Comparable */}
            <div className="bg-card/50 border border-border p-4">
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="flex items-center gap-2 w-full p-2 bg-emerald-600 hover:bg-emerald-500 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span className="font-mono text-sm">ADD NEW COMPARABLE</span>
              </button>
              
              <p className="font-mono text-[10px] text-muted-foreground mt-2">
                Know of a recent sale? Submit it to improve analysis accuracy.
              </p>
            </div>

            {/* Results Summary */}
            <div className="bg-card/50 border border-border p-4">
              <div className="flex items-center gap-2 mb-2">
                <Info className="w-4 h-4 text-blue-500" />
                <h3 className="font-mono text-sm text-foreground">RESULTS</h3>
              </div>
              <div className="font-mono text-lg text-amber-600 dark:text-amber-400">{searchResults.length}</div>
              <div className="font-mono text-[10px] text-muted-foreground">comparable properties shown</div>
            </div>
          </div>

          {/* Results Grid */}
          <div className="lg:col-span-3">
            {/* Quick Stats from Backend */}
            {searchMeta?.aggregates && searchResults.length > 0 && (
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-card/50 border border-border p-4">
                  <div className="font-mono text-sm text-muted-foreground">MEDIAN PRICE</div>
                  <div className="font-mono text-lg text-foreground">
                    {formatCurrency(searchMeta.aggregates.avgPrice)}
                  </div>
                </div>
                <div className="bg-card/50 border border-border p-4">
                  <div className="font-mono text-sm text-muted-foreground">MEDIAN ₵/SQM</div>
                  <div className="font-mono text-lg text-foreground">
                    {formatCurrency(searchMeta.aggregates.avgPricePerSqm)}
                  </div>
                </div>
                <div className="bg-card/50 border border-border p-4">
                  <div className="font-mono text-sm text-muted-foreground">AVG DISTANCE</div>
                  <div className="font-mono text-lg text-foreground">
                    {searchMeta.aggregates.avgDistance}km
                  </div>
                </div>
                <div className="bg-card/50 border border-border p-4">
                  <div className="font-mono text-sm text-muted-foreground">AVG SIMILARITY</div>
                  <div className="font-mono text-lg text-foreground">
                    {searchMeta.aggregates.avgSimilarity}%
                  </div>
                </div>
              </div>
            )}

            {/* Currency Conversion Info */}
            {searchMeta?.currencyConversion && searchMeta.currencyConversion.usdCount > 0 && (
              <div className="flex items-center gap-3 mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded">
                <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-mono text-[11px] text-blue-600 dark:text-blue-300">
                  {searchMeta.currencyConversion.usdCount} USD listings converted to GHS @ {parseFloat(String(searchMeta.currencyConversion.fxRateUsed || '0')).toFixed(2)} rate
                </span>
              </div>
            )}

            {/* Comparable Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {searching && searchResults.length === 0 ? (
                <div className="col-span-2 flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                </div>
              ) : searchResults.length === 0 ? (
                <div className="col-span-2 text-center py-12 bg-card/50 border border-border rounded-lg">
                  <Search className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                  <div className="font-mono text-sm text-muted-foreground mb-1">No comparable properties found</div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    Try adjusting your search filters or add a new comparable property
                  </div>
                </div>
              ) : (
                searchResults.map((result, index) => (
                  <div
                    key={result.id}
                    className={cn(
                      'bg-card/50 border p-4 cursor-pointer transition-all rounded-lg',
                      selectedComparables.includes(result.id)
                        ? 'border-amber-500 bg-amber-500/5 shadow-lg shadow-amber-500/10'
                        : 'border-border hover:border-border hover:bg-card/70'
                    )}
                    onClick={() => toggleComparable(result.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        {/* Property Number Badge */}
                        <div className="flex items-center gap-3 mb-3">
                          <div className="flex items-center justify-center w-6 h-6 bg-amber-500/20 text-amber-600 dark:text-amber-400 font-mono text-xs rounded">
                            {index + 1}
                          </div>
                          <div className="font-mono text-xs text-muted-foreground">COMPARABLE PROPERTY</div>
                        </div>

                        {/* Header */}
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <div className="font-mono text-sm text-foreground font-semibold">
                              {result.address_street || result.title || 'Unknown Address'}
                            </div>
                            <div className="font-mono text-xs text-muted-foreground">
                              {result.address_city || result.neighborhood}, {result.region}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono text-lg text-amber-600 dark:text-amber-400 font-bold">
                              {formatCurrency(result.sale_price)}
                            </div>
                            {result.price_currency === 'USD' && result.price_original && (
                              <div className="font-mono text-[10px] text-muted-foreground">
                                (${result.price_original?.toLocaleString()} USD)
                              </div>
                            )}
                            <div className="font-mono text-xs text-muted-foreground">
                              {result.gfa ? formatCurrency(result.sale_price / result.gfa) + '/sqm' : ''}
                            </div>
                          </div>
                        </div>

                        {/* Details Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                          <div>
                            <div className="font-mono text-[9px] text-muted-foreground mb-1">PHYSICAL</div>
                            <div className="space-y-1">
                              {result.gfa && (
                                <div className="flex items-center gap-1">
                                  <Ruler className="w-3 h-3 text-muted-foreground" />
                                  <span className="font-mono text-xs text-muted-foreground">{result.gfa} sqm</span>
                                </div>
                              )}
                              <div className="flex items-center gap-3">
                                {result.bedrooms && (
                                  <span className="flex items-center gap-1">
                                    <Bed className="w-3 h-3 text-muted-foreground" />
                                    <span className="font-mono text-xs text-muted-foreground">{result.bedrooms}br</span>
                                  </span>
                                )}
                                {result.bathrooms && (
                                  <span className="flex items-center gap-1">
                                    <Bath className="w-3 h-3 text-muted-foreground" />
                                    <span className="font-mono text-xs text-muted-foreground">{result.bathrooms}ba</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          <div>
                            <div className="font-mono text-[9px] text-muted-foreground mb-1">TRANSACTION</div>
                            <div className="font-mono text-xs text-muted-foreground">
                              {result.sale_date ? new Date(result.sale_date).toLocaleDateString('en-GB') : 'N/A'}
                            </div>
                            <div className={cn(
                              'inline-block px-1.5 py-0.5 text-[8px] font-mono rounded',
                              result.data_source === 'contribution'
                                ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                                : 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                            )}>
                              {result.data_source === 'contribution' ? 'VERIFIED' : 'SALE'}
                            </div>
                          </div>

                          <div>
                            <div className="font-mono text-[9px] text-muted-foreground mb-1">QUALITY</div>
                            <div className="font-mono text-xs text-muted-foreground">
                              {result.condition || 'good'}
                            </div>
                            {result.year_built && (
                              <div className="font-mono text-[10px] text-muted-foreground">
                                Built {result.year_built} ({getAge(result.year_built)}yr old)
                              </div>
                            )}
                          </div>

                          <div>
                            <div className="font-mono text-[9px] text-muted-foreground mb-1">LOCATION</div>
                            <div className="font-mono text-xs text-muted-foreground">{result.distance_km.toFixed(1)}km away</div>
                            <div className="font-mono text-[10px] text-muted-foreground">
                              {result.similarity_score}% similar
                            </div>
                          </div>
                        </div>

                        {/* Amenities */}
                        {result.amenities && result.amenities.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {result.amenities.slice(0, 4).map((amenity, i) => (
                              <div key={i} className="px-1.5 py-0.5 bg-zinc-700/50 rounded">
                                <span className="text-[8px] font-mono text-muted-foreground">
                                  {typeof amenity === 'string' ? amenity.toUpperCase() : ''}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Selection Indicator */}
                      <div className={cn(
                        'flex items-center justify-center w-8 h-8 border-2 rounded-full ml-4',
                        selectedComparables.includes(result.id)
                          ? 'bg-amber-500 border-amber-500 text-foreground'
                          : 'border-zinc-600 text-transparent'
                      )}>
                        <Check className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add New Comparable Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-mono text-xl text-foreground">ADD NEW COMPARABLE</h2>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="p-2 hover:bg-muted transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <ComprehensivePropertyForm
                data={newComparable}
                onChange={setNewComparable}
                mode="comparable"
                showTransactionFields={true}
                showLocationFields={true}
              />

              <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-border">
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-6 py-3 bg-muted text-muted-foreground font-mono text-sm hover:text-foreground transition-colors"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleSubmitComparable}
                  disabled={submitting || !newComparable.address || !newComparable.city || !newComparable.sale_price}
                  className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-foreground font-mono text-sm font-bold hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      SUBMITTING...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      SUBMIT COMPARABLE
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ComparablesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
          <span className="font-mono text-sm text-muted-foreground">Loading comparables...</span>
        </div>
      </div>
    }>
      <ComparablesPageContent />
    </Suspense>
  )
}
