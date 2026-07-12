'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import {
  TerminalPanel,
  PropertyTypeBadge,
  AlertBanner,
} from '@/components/ui/terminal'
import { valuationsApi } from '@/lib/valuation-api'
import { fetchApi } from '@/lib/api'
import type { Property, ValuationPurpose } from '@/types/valuation'
import ComprehensivePropertyForm from '@/components/forms/ComprehensivePropertyForm'
import { type ComprehensivePropertyData } from '@/types/comprehensiveProperty'
import { buildPropertyUpdatePayload } from '@/lib/valuationPropertyPayload'
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
  const initialClientId = searchParams?.get('client_id')

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

  // Pre-fill the Instructing Client when arriving from a saved client (Clients tab → "New Valuation").
  useEffect(() => {
    if (!initialClientId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetchApi<any>(`/valuation-clients/${initialClientId}`)
        const c = res?.client || res?.data || res
        if (!cancelled && c?.id) {
          setNewProperty(prev => ({
            ...prev,
            client_id: c.id,
            client_name: c.name || prev.client_name,
            client_company: c.company_name || (prev as any).client_company,
            client_email: c.email || prev.client_email,
            client_phone: c.phone || prev.client_phone,
            client_address: c.address || prev.client_address,
          } as any))
        }
      } catch { /* non-fatal — the valuer can still fill the client manually */ }
    })()
    return () => { cancelled = true }
  }, [initialClientId])

  // ── Auto-create draft + auto-save ────────────────────────────────────────────
  // The valuer fills the ENTIRE subject form here. Two things depend on a real valuation
  // existing: (a) the inline "Generate with AI" writeup buttons (they call
  // /valuations/{id}/ai/writeup) and (b) never losing work. So we create a DRAFT valuation
  // the moment there's enough to create (address + city), then auto-save every change to it.
  // sessionStorage bridges the pre-draft window AND remembers the draft id so returning to
  // /new resumes the SAME draft instead of spawning duplicates.
  const DRAFT_KEY = 'pm:valuation-new-draft'
  const [draftIds, setDraftIds] = useState<{ valuationId: string; propertyId: string } | null>(null)
  const [draftNonce, setDraftNonce] = useState(0) // bumped to re-arm draft creation after a stale draft is discarded
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const draftIdsRef = useRef<{ valuationId: string; propertyId: string } | null>(null)
  const creatingDraftRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftSkipFirstSave = useRef(true)

  // Restore an in-progress draft (form data + draft ids) once, on mount.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const d = JSON.parse(raw)
      if (d.newProperty && Object.keys(d.newProperty).length) setNewProperty(d.newProperty)
      if (d.valuationPurpose) setValuationPurpose(d.valuationPurpose)
      if (typeof d.createNewProperty === 'boolean') setCreateNewProperty(d.createNewProperty)
      if (typeof d.step === 'number') setStep(d.step)
      if (d.draftIds?.valuationId && d.draftIds?.propertyId) {
        setDraftIds(d.draftIds)
        draftIdsRef.current = d.draftIds
        creatingDraftRef.current = true // a draft already exists — never create a second
        // The stored draft may have been deleted from the terminal since (draft valuations
        // get cleaned up). Verify it still exists; if not, forget it and re-arm creation —
        // otherwise every auto-save and "Generate with AI" call 404s against a ghost id.
        ;(async () => {
          const res = await valuationsApi.getById(d.draftIds.valuationId)
          if (res.error || !(res.data as any)?.id) {
            draftIdsRef.current = null
            creatingDraftRef.current = false
            setDraftIds(null)
            setDraftNonce((n) => n + 1)
          }
        })()
      }
    } catch { /* corrupt draft — ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist form + draft ids so leaving /new never loses work (skips the initial mount fire
  // so a restore can't be clobbered by an empty first write).
  useEffect(() => {
    if (draftSkipFirstSave.current) { draftSkipFirstSave.current = false; return }
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ newProperty, valuationPurpose, createNewProperty, step, draftIds }))
    } catch { /* quota / serialisation — non-fatal */ }
  }, [newProperty, valuationPurpose, createNewProperty, step, draftIds])

  // Create the draft valuation IMMEDIATELY (not debounced) the instant address+city both
  // exist. This is deliberately NOT inside the auto-save debounce: the debounce timer resets
  // on every keystroke, so a valuer filling the form in one continuous flow would never pause
  // long enough to trigger creation — leaving `valuationId` unset and every inline
  // "Generate with AI" writeup button (which gates on valuationId) grayed out the whole time.
  // Firing on the address+city fields directly makes the draft — and thus the AI buttons —
  // available as soon as the property is identifiable. Refs gate creation (set synchronously
  // before the await) so a rapid address→city change, or React StrictMode's double-invoke,
  // can't spawn a duplicate valuation.
  useEffect(() => {
    if (!createNewProperty) return
    if (draftIdsRef.current || creatingDraftRef.current) return
    const np = newProperty
    if (!np.address || !np.city) return // not enough to identify a property yet
    creatingDraftRef.current = true
    setAutoSaveStatus('saving')
    ;(async () => {
      try {
        const res = await valuationsApi.createWithNewProperty({
          property: {
            address: np.address,
            address_street: np.address,
            address_city: np.city,
            region: np.region || 'greater_accra',
            digital_address: np.digital_address || null,
            property_type: np.property_type || 'house',
            comprehensive_data: np,
          },
          valuation_type: 'professional',
          valuation_purpose: (np.valuation_purpose as ValuationPurpose) || valuationPurpose,
          client_id: (np as any).client_id || initialClientId || undefined,
        })
        const v: any = res.data
        if (v?.id && v?.property_id) {
          const ids = { valuationId: v.id, propertyId: v.property_id }
          draftIdsRef.current = ids
          setDraftIds(ids)
          setAutoSaveStatus('saved')
        } else {
          creatingDraftRef.current = false // incomplete response — allow retry
          setAutoSaveStatus('error')
        }
      } catch {
        creatingDraftRef.current = false // allow retry on the next address/city change
        setAutoSaveStatus('error')
      }
    })()
    // Depend on the address/city fields directly (not the whole object) so creation is not
    // starved by continuous edits to other fields. draftNonce re-arms creation after a
    // restored-but-deleted draft is discarded.
  }, [createNewProperty, newProperty.address, newProperty.city, valuationPurpose, initialClientId, draftNonce])

  // Debounced auto-save of every subsequent edit to the SAME draft (creation is handled above).
  // Uses the SAME endpoint [id]/subject uses (PUT /properties/{id}) with the SAME payload
  // builder, so the two screens round-trip identically. No-ops until the draft exists.
  useEffect(() => {
    if (!createNewProperty || !draftIdsRef.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      if (!draftIdsRef.current) return
      try {
        setAutoSaveStatus('saving')
        await fetchApi(`/properties/${draftIdsRef.current.propertyId}`, { method: 'PUT', body: JSON.stringify(buildPropertyUpdatePayload(newProperty)) })
        setAutoSaveStatus('saved')
      } catch {
        setAutoSaveStatus('error')
      }
    }, 900)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [newProperty, createNewProperty])

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

      // A draft valuation was already auto-created + auto-saved as the valuer typed.
      // Don't create a second one — flush the latest snapshot and continue to Documents.
      if (draftIds) {
        try { await fetchApi(`/properties/${draftIds.propertyId}`, { method: 'PUT', body: JSON.stringify(buildPropertyUpdatePayload(newProperty)) }) } catch { /* best-effort */ }
        try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* non-fatal */ }
        router.push(`/dashboard/valuations/${draftIds.valuationId}/documents`)
        return
      }

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
          // Link the saved client (backend auto-populates the engagement from the client registry).
          client_id: (newProperty as any).client_id || initialClientId || undefined,
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
          client_id: (newProperty as any).client_id || initialClientId || undefined,
        })
      }

      if (!valuationResponse.data) {
        throw new Error('Failed to create valuation')
      }

      // Draft is now persisted server-side under the created valuation — drop the local draft.
      try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* non-fatal */ }

      // Navigate to the valuation workflow — Subject is filled; next is Documents & Photos, then Floor Plan
      router.push(`/dashboard/valuations/${valuationResponse.data.id}/documents`)
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
                {createNewProperty && autoSaveStatus !== 'idle' && (
                  <div className={`text-[10px] font-mono ${autoSaveStatus === 'error' ? 'text-red-500' : autoSaveStatus === 'saving' ? 'text-muted-foreground' : 'text-emerald-600'}`}>
                    {autoSaveStatus === 'saving' ? 'Saving draft…'
                      : autoSaveStatus === 'saved' ? '✓ Draft saved automatically'
                      : 'Auto-save failed — will retry on your next edit'}
                  </div>
                )}
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
                  // Once the draft valuation exists (after address+city), the inline writeup
                  // "Generate with AI" buttons light up and work against it.
                  valuationId={draftIds?.valuationId}
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
