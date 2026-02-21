'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Key,
  Plus,
  Copy,
  Check,
  Trash2,
  RotateCcw,
  Shield,
  Clock,
  AlertTriangle,
  Eye,
  EyeOff,
  X,
  Loader2,
  Globe,
  Zap,
  Activity,
} from 'lucide-react'

/* ────────────── Types ────────────── */
interface ApiKey {
  id: string
  name: string
  key_prefix: string
  scopes: string[] | null
  rate_limit_per_minute: number
  rate_limit_per_day: number
  allowed_ips: string[] | null
  is_active: boolean
  usage_count: number
  last_used_at: string | null
  expires_at: string | null
  created_at: string
  created_by_name?: string
}

interface NewKeyResponse extends ApiKey {
  full_key: string
}

/* ────────────── Helpers ────────────── */
function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const d = new Date(dateStr)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString()
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function isExpired(dateStr: string | null): boolean {
  if (!dateStr) return false
  return new Date(dateStr).getTime() < Date.now()
}

/* ────────────── Copy Button ────────────── */
function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [ok, setOk] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setOk(true)
    setTimeout(() => setOk(false), 2000)
  }
  return (
    <button onClick={copy} className={`p-1.5 hover:bg-zinc-700 rounded transition-colors ${className}`} title="Copy">
      {ok ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-500" />}
    </button>
  )
}

/* ────────────── Scope Tags ────────────── */
const AVAILABLE_SCOPES = [
  { id: 'market:read', label: 'Market Data', desc: 'Price index, supply/demand, transactions' },
  { id: 'valuations:read', label: 'Valuations Read', desc: 'Read valuation reports' },
  { id: 'valuations:write', label: 'Valuations Write', desc: 'Create/update valuations' },
  { id: 'properties:read', label: 'Properties Read', desc: 'Read property listings' },
  { id: 'properties:write', label: 'Properties Write', desc: 'Create/update properties' },
  { id: 'analytics:read', label: 'Analytics', desc: 'ML predictions, CCI, HAI' },
  { id: 'construction:read', label: 'Construction', desc: 'Construction cost data' },
  { id: 'ticker:read', label: 'Live Ticker', desc: 'Real-time market ticker' },
]

