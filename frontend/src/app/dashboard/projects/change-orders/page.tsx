'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
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
  Eye,
  Download,
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
import { changeOrderSchema, validateForm } from '@/lib/schemas/pm.schemas';
import { humanize } from '@/lib/utils';
import { FieldError, FormErrorSummary } from '@/components/ui/form-errors';
import { Pagination } from '@/components/ui/pagination-controls';

// Status configuration
const statusConfig: Record<ChangeOrderStatus, { label: string; bg: string; text: string }> = {
  draft: { label: 'Draft', bg: 'bg-zinc-500/20', text: 'text-muted-foreground' },
  pending_review: { label: 'Pending Review', bg: 'bg-orange-500/20', text: 'text-orange-600 dark:text-orange-400' },
  pending_approval: { label: 'Pending Approval', bg: 'bg-yellow-500/20', text: 'text-yellow-600 dark:text-yellow-400' },
  approved: { label: 'Approved', bg: 'bg-green-500/20', text: 'text-green-600 dark:text-green-400' },
  rejected: { label: 'Rejected', bg: 'bg-red-500/20', text: 'text-red-600 dark:text-red-400' },
  executed: { label: 'Executed', bg: 'bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400' },
  void: { label: 'Void', bg: 'bg-zinc-600/20', text: 'text-muted-foreground' },
};

