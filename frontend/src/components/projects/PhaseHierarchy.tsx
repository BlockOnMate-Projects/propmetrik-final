'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  PlayCircle,
  Check,
  ChevronRight,
  ChevronDown,
  Flag,
  Target,
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
import { Progress } from '@/components/ui/progress';
import { MilestoneSubphases } from '@/components/dashboard/projects/MilestoneSubphases';
import {
  milestonesApi,
  Milestone,
  MilestoneStatus,
  CreateMilestoneData,
} from '@/lib/pm-portal-api';
import type { ProjectPhase, PhaseStatus } from '@/types/projects';
import { format, formatDistanceToNow, isPast, parseISO } from 'date-fns';

// =====================================================
// PHASE STATUS CONFIG
// =====================================================
const phaseStatusColors: Record<string, { bg: string; text: string }> = {
  not_started: { bg: 'bg-zinc-700/50', text: 'text-muted-foreground' },
  pending: { bg: 'bg-zinc-700/50', text: 'text-muted-foreground' },
  in_progress: { bg: 'bg-amber-100 dark:bg-amber-900/50', text: 'text-amber-600 dark:text-amber-400' },
  completed: { bg: 'bg-green-100 dark:bg-green-900/50', text: 'text-green-600 dark:text-green-400' },
  delayed: { bg: 'bg-red-100 dark:bg-red-900/50', text: 'text-red-600 dark:text-red-400' },
  blocked: { bg: 'bg-red-100 dark:bg-red-900/50', text: 'text-red-600 dark:text-red-400' },
  cancelled: { bg: 'bg-muted/50', text: 'text-muted-foreground' },
};

