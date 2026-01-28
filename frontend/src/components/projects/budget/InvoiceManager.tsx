'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  FileText,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  DollarSign,
  Loader2,
  Eye,
  Edit,
  Trash2,
  Send,
  Download,
  Building2,
  Calendar,
  ArrowUpDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  invoiceApi,
  type Invoice,
  type InvoiceStatus,
  type InvoiceSummary,
} from '@/lib/budget-api'
import { formatCurrency, formatDate } from '@/lib/utils'

// =====================================================
// TYPES
// =====================================================

interface InvoiceManagerProps {
  projectId: string
  organizationId: string
  className?: string
}

// =====================================================
// CONSTANTS
// =====================================================

const STATUS_CONFIG: Record<InvoiceStatus, {
  label: string
  icon: React.ElementType
  color: string
}> = {
  draft: { label: 'Draft', icon: Edit, color: 'bg-gray-100 text-gray-700' },
  pending: { label: 'Pending', icon: Clock, color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: 'Approved', icon: CheckCircle, color: 'bg-green-100 text-green-700' },
  paid: { label: 'Paid', icon: DollarSign, color: 'bg-blue-100 text-blue-700' },
  rejected: { label: 'Rejected', icon: XCircle, color: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Cancelled', icon: Trash2, color: 'bg-gray-100 text-gray-500' },
}

// =====================================================
// SUMMARY CARDS
// =====================================================

function SummaryCards({ summary }: { summary: InvoiceSummary | null }) {
  if (!summary) return null

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Invoices</CardTitle>
          <FileText className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{summary.totalInvoices}</div>
          <p className="text-xs text-muted-foreground">
            {formatCurrency(summary.totalAmount, 'GHS')} total
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Paid</CardTitle>
          <CheckCircle className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">
            {formatCurrency(summary.paidAmount, 'GHS')}
          </div>
          <p className="text-xs text-muted-foreground">
            {summary.byStatus.paid?.count || 0} invoices
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Pending</CardTitle>
          <Clock className="h-4 w-4 text-yellow-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-yellow-600">
            {formatCurrency(summary.pendingAmount, 'GHS')}
          </div>
          <p className="text-xs text-muted-foreground">
            {(summary.byStatus.pending?.count || 0) + (summary.byStatus.approved?.count || 0)} invoices
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Overdue</CardTitle>
          <AlertTriangle className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">
            {formatCurrency(summary.overdueAmount, 'GHS')}
          </div>
          <p className="text-xs text-muted-foreground">
            Requires attention
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// =====================================================
// INVOICE FORM
// =====================================================

function InvoiceForm({
  invoice,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  invoice?: Partial<Invoice>
  onSubmit: (data: Partial<Invoice>) => void
  onCancel: () => void
  isSubmitting: boolean
}) {
  const [formData, setFormData] = useState<Partial<Invoice>>({
    vendorName: '',
    invoiceNumber: '',
    description: '',
    amount: 0,
    currency: 'GHS',
    invoiceDate: new Date(),
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    lineItems: [],
    taxAmount: 0,
    notes: '',
    ...invoice,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="vendorName">Vendor Name *</Label>
          <Input
            id="vendorName"
            value={formData.vendorName}
            onChange={(e) => setFormData(prev => ({ ...prev, vendorName: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invoiceNumber">Invoice Number *</Label>
          <Input
            id="invoiceNumber"
            value={formData.invoiceNumber}
            onChange={(e) => setFormData(prev => ({ ...prev, invoiceNumber: e.target.value }))}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description *</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          required
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="amount">Amount *</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            value={formData.amount}
            onChange={(e) => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
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
              <SelectItem value="GHS">GHS - Ghana Cedi</SelectItem>
              <SelectItem value="USD">USD - US Dollar</SelectItem>
              <SelectItem value="GBP">GBP - British Pound</SelectItem>
              <SelectItem value="EUR">EUR - Euro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="taxAmount">Tax Amount</Label>
          <Input
            id="taxAmount"
            type="number"
            step="0.01"
            value={formData.taxAmount}
            onChange={(e) => setFormData(prev => ({ ...prev, taxAmount: parseFloat(e.target.value) || 0 }))}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="invoiceDate">Invoice Date *</Label>
          <Input
            id="invoiceDate"
            type="date"
            value={formData.invoiceDate ? new Date(formData.invoiceDate).toISOString().split('T')[0] : ''}
            onChange={(e) => setFormData(prev => ({ ...prev, invoiceDate: new Date(e.target.value) }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dueDate">Due Date *</Label>
          <Input
            id="dueDate"
            type="date"
            value={formData.dueDate ? new Date(formData.dueDate).toISOString().split('T')[0] : ''}
            onChange={(e) => setFormData(prev => ({ ...prev, dueDate: new Date(e.target.value) }))}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={formData.notes || ''}
          onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {invoice?.id ? 'Update Invoice' : 'Create Invoice'}
        </Button>
      </DialogFooter>
    </form>
  )
}

// =====================================================
// INVOICE DETAIL SHEET
// =====================================================

function InvoiceDetail({
  invoice,
  onClose,
  onAction,
}: {
  invoice: Invoice
  onClose: () => void
  onAction: (action: string, data?: any) => void
}) {
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [paymentReference, setPaymentReference] = useState('')
  const [showPayDialog, setShowPayDialog] = useState(false)

  const statusConfig = STATUS_CONFIG[invoice.status]
  const StatusIcon = statusConfig.icon

  return (
    <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Invoice {invoice.invoiceNumber}
        </SheetTitle>
        <SheetDescription>
          <Badge className={cn('mt-2', statusConfig.color)}>
            <StatusIcon className="mr-1 h-3 w-3" />
            {statusConfig.label}
          </Badge>
        </SheetDescription>
      </SheetHeader>

      <div className="mt-6 space-y-6">
        {/* Vendor Info */}
        <div className="space-y-2">
          <Label className="text-muted-foreground">Vendor</Label>
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="font-medium">{invoice.vendorName}</span>
          </div>
        </div>

        {/* Amount */}
        <div className="space-y-2">
          <Label className="text-muted-foreground">Amount</Label>
          <p className="text-2xl font-bold">
            {formatCurrency(invoice.amount + (invoice.taxAmount || 0), invoice.currency)}
          </p>
          {invoice.taxAmount > 0 && (
            <p className="text-sm text-muted-foreground">
              Includes {formatCurrency(invoice.taxAmount, invoice.currency)} tax
            </p>
          )}
          {invoice.exchangeRateAtCreation && invoice.exchangeRateAtCreation !== 1 && (
            <p className="text-sm text-muted-foreground">
              FX Rate: {invoice.exchangeRateAtCreation.toFixed(4)}
            </p>
          )}
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Invoice Date</Label>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>{formatDate(invoice.invoiceDate)}</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground">Due Date</Label>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className={cn(invoice.isOverdue && 'text-red-600')}>
                {formatDate(invoice.dueDate)}
              </span>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label className="text-muted-foreground">Description</Label>
          <p>{invoice.description}</p>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="space-y-2">
            <Label className="text-muted-foreground">Notes</Label>
            <p className="text-sm">{invoice.notes}</p>
          </div>
        )}

        {/* Approval Info */}
        {invoice.approvedBy && (
          <div className="rounded-lg border bg-green-50 p-3">
            <p className="text-sm">
              <strong>Approved by:</strong> {invoice.approvedBy}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDate(invoice.approvedAt!)}
            </p>
          </div>
        )}

        {/* Rejection Info */}
        {invoice.rejectedBy && (
          <div className="rounded-lg border bg-red-50 p-3">
            <p className="text-sm">
              <strong>Rejected by:</strong> {invoice.rejectedBy}
            </p>
            <p className="text-sm text-red-700">{invoice.rejectionReason}</p>
            <p className="text-xs text-muted-foreground">
              {formatDate(invoice.rejectedAt!)}
            </p>
          </div>
        )}

        {/* Payment Info */}
        {invoice.paidDate && (
          <div className="rounded-lg border bg-blue-50 p-3">
            <p className="text-sm">
              <strong>Paid:</strong> {formatDate(invoice.paidDate)}
            </p>
            <p className="text-sm">Ref: {invoice.paymentReference}</p>
            {invoice.paymentMethod && (
              <p className="text-xs text-muted-foreground">
                Method: {invoice.paymentMethod}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 border-t pt-4">
          {invoice.status === 'draft' && (
            <>
              <Button size="sm" onClick={() => onAction('submit')}>
                <Send className="mr-2 h-4 w-4" />
                Submit for Approval
              </Button>
              <Button size="sm" variant="outline" onClick={() => onAction('edit')}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </>
          )}

          {invoice.status === 'pending' && (
            <>
              <Button size="sm" onClick={() => onAction('approve')}>
                <CheckCircle className="mr-2 h-4 w-4" />
                Approve
              </Button>
              <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="destructive">
                    <XCircle className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Reject Invoice</DialogTitle>
                    <DialogDescription>
                      Please provide a reason for rejecting this invoice.
                    </DialogDescription>
                  </DialogHeader>
                  <Textarea
                    placeholder="Enter rejection reason..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        onAction('reject', rejectReason)
                        setShowRejectDialog(false)
                      }}
                      disabled={!rejectReason}
                    >
                      Reject Invoice
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}

          {invoice.status === 'approved' && (
            <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <DollarSign className="mr-2 h-4 w-4" />
                  Mark as Paid
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Record Payment</DialogTitle>
                  <DialogDescription>
                    Enter payment details for this invoice.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Payment Reference *</Label>
                    <Input
                      placeholder="e.g., CHQ-001234 or TRF-567890"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowPayDialog(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      onAction('pay', { paymentReference })
                      setShowPayDialog(false)
                    }}
                    disabled={!paymentReference}
                  >
                    Confirm Payment
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {(invoice.status === 'draft' || invoice.status === 'cancelled') && (
            <Button size="sm" variant="destructive" onClick={() => onAction('delete')}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </div>
    </SheetContent>
  )
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function InvoiceManager({
  projectId,
  organizationId,
  className,
}: InvoiceManagerProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [summary, setSummary] = useState<InvoiceSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all')
  const [sortField, setSortField] = useState<'invoiceDate' | 'dueDate' | 'amount'>('invoiceDate')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const [invoicesData, summaryData] = await Promise.all([
        invoiceApi.getByProject(projectId),
        invoiceApi.getProjectSummary(projectId),
      ])

      setInvoices(invoicesData)
      setSummary(summaryData)
    } catch (err) {
      console.error('Error fetching invoices:', err)
      setError('Failed to load invoices')
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Filter and sort invoices
  const filteredInvoices = invoices
    .filter(inv => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        return (
          inv.invoiceNumber.toLowerCase().includes(query) ||
          inv.vendorName.toLowerCase().includes(query) ||
          inv.description.toLowerCase().includes(query)
        )
      }
      return true
    })
    .sort((a, b) => {
      const aVal = a[sortField]
      const bVal = b[sortField]
      const multiplier = sortOrder === 'asc' ? 1 : -1
      if (sortField === 'amount') {
        return ((aVal as number) - (bVal as number)) * multiplier
      }
      return (new Date(aVal as Date).getTime() - new Date(bVal as Date).getTime()) * multiplier
    })

  // Create invoice
  const handleCreate = async (data: Partial<Invoice>) => {
    try {
      setIsSubmitting(true)
      await invoiceApi.create({
        ...data,
        projectId,
        organizationId,
      })
      setShowCreateDialog(false)
      await fetchData()
    } catch (err) {
      console.error('Error creating invoice:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Update invoice
  const handleUpdate = async (data: Partial<Invoice>) => {
    if (!editingInvoice) return
    try {
      setIsSubmitting(true)
      await invoiceApi.update(editingInvoice.id, data)
      setEditingInvoice(null)
      await fetchData()
    } catch (err) {
      console.error('Error updating invoice:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle invoice actions
  const handleInvoiceAction = async (action: string, data?: any) => {
    if (!selectedInvoice) return
    
    try {
      switch (action) {
        case 'submit':
          await invoiceApi.submit(selectedInvoice.id)
          break
        case 'approve':
          await invoiceApi.approve(selectedInvoice.id)
          break
        case 'reject':
          await invoiceApi.reject(selectedInvoice.id, data)
          break
        case 'pay':
          await invoiceApi.pay(selectedInvoice.id, data)
          break
        case 'delete':
          await invoiceApi.delete(selectedInvoice.id)
          setSelectedInvoice(null)
          break
        case 'edit':
          setEditingInvoice(selectedInvoice)
          setSelectedInvoice(null)
          break
      }
      await fetchData()
      if (action !== 'edit' && action !== 'delete') {
        // Refresh the selected invoice
        const updated = await invoiceApi.getById(selectedInvoice.id)
        setSelectedInvoice(updated)
      }
    } catch (err) {
      console.error(`Error ${action} invoice:`, err)
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    )
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Summary Cards */}
      <SummaryCards summary={summary} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search invoices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-64"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as InvoiceStatus | 'all')}
          >
            <SelectTrigger className="w-36">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Invoice
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Invoice</DialogTitle>
              <DialogDescription>
                Add a new invoice to track payments.
              </DialogDescription>
            </DialogHeader>
            <InvoiceForm
              onSubmit={handleCreate}
              onCancel={() => setShowCreateDialog(false)}
              isSubmitting={isSubmitting}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-3"
                  onClick={() => {
                    if (sortField === 'amount') {
                      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
                    } else {
                      setSortField('amount')
                      setSortOrder('desc')
                    }
                  }}
                >
                  Amount
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-3"
                  onClick={() => {
                    if (sortField === 'dueDate') {
                      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
                    } else {
                      setSortField('dueDate')
                      setSortOrder('asc')
                    }
                  }}
                >
                  Due Date
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredInvoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p className="mt-2 text-muted-foreground">No invoices found</p>
                </TableCell>
              </TableRow>
            ) : (
              filteredInvoices.map((invoice) => {
                const statusConfig = STATUS_CONFIG[invoice.status]
                const StatusIcon = statusConfig.icon

                return (
                  <TableRow
                    key={invoice.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedInvoice(invoice)}
                  >
                    <TableCell className="font-medium">
                      {invoice.invoiceNumber}
                      {invoice.isOverdue && (
                        <Badge variant="destructive" className="ml-2">
                          Overdue
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{invoice.vendorName}</TableCell>
                    <TableCell>
                      {formatCurrency(invoice.amount, invoice.currency)}
                    </TableCell>
                    <TableCell className={cn(invoice.isOverdue && 'text-red-600')}>
                      {formatDate(invoice.dueDate)}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusConfig.color}>
                        <StatusIcon className="mr-1 h-3 w-3" />
                        {statusConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setSelectedInvoice(invoice)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          {invoice.status === 'draft' && (
                            <DropdownMenuItem onClick={() => setEditingInvoice(invoice)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Invoice Detail Sheet */}
      <Sheet open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
        {selectedInvoice && (
          <InvoiceDetail
            invoice={selectedInvoice}
            onClose={() => setSelectedInvoice(null)}
            onAction={handleInvoiceAction}
          />
        )}
      </Sheet>

      {/* Edit Invoice Dialog */}
      <Dialog open={!!editingInvoice} onOpenChange={() => setEditingInvoice(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Invoice</DialogTitle>
            <DialogDescription>
              Update invoice details.
            </DialogDescription>
          </DialogHeader>
          {editingInvoice && (
            <InvoiceForm
              invoice={editingInvoice}
              onSubmit={handleUpdate}
              onCancel={() => setEditingInvoice(null)}
              isSubmitting={isSubmitting}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default InvoiceManager
