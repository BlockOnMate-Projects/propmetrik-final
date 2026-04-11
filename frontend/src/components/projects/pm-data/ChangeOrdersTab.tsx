/**
 * ChangeOrdersTab Component for Client Portal
 * 
 * Displays change orders from Project Managers and allows clients to:
 * 1. View all change orders submitted for approval
 * 2. Approve or reject change orders
 * 3. See cost and schedule impacts
 * 
 * Enterprise Architecture: PM creates CO → Client reviews → Approved/Rejected → PM executes
 */

'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  FileEdit,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  DollarSign,
  Calendar,
  ChevronDown,
  ChevronUp,
  Loader2,
  Paperclip,
  Filter,
  Download,
  PlayCircle,
} from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
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
  changeOrderApi,
  type ChangeOrder,
  type ChangeOrderStatus,
  type ChangeOrderType,
} from '@/lib/unified-project-api'

// =====================================================
// CONFIGURATION
// =====================================================

const statusConfig: Record<ChangeOrderStatus, { bg: string; text: string; label: string; icon: React.ElementType }> = {
  draft: { bg: 'bg-zinc-700/50', text: 'text-zinc-400', label: 'Draft', icon: FileEdit },
  pending_approval: { bg: 'bg-amber-900/50', text: 'text-amber-400', label: 'Pending Approval', icon: Clock },
  approved: { bg: 'bg-green-900/50', text: 'text-green-400', label: 'Approved', icon: CheckCircle2 },
  rejected: { bg: 'bg-red-900/50', text: 'text-red-400', label: 'Rejected', icon: XCircle },
  executed: { bg: 'bg-emerald-900/50', text: 'text-emerald-400', label: 'Executed', icon: PlayCircle },
  void: { bg: 'bg-zinc-800/50', text: 'text-zinc-500', label: 'Void', icon: XCircle },
}

const typeConfig: Record<ChangeOrderType, { label: string; color: string }> = {
  addition: { label: 'Addition', color: 'text-green-400' },
  deduction: { label: 'Deduction', color: 'text-blue-400' },
  substitution: { label: 'Substitution', color: 'text-purple-400' },
  scope_change: { label: 'Scope Change', color: 'text-orange-400' },
  time_extension: { label: 'Time Extension', color: 'text-cyan-400' },
  other: { label: 'Other', color: 'text-zinc-400' },
}

// =====================================================
// PROPS
// =====================================================

interface ChangeOrdersTabProps {
  projectId: string
  organizationId?: string
  currency?: string
  onRefresh?: () => void
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function ChangeOrdersTab({ projectId, organizationId, currency = 'GHS', onRefresh }: ChangeOrdersTabProps) {
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set())
  
  // Filter state
  const [statusFilter, setStatusFilter] = useState<ChangeOrderStatus | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<ChangeOrderType | 'all'>('all')
  
  // Approval dialog state
  const [showApprovalDialog, setShowApprovalDialog] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<ChangeOrder | null>(null)
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject'>('approve')
  const [approvalComments, setApprovalComments] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Load change orders
  const loadChangeOrders = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const result = await changeOrderApi.getAll({
        projectId,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        type: typeFilter !== 'all' ? typeFilter : undefined,
      })
      
