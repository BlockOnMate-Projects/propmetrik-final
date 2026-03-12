'use client'

import React, { useState, useEffect } from 'react'
import {
    FileText,
    FileDown,
    Loader2,
    Check,
    Circle,
    ChevronRight,
    Download,
    PenLine,
    AlertCircle,
    RefreshCw
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
    documentGenerationApi,
    DocumentChecklistItem,
    GeneratedDocument
} from '@/lib/crm-api'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

interface DocumentChecklistProps {
    dealId: string
    onGenerateDocument?: (templateId: string) => void
}

const getCategoryColor = (category: string) => {
    switch (category) {
        case 'offer_letter': return 'text-blue-400'
        case 'agreement': return 'text-amber-400'
        case 'contract': return 'text-green-400'
        case 'receipt': return 'text-purple-400'
        case 'disclosure': return 'text-red-400'
        case 'commission': return 'text-cyan-400'
        default: return 'text-zinc-400'
    }
}

export function DocumentChecklist({ dealId, onGenerateDocument }: DocumentChecklistProps) {
    const [checklist, setChecklist] = useState<DocumentChecklistItem[]>([])
    const [documents, setDocuments] = useState<GeneratedDocument[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [previewDoc, setPreviewDoc] = useState<GeneratedDocument | null>(null)
    const [previewHtml, setPreviewHtml] = useState<string | null>(null)
    const [previewLoading, setPreviewLoading] = useState(false)

    useEffect(() => {
        loadData()
    }, [dealId])

    const loadData = async () => {
        try {
            setIsLoading(true)
            setError(null)
            const [checklistRes, docsRes] = await Promise.all([
                documentGenerationApi.getDealChecklist(dealId),
                documentGenerationApi.getDealDocuments(dealId)
            ])
            // Backend wraps arrays: { checklist: [...] } and { documents: [...] }
            const checklistData = Array.isArray(checklistRes) ? checklistRes : (checklistRes as any)?.checklist || []
            const docsData = Array.isArray(docsRes) ? docsRes : (docsRes as any)?.documents || []
            setChecklist(checklistData)
            setDocuments(docsData)
        } catch (err: any) {
            console.error('Failed to load document data:', err)
            setError(err.message || 'Failed to load documents')
        } finally {
            setIsLoading(false)
        }
    }

    const handleDownload = async (doc: GeneratedDocument) => {
        try {
            const result = await documentGenerationApi.getDownloadUrl(doc.id)
            const url = (result as any)?.url || result?.url
            if (url) {
                window.open(url, '_blank')
            } else {
                console.error('No download URL returned')
            }
        } catch (err) {
            console.error('Failed to get download URL:', err)
        }
    }

    const openPreview = async (doc: GeneratedDocument) => {
        setPreviewDoc(doc)
        setPreviewHtml(null)
        setPreviewLoading(true)
        try {
            // If it's an HTML document, fetch content via the getById endpoint
            const result = await documentGenerationApi.getById(doc.id)
            const docData = (result as any)?.document || result
            if (docData?.html_content || docData?.content) {
                setPreviewHtml(docData.html_content || docData.content)
            } else if (doc.file_url) {
                // For PDFs or other files, we'll show a download link
                setPreviewHtml(null)
            }
        } catch (err) {
            console.error('Failed to load document preview:', err)
        } finally {
            setPreviewLoading(false)
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="text-center py-8">
                <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                <p className="font-mono text-xs text-red-400">{error}</p>
                <Button 
                    variant="ghost" 
                    onClick={loadData}
                    className="text-amber-500 mt-2"
                >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Retry
                </Button>
            </div>
        )
    }

    // Calculate completion stats — defensive guard against non-array data
    const items = Array.isArray(checklist) ? checklist : []
    const totalRequired = items.filter(c => c.is_required).length
    const generatedRequired = items.filter(c => c.is_required && c.is_generated).length
    const signedRequired = items.filter(c => c.is_required && c.is_signed).length
    const completionPercent = totalRequired > 0 ? Math.round((generatedRequired / totalRequired) * 100) : 0

    return (
        <div className="space-y-4">
            {/* Progress Overview */}
            {items.length > 0 && (
                <div className="bg-zinc-800/50 border border-zinc-700 p-3 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-[10px] text-zinc-500">DOCUMENT COMPLETION</span>
                        <span className="font-mono text-xs text-white">{completionPercent}%</span>
                    </div>
                    <Progress value={completionPercent} className="h-1.5" />
                    <div className="flex items-center gap-4 mt-2 text-[10px] text-zinc-500">
                        <span>{generatedRequired}/{totalRequired} Generated</span>
                        <span>{signedRequired}/{totalRequired} Signed</span>
                    </div>
                </div>
            )}

            {/* Checklist Items */}
            {items.length === 0 && documents.length === 0 ? (
                <div className="text-center py-6">
                    <FileText className="h-10 w-10 text-zinc-700 mx-auto mb-2" />
                    <p className="font-mono text-xs text-zinc-500">
                        No document requirements for this deal stage
                    </p>
                </div>
            ) : items.length === 0 ? (
                null
            ) : (
                <div className="space-y-2">
                    {items.map((item) => (
                        <div 
                            key={item.id}
                            className={cn(
                                'flex items-center gap-3 p-3 border rounded-lg transition-colors',
                                item.is_signed 
                                    ? 'border-green-800/50 bg-green-900/10'
                                    : item.is_generated
                                    ? 'border-amber-800/50 bg-amber-900/10'
                                    : 'border-zinc-700 bg-zinc-800/30'
                            )}
                        >
                            {/* Status Icon */}
                            <div className="flex-shrink-0">
                                {item.is_signed ? (
                                    <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                                        <Check className="h-3.5 w-3.5 text-green-400" />
                                    </div>
                                ) : item.is_generated ? (
                                    <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center">
                                        <FileText className="h-3.5 w-3.5 text-amber-400" />
                                    </div>
                                ) : (
                                    <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center">
                                        <Circle className="h-3 w-3 text-zinc-500" />
                                    </div>
                                )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs text-white truncate">
                                        {item.template_name}
                                    </span>
                                    {item.is_required && (
                                        <Badge className="text-[8px] bg-red-900/50 text-red-400 shrink-0">
                                            Required
                                        </Badge>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className={cn(
                                        'font-mono text-[10px]',
                                        getCategoryColor(item.category)
                                    )}>
                                        {item.category.replace('_', ' ')}
                                    </span>
                                    {item.generated_at && (
                                        <span className="font-mono text-[10px] text-zinc-600">
                                            Generated {format(new Date(item.generated_at), 'MMM d')}
                                        </span>
                                    )}
                                    {item.signed_at && (
                                        <span className="font-mono text-[10px] text-green-600">
                                            Signed {format(new Date(item.signed_at), 'MMM d')}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1">
                                {item.is_generated && !item.is_signed && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2 text-amber-500 hover:text-amber-400"
                                        title="Send for signature"
                                    >
                                        <PenLine className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                                {item.is_generated && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2 text-zinc-400 hover:text-white"
                                        title="Download"
                                    >
                                        <Download className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                                {!item.is_generated && (
                                    <Button
                                        size="sm"
                                        onClick={() => onGenerateDocument?.(item.template_id)}
                                        className="h-7 px-3 bg-amber-600 hover:bg-amber-700 text-white text-[10px]"
                                    >
                                        Generate
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Generated Documents */}
            {documents.length > 0 && (
                <div className="pt-4 border-t border-zinc-800">
                    <h4 className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-3">
                        Generated Documents ({documents.length})
                    </h4>
                    <div className="space-y-2">
                        {documents.map((doc) => (
                            <div
                                key={doc.id}
                                onClick={() => openPreview(doc)}
                                className="flex items-center gap-3 p-3 bg-zinc-900 border border-zinc-700/80 rounded-lg cursor-pointer hover:border-amber-600/50 hover:bg-zinc-800/80 transition-all group"
                            >
                                <div className="flex-shrink-0 w-8 h-8 rounded bg-amber-600/15 flex items-center justify-center">
                                    <FileText className="h-4 w-4 text-amber-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-mono text-xs text-amber-100 group-hover:text-amber-50 truncate font-medium">
                                        {doc.file_name || doc.document_number || doc.template_name}
                                    </p>
                                    <p className="font-mono text-[10px] text-zinc-400">
                                        {doc.template_name} • {format(new Date(doc.created_at), 'MMM d, yyyy')}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1">
                                    {(doc.generation_status === 'generating' || doc.status === 'generating') && (
                                        <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />
                                    )}
                                    {(doc.generation_status === 'failed' || doc.status === 'failed') && (
                                        <span title={doc.error_message}>
                                            <AlertCircle className="h-4 w-4 text-red-400" />
                                        </span>
                                    )}
                                    {!(doc.generation_status === 'generating' || doc.status === 'generating') &&
                                     !(doc.generation_status === 'failed' || doc.status === 'failed') && (
                                        <Badge className="bg-zinc-800 text-zinc-500 text-[9px] border-0">
                                            {doc.mime_type === 'application/pdf' ? 'PDF' : 'HTML'}
                                        </Badge>
                                    )}
                                    <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Document Preview Dialog */}
            <Dialog open={!!previewDoc} onOpenChange={(open) => { if (!open) setPreviewDoc(null) }}>
                <DialogContent className="max-w-4xl max-h-[85vh] bg-zinc-900 border-zinc-700 p-0 overflow-hidden">
                    <DialogHeader className="px-6 pt-5 pb-3 border-b border-zinc-800">
                        <DialogTitle className="font-mono text-sm text-white flex items-center gap-2">
                            <FileText className="h-4 w-4 text-amber-500" />
                            {previewDoc?.file_name || previewDoc?.template_name || 'Document Preview'}
                        </DialogTitle>
                        {previewDoc && (
                            <p className="font-mono text-[10px] text-zinc-400 mt-1">
                                {previewDoc.template_name} • Created {format(new Date(previewDoc.created_at), 'MMM d, yyyy')}
                                {previewDoc.mime_type && ` • ${previewDoc.mime_type}`}
                            </p>
                        )}
                    </DialogHeader>
                    <div className="flex-1 overflow-auto" style={{ maxHeight: 'calc(85vh - 120px)' }}>
                        {previewLoading ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 className="h-6 w-6 text-amber-500 animate-spin" />
                                <span className="ml-3 font-mono text-xs text-zinc-400">Loading document...</span>
                            </div>
                        ) : previewHtml ? (
                            <div className="bg-white">
                                <iframe
                                    srcDoc={previewHtml}
                                    className="w-full border-0"
                                    style={{ minHeight: '70vh' }}
                                    title="Document Preview"
                                    sandbox="allow-same-origin"
                                />
                            </div>
                        ) : previewDoc?.file_url ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-4">
                                <FileDown className="h-12 w-12 text-zinc-600" />
                                <p className="font-mono text-xs text-zinc-400">This document is available for download</p>
                                <Button
                                    onClick={() => handleDownload(previewDoc)}
                                    className="bg-amber-600 hover:bg-amber-700 text-white"
                                >
                                    <Download className="h-4 w-4 mr-2" />
                                    Download {previewDoc.file_name || 'Document'}
                                </Button>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 gap-3">
                                <FileText className="h-12 w-12 text-zinc-600" />
                                <p className="font-mono text-xs text-zinc-400">No preview available for this document</p>
                            </div>
                        )}
                    </div>
                    {/* Footer with actions */}
                    {previewDoc && !previewLoading && (
                        <div className="px-6 py-3 border-t border-zinc-800 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {previewDoc.esign_envelope_id ? (
                                    <Badge className="bg-green-900/50 text-green-400 text-[10px]">
                                        <PenLine className="h-3 w-3 mr-1" />
                                        Sent for Signing
                                    </Badge>
                                ) : (
                                    <Badge className="bg-zinc-800 text-zinc-400 text-[10px]">
                                        {previewDoc.status || 'Draft'}
                                    </Badge>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {previewDoc.file_url && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="border-zinc-700 text-zinc-300 hover:text-white"
                                        onClick={() => handleDownload(previewDoc)}
                                    >
                                        <Download className="h-3.5 w-3.5 mr-1.5" />
                                        Download
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
