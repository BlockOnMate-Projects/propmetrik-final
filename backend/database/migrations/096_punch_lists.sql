-- ============================================================================
-- Migration 096: Punch List Management System
-- Phase 3A Week 4 - Enterprise Construction Punch List with Mobile Support
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- Punch item status lifecycle
DO $$ BEGIN
    CREATE TYPE punch_item_status AS ENUM (
        'open',           -- Newly created, not started
        'in_progress',    -- Work has begun
        'ready_for_review', -- Subcontractor claims complete
        'approved',       -- Owner/PM has verified
        'rejected',       -- Failed inspection, needs rework
        'disputed',       -- Contractor disputes the item
        'closed'          -- Final closure
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Punch item priority
DO $$ BEGIN
    CREATE TYPE punch_priority AS ENUM (
        'critical',       -- Must fix before CO/TCO
        'high',           -- Before substantial completion
        'medium',         -- Before final completion
        'low'             -- Warranty period acceptable
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Punch item type/category
DO $$ BEGIN
    CREATE TYPE punch_item_type AS ENUM (
        'deficiency',        -- Work not meeting spec
        'incomplete',        -- Work not finished
        'damage',            -- Damage requiring repair
        'missing',           -- Missing items
        'cosmetic',          -- Aesthetic issues
        'safety',            -- Safety-related items
        'code_violation',    -- Building code issues
        'design_change',     -- Design modification needed
        'warranty',          -- Warranty-period items
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Punch list type
DO $$ BEGIN
    CREATE TYPE punch_list_type AS ENUM (
        'pre_substantial',   -- Before substantial completion
        'substantial',       -- Substantial completion walkthrough
        'final',             -- Final completion walkthrough
        'warranty',          -- Post-occupancy warranty
        'spot_check',        -- Routine inspection
        'owner_walkthrough', -- Owner-initiated
        'architect_review',  -- A/E review
        'code_inspection'    -- Building inspector items
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Punch Lists (collection of punch items from a walkthrough)
CREATE TABLE IF NOT EXISTS punch_lists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Project linkage (no FK for now, will add when projects table exists)
    project_id UUID NOT NULL,
    
    -- List metadata
    list_number VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    list_type punch_list_type NOT NULL DEFAULT 'substantial',
    
    -- Walkthrough details
    walkthrough_date DATE NOT NULL,
    location_area VARCHAR(255), -- Building, floor, zone
    
    -- Participants
    created_by UUID NOT NULL,
    attendees JSONB DEFAULT '[]', -- Array of {user_id, name, role, company}
    
    -- Assignment
    primary_responsible UUID, -- Main responsible party
    due_date DATE,
    
    -- Statistics (denormalized for performance)
    total_items INTEGER DEFAULT 0,
    open_items INTEGER DEFAULT 0,
    closed_items INTEGER DEFAULT 0,
    
    -- Status
    status VARCHAR(50) DEFAULT 'active', -- active, completed, archived
    completed_at TIMESTAMP,
    
    -- Offline support
    offline_id VARCHAR(100), -- Client-generated ID for offline creation
    sync_status VARCHAR(50) DEFAULT 'synced', -- synced, pending_sync, conflict
    last_synced_at TIMESTAMP,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Punch Items (individual deficiencies/issues)
CREATE TABLE IF NOT EXISTS punch_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    punch_list_id UUID NOT NULL REFERENCES punch_lists(id) ON DELETE CASCADE,
    
    -- Item identification
    item_number INTEGER NOT NULL, -- Sequential within list
    reference_code VARCHAR(50), -- e.g., "101-A-01" (room-area-seq)
    
    -- Description
    title VARCHAR(255) NOT NULL,
    description TEXT,
    item_type punch_item_type NOT NULL DEFAULT 'deficiency',
    priority punch_priority NOT NULL DEFAULT 'medium',
    
    -- Location (detailed)
    location_building VARCHAR(100),
    location_floor VARCHAR(50),
    location_room VARCHAR(100),
    location_description TEXT, -- Free-form location notes
    location_coordinates JSONB, -- {x, y} on floor plan or GPS {lat, lng}
    floor_plan_id UUID, -- Reference to floor plan document
    pin_position JSONB, -- {x: percent, y: percent} on floor plan
    
    -- CSI/Trade assignment
    csi_code VARCHAR(20), -- CSI division code
    trade VARCHAR(100), -- Trade name
    spec_section VARCHAR(50), -- Spec section reference
    
    -- Assignment
    assigned_to UUID, -- Primary responsible person
    assigned_company_id UUID, -- Subcontractor company
    assigned_company_name VARCHAR(255), -- Denormalized for display
    
    -- Scheduling
    due_date DATE,
    scheduled_date DATE, -- When work is scheduled
    estimated_hours DECIMAL(8,2),
    actual_hours DECIMAL(8,2),
    
    -- Cost tracking
    estimated_cost DECIMAL(14,2),
    actual_cost DECIMAL(14,2),
    back_charge BOOLEAN DEFAULT false,
    back_charge_amount DECIMAL(14,2),
    
    -- Status tracking
    status punch_item_status NOT NULL DEFAULT 'open',
    status_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status_changed_by UUID,
    
    -- Verification
    verified_by UUID,
    verified_at TIMESTAMP,
    verification_notes TEXT,
    
    -- Inspection tracking
    inspection_count INTEGER DEFAULT 0,
    last_inspected_at TIMESTAMP,
    last_inspected_by UUID,
    
    -- Related items
    related_rfi_id UUID,
    related_submittal_id UUID,
    related_change_order_id UUID,
    
    -- Tags and notes
    tags TEXT[] DEFAULT '{}',
    internal_notes TEXT, -- PM-only notes
    
    -- Offline support
    offline_id VARCHAR(100),
    sync_status VARCHAR(50) DEFAULT 'synced',
    device_id VARCHAR(100), -- Device that created offline
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    
    UNIQUE(punch_list_id, item_number)
);

-- Punch Item Photos (linked to site_photos when available)
CREATE TABLE IF NOT EXISTS punch_item_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    punch_item_id UUID NOT NULL REFERENCES punch_items(id) ON DELETE CASCADE,
    
    -- Photo reference (can link to site_photos or store directly)
    site_photo_id UUID, -- Link to site_photos table if exists
    
    -- Direct storage (for offline or standalone)
    photo_url VARCHAR(500),
    thumbnail_url VARCHAR(500),
    storage_path VARCHAR(500),
    
    -- Photo metadata
    photo_type VARCHAR(50) NOT NULL DEFAULT 'issue', -- issue, before, after, verification
    caption TEXT,
    taken_at TIMESTAMP,
    taken_by UUID,
    
    -- Device metadata
    device_info JSONB, -- {model, os, app_version}
    geo_location JSONB, -- {lat, lng, accuracy}
    
    -- Annotations
    annotations JSONB DEFAULT '[]', -- Array of {type, coordinates, text, color}
    
    -- Offline support
    offline_id VARCHAR(100),
    local_path VARCHAR(500), -- Path on device before upload
    upload_status VARCHAR(50) DEFAULT 'uploaded', -- pending, uploading, uploaded, failed
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    display_order INTEGER DEFAULT 0
);

-- Punch Item Activity Log
CREATE TABLE IF NOT EXISTS punch_item_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    punch_item_id UUID NOT NULL REFERENCES punch_items(id) ON DELETE CASCADE,
    
    -- Activity details
    activity_type VARCHAR(50) NOT NULL, -- created, status_change, assigned, commented, photo_added, verified, etc.
    description TEXT NOT NULL,
    
    -- Changes (for audit trail)
    previous_value JSONB,
    new_value JSONB,
    
    -- Who and when
    performed_by UUID NOT NULL,
    performed_by_name VARCHAR(255), -- Denormalized
    performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Device info
    device_type VARCHAR(50), -- mobile, web, tablet
    ip_address VARCHAR(50),
    
    -- Offline tracking
    offline_id VARCHAR(100),
    synced_at TIMESTAMP
);

-- Punch Item Comments
CREATE TABLE IF NOT EXISTS punch_item_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    punch_item_id UUID NOT NULL REFERENCES punch_items(id) ON DELETE CASCADE,
    parent_comment_id UUID REFERENCES punch_item_comments(id) ON DELETE CASCADE,
    
    -- Comment content
    comment_text TEXT NOT NULL,
    
    -- Author
    author_id UUID NOT NULL,
    author_name VARCHAR(255),
    author_company VARCHAR(255),
    author_role VARCHAR(100),
    
    -- Mentions
    mentions JSONB DEFAULT '[]', -- Array of {user_id, name}
    
    -- Attachments
    attachments JSONB DEFAULT '[]', -- Array of {filename, url, type, size}
    
    -- Status
    is_internal BOOLEAN DEFAULT false, -- Internal PM notes
    is_edited BOOLEAN DEFAULT false,
    edited_at TIMESTAMP,
    
    -- Offline support
    offline_id VARCHAR(100),
    sync_status VARCHAR(50) DEFAULT 'synced',
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Punch Templates (reusable item templates per trade/area)
CREATE TABLE IF NOT EXISTS punch_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Template identification
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100), -- By trade, area type, or inspection type
    
    -- Template content
    items JSONB NOT NULL DEFAULT '[]', -- Array of template items
    -- Each item: {title, description, type, priority, csi_code, trade, estimated_hours, estimated_cost}
    
    -- Applicability
    applicable_trades TEXT[] DEFAULT '{}',
    applicable_areas TEXT[] DEFAULT '{}', -- bathroom, kitchen, exterior, etc.
    
    -- Organization
    organization_id UUID,
    is_global BOOLEAN DEFAULT false, -- Available to all orgs
    
    -- Usage stats
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP,
    
    -- Audit
    created_by UUID NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(name, organization_id)
);

