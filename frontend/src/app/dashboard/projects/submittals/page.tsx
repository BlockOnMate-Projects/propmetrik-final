'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  ClipboardList, 
  Plus, 
  Search, 
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ArrowLeft,
  Send,
  Eye,
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
import { format, formatDistanceToNow } from 'date-fns';
import { 
  submittalsApi, 
  projectsApi,
  Submittal,
  SubmittalStats,
  SubmittalStatus,
  SubmittalType,
  Project
} from '@/lib/pm-portal-api';
import { submittalSchema, validateForm } from '@/lib/schemas/pm.schemas';
import { FieldError, FormErrorSummary } from '@/components/ui/form-errors';
import { Pagination } from '@/components/ui/pagination-controls';

// Status configuration
const statusConfig: Record<SubmittalStatus, { label: string; bg: string; text: string }> = {
  draft: { label: 'Draft', bg: 'bg-zinc-500/20', text: 'text-muted-foreground' },
  submitted: { label: 'Submitted', bg: 'bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400' },
  under_review: { label: 'Under Review', bg: 'bg-yellow-500/20', text: 'text-yellow-600 dark:text-yellow-400' },
  approved: { label: 'Approved', bg: 'bg-green-500/20', text: 'text-green-600 dark:text-green-400' },
  approved_as_noted: { label: 'Approved as Noted', bg: 'bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400' },
  revise_resubmit: { label: 'Revise & Resubmit', bg: 'bg-orange-500/20', text: 'text-orange-600 dark:text-orange-400' },
  rejected: { label: 'Rejected', bg: 'bg-red-500/20', text: 'text-red-600 dark:text-red-400' },
  closed: { label: 'Closed', bg: 'bg-zinc-600/20', text: 'text-muted-foreground' },
};

const typeLabels: Record<SubmittalType, string> = {
  shop_drawing: 'Shop Drawing',
  product_data: 'Product Data',
  sample: 'Sample',
  mock_up: 'Mock-Up',
  design_data: 'Design Data',
  test_report: 'Test Report',
  certificate: 'Certificate',
  manufacturer_instruction: 'Manufacturer Instruction',
  closeout: 'Closeout',
  other: 'Other',
};

