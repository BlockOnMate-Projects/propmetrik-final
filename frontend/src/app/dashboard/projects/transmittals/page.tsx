'use client'

import React, { useState } from 'react'
import { authedFetch } from '@/lib/authed-fetch'
import { useToast } from '@/hooks/use-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import {
  Send, Plus, FileText, CheckCircle2, Clock, AlertTriangle,
  Search, Filter, MoreVertical, Mail, Eye, Loader2, X, Trash2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const API = process.env.NEXT_PUBLIC_API_URL || ''

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'border-zinc-600 text-zinc-400' },
  issued: { label: 'Issued', cls: 'border-blue-600 text-blue-400' },
  partially_acknowledged: { label: 'Partial Ack', cls: 'border-amber-600 text-amber-400' },
  fully_acknowledged: { label: 'Acknowledged', cls: 'border-emerald-600 text-emerald-400' },
  closed: { label: 'Closed', cls: 'border-zinc-600 text-zinc-500' },
  void: { label: 'Void', cls: 'border-red-600 text-red-400' },
}

const PURPOSE_LABELS: Record<string, string> = {
  for_review: 'For Review',
  for_approval: 'For Approval',
  for_information: 'For Information',
  for_construction: 'For Construction',
  for_record: 'For Record',
  as_requested: 'As Requested',
}

