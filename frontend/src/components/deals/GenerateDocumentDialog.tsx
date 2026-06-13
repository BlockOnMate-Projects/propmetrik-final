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
        case 'offer_letter': return 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 border-blue-800'
        case 'agreement': return 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 border-amber-800'
        case 'contract': return 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 border-green-800'
        case 'receipt': return 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 border-purple-800'
        case 'disclosure': return 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 border-red-800'
        case 'commission': return 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-600 dark:text-cyan-400 border-cyan-800'
        default: return 'bg-muted/50 text-muted-foreground border-border'
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
                message: `Document "${doc.file_name || doc.document_number || doc.id}" generated successfully!`
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
        (t.name || t.template_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.description || t.template_description || '').toLowerCase().includes(searchTerm.toLowerCase())
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
            <DialogContent className="bg-card border-border max-w-4xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-foreground flex items-center gap-2">
                        <FileText className="h-5 w-5 text-amber-500" />
                        Generate Document
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                        Select a template to generate a document for "{dealTitle}"
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="select" className="flex-1 flex flex-col min-h-0">
                    <TabsList className="bg-muted border border-border">
                        <TabsTrigger 
                            value="select" 
                            className="font-mono text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-foreground"
                        >
                            SELECT TEMPLATE
                        </TabsTrigger>
                        <TabsTrigger 
                            value="preview" 
                            disabled={!selectedTemplate}
                            className="font-mono text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-foreground"
                        >
                            PREVIEW
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="select" className="flex-1 mt-4 min-h-0">
                        <div className="space-y-4 h-full flex flex-col">
                            {/* Search */}
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search templates..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10 bg-muted border-border text-foreground"
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
                                        <p className="text-muted-foreground text-sm">No templates found</p>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
                                            <div key={category}>
                                                <h4 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
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
                                                                    : 'border-border bg-muted/50 hover:border-zinc-600'
                                                            )}
                                                        >
                                                            <div className="flex items-start justify-between">
                                                                <div className="flex-1">
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <span className="font-mono text-sm text-foreground">
                                                                            {template.name}
                                                                        </span>
                                                                        {selectedTemplate?.id === template.id && (
                                                                            <Check className="h-4 w-4 text-amber-500" />
                                                                        )}
                                                                    </div>
                                                                    <p className="font-mono text-[11px] text-muted-foreground line-clamp-1">
                                                                        {template.description || 'No description'}
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
                                    className="bg-muted text-foreground hover:bg-zinc-700"
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
                            <ScrollArea className="flex-1 bg-card rounded-lg">
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
                            ? 'bg-green-100 dark:bg-green-900/30 border border-green-800' 
                            : 'bg-red-100 dark:bg-red-900/30 border border-red-800'
                    )}>
                        {generationResult.success ? (
                            <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                        ) : (
                            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                        )}
                        <span className={cn(
                            'font-mono text-xs',
                            generationResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                        )}>
                            {generationResult.message}
                        </span>
                    </div>
                )}

                <DialogFooter className="border-t border-border pt-4">
                    <Button 
                        variant="outline" 
                        onClick={handleClose}
                        className="border-border text-muted-foreground"
                    >
                        {generationResult?.success ? 'Close' : 'Cancel'}
                    </Button>
                    {!generationResult?.success && (
                        <Button 
                            onClick={handleGenerate}
                            disabled={!selectedTemplate || isGenerating}
                            className="bg-amber-600 hover:bg-amber-700 text-foreground"
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
