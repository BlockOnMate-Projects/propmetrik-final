/**
 * Workflow Services Index
 * Phase 5.9: Workflow Automation Engine
 */

export { default as workflowService } from './workflowService';
export type {
  Workflow,
  WorkflowStep,
  WorkflowExecution,
  WorkflowTemplate,
  TriggerType,
  ActionType,
  TriggerEvent,
  ExecutionContext,
  CreateWorkflowInput
} from './workflowService';

export { default as workflowExecutionEngine } from './workflowExecutionEngine';

export {
  default as workflowEventEmitter,
  emitDealCreated,
  emitDealStageChanged,
  emitDealWon,
  emitDealLost,
  emitContactCreated,
  emitActivityLogged,
  emitTaskCompleted,
  emitDocumentSigned
} from './workflowEventEmitter';
