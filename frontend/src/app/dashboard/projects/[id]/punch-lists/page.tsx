'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  ArrowLeft,
  RefreshCw,
  Loader2,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Calendar,
  User,
  MapPin,
  PlayCircle,
  XCircle,
  Flag
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import ProjectSubnav from '@/components/dashboard/projects/ProjectSubnav';
import { authedFetch } from '@/lib/authed-fetch';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const fetch = authedFetch;

type PunchListStatus = 'open' | 'in_progress' | 'ready_for_review' | 'completed' | 'rejected';
type PunchListPriority = 'low' | 'medium' | 'high' | 'critical';
type PunchListCategory = 'structural' | 'electrical' | 'plumbing' | 'hvac' | 'finishes' | 'exterior' | 'safety' | 'other';

interface PunchListItem {
  id: string;
  projectId: string;
  projectName?: string;
  title: string;
  description?: string;
  status: PunchListStatus;
  priority: PunchListPriority;
  category: PunchListCategory;
  location?: string;
  dueDate?: string;
  assignedToName?: string;
  createdByName?: string;
  createdAt: string;
  completedAt?: string;
}

interface Project {
  id: string;
  name: string;
}

const statusConfig: Record<PunchListStatus, { label: string; color: string; icon: any }> = {
  open: { label: 'Open', color: 'bg-zinc-700 text-zinc-300', icon: Clock },
  in_progress: { label: 'In Progress', color: 'bg-blue-900/50 text-blue-400', icon: PlayCircle },
  ready_for_review: { label: 'Ready for Review', color: 'bg-yellow-900/50 text-yellow-400', icon: Eye },
  completed: { label: 'Completed', color: 'bg-emerald-900/50 text-emerald-400', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'bg-red-900/50 text-red-400', icon: XCircle }
};

const priorityConfig: Record<PunchListPriority, { label: string; color: string }> = {
  low: { label: 'Low', color: 'bg-zinc-700 text-zinc-300' },
  medium: { label: 'Medium', color: 'bg-blue-900/50 text-blue-400' },
  high: { label: 'High', color: 'bg-orange-900/50 text-orange-400' },
  critical: { label: 'Critical', color: 'bg-red-900/50 text-red-400' }
};

const categoryLabels: Record<PunchListCategory, string> = {
  structural: 'Structural',
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  hvac: 'HVAC',
  finishes: 'Finishes',
  exterior: 'Exterior',
  safety: 'Safety',
  other: 'Other'
};

