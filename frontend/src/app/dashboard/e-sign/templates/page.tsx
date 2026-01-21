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
    Users,
    Calendar,
    FolderOpen
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
import { esignApi, ESignTemplate } from '@/lib/property-management-api'
import { format } from 'date-fns'

const TEMPLATE_CATEGORIES = [
    'Lease Agreements',
    'Property Management',
    'Amendments',
    'Notices',
    'Disclosures',
    'General',
    'Custom'
]

export default function TemplatesPage() {
    const router = useRouter()
    const [templates, setTemplates] = useState<ESignTemplate[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedCategory, setSelectedCategory] = useState<string | undefined>()
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
    const [templateToDelete, setTemplateToDelete] = useState<ESignTemplate | null>(null)
    
    // New template form state
    const [newTemplate, setNewTemplate] = useState({
        name: '',
        description: '',
        category: 'General'
    })
    const [isCreating, setIsCreating] = useState(false)

    useEffect(() => {
        loadTemplates()
    }, [searchTerm, selectedCategory])

    const loadTemplates = async () => {
        try {
            setIsLoading(true)
            const data = await esignApi.getTemplates({
                search: searchTerm || undefined,
                category: selectedCategory
            })
            setTemplates(data || [])
        } catch (err) {
            console.error('Failed to load templates:', err)
            setTemplates([])
        } finally {
            setIsLoading(false)
        }
    }

    const handleCreateTemplate = async () => {
        if (!newTemplate.name.trim()) return
        
        try {
            setIsCreating(true)
            const created = await esignApi.createTemplate({
                name: newTemplate.name,
                description: newTemplate.description,
                category: newTemplate.category,
                fieldDefinitions: [],
                roles: []
            })
            setTemplates(prev => [created, ...prev])
            setIsCreateDialogOpen(false)
            setNewTemplate({ name: '', description: '', category: 'General' })
            // Optionally navigate to edit the new template
            router.push(`/dashboard/e-sign/templates/${created.id}/edit`)
        } catch (err) {
            console.error('Failed to create template:', err)
        } finally {
            setIsCreating(false)
        }
    }

    const handleDeleteTemplate = async () => {
        if (!templateToDelete) return
        
        try {
            await esignApi.deleteTemplate(templateToDelete.id)
            setTemplates(prev => prev.filter(t => t.id !== templateToDelete.id))
            setIsDeleteDialogOpen(false)
            setTemplateToDelete(null)
        } catch (err) {
            console.error('Failed to delete template:', err)
        }
    }

    const handleDuplicate = async (template: ESignTemplate) => {
        try {
            const duplicated = await esignApi.createTemplate({
                name: `${template.name} (Copy)`,
                description: template.description,
                category: template.category,
                documentHtml: template.documentHtml,
                fieldDefinitions: template.fieldDefinitions,
                roles: template.roles
            })
            setTemplates(prev => [duplicated, ...prev])
        } catch (err) {
            console.error('Failed to duplicate template:', err)
        }
    }

    return (
        <div className="min-h-screen bg-black p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <FileText className="h-6 w-6 text-amber-500" />
                        E-Sign Templates
                    </h1>
                    <p className="text-zinc-500 text-sm mt-1">
                        Create and manage reusable document templates for e-signatures
                    </p>
                </div>
                <Button
                    onClick={() => setIsCreateDialogOpen(true)}
                    className="bg-amber-600 hover:bg-amber-700 text-black"
                >
                    <Plus className="h-4 w-4 mr-2" />
                    New Template
                </Button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4 mb-6">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <Input
                        placeholder="Search templates..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 bg-zinc-900 border-zinc-800 text-white"
                    />
                </div>
                <Select value={selectedCategory} onValueChange={(v) => setSelectedCategory(v === 'all' ? undefined : v)}>
                    <SelectTrigger className="w-48 bg-zinc-900 border-zinc-800 text-white">
                        <Filter className="h-4 w-4 mr-2 text-zinc-400" />
                        <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-950 border-zinc-800">
                        <SelectItem value="all">All Categories</SelectItem>
                        {TEMPLATE_CATEGORIES.map(cat => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Templates Grid */}
            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
                </div>
            ) : templates.length === 0 ? (
                <div className="text-center py-20">
                    <FolderOpen className="h-16 w-16 text-zinc-700 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-white mb-2">No templates found</h3>
                    <p className="text-zinc-500 mb-6">
                        {searchTerm || selectedCategory 
                            ? 'Try adjusting your search or filters'
                            : 'Create your first template to get started'}
                    </p>
                    {!searchTerm && !selectedCategory && (
                        <Button
                            onClick={() => setIsCreateDialogOpen(true)}
                            className="bg-amber-600 hover:bg-amber-700 text-black"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Create Template
                        </Button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {templates.map((template) => (
                        <Card 
                            key={template.id} 
                            className="bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 transition-colors"
                        >
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <CardTitle className="text-white text-lg line-clamp-1">
                                            {template.name}
                                        </CardTitle>
                                        <CardDescription className="text-zinc-500 line-clamp-2 mt-1">
                                            {template.description || 'No description'}
                                        </CardDescription>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="text-zinc-400">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="bg-zinc-950 border-zinc-800">
                                            <DropdownMenuItem 
                                                onClick={() => router.push(`/dashboard/e-sign/templates/${template.id}`)}
                                                className="text-zinc-300"
                                            >
                                                <Eye className="h-4 w-4 mr-2" />
                                                View
                                            </DropdownMenuItem>
                                            <DropdownMenuItem 
                                                onClick={() => router.push(`/dashboard/e-sign/templates/${template.id}/edit`)}
                                                className="text-zinc-300"
                                            >
                                                <Edit className="h-4 w-4 mr-2" />
                                                Edit
                                            </DropdownMenuItem>
                                            <DropdownMenuItem 
                                                onClick={() => handleDuplicate(template)}
                                                className="text-zinc-300"
                                            >
                                                <Copy className="h-4 w-4 mr-2" />
                                                Duplicate
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator className="bg-zinc-800" />
                                            <DropdownMenuItem 
                                                onClick={() => {
                                                    setTemplateToDelete(template)
                                                    setIsDeleteDialogOpen(true)
                                                }}
                                                className="text-red-400"
                                            >
                                                <Trash2 className="h-4 w-4 mr-2" />
                                                Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-2 mb-3">
                                    <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">
                                        {template.category}
                                    </Badge>
                                    {template.isShared && (
                                        <Badge className="text-[10px] bg-blue-900/50 text-blue-400">
                                            Shared
                                        </Badge>
                                    )}
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                                    <div className="flex items-center gap-1">
                                        <Users className="h-3 w-3" />
                                        <span>{template.roles?.length || 0} roles</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <FileText className="h-3 w-3" />
                                        <span>{template.fieldDefinitions?.length || 0} fields</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span>Used {template.usedCount || 0}x</span>
                                    </div>
                                </div>
                                <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center text-[10px] text-zinc-600">
                                    <Calendar className="h-3 w-3 mr-1" />
                                    Updated {template.updatedAt && format(new Date(template.updatedAt), 'MMM d, yyyy')}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Create Template Dialog */}
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogContent className="bg-zinc-950 border-zinc-800">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <Plus className="h-5 w-5 text-amber-500" />
                            Create New Template
                        </DialogTitle>
                        <DialogDescription className="text-zinc-500">
                            Create a reusable template for common documents
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <Label className="text-zinc-400">Template Name *</Label>
                            <Input
                                value={newTemplate.name}
                                onChange={(e) => setNewTemplate(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="e.g., Residential Lease Agreement"
                                className="mt-2 bg-black border-zinc-800 text-white"
                            />
                        </div>
                        <div>
                            <Label className="text-zinc-400">Description</Label>
                            <Textarea
                                value={newTemplate.description}
                                onChange={(e) => setNewTemplate(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Brief description of this template..."
                                className="mt-2 bg-black border-zinc-800 text-white"
                                rows={3}
                            />
                        </div>
                        <div>
                            <Label className="text-zinc-400">Category</Label>
                            <Select 
                                value={newTemplate.category} 
                                onValueChange={(v) => setNewTemplate(prev => ({ ...prev, category: v }))}
                            >
                                <SelectTrigger className="mt-2 bg-black border-zinc-800 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-950 border-zinc-800">
                                    {TEMPLATE_CATEGORIES.map(cat => (
                                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsCreateDialogOpen(false)}
                            className="border-zinc-800 text-zinc-400"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCreateTemplate}
                            disabled={!newTemplate.name.trim() || isCreating}
                            className="bg-amber-600 hover:bg-amber-700 text-black"
                        >
                            {isCreating ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <Plus className="h-4 w-4 mr-2" />
                            )}
                            Create Template
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent className="bg-zinc-950 border-zinc-800">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <Trash2 className="h-5 w-5 text-red-500" />
                            Delete Template
                        </DialogTitle>
                        <DialogDescription className="text-zinc-500">
                            Are you sure you want to delete "{templateToDelete?.name}"? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsDeleteDialogOpen(false)}
                            className="border-zinc-800 text-zinc-400"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleDeleteTemplate}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
