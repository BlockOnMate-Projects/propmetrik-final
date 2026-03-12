'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ShoppingCart,
  Plus,
  Search,
  ArrowLeft,
  RefreshCw,
  Loader2,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Calendar,
  DollarSign,
  Building2,
  Clock,
  CheckCircle,
  XCircle,
  Send,
  Package,
  FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import ProjectSubnav from '@/components/dashboard/projects/ProjectSubnav';
import { authedFetch } from '@/lib/authed-fetch';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const fetch = authedFetch;

type POStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'ordered' | 'received' | 'cancelled';

interface LineItem {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unit: string;
}

interface PurchaseOrder {
  id: string;
  projectId: string;
  projectName?: string;
  poNumber: string;
  vendorName: string;
  vendorEmail?: string;
  status: POStatus;
  lineItems: LineItem[];
  totalAmount: number;
  notes?: string;
  submittedAt?: string;
  approvedAt?: string;
  createdByName?: string;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
}

const statusConfig: Record<POStatus, { label: string; color: string; icon: any }> = {
  draft: { label: 'Draft', color: 'bg-zinc-700 text-zinc-300', icon: FileText },
  submitted: { label: 'Submitted', color: 'bg-blue-900/50 text-blue-400', icon: Send },
  approved: { label: 'Approved', color: 'bg-emerald-900/50 text-emerald-400', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'bg-red-900/50 text-red-400', icon: XCircle },
  ordered: { label: 'Ordered', color: 'bg-purple-900/50 text-purple-400', icon: ShoppingCart },
  received: { label: 'Received', color: 'bg-emerald-900/50 text-emerald-400', icon: Package },
  cancelled: { label: 'Cancelled', color: 'bg-zinc-700 text-zinc-500', icon: XCircle }
};

