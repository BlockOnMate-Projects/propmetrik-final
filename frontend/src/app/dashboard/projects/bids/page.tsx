'use client'

import React, { useState, useEffect, useRef } from 'react'
import { authedFetch } from '@/lib/authed-fetch'
import { useToast } from '@/hooks/use-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, Gavel, FileText, Clock, Send, CheckCircle2, Star, XCircle,
  Eye, Loader2, Trash2, Upload, MailPlus, AlertTriangle, Trophy,
  MessageSquare, MoreVertical, Copy, Users, DollarSign, ChevronLeft,
  Paperclip, RotateCw, Download, ExternalLink,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const API = process.env.NEXT_PUBLIC_API_URL || ''

/* ─── types ─── */
interface Project { id: string; name: string }
interface BidRequest {
  id: string; title: string; description: string; trade_category: string; estimated_budget: number | null
  currency: string; submission_deadline: string; site_visit_date: string | null; qa_deadline: string | null
  vendor_eligibility_notes: string | null; status: string; project_id: string; project_name: string
  attachments: any[]; invitation_count: number; submission_count: number; created_at: string
  disclose_budget: boolean
}
interface Invitation {
  id: string; vendor_email: string; vendor_name: string; vendor_company: string
  token: string; status: string; invited_at: string; viewed_at: string | null; has_submission: boolean
}
interface Submission {
  id: string; vendor_name: string; vendor_company: string; vendor_email: string
  total_bid_price: number; currency: string; proposed_timeline: string | null; timeline_weeks: number | null
  line_items: any[]; materials_specification: string | null; notes: string | null
  value_engineering_suggestions: string | null; attachments: any[]; status: string; score: number | null
  submitted_at: string
}
interface QAThread {
  id: string; question: string; asked_by_name: string; asked_by_email: string
  answer: string | null; answered_by: string | null; is_public: boolean
  asked_at: string; answered_at: string | null
}
interface Award { id: string; submission_id: string; awarded_by: string; awarded_at: string; notes: string | null }
interface ActivityLog { id: string; action: string; actor_name: string; details: any; created_at: string }

/* status map */
const STATUS_MAP: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  draft: { label: 'Draft', cls: 'border-zinc-600 text-muted-foreground', icon: <FileText className="h-3 w-3" /> },
  published: { label: 'Published', cls: 'border-blue-600 text-blue-600 dark:text-blue-400', icon: <Send className="h-3 w-3" /> },
  closed: { label: 'Closed', cls: 'border-yellow-600 text-yellow-600 dark:text-yellow-400', icon: <Clock className="h-3 w-3" /> },
  under_evaluation: { label: 'Evaluating', cls: 'border-purple-600 text-purple-600 dark:text-purple-400', icon: <Eye className="h-3 w-3" /> },
  awarded: { label: 'Awarded', cls: 'border-green-600 text-green-600 dark:text-green-400', icon: <Trophy className="h-3 w-3" /> },
  cancelled: { label: 'Cancelled', cls: 'border-red-600 text-red-600 dark:text-red-400', icon: <XCircle className="h-3 w-3" /> },
  archived: { label: 'Archived', cls: 'border-border text-muted-foreground', icon: <FileText className="h-3 w-3" /> },
}

const SUB_STATUS: Record<string, { label: string; cls: string }> = {
  submitted: { label: 'Submitted', cls: 'border-blue-600 text-blue-600 dark:text-blue-400' },
  shortlisted: { label: 'Shortlisted', cls: 'border-amber-600 text-amber-600 dark:text-amber-400' },
  rejected: { label: 'Rejected', cls: 'border-red-600 text-red-600 dark:text-red-400' },
  awarded: { label: 'Awarded', cls: 'border-green-600 text-green-600 dark:text-green-400' },
}

const TRADE_CATEGORIES = [
  'electrical', 'plumbing', 'hvac', 'structural', 'civil',
  'roofing', 'landscaping', 'mechanical', 'finishing',
  'consultancy', 'other',
]

