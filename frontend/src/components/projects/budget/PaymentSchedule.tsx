'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  DollarSign,
  Plus,
  Search,
  Calendar,
  CheckCircle,
  Clock,
  AlertTriangle,
  Loader2,
  MoreHorizontal,
  FileText,
  ArrowRight,
  Ban,
  Edit,
  Trash2,
  Link as LinkIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  paymentMilestoneApi,
  invoiceApi,
  type PaymentMilestone,
  type Invoice,
} from '@/lib/budget-api'

// =====================================================
// TYPES
// =====================================================

interface PaymentScheduleProps {
  projectId: string
  phases?: Phase[]
  className?: string
}

interface Phase {
  id: string
  name: string
  startDate: string
  endDate: string
  status: 'not_started' | 'in_progress' | 'completed'
}

// =====================================================
// CONSTANTS
// =====================================================

const STATUS_CONFIG: Record<PaymentMilestone['status'], { 
  label: string; 
  color: string;
  icon: React.ElementType;
}> = {
  pending: { label: 'Pending', color: 'bg-zinc-800 text-zinc-300', icon: Clock },
  partially_paid: { label: 'Partial', color: 'bg-amber-500/10 text-amber-400', icon: DollarSign },
  paid: { label: 'Paid', color: 'bg-emerald-500/10 text-emerald-400', icon: CheckCircle },
  overdue: { label: 'Overdue', color: 'bg-red-500/10 text-red-400', icon: AlertTriangle },
  cancelled: { label: 'Cancelled', color: 'bg-zinc-800 text-zinc-500', icon: Ban },
}

