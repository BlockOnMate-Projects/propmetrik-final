-- Migration: 070_workflow_automation.sql
-- Phase 5.9: Workflow Automation Engine
-- Competitive Inspiration: HubSpot Workflows, Monday.com Automations
-- Created: 2026-01-21

-- =====================================================
-- ENUMS (created if not exists)
-- =====================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workflow_trigger_type') THEN
        CREATE TYPE workflow_trigger_type AS ENUM (
            'deal_stage_changed',
            'deal_created',
            'deal_won',
            'deal_lost',
            'contact_created',
            'contact_updated',
            'activity_logged',
            'task_completed',
            'task_overdue',
            'document_signed',
            'property_created',
            'time_based',
            'manual',
            'webhook'
        );
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workflow_action_type') THEN
        CREATE TYPE workflow_action_type AS ENUM (
            'create_task',
            'send_email',
            'send_whatsapp',
            'send_sms',
            'update_field',
            'assign_agent',
            'add_note',
            'add_tag',
            'remove_tag',
            'create_activity',
            'move_stage',
            'webhook',
            'wait',
            'branch'
        );
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workflow_step_type') THEN
        CREATE TYPE workflow_step_type AS ENUM (
            'action',
            'condition',
            'delay',
            'branch'
        );
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workflow_execution_status') THEN
        CREATE TYPE workflow_execution_status AS ENUM (
            'pending',
            'running',
            'waiting',
            'completed',
            'failed',
            'cancelled',
            'skipped'
        );
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'assignment_method') THEN
        CREATE TYPE assignment_method AS ENUM (
            'round_robin',
            'load_balanced',
            'random',
            'specific_agent',
            'team_pond'
        );
    END IF;
END $$;

-- =====================================================
-- WORKFLOWS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Basic info
    name VARCHAR(200) NOT NULL,
    description TEXT,
    folder VARCHAR(100), -- For organizing workflows
    
    -- Trigger configuration
    trigger_type workflow_trigger_type NOT NULL,
    trigger_config JSONB DEFAULT '{}', -- Trigger-specific settings
    -- Example trigger_config for deal_stage_changed:
    -- { "pipeline_id": "uuid", "from_stage": "uuid", "to_stage": "uuid" }
    -- Example for time_based:
    -- { "schedule": "0 9 * * 1-5", "timezone": "Africa/Accra" }
    
    -- Entity scope
    entity_type VARCHAR(50) DEFAULT 'deal', -- deal, contact, property
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_template BOOLEAN DEFAULT false, -- Pre-built templates
    
    -- Execution settings
    run_once_per_entity BOOLEAN DEFAULT false, -- Only run once per entity
    execution_limit INTEGER, -- Max executions (null = unlimited)
    cool_down_minutes INTEGER DEFAULT 0, -- Minutes between re-executions on same entity
    
    -- Stats
    execution_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    last_executed_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT workflows_name_org_unique UNIQUE (organization_id, name, deleted_at)
);

