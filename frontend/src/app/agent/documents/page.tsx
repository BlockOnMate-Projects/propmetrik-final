'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    FileText,
    Download,
    Eye,
    Search,
    Loader2,
    File,
    FileImage,
    FileSpreadsheet,
    Folder,
    ChevronRight,
    ExternalLink
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

interface Document {
    id: string
    file_name: string
    file_type: string
    file_size: number
    mime_type: string
    document_type: string
    entity_type: string
    entity_id: string
    deal_id: string
    deal_title: string
    uploaded_by_name: string
    created_at: string
    file_url: string
}

function formatFileSize(bytes: number): string {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function getFileIcon(mimeType: string | undefined, fileType: string | undefined) {
    const type = mimeType || fileType || ''
    if (type.includes('image')) return <FileImage className="h-5 w-5 text-purple-400" />
    if (type.includes('pdf')) return <FileText className="h-5 w-5 text-red-400" />
    if (type.includes('spreadsheet') || type.includes('excel') || type.includes('csv')) {
        return <FileSpreadsheet className="h-5 w-5 text-green-400" />
    }
    if (type.includes('word') || type.includes('document')) {
        return <FileText className="h-5 w-5 text-blue-400" />
    }
    return <File className="h-5 w-5 text-zinc-400" />
}

export default function AgentDocumentsPage() {
    const router = useRouter()
    const [documents, setDocuments] = useState<Document[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [typeFilter, setTypeFilter] = useState('')

    useEffect(() => {
        const loadDocuments = async () => {
            try {
                const storedContext = localStorage.getItem('agentContext')
                if (!storedContext) {
                    router.push('/agent/login')
                    return
                }

                const context = JSON.parse(storedContext)
                
                // Fetch agent's deals first, then get documents
                const dealsRes = await fetch(`${API_BASE}/crm/deals?agent_id=${context.agentId}&limit=50`, {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-User-Id': context.userId,
                        'X-Organization-Id': context.orgId
                    }
                })

                if (dealsRes.ok) {
                    const deals = await dealsRes.json()
                    
                    // Fetch documents for each deal
                    const allDocs: Document[] = []
                    for (const deal of deals) {
                        try {
                            const docsRes = await fetch(`${API_BASE}/crm/deals/${deal.id}/documents`, {
                                headers: {
                                    'Content-Type': 'application/json',
                                    'X-User-Id': context.userId,
                                    'X-Organization-Id': context.orgId
                                }
                            })
                            if (docsRes.ok) {
                                const docs = await docsRes.json()
                                docs.forEach((doc: Document) => {
                                    allDocs.push({
                                        ...doc,
                                        deal_id: deal.id,
                                        deal_title: deal.title
                                    })
                                })
                            }
                        } catch (err) {
                            console.error(`Failed to load docs for deal ${deal.id}:`, err)
                        }
                    }
                    setDocuments(allDocs)
                }
            } catch (err) {
                console.error('Failed to load documents:', err)
            } finally {
                setIsLoading(false)
            }
        }

        loadDocuments()
    }, [router])

    const filteredDocuments = documents.filter(doc => {
        const matchesSearch = !searchTerm || 
            doc.file_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            doc.document_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            doc.deal_title?.toLowerCase().includes(searchTerm.toLowerCase())
        
        const matchesType = !typeFilter || 
            doc.document_type === typeFilter
        
        return matchesSearch && matchesType
    })

    const documentTypes = Array.from(new Set(documents.map(d => d.document_type).filter(Boolean)))

    // Group by deal
    const groupedByDeal = filteredDocuments.reduce((acc, doc) => {
        const dealId = doc.deal_id || 'uncategorized'
        if (!acc[dealId]) {
            acc[dealId] = {
                dealTitle: doc.deal_title || 'Uncategorized',
                documents: []
            }
        }
        acc[dealId].documents.push(doc)
        return acc
    }, {} as Record<string, { dealTitle: string; documents: Document[] }>)

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="font-mono text-lg text-white">MY DOCUMENTS</h1>
                    <p className="font-mono text-xs text-zinc-500">Documents from your deals</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <Input
                        placeholder="Search documents..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 bg-zinc-900 border-zinc-800 text-white font-mono text-xs"
                    />
                </div>
                <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-xs min-w-[150px]"
                >
                    <option value="">All Types</option>
                    {documentTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                    ))}
                </select>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-zinc-900/50 border border-zinc-800 p-3">
                    <div className="font-mono text-[10px] text-zinc-500">TOTAL DOCUMENTS</div>
                    <div className="font-mono text-xl text-white">{documents.length}</div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 p-3">
                    <div className="font-mono text-[10px] text-zinc-500">DOCUMENT TYPES</div>
                    <div className="font-mono text-xl text-amber-400">{documentTypes.length}</div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 p-3">
                    <div className="font-mono text-[10px] text-zinc-500">TOTAL SIZE</div>
                    <div className="font-mono text-xl text-zinc-300">
                        {formatFileSize(documents.reduce((sum, d) => sum + (d.file_size || 0), 0))}
                    </div>
                </div>
            </div>

            {/* Documents by Deal */}
            {Object.keys(groupedByDeal).length === 0 ? (
                <div className="text-center py-10 border border-dashed border-zinc-700 rounded">
                    <Folder className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
                    <p className="font-mono text-sm text-zinc-500">No documents found</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {Object.entries(groupedByDeal).map(([dealId, group]) => (
                        <div key={dealId} className="border border-zinc-800 bg-zinc-900/30">
                            {/* Deal Header */}
                            <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/50 border-b border-zinc-800">
                                <div className="flex items-center gap-2">
                                    <Folder className="h-4 w-4 text-amber-500" />
                                    <span className="font-mono text-xs text-white">{group.dealTitle}</span>
                                    <span className="font-mono text-[10px] text-zinc-500">
                                        ({group.documents.length} files)
                                    </span>
                                </div>
                                <Link
                                    href={`/agent/deals/${dealId}`}
                                    className="flex items-center gap-1 font-mono text-[10px] text-amber-500 hover:underline"
                                >
                                    View Deal
                                    <ChevronRight className="h-3 w-3" />
                                </Link>
                            </div>

                            {/* Document List */}
                            <div className="divide-y divide-zinc-800">
                                {group.documents.map((doc) => (
                                    <div 
                                        key={doc.id}
                                        className="flex items-center gap-4 p-3 hover:bg-zinc-800/30 transition-colors"
                                    >
                                        {/* Icon */}
                                        <div className="flex-shrink-0">
                                            {getFileIcon(doc.mime_type, doc.file_type)}
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <p className="font-mono text-xs text-white truncate">{doc.file_name}</p>
                                            <div className="flex items-center gap-3 mt-1">
                                                {doc.document_type && (
                                                    <span className="font-mono text-[9px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400">
                                                        {doc.document_type.toUpperCase()}
                                                    </span>
                                                )}
                                                <span className="font-mono text-[10px] text-zinc-500">
                                                    {formatFileSize(doc.file_size)}
                                                </span>
                                                <span className="font-mono text-[10px] text-zinc-500">
                                                    {new Date(doc.created_at).toLocaleDateString('en-GB', {
                                                        day: 'numeric',
                                                        month: 'short',
                                                        year: 'numeric'
                                                    })}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-2">
                                            {doc.file_url && (
                                                <>
                                                    <a
                                                        href={doc.file_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="p-2 hover:bg-zinc-700 transition-colors"
                                                        title="View"
                                                    >
                                                        <Eye className="h-4 w-4 text-zinc-400" />
                                                    </a>
                                                    <a
                                                        href={doc.file_url}
                                                        download={doc.file_name}
                                                        className="p-2 hover:bg-zinc-700 transition-colors"
                                                        title="Download"
                                                    >
                                                        <Download className="h-4 w-4 text-zinc-400" />
                                                    </a>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
