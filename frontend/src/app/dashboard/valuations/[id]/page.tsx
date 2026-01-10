'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import {
  TerminalPanel,
  Metric,
  StatusBadge,
  PropertyTypeBadge,
  Currency,
  ConfidenceBar,
  StepIndicator,
  AlertBanner,
  MethodBadge,
} from '@/components/ui/terminal'
import { valuationsApi, floorPlanApi, hbuApi, reconciliationApi } from '@/lib/valuation-api'
import type { Valuation, FloorPlan, HBUAnalysis, Reconciliation } from '@/types/valuation'
import {
  ArrowLeft,
  ChevronRight,
  Loader2,
  Home,
  Maximize,
  TrendingUp,
  Calculator,
  DollarSign,
  Building,
  FileText,
  Scale,
  CheckCircle2,
  Edit,
  Save,
  Search,
} from 'lucide-react'

// Valuation workflow steps
const WORKFLOW_STEPS = [
  { id: 1, label: 'Property Setup', icon: Home, path: 'property' },
  { id: 2, label: 'HBU Analysis', icon: TrendingUp, path: 'hbu' },
  { id: 3, label: 'Method Selection', icon: Calculator, path: 'methods' },
  { id: 4, label: 'Comparable Search', icon: Search, path: 'comparables' },
  { id: 5, label: 'Market Analysis', icon: DollarSign, path: 'market' },
  { id: 6, label: 'Cost Inputs', icon: Building, path: 'cost' },
  { id: 7, label: 'Income Analysis', icon: FileText, path: 'income' },
  { id: 8, label: 'Reconciliation', icon: Scale, path: 'reconciliation' },
  { id: 9, label: 'Report', icon: CheckCircle2, path: 'report' },
]

