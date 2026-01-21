'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
    Briefcase,
    Building2,
    Users,
    CheckSquare,
    TrendingUp,
    Clock,
    AlertCircle,
    ChevronRight,
    Loader2,
    Calendar,
    DollarSign
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

interface AgentStats {
    activeDeals: number
    totalDealsValue: number
    closedDealsThisMonth: number
    totalCommission: number
    tasksDueToday: number
    overdueTask: number
    totalContacts: number
    propertiesCount: number
}

interface RecentDeal {
    id: string
    title: string
    deal_value: number
    stage_name: string
    stage_color: string
    primary_contact_name: string
    updated_at: string
}

interface UpcomingTask {
    id: string
    title: string
    due_date: string
    priority: string
    deal_title?: string
}

interface RecentActivity {
    id: string
    activity_type: string
    title: string
    description: string
    activity_date: string
    deal_title?: string
}

// Helper to format currency
function formatCurrency(amount: number, currency: string = 'GHS'): string {
    return new Intl.NumberFormat('en-GH', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount)
}

// Panel component
function Panel({ title, children, className, action }: { 
    title: string; 
    children: React.ReactNode; 
    className?: string;
    action?: React.ReactNode;
}) {
    return (
        <div className={cn('border border-zinc-800 bg-zinc-900/50', className)}>
            <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-800">
                <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
                {action}
            </div>
            <div className="p-3">{children}</div>
        </div>
    )
}