export default function SubmittalsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params?.id as string | undefined;
  
  const [loading, setLoading] = useState(true);
  const [submittals, setSubmittals] = useState<Submittal[]>([]);
  const [stats, setStats] = useState<SubmittalStats | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<SubmittalStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<SubmittalType | 'all'>('all');
  const [activeTab, setActiveTab] = useState('all');
  const [selectedSubmittal, setSelectedSubmittal] = useState<Submittal | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(searchParams?.get('new') === 'true');
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string[]> | null>(null);
  
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Form state
  const [formData, setFormData] = useState<Partial<Submittal>>({
    title: '',
    description: '',
    type: 'shop_drawing',
    spec_section: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [submittalsResponse, statsResponse] = await Promise.allSettled([
        submittalsApi.getAll({
          projectId,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          type: typeFilter !== 'all' ? typeFilter : undefined,
          search: searchQuery || undefined,
          ballInCourt: activeTab === 'awaiting-me' ? 'me' : undefined,
          limit: 20,
          offset: (page - 1) * 20,
        }),
        projectId ? submittalsApi.getStats(projectId) : Promise.resolve(null),
      ]);

      if (submittalsResponse.status === 'fulfilled') {
        setSubmittals(submittalsResponse.value.data);
        setTotalCount(submittalsResponse.value.total || submittalsResponse.value.data.length);
        setTotalPages(submittalsResponse.value.totalPages || Math.ceil((submittalsResponse.value.total || submittalsResponse.value.data.length) / 20));
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
      console.error('Failed to fetch submittals:', error);
      toast.error('Failed to load submittals');
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter, typeFilter, searchQuery, page, activeTab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateSubmittal = async () => {
    const validation = validateForm(submittalSchema, formData);
    if (!validation.success) { setFormErrors(validation.errors!); return; }
    setFormErrors(null);
    
    if (!projectId) {
      toast.error('Project ID is required');
      return;
    }
    
    setCreating(true);
    try {
      await submittalsApi.create({
        project_id: projectId,
        title: formData.title,
        description: formData.description,
        type: formData.type,
        spec_section: formData.spec_section,
      });
      
      toast.success('Submittal created successfully');
      setShowCreateDialog(false);
      setFormData({ title: '', description: '', type: 'shop_drawing', spec_section: '' });
      fetchData();
    } catch (error) {
      console.error('Failed to create submittal:', error);
      toast.error('Failed to create submittal');
    } finally {
      setCreating(false);
    }
  };

  const handleViewSubmittal = (submittal: Submittal) => {
    setSelectedSubmittal(submittal);
    setShowDetailSheet(true);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      return format(new Date(dateStr), 'MMM d, yyyy');
    } catch {
      return '—';
    }
  };

  const getFilteredSubmittals = () => {
    let filtered = [...submittals];
    
    if (activeTab !== 'all' && activeTab !== 'awaiting-me') {
      // 'awaiting-me' is filtered server-side (ball-in-court) — don't re-filter.
      if (activeTab === 'pending') {
        filtered = filtered.filter(s => s.status === 'submitted' || s.status === 'under_review');
      } else if (activeTab === 'approved') {
        filtered = filtered.filter(s => s.status === 'approved' || s.status === 'approved_as_noted');
      } else if (activeTab === 'action') {
        filtered = filtered.filter(s => s.status === 'revise_resubmit' || s.status === 'rejected');
      }
    }
    
    return filtered;
  };

  const filteredSubmittals = getFilteredSubmittals();
  const pendingCount = submittals.filter(s => s.status === 'submitted' || s.status === 'under_review').length;
  const approvedCount = submittals.filter(s => s.status === 'approved' || s.status === 'approved_as_noted').length;
  const actionCount = submittals.filter(s => s.status === 'revise_resubmit' || s.status === 'rejected').length;
  const overdueCount = submittals.filter(s => s.is_overdue).length;

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
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <ClipboardList className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Submittals</h1>
              <p className="text-muted-foreground text-sm">Track shop drawings, samples, and product data</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-border text-muted-foreground" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
          <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />New Submittal
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Total</p>
            <p className="text-2xl font-bold text-foreground mt-1">{submittals.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Pending Review</p>
            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Approved</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{approvedCount}</p>
          </CardContent>
        </Card>
        <Card className={`bg-card border-border ${overdueCount > 0 ? 'border-red-500/50' : ''}`}>
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Overdue</p>
            <p className={`text-2xl font-bold mt-1 ${overdueCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>{overdueCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search submittals..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 bg-card border-border text-foreground placeholder:text-muted-foreground" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as SubmittalStatus | 'all')}>
          <SelectTrigger className="w-[180px] bg-card border-border"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(statusConfig).map(([value, config]) => (<SelectItem key={value} value={value}>{config.label}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as SubmittalType | 'all')}>
          <SelectTrigger className="w-[180px] bg-card border-border"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(typeLabels).map(([value, label]) => (<SelectItem key={value} value={value}>{label}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs and Table */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted border-border">
          <TabsTrigger value="all">All ({submittals.length})</TabsTrigger>
          <TabsTrigger value="awaiting-me" className="data-[state=active]:text-amber-400">Awaiting Me</TabsTrigger>
          <TabsTrigger value="pending">Pending ({pendingCount})</TabsTrigger>
          <TabsTrigger value="approved">Approved ({approvedCount})</TabsTrigger>
          <TabsTrigger value="action" className={actionCount > 0 ? 'text-orange-600 dark:text-orange-400' : ''}>Action Required ({actionCount})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-amber-500" /></div>
          ) : filteredSubmittals.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="py-12 text-center">
                <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No Submittals Found</h3>
                <p className="text-muted-foreground text-sm mb-4">{activeTab === 'all' ? 'Create your first submittal to get started' : 'No submittals match the current filter'}</p>
                <Button onClick={() => setShowCreateDialog(true)} className="bg-amber-600 hover:bg-amber-700"><Plus className="h-4 w-4 mr-2" />New Submittal</Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Submittal #</TableHead>
                      <TableHead className="text-muted-foreground">Title</TableHead>
                      <TableHead className="text-muted-foreground">Type</TableHead>
                      <TableHead className="text-muted-foreground">Spec Section</TableHead>
                      <TableHead className="text-muted-foreground">Status</TableHead>
                      <TableHead className="text-muted-foreground">Ball in Court</TableHead>
                      <TableHead className="text-muted-foreground">Rev</TableHead>
                      <TableHead className="text-muted-foreground">Due Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSubmittals.map((submittal) => {
                      const status = statusConfig[submittal.status] || statusConfig.submitted;
                      return (
                        <TableRow key={submittal.id} className="border-border hover:bg-muted/50 cursor-pointer" onClick={() => handleViewSubmittal(submittal)}>
                          <TableCell className="font-mono text-amber-500">{submittal.submittal_number}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground truncate max-w-[200px]">{submittal.title}</span>
                              {submittal.is_overdue && <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">{typeLabels[submittal.type] || submittal.type}</TableCell>
                          <TableCell className="text-muted-foreground font-mono text-sm">{submittal.spec_section || '—'}</TableCell>
                          <TableCell><Badge className={`${status.bg} ${status.text} border-0`}>{status.label}</Badge></TableCell>
                          <TableCell className="text-sm">
                            {submittal.ball_in_court_name
                              ? <span className="inline-flex items-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-300 px-2 py-0.5 text-xs">{submittal.ball_in_court_name}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{submittal.revision_number || 0}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{formatDate(submittal.due_date)}</TableCell>
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

      {/* Create Submittal Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">Create New Submittal</DialogTitle>
            <DialogDescription className="text-muted-foreground">Submit a new shop drawing, sample, or product data</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Title *</Label>
              <Input placeholder="Submittal title" value={formData.title || ''} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="bg-muted border-border" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Type</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v as SubmittalType })}>
                  <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(typeLabels).map(([value, label]) => (<SelectItem key={value} value={value}>{label}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Spec Section</Label>
                <Input placeholder="e.g. 03 30 00" value={formData.spec_section || ''} onChange={(e) => setFormData({ ...formData, spec_section: e.target.value })} className="bg-muted border-border" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Description</Label>
              <Textarea placeholder="Submittal description..." value={formData.description || ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="bg-muted border-border min-h-[100px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="border-border">Cancel</Button>
            <Button onClick={handleCreateSubmittal} disabled={creating} className="bg-amber-600 hover:bg-amber-700">
              {creating ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</>) : (<><Send className="h-4 w-4 mr-2" />Create Submittal</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submittal Detail Sheet */}
      <Sheet open={showDetailSheet} onOpenChange={setShowDetailSheet}>
        <SheetContent className="bg-card border-border w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="text-foreground flex items-center gap-2">
              <span className="font-mono text-amber-500">{selectedSubmittal?.submittal_number}</span>
              {selectedSubmittal && (<Badge className={`${statusConfig[selectedSubmittal.status].bg} ${statusConfig[selectedSubmittal.status].text} border-0`}>{statusConfig[selectedSubmittal.status].label}</Badge>)}
            </SheetTitle>
          </SheetHeader>
          {selectedSubmittal && (
            <div className="mt-6 space-y-6">
              <div>
                <h3 className="text-lg font-medium text-foreground mb-2">{selectedSubmittal.title}</h3>
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                  <span>{typeLabels[selectedSubmittal.type]}</span>
                  {selectedSubmittal.spec_section && (<><span>•</span><span className="font-mono">{selectedSubmittal.spec_section}</span></>)}
                  <span>•</span>
                  <span>Rev {selectedSubmittal.revision_number || 0}</span>
                </div>
              </div>
              {selectedSubmittal.description && (
                <div className="p-4 rounded-lg bg-muted/50 border border-border">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Description</h4>
                  <p className="text-zinc-200 text-sm whitespace-pre-wrap">{selectedSubmittal.description}</p>
                </div>
              )}
              {selectedSubmittal.review_comments && (
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <h4 className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-2">Review Comments</h4>
                  <p className="text-zinc-200 text-sm whitespace-pre-wrap">{selectedSubmittal.review_comments}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1"><p className="text-muted-foreground">Submitted By</p><p className="text-zinc-200">{selectedSubmittal.submitted_by_name || '—'}</p></div>
                <div className="space-y-1"><p className="text-muted-foreground">Reviewer</p><p className="text-zinc-200">{selectedSubmittal.reviewer_name || '—'}</p></div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Due Date</p>
                  <p className={`${selectedSubmittal.is_overdue ? 'text-red-600 dark:text-red-400' : 'text-zinc-200'}`}>{formatDate(selectedSubmittal.due_date)}</p>
                </div>
                <div className="space-y-1"><p className="text-muted-foreground">Created</p><p className="text-zinc-200">{formatDate(selectedSubmittal.created_at)}</p></div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
