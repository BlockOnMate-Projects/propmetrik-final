'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  FileQuestion, 
  Plus, 
  Search, 
  AlertTriangle,
  Loader2,
  RefreshCw,
  ArrowLeft,
  Send,
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
  rfisApi, 
  projectsApi,
  Rfi, 
  RfiStats, 
  RfiStatus, 
  RfiPriority, 
  RfiCategory,
  CreateRfiInput,
  Project
} from '@/lib/pm-portal-api';
import { rfiSchema, validateForm } from '@/lib/schemas/pm.schemas';
import { FieldError, FormErrorSummary } from '@/components/ui/form-errors';
import { Pagination } from '@/components/ui/pagination-controls';

// Status configuration
const statusConfig: Record<RfiStatus, { label: string; bg: string; text: string }> = {
  draft: { label: 'Draft', bg: 'bg-zinc-500/20', text: 'text-zinc-400' },
  open: { label: 'Open', bg: 'bg-blue-500/20', text: 'text-blue-400' },
  pending_response: { label: 'Pending', bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  answered: { label: 'Answered', bg: 'bg-green-500/20', text: 'text-green-400' },
  closed: { label: 'Closed', bg: 'bg-zinc-600/20', text: 'text-zinc-500' },
  void: { label: 'Void', bg: 'bg-red-500/20', text: 'text-red-400' },
};

const priorityConfig: Record<RfiPriority, { label: string; bg: string; text: string }> = {
  low: { label: 'Low', bg: 'bg-zinc-500/20', text: 'text-zinc-400' },
  normal: { label: 'Normal', bg: 'bg-blue-500/20', text: 'text-blue-400' },
  high: { label: 'High', bg: 'bg-orange-500/20', text: 'text-orange-400' },
  critical: { label: 'Critical', bg: 'bg-red-500/20', text: 'text-red-400' },
};

const categoryLabels: Record<RfiCategory, string> = {
  design_clarification: 'Design Clarification',
  specification_query: 'Specification Query',
  drawing_discrepancy: 'Drawing Discrepancy',
  site_condition: 'Site Condition',
  material_substitution: 'Material Substitution',
  regulatory_compliance: 'Regulatory Compliance',
  contractor_coordination: 'Contractor Coordination',
  schedule_impact: 'Schedule Impact',
  cost_inquiry: 'Cost Inquiry',
  safety_concern: 'Safety Concern',
  other: 'Other',
};

export default function RFIsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params?.id as string | undefined;
  
  const [loading, setLoading] = useState(true);
  const [rfis, setRfis] = useState<Rfi[]>([]);
  const [stats, setStats] = useState<RfiStats | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<RfiStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<RfiPriority | 'all'>('all');
  const [activeTab, setActiveTab] = useState('all');
  const [selectedRfi, setSelectedRfi] = useState<Rfi | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(searchParams?.get('new') === 'true');
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string[]> | null>(null);
  
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Form state
  const [formData, setFormData] = useState<Partial<CreateRfiInput>>({
    subject: '',
    question: '',
    category: 'design_clarification',
    priority: 'normal',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rfisResponse, statsResponse] = await Promise.allSettled([
        rfisApi.getAll({
          projectId,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          priority: priorityFilter !== 'all' ? priorityFilter : undefined,
          search: searchQuery || undefined,
          ballInCourt: activeTab === 'awaiting-me' ? 'me' : undefined,
          limit: 20,
          offset: (page - 1) * 20,
        }),
        projectId ? rfisApi.getStats(projectId) : Promise.resolve(null),
      ]);

      if (rfisResponse.status === 'fulfilled') {
        setRfis(rfisResponse.value.data);
        setTotalCount(rfisResponse.value.total || rfisResponse.value.data.length);
        setTotalPages(rfisResponse.value.totalPages || Math.ceil((rfisResponse.value.total || rfisResponse.value.data.length) / 20));
      }
      if (statsResponse.status === 'fulfilled' && statsResponse.value) {
        setStats(statsResponse.value);
      }
      
      if (projectId) {
        try {
          const proj = await projectsApi.getById(projectId);
          setProject(proj);
        } catch {
          // Project fetch is optional
        }
      }
    } catch (error) {
      console.error('Failed to fetch RFIs:', error);
      toast.error('Failed to load RFIs');
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter, priorityFilter, searchQuery, page, activeTab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateRfi = async () => {
    const validation = validateForm(rfiSchema, formData);
    if (!validation.success) { setFormErrors(validation.errors!); return; }
    setFormErrors(null);
    
    if (!projectId) {
      toast.error('Project ID is required');
      return;
    }

    // Use project's org ID (required)
    const organizationId = project?.organization_id;
    if (!organizationId) {
      toast.error('Project organization ID not found');
      return;
    }
    
    setCreating(true);
    try {
      const newRfi = await rfisApi.create({
        organization_id: organizationId,
        project_id: projectId,
        subject: formData.subject!,
        question: formData.question!,
        category: formData.category as RfiCategory || 'other',
        priority: formData.priority as RfiPriority || 'normal',
        due_date: formData.due_date,
        submit_immediately: formData.submit_immediately,
      });
      
      if (formData.submit_immediately) {
        toast.success('RFI created and submitted. It is now available for client response.');
      } else {
        toast.success('RFI created as draft. Submit it when ready.');
      }
      setShowCreateDialog(false);
      setFormData({ subject: '', question: '', category: 'design_clarification', priority: 'normal', submit_immediately: false });
      fetchData();
    } catch (error) {
      console.error('Failed to create RFI:', error);
      toast.error('Failed to create RFI');
    } finally {
      setCreating(false);
    }
  };

  const handleViewRfi = (rfi: Rfi) => {
    setSelectedRfi(rfi);
    setShowDetailSheet(true);
  };

  // Submit a draft RFI to make it available for response
  const handleSubmitRfi = async (rfi: Rfi) => {
    try {
      await rfisApi.submit(rfi.id);
      toast.success('RFI submitted successfully. It is now open for response.');
      fetchData();
      setShowDetailSheet(false);
    } catch (error) {
      console.error('Failed to submit RFI:', error);
      toast.error('Failed to submit RFI');
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

  const getFilteredRfis = () => {
    let filtered = [...rfis];
    
    if (activeTab !== 'all' && activeTab !== 'awaiting-me') {
      // 'awaiting-me' is filtered server-side (ball-in-court) — don't re-filter here.
      if (activeTab === 'open') {
        filtered = filtered.filter(r => r.status === 'open' || r.status === 'pending_response');
      } else if (activeTab === 'overdue') {
        filtered = filtered.filter(r => r.is_overdue);
      } else if (activeTab === 'answered') {
        filtered = filtered.filter(r => r.status === 'answered');
      } else if (activeTab === 'closed') {
        filtered = filtered.filter(r => r.status === 'closed');
      }
    }
    
    return filtered;
  };

  const filteredRfis = getFilteredRfis();
  const openCount = rfis.filter(r => r.status === 'open' || r.status === 'pending_response').length;
  const overdueCount = rfis.filter(r => r.is_overdue).length;
  const answeredCount = rfis.filter(r => r.status === 'answered').length;
  const closedCount = rfis.filter(r => r.status === 'closed').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          {projectId && (
            <Link 
              href={`/dashboard/projects/projects/${projectId}`}
              className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-300 text-sm mb-2 transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to Project
            </Link>
          )}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <FileQuestion className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">RFI Management</h1>
              <p className="text-zinc-400 text-sm">Track and manage Requests for Information</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New RFI
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {/* Notification Banner for RFIs with Client Responses */}
        {answeredCount > 0 && (
          <div className="col-span-full flex items-center gap-3 p-4 bg-green-900/20 border border-green-700/50 rounded-lg mb-2">
            <div className="flex-shrink-0 h-10 w-10 bg-green-600 rounded-full flex items-center justify-center">
              <FileQuestion className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="font-mono text-sm text-green-400 font-medium">
                {answeredCount} RFI{answeredCount > 1 ? 's' : ''} Received Responses
              </h4>
              <p className="font-mono text-xs text-zinc-400 mt-0.5">
                Clients have responded to your requests. Review and close when resolved.
              </p>
            </div>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white font-mono text-xs"
              onClick={() => setActiveTab('answered')}
            >
              Review Responses
            </Button>
          </div>
        )}
        
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Total RFIs</p>
            <p className="text-2xl font-bold text-white mt-1">{rfis.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Pending Response</p>
            <p className="text-2xl font-bold text-yellow-400 mt-1">{stats?.pending_response || 0}</p>
          </CardContent>
        </Card>
        <Card className={`bg-zinc-900 border-zinc-800 ${overdueCount > 0 ? 'border-red-500/50' : ''}`}>
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Overdue</p>
            <p className={`text-2xl font-bold mt-1 ${overdueCount > 0 ? 'text-red-400' : 'text-white'}`}>{overdueCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Answered</p>
            <p className="text-2xl font-bold text-green-400 mt-1">{answeredCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Avg Response</p>
            <p className="text-2xl font-bold text-white mt-1">{stats?.avg_response_days?.toFixed(1) || '0'} days</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input 
            placeholder="Search RFIs by number, subject, or question..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as RfiStatus | 'all')}>
          <SelectTrigger className="w-[160px] bg-zinc-900 border-zinc-800">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(statusConfig).map(([value, config]) => (
              <SelectItem key={value} value={value}>{config.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as RfiPriority | 'all')}>
          <SelectTrigger className="w-[160px] bg-zinc-900 border-zinc-800">
            <SelectValue placeholder="All Priorities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            {Object.entries(priorityConfig).map(([value, config]) => (
              <SelectItem key={value} value={value}>{config.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs and Table */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-zinc-800 border-zinc-700">
          <TabsTrigger value="all">All ({rfis.length})</TabsTrigger>
          <TabsTrigger value="awaiting-me" className="data-[state=active]:text-amber-400">Awaiting Me</TabsTrigger>
          <TabsTrigger value="open">Open ({openCount})</TabsTrigger>
          <TabsTrigger value="overdue" className={overdueCount > 0 ? 'text-red-400' : ''}>
            Overdue ({overdueCount})
          </TabsTrigger>
          <TabsTrigger value="answered">Answered ({answeredCount})</TabsTrigger>
          <TabsTrigger value="closed">Closed ({closedCount})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
          ) : filteredRfis.length === 0 ? (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="py-12 text-center">
                <FileQuestion className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">No RFIs Found</h3>
                <p className="text-zinc-400 text-sm mb-4">
                  {activeTab === 'all' ? 'Create your first RFI to get started' : 'No RFIs match the current filter'}
                </p>
                <Button onClick={() => setShowCreateDialog(true)} className="bg-amber-600 hover:bg-amber-700">
                  <Plus className="h-4 w-4 mr-2" />New RFI
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                      <TableHead className="text-zinc-400">RFI #</TableHead>
                      <TableHead className="text-zinc-400">Subject</TableHead>
                      <TableHead className="text-zinc-400">Category</TableHead>
                      <TableHead className="text-zinc-400">Priority</TableHead>
                      <TableHead className="text-zinc-400">Status</TableHead>
                      <TableHead className="text-zinc-400">Ball in Court</TableHead>
                      <TableHead className="text-zinc-400">Due Date</TableHead>
                      <TableHead className="text-zinc-400">Submitted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRfis.map((rfi) => {
                      const status = statusConfig[rfi.status] || statusConfig.open;
                      const priority = priorityConfig[rfi.priority] || priorityConfig.normal;
                      return (
                        <TableRow key={rfi.id} className="border-zinc-800 hover:bg-zinc-800/50 cursor-pointer" onClick={() => handleViewRfi(rfi)}>
                          <TableCell className="font-mono text-amber-500">{rfi.rfi_number}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-white truncate max-w-[200px]">{rfi.subject}</span>
                              {rfi.is_overdue && <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />}
                            </div>
                          </TableCell>
                          <TableCell className="text-zinc-300 text-sm">{categoryLabels[rfi.category] || rfi.category}</TableCell>
                          <TableCell><Badge className={`${priority.bg} ${priority.text} border-0`}>{priority.label}</Badge></TableCell>
                          <TableCell><Badge className={`${status.bg} ${status.text} border-0`}>{status.label}</Badge></TableCell>
                          <TableCell className="text-sm">
                            {rfi.ball_in_court_name ? (
                              <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 text-amber-300 px-2 py-0.5 text-xs">
                                {rfi.ball_in_court_name}
                              </span>
                            ) : <span className="text-zinc-600">—</span>}
                          </TableCell>
                          <TableCell className="text-zinc-400 text-sm">{formatDate(rfi.due_date)}</TableCell>
                          <TableCell className="text-zinc-500 text-sm">{rfi.created_at ? formatDistanceToNow(new Date(rfi.created_at), { addSuffix: true }) : '—'}</TableCell>
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

      {/* Create RFI Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Create New RFI</DialogTitle>
            <DialogDescription className="text-zinc-400">Submit a new Request for Information</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-zinc-300">Subject *</Label>
              <Input placeholder="Brief description of the RFI" value={formData.subject || ''} onChange={(e) => setFormData({ ...formData, subject: e.target.value })} className="bg-zinc-800 border-zinc-700" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-300">Category</Label>
                <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v as RfiCategory })}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(categoryLabels).map(([value, label]) => (<SelectItem key={value} value={value}>{label}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Priority</Label>
                <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v as RfiPriority })}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(priorityConfig).map(([value, config]) => (<SelectItem key={value} value={value}>{config.label}</SelectItem>))}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Due Date</Label>
              <Input type="date" value={formData.due_date || ''} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} className="bg-zinc-800 border-zinc-700" />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Question / Description *</Label>
              <Textarea placeholder="Detailed description of the information needed..." value={formData.question || ''} onChange={(e) => setFormData({ ...formData, question: e.target.value })} className="bg-zinc-800 border-zinc-700 min-h-[120px]" />
            </div>
            <div className="flex items-center gap-2 py-2">
              <input 
                type="checkbox" 
                id="submit-immediately"
                checked={formData.submit_immediately || false}
                onChange={(e) => setFormData({ ...formData, submit_immediately: e.target.checked })}
                className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
              />
              <Label htmlFor="submit-immediately" className="text-zinc-300 text-sm cursor-pointer">
                Submit immediately (make available for client response)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="border-zinc-700">Cancel</Button>
            <Button onClick={handleCreateRfi} disabled={creating} className="bg-amber-600 hover:bg-amber-700">
              {creating ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</>) : (<><Send className="h-4 w-4 mr-2" />{formData.submit_immediately ? 'Create & Submit RFI' : 'Create RFI'}</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RFI Detail Sheet */}
      <Sheet open={showDetailSheet} onOpenChange={setShowDetailSheet}>
        <SheetContent className="bg-zinc-900 border-zinc-800 w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="text-white flex items-center gap-2">
              <span className="font-mono text-amber-500">{selectedRfi?.rfi_number}</span>
              {selectedRfi && (<Badge className={`${statusConfig[selectedRfi.status].bg} ${statusConfig[selectedRfi.status].text} border-0`}>{statusConfig[selectedRfi.status].label}</Badge>)}
            </SheetTitle>
          </SheetHeader>
          {selectedRfi && (
            <div className="mt-6 space-y-6">
              <div>
                <h3 className="text-lg font-medium text-white mb-2">{selectedRfi.subject}</h3>
                <div className="flex flex-wrap gap-2 text-sm text-zinc-400">
                  <span>{categoryLabels[selectedRfi.category]}</span>
                  <span>•</span>
                  <Badge className={`${priorityConfig[selectedRfi.priority].bg} ${priorityConfig[selectedRfi.priority].text} border-0`}>{priorityConfig[selectedRfi.priority].label}</Badge>
                </div>
              </div>
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-800">
                  <h4 className="text-sm font-medium text-zinc-400 mb-2">Question</h4>
                  <p className="text-zinc-200 text-sm whitespace-pre-wrap">{selectedRfi.question}</p>
                </div>
                {selectedRfi.response && (
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <h4 className="text-sm font-medium text-green-400 mb-2">Response</h4>
                    <p className="text-zinc-200 text-sm whitespace-pre-wrap">{selectedRfi.response}</p>
                    {selectedRfi.responded_by_name && (<p className="text-xs text-zinc-500 mt-2">Responded by {selectedRfi.responded_by_name} on {formatDate(selectedRfi.responded_at)}</p>)}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1"><p className="text-zinc-500">Submitted By</p><p className="text-zinc-200">{selectedRfi.submitted_by_name || '—'}</p></div>
                <div className="space-y-1"><p className="text-zinc-500">Assigned To</p><p className="text-zinc-200">{selectedRfi.assigned_to_name || '—'}</p></div>
                <div className="space-y-1">
                  <p className="text-zinc-500">Due Date</p>
                  <p className={`${selectedRfi.is_overdue ? 'text-red-400' : 'text-zinc-200'}`}>
                    {formatDate(selectedRfi.due_date)}
                    {selectedRfi.is_overdue && selectedRfi.days_overdue && (<span className="ml-2 text-xs">({selectedRfi.days_overdue} days overdue)</span>)}
                  </p>
                </div>
                <div className="space-y-1"><p className="text-zinc-500">Created</p><p className="text-zinc-200">{formatDate(selectedRfi.created_at)}</p></div>
              </div>
              {(selectedRfi.cost_impact || selectedRfi.schedule_impact_days) && (
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <h4 className="text-sm font-medium text-amber-400 mb-2">Impact Assessment</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {selectedRfi.cost_impact !== undefined && (<div><p className="text-zinc-500">Cost Impact</p><p className="text-zinc-200 font-medium">${selectedRfi.cost_impact.toLocaleString()}</p></div>)}
                    {selectedRfi.schedule_impact_days !== undefined && (<div><p className="text-zinc-500">Schedule Impact</p><p className="text-zinc-200 font-medium">{selectedRfi.schedule_impact_days} days</p></div>)}
                  </div>
                </div>
              )}
              
              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-zinc-800">
                {selectedRfi.status === 'draft' && (
                  <Button
                    onClick={() => handleSubmitRfi(selectedRfi)}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-mono"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Submit RFI
                  </Button>
                )}
                {selectedRfi.status === 'answered' && (
                  <Button
                    onClick={async () => {
                      try {
                        await rfisApi.close(selectedRfi.id);
                        toast.success('RFI closed successfully');
                        fetchData();
                        setShowDetailSheet(false);
                      } catch (error) {
                        toast.error('Failed to close RFI');
                      }
                    }}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-mono"
                  >
                    Close RFI
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
