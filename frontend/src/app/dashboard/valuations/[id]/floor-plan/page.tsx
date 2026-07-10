'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { StatusBadge, AlertBanner, StepIndicator } from '@/components/ui/terminal'
import { valuationsApi } from '@/lib/valuation-api'
import type { Valuation } from '@/types/valuation'
import { useStore as useStudioStore } from '@/components/valuation/floorplan-studio/store'
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'

// Floor Plan Studio needs the browser (Konva canvas + three.js WebGL)
const FloorPlanStudio = dynamic(() => import('@/components/valuation/floorplan-studio/FloorPlanStudio'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[78vh] border border-border bg-card">
      <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
    </div>
  ),
})

export default function FloorPlanPage() {
  const params = useParams()
  const router = useRouter()
  const valuationId = params.id as string

  const [valuation, setValuation] = useState<Valuation | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    valuationsApi
      .getById(valuationId)
      .then((res) => {
        if (res.data) setValuation(res.data as unknown as Valuation)
      })
      .catch(() => undefined)
  }, [valuationId])

  const property = (valuation as unknown as { property?: { address?: string } } | null)?.property

  const saveAll = async (withImages: boolean): Promise<boolean> => {
    const ok = await useStudioStore.getState().flush({ withImages })
    if (!ok) setError('Saving the floor plan failed — check your connection and try again.')
    return ok
  }

  const handleSaveAndContinue = async () => {
    setSaving(true)
    setError(null)
    try {
      const ok = await saveAll(true) // renders + uploads per-floor PNGs for the report
      if (!ok) return
      await valuationsApi.update(valuationId, { current_step: 3, status: 'in_progress' })
      router.push(`/dashboard/valuations/${valuationId}/hbu`)
    } finally {
      setSaving(false)
    }
  }

  const handleBack = async () => {
    // parity with the method pages: BACK saves first (best-effort, never blocks)
    setSaving(true)
    try {
      await saveAll(false)
    } finally {
      setSaving(false)
      router.push(`/dashboard/valuations/${valuationId}/property`)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href={`/dashboard/valuations/${valuationId}`} className="p-2 hover:bg-muted transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-xl text-foreground">STEP 2: FLOOR PLANS</h1>
              <StatusBadge status="in_progress" />
            </div>
            <p className="font-mono text-[10px] text-muted-foreground">
              VAL-{valuationId.slice(0, 8).toUpperCase()} • {property?.address || 'Property'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
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

      {/* Step Progress */}
      <div className="mb-6">
        <StepIndicator
          steps={[
            { id: 1, label: 'Property Setup', status: 'completed' },
            { id: 2, label: 'Floor Plans', status: 'current' },
            { id: 3, label: 'HBU Analysis', status: 'upcoming' },
            { id: 4, label: 'Method Selection', status: 'upcoming' },
            { id: 5, label: 'Valuation', status: 'upcoming' },
            { id: 6, label: 'Reconciliation', status: 'upcoming' },
            { id: 7, label: 'Report', status: 'upcoming' },
          ]}
        />
      </div>

      {error && <AlertBanner type="error" title="Error" message={error} />}

      {/* The studio */}
      <FloorPlanStudio valuationId={valuationId} projectName={property?.address || `VAL-${valuationId.slice(0, 8).toUpperCase()}`} />

      <p className="mt-2 font-mono text-[10px] text-muted-foreground">
        Autosaves as you edit • room areas are exact finish-to-finish (IPMS 3B) • use “📸 To report” in the 3D view to add a
        3D snapshot to the report pictures • Quick Plan: type room sizes and the plan draws itself
      </p>

      {/* Navigation */}
      <div className="mt-6 flex justify-between">
        <button
          onClick={handleBack}
          disabled={saving}
          className="px-6 py-3 bg-muted text-muted-foreground font-mono text-sm hover:text-foreground transition-colors disabled:opacity-50"
        >
          ← BACK TO PROPERTY SETUP
        </button>
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
              CONTINUE TO HBU ANALYSIS
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  )
}