export default function ValuationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const valuationId = params.id as string

  const [valuation, setValuation] = useState<Valuation | null>(null)
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([])
  const [hbuAnalysis, setHbuAnalysis] = useState<HBUAnalysis | null>(null)
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeStep, setActiveStep] = useState(1)
  const [saving, setSaving] = useState(false)

  // Handle edit button click
  const handleEdit = () => {
    // Navigate to property setup page for editing
    const step = WORKFLOW_STEPS.find(s => s.id === 1) // Property Setup step
    if (step) {
      router.push(`/dashboard/valuations/${valuationId}/${step.path}?edit=true`)
    }
  }

  // Handle save progress button click  
  const handleSaveProgress = async () => {
    if (!valuation) return
    
    try {
      setSaving(true)
      
      // Save current valuation state
      const updateRes = await valuationsApi.updateProgress(valuationId, {
        currentStep: activeStep,
        status: 'in_progress',
        lastModified: new Date().toISOString(),
      })
      
      if (updateRes.error) {
        throw new Error(updateRes.error)
      }
      
      // Show success message (you can add a toast notification here)
      console.log('Progress saved successfully')
      
    } catch (err) {
      console.error('Failed to save progress:', err)
      // Handle error (you can add error notification here)
    } finally {
      setSaving(false)
    }
  }

  // Fetch valuation data
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        setError(null)

        const valuationRes = await valuationsApi.getById(valuationId)
        if (valuationRes.error) throw new Error(valuationRes.error)
        if (!valuationRes.data) throw new Error('Valuation not found')

        setValuation(valuationRes.data as any)
        setActiveStep(valuationRes.data.current_step || 1)

        // Fetch related data in parallel
        const [floorPlansRes, hbuRes, reconRes] = await Promise.all([
          floorPlanApi.getByValuation(valuationId),
          hbuApi.getByValuation(valuationId),
          reconciliationApi.getByValuation(valuationId),
        ])

        if (floorPlansRes.data) setFloorPlans(floorPlansRes.data as any)
        if (hbuRes.data) setHbuAnalysis(hbuRes.data as any)
        if (reconRes.data) setReconciliation(reconRes.data as any)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load valuation')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [valuationId])

  // Navigate to step
  const goToStep = (stepId: number) => {
    const step = WORKFLOW_STEPS.find(s => s.id === stepId)
    if (step) {
      router.push(`/dashboard/valuations/${valuationId}/${step.path}`)
    }
  }

  // Calculate workflow progress
  const getStepStatus = (stepId: number): 'completed' | 'current' | 'upcoming' | 'error' => {
    const currentStep = valuation?.current_step || 1
    if (stepId < currentStep) return 'completed'
    if (stepId === currentStep) return 'current'
    return 'upcoming'
  }

  const workflowSteps = WORKFLOW_STEPS.map(step => ({
    id: step.id,
    label: step.label,
    status: getStepStatus(step.id),
  }))

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        <span className="ml-3 font-mono text-sm text-zinc-400">Loading valuation...</span>
      </div>
    )
  }

  if (error || !valuation) {
    return (
      <div className="min-h-screen bg-black text-white p-4">
        <AlertBanner
          type="error"
          title="Error loading valuation"
          message={error || 'Valuation not found'}
          action={
            <Link href="/dashboard/valuations" className="font-mono text-xs text-red-400 hover:text-red-300">
              ← BACK
            </Link>
          }
        />
      </div>
    )
  }

  const property = valuation.property

  return (
    <div className="min-h-screen bg-black text-white p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/valuations"
            className="p-2 hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-zinc-400" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-xl text-white">
                VAL-{valuationId.slice(0, 8).toUpperCase()}
              </h1>
              <StatusBadge status={valuation.status} size="md" />
            </div>
            <p className="font-mono text-[10px] text-zinc-500">
              {property?.title || property?.address || 'Property Valuation'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleEdit}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-400 font-mono text-xs hover:text-white transition-colors"
            disabled={loading}
          >
            <Edit className="w-3 h-3" />
            EDIT
          </button>
          <button 
            onClick={handleSaveProgress}
            disabled={loading || saving || !valuation}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-mono text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Save className="w-3 h-3" />
            )}
            {saving ? 'SAVING...' : 'SAVE PROGRESS'}
          </button>
        </div>
      </div>

      {/* Workflow Progress */}
      <TerminalPanel title="VALUATION WORKFLOW" className="mb-6">
        <div className="flex items-center justify-between">
          {WORKFLOW_STEPS.map((step, i) => {
            const StepIcon = step.icon
            const status = getStepStatus(step.id)
            const isActive = step.id === activeStep
            const isCompleted = status === 'completed'
            const isCurrent = status === 'current'

            return (
              <div key={step.id} className="flex items-center">
                <button
                  onClick={() => goToStep(step.id)}
                  className={`flex flex-col items-center gap-2 p-3 transition-colors ${
                    status === 'upcoming' ? 'opacity-50 cursor-not-allowed' : 'hover:bg-zinc-800/50 cursor-pointer'
                  }`}
                  disabled={status === 'upcoming'}
                >
                  <div className={`
                    w-10 h-10 flex items-center justify-center border-2 transition-colors
                    ${isCompleted ? 'border-green-500 bg-green-500/20' : ''}
                    ${isCurrent ? 'border-amber-500 bg-amber-500/20' : ''}
                    ${status === 'upcoming' ? 'border-zinc-700 bg-zinc-800' : ''}
                  `}>
                    {isCompleted ? (
                      <CheckCircle2 className="w-5 h-5 text-green-400" />
                    ) : (
                      <StepIcon className={`w-5 h-5 ${isCurrent ? 'text-amber-400' : 'text-zinc-500'}`} />
                    )}
                  </div>
                  <div className="text-center">
                    <div className={`font-mono text-[10px] ${
                      isCurrent ? 'text-amber-500' : isCompleted ? 'text-green-400' : 'text-zinc-500'
                    }`}>
                      STEP {step.id}
                    </div>
                    <div className={`font-mono text-[10px] ${
                      isCurrent ? 'text-white' : isCompleted ? 'text-zinc-300' : 'text-zinc-600'
                    }`}>
                      {step.label.toUpperCase()}
                    </div>
                  </div>
                </button>
                {i < WORKFLOW_STEPS.length - 1 && (
                  <div className={`w-12 h-0.5 mx-1 ${
                    isCompleted ? 'bg-green-500' : 'bg-zinc-700'
                  }`} />
                )}
              </div>
            )
          })}
        </div>
      </TerminalPanel>

      {/* Main Content Grid */}
      <div className="grid grid-cols-3 gap-4">
        {/* Property Summary */}
        <TerminalPanel title="PROPERTY SUMMARY" className="col-span-2">
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="font-mono text-[10px] text-zinc-500 mb-1">ADDRESS</div>
              <div className="font-mono text-sm text-white">{property?.address || property?.location || '—'}</div>
              <div className="font-mono text-xs text-zinc-400">{property?.city && property?.region ? `${property.city}, ${property.region}` : (property?.city || property?.region || '')}</div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-zinc-500 mb-1">TYPE</div>
              <PropertyTypeBadge type={property?.property_type || 'residential'} />
            </div>
            <div>
              <div className="font-mono text-[10px] text-zinc-500 mb-1">SIZE</div>
              <div className="font-mono text-lg text-white">
                {property?.land_area_sqm || property?.plot_size ? `${(property.land_area_sqm || property.plot_size)?.toLocaleString()} sqm` : '—'}
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
              <div className="font-mono text-lg text-white">{property?.year_built || '—'}</div>
            </div>
          </div>
        </TerminalPanel>

        {/* Valuation Summary */}
        <TerminalPanel title="VALUATION">
          <div className="space-y-4">
            <div className="text-center py-4">
              {valuation?.final_value_ghs ? (
                <div>
                  <Currency value={valuation.final_value_ghs} size="lg" />
                  <div className="font-mono text-[10px] text-zinc-500 mt-1">FINAL VALUE</div>
                </div>
              ) : (
                <>
                  <div className="font-mono text-2xl text-zinc-600">—</div>
                  <div className="font-mono text-[10px] text-zinc-500 mt-1">PENDING</div>
                </>
              )}
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="font-mono text-[10px] text-zinc-500">CONFIDENCE</span>
                <span className="font-mono text-[10px] text-zinc-400">
                  {valuation.confidence_score ? `${(valuation.confidence_score * 100).toFixed(0)}%` : 'N/A'}
                </span>
              </div>
              {valuation?.confidence_score && (
                <ConfidenceBar score={valuation.confidence_score} showValue={false} />
              )}
            </div>
            {((valuation as any).valuationRange || (valuation as any).value_range_low_ghs) && (
              <div className="pt-2 border-t border-zinc-800">
                <div className="font-mono text-[10px] text-zinc-500 mb-2">VALUE RANGE</div>
                <div className="flex justify-between">
                  <div>
                    <div className="font-mono text-[10px] text-zinc-500">LOW</div>
                    <Currency value={(valuation as any).valuationRange?.low || (valuation as any).value_range_low_ghs} size="sm" />
                  </div>
                  <div className="text-center">
                    <div className="font-mono text-[10px] text-zinc-500">MID</div>
                    <Currency value={(valuation as any).valuationRange?.mid || (valuation as any).final_market_value_ghs} size="sm" />
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[10px] text-zinc-500">HIGH</div>
                    <Currency value={(valuation as any).valuationRange?.high || (valuation as any).value_range_high_ghs} size="sm" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </TerminalPanel>
      </div>

      {/* Method Results */}
      {valuation?.method_results && Object.keys(valuation.method_results).length > 0 && (
        <TerminalPanel title="METHOD RESULTS" className="col-span-3">
          <div className="grid grid-cols-3 gap-4">
            {Object.entries(valuation.method_results).map(([method, result]: [string, any]) => (
              <div key={method} className="p-4 bg-zinc-800/30 border border-zinc-700">
                <div className="flex items-center justify-between mb-3">
                  <MethodBadge method={method} isPrimary={method === valuation?.primary_method} />
                  <span className="font-mono text-[10px] text-zinc-500">
                    {(result.weight * 100).toFixed(0)}%
                  </span>
                </div>
                <Currency value={result.value} size="md" />
                <div className="mt-2">
                  <ConfidenceBar score={result.confidence} size="sm" />
                </div>
              </div>
            ))}
          </div>
        </TerminalPanel>
      )}

      {/* Floor Plans Summary */}
      {floorPlans.length > 0 && (
        <TerminalPanel title="FLOOR PLANS" className="mt-4">
          <div className="grid grid-cols-4 gap-4">
            {floorPlans.map((plan) => (
              <div key={plan.id} className="p-3 bg-zinc-800/30 border border-zinc-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs text-white">{plan.floorNumber === 0 ? 'Ground Floor' : `Floor ${plan.floorNumber}`}</span>
                  <Maximize className="w-3 h-3 text-zinc-500" />
                </div>
                <div className="font-mono text-lg text-amber-400">{plan.totalArea?.toLocaleString()} sqm</div>
                <div className="font-mono text-[10px] text-zinc-500">{plan.rooms?.length || 0} rooms</div>
              </div>
            ))}
          </div>
        </TerminalPanel>
      )}

      {/* HBU Analysis Summary */}
      {hbuAnalysis && (
        <TerminalPanel title="HIGHEST & BEST USE" className="mt-4">
          <div className="grid grid-cols-4 gap-4">
            <div className="p-3 bg-zinc-800/30 border border-zinc-700">
              <div className="font-mono text-[10px] text-zinc-500 mb-1">LEGALLY PERMISSIBLE</div>
              <div className={`font-mono text-sm ${hbuAnalysis.legallyPermissible ? 'text-green-400' : 'text-red-400'}`}>
                {hbuAnalysis.legallyPermissible ? '✓ PASS' : '✗ FAIL'}
              </div>
            </div>
            <div className="p-3 bg-zinc-800/30 border border-zinc-700">
              <div className="font-mono text-[10px] text-zinc-500 mb-1">PHYSICALLY POSSIBLE</div>
              <div className={`font-mono text-sm ${hbuAnalysis.physicallyPossible ? 'text-green-400' : 'text-red-400'}`}>
                {hbuAnalysis.physicallyPossible ? '✓ PASS' : '✗ FAIL'}
              </div>
            </div>
            <div className="p-3 bg-zinc-800/30 border border-zinc-700">
              <div className="font-mono text-[10px] text-zinc-500 mb-1">FINANCIALLY FEASIBLE</div>
              <div className={`font-mono text-sm ${hbuAnalysis.financiallyFeasible ? 'text-green-400' : 'text-red-400'}`}>
                {hbuAnalysis.financiallyFeasible ? '✓ PASS' : '✗ FAIL'}
              </div>
            </div>
            <div className="p-3 bg-zinc-800/30 border border-zinc-700">
              <div className="font-mono text-[10px] text-zinc-500 mb-1">MAXIMALLY PRODUCTIVE</div>
              <div className={`font-mono text-sm ${hbuAnalysis.maximallyProductive ? 'text-green-400' : 'text-red-400'}`}>
                {hbuAnalysis.maximallyProductive ? '✓ PASS' : '✗ FAIL'}
              </div>
            </div>
          </div>
          {hbuAnalysis.recommendedUse && (
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <div className="font-mono text-[10px] text-zinc-500 mb-1">RECOMMENDED USE</div>
              <div className="font-mono text-sm text-amber-400">{hbuAnalysis.recommendedUse}</div>
            </div>
          )}
        </TerminalPanel>
      )}

      {/* Continue Workflow CTA */}
      <div className="mt-6 flex justify-center">
        <button
          onClick={() => goToStep(valuation?.current_step || 1)}
          className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-black font-mono text-sm font-bold hover:bg-amber-400 transition-colors"
        >
          CONTINUE WORKFLOW
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
