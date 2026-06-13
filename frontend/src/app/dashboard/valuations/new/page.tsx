'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import {
  TerminalPanel,
  PropertyTypeBadge,
  AlertBanner,
} from '@/components/ui/terminal'
import { valuationsApi } from '@/lib/valuation-api'
import type { Property, ValuationPurpose } from '@/types/valuation'
import ComprehensivePropertyForm from '@/components/forms/ComprehensivePropertyForm'
import { type ComprehensivePropertyData } from '@/types/comprehensiveProperty'
import {
  ArrowLeft,
  Search,
  Loader2,
  Home,
  Building2,
  Factory,
  MapPin,
  Layers,
  ChevronRight,
  Plus,
  CheckCircle,
  Circle,
  FileText,
  BarChart3,
  Lightbulb,
  Calculator,
  Scale,
  ClipboardCheck,
} from 'lucide-react'

// Property type options
const propertyTypes = [
  { value: 'residential', label: 'Residential', icon: Home, description: 'Houses, apartments, villas' },
  { value: 'commercial', label: 'Commercial', icon: Building2, description: 'Offices, retail, hotels' },
  { value: 'industrial', label: 'Industrial', icon: Factory, description: 'Warehouses, factories' },
  { value: 'land', label: 'Land', icon: MapPin, description: 'Vacant land, plots' },
  { value: 'mixed_use', label: 'Mixed Use', icon: Layers, description: 'Multi-purpose buildings' },
]

// Valuation purpose options  
const valuationPurposes: { value: ValuationPurpose; label: string; description: string }[] = [
  { value: 'sale', label: 'Market Value', description: 'Fair market value for sale/purchase' },
  { value: 'mortgage', label: 'Mortgage', description: 'Lending/collateral valuation' },
  { value: 'insurance', label: 'Insurance', description: 'Replacement cost for insurance' },
  { value: 'tax', label: 'Tax Assessment', description: 'Property tax basis valuation' },
  { value: 'investment', label: 'Investment', description: 'Investment analysis & returns' },
  { value: 'development', label: 'Development', description: 'Development feasibility analysis' },
]

const regions = [
  { value: 'greater_accra', label: 'Greater Accra' },
  { value: 'ashanti', label: 'Ashanti' },
  { value: 'western', label: 'Western' },
  { value: 'eastern', label: 'Eastern' },
  { value: 'central', label: 'Central' },
  { value: 'volta', label: 'Volta' },
  { value: 'northern', label: 'Northern' },
  { value: 'upper_east', label: 'Upper East' },
  { value: 'upper_west', label: 'Upper West' },
  { value: 'brong_ahafo', label: 'Brong Ahafo' },
]

