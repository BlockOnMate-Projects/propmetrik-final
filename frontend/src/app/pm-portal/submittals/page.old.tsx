'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { 
  FileCheck2, Plus, Search, Filter, Clock, CheckCircle2, XCircle, 
  AlertCircle, FileText, ChevronRight, Calendar, Building2, User,
  Eye, Download, MessageSquare, RotateCcw, Stamp, Package
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import ProjectSubnav from '@/components/pm-portal/ProjectSubnav'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

// Types
type SubmittalStatus = 
  | 'draft' 
  | 'pending_review' 
  | 'under_review' 
  | 'approved' 
  | 'approved_as_noted' 
  | 'revise_resubmit' 
  | 'rejected' 
  | 'for_record_only' 
  | 'void';

type SubmittalType = 
  | 'shop_drawing' 
  | 'product_data' 
  | 'sample' 
  | 'mock_up' 
  | 'design_data' 
  | 'test_report' 
  | 'certificate' 
  | 'manufacturer_instruction' 
  | 'operation_manual' 
  | 'warranty' 
  | 'other';

interface Submittal {
  id: string;
  project_id: string;
  project_name: string;
  submittal_number: string;
  revision_number: number;
  title: string;
  description?: string;
  submittal_type: SubmittalType;
  spec_section?: string;
  spec_section_title?: string;
  status: SubmittalStatus;
  priority: string;
  submitted_date?: string;
  required_date?: string;
  returned_date?: string;
  submitted_by_name?: string;
  reviewer_name?: string;
  contractor_company?: string;
  manufacturer?: string;
  product_name?: string;
  days_overdue?: number;
  days_in_review?: number;
  attachments: any[];
  created_at: string;
}

interface SubmittalStats {
  total_submittals: number;
  draft_count: number;
  pending_count: number;
  approved_count: number;
  revise_count: number;
  rejected_count: number;
  overdue_count: number;
  due_this_week: number;
  approval_rate: number;
  avg_review_days: number | null;
}

// Status config
const statusConfig: Record<SubmittalStatus, { label: string; color: string; icon: any }> = {
  draft: { label: 'Draft', color: 'bg-zinc-500', icon: FileText },
  pending_review: { label: 'Pending Review', color: 'bg-yellow-500', icon: Clock },
  under_review: { label: 'Under Review', color: 'bg-blue-500', icon: Eye },
  approved: { label: 'Approved', color: 'bg-green-500', icon: CheckCircle2 },
  approved_as_noted: { label: 'Approved as Noted', color: 'bg-emerald-500', icon: CheckCircle2 },
  revise_resubmit: { label: 'Revise & Resubmit', color: 'bg-orange-500', icon: RotateCcw },
  rejected: { label: 'Rejected', color: 'bg-red-500', icon: XCircle },
  for_record_only: { label: 'For Record Only', color: 'bg-purple-500', icon: FileCheck2 },
  void: { label: 'Void', color: 'bg-zinc-700', icon: XCircle },
};

const typeLabels: Record<SubmittalType, string> = {
  shop_drawing: 'Shop Drawing',
  product_data: 'Product Data',
  sample: 'Sample',
  mock_up: 'Mock-Up',
  design_data: 'Design Data',
  test_report: 'Test Report',
  certificate: 'Certificate',
  manufacturer_instruction: 'Manufacturer Instructions',
  operation_manual: 'O&M Manual',
  warranty: 'Warranty',
  other: 'Other',
};

