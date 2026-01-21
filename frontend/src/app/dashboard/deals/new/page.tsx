'use client'

import React, { useEffect, useState } from 'react'
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
import { dealsApi, pipelinesApi, contactsApi, agentsApi } from '@/lib/crm-api'
import type { DealPipeline, DealStage, Contact, Agent } from '@/types/crm'
import { DealType, DealStatus, AgentStatus } from '@/types/crm'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

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
// PANEL COMPONENT
// =====================================================
function Panel({ title, children, className }: { 
    title: string; 
    children: React.ReactNode; 
    className?: string;
}) {
    return (
        <div className={cn('border border-zinc-800 bg-zinc-900/50', className)}>
            <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-800">
                <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
            </div>
            <div className="p-4">{children}</div>
        </div>
    )
}

// =====================================================
// MAIN COMPONENT
// =====================================================
export default function NewDealPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const preselectedPropertyId = searchParams.get('propertyId')

    // Form state
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [dealType, setDealType] = useState<DealType>(DealType.SALE)
    const [pipelineId, setPipelineId] = useState('')
    const [stageId, setStageId] = useState('')
    const [dealValue, setDealValue] = useState('')
    const [commissionRate, setCommissionRate] = useState('3')
    const [probability, setProbability] = useState('50')
    const [expectedCloseDate, setExpectedCloseDate] = useState('')
    const [leadSource, setLeadSource] = useState('')
    const [primaryContactId, setPrimaryContactId] = useState('')
    const [assignedAgentId, setAssignedAgentId] = useState('')
    const [tags, setTags] = useState<string[]>([])
    const [tagInput, setTagInput] = useState('')

    // Property selection state
    const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([])
    const [properties, setProperties] = useState<PropertyOption[]>([])
    const [propertySearch, setPropertySearch] = useState('')
    const [showPropertySearch, setShowPropertySearch] = useState(false)

    // Data state
    const [pipelines, setPipelines] = useState<DealPipeline[]>([])
    const [stages, setStages] = useState<DealStage[]>([])
    const [contacts, setContacts] = useState<Contact[]>([])
    const [contactSearch, setContactSearch] = useState('')
    const [agents, setAgents] = useState<Agent[]>([])

    // UI state
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [errors, setErrors] = useState<Record<string, string>>({})

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
                const defaultPipeline = pipelinesData.find(p => p.is_default && p.pipeline_type === 'sale') || pipelinesData[0]
                if (defaultPipeline) {
                    setPipelineId(defaultPipeline.id)
                    setStages(defaultPipeline.stages || [])
                    // Set first stage as default
                    const firstStage = defaultPipeline.stages?.sort((a, b) => a.stage_order - b.stage_order)[0]
                    if (firstStage) {
                        setStageId(firstStage.id)
                    }
                }

                // If property was preselected, add it and set title
                if (preselectedPropertyId) {
                    setSelectedPropertyIds([preselectedPropertyId])
                    const preselectedProperty = (propertiesRes.properties || []).find(
                        (p: PropertyOption) => p.id === preselectedPropertyId
                    )
                    if (preselectedProperty) {
                        setTitle(`${preselectedProperty.listing_type === 'rent' ? 'Rental' : 'Sale'} - ${preselectedProperty.property_name}`)
                        if (preselectedProperty.price) {
                            setDealValue(preselectedProperty.price.toString())
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
    }, [preselectedPropertyId])

    // Update stages when pipeline changes
    useEffect(() => {
        const pipeline = pipelines.find(p => p.id === pipelineId)
        if (pipeline) {
            setStages(pipeline.stages || [])
            const firstStage = pipeline.stages?.sort((a, b) => a.stage_order - b.stage_order)[0]
            if (firstStage) {
                setStageId(firstStage.id)
            }
        }
    }, [pipelineId, pipelines])

    // Auto-select pipeline based on property type
    useEffect(() => {
        if (selectedPropertyIds.length === 0 || pipelines.length === 0) return
        
        // Get the first selected property's type
        const selectedProperty = properties.find(p => selectedPropertyIds.includes(p.id))
        if (!selectedProperty) return
        
        const propertyType = selectedProperty.property_type?.toLowerCase()
        const listingType = selectedProperty.listing_type?.toLowerCase()
        
        // Determine the appropriate pipeline based on property/listing type
        let targetPipeline = null
        
        if (propertyType === 'land' || propertyType === 'plot') {
            // Use Land Acquisition Pipeline for land
            targetPipeline = pipelines.find(p => p.pipeline_type === 'land_acquisition')
        } else if (listingType === 'rent' || listingType === 'rental') {
            // Use Rental Pipeline for rentals
            targetPipeline = pipelines.find(p => p.pipeline_type === 'rental')
        } else {
            // Use Sales Pipeline for all other properties
            targetPipeline = pipelines.find(p => p.pipeline_type === 'sale' && p.is_default)
                || pipelines.find(p => p.pipeline_type === 'sale')
        }
        
        if (targetPipeline && targetPipeline.id !== pipelineId) {
            setPipelineId(targetPipeline.id)
            // Update deal type to match
            if (listingType === 'rent' || listingType === 'rental') {
                setDealType(DealType.RENTAL)
            } else {
                setDealType(DealType.SALE)
            }
        }
    }, [selectedPropertyIds, properties, pipelines])

    // Calculate probability when agent or stage changes
    useEffect(() => {
        const calculateProbability = async () => {
            if (!assignedAgentId || !stageId) return
            
            try {
                const res = await fetch(
                    `${API_BASE}/crm/probability/calculate?agent_id=${assignedAgentId}&stage_id=${stageId}`
                )
                if (res.ok) {
                    const data = await res.json()
                    setProbability(data.calculated_probability.toString())
                }
            } catch (err) {
                console.error('Failed to calculate probability:', err)
            }
        }
        
        calculateProbability()
    }, [assignedAgentId, stageId])

    // Filter contacts by search
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

    // Get selected contact
    const selectedContact = contacts.find(c => c.id === primaryContactId)

    // Handle tag add
    const handleAddTag = () => {
        if (tagInput.trim() && !tags.includes(tagInput.trim())) {
            setTags([...tags, tagInput.trim()])
            setTagInput('')
        }
    }

    // Handle tag remove
    const handleRemoveTag = (tag: string) => {
        setTags(tags.filter(t => t !== tag))
    }

    // Validate form
    const validate = (): boolean => {
        const newErrors: Record<string, string> = {}

        if (!title.trim()) {
            newErrors.title = 'Deal title is required'
        }
        if (!pipelineId) {
            newErrors.pipeline = 'Please select a pipeline'
        }
        if (!stageId) {
            newErrors.stage = 'Please select a stage'
        }
        if (!assignedAgentId) {
            newErrors.agent = 'Please select an assigned agent'
        }
        if (!primaryContactId) {
            newErrors.contact = 'Please select a primary contact'
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    // Handle save
    const handleSave = async () => {
        if (!validate()) return

        try {
            setIsSaving(true)

            const deal = await dealsApi.create({
                title: title.trim(),
                description: description.trim() || undefined,
                deal_type: dealType,
                pipeline_id: pipelineId,
                stage_id: stageId,
                deal_value: dealValue ? parseFloat(dealValue) : undefined,
                commission_rate: commissionRate ? parseFloat(commissionRate) : undefined,
                probability: probability ? parseInt(probability) : undefined,
                expected_close_date: expectedCloseDate || undefined,
                lead_source: leadSource || undefined,
                primary_contact_id: primaryContactId || undefined,
                assigned_agent: assignedAgentId,
                property_ids: selectedPropertyIds.length > 0 ? selectedPropertyIds : undefined,
                tags: tags.length > 0 ? tags : undefined,
                currency: 'GHS'
            })

            router.push(`/dashboard/deals/${deal.id}`)
        } catch (err) {
            console.error('Failed to create deal:', err)
            setErrors({ submit: 'Failed to create deal. Please try again.' })
        } finally {
            setIsSaving(false)
        }
    }

    // Get selected properties for display
    const selectedProperties = properties.filter(p => selectedPropertyIds.includes(p.id))

    // Filter properties for search
    const filteredProperties = properties.filter(p => {
        if (!propertySearch) return true
        const search = propertySearch.toLowerCase()
        return (
            p.property_name?.toLowerCase().includes(search) ||
            p.address?.toLowerCase().includes(search) ||
            p.city?.toLowerCase().includes(search)
        )
    }).filter(p => !selectedPropertyIds.includes(p.id))

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => router.back()}
                        className="text-zinc-400 hover:text-white"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="font-mono text-xl text-white">NEW DEAL</h1>
                        <p className="font-mono text-[10px] text-zinc-500">Create a new deal in the pipeline</p>
                    </div>
                </div>
                <Button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-amber-500 text-black hover:bg-amber-400 font-mono text-xs"
                >
                    {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                        <Save className="h-4 w-4 mr-2" />
                    )}
                    CREATE DEAL
                </Button>
            </div>

            {/* Error message */}
            {errors.submit && (
                <div className="border border-red-900 bg-red-900/20 p-3 text-center">
                    <p className="font-mono text-xs text-red-400">{errors.submit}</p>
                </div>
            )}

            {/* Basic Info */}
            <Panel title="DEAL INFORMATION">
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <Label className="font-mono text-[10px] text-zinc-500">DEAL TITLE *</Label>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g., 4-Bed Villa Sale - East Legon"
                            className={cn(
                                "mt-1 bg-zinc-800 border-zinc-700 text-white font-mono text-xs",
                                errors.title && "border-red-500"
                            )}
                        />
                        {errors.title && <p className="font-mono text-[10px] text-red-400 mt-1">{errors.title}</p>}
                    </div>

                    <div className="col-span-2">
                        <Label className="font-mono text-[10px] text-zinc-500">DESCRIPTION</Label>
                        <Textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Brief description of the deal..."
                            className="mt-1 bg-zinc-800 border-zinc-700 text-white font-mono text-xs resize-none"
                            rows={3}
                        />
                    </div>

                    <div>
                        <Label className="font-mono text-[10px] text-zinc-500">DEAL TYPE</Label>
                        <Select value={dealType} onValueChange={(v) => setDealType(v as DealType)}>
                            <SelectTrigger className="mt-1 bg-zinc-800 border-zinc-700 text-white font-mono text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-700">
                                <SelectItem value="sale" className="font-mono text-xs text-white">Sale</SelectItem>
                                <SelectItem value="rental" className="font-mono text-xs text-white">Rental</SelectItem>
                                <SelectItem value="joint_venture" className="font-mono text-xs text-white">Joint Venture</SelectItem>
                                <SelectItem value="land_acquisition" className="font-mono text-xs text-white">Land Acquisition</SelectItem>
                                <SelectItem value="development" className="font-mono text-xs text-white">Development</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <Label className="font-mono text-[10px] text-zinc-500">LEAD SOURCE</Label>
                        <Input
                            value={leadSource}
                            onChange={(e) => setLeadSource(e.target.value)}
                            placeholder="e.g., Website, Referral, Agent"
                            className="mt-1 bg-zinc-800 border-zinc-700 text-white font-mono text-xs"
                        />
                    </div>
                </div>
            </Panel>

            {/* Property Selection */}
            <Panel title="LINKED PROPERTIES">
                <div className="space-y-4">
                    {/* Selected properties */}
                    {selectedProperties.length > 0 && (
                        <div className="space-y-2">
                            {selectedProperties.map(property => (
                                <div 
                                    key={property.id}
                                    className="flex items-center justify-between p-3 bg-zinc-800 rounded border border-zinc-700"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-amber-500/20 rounded flex items-center justify-center">
                                            <Home className="h-4 w-4 text-amber-500" />
                                        </div>
                                        <div>
                                            <div className="font-mono text-xs text-white">{property.property_name}</div>
                                            <div className="flex items-center gap-1 text-zinc-500">
                                                <MapPin className="h-3 w-3" />
                                                <span className="font-mono text-[10px]">{property.city}</span>
                                                <span className="font-mono text-[10px] text-amber-500 ml-2">
                                                    {formatCurrency(property.price, property.currency)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setSelectedPropertyIds(prev => prev.filter(id => id !== property.id))}
                                        className="h-6 w-6 text-zinc-400 hover:text-red-400"
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
                            className="w-full border-dashed border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Property to Deal
                        </Button>
                    ) : (
                        <div className="space-y-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                                <Input
                                    value={propertySearch}
                                    onChange={(e) => setPropertySearch(e.target.value)}
                                    placeholder="Search properties..."
                                    className="pl-10 bg-zinc-800 border-zinc-700 text-white font-mono text-xs"
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
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 text-zinc-400"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                            <div className="max-h-[200px] overflow-y-auto space-y-1">
                                {filteredProperties.length === 0 ? (
                                    <p className="text-center py-4 font-mono text-[10px] text-zinc-500">
                                        {propertySearch ? 'No matching properties' : 'No properties available'}
                                    </p>
                                ) : (
                                    filteredProperties.slice(0, 10).map(property => (
                                        <button
                                            key={property.id}
                                            type="button"
                                            onClick={() => {
                                                setSelectedPropertyIds(prev => [...prev, property.id])
                                                setPropertySearch('')
                                                setShowPropertySearch(false)
                                            }}
                                            className="w-full flex items-center gap-3 p-2 hover:bg-zinc-800 rounded text-left transition-colors"
                                        >
                                            <Home className="h-4 w-4 text-zinc-500" />
                                            <div className="flex-1 min-w-0">
                                                <div className="font-mono text-xs text-white truncate">
                                                    {property.property_name}
                                                </div>
                                                <div className="font-mono text-[10px] text-zinc-500 truncate">
                                                    {property.address}, {property.city}
                                                </div>
                                            </div>
                                            <span className="font-mono text-[10px] text-amber-500">
                                                {formatCurrency(property.price, property.currency)}
                                            </span>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </Panel>

            {/* Pipeline & Stage */}
            <Panel title="PIPELINE & STAGE">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label className="font-mono text-[10px] text-zinc-500">PIPELINE *</Label>
                        <Select value={pipelineId} onValueChange={setPipelineId}>
                            <SelectTrigger className={cn(
                                "mt-1 bg-zinc-800 border-zinc-700 text-white font-mono text-xs",
                                errors.pipeline && "border-red-500"
                            )}>
                                <SelectValue placeholder="Select pipeline" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-700">
                                {pipelines.map((pipeline) => (
                                    <SelectItem 
                                        key={pipeline.id} 
                                        value={pipeline.id}
                                        className="font-mono text-xs text-white"
                                    >
                                        {pipeline.pipeline_name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {errors.pipeline && <p className="font-mono text-[10px] text-red-400 mt-1">{errors.pipeline}</p>}
                    </div>

                    <div>
                        <Label className="font-mono text-[10px] text-zinc-500">STARTING STAGE *</Label>
                        <Select value={stageId} onValueChange={setStageId}>
                            <SelectTrigger className={cn(
                                "mt-1 bg-zinc-800 border-zinc-700 text-white font-mono text-xs",
                                errors.stage && "border-red-500"
                            )}>
                                <SelectValue placeholder="Select stage" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-700">
                                {stages.sort((a, b) => a.stage_order - b.stage_order).map((stage) => (
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
                        {errors.stage && <p className="font-mono text-[10px] text-red-400 mt-1">{errors.stage}</p>}
                    </div>

                    <div className="col-span-2">
                        <Label className="font-mono text-[10px] text-zinc-500">ASSIGNED AGENT *</Label>
                        <Select value={assignedAgentId} onValueChange={setAssignedAgentId}>
                            <SelectTrigger className={cn(
                                "mt-1 bg-zinc-800 border-zinc-700 text-white font-mono text-xs",
                                errors.agent && "border-red-500"
                            )}>
                                <SelectValue placeholder="Select agent to handle this deal" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-700">
                                {agents.map((agent) => {
                                    const specs = parsePostgresArray(agent.specializations)
                                    return (
                                        <SelectItem 
                                            key={agent.id} 
                                            value={agent.id}
                                            className="font-mono text-xs text-white"
                                        >
                                            {agent.first_name} {agent.last_name}{specs.length > 0 ? ` • ${specs[0].replace(/_/g, ' ')}` : ''}
                                        </SelectItem>
                                    )
                                })}
                            </SelectContent>
                        </Select>
                        {errors.agent && <p className="font-mono text-[10px] text-red-400 mt-1">{errors.agent}</p>}
                    </div>
                </div>
            </Panel>

            {/* Financials */}
            <Panel title="DEAL VALUE & COMMISSION">
                <div className="grid grid-cols-4 gap-4">
                    <div>
                        <Label className="font-mono text-[10px] text-zinc-500">DEAL VALUE (GHS)</Label>
                        <Input
                            type="number"
                            value={dealValue}
                            onChange={(e) => setDealValue(e.target.value)}
                            placeholder="0.00"
                            className="mt-1 bg-zinc-800 border-zinc-700 text-white font-mono text-xs"
                        />
                    </div>

                    <div>
                        <Label className="font-mono text-[10px] text-zinc-500">COMMISSION RATE (%)</Label>
                        <Input
                            type="number"
                            value={commissionRate}
                            onChange={(e) => setCommissionRate(e.target.value)}
                            placeholder="3"
                            className="mt-1 bg-zinc-800 border-zinc-700 text-white font-mono text-xs"
                        />
                    </div>

                    <div>
                        <Label className="font-mono text-[10px] text-zinc-500 flex items-center gap-1">
                            PROBABILITY (%)
                            <span className="text-amber-500 cursor-help" title="Auto-calculated based on stage probability weighted by agent's historical closing rate">
                                ⓘ
                            </span>
                        </Label>
                        <Input
                            type="number"
                            value={probability}
                            onChange={(e) => setProbability(e.target.value)}
                            placeholder="50"
                            min="0"
                            max="100"
                            className="mt-1 bg-zinc-800 border-zinc-700 text-white font-mono text-xs"
                        />
                        <p className="font-mono text-[9px] text-zinc-600 mt-0.5">
                            Auto-calculated from agent performance
                        </p>
                    </div>

                    <div>
                        <Label className="font-mono text-[10px] text-zinc-500">EXPECTED CLOSE DATE</Label>
                        <Input
                            type="date"
                            value={expectedCloseDate}
                            onChange={(e) => setExpectedCloseDate(e.target.value)}
                            className="mt-1 bg-zinc-800 border-zinc-700 text-white font-mono text-xs"
                        />
                    </div>
                </div>
            </Panel>

            {/* Contact */}
            <Panel title="PRIMARY CONTACT *">
                <div className="space-y-3">
                    {errors.contact && (
                        <p className="font-mono text-[10px] text-red-400">{errors.contact}</p>
                    )}
                    {selectedContact ? (
                        <div className="flex items-center justify-between p-3 bg-zinc-800/50 border border-zinc-700">
                            <div>
                                <p className="font-mono text-xs text-white">
                                    {selectedContact.first_name} {selectedContact.last_name}
                                </p>
                                <p className="font-mono text-[10px] text-zinc-500">
                                    {selectedContact.email || selectedContact.phone_primary || 'No contact info'}
                                </p>
                            </div>
                            <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => setPrimaryContactId('')}
                                className="text-zinc-400 hover:text-red-400"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                                <Input
                                    placeholder="Search contacts..."
                                    value={contactSearch}
                                    onChange={(e) => setContactSearch(e.target.value)}
                                    className="pl-8 bg-zinc-800 border-zinc-700 text-white font-mono text-xs"
                                />
                            </div>
                            <div className="max-h-48 overflow-y-auto space-y-1">
                                {filteredContacts.slice(0, 10).map((contact) => (
                                    <button
                                        key={contact.id}
                                        onClick={() => {
                                            setPrimaryContactId(contact.id)
                                            setContactSearch('')
                                        }}
                                        className="w-full text-left p-2 bg-zinc-800/50 border border-zinc-700 hover:border-amber-500/50 transition-colors"
                                    >
                                        <p className="font-mono text-xs text-white">
                                            {contact.first_name} {contact.last_name}
                                        </p>
                                        <p className="font-mono text-[10px] text-zinc-500">
                                            {contact.email || contact.phone_primary || 'No contact info'}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </Panel>

            {/* Tags */}
            <Panel title="TAGS">
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
                            className="flex-1 bg-zinc-800 border-zinc-700 text-white font-mono text-xs"
                        />
                        <Button 
                            onClick={handleAddTag}
                            variant="outline"
                            className="border-zinc-700 text-zinc-300"
                        >
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                    {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {tags.map((tag) => (
                                <span 
                                    key={tag}
                                    className="font-mono text-[10px] px-2 py-0.5 bg-zinc-800 text-zinc-300 border border-zinc-700 flex items-center gap-1"
                                >
                                    {tag}
                                    <button onClick={() => handleRemoveTag(tag)} className="text-zinc-500 hover:text-red-400">
                                        <X className="h-3 w-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </Panel>
        </div>
    )
}
