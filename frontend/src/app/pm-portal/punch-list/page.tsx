'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  ClipboardCheck, 
  Plus, 
  Search, 
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  ArrowLeft,
  MapPin,
  User,
  Calendar,
  XCircle,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
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
  punchListsApi, 
  projectsApi,
  PunchItem,
  PunchItemStatus,
  PunchItemPriority,
  Project
} from '@/lib/pm-portal-api';

type PunchCategory = 'architectural' | 'structural' | 'mechanical' | 'electrical' | 'plumbing' | 'fire_protection' | 'finish' | 'site' | 'other';

const statusConfig: Record<PunchItemStatus, { label: string; bg: string; text: string; icon: React.ElementType }> = {
  open: { label: 'Open', bg: 'bg-red-500/20', text: 'text-red-400', icon: AlertCircle },
  in_progress: { label: 'In Progress', bg: 'bg-yellow-500/20', text: 'text-yellow-400', icon: Clock },
  ready_for_inspection: { label: 'Ready for Inspection', bg: 'bg-blue-500/20', text: 'text-blue-400', icon: CheckCircle2 },
  completed: { label: 'Completed', bg: 'bg-blue-500/20', text: 'text-blue-400', icon: CheckCircle2 },
  closed: { label: 'Closed', bg: 'bg-green-500/20', text: 'text-green-400', icon: CheckCircle2 },
};

const priorityConfig: Record<PunchItemPriority, { label: string; bg: string; text: string }> = {
  low: { label: 'Low', bg: 'bg-zinc-500/20', text: 'text-zinc-400' },
  medium: { label: 'Medium', bg: 'bg-blue-500/20', text: 'text-blue-400' },
  high: { label: 'High', bg: 'bg-orange-500/20', text: 'text-orange-400' },
  critical: { label: 'Critical', bg: 'bg-red-500/20', text: 'text-red-400' },
};

const categoryLabels: Record<PunchCategory, string> = {
  architectural: 'Architectural',
  structural: 'Structural',
  mechanical: 'Mechanical',
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  fire_protection: 'Fire Protection',
  finish: 'Finish',
  site: 'Site',
  other: 'Other',
};

