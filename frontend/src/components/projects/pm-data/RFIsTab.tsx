/**
 * RFIsTab Component for Client Portal
 * 
 * Displays RFIs submitted by Project Managers and allows clients to:
 * 1. View all RFIs assigned to them or their project
 * 2. Respond to RFIs with text and document attachments
 * 3. Add comments to ongoing RFI discussions
 * 
 * Enterprise Architecture: PM creates RFI → Client receives → Client responds with documents → PM closes
 */

'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  MessageSquare,
  Clock,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Upload,
  Send,
  X,
  Download,
  ChevronDown,
  ChevronUp,
  Loader2,
  Paperclip,
  Filter,
} from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
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
  rfiApi,
  type Rfi,
  type RfiStatus,
  type RfiPriority,
  type RfiComment,
  type Attachment,
} from '@/lib/unified-project-api'

// =====================================================
// CONFIGURATION
// =====================================================

const statusConfig: Record<RfiStatus, { bg: string; text: string; label: string; icon: React.ElementType }> = {
  draft: { bg: 'bg-zinc-700/50', text: 'text-muted-foreground', label: 'Draft', icon: FileText },
  open: { bg: 'bg-blue-100 dark:bg-blue-900/50', text: 'text-blue-600 dark:text-blue-400', label: 'Open', icon: MessageSquare },
  pending_response: { bg: 'bg-amber-100 dark:bg-amber-900/50', text: 'text-amber-600 dark:text-amber-400', label: 'Awaiting Response', icon: Clock },
  answered: { bg: 'bg-green-100 dark:bg-green-900/50', text: 'text-green-600 dark:text-green-400', label: 'Answered', icon: CheckCircle2 },
  closed: { bg: 'bg-emerald-100 dark:bg-emerald-900/50', text: 'text-emerald-600 dark:text-emerald-400', label: 'Closed', icon: CheckCircle2 },
  void: { bg: 'bg-red-100 dark:bg-red-900/50', text: 'text-red-600 dark:text-red-400', label: 'Void', icon: X },
}

const priorityConfig: Record<RfiPriority, { bg: string; text: string; label: string }> = {
  low: { bg: 'bg-zinc-700/50', text: 'text-muted-foreground', label: 'Low' },
  normal: { bg: 'bg-blue-100 dark:bg-blue-900/50', text: 'text-blue-600 dark:text-blue-400', label: 'Normal' },
  high: { bg: 'bg-amber-100 dark:bg-amber-900/50', text: 'text-amber-600 dark:text-amber-400', label: 'High' },
  critical: { bg: 'bg-red-100 dark:bg-red-900/50', text: 'text-red-600 dark:text-red-400', label: 'Critical' },
}

// =====================================================
// PROPS
// =====================================================

