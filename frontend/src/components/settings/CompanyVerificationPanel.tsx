'use client'

/**
 * CompanyVerificationPanel — org-level KYB (Know-Your-Business) form.
 * Marketplace Trust & Anti-Fraud, Phase 1 (Gate A).
 *
 * An organization submits its business identity + proof documents + the principal's
 * Ghana-Card identity check (Gate B) for admin review. On approval the org becomes
 * verified and its listings appear on the public marketplace with a Verified badge.
 *
 * This is org-wide (one verification per org), so it is surfaced as a "Verification"
 * tab inside EVERY service's Settings (Valuation, PM, CRM, Projects) — verify once,
 * see the status everywhere. All calls hit the org-scoped /api/org-verification API.
 */

import { useEffect, useState, useCallback } from 'react'
import {
  ShieldCheck, Clock, ShieldX, Upload, Loader2, CheckCircle2, FileText, Building2, AlertTriangle,
  BadgeCheck, ExternalLink, UserCheck,
} from 'lucide-react'
import { authedFetch } from '@/lib/authed-fetch'

type VStatus = 'unverified' | 'pending' | 'verified' | 'rejected' | 'suspended'

interface KybDoc { type: string; key: string; filename?: string; url?: string | null; uploaded_at?: string }

interface Form {
  legal_name: string
  business_registration_number: string
  tin_number: string
  agency_license_number: string
  license_expiry: string
  registered_address: string
  contact_email: string
  contact_phone: string
  principal_name: string
  principal_ghana_card: string
}

const EMPTY: Form = {
  legal_name: '', business_registration_number: '', tin_number: '', agency_license_number: '',
  license_expiry: '', registered_address: '', contact_email: '', contact_phone: '',
  principal_name: '', principal_ghana_card: '',
}

const DOC_TYPES: { type: string; label: string }[] = [
  { type: 'certificate_of_incorporation', label: 'Certificate of Incorporation (RGD)' },
  { type: 'tin_certificate', label: 'TIN Certificate (GRA)' },
  { type: 'agency_license', label: 'Real Estate Agency Licence (Act 1047)' },
  { type: 'principal_ghana_card', label: "Principal's Ghana Card" },
]

