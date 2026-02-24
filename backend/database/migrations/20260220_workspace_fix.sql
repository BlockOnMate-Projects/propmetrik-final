-- Add 'platform' to entity_type check constraint
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_entity_type_check;
ALTER TABLE workspaces ADD CONSTRAINT workspaces_entity_type_check 
  CHECK (entity_type IN ('project', 'valuation', 'deal', 'property', 'platform'));

-- Fix existing data if needed (none should exist with 'platform' yet because it crashed)