/* ---------- component ---------- */
export default function BidManagementPage() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  // global state
  const [projects, setProjects] = useState<Project[]>([])
  const [projectFilter, setProjectFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [tradeFilter, setTradeFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // create/edit form
  const [form, setForm] = useState({
    title: '', description: '', trade_category: 'other', estimated_budget: '', currency: 'GHS',
    submission_deadline: '', site_visit_date: '', qa_deadline: '', vendor_eligibility_notes: '',
    project_id: '', disclose_budget: false,
  })

  // invitation form state
  const [invForm, setInvForm] = useState({ vendor_name: '', vendor_email: '', vendor_company: '' })
  const [showInvDialog, setShowInvDialog] = useState(false)

  // Q&A answer state
  const [answerText, setAnswerText] = useState('')
  const [answeringId, setAnsweringId] = useState<string | null>(null)

  // Award state
  const [showAwardDialog, setShowAwardDialog] = useState(false)
  const [awardSubId, setAwardSubId] = useState('')
  const [awardNotes, setAwardNotes] = useState('')

  // load projects
  useEffect(() => {
    (async () => {
      try {
        const res = await authedFetch(`${API}/projects?limit=100`)
        const json = await res.json()
        const list = json.data?.projects || json.data || json.projects || []
        setProjects(list)
      } catch (e) { console.error('Failed to load projects', e) }
    })()
  }, [])

  // ── queries ──────────────────────────────────────────────────

  const { data: bidRequests, isLoading: loadingList } = useQuery({
    queryKey: ['bid-requests', projectFilter, statusFilter, tradeFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (projectFilter) params.set('project_id', projectFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (tradeFilter !== 'all') params.set('trade_category', tradeFilter)
      if (search) params.set('search', search)
      params.set('limit', '100')
      const res = await authedFetch(`${API}/bid-requests?${params}`)
      if (!res.ok) throw new Error('Failed')
      const json = await res.json()
      return (json.data || []) as BidRequest[]
    },
    refetchInterval: 30_000,
  })

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['bid-request-detail', selectedId],
    queryFn: async () => {
      const res = await authedFetch(`${API}/bid-requests/${selectedId}`)
      if (!res.ok) throw new Error('Failed')
      const json = await res.json()
      return json.data as BidRequest & {
        invitations: Invitation[]; submissions: Submission[];
        qa_threads: QAThread[]; awards: Award[]; activity: ActivityLog[]
      }
    },
    enabled: !!selectedId,
    refetchInterval: 15_000,
  })

  // ── mutations ────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: async (data: any) => {
      const url = editingId ? `${API}/bid-requests/${editingId}` : `${API}/bid-requests`
      const method = editingId ? 'PATCH' : 'POST'
      const res = await authedFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      return res.json()
    },
    onSuccess: (json) => {
      if (json.success) {
        qc.invalidateQueries({ queryKey: ['bid-requests'] })
        setShowCreate(false); setEditingId(null)
        toast({ title: editingId ? 'Bid request updated' : 'Bid request created' })
        if (!editingId && json.data?.id) setSelectedId(json.data.id)
      } else { toast({ title: 'Error', description: json.error, variant: 'destructive' }) }
    },
  })

  const publishMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await authedFetch(`${API}/bid-requests/${id}/publish`, { method: 'POST' })
      return res.json()
    },
    onSuccess: (json) => {
      if (json.success) {
        qc.invalidateQueries({ queryKey: ['bid-requests'] }); qc.invalidateQueries({ queryKey: ['bid-request-detail'] })
        toast({ title: 'Bid request published — invitations sent' })
      } else { toast({ title: 'Error', description: json.error, variant: 'destructive' }) }
    },
  })

  const closeMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await authedFetch(`${API}/bid-requests/${id}/close`, { method: 'POST' })
      return res.json()
    },
    onSuccess: (json) => {
      if (json.success) {
        qc.invalidateQueries({ queryKey: ['bid-requests'] }); qc.invalidateQueries({ queryKey: ['bid-request-detail'] })
        toast({ title: 'Bid request closed' })
      } else { toast({ title: 'Error', description: json.error, variant: 'destructive' }) }
    },
  })

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await authedFetch(`${API}/bid-requests/${id}`, { method: 'DELETE' })
      return res.json()
    },
    onSuccess: (json) => {
      if (json.success) {
        qc.invalidateQueries({ queryKey: ['bid-requests'] }); setSelectedId(null)
        toast({ title: 'Bid request deleted' })
      } else { toast({ title: 'Error', description: json.error, variant: 'destructive' }) }
    },
  })

  const addInvMut = useMutation({
    mutationFn: async ({ id, vendors }: { id: string; vendors: any[] }) => {
      const res = await authedFetch(`${API}/bid-requests/${id}/invitations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vendors }),
      })
      return res.json()
    },
    onSuccess: (json) => {
      if (json.success) {
        qc.invalidateQueries({ queryKey: ['bid-request-detail'] }); qc.invalidateQueries({ queryKey: ['bid-requests'] })
        setShowInvDialog(false); setInvForm({ vendor_name: '', vendor_email: '', vendor_company: '' })
        toast({ title: 'Vendor invited' })
      } else { toast({ title: 'Error', description: json.error, variant: 'destructive' }) }
    },
  })

  const removeInvMut = useMutation({
    mutationFn: async ({ brId, invId }: { brId: string; invId: string }) => {
      const res = await authedFetch(`${API}/bid-requests/${brId}/invitations/${invId}`, { method: 'DELETE' })
      return res.json()
    },
    onSuccess: (json) => {
      if (json.success) {
        qc.invalidateQueries({ queryKey: ['bid-request-detail'] }); qc.invalidateQueries({ queryKey: ['bid-requests'] })
        toast({ title: 'Invitation removed' })
      } else { toast({ title: 'Error', description: json.error, variant: 'destructive' }) }
    },
  })

  const resendInvMut = useMutation({
    mutationFn: async ({ brId, invId }: { brId: string; invId: string }) => {
      const res = await authedFetch(`${API}/bid-requests/${brId}/invitations/resend`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invitation_id: invId }),
      })
      return res.json()
    },
    onSuccess: (json) => {
      if (json.success) { toast({ title: 'Invitation resent' }) }
      else { toast({ title: 'Error', description: json.error, variant: 'destructive' }) }
    },
  })

  const updateSubStatusMut = useMutation({
    mutationFn: async ({ brId, subId, status, score }: { brId: string; subId: string; status: string; score?: number }) => {
      const res = await authedFetch(`${API}/bid-requests/${brId}/submissions/${subId}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, score }),
      })
      return res.json()
    },
    onSuccess: (json) => {
      if (json.success) {
        qc.invalidateQueries({ queryKey: ['bid-request-detail'] })
        toast({ title: 'Submission status updated' })
      } else { toast({ title: 'Error', description: json.error, variant: 'destructive' }) }
    },
  })

  const awardMut = useMutation({
    mutationFn: async ({ brId, submission_id, notes }: { brId: string; submission_id: string; notes: string }) => {
      const res = await authedFetch(`${API}/bid-requests/${brId}/award`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submission_id, notes }),
      })
      return res.json()
    },
    onSuccess: (json) => {
      if (json.success) {
        qc.invalidateQueries({ queryKey: ['bid-request-detail'] }); qc.invalidateQueries({ queryKey: ['bid-requests'] })
        setShowAwardDialog(false); setAwardSubId(''); setAwardNotes('')
        toast({ title: 'Bid awarded successfully' })
      } else { toast({ title: 'Error', description: json.error, variant: 'destructive' }) }
    },
  })

  const answerMut = useMutation({
    mutationFn: async ({ brId, threadId, answer }: { brId: string; threadId: string; answer: string }) => {
      const res = await authedFetch(`${API}/bid-requests/${brId}/qa/${threadId}/answer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer }),
      })
      return res.json()
    },
    onSuccess: (json) => {
      if (json.success) {
        qc.invalidateQueries({ queryKey: ['bid-request-detail'] })
        setAnswerText(''); setAnsweringId(null)
        toast({ title: 'Answer posted' })
      } else { toast({ title: 'Error', description: json.error, variant: 'destructive' }) }
    },
  })

  const uploadMut = useMutation({
    mutationFn: async ({ id, files }: { id: string; files: File[] }) => {
      const fd = new FormData()
      for (const f of files) fd.append('files', f)
      const res = await authedFetch(`${API}/bid-requests/${id}/attachments`, { method: 'POST', body: fd })
      return res.json()
    },
    onSuccess: (json) => {
      if (json.success) {
        qc.invalidateQueries({ queryKey: ['bid-request-detail'] })
        toast({ title: 'Attachments uploaded' })
      } else { toast({ title: 'Error', description: json.error, variant: 'destructive' }) }
    },
  })

  // ── helpers ──────────────────────────────────────────────────

  const openCreate = (projectId?: string) => {
    setEditingId(null)
    setForm({
      title: '', description: '', trade_category: 'other', estimated_budget: '', currency: 'GHS',
      submission_deadline: '', site_visit_date: '', qa_deadline: '', vendor_eligibility_notes: '',
      project_id: projectId || projectFilter || (projects.length === 1 ? projects[0].id : ''),
      disclose_budget: false,
    })
    setShowCreate(true)
  }

  const openEdit = (br: BidRequest) => {
    setEditingId(br.id)
    setForm({
      title: br.title, description: br.description || '', trade_category: br.trade_category || 'other',
      estimated_budget: br.estimated_budget ? String(br.estimated_budget) : '', currency: br.currency || 'GHS',
      submission_deadline: br.submission_deadline ? br.submission_deadline.substring(0, 16) : '',
      site_visit_date: br.site_visit_date ? br.site_visit_date.substring(0, 16) : '',
      qa_deadline: br.qa_deadline ? br.qa_deadline.substring(0, 16) : '',
      vendor_eligibility_notes: br.vendor_eligibility_notes || '',
      project_id: br.project_id, disclose_budget: br.disclose_budget ?? false,
    })
    setShowCreate(true)
  }

  const handleSubmitForm = () => {
    const payload: any = { ...form }
    if (payload.estimated_budget) payload.estimated_budget = Number(payload.estimated_budget)
    else delete payload.estimated_budget
    if (!payload.submission_deadline) { toast({ title: 'Deadline required', variant: 'destructive' }); return }
    if (!payload.title) { toast({ title: 'Title required', variant: 'destructive' }); return }
    if (!payload.project_id) { toast({ title: 'Project required', variant: 'destructive' }); return }
    if (!payload.site_visit_date) delete payload.site_visit_date
    if (!payload.qa_deadline) delete payload.qa_deadline
    if (!payload.vendor_eligibility_notes) delete payload.vendor_eligibility_notes
    createMut.mutate(payload)
  }

  const copyVendorLink = (token: string) => {
    const url = `${window.location.origin}/vendor/bid/${token}`
    navigator.clipboard.writeText(url)
    toast({ title: 'Vendor link copied to clipboard' })
  }

  // KPI calculations
  const list = bidRequests || []
  const kpi = {
    total: list.length,
    draft: list.filter(b => b.status === 'draft').length,
    active: list.filter(b => b.status === 'published').length,
    awarded: list.filter(b => b.status === 'awarded').length,
  }

  /* =================== DETAIL VIEW =================== */
  if (selectedId && detail) {
    const s = STATUS_MAP[detail.status] || STATUS_MAP.draft
    const submissions = detail.submissions || []
    const invitations = detail.invitations || []
    const qa = detail.qa_threads || []
    const activity = detail.activity || []
    const awards = detail.awards || []

    // analytics for submissions
    const prices = submissions.map(s => Number(s.total_bid_price)).filter(p => p > 0)
    const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0
    const minPrice = prices.length ? Math.min(...prices) : 0
    const maxPrice = prices.length ? Math.max(...prices) : 0
    const shortlisted = submissions.filter(s => s.status === 'shortlisted').length

    return (
      <div className="space-y-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)} className="text-muted-foreground hover:text-foreground gap-1">
            <ChevronLeft className="h-4 w-4" /> Back to Bids
          </Button>
        </div>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-lg font-bold text-foreground">{detail.title}</h1>
              <Badge variant="outline" className={s.cls}>{s.label}</Badge>
            </div>
            <p className="text-xs font-mono text-muted-foreground">{detail.project_name} · {detail.trade_category?.replace(/_/g, ' ')?.toUpperCase()}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {detail.status === 'draft' && (
              <>
                <Button size="sm" variant="outline" className="border-border text-muted-foreground text-xs" onClick={() => openEdit(detail)}>Edit</Button>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-foreground text-xs" onClick={() => publishMut.mutate(detail.id)}
                  disabled={publishMut.isPending || invitations.length === 0}>
                  {publishMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                  Publish & Send
                </Button>
              </>
            )}
            {detail.status === 'published' && (
              <Button size="sm" variant="outline" className="border-yellow-700 text-yellow-600 dark:text-yellow-400 text-xs" onClick={() => closeMut.mutate(detail.id)}>
                Close Bidding
              </Button>
            )}
            {['published', 'closed', 'under_evaluation'].includes(detail.status) && submissions.filter(s => s.status === 'shortlisted').length > 0 && !awards.length && (
              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-foreground text-xs" onClick={() => setShowAwardDialog(true)}>
                <Trophy className="h-3 w-3 mr-1" /> Award Bid
              </Button>
            )}
            {detail.status === 'draft' && (
              <Button size="sm" variant="ghost" className="text-red-600 dark:text-red-400 text-xs" onClick={() => { if (confirm('Delete this bid request?')) deleteMut.mutate(detail.id) }}>
                <Trash2 className="h-3 w-3 mr-1" /> Delete
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="bg-card border-border"><CardContent className="p-3">
            <span className="text-[10px] font-mono text-muted-foreground block">DEADLINE</span>
            <span className="text-foreground text-sm font-mono">{new Date(detail.submission_deadline).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}</span>
          </CardContent></Card>
          <Card className="bg-card border-border"><CardContent className="p-3">
            <span className="text-[10px] font-mono text-muted-foreground block">VENDORS INVITED</span>
            <span className="text-foreground text-sm font-mono">{invitations.length}</span>
          </CardContent></Card>
          <Card className="bg-card border-border"><CardContent className="p-3">
            <span className="text-[10px] font-mono text-muted-foreground block">SUBMISSIONS</span>
            <span className="text-foreground text-sm font-mono">{submissions.length}</span>
          </CardContent></Card>
          {detail.estimated_budget && (
            <Card className="bg-card border-border"><CardContent className="p-3">
              <span className="text-[10px] font-mono text-muted-foreground block">EST. BUDGET</span>
              <span className="text-amber-600 dark:text-amber-400 text-sm font-mono">{detail.currency} {Number(detail.estimated_budget).toLocaleString()}</span>
            </CardContent></Card>
          )}
          <Card className="bg-card border-border"><CardContent className="p-3">
            <span className="text-[10px] font-mono text-muted-foreground block">QUESTIONS</span>
            <span className="text-foreground text-sm font-mono">{qa.length}</span>
          </CardContent></Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="invitations" className="space-y-4">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="invitations" className="data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground text-xs">
              <Users className="h-3 w-3 mr-1" /> Invitations ({invitations.length})
            </TabsTrigger>
            <TabsTrigger value="submissions" className="data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground text-xs">
              <DollarSign className="h-3 w-3 mr-1" /> Submissions ({submissions.length})
            </TabsTrigger>
            <TabsTrigger value="qa" className="data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground text-xs">
              <MessageSquare className="h-3 w-3 mr-1" /> Q&A ({qa.length})
            </TabsTrigger>
            <TabsTrigger value="attachments" className="data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground text-xs">
              <Paperclip className="h-3 w-3 mr-1" /> Files ({detail.attachments?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="activity" className="data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground text-xs">
              <Clock className="h-3 w-3 mr-1" /> Activity
            </TabsTrigger>
          </TabsList>

          {/* ─── Invitations Tab ─── */}
          <TabsContent value="invitations" className="space-y-4">
            {['draft', 'published'].includes(detail.status) && (
              <div className="flex justify-end">
                <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-foreground text-xs" onClick={() => setShowInvDialog(true)}>
                  <MailPlus className="h-3 w-3 mr-1" /> Invite Vendor
                </Button>
              </div>
            )}
            {invitations.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">No vendors invited yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-[10px] font-mono text-muted-foreground">VENDOR</th>
                    <th className="text-left py-2 px-3 text-[10px] font-mono text-muted-foreground">COMPANY</th>
                    <th className="text-left py-2 px-3 text-[10px] font-mono text-muted-foreground">STATUS</th>
                    <th className="text-left py-2 px-3 text-[10px] font-mono text-muted-foreground">VIEWED</th>
                    <th className="text-left py-2 px-3 text-[10px] font-mono text-muted-foreground">SUBMITTED</th>
                    <th className="text-right py-2 px-3 text-[10px] font-mono text-muted-foreground">ACTIONS</th>
                  </tr></thead>
                  <tbody>
                    {invitations.map(inv => (
                      <tr key={inv.id} className="border-b border-border/50 hover:bg-card/50">
                        <td className="py-2 px-3">
                          <div className="text-foreground text-sm">{inv.vendor_name}</div>
                          <div className="text-muted-foreground text-xs">{inv.vendor_email}</div>
                        </td>
                        <td className="py-2 px-3 text-muted-foreground text-sm">{inv.vendor_company}</td>
                        <td className="py-2 px-3">
                          <Badge variant="outline" className={
                            inv.status === 'pending' ? 'border-zinc-600 text-muted-foreground' :
                            inv.status === 'viewed' ? 'border-blue-600 text-blue-600 dark:text-blue-400' :
                            inv.status === 'declined' ? 'border-red-600 text-red-600 dark:text-red-400' :
                            inv.status === 'submitted' ? 'border-green-600 text-green-600 dark:text-green-400' :
                            'border-zinc-600 text-muted-foreground'
                          }>{inv.status}</Badge>
                        </td>
                        <td className="py-2 px-3 text-muted-foreground text-xs font-mono">{inv.viewed_at ? new Date(inv.viewed_at).toLocaleDateString('en-GB') : '—'}</td>
                        <td className="py-2 px-3 text-muted-foreground text-xs font-mono">{inv.has_submission ? '✓' : '—'}</td>
                        <td className="py-2 px-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground"><MoreVertical className="h-3 w-3" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-card border-border">
                              <DropdownMenuItem className="text-muted-foreground text-xs" onClick={() => copyVendorLink(inv.token)}>
                                <Copy className="h-3 w-3 mr-2" /> Copy Link
                              </DropdownMenuItem>
                              {detail.status === 'published' && inv.status === 'pending' && (
                                <DropdownMenuItem className="text-muted-foreground text-xs" onClick={() => resendInvMut.mutate({ brId: detail.id, invId: inv.id })}>
                                  <RotateCw className="h-3 w-3 mr-2" /> Resend Email
                                </DropdownMenuItem>
                              )}
                              {!inv.has_submission && detail.status === 'draft' && (
                                <DropdownMenuItem className="text-red-600 dark:text-red-400 text-xs" onClick={() => removeInvMut.mutate({ brId: detail.id, invId: inv.id })}>
                                  <Trash2 className="h-3 w-3 mr-2" /> Remove
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* ─── Submissions Tab ─── */}
          <TabsContent value="submissions" className="space-y-4">
            {submissions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">No submissions received yet</div>
            ) : (
              <>
                {/* Submission Analytics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="bg-card border-border"><CardContent className="p-3">
                    <span className="text-[10px] font-mono text-muted-foreground block">AVERAGE</span>
                    <span className="text-foreground text-sm font-mono">{detail.currency} {avgPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </CardContent></Card>
                  <Card className="bg-card border-border"><CardContent className="p-3">
                    <span className="text-[10px] font-mono text-muted-foreground block">LOWEST</span>
                    <span className="text-green-600 dark:text-green-400 text-sm font-mono">{detail.currency} {minPrice.toLocaleString()}</span>
                  </CardContent></Card>
                  <Card className="bg-card border-border"><CardContent className="p-3">
                    <span className="text-[10px] font-mono text-muted-foreground block">HIGHEST</span>
                    <span className="text-red-600 dark:text-red-400 text-sm font-mono">{detail.currency} {maxPrice.toLocaleString()}</span>
                  </CardContent></Card>
                  <Card className="bg-card border-border"><CardContent className="p-3">
                    <span className="text-[10px] font-mono text-muted-foreground block">SHORTLISTED</span>
                    <span className="text-amber-600 dark:text-amber-400 text-sm font-mono">{shortlisted} / {submissions.length}</span>
                  </CardContent></Card>
                </div>

                {/* Comparison Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-[10px] font-mono text-muted-foreground">VENDOR</th>
                      <th className="text-right py-2 px-3 text-[10px] font-mono text-muted-foreground">BID PRICE</th>
                      <th className="text-right py-2 px-3 text-[10px] font-mono text-muted-foreground">TIMELINE</th>
                      <th className="text-center py-2 px-3 text-[10px] font-mono text-muted-foreground">SCORE</th>
                      <th className="text-center py-2 px-3 text-[10px] font-mono text-muted-foreground">STATUS</th>
                      <th className="text-right py-2 px-3 text-[10px] font-mono text-muted-foreground">ACTIONS</th>
                    </tr></thead>
                    <tbody>
                      {submissions
                        .sort((a, b) => Number(a.total_bid_price) - Number(b.total_bid_price))
                        .map((sub, idx) => {
                          const subStatus = SUB_STATUS[sub.status] || SUB_STATUS.submitted
                          return (
                        <tr key={sub.id} className={`border-b border-border/50 hover:bg-card/50 ${idx === 0 ? 'bg-green-500/5' : ''}`}>
                          <td className="py-2 px-3">
                            <div className="text-foreground text-sm">{sub.vendor_name} {idx === 0 && <span className="text-green-600 dark:text-green-400 text-[10px] ml-1">LOWEST</span>}</div>
                            <div className="text-muted-foreground text-xs">{sub.vendor_company}</div>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <span className="text-foreground font-mono">{sub.currency} {Number(sub.total_bid_price).toLocaleString()}</span>
                            {detail.estimated_budget && (
                              <div className={`text-[10px] font-mono ${Number(sub.total_bid_price) <= Number(detail.estimated_budget) ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {((Number(sub.total_bid_price) / Number(detail.estimated_budget) - 1) * 100).toFixed(1)}% vs budget
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right text-muted-foreground font-mono">{sub.timeline_weeks ? `${sub.timeline_weeks}w` : '—'}</td>
                          <td className="py-2 px-3 text-center">
                            {sub.score != null ? <span className="text-amber-600 dark:text-amber-400 font-mono">{sub.score}/100</span> : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <Badge variant="outline" className={subStatus.cls}>{subStatus.label}</Badge>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground"><MoreVertical className="h-3 w-3" /></Button></DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-card border-border">
                                {sub.status !== 'shortlisted' && sub.status !== 'awarded' && (
                                  <DropdownMenuItem className="text-amber-600 dark:text-amber-400 text-xs" onClick={() => updateSubStatusMut.mutate({ brId: detail.id, subId: sub.id, status: 'shortlisted' })}>
                                    <Star className="h-3 w-3 mr-2" /> Shortlist
                                  </DropdownMenuItem>
                                )}
                                {sub.status !== 'rejected' && sub.status !== 'awarded' && (
                                  <DropdownMenuItem className="text-red-600 dark:text-red-400 text-xs" onClick={() => updateSubStatusMut.mutate({ brId: detail.id, subId: sub.id, status: 'rejected' })}>
                                    <XCircle className="h-3 w-3 mr-2" /> Reject
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>

                {/* Expanded Submission Detail Cards */}
                <div className="space-y-3 mt-4">
                  <h3 className="text-xs font-mono text-muted-foreground">DETAILED SUBMISSIONS</h3>
                  {submissions.map(sub => (
                    <Card key={sub.id} className="bg-card border-border">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <span className="text-foreground font-medium text-sm">{sub.vendor_name}</span>
                            <span className="text-muted-foreground text-xs ml-2">({sub.vendor_company})</span>
                          </div>
                          <span className="text-amber-600 dark:text-amber-400 font-mono text-sm">{sub.currency} {Number(sub.total_bid_price).toLocaleString()}</span>
                        </div>
                        {sub.line_items?.length > 0 && (
                          <div className="overflow-x-auto mb-3">
                            <table className="w-full text-xs">
                              <thead><tr className="border-b border-border">
                                <th className="text-left py-1 px-2 text-[10px] font-mono text-muted-foreground">ITEM</th>
                                <th className="text-right py-1 px-2 text-[10px] font-mono text-muted-foreground">QTY</th>
                                <th className="text-left py-1 px-2 text-[10px] font-mono text-muted-foreground">UNIT</th>
                                <th className="text-right py-1 px-2 text-[10px] font-mono text-muted-foreground">RATE</th>
                                <th className="text-right py-1 px-2 text-[10px] font-mono text-muted-foreground">TOTAL</th>
                              </tr></thead>
                              <tbody>
                                {sub.line_items.map((li: any, i: number) => (
                                  <tr key={i} className="border-b border-border/30">
                                    <td className="py-1 px-2 text-muted-foreground">{li.description}</td>
                                    <td className="py-1 px-2 text-muted-foreground text-right">{li.qty}</td>
                                    <td className="py-1 px-2 text-muted-foreground">{li.unit}</td>
                                    <td className="py-1 px-2 text-muted-foreground text-right">{Number(li.unit_rate).toLocaleString()}</td>
                                    <td className="py-1 px-2 text-foreground text-right">{Number(li.total).toLocaleString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                          {sub.materials_specification && (
                            <div><span className="text-muted-foreground font-mono block text-[10px]">MATERIALS</span><span className="text-muted-foreground">{sub.materials_specification}</span></div>
                          )}
                          {sub.notes && (
                            <div><span className="text-muted-foreground font-mono block text-[10px]">NOTES</span><span className="text-muted-foreground">{sub.notes}</span></div>
                          )}
                          {sub.value_engineering_suggestions && (
                            <div><span className="text-muted-foreground font-mono block text-[10px]">VALUE ENGINEERING</span><span className="text-muted-foreground">{sub.value_engineering_suggestions}</span></div>
                          )}
                        </div>
                        {/* Submission Attachments */}
                        {sub.attachments?.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <span className="text-muted-foreground font-mono block text-[10px] mb-2">ATTACHMENTS ({sub.attachments.length})</span>
                            <div className="flex flex-wrap gap-2">
                              {sub.attachments.map((att: any, i: number) => (
                                <a
                                  key={i}
                                  href={att.download_url || '#'}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-muted border border-border hover:border-amber-500/50 transition-colors group ${!att.download_url ? 'pointer-events-none opacity-50' : ''}`}
                                >
                                  <Paperclip className="h-3 w-3 text-muted-foreground group-hover:text-amber-400" />
                                  <span className="text-xs text-muted-foreground group-hover:text-foreground max-w-[160px] truncate">{att.file_name}</span>
                                  <Download className="h-3 w-3 text-muted-foreground group-hover:text-amber-400" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </TabsContent>

          {/* ─── Q&A Tab ─── */}
          <TabsContent value="qa" className="space-y-4">
            {qa.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">No questions yet</div>
            ) : (
              <div className="space-y-3">
                {qa.map(thread => (
                  <Card key={thread.id} className="bg-card border-border">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-2 mb-2">
                        <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded shrink-0 mt-0.5">Q</span>
                        <div className="flex-1">
                          <p className="text-zinc-200 text-sm">{thread.question}</p>
                          <p className="text-muted-foreground text-[10px] font-mono mt-1">{thread.asked_by_name} ({thread.asked_by_email}) · {new Date(thread.asked_at).toLocaleDateString('en-GB')}</p>
                        </div>
                        {!thread.is_public && <Badge variant="outline" className="border-border text-muted-foreground text-[9px]">PRIVATE</Badge>}
                      </div>
                      {thread.answer ? (
                        <div className="flex items-start gap-2 ml-4 pl-4 border-l-2 border-amber-500/30 mt-3">
                          <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded shrink-0 mt-0.5">A</span>
                          <div>
                            <p className="text-zinc-200 text-sm">{thread.answer}</p>
                            <p className="text-muted-foreground text-[10px] font-mono mt-1">{thread.answered_at ? new Date(thread.answered_at).toLocaleDateString('en-GB') : ''}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="ml-6 mt-3">
                          {answeringId === thread.id ? (
                            <div className="flex gap-2">
                              <Input value={answerText} onChange={e => setAnswerText(e.target.value)} placeholder="Type your answer..." className="bg-muted border-border text-foreground text-sm flex-1" />
                              <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-foreground text-xs" onClick={() => answerMut.mutate({ brId: detail.id, threadId: thread.id, answer: answerText })} disabled={answerMut.isPending || !answerText.trim()}>
                                {answerMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Post'}
                              </Button>
                              <Button size="sm" variant="ghost" className="text-muted-foreground text-xs" onClick={() => { setAnsweringId(null); setAnswerText('') }}>Cancel</Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="outline" className="border-border text-muted-foreground text-xs" onClick={() => setAnsweringId(thread.id)}>
                              Answer
                            </Button>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── Attachments Tab ─── */}
          <TabsContent value="attachments" className="space-y-4">
            {detail.status === 'draft' && (
              <div className="flex justify-end">
                <input ref={fileRef} type="file" multiple className="hidden" onChange={e => {
                  if (e.target.files?.length) uploadMut.mutate({ id: detail.id, files: Array.from(e.target.files) })
                }} />
                <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-foreground text-xs" onClick={() => fileRef.current?.click()} disabled={uploadMut.isPending}>
                  {uploadMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
                  Upload Files
                </Button>
              </div>
            )}
            {(detail.attachments?.length || 0) === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">No attachments</div>
            ) : (
              <div className="space-y-2">
                {detail.attachments.map((att: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg">
                    <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-foreground text-sm truncate block">{att.file_name}</span>
                      <span className="text-muted-foreground text-xs">{att.file_size ? `${(att.file_size / 1024).toFixed(0)} KB` : ''}</span>
                    </div>
                    {att.download_url && (
                      <Button size="sm" variant="ghost" className="text-muted-foreground text-xs" onClick={() => window.open(att.download_url, '_blank')}>Download</Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── Activity Tab ─── */}
          <TabsContent value="activity" className="space-y-4">
            {activity.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">No activity recorded</div>
            ) : (
              <div className="space-y-2">
                {activity.map(log => (
                  <div key={log.id} className="flex items-start gap-3 p-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 shrink-0" />
                    <div className="flex-1">
                      <p className="text-muted-foreground text-sm">{log.action.replace(/_/g, ' ')}</p>
                      <p className="text-muted-foreground text-[10px] font-mono">{log.actor_name || 'System'} · {new Date(log.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Invitation Dialog */}
        <Dialog open={showInvDialog} onOpenChange={setShowInvDialog}>
          <DialogContent className="bg-card border-border max-w-md">
            <DialogHeader><DialogTitle className="text-foreground">Invite Vendor</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-[10px] font-mono text-muted-foreground">VENDOR NAME *</Label><Input className="bg-muted border-border text-foreground" value={invForm.vendor_name} onChange={e => setInvForm({ ...invForm, vendor_name: e.target.value })} /></div>
              <div><Label className="text-[10px] font-mono text-muted-foreground">EMAIL *</Label><Input type="email" className="bg-muted border-border text-foreground" value={invForm.vendor_email} onChange={e => setInvForm({ ...invForm, vendor_email: e.target.value })} /></div>
              <div><Label className="text-[10px] font-mono text-muted-foreground">COMPANY</Label><Input className="bg-muted border-border text-foreground" value={invForm.vendor_company} onChange={e => setInvForm({ ...invForm, vendor_company: e.target.value })} /></div>
              <Button className="w-full bg-amber-500 hover:bg-amber-600 text-foreground" disabled={addInvMut.isPending || !invForm.vendor_name || !invForm.vendor_email}
                onClick={() => addInvMut.mutate({ id: detail.id, vendors: [invForm] })}>
                {addInvMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MailPlus className="h-4 w-4 mr-2" />}
                Send Invitation
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Award Dialog */}
        <Dialog open={showAwardDialog} onOpenChange={setShowAwardDialog}>
          <DialogContent className="bg-card border-border max-w-md">
            <DialogHeader><DialogTitle className="text-foreground flex items-center gap-2"><Trophy className="h-4 w-4 text-green-600 dark:text-green-400" /> Award Bid</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] font-mono text-muted-foreground">SELECT WINNING SUBMISSION</Label>
                <Select value={awardSubId} onValueChange={setAwardSubId}>
                  <SelectTrigger className="bg-muted border-border text-foreground"><SelectValue placeholder="Choose vendor..." /></SelectTrigger>
                  <SelectContent className="bg-muted border-border">
                    {submissions.filter(s => s.status === 'shortlisted').map(sub => (
                      <SelectItem key={sub.id} value={sub.id} className="text-foreground">
                        {sub.vendor_name} — {sub.currency} {Number(sub.total_bid_price).toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-[10px] font-mono text-muted-foreground">AWARD NOTES</Label><Textarea className="bg-muted border-border text-foreground" rows={3} value={awardNotes} onChange={e => setAwardNotes(e.target.value)} placeholder="Reason for selection..." /></div>
              <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                <p className="text-amber-600 dark:text-amber-400 text-xs"><AlertTriangle className="h-3 w-3 inline mr-1" />This action is final. The winning vendor will be notified and all other vendors will be informed they were not selected.</p>
              </div>
              <Button className="w-full bg-green-600 hover:bg-green-700 text-foreground" disabled={awardMut.isPending || !awardSubId}
                onClick={() => awardMut.mutate({ brId: detail.id, submission_id: awardSubId, notes: awardNotes })}>
                {awardMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trophy className="h-4 w-4 mr-2" />}
                Confirm Award
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  /* =================== LIST VIEW =================== */
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-foreground">BID MANAGEMENT</h1>
          <p className="text-[10px] font-mono text-muted-foreground">CREATE • PUBLISH • EVALUATE • AWARD</p>
        </div>
        <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-foreground text-xs" onClick={() => openCreate()}>
          <Plus className="h-3 w-3 mr-1" /> New Bid Request
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card border-border"><CardContent className="p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center"><Gavel className="h-4 w-4 text-muted-foreground" /></div>
          <div><span className="text-[10px] font-mono text-muted-foreground block">TOTAL</span><span className="text-foreground text-lg font-mono">{kpi.total}</span></div>
        </CardContent></Card>
        <Card className="bg-card border-border"><CardContent className="p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center"><FileText className="h-4 w-4 text-muted-foreground" /></div>
          <div><span className="text-[10px] font-mono text-muted-foreground block">DRAFTS</span><span className="text-foreground text-lg font-mono">{kpi.draft}</span></div>
        </CardContent></Card>
        <Card className="bg-card border-border"><CardContent className="p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center"><Send className="h-4 w-4 text-blue-600 dark:text-blue-400" /></div>
          <div><span className="text-[10px] font-mono text-muted-foreground block">ACTIVE</span><span className="text-blue-600 dark:text-blue-400 text-lg font-mono">{kpi.active}</span></div>
        </CardContent></Card>
        <Card className="bg-card border-border"><CardContent className="p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center"><Trophy className="h-4 w-4 text-green-600 dark:text-green-400" /></div>
          <div><span className="text-[10px] font-mono text-muted-foreground block">AWARDED</span><span className="text-green-600 dark:text-green-400 text-lg font-mono">{kpi.awarded}</span></div>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search bids..." className="pl-8 bg-card border-border text-foreground text-sm h-9" />
        </div>
        <Select value={projectFilter || 'all'} onValueChange={v => setProjectFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="bg-card border-border text-foreground text-xs w-[160px] h-9"><SelectValue placeholder="All Projects" /></SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all" className="text-muted-foreground">All Projects</SelectItem>
            {projects.map(p => <SelectItem key={p.id} value={p.id} className="text-foreground">{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="bg-card border-border text-foreground text-xs w-[130px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all" className="text-muted-foreground">All Status</SelectItem>
            {Object.entries(STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k} className="text-foreground">{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tradeFilter} onValueChange={setTradeFilter}>
          <SelectTrigger className="bg-card border-border text-foreground text-xs w-[130px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all" className="text-muted-foreground">All Trades</SelectItem>
            {TRADE_CATEGORIES.map(t => <SelectItem key={t} value={t} className="text-foreground capitalize">{t.replace(/_/g, ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loadingList ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 text-amber-500 animate-spin" /></div>
      ) : list.length === 0 ? (
        <div className="text-center py-20">
          <Gavel className="h-10 w-10 text-zinc-700 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No bid requests found</p>
          <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-foreground text-xs mt-3" onClick={() => openCreate()}>Create First Bid</Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border">
              <th className="text-left py-2 px-3 text-[10px] font-mono text-muted-foreground">TITLE</th>
              <th className="text-left py-2 px-3 text-[10px] font-mono text-muted-foreground">PROJECT</th>
              <th className="text-left py-2 px-3 text-[10px] font-mono text-muted-foreground">TRADE</th>
              <th className="text-left py-2 px-3 text-[10px] font-mono text-muted-foreground">STATUS</th>
              <th className="text-right py-2 px-3 text-[10px] font-mono text-muted-foreground">BUDGET</th>
              <th className="text-center py-2 px-3 text-[10px] font-mono text-muted-foreground">VENDORS</th>
              <th className="text-center py-2 px-3 text-[10px] font-mono text-muted-foreground">BIDS</th>
              <th className="text-left py-2 px-3 text-[10px] font-mono text-muted-foreground">DEADLINE</th>
            </tr></thead>
            <tbody>
              {list.map(br => {
                const s = STATUS_MAP[br.status] || STATUS_MAP.draft
                return (
                  <tr key={br.id} className="border-b border-border/50 hover:bg-card/60 cursor-pointer transition" onClick={() => setSelectedId(br.id)}>
                    <td className="py-2.5 px-3">
                      <span className="text-foreground font-medium">{br.title}</span>
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground text-xs">{br.project_name}</td>
                    <td className="py-2.5 px-3 text-muted-foreground text-xs capitalize">{(br.trade_category || '').replace(/_/g, ' ')}</td>
                    <td className="py-2.5 px-3">
                      <Badge variant="outline" className={`${s.cls} text-[10px]`}>{s.label}</Badge>
                    </td>
                    <td className="py-2.5 px-3 text-right text-muted-foreground font-mono text-xs">{br.estimated_budget ? `${br.currency} ${Number(br.estimated_budget).toLocaleString()}` : '—'}</td>
                    <td className="py-2.5 px-3 text-center text-muted-foreground font-mono text-xs">{br.invitation_count || 0}</td>
                    <td className="py-2.5 px-3 text-center text-muted-foreground font-mono text-xs">{br.submission_count || 0}</td>
                    <td className="py-2.5 px-3 text-muted-foreground text-xs font-mono">{new Date(br.submission_deadline).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showCreate} onOpenChange={v => { setShowCreate(v); if (!v) setEditingId(null) }}>
        <DialogContent className="bg-card border-border max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-foreground">{editingId ? 'Edit Bid Request' : 'New Bid Request'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-[10px] font-mono text-muted-foreground">PROJECT *</Label>
              <Select value={form.project_id} onValueChange={v => setForm({ ...form, project_id: v })}>
                <SelectTrigger className="bg-muted border-border text-foreground"><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent className="bg-muted border-border">
                  {projects.map(p => <SelectItem key={p.id} value={p.id} className="text-foreground">{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] font-mono text-muted-foreground">TITLE *</Label>
              <Input className="bg-muted border-border text-foreground" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Electrical Works — Phase 1" />
            </div>
            <div>
              <Label className="text-[10px] font-mono text-muted-foreground">DESCRIPTION / SCOPE</Label>
              <Textarea className="bg-muted border-border text-foreground" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Detailed scope of work..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] font-mono text-muted-foreground">TRADE CATEGORY</Label>
                <Select value={form.trade_category} onValueChange={v => setForm({ ...form, trade_category: v })}>
                  <SelectTrigger className="bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-muted border-border">
                    {TRADE_CATEGORIES.map(t => <SelectItem key={t} value={t} className="text-foreground capitalize">{t.replace(/_/g, ' ')}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] font-mono text-muted-foreground">ESTIMATED BUDGET</Label>
                <div className="flex">
                  <Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v })}>
                    <SelectTrigger className="bg-muted border-border text-foreground w-20 rounded-r-none border-r-0"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-muted border-border">
                      <SelectItem value="GHS" className="text-foreground">GHS</SelectItem>
                      <SelectItem value="USD" className="text-foreground">USD</SelectItem>
                      <SelectItem value="EUR" className="text-foreground">EUR</SelectItem>
                      <SelectItem value="GBP" className="text-foreground">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="number" className="bg-muted border-border text-foreground rounded-l-none flex-1" value={form.estimated_budget} onChange={e => setForm({ ...form, estimated_budget: e.target.value })} placeholder="0.00" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] font-mono text-muted-foreground">SUBMISSION DEADLINE *</Label>
                <Input type="datetime-local" className="bg-muted border-border text-foreground" value={form.submission_deadline} onChange={e => setForm({ ...form, submission_deadline: e.target.value })} />
              </div>
              <div>
                <Label className="text-[10px] font-mono text-muted-foreground">Q&A DEADLINE</Label>
                <Input type="datetime-local" className="bg-muted border-border text-foreground" value={form.qa_deadline} onChange={e => setForm({ ...form, qa_deadline: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="text-[10px] font-mono text-muted-foreground">SITE VISIT DATE</Label>
              <Input type="datetime-local" className="bg-muted border-border text-foreground" value={form.site_visit_date} onChange={e => setForm({ ...form, site_visit_date: e.target.value })} />
            </div>
            <div>
              <Label className="text-[10px] font-mono text-muted-foreground">VENDOR ELIGIBILITY NOTES</Label>
              <Textarea className="bg-muted border-border text-foreground" rows={2} value={form.vendor_eligibility_notes} onChange={e => setForm({ ...form, vendor_eligibility_notes: e.target.value })} placeholder="Minimum qualifications, certifications required..." />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="disclose-budget" checked={form.disclose_budget} onChange={e => setForm({ ...form, disclose_budget: e.target.checked })} className="rounded border-border" />
              <label htmlFor="disclose-budget" className="text-muted-foreground text-xs">Disclose estimated budget to vendors</label>
            </div>
            <Button className="w-full bg-amber-500 hover:bg-amber-600 text-foreground" onClick={handleSubmitForm} disabled={createMut.isPending}>
              {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingId ? 'Update Bid Request' : 'Create Bid Request'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Loading detail overlay */}
      {selectedId && loadingDetail && (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 text-amber-500 animate-spin" /></div>
      )}
    </div>
  )
}
