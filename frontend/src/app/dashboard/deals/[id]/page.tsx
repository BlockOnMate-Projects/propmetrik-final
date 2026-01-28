'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { cn, formatCurrency } from '@/lib/utils'
import { isFeatureEnabled } from '@/lib/features'
import {
    ArrowLeft,
    Edit,
    Trash2,
    User,
    Building2,
    Calendar,
    DollarSign,
    Clock,
    Phone,
    Mail,
    MessageSquare,
    FileText,
    CheckSquare,
    Plus,
    Loader2,
    ChevronRight,
    FileDown,
    LineChart
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { dealsApi, pipelinesApi, tasksApi, notesApi } from '@/lib/crm-api'
import type { Deal, DealActivity, DealStage, Task, Note, CrmDocument, DealPipeline } from '@/types/crm'
import { GenerateDocumentDialog } from '@/components/deals/GenerateDocumentDialog'
import { DocumentChecklist } from '@/components/deals/DocumentChecklist'

// =====================================================
// PANEL COMPONENT
// =====================================================
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

// =====================================================
// ACTIVITY TIMELINE
// =====================================================
function ActivityTimeline({ activities }: { activities: DealActivity[] }) {
    const getActivityIcon = (type: string) => {
        switch (type) {
            case 'call': return <Phone className="h-3 w-3" />
            case 'email': return <Mail className="h-3 w-3" />
            case 'whatsapp': return <MessageSquare className="h-3 w-3" />
            case 'meeting': return <User className="h-3 w-3" />
            case 'viewing': return <Building2 className="h-3 w-3" />
            case 'stage_change': return <ChevronRight className="h-3 w-3" />
            case 'document': return <FileText className="h-3 w-3" />
            default: return <Clock className="h-3 w-3" />
        }
    }

    const getActivityColor = (type: string) => {
        switch (type) {
            case 'call': return 'bg-blue-500'
            case 'email': return 'bg-purple-500'
            case 'whatsapp': return 'bg-green-500'
            case 'meeting': return 'bg-orange-500'
            case 'viewing': return 'bg-amber-500'
            case 'stage_change': return 'bg-cyan-500'
            default: return 'bg-zinc-500'
        }
    }

    if (activities.length === 0) {
        return (
            <div className="text-center py-8">
                <p className="font-mono text-xs text-zinc-500">No activities recorded yet</p>
            </div>
        )
    }

    return (
        <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-px bg-zinc-800" />
            <div className="space-y-4">
                {activities.map((activity) => (
                    <div key={activity.id} className="relative pl-10">
                        <div className={cn(
                            'absolute left-2.5 w-3 h-3 rounded-full flex items-center justify-center text-white',
                            getActivityColor(activity.activity_type)
                        )}>
                            {getActivityIcon(activity.activity_type)}
                        </div>
                        <div className="bg-zinc-800/50 border border-zinc-700 p-3">
                            <div className="flex items-start justify-between mb-1">
                                <span className="font-mono text-xs text-white">{activity.title}</span>
                                <span className="font-mono text-[10px] text-zinc-500">
                                    {new Date(activity.activity_date).toLocaleDateString('en-GB', {
                                        day: 'numeric',
                                        month: 'short',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })}
                                </span>
                            </div>
                            {activity.description && (
                                <p className="font-mono text-[10px] text-zinc-400 mt-1">{activity.description}</p>
                            )}
                            <div className="font-mono text-[10px] text-zinc-600 mt-2">
                                by {activity.performed_by_name || 'System'}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

// =====================================================
// MAIN COMPONENT
// =====================================================
export default function DealDetailPage() {
    const params = useParams()
    const router = useRouter()
    const dealId = params.id as string

    const [deal, setDeal] = useState<Deal | null>(null)
    const [activities, setActivities] = useState<DealActivity[]>([])
    const [tasks, setTasks] = useState<Task[]>([])
    const [notes, setNotes] = useState<Note[]>([])
    const [documents, setDocuments] = useState<CrmDocument[]>([])
    const [pipeline, setPipeline] = useState<DealPipeline | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Stage change dialog
    const [stageDialogOpen, setStageDialogOpen] = useState(false)
    const [selectedStage, setSelectedStage] = useState<string>('')
    const [stageNote, setStageNote] = useState('')
    const [isUpdatingStage, setIsUpdatingStage] = useState(false)

    // New note
    const [newNote, setNewNote] = useState('')
    const [isAddingNote, setIsAddingNote] = useState(false)

    // Document generation dialog
    const [generateDocDialogOpen, setGenerateDocDialogOpen] = useState(false)
    const [documentRefreshKey, setDocumentRefreshKey] = useState(0)

    // Load deal data
    useEffect(() => {
        const loadDeal = async () => {
            try {
                setIsLoading(true)
                setError(null)

                const [dealData, activitiesData, tasksData, notesData, docsData] = await Promise.all([
                    dealsApi.getById(dealId),
                    dealsApi.getActivities(dealId),
                    dealsApi.getTasks(dealId),
                    dealsApi.getNotes(dealId),
                    dealsApi.getDocuments(dealId)
                ])

                setDeal(dealData)
                setActivities(activitiesData)
                setTasks(tasksData)
                setNotes(notesData)
                setDocuments(docsData)

                // Load pipeline for stage options
                if (dealData.pipeline_id) {
                    const pipelineData = await pipelinesApi.getById(dealData.pipeline_id)
                    setPipeline(pipelineData)
                }
            } catch (err) {
                console.error('Failed to load deal:', err)
                setError('Failed to load deal details')
            } finally {
                setIsLoading(false)
            }
        }

        if (dealId) {
            loadDeal()
        }
    }, [dealId])

    // Handle stage change
    const handleStageChange = async () => {
        if (!selectedStage || !deal) return

        try {
            setIsUpdatingStage(true)
            const updated = await dealsApi.updateStage(deal.id, selectedStage, stageNote)
            setDeal(updated)

            // Reload activities
            const newActivities = await dealsApi.getActivities(dealId)
            setActivities(newActivities)

            setStageDialogOpen(false)
            setStageNote('')
        } catch (err) {
            console.error('Failed to update stage:', err)
        } finally {
            setIsUpdatingStage(false)
        }
    }

    // Handle add note
    const handleAddNote = async () => {
        if (!newNote.trim() || !deal) return

        try {
            setIsAddingNote(true)
            const note = await notesApi.create({
                entity_type: 'deal',
                entity_id: deal.id,
                content: newNote
            })
            setNotes([note, ...notes])
            setNewNote('')
        } catch (err) {
            console.error('Failed to add note:', err)
        } finally {
            setIsAddingNote(false)
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
        )
    }

    if (error || !deal) {
        return (
            <div className="text-center py-20">
                <p className="font-mono text-sm text-red-400">{error || 'Deal not found'}</p>
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
                                deal.deal_type === 'rental' && 'bg-blue-900/50 text-blue-400',
                                deal.deal_type === 'development' && 'bg-purple-900/50 text-purple-400'
                            )}>
                                {deal.deal_type?.toUpperCase()}
                            </span>
                            <span className={cn(
                                'font-mono text-[9px] px-1.5 py-0.5',
                                deal.deal_status === 'active' && 'bg-blue-900/50 text-blue-400',
                                deal.deal_status === 'won' && 'bg-green-900/50 text-green-400',
                                deal.deal_status === 'lost' && 'bg-red-900/50 text-red-400',
                                deal.deal_status === 'on_hold' && 'bg-yellow-900/50 text-yellow-400'
                            )}>
                                {deal.deal_status?.toUpperCase()}
                            </span>
                        </div>
                        <h1 className="font-mono text-xl text-white">{deal.title}</h1>
                        {deal.description && (
                            <p className="font-mono text-xs text-zinc-400 mt-1 max-w-2xl">{deal.description}</p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Link href={`/dashboard/deals/${deal.id}/edit`}>
                        <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:text-white">
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Stage Progress */}
            <Panel title="DEAL STAGE">
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    {pipeline?.stages?.sort((a, b) => a.stage_order - b.stage_order).map((stage, index) => {
                        const isActive = stage.id === deal.stage_id
                        const isPast = (pipeline?.stages?.findIndex(s => s.id === deal.stage_id) || 0) > index

                        return (
                            <React.Fragment key={stage.id}>
                                <div
                                    className={cn(
                                        'flex-shrink-0 px-3 py-1.5 font-mono text-[10px] border transition-colors cursor-pointer',
                                        isActive && 'bg-amber-500 text-black border-amber-500',
                                        isPast && !isActive && 'bg-zinc-800 text-zinc-300 border-zinc-700',
                                        !isActive && !isPast && 'bg-transparent text-zinc-500 border-zinc-700 hover:border-zinc-500'
                                    )}
                                    style={isActive ? { borderColor: stage.stage_color } : {}}
                                    onClick={() => {
                                        if (!isActive) {
                                            setSelectedStage(stage.id)
                                            setStageDialogOpen(true)
                                        }
                                    }}
                                >
                                    {stage.stage_name}
                                </div>
                                {index < (pipeline?.stages?.length || 0) - 1 && (
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

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Left Column - Deal Info */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Key Metrics */}
                    <div className="grid grid-cols-4 gap-3">
                        <Card className="bg-black border-zinc-800">
                            <CardContent className="p-3">
                                <div className="font-mono text-[10px] text-zinc-500 mb-1">DEAL VALUE</div>
                                <div className="font-mono text-lg text-green-400">
                                    {deal.deal_value ? formatCurrency(deal.deal_value, deal.currency || 'GHS') : '—'}
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="bg-black border-zinc-800">
                            <CardContent className="p-3">
                                <div className="font-mono text-[10px] text-zinc-500 mb-1">PROBABILITY</div>
                                <div className="font-mono text-lg text-white">{deal.probability || 0}%</div>
                            </CardContent>
                        </Card>
                        <Card className="bg-black border-zinc-800">
                            <CardContent className="p-3">
                                <div className="font-mono text-[10px] text-zinc-500 mb-1">COMMISSION</div>
                                <div className="font-mono text-lg text-amber-500">
                                    {deal.commission_amount ? formatCurrency(deal.commission_amount, deal.currency || 'GHS') : '—'}
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="bg-black border-zinc-800">
                            <CardContent className="p-3">
                                <div className="font-mono text-[10px] text-zinc-500 mb-1">EXPECTED CLOSE</div>
                                <div className="font-mono text-lg text-white">
                                    {deal.expected_close_date
                                        ? new Date(deal.expected_close_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                                        : '—'
                                    }
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Tabs */}
                    <Tabs defaultValue="activity" className="w-full">
                        <TabsList className="bg-zinc-900 border border-zinc-800">
                            <TabsTrigger value="activity" className="font-mono text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-black">
                                ACTIVITY
                            </TabsTrigger>
                            <TabsTrigger value="tasks" className="font-mono text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-black">
                                TASKS ({tasks.length})
                            </TabsTrigger>
                            <TabsTrigger value="documents" className="font-mono text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-black">
                                DOCUMENTS ({documents.length})
                            </TabsTrigger>
                            <TabsTrigger value="notes" className="font-mono text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-black">
                                NOTES ({notes.length})
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="activity" className="mt-4">
                            <Panel title="ACTIVITY TIMELINE">
                                <ActivityTimeline activities={activities} />
                            </Panel>
                        </TabsContent>

                        <TabsContent value="tasks" className="mt-4">
                            <Panel
                                title="TASKS"
                                action={
                                    <Link href={`/dashboard/deals/tasks?deal_id=${deal.id}`}>
                                        <Button variant="ghost" size="sm" className="h-6 px-2 text-amber-500 hover:text-amber-400">
                                            <Plus className="h-3 w-3 mr-1" />
                                            Add
                                        </Button>
                                    </Link>
                                }
                            >
                                {tasks.length === 0 ? (
                                    <p className="font-mono text-xs text-zinc-500 text-center py-6">No tasks</p>
                                ) : (
                                    <div className="space-y-2">
                                        {tasks.map((task) => (
                                            <div
                                                key={task.id}
                                                className="flex items-center gap-3 p-2 bg-zinc-800/50 border border-zinc-700"
                                            >
                                                <CheckSquare className={cn(
                                                    'h-4 w-4',
                                                    task.status === 'completed' ? 'text-green-500' : 'text-zinc-500'
                                                )} />
                                                <div className="flex-1">
                                                    <p className={cn(
                                                        'font-mono text-xs',
                                                        task.status === 'completed' ? 'text-zinc-500 line-through' : 'text-white'
                                                    )}>
                                                        {task.title}
                                                    </p>
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

                        <TabsContent value="documents" className="mt-4">
                            <Panel
                                title="DOCUMENTS"
                                action={
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-amber-500 hover:text-amber-400"
                                        onClick={() => setGenerateDocDialogOpen(true)}
                                    >
                                        <FileDown className="h-3 w-3 mr-1" />
                                        Generate
                                    </Button>
                                }
                            >
                                <DocumentChecklist
                                    key={documentRefreshKey}
                                    dealId={dealId}
                                    onGenerateDocument={() => setGenerateDocDialogOpen(true)}
                                />

                                {/* Legacy uploaded documents */}
                                {documents.length > 0 && (
                                    <div className="pt-4 border-t border-zinc-800 mt-4">
                                        <h4 className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-3">
                                            Uploaded Files ({documents.length})
                                        </h4>
                                        <div className="space-y-2">
                                            {documents.map((doc) => (
                                                <div
                                                    key={doc.id}
                                                    className="flex items-center gap-3 p-2 bg-zinc-800/50 border border-zinc-700"
                                                >
                                                    <FileText className="h-4 w-4 text-zinc-500" />
                                                    <div className="flex-1">
                                                        <p className="font-mono text-xs text-white">{doc.file_name}</p>
                                                        <p className="font-mono text-[10px] text-zinc-500">
                                                            {doc.document_type?.replace('_', ' ')} • {(doc.file_size / 1024).toFixed(0)}KB
                                                        </p>
                                                    </div>
                                                    {doc.is_signed && (
                                                        <span className="font-mono text-[9px] px-1.5 py-0.5 bg-green-900/50 text-green-400">
                                                            SIGNED
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
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
                                            {isAddingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add Note'}
                                        </Button>
                                    </div>
                                </div>
                                {notes.length === 0 ? (
                                    <p className="font-mono text-xs text-zinc-500 text-center py-6">No notes</p>
                                ) : (
                                    <div className="space-y-2">
                                        {notes.map((note) => (
                                            <div key={note.id} className="p-3 bg-zinc-800/50 border border-zinc-700">
                                                <p className="font-mono text-xs text-white whitespace-pre-wrap">{note.content}</p>
                                                <div className="flex items-center justify-between mt-2">
                                                    <span className="font-mono text-[10px] text-zinc-500">
                                                        {note.created_by_name || 'Unknown'} • {new Date(note.created_at).toLocaleDateString('en-GB')}
                                                    </span>
                                                    {note.is_pinned && (
                                                        <span className="font-mono text-[9px] text-amber-500">PINNED</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </Panel>
                        </TabsContent>
                    </Tabs>
                </div>

                {/* Right Column - Sidebar */}
                <div className="space-y-4">
                    {/* Contact Info */}
                    <Panel title="PRIMARY CONTACT">
                        {deal.primary_contact_id ? (
                            <Link href={`/dashboard/deals/contacts/${deal.primary_contact_id}`}>
                                <div className="flex items-center gap-3 p-2 bg-zinc-800/50 border border-zinc-700 hover:border-amber-500/50 transition-colors">
                                    <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center">
                                        <User className="h-5 w-5 text-amber-500" />
                                    </div>
                                    <div>
                                        <p className="font-mono text-xs text-white">{deal.primary_contact_name}</p>
                                        <p className="font-mono text-[10px] text-zinc-500">View contact</p>
                                    </div>
                                </div>
                            </Link>
                        ) : (
                            <p className="font-mono text-xs text-zinc-500">No contact assigned</p>
                        )}
                    </Panel>

                    {/* Company Info */}
                    {deal.company_id && (
                        <Panel title="COMPANY">
                            <Link href={`/dashboard/deals/companies/${deal.company_id}`}>
                                <div className="flex items-center gap-3 p-2 bg-zinc-800/50 border border-zinc-700 hover:border-amber-500/50 transition-colors">
                                    <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                                        <Building2 className="h-5 w-5 text-blue-500" />
                                    </div>
                                    <div>
                                        <p className="font-mono text-xs text-white">{deal.company_name}</p>
                                        <p className="font-mono text-[10px] text-zinc-500">View company</p>
                                    </div>
                                </div>
                            </Link>
                        </Panel>
                    )}

                    {/* Agent Info */}
                    <Panel title="ASSIGNED AGENT">
                        {deal.assigned_agent_name ? (
                            <div className="flex items-center gap-3 p-2 bg-zinc-800/50 border border-zinc-700">
                                <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center">
                                    <User className="h-5 w-5 text-purple-500" />
                                </div>
                                <div>
                                    <p className="font-mono text-xs text-white">{deal.assigned_agent_name}</p>
                                    <p className="font-mono text-[10px] text-zinc-500">Sales Agent</p>
                                </div>
                            </div>
                        ) : (
                            <p className="font-mono text-xs text-zinc-500">No agent assigned</p>
                        )}
                    </Panel>

                    {/* Properties */}
                    {deal.property_names && deal.property_names.length > 0 && (
                        <Panel title="PROPERTIES">
                            <div className="space-y-2">
                                {deal.property_names.map((name, idx) => {
                                    const propertyId = deal.property_ids?.[idx];
                                    return (
                                        <div key={idx} className="flex items-center justify-between p-2 bg-zinc-800/50 border border-zinc-700">
                                            <div className="flex items-center gap-2">
                                                <Building2 className="h-4 w-4 text-zinc-500" />
                                                <span className="font-mono text-xs text-white">{name}</span>
                                            </div>
                                            {propertyId && isFeatureEnabled('valuations') && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 px-2 text-amber-500 hover:text-amber-400"
                                                    onClick={() => router.push(`/dashboard/valuations/new?property_id=${propertyId}`)}
                                                >
                                                    <LineChart className="h-3 w-3 mr-1" />
                                                    Valuation
                                                </Button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </Panel>
                    )}

                    {/* Tags */}
                    {deal.tags && deal.tags.length > 0 && (
                        <Panel title="TAGS">
                            <div className="flex flex-wrap gap-1">
                                {deal.tags.map((tag, idx) => (
                                    <span key={idx} className="font-mono text-[10px] px-2 py-0.5 bg-zinc-800 text-zinc-300 border border-zinc-700">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </Panel>
                    )}

                    {/* Lead Source */}
                    {deal.lead_source && (
                        <Panel title="LEAD SOURCE">
                            <p className="font-mono text-xs text-white">{deal.lead_source}</p>
                            {deal.utm_source && (
                                <p className="font-mono text-[10px] text-zinc-500 mt-1">
                                    UTM: {deal.utm_source} / {deal.utm_medium} / {deal.utm_campaign}
                                </p>
                            )}
                        </Panel>
                    )}
                </div>
            </div>

            {/* Stage Change Dialog */}
            <Dialog open={stageDialogOpen} onOpenChange={setStageDialogOpen}>
                <DialogContent className="bg-zinc-900 border-zinc-800">
                    <DialogHeader>
                        <DialogTitle className="font-mono text-white">Change Deal Stage</DialogTitle>
                        <DialogDescription className="font-mono text-xs text-zinc-500">
                            Move this deal to a different stage in the pipeline.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <label className="font-mono text-[10px] text-zinc-500 mb-2 block">NEW STAGE</label>
                            <Select value={selectedStage} onValueChange={setSelectedStage}>
                                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white font-mono text-xs">
                                    <SelectValue placeholder="Select stage" />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-zinc-700">
                                    {pipeline?.stages?.map((stage) => (
                                        <SelectItem
                                            key={stage.id}
                                            value={stage.id}
                                            className="font-mono text-xs text-white"
                                        >
                                            {stage.stage_name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="font-mono text-[10px] text-zinc-500 mb-2 block">NOTE (OPTIONAL)</label>
                            <Textarea
                                placeholder="Add a note about this stage change..."
                                value={stageNote}
                                onChange={(e) => setStageNote(e.target.value)}
                                className="bg-zinc-800 border-zinc-700 text-white font-mono text-xs resize-none"
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setStageDialogOpen(false)}
                            className="border-zinc-700 text-zinc-300"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleStageChange}
                            disabled={!selectedStage || isUpdatingStage}
                            className="bg-amber-500 text-black hover:bg-amber-400"
                        >
                            {isUpdatingStage ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update Stage'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Generate Document Dialog */}
            {deal && (
                <GenerateDocumentDialog
                    isOpen={generateDocDialogOpen}
                    onClose={() => setGenerateDocDialogOpen(false)}
                    dealId={dealId}
                    dealTitle={deal.title}
                    onDocumentGenerated={() => {
                        setDocumentRefreshKey(k => k + 1)
                    }}
                />
            )}
        </div>
    )
}
