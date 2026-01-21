'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Play,
  Pause,
  StopCircle
} from 'lucide-react';

interface WorkflowExecution {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'waiting';
  entity_type: string;
  entity_id: string;
  trigger_type: string;
  triggered_by: string;
  started_at: string;
  completed_at: string;
  execution_log: Array<{
    step_id: string;
    action: string;
    status: string;
    result?: any;
    error?: string;
    executed_at: string;
  }>;
  error_message?: string;
  created_at: string;
}

const statusConfig: Record<string, { color: string; bgColor: string; icon: any; label: string }> = {
  pending: { color: 'text-zinc-400', bgColor: 'bg-zinc-800', icon: Clock, label: 'Pending' },
  running: { color: 'text-blue-400', bgColor: 'bg-blue-900/30', icon: RefreshCw, label: 'Running' },
  completed: { color: 'text-green-400', bgColor: 'bg-green-900/30', icon: CheckCircle, label: 'Completed' },
  failed: { color: 'text-red-400', bgColor: 'bg-red-900/30', icon: XCircle, label: 'Failed' },
  cancelled: { color: 'text-zinc-500', bgColor: 'bg-zinc-800', icon: StopCircle, label: 'Cancelled' },
  waiting: { color: 'text-yellow-400', bgColor: 'bg-yellow-900/30', icon: Clock, label: 'Waiting' }
};