-- Offline Sync Queue (for handling offline-first operations)
CREATE TABLE IF NOT EXISTS punch_sync_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Operation details
    entity_type VARCHAR(50) NOT NULL, -- punch_list, punch_item, photo, comment
    entity_id VARCHAR(100) NOT NULL, -- Can be UUID or offline_id
    operation VARCHAR(50) NOT NULL, -- create, update, delete
    
    -- Payload
    data JSONB NOT NULL,
    
    -- Device info
    device_id VARCHAR(100) NOT NULL,
    user_id UUID NOT NULL,
    
    -- Sync status
    status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed, conflict
    attempts INTEGER DEFAULT 0,
    last_attempt_at TIMESTAMP,
    error_message TEXT,
    
    -- Conflict resolution
    conflict_data JSONB, -- Server data that conflicts
    resolution VARCHAR(50), -- client_wins, server_wins, merged
    resolved_at TIMESTAMP,
    resolved_by UUID,
    
    -- Timestamps
    queued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Punch List Signatures (for formal sign-offs)
CREATE TABLE IF NOT EXISTS punch_list_signatures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    punch_list_id UUID NOT NULL REFERENCES punch_lists(id) ON DELETE CASCADE,
    
    -- Signatory info
    signer_id UUID NOT NULL,
    signer_name VARCHAR(255) NOT NULL,
    signer_title VARCHAR(100),
    signer_company VARCHAR(255),
    signer_role VARCHAR(50) NOT NULL, -- owner, contractor, architect, cm
    
    -- Signature data
    signature_type VARCHAR(50) NOT NULL, -- electronic, digital, typed
    signature_data TEXT, -- Base64 signature image or certificate ref
    
    -- Sign-off details
    sign_off_type VARCHAR(50) NOT NULL, -- walkthrough_complete, items_accepted, final_approval
    notes TEXT,
    
    -- Verification
    ip_address VARCHAR(50),
    device_info JSONB,
    
    -- Audit
    signed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Punch Lists indexes
