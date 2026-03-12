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
        </div>
      </div>
    </div>
  )
}