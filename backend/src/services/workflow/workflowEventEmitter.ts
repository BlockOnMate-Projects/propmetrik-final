/**
 * Workflow Event Emitter
 * Phase 5.9: Workflow Automation Engine
 * 
 * Listens to CRM events and triggers matching workflows.
 * Integrates with deal, contact, activity, and task services.
 */

import { EventEmitter } from 'events';
import { pool } from '../../database';
import { logger } from '../../utils/logger';
import workflowExecutionEngine from './workflowExecutionEngine';
import { TriggerEvent, TriggerType } from './workflowService';

class WorkflowEventEmitter extends EventEmitter {
  private static instance: WorkflowEventEmitter;
  private initialized = false;

  private constructor() {
    super();
  }

  static getInstance(): WorkflowEventEmitter {
    if (!WorkflowEventEmitter.instance) {
      WorkflowEventEmitter.instance = new WorkflowEventEmitter();
    }
    return WorkflowEventEmitter.instance;
  }

  /**
   * Initialize event listeners
   */
  initialize(): void {
    if (this.initialized) return;
    
    this.on('deal:created', this.handleDealCreated.bind(this));
    this.on('deal:updated', this.handleDealUpdated.bind(this));
    this.on('deal:stage_changed', this.handleDealStageChanged.bind(this));
    this.on('deal:won', this.handleDealWon.bind(this));
    this.on('deal:lost', this.handleDealLost.bind(this));
    
    this.on('contact:created', this.handleContactCreated.bind(this));
    this.on('contact:updated', this.handleContactUpdated.bind(this));
    
    this.on('activity:logged', this.handleActivityLogged.bind(this));
    
    this.on('task:completed', this.handleTaskCompleted.bind(this));
    this.on('task:overdue', this.handleTaskOverdue.bind(this));
    
    this.on('document:signed', this.handleDocumentSigned.bind(this));
    
    this.on('property:created', this.handlePropertyCreated.bind(this));
    
    this.on('webhook', this.handleWebhook.bind(this));
    
    this.initialized = true;
    logger.info('Workflow event emitter initialized');
  }

  /**
   * Emit a workflow event
   */
  emitWorkflowEvent(
    eventType: string,
    data: {
      organization_id: string;
      entity_type: string;
      entity_id: string;
      triggered_by?: string;
      data?: Record<string, any>;
    }
  ): void {
    logger.debug({ eventType, entityId: data.entity_id }, 'Emitting workflow event');
    this.emit(eventType, data);
  }

  // =====================================================
  // DEAL EVENTS
  // =====================================================

  private async handleDealCreated(data: any): Promise<void> {
    const event: TriggerEvent = {
      type: 'deal_created',
      entity_type: 'deal',
      entity_id: data.entity_id,
      organization_id: data.organization_id,
      triggered_by: data.triggered_by,
      data: data.data || {}
    };
    
    await this.processTriggerEvent(event);
  }

  private async handleDealUpdated(data: any): Promise<void> {
    // Check what fields changed
    const changes = data.data?.changes || {};
    
    // Don't trigger on every update - only significant ones
    const significantFields = ['stage_id', 'status', 'value', 'agent_id'];
    const hasSignificantChange = Object.keys(changes).some(f => significantFields.includes(f));
    
    if (!hasSignificantChange) return;
    
    const event: TriggerEvent = {
      type: 'deal_updated',
      entity_type: 'deal',
      entity_id: data.entity_id,
      organization_id: data.organization_id,
      triggered_by: data.triggered_by,
      data: { ...data.data, changed_fields: Object.keys(changes) }
    };
    
    await this.processTriggerEvent(event);
  }

  private async handleDealStageChanged(data: any): Promise<void> {
    const event: TriggerEvent = {
      type: 'deal_stage_changed',
      entity_type: 'deal',
      entity_id: data.entity_id,
      organization_id: data.organization_id,
      triggered_by: data.triggered_by,
      data: {
        previous_stage_id: data.data?.previous_stage_id,
        new_stage_id: data.data?.new_stage_id,
        previous_stage_name: data.data?.previous_stage_name,
        new_stage_name: data.data?.new_stage_name
      }
    };
    
    await this.processTriggerEvent(event);
  }

