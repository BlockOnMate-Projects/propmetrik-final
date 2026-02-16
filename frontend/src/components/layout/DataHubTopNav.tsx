
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    LayoutDashboard,
    BarChart3,
    CheckCircle,
    GitBranch,
    Zap,
    BookOpen,
    Lightbulb,
    Database,
    Activity,
    Users,
    DollarSign,
    Building2,
    Layers,
    Settings,
    Calendar
} from 'lucide-react'

const navigation = [
    { name: 'OVERVIEW', href: '/dashboard/admin/data-hub', exact: true, icon: LayoutDashboard },
    { name: 'ANALYTICS', href: '/dashboard/admin/data-hub/analytics', icon: BarChart3 },
    { name: 'QUALITY', href: '/dashboard/admin/data-hub/quality', icon: CheckCircle },
    { name: 'LINEAGE', href: '/dashboard/admin/data-hub/lineage', icon: GitBranch },
    { name: 'PERFORMANCE', href: '/dashboard/admin/data-hub/performance', icon: Zap },
    { name: 'CATALOG', href: '/dashboard/admin/data-hub/catalog', icon: BookOpen },
    { name: 'INSIGHTS', href: '/dashboard/admin/data-hub/insights', icon: Lightbulb },
    { name: 'SOURCES', href: '/dashboard/admin/data-hub/sources', icon: Database },
    { name: 'JOBS', href: '/dashboard/admin/data-hub/jobs', icon: Activity },
    { name: 'CONTRIBUTIONS', href: '/dashboard/admin/data-hub/contributions', icon: Users },
    { name: 'ECONOMIC', href: '/dashboard/admin/data-hub/economic', icon: DollarSign },
    { name: 'CONSTRUCTION', href: '/dashboard/admin/data-hub/construction', icon: Building2 },
    { name: 'INGESTION', href: '/dashboard/admin/data-hub/ingestion', icon: Layers },
    { name: 'CALENDAR', href: '/dashboard/calendar?service=data-hub', icon: Calendar },
    { name: 'VALUATION CONFIG', href: '/dashboard/admin/data-hub/valuation-config', icon: Settings },
]

export function DataHubTopNav() {
    const pathname = usePathname()

    return (
        <div className="w-full bg-black border-b border-zinc-800">
            <div className="flex items-center h-10 px-4 gap-1 overflow-x-auto scrollbar-hide">
                {navigation.map((item) => {
                    const isActive = item.exact
                        ? pathname === item.href
                        : pathname.startsWith(item.href)

                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                'flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono font-medium transition-all min-w-max',
                                isActive
                                    ? 'bg-amber-500 text-black font-bold'
                                    : 'text-amber-500/70 hover:text-amber-500 hover:bg-amber-950/30'
                            )}
                        >
                            <item.icon className={cn("w-3 h-3", isActive ? "text-black" : "text-amber-600")} />
                            {item.name}
                        </Link>
                    )
                })}
            </div>
            <div className="h-0.5 w-full bg-gradient-to-r from-amber-900/50 via-amber-500/20 to-amber-900/50" />
        </div>
    )
}
