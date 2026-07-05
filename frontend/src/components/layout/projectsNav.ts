'use client'

/**
 * Shared navigation model for Project Management. This is the SINGLE source of truth
 * for both the top-level section tabs (ProjectsTopNav) and each section's sub-nav
 * (ProjectsSectionNav) — mirroring the Property Management pattern (PMTopNav +
 * PMSectionNav + subTabStyles) so the two services look and behave identically:
 *
 *   Row 1 (ProjectsTopNav)     → the GROUP labels (OVERVIEW · CONSTRUCTION · …), numbered
 *   Row 2 (ProjectsSectionNav) → the active group's ITEMS (Summary · Team, Schedule · Drawings · …)
 *
 * RBAC + tier gating (role sub-tab access + feature locks) live in the shared
 * `useVisibleProjectGroups` hook so both rows stay in lock-step.
 */

import { useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { canAccessFeature, canAccessServiceSubTab, canCustomerAccessSubTab } from '@/lib/rbac'
import {
    Users,
    DollarSign,
    ClipboardList,
    Hammer,
    BarChart3,
    Settings,
    Layers,
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
    Send,
    LayoutDashboard,
    FileStack,
    GanttChartSquare,
} from 'lucide-react'

export type NavItem = {
    href: string
    label: string
    icon: React.ComponentType<{ className?: string }>
    exact?: boolean
}

export type NavGroup = {
    label: string
    /** Keyboard-shortcut style badge shown before the label (matches PM's numbered tabs). */
    key: string
    icon: React.ComponentType<{ className?: string }>
    items: NavItem[]
    /** Feature gate key in rbac.ts featureGates — used for role + tier gating. */
    featureKey?: string
}

export type VisibleGroup = NavGroup & { locked: boolean }

export const projectsNavGroups: NavGroup[] = [
    {
        label: 'OVERVIEW',
        key: '1',
        icon: LayoutDashboard,
        featureKey: 'pm-overview',
        items: [
            { href: '/dashboard/projects', label: 'Summary', icon: LayoutDashboard, exact: true },
            { href: '/dashboard/projects/team', label: 'Team', icon: Users },
        ],
    },
    {
        label: 'CONSTRUCTION',
        key: '2',
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
        key: '3',
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
        key: '4',
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
        key: '5',
        icon: FileText,
        featureKey: 'pm-documents',
        items: [
            { href: '/dashboard/projects/documents', label: 'Files', icon: FileText },
            { href: '/dashboard/projects/meetings', label: 'Meetings', icon: MessageSquare },
            { href: '/dashboard/projects/closeout', label: 'Closeout', icon: CheckSquare },
        ],
    },
    {
        label: 'COMMUNICATIONS',
        key: '6',
        icon: MessageSquare,
        featureKey: 'pm-communications',
        items: [
            { href: '/dashboard/projects/communications', label: 'Communications', icon: MessageSquare },
        ],
    },
    {
        label: 'UNITS',
        key: '7',
        icon: Layers,
        featureKey: 'pm-units',
        items: [
            { href: '/dashboard/projects/units', label: 'Units', icon: Layers },
        ],
    },
    {
        label: 'ANALYTICS',
        key: '8',
        icon: BarChart3,
        featureKey: 'pm-analytics',
        items: [
            { href: '/dashboard/projects/analytics', label: 'Analytics', icon: BarChart3 },
            { href: '/dashboard/projects/audit-log', label: 'Audit Log', icon: ScrollText },
        ],
    },
    {
        label: 'SETTINGS',
        key: 'N',
        icon: Settings,
        featureKey: 'pm-settings',
        items: [
            { href: '/dashboard/projects/settings', label: 'Settings', icon: Settings },
        ],
    },
]

export function isItemActive(item: NavItem, pathname: string): boolean {
    if (item.exact) return pathname === item.href
    return pathname === item.href || pathname.startsWith(item.href + '/')
}

/** The active group is the one whose child page matches the current path (fallback: first group). */
export function findActiveGroup(pathname: string, groups: VisibleGroup[]): VisibleGroup | undefined {
    return groups.find((g) => g.items.some((item) => isItemActive(item, pathname))) || groups[0]
}

/**
 * Role- + tier-aware list of project nav groups. Shared by both nav rows so they
 * never drift. Shows all groups until the session loads (avoids hydration flash),
 * then filters by service sub-tab access and flags tier-locked groups.
 */
export function useVisibleProjectGroups(): VisibleGroup[] {
    const { data: session } = useSession()

    const userRole = session?.user?.role || ''
    const userTier = session?.user?.tier || 'starter'
    const userType = (session?.user as any)?.userType || 'staff'
    const customerServiceRole = (session?.user as any)?.customerServiceRoles?.projects as string | undefined

    return useMemo(() => {
        return projectsNavGroups
            .filter((group) => {
                if (!userRole && !customerServiceRole) return true
                if (!group.featureKey) return true
                if (userType === 'customer') {
                    // Fall back to the user's primary role when no explicit customer service-role
                    // is granted, so a subscribed customer still gets the module.
                    return canCustomerAccessSubTab(customerServiceRole || userRole, 'projects', group.featureKey)
                }
                return canAccessServiceSubTab(userRole, 'projects', group.featureKey)
            })
            .map((group) => ({
                ...group,
                locked: group.featureKey
                    ? !canAccessFeature(userRole, userTier, group.featureKey, userType)
                    : false,
            }))
    }, [userRole, userTier, userType, customerServiceRole])
}