      setChangeOrders(result.data)
    } catch (err: any) {
      console.error('Failed to load change orders:', err)
      setError(err.message || 'Failed to load change orders')
    } finally {
      setIsLoading(false)
    }
  }, [projectId, statusFilter, typeFilter])
  
  useEffect(() => {
    loadChangeOrders()
  }, [loadChangeOrders])
  
  // Toggle expanded state
  const toggleExpanded = (id: string) => {
    setExpandedOrders(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }
  
  // Open approval dialog
  const openApprovalDialog = (order: ChangeOrder, action: 'approve' | 'reject') => {
    setSelectedOrder(order)
    setApprovalAction(action)
    setApprovalComments('')
    setShowApprovalDialog(true)
  }
  
  // Submit approval/rejection
  const submitApproval = async () => {
    if (!selectedOrder) return
    
    try {
      setIsSubmitting(true)
      
      if (approvalAction === 'approve') {
        await changeOrderApi.approve(selectedOrder.id, approvalComments || undefined)
      } else {
        if (!approvalComments.trim()) {
          setError('Rejection reason is required')
          return
        }
        await changeOrderApi.reject(selectedOrder.id, approvalComments)
      }
      
      // Close dialog and refresh
      setShowApprovalDialog(false)
      setSelectedOrder(null)
      setApprovalComments('')
      
      loadChangeOrders()
      onRefresh?.()
    } catch (err: any) {
      console.error('Failed to submit approval:', err)
      setError(err.message || 'Failed to submit approval')
    } finally {
      setIsSubmitting(false)
    }
  }
  
  // Stats
  const stats = {
    total: changeOrders.length,
    pending: changeOrders.filter(co => co.status === 'pending_approval').length,
    approved: changeOrders.filter(co => co.status === 'approved' || co.status === 'executed').length,
    totalCostImpact: changeOrders
      .filter(co => co.status === 'approved' || co.status === 'executed')
      .reduce((sum, co) => sum + (co.cost_impact || 0), 0),
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
        <StatCard label="Total Change Orders" value={stats.total} />
        <StatCard label="Pending Approval" value={stats.pending} color="amber" />
        <StatCard label="Approved/Executed" value={stats.approved} color="green" />
        <StatCard 
          label="Total Cost Impact" 
          value={formatCurrency(stats.totalCostImpact, currency)} 
          color={stats.totalCostImpact > 0 ? 'red' : stats.totalCostImpact < 0 ? 'green' : 'zinc'} 
          isText
        />
      </div>
      
      {/* Filters */}
      <div className="flex items-center gap-4 pb-4 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-zinc-500" />
          <span className="font-mono text-xs text-zinc-500">Filters:</span>
        </div>
        
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ChangeOrderStatus | 'all')}>
          <SelectTrigger className="w-44 h-8 font-mono text-xs bg-zinc-900 border-zinc-700">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(statusConfig).map(([key, config]) => (
              <SelectItem key={key} value={key}>{config.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ChangeOrderType | 'all')}>
          <SelectTrigger className="w-44 h-8 font-mono text-xs bg-zinc-900 border-zinc-700">
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
        <div className="border border-red-800 bg-red-900/20 p-4 text-center">
          <AlertTriangle className="h-6 w-6 text-red-400 mx-auto mb-2" />
          <p className="font-mono text-sm text-red-400">{error}</p>
        </div>
      )}
      
      {/* Change Orders List */}
      {changeOrders.length === 0 ? (
        <div className="text-center py-12 border border-zinc-800 bg-zinc-900/50">
          <FileEdit className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
          <h3 className="font-mono text-sm text-white mb-2">No Change Orders Found</h3>
          <p className="font-mono text-xs text-zinc-500">
            Change orders from the project manager will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {changeOrders.map((order) => {
            const isExpanded = expandedOrders.has(order.id)
            const status = statusConfig[order.status] || statusConfig['draft']
            const type = typeConfig[order.type] || typeConfig['other']
            const StatusIcon = status.icon
            const canApprove = order.status === 'pending_approval'
            
            return (
              <div 
                key={order.id}
                className="border border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 transition-colors"
              >
                {/* Header */}
                <div 
                  className="flex items-center gap-4 p-4 cursor-pointer"
                  onClick={() => toggleExpanded(order.id)}
                >
                  <div className="flex-shrink-0">
                    <StatusIcon className={cn("h-5 w-5", status.text)} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-amber-500">
                        {order.co_number}
                      </span>
                      <Badge variant="outline" className={cn("font-mono text-[10px] border-0", status.bg, status.text)}>
                        {status.label}
                      </Badge>
                      <span className={cn("font-mono text-[10px]", type.color)}>
                        {type.label}
                      </span>
                    </div>
                    <h4 className="font-mono text-sm text-white line-clamp-1">
                      {order.title}
                    </h4>
                    <p className="font-mono text-xs text-zinc-500 mt-1">
                      From: {order.submitted_by_name || 'Project Manager'}
                    </p>
                  </div>
                  
                  {/* Cost/Schedule Impact Summary */}
                  <div className="flex items-center gap-4 mr-4">
                    <div className="text-right">
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3 text-zinc-500" />
                        <span className={cn(
                          "font-mono text-sm",
                          order.cost_impact > 0 ? "text-red-400" : order.cost_impact < 0 ? "text-green-400" : "text-zinc-400"
                        )}>
                          {order.cost_impact > 0 ? '+' : ''}{formatCurrency(order.cost_impact, order.currency || currency)}
                        </span>
                      </div>
                      {order.schedule_impact_days !== undefined && order.schedule_impact_days !== 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          <Calendar className="h-3 w-3 text-zinc-500" />
                          <span className={cn(
                            "font-mono text-xs",
                            order.schedule_impact_days > 0 ? "text-red-400" : "text-green-400"
                          )}>
                            {order.schedule_impact_days > 0 ? '+' : ''}{order.schedule_impact_days} days
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {canApprove && (
                      <>
                        <Button
                          size="sm"
                          className="h-8 font-mono text-xs bg-green-600 hover:bg-green-700 text-white"
                          onClick={(e) => {
                            e.stopPropagation()
                            openApprovalDialog(order, 'approve')
                          }}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 font-mono text-xs border-red-600 text-red-400 hover:bg-red-900/50"
                          onClick={(e) => {
                            e.stopPropagation()
                            openApprovalDialog(order, 'reject')
                          }}
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          Reject
                        </Button>
                      </>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-zinc-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-zinc-500" />
                    )}
                  </div>
                </div>
                
                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-zinc-800 p-4 space-y-4">
                    {/* Description */}
                    {order.description && (
                      <div>
                        <h5 className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
                          Description
                        </h5>
                        <p className="font-mono text-sm text-zinc-300 whitespace-pre-wrap">
                          {order.description}
                        </p>
                      </div>
                    )}
                    
                    {/* Reason & Justification */}
                    <div className="grid grid-cols-2 gap-4">
                      {order.reason && (
                        <div>
                          <h5 className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
                            Reason
                          </h5>
                          <p className="font-mono text-sm text-zinc-300">
                            {order.reason}
                          </p>
                        </div>
                      )}
                      {order.justification && (
                        <div>
                          <h5 className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
                            Justification
                          </h5>
                          <p className="font-mono text-sm text-zinc-300">
                            {order.justification}
                          </p>
                        </div>
                      )}
                    </div>
                    
                    {/* Cost Breakdown */}
                    <div className="grid grid-cols-3 gap-4 bg-zinc-800/30 p-4 border border-zinc-800">
                      <div>
                        <span className="font-mono text-[10px] text-zinc-500">Original Amount</span>
                        <p className="font-mono text-sm text-white">
                          {formatCurrency(order.original_amount, order.currency || currency)}
                        </p>
                      </div>
                      <div>
                        <span className="font-mono text-[10px] text-zinc-500">Cost Impact</span>
                        <p className={cn(
                          "font-mono text-sm",
                          order.cost_impact > 0 ? "text-red-400" : order.cost_impact < 0 ? "text-green-400" : "text-white"
                        )}>
                          {order.cost_impact > 0 ? '+' : ''}{formatCurrency(order.cost_impact, order.currency || currency)}
                        </p>
                      </div>
                      <div>
                        <span className="font-mono text-[10px] text-zinc-500">Revised Amount</span>
                        <p className="font-mono text-sm text-amber-400">
                          {formatCurrency((order.revised_amount || order.original_amount + order.cost_impact), order.currency || currency)}
                        </p>
                      </div>
                    </div>
                    
                    {/* Line Items */}
                    {order.items && order.items.length > 0 && (
                      <div>
                        <h5 className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
                          Line Items
                        </h5>
                        <div className="border border-zinc-800">
                          <table className="w-full">
                            <thead>
                              <tr className="bg-zinc-800/50">
                                <th className="font-mono text-[10px] text-zinc-400 text-left p-2">Description</th>
                                <th className="font-mono text-[10px] text-zinc-400 text-right p-2">Qty</th>
                                <th className="font-mono text-[10px] text-zinc-400 text-right p-2">Unit Cost</th>
                                <th className="font-mono text-[10px] text-zinc-400 text-right p-2">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.items.map((item, idx) => (
                                <tr key={item.id || idx} className="border-t border-zinc-800">
                                  <td className="font-mono text-xs text-zinc-300 p-2">{item.description}</td>
                                  <td className="font-mono text-xs text-zinc-400 text-right p-2">
                                    {item.quantity} {item.unit}
                                  </td>
                                  <td className="font-mono text-xs text-zinc-400 text-right p-2">
                                    {item.unit_cost ? formatCurrency(item.unit_cost, order.currency || currency) : '-'}
                                  </td>
                                  <td className="font-mono text-xs text-white text-right p-2">
                                    {formatCurrency(item.total_cost, order.currency || currency)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    
                    {/* Attachments */}
                    {order.attachments && order.attachments.length > 0 && (
                      <div>
                        <h5 className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
                          Attachments
                        </h5>
                        <div className="flex flex-wrap gap-2">
                          {order.attachments.map((att) => (
                            <a
                              key={att.id}
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50 border border-zinc-700 hover:border-amber-500/50 transition-colors"
                            >
                              <Paperclip className="h-3 w-3 text-zinc-500" />
                              <span className="font-mono text-xs text-zinc-300">{att.filename}</span>
                              <Download className="h-3 w-3 text-amber-500" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Rejection Reason (if rejected) */}
                    {order.rejection_reason && (
                      <div className="bg-red-900/20 border border-red-800/50 p-4">
                        <h5 className="font-mono text-[10px] text-red-400 uppercase tracking-wider mb-2">
                          Rejection Reason
                        </h5>
                        <p className="font-mono text-sm text-zinc-300 whitespace-pre-wrap">
                          {order.rejection_reason}
                        </p>
                      </div>
                    )}
                    
                    {/* Approval Info */}
                    {order.approved_at && (
                      <div className="flex items-center gap-4 text-zinc-500 font-mono text-xs">
                        <span>Approved by {order.approved_by_name || 'Client'}</span>
                        <span>on {new Date(order.approved_at).toLocaleDateString('en-GB')}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      
      {/* Approval Dialog */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono text-white">
              {approvalAction === 'approve' ? 'Approve' : 'Reject'} Change Order
            </DialogTitle>
            <DialogDescription className="font-mono text-zinc-400">
              {selectedOrder?.co_number}: {selectedOrder?.title}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Impact Summary */}
            <div className="bg-zinc-800/50 border border-zinc-700 p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="font-mono text-[10px] text-zinc-500">Cost Impact</span>
                  <p className={cn(
                    "font-mono text-lg",
                    (selectedOrder?.cost_impact || 0) > 0 ? "text-red-400" : (selectedOrder?.cost_impact || 0) < 0 ? "text-green-400" : "text-white"
                  )}>
                    {(selectedOrder?.cost_impact || 0) > 0 ? '+' : ''}{formatCurrency(selectedOrder?.cost_impact || 0, currency)}
                  </p>
                </div>
                <div>
                  <span className="font-mono text-[10px] text-zinc-500">Schedule Impact</span>
                  <p className={cn(
                    "font-mono text-lg",
                    (selectedOrder?.schedule_impact_days || 0) > 0 ? "text-red-400" : "text-white"
                  )}>
                    {(selectedOrder?.schedule_impact_days || 0) > 0 ? '+' : ''}{selectedOrder?.schedule_impact_days || 0} days
                  </p>
                </div>
              </div>
            </div>
            
            {/* Comments */}
            <div>
              <label className="font-mono text-xs text-zinc-400 mb-2 block">
                {approvalAction === 'approve' ? 'Comments (Optional)' : 'Rejection Reason *'}
              </label>
              <Textarea
                value={approvalComments}
                onChange={(e) => setApprovalComments(e.target.value)}
                placeholder={
                  approvalAction === 'approve'
                    ? "Add any notes for the project manager..."
                    : "Explain the reason for rejection..."
                }
                className="bg-zinc-800 border-zinc-700 font-mono text-sm min-h-[100px]"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowApprovalDialog(false)}
              disabled={isSubmitting}
              className="font-mono text-xs"
            >
              Cancel
            </Button>
            <Button
              onClick={submitApproval}
              disabled={isSubmitting || (approvalAction === 'reject' && !approvalComments.trim())}
              className={cn(
                "font-mono text-xs",
                approvalAction === 'approve'
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-red-600 hover:bg-red-700",
                "text-white"
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : approvalAction === 'approve' ? (
                <>
                  <CheckCircle2 className="h-3 w-3 mr-2" />
                  Approve Change Order
                </>
              ) : (
                <>
                  <XCircle className="h-3 w-3 mr-2" />
                  Reject Change Order
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
  color = 'zinc',
  isText = false
}: { 
  label: string
  value: number | string
  color?: 'zinc' | 'blue' | 'amber' | 'red' | 'green'
  isText?: boolean
}) {
  const colorClasses = {
    zinc: 'text-white',
    blue: 'text-blue-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
    green: 'text-green-400',
  }
  
  return (
    <div className="border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className={cn(
        "font-mono",
        isText ? "text-lg" : "text-2xl",
        colorClasses[color]
      )}>
        {value}
      </div>
    </div>
  )
}
