
'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
    FileText,
    Search,
    MoreVertical,
    Upload,
    Download,
    Eye,
    Trash2,
    FolderOpen,
    Loader2,
    Shield,
    ShieldCheck,
    PenLine,
    FileSignature,
    HardDrive,
    Scale,
    Users,
    Clock
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { subTabsListClass, subTabsTriggerClass } from '@/components/layout/subTabStyles'
import { propertyManagementApi } from '@/lib/property-management-api'
import { VaultDocument, VaultSummary } from '@/types/property-management'

const API_HOST = process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, '') || ''

/** Resolve a fileUrl to a full download URL through the backend */
function resolveFileUrl(fileUrl?: string): string | undefined {
    if (!fileUrl) return undefined
    if (fileUrl.startsWith('http')) return fileUrl
    if (fileUrl.startsWith('/api/v1/')) return `/api/${fileUrl.slice('/api/v1/'.length)}`
    if (fileUrl.startsWith('/api/')) return fileUrl
    // Storage keys and other backend-relative paths still go through the configured API host.
    return `${API_HOST}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`
}

function formatBytes(bytes?: number): string {
    if (!bytes || bytes === 0) return '—'
    const units = ['B', 'KB', 'MB', 'GB']
    let i = 0
    let size = bytes
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++ }
    return `${size.toFixed(i > 1 ? 2 : 0)} ${units[i]}`
}

function formatDocType(type: string): string {
    return type.replace(/_/g, ' ')
}

const SOURCE_COLORS: Record<string, string> = {
    upload: 'border-blue-900 text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/10',
    lease: 'border-purple-900 text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/10',
    signed_lease: 'border-emerald-900 text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/10',
}

const SOURCE_LABELS: Record<string, string> = {
    upload: 'Upload',
    lease: 'Lease',
    signed_lease: 'Signed Lease',
}

const SIGNING_STATUS_COLORS: Record<string, string> = {
    draft: 'border-border text-muted-foreground bg-muted/50',
    sent_for_signature: 'border-amber-900 text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/10',
    partially_signed: 'border-orange-900 text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/10',
    signed: 'border-emerald-900 text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/10',
    expired: 'border-red-900 text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/10',
    voided: 'border-red-900 text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/10',
}

