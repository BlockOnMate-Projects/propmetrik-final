'use client'

import { useEffect, useState, useCallback } from 'react'
import { CreditCard, RefreshCw, DollarSign, TrendingUp, Building2, Receipt, Layers, Wallet } from 'lucide-react'
import { authedFetch } from '@/lib/authed-fetch'
import { formatCurrency } from '@/lib/utils'

const API = process.env.NEXT_PUBLIC_API_URL || ''

interface Summary {
  total_revenue: number
  subscription_revenue: number
  platform_fees: number
  gross_volume: number
  transactions: number
  mrr: number
  arr: number
  active_subscriptions: number
  pending_invoices: number
  overdue_invoices: number
  currency: string
}
interface RevenueBreakdown {
  by_source: { source: string; amount: number }[]
  by_type: { payment_type: string; count: number; gross: number; fees: number }[]
}
interface Txn {
  id: string; reference: string; payment_type: string; payer_email: string | null
  channel: string | null; status: string; gross: number; fee: number; currency: string
  created_at: string; label: string | null
}
interface Invoice {
  id: string; invoice_number: string; organization_name: string; amount: number
  currency: string; status: string; due_date: string; created_at: string
}

const PERIODS = [
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
  { id: '12m', label: '12M' },
  { id: 'all', label: 'ALL' },
]

const TYPE_LABEL: Record<string, string> = {
  subscription: 'Subscriptions', rent: 'Rent', deal: 'Deals', project: 'Projects', valuation: 'Valuations',
}