function ChangeOrdersContent() {
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
  const [formErrors, setFormErrors] = useState<Record<string, string[]> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [esigning, setEsigning] = useState(false);
  const [docBusyId, setDocBusyId] = useState<string | null>(null);
  
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

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
          ballInCourt: activeTab === 'awaiting-me' ? 'me' : undefined,
          limit: 20,
          offset: (page - 1) * 20,
        }),
        projectId ? changeOrdersApi.getStats(projectId) : Promise.resolve(null),
      ]);

      if (coResponse.status === 'fulfilled') {
        setChangeOrders(coResponse.value.data);
        setTotalCount(coResponse.value.total || coResponse.value.data.length);
        setTotalPages(coResponse.value.totalPages || Math.ceil((coResponse.value.total || coResponse.value.data.length) / 20));
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
  }, [projectId, statusFilter, searchQuery, page, activeTab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateChangeOrder = async () => {
    const validation = validateForm(changeOrderSchema, formData);
    if (!validation.success) { setFormErrors(validation.errors!); return; }
    setFormErrors(null);
    
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

  // E-signature via the hardened backend flow (config-driven signers + branded PDF).
  const handleRequestESign = async () => {
    if (!selectedCO) return;
    setEsigning(true);
    try {
      // Hardened backend flow: generates the branded change-order PDF, resolves
      // signers from the project team + config, and sends for signature.
      const updated = await changeOrdersApi.requestEsign(selectedCO.id);
      if ((updated as any)?.esign_envelope_id) {
        toast.success('Change order sent for e-signature — signers will receive an email');
      } else {
        toast.warning('No signers could be resolved. Add project team members (PM, owner, contractor) with email addresses, then try again.');
      }
      setShowDetailSheet(false);
      fetchData();
    } catch (error) {
      console.error('Failed to request e-signature:', error);
      toast.error('Failed to request e-signature');
    } finally {
      setEsigning(false);
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

  // Row actions: view/download the PDF (signed copy if e-signed, else generated).
  const handleViewDocument = async (co: ChangeOrder) => {
    setDocBusyId(co.id);
    try {
      const blob = await changeOrdersApi.getDocumentBlob(co.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      console.error('Failed to open document:', error);
      toast.error('Failed to open change order document');
    } finally {
      setDocBusyId(null);
    }
  };

  const handleDownloadDocument = async (co: ChangeOrder) => {
    setDocBusyId(co.id);
    try {
      const blob = await changeOrdersApi.getDocumentBlob(co.id, true);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${co.co_number || 'change-order'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      console.error('Failed to download document:', error);
      toast.error('Failed to download change order document');
    } finally {
      setDocBusyId(null);
    }
  };

  const handleDeleteRow = async (co: ChangeOrder) => {
    if (!confirm(`Delete change order ${co.co_number}? This cannot be undone.`)) return;
    setDocBusyId(co.id);
    try {
      await changeOrdersApi.delete(co.id);
      toast.success('Change Order deleted');
      if (selectedCO?.id === co.id) { setShowDetailSheet(false); setSelectedCO(null); }
      fetchData();
    } catch (error: any) {
      console.error('Failed to delete change order:', error);
      toast.error(error?.message || 'Failed to delete change order');
    } finally {
      setDocBusyId(null);
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
    
    if (activeTab !== 'all' && activeTab !== 'awaiting-me') {
      // 'awaiting-me' is filtered server-side (ball-in-court) — don't re-filter.
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
            <Link href={`/dashboard/projects/projects/${projectId}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-muted-foreground text-sm mb-2 transition-colors">
              <ArrowLeft className="h-3 w-3" />Back to Project
            </Link>
          )}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <FileStack className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Change Orders</h1>
              <p className="text-muted-foreground text-sm">Manage project changes, cost and schedule impacts</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-border text-muted-foreground" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
          <Button className="bg-purple-600 hover:bg-purple-700" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />New Change Order
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Total COs</p>
            <p className="text-2xl font-bold text-foreground mt-1">{changeOrders.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Pending</p>
            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card className={`bg-card border-border ${totalCostImpact > 0 ? 'border-red-500/30' : totalCostImpact < 0 ? 'border-green-500/30' : ''}`}>
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Approved Cost Impact</p>
            <div className="flex items-center gap-2 mt-1">
              <p className={`text-2xl font-bold ${totalCostImpact > 0 ? 'text-red-600 dark:text-red-400' : totalCostImpact < 0 ? 'text-green-600 dark:text-green-400' : 'text-foreground'}`}>
                {formatCurrency(totalCostImpact)}
              </p>
              {totalCostImpact !== 0 && (
                totalCostImpact > 0 ? <TrendingUp className="h-4 w-4 text-red-600 dark:text-red-400" /> : <TrendingDown className="h-4 w-4 text-green-600 dark:text-green-400" />
              )}
            </div>
          </CardContent>
        </Card>
        <Card className={`bg-card border-border ${totalScheduleImpact > 0 ? 'border-orange-500/30' : ''}`}>
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Schedule Impact</p>
            <div className="flex items-center gap-2 mt-1">
              <p className={`text-2xl font-bold ${totalScheduleImpact > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-foreground'}`}>
                {totalScheduleImpact > 0 ? `+${totalScheduleImpact}` : totalScheduleImpact} days
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search change orders..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 bg-card border-border text-foreground placeholder:text-muted-foreground" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ChangeOrderStatus | 'all')}>
          <SelectTrigger className="w-[180px] bg-card border-border"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(statusConfig).map(([value, config]) => (<SelectItem key={value} value={value}>{config.label}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs and Table */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted border-border">
          <TabsTrigger value="all">All ({changeOrders.length})</TabsTrigger>
          <TabsTrigger value="awaiting-me" className="data-[state=active]:text-amber-400">Awaiting Me</TabsTrigger>
          <TabsTrigger value="pending">Pending ({pendingCount})</TabsTrigger>
          <TabsTrigger value="approved">Approved ({approvedCount})</TabsTrigger>
          <TabsTrigger value="cost-adds">Cost Adds</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-purple-500" /></div>
          ) : filteredCOs.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="py-12 text-center">
                <FileStack className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No Change Orders Found</h3>
                <p className="text-muted-foreground text-sm mb-4">{activeTab === 'all' ? 'Create your first change order to get started' : 'No change orders match the current filter'}</p>
                <Button onClick={() => setShowCreateDialog(true)} className="bg-purple-600 hover:bg-purple-700"><Plus className="h-4 w-4 mr-2" />New Change Order</Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">CO #</TableHead>
                      <TableHead className="text-muted-foreground">Title</TableHead>
                      <TableHead className="text-muted-foreground">Reason</TableHead>
                      <TableHead className="text-muted-foreground">Status</TableHead>
                      <TableHead className="text-muted-foreground">Ball in Court</TableHead>
                      <TableHead className="text-muted-foreground text-right">Cost Impact</TableHead>
                      <TableHead className="text-muted-foreground text-right">Schedule</TableHead>
                      <TableHead className="text-muted-foreground">Date</TableHead>
                      <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCOs.map((co) => {
                      const status = statusConfig[co.status] || statusConfig.draft;
                      const costImpact = co.cost_impact || 0;
                      const scheduleImpact = co.schedule_impact_days || 0;
                      return (
                        <TableRow key={co.id} className="border-border hover:bg-muted/50 cursor-pointer" onClick={() => handleViewCO(co)}>
                          <TableCell className="font-mono text-purple-600 dark:text-purple-400">
                            <span className="flex items-center gap-1.5">
                              {co.co_number}
                              {co.esign_status === 'completed' && (
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" aria-label="E-signed" />
                              )}
                              {co.esign_status === 'sent' && (
                                <Loader2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 animate-spin" aria-label="Out for signature" />
                              )}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="font-medium text-foreground truncate max-w-[200px] block">{co.title}</span>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm truncate max-w-[150px]">{co.reason ? humanize(co.reason) : '—'}</TableCell>
                          <TableCell><Badge className={`${status.bg} ${status.text} border-0`}>{status.label}</Badge></TableCell>
                          <TableCell className="text-sm">
                            {co.ball_in_court_name
                              ? <span className="inline-flex items-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-300 px-2 py-0.5 text-xs">{co.ball_in_court_name}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className={`text-right font-mono ${costImpact > 0 ? 'text-red-600 dark:text-red-400' : costImpact < 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                            {formatCurrency(costImpact)}
                          </TableCell>
                          <TableCell className={`text-right ${scheduleImpact > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground'}`}>
                            {scheduleImpact > 0 ? `+${scheduleImpact}d` : scheduleImpact === 0 ? '—' : `${scheduleImpact}d`}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">{formatDate(co.created_at)}</TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost" size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-zinc-700"
                                title="View PDF"
                                disabled={docBusyId === co.id}
                                onClick={() => handleViewDocument(co)}
                              >
                                {docBusyId === co.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                              </Button>
                              <Button
                                variant="ghost" size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-zinc-700"
                                title="Download PDF"
                                disabled={docBusyId === co.id}
                                onClick={() => handleDownloadDocument(co)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost" size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-950/40"
                                title={co.status === 'executed' ? 'Executed orders must be voided, not deleted' : 'Delete'}
                                disabled={docBusyId === co.id || co.status === 'executed'}
                                onClick={() => handleDeleteRow(co)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
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

      <Pagination page={page} totalPages={totalPages} total={totalCount} limit={20} onPageChange={setPage} />

      {/* Create Change Order Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">Create Change Order</DialogTitle>
            <DialogDescription className="text-muted-foreground">Submit a new change order request</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Title *</Label>
              <Input placeholder="Change order title" value={formData.title || ''} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="bg-muted border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Reason *</Label>
              <Select value={formData.reason || ''} onValueChange={(value) => setFormData({ ...formData, reason: value })}>
                <SelectTrigger className="bg-muted border-border">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner_request">Owner Request</SelectItem>
                  <SelectItem value="design_error">Design Error</SelectItem>
                  <SelectItem value="design_change">Design Change</SelectItem>
                  <SelectItem value="unforeseen_condition">Unforeseen Condition</SelectItem>
                  <SelectItem value="regulatory_requirement">Regulatory Requirement</SelectItem>
                  <SelectItem value="value_engineering">Value Engineering</SelectItem>
                  <SelectItem value="scope_addition">Scope Addition</SelectItem>
                  <SelectItem value="scope_reduction">Scope Reduction</SelectItem>
                  <SelectItem value="material_substitution">Material Substitution</SelectItem>
                  <SelectItem value="contractor_request">Contractor Request</SelectItem>
                  <SelectItem value="force_majeure">Force Majeure</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Cost Impact ($)</Label>
                <Input type="number" placeholder="0" value={formData.cost_impact || ''} onChange={(e) => setFormData({ ...formData, cost_impact: parseFloat(e.target.value) || 0 })} className="bg-muted border-border" />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Schedule Impact (Days)</Label>
                <Input type="number" placeholder="0" value={formData.schedule_impact_days || ''} onChange={(e) => setFormData({ ...formData, schedule_impact_days: parseInt(e.target.value) || 0 })} className="bg-muted border-border" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Description *</Label>
              <Textarea placeholder="Detailed description of the change..." value={formData.description || ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="bg-muted border-border min-h-[100px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="border-border">Cancel</Button>
            <Button onClick={handleCreateChangeOrder} disabled={creating} className="bg-purple-600 hover:bg-purple-700">
              {creating ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</>) : (<><Plus className="h-4 w-4 mr-2" />Create CO</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Order Detail Sheet */}
      <Sheet open={showDetailSheet} onOpenChange={setShowDetailSheet}>
        <SheetContent className="bg-card border-border w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="text-foreground flex items-center gap-2">
              <span className="font-mono text-purple-600 dark:text-purple-400">{selectedCO?.co_number}</span>
              {selectedCO && (() => { const cfg = statusConfig[selectedCO.status] || statusConfig.draft; return <Badge className={`${cfg.bg} ${cfg.text} border-0`}>{cfg.label}</Badge>; })()}
            </SheetTitle>
          </SheetHeader>
          {selectedCO && (
            <div className="mt-6 space-y-6">
              <div>
                <h3 className="text-lg font-medium text-foreground mb-2">{selectedCO.title}</h3>
                <p className="text-sm text-muted-foreground">{humanize(selectedCO.reason)}</p>
              </div>
              
              {/* Impact Cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className={`p-4 rounded-lg border ${(selectedCO.cost_impact || 0) > 0 ? 'bg-red-500/10 border-red-500/30' : (selectedCO.cost_impact || 0) < 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-muted/50 border-border'}`}>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <DollarSign className="h-4 w-4" />Cost Impact
                  </div>
                  <p className={`text-xl font-bold ${(selectedCO.cost_impact || 0) > 0 ? 'text-red-600 dark:text-red-400' : (selectedCO.cost_impact || 0) < 0 ? 'text-green-600 dark:text-green-400' : 'text-foreground'}`}>
                    {formatCurrency(selectedCO.cost_impact)}
                  </p>
                </div>
                <div className={`p-4 rounded-lg border ${(selectedCO.schedule_impact_days || 0) > 0 ? 'bg-orange-500/10 border-orange-500/30' : 'bg-muted/50 border-border'}`}>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Calendar className="h-4 w-4" />Schedule Impact
                  </div>
                  <p className={`text-xl font-bold ${(selectedCO.schedule_impact_days || 0) > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-foreground'}`}>
                    {(selectedCO.schedule_impact_days || 0) > 0 ? `+${selectedCO.schedule_impact_days}` : selectedCO.schedule_impact_days || 0} days
                  </p>
                </div>
              </div>
              
              {selectedCO.description && (
                <div className="p-4 rounded-lg bg-muted/50 border border-border">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Description</h4>
                  <p className="text-zinc-200 text-sm whitespace-pre-wrap">{selectedCO.description}</p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1"><p className="text-muted-foreground">Requested By</p><p className="text-zinc-200">{selectedCO.requested_by_name || '—'}</p></div>
                <div className="space-y-1"><p className="text-muted-foreground">Approved By</p><p className="text-zinc-200">{selectedCO.approved_by_name || '—'}</p></div>
                <div className="space-y-1"><p className="text-muted-foreground">Created</p><p className="text-zinc-200">{formatDate(selectedCO.created_at)}</p></div>
                <div className="space-y-1"><p className="text-muted-foreground">Updated</p><p className="text-zinc-200">{formatDate(selectedCO.updated_at)}</p></div>
              </div>
              
              {/* Action Buttons */}
              <div className="pt-4 border-t border-border space-y-3">
                {selectedCO.status === 'draft' && (
                  <Button
                    className="w-full bg-amber-600 hover:bg-amber-700 text-foreground"
                    onClick={handleSubmitForApproval}
                    disabled={submitting}
                  >
                    {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                    Submit for Client Approval
                  </Button>
                )}
                {selectedCO.esign_status === 'completed' ? (
                  <div className="w-full flex items-center justify-center gap-2 rounded-md bg-green-600/10 text-green-600 dark:text-green-400 border border-green-600/30 py-2 text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4" /> E-signed &amp; completed
                  </div>
                ) : selectedCO.esign_status === 'sent' ? (
                  <div className="w-full space-y-2">
                    <div className="w-full flex items-center justify-center gap-2 rounded-md bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-600/30 py-2 text-sm font-medium">
                      <Loader2 className="h-4 w-4 animate-spin" /> Out for signature — awaiting signers
                    </div>
                    <Button variant="outline" className="w-full" onClick={handleRequestESign} disabled={esigning}>
                      {esigning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Resend / re-request
                    </Button>
                  </div>
                ) : (selectedCO.status === 'pending_review' || selectedCO.status === 'pending_approval' || selectedCO.status === 'approved') ? (
                  <Button
                    className="w-full bg-blue-600 hover:bg-blue-700 text-foreground"
                    onClick={handleRequestESign}
                    disabled={esigning}
                  >
                    {esigning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                    Request E-Signature
                  </Button>
                ) : null}
                {selectedCO.status === 'approved' && (
                  <Button 
                    className="w-full bg-green-600 hover:bg-green-700 text-foreground" 
                    onClick={handleExecute}
                    disabled={submitting}
                  >
                    {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
                    Execute Change Order
                  </Button>
                )}
                {(selectedCO.status === 'draft' || selectedCO.status === 'pending_review' || selectedCO.status === 'rejected') && (
                  <Button
                    variant="outline"
                    className="w-full border-red-600 text-red-600 dark:text-red-400 hover:bg-red-900/30"
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

export default function ChangeOrdersPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <ChangeOrdersContent />
    </Suspense>
  );
}
