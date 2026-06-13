'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Flag,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Loader2,
  Search,
  Filter,
  MoreHorizontal,
  Pencil,
  Trash2,
  PlayCircle,
  Check,
  List,
  GanttChartSquare,
  Layers,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import ProjectSubnav from '@/components/dashboard/projects/ProjectSubnav';
import { MilestoneGantt } from '@/components/dashboard/projects/MilestoneGantt';
import { MilestoneSubphases } from '@/components/dashboard/projects/MilestoneSubphases';
import { 
  milestonesApi, 
  Milestone, 
  MilestoneStatus,
  CreateMilestoneData,
  UpdateMilestoneData
} from '@/lib/pm-portal-api';
import { format, formatDistanceToNow, isPast, parseISO } from 'date-fns';

// =====================================================
// STATUS CONFIG
// =====================================================
const statusConfig: Record<MilestoneStatus | 'not_started', { 
  icon: React.ElementType; 
  color: string; 
  bg: string;
  label: string;
}> = {
  pending: { icon: Clock, color: 'text-muted-foreground', bg: 'bg-zinc-500/20', label: 'Pending' },
  not_started: { icon: Clock, color: 'text-muted-foreground', bg: 'bg-zinc-500/20', label: 'Not Started' },
  in_progress: { icon: PlayCircle, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/20', label: 'In Progress' },
  completed: { icon: CheckCircle2, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-500/20', label: 'Completed' },
  overdue: { icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/20', label: 'Overdue' },
  cancelled: { icon: AlertTriangle, color: 'text-muted-foreground', bg: 'bg-zinc-600/20', label: 'Cancelled' },
};

// =====================================================
// MILESTONE CARD
// =====================================================
function MilestoneCard({ 
  milestone,
  projectId,
  onEdit,
  onComplete,
  onDelete,
  onStatusChange,
}: { 
  milestone: Milestone;
  projectId: string;
  onEdit: (milestone: Milestone) => void;
  onComplete: (milestone: Milestone) => void;
  onDelete: (milestone: Milestone) => void;
  onStatusChange: (milestone: Milestone, status: MilestoneStatus) => void;
}) {
  const status = (milestone.status as MilestoneStatus) || 'pending';
  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;
  
  const dueDate = milestone.due_date ? parseISO(milestone.due_date) : null;
  const isOverdue = dueDate && isPast(dueDate) && status !== 'completed' && status !== 'cancelled';
  
  return (
    <Card className={cn(
      "bg-card border-border transition-all hover:border-border",
      isOverdue && "border-red-500/50"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", config.bg)}>
            <Icon className={cn("h-5 w-5", config.color)} />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="font-medium text-sm text-foreground truncate">{milestone.name}</h4>
                {milestone.phase_name && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">{milestone.phase_name}</p>
                )}
              </div>
              
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className={cn("text-[9px] border-0", config.bg, config.color)}>
                  {config.label}
                </Badge>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-card border-border">
                    <DropdownMenuItem onClick={() => onEdit(milestone)} className="text-xs">
                      <Pencil className="h-3.5 w-3.5 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    
                    {status !== 'completed' && status !== 'cancelled' && (
                      <>
                        <DropdownMenuItem onClick={() => onStatusChange(milestone, 'in_progress')} className="text-xs">
                          <PlayCircle className="h-3.5 w-3.5 mr-2" />
                          Start Progress
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onComplete(milestone)} className="text-xs text-green-600 dark:text-green-400">
                          <Check className="h-3.5 w-3.5 mr-2" />
                          Mark Complete
                        </DropdownMenuItem>
                      </>
                    )}
                    
                    <DropdownMenuSeparator className="bg-muted" />
                    <DropdownMenuItem onClick={() => onDelete(milestone)} className="text-xs text-red-600 dark:text-red-400">
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            
            {milestone.description && (
              <p className="text-[11px] text-muted-foreground mt-2 line-clamp-2">
                {milestone.description}
              </p>
            )}
            
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Calendar className="h-3 w-3" />
                <span className={cn("text-[10px]", isOverdue && "text-red-600 dark:text-red-400")}>
                  {dueDate ? format(dueDate, 'MMM d, yyyy') : 'No date'}
                  {dueDate && !isOverdue && ` (${formatDistanceToNow(dueDate, { addSuffix: true })})`}
                  {isOverdue && ' (overdue)'}
                </span>
              </div>
              
              {milestone.progress !== undefined && milestone.progress > 0 && (
                <div className="flex items-center gap-2">
                  <Progress value={milestone.progress} className="w-16 h-1.5" />
                  <span className="text-[10px] text-muted-foreground">{milestone.progress}%</span>
                </div>
              )}
            </div>
            
            {/* Sub-phases Section */}
            <MilestoneSubphases 
              projectId={projectId}
              milestone={milestone}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================
// CREATE/EDIT MILESTONE DIALOG
// =====================================================
function MilestoneDialog({ 
  open,
  onOpenChange,
  milestone,
  projectId,
  onSuccess,
}: { 
  open: boolean;
  onOpenChange: (open: boolean) => void;
  milestone?: Milestone | null;
  projectId: string;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    target_date: string;
  }>({
    name: '',
    description: '',
    target_date: '',
  });
  
  useEffect(() => {
    if (milestone) {
      setFormData({
        name: milestone.name || '',
        description: milestone.description || '',
        target_date: milestone.due_date ? milestone.due_date.split('T')[0] : '',
      });
    } else {
      setFormData({ name: '', description: '', target_date: '' });
    }
  }, [milestone, open]);
  
  const handleSubmit = async () => {
    if (!formData.name.trim()) return;
    
    try {
      setIsSubmitting(true);
      
      if (milestone) {
        await milestonesApi.update(projectId, milestone.id, {
          name: formData.name,
          description: formData.description || undefined,
          target_date: formData.target_date || undefined,
        });
      } else {
        await milestonesApi.create(projectId, {
          name: formData.name,
          description: formData.description || undefined,
          target_date: formData.target_date || undefined,
        });
      }
      
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Failed to save milestone:', error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {milestone ? 'Edit Milestone' : 'Create Milestone'}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {milestone ? 'Update milestone details' : 'Add a new milestone to track project progress'}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Milestone Name *</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Foundation Complete"
              className="bg-muted border-border text-sm"
            />
          </div>
          
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe the milestone..."
              className="bg-muted border-border text-sm min-h-[80px]"
            />
          </div>
          
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Target Date</Label>
            <Input
              type="date"
              value={formData.target_date}
              onChange={(e) => setFormData(prev => ({ ...prev, target_date: e.target.value }))}
              className="bg-muted border-border text-sm"
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-xs">
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={isSubmitting || !formData.name.trim()}
            className="bg-amber-600 hover:bg-amber-700 text-foreground text-xs"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {milestone ? 'Update' : 'Create'} Milestone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================
// MAIN PAGE
// =====================================================
export default function ProjectMilestonesPage() {
  const { id: projectId } = useParams() as { id: string };
  
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCompleted, setShowCompleted] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [deletingMilestone, setDeletingMilestone] = useState<Milestone | null>(null);
  
  const fetchMilestones = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await milestonesApi.getAll(projectId, { includeCompleted: showCompleted });
      setMilestones(data);
    } catch (error) {
      console.error('Failed to fetch milestones:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, showCompleted]);
  
  useEffect(() => {
    fetchMilestones();
  }, [fetchMilestones]);
  
  const handleEdit = (milestone: Milestone) => {
    setEditingMilestone(milestone);
    setDialogOpen(true);
  };
  
  const handleCreate = () => {
    setEditingMilestone(null);
    setDialogOpen(true);
  };
  
  const handleComplete = async (milestone: Milestone) => {
    try {
      await milestonesApi.complete(projectId, milestone.id);
      fetchMilestones();
    } catch (error) {
      console.error('Failed to complete milestone:', error);
    }
  };
  
  const handleStatusChange = async (milestone: Milestone, status: MilestoneStatus) => {
    try {
      await milestonesApi.update(projectId, milestone.id, { status });
      fetchMilestones();
    } catch (error) {
      console.error('Failed to update milestone status:', error);
    }
  };
  
  const handleDelete = async () => {
    if (!deletingMilestone) return;
    
    try {
      await milestonesApi.delete(projectId, deletingMilestone.id);
      setDeletingMilestone(null);
      fetchMilestones();
    } catch (error) {
      console.error('Failed to delete milestone:', error);
    }
  };
  
  // Filter milestones
  const filteredMilestones = milestones.filter((m) => {
    if (statusFilter !== 'all' && m.status !== statusFilter) return false;
    if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  
  // Group milestones
  const upcomingMilestones = filteredMilestones.filter(
    m => m.status !== 'completed' && m.status !== 'cancelled'
  );
  const completedMilestones = filteredMilestones.filter(
    m => m.status === 'completed' || m.status === 'cancelled'
  );
  
  // Stats
  const stats = {
    total: milestones.length,
    completed: milestones.filter(m => m.status === 'completed').length,
    inProgress: milestones.filter(m => m.status === 'in_progress').length,
    overdue: milestones.filter(m => {
      if (m.status === 'completed' || m.status === 'cancelled') return false;
      if (!m.due_date) return false;
      return isPast(parseISO(m.due_date));
    }).length,
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Milestones</h1>
        <p className="text-muted-foreground text-sm mt-1">Track and manage project milestones.</p>
      </div>

      <ProjectSubnav projectId={projectId} />
      
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Flag className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-lg font-bold text-foreground">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="text-lg font-bold text-foreground">{stats.completed}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <PlayCircle className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">In Progress</p>
                <p className="text-lg font-bold text-foreground">{stats.inProgress}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-9 w-9 rounded-lg flex items-center justify-center",
                stats.overdue > 0 ? "bg-red-500/10" : "bg-muted"
              )}>
                <AlertTriangle className={cn(
                  "h-4 w-4",
                  stats.overdue > 0 ? "text-red-500" : "text-muted-foreground"
                )} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Overdue</p>
                <p className={cn(
                  "text-lg font-bold",
                  stats.overdue > 0 ? "text-red-600 dark:text-red-400" : "text-foreground"
                )}>{stats.overdue}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full sm:w-auto">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-card border border-border rounded-lg p-1">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors",
                viewMode === 'list' 
                  ? "bg-amber-500/20 text-amber-600 dark:text-amber-400" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="h-3.5 w-3.5" />
              List
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors",
                viewMode === 'timeline' 
                  ? "bg-amber-500/20 text-amber-600 dark:text-amber-400" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <GanttChartSquare className="h-3.5 w-3.5" />
              Timeline
            </button>
          </div>
          
          {viewMode === 'list' && (
            <>
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search milestones..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 bg-card border-border text-sm"
                />
              </div>
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[150px] bg-card border-border text-sm">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="all" className="text-xs">All Status</SelectItem>
                  <SelectItem value="pending" className="text-xs">Pending</SelectItem>
                  <SelectItem value="in_progress" className="text-xs">In Progress</SelectItem>
                  <SelectItem value="completed" className="text-xs">Completed</SelectItem>
                  <SelectItem value="overdue" className="text-xs">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
        </div>
        
        <Button 
          onClick={handleCreate}
          className="bg-amber-600 hover:bg-amber-700 text-foreground text-xs w-full sm:w-auto"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Milestone
        </Button>
      </div>
      
      {/* Timeline / Gantt View */}
      {viewMode === 'timeline' && (
        <MilestoneGantt
          milestones={filteredMilestones}
          onMilestoneClick={(milestone) => {
            setEditingMilestone(milestone);
            setDialogOpen(true);
          }}
        />
      )}
      
      {/* List View */}
      {viewMode === 'list' && (
        <>
          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
          )}
          
          {/* Empty State */}
          {!isLoading && filteredMilestones.length === 0 && (
            <Card className="bg-card border-border">
              <CardContent className="p-12 text-center">
                <Flag className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
                <h3 className="text-sm text-foreground mb-2">No milestones found</h3>
                <p className="text-[11px] text-muted-foreground mb-4">
                  {milestones.length === 0 
                    ? 'Create your first milestone to start tracking progress'
                    : 'Try adjusting your filters'}
                </p>
                {milestones.length === 0 && (
                  <Button 
                    onClick={handleCreate}
                    className="bg-amber-600 hover:bg-amber-700 text-foreground text-xs"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Milestone
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
      
          {/* Milestones List */}
          {!isLoading && filteredMilestones.length > 0 && (
            <div className="space-y-6">
              {/* Upcoming */}
              {upcomingMilestones.length > 0 && (
                <div>
                  <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
                    Upcoming ({upcomingMilestones.length})
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {upcomingMilestones.map((milestone) => (
                      <MilestoneCard 
                        key={milestone.id} 
                        milestone={milestone}
                        projectId={projectId}
                        onEdit={handleEdit}
                        onComplete={handleComplete}
                        onDelete={setDeletingMilestone}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                  </div>
                </div>
              )}
              
              {/* Completed */}
              {completedMilestones.length > 0 && (
                <div>
                  <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
                    Completed ({completedMilestones.length})
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {completedMilestones.map((milestone) => (
                      <MilestoneCard 
                        key={milestone.id} 
                        milestone={milestone}
                        projectId={projectId}
                        onEdit={handleEdit}
                        onComplete={handleComplete}
                        onDelete={setDeletingMilestone}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
      
      {/* Create/Edit Dialog */}
      <MilestoneDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        milestone={editingMilestone}
        projectId={projectId}
        onSuccess={fetchMilestones}
      />
      
      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingMilestone} onOpenChange={() => setDeletingMilestone(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete Milestone</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to delete &quot;{deletingMilestone?.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-muted border-border text-muted-foreground hover:bg-zinc-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
