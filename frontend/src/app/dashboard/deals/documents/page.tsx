'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
    Plus, 
    FileText, 
    Loader2, 
    Search, 
    Filter, 
    MoreVertical,
    Edit,
    Trash2,
    Copy,
    Eye,
    FolderOpen,
    Stamp,
    Scale,
    Users,
    Globe,
    RefreshCw,
    Download
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { EmptyState } from '@/components/crm/EmptyState'
import { 
    documentTemplatesApi, 
    DocumentTemplate, 
    DocumentTemplateCategory 
} from '@/lib/crm-api'
import { format } from 'date-fns'

const TEMPLATE_CATEGORIES: { value: DocumentTemplateCategory; label: string }[] = [
    { value: 'offer_letter', label: 'Offer Letters' },
    { value: 'agreement', label: 'Agreements' },
    { value: 'contract', label: 'Contracts' },
    { value: 'receipt', label: 'Receipts' },
    { value: 'disclosure', label: 'Disclosures' },
    { value: 'commission', label: 'Commission' },
    { value: 'other', label: 'Other' }
]

const getCategoryColor = (category: DocumentTemplateCategory) => {
    switch (category) {
        case 'offer_letter': return 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 border-blue-800'
        case 'agreement': return 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 border-amber-800'
        case 'contract': return 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 border-green-800'
        case 'receipt': return 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 border-purple-800'
        case 'disclosure': return 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 border-red-800'
        case 'commission': return 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-600 dark:text-cyan-400 border-cyan-800'
        default: return 'bg-muted text-muted-foreground border-border'
    }
}

