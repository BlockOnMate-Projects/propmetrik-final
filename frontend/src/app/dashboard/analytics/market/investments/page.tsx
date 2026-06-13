'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { authedFetch } from '@/lib/authed-fetch'
import Link from 'next/link'
import {
  TrendingUp,
  ArrowLeft,
  RefreshCw,
  Shield,
  AlertTriangle,
  Target,
  Activity,
  ChevronRight,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'

// =====================================================
// TYPES
// =====================================================

interface InvestmentOpportunity {
  region: string
  property_type: string
  opportunity_score: number
  opportunity_factors: {
    cap_rate_score: number
    price_growth_score: number
    rental_yield_score: number
    absorption_score: number
    risk_score: number
  }
  cap_rate: number
  avg_price_growth_yoy: number
  avg_rental_growth_yoy: number
  vacancy_rate: number
  absorption_rate: number
  inventory_months: number
  risk_level: string
  market_condition: string
  recommendation: string
}

interface RegionalComparison {
  region: string
  opportunity_score: number
  cap_rate: number
  price_growth: number
  rental_yield: number
  vacancy_rate: number
  risk_level: string
  transaction_count: number
}

interface RentalSummary {
  region: string
  property_type: string
  avg_rent_monthly: number
  median_rent_monthly: number
  avg_rent_per_sqm: number
  rental_transaction_count: number
  gross_yield_pct: number
  vacancy_rate_pct: number
}

// =====================================================
// API
// =====================================================

const API_BASE = '/api/analytics/market'

async function fetchData<T>(endpoint: string): Promise<T | null> {
  try {
    const res = await authedFetch(`${API_BASE}${endpoint}`)
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
    <div className={cn('border border-border bg-card/50', className)}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border">
        <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
        {actions}
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

function formatCurrency(val: number): string {
  if (val >= 1_000_000) return `GH₵${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `GH₵${(val / 1_000).toFixed(0)}K`
  return `GH₵${val.toFixed(0)}`
}

function formatRegion(region: string): string {
  return region
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function formatPropertyType(pt: string): string {
  return pt
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70
      ? 'text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/20'
      : score >= 55
        ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20'
        : score >= 40
          ? 'text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
          : 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20'
  return (
    <span className={cn('px-2 py-0.5 font-mono text-xs font-bold border rounded', color)}>
      {score}
    </span>
  )
}

function RiskBadge({ level }: { level: string }) {
  const color =
    level === 'low'
      ? 'text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/20'
      : level === 'moderate'
        ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20'
        : 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20'
  const Icon = level === 'low' ? Shield : level === 'moderate' ? Target : AlertTriangle
  return (
    <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 font-mono text-[9px] border rounded uppercase', color)}>
      <Icon className="w-3 h-3" />
      {level}
    </span>
  )
}

function RecommendationBadge({ rec }: { rec: string }) {
  const color =
    rec === 'Strong Buy'
      ? 'text-green-600 dark:text-green-400'
      : rec === 'Buy'
        ? 'text-emerald-600 dark:text-emerald-400'
        : rec === 'Hold'
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-red-600 dark:text-red-400'
  return <span className={cn('font-mono text-[10px] font-bold', color)}>{rec.toUpperCase()}</span>
}

function FactorBar({ label, value, max = 20 }: { label: string; value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 font-mono text-[9px] text-muted-foreground uppercase">{label}</div>
      <div className="flex-1 h-2 bg-muted rounded">
        <div className="h-full bg-amber-500/80 rounded" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-8 text-right font-mono text-[10px] text-muted-foreground">{value.toFixed(1)}</div>
    </div>
  )
}

// =====================================================
// PAGE COMPONENT
// =====================================================

export default function InvestmentOpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<InvestmentOpportunity[]>([])
  const [regional, setRegional] = useState<RegionalComparison[]>([])
  const [rental, setRental] = useState<RentalSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [oppsData, regionData, rentalData] = await Promise.all([
      fetchData<InvestmentOpportunity[]>('/investment/opportunities'),
      fetchData<RegionalComparison[]>('/investment/regional'),
      fetchData<RentalSummary[]>('/rental/summary'),
    ])
    setOpportunities(oppsData || [])
    setRegional(regionData || [])
    setRental(rentalData || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredOpps = selectedRegion
    ? opportunities.filter((o) => o.region === selectedRegion)
    : opportunities

  const topScore =
    opportunities.length > 0
      ? Math.max(...opportunities.map((o) => o.opportunity_score))
      : 0
  const avgScore =
    opportunities.length > 0
      ? Math.round(opportunities.reduce((s, o) => s + o.opportunity_score, 0) / opportunities.length)
      : 0

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-72" />
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-muted/50 rounded border border-border" />
            ))}
          </div>
          <div className="h-64 bg-muted/50 rounded border border-border" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/analytics"
            className="flex items-center gap-1 px-2 py-1 font-mono text-[10px] text-muted-foreground hover:text-amber-500 border border-border hover:border-border transition-colors"
          >
            <ArrowLeft className="w-3 h-3" /> MARKET
          </Link>
          <div>
            <h1 className="font-mono text-xl text-foreground">INVESTMENT FINDER</h1>
            <p className="font-mono text-[10px] text-muted-foreground">
              Opportunity Scoring & Regional Investment Analysis
            </p>
          </div>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] text-muted-foreground hover:text-amber-500 border border-border hover:border-border transition-colors"
        >
          <RefreshCw className="w-3 h-3" /> REFRESH
        </button>
      </div>

      {/* Score KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <Panel title="TOP SCORE">
          <div className="text-center">
            <TrendingUp className="w-4 h-4 mx-auto mb-1 text-green-600 dark:text-green-400" />
            <div className="font-mono text-2xl text-green-600 dark:text-green-400">{topScore || '—'}</div>
            <div className="font-mono text-[10px] text-muted-foreground mt-1">BEST OPPORTUNITY</div>
          </div>
        </Panel>
        <Panel title="AVG SCORE">
          <div className="text-center">
            <Target className="w-4 h-4 mx-auto mb-1 text-amber-500" />
            <div className="font-mono text-2xl text-amber-600 dark:text-amber-400">{avgScore || '—'}</div>
            <div className="font-mono text-[10px] text-muted-foreground mt-1">ALL REGIONS</div>
          </div>
        </Panel>
        <Panel title="REGIONS TRACKED">
          <div className="text-center">
            <BarChart3 className="w-4 h-4 mx-auto mb-1 text-blue-600 dark:text-blue-400" />
            <div className="font-mono text-2xl text-blue-600 dark:text-blue-400">{regional.length || '—'}</div>
            <div className="font-mono text-[10px] text-muted-foreground mt-1">ACTIVE MARKETS</div>
          </div>
        </Panel>
        <Panel title="OPPORTUNITIES">
          <div className="text-center">
            <Activity className="w-4 h-4 mx-auto mb-1 text-amber-500" />
            <div className="font-mono text-2xl text-foreground">{opportunities.length || '—'}</div>
            <div className="font-mono text-[10px] text-muted-foreground mt-1">SCORED SEGMENTS</div>
          </div>
        </Panel>
      </div>

      {/* Regional Comparison */}
      {regional.length > 0 && (
        <Panel title="REGIONAL COMPARISON" className="mb-4">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[10px] font-mono text-muted-foreground border-b border-border">
                  <th className="text-left pb-2">REGION</th>
                  <th className="text-right pb-2">SCORE</th>
                  <th className="text-right pb-2">CAP RATE</th>
                  <th className="text-right pb-2">PRICE GROWTH</th>
                  <th className="text-right pb-2">RENTAL YIELD</th>
                  <th className="text-right pb-2">VACANCY</th>
                  <th className="text-right pb-2">RISK</th>
                  <th className="text-right pb-2"></th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {regional.map((r) => (
                  <tr
                    key={r.region}
                    className={cn(
                      'border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10 cursor-pointer',
                      selectedRegion === r.region && 'bg-muted/40'
                    )}
                    onClick={() =>
                      setSelectedRegion(selectedRegion === r.region ? null : r.region)
                    }
                  >
                    <td className="py-2 text-foreground">{formatRegion(r.region)}</td>
                    <td className="py-2 text-right">
                      <ScoreBadge score={r.opportunity_score} />
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      {r.cap_rate > 0 ? `${r.cap_rate.toFixed(2)}%` : '—'}
                    </td>
                    <td
                      className={cn(
                        'py-2 text-right',
                        r.price_growth >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      )}
                    >
                      {r.price_growth !== 0
                        ? `${r.price_growth >= 0 ? '+' : ''}${r.price_growth.toFixed(1)}%`
                        : '—'}
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      {r.rental_yield > 0 ? `${r.rental_yield.toFixed(2)}%` : '—'}
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      {r.vacancy_rate > 0 ? `${(r.vacancy_rate * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2 text-right">
                      <RiskBadge level={r.risk_level} />
                    </td>
                    <td className="py-2 text-right">
                      <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Detailed Opportunities */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 mb-1">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-xs text-muted-foreground">
              {selectedRegion
                ? `OPPORTUNITIES — ${formatRegion(selectedRegion)}`
                : 'ALL OPPORTUNITIES'}
            </h2>
            {selectedRegion && (
              <button
                onClick={() => setSelectedRegion(null)}
                className="font-mono text-[10px] text-amber-500 hover:text-amber-400"
              >
                CLEAR FILTER
              </button>
            )}
          </div>
        </div>

        {filteredOpps.length > 0 ? (
          filteredOpps
            .sort((a, b) => b.opportunity_score - a.opportunity_score)
            .map((o, i) => (
              <div key={i} className="col-span-6 xl:col-span-4">
                <Panel
                  title={`${formatRegion(o.region)} — ${formatPropertyType(o.property_type)}`}
                >
                  {/* Score + Recommendation */}
                  <div className="flex items-center justify-between mb-3">
                    <ScoreBadge score={o.opportunity_score} />
                    <RecommendationBadge rec={o.recommendation} />
                  </div>

                  {/* Factor Breakdown */}
                  <div className="space-y-1.5 mb-3">
                    <FactorBar label="Cap Rate" value={o.opportunity_factors.cap_rate_score} />
                    <FactorBar
                      label="Price Grw"
                      value={o.opportunity_factors.price_growth_score}
                    />
                    <FactorBar
                      label="Rent Yld"
                      value={o.opportunity_factors.rental_yield_score}
                    />
                    <FactorBar
                      label="Absorption"
                      value={o.opportunity_factors.absorption_score}
                    />
                    <FactorBar
                      label="Risk"
                      value={o.opportunity_factors.risk_score}
                    />
                  </div>

                  {/* Key Metrics */}
                  <div className="grid grid-cols-2 gap-2 text-center border-t border-border pt-2">
                    <div>
                      <div className="font-mono text-[9px] text-muted-foreground">CAP RATE</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {o.cap_rate > 0 ? `${o.cap_rate.toFixed(2)}%` : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="font-mono text-[9px] text-muted-foreground">PRICE YoY</div>
                      <div
                        className={cn(
                          'font-mono text-xs',
                          o.avg_price_growth_yoy >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                        )}
                      >
                        {o.avg_price_growth_yoy !== 0
                          ? `${o.avg_price_growth_yoy >= 0 ? '+' : ''}${o.avg_price_growth_yoy.toFixed(1)}%`
                          : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="font-mono text-[9px] text-muted-foreground">VACANCY</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {o.vacancy_rate > 0 ? `${(o.vacancy_rate * 100).toFixed(1)}%` : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="font-mono text-[9px] text-muted-foreground">INV. MONTHS</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {o.inventory_months > 0 ? o.inventory_months.toFixed(1) : '—'}
                      </div>
                    </div>
                  </div>

                  {/* Risk + Condition */}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                    <RiskBadge level={o.risk_level} />
                    <span className="font-mono text-[9px] text-muted-foreground uppercase">
                      {o.market_condition}
                    </span>
                  </div>
                </Panel>
              </div>
            ))
        ) : (
          <div className="col-span-12">
            <Panel title="NO DATA">
              <div className="text-center py-8">
                <Activity className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
                <div className="font-mono text-xs text-muted-foreground">
                  No investment opportunities scored yet
                </div>
                <div className="font-mono text-[10px] text-muted-foreground mt-1">
                  Scores are computed from cap rate benchmarks, transaction data, and vacancy metrics
                </div>
              </div>
            </Panel>
          </div>
        )}

        {/* Rental Summary */}
        {rental.length > 0 && (
          <Panel title="RENTAL MARKET OVERVIEW" className="col-span-12 mt-2">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] font-mono text-muted-foreground border-b border-border">
                    <th className="text-left pb-2">REGION</th>
                    <th className="text-left pb-2">TYPE</th>
                    <th className="text-right pb-2">AVG RENT/MO</th>
                    <th className="text-right pb-2">MEDIAN RENT</th>
                    <th className="text-right pb-2">₵/SQM</th>
                    <th className="text-right pb-2">TXNS</th>
                    <th className="text-right pb-2">YIELD</th>
                    <th className="text-right pb-2">VACANCY</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {rental.map((r, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                      <td className="py-1.5 text-foreground">{formatRegion(r.region)}</td>
                      <td className="py-1.5 text-muted-foreground">{formatPropertyType(r.property_type)}</td>
                      <td className="py-1.5 text-right text-green-600 dark:text-green-400">
                        {r.avg_rent_monthly > 0 ? formatCurrency(r.avg_rent_monthly) : '—'}
                      </td>
                      <td className="py-1.5 text-right text-muted-foreground">
                        {r.median_rent_monthly > 0 ? formatCurrency(r.median_rent_monthly) : '—'}
                      </td>
                      <td className="py-1.5 text-right text-muted-foreground">
                        {r.avg_rent_per_sqm > 0 ? `GH₵${r.avg_rent_per_sqm.toFixed(0)}` : '—'}
                      </td>
                      <td className="py-1.5 text-right text-muted-foreground">
                        {r.rental_transaction_count}
                      </td>
                      <td className="py-1.5 text-right text-amber-600 dark:text-amber-400">
                        {r.gross_yield_pct > 0 ? `${r.gross_yield_pct.toFixed(2)}%` : '—'}
                      </td>
                      <td className="py-1.5 text-right text-muted-foreground">
                        {r.vacancy_rate_pct > 0 ? `${(r.vacancy_rate_pct * 100).toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </div>
    </div>
  )
}
