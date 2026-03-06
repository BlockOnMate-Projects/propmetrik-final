-- Migration: Create saved searches table for future email alerts
-- Date: 2026-02-21
-- Description: Allow users to save search criteria and receive email alerts for new listings

CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User reference
  user_id UUID, -- NULL for anonymous (using email)
  email VARCHAR(255), -- For anonymous users
  
  -- Search criteria
  search_name VARCHAR(255),
  transaction_type VARCHAR(50), -- 'rental', 'sale', 'all'
  location_query TEXT, -- "Accra" or "East Legon"
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  radius_km DECIMAL(10, 2), -- Search radius
  
  -- Filters
  min_price DECIMAL(15, 2),
  max_price DECIMAL(15, 2),
  bedrooms INTEGER,
  bathrooms INTEGER,
  property_types TEXT[], -- ['apartment', 'house']
  amenities TEXT[], -- ['pool', 'parking']
  
  -- Polygon search (if drawn on map)
  search_polygon GEOMETRY(POLYGON, 4326),
  
  -- Notification preferences
  email_alerts_enabled BOOLEAN DEFAULT TRUE,
  alert_frequency VARCHAR(50) DEFAULT 'daily', -- 'instant', 'daily', 'weekly'
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_alert_sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_saved_searches_user ON saved_searches(user_id);
CREATE INDEX idx_saved_searches_email ON saved_searches(email);
CREATE INDEX idx_saved_searches_alerts 
ON saved_searches(email_alerts_enabled, last_alert_sent_at)
WHERE email_alerts_enabled = TRUE;

-- Spatial index for polygon searches
CREATE INDEX idx_saved_searches_polygon_gist 
ON saved_searches USING GIST(search_polygon)
WHERE search_polygon IS NOT NULL;

-- Add comments
COMMENT ON TABLE saved_searches IS 'User-saved search criteria for email alerts on new listings';
COMMENT ON COLUMN saved_searches.alert_frequency IS 'How often to send email alerts: instant, daily, weekly';
COMMENT ON COLUMN saved_searches.search_polygon IS 'GeoJSON polygon if user drew search area on map';