  private async handleDealWon(data: any): Promise<void> {
    const event: TriggerEvent = {
      type: 'deal_won',
      entity_type: 'deal',
      entity_id: data.entity_id,
      organization_id: data.organization_id,
      triggered_by: data.triggered_by,
      data: data.data || {}
    };
    
    await this.processTriggerEvent(event);
  }

  private async handleDealLost(data: any): Promise<void> {
    const event: TriggerEvent = {
      type: 'deal_lost',
      entity_type: 'deal',
      entity_id: data.entity_id,
      organization_id: data.organization_id,
      triggered_by: data.triggered_by,
      data: {
        lost_reason: data.data?.lost_reason,
        ...data.data
      }
    };
    
    await this.processTriggerEvent(event);
  }

  // =====================================================
  // CONTACT EVENTS
  // =====================================================

  private async handleContactCreated(data: any): Promise<void> {
    const event: TriggerEvent = {
      type: 'contact_created',
      entity_type: 'contact',
      entity_id: data.entity_id,
      organization_id: data.organization_id,
      triggered_by: data.triggered_by,
      data: {
        source: data.data?.source,
        ...data.data
      }
    };
    
    await this.processTriggerEvent(event);
  }

  private async handleContactUpdated(data: any): Promise<void> {
    const event: TriggerEvent = {
      type: 'contact_updated',
      entity_type: 'contact',
      entity_id: data.entity_id,
      organization_id: data.organization_id,
      triggered_by: data.triggered_by,
      data: data.data || {}
    };
    
    await this.processTriggerEvent(event);
  }

  // =====================================================
  // ACTIVITY EVENTS
  // =====================================================

  private async handleActivityLogged(data: any): Promise<void> {
    const event: TriggerEvent = {
      type: 'activity_logged',
      entity_type: 'activity',
      entity_id: data.entity_id,
      organization_id: data.organization_id,
      triggered_by: data.triggered_by,
      data: {
        activity_type: data.data?.type,
        deal_id: data.data?.deal_id,
        contact_id: data.data?.contact_id,
        outcome: data.data?.outcome,
        ...data.data
      }
    };
    
    await this.processTriggerEvent(event);
  }

  // =====================================================
  // TASK EVENTS
  // =====================================================

  private async handleTaskCompleted(data: any): Promise<void> {
    const event: TriggerEvent = {
      type: 'task_completed',
      entity_type: 'task',
      entity_id: data.entity_id,
      organization_id: data.organization_id,
      triggered_by: data.triggered_by,
      data: {
        task_type: data.data?.type,
        deal_id: data.data?.deal_id,
        contact_id: data.data?.contact_id,
        completed_at: new Date().toISOString(),
        ...data.data
      }
    };
    
    await this.processTriggerEvent(event);
  }

  private async handleTaskOverdue(data: any): Promise<void> {
    const event: TriggerEvent = {
      type: 'task_overdue',
      entity_type: 'task',
      entity_id: data.entity_id,
      organization_id: data.organization_id,
      triggered_by: data.triggered_by,
      data: data.data || {}
    };
    
    await this.processTriggerEvent(event);
  }

  // =====================================================
  // DOCUMENT EVENTS
  // =====================================================

  private async handleDocumentSigned(data: any): Promise<void> {
    const event: TriggerEvent = {
      type: 'document_signed',
      entity_type: 'document',
      entity_id: data.entity_id,
      organization_id: data.organization_id,
      triggered_by: data.triggered_by,
      data: {
        document_type: data.data?.document_type,
        deal_id: data.data?.deal_id,
        signed_at: new Date().toISOString(),
        ...data.data
      }
    };
    
    await this.processTriggerEvent(event);
  }

  // =====================================================
  // PROPERTY EVENTS
  // =====================================================

  private async handlePropertyCreated(data: any): Promise<void> {
    const event: TriggerEvent = {
      type: 'property_created',
      entity_type: 'property',
      entity_id: data.entity_id,
      organization_id: data.organization_id,
      triggered_by: data.triggered_by,
      data: data.data || {}
    };
    
    await this.processTriggerEvent(event);
  }

  // =====================================================
  // WEBHOOK EVENTS
  // =====================================================

