'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutGrid,
  Users,
  Building2,
  CheckSquare,
  Settings,
  BarChart3,
  Home,
  UserCircle,
  Workflow,
  FileText,
  Calendar,
  DollarSign,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Target,
  Mail,
  Inbox,
  Percent,
  Map as MapIcon,
  Plug,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { canAccessServiceSubTab, canCustomerAccessSubTab } from '@/lib/rbac'
import { CommandPalette } from '@/components/crm/CommandPalette'

const crmNavItems = [
  { href: '/dashboard/deals', label: 'Deals', icon: LayoutGrid, exact: true, subTabKey: 'crm-deals' },
  { href: '/dashboard/deals/properties', label: 'Properties', icon: Home, subTabKey: 'crm-properties' },
  { href: '/dashboard/deals/contacts', label: 'Contacts', icon: Users, subTabKey: 'crm-contacts' },
  { href: '/dashboard/deals/agents', label: 'Agents', icon: UserCircle, subTabKey: 'crm-agents' },
  { href: '/dashboard/deals/territories', label: 'Territories', icon: MapIcon, subTabKey: 'crm-territories' },
  { href: '/dashboard/deals/companies', label: 'Companies', icon: Building2, subTabKey: 'crm-companies' },
  { href: '/dashboard/deals/tasks', label: 'Tasks', icon: CheckSquare, subTabKey: 'crm-tasks' },
  { href: '/dashboard/deals/documents', label: 'Documents', icon: FileText, subTabKey: 'crm-documents' },
  { href: '/dashboard/deals/financials', label: 'Financials', icon: DollarSign, subTabKey: 'crm-financials' },
  { href: '/dashboard/deals/communications', label: 'Communications', icon: MessageSquare, subTabKey: 'crm-communications' },
  { href: '/dashboard/deals/analytics', label: 'Analytics', icon: BarChart3, subTabKey: 'crm-analytics' },
  { href: '/dashboard/deals/workflows', label: 'Workflows', icon: Workflow, subTabKey: 'crm-workflows' },
  { href: '/dashboard/deals/pipelines', label: 'Pipelines', icon: Settings, subTabKey: 'crm-pipelines' },
  { href: '/dashboard/deals/commissions', label: 'Commissions', icon: Percent, subTabKey: 'crm-commissions' },
  { href: '/dashboard/deals/targets', label: 'Targets', icon: Target, subTabKey: 'crm-targets' },
  { href: '/dashboard/deals/drip-campaigns', label: 'Drip Campaigns', icon: Mail, subTabKey: 'crm-drip-campaigns' },
  { href: '/dashboard/deals/team', label: 'Team', icon: UserCircle, subTabKey: 'crm-team' },
  { href: '/dashboard/deals/settings', label: 'Settings', icon: Settings, subTabKey: 'crm-settings' },
]

export function CrmSidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { data: session } = useSession()
  const userRole = session?.user?.role || ''
  const userType = (session?.user as any)?.userType || 'staff'
  const customerServiceRole = (session?.user as any)?.customerServiceRoles?.crm as string | undefined

  const visibleNavItems = userRole || customerServiceRole
    ? crmNavItems.filter(item =>
        userType === 'customer'
          ? canCustomerAccessSubTab(customerServiceRole, 'deals', item.subTabKey)
          : canAccessServiceSubTab(userRole, 'deals', item.subTabKey)
      )
    : crmNavItems

  const isActive = (item: typeof crmNavItems[0]) => {
    if (item.exact) return pathname === item.href
    return pathname.startsWith(item.href)
  }

  // Close mobile drawer on route change
  useEffect(() => { setMobileOpen(false) }, [pathname])

  const navLinks = (onClickExtra?: () => void) =>
    visibleNavItems.map((item) => {
      const active = isActive(item)
      const Icon = item.icon
      const linkClassName = cn(
        'flex items-center gap-2.5 rounded px-2.5 py-2 text-xs font-mono tracking-wide transition-colors',
        active
          ? 'bg-amber-500/10 text-amber-500 font-bold'
          : 'text-muted-foreground hover:bg-muted/80 hover:text-muted-foreground'
      )

      const linkInner = (
        <>
          <Icon className={cn('h-4 w-4 shrink-0', active && 'text-amber-500')} />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </>
      )

      if (collapsed) {
        return (
          <Tooltip key={item.href}>
            <TooltipTrigger asChild>
              <Link href={item.href} onClick={onClickExtra} className={linkClassName}>
                {linkInner}
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-mono text-xs">
              {item.label}
            </TooltipContent>
          </Tooltip>
        )
      }

      return (
        <Link key={item.href} href={item.href} onClick={onClickExtra} className={linkClassName}>
          {linkInner}
        </Link>
      )
    })

  return (
    <TooltipProvider delayDuration={0}>
      {/* Mobile toggle button — fixed at top-left of content area */}
      <button
        className="md:hidden fixed top-[6.5rem] left-2 z-40 p-1.5 rounded bg-card border border-border text-muted-foreground hover:text-foreground"
        onClick={() => setMobileOpen(o => !o)}
        aria-label="Toggle CRM navigation"
      >
        {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-background/50 z-30"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-y-0 left-0 top-[6rem] w-56 bg-background border-r border-border z-40 overflow-y-auto animate-in slide-in-from-left duration-200">
          <div className="flex items-center gap-2 px-3 h-10 border-b border-border">
            <LayoutGrid className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="font-mono text-xs text-muted-foreground font-semibold tracking-wide">CRM</span>
          </div>
          <nav className="py-2 px-1.5 space-y-0.5">
            {visibleNavItems.map((item) => {
              const active = isActive(item)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-2.5 rounded px-2.5 py-2 text-xs font-mono tracking-wide transition-colors',
                    active
                      ? 'bg-amber-500/10 text-amber-500 font-bold'
                      : 'text-muted-foreground hover:bg-muted/80 hover:text-muted-foreground'
                  )}
                >
                  <Icon className={cn('h-4 w-4 shrink-0', active && 'text-amber-500')} />
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>
      )}

      {/* Desktop sidebar */}
      <div
        className={cn(
          'hidden md:flex flex-col border-r border-border bg-background transition-all duration-200 shrink-0',
          collapsed ? 'w-14' : 'w-56'
        )}
      >
        {/* Header */}
        <div className={cn(
          'flex items-center border-b border-border h-12',
          collapsed ? 'justify-center px-2' : 'px-3'
        )}>
          {!collapsed && (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <LayoutGrid className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="font-mono text-xs text-muted-foreground font-semibold tracking-wide truncate">
                DEAL MANAGEMENT
              </span>
            </div>
          )}
          {collapsed && (
            <LayoutGrid className="h-4 w-4 text-amber-500" />
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-2 px-1.5 space-y-0.5 overflow-y-auto">
          {navLinks()}
        </nav>

        {/* Bottom actions */}
        <div className="border-t border-border p-1.5 space-y-1">
          {!collapsed && (
            <div className="px-1 pb-1">
              <CommandPalette />
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center text-muted-foreground hover:text-muted-foreground hover:bg-muted/50 h-8"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <>
                <ChevronLeft className="h-3.5 w-3.5 mr-1.5" />
                <span className="font-mono text-[10px] tracking-wide">COLLAPSE</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </TooltipProvider>
  )
}
