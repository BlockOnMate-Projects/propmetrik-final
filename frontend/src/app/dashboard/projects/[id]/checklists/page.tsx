'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ClipboardList,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
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
  ChevronDown,
  CheckCircle
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

type ChecklistStatus = 'not_started' | 'in_progress' | 'completed' | 'failed';

interface ChecklistTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  itemCount: number;
}

interface ChecklistInstance {
  id: string;
  templateId: string;
  templateName?: string;
  projectId: string;
  projectName?: string;
  title: string;
  status: ChecklistStatus;
  completedCount: number;
  totalCount: number;
  dueDate?: string;
  assignedToName?: string;
  createdAt: string;
  completedAt?: string;
}

interface Project {
  id: string;
  name: string;
}

const statusConfig: Record<ChecklistStatus, { label: string; color: string; icon: any }> = {
  not_started: { label: 'Not Started', color: 'bg-zinc-700 text-zinc-300', icon: Clock },
  in_progress: { label: 'In Progress', color: 'bg-blue-900/50 text-blue-400', icon: AlertCircle },
  completed: { label: 'Completed', color: 'bg-emerald-900/50 text-emerald-400', icon: CheckCircle2 },
  failed: { label: 'Failed', color: 'bg-red-900/50 text-red-400', icon: AlertCircle }
};

