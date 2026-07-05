'use client'

import { useEffect, useState, useCallback } from 'react'
import { Building2, Search, RefreshCw, Users, MapPin, Trash2, ArrowDownCircle, BadgeCheck, ShieldX, Ban, ShieldCheck, FileSearch, X, ExternalLink, FileText, Fingerprint } from 'lucide-react'
import { authedFetch } from '@/lib/authed-fetch'
import { ConfirmModal } from '@/components/admin/ConfirmModal'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'


interface Organization {
  id: string
  name: string
  slug: string
  country: string
  city: string
  user_count: number
  subscription_tier: string
  created_at: string
  is_active: boolean
  is_verified?: boolean
  verified_at?: string | null
  is_platform_org?: boolean
  kyb_status?: string | null
}

interface KybDoc { type: string; url: string | null; filename?: string; uploaded_at?: string }

interface KybSubmission {
  status: string
  legal_name: string | null
  business_registration_number: string | null
  tin_number: string | null
  agency_license_number: string | null
  license_expiry: string | null
  registered_address: string | null
  contact_email: string | null
  contact_phone: string | null
  principal_name: string | null
  principal_ghana_card: string | null
  documents: KybDoc[]
  submitted_at: string | null
  reviewed_at: string | null
  review_notes: string | null
}

interface KybDetail {
  organization: {
    id: string; name: string; is_verified: boolean; verified_at: string | null
    is_active: boolean; is_platform_org: boolean
    registration_number: string | null; tin_number: string | null
    license_number: string | null; license_expiry: string | null
  } | null
  latest_submission: KybSubmission | null
  status: string
  kyc_configured: boolean
  principal_identity_verified: boolean
}

const DOC_LABELS: Record<string, string> = {
  certificate_of_incorporation: 'Certificate of Incorporation',
  tin_certificate: 'TIN Certificate',
  agency_license: 'Agency Licence (Act 1047)',
  principal_ghana_card: "Principal's Ghana Card",
  other: 'Other Document',
}

type VState = 'verified' | 'pending' | 'rejected' | 'suspended' | 'unverified'

function verificationState(org: Organization): VState {
  if (!org.is_active) return 'suspended'
  if (org.is_platform_org || org.is_verified) return 'verified'
  if (org.kyb_status === 'pending') return 'pending'
  if (org.kyb_status === 'rejected') return 'rejected'
  return 'unverified'
}

