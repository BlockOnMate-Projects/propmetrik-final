-- Migration: 029_floor_plan_audit_log
-- Description: Create audit log table for floor plan changes
-- Created: 2026-01-14
-- Part of Floor Plan Enhancement Phase 1

-- ============================================================================
-- FLOOR PLAN AUDIT LOG TABLE
-- Tracks all changes to floor plan geometry for RICS/IVS compliance
-- ============================================================================

CREATE TABLE IF NOT EXISTS valuation_floor_plan_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- References
  valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
  floor_plan_id UUID REFERENCES valuation_floor_plans(id) ON DELETE SET NULL,
  geometry_version_id UUID REFERENCES valuation_floor_plan_geometry_versions(id) ON DELETE SET NULL,
  design_intent_id UUID, -- Will reference design_intents table
  
  -- Action details
  action VARCHAR(50) NOT NULL,
  -- Possible actions:
  -- 'create_floor_plan', 'update_canvas', 'generate_design_intent',
  -- 'apply_design_intent', 'regenerate_geometry', 'adjust_room',
  -- 'adjust_wall', 'add_room', 'delete_room', 'lock_floor_plan',
  -- 'unlock_floor_plan', 'validate_geometry', 'approve_geometry'
  
  -- Actor information
  actor_id UUID REFERENCES users(id),
  actor_type VARCHAR(20) NOT NULL DEFAULT 'user',
  -- 'user' - human user
  -- 'system' - automated process
  -- 'llm' - AI/LLM action
  -- 'blender' - Blender geometry kernel
  
  -- Change details
  adjustment_deltas JSONB DEFAULT '{}'::jsonb,
  -- For adjustments, stores:
  -- {
  --   "element_id": "uuid",
  --   "element_type": "wall" | "room" | "floor",
  --   "before": { ... },
  --   "after": { ... },
  --   "constraints_applied": []
  -- }
  
  previous_state JSONB DEFAULT '{}'::jsonb, -- Snapshot before change
  new_state JSONB DEFAULT '{}'::jsonb, -- Snapshot after change
  
  -- Justification (required for significant changes)
  justification TEXT,
  
  -- Validation outcome
  validation_passed BOOLEAN,
  validation_errors JSONB DEFAULT '[]'::jsonb,
  
  -- Metadata
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  session_id VARCHAR(100),
  
  -- Duration tracking (for performance monitoring)
  processing_duration_ms INTEGER
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_log_valuation ON valuation_floor_plan_audit_log(valuation_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_floor_plan ON valuation_floor_plan_audit_log(floor_plan_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_geometry_version ON valuation_floor_plan_audit_log(geometry_version_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON valuation_floor_plan_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON valuation_floor_plan_audit_log(actor_id, actor_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON valuation_floor_plan_audit_log(timestamp DESC);

-- Partial index for failed validations (for debugging)
CREATE INDEX IF NOT EXISTS idx_audit_log_validation_failed ON valuation_floor_plan_audit_log(valuation_id, timestamp DESC) 
  WHERE validation_passed = false;

-- Comments
COMMENT ON TABLE valuation_floor_plan_audit_log IS 'Complete audit trail of all floor plan changes for RICS/IVS compliance';
COMMENT ON COLUMN valuation_floor_plan_audit_log.adjustment_deltas IS 'Detailed change information including before/after states';
COMMENT ON COLUMN valuation_floor_plan_audit_log.justification IS 'User-provided explanation for significant geometry changes';
