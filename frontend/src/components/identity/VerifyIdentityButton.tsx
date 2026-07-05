'use client'

/**
 * Verify a tenant or CRM contact's identity via Didit (Phase 2 extension).
 * "Send verification link" emails the person a secure Didit Ghana-Card + liveness check;
 * status updates when they finish. Reusable across tenant applications and CRM contacts.
 */

import { useEffect, useState, useCallback } from 'react'
import { BadgeCheck, Clock, ShieldX, UserCheck, Loader2, Send, CheckCircle2 } from 'lucide-react'
import { authedFetch } from '@/lib/authed-fetch'

interface Props {
  subjectType: 'tenant' | 'contact' | 'applicant'
  subjectId: string
  /** Called with true once the subject is verified (e.g. to unblock an action). */
  onStatus?: (verified: boolean) => void
  compact?: boolean
}

type S = 'unverified' | 'pending' | 'in_progress' | 'verified' | 'declined' | 'expired' | 'error' | 'abandoned'

const UI: Partial<Record<S, { label: string; cls: string; icon: React.ReactNode }>> = {
  verified: { label: 'Identity verified', cls: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30', icon: <BadgeCheck className="w-3.5 h-3.5" /> },
  in_progress: { label: 'Verification in progress', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30', icon: <Clock className="w-3.5 h-3.5" /> },
  pending: { label: 'Awaiting verification', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30', icon: <Clock className="w-3.5 h-3.5" /> },
  declined: { label: 'Verification declined', cls: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30', icon: <ShieldX className="w-3.5 h-3.5" /> },
}

export function VerifyIdentityButton({ subjectType, subjectId, onStatus, compact }: Props) {
  const [status, setStatus] = useState<S>('unverified')
  const [configured, setConfigured] = useState(true)
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await authedFetch(`/api/identity/subject-status?subject_type=${subjectType}&subject_id=${encodeURIComponent(subjectId)}`)
      if (res.ok) {
        const { data } = await res.json()
        setConfigured(!!data?.configured)
        const st = (data?.status as S) || 'unverified'
        setStatus(st)
        onStatus?.(st === 'verified')
      }
    } catch { /* ignore */ }
  }, [subjectType, subjectId, onStatus])

  useEffect(() => { if (subjectId) load() }, [load, subjectId])

  const sendLink = async () => {
    setSending(true); setMsg(null)
    try {
      const res = await authedFetch('/api/identity/verify/subject', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject_type: subjectType, subject_id: subjectId }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok) { setSentTo(j.data?.sent_to || 'them'); await load() }
      else setMsg(j.error || 'Could not send verification link')
    } catch { setMsg('Could not send verification link') } finally { setSending(false) }
  }

  const ui = UI[status]

  return (
    <div className={compact ? 'inline-flex items-center gap-2 flex-wrap' : 'flex items-center gap-3 flex-wrap'}>
      {ui ? (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${ui.cls}`}>{ui.icon}{ui.label}</span>
      ) : (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-muted text-muted-foreground border-border"><ShieldX className="w-3.5 h-3.5" />Not verified</span>
      )}

      {status !== 'verified' && (
        configured ? (
          <button onClick={sendLink} disabled={sending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50">
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {status === 'in_progress' || status === 'pending' ? 'Resend link' : 'Verify identity'}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">KYC not configured yet</span>
        )
      )}

      {sentTo && (
        <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400"><CheckCircle2 className="w-3.5 h-3.5" /> Link sent to {sentTo}</span>
      )}
      {msg && <span className="text-xs text-red-600 dark:text-red-400">{msg}</span>}
    </div>
  )
}

export default VerifyIdentityButton
