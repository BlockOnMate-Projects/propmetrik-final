'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Inbox, RefreshCw, Mail, Phone, Building2, ArrowUpRight, Sparkles } from 'lucide-react'
import { propertyManagementApi, type PMEnquiry } from '@/lib/property-management-api'

const STATUS_FILTERS = ['all', 'new', 'contacted', 'qualified', 'converted', 'lost'] as const
const STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'lost'] as const

function txnBadge(t: PMEnquiry['transaction_type']) {
  if (t === 'sale') return { label: 'SALE', cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' }
  if (t === 'lease') return { label: 'LEASE', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' }
  if (t === 'rental') return { label: 'RENT', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' }
  return { label: '—', cls: 'bg-muted text-muted-foreground' }
}

function statusCls(s: PMEnquiry['status']) {
  switch (s) {
    case 'new': return 'text-blue-600 dark:text-blue-400'
    case 'contacted': return 'text-amber-600 dark:text-amber-400'
    case 'qualified': return 'text-violet-600 dark:text-violet-400'
    case 'converted': return 'text-green-600 dark:text-green-400'
    case 'lost': return 'text-red-600 dark:text-red-400'
    default: return 'text-muted-foreground'
  }
}

export default function EnquiriesPage() {
  const { data: session } = useSession()
  const userType = (session?.user as any)?.userType || 'staff'
  const subscribedServices: string[] = (session?.user as any)?.subscribedServices || []
  const hasCrm = userType === 'staff' || subscribedServices.includes('crm')

  const [enquiries, setEnquiries] = useState<PMEnquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>('all')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await propertyManagementApi.getEnquiries(filter)
      setEnquiries(res.enquiries || [])
    } catch {
      setEnquiries([])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  const changeStatus = async (id: string, status: string) => {
    setBusyId(id)
    try {
      await propertyManagementApi.updateEnquiryStatus(id, status)
      setEnquiries(prev => prev.map(e => (e.id === id ? { ...e, status: status as PMEnquiry['status'] } : e)))
    } catch {
      // ignore — keep prior state
    } finally {
      setBusyId(null)
    }
  }

  const fmtOffer = (e: PMEnquiry) => {
    if (e.offer_amount == null) return '—'
    const n = typeof e.offer_amount === 'string' ? parseFloat(e.offer_amount) : e.offer_amount
    if (!n) return '—'
    return `${e.offer_currency || 'GHS'} ${n.toLocaleString()}`
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/30 border border-amber-800/30">
            <Inbox className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="font-mono text-lg text-foreground font-bold tracking-wide">ENQUIRIES</h1>
            <p className="font-mono text-xs text-muted-foreground">Buyer &amp; lessee leads from your marketplace listings</p>
          </div>
        </div>
        <button onClick={load} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Upsell for PM-only customers */}
      {!hasCrm && (
        <div className="flex items-start gap-3 border border-amber-300 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-4">
          <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-800 dark:text-amber-200">Turn enquiries into closed sales</p>
            <p className="text-amber-700 dark:text-amber-300/80 mt-0.5">
              Add <span className="font-semibold">Deal Management</span> to convert these leads into a tracked sales pipeline with
              agents, offers and commissions — your for-sale listings flow in automatically.
            </p>
            <Link href="/dashboard/billing" className="inline-flex items-center gap-1 mt-2 font-medium text-amber-700 dark:text-amber-300 hover:underline">
              Explore Deal Management <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-md font-mono text-xs uppercase transition-colors border ${
              filter === s
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-card text-muted-foreground border-border hover:text-foreground'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="border border-border bg-card/50 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {['Contact', 'Property', 'Type', 'Offer', 'Received', 'Status', ''].map((h, i) => (
                  <th key={i} className="text-left px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center font-mono text-sm text-muted-foreground">Loading…</td></tr>
              ) : enquiries.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center font-mono text-sm text-muted-foreground">No enquiries yet</td></tr>
              ) : (
                enquiries.map(e => {
                  const badge = txnBadge(e.transaction_type)
                  return (
                    <tr key={e.id} className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/5 align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm text-foreground">{e.name}</div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{e.phone}</div>
                        {e.email && <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{e.email}</div>}
                        {e.message && <div className="text-[11px] text-muted-foreground mt-1 max-w-xs line-clamp-2">{e.message}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-foreground flex items-center gap-1"><Building2 className="w-3.5 h-3.5 text-muted-foreground" />{e.property_title || '—'}</div>
                        {e.property_city && <div className="text-[11px] text-muted-foreground">{e.property_city}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-foreground">{fmtOffer(e)}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{new Date(e.created_at).toLocaleDateString('en-GB')}</td>
                      <td className="px-4 py-3">
                        {e.status === 'converted' ? (
                          <span className={`font-mono text-xs font-semibold uppercase ${statusCls(e.status)}`}>Converted</span>
                        ) : (
                          <select
                            value={e.status}
                            disabled={busyId === e.id}
                            onChange={ev => changeStatus(e.id, ev.target.value)}
                            className={`bg-card border border-border rounded px-2 py-1 font-mono text-xs uppercase ${statusCls(e.status)} focus:outline-none focus:border-amber-500`}
                          >
                            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {e.deal_id && hasCrm && (
                          <Link
                            href={`/dashboard/deals/${e.deal_id}`}
                            className="inline-flex items-center gap-1 font-mono text-[11px] text-amber-600 dark:text-amber-400 hover:underline"
                          >
                            View in pipeline <ArrowUpRight className="w-3 h-3" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
