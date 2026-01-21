'use client';

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
      const response = await fetch(`/api/v1/workflows?status=${statusFilter}`);
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
      const response = await fetch('/api/v1/workflows/stats');
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
      const response = await fetch('/api/v1/workflows/templates');
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
      const response = await fetch(`/api/v1/workflows/${workflow.id}/${endpoint}`, {
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
      const response = await fetch('/api/v1/workflows/from-template', {
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
      const response = await fetch(`/api/v1/workflows/${workflowId}`, {
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white font-mono">WORKFLOW AUTOMATION</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Automate your CRM with powerful workflow triggers and actions
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowTemplates(true)}
            className="flex items-center gap-2 px-4 py-2 border border-zinc-700 text-zinc-300 rounded hover:bg-zinc-800 transition-colors font-mono text-xs"
          >
            <Copy className="w-4 h-4" />
            USE TEMPLATE
          </button>
          <Link
            href="/dashboard/deals/workflows/new"
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black rounded hover:bg-amber-400 transition-colors font-mono text-xs font-bold"
          >
            <Plus className="w-4 h-4" />
            CREATE WORKFLOW
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 font-mono">TOTAL WORKFLOWS</p>
                <p className="text-2xl font-bold text-white font-mono">{stats.total_workflows}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-blue-900/30 flex items-center justify-center">
                <Zap className="w-5 h-5 text-blue-400" />
              </div>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 font-mono">ACTIVE</p>
                <p className="text-2xl font-bold text-green-400 font-mono">{stats.active_workflows}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-green-900/30 flex items-center justify-center">
                <Play className="w-5 h-5 text-green-400" />
              </div>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 font-mono">EXECUTIONS TODAY</p>
                <p className="text-2xl font-bold text-white font-mono">{stats.executions_today}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-purple-900/30 flex items-center justify-center">
                <Activity className="w-5 h-5 text-purple-400" />
              </div>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 font-mono">SUCCESS RATE</p>
                <p className="text-2xl font-bold text-white font-mono">
                  {stats.success_rate ? `${(stats.success_rate * 100).toFixed(1)}%` : 'N/A'}
                </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-amber-900/30 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-amber-400" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search workflows..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-700 rounded text-white placeholder-zinc-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent font-mono text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-4 py-2 bg-zinc-900 border border-zinc-700 rounded text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent font-mono text-sm"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Workflows List */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        {filteredWorkflows.length === 0 ? (
          <div className="p-12 text-center">
            <Zap className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2 font-mono">No workflows yet</h3>
            <p className="text-zinc-500 mb-6 text-sm">
              Create your first workflow to automate your CRM tasks
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setShowTemplates(true)}
                className="px-4 py-2 border border-zinc-700 text-zinc-300 rounded hover:bg-zinc-800 font-mono text-xs"
              >
                Start from Template
              </button>
              <Link
                href="/dashboard/deals/workflows/new"
                className="px-4 py-2 bg-amber-500 text-black rounded hover:bg-amber-400 font-mono text-xs font-bold"
              >
                Create from Scratch
              </Link>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {filteredWorkflows.map((workflow) => (
              <div
                key={workflow.id}
                className="p-4 hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => toggleWorkflow(workflow)}
                      className={`p-2 rounded-full transition-colors ${
                        workflow.is_active
                          ? 'bg-green-900/30 text-green-400 hover:bg-green-900/50'
                          : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
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
                        className="font-medium text-white hover:text-amber-400 font-mono"
                      >
                        {workflow.name}
                      </Link>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-lg">
                          {triggerTypeIcons[workflow.trigger_type] || '⚡'}
                        </span>
                        <span className="text-sm text-zinc-500">
                          {triggerTypeLabels[workflow.trigger_type] || workflow.trigger_type}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {/* Execution Stats */}
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1 text-zinc-500">
                        <Activity className="w-4 h-4" />
                        <span className="font-mono">{workflow.total_executions}</span>
                      </div>
                      <div className="flex items-center gap-1 text-green-400">
                        <CheckCircle className="w-4 h-4" />
                        <span className="font-mono">{workflow.successful_executions}</span>
                      </div>
                      <div className="flex items-center gap-1 text-red-400">
                        <XCircle className="w-4 h-4" />
                        <span className="font-mono">{workflow.failed_executions}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/deals/workflows/${workflow.id}`}
                        className="p-2 text-zinc-500 hover:text-zinc-300 rounded hover:bg-zinc-800"
                      >
                        <Settings className="w-4 h-4" />
                      </Link>
                      <Link
                        href={`/dashboard/deals/workflows/${workflow.id}/history`}
                        className="p-2 text-zinc-500 hover:text-zinc-300 rounded hover:bg-zinc-800"
                      >
                        <Clock className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => deleteWorkflow(workflow.id)}
                        className="p-2 text-zinc-500 hover:text-red-400 rounded hover:bg-zinc-800"
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
      </div>

      {/* Templates Modal */}
      {showTemplates && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-zinc-800">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white font-mono">
                  WORKFLOW TEMPLATES
                </h2>
                <button
                  onClick={() => setShowTemplates(false)}
                  className="p-2 text-zinc-500 hover:text-zinc-300 rounded hover:bg-zinc-800"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              <p className="text-zinc-500 mt-1 text-sm">
                Choose a pre-built workflow to get started quickly
              </p>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="p-4 border border-zinc-700 rounded-lg hover:border-amber-500/50 hover:bg-zinc-800/50 transition-colors cursor-pointer"
                  onClick={() => createFromTemplate(template.id)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">
                          {triggerTypeIcons[template.trigger_type] || '⚡'}
                        </span>
                        <h3 className="font-medium text-white font-mono">{template.name}</h3>
                      </div>
                      <p className="text-sm text-zinc-500 mt-1">
                        {template.description}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 text-xs rounded font-mono">
                          {template.category}
                        </span>
                        <span className="text-xs text-zinc-600">
                          {triggerTypeLabels[template.trigger_type]}
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-zinc-600" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
