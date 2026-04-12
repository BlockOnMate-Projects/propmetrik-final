"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Database,
  LayoutDashboard,
  Layers,
  GitBranch,
  Users,
  TrendingUp,
  HardHat,
  Bug,
  ChevronLeft,
  ChevronRight,
  Settings,
  Server,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useState } from 'react'

const navigation = [
  {
    name: 'Overview',
    href: '/dashboard/admin/data-hub',
    icon: LayoutDashboard,
  },
  {
    name: 'Data Sources',
    href: '/dashboard/admin/data-hub/sources',
    icon: Database,
  },
  {
    name: 'ETL Jobs',
    href: '/dashboard/admin/data-hub/jobs',
    icon: GitBranch,
  },
  {
    name: 'Contributions',
    href: '/dashboard/admin/data-hub/contributions',
    icon: Users,
  },
  {
    name: 'Economic Data',
    href: '/dashboard/admin/data-hub/economic',
    icon: TrendingUp,
  },
  {
    name: 'Construction Costs',
    href: '/dashboard/admin/data-hub/construction',
    icon: HardHat,
  },
  {
    name: 'Spiders',
    href: '/dashboard/admin/data-hub/spiders',
    icon: Bug,
  },
  {
    name: 'Tier Ingestion',
    href: '/dashboard/admin/data-hub/ingestion',
    icon: Layers,
  },
]

const bottomNavigation = [
  {
    name: 'Queue Status',
    href: '/dashboard/admin/data-hub/queues',
    icon: Server,
  },
  {
    name: 'Settings',
    href: '/dashboard/admin/data-hub/settings',
    icon: Settings,
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          'flex flex-col border-r bg-card transition-all duration-300',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center border-b px-4">
          <Link href="/dashboard/admin/data-hub" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Database className="h-5 w-5 text-primary-foreground" />
            </div>
            {!collapsed && (
              <span className="font-semibold text-lg">Data Hub</span>
            )}
          </Link>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 space-y-1 p-2">
          {navigation.map((item) => {
            const isActive = pathname === item.href
            const NavLink = (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span>{item.name}</span>}
              </Link>
            )

            if (collapsed) {
              return (
                <Tooltip key={item.name}>
                  <TooltipTrigger asChild>{NavLink}</TooltipTrigger>
                  <TooltipContent side="right">{item.name}</TooltipContent>
                </Tooltip>
              )
            }

            return NavLink
          })}
        </nav>

        {/* Bottom Navigation */}
        <div className="border-t p-2 space-y-1">
          {bottomNavigation.map((item) => {
            const isActive = pathname === item.href
            const NavLink = (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span>{item.name}</span>}
              </Link>
            )

            if (collapsed) {
              return (
                <Tooltip key={item.name}>
                  <TooltipTrigger asChild>{NavLink}</TooltipTrigger>
                  <TooltipContent side="right">{item.name}</TooltipContent>
                </Tooltip>
              )
            }

            return NavLink
          })}
        </div>

        {/* Collapse Toggle */}
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-2" />
                <span>Collapse</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </TooltipProvider>
  )
}
