'use client';

/**
 * InspectionLog Component
 * Phase 3: Compliance & Document Management
 * 
 * Displays and manages inspection records with:
 * - List of inspections by project/permit
 * - Create/Edit inspection modal
 * - Result tracking
 * - Photo attachments
 * - Follow-up scheduling
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { 
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  ClipboardCheck,
  Calendar,
  User,
  Building2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  FileText,
  Camera
} from 'lucide-react';
import { 
  complianceApi, 
  PermitInspection, 
  InspectionResult,
  ProjectPermit 
} from '@/lib/projects-api';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface InspectionLogProps {
  projectId: string;
  permitId?: string; // Optional - if provided, show only for this permit
  permit?: ProjectPermit; // For creating new inspections
}

const INSPECTION_TYPES = [
  'Foundation Inspection',
  'Structural Inspection',
  'Electrical Inspection',
  'Plumbing Inspection',
  'Fire Safety Inspection',
  'Environmental Inspection',
  'Final Inspection',
  'Pre-Occupancy Inspection',
  'Health & Safety Inspection',
  'Quality Control Inspection',
  'Progress Inspection',
  'Compliance Audit',
  'Other',
];

const INSPECTION_RESULTS: { value: InspectionResult; label: string; color: string }[] = [
  { value: 'passed', label: 'Passed', color: 'bg-green-100 text-green-700' },
  { value: 'passed_with_observations', label: 'Passed with Observations', color: 'bg-green-100 text-green-700' },
  { value: 'conditional_pass', label: 'Conditional Pass', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'failed', label: 'Failed', color: 'bg-red-100 text-red-700' },
  { value: 'reinspection_required', label: 'Reinspection Required', color: 'bg-orange-100 text-orange-700' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-muted text-gray-700' },
];

export function InspectionLog({ projectId, permitId, permit }: InspectionLogProps) {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingInspection, setEditingInspection] = useState<PermitInspection | null>(null);
  const [selectedPermit, setSelectedPermit] = useState<ProjectPermit | undefined>(permit);

  // Fetch inspections
  const { data: inspections = [], isLoading } = useQuery({
    queryKey: ['inspections', projectId, permitId],
    queryFn: () => permitId 
      ? complianceApi.getInspections(projectId, permitId)
      : complianceApi.getAllInspections(projectId),
  });

  // Fetch permits if we need to select one
  const { data: permits = [] } = useQuery({
    queryKey: ['permits', projectId],
    queryFn: () => complianceApi.getPermits(projectId),
    enabled: !permitId,
  });

  // Create inspection mutation
  const createMutation = useMutation({
    mutationFn: (data: Partial<PermitInspection>) => 
      complianceApi.createInspection(projectId, data.permit_id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspections', projectId] });
      queryClient.invalidateQueries({ queryKey: ['compliance-dashboard', projectId] });
      toast.success('Inspection logged successfully');
      setIsDialogOpen(false);
      setSelectedPermit(undefined);
    },
    onError: () => {
      toast.error('Failed to log inspection');
    },
  });

  // Update inspection mutation
  const updateMutation = useMutation({
    mutationFn: ({ inspectionId, data }: { inspectionId: string; data: Partial<PermitInspection> }) =>
      complianceApi.updateInspection(projectId, inspectionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspections', projectId] });
      queryClient.invalidateQueries({ queryKey: ['compliance-dashboard', projectId] });
      toast.success('Inspection updated successfully');
      setIsDialogOpen(false);
      setEditingInspection(null);
    },
    onError: () => {
      toast.error('Failed to update inspection');
    },
  });

  // Delete inspection mutation
  const deleteMutation = useMutation({
    mutationFn: (inspectionId: string) => 
      complianceApi.deleteInspection(projectId, inspectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspections', projectId] });
      queryClient.invalidateQueries({ queryKey: ['compliance-dashboard', projectId] });
      toast.success('Inspection deleted successfully');
    },
    onError: () => {
      toast.error('Failed to delete inspection');
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const data: Partial<PermitInspection> = {
      permit_id: formData.get('permit_id') as string || permitId || selectedPermit?.id,
      inspection_type: formData.get('inspection_type') as string,
      inspector_name: formData.get('inspector_name') as string,
      inspector_organization: formData.get('inspector_organization') as string,
      inspector_contact: formData.get('inspector_contact') as string,
      scheduled_date: formData.get('scheduled_date') as string || undefined,
      actual_date: formData.get('actual_date') as string || undefined,
      result: formData.get('result') as InspectionResult || undefined,
      findings: formData.get('findings') as string,
      deficiencies: formData.get('deficiencies') as string,
      recommendations: formData.get('recommendations') as string,
      follow_up_required: formData.get('follow_up_required') === 'on',
      follow_up_date: formData.get('follow_up_date') as string || undefined,
    };

    if (editingInspection) {
      updateMutation.mutate({ inspectionId: editingInspection.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (inspection: PermitInspection) => {
    setEditingInspection(inspection);
    setIsDialogOpen(true);
  };

  const handleDelete = (inspection: PermitInspection) => {
    if (confirm('Are you sure you want to delete this inspection?')) {
      deleteMutation.mutate(inspection.id);
    }
  };

  // Group inspections by permit if showing all
  const groupedInspections = !permitId 
    ? inspections.reduce((acc, insp) => {
        const key = insp.permit_id;
        if (!acc[key]) acc[key] = [];
        acc[key].push(insp);
        return acc;
      }, {} as Record<string, PermitInspection[]>)
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Inspection Log</CardTitle>
            <CardDescription>
              Track regulatory inspections and their outcomes
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingInspection(null);
              setSelectedPermit(undefined);
            }
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Log Inspection
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>
                    {editingInspection ? 'Edit Inspection' : 'Log New Inspection'}
                  </DialogTitle>
                  <DialogDescription>
                    {editingInspection 
                      ? 'Update inspection details and results'
                      : 'Record an inspection for a permit'}
                  </DialogDescription>
                </DialogHeader>
                
                <div className="grid gap-4 py-4">
                  {/* Permit Selection (if not editing and no permitId) */}
                  {!editingInspection && !permitId && (
                    <div className="space-y-2">
                      <Label htmlFor="permit_id">Permit *</Label>
                      <Select 
                        name="permit_id" 
                        defaultValue={selectedPermit?.id || ''}
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select permit" />
                        </SelectTrigger>
                        <SelectContent>
                          {permits.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.permit_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="inspection_type">Inspection Type *</Label>
                      <Select 
                        name="inspection_type" 
                        defaultValue={editingInspection?.inspection_type || 'Progress Inspection'}
                        required
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INSPECTION_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="result">Result</Label>
                      <Select 
                        name="result" 
                        defaultValue={editingInspection?.result || ''}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Pending" />
                        </SelectTrigger>
                        <SelectContent>
                          {INSPECTION_RESULTS.map((result) => (
                            <SelectItem key={result.value} value={result.value}>
                              {result.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="scheduled_date">Scheduled Date</Label>
                      <Input 
                        id="scheduled_date" 
                        name="scheduled_date"
                        type="date"
                        defaultValue={editingInspection?.scheduled_date?.split('T')[0] || ''}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="actual_date">Actual Date</Label>
                      <Input 
                        id="actual_date" 
                        name="actual_date"
                        type="date"
                        defaultValue={editingInspection?.actual_date?.split('T')[0] || ''}
                      />
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">Inspector Details</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="inspector_name">Inspector Name</Label>
                        <Input 
                          id="inspector_name" 
                          name="inspector_name"
                          defaultValue={editingInspection?.inspector_name || ''}
                          placeholder="Full name"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="inspector_organization">Organization</Label>
                        <Input 
                          id="inspector_organization" 
                          name="inspector_organization"
                          defaultValue={editingInspection?.inspector_organization || ''}
                          placeholder="e.g., EPA, Fire Service"
                        />
                      </div>
                    </div>

                    <div className="space-y-2 mt-4">
                      <Label htmlFor="inspector_contact">Contact</Label>
                      <Input 
                        id="inspector_contact" 
                        name="inspector_contact"
                        defaultValue={editingInspection?.inspector_contact || ''}
                        placeholder="Phone or email"
                      />
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">Findings & Results</h4>
                    
                    <div className="space-y-2">
                      <Label htmlFor="findings">Findings</Label>
                      <Textarea 
                        id="findings" 
                        name="findings"
                        defaultValue={editingInspection?.findings || ''}
                        placeholder="Summary of inspection findings"
                        rows={3}
                      />
                    </div>

                    <div className="space-y-2 mt-4">
                      <Label htmlFor="deficiencies">Deficiencies</Label>
                      <Textarea 
                        id="deficiencies" 
                        name="deficiencies"
                        defaultValue={editingInspection?.deficiencies || ''}
                        placeholder="List any deficiencies found"
                        rows={3}
                      />
                    </div>

                    <div className="space-y-2 mt-4">
                      <Label htmlFor="recommendations">Recommendations</Label>
                      <Textarea 
                        id="recommendations" 
                        name="recommendations"
                        defaultValue={editingInspection?.recommendations || ''}
                        placeholder="Recommendations for corrective action"
                        rows={3}
                      />
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="follow_up_required">Follow-up Required</Label>
                        <p className="text-sm text-muted-foreground">
                          Schedule a reinspection or follow-up
                        </p>
                      </div>
                      <Switch
                        id="follow_up_required"
                        name="follow_up_required"
                        defaultChecked={editingInspection?.follow_up_required || false}
                      />
                    </div>

                    <div className="space-y-2 mt-4">
                      <Label htmlFor="follow_up_date">Follow-up Date</Label>
                      <Input 
                        id="follow_up_date" 
                        name="follow_up_date"
                        type="date"
                        defaultValue={editingInspection?.follow_up_date?.split('T')[0] || ''}
                      />
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                  >
                    {editingInspection ? 'Update' : 'Log Inspection'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : inspections.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ClipboardCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No inspections logged yet</p>
            <p className="text-sm mt-1">Log an inspection to track regulatory compliance</p>
          </div>
        ) : permitId ? (
          // Show flat list for single permit
          <div className="space-y-3">
            {inspections.map((inspection) => (
              <InspectionCard 
                key={inspection.id}
                inspection={inspection}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : (
          // Show grouped by permit
          <Accordion type="single" collapsible className="w-full">
            {Object.entries(groupedInspections || {}).map(([permitId, inspList]) => {
              const permitInfo = permits.find(p => p.id === permitId);
              return (
                <AccordionItem key={permitId} value={permitId}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3">
                      <ClipboardCheck className="h-5 w-5 text-primary" />
                      <span className="font-medium">
                        {permitInfo?.permit_name || 'Unknown Permit'}
                      </span>
                      <Badge variant="secondary">{inspList.length} inspections</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 pt-2">
                      {inspList.map((inspection) => (
                        <InspectionCard 
                          key={inspection.id}
                          inspection={inspection}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                        />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}

interface InspectionCardProps {
  inspection: PermitInspection;
  onEdit: (inspection: PermitInspection) => void;
  onDelete: (inspection: PermitInspection) => void;
}

function InspectionCard({ inspection, onEdit, onDelete }: InspectionCardProps) {
  const resultConfig = INSPECTION_RESULTS.find(r => r.value === inspection.result);

  return (
    <div className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className={cn(
            'h-10 w-10 rounded-lg flex items-center justify-center',
            inspection.result === 'passed' || inspection.result === 'passed_with_observations'
              ? 'bg-green-100'
              : inspection.result === 'failed'
              ? 'bg-red-100'
              : inspection.result
              ? 'bg-yellow-100'
              : 'bg-blue-100'
          )}>
            {inspection.result === 'passed' || inspection.result === 'passed_with_observations' ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : inspection.result === 'failed' ? (
              <XCircle className="h-5 w-5 text-red-600" />
            ) : inspection.result ? (
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
            ) : (
              <Clock className="h-5 w-5 text-blue-600" />
            )}
          </div>
          
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-medium">{inspection.inspection_type}</h4>
              {resultConfig ? (
                <Badge className={cn('font-medium', resultConfig.color)}>
                  {resultConfig.label}
                </Badge>
              ) : (
                <Badge variant="outline">Pending</Badge>
              )}
            </div>
            
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
              {inspection.inspector_name && (
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {inspection.inspector_name}
                </div>
              )}
              {inspection.inspector_organization && (
                <div className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {inspection.inspector_organization}
                </div>
              )}
              {(inspection.actual_date || inspection.scheduled_date) && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {inspection.actual_date 
                    ? format(new Date(inspection.actual_date), 'MMM d, yyyy')
                    : `Scheduled: ${format(new Date(inspection.scheduled_date!), 'MMM d, yyyy')}`}
                </div>
              )}
            </div>

            {inspection.findings && (
              <div className="mt-3 p-2 bg-muted rounded text-sm">
                <p className="font-medium text-xs text-muted-foreground mb-1">Findings:</p>
                <p className="line-clamp-2">{inspection.findings}</p>
              </div>
            )}

            {inspection.follow_up_required && inspection.follow_up_date && (
              <div className="mt-2 flex items-center gap-2 text-sm text-orange-600">
                <AlertTriangle className="h-3 w-3" />
                Follow-up: {format(new Date(inspection.follow_up_date), 'MMM d, yyyy')}
              </div>
            )}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(inspection)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => onDelete(inspection)}
              className="text-red-600"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export default InspectionLog;
