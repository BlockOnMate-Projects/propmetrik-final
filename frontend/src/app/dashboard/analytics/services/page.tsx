'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { authedFetch } from '@/lib/authed-fetch'
import {
  Briefcase,
  FileSearch,
  Users,
  Landmark,
  RefreshCw,
  ChevronRight,
} from 'lucide-react'

// =====================================================
// TYPES (subset of each service's summary response)
// =====================================================

interface ValuationSummary {
  total_count: number
  completed_count: number
  total_value: number
  avg_value: number
}
interface CrmDashboard {
  thisMonth?: { deals: number; value: number; winRate: number }
  pipeline?: { totalDeals: number; totalValue: number }
}
interface MgmtKpis {
  total_rental_properties: number
  total_sale_properties: number
  avg_cap_rate: number
  avg_monthly_rent: number
  avg_annual_noi: number
  avg_gross_yield: number
}

// =====================================================
// HELPERS
// =====================================================

function fmtCurrency(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—'
  if (Math.abs(n) >= 1_000_000) return `GH₵${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `GH₵${(n / 1_000).toFixed(0)}K`
  return `GH₵${n.toFixed(0)}`
}
function fmtNumber(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—'
  return n.toLocaleString()
}
function fmtPct(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—'
  return `${n.toFixed(1)}%`
}

function Panel({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="border border-border bg-card/50">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border">
        <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
        {actions}
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-border bg-card/40 p-3">
      <div className="font-mono text-[9px] text-muted-foreground tracking-wider">{label}</div>
      <div className="font-mono text-xl text-foreground mt-1">{value}</div>
      {sub && <div className="font-mono text-[9px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  )
}

// =====================================================
// PAGE
// =====================================================

export default function ServicesSummaryPage() {
  const [valuation, setValuation] = useState<ValuationSummary | null>(null)
  const [crm, setCrm] = useState<CrmDashboard | null>(null)
  const [mgmt, setMgmt] = useState<MgmtKpis | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    const get = async (url: string): Promise<any> => {
      try {
        const res = await authedFetch(url, { signal })
        if (!res.ok) return null
        return await res.json()
      } catch { return null }
    }
    const [v, c, m] = await Promise.all([
      get('/api/analytics/valuations/volume/summary?months=12'),
      get('/api/analytics/dashboard'),
      get('/api/analytics/management/summary'),
    ])
    if (signal?.aborted) return
    setValuation(v?.data ?? null)
    setCrm(c?.data ?? null)
    setMgmt(m?.data?.kpis ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    load(ac.signal)
    return () => ac.abort()
  }, [load])

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-mono text-xl text-foreground flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-amber-500" />
            SERVICE ANALYTICS — SUMMARY
          </h1>
          <p className="font-mono text-[10px] text-muted-foreground">
            Combined overview across Valuation, CRM &amp; Property Management · toggle a service above for full analytics
          </p>
        </div>
        <button
          onClick={() => load()}
          className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] text-muted-foreground border border-border hover:border-amber-500/50 hover:text-amber-500 transition-colors"
        >
          <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
          REFRESH
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* VALUATION */}
        <Panel
          title="VALUATION ANALYTICS"
          actions={
            <Link href="/dashboard/analytics/valuations" className="flex items-center gap-1 font-mono text-[9px] text-muted-foreground hover:text-amber-500">
              <FileSearch className="w-3 h-3" /> FULL ANALYTICS <ChevronRight className="w-3 h-3" />
            </Link>
          }
        >
          {valuation ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="TOTAL VALUATIONS (12M)" value={fmtNumber(valuation.total_count)} sub={`${fmtNumber(valuation.completed_count)} completed`} />
              <Kpi label="TOTAL VALUED" value={fmtCurrency(valuation.total_value)} />
              <Kpi label="AVG VALUATION" value={fmtCurrency(valuation.avg_value)} />
              <Kpi label="COMPLETION RATE" value={valuation.total_count > 0 ? fmtPct((valuation.completed_count / valuation.total_count) * 100) : '—'} />
            </div>
          ) : (
            <div className="py-6 text-center font-mono text-xs text-muted-foreground">{loading ? 'Loading…' : 'No valuation analytics available'}</div>
          )}
        </Panel>

        {/* CRM */}
        <Panel
          title="CRM / DEALS ANALYTICS"
          actions={
            <Link href="/dashboard/analytics/crm" className="flex items-center gap-1 font-mono text-[9px] text-muted-foreground hover:text-amber-500">
              <Users className="w-3 h-3" /> FULL ANALYTICS <ChevronRight className="w-3 h-3" />
            </Link>
          }
        >
          {crm && (crm.pipeline || crm.thisMonth) ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="PIPELINE DEALS" value={fmtNumber(crm.pipeline?.totalDeals)} />
              <Kpi label="PIPELINE VALUE" value={fmtCurrency(crm.pipeline?.totalValue)} />
              <Kpi label="DEALS THIS MONTH" value={fmtNumber(crm.thisMonth?.deals)} sub={crm.thisMonth ? fmtCurrency(crm.thisMonth.value) : undefined} />
              <Kpi label="WIN RATE (MONTH)" value={fmtPct(crm.thisMonth?.winRate)} />
            </div>
          ) : (
            <div className="py-6 text-center font-mono text-xs text-muted-foreground">{loading ? 'Loading…' : 'No CRM analytics available'}</div>
          )}
        </Panel>

        {/* MANAGEMENT */}
        <Panel
          title="PROPERTY MANAGEMENT ANALYTICS"
          actions={
            <Link href="/dashboard/analytics/management" className="flex items-center gap-1 font-mono text-[9px] text-muted-foreground hover:text-amber-500">
              <Landmark className="w-3 h-3" /> FULL ANALYTICS <ChevronRight className="w-3 h-3" />
            </Link>
          }
        >
          {mgmt ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Kpi label="RENTAL PROPERTIES" value={fmtNumber(mgmt.total_rental_properties)} />
              <Kpi label="FOR-SALE PROPERTIES" value={fmtNumber(mgmt.total_sale_properties)} />
              <Kpi label="AVG MONTHLY RENT" value={fmtCurrency(mgmt.avg_monthly_rent)} />
              <Kpi label="AVG CAP RATE" value={fmtPct(mgmt.avg_cap_rate)} />
              <Kpi label="AVG GROSS YIELD" value={fmtPct(mgmt.avg_gross_yield)} />
            </div>
          ) : (
            <div className="py-6 text-center font-mono text-xs text-muted-foreground">{loading ? 'Loading…' : 'No management analytics available'}</div>
          )}
        </Panel>

        {/* Quick links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { href: '/dashboard/analytics/valuations', label: 'VALUATION', icon: FileSearch, desc: 'Volume, method performance, valuer leaderboard, market-relative' },
            { href: '/dashboard/analytics/crm', label: 'CRM', icon: Users, desc: 'Pipeline funnel, win/loss, lead sources, agent performance' },
            { href: '/dashboard/analytics/management', label: 'MANAGEMENT', icon: Landmark, desc: 'Rental yields, cap rates, occupancy, NOI by region' },
          ].map((s) => {
            const Icon = s.icon
            return (
              <Link key={s.href} href={s.href} className="border border-border bg-card/40 p-3 hover:border-amber-500/40 hover:bg-amber-500/5 transition-colors group">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="w-4 h-4 text-amber-500" />
                  <span className="font-mono text-xs text-foreground tracking-wider">{s.label}</span>
                  <ChevronRight className="w-3 h-3 text-muted-foreground ml-auto group-hover:text-amber-500" />
                </div>
                <div className="font-mono text-[9px] text-muted-foreground leading-relaxed">{s.desc}</div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
