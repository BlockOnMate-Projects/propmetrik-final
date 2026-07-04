'use client';

import { ConnectEmailBanner } from '@/components/communications/ConnectEmailBanner';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Play,
  Pause,
  Plus,
  Settings,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Zap,
  Copy,
  Trash2,
  MoreVertical,
  Search,
  Filter,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/crm/EmptyState';
import { authedFetch } from '@/lib/authed-fetch';

interface Workflow {
  id: string;
  name: string;
  description: string;
  trigger_type: string;
  is_active: boolean;
  total_executions: number;
  successful_executions: number;
  failed_executions: number;
  created_at: string;
  updated_at: string;
}

interface WorkflowStats {
  total_workflows: number;
  active_workflows: number;
  total_executions: number;
  success_rate: number;
  executions_today: number;
}

const triggerTypeLabels: Record<string, string> = {
  deal_created: 'When deal is created',
  deal_stage_changed: 'When deal stage changes',
  deal_won: 'When deal is won',
  deal_lost: 'When deal is lost',
  contact_created: 'When contact is created',
  contact_updated: 'When contact is updated',
  activity_logged: 'When activity is logged',
  task_completed: 'When task is completed',
  task_overdue: 'When task becomes overdue',
  document_signed: 'When document is signed',
  time_based: 'Time-based trigger',
  manual: 'Manual trigger',
  webhook: 'Webhook trigger'
};

