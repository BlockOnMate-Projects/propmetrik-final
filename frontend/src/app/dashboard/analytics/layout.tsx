'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
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
} from 'lucide-react'

const analyticsNavItems = [
    { href: '/dashboard/analytics', label: 'MARKET', icon: BarChart3, exact: true },
    { href: '/dashboard/analytics/construction', label: 'CONSTRUCTION', icon: Hammer },
    { href: '/dashboard/analytics/affordability', label: 'AFFORDABILITY', icon: Home },
    { href: '/dashboard/analytics/valuations', label: 'VALUATIONS', icon: FileSearch },
    { href: '/dashboard/analytics/ml', label: 'ML MODELS', icon: Brain },
    { href: '/dashboard/analytics/risk', label: 'RISK', icon: ShieldAlert },
    { href: '/dashboard/analytics/short-stay', label: 'SHORT-STAY', icon: Building2 },
    { href: '/dashboard/analytics/forecasting', label: 'FORECASTING', icon: LineChart },
    { href: '/dashboard/analytics/crm', label: 'CRM', icon: Users },
    { href: '/dashboard/analytics/geographic', label: 'GEOGRAPHIC', icon: Map },
    { href: '/dashboard/analytics/management', label: 'MANAGEMENT', icon: Landmark },
    { href: '/dashboard/analytics/settings', label: 'SETTINGS', icon: Settings },
]

export default function AnalyticsLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const pathname = usePathname()

    const isActive = (href: string, exact?: boolean) => {
        if (exact) {
            return pathname === href
        }
        return pathname.startsWith(href)
    }

    return (
        <div className="flex flex-col h-full">
            {/* Analytics Sub Navigation */}
            <div className="border-b border-zinc-800 bg-zinc-900/30">
                <div className="px-4">
                    <nav className="flex items-center gap-1 py-1 overflow-x-auto no-scrollbar">
                        {analyticsNavItems.map((item) => {
                            const Icon = item.icon
                            const active = isActive(item.href, item.exact)
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        'flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] tracking-wider transition-colors whitespace-nowrap',
                                        active
                                            ? 'text-amber-500 bg-zinc-800/50'
                                            : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
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

            {/* Page Content */}
            <div className="flex-1 overflow-auto">
                {children}
            </div>
        </div>
    )
}
