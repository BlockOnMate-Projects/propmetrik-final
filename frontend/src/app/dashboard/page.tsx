'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { authedFetch } from '@/lib/authed-fetch'
import { useUpgradeGate, LockedBadge } from '@/components/UpgradeGate'
import { canAccessPlatformTab } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TickerData {
  gh_property_index: { avg_price: number; total_properties: number; change_pct: number | null }
  accra_avg: number
  neighborhoods: { name: string; avg_price: number; direction: 'up' | 'down'; count: number }[]
  active_deals: number
  pending_valuations: number
  cap_rate: number
  market_indices?: { key: string; label: string; value: number; unit: string; change: number | null; direction: 'up' | 'down' | null }[]
}

interface OverviewStats {
  totalValuations: number
  monthValuations: number
  activeDeals: number
  pipelineValue: number
  totalProperties: number
  teamMembers: number
}

interface ValuationItem {
  id: string
  property: string
  propertyType: string
  status: string
  priority: string
  createdAt: string
}

interface PipelineStage {
  stage: string
  count: number
  value: number
}

interface OverviewData {
  role: string
  tier: string
  stats: OverviewStats
  valuationQueue: ValuationItem[]
  dealPipeline: PipelineStage[]
  recentTransactions: { id: string; type: string; property: string; location: string; value: number; date: string }[]
  marketIndicators: { area: string; avgPrice: number; volume: number; change: number }[]
}

interface ManagementKPIs {
  avg_cap_rate: number
  avg_monthly_rent: number
  avg_annual_noi: number
  avg_gross_yield: number
  total_rental_properties: number
  total_sale_properties: number
}

interface CCIData {
  national_index: number
  components: {
    materials: { value: number; weight: number; change_mom: number; change_yoy: number | null }
    labor: { value: number; weight: number; change_mom: number; change_yoy: number | null }
    overhead: { value: number; weight: number; change_mom: number; change_yoy: number | null }
  }
}

interface MarketPriceIndex {
  region: string
  property_type: string
  median_price: number
  avg_price: number
  transaction_count: number
}

interface HAIData {
  region: string
  ghai_composite: number
  ghai_category: string
  median_property_price: number
  median_household_income: number
  mortgage_rate: number
  median_monthly_rent: number
  trend_direction: string
  change_mom: number
  change_yoy: number
}

function fetchWithTimeout(path: string, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return authedFetch(path, { signal: controller.signal }).finally(() => clearTimeout(timer))
}

async function fetchJsonOrNull(path: string): Promise<any> {
  try {
    const r = await fetchWithTimeout(path)
    return r.ok ? r.json() : null
  } catch {
    return null
  }
}

function tickerSegmentToPropertyType(name: string): string {
  const n = name.toUpperCase()
  if (n.includes('FLATS')) return 'apartment_flat'
  if (n.includes('LAND')) return 'land'
  if (n.includes('COMMERCIAL')) return 'commercial_shop'
  return 'residential_house'
}

function priceIndexFromTicker(ticker: TickerData | null): MarketPriceIndex[] {
  if (!ticker?.neighborhoods?.length) return []
  return ticker.neighborhoods.map((n) => ({
    region: n.name.toLowerCase().includes('kumasi') ? 'kumasi_metro' : 'greater_accra',
    property_type: tickerSegmentToPropertyType(n.name),
    median_price: n.avg_price,
    avg_price: n.avg_price,
    transaction_count: n.count,
  }))
}

function tickerIndexValue(ticker: TickerData | null, key: string): number | null {
  const hit = ticker?.market_indices?.find((i) => i.key === key)
  return hit?.value ?? null
}

function fmt(val: number, prefix = '₵'): string {
  if (!val || val === 0) return `${prefix}0`
  if (val >= 1_000_000) return `${prefix}${(val / 1_000_000).toFixed(2)}M`
  if (val >= 1_000) return `${prefix}${(val / 1_000).toFixed(0)}K`
  return `${prefix}${val.toLocaleString()}`
}

function fmtCompact(val: number): string {
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}B`
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`
  return val.toLocaleString()
}