export default function ProjectProcurementPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    vendorName: '',
    vendorEmail: '',
    notes: '',
    lineItems: [{ description: '', quantity: 1, unitPrice: 0, unit: 'ea' }] as LineItem[]
  });
  
  const { toast } = useToast();

  // Stats
  const stats = {
    total: orders.length,
    totalValue: orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0),
    pending: orders.filter(o => o.status === 'submitted').length,
    approved: orders.filter(o => o.status === 'approved' || o.status === 'ordered' || o.status === 'received').length,
  };

  // Fetch project
  const fetchProject = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/projects/${projectId}`);
      const result = await response.json();
      if (result.success) {
        setProject(result.data);
      }
    } catch (error) {
      console.error('Error fetching project:', error);
    }
  }, [projectId]);

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('projectId', projectId);
      if (statusFilter && statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      params.append('pageSize', '100');

      const response = await fetch(`${API_BASE}/procurement?${params}`);
      const result = await response.json();
      
      if (result.success) {
        setOrders(result.data || []);
      } else {
        throw new Error(result.error || 'Failed to fetch purchase orders');
      }
    } catch (error: any) {
      console.error('Error fetching purchase orders:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch purchase orders',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter, toast]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Reset form
  const resetForm = () => {
    setFormData({
      vendorName: '',
      vendorEmail: '',
      notes: '',
      lineItems: [{ description: '', quantity: 1, unitPrice: 0, unit: 'ea' }]
    });
  };

  // Calculate total
  const calculateTotal = (items: LineItem[]) => {
    return items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  };

  // Handle line item changes
  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    const newItems = [...formData.lineItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData({ ...formData, lineItems: newItems });
  };

  const addLineItem = () => {
    setFormData({
      ...formData,
      lineItems: [...formData.lineItems, { description: '', quantity: 1, unitPrice: 0, unit: 'ea' }]
    });
  };

  const removeLineItem = (index: number) => {
    if (formData.lineItems.length > 1) {
      setFormData({
        ...formData,
        lineItems: formData.lineItems.filter((_, i) => i !== index)
      });
    }
  };

  // Handle create
  const handleCreate = async () => {
    if (!formData.vendorName.trim()) {
      toast({ title: 'Error', description: 'Vendor name is required', variant: 'destructive' });
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(`${API_BASE}/procurement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          vendorName: formData.vendorName,
          vendorEmail: formData.vendorEmail,
          notes: formData.notes,
          items: formData.lineItems,
          totalAmount: calculateTotal(formData.lineItems)
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({ title: 'Success', description: 'Purchase order created' });
        setShowCreateDialog(false);
        resetForm();
        fetchOrders();
      } else {
        throw new Error(result.error || 'Failed to create purchase order');
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle update
  const handleUpdate = async () => {
    if (!selectedOrder) return;

    try {
      setSubmitting(true);
      const response = await fetch(`${API_BASE}/procurement/${selectedOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorName: formData.vendorName,
          vendorEmail: formData.vendorEmail,
          notes: formData.notes,
          items: formData.lineItems,
          totalAmount: calculateTotal(formData.lineItems)
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({ title: 'Success', description: 'Purchase order updated' });
        setShowEditDialog(false);
        setSelectedOrder(null);
        fetchOrders();
      } else {
        throw new Error(result.error || 'Failed to update purchase order');
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!selectedOrder) return;

    try {
      setSubmitting(true);
      const response = await fetch(`${API_BASE}/procurement/${selectedOrder.id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        toast({ title: 'Success', description: 'Purchase order deleted' });
        setShowDeleteDialog(false);
        setSelectedOrder(null);
        fetchOrders();
      } else {
        throw new Error(result.error || 'Failed to delete purchase order');
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle status change
  const handleStatusChange = async (order: PurchaseOrder, action: string) => {
    try {
      setSubmitting(true);
      const response = await fetch(`${API_BASE}/procurement/purchase-orders/${order.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();

      if (result.success) {
        toast({ title: 'Success', description: `Purchase order ${action}ed` });
        fetchOrders();
      } else {
        throw new Error(result.error || `Failed to ${action} purchase order`);
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const openEditDialog = (order: PurchaseOrder) => {
    setSelectedOrder(order);
    setFormData({
      vendorName: order.vendorName,
      vendorEmail: order.vendorEmail || '',
      notes: order.notes || '',
      lineItems: order.lineItems?.length > 0 ? order.lineItems : [{ description: '', quantity: 1, unitPrice: 0, unit: 'ea' }]
    });
    setShowEditDialog(true);
  };

  const openViewSheet = (order: PurchaseOrder) => {
    setSelectedOrder(order);
    setShowDetailSheet(true);
  };

  const openDeleteDialog = (order: PurchaseOrder) => {
    setSelectedOrder(order);
    setShowDeleteDialog(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const filteredOrders = orders.filter(order =>
    order.poNumber?.toLowerCase().includes(search.toLowerCase()) ||
    order.vendorName?.toLowerCase().includes(search.toLowerCase())
  );

  const OrderForm = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-zinc-400">Vendor Name *</Label>
          <Input
            className="bg-zinc-800 border-zinc-700 mt-1"
            placeholder="Vendor name..."
            value={formData.vendorName}
            onChange={(e) => setFormData({ ...formData, vendorName: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-zinc-400">Vendor Email</Label>
          <Input
            type="email"
            className="bg-zinc-800 border-zinc-700 mt-1"
            placeholder="vendor@example.com"
            value={formData.vendorEmail}
            onChange={(e) => setFormData({ ...formData, vendorEmail: e.target.value })}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-zinc-400">Line Items</Label>
          <Button type="button" variant="outline" size="sm" className="border-zinc-700" onClick={addLineItem}>
            <Plus className="h-3 w-3 mr-1" /> Add Item
          </Button>
        </div>
        <div className="space-y-2">
          {formData.lineItems.map((item, index) => (
            <div key={index} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-5">
                <Input
                  className="bg-zinc-800 border-zinc-700"
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <Input
                  type="number"
                  className="bg-zinc-800 border-zinc-700"
                  placeholder="Qty"
                  value={item.quantity}
                  onChange={(e) => updateLineItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="col-span-2">
                <Input
                  className="bg-zinc-800 border-zinc-700"
                  placeholder="Unit"
                  value={item.unit}
                  onChange={(e) => updateLineItem(index, 'unit', e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <Input
                  type="number"
                  step="0.01"
                  className="bg-zinc-800 border-zinc-700"
                  placeholder="Price"
                  value={item.unitPrice}
                  onChange={(e) => updateLineItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="col-span-1">
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-red-400 hover:text-red-300"
                  onClick={() => removeLineItem(index)}
                  disabled={formData.lineItems.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="text-right mt-2">
          <span className="text-zinc-400">Total: </span>
          <span className="text-white font-semibold">{formatCurrency(calculateTotal(formData.lineItems))}</span>
        </div>
      </div>

      <div>
        <Label className="text-zinc-400">Notes</Label>
        <Textarea
          className="bg-zinc-800 border-zinc-700 mt-1"
          rows={2}
          placeholder="Additional notes..."
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Procurement</h1>
            {project && (
              <p className="text-zinc-400 text-sm mt-1">{project.name}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="border-zinc-700" onClick={fetchOrders}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button 
            className="bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => { resetForm(); setShowCreateDialog(true); }}
          >
            <Plus className="h-4 w-4 mr-2" /> New PO
          </Button>
        </div>
      </div>

      <ProjectSubnav projectId={projectId} />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Total POs</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.total}</p>
              </div>
              <ShoppingCart className="h-5 w-5 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Total Value</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{formatCurrency(stats.totalValue)}</p>
              </div>
              <DollarSign className="h-5 w-5 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Pending</p>
                <p className="text-2xl font-bold text-yellow-400 mt-1">{stats.pending}</p>
              </div>
              <Clock className="h-5 w-5 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Approved</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{stats.approved}</p>
              </div>
              <CheckCircle className="h-5 w-5 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search POs..."
            className="pl-9 bg-zinc-900 border-zinc-800"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] bg-zinc-900 border-zinc-800">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="ordered">Ordered</SelectItem>
            <SelectItem value="received">Received</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="py-12 text-center">
            <ShoppingCart className="h-12 w-12 mx-auto text-zinc-700 mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No Purchase Orders</h3>
            <p className="text-zinc-400 mb-4">Create a new purchase order to get started</p>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => { resetForm(); setShowCreateDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" /> New PO
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const status = statusConfig[order.status] || statusConfig['draft'];
            const StatusIcon = status.icon;

            return (
              <Card key={order.id} className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-medium text-white">{order.poNumber}</h3>
                        <Badge className={status.color}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {status.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-zinc-400 mb-2">{order.vendorName}</p>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-emerald-400 font-medium">
                          {formatCurrency(order.totalAmount || 0)}
                        </span>
                        <span className="text-zinc-500">
                          {order.lineItems?.length || 0} items
                        </span>
                        <span className="text-zinc-500">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                        <DropdownMenuItem onClick={() => openViewSheet(order)}>
                          <Eye className="h-4 w-4 mr-2" /> View Details
                        </DropdownMenuItem>
                        {order.status === 'draft' && (
                          <DropdownMenuItem onClick={() => openEditDialog(order)}>
                            <Pencil className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator className="bg-zinc-800" />
                        {order.status === 'draft' && (
                          <DropdownMenuItem onClick={() => handleStatusChange(order, 'submit')}>
                            <Send className="h-4 w-4 mr-2" /> Submit for Approval
                          </DropdownMenuItem>
                        )}
                        {order.status === 'submitted' && (
                          <>
                            <DropdownMenuItem className="text-emerald-400" onClick={() => handleStatusChange(order, 'approve')}>
                              <CheckCircle className="h-4 w-4 mr-2" /> Approve
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-red-400" onClick={() => handleStatusChange(order, 'reject')}>
                              <XCircle className="h-4 w-4 mr-2" /> Reject
                            </DropdownMenuItem>
                          </>
                        )}
                        {order.status === 'approved' && (
                          <DropdownMenuItem onClick={() => handleStatusChange(order, 'order')}>
                            <ShoppingCart className="h-4 w-4 mr-2" /> Mark as Ordered
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator className="bg-zinc-800" />
                        <DropdownMenuItem className="text-red-400" onClick={() => openDeleteDialog(order)}>
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">New Purchase Order</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Create a new purchase order.
            </DialogDescription>
          </DialogHeader>
          <OrderForm />
          <DialogFooter className="mt-4">
            <Button variant="outline" className="border-zinc-700" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={handleCreate} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create PO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Purchase Order</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Update purchase order details.
            </DialogDescription>
          </DialogHeader>
          <OrderForm />
          <DialogFooter className="mt-4">
            <Button variant="outline" className="border-zinc-700" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={handleUpdate} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-white">Delete Purchase Order</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Are you sure you want to delete this purchase order? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" className="border-zinc-700" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleDelete} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Sheet */}
      <Sheet open={showDetailSheet} onOpenChange={setShowDetailSheet}>
        <SheetContent className="bg-zinc-900 border-zinc-800 w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-white">{selectedOrder?.poNumber}</SheetTitle>
            <SheetDescription className="text-zinc-400">
              Purchase order details
            </SheetDescription>
          </SheetHeader>
          {selectedOrder && (
            <div className="mt-6 space-y-6">
              <Badge className={statusConfig[selectedOrder.status]?.color}>
                {statusConfig[selectedOrder.status]?.label}
              </Badge>

              <div>
                <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Vendor</h4>
                <p className="text-white">{selectedOrder.vendorName}</p>
                {selectedOrder.vendorEmail && (
                  <p className="text-zinc-400 text-sm">{selectedOrder.vendorEmail}</p>
                )}
              </div>

              <div>
                <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Line Items</h4>
                <div className="space-y-2">
                  {selectedOrder.lineItems?.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm p-2 bg-zinc-800 rounded">
                      <span className="text-zinc-300">{item.description}</span>
                      <span className="text-white">{item.quantity} x {formatCurrency(item.unitPrice)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-3 pt-3 border-t border-zinc-700">
                  <span className="text-zinc-400 font-medium">Total</span>
                  <span className="text-emerald-400 font-semibold">{formatCurrency(selectedOrder.totalAmount || 0)}</span>
                </div>
              </div>

              {selectedOrder.notes && (
                <div>
                  <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Notes</h4>
                  <p className="text-zinc-300">{selectedOrder.notes}</p>
                </div>
              )}

              <div>
                <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Created</h4>
                <p className="text-white">{new Date(selectedOrder.createdAt).toLocaleDateString()}</p>
              </div>

              {selectedOrder.status === 'draft' && (
                <div className="flex gap-2 pt-4 border-t border-zinc-800">
                  <Button className="flex-1 bg-amber-600 hover:bg-amber-700" onClick={() => {
                    setShowDetailSheet(false);
                    openEditDialog(selectedOrder);
                  }}>
                    <Pencil className="h-4 w-4 mr-2" /> Edit
                  </Button>
                  <Button variant="outline" className="flex-1 border-zinc-700" onClick={() => {
                    setShowDetailSheet(false);
                    handleStatusChange(selectedOrder, 'submit');
                  }}>
                    <Send className="h-4 w-4 mr-2" /> Submit
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
