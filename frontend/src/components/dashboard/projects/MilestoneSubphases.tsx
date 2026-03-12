'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Flag,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Loader2,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Trash2,
  PlayCircle,
  Check,
  Layers,
  GripVertical,
  Timer,
  Users,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import {
  milestonesApi,
  Milestone,
  MilestoneSubphase,
  SubphaseStatus,
  CreateSubphaseData,
  UpdateSubphaseData,
} from '@/lib/pm-portal-api';
import { format, parseISO, isPast } from 'date-fns';

// =====================================================
// STATUS CONFIGS
// =====================================================
const subphaseStatusConfig: Record<SubphaseStatus, {
  icon: React.ElementType;
  color: string;
  bg: string;
  label: string;
}> = {
  pending: { icon: Clock, color: 'text-zinc-400', bg: 'bg-zinc-500/20', label: 'Pending' },
  in_progress: { icon: PlayCircle, color: 'text-blue-400', bg: 'bg-blue-500/20', label: 'In Progress' },
  completed: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/20', label: 'Completed' },
  blocked: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/20', label: 'Blocked' },
  cancelled: { icon: AlertTriangle, color: 'text-zinc-500', bg: 'bg-zinc-600/20', label: 'Cancelled' },
};

// =====================================================
// SUBPHASE ITEM
// =====================================================
function SubphaseItem({
  subphase,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  subphase: MilestoneSubphase;
  onEdit: (subphase: MilestoneSubphase) => void;
  onDelete: (subphase: MilestoneSubphase) => void;
  onStatusChange: (subphase: MilestoneSubphase, status: SubphaseStatus) => void;
}) {
  const config = subphaseStatusConfig[subphase.status] || subphaseStatusConfig.pending;
  const Icon = config.icon;
  const hasDateRange = subphase.startDate && subphase.endDate;

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 bg-zinc-800/30 rounded-lg group hover:bg-zinc-800/50 transition-colors">
      {/* Drag Handle */}
      <GripVertical className="h-4 w-4 text-zinc-600 opacity-0 group-hover:opacity-100 cursor-grab" />

      {/* Status Icon */}
      <div className={cn("h-7 w-7 rounded flex items-center justify-center shrink-0", config.bg)}>
        <Icon className={cn("h-3.5 w-3.5", config.color)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-300 font-medium truncate">{subphase.name}</span>
          {subphase.assignedTeam && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-zinc-700 text-zinc-400">
              {subphase.assignedTeam}
            </Badge>
          )}
        </div>
        {subphase.description && (
          <p className="text-[10px] text-zinc-500 truncate mt-0.5">{subphase.description}</p>
        )}
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 shrink-0">
        <Progress value={subphase.progressPercentage} className="w-12 h-1" />
        <span className="text-[10px] text-zinc-400 w-8">{subphase.progressPercentage}%</span>
      </div>

      {/* Date */}
      {hasDateRange && (
        <div className="text-[10px] text-zinc-500 shrink-0">
          {format(parseISO(subphase.startDate!), 'MMM d')} - {format(parseISO(subphase.endDate!), 'MMM d')}
        </div>
      )}

      {/* Hours */}
      {subphase.estimatedHours && (
        <div className="flex items-center gap-1 text-zinc-500 shrink-0">
          <Timer className="h-3 w-3" />
          <span className="text-[10px]">
            {subphase.actualHours ?? 0}/{subphase.estimatedHours}h
          </span>
        </div>
      )}

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
            <MoreHorizontal className="h-3.5 w-3.5 text-zinc-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
          <DropdownMenuItem onClick={() => onEdit(subphase)} className="text-xs">
            <Pencil className="h-3 w-3 mr-2" />
            Edit
          </DropdownMenuItem>

          {subphase.status !== 'completed' && subphase.status !== 'cancelled' && (
            <>
              {subphase.status === 'pending' && (
                <DropdownMenuItem onClick={() => onStatusChange(subphase, 'in_progress')} className="text-xs">
                  <PlayCircle className="h-3 w-3 mr-2" />
                  Start
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onStatusChange(subphase, 'completed')} className="text-xs text-green-400">
                <Check className="h-3 w-3 mr-2" />
                Complete
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onStatusChange(subphase, 'blocked')} className="text-xs text-red-400">
                <AlertTriangle className="h-3 w-3 mr-2" />
                Mark Blocked
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator className="bg-zinc-800" />
          <DropdownMenuItem onClick={() => onDelete(subphase)} className="text-xs text-red-400">
            <Trash2 className="h-3 w-3 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// =====================================================
// SUBPHASE DIALOG (Create/Edit)
// =====================================================
function SubphaseDialog({
  open,
  onOpenChange,
  subphase,
  projectId,
  milestoneId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subphase?: MilestoneSubphase | null;
  projectId: string;
  milestoneId: string;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    start_date: string;
    end_date: string;
    status: SubphaseStatus;
    progress_percentage: number;
    assigned_team: string;
    estimated_hours: string;
    notes: string;
  }>({
    name: '',
    description: '',
    start_date: '',
    end_date: '',
    status: 'pending',
    progress_percentage: 0,
    assigned_team: '',
    estimated_hours: '',
    notes: '',
  });

  useEffect(() => {
    if (subphase) {
      setFormData({
        name: subphase.name || '',
        description: subphase.description || '',
        start_date: subphase.startDate?.split('T')[0] || '',
        end_date: subphase.endDate?.split('T')[0] || '',
        status: subphase.status || 'pending',
        progress_percentage: subphase.progressPercentage || 0,
        assigned_team: subphase.assignedTeam || '',
        estimated_hours: subphase.estimatedHours?.toString() || '',
        notes: subphase.notes || '',
      });
    } else {
      setFormData({
        name: '',
        description: '',
        start_date: '',
        end_date: '',
        status: 'pending',
        progress_percentage: 0,
        assigned_team: '',
        estimated_hours: '',
        notes: '',
      });
    }
  }, [subphase, open]);

  const handleSubmit = async () => {
    if (!formData.name.trim()) return;

    try {
      setIsSubmitting(true);

      if (subphase) {
        // Update
        await milestonesApi.subphases.update(projectId, milestoneId, subphase.id, {
          name: formData.name,
          description: formData.description || undefined,
          start_date: formData.start_date || undefined,
          end_date: formData.end_date || undefined,
          status: formData.status,
          progress_percentage: formData.progress_percentage,
          assigned_team: formData.assigned_team || undefined,
          estimated_hours: formData.estimated_hours ? parseFloat(formData.estimated_hours) : undefined,
          notes: formData.notes || undefined,
        });
      } else {
        // Create
        await milestonesApi.subphases.create(projectId, milestoneId, {
          name: formData.name,
          description: formData.description || undefined,
          start_date: formData.start_date || undefined,
          end_date: formData.end_date || undefined,
          status: formData.status,
          progress_percentage: formData.progress_percentage,
          assigned_team: formData.assigned_team || undefined,
          estimated_hours: formData.estimated_hours ? parseFloat(formData.estimated_hours) : undefined,
          notes: formData.notes || undefined,
        });
      }

      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Failed to save sub-phase:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white text-sm">
            {subphase ? 'Edit Sub-phase' : 'Add Sub-phase'}
          </DialogTitle>
          <DialogDescription className="text-zinc-500 text-xs">
            Sub-phases help break down milestones into manageable tasks.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">Name *</Label>
            <Input
              placeholder="e.g., Site Survey, Foundation Layout"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="bg-zinc-800 border-zinc-700 text-sm"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">Description</Label>
            <Textarea
              placeholder="What needs to be done..."
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="bg-zinc-800 border-zinc-700 text-sm min-h-[60px]"
            />
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Start Date</Label>
              <Input
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                className="bg-zinc-800 border-zinc-700 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">End Date</Label>
              <Input
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                className="bg-zinc-800 border-zinc-700 text-sm"
              />
            </div>
          </div>

          {/* Status and Progress */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(v) => setFormData(prev => ({ ...prev, status: v as SubphaseStatus }))}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="pending" className="text-xs">Pending</SelectItem>
                  <SelectItem value="in_progress" className="text-xs">In Progress</SelectItem>
                  <SelectItem value="completed" className="text-xs">Completed</SelectItem>
                  <SelectItem value="blocked" className="text-xs">Blocked</SelectItem>
                  <SelectItem value="cancelled" className="text-xs">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Progress: {formData.progress_percentage}%</Label>
              <Slider
                value={[formData.progress_percentage]}
                onValueChange={([v]) => setFormData(prev => ({ ...prev, progress_percentage: v }))}
                max={100}
                step={5}
                className="mt-2"
              />
            </div>
          </div>

          {/* Team and Hours */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Assigned Team</Label>
              <Input
                placeholder="e.g., Engineering, Contractors"
                value={formData.assigned_team}
                onChange={(e) => setFormData(prev => ({ ...prev, assigned_team: e.target.value }))}
                className="bg-zinc-800 border-zinc-700 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Estimated Hours</Label>
              <Input
                type="number"
                placeholder="0"
                value={formData.estimated_hours}
                onChange={(e) => setFormData(prev => ({ ...prev, estimated_hours: e.target.value }))}
                className="bg-zinc-800 border-zinc-700 text-sm"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">Notes</Label>
            <Textarea
              placeholder="Additional notes..."
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              className="bg-zinc-800 border-zinc-700 text-sm min-h-[60px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-zinc-700 text-xs"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !formData.name.trim()}
            className="bg-amber-600 hover:bg-amber-700 text-white text-xs"
          >
            {isSubmitting && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
            {subphase ? 'Save Changes' : 'Add Sub-phase'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================
// MAIN COMPONENT: MilestoneSubphases
// =====================================================
interface MilestoneSubphasesProps {
  projectId: string;
  milestone: Milestone;
  isExpanded?: boolean;
  onToggle?: () => void;
}

export function MilestoneSubphases({ projectId, milestone, isExpanded = false, onToggle }: MilestoneSubphasesProps) {
  const [subphases, setSubphases] = useState<MilestoneSubphase[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expanded, setExpanded] = useState(isExpanded);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSubphase, setEditingSubphase] = useState<MilestoneSubphase | null>(null);
  const [deletingSubphase, setDeletingSubphase] = useState<MilestoneSubphase | null>(null);

  const fetchSubphases = useCallback(async () => {
    if (!expanded) return;
    
    try {
      setIsLoading(true);
      const data = await milestonesApi.subphases.getAll(projectId, milestone.id);
      setSubphases(data);
    } catch (error) {
      console.error('Failed to fetch sub-phases:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, milestone.id, expanded]);

  useEffect(() => {
    if (expanded) {
      fetchSubphases();
    }
  }, [expanded, fetchSubphases]);

  const handleToggle = () => {
    setExpanded(!expanded);
    onToggle?.();
  };

  const handleAddSubphase = () => {
    setEditingSubphase(null);
    setDialogOpen(true);
  };

  const handleEditSubphase = (subphase: MilestoneSubphase) => {
    setEditingSubphase(subphase);
    setDialogOpen(true);
  };

  const handleDeleteSubphase = async () => {
    if (!deletingSubphase) return;
    
    try {
      await milestonesApi.subphases.delete(projectId, milestone.id, deletingSubphase.id);
      setDeletingSubphase(null);
      fetchSubphases();
    } catch (error) {
      console.error('Failed to delete sub-phase:', error);
    }
  };

  const handleStatusChange = async (subphase: MilestoneSubphase, status: SubphaseStatus) => {
    try {
      const progress = status === 'completed' ? 100 : subphase.progressPercentage;
      await milestonesApi.subphases.update(projectId, milestone.id, subphase.id, {
        status,
        progress_percentage: progress,
      });
      fetchSubphases();
    } catch (error) {
      console.error('Failed to update sub-phase status:', error);
    }
  };

  // Summary stats
  const completedCount = subphases.filter(s => s.status === 'completed').length;
  const avgProgress = subphases.length > 0
    ? Math.round(subphases.reduce((sum, s) => sum + s.progressPercentage, 0) / subphases.length)
    : 0;

  return (
    <>
      {/* Sub-phases Section */}
      <div className="mt-3 pt-3 border-t border-zinc-800">
        {/* Header */}
        <button
          onClick={handleToggle}
          className="flex items-center justify-between w-full text-left"
        >
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
            )}
            <Layers className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-[11px] font-medium text-zinc-300">
              Sub-phases
            </span>
            {subphases.length > 0 && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-zinc-700">
                {completedCount}/{subphases.length}
              </Badge>
            )}
          </div>

          {subphases.length > 0 && !expanded && (
            <div className="flex items-center gap-2">
              <Progress value={avgProgress} className="w-12 h-1" />
              <span className="text-[10px] text-zinc-500">{avgProgress}%</span>
            </div>
          )}
        </button>

        {/* Content */}
        {expanded && (
          <div className="mt-3 space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
              </div>
            ) : subphases.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-[11px] text-zinc-500 mb-2">No sub-phases yet</p>
                <Button
                  onClick={handleAddSubphase}
                  variant="outline"
                  size="sm"
                  className="text-[10px] h-7 border-zinc-700 border-dashed"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Sub-phase
                </Button>
              </div>
            ) : (
              <>
                {subphases.map((subphase) => (
                  <SubphaseItem
                    key={subphase.id}
                    subphase={subphase}
                    onEdit={handleEditSubphase}
                    onDelete={setDeletingSubphase}
                    onStatusChange={handleStatusChange}
                  />
                ))}

                <Button
                  onClick={handleAddSubphase}
                  variant="ghost"
                  size="sm"
                  className="w-full text-[10px] h-7 text-zinc-500 hover:text-amber-400"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Sub-phase
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Sub-phase Dialog */}
      <SubphaseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        subphase={editingSubphase}
        projectId={projectId}
        milestoneId={milestone.id}
        onSuccess={fetchSubphases}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingSubphase} onOpenChange={() => setDeletingSubphase(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white text-sm">Delete Sub-phase?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400 text-xs">
              This will permanently delete "{deletingSubphase?.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSubphase}
              className="bg-red-600 hover:bg-red-700 text-xs"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default MilestoneSubphases;