export default function DocumentVaultPage() {
    const [documents, setDocuments] = useState<VaultDocument[]>([])
    const [summary, setSummary] = useState<VaultSummary | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState('all')
    const [searchQuery, setSearchQuery] = useState('')
    const [searchDebounce, setSearchDebounce] = useState('')

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => setSearchDebounce(searchQuery), 400)
        return () => clearTimeout(timer)
    }, [searchQuery])

    const loadDocuments = useCallback(async () => {
        try {
            setIsLoading(true)
            setError(null)

            const category = activeTab === 'all' ? undefined : activeTab as 'legal' | 'financial' | 'tenant'
            const response = await propertyManagementApi.getVaultDocuments({
                limit: 100,
                category,
                search: searchDebounce || undefined,
            })

            setDocuments(response.data || [])
            setSummary(response.summary || null)
        } catch (err: any) {
            console.error('Failed to load vault documents:', err)
            setError(err?.message || 'Failed to load documents')
        } finally {
            setIsLoading(false)
        }
    }, [activeTab, searchDebounce])

    useEffect(() => {
        loadDocuments()
    }, [loadDocuments])

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this document?')) return
        try {
            await propertyManagementApi.deleteDocument(id)
            loadDocuments()
        } catch (err) {
            console.error('Delete failed:', err)
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground font-mono">DOCUMENT VAULT</h1>
                    <p className="text-sm text-muted-foreground font-mono">Centralized documents from all tenancies, leases, and uploads</p>
                </div>
                <Button className="bg-amber-600 hover:bg-amber-500 text-foreground font-bold font-mono text-xs uppercase">
                    <Upload className="mr-2 h-3 w-3" />
                    Upload Document
                </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-background border border-border">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Total Files</CardTitle>
                        <FolderOpen className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground font-mono">{isLoading ? '—' : summary?.totalFiles || 0}</div>
                        <p className="text-[10px] text-muted-foreground mt-1 font-mono">Across all sources</p>
                    </CardContent>
                </Card>
                <Card className="bg-background border border-border">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Storage Used</CardTitle>
                        <HardDrive className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground font-mono">
                            {isLoading ? '—' : formatBytes(summary?.totalStorageBytes)}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1 font-mono">Tracked file storage</p>
                    </CardContent>
                </Card>
                <Card className="bg-background border border-border">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Lease Documents</CardTitle>
                        <Scale className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground font-mono">{isLoading ? '—' : summary?.leaseDocuments || 0}</div>
                        <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                            {summary?.signedLeases || 0} signed
                        </p>
                    </CardContent>
                </Card>
                <Card className="bg-background border border-border">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Tenant Uploads</CardTitle>
                        <Users className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground font-mono">{isLoading ? '—' : summary?.tenantUploads || 0}</div>
                        <p className="text-[10px] text-muted-foreground mt-1 font-mono">ID, receipts, etc.</p>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs + Search */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
                    <TabsList className={subTabsListClass}>
                        <TabsTrigger value="all" className={subTabsTriggerClass}>
                            All Files
                        </TabsTrigger>
                        <TabsTrigger value="legal" className={subTabsTriggerClass}>
                            Legal
                        </TabsTrigger>
                        <TabsTrigger value="financial" className={subTabsTriggerClass}>
                            Financial
                        </TabsTrigger>
                        <TabsTrigger value="tenant" className={subTabsTriggerClass}>
                            Tenant
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2 top-2.5 h-3 w-3 text-muted-foreground" />
                    <Input
                        placeholder="SEARCH DOCUMENTS..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8 bg-background border-border text-muted-foreground focus:border-amber-500 font-mono text-xs uppercase h-8"
                    />
                </div>
            </div>

            {/* Documents Table */}
            <Card className="bg-card border-border">
                <CardHeader>
                    <CardTitle className="text-sm font-mono uppercase text-amber-500">File Directory</CardTitle>
                </CardHeader>
                <CardContent>
                    {error && (
                        <div className="text-red-600 dark:text-red-400 text-sm font-mono mb-4 p-3 bg-red-100 dark:bg-red-900/10 border border-red-900/30 rounded">
                            {error}
                        </div>
                    )}

                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 text-amber-600 animate-spin" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="border-border hover:bg-card/50">
                                    <TableHead className="text-muted-foreground font-mono text-[10px] uppercase">Document</TableHead>
                                    <TableHead className="text-muted-foreground font-mono text-[10px] uppercase">Type</TableHead>
                                    <TableHead className="text-muted-foreground font-mono text-[10px] uppercase hidden md:table-cell">Source</TableHead>
                                    <TableHead className="text-muted-foreground font-mono text-[10px] uppercase hidden lg:table-cell">Property / Tenant</TableHead>
                                    <TableHead className="text-muted-foreground font-mono text-[10px] uppercase hidden md:table-cell">Status</TableHead>
                                    <TableHead className="text-muted-foreground font-mono text-[10px] uppercase hidden lg:table-cell">Size</TableHead>
                                    <TableHead className="text-muted-foreground font-mono text-[10px] uppercase">Date</TableHead>
                                    <TableHead className="text-right text-muted-foreground font-mono text-[10px] uppercase">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {documents.length === 0 ? (
                                    <TableRow className="border-border">
                                        <TableCell colSpan={8} className="text-center py-12 text-muted-foreground font-mono">
                                            <div className="flex flex-col items-center gap-2">
                                                <FileText className="h-8 w-8 text-zinc-700" />
                                                <span>No documents found</span>
                                                <span className="text-[10px] text-muted-foreground">Upload documents or generate leases to see them here</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    documents.map((doc) => (
                                        <TableRow key={`${doc.source}-${doc.id}`} className="border-border hover:bg-card/50 group">
                                            {/* Document name + icon */}
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className={`h-8 w-8 rounded border flex items-center justify-center shrink-0 ${
                                                        doc.source === 'signed_lease' ? 'bg-emerald-950 border-emerald-800 text-emerald-600 dark:text-emerald-400'
                                                        : doc.source === 'lease' ? 'bg-purple-950 border-purple-800 text-purple-600 dark:text-purple-400'
                                                        : 'bg-background border-border text-muted-foreground'
                                                    }`}>
                                                        {doc.source === 'signed_lease' ? <ShieldCheck className="h-4 w-4" />
                                                         : doc.source === 'lease' ? <FileSignature className="h-4 w-4" />
                                                         : <FileText className="h-4 w-4" />}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="font-medium text-zinc-200 text-xs font-mono group-hover:text-amber-500 transition-colors truncate max-w-[200px]">
                                                            {doc.title}
                                                        </div>
                                                        <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">{doc.fileName}</div>
                                                    </div>
                                                </div>
                                            </TableCell>

                                            {/* Doc type */}
                                            <TableCell>
                                                <Badge variant="outline" className={`text-[10px] font-mono uppercase whitespace-nowrap ${
                                                    ['lease_agreement', 'indenture'].includes(doc.documentType) ? 'border-purple-900 text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/10'
                                                    : ['site_plan', 'building_permit'].includes(doc.documentType) ? 'border-blue-900 text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/10'
                                                    : ['property_tax_receipts', 'insurance_policies'].includes(doc.documentType) ? 'border-green-900 text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/10'
                                                    : 'border-border text-muted-foreground bg-muted/50'
                                                }`}>
                                                    {formatDocType(doc.documentType)}
                                                </Badge>
                                            </TableCell>

                                            {/* Source */}
                                            <TableCell className="hidden md:table-cell">
                                                <Badge variant="outline" className={`text-[10px] font-mono uppercase ${SOURCE_COLORS[doc.source] || ''}`}>
                                                    {SOURCE_LABELS[doc.source] || doc.source}
                                                </Badge>
                                            </TableCell>

                                            {/* Property / Tenant */}
                                            <TableCell className="hidden lg:table-cell">
                                                <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[140px]">
                                                    {doc.propertyTitle || (doc.propertyId ? doc.propertyId.substring(0, 8) : '—')}
                                                </div>
                                                {doc.tenantName && (
                                                    <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[140px]">{doc.tenantName}</div>
                                                )}
                                            </TableCell>

                                            {/* Status */}
                                            <TableCell className="hidden md:table-cell">
                                                {doc.signingStatus ? (
                                                    <Badge variant="outline" className={`text-[10px] font-mono uppercase ${SIGNING_STATUS_COLORS[doc.signingStatus] || 'border-border text-muted-foreground'}`}>
                                                        {doc.signingStatus === 'sent_for_signature' ? 'Pending'
                                                         : doc.signingStatus === 'partially_signed' ? 'Partial'
                                                         : doc.signingStatus.replace(/_/g, ' ')}
                                                    </Badge>
                                                ) : doc.isVerified ? (
                                                    <Badge variant="outline" className="text-[10px] font-mono uppercase border-emerald-900 text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/10">
                                                        Verified
                                                    </Badge>
                                                ) : doc.source === 'upload' ? (
                                                    <Badge variant="outline" className="text-[10px] font-mono uppercase border-border text-muted-foreground">
                                                        Uploaded
                                                    </Badge>
                                                ) : (
                                                    <span className="text-[10px] text-muted-foreground font-mono">—</span>
                                                )}
                                            </TableCell>

                                            {/* Size */}
                                            <TableCell className="hidden lg:table-cell">
                                                <span className="text-[10px] text-muted-foreground font-mono">{formatBytes(doc.fileSizeBytes)}</span>
                                            </TableCell>

                                            {/* Date */}
                                            <TableCell>
                                                <div className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">
                                                    {new Date(doc.createdAt).toLocaleDateString('en-GB')}
                                                </div>
                                            </TableCell>

                                            {/* Actions */}
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground">
                                                            <span className="sr-only">Open menu</span>
                                                            <MoreVertical className="h-3 w-3" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="bg-background border-border text-muted-foreground">
                                                        <DropdownMenuLabel className="text-xs font-mono uppercase text-muted-foreground">Actions</DropdownMenuLabel>
                                                        {doc.fileUrl && (
                                                            <a href={resolveFileUrl(doc.fileUrl)} target="_blank" rel="noopener noreferrer">
                                                                <DropdownMenuItem className="hover:bg-card focus:bg-card cursor-pointer text-xs font-mono">
                                                                    <Eye className="mr-2 h-3 w-3" /> View
                                                                </DropdownMenuItem>
                                                            </a>
                                                        )}
                                                        {doc.fileUrl && (
                                                            <a href={resolveFileUrl(doc.fileUrl)} download target="_blank" rel="noopener noreferrer">
                                                                <DropdownMenuItem className="hover:bg-card focus:bg-card cursor-pointer text-xs font-mono">
                                                                    <Download className="mr-2 h-3 w-3" /> Download
                                                                </DropdownMenuItem>
                                                            </a>
                                                        )}
                                                        {doc.source === 'upload' && (
                                                            <>
                                                                <DropdownMenuSeparator className="bg-muted" />
                                                                <DropdownMenuItem
                                                                    onClick={() => handleDelete(doc.id)}
                                                                    className="text-red-500 hover:bg-card focus:bg-card cursor-pointer text-xs font-mono"
                                                                >
                                                                    <Trash2 className="mr-2 h-3 w-3" /> Delete
                                                                </DropdownMenuItem>
                                                            </>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
