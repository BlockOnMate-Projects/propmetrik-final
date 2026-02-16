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
  Banknote,
  Factory,
  Landmark,
  HardHat,
} from 'lucide-react'

// Core workflow steps (always shown)
const CORE_STEPS = [
  { id: 1, label: 'Property Setup', icon: Home, path: 'property' },
  { id: 2, label: 'Floor Plans', icon: Maximize, path: 'floor-plan' },
  { id: 3, label: 'HBU Analysis', icon: TrendingUp, path: 'hbu' },
  { id: 4, label: 'Method Selection', icon: Calculator, path: 'methods' },
]

// Method-specific steps - only shown when that method is selected
const METHOD_STEPS: Record<string, { id: number; label: string; icon: any; path: string }[]> = {
  sales_comparison: [
    { id: 4, label: 'Comparable Search', icon: Search, path: 'comparables' },
    { id: 5, label: 'Market Analysis', icon: DollarSign, path: 'market' },
  ],
  cost_approach: [
    { id: 4, label: 'Cost Inputs', icon: Building, path: 'cost' },
  ],
  income_approach: [
    { id: 4, label: 'Rental Market', icon: Banknote, path: 'rental-market' },
    { id: 5, label: 'Income Analysis', icon: FileText, path: 'income' },
  ],
  profits_method: [
    { id: 4, label: 'Profits Analysis', icon: Factory, path: 'profits' },
  ],
  drc_method: [
    { id: 4, label: 'DRC Analysis', icon: Landmark, path: 'drc' },
  ],
  residual_method: [
    { id: 4, label: 'Residual Analysis', icon: HardHat, path: 'residual' },
  ],
}

// Final steps (always shown)
const FINAL_STEPS = [
  { id: 98, label: 'Reconciliation', icon: Scale, path: 'reconciliation' },
  { id: 99, label: 'Report', icon: CheckCircle2, path: 'report' },
]

