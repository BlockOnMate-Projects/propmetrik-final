'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    ArrowLeft,
    Loader2,
    Save,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import { useForm, Controller } from 'react-hook-form'
import { toast } from 'sonner'
import { dealsApi, contactsApi, agentsApi } from '@/lib/crm-api'
import { useDeal, useUpdateDeal } from '@/hooks/crm/use-deals'
import type { Contact, Agent } from '@/types/crm'
import { DealType, AgentStatus } from '@/types/crm'

// ── Form shape ──
interface EditDealFormValues {
    title: string
    description: string
    dealType: string
    dealValue: string
    commissionRate: string
    probability: string
    expectedCloseDate: string
    leadSource: string
    primaryContactId: string
    assignedAgentId: string
}

const LEAD_SOURCES = [
    'Website', 'Property Listing', 'Contact Form', 'Valuation Request',
    'Facebook', 'Instagram', 'WhatsApp', 'Referral', 'Event',
    'Walk In', 'Diaspora Campaign', 'Google Ads', 'Other',
]

export default function EditDealPage() {
    const params = useParams()
    const router = useRouter()
    const dealId = params.id as string

    const { data: deal, isLoading: dealLoading } = useDeal(dealId)
    const updateDeal = useUpdateDeal()

    const [contacts, setContacts] = useState<Contact[]>([])
    const [agents, setAgents] = useState<Agent[]>([])
    const [loadingRefs, setLoadingRefs] = useState(true)

    const {
        control,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting, isDirty },
    } = useForm<EditDealFormValues>({
        defaultValues: {
            title: '',
            description: '',
            dealType: 'sale',
            dealValue: '',
            commissionRate: '',
            probability: '',
            expectedCloseDate: '',
            leadSource: '',
            primaryContactId: '',
            assignedAgentId: '',
        },
    })

    // Load reference data
    useEffect(() => {
        const load = async () => {
            try {
                const [contactsRes, agentsRes] = await Promise.all([
                    contactsApi.getAll({ limit: 200 }),
                    agentsApi.getAll({ limit: 200 }),
                ])
                const contactsList = Array.isArray(contactsRes) ? contactsRes : (contactsRes as any)?.data || []
                const agentsList = Array.isArray(agentsRes) ? agentsRes : (agentsRes as any)?.data || []
                setContacts(contactsList)
                setAgents(agentsList.filter((a: Agent) => a.status === AgentStatus.ACTIVE))
            } catch { /* silent */ }
            setLoadingRefs(false)
        }
        load()
    }, [])

    // Pre-fill form when deal loads
    useEffect(() => {
        if (deal) {
            reset({
                title: deal.title || '',
                description: deal.description || '',
                dealType: deal.deal_type || 'sale',
                dealValue: deal.deal_value ? String(deal.deal_value) : '',
                commissionRate: deal.commission_rate ? String(deal.commission_rate) : '',
                probability: (deal as any).close_probability ? String((deal as any).close_probability) : deal.probability ? String(deal.probability) : '',
                expectedCloseDate: deal.expected_close_date
                    ? String(deal.expected_close_date).slice(0, 10)
                    : '',
                leadSource: deal.lead_source || '',
                primaryContactId: deal.primary_contact_id || '',
                assignedAgentId: deal.assigned_agent || '',
            })
        }
    }, [deal, reset])

    const onSubmit = async (data: EditDealFormValues) => {
        try {
            await updateDeal.mutateAsync({
                id: dealId,
                data: {
                    title: data.title,
                    description: data.description || undefined,
                    deal_type: data.dealType as DealType,
                    deal_value: data.dealValue ? parseFloat(data.dealValue) : undefined,
                    commission_rate: data.commissionRate ? parseFloat(data.commissionRate) : undefined,
                    probability: data.probability ? parseInt(data.probability) : undefined,
                    expected_close_date: data.expectedCloseDate || undefined,
                    lead_source: data.leadSource
                        ? data.leadSource.toLowerCase().replace(/\s+/g, '_')
                        : undefined,
                    primary_contact_id: data.primaryContactId || undefined,
                    assigned_agent: data.assignedAgentId || undefined,
                } as any,
            })
            toast.success('Deal updated successfully')
            router.push(`/dashboard/deals/${dealId}`)
        } catch (err: any) {
            toast.error(err?.message || 'Failed to update deal')
        }
    }

    if (dealLoading || loadingRefs) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (!deal) {
        return (
            <div className="text-center py-20">
                <p className="text-sm text-destructive">Deal not found</p>
                <Button variant="link" onClick={() => router.back()} className="text-primary mt-4">
                    Go Back
                </Button>
            </div>
        )
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.back()}
                    className="text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-xl font-semibold text-foreground">Edit Deal</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">{deal.deal_number} — {deal.title}</p>
                </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                {/* Basic Information */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Basic Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Title */}
                        <div className="space-y-1.5">
                            <Label htmlFor="title" className="text-xs">Deal Title *</Label>
                            <Controller
                                name="title"
                                control={control}
                                rules={{ required: 'Title is required' }}
                                render={({ field }) => (
                                    <Input {...field} id="title" placeholder="Enter deal title" className="text-sm" />
                                )}
                            />
                            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
                        </div>

                        {/* Description */}
                        <div className="space-y-1.5">
                            <Label htmlFor="description" className="text-xs">Description</Label>
                            <Controller
                                name="description"
                                control={control}
                                render={({ field }) => (
                                    <Textarea {...field} id="description" placeholder="Deal description" rows={3} className="text-sm resize-none" />
                                )}
                            />
                        </div>

                        {/* Deal Type */}
                        <div className="space-y-1.5">
                            <Label className="text-xs">Deal Type</Label>
                            <Controller
                                name="dealType"
                                control={control}
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger className="text-sm">
                                            <SelectValue placeholder="Select type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="sale">Sale</SelectItem>
                                            <SelectItem value="rental">Rental</SelectItem>
                                            <SelectItem value="lease">Lease</SelectItem>
                                            <SelectItem value="development">Development</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Financial Details */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Financial Details</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs">Deal Value (GH₵)</Label>
                            <Controller
                                name="dealValue"
                                control={control}
                                render={({ field }) => (
                                    <Input {...field} type="number" step="0.01" placeholder="0.00" className="text-sm" />
                                )}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">Commission Rate (%)</Label>
                            <Controller
                                name="commissionRate"
                                control={control}
                                render={({ field }) => (
                                    <Input {...field} type="number" step="0.1" placeholder="3" className="text-sm" />
                                )}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">Probability (%)</Label>
                            <Controller
                                name="probability"
                                control={control}
                                render={({ field }) => (
                                    <Input {...field} type="number" min="0" max="100" placeholder="50" className="text-sm" />
                                )}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">Expected Close Date</Label>
                            <Controller
                                name="expectedCloseDate"
                                control={control}
                                render={({ field }) => (
                                    <Input {...field} type="date" className="text-sm" />
                                )}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* People & Source */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm">People & Source</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Primary Contact */}
                        <div className="space-y-1.5">
                            <Label className="text-xs">Primary Contact</Label>
                            <Controller
                                name="primaryContactId"
                                control={control}
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger className="text-sm">
                                            <SelectValue placeholder="Select contact" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {contacts.map((contact) => (
                                                <SelectItem key={contact.id} value={contact.id} className="text-sm">
                                                    {contact.first_name} {contact.last_name}
                                                    {contact.email && ` — ${contact.email}`}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </div>

                        {/* Assigned Agent */}
                        <div className="space-y-1.5">
                            <Label className="text-xs">Assigned Agent</Label>
                            <Controller
                                name="assignedAgentId"
                                control={control}
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger className="text-sm">
                                            <SelectValue placeholder="Select agent" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {agents.map((agent) => (
                                                <SelectItem key={agent.id} value={agent.id} className="text-sm">
                                                    {agent.display_name || `${agent.first_name} ${agent.last_name}`}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </div>

                        {/* Lead Source */}
                        <div className="space-y-1.5">
                            <Label className="text-xs">Lead Source</Label>
                            <Controller
                                name="leadSource"
                                control={control}
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger className="text-sm">
                                            <SelectValue placeholder="Select lead source" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {LEAD_SOURCES.map((source) => (
                                                <SelectItem key={source} value={source} className="text-sm">
                                                    {source}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pb-8">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => router.back()}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        disabled={isSubmitting || !isDirty}
                        className="min-w-[120px]"
                    >
                        {isSubmitting ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                            <Save className="h-4 w-4 mr-2" />
                        )}
                        Save Changes
                    </Button>
                </div>
            </form>
        </div>
    )
}
