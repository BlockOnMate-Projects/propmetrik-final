'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { authedFetch } from '@/lib/authed-fetch'
import {
  LayoutDashboard,
  Users,
  Building2,
  Shield,
  Database,
  Settings,
  Activity,
  FileText,
  CreditCard,
  BarChart3,
  Globe,
  Key,
  Server,
  Percent,
  Wallet,
  DollarSign,
  BookOpen,
  Rocket,
  Heart,
  Zap,
  ShieldCheck,
  Flag,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ─── Navigation Structure ───────────────────────────────────────

interface NavChild {
  name: string
  href: string
  icon: LucideIcon
}

interface NavItem {
  name: string
  icon: LucideIcon
  href?: string       // Direct link (no children)
  exact?: boolean
  children?: NavChild[]
}

const navigation: NavItem[] = [
  {
    name: 'OVERVIEW',
    href: '/dashboard/admin',
    exact: true,
    icon: LayoutDashboard,
  },
  {
    name: 'ORGANIZATION',
    icon: Building2,
    children: [
      { name: 'Organizations', href: '/dashboard/admin/organizations', icon: Building2 },
      { name: 'Users', href: '/dashboard/admin/users', icon: Users },
    ],
  },
  {
    name: 'TRUST & SAFETY',
    icon: ShieldCheck,
    children: [
      { name: 'KYB Review', href: '/dashboard/admin/kyb-review', icon: ShieldCheck },
      { name: 'Listing Moderation', href: '/dashboard/admin/listing-reports', icon: Flag },
    ],
  },
  {
    name: 'FINANCE',
    icon: DollarSign,
    children: [
      { name: 'Billing', href: '/dashboard/admin/billing', icon: CreditCard },
      { name: 'Crypto Payments', href: '/dashboard/admin/crypto', icon: Wallet },
      { name: 'Platform Fees', href: '/dashboard/admin/platform-fees', icon: Percent },
    ],
  },
  {
    name: 'DATA HUB',
    href: '/dashboard/admin/data-hub',
    icon: Database,
  },
  {
    name: 'PLATFORM',
    icon: Zap,
    children: [
      { name: 'Subscription Pricing', href: '/dashboard/admin/subscription-pricing', icon: CreditCard },
      { name: 'API Docs', href: '/dashboard/admin/api-docs', icon: BookOpen },
      { name: 'Usage Analytics', href: '/dashboard/admin/usage', icon: BarChart3 },
      { name: 'Customer Success', href: '/dashboard/admin/customer-success', icon: Heart },
      { name: 'Onboarding', href: '/dashboard/admin/onboarding', icon: Rocket },
    ],
  },
  {
    name: 'PUBLICATIONS',
    href: '/dashboard/admin/publications',
    icon: FileText,
  },
  {
    name: 'SETTINGS',
    icon: Settings,
    children: [
      { name: 'Roles & Permissions', href: '/dashboard/admin/rbac', icon: Shield },
      { name: 'API Keys', href: '/dashboard/admin/api-keys', icon: Key },
      { name: 'Integrations', href: '/dashboard/admin/integrations', icon: Globe },
      { name: 'Audit Logs', href: '/dashboard/admin/audit-logs', icon: FileText },
      { name: 'Activity', href: '/dashboard/admin/activity', icon: Activity },
      { name: 'System', href: '/dashboard/admin/system', icon: Server },
    ],
  },
]

// ─── Main Nav ───────────────────────────────────────────────────

export function AdminTopNav() {
  const pathname = usePathname()
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null)
  const [pendingKyb, setPendingKyb] = useState(0)

  // Pending KYB submissions awaiting review — shown as a badge on "KYB Review".
  useEffect(() => {
    let alive = true
    authedFetch('/api/admin/organizations/verifications')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => { if (alive) setPendingKyb(Array.isArray(d?.data) ? d.data.length : 0) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // Determine which parent group is active based on current route
  const activeGroup = (() => {
    for (const item of navigation) {
      if (item.href && item.exact && pathname === item.href) return item.name
      if (item.href && !item.exact && pathname.startsWith(item.href)) return item.name
      if (item.children?.some((c) => pathname.startsWith(c.href))) return item.name
    }
    return null
  })()

  // Sub-items: always show active group; hover previews others temporarily
  const displayGroup = hoveredGroup || activeGroup
  const displayItem = navigation.find((n) => n.name === displayGroup)
  const subItems = displayItem?.children

  // Always show active group's sub-items row
  const activeItem = navigation.find((n) => n.name === activeGroup)
  const activeSubItems = activeItem?.children

  return (
    <div
      className="w-full bg-background border-b border-red-900/50"
      onMouseLeave={() => setHoveredGroup(null)}
    >
      {/* ── Primary Category Tabs ── */}
      <div className="flex items-center h-9 px-4 gap-0.5 overflow-x-auto scrollbar-hide">
        {navigation.map((item) => {
          const isActive = item.name === activeGroup
          const isHovered = item.name === hoveredGroup
          const Icon = item.icon

          // Direct-link item (OVERVIEW)
          if (item.href && !item.children) {
            return (
              <Link
                key={item.name}
                href={item.href}
                onMouseEnter={() => setHoveredGroup(item.name)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono tracking-wide transition-all whitespace-nowrap',
                  isActive
                    ? 'bg-red-600 text-foreground font-bold'
                    : isHovered
                      ? 'text-red-600 dark:text-red-300 bg-red-100 dark:bg-red-900/20'
                      : 'text-muted-foreground hover:text-red-300 hover:bg-red-900/20'
                )}
              >
                <Icon className={cn('w-3.5 h-3.5', isActive ? 'text-foreground' : 'text-red-500/70')} />
                {item.name}
              </Link>
            )
          }

          // Category with children — acts as button that reveals sub-row
          return (
            <button
              key={item.name}
              onMouseEnter={() => setHoveredGroup(item.name)}
              onClick={() => setHoveredGroup(item.name)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono tracking-wide transition-all whitespace-nowrap select-none',
                isActive
                  ? 'bg-red-600 text-foreground font-bold'
                  : isHovered
                    ? 'text-red-600 dark:text-red-300 bg-red-100 dark:bg-red-900/20'
                    : 'text-muted-foreground hover:text-red-300 hover:bg-red-900/20'
              )}
            >
              <Icon className={cn('w-3.5 h-3.5', isActive ? 'text-foreground' : 'text-red-500/70')} />
              {item.name}
            </button>
          )
        })}
      </div>

      {/* ── Row 3: Sub-Items — always visible for active group ── */}
      {(subItems || activeSubItems) && (
        <div className="flex items-center h-8 px-4 gap-0.5 bg-card/80 border-t border-red-900/20 overflow-x-auto scrollbar-hide">
          <span className="font-mono text-[9px] text-red-500/60 uppercase tracking-widest mr-3 whitespace-nowrap">
            {displayGroup || activeGroup}
          </span>
          <div className="w-px h-4 bg-red-100 dark:bg-red-900/30 mr-2" />
          {(subItems || activeSubItems || []).map((child) => {
            const isChildActive = pathname.startsWith(child.href)
            const ChildIcon = child.icon

            return (
              <Link
                key={child.href}
                href={child.href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 text-[11px] font-mono tracking-wide transition-all whitespace-nowrap',
                  isChildActive
                    ? 'bg-red-100 dark:bg-red-900/40 text-foreground font-bold border-b-2 border-red-500'
                    : 'text-muted-foreground hover:text-foreground hover:bg-amber-50 dark:hover:bg-amber-500/10'
                )}
              >
                <ChildIcon className={cn('w-3 h-3', isChildActive ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')} />
                {child.name}
                {child.href === '/dashboard/admin/kyb-review' && pendingKyb > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-bold">{pendingKyb}</span>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
