'use client'

import { useEffect, useState, useCallback } from 'react'
import { CreditCard, RefreshCw, DollarSign, TrendingUp, Building2 } from 'lucide-react'
import { authedFetch } from '@/lib/authed-fetch'

const API = process.env.NEXT_PUBLIC_API_URL || ''

interface BillingSummary {
  total_revenue_30d: number
  active_subscriptions: number
  pending_invoices: number
  overdue_invoices: number
}

interface Invoice {
  id: string
  organization_name: string
  amount: number
  currency: string
  status: string
  due_date: string
  created_at: string
}

export default function BillingPage() {
  const [summary, setSummary] = useState<BillingSummary | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)

  const fetchBilling = useCallback(async () => {
    setLoading(true)
    try {
      const [sumRes, invRes] = await Promise.all([
        authedFetch(`${API}/api/v1/admin/billing/summary`),
        authedFetch(`${API}/api/v1/admin/billing/invoices?limit=20`),
      ])
      if (sumRes.ok) {
        const data = (await sumRes.json()) as { data: BillingSummary }
        setSummary(data.data)
      }
      if (invRes.ok) {
        const data = (await invRes.json()) as { data: Invoice[] }
        setInvoices(data.data || [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchBilling() }, [fetchBilling])

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-900/30 border border-red-800">
            <CreditCard className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h1 className="font-mono text-lg text-white font-bold tracking-wide">BILLING</h1>
            <p className="font-mono text-xs text-zinc-500">Revenue and invoice management</p>
          </div>
        </div>
        <button onClick={fetchBilling} className="p-2 text-zinc-400 hover:text-white transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Revenue (30d)', value: fmt(summary.total_revenue_30d), icon: DollarSign, color: 'text-green-400' },
            { label: 'Active Subs', value: summary.active_subscriptions, icon: TrendingUp, color: 'text-amber-400' },
            { label: 'Pending', value: summary.pending_invoices, icon: CreditCard, color: 'text-blue-400' },
            { label: 'Overdue', value: summary.overdue_invoices, icon: CreditCard, color: 'text-red-400' },
          ].map((card) => (
            <div key={card.label} className="p-4 bg-zinc-900 border border-zinc-800">
              <div className="flex items-center gap-2 mb-2">
                <card.icon className={`w-4 h-4 ${card.color}`} />
                <span className="font-mono text-[10px] text-zinc-500 uppercase">{card.label}</span>
              </div>
              <div className="font-mono text-xl text-white">{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Invoices */}
      <div className="border border-zinc-800 bg-zinc-900/50">
        <div className="px-4 py-3 border-b border-zinc-800">
          <span className="font-mono text-xs text-zinc-400 uppercase tracking-wider">Recent Invoices</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left px-4 py-3 font-mono text-[10px] text-zinc-500 uppercase tracking-wider">Organization</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-zinc-500 uppercase tracking-wider">Amount</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-zinc-500 uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-zinc-500 uppercase tracking-wider">Due Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center font-mono text-sm text-zinc-500">Loading...</td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center font-mono text-sm text-zinc-500">No invoices found</td></tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-3 font-mono text-sm text-white flex items-center gap-1">
                    <Building2 className="w-3 h-3 text-zinc-500" />{inv.organization_name}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-white">{fmt(inv.amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 font-mono text-[10px] border ${
                      inv.status === 'paid' ? 'bg-green-900/30 text-green-400 border-green-800' :
                      inv.status === 'overdue' ? 'bg-red-900/30 text-red-400 border-red-800' :
                      'bg-amber-900/30 text-amber-400 border-amber-800'
                    }`}>
                      {inv.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-zinc-500">{new Date(inv.due_date).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
