'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardCheck,
  Plus,
  Search,
  Calendar,
  User,
  Building2,
  Check,
  X,
  AlertCircle,
  Clock,
  FileText,
  Layers,
  Eye,
  Play,
  Copy,
  Edit,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Star,
  BarChart3
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { authedFetch } from '@/lib/authed-fetch';
import { checklistSchema, validateForm } from '@/lib/schemas/pm.schemas';
import { FieldError, FormErrorSummary } from '@/components/ui/form-errors';
import { Pagination } from '@/components/ui/pagination-controls';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
const fetch = authedFetch;

// Types
type ChecklistStatus = 
  | 'draft' | 'scheduled' | 'in_progress' | 'pending_review' 
  | 'approved' | 'rejected' | 'requires_reinspection' | 'cancelled';

interface ChecklistTemplate {
  id: string;
  templateCode: string;
  name: string;
  description?: string;
  templateType: string;
  categoryName?: string;
  version: number;
  isPublished: boolean;
  itemCount: number;
  sectionCount: number;
  estimatedDuration?: number;
  createdAt: string;
}

interface ChecklistInstance {
  id: string;
  instanceNumber: string;
  templateId: string;
  templateName: string;
  projectId: string;
  projectName: string;
  unitName?: string;
  location?: string;
  status: ChecklistStatus;
  overallResult?: string;
  overallScore?: number;
  totalItems: number;
  completedItems: number;
  passedItems: number;
  failedItems: number;
  assignedToName?: string;
  dueDate?: string;
  createdAt: string;
  completedAt?: string;
}

interface Project {
  id: string;
  name: string;
}

