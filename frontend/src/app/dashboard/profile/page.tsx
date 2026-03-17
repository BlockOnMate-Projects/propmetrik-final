'use client'

import { cn } from '@/lib/utils'
import { authedFetch } from '@/lib/authed-fetch'
import { useState, useEffect, useCallback } from 'react'

// ════════════════════════════════════════════════════════════════════
//  Types
// ════════════════════════════════════════════════════════════════════
interface UserProfile {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  displayName: string | null
  phone: string | null
  avatarUrl: string | null
  role: string
  status: string
  emailVerified: boolean
  phoneVerified: boolean
  preferredRegion: string | null
  subscriptionTier: string
  subscriptionExpiresAt: string | null
  lastLoginAt: string | null
  loginCount: number
  createdAt: string
  updatedAt: string
  organization: { id: string; name: string; type: string; slug: string } | null
}

interface NotifPreferences {
  email: boolean
  push: boolean
  sms: boolean
  whatsapp: boolean
  inboxEnabled: boolean
  emailDigest: boolean
  emailDigestFrequency: string
}

interface ValuerProfile {
  id: string
  user_id: string | null
  name: string
  title: string | null
  qualifications: string | null
  license_number: string | null
  license_issuer: string | null
  license_valid_until: string | null
  license_status: string | null
  pi_provider: string | null
  pi_policy_number: string | null
  pi_coverage: string | null
  pi_valid_until: string | null
  contact_address: string | null
  contact_email: string | null
  contact_phone: string | null
  company_name: string | null
  specializations: string[] | null
  regions_covered: string[] | null
  memberships: { organization: string; number: string; grade: string }[] | null
}

interface UserStats {
  valuations: number
  dealsClosed: number
  properties: number
}

// ════════════════════════════════════════════════════════════════════
//  Panel component
// ════════════════════════════════════════════════════════════════════
function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('border border-zinc-800 bg-zinc-900/50', className)}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-800">
        <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