export default function TransmittalsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const projectId = searchParams.get('projectId') || ''

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: transmittals, isLoading } = useQuery({
    queryKey: ['transmittals', projectId, search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (projectId) params.set('project_id', projectId)
      if (search) params.set('search', search)
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)
      params.set('limit', '50')
      const res = await authedFetch(`${API}/api/v1/transmittals?${params}`)
      if (!res.ok) throw new Error('Failed to load transmittals')
      return res.json()
    },
    enabled: !!projectId,
  })

  const { data: stats } = useQuery({
    queryKey: ['transmittal-stats', projectId],
    queryFn: async () => {
      const res = await authedFetch(`${API}/api/v1/transmittals/stats?project_id=${projectId}`)
      if (!res.ok) return null
      return res.json().then(r => r.data)
    },
    enabled: !!projectId,
  })

  const { data: detail } = useQuery({
    queryKey: ['transmittal', selectedId],
    queryFn: async () => {
      const res = await authedFetch(`${API}/api/v1/transmittals/${selectedId}`)
      if (!res.ok) throw new Error('Failed to load transmittal')
      return res.json().then(r => r.data)
    },
    enabled: !!selectedId,
  })

  // ── Mutations ─────────────────────────────────────────────────────────────

  const issueMutation = useMutation({
    mutationFn: (id: string) =>
      authedFetch(`${API}/api/v1/transmittals/${id}/issue`, { method: 'POST' }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transmittals'] })
      queryClient.invalidateQueries({ queryKey: ['transmittal-stats'] })
      toast({ title: 'Transmittal issued' })
    },
  })

  const closeMutation = useMutation({
    mutationFn: (id: string) =>
      authedFetch(`${API}/api/v1/transmittals/${id}/close`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transmittals'] })
      queryClient.invalidateQueries({ queryKey: ['transmittal-stats'] })
      toast({ title: 'Transmittal closed' })
    },
  })

  const voidMutation = useMutation({
    mutationFn: (id: string) =>
      authedFetch(`${API}/api/v1/transmittals/${id}/void`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transmittals'] })
      toast({ title: 'Transmittal voided' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      authedFetch(`${API}/api/v1/transmittals/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transmittals'] })
      queryClient.invalidateQueries({ queryKey: ['transmittal-stats'] })
      setSelectedId(null)
      toast({ title: 'Transmittal deleted' })
    },
  })

  // ── Stat Cards ────────────────────────────────────────────────────────────

  const statCards = [
    { label: 'Total', value: stats?.total || 0, icon: FileText, color: 'text-zinc-400' },
    { label: 'Issued', value: stats?.issued || 0, icon: Send, color: 'text-blue-400' },
    { label: 'Acknowledged', value: stats?.acknowledged || 0, icon: CheckCircle2, color: 'text-emerald-400' },
    { label: 'Overdue', value: stats?.overdue || 0, icon: AlertTriangle, color: 'text-red-400' },
  ]

  if (!projectId) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-500 font-mono text-sm">
        Select a project to manage transmittals
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-white tracking-tight">TRANSMITTALS</h1>
          <p className="text-zinc-500 font-mono text-xs mt-1">Formal document distribution &amp; acknowledgement tracking</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button className="bg-amber-500 hover:bg-amber-600 text-black font-mono text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" />NEW TRANSMITTAL
            </Button>
          </DialogTrigger>
          <CreateTransmittalDialog
            projectId={projectId}
            onCreated={() => {
              setShowCreate(false)
              queryClient.invalidateQueries({ queryKey: ['transmittals'] })
              queryClient.invalidateQueries({ queryKey: ['transmittal-stats'] })
            }}
          />
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCards.map(s => (
          <Card key={s.label} className="bg-zinc-900/80 border-zinc-800">
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`h-5 w-5 ${s.color}`} />
              <div>
                <p className="text-lg font-mono font-bold text-white">{s.value}</p>
                <p className="text-[10px] font-mono text-zinc-500 uppercase">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search transmittals..."
            className="pl-9 bg-zinc-900 border-zinc-800 text-white text-xs font-mono"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 bg-zinc-900 border-zinc-800 text-white text-xs font-mono">
            <Filter className="h-3 w-3 mr-1 text-zinc-500" /><SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800">
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="partially_acknowledged">Partial Ack</SelectItem>
            <SelectItem value="fully_acknowledged">Acknowledged</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table + Detail Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* List */}
        <div className={`${selectedId ? 'lg:col-span-1' : 'lg:col-span-3'} space-y-2`}>
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-amber-500" /></div>
          ) : !transmittals?.data?.length ? (
            <Card className="bg-zinc-900/80 border-zinc-800">
              <CardContent className="p-8 text-center">
                <FileText className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
                <p className="text-sm text-zinc-500">No transmittals found</p>
                <Button onClick={() => setShowCreate(true)} size="sm" className="mt-3 bg-amber-500 text-black text-xs">
                  Create First Transmittal
                </Button>
              </CardContent>
            </Card>
          ) : (
            transmittals.data.map((t: any) => {
              const badge = STATUS_BADGE[t.status] || STATUS_BADGE.draft
              return (
                <Card
                  key={t.id}
                  className={`bg-zinc-900/80 border-zinc-800 cursor-pointer transition-colors hover:border-zinc-700 ${selectedId === t.id ? 'border-amber-500/50' : ''}`}
                  onClick={() => setSelectedId(t.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-amber-400 font-bold">{t.transmittal_number}</span>
                          <Badge variant="outline" className={`text-[10px] ${badge.cls}`}>{badge.label}</Badge>
                          {t.priority === 'urgent' && <Badge className="bg-red-500/20 text-red-400 text-[10px]">Urgent</Badge>}
                        </div>
                        <p className="text-sm text-white truncate">{t.subject}</p>
                        <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-500">
                          {t.to_company && <span>To: {t.to_company}</span>}
                          <span>{t.item_count} items</span>
                          <span>{t.acknowledged_count}/{t.recipient_count} ack</span>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={e => e.stopPropagation()}>
                            <MoreVertical className="h-3.5 w-3.5 text-zinc-500" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-zinc-900 border-zinc-800">
                          <DropdownMenuItem onClick={() => setSelectedId(t.id)}>
                            <Eye className="h-3 w-3 mr-2" />View Detail
                          </DropdownMenuItem>
                          {t.status === 'draft' && (
                            <>
                              <DropdownMenuItem onClick={() => issueMutation.mutate(t.id)}>
                                <Send className="h-3 w-3 mr-2" />Issue
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => deleteMutation.mutate(t.id)} className="text-red-400">
                                <Trash2 className="h-3 w-3 mr-2" />Delete
                              </DropdownMenuItem>
                            </>
                          )}
                          {['issued', 'partially_acknowledged', 'fully_acknowledged'].includes(t.status) && (
                            <DropdownMenuItem onClick={() => closeMutation.mutate(t.id)}>
                              <CheckCircle2 className="h-3 w-3 mr-2" />Close
                            </DropdownMenuItem>
                          )}
                          {t.status !== 'void' && t.status !== 'closed' && (
                            <DropdownMenuItem onClick={() => voidMutation.mutate(t.id)} className="text-red-400">
                              <X className="h-3 w-3 mr-2" />Void
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>

        {/* Detail Panel */}
        {selectedId && detail && (
          <div className="lg:col-span-2 space-y-4">
            <Card className="bg-zinc-900/80 border-zinc-800">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-mono text-amber-400">{detail.transmittal_number}</CardTitle>
                    <p className="text-white text-lg font-medium mt-1">{detail.subject}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
                    <X className="h-4 w-4 text-zinc-500" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><p className="text-[10px] font-mono text-zinc-500">STATUS</p><Badge variant="outline" className={STATUS_BADGE[detail.status]?.cls}>{STATUS_BADGE[detail.status]?.label}</Badge></div>
                  <div><p className="text-[10px] font-mono text-zinc-500">PURPOSE</p><p className="text-sm text-white">{PURPOSE_LABELS[detail.purpose] || detail.purpose}</p></div>
                  <div><p className="text-[10px] font-mono text-zinc-500">TO</p><p className="text-sm text-white">{detail.to_company || detail.to_contact || '—'}</p></div>
                  <div><p className="text-[10px] font-mono text-zinc-500">DUE DATE</p><p className="text-sm text-white">{detail.due_date ? new Date(detail.due_date).toLocaleDateString() : '—'}</p></div>
                </div>
                {detail.description && (
                  <div><p className="text-[10px] font-mono text-zinc-500">DESCRIPTION</p><p className="text-sm text-zinc-300">{detail.description}</p></div>
                )}
              </CardContent>
            </Card>

            {/* Items */}
            <Card className="bg-zinc-900/80 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-mono text-zinc-400">DOCUMENT ITEMS ({detail.items?.length || 0})</CardTitle>
              </CardHeader>
              <CardContent>
                {detail.items?.length ? (
                  <div className="space-y-2">
                    {detail.items.map((item: any) => (
                      <div key={item.id} className="flex items-center justify-between p-3 bg-zinc-800/50 border border-zinc-700/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-amber-400 font-bold">{item.item_number}</span>
                          <div>
                            <p className="text-sm text-white">{item.document_title}</p>
                            <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500">
                              {item.document_ref && <span>Ref: {item.document_ref}</span>}
                              {item.revision && <span>Rev: {item.revision}</span>}
                              <span>{item.format}</span>
                            </div>
                          </div>
                        </div>
                        {item.file_url && (
                          <a href={item.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">
                            View File
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 text-center py-4">No items added yet</p>
                )}
              </CardContent>
            </Card>

            {/* Recipients */}
            <Card className="bg-zinc-900/80 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-mono text-zinc-400">RECIPIENTS ({detail.recipients?.length || 0})</CardTitle>
              </CardHeader>
              <CardContent>
                {detail.recipients?.length ? (
                  <div className="space-y-2">
                    {detail.recipients.map((r: any) => (
                      <div key={r.id} className="flex items-center justify-between p-3 bg-zinc-800/50 border border-zinc-700/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Mail className="h-4 w-4 text-zinc-500" />
                          <div>
                            <p className="text-sm text-white">{r.recipient_name || r.recipient_email}</p>
                            {r.recipient_name && <p className="text-[10px] font-mono text-zinc-500">{r.recipient_email}</p>}
                          </div>
                        </div>
                        {r.acknowledged ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">
                            <CheckCircle2 className="h-3 w-3 mr-1" />Acknowledged
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-zinc-600 text-zinc-400 text-[10px]">
                            <Clock className="h-3 w-3 mr-1" />Pending
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 text-center py-4">No recipients</p>
                )}
              </CardContent>
            </Card>

            {/* Activity */}
            {detail.activity?.length > 0 && (
              <Card className="bg-zinc-900/80 border-zinc-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-mono text-zinc-400">ACTIVITY LOG</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {detail.activity.map((a: any) => (
                      <div key={a.id} className="flex items-center gap-3 text-xs">
                        <span className="text-zinc-500 font-mono">{new Date(a.created_at).toLocaleDateString()}</span>
                        <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{a.action}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Create Dialog ──────────────────────────────────────────────────────────

function CreateTransmittalDialog({
  projectId,
  onCreated,
}: {
  projectId: string
  onCreated: () => void
}) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    subject: '',
    description: '',
    to_company: '',
    to_contact: '',
    to_email: '',
    due_date: '',
    purpose: 'for_review',
    priority: 'normal',
    response_required: true,
  })
  const [items, setItems] = useState<{ document_title: string; document_ref: string; revision: string }[]>([])
  const [recipientEmail, setRecipientEmail] = useState('')
  const [recipients, setRecipients] = useState<{ email: string; name?: string }[]>([])

  const addItem = () => {
    setItems([...items, { document_title: '', document_ref: '', revision: '' }])
  }

  const updateItem = (idx: number, field: string, value: string) => {
    setItems(items.map((item, i) => (i === idx ? { ...item, [field]: value } : item)))
  }

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx))
  }

  const addRecipient = () => {
    if (!recipientEmail || !recipientEmail.includes('@')) return
    setRecipients([...recipients, { email: recipientEmail }])
    setRecipientEmail('')
  }

  const create = async () => {
    if (!form.subject) {
      toast({ title: 'Subject is required', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await authedFetch(`${API}/api/v1/transmittals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          ...form,
          items: items.filter(i => i.document_title),
          recipients,
        }),
      })
      if (res.ok) {
        toast({ title: 'Transmittal created' })
        onCreated()
      } else {
        const err = await res.json().catch(() => ({}))
        toast({ title: err.message || 'Failed to create', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Failed to create transmittal', variant: 'destructive' })
    }
    setSaving(false)
  }

  return (
    <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="text-white font-mono">NEW TRANSMITTAL</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <Label className="text-[10px] font-mono text-zinc-500">SUBJECT *</Label>
          <Input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" />
        </div>
        <div>
          <Label className="text-[10px] font-mono text-zinc-500">DESCRIPTION</Label>
          <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="bg-zinc-800 border-zinc-700 text-white" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[10px] font-mono text-zinc-500">TO COMPANY</Label>
            <Input value={form.to_company} onChange={e => setForm({ ...form, to_company: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" />
          </div>
          <div>
            <Label className="text-[10px] font-mono text-zinc-500">TO CONTACT</Label>
            <Input value={form.to_contact} onChange={e => setForm({ ...form, to_contact: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-[10px] font-mono text-zinc-500">PURPOSE</Label>
            <Select value={form.purpose} onValueChange={v => setForm({ ...form, purpose: v })}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {Object.entries(PURPOSE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] font-mono text-zinc-500">PRIORITY</Label>
            <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] font-mono text-zinc-500">DUE DATE</Label>
            <Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white text-xs" />
          </div>
        </div>

        {/* Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-[10px] font-mono text-zinc-500">DOCUMENT ITEMS</Label>
            <Button type="button" size="sm" variant="outline" onClick={addItem} className="text-xs border-zinc-700 text-zinc-400">
              <Plus className="h-3 w-3 mr-1" />Add Item
            </Button>
          </div>
          {items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2 mb-2">
              <Input placeholder="Document title" value={item.document_title} onChange={e => updateItem(idx, 'document_title', e.target.value)} className="bg-zinc-800 border-zinc-700 text-white text-xs flex-1" />
              <Input placeholder="Ref" value={item.document_ref} onChange={e => updateItem(idx, 'document_ref', e.target.value)} className="bg-zinc-800 border-zinc-700 text-white text-xs w-24" />
              <Input placeholder="Rev" value={item.revision} onChange={e => updateItem(idx, 'revision', e.target.value)} className="bg-zinc-800 border-zinc-700 text-white text-xs w-16" />
              <Button type="button" size="sm" variant="ghost" onClick={() => removeItem(idx)} className="h-8 w-8 p-0">
                <X className="h-3 w-3 text-zinc-500" />
              </Button>
            </div>
          ))}
        </div>

        {/* Recipients */}
        <div>
          <Label className="text-[10px] font-mono text-zinc-500">RECIPIENTS</Label>
          <div className="flex items-center gap-2 mb-2">
            <Input placeholder="email@example.com" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white text-xs flex-1" onKeyDown={e => e.key === 'Enter' && addRecipient()} />
            <Button type="button" size="sm" variant="outline" onClick={addRecipient} className="text-xs border-zinc-700 text-zinc-400">Add</Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {recipients.map((r, i) => (
              <Badge key={i} variant="outline" className="border-zinc-700 text-zinc-300 text-[10px] pr-1">
                {r.email}
                <button onClick={() => setRecipients(recipients.filter((_, j) => j !== i))} className="ml-1 hover:text-red-400">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>

        <Button onClick={create} disabled={saving || !form.subject} className="w-full bg-amber-500 hover:bg-amber-600 text-black font-mono text-xs">
          {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
          CREATE TRANSMITTAL
        </Button>
      </div>
    </DialogContent>
  )
}
