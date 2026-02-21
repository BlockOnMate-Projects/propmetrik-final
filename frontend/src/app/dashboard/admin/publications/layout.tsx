'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  FileText,
  BarChart3,
  TrendingUp,
  Mail,
  Settings,
  Plus,
  Bot,
} from 'lucide-react'

// ── Publications Console Navigation ─────────────────────────
const pubTabs = [
  { name: 'All Publications', href: '/dashboard/admin/publications', icon: FileText, exact: true },
  { name: 'Create New', href: '/dashboard/admin/publications/new', icon: Plus },
  { name: 'Autopilot', href: '/dashboard/admin/publications/autopilot', icon: Bot },
  { name: 'Indices', href: '/dashboard/admin/publications/indices', icon: TrendingUp },
  { name: 'Analytics', href: '/dashboard/admin/publications/analytics', icon: BarChart3 },
  { name: 'Newsletter', href: '/dashboard/admin/publications/newsletter', icon: Mail },
  { name: 'Settings', href: '/dashboard/admin/publications/settings', icon: Settings },
]

export default function PublicationsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="-m-6">
      {/* ── Publications Tab Bar ── */}
      <div className="border-b border-red-900/30 bg-zinc-950/80">
        <div className="flex items-center px-6 gap-0 overflow-x-auto scrollbar-hide">
          {pubTabs.map((tab) => {
            const isActive = tab.exact
              ? pathname === tab.href
              : pathname.startsWith(tab.href)
            const Icon = tab.icon

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 text-[11px] font-mono tracking-wide transition-all whitespace-nowrap border-b-2 -mb-px',
                  isActive
                    ? 'border-red-500 text-white bg-red-900/10'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
                )}
              >
                <Icon className={cn('w-3.5 h-3.5', isActive ? 'text-red-400' : 'text-zinc-600')} />
                {tab.name}
              </Link>
            )
          })}
        </div>
      </div>

      {/* ── Content Area ── */}
      <div className="p-6">
        {children}
      </div>
    </div>
  )
}