//  Status / feedback messages
// ════════════════════════════════════════════════════════════════════
function StatusMsg({ msg, type }: { msg: string; type: 'success' | 'error' }) {
  if (!msg) return null
  return (
    <div className={cn(
      'px-3 py-2 font-mono text-xs border mb-3',
      type === 'success' ? 'bg-green-900/30 border-green-800 text-green-400' : 'bg-red-900/30 border-red-800 text-red-400'
    )}>
      {msg}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
//  Main Page
// ════════════════════════════════════════════════════════════════════
export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState('profile')

  // ── State ──
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [stats, setStats] = useState<UserStats>({ valuations: 0, dealsClosed: 0, properties: 0 })
  const [notifPrefs, setNotifPrefs] = useState<NotifPreferences>({
    email: true, push: true, sms: false, whatsapp: false,
    inboxEnabled: true, emailDigest: true, emailDigestFrequency: 'daily',
  })
  const [loading, setLoading] = useState(true)

  // Profile form state
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [profileMsg, setProfileMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [saving, setSaving] = useState(false)

  // Password form state
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwMsg, setPwMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [pwSaving, setPwSaving] = useState(false)

  // Notification save state
  const [notifMsg, setNotifMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  // Valuer professional details state
  const [valuer, setValuer] = useState<ValuerProfile | null>(null)
  const [valuerForm, setValuerForm] = useState({
    name: '', title: '', qualifications: '',
    license_number: '', license_issuer: '', license_valid_until: '',
    pi_provider: '', pi_policy_number: '', pi_coverage: '', pi_valid_until: '',
    contact_address: '', contact_email: '', contact_phone: '', company_name: '',
  })
  const [valuerMsg, setValuerMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [valuerSaving, setValuerSaving] = useState(false)
  const [hasValuationService, setHasValuationService] = useState(false)

  // ── Fetch data ──
  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [profRes, statsRes, notifRes] = await Promise.all([
        authedFetch('/api/user/profile').then(r => r.json()).catch(() => null),
        authedFetch('/api/user/stats').then(r => r.json()).catch(() => null),
        authedFetch('/api/user/notification-preferences').then(r => r.json()).catch(() => null),
      ])

      if (profRes?.success) {
        setProfile(profRes.profile)
        setFirstName(profRes.profile.firstName || '')
        setLastName(profRes.profile.lastName || '')
        setPhone(profRes.profile.phone || '')

        // Check if user has valuation service access
        const isValuationRole = ['valuer', 'admin', 'super_admin'].includes(profRes.profile.role)
        setHasValuationService(isValuationRole)

        // Fetch valuer profile if applicable
        if (isValuationRole && profRes.profile.id) {
          try {
            const valuerRes = await authedFetch(`/api/valuers/user/${profRes.profile.id}`).then(r => r.json()).catch(() => null)
            if (valuerRes && valuerRes.id) {
              setValuer(valuerRes)
              setValuerForm({
                name: valuerRes.name || '',
                title: valuerRes.title || '',
                qualifications: valuerRes.qualifications || '',
                license_number: valuerRes.license_number || '',
                license_issuer: valuerRes.license_issuer || '',
                license_valid_until: valuerRes.license_valid_until ? valuerRes.license_valid_until.split('T')[0] : '',
                pi_provider: valuerRes.pi_provider || '',
                pi_policy_number: valuerRes.pi_policy_number || '',
                pi_coverage: valuerRes.pi_coverage || '',
                pi_valid_until: valuerRes.pi_valid_until ? valuerRes.pi_valid_until.split('T')[0] : '',
                contact_address: valuerRes.contact_address || '',
                contact_email: valuerRes.contact_email || '',
                contact_phone: valuerRes.contact_phone || '',
                company_name: valuerRes.company_name || '',
              })
            } else {
              // Pre-fill from user profile so the form isn't blank
              setValuerForm(prev => ({
                ...prev,
                name: `${profRes.profile.firstName || ''} ${profRes.profile.lastName || ''}`.trim(),
                contact_email: profRes.profile.email || '',
                contact_phone: profRes.profile.phone || '',
                company_name: profRes.profile.organization?.name || '',
              }))
            }
          } catch { /* no valuer record yet */ }
        }
      }
      if (statsRes?.success) setStats(statsRes.stats)
      if (notifRes?.success) setNotifPrefs(notifRes.preferences)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Handlers ──
  const saveProfile = async () => {
    setSaving(true)
    setProfileMsg(null)
    try {
      const res = await authedFetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, phone }),
      })
      const data = await res.json()
      if (data.success) {
        setProfileMsg({ text: 'Profile updated successfully', type: 'success' })
        fetchAll()
      } else {
        setProfileMsg({ text: data.message || 'Failed to update profile', type: 'error' })
      }
    } catch {
      setProfileMsg({ text: 'Network error', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const changePassword = async () => {
    setPwMsg(null)
    if (!currentPw) return setPwMsg({ text: 'Enter your current password', type: 'error' })
    if (newPw.length < 8) return setPwMsg({ text: 'New password must be at least 8 characters', type: 'error' })
    if (newPw !== confirmPw) return setPwMsg({ text: 'Passwords do not match', type: 'error' })

    setPwSaving(true)
    try {
      const res = await authedFetch('/api/user/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      })
      const data = await res.json()
      if (data.success) {
        setPwMsg({ text: 'Password updated successfully', type: 'success' })
        setCurrentPw('')
        setNewPw('')
        setConfirmPw('')
      } else {
        setPwMsg({ text: data.message || 'Failed to change password', type: 'error' })
      }
    } catch {
      setPwMsg({ text: 'Network error', type: 'error' })
    } finally {
      setPwSaving(false)
    }
  }

  const saveValuerProfile = async () => {
    setValuerSaving(true)
    setValuerMsg(null)
    try {
      if (!valuerForm.name.trim()) {
        setValuerMsg({ text: 'Name is required', type: 'error' })
        setValuerSaving(false)
        return
      }

      if (valuer?.id) {
        // Update existing valuer
        const res = await authedFetch(`/api/valuers/${valuer.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(valuerForm),
        })
        const data = await res.json()
        if (res.ok) {
          setValuer(data)
          setValuerMsg({ text: 'Professional details updated', type: 'success' })
        } else {
          setValuerMsg({ text: data.message || 'Failed to update', type: 'error' })
        }
      } else {
        // Create new valuer record
        const res = await authedFetch('/api/valuers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...valuerForm, user_id: profile?.id }),
        })
        const data = await res.json()
        if (res.ok) {
          setValuer(data)
          setValuerMsg({ text: 'Professional details saved', type: 'success' })
        } else {
          const details = data.details ? `\n${data.details.join(', ')}` : ''
          setValuerMsg({ text: (data.message || 'Failed to save') + details, type: 'error' })
        }
      }
    } catch {
      setValuerMsg({ text: 'Network error', type: 'error' })
    } finally {
      setValuerSaving(false)
    }
  }

  const updateValuerField = (field: string, value: string) => {
    setValuerForm(prev => ({ ...prev, [field]: value }))
  }

  const toggleNotif = async (key: keyof NotifPreferences) => {
    const updated = { ...notifPrefs, [key]: !notifPrefs[key] }
    setNotifPrefs(updated)
    setNotifMsg(null)
    try {
      const res = await authedFetch('/api/user/notification-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      })
      const data = await res.json()
      if (data.success) {
        setNotifMsg({ text: 'Preferences saved', type: 'success' })
      }
    } catch {
      setNotifMsg({ text: 'Failed to save', type: 'error' })
    }
  }

  // ── Helpers ──
  const formatDate = (d: string | null) => {
    if (!d) return '—'
    const date = new Date(d)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    if (isToday) return `TODAY ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()
  }

  const roleName = (r: string) => {
    const map: Record<string, string> = {
      super_admin: 'Super Admin', admin: 'Administrator', valuer: 'Valuer',
      analyst: 'Analyst', agent: 'Agent', viewer: 'Viewer',
    }
    return map[r] || r
  }

  const tierLabel = (t: string) => (t || 'free').charAt(0).toUpperCase() + (t || 'free').slice(1)

  // Notification items driven by real preference keys
  const notifItems: { key: keyof NotifPreferences; label: string; desc: string }[] = [
    { key: 'email', label: 'Email Notifications', desc: 'Valuation completions, deal updates, weekly reports' },
    { key: 'push', label: 'Push Notifications', desc: 'Real-time browser alerts for urgent items' },
    { key: 'sms', label: 'SMS Alerts', desc: 'Critical notifications via text message' },
    { key: 'whatsapp', label: 'WhatsApp Alerts', desc: 'Notifications via WhatsApp messaging' },
    { key: 'emailDigest', label: 'Daily Email Digest', desc: 'Summary of activity delivered each morning' },
    { key: 'inboxEnabled', label: 'In-App Inbox', desc: 'Show notification bell and inbox panel' },
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-4 flex items-center justify-center">
        <div className="font-mono text-xs text-zinc-500 animate-pulse">LOADING PROFILE...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 pb-10">
      {/* Header */}
      <div className="mb-4">
        <h1 className="font-mono text-xl text-white">USER SETTINGS</h1>
        <p className="font-mono text-[10px] text-zinc-500">Account Configuration & Preferences</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto">
        {[
          { id: 'profile', label: 'PROFILE' },
          ...(hasValuationService ? [{ id: 'professional', label: 'PROFESSIONAL' }] : []),
          { id: 'security', label: 'SECURITY' },
          { id: 'notifications', label: 'NOTIFICATIONS' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-2 font-mono text-xs transition-colors',
              activeTab === tab.id
                ? 'bg-amber-500 text-white font-bold'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* ═══ Main Content ═══ */}
        <div className="lg:col-span-8">

          {/* ─── Profile Tab ─── */}
          {activeTab === 'profile' && (
            <Panel title="PROFILE INFORMATION">
              {profileMsg && <StatusMsg msg={profileMsg.text} type={profileMsg.type} />}
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-mono text-[10px] text-zinc-500 mb-1">FIRST NAME</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] text-zinc-500 mb-1">LAST NAME</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-mono text-[10px] text-zinc-500 mb-1">EMAIL</label>
                    <input
                      type="email"
                      value={profile?.email || ''}
                      disabled
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 font-mono text-sm text-zinc-400"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] text-zinc-500 mb-1">ROLE</label>
                    <input
                      type="text"
                      value={roleName(profile?.role || '')}
                      disabled
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 font-mono text-sm text-zinc-400"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-mono text-[10px] text-zinc-500 mb-1">ORGANIZATION</label>
                    <input
                      type="text"
                      value={profile?.organization?.name || '—'}
                      disabled
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 font-mono text-sm text-zinc-400"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] text-zinc-500 mb-1">PHONE</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+233 XX XXX XXXX"
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="pt-4 border-t border-zinc-800">
                  <button
                    onClick={saveProfile}
                    disabled={saving}
                    className="px-4 py-2 bg-amber-500 text-white font-mono text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
                  >
                    {saving ? 'SAVING...' : 'SAVE CHANGES'}
                  </button>
                </div>
              </div>
            </Panel>
          )}

          {/* ─── Professional Tab (Valuation Service) ─── */}
          {activeTab === 'professional' && hasValuationService && (
            <div className="space-y-4">
              <Panel title="PROFESSIONAL CREDENTIALS">
                {valuerMsg && <StatusMsg msg={valuerMsg.text} type={valuerMsg.type} />}
                {!valuer && (
                  <div className="mb-3 px-3 py-2 bg-amber-900/20 border border-amber-800 font-mono text-xs text-amber-400">
                    No professional profile found. Complete the form below to create your valuer profile.
                  </div>
                )}
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-mono text-[10px] text-zinc-500 mb-1">FULL NAME *</label>
                      <input type="text" value={valuerForm.name} onChange={e => updateValuerField('name', e.target.value)}
                        placeholder="e.g. Eric Danso"
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block font-mono text-[10px] text-zinc-500 mb-1">PROFESSIONAL TITLE</label>
                      <input type="text" value={valuerForm.title} onChange={e => updateValuerField('title', e.target.value)}
                        placeholder="e.g. Surveyor, Estate Valuer"
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] text-zinc-500 mb-1">QUALIFICATIONS</label>
                    <input type="text" value={valuerForm.qualifications} onChange={e => updateValuerField('qualifications', e.target.value)}
                      placeholder="e.g. BSc Land Economy, MGIPC"
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] text-zinc-500 mb-1">COMPANY / FIRM NAME</label>
                    <input type="text" value={valuerForm.company_name} onChange={e => updateValuerField('company_name', e.target.value)}
                      placeholder="e.g. Cedyn Valuations Ltd"
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none" />
                  </div>
                </div>
              </Panel>

              <Panel title="LICENSE & REGISTRATION">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-mono text-[10px] text-zinc-500 mb-1">LICENSE NUMBER *</label>
                      <input type="text" value={valuerForm.license_number} onChange={e => updateValuerField('license_number', e.target.value)}
                        placeholder="e.g. GhIS/LV/2024/001"
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block font-mono text-[10px] text-zinc-500 mb-1">LICENSE ISSUER</label>
                      <input type="text" value={valuerForm.license_issuer} onChange={e => updateValuerField('license_issuer', e.target.value)}
                        placeholder="e.g. GhIS, RICS"
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] text-zinc-500 mb-1">LICENSE VALID UNTIL *</label>
                    <input type="date" value={valuerForm.license_valid_until} onChange={e => updateValuerField('license_valid_until', e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none" />
                  </div>
                </div>
              </Panel>

              <Panel title="PROFESSIONAL INDEMNITY INSURANCE">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-mono text-[10px] text-zinc-500 mb-1">PI PROVIDER</label>
                      <input type="text" value={valuerForm.pi_provider} onChange={e => updateValuerField('pi_provider', e.target.value)}
                        placeholder="e.g. SIC Insurance"
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block font-mono text-[10px] text-zinc-500 mb-1">POLICY NUMBER</label>
                      <input type="text" value={valuerForm.pi_policy_number} onChange={e => updateValuerField('pi_policy_number', e.target.value)}
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-mono text-[10px] text-zinc-500 mb-1">COVERAGE AMOUNT</label>
                      <input type="text" value={valuerForm.pi_coverage} onChange={e => updateValuerField('pi_coverage', e.target.value)}
                        placeholder="e.g. GHS 500,000"
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block font-mono text-[10px] text-zinc-500 mb-1">PI VALID UNTIL</label>
                      <input type="date" value={valuerForm.pi_valid_until} onChange={e => updateValuerField('pi_valid_until', e.target.value)}
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none" />
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel title="CONTACT DETAILS">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-mono text-[10px] text-zinc-500 mb-1">CONTACT EMAIL *</label>
                      <input type="email" value={valuerForm.contact_email} onChange={e => updateValuerField('contact_email', e.target.value)}
                        placeholder="valuer@example.com"
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block font-mono text-[10px] text-zinc-500 mb-1">CONTACT PHONE</label>
                      <input type="tel" value={valuerForm.contact_phone} onChange={e => updateValuerField('contact_phone', e.target.value)}
                        placeholder="+233 XX XXX XXXX"
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] text-zinc-500 mb-1">OFFICE ADDRESS</label>
                    <input type="text" value={valuerForm.contact_address} onChange={e => updateValuerField('contact_address', e.target.value)}
                      placeholder="e.g. 14 Independence Ave, Accra"
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none" />
                  </div>
                </div>
              </Panel>

              <div className="flex items-center gap-3">
                <button onClick={saveValuerProfile} disabled={valuerSaving}
                  className="px-4 py-2 bg-amber-500 text-white font-mono text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-50">
                  {valuerSaving ? 'SAVING...' : valuer ? 'UPDATE PROFESSIONAL DETAILS' : 'CREATE PROFESSIONAL PROFILE'}
                </button>
                <span className="font-mono text-[10px] text-zinc-600">* Required for report signing</span>
              </div>
            </div>
          )}

          {/* ─── Security Tab ─── */}
          {activeTab === 'security' && (
            <Panel title="SECURITY SETTINGS">
              {pwMsg && <StatusMsg msg={pwMsg.text} type={pwMsg.type} />}
              <div className="space-y-4">
                <div>
                  <label className="block font-mono text-[10px] text-zinc-500 mb-1">CURRENT PASSWORD</label>
                  <input
                    type="password"
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-mono text-[10px] text-zinc-500 mb-1">NEW PASSWORD</label>
                    <input
                      type="password"
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] text-zinc-500 mb-1">CONFIRM PASSWORD</label>
                    <input
                      type="password"
                      value={confirmPw}
                      onChange={(e) => setConfirmPw(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="pt-4 border-t border-zinc-800 flex items-center gap-3">
                  <button
                    onClick={changePassword}
                    disabled={pwSaving}
                    className="px-4 py-2 bg-amber-500 text-white font-mono text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
                  >
                    {pwSaving ? 'UPDATING...' : 'UPDATE PASSWORD'}
                  </button>
                  <span className="font-mono text-[10px] text-zinc-600">Minimum 8 characters</span>
                </div>
              </div>
            </Panel>
          )}

          {/* ─── Notifications Tab ─── */}
          {activeTab === 'notifications' && (
            <Panel title="NOTIFICATION PREFERENCES">
              {notifMsg && <StatusMsg msg={notifMsg.text} type={notifMsg.type} />}
              <div className="space-y-3">
                {notifItems.map((item) => (
                  <div key={item.key} className="flex items-center justify-between py-2 border-b border-zinc-800/50">
                    <div>
                      <div className="font-mono text-sm text-white">{item.label}</div>
                      <div className="font-mono text-[10px] text-zinc-500">{item.desc}</div>
                    </div>
                    <button
                      onClick={() => toggleNotif(item.key)}
                      className={cn(
                        'px-3 py-1 font-mono text-[10px] transition-colors',
                        notifPrefs[item.key]
                          ? 'bg-green-900/50 text-green-400 border border-green-800'
                          : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                      )}
                    >
                      {notifPrefs[item.key] ? 'ON' : 'OFF'}
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>

        {/* ═══ Sidebar ═══ */}
        <div className="lg:col-span-4 space-y-4">
          <Panel title="ACCOUNT STATUS">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-zinc-500">PLAN</span>
                <span className="font-mono text-xs text-amber-400">{tierLabel(profile?.subscriptionTier || 'free').toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-zinc-500">STATUS</span>
                <span className={cn(
                  'font-mono text-xs',
                  profile?.status === 'active' ? 'text-green-400' : 'text-red-400'
                )}>
                  {(profile?.status || 'active').toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-zinc-500">MEMBER SINCE</span>
                <span className="font-mono text-xs text-white">{formatDate(profile?.createdAt || null)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-zinc-500">LAST LOGIN</span>
                <span className="font-mono text-xs text-white">{formatDate(profile?.lastLoginAt || null)}</span>
              </div>
              {profile?.emailVerified && (
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] text-zinc-500">EMAIL</span>
                  <span className="font-mono text-xs text-green-400">VERIFIED</span>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="QUICK STATS">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-zinc-500">VALUATIONS</span>
                <span className="font-mono text-xs text-white">{stats.valuations.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-zinc-500">DEALS CLOSED</span>
                <span className="font-mono text-xs text-white">{stats.dealsClosed.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-zinc-500">PROPERTIES</span>
                <span className="font-mono text-xs text-white">{stats.properties.toLocaleString()}</span>
              </div>
            </div>
          </Panel>

          {profile?.organization && (
            <Panel title="ORGANIZATION">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] text-zinc-500">NAME</span>
                  <span className="font-mono text-xs text-white">{profile.organization.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] text-zinc-500">TYPE</span>
                  <span className="font-mono text-xs text-amber-400">{profile.organization.type.toUpperCase()}</span>
                </div>
              </div>
            </Panel>
          )}

          {hasValuationService && activeTab === 'professional' && (
            <Panel title="CREDENTIAL STATUS">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] text-zinc-500">PROFILE</span>
                  <span className={cn('font-mono text-xs', valuer ? 'text-green-400' : 'text-red-400')}>
                    {valuer ? 'CREATED' : 'MISSING'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] text-zinc-500">LICENSE</span>
                  <span className={cn('font-mono text-xs', valuer?.license_number ? 'text-green-400' : 'text-red-400')}>
                    {valuer?.license_number || 'NOT SET'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] text-zinc-500">LICENSE STATUS</span>
                  <span className={cn('font-mono text-xs',
                    valuer?.license_valid_until && new Date(valuer.license_valid_until) > new Date() ? 'text-green-400' : 'text-amber-400'
                  )}>
                    {valuer?.license_valid_until
                      ? new Date(valuer.license_valid_until) > new Date() ? 'VALID' : 'EXPIRED'
                      : 'UNKNOWN'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] text-zinc-500">PI INSURANCE</span>
                  <span className={cn('font-mono text-xs', valuer?.pi_provider ? 'text-green-400' : 'text-zinc-600')}>
                    {valuer?.pi_provider ? 'ACTIVE' : 'NOT SET'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] text-zinc-500">E-SIGN READY</span>
                  <span className={cn('font-mono text-xs',
                    valuer?.license_number && valuer?.contact_email ? 'text-green-400' : 'text-red-400'
                  )}>
                    {valuer?.license_number && valuer?.contact_email ? 'YES' : 'NO'}
                  </span>
                </div>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}