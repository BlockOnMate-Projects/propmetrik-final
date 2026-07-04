
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { canAccessServiceSubTab, canCustomerAccessSubTab } from '@/lib/rbac'

// Top-level Management tabs. Enquiries, Inspections and Vendors are NOT top-level anymore —
// they live under their parent section's sub-nav (see PMSectionNav):
//   PROPERTIES  → Listings · Enquiries
//   MAINTENANCE → Work Orders · Inspections · Vendors
// `match` keeps a parent tab highlighted while one of its child pages is active.
const navigation = [
    { name: 'OVERVIEW', href: '/dashboard/property-management', exact: true, key: '1', subTabKey: 'propmgmt-overview' },
    { name: 'PROPERTIES', href: '/dashboard/property-management/properties', key: '2', subTabKey: 'propmgmt-properties', match: ['/dashboard/property-management/enquiries'] },
    { name: 'COMMUNICATIONS', href: '/dashboard/property-management/communications', key: '3', subTabKey: 'propmgmt-communications' },
    { name: 'PORTFOLIOS', href: '/dashboard/property-management/portfolios', key: '4', subTabKey: 'propmgmt-portfolios', match: ['/dashboard/property-management/reports', '/dashboard/property-management/audit', '/dashboard/property-management/bulk-operations'] },
    { name: 'APPLICATIONS', href: '/dashboard/property-management/applications', key: '5', subTabKey: 'propmgmt-applications' },
    { name: 'TENANTS', href: '/dashboard/property-management/tenants', key: '6', subTabKey: 'propmgmt-tenants' },
    { name: 'MAINTENANCE', href: '/dashboard/property-management/maintenance', key: '7', subTabKey: 'propmgmt-maintenance', match: ['/dashboard/property-management/inspections', '/dashboard/property-management/vendors'] },
    { name: 'DOCUMENTS', href: '/dashboard/property-management/documents', key: '8', subTabKey: 'propmgmt-documents' },
    { name: 'FINANCIALS', href: '/dashboard/property-management/financials', key: '10', subTabKey: 'propmgmt-financials' },
    { name: 'TEAM', href: '/dashboard/property-management/team', key: 'T', subTabKey: 'propmgmt-team' },
    { name: 'INTEGRATIONS', href: '/dashboard/property-management/integrations', key: 'N', subTabKey: 'propmgmt-integrations' },
]

export function PMTopNav() {
    const pathname = usePathname()
    const { data: session } = useSession()

    const userRole = session?.user?.role || ''
    const userType = (session?.user as any)?.userType || 'staff'
    const customerServiceRole = (session?.user as any)?.customerServiceRoles?.property_management as string | undefined

    // Show all until session loads to avoid hydration mismatch
    const visibleNavItems = userRole || customerServiceRole
        ? navigation.filter(item =>
            userType === 'customer'
              ? canCustomerAccessSubTab(customerServiceRole, 'property-management', item.subTabKey)
              : canAccessServiceSubTab(userRole, 'property-management', item.subTabKey)
          )
        : navigation

    return (
        <div className="w-full bg-background border-b border-border">
            <div className="flex items-center h-10 px-4 gap-1 overflow-x-auto">
                {visibleNavItems.map((item) => {
                    // Active when on the tab's own route or any of its child routes (match).
                    const isActive = item.exact
                        ? pathname === item.href
                        : pathname.startsWith(item.href) || ((item as any).match?.some((m: string) => pathname.startsWith(m)) ?? false)

                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                'flex items-center px-4 py-1.5 text-[11px] font-mono font-medium transition-all min-w-max',
                                isActive
                                    ? 'bg-amber-500 text-foreground font-bold'
                                    : 'text-amber-500/70 hover:text-amber-500 hover:bg-amber-950/30'
                            )}
                        >
                            <span className={cn("mr-2 opacity-50", isActive ? "text-foreground" : "text-amber-600")}>
                                {item.key}
                            </span>
                            {item.name}
                        </Link>
                    )
                })}
            </div>
            {/* Optional decorative bar to separate sub-nav from content */}
            <div className="h-0.5 w-full bg-gradient-to-r from-amber-900/50 via-amber-500/20 to-amber-900/50" />
        </div>
    )
}
