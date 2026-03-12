'use client'

import React, { useState, useEffect } from 'react'
import { 
    FileText, 
    Loader2, 
    Check,
    Circle,
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

    useEffect(() => {
        loadData()
    }, [dealId])

    const loadData = async () => {
        try {
            setIsLoading(true)
            setError(null)
            const [checklistData, docsData] = await Promise.all([
                documentGenerationApi.getDealChecklist(dealId),
                documentGenerationApi.getDealDocuments(dealId)
            ])
            setChecklist(checklistData || [])
            setDocuments(docsData || [])
        } catch (err: any) {
            console.error('Failed to load document data:', err)
            setError(err.message || 'Failed to load documents')
        } finally {
            setIsLoading(false)
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

    // Calculate completion stats
    const totalRequired = checklist.filter(c => c.is_required).length
    const generatedRequired = checklist.filter(c => c.is_required && c.is_generated).length
    const signedRequired = checklist.filter(c => c.is_required && c.is_signed).length
    const completionPercent = totalRequired > 0 ? Math.round((generatedRequired / totalRequired) * 100) : 0

    return (
        <div className="space-y-4">
            {/* Progress Overview */}
            {checklist.length > 0 && (
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
            {checklist.length === 0 ? (
                <div className="text-center py-6">
                    <FileText className="h-10 w-10 text-zinc-700 mx-auto mb-2" />
                    <p className="font-mono text-xs text-zinc-500">
                        No document requirements for this deal stage
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {checklist.map((item) => (
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
                                className="flex items-center gap-3 p-2 bg-zinc-800/50 border border-zinc-700 rounded-lg"
                            >
                                <FileText className="h-4 w-4 text-zinc-500 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="font-mono text-xs text-white truncate">
                                        {doc.document_number}
                                    </p>
                                    <p className="font-mono text-[10px] text-zinc-500">
                                        {doc.template_name} • {format(new Date(doc.created_at), 'MMM d, yyyy')}
                                    </p>
                                </div>
                                {doc.generation_status === 'completed' && doc.file_url && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2 text-zinc-400 hover:text-white"
                                        onClick={() => window.open(doc.file_url, '_blank')}
                                    >
                                        <Download className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                                {doc.generation_status === 'generating' && (
                                    <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />
                                )}
                                {doc.generation_status === 'failed' && (
                                    <span title={doc.error_message}>
                                        <AlertCircle className="h-4 w-4 text-red-400" />
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