CREATE INDEX IF NOT EXISTS idx_punch_lists_project ON punch_lists(project_id);
CREATE INDEX IF NOT EXISTS idx_punch_lists_status ON punch_lists(status);
CREATE INDEX IF NOT EXISTS idx_punch_lists_type ON punch_lists(list_type);
CREATE INDEX IF NOT EXISTS idx_punch_lists_walkthrough_date ON punch_lists(walkthrough_date);
CREATE INDEX IF NOT EXISTS idx_punch_lists_due_date ON punch_lists(due_date);
CREATE INDEX IF NOT EXISTS idx_punch_lists_offline_id ON punch_lists(offline_id) WHERE offline_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_punch_lists_sync_status ON punch_lists(sync_status) WHERE sync_status != 'synced';

-- Punch Items indexes
CREATE INDEX IF NOT EXISTS idx_punch_items_list ON punch_items(punch_list_id);
CREATE INDEX IF NOT EXISTS idx_punch_items_status ON punch_items(status);
CREATE INDEX IF NOT EXISTS idx_punch_items_priority ON punch_items(priority);
CREATE INDEX IF NOT EXISTS idx_punch_items_assigned_to ON punch_items(assigned_to);
CREATE INDEX IF NOT EXISTS idx_punch_items_assigned_company ON punch_items(assigned_company_id);
CREATE INDEX IF NOT EXISTS idx_punch_items_due_date ON punch_items(due_date);
CREATE INDEX IF NOT EXISTS idx_punch_items_type ON punch_items(item_type);
CREATE INDEX IF NOT EXISTS idx_punch_items_trade ON punch_items(trade);
CREATE INDEX IF NOT EXISTS idx_punch_items_csi_code ON punch_items(csi_code);
CREATE INDEX IF NOT EXISTS idx_punch_items_location ON punch_items(location_building, location_floor);
CREATE INDEX IF NOT EXISTS idx_punch_items_offline_id ON punch_items(offline_id) WHERE offline_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_punch_items_sync_status ON punch_items(sync_status) WHERE sync_status != 'synced';
CREATE INDEX IF NOT EXISTS idx_punch_items_tags ON punch_items USING GIN(tags);

