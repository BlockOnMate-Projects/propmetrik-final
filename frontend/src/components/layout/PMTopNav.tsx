
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { canAccessServiceSubTab, canCustomerAccessSubTab } from '@/lib/rbac'

const navigation = [
    { name: 'OVERVIEW', href: '/dashboard/property-management', exact: true, key: '1', subTabKey: 'propmgmt-overview' },
    { name: 'PROPERTIES', href: '/dashboard/property-management/properties', key: '2', subTabKey: 'propmgmt-properties' },
    { name: 'MESSAGES', href: '/dashboard/property-management/messages', key: '3', subTabKey: 'propmgmt-messages' },
    { name: 'PORTFOLIOS', href: '/dashboard/property-management/portfolios', key: '4', subTabKey: 'propmgmt-portfolios' },
    { name: 'APPLICATIONS', href: '/dashboard/property-management/applications', key: '5', subTabKey: 'propmgmt-applications' },
    { name: 'TENANTS', href: '/dashboard/property-management/tenants', key: '6', subTabKey: 'propmgmt-tenants' },
    { name: 'MAINTENANCE', href: '/dashboard/property-management/maintenance', key: '7', subTabKey: 'propmgmt-maintenance' },
    { name: 'DOCUMENTS', href: '/dashboard/property-management/documents', key: '8', subTabKey: 'propmgmt-documents' },
    { name: 'VENDORS', href: '/dashboard/property-management/vendors', key: '9', subTabKey: 'propmgmt-vendors' },
    { name: 'FINANCIALS', href: '/dashboard/property-management/financials', key: '10', subTabKey: 'propmgmt-financials' },
    { name: 'CALENDAR', href: '/dashboard/calendar?service=property-management', key: '0', subTabKey: 'propmgmt-calendar' },
    { name: 'TEAM', href: '/dashboard/property-management/team', key: 'T', subTabKey: 'propmgmt-team' },
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
        <div className="w-full bg-black border-b border-zinc-800">
            <div className="flex items-center h-10 px-4 gap-1 overflow-x-auto">
                {visibleNavItems.map((item) => {
                    // Check for active state
                    const isActive = item.exact
                        ? pathname === item.href
                        : pathname.startsWith(item.href)

                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                'flex items-center px-4 py-1.5 text-[11px] font-mono font-medium transition-all min-w-max',
                                isActive
                                    ? 'bg-amber-500 text-white font-bold'
                                    : 'text-amber-500/70 hover:text-amber-500 hover:bg-amber-950/30'
                            )}
                        >
                            <span className={cn("mr-2 opacity-50", isActive ? "text-white" : "text-amber-600")}>
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
