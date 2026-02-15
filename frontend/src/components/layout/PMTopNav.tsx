
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const navigation = [
    { name: 'OVERVIEW', href: '/dashboard/property-management', exact: true, key: '1' },
    { name: 'PROPERTIES', href: '/dashboard/property-management/properties', key: '2' },
    { name: 'MESSAGES', href: '/dashboard/property-management/messages', key: '3' },
    { name: 'PORTFOLIOS', href: '/dashboard/property-management/portfolios', key: '4' },
    { name: 'APPLICATIONS', href: '/dashboard/property-management/applications', key: '5' },
    { name: 'TENANTS', href: '/dashboard/property-management/tenants', key: '6' },
    { name: 'MAINTENANCE', href: '/dashboard/property-management/maintenance', key: '7' },
    { name: 'DOCUMENTS', href: '/dashboard/property-management/documents', key: '8' },
    { name: 'VENDORS', href: '/dashboard/property-management/vendors', key: '9' },
    { name: 'FINANCIALS', href: '/dashboard/property-management/financials', key: '10' },
    { name: 'CALENDAR', href: '/dashboard/calendar', key: '0' },
]

export function PMTopNav() {
    const pathname = usePathname()

    return (
        <div className="w-full bg-black border-b border-zinc-800">
            <div className="flex items-center h-10 px-4 gap-1 overflow-x-auto">
                {navigation.map((item) => {
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
                                    ? 'bg-amber-500 text-black font-bold'
                                    : 'text-amber-500/70 hover:text-amber-500 hover:bg-amber-950/30'
                            )}
                        >
                            <span className={cn("mr-2 opacity-50", isActive ? "text-black" : "text-amber-600")}>
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
