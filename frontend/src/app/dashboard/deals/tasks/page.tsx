'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
    Plus,
    Search,
    Loader2,
    CheckSquare,
    Clock,
    AlertTriangle,
    Calendar,
    User,
    Filter
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { tasksApi } from '@/lib/crm-api'
import type { Task, PaginatedResponse } from '@/types/crm'
import { TaskStatus, TaskPriority } from '@/types/crm'

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={cn('border border-zinc-800 bg-zinc-900/50', className)}>
            <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-800">
                <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
            </div>
            <div className="p-3">{children}</div>
        </div>
    )
}

function TaskRow({ task, onComplete }: { task: Task; onComplete: (id: string) => void }) {
    const getPriorityColor = (priority: TaskPriority) => {
        switch (priority) {
            case TaskPriority.URGENT: return 'bg-red-900/50 text-red-400 border-red-500'
            case TaskPriority.HIGH: return 'bg-orange-900/50 text-orange-400 border-orange-500'
            case TaskPriority.MEDIUM: return 'bg-yellow-900/50 text-yellow-400 border-yellow-500'
            case TaskPriority.LOW: return 'bg-zinc-700/50 text-zinc-400 border-zinc-500'
            default: return 'bg-zinc-700/50 text-zinc-400 border-zinc-500'
        }
    }

    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== TaskStatus.COMPLETED
    const isCompleted = task.status === TaskStatus.COMPLETED

    return (
        <div className={cn(
            'flex items-center gap-4 p-3 border border-zinc-700 bg-zinc-800/50 hover:border-zinc-600 transition-colors',
            isOverdue && 'border-l-2 border-l-red-500',
            isCompleted && 'opacity-60'
        )}>
            <Checkbox
                checked={isCompleted}
                onCheckedChange={() => !isCompleted && onComplete(task.id)}
                className="border-zinc-600 data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500"
            />
            
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className={cn(
                        'font-mono text-xs',
                        isCompleted ? 'text-zinc-500 line-through' : 'text-white'
                    )}>
                        {task.title}
                    </span>
                    <span className={cn('font-mono text-[9px] px-1.5 py-0.5', getPriorityColor(task.priority))}>
                        {task.priority?.toUpperCase()}
                    </span>
                    {isOverdue && (
                        <span className="font-mono text-[9px] px-1.5 py-0.5 bg-red-900/50 text-red-400 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            OVERDUE
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-4 mt-1">
                    {task.deal_title && (
                        <Link href={`/dashboard/deals/${task.deal_id}`} className="font-mono text-[10px] text-amber-500 hover:text-amber-400">
                            {task.deal_title}
                        </Link>
                    )}
                    {task.contact_name && (
                        <span className="font-mono text-[10px] text-zinc-500 flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {task.contact_name}
                        </span>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-3 text-right">
                {task.due_date && (
                    <span className={cn(
                        'font-mono text-[10px] flex items-center gap-1',
                        isOverdue ? 'text-red-400' : 'text-zinc-500'
                    )}>
                        <Calendar className="h-3 w-3" />
                        {new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                )}
                {task.assigned_to_name && (
                    <span className="font-mono text-[10px] text-zinc-500">
                        {task.assigned_to_name}
                    </span>
                )}
            </div>
        </div>
    )
}

export default function TasksPage() {
    const [tasks, setTasks] = useState<Task[]>([])
    const [overdueTasks, setOverdueTasks] = useState<Task[]>([])
    const [searchTerm, setSearchTerm] = useState('')
    const [statusFilter, setStatusFilter] = useState<string>('pending')
    const [priorityFilter, setPriorityFilter] = useState<string>('all')
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)

    // New task dialog
    const [showNewDialog, setShowNewDialog] = useState(false)
    const [newTask, setNewTask] = useState({ title: '', description: '', priority: TaskPriority.MEDIUM, due_date: '' })
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        const loadTasks = async () => {
            try {
                setIsLoading(true)
                setError(null)

                const [tasksData, overdueData] = await Promise.all([
                    tasksApi.getAll({
                        page,
                        limit: 50,
                        status: statusFilter !== 'all' ? statusFilter as TaskStatus : undefined,
                        priority: priorityFilter !== 'all' ? priorityFilter as TaskPriority : undefined
                    }),
                    tasksApi.getOverdue()
                ])

                setTasks(tasksData.data || [])
                setTotalPages(tasksData.pagination?.totalPages || 1)
                setOverdueTasks(overdueData)
            } catch (err) {
                console.error('Failed to load tasks:', err)
                setError('Failed to load tasks')
            } finally {
                setIsLoading(false)
            }
        }
        loadTasks()
    }, [page, statusFilter, priorityFilter])

    const handleComplete = async (id: string) => {
        try {
            await tasksApi.complete(id)
            setTasks(tasks.map(t => t.id === id ? { ...t, status: TaskStatus.COMPLETED } : t))
            setOverdueTasks(overdueTasks.filter(t => t.id !== id))
        } catch (err) {
            console.error('Failed to complete task:', err)
        }
    }

    const handleCreateTask = async () => {
        if (!newTask.title.trim()) return
        try {
            setIsSaving(true)
            const task = await tasksApi.create({
                title: newTask.title,
                description: newTask.description || undefined,
                priority: newTask.priority,
                due_date: newTask.due_date || undefined
            })
            setTasks([task, ...tasks])
            setShowNewDialog(false)
            setNewTask({ title: '', description: '', priority: TaskPriority.MEDIUM, due_date: '' })
        } catch (err) {
            console.error('Failed to create task:', err)
        } finally {
            setIsSaving(false)
        }
    }

    const filteredTasks = tasks.filter(task => {
        if (!searchTerm) return true
        return task.title.toLowerCase().includes(searchTerm.toLowerCase())
    })

    const pendingCount = tasks.filter(t => t.status === TaskStatus.PENDING).length
    const inProgressCount = tasks.filter(t => t.status === TaskStatus.IN_PROGRESS).length
    const completedCount = tasks.filter(t => t.status === TaskStatus.COMPLETED).length

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="font-mono text-xl text-white">TASKS</h1>
                    <p className="font-mono text-[10px] text-zinc-500">Track and manage your work items</p>
                </div>
                <Button onClick={() => setShowNewDialog(true)} className="bg-amber-500 text-black hover:bg-amber-400 font-mono text-xs">
                    <Plus className="h-4 w-4 mr-2" />
                    NEW TASK
                </Button>
            </div>

            {/* Stats */}
            <div className="grid gap-3 md:grid-cols-4">
                <Card className="bg-black border-zinc-800">
                    <CardContent className="p-3">
                        <div className="font-mono text-[10px] text-zinc-500 mb-1">OVERDUE</div>
                        <div className="font-mono text-xl text-red-400">{overdueTasks.length}</div>
                    </CardContent>
                </Card>
                <Card className="bg-black border-zinc-800">
                    <CardContent className="p-3">
                        <div className="font-mono text-[10px] text-zinc-500 mb-1">PENDING</div>
                        <div className="font-mono text-xl text-amber-500">{pendingCount}</div>
                    </CardContent>
                </Card>
                <Card className="bg-black border-zinc-800">
                    <CardContent className="p-3">
                        <div className="font-mono text-[10px] text-zinc-500 mb-1">IN PROGRESS</div>
                        <div className="font-mono text-xl text-blue-400">{inProgressCount}</div>
                    </CardContent>
                </Card>
                <Card className="bg-black border-zinc-800">
                    <CardContent className="p-3">
                        <div className="font-mono text-[10px] text-zinc-500 mb-1">COMPLETED</div>
                        <div className="font-mono text-xl text-green-400">{completedCount}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Overdue Alert */}
            {overdueTasks.length > 0 && (
                <Panel title="⚠️ OVERDUE TASKS">
                    <div className="space-y-2">
                        {overdueTasks.slice(0, 5).map(task => (
                            <TaskRow key={task.id} task={task} onComplete={handleComplete} />
                        ))}
                        {overdueTasks.length > 5 && (
                            <p className="font-mono text-[10px] text-zinc-500 text-center pt-2">
                                +{overdueTasks.length - 5} more overdue tasks
                            </p>
                        )}
                    </div>
                </Panel>
            )}

            {/* Filters */}
            <Panel title="FILTERS" className="!p-0">
                <div className="p-3 flex items-center gap-3 flex-wrap">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                        <Input
                            placeholder="Search tasks..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-8 bg-zinc-800 border-zinc-700 text-white font-mono text-xs h-9"
                        />
                    </div>

                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-36 bg-zinc-800 border-zinc-700 text-white font-mono text-xs">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                            <SelectItem value="all" className="font-mono text-xs text-white">All Status</SelectItem>
                            <SelectItem value="pending" className="font-mono text-xs text-white">Pending</SelectItem>
                            <SelectItem value="in_progress" className="font-mono text-xs text-white">In Progress</SelectItem>
                            <SelectItem value="completed" className="font-mono text-xs text-white">Completed</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                        <SelectTrigger className="w-36 bg-zinc-800 border-zinc-700 text-white font-mono text-xs">
                            <SelectValue placeholder="Priority" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                            <SelectItem value="all" className="font-mono text-xs text-white">All Priority</SelectItem>
                            <SelectItem value="urgent" className="font-mono text-xs text-white">Urgent</SelectItem>
                            <SelectItem value="high" className="font-mono text-xs text-white">High</SelectItem>
                            <SelectItem value="medium" className="font-mono text-xs text-white">Medium</SelectItem>
                            <SelectItem value="low" className="font-mono text-xs text-white">Low</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </Panel>

            {error && (
                <div className="border border-red-900 bg-red-900/20 p-4 text-center">
                    <p className="font-mono text-xs text-red-400">{error}</p>
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
                </div>
            ) : (
                <Panel title="ALL TASKS">
                    {filteredTasks.length === 0 ? (
                        <div className="text-center py-8">
                            <CheckSquare className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
                            <p className="font-mono text-sm text-zinc-500">No tasks found</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredTasks.map(task => (
                                <TaskRow key={task.id} task={task} onComplete={handleComplete} />
                            ))}
                        </div>
                    )}
                </Panel>
            )}

            {/* New Task Dialog */}
            <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
                <DialogContent className="bg-zinc-900 border-zinc-800">
                    <DialogHeader>
                        <DialogTitle className="font-mono text-white">New Task</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <Label className="font-mono text-[10px] text-zinc-500">TITLE *</Label>
                            <Input
                                value={newTask.title}
                                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                                placeholder="Task title..."
                                className="mt-1 bg-zinc-800 border-zinc-700 text-white font-mono text-xs"
                            />
                        </div>
                        <div>
                            <Label className="font-mono text-[10px] text-zinc-500">DESCRIPTION</Label>
                            <Textarea
                                value={newTask.description}
                                onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                                placeholder="Task description..."
                                className="mt-1 bg-zinc-800 border-zinc-700 text-white font-mono text-xs resize-none"
                                rows={3}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="font-mono text-[10px] text-zinc-500">PRIORITY</Label>
                                <Select value={newTask.priority} onValueChange={(v) => setNewTask({ ...newTask, priority: v as TaskPriority })}>
                                    <SelectTrigger className="mt-1 bg-zinc-800 border-zinc-700 text-white font-mono text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-900 border-zinc-700">
                                        <SelectItem value="low" className="font-mono text-xs text-white">Low</SelectItem>
                                        <SelectItem value="medium" className="font-mono text-xs text-white">Medium</SelectItem>
                                        <SelectItem value="high" className="font-mono text-xs text-white">High</SelectItem>
                                        <SelectItem value="urgent" className="font-mono text-xs text-white">Urgent</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="font-mono text-[10px] text-zinc-500">DUE DATE</Label>
                                <Input
                                    type="date"
                                    value={newTask.due_date}
                                    onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                                    className="mt-1 bg-zinc-800 border-zinc-700 text-white font-mono text-xs"
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowNewDialog(false)} className="border-zinc-700 text-zinc-300">Cancel</Button>
                        <Button onClick={handleCreateTask} disabled={!newTask.title.trim() || isSaving} className="bg-amber-500 text-black hover:bg-amber-400">
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Task'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
