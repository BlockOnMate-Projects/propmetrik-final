'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect, useMemo } from 'react'
import {
  TerminalPanel,
  StatusBadge,
  AlertBanner,
  MethodBadge,
  Currency,
  ConfidenceBar,
  StepIndicator,
  Sparkline,
} from '@/components/ui/terminal'
import { valuationsApi, reconciliationApi, sensitivityApi } from '@/lib/valuation-api'
import type { Valuation, MethodResult, Reconciliation } from '@/types/valuation'
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Scale,
  Info,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Sliders,
} from 'lucide-react'

export default function ReconciliationPage() {
  const params = useParams()
  const router = useRouter()
  const valuationId = params.id as string

  const [valuation, setValuation] = useState<Valuation | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Method results from valuation
  const [methodResults, setMethodResults] = useState<Record<string, MethodResult>>({})

  // Reconciliation weights
  const [weights, setWeights] = useState<Record<string, number>>({})
  const [reconciliationNotes, setReconciliationNotes] = useState('')
  const [adjustmentRationale, setAdjustmentRationale] = useState('')
  const [reconciliationId, setReconciliationId] = useState<string | null>(null)

  // Sensitivity analysis
  const [showSensitivity, setShowSensitivity] = useState(false)
  const [sensitivityRange, setSensitivityRange] = useState(10) // +/- percentage

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

        // Get method results
        if (valuationRes.data.methodResults) {
          setMethodResults(valuationRes.data.methodResults)
          // Initialize weights from valuation or equal distribution
          const methods = Object.keys(valuationRes.data.methodResults)
          if (valuationRes.data.methodWeights) {
            setWeights(valuationRes.data.methodWeights)
          } else {
            const equalWeight = Math.floor(100 / methods.length)
            const initialWeights: Record<string, number> = {}
            methods.forEach(m => { initialWeights[m] = equalWeight })
            setWeights(initialWeights)
          }
        }

        // Fetch existing reconciliation
        const reconRes = await reconciliationApi.getByValuation(valuationId)
        if (reconRes.data) {
          setReconciliationId(reconRes.data.id)
          if (reconRes.data.weights) setWeights(reconRes.data.weights)
          if (reconRes.data.reconciliation_narrative) setReconciliationNotes(reconRes.data.reconciliation_narrative)
          if (reconRes.data.special_assumptions) setAdjustmentRationale(reconRes.data.special_assumptions.join('\n'))
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load valuation')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [valuationId])

  // Calculate reconciled value
  const reconciledValue = useMemo(() => {
    if (Object.keys(methodResults).length === 0) return 0

    let weightedSum = 0
    let totalWeight = 0

    Object.entries(methodResults).forEach(([method, result]) => {
      const weight = weights[method] || 0
      weightedSum += result.value_ghs * (weight / 100)
      totalWeight += weight
    })

    return totalWeight > 0 ? weightedSum : 0
  }, [methodResults, weights])

  // Calculate value range
  const valueRange = useMemo(() => {
    const values = Object.values(methodResults).map(r => r.value_ghs)
    if (values.length === 0) return { low: 0, high: 0, spread: 0 }

    const low = Math.min(...values)
    const high = Math.max(...values)
    const spread = high > 0 ? ((high - low) / high) * 100 : 0

    return { low, high, spread }
  }, [methodResults])

  // Calculate confidence score
  const confidenceScore = useMemo(() => {
    if (Object.keys(methodResults).length === 0) return 0

    let weightedConfidence = 0
    let totalWeight = 0

    Object.entries(methodResults).forEach(([method, result]) => {
      const weight = weights[method] || 0
      weightedConfidence += (result.confidence_score || 0.5) * weight
      totalWeight += weight
    })

    return totalWeight > 0 ? weightedConfidence / totalWeight : 0
  }, [methodResults, weights])

  // Sensitivity data
  const sensitivityData = useMemo(() => {
    const points = []
    for (let i = -sensitivityRange; i <= sensitivityRange; i += 2) {
      const adjustedValue = reconciledValue * (1 + i / 100)
      points.push(adjustedValue)
    }
    return points
  }, [reconciledValue, sensitivityRange])

  // Update weight
  const updateWeight = (method: string, weight: number) => {
    setWeights({ ...weights, [method]: Math.max(0, Math.min(100, weight)) })
  }

  // Auto-balance weights
  const autoBalance = () => {
    const methods = Object.keys(methodResults)
    const equalWeight = Math.floor(100 / methods.length)
    const remainder = 100 - (equalWeight * methods.length)

    const newWeights: Record<string, number> = {}
    methods.forEach((m, i) => {
      newWeights[m] = equalWeight + (i === 0 ? remainder : 0)
    })
    setWeights(newWeights)
  }

  // Weight by confidence
  const weightByConfidence = () => {
    const totalConfidence = Object.values(methodResults).reduce((sum, r) => sum + (r.confidence_score || 0.5), 0)

    const newWeights: Record<string, number> = {}
    Object.entries(methodResults).forEach(([method, result]) => {
      newWeights[method] = Math.round(((result.confidence_score || 0.5) / totalConfidence) * 100)
    })
    setWeights(newWeights)
  }

  // Calculate total weight
  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0)

  // Save and continue
  const handleSaveAndContinue = async () => {
    try {
      setSaving(true)
      setError(null)

      if (Math.abs(totalWeight - 100) > 1) {
        throw new Error('Weights must sum to 100%')
      }

      let currentReconId = reconciliationId

      // Create reconciliation if it doesn't exist
      if (!currentReconId) {
        // Prepare method results for API
        const apiMethodResults: Record<string, any> = {}
        Object.entries(methodResults).forEach(([method, result]) => {
          apiMethodResults[method] = {
            method,
            value: result.value_ghs,
            confidence_score: result.confidence_score || 0.5,
            data_quality_score: 0.8, // Default
            weight: weights[method] || 0
          }
        })

        const createRes = await reconciliationApi.create(valuationId, {
          method_results: apiMethodResults,
          weighting_method: 'manual'
        })

        if (!createRes.success || !createRes.data) {
          throw new Error(createRes.error || 'Failed to create reconciliation')
        }
        currentReconId = createRes.data.id
        setReconciliationId(currentReconId)
      } else {
        // Update weights
        await reconciliationApi.setWeights(currentReconId, { weights })
      }

      // Finalize reconciliation
      await reconciliationApi.finalize(currentReconId, {
        final_value_selection: 'manual',
        final_market_value: reconciledValue,
        reconciliation_narrative: reconciliationNotes,
        special_assumptions: adjustmentRationale ? adjustmentRationale.split('\n').filter(Boolean) : [],
      })

      // Update valuation with final value
      await valuationsApi.update(valuationId, {
        final_value_ghs: reconciledValue,
        confidence_score: confidenceScore,
        current_step: 8,
        status: 'pending_review',
      })

      // Navigate to report
      router.push(`/dashboard/valuations/${valuationId}/report`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save reconciliation')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        <span className="ml-3 font-mono text-sm text-zinc-400">Loading reconciliation...</span>
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

  const methods = Object.keys(methodResults)

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
              <h1 className="font-mono text-xl text-white">STEP 7: RECONCILIATION</h1>
              <StatusBadge status="in_progress" />
            </div>
            <p className="font-mono text-[10px] text-zinc-500">
              Final Value Determination • VAL-{valuationId.slice(0, 8).toUpperCase()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSensitivity(!showSensitivity)}
            className={`flex items-center gap-2 px-3 py-2 font-mono text-xs transition-colors ${showSensitivity ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
          >
            <Sliders className="w-3 h-3" />
            SENSITIVITY
          </button>
          <button
            onClick={handleSaveAndContinue}
            disabled={saving || Math.abs(totalWeight - 100) > 1}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-mono text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                SAVING...
              </>
            ) : (
              <>
                FINALIZE VALUE
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
            { id: 2, label: 'HBU Analysis', status: 'completed' },
            { id: 3, label: 'Method Selection', status: 'completed' },
            { id: 4, label: 'Valuation', status: 'completed' },
            { id: 5, label: 'Reconciliation', status: 'current' },
            { id: 6, label: 'Report', status: 'upcoming' },
          ]}
        />
      </div>

      {/* Error Alert */}
      {error && <AlertBanner type="error" title="Error" message={error} />}

      {/* Main Content Grid */}
      <div className="grid grid-cols-3 gap-4">
        {/* Method Values */}
        <TerminalPanel title="METHOD RESULTS" className="col-span-2">
          {methods.length === 0 ? (
            <div className="text-center py-12">
              <Scale className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <div className="font-mono text-sm text-zinc-500">No method results available</div>
              <div className="font-mono text-[10px] text-zinc-600 mt-1">
                Complete the valuation steps first
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {methods.map((method) => {
                const result = methodResults[method]
                const weight = weights[method] || 0
                const contribution = result.value_ghs * (weight / 100)
                const isPrimary = valuation.primary_method === method

                return (
                  <div
                    key={method}
                    className={`p-4 border transition-colors ${isPrimary ? 'border-amber-500/50 bg-amber-500/5' : 'border-zinc-800 bg-zinc-900/50'
                      }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <MethodBadge method={method} isPrimary={isPrimary} />
                        <div>
                          <div className="font-mono text-xs text-zinc-500">Confidence</div>
                          <ConfidenceBar score={(result.confidence_score || 0.5) * 100} size="sm" />
                        </div>
                      </div>
                      <Currency value={result.value_ghs} size="lg" />
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-[10px] text-zinc-500">WEIGHT:</span>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={weight}
                            onChange={(e) => updateWeight(method, parseInt(e.target.value))}
                            className="flex-1 accent-amber-500"
                          />
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={weight}
                            onChange={(e) => updateWeight(method, parseInt(e.target.value) || 0)}
                            className="w-14 px-2 py-1 bg-zinc-800 border border-zinc-700 text-white font-mono text-xs text-center focus:outline-none focus:border-amber-500/50"
                          />
                          <span className="font-mono text-[10px] text-zinc-500">%</span>
                        </div>
                      </div>
                      <div className="text-right w-32">
                        <div className="font-mono text-[10px] text-zinc-500">CONTRIBUTION</div>
                        <Currency value={contribution} size="sm" />
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Weight Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
                <div className="flex items-center gap-2">
                  <button
                    onClick={autoBalance}
                    className="px-3 py-1.5 bg-zinc-800 text-zinc-400 font-mono text-[10px] hover:text-white transition-colors"
                  >
                    EQUAL WEIGHTS
                  </button>
                  <button
                    onClick={weightByConfidence}
                    className="px-3 py-1.5 bg-zinc-800 text-zinc-400 font-mono text-[10px] hover:text-white transition-colors"
                  >
                    WEIGHT BY CONFIDENCE
                  </button>
                </div>
                <div className={`font-mono text-xs ${Math.abs(totalWeight - 100) <= 1 ? 'text-green-400' : 'text-red-400'
                  }`}>
                  TOTAL: {totalWeight}%
                  {Math.abs(totalWeight - 100) > 1 && ' ⚠'}
                </div>
              </div>
            </div>
          )}
        </TerminalPanel>

        {/* Final Value */}
        <div className="space-y-4">
          <TerminalPanel title="RECONCILED VALUE">
            <div className="text-center py-6">
              <div className="font-mono text-4xl text-green-400 mb-2">
                ₵{reconciledValue.toLocaleString()}
              </div>
              <div className="font-mono text-[10px] text-zinc-500">FINAL MARKET VALUE</div>

              <div className="mt-4 pt-4 border-t border-zinc-800">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-mono text-[10px] text-zinc-500">CONFIDENCE SCORE</span>
                  <span className="font-mono text-xs text-zinc-400">{(confidenceScore * 100).toFixed(0)}%</span>
                </div>
                <ConfidenceBar score={confidenceScore * 100} showValue={false} />
              </div>
            </div>
          </TerminalPanel>

          <TerminalPanel title="VALUE RANGE">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-mono text-[10px] text-zinc-500">LOW</div>
                  <Currency value={valueRange.low} size="sm" />
                </div>
                <div className="text-center">
                  <div className="font-mono text-[10px] text-zinc-500">SPREAD</div>
                  <div className={`font-mono text-lg ${valueRange.spread < 10 ? 'text-green-400' :
                    valueRange.spread < 20 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                    {valueRange.spread.toFixed(1)}%
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[10px] text-zinc-500">HIGH</div>
                  <Currency value={valueRange.high} size="sm" />
                </div>
              </div>

              {valueRange.spread > 15 && (
                <div className="p-2 bg-yellow-900/20 border border-yellow-500/30">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div className="font-mono text-[10px] text-yellow-400">
                      High variance between methods. Consider reviewing assumptions.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TerminalPanel>

          <TerminalPanel title="STATISTICS">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-zinc-800/50">
                <div className="font-mono text-[10px] text-zinc-500">METHODS USED</div>
                <div className="font-mono text-xl text-white">{methods.length}</div>
              </div>
              <div className="p-3 bg-zinc-800/50">
                <div className="font-mono text-[10px] text-zinc-500">PRIMARY</div>
                <div className="font-mono text-xs text-amber-400 mt-1">
                  {valuation.primary_method?.replace('_', ' ').toUpperCase() || '—'}
                </div>
              </div>
            </div>
          </TerminalPanel>
        </div>
      </div>

      {/* Sensitivity Analysis */}
      {showSensitivity && (
        <TerminalPanel title="SENSITIVITY ANALYSIS" className="mt-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-zinc-500">RANGE:</span>
              <select
                value={sensitivityRange}
                onChange={(e) => setSensitivityRange(parseInt(e.target.value))}
                className="px-2 py-1 bg-zinc-800 border border-zinc-700 text-white font-mono text-xs focus:outline-none"
              >
                <option value={5}>±5%</option>
                <option value={10}>±10%</option>
                <option value={15}>±15%</option>
                <option value={20}>±20%</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-11 gap-1">
            {sensitivityData.map((value, idx) => {
              const percentChange = ((idx - sensitivityData.length / 2) * 2)
              const isCenter = Math.abs(percentChange) < 1

              return (
                <div
                  key={idx}
                  className={`p-2 text-center ${isCenter ? 'bg-amber-500/20 border border-amber-500' : 'bg-zinc-800/50'
                    }`}
                >
                  <div className={`font-mono text-[10px] ${percentChange < 0 ? 'text-red-400' : percentChange > 0 ? 'text-green-400' : 'text-zinc-400'
                    }`}>
                    {percentChange > 0 ? '+' : ''}{percentChange.toFixed(0)}%
                  </div>
                  <div className="font-mono text-xs text-white mt-1">
                    ₵{(value / 1000).toFixed(0)}K
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex justify-center">
            <Sparkline data={sensitivityData} width={600} height={40} showDots />
          </div>
        </TerminalPanel>
      )}

      {/* Reconciliation Notes */}
      <TerminalPanel title="RECONCILIATION RATIONALE" className="mt-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">WEIGHT RATIONALE</label>
            <textarea
              value={reconciliationNotes}
              onChange={(e) => setReconciliationNotes(e.target.value)}
              placeholder="Explain your reasoning for the weight distribution..."
              rows={4}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 resize-none"
            />
          </div>
          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">ADJUSTMENTS & OBSERVATIONS</label>
            <textarea
              value={adjustmentRationale}
              onChange={(e) => setAdjustmentRationale(e.target.value)}
              placeholder="Document any adjustments made and why..."
              rows={4}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 resize-none"
            />
          </div>
        </div>
      </TerminalPanel>

      {/* Navigation */}
      <div className="mt-6 flex justify-between">
        <Link
          href={`/dashboard/valuations/${valuationId}/methods`}
          className="px-6 py-3 bg-zinc-800 text-zinc-400 font-mono text-sm hover:text-white transition-colors"
        >
          ← BACK TO METHODS
        </Link>
        <button
          onClick={handleSaveAndContinue}
          disabled={saving || Math.abs(totalWeight - 100) > 1}
          className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-black font-mono text-sm font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              SAVING...
            </>
          ) : (
            <>
              GENERATE REPORT
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  )
}
