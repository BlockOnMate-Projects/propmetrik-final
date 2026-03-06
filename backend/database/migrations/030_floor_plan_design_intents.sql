-- Migration: 030_floor_plan_design_intents
-- Description: Create design intents table for LLM-generated layouts
-- Created: 2026-01-14
-- Part of Floor Plan Enhancement Phase 1

-- ============================================================================
-- DESIGN INTENTS TABLE
-- Stores LLM-generated layout strategies and room programs
-- ============================================================================

CREATE TABLE IF NOT EXISTS valuation_floor_plan_design_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference to valuation
  valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
  
  -- LLM metadata
  llm_model VARCHAR(100) NOT NULL, -- e.g., 'claude-3-opus', 'gpt-4'
  llm_provider VARCHAR(50) NOT NULL DEFAULT 'anthropic', -- 'anthropic', 'openai', 'local'
  llm_request_id VARCHAR(100), -- Provider's request ID for tracing
  llm_version VARCHAR(20) DEFAULT '1.0.0', -- Schema version for design intent
  
  -- Input: Property features used for generation
  input_features JSONB NOT NULL,
  -- Expected structure:
  -- {
  --   "bedrooms": 3,
  --   "bathrooms": 2,
  --   "total_area_sqm": 150,
  --   "property_type": "single_family",
  --   "floors": 1,
  --   "year_built": 2020,
  --   "construction_type": "concrete_block",
  --   "lot_dimensions": { "width_m": 20, "depth_m": 30 },
  --   "user_preferences": { ... }
  -- }
  
  -- Output: Layout strategy
  layout_strategy JSONB NOT NULL,
  -- Expected structure:
  -- {
  --   "template_id": "3BR_COMPACT_COLONIAL",
  --   "style": "colonial",
  --   "circulation_type": "central_corridor",
  --   "primary_orientation": "north",
  --   "entrance_position": "front_center",
  --   "kitchen_style": "galley"
  -- }
  
  -- Output: Room program
  room_program JSONB NOT NULL,
  -- Expected structure:
  -- [
  --   {
  --     "room_type": "living",
  --     "target_area_sqm": 25,
  --     "min_area_sqm": 12,
  --     "importance": "primary",
  --     "adjacency_requirements": ["dining", "entrance"],
  --     "natural_light_required": true
  --   },
  --   ...
  -- ]
  
  -- Output: Design assumptions
  assumptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Expected structure:
  -- [
  --   {
  --     "category": "dimension",
  --     "assumption": "Standard ceiling height",
  --     "default_value": 2.7,
  --     "unit": "m",
  --     "confidence": 0.9,
  --     "source": "Ghana Building Code",
  --     "overridable": true
  --   },
  --   ...
  -- ]
  
  -- Output: Alternative layouts
  alternatives JSONB DEFAULT '[]'::jsonb,
  -- Expected structure:
  -- [
  --   {
  --     "alternative_id": "A",
  --     "name": "Open Plan Layout",
  --     "description": "...",
  --     "layout_strategy": { ... },
  --     "room_program": [ ... ],
  --     "tradeoffs": ["Less privacy", "More natural light"]
  --   }
  -- ]
  
  -- Generation metadata
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  generation_time_ms INTEGER,
  
  -- Lifecycle tracking
  status VARCHAR(20) NOT NULL DEFAULT 'generated',
  -- 'generated' - LLM output received
  -- 'validated' - Passed validation
  -- 'applied' - Applied to create geometry
  -- 'rejected' - User rejected
  -- 'superseded' - Replaced by newer intent
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  
  applied_at TIMESTAMP WITH TIME ZONE,
  applied_geometry_version_id UUID REFERENCES valuation_floor_plan_geometry_versions(id),
  
  rejected_at TIMESTAMP WITH TIME ZONE,
  rejected_by UUID REFERENCES users(id),
  rejection_reason TEXT,
  
  -- Feedback for model improvement
  user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
  user_feedback TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_design_intents_valuation ON valuation_floor_plan_design_intents(valuation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_design_intents_status ON valuation_floor_plan_design_intents(status);
CREATE INDEX IF NOT EXISTS idx_design_intents_model ON valuation_floor_plan_design_intents(llm_model);
CREATE INDEX IF NOT EXISTS idx_design_intents_applied ON valuation_floor_plan_design_intents(applied_geometry_version_id) 
  WHERE applied_geometry_version_id IS NOT NULL;

-- Comments
COMMENT ON TABLE valuation_floor_plan_design_intents IS 'LLM-generated layout strategies and room programs for floor plan auto-generation';
COMMENT ON COLUMN valuation_floor_plan_design_intents.layout_strategy IS 'High-level layout decisions (template, style, circulation)';
COMMENT ON COLUMN valuation_floor_plan_design_intents.room_program IS 'Detailed room specifications with adjacency requirements';
COMMENT ON COLUMN valuation_floor_plan_design_intents.assumptions IS 'Design assumptions surfaced by LLM for transparency';

-- Add foreign key to audit log now that design_intents table exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_audit_log_design_intent') THEN
        ALTER TABLE valuation_floor_plan_audit_log 
        ADD CONSTRAINT fk_audit_log_design_intent 
        FOREIGN KEY (design_intent_id) 
        REFERENCES valuation_floor_plan_design_intents(id) 
        ON DELETE SET NULL;
    END IF;
END $$;
