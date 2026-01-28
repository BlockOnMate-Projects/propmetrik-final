'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { 
  FileEdit, 
  Plus, 
  Search, 
  Filter,
  Calendar,
  Clock,
  User,
  DollarSign,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  Edit,
  MoreHorizontal,
  Send,
  PenTool,
  FileCheck,
  ArrowUpRight,
  ChevronRight,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from 'sonner';
import { format } from 'date-fns';
import ProjectSubnav from '@/components/pm-portal/ProjectSubnav';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Types
type ChangeOrderStatus = 
  | 'draft'
  | 'pending_review'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'void';

type ChangeOrderReason = 
  | 'scope_change'
  | 'design_error'
  | 'unforeseen_conditions'
  | 'owner_request'
  | 'regulatory_requirement'
  | 'value_engineering'
  | 'schedule_acceleration'
  | 'material_substitution'
  | 'force_majeure'
  | 'other';

type ChangeOrderType = 'additive' | 'deductive' | 'no_cost' | 'time_extension';

type ItemType = 'labor' | 'material' | 'equipment' | 'subcontractor' | 'overhead' | 'fee' | 'other';

interface ChangeOrderItem {
  id?: string;
  description: string;
  item_type: ItemType;
  quantity: number;
  unit: string;
  unit_cost: number;
  markup_percentage: number;
  total_cost?: number;
  cost_code?: string;
}

interface ChangeOrderSignature {
  id: string;
  signatory_role: string;
  signatory_name?: string;
  is_required: boolean;
  signed: boolean;
  signed_at?: string;
}

interface ChangeOrder {
  id: string;
  co_number: string;
  title: string;
  description: string;
  reason: ChangeOrderReason;
  reason_details?: string;
  co_type: ChangeOrderType;
  status: ChangeOrderStatus;
  original_contract_amount: number;
  previous_changes_amount: number;
  this_change_amount: number;
  new_contract_amount: number;
  currency: string;
  schedule_impact_days: number;
  project_id: string;
  project_name?: string;
  submitted_by_name?: string;
  approved_by_name?: string;
  pending_signatures?: number;
  items?: ChangeOrderItem[];
  signatures?: ChangeOrderSignature[];
  created_at: string;
  submitted_at?: string;
  approved_at?: string;
}

interface ChangeOrderStats {
  total: number;
  by_status: Record<ChangeOrderStatus, number>;
  by_type: Record<ChangeOrderType, number>;
  total_additions: number;
  total_deductions: number;
  net_change: number;
  pending_approval: number;
  total_schedule_impact_days: number;
}

const statusColors: Record<ChangeOrderStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending_review: 'bg-blue-100 text-blue-700',
  pending_approval: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  executed: 'bg-purple-100 text-purple-700',
  void: 'bg-slate-100 text-slate-700'
};

const typeColors: Record<ChangeOrderType, string> = {
  additive: 'bg-green-100 text-green-700',
  deductive: 'bg-red-100 text-red-700',
  no_cost: 'bg-gray-100 text-gray-700',
  time_extension: 'bg-blue-100 text-blue-700'
};

const reasonLabels: Record<ChangeOrderReason, string> = {
  scope_change: 'Scope Change',
  design_error: 'Design Error',
  unforeseen_conditions: 'Unforeseen Conditions',
  owner_request: 'Owner Request',
  regulatory_requirement: 'Regulatory Requirement',
  value_engineering: 'Value Engineering',
  schedule_acceleration: 'Schedule Acceleration',
  material_substitution: 'Material Substitution',
  force_majeure: 'Force Majeure',
  other: 'Other'
};

const itemTypeLabels: Record<ItemType, string> = {
  labor: 'Labor',
  material: 'Material',
  equipment: 'Equipment',
  subcontractor: 'Subcontractor',
  overhead: 'Overhead',
  fee: 'Fee',
  other: 'Other'
};

