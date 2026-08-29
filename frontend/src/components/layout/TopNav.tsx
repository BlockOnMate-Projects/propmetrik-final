'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useTheme } from 'next-themes'
import { useEffect, useState, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { filterPlatformNavigation, isAdminRole, isPlatformTabLocked } from '@/lib/rbac'
import { useUpgradeGate } from '@/components/UpgradeGate'
import { NotificationDropdown } from '@/components/layout/NotificationDropdown'
import { authedFetch } from '@/lib/authed-fetch'

const navigation: { name: string; href: string; key: string; fKey: string; tabKey: string; badge?: string; adminOnly?: boolean; staffOnly?: boolean }[] = [
  { name: 'OVERVIEW', href: '/dashboard', key: 'F1', fKey: 'F1', tabKey: 'overview' },
  { name: 'VALUATIONS', href: '/dashboard/valuations', key: 'F2', fKey: 'F2', tabKey: 'valuations' },
  { name: 'DEALS', href: '/dashboard/deals', key: 'F3', fKey: 'F3', tabKey: 'deals' },
  { name: 'PROJECTS', href: '/dashboard/projects', key: 'F4', fKey: 'F4', tabKey: 'projects' },
  // Analytics UI is a platform-staff tool; subscribers consume analytics via the API only.
  { name: 'ANALYTICS', href: '/dashboard/analytics', key: 'F5', fKey: 'F5', tabKey: 'analytics', staffOnly: true },
  { name: 'MANAGEMENT', href: '/dashboard/property-management', key: 'F6', fKey: 'F6', tabKey: 'property-management' },
  // E-SIGN removed as a standalone shared-service surface — signing is initiated in-context
  // from each domain (lease, valuation, project, deal). The /dashboard/e-sign/* pages remain
  // (the lease flow routes into the envelope designer) but are staff-gated via their layout,
  // and external signers use the public /sign/[token] link.
  { name: 'ADMIN', href: '/dashboard/admin', key: 'F8', fKey: 'F8', tabKey: 'admin', badge: 'ADMIN', adminOnly: true },
]

function Clock() {
  const [mounted, setMounted] = useState(false)
  const [time, setTime] = useState<string>('')
  const [date, setDate] = useState<string>('')

  useEffect(() => {
    setMounted(true)
    const updateTime = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString('en-US', { hour12: false }))
      setDate(now.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' }))
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex items-center gap-3 font-mono text-xs" style={{ minWidth: 160 }} suppressHydrationWarning>
      {mounted && (
        <>
          <span className="text-amber-500">{date}</span>
          <span className="text-green-600 dark:text-green-400 font-bold">{time}</span>
        </>
      )}
    </div>
  )
}



/* ---------------------------------------------------------- */
/*  UserMenu — dropdown with profile, settings, sign-out      */
/* ---------------------------------------------------------- */
function UserMenu({
  session,
  sessionReady,
  mounted,
  userRole,
  displayRole,
}: {
  session: ReturnType<typeof useSession>['data']
  sessionReady: boolean
  mounted: boolean
  userRole: string
  displayRole: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const initials = session?.user?.name
    ? session.user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : session?.user?.email?.[0]?.toUpperCase() || '?'

  // Admin shortcuts require platform-staff (PropMetrik employee), not just the role.
  const admin = isAdminRole(userRole) && (session?.user as any)?.userType === 'staff'

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center gap-2 px-2 py-1 border transition-colors font-mono text-xs',
          open
            ? 'border-amber-500 bg-muted'
            : 'border-border hover:border-zinc-600',
        )}
      >
        {/* Avatar circle */}
        <span className={cn(
          'flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold',
          admin ? 'bg-red-600 text-foreground' : 'bg-amber-500 text-foreground'
        )}>
          {mounted ? initials : '?'}
        </span>

        {mounted ? (
          <>
            <span className={cn(
              'hidden sm:inline max-w-[100px] truncate',
              admin ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground',
            )}>
              {session?.user?.name || session?.user?.email || 'User'}
            </span>
            <span className={cn(
              'text-[8px] px-1 py-0.5 rounded',
              admin ? 'bg-red-500/20 text-red-600 dark:text-red-400' : 'bg-zinc-700 text-muted-foreground',
            )}>
              {displayRole}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">USER</span>
        )}

        {/* Chevron */}
        <svg className={cn("w-3 h-3 text-muted-foreground transition-transform", open && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && sessionReady && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-card border border-border shadow-xl shadow-black/50 z-[60] font-mono">
          {/* User header */}
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-3">
              <span className={cn(
                'flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold shrink-0',
                admin ? 'bg-red-600 text-foreground' : 'bg-amber-500 text-foreground',
              )}>
                {initials}
              </span>
              <div className="min-w-0">
                <p className="text-sm text-foreground truncate">{session?.user?.name || 'User'}</p>
                <p className="text-[10px] text-muted-foreground truncate">{session?.user?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className={cn(
                'text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wide',
                admin ? 'bg-red-500/20 text-red-600 dark:text-red-400 border border-red-800' : 'bg-muted text-muted-foreground border border-border',
              )}>
                {displayRole}
              </span>
              {session?.user?.tier && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-800">
                  {session.user.tier.toUpperCase()}
                </span>
              )}
              {session?.user?.organizationName && (
                <span className="text-[9px] text-muted-foreground truncate">
                  {session.user.organizationName}
                </span>
              )}
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <MenuItem
              label="PROFILE"
              icon={<UserIcon />}
              onClick={() => { setOpen(false); router.push('/dashboard/profile') }}
            />
            <MenuItem
              label="SETTINGS"
              icon={<GearIcon />}
              onClick={() => { setOpen(false); router.push('/dashboard/profile') }}
            />
            <MenuItem
              label="BILLING"
              icon={<CreditCardIcon />}
              onClick={() => { setOpen(false); router.push('/dashboard/billing') }}
            />
            <MenuItem
              label="DEVELOPER PORTAL"
              icon={<TerminalIcon />}
              onClick={() => { setOpen(false); router.push('/developers') }}
            />
            {admin && (
              <MenuItem
                label="ADMIN PANEL"
                icon={<ShieldIcon />}
                onClick={() => { setOpen(false); router.push('/dashboard/admin') }}
                accent="red"
              />
            )}
          </div>

          {/* Theme toggle */}
          <div className="border-t border-border py-1">
            <ThemeMenuItem />
          </div>

          {/* Sign out */}
          <div className="border-t border-border py-1">
            <MenuItem
              label="SIGN OUT"
              icon={<LogoutIcon />}
              onClick={() => signOut({ callbackUrl: '/login' })}
              accent="red"
            />
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-border">
            <p className="text-[9px] text-muted-foreground">SESSION EXPIRES {new Date(session?.expires || '').toLocaleDateString('en-GB')}</p>
          </div>
        </div>
      )}

      {/* Not signed in */}
      {open && mounted && !sessionReady && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-card border border-border shadow-xl shadow-black/50 z-[60] font-mono py-1">
          <MenuItem
            label="SIGN IN"
            icon={<LoginIcon />}
            onClick={() => { setOpen(false); router.push('/login') }}
            accent="amber"
          />
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------- */
/*  Menu Item                                                  */
/* ---------------------------------------------------------- */
function MenuItem({ label, icon, onClick, accent }: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  accent?: 'red' | 'amber'
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-2 text-[11px] tracking-wide transition-colors text-left',
        accent === 'red'
          ? 'text-red-600 dark:text-red-400 hover:bg-red-900/20 hover:text-red-300'
          : accent === 'amber'
            ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-900/20 hover:text-amber-300'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <span className="w-4 h-4 flex items-center justify-center opacity-60">{icon}</span>
      {label}
    </button>
  )
}

/* ---------------------------------------------------------- */
/*  Theme menu item (inline toggle)                           */
/* ---------------------------------------------------------- */
function ThemeMenuItem() {
  const { theme, setTheme } = useTheme()
  const [m, setM] = useState(false)
  useEffect(() => { setM(true) }, [])
  if (!m) return null
  const opts: { id: string; label: string; icon: React.ReactNode }[] = [
    { id: 'light', label: 'Light', icon: <SunIcon /> },
    { id: 'dark', label: 'Dark', icon: <MoonIcon /> },
    { id: 'system', label: 'System', icon: <MonitorIcon /> },
  ]
  return (
    <div className="px-3 py-2">
      <div className="px-1 pb-1.5 text-[10px] tracking-wider text-muted-foreground/70 uppercase">Theme</div>
      <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
        {opts.map((o) => (
          <button
            key={o.id}
            onClick={() => setTheme(o.id)}
            aria-pressed={theme === o.id}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
              theme === o.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="w-3.5 h-3.5 flex items-center justify-center">{o.icon}</span>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------- */
/*  Inline SVG Icons (no extra deps)                          */
/* ---------------------------------------------------------- */
const UserIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
)
const GearIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
)
const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)
const CreditCardIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" />
  </svg>
)
const TerminalIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
  </svg>
)
const LogoutIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
  </svg>
)
const LoginIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" />
  </svg>
)
const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
)
const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
  </svg>
)
const MonitorIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
  </svg>
)

