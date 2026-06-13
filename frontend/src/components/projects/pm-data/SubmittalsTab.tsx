/**
 * SubmittalsTab Component for Client Portal
 * 
 * Displays submittals from Project Managers and allows clients to:
 * 1. View all submittals submitted for review
 * 2. Review and approve/reject submittals
 * 3. Request revisions with comments
 * 
 * Enterprise Architecture: PM creates submittal → Client reviews → Approved/Rejected/Revise
 */

'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  FileCheck2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  FileText,
  Download,
  ChevronDown,
  ChevronUp,
  Loader2,
  Paperclip,
  Filter,
  Send,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  submittalApi,
  type Submittal,
  type SubmittalStatus,
  type SubmittalType,
} from '@/lib/unified-project-api'

// =====================================================
// CONFIGURATION
// =====================================================

const statusConfig: Record<SubmittalStatus, { bg: string; text: string; label: string; icon: React.ElementType }> = {
  draft: { bg: 'bg-zinc-700/50', text: 'text-muted-foreground', label: 'Draft', icon: FileText },
  pending_review: { bg: 'bg-amber-100 dark:bg-amber-900/50', text: 'text-amber-600 dark:text-amber-400', label: 'Pending Review', icon: Clock },
  under_review: { bg: 'bg-blue-100 dark:bg-blue-900/50', text: 'text-blue-600 dark:text-blue-400', label: 'Under Review', icon: FileCheck2 },
  approved: { bg: 'bg-green-100 dark:bg-green-900/50', text: 'text-green-600 dark:text-green-400', label: 'Approved', icon: CheckCircle2 },
  approved_as_noted: { bg: 'bg-teal-100 dark:bg-teal-900/50', text: 'text-teal-600 dark:text-teal-400', label: 'Approved as Noted', icon: CheckCircle2 },
  revise_resubmit: { bg: 'bg-orange-100 dark:bg-orange-900/50', text: 'text-orange-600 dark:text-orange-400', label: 'Revise & Resubmit', icon: RotateCcw },
  rejected: { bg: 'bg-red-100 dark:bg-red-900/50', text: 'text-red-600 dark:text-red-400', label: 'Rejected', icon: XCircle },
  void: { bg: 'bg-muted/50', text: 'text-muted-foreground', label: 'Void', icon: XCircle },
}

const typeConfig: Record<SubmittalType, { label: string; color: string }> = {
  shop_drawing: { label: 'Shop Drawing', color: 'text-blue-600 dark:text-blue-400' },
  product_data: { label: 'Product Data', color: 'text-purple-600 dark:text-purple-400' },
  sample: { label: 'Sample', color: 'text-amber-600 dark:text-amber-400' },
  mock_up: { label: 'Mock-up', color: 'text-orange-600 dark:text-orange-400' },
  design_data: { label: 'Design Data', color: 'text-cyan-600 dark:text-cyan-400' },
  test_report: { label: 'Test Report', color: 'text-green-600 dark:text-green-400' },
  certificate: { label: 'Certificate', color: 'text-emerald-600 dark:text-emerald-400' },
  warranty: { label: 'Warranty', color: 'text-teal-600 dark:text-teal-400' },
  operation_manual: { label: 'O&M Manual', color: 'text-indigo-600 dark:text-indigo-400' },
  other: { label: 'Other', color: 'text-muted-foreground' },
}

// =====================================================
// PROPS
// =====================================================

interface SubmittalsTabProps {
  projectId: string
  organizationId?: string
  onRefresh?: () => void
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function SubmittalsTab({ projectId, organizationId, onRefresh }: SubmittalsTabProps) {
  const [submittals, setSubmittals] = useState<Submittal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSubmittals, setExpandedSubmittals] = useState<Set<string>>(new Set())
  
  // Filter state
  const [statusFilter, setStatusFilter] = useState<SubmittalStatus | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<SubmittalType | 'all'>('all')
  
