'use client'

import { useRouter } from 'next/navigation'
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

  // Search for existing properties
  useEffect(() => {
    async function searchProperties() {
      if (searchQuery.length < 2) {
        setProperties([])
        return
      }

      try {
        setSearching(true)
        // Use public properties endpoint with search
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/public/properties?search=${encodeURIComponent(searchQuery)}&limit=10`
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
          // Store comprehensive data in metadata
          comprehensive_data: newProperty
        }

        console.log('Creating new property with data:', newProperty);

        // Create valuation with new subject property
        valuationResponse = await valuationsApi.createWithNewProperty({
          property: propertyData,
          valuation_type: 'professional',
          valuation_purpose: valuationPurpose,
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

      // Navigate to the valuation workflow
      router.push(`/dashboard/valuations/${valuationResponse.data.id}/property`)
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
    <div className="min-h-screen bg-black text-white p-4 pb-10">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/valuations" className="p-2 hover:bg-zinc-800 transition-colors">
          <ArrowLeft className="w-4 h-4 text-zinc-400" />
        </Link>
        <div>
          <h1 className="font-mono text-xl text-white">NEW VALUATION</h1>
          <p className="font-mono text-[10px] text-zinc-500">Create a new property valuation assessment</p>
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
          className={`flex items-center gap-2 px-4 py-2 font-mono text-xs transition-colors ${
            step === 1 ? 'bg-amber-500 text-black font-bold' : 'bg-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          1. SELECT PROPERTY
        </button>
        <ChevronRight className="w-4 h-4 text-zinc-600" />
        <button
          onClick={() => selectedProperty || createNewProperty ? setStep(2) : null}
          disabled={!selectedProperty && !createNewProperty}
          className={`flex items-center gap-2 px-4 py-2 font-mono text-xs transition-colors ${
            step === 2 ? 'bg-amber-500 text-black font-bold' : 
            (selectedProperty || createNewProperty) ? 'bg-zinc-800 text-zinc-400 hover:text-white' : 
            'bg-zinc-900 text-zinc-600 cursor-not-allowed'
          }`}
        >
          2. VALUATION TYPE
        </button>
        <ChevronRight className="w-4 h-4 text-zinc-600" />
        <button
          disabled
          className="flex items-center gap-2 px-4 py-2 font-mono text-xs bg-zinc-900 text-zinc-600 cursor-not-allowed"
        >
          3. START WORKFLOW
        </button>
      </div>

      {/* Step 1: Property Selection */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Search Existing Property */}
          <TerminalPanel title="SEARCH EXISTING PROPERTY">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCreateNewProperty(false)
                }}
                placeholder="Search by address, title, or reference..."
                className="w-full pl-10 pr-4 py-3 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
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
                      setStep(2)
                    }}
                    className={`w-full p-4 text-left border transition-colors ${
                      selectedProperty?.id === property.id 
                        ? 'border-amber-500 bg-amber-500/10' 
                        : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-mono text-sm text-white">
                          {property.title || property.address_street}
                        </div>
                        <div className="font-mono text-xs text-zinc-500">
                          {property.address_city}, {property.region}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <PropertyTypeBadge type={property.property_type} />
                        <ChevronRight className="w-4 h-4 text-zinc-500" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {searchQuery.length >= 2 && properties.length === 0 && !searching && (
              <div className="mt-4 p-4 text-center text-zinc-500 font-mono text-xs">
                No properties found matching &quot;{searchQuery}&quot;
              </div>
            )}
          </TerminalPanel>

          {/* Or Create New Property */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="font-mono text-[10px] text-zinc-500">OR CREATE NEW</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          <TerminalPanel title="CREATE NEW PROPERTY">
            <button
              onClick={() => {
                setCreateNewProperty(true)
                setSelectedProperty(null)
              }}
              className={`w-full p-4 border transition-colors flex items-center justify-center gap-2 ${
                createNewProperty 
                  ? 'border-amber-500 bg-amber-500/10' 
                  : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span className="font-mono text-sm">ADD NEW PROPERTY</span>
            </button>

            {createNewProperty && (
              <div className="mt-4 space-y-4">
                {/* Comprehensive Property Form */}
                <ComprehensivePropertyForm
                  data={newProperty}
                  onChange={setNewProperty}
                  mode="subject"
                  showLocationFields={true}
                  showTransactionFields={false}
                />

                <button
                  onClick={() => {
                    if (newProperty.address && newProperty.city) {
                      setStep(2)
                    }
                  }}
                  disabled={!newProperty.address || !newProperty.city}
                  className="w-full py-3 bg-amber-500 text-black font-mono text-sm font-bold hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  CONTINUE
                </button>
              </div>
            )}
          </TerminalPanel>
        </div>
      )}

      {/* Step 2: Valuation Type */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Selected Property Summary */}
          <TerminalPanel title="SELECTED PROPERTY">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-sm text-white">
                  {selectedProperty?.title || selectedProperty?.address_street || newProperty.address}
                </div>
                <div className="font-mono text-xs text-zinc-500">
                  {selectedProperty?.address_city || newProperty.city}, {selectedProperty?.region || newProperty.region}
                </div>
              </div>
              <button
                onClick={() => setStep(1)}
                className="font-mono text-xs text-amber-500 hover:text-amber-400"
              >
                CHANGE
              </button>
            </div>
          </TerminalPanel>

          {/* Valuation Type Selection */}
          <TerminalPanel title="SELECT VALUATION PURPOSE">
            <div className="grid grid-cols-3 gap-4">
              {valuationPurposes.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setValuationPurpose(type.value)}
                  className={`p-4 border text-left transition-colors ${
                    valuationPurpose === type.value
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className={`font-mono text-sm mb-1 ${
                    valuationPurpose === type.value ? 'text-amber-400' : 'text-white'
                  }`}>
                    {type.label.toUpperCase()}
                  </div>
                  <div className="font-mono text-[10px] text-zinc-500">
                    {type.description}
                  </div>
                </button>
              ))}
            </div>
          </TerminalPanel>

          {/* Create Button */}
          <div className="flex gap-4">
            <button
              onClick={() => setStep(1)}
              className="px-6 py-3 bg-zinc-800 text-zinc-400 font-mono text-sm hover:text-white transition-colors"
            >
              ← BACK
            </button>
            <button
              onClick={handleCreateValuation}
              disabled={creating}
              className="flex-1 py-3 bg-amber-500 text-black font-mono text-sm font-bold hover:bg-amber-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  CREATING...
                </>
              ) : (
                <>
                  CONTINUE TO PROPERTY SETUP
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