const STATUS_UI: Record<VStatus, { label: string; cls: string; icon: React.ReactNode; note: string }> = {
  verified: { label: 'Verified', cls: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30', icon: <ShieldCheck className="w-4 h-4" />, note: 'Your company is verified. Your listings appear on the public marketplace with a Verified badge.' },
  pending: { label: 'Under review', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30', icon: <Clock className="w-4 h-4" />, note: 'Your submission is being reviewed. You can update it below while it is pending.' },
  rejected: { label: 'Rejected', cls: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30', icon: <ShieldX className="w-4 h-4" />, note: 'Your submission was not approved. Please review and resubmit with correct details/documents.' },
  suspended: { label: 'Suspended', cls: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30', icon: <AlertTriangle className="w-4 h-4" />, note: 'Your organization is suspended. Contact support.' },
  unverified: { label: 'Not verified', cls: 'bg-muted text-muted-foreground border-border', icon: <ShieldX className="w-4 h-4" />, note: 'Your listings will NOT appear on the public marketplace until your company is verified.' },
}

export function CompanyVerificationPanel() {
  const [status, setStatus] = useState<VStatus>('unverified')
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [docs, setDocs] = useState<KybDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  // Identity verification (KYC) — Gate B
  const [kycConfigured, setKycConfigured] = useState(false)
  const [idStatus, setIdStatus] = useState<string>('unverified')
  const [principalVerified, setPrincipalVerified] = useState(false)
  const [startingId, setStartingId] = useState(false)
  // Verified orgs are locked by default (anti-fraud: no silent identity changes),
  // but can opt into an update (e.g. licence renewal) which re-enters review.
  const [editing, setEditing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authedFetch('/api/org-verification')
      if (res.ok) {
        const { data } = await res.json()
        setStatus((data?.status as VStatus) || 'unverified')
        setVerifiedAt(data?.organization?.verified_at || null)
        const s = data?.latest_submission
        if (s) {
          setForm({
            legal_name: s.legal_name || '', business_registration_number: s.business_registration_number || '',
            tin_number: s.tin_number || '', agency_license_number: s.agency_license_number || '',
            license_expiry: s.license_expiry ? String(s.license_expiry).slice(0, 10) : '',
            registered_address: s.registered_address || '', contact_email: s.contact_email || '',
            contact_phone: s.contact_phone || '', principal_name: s.principal_name || '',
            principal_ghana_card: s.principal_ghana_card || '',
          })
          if (Array.isArray(s.documents)) setDocs(s.documents)
        }
        setKycConfigured(!!data?.kyc_configured)
        setPrincipalVerified(!!data?.principal_identity_verified)
      }
      const idRes = await authedFetch('/api/identity/status')
      if (idRes.ok) {
        const { data: idData } = await idRes.json()
        setKycConfigured((prev) => prev || !!idData?.configured)
        setIdStatus(idData?.status || 'unverified')
      }
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const startIdentity = async () => {
    setStartingId(true); setMsg(null)
    try {
      const res = await authedFetch('/api/identity/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose: 'kyb_principal', redirect_url: typeof window !== 'undefined' ? window.location.href : undefined }),
      })
      if (res.ok) {
        const { data } = await res.json()
        if (data?.verification_url) { window.location.href = data.verification_url as string; return }
        setMsg({ kind: 'err', text: 'No verification URL returned' })
      } else {
        const j = await res.json().catch(() => ({}))
        setMsg({ kind: 'err', text: j.error || 'Could not start identity verification' })
      }
    } catch { setMsg({ kind: 'err', text: 'Could not start identity verification' }) } finally { setStartingId(false) }
  }

  const uploadDoc = async (type: string, file: File) => {
    setUploading(type); setMsg(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('type', type)
      const res = await authedFetch('/api/org-verification/documents', { method: 'POST', body: fd })
      if (res.ok) {
        const { data } = await res.json()
        setDocs((prev) => [...prev.filter((d) => d.type !== type), data])
      } else {
        const j = await res.json().catch(() => ({}))
        setMsg({ kind: 'err', text: j.error || 'Upload failed' })
      }
    } catch { setMsg({ kind: 'err', text: 'Upload failed' }) } finally { setUploading(null) }
  }

  const submit = async () => {
    setSaving(true); setMsg(null)
    try {
      const res = await authedFetch('/api/org-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, documents: docs }),
      })
      if (res.ok) {
        setMsg({ kind: 'ok', text: 'Submitted for review. We will verify your company shortly.' })
        await load()
      } else {
        const j = await res.json().catch(() => ({}))
        setMsg({ kind: 'err', text: j.error || 'Submission failed' })
      }
    } catch { setMsg({ kind: 'err', text: 'Submission failed' }) } finally { setSaving(false) }
  }

  const su = STATUS_UI[status]
  // Suspended orgs are fully locked. Verified orgs are locked until they choose to
  // update. Everyone else (unverified / pending / rejected) can edit freely.
  const locked = status === 'suspended'
  const canEdit = !locked && (status !== 'verified' || editing)

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-2">
      {/* Header + status */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400"><Building2 className="w-5 h-5" /></div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Company Verification</h1>
            <p className="text-sm text-muted-foreground">Verify your business to list on the PropMetrik marketplace.</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${su.cls}`}>{su.icon}{su.label}</span>
      </div>

      <div className={`flex items-start gap-2.5 rounded-xl border p-4 ${su.cls}`}>
        {su.icon}
        <p className="text-sm">{su.note}{status === 'verified' && verifiedAt ? ` (verified ${new Date(verifiedAt).toLocaleDateString('en-GB')})` : ''}</p>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${msg.kind === 'ok' ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>
          {msg.kind === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}{msg.text}
        </div>
      )}

      {/* Verified orgs are locked; offer an explicit opt-in to update (e.g. licence renewal). */}
      {status === 'verified' && !editing && (
        <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Need to update your details or renew a document? Changes will be resubmitted for review.</p>
          <button onClick={() => setEditing(true)}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 text-sm font-medium hover:bg-indigo-500/10 transition-colors">
            <Upload className="w-4 h-4" /> Update details
          </button>
        </div>
      )}

      {/* Business identity */}
      <Card title="Business identity">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Legal company name" value={form.legal_name} onChange={set('legal_name')} readOnly={!canEdit} />
          <Field label="Business registration number (RGD)" value={form.business_registration_number} onChange={set('business_registration_number')} readOnly={!canEdit} />
          <Field label="TIN (GRA)" value={form.tin_number} onChange={set('tin_number')} readOnly={!canEdit} />
          <Field label="Agency licence no. (Act 1047)" value={form.agency_license_number} onChange={set('agency_license_number')} readOnly={!canEdit} />
          <Field label="Licence expiry" type="date" value={form.license_expiry} onChange={set('license_expiry')} readOnly={!canEdit} />
          <Field label="Registered address" value={form.registered_address} onChange={set('registered_address')} readOnly={!canEdit} />
          <Field label="Contact email" type="email" value={form.contact_email} onChange={set('contact_email')} readOnly={!canEdit} />
          <Field label="Contact phone" value={form.contact_phone} onChange={set('contact_phone')} readOnly={!canEdit} />
        </div>
      </Card>

      {/* Principal / responsible person */}
      <Card title="Principal / responsible person">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full name" value={form.principal_name} onChange={set('principal_name')} readOnly={!canEdit} />
          <Field label="Ghana Card number" value={form.principal_ghana_card} onChange={set('principal_ghana_card')} readOnly={!canEdit} />
        </div>
      </Card>

      {/* Identity verification (KYC — Gate B) */}
      <Card title="Identity verification (Ghana Card)">
        {!kycConfigured ? (
          <p className="text-sm text-muted-foreground">Identity verification will be enabled shortly. You can still submit your business details now.</p>
        ) : idStatus === 'verified' || principalVerified ? (
          <div className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
            <BadgeCheck className="w-4 h-4" /> Principal identity verified.
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground max-w-md">
              Verify the principal&apos;s Ghana Card (document + live selfie) via our KYC partner. <span className="font-medium text-foreground">Required</span> before your company can be verified.
              {idStatus === 'in_progress' ? ' A session is in progress — continue or restart it.' : ''}
            </p>
            <button onClick={startIdentity} disabled={startingId}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50">
              {startingId ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
              {idStatus === 'in_progress' ? 'Continue verification' : 'Verify my identity'}
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </Card>

      {/* Documents — the whole row is the click target so the file picker opens reliably. */}
      <Card title="Proof documents">
        <div className="space-y-2.5">
          {DOC_TYPES.map(({ type, label }) => {
            const existing = docs.find((d) => d.type === type)
            const isUploading = uploading === type
            const content = (
              <>
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{label}</p>
                    {existing ? (
                      <a href={existing.url || undefined} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline truncate">
                        {existing.filename || 'Uploaded'} ✓ · View
                      </a>
                    ) : (
                      <p className="text-xs text-muted-foreground truncate">{canEdit ? 'Click to upload — PDF or image' : 'Not uploaded'}</p>
                    )}
                  </div>
                </div>
                {canEdit && (
                  <span className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium">
                    {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    {existing ? 'Replace' : 'Upload'}
                  </span>
                )}
              </>
            )
            if (!canEdit) {
              return (
                <div key={type} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">{content}</div>
              )
            }
            return (
              <label key={type} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 cursor-pointer hover:border-indigo-500/50 hover:bg-muted/40 transition-colors">
                {content}
                <input type="file" className="hidden" accept="image/*,application/pdf" disabled={isUploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(type, f); e.target.value = '' }} />
              </label>
            )
          })}
        </div>
      </Card>

      {canEdit && kycConfigured && !principalVerified && idStatus !== 'verified' && (
        <p className="text-xs text-amber-600 dark:text-amber-400 text-right">Identity verification is required before your company can be approved.</p>
      )}
      {canEdit && (
        <div className="flex justify-end gap-2">
          {status === 'verified' && editing && (
            <button onClick={() => { setEditing(false); load() }} disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
              Cancel
            </button>
          )}
          <button onClick={submit} disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            {status === 'pending' ? 'Update submission' : status === 'verified' ? 'Resubmit for review' : 'Submit for verification'}
          </button>
        </div>
      )}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-sm">
      <h2 className="text-base font-semibold text-foreground mb-4">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', readOnly }: {
  label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string; readOnly?: boolean
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</span>
      <input type={type} value={value} onChange={onChange} readOnly={readOnly}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:opacity-60 read-only:opacity-70" />
    </label>
  )
}

export default CompanyVerificationPanel