const V_STYLES: Record<VState, string> = {
  verified: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-800',
  pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-800',
  rejected: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-800',
  suspended: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-800',
  unverified: 'bg-muted text-muted-foreground border-border',
}

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // PERF: debounce so the remote-DB search runs once the user pauses typing.
  const debouncedSearch = useDebouncedValue(search, 300)
  const [pendingDelete, setPendingDelete] = useState<Organization | null>(null)
  const [pendingFree, setPendingFree] = useState<Organization | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  // View-KYB modal: inspect what any org submitted (or "not submitted").
  const [viewingKyb, setViewingKyb] = useState<Organization | null>(null)
  const [kybDetail, setKybDetail] = useState<KybDetail | null>(null)
  const [kybLoading, setKybLoading] = useState(false)
  const [kybError, setKybError] = useState<string | null>(null)

  const fetchOrgs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authedFetch(`/api/admin/organizations?search=${encodeURIComponent(debouncedSearch)}`)
      if (res.ok) {
        const data = (await res.json()) as { data: Organization[] }
        setOrgs(data.data || [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch])

  useEffect(() => { fetchOrgs() }, [fetchOrgs])

  const openKyb = async (org: Organization) => {
    setViewingKyb(org); setKybDetail(null); setKybError(null); setKybLoading(true)
    try {
      const res = await authedFetch(`/api/admin/organizations/${org.id}/kyb`)
      if (res.ok) {
        const j = (await res.json()) as { data: KybDetail }
        setKybDetail(j.data)
      } else {
        setKybError(`Failed to load KYB (${res.status})`)
      }
    } catch {
      setKybError('Network error')
    } finally {
      setKybLoading(false)
    }
  }

  const pendingCount = orgs.filter((o) => verificationState(o) === 'pending').length

  // KYB actions: verify / reject / suspend / unsuspend. Reversible → no confirm modal.
  // Gate B: verify can 409 (PRINCIPAL_KYC_REQUIRED) → offer an admin override.
  const doAction = async (org: Organization, action: 'verify' | 'reject' | 'suspend' | 'unsuspend', force = false) => {
    setActingId(org.id); setActionError(null)
    try {
      const res = await authedFetch(`/api/admin/organizations/${org.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(force ? { force: true } : {}),
      })
      if (res.ok) { await fetchOrgs(); return }
      const j = await res.json().catch(() => ({})) as { error?: string; code?: string }
      if (res.status === 409 && j.code === 'PRINCIPAL_KYC_REQUIRED') {
        if (typeof window !== 'undefined' && window.confirm(`${j.error}\n\nOverride and verify anyway?`)) {
          setActingId(null)
          await doAction(org, action, true)
        }
        return
      }
      setActionError(j.error || `Action failed (${res.status})`)
    } catch { setActionError('Network error') } finally { setActingId(null) }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setBusy(true); setActionError(null)
    try {
      const res = await authedFetch(`/api/admin/organizations/${pendingDelete.id}`, { method: 'DELETE' })
      if (res.ok) { setPendingDelete(null); await fetchOrgs() }
      else {
        const j = await res.json().catch(() => ({})) as { error?: string }
        setActionError(j.error || `Delete failed (${res.status})`)
      }
    } catch { setActionError('Network error') } finally { setBusy(false) }
  }

  const confirmSetFree = async () => {
    if (!pendingFree) return
    setBusy(true); setActionError(null)
    try {
      const res = await authedFetch(`/api/admin/organizations/${pendingFree.id}/set-free`, { method: 'POST' })
      if (res.ok) { setPendingFree(null); await fetchOrgs() }
      else {
        const j = await res.json().catch(() => ({})) as { error?: string }
        setActionError(j.error || `Action failed (${res.status})`)
      }
    } catch { setActionError('Network error') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 dark:bg-red-900/30 border border-red-800">
            <Building2 className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h1 className="font-mono text-lg text-foreground font-bold tracking-wide">ORGANIZATIONS</h1>
            <p className="font-mono text-xs text-muted-foreground">Manage & verify (KYB) platform organizations</p>
          </div>
        </div>
        <button onClick={fetchOrgs} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Pending KYB review banner */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-100 dark:bg-amber-900/20 border border-amber-800 font-mono text-xs text-amber-700 dark:text-amber-400">
          <ShieldCheck className="w-4 h-4" />
          {pendingCount} organization{pendingCount > 1 ? 's' : ''} awaiting KYB verification review.
        </div>
      )}
      {actionError && (
        <div className="px-4 py-2 bg-red-100 dark:bg-red-900/20 border border-red-800 font-mono text-xs text-red-600 dark:text-red-400">{actionError}</div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search organizations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-card border border-border font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-red-500 focus:outline-none"
        />
      </div>

      {/* Table */}
      <div className="border border-border bg-card/50 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Organization</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Location</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Users</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Tier</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Verification</th>
              <th className="text-right px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center font-mono text-sm text-muted-foreground">Loading...</td></tr>
            ) : orgs.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center font-mono text-sm text-muted-foreground">No organizations found</td></tr>
            ) : (
              orgs.map((org) => {
                const vstate = verificationState(org)
                const acting = actingId === org.id
                return (
                  <tr key={org.id} className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                    <td className="px-4 py-3">
                      <div className="font-mono text-sm text-foreground flex items-center gap-1.5">
                        {org.name}
                        {vstate === 'verified' && <BadgeCheck className="w-3.5 h-3.5 text-green-500" />}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground">{org.slug}{org.is_platform_org ? ' · platform' : ''}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      <div className="flex items-center gap-1"><MapPin className="w-3 h-3" />{org.city}, {org.country}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      <div className="flex items-center gap-1"><Users className="w-3 h-3" />{org.user_count}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-amber-600 dark:text-amber-400 uppercase">{org.subscription_tier}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 font-mono text-[10px] uppercase border ${V_STYLES[vstate]}`}>{vstate}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        <button onClick={() => openKyb(org)} title="View KYB submission & documents"
                          className="inline-flex items-center gap-1 px-2 py-1 font-mono text-[10px] text-blue-600 dark:text-sky-400 hover:bg-blue-100 dark:hover:bg-sky-900/30 border border-transparent hover:border-sky-800 transition-colors">
                          <FileSearch className="w-3 h-3" /> VIEW KYB
                        </button>
                        {/* KYB verify/reject/suspend (not for platform org) */}
                        {!org.is_platform_org && (
                          <>
                            {vstate !== 'verified' && (
                              <button onClick={() => doAction(org, 'verify')} disabled={acting} title="Verify (KYB approve)"
                                className="inline-flex items-center gap-1 px-2 py-1 font-mono text-[10px] text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 border border-transparent hover:border-green-800 transition-colors disabled:opacity-50">
                                <BadgeCheck className="w-3 h-3" /> VERIFY
                              </button>
                            )}
                            {vstate === 'pending' && (
                              <button onClick={() => doAction(org, 'reject')} disabled={acting} title="Reject KYB submission"
                                className="inline-flex items-center gap-1 px-2 py-1 font-mono text-[10px] text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 border border-transparent hover:border-red-800 transition-colors disabled:opacity-50">
                                <ShieldX className="w-3 h-3" /> REJECT
                              </button>
                            )}
                            {org.is_active ? (
                              <button onClick={() => doAction(org, 'suspend')} disabled={acting} title="Suspend (hide listings)"
                                className="inline-flex items-center gap-1 px-2 py-1 font-mono text-[10px] text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/30 border border-transparent hover:border-orange-800 transition-colors disabled:opacity-50">
                                <Ban className="w-3 h-3" /> SUSPEND
                              </button>
                            ) : (
                              <button onClick={() => doAction(org, 'unsuspend')} disabled={acting} title="Reinstate"
                                className="inline-flex items-center gap-1 px-2 py-1 font-mono text-[10px] text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-transparent hover:border-blue-800 transition-colors disabled:opacity-50">
                                <ShieldCheck className="w-3 h-3" /> REINSTATE
                              </button>
                            )}
                          </>
                        )}
                        {org.subscription_tier !== 'free' && (
                          <button onClick={() => { setActionError(null); setPendingFree(org) }} title="Downgrade to free"
                            className="inline-flex items-center gap-1 px-2 py-1 font-mono text-[10px] text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 border border-transparent hover:border-amber-800 transition-colors">
                            <ArrowDownCircle className="w-3 h-3" /> SET FREE
                          </button>
                        )}
                        <button onClick={() => { setActionError(null); setPendingDelete(org) }} title="Delete organization"
                          className="inline-flex items-center gap-1 px-2 py-1 font-mono text-[10px] text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 border border-transparent hover:border-red-800 transition-colors">
                          <Trash2 className="w-3 h-3" /> DELETE
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── View KYB detail modal ── */}
      {viewingKyb && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setViewingKyb(null)}>
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-card border border-red-900/50 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border sticky top-0 bg-card z-10">
              <div className="flex items-center gap-2">
                <FileSearch className="w-4 h-4 text-sky-500" />
                <div>
                  <h2 className="font-mono text-sm text-foreground font-bold tracking-wide">KYB — {viewingKyb.name}</h2>
                  <p className="font-mono text-[10px] text-muted-foreground">{viewingKyb.slug}</p>
                </div>
              </div>
              <button onClick={() => setViewingKyb(null)} className="p-1 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {kybLoading ? (
                <div className="py-10 text-center font-mono text-sm text-muted-foreground">Loading KYB…</div>
              ) : kybError ? (
                <div className="px-4 py-3 bg-red-100 dark:bg-red-900/20 border border-red-800 font-mono text-xs text-red-600 dark:text-red-400">{kybError}</div>
              ) : kybDetail ? (
                (() => {
                  const s = kybDetail.latest_submission
                  const o = kybDetail.organization
                  const vstate = verificationState(viewingKyb)
                  // Prefer submission fields; fall back to the mirrored org-level identifiers.
                  const rows: { label: string; value: string | null | undefined }[] = [
                    { label: 'Legal / trading name', value: s?.legal_name || o?.name },
                    { label: 'Business registration #', value: s?.business_registration_number || o?.registration_number },
                    { label: 'TIN (GRA)', value: s?.tin_number || o?.tin_number },
                    { label: 'Agency licence (Act 1047)', value: s?.agency_license_number || o?.license_number },
                    { label: 'Licence expiry', value: (s?.license_expiry || o?.license_expiry) ? new Date((s?.license_expiry || o?.license_expiry) as string).toLocaleDateString() : null },
                    { label: 'Registered address', value: s?.registered_address },
                    { label: 'Contact email', value: s?.contact_email },
                    { label: 'Contact phone', value: s?.contact_phone },
                    { label: 'Principal name', value: s?.principal_name },
                    { label: 'Principal Ghana Card', value: s?.principal_ghana_card },
                  ]
                  const hasAny = rows.some((r) => r.value)
                  return (
                    <>
                      {/* Verification + KYC status */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="border border-border p-3 bg-background/50">
                          <div className="font-mono text-[9px] text-muted-foreground uppercase tracking-widest mb-1">Company (Gate A)</div>
                          <span className={`inline-block px-2 py-0.5 font-mono text-[10px] uppercase border ${V_STYLES[vstate]}`}>{vstate}</span>
                          {o?.verified_at && <div className="font-mono text-[10px] text-muted-foreground mt-1.5">Verified {new Date(o.verified_at).toLocaleDateString()}</div>}
                        </div>
                        <div className="border border-border p-3 bg-background/50">
                          <div className="font-mono text-[9px] text-muted-foreground uppercase tracking-widest mb-1 flex items-center gap-1"><Fingerprint className="w-3 h-3" /> Principal KYC (Gate B)</div>
                          {!kybDetail.kyc_configured ? (
                            <span className="font-mono text-[10px] text-muted-foreground">KYC vendor not configured</span>
                          ) : kybDetail.principal_identity_verified ? (
                            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-green-600 dark:text-green-400"><BadgeCheck className="w-3 h-3" /> Identity verified</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-amber-600 dark:text-amber-400"><ShieldX className="w-3 h-3" /> Not yet verified</span>
                          )}
                        </div>
                      </div>

                      {/* No submission empty state */}
                      {!s && (
                        <div className="px-4 py-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-800/40 font-mono text-xs text-amber-700 dark:text-amber-400">
                          No KYB submission on file. {hasAny
                            ? 'Showing the identifiers stored on the organization record.'
                            : 'This organization has not submitted KYB (it was verified directly, or onboarded before KYB). Ask them to complete Settings → Company Verification.'}
                        </div>
                      )}

                      {/* Business details */}
                      {hasAny && (
                        <div className="border border-border divide-y divide-border">
                          {rows.filter((r) => r.value).map((r) => (
                            <div key={r.label} className="flex items-start gap-3 px-3 py-2">
                              <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide w-44 shrink-0 pt-0.5">{r.label}</div>
                              <div className="font-mono text-xs text-foreground break-all">{r.value}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Documents */}
                      {s && s.documents && s.documents.length > 0 && (
                        <div>
                          <div className="font-mono text-[9px] text-muted-foreground uppercase tracking-widest mb-2">Documents ({s.documents.length})</div>
                          <div className="space-y-1.5">
                            {s.documents.map((d, i) => (
                              <a
                                key={i}
                                href={d.url || undefined}
                                target="_blank"
                                rel="noreferrer"
                                className={`flex items-center justify-between gap-2 px-3 py-2 border border-border font-mono text-xs transition-colors ${d.url ? 'text-foreground hover:bg-amber-50 dark:hover:bg-amber-500/10 hover:border-amber-800' : 'text-muted-foreground pointer-events-none opacity-60'}`}
                              >
                                <span className="flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-red-500/70" />{DOC_LABELS[d.type] || d.filename || d.type}</span>
                                {d.url ? <ExternalLink className="w-3.5 h-3.5" /> : <span className="text-[10px]">unavailable</span>}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Review trail */}
                      {s && (s.submitted_at || s.reviewed_at || s.review_notes) && (
                        <div className="font-mono text-[10px] text-muted-foreground space-y-0.5 border-t border-border pt-3">
                          {s.submitted_at && <div>Submitted {new Date(s.submitted_at).toLocaleString()}</div>}
                          {s.reviewed_at && <div>Reviewed {new Date(s.reviewed_at).toLocaleString()}</div>}
                          {s.review_notes && <div>Notes: <span className="text-foreground">{s.review_notes}</span></div>}
                        </div>
                      )}

                      {/* Footer actions — verify/reject from here for convenience */}
                      {!viewingKyb.is_platform_org && vstate !== 'verified' && (
                        <div className="flex items-center gap-2 border-t border-border pt-4">
                          <button
                            onClick={async () => { await doAction(viewingKyb, 'verify'); setViewingKyb(null) }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 font-mono text-[11px] text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 border border-green-800 transition-colors">
                            <BadgeCheck className="w-3.5 h-3.5" /> VERIFY COMPANY
                          </button>
                          {vstate === 'pending' && (
                            <button
                              onClick={async () => { await doAction(viewingKyb, 'reject'); setViewingKyb(null) }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 font-mono text-[11px] text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-800 transition-colors">
                              <ShieldX className="w-3.5 h-3.5" /> REJECT
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )
                })()
              ) : null}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!pendingDelete}
        title="Delete organization"
        message={
          <>
            Permanently delete <span className="text-foreground font-bold">{pendingDelete?.name}</span> and
            <span className="text-foreground"> all {pendingDelete?.user_count} member account(s)</span> (platform + Keycloak),
            plus its subscriptions, invoices, and payments. This cannot be undone.
          </>
        }
        confirmWord={pendingDelete?.name}
        confirmLabel="Delete organization"
        busy={busy}
        error={actionError}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />

      <ConfirmModal
        open={!!pendingFree}
        title="Downgrade to free"
        danger={false}
        message={
          <>
            Cancel <span className="text-foreground font-bold">{pendingFree?.name}</span>&apos;s paid subscription and move it to the
            <span className="text-foreground"> free</span> tier? Member accounts and data are kept — only billing changes.
          </>
        }
        confirmLabel="Set to free"
        busy={busy}
        error={actionError}
        onConfirm={confirmSetFree}
        onClose={() => setPendingFree(null)}
      />
    </div>
  )
}
