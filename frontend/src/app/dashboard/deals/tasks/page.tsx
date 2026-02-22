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
import { EmptyState } from '@/components/crm/EmptyState'

function TaskRow({ task, onComplete }: { task: Task; onComplete: (id: string) => void }) {
    const getPriorityColor = (priority: TaskPriority) => {
        switch (priority) {
            case TaskPriority.URGENT: return 'bg-red-900/50 text-red-400 border-red-500'
            case TaskPriority.HIGH: return 'bg-orange-900/50 text-orange-400 border-orange-500'
            case TaskPriority.MEDIUM: return 'bg-yellow-900/50 text-yellow-400 border-yellow-500'
            case TaskPriority.LOW: return 'bg-muted text-muted-foreground border-border'
            default: return 'bg-muted text-muted-foreground border-border'
        }
    }

    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== TaskStatus.COMPLETED
    const isCompleted = task.status === TaskStatus.COMPLETED

    return (
        <div className={cn(
            'flex items-center gap-4 p-3 border border-border bg-card hover:border-primary/30 transition-colors rounded-md',
            isOverdue && 'border-l-2 border-l-red-500',
            isCompleted && 'opacity-60'
        )}>
            <Checkbox
                checked={isCompleted}
                onCheckedChange={() => !isCompleted && onComplete(task.id)}
                className="border-border data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500"
            />
            
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className={cn(
                        'text-sm font-medium',
                        isCompleted ? 'text-muted-foreground line-through' : 'text-foreground'
                    )}>
                        {task.title}
                    </span>
                    <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', getPriorityColor(task.priority))}>
                        {task.priority?.toUpperCase()}
                    </span>
                    {isOverdue && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 bg-red-900/50 text-red-400 flex items-center gap-1 rounded">
                            <AlertTriangle className="h-3 w-3" />
                            OVERDUE
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-4 mt-1">
                    {task.deal_title && (
                        <Link href={`/dashboard/deals/${task.deal_id}`} className="text-xs text-primary hover:text-primary/80">
                            {task.deal_title}
                        </Link>
                    )}
                    {task.contact_name && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {task.contact_name}
                        </span>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-3 text-right">
                {task.due_date && (
                    <span className={cn(
                        'text-xs flex items-center gap-1',
                        isOverdue ? 'text-red-400' : 'text-muted-foreground'
                    )}>
                        <Calendar className="h-3 w-3" />
                        {new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                )}
                {task.assigned_to_name && (
                    <span className="text-xs text-muted-foreground">
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
            <div className="flex items-center justify-between pb-4 border-b border-border">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tasks</h1>
                    <p className="text-sm text-muted-foreground mt-1">Track and manage your work items</p>
                </div>
                <Button onClick={() => setShowNewDialog(true)} className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-sm h-9 px-4 rounded-md shadow-sm">
                    <Plus className="h-4 w-4 mr-2" />
                    New Task
                </Button>
            </div>

            {/* Stats */}
            <div className="grid gap-3 md:grid-cols-4">
                <Card className="border-border shadow-sm">
                    <CardContent className="p-3">
                        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Overdue</div>
                        <div className="text-xl font-bold text-red-400">{overdueTasks.length}</div>
                    </CardContent>
                </Card>
                <Card className="border-border shadow-sm">
                    <CardContent className="p-3">
                        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Pending</div>
                        <div className="text-xl font-bold text-primary">{pendingCount}</div>
                    </CardContent>
                </Card>
                <Card className="border-border shadow-sm">
                    <CardContent className="p-3">
                        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">In Progress</div>
                        <div className="text-xl font-bold text-blue-400">{inProgressCount}</div>
                    </CardContent>
                </Card>
                <Card className="border-border shadow-sm">
                    <CardContent className="p-3">
                        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Completed</div>
                        <div className="text-xl font-bold text-green-400">{completedCount}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Overdue Alert */}
            {overdueTasks.length > 0 && (
                <Card className="border-border shadow-sm">
                    <CardContent className="p-4">
                        <p className="text-sm font-medium text-foreground mb-3">⚠️ Overdue Tasks</p>
                        <div className="space-y-2">
                            {overdueTasks.slice(0, 5).map(task => (
                                <TaskRow key={task.id} task={task} onComplete={handleComplete} />
                            ))}
                            {overdueTasks.length > 5 && (
                                <p className="text-xs text-muted-foreground text-center pt-2">
                                    +{overdueTasks.length - 5} more overdue tasks
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Filters */}
            <Card className="border-border shadow-sm">
                <CardContent className="p-4">
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                placeholder="Search tasks..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8 text-sm h-9"
                            />
                        </div>

                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-36 h-9 text-sm">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="in_progress">In Progress</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                            <SelectTrigger className="w-36 h-9 text-sm">
                                <SelectValue placeholder="Priority" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Priority</SelectItem>
                                <SelectItem value="urgent">Urgent</SelectItem>
                                <SelectItem value="high">High</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="low">Low</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {error && (
                <div className="border border-red-900 bg-red-900/20 p-4 text-center rounded-md">
                    <p className="text-xs text-red-400">{error}</p>
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : (
                <Card className="border-border shadow-sm">
                    <CardContent className="p-4">
                        {filteredTasks.length === 0 ? (
                            <EmptyState
                                icon={CheckSquare}
                                title="No tasks yet"
                                description="Create tasks to track your work items, follow-ups, and deadlines."
                                actions={[{ label: 'New Task', onClick: () => setShowNewDialog(true), icon: Plus }]}
                            />
                        ) : (
                            <div className="space-y-2">
                                {filteredTasks.map(task => (
                                    <TaskRow key={task.id} task={task} onComplete={handleComplete} />
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* New Task Dialog */}
            <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>New Task</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <Label className="text-xs text-muted-foreground">Title *</Label>
                            <Input
                                value={newTask.title}
                                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                                placeholder="Task title..."
                                className="mt-1 text-sm"
                            />
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Description</Label>
                            <Textarea
                                value={newTask.description}
                                onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                                placeholder="Task description..."
                                className="mt-1 text-sm resize-none"
                                rows={3}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-xs text-muted-foreground">Priority</Label>
                                <Select value={newTask.priority} onValueChange={(v) => setNewTask({ ...newTask, priority: v as TaskPriority })}>
                                    <SelectTrigger className="mt-1 h-9 text-sm">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="low">Low</SelectItem>
                                        <SelectItem value="medium">Medium</SelectItem>
                                        <SelectItem value="high">High</SelectItem>
                                        <SelectItem value="urgent">Urgent</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-xs text-muted-foreground">Due Date</Label>
                                <Input
                                    type="date"
                                    value={newTask.due_date}
                                    onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                                    className="mt-1 text-sm"
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowNewDialog(false)}>Cancel</Button>
                        <Button onClick={handleCreateTask} disabled={!newTask.title.trim() || isSaving} className="bg-primary text-primary-foreground hover:bg-primary/90">
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Task'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
