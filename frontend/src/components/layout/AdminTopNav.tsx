'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/utils'
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
    icon: Database,
    children: [
      { name: 'Data Hub', href: '/dashboard/admin/data-hub', icon: Database },
      { name: 'Analytics', href: '/dashboard/admin/analytics', icon: BarChart3 },
    ],
  },
  {
    name: 'SETTINGS',
    icon: Settings,
    children: [
      { name: 'Roles & Permissions', href: '/dashboard/admin/roles', icon: Shield },
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

  // Determine which parent group is active based on current route
  const activeGroup = (() => {
    for (const item of navigation) {
      if (item.href && item.exact && pathname === item.href) return item.name
      if (item.href && !item.exact && pathname.startsWith(item.href)) return item.name
      if (item.children?.some((c) => pathname.startsWith(c.href))) return item.name
    }
    return null
  })()

  // The sub-items to display: hovered group takes priority, then active group
  const displayGroup = hoveredGroup || activeGroup
  const displayItem = navigation.find((n) => n.name === displayGroup)
  const subItems = displayItem?.children

  return (
    <div
      className="w-full bg-zinc-950 border-b border-red-900/50"
      onMouseLeave={() => setHoveredGroup(null)}
    >
      {/* ── Row 1: Admin Header ── */}
      <div className="flex items-center justify-between h-8 px-4 bg-red-950/30 border-b border-red-900/30">
        <div className="flex items-center gap-3">
          <Shield className="w-4 h-4 text-red-500" />
          <span className="font-mono text-[11px] text-red-400 font-bold tracking-wider">
            PROPMETRIK ADMIN CONSOLE
          </span>
        </div>
        <span className="font-mono text-[10px] text-zinc-500">
          ACCESS LEVEL: <span className="text-red-400 font-bold">SUPER_ADMIN</span>
        </span>
      </div>

      {/* ── Row 2: Primary Category Tabs ── */}
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
                    ? 'bg-red-600 text-white font-bold'
                    : isHovered
                      ? 'text-red-300 bg-red-900/20'
                      : 'text-zinc-400 hover:text-red-300 hover:bg-red-900/20'
                )}
              >
                <Icon className={cn('w-3.5 h-3.5', isActive ? 'text-white' : 'text-red-500/70')} />
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
                  ? 'bg-red-600 text-white font-bold'
                  : isHovered
                    ? 'text-red-300 bg-red-900/20'
                    : 'text-zinc-400 hover:text-red-300 hover:bg-red-900/20'
              )}
            >
              <Icon className={cn('w-3.5 h-3.5', isActive ? 'text-white' : 'text-red-500/70')} />
              {item.name}
            </button>
          )
        })}
      </div>

      {/* ── Row 3: Cascading Sub-Items ── */}
      {subItems && subItems.length > 0 && (
        <div className="flex items-center h-8 px-4 gap-0.5 bg-zinc-900/60 border-t border-zinc-800/60 overflow-x-auto scrollbar-hide">
          <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest mr-3 whitespace-nowrap">
            {displayGroup}
          </span>
          <div className="w-px h-4 bg-zinc-800 mr-2" />
          {subItems.map((child) => {
            const isChildActive = pathname.startsWith(child.href)
            const ChildIcon = child.icon

            return (
              <Link
                key={child.href}
                href={child.href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 text-[11px] font-mono tracking-wide transition-all whitespace-nowrap',
                  isChildActive
                    ? 'bg-red-900/40 text-white font-bold border-b-2 border-red-500'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                )}
              >
                <ChildIcon className={cn('w-3 h-3', isChildActive ? 'text-red-400' : 'text-zinc-600')} />
                {child.name}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
