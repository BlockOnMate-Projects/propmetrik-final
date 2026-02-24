-- Migration 095: Photo Documentation System
-- Phase 3A Week 3: Site photos with geo-tagging, categorization, and AI tagging support
-- Created: 2026-01-23

-- Photo categories enum
DO $$ BEGIN
    CREATE TYPE photo_category AS ENUM (
        'progress',
        'issue',
        'safety',
        'quality',
        'delivery',
        'inspection',
        'before_after',
        'equipment',
        'materials',
        'weather',
        'milestone',
        'documentation',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Photo status enum
DO $$ BEGIN
    CREATE TYPE photo_status AS ENUM (
        'pending',
        'approved',
        'rejected',
        'archived'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Main site_photos table
CREATE TABLE IF NOT EXISTS site_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    phase_id UUID REFERENCES project_phases(id) ON DELETE SET NULL,
    unit_id UUID REFERENCES project_units(id) ON DELETE SET NULL,
    
    -- Photo metadata
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category photo_category NOT NULL DEFAULT 'progress',
    status photo_status NOT NULL DEFAULT 'pending',
    
    -- File storage
    file_path TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    thumbnail_path TEXT,
    
    -- Geo-tagging
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    altitude DECIMAL(10, 2),
    accuracy DECIMAL(10, 2),
    location_name VARCHAR(255),
    
    -- Device metadata (from EXIF)
    device_make VARCHAR(100),
    device_model VARCHAR(100),
    taken_at TIMESTAMP WITH TIME ZONE,
    exif_data JSONB DEFAULT '{}',
    
    -- AI-generated tags
    ai_tags TEXT[] DEFAULT '{}',
    ai_description TEXT,
    ai_confidence DECIMAL(5, 4),
    
    -- Manual tags and annotations
    manual_tags TEXT[] DEFAULT '{}',
    annotations JSONB DEFAULT '[]',
    
    -- Relationships
    related_rfi_id UUID REFERENCES rfis(id) ON DELETE SET NULL,
    related_punch_id UUID REFERENCES punch_list_items(id) ON DELETE SET NULL,
    related_daily_log_id UUID REFERENCES daily_logs(id) ON DELETE SET NULL,
    related_submittal_id UUID REFERENCES submittals(id) ON DELETE SET NULL,
    
    -- Audit
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    organization_id UUID NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Photo albums for grouping
CREATE TABLE IF NOT EXISTS photo_albums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    
    name VARCHAR(255) NOT NULL,
    description TEXT,
    cover_photo_id UUID REFERENCES site_photos(id) ON DELETE SET NULL,
    
    -- Album settings
    is_public BOOLEAN DEFAULT FALSE,
    is_featured BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    
    -- Metadata
    photo_count INTEGER DEFAULT 0,
    
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    organization_id UUID NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Junction table for photos in albums
CREATE TABLE IF NOT EXISTS photo_album_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id UUID NOT NULL REFERENCES photo_albums(id) ON DELETE CASCADE,
    photo_id UUID NOT NULL REFERENCES site_photos(id) ON DELETE CASCADE,
    sort_order INTEGER DEFAULT 0,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    added_by UUID REFERENCES users(id) ON DELETE SET NULL,
    
    UNIQUE(album_id, photo_id)
);

-- Photo comments/annotations
CREATE TABLE IF NOT EXISTS photo_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    photo_id UUID NOT NULL REFERENCES site_photos(id) ON DELETE CASCADE,
    
    comment TEXT NOT NULL,
    
    -- Optional annotation coordinates (for marking up photos)
    annotation_x DECIMAL(5, 2),
    annotation_y DECIMAL(5, 2),
    annotation_type VARCHAR(50), -- 'pin', 'arrow', 'circle', 'rectangle'
    
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Photo comparison pairs (before/after)
CREATE TABLE IF NOT EXISTS photo_comparisons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    before_photo_id UUID NOT NULL REFERENCES site_photos(id) ON DELETE CASCADE,
    after_photo_id UUID NOT NULL REFERENCES site_photos(id) ON DELETE CASCADE,
    
    comparison_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Photo share links (for external sharing)
CREATE TABLE IF NOT EXISTS photo_share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Can share individual photo or album
    photo_id UUID REFERENCES site_photos(id) ON DELETE CASCADE,
    album_id UUID REFERENCES photo_albums(id) ON DELETE CASCADE,
    
    share_token VARCHAR(64) UNIQUE NOT NULL,
    
    -- Access control
    expires_at TIMESTAMP WITH TIME ZONE,
    password_hash VARCHAR(255),
    max_views INTEGER,
    view_count INTEGER DEFAULT 0,
    allow_download BOOLEAN DEFAULT TRUE,
    
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT photo_or_album CHECK (
        (photo_id IS NOT NULL AND album_id IS NULL) OR
        (photo_id IS NULL AND album_id IS NOT NULL)
    )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_site_photos_project ON site_photos(project_id);
CREATE INDEX IF NOT EXISTS idx_site_photos_phase ON site_photos(phase_id);
CREATE INDEX IF NOT EXISTS idx_site_photos_category ON site_photos(category);
CREATE INDEX IF NOT EXISTS idx_site_photos_status ON site_photos(status);
CREATE INDEX IF NOT EXISTS idx_site_photos_uploaded_by ON site_photos(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_site_photos_taken_at ON site_photos(taken_at);
CREATE INDEX IF NOT EXISTS idx_site_photos_geo ON site_photos(latitude, longitude) WHERE latitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_site_photos_tags ON site_photos USING GIN(manual_tags);
CREATE INDEX IF NOT EXISTS idx_site_photos_ai_tags ON site_photos USING GIN(ai_tags);
CREATE INDEX IF NOT EXISTS idx_site_photos_org ON site_photos(organization_id);
CREATE INDEX IF NOT EXISTS idx_site_photos_deleted ON site_photos(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_photo_albums_project ON photo_albums(project_id);
CREATE INDEX IF NOT EXISTS idx_photo_album_items_album ON photo_album_items(album_id);
CREATE INDEX IF NOT EXISTS idx_photo_album_items_photo ON photo_album_items(photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_comments_photo ON photo_comments(photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_share_links_token ON photo_share_links(share_token);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_photo_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_site_photos_timestamp ON site_photos;
CREATE TRIGGER trg_site_photos_timestamp
    BEFORE UPDATE ON site_photos
    FOR EACH ROW
    EXECUTE FUNCTION update_photo_timestamp();

DROP TRIGGER IF EXISTS trg_photo_albums_timestamp ON photo_albums;
CREATE TRIGGER trg_photo_albums_timestamp
    BEFORE UPDATE ON photo_albums
    FOR EACH ROW
    EXECUTE FUNCTION update_photo_timestamp();

-- Trigger to update album photo count
CREATE OR REPLACE FUNCTION update_album_photo_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE photo_albums SET photo_count = photo_count + 1 WHERE id = NEW.album_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE photo_albums SET photo_count = photo_count - 1 WHERE id = OLD.album_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_album_photo_count ON photo_album_items;
CREATE TRIGGER trg_album_photo_count
    AFTER INSERT OR DELETE ON photo_album_items
    FOR EACH ROW
    EXECUTE FUNCTION update_album_photo_count();

-- View for photo statistics per project
CREATE OR REPLACE VIEW project_photo_stats AS
SELECT 
    project_id,
    COUNT(*) FILTER (WHERE deleted_at IS NULL) as total_photos,
    COUNT(*) FILTER (WHERE category = 'progress' AND deleted_at IS NULL) as progress_photos,
    COUNT(*) FILTER (WHERE category = 'issue' AND deleted_at IS NULL) as issue_photos,
    COUNT(*) FILTER (WHERE category = 'safety' AND deleted_at IS NULL) as safety_photos,
    COUNT(*) FILTER (WHERE category = 'quality' AND deleted_at IS NULL) as quality_photos,
    COUNT(*) FILTER (WHERE category = 'milestone' AND deleted_at IS NULL) as milestone_photos,
    COUNT(*) FILTER (WHERE status = 'pending' AND deleted_at IS NULL) as pending_photos,
    COUNT(*) FILTER (WHERE status = 'approved' AND deleted_at IS NULL) as approved_photos,
    COUNT(*) FILTER (WHERE latitude IS NOT NULL AND deleted_at IS NULL) as geotagged_photos,
    MIN(taken_at) as earliest_photo,
    MAX(taken_at) as latest_photo,
    SUM(file_size) FILTER (WHERE deleted_at IS NULL) as total_size_bytes
FROM site_photos
GROUP BY project_id;

-- View for recent photos with details
CREATE OR REPLACE VIEW recent_photos_view AS
SELECT 
    sp.*,
    p.name as project_name,
    pp.name as phase_name,
    pu.unit_number,
    COALESCE(u.display_name, u.first_name || ' ' || u.last_name) as uploaded_by_name,
    COALESCE(approver.display_name, approver.first_name || ' ' || approver.last_name) as approved_by_name,
    (SELECT COUNT(*) FROM photo_comments pc WHERE pc.photo_id = sp.id) as comment_count,
    (SELECT COUNT(*) FROM photo_album_items pai WHERE pai.photo_id = sp.id) as album_count
FROM site_photos sp
LEFT JOIN development_projects p ON sp.project_id = p.id
LEFT JOIN project_phases pp ON sp.phase_id = pp.id
LEFT JOIN project_units pu ON sp.unit_id = pu.id
LEFT JOIN users u ON sp.uploaded_by = u.id
LEFT JOIN users approver ON sp.approved_by = approver.id
WHERE sp.deleted_at IS NULL
ORDER BY sp.created_at DESC;

-- Function to soft delete photos
CREATE OR REPLACE FUNCTION soft_delete_photo(photo_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE site_photos SET deleted_at = NOW() WHERE id = photo_id AND deleted_at IS NULL;
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to generate unique share token
CREATE OR REPLACE FUNCTION generate_share_token()
RETURNS VARCHAR(64) AS $$
DECLARE
    token VARCHAR(64);
    exists BOOLEAN;
BEGIN
    LOOP
        token := encode(gen_random_bytes(32), 'hex');
        SELECT EXISTS(SELECT 1 FROM photo_share_links WHERE share_token = token) INTO exists;
        IF NOT exists THEN
            RETURN token;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE site_photos IS 'Site photos with geo-tagging, AI tagging, and categorization';
COMMENT ON TABLE photo_albums IS 'Photo albums for organizing site photos';
COMMENT ON TABLE photo_album_items IS 'Junction table for photos in albums';
COMMENT ON TABLE photo_comments IS 'Comments and annotations on photos';
COMMENT ON TABLE photo_comparisons IS 'Before/after photo comparisons';
COMMENT ON TABLE photo_share_links IS 'Share links for external photo/album access';
