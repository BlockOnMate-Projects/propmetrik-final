'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import {
  TerminalPanel,
  StatusBadge,
  AlertBanner,
  StepIndicator,
} from '@/components/ui/terminal'
import { valuationsApi } from '@/lib/valuation-api'
import { fetchApi } from '@/lib/api'
import ComprehensivePropertyForm from '@/components/forms/ComprehensivePropertyForm'
import { type ComprehensivePropertyData } from '@/types/comprehensiveProperty'
import type { Valuation } from '@/types/valuation'
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Save,
  Wand2,
  MapPin,
} from 'lucide-react'

interface AreaNarrativeEvidence {
  latitude: number
  longitude: number
  locality: string | null
  district: string | null
  region: string | null
  coordinateSource: string
  places: Array<{ name: string; category: string; distanceMeters?: number }>
}

export default function SubjectPropertyPage() {
  const params = useParams()
  const router = useRouter()
  const valuationId = params.id as string

  const [valuation, setValuation] = useState<Valuation | null>(null)
  const [propertyData, setPropertyData] = useState<Partial<ComprehensivePropertyData>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiEvidence, setAiEvidence] = useState<AreaNarrativeEvidence | null>(null)

  const handleGenerateArea = async () => {
    setAiError(null)
    setAiBusy(true)
    setAiEvidence(null)
    try {
      const res = await fetchApi<{ fields: Record<string, string>; evidence: AreaNarrativeEvidence }>(
        '/valuations/ai/area-narrative',
        {
          method: 'POST',
          body: JSON.stringify({
            latitude: (propertyData as any).latitude ?? null,
            longitude: (propertyData as any).longitude ?? null,
            digitalAddress: propertyData.digital_address || null,
            address: propertyData.address || null,
            city: propertyData.city || null,
            region: propertyData.region || null,
            neighborhoodClass: (propertyData as any).neighborhood_class || null,
            propertyType: propertyData.property_type || null,
          }),
        }
      )
      // Drafts only — merged into the form for the valuer to review/edit before approving.
      setPropertyData(prev => ({
        ...prev,
        city_description: res.fields.city_description || prev.city_description,
        city_details: res.fields.city_details || prev.city_details,
        neighbourhood_description: res.fields.neighbourhood_description || prev.neighbourhood_description,
        neighborhood_details: res.fields.neighborhood_details || prev.neighborhood_details,
        location_description: res.fields.location_description || prev.location_description,
        services_description: res.fields.services_description || prev.services_description,
      }))
      setAiEvidence(res.evidence)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Could not generate area description')
    } finally {
      setAiBusy(false)
    }
  }

  // Fetch valuation and property data
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        setError(null)

        const valuationRes = await valuationsApi.getById(valuationId)
        if (valuationRes.error) throw new Error(valuationRes.error)
        if (!valuationRes.data) throw new Error('Valuation not found')

        const val = valuationRes.data as Valuation
        setValuation(val)

        // Fetch engagement (client) data
        let engagement: any = {}
        try {
          const engRes = await fetchApi<any>(`/valuations/${valuationId}/engagement`)
          if (engRes?.data) engagement = engRes.data
        } catch { /* no engagement yet */ }

        // Map valuation/property data to form fields
        const property: any = val.property || {}
        const metadata: any = property.metadata || {}
        setPropertyData({
          // Purpose of Valuation
          valuation_purpose: (val as any).valuation_purpose || (val as any).purpose || 'sale',
          // Basic info
          address: property.address || property.address_street || '',
          city: property.city || property.address_city || '',
          region: property.region || 'greater_accra',
          digital_address: property.digital_address || property.gps_address || '',
          property_type: property.propertyType || property.property_type || 'house',
          bedrooms: property.bedrooms,
          bathrooms: property.bathrooms,
          total_floors: property.floors || property.total_floors || 1,
          year_built: property.yearBuilt || property.year_built,
          gfa: property.gfa || property.building_area_sqm,
          plot_size: property.plotSize || property.land_area_sqm,
          land_area: property.land_area_sqm,
          quality_rating: property.quality_rating || 'standard',
          condition: property.condition || 'good',
          view_quality: property.view_quality || 'standard',
          neighborhood_rating: property.neighborhood_rating || 'secondary',
          accessibility_rating: property.accessibility_rating || 'good',
          tenure_type: property.tenure_type || property.tenure || 'freehold',
          owner_name: property.owner_name || '',
          owner_email: property.owner_email || '',
          owner_phone: property.owner_phone || '',
          owner_address: property.owner_address || '',
          // Valuation dates
          inspection_date: (val as any).inspection_date || '',
          valuation_date: val.effective_date || '',
          instruction_date: (val as any).instruction_date || '',
          is_retrospective: (val as any).is_retrospective || false,
          // Client info (from engagement record, NOT from property owner)
          client_name: engagement.client_name || '',
          client_address: engagement.client_address || '',
          client_email: engagement.client_email || '',
          client_phone: engagement.client_contact || engagement.client_phone || '',
          request_type: engagement.request_type || 'written',
          // Chapter 3 Report Data (from metadata)
          // City Data
          city_description: metadata.city_description || '',
          city_details: metadata.city_details || '',
          // Neighbourhood Data
          neighbourhood_description: metadata.neighbourhood_description || '',
          neighborhood_class: metadata.neighborhood_class || '',
          resident_income_level: metadata.resident_income_level || '',
          primary_use: metadata.primary_use || '',
          neighborhood_details: metadata.neighborhood_details || '',
          // Location
          location_description: metadata.location_description || '',
          // Brief Description
          brief_description: metadata.brief_description || property.description || '',
          // Grounds and External Works
          grounds_external_works: metadata.grounds_external_works || '',
          // Construction Details
          floor_finish: metadata.floor_finish || '',
          wall_construction: metadata.wall_construction || '',
          doors: metadata.doors || '',
          windows: metadata.windows || '',
          ceiling: metadata.ceiling || '',
          roofing: metadata.roofing || '',
          // Fixtures and Fittings
          fixtures_fittings: metadata.fixtures_fittings || '',
          // Drainage/Sanitation
          drainage_sanitation: metadata.drainage_sanitation || '',
          // Condition
          condition_state: metadata.condition_state || '',
          // Services
          services_description: metadata.services_description || '',
          // Land Value Evidence
          land_value_evidence: metadata.land_value_evidence || '',
          // Risk Assessment (GhIS Section 3)
          risk_assessment: metadata.risk_assessment || undefined,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load valuation')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [valuationId])

  // Handle save
  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)
      setSuccess(null)

      // Update property via API
      const propertyId = valuation?.property?.id || valuation?.property_id
      if (!propertyId) {
        throw new Error('Property ID not found')
      }

      // Update property fields
      const propertyUpdate = {
        address_street: propertyData.address,
        address_city: propertyData.city,
        region: propertyData.region,
        digital_address: propertyData.digital_address,
        property_type: propertyData.property_type,
        bedrooms: propertyData.bedrooms,
        bathrooms: propertyData.bathrooms,
        total_floors: propertyData.total_floors,
        year_built: propertyData.year_built,
        building_area_sqm: propertyData.gfa,
        land_area_sqm: propertyData.land_area || propertyData.plot_size,
        quality_rating: propertyData.quality_rating,
        condition: propertyData.condition,
        tenure_type: propertyData.tenure_type,
        owner_name: propertyData.owner_name,
        owner_email: propertyData.owner_email,
        owner_phone: propertyData.owner_phone,
        owner_address: propertyData.owner_address,
        description: propertyData.brief_description,
        // Store Chapter 3 report data in metadata
        metadata: {
          // City Data
          city_description: propertyData.city_description,
          city_details: propertyData.city_details,
          // Neighbourhood Data
          neighbourhood_description: propertyData.neighbourhood_description,
          neighborhood_class: propertyData.neighborhood_class,
          resident_income_level: propertyData.resident_income_level,
          primary_use: propertyData.primary_use,
          neighborhood_details: propertyData.neighborhood_details,
          // Location
          location_description: propertyData.location_description,
          // Brief Description
          brief_description: propertyData.brief_description,
          // Grounds and External Works
          grounds_external_works: propertyData.grounds_external_works,
          // Construction Details
          floor_finish: propertyData.floor_finish,
          wall_construction: propertyData.wall_construction,
          doors: propertyData.doors,
          windows: propertyData.windows,
          ceiling: propertyData.ceiling,
          roofing: propertyData.roofing,
          // Fixtures and Fittings
          fixtures_fittings: propertyData.fixtures_fittings,
          // Drainage/Sanitation
          drainage_sanitation: propertyData.drainage_sanitation,
          // Condition
          condition_state: propertyData.condition_state,
          // Services
          services_description: propertyData.services_description,
          // Land Value Evidence
          land_value_evidence: propertyData.land_value_evidence,
          // Risk Assessment (GhIS Section 3)
          risk_assessment: propertyData.risk_assessment,
        },
      }

      // Call property update API
      await fetchApi(`/properties/${propertyId}`, {
        method: 'PUT',
        body: JSON.stringify(propertyUpdate),
      })

      // Update valuation dates, purpose, and engagement
      const valuationUpdate = {
        effective_date: propertyData.valuation_date,
        inspection_date: propertyData.inspection_date,
        is_retrospective: propertyData.is_retrospective,
        valuation_purpose: propertyData.valuation_purpose,
      }

      await valuationsApi.update(valuationId, valuationUpdate)

      // Update engagement (client info) — always save to ensure it exists
      if (propertyData.client_name) {
        await fetchApi(`/valuations/${valuationId}/engagement`, {
          method: 'PUT',
          body: JSON.stringify({
            client_name: propertyData.client_name,
            client_address: propertyData.client_address,
            client_email: propertyData.client_email,
            client_phone: propertyData.client_phone,
            request_type: propertyData.request_type,
          }),
        })
      }

      setSuccess('Property information saved successfully')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save property')
    } finally {
      setSaving(false)
    }
  }

  // Handle save and continue
  const handleSaveAndContinue = async () => {
    await handleSave()
    if (!error) {
      router.push(`/dashboard/valuations/${valuationId}/property`)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/valuations/${valuationId}`}
            className="p-2 hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-xl text-foreground">SUBJECT PROPERTY INFORMATION</h1>
              <StatusBadge status="in_progress" />
            </div>
            <p className="font-mono text-[10px] text-muted-foreground">
              VAL-{valuationId.slice(0, 8).toUpperCase()} • Edit property details
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground font-mono text-xs hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                SAVING...
              </>
            ) : (
              <>
                <Save className="w-3 h-3" />
                SAVE
              </>
            )}
          </button>
          <button
            onClick={handleSaveAndContinue}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-foreground font-mono text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                SAVING...
              </>
            ) : (
              <>
                SAVE & CONTINUE
                <ArrowRight className="w-3 h-3" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Alerts */}
      <div className="mb-4">
        {error && <AlertBanner type="error" title="Error" message={error} />}
        {success && <AlertBanner type="success" title="Success" message={success} />}
      </div>

      {/* AI area-narrative assist — drafts city/neighbourhood/location/services
          from real geocoding + Google Places. Valuer reviews & edits below. */}
      <TerminalPanel title="AI AREA DESCRIPTION (DRAFT — REVIEW BEFORE APPROVING)" className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 p-3">
          <p className="text-xs text-muted-foreground font-mono max-w-xl">
            Generates the city, neighbourhood, location and services descriptions from the
            property’s GPS/address using Google Places — grounded in real nearby amenities,
            not invented. Always review and edit before approving the report.
          </p>
          <button
            type="button"
            onClick={handleGenerateArea}
            disabled={aiBusy}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-mono uppercase rounded border border-cyan-600/40 text-cyan-500 hover:bg-cyan-600/10 disabled:opacity-50"
          >
            {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {aiBusy ? 'Generating…' : 'Generate with AI'}
          </button>
        </div>
        {aiError && <p className="px-3 pb-3 text-xs text-red-500 font-mono">{aiError}</p>}
        {aiEvidence && (
          <div className="px-3 pb-3 text-xs font-mono text-muted-foreground">
            <div className="flex items-center gap-1.5 mb-1 text-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {[aiEvidence.locality, aiEvidence.district, aiEvidence.region].filter(Boolean).join(', ') || 'Location resolved'}
              <span className="opacity-60">
                ({aiEvidence.latitude.toFixed(4)}, {aiEvidence.longitude.toFixed(4)} · {aiEvidence.coordinateSource})
              </span>
            </div>
            {aiEvidence.places.length > 0 ? (
              <p>
                Grounded in {aiEvidence.places.length} nearby place(s):{' '}
                {aiEvidence.places.slice(0, 8).map(p => p.name).join(', ')}
                {aiEvidence.places.length > 8 ? '…' : ''}
              </p>
            ) : (
              <p className="text-amber-500">No nearby amenities returned — the draft is general; verify carefully.</p>
            )}
          </div>
        )}
      </TerminalPanel>

      {/* Property Form */}
      <TerminalPanel title="EDIT PROPERTY DETAILS" className="mb-6">
        <ComprehensivePropertyForm
          data={propertyData}
          onChange={setPropertyData}
          mode="subject"
          showValuationDates={true}
          showLocationFields={true}
        />
      </TerminalPanel>

      {/* Navigation */}
      <div className="flex justify-between">
        <Link
          href={`/dashboard/valuations/${valuationId}`}
          className="px-6 py-3 bg-muted text-muted-foreground font-mono text-sm hover:text-foreground transition-colors"
        >
          ← BACK TO VALUATION OVERVIEW
        </Link>
        <button
          onClick={handleSaveAndContinue}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-foreground font-mono text-sm font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              SAVING...
            </>
          ) : (
            <>
              CONTINUE TO PROPERTY SETUP
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  )
}
