'use client'

/**
 * Admin KYB Review — Marketplace Trust & Anti-Fraud, Phase 1 review UI.
 * Shows each customer org's submitted business-verification details + documents so a
 * platform admin can inspect them and Verify / Reject. Reads /admin/organizations/verifications.
 */

import { useEffect, useState, useCallback } from 'react'
import { ShieldCheck, RefreshCw, FileText, BadgeCheck, ShieldX, ExternalLink, Loader2, UserCheck, AlertTriangle } from 'lucide-react'
import { authedFetch } from '@/lib/authed-fetch'

interface KybDoc { type: string; url?: string | null; filename?: string }
interface Submission {
  id: string
  organization_id: string
  organization_name?: string
  legal_name?: string
  business_registration_number?: string
  tin_number?: string
  agency_license_number?: string
  license_expiry?: string
  registered_address?: string
  contact_email?: string
  contact_phone?: string
  principal_name?: string
  principal_ghana_card?: string
  documents?: KybDoc[]
  submitted_at?: string
  principal_identity_verified?: boolean
}

const DOC_LABELS: Record<string, string> = {
  certificate_of_incorporation: 'Certificate of Incorporation',
  tin_certificate: 'TIN Certificate',
  agency_license: 'Agency Licence',
  principal_ghana_card: "Principal's Ghana Card",
  other: 'Other document',
}

export default function KybReviewPage() {
  const [subs, setSubs] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchQueue = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authedFetch('/api/admin/organizations/verifications')
      if (res.ok) { const d = (await res.json()) as { data: Submission[] }; setSubs(d.data || []) }
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchQueue() }, [fetchQueue])

  const decide = async (orgId: string, action: 'verify' | 'reject', force = false) => {
    setBusy(orgId); setError(null)
    try {
      const res = await authedFetch(`/api/admin/organizations/${orgId}/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(force ? { force: true } : {}),
      })
      if (res.ok) { await fetchQueue(); return }
      const j = await res.json().catch(() => ({})) as { error?: string; code?: string }
      if (res.status === 409 && j.code === 'PRINCIPAL_KYC_REQUIRED') {
        if (typeof window !== 'undefined' && window.confirm(`${j.error}\n\nOverride and verify anyway?`)) { setBusy(null); await decide(orgId, action, true) }
        return
      }
      setError(j.error || `Action failed (${res.status})`)
    } catch { setError('Network error') } finally { setBusy(null) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 dark:bg-red-900/30 border border-red-800"><ShieldCheck className="w-5 h-5 text-red-600 dark:text-red-400" /></div>
          <div>
            <h1 className="font-mono text-lg text-foreground font-bold tracking-wide">KYB REVIEW</h1>
            <p className="font-mono text-xs text-muted-foreground">Review & verify customer business submissions (Gate A)</p>
          </div>
        </div>
        <button onClick={fetchQueue} className="p-2 text-muted-foreground hover:text-foreground transition-colors"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>

      {error && <div className="px-4 py-2 bg-red-100 dark:bg-red-900/20 border border-red-800 font-mono text-xs text-red-600 dark:text-red-400">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : subs.length === 0 ? (
        <div className="border border-border bg-card/50 px-4 py-12 text-center font-mono text-sm text-muted-foreground">No pending KYB submissions.</div>
      ) : (
        <div className="space-y-4">
          {subs.map((s) => (
            <div key={s.id} className="border border-border bg-card rounded-lg p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="font-mono text-base font-bold text-foreground">{s.legal_name || s.organization_name || '—'}</h2>
                  <p className="font-mono text-[11px] text-muted-foreground">Submitted {s.submitted_at ? new Date(s.submitted_at).toLocaleString('en-GB') : '—'}</p>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 font-mono text-[10px] uppercase border ${s.principal_identity_verified ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-800' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-800'}`}>
                  <UserCheck className="w-3 h-3" />{s.principal_identity_verified ? 'Principal KYC ✓' : 'Principal KYC pending'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 font-mono text-xs mb-4">
                <Field label="Reg. number (RGD)" value={s.business_registration_number} />
                <Field label="TIN (GRA)" value={s.tin_number} />
                <Field label="Agency licence (Act 1047)" value={s.agency_license_number} />
                <Field label="Licence expiry" value={s.license_expiry ? String(s.license_expiry).slice(0, 10) : null} />
                <Field label="Registered address" value={s.registered_address} />
                <Field label="Contact" value={[s.contact_email, s.contact_phone].filter(Boolean).join(' · ')} />
                <Field label="Principal" value={s.principal_name} />
                <Field label="Principal Ghana Card" value={s.principal_ghana_card} />
              </div>

              {s.documents && s.documents.length > 0 && (
                <div className="mb-4">
                  <p className="font-mono text-[10px] text-muted-foreground uppercase mb-2">Documents</p>
                  <div className="flex flex-wrap gap-2">
                    {s.documents.map((d, i) => (
                      <a key={i} href={d.url || undefined} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded font-mono text-[11px] text-foreground hover:bg-muted transition-colors">
                        <FileText className="w-3.5 h-3.5" />{DOC_LABELS[d.type] || d.type}<ExternalLink className="w-3 h-3 text-muted-foreground" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {!s.principal_identity_verified && (
                <div className="flex items-center gap-2 mb-3 font-mono text-[11px] text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5" /> The principal hasn&apos;t completed Ghana-Card verification (Didit). Verifying will prompt for an override.
                </div>
              )}

              <div className="flex items-center gap-2">
                <button onClick={() => decide(s.organization_id, 'verify')} disabled={busy === s.organization_id}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white font-mono text-xs font-bold hover:bg-green-700 transition-colors disabled:opacity-50">
                  {busy === s.organization_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BadgeCheck className="w-3.5 h-3.5" />} VERIFY
                </button>
                <button onClick={() => decide(s.organization_id, 'reject')} disabled={busy === s.organization_id}
                  className="inline-flex items-center gap-1.5 px-4 py-2 border border-red-800 text-red-600 dark:text-red-400 font-mono text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50">
                  <ShieldX className="w-3.5 h-3.5" /> REJECT
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className="text-foreground">{value || <span className="text-muted-foreground/60">—</span>}</span>
    </div>
  )
}
