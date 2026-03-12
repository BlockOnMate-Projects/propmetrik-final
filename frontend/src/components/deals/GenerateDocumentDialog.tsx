'use client'

import React, { useState, useEffect } from 'react'
import { 
    FileText, 
    Loader2, 
    Search, 
    Eye,
    Download,
    Check,
    AlertCircle,
    Stamp,
    Scale,
    Users
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog'
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger
} from '@/components/ui/tabs'
import { 
    documentTemplatesApi, 
    documentGenerationApi,
    DocumentTemplate, 
    DocumentTemplateCategory 
} from '@/lib/crm-api'
import { cn } from '@/lib/utils'

interface GenerateDocumentDialogProps {
    isOpen: boolean
    onClose: () => void
    dealId: string
    dealTitle: string
    onDocumentGenerated?: (doc: any) => void
}

const getCategoryColor = (category: DocumentTemplateCategory) => {
    switch (category) {
        case 'offer_letter': return 'bg-blue-900/50 text-blue-400 border-blue-800'
        case 'agreement': return 'bg-amber-900/50 text-amber-400 border-amber-800'
        case 'contract': return 'bg-green-900/50 text-green-400 border-green-800'
        case 'receipt': return 'bg-purple-900/50 text-purple-400 border-purple-800'
        case 'disclosure': return 'bg-red-900/50 text-red-400 border-red-800'
        case 'commission': return 'bg-cyan-900/50 text-cyan-400 border-cyan-800'
        default: return 'bg-zinc-800/50 text-zinc-400 border-zinc-700'
    }
}

