'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useSession } from 'next-auth/react'
import { canAccessValuationTab } from '@/lib/rbac'
import {
    FileText,
    Settings,
    BarChart3,
    Calendar,
    Users,
    Receipt,
    Building2,
} from 'lucide-react'

const valuationsNavItems = [
    { href: '/dashboard/valuations', label: 'VALUATIONS', icon: FileText, exact: true, tabKey: 'valuations' },
    { href: '/dashboard/valuations/team', label: 'TEAM', icon: Users, tabKey: 'team' },
    { href: '/dashboard/valuations/finance', label: 'FINANCE', icon: Receipt, tabKey: 'finance' },
    { href: '/dashboard/valuations/clients', label: 'CLIENTS', icon: Building2, tabKey: 'clients' },
    { href: '/dashboard/calendar?service=valuations', label: 'CALENDAR', icon: Calendar, tabKey: 'calendar' },
    { href: '/dashboard/valuations/analytics', label: 'ANALYTICS', icon: BarChart3, tabKey: 'analytics' },
    { href: '/dashboard/valuations/settings', label: 'SETTINGS', icon: Settings, tabKey: 'settings' },
]

export default function ValuationsLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const pathname = usePathname()
    const { data: session, status } = useSession()
    const [mounted, setMounted] = useState(false)

    useEffect(() => { setMounted(true) }, [])

    const sessionReady = mounted && status === 'authenticated'
    const userRole = session?.user?.role || ''

    // Filter sub-tabs based on user role (only after mount + session to avoid hydration mismatch)
    const visibleNavItems = sessionReady
        ? valuationsNavItems.filter(item => canAccessValuationTab(userRole, item.tabKey))
        : valuationsNavItems

    const isActive = (href: string, exact?: boolean) => {
        if (exact) {
            return pathname === href
        }
        return pathname.startsWith(href)
    }

    return (
        <div className="flex flex-col h-full">
            {/* Valuations Sub Navigation */}
            <div className="border-b border-zinc-800 bg-zinc-900/30">
                <div className="px-4">
                    <nav className="flex items-center gap-1 py-1 overflow-x-auto no-scrollbar">
                        {visibleNavItems.map((item) => {
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
