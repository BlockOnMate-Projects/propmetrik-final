'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  FileText, Search, MoreVertical, Upload, Download, Eye, Trash2,
  FolderOpen, Loader2, ShieldCheck, CheckCircle, AlertTriangle,
  Filter, FileImage, FileSpreadsheet
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { authedFetch } from '@/lib/authed-fetch'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'

interface ProjectDocument {
  id: string
  project_id: string
  project_name?: string
  name: string
  title?: string
  description?: string
  original_filename?: string
  file_name?: string
  file_url?: string
  file_key?: string
  file_size?: number
  file_size_bytes?: number
  mime_type?: string
  document_type?: string
  category?: string
  version?: number
  is_verified?: boolean
  uploaded_by?: string
  uploaded_by_name?: string
  created_at: string
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0; let size = bytes
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++ }
  return `${size.toFixed(i > 1 ? 2 : 0)} ${units[i]}`
}

function formatDocType(type?: string | null): string {
  if (!type) return 'Document'
  return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

const CATEGORY_COLORS: Record<string, string> = {
  contract: 'border-purple-900 text-purple-400 bg-purple-900/10',
  permit: 'border-blue-900 text-blue-400 bg-blue-900/10',
  drawing: 'border-cyan-900 text-cyan-400 bg-cyan-900/10',
  submittal: 'border-orange-900 text-orange-400 bg-orange-900/10',
  rfi: 'border-amber-900 text-amber-400 bg-amber-900/10',
  report: 'border-green-900 text-green-400 bg-green-900/10',
  photo: 'border-pink-900 text-pink-400 bg-pink-900/10',
  other: 'border-zinc-700 text-zinc-400 bg-zinc-800/50',
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  drawing: FileImage, report: FileSpreadsheet, photo: FileImage,
}

export default function PMDocumentsPage() {
  const [documents, setDocuments] = useState<ProjectDocument[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 25

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadCategory, setUploadCategory] = useState('other')
  const [uploadProjectId, setUploadProjectId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(searchQuery); setPage(1) }, 400)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    authedFetch(`${API_BASE}/projects?limit=100`).then(async r => {
      if (r.ok) {
        const data = await r.json()
        setProjects((data.data || data.projects || []).map((p: any) => ({ id: p.id, name: p.project_name || p.name })))
      }
    }).catch(() => {})
  }, [])

  const loadDocuments = useCallback(async () => {
    try {
      setIsLoading(true); setError(null)
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (activeTab !== 'all') params.set('category', activeTab)
      if (debouncedSearch) params.set('search', debouncedSearch)

      const res = await authedFetch(`${API_BASE}/projects/all-documents?${params}`)
      if (!res.ok) throw new Error(`Failed to load documents: ${res.status}`)
      const data = await res.json()
      setDocuments(data.data || data.documents || [])
      setTotal(data.total || data.pagination?.total || 0)
      setTotalPages(data.totalPages || Math.ceil((data.total || 0) / limit) || 1)
    } catch (err: any) {
      setError(err?.message || 'Failed to load documents')
    } finally {
      setIsLoading(false)
    }
  }, [page, activeTab, debouncedSearch])

  useEffect(() => { loadDocuments() }, [loadDocuments])

  const handleDelete = async (id: string, projectId: string) => {
    if (!confirm('Delete this document permanently?')) return
    try {
      await authedFetch(`${API_BASE}/projects/${projectId}/documents/${id}`, { method: 'DELETE' })
      loadDocuments()
    } catch (err) { console.error('Delete failed:', err) }
  }

  const handleDownload = async (doc: ProjectDocument) => {
    try {
      const res = await authedFetch(`${API_BASE}/projects/${doc.project_id}/documents/${doc.id}/download`)
      if (!res.ok) throw new Error('Download failed')
      const data = await res.json()
      if (data.download_url) window.open(data.download_url, '_blank')
    } catch (err) { console.error('Download failed:', err) }
  }

  const handleUpload = async () => {
    if (!uploadFile || !uploadProjectId) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      formData.append('name', uploadTitle || uploadFile.name)
      formData.append('document_type', uploadCategory)
      const res = await authedFetch(`${API_BASE}/projects/${uploadProjectId}/documents`, { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Upload failed')
      setUploadOpen(false); setUploadFile(null); setUploadTitle(''); loadDocuments()
    } catch (err) { console.error('Upload failed:', err) }
    finally { setUploading(false) }
  }

  const verified = documents.filter(d => d.is_verified).length
  const pending = documents.length - verified

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white font-mono">DOCUMENT LIBRARY</h1>
          <p className="text-sm text-zinc-500 font-mono">Project documents, contracts, permits, and drawings</p>
        </div>
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button className="bg-amber-600 hover:bg-amber-500 text-white font-bold font-mono text-xs uppercase">
              <Upload className="mr-2 h-3 w-3" /> Upload Document
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
            <DialogHeader>
              <DialogTitle className="font-mono text-amber-500">UPLOAD DOCUMENT</DialogTitle>
              <DialogDescription className="text-zinc-400 text-xs font-mono">Upload a document to the project library</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="font-mono text-xs text-zinc-400 uppercase">Project *</Label>
                <Select value={uploadProjectId} onValueChange={setUploadProjectId}>
                  <SelectTrigger className="bg-black border-zinc-800 text-zinc-300 font-mono text-xs"><SelectValue placeholder="Select project..." /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {projects.map(p => <SelectItem key={p.id} value={p.id} className="text-zinc-300 font-mono text-xs">{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-mono text-xs text-zinc-400 uppercase">Title</Label>
                <Input value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} placeholder="Document title..." className="bg-black border-zinc-800 text-zinc-300 font-mono text-xs" />
              </div>
              <div className="space-y-2">
                <Label className="font-mono text-xs text-zinc-400 uppercase">Document Type *</Label>
                <Select value={uploadCategory} onValueChange={setUploadCategory}>
                  <SelectTrigger className="bg-black border-zinc-800 text-zinc-300 font-mono text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="contract" className="text-zinc-300 font-mono text-xs">Contract</SelectItem>
                    <SelectItem value="permit" className="text-zinc-300 font-mono text-xs">Permit</SelectItem>
                    <SelectItem value="drawing" className="text-zinc-300 font-mono text-xs">Design / Drawing</SelectItem>
                    <SelectItem value="submittal" className="text-zinc-300 font-mono text-xs">Submittal</SelectItem>
                    <SelectItem value="rfi" className="text-zinc-300 font-mono text-xs">RFI</SelectItem>
                    <SelectItem value="report" className="text-zinc-300 font-mono text-xs">Report</SelectItem>
                    <SelectItem value="invoice" className="text-zinc-300 font-mono text-xs">Invoice</SelectItem>
                    <SelectItem value="photo" className="text-zinc-300 font-mono text-xs">Photo</SelectItem>
                    <SelectItem value="other" className="text-zinc-300 font-mono text-xs">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-mono text-xs text-zinc-400 uppercase">File *</Label>
                <Input type="file" onChange={e => setUploadFile(e.target.files?.[0] || null)} className="bg-black border-zinc-800 text-zinc-300 font-mono text-xs" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUploadOpen(false)} className="font-mono text-xs border-zinc-700 text-zinc-400">Cancel</Button>
              <Button onClick={handleUpload} disabled={uploading || !uploadFile || !uploadProjectId} className="bg-amber-600 hover:bg-amber-500 text-white font-mono text-xs font-bold">
                {uploading ? <><Loader2 className="mr-2 h-3 w-3 animate-spin" /> Uploading...</> : 'Upload'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-black border border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Total Documents</CardTitle>
            <FolderOpen className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-white font-mono">{isLoading ? '—' : total}</div></CardContent>
        </Card>
        <Card className="bg-black border border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Verified</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-emerald-400 font-mono">{isLoading ? '—' : verified}</div></CardContent>
        </Card>
        <Card className="bg-black border border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Pending Review</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-amber-400 font-mono">{isLoading ? '—' : pending}</div></CardContent>
        </Card>
        <Card className="bg-black border border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Categories</CardTitle>
            <Filter className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-white font-mono">{isLoading ? '—' : new Set(documents.map(d => d.category || d.document_type)).size}</div></CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <Tabs value={activeTab} onValueChange={v => { setActiveTab(v); setPage(1) }} className="w-full sm:w-auto">
          <TabsList className="bg-zinc-900 border border-zinc-800">
            {['all', 'contract', 'permit', 'drawing', 'submittal', 'report'].map(tab => (
              <TabsTrigger key={tab} value={tab} className="data-[state=active]:bg-black data-[state=active]:text-amber-500 text-zinc-500 font-mono text-xs uppercase">
                {tab === 'all' ? 'All Files' : tab}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2 top-2.5 h-3 w-3 text-zinc-500" />
          <Input placeholder="SEARCH DOCUMENTS..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="pl-8 bg-black border-zinc-800 text-zinc-300 focus:border-amber-500 font-mono text-xs uppercase h-8" />
        </div>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader><CardTitle className="text-sm font-mono uppercase text-amber-500">File Directory</CardTitle></CardHeader>
        <CardContent>
          {error && <div className="text-red-400 text-sm font-mono mb-4 p-3 bg-red-900/10 border border-red-900/30 rounded">{error}</div>}
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 text-amber-600 animate-spin" /></div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-zinc-900/50">
                    <TableHead className="text-zinc-500 font-mono text-[10px] uppercase">Document</TableHead>
                    <TableHead className="text-zinc-500 font-mono text-[10px] uppercase">Type</TableHead>
                    <TableHead className="text-zinc-500 font-mono text-[10px] uppercase hidden md:table-cell">Project</TableHead>
                    <TableHead className="text-zinc-500 font-mono text-[10px] uppercase hidden md:table-cell">Uploaded By</TableHead>
                    <TableHead className="text-zinc-500 font-mono text-[10px] uppercase hidden lg:table-cell">Size</TableHead>
                    <TableHead className="text-zinc-500 font-mono text-[10px] uppercase">Date</TableHead>
                    <TableHead className="text-right text-zinc-500 font-mono text-[10px] uppercase">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.length === 0 ? (
                    <TableRow className="border-zinc-800">
                      <TableCell colSpan={7} className="text-center py-12 text-zinc-500 font-mono">
                        <div className="flex flex-col items-center gap-2">
                          <FileText className="h-8 w-8 text-zinc-700" />
                          <span>No documents found</span>
                          <span className="text-[10px] text-zinc-600">Upload documents to your projects</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : documents.map(doc => {
                    const IconComp = CATEGORY_ICONS[doc.document_type || ''] || FileText
                    return (
                      <TableRow key={doc.id} className="border-zinc-800 hover:bg-zinc-900/50 group">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded border flex items-center justify-center shrink-0 bg-zinc-950 border-zinc-800 text-zinc-400"><IconComp className="h-4 w-4" /></div>
                            <div className="min-w-0">
                              <button
                                className="font-medium text-zinc-200 text-xs font-mono group-hover:text-amber-500 transition-colors truncate max-w-[200px] block text-left cursor-pointer hover:underline"
                                onClick={() => handleDownload(doc)}
                                title="Click to open document"
                              >{doc.name || doc.title}</button>
                              <div className="text-[10px] text-zinc-600 font-mono truncate max-w-[200px]">{doc.original_filename || doc.file_name}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] font-mono uppercase whitespace-nowrap ${CATEGORY_COLORS[doc.document_type || ''] || CATEGORY_COLORS.other}`}>
                            {formatDocType(doc.document_type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-[10px] text-zinc-400 font-mono truncate max-w-[140px] block">{doc.project_name || '—'}</span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-[10px] text-zinc-400 font-mono">{doc.uploaded_by_name || '—'}</span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell"><span className="text-[10px] text-zinc-500 font-mono">{formatBytes(doc.file_size || doc.file_size_bytes)}</span></TableCell>
                        <TableCell><span className="text-[10px] text-zinc-400 font-mono whitespace-nowrap">{new Date(doc.created_at).toLocaleDateString('en-GB')}</span></TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" className="h-6 w-6 p-0 text-zinc-500 hover:text-white"><MoreVertical className="h-3 w-3" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-black border-zinc-800 text-zinc-300">
                              <DropdownMenuLabel className="text-xs font-mono uppercase text-zinc-500">Actions</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => handleDownload(doc)} className="hover:bg-zinc-900 cursor-pointer text-xs font-mono"><Download className="mr-2 h-3 w-3" /> Download</DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-zinc-800" />
                              <DropdownMenuItem onClick={() => handleDelete(doc.id, doc.project_id)} className="text-red-500 hover:bg-zinc-900 cursor-pointer text-xs font-mono"><Trash2 className="mr-2 h-3 w-3" /> Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800">
                  <span className="text-[10px] text-zinc-500 font-mono">SHOWING {(page - 1) * limit + 1}–{Math.min(page * limit, total)} OF {total}</span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="h-7 px-3 text-[10px] font-mono border-zinc-800 text-zinc-400 hover:text-white">PREV</Button>
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="h-7 px-3 text-[10px] font-mono border-zinc-800 text-zinc-400 hover:text-white">NEXT</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