/* ────────────── Create Key Modal ────────────── */
function CreateKeyModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (key: NewKeyResponse) => void
}) {
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<string[]>([])
  const [rateMin, setRateMin] = useState(1000)
  const [rateDay, setRateDay] = useState(100000)
  const [ips, setIps] = useState('')
  const [expiresIn, setExpiresIn] = useState<string>('90')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const toggleScope = (s: string) =>
    setScopes((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]))

  const submit = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    setSubmitting(true)
    setError('')
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        scopes: scopes.length > 0 ? scopes : null,
        rate_limit_per_minute: rateMin,
        rate_limit_per_day: rateDay,
      }
      if (ips.trim()) body.allowed_ips = ips.split(',').map((s) => s.trim()).filter(Boolean)
      if (expiresIn && expiresIn !== 'never') {
        const d = new Date()
        d.setDate(d.getDate() + parseInt(expiresIn))
        body.expires_at = d.toISOString()
      }

      const res = await fetch('/api/enterprise/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      const key = await res.json()
      onCreated(key)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create key')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-red-500" />
            <h2 className="text-sm font-bold text-white font-mono">CREATE API KEY</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded">
            <X className="w-4 h-4 text-zinc-500" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1.5">Key Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production Backend, Mobile App"
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm text-white placeholder-zinc-600 focus:border-red-600 focus:outline-none"
            />
          </div>

          {/* Scopes */}
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1.5">
              Scopes <span className="text-zinc-600">(leave empty for full access)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_SCOPES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => toggleScope(s.id)}
                  className={`text-left px-3 py-2 rounded border text-xs transition-colors ${
                    scopes.includes(s.id)
                      ? 'bg-red-950/50 border-red-800 text-red-300'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  <p className="font-semibold">{s.label}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">{s.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Rate Limits */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1.5">Rate / Minute</label>
              <input
                type="number"
                value={rateMin}
                onChange={(e) => setRateMin(Number(e.target.value))}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm text-white focus:border-red-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1.5">Rate / Day</label>
              <input
                type="number"
                value={rateDay}
                onChange={(e) => setRateDay(Number(e.target.value))}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm text-white focus:border-red-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Expiration */}
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1.5">Expires In</label>
            <select
              value={expiresIn}
              onChange={(e) => setExpiresIn(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm text-white focus:border-red-600 focus:outline-none"
            >
              <option value="30">30 Days</option>
              <option value="90">90 Days</option>
              <option value="180">180 Days</option>
              <option value="365">1 Year</option>
              <option value="never">Never</option>
            </select>
          </div>

          {/* Allowed IPs */}
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1.5">
              Allowed IPs <span className="text-zinc-600">(comma-separated, optional)</span>
            </label>
            <input
              type="text"
              value={ips}
              onChange={(e) => setIps(e.target.value)}
              placeholder="e.g. 192.168.1.0/24, 10.0.0.1"
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm text-white placeholder-zinc-600 focus:border-red-600 focus:outline-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-950/50 border border-red-800 rounded text-xs text-red-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-zinc-800">
          <button onClick={onClose} className="px-4 py-2 text-xs text-zinc-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="flex items-center gap-2 px-5 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold rounded transition-colors"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Create Key
          </button>
        </div>
      </div>
    </div>
  )
}

/* ────────────── Key Reveal Modal ────────────── */
function KeyRevealModal({
  newKey,
  onClose,
}: {
  newKey: NewKeyResponse | null
  onClose: () => void
}) {
  const [visible, setVisible] = useState(false)

  if (!newKey) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Check className="w-5 h-5 text-green-500" />
            <h2 className="text-sm font-bold text-white font-mono">API KEY CREATED</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded">
            <X className="w-4 h-4 text-zinc-500" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-950/40 border border-amber-800 rounded">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300">
              Copy this key now. You won&apos;t be able to see it again.
            </p>
          </div>

          <div>
            <p className="text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Key Name</p>
            <p className="text-sm text-white font-semibold">{newKey.name}</p>
          </div>

          <div>
            <p className="text-[10px] font-mono text-zinc-500 uppercase mb-1.5">API Key</p>
            <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded px-3 py-2">
              <code className="text-sm font-mono text-green-400 flex-1 select-all break-all">
                {visible ? newKey.full_key : `${newKey.key_prefix}${'•'.repeat(40)}`}
              </code>
              <button onClick={() => setVisible(!visible)} className="p-1 hover:bg-zinc-800 rounded">
                {visible ? <EyeOff className="w-3.5 h-3.5 text-zinc-500" /> : <Eye className="w-3.5 h-3.5 text-zinc-500" />}
              </button>
              <CopyButton text={newKey.full_key} />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end px-5 py-4 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded transition-colors"
          >
            I&apos;ve Copied It
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */
export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [newKey, setNewKey] = useState<NewKeyResponse | null>(null)
  const [error, setError] = useState('')
  const [revoking, setRevoking] = useState<string | null>(null)
  const [rotating, setRotating] = useState<string | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)

  /* ── Load keys ── */
  const loadKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/enterprise/api-keys')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setKeys(Array.isArray(data) ? data : data.keys || data.data || [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load keys')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadKeys() }, [loadKeys])

  /* ── Handle key creation ── */
  const handleCreated = (key: NewKeyResponse) => {
    setCreateOpen(false)
    setNewKey(key)
    loadKeys()
  }

  /* ── Revoke ── */
  const handleRevoke = async (id: string) => {
    setRevoking(id)
    try {
      const res = await fetch(`/api/enterprise/api-keys/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to revoke')
      loadKeys()
    } catch {
      setError('Failed to revoke key')
    } finally {
      setRevoking(null)
      setConfirmRevoke(null)
    }
  }

  /* ── Rotate ── */
  const handleRotate = async (id: string) => {
    setRotating(id)
    try {
      const res = await fetch(`/api/enterprise/api-keys/${id}/rotate`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to rotate')
      const rotated = await res.json()
      setNewKey(rotated)
      loadKeys()
    } catch {
      setError('Failed to rotate key')
    } finally {
      setRotating(null)
    }
  }

  const activeKeys = keys.filter((k) => k.is_active)
  const revokedKeys = keys.filter((k) => !k.is_active)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Key className="w-6 h-6 text-red-500" />
            <h1 className="text-xl font-bold text-white font-mono">API KEYS</h1>
          </div>
          <p className="text-xs text-zinc-500 mt-1 ml-9">
            Manage programmatic access to the PROPMETRIK API
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> New API Key
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Key, label: 'Active Keys', value: String(activeKeys.length), color: 'text-green-400' },
          { icon: Activity, label: 'Total Requests', value: keys.reduce((s, k) => s + (k.usage_count || 0), 0).toLocaleString(), color: 'text-cyan-400' },
          { icon: Shield, label: 'IP Restricted', value: String(activeKeys.filter(k => k.allowed_ips && k.allowed_ips.length > 0).length), color: 'text-amber-400' },
          { icon: Clock, label: 'Expiring Soon', value: String(activeKeys.filter(k => {
            if (!k.expires_at) return false
            const d = new Date(k.expires_at).getTime() - Date.now()
            return d > 0 && d < 7 * 86400000
          }).length), color: 'text-red-400' },
        ].map((c) => (
          <div key={c.label} className="bg-zinc-900 border border-zinc-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <c.icon className={`w-4 h-4 ${c.color}`} />
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">{c.label}</span>
            </div>
            <p className={`text-lg font-bold font-mono ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-950/50 border border-red-800 rounded">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-xs text-red-400 flex-1">{error}</p>
          <button onClick={() => setError('')} className="p-1 hover:bg-red-900 rounded">
            <X className="w-3.5 h-3.5 text-red-400" />
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-16">
          <Loader2 className="w-8 h-8 text-zinc-600 animate-spin mx-auto mb-3" />
          <p className="text-xs text-zinc-500 font-mono">Loading API keys...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && keys.length === 0 && (
        <div className="text-center py-16 bg-zinc-900 border border-zinc-800 rounded">
          <Key className="w-10 h-10 text-zinc-700 mx-auto mb-4" />
          <h3 className="text-sm font-bold text-white mb-1">No API Keys</h3>
          <p className="text-xs text-zinc-500 mb-6">Create your first API key to start using the PROPMETRIK API.</p>
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Create API Key
          </button>
        </div>
      )}

      {/* Active keys */}
      {!loading && activeKeys.length > 0 && (
        <div>
          <h2 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-3">
            Active Keys ({activeKeys.length})
          </h2>
          <div className="space-y-3">
            {activeKeys.map((k) => {
              const expired = isExpired(k.expires_at)
              return (
                <div
                  key={k.id}
                  className={`bg-zinc-900 border rounded p-4 ${
                    expired ? 'border-amber-800/60' : 'border-zinc-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-bold text-white truncate">{k.name}</h3>
                        {expired && (
                          <span className="px-2 py-0.5 text-[9px] font-mono bg-amber-900/40 text-amber-400 border border-amber-700 rounded">
                            EXPIRED
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono text-zinc-400">{k.key_prefix}••••••••</code>
                        <CopyButton text={k.key_prefix} />
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleRotate(k.id)}
                        disabled={rotating === k.id}
                        className="p-2 hover:bg-zinc-800 rounded transition-colors group"
                        title="Rotate key"
                      >
                        {rotating === k.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400" />
                        )}
                      </button>
                      {confirmRevoke === k.id ? (
                        <div className="flex items-center gap-1 bg-red-950/50 border border-red-800 rounded px-2 py-1">
                          <span className="text-[10px] text-red-400 mr-1">Revoke?</span>
                          <button
                            onClick={() => handleRevoke(k.id)}
                            disabled={revoking === k.id}
                            className="px-2 py-0.5 bg-red-600 hover:bg-red-500 text-white text-[10px] rounded"
                          >
                            {revoking === k.id ? '...' : 'Yes'}
                          </button>
                          <button
                            onClick={() => setConfirmRevoke(null)}
                            className="px-2 py-0.5 text-zinc-400 hover:text-white text-[10px]"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmRevoke(k.id)}
                          className="p-2 hover:bg-zinc-800 rounded transition-colors group"
                          title="Revoke key"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-zinc-500 group-hover:text-red-400" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Details grid */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 pt-3 border-t border-zinc-800/50">
                    <div>
                      <p className="text-[10px] font-mono text-zinc-600 uppercase">Requests</p>
                      <p className="text-sm font-mono text-white">{(k.usage_count || 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-mono text-zinc-600 uppercase">Last Used</p>
                      <p className="text-sm font-mono text-white">{timeAgo(k.last_used_at)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-mono text-zinc-600 uppercase">Rate Limit</p>
                      <p className="text-sm font-mono text-white">{k.rate_limit_per_minute}/min</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-mono text-zinc-600 uppercase">Expires</p>
                      <p className={`text-sm font-mono ${expired ? 'text-amber-400' : 'text-white'}`}>
                        {k.expires_at ? formatDate(k.expires_at) : 'Never'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-mono text-zinc-600 uppercase">Created</p>
                      <p className="text-sm font-mono text-white">{formatDate(k.created_at)}</p>
                    </div>
                  </div>

                  {/* Scopes */}
                  {k.scopes && k.scopes.length > 0 && (
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <Globe className="w-3 h-3 text-zinc-600" />
                      {k.scopes.map((s) => (
                        <span key={s} className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[9px] font-mono text-zinc-400">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* IP restrictions */}
                  {k.allowed_ips && k.allowed_ips.length > 0 && (
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <Shield className="w-3 h-3 text-zinc-600" />
                      {k.allowed_ips.map((ip) => (
                        <span key={ip} className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[9px] font-mono text-zinc-400">
                          {ip}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Revoked keys */}
      {!loading && revokedKeys.length > 0 && (
        <div>
          <h2 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-3">
            Revoked Keys ({revokedKeys.length})
          </h2>
          <div className="space-y-2">
            {revokedKeys.map((k) => (
              <div key={k.id} className="bg-zinc-900/50 border border-zinc-800/50 rounded p-3 opacity-60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 text-[9px] font-mono bg-red-900/30 text-red-400 border border-red-800/50 rounded">
                      REVOKED
                    </span>
                    <span className="text-xs text-zinc-500">{k.name}</span>
                    <code className="text-[10px] font-mono text-zinc-600">{k.key_prefix}••••</code>
                  </div>
                  <span className="text-[10px] text-zinc-600">{formatDate(k.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick-start guide */}
      <div className="bg-zinc-900 border border-zinc-800 rounded p-5">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-cyan-500" />
          <h2 className="text-sm font-bold text-white font-mono">QUICK START</h2>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded px-4 py-3">
          <pre className="text-[11px] font-mono text-zinc-400 overflow-x-auto whitespace-pre">
{`curl -s \\
  -H "Authorization: Bearer pmk_your_api_key" \\
  https://api.propmetrik.com/v1/analytics/market/price-index \\
  | jq .`}
          </pre>
        </div>
        <div className="flex items-center gap-4 mt-3">
          <a
            href="/api"
            className="text-xs text-red-400 hover:text-red-300 underline transition-colors"
          >
            View API Documentation →
          </a>
          <a
            href="/dashboard/admin/api-docs"
            className="text-xs text-zinc-400 hover:text-zinc-300 underline transition-colors"
          >
            Internal API Reference →
          </a>
        </div>
      </div>

      {/* Modals */}
      <CreateKeyModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
      <KeyRevealModal
        newKey={newKey}
        onClose={() => setNewKey(null)}
      />
    </div>
  )
}
