'use client';

/**
 * PermitManager Component
 * Phase 3: Compliance & Document Management
 * 
 * Full CRUD for project permits with:
 * - List view with filtering
 * - Create/Edit permit modal
 * - Status updates
 * - Document attachments
 * - Authority assignments
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  FileCheck,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Filter,
  Calendar,
  Building2,
  ClipboardCheck
} from 'lucide-react';
import { 
  complianceApi, 
  ProjectPermit, 
  PermitType, 
  PermitStatus,
  RegulatoryAuthority 
} from '@/lib/projects-api';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface PermitManagerProps {
  projectId: string;
  onAddInspection?: (permit: ProjectPermit) => void;
}

const PERMIT_TYPES: { value: PermitType; label: string }[] = [
  { value: 'development_permit', label: 'Development Permit' },
  { value: 'building_permit', label: 'Building Permit' },
  { value: 'epa_permit', label: 'EPA Permit' },
  { value: 'fire_certificate', label: 'Fire Certificate' },
  { value: 'occupancy_permit', label: 'Occupancy Permit' },
  { value: 'water_connection', label: 'Water Connection' },
  { value: 'electricity_connection', label: 'Electricity Connection' },
  { value: 'highway_access', label: 'Highway Access' },
  { value: 'aviation_clearance', label: 'Aviation Clearance' },
  { value: 'forestry_clearance', label: 'Forestry Clearance' },
  { value: 'land_title', label: 'Land Title' },
  { value: 'stool_lands_consent', label: 'Stool Lands Consent' },
  { value: 'traditional_authority_approval', label: 'Traditional Authority Approval' },
  { value: 'works_permit', label: 'Works Permit' },
  { value: 'demolition_permit', label: 'Demolition Permit' },
  { value: 'excavation_permit', label: 'Excavation Permit' },
  { value: 'crane_permit', label: 'Crane Permit' },
  { value: 'hoarding_permit', label: 'Hoarding Permit' },
  { value: 'signage_permit', label: 'Signage Permit' },
  { value: 'other', label: 'Other' },
];

const PERMIT_STATUSES: { value: PermitStatus; label: string }[] = [
  { value: 'not_required', label: 'Not Required' },
  { value: 'not_started', label: 'Not Started' },
  { value: 'documents_gathering', label: 'Gathering Documents' },
  { value: 'application_submitted', label: 'Application Submitted' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'additional_info_required', label: 'Additional Info Required' },
  { value: 'approved', label: 'Approved' },
  { value: 'approved_with_conditions', label: 'Approved with Conditions' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
  { value: 'renewed', label: 'Renewed' },
];

export function PermitManager({ projectId, onAddInspection }: PermitManagerProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<PermitStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<PermitType | 'all'>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPermit, setEditingPermit] = useState<ProjectPermit | null>(null);

  // Fetch permits
  const { data: permits = [], isLoading } = useQuery({
    queryKey: ['permits', projectId],
    queryFn: () => complianceApi.getPermits(projectId),
  });

  // Fetch authorities for dropdown
  const { data: authorities = [] } = useQuery({
    queryKey: ['regulatory-authorities'],
    queryFn: () => complianceApi.getAuthorities(),
  });

  // Create permit mutation
  const createMutation = useMutation({
    mutationFn: (data: Partial<ProjectPermit>) => 
      complianceApi.createPermit(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permits', projectId] });
      queryClient.invalidateQueries({ queryKey: ['compliance-dashboard', projectId] });
      toast.success('Permit created successfully');
      setIsDialogOpen(false);
    },
    onError: () => {
      toast.error('Failed to create permit');
    },
  });

  // Update permit mutation
  const updateMutation = useMutation({
    mutationFn: ({ permitId, data }: { permitId: string; data: Partial<ProjectPermit> }) =>
      complianceApi.updatePermit(projectId, permitId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permits', projectId] });
      queryClient.invalidateQueries({ queryKey: ['compliance-dashboard', projectId] });
      toast.success('Permit updated successfully');
      setIsDialogOpen(false);
      setEditingPermit(null);
    },
    onError: () => {
      toast.error('Failed to update permit');
    },
  });

  // Delete permit mutation
  const deleteMutation = useMutation({
    mutationFn: (permitId: string) => complianceApi.deletePermit(projectId, permitId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permits', projectId] });
      queryClient.invalidateQueries({ queryKey: ['compliance-dashboard', projectId] });
      toast.success('Permit deleted successfully');
    },
    onError: () => {
      toast.error('Failed to delete permit');
    },
  });

  // Filter permits
  const filteredPermits = permits.filter((permit) => {
    const matchesSearch = 
      permit.permit_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      permit.authority_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || permit.status === statusFilter;
    const matchesType = typeFilter === 'all' || permit.permit_type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const data: Partial<ProjectPermit> = {
      permit_type: formData.get('permit_type') as PermitType,
      permit_name: formData.get('permit_name') as string,
      description: formData.get('description') as string,
      authority_id: formData.get('authority_id') as string || undefined,
      authority_name: formData.get('authority_name') as string,
      authority_contact: formData.get('authority_contact') as string,
      status: formData.get('status') as PermitStatus,
      application_date: formData.get('application_date') as string || undefined,
      expected_approval_date: formData.get('expected_approval_date') as string || undefined,
      expiration_date: formData.get('expiration_date') as string || undefined,
      fees_paid: formData.get('fees_paid') ? parseFloat(formData.get('fees_paid') as string) : undefined,
      conditions: formData.get('conditions') as string,
      notes: formData.get('notes') as string,
    };

    if (editingPermit) {
      updateMutation.mutate({ permitId: editingPermit.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (permit: ProjectPermit) => {
    setEditingPermit(permit);
    setIsDialogOpen(true);
  };

  const handleDelete = (permit: ProjectPermit) => {
    if (confirm(`Are you sure you want to delete "${permit.permit_name}"?`)) {
      deleteMutation.mutate(permit.id);
    }
  };

  const handleQuickStatusUpdate = (permit: ProjectPermit, newStatus: PermitStatus) => {
    updateMutation.mutate({ 
      permitId: permit.id, 
      data: { status: newStatus }
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Permits & Approvals</CardTitle>
            <CardDescription>
              Manage regulatory permits and track approval status
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) setEditingPermit(null);
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Permit
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>
                    {editingPermit ? 'Edit Permit' : 'Add New Permit'}
                  </DialogTitle>
                  <DialogDescription>
                    {editingPermit 
                      ? 'Update permit details and status'
                      : 'Add a new permit to track for this project'}
                  </DialogDescription>
                </DialogHeader>
                
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="permit_type">Permit Type *</Label>
                      <Select 
                        name="permit_type" 
                        defaultValue={editingPermit?.permit_type || 'building_permit'}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PERMIT_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="status">Status *</Label>
                      <Select 
                        name="status" 
                        defaultValue={editingPermit?.status || 'not_started'}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PERMIT_STATUSES.map((status) => (
                            <SelectItem key={status.value} value={status.value}>
                              {status.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="permit_name">Permit Name *</Label>
                    <Input 
                      id="permit_name" 
                      name="permit_name" 
                      defaultValue={editingPermit?.permit_name}
                      placeholder="e.g., Building Permit for Phase 1"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea 
                      id="description" 
                      name="description" 
                      defaultValue={editingPermit?.description || ''}
                      placeholder="Brief description of the permit"
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="authority_id">Regulatory Authority</Label>
                      <Select 
                        name="authority_id" 
                        defaultValue={editingPermit?.authority_id || ''}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select authority" />
                        </SelectTrigger>
                        <SelectContent>
                          {authorities.map((auth) => (
                            <SelectItem key={auth.id} value={auth.id}>
                              {auth.name} {auth.abbreviation && `(${auth.abbreviation})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="authority_name">Authority Name</Label>
                      <Input 
                        id="authority_name" 
                        name="authority_name"
                        defaultValue={editingPermit?.authority_name || ''}
                        placeholder="Or enter manually"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="authority_contact">Authority Contact</Label>
                    <Input 
                      id="authority_contact" 
                      name="authority_contact"
                      defaultValue={editingPermit?.authority_contact || ''}
                      placeholder="Email or phone"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="application_date">Application Date</Label>
                      <Input 
                        id="application_date" 
                        name="application_date"
                        type="date"
                        defaultValue={editingPermit?.application_date?.split('T')[0] || ''}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="expected_approval_date">Expected Approval</Label>
                      <Input 
                        id="expected_approval_date" 
                        name="expected_approval_date"
                        type="date"
                        defaultValue={editingPermit?.expected_approval_date?.split('T')[0] || ''}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="expiration_date">Expiration Date</Label>
                      <Input 
                        id="expiration_date" 
                        name="expiration_date"
                        type="date"
                        defaultValue={editingPermit?.expiration_date?.split('T')[0] || ''}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fees_paid">Fees Paid (GHS)</Label>
                    <Input 
                      id="fees_paid" 
                      name="fees_paid"
                      type="number"
                      step="0.01"
                      defaultValue={editingPermit?.fees_paid || ''}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="conditions">Conditions (if any)</Label>
                    <Textarea 
                      id="conditions" 
                      name="conditions"
                      defaultValue={editingPermit?.conditions || ''}
                      placeholder="Any conditions attached to the approval"
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea 
                      id="notes" 
                      name="notes"
                      defaultValue={editingPermit?.notes || ''}
                      placeholder="Additional notes"
                      rows={2}
                    />
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
                    {editingPermit ? 'Update Permit' : 'Create Permit'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent>
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search permits..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as PermitStatus | 'all')}>
            <SelectTrigger className="w-[180px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {PERMIT_STATUSES.map((status) => (
                <SelectItem key={status.value} value={status.value}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as PermitType | 'all')}>
            <SelectTrigger className="w-[180px]">
              <FileCheck className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {PERMIT_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filteredPermits.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No permits found</p>
            <p className="text-sm mt-1">Add a permit to start tracking regulatory compliance</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Permit</TableHead>
                  <TableHead>Authority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPermits.map((permit) => (
                  <TableRow key={permit.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <PermitTypeIcon type={permit.permit_type} />
                        <div>
                          <p className="font-medium">{permit.permit_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {PERMIT_TYPES.find(t => t.value === permit.permit_type)?.label}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {permit.authority_name || 'Not assigned'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <PermitStatusBadge status={permit.status} />
                    </TableCell>
                    <TableCell>
                      <div className="text-sm space-y-1">
                        {permit.application_date && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            Applied: {format(new Date(permit.application_date), 'MMM d, yyyy')}
                          </div>
                        )}
                        {permit.expiration_date && (
                          <div className={cn(
                            'flex items-center gap-1',
                            new Date(permit.expiration_date) < new Date() 
                              ? 'text-red-600' 
                              : 'text-muted-foreground'
                          )}>
                            <Clock className="h-3 w-3" />
                            Expires: {format(new Date(permit.expiration_date), 'MMM d, yyyy')}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(permit)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          {onAddInspection && (
                            <DropdownMenuItem onClick={() => onAddInspection(permit)}>
                              <ClipboardCheck className="mr-2 h-4 w-4" />
                              Add Inspection
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem 
                            onClick={() => handleDelete(permit)}
                            className="text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PermitTypeIcon({ type }: { type: string }) {
  return (
    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
      <FileCheck className="h-5 w-5 text-primary" />
    </div>
  );
}

function PermitStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    not_required: { label: 'Not Required', variant: 'secondary' },
    not_started: { label: 'Not Started', variant: 'outline' },
    documents_gathering: { label: 'Gathering Docs', variant: 'secondary' },
    application_submitted: { label: 'Submitted', variant: 'secondary' },
    under_review: { label: 'Under Review', variant: 'default' },
    additional_info_required: { label: 'Info Required', variant: 'destructive' },
    approved: { label: 'Approved', variant: 'default' },
    approved_with_conditions: { label: 'Conditional', variant: 'default' },
    rejected: { label: 'Rejected', variant: 'destructive' },
    expired: { label: 'Expired', variant: 'destructive' },
    renewed: { label: 'Renewed', variant: 'default' },
  };

  const config = statusConfig[status] || { label: status, variant: 'outline' as const };

  return (
    <Badge variant={config.variant}>
      {config.label}
    </Badge>
  );
}

export default PermitManager;
