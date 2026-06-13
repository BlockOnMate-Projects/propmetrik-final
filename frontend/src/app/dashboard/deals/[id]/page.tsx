'use client'

import React, { useState, lazy, Suspense } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn, formatCurrency } from '@/lib/utils'
import { isFeatureEnabled } from '@/lib/features'
import {
    ArrowLeft,
    Edit,
    User,
    Building2,
    FileText,
    Plus,
    Loader2,
    ChevronRight,
    FileDown,
    LineChart,
    StickyNote,
    Trophy,
    XCircle,
    Archive,
    PenTool,
    Calendar,
    Send,
    Clock,
    CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
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
import { toast } from 'sonner'
import { dealKeys, useDeal, useDealActivities, useDealTasks, useDealNotes, useDealDocuments, useUpdateDeal, useUpdateDealStage } from '@/hooks/crm/use-deals'
import { usePipeline } from '@/hooks/crm/use-pipelines'
import { useCreateNote } from '@/hooks/crm/use-tasks-notes-agents'
import type { Deal } from '@/types/crm'
import { GenerateDocumentDialog } from '@/components/deals/GenerateDocumentDialog'
import { DocumentChecklist } from '@/components/deals/DocumentChecklist'
import { InlineEdit } from '@/components/crm/InlineEdit'
import { UnifiedTimeline } from '@/components/crm/UnifiedTimeline'
import crmApi from '@/lib/crm-api'
import { calendarApi, type CalendarEvent } from '@/lib/realtime-api'

const CustomDealFields = lazy(() => import('@/components/crm/CustomDealFields'))

// =====================================================
// SECTION PANEL (themed)
// =====================================================
function Panel({ title, children, className, action }: {
    title: string
    children: React.ReactNode
    className?: string
    action?: React.ReactNode
}) {
    return (
        <div className={cn('border border-border rounded-lg bg-card', className)}>
            <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border rounded-t-lg">
                <span className="text-[10px] font-medium text-primary tracking-wider uppercase">{title}</span>
                {action}
            </div>
            <div className="p-3">{children}</div>
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

    // ---------- React Query hooks ----------
    const { data: deal, isLoading, error: dealError } = useDeal(dealId)
    const { data: activities = [] } = useDealActivities(dealId)
    const { data: tasks = [] } = useDealTasks(dealId)
    const { data: notes = [] } = useDealNotes(dealId)
    const { data: documents = [] } = useDealDocuments(dealId)
    const { data: pipeline } = usePipeline(deal?.pipeline_id || '')

    // ---------- Mutations ----------
    const updateDeal = useUpdateDeal()
    const updateStage = useUpdateDealStage()
    const createNote = useCreateNote()

    const queryClient = useQueryClient()

    // ---------- Local UI state ----------
    const [stageDialogOpen, setStageDialogOpen] = useState(false)
    const [selectedStage, setSelectedStage] = useState('')
    const [stageNote, setStageNote] = useState('')
    const [newNote, setNewNote] = useState('')
    const [generateDocDialogOpen, setGenerateDocDialogOpen] = useState(false)
    const [documentRefreshKey, setDocumentRefreshKey] = useState(0)
    const [statusDialogOpen, setStatusDialogOpen] = useState(false)
    const [statusAction, setStatusAction] = useState<'won' | 'lost' | 'archived' | 'active'>('won')
    const [statusReason, setStatusReason] = useState('')
    const [statusFinalValue, setStatusFinalValue] = useState('')

    // ---------- E-Sign Signatures for this deal ----------
    const { data: signatures = [] } = useQuery({
        queryKey: ['deal-signatures', dealId],
        queryFn: async (): Promise<Array<{ id: string; envelope_title: string; status: string; created_at: string; signers?: Array<{ name: string; email: string; status: string }> }>> => {
            const res = await crmApi.signatures.getAll({ deal_id: dealId })
            // Backend returns { data: [...], pagination: {...} }
            return Array.isArray(res) ? res : (res as any)?.data || []
        },
        enabled: !!dealId,
    })

    // ---------- Calendar events for this deal ----------
    const { data: dealEvents = [] } = useQuery({
        queryKey: ['deal-calendar', dealId],
        queryFn: () => {
            const start = new Date()
            start.setFullYear(start.getFullYear() - 1)
            const end = new Date()
            end.setFullYear(end.getFullYear() + 1)
            return calendarApi.getEvents(start, end, { dealId })
        },
        enabled: !!dealId,
    })

    // ---------- Status mutation ----------
    const updateStatusMutation = useMutation({
        mutationFn: (data: { status: string; reason?: string; final_value?: number }) =>
            crmApi.deals.updateStatus(dealId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: dealKeys.detail(dealId) })
            toast.success('Deal status updated')
            setStatusDialogOpen(false)
            setStatusReason('')
            setStatusFinalValue('')
        },
        onError: () => toast.error('Failed to update status'),
    })

    // ---------- Handlers ----------
    const handleStageChange = async () => {
        if (!selectedStage || !deal) return
        try {
            await updateStage.mutateAsync({ dealId: deal.id, stageId: selectedStage, note: stageNote })
            toast.success('Stage updated')
            setStageDialogOpen(false)
            setStageNote('')
        } catch {
            toast.error('Failed to update stage')
        }
    }

    const handleAddNote = async () => {
        if (!newNote.trim() || !deal) return
        try {
            await createNote.mutateAsync({ entity_type: 'deal', entity_id: deal.id, content: newNote })
            setNewNote('')
            toast.success('Note added')
        } catch {
            toast.error('Failed to add note')
        }
    }

    const handleInlineUpdate = async (field: keyof Deal, value: string) => {
        if (!deal) return
        const payload: Partial<Deal> = {}
        if (field === 'deal_value' || field === 'probability' || field === 'commission_amount') {
            ;(payload as any)[field] = parseFloat(value) || 0
        } else {
            ;(payload as any)[field] = value
        }
        await updateDeal.mutateAsync({ id: deal.id, data: payload })
        toast.success('Updated')
    }

    // ---------- Loading / Error states ----------
    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (dealError || !deal) {
        return (
            <div className="text-center py-20">
                <p className="text-sm text-destructive">{dealError?.message || 'Deal not found'}</p>
                <Button variant="link" onClick={() => router.back()} className="text-primary mt-4">
                    Go Back
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* ─── Header ─── */}
            <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.back()}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <span className="text-[10px] text-primary font-medium">{deal.deal_number}</span>
                            <span className={cn(
                                'text-[9px] px-1.5 py-0.5 rounded',
                                deal.deal_type === 'sale' && 'bg-green-500/10 text-green-600 dark:text-green-400',
                                deal.deal_type === 'rental' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                                deal.deal_type === 'development' && 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                            )}>
                                {deal.deal_type?.toUpperCase()}
                            </span>
                            <span className={cn(
                                'text-[9px] px-1.5 py-0.5 rounded',
                                deal.deal_status === 'active' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                                deal.deal_status === 'won' && 'bg-green-500/10 text-green-600 dark:text-green-400',
                                deal.deal_status === 'lost' && 'bg-red-500/10 text-red-600 dark:text-red-400',
                                deal.deal_status === 'on_hold' && 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                            )}>
                                {deal.deal_status?.toUpperCase()}
                            </span>
                        </div>
                        <h1 className="text-xl font-semibold text-foreground">{deal.title}</h1>
                        {deal.description && (
                            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">{deal.description}</p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {deal.deal_status === 'active' && (
                        <>
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-green-600 border-green-600/30 hover:bg-green-600/10"
                                onClick={() => { setStatusAction('won'); setStatusDialogOpen(true) }}
                            >
                                <Trophy className="h-4 w-4 mr-1" />
                                Won
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 border-red-600/30 hover:bg-red-600/10"
                                onClick={() => { setStatusAction('lost'); setStatusDialogOpen(true) }}
                            >
                                <XCircle className="h-4 w-4 mr-1" />
                                Lost
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-muted-foreground"
                                onClick={() => { setStatusAction('archived'); setStatusDialogOpen(true) }}
                            >
                                <Archive className="h-4 w-4 mr-1" />
                                Archive
                            </Button>
                        </>
                    )}
                    {((deal.deal_status as string) === 'won' || (deal.deal_status as string) === 'lost' || (deal.deal_status as string) === 'archived') && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setStatusAction('active'); setStatusDialogOpen(true) }}
                        >
                            Reopen
                        </Button>
                    )}
                    <Link href={`/dashboard/deals/${deal.id}/edit`}>
                        <Button variant="outline" size="sm">
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                        </Button>
                    </Link>
                </div>
            </div>

            {/* ─── Stage Progress ─── */}
            <Panel title="DEAL STAGE">
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    {pipeline?.stages?.sort((a: any, b: any) => a.stage_order - b.stage_order).map((stage: any, index: number) => {
                        const isActive = stage.id === deal.stage_id
                        const isPast = (pipeline?.stages?.findIndex((s: any) => s.id === deal.stage_id) || 0) > index

                        return (
                            <React.Fragment key={stage.id}>
                                <div
                                    className={cn(
                                        'flex-shrink-0 px-3 py-1.5 text-[10px] border rounded transition-colors cursor-pointer',
                                        isActive && 'bg-primary text-primary-foreground border-primary',
                                        isPast && !isActive && 'bg-muted text-foreground border-border',
                                        !isActive && !isPast && 'bg-transparent text-muted-foreground border-border hover:border-foreground/40'
                                    )}
                                    style={isActive && stage.stage_color ? { backgroundColor: stage.stage_color, borderColor: stage.stage_color } : {}}
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
                                    <ChevronRight className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
                                )}
                            </React.Fragment>
                        )
                    })}
                </div>
                {deal.days_in_stage !== undefined && (
                    <p className="text-[10px] text-muted-foreground mt-2">
                        In current stage for {deal.days_in_stage} days
                    </p>
                )}
            </Panel>

            {/* ─── Main Content Grid ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Left Column */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Key Metrics — with InlineEdit */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <Card className="border-border">
                            <CardContent className="p-3">
                                <div className="text-[10px] text-muted-foreground mb-1">DEAL VALUE</div>
                                <InlineEdit
                                    value={deal.deal_value ?? ''}
                                    displayValue={deal.deal_value ? formatCurrency(deal.deal_value, deal.currency || 'GHS') : '—'}
                                    type="number"
                                    onSave={(v) => handleInlineUpdate('deal_value', v)}
                                    className="text-lg font-semibold text-green-600 dark:text-green-400"
                                />
                            </CardContent>
                        </Card>
                        <Card className="border-border">
                            <CardContent className="p-3">
                                <div className="text-[10px] text-muted-foreground mb-1">PROBABILITY</div>
                                <InlineEdit
                                    value={(deal as any).close_probability ?? deal.probability ?? 0}
                                    displayValue={`${(deal as any).close_probability || deal.probability || 0}%`}
                                    type="number"
                                    onSave={(v) => handleInlineUpdate('probability', v)}
                                    className="text-lg font-semibold text-foreground"
                                />
                            </CardContent>
                        </Card>
                        <Card className="border-border">
                            <CardContent className="p-3">
                                <div className="text-[10px] text-muted-foreground mb-1">COMMISSION</div>
                                <InlineEdit
                                    value={deal.commission_amount ?? ''}
                                    displayValue={deal.commission_amount ? formatCurrency(deal.commission_amount, deal.currency || 'GHS') : '—'}
                                    type="number"
                                    onSave={(v) => handleInlineUpdate('commission_amount', v)}
                                    className="text-lg font-semibold text-primary"
                                />
                            </CardContent>
                        </Card>
                        <Card className="border-border">
                            <CardContent className="p-3">
                                <div className="text-[10px] text-muted-foreground mb-1">EXPECTED CLOSE</div>
                                <InlineEdit
                                    value={deal.expected_close_date ? deal.expected_close_date.toString().slice(0, 10) : ''}
                                    displayValue={
                                        deal.expected_close_date
                                            ? new Date(deal.expected_close_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                                            : '—'
                                    }
                                    type="date"
                                    onSave={(v) => handleInlineUpdate('expected_close_date', v)}
                                    className="text-lg font-semibold text-foreground"
                                />
                            </CardContent>
                        </Card>
                    </div>

                    {/* ─── Quick‑add Note ─── */}
                    <div className="flex items-start gap-2">
                        <StickyNote className="h-4 w-4 text-muted-foreground mt-2.5 flex-shrink-0" />
                        <Textarea
                            placeholder="Add a quick note…"
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            className="text-xs resize-none min-h-[40px]"
                            rows={2}
                        />
                        <Button
                            size="sm"
                            onClick={handleAddNote}
                            disabled={!newNote.trim() || createNote.isPending}
                        >
                            {createNote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
                        </Button>
                    </div>

                    {/* ─── Documents Section ─── */}
                    <Panel
                        title="DOCUMENTS"
                        action={
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-primary hover:text-primary/80"
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

                        {documents.length > 0 && (
                            <div className="pt-4 border-t border-border mt-4">
                                <h4 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">
                                    Uploaded Files ({documents.length})
                                </h4>
                                <div className="space-y-2">
                                    {documents.map((doc) => (
                                        <div key={doc.id} className="flex items-center gap-3 p-2 rounded-md bg-muted/30 border border-border">
                                            <FileText className="h-4 w-4 text-muted-foreground" />
                                            <div className="flex-1">
                                                <p className="text-xs text-foreground">{doc.file_name}</p>
                                                <p className="text-[10px] text-muted-foreground">
                                                    {doc.document_type?.replace('_', ' ')} • {(doc.file_size / 1024).toFixed(0)}KB
                                                </p>
                                            </div>
                                            {doc.is_signed && (
                                                <span className="text-[9px] px-1.5 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full font-medium">
                                                    SIGNED
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </Panel>

                    {/* ─── Unified Timeline ─── */}
                    <Panel title="TIMELINE">
                        <UnifiedTimeline
                            activities={activities}
                            tasks={tasks}
                            notes={notes}
                            documents={documents}
                        />
                    </Panel>
                </div>

                {/* ─── Right Column — Sidebar ─── */}
                <div className="space-y-4">
                    {/* Contact */}
                    <Panel title="PRIMARY CONTACT">
                        {deal.primary_contact_id ? (
                            <Link href={`/dashboard/deals/contacts/${deal.primary_contact_id}`}>
                                <div className="flex items-center gap-3 p-2 rounded-md bg-muted/30 border border-border hover:border-primary/50 transition-colors">
                                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                                        <User className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-foreground font-medium">{deal.primary_contact_name}</p>
                                        <p className="text-[10px] text-muted-foreground">View contact</p>
                                    </div>
                                </div>
                            </Link>
                        ) : (
                            <p className="text-xs text-muted-foreground">No contact assigned</p>
                        )}
                    </Panel>

                    {/* Company */}
                    {deal.company_id && (
                        <Panel title="COMPANY">
                            <Link href={`/dashboard/deals/companies/${deal.company_id}`}>
                                <div className="flex items-center gap-3 p-2 rounded-md bg-muted/30 border border-border hover:border-primary/50 transition-colors">
                                    <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center">
                                        <Building2 className="h-5 w-5 text-blue-500" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-foreground font-medium">{deal.company_name}</p>
                                        <p className="text-[10px] text-muted-foreground">View company</p>
                                    </div>
                                </div>
                            </Link>
                        </Panel>
                    )}

                    {/* Agent */}
                    <Panel title="ASSIGNED AGENT">
                        {deal.assigned_agent_name ? (
                            <div className="flex items-center gap-3 p-2 rounded-md bg-muted/30 border border-border">
                                <div className="w-10 h-10 bg-purple-500/10 rounded-full flex items-center justify-center">
                                    <User className="h-5 w-5 text-purple-500" />
                                </div>
                                <div>
                                    <p className="text-xs text-foreground font-medium">{deal.assigned_agent_name}</p>
                                    <p className="text-[10px] text-muted-foreground">Sales Agent</p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground">No agent assigned</p>
                        )}
                    </Panel>

                    {/* Properties */}
                    {deal.property_names && deal.property_names.length > 0 && (
                        <Panel title="PROPERTIES">
                            <div className="space-y-2">
                                {deal.property_names.map((name: string, idx: number) => {
                                    const propertyId = deal.property_ids?.[idx]
                                    return (
                                        <div key={idx} className="flex items-center justify-between p-2 rounded-md bg-muted/30 border border-border">
                                            <div className="flex items-center gap-2">
                                                <Building2 className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-xs text-foreground">{name}</span>
                                            </div>
                                            {propertyId && isFeatureEnabled('valuations') && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 px-2 text-primary hover:text-primary/80"
                                                    onClick={() => router.push(`/dashboard/valuations/new?property_id=${propertyId}`)}
                                                >
                                                    <LineChart className="h-3 w-3 mr-1" />
                                                    Valuation
                                                </Button>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </Panel>
                    )}

                    {/* Tags */}
                    {deal.tags && deal.tags.length > 0 && (
                        <Panel title="TAGS">
                            <div className="flex flex-wrap gap-1">
                                {deal.tags.map((tag: string, idx: number) => (
                                    <span key={idx} className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </Panel>
                    )}

                    {/* Custom Fields */}
                    <Panel title="CUSTOM FIELDS">
                        <Suspense fallback={<div className="animate-pulse h-20 bg-muted/40 rounded-lg" />}>
                            <CustomDealFields dealId={dealId} />
                        </Suspense>
                    </Panel>

                    {/* Lead Source */}
                    {deal.lead_source && (
                        <Panel title="LEAD SOURCE">
                            <p className="text-xs text-foreground">{deal.lead_source}</p>
                            {deal.utm_source && (
                                <p className="text-[10px] text-muted-foreground mt-1">
                                    UTM: {deal.utm_source} / {deal.utm_medium} / {deal.utm_campaign}
                                </p>
                            )}
                        </Panel>
                    )}

                    {/* E-Sign Panel */}
                    <Panel title="E-SIGNATURES">
                        {signatures.length > 0 ? (
                            <div className="space-y-2">
                                {signatures.map((sig) => (
                                    <div key={sig.id} className="flex items-center justify-between p-2 rounded-md bg-muted/30 border border-border">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <PenTool className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                            <div className="min-w-0">
                                                <p className="text-xs text-foreground truncate">{sig.envelope_title}</p>
                                                <p className="text-[10px] text-muted-foreground">
                                                    {sig.signers?.length || 0} signer(s)
                                                </p>
                                            </div>
                                        </div>
                                        <span className={cn(
                                            'text-[9px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0',
                                            sig.status === 'signed' && 'bg-green-500/10 text-green-600 dark:text-green-400',
                                            sig.status === 'sent' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                                            sig.status === 'draft' && 'bg-zinc-500/10 text-muted-foreground',
                                            sig.status === 'voided' && 'bg-red-500/10 text-red-600 dark:text-red-400',
                                            sig.status === 'declined' && 'bg-red-500/10 text-red-600 dark:text-red-400',
                                        )}>
                                            {sig.status?.toUpperCase()}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground mb-2">No signature requests yet</p>
                        )}
                        {documents.length > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full mt-2 text-xs"
                                onClick={() => {
                                    // Navigate to create signature with first document
                                    toast.info('Select a document from the Documents panel to request a signature')
                                }}
                            >
                                <PenTool className="h-3 w-3 mr-1" />
                                Request Signature
                            </Button>
                        )}
                    </Panel>

                    {/* Calendar Events Panel */}
                    <Panel title="CALENDAR EVENTS">
                        {dealEvents.length > 0 ? (
                            <div className="space-y-2">
                                {dealEvents.slice(0, 5).map((event, idx) => (
                                    <div key={event.id || idx} className="flex items-start gap-2 p-2 rounded-md bg-muted/30 border border-border">
                                        <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                                        <div className="min-w-0">
                                            <p className="text-xs text-foreground truncate">{event.title}</p>
                                            <p className="text-[10px] text-muted-foreground">
                                                {new Date(event.startTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                            <span className={cn(
                                                'text-[9px]',
                                                event.status === 'completed' && 'text-green-500',
                                                event.status === 'scheduled' && 'text-blue-500',
                                                event.status === 'cancelled' && 'text-red-500',
                                            )}>
                                                {event.status || 'scheduled'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                {dealEvents.length > 5 && (
                                    <p className="text-[10px] text-muted-foreground text-center">
                                        +{dealEvents.length - 5} more events
                                    </p>
                                )}
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground">No calendar events linked to this deal</p>
                        )}
                    </Panel>
                </div>
            </div>

            {/* ─── Stage Change Dialog ─── */}
            <Dialog open={stageDialogOpen} onOpenChange={setStageDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Change Deal Stage</DialogTitle>
                        <DialogDescription className="text-xs">
                            Move this deal to a different stage in the pipeline.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <label className="text-[10px] text-muted-foreground mb-2 block uppercase">New Stage</label>
                            <Select value={selectedStage} onValueChange={setSelectedStage}>
                                <SelectTrigger className="text-xs">
                                    <SelectValue placeholder="Select stage" />
                                </SelectTrigger>
                                <SelectContent>
                                    {pipeline?.stages?.map((stage: any) => (
                                        <SelectItem key={stage.id} value={stage.id} className="text-xs">
                                            {stage.stage_name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-[10px] text-muted-foreground mb-2 block uppercase">Note (optional)</label>
                            <Textarea
                                placeholder="Add a note about this stage change…"
                                value={stageNote}
                                onChange={(e) => setStageNote(e.target.value)}
                                className="text-xs resize-none"
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setStageDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleStageChange}
                            disabled={!selectedStage || updateStage.isPending}
                        >
                            {updateStage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update Stage'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── Generate Document Dialog ─── */}
            {deal && (
                <GenerateDocumentDialog
                    isOpen={generateDocDialogOpen}
                    onClose={() => setGenerateDocDialogOpen(false)}
                    dealId={dealId}
                    dealTitle={deal.title}
                    onDocumentGenerated={() => {
                        setDocumentRefreshKey((k) => k + 1)
                    }}
                />
            )}

            {/* ─── Status Change Dialog ─── */}
            <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {statusAction === 'won' && 'Mark Deal as Won'}
                            {statusAction === 'lost' && 'Mark Deal as Lost'}
                            {statusAction === 'archived' && 'Archive Deal'}
                            {statusAction === 'active' && 'Reopen Deal'}
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            {statusAction === 'won' && 'Congratulations! Record the final deal value.'}
                            {statusAction === 'lost' && 'Record the reason this deal was lost.'}
                            {statusAction === 'archived' && 'This deal will be moved to the archive.'}
                            {statusAction === 'active' && 'This deal will be reopened as active.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        {statusAction === 'won' && (
                            <div>
                                <label className="text-[10px] text-muted-foreground mb-2 block uppercase">Final Value</label>
                                <Input
                                    type="number"
                                    placeholder="Enter final deal value"
                                    value={statusFinalValue}
                                    onChange={(e) => setStatusFinalValue(e.target.value)}
                                    className="text-xs"
                                />
                            </div>
                        )}
                        {(statusAction === 'lost' || statusAction === 'archived') && (
                            <div>
                                <label className="text-[10px] text-muted-foreground mb-2 block uppercase">Reason</label>
                                <Textarea
                                    placeholder={statusAction === 'lost' ? 'Why was this deal lost?' : 'Reason for archiving'}
                                    value={statusReason}
                                    onChange={(e) => setStatusReason(e.target.value)}
                                    className="text-xs resize-none"
                                    rows={3}
                                />
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>Cancel</Button>
                        <Button
                            onClick={() => {
                                updateStatusMutation.mutate({
                                    status: statusAction,
                                    reason: statusReason || undefined,
                                    final_value: statusFinalValue ? parseFloat(statusFinalValue) : undefined,
                                })
                            }}
                            disabled={updateStatusMutation.isPending}
                            className={cn(
                                statusAction === 'won' && 'bg-green-600 hover:bg-green-700',
                                statusAction === 'lost' && 'bg-red-600 hover:bg-red-700',
                            )}
                        >
                            {updateStatusMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <>
                                    {statusAction === 'won' && 'Mark as Won'}
                                    {statusAction === 'lost' && 'Mark as Lost'}
                                    {statusAction === 'archived' && 'Archive'}
                                    {statusAction === 'active' && 'Reopen'}
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