function PctBadge({ val, suffix = '%' }: { val: number | null; suffix?: string }) {
  if (val == null) return <span className="text-muted-foreground">—</span>
  if (val === 0) return <span className="text-muted-foreground">0{suffix}</span>
  return (
    <span className={val > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
      {val > 0 ? '▲' : '▼'} {Math.abs(val).toFixed(1)}{suffix}
    </span>
  )
}

function timeOfDay(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatRegion(region: string): string {
  return region.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatPropertyType(pt: string): string {
  return pt.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function relTime(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const now = new Date()
  const diffH = Math.floor((now.getTime() - d.getTime()) / 3600000)
  if (diffH < 1) return 'Just now'
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return 'Yesterday'
  if (diffD < 7) return `${diffD}d ago`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** A section card with colored accent top border */
function Section({ title, children, className, action, accent = 'amber' }: {
  title: string; children: React.ReactNode; className?: string; action?: React.ReactNode
  accent?: 'amber' | 'emerald' | 'cyan' | 'red'
}) {
  const accentColors = {
    amber: 'border-t-amber-500',
    emerald: 'border-t-emerald-500',
    cyan: 'border-t-cyan-500',
    red: 'border-t-red-500',
  }
  return (
    <div className={cn(
      'bg-card/60 border border-border rounded-lg overflow-hidden border-t-2',
      accentColors[accent],
      className,
    )}>
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border">
        <h3 className="font-mono text-[11px] font-semibold text-muted-foreground tracking-wider uppercase">{title}</h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

/** A market pulse metric card with gradient accent */
function PulseCard({ label, value, change, unit, gradient, onClick }: {
  label: string; value: string; change?: number | null; unit?: string
  gradient: string; onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative p-4 rounded-lg border border-border bg-card/60 overflow-hidden text-left group',
        'hover:border-zinc-600 transition-all duration-300 hover:shadow-lg hover:shadow-black/20',
        onClick && 'cursor-pointer',
      )}
    >
      {/* Gradient accent */}
      <div className={cn('absolute top-0 left-0 right-0 h-0.5', gradient)} />
      <div className={cn('absolute top-0 right-0 w-16 h-16 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity', gradient, 'rounded-bl-full')} />

      {change != null && (
        <div className="flex justify-end mb-2">
          <span className={cn(
            'font-mono text-[10px] px-1.5 py-0.5 rounded-full',
            change > 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : change < 0 ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-zinc-700/50 text-muted-foreground',
          )}>
            {change > 0 ? '+' : ''}{change.toFixed(1)}%
          </span>
        </div>
      )}
      <div className="font-mono text-[10px] text-muted-foreground tracking-wider mb-1">{label}</div>
      <div className="font-mono text-xl font-bold text-foreground leading-tight">
        {value}
        {unit && <span className="text-xs text-muted-foreground ml-1">{unit}</span>}
      </div>
    </button>
  )
}

/** Metric row for org stats */
function OrgMetric({ label, value, subValue, onClick, featureKey }: {
  label: string; value: string | number; subValue?: string
  onClick?: () => void; featureKey?: string
}) {
  const { hasAccess } = useUpgradeGate()
  const locked = featureKey ? !hasAccess(featureKey) : false

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border hover:border-zinc-600 transition-all w-full text-left group"
    >
      <div className="flex-1 min-w-0">
        <div className="font-mono text-[10px] text-muted-foreground tracking-wider">{label}</div>
        <div className={cn('font-mono text-lg font-bold text-foreground', locked && 'blur-[3px]')}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
        {subValue && <div className="font-mono text-[10px] text-muted-foreground">{subValue}</div>}
      </div>
      {locked ? (
        <LockedBadge featureKey={featureKey!} />
      ) : (
        <svg className="w-4 h-4 text-zinc-700 group-hover:text-muted-foreground transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      )}
    </button>
  )
}

/** Horizontal bar for construction cost breakdown */
function CostBar({ label, value, maxValue, pctChange, color }: {
  label: string; value: number; maxValue: number; pctChange: number | null; color: string
}) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-foreground">{value.toFixed(0)}</span>
          {pctChange != null && (
            <span className={cn('font-mono text-[10px]', pctChange > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400')}>
              {pctChange > 0 ? '↑' : '↓'}{Math.abs(pctChange).toFixed(1)}%
            </span>
          )}
        </div>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-1000', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** Quick action card */
function ActionCard({ title, desc, href, featureKey }: {
  title: string; desc: string; href: string; featureKey: string
}) {
  const { navigateOrGate, hasAccess } = useUpgradeGate()
  const locked = !hasAccess(featureKey)

  return (
    <button
      onClick={() => navigateOrGate(href, featureKey)}
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border transition-all text-left',
        locked
          ? 'border-border bg-card/30 opacity-60 hover:opacity-80'
          : 'border-border bg-muted/30 hover:border-amber-500/50 hover:bg-amber-50 dark:hover:bg-amber-500/10',
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="font-mono text-xs text-foreground">{title}</div>
        <div className="font-mono text-[10px] text-muted-foreground">{desc}</div>
      </div>
      {locked && <LockedBadge featureKey={featureKey} />}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 animate-pulse">
      <div className="max-w-[1600px] mx-auto">
        <div className="h-8 bg-card rounded w-48 sm:w-64 mb-2" />
        <div className="h-4 bg-card rounded w-64 sm:w-96 mb-8" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {[...Array(6)].map((_, i) => <div key={i} className="h-28 bg-card rounded-lg" />)}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-card rounded-lg" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 h-72 bg-card rounded-lg" />
          <div className="lg:col-span-4 h-72 bg-card rounded-lg" />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Dashboard Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const { navigateOrGate, hasAccess } = useUpgradeGate()

  const [ticker, setTicker] = useState<TickerData | null>(null)
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [management, setManagement] = useState<ManagementKPIs | null>(null)
  const [cci, setCci] = useState<CCIData | null>(null)
  const [priceIndex, setPriceIndex] = useState<MarketPriceIndex[]>([])
  const [hai, setHai] = useState<HAIData[]>([])
  const [loading, setLoading] = useState(true)

  const userName = session?.user?.name?.split(' ')[0] || 'there'
  const userRole = session?.user?.role || overview?.role || 'viewer'
  const userTier = session?.user?.tier || overview?.tier || 'starter'
  const userType = session?.user?.userType || 'staff'

  // Fetch all data in parallel
  const fetchAll = useCallback(async () => {
    try {
      const [tickerRes, overviewRes, mgmtRes, cciRes, priceRes, haiRes] = await Promise.allSettled([
        fetchJsonOrNull('/api/ticker'),
        fetchJsonOrNull('/api/user/overview'),
        fetchJsonOrNull('/api/analytics/management/summary'),
        fetchJsonOrNull('/api/analytics/platform/construction/index'),
        fetchJsonOrNull('/api/analytics/market/price-index'),
        fetchJsonOrNull('/api/analytics/platform/hai/current'),
      ])

      if (tickerRes.status === 'fulfilled' && tickerRes.value?.data) setTicker(tickerRes.value.data)
      if (overviewRes.status === 'fulfilled' && overviewRes.value?.success) setOverview(overviewRes.value.overview)
      if (mgmtRes.status === 'fulfilled' && mgmtRes.value?.success) setManagement(mgmtRes.value.data?.kpis)
      if (cciRes.status === 'fulfilled' && cciRes.value?.success) setCci(cciRes.value.data)
      if (priceRes.status === 'fulfilled' && priceRes.value?.success) setPriceIndex(priceRes.value.data || [])
      if (haiRes.status === 'fulfilled' && haiRes.value?.success) setHai(haiRes.value.data || [])

      const tickerData = tickerRes.status === 'fulfilled' ? tickerRes.value?.data as TickerData | undefined : undefined
      if (tickerData) {
        setPriceIndex((prev) => (prev.length > 0 ? prev : priceIndexFromTicker(tickerData)))
        setCci((prev) => {
          if (prev) return prev
          const cciVal = tickerIndexValue(tickerData, 'cci')
          return cciVal != null ? { national_index: cciVal, components: { materials: { value: 0, weight: 0, change_mom: 0, change_yoy: null }, labor: { value: 0, weight: 0, change_mom: 0, change_yoy: null }, overhead: { value: 0, weight: 0, change_mom: 0, change_yoy: null } } } : prev
        })
        setHai((prev) => {
          if (prev.length > 0) return prev
          const ghaiVal = tickerIndexValue(tickerData, 'ghai')
          return ghaiVal != null ? [{ region: 'greater_accra', ghai_composite: ghaiVal, ghai_category: '', median_property_price: 0, median_household_income: 0, mortgage_rate: 0, median_monthly_rent: 0, trend_direction: '', change_mom: 0, change_yoy: 0 }] : prev
        })
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const stats = overview?.stats || {
    totalValuations: 0, monthValuations: 0, activeDeals: 0,
    pipelineValue: 0, totalProperties: 0, teamMembers: 0,
  }

  if (loading) return <DashboardSkeleton />

  // Compute market totals from price index
  const totalTransactions = priceIndex.reduce((s, p) => s + p.transaction_count, 0)
  const totalMarketValue = priceIndex.reduce((s, p) => s + (p.avg_price * p.transaction_count), 0)

  // Get Greater Accra HAI
  const accraHAI = hai.find(h => h.region === 'greater_accra')

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-[1600px] mx-auto p-4 sm:p-5 pb-16 space-y-5">

        {/* ── WELCOME HEADER ─────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-2xl font-semibold tracking-tight">
              {timeOfDay()}, <span className="text-amber-600 dark:text-amber-400">{userName}</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5 font-mono">
              {session?.user?.organizationName || 'Your Organization'} &middot;{' '}
              <span className="text-muted-foreground">{userRole.replace(/_/g, ' ').toUpperCase()}</span>
              {userType !== 'staff' && (
                <>
                  {' '}&middot;{' '}
                  <span className="text-amber-500/70">{userTier.toUpperCase()} PLAN</span>
                </>
              )}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <div className="font-mono text-[10px] text-muted-foreground">
              {new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            <div className="flex items-center gap-2 sm:justify-end mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">ALL SYSTEMS OPERATIONAL</span>
            </div>
          </div>
        </div>

        {/* ── MARKET PULSE ───────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <PulseCard
            label="GHANA PROPERTY INDEX"
            value={ticker ? fmt(ticker.gh_property_index.avg_price) : '—'}
            change={ticker?.gh_property_index.change_pct}
            gradient="bg-gradient-to-r from-amber-500 to-orange-500"
            onClick={() => navigateOrGate('/dashboard/analytics', 'analytics')}
          />
          <PulseCard
            label="ACCRA AVERAGE"
            value={ticker ? fmt(ticker.accra_avg) : '—'}
            gradient="bg-gradient-to-r from-cyan-500 to-blue-500"
            onClick={() => navigateOrGate('/dashboard/analytics', 'analytics')}
          />
          <PulseCard
            label="CAP RATE"
            value={management ? `${management.avg_cap_rate.toFixed(2)}%` : ticker ? `${ticker.cap_rate.toFixed(2)}%` : '—'}
            gradient="bg-gradient-to-r from-emerald-500 to-green-500"
            onClick={() => navigateOrGate('/dashboard/analytics', 'analytics')}
          />
          <PulseCard
            label="GROSS YIELD"
            value={management ? `${management.avg_gross_yield.toFixed(1)}%` : '—'}
            gradient="bg-gradient-to-r from-yellow-500 to-amber-500"
            onClick={() => navigateOrGate('/dashboard/property-management', 'property-management')}
          />
          <PulseCard
            label="CONSTRUCTION INDEX"
            value={cci ? cci.national_index.toFixed(0) : tickerIndexValue(ticker, 'cci')?.toFixed(0) ?? '—'}
            change={cci?.components.materials.change_yoy}
            unit="pts"
            gradient="bg-gradient-to-r from-purple-500 to-pink-500"
            onClick={() => navigateOrGate('/dashboard/analytics', 'analytics')}
          />
          <PulseCard
            label="AFFORDABILITY"
            value={accraHAI ? accraHAI.ghai_composite.toFixed(1) : tickerIndexValue(ticker, 'ghai')?.toFixed(1) ?? '—'}
            change={accraHAI?.change_yoy}
            unit="/100"
            gradient="bg-gradient-to-r from-red-500 to-rose-500"
            onClick={() => navigateOrGate('/dashboard/analytics', 'analytics')}
          />
        </div>

        {/* ── YOUR ORGANIZATION ──────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <OrgMetric
            label="VALUATIONS"
            value={stats.totalValuations}
            subValue={stats.monthValuations > 0 ? `${stats.monthValuations} this month` : 'Start your first valuation'}
            featureKey="valuations"
            onClick={() => navigateOrGate('/dashboard/valuations', 'valuations')}
          />
          <OrgMetric
            label="ACTIVE DEALS"
            value={stats.activeDeals}
            subValue={stats.pipelineValue > 0 ? `Pipeline: ${fmt(stats.pipelineValue)}` : 'Build your pipeline'}
            featureKey="deals"
            onClick={() => navigateOrGate('/dashboard/deals', 'deals')}
          />
          <OrgMetric
            label="PROPERTIES"
            value={stats.totalProperties}
            subValue="Under management"
            featureKey="property-management"
            onClick={() => navigateOrGate('/dashboard/property-management', 'property-management')}
          />
          <OrgMetric
            label="TEAM"
            value={stats.teamMembers}
            subValue="Active members"
            onClick={() => router.push('/dashboard/admin')}
          />
          <OrgMetric
            label="PENDING"
            value={ticker?.pending_valuations || 0}
            subValue="Awaiting review"
            featureKey="valuations"
            onClick={() => navigateOrGate('/dashboard/valuations', 'valuations')}
          />
        </div>

        {/* ── MAIN CONTENT GRID ──────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* LEFT: Market Intelligence */}
          <Section
            title="Market Intelligence"
            accent="cyan"
            className="lg:col-span-8"
            action={
              <button
                onClick={() => navigateOrGate('/dashboard/analytics', 'analytics')}
                className="font-mono text-[10px] text-amber-600 dark:text-amber-400 hover:text-amber-300 transition-colors"
              >
                FULL ANALYTICS →
              </button>
            }
          >
            {priceIndex.length > 0 ? (
              <div className="space-y-4">
                {/* Summary bar */}
                <div className="flex flex-wrap items-center gap-3 sm:gap-6 p-3 bg-muted/40 rounded-lg border border-border">
                  <div>
                    <div className="font-mono text-[10px] text-muted-foreground">TOTAL MARKET VALUE</div>
                    <div className="font-mono text-lg font-bold text-foreground">₵{fmtCompact(totalMarketValue)}</div>
                  </div>
                  <div className="w-px h-8 bg-zinc-700 hidden sm:block" />
                  <div>
                    <div className="font-mono text-[10px] text-muted-foreground">PROPERTIES TRACKED</div>
                    <div className="font-mono text-lg font-bold text-cyan-600 dark:text-cyan-400">{ticker?.gh_property_index.total_properties.toLocaleString() || totalTransactions.toLocaleString()}</div>
                  </div>
                  <div className="w-px h-8 bg-zinc-700 hidden sm:block" />
                  <div>
                    <div className="font-mono text-[10px] text-muted-foreground">RENTAL PROPERTIES</div>
                    <div className="font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400">{management?.total_rental_properties.toLocaleString() || '—'}</div>
                  </div>
                  <div className="w-px h-8 bg-zinc-700 hidden sm:block" />
                  <div>
                    <div className="font-mono text-[10px] text-muted-foreground">AVG MONTHLY RENT</div>
                    <div className="font-mono text-lg font-bold text-amber-600 dark:text-amber-400">{management ? fmt(management.avg_monthly_rent) : '—'}</div>
                  </div>
                  <div className="w-px h-8 bg-zinc-700 hidden sm:block" />
                  <div>
                    <div className="font-mono text-[10px] text-muted-foreground">AVG ANNUAL NOI</div>
                    <div className="font-mono text-lg font-bold text-green-600 dark:text-green-400">{management ? fmt(management.avg_annual_noi) : '—'}</div>
                  </div>
                </div>

                {/* Price Index Table */}
                <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="text-[10px] font-mono text-muted-foreground border-b border-border">
                      <th className="text-left pb-2 pl-2">REGION</th>
                      <th className="text-left pb-2">TYPE</th>
                      <th className="text-right pb-2">AVG PRICE</th>
                      <th className="text-right pb-2">MEDIAN</th>
                      <th className="text-right pb-2">VOLUME</th>
                      <th className="text-right pb-2 pr-2">MARKET SHARE</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-xs">
                    {priceIndex.slice(0, 8).map((item, i) => {
                      const share = totalTransactions > 0 ? (item.transaction_count / totalTransactions * 100) : 0
                      return (
                        <tr
                          key={i}
                          className="border-b border-border/40 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors cursor-pointer"
                          onClick={() => navigateOrGate('/dashboard/analytics', 'analytics')}
                        >
                          <td className="py-2.5 pl-2 text-foreground">{formatRegion(item.region)}</td>
                          <td className="py-2.5">
                            <span className="px-2 py-0.5 bg-muted rounded text-[10px] text-muted-foreground">
                              {formatPropertyType(item.property_type)}
                            </span>
                          </td>
                          <td className="py-2.5 text-right text-amber-600 dark:text-amber-400 font-medium">{fmt(item.avg_price)}</td>
                          <td className="py-2.5 text-right text-muted-foreground">{fmt(item.median_price)}</td>
                          <td className="py-2.5 text-right text-muted-foreground">{item.transaction_count.toLocaleString()}</td>
                          <td className="py-2.5 text-right pr-2">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-cyan-500/60 rounded-full" style={{ width: `${Math.min(share, 100)}%` }} />
                              </div>
                              <span className="text-muted-foreground text-[10px] w-12 text-right">{share.toFixed(1)}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-10">
                <div className="font-mono text-sm text-muted-foreground mb-1">Market data loading...</div>
                <div className="font-mono text-[10px] text-muted-foreground">Property analytics across Ghana regions</div>
              </div>
            )}
          </Section>

          {/* RIGHT COLUMN */}
          <div className="lg:col-span-4 space-y-4">

            {/* Neighborhood Heatmap */}
            <Section title="Top Markets" accent="emerald">
              {ticker?.neighborhoods && ticker.neighborhoods.length > 0 ? (
                <div className="space-y-2">
                  {ticker.neighborhoods.map((n, i) => {
                    const maxPrice = Math.max(...ticker.neighborhoods.map(x => x.avg_price))
                    const barW = maxPrice > 0 ? (n.avg_price / maxPrice * 100) : 0
                    return (
                      <div
                        key={n.name}
                        className="group cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-lg p-2 -mx-2 transition-colors"
                        onClick={() => navigateOrGate('/dashboard/analytics', 'analytics')}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              'font-mono text-[10px] w-5 h-5 rounded flex items-center justify-center',
                              i === 0 ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-muted text-muted-foreground',
                            )}>
                              {i + 1}
                            </span>
                            <span className="font-mono text-xs text-foreground">{n.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-amber-600 dark:text-amber-400 font-medium">{fmt(n.avg_price)}</span>
                            <span className={cn(
                              'text-[10px]',
                              n.direction === 'up' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                            )}>
                              {n.direction === 'up' ? '▲' : '▼'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all duration-700',
                                i === 0 ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-zinc-600',
                              )}
                              style={{ width: `${barW}%` }}
                            />
                          </div>
                          <span className="font-mono text-[10px] text-muted-foreground w-14 text-right">{n.count} props</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground font-mono text-xs">Loading neighborhoods...</div>
              )}
            </Section>

            {/* Affordability Snapshot */}
            {accraHAI && (
              <Section title="Housing Affordability" accent="red">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-mono text-[10px] text-muted-foreground">GREATER ACCRA GHAI</div>
                      <div className="font-mono text-2xl font-bold text-foreground">{accraHAI.ghai_composite.toFixed(1)}<span className="text-sm text-muted-foreground">/100</span></div>
                    </div>
                    <div className={cn(
                      'px-2 py-1 rounded font-mono text-[10px] font-medium',
                      accraHAI.ghai_category.includes('severely') ? 'bg-red-500/15 text-red-600 dark:text-red-400' :
                      accraHAI.ghai_category.includes('un') ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400' :
                      'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                    )}>
                      {accraHAI.ghai_category.replace(/_/g, ' ').toUpperCase()}
                    </div>
                  </div>
                  {/* HAI gauge */}
                  <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-red-500 via-yellow-500 to-emerald-500 opacity-20" />
                    <div className="absolute top-0 bottom-0 w-1 bg-card rounded-full shadow-lg shadow-white/50" style={{ left: `${accraHAI.ghai_composite}%` }} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
                    <div className="p-2 bg-muted/30 rounded">
                      <div className="font-mono text-[9px] text-muted-foreground">MEDIAN PRICE</div>
                      <div className="font-mono text-xs text-foreground font-medium">{fmt(accraHAI.median_property_price)}</div>
                    </div>
                    <div className="p-2 bg-muted/30 rounded">
                      <div className="font-mono text-[9px] text-muted-foreground">MEDIAN INCOME</div>
                      <div className="font-mono text-xs text-foreground font-medium">{fmt(accraHAI.median_household_income)}</div>
                    </div>
                    <div className="p-2 bg-muted/30 rounded">
                      <div className="font-mono text-[9px] text-muted-foreground">MORTGAGE RATE</div>
                      <div className="font-mono text-xs text-amber-600 dark:text-amber-400 font-medium">{(accraHAI.mortgage_rate * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-muted-foreground">Trend: <span className={accraHAI.trend_direction === 'declining' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>{accraHAI.trend_direction.toUpperCase()}</span></span>
                    <span className="text-muted-foreground">MoM <PctBadge val={accraHAI.change_mom} /> &middot; YoY <PctBadge val={accraHAI.change_yoy} /></span>
                  </div>
                </div>
              </Section>
            )}
          </div>
        </div>

        {/* ── SECOND ROW ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">

          {/* Construction Cost Index */}
          {cci && (
            <Section title="Construction Cost Index" accent="amber" className="md:col-span-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono text-3xl font-bold text-foreground">{cci.national_index.toFixed(0)}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">NATIONAL INDEX (BASE 1000)</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm text-foreground">
                      <PctBadge val={cci.components.materials.change_yoy} />
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">YoY CHANGE</div>
                  </div>
                </div>
                <div className="space-y-3">
                  <CostBar
                    label="MATERIALS"
                    value={cci.components.materials.value}
                    maxValue={cci.national_index}
                    pctChange={cci.components.materials.change_yoy}
                    color="bg-gradient-to-r from-amber-500 to-orange-500"
                  />
                  <CostBar
                    label="LABOR"
                    value={cci.components.labor.value}
                    maxValue={cci.national_index}
                    pctChange={cci.components.labor.change_yoy}
                    color="bg-gradient-to-r from-cyan-500 to-blue-500"
                  />
                  <CostBar
                    label="OVERHEAD"
                    value={cci.components.overhead.value}
                    maxValue={cci.national_index}
                    pctChange={cci.components.overhead.change_yoy}
                    color="bg-gradient-to-r from-purple-500 to-pink-500"
                  />
                </div>
                <div className="pt-2 border-t border-border">
                  <div className="font-mono text-[10px] text-muted-foreground">
                    MoM: <PctBadge val={cci.components.materials.change_mom} /> &middot; Weights: Materials {(cci.components.materials.weight * 100).toFixed(0)}% / Labor {(cci.components.labor.weight * 100).toFixed(0)}% / Overhead {(cci.components.overhead.weight * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
            </Section>
          )}

          {/* Valuation Queue */}
          <Section
            title="Valuation Queue"
            accent="amber"
            className={cci ? 'md:col-span-5' : 'md:col-span-8'}
            action={
              <button
                onClick={() => navigateOrGate('/dashboard/valuations', 'valuations')}
                className="font-mono text-[10px] text-amber-600 dark:text-amber-400 hover:text-amber-300 transition-colors"
              >
                ALL VALUATIONS →
              </button>
            }
          >
            {overview?.valuationQueue && overview.valuationQueue.length > 0 ? (
              <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="text-[10px] font-mono text-muted-foreground border-b border-border">
                    <th className="text-left pb-2 pl-2">REF</th>
                    <th className="text-left pb-2">PROPERTY</th>
                    <th className="text-left pb-2">STATUS</th>
                    <th className="text-left pb-2">PRIORITY</th>
                    <th className="text-right pb-2 pr-2">TIME</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {overview.valuationQueue.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-border/40 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors cursor-pointer"
                      onClick={() => navigateOrGate('/dashboard/valuations', 'valuations')}
                    >
                      <td className="py-2.5 pl-2 text-amber-600 dark:text-amber-400">{item.id}</td>
                      <td className="py-2.5 text-foreground truncate max-w-[160px]">{item.property}</td>
                      <td className="py-2.5">
                        <span className={cn(
                          'px-1.5 py-0.5 rounded text-[10px]',
                          item.status === 'COMPLETED' && 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                          item.status === 'PENDING' && 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
                          item.status === 'IN_REVIEW' && 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
                          item.status === 'APPROVED' && 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                          item.status === 'DRAFT' && 'bg-zinc-700/50 text-muted-foreground',
                        )}>
                          {item.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <span className={cn(
                          'text-[10px]',
                          item.priority === 'HIGH' && 'text-red-600 dark:text-red-400',
                          item.priority === 'MEDIUM' && 'text-yellow-600 dark:text-yellow-400',
                          item.priority === 'LOW' && 'text-muted-foreground',
                        )}>
                          {item.priority}
                        </span>
                      </td>
                      <td className="py-2.5 text-right pr-2 text-muted-foreground">{relTime(item.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="font-mono text-xs text-muted-foreground mb-3">No valuations yet</div>
                <button
                  onClick={() => navigateOrGate('/dashboard/valuations/new', 'valuations')}
                  className="font-mono text-[11px] px-4 py-2 bg-amber-500 text-foreground rounded hover:bg-amber-400 transition-colors font-medium"
                >
                  + START FIRST VALUATION
                </button>
              </div>
            )}
          </Section>

          {/* Quick Actions */}
          <Section title="Quick Actions" className="md:col-span-3">
            <div className="space-y-2">
              <ActionCard title="New Valuation" desc="Property assessment" href="/dashboard/valuations/new" featureKey="valuations" />
              <ActionCard title="Create Deal" desc="Add to pipeline" href="/dashboard/deals/new" featureKey="deals" />
              <ActionCard title="Analytics" desc="Market intelligence" href="/dashboard/analytics" featureKey="analytics" />
              <ActionCard title="Management" desc="Properties & tenants" href="/dashboard/property-management" featureKey="property-management" />
              <ActionCard title="Projects" desc="Construction tracking" href="/dashboard/projects" featureKey="projects" />
            </div>
          </Section>
        </div>

        {/* ── PLATFORM MODULES ───────────────────────────────── */}
        <Section title="Platform Modules">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { key: 'valuations', label: 'Valuations', desc: 'RICS-compliant property assessments, automated reports & ML-powered pricing', href: '/dashboard/valuations', color: 'from-amber-500/20 to-amber-500/5' },
              { key: 'deals', label: 'CRM & Deals', desc: 'Pipeline management, client tracking, deal automation & commission splits', href: '/dashboard/deals', color: 'from-cyan-500/20 to-cyan-500/5' },
              { key: 'analytics', label: 'Analytics', desc: 'Market intelligence, price index, CCI, HAI, ML forecasting & risk analysis', href: '/dashboard/analytics', color: 'from-emerald-500/20 to-emerald-500/5' },
              { key: 'property-management', label: 'Management', desc: 'Lease tracking, rent schedules, tenant portal, maintenance & utilities', href: '/dashboard/property-management', color: 'from-purple-500/20 to-purple-500/5' },
              { key: 'projects', label: 'Projects', desc: 'Construction tracking, Gantt charts, budget management & compliance', href: '/dashboard/projects', color: 'from-orange-500/20 to-orange-500/5' },
            ].map((mod) => {
              const accessible = hasAccess(mod.key)
              const roleAllowed = canAccessPlatformTab(userRole, mod.key)
              const isLocked = !accessible || !roleAllowed

              return (
                <button
                  key={mod.key}
                  onClick={() => navigateOrGate(mod.href, mod.key)}
                  className={cn(
                    'relative p-4 rounded-lg border transition-all text-left group overflow-hidden',
                    isLocked
                      ? 'border-border bg-card/30 hover:border-border'
                      : 'border-border bg-card/50 hover:border-zinc-500 hover:shadow-lg hover:shadow-black/20',
                  )}
                >
                  {/* Gradient BG */}
                  <div className={cn('absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity', mod.color)} />

                  <div className="relative">
                    <div className="flex items-start justify-between mb-2">
                      {isLocked ? (
                        <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className={cn('font-mono text-sm font-medium mb-1', isLocked ? 'text-muted-foreground' : 'text-foreground')}>
                      {mod.label}
                    </div>
                    <div className={cn('font-mono text-[10px] leading-relaxed', isLocked ? 'text-zinc-700' : 'text-muted-foreground')}>
                      {mod.desc}
                    </div>
                    {isLocked && (
                      <div className="mt-3 font-mono text-[9px] text-amber-500/70 uppercase tracking-wider">
                        Upgrade to unlock →
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </Section>

        {/* ── FOOTER ─────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pt-4 border-t border-border/50 gap-2">
          <div className="flex items-center gap-4 font-mono text-[10px]">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-muted-foreground">SYSTEM ONLINE</span>
            </span>
            <span className="text-zinc-800">|</span>
            <span className="text-muted-foreground">{userRole.replace(/_/g, ' ').toUpperCase()}</span>
            {userType !== 'staff' && (
              <>
                <span className="text-zinc-800">|</span>
                <span className="text-amber-500/70">{userTier.toUpperCase()} PLAN</span>
              </>
            )}
          </div>
          <div className="font-mono text-[10px] text-zinc-700">
            PROPMETRIK v2.1 &middot; © {new Date().getFullYear()} PROPMETRIK
          </div>
        </div>
      </div>
    </div>
  )
}
