'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { authedFetch } from '@/lib/authed-fetch';
import {
  ArrowLeft,
  Save,
  Play,
  Pause,
  Plus,
  Trash2,
  Settings,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Clock,
  Mail,
  MessageSquare,
  User,
  ClipboardList,
  Tag,
  GitBranch,
  Zap,
  ArrowDown,
  GripVertical
} from 'lucide-react';

// Types
interface WorkflowStep {
  id: string;
  step_order: number;
  step_type: 'action' | 'condition' | 'delay';
  action_type?: string;
  action_config: Record<string, any>;
  condition_config?: Record<string, any>;
  delay_config?: Record<string, any>;
  label?: string;
  branch_path?: string;
  parent_step_id?: string;
}

interface Workflow {
  id: string;
  name: string;
  description: string;
  trigger_type: string;
  trigger_config: Record<string, any>;
  is_active: boolean;
  steps: WorkflowStep[];
}

// Trigger options
const triggerOptions = [
  { value: 'deal_created', label: 'When deal is created', icon: '🏠' },
  { value: 'deal_stage_changed', label: 'When deal stage changes', icon: '📊' },
  { value: 'deal_won', label: 'When deal is won', icon: '🎉' },
  { value: 'deal_lost', label: 'When deal is lost', icon: '❌' },
  { value: 'contact_created', label: 'When contact is created', icon: '👤' },
  { value: 'activity_logged', label: 'When activity is logged', icon: '📝' },
  { value: 'task_completed', label: 'When task is completed', icon: '✅' },
  { value: 'task_overdue', label: 'When task becomes overdue', icon: '⏰' },
  { value: 'document_signed', label: 'When document is signed', icon: '📄' },
  { value: 'manual', label: 'Manual trigger', icon: '👆' },
];

// Action options
const actionOptions = [
  { value: 'create_task', label: 'Create Task', icon: ClipboardList, color: 'blue' },
  { value: 'send_email', label: 'Send Email', icon: Mail, color: 'green' },
  { value: 'send_whatsapp', label: 'Send WhatsApp', icon: MessageSquare, color: 'emerald' },
  { value: 'assign_agent', label: 'Assign Agent', icon: User, color: 'purple' },
  { value: 'add_note', label: 'Add Note', icon: ClipboardList, color: 'yellow' },
  { value: 'add_tag', label: 'Add Tag', icon: Tag, color: 'pink' },
  { value: 'update_field', label: 'Update Field', icon: Settings, color: 'gray' },
  { value: 'move_stage', label: 'Move Stage', icon: ArrowDown, color: 'indigo' },
];

