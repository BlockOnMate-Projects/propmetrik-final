'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import {
  TerminalPanel,
  StatusBadge,
  AlertBanner,
  MethodBadge,
  Currency,
  ConfidenceBar,
  PropertyTypeBadge,
} from '@/components/ui/terminal'
import { valuationsApi, reconciliationApi, hbuApi, floorPlanApi } from '@/lib/valuation-api'
import type { Valuation, FloorPlan, HBUAnalysis, Reconciliation, ValuationMethod } from '@/types/valuation'
import {
  ArrowLeft,
  Loader2,
  FileText,
  Download,
  Printer,
  Send,
  CheckCircle2,
  Clock,
  User,
  MapPin,
  Home,
  Calendar,
  Shield,
  Award,
} from 'lucide-react'

export default function ReportPage() {
  const params = useParams()
  const router = useRouter()
  const valuationId = params.id as string
  const printRef = useRef<HTMLDivElement>(null)

  const [valuation, setValuation] = useState<Valuation | null>(null)
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([])
  const [hbuAnalysis, setHbuAnalysis] = useState<HBUAnalysis | null>(null)
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch all valuation data
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        setError(null)

        const valuationRes = await valuationsApi.getById(valuationId)
        if (valuationRes.error) throw new Error(valuationRes.error)
        if (!valuationRes.data) throw new Error('Valuation not found')

        setValuation(valuationRes.data as Valuation)

        // Fetch related data
        const [floorPlansRes, hbuRes, reconRes] = await Promise.all([
          floorPlanApi.getByValuation(valuationId),
          hbuApi.getByValuation(valuationId),
          reconciliationApi.getByValuation(valuationId),
        ])

        if (floorPlansRes.data) {
          const mappedFloorPlans = floorPlansRes.data.map((fp: any) => ({
            id: fp.id || '',
            valuationId: fp.valuation_id || valuationId,
            canvasJson: typeof fp.canvas_json === 'string' ? JSON.parse(fp.canvas_json) : (fp.canvas_json || {}),
            scalePixelsPerMeter: fp.scale_pixels_per_meter || 1,
            floorNumber: fp.floor_number || 0,
            floorLabel: fp.floor_label || '',
            calibrationReference: fp.calibration_reference,
            totalArea: fp.total_area_sqm,
            rooms: fp.rooms || [],
            isLocked: fp.is_locked || false,
            hasScaleReference: !!fp.scale_pixels_per_meter,
            measurementConfidence: 'measured' as const,
            createdAt: fp.created_at || new Date().toISOString(),
            updatedAt: fp.updated_at || new Date().toISOString(),
            canvasVersion: '1.0'
          })) as FloorPlan[]
          setFloorPlans(mappedFloorPlans)
        }

        if (hbuRes.data) {
          const hbuData = hbuRes.data
          const mappedHbu = {
            id: hbuData.id,
            valuationId: hbuData.valuation_id,
            // Map test results
            legallyPermissible: hbuData.legal_test_passed || false,
            physicallyPossible: hbuData.physical_test_passed || false,
            financiallyFeasible: hbuData.financial_test_passed || false,
            maximallyProductive: hbuData.productivity_test_passed || false,

            // Map analysis objects (assuming they might need mapping too, but casting for now if structure is close)
            legalAnalysis: hbuData.legal_analysis || {},
            physicalAnalysis: hbuData.physical_analysis || {},
            financialAnalysis: hbuData.financial_analysis || {},
            productivityAnalysis: hbuData.productivity_analysis || {},

            // Conclusion
            hbuConclusion: hbuData.hbu_conclusion,
            hbuJustification: hbuData.hbu_justification,
            recommendedUse: hbuData.hbu_conclusion, // Mapping conclusion to recommendedUse if that's the intent
            recommendedMethods: hbuData.recommended_methods || [],
            methodJustifications: hbuData.method_justifications || {},

            isCompleted: hbuData.is_completed || false,
            createdAt: hbuData.created_at || new Date().toISOString(),
            updatedAt: hbuData.updated_at || new Date().toISOString()
          } as unknown as HBUAnalysis
          setHbuAnalysis(mappedHbu)
        }

        if (reconRes.data) {
          // Map API ReconciliationData to internal Reconciliation type
          const reconData = reconRes.data
          const methodWeights: Record<string, any> = {}
          if (reconData.weights) {
            Object.entries(reconData.weights).forEach(([method, weight]) => {
              methodWeights[method] = { weight, is_manual: true }
            })
          }

          const mappedReconciliation = {
            ...reconData,
            method_weights: methodWeights,
            // Map other disparate fields if necessary, or rely on loose matching for others
          } as unknown as Reconciliation

          setReconciliation(mappedReconciliation)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load valuation')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [valuationId])

  // Handle print
  const handlePrint = () => {
    window.print()
  }

  // Handle PDF download (placeholder)
  const handleDownloadPDF = async () => {
    // TODO: Implement PDF generation
    alert('PDF generation will be implemented with a backend service')
  }

  // Submit for review
  const handleSubmitForReview = async () => {
    try {
      setSubmitting(true)
      setError(null)

      await valuationsApi.update(valuationId, {
        status: 'pending_review',
        current_step: 8,
      })

      // Refresh valuation
      const valuationRes = await valuationsApi.getById(valuationId)
      if (valuationRes.data) {
        setValuation(valuationRes.data as Valuation)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit for review')
    } finally {
      setSubmitting(false)
    }
  }

  // Mark as complete
  const handleComplete = async () => {
    try {
      setSubmitting(true)
      setError(null)

      await valuationsApi.update(valuationId, {
        status: 'completed',
      })

      router.push('/dashboard/valuations')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete valuation')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        <span className="ml-3 font-mono text-sm text-zinc-400">Loading report...</span>
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

  const property = valuation.property
  const totalGFA = floorPlans.reduce((sum, fp) => sum + (fp.totalArea || 0), 0)
  const reportDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })

  return (
    <div className="min-h-screen bg-black text-white p-4 pb-10">
      {/* Header - Not printed */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/valuations/${valuationId}`}
            className="p-2 hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-zinc-400" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-xl text-white">VALUATION REPORT</h1>
              <StatusBadge status={valuation.status} size="md" />
            </div>
            <p className="font-mono text-[10px] text-zinc-500">
              VAL-{valuationId.slice(0, 8).toUpperCase()} • {reportDate}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-400 font-mono text-xs hover:text-white transition-colors"
          >
            <Printer className="w-3 h-3" />
            PRINT
          </button>
          <button
            onClick={handleDownloadPDF}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-400 font-mono text-xs hover:text-white transition-colors"
          >
            <Download className="w-3 h-3" />
            PDF
          </button>
          {valuation.status === 'in_progress' && (
            <button
              onClick={handleSubmitForReview}
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-mono text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              SUBMIT FOR REVIEW
            </button>
          )}
          {valuation.status === 'pending_review' && (
            <button
              onClick={handleComplete}
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-black font-mono text-xs font-bold hover:bg-green-400 transition-colors disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              APPROVE & COMPLETE
            </button>
          )}
        </div>
      </div>

      {/* Report Content - Printable */}
      <div ref={printRef} className="print:bg-white print:text-black">
        {/* Report Header */}
        <div className="border border-zinc-800 print:border-black mb-6 p-6 bg-zinc-900/50 print:bg-white">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-2xl text-amber-500 print:text-amber-600 mb-1">
                PROPMETRIK
              </div>
              <div className="font-mono text-[10px] text-zinc-500 print:text-gray-600">
                Professional Property Valuation Services
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-lg text-white print:text-black">
                VALUATION CERTIFICATE
              </div>
              <div className="font-mono text-xs text-zinc-400 print:text-gray-600">
                Reference: VAL-{valuationId.slice(0, 8).toUpperCase()}
              </div>
              <div className="font-mono text-xs text-zinc-400 print:text-gray-600">
                Date: {reportDate}
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-800 print:border-gray-300 my-4" />

          <div className="grid grid-cols-2 gap-8">
            <div>
              <div className="font-mono text-[10px] text-zinc-500 print:text-gray-500 mb-2">PROPERTY DETAILS</div>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-zinc-500 print:text-gray-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-mono text-sm text-white print:text-black">{property?.address}</div>
                    <div className="font-mono text-xs text-zinc-400 print:text-gray-600">
                      {property?.city}, {property?.region}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Home className="w-4 h-4 text-zinc-500 print:text-gray-500" />
                  <PropertyTypeBadge type={property?.property_type || 'residential'} />
                </div>
              </div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-zinc-500 print:text-gray-500 mb-2">VALUATION SUMMARY</div>
              <div className="text-right">
                <div className="font-mono text-4xl text-green-400 print:text-green-600">
                  ₵{(valuation.final_value_ghs || 0).toLocaleString()}
                </div>
                <div className="font-mono text-[10px] text-zinc-500 print:text-gray-500 mt-1">
                  MARKET VALUE AS AT {reportDate.toUpperCase()}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Property Specifications */}
        <TerminalPanel title="PROPERTY SPECIFICATIONS" className="mb-6 print:border-black">
          <div className="grid grid-cols-4 gap-4">
            <div className="p-3 bg-zinc-800/30 print:bg-gray-100">
              <div className="font-mono text-[10px] text-zinc-500 print:text-gray-500">PLOT SIZE</div>
              <div className="font-mono text-lg text-white print:text-black">
                {property?.plot_size?.toLocaleString() || '—'} sqm
              </div>
            </div>
            <div className="p-3 bg-zinc-800/30 print:bg-gray-100">
              <div className="font-mono text-[10px] text-zinc-500 print:text-gray-500">GROSS FLOOR AREA</div>
              <div className="font-mono text-lg text-white print:text-black">
                {totalGFA.toLocaleString()} sqm
              </div>
            </div>
            <div className="p-3 bg-zinc-800/30 print:bg-gray-100">
              <div className="font-mono text-[10px] text-zinc-500 print:text-gray-500">BEDROOMS</div>
              <div className="font-mono text-lg text-white print:text-black">
                {property?.bedrooms || '—'}
              </div>
            </div>
            <div className="p-3 bg-zinc-800/30 print:bg-gray-100">
              <div className="font-mono text-[10px] text-zinc-500 print:text-gray-500">YEAR BUILT</div>
              <div className="font-mono text-lg text-white print:text-black">
                {property?.year_built || '—'}
              </div>
            </div>
          </div>
        </TerminalPanel>

        {/* HBU Analysis Summary */}
        {hbuAnalysis && (
          <TerminalPanel title="HIGHEST & BEST USE ANALYSIS" className="mb-6 print:border-black">
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className={`p-3 border ${hbuAnalysis.legallyPermissible ? 'border-green-500/50 bg-green-900/10 print:border-green-500 print:bg-green-50' : 'border-red-500/50 bg-red-900/10 print:border-red-500 print:bg-red-50'}`}>
                <div className="flex items-center gap-2">
                  {hbuAnalysis.legallyPermissible ?
                    <CheckCircle2 className="w-4 h-4 text-green-400 print:text-green-600" /> :
                    <span className="text-red-400 print:text-red-600">✗</span>
                  }
                  <span className="font-mono text-xs text-white print:text-black">Legally Permissible</span>
                </div>
              </div>
              <div className={`p-3 border ${hbuAnalysis.physicallyPossible ? 'border-green-500/50 bg-green-900/10 print:border-green-500 print:bg-green-50' : 'border-red-500/50 bg-red-900/10 print:border-red-500 print:bg-red-50'}`}>
                <div className="flex items-center gap-2">
                  {hbuAnalysis.physicallyPossible ?
                    <CheckCircle2 className="w-4 h-4 text-green-400 print:text-green-600" /> :
                    <span className="text-red-400 print:text-red-600">✗</span>
                  }
                  <span className="font-mono text-xs text-white print:text-black">Physically Possible</span>
                </div>
              </div>
              <div className={`p-3 border ${hbuAnalysis.financiallyFeasible ? 'border-green-500/50 bg-green-900/10 print:border-green-500 print:bg-green-50' : 'border-red-500/50 bg-red-900/10 print:border-red-500 print:bg-red-50'}`}>
                <div className="flex items-center gap-2">
                  {hbuAnalysis.financiallyFeasible ?
                    <CheckCircle2 className="w-4 h-4 text-green-400 print:text-green-600" /> :
                    <span className="text-red-400 print:text-red-600">✗</span>
                  }
                  <span className="font-mono text-xs text-white print:text-black">Financially Feasible</span>
                </div>
              </div>
              <div className={`p-3 border ${hbuAnalysis.maximallyProductive ? 'border-green-500/50 bg-green-900/10 print:border-green-500 print:bg-green-50' : 'border-red-500/50 bg-red-900/10 print:border-red-500 print:bg-red-50'}`}>
                <div className="flex items-center gap-2">
                  {hbuAnalysis.maximallyProductive ?
                    <CheckCircle2 className="w-4 h-4 text-green-400 print:text-green-600" /> :
                    <span className="text-red-400 print:text-red-600">✗</span>
                  }
                  <span className="font-mono text-xs text-white print:text-black">Maximally Productive</span>
                </div>
              </div>
            </div>
            {hbuAnalysis.recommendedUse && (
              <div className="pt-3 border-t border-zinc-800 print:border-gray-300">
                <span className="font-mono text-[10px] text-zinc-500 print:text-gray-500">RECOMMENDED USE: </span>
                <span className="font-mono text-sm text-amber-400 print:text-amber-600">{hbuAnalysis.recommendedUse}</span>
              </div>
            )}
          </TerminalPanel>
        )}

        {/* Valuation Methods */}
        {valuation.methodResults && (
          <TerminalPanel title="VALUATION METHODOLOGY" className="mb-6 print:border-black">
            <table className="w-full">
              <thead>
                <tr className="text-[10px] font-mono text-zinc-500 print:text-gray-500 border-b border-zinc-800 print:border-gray-300">
                  <th className="text-left pb-2">METHOD</th>
                  <th className="text-right pb-2">VALUE</th>
                  <th className="text-right pb-2">WEIGHT</th>
                  <th className="text-right pb-2">CONTRIBUTION</th>
                  <th className="text-center pb-2">CONFIDENCE</th>
                </tr>
              </thead>
              <tbody className="font-mono text-sm">
                {Object.entries(valuation.methodResults).map(([method, result]) => {
                  const methodKey = method as ValuationMethod
                  const weight = (reconciliation?.method_weights && reconciliation.method_weights[methodKey]?.weight) || 0
                  const contribution = result.value_ghs * (weight / 100)
                  const isPrimary = valuation.primary_method === method

                  return (
                    <tr key={method} className="border-b border-zinc-800/50 print:border-gray-200">
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <MethodBadge method={methodKey} isPrimary={isPrimary} />
                          {isPrimary && (
                            <span className="font-mono text-[9px] text-amber-400 print:text-amber-600">PRIMARY</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 text-right text-green-400 print:text-green-600">
                        ₵{result.value_ghs.toLocaleString()}
                      </td>
                      <td className="py-3 text-right text-zinc-400 print:text-gray-600">
                        {weight}%
                      </td>
                      <td className="py-3 text-right text-white print:text-black">
                        ₵{contribution.toLocaleString()}
                      </td>
                      <td className="py-3 px-2">
                        <ConfidenceBar score={(result.confidence_score || 0.5) * 100} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-zinc-700 print:border-gray-400">
                  <td colSpan={2} className="py-3 font-bold text-white print:text-black">
                    RECONCILED VALUE
                  </td>
                  <td className="py-3 text-right text-zinc-400 print:text-gray-600">100%</td>
                  <td className="py-3 text-right text-2xl text-green-400 print:text-green-600 font-bold">
                    ₵{(valuation.final_value_ghs || 0).toLocaleString()}
                  </td>
                  <td className="py-3 px-2">
                    <ConfidenceBar score={(valuation.confidence_score || 0.5) * 100} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </TerminalPanel>
        )}

        {/* Value Range */}
        {reconciliation?.value_range_low_ghs && (
          <TerminalPanel title="VALUE RANGE" className="mb-6 print:border-black">
            <div className="flex items-center justify-between">
              <div className="text-center flex-1">
                <div className="font-mono text-[10px] text-zinc-500 print:text-gray-500">LOW</div>
                <div className="font-mono text-xl text-red-400 print:text-red-600">
                  ₵{reconciliation.value_range_low_ghs.toLocaleString()}
                </div>
              </div>
              <div className="text-center flex-1 border-x border-zinc-800 print:border-gray-300">
                <div className="font-mono text-[10px] text-zinc-500 print:text-gray-500">MOST PROBABLE</div>
                <div className="font-mono text-2xl text-green-400 print:text-green-600 font-bold">
                  ₵{(valuation.final_value_ghs || 0).toLocaleString()}
                </div>
              </div>
              <div className="text-center flex-1">
                <div className="font-mono text-[10px] text-zinc-500 print:text-gray-500">HIGH</div>
                <div className="font-mono text-xl text-green-400 print:text-green-600">
                  ₵{reconciliation.value_range_high_ghs?.toLocaleString() || '—'}
                </div>
              </div>
            </div>
          </TerminalPanel>
        )}

        {/* Certification */}
        <div className="border border-zinc-800 print:border-black p-6 bg-zinc-900/50 print:bg-gray-50">
          <div className="flex items-start gap-4">
            <Shield className="w-8 h-8 text-amber-500 print:text-amber-600 flex-shrink-0" />
            <div>
              <div className="font-mono text-sm text-white print:text-black mb-2">VALUATION CERTIFICATION</div>
              <div className="font-mono text-xs text-zinc-400 print:text-gray-600 leading-relaxed">
                I hereby certify that to the best of my knowledge and belief, the statements of fact contained in this report
                are true and correct, and the reported analyses, opinions, and conclusions are limited only by the reported
                assumptions and limiting conditions and are my impartial and unbiased professional analyses, opinions, and conclusions.
              </div>
              <div className="mt-4 pt-4 border-t border-zinc-800 print:border-gray-300">
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <div className="font-mono text-[10px] text-zinc-500 print:text-gray-500 mb-1">VALUER</div>
                    <div className="font-mono text-sm text-white print:text-black">
                      {valuation.created_by || 'Certified Valuer'}
                    </div>
                    <div className="font-mono text-xs text-zinc-400 print:text-gray-600">
                      GhIS Reg. No: {'XXXXX'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[10px] text-zinc-500 print:text-gray-500 mb-1">DATE</div>
                    <div className="font-mono text-sm text-white print:text-black">{reportDate}</div>
                    <div className="font-mono text-xs text-zinc-400 print:text-gray-600">
                      Valid for 6 months from date of issue
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <div className="font-mono text-[9px] text-zinc-600 print:text-gray-500">
            This valuation report is prepared in accordance with Ghana Institution of Surveyors (GhIS) standards
            and International Valuation Standards (IVS). This report is confidential and intended solely for the
            stated purpose. Reproduction without authorization is prohibited.
          </div>
          <div className="font-mono text-[9px] text-zinc-500 print:text-gray-400 mt-2">
            PROPMETRIK • Professional Property Valuation Services • Ghana
          </div>
        </div>
      </div>

      {/* Navigation - Not printed */}
      <div className="mt-6 flex justify-between print:hidden">
        <Link
          href={`/dashboard/valuations/${valuationId}/reconciliation`}
          className="px-6 py-3 bg-zinc-800 text-zinc-400 font-mono text-sm hover:text-white transition-colors"
        >
          ← BACK TO RECONCILIATION
        </Link>
        <Link
          href="/dashboard/valuations"
          className="px-6 py-3 bg-amber-500 text-black font-mono text-sm font-bold hover:bg-amber-400 transition-colors"
        >
          RETURN TO DASHBOARD
        </Link>
      </div>
    </div>
  )
}
