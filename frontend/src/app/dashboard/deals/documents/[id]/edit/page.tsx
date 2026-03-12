'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { 
    ArrowLeft,
    Save,
    Loader2,
    Eye,
    Code,
    Settings,
    FileText,
    Copy,
    Check
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select'
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger
} from '@/components/ui/tabs'
import { 
    documentTemplatesApi, 
    DocumentTemplate, 
    DocumentTemplateCategory,
    MergeField
} from '@/lib/crm-api'
import { cn } from '@/lib/utils'

const TEMPLATE_CATEGORIES: { value: DocumentTemplateCategory; label: string }[] = [
    { value: 'offer_letter', label: 'Offer Letters' },
    { value: 'agreement', label: 'Agreements' },
    { value: 'contract', label: 'Contracts' },
    { value: 'receipt', label: 'Receipts' },
    { value: 'disclosure', label: 'Disclosures' },
    { value: 'commission', label: 'Commission' },
    { value: 'other', label: 'Other' }
]

export default function TemplateEditorPage() {
    const params = useParams()
    const router = useRouter()
    const templateId = params.id as string

    const [template, setTemplate] = useState<DocumentTemplate | null>(null)
    const [mergeFields, setMergeFields] = useState<Record<string, MergeField[]>>({})
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [copiedField, setCopiedField] = useState<string | null>(null)
    
    // Form state
    const [formData, setFormData] = useState({
        template_name: '',
        template_description: '',
        category: 'agreement' as DocumentTemplateCategory,
        country_code: 'GH',
        html_content: '',
        css_styles: '',
        requires_stamp_duty: false,
        stamp_duty_rate: 0.5,
        requires_notarization: false,
        notarization_instructions: '',
        requires_witness: false,
        witness_count: 2,
        is_active: true,
        page_size: 'A4',
        page_orientation: 'portrait',
        margin_top: '2.54cm',
        margin_bottom: '2.54cm',
        margin_left: '2.54cm',
        margin_right: '2.54cm'
    })

    useEffect(() => {
        loadTemplate()
        loadMergeFields()
    }, [templateId])

    const loadTemplate = async () => {
        try {
            setIsLoading(true)
            setError(null)
            const data = await documentTemplatesApi.getById(templateId)
            setTemplate(data)
            setFormData({
                template_name: data.template_name || data.name,
                template_description: data.template_description || data.description || '',
                category: data.category,
                country_code: data.country_code || 'GH',
                html_content: data.html_content || data.template_html || '',
                css_styles: data.css_styles || '',
                requires_stamp_duty: data.requires_stamp_duty ?? false,
                stamp_duty_rate: data.stamp_duty_rate || 0.5,
                requires_notarization: data.requires_notarization ?? false,
                notarization_instructions: data.notarization_instructions || '',
                requires_witness: data.requires_witness ?? false,
                witness_count: data.witness_count ?? 2,
                is_active: data.is_active ?? true,
                page_size: data.page_size || 'A4',
                page_orientation: data.page_orientation || 'portrait',
                margin_top: data.margin_top || '2.54cm',
                margin_bottom: data.margin_bottom || '2.54cm',
                margin_left: data.margin_left || '2.54cm',
                margin_right: data.margin_right || '2.54cm'
            })
        } catch (err) {
            console.error('Failed to load template:', err)
            setError('Failed to load template')
        } finally {
            setIsLoading(false)
        }
    }

    const loadMergeFields = async () => {
        try {
            const data = await documentTemplatesApi.getMergeFields(true) as Record<string, MergeField[]>
            setMergeFields(data)
        } catch (err) {
            console.error('Failed to load merge fields:', err)
        }
    }

    const handleSave = async () => {
        try {
            setIsSaving(true)
            await documentTemplatesApi.update(templateId, formData)
            router.push('/dashboard/deals/documents')
        } catch (err) {
            console.error('Failed to save template:', err)
        } finally {
            setIsSaving(false)
        }
    }

    const copyMergeField = (fieldKey: string) => {
        navigator.clipboard.writeText(`{{${fieldKey}}}`)
        setCopiedField(fieldKey)
        setTimeout(() => setCopiedField(null), 2000)
    }

    const insertMergeField = (fieldKey: string) => {
        // Simple insertion at cursor or end
        setFormData(prev => ({
            ...prev,
            html_content: prev.html_content + `{{${fieldKey}}}`
        }))
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
        )
    }

    if (error || !template) {
        return (
            <div className="text-center py-20">
                <p className="font-mono text-sm text-red-400">{error || 'Template not found'}</p>
                <Button variant="link" onClick={() => router.back()} className="text-primary mt-4">
                    Go Back
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
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
                        <h1 className="font-mono text-xl text-foreground">{formData.template_name}</h1>
                        <p className="font-mono text-xs text-muted-foreground">Template Editor</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 mr-4">
                        <Switch
                            checked={formData.is_active}
                            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                        />
                        <span className="font-mono text-xs text-muted-foreground">
                            {formData.is_active ? 'Active' : 'Inactive'}
                        </span>
                    </div>
                    <Button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                        {isSaving ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4 mr-2" />
                        )}
                        Save Template
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                {/* Main Editor */}
                <div className="lg:col-span-3">
                    <Tabs defaultValue="content" className="w-full">
                        <TabsList className="bg-card border border-border">
                            <TabsTrigger value="content" className="font-mono text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                                <Code className="h-3.5 w-3.5 mr-2" />
                                CONTENT
                            </TabsTrigger>
                            <TabsTrigger value="preview" className="font-mono text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                                <Eye className="h-3.5 w-3.5 mr-2" />
                                PREVIEW
                            </TabsTrigger>
                            <TabsTrigger value="settings" className="font-mono text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                                <Settings className="h-3.5 w-3.5 mr-2" />
                                SETTINGS
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="content" className="mt-4">
                            <div className="border border-border bg-card rounded-lg overflow-hidden">
                                <div className="px-3 py-2 bg-muted/50 border-b border-border">
                                    <span className="font-mono text-[10px] text-primary">HTML TEMPLATE</span>
                                </div>
                                <Textarea
                                    value={formData.html_content}
                                    onChange={(e) => setFormData(prev => ({ ...prev, html_content: e.target.value }))}
                                    placeholder="Enter your HTML template content here. Use {{field_key}} for merge fields..."
                                    className="bg-transparent border-0 text-foreground font-mono text-xs resize-none min-h-[500px] focus-visible:ring-0"
                                />
                            </div>
                        </TabsContent>

                        <TabsContent value="preview" className="mt-4">
                            <div className="border border-border rounded-lg overflow-hidden">
                                <div className="px-3 py-2 bg-muted/50 border-b border-border">
                                    <span className="font-mono text-[10px] text-primary">PREVIEW</span>
                                </div>
                                <ScrollArea className="bg-white h-[500px]">
                                    <div 
                                        className="p-8 prose prose-sm max-w-none"
                                        dangerouslySetInnerHTML={{ __html: formData.html_content }}
                                    />
                                </ScrollArea>
                            </div>
                        </TabsContent>

                        <TabsContent value="settings" className="mt-4">
                            <div className="border border-border bg-card rounded-lg p-4 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-muted-foreground">Template Name</Label>
                                        <Input
                                            value={formData.template_name}
                                            onChange={(e) => setFormData(prev => ({ ...prev, template_name: e.target.value }))}
                                            className="bg-muted border-border text-foreground"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-muted-foreground">Category</Label>
                                        <Select 
                                            value={formData.category} 
                                            onValueChange={(v) => setFormData(prev => ({ ...prev, category: v as DocumentTemplateCategory }))}
                                        >
                                            <SelectTrigger className="bg-muted border-border text-foreground">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-popover border-border">
                                                {TEMPLATE_CATEGORIES.map(cat => (
                                                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-muted-foreground">Description</Label>
                                    <Textarea
                                        value={formData.template_description}
                                        onChange={(e) => setFormData(prev => ({ ...prev, template_description: e.target.value }))}
                                        className="bg-muted border-border text-foreground resize-none"
                                        rows={2}
                                    />
                                </div>

                                <div className="grid grid-cols-4 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-muted-foreground">Page Size</Label>
                                        <Select 
                                            value={formData.page_size} 
                                            onValueChange={(v) => setFormData(prev => ({ ...prev, page_size: v }))}
                                        >
                                            <SelectTrigger className="bg-muted border-border text-foreground">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-popover border-border">
                                                <SelectItem value="A4">A4</SelectItem>
                                                <SelectItem value="Letter">Letter</SelectItem>
                                                <SelectItem value="Legal">Legal</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-muted-foreground">Orientation</Label>
                                        <Select 
                                            value={formData.page_orientation} 
                                            onValueChange={(v) => setFormData(prev => ({ ...prev, page_orientation: v }))}
                                        >
                                            <SelectTrigger className="bg-muted border-border text-foreground">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-popover border-border">
                                                <SelectItem value="portrait">Portrait</SelectItem>
                                                <SelectItem value="landscape">Landscape</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-muted-foreground">Country</Label>
                                        <Select 
                                            value={formData.country_code} 
                                            onValueChange={(v) => setFormData(prev => ({ ...prev, country_code: v }))}
                                        >
                                            <SelectTrigger className="bg-muted border-border text-foreground">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-popover border-border">
                                                <SelectItem value="GH">Ghana 🇬🇭</SelectItem>
                                                <SelectItem value="NG">Nigeria 🇳🇬</SelectItem>
                                                <SelectItem value="KE">Kenya 🇰🇪</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="border-t border-border pt-4 space-y-3">
                                    <Label className="text-muted-foreground text-sm">Legal Requirements</Label>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-foreground">Requires Stamp Duty</span>
                                        <Switch
                                            checked={formData.requires_stamp_duty}
                                            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, requires_stamp_duty: checked }))}
                                        />
                                    </div>
                                    {formData.requires_stamp_duty && (
                                        <div className="pl-4 space-y-2">
                                            <Label className="text-muted-foreground text-xs">Stamp Duty Rate (%)</Label>
                                            <Input
                                                type="number"
                                                step="0.1"
                                                value={formData.stamp_duty_rate}
                                                onChange={(e) => setFormData(prev => ({ ...prev, stamp_duty_rate: parseFloat(e.target.value) || 0 }))}
                                                className="bg-muted border-border text-foreground w-32"
                                            />
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-foreground">Requires Notarization</span>
                                        <Switch
                                            checked={formData.requires_notarization}
                                            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, requires_notarization: checked }))}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-foreground">Requires Witnesses</span>
                                        <Switch
                                            checked={formData.requires_witness}
                                            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, requires_witness: checked }))}
                                        />
                                    </div>
                                    {formData.requires_witness && (
                                        <div className="pl-4 space-y-2">
                                            <Label className="text-muted-foreground text-xs">Number of Witnesses</Label>
                                            <Input
                                                type="number"
                                                min={1}
                                                max={10}
                                                value={formData.witness_count}
                                                onChange={(e) => setFormData(prev => ({ ...prev, witness_count: parseInt(e.target.value) || 2 }))}
                                                className="bg-muted border-border text-foreground w-24"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>

                {/* Sidebar - Merge Fields */}
                <div className="lg:col-span-1">
                    <div className="border border-border bg-card rounded-lg sticky top-4">
                        <div className="px-3 py-2 bg-muted/50 border-b border-border">
                            <span className="font-mono text-[10px] text-primary">MERGE FIELDS</span>
                        </div>
                        <ScrollArea className="h-[600px]">
                            <div className="p-3 space-y-4">
                                {Object.entries(mergeFields).map(([group, fields]) => (
                                    <div key={group}>
                                        <h4 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                                            {group}
                                        </h4>
                                        <div className="space-y-1">
                                            {fields.map((field) => (
                                                <div
                                                    key={field.id}
                                                    className="flex items-center justify-between p-2 bg-muted/50 border border-border rounded hover:border-border cursor-pointer group"
                                                    onClick={() => insertMergeField(field.field_key)}
                                                    title={field.description || field.example_value}
                                                >
                                                    <div className="min-w-0 flex-1">
                                                        <p className="font-mono text-[11px] text-foreground truncate">
                                                            {field.field_label}
                                                        </p>
                                                        <p className="font-mono text-[9px] text-muted-foreground">
                                                            {`{{${field.field_key}}}`}
                                                        </p>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            copyMergeField(field.field_key)
                                                        }}
                                                    >
                                                        {copiedField === field.field_key ? (
                                                            <Check className="h-3 w-3 text-green-400" />
                                                        ) : (
                                                            <Copy className="h-3 w-3 text-muted-foreground" />
                                                        )}
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}

                                {Object.keys(mergeFields).length === 0 && (
                                    <div className="text-center py-8">
                                        <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                                        <p className="font-mono text-[10px] text-muted-foreground">
                                            Loading merge fields...
                                        </p>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                </div>
            </div>
        </div>
    )
}
