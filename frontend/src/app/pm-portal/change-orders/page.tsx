'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  FileStack, 
  Plus, 
  Search, 
  DollarSign,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Calendar,
  Send,
  PlayCircle,
  Trash2,
  Edit,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { 
  changeOrdersApi, 
  projectsApi,
  ChangeOrder,
  ChangeOrderStats,
  ChangeOrderStatus,
  Project
} from '@/lib/pm-portal-api';

// Status configuration
const statusConfig: Record<ChangeOrderStatus, { label: string; bg: string; text: string }> = {
  draft: { label: 'Draft', bg: 'bg-zinc-500/20', text: 'text-zinc-400' },
  pending_approval: { label: 'Pending Approval', bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  approved: { label: 'Approved', bg: 'bg-green-500/20', text: 'text-green-400' },
  rejected: { label: 'Rejected', bg: 'bg-red-500/20', text: 'text-red-400' },
  executed: { label: 'Executed', bg: 'bg-blue-500/20', text: 'text-blue-400' },
  void: { label: 'Void', bg: 'bg-zinc-600/20', text: 'text-zinc-500' },
};

export default function ChangeOrdersPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params?.id as string | undefined;
  
  const [loading, setLoading] = useState(true);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [stats, setStats] = useState<ChangeOrderStats | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ChangeOrderStatus | 'all'>('all');
  const [activeTab, setActiveTab] = useState('all');
  const [selectedCO, setSelectedCO] = useState<ChangeOrder | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(searchParams?.get('new') === 'true');
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState<Partial<ChangeOrder>>({
    title: '',
    description: '',
    reason: '',
    cost_impact: 0,
    schedule_impact_days: 0,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [coResponse, statsResponse] = await Promise.allSettled([
        changeOrdersApi.getAll({ 
          projectId, 
          status: statusFilter !== 'all' ? statusFilter : undefined,
          search: searchQuery || undefined,
        }),
        projectId ? changeOrdersApi.getStats(projectId) : Promise.resolve(null),
      ]);

      if (coResponse.status === 'fulfilled') {
        setChangeOrders(coResponse.value.data);
      }
      if (statsResponse.status === 'fulfilled' && statsResponse.value) {
        setStats(statsResponse.value);
      }
      
      if (projectId) {
        try {
          const proj = await projectsApi.getById(projectId);
          setProject(proj);
        } catch {}
      }
    } catch (error) {
      console.error('Failed to fetch change orders:', error);
      toast.error('Failed to load change orders');
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter, searchQuery]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateChangeOrder = async () => {
    if (!formData.title || !formData.reason || !formData.description) {
      toast.error('Please fill in all required fields (Title, Reason, and Description)');
      return;
    }
    
    if (!projectId) {
      toast.error('Project ID is required');
      return;
    }
    
    setCreating(true);
    try {
      await changeOrdersApi.create({
        project_id: projectId,
        title: formData.title,
        description: formData.description,
        reason: formData.reason,
        cost_impact: formData.cost_impact || 0,
        schedule_impact_days: formData.schedule_impact_days || 0,
      });
      
      toast.success('Change Order created successfully');
      setShowCreateDialog(false);
      setFormData({ title: '', description: '', reason: '', cost_impact: 0, schedule_impact_days: 0 });
      fetchData();
    } catch (error) {
      console.error('Failed to create change order:', error);
      toast.error('Failed to create change order');
    } finally {
      setCreating(false);
    }
  };

  const handleViewCO = (co: ChangeOrder) => {
    setSelectedCO(co);
    setShowDetailSheet(true);
  };

  const handleSubmitForApproval = async () => {
    if (!selectedCO) return;
    setSubmitting(true);
    try {
      await changeOrdersApi.submitForApproval(selectedCO.id);
      toast.success('Change Order submitted for client approval');
      setShowDetailSheet(false);
      fetchData();
    } catch (error) {
      console.error('Failed to submit for approval:', error);
      toast.error('Failed to submit for approval');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExecute = async () => {
    if (!selectedCO) return;
    setSubmitting(true);
    try {
      await changeOrdersApi.execute(selectedCO.id);
      toast.success('Change Order executed successfully');
      setShowDetailSheet(false);
      fetchData();
    } catch (error) {
      console.error('Failed to execute change order:', error);
      toast.error('Failed to execute change order');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCO) return;
    if (!confirm('Are you sure you want to delete this change order?')) return;
    
    setDeleting(true);
    try {
      await changeOrdersApi.delete(selectedCO.id);
      toast.success('Change Order deleted');
      setShowDetailSheet(false);
      setSelectedCO(null);
      fetchData();
    } catch (error) {
      console.error('Failed to delete change order:', error);
      toast.error('Failed to delete change order');
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      return format(new Date(dateStr), 'MMM d, yyyy');
    } catch {
      return '—';
    }
  };

  const formatCurrency = (amount?: number) => {
    if (amount === undefined || amount === null) return '$0';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
  };

  const getFilteredCOs = () => {
    let filtered = [...changeOrders];
    
    if (activeTab !== 'all') {
      if (activeTab === 'pending') {
        filtered = filtered.filter(co => co.status === 'pending_approval');
      } else if (activeTab === 'approved') {
        filtered = filtered.filter(co => co.status === 'approved' || co.status === 'executed');
      } else if (activeTab === 'cost-adds') {
        filtered = filtered.filter(co => (co.cost_impact || 0) > 0);
      }
    }
    
    return filtered;
  };

  const filteredCOs = getFilteredCOs();
  const pendingCount = changeOrders.filter(co => co.status === 'pending_approval').length;
  const approvedCount = changeOrders.filter(co => co.status === 'approved' || co.status === 'executed').length;
  const totalCostImpact = changeOrders.filter(co => co.status === 'approved').reduce((sum, co) => sum + (co.cost_impact || 0), 0);
  const totalScheduleImpact = changeOrders.filter(co => co.status === 'approved').reduce((sum, co) => sum + (co.schedule_impact_days || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          {projectId && (
            <Link href={`/pm-portal/projects/${projectId}`} className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-300 text-sm mb-2 transition-colors">
              <ArrowLeft className="h-3 w-3" />Back to Project
            </Link>
          )}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <FileStack className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Change Orders</h1>
              <p className="text-zinc-400 text-sm">Manage project changes, cost and schedule impacts</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
          <Button className="bg-purple-600 hover:bg-purple-700" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />New Change Order
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Total COs</p>
            <p className="text-2xl font-bold text-white mt-1">{changeOrders.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Pending</p>
            <p className="text-2xl font-bold text-yellow-400 mt-1">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card className={`bg-zinc-900 border-zinc-800 ${totalCostImpact > 0 ? 'border-red-500/30' : totalCostImpact < 0 ? 'border-green-500/30' : ''}`}>
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Approved Cost Impact</p>
            <div className="flex items-center gap-2 mt-1">
              <p className={`text-2xl font-bold ${totalCostImpact > 0 ? 'text-red-400' : totalCostImpact < 0 ? 'text-green-400' : 'text-white'}`}>
                {formatCurrency(totalCostImpact)}
              </p>
              {totalCostImpact !== 0 && (
                totalCostImpact > 0 ? <TrendingUp className="h-4 w-4 text-red-400" /> : <TrendingDown className="h-4 w-4 text-green-400" />
              )}
            </div>
          </CardContent>
        </Card>
        <Card className={`bg-zinc-900 border-zinc-800 ${totalScheduleImpact > 0 ? 'border-orange-500/30' : ''}`}>
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Schedule Impact</p>
            <div className="flex items-center gap-2 mt-1">
              <p className={`text-2xl font-bold ${totalScheduleImpact > 0 ? 'text-orange-400' : 'text-white'}`}>
                {totalScheduleImpact > 0 ? `+${totalScheduleImpact}` : totalScheduleImpact} days
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input placeholder="Search change orders..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ChangeOrderStatus | 'all')}>
          <SelectTrigger className="w-[180px] bg-zinc-900 border-zinc-800"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(statusConfig).map(([value, config]) => (<SelectItem key={value} value={value}>{config.label}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs and Table */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-zinc-800 border-zinc-700">
          <TabsTrigger value="all">All ({changeOrders.length})</TabsTrigger>
          <TabsTrigger value="pending">Pending ({pendingCount})</TabsTrigger>
          <TabsTrigger value="approved">Approved ({approvedCount})</TabsTrigger>
          <TabsTrigger value="cost-adds">Cost Adds</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-purple-500" /></div>
          ) : filteredCOs.length === 0 ? (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="py-12 text-center">
                <FileStack className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">No Change Orders Found</h3>
                <p className="text-zinc-400 text-sm mb-4">{activeTab === 'all' ? 'Create your first change order to get started' : 'No change orders match the current filter'}</p>
                <Button onClick={() => setShowCreateDialog(true)} className="bg-purple-600 hover:bg-purple-700"><Plus className="h-4 w-4 mr-2" />New Change Order</Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                      <TableHead className="text-zinc-400">CO #</TableHead>
                      <TableHead className="text-zinc-400">Title</TableHead>
                      <TableHead className="text-zinc-400">Reason</TableHead>
                      <TableHead className="text-zinc-400">Status</TableHead>
                      <TableHead className="text-zinc-400 text-right">Cost Impact</TableHead>
                      <TableHead className="text-zinc-400 text-right">Schedule</TableHead>
                      <TableHead className="text-zinc-400">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCOs.map((co) => {
                      const status = statusConfig[co.status] || statusConfig.draft;
                      const costImpact = co.cost_impact || 0;
                      const scheduleImpact = co.schedule_impact_days || 0;
                      return (
                        <TableRow key={co.id} className="border-zinc-800 hover:bg-zinc-800/50 cursor-pointer" onClick={() => handleViewCO(co)}>
                          <TableCell className="font-mono text-purple-400">{co.co_number}</TableCell>
                          <TableCell>
                            <span className="font-medium text-white truncate max-w-[200px] block">{co.title}</span>
                          </TableCell>
                          <TableCell className="text-zinc-300 text-sm truncate max-w-[150px]">{co.reason || '—'}</TableCell>
                          <TableCell><Badge className={`${status.bg} ${status.text} border-0`}>{status.label}</Badge></TableCell>
                          <TableCell className={`text-right font-mono ${costImpact > 0 ? 'text-red-400' : costImpact < 0 ? 'text-green-400' : 'text-zinc-400'}`}>
                            {formatCurrency(costImpact)}
                          </TableCell>
                          <TableCell className={`text-right ${scheduleImpact > 0 ? 'text-orange-400' : 'text-zinc-400'}`}>
                            {scheduleImpact > 0 ? `+${scheduleImpact}d` : scheduleImpact === 0 ? '—' : `${scheduleImpact}d`}
                          </TableCell>
                          <TableCell className="text-zinc-400 text-sm">{formatDate(co.created_at)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Change Order Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Create Change Order</DialogTitle>
            <DialogDescription className="text-zinc-400">Submit a new change order request</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-zinc-300">Title *</Label>
              <Input placeholder="Change order title" value={formData.title || ''} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="bg-zinc-800 border-zinc-700" />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Reason *</Label>
              <Select value={formData.reason || ''} onValueChange={(value) => setFormData({ ...formData, reason: value })}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner_request">Owner Request</SelectItem>
                  <SelectItem value="scope_change">Scope Change</SelectItem>
                  <SelectItem value="design_error">Design Error</SelectItem>
                  <SelectItem value="unforeseen_conditions">Unforeseen Conditions</SelectItem>
                  <SelectItem value="regulatory_requirement">Regulatory Requirement</SelectItem>
                  <SelectItem value="value_engineering">Value Engineering</SelectItem>
                  <SelectItem value="schedule_acceleration">Schedule Acceleration</SelectItem>
                  <SelectItem value="material_substitution">Material Substitution</SelectItem>
                  <SelectItem value="force_majeure">Force Majeure</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-300">Cost Impact ($)</Label>
                <Input type="number" placeholder="0" value={formData.cost_impact || ''} onChange={(e) => setFormData({ ...formData, cost_impact: parseFloat(e.target.value) || 0 })} className="bg-zinc-800 border-zinc-700" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Schedule Impact (Days)</Label>
                <Input type="number" placeholder="0" value={formData.schedule_impact_days || ''} onChange={(e) => setFormData({ ...formData, schedule_impact_days: parseInt(e.target.value) || 0 })} className="bg-zinc-800 border-zinc-700" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Description *</Label>
              <Textarea placeholder="Detailed description of the change..." value={formData.description || ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="bg-zinc-800 border-zinc-700 min-h-[100px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="border-zinc-700">Cancel</Button>
            <Button onClick={handleCreateChangeOrder} disabled={creating} className="bg-purple-600 hover:bg-purple-700">
              {creating ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</>) : (<><Plus className="h-4 w-4 mr-2" />Create CO</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Order Detail Sheet */}
      <Sheet open={showDetailSheet} onOpenChange={setShowDetailSheet}>
        <SheetContent className="bg-zinc-900 border-zinc-800 w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="text-white flex items-center gap-2">
              <span className="font-mono text-purple-400">{selectedCO?.co_number}</span>
              {selectedCO && (<Badge className={`${statusConfig[selectedCO.status].bg} ${statusConfig[selectedCO.status].text} border-0`}>{statusConfig[selectedCO.status].label}</Badge>)}
            </SheetTitle>
          </SheetHeader>
          {selectedCO && (
            <div className="mt-6 space-y-6">
              <div>
                <h3 className="text-lg font-medium text-white mb-2">{selectedCO.title}</h3>
                <p className="text-sm text-zinc-400">{selectedCO.reason}</p>
              </div>
              
              {/* Impact Cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className={`p-4 rounded-lg border ${(selectedCO.cost_impact || 0) > 0 ? 'bg-red-500/10 border-red-500/30' : (selectedCO.cost_impact || 0) < 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-zinc-800/50 border-zinc-700'}`}>
                  <div className="flex items-center gap-2 text-sm text-zinc-400 mb-1">
                    <DollarSign className="h-4 w-4" />Cost Impact
                  </div>
                  <p className={`text-xl font-bold ${(selectedCO.cost_impact || 0) > 0 ? 'text-red-400' : (selectedCO.cost_impact || 0) < 0 ? 'text-green-400' : 'text-white'}`}>
                    {formatCurrency(selectedCO.cost_impact)}
                  </p>
                </div>
                <div className={`p-4 rounded-lg border ${(selectedCO.schedule_impact_days || 0) > 0 ? 'bg-orange-500/10 border-orange-500/30' : 'bg-zinc-800/50 border-zinc-700'}`}>
                  <div className="flex items-center gap-2 text-sm text-zinc-400 mb-1">
                    <Calendar className="h-4 w-4" />Schedule Impact
                  </div>
                  <p className={`text-xl font-bold ${(selectedCO.schedule_impact_days || 0) > 0 ? 'text-orange-400' : 'text-white'}`}>
                    {(selectedCO.schedule_impact_days || 0) > 0 ? `+${selectedCO.schedule_impact_days}` : selectedCO.schedule_impact_days || 0} days
                  </p>
                </div>
              </div>
              
              {selectedCO.description && (
                <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-800">
                  <h4 className="text-sm font-medium text-zinc-400 mb-2">Description</h4>
                  <p className="text-zinc-200 text-sm whitespace-pre-wrap">{selectedCO.description}</p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1"><p className="text-zinc-500">Requested By</p><p className="text-zinc-200">{selectedCO.requested_by_name || '—'}</p></div>
                <div className="space-y-1"><p className="text-zinc-500">Approved By</p><p className="text-zinc-200">{selectedCO.approved_by_name || '—'}</p></div>
                <div className="space-y-1"><p className="text-zinc-500">Created</p><p className="text-zinc-200">{formatDate(selectedCO.created_at)}</p></div>
                <div className="space-y-1"><p className="text-zinc-500">Updated</p><p className="text-zinc-200">{formatDate(selectedCO.updated_at)}</p></div>
              </div>
              
              {/* Action Buttons */}
              <div className="pt-4 border-t border-zinc-800 space-y-3">
                {selectedCO.status === 'draft' && (
                  <Button 
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white" 
                    onClick={handleSubmitForApproval}
                    disabled={submitting}
                  >
                    {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                    Submit for Client Approval
                  </Button>
                )}
                {selectedCO.status === 'approved' && (
                  <Button 
                    className="w-full bg-green-600 hover:bg-green-700 text-white" 
                    onClick={handleExecute}
                    disabled={submitting}
                  >
                    {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
                    Execute Change Order
                  </Button>
                )}
                {(selectedCO.status === 'draft' || selectedCO.status === 'rejected') && (
                  <Button 
                    variant="outline" 
                    className="w-full border-red-600 text-red-400 hover:bg-red-900/30"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                    Delete Change Order
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
