'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Package, 
  Truck, 
  FileText, 
  Plus, 
  Search, 
  Filter,
  Building2,
  Clock,
  CheckCircle2,
  AlertCircle,
  MoreHorizontal,
  DollarSign,
  Eye,
  Edit,
  Trash2,
  Loader2,
  RefreshCw,
  Send,
  XCircle,
  CheckCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { authedFetch } from '@/lib/authed-fetch';
import { procurementSchema, validateForm } from '@/lib/schemas/pm.schemas';
import { FieldError, FormErrorSummary } from '@/components/ui/form-errors';
import { Pagination } from '@/components/ui/pagination-controls';

const fetch = authedFetch;

// Types
interface PurchaseOrderItem {
  id: string;
  description: string;
  quantity: number;
  unitOfMeasure: string;
  unitPrice: number;
  totalPrice: number;
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  projectId: string;
  projectName: string;
  vendorName: string;
  vendorContact: string | null;
  title: string;
  description: string | null;
  status: string;
  totalAmount: number;
  currency: string;
  requestedDeliveryDate: string | null;
  actualDeliveryDate: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  items: PurchaseOrderItem[];
  itemCount: number;
}

interface Project {
  id: string;
  name: string;
}

interface POFormData {
  projectId: string;
  vendorName: string;
  vendorContact: string;
  title: string;
  description: string;
  currency: string;
  requestedDeliveryDate: string;
  items: {
    description: string;
    quantity: string;
    unitOfMeasure: string;
    unitPrice: string;
  }[];
}

const defaultFormData: POFormData = {
  projectId: '',
  vendorName: '',
  vendorContact: '',
  title: '',
  description: '',
  currency: 'GHS',
  requestedDeliveryDate: '',
  items: [{ description: '', quantity: '1', unitOfMeasure: 'pcs', unitPrice: '0' }],
};

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: 'Draft', color: 'bg-zinc-700 text-zinc-300', icon: FileText },
  pending_approval: { label: 'Pending Approval', color: 'bg-yellow-900/50 text-yellow-400', icon: Clock },
  approved: { label: 'Approved', color: 'bg-blue-900/50 text-blue-400', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'bg-red-900/50 text-red-400', icon: XCircle },
  ordered: { label: 'Ordered', color: 'bg-purple-900/50 text-purple-400', icon: Truck },
  partially_delivered: { label: 'Partial Delivery', color: 'bg-orange-900/50 text-orange-400', icon: Package },
  delivered: { label: 'Delivered', color: 'bg-emerald-900/50 text-emerald-400', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'bg-red-900/50 text-red-400', icon: AlertCircle },
};