interface CreateInstanceData {
  templateId: string;
  projectId: string;
  unitId?: string;
  location?: string;
  assignedTo?: string;
  scheduledDate?: string;
  dueDate?: string;
  notes?: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: 'Draft', color: 'bg-zinc-700 text-muted-foreground', icon: FileText },
  scheduled: { label: 'Scheduled', color: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400', icon: Calendar },
  in_progress: { label: 'In Progress', color: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-600 dark:text-yellow-400', icon: Clock },
  pending_review: { label: 'Pending Review', color: 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400', icon: Eye },
  approved: { label: 'Approved', color: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400', icon: XCircle },
  requires_reinspection: { label: 'Reinspection', color: 'bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400', icon: AlertTriangle },
  cancelled: { label: 'Cancelled', color: 'bg-zinc-700 text-muted-foreground', icon: AlertCircle },
};

const templateTypeLabels: Record<string, string> = {
  pre_construction: 'Pre-Construction',
  foundation: 'Foundation',
  structural: 'Structural',
  mep_rough_in: 'MEP Rough-In',
  mep_final: 'MEP Final',
  waterproofing: 'Waterproofing',
  exterior_envelope: 'Exterior',
  interior_finishes: 'Interior',
  safety: 'Safety',
  final_inspection: 'Final',
  handover: 'Handover',
  maintenance: 'Maintenance',
  custom: 'Custom',
};

export default function ChecklistsPage() {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [instances, setInstances] = useState<ChecklistInstance[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('inspections');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showViewSheet, setShowViewSheet] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ChecklistTemplate | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<ChecklistInstance | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string[]> | null>(null);
  const [createData, setCreateData] = useState<CreateInstanceData>({
    templateId: '',
    projectId: '',
    location: '',
    dueDate: '',
  });
  
  const { toast } = useToast();

  // Stats
  const stats = {
    total: instances.length,
    inProgress: instances.filter(i => i.status === 'in_progress').length,
    pendingReview: instances.filter(i => i.status === 'pending_review').length,
    approved: instances.filter(i => i.status === 'approved').length,
    passRate: instances.length > 0 
      ? Math.round((instances.filter(i => i.overallResult === 'pass').length / instances.length) * 100) 
      : 0,
    avgScore: instances.length > 0 
      ? Math.round(instances.reduce((s, i) => s + (i.overallScore || 0), 0) / instances.length) 
      : 0,
  };

  // Fetch templates
  const fetchTemplates = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/checklists/templates?isPublished=true&pageSize=50`);
      const result = await response.json();
      
      if (result.success) {
        setTemplates(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  }, []);

  // Fetch instances
  const fetchInstances = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      params.append('pageSize', '20');
      params.append('page', String(page));

      const response = await fetch(`${API_BASE}/api/checklists/instances?${params}`);
      const result = await response.json();
      
      if (result.success) {
        setInstances(result.data || []);
        const total = result.total || result.pagination?.total || (result.data || []).length;
        setTotalCount(total);
        setTotalPages(Math.ceil(total / 20));
      } else {
        throw new Error(result.error || 'Failed to fetch inspections');
      }
    } catch (error: any) {
      console.error('Error fetching instances:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch inspections',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, toast]);

  // Fetch projects
  const fetchProjects = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/projects?pageSize=100`);
      const result = await response.json();
      
      if (result.success) {
        setProjects(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
    fetchProjects();
  }, [fetchTemplates, fetchProjects]);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  // Create instance
  const handleCreateInstance = async () => {
    const validation = validateForm(checklistSchema, createData);
    if (!validation.success) { setFormErrors(validation.errors!); return; }
    setFormErrors(null);

    try {
      setSubmitting(true);
      
      const response = await fetch(`${API_BASE}/api/checklists/instances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createData),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Success',
          description: 'Inspection created successfully',
        });
        setShowCreateDialog(false);
        setSelectedTemplate(null);
        setCreateData({ templateId: '', projectId: '', location: '', dueDate: '' });
        fetchInstances();
      } else {
        throw new Error(result.error || 'Failed to create inspection');
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create inspection',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Start inspection from template
  const handleStartInspection = (template: ChecklistTemplate) => {
    setSelectedTemplate(template);
    setCreateData({ ...createData, templateId: template.id });
    setShowCreateDialog(true);
  };

  // View instance details
  const openViewSheet = (instance: ChecklistInstance) => {
    setSelectedInstance(instance);
    setShowViewSheet(true);
  };

  const filteredInstances = instances.filter(instance =>
    instance.instanceNumber?.toLowerCase().includes(search.toLowerCase()) ||
    instance.templateName?.toLowerCase().includes(search.toLowerCase()) ||
    instance.projectName?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredTemplates = templates.filter(template =>
    template.name?.toLowerCase().includes(search.toLowerCase()) ||
    template.templateCode?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Quality Checklists</h1>
          <p className="text-muted-foreground text-sm mt-1">Inspections & QC management for your projects.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="border-border" onClick={() => { fetchTemplates(); fetchInstances(); }}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button className="bg-amber-600 hover:bg-amber-700 text-foreground" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Inspection
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider">Total</p>
                <p className="text-2xl font-bold text-foreground mt-1">{stats.total}</p>
              </div>
              <ClipboardCheck className="h-5 w-5 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider">In Progress</p>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">{stats.inProgress}</p>
              </div>
              <Clock className="h-5 w-5 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider">Pending Review</p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">{stats.pendingReview}</p>
              </div>
              <Eye className="h-5 w-5 text-purple-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider">Pass Rate</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{stats.passRate}%</p>
              </div>
              <BarChart3 className="h-5 w-5 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider">Avg Score</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{stats.avgScore}%</p>
              </div>
              <Star className="h-5 w-5 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs and Filters */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="inspections" className="data-[state=active]:bg-zinc-700">
              <ClipboardCheck className="h-4 w-4 mr-2" /> Inspections
            </TabsTrigger>
            <TabsTrigger value="templates" className="data-[state=active]:bg-zinc-700">
              <Layers className="h-4 w-4 mr-2" /> Templates
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2 flex-1 sm:max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                className="pl-9 bg-card border-border"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {activeTab === 'inspections' && (
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px] bg-card border-border">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="pending_review">Pending Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Inspections Tab */}
        <TabsContent value="inspections">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
          ) : filteredInstances.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="py-12 text-center">
                <ClipboardCheck className="h-12 w-12 mx-auto text-zinc-700 mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">No Inspections Found</h3>
                <p className="text-muted-foreground mb-4">Create your first inspection to get started</p>
                <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" /> New Inspection
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredInstances.map((instance) => {
                const status = statusConfig[instance.status] || statusConfig['draft'];
                const StatusIcon = status.icon;
                const progressPercent = instance.totalItems > 0 
                  ? Math.round((instance.completedItems / instance.totalItems) * 100) 
                  : 0;
                
                return (
                  <Card 
                    key={instance.id} 
                    className="bg-card border-border hover:border-border transition-colors cursor-pointer"
                    onClick={() => openViewSheet(instance)}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <span className="text-xs font-mono text-muted-foreground">{instance.instanceNumber}</span>
                          <Badge className={`ml-2 ${status.color} gap-1`}>
                            <StatusIcon className="h-3 w-3" />
                            {status.label}
                          </Badge>
                        </div>
                        {instance.overallScore !== undefined && instance.overallScore > 0 && (
                          <span className={`text-sm font-semibold ${
                            instance.overallScore >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
                            instance.overallScore >= 60 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'
                          }`}>
                            {instance.overallScore.toFixed(0)}%
                          </span>
                        )}
                      </div>
                      
                      <h3 className="font-semibold text-foreground mb-2 line-clamp-1">{instance.templateName}</h3>
                      
                      <div className="space-y-2 text-sm text-muted-foreground mb-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5" />
                          <span className="line-clamp-1">{instance.projectName}</span>
                        </div>
                        {instance.location && (
                          <div className="flex items-center gap-2">
                            <Layers className="h-3.5 w-3.5" />
                            <span className="line-clamp-1">{instance.location}</span>
                          </div>
                        )}
                        {instance.assignedToName && (
                          <div className="flex items-center gap-2">
                            <User className="h-3.5 w-3.5" />
                            <span>{instance.assignedToName}</span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{instance.completedItems} / {instance.totalItems} items</span>
                          <span>{progressPercent}%</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden flex">
                          <div 
                            className="bg-emerald-500 transition-all" 
                            style={{ width: `${instance.totalItems > 0 ? (instance.passedItems / instance.totalItems) * 100 : 0}%` }}
                          />
                          <div 
                            className="bg-red-500 transition-all" 
                            style={{ width: `${instance.totalItems > 0 ? (instance.failedItems / instance.totalItems) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates">
          {filteredTemplates.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="py-12 text-center">
                <Layers className="h-12 w-12 mx-auto text-zinc-700 mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">No Templates Found</h3>
                <p className="text-muted-foreground">Checklist templates will appear here when available</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map((template) => (
                <Card key={template.id} className="bg-card border-border hover:border-border transition-colors">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span className="text-xs font-mono text-muted-foreground">{template.templateCode}</span>
                        <Badge className={`ml-2 ${template.isPublished ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400' : 'bg-zinc-700 text-muted-foreground'}`}>
                          {template.isPublished ? 'Published' : 'Draft'}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">v{template.version}</span>
                    </div>

                    <h3 className="font-semibold text-foreground mb-2">{template.name}</h3>
                    
                    {template.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{template.description}</p>
                    )}

                    <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                      <div className="flex items-center gap-1">
                        <Layers className="h-3.5 w-3.5" />
                        <span>{template.sectionCount} sections</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        <span>{template.itemCount} items</span>
                      </div>
                      {template.estimatedDuration && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{template.estimatedDuration}m</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-border">
                      <Badge className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                        {templateTypeLabels[template.templateType] || template.templateType}
                      </Badge>
                      {template.isPublished && (
                        <Button
                          size="sm"
                          className="bg-amber-600 hover:bg-amber-700"
                          onClick={() => handleStartInspection(template)}
                        >
                          <Play className="h-3.5 w-3.5 mr-1" /> Start
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Pagination page={page} totalPages={totalPages} total={totalCount} limit={20} onPageChange={setPage} />

      {/* Create Instance Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">Start New Inspection</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Create a new inspection from a template.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            {selectedTemplate && (
              <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/20 border border-blue-800/50">
                <p className="text-sm font-medium text-blue-600 dark:text-blue-400">{selectedTemplate.name}</p>
                <p className="text-xs text-blue-600 dark:text-blue-400/70 mt-1">
                  {selectedTemplate.sectionCount} sections • {selectedTemplate.itemCount} items
                </p>
              </div>
            )}

            {!selectedTemplate && (
              <div className="space-y-2">
                <Label className="text-muted-foreground">Template *</Label>
                <Select 
                  value={createData.templateId} 
                  onValueChange={(value) => setCreateData({...createData, templateId: value})}
                >
                  <SelectTrigger className="bg-muted border-border">
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.filter(t => t.isPublished).map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-muted-foreground">Project *</Label>
              <Select 
                value={createData.projectId} 
                onValueChange={(value) => setCreateData({...createData, projectId: value})}
              >
                <SelectTrigger className="bg-muted border-border">
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
              <Label className="text-muted-foreground">Location / Zone</Label>
              <Input 
                placeholder="e.g., Floor 3, Section B"
                value={createData.location}
                onChange={(e) => setCreateData({...createData, location: e.target.value})}
                className="bg-muted border-border" 
              />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Due Date</Label>
              <Input 
                type="date"
                value={createData.dueDate}
                onChange={(e) => setCreateData({...createData, dueDate: e.target.value})}
                className="bg-muted border-border" 
              />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button 
              variant="outline" 
              className="border-border" 
              onClick={() => { setShowCreateDialog(false); setSelectedTemplate(null); }}
            >
              Cancel
            </Button>
            <Button 
              className="bg-amber-600 hover:bg-amber-700 text-foreground"
              onClick={handleCreateInstance}
              disabled={submitting}
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create & Start
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Instance Sheet */}
      <Sheet open={showViewSheet} onOpenChange={setShowViewSheet}>
        <SheetContent className="bg-card border-border w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="text-foreground">{selectedInstance?.instanceNumber}</SheetTitle>
            <SheetDescription className="text-muted-foreground">
              {selectedInstance?.templateName}
            </SheetDescription>
          </SheetHeader>
          {selectedInstance && (
            <div className="mt-6 space-y-6">
              <div className="flex items-center gap-2">
                {(() => {
                  const status = statusConfig[selectedInstance.status] || statusConfig['draft'];
                  const StatusIcon = status.icon;
                  return (
                    <Badge className={`${status.color} gap-1`}>
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </Badge>
                  );
                })()}
                {selectedInstance.overallScore !== undefined && selectedInstance.overallScore > 0 && (
                  <Badge className={`${
                    selectedInstance.overallScore >= 80 ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400' :
                    selectedInstance.overallScore >= 60 ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-600 dark:text-yellow-400' : 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400'
                  }`}>
                    Score: {selectedInstance.overallScore.toFixed(1)}%
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-xs uppercase">Project</Label>
                  <p className="text-foreground mt-1">{selectedInstance.projectName}</p>
                </div>
                {selectedInstance.location && (
                  <div>
                    <Label className="text-muted-foreground text-xs uppercase">Location</Label>
                    <p className="text-foreground mt-1">{selectedInstance.location}</p>
                  </div>
                )}
              </div>

              <div>
                <Label className="text-muted-foreground text-xs uppercase mb-2 block">Progress</Label>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {selectedInstance.completedItems} / {selectedInstance.totalItems} items
                    </span>
                    <span className="text-foreground">
                      {selectedInstance.totalItems > 0 
                        ? Math.round((selectedInstance.completedItems / selectedInstance.totalItems) * 100) 
                        : 0}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden flex">
                    <div 
                      className="bg-emerald-500 transition-all" 
                      style={{ width: `${selectedInstance.totalItems > 0 ? (selectedInstance.passedItems / selectedInstance.totalItems) * 100 : 0}%` }}
                    />
                    <div 
                      className="bg-red-500 transition-all" 
                      style={{ width: `${selectedInstance.totalItems > 0 ? (selectedInstance.failedItems / selectedInstance.totalItems) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="flex gap-4 text-xs">
                    <span className="text-emerald-600 dark:text-emerald-400">{selectedInstance.passedItems} passed</span>
                    <span className="text-red-600 dark:text-red-400">{selectedInstance.failedItems} failed</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-xs uppercase">Created</Label>
                  <p className="text-foreground mt-1">{new Date(selectedInstance.createdAt).toLocaleDateString('en-GB')}</p>
                </div>
                {selectedInstance.dueDate && (
                  <div>
                    <Label className="text-muted-foreground text-xs uppercase">Due Date</Label>
                    <p className="text-foreground mt-1">{new Date(selectedInstance.dueDate).toLocaleDateString('en-GB')}</p>
                  </div>
                )}
              </div>

              {selectedInstance.assignedToName && (
                <div>
                  <Label className="text-muted-foreground text-xs uppercase">Assigned To</Label>
                  <p className="text-foreground mt-1">{selectedInstance.assignedToName}</p>
                </div>
              )}

              <div className="pt-4 border-t border-border flex gap-2">
                {selectedInstance.status === 'in_progress' && (
                  <Button className="flex-1 bg-amber-600 hover:bg-amber-700">
                    <Play className="h-4 w-4 mr-2" /> Continue Inspection
                  </Button>
                )}
                {selectedInstance.status === 'scheduled' && (
                  <Button className="flex-1 bg-amber-600 hover:bg-amber-700">
                    <Play className="h-4 w-4 mr-2" /> Start Inspection
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
