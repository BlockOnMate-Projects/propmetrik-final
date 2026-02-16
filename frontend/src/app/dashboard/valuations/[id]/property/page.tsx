'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import {
  TerminalPanel,
  StatusBadge,
  PropertyTypeBadge,
  AlertBanner,
  StepIndicator,
} from '@/components/ui/terminal'
import { valuationsApi } from '@/lib/valuation-api'
import type { Valuation } from '@/types/valuation'
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Save,
  Edit,
} from 'lucide-react'

export default function PropertySetupPage() {
  const params = useParams()
  const router = useRouter()
  const valuationId = params.id as string

  const [valuation, setValuation] = useState<Valuation | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load valuation')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [valuationId])

  // Save and continue
  const handleSaveAndContinue = async () => {
    try {
      setSaving(true)
      setError(null)

      // Update valuation progress
      await valuationsApi.update(valuationId, {
        current_step: 2,
        status: 'in_progress',
      })

      // Navigate to floor plans step
      router.push(`/dashboard/valuations/${valuationId}/floor-plan`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save property data')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        <span className="ml-3 font-mono text-sm text-zinc-400">Loading property setup...</span>
      </div>
    )
  }

  if (error || !valuation) {
    return (
      <div className="min-h-screen bg-black text-white p-4">
        <AlertBanner type="error" title="Error" message={error || 'Valuation not found'} />
      </div>
    )
  }

  // Cast property to any to handle both camelCase (from backend) and snake_case field names
  const property = valuation.property as any

  return (
    <div className="min-h-screen bg-black text-white p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/valuations/${valuationId}`}
            className="p-2 hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-zinc-400" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-xl text-white">STEP 1: PROPERTY SETUP</h1>
              <StatusBadge status="in_progress" />
            </div>
            <p className="font-mono text-[10px] text-zinc-500">
              VAL-{valuationId.slice(0, 8).toUpperCase()} • {property?.address || 'Property'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveAndContinue}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-mono text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
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

      {/* Step Progress */}
      <div className="mb-6">
        <StepIndicator
          steps={[
            { id: 1, label: 'Property Setup', status: 'current' },
            { id: 2, label: 'Floor Plans', status: 'upcoming' },
            { id: 3, label: 'HBU Analysis', status: 'upcoming' },
            { id: 4, label: 'Method Selection', status: 'upcoming' },
            { id: 5, label: 'Valuation', status: 'upcoming' },
            { id: 6, label: 'Reconciliation', status: 'upcoming' },
            { id: 7, label: 'Report', status: 'upcoming' },
          ]}
        />
      </div>

      {/* Error Alert */}
      {error && <AlertBanner type="error" title="Error" message={error} />}

      {/* Main Content Grid */}
      <div className="grid grid-cols-3 gap-4">
        {/* Property Summary - Subject Property Info */}
        <TerminalPanel title="SUBJECT PROPERTY" className="col-span-2">
          <div className="space-y-4">
            <div className="flex justify-end -mt-2 -mr-2">
              <Link
                href={`/dashboard/valuations/${valuationId}/subject`}
                className="px-2 py-1 bg-zinc-800 text-amber-400 font-mono text-[10px] hover:bg-zinc-700 transition-colors flex items-center gap-1"
              >
                <Edit className="w-3 h-3" />
                EDIT PROPERTY DETAILS
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <div className="font-mono text-[10px] text-zinc-500 mb-1">ADDRESS</div>
                <div className="font-mono text-sm text-white">{property?.address || property?.address_street || '—'}</div>
                <div className="font-mono text-xs text-zinc-400 mt-1">
                  {property?.city || property?.address_city || '—'}, {(property?.region || '')?.replace('_', ' ').toUpperCase() || '—'}
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-zinc-500 mb-1">TYPE</div>
                <PropertyTypeBadge type={property?.propertyType || property?.property_type || 'residential'} />
              </div>
              <div>
                <div className="font-mono text-[10px] text-zinc-500 mb-1">PLOT SIZE</div>
                <div className="font-mono text-lg text-white">
                  {(property?.plotSize || property?.plot_size || property?.landArea || property?.land_area)?.toLocaleString() || '—'} sqm
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-zinc-500 mb-1">BEDROOMS</div>
                <div className="font-mono text-lg text-white">{property?.bedrooms || '—'}</div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-zinc-500 mb-1">BATHROOMS</div>
                <div className="font-mono text-lg text-white">{property?.bathrooms || '—'}</div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-zinc-500 mb-1">YEAR BUILT</div>
                <div className="font-mono text-lg text-white">{property?.yearBuilt || property?.year_built || '—'}</div>
              </div>
            </div>
          </div>
        </TerminalPanel>

        {/* Property Details */}
        <TerminalPanel title="PROPERTY DETAILS">
          <div className="space-y-4">
            <div>
              <div className="font-mono text-[10px] text-zinc-500 mb-1">CONDITION</div>
              <div className="font-mono text-sm text-white">{property?.condition || '—'}</div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-zinc-500 mb-1">CONSTRUCTION</div>
              <div className="font-mono text-sm text-white">{property?.construction_type || property?.constructionType || '—'}</div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-zinc-500 mb-1">FLOORS</div>
              <div className="font-mono text-sm text-white">{property?.floors || property?.total_floors || '—'}</div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-zinc-500 mb-1">TENURE</div>
              <div className="font-mono text-sm text-white">{property?.tenure || '—'}</div>
            </div>
          </div>
        </TerminalPanel>
      </div>

      {/* Navigation */}
      <div className="mt-6 flex justify-between">
        <Link
          href={`/dashboard/valuations/${valuationId}`}
          className="px-6 py-3 bg-zinc-800 text-zinc-400 font-mono text-sm hover:text-white transition-colors"
        >
          ← BACK TO VALUATION
        </Link>
        <button
          onClick={handleSaveAndContinue}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-black font-mono text-sm font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              SAVING...
            </>
          ) : (
            <>
              CONTINUE TO FLOOR PLANS
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  )
}