-- =====================================================
-- WORKFLOW STEPS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS workflow_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    
    -- Step ordering
    step_order INTEGER NOT NULL,
    parent_step_id UUID REFERENCES workflow_steps(id), -- For branching
    branch_path VARCHAR(50), -- 'true', 'false', or branch name
    
    -- Step type
    step_type workflow_step_type NOT NULL DEFAULT 'action',
    
    -- Action configuration (for action steps)
    action_type workflow_action_type,
    action_config JSONB DEFAULT '{}',
    -- Example action_config for create_task:
    -- { "title": "Follow up with {{contact.name}}", "due_in_days": 3, "assignee": "trigger_user" }
    -- Example for send_email:
    -- { "template_id": "uuid", "subject": "...", "to": "{{contact.email}}" }
    -- Example for assign_agent:
    -- { "method": "round_robin", "team_id": "uuid", "fallback_agent_id": "uuid" }
    
    -- Condition configuration (for condition/branch steps)
    condition_config JSONB,
    -- Example condition_config:
    -- { "field": "deal.value", "operator": "greater_than", "value": 100000 }
    -- { "type": "or", "conditions": [...] }
    
    -- Delay configuration (for delay steps)
    delay_config JSONB,
    -- Example delay_config:
    -- { "delay_type": "minutes", "value": 30 }
    -- { "delay_type": "days", "value": 7 }
    -- { "delay_type": "until_time", "time": "09:00", "timezone": "Africa/Accra" }
    
    -- Display settings (for visual builder)
    position_x INTEGER DEFAULT 0,
    position_y INTEGER DEFAULT 0,
    
    -- Metadata
    label VARCHAR(200),
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- WORKFLOW EXECUTIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS workflow_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Entity that triggered the workflow
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    
    -- Trigger context
    trigger_type workflow_trigger_type NOT NULL,
    trigger_data JSONB DEFAULT '{}', -- Original event data
    
    -- Execution state
    status workflow_execution_status DEFAULT 'pending',
    current_step_id UUID REFERENCES workflow_steps(id),
    completed_steps JSONB DEFAULT '[]', -- Array of completed step IDs with results
    
    -- Timing
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE, -- For delayed steps
    
    -- Results
    error_message TEXT,
    execution_log JSONB DEFAULT '[]', -- Detailed step-by-step log
    -- Example execution_log entry:
    -- { "step_id": "uuid", "action": "send_email", "status": "success", "result": {...}, "executed_at": "..." }
    
    -- Context variables (can be updated during execution)
    context JSONB DEFAULT '{}',
    
    -- Retry handling
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    -- Audit
    triggered_by UUID REFERENCES users(id), -- null for auto-triggered
    cancelled_by UUID REFERENCES users(id),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- WORKFLOW STEP EXECUTIONS TABLE (Detailed step tracking)
-- =====================================================

CREATE TABLE IF NOT EXISTS workflow_step_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
    step_id UUID NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
    
    -- Execution details
    status workflow_execution_status DEFAULT 'pending',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Input/Output
    input_data JSONB DEFAULT '{}',
    output_data JSONB DEFAULT '{}',
    
    -- Error handling
    error_message TEXT,
    error_details JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- WORKFLOW TEMPLATES TABLE (Pre-built workflows)
-- =====================================================

CREATE TABLE IF NOT EXISTS workflow_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Template info
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(100), -- sales, follow_up, onboarding, etc.
    
    -- Template data
    trigger_type workflow_trigger_type NOT NULL,
    trigger_config JSONB DEFAULT '{}',
    steps JSONB NOT NULL, -- Array of step definitions
    
    -- Display
    icon VARCHAR(50),
    color VARCHAR(20),
    
    -- Usage
    use_count INTEGER DEFAULT 0,
    
    -- Metadata
    is_featured BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- ROUND ROBIN TRACKING (for agent assignment)
-- =====================================================

CREATE TABLE IF NOT EXISTS assignment_round_robin (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Scope
    workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
    team_id UUID, -- Optional: scope to team
    pipeline_id UUID, -- Optional: scope to pipeline
    
    -- Current position
    last_assigned_agent_id UUID REFERENCES users(id),
    agent_order JSONB DEFAULT '[]', -- Array of agent IDs in order
    current_index INTEGER DEFAULT 0,
    
    -- Stats
    total_assignments INTEGER DEFAULT 0,
    
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT assignment_rr_unique UNIQUE (organization_id, workflow_id, team_id, pipeline_id)
);

-- =====================================================
-- WORKFLOW ENTITY TRACKING (prevent duplicate executions)
-- =====================================================

