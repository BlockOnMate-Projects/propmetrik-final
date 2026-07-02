'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { canAccessServiceSubTab, canCustomerAccessSubTab } from '@/lib/rbac'
import {
    BarChart3,
    Map,
    Users,
    Settings,
    Hammer,
    Home,
    FileSearch,
    Brain,
    ShieldAlert,
    Building2,
    LineChart,
    Landmark,
    Briefcase,
    LayoutGrid,
} from 'lucide-react'

// Main analytics categories (left-to-right). SERVICES is a submenu whose page
// shows a combined summary of all service analytics.
const analyticsNavItems = [
    { href: '/dashboard/analytics', label: 'MARKET', icon: BarChart3, exact: true, subTabKey: 'analytics-market' },
    { href: '/dashboard/analytics/construction', label: 'CONSTRUCTION', icon: Hammer, subTabKey: 'analytics-construction' },
    { href: '/dashboard/analytics/affordability', label: 'AFFORDABILITY', icon: Home, subTabKey: 'analytics-affordability' },
    { href: '/dashboard/analytics/ml', label: 'ML MODELS', icon: Brain, subTabKey: 'analytics-ml' },
    { href: '/dashboard/analytics/risk', label: 'RISK', icon: ShieldAlert, subTabKey: 'analytics-risk' },
    { href: '/dashboard/analytics/short-stay', label: 'SHORT-STAY', icon: Building2, subTabKey: 'analytics-short-stay' },
    { href: '/dashboard/analytics/forecasting', label: 'FORECASTING', icon: LineChart, subTabKey: 'analytics-forecasting' },
    { href: '/dashboard/analytics/geographic', label: 'GEOGRAPHIC', icon: Map, subTabKey: 'analytics-geographic' },
    { href: '/dashboard/analytics/demand', label: 'DEMAND', icon: Users, subTabKey: 'analytics-demand' },
    { href: '/dashboard/analytics/services', label: 'SERVICES', icon: Briefcase, services: true },
    { href: '/dashboard/analytics/settings', label: 'SETTINGS', icon: Settings, subTabKey: 'analytics-settings' },
    { href: '/dashboard/analytics/team', label: 'TEAM', icon: Users, subTabKey: 'analytics-team' },
]

// The combined-summary landing + the per-service drill-downs (top-right toggle
// shown while inside the SERVICES area).
const serviceTabs = [
    { href: '/dashboard/analytics/services', label: 'SUMMARY', icon: LayoutGrid, summary: true },
    { href: '/dashboard/analytics/valuations', label: 'VALUATION', icon: FileSearch, subTabKey: 'analytics-valuations' },
    { href: '/dashboard/analytics/crm', label: 'CRM', icon: Users, subTabKey: 'analytics-crm' },
    { href: '/dashboard/analytics/management', label: 'MANAGEMENT', icon: Landmark, subTabKey: 'analytics-management' },
]

const SERVICE_ROUTES = [
    '/dashboard/analytics/services',
    '/dashboard/analytics/valuations',
    '/dashboard/analytics/crm',
    '/dashboard/analytics/management',
]

export default function AnalyticsLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const pathname = usePathname()
    const { data: session } = useSession()

    const userRole = session?.user?.role || ''
    const userType = (session?.user as any)?.userType || 'staff'
    const customerServiceRole = (session?.user as any)?.customerServiceRoles?.analytics as string | undefined

    const canSee = (subTabKey?: string) =>
        !subTabKey ? true : userType === 'customer'
            ? canCustomerAccessSubTab(customerServiceRole, 'analytics', subTabKey)
            : canAccessServiceSubTab(userRole, 'analytics', subTabKey)

    const roleLoaded = Boolean(userRole || customerServiceRole)

    // Services the user may drill into (excludes the always-available SUMMARY).
    const visibleServiceTabs = serviceTabs.filter(t => t.summary || !roleLoaded || canSee(t.subTabKey))
    const hasAnyService = visibleServiceTabs.some(t => !t.summary)

    const visibleNavItems = analyticsNavItems.filter(item =>
        !roleLoaded ? true : item.services ? hasAnyService : canSee(item.subTabKey),
    )

    const onServiceRoute = SERVICE_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))

    const isActive = (href: string, exact?: boolean, services?: boolean) => {
        if (services) return onServiceRoute
        if (exact) return pathname === href
        return pathname === href || pathname.startsWith(href + '/')
    }

    return (
        <div className="flex flex-col h-full">
            {/* Analytics Sub Navigation */}
            <div className="border-b border-border bg-card/30">
                <div className="px-4">
                    <nav className="flex items-center gap-1 py-1 overflow-x-auto no-scrollbar">
                        {visibleNavItems.map((item) => {
                            const Icon = item.icon
                            const active = isActive(item.href, (item as any).exact, (item as any).services)
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        'flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] tracking-wider transition-colors whitespace-nowrap',
                                        active
                                            ? 'text-amber-500 bg-muted/50'
                                            : 'text-muted-foreground hover:text-muted-foreground hover:bg-amber-50 dark:hover:bg-amber-500/10'
                                    )}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    {item.label}
                                </Link>
                            )
                        })}
                    </nav>
                </div>
            </div>

            {/* Services sub-navigation (top-right) — only while inside the SERVICES area */}
            {onServiceRoute && (
                <div className="border-b border-border bg-muted/20">
                    <div className="px-4 flex items-center justify-between gap-2 py-1">
                        <span className="font-mono text-[10px] text-muted-foreground tracking-wider flex items-center gap-1.5">
                            <Briefcase className="w-3.5 h-3.5 text-amber-500" />
                            SERVICE ANALYTICS
                        </span>
                        <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                            {visibleServiceTabs.map((tab) => {
                                const Icon = tab.icon
                                const active = tab.summary
                                    ? pathname === tab.href
                                    : pathname === tab.href || pathname.startsWith(tab.href + '/')
                                return (
                                    <Link
                                        key={tab.href}
                                        href={tab.href}
                                        className={cn(
                                            'flex items-center gap-1.5 px-3 py-1 font-mono text-[10px] tracking-wider border transition-colors whitespace-nowrap',
                                            active
                                                ? 'text-amber-500 border-amber-500/40 bg-amber-500/10'
                                                : 'text-muted-foreground border-border hover:text-amber-500 hover:border-amber-500/40'
                                        )}
                                    >
                                        <Icon className="w-3.5 h-3.5" />
                                        {tab.label}
                                    </Link>
                                )
                            })}
                        </nav>
                    </div>
                </div>
            )}

            {/* Page Content */}
            <div className="flex-1 overflow-auto">
                {children}
            </div>
        </div>
    )
}