export default function ChangeOrdersPage() {
  const params = useParams();
  const projectId = (params as { id?: string }).id;
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [stats, setStats] = useState<ChangeOrderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ChangeOrderStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<ChangeOrderType | 'all'>('all');
  const [selectedCO, setSelectedCO] = useState<ChangeOrder | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  // Fetch Change Orders from API
  const fetchChangeOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (typeFilter !== 'all') params.append('coType', typeFilter);
      if (searchQuery) params.append('search', searchQuery);
      if (projectId) params.append('projectId', projectId);
      
      const response = await fetch(`${API_BASE}/api/change-orders?${params.toString()}`);
      const data = await response.json();
      
      if (data.success) {
        setChangeOrders(data.data);
      } else {
        toast.error('Failed to fetch change orders');
      }
    } catch (error) {
      console.error('Error fetching change orders:', error);
      toast.error('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, searchQuery, projectId]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(
        projectId
          ? `${API_BASE}/api/change-orders/stats/${projectId}`
          : `${API_BASE}/api/change-orders/stats/all`
      );
      const data = await response.json();
      
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Error fetching change order stats:', error);
    }
  }, [projectId]);

  useEffect(() => {
    fetchChangeOrders();
    fetchStats();
  }, [fetchChangeOrders, fetchStats]);

  // View Change Order details
  const handleViewCO = async (co: ChangeOrder) => {
    try {
      const response = await fetch(`${API_BASE}/api/change-orders/${co.id}`);
      const data = await response.json();
      
      if (data.success) {
        setSelectedCO(data.data);
        setIsDetailDialogOpen(true);
      } else {
        toast.error('Failed to load change order details');
      }
    } catch (error) {
      console.error('Error fetching CO details:', error);
      toast.error('Failed to load change order details');
    }
  };

  // Format currency
  const formatCurrency = (amount: number, currency = 'GHS') => {
    return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Get filtered change orders based on active tab
  const getFilteredCOs = () => {
    let filtered = changeOrders;
    
    switch (activeTab) {
      case 'pending':
        filtered = changeOrders.filter(co => ['pending_review', 'pending_approval'].includes(co.status));
        break;
      case 'approved':
        filtered = changeOrders.filter(co => co.status === 'approved');
        break;
      case 'executed':
        filtered = changeOrders.filter(co => co.status === 'executed');
        break;
      case 'rejected':
        filtered = changeOrders.filter(co => co.status === 'rejected');
        break;
    }
    
    return filtered;
  };

  const filteredCOs = getFilteredCOs();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileEdit className="h-7 w-7 text-purple-600" />
            Change Orders
          </h1>
          <p className="text-gray-500 mt-1">Manage contract changes and cost adjustments</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Change Order
        </Button>
      </div>

      {projectId && <ProjectSubnav projectId={projectId} />}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total COs</p>
                <p className="text-2xl font-bold">{stats?.total || changeOrders.length}</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-full">
                <FileEdit className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Additions</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(stats?.total_additions || 0)}
                </p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Deductions</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency(stats?.total_deductions || 0)}
                </p>
              </div>
              <div className="p-3 bg-red-100 rounded-full">
                <TrendingDown className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Net Change</p>
                <p className={`text-2xl font-bold ${(stats?.net_change || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(stats?.net_change || 0)}
                </p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <DollarSign className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pending Approval</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {stats?.pending_approval || changeOrders.filter(co => co.status === 'pending_approval').length}
                </p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-full">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input 
            placeholder="Search by CO number, title, or description..." 
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ChangeOrderStatus | 'all')}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="pending_review">Pending Review</SelectItem>
            <SelectItem value="pending_approval">Pending Approval</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="executed">Executed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ChangeOrderType | 'all')}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="additive">Additive</SelectItem>
            <SelectItem value="deductive">Deductive</SelectItem>
            <SelectItem value="no_cost">No Cost</SelectItem>
            <SelectItem value="time_extension">Time Extension</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabs and CO List */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All ({changeOrders.length})</TabsTrigger>
          <TabsTrigger value="pending" className="text-yellow-600">
            Pending ({changeOrders.filter(co => ['pending_review', 'pending_approval'].includes(co.status)).length})
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approved ({changeOrders.filter(co => co.status === 'approved').length})
          </TabsTrigger>
          <TabsTrigger value="executed">
            Executed ({changeOrders.filter(co => co.status === 'executed').length})
          </TabsTrigger>
          <TabsTrigger value="rejected" className="text-red-600">
            Rejected ({changeOrders.filter(co => co.status === 'rejected').length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
              <p className="text-gray-500 mt-4">Loading change orders...</p>
            </div>
          ) : filteredCOs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileEdit className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900">No Change Orders Found</h3>
                <p className="text-gray-500 mt-2">
                  {searchQuery ? 'Try adjusting your search or filters' : 'Create your first change order to get started'}
                </p>
                <Button onClick={() => setIsCreateDialogOpen(true)} className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  New Change Order
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredCOs.map((co) => (
                <Card 
                  key={co.id} 
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleViewCO(co)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="font-mono text-sm font-medium text-purple-600">
                            {co.co_number}
                          </span>
                          <Badge className={statusColors[co.status]}>
                            {co.status.replace('_', ' ')}
                          </Badge>
                          <Badge className={typeColors[co.co_type]}>
                            {co.co_type === 'additive' && <TrendingUp className="h-3 w-3 mr-1" />}
                            {co.co_type === 'deductive' && <TrendingDown className="h-3 w-3 mr-1" />}
                            {co.co_type}
                          </Badge>
                          {co.pending_signatures && co.pending_signatures > 0 && (
                            <Badge variant="outline" className="gap-1">
                              <PenTool className="h-3 w-3" />
                              {co.pending_signatures} signatures pending
                            </Badge>
                          )}
                        </div>
                        
                        <h3 className="font-medium text-gray-900 mb-1">{co.title}</h3>
                        <p className="text-sm text-gray-500 line-clamp-2">{co.description}</p>
                        
                        <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                          <span className="font-medium text-gray-900">
                            {co.co_type === 'deductive' ? '-' : '+'}{formatCurrency(Math.abs(co.this_change_amount), co.currency)}
                          </span>
                          {co.schedule_impact_days > 0 && (
                            <span className="flex items-center gap-1 text-orange-600">
                              <Clock className="h-3 w-3" />
                              +{co.schedule_impact_days} days
                            </span>
                          )}
                          {co.project_name && (
                            <span className="flex items-center gap-1">
                              <ArrowUpRight className="h-3 w-3" />
                              {co.project_name}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {co.submitted_by_name || 'Draft'}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={(e) => {
                          e.stopPropagation();
                          handleViewCO(co);
                        }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              handleViewCO(co);
                            }}>
                              <Eye className="h-4 w-4 mr-2" /> View Details
                            </DropdownMenuItem>
                            {co.status === 'draft' && (
                              <>
                                <DropdownMenuItem>
                                  <Edit className="h-4 w-4 mr-2" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <Send className="h-4 w-4 mr-2" /> Submit for Review
                                </DropdownMenuItem>
                              </>
                            )}
                            {co.status === 'pending_approval' && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-green-600">
                                  <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-red-600">
                                  <XCircle className="h-4 w-4 mr-2" /> Reject
                                </DropdownMenuItem>
                              </>
                            )}
                            {co.status === 'approved' && (
                              <DropdownMenuItem className="text-purple-600">
                                <FileCheck className="h-4 w-4 mr-2" /> Execute
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Change Order Dialog */}
      <CreateChangeOrderDialog 
        open={isCreateDialogOpen} 
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={() => {
          fetchChangeOrders();
          fetchStats();
        }}
        projectId={projectId}
      />

      {/* Change Order Detail Dialog */}
      <ChangeOrderDetailDialog 
        changeOrder={selectedCO}
        open={isDetailDialogOpen}
        onOpenChange={setIsDetailDialogOpen}
        onUpdate={() => {
          fetchChangeOrders();
          fetchStats();
        }}
      />
    </div>
  );
}

// Create Change Order Dialog Component
function CreateChangeOrderDialog({ 
  open, 
  onOpenChange, 
  onSuccess,
  projectId
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  projectId?: string;
}) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    reason: 'scope_change' as ChangeOrderReason,
    reason_details: '',
    original_contract_amount: 0,
    schedule_impact_days: 0
  });
  const [items, setItems] = useState<ChangeOrderItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const addItem = () => {
    setItems([...items, {
      description: '',
      item_type: 'material',
      quantity: 1,
      unit: 'each',
      unit_cost: 0,
      markup_percentage: 0
    }]);
  };

  const updateItem = (index: number, field: keyof ChangeOrderItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => {
      const itemTotal = item.quantity * item.unit_cost * (1 + (item.markup_percentage || 0) / 100);
      return sum + itemTotal;
    }, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch(`${API_BASE}/api/change-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          project_id: projectId || 'default-project',
          organization_id: 'default-org', // Should come from context
          items
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success('Change Order created successfully');
        onOpenChange(false);
        onSuccess();
        // Reset form
        setFormData({
          title: '',
          description: '',
          reason: 'scope_change',
          reason_details: '',
          original_contract_amount: 0,
          schedule_impact_days: 0
        });
        setItems([]);
      } else {
        toast.error(data.message || 'Failed to create change order');
      }
    } catch (error) {
      console.error('Error creating change order:', error);
      toast.error('Failed to create change order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Change Order</DialogTitle>
          <DialogDescription>
            Document a change to the contract scope, cost, or schedule.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Title *</Label>
              <Input 
                id="title" 
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                placeholder="Brief description of the change"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="description">Description *</Label>
              <Textarea 
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="Detailed description of the change and its impact..."
                rows={3}
                required
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="reason">Reason for Change *</Label>
                <Select 
                  value={formData.reason} 
                  onValueChange={(v) => setFormData({...formData, reason: v as ChangeOrderReason})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(reasonLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="schedule_impact">Schedule Impact (days)</Label>
                <Input 
                  id="schedule_impact" 
                  type="number"
                  value={formData.schedule_impact_days}
                  onChange={(e) => setFormData({...formData, schedule_impact_days: parseInt(e.target.value) || 0})}
                  min={0}
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="reason_details">Additional Details</Label>
              <Textarea 
                id="reason_details"
                value={formData.reason_details}
                onChange={(e) => setFormData({...formData, reason_details: e.target.value})}
                placeholder="Any additional context or justification..."
                rows={2}
              />
            </div>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <Label>Line Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>
            
            {items.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="w-20">Qty</TableHead>
                      <TableHead className="w-20">Unit</TableHead>
                      <TableHead className="w-28">Unit Cost</TableHead>
                      <TableHead className="w-20">Markup %</TableHead>
                      <TableHead className="w-28">Total</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Input 
                            value={item.description}
                            onChange={(e) => updateItem(index, 'description', e.target.value)}
                            placeholder="Item description"
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Select 
                            value={item.item_type} 
                            onValueChange={(v) => updateItem(index, 'item_type', v)}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(itemTypeLabels).map(([value, label]) => (
                                <SelectItem key={value} value={value}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input 
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                            className="h-8"
                            min={0}
                          />
                        </TableCell>
                        <TableCell>
                          <Input 
                            value={item.unit}
                            onChange={(e) => updateItem(index, 'unit', e.target.value)}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input 
                            type="number"
                            value={item.unit_cost}
                            onChange={(e) => updateItem(index, 'unit_cost', parseFloat(e.target.value) || 0)}
                            className="h-8"
                            min={0}
                            step={0.01}
                          />
                        </TableCell>
                        <TableCell>
                          <Input 
                            type="number"
                            value={item.markup_percentage}
                            onChange={(e) => updateItem(index, 'markup_percentage', parseFloat(e.target.value) || 0)}
                            className="h-8"
                            min={0}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          GHS {(item.quantity * item.unit_cost * (1 + (item.markup_percentage || 0) / 100)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => removeItem(index)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="bg-gray-50 px-4 py-3 flex justify-end">
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Total Change Amount</p>
                    <p className="text-xl font-bold">GHS {calculateTotal().toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="border border-dashed rounded-lg p-8 text-center text-gray-500">
                <DollarSign className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p>No line items added yet</p>
                <Button type="button" variant="link" onClick={addItem}>
                  Add your first item
                </Button>
              </div>
            )}
          </div>
          
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Change Order'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Change Order Detail Dialog Component
function ChangeOrderDetailDialog({ 
  changeOrder, 
  open, 
  onOpenChange,
  onUpdate
}: { 
  changeOrder: ChangeOrder | null; 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}) {
  const [actionLoading, setActionLoading] = useState(false);

  if (!changeOrder) return null;

  const handleAction = async (action: string, body?: any) => {
    setActionLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/change-orders/${changeOrder.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success(data.message || `Action completed successfully`);
        onUpdate();
        onOpenChange(false);
      } else {
        toast.error(data.message || 'Action failed');
      }
    } catch (error) {
      console.error('Error performing action:', error);
      toast.error('Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `${changeOrder.currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="font-mono text-lg font-medium text-purple-600">
              {changeOrder.co_number}
            </span>
            <Badge className={statusColors[changeOrder.status]}>
              {changeOrder.status.replace('_', ' ')}
            </Badge>
            <Badge className={typeColors[changeOrder.co_type]}>
              {changeOrder.co_type}
            </Badge>
          </div>
          <DialogTitle className="text-xl mt-2">{changeOrder.title}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Financial Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-gray-500">Original Contract</p>
                <p className="text-lg font-bold">{formatCurrency(changeOrder.original_contract_amount)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-gray-500">Previous Changes</p>
                <p className="text-lg font-bold">{formatCurrency(changeOrder.previous_changes_amount)}</p>
              </CardContent>
            </Card>
            <Card className={changeOrder.this_change_amount >= 0 ? 'bg-green-50' : 'bg-red-50'}>
              <CardContent className="pt-4">
                <p className="text-xs text-gray-500">This Change</p>
                <p className={`text-lg font-bold ${changeOrder.this_change_amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {changeOrder.this_change_amount >= 0 ? '+' : ''}{formatCurrency(changeOrder.this_change_amount)}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-blue-50">
              <CardContent className="pt-4">
                <p className="text-xs text-gray-500">New Contract Total</p>
                <p className="text-lg font-bold text-blue-600">{formatCurrency(changeOrder.new_contract_amount)}</p>
              </CardContent>
            </Card>
          </div>
          
          {/* Details */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Reason</p>
              <p className="font-medium">{reasonLabels[changeOrder.reason]}</p>
            </div>
            <div>
              <p className="text-gray-500">Schedule Impact</p>
              <p className="font-medium">{changeOrder.schedule_impact_days} days</p>
            </div>
            <div>
              <p className="text-gray-500">Submitted By</p>
              <p className="font-medium">{changeOrder.submitted_by_name || '—'}</p>
            </div>
            <div>
              <p className="text-gray-500">Approved By</p>
              <p className="font-medium">{changeOrder.approved_by_name || '—'}</p>
            </div>
          </div>
          
          {/* Description */}
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Description</h4>
            <div className="bg-gray-50 rounded-lg p-4 text-gray-700 whitespace-pre-wrap">
              {changeOrder.description}
            </div>
          </div>
          
          {/* Line Items */}
          {changeOrder.items && changeOrder.items.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Line Items</h4>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead className="text-right">Markup</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {changeOrder.items.map((item, index) => (
                      <TableRow key={item.id || index}>
                        <TableCell>{item.description}</TableCell>
                        <TableCell>{itemTypeLabels[item.item_type]}</TableCell>
                        <TableCell className="text-right">{item.quantity} {item.unit}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.unit_cost)}</TableCell>
                        <TableCell className="text-right">{item.markup_percentage}%</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(item.total_cost || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          
          {/* Signatures */}
          {changeOrder.signatures && changeOrder.signatures.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Signatures</h4>
              <div className="space-y-2">
                {changeOrder.signatures.map((sig) => (
                  <div 
                    key={sig.id} 
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      sig.signed ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {sig.signed ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                      )}
                      <div>
                        <p className="font-medium">{sig.signatory_role}</p>
                        {sig.signatory_name && <p className="text-sm text-gray-500">{sig.signatory_name}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      {sig.signed ? (
                        <p className="text-sm text-green-600">
                          Signed {sig.signed_at ? format(new Date(sig.signed_at), 'MMM d, yyyy') : ''}
                        </p>
                      ) : sig.is_required ? (
                        <Badge variant="outline">Required</Badge>
                      ) : (
                        <Badge variant="outline" className="text-gray-400">Optional</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          
          {changeOrder.status === 'draft' && (
            <Button 
              onClick={() => handleAction('submit')} 
              disabled={actionLoading}
            >
              <Send className="h-4 w-4 mr-2" />
              Submit for Review
            </Button>
          )}
          
          {changeOrder.status === 'pending_review' && (
            <Button 
              onClick={() => handleAction('request-approval')} 
              disabled={actionLoading}
            >
              <PenTool className="h-4 w-4 mr-2" />
              Request Approval
            </Button>
          )}
          
          {changeOrder.status === 'pending_approval' && (
            <>
              <Button 
                variant="destructive" 
                onClick={() => handleAction('reject', { reason: 'Rejected by reviewer' })} 
                disabled={actionLoading}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject
              </Button>
              <Button 
                onClick={() => handleAction('approve')} 
                disabled={actionLoading}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Approve
              </Button>
            </>
          )}
          
          {changeOrder.status === 'approved' && (
            <Button 
              onClick={() => handleAction('execute')} 
              disabled={actionLoading}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <FileCheck className="h-4 w-4 mr-2" />
              Execute
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
