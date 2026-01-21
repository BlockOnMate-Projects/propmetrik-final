'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    CheckSquare,
    Circle,
    Clock,
    Calendar,
    AlertCircle,
    Loader2,
    Plus,
    Filter,
    CheckCircle2,
    ChevronRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

interface Task {
    id: string
    title: string
    description: string
    due_date: string
    priority: string
    task_status: string
    task_type: string
    deal_id: string
    deal_title: string
    created_at: string
}

export default function AgentTasksPage() {
    const router = useRouter()
    const [tasks, setTasks] = useState<Task[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [statusFilter, setStatusFilter] = useState('pending')
    const [priorityFilter, setPriorityFilter] = useState('')
    const [agentContext, setAgentContext] = useState<any>(null)

    useEffect(() => {
        loadTasks()
    }, [router, statusFilter])

    const loadTasks = async () => {
        try {
            const storedContext = localStorage.getItem('agentContext')
            if (!storedContext) {
                router.push('/agent/login')
                return
            }

            const context = JSON.parse(storedContext)
            setAgentContext(context)
            
            let url = `${API_BASE}/crm/tasks?assigned_to=${context.userId}`
            if (statusFilter) {
                url += `&status=${statusFilter}`
            }

            const res = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Id': context.userId,
                    'X-Organization-Id': context.orgId
                }
            })

            if (res.ok) {
                const data = await res.json()
                const tasksList = data.tasks || data.data || data || []
                setTasks(Array.isArray(tasksList) ? tasksList : [])
            }
        } catch (err) {
            console.error('Failed to load tasks:', err)
        } finally {
            setIsLoading(false)
        }
    }

    const handleCompleteTask = async (taskId: string) => {
        if (!agentContext) return

        try {
            const res = await fetch(`${API_BASE}/crm/tasks/${taskId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Id': agentContext.userId,
                    'X-Organization-Id': agentContext.orgId
                },
                body: JSON.stringify({
                    task_status: 'completed',
                    completed_at: new Date().toISOString()
                })
            })

            if (res.ok) {
                // Remove from list or update status
                setTasks(tasks.map(t => 
                    t.id === taskId ? { ...t, task_status: 'completed' } : t
                ))
            }
        } catch (err) {
            console.error('Failed to complete task:', err)
        }
    }

    const isOverdue = (dueDate: string): boolean => {
        if (!dueDate) return false
        return new Date(dueDate) < new Date() && new Date(dueDate).toDateString() !== new Date().toDateString()
    }

    const isDueToday = (dueDate: string): boolean => {
        if (!dueDate) return false
        return new Date(dueDate).toDateString() === new Date().toDateString()
    }

    const filteredTasks = tasks.filter(task => {
        const matchesPriority = !priorityFilter || task.priority === priorityFilter
        return matchesPriority
    })

    // Group tasks by date
    const overdueTasks = filteredTasks.filter(t => t.task_status !== 'completed' && isOverdue(t.due_date))
    const todayTasks = filteredTasks.filter(t => t.task_status !== 'completed' && isDueToday(t.due_date))
    const upcomingTasks = filteredTasks.filter(t => 
        t.task_status !== 'completed' && !isOverdue(t.due_date) && !isDueToday(t.due_date)
    )
    const completedTasks = filteredTasks.filter(t => t.task_status === 'completed')

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
        )
    }

    const TaskCard = ({ task }: { task: Task }) => (
        <div className="flex items-start gap-3 p-3 bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors">
            <button
                onClick={() => handleCompleteTask(task.id)}
                className={cn(
                    'mt-0.5 transition-colors',
                    task.task_status === 'completed' ? 'text-green-500' : 'text-zinc-500 hover:text-amber-500'
                )}
            >
                {task.task_status === 'completed' ? (
                    <CheckCircle2 className="h-5 w-5" />
                ) : (
                    <Circle className="h-5 w-5" />
                )}
            </button>
            <div className="flex-1 min-w-0">
                <p className={cn(
                    'font-mono text-sm',
                    task.task_status === 'completed' ? 'text-zinc-500 line-through' : 'text-white'
                )}>
                    {task.title}
                </p>
                {task.description && (
                    <p className="font-mono text-[10px] text-zinc-500 mt-1 line-clamp-2">{task.description}</p>
                )}
                <div className="flex items-center gap-3 mt-2">
                    {task.due_date && (
                        <div className={cn(
                            'flex items-center gap-1 font-mono text-[10px]',
                            isOverdue(task.due_date) && task.task_status !== 'completed' && 'text-red-400',
                            isDueToday(task.due_date) && task.task_status !== 'completed' && 'text-amber-400',
                            !isOverdue(task.due_date) && !isDueToday(task.due_date) && 'text-zinc-500',
                            task.task_status === 'completed' && 'text-zinc-600'
                        )}>
                            <Calendar className="h-3 w-3" />
                            {new Date(task.due_date).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'short'
                            })}
                        </div>
                    )}
                    {task.priority && (
                        <span className={cn(
                            'font-mono text-[9px] px-1.5 py-0.5',
                            task.priority === 'urgent' && 'bg-red-900/50 text-red-400',
                            task.priority === 'high' && 'bg-orange-900/50 text-orange-400',
                            task.priority === 'medium' && 'bg-yellow-900/50 text-yellow-400',
                            task.priority === 'low' && 'bg-zinc-700/50 text-zinc-400'
                        )}>
                            {task.priority.toUpperCase()}
                        </span>
                    )}
                    {task.deal_title && (
                        <Link 
                            href={`/agent/deals/${task.deal_id}`}
                            className="font-mono text-[10px] text-amber-500 hover:underline truncate"
                        >
                            {task.deal_title}
                        </Link>
                    )}
                </div>
            </div>
        </div>
    )

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="font-mono text-lg text-white">MY TASKS</h1>
                    <p className="font-mono text-xs text-zinc-500">Stay on top of your activities</p>
                </div>
            </div>

            {/* Quick Filters */}
            <div className="flex gap-2 flex-wrap">
                {['pending', 'in_progress', 'completed', ''].map((status) => (
                    <button
                        key={status}
                        onClick={() => {
                            setStatusFilter(status)
                            setIsLoading(true)
                        }}
                        className={cn(
                            'px-3 py-1.5 font-mono text-xs border transition-colors',
                            statusFilter === status
                                ? 'bg-amber-500 border-amber-500 text-black'
                                : 'bg-transparent border-zinc-700 text-zinc-400 hover:border-zinc-500'
                        )}
                    >
                        {status === '' ? 'All' : status.replace('_', ' ').toUpperCase()}
                    </button>
                ))}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-3">
                <div className="bg-zinc-900/50 border border-zinc-800 p-3">
                    <div className="font-mono text-[10px] text-zinc-500">OVERDUE</div>
                    <div className="font-mono text-xl text-red-400">{overdueTasks.length}</div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 p-3">
                    <div className="font-mono text-[10px] text-zinc-500">DUE TODAY</div>
                    <div className="font-mono text-xl text-amber-400">{todayTasks.length}</div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 p-3">
                    <div className="font-mono text-[10px] text-zinc-500">UPCOMING</div>
                    <div className="font-mono text-xl text-white">{upcomingTasks.length}</div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 p-3">
                    <div className="font-mono text-[10px] text-zinc-500">COMPLETED</div>
                    <div className="font-mono text-xl text-green-400">{completedTasks.length}</div>
                </div>
            </div>

            {/* Task Groups */}
            <div className="space-y-6">
                {/* Overdue */}
                {overdueTasks.length > 0 && (
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <AlertCircle className="h-4 w-4 text-red-400" />
                            <span className="font-mono text-xs text-red-400">OVERDUE ({overdueTasks.length})</span>
                        </div>
                        <div className="space-y-2">
                            {overdueTasks.map(task => (
                                <TaskCard key={task.id} task={task} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Today */}
                {todayTasks.length > 0 && (
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <Clock className="h-4 w-4 text-amber-400" />
                            <span className="font-mono text-xs text-amber-400">DUE TODAY ({todayTasks.length})</span>
                        </div>
                        <div className="space-y-2">
                            {todayTasks.map(task => (
                                <TaskCard key={task.id} task={task} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Upcoming */}
                {upcomingTasks.length > 0 && (
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <Calendar className="h-4 w-4 text-zinc-400" />
                            <span className="font-mono text-xs text-zinc-400">UPCOMING ({upcomingTasks.length})</span>
                        </div>
                        <div className="space-y-2">
                            {upcomingTasks.map(task => (
                                <TaskCard key={task.id} task={task} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Completed (show if filter is completed) */}
                {statusFilter === 'completed' && completedTasks.length > 0 && (
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <CheckCircle2 className="h-4 w-4 text-green-400" />
                            <span className="font-mono text-xs text-green-400">COMPLETED ({completedTasks.length})</span>
                        </div>
                        <div className="space-y-2">
                            {completedTasks.map(task => (
                                <TaskCard key={task.id} task={task} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Empty State */}
                {tasks.length === 0 && (
                    <div className="text-center py-10 border border-dashed border-zinc-700 rounded">
                        <CheckSquare className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
                        <p className="font-mono text-sm text-zinc-500">No tasks found</p>
                    </div>
                )}
            </div>
        </div>
    )
}