export default function DocumentTemplatesPage() {
    const router = useRouter()
    const [templates, setTemplates] = useState<DocumentTemplate[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedCategory, setSelectedCategory] = useState<DocumentTemplateCategory | undefined>()
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    
    // Dialogs
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
    const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false)
    const [templateToDelete, setTemplateToDelete] = useState<DocumentTemplate | null>(null)
    const [templateToPreview, setTemplateToPreview] = useState<DocumentTemplate | null>(null)
    const [isSeeding, setIsSeeding] = useState(false)
    
    // New template form state
    const [newTemplate, setNewTemplate] = useState({
        template_name: '',
        template_description: '',
        category: 'agreement' as DocumentTemplateCategory,
        country_code: 'GH',
        requires_stamp_duty: false,
        requires_notarization: false,
        requires_witness: false,
        witness_count: 2
    })
    const [isCreating, setIsCreating] = useState(false)

    useEffect(() => {
        loadTemplates()
    }, [searchTerm, selectedCategory, page])

    const loadTemplates = async () => {
        try {
            setIsLoading(true)
            const data = await documentTemplatesApi.getAll({
                search: searchTerm || undefined,
                category: selectedCategory,
                page,
                limit: 20
            })
            setTemplates(data.templates || [])
            setTotal(data.total || 0)
        } catch (err) {
            console.error('Failed to load templates:', err)
            setTemplates([])
        } finally {
            setIsLoading(false)
        }
    }

    const handleCreateTemplate = async () => {
        if (!newTemplate.template_name.trim()) return
        
        try {
            setIsCreating(true)
            const created = await documentTemplatesApi.create({
                ...newTemplate,
                html_content: `
                    <div class="document">
                        <h1>{{deal.title}}</h1>
                        <p>Date: {{document.generation_date}}</p>
                        <p>This is a template for ${newTemplate.template_name}.</p>
                        <p>Deal Value: {{deal.deal_value}}</p>
                        <p>Contact: {{contact.full_name}}</p>
                    </div>
                `.trim()
            })
            setTemplates(prev => [created, ...prev])
            setIsCreateDialogOpen(false)
            setNewTemplate({
                template_name: '',
                template_description: '',
                category: 'agreement',
                country_code: 'GH',
                requires_stamp_duty: false,
                requires_notarization: false,
                requires_witness: false,
                witness_count: 2
            })
            // Navigate to edit
            router.push(`/dashboard/deals/documents/${created.id}/edit`)
        } catch (err) {
            console.error('Failed to create template:', err)
        } finally {
            setIsCreating(false)
        }
    }

    const handleDeleteTemplate = async () => {
        if (!templateToDelete) return
        
        try {
            await documentTemplatesApi.delete(templateToDelete.id)
            setTemplates(prev => prev.filter(t => t.id !== templateToDelete.id))
            setIsDeleteDialogOpen(false)
            setTemplateToDelete(null)
        } catch (err) {
            console.error('Failed to delete template:', err)
        }
    }

    const handleDuplicate = async (template: DocumentTemplate) => {
        try {
            const duplicated = await documentTemplatesApi.duplicate(template.id)
            setTemplates(prev => [duplicated, ...prev])
        } catch (err) {
            console.error('Failed to duplicate template:', err)
        }
    }

    const handleSeedGhanaTemplates = async () => {
        try {
            setIsSeeding(true)
            const result = await documentTemplatesApi.seedGhanaTemplates()
            setTemplates(prev => [...result.templates, ...prev])
        } catch (err) {
            console.error('Failed to seed templates:', err)
        } finally {
            setIsSeeding(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-border">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-3">
                        <FileText className="h-6 w-6 text-primary" />
                        Document Templates
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Create and manage document templates for deal workflows
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        onClick={handleSeedGhanaTemplates}
                        variant="outline"
                        disabled={isSeeding}
                    >
                        {isSeeding ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Download className="h-4 w-4 mr-2" />
                        )}
                        Seed Ghana Templates
                    </Button>
                    <Button
                        onClick={() => setIsCreateDialogOpen(true)}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-sm h-9 px-4 rounded-md shadow-sm"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        New Template
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search templates..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <Select 
                    value={selectedCategory || 'all'} 
                    onValueChange={(v) => setSelectedCategory(v === 'all' ? undefined : v as DocumentTemplateCategory)}
                >
                    <SelectTrigger className="w-48">
                        <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                        <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {TEMPLATE_CATEGORIES.map(cat => (
                            <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button 
                    variant="ghost" 
                    onClick={loadTemplates}
                    className="text-muted-foreground hover:text-foreground"
                >
                    <RefreshCw className="h-4 w-4" />
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
                <Card className="shadow-sm">
                    <CardContent className="p-4">
                        <div className="text-xs font-medium text-muted-foreground mb-1">Total Templates</div>
                        <div className="text-2xl font-bold text-foreground">{total}</div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm">
                    <CardContent className="p-4">
                        <div className="text-xs font-medium text-muted-foreground mb-1">Stamp Duty Req.</div>
                        <div className="text-2xl font-bold text-primary">
                            {templates.filter(t => t.requires_stamp_duty).length}
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm">
                    <CardContent className="p-4">
                        <div className="text-xs font-medium text-muted-foreground mb-1">Notarization Req.</div>
                        <div className="text-2xl font-bold text-purple-500">
                            {templates.filter(t => t.requires_notarization).length}
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm">
                    <CardContent className="p-4">
                        <div className="text-xs font-medium text-muted-foreground mb-1">Witness Req.</div>
                        <div className="text-2xl font-bold text-cyan-500">
                            {templates.filter(t => t.requires_witness).length}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Templates Grid */}
            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                </div>
            ) : templates.length === 0 ? (
                <EmptyState
                    icon={FolderOpen}
                    title="No Templates Found"
                    description={
                        searchTerm || selectedCategory 
                            ? 'Try adjusting your search or filters'
                            : 'Create your first template or seed Ghana templates to get started'
                    }
                    actions={!searchTerm && !selectedCategory ? [
                        {
                            label: 'Create Template',
                            onClick: () => setIsCreateDialogOpen(true),
                            icon: Plus,
                        },
                        {
                            label: 'Seed Ghana Templates',
                            onClick: handleSeedGhanaTemplates,
                            icon: Download,
                            variant: 'outline' as const,
                        }
                    ] : undefined}
                />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {templates.map((template) => (
                        <Card 
                            key={template.id} 
                            className="shadow-sm hover:border-border/80 transition-colors"
                        >
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <CardTitle className="text-foreground text-lg line-clamp-1">
                                            {template.template_name}
                                        </CardTitle>
                                        <CardDescription className="line-clamp-2 mt-1">
                                            {template.template_description || 'No description'}
                                        </CardDescription>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="text-muted-foreground">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                            <DropdownMenuItem 
                                                onClick={() => {
                                                    setTemplateToPreview(template)
                                                    setIsPreviewDialogOpen(true)
                                                }}
                                            >
                                                <Eye className="h-4 w-4 mr-2" />
                                                Preview
                                            </DropdownMenuItem>
                                            <DropdownMenuItem 
                                                onClick={() => router.push(`/dashboard/deals/documents/${template.id}/edit`)}
                                            >
                                                <Edit className="h-4 w-4 mr-2" />
                                                Edit
                                            </DropdownMenuItem>
                                            <DropdownMenuItem 
                                                onClick={() => handleDuplicate(template)}
                                            >
                                                <Copy className="h-4 w-4 mr-2" />
                                                Duplicate
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem 
                                                onClick={() => {
                                                    setTemplateToDelete(template)
                                                    setIsDeleteDialogOpen(true)
                                                }}
                                                className="text-red-600 dark:text-red-400"
                                            >
                                                <Trash2 className="h-4 w-4 mr-2" />
                                                Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-2 mb-3 flex-wrap">
                                    <Badge 
                                        variant="outline" 
                                        className={`text-[10px] ${getCategoryColor(template.category)}`}
                                    >
                                        {template.category.replace('_', ' ')}
                                    </Badge>
                                    <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
                                        <Globe className="h-2.5 w-2.5 mr-1" />
                                        {template.country_code}
                                    </Badge>
                                    {!template.is_active && (
                                        <Badge className="text-[10px] bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400">
                                            Inactive
                                        </Badge>
                                    )}
                                </div>
                                
                                {/* Requirements indicators */}
                                <div className="flex items-center gap-3 mb-3 text-[10px]">
                                    {template.requires_stamp_duty && (
                                        <div className="flex items-center gap-1 text-primary">
                                            <Stamp className="h-3 w-3" />
                                            <span>Stamp Duty</span>
                                        </div>
                                    )}
                                    {template.requires_notarization && (
                                        <div className="flex items-center gap-1 text-purple-500">
                                            <Scale className="h-3 w-3" />
                                            <span>Notarization</span>
                                        </div>
                                    )}
                                    {template.requires_witness && (
                                        <div className="flex items-center gap-1 text-cyan-500">
                                            <Users className="h-3 w-3" />
                                            <span>{template.witness_count} Witnesses</span>
                                        </div>
                                    )}
                                </div>
                                
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span>v{template.version}</span>
                                    <span>
                                        Updated {format(new Date(template.updated_at), 'MMM d, yyyy')}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Create Template Dialog */}
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Create New Template</DialogTitle>
                        <DialogDescription>
                            Create a new document template for your deal workflows.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Template Name</Label>
                            <Input
                                value={newTemplate.template_name}
                                onChange={(e) => setNewTemplate(prev => ({ ...prev, template_name: e.target.value }))}
                                placeholder="e.g., Sales Agreement"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea
                                value={newTemplate.template_description}
                                onChange={(e) => setNewTemplate(prev => ({ ...prev, template_description: e.target.value }))}
                                placeholder="Brief description of this template..."
                                className="resize-none"
                                rows={2}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Category</Label>
                                <Select 
                                    value={newTemplate.category} 
                                    onValueChange={(v) => setNewTemplate(prev => ({ ...prev, category: v as DocumentTemplateCategory }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {TEMPLATE_CATEGORIES.map(cat => (
                                            <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Country</Label>
                                <Select 
                                    value={newTemplate.country_code} 
                                    onValueChange={(v) => setNewTemplate(prev => ({ ...prev, country_code: v }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="GH">Ghana 🇬🇭</SelectItem>
                                        <SelectItem value="NG">Nigeria 🇳🇬</SelectItem>
                                        <SelectItem value="KE">Kenya 🇰🇪</SelectItem>
                                        <SelectItem value="ZA">South Africa 🇿🇦</SelectItem>
                                        <SelectItem value="US">United States 🇺🇸</SelectItem>
                                        <SelectItem value="GB">United Kingdom 🇬🇧</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        
                        <div className="space-y-3 pt-2 border-t border-border">
                            <Label className="text-sm">Legal Requirements</Label>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Stamp className="h-4 w-4 text-primary" />
                                    <span className="text-sm text-foreground">Requires Stamp Duty</span>
                                </div>
                                <Switch
                                    checked={newTemplate.requires_stamp_duty}
                                    onCheckedChange={(checked) => setNewTemplate(prev => ({ ...prev, requires_stamp_duty: checked }))}
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Scale className="h-4 w-4 text-purple-500" />
                                    <span className="text-sm text-foreground">Requires Notarization</span>
                                </div>
                                <Switch
                                    checked={newTemplate.requires_notarization}
                                    onCheckedChange={(checked) => setNewTemplate(prev => ({ ...prev, requires_notarization: checked }))}
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Users className="h-4 w-4 text-cyan-500" />
                                    <span className="text-sm text-foreground">Requires Witnesses</span>
                                </div>
                                <Switch
                                    checked={newTemplate.requires_witness}
                                    onCheckedChange={(checked) => setNewTemplate(prev => ({ ...prev, requires_witness: checked }))}
                                />
                            </div>
                            {newTemplate.requires_witness && (
                                <div className="pl-6 space-y-2">
                                    <Label className="text-xs">Number of Witnesses</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={10}
                                        value={newTemplate.witness_count}
                                        onChange={(e) => setNewTemplate(prev => ({ ...prev, witness_count: parseInt(e.target.value) || 2 }))}
                                        className="w-24"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button 
                            variant="outline" 
                            onClick={() => setIsCreateDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleCreateTemplate}
                            disabled={!newTemplate.template_name.trim() || isCreating}
                            className="bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                            {isCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Create Template
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Template</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete &quot;{templateToDelete?.template_name}&quot;? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button 
                            variant="outline" 
                            onClick={() => setIsDeleteDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleDeleteTemplate}
                            variant="destructive"
                        >
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Preview Dialog */}
            <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
                <DialogContent className="max-w-4xl max-h-[80vh]">
                    <DialogHeader>
                        <DialogTitle>
                            {templateToPreview?.template_name}
                        </DialogTitle>
                        <DialogDescription>
                            Template preview with sample merge fields
                        </DialogDescription>
                    </DialogHeader>
                    <div className="bg-card rounded-lg p-8 overflow-auto max-h-[60vh]">
                        {templateToPreview?.html_content ? (
                            <div 
                                dangerouslySetInnerHTML={{ __html: templateToPreview.html_content }}
                                className="prose prose-sm max-w-none"
                            />
                        ) : (
                            <p className="text-muted-foreground text-center py-8">No content available</p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button 
                            onClick={() => setIsPreviewDialogOpen(false)}
                        >
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