export default function ProcurementPage() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('orders');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  // Dialog states
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showViewSheet, setShowViewSheet] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [formData, setFormData] = useState<POFormData>(defaultFormData);
  const [formErrors, setFormErrors] = useState<Record<string, string[]> | null>(null);
  
  const { toast } = useToast();

  // Summary stats
  const stats = {
    totalOrders: purchaseOrders.length,
    pendingApproval: purchaseOrders.filter(po => po.status === 'pending_approval').length,
    totalValue: purchaseOrders.reduce((sum, po) => sum + (po.totalAmount || 0), 0),
    orderedCount: purchaseOrders.filter(po => ['ordered', 'partially_delivered', 'delivered'].includes(po.status)).length,
  };

  // Fetch purchase orders
  const fetchPurchaseOrders = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      params.append('pageSize', '20');
      params.append('page', String(page));

      const response = await fetch(`/api/procurement?${params}`);
      const result = await response.json();
      
      if (result.success) {
        setPurchaseOrders(result.data || []);
        const total = result.total || result.pagination?.total || (result.data || []).length;
        setTotalCount(total);
        setTotalPages(Math.ceil(total / 20));
      } else {
        const errMsg = typeof result.error === 'string' ? result.error : result.error?.message || 'Failed to fetch purchase orders';
        throw new Error(errMsg);
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
  }, [statusFilter, page, toast]);

  // Fetch projects
  const fetchProjects = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects?pageSize=100`);
      const result = await response.json();
      
      if (result.success) {
        setProjects(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    fetchPurchaseOrders();
  }, [fetchPurchaseOrders]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validation = validateForm(procurementSchema, formData);
    if (!validation.success) { setFormErrors(validation.errors!); return; }
    setFormErrors(null);

    try {
      setSubmitting(true);
      
      const payload = {
        projectId: formData.projectId,
        vendorName: formData.vendorName,
        vendorContact: formData.vendorContact || null,
        title: formData.title,
        description: formData.description || null,
        currency: formData.currency,
        requestedDeliveryDate: formData.requestedDeliveryDate || null,
        items: formData.items
          .filter(item => item.description.trim())
          .map(item => ({
            description: item.description,
            quantity: parseFloat(item.quantity) || 1,
            unitOfMeasure: item.unitOfMeasure,
            unitPrice: parseFloat(item.unitPrice) || 0,
          })),
      };

      const isEdit = showEditDialog && selectedPO;
      const url = isEdit 
        ? `/api/procurement/${selectedPO.id}`
        : `/api/procurement`;
      
      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Success',
          description: isEdit ? 'Purchase order updated successfully' : 'Purchase order created successfully',
        });
        setShowNewDialog(false);
        setShowEditDialog(false);
        setFormData(defaultFormData);
        setSelectedPO(null);
        fetchPurchaseOrders();
      } else {
        throw new Error(result.error || 'Failed to save purchase order');
      }
    } catch (error: any) {
      console.error('Error saving purchase order:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save purchase order',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Action handlers
  const handleStatusAction = async (po: PurchaseOrder, action: string) => {
    try {
      setSubmitting(true);
      let url = '';
      let method = 'POST';
      
      switch (action) {
        case 'submit':
          url = `/api/procurement/${po.id}/submit`;
          break;
        case 'approve':
          url = `/api/procurement/${po.id}/approve`;
          break;
        case 'reject':
          url = `/api/procurement/${po.id}/reject`;
          break;
        case 'order':
          url = `/api/procurement/${po.id}/order`;
          break;
        case 'cancel':
          url = `/api/procurement/${po.id}/cancel`;
          break;
        default:
          return;
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: '' }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Success',
          description: `Purchase order ${action}ed successfully`,
        });
        fetchPurchaseOrders();
      } else {
        throw new Error(result.error || `Failed to ${action} purchase order`);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || `Failed to ${action} purchase order`,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!selectedPO) return;

    try {
      setSubmitting(true);
      const response = await fetch(`/api/procurement/${selectedPO.id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Success',
          description: 'Purchase order deleted successfully',
        });
        setShowDeleteDialog(false);
        setSelectedPO(null);
        fetchPurchaseOrders();
      } else {
        throw new Error(result.error || 'Failed to delete purchase order');
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete purchase order',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Open edit dialog
  const openEditDialog = (po: PurchaseOrder) => {
    setSelectedPO(po);
    setFormData({
      projectId: po.projectId,
      vendorName: po.vendorName,
      vendorContact: po.vendorContact || '',
      title: po.title,
      description: po.description || '',
      currency: po.currency,
      requestedDeliveryDate: po.requestedDeliveryDate?.split('T')[0] || '',
      items: po.items?.length > 0 
        ? po.items.map(item => ({
            description: item.description,
            quantity: item.quantity.toString(),
            unitOfMeasure: item.unitOfMeasure,
            unitPrice: item.unitPrice.toString(),
          }))
        : [{ description: '', quantity: '1', unitOfMeasure: 'pcs', unitPrice: '0' }],
    });
    setShowEditDialog(true);
  };

  // Open view sheet
  const openViewSheet = (po: PurchaseOrder) => {
    setSelectedPO(po);
    setShowViewSheet(true);
  };

  // Open delete dialog
  const openDeleteDialog = (po: PurchaseOrder) => {
    setSelectedPO(po);
    setShowDeleteDialog(true);
  };

  // Open new dialog
  const openNewDialog = () => {
    setFormData(defaultFormData);
    setSelectedPO(null);
    setShowNewDialog(true);
  };

  // Add item row
  const addItemRow = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { description: '', quantity: '1', unitOfMeasure: 'pcs', unitPrice: '0' }],
    });
  };

  // Remove item row
  const removeItemRow = (index: number) => {
    if (formData.items.length > 1) {
      setFormData({
        ...formData,
        items: formData.items.filter((_, i) => i !== index),
      });
    }
  };

  // Update item
  const updateItem = (index: number, field: string, value: string) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData({ ...formData, items: newItems });
  };

  const filteredOrders = purchaseOrders.filter(po =>
    po.poNumber?.toLowerCase().includes(search.toLowerCase()) ||
    po.vendorName?.toLowerCase().includes(search.toLowerCase()) ||
    po.projectName?.toLowerCase().includes(search.toLowerCase()) ||
    po.title?.toLowerCase().includes(search.toLowerCase())
  );

  const calculateFormTotal = () => {
    return formData.items.reduce((sum, item) => {
      return sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
    }, 0);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Procurement</h1>
          <p className="text-zinc-400 text-sm mt-1">Manage purchase orders and material supplies.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="border-zinc-700" onClick={fetchPurchaseOrders}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={openNewDialog}>
            <Plus className="h-4 w-4 mr-2" /> New Purchase Order
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Total Orders</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.totalOrders}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Pending Approval</p>
                <p className="text-2xl font-bold text-yellow-400 mt-1">{stats.pendingApproval}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-yellow-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Total Value</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{formatCurrency(stats.totalValue, 'GHS')}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Ordered / Delivered</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.orderedCount}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Truck className="h-5 w-5 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
            <Input
              placeholder="Search orders..."
              className="pl-9 bg-zinc-900 border-zinc-800"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] bg-zinc-900 border-zinc-800">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="pending_approval">Pending Approval</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="ordered">Ordered</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto text-zinc-700 mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No Purchase Orders Found</h3>
            <p className="text-zinc-400 mb-4">
              {search || statusFilter !== 'all' 
                ? 'Try adjusting your filters' 
                : 'Create your first purchase order to get started'}
            </p>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={openNewDialog}>
              <Plus className="h-4 w-4 mr-2" /> New Purchase Order
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-zinc-800/50">
                <TableRow className="border-zinc-800 hover:bg-zinc-800/50">
                  <TableHead className="text-zinc-400">PO Number</TableHead>
                  <TableHead className="text-zinc-400">Vendor</TableHead>
                  <TableHead className="text-zinc-400">Project</TableHead>
                  <TableHead className="text-zinc-400 text-center">Items</TableHead>
                  <TableHead className="text-zinc-400 text-right">Amount</TableHead>
                  <TableHead className="text-zinc-400">Status</TableHead>
                  <TableHead className="text-zinc-400 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((po) => {
                  const status = statusConfig[po.status] || statusConfig['draft'];
                  const StatusIcon = status.icon;
                  return (
                    <TableRow key={po.id} className="border-zinc-800 hover:bg-zinc-800/30">
                      <TableCell className="font-mono text-sm text-amber-400">{po.poNumber}</TableCell>
                      <TableCell className="text-zinc-200">{po.vendorName}</TableCell>
                      <TableCell className="text-zinc-400 text-sm">{po.projectName}</TableCell>
                      <TableCell className="text-center text-zinc-300">{po.itemCount || po.items?.length || 0}</TableCell>
                      <TableCell className="text-right font-mono text-emerald-400">
                        {formatCurrency(po.totalAmount || 0, po.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${status.color} gap-1`}>
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                            <DropdownMenuItem 
                              className="text-zinc-300 focus:text-white"
                              onClick={() => openViewSheet(po)}
                            >
                              <Eye className="h-4 w-4 mr-2" /> View Details
                            </DropdownMenuItem>
                            {po.status === 'draft' && (
                              <>
                                <DropdownMenuItem 
                                  className="text-zinc-300 focus:text-white"
                                  onClick={() => openEditDialog(po)}
                                >
                                  <Edit className="h-4 w-4 mr-2" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="text-blue-400 focus:text-blue-300"
                                  onClick={() => handleStatusAction(po, 'submit')}
                                >
                                  <Send className="h-4 w-4 mr-2" /> Submit for Approval
                                </DropdownMenuItem>
                              </>
                            )}
                            {po.status === 'pending_approval' && (
                              <>
                                <DropdownMenuItem 
                                  className="text-emerald-400 focus:text-emerald-300"
                                  onClick={() => handleStatusAction(po, 'approve')}
                                >
                                  <CheckCircle className="h-4 w-4 mr-2" /> Approve
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="text-red-400 focus:text-red-300"
                                  onClick={() => handleStatusAction(po, 'reject')}
                                >
                                  <XCircle className="h-4 w-4 mr-2" /> Reject
                                </DropdownMenuItem>
                              </>
                            )}
                            {po.status === 'approved' && (
                              <DropdownMenuItem 
                                className="text-purple-400 focus:text-purple-300"
                                onClick={() => handleStatusAction(po, 'order')}
                              >
                                <Truck className="h-4 w-4 mr-2" /> Mark as Ordered
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator className="bg-zinc-800" />
                            {['draft', 'pending_approval', 'approved'].includes(po.status) && (
                              <DropdownMenuItem 
                                className="text-orange-400 focus:text-orange-300"
                                onClick={() => handleStatusAction(po, 'cancel')}
                              >
                                <AlertCircle className="h-4 w-4 mr-2" /> Cancel
                              </DropdownMenuItem>
                            )}
                            {po.status === 'draft' && (
                              <DropdownMenuItem 
                                className="text-red-400 focus:text-red-300"
                                onClick={() => openDeleteDialog(po)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Pagination page={page} totalPages={totalPages} total={totalCount} limit={20} onPageChange={setPage} />

      {/* New/Edit Dialog */}
      <Dialog open={showNewDialog || showEditDialog} onOpenChange={(open) => {
        if (!open) {
          setShowNewDialog(false);
          setShowEditDialog(false);
        }
      }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">
              {showEditDialog ? 'Edit Purchase Order' : 'Create Purchase Order'}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Fill in the details for your purchase order.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-300">Project *</Label>
                  <Select 
                    value={formData.projectId} 
                    onValueChange={(value) => setFormData({...formData, projectId: value})}
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300">Vendor Name *</Label>
                  <Input 
                    placeholder="Enter vendor name"
                    value={formData.vendorName}
                    onChange={(e) => setFormData({...formData, vendorName: e.target.value})}
                    className="bg-zinc-800 border-zinc-700" 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-300">Title *</Label>
                  <Input 
                    placeholder="PO Title (e.g., Cement Order - Phase 1)"
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    className="bg-zinc-800 border-zinc-700" 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300">Vendor Contact</Label>
                  <Input 
                    placeholder="Phone / Email"
                    value={formData.vendorContact}
                    onChange={(e) => setFormData({...formData, vendorContact: e.target.value})}
                    className="bg-zinc-800 border-zinc-700" 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-300">Currency</Label>
                  <Select 
                    value={formData.currency}
                    onValueChange={(value) => setFormData({...formData, currency: value})}
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
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
                <div className="space-y-2">
                  <Label className="text-zinc-300">Requested Delivery Date</Label>
                  <Input 
                    type="date"
                    value={formData.requestedDeliveryDate}
                    onChange={(e) => setFormData({...formData, requestedDeliveryDate: e.target.value})}
                    className="bg-zinc-800 border-zinc-700" 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Description</Label>
                <Textarea 
                  placeholder="Additional notes or description..."
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>

              {/* Line Items */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-zinc-300">Line Items</Label>
                  <Button type="button" variant="outline" size="sm" className="border-zinc-700" onClick={addItemRow}>
                    <Plus className="h-3 w-3 mr-1" /> Add Item
                  </Button>
                </div>
                <div className="space-y-2">
                  {formData.items.map((item, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      <Input 
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => updateItem(index, 'description', e.target.value)}
                        className="flex-1 bg-zinc-800 border-zinc-700" 
                      />
                      <Input 
                        type="number"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                        className="w-20 bg-zinc-800 border-zinc-700" 
                      />
                      <Select 
                        value={item.unitOfMeasure}
                        onValueChange={(value) => updateItem(index, 'unitOfMeasure', value)}
                      >
                        <SelectTrigger className="w-24 bg-zinc-800 border-zinc-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pcs">pcs</SelectItem>
                          <SelectItem value="bags">bags</SelectItem>
                          <SelectItem value="kg">kg</SelectItem>
                          <SelectItem value="tons">tons</SelectItem>
                          <SelectItem value="m3">m³</SelectItem>
                          <SelectItem value="sqm">sqm</SelectItem>
                          <SelectItem value="lm">lm</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input 
                        type="number"
                        placeholder="Unit Price"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(index, 'unitPrice', e.target.value)}
                        className="w-28 bg-zinc-800 border-zinc-700" 
                      />
                      <Button 
                        type="button"
                        variant="ghost" 
                        size="icon" 
                        className="text-red-400 hover:text-red-300"
                        onClick={() => removeItemRow(index)}
                        disabled={formData.items.length <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="text-right text-lg font-semibold text-emerald-400">
                  Total: {formatCurrency(calculateFormTotal(), formData.currency)}
                </div>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button 
                type="button"
                variant="outline" 
                className="border-zinc-700" 
                onClick={() => { setShowNewDialog(false); setShowEditDialog(false); }}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                className="bg-amber-600 hover:bg-amber-700 text-white"
                disabled={submitting}
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {showEditDialog ? 'Update Order' : 'Create Order'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Sheet */}
      <Sheet open={showViewSheet} onOpenChange={setShowViewSheet}>
        <SheetContent className="bg-zinc-900 border-zinc-800 w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-white flex items-center gap-2">
              <span className="font-mono text-amber-400">{selectedPO?.poNumber}</span>
            </SheetTitle>
            <SheetDescription className="text-zinc-400">
              {selectedPO?.title}
            </SheetDescription>
          </SheetHeader>
          {selectedPO && (
            <div className="mt-6 space-y-6">
              <div className="flex items-center gap-2">
                {(() => {
                  const status = statusConfig[selectedPO.status] || statusConfig['draft'];
                  const StatusIcon = status.icon;
                  return (
                    <Badge className={`${status.color} gap-1`}>
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </Badge>
                  );
                })()}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-zinc-500 text-xs uppercase">Project</Label>
                  <p className="text-white mt-1">{selectedPO.projectName}</p>
                </div>
                <div>
                  <Label className="text-zinc-500 text-xs uppercase">Vendor</Label>
                  <p className="text-white mt-1">{selectedPO.vendorName}</p>
                </div>
              </div>

              {selectedPO.description && (
                <div>
                  <Label className="text-zinc-500 text-xs uppercase">Description</Label>
                  <p className="text-zinc-300 mt-1">{selectedPO.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-zinc-500 text-xs uppercase">Created</Label>
                  <p className="text-white mt-1">{new Date(selectedPO.createdAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <Label className="text-zinc-500 text-xs uppercase">Requested Delivery</Label>
                  <p className="text-white mt-1">
                    {selectedPO.requestedDeliveryDate 
                      ? new Date(selectedPO.requestedDeliveryDate).toLocaleDateString() 
                      : '-'}
                  </p>
                </div>
              </div>

              {/* Line Items */}
              {selectedPO.items && selectedPO.items.length > 0 && (
                <div>
                  <Label className="text-zinc-500 text-xs uppercase mb-2 block">Line Items</Label>
                  <div className="space-y-2">
                    {selectedPO.items.map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                        <div>
                          <p className="text-white text-sm">{item.description}</p>
                          <p className="text-zinc-500 text-xs">
                            {item.quantity} {item.unitOfMeasure} × {formatCurrency(item.unitPrice, selectedPO.currency)}
                          </p>
                        </div>
                        <p className="text-emerald-400 font-mono">
                          {formatCurrency(item.totalPrice, selectedPO.currency)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-zinc-800">
                <div className="flex items-center justify-between">
                  <Label className="text-zinc-300 text-lg">Total Amount</Label>
                  <p className="text-2xl font-bold text-emerald-400 font-mono">
                    {formatCurrency(selectedPO.totalAmount || 0, selectedPO.currency)}
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-800 flex gap-2 flex-wrap">
                {selectedPO.status === 'draft' && (
                  <>
                    <Button 
                      variant="outline" 
                      className="flex-1 border-zinc-700"
                      onClick={() => { setShowViewSheet(false); openEditDialog(selectedPO); }}
                    >
                      <Edit className="h-4 w-4 mr-2" /> Edit
                    </Button>
                    <Button 
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                      onClick={() => { setShowViewSheet(false); handleStatusAction(selectedPO, 'submit'); }}
                    >
                      <Send className="h-4 w-4 mr-2" /> Submit
                    </Button>
                  </>
                )}
                {selectedPO.status === 'pending_approval' && (
                  <>
                    <Button 
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => { setShowViewSheet(false); handleStatusAction(selectedPO, 'approve'); }}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" /> Approve
                    </Button>
                    <Button 
                      variant="outline" 
                      className="flex-1 border-red-700 text-red-400"
                      onClick={() => { setShowViewSheet(false); handleStatusAction(selectedPO, 'reject'); }}
                    >
                      <XCircle className="h-4 w-4 mr-2" /> Reject
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-white">Delete Purchase Order</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Are you sure you want to delete {selectedPO?.poNumber}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button 
              variant="outline" 
              className="border-zinc-700" 
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button 
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDelete}
              disabled={submitting}
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