  private async handleWebhook(data: any): Promise<void> {
    const event: TriggerEvent = {
      type: 'webhook',
      entity_type: data.entity_type || 'webhook',
      entity_id: data.entity_id || 'webhook',
      organization_id: data.organization_id,
      triggered_by: data.triggered_by,
      data: data.data || {}
    };
    
    await this.processTriggerEvent(event);
  }

  // =====================================================
  // PROCESS TRIGGER EVENT
  // =====================================================

  private async processTriggerEvent(event: TriggerEvent): Promise<void> {
    try {
      logger.info({
        triggerType: event.type,
        entityType: event.entity_type,
        entityId: event.entity_id
      }, 'Processing workflow trigger event');
      
      await workflowExecutionEngine.executeForEvent(event);
      
    } catch (error) {
      logger.error({ error, event }, 'Error processing workflow trigger event');
    }
  }
}

// =====================================================
// HELPER FUNCTIONS FOR SERVICES
// =====================================================

export function emitDealCreated(
  organizationId: string,
  dealId: string,
  triggeredBy?: string,
  data?: Record<string, any>
): void {
  WorkflowEventEmitter.getInstance().emitWorkflowEvent('deal:created', {
    organization_id: organizationId,
    entity_type: 'deal',
    entity_id: dealId,
    triggered_by: triggeredBy,
    data
  });
}

export function emitDealStageChanged(
  organizationId: string,
  dealId: string,
  previousStageId: string,
  newStageId: string,
  triggeredBy?: string,
  data?: Record<string, any>
): void {
  WorkflowEventEmitter.getInstance().emitWorkflowEvent('deal:stage_changed', {
    organization_id: organizationId,
    entity_type: 'deal',
    entity_id: dealId,
    triggered_by: triggeredBy,
    data: {
      previous_stage_id: previousStageId,
      new_stage_id: newStageId,
      ...data
    }
  });
}

export function emitDealWon(
  organizationId: string,
  dealId: string,
  triggeredBy?: string,
  data?: Record<string, any>
): void {
  WorkflowEventEmitter.getInstance().emitWorkflowEvent('deal:won', {
    organization_id: organizationId,
    entity_type: 'deal',
    entity_id: dealId,
    triggered_by: triggeredBy,
    data
  });
}

export function emitDealLost(
  organizationId: string,
  dealId: string,
  triggeredBy?: string,
  data?: Record<string, any>
): void {
  WorkflowEventEmitter.getInstance().emitWorkflowEvent('deal:lost', {
    organization_id: organizationId,
    entity_type: 'deal',
    entity_id: dealId,
    triggered_by: triggeredBy,
    data
  });
}

export function emitContactCreated(
  organizationId: string,
  contactId: string,
  triggeredBy?: string,
  data?: Record<string, any>
): void {
  WorkflowEventEmitter.getInstance().emitWorkflowEvent('contact:created', {
    organization_id: organizationId,
    entity_type: 'contact',
    entity_id: contactId,
    triggered_by: triggeredBy,
    data
  });
}

export function emitActivityLogged(
  organizationId: string,
  activityId: string,
  triggeredBy?: string,
  data?: Record<string, any>
): void {
  WorkflowEventEmitter.getInstance().emitWorkflowEvent('activity:logged', {
    organization_id: organizationId,
    entity_type: 'activity',
    entity_id: activityId,
    triggered_by: triggeredBy,
    data
  });
}

export function emitTaskCompleted(
  organizationId: string,
  taskId: string,
  triggeredBy?: string,
  data?: Record<string, any>
): void {
  WorkflowEventEmitter.getInstance().emitWorkflowEvent('task:completed', {
    organization_id: organizationId,
    entity_type: 'task',
    entity_id: taskId,
    triggered_by: triggeredBy,
    data
  });
}

export function emitDocumentSigned(
  organizationId: string,
  documentId: string,
  triggeredBy?: string,
  data?: Record<string, any>
): void {
  WorkflowEventEmitter.getInstance().emitWorkflowEvent('document:signed', {
    organization_id: organizationId,
    entity_type: 'document',
    entity_id: documentId,
    triggered_by: triggeredBy,
    data
  });
}

export default WorkflowEventEmitter.getInstance();
