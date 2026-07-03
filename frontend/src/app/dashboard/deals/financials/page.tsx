'use client'

import React, { useMemo, useState, useEffect, lazy, Suspense } from 'react'
import {
    DollarSign,
    CreditCard,
    TrendingUp,
    TrendingDown,
    Wallet,
    Target,
    Percent,
    Coins,
    Loader2,
    ArrowUpRight,
    Trophy,
    Receipt,
    RotateCcw,
} from 'lucide-react'
import {
    ResponsiveContainer,
    ComposedChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RTooltip,
    Legend,
} from 'recharts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import PaymentSettings from '@/components/property-management/PaymentSettings'
import { crmPaymentConfigApi, type DealPaymentTransaction } from '@/lib/crm-api'
import { authedFetch } from '@/lib/authed-fetch'
import { formatCurrency, formatCurrencyCompact, formatNumber } from '@/lib/utils'
import {
    useDealMetrics,
    useRevenueForecast,
    useRevenueTrend,
    useLeaderboard,
} from '@/hooks/crm/use-analytics'
import Link from 'next/link'

const RevenueForecaster = lazy(() => import('@/components/crm/RevenueForecaster'))
import { ForecastBoard } from '@/components/crm/ForecastBoard'
import { BillingBoard } from '@/components/crm/BillingBoard'
import { RateStamp } from '@/components/property-management/RateStamp'
import type { PortfolioFxMeta } from '@/types/property-management'

// pg NUMERIC comes back as strings — coerce defensively everywhere money is used.
const n = (v: unknown): number => {
    const x = typeof v === 'string' ? parseFloat(v) : (v as number)
    return Number.isFinite(x) ? x : 0
}

interface CommissionSummary {
    total_pending: number
    total_approved: number
    total_paid: number
    pending_count: number
    approved_count: number
    paid_count: number
    ytd_commission: number
    mtd_commission: number
    avg_deal_commission: number
}

type TabKey = 'overview' | 'commissions' | 'forecast' | 'billing' | 'payments' | 'payment-settings'
type PeriodKey = 'quarter' | 'year' | 'all'

const PERIODS: { key: PeriodKey; label: string }[] = [
    { key: 'quarter', label: 'This Quarter' },
    { key: 'year', label: 'This Year' },
    { key: 'all', label: 'All Time' },
]

