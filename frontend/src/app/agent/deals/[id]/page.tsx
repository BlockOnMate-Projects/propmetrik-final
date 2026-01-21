'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    ArrowLeft,
    Phone,
    Mail,
    MessageSquare,
    User,
    Building2,
    Calendar,
    DollarSign,
    Clock,
    FileText,
    CheckSquare,
    Plus,
    Loader2,
    ChevronRight,
    Send
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

interface Deal {
    id: string
    deal_number: string
    title: string
    description: string
    deal_type: string
    deal_status: string
    deal_value: number
    currency: string
    close_probability: number
    commission_amount: number
    stage_id: string
    stage_name: string
    stage_color: string
    pipeline_id: string
    pipeline_name: string
    primary_contact_id: string
    primary_contact_name: string
    primary_contact_phone: string
    primary_contact_email: string
    assigned_agent_name: string
    expected_close_date: string
    estimated_close_date: string
    days_in_stage: number
}

interface Activity {
    id: string
    activity_type: string
    title: string
    description: string
    activity_date: string
    performed_by_name: string
}

interface Task {
    id: string
    title: string
    due_date: string
    priority: string
    task_status: string
}

interface Note {
    id: string
    content: string
    created_at: string
    author_name: string
}

interface PipelineStage {
    id: string
    stage_name: string
    stage_color: string
    stage_order: number
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

export default function AgentDealDetailPage() {
    const params = useParams()
    const router = useRouter()
    const dealId = params.id as string

    const [isLoading, setIsLoading] = useState(true)
    const [deal, setDeal] = useState<Deal | null>(null)
    const [activities, setActivities] = useState<Activity[]>([])
    const [tasks, setTasks] = useState<Task[]>([])
    const [notes, setNotes] = useState<Note[]>([])
    const [stages, setStages] = useState<PipelineStage[]>([])
    const [newNote, setNewNote] = useState('')
    const [isAddingNote, setIsAddingNote] = useState(false)
    const [agentContext, setAgentContext] = useState<any>(null)
    
    // Activity dialog states
    const [activityDialogOpen, setActivityDialogOpen] = useState(false)
    const [activityType, setActivityType] = useState<'call' | 'email' | 'meeting' | 'viewing'>('call')
    const [activitySubject, setActivitySubject] = useState('')
    const [activityNotes, setActivityNotes] = useState('')
    const [activityDate, setActivityDate] = useState('')
    const [isLoggingActivity, setIsLoggingActivity] = useState(false)

    useEffect(() => {
        const loadDeal = async () => {
            try {
                const storedContext = localStorage.getItem('agentContext')
                if (!storedContext) {
                    router.push('/agent/login')
                    return
                }

                const context = JSON.parse(storedContext)
                setAgentContext(context)

                const headers = {
                    'Content-Type': 'application/json',
                    'X-User-Id': context.userId,
                    'X-Organization-Id': context.orgId
                }

                // Load deal and related data
                const [dealRes, activitiesRes, tasksRes, notesRes] = await Promise.all([
                    fetch(`${API_BASE}/crm/deals/${dealId}`, { headers }),
                    fetch(`${API_BASE}/crm/deals/${dealId}/activities`, { headers }),
                    fetch(`${API_BASE}/crm/deals/${dealId}/tasks`, { headers }),
                    fetch(`${API_BASE}/crm/deals/${dealId}/notes`, { headers })
                ])

                if (dealRes.ok) {
                    const dealData = await dealRes.json()
                    setDeal(dealData)

                    // Load pipeline stages
                    if (dealData.pipeline_id) {
                        const pipelineRes = await fetch(`${API_BASE}/crm/pipelines/${dealData.pipeline_id}`, { headers })
                        if (pipelineRes.ok) {
                            const pipelineData = await pipelineRes.json()
                            setStages(pipelineData.stages || [])
                        }
                    }
                }

                if (activitiesRes.ok) {
                    setActivities(await activitiesRes.json())
                }
                if (tasksRes.ok) {
                    setTasks(await tasksRes.json())
                }
                if (notesRes.ok) {
                    setNotes(await notesRes.json())
                }
            } catch (err) {
                console.error('Failed to load deal:', err)
            } finally {
                setIsLoading(false)
            }
        }

        loadDeal()
    }, [dealId, router])

    const handleAddNote = async () => {
        if (!newNote.trim() || !deal || !agentContext) return

        setIsAddingNote(true)
        try {
            const res = await fetch(`${API_BASE}/crm/notes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Id': agentContext.userId,
                    'X-Organization-Id': agentContext.orgId
                },
                body: JSON.stringify({
                    entity_type: 'deal',
                    entity_id: deal.id,
                    content: newNote
                })
            })

            if (res.ok) {
                const note = await res.json()
                setNotes([note, ...notes])
                setNewNote('')
            }
        } catch (err) {
            console.error('Failed to add note:', err)
        } finally {
            setIsAddingNote(false)
        }
    }

    const openActivityDialog = (type: 'call' | 'email' | 'meeting' | 'viewing') => {
        setActivityType(type)
        setActivitySubject('')
        setActivityNotes('')
        setActivityDate(new Date().toISOString().split('T')[0])
        setActivityDialogOpen(true)
    }

    const handleLogActivity = async () => {
        if (!activitySubject.trim() || !deal || !agentContext) return

        setIsLoggingActivity(true)
        try {
            const res = await fetch(`${API_BASE}/crm/deals/${deal.id}/activities`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Id': agentContext.userId,
                    'X-Organization-Id': agentContext.orgId
                },
                body: JSON.stringify({
                    contact_id: deal.primary_contact_id,
                    activity_type: activityType,
                    subject: activitySubject,
                    description: activityNotes,
                    activity_date: activityDate ? new Date(activityDate).toISOString() : new Date().toISOString(),
                    outcome: activityType === 'call' ? 'completed' : 'scheduled'
                })
            })

            if (res.ok) {
                const activity = await res.json()
                setActivities([activity, ...activities])
                setActivityDialogOpen(false)
                setActivitySubject('')
                setActivityNotes('')
            }
        } catch (err) {
            console.error('Failed to log activity:', err)
        } finally {
            setIsLoggingActivity(false)
        }
    }

    const getActivityIcon = (type: string) => {
        switch (type) {
            case 'call': return <Phone className="h-3 w-3" />
            case 'email': return <Mail className="h-3 w-3" />
            case 'whatsapp': return <MessageSquare className="h-3 w-3" />
            case 'meeting': return <User className="h-3 w-3" />
            case 'viewing': return <Building2 className="h-3 w-3" />
            default: return <Clock className="h-3 w-3" />
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
        )
    }

    if (!deal) {
        return (
            <div className="text-center py-20">
                <p className="font-mono text-sm text-red-400">Deal not found</p>
                <Button variant="link" onClick={() => router.back()} className="text-amber-500 mt-4">
                    Go Back
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => router.back()}
                        className="text-zinc-400 hover:text-white"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <span className="font-mono text-[10px] text-amber-500">{deal.deal_number}</span>
                            <span className={cn(
                                'font-mono text-[9px] px-1.5 py-0.5',
                                deal.deal_type === 'sale' && 'bg-green-900/50 text-green-400',
                                deal.deal_type === 'rental' && 'bg-blue-900/50 text-blue-400'
                            )}>
                                {deal.deal_type?.toUpperCase()}
                            </span>
                            <span className={cn(
                                'font-mono text-[9px] px-1.5 py-0.5',
                                deal.deal_status === 'active' && 'bg-blue-900/50 text-blue-400',
                                deal.deal_status === 'won' && 'bg-green-900/50 text-green-400',
                                deal.deal_status === 'lost' && 'bg-red-900/50 text-red-400'
                            )}>
                                {deal.deal_status?.toUpperCase()}
                            </span>
                        </div>
                        <h1 className="font-mono text-lg text-white">{deal.title}</h1>
                    </div>
                </div>
            </div>

            {/* Stage Progress */}
            <Panel title="DEAL STAGE">
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    {stages.sort((a, b) => a.stage_order - b.stage_order).map((stage, index) => {
                        const isActive = stage.id === deal.stage_id
                        const isPast = stages.findIndex(s => s.id === deal.stage_id) > index
                        
                        return (
                            <React.Fragment key={stage.id}>
                                <div 
                                    className={cn(
                                        'flex-shrink-0 px-3 py-1.5 font-mono text-[10px] border transition-colors',
                                        isActive && 'bg-amber-500 text-black border-amber-500',
                                        isPast && !isActive && 'bg-zinc-800 text-zinc-300 border-zinc-700',
                                        !isActive && !isPast && 'bg-transparent text-zinc-500 border-zinc-700'
                                    )}
                                >
                                    {stage.stage_name}
                                </div>
                                {index < stages.length - 1 && (
                                    <ChevronRight className="h-4 w-4 text-zinc-600 flex-shrink-0" />
                                )}
                            </React.Fragment>
                        )
                    })}
                </div>
                {deal.days_in_stage !== undefined && (
                    <p className="font-mono text-[10px] text-zinc-500 mt-2">
                        In current stage for {deal.days_in_stage} days
                    </p>
                )}
            </Panel>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-zinc-900/50 border border-zinc-800 p-3">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">DEAL VALUE</div>
                    <div className="font-mono text-lg text-green-400">
                        {deal.deal_value ? formatCurrency(deal.deal_value, deal.currency) : '—'}
                    </div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 p-3">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">PROBABILITY</div>
                    <div className="font-mono text-lg text-white">{deal.close_probability || 0}%</div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 p-3">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">MY COMMISSION</div>
                    <div className="font-mono text-lg text-amber-500">
                        {deal.commission_amount ? formatCurrency(deal.commission_amount, deal.currency) : '—'}
                    </div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 p-3">
                    <div className="font-mono text-[10px] text-zinc-500 mb-1">EXPECTED CLOSE</div>
                    <div className="font-mono text-lg text-white">
                        {(deal.expected_close_date || deal.estimated_close_date)
                            ? new Date(deal.expected_close_date || deal.estimated_close_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                            : '—'
                        }
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Left - Activity & Tabs */}
                <div className="lg:col-span-2 space-y-4">
                    <Tabs defaultValue="activity" className="w-full">
                        <TabsList className="bg-zinc-900 border border-zinc-800">
                            <TabsTrigger value="activity" className="font-mono text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-black">
                                ACTIVITY
                            </TabsTrigger>
                            <TabsTrigger value="tasks" className="font-mono text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-black">
                                TASKS ({tasks.length})
                            </TabsTrigger>
                            <TabsTrigger value="notes" className="font-mono text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-black">
                                NOTES ({notes.length})
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="activity" className="mt-4">
                            <Panel title="ACTIVITY TIMELINE">
                                {activities.length === 0 ? (
                                    <p className="font-mono text-xs text-zinc-500 text-center py-6">No activities yet</p>
                                ) : (
                                    <div className="space-y-3">
                                        {activities.map((activity) => (
                                            <div key={activity.id} className="flex gap-3 p-2 bg-zinc-800/30">
                                                <div className="w-6 h-6 bg-zinc-700 rounded-full flex items-center justify-center text-zinc-400">
                                                    {getActivityIcon(activity.activity_type)}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="font-mono text-xs text-white">{activity.title}</p>
                                                    {activity.description && (
                                                        <p className="font-mono text-[10px] text-zinc-500 mt-1">{activity.description}</p>
                                                    )}
                                                    <p className="font-mono text-[10px] text-zinc-600 mt-1">
                                                        {activity.performed_by_name} • {new Date(activity.activity_date).toLocaleDateString('en-GB')}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </Panel>
                        </TabsContent>

                        <TabsContent value="tasks" className="mt-4">
                            <Panel title="TASKS">
                                {tasks.length === 0 ? (
                                    <p className="font-mono text-xs text-zinc-500 text-center py-6">No tasks</p>
                                ) : (
                                    <div className="space-y-2">
                                        {tasks.map((task) => (
                                            <div key={task.id} className="flex items-center gap-3 p-2 bg-zinc-800/30">
                                                <CheckSquare className={cn(
                                                    'h-4 w-4',
                                                    task.task_status === 'completed' ? 'text-green-500' : 'text-zinc-500'
                                                )} />
                                                <div className="flex-1">
                                                    <p className="font-mono text-xs text-white">{task.title}</p>
                                                    {task.due_date && (
                                                        <p className="font-mono text-[10px] text-zinc-500">
                                                            Due: {new Date(task.due_date).toLocaleDateString('en-GB')}
                                                        </p>
                                                    )}
                                                </div>
                                                <span className={cn(
                                                    'font-mono text-[9px] px-1.5 py-0.5',
                                                    task.priority === 'urgent' && 'bg-red-900/50 text-red-400',
                                                    task.priority === 'high' && 'bg-orange-900/50 text-orange-400',
                                                    task.priority === 'medium' && 'bg-yellow-900/50 text-yellow-400',
                                                    task.priority === 'low' && 'bg-zinc-700/50 text-zinc-400'
                                                )}>
                                                    {task.priority?.toUpperCase()}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </Panel>
                        </TabsContent>

                        <TabsContent value="notes" className="mt-4">
                            <Panel title="NOTES">
                                <div className="mb-4">
                                    <Textarea
                                        placeholder="Add a note..."
                                        value={newNote}
                                        onChange={(e) => setNewNote(e.target.value)}
                                        className="bg-zinc-800 border-zinc-700 text-white font-mono text-xs resize-none"
                                        rows={3}
                                    />
                                    <div className="flex justify-end mt-2">
                                        <Button 
                                            onClick={handleAddNote}
                                            disabled={!newNote.trim() || isAddingNote}
                                            className="bg-amber-500 text-black hover:bg-amber-400 font-mono text-xs"
                                        >
                                            {isAddingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                                                <>
                                                    <Send className="h-3 w-3 mr-2" />
                                                    Add Note
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                                {notes.length === 0 ? (
                                    <p className="font-mono text-xs text-zinc-500 text-center py-6">No notes</p>
                                ) : (
                                    <div className="space-y-2">
                                        {notes.map((note) => (
                                            <div key={note.id} className="p-3 bg-zinc-800/30 border border-zinc-700">
                                                <p className="font-mono text-xs text-white whitespace-pre-wrap">{note.content}</p>
                                                <p className="font-mono text-[10px] text-zinc-500 mt-2">
                                                    {note.author_name || 'Unknown'} • {new Date(note.created_at).toLocaleDateString('en-GB')}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </Panel>
                        </TabsContent>
                    </Tabs>
                </div>

                {/* Right - Contact & Quick Info */}
                <div className="space-y-4">
                    {/* Primary Contact */}
                    <Panel title="PRIMARY CONTACT">
                        {deal.primary_contact_id ? (
                            <div className="space-y-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center">
                                        <User className="h-5 w-5 text-amber-500" />
                                    </div>
                                    <div>
                                        <p className="font-mono text-sm text-white">{deal.primary_contact_name}</p>
                                    </div>
                                </div>
                                {deal.primary_contact_phone && (
                                    <a 
                                        href={`tel:${deal.primary_contact_phone}`}
                                        className="flex items-center gap-2 p-2 bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors"
                                    >
                                        <Phone className="h-4 w-4 text-green-500" />
                                        <span className="font-mono text-xs text-white">{deal.primary_contact_phone}</span>
                                    </a>
                                )}
                                {deal.primary_contact_email && (
                                    <a 
                                        href={`mailto:${deal.primary_contact_email}`}
                                        className="flex items-center gap-2 p-2 bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors"
                                    >
                                        <Mail className="h-4 w-4 text-blue-500" />
                                        <span className="font-mono text-xs text-white">{deal.primary_contact_email}</span>
                                    </a>
                                )}
                            </div>
                        ) : (
                            <p className="font-mono text-xs text-zinc-500">No contact assigned</p>
                        )}
                    </Panel>

                    {/* Quick Actions */}
                    <Panel title="QUICK ACTIONS">
                        <div className="space-y-2">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => openActivityDialog('call')}
                                className="w-full justify-start border-zinc-700 text-zinc-300 hover:text-white"
                            >
                                <Phone className="h-4 w-4 mr-2 text-green-500" />
                                Log Call
                            </Button>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => openActivityDialog('email')}
                                className="w-full justify-start border-zinc-700 text-zinc-300 hover:text-white"
                            >
                                <Mail className="h-4 w-4 mr-2 text-blue-500" />
                                Send Email
                            </Button>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => openActivityDialog('meeting')}
                                className="w-full justify-start border-zinc-700 text-zinc-300 hover:text-white"
                            >
                                <Calendar className="h-4 w-4 mr-2 text-purple-500" />
                                Schedule Meeting
                            </Button>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => openActivityDialog('viewing')}
                                className="w-full justify-start border-zinc-700 text-zinc-300 hover:text-white"
                            >
                                <Building2 className="h-4 w-4 mr-2 text-amber-500" />
                                Schedule Viewing
                            </Button>
                        </div>
                    </Panel>

                    {/* Deal Description */}
                    {deal.description && (
                        <Panel title="DESCRIPTION">
                            <p className="font-mono text-xs text-zinc-300 whitespace-pre-wrap">{deal.description}</p>
                        </Panel>
                    )}
                </div>
            </div>

            {/* Activity Dialog */}
            <Dialog open={activityDialogOpen} onOpenChange={setActivityDialogOpen}>
                <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-mono text-lg text-amber-500">
                            {activityType === 'call' && 'Log Call'}
                            {activityType === 'email' && 'Log Email'}
                            {activityType === 'meeting' && 'Schedule Meeting'}
                            {activityType === 'viewing' && 'Schedule Viewing'}
                        </DialogTitle>
                        <DialogDescription className="font-mono text-xs text-zinc-500">
                            {activityType === 'call' && 'Record details of a phone call with the contact'}
                            {activityType === 'email' && 'Log an email sent to the contact'}
                            {activityType === 'meeting' && 'Schedule a meeting with the contact'}
                            {activityType === 'viewing' && 'Schedule a property viewing'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div>
                            <label className="font-mono text-[10px] text-zinc-500 mb-2 block">
                                {activityType === 'call' || activityType === 'email' ? 'SUBJECT' : 'TITLE'}
                            </label>
                            <Input
                                value={activitySubject}
                                onChange={(e) => setActivitySubject(e.target.value)}
                                placeholder={
                                    activityType === 'call' ? 'e.g., Discussed property terms' :
                                    activityType === 'email' ? 'e.g., Property brochure sent' :
                                    activityType === 'meeting' ? 'e.g., Contract review meeting' :
                                    'e.g., Property inspection'
                                }
                                className="bg-zinc-800 border-zinc-700 text-white font-mono text-sm"
                            />
                        </div>

                        <div>
                            <label className="font-mono text-[10px] text-zinc-500 mb-2 block">
                                {activityType === 'call' || activityType === 'email' ? 'DATE' : 'SCHEDULED DATE'}
                            </label>
                            <Input
                                type="date"
                                value={activityDate}
                                onChange={(e) => setActivityDate(e.target.value)}
                                className="bg-zinc-800 border-zinc-700 text-white font-mono text-sm"
                            />
                        </div>

                        <div>
                            <label className="font-mono text-[10px] text-zinc-500 mb-2 block">NOTES</label>
                            <Textarea
                                value={activityNotes}
                                onChange={(e) => setActivityNotes(e.target.value)}
                                placeholder="Add any additional details..."
                                rows={3}
                                className="bg-zinc-800 border-zinc-700 text-white font-mono text-sm resize-none"
                            />
                        </div>

                        {deal.primary_contact_name && (
                            <div className="flex items-center gap-2 p-2 bg-zinc-800/50 border border-zinc-700">
                                <User className="h-4 w-4 text-amber-500" />
                                <span className="font-mono text-xs text-zinc-300">
                                    Contact: {deal.primary_contact_name}
                                </span>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setActivityDialogOpen(false)}
                            className="border-zinc-700 text-zinc-300"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleLogActivity}
                            disabled={!activitySubject.trim() || isLoggingActivity}
                            className="bg-amber-500 text-black hover:bg-amber-400"
                        >
                            {isLoggingActivity ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                activityType === 'call' || activityType === 'email' ? 'Log Activity' : 'Schedule'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