const formatCurrency = (amount: number, currency = 'GHS') => {
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

// =====================================================
// MILESTONE CARD
// =====================================================

function MilestoneCard({
  milestone,
  phases,
  invoices,
  onClick,
  onAction,
}: {
  milestone: PaymentMilestone
  phases: Phase[]
  invoices: Invoice[]
  onClick: () => void
  onAction: (action: string) => void
}) {
  const config = STATUS_CONFIG[milestone.status]
  const StatusIcon = config.icon

  const phase = phases.find(p => p.id === milestone.phaseId)
  const linkedInvoices = invoices.filter(inv => inv.milestoneId === milestone.id)
  
  const paidAmount = linkedInvoices
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + inv.amountLocal, 0)
  
  const progressPercent = milestone.amount > 0 
    ? Math.round((paidAmount / milestone.amount) * 100)
    : 0

  const isOverdue = milestone.dueDate && 
    milestone.status !== 'paid' && 
    milestone.status !== 'cancelled' &&
    new Date(milestone.dueDate) < new Date()

  return (
    <Card
      className={cn(
        'cursor-pointer transition-shadow hover:shadow-md bg-zinc-900/80 border-zinc-800',
        isOverdue && 'border-red-500/30'
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={cn('rounded-lg p-2', config.color)}>
              <StatusIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h4 className="font-medium text-zinc-100 line-clamp-1">{milestone.name}</h4>
              {phase && (
                <p className="text-sm text-zinc-500">
                  {phase.name}
                </p>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAction('edit'); }}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAction('link-invoice'); }}>
                <LinkIcon className="mr-2 h-4 w-4" />
                Link Invoice
              </DropdownMenuItem>
              {milestone.status !== 'paid' && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAction('mark-paid'); }}>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Mark as Paid
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600"
                onClick={(e) => { e.stopPropagation(); onAction('cancel'); }}
              >
                <Ban className="mr-2 h-4 w-4" />
                Cancel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">Amount</span>
            <span className="font-medium text-zinc-100">{formatCurrency(milestone.amount, milestone.currency)}</span>
          </div>
          <Progress value={progressPercent} className="mt-2 h-2" />
          <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
            <span>{formatCurrency(paidAmount, milestone.currency)} paid</span>
            <span>{progressPercent}%</span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge className={config.color}>{config.label}</Badge>
          {milestone.dueDate && (
            <Badge variant="outline" className={cn(
              'flex items-center gap-1 border-zinc-700 text-zinc-400',
              isOverdue && 'border-red-500/30 text-red-400'
            )}>
              <Calendar className="h-3 w-3" />
              {new Date(milestone.dueDate).toLocaleDateString()}
            </Badge>
          )}
          {linkedInvoices.length > 0 && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {linkedInvoices.length} invoice(s)
            </Badge>
          )}
        </div>

        {milestone.description && (
          <p className="mt-3 text-sm text-zinc-500 line-clamp-2">
            {milestone.description}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// =====================================================
// ADD MILESTONE FORM
// =====================================================

function AddMilestoneForm({
  projectId,
  phases,
  onSubmit,
  onCancel,
  isSubmitting,
  editMilestone,
}: {
  projectId: string
  phases: Phase[]
  onSubmit: (data: Partial<PaymentMilestone>) => void
  onCancel: () => void
  isSubmitting: boolean
  editMilestone?: PaymentMilestone
}) {
  const [formData, setFormData] = useState<Partial<PaymentMilestone>>({
    projectId,
    phaseId: editMilestone?.phaseId || '',
    name: editMilestone?.name || '',
    description: editMilestone?.description || '',
    amount: editMilestone?.amount || 0,
    currency: editMilestone?.currency || 'GHS',
    dueDate: editMilestone?.dueDate 
      ? new Date(editMilestone.dueDate).toISOString().split('T')[0] 
      : '',
    percentage: editMilestone?.percentage || undefined,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Milestone Name *</Label>
        <Input
          id="name"
          placeholder="e.g., Foundation Complete"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phase">Linked Phase</Label>
        <Select
          value={formData.phaseId || ''}
          onValueChange={(value) => setFormData(prev => ({ ...prev, phaseId: value }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select phase (optional)" />
          </SelectTrigger>
          <SelectContent>
            {phases.map((phase) => (
              <SelectItem key={phase.id} value={phase.id}>
                {phase.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="amount">Amount *</Label>
          <Input
            id="amount"
            type="number"
            min={0}
            step={0.01}
            value={formData.amount || ''}
            onChange={(e) => setFormData(prev => ({ 
              ...prev, 
              amount: parseFloat(e.target.value) || 0 
            }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">Currency</Label>
          <Select
            value={formData.currency}
            onValueChange={(value) => setFormData(prev => ({ ...prev, currency: value }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GHS">GHS (Ghana Cedi)</SelectItem>
              <SelectItem value="USD">USD (US Dollar)</SelectItem>
              <SelectItem value="EUR">EUR (Euro)</SelectItem>
              <SelectItem value="GBP">GBP (British Pound)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="dueDate">Due Date</Label>
          <Input
            id="dueDate"
            type="date"
            value={formData.dueDate as string || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="percentage">Percentage of Total (%)</Label>
          <Input
            id="percentage"
            type="number"
            min={0}
            max={100}
            step={0.1}
            placeholder="e.g., 25"
            value={formData.percentage || ''}
            onChange={(e) => setFormData(prev => ({ 
              ...prev, 
              percentage: parseFloat(e.target.value) || undefined 
            }))}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Milestone description or payment terms..."
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !formData.name || !formData.amount}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {editMilestone ? 'Update' : 'Create'} Milestone
        </Button>
      </DialogFooter>
    </form>
  )
}

// =====================================================
// MILESTONE DETAIL SHEET
// =====================================================

function MilestoneDetail({
  milestone,
  phases,
  invoices,
  onClose,
  onRefresh,
}: {
  milestone: PaymentMilestone
  phases: Phase[]
  invoices: Invoice[]
  onClose: () => void
  onRefresh: () => void
}) {
  const [isLinkingInvoice, setIsLinkingInvoice] = useState(false)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('')

  const config = STATUS_CONFIG[milestone.status]
  const StatusIcon = config.icon

  const phase = phases.find(p => p.id === milestone.phaseId)
  const linkedInvoices = invoices.filter(inv => inv.milestoneId === milestone.id)
  const unlinkableInvoices = invoices.filter(inv => !inv.milestoneId)
  
  const paidAmount = linkedInvoices
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + inv.amountLocal, 0)
  
  const remainingAmount = milestone.amount - paidAmount

  const handleLinkInvoice = async () => {
    if (!selectedInvoiceId) return
    try {
      await paymentMilestoneApi.linkInvoice(milestone.id, selectedInvoiceId)
      setIsLinkingInvoice(false)
      setSelectedInvoiceId('')
      onRefresh()
    } catch (err) {
      console.error('Error linking invoice:', err)
    }
  }

  return (
    <SheetContent className="w-full sm:max-w-xl overflow-y-auto bg-[#0D1117] border-zinc-800">
      <SheetHeader>
        <div className="flex items-start gap-4">
          <div className={cn('rounded-lg p-3', config.color)}>
            <StatusIcon className="h-6 w-6" />
          </div>
          <div>
            <SheetTitle>{milestone.name}</SheetTitle>
            <SheetDescription>
              {phase?.name || 'No phase linked'}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="mt-6 space-y-6">
        {/* Amount Summary */}
        <Card className="bg-zinc-900/80 border-zinc-800">
          <CardContent className="p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm text-zinc-500">Total Amount</p>
                <p className="text-2xl font-bold text-zinc-100">
                  {formatCurrency(milestone.amount, milestone.currency)}
                </p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Paid</p>
                <p className="text-2xl font-bold text-emerald-400">
                  {formatCurrency(paidAmount, milestone.currency)}
                </p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Remaining</p>
                <p className={cn(
                  'text-2xl font-bold',
                  remainingAmount > 0 ? 'text-amber-400' : 'text-zinc-600'
                )}>
                  {formatCurrency(remainingAmount, milestone.currency)}
                </p>
              </div>
            </div>
            <Progress 
              value={(paidAmount / milestone.amount) * 100} 
              className="mt-4 h-2" 
            />
          </CardContent>
        </Card>

        {/* Details */}
        <div className="space-y-3">
          <h4 className="font-medium text-zinc-100">Details</h4>
          <div className="grid gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Status</span>
              <Badge className={config.color}>{config.label}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Due Date</span>
              <span className="text-zinc-300">
                {milestone.dueDate 
                  ? new Date(milestone.dueDate).toLocaleDateString() 
                  : 'Not set'}
              </span>
            </div>
            {milestone.percentage && (
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">% of Total</span>
                <span className="text-zinc-300">{milestone.percentage}%</span>
              </div>
            )}
          </div>
          {milestone.description && (
            <p className="text-sm text-zinc-500">
              {milestone.description}
            </p>
          )}
        </div>

        {/* Linked Invoices */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-zinc-100">Linked Invoices</h4>
            <Dialog open={isLinkingInvoice} onOpenChange={setIsLinkingInvoice}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <LinkIcon className="mr-2 h-4 w-4" />
                  Link Invoice
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Link Invoice to Milestone</DialogTitle>
                  <DialogDescription>
                    Select an unlinked invoice to associate with this payment milestone.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {unlinkableInvoices.length === 0 ? (
                    <p className="text-sm text-zinc-500 py-4 text-center">
                      No unlinked invoices available
                    </p>
                  ) : (
                    <Select
                      value={selectedInvoiceId}
                      onValueChange={setSelectedInvoiceId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select invoice" />
                      </SelectTrigger>
                      <SelectContent>
                        {unlinkableInvoices.map((inv) => (
                          <SelectItem key={inv.id} value={inv.id}>
                            {inv.invoiceNumber} - {formatCurrency(inv.amountLocal)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsLinkingInvoice(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleLinkInvoice} disabled={!selectedInvoiceId}>
                    Link Invoice
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {linkedInvoices.length === 0 ? (
            <Card className="bg-zinc-900/80 border-zinc-800">
              <CardContent className="flex flex-col items-center py-6 text-zinc-500">
                <FileText className="h-8 w-8" />
                <p className="mt-2 text-sm">No linked invoices</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {linkedInvoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-800 p-3"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-zinc-500" />
                    <div>
                      <p className="font-medium text-zinc-100">{invoice.invoiceNumber}</p>
                      <p className="text-xs text-zinc-500">
                        {invoice.vendorName}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-zinc-100">
                      {formatCurrency(invoice.amountLocal)}
                    </p>
                    <Badge
                      variant="outline"
                      className={cn(
                        invoice.status === 'paid' && 'text-emerald-400 border-emerald-500/30',
                        invoice.status === 'pending' && 'text-amber-400 border-amber-500/30'
                      )}
                    >
                      {invoice.status.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </SheetContent>
  )
}

// =====================================================
// SCHEDULE TIMELINE VIEW
// =====================================================

function ScheduleTimeline({
  milestones,
  phases,
  invoices,
  onSelect,
}: {
  milestones: PaymentMilestone[]
  phases: Phase[]
  invoices: Invoice[]
  onSelect: (milestone: PaymentMilestone) => void
}) {
  const sortedMilestones = [...milestones].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  })

  const totalAmount = milestones.reduce((sum, m) => sum + m.amount, 0)
  const paidAmount = milestones.reduce((sum, m) => {
    const linked = invoices.filter(inv => inv.milestoneId === m.id && inv.status === 'paid')
    return sum + linked.reduce((s, inv) => s + inv.amountLocal, 0)
  }, 0)

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card className="bg-zinc-900/80 border-zinc-800">
        <CardContent className="p-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <p className="text-sm text-zinc-500">Total Schedule</p>
              <p className="text-xl font-bold text-zinc-100">{formatCurrency(totalAmount)}</p>
            </div>
            <div>
              <p className="text-sm text-zinc-500">Paid</p>
              <p className="text-xl font-bold text-emerald-400">{formatCurrency(paidAmount)}</p>
            </div>
            <div>
              <p className="text-sm text-zinc-500">Milestones</p>
              <p className="text-xl font-bold text-zinc-100">{milestones.length}</p>
            </div>
            <div>
              <p className="text-sm text-zinc-500">Progress</p>
              <div className="flex items-center gap-2">
                <Progress value={(paidAmount / totalAmount) * 100} className="flex-1 h-2" />
                <span className="text-sm font-medium">
                  {Math.round((paidAmount / totalAmount) * 100)}%
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[19px] top-0 h-full w-0.5 bg-zinc-800" />

        <div className="space-y-4">
          {sortedMilestones.map((milestone, idx) => {
            const config = STATUS_CONFIG[milestone.status]
            const StatusIcon = config.icon
            const linked = invoices.filter(inv => inv.milestoneId === milestone.id)
            const paid = linked.filter(inv => inv.status === 'paid')
              .reduce((sum, inv) => sum + inv.amountLocal, 0)

            return (
              <div
                key={milestone.id}
                className="relative pl-10 cursor-pointer"
                onClick={() => onSelect(milestone)}
              >
                {/* Timeline dot */}
                <div className={cn(
                  'absolute left-0 flex h-10 w-10 items-center justify-center rounded-full',
                  config.color
                )}>
                  <StatusIcon className="h-5 w-5" />
                </div>

                <Card className="hover:shadow-md transition-shadow bg-zinc-900/80 border-zinc-800">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium text-zinc-100">{milestone.name}</h4>
                        {milestone.dueDate && (
                          <p className="text-sm text-zinc-500">
                            Due: {new Date(milestone.dueDate).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-zinc-100">
                          {formatCurrency(milestone.amount, milestone.currency)}
                        </p>
                        {milestone.percentage && (
                          <p className="text-xs text-zinc-500">
                            {milestone.percentage}% of total
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-4">
                      <Progress 
                        value={(paid / milestone.amount) * 100} 
                        className="flex-1 h-1.5" 
                      />
                      <span className="text-xs text-zinc-500">
                        {formatCurrency(paid)} / {formatCurrency(milestone.amount)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function PaymentSchedule({
  projectId,
  phases = [],
  className,
}: PaymentScheduleProps) {
  const [milestones, setMilestones] = useState<PaymentMilestone[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [viewMode, setViewMode] = useState<'cards' | 'timeline'>('timeline')
  const [statusFilter, setStatusFilter] = useState<PaymentMilestone['status'] | 'all'>('all')

  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editMilestone, setEditMilestone] = useState<PaymentMilestone | undefined>()
  const [selectedMilestone, setSelectedMilestone] = useState<PaymentMilestone | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const [milestonesData, invoicesData] = await Promise.all([
        paymentMilestoneApi.getAll(projectId, {
          status: statusFilter !== 'all' ? statusFilter : undefined,
        }),
        invoiceApi.getAll({ projectId }),
      ])

      setMilestones(milestonesData)
      setInvoices(invoicesData.data)
    } catch (err) {
      console.error('Error fetching data:', err)
      setError('Failed to load payment schedule')
    } finally {
      setIsLoading(false)
    }
  }, [projectId, statusFilter])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Add/Edit milestone
  const handleSubmitMilestone = async (data: Partial<PaymentMilestone>) => {
    try {
      setIsSubmitting(true)
      if (editMilestone) {
        await paymentMilestoneApi.update(editMilestone.id, data)
      } else {
        await paymentMilestoneApi.create(data as PaymentMilestone)
      }
      setShowAddDialog(false)
      setEditMilestone(undefined)
      await fetchData()
    } catch (err) {
      console.error('Error saving milestone:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Actions
  const handleAction = async (milestoneId: string, action: string) => {
    try {
      const milestone = milestones.find(m => m.id === milestoneId)
      if (!milestone) return

      switch (action) {
        case 'edit':
          setEditMilestone(milestone)
          setShowAddDialog(true)
          break
        case 'mark-paid':
          await paymentMilestoneApi.markAsPaid(milestoneId)
          await fetchData()
          break
        case 'cancel':
          await paymentMilestoneApi.cancel(milestoneId)
          await fetchData()
          break
        case 'link-invoice':
          setSelectedMilestone(milestone)
          break
      }
    } catch (err) {
      console.error(`Error ${action}:`, err)
    }
  }

  // Filtered milestones
  const filteredMilestones = milestones.filter(m => 
    statusFilter === 'all' || m.status === statusFilter
  )

  // Loading
  if (isLoading && milestones.length === 0) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    )
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2 text-[#C9A84C]">
            <DollarSign className="h-6 w-6" />
            Payment Schedule
          </h2>
          <p className="text-zinc-500">
            {milestones.length} payment milestones
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-zinc-700">
            <Button
              variant={viewMode === 'timeline' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('timeline')}
              className={viewMode === 'timeline' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}
            >
              Timeline
            </Button>
            <Button
              variant={viewMode === 'cards' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('cards')}
              className={viewMode === 'cards' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}
            >
              Cards
            </Button>
          </div>

          <Dialog open={showAddDialog} onOpenChange={(open) => {
            setShowAddDialog(open)
            if (!open) setEditMilestone(undefined)
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Milestone
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editMilestone ? 'Edit Milestone' : 'Add Payment Milestone'}
                </DialogTitle>
                <DialogDescription>
                  Create a payment milestone linked to a project phase.
                </DialogDescription>
              </DialogHeader>
              <AddMilestoneForm
                projectId={projectId}
                phases={phases}
                onSubmit={handleSubmitMilestone}
                onCancel={() => {
                  setShowAddDialog(false)
                  setEditMilestone(undefined)
                }}
                isSubmitting={isSubmitting}
                editMilestone={editMilestone}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as PaymentMilestone['status'] | 'all')}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {filteredMilestones.length === 0 ? (
        <Card className="bg-zinc-900/80 border-zinc-800">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <DollarSign className="h-12 w-12 text-zinc-600" />
            <h3 className="mt-4 font-medium text-zinc-300">No Payment Milestones</h3>
            <p className="text-sm text-zinc-500">
              Create your first payment milestone
            </p>
            <Button className="mt-4" onClick={() => setShowAddDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Milestone
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === 'timeline' ? (
        <ScheduleTimeline
          milestones={filteredMilestones}
          phases={phases}
          invoices={invoices}
          onSelect={setSelectedMilestone}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredMilestones.map((milestone) => (
            <MilestoneCard
              key={milestone.id}
              milestone={milestone}
              phases={phases}
              invoices={invoices}
              onClick={() => setSelectedMilestone(milestone)}
              onAction={(action) => handleAction(milestone.id, action)}
            />
          ))}
        </div>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!selectedMilestone} onOpenChange={() => setSelectedMilestone(null)}>
        {selectedMilestone && (
          <MilestoneDetail
            milestone={selectedMilestone}
            phases={phases}
            invoices={invoices}
            onClose={() => setSelectedMilestone(null)}
            onRefresh={fetchData}
          />
        )}
      </Sheet>
    </div>
  )
}

export default PaymentSchedule
