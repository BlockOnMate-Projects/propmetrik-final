-- Migration: Create marketplace analytics table
-- Date: 2026-02-21
-- Description: Track marketplace analytics including views, clicks, favorites, etc.

CREATE TABLE IF NOT EXISTS marketplace_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Property reference
  property_source VARCHAR(50) NOT NULL, -- 'pm' or 'crm'
  property_id UUID NOT NULL,
  
  -- Event tracking
  event_type VARCHAR(50) NOT NULL, -- 'view', 'click', 'apply', 'inquiry', 'favorite', 'share'
  event_timestamp TIMESTAMPTZ DEFAULT NOW(),
  
  -- User context
  user_id UUID, -- NULL for anonymous
  session_id VARCHAR(255),
  ip_address INET,
  user_agent TEXT,
  
  -- Location context (user's location when viewing)
  user_latitude DECIMAL(10, 8),
  user_longitude DECIMAL(11, 8),
  
  -- Additional metadata
  referrer_url TEXT,
  search_query TEXT, -- What did user search for?
  search_filters JSONB, -- Active filters at time of event
  device_type VARCHAR(50), -- 'mobile', 'tablet', 'desktop'
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for analytics queries
CREATE INDEX idx_marketplace_analytics_property 
ON marketplace_analytics(property_source, property_id, event_timestamp DESC);

CREATE INDEX idx_marketplace_analytics_event 
ON marketplace_analytics(event_type, event_timestamp DESC);

CREATE INDEX idx_marketplace_analytics_session 
ON marketplace_analytics(session_id, event_timestamp);

CREATE INDEX idx_marketplace_analytics_timestamp
ON marketplace_analytics(event_timestamp DESC);

-- Index for user analytics
CREATE INDEX idx_marketplace_analytics_user
ON marketplace_analytics(user_id)
WHERE user_id IS NOT NULL;

-- Add comments
COMMENT ON TABLE marketplace_analytics IS 'Tracks all marketplace user interactions';
COMMENT ON COLUMN marketplace_analytics.property_source IS 'Whether property is from PM or CRM module';
COMMENT ON COLUMN marketplace_analytics.event_type IS 'Type of interaction: view, click, apply, favorite, etc.';
COMMENT ON COLUMN marketplace_analytics.search_filters IS 'JSON of active filters when event occurred';