  // Review dialog state
  const [showReviewDialog, setShowReviewDialog] = useState(false)
  const [reviewSubmittal, setReviewSubmittal] = useState<Submittal | null>(null)
  const [reviewDecision, setReviewDecision] = useState<'approved' | 'approved_as_noted' | 'revise_resubmit' | 'rejected'>('approved')
  const [reviewComments, setReviewComments] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Load submittals
  const loadSubmittals = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const result = await submittalApi.getAll({
        projectId,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        type: typeFilter !== 'all' ? typeFilter : undefined,
      })
      
      setSubmittals(result.data)
    } catch (err: any) {
      console.error('Failed to load submittals:', err)
      setError(err.message || 'Failed to load submittals')
    } finally {
      setIsLoading(false)
    }
  }, [projectId, statusFilter, typeFilter])
  
  useEffect(() => {
    loadSubmittals()
  }, [loadSubmittals])
  
  // Toggle expanded state
  const toggleExpanded = (id: string) => {
    setExpandedSubmittals(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }
  
  // Open review dialog
  const openReviewDialog = (submittal: Submittal) => {
    setReviewSubmittal(submittal)
    setReviewDecision('approved')
    setReviewComments('')
    setShowReviewDialog(true)
  }
  
  // Submit review
  const submitReview = async () => {
    if (!reviewSubmittal) return
    
    try {
      setIsSubmitting(true)
      
      await submittalApi.review(reviewSubmittal.id, reviewDecision, reviewComments || undefined)
      
      // Close dialog and refresh
      setShowReviewDialog(false)
      setReviewSubmittal(null)
      setReviewDecision('approved')
      setReviewComments('')
      
      loadSubmittals()
      onRefresh?.()
    } catch (err: any) {
      console.error('Failed to submit review:', err)
      setError(err.message || 'Failed to submit review')
    } finally {
      setIsSubmitting(false)
    }
  }
  
  // Stats
  const stats = {
    total: submittals.length,
    pending: submittals.filter(s => s.status === 'pending_review').length,
    approved: submittals.filter(s => s.status === 'approved' || s.status === 'approved_as_noted').length,
    overdue: submittals.filter(s => s.is_overdue).length,
  }
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    )
  }
  
  return (
    <div className="space-y-6">
      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Submittals" value={stats.total} />
        <StatCard label="Pending Review" value={stats.pending} color="amber" />
        <StatCard label="Approved" value={stats.approved} color="green" />
        <StatCard label="Overdue" value={stats.overdue} color="red" />
      </div>
      
      {/* Filters */}
      <div className="flex items-center gap-4 pb-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono text-xs text-muted-foreground">Filters:</span>
        </div>
        
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as SubmittalStatus | 'all')}>
          <SelectTrigger className="w-44 h-8 font-mono text-xs bg-card border-border">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(statusConfig).map(([key, config]) => (
              <SelectItem key={key} value={key}>{config.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as SubmittalType | 'all')}>
          <SelectTrigger className="w-44 h-8 font-mono text-xs bg-card border-border">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(typeConfig).map(([key, config]) => (
              <SelectItem key={key} value={key}>{config.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {/* Error Message */}
      {error && (
        <div className="border border-red-800 bg-red-100 dark:bg-red-900/20 p-4 text-center">
          <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400 mx-auto mb-2" />
          <p className="font-mono text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
      
      {/* Submittals List */}
      {submittals.length === 0 ? (
        <div className="text-center py-12 border border-border bg-card/50">
          <FileCheck2 className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
          <h3 className="font-mono text-sm text-foreground mb-2">No Submittals Found</h3>
          <p className="font-mono text-xs text-muted-foreground">
            Submittals from the project manager will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {submittals.map((submittal) => {
            const isExpanded = expandedSubmittals.has(submittal.id)
            const status = statusConfig[submittal.status] || statusConfig.draft
            const rawType = (submittal as any).type || (submittal as any).submittal_type || 'other'
            const type = typeConfig[rawType as SubmittalType] || typeConfig.other
            const StatusIcon = status.icon
            const canReview = submittal.status === 'pending_review' || submittal.status === 'under_review'
            
            return (
              <div 
                key={submittal.id}
                className="border border-border bg-card/50 hover:border-border transition-colors"
              >
                {/* Header */}
                <div 
                  className="flex items-center gap-4 p-4 cursor-pointer"
                  onClick={() => toggleExpanded(submittal.id)}
                >
                  <div className="flex-shrink-0">
                    <StatusIcon className={cn("h-5 w-5", status.text)} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-amber-500">
                        {submittal.submittal_number}
                      </span>
                      <Badge variant="outline" className={cn("font-mono text-[10px] border-0", status.bg, status.text)}>
                        {status.label}
                      </Badge>
                      <span className={cn("font-mono text-[10px]", type.color)}>
                        {type.label}
                      </span>
                      {submittal.revision_number > 1 && (
                        <Badge variant="outline" className="font-mono text-[10px] border-0 bg-zinc-700/50 text-muted-foreground">
                          Rev {submittal.revision_number}
                        </Badge>
                      )}
                      {submittal.is_overdue && (
                        <Badge variant="outline" className="font-mono text-[10px] border-0 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400">
                          Overdue
                        </Badge>
                      )}
                    </div>
                    <h4 className="font-mono text-sm text-foreground line-clamp-1">
                      {submittal.title}
                    </h4>
                    <p className="font-mono text-xs text-muted-foreground mt-1">
                      From: {submittal.submitted_by_name || 'Project Manager'} • 
                      {submittal.spec_section && ` Spec: ${submittal.spec_section} •`}
                      {submittal.due_date && ` Due: ${new Date(submittal.due_date).toLocaleDateString('en-GB')}`}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {canReview && (
                      <Button
                        size="sm"
                        className="h-8 font-mono text-xs bg-amber-600 hover:bg-amber-700 text-foreground"
                        onClick={(e) => {
                          e.stopPropagation()
                          openReviewDialog(submittal)
                        }}
                      >
                        <FileCheck2 className="h-3 w-3 mr-1" />
                        Review
                      </Button>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
                
                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-border p-4 space-y-4">
                    {/* Description */}
                    {submittal.description && (
                      <div>
                        <h5 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                          Description
                        </h5>
                        <p className="font-mono text-sm text-muted-foreground whitespace-pre-wrap">
                          {submittal.description}
                        </p>
                      </div>
                    )}
                    
                    {/* Attachments */}
                    {submittal.attachments && submittal.attachments.length > 0 && (
                      <div>
                        <h5 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                          Attachments
                        </h5>
                        <div className="flex flex-wrap gap-2">
                          {submittal.attachments.map((att) => (
                            <a
                              key={att.id}
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 px-3 py-2 bg-muted/50 border border-border hover:border-amber-500/50 transition-colors"
                            >
                              <Paperclip className="h-3 w-3 text-muted-foreground" />
                              <span className="font-mono text-xs text-muted-foreground">{att.filename}</span>
                              <Download className="h-3 w-3 text-amber-500" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Review Comments (if reviewed) */}
                    {submittal.review_comments && (
                      <div className={cn(
                        "p-4 border",
                        submittal.status === 'approved' || submittal.status === 'approved_as_noted'
                          ? "bg-green-100 dark:bg-green-900/20 border-green-800/50"
                          : submittal.status === 'rejected'
                          ? "bg-red-100 dark:bg-red-900/20 border-red-800/50"
                          : "bg-orange-100 dark:bg-orange-900/20 border-orange-800/50"
                      )}>
                        <h5 className={cn(
                          "font-mono text-[10px] uppercase tracking-wider mb-2",
                          submittal.status === 'approved' || submittal.status === 'approved_as_noted'
                            ? "text-green-600 dark:text-green-400"
                            : submittal.status === 'rejected'
                            ? "text-red-600 dark:text-red-400"
                            : "text-orange-600 dark:text-orange-400"
                        )}>
                          Review Comments from {submittal.reviewer_name || 'Reviewer'}
                        </h5>
                        <p className="font-mono text-sm text-muted-foreground whitespace-pre-wrap">
                          {submittal.review_comments}
                        </p>
                        {submittal.reviewed_at && (
                          <p className="font-mono text-[10px] text-muted-foreground mt-2">
                            Reviewed on {new Date(submittal.reviewed_at).toLocaleDateString('en-GB')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      
      {/* Review Dialog */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="bg-card border-border max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-foreground">
              Review Submittal
            </DialogTitle>
            <DialogDescription className="font-mono text-muted-foreground">
              {reviewSubmittal?.submittal_number}: {reviewSubmittal?.title}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Submittal Info */}
            <div className="bg-muted/50 border border-border p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="font-mono text-[10px] text-muted-foreground">Type</span>
                  <p className="font-mono text-sm text-foreground">
                    {reviewSubmittal?.type && typeConfig[reviewSubmittal.type]?.label}
                  </p>
                </div>
                <div>
                  <span className="font-mono text-[10px] text-muted-foreground">Spec Section</span>
                  <p className="font-mono text-sm text-foreground">
                    {reviewSubmittal?.spec_section || 'N/A'}
                  </p>
                </div>
                <div className="col-span-2">
                  <span className="font-mono text-[10px] text-muted-foreground">Description</span>
                  <p className="font-mono text-sm text-muted-foreground">
                    {reviewSubmittal?.description || 'No description provided'}
                  </p>
                </div>
              </div>
            </div>
            
            {/* Decision */}
            <div>
              <label className="font-mono text-xs text-muted-foreground mb-2 block">
                Decision *
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'approved', label: 'Approved', icon: CheckCircle2, color: 'border-green-500 text-green-600 dark:text-green-400' },
                  { value: 'approved_as_noted', label: 'Approved as Noted', icon: CheckCircle2, color: 'border-teal-500 text-teal-600 dark:text-teal-400' },
                  { value: 'revise_resubmit', label: 'Revise & Resubmit', icon: RotateCcw, color: 'border-orange-500 text-orange-600 dark:text-orange-400' },
                  { value: 'rejected', label: 'Rejected', icon: XCircle, color: 'border-red-500 text-red-600 dark:text-red-400' },
                ].map((option) => {
                  const Icon = option.icon
                  return (
                    <button
                      key={option.value}
                      onClick={() => setReviewDecision(option.value as typeof reviewDecision)}
                      className={cn(
                        "flex items-center gap-2 p-3 border-2 transition-all",
                        reviewDecision === option.value
                          ? option.color
                          : "border-border text-muted-foreground hover:border-zinc-600"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="font-mono text-xs">{option.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            
            {/* Comments */}
            <div>
              <label className="font-mono text-xs text-muted-foreground mb-2 block">
                Review Comments {reviewDecision !== 'approved' ? '*' : '(Optional)'}
              </label>
              <Textarea
                value={reviewComments}
                onChange={(e) => setReviewComments(e.target.value)}
                placeholder={
                  reviewDecision === 'revise_resubmit'
                    ? "Specify what needs to be revised..."
                    : reviewDecision === 'rejected'
                    ? "Explain the reason for rejection..."
                    : "Add any notes or comments..."
                }
                className="bg-muted border-border font-mono text-sm min-h-[100px]"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowReviewDialog(false)}
              disabled={isSubmitting}
              className="font-mono text-xs"
            >
              Cancel
            </Button>
            <Button
              onClick={submitReview}
              disabled={
                isSubmitting || 
                ((reviewDecision === 'revise_resubmit' || reviewDecision === 'rejected') && !reviewComments.trim())
              }
              className={cn(
                "font-mono text-xs",
                reviewDecision === 'approved' || reviewDecision === 'approved_as_noted'
                  ? "bg-green-600 hover:bg-green-700"
                  : reviewDecision === 'rejected'
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-orange-600 hover:bg-orange-700",
                "text-foreground"
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-3 w-3 mr-2" />
                  Submit Review
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// =====================================================
// STAT CARD
// =====================================================

function StatCard({ 
  label, 
  value, 
  color = 'zinc' 
}: { 
  label: string
  value: number
  color?: 'zinc' | 'blue' | 'amber' | 'red' | 'green'
}) {
  const colorClasses = {
    zinc: 'text-foreground',
    blue: 'text-blue-600 dark:text-blue-400',
    amber: 'text-amber-600 dark:text-amber-400',
    red: 'text-red-600 dark:text-red-400',
    green: 'text-green-600 dark:text-green-400',
  }
  
  return (
    <div className="border border-border bg-card/50 p-4">
      <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className={cn("font-mono text-2xl", colorClasses[color])}>
        {value}
      </div>
    </div>
  )
}
