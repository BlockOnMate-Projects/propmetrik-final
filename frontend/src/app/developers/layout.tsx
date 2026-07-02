'use client'

/**
 * Developer Portal console shell (/developers).
 *
 * The subscriber-facing API console — a Massive/polygon.io-style left-sidebar
 * layout that lives in the main app and reuses the global session + theme. It is
 * distinct from the internal analytics dashboards (staff-only): here a paying
 * subscriber self-serves API keys, watches usage, and sees their plan.
 *
 * Gate: authenticated users whose org holds an active API product (entitlements
 * .has_api_access) — otherwise an upsell. Staff always pass (platform org is
 * entitled to everything).
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { getEntitlements, type Entitlements } from '@/lib/developer-api'
import { DeveloperCtx } from './ctx'
import {
  LayoutDashboard,
  KeyRound,
  BarChart3,
  CreditCard,
  BookOpen,
  ArrowLeft,
  Lock,
  Loader2,
  ExternalLink,
  Terminal,
  Radio,
} from 'lucide-react'

const NAV = [
  { href: '/developers', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/developers/keys', label: 'API Keys', icon: KeyRound },
  { href: '/developers/usage', label: 'Usage', icon: BarChart3 },
  { href: '/developers/stream', label: 'Streaming', icon: Radio },
  { href: '/developers/plan', label: 'Plan & Billing', icon: CreditCard },
]

export default function DevelopersLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { status } = useSession()

  const [entitlements, setEntitlements] = useState<Entitlements | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setEntitlements(await getEntitlements())
    } catch (e: any) {
      setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login?callbackUrl=/developers')
      return
    }
    if (status === 'authenticated') load()
  }, [status, load, router])

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + '/')

  // ── Loading ────────────────────────────────────────────────────────────────
  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
      </div>
    )
  }

  // ── Gate: no API product → upsell ────────────────────────────────────────────
  if (error || !entitlements?.has_api_access) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center border border-border bg-card/60 rounded-xl p-8">
          <div className="w-12 h-12 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-foreground mb-2">API access required</h1>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            The developer portal is available to organizations with an active analytics API subscription
            (Market Intelligence, Analytics, or Short-Stay). Subscribe to a plan to generate keys and start
            building.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded transition-colors"
            >
              View plans
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 border border-border hover:bg-muted text-muted-foreground text-sm rounded transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back to app
            </Link>
          </div>
          {error && <p className="text-[11px] text-red-500 mt-4 font-mono">{error}</p>}
        </div>
      </div>
    )
  }

  // ── Console shell ────────────────────────────────────────────────────────────
  return (
    <DeveloperCtx.Provider value={{ entitlements, loading, refresh: load }}>
      <div className="min-h-screen bg-background text-foreground flex">
        {/* Sidebar */}
        <aside className="w-60 shrink-0 border-r border-border bg-card/30 flex flex-col fixed inset-y-0 left-0">
          <div className="px-5 h-16 flex items-center gap-2 border-b border-border">
            <Terminal className="w-5 h-5 text-amber-500" />
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-tight">PROPMETRIK</div>
              <div className="text-[10px] text-muted-foreground font-mono tracking-wider">DEVELOPERS</div>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-1">
            {NAV.map((item) => {
              const Icon = item.icon
              const active = isActive(item.href, (item as any).exact)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                    active
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </Link>
              )
            })}

            <div className="pt-3 mt-3 border-t border-border">
              <p className="px-3 pb-1 text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
                Resources
              </p>
              <a
                href="/api"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <BookOpen className="w-4 h-4 shrink-0" />
                Documentation
                <ExternalLink className="w-3 h-3 ml-auto opacity-60" />
              </a>
            </div>
          </nav>

          <div className="p-3 border-t border-border">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 px-3 py-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to app
            </Link>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 ml-60 min-w-0">
          <header className="h-16 border-b border-border bg-background/80 backdrop-blur sticky top-0 z-10 flex items-center justify-between px-6">
            <div className="text-sm text-muted-foreground">Developer Portal</div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground border border-border rounded-full px-2.5 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> System OK
              </span>
              <span className="text-xs font-mono text-amber-600 dark:text-amber-400 border border-amber-500/30 bg-amber-500/5 rounded-full px-2.5 py-1 capitalize">
                {entitlements.tier}
              </span>
            </div>
          </header>
          <main className="p-6 max-w-6xl">{children}</main>
        </div>
      </div>
    </DeveloperCtx.Provider>
  )
}