-- Photo indexes
CREATE INDEX IF NOT EXISTS idx_punch_item_photos_item ON punch_item_photos(punch_item_id);
CREATE INDEX IF NOT EXISTS idx_punch_item_photos_type ON punch_item_photos(photo_type);
CREATE INDEX IF NOT EXISTS idx_punch_item_photos_upload ON punch_item_photos(upload_status) WHERE upload_status != 'uploaded';

-- Activity indexes
CREATE INDEX IF NOT EXISTS idx_punch_activities_item ON punch_item_activities(punch_item_id);
CREATE INDEX IF NOT EXISTS idx_punch_activities_type ON punch_item_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_punch_activities_date ON punch_item_activities(performed_at);

-- Comment indexes
CREATE INDEX IF NOT EXISTS idx_punch_comments_item ON punch_item_comments(punch_item_id);
CREATE INDEX IF NOT EXISTS idx_punch_comments_author ON punch_item_comments(author_id);

-- Template indexes
CREATE INDEX IF NOT EXISTS idx_punch_templates_category ON punch_templates(category);
CREATE INDEX IF NOT EXISTS idx_punch_templates_org ON punch_templates(organization_id);

-- Sync queue indexes
CREATE INDEX IF NOT EXISTS idx_punch_sync_status ON punch_sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_punch_sync_device ON punch_sync_queue(device_id);
CREATE INDEX IF NOT EXISTS idx_punch_sync_user ON punch_sync_queue(user_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_punch_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DROP TRIGGER IF EXISTS trg_punch_lists_updated ON punch_lists;
CREATE TRIGGER trg_punch_lists_updated
    BEFORE UPDATE ON punch_lists
    FOR EACH ROW EXECUTE FUNCTION update_punch_timestamp();

DROP TRIGGER IF EXISTS trg_punch_items_updated ON punch_items;
CREATE TRIGGER trg_punch_items_updated
    BEFORE UPDATE ON punch_items
    FOR EACH ROW EXECUTE FUNCTION update_punch_timestamp();

DROP TRIGGER IF EXISTS trg_punch_comments_updated ON punch_item_comments;
CREATE TRIGGER trg_punch_comments_updated
    BEFORE UPDATE ON punch_item_comments
    FOR EACH ROW EXECUTE FUNCTION update_punch_timestamp();

-- Update punch list stats when items change
CREATE OR REPLACE FUNCTION update_punch_list_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE punch_lists
    SET 
        total_items = (SELECT COUNT(*) FROM punch_items WHERE punch_list_id = COALESCE(NEW.punch_list_id, OLD.punch_list_id)),
        open_items = (SELECT COUNT(*) FROM punch_items WHERE punch_list_id = COALESCE(NEW.punch_list_id, OLD.punch_list_id) AND status NOT IN ('approved', 'closed')),
        closed_items = (SELECT COUNT(*) FROM punch_items WHERE punch_list_id = COALESCE(NEW.punch_list_id, OLD.punch_list_id) AND status IN ('approved', 'closed')),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = COALESCE(NEW.punch_list_id, OLD.punch_list_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_punch_items_stats ON punch_items;
CREATE TRIGGER trg_punch_items_stats
    AFTER INSERT OR UPDATE OR DELETE ON punch_items
    FOR EACH ROW EXECUTE FUNCTION update_punch_list_stats();

-- Auto-assign item number
CREATE OR REPLACE FUNCTION assign_punch_item_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.item_number IS NULL OR NEW.item_number = 0 THEN
        NEW.item_number := COALESCE(
            (SELECT MAX(item_number) + 1 FROM punch_items WHERE punch_list_id = NEW.punch_list_id),
            1
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_punch_item_number ON punch_items;
CREATE TRIGGER trg_punch_item_number
    BEFORE INSERT ON punch_items
    FOR EACH ROW EXECUTE FUNCTION assign_punch_item_number();

-- Log status changes
CREATE OR REPLACE FUNCTION log_punch_item_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        NEW.status_changed_at := CURRENT_TIMESTAMP;
        
        INSERT INTO punch_item_activities (
            punch_item_id,
            activity_type,
            description,
            previous_value,
            new_value,
            performed_by,
            performed_by_name
        ) VALUES (
            NEW.id,
            'status_change',
            'Status changed from ' || OLD.status::text || ' to ' || NEW.status::text,
            jsonb_build_object('status', OLD.status),
            jsonb_build_object('status', NEW.status),
            COALESCE(NEW.status_changed_by, NEW.created_by),
            NULL -- Will be populated by application
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_punch_status_change ON punch_items;
CREATE TRIGGER trg_punch_status_change
    BEFORE UPDATE ON punch_items
    FOR EACH ROW EXECUTE FUNCTION log_punch_item_status_change();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Project punch list summary
CREATE OR REPLACE VIEW project_punch_summary AS
SELECT 
    pl.project_id,
    COUNT(DISTINCT pl.id) as total_lists,
    COUNT(pi.id) as total_items,
    COUNT(CASE WHEN pi.status = 'open' THEN 1 END) as open_items,
    COUNT(CASE WHEN pi.status = 'in_progress' THEN 1 END) as in_progress_items,
    COUNT(CASE WHEN pi.status = 'ready_for_review' THEN 1 END) as ready_for_review_items,
    COUNT(CASE WHEN pi.status IN ('approved', 'closed') THEN 1 END) as closed_items,
    COUNT(CASE WHEN pi.priority = 'critical' AND pi.status NOT IN ('approved', 'closed') THEN 1 END) as critical_open,
    COUNT(CASE WHEN pi.due_date < CURRENT_DATE AND pi.status NOT IN ('approved', 'closed') THEN 1 END) as overdue_items,
    ROUND(COUNT(CASE WHEN pi.status IN ('approved', 'closed') THEN 1 END)::NUMERIC / NULLIF(COUNT(pi.id), 0) * 100, 1) as completion_rate,
    MIN(CASE WHEN pi.status NOT IN ('approved', 'closed') THEN pi.due_date END) as next_due_date,
    AVG(EXTRACT(EPOCH FROM (pi.status_changed_at - pi.created_at)) / 86400)::NUMERIC(10,1) as avg_resolution_days
FROM punch_lists pl
LEFT JOIN punch_items pi ON pl.id = pi.punch_list_id
GROUP BY pl.project_id;

-- Trade punch summary
CREATE OR REPLACE VIEW trade_punch_summary AS
SELECT 
    pl.project_id,
    pi.trade,
    pi.assigned_company_name,
    COUNT(pi.id) as total_items,
    COUNT(CASE WHEN pi.status NOT IN ('approved', 'closed') THEN 1 END) as open_items,
    COUNT(CASE WHEN pi.status IN ('approved', 'closed') THEN 1 END) as closed_items,
    SUM(COALESCE(pi.back_charge_amount, 0)) as total_back_charges,
    ROUND(COUNT(CASE WHEN pi.status IN ('approved', 'closed') THEN 1 END)::NUMERIC / NULLIF(COUNT(pi.id), 0) * 100, 1) as completion_rate
FROM punch_lists pl
JOIN punch_items pi ON pl.id = pi.punch_list_id
WHERE pi.trade IS NOT NULL
GROUP BY pl.project_id, pi.trade, pi.assigned_company_name;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Get punch list with all items and stats
CREATE OR REPLACE FUNCTION get_punch_list_detail(p_list_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'list', row_to_json(pl.*),
        'items', COALESCE((
            SELECT json_agg(
                json_build_object(
                    'item', row_to_json(pi.*),
                    'photos', (
                        SELECT COALESCE(json_agg(row_to_json(pp.*)), '[]'::json)
                        FROM punch_item_photos pp
                        WHERE pp.punch_item_id = pi.id
                        ORDER BY pp.display_order
                    ),
                    'comment_count', (
                        SELECT COUNT(*) FROM punch_item_comments
                        WHERE punch_item_id = pi.id
                    )
                )
                ORDER BY pi.item_number
            )
            FROM punch_items pi
            WHERE pi.punch_list_id = pl.id
        ), '[]'::json),
        'signatures', COALESCE((
            SELECT json_agg(row_to_json(pls.*))
            FROM punch_list_signatures pls
            WHERE pls.punch_list_id = pl.id
        ), '[]'::json),
        'stats', json_build_object(
            'by_status', (
                SELECT json_object_agg(status, cnt)
                FROM (
                    SELECT status::text, COUNT(*) as cnt
                    FROM punch_items WHERE punch_list_id = pl.id
                    GROUP BY status
                ) s
            ),
            'by_priority', (
                SELECT json_object_agg(priority, cnt)
                FROM (
                    SELECT priority::text, COUNT(*) as cnt
                    FROM punch_items WHERE punch_list_id = pl.id
                    GROUP BY priority
                ) p
            ),
            'by_trade', (
                SELECT json_object_agg(trade, cnt)
                FROM (
                    SELECT COALESCE(trade, 'Unassigned') as trade, COUNT(*) as cnt
                    FROM punch_items WHERE punch_list_id = pl.id
                    GROUP BY trade
                ) t
            )
        )
    ) INTO result
    FROM punch_lists pl
    WHERE pl.id = p_list_id;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Process offline sync
CREATE OR REPLACE FUNCTION process_punch_sync_item(
    p_queue_id UUID
) RETURNS JSON AS $$
DECLARE
    queue_item RECORD;
    result JSON;
    new_id UUID;
BEGIN
    SELECT * INTO queue_item FROM punch_sync_queue WHERE id = p_queue_id;
    
    IF queue_item IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Queue item not found');
    END IF;
    
    -- Update attempt count
    UPDATE punch_sync_queue 
    SET attempts = attempts + 1, last_attempt_at = CURRENT_TIMESTAMP
    WHERE id = p_queue_id;
    
    BEGIN
        CASE queue_item.entity_type
            WHEN 'punch_list' THEN
                CASE queue_item.operation
                    WHEN 'create' THEN
                        INSERT INTO punch_lists 
                        SELECT * FROM jsonb_populate_record(null::punch_lists, queue_item.data)
                        RETURNING id INTO new_id;
                    WHEN 'update' THEN
                        UPDATE punch_lists 
                        SET 
                            title = COALESCE((queue_item.data->>'title'), title),
                            description = COALESCE((queue_item.data->>'description'), description),
                            status = COALESCE((queue_item.data->>'status'), status),
                            sync_status = 'synced',
                            last_synced_at = CURRENT_TIMESTAMP
                        WHERE id = (queue_item.data->>'id')::UUID 
                           OR offline_id = queue_item.entity_id;
                    WHEN 'delete' THEN
                        DELETE FROM punch_lists 
                        WHERE id = (queue_item.data->>'id')::UUID 
                           OR offline_id = queue_item.entity_id;
                END CASE;
                
            WHEN 'punch_item' THEN
                CASE queue_item.operation
                    WHEN 'create' THEN
                        INSERT INTO punch_items 
                        SELECT * FROM jsonb_populate_record(null::punch_items, queue_item.data)
                        RETURNING id INTO new_id;
                    WHEN 'update' THEN
                        UPDATE punch_items 
                        SET 
                            title = COALESCE((queue_item.data->>'title'), title),
                            description = COALESCE((queue_item.data->>'description'), description),
                            status = COALESCE((queue_item.data->>'status')::punch_item_status, status),
                            sync_status = 'synced'
                        WHERE id = (queue_item.data->>'id')::UUID 
                           OR offline_id = queue_item.entity_id;
                    WHEN 'delete' THEN
                        DELETE FROM punch_items 
                        WHERE id = (queue_item.data->>'id')::UUID 
                           OR offline_id = queue_item.entity_id;
                END CASE;
        END CASE;
        
        -- Mark as completed
        UPDATE punch_sync_queue 
        SET status = 'completed', completed_at = CURRENT_TIMESTAMP
        WHERE id = p_queue_id;
        
        RETURN json_build_object(
            'success', true, 
            'entity_id', COALESCE(new_id, (queue_item.data->>'id')::UUID)
        );
        
    EXCEPTION WHEN OTHERS THEN
        UPDATE punch_sync_queue 
        SET status = 'failed', error_message = SQLERRM
        WHERE id = p_queue_id;
        
        RETURN json_build_object('success', false, 'error', SQLERRM);
    END;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SAMPLE DATA (for development/testing)
-- ============================================================================

-- Insert a sample punch template
INSERT INTO punch_templates (id, name, description, category, items, is_global, created_by)
VALUES (
    uuid_generate_v4(),
    'Residential Bathroom Inspection',
    'Standard punch items for bathroom inspections',
    'Bathroom',
    '[
        {"title": "Check tile grout completeness", "type": "incomplete", "priority": "medium", "trade": "Tile"},
        {"title": "Verify fixture installation", "type": "deficiency", "priority": "high", "trade": "Plumbing"},
        {"title": "Check caulking at tub/shower", "type": "cosmetic", "priority": "low", "trade": "Tile"},
        {"title": "Verify exhaust fan operation", "type": "deficiency", "priority": "high", "trade": "HVAC"},
        {"title": "Check cabinet door alignment", "type": "cosmetic", "priority": "low", "trade": "Millwork"},
        {"title": "Verify GFCI outlet function", "type": "safety", "priority": "critical", "trade": "Electrical"}
    ]'::jsonb,
    true,
    '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- GRANTS
-- ============================================================================

-- Grant permissions (adjust role names as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO propmetrik_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO propmetrik_app;

COMMENT ON TABLE punch_lists IS 'Collection of punch items from construction walkthroughs';
COMMENT ON TABLE punch_items IS 'Individual deficiency or incomplete work items';
COMMENT ON TABLE punch_item_photos IS 'Photos attached to punch items with annotation support';
COMMENT ON TABLE punch_sync_queue IS 'Offline sync queue for mobile-first punch list operations';