// =====================================================
// MILESTONE STATUS CONFIG
// =====================================================
const milestoneStatusConfig: Record<string, {
  icon: React.ElementType;
  color: string;
  bg: string;
  label: string;
}> = {
  pending: { icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/20', label: 'Pending' },
  not_started: { icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/20', label: 'Not Started' },
  in_progress: { icon: PlayCircle, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/25', label: 'In Progress' },
  completed: { icon: CheckCircle2, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-500/25', label: 'Completed' },
  overdue: { icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/25', label: 'Overdue' },
  cancelled: { icon: AlertTriangle, color: 'text-muted-foreground', bg: 'bg-zinc-500/25', label: 'Cancelled' },
};

// =====================================================
// PROPS
// =====================================================
interface PhaseHierarchyProps {
  projectId: string;
  phases: ProjectPhase[];
  onPhasesRefresh: () => void;
}

// =====================================================
// MILESTONE CARD (within a phase)
// =====================================================
function PhaseMilestoneCard({
  milestone,
  projectId,
  onEdit,
  onComplete,
  onDelete,
  onStatusChange,
}: {
  milestone: Milestone;
  projectId: string;
  onEdit: (m: Milestone) => void;
  onComplete: (m: Milestone) => void;
  onDelete: (m: Milestone) => void;
  onStatusChange: (m: Milestone, status: MilestoneStatus) => void;
}) {
  const status = (milestone.status as string) || 'pending';
  const config = milestoneStatusConfig[status] || milestoneStatusConfig.pending;
  const Icon = config.icon;

  const dueDate = milestone.due_date ? parseISO(milestone.due_date) : null;
  const isOverdue = dueDate && isPast(dueDate) && status !== 'completed' && status !== 'cancelled';

  return (
    <div className={cn(
      "bg-muted/60 border border-border/50 rounded p-3 transition-all hover:border-zinc-600",
      isOverdue && "border-red-500/50"
    )}>
      <div className="flex items-start gap-2.5">
        <div className={cn("h-7 w-7 rounded flex items-center justify-center shrink-0 mt-0.5", config.bg)}>
          <Icon className={cn("h-3.5 w-3.5", config.color)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h5 className="font-mono text-xs text-foreground truncate">{milestone.name}</h5>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Badge variant="outline" className={cn("text-[8px] border-0 px-1.5 py-0", config.bg, config.color)}>
                {config.label}
              </Badge>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-card border-border">
                  <DropdownMenuItem onClick={() => onEdit(milestone)} className="text-xs">
                    <Pencil className="h-3.5 w-3.5 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  {status !== 'completed' && status !== 'cancelled' && (
                    <>
                      {status !== 'in_progress' && (
                        <DropdownMenuItem onClick={() => onStatusChange(milestone, 'in_progress')} className="text-xs">
                          <PlayCircle className="h-3.5 w-3.5 mr-2" />
                          Start Progress
                        </DropdownMenuItem>
                      )}
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
            <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">{milestone.description}</p>
          )}

          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span className={cn("text-[10px]", isOverdue && "text-red-600 dark:text-red-400")}>
                {dueDate ? format(dueDate, 'MMM d, yyyy') : 'No date'}
                {isOverdue && ' (overdue)'}
              </span>
            </div>

            {milestone.progress !== undefined && milestone.progress > 0 && (
              <div className="flex items-center gap-2">
                <Progress value={milestone.progress} className="w-12 h-1" />
                <span className="text-[9px] text-muted-foreground">{milestone.progress}%</span>
              </div>
            )}
          </div>

          {/* Sub-phases (sub-tasks) */}
          <MilestoneSubphases
            projectId={projectId}
            milestone={milestone}
          />
        </div>
      </div>
    </div>
  );
}

// =====================================================
// MILESTONE DIALOG (create/edit)
// =====================================================
function MilestoneDialog({
  open,
  onOpenChange,
  milestone,
  projectId,
  phaseId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  milestone?: Milestone | null;
  projectId: string;
  phaseId?: string;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
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
          phase_id: phaseId,
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
          <DialogTitle className="text-foreground text-sm">
            {milestone ? 'Edit Milestone' : 'Add Milestone'}
          </DialogTitle>
          <DialogDescription className="text-[10px] text-muted-foreground">
            {milestone ? 'Update milestone details' : 'Add a new milestone to this phase'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] text-muted-foreground font-mono">Milestone Name *</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Foundation Complete, Permit Approved"
              className="bg-muted border-border text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] text-muted-foreground font-mono">Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe what this milestone represents..."
              className="bg-muted border-border text-xs min-h-[60px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] text-muted-foreground font-mono">Target Date</Label>
            <Input
              type="date"
              value={formData.target_date}
              onChange={(e) => setFormData(prev => ({ ...prev, target_date: e.target.value }))}
              className="bg-muted border-border text-xs"
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
            {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            {milestone ? 'Update' : 'Add'} Milestone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================
// PHASE ACCORDION ITEM
// =====================================================
function PhaseAccordionItem({
  phase,
  projectId,
  milestones,
  isExpanded,
  isLoading,
  onToggle,
  onMilestoneChange,
}: {
  phase: ProjectPhase;
  projectId: string;
  milestones: Milestone[];
  isExpanded: boolean;
  isLoading: boolean;
  onToggle: () => void;
  onMilestoneChange: () => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [deletingMilestone, setDeletingMilestone] = useState<Milestone | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const statusConfig = phaseStatusColors[phase.status] || phaseStatusColors.not_started;
  const progressValue = phase.progress || phase.progress_percentage || 0;
  const milestoneCount = milestones.length;

  const handleComplete = async (milestone: Milestone) => {
    try {
      await milestonesApi.complete(projectId, milestone.id);
      onMilestoneChange();
    } catch (error) {
      console.error('Failed to complete milestone:', error);
    }
  };

  const handleStatusChange = async (milestone: Milestone, status: MilestoneStatus) => {
    try {
      await milestonesApi.update(projectId, milestone.id, { status });
      onMilestoneChange();
    } catch (error) {
      console.error('Failed to update milestone status:', error);
    }
  };

  const handleDelete = async () => {
    if (!deletingMilestone) return;
    try {
      setIsDeleting(true);
      await milestonesApi.delete(projectId, deletingMilestone.id);
      setDeletingMilestone(null);
      onMilestoneChange();
    } catch (error) {
      console.error('Failed to delete milestone:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="border border-border bg-card/50">
      {/* Phase Header - Clickable to expand */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
      >
        <div className="flex items-center gap-2 shrink-0">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <div className="w-6 h-6 flex items-center justify-center bg-muted font-mono text-[10px] text-amber-500">
            {phase.phase_number}
          </div>
        </div>

        <div className="flex-1 min-w-0 text-left">
          <div className="font-mono text-xs text-foreground line-clamp-1">{phase.name || phase.phase_name}</div>
          <div className="font-mono text-[10px] text-muted-foreground flex items-center gap-2">
            <span>{milestoneCount} milestone{milestoneCount !== 1 ? 's' : ''}</span>
            {phase.planned_start_date && phase.planned_end_date && (
              <>
                <span className="text-zinc-700">|</span>
                <span>{format(parseISO(phase.planned_start_date), 'MMM d')} - {format(parseISO(phase.planned_end_date), 'MMM d, yyyy')}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-amber-500" style={{ width: `${progressValue}%` }} />
            </div>
            <span className="font-mono text-[9px] text-muted-foreground w-7 text-right">{progressValue}%</span>
          </div>
          <span className={cn("font-mono text-[9px] px-1.5 py-0.5 rounded-sm", statusConfig.bg, statusConfig.text)}>
            {phase.status.replace('_', ' ').toUpperCase()}
          </span>
        </div>
      </button>

      {/* Expanded Content - Milestones */}
      {isExpanded && (
        <div className="border-t border-border bg-background/30">
          <div className="p-3 space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="ml-2 font-mono text-[10px] text-muted-foreground">Loading milestones...</span>
              </div>
            ) : milestones.length > 0 ? (
              <>
                {milestones.map((milestone) => (
                  <PhaseMilestoneCard
                    key={milestone.id}
                    milestone={milestone}
                    projectId={projectId}
                    onEdit={(m) => { setEditingMilestone(m); setDialogOpen(true); }}
                    onComplete={handleComplete}
                    onDelete={(m) => setDeletingMilestone(m)}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </>
            ) : (
              <div className="text-center py-6">
                <Target className="h-6 w-6 text-zinc-700 mx-auto mb-2" />
                <p className="font-mono text-[10px] text-muted-foreground">No milestones in this phase</p>
                <p className="font-mono text-[9px] text-muted-foreground mt-0.5">Add milestones to track progress and sub-tasks</p>
              </div>
            )}

            {/* Add Milestone Button */}
            <Button
              variant="ghost"
              onClick={() => { setEditingMilestone(null); setDialogOpen(true); }}
              className="w-full h-8 border border-dashed border-border hover:border-amber-600/50 hover:bg-amber-600/5 text-muted-foreground hover:text-amber-500 font-mono text-[10px]"
            >
              <Plus className="h-3 w-3 mr-1.5" />
              Add Milestone
            </Button>
          </div>

          {/* Milestone Dialog (create/edit) */}
          <MilestoneDialog
            open={dialogOpen}
            onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingMilestone(null); }}
            milestone={editingMilestone}
            projectId={projectId}
            phaseId={phase.id}
            onSuccess={onMilestoneChange}
          />

          {/* Delete Confirmation */}
          <AlertDialog open={!!deletingMilestone} onOpenChange={(open) => { if (!open) setDeletingMilestone(null); }}>
            <AlertDialogContent className="bg-card border-border">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-sm text-foreground">Delete Milestone</AlertDialogTitle>
                <AlertDialogDescription className="text-xs text-muted-foreground">
                  Are you sure you want to delete &quot;{deletingMilestone?.name}&quot;? This will also remove all sub-tasks. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="text-xs bg-muted border-border hover:bg-zinc-700">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="bg-red-600 hover:bg-red-700 text-foreground text-xs"
                >
                  {isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

// =====================================================
// MAIN COMPONENT: PhaseHierarchy
// =====================================================
export function PhaseHierarchy({ projectId, phases, onPhasesRefresh }: PhaseHierarchyProps) {
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [allMilestones, setAllMilestones] = useState<Milestone[]>([]);
  const [isLoadingMilestones, setIsLoadingMilestones] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // Fetch all milestones once, group by phase_id client-side
  const fetchAllMilestones = useCallback(async () => {
    try {
      setIsLoadingMilestones(true);
      const milestones = await milestonesApi.getAll(projectId, { includeCompleted: true });
      setAllMilestones(milestones);
      setInitialLoadDone(true);
    } catch (error) {
      console.error('Failed to fetch milestones:', error);
    } finally {
      setIsLoadingMilestones(false);
    }
  }, [projectId]);

  // Initial load
  useEffect(() => {
    fetchAllMilestones();
  }, [fetchAllMilestones]);

  // Group milestones by phase_id
  // API may return phaseId (camelCase) or phase_id (snake_case) depending on endpoint
  const milestonesByPhase = allMilestones.reduce<Record<string, Milestone[]>>((acc, m) => {
    const phaseId = m.phase_id || (m as any).phaseId || '__unassigned__';
    if (!acc[phaseId]) acc[phaseId] = [];
    acc[phaseId].push(m);
    return acc;
  }, {});

  const togglePhase = (phaseId: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(phaseId)) {
        next.delete(phaseId);
      } else {
        next.add(phaseId);
      }
      return next;
    });
  };

  const sortedPhases = [...phases].sort((a, b) => a.phase_number - b.phase_number);

  return (
    <div className="space-y-1">
      {sortedPhases.map((phase) => (
        <PhaseAccordionItem
          key={phase.id}
          phase={phase}
          projectId={projectId}
          milestones={milestonesByPhase[phase.id] || []}
          isExpanded={expandedPhases.has(phase.id)}
          isLoading={!initialLoadDone && isLoadingMilestones}
          onToggle={() => togglePhase(phase.id)}
          onMilestoneChange={() => {
            fetchAllMilestones();
            onPhasesRefresh();
          }}
        />
      ))}

      {/* Show unassigned milestones if any */}
      {milestonesByPhase['__unassigned__']?.length > 0 && (
        <div className="border border-border/50 bg-card/30 mt-4">
          <div className="p-3 border-b border-border/50">
            <div className="font-mono text-[10px] text-muted-foreground flex items-center gap-1.5">
              <Flag className="h-3 w-3" />
              Unassigned Milestones ({milestonesByPhase['__unassigned__'].length})
            </div>
          </div>
          <div className="p-3 space-y-2">
            {milestonesByPhase['__unassigned__'].map((milestone) => (
              <PhaseMilestoneCard
                key={milestone.id}
                milestone={milestone}
                projectId={projectId}
                onEdit={() => {}}
                onComplete={async (m) => {
                  try {
                    await milestonesApi.complete(projectId, m.id);
                    fetchAllMilestones();
                  } catch (e) { console.error(e); }
                }}
                onDelete={() => {}}
                onStatusChange={async (m, status) => {
                  try {
                    await milestonesApi.update(projectId, m.id, { status });
                    fetchAllMilestones();
                  } catch (e) { console.error(e); }
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
