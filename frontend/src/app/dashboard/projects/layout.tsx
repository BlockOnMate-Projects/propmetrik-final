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
    Building2,
    Layers,
    Calendar,
    CreditCard
} from 'lucide-react'

const projectsNavItems = [
    { href: '/dashboard/projects', label: 'PROJECTS', icon: FolderKanban, exact: true },
    { href: '/dashboard/projects/units', label: 'UNITS', icon: Layers },
    { href: '/dashboard/projects/contractors', label: 'CONTRACTORS', icon: Hammer },
    { href: '/dashboard/projects/costs', label: 'COSTS', icon: DollarSign },
    { href: '/dashboard/projects/financials', label: 'FINANCIALS', icon: CreditCard },
    { href: '/dashboard/projects/punch-lists', label: 'PUNCH LISTS', icon: ClipboardList },
    { href: '/dashboard/calendar', label: 'CALENDAR', icon: Calendar },
    { href: '/dashboard/projects/analytics', label: 'ANALYTICS', icon: BarChart3 },
    { href: '/dashboard/projects/settings', label: 'SETTINGS', icon: Settings },
]

export default function ProjectsLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const pathname = usePathname()

    const isActive = (item: typeof projectsNavItems[0]) => {
        if (item.exact) {
            return pathname === item.href
        }
        return pathname.startsWith(item.href)
    }

    return (
        <div className="min-h-screen bg-black">
            {/* Sub-navigation */}
            <div className="border-b border-zinc-800 bg-zinc-900/50">
                <div className="px-4">
                    <nav className="flex gap-1 -mb-px overflow-x-auto">
                        {projectsNavItems.map((item) => {
                            const Icon = item.icon
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        'flex items-center gap-2 px-4 py-3 font-mono text-[10px] tracking-wider border-b-2 transition-colors whitespace-nowrap',
                                        isActive(item)
                                            ? 'border-amber-500 text-amber-500'
                                            : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                                    )}
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                    {item.label}
                                </Link>
                            )
                        })}
                    </nav>
                </div>
            </div>
            
            {/* Content */}
            <div className="p-4 pb-10">
                {children}
            </div>
        </div>
    )
}