export default function SubmittalsPage() {
  const [submittals, setSubmittals] = useState<Submittal[]>([])
  const [stats, setStats] = useState<SubmittalStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [selectedSubmittal, setSelectedSubmittal] = useState<Submittal | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  
  const params = useParams();
  const projectId = (params as { id?: string }).id;

  useEffect(() => {
    fetchSubmittals()
    fetchStats()
  }, [activeTab, typeFilter, projectId])

  const fetchSubmittals = async () => {
    try {
      if (!projectId) {
        setSubmittals([])
        return
      }
      let statusFilter = ''
      if (activeTab === 'pending') statusFilter = '&status=pending_review&status=under_review'
      else if (activeTab === 'approved') statusFilter = '&status=approved&status=approved_as_noted'
      else if (activeTab === 'action') statusFilter = '&status=revise_resubmit'
      else if (activeTab === 'draft') statusFilter = '&status=draft'
      
      const typeParam = typeFilter !== 'all' ? `&submittal_type=${typeFilter}` : ''
      
      const response = await fetch(
        `${API_BASE}/api/submittals?project_id=${projectId}${statusFilter}${typeParam}&limit=50`
      )
      
      if (response.ok) {
        const data = await response.json()
        setSubmittals(data.submittals || [])
      }
    } catch (error) {
      console.error('Error fetching submittals:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      if (!projectId) {
        setStats(null)
        return
      }
      const response = await fetch(`${API_BASE}/api/submittals/stats/${projectId}`)
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  const filteredSubmittals = submittals.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.submittal_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.spec_section?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.manufacturer?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const formatDate = (date?: string) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Submittals</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Track shop drawings, product data, and material approvals
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="bg-amber-500 hover:bg-amber-600 text-black">
              <Plus className="h-4 w-4 mr-2" />
              New Submittal
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Submittal</DialogTitle>
            </DialogHeader>
            <CreateSubmittalForm 
              projectId={projectId} 
              onSuccess={() => {
                setShowCreateDialog(false)
                fetchSubmittals()
                fetchStats()
              }} 
            />
          </DialogContent>
        </Dialog>
      </div>

      {projectId && <ProjectSubnav projectId={projectId} />}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard 
          label="Total" 
          value={stats?.total_submittals || 0} 
          icon={FileCheck2}
          color="text-zinc-400"
        />
        <StatCard 
          label="Pending" 
          value={stats?.pending_count || 0} 
          icon={Clock}
          color="text-yellow-500"
        />
        <StatCard 
          label="Approved" 
          value={stats?.approved_count || 0} 
          icon={CheckCircle2}
          color="text-green-500"
        />
        <StatCard 
          label="Revise" 
          value={stats?.revise_count || 0} 
          icon={RotateCcw}
          color="text-orange-500"
        />
        <StatCard 
          label="Overdue" 
          value={stats?.overdue_count || 0} 
          icon={AlertCircle}
          color="text-red-500"
        />
        <StatCard 
          label="Approval Rate" 
          value={`${stats?.approval_rate || 0}%`} 
          icon={Stamp}
          color="text-emerald-500"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search by number, title, spec section, manufacturer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-48 bg-zinc-900 border-zinc-800 text-white">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800">
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(typeLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="all" className="data-[state=active]:bg-zinc-800">
            All
          </TabsTrigger>
          <TabsTrigger value="pending" className="data-[state=active]:bg-zinc-800">
            Pending
          </TabsTrigger>
          <TabsTrigger value="approved" className="data-[state=active]:bg-zinc-800">
            Approved
          </TabsTrigger>
          <TabsTrigger value="action" className="data-[state=active]:bg-zinc-800">
            Needs Action
          </TabsTrigger>
          <TabsTrigger value="draft" className="data-[state=active]:bg-zinc-800">
            Drafts
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Submittals List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12 text-zinc-500">Loading submittals...</div>
        ) : filteredSubmittals.length === 0 ? (
          <div className="text-center py-12">
            <FileCheck2 className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400">No submittals found</p>
            <p className="text-zinc-500 text-sm mt-1">Create your first submittal to get started</p>
          </div>
        ) : (
          filteredSubmittals.map((submittal) => (
            <SubmittalCard 
              key={submittal.id} 
              submittal={submittal}
              onClick={() => setSelectedSubmittal(submittal)}
            />
          ))
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedSubmittal} onOpenChange={() => setSelectedSubmittal(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedSubmittal && (
            <SubmittalDetail 
              submittal={selectedSubmittal}
              onUpdate={() => {
                fetchSubmittals()
                fetchStats()
              }}
              onClose={() => setSelectedSubmittal(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Stat Card Component
function StatCard({ label, value, icon: Icon, color }: { 
  label: string; 
  value: number | string; 
  icon: any;
  color: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  )
}

// Submittal Card Component
function SubmittalCard({ submittal, onClick }: { submittal: Submittal; onClick: () => void }) {
  const config = statusConfig[submittal.status]
  const StatusIcon = config.icon

  return (
    <div 
      onClick={onClick}
      className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors cursor-pointer"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-amber-500 font-mono text-sm">{submittal.submittal_number}</span>
            {submittal.revision_number > 0 && (
              <Badge variant="outline" className="text-xs border-zinc-700">
                Rev {submittal.revision_number}
              </Badge>
            )}
            <Badge className={`${config.color} text-white text-xs`}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {config.label}
            </Badge>
          </div>
          <h3 className="font-medium text-white truncate">{submittal.title}</h3>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {typeLabels[submittal.submittal_type]}
            </span>
            {submittal.spec_section && (
              <span className="flex items-center gap-1">
                <Package className="h-3 w-3" />
                {submittal.spec_section}
              </span>
            )}
            {submittal.manufacturer && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {submittal.manufacturer}
              </span>
            )}
            {submittal.required_date && (
              <span className={`flex items-center gap-1 ${submittal.days_overdue && submittal.days_overdue > 0 ? 'text-red-500' : ''}`}>
                <Calendar className="h-3 w-3" />
                Due: {new Date(submittal.required_date).toLocaleDateString()}
                {submittal.days_overdue && submittal.days_overdue > 0 && (
                  <span className="text-red-500 ml-1">({submittal.days_overdue}d overdue)</span>
                )}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-zinc-600 flex-shrink-0" />
      </div>
    </div>
  )
}

// Create Submittal Form
function CreateSubmittalForm({ projectId, onSuccess }: { projectId?: string; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    submittal_type: 'product_data' as SubmittalType,
    spec_section: '',
    spec_section_title: '',
    priority: 'normal',
    required_date: '',
    manufacturer: '',
    product_name: '',
    model_number: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId) {
      alert('Select a project to create a submittal.')
      return
    }
    setLoading(true)
    
    try {
      const response = await fetch(`${API_BASE}/api/submittals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          project_id: projectId
        })
      })
      
      if (response.ok) {
        onSuccess()
      } else {
        const error = await response.json()
        alert(error.details || 'Failed to create submittal')
      }
    } catch (error) {
      console.error('Error creating submittal:', error)
      alert('Failed to create submittal')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label className="text-zinc-400">Title *</Label>
          <Input
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Submittal title"
            required
            className="mt-1 bg-zinc-800 border-zinc-700"
          />
        </div>
        
        <div>
          <Label className="text-zinc-400">Type *</Label>
          <Select 
            value={formData.submittal_type} 
            onValueChange={(v) => setFormData({ ...formData, submittal_type: v as SubmittalType })}
          >
            <SelectTrigger className="mt-1 bg-zinc-800 border-zinc-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              {Object.entries(typeLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <Label className="text-zinc-400">Priority</Label>
          <Select 
            value={formData.priority} 
            onValueChange={(v) => setFormData({ ...formData, priority: v })}
          >
            <SelectTrigger className="mt-1 bg-zinc-800 border-zinc-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <Label className="text-zinc-400">Spec Section</Label>
          <Input
            value={formData.spec_section}
            onChange={(e) => setFormData({ ...formData, spec_section: e.target.value })}
            placeholder="e.g., 03 30 00"
            className="mt-1 bg-zinc-800 border-zinc-700"
          />
        </div>
        
        <div>
          <Label className="text-zinc-400">Required Date</Label>
          <Input
            type="date"
            value={formData.required_date}
            onChange={(e) => setFormData({ ...formData, required_date: e.target.value })}
            className="mt-1 bg-zinc-800 border-zinc-700"
          />
        </div>
        
        <div>
          <Label className="text-zinc-400">Manufacturer</Label>
          <Input
            value={formData.manufacturer}
            onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
            placeholder="Manufacturer name"
            className="mt-1 bg-zinc-800 border-zinc-700"
          />
        </div>
        
        <div>
          <Label className="text-zinc-400">Product Name</Label>
          <Input
            value={formData.product_name}
            onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
            placeholder="Product name"
            className="mt-1 bg-zinc-800 border-zinc-700"
          />
        </div>
        
        <div className="col-span-2">
          <Label className="text-zinc-400">Description</Label>
          <Textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Detailed description..."
            rows={3}
            className="mt-1 bg-zinc-800 border-zinc-700"
          />
        </div>
      </div>
      
      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={loading} className="bg-amber-500 hover:bg-amber-600 text-black">
          {loading ? 'Creating...' : 'Create Submittal'}
        </Button>
      </div>
    </form>
  )
}

// Submittal Detail Component
function SubmittalDetail({ 
  submittal, 
  onUpdate,
  onClose 
}: { 
  submittal: Submittal; 
  onUpdate: () => void;
  onClose: () => void;
}) {
  const [reviewStatus, setReviewStatus] = useState<SubmittalStatus>('approved')
  const [reviewComments, setReviewComments] = useState('')
  const [submitting, setSubmitting] = useState(false)
  
  const config = statusConfig[submittal.status]
  const StatusIcon = config.icon

  const handleSubmitForReview = async () => {
    setSubmitting(true)
    try {
      const response = await fetch(`${API_BASE}/api/submittals/${submittal.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      
      if (response.ok) {
        onUpdate()
        onClose()
      }
    } catch (error) {
      console.error('Error submitting:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleReview = async () => {
    setSubmitting(true)
    try {
      const response = await fetch(`${API_BASE}/api/submittals/${submittal.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: reviewStatus,
          comments: reviewComments
        })
      })
      
      if (response.ok) {
        onUpdate()
        onClose()
      }
    } catch (error) {
      console.error('Error reviewing:', error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <span className="text-amber-500 font-mono">{submittal.submittal_number}</span>
          {submittal.revision_number > 0 && (
            <Badge variant="outline" className="border-zinc-700">Rev {submittal.revision_number}</Badge>
          )}
          <Badge className={`${config.color} text-white`}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {config.label}
          </Badge>
        </div>
        <DialogTitle className="text-xl">{submittal.title}</DialogTitle>
      </DialogHeader>

      <div className="mt-6 space-y-6">
        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-zinc-500">Type</span>
            <p className="text-white">{typeLabels[submittal.submittal_type]}</p>
          </div>
          <div>
            <span className="text-zinc-500">Spec Section</span>
            <p className="text-white">{submittal.spec_section || '-'}</p>
          </div>
          <div>
            <span className="text-zinc-500">Manufacturer</span>
            <p className="text-white">{submittal.manufacturer || '-'}</p>
          </div>
          <div>
            <span className="text-zinc-500">Product</span>
            <p className="text-white">{submittal.product_name || '-'}</p>
          </div>
          <div>
            <span className="text-zinc-500">Required Date</span>
            <p className="text-white">{submittal.required_date ? new Date(submittal.required_date).toLocaleDateString() : '-'}</p>
          </div>
          <div>
            <span className="text-zinc-500">Submitted Date</span>
            <p className="text-white">{submittal.submitted_date ? new Date(submittal.submitted_date).toLocaleDateString() : '-'}</p>
          </div>
        </div>

        {submittal.description && (
          <div>
            <span className="text-zinc-500 text-sm">Description</span>
            <p className="text-white mt-1">{submittal.description}</p>
          </div>
        )}

        {/* Action Buttons Based on Status */}
        <div className="border-t border-zinc-800 pt-4">
          {submittal.status === 'draft' && (
            <Button 
              onClick={handleSubmitForReview}
              disabled={submitting}
              className="bg-amber-500 hover:bg-amber-600 text-black"
            >
              Submit for Review
            </Button>
          )}

          {submittal.status === 'revise_resubmit' && (
            <Button 
              onClick={handleSubmitForReview}
              disabled={submitting}
              className="bg-amber-500 hover:bg-amber-600 text-black"
            >
              Resubmit
            </Button>
          )}

          {['pending_review', 'under_review'].includes(submittal.status) && (
            <div className="space-y-4">
              <h4 className="font-medium text-white">Review Submittal</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-zinc-400">Decision</Label>
                  <Select value={reviewStatus} onValueChange={(v) => setReviewStatus(v as SubmittalStatus)}>
                    <SelectTrigger className="mt-1 bg-zinc-800 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="approved_as_noted">Approved as Noted</SelectItem>
                      <SelectItem value="revise_resubmit">Revise & Resubmit</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="for_record_only">For Record Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-zinc-400">Comments</Label>
                <Textarea
                  value={reviewComments}
                  onChange={(e) => setReviewComments(e.target.value)}
                  placeholder="Review comments..."
                  rows={3}
                  className="mt-1 bg-zinc-800 border-zinc-700"
                />
              </div>
              <Button 
                onClick={handleReview}
                disabled={submitting}
                className="bg-amber-500 hover:bg-amber-600 text-black"
              >
                Submit Review
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