export default function NewValuationPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialPropertyId = searchParams?.get('property_id')

  // Form state
  const [step, setStep] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)
  const [createNewProperty, setCreateNewProperty] = useState(false)
  const [valuationPurpose, setValuationPurpose] = useState<ValuationPurpose>('sale')

  // New property form - comprehensive data
  const [newProperty, setNewProperty] = useState<Partial<ComprehensivePropertyData>>({})

  // Search state
  const [properties, setProperties] = useState<Property[]>([])
  const [searching, setSearching] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingInitial, setLoadingInitial] = useState(false)

  // Load initial property if ID provided
  useEffect(() => {
    if (!initialPropertyId) return

    async function loadProperty() {
      try {
        setLoadingInitial(true)
        // Correct endpoint for single property (added in backend/routes/publicProperties.ts)
        const response = await fetch(`/api/properties/${initialPropertyId}`)
        if (!response.ok) throw new Error('Property not found')

        const data = await response.json()
        if (data.data) {
          setSelectedProperty(data.data)
          // Stay on step 1 — user still needs to select valuation purpose
        }
      } catch (err) {
        console.error('Failed to load initial property:', err)
        setError('Failed to load pre-selected property')
      } finally {
        setLoadingInitial(false)
      }
    }

    loadProperty()
  }, [initialPropertyId])

  // Search for existing properties
  useEffect(() => {
    async function searchProperties() {
      if (searchQuery.length < 2) {
        setProperties([])
        return
      }

      try {
        setSearching(true)
        // Use properties endpoint with search (Next.js rewrites /api/* to /api/v1/*)
        const response = await fetch(
          `/api/properties?search=${encodeURIComponent(searchQuery)}&limit=10`
        )
        const data = await response.json()
        if (data.data) {
          setProperties(data.data)
        }
      } catch (err) {
        console.error('Search error:', err)
      } finally {
        setSearching(false)
      }
    }

    const timer = setTimeout(searchProperties, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  if (loadingInitial) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    )
  }

  // Create valuation
  const handleCreateValuation = async () => {
    try {
      setCreating(true)
      setError(null)

      // Validate property selection
      if (!selectedProperty && !createNewProperty) {
        throw new Error('Please select a property or create a new one')
      }

      let valuationResponse;

      // If creating new property, create it along with valuation
      if (createNewProperty && !selectedProperty) {
        if (!newProperty.address || !newProperty.city) {
          throw new Error('Please fill in address and city for the new property')
        }

        // Map comprehensive property data to API format
        const propertyData = {
          address: newProperty.address,
          address_street: newProperty.address,
          address_city: newProperty.city,
          address_district: null,
          region: newProperty.region || 'greater_accra',
          digital_address: newProperty.digital_address || null,
          property_type: newProperty.property_type || 'house',
          bedrooms: newProperty.bedrooms || null,
          bathrooms: newProperty.bathrooms || null,
          plot_size: newProperty.plot_size || null,
          land_area_sqm: newProperty.land_area || null,
          built_area_sqm: newProperty.gfa || null,
          year_built: newProperty.year_built || null,
          total_floors: newProperty.total_floors || null,
          parking_spaces: newProperty.parking_spaces || null,
          owner_name: newProperty.owner_name || null,
          owner_email: newProperty.owner_email || null,
          owner_phone: newProperty.owner_phone || null,
          owner_address: newProperty.owner_address || null,
          owner_contact_preference: newProperty.owner_contact_preference || null,
          // Store comprehensive data in metadata
          comprehensive_data: newProperty
        }

        console.log('Creating new property with data:', newProperty);

        // Create valuation with new subject property
        valuationResponse = await valuationsApi.createWithNewProperty({
          property: propertyData,
          valuation_type: 'professional',
          valuation_purpose: valuationPurpose,
          valuation_date: newProperty.valuation_date || null,
          inspection_date: newProperty.inspection_date || null,
          instruction_date: newProperty.instruction_date || null,
          report_date: newProperty.report_date || null,
          is_retrospective: newProperty.is_retrospective || false,
        });

        console.log('Valuation response:', valuationResponse);
      } else {
        if (!selectedProperty?.id) {
          throw new Error('Please select a property')
        }

        // Create the valuation with selected property
        valuationResponse = await valuationsApi.create({
          property_id: selectedProperty.id,
          valuation_type: 'professional',
          valuation_purpose: valuationPurpose,
        })
      }

      if (!valuationResponse.data) {
        throw new Error('Failed to create valuation')
      }

      // Navigate to the valuation workflow — skip property setup (already filled), go to floor plan
      router.push(`/dashboard/valuations/${valuationResponse.data.id}/floor-plan`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create valuation')
    } finally {
      setCreating(false)
    }
  }

  // All 16 Ghana administrative regions for dropdown
  const regions = [
    // Greater Accra cluster
    { value: 'greater_accra', label: 'Greater Accra' },
    // Ashanti/Kumasi Metro cluster
    { value: 'ashanti', label: 'Ashanti' },
    { value: 'bono', label: 'Bono' },
    { value: 'bono_east', label: 'Bono East' },
    { value: 'ahafo', label: 'Ahafo' },
    // Eastern cluster
    { value: 'eastern', label: 'Eastern' },
    { value: 'volta', label: 'Volta' },
    { value: 'oti', label: 'Oti' },
    // Western cluster
    { value: 'western', label: 'Western' },
    { value: 'western_north', label: 'Western North' },
    { value: 'central', label: 'Central' },
    // Northern cluster
    { value: 'northern', label: 'Northern' },
    { value: 'north_east', label: 'North East' },
    { value: 'savannah', label: 'Savannah' },
    { value: 'upper_east', label: 'Upper East' },
    { value: 'upper_west', label: 'Upper West' },
  ]

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pb-10">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/valuations" className="p-2 hover:bg-muted transition-colors">
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </Link>
        <div>
          <h1 className="font-mono text-xl text-foreground">NEW VALUATION</h1>
          <p className="font-mono text-[10px] text-muted-foreground">Create a new property valuation assessment</p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <AlertBanner type="error" title="Error" message={error} />
      )}

      {/* Step Indicators */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => setStep(1)}
          className={`flex items-center gap-2 px-4 py-2 font-mono text-xs transition-colors ${step === 1 ? 'bg-amber-500 text-foreground font-bold' :
            step > 1 ? 'bg-muted text-emerald-600 dark:text-emerald-400 hover:text-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
        >
          {step > 1 ? <CheckCircle className="w-3 h-3" /> : null}
          1. SELECT PROPERTY
        </button>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
        <button
          onClick={() => (selectedProperty || createNewProperty) && valuationPurpose ? setStep(2) : null}
          disabled={(!selectedProperty && !createNewProperty) || !valuationPurpose}
          className={`flex items-center gap-2 px-4 py-2 font-mono text-xs transition-colors ${step === 2 ? 'bg-amber-500 text-foreground font-bold' :
            (selectedProperty || createNewProperty) && valuationPurpose ? 'bg-muted text-muted-foreground hover:text-foreground' :
              'bg-card text-muted-foreground cursor-not-allowed'
            }`}
        >
          2. REVIEW & START
        </button>
      </div>

      {/* Step 1: Property Selection */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Search Existing Property */}
          <TerminalPanel title="SEARCH EXISTING PROPERTY">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCreateNewProperty(false)
                }}
                placeholder="Search by address, title, or reference..."
                className="w-full pl-10 pr-4 py-3 bg-card border border-border text-foreground font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500 animate-spin" />
              )}
            </div>

            {/* Search Results */}
            {properties.length > 0 && (
              <div className="mt-4 space-y-2">
                {properties.map((property) => (
                  <button
                    key={property.id}
                    onClick={() => {
                      setSelectedProperty(property)
                      setCreateNewProperty(false)
                    }}
                    className={`w-full p-4 text-left border transition-colors ${selectedProperty?.id === property.id
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-border bg-card/50 hover:border-border'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-mono text-sm text-foreground">
                          {property.title || property.address_street}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {property.address_city}, {property.region}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <PropertyTypeBadge type={property.property_type} />
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {searchQuery.length >= 2 && properties.length === 0 && !searching && (
              <div className="mt-4 p-4 text-center text-muted-foreground font-mono text-xs">
                No properties found matching &quot;{searchQuery}&quot;
              </div>
            )}
          </TerminalPanel>

          {/* Or Create New Property */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-muted" />
            <span className="font-mono text-[10px] text-muted-foreground">OR CREATE NEW</span>
            <div className="flex-1 h-px bg-muted" />
          </div>

          <TerminalPanel title="CREATE NEW PROPERTY">
            <button
              onClick={() => {
                setCreateNewProperty(true)
                setSelectedProperty(null)
              }}
              className={`w-full p-4 border transition-colors flex items-center justify-center gap-2 ${createNewProperty
                ? 'border-amber-500 bg-amber-500/10'
                : 'border-border bg-card/50 hover:border-border'
                }`}
            >
              <Plus className="w-4 h-4" />
              <span className="font-mono text-sm">ADD NEW PROPERTY</span>
            </button>

            {createNewProperty && (
              <div className="mt-4 space-y-4">
                {/* Comprehensive Property Form - includes Purpose of Valuation */}
                <ComprehensivePropertyForm
                  data={newProperty}
                  onChange={(data) => {
                    setNewProperty(data)
                    // Sync purpose from form to local state
                    if (data.valuation_purpose) {
                      setValuationPurpose(data.valuation_purpose as ValuationPurpose)
                    }
                  }}
                  mode="subject"
                  showLocationFields={true}
                  showTransactionFields={false}
                />

                <button
                  onClick={() => {
                    if (newProperty.address && newProperty.city && (newProperty.valuation_purpose || valuationPurpose)) {
                      setStep(2)
                    }
                  }}
                  disabled={!newProperty.address || !newProperty.city || (!newProperty.valuation_purpose && !valuationPurpose)}
                  className="w-full py-3 bg-amber-500 text-foreground font-mono text-sm font-bold hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  REVIEW WORKFLOW
                </button>
              </div>
            )}
          </TerminalPanel>

          {/* Purpose selection for existing properties */}
          {selectedProperty && (
            <TerminalPanel title="SELECT VALUATION PURPOSE">
              <div className="grid grid-cols-3 gap-4">
                {valuationPurposes.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => setValuationPurpose(type.value)}
                    className={`p-4 border text-left transition-colors ${valuationPurpose === type.value
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-border hover:border-border'
                      }`}
                  >
                    <div className={`font-mono text-sm mb-1 ${valuationPurpose === type.value ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'
                      }`}>
                      {type.label.toUpperCase()}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {type.description}
                    </div>
                  </button>
                ))}
              </div>

              <button
                onClick={() => valuationPurpose ? setStep(2) : null}
                disabled={!valuationPurpose}
                className="w-full mt-4 py-3 bg-amber-500 text-foreground font-mono text-sm font-bold hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                REVIEW WORKFLOW
                <ChevronRight className="w-4 h-4" />
              </button>
            </TerminalPanel>
          )}
        </div>
      )}

      {/* Step 2: Review & Start Workflow */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Summary */}
          <TerminalPanel title="VALUATION SUMMARY">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="font-mono text-[10px] text-muted-foreground mb-1">PROPERTY</div>
                <div className="font-mono text-sm text-foreground">
                  {selectedProperty?.title || selectedProperty?.address_street || newProperty.address}
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  {selectedProperty?.address_city || newProperty.city}, {selectedProperty?.region || newProperty.region}
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-muted-foreground mb-1">PURPOSE</div>
                <div className="font-mono text-sm text-amber-600 dark:text-amber-400">
                  {valuationPurposes.find(p => p.value === valuationPurpose)?.label?.toUpperCase() || valuationPurpose.toUpperCase()}
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  {valuationPurposes.find(p => p.value === valuationPurpose)?.description}
                </div>
              </div>
            </div>
          </TerminalPanel>

          {/* Workflow Steps Preview */}
          <TerminalPanel title="VALUATION WORKFLOW">
            <div className="font-mono text-[10px] text-muted-foreground mb-4">
              Your valuation will follow this RICS-aligned workflow. Each step must be completed before proceeding.
            </div>
            <div className="space-y-3">
              {[
                { icon: Home, label: 'Property Setup', desc: 'Confirm property details, ownership, and site characteristics', step: 1 },
                { icon: Layers, label: 'Floor Plans', desc: 'Create or upload floor plans with room measurements', step: 2 },
                { icon: Lightbulb, label: 'Highest & Best Use Analysis', desc: 'Determine the optimal use of the property (legally permissible, physically possible, financially feasible, maximally productive)', step: 3 },
                { icon: Calculator, label: 'Method Selection', desc: 'Select appropriate valuation methods based on property type and purpose', step: 4 },
                { icon: BarChart3, label: 'Valuation Methods', desc: 'Apply selected methods — market comparison, cost, income, DRC, profits, or residual approach', step: 5 },
                { icon: Scale, label: 'Reconciliation', desc: 'Reconcile method results and determine final market value', step: 6 },
                { icon: FileText, label: 'Report Generation', desc: 'Generate RICS-compliant professional valuation report', step: 7 },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-3 border border-border bg-card/50">
                  <div className="flex items-center gap-2 min-w-[28px]">
                    <span className="font-mono text-xs text-muted-foreground">{item.step}.</span>
                  </div>
                  <item.icon className="w-4 h-4 text-amber-500/60 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-mono text-sm text-foreground">{item.label.toUpperCase()}</div>
                    <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </TerminalPanel>

          {/* Start Button */}
          <div className="flex gap-4">
            <button
              onClick={() => setStep(1)}
              className="px-6 py-3 bg-muted text-muted-foreground font-mono text-sm hover:text-foreground transition-colors"
            >
              ← BACK
            </button>
            <button
              onClick={handleCreateValuation}
              disabled={creating}
              className="flex-1 py-3 bg-amber-500 text-foreground font-mono text-sm font-bold hover:bg-amber-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  CREATING VALUATION...
                </>
              ) : (
                <>
                  START VALUATION WORKFLOW
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