CREATE TABLE IF NOT EXISTS workflow_entity_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    
    -- Execution info
    last_execution_id UUID REFERENCES workflow_executions(id),
    last_run_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    run_count INTEGER DEFAULT 1,
    
    CONSTRAINT workflow_entity_unique UNIQUE (workflow_id, entity_type, entity_id)
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Workflows
CREATE INDEX IF NOT EXISTS idx_workflows_org ON workflows(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_workflows_trigger ON workflows(trigger_type, is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_workflows_active ON workflows(organization_id, is_active) WHERE deleted_at IS NULL;

-- Workflow steps
CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow ON workflow_steps(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_order ON workflow_steps(workflow_id, step_order);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_parent ON workflow_steps(parent_step_id) WHERE parent_step_id IS NOT NULL;

-- Workflow executions
CREATE INDEX IF NOT EXISTS idx_workflow_exec_workflow ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_exec_org ON workflow_executions(organization_id);
CREATE INDEX IF NOT EXISTS idx_workflow_exec_entity ON workflow_executions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_workflow_exec_status ON workflow_executions(status) WHERE status IN ('pending', 'running', 'waiting');
CREATE INDEX IF NOT EXISTS idx_workflow_exec_next_run ON workflow_executions(next_run_at) WHERE status = 'waiting' AND next_run_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workflow_exec_created ON workflow_executions(created_at DESC);

-- Step executions
CREATE INDEX IF NOT EXISTS idx_step_exec_execution ON workflow_step_executions(execution_id);
CREATE INDEX IF NOT EXISTS idx_step_exec_step ON workflow_step_executions(step_id);

-- Entity runs
CREATE INDEX IF NOT EXISTS idx_entity_runs_workflow ON workflow_entity_runs(workflow_id, entity_type, entity_id);

-- Round robin
CREATE INDEX IF NOT EXISTS idx_round_robin_org ON assignment_round_robin(organization_id);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Get next agent for round-robin assignment
CREATE OR REPLACE FUNCTION get_next_round_robin_agent(
    p_organization_id UUID,
    p_workflow_id UUID DEFAULT NULL,
    p_team_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_agent_order JSONB;
    v_current_index INTEGER;
    v_next_agent_id UUID;
    v_agents_count INTEGER;
BEGIN
    -- Get or create round robin record
    SELECT agent_order, current_index
    INTO v_agent_order, v_current_index
    FROM assignment_round_robin
    WHERE organization_id = p_organization_id
      AND (workflow_id = p_workflow_id OR (p_workflow_id IS NULL AND workflow_id IS NULL))
      AND (team_id = p_team_id OR (p_team_id IS NULL AND team_id IS NULL));
    
    -- If no record or empty order, get all active agents
    IF v_agent_order IS NULL OR jsonb_array_length(v_agent_order) = 0 THEN
        SELECT jsonb_agg(id)
        INTO v_agent_order
        FROM users
        WHERE organization_id = p_organization_id
          AND role IN ('agent', 'admin')
          AND status = 'active'
          AND (p_team_id IS NULL OR id IN (
              SELECT user_id FROM team_members WHERE team_id = p_team_id AND is_active = true
          ));
        
        v_current_index := 0;
        
        -- Create or update round robin record
        INSERT INTO assignment_round_robin (organization_id, workflow_id, team_id, agent_order, current_index)
        VALUES (p_organization_id, p_workflow_id, p_team_id, v_agent_order, 0)
        ON CONFLICT (organization_id, workflow_id, team_id, pipeline_id)
        DO UPDATE SET agent_order = EXCLUDED.agent_order, updated_at = NOW();
    END IF;
    
    v_agents_count := jsonb_array_length(v_agent_order);
    
    IF v_agents_count = 0 THEN
        RETURN NULL;
    END IF;
    
    -- Get next agent
    v_next_agent_id := (v_agent_order->>(v_current_index % v_agents_count))::UUID;
    
    -- Update index
    UPDATE assignment_round_robin
    SET current_index = (v_current_index + 1) % v_agents_count,
        last_assigned_agent_id = v_next_agent_id,
        total_assignments = total_assignments + 1,
        updated_at = NOW()
    WHERE organization_id = p_organization_id
      AND (workflow_id = p_workflow_id OR (p_workflow_id IS NULL AND workflow_id IS NULL))
      AND (team_id = p_team_id OR (p_team_id IS NULL AND team_id IS NULL));
    
    RETURN v_next_agent_id;
END;
$$ LANGUAGE plpgsql;

-- Update workflow stats
CREATE OR REPLACE FUNCTION update_workflow_stats() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE workflows
        SET execution_count = execution_count + 1,
            last_executed_at = NOW()
        WHERE id = NEW.workflow_id;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
            UPDATE workflows
            SET success_count = success_count + 1
            WHERE id = NEW.workflow_id;
        ELSIF NEW.status = 'failed' AND OLD.status != 'failed' THEN
            UPDATE workflows
            SET failure_count = failure_count + 1
            WHERE id = NEW.workflow_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_workflow_stats ON workflow_executions;
CREATE TRIGGER trigger_update_workflow_stats
    AFTER INSERT OR UPDATE ON workflow_executions
    FOR EACH ROW
    EXECUTE FUNCTION update_workflow_stats();

-- =====================================================
-- INSERT WORKFLOW TEMPLATES
-- =====================================================

INSERT INTO workflow_templates (id, name, description, category, trigger_type, trigger_config, steps, icon, color, is_featured) VALUES

-- Speed-to-Lead Template
(
    gen_random_uuid(),
    'Speed-to-Lead (Auto-Assign)',
    'Automatically assign new deals to agents using round-robin within 5 minutes. Critical for fast lead response.',
    'lead_management',
    'deal_created',
    '{}',
    '[
        {
            "step_order": 1,
            "step_type": "action",
            "action_type": "assign_agent",
            "action_config": {
                "method": "round_robin",
                "fallback_to_admin": true
            },
            "label": "Assign to next available agent"
        },
        {
            "step_order": 2,
            "step_type": "action",
            "action_type": "create_task",
            "action_config": {
                "title": "Initial contact with {{deal.contact_name}}",
                "description": "New lead assigned. Make contact within 5 minutes for best conversion rates.",
                "due_in_minutes": 5,
                "priority": "high",
                "assignee": "assigned_agent"
            },
            "label": "Create urgent follow-up task"
        },
        {
            "step_order": 3,
            "step_type": "action",
            "action_type": "send_whatsapp",
            "action_config": {
                "template": "new_lead_notification",
                "to": "assigned_agent",
                "variables": {
                    "contact_name": "{{deal.contact_name}}",
                    "property_type": "{{deal.property_type}}"
                }
            },
            "label": "Notify agent via WhatsApp"
        }
    ]',
    'zap',
    'green',
    true
),

-- Stale Deal Reminder Template
(
    gen_random_uuid(),
    'Stale Deal Reminder',
    'Send reminder when a deal has no activity for 7 days. Prevents deals from falling through the cracks.',
    'follow_up',
    'time_based',
    '{"schedule": "0 9 * * 1-5", "timezone": "Africa/Accra", "check_condition": "no_activity_days", "days": 7}',
    '[
        {
            "step_order": 1,
            "step_type": "condition",
            "condition_config": {
                "field": "deal.days_since_activity",
                "operator": "greater_than_or_equal",
                "value": 7
            },
            "label": "Check if stale (7+ days)"
        },
        {
            "step_order": 2,
            "step_type": "action",
            "action_type": "create_task",
            "action_config": {
                "title": "Follow up on stale deal: {{deal.title}}",
                "description": "This deal has had no activity for {{deal.days_since_activity}} days. Please follow up or update the status.",
                "due_in_days": 1,
                "priority": "medium",
                "assignee": "deal_owner"
            },
            "label": "Create follow-up task"
        },
        {
            "step_order": 3,
            "step_type": "action",
            "action_type": "send_email",
            "action_config": {
                "to": "deal_owner",
                "template": "stale_deal_reminder",
                "subject": "Reminder: Deal \"{{deal.title}}\" needs attention"
            },
            "label": "Send email reminder"
        }
    ]',
    'clock',
    'orange',
    true
),

-- Post-Viewing Follow-up Template
(
    gen_random_uuid(),
    'Post-Viewing Follow-up',
    'Automatically create follow-up task and send thank you message after a property viewing activity.',
    'follow_up',
    'activity_logged',
    '{"activity_type": "viewing"}',
    '[
        {
            "step_order": 1,
            "step_type": "delay",
            "delay_config": {
                "delay_type": "hours",
                "value": 2
            },
            "label": "Wait 2 hours"
        },
        {
            "step_order": 2,
            "step_type": "action",
            "action_type": "send_whatsapp",
            "action_config": {
                "template": "viewing_thank_you",
                "to": "deal_contact",
                "variables": {
                    "contact_name": "{{contact.first_name}}",
                    "property_address": "{{activity.property_address}}",
                    "agent_name": "{{deal.agent_name}}"
                }
            },
            "label": "Send thank you WhatsApp"
        },
        {
            "step_order": 3,
            "step_type": "action",
            "action_type": "create_task",
            "action_config": {
                "title": "Follow up after viewing: {{activity.property_address}}",
                "description": "Check client interest level and next steps after property viewing.",
                "due_in_days": 1,
                "priority": "high",
                "assignee": "deal_owner"
            },
            "label": "Create follow-up task"
        }
    ]',
    'eye',
    'blue',
    true
),

-- Document Request on Stage Change Template
(
    gen_random_uuid(),
    'Document Request on Stage Change',
    'Automatically request required documents when a deal moves to negotiation or closing stage.',
    'documents',
    'deal_stage_changed',
    '{"to_stage_name": "Negotiation"}',
    '[
        {
            "step_order": 1,
            "step_type": "action",
            "action_type": "create_task",
            "action_config": {
                "title": "Collect documents for {{deal.title}}",
                "description": "Deal moved to negotiation. Collect:\n- Valid ID\n- Proof of funds\n- Signed reservation form",
                "due_in_days": 3,
                "priority": "high",
                "assignee": "deal_owner"
            },
            "label": "Create document collection task"
        },
        {
            "step_order": 2,
            "step_type": "action",
            "action_type": "send_email",
            "action_config": {
                "to": "deal_contact",
                "template": "document_request",
                "subject": "Documents Required - {{deal.title}}"
            },
            "label": "Send document request email"
        },
        {
            "step_order": 3,
            "step_type": "action",
            "action_type": "add_note",
            "action_config": {
                "content": "Automated: Document request sent to client. Awaiting:\n- Valid ID\n- Proof of funds\n- Signed reservation form"
            },
            "label": "Add note to deal"
        }
    ]',
    'file-text',
    'purple',
    true
),