interface RFIsTabProps {
  projectId: string
  organizationId?: string
  onRefresh?: () => void
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function RFIsTab({ projectId, organizationId, onRefresh }: RFIsTabProps) {
  const [rfis, setRfis] = useState<Rfi[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedRfi, setSelectedRfi] = useState<Rfi | null>(null)
  const [expandedRfis, setExpandedRfis] = useState<Set<string>>(new Set())
  
  // Filter state
  const [statusFilter, setStatusFilter] = useState<RfiStatus | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<RfiPriority | 'all'>('all')
  
  // Response dialog state
  const [showResponseDialog, setShowResponseDialog] = useState(false)
  const [responseRfi, setResponseRfi] = useState<Rfi | null>(null)
  const [responseText, setResponseText] = useState('')
  const [responseFiles, setResponseFiles] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Load RFIs
  const loadRfis = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const result = await rfiApi.getAll({
        projectId,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        priority: priorityFilter !== 'all' ? priorityFilter : undefined,
      })
      
      setRfis(result.data)
    } catch (err: any) {
      console.error('Failed to load RFIs:', err)
      setError(err.message || 'Failed to load RFIs')
    } finally {
      setIsLoading(false)
    }
  }, [projectId, statusFilter, priorityFilter])
  
  useEffect(() => {
    loadRfis()
  }, [loadRfis])
  
  // Toggle expanded state
  const toggleExpanded = (rfiId: string) => {
    setExpandedRfis(prev => {
      const next = new Set(prev)
      if (next.has(rfiId)) {
        next.delete(rfiId)
      } else {
        next.add(rfiId)
      }
      return next
    })
  }
  
  // Open response dialog
  const openResponseDialog = (rfi: Rfi) => {
    setResponseRfi(rfi)
    setResponseText('')
    setResponseFiles([])
    setShowResponseDialog(true)
  }
  
  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setResponseFiles(prev => [...prev, ...files])
  }
  
  // Remove file from selection
  const removeFile = (index: number) => {
    setResponseFiles(prev => prev.filter((_, i) => i !== index))
  }
  
  // Submit response
  const submitResponse = async () => {
    if (!responseRfi || !responseText.trim()) return
    
    try {
      setIsSubmitting(true)
      
      // First, upload any attachments
      const attachmentIds: string[] = []
      for (const file of responseFiles) {
        try {
          const attachment = await rfiApi.uploadResponseDocument(responseRfi.id, file)
          attachmentIds.push(attachment.id)
        } catch (err) {
          console.error('Failed to upload file:', file.name, err)
          // Continue with other files
        }
      }
      
      // Submit the response
      await rfiApi.respond(responseRfi.id, responseText, attachmentIds)
      
      // Close dialog and refresh
      setShowResponseDialog(false)
      setResponseRfi(null)
      setResponseText('')
      setResponseFiles([])
      
      loadRfis()
      onRefresh?.()
    } catch (err: any) {
      console.error('Failed to submit response:', err)
      setError(err.message || 'Failed to submit response')
    } finally {
      setIsSubmitting(false)
    }
  }
  
  // Stats
  const stats = {
    total: rfis.length,
    open: rfis.filter(r => r.status === 'open').length,
    pending: rfis.filter(r => r.status === 'pending_response').length,
    overdue: rfis.filter(r => r.is_overdue).length,
    actionRequired: rfis.filter(r => r.status === 'open' || r.status === 'pending_response').length,
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
      {/* Notification Banner for Open RFIs */}
      {stats.actionRequired > 0 && (
        <div className="flex items-center gap-3 p-4 bg-amber-100 dark:bg-amber-900/20 border border-amber-700/50 rounded-lg">
          <div className="flex-shrink-0 h-10 w-10 bg-amber-600 rounded-full flex items-center justify-center">
            <MessageSquare className="h-5 w-5 text-foreground" />
          </div>
          <div className="flex-1">
            <h4 className="font-mono text-sm text-amber-600 dark:text-amber-400 font-medium">
              {stats.actionRequired} RFI{stats.actionRequired > 1 ? 's' : ''} Require Your Response
            </h4>
            <p className="font-mono text-xs text-muted-foreground mt-0.5">
              The project manager is waiting for your input on these requests
            </p>
          </div>
          <Button
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-foreground font-mono text-xs"
            onClick={() => setStatusFilter('open')}
          >
            View Open RFIs
          </Button>
        </div>
      )}
      
      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total RFIs" value={stats.total} />
        <StatCard label="Open" value={stats.open} color="blue" />
        <StatCard label="Awaiting Response" value={stats.pending} color="amber" />
        <StatCard label="Overdue" value={stats.overdue} color="red" />
      </div>
      
      {/* Filters */}
      <div className="flex items-center gap-4 pb-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono text-xs text-muted-foreground">Filters:</span>
        </div>
        
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as RfiStatus | 'all')}>
          <SelectTrigger className="w-40 h-8 font-mono text-xs bg-card border-border">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(statusConfig).map(([key, config]) => (
              <SelectItem key={key} value={key}>{config.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as RfiPriority | 'all')}>
          <SelectTrigger className="w-40 h-8 font-mono text-xs bg-card border-border">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            {Object.entries(priorityConfig).map(([key, config]) => (
              <SelectItem key={key} value={key}>{config.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {/* RFI List */}
      {error && (
        <div className="border border-red-800 bg-red-100 dark:bg-red-900/20 p-4 text-center">
          <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400 mx-auto mb-2" />
          <p className="font-mono text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
      
      {rfis.length === 0 ? (
        <div className="text-center py-12 border border-border bg-card/50">
          <MessageSquare className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
          <h3 className="font-mono text-sm text-foreground mb-2">No RFIs Found</h3>
          <p className="font-mono text-xs text-muted-foreground">
            RFIs from the project manager will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rfis.map((rfi) => {
            const isExpanded = expandedRfis.has(rfi.id)
            const status = statusConfig[rfi.status]
            const priority = priorityConfig[rfi.priority]
            const StatusIcon = status.icon
            
            return (
              <div 
                key={rfi.id}
                className="border border-border bg-card/50 hover:border-border transition-colors"
              >
                {/* RFI Header */}
                <div 
                  className="flex items-center gap-4 p-4 cursor-pointer"
                  onClick={() => toggleExpanded(rfi.id)}
                >
                  <div className="flex-shrink-0">
                    <StatusIcon className={cn("h-5 w-5", status.text)} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-amber-500">
                        {rfi.rfi_number}
                      </span>
                      <Badge variant="outline" className={cn("font-mono text-[10px] border-0", status.bg, status.text)}>
                        {status.label}
                      </Badge>
                      <Badge variant="outline" className={cn("font-mono text-[10px] border-0", priority.bg, priority.text)}>
                        {priority.label}
                      </Badge>
                      {rfi.is_overdue && (
                        <Badge variant="outline" className="font-mono text-[10px] border-0 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400">
                          {rfi.days_overdue} days overdue
                        </Badge>
                      )}
                    </div>
                    <h4 className="font-mono text-sm text-foreground line-clamp-1">
                      {rfi.subject}
                    </h4>
                    <p className="font-mono text-xs text-muted-foreground mt-1">
                      From: {rfi.submitted_by_name || 'Project Manager'} • 
                      {rfi.due_date && ` Due: ${new Date(rfi.due_date).toLocaleDateString('en-GB')}`}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {rfi.status === 'draft' && (
                      <Badge variant="outline" className="font-mono text-[10px] border-0 bg-zinc-700/50 text-muted-foreground">
                        Pending Submission
                      </Badge>
                    )}
                    {(rfi.status === 'open' || rfi.status === 'pending_response') && (
                      <Button
                        size="sm"
                        className="h-8 font-mono text-xs bg-amber-600 hover:bg-amber-700 text-foreground"
                        onClick={(e) => {
                          e.stopPropagation()
                          openResponseDialog(rfi)
                        }}
                      >
                        <Send className="h-3 w-3 mr-1" />
                        Respond
                      </Button>
                    )}
                    {rfi.status === 'answered' && (
                      <Badge variant="outline" className="font-mono text-[10px] border-0 bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400">
                        Response Submitted
                      </Badge>
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
                    {/* Question */}
                    <div>
                      <h5 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                        Question
                      </h5>
                      <p className="font-mono text-sm text-muted-foreground whitespace-pre-wrap">
                        {rfi.question}
                      </p>
                    </div>
                    
                    {/* Attachments */}
                    {rfi.attachments && rfi.attachments.length > 0 && (
                      <div>
                        <h5 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                          Attachments
                        </h5>
                        <div className="flex flex-wrap gap-2">
                          {rfi.attachments.map((att) => (
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
                    
                    {/* Response (if answered) */}
                    {rfi.response && (
                      <div className="bg-green-100 dark:bg-green-900/20 border border-green-800/50 p-4">
                        <h5 className="font-mono text-[10px] text-green-600 dark:text-green-400 uppercase tracking-wider mb-2">
                          Response from {rfi.answered_by_name || 'Client'}
                        </h5>
                        <p className="font-mono text-sm text-muted-foreground whitespace-pre-wrap">
                          {rfi.response}
                        </p>
                        
                        {rfi.response_attachments && rfi.response_attachments.length > 0 && (
                          <div className="mt-3">
                            <h6 className="font-mono text-[10px] text-muted-foreground mb-2">Response Documents</h6>
                            <div className="flex flex-wrap gap-2">
                              {rfi.response_attachments.map((att) => (
                                <a
                                  key={att.id}
                                  href={att.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 px-3 py-2 bg-muted/50 border border-border hover:border-green-500/50 transition-colors"
                                >
                                  <FileText className="h-3 w-3 text-green-500" />
                                  <span className="font-mono text-xs text-muted-foreground">{att.filename}</span>
                                  <Download className="h-3 w-3 text-green-500" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Impact Summary */}
                    <div className="flex items-center gap-6 pt-2 border-t border-border">
                      {rfi.cost_impact !== undefined && rfi.cost_impact !== 0 && (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-muted-foreground">Cost Impact:</span>
                          <span className={cn(
                            "font-mono text-xs",
                            rfi.cost_impact > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                          )}>
                            {rfi.cost_impact > 0 ? '+' : ''}{formatCurrency(rfi.cost_impact, rfi.cost_impact_currency || 'GHS')}
                          </span>
                        </div>
                      )}
                      {rfi.schedule_impact_days !== undefined && rfi.schedule_impact_days !== 0 && (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-muted-foreground">Schedule Impact:</span>
                          <span className={cn(
                            "font-mono text-xs",
                            rfi.schedule_impact_days > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                          )}>
                            {rfi.schedule_impact_days > 0 ? '+' : ''}{rfi.schedule_impact_days} days
                          </span>
                        </div>
                      )}
                      {rfi.comment_count !== undefined && rfi.comment_count > 0 && (
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-3 w-3 text-muted-foreground" />
                          <span className="font-mono text-xs text-muted-foreground">{rfi.comment_count} comments</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      
      {/* Response Dialog */}
      <Dialog open={showResponseDialog} onOpenChange={setShowResponseDialog}>
        <DialogContent className="bg-card border-border max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-foreground">
              Respond to RFI
            </DialogTitle>
            <DialogDescription className="font-mono text-muted-foreground">
              {responseRfi?.rfi_number}: {responseRfi?.subject}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Original Question */}
            <div className="bg-muted/50 border border-border p-4">
              <h5 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                Original Question
              </h5>
              <p className="font-mono text-sm text-muted-foreground whitespace-pre-wrap">
                {responseRfi?.question}
              </p>
            </div>
            
            {/* Response Text */}
            <div>
              <label className="font-mono text-xs text-muted-foreground mb-2 block">
                Your Response *
              </label>
              <Textarea
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                placeholder="Enter your response to this RFI..."
                className="bg-muted border-border font-mono text-sm min-h-[150px] text-foreground placeholder:text-muted-foreground"
              />
            </div>
            
            {/* File Upload */}
            <div>
              <label className="font-mono text-xs text-muted-foreground mb-2 block">
                Attach Documents (Optional)
              </label>
              <div className="border-2 border-dashed border-border p-4 text-center hover:border-amber-500/50 transition-colors">
                <input
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                  id="response-file-upload"
                />
                <label htmlFor="response-file-upload" className="cursor-pointer">
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="font-mono text-xs text-muted-foreground">
                    Click to upload or drag and drop
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground mt-1">
                    PDF, DWG, XLSX, DOCX up to 50MB each
                  </p>
                </label>
              </div>
              
              {/* Selected Files */}
              {responseFiles.length > 0 && (
                <div className="mt-3 space-y-2">
                  {responseFiles.map((file, index) => (
                    <div 
                      key={index}
                      className="flex items-center justify-between px-3 py-2 bg-muted/50 border border-border"
                    >
                      <div className="flex items-center gap-2">
                        <Paperclip className="h-3 w-3 text-muted-foreground" />
                        <span className="font-mono text-xs text-muted-foreground">{file.name}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          ({(file.size / 1024 / 1024).toFixed(2)} MB)
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowResponseDialog(false)}
              disabled={isSubmitting}
              className="font-mono text-xs"
            >
              Cancel
            </Button>
            <Button
              onClick={submitResponse}
              disabled={!responseText.trim() || isSubmitting}
              className="font-mono text-xs bg-amber-600 hover:bg-amber-700 text-foreground"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-3 w-3 mr-2" />
                  Submit Response
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