export default function ProjectChecklistsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [instances, setInstances] = useState<ChecklistInstance[]>([]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('inspections');
  
  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<ChecklistInstance | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    templateId: '',
    title: '',
    dueDate: ''
  });
  
  const { toast } = useToast();

  // Stats
  const stats = {
    total: instances.length,
    inProgress: instances.filter(i => i.status === 'in_progress').length,
    completed: instances.filter(i => i.status === 'completed').length,
    overdue: instances.filter(i => {
      if (!i.dueDate || i.status === 'completed') return false;
      return new Date(i.dueDate) < new Date();
    }).length
  };

  // Fetch project
  const fetchProject = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/projects/${projectId}`);
      const result = await response.json();
      if (result.success) {
        setProject(result.data);
      }
    } catch (error) {
      console.error('Error fetching project:', error);
    }
  }, [projectId]);

  // Fetch instances
  const fetchInstances = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('projectId', projectId);
      if (statusFilter && statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      params.append('pageSize', '100');

      const response = await fetch(`${API_BASE}/api/checklists/instances?${params}`);
      const result = await response.json();
      
      if (result.success) {
        setInstances(result.data || []);
      } else {
        throw new Error(result.error || 'Failed to fetch checklists');
      }
    } catch (error: any) {
      console.error('Error fetching checklists:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch checklists',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter, toast]);

  // Fetch templates
  const fetchTemplates = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/checklists/templates?pageSize=100`);
      const result = await response.json();
      
      if (result.success) {
        setTemplates(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  }, []);

  useEffect(() => {
    fetchProject();
    fetchTemplates();
  }, [fetchProject, fetchTemplates]);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  // Reset form
  const resetForm = () => {
    setFormData({
      templateId: '',
      title: '',
      dueDate: ''
    });
  };

  // Handle create
  const handleCreate = async () => {
    if (!formData.templateId) {
      toast({ title: 'Error', description: 'Please select a template', variant: 'destructive' });
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(`${API_BASE}/api/checklists/instances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: formData.templateId,
          projectId,
          title: formData.title || templates.find(t => t.id === formData.templateId)?.name,
          dueDate: formData.dueDate || null
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({ title: 'Success', description: 'Checklist created' });
        setShowCreateDialog(false);
        resetForm();
        fetchInstances();
      } else {
        throw new Error(result.error || 'Failed to create checklist');
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!selectedInstance) return;

    try {
      setSubmitting(true);
      const response = await fetch(`${API_BASE}/api/checklists/instances/${selectedInstance.id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        toast({ title: 'Success', description: 'Checklist deleted' });
        setShowDeleteDialog(false);
        setSelectedInstance(null);
        fetchInstances();
      } else {
        throw new Error(result.error || 'Failed to delete checklist');
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const openViewSheet = (instance: ChecklistInstance) => {
    setSelectedInstance(instance);
    setShowDetailSheet(true);
  };

  const openDeleteDialog = (instance: ChecklistInstance) => {
    setSelectedInstance(instance);
    setShowDeleteDialog(true);
  };

  const filteredInstances = instances.filter(instance =>
    instance.title?.toLowerCase().includes(search.toLowerCase()) ||
    instance.templateName?.toLowerCase().includes(search.toLowerCase())
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
            <h1 className="text-2xl font-bold text-white tracking-tight">Checklists</h1>
            {project && (
              <p className="text-zinc-400 text-sm mt-1">{project.name}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="border-zinc-700" onClick={fetchInstances}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button 
            className="bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => { resetForm(); setShowCreateDialog(true); }}
          >
            <Plus className="h-4 w-4 mr-2" /> New Checklist
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
              <ClipboardList className="h-5 w-5 text-amber-500" />
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
              <AlertCircle className="h-5 w-5 text-blue-500" />
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
              <CheckCircle className="h-5 w-5 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Overdue</p>
                <p className="text-2xl font-bold text-red-400 mt-1">{stats.overdue}</p>
              </div>
              <Clock className="h-5 w-5 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search checklists..."
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
            <SelectItem value="not_started">Not Started</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      ) : filteredInstances.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="py-12 text-center">
            <ClipboardList className="h-12 w-12 mx-auto text-zinc-700 mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No Checklists</h3>
            <p className="text-zinc-400 mb-4">Create a checklist for this project</p>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => { resetForm(); setShowCreateDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" /> New Checklist
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredInstances.map((instance) => {
            const status = statusConfig[instance.status] || statusConfig['not_started'];
            const StatusIcon = status.icon;
            const progress = instance.totalCount > 0 
              ? Math.round((instance.completedCount / instance.totalCount) * 100) 
              : 0;
            const isOverdue = instance.dueDate && 
              new Date(instance.dueDate) < new Date() && 
              instance.status !== 'completed';

            return (
              <Card key={instance.id} className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-medium text-white">{instance.title}</h3>
                        <Badge className={status.color}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {status.label}
                        </Badge>
                        {isOverdue && (
                          <Badge className="bg-red-900/50 text-red-400">Overdue</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mb-3">
                        <Progress value={progress} className="h-2 flex-1 max-w-xs" />
                        <span className="text-xs text-zinc-400">
                          {instance.completedCount}/{instance.totalCount} items
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-zinc-500">
                        {instance.dueDate && (
                          <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-400' : ''}`}>
                            <Calendar className="h-3 w-3" /> 
                            Due {new Date(instance.dueDate).toLocaleDateString()}
                          </span>
                        )}
                        {instance.assignedToName && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" /> {instance.assignedToName}
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
                        <DropdownMenuItem onClick={() => openViewSheet(instance)}>
                          <Eye className="h-4 w-4 mr-2" /> View Details
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-zinc-800" />
                        <DropdownMenuItem className="text-red-400" onClick={() => openDeleteDialog(instance)}>
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
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-white">New Checklist</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Create a new checklist from a template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-zinc-400">Template *</Label>
              <Select 
                value={formData.templateId} 
                onValueChange={(v) => setFormData({ ...formData, templateId: v })}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 mt-1">
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} ({template.itemCount} items)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-zinc-400">Title (optional)</Label>
              <Input
                className="bg-zinc-800 border-zinc-700 mt-1"
                placeholder="Custom title..."
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
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

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-white">Delete Checklist</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Are you sure you want to delete this checklist? This action cannot be undone.
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
            <SheetTitle className="text-white">{selectedInstance?.title}</SheetTitle>
            <SheetDescription className="text-zinc-400">
              Checklist details and progress
            </SheetDescription>
          </SheetHeader>
          {selectedInstance && (
            <div className="mt-6 space-y-6">
              <div>
                <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Status</h4>
                <Badge className={statusConfig[selectedInstance.status]?.color}>
                  {statusConfig[selectedInstance.status]?.label}
                </Badge>
              </div>

              <div>
                <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Progress</h4>
                <div className="flex items-center gap-2">
                  <Progress 
                    value={selectedInstance.totalCount > 0 
                      ? (selectedInstance.completedCount / selectedInstance.totalCount) * 100 
                      : 0} 
                    className="h-2 flex-1" 
                  />
                  <span className="text-sm text-zinc-400">
                    {selectedInstance.completedCount}/{selectedInstance.totalCount}
                  </span>
                </div>
              </div>

              {selectedInstance.dueDate && (
                <div>
                  <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Due Date</h4>
                  <p className="text-white">{new Date(selectedInstance.dueDate).toLocaleDateString()}</p>
                </div>
              )}

              {selectedInstance.assignedToName && (
                <div>
                  <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Assigned To</h4>
                  <p className="text-white">{selectedInstance.assignedToName}</p>
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t border-zinc-800">
                <Button 
                  variant="outline" 
                  className="flex-1 border-zinc-700 text-red-400 hover:text-red-300" 
                  onClick={() => {
                    setShowDetailSheet(false);
                    openDeleteDialog(selectedInstance);
                  }}
                >
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
