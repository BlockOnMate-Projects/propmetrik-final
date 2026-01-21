'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    LayoutDashboard,
    Briefcase,
    Building2,
    Users,
    CheckSquare,
    FileText,
    Settings,
    LogOut,
    User,
    Menu,
    X,
    ChevronDown,
    Bell
} from 'lucide-react'
import { Button } from '@/components/ui/button'

// API base URL
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

// Agent context type
interface AgentContext {
    userId: string
    orgId: string
    agentId: string
    agentName: string
    email: string
    role: string
}

// Navigation items for agent
const agentNavItems = [
    { href: '/agent', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/agent/deals', label: 'My Deals', icon: Briefcase },
    { href: '/agent/properties', label: 'Properties', icon: Building2 },
    { href: '/agent/contacts', label: 'Contacts', icon: Users },
    { href: '/agent/tasks', label: 'Tasks', icon: CheckSquare },
    { href: '/agent/documents', label: 'Documents', icon: FileText },
]

export default function AgentLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const pathname = usePathname()
    const router = useRouter()
    const [isSidebarOpen, setIsSidebarOpen] = useState(true)
    const [agentContext, setAgentContext] = useState<AgentContext | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [showUserMenu, setShowUserMenu] = useState(false)

    // Load agent context on mount
    useEffect(() => {
        const loadAgentContext = async () => {
            try {
                // In production, this would come from Keycloak JWT
                // For now, we'll use a development endpoint or localStorage
                const storedAgent = localStorage.getItem('agentContext')
                
                if (storedAgent) {
                    setAgentContext(JSON.parse(storedAgent))
                } else {
                    // Redirect to agent login if no context
                    router.push('/agent/login')
                    return
                }
            } catch (err) {
                console.error('Failed to load agent context:', err)
                router.push('/agent/login')
            } finally {
                setIsLoading(false)
            }
        }
        
        loadAgentContext()
    }, [router])

    const handleLogout = () => {
        localStorage.removeItem('agentContext')
        router.push('/agent/login')
    }

    if (isLoading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="animate-spin h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full" />
            </div>
        )
    }

    // Allow login page to render without context
    if (pathname === '/agent/login') {
        return children
    }

    return (
        <div className="min-h-screen bg-black text-white">
            {/* Top Navigation Bar */}
            <header className="fixed top-0 left-0 right-0 h-14 bg-zinc-900 border-b border-zinc-800 z-50">
                <div className="flex items-center justify-between h-full px-4">
                    {/* Left side */}
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className="text-zinc-400 hover:text-white"
                        >
                            {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                        </Button>
                        <Link href="/agent" className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-amber-500">PROPMETRIK</span>
                            <span className="font-mono text-xs text-zinc-500">AGENT</span>
                        </Link>
                    </div>

                    {/* Right side */}
                    <div className="flex items-center gap-4">
                        {/* Notifications */}
                        <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white relative">
                            <Bell className="h-5 w-5" />
                            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                        </Button>

                        {/* User Menu */}
                        <div className="relative">
                            <Button
                                variant="ghost"
                                onClick={() => setShowUserMenu(!showUserMenu)}
                                className="flex items-center gap-2 text-zinc-300 hover:text-white"
                            >
                                <div className="w-8 h-8 bg-amber-500/20 rounded-full flex items-center justify-center">
                                    <User className="h-4 w-4 text-amber-500" />
                                </div>
                                <span className="font-mono text-xs hidden sm:block">
                                    {agentContext?.agentName || 'Agent'}
                                </span>
                                <ChevronDown className="h-4 w-4" />
                            </Button>

                            {showUserMenu && (
                                <div className="absolute right-0 top-full mt-2 w-48 bg-zinc-900 border border-zinc-800 shadow-xl">
                                    <div className="p-3 border-b border-zinc-800">
                                        <p className="font-mono text-xs text-white">{agentContext?.agentName}</p>
                                        <p className="font-mono text-[10px] text-zinc-500">{agentContext?.email}</p>
                                    </div>
                                    <Link href="/agent/settings">
                                        <div className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 cursor-pointer">
                                            <Settings className="h-4 w-4 text-zinc-400" />
                                            <span className="font-mono text-xs text-zinc-300">Settings</span>
                                        </div>
                                    </Link>
                                    <div
                                        onClick={handleLogout}
                                        className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 cursor-pointer border-t border-zinc-800"
                                    >
                                        <LogOut className="h-4 w-4 text-red-400" />
                                        <span className="font-mono text-xs text-red-400">Logout</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Sidebar */}
            <aside className={cn(
                'fixed top-14 left-0 bottom-0 bg-zinc-900 border-r border-zinc-800 z-40 transition-all duration-300',
                isSidebarOpen ? 'w-56' : 'w-0 -translate-x-full'
            )}>
                <nav className="p-4 space-y-1">
                    {agentNavItems.map((item) => {
                        const isActive = pathname === item.href || 
                            (item.href !== '/agent' && pathname.startsWith(item.href))
                        const Icon = item.icon
                        
                        return (
                            <Link key={item.href} href={item.href}>
                                <div className={cn(
                                    'flex items-center gap-3 px-3 py-2 font-mono text-xs transition-colors',
                                    isActive
                                        ? 'bg-amber-500/10 text-amber-500 border-l-2 border-amber-500'
                                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                                )}>
                                    <Icon className="h-4 w-4" />
                                    <span>{item.label}</span>
                                </div>
                            </Link>
                        )
                    })}
                </nav>

                {/* Agent Stats (quick view) */}
                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-zinc-800">
                    <div className="grid grid-cols-2 gap-2">
                        <div className="bg-zinc-800/50 p-2 text-center">
                            <div className="font-mono text-lg text-amber-500">--</div>
                            <div className="font-mono text-[9px] text-zinc-500">DEALS</div>
                        </div>
                        <div className="bg-zinc-800/50 p-2 text-center">
                            <div className="font-mono text-lg text-green-400">--</div>
                            <div className="font-mono text-[9px] text-zinc-500">TASKS</div>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className={cn(
                'pt-14 min-h-screen transition-all duration-300',
                isSidebarOpen ? 'pl-56' : 'pl-0'
            )}>
                <div className="p-6">
                    {children}
                </div>
            </main>
        </div>
    )
}