export default function WorkflowEditorPage() {
  const router = useRouter();
  const params = useParams();
  const workflowId = params?.id as string;
  const isNew = workflowId === 'new';

  const [workflow, setWorkflow] = useState<Workflow>({
    id: '',
    name: '',
    description: '',
    trigger_type: 'deal_created',
    trigger_config: {},
    is_active: false,
    steps: []
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [showActionPicker, setShowActionPicker] = useState(false);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isNew && workflowId) {
      fetchWorkflow();
    }
  }, [workflowId, isNew]);

  const fetchWorkflow = async () => {
    try {
      const response = await authedFetch(`/api/workflows/${workflowId}`);
      const data = await response.json();
      if (data.success) {
        setWorkflow(data.data);
        setExpandedSteps(new Set(data.data.steps?.map((s: WorkflowStep) => s.id) || []));
      }
    } catch (error) {
      console.error('Error fetching workflow:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveWorkflow = async () => {
    setSaving(true);
    try {
      const url = isNew ? '/api/workflows' : `/api/workflows/${workflowId}`;
      const method = isNew ? 'POST' : 'PUT';
      
      const response = await authedFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: workflow.name,
          description: workflow.description,
          trigger_type: workflow.trigger_type,
          trigger_config: workflow.trigger_config,
          steps: workflow.steps,
          is_active: workflow.is_active
        })
      });

      const data = await response.json();
      if (data.success) {
        if (isNew) {
          router.push(`/dashboard/deals/workflows/${data.data.id}`);
        } else {
          setWorkflow(data.data);
        }
      }
    } catch (error) {
      console.error('Error saving workflow:', error);
    } finally {
      setSaving(false);
    }
  };

  const toggleWorkflow = async () => {
    if (isNew) return;
    
    try {
      const endpoint = workflow.is_active ? 'deactivate' : 'activate';
      const response = await authedFetch(`/api/workflows/${workflowId}/${endpoint}`, {
        method: 'POST'
      });
      if (response.ok) {
        setWorkflow(prev => ({ ...prev, is_active: !prev.is_active }));
      }
    } catch (error) {
      console.error('Error toggling workflow:', error);
    }
  };

  const addStep = (type: 'action' | 'condition' | 'delay', actionType?: string) => {
    const newStep: WorkflowStep = {
      id: `step-${Date.now()}`,
      step_order: workflow.steps.length + 1,
      step_type: type,
      action_type: actionType,
      action_config: getDefaultActionConfig(actionType),
      label: actionType ? actionOptions.find(a => a.value === actionType)?.label : ''
    };
    
    setWorkflow(prev => ({
      ...prev,
      steps: [...prev.steps, newStep]
    }));
    setShowActionPicker(false);
    setExpandedSteps(prev => new Set(Array.from(prev).concat(newStep.id)));
    setSelectedStep(newStep.id);
  };

  const updateStep = (stepId: string, updates: Partial<WorkflowStep>) => {
    setWorkflow(prev => ({
      ...prev,
      steps: prev.steps.map(step =>
        step.id === stepId ? { ...step, ...updates } : step
      )
    }));
  };

  const deleteStep = (stepId: string) => {
    setWorkflow(prev => ({
      ...prev,
      steps: prev.steps
        .filter(step => step.id !== stepId)
        .map((step, index) => ({ ...step, step_order: index + 1 }))
    }));
    if (selectedStep === stepId) {
      setSelectedStep(null);
    }
  };

  const getDefaultActionConfig = (actionType?: string): Record<string, any> => {
    switch (actionType) {
      case 'create_task':
        return { title: '', description: '', priority: 'medium', due_in_hours: 24, assignee: 'deal_owner' };
      case 'send_email':
        return { to: 'deal_contact', subject: '', template: '' };
      case 'send_whatsapp':
        return { to: 'deal_contact', template: '' };
      case 'assign_agent':
        return { method: 'round_robin' };
      case 'add_note':
        return { content: '' };
      case 'add_tag':
        return { tag: '' };
      case 'update_field':
        return { entity_type: 'deal', field: '', value: '' };
      case 'move_stage':
        return { stage_id: '' };
      default:
        return {};
    }
  };

  const toggleStepExpand = (stepId: string) => {
    setExpandedSteps(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stepId)) {
        newSet.delete(stepId);
      } else {
        newSet.add(stepId);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-card border-b border-border sticky top-0 z-10">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/deals/workflows"
                className="p-2 text-muted-foreground hover:text-foreground rounded hover:bg-muted"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <input
                  type="text"
                  value={workflow.name}
                  onChange={(e) => setWorkflow(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Workflow Name"
                  className="text-xl font-bold text-foreground bg-transparent border-none focus:ring-0 focus:outline-none font-mono"
                />
                <input
                  type="text"
                  value={workflow.description || ''}
                  onChange={(e) => setWorkflow(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Add a description..."
                  className="text-sm text-muted-foreground bg-transparent border-none focus:ring-0 focus:outline-none w-full"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              {!isNew && (
                <button
                  onClick={toggleWorkflow}
                  className={`flex items-center gap-2 px-4 py-2 rounded transition-colors font-mono text-xs ${
                    workflow.is_active
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-900/50'
                      : 'bg-muted text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {workflow.is_active ? (
                    <>
                      <Pause className="w-4 h-4" />
                      ACTIVE
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      INACTIVE
                    </>
                  )}
                </button>
              )}
              <button
                onClick={saveWorkflow}
                disabled={saving || !workflow.name}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-mono text-xs font-bold"
              >
                <Save className="w-4 h-4" />
                {saving ? 'SAVING...' : 'SAVE'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Trigger */}
        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Zap className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground font-mono">TRIGGER</h2>
              <p className="text-sm text-muted-foreground">When this happens...</p>
            </div>
          </div>

          <select
            value={workflow.trigger_type}
            onChange={(e) => setWorkflow(prev => ({ ...prev, trigger_type: e.target.value }))}
            className="w-full px-4 py-3 bg-muted border border-border rounded text-foreground focus:ring-2 focus:ring-amber-500 focus:border-transparent font-mono text-sm"
          >
            {triggerOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.icon} {option.label}
              </option>
            ))}
          </select>

          {workflow.trigger_type === 'deal_stage_changed' && (
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <label className="block text-sm font-medium text-muted-foreground mb-2 font-mono">
                Filter by stage (optional)
              </label>
              <input
                type="text"
                placeholder="Enter stage name or leave empty for all"
                value={workflow.trigger_config.stage_name || ''}
                onChange={(e) => setWorkflow(prev => ({
                  ...prev,
                  trigger_config: { ...prev.trigger_config, stage_name: e.target.value }
                }))}
                className="w-full px-3 py-2 bg-card border border-border rounded text-foreground font-mono text-sm"
              />
            </div>
          )}
        </div>

        {/* Connector */}
        <div className="flex justify-center">
          <div className="w-px h-8 bg-border"></div>
        </div>

        {/* Steps */}
        <div className="space-y-4">
          {workflow.steps.map((step, index) => (
            <div key={step.id}>
              {index > 0 && (
                <div className="flex justify-center mb-4">
                  <div className="w-px h-8 bg-border"></div>
                </div>
              )}
              
              <div
                className={`bg-card rounded-lg border-2 transition-colors ${
                  selectedStep === step.id
                    ? 'border-amber-500 shadow-lg shadow-amber-500/10'
                    : 'border-border hover:border-border'
                }`}
              >
                <div
                  className="p-4 cursor-pointer"
                  onClick={() => {
                    setSelectedStep(step.id);
                    toggleStepExpand(step.id);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-1 text-muted-foreground cursor-grab">
                        <GripVertical className="w-4 h-4" />
                      </div>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        step.step_type === 'action' ? 'bg-blue-100 dark:bg-blue-900/30' :
                        step.step_type === 'condition' ? 'bg-yellow-100 dark:bg-yellow-900/30' : 'bg-muted'
                      }`}>
                        {step.step_type === 'action' && step.action_type && (
                          (() => {
                            const ActionIcon = actionOptions.find(a => a.value === step.action_type)?.icon || Settings;
                            return <ActionIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
                          })()
                        )}
                        {step.step_type === 'condition' && <GitBranch className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />}
                        {step.step_type === 'delay' && <Clock className="w-4 h-4 text-muted-foreground" />}
                      </div>
                      <div>
                        <p className="font-medium text-foreground font-mono">
                          {step.label || step.action_type || step.step_type}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {step.step_type === 'action' && 'Then do this action'}
                          {step.step_type === 'condition' && 'If/Then condition'}
                          {step.step_type === 'delay' && 'Wait before continuing'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteStep(step.id);
                        }}
                        className="p-2 text-muted-foreground hover:text-red-400 rounded hover:bg-muted"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      {expandedSteps.has(step.id) ? (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </div>

                {expandedSteps.has(step.id) && (
                  <div className="px-4 pb-4 border-t border-border pt-4">
                    <StepConfigForm
                      step={step}
                      onUpdate={(updates) => updateStep(step.id, updates)}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Add Step Button */}
        <div className="flex justify-center mt-6">
          <div className="w-px h-8 bg-border"></div>
        </div>
        <div className="flex justify-center">
          <button
            onClick={() => setShowActionPicker(true)}
            className="flex items-center gap-2 px-6 py-3 bg-card border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-amber-500/50 hover:text-amber-400 transition-colors font-mono text-sm"
          >
            <Plus className="w-5 h-5" />
            ADD STEP
          </button>
        </div>

        {/* Action Picker Modal */}
        {showActionPicker && (
          <div className="fixed inset-0 bg-background/70 flex items-center justify-center z-50">
            <div className="bg-card border border-border rounded-xl max-w-md w-full p-6">
              <h3 className="text-lg font-bold text-foreground mb-4 font-mono">ADD A STEP</h3>
              
              <div className="grid grid-cols-2 gap-3 mb-4">
                {actionOptions.map(action => (
                  <button
                    key={action.value}
                    onClick={() => addStep('action', action.value)}
                    className="flex items-center gap-3 p-3 border border-border rounded-lg hover:border-amber-500/50 hover:bg-muted transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <action.icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <span className="font-medium text-foreground font-mono text-sm">{action.label}</span>
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => addStep('condition')}
                  className="flex-1 flex items-center justify-center gap-2 p-3 border border-border rounded-lg hover:border-yellow-500/50 hover:bg-muted transition-colors text-foreground font-mono text-sm"
                >
                  <GitBranch className="w-4 h-4" />
                  Condition
                </button>
                <button
                  onClick={() => addStep('delay')}
                  className="flex-1 flex items-center justify-center gap-2 p-3 border border-border rounded-lg hover:border-border hover:bg-muted transition-colors text-foreground font-mono text-sm"
                >
                  <Clock className="w-4 h-4" />
                  Delay
                </button>
              </div>

              <button
                onClick={() => setShowActionPicker(false)}
                className="w-full mt-4 py-2 text-muted-foreground hover:text-foreground font-mono text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Step Configuration Form Component
function StepConfigForm({
  step,
  onUpdate
}: {
  step: WorkflowStep;
  onUpdate: (updates: Partial<WorkflowStep>) => void;
}) {
  const updateConfig = (key: string, value: any) => {
    onUpdate({
      action_config: { ...step.action_config, [key]: value }
    });
  };

  const inputClass = "w-full px-3 py-2 bg-muted border border-border rounded text-foreground font-mono text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent";
  const labelClass = "block text-sm font-medium text-muted-foreground mb-1 font-mono";

  if (step.step_type === 'delay') {
    return (
      <div className="space-y-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className={labelClass}>Wait for</label>
            <input
              type="number"
              value={step.delay_config?.value || 1}
              onChange={(e) => onUpdate({
                delay_config: { ...step.delay_config, value: parseInt(e.target.value) }
              })}
              className={inputClass}
              min={1}
            />
          </div>
          <div className="flex-1">
            <label className={labelClass}>Unit</label>
            <select
              value={step.delay_config?.delay_type || 'hours'}
              onChange={(e) => onUpdate({
                delay_config: { ...step.delay_config, delay_type: e.target.value }
              })}
              className={inputClass}
            >
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
              <option value="days">Days</option>
            </select>
          </div>
        </div>
      </div>
    );
  }

  if (step.step_type === 'condition') {
    return (
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Field</label>
          <select
            value={step.condition_config?.field || ''}
            onChange={(e) => onUpdate({
              condition_config: { ...step.condition_config, field: e.target.value }
            })}
            className={inputClass}
          >
            <option value="">Select field...</option>
            <option value="deal.value">Deal Value</option>
            <option value="deal.stage_name">Deal Stage</option>
            <option value="contact.source">Contact Source</option>
            <option value="contact.tags">Contact Tags</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Operator</label>
          <select
            value={step.condition_config?.operator || 'equals'}
            onChange={(e) => onUpdate({
              condition_config: { ...step.condition_config, operator: e.target.value }
            })}
            className={inputClass}
          >
            <option value="equals">Equals</option>
            <option value="not_equals">Does not equal</option>
            <option value="contains">Contains</option>
            <option value="greater_than">Greater than</option>
            <option value="less_than">Less than</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Value</label>
          <input
            type="text"
            value={step.condition_config?.value || ''}
            onChange={(e) => onUpdate({
              condition_config: { ...step.condition_config, value: e.target.value }
            })}
            className={inputClass}
          />
        </div>
      </div>
    );
  }

  switch (step.action_type) {
    case 'create_task':
      return (
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Task Title</label>
            <input
              type="text"
              value={step.action_config.title || ''}
              onChange={(e) => updateConfig('title', e.target.value)}
              placeholder="e.g., Follow up with {{contact.name}}"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <textarea
              value={step.action_config.description || ''}
              onChange={(e) => updateConfig('description', e.target.value)}
              rows={2}
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Priority</label>
              <select
                value={step.action_config.priority || 'medium'}
                onChange={(e) => updateConfig('priority', e.target.value)}
                className={inputClass}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Due in (hours)</label>
              <input
                type="number"
                value={step.action_config.due_in_hours || 24}
                onChange={(e) => updateConfig('due_in_hours', parseInt(e.target.value))}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Assign to</label>
            <select
              value={step.action_config.assignee || 'deal_owner'}
              onChange={(e) => updateConfig('assignee', e.target.value)}
              className={inputClass}
            >
              <option value="deal_owner">Deal Owner</option>
              <option value="assigned_agent">Assigned Agent</option>
              <option value="trigger_user">User who triggered</option>
            </select>
          </div>
        </div>
      );

    case 'send_email':
      return (
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Send to</label>
            <select
              value={step.action_config.to || 'deal_contact'}
              onChange={(e) => updateConfig('to', e.target.value)}
              className={inputClass}
            >
              <option value="deal_contact">Deal Contact</option>
              <option value="deal_owner">Deal Owner</option>
              <option value="assigned_agent">Assigned Agent</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Subject</label>
            <input
              type="text"
              value={step.action_config.subject || ''}
              onChange={(e) => updateConfig('subject', e.target.value)}
              placeholder="e.g., Update on your property inquiry"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Email Template</label>
            <select
              value={step.action_config.template || ''}
              onChange={(e) => updateConfig('template', e.target.value)}
              className={inputClass}
            >
              <option value="">Select template...</option>
              <option value="welcome">Welcome Email</option>
              <option value="follow_up">Follow Up</option>
              <option value="viewing_confirmation">Viewing Confirmation</option>
            </select>
          </div>
        </div>
      );

    case 'send_whatsapp':
      return (
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Send to</label>
            <select
              value={step.action_config.to || 'deal_contact'}
              onChange={(e) => updateConfig('to', e.target.value)}
              className={inputClass}
            >
              <option value="deal_contact">Deal Contact</option>
              <option value="assigned_agent">Assigned Agent</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>WhatsApp Template</label>
            <select
              value={step.action_config.template || ''}
              onChange={(e) => updateConfig('template', e.target.value)}
              className={inputClass}
            >
              <option value="">Select template...</option>
              <option value="lead_welcome">Lead Welcome</option>
              <option value="viewing_reminder">Viewing Reminder</option>
              <option value="document_request">Document Request</option>
            </select>
          </div>
        </div>
      );

    case 'assign_agent':
      return (
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Assignment Method</label>
            <select
              value={step.action_config.method || 'round_robin'}
              onChange={(e) => updateConfig('method', e.target.value)}
              className={inputClass}
            >
              <option value="round_robin">Round Robin</option>
              <option value="load_balanced">Load Balanced (fewest deals)</option>
              <option value="random">Random</option>
              <option value="specific_agent">Specific Agent</option>
            </select>
          </div>
          {step.action_config.method === 'specific_agent' && (
            <div>
              <label className={labelClass}>Select Agent</label>
              <select
                value={step.action_config.agent_id || ''}
                onChange={(e) => updateConfig('agent_id', e.target.value)}
                className={inputClass}
              >
                <option value="">Select agent...</option>
              </select>
            </div>
          )}
        </div>
      );

    case 'add_note':
      return (
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Note Content</label>
            <textarea
              value={step.action_config.content || ''}
              onChange={(e) => updateConfig('content', e.target.value)}
              placeholder="e.g., Workflow triggered: New lead from website"
              rows={3}
              className={inputClass}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Use {'{{contact.name}}'}, {'{{deal.title}}'} for dynamic values
            </p>
          </div>
        </div>
      );

    case 'add_tag':
      return (
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Tag Name</label>
            <input
              type="text"
              value={step.action_config.tag || ''}
              onChange={(e) => updateConfig('tag', e.target.value)}
              placeholder="e.g., Hot Lead"
              className={inputClass}
            />
          </div>
        </div>
      );

    case 'update_field':
      return (
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Entity</label>
            <select
              value={step.action_config.entity_type || 'deal'}
              onChange={(e) => updateConfig('entity_type', e.target.value)}
              className={inputClass}
            >
              <option value="deal">Deal</option>
              <option value="contact">Contact</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Field</label>
            <input
              type="text"
              value={step.action_config.field || ''}
              onChange={(e) => updateConfig('field', e.target.value)}
              placeholder="e.g., priority"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>New Value</label>
            <input
              type="text"
              value={step.action_config.value || ''}
              onChange={(e) => updateConfig('value', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      );

    case 'move_stage':
      return (
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Move to Stage</label>
            <select
              value={step.action_config.stage_id || ''}
              onChange={(e) => updateConfig('stage_id', e.target.value)}
              className={inputClass}
            >
              <option value="">Select stage...</option>
            </select>
          </div>
        </div>
      );

    default:
      return (
        <div className="text-muted-foreground text-sm font-mono">
          No configuration options available for this action type.
        </div>
      );
  }
}
