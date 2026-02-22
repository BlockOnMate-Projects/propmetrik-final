'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn, formatCurrency } from '@/lib/utils'
import {
    ArrowLeft,
    Loader2,
    Save,
    Search,
    Plus,
    X,
    Home,
    MapPin
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
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { dealsApi, pipelinesApi, contactsApi, agentsApi } from '@/lib/crm-api'
import type { DealPipeline, DealStage, Contact, Agent } from '@/types/crm'
import { DealType, DealStatus, AgentStatus } from '@/types/crm'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

// ── Zod schema ──────────────────────────────────────
const dealFormSchema = z.object({
    title: z.string().min(1, 'Deal title is required').max(200),
    description: z.string().max(2000).optional().or(z.literal('')),
    dealType: z.nativeEnum(DealType),
    pipelineId: z.string().uuid('Please select a pipeline'),
    stageId: z.string().uuid('Please select a stage'),
    dealValue: z.string().optional().or(z.literal('')),
    commissionRate: z.string().optional().or(z.literal('')),
    probability: z.string().optional().or(z.literal('')),
    expectedCloseDate: z.string().optional().or(z.literal('')),
    leadSource: z.string().max(100).optional().or(z.literal('')),
    primaryContactId: z.string().uuid('Please select a primary contact'),
    assignedAgentId: z.string().uuid('Please select an assigned agent'),
    tags: z.array(z.string()).optional(),
    selectedPropertyIds: z.array(z.string()).optional(),
})

type DealFormValues = z.infer<typeof dealFormSchema>

// Helper to parse PostgreSQL array format
function parsePostgresArray(value: any): string[] {
    if (Array.isArray(value)) return value
    if (typeof value === 'string') {
        if (value.startsWith('{') && value.endsWith('}')) {
            return value.slice(1, -1).split(',').filter(Boolean)
        }
        try {
            const parsed = JSON.parse(value)
            return Array.isArray(parsed) ? parsed : []
        } catch {
            return []
        }
    }
    return []
}

// Property type for selection
interface PropertyOption {
    id: string
    property_name: string
    address: string
    city: string
    price: number
    currency: string
    property_type: string
    listing_type: string
}

// =====================================================
// MAIN COMPONENT
// =====================================================
export default function NewDealPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const preselectedPropertyId = searchParams.get('propertyId')

    // ── react-hook-form ─────────────────────────────
    const {
        control,
        handleSubmit,
        watch,
        setValue,
        setError,
        formState: { errors, isSubmitting },
    } = useForm<DealFormValues>({
        resolver: zodResolver(dealFormSchema),
        defaultValues: {
            title: '',
            description: '',
            dealType: DealType.SALE,
            pipelineId: '',
            stageId: '',
            dealValue: '',
            commissionRate: '3',
            probability: '50',
            expectedCloseDate: '',
            leadSource: '',
            primaryContactId: '',
            assignedAgentId: '',
            tags: [],
            selectedPropertyIds: [],
        },
    })

    // Watched values for side-effects
    const pipelineId = watch('pipelineId')
    const stageId = watch('stageId')
    const assignedAgentId = watch('assignedAgentId')
    const selectedPropertyIds = watch('selectedPropertyIds') || []
    const primaryContactId = watch('primaryContactId')
    const tags = watch('tags') || []

    // Local UI state (not form data)
    const [tagInput, setTagInput] = useState('')
    const [propertySearch, setPropertySearch] = useState('')
    const [showPropertySearch, setShowPropertySearch] = useState(false)
    const [contactSearch, setContactSearch] = useState('')
    const [submitError, setSubmitError] = useState('')

    // Data state
    const [pipelines, setPipelines] = useState<DealPipeline[]>([])
    const [stages, setStages] = useState<DealStage[]>([])
    const [contacts, setContacts] = useState<Contact[]>([])
    const [agents, setAgents] = useState<Agent[]>([])
    const [properties, setProperties] = useState<PropertyOption[]>([])
    const [isLoading, setIsLoading] = useState(true)

    // Load initial data
    useEffect(() => {
        const loadData = async () => {
            try {
                setIsLoading(true)
                const [pipelinesData, contactsData, propertiesRes, agentsData] = await Promise.all([
                    pipelinesApi.getAll(true),
                    contactsApi.getAll({ limit: 100 }),
                    fetch(`${API_BASE}/crm/properties?limit=100`).then(r => r.ok ? r.json() : { properties: [] }),
                    agentsApi.getAll({ status: AgentStatus.ACTIVE })
                ])

                setPipelines(pipelinesData)
                setContacts(contactsData.data || [])
                setProperties(propertiesRes.properties || [])
                setAgents(agentsData.data || [])

                // Set default pipeline
                const defaultPipeline = pipelinesData.find((p: DealPipeline) => p.is_default && p.pipeline_type === 'sale') || pipelinesData[0]
                if (defaultPipeline) {
                    setValue('pipelineId', defaultPipeline.id)
                    setStages(defaultPipeline.stages || [])
                    const firstStage = defaultPipeline.stages?.sort((a: DealStage, b: DealStage) => a.stage_order - b.stage_order)[0]
                    if (firstStage) {
                        setValue('stageId', firstStage.id)
                    }
                }

                // If property was preselected, add it and set title
                if (preselectedPropertyId) {
                    setValue('selectedPropertyIds', [preselectedPropertyId])
                    const preselectedProperty = (propertiesRes.properties || []).find(
                        (p: PropertyOption) => p.id === preselectedPropertyId
                    )
                    if (preselectedProperty) {
                        setValue('title', `${preselectedProperty.listing_type === 'rent' ? 'Rental' : 'Sale'} - ${preselectedProperty.property_name}`)
                        if (preselectedProperty.price) {
                            setValue('dealValue', preselectedProperty.price.toString())
                        }
                    }
                }
            } catch (err) {
                console.error('Failed to load data:', err)
            } finally {
                setIsLoading(false)
            }
        }
        loadData()
    }, [preselectedPropertyId, setValue])

    // Update stages when pipeline changes
    useEffect(() => {
        const pipeline = pipelines.find(p => p.id === pipelineId)
        if (pipeline) {
            setStages(pipeline.stages || [])
            const firstStage = pipeline.stages?.sort((a: DealStage, b: DealStage) => a.stage_order - b.stage_order)[0]
            if (firstStage) {
                setValue('stageId', firstStage.id)
            }
        }
    }, [pipelineId, pipelines, setValue])

    // Auto-select pipeline based on property type
    useEffect(() => {
        if (selectedPropertyIds.length === 0 || pipelines.length === 0) return

        const selectedProperty = properties.find(p => selectedPropertyIds.includes(p.id))
        if (!selectedProperty) return

        const propertyType = selectedProperty.property_type?.toLowerCase()
        const listingType = selectedProperty.listing_type?.toLowerCase()

        let targetPipeline: DealPipeline | undefined

        if (propertyType === 'land' || propertyType === 'plot') {
            targetPipeline = pipelines.find(p => p.pipeline_type === 'land_acquisition')
        } else if (listingType === 'rent' || listingType === 'rental') {
            targetPipeline = pipelines.find(p => p.pipeline_type === 'rental')
        } else {
            targetPipeline = pipelines.find(p => p.pipeline_type === 'sale' && p.is_default)
                || pipelines.find(p => p.pipeline_type === 'sale')
        }

        if (targetPipeline && targetPipeline.id !== pipelineId) {
            setValue('pipelineId', targetPipeline.id)
            if (listingType === 'rent' || listingType === 'rental') {
                setValue('dealType', DealType.RENTAL)
            } else {
                setValue('dealType', DealType.SALE)
            }
        }
    }, [selectedPropertyIds, properties, pipelines, pipelineId, setValue])

    // Calculate probability when agent or stage changes
    useEffect(() => {
        if (!assignedAgentId || !stageId) return

        const calculateProbability = async () => {
            try {
                const res = await fetch(
                    `${API_BASE}/crm/probability/calculate?agent_id=${assignedAgentId}&stage_id=${stageId}`
                )
                if (res.ok) {
                    const data = await res.json()
                    setValue('probability', data.calculated_probability.toString())
                }
            } catch (err) {
                console.error('Failed to calculate probability:', err)
            }
        }

        calculateProbability()
    }, [assignedAgentId, stageId, setValue])

    // Derived
    const filteredContacts = contacts.filter(c => {
        if (!contactSearch) return true
        const search = contactSearch.toLowerCase()
        return (
            c.first_name?.toLowerCase().includes(search) ||
            c.last_name?.toLowerCase().includes(search) ||
            c.email?.toLowerCase().includes(search) ||
            c.phone_primary?.includes(search)
        )
    })

    const selectedContact = contacts.find(c => c.id === primaryContactId)
    const selectedProperties = properties.filter(p => selectedPropertyIds.includes(p.id))
    const filteredProperties = properties.filter(p => {
        if (!propertySearch) return true
        const search = propertySearch.toLowerCase()
        return (
            p.property_name?.toLowerCase().includes(search) ||
            p.address?.toLowerCase().includes(search) ||
            p.city?.toLowerCase().includes(search)
        )
    }).filter(p => !selectedPropertyIds.includes(p.id))

    // Handlers
    const handleAddTag = useCallback(() => {
        if (tagInput.trim() && !tags.includes(tagInput.trim())) {
            setValue('tags', [...tags, tagInput.trim()])
            setTagInput('')
        }
    }, [tagInput, tags, setValue])

    const handleRemoveTag = useCallback((tag: string) => {
        setValue('tags', tags.filter(t => t !== tag))
    }, [tags, setValue])

    // Submit handler
    const onSubmit = async (data: DealFormValues) => {
        try {
            setSubmitError('')
            const deal = await dealsApi.create({
                title: data.title.trim(),
                description: data.description?.trim() || undefined,
                deal_type: data.dealType,
                pipeline_id: data.pipelineId,
                stage_id: data.stageId,
                deal_value: data.dealValue ? parseFloat(data.dealValue) : undefined,
                commission_rate: data.commissionRate ? parseFloat(data.commissionRate) : undefined,
                probability: data.probability ? parseInt(data.probability) : undefined,
                expected_close_date: data.expectedCloseDate || undefined,
                lead_source: data.leadSource || undefined,
                primary_contact_id: data.primaryContactId || undefined,
                assigned_agent: data.assignedAgentId,
                property_ids: (data.selectedPropertyIds?.length ?? 0) > 0 ? data.selectedPropertyIds : undefined,
                tags: (data.tags?.length ?? 0) > 0 ? data.tags : undefined,
                currency: 'GHS'
            })
            router.push(`/dashboard/deals/${deal.id}`)
        } catch (err) {
            console.error('Failed to create deal:', err)
            setSubmitError('Failed to create deal. Please try again.')
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
        )
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="max-w-4xl mx-auto space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-border">
                <div className="flex items-center gap-4">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => router.back()}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight text-foreground">New Deal</h1>
                        <p className="text-sm text-muted-foreground mt-1">Create a new deal in the pipeline</p>
                    </div>
                </div>
                <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-sm"
                >
                    {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                        <Save className="h-4 w-4 mr-2" />
                    )}
                    Create Deal
                </Button>
            </div>

            {/* Error message */}
            {submitError && (
                <div className="border border-red-900 bg-red-900/20 p-3 text-center">
                    <p className="font-mono text-xs text-red-400">{submitError}</p>
                </div>
            )}

            {/* Basic Info */}
            <Card className="border-border bg-card shadow-sm">
                <CardHeader className="pb-3 border-b border-border">
                    <CardTitle className="text-sm font-medium text-foreground tracking-wide uppercase">Deal Information</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="grid grid-cols-2 gap-6">
                        <div className="col-span-2">
                            <Label className="text-xs font-medium text-muted-foreground uppercase mb-1.5 block">Deal Title *</Label>
                            <Controller
                                name="title"
                                control={control}
                                render={({ field }) => (
                                    <Input
                                        {...field}
                                        placeholder="e.g., 4-Bed Villa Sale - East Legon"
                                        className={cn(
                                            "bg-background border-input text-foreground font-medium",
                                            errors.title && "border-destructive focus-visible:ring-destructive"
                                        )}
                                    />
                                )}
                            />
                            {errors.title && <p className="text-xs text-destructive mt-1.5">{errors.title.message}</p>}
                        </div>

                        <div className="col-span-2">
                            <Label className="text-xs font-medium text-muted-foreground uppercase mb-1.5 block">Description</Label>
                            <Controller
                                name="description"
                                control={control}
                                render={({ field }) => (
                                    <Textarea
                                        {...field}
                                        placeholder="Brief description of the deal..."
                                        className="bg-background border-input text-foreground resize-none min-h-[100px]"
                                        rows={3}
                                    />
                                )}
                            />
                        </div>

                        <div>
                            <Label className="text-xs font-medium text-muted-foreground uppercase mb-1.5 block">Deal Type</Label>
                            <Controller
                                name="dealType"
                                control={control}
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={(v) => field.onChange(v as DealType)}>
                                        <SelectTrigger className="bg-background border-input text-foreground">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="sale">Sale</SelectItem>
                                            <SelectItem value="rental">Rental</SelectItem>
                                            <SelectItem value="joint_venture">Joint Venture</SelectItem>
                                            <SelectItem value="land_acquisition">Land Acquisition</SelectItem>
                                            <SelectItem value="development">Development</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </div>

                        <div>
                            <Label className="text-xs font-medium text-muted-foreground uppercase mb-1.5 block">Lead Source</Label>
                            <Controller
                                name="leadSource"
                                control={control}
                                render={({ field }) => (
                                    <Input
                                        {...field}
                                        placeholder="e.g., Website, Referral, Agent"
                                        className="bg-background border-input text-foreground"
                                    />
                                )}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Property Selection */}
            <Card className="border-border bg-card shadow-sm">
                <CardHeader className="pb-3 border-b border-border">
                    <CardTitle className="text-sm font-medium text-foreground tracking-wide uppercase">Linked Properties</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="space-y-4">
                        {/* Selected properties */}
                        {selectedProperties.length > 0 && (
                            <div className="space-y-2">
                                {selectedProperties.map(property => (
                                    <div
                                        key={property.id}
                                        className="flex items-center justify-between p-3 bg-muted/50 rounded-md border border-border"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-primary/10 rounded flex items-center justify-center">
                                                <Home className="h-4 w-4 text-primary" />
                                            </div>
                                            <div>
                                                <div className="text-sm font-medium text-foreground">{property.property_name}</div>
                                                <div className="flex items-center gap-1 text-muted-foreground">
                                                    <MapPin className="h-3 w-3" />
                                                    <span className="text-xs">{property.city}</span>
                                                    <span className="text-xs text-primary font-medium ml-2 font-mono">
                                                        {formatCurrency(property.price, property.currency)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setValue('selectedPropertyIds', selectedPropertyIds.filter(id => id !== property.id))}
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Add property button / search */}
                        {!showPropertySearch ? (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setShowPropertySearch(true)}
                                className="w-full border-dashed border-input text-muted-foreground hover:text-foreground hover:border-foreground/50 h-10"
                            >
                                <Plus className="h-4 w-4 mr-2" />
                                Add Property to Deal
                            </Button>
                        ) : (
                            <div className="space-y-2">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        value={propertySearch}
                                        onChange={(e) => setPropertySearch(e.target.value)}
                                        placeholder="Search properties..."
                                        className="pl-10 bg-background border-input text-foreground h-10"
                                        autoFocus
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                            setShowPropertySearch(false)
                                            setPropertySearch('')
                                        }}
                                        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                                <div className="max-h-[200px] overflow-y-auto space-y-1 border border-input rounded-md p-1 bg-background">
                                    {filteredProperties.length === 0 ? (
                                        <p className="text-center py-4 text-xs text-muted-foreground">
                                            {propertySearch ? 'No matching properties' : 'No properties available'}
                                        </p>
                                    ) : (
                                        filteredProperties.slice(0, 10).map(property => (
                                            <button
                                                key={property.id}
                                                type="button"
                                                onClick={() => {
                                                    setValue('selectedPropertyIds', [...selectedPropertyIds, property.id])
                                                    setPropertySearch('')
                                                    setShowPropertySearch(false)
                                                }}
                                                className="w-full flex items-center gap-3 p-2 hover:bg-muted rounded text-left transition-colors group"
                                            >
                                                <Home className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                                                        {property.property_name}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground truncate">
                                                        {property.address}, {property.city}
                                                    </div>
                                                </div>
                                                <span className="text-xs text-primary font-medium font-mono">
                                                    {formatCurrency(property.price, property.currency)}
                                                </span>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Pipeline & Stage */}
            <Card className="border-border bg-card shadow-sm">
                <CardHeader className="pb-3 border-b border-border">
                    <CardTitle className="text-sm font-medium text-foreground tracking-wide uppercase">Pipeline & Stage</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <Label className="text-xs font-medium text-muted-foreground uppercase mb-1.5 block">Pipeline *</Label>
                            <Controller
                                name="pipelineId"
                                control={control}
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger className={cn(
                                            "bg-background border-input text-foreground",
                                            errors.pipelineId && "border-destructive focus-visible:ring-destructive"
                                        )}>
                                            <SelectValue placeholder="Select pipeline" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {pipelines.map((pipeline) => (
                                                <SelectItem key={pipeline.id} value={pipeline.id}>
                                                    {pipeline.pipeline_name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                            {errors.pipelineId && <p className="text-xs text-destructive mt-1.5">{errors.pipelineId.message}</p>}
                        </div>

                        <div>
                            <Label className="text-xs font-medium text-muted-foreground uppercase mb-1.5 block">Starting Stage *</Label>
                            <Controller
                                name="stageId"
                                control={control}
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger className={cn(
                                            "bg-background border-input text-foreground",
                                            errors.stageId && "border-destructive focus-visible:ring-destructive"
                                        )}>
                                            <SelectValue placeholder="Select stage" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {stages.sort((a, b) => a.stage_order - b.stage_order).map((stage) => (
                                                <SelectItem key={stage.id} value={stage.id}>
                                                    {stage.stage_name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                            {errors.stageId && <p className="text-xs text-destructive mt-1.5">{errors.stageId.message}</p>}
                        </div>

                        <div className="col-span-2">
                            <Label className="text-xs font-medium text-muted-foreground uppercase mb-1.5 block">Assigned Agent *</Label>
                            <Controller
                                name="assignedAgentId"
                                control={control}
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger className={cn(
                                            "bg-background border-input text-foreground",
                                            errors.assignedAgentId && "border-destructive focus-visible:ring-destructive"
                                        )}>
                                            <SelectValue placeholder="Select agent to handle this deal" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {agents.map((agent) => {
                                                const specs = parsePostgresArray(agent.specializations)
                                                return (
                                                    <SelectItem key={agent.id} value={agent.id}>
                                                        {agent.first_name} {agent.last_name}{specs.length > 0 ? ` • ${specs[0].replace(/_/g, ' ')}` : ''}
                                                    </SelectItem>
                                                )
                                            })}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                            {errors.assignedAgentId && <p className="text-xs text-destructive mt-1.5">{errors.assignedAgentId.message}</p>}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Financials */}
            <Card className="border-border bg-card shadow-sm">
                <CardHeader className="pb-3 border-b border-border">
                    <CardTitle className="text-sm font-medium text-foreground tracking-wide uppercase">Financials</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="grid grid-cols-4 gap-6">
                        <div>
                            <Label className="text-xs font-medium text-muted-foreground uppercase mb-1.5 block">Deal Value (GHS)</Label>
                            <Controller
                                name="dealValue"
                                control={control}
                                render={({ field }) => (
                                    <Input
                                        type="number"
                                        {...field}
                                        placeholder="0.00"
                                        className="bg-background border-input text-foreground font-mono"
                                    />
                                )}
                            />
                        </div>

                        <div>
                            <Label className="text-xs font-medium text-muted-foreground uppercase mb-1.5 block">Commission (%)</Label>
                            <Controller
                                name="commissionRate"
                                control={control}
                                render={({ field }) => (
                                    <Input
                                        type="number"
                                        {...field}
                                        placeholder="3"
                                        className="bg-background border-input text-foreground font-mono"
                                    />
                                )}
                            />
                        </div>

                        <div>
                            <Label className="text-xs font-medium text-muted-foreground uppercase mb-1.5 flex items-center gap-1">
                                Probability (%)
                                <span className="text-primary cursor-help" title="Auto-calculated based on stage probability">
                                    ⓘ
                                </span>
                            </Label>
                            <Controller
                                name="probability"
                                control={control}
                                render={({ field }) => (
                                    <Input
                                        type="number"
                                        {...field}
                                        placeholder="50"
                                        min="0"
                                        max="100"
                                        className="bg-background border-input text-foreground font-mono"
                                    />
                                )}
                            />
                            <p className="text-[10px] text-muted-foreground mt-1">
                                Auto-calculated
                            </p>
                        </div>

                        <div>
                            <Label className="text-xs font-medium text-muted-foreground uppercase mb-1.5 block">Expected Close</Label>
                            <Controller
                                name="expectedCloseDate"
                                control={control}
                                render={({ field }) => (
                                    <Input
                                        type="date"
                                        {...field}
                                        className="bg-background border-input text-foreground"
                                    />
                                )}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Contact */}
            <Card className="border-border bg-card shadow-sm">
                <CardHeader className="pb-3 border-b border-border">
                    <CardTitle className="text-sm font-medium text-foreground tracking-wide uppercase">Primary Contact *</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="space-y-3">
                        {errors.primaryContactId && (
                            <p className="text-xs text-destructive">{errors.primaryContactId.message}</p>
                        )}
                        {selectedContact ? (
                            <div className="flex items-center justify-between p-3 bg-muted/50 border border-border rounded-md">
                                <div>
                                    <p className="text-sm font-medium text-foreground">
                                        {selectedContact.first_name} {selectedContact.last_name}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {selectedContact.email || selectedContact.phone_primary || 'No contact info'}
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setValue('primaryContactId', '')}
                                    className="text-muted-foreground hover:text-destructive"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ) : (
                            <>
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search contacts..."
                                        value={contactSearch}
                                        onChange={(e) => setContactSearch(e.target.value)}
                                        className="pl-9 bg-background border-input text-foreground"
                                    />
                                </div>
                                <div className="max-h-48 overflow-y-auto space-y-1">
                                    {filteredContacts.slice(0, 10).map((contact) => (
                                        <button
                                            key={contact.id}
                                            type="button"
                                            onClick={() => {
                                                setValue('primaryContactId', contact.id)
                                                setContactSearch('')
                                            }}
                                            className="w-full text-left p-2 rounded-md hover:bg-muted transition-colors group"
                                        >
                                            <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                                                {contact.first_name} {contact.last_name}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {contact.email || contact.phone_primary || 'No contact info'}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Tags */}
            <Card className="border-border bg-card shadow-sm">
                <CardHeader className="pb-3 border-b border-border">
                    <CardTitle className="text-sm font-medium text-foreground tracking-wide uppercase">Tags</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="space-y-3">
                        <div className="flex gap-2">
                            <Input
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault()
                                        handleAddTag()
                                    }
                                }}
                                placeholder="Add tag..."
                                className="flex-1 bg-background border-input text-foreground"
                            />
                            <Button
                                type="button"
                                onClick={handleAddTag}
                                variant="outline"
                                className="border-input text-muted-foreground hover:text-foreground"
                            >
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                        {tags.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {tags.map((tag) => (
                                    <span
                                        key={tag}
                                        className="text-xs px-2.5 py-1 bg-muted text-foreground border border-border flex items-center gap-1.5 rounded-full"
                                    >
                                        {tag}
                                        <button type="button" onClick={() => handleRemoveTag(tag)} className="text-muted-foreground hover:text-destructive transition-colors">
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </form>
    )
}
