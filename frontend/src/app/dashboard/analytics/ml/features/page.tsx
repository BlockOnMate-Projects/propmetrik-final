'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  Brain,
  Layers,
  Search,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Info,
  BarChart3,
} from 'lucide-react'

// =====================================================
// TYPES
// =====================================================

interface FeatureImportance {
  feature_name: string
  importance_score: number
  direction: string
  category: string
  description: string
}

interface FeatureContribution {
  feature: string
  contribution: number
  direction: string
  importance: number
}

interface PredictionExplanation {
  prediction_id: string
  predicted_value: number
  feature_contributions: FeatureContribution[]
  top_positive: string[]
  top_negative: string[]
  confidence_factors: Record<string, any>
}

// =====================================================
// API
// =====================================================

const API_BASE = '/api/analytics/ml'

async function fetchData<T>(endpoint: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`)
    if (!res.ok) return null
    const json = await res.json()
    return json.data ?? null
  } catch {
    return null
  }
}

// =====================================================
// SHARED COMPONENTS
// =====================================================

function Panel({
  title,
  children,
  className,
  actions,
}: {
  title: string
  children: React.ReactNode
  className?: string
  actions?: React.ReactNode
}) {
  return (
    <div className={cn('border border-zinc-800 bg-zinc-900/50', className)}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-800">
        <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
        {actions}
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    location: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    physical: 'text-green-400 bg-green-500/10 border-green-500/20',
    financial: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    market: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    temporal: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    condition: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  }
  return (
    <span
      className={cn(
        'px-1.5 py-0.5 font-mono text-[9px] border rounded',
        colors[category] || 'text-zinc-400 border-zinc-700'
      )}
    >
      {category.toUpperCase()}
    </span>
  )
}

function DirectionArrow({ direction }: { direction: string }) {
  const isPositive = direction === 'positive'
  return (
    <span className={cn('inline-flex items-center', isPositive ? 'text-green-400' : 'text-red-400')}>
      {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
    </span>
  )
}

// =====================================================
// PAGE COMPONENT
// =====================================================

export default function FeatureImportancePage() {
  const [features, setFeatures] = useState<FeatureImportance[]>([])
  const [explanation, setExplanation] = useState<PredictionExplanation | null>(null)
  const [predictionId, setPredictionId] = useState('')
  const [explainLoading, setExplainLoading] = useState(false)
  const [explainError, setExplainError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  const loadData = useCallback(async () => {
    setLoading(true)
    const data = await fetchData<{ features: FeatureImportance[]; count: number }>('/features')
    setFeatures(data?.features || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleExplain = useCallback(async () => {
    if (!predictionId.trim()) return
    setExplainLoading(true)
    setExplainError(null)
    try {
      const res = await fetch(`${API_BASE}/predictions/${predictionId.trim()}/explain`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        setExplainError(err.error || `HTTP ${res.status}`)
        setExplanation(null)
      } else {
        const json = await res.json()
        setExplanation(json.data ?? null)
      }
    } catch {
      setExplainError('Network error')
      setExplanation(null)
    }
    setExplainLoading(false)
  }, [predictionId])

  const categories = ['all', ...Array.from(new Set(features.map((f) => f.category)))]
  const filteredFeatures =
    selectedCategory === 'all' ? features : features.filter((f) => f.category === selectedCategory)

  const maxImportance = Math.max(...features.map((f) => f.importance_score), 0.01)

  // Group features by category for summary
  const categoryGroups = features.reduce(
    (acc, f) => {
      if (!acc[f.category]) acc[f.category] = { count: 0, totalImportance: 0 }
      acc[f.category].count++
      acc[f.category].totalImportance += f.importance_score
      return acc
    },
    {} as Record<string, { count: number; totalImportance: number }>
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-800 rounded w-72" />
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-8 h-96 bg-zinc-800/50 rounded border border-zinc-800" />
            <div className="col-span-4 h-96 bg-zinc-800/50 rounded border border-zinc-800" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-mono text-xl text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-500" />
            FEATURE IMPORTANCE & SHAP ANALYSIS
          </h1>
          <p className="font-mono text-[10px] text-zinc-500">
            Global feature rankings, category breakdown & per-prediction explanations — Section 8.2
          </p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] text-zinc-400 border border-zinc-700 hover:border-amber-500/50 hover:text-amber-500 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          REFRESH
        </button>
      </div>

      {/* Category Summary */}
      <div className="grid grid-cols-6 gap-3 mb-4">
        {Object.entries(categoryGroups).map(([cat, grp]) => (
          <Panel key={cat} title={cat.toUpperCase()}>
            <div className="text-center py-1">
              <div className="font-mono text-2xl text-white">{grp.count}</div>
              <div className="font-mono text-[10px] text-zinc-500">FEATURES</div>
              <div className="font-mono text-[10px] text-amber-400 mt-0.5">
                Σ {(grp.totalImportance * 100).toFixed(1)}%
              </div>
            </div>
          </Panel>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-3 mb-4">
        {/* Feature Ranking (Horizontal Bars) */}
        <Panel
          title="FEATURE IMPORTANCE RANKING"
          className="col-span-8"
          actions={
            <div className="flex items-center gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    'px-1.5 py-0.5 font-mono text-[9px] border rounded transition-colors',
                    selectedCategory === cat
                      ? 'text-amber-400 border-amber-500/50 bg-amber-500/10'
                      : 'text-zinc-500 border-zinc-700 hover:border-zinc-600'
                  )}
                >
                  {cat.toUpperCase()}
                </button>
              ))}
            </div>
          }
        >
          <div className="space-y-1.5">
            {filteredFeatures
              .sort((a, b) => b.importance_score - a.importance_score)
              .map((f, idx) => (
                <div key={f.feature_name} className="group">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-zinc-600 w-4 text-right">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] text-zinc-200 truncate">
                            {f.feature_name.replace(/_/g, ' ').toUpperCase()}
                          </span>
                          <DirectionArrow direction={f.direction} />
                          <CategoryBadge category={f.category} />
                        </div>
                        <span className="font-mono text-[10px] text-amber-400 tabular-nums">
                          {(f.importance_score * 100).toFixed(2)}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-800 rounded overflow-hidden">
                        <div
                          className="h-full bg-amber-500/70 rounded transition-all"
                          style={{ width: `${(f.importance_score / maxImportance) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  {f.description && (
                    <div className="ml-6 mt-0.5 font-mono text-[9px] text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      {f.description}
                    </div>
                  )}
                </div>
              ))}
          </div>
          {filteredFeatures.length === 0 && (
            <div className="font-mono text-[10px] text-zinc-600 text-center py-6">
              No features for selected category
            </div>
          )}
        </Panel>

        {/* Category Breakdown */}
        <Panel title="CATEGORY BREAKDOWN" className="col-span-4">
          <div className="space-y-3">
            {Object.entries(categoryGroups)
              .sort((a, b) => b[1].totalImportance - a[1].totalImportance)
              .map(([cat, grp]) => {
                const pct = (grp.totalImportance / features.reduce((s, f) => s + f.importance_score, 0)) * 100
                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <CategoryBadge category={cat} />
                        <span className="font-mono text-[10px] text-zinc-400">{grp.count} features</span>
                      </div>
                      <span className="font-mono text-[10px] text-white">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-800 rounded overflow-hidden">
                      <div className="h-full bg-amber-500/50 rounded" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}

            {/* Top 3 overall */}
            <div className="border-t border-zinc-800 pt-3 mt-4">
              <div className="font-mono text-[9px] text-zinc-500 mb-2">TOP 3 FEATURES</div>
              {features
                .sort((a, b) => b.importance_score - a.importance_score)
                .slice(0, 3)
                .map((f, i) => (
                  <div key={f.feature_name} className="flex items-center gap-2 py-1">
                    <span className="font-mono text-[10px] text-amber-400 w-4">{i + 1}.</span>
                    <span className="font-mono text-[10px] text-zinc-300 flex-1 truncate">
                      {f.feature_name.replace(/_/g, ' ')}
                    </span>
                    <span className="font-mono text-[10px] text-white tabular-nums">
                      {(f.importance_score * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </Panel>
      </div>

      {/* Prediction Explainer */}
      <Panel
        title="PREDICTION EXPLAINER"
        actions={
          <div className="flex items-center gap-1">
            <Info className="w-3 h-3 text-zinc-600" />
            <span className="font-mono text-[9px] text-zinc-600">Enter a prediction ID to see SHAP breakdown</span>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
              <input
                type="text"
                value={predictionId}
                onChange={(e) => setPredictionId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleExplain()}
                placeholder="Prediction ID (e.g., pred-abc-123)"
                className="w-full pl-7 pr-3 py-1.5 bg-zinc-900 border border-zinc-700 font-mono text-[10px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50"
              />
            </div>
            <button
              onClick={handleExplain}
              disabled={explainLoading || !predictionId.trim()}
              className={cn(
                'px-4 py-1.5 font-mono text-[10px] border transition-colors',
                explainLoading || !predictionId.trim()
                  ? 'text-zinc-600 border-zinc-800 cursor-not-allowed'
                  : 'text-amber-400 border-amber-500/50 hover:bg-amber-500/10'
              )}
            >
              {explainLoading ? 'ANALYZING...' : 'EXPLAIN'}
            </button>
          </div>

          {explainError && (
            <div className="p-2 border border-red-500/30 bg-red-500/5 font-mono text-[10px] text-red-400">
              {explainError}
            </div>
          )}

          {explanation && (
            <div className="grid grid-cols-12 gap-3">
              {/* Contributions bar chart */}
              <div className="col-span-8 space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[10px] text-zinc-400">FEATURE CONTRIBUTIONS</span>
                  <span className="font-mono text-[10px] text-zinc-300">
                    Predicted: GH₵{explanation.predicted_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
                {explanation.feature_contributions
                  .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
                  .slice(0, 15)
                  .map((c) => {
                    const maxContrib = Math.max(
                      ...explanation.feature_contributions.map((x) => Math.abs(x.contribution)),
                      0.01
                    )
                    const pct = (Math.abs(c.contribution) / maxContrib) * 100
                    const isPos = c.contribution >= 0
                    return (
                      <div key={c.feature} className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-zinc-400 w-32 text-right truncate">
                          {c.feature.replace(/_/g, ' ')}
                        </span>
                        <div className="flex-1 flex items-center">
                          <div className="w-1/2 flex justify-end">
                            {!isPos && (
                              <div
                                className="h-2 bg-red-500/70 rounded-l"
                                style={{ width: `${pct}%` }}
                              />
                            )}
                          </div>
                          <div className="w-px h-4 bg-zinc-600" />
                          <div className="w-1/2">
                            {isPos && (
                              <div
                                className="h-2 bg-green-500/70 rounded-r"
                                style={{ width: `${pct}%` }}
                              />
                            )}
                          </div>
                        </div>
                        <span
                          className={cn(
                            'font-mono text-[10px] w-20 text-right tabular-nums',
                            isPos ? 'text-green-400' : 'text-red-400'
                          )}
                        >
                          {isPos ? '+' : ''}{c.contribution.toFixed(4)}
                        </span>
                      </div>
                    )
                  })}
              </div>

              {/* Top drivers */}
              <div className="col-span-4 space-y-3">
                <div>
                  <div className="font-mono text-[9px] text-zinc-500 mb-1">TOP POSITIVE DRIVERS</div>
                  {explanation.top_positive.map((f) => (
                    <div key={f} className="flex items-center gap-1 py-0.5">
                      <ArrowUpRight className="w-3 h-3 text-green-400" />
                      <span className="font-mono text-[10px] text-green-300">{f.replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="font-mono text-[9px] text-zinc-500 mb-1">TOP NEGATIVE DRIVERS</div>
                  {explanation.top_negative.map((f) => (
                    <div key={f} className="flex items-center gap-1 py-0.5">
                      <ArrowDownRight className="w-3 h-3 text-red-400" />
                      <span className="font-mono text-[10px] text-red-300">{f.replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                </div>
                {explanation.confidence_factors && Object.keys(explanation.confidence_factors).length > 0 && (
                  <div className="border-t border-zinc-800 pt-2">
                    <div className="font-mono text-[9px] text-zinc-500 mb-1">CONFIDENCE FACTORS</div>
                    {Object.entries(explanation.confidence_factors).map(([key, val]) => (
                      <div key={key} className="flex justify-between font-mono text-[10px] py-0.5">
                        <span className="text-zinc-500">{key.replace(/_/g, ' ').toUpperCase()}</span>
                        <span className="text-white">{typeof val === 'number' ? val.toFixed(3) : String(val)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {!explanation && !explainError && !explainLoading && (
            <div className="text-center py-6">
              <BarChart3 className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
              <div className="font-mono text-[10px] text-zinc-600">
                Enter a prediction ID above to see a SHAP-based feature contribution breakdown
              </div>
            </div>
          )}
        </div>
      </Panel>
    </div>
  )
}
