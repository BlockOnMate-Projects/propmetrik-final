'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, Plus, Camera, MapPin, AlertTriangle, Check, Clock, 
  Building2, Layers, User, Calendar, Tag, MessageSquare, Image,
  CheckCircle2, Circle, AlertCircle, Wrench,
  Trash2, Edit, Eye, RefreshCw, Loader2, MoreHorizontal
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { authedFetch } from '@/lib/authed-fetch';
import { punchListSchema, validateForm } from '@/lib/schemas/pm.schemas';
import { FieldError, FormErrorSummary } from '@/components/ui/form-errors';
import { Pagination } from '@/components/ui/pagination-controls';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const fetch = authedFetch;

// Types
type PunchItemStatus = 'open' | 'in_progress' | 'ready_for_review' | 'verified' | 'deferred' | 'cancelled';
type PunchPriority = 'critical' | 'high' | 'medium' | 'low';

interface PunchItem {
  id: string;
  unitId: string;
  unitName?: string;
  projectName?: string;
  title: string;
  description?: string;
  category?: string;
  priority: PunchPriority;
  status: PunchItemStatus;
  location?: string;
  assignedContractorId?: string;
  contractorName?: string;
  dueDate?: string;
  photoCount: number;
  createdAt: string;
  completedAt?: string;
  isOverdue?: boolean;
}

interface Project {
  id: string;
  name: string;
}

interface FormData {
  unitId: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  location: string;
  dueDate: string;
}

const defaultFormData: FormData = {
  unitId: '',
  title: '',
  description: '',
  category: 'deficiency',
  priority: 'medium',
  location: '',
  dueDate: '',
};

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  open: { label: 'Open', color: 'bg-blue-900/50 text-blue-400', icon: Circle },
  in_progress: { label: 'In Progress', color: 'bg-yellow-900/50 text-yellow-400', icon: Clock },
  ready_for_review: { label: 'Ready for Review', color: 'bg-purple-900/50 text-purple-400', icon: Eye },
  verified: { label: 'Verified', color: 'bg-emerald-900/50 text-emerald-400', icon: CheckCircle2 },
  deferred: { label: 'Deferred', color: 'bg-orange-900/50 text-orange-400', icon: AlertTriangle },
  cancelled: { label: 'Cancelled', color: 'bg-zinc-700 text-zinc-400', icon: AlertCircle },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  critical: { label: 'Critical', color: 'bg-red-900/50 text-red-400' },
  high: { label: 'High', color: 'bg-orange-900/50 text-orange-400' },
  medium: { label: 'Medium', color: 'bg-yellow-900/50 text-yellow-400' },
  low: { label: 'Low', color: 'bg-blue-900/50 text-blue-400' },
};

const categoryLabels: Record<string, string> = {
  deficiency: 'Deficiency',
  incomplete: 'Incomplete',
  damage: 'Damage',
  missing: 'Missing',
  cosmetic: 'Cosmetic',
  safety: 'Safety',
  code_violation: 'Code Violation',
  warranty: 'Warranty',
  other: 'Other',
};

