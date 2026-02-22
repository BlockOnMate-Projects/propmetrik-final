'use client'

import React, { useState, useCallback, useRef } from 'react'
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
    FileText,
    Calendar,
    DollarSign,
    Keyboard,
    Menu,
    X,
    MessageSquare,
} from 'lucide-react'
import { CommandPalette } from '@/components/crm/CommandPalette'
import { useKeyboardShortcuts, KeyboardShortcutsHelp } from '@/components/crm/KeyboardShortcuts'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const crmNavItems = [
    { href: '/dashboard/deals', label: 'Deals', icon: LayoutGrid, exact: true },
    { href: '/dashboard/deals/properties', label: 'Properties', icon: Home },
    { href: '/dashboard/deals/contacts', label: 'Contacts', icon: Users },
    { href: '/dashboard/deals/agents', label: 'Agents', icon: UserCircle },
    { href: '/dashboard/deals/companies', label: 'Companies', icon: Building2 },
    { href: '/dashboard/deals/tasks', label: 'Tasks', icon: CheckSquare },
    { href: '/dashboard/deals/documents', label: 'Documents', icon: FileText },
    { href: '/dashboard/deals/financials', label: 'Financials', icon: DollarSign },
    { href: '/dashboard/deals/messaging', label: 'Messaging', icon: MessageSquare },
    { href: '/dashboard/calendar?service=deals', label: 'Calendar', icon: Calendar },
    { href: '/dashboard/deals/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/dashboard/deals/workflows', label: 'Workflows', icon: Workflow },
    { href: '/dashboard/deals/pipelines', label: 'Pipelines', icon: Settings },
]

export default function DealsLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const pathname = usePathname()
    const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false)
    const [mobileNavOpen, setMobileNavOpen] = useState(false)

    useKeyboardShortcuts({
        onShowHelp: () => setShortcutsHelpOpen(true),
    })

    const isActive = (item: typeof crmNavItems[0]) => {
        if (item.exact) {
            return pathname === item.href
        }
        return pathname.startsWith(item.href)
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Sub-navigation */}
            <div className="border-b border-border bg-card/50">
                <div className="px-4 flex items-center justify-between">
                    {/* Mobile hamburger */}
                    <button
                        className="md:hidden p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
                        onClick={() => setMobileNavOpen(!mobileNavOpen)}
                    >
                        {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </button>

                    {/* Desktop tabs */}
                    <nav className="hidden md:flex gap-1 -mb-px overflow-x-auto flex-1">
                        {crmNavItems.map((item) => {
                            const Icon = item.icon
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                                        isActive(item)
                                            ? 'border-primary text-primary'
                                            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                                    )}
                                >
                                    <Icon className="h-4 w-4" />
                                    <span className="hidden lg:inline">{item.label}</span>
                                </Link>
                            )
                        })}
                    </nav>

                    {/* Mobile active tab label */}
                    <span className="md:hidden text-sm font-medium text-foreground flex-1 text-center truncate">
                        {crmNavItems.find(i => isActive(i))?.label || 'CRM'}
                    </span>

                    <div className="flex items-center gap-2 pl-4 -mb-px py-2">
                        <div className="hidden sm:block"><CommandPalette /></div>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="hidden sm:flex h-9 w-9 p-0 text-muted-foreground"
                                        onClick={() => setShortcutsHelpOpen(true)}
                                    >
                                        <Keyboard className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Keyboard shortcuts (?)</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                </div>
            </div>

            {/* Mobile drawer */}
            {mobileNavOpen && (
                <>
                    <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileNavOpen(false)} />
                    <nav className="md:hidden fixed inset-y-0 left-0 w-64 bg-card z-50 shadow-2xl overflow-y-auto animate-in slide-in-from-left duration-200">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                            <span className="text-sm font-semibold">CRM Navigation</span>
                            <button onClick={() => setMobileNavOpen(false)} className="p-1 rounded hover:bg-accent">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="py-2">
                            {crmNavItems.map((item) => {
                                const Icon = item.icon
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={() => setMobileNavOpen(false)}
                                        className={cn(
                                            'flex items-center gap-3 px-4 py-3 text-sm transition-colors',
                                            isActive(item)
                                                ? 'bg-primary/10 text-primary font-medium'
                                                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                        )}
                                    >
                                        <Icon className="h-4 w-4" />
                                        {item.label}
                                    </Link>
                                )
                            })}
                        </div>
                    </nav>
                </>
            )}
            
            {/* Content */}
            <div className="p-2 sm:p-4 pb-10">
                {children}
            </div>

            {/* Keyboard Shortcuts Help */}
            <KeyboardShortcutsHelp open={shortcutsHelpOpen} onOpenChange={setShortcutsHelpOpen} />
        </div>
    )
}
