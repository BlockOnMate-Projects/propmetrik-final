'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    LayoutGrid,
    Users,
    Building2,
    CheckSquare,
    Settings,
    BarChart3,
    Home,
    UserCircle,
    Workflow,
    FolderKanban
} from 'lucide-react'

const crmNavItems = [
    { href: '/dashboard/deals', label: 'DEALS', icon: LayoutGrid, exact: true },
    { href: '/dashboard/deals/properties', label: 'PROPERTIES', icon: Home },
    { href: '/dashboard/deals/contacts', label: 'CONTACTS', icon: Users },
    { href: '/dashboard/deals/agents', label: 'AGENTS', icon: UserCircle },
    { href: '/dashboard/deals/companies', label: 'COMPANIES', icon: Building2 },
    { href: '/dashboard/deals/projects', label: 'PROJECTS', icon: FolderKanban },
    { href: '/dashboard/deals/tasks', label: 'TASKS', icon: CheckSquare },
    { href: '/dashboard/deals/analytics', label: 'ANALYTICS', icon: BarChart3 },
    { href: '/dashboard/deals/workflows', label: 'WORKFLOWS', icon: Workflow },
    { href: '/dashboard/deals/pipelines', label: 'PIPELINES', icon: Settings },
]

export default function DealsLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const pathname = usePathname()

    const isActive = (item: typeof crmNavItems[0]) => {
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
                        {crmNavItems.map((item) => {
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