export default function ProjectPunchListsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [items, setItems] = useState<PunchListItem[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  
  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PunchListItem | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium' as PunchListPriority,
    category: 'other' as PunchListCategory,
    location: '',
    dueDate: ''
  });
  
  const { toast } = useToast();

  // Stats
  const stats = {
    total: items.length,
    open: items.filter(i => i.status === 'open').length,
    inProgress: items.filter(i => i.status === 'in_progress').length,
    completed: items.filter(i => i.status === 'completed').length,
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

  // Fetch items
  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('projectId', projectId);
      if (statusFilter && statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      if (priorityFilter && priorityFilter !== 'all') {
        params.append('priority', priorityFilter);
      }
      params.append('pageSize', '100');

      const response = await fetch(`${API_BASE}/projects/punch-lists?${params}`);
      const result = await response.json();
      
      if (result.success) {
        setItems(result.data || []);
      } else {
        throw new Error(result.error || 'Failed to fetch punch list items');
      }
    } catch (error: any) {
      console.error('Error fetching punch list items:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch punch list items',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter, priorityFilter, toast]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Reset form
  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      priority: 'medium',
      category: 'other',
      location: '',
      dueDate: ''
    });
  };

  // Handle create
  const handleCreate = async () => {
    if (!formData.title.trim()) {
      toast({ title: 'Error', description: 'Title is required', variant: 'destructive' });
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(`${API_BASE}/projects/punch-lists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          ...formData,
          dueDate: formData.dueDate || null
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({ title: 'Success', description: 'Punch list item created' });
        setShowCreateDialog(false);
        resetForm();
        fetchItems();
      } else {
        throw new Error(result.error || 'Failed to create punch list item');
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle update
  const handleUpdate = async () => {
    if (!selectedItem) return;

    try {
      setSubmitting(true);
      const response = await fetch(`${API_BASE}/projects/punch-lists/${selectedItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          dueDate: formData.dueDate || null
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({ title: 'Success', description: 'Punch list item updated' });
        setShowEditDialog(false);
        setSelectedItem(null);
        fetchItems();
      } else {
        throw new Error(result.error || 'Failed to update punch list item');
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
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

      if (result.success) {
        toast({ title: 'Success', description: 'Punch list item deleted' });
        setShowDeleteDialog(false);
        setSelectedItem(null);
        fetchItems();
      } else {
        throw new Error(result.error || 'Failed to delete punch list item');
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // Status transitions
  const handleStatusChange = async (item: PunchListItem, newStatus: PunchListStatus) => {
    try {
      setSubmitting(true);
      const response = await fetch(`${API_BASE}/projects/punch-lists/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const result = await response.json();

      if (result.success) {
        toast({ title: 'Success', description: 'Status updated' });
        fetchItems();
      } else {
        throw new Error(result.error || 'Failed to update status');
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const openEditDialog = (item: PunchListItem) => {
    setSelectedItem(item);
    setFormData({
      title: item.title,
      description: item.description || '',
      priority: item.priority,
      category: item.category,
      location: item.location || '',
      dueDate: item.dueDate || ''
    });
    setShowEditDialog(true);
  };

  const openViewSheet = (item: PunchListItem) => {
    setSelectedItem(item);
    setShowDetailSheet(true);
  };

  const openDeleteDialog = (item: PunchListItem) => {
    setSelectedItem(item);
    setShowDeleteDialog(true);
  };

  const filteredItems = items.filter(item =>
    item.title?.toLowerCase().includes(search.toLowerCase()) ||
    item.description?.toLowerCase().includes(search.toLowerCase()) ||
    item.location?.toLowerCase().includes(search.toLowerCase())
  );

  const ItemForm = () => (
    <div className="space-y-4">
      <div>
        <Label className="text-zinc-400">Title *</Label>
        <Input
          className="bg-zinc-800 border-zinc-700 mt-1"
          placeholder="Item title..."
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-zinc-400">Description</Label>
        <Textarea
          className="bg-zinc-800 border-zinc-700 mt-1"
          rows={3}
          placeholder="Describe the issue..."
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-zinc-400">Priority</Label>
          <Select 
            value={formData.priority} 
            onValueChange={(v) => setFormData({ ...formData, priority: v as PunchListPriority })}
          >
            <SelectTrigger className="bg-zinc-800 border-zinc-700 mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-zinc-400">Category</Label>
          <Select 
            value={formData.category} 
            onValueChange={(v) => setFormData({ ...formData, category: v as PunchListCategory })}
          >
            <SelectTrigger className="bg-zinc-800 border-zinc-700 mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(categoryLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-zinc-400">Location</Label>
        <Input
          className="bg-zinc-800 border-zinc-700 mt-1"
          placeholder="e.g., Building A, Floor 2"
          value={formData.location}
          onChange={(e) => setFormData({ ...formData, location: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-zinc-400">Due Date</Label>
        <Input
          type="date"
          className="bg-zinc-800 border-zinc-700 mt-1"
          value={formData.dueDate}
          onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
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
            <h1 className="text-2xl font-bold text-white tracking-tight">Punch Lists</h1>
            {project && (
              <p className="text-zinc-400 text-sm mt-1">{project.name}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="border-zinc-700" onClick={fetchItems}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button 
            className="bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => { resetForm(); setShowCreateDialog(true); }}
          >
            <Plus className="h-4 w-4 mr-2" /> New Item
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
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Total</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.total}</p>
              </div>
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Open</p>
                <p className="text-2xl font-bold text-zinc-400 mt-1">{stats.open}</p>
              </div>
              <Clock className="h-5 w-5 text-zinc-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">In Progress</p>
                <p className="text-2xl font-bold text-blue-400 mt-1">{stats.inProgress}</p>
              </div>
              <PlayCircle className="h-5 w-5 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Completed</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{stats.completed}</p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search items..."
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
            <SelectItem value="ready_for_review">Ready for Review</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[150px] bg-zinc-900 border-zinc-800">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      ) : filteredItems.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-zinc-700 mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No Punch List Items</h3>
            <p className="text-zinc-400 mb-4">Create a new item to track</p>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => { resetForm(); setShowCreateDialog(true); }}>
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
            const isOverdue = item.dueDate && 
              new Date(item.dueDate) < new Date() && 
              item.status !== 'completed';

            return (
              <Card key={item.id} className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <h3 className="font-medium text-white">{item.title}</h3>
                        <Badge className={status.color}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {status.label}
                        </Badge>
                        <Badge className={priority.color}>
                          <Flag className="h-3 w-3 mr-1" />
                          {priority.label}
                        </Badge>
                        {isOverdue && (
                          <Badge className="bg-red-900/50 text-red-400">Overdue</Badge>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-sm text-zinc-400 line-clamp-2 mb-2">{item.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-zinc-500 flex-wrap">
                        <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                          {categoryLabels[item.category]}
                        </Badge>
                        {item.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {item.location}
                          </span>
                        )}
                        {item.dueDate && (
                          <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-400' : ''}`}>
                            <Calendar className="h-3 w-3" /> {new Date(item.dueDate).toLocaleDateString('en-GB')}
                          </span>
                        )}
                        {item.assignedToName && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" /> {item.assignedToName}
                          </span>
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
                          <Pencil className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-zinc-800" />
                        {item.status === 'open' && (
                          <DropdownMenuItem onClick={() => handleStatusChange(item, 'in_progress')}>
                            <PlayCircle className="h-4 w-4 mr-2" /> Start Work
                          </DropdownMenuItem>
                        )}
                        {item.status === 'in_progress' && (
                          <DropdownMenuItem onClick={() => handleStatusChange(item, 'ready_for_review')}>
                            <Eye className="h-4 w-4 mr-2" /> Mark Ready for Review
                          </DropdownMenuItem>
                        )}
                        {item.status === 'ready_for_review' && (
                          <DropdownMenuItem onClick={() => handleStatusChange(item, 'completed')}>
                            <CheckCircle2 className="h-4 w-4 mr-2" /> Complete
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator className="bg-zinc-800" />
                        <DropdownMenuItem className="text-red-400" onClick={() => openDeleteDialog(item)}>
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
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">New Punch List Item</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Add a new item to track.
            </DialogDescription>
          </DialogHeader>
          <ItemForm />
          <DialogFooter className="mt-4">
            <Button variant="outline" className="border-zinc-700" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={handleCreate} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Punch List Item</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Update item details.
            </DialogDescription>
          </DialogHeader>
          <ItemForm />
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
            <DialogTitle className="text-white">Delete Item</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Are you sure you want to delete this punch list item? This action cannot be undone.
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
            <SheetTitle className="text-white">{selectedItem?.title}</SheetTitle>
            <SheetDescription className="text-zinc-400">
              Punch list item details
            </SheetDescription>
          </SheetHeader>
          {selectedItem && (
            <div className="mt-6 space-y-6">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={statusConfig[selectedItem.status]?.color}>
                  {statusConfig[selectedItem.status]?.label}
                </Badge>
                <Badge className={priorityConfig[selectedItem.priority]?.color}>
                  {priorityConfig[selectedItem.priority]?.label}
                </Badge>
                <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                  {categoryLabels[selectedItem.category]}
                </Badge>
              </div>

              {selectedItem.description && (
                <div>
                  <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Description</h4>
                  <p className="text-zinc-300 whitespace-pre-wrap">{selectedItem.description}</p>
                </div>
              )}

              {selectedItem.location && (
                <div>
                  <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Location</h4>
                  <p className="text-white">{selectedItem.location}</p>
                </div>
              )}

              {selectedItem.dueDate && (
                <div>
                  <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Due Date</h4>
                  <p className="text-white">{new Date(selectedItem.dueDate).toLocaleDateString('en-GB')}</p>
                </div>
              )}

              {selectedItem.assignedToName && (
                <div>
                  <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Assigned To</h4>
                  <p className="text-white">{selectedItem.assignedToName}</p>
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t border-zinc-800">
                <Button className="flex-1 bg-amber-600 hover:bg-amber-700" onClick={() => {
                  setShowDetailSheet(false);
                  openEditDialog(selectedItem);
                }}>
                  <Pencil className="h-4 w-4 mr-2" /> Edit
                </Button>
                <Button variant="outline" className="flex-1 border-zinc-700 text-red-400 hover:text-red-300" onClick={() => {
                  setShowDetailSheet(false);
                  openDeleteDialog(selectedItem);
                }}>
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