/* ---------------------------------------------------------- */
/*  TopNav                                                     */
/* ---------------------------------------------------------- */
export function TopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session, status } = useSession()
  const [mounted, setMounted] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [ticker, setTicker] = useState<{
    gh_property_index: { avg_price: number; total_properties: number; change_pct: number | null };
    accra_avg: number;
    neighborhoods: { name: string; avg_price: number; direction: 'up' | 'down'; count: number }[];
    active_deals: number;
    pending_valuations: number;
    cap_rate: number;
  } | null>(null)

  // Cache last known good session to survive transient HMR/network failures
  const lastGoodSession = useRef(session)
  if (session && status === 'authenticated') {
    lastGoodSession.current = session
  }
  // Use cached session when status is 'loading' (e.g. during HMR refetch)
  const effectiveSession = status === 'loading' ? lastGoodSession.current : session

  useEffect(() => { setMounted(true) }, [])

  // Fetch ticker data once on mount, refresh every 60s
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await authedFetch('/api/ticker')
        if (!res.ok) return
        const json = await res.json()
        if (!cancelled && json.data) setTicker(json.data)
      } catch { /* silent */ }
    }
    load()
    const interval = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  const sessionReady = mounted && (status === 'authenticated' || (status === 'loading' && !!lastGoodSession.current))
  const userRole = effectiveSession?.user?.role || ''
  const userTier = effectiveSession?.user?.tier || 'starter'
  const displayRole = userRole ? userRole.replace(/_/g, ' ').toUpperCase() : 'USER'

  // Access the upgrade gate for tier-gating navigation clicks
  const { navigateOrGate } = useUpgradeGate()

  // Determine user type + subscribed services for customer navigation.
  // Least-privilege default: missing/unknown → 'customer' (never 'staff').
  const userType = (effectiveSession?.user as any)?.userType || 'customer'
  const subscribedServices: string[] = (effectiveSession?.user as any)?.subscribedServices || []

  // Show workflow tabs for all authenticated users; admin/analytics are staff-only.
  // Tier and subscription gates apply on click (lock icon) — tabs do not disappear after load.
  const navUser = effectiveSession?.user
  const visibleNavigation = filterPlatformNavigation(navigation, {
    userRole: navUser?.role || userRole,
    userType: (navUser as any)?.userType ?? userType,
  })

  // Global F-key shortcuts (F1–F8)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const match = visibleNavigation.find(item => item.fKey === e.key)
      if (!match) return
      e.preventDefault()
      e.stopPropagation()
      const tierLocked = sessionReady && isPlatformTabLocked(match.tabKey, {
        userRole, userTier, userType, subscribedServices,
      })
      if (tierLocked) {
        navigateOrGate(match.href, match.tabKey)
      } else {
        router.push(match.href)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [visibleNavigation, sessionReady, userRole, userTier, userType, subscribedServices, navigateOrGate, router])

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileMenuOpen])

  return (
    <header className="sticky top-0 z-50 w-full bg-background border-b border-border" suppressHydrationWarning>
      {/* Top Bar — hidden on small screens */}
      <div className="hidden sm:flex items-center justify-between h-8 px-4 bg-card border-b border-border">
        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px] text-muted-foreground">PROPMETRIK TERMINAL</span>
          <span className="text-[10px] text-muted-foreground">|</span>
          <span className="font-mono text-[10px] text-green-500">● CONNECTED</span>
        </div>
        <div className="flex items-center gap-4">
          <Clock />
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="flex items-center h-12 sm:h-10 px-3 sm:px-4">
        {/* Hamburger button — mobile only */}
        <button
          onClick={() => setMobileMenuOpen(o => !o)}
          className="md:hidden p-1.5 mr-2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          )}
        </button>

        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 mr-4 sm:mr-6">
          <div className="flex items-center">
            <span className="font-bold text-amber-500 text-lg tracking-tight">PROP</span>
            <span className="font-bold text-foreground text-lg tracking-tight">METRIK</span>
          </div>
        </Link>

        {/* Service Navigation — hidden on mobile, visible on md+ */}
        <nav className="hidden md:flex items-center gap-0.5 flex-1 overflow-x-auto scrollbar-hide">
          {visibleNavigation.map((item) => {
            const active = isActive(item.href)
            const isAdminTab = item.adminOnly
            const tierLocked = sessionReady && isPlatformTabLocked(item.tabKey, {
              userRole,
              userTier,
              userType,
              subscribedServices,
            })

            const handleClick = (e: React.MouseEvent) => {
              if (tierLocked) {
                e.preventDefault()
                navigateOrGate(item.href, item.tabKey)
              }
            }

            return (
              <Link
                key={item.name}
                href={tierLocked ? '#' : item.href}
                onClick={handleClick}
                className={cn(
                  'px-2 sm:px-3 py-1.5 text-[10px] sm:text-xs font-mono tracking-wider transition-colors flex items-center gap-1 sm:gap-1.5 relative whitespace-nowrap',
                  tierLocked
                    ? 'text-muted-foreground hover:text-muted-foreground hover:bg-muted/50 cursor-pointer'
                    : active
                      ? isAdminTab
                        ? 'bg-red-600 text-foreground font-bold'
                        : 'bg-amber-500 text-foreground font-bold'
                      : isAdminTab
                        ? 'text-red-600 dark:text-red-400 hover:text-red-300 hover:bg-red-900/30 border border-red-900/50'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <span className={cn("mr-1", tierLocked ? "text-zinc-700" : isAdminTab ? "text-red-600" : "text-muted-foreground")}>{item.key}</span>
                {item.name}
                {tierLocked && (
                  <svg className="w-3 h-3 text-amber-500/60 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                )}
                {item.badge && !tierLocked && (
                  <span className={cn(
                    'px-1 py-0.5 text-[8px] rounded',
                    active
                      ? isAdminTab
                        ? 'bg-background/20 text-foreground'
                        : 'bg-background/20 text-foreground'
                      : isAdminTab
                        ? 'bg-red-500/20 text-red-600 dark:text-red-400'
                        : 'bg-yellow-500/20 text-yellow-500'
                  )}>
                    {item.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Spacer on mobile to push right items */}
        <div className="flex-1 md:hidden" />

        {/* Right Side — Notifications + User Menu */}
        <div className="flex items-center gap-2">
          <NotificationDropdown />
          <UserMenu
            session={effectiveSession}
            sessionReady={sessionReady}
            mounted={mounted}
            userRole={userRole}
            displayRole={displayRole}
          />
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 top-12 bg-background/60 z-40"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Drawer */}
          <div className="md:hidden fixed inset-x-0 top-12 bottom-0 z-50 bg-background border-t border-border overflow-y-auto">
            <nav className="flex flex-col py-2">
              {visibleNavigation.map((item) => {
                const active = isActive(item.href)
                const isAdminTab = item.adminOnly
                const tierLocked = sessionReady && isPlatformTabLocked(item.tabKey, {
              userRole,
              userTier,
              userType,
              subscribedServices,
            })

                const handleClick = (e: React.MouseEvent) => {
                  if (tierLocked) {
                    e.preventDefault()
                    navigateOrGate(item.href, item.tabKey)
                  }
                  setMobileMenuOpen(false)
                }

                return (
                  <Link
                    key={item.name}
                    href={tierLocked ? '#' : item.href}
                    onClick={handleClick}
                    className={cn(
                      'flex items-center gap-3 px-5 py-3.5 font-mono text-sm tracking-wider transition-colors border-b border-border/50',
                      tierLocked
                        ? 'text-muted-foreground'
                        : active
                          ? isAdminTab
                            ? 'bg-red-600/10 text-red-600 dark:text-red-400 border-l-2 border-l-red-500'
                            : 'bg-amber-500/10 text-amber-500 border-l-2 border-l-amber-500'
                          : isAdminTab
                            ? 'text-red-600 dark:text-red-400 hover:bg-red-900/20'
                            : 'text-muted-foreground hover:bg-amber-50 dark:hover:bg-amber-500/10 hover:text-foreground'
                    )}
                  >
                    <span className={cn(
                      'text-[10px] w-6 text-center',
                      tierLocked ? 'text-zinc-700' : isAdminTab ? 'text-red-600' : 'text-muted-foreground'
                    )}>
                      {item.key}
                    </span>
                    <span className="flex-1">{item.name}</span>
                    {tierLocked && (
                      <svg className="w-4 h-4 text-amber-500/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    )}
                    {item.badge && !tierLocked && (
                      <span className={cn(
                        'px-1.5 py-0.5 text-[9px] rounded',
                        isAdminTab ? 'bg-red-500/20 text-red-600 dark:text-red-400' : 'bg-yellow-500/20 text-yellow-500'
                      )}>
                        {item.badge}
                      </span>
                    )}
                    {active && !tierLocked && (
                      <svg className="w-4 h-4 text-current opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </Link>
                )
              })}
            </nav>

            {/* Mobile market summary */}
            {ticker && (
              <div className="px-5 py-4 border-t border-border space-y-2">
                <p className="text-[10px] text-muted-foreground font-mono tracking-wider">MARKET DATA</p>
                <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                  <div>
                    <span className="text-muted-foreground">GH PROPERTY IDX</span>{' '}
                    <span className="text-foreground">
                      &#x20B5;{ticker.gh_property_index.avg_price >= 1_000_000
                        ? `${(ticker.gh_property_index.avg_price / 1_000_000).toFixed(1)}M`
                        : `${Math.round(ticker.gh_property_index.avg_price / 1000)}K`}
                    </span>
                    {ticker.gh_property_index.change_pct !== null && (
                      <span className={ticker.gh_property_index.change_pct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                        {' '}{ticker.gh_property_index.change_pct >= 0 ? '+' : ''}{ticker.gh_property_index.change_pct.toFixed(2)}%
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">ACCRA AVG</span>{' '}
                    <span className="text-foreground">&#x20B5;{ticker.accra_avg.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">ACTIVE DEALS</span>{' '}
                    <span className="text-amber-500">{ticker.active_deals}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">PENDING VAL</span>{' '}
                    <span className="text-amber-500">{ticker.pending_valuations}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Ticker Bar — hidden on mobile */}
      <div className="hidden sm:flex items-center h-6 px-4 bg-card/50 border-t border-border overflow-hidden">
        <div className="flex items-center gap-6 font-mono text-[10px]">
          {ticker ? (
            <>
              <span>
                <span className="text-muted-foreground">GH PROPERTY IDX</span>{' '}
                <span className="text-foreground">
                  ₵{ticker.gh_property_index.avg_price >= 1_000_000
                    ? `${(ticker.gh_property_index.avg_price / 1_000_000).toFixed(1)}M`
                    : `${Math.round(ticker.gh_property_index.avg_price / 1000)}K`}
                </span>
                {ticker.gh_property_index.change_pct !== null && (
                  <span className={ticker.gh_property_index.change_pct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    {' '}{ticker.gh_property_index.change_pct >= 0 ? '+' : ''}{ticker.gh_property_index.change_pct.toFixed(2)}%
                  </span>
                )}
              </span>
              <span>
                <span className="text-muted-foreground">ACCRA AVG</span>{' '}
                <span className="text-foreground">₵{ticker.accra_avg.toLocaleString()}</span>
              </span>
              {ticker.neighborhoods.slice(0, 5).map((n) => (
                <span key={n.name}>
                  <span className="text-muted-foreground">{n.name.toUpperCase()}</span>{' '}
                  <span className={n.direction === 'up' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    {n.direction === 'up' ? '↑' : '↓'}
                  </span>
                </span>
              ))}
              <span>
                <span className="text-muted-foreground">ACTIVE DEALS</span>{' '}
                <span className="text-amber-500">{ticker.active_deals}</span>
              </span>
              <span>
                <span className="text-muted-foreground">PENDING VAL</span>{' '}
                <span className="text-amber-500">{ticker.pending_valuations}</span>
              </span>
              <span>
                <span className="text-muted-foreground">PROPERTIES</span>{' '}
                <span className="text-cyan-600 dark:text-cyan-400">{ticker.gh_property_index.total_properties.toLocaleString()}</span>
              </span>
              <span>
                <span className="text-muted-foreground">CAP RATE</span>{' '}
                <span className="text-green-600 dark:text-green-400">{ticker.cap_rate.toFixed(2)}%</span>
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">Loading market data...</span>
          )}
        </div>
      </div>
    </header>
  )
}