export function GenerateDocumentDialog({
    isOpen,
    onClose,
    dealId,
    dealTitle,
    onDocumentGenerated
}: GenerateDocumentDialogProps) {
    const [templates, setTemplates] = useState<DocumentTemplate[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null)
    const [isGenerating, setIsGenerating] = useState(false)
    const [isPreviewing, setIsPreviewing] = useState(false)
    const [previewHtml, setPreviewHtml] = useState<string | null>(null)
    const [generationResult, setGenerationResult] = useState<{ success: boolean; message: string } | null>(null)

    useEffect(() => {
        if (isOpen) {
            loadTemplates()
        }
    }, [isOpen])

    const loadTemplates = async () => {
        try {
            setIsLoading(true)
            const data = await documentTemplatesApi.getAll({ is_active: true, limit: 100 })
            setTemplates(data.templates || [])
        } catch (err) {
            console.error('Failed to load templates:', err)
        } finally {
            setIsLoading(false)
        }
    }

    const handlePreview = async () => {
        if (!selectedTemplate) return
        
        try {
            setIsPreviewing(true)
            const result = await documentGenerationApi.preview({
                template_id: selectedTemplate.id,
                deal_id: dealId
            })
            setPreviewHtml(result.html)
        } catch (err) {
            console.error('Failed to preview:', err)
        } finally {
            setIsPreviewing(false)
        }
    }

    const handleGenerate = async () => {
        if (!selectedTemplate) return
        
        try {
            setIsGenerating(true)
            setGenerationResult(null)
            const doc = await documentGenerationApi.generate({
                template_id: selectedTemplate.id,
                deal_id: dealId,
                output_format: 'pdf'
            })
            setGenerationResult({ 
                success: true, 
                message: `Document "${doc.document_number}" generated successfully!` 
            })
            onDocumentGenerated?.(doc)
        } catch (err: any) {
            console.error('Failed to generate:', err)
            setGenerationResult({ 
                success: false, 
                message: err.message || 'Failed to generate document' 
            })
        } finally {
            setIsGenerating(false)
        }
    }

    const handleClose = () => {
        setSelectedTemplate(null)
        setPreviewHtml(null)
        setGenerationResult(null)
        setSearchTerm('')
        onClose()
    }

    const filteredTemplates = templates.filter(t => 
        t.template_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.template_description?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    // Group templates by category
    const groupedTemplates = filteredTemplates.reduce((acc, template) => {
        if (!acc[template.category]) {
            acc[template.category] = []
        }
        acc[template.category].push(template)
        return acc
    }, {} as Record<string, DocumentTemplate[]>)

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="bg-zinc-900 border-zinc-800 max-w-4xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-white flex items-center gap-2">
                        <FileText className="h-5 w-5 text-amber-500" />
                        Generate Document
                    </DialogTitle>
                    <DialogDescription className="text-zinc-500">
                        Select a template to generate a document for "{dealTitle}"
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="select" className="flex-1 flex flex-col min-h-0">
                    <TabsList className="bg-zinc-800 border border-zinc-700">
                        <TabsTrigger 
                            value="select" 
                            className="font-mono text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-white"
                        >
                            SELECT TEMPLATE
                        </TabsTrigger>
                        <TabsTrigger 
                            value="preview" 
                            disabled={!selectedTemplate}
                            className="font-mono text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-white"
                        >
                            PREVIEW
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="select" className="flex-1 mt-4 min-h-0">
                        <div className="space-y-4 h-full flex flex-col">
                            {/* Search */}
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                                <Input
                                    placeholder="Search templates..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10 bg-zinc-800 border-zinc-700 text-white"
                                />
                            </div>

                            {/* Templates List */}
                            <ScrollArea className="flex-1 pr-4 -mr-4">
                                {isLoading ? (
                                    <div className="flex items-center justify-center py-12">
                                        <Loader2 className="h-6 w-6 text-amber-500 animate-spin" />
                                    </div>
                                ) : Object.keys(groupedTemplates).length === 0 ? (
                                    <div className="text-center py-12">
                                        <FileText className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
                                        <p className="text-zinc-500 text-sm">No templates found</p>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
                                            <div key={category}>
                                                <h4 className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
                                                    {category.replace('_', ' ')}
                                                </h4>
                                                <div className="space-y-2">
                                                    {categoryTemplates.map((template) => (
                                                        <div
                                                            key={template.id}
                                                            onClick={() => setSelectedTemplate(template)}
                                                            className={cn(
                                                                'p-3 border rounded-lg cursor-pointer transition-all',
                                                                selectedTemplate?.id === template.id
                                                                    ? 'border-amber-500 bg-amber-500/10'
                                                                    : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
                                                            )}
                                                        >
                                                            <div className="flex items-start justify-between">
                                                                <div className="flex-1">
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <span className="font-mono text-sm text-white">
                                                                            {template.template_name}
                                                                        </span>
                                                                        {selectedTemplate?.id === template.id && (
                                                                            <Check className="h-4 w-4 text-amber-500" />
                                                                        )}
                                                                    </div>
                                                                    <p className="font-mono text-[11px] text-zinc-500 line-clamp-1">
                                                                        {template.template_description || 'No description'}
                                                                    </p>
                                                                </div>
                                                                <Badge 
                                                                    variant="outline" 
                                                                    className={`text-[9px] ml-2 ${getCategoryColor(template.category)}`}
                                                                >
                                                                    {template.category.replace('_', ' ')}
                                                                </Badge>
                                                            </div>
                                                            
                                                            {/* Requirements */}
                                                            <div className="flex items-center gap-3 mt-2 text-[10px]">
                                                                {template.requires_stamp_duty && (
                                                                    <div className="flex items-center gap-1 text-amber-500">
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
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </ScrollArea>
                        </div>
                    </TabsContent>

                    <TabsContent value="preview" className="flex-1 mt-4 min-h-0 flex flex-col">
                        {!previewHtml ? (
                            <div className="flex-1 flex items-center justify-center">
                                <Button
                                    onClick={handlePreview}
                                    disabled={isPreviewing}
                                    className="bg-zinc-800 text-white hover:bg-zinc-700"
                                >
                                    {isPreviewing ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <Eye className="h-4 w-4 mr-2" />
                                    )}
                                    Load Preview
                                </Button>
                            </div>
                        ) : (
                            <ScrollArea className="flex-1 bg-white rounded-lg">
                                <div 
                                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                                    className="p-8 prose prose-sm max-w-none"
                                />
                            </ScrollArea>
                        )}
                    </TabsContent>
                </Tabs>

                {/* Generation Result */}
                {generationResult && (
                    <div className={cn(
                        'p-3 rounded-lg flex items-center gap-2',
                        generationResult.success 
                            ? 'bg-green-900/30 border border-green-800' 
                            : 'bg-red-900/30 border border-red-800'
                    )}>
                        {generationResult.success ? (
                            <Check className="h-4 w-4 text-green-400" />
                        ) : (
                            <AlertCircle className="h-4 w-4 text-red-400" />
                        )}
                        <span className={cn(
                            'font-mono text-xs',
                            generationResult.success ? 'text-green-400' : 'text-red-400'
                        )}>
                            {generationResult.message}
                        </span>
                    </div>
                )}

                <DialogFooter className="border-t border-zinc-800 pt-4">
                    <Button 
                        variant="outline" 
                        onClick={handleClose}
                        className="border-zinc-700 text-zinc-300"
                    >
                        {generationResult?.success ? 'Close' : 'Cancel'}
                    </Button>
                    {!generationResult?.success && (
                        <Button 
                            onClick={handleGenerate}
                            disabled={!selectedTemplate || isGenerating}
                            className="bg-amber-600 hover:bg-amber-700 text-white"
                        >
                            {isGenerating ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <Download className="h-4 w-4 mr-2" />
                            )}
                            Generate Document
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
