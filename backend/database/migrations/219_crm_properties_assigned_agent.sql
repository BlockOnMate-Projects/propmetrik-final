-- Add assigned_agent_id to crm_properties for agent-property assignment
ALTER TABLE crm_properties
ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_properties_assigned_agent ON crm_properties(assigned_agent_id) WHERE assigned_agent_id IS NOT NULL;
