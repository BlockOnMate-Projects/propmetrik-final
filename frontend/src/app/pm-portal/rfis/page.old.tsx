'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { 
  FileQuestion, 
  Plus, 
  Search, 
  Filter,
  Calendar,
  Clock,
  User,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  Paperclip,
  Eye,
  Send,
  Edit,
  MoreHorizontal,
  ArrowUpRight,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
} from "@/components/ui/dropdown-menu";
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import ProjectSubnav from '@/components/pm-portal/ProjectSubnav';
import { teamApi, TeamMember } from '@/lib/team-api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

// Types
type RfiStatus = 'draft' | 'open' | 'pending_response' | 'answered' | 'closed' | 'void';
type RfiPriority = 'low' | 'normal' | 'high' | 'critical';
type RfiCategory = 
  | 'design_clarification'
  | 'specification_query'
  | 'drawing_discrepancy'
  | 'site_condition'
  | 'material_substitution'
  | 'regulatory_compliance'
  | 'contractor_coordination'
  | 'schedule_impact'
  | 'cost_inquiry'
  | 'safety_concern'
  | 'other';

interface Rfi {
  id: string;
  rfi_number: string;
  subject: string;
  question: string;
  category: RfiCategory;
  status: RfiStatus;
  priority: RfiPriority;
  due_date?: string;
  project_id: string;
  project_name?: string;
  submitted_by_name?: string;
  assigned_to_name?: string;
  is_overdue?: boolean;
  days_overdue?: number;
  comment_count?: number;
  created_at: string;
  responded_at?: string;
  response?: string;
  cost_impact?: number;
  schedule_impact_days?: number;
}

interface RfiStats {
  total: number;
  by_status: Record<RfiStatus, number>;
  by_priority: Record<RfiPriority, number>;
  overdue: number;
  avg_response_days: number;
  pending_response: number;
}

interface RfiRecipient {
  userId: string;
  name: string;
  email?: string;
  source: 'admin' | 'team';
}

interface CreateRfiInput {
  project_id: string;
  organization_id: string;
  subject: string;
  question: string;
  category: RfiCategory;
  priority: RfiPriority;
  due_date?: string;
  assigned_to?: string;
  submit_immediately?: boolean;
}

const statusColors: Record<RfiStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  open: 'bg-blue-100 text-blue-700',
  pending_response: 'bg-yellow-100 text-yellow-700',
  answered: 'bg-green-100 text-green-700',
  closed: 'bg-slate-100 text-slate-700',
  void: 'bg-red-100 text-red-700'
};

const priorityColors: Record<RfiPriority, string> = {
  low: 'bg-gray-100 text-gray-600',
  normal: 'bg-blue-100 text-blue-600',
  high: 'bg-orange-100 text-orange-600',
  critical: 'bg-red-100 text-red-600'
};

const categoryLabels: Record<RfiCategory, string> = {
  design_clarification: 'Design Clarification',
  specification_query: 'Specification Query',
  drawing_discrepancy: 'Drawing Discrepancy',
  site_condition: 'Site Condition',
  material_substitution: 'Material Substitution',
  regulatory_compliance: 'Regulatory Compliance',
  contractor_coordination: 'Contractor Coordination',
  schedule_impact: 'Schedule Impact',
  cost_inquiry: 'Cost Inquiry',
  safety_concern: 'Safety Concern',
  other: 'Other'
};

