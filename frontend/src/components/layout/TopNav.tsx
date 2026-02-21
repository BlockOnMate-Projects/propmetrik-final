'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useTheme } from 'next-themes'
import { useEffect, useState, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { canAccessPlatformTab, isAdminRole, canAccessFeature } from '@/lib/rbac'
import { useUpgradeGate } from '@/components/UpgradeGate'

const navigation: { name: string; href: string; key: string; fKey: string; tabKey: string; badge?: string; adminOnly?: boolean }[] = [
  { name: 'OVERVIEW', href: '/dashboard', key: 'F1', fKey: 'F1', tabKey: 'overview' },
  { name: 'VALUATIONS', href: '/dashboard/valuations', key: 'F2', fKey: 'F2', tabKey: 'valuations' },
  { name: 'DEALS', href: '/dashboard/deals', key: 'F3', fKey: 'F3', tabKey: 'deals' },
  { name: 'PROJECTS', href: '/dashboard/projects', key: 'F4', fKey: 'F4', tabKey: 'projects' },
  { name: 'ANALYTICS', href: '/dashboard/analytics', key: 'F5', fKey: 'F5', tabKey: 'analytics' },
  { name: 'MANAGEMENT', href: '/dashboard/property-management', key: 'F6', fKey: 'F6', tabKey: 'property-management' },
  { name: 'E-SIGN', href: '/dashboard/e-sign', key: 'F7', fKey: 'F7', tabKey: 'e-sign' },
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
      setDate(now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))
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
          <span className="text-green-400 font-bold">{time}</span>
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

  const admin = isAdminRole(userRole)

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center gap-2 px-2 py-1 border transition-colors font-mono text-xs',
          open
            ? 'border-amber-500 bg-zinc-800'
            : 'border-zinc-800 hover:border-zinc-600',
        )}
      >
        {/* Avatar circle */}
        <span className={cn(
          'flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold',
          admin ? 'bg-red-600 text-white' : 'bg-amber-500 text-black'
        )}>
          {mounted ? initials : '?'}
        </span>

        {mounted ? (
          <>
            <span className={cn(
              'hidden sm:inline max-w-[100px] truncate',
              admin ? 'text-red-400' : 'text-zinc-300',
            )}>
              {session?.user?.name || session?.user?.email || 'User'}
            </span>
            <span className={cn(
              'text-[8px] px-1 py-0.5 rounded',
              admin ? 'bg-red-500/20 text-red-400' : 'bg-zinc-700 text-zinc-400',
            )}>
              {displayRole}
            </span>
          </>
        ) : (
          <span className="text-zinc-400">USER</span>
        )}

        {/* Chevron */}
        <svg className={cn("w-3 h-3 text-zinc-500 transition-transform", open && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && sessionReady && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-zinc-900 border border-zinc-700 shadow-xl shadow-black/50 z-[60] font-mono">
          {/* User header */}
          <div className="px-4 py-3 border-b border-zinc-800">
            <div className="flex items-center gap-3">
              <span className={cn(
                'flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold shrink-0',
                admin ? 'bg-red-600 text-white' : 'bg-amber-500 text-black',
              )}>
                {initials}
              </span>
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{session?.user?.name || 'User'}</p>
                <p className="text-[10px] text-zinc-500 truncate">{session?.user?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className={cn(
                'text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wide',
                admin ? 'bg-red-500/20 text-red-400 border border-red-800' : 'bg-zinc-800 text-zinc-400 border border-zinc-700',
              )}>
                {displayRole}
              </span>
              {session?.user?.tier && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-800">
                  {session.user.tier.toUpperCase()}
                </span>
              )}
              {session?.user?.organizationName && (
                <span className="text-[9px] text-zinc-600 truncate">
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
          <div className="border-t border-zinc-800 py-1">
            <ThemeMenuItem />
          </div>

          {/* Sign out */}
          <div className="border-t border-zinc-800 py-1">
            <MenuItem
              label="SIGN OUT"
              icon={<LogoutIcon />}
              onClick={() => signOut({ callbackUrl: '/login' })}
              accent="red"
            />
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-zinc-800">
            <p className="text-[9px] text-zinc-600">SESSION EXPIRES {new Date(session?.expires || '').toLocaleDateString()}</p>
          </div>
        </div>
      )}

      {/* Not signed in */}
      {open && mounted && !sessionReady && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-zinc-900 border border-zinc-700 shadow-xl shadow-black/50 z-[60] font-mono py-1">
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
          ? 'text-red-400 hover:bg-red-900/20 hover:text-red-300'
          : accent === 'amber'
            ? 'text-amber-400 hover:bg-amber-900/20 hover:text-amber-300'
            : 'text-zinc-400 hover:bg-zinc-800 hover:text-white',
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
  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="w-full flex items-center gap-3 px-4 py-2 text-[11px] tracking-wide text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors text-left"
    >
      <span className="w-4 h-4 flex items-center justify-center opacity-60">
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </span>
      {theme === 'dark' ? 'LIGHT MODE' : 'DARK MODE'}
    </button>
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

/* ---------------------------------------------------------- */
/*  TopNav                                                     */
/* ---------------------------------------------------------- */
export function TopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session, status } = useSession()
  const [mounted, setMounted] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [ticker, setTicker] = useState<{
    gh_property_index: { avg_price: number; total_properties: number; change_pct: number };
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

  // Close mobile nav on route change
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Fetch ticker data once on mount, refresh every 60s
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/ticker')
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

  // Show all tabs the user's ROLE allows (based on RBAC).
  // Tier gating happens on click — locked tabs show a lock icon instead of hiding.
  const visibleNavigation = mounted
    ? (sessionReady
      ? navigation.filter(item => canAccessPlatformTab(userRole, item.tabKey))
      : navigation.filter(item => !item.adminOnly))
    : navigation.filter(item => !item.adminOnly)

  // Global F-key shortcuts (F1–F8)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const match = visibleNavigation.find(item => item.fKey === e.key)
      if (!match) return
      e.preventDefault()
      e.stopPropagation()
      const tierLocked = sessionReady && !canAccessFeature(userRole, userTier, match.tabKey)
      if (tierLocked) {
        navigateOrGate(match.href, match.tabKey)
      } else {
        router.push(match.href)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [visibleNavigation, sessionReady, userRole, userTier, navigateOrGate, router])

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <header className="sticky top-0 z-50 w-full bg-black border-b border-zinc-800" suppressHydrationWarning>
      {/* Top Bar — hidden on small screens */}
      <div className="hidden sm:flex items-center justify-between h-8 px-4 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px] text-zinc-500">PROPMETRIK TERMINAL</span>
          <span className="text-[10px] text-zinc-600">|</span>
          <span className="font-mono text-[10px] text-green-500">● CONNECTED</span>
        </div>
        <div className="flex items-center gap-4">
          <Clock />
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="flex items-center h-12 sm:h-10 px-3 sm:px-4">
        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(o => !o)}
          className="lg:hidden mr-2 p-1.5 text-zinc-400 hover:text-white transition-colors"
          aria-label="Toggle navigation"
        >
          {mobileOpen ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          )}
        </button>

        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 mr-4 sm:mr-6">
          <div className="flex items-center">
            <span className="font-bold text-amber-500 text-lg tracking-tight">PROP</span>
            <span className="font-bold text-white text-lg tracking-tight">METRIK</span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-0.5 flex-1">
          {visibleNavigation.map((item) => {
            const active = isActive(item.href)
            const isAdminTab = item.adminOnly
            const tierLocked = sessionReady && !canAccessFeature(userRole, userTier, item.tabKey)
            
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
                  'px-3 py-1.5 text-xs font-mono tracking-wider transition-colors flex items-center gap-1.5 relative',
                  tierLocked
                    ? 'text-zinc-600 hover:text-zinc-500 hover:bg-zinc-800/50 cursor-pointer'
                    : active
                      ? isAdminTab 
                        ? 'bg-red-600 text-white font-bold'
                        : 'bg-amber-500 text-black font-bold'
                      : isAdminTab
                        ? 'text-red-400 hover:text-red-300 hover:bg-red-900/30 border border-red-900/50'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                )}
              >
                <span className={cn("mr-1", tierLocked ? "text-zinc-700" : isAdminTab ? "text-red-600" : "text-zinc-600")}>{item.key}</span>
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
                        ? 'bg-black/20 text-white' 
                        : 'bg-black/20 text-black' 
                      : isAdminTab
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-yellow-500/20 text-yellow-500'
                  )}>
                    {item.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Spacer on mobile */}
        <div className="flex-1 lg:hidden" />

        {/* Right Side — User Menu */}
        <UserMenu
          session={effectiveSession}
          sessionReady={sessionReady}
          mounted={mounted}
          userRole={userRole}
          displayRole={displayRole}
        />
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-zinc-800 bg-zinc-900">
          <nav className="flex flex-col py-1">
            {visibleNavigation.map((item) => {
              const active = isActive(item.href)
              const isAdminTab = item.adminOnly
              const tierLocked = sessionReady && !canAccessFeature(userRole, userTier, item.tabKey)

              const handleClick = (e: React.MouseEvent) => {
                if (tierLocked) {
                  e.preventDefault()
                  navigateOrGate(item.href, item.tabKey)
                }
                setMobileOpen(false)
              }

              return (
                <Link
                  key={item.name}
                  href={tierLocked ? '#' : item.href}
                  onClick={handleClick}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5 text-xs font-mono tracking-wider transition-colors',
                    tierLocked
                      ? 'text-zinc-600 hover:text-zinc-500 hover:bg-zinc-800/50'
                      : active
                        ? isAdminTab
                          ? 'bg-red-600 text-white font-bold'
                          : 'bg-amber-500 text-black font-bold'
                        : isAdminTab
                          ? 'text-red-400 hover:text-red-300 hover:bg-red-900/30'
                          : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  )}
                >
                  <span className={cn('text-zinc-600 w-6', tierLocked && 'text-zinc-700', isAdminTab && 'text-red-600')}>{item.key}</span>
                  {item.name}
                  {tierLocked && (
                    <svg className="w-3 h-3 text-amber-500/60 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  )}
                </Link>
              )
            })}
          </nav>
        </div>
      )}

      {/* Ticker Bar — hidden on mobile */}
      <div className="hidden sm:flex items-center h-6 px-4 bg-zinc-900/50 border-t border-zinc-800 overflow-hidden">
        <div className="flex items-center gap-6 font-mono text-[10px]">
          {ticker ? (
            <>
              <span>
                <span className="text-zinc-500">GH PROPERTY IDX</span>{' '}
                <span className={ticker.cap_rate >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {ticker.cap_rate >= 0 ? '+' : ''}{ticker.cap_rate.toFixed(2)}%
                </span>
              </span>
              <span>
                <span className="text-zinc-500">ACCRA AVG</span>{' '}
                <span className="text-white">₵{ticker.accra_avg.toLocaleString()}</span>
              </span>
              {ticker.neighborhoods.slice(0, 5).map((n) => (
                <span key={n.name}>
                  <span className="text-zinc-500">{n.name.toUpperCase()}</span>{' '}
                  <span className={n.direction === 'up' ? 'text-green-400' : 'text-red-400'}>
                    {n.direction === 'up' ? '↑' : '↓'}
                  </span>
                </span>
              ))}
              <span>
                <span className="text-zinc-500">ACTIVE DEALS</span>{' '}
                <span className="text-amber-500">{ticker.active_deals}</span>
              </span>
              <span>
                <span className="text-zinc-500">PENDING VAL</span>{' '}
                <span className="text-amber-500">{ticker.pending_valuations}</span>
              </span>
              <span>
                <span className="text-zinc-500">PROPERTIES</span>{' '}
                <span className="text-cyan-400">{ticker.gh_property_index.total_properties.toLocaleString()}</span>
              </span>
              <span>
                <span className="text-zinc-500">CAP RATE</span>{' '}
                <span className="text-green-400">{ticker.cap_rate.toFixed(2)}%</span>
              </span>
            </>
          ) : (
            <span className="text-zinc-600">Loading market data...</span>
          )}
        </div>
      </div>
    </header>
  )
}