// Format region name to be more readable (e.g., "greater_accra" -> "Greater Accra")
const formatRegion = (region: string | undefined): string => {
  if (!region) return '';
  return region
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

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
    router.push(`/dashboard/valuations/${valuationId}/property?edit=true`)
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

  // Navigate to step (uses 1-based position index)
  const goToStep = (stepNumber: number) => {
    const steps = getWorkflowSteps()
    // Use index-based lookup (step numbers are 1-based positions)
    // This aligns with getStepStatus which uses currentStep - 1 as the index
    const idx = Math.max(0, Math.min(stepNumber - 1, steps.length - 1))
    const step = steps[idx]
    if (step) {
      router.push(`/dashboard/valuations/${valuationId}/${step.path}`)
    }
  }

  // Determine the correct step path to resume from
  // Uses the current_step stored in the DB (set by each page on save & continue)
  const getResumeStepPath = (): string => {
    const steps = getWorkflowSteps()
    const cs = valuation?.current_step || 1
    const idx = Math.max(0, Math.min(cs - 1, steps.length - 1))
    return steps[idx]?.path || 'property'
  }
  
  // Build dynamic workflow steps based on selected methods
  const getWorkflowSteps = () => {
    const selectedMethods = (valuation as any)?.selectedMethods || valuation?.methods_applied || []
    
    // Start with core steps
    const steps = [...CORE_STEPS]
    
    // Add method-specific steps based on what's selected
    let stepId = 5
    selectedMethods.forEach((method: string) => {
      const methodSteps = METHOD_STEPS[method]
      if (methodSteps) {
        methodSteps.forEach(step => {
          // Check if this path already exists (avoid duplicates)
          if (!steps.some(s => s.path === step.path)) {
            steps.push({ ...step, id: stepId++ })
          }
        })
      }
    })
    
    // If no methods selected yet, show a placeholder
    if (selectedMethods.length === 0) {
      steps.push({ id: stepId++, label: 'Select Methods', icon: Calculator, path: 'methods' })
    }
    
    // Add final steps with adjusted IDs
    FINAL_STEPS.forEach(step => {
      steps.push({ ...step, id: stepId++ })
    })
    
    return steps
  }

  // Calculate workflow progress - now uses path-based comparison
  const getStepStatus = (stepId: number, stepPath: string): 'completed' | 'current' | 'upcoming' | 'error' => {
    const currentStep = valuation?.current_step || 1
    const steps = getWorkflowSteps()
    const stepIndex = steps.findIndex(s => s.id === stepId)
    const currentStepIndex = Math.min(currentStep - 1, steps.length - 1)
    
    if (stepIndex < currentStepIndex) return 'completed'
    if (stepIndex === currentStepIndex) return 'current'
    return 'upcoming'
  }

  const workflowSteps = getWorkflowSteps().map(step => ({
    id: step.id,
    label: step.label,
    path: step.path,
    status: getStepStatus(step.id, step.path),
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
          {getWorkflowSteps().map((step, i) => {
            const StepIcon = step.icon
            const status = getStepStatus(step.id, step.path)
            const stepPosition = i + 1 // 1-based position
            const isActive = stepPosition === activeStep
            const isCompleted = status === 'completed'
            const isCurrent = status === 'current'

            return (
              <div key={step.id} className="flex items-center">
                <button
                  onClick={() => goToStep(stepPosition)}
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
                {i < getWorkflowSteps().length - 1 && (
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
              <div className="font-mono text-sm text-white">{property?.address || property?.address_street || property?.location || '—'}</div>
              <div className="font-mono text-xs text-zinc-400">
                {property?.city || property?.address_city ? (
                  <>
                    {property?.city || property?.address_city}
                    {property?.region ? `, ${formatRegion(property.region)}` : ''}
                  </>
                ) : (
                  formatRegion(property?.region) || ''
                )}
              </div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-zinc-500 mb-1">TYPE</div>
              <PropertyTypeBadge type={property?.property_type || (property as any)?.propertyType || 'residential'} />
            </div>
            <div>
              <div className="font-mono text-[10px] text-zinc-500 mb-1">SIZE</div>
              <div className="font-mono text-lg text-white">
                {(() => {
                  const prop = property as any
                  const size = prop?.land_area_sqm || prop?.landArea || prop?.plot_size || prop?.plotSize
                  return size ? `${size.toLocaleString()} sqm` : '—'
                })()}
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
              <div className="font-mono text-lg text-white">{property?.year_built || (property as any)?.yearBuilt || '—'}</div>
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
            {floorPlans.map((plan: any) => {
              // Handle both camelCase and snake_case field names from API
              const floorNumber = plan.floorNumber ?? plan.floor_number ?? 0;
              const floorLabel = plan.floorLabel || plan.floor_label || (floorNumber === 0 ? 'Ground Floor' : `Floor ${floorNumber}`);
              const totalArea = plan.totalArea ?? plan.total_area ?? plan.gross_building_area_sqm ?? 0;
              const rooms = plan.rooms || [];

              return (
                <div key={plan.id} className="p-3 bg-zinc-800/30 border border-zinc-700">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs text-white">{floorLabel}</span>
                    <Maximize className="w-3 h-3 text-zinc-500" />
                  </div>
                  <div className="font-mono text-lg text-amber-400">
                    {totalArea > 0 ? `${totalArea.toLocaleString()} sqm` : '—'}
                  </div>
                  <div className="font-mono text-[10px] text-zinc-500">{rooms.length} rooms</div>
                </div>
              );
            })}
          </div>
        </TerminalPanel>
      )}

      {/* HBU Analysis Summary */}
      {hbuAnalysis && (
        <TerminalPanel title="HIGHEST & BEST USE" className="mt-4">
          <div className="grid grid-cols-4 gap-4">
            {(() => {
              // Handle both camelCase and snake_case field names from API
              const hbu = hbuAnalysis as any;
              const legallyPermissible = hbu.legallyPermissible ?? hbu.legal_test_passed ?? false;
              const physicallyPossible = hbu.physicallyPossible ?? hbu.physical_test_passed ?? false;
              const financiallyFeasible = hbu.financiallyFeasible ?? hbu.financial_test_passed ?? false;
              const maximallyProductive = hbu.maximallyProductive ?? hbu.productivity_test_passed ?? false;
              const recommendedUse = hbu.recommendedUse ?? hbu.hbu_conclusion ?? hbu.hbu_as_improved ?? hbu.hbu_as_vacant ?? null;

              return (
                <>
                  <div className="p-3 bg-zinc-800/30 border border-zinc-700">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">LEGALLY PERMISSIBLE</div>
                    <div className={`font-mono text-sm ${legallyPermissible ? 'text-green-400' : 'text-red-400'}`}>
                      {legallyPermissible ? '✓ PASS' : '✗ FAIL'}
                    </div>
                  </div>
                  <div className="p-3 bg-zinc-800/30 border border-zinc-700">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">PHYSICALLY POSSIBLE</div>
                    <div className={`font-mono text-sm ${physicallyPossible ? 'text-green-400' : 'text-red-400'}`}>
                      {physicallyPossible ? '✓ PASS' : '✗ FAIL'}
                    </div>
                  </div>
                  <div className="p-3 bg-zinc-800/30 border border-zinc-700">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">FINANCIALLY FEASIBLE</div>
                    <div className={`font-mono text-sm ${financiallyFeasible ? 'text-green-400' : 'text-red-400'}`}>
                      {financiallyFeasible ? '✓ PASS' : '✗ FAIL'}
                    </div>
                  </div>
                  <div className="p-3 bg-zinc-800/30 border border-zinc-700">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">MAXIMALLY PRODUCTIVE</div>
                    <div className={`font-mono text-sm ${maximallyProductive ? 'text-green-400' : 'text-red-400'}`}>
                      {maximallyProductive ? '✓ PASS' : '✗ FAIL'}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
          {(() => {
            const hbu = hbuAnalysis as any;
            const recommendedUse = hbu.recommendedUse ?? hbu.hbu_conclusion ?? hbu.hbu_as_improved ?? hbu.hbu_as_vacant ?? null;
            return recommendedUse && recommendedUse !== 'Pending Analysis' ? (
              <div className="mt-4 pt-4 border-t border-zinc-800">
                <div className="font-mono text-[10px] text-zinc-500 mb-1">RECOMMENDED USE</div>
                <div className="font-mono text-sm text-amber-400">{recommendedUse}</div>
              </div>
            ) : null;
          })()}
        </TerminalPanel>
      )}

      {/* Continue Workflow CTA */}
      <div className="mt-6 flex justify-center">
        {(() => {
          const resumePath = getResumeStepPath()
          const steps = getWorkflowSteps()
          const resumeStep = steps.find(s => s.path === resumePath)
          const resumeLabel = resumeStep?.label?.toUpperCase() || 'NEXT STEP'
          return (
            <button
              onClick={() => router.push(`/dashboard/valuations/${valuationId}/${resumePath}`)}
              className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-black font-mono text-sm font-bold hover:bg-amber-400 transition-colors"
            >
              CONTINUE: {resumeLabel}
              <ChevronRight className="w-4 h-4" />
            </button>
          )
        })()}
      </div>
    </div>
  )
}