export default function AgentDashboard() {
    const [isLoading, setIsLoading] = useState(true)
    const [agentContext, setAgentContext] = useState<any>(null)
    const [stats, setStats] = useState<AgentStats>({
        activeDeals: 0,
        totalDealsValue: 0,
        closedDealsThisMonth: 0,
        totalCommission: 0,
        tasksDueToday: 0,
        overdueTask: 0,
        totalContacts: 0,
        propertiesCount: 0
    })
    const [recentDeals, setRecentDeals] = useState<RecentDeal[]>([])
    const [upcomingTasks, setUpcomingTasks] = useState<UpcomingTask[]>([])
    const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])

    useEffect(() => {
        const loadDashboard = async () => {
            try {
                const storedContext = localStorage.getItem('agentContext')
                if (!storedContext) return
                
                const context = JSON.parse(storedContext)
                setAgentContext(context)

                // Load agent dashboard data
                const headers = {
                    'Content-Type': 'application/json',
                    'X-User-Id': context.userId,
                    'X-Organization-Id': context.orgId
                }

                // Fetch agent's deals
                const dealsRes = await fetch(
                    `${API_BASE}/crm/deals?assigned_agent=${context.agentId}&limit=5`,
                    { headers }
                )
                const dealsData = dealsRes.ok ? await dealsRes.json() : { data: [] }
                const deals = dealsData.data || []

                // Calculate stats from deals
                const activeDeals = deals.filter((d: any) => d.deal_status === 'active')
                const totalValue = activeDeals.reduce((sum: number, d: any) => sum + (d.deal_value || 0), 0)

                // Fetch agent's tasks
                const tasksRes = await fetch(
                    `${API_BASE}/crm/tasks?assigned_to=${context.userId}&status=pending&limit=5`,
                    { headers }
                )
                const tasksData = tasksRes.ok ? await tasksRes.json() : { data: [] }
                const tasks = tasksData.data || tasksData || []

                // Set stats
                setStats({
                    activeDeals: activeDeals.length,
                    totalDealsValue: totalValue,
                    closedDealsThisMonth: deals.filter((d: any) => d.deal_status === 'won').length,
                    totalCommission: deals.reduce((sum: number, d: any) => sum + (d.commission_amount || 0), 0),
                    tasksDueToday: Array.isArray(tasks) ? tasks.filter((t: any) => {
                        const dueDate = new Date(t.due_date)
                        const today = new Date()
                        return dueDate.toDateString() === today.toDateString()
                    }).length : 0,
                    overdueTask: Array.isArray(tasks) ? tasks.filter((t: any) => {
                        const dueDate = new Date(t.due_date)
                        return dueDate < new Date()
                    }).length : 0,
                    totalContacts: 0,
                    propertiesCount: 0
                })

                // Set recent deals
                setRecentDeals(deals.slice(0, 5).map((d: any) => ({
                    id: d.id,
                    title: d.title,
                    deal_value: d.deal_value,
                    stage_name: d.stage_name,
                    stage_color: d.stage_color,
                    primary_contact_name: d.primary_contact_name,
                    updated_at: d.updated_at
                })))

                // Set upcoming tasks
                setUpcomingTasks(Array.isArray(tasks) ? tasks.slice(0, 5).map((t: any) => ({
                    id: t.id,
                    title: t.title,
                    due_date: t.due_date,
                    priority: t.priority,
                    deal_title: t.deal_title
                })) : [])

            } catch (err) {
                console.error('Failed to load dashboard:', err)
            } finally {
                setIsLoading(false)
            }
        }

        loadDashboard()
    }, [])

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Welcome Header */}
            <div>
                <h1 className="font-mono text-xl text-white">
                    Welcome back, {agentContext?.agentName?.split(' ')[0] || 'Agent'}
                </h1>
                <p className="font-mono text-xs text-zinc-500 mt-1">
                    Here's an overview of your sales activity
                </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-500/20 rounded flex items-center justify-center">
                                <Briefcase className="h-5 w-5 text-blue-500" />
                            </div>
                            <div>
                                <p className="font-mono text-2xl text-white">{stats.activeDeals}</p>
                                <p className="font-mono text-[10px] text-zinc-500">ACTIVE DEALS</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-green-500/20 rounded flex items-center justify-center">
                                <DollarSign className="h-5 w-5 text-green-500" />
                            </div>
                            <div>
                                <p className="font-mono text-lg text-green-400">{formatCurrency(stats.totalDealsValue)}</p>
                                <p className="font-mono text-[10px] text-zinc-500">PIPELINE VALUE</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-amber-500/20 rounded flex items-center justify-center">
                                <CheckSquare className="h-5 w-5 text-amber-500" />
                            </div>
                            <div>
                                <p className="font-mono text-2xl text-white">{stats.tasksDueToday}</p>
                                <p className="font-mono text-[10px] text-zinc-500">TASKS TODAY</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                'w-10 h-10 rounded flex items-center justify-center',
                                stats.overdueTask > 0 ? 'bg-red-500/20' : 'bg-zinc-700/20'
                            )}>
                                <AlertCircle className={cn(
                                    'h-5 w-5',
                                    stats.overdueTask > 0 ? 'text-red-500' : 'text-zinc-500'
                                )} />
                            </div>
                            <div>
                                <p className={cn(
                                    'font-mono text-2xl',
                                    stats.overdueTask > 0 ? 'text-red-400' : 'text-white'
                                )}>
                                    {stats.overdueTask}
                                </p>
                                <p className="font-mono text-[10px] text-zinc-500">OVERDUE</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Recent Deals */}
                <div className="lg:col-span-2">
                    <Panel 
                        title="MY ACTIVE DEALS" 
                        action={
                            <Link href="/agent/deals">
                                <Button variant="ghost" size="sm" className="h-6 px-2 text-amber-500 hover:text-amber-400">
                                    View All <ChevronRight className="h-3 w-3 ml-1" />
                                </Button>
                            </Link>
                        }
                    >
                        {recentDeals.length === 0 ? (
                            <div className="text-center py-8">
                                <Briefcase className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                                <p className="font-mono text-xs text-zinc-500">No active deals</p>
                                <p className="font-mono text-[10px] text-zinc-600 mt-1">
                                    Deals assigned to you will appear here
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {recentDeals.map((deal) => (
                                    <Link key={deal.id} href={`/agent/deals/${deal.id}`}>
                                        <div className="flex items-center justify-between p-3 bg-zinc-800/50 border border-zinc-700 hover:border-amber-500/50 transition-colors cursor-pointer">
                                            <div className="flex-1">
                                                <p className="font-mono text-xs text-white">{deal.title}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span 
                                                        className="font-mono text-[9px] px-1.5 py-0.5"
                                                        style={{ 
                                                            backgroundColor: `${deal.stage_color}20`,
                                                            color: deal.stage_color
                                                        }}
                                                    >
                                                        {deal.stage_name}
                                                    </span>
                                                    {deal.primary_contact_name && (
                                                        <span className="font-mono text-[10px] text-zinc-500">
                                                            {deal.primary_contact_name}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-mono text-sm text-green-400">
                                                    {deal.deal_value ? formatCurrency(deal.deal_value) : '—'}
                                                </p>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </Panel>
                </div>

                {/* Upcoming Tasks */}
                <div>
                    <Panel 
                        title="UPCOMING TASKS" 
                        action={
                            <Link href="/agent/tasks">
                                <Button variant="ghost" size="sm" className="h-6 px-2 text-amber-500 hover:text-amber-400">
                                    View All <ChevronRight className="h-3 w-3 ml-1" />
                                </Button>
                            </Link>
                        }
                    >
                        {upcomingTasks.length === 0 ? (
                            <div className="text-center py-8">
                                <CheckSquare className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                                <p className="font-mono text-xs text-zinc-500">No pending tasks</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {upcomingTasks.map((task) => {
                                    const isOverdue = new Date(task.due_date) < new Date()
                                    return (
                                        <div 
                                            key={task.id}
                                            className="p-2 bg-zinc-800/50 border border-zinc-700"
                                        >
                                            <p className="font-mono text-xs text-white">{task.title}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={cn(
                                                    'font-mono text-[9px]',
                                                    isOverdue ? 'text-red-400' : 'text-zinc-500'
                                                )}>
                                                    <Calendar className="h-3 w-3 inline mr-1" />
                                                    {new Date(task.due_date).toLocaleDateString('en-GB', { 
                                                        day: 'numeric', 
                                                        month: 'short' 
                                                    })}
                                                </span>
                                                <span className={cn(
                                                    'font-mono text-[9px] px-1 py-0.5',
                                                    task.priority === 'urgent' && 'bg-red-900/50 text-red-400',
                                                    task.priority === 'high' && 'bg-orange-900/50 text-orange-400',
                                                    task.priority === 'medium' && 'bg-yellow-900/50 text-yellow-400',
                                                    task.priority === 'low' && 'bg-zinc-700/50 text-zinc-400'
                                                )}>
                                                    {task.priority?.toUpperCase()}
                                                </span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </Panel>
                </div>
            </div>

            {/* Quick Actions */}
            <Panel title="QUICK ACTIONS">
                <div className="flex flex-wrap gap-2">
                    <Link href="/agent/deals">
                        <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:text-white hover:border-amber-500">
                            <Briefcase className="h-4 w-4 mr-2" />
                            View Deals
                        </Button>
                    </Link>
                    <Link href="/agent/tasks">
                        <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:text-white hover:border-amber-500">
                            <CheckSquare className="h-4 w-4 mr-2" />
                            Manage Tasks
                        </Button>
                    </Link>
                    <Link href="/agent/contacts">
                        <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:text-white hover:border-amber-500">
                            <Users className="h-4 w-4 mr-2" />
                            Contacts
                        </Button>
                    </Link>
                    <Link href="/agent/properties">
                        <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:text-white hover:border-amber-500">
                            <Building2 className="h-4 w-4 mr-2" />
                            Properties
                        </Button>
                    </Link>
                </div>
            </Panel>
        </div>
    )
}
