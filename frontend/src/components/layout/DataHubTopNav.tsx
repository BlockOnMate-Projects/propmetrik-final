
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    LayoutDashboard,
    BarChart3,
    Database,
    Users,
    DollarSign,
    Building2,
    Calendar,
} from 'lucide-react'

const navigation = [
    { name: 'OVERVIEW', href: '/dashboard/admin/data-hub', exact: true, icon: LayoutDashboard, alsoMatchPaths: ['/dashboard/admin/data-hub/performance'] },
    { name: 'ANALYTICS', href: '/dashboard/admin/data-hub/analytics', icon: BarChart3, alsoMatchPaths: ['/dashboard/admin/data-hub/insights'] },
    { name: 'SOURCES', href: '/dashboard/admin/data-hub/sources', icon: Database, alsoMatchPaths: ['/dashboard/admin/data-hub/jobs', '/dashboard/admin/data-hub/ingestion', '/dashboard/admin/data-hub/catalog', '/dashboard/admin/data-hub/lineage', '/dashboard/admin/data-hub/quality'] },
    { name: 'CONTRIBUTIONS', href: '/dashboard/admin/data-hub/contributions', icon: Users },
    { name: 'ECONOMIC', href: '/dashboard/admin/data-hub/economic', icon: DollarSign },
    { name: 'CONSTRUCTION', href: '/dashboard/admin/data-hub/construction', icon: Building2, alsoMatchPaths: ['/dashboard/admin/data-hub/valuation-config'] },
    { name: 'CALENDAR', href: '/dashboard/calendar?service=data-hub', icon: Calendar },
]

export function DataHubTopNav() {
    const pathname = usePathname()

    return (
        <div className="w-full bg-background border-b border-border">
            <div className="flex items-center h-10 px-4 gap-1 overflow-x-auto scrollbar-hide">
                {navigation.map((item) => {
                    const isActive = item.exact
                        ? pathname === item.href
                        : pathname.startsWith(item.href) ||
                          ((item as any).alsoMatchPaths?.some((p: string) => pathname.startsWith(p)) ?? false)

                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                'flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono font-medium transition-all min-w-max',
                                isActive
                                    ? 'bg-amber-500 text-foreground font-bold'
                                    : 'text-amber-500/70 hover:text-amber-500 hover:bg-amber-950/30'
                            )}
                        >
                            <item.icon className={cn("w-3 h-3", isActive ? "text-foreground" : "text-amber-600")} />
                            {item.name}
                        </Link>
                    )
                })}
            </div>
            <div className="h-0.5 w-full bg-gradient-to-r from-amber-900/50 via-amber-500/20 to-amber-900/50" />
        </div>
    )
}