-- Welcome New Contact Template
(
    gen_random_uuid(),
    'Welcome New Contact',
    'Send welcome message and create introduction task when a new contact is created.',
    'onboarding',
    'contact_created',
    '{}',
    '[
        {
            "step_order": 1,
            "step_type": "action",
            "action_type": "send_whatsapp",
            "action_config": {
                "template": "welcome_contact",
                "to": "contact",
                "variables": {
                    "contact_name": "{{contact.first_name}}",
                    "company_name": "{{organization.name}}"
                }
            },
            "label": "Send welcome WhatsApp"
        },
        {
            "step_order": 2,
            "step_type": "action",
            "action_type": "create_task",
            "action_config": {
                "title": "Introduce yourself to {{contact.full_name}}",
                "description": "New contact added. Schedule an introductory call to understand their property needs.",
                "due_in_days": 1,
                "priority": "medium",
                "assignee": "contact_owner"
            },
            "label": "Create introduction task"
        }
    ]',
    'user-plus',
    'cyan',
    false
),

-- Deal Won Celebration Template
(
    gen_random_uuid(),
    'Deal Won Celebration',
    'Celebrate closed deals with team notification and client thank you.',
    'celebration',
    'deal_won',
    '{}',
    '[
        {
            "step_order": 1,
            "step_type": "action",
            "action_type": "send_email",
            "action_config": {
                "to": "team",
                "template": "deal_won_celebration",
                "subject": "🎉 Deal Won: {{deal.title}} - {{deal.value_formatted}}"
            },
            "label": "Notify team of win"
        },
        {
            "step_order": 2,
            "step_type": "action",
            "action_type": "send_whatsapp",
            "action_config": {
                "template": "deal_closed_thank_you",
                "to": "deal_contact",
                "variables": {
                    "contact_name": "{{contact.first_name}}",
                    "agent_name": "{{deal.agent_name}}"
                }
            },
            "label": "Send thank you to client"
        },
        {
            "step_order": 3,
            "step_type": "action",
            "action_type": "create_task",
            "action_config": {
                "title": "Request referral from {{contact.full_name}}",
                "description": "Deal closed successfully. Perfect time to ask for referrals!",
                "due_in_days": 7,
                "priority": "medium",
                "assignee": "deal_owner"
            },
            "label": "Create referral request task"
        }
    ]',
    'trophy',
    'gold',
    false
);

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE workflows IS 'Workflow automation definitions with triggers and conditions';
COMMENT ON TABLE workflow_steps IS 'Individual steps within a workflow (actions, conditions, delays)';
COMMENT ON TABLE workflow_executions IS 'Execution history for workflow runs';
COMMENT ON TABLE workflow_templates IS 'Pre-built workflow templates for common scenarios';
COMMENT ON TABLE assignment_round_robin IS 'Round-robin state for fair agent assignment';
COMMENT ON COLUMN workflows.trigger_config IS 'JSON configuration specific to the trigger type';
COMMENT ON COLUMN workflow_steps.action_config IS 'JSON configuration for the action (template variables, etc.)';
COMMENT ON COLUMN workflow_executions.context IS 'Runtime variables accumulated during execution';
