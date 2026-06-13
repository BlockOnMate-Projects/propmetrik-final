'use client'

import React, { useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { canAccessFeature, canAccessServiceSubTab, canCustomerAccessSubTab } from '@/lib/rbac'
import {
    FolderKanban,
    Users,
    DollarSign,
    ClipboardList,
    Hammer,
    BarChart3,
    Settings,
    Layers,
    Calendar,
    CreditCard,
    FileText,
    PieChart,
    AlertTriangle,
    Pencil,
    MessageSquare,
    ShieldAlert,
    Clock,
    Truck,
    Gavel,
    CheckSquare,
    ScrollText,
    Plug,
    Send,
    LayoutDashboard,
    FileStack,
    GanttChartSquare,
    Lock,
}  from 'lucide-react'

/* ---------------------------------------------------------- */
/*  Grouped navigation structure                              */
/* ---------------------------------------------------------- */

type NavItem = {
    href: string
    label: string
    icon: React.ComponentType<{ className?: string }>
    exact?: boolean
}

type NavGroup = {
    label: string
    icon: React.ComponentType<{ className?: string }>
    items: NavItem[]
    /** Feature gate key in rbac.ts featureGates — used for tier gating */
    featureKey?: string
}

const projectsNavGroups: NavGroup[] = [
    {
        label: 'OVERVIEW',
        icon: LayoutDashboard,
        featureKey: 'pm-overview',
        items: [
            { href: '/dashboard/projects', label: 'Summary', icon: LayoutDashboard, exact: true },
            { href: '/dashboard/projects/team', label: 'Team', icon: Users },
        ],
    },
    {
        label: 'CONSTRUCTION',
        icon: Hammer,
        featureKey: 'pm-construction',
        items: [
            { href: '/dashboard/projects/gantt', label: 'Schedule', icon: GanttChartSquare },
            { href: '/dashboard/projects/drawings', label: 'Drawings', icon: Pencil },
            { href: '/dashboard/projects/issues', label: 'Issues', icon: AlertTriangle },
            { href: '/dashboard/projects/punch-lists', label: 'Punch Lists', icon: ClipboardList },
            { href: '/dashboard/projects/safety', label: 'Safety', icon: ShieldAlert },
            { href: '/dashboard/projects/equipment', label: 'Equipment', icon: Truck },
            { href: '/dashboard/projects/transmittals', label: 'Transmittals', icon: Send },
        ],
    },
    {
        label: 'PROCUREMENT',
        icon: Gavel,
        featureKey: 'pm-procurement',
        items: [
            { href: '/dashboard/projects/bids', label: 'Bid Management', icon: Gavel },
            { href: '/dashboard/projects/bidding', label: 'Bidding', icon: Gavel },
            { href: '/dashboard/projects/procurement', label: 'Contracts', icon: FileStack },
            { href: '/dashboard/projects/contractors', label: 'Contractors', icon: Hammer },
        ],
    },
    {
        label: 'FINANCIALS',
        icon: DollarSign,
        featureKey: 'pm-financials',
        items: [
            { href: '/dashboard/projects/costs', label: 'Costs', icon: DollarSign },
            { href: '/dashboard/projects/financials', label: 'Budget', icon: CreditCard },
            { href: '/dashboard/projects/invoice-builder', label: 'Invoice', icon: Send },
            { href: '/dashboard/projects/cost-estimator', label: 'Estimator', icon: PieChart },
            { href: '/dashboard/projects/timesheets', label: 'Timesheets', icon: Clock },
            { href: '/dashboard/projects/reports', label: 'Reports', icon: BarChart3 },
            { href: '/dashboard/projects/payment-settings', label: 'Payment Settings', icon: CreditCard },
        ],
    },
    {
        label: 'DOCUMENTS',
        icon: FileText,
        featureKey: 'pm-documents',
        items: [
            { href: '/dashboard/projects/documents', label: 'Files', icon: FileText },
            { href: '/dashboard/projects/meetings', label: 'Meetings', icon: MessageSquare },
            { href: '/dashboard/projects/closeout', label: 'Closeout', icon: CheckSquare },
        ],
    },
    {
        label: 'UNITS',
        icon: Layers,
        featureKey: 'pm-units',
        items: [
            { href: '/dashboard/projects/units', label: 'Units', icon: Layers },
        ],
    },
    {
        label: 'ANALYTICS',
        icon: BarChart3,
        featureKey: 'pm-analytics',
        items: [
            { href: '/dashboard/projects/analytics', label: 'Analytics', icon: BarChart3 },
            { href: '/dashboard/projects/audit-log', label: 'Audit Log', icon: ScrollText },
            { href: '/dashboard/projects/integrations-marketplace', label: 'Integrations', icon: Plug },
        ],
    },
    {
        label: 'SETTINGS',
        icon: Settings,
        featureKey: 'pm-settings',
        items: [
            { href: '/dashboard/projects/settings', label: 'Settings', icon: Settings },
        ],
    },
]

/* ---------------------------------------------------------- */
/*  Helpers                                                   */
/* ---------------------------------------------------------- */

function isItemActive(item: NavItem, pathname: string) {
    if (item.exact) return pathname === item.href
    return pathname.startsWith(item.href)
}

function findActiveGroup(pathname: string, groups: NavGroup[]): NavGroup {
    // Find the group whose child matches the current path
    const match = groups.find(g =>
        g.items.some(item => isItemActive(item, pathname))
    )
    return match || groups[0]
}

/* ---------------------------------------------------------- */
/*  Layout                                                    */
/* ---------------------------------------------------------- */

export default function ProjectsLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const pathname = usePathname()
    const { data: session } = useSession()

    const userRole = session?.user?.role || ''
    const userTier = session?.user?.tier || 'starter'
    const userType = (session?.user as any)?.userType || 'staff'
    const customerServiceRole = (session?.user as any)?.customerServiceRoles?.projects as string | undefined

    // Filter groups by role access + tier access (show all until session loads)
    const visibleGroups = useMemo(() => {
        return projectsNavGroups
            .filter(group => {
                if (!userRole && !customerServiceRole) return true
                if (!group.featureKey) return true
                if (userType === 'customer') {
                    // Fall back to the user's primary role when no explicit customer
                    // service-role is granted, so a customer whose role is e.g.
                    // project_manager (and who is subscribed to projects) still gets
                    // the module instead of an empty, broken nav.
                    return canCustomerAccessSubTab(customerServiceRole || userRole, 'projects', group.featureKey)
                }
                return canAccessServiceSubTab(userRole, 'projects', group.featureKey)
            })
            .map(group => ({
                ...group,
                locked: group.featureKey
                    ? !canAccessFeature(userRole, userTier, group.featureKey, userType)
                    : false,
            }))
    }, [userRole, userTier, userType, customerServiceRole])

    const activeGroup = findActiveGroup(pathname, visibleGroups)

    return (
        // `dark` scopes shadcn's dark CSS tokens to the (already dark) PM terminal so
        // theme-variable components — notably `variant="outline"` buttons (bg-background)
        // and default Card/Popover/Input surfaces — render dark-on-light instead of
        // white-on-white (previously invisible until hover). --primary is identical in
        // light/dark, so the blue/orange CTAs are unaffected.
        <div className="dark min-h-screen bg-black">
            {/* Row 1: Group tabs */}
            <div className="border-b border-zinc-800 bg-zinc-900/50">
                <div className="px-2 sm:px-4">
                    <nav className="flex gap-0 -mb-px overflow-x-auto scrollbar-none">
                        {visibleGroups.map((group) => {
                            const isActive = group.label === activeGroup?.label
                            const Icon = group.icon
                            const isLocked = 'locked' in group && group.locked
                            return (
                                <Link
                                    key={group.label}
                                    href={isLocked ? '#' : group.items[0].href}
                                    onClick={isLocked ? (e) => e.preventDefault() : undefined}
                                    className={cn(
                                        'flex items-center gap-1.5 px-3 sm:px-4 py-2.5 font-mono text-[9px] sm:text-[10px] tracking-wider border-b-2 transition-colors whitespace-nowrap',
                                        isLocked
                                            ? 'border-transparent text-zinc-700 cursor-not-allowed'
                                            : isActive
                                            ? 'border-amber-500 text-amber-500'
                                            : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                                    )}
                                >
                                    <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                    <span>{group.label}</span>
                                    {isLocked && <Lock className="h-2.5 w-2.5 ml-0.5 text-zinc-600" />}
                                </Link>
                            )
                        })}
                    </nav>
                </div>
            </div>

            {/* Row 2: Sub-items of the active group (only if group has > 1 item) */}
            {activeGroup && activeGroup.items.length > 1 && (
                <div className="border-b border-zinc-800/60 bg-zinc-950/80">
                    <div className="px-2 sm:px-4">
                        <nav className="flex gap-0 -mb-px overflow-x-auto scrollbar-none">
                            {activeGroup.items.map((item) => {
                                const Icon = item.icon
                                const active = isItemActive(item, pathname)
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={cn(
                                            'flex items-center gap-1.5 px-3 sm:px-4 py-2 font-mono text-[9px] sm:text-[10px] tracking-wide border-b-2 transition-colors whitespace-nowrap',
                                            active
                                                ? 'border-amber-500/70 text-amber-400'
                                                : 'border-transparent text-zinc-600 hover:text-zinc-400 hover:border-zinc-700'
                                        )}
                                    >
                                        <Icon className="h-3 w-3" />
                                        <span>{item.label}</span>
                                    </Link>
                                )
                            })}
                        </nav>
                    </div>
                </div>
            )}

            {/* Content */}
            <div className="p-2 sm:p-4 pb-10">
                {children}
            </div>
        </div>
    )
}