export default function BillingPage() {
  const [period, setPeriod] = useState('30d')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [revenue, setRevenue] = useState<RevenueBreakdown | null>(null)
  const [txns, setTxns] = useState<Txn[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [tab, setTab] = useState<'transactions' | 'invoices'>('transactions')
  const [loading, setLoading] = useState(true)

  const ghs = (n: number) => formatCurrency(Number(n) || 0, 'GHS')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [s, r, t, i] = await Promise.all([
        authedFetch(`${API}/api/v1/admin/billing/summary?period=${period}`),
        authedFetch(`${API}/api/v1/admin/billing/revenue?period=${period}`),
        authedFetch(`${API}/api/v1/admin/billing/transactions?limit=50`),
        authedFetch(`${API}/api/v1/admin/billing/invoices?limit=20`),
      ])
      if (s.ok) setSummary((await s.json()).data)
      if (r.ok) setRevenue((await r.json()).data)
      if (t.ok) setTxns((await t.json()).data || [])
      if (i.ok) setInvoices((await i.json()).data || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [period])

  useEffect(() => { fetchAll() }, [fetchAll])

  const cards = summary ? [
    { label: 'Total Revenue', value: ghs(summary.total_revenue), icon: DollarSign, color: 'text-green-600 dark:text-green-400' },
    { label: 'Subscriptions', value: ghs(summary.subscription_revenue), icon: TrendingUp, color: 'text-amber-600 dark:text-amber-400' },
    { label: 'Platform Fees', value: ghs(summary.platform_fees), icon: Wallet, color: 'text-cyan-600 dark:text-cyan-400' },
    { label: 'MRR', value: ghs(summary.mrr), icon: Layers, color: 'text-violet-600 dark:text-violet-400' },
    { label: 'ARR', value: ghs(summary.arr), icon: Layers, color: 'text-violet-600 dark:text-violet-300' },
    { label: 'Active Subs', value: summary.active_subscriptions, icon: TrendingUp, color: 'text-amber-600 dark:text-amber-400' },
    { label: 'Processed Volume', value: ghs(summary.gross_volume), icon: CreditCard, color: 'text-blue-600 dark:text-blue-400' },
    { label: 'Pending / Overdue', value: `${summary.pending_invoices} / ${summary.overdue_invoices}`, icon: Receipt, color: 'text-red-600 dark:text-red-400' },
  ] : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 dark:bg-red-900/30 border border-red-800"><CreditCard className="w-5 h-5 text-red-600 dark:text-red-400" /></div>
          <div>
            <h1 className="font-mono text-lg text-foreground font-bold tracking-wide">PLATFORM REVENUE</h1>
            <p className="font-mono text-xs text-muted-foreground">Subscriptions + platform fees, in one ledger</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-card border border-border">
            {PERIODS.map(p => (
              <button key={p.id} onClick={() => setPeriod(p.id)}
                className={`px-3 py-1.5 font-mono text-[11px] transition-colors ${period === p.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-muted-foreground'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={fetchAll} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards.map(card => (
            <div key={card.label} className="p-4 bg-card border border-border">
              <div className="flex items-center gap-2 mb-2">
                <card.icon className={`w-4 h-4 ${card.color}`} />
                <span className="font-mono text-[10px] text-muted-foreground uppercase">{card.label}</span>
              </div>
              <div className="font-mono text-lg text-foreground truncate" title={String(card.value)}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Revenue breakdown */}
      {revenue && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="border border-border bg-card/50 p-4">
            <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Revenue by source</span>
            <div className="mt-3 space-y-2">
              {revenue.by_source.map(s => (
                <div key={s.source} className="flex items-center justify-between">
                  <span className="font-mono text-xs text-muted-foreground capitalize">{s.source.replace('_', ' ')}</span>
                  <span className="font-mono text-sm text-foreground">{ghs(s.amount)}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 font-mono text-[10px] text-muted-foreground leading-relaxed">
              Revenue = subscriptions + platform fees only. Principal (rent, sale proceeds) is paid out to users via Paystack and is not platform revenue.
            </p>
          </div>
          <div className="border border-border bg-card/50 p-4">
            <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">By payment type</span>
            <div className="mt-3 space-y-2">
              {revenue.by_type.length === 0 && <p className="font-mono text-xs text-muted-foreground">No transactions in this period.</p>}
              {revenue.by_type.map(t => (
                <div key={t.payment_type} className="flex items-center justify-between">
                  <span className="font-mono text-xs text-muted-foreground">{TYPE_LABEL[t.payment_type] || t.payment_type} <span className="text-muted-foreground">·{t.count}</span></span>
                  <span className="font-mono text-xs text-muted-foreground">{ghs(t.gross)} <span className="text-cyan-600 dark:text-cyan-400/80">(fee {ghs(t.fees)})</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-card border border-border w-fit">
        {([['transactions', 'Transactions'], ['invoices', 'Invoices']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 font-mono text-[11px] transition-colors ${tab === id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-muted-foreground'}`}>
            {label.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Transactions */}
      {tab === 'transactions' && (
        <div className="border border-border bg-card/50 overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-border">
              {['Date', 'Type', 'Payer', 'Gross', 'Platform Fee', 'Channel', 'Status'].map(h => (
                <th key={h} className="text-left px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center font-mono text-sm text-muted-foreground">Loading…</td></tr>
              ) : txns.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center font-mono text-sm text-muted-foreground">No transactions yet</td></tr>
              ) : txns.map(t => (
                <tr key={t.id} className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                  <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-mono text-xs text-foreground">{TYPE_LABEL[t.payment_type] || t.payment_type}{t.label ? <span className="text-muted-foreground"> · {t.label}</span> : ''}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground truncate max-w-[200px]">{t.payer_email || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-foreground">{formatCurrency(t.gross, t.currency)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-cyan-600 dark:text-cyan-400">{t.fee > 0 ? formatCurrency(t.fee, t.currency) : '—'}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground capitalize">{(t.channel || '').replace('_', ' ') || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 font-mono text-[10px] border ${
                      t.status === 'success' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-800' :
                      t.status === 'failed' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-800' :
                      'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-800'}`}>{t.status.toUpperCase()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invoices */}
      {tab === 'invoices' && (
        <div className="border border-border bg-card/50 overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-border">
              {['Account', 'Invoice', 'Amount', 'Status', 'Due'].map(h => (
                <th key={h} className="text-left px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center font-mono text-sm text-muted-foreground">Loading…</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center font-mono text-sm text-muted-foreground">No invoices found</td></tr>
              ) : invoices.map(inv => (
                <tr key={inv.id} className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                  <td className="px-4 py-3 font-mono text-sm text-foreground flex items-center gap-1"><Building2 className="w-3 h-3 text-muted-foreground" />{inv.organization_name}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{inv.invoice_number}</td>
                  <td className="px-4 py-3 font-mono text-sm text-foreground">{formatCurrency(inv.amount, inv.currency)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 font-mono text-[10px] border ${
                      inv.status === 'paid' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-800' :
                      inv.status === 'overdue' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-800' :
                      'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-800'}`}>{inv.status.toUpperCase()}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">{inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