export default function WorkflowHistoryPage() {
  const params = useParams();
  const workflowId = params?.id as string;

  const [workflow, setWorkflow] = useState<any>(null);
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedExecution, setExpandedExecution] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (workflowId) {
      fetchWorkflow();
      fetchExecutions();
    }
  }, [workflowId, statusFilter, page]);

  const fetchWorkflow = async () => {
    try {
      const response = await fetch(`/api/v1/workflows/${workflowId}`);
      const data = await response.json();
      if (data.success) {
        setWorkflow(data.data);
      }
    } catch (error) {
      console.error('Error fetching workflow:', error);
    }
  };

  const fetchExecutions = async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20'
      });
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      
      const response = await fetch(`/api/v1/workflows/${workflowId}/executions?${params}`);
      const data = await response.json();
      if (data.success) {
        setExecutions(data.data);
      }
    } catch (error) {
      console.error('Error fetching executions:', error);
    } finally {
      setLoading(false);
    }
  };

  const cancelExecution = async (executionId: string) => {
    try {
      const response = await fetch(`/api/v1/workflows/executions/${executionId}/cancel`, {
        method: 'POST'
      });
      if (response.ok) {
        fetchExecutions();
      }
    } catch (error) {
      console.error('Error cancelling execution:', error);
    }
  };

  const formatDuration = (start: string, end: string) => {
    if (!start || !end) return '-';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.round(ms / 60000)}m`;
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

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
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/deals/workflows/${workflowId}`}
            className="p-2 text-zinc-500 hover:text-zinc-300 rounded hover:bg-zinc-800"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white font-mono">
              EXECUTION HISTORY
            </h1>
            <p className="text-zinc-500 text-sm">
              {workflow?.name || 'Loading...'}
            </p>
          </div>
        </div>

        <button
          onClick={() => fetchExecutions()}
          className="flex items-center gap-2 px-4 py-2 border border-zinc-700 text-zinc-300 rounded hover:bg-zinc-800 font-mono text-xs"
        >
          <RefreshCw className="w-4 h-4" />
          REFRESH
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {Object.entries(statusConfig).map(([status, config]) => {
          const count = executions.filter(e => e.status === status).length;
          const StatusIcon = config.icon;
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
              className={`p-4 rounded-lg border-2 transition-colors ${
                statusFilter === status
                  ? 'border-amber-500 bg-zinc-800'
                  : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500 font-mono">{config.label}</p>
                  <p className="text-xl font-bold text-white font-mono">{count}</p>
                </div>
                <StatusIcon className={`w-5 h-5 ${config.color}`} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Executions List */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        {executions.length === 0 ? (
          <div className="p-12 text-center">
            <Activity className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2 font-mono">No executions yet</h3>
            <p className="text-zinc-500 text-sm">
              Executions will appear here when the workflow is triggered
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {executions.map((execution) => {
              const config = statusConfig[execution.status] || statusConfig.pending;
              const StatusIcon = config.icon;
              const isExpanded = expandedExecution === execution.id;

              return (
                <div key={execution.id} className="hover:bg-zinc-800/50">
                  {/* Execution Row */}
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => setExpandedExecution(isExpanded ? null : execution.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full ${config.bgColor} flex items-center justify-center`}>
                          <StatusIcon className={`w-5 h-5 ${config.color} ${
                            execution.status === 'running' ? 'animate-spin' : ''
                          }`} />
                        </div>
                        
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${config.bgColor} ${config.color} font-mono`}>
                              {config.label}
                            </span>
                            <span className="text-sm text-zinc-500 font-mono">
                              {execution.entity_type}: {execution.entity_id.slice(0, 8)}...
                            </span>
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-sm text-zinc-500">
                            <span>Triggered: {formatTime(execution.created_at)}</span>
                            <span>Duration: {formatDuration(execution.started_at, execution.completed_at)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {(execution.status === 'running' || execution.status === 'waiting') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              cancelExecution(execution.id);
                            }}
                            className="px-3 py-1 text-sm text-red-400 hover:bg-red-900/30 rounded font-mono"
                          >
                            Cancel
                          </button>
                        )}
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5 text-zinc-500" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-zinc-500" />
                        )}
                      </div>
                    </div>

                    {execution.error_message && (
                      <div className="mt-3 p-3 bg-red-900/20 border border-red-900/50 rounded-lg">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5" />
                          <p className="text-sm text-red-400">{execution.error_message}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Expanded Log */}
                  {isExpanded && execution.execution_log && (
                    <div className="px-4 pb-4 bg-zinc-800/50 border-t border-zinc-800">
                      <div className="mt-4 space-y-2">
                        <h4 className="text-sm font-medium text-zinc-400 font-mono">EXECUTION STEPS</h4>
                        <div className="space-y-2">
                          {execution.execution_log.map((log, index) => (
                            <div
                              key={index}
                              className="flex items-start gap-3 p-3 bg-zinc-900 rounded-lg border border-zinc-800"
                            >
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                log.status === 'success' ? 'bg-green-900/30' :
                                log.status === 'failed' ? 'bg-red-900/30' : 'bg-zinc-800'
                              }`}>
                                {log.status === 'success' ? (
                                  <CheckCircle className="w-4 h-4 text-green-400" />
                                ) : log.status === 'failed' ? (
                                  <XCircle className="w-4 h-4 text-red-400" />
                                ) : (
                                  <Clock className="w-4 h-4 text-zinc-400" />
                                )}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium text-white font-mono">{log.action}</span>
                                  <span className="text-xs text-zinc-500 font-mono">
                                    {formatTime(log.executed_at)}
                                  </span>
                                </div>
                                {log.result && (
                                  <div className="mt-1 text-sm text-zinc-400">
                                    <pre className="bg-zinc-800 p-2 rounded text-xs overflow-x-auto font-mono">
                                      {JSON.stringify(log.result, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {log.error && (
                                  <p className="mt-1 text-sm text-red-400">{log.error}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {executions.length > 0 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 border border-zinc-700 text-zinc-300 rounded hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed font-mono text-xs"
          >
            PREVIOUS
          </button>
          <span className="text-sm text-zinc-500 font-mono">Page {page}</span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={executions.length < 20}
            className="px-4 py-2 border border-zinc-700 text-zinc-300 rounded hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed font-mono text-xs"
          >
            NEXT
          </button>
        </div>
      )}
    </div>
  );
}
