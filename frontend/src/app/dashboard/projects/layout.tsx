'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
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
    ListOrdered,
    FileStack,
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
}

const projectsNavGroups: NavGroup[] = [
    {
        label: 'OVERVIEW',
        icon: LayoutDashboard,
        items: [
            { href: '/dashboard/projects', label: 'Summary', icon: LayoutDashboard, exact: true },
            { href: '/dashboard/projects/schedule', label: 'Timeline', icon: ListOrdered },
            { href: '/dashboard/calendar?service=projects', label: 'Calendar', icon: Calendar },
            { href: '/dashboard/projects/team', label: 'Team', icon: Users },
        ],
    },
    {
        label: 'CONSTRUCTION',
        icon: Hammer,
        items: [
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
        items: [
            { href: '/dashboard/projects/bidding', label: 'Bidding', icon: Gavel },
            { href: '/dashboard/projects/procurement', label: 'Contracts', icon: FileStack },
            { href: '/dashboard/projects/contractors', label: 'Contractors', icon: Hammer },
        ],
    },
    {
        label: 'FINANCIALS',
        icon: DollarSign,
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
        items: [
            { href: '/dashboard/projects/documents', label: 'Files', icon: FileText },
            { href: '/dashboard/projects/meetings', label: 'Meetings', icon: MessageSquare },
            { href: '/dashboard/projects/closeout', label: 'Closeout', icon: CheckSquare },
        ],
    },
    {
        label: 'UNITS',
        icon: Layers,
        items: [
            { href: '/dashboard/projects/units', label: 'Units', icon: Layers },
        ],
    },
    {
        label: 'ANALYTICS',
        icon: BarChart3,
        items: [
            { href: '/dashboard/projects/analytics', label: 'Analytics', icon: BarChart3 },
            { href: '/dashboard/projects/audit-log', label: 'Audit Log', icon: ScrollText },
            { href: '/dashboard/projects/integrations-marketplace', label: 'Integrations', icon: Plug },
        ],
    },
    {
        label: 'SETTINGS',
        icon: Settings,
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

function findActiveGroup(pathname: string): NavGroup {
    // Find the group whose child matches the current path
    const match = projectsNavGroups.find(g =>
        g.items.some(item => isItemActive(item, pathname))
    )
    return match || projectsNavGroups[0]
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
    const activeGroup = findActiveGroup(pathname)

    return (
        <div className="min-h-screen bg-black">
            {/* Row 1: Group tabs */}
            <div className="border-b border-zinc-800 bg-zinc-900/50">
                <div className="px-2 sm:px-4">
                    <nav className="flex gap-0 -mb-px overflow-x-auto scrollbar-none">
                        {projectsNavGroups.map((group) => {
                            const isActive = group.label === activeGroup.label
                            const Icon = group.icon
                            return (
                                <Link
                                    key={group.label}
                                    href={group.items[0].href}
                                    className={cn(
                                        'flex items-center gap-1.5 px-3 sm:px-4 py-2.5 font-mono text-[9px] sm:text-[10px] tracking-wider border-b-2 transition-colors whitespace-nowrap',
                                        isActive
                                            ? 'border-amber-500 text-amber-500'
                                            : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                                    )}
                                >
                                    <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                    <span>{group.label}</span>
                                </Link>
                            )
                        })}
                    </nav>
                </div>
            </div>

            {/* Row 2: Sub-items of the active group (only if group has > 1 item) */}
            {activeGroup.items.length > 1 && (
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