export default function PunchListPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params?.id as string | undefined;
  
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PunchItem[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<PunchItemStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<PunchCategory | 'all'>('all');
  const [activeTab, setActiveTab] = useState('open');
  const [selectedItem, setSelectedItem] = useState<PunchItem | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(searchParams?.get('new') === 'true');
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [creating, setCreating] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    location: '',
    category: 'architectural' as PunchCategory,
    priority: 'medium' as PunchItemPriority,
    assigned_to: '',
    due_date: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const itemsResponse = await punchListsApi.getAll({
        projectId,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        search: searchQuery || undefined,
      });
      
      setItems(itemsResponse.data);
      
      if (projectId) {
        try {
          const proj = await projectsApi.getById(projectId);
          setProject(proj);
        } catch {}
      }
    } catch (error) {
      console.error('Failed to fetch punch list:', error);
      toast.error('Failed to load punch list');
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter, categoryFilter, searchQuery]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateItem = async () => {
    if (!formData.title || !formData.location) {
      toast.error('Please fill in required fields');
      return;
    }
    
    if (!projectId) {
      toast.error('Project ID is required');
      return;
    }
    
    setCreating(true);
    try {
      await punchListsApi.create(projectId, {
        title: formData.title,
        description: formData.description,
        location: formData.location,
        category: formData.category,
        priority: formData.priority,
        assigned_to: formData.assigned_to || undefined,
        due_date: formData.due_date || undefined,
      });
      
      toast.success('Punch item created successfully');
      setShowCreateDialog(false);
      setFormData({
        title: '',
        description: '',
        location: '',
        category: 'architectural',
        priority: 'medium',
        assigned_to: '',
        due_date: '',
      });
      fetchData();
    } catch (error) {
      console.error('Failed to create punch item:', error);
      toast.error('Failed to create punch item');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateStatus = async (item: PunchItem, newStatus: PunchItemStatus) => {
    if (!projectId) {
      toast.error('Project ID is required');
      return;
    }
    try {
      await punchListsApi.update(projectId, item.id, { status: newStatus });
      toast.success(`Item marked as ${statusConfig[newStatus].label}`);
      fetchData();
      setShowDetailSheet(false);
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleViewItem = (item: PunchItem) => {
    setSelectedItem(item);
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

  const getFilteredItems = () => {
    let filtered = [...items];
    
    if (activeTab === 'open') {
      filtered = filtered.filter(i => i.status === 'open' || i.status === 'in_progress');
    } else if (activeTab === 'completed') {
      filtered = filtered.filter(i => i.status === 'completed' || i.status === 'ready_for_inspection');
    } else if (activeTab === 'verified') {
      filtered = filtered.filter(i => i.status === 'closed');
    }
    
    return filtered;
  };

  const filteredItems = getFilteredItems();
  const openCount = items.filter(i => i.status === 'open' || i.status === 'in_progress').length;
  const completedCount = items.filter(i => i.status === 'completed' || i.status === 'ready_for_inspection').length;
  const verifiedCount = items.filter(i => i.status === 'closed').length;
  const criticalCount = items.filter(i => i.priority === 'critical' && i.status !== 'closed').length;
  const completionRate = items.length > 0 ? Math.round((verifiedCount / items.length) * 100) : 0;

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
            <div className="h-10 w-10 rounded-lg bg-rose-500/10 flex items-center justify-center">
              <ClipboardCheck className="h-5 w-5 text-rose-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Punch List</h1>
              <p className="text-zinc-400 text-sm">Track and resolve project deficiencies</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
          <Button className="bg-rose-600 hover:bg-rose-700" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />Add Item
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Total Items</p>
            <p className="text-2xl font-bold text-white mt-1">{items.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800 border-red-500/30">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Open</p>
            <p className="text-2xl font-bold text-red-400 mt-1">{openCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Completed</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">{completedCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Verified</p>
            <p className="text-2xl font-bold text-green-400 mt-1">{verifiedCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800 col-span-2 sm:col-span-1">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Completion</p>
            <div className="flex items-center gap-2 mt-1">
              <Progress value={completionRate} className="h-2 flex-1" />
              <span className="text-lg font-bold text-white">{completionRate}%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Critical Alert */}
      {criticalCount > 0 && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-400" />
          <p className="text-red-400"><span className="font-bold">{criticalCount} critical item{criticalCount !== 1 ? 's' : ''}</span> require immediate attention</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input placeholder="Search punch list..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500" />
        </div>
        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as PunchCategory | 'all')}>
          <SelectTrigger className="w-[160px] bg-zinc-900 border-zinc-800"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(categoryLabels).map(([value, label]) => (<SelectItem key={value} value={value}>{label}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs and List */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-zinc-800 border-zinc-700">
          <TabsTrigger value="open" className={openCount > 0 ? 'text-red-400' : ''}>Open ({openCount})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completedCount})</TabsTrigger>
          <TabsTrigger value="verified">Verified ({verifiedCount})</TabsTrigger>
          <TabsTrigger value="all">All ({items.length})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-rose-500" /></div>
          ) : filteredItems.length === 0 ? (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="py-12 text-center">
                <ClipboardCheck className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">
                  {activeTab === 'open' ? 'No Open Items' : activeTab === 'verified' ? 'No Verified Items Yet' : 'No Punch Items'}
                </h3>
                <p className="text-zinc-400 text-sm mb-4">
                  {activeTab === 'open' ? 'Great job! All items have been addressed.' : 'Add items to track project deficiencies'}
                </p>
                {activeTab !== 'verified' && (
                  <Button onClick={() => setShowCreateDialog(true)} className="bg-rose-600 hover:bg-rose-700"><Plus className="h-4 w-4 mr-2" />Add Item</Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredItems.map((item) => {
                const status = statusConfig[item.status as PunchItemStatus] || statusConfig.open;
                const priority = priorityConfig[item.priority as PunchItemPriority] || priorityConfig.medium;
                const StatusIcon = status.icon;
                return (
                  <Card key={item.id} className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer" onClick={() => handleViewItem(item)}>
                    <CardContent className="py-4 px-5">
                      <div className="flex items-center gap-4">
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${status.bg}`}>
                          <StatusIcon className={`h-5 w-5 ${status.text}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs text-zinc-500">#{item.item_number}</span>
                            <Badge className={`${priority.bg} ${priority.text} border-0 text-xs`}>{priority.label}</Badge>
                            <span className="text-xs text-zinc-500">{categoryLabels[item.category as PunchCategory] || item.category}</span>
                          </div>
                          <p className="text-white font-medium truncate">{item.title}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-zinc-400">
                            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{item.location}</span>
                            {item.assigned_to_name && (<span className="flex items-center gap-1"><User className="h-3 w-3" />{item.assigned_to_name}</span>)}
                            {item.due_date && (<span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(item.due_date)}</span>)}
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-zinc-600" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Item Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Add Punch Item</DialogTitle>
            <DialogDescription className="text-zinc-400">Document a deficiency or issue to be resolved</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-zinc-300">Title *</Label>
              <Input placeholder="Brief description of the issue" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="bg-zinc-800 border-zinc-700" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-300">Location *</Label>
                <Input placeholder="e.g. Room 205" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} className="bg-zinc-800 border-zinc-700" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Category</Label>
                <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v as PunchCategory })}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(categoryLabels).map(([value, label]) => (<SelectItem key={value} value={value}>{label}</SelectItem>))}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-300">Priority</Label>
                <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v as PunchItemPriority })}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(priorityConfig).map(([value, config]) => (<SelectItem key={value} value={value}>{config.label}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Due Date</Label>
                <Input type="date" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} className="bg-zinc-800 border-zinc-700" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Description</Label>
              <Textarea placeholder="Detailed description of the issue..." value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="bg-zinc-800 border-zinc-700 min-h-[80px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="border-zinc-700">Cancel</Button>
            <Button onClick={handleCreateItem} disabled={creating} className="bg-rose-600 hover:bg-rose-700">
              {creating ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Adding...</>) : (<><Plus className="h-4 w-4 mr-2" />Add Item</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item Detail Sheet */}
      <Sheet open={showDetailSheet} onOpenChange={setShowDetailSheet}>
        <SheetContent className="bg-zinc-900 border-zinc-800 w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="text-white flex items-center gap-2">
              <span className="font-mono text-rose-400">#{selectedItem?.item_number}</span>
              {selectedItem && (<Badge className={`${statusConfig[selectedItem.status as PunchItemStatus].bg} ${statusConfig[selectedItem.status as PunchItemStatus].text} border-0`}>{statusConfig[selectedItem.status as PunchItemStatus].label}</Badge>)}
            </SheetTitle>
          </SheetHeader>
          {selectedItem && (
            <div className="mt-6 space-y-6">
              <div>
                <h3 className="text-lg font-medium text-white mb-2">{selectedItem.title}</h3>
                <div className="flex flex-wrap gap-2">
                  <Badge className={`${priorityConfig[selectedItem.priority as PunchItemPriority].bg} ${priorityConfig[selectedItem.priority as PunchItemPriority].text} border-0`}>
                    {priorityConfig[selectedItem.priority as PunchItemPriority].label} Priority
                  </Badge>
                  <Badge variant="outline" className="border-zinc-700 text-zinc-300">{categoryLabels[selectedItem.category as PunchCategory] || selectedItem.category}</Badge>
                </div>
              </div>
              
              <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-800">
                <div className="flex items-center gap-2 text-zinc-300">
                  <MapPin className="h-4 w-4 text-zinc-500" />
                  <span>{selectedItem.location}</span>
                </div>
              </div>
              
              {selectedItem.description && (
                <div>
                  <h4 className="text-sm font-medium text-zinc-400 mb-2">Description</h4>
                  <p className="text-zinc-200 text-sm whitespace-pre-wrap">{selectedItem.description}</p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1"><p className="text-zinc-500">Assigned To</p><p className="text-zinc-200">{selectedItem.assigned_to_name || 'Unassigned'}</p></div>
                <div className="space-y-1"><p className="text-zinc-500">Due Date</p><p className="text-zinc-200">{formatDate(selectedItem.due_date)}</p></div>
                <div className="space-y-1"><p className="text-zinc-500">Created By</p><p className="text-zinc-200">{selectedItem.created_by_name || '—'}</p></div>
                <div className="space-y-1"><p className="text-zinc-500">Created</p><p className="text-zinc-200">{formatDate(selectedItem.created_at)}</p></div>
              </div>
              
              {/* Status Actions */}
              <div className="pt-4 border-t border-zinc-800">
                <h4 className="text-sm font-medium text-zinc-400 mb-3">Update Status</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedItem.status === 'open' && (
                    <Button size="sm" className="bg-yellow-600 hover:bg-yellow-700" onClick={() => handleUpdateStatus(selectedItem, 'in_progress')}>
                      <Clock className="h-4 w-4 mr-1" />Start Work
                    </Button>
                  )}
                  {(selectedItem.status === 'open' || selectedItem.status === 'in_progress') && (
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => handleUpdateStatus(selectedItem, 'ready_for_inspection')}>
                      <CheckCircle2 className="h-4 w-4 mr-1" />Ready for Inspection
                    </Button>
                  )}
                  {selectedItem.status === 'ready_for_inspection' && (
                    <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleUpdateStatus(selectedItem, 'closed')}>
                      <CheckCircle2 className="h-4 w-4 mr-1" />Approve & Close
                    </Button>
                  )}
                  {selectedItem.status === 'completed' && (
                    <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleUpdateStatus(selectedItem, 'closed')}>
                      <CheckCircle2 className="h-4 w-4 mr-1" />Close Item
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