// Deal payments + admin refund action. The list endpoint is admin-only server-side, so
// non-admins see an empty table. Refund columns require migration 272; amounts are pesewas.
function PaymentsPanel() {
    const queryClient = useQueryClient()
    const { data: txns, isLoading } = useQuery({
        queryKey: ['crm', 'deal-payments'],
        queryFn: () => crmPaymentConfigApi.listTransactions(100).catch(() => [] as DealPaymentTransaction[]),
    })
    const [refundTarget, setRefundTarget] = useState<DealPaymentTransaction | null>(null)
    const [reason, setReason] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const pesewas = (v: number | null) => formatCurrency(n(v) / 100)
    const statusColor = (s: string) =>
        s === 'success' ? 'text-green-500 border-green-500/30'
            : s === 'refunded' ? 'text-purple-500 border-purple-500/30'
                : s === 'failed' ? 'text-red-500 border-red-500/30'
                    : 'text-muted-foreground'

    const doRefund = async () => {
        if (!refundTarget) return
        setSubmitting(true)
        try {
            await crmPaymentConfigApi.refund(refundTarget.reference, { reason: reason.trim() || undefined })
            toast.success('Refund submitted — completion is confirmed via webhook')
            setRefundTarget(null)
            setReason('')
            queryClient.invalidateQueries({ queryKey: ['crm', 'deal-payments'] })
        } catch (err: any) {
            toast.error(err?.message || 'Refund failed')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Deal Payments</CardTitle>
                <CardDescription>
                    Successful payments can be refunded (admin only). Refunds are processed asynchronously by Paystack.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : !txns || txns.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">No deal payments found.</div>
                ) : (
                    <div className="space-y-2">
                        {txns.map((t) => {
                            const refundable = t.status === 'success' && (!t.refund_status || t.refund_status === 'failed')
                            return (
                                <div key={t.reference} className="flex items-center justify-between p-3 bg-muted/30 rounded border border-border/50">
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium text-foreground truncate">{pesewas(t.principal_amount || t.gross_amount)}</div>
                                        <div className="text-xs text-muted-foreground truncate">
                                            {t.payer_email || 'unknown'} · {new Date(t.created_at).toLocaleDateString()} · {t.reference}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Badge variant="outline" className={statusColor(t.status)}>{t.status}</Badge>
                                        {t.refund_status && t.refund_status !== 'failed' && (
                                            <Badge variant="outline" className="text-purple-500 border-purple-500/30 text-[10px]">
                                                refund {t.refund_status}
                                            </Badge>
                                        )}
                                        {refundable && (
                                            <Button variant="outline" size="sm" onClick={() => { setRefundTarget(t); setReason('') }}>
                                                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Refund
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </CardContent>

            <Dialog open={!!refundTarget} onOpenChange={(o) => { if (!o) setRefundTarget(null) }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Refund payment</DialogTitle>
                        <DialogDescription>
                            {refundTarget
                                ? `Refund ${pesewas(refundTarget.principal_amount || refundTarget.gross_amount)} to ${refundTarget.payer_email || 'the payer'}. This returns money to the customer.`
                                : ''}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label>Reason (optional)</Label>
                        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. duplicate charge" />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRefundTarget(null)}>Cancel</Button>
                        <Button onClick={doRefund} disabled={submitting}>{submitting ? 'Refunding...' : 'Confirm Refund'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    )
}

/** Compute an ISO date_from for the selected period (undefined = all time). */
function periodStart(period: PeriodKey): string | undefined {
    const now = new Date()
    if (period === 'year') return new Date(now.getFullYear(), 0, 1).toISOString()
    if (period === 'quarter') {
        const q = Math.floor(now.getMonth() / 3) * 3
        return new Date(now.getFullYear(), q, 1).toISOString()
    }
    return undefined
}

// ============================================================
// Small presentational pieces
// ============================================================

function KpiCard({
    label, value, sub, icon: Icon, tone = 'default',
}: {
    label: string
    value: string
    sub?: string
    icon: React.ElementType
    tone?: 'default' | 'positive' | 'warning' | 'accent'
}) {
    const toneRing =
        tone === 'positive' ? 'text-emerald-500 bg-emerald-500/10'
        : tone === 'warning' ? 'text-amber-500 bg-amber-500/10'
        : tone === 'accent' ? 'text-primary bg-primary/10'
        : 'text-muted-foreground bg-muted'
    return (
        <Card className="border-border shadow-sm">
            <CardContent className="p-4">
                <div className="flex items-start justify-between">
                    <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
                        <p className="text-lg xl:text-xl font-bold text-foreground mt-1 whitespace-nowrap tabular-nums" title={value}>{value}</p>
                        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
                    </div>
                    <div className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ${toneRing}`}>
                        <Icon className="h-4 w-4" />
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

function SectionCard({ title, description, right, children }: {
    title: string; description?: string; right?: React.ReactNode; children: React.ReactNode
}) {
    return (
        <Card className="border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                    <CardTitle className="text-sm font-semibold">{title}</CardTitle>
                    {description && <CardDescription className="text-xs">{description}</CardDescription>}
                </div>
                {right}
            </CardHeader>
            <CardContent>{children}</CardContent>
        </Card>
    )
}

// ============================================================
// Page
// ============================================================

export default function DealsFinancialsPage() {
    const [activeTab, setActiveTab] = useState<TabKey>('overview')
    const [period, setPeriod] = useState<PeriodKey>('year')

    // Live FX rate map (GHS base) for the "rates as of …" stamp. All money figures
    // below are already GHS-normalized server-side; this just shows the rate used.
    const [fx, setFx] = useState<PortfolioFxMeta | null>(null)
    useEffect(() => {
        let active = true
        authedFetch('/api/crm/fx/rates', { credentials: 'include' })
            .then(r => (r.ok ? r.json() : null))
            .then(d => { if (active && d) setFx(d) })
            .catch(() => { /* rate stamp is non-critical */ })
        return () => { active = false }
    }, [])

    const dateFrom = periodStart(period)
    const metricsQ = useDealMetrics(dateFrom ? { date_from: dateFrom } : undefined)
    const forecastQ = useRevenueForecast()
    const trendQ = useRevenueTrend(12)
    const leaderboardQ = useLeaderboard(period === 'all' ? 'year' : period)

    const commissionQ = useQuery({
        queryKey: ['crm', 'commissions', 'summary'],
        queryFn: async (): Promise<CommissionSummary> => {
            const res = await authedFetch('/api/crm/commissions/summary')
            if (!res.ok) throw new Error('Failed to load commission summary')
            const json = await res.json()
            return json.summary as CommissionSummary
        },
        staleTime: 60_000,
    })

    const metrics = metricsQ.data
    const commission = commissionQ.data

    // ---- Derived money figures (all coerced) ----
    const byStage = (forecastQ.data?.by_stage || []).map((s) => ({
        stage_name: s.stage_name,
        value: n(s.value),
        probability: n(s.probability),
        weighted: n(s.value) * (n(s.probability) / 100),
    }))
    const openPipeline = byStage.reduce((a, s) => a + s.value, 0)
    const weightedForecast = byStage.reduce((a, s) => a + s.weighted, 0)

    const wonRevenue = n(metrics?.wonValue)
    const winRate = n(metrics?.conversionRate) * 100
    const wonDeals = n(metrics?.wonDeals)
    // /analytics/deals has no avgDealValue field — derive avg deal size from
    // total pipeline value ÷ total deals (falls back to avg won deal).
    const totalDeals = n(metrics?.totalDeals)
    const avgDeal = totalDeals > 0
        ? n(metrics?.totalValue) / totalDeals
        : (wonDeals > 0 ? wonRevenue / wonDeals : 0)

    const commissionsPayable = n(commission?.total_pending) + n(commission?.total_approved)
    const commissionsPaid = n(commission?.total_paid)

    const trend = useMemo(
        () => (trendQ.data?.data || []).map((d) => ({
            label: d.period_label,
            Won: n(d.won_value),
            'New Pipeline': n(d.new_pipeline),
        })),
        [trendQ.data]
    )
    const leaders = (leaderboardQ.data?.leaderboard || [])
        .slice()
        .sort((a, b) => n(b.total_value) - n(a.total_value))
        .slice(0, 6)

    const anyLoading = metricsQ.isLoading || forecastQ.isLoading || trendQ.isLoading

    const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
        { key: 'overview', label: 'Overview', icon: DollarSign },
        { key: 'commissions', label: 'Commissions', icon: Coins },
        { key: 'forecast', label: 'Forecast', icon: TrendingUp },
        { key: 'billing', label: 'Billing', icon: Receipt },
        { key: 'payments', label: 'Payments', icon: Wallet },
        { key: 'payment-settings', label: 'Payment Settings', icon: CreditCard },
    ]

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Deal Financial Center</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Revenue, weighted pipeline, commission payouts &amp; payment configuration
                    </p>
                    {/* All money figures are GHS-normalized from each deal's native currency. */}
                    <div className="mt-1"><RateStamp fx={fx} /></div>
                </div>
                {activeTab === 'overview' && (
                    <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 bg-card">
                        {PERIODS.map((p) => (
                            <button
                                key={p.key}
                                onClick={() => setPeriod(p.key)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                                    period === p.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 border-b border-border overflow-x-auto">
                {tabs.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setActiveTab(t.key)}
                        className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <t.icon className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ============ OVERVIEW ============ */}
            {activeTab === 'overview' && (
                <>
                    {/* KPI row */}
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                        <KpiCard label="Won Revenue" tone="positive" icon={DollarSign}
                            value={formatCurrencyCompact(wonRevenue)}
                            sub={`${formatNumber(wonDeals)} deals won`} />
                        <KpiCard label="Open Pipeline" tone="accent" icon={Wallet}
                            value={formatCurrencyCompact(openPipeline)}
                            sub={`${byStage.length} active stages`} />
                        <KpiCard label="Weighted Forecast" icon={Target}
                            value={formatCurrencyCompact(weightedForecast)}
                            sub="probability-adjusted" />
                        <KpiCard label="Avg Deal Size" icon={TrendingUp}
                            value={formatCurrencyCompact(avgDeal)} />
                        <KpiCard label="Win Rate" tone={winRate >= 50 ? 'positive' : 'warning'} icon={Percent}
                            value={`${winRate.toFixed(0)}%`} sub="closed-won of closed" />
                        <KpiCard label="Commissions Payable" tone="warning" icon={Coins}
                            value={formatCurrencyCompact(commissionsPayable)}
                            sub={`${formatCurrencyCompact(commissionsPaid)} paid`} />
                    </div>

                    {anyLoading && (
                        <div className="flex items-center justify-center py-8 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading financials…
                        </div>
                    )}

                    {/* Revenue trend */}
                    <SectionCard
                        title="Revenue & Pipeline Trend"
                        description="Won revenue vs. new pipeline created, last 12 months"
                        right={trendQ.data && (
                            <div className="text-right">
                                <p className="text-xs text-muted-foreground">12-mo won</p>
                                <p className="text-sm font-semibold text-emerald-500">{formatCurrencyCompact(n(trendQ.data.total_won))}</p>
                            </div>
                        )}
                    >
                        {trend.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-8 text-center">No revenue history yet.</p>
                        ) : (
                            <div className="h-72 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                                        <YAxis tickFormatter={(v) => formatCurrencyCompact(Number(v))} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={64} />
                                        <RTooltip
                                            cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                                            formatter={(v: number | string, name) => [formatCurrency(Number(v)), name]}
                                            contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12, color: 'hsl(var(--foreground))' }}
                                            labelStyle={{ color: 'hsl(var(--foreground))' }}
                                        />
                                        <Legend wrapperStyle={{ fontSize: 12 }} />
                                        <Bar dataKey="Won" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={36} />
                                        <Line type="monotone" dataKey="New Pipeline" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: '#f59e0b' }} activeDot={{ r: 5 }} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </SectionCard>

                    {/* Weighted pipeline by stage + Top earners */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <SectionCard title="Weighted Pipeline by Stage" description="Open value × close probability">
                            {byStage.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-6 text-center">No open pipeline.</p>
                            ) : (
                                <div className="space-y-3">
                                    {byStage.map((s) => {
                                        const pct = openPipeline > 0 ? (s.value / openPipeline) * 100 : 0
                                        return (
                                            <div key={s.stage_name}>
                                                <div className="flex items-center justify-between text-sm mb-1">
                                                    <span className="text-foreground flex items-center gap-2">
                                                        {s.stage_name}
                                                        <Badge variant="outline" className="text-[10px] font-mono">{s.probability.toFixed(0)}%</Badge>
                                                    </span>
                                                    <span className="text-muted-foreground tabular-nums">
                                                        {formatCurrencyCompact(s.value)}
                                                        <span className="text-emerald-500 ml-2" title="weighted">→ {formatCurrencyCompact(s.weighted)}</span>
                                                    </span>
                                                </div>
                                                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                                                    <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </SectionCard>

                        <SectionCard
                            title="Top Earners"
                            description="Revenue by agent, this period"
                            right={<Trophy className="h-4 w-4 text-amber-500" />}
                        >
                            {leaderboardQ.isLoading ? (
                                <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
                            ) : leaders.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-6 text-center">No closed-won revenue in this period yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {leaders.map((a, i) => (
                                        <div key={a.user_id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <span className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold ${i === 0 ? 'bg-amber-500/20 text-amber-500' : 'bg-muted text-muted-foreground'}`}>{i + 1}</span>
                                                <span className="text-sm text-foreground truncate">{a.user_name || 'Unnamed agent'}</span>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-semibold text-foreground tabular-nums">{formatCurrencyCompact(n(a.total_value))}</p>
                                                <p className="text-[11px] text-muted-foreground">{formatNumber(n(a.deals_won))} won</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </SectionCard>
                    </div>
                </>
            )}

            {/* ============ COMMISSIONS ============ */}
            {activeTab === 'commissions' && (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <KpiCard label="Pending" tone="warning" icon={Coins}
                            value={formatCurrencyCompact(n(commission?.total_pending))}
                            sub={`${formatNumber(n(commission?.pending_count))} records`} />
                        <KpiCard label="Approved (unpaid)" tone="accent" icon={Wallet}
                            value={formatCurrencyCompact(n(commission?.total_approved))}
                            sub={`${formatNumber(n(commission?.approved_count))} records`} />
                        <KpiCard label="Paid" tone="positive" icon={DollarSign}
                            value={formatCurrencyCompact(n(commission?.total_paid))}
                            sub={`${formatNumber(n(commission?.paid_count))} records`} />
                        <KpiCard label="YTD Commission" icon={TrendingUp}
                            value={formatCurrencyCompact(n(commission?.ytd_commission))}
                            sub={`MTD ${formatCurrencyCompact(n(commission?.mtd_commission))}`} />
                    </div>
                    <SectionCard title="Commission Management" description="Approve, pay and adjust agent commissions">
                        <div className="flex flex-col items-start gap-2">
                            <p className="text-sm text-muted-foreground">
                                Average commission per deal: <span className="font-semibold text-foreground">{formatCurrency(n(commission?.avg_deal_commission))}</span>.
                                {' '}Payable now:{' '}
                                <span className="font-semibold text-amber-500">{formatCurrency(commissionsPayable)}</span>.
                            </p>
                            <Link
                                href="/dashboard/deals/commissions"
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                            >
                                Open full commission ledger <ArrowUpRight className="h-3.5 w-3.5" />
                            </Link>
                        </div>
                    </SectionCard>
                </div>
            )}

            {/* ============ FORECAST ============ */}
            {activeTab === 'forecast' && (
                <div className="space-y-8">
                    <ForecastBoard />
                    <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
                        <RevenueForecaster />
                    </Suspense>
                </div>
            )}

            {/* ============ BILLING / AR ============ */}
            {activeTab === 'billing' && (
                <BillingBoard />
            )}

            {/* ============ PAYMENTS (refunds) ============ */}
            {activeTab === 'payments' && (
                <PaymentsPanel />
            )}

            {/* ============ PAYMENT SETTINGS ============ */}
            {activeTab === 'payment-settings' && (
                <PaymentSettings paymentApi={crmPaymentConfigApi} serviceLabel="Deal Management" />
            )}
        </div>
    )
}
