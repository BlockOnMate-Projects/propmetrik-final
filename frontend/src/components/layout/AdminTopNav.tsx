'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
  Bell,
  BarChart3,
  Globe,
  Key,
  Server,
} from 'lucide-react'

const navigation = [
  { name: 'OVERVIEW', href: '/dashboard/admin', exact: true, icon: LayoutDashboard },
  { name: 'USERS', href: '/dashboard/admin/users', icon: Users },
  { name: 'ORGANIZATIONS', href: '/dashboard/admin/organizations', icon: Building2 },
  { name: 'ROLES & PERMISSIONS', href: '/dashboard/admin/roles', icon: Shield },
  { name: 'DATA HUB', href: '/dashboard/admin/data-hub', icon: Database },
  { name: 'ANALYTICS', href: '/dashboard/admin/analytics', icon: BarChart3 },
  { name: 'BILLING', href: '/dashboard/admin/billing', icon: CreditCard },
  { name: 'AUDIT LOGS', href: '/dashboard/admin/audit-logs', icon: FileText },
  { name: 'SYSTEM', href: '/dashboard/admin/system', icon: Server },
  { name: 'ACTIVITY', href: '/dashboard/admin/activity', icon: Activity },
  { name: 'NOTIFICATIONS', href: '/dashboard/admin/notifications', icon: Bell },
  { name: 'API KEYS', href: '/dashboard/admin/api-keys', icon: Key },
  { name: 'INTEGRATIONS', href: '/dashboard/admin/integrations', icon: Globe },
  { name: 'SETTINGS', href: '/dashboard/admin/settings', icon: Settings },
]

export function AdminTopNav() {
  const pathname = usePathname()

  return (
    <div className="w-full bg-zinc-950 border-b border-red-900/50">
      {/* Admin Header Bar */}
      <div className="flex items-center justify-between h-8 px-4 bg-red-950/30 border-b border-red-900/30">
        <div className="flex items-center gap-3">
          <Shield className="w-4 h-4 text-red-500" />
          <span className="font-mono text-[11px] text-red-400 font-bold tracking-wider">
            PROPMETRIK ADMIN CONSOLE
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-zinc-500">
            ACCESS LEVEL: <span className="text-red-400 font-bold">SUPER_ADMIN</span>
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center h-10 px-4 gap-1 overflow-x-auto scrollbar-hide">
        {navigation.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href) && (item.href !== '/dashboard/admin' || pathname === '/dashboard/admin')
          const Icon = item.icon

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono tracking-wide transition-all whitespace-nowrap',
                isActive
                  ? 'bg-red-600 text-white font-bold'
                  : 'text-zinc-400 hover:text-red-300 hover:bg-red-900/20'
              )}
            >
              <Icon className={cn('w-3.5 h-3.5', isActive ? 'text-white' : 'text-red-500/70')} />
              {item.name}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