export default function PunchListsPage() {
  const [punchItems, setPunchItems] = useState<PunchItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  // Dialog states
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showViewSheet, setShowViewSheet] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PunchItem | null>(null);
  const [formData, setFormData] = useState<FormData>(defaultFormData);
  const [formErrors, setFormErrors] = useState<Record<string, string[]> | null>(null);
  
  const { toast } = useToast();

  // Stats
  const stats = {
    total: punchItems.length,
    open: punchItems.filter(i => i.status === 'open').length,
    inProgress: punchItems.filter(i => i.status === 'in_progress').length,
    readyForReview: punchItems.filter(i => i.status === 'ready_for_review').length,
    verified: punchItems.filter(i => i.status === 'verified').length,
    critical: punchItems.filter(i => i.priority === 'critical').length,
  };

  // Fetch punch items
  const fetchPunchItems = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      if (priorityFilter && priorityFilter !== 'all') {
        params.append('priority', priorityFilter);
      }
      params.append('limit', '20');
      params.append('page', String(page));

      const response = await fetch(`${API_BASE}/projects/punch-lists?${params}`);
      const result = await response.json();
      
      if (result.success !== false) {
        const items = result.data || result.items || [];
        setPunchItems(items);
        const total = result.total || result.pagination?.total || items.length;
        setTotalCount(total);
        setTotalPages(Math.ceil(total / 20));
      } else {
        throw new Error(result.error || 'Failed to fetch punch items');
      }
    } catch (error: any) {
      console.error('Error fetching punch items:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch punch items',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, page, toast]);

  // Fetch projects
  const fetchProjects = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/projects?pageSize=100`);
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
    fetchPunchItems();
  }, [fetchPunchItems]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validation = validateForm(punchListSchema, formData);
    if (!validation.success) { setFormErrors(validation.errors!); return; }
    setFormErrors(null);

    try {
      setSubmitting(true);
      
      const payload = {
        unitId: formData.unitId,
        title: formData.title,
        description: formData.description || null,
        category: formData.category,
        priority: formData.priority,
        location: formData.location || null,
        dueDate: formData.dueDate || null,
      };

      const isEdit = showEditDialog && selectedItem;
      const url = isEdit 
        ? `${API_BASE}/projects/punch-lists/${selectedItem.id}`
        : `${API_BASE}/projects/punch-lists`;
      
      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success !== false && !result.error) {
        toast({
          title: 'Success',
          description: isEdit ? 'Punch item updated successfully' : 'Punch item created successfully',
        });
        setShowNewDialog(false);
        setShowEditDialog(false);
        setFormData(defaultFormData);
        setSelectedItem(null);
        fetchPunchItems();
      } else {
        throw new Error(result.error || 'Failed to save punch item');
      }
    } catch (error: any) {
      console.error('Error saving punch item:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save punch item',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Status action handlers
  const handleStatusAction = async (item: PunchItem, action: string) => {
    try {
      setSubmitting(true);
      let url = `${API_BASE}/projects/punch-lists/${item.id}/${action}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const result = await response.json();

      if (result.success !== false && !result.error) {
        toast({
          title: 'Success',
          description: `Item ${action} successfully`,
        });
        fetchPunchItems();
      } else {
        throw new Error(result.error || `Failed to ${action} item`);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || `Failed to ${action} item`,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!selectedItem) return;

    try {
      setSubmitting(true);
      const response = await fetch(`${API_BASE}/projects/punch-lists/${selectedItem.id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success !== false && !result.error) {
        toast({
          title: 'Success',
          description: 'Punch item deleted successfully',
        });
        setShowDeleteDialog(false);
        setSelectedItem(null);
        fetchPunchItems();
      } else {
        throw new Error(result.error || 'Failed to delete punch item');
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete punch item',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Open edit dialog
  const openEditDialog = (item: PunchItem) => {
    setSelectedItem(item);
    setFormData({
      unitId: item.unitId,
      title: item.title,
      description: item.description || '',
      category: item.category || 'deficiency',
      priority: item.priority,
      location: item.location || '',
      dueDate: item.dueDate?.split('T')[0] || '',
    });
    setShowEditDialog(true);
  };

  // Open view sheet
  const openViewSheet = (item: PunchItem) => {
    setSelectedItem(item);
    setShowViewSheet(true);
  };

  // Open delete dialog
  const openDeleteDialog = (item: PunchItem) => {
    setSelectedItem(item);
    setShowDeleteDialog(true);
  };

  const filteredItems = punchItems.filter(item =>
    item.title?.toLowerCase().includes(search.toLowerCase()) ||
    item.location?.toLowerCase().includes(search.toLowerCase()) ||
    item.projectName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Punch Lists</h1>
          <p className="text-zinc-400 text-sm mt-1">Track and manage punch list items across projects.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="border-zinc-700" onClick={fetchPunchItems}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => setShowNewDialog(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Item
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Total</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.total}</p>
              </div>
              <Wrench className="h-5 w-5 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Open</p>
                <p className="text-2xl font-bold text-blue-400 mt-1">{stats.open}</p>
              </div>
              <Circle className="h-5 w-5 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">In Progress</p>
                <p className="text-2xl font-bold text-yellow-400 mt-1">{stats.inProgress}</p>
              </div>
              <Clock className="h-5 w-5 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">For Review</p>
                <p className="text-2xl font-bold text-purple-400 mt-1">{stats.readyForReview}</p>
              </div>
              <Eye className="h-5 w-5 text-purple-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Verified</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{stats.verified}</p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Critical</p>
                <p className="text-2xl font-bold text-red-400 mt-1">{stats.critical}</p>
              </div>
              <AlertTriangle className="h-5 w-5 text-red-500" />
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
              placeholder="Search punch items..."
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
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="ready_for_review">For Review</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[150px] bg-zinc-900 border-zinc-800">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      ) : filteredItems.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="py-12 text-center">
            <Wrench className="h-12 w-12 mx-auto text-zinc-700 mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No Punch Items Found</h3>
            <p className="text-zinc-400 mb-4">
              {search || statusFilter !== 'all' || priorityFilter !== 'all' 
                ? 'Try adjusting your filters' 
                : 'Create your first punch item to get started'}
            </p>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => setShowNewDialog(true)}>
              <Plus className="h-4 w-4 mr-2" /> New Item
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const status = statusConfig[item.status] || statusConfig['open'];
            const priority = priorityConfig[item.priority] || priorityConfig['medium'];
            const StatusIcon = status.icon;

            return (
              <Card key={item.id} className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge className={`${status.color} gap-1`}>
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </Badge>
                        <Badge className={priority.color}>
                          {priority.label}
                        </Badge>
                        {item.category && (
                          <Badge className="bg-zinc-800 text-zinc-300">
                            {categoryLabels[item.category] || item.category}
                          </Badge>
                        )}
                        {item.isOverdue && (
                          <Badge className="bg-red-900/50 text-red-400">
                            Overdue
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-semibold text-white mb-1">{item.title}</h3>
                      {item.description && (
                        <p className="text-sm text-zinc-400 line-clamp-2 mb-2">{item.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-zinc-500 flex-wrap">
                        {item.projectName && (
                          <div className="flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5" />
                            {item.projectName}
                          </div>
                        )}
                        {item.location && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {item.location}
                          </div>
                        )}
                        {item.contractorName && (
                          <div className="flex items-center gap-1">
                            <User className="h-3.5 w-3.5" />
                            {item.contractorName}
                          </div>
                        )}
                        {item.dueDate && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {new Date(item.dueDate).toLocaleDateString('en-GB')}
                          </div>
                        )}
                        {item.photoCount > 0 && (
                          <div className="flex items-center gap-1">
                            <Camera className="h-3.5 w-3.5" />
                            {item.photoCount}
                          </div>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                        <DropdownMenuItem onClick={() => openViewSheet(item)}>
                          <Eye className="h-4 w-4 mr-2" /> View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEditDialog(item)}>
                          <Edit className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-zinc-800" />
                        {item.status === 'open' && (
                          <DropdownMenuItem 
                            className="text-yellow-400"
                            onClick={() => handleStatusAction(item, 'start')}
                          >
                            <Clock className="h-4 w-4 mr-2" /> Start Work
                          </DropdownMenuItem>
                        )}
                        {item.status === 'in_progress' && (
                          <DropdownMenuItem 
                            className="text-purple-400"
                            onClick={() => handleStatusAction(item, 'complete')}
                          >
                            <Check className="h-4 w-4 mr-2" /> Mark Complete
                          </DropdownMenuItem>
                        )}
                        {item.status === 'ready_for_review' && (
                          <DropdownMenuItem 
                            className="text-emerald-400"
                            onClick={() => handleStatusAction(item, 'verify')}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-2" /> Verify
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator className="bg-zinc-800" />
                        <DropdownMenuItem 
                          className="text-red-400"
                          onClick={() => openDeleteDialog(item)}
                        >
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

      <Pagination page={page} totalPages={totalPages} total={totalCount} limit={20} onPageChange={setPage} />

      {/* New/Edit Dialog */}
      <Dialog open={showNewDialog || showEditDialog} onOpenChange={(open) => {
        if (!open) {
          setShowNewDialog(false);
          setShowEditDialog(false);
        }
      }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">
              {showEditDialog ? 'Edit Punch Item' : 'Create Punch Item'}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Fill in the details for the punch item.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label className="text-zinc-300">Title *</Label>
                <Input 
                  placeholder="Brief description of the issue"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  className="bg-zinc-800 border-zinc-700" 
                />
              </div>
              
              <div className="space-y-2">
                <Label className="text-zinc-300">Description</Label>
                <Textarea 
                  placeholder="Detailed description..."
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-300">Category</Label>
                  <Select 
                    value={formData.category}
                    onValueChange={(value) => setFormData({...formData, category: value})}
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deficiency">Deficiency</SelectItem>
                      <SelectItem value="incomplete">Incomplete</SelectItem>
                      <SelectItem value="damage">Damage</SelectItem>
                      <SelectItem value="missing">Missing</SelectItem>
                      <SelectItem value="cosmetic">Cosmetic</SelectItem>
                      <SelectItem value="safety">Safety</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300">Priority</Label>
                  <Select 
                    value={formData.priority}
                    onValueChange={(value) => setFormData({...formData, priority: value})}
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-zinc-300">Location</Label>
                <Input 
                  placeholder="Building, floor, room..."
                  value={formData.location}
                  onChange={(e) => setFormData({...formData, location: e.target.value})}
                  className="bg-zinc-800 border-zinc-700" 
                />
              </div>

              <div className="space-y-2">
                <Label className="text-zinc-300">Due Date</Label>
                <Input 
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                  className="bg-zinc-800 border-zinc-700" 
                />
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
                {showEditDialog ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Sheet */}
      <Sheet open={showViewSheet} onOpenChange={setShowViewSheet}>
        <SheetContent className="bg-zinc-900 border-zinc-800 w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="text-white">Punch Item Details</SheetTitle>
            <SheetDescription className="text-zinc-400">
              {selectedItem?.title}
            </SheetDescription>
          </SheetHeader>
          {selectedItem && (
            <div className="mt-6 space-y-6">
              <div className="flex items-center gap-2 flex-wrap">
                {(() => {
                  const status = statusConfig[selectedItem.status] || statusConfig['open'];
                  const StatusIcon = status.icon;
                  return (
                    <Badge className={`${status.color} gap-1`}>
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </Badge>
                  );
                })()}
                <Badge className={priorityConfig[selectedItem.priority]?.color || 'bg-zinc-700'}>
                  {priorityConfig[selectedItem.priority]?.label || selectedItem.priority}
                </Badge>
              </div>

              {selectedItem.description && (
                <div>
                  <Label className="text-zinc-500 text-xs uppercase">Description</Label>
                  <p className="text-zinc-300 mt-1">{selectedItem.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {selectedItem.projectName && (
                  <div>
                    <Label className="text-zinc-500 text-xs uppercase">Project</Label>
                    <p className="text-white mt-1">{selectedItem.projectName}</p>
                  </div>
                )}
                {selectedItem.location && (
                  <div>
                    <Label className="text-zinc-500 text-xs uppercase">Location</Label>
                    <p className="text-white mt-1">{selectedItem.location}</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {selectedItem.category && (
                  <div>
                    <Label className="text-zinc-500 text-xs uppercase">Category</Label>
                    <p className="text-white mt-1">{categoryLabels[selectedItem.category] || selectedItem.category}</p>
                  </div>
                )}
                {selectedItem.dueDate && (
                  <div>
                    <Label className="text-zinc-500 text-xs uppercase">Due Date</Label>
                    <p className="text-white mt-1">{new Date(selectedItem.dueDate).toLocaleDateString('en-GB')}</p>
                  </div>
                )}
              </div>

              {selectedItem.contractorName && (
                <div>
                  <Label className="text-zinc-500 text-xs uppercase">Assigned To</Label>
                  <p className="text-white mt-1">{selectedItem.contractorName}</p>
                </div>
              )}

              <div className="pt-4 border-t border-zinc-800 flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1 border-zinc-700"
                  onClick={() => { setShowViewSheet(false); openEditDialog(selectedItem); }}
                >
                  <Edit className="h-4 w-4 mr-2" /> Edit
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-white">Delete Punch Item</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Are you sure you want to delete this punch item? This action cannot be undone.
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