const triggerTypeIcons: Record<string, string> = {
  deal_created: '🏠',
  deal_stage_changed: '📊',
  deal_won: '🎉',
  deal_lost: '❌',
  contact_created: '👤',
  contact_updated: '✏️',
  activity_logged: '📝',
  task_completed: '✅',
  task_overdue: '⏰',
  document_signed: '📄',
  time_based: '🕐',
  manual: '👆',
  webhook: '🔗'
};

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [stats, setStats] = useState<WorkflowStats | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    fetchWorkflows();
    fetchStats();
    fetchTemplates();
  }, [statusFilter]);

  const fetchWorkflows = async () => {
    try {
      const response = await authedFetch(`/api/workflows?status=${statusFilter}`);
      const data = await response.json();
      if (data.success) {
        setWorkflows(data.data);
      }
    } catch (error) {
      console.error('Error fetching workflows:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await authedFetch('/api/workflows/stats');
      const data = await response.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchTemplates = async () => {
    try {
      const response = await authedFetch('/api/workflows/templates');
      const data = await response.json();
      if (data.success) {
        setTemplates(data.data);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const toggleWorkflow = async (workflow: Workflow) => {
    try {
      const endpoint = workflow.is_active ? 'deactivate' : 'activate';
      const response = await authedFetch(`/api/workflows/${workflow.id}/${endpoint}`, {
        method: 'POST'
      });
      if (response.ok) {
        fetchWorkflows();
        fetchStats();
      }
    } catch (error) {
      console.error('Error toggling workflow:', error);
    }
  };

  const createFromTemplate = async (templateId: string) => {
    try {
      const response = await authedFetch('/api/workflows/from-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId })
      });
      if (response.ok) {
        setShowTemplates(false);
        fetchWorkflows();
        fetchStats();
      }
    } catch (error) {
      console.error('Error creating from template:', error);
    }
  };

  const deleteWorkflow = async (workflowId: string) => {
    if (!confirm('Are you sure you want to delete this workflow?')) return;
    
    try {
      const response = await authedFetch(`/api/workflows/${workflowId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchWorkflows();
        fetchStats();
      }
    } catch (error) {
      console.error('Error deleting workflow:', error);
    }
  };

  const filteredWorkflows = workflows.filter(w =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ConnectEmailBanner noun="Workflow emails" />
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Workflow Automation</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automate your CRM with powerful workflow triggers and actions
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => setShowTemplates(true)}
          >
            <Copy className="w-4 h-4 mr-2" />
            Use Template
          </Button>
          <Link href="/dashboard/deals/workflows/new">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-sm h-9 px-4 rounded-md shadow-sm">
              <Plus className="w-4 h-4 mr-2" />
              Create Workflow
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Total Workflows</p>
                  <p className="text-2xl font-bold text-foreground">{stats.total_workflows}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Active</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.active_workflows}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Play className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Executions Today</p>
                  <p className="text-2xl font-bold text-foreground">{stats.executions_today}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Success Rate</p>
                  <p className="text-2xl font-bold text-foreground">
                    {stats.success_rate ? `${(stats.success_rate * 100).toFixed(1)}%` : 'N/A'}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search workflows..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 text-sm"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as any)}
        >
          <SelectTrigger className="w-[140px] text-sm">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Workflows List */}
      <Card className="shadow-sm overflow-hidden">
        {filteredWorkflows.length === 0 ? (
          <EmptyState
            icon={Zap}
            title="No Workflows Yet"
            description="Create your first workflow to automate your CRM tasks"
            actions={[
              {
                label: 'Create from Scratch',
                href: '/dashboard/deals/workflows/new',
                icon: Plus,
              },
              {
                label: 'Start from Template',
                onClick: () => setShowTemplates(true),
                icon: Copy,
                variant: 'outline' as const,
              }
            ]}
          />
        ) : (
          <div className="divide-y divide-border">
            {filteredWorkflows.map((workflow) => (
              <div
                key={workflow.id}
                className="p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => toggleWorkflow(workflow)}
                      className={`p-2 rounded-full transition-colors ${
                        workflow.is_active
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-900/50'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {workflow.is_active ? (
                        <Play className="w-4 h-4" />
                      ) : (
                        <Pause className="w-4 h-4" />
                      )}
                    </button>
                    
                    <div>
                      <Link
                        href={`/dashboard/deals/workflows/${workflow.id}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {workflow.name}
                      </Link>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-lg">
                          {triggerTypeIcons[workflow.trigger_type] || '⚡'}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {triggerTypeLabels[workflow.trigger_type] || workflow.trigger_type}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {/* Execution Stats */}
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Activity className="w-4 h-4" />
                        <span className="font-medium">{workflow.total_executions}</span>
                      </div>
                      <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <CheckCircle className="w-4 h-4" />
                        <span className="font-medium">{workflow.successful_executions}</span>
                      </div>
                      <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                        <XCircle className="w-4 h-4" />
                        <span className="font-medium">{workflow.failed_executions}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/deals/workflows/${workflow.id}`}
                        className="p-2 text-muted-foreground hover:text-foreground rounded hover:bg-muted"
                      >
                        <Settings className="w-4 h-4" />
                      </Link>
                      <Link
                        href={`/dashboard/deals/workflows/${workflow.id}/history`}
                        className="p-2 text-muted-foreground hover:text-foreground rounded hover:bg-muted"
                      >
                        <Clock className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => deleteWorkflow(workflow.id)}
                        className="p-2 text-muted-foreground hover:text-red-400 rounded hover:bg-muted"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Templates Modal */}
      {showTemplates && (
        <div className="fixed inset-0 bg-background/70 flex items-center justify-center z-50">
          <Card className="max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-sm">
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-foreground">
                  Workflow Templates
                </h2>
                <button
                  onClick={() => setShowTemplates(false)}
                  className="p-2 text-muted-foreground hover:text-foreground rounded hover:bg-muted"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              <p className="text-muted-foreground mt-1 text-sm">
                Choose a pre-built workflow to get started quickly
              </p>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="p-4 border border-border rounded-lg hover:border-primary/50 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => createFromTemplate(template.id)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">
                          {triggerTypeIcons[template.trigger_type] || '⚡'}
                        </span>
                        <h3 className="font-medium text-foreground">{template.name}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {template.description}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="px-2 py-0.5 bg-muted text-muted-foreground text-xs rounded font-medium">
                          {template.category}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {triggerTypeLabels[template.trigger_type]}
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