export default function RFIsPage() {
  const [rfis, setRfis] = useState<Rfi[]>([]);
  const [stats, setStats] = useState<RfiStats | null>(null);
  const [loading, setLoading] = useState(true);
  const params = useParams();
  const projectId = (params as { id?: string }).id;
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<RfiStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<RfiPriority | 'all'>('all');
  const [selectedRfi, setSelectedRfi] = useState<Rfi | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [recipients, setRecipients] = useState<RfiRecipient[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [recipientsError, setRecipientsError] = useState<string | null>(null);

  // Fetch RFIs from API
  const fetchRfis = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (priorityFilter !== 'all') params.append('priority', priorityFilter);
      if (searchQuery) params.append('search', searchQuery);
      if (projectId) params.append('projectId', projectId);
      
      const response = await fetch(`${API_BASE}/rfis?${params.toString()}`);
      const data = await response.json();
      
      if (data.success) {
        setRfis(data.data);
      } else {
        toast.error('Failed to fetch RFIs');
      }
    } catch (error) {
      console.error('Error fetching RFIs:', error);
      toast.error('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, searchQuery, projectId]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      // Use a default project ID or get from context
      const response = await fetch(
        projectId
          ? `${API_BASE}/rfis/stats/${projectId}`
          : `${API_BASE}/rfis/stats/all`
      );
      const data = await response.json();
      
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Error fetching RFI stats:', error);
    }
  }, [projectId]);

  useEffect(() => {
    fetchRfis();
    fetchStats();
  }, [fetchRfis, fetchStats]);

  useEffect(() => {
    const fetchRecipients = async () => {
      if (!projectId) {
        setRecipients([]);
        return;
      }
      setRecipientsLoading(true);
      setRecipientsError(null);
      try {
        const adminResponse = await fetch(`${API_BASE}/team/admins?projectId=${projectId}`);
        const adminData = await adminResponse.json();
        const admins: RfiRecipient[] = (adminData?.data || []).map((admin: { user_id: string; name: string; email?: string }) => ({
          userId: admin.user_id,
          name: admin.name,
          email: admin.email,
          source: 'admin'
        }));
        if (admins.length > 0) {
          setRecipients(admins);
          return;
        }

        const clientResponse = await teamApi.getMembers({ projectId, role: 'client_representative' });
        const clientRecipients: RfiRecipient[] = (clientResponse.data || []).map((member: TeamMember) => ({
          userId: member.userId,
          name: member.userName || member.contactEmail || member.userId,
          email: member.contactEmail || member.userEmail,
          source: 'team'
        }));
        setRecipients(clientRecipients);
      } catch (error) {
        console.warn('Failed to load RFI recipients', error);
        setRecipients([]);
        setRecipientsError('Unable to load recipients.');
      } finally {
        setRecipientsLoading(false);
      }
    };

    fetchRecipients();
  }, [projectId]);

  // Create RFI
  const handleCreateRfi = async (input: CreateRfiInput) => {
    try {
      const response = await fetch(`${API_BASE}/rfis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success('RFI created successfully');
        setIsCreateDialogOpen(false);
        fetchRfis();
      } else {
        toast.error(data.message || 'Failed to create RFI');
      }
    } catch (error) {
      console.error('Error creating RFI:', error);
      toast.error('Failed to create RFI');
    }
  };

  // View RFI details
  const handleViewRfi = (rfi: Rfi) => {
    setSelectedRfi(rfi);
    setIsDetailDialogOpen(true);
  };

  // Get filtered RFIs based on active tab
  const getFilteredRfis = () => {
    let filtered = rfis;
    
    switch (activeTab) {
      case 'open':
        filtered = rfis.filter(r => ['open', 'pending_response'].includes(r.status));
        break;
      case 'overdue':
        filtered = rfis.filter(r => r.is_overdue);
        break;
      case 'answered':
        filtered = rfis.filter(r => r.status === 'answered');
        break;
      case 'closed':
        filtered = rfis.filter(r => r.status === 'closed');
        break;
    }
    
    return filtered;
  };

  const filteredRfis = getFilteredRfis();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileQuestion className="h-7 w-7 text-blue-600" />
            RFI Management
          </h1>
          <p className="text-gray-500 mt-1">Track and manage Requests for Information</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New RFI
        </Button>
      </div>

      {projectId && <ProjectSubnav projectId={projectId} />}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total RFIs</p>
                <p className="text-2xl font-bold">{stats?.total || rfis.length}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <FileQuestion className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pending Response</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {stats?.pending_response || rfis.filter(r => r.status === 'pending_response').length}
                </p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-full">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Overdue</p>
                <p className="text-2xl font-bold text-red-600">
                  {stats?.overdue || rfis.filter(r => r.is_overdue).length}
                </p>
              </div>
              <div className="p-3 bg-red-100 rounded-full">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Answered</p>
                <p className="text-2xl font-bold text-green-600">
                  {stats?.by_status?.answered || rfis.filter(r => r.status === 'answered').length}
                </p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Avg Response</p>
                <p className="text-2xl font-bold">{stats?.avg_response_days?.toFixed(1) || '—'} days</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-full">
                <Calendar className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input 
            placeholder="Search RFIs by number, subject, or question..." 
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as RfiStatus | 'all')}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="pending_response">Pending Response</SelectItem>
            <SelectItem value="answered">Answered</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as RfiPriority | 'all')}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabs and RFI List */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All ({rfis.length})</TabsTrigger>
          <TabsTrigger value="open">Open ({rfis.filter(r => ['open', 'pending_response'].includes(r.status)).length})</TabsTrigger>
          <TabsTrigger value="overdue" className="text-red-600">Overdue ({rfis.filter(r => r.is_overdue).length})</TabsTrigger>
          <TabsTrigger value="answered">Answered ({rfis.filter(r => r.status === 'answered').length})</TabsTrigger>
          <TabsTrigger value="closed">Closed ({rfis.filter(r => r.status === 'closed').length})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-500 mt-4">Loading RFIs...</p>
            </div>
          ) : filteredRfis.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileQuestion className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900">No RFIs Found</h3>
                <p className="text-gray-500 mt-2">
                  {searchQuery ? 'Try adjusting your search or filters' : 'Create your first RFI to get started'}
                </p>
                <Button onClick={() => setIsCreateDialogOpen(true)} className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  New RFI
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredRfis.map((rfi) => (
                <Card 
                  key={rfi.id} 
                  className={`hover:shadow-md transition-shadow cursor-pointer ${
                    rfi.is_overdue ? 'border-l-4 border-l-red-500' : ''
                  }`}
                  onClick={() => handleViewRfi(rfi)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="font-mono text-sm font-medium text-blue-600">
                            {rfi.rfi_number}
                          </span>
                          <Badge className={statusColors[rfi.status]}>
                            {rfi.status.replace('_', ' ')}
                          </Badge>
                          <Badge className={priorityColors[rfi.priority]}>
                            {rfi.priority}
                          </Badge>
                          {rfi.is_overdue && (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {rfi.days_overdue} days overdue
                            </Badge>
                          )}
                        </div>
                        
                        <h3 className="font-medium text-gray-900 mb-1">{rfi.subject}</h3>
                        <p className="text-sm text-gray-500 line-clamp-2">{rfi.question}</p>
                        
                        <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                          {rfi.project_name && (
                            <span className="flex items-center gap-1">
                              <ArrowUpRight className="h-3 w-3" />
                              {rfi.project_name}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {rfi.submitted_by_name || 'Unassigned'}
                          </span>
                          {rfi.due_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Due: {format(new Date(rfi.due_date), 'MMM d, yyyy')}
                            </span>
                          )}
                          {rfi.comment_count && rfi.comment_count > 0 && (
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              {rfi.comment_count} comments
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={(e) => {
                          e.stopPropagation();
                          handleViewRfi(rfi);
                        }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              handleViewRfi(rfi);
                            }}>
                              <Eye className="h-4 w-4 mr-2" /> View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Edit className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            {rfi.status === 'draft' && (
                              <DropdownMenuItem>
                                <Send className="h-4 w-4 mr-2" /> Submit
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create RFI Dialog */}
      <CreateRfiDialog 
        open={isCreateDialogOpen} 
        onOpenChange={setIsCreateDialogOpen}
        onSubmit={handleCreateRfi}
        projectId={projectId}
        recipients={recipients}
        recipientsLoading={recipientsLoading}
        recipientsError={recipientsError}
      />

      {/* RFI Detail Dialog */}
      <RfiDetailDialog 
        rfi={selectedRfi}
        open={isDetailDialogOpen}
        onOpenChange={setIsDetailDialogOpen}
        onUpdate={fetchRfis}
      />
    </div>
  );
}

// Create RFI Dialog Component
function CreateRfiDialog({ 
  open, 
  onOpenChange, 
  onSubmit, 
  projectId,
  recipients,
  recipientsLoading,
  recipientsError
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreateRfiInput) => void;
  projectId?: string;
  recipients: RfiRecipient[];
  recipientsLoading: boolean;
  recipientsError: string | null;
}) {
  const [formData, setFormData] = useState({
    subject: '',
    question: '',
    category: 'design_clarification' as RfiCategory,
    priority: 'normal' as RfiPriority,
    due_date: '',
    submit_immediately: false,
    assigned_to: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      project_id: projectId || 'default-project',
      organization_id: 'default-org', // Should come from context
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-zinc-900 border-zinc-800 text-white">
        <DialogHeader>
          <DialogTitle>Create New RFI</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Submit a Request for Information to clarify design, specifications, or site conditions.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="subject">Subject *</Label>
            <Input 
              id="subject" 
              value={formData.subject}
              onChange={(e) => setFormData({...formData, subject: e.target.value})}
              placeholder="Brief description of the question"
              required
              className="bg-zinc-800 border-zinc-700"
            />
          </div>
          
          <div>
            <Label htmlFor="question">Question *</Label>
            <Textarea 
              id="question"
              value={formData.question}
              onChange={(e) => setFormData({...formData, question: e.target.value})}
              placeholder="Provide detailed question or clarification request..."
              rows={4}
              required
              className="bg-zinc-800 border-zinc-700"
            />
          </div>

          <div>
            <Label>Send To (Client Admin)</Label>
            {recipientsLoading ? (
              <div className="text-xs text-zinc-500 mt-2">Loading recipients...</div>
            ) : recipientsError ? (
              <div className="text-xs text-red-400 mt-2">{recipientsError}</div>
            ) : (
              <Select
                value={formData.assigned_to}
                onValueChange={(v) => setFormData({ ...formData, assigned_to: v })}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue placeholder={recipients.length ? 'Select recipient' : 'No recipients found'} />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {recipients.map((recipient) => (
                    <SelectItem key={recipient.userId} value={recipient.userId}>
                      {recipient.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="category">Category</Label>
              <Select 
                value={formData.category} 
                onValueChange={(v) => setFormData({...formData, category: v as RfiCategory})}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {Object.entries(categoryLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="priority">Priority</Label>
              <Select 
                value={formData.priority} 
                onValueChange={(v) => setFormData({...formData, priority: v as RfiPriority})}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div>
            <Label htmlFor="due_date">Due Date</Label>
            <Input 
              id="due_date" 
              type="date"
              value={formData.due_date}
              onChange={(e) => setFormData({...formData, due_date: e.target.value})}
              className="bg-zinc-800 border-zinc-700"
            />
          </div>
          
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="border-zinc-700" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="outline" className="border-zinc-700">
              Save as Draft
            </Button>
            <Button 
              type="button" 
              onClick={() => {
                setFormData({...formData, submit_immediately: true});
                handleSubmit(new Event('submit') as any);
              }}
            >
              <Send className="h-4 w-4 mr-2" />
              Submit RFI
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// RFI Detail Dialog Component
function RfiDetailDialog({ 
  rfi, 
  open, 
  onOpenChange,
  onUpdate
}: { 
  rfi: Rfi | null; 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}) {
  const [response, setResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  if (!rfi) return null;

  const handleRespond = async () => {
    if (!response.trim()) {
      toast.error('Please enter a response');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/rfis/${rfi.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response })
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast.success('Response submitted successfully');
        setResponse('');
        onUpdate();
        onOpenChange(false);
      } else {
        toast.error(data.message || 'Failed to submit response');
      }
    } catch (error) {
      console.error('Error responding to RFI:', error);
      toast.error('Failed to submit response');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = async () => {
    try {
      const res = await fetch(`${API_BASE}/rfis/${rfi.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast.success('RFI closed successfully');
        onUpdate();
        onOpenChange(false);
      } else {
        toast.error(data.message || 'Failed to close RFI');
      }
    } catch (error) {
      console.error('Error closing RFI:', error);
      toast.error('Failed to close RFI');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="font-mono text-lg font-medium text-blue-600">
              {rfi.rfi_number}
            </span>
            <Badge className={statusColors[rfi.status]}>
              {rfi.status.replace('_', ' ')}
            </Badge>
            <Badge className={priorityColors[rfi.priority]}>
              {rfi.priority}
            </Badge>
          </div>
          <DialogTitle className="text-xl mt-2">{rfi.subject}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Metadata */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Category</p>
              <p className="font-medium">{categoryLabels[rfi.category]}</p>
            </div>
            <div>
              <p className="text-gray-500">Submitted By</p>
              <p className="font-medium">{rfi.submitted_by_name || '—'}</p>
            </div>
            <div>
              <p className="text-gray-500">Assigned To</p>
              <p className="font-medium">{rfi.assigned_to_name || 'Unassigned'}</p>
            </div>
            <div>
              <p className="text-gray-500">Due Date</p>
              <p className={`font-medium ${rfi.is_overdue ? 'text-red-600' : ''}`}>
                {rfi.due_date ? format(new Date(rfi.due_date), 'MMM d, yyyy') : '—'}
              </p>
            </div>
          </div>
          
          {/* Question */}
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Question</h4>
            <div className="bg-gray-50 rounded-lg p-4 text-gray-700 whitespace-pre-wrap">
              {rfi.question}
            </div>
          </div>
          
          {/* Response (if answered) */}
          {rfi.response && (
            <div>
              <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Response
                {rfi.responded_at && (
                  <span className="text-sm font-normal text-gray-500">
                    ({format(new Date(rfi.responded_at), 'MMM d, yyyy')})
                  </span>
                )}
              </h4>
              <div className="bg-green-50 rounded-lg p-4 text-gray-700 whitespace-pre-wrap border border-green-100">
                {rfi.response}
              </div>
            </div>
          )}
          
          {/* Impact */}
          {(rfi.cost_impact || rfi.schedule_impact_days) && (
            <div className="grid grid-cols-2 gap-4">
              {rfi.cost_impact && (
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-gray-500">Cost Impact</p>
                    <p className="text-lg font-bold text-orange-600">
                      GHS {rfi.cost_impact.toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              )}
              {rfi.schedule_impact_days && (
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-gray-500">Schedule Impact</p>
                    <p className="text-lg font-bold text-orange-600">
                      {rfi.schedule_impact_days} days
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
          
          {/* Response Form (if pending) */}
          {['open', 'pending_response'].includes(rfi.status) && (
            <div className="border-t pt-4">
              <h4 className="font-medium text-gray-900 mb-2">Submit Response</h4>
              <Textarea 
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                placeholder="Enter your response to this RFI..."
                rows={4}
              />
              <div className="flex justify-end gap-2 mt-3">
                <Button 
                  onClick={handleRespond} 
                  disabled={submitting || !response.trim()}
                >
                  {submitting ? 'Submitting...' : 'Submit Response'}
                </Button>
              </div>
            </div>
          )}
        </div>
        
        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {rfi.status === 'answered' && (
            <Button onClick={handleClose}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Close RFI
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
