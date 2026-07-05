'use client'

/**
 * Listing Mandate panel — Marketplace Trust & Anti-Fraud, Phase 3 (Gate C).
 * Lets an agent establish the "right to list" a property before it appears on the
 * public marketplace: either send the owner an e-sign authorization, or self-attest
 * ownership. The owner signs via the existing e-sign magic link (no new page).
 */

import { useEffect, useState, useCallback } from 'react'
import { ShieldCheck, Send, Loader2, BadgeCheck, Clock, UserCheck, AlertTriangle, X } from 'lucide-react'
import { authedFetch } from '@/lib/authed-fetch'

interface Props {
  source?: 'pm' | 'crm'
  propertyId: string
  // Optional prefill from the property (owner details)
  ownerName?: string | null
  ownerEmail?: string | null
  ownerPhone?: string | null
}

type MState = 'none' | 'pending' | 'signed' | 'self_attested' | 'expired' | 'voided' | 'declined'

const STATE_UI: Record<MState, { label: string; cls: string; icon: React.ReactNode }> = {
  signed: { label: 'Owner authorized', cls: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30', icon: <BadgeCheck className="w-4 h-4" /> },
  self_attested: { label: 'Owner-operator (self-attested)', cls: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30', icon: <BadgeCheck className="w-4 h-4" /> },
  pending: { label: 'Awaiting owner signature', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30', icon: <Clock className="w-4 h-4" /> },
  expired: { label: 'Mandate expired', cls: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30', icon: <AlertTriangle className="w-4 h-4" /> },
  voided: { label: 'Mandate voided', cls: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30', icon: <X className="w-4 h-4" /> },
  declined: { label: 'Owner declined', cls: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30', icon: <X className="w-4 h-4" /> },
  none: { label: 'No authorization yet', cls: 'bg-muted text-muted-foreground border-border', icon: <ShieldCheck className="w-4 h-4" /> },
}

export function ListingMandatePanel({ source = 'pm', propertyId, ownerName, ownerEmail, ownerPhone }: Props) {
  const [state, setState] = useState<MState>('none')
  const [hasRight, setHasRight] = useState(false)
  const [conflict, setConflict] = useState<{ reason?: string; fingerprint_kind?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [form, setForm] = useState({ owner_name: '', owner_email: '', owner_phone: '', price_ceiling: '', land_title_number: '', parcel_id: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authedFetch(`/api/listing-mandate/status?source=${source}&property_id=${encodeURIComponent(propertyId)}`)
      if (res.ok) {
        const { data } = await res.json()
        setState((data?.status as MState) || 'none')
        setHasRight(!!data?.has_right_to_list)
        setConflict(data?.conflict || null)
      }
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [source, propertyId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    setForm((f) => ({
      ...f,
      owner_name: f.owner_name || ownerName || '',
      owner_email: f.owner_email || ownerEmail || '',
      owner_phone: f.owner_phone || ownerPhone || '',
    }))
  }, [ownerName, ownerEmail, ownerPhone])

  const sendMandate = async () => {
    setBusy('request'); setMsg(null)
    try {
      const res = await authedFetch('/api/listing-mandate/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source, property_id: propertyId,
          owner_name: form.owner_name, owner_email: form.owner_email, owner_phone: form.owner_phone,
          price_ceiling: form.price_ceiling ? Number(form.price_ceiling) : undefined,
          land_title_number: form.land_title_number || undefined, parcel_id: form.parcel_id || undefined,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok) { setMsg({ kind: 'ok', text: `Authorization sent to ${form.owner_email}. They'll receive a secure link to review and e-sign.` }); setShowForm(false); await load() }
      else setMsg({ kind: 'err', text: j.error || 'Could not send the mandate' })
    } catch { setMsg({ kind: 'err', text: 'Could not send the mandate' }) } finally { setBusy(null) }
  }

  const selfAttest = async () => {
    setBusy('attest'); setMsg(null)
    try {
      const res = await authedFetch('/api/listing-mandate/self-attest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, property_id: propertyId, land_title_number: form.land_title_number || undefined, parcel_id: form.parcel_id || undefined }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok) { setMsg({ kind: 'ok', text: 'Recorded — you attested ownership of this property.' }); await load() }
      else setMsg({ kind: 'err', text: j.error || 'Could not record attestation' })
    } catch { setMsg({ kind: 'err', text: 'Could not record attestation' }) } finally { setBusy(null) }
  }

  const su = STATE_UI[state] || STATE_UI.none

  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h3 className="text-base font-semibold text-foreground">Listing authorization</h3>
        </div>
        {loading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${su.cls}`}>{su.icon}{su.label}</span>
        )}
      </div>

      <p className="text-sm text-muted-foreground mb-3">
        {hasRight
          ? 'This property is authorized to appear on the public marketplace.'
          : 'Before this property can appear on the public marketplace, you must confirm the right to list it.'}
      </p>

      {conflict && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-600 dark:text-red-400 mb-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">
              {conflict.reason === 'sold_elsewhere' ? 'This property appears to already be SOLD.' : 'Possible duplicate listing detected.'}
            </p>
            <p className="text-xs opacity-90">
              Another listing shares this property&apos;s {conflict.fingerprint_kind === 'land_title' ? 'land title number' : conflict.fingerprint_kind === 'parcel' ? 'parcel id' : 'digital address'}.
              This listing is hidden from the marketplace and flagged for review to prevent double-listing/double-sale.
            </p>
          </div>
        </div>
      )}

      {msg && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm mb-3 ${msg.kind === 'ok' ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>
          {msg.kind === 'ok' ? <BadgeCheck className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}{msg.text}
        </div>
      )}

      {!hasRight && !loading && (
        <>
          {!showForm ? (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700 transition-colors">
                <Send className="w-4 h-4" /> {state === 'pending' ? 'Resend to owner' : 'Request owner authorization'}
              </button>
              <button onClick={selfAttest} disabled={busy === 'attest'}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50">
                {busy === 'attest' ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />} I own this property
              </button>
            </div>
          ) : (
            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">The owner will receive a secure link to review the authorization and e-sign it.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input label="Owner name" value={form.owner_name} onChange={(v) => setForm({ ...form, owner_name: v })} />
                <Input label="Owner email" type="email" value={form.owner_email} onChange={(v) => setForm({ ...form, owner_email: v })} />
                <Input label="Owner phone (optional)" value={form.owner_phone} onChange={(v) => setForm({ ...form, owner_phone: v })} />
                <Input label="Price ceiling (optional)" type="number" value={form.price_ceiling} onChange={(v) => setForm({ ...form, price_ceiling: v })} />
                <Input label="Land title number (optional)" value={form.land_title_number} onChange={(v) => setForm({ ...form, land_title_number: v })} />
                <Input label="Parcel / plot id (optional)" value={form.parcel_id} onChange={(v) => setForm({ ...form, parcel_id: v })} />
              </div>
              <p className="text-[11px] text-muted-foreground">Providing the land title or parcel id lets us detect duplicate or already-sold listings of this property.</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
                <button onClick={sendMandate} disabled={busy === 'request' || !form.owner_name || !form.owner_email}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                  {busy === 'request' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send for signature
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted-foreground mb-1">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
    </label>
  )
}

export default ListingMandatePanel
